'use strict';

/**
 * Client half of the extension API bridge.
 *
 * Installs the Chrome APIs Electron leaves out into an extension context,
 * backed by real implementations in the main process (extension-api-host.js):
 *
 *   chrome.cookies       → Electron's own cookie jar
 *   chrome.webNavigation → Privoo's actual navigation events
 *   chrome.windows       → the single browser window Privoo presents
 *   chrome.permissions   → everything an extension declared is granted here
 *
 * Extension POPUPS and pages, through extension-popup-preload.js, over IPC.
 *
 * Background service workers get the same surface from extension-bg-bridge.js
 * instead: a worker has no preload (Electron accepts
 * registerPreloadScript({ type: 'service-worker' }) and never runs it), so the
 * bridge is written into the extension and talks over a loopback endpoint. The
 * two must expose the SAME namespaces, or an extension behaves differently
 * depending on which of its own contexts it is in.
 *
 * chrome.webRequest is deliberately absent everywhere. Blocking a request needs
 * a synchronous verdict before it is sent, which Electron never offers an
 * extension, so a stub would let a content blocker start up and then block
 * nothing at all — worse than failing loudly.
 */

const CHANNEL = 'privoo-ext-api';
const EVENT_CHANNEL = 'privoo-ext-event';

let ipc = null;
let eventsWired = false;

/** Chrome's APIs take a callback or return a promise; support both. */
function settle(promise, callback) {
  if (typeof callback === 'function') {
    promise.then(
      (v) => { try { callback(v); } catch { /* the extension's problem */ } },
      () => { try { callback(undefined); } catch { /* ditto */ } },
    );
    return undefined;
  }
  return promise;
}

function call(method, args) {
  if (!ipc) return Promise.reject(new Error('Privoo extension bridge unavailable'));
  return ipc.invoke(CHANNEL, { method, args }).then((res) => {
    if (res && res.error) throw new Error(res.error);
    return res ? res.value : undefined;
  });
}

/** Listeners per event name, fed by a single IPC subscription. */
const eventRegistry = new Map();

function wireEvents() {
  if (eventsWired || !ipc) return;
  eventsWired = true;
  ipc.on(EVENT_CHANNEL, (_e, name, payload) => {
    const listeners = eventRegistry.get(name);
    if (!listeners) return;
    for (const fn of [...listeners]) {
      try { fn(payload); } catch { /* one bad listener must not stop the rest */ }
    }
  });
}

/** A chrome.events.Event backed by main-process broadcasts. */
function makeEvent(name) {
  return {
    addListener(fn) {
      if (typeof fn !== 'function') return;
      let set = eventRegistry.get(name);
      if (!set) {
        set = new Set();
        eventRegistry.set(name, set);
        if (ipc) ipc.send(CHANNEL + ':subscribe', name);
      }
      set.add(fn);
    },
    removeListener(fn) {
      const set = eventRegistry.get(name);
      if (set) set.delete(fn);
    },
    hasListener(fn) {
      const set = eventRegistry.get(name);
      return !!set && set.has(fn);
    },
    hasListeners() {
      const set = eventRegistry.get(name);
      return !!set && set.size > 0;
    },
  };
}

/** chrome.windows takes (info, cb) in some calls and just (cb) in others. */
function cbOf(a, b) {
  return typeof a === 'function' ? a : b;
}

/**
 * Add the missing namespaces to `scope.chrome`. Returns true once applied.
 * Never replaces a namespace Electron already provides, and never installs
 * anything when there is no bridge to back it.
 */
function installApis(scope, ipcRenderer) {
  ipc = ipcRenderer || ipc;
  const g = scope || globalThis;
  const chrome = g && g.chrome;

  // Only extension contexts get this — an ordinary page has no chrome.runtime
  // and must be left completely alone.
  if (!chrome || !chrome.runtime) return false;
  if (chrome.__privooApiShim) return true;
  // Nothing real behind the APIs without a bridge, and a hollow API is worse
  // than an absent one.
  if (!ipc) return false;

  wireEvents();

  if (!chrome.cookies) {
    chrome.cookies = {
      get(details, cb) { return settle(call('cookies.get', [details]), cb); },
      getAll(details, cb) { return settle(call('cookies.getAll', [details]), cb); },
      set(details, cb) { return settle(call('cookies.set', [details]), cb); },
      remove(details, cb) { return settle(call('cookies.remove', [details]), cb); },
      getAllCookieStores(cb) { return settle(call('cookies.getAllCookieStores', []), cb); },
      onChanged: makeEvent('cookies.onChanged'),
    };
  }

  if (!chrome.webNavigation) {
    chrome.webNavigation = {
      getFrame(details, cb) { return settle(call('webNavigation.getFrame', [details]), cb); },
      getAllFrames(details, cb) { return settle(call('webNavigation.getAllFrames', [details]), cb); },
      onBeforeNavigate: makeEvent('webNavigation.onBeforeNavigate'),
      onCommitted: makeEvent('webNavigation.onCommitted'),
      onDOMContentLoaded: makeEvent('webNavigation.onDOMContentLoaded'),
      onCompleted: makeEvent('webNavigation.onCompleted'),
      onErrorOccurred: makeEvent('webNavigation.onErrorOccurred'),
      onCreatedNavigationTarget: makeEvent('webNavigation.onCreatedNavigationTarget'),
      onReferenceFragmentUpdated: makeEvent('webNavigation.onReferenceFragmentUpdated'),
      onHistoryStateUpdated: makeEvent('webNavigation.onHistoryStateUpdated'),
    };
  }

  if (!chrome.permissions) {
    chrome.permissions = {
      getAll(cb) { return settle(Promise.resolve({ permissions: [], origins: [] }), cb); },
      contains(_p, cb) { return settle(Promise.resolve(true), cb); },
      request(_p, cb) { return settle(Promise.resolve(true), cb); },
      remove(_p, cb) { return settle(Promise.resolve(false), cb); },
      onAdded: makeEvent('permissions.onAdded'),
      onRemoved: makeEvent('permissions.onRemoved'),
    };
  }

  if (!chrome.windows) {
    chrome.windows = {
      WINDOW_ID_CURRENT: -2,
      WINDOW_ID_NONE: -1,
      get(_id, a, b) { return settle(call('windows.get', []), cbOf(a, b)); },
      getCurrent(a, b) { return settle(call('windows.get', []), cbOf(a, b)); },
      getLastFocused(a, b) { return settle(call('windows.get', []), cbOf(a, b)); },
      getAll(a, b) { return settle(call('windows.getAll', []), cbOf(a, b)); },
      onCreated: makeEvent('windows.onCreated'),
      onRemoved: makeEvent('windows.onRemoved'),
      onFocusChanged: makeEvent('windows.onFocusChanged'),
      onBoundsChanged: makeEvent('windows.onBoundsChanged'),
    };
  }

  if (!chrome.contextMenus) {
    chrome.contextMenus = {
      create(props, cb) {
        const id = (props && props.id) || ('privoo_' + Math.random().toString(36).slice(2, 9));
        call('contextMenus.create', [{ ...props, id }]).catch(() => {});
        if (typeof cb === 'function') { try { cb(); } catch { /* extension's problem */ } }
        return id;
      },
      update(id, props, cb) { return settle(call('contextMenus.update', [id, props]), cb); },
      remove(id, cb) { return settle(call('contextMenus.remove', [id]), cb); },
      removeAll(cb) { return settle(call('contextMenus.removeAll', []), cb); },
      onClicked: makeEvent('contextMenus.onClicked'),
    };
  }

  if (!chrome.notifications) {
    chrome.notifications = {
      create(a, b, c) {
        const id = (typeof a === 'string') ? a : ('privoo_' + Math.random().toString(36).slice(2, 9));
        const opts = (typeof a === 'string') ? b : a;
        const cb = (typeof a === 'string') ? c : b;
        return settle(call('notifications.create', [id, opts]).then(() => id), cb);
      },
      clear(id, cb) { return settle(call('notifications.clear', [id]), cb); },
      getAll(cb) { return settle(call('notifications.getAll', []), cb); },
      update(_id, _opts, cb) { return settle(Promise.resolve(false), cb); },
      onClicked: makeEvent('notifications.onClicked'),
      onClosed: makeEvent('notifications.onClosed'),
      onButtonClicked: makeEvent('notifications.onButtonClicked'),
    };
  }

  if (!chrome.idle) {
    chrome.idle = {
      queryState(secs, cb) { return settle(call('idle.queryState', [secs]), cb); },
      getAutoLockDelay(cb) { return settle(Promise.resolve(0), cb); },
      setDetectionInterval() {},
      onStateChanged: makeEvent('idle.onStateChanged'),
    };
  }

  if (!chrome.commands) {
    chrome.commands = {
      getAll(cb) { return settle(call('commands.getAll', [String((g.location && g.location.href) || '')]), cb); },
      reset(_name, cb) { return settle(Promise.resolve(undefined), cb); },
      update(_d, cb) { return settle(Promise.resolve(undefined), cb); },
      onCommand: makeEvent('commands.onCommand'),
    };
  }

  // Extensions written against the WebExtension spec read `browser`, and many
  // do `self.browser || self.chrome`. If the runtime already provides its own
  // `browser`, adding namespaces only to `chrome` would leave the object the
  // extension actually reads untouched.
  if (typeof g.browser === 'undefined') {
    try { g.browser = chrome; } catch { /* frozen global */ }
  } else if (g.browser !== chrome) {
    for (const n of ['cookies', 'webNavigation', 'permissions', 'windows',
                     'contextMenus', 'notifications', 'idle', 'commands']) {
      if (!g.browser[n] && chrome[n]) {
        try { g.browser[n] = chrome[n]; } catch { /* frozen */ }
      }
    }
  }

  chrome.__privooApiShim = true;
  return true;
}

module.exports = { installApis };
