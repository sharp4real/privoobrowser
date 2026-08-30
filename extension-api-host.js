'use strict';

/**
 * Main-process implementations for the extension APIs Electron leaves out.
 *
 * Paired with extension-api-client.js, which exposes these inside an extension's
 * popup and pages. Everything here is backed by something real:
 *
 *   chrome.cookies        → Electron's own cookie jar (session.cookies)
 *   chrome.webNavigation  → Privoo's actual navigation events
 *   chrome.windows        → the single browser window Privoo presents
 *
 * chrome.webRequest is NOT here on purpose. Blocking a request requires a
 * synchronous verdict before it is sent, which Electron does not offer to an
 * extension at all. A stub would let a content blocker start and then silently
 * block nothing, so extension-compat-check.js warns the user instead.
 */

const { ipcMain, session, webContents } = require('electron');

const CHANNEL = 'privoo-ext-api';
const EVENT_CHANNEL = 'privoo-ext-event';

/** Which service workers asked for which events. Keyed by event name. */
const subscribers = new Map();

function subscribe(name, wc) {
  let set = subscribers.get(name);
  if (!set) { set = new Set(); subscribers.set(name, set); }
  set.add(wc.id);
}

function emit(name, payload) {
  const set = subscribers.get(name);
  if (set && set.size) {
    for (const id of [...set]) {
      const wc = webContents.fromId(id);
      if (!wc || wc.isDestroyed()) { set.delete(id); continue; }
      try { wc.send(EVENT_CHANNEL, name, payload); } catch { set.delete(id); }
    }
  }
  queueForBackground(name, payload);
}

// ── Background (service worker) transport ──────────────────────────────────
// A worker has no preload and therefore no ipcRenderer, so it polls instead.
// Events are appended to a single ring and each poller tracks its own cursor,
// which keeps a worker that restarts from losing its place entirely.
const MAX_QUEUE = 500;
let eventSeq = 0;
const eventRing = [];
const bgSubscribed = new Set();
let waiters = [];

function queueForBackground(name, payload) {
  if (!bgSubscribed.has(name)) return;
  eventRing.push({ seq: ++eventSeq, name, payload });
  if (eventRing.length > MAX_QUEUE) eventRing.splice(0, eventRing.length - MAX_QUEUE);
  const pending = waiters;
  waiters = [];
  for (const w of pending) {
    try { w(); } catch { /* the poller went away */ }
  }
}

function eventsSince(since) {
  const events = eventRing.filter((e) => e.seq > since);
  return { cursor: eventSeq, events: events.map((e) => ({ name: e.name, payload: e.payload })) };
}

/** Resolve once there is something newer than `since`, or after a timeout. */
function waitForEvents(since, timeoutMs) {
  if (eventSeq > since) return Promise.resolve(eventsSince(since));
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(eventsSince(since));
    };
    const timer = setTimeout(finish, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    waiters.push(finish);
  });
}

// ── chrome.cookies ─────────────────────────────────────────────────────────
// Electron's cookie objects are nearly Chrome's shape already; the differences
// are the ones below, and getting them wrong makes extensions misbehave subtly.
function toChromeCookie(c) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    hostOnly: !String(c.domain || '').startsWith('.'),
    path: c.path,
    secure: !!c.secure,
    httpOnly: !!c.httpOnly,
    sameSite: c.sameSite === 'no_restriction' ? 'no_restriction'
      : c.sameSite === 'lax' ? 'lax'
      : c.sameSite === 'strict' ? 'strict'
      : 'unspecified',
    session: c.session !== false && c.expirationDate === undefined,
    expirationDate: c.expirationDate,
    storeId: '0',
  };
}

function cookieUrl(c) {
  const domain = String(c.domain || '').replace(/^\./, '');
  return (c.secure ? 'https://' : 'http://') + domain + (c.path || '/');
}

async function cookiesGetAll(sess, details = {}) {
  const filter = {};
  if (details.url) filter.url = details.url;
  if (details.name) filter.name = details.name;
  if (details.domain) filter.domain = details.domain;
  if (details.path) filter.path = details.path;
  if (typeof details.secure === 'boolean') filter.secure = details.secure;
  if (typeof details.session === 'boolean') filter.session = details.session;
  const list = await sess.cookies.get(filter);
  return list.map(toChromeCookie);
}

// ── chrome.webNavigation ───────────────────────────────────────────────────
// Frame ids: Chrome uses 0 for the main frame. Privoo's tabs are <webview>
// guests, so the guest's webContents id is the tab id, matching what the rest
// of the extension bridge already uses.
function navDetails(wc, url, extra = {}) {
  return {
    tabId: wc.id,
    url: url || '',
    processId: 0,
    frameId: 0,
    parentFrameId: -1,
    timeStamp: Date.now(),
    ...extra,
  };
}

function isGuest(wc) {
  try { return wc.getType() === 'webview'; } catch { return false; }
}

/** Wire one guest's navigation events through to any subscribed extension. */
function watchNavigation(wc) {
  if (!isGuest(wc) || wc.__privooNavWatched) return;
  wc.__privooNavWatched = true;

  wc.on('did-start-navigation', (_e, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    if (isInPlace) {
      // Same-document: Chrome reports these as history/fragment updates, not
      // as a fresh navigation, and extensions branch on the difference.
      emit('webNavigation.onHistoryStateUpdated', navDetails(wc, url, { transitionType: 'link', transitionQualifiers: [] }));
      return;
    }
    emit('webNavigation.onBeforeNavigate', navDetails(wc, url, { parentFrameId: -1 }));
  });

  wc.on('did-navigate', (_e, url) => {
    emit('webNavigation.onCommitted', navDetails(wc, url, { transitionType: 'link', transitionQualifiers: [] }));
  });

  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
    if (!isMainFrame) return;
    emit('webNavigation.onReferenceFragmentUpdated', navDetails(wc, url, { transitionType: 'link', transitionQualifiers: [] }));
  });

  wc.on('dom-ready', () => {
    emit('webNavigation.onDOMContentLoaded', navDetails(wc, safeUrl(wc)));
  });

  wc.on('did-finish-load', () => {
    emit('webNavigation.onCompleted', navDetails(wc, safeUrl(wc)));
  });

  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    // -3 is ABORTED, which fires on every ordinary user-cancelled navigation.
    if (errorCode === -3) return;
    emit('webNavigation.onErrorOccurred', navDetails(wc, validatedURL, { error: errorDescription || String(errorCode) }));
  });
}

function safeUrl(wc) {
  try { return wc.getURL() || ''; } catch { return ''; }
}

// ── Dispatch ───────────────────────────────────────────────────────────────
function makeHandlers(getWindowInfo) {
  const sess = () => session.defaultSession;

  return {
    'cookies.get': async ([details = {}]) => {
      const list = await cookiesGetAll(sess(), { url: details.url, name: details.name });
      return list[0] || null;
    },
    'cookies.getAll': ([details = {}]) => cookiesGetAll(sess(), details),
    'cookies.set': async ([details = {}]) => {
      await sess().cookies.set({
        url: details.url,
        name: details.name,
        value: details.value,
        domain: details.domain,
        path: details.path,
        secure: details.secure,
        httpOnly: details.httpOnly,
        expirationDate: details.expirationDate,
        sameSite: details.sameSite === 'no_restriction' ? 'no_restriction'
          : details.sameSite === 'strict' ? 'strict'
          : details.sameSite === 'lax' ? 'lax' : 'unspecified',
      });
      const after = await cookiesGetAll(sess(), { url: details.url, name: details.name });
      return after[0] || null;
    },
    'cookies.remove': async ([details = {}]) => {
      await sess().cookies.remove(details.url, details.name);
      return { url: details.url, name: details.name, storeId: '0' };
    },
    'cookies.getAllCookieStores': () => [{ id: '0', tabIds: [] }],

    'webNavigation.getFrame': ([details = {}]) => {
      const wc = webContents.fromId(details.tabId);
      if (!wc || wc.isDestroyed()) return null;
      return { url: safeUrl(wc), parentFrameId: -1, errorOccurred: false };
    },
    'webNavigation.getAllFrames': ([details = {}]) => {
      const wc = webContents.fromId(details.tabId);
      if (!wc || wc.isDestroyed()) return null;
      return [{ frameId: 0, parentFrameId: -1, url: safeUrl(wc), errorOccurred: false, processId: 0 }];
    },

    'windows.get': () => getWindowInfo(),
    'windows.getAll': () => [getWindowInfo()],

    // A background worker announces its interest here; the ring only keeps
    // events something is actually listening for.
    'events.subscribe': ([name]) => { if (typeof name === 'string') bgSubscribed.add(name); return true; },

    // Logged rather than silent: when a background worker fails to register it
    // cannot be inspected, and this is the only evidence the bridge ran at all.
    'bridge.hello': ([url]) => {
      console.log('Privoo: extension bridge is live in', String(url || 'a background worker'));
      return true;
    },

    'contextMenus.create': ([props]) => { menus.set(props.id, props); return props.id; },
    'contextMenus.update': ([id, props]) => {
      const existing = menus.get(id);
      if (existing) menus.set(id, { ...existing, ...props });
      return true;
    },
    'contextMenus.remove': ([id]) => { menus.delete(id); return true; },
    'contextMenus.removeAll': () => { menus.clear(); return true; },

    'notifications.create': ([id, opts = {}]) => {
      try {
        const { Notification } = require('electron');
        if (!Notification.isSupported()) return id;
        const n = new Notification({
          title: String(opts.title || ''),
          body: String(opts.message || ''),
          silent: !!opts.silent,
        });
        n.on('click', () => emit('notifications.onClicked', id));
        n.on('close', () => emit('notifications.onClosed', id, true));
        n.show();
        notifications.set(id, opts);
      } catch { /* platform without notifications */ }
      return id;
    },
    'notifications.clear': ([id]) => notifications.delete(id),
    'notifications.getAll': () => {
      const out = {};
      for (const id of notifications.keys()) out[id] = true;
      return out;
    },

    // Read straight from the asking extension's manifest — that is where the
    // command list is defined, so there is nothing to invent.
    'commands.getAll': ([extensionUrl]) => {
      const commands = manifestCommands(extensionUrl);
      return commands;
    },

    'idle.queryState': ([secs]) => {
      try {
        const { powerMonitor } = require('electron');
        return powerMonitor.getSystemIdleState(Math.max(15, Number(secs) || 60));
      } catch { return 'active'; }
    },
  };
}

/**
 * The commands an extension declared, read from its own manifest. Keyed by the
 * chrome-extension:// origin the request came from.
 */
const manifestsByOrigin = new Map();

function registerExtensionManifest(origin, manifest) {
  if (origin && manifest) manifestsByOrigin.set(origin, manifest);
}

function manifestCommands(extensionUrl) {
  let origin = '';
  try { origin = new URL(String(extensionUrl || '')).origin; } catch { /* not a URL */ }
  const manifest = manifestsByOrigin.get(origin);
  const declared = (manifest && manifest.commands) || {};
  return Object.keys(declared).map((name) => ({
    name,
    description: declared[name].description || '',
    shortcut: (declared[name].suggested_key && (declared[name].suggested_key.default
      || declared[name].suggested_key.windows)) || '',
  }));
}

/** Extension-declared context-menu items, by id. */
const menus = new Map();
/** Notifications an extension is still tracking, by id. */
const notifications = new Map();

/** The menu items extensions have registered, for Privoo's own context menu. */
function extensionMenuItems() {
  return [...menus.values()];
}

/** Called when the user picks an extension's context-menu item. */
function fireMenuClick(id, info) {
  emit('contextMenus.onClicked', { menuItemId: id, ...info });
}

/**
 * Install the bridge. `getWindowInfo` returns the single window object Privoo
 * presents to extensions, so this module does not need to know how Privoo
 * models its windows.
 */
let dispatch = null;

/**
 * Run one API call. Used by both transports: IPC for popups and pages, fetch
 * over privoo://ext-api/ for background workers.
 */
async function handleCall(method, args) {
  if (!dispatch) return { error: 'bridge not installed' };
  const fn = dispatch[method];
  if (!fn) return { error: 'Unsupported: ' + method };
  try {
    return { value: await fn(Array.isArray(args) ? args : []) };
  } catch (err) {
    return { error: (err && err.message) || 'failed' };
  }
}

let server = null;
let serverPort = 0;

/**
 * Loopback endpoint for background workers. Returns the port it bound to.
 * Only 127.0.0.1 is listened on, and every request is checked against the
 * session token before anything is dispatched.
 */
function startServer(token) {
  if (server) return Promise.resolve(serverPort);
  const http = require('http');
  return new Promise((resolve) => {
    server = http.createServer(async (req, res) => {
      const send = (body, status = 200) => {
        res.writeHead(status, {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        });
        res.end(JSON.stringify(body));
      };
      if (req.method === 'OPTIONS') { send({}, 204); return; }

      let url;
      try { url = new URL(req.url, 'http://127.0.0.1'); }
      catch { send({ error: 'bad request' }, 400); return; }

      if (url.pathname === '/events') {
        if (url.searchParams.get('token') !== token) { send({ error: 'forbidden' }, 403); return; }
        const since = Number(url.searchParams.get('since') || 0) || 0;
        send(await waitForEvents(since, 25000));
        return;
      }

      if (url.pathname === '/call' && req.method === 'POST') {
        let raw = '';
        req.on('data', (c) => { raw += c; if (raw.length > 2e6) req.destroy(); });
        req.on('end', async () => {
          let body = null;
          try { body = JSON.parse(raw); } catch { send({ error: 'bad request' }, 400); return; }
          if (!body || body.token !== token) { send({ error: 'forbidden' }, 403); return; }
          send(await handleCall(body.method, body.args));
        });
        return;
      }

      send({ error: 'not found' }, 404);
    });
    server.on('error', () => resolve(0));
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve(serverPort);
    });
  });
}

function install({ getWindowInfo }) {
  const handlers = makeHandlers(getWindowInfo || (() => ({
    id: 1, focused: true, incognito: false, alwaysOnTop: false,
    type: 'normal', state: 'normal', top: 0, left: 0, width: 0, height: 0,
  })));

  dispatch = handlers;
  ipcMain.handle(CHANNEL, (_e, req) => handleCall(req && req.method, req && req.args));

  ipcMain.on(CHANNEL + ':subscribe', (e, name) => {
    if (typeof name === 'string') subscribe(name, e.sender);
  });

  // Cookie changes come from the session, not from any one page.
  try {
    session.defaultSession.cookies.on('changed', (_e, cookie, cause, removed) => {
      emit('cookies.onChanged', {
        cookie: toChromeCookie(cookie),
        cause: cause === 'explicit' ? 'explicit'
          : cause === 'overwrite' ? 'overwrite'
          : cause === 'expired' ? 'expired'
          : cause === 'evicted' ? 'evicted'
          : cause === 'expired-overwrite' ? 'expired_overwrite' : 'explicit',
        removed: !!removed,
      });
    });
  } catch { /* older Electron without the event */ }

  return { emit, watchNavigation, toChromeCookie, cookieUrl };
}

module.exports = {
  install, emit, watchNavigation, toChromeCookie, cookieUrl, navDetails,
  eventsSince, waitForEvents, extensionMenuItems, fireMenuClick, handleCall,
  registerExtensionManifest, startServer,
};
