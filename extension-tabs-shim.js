'use strict';

/**
 * chrome.tabs / chrome.windows / chrome.permissions shim for extension pages.
 *
 * THE PROBLEM
 * -----------
 * Privoo's tabs are <webview> guests inside one BrowserWindow, and an extension
 * popup is its own BrowserWindow. Electron therefore answers
 *
 *     chrome.tabs.query({ active: true, currentWindow: true })
 *
 * with the POPUP'S OWN PAGE — `chrome-extension://<id>/popup.html` — because
 * that really is the only "tab" in the popup's window.
 *
 * Almost every popup starts by asking that exact question to find out which
 * site it is looking at. Getting itself back means it has no host, no per-site
 * state and nothing to render, which is why popups came up blank.
 *
 * THE FIX
 * -------
 * The popup's preload gets a snapshot of Privoo's real tabs and calls
 * installTabsShim() before any extension script runs.
 *
 * This is applied as ORDINARY CODE, never by evaluating a string: extension
 * pages ship a `script-src 'self'` CSP, so eval() and new Function() throw
 * ("'unsafe-eval' is not an allowed source of script") and the shim silently
 * did nothing.
 *
 * Tab ids are the real `webContents.id` values Electron itself uses, so
 * everything NOT shimmed here — chrome.tabs.sendMessage, chrome.scripting,
 * chrome.action's per-tab state — keeps working against the same ids.
 *
 * The snapshot is taken when the popup opens. That suits popups, which are
 * short-lived and read their state once; it is not a live tab feed.
 */

const WINDOW_ID_CURRENT = -2;
const WINDOW_ID_NONE = -1;

/** Chrome match pattern (or plain string) → RegExp. */
function patternToRe(pattern) {
  const p = String(pattern);
  // <all_urls> and the bare wildcards match anything.
  if (p === '<all_urls>' || p === '*' || p === '*://*/*') return /^/;
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + escaped + '$');
}

function anyMatch(value, patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.some((p) => {
    try { return patternToRe(p).test(String(value || '')); } catch { return false; }
  });
}

function tabMatches(tab, q, windowId) {
  if (!q || typeof q !== 'object') return true;
  if (q.active !== undefined && tab.active !== q.active) return false;
  if (q.highlighted !== undefined && tab.highlighted !== q.highlighted) return false;
  if (q.pinned !== undefined && tab.pinned !== q.pinned) return false;
  if (q.audible !== undefined && tab.audible !== q.audible) return false;
  if (q.muted !== undefined && !!(tab.mutedInfo && tab.mutedInfo.muted) !== q.muted) return false;
  if (q.status && tab.status !== q.status) return false;
  if (q.index !== undefined && tab.index !== q.index) return false;
  // Privoo is a single browser window as far as extensions are concerned, so
  // "current" and "last focused" both mean that one window.
  if (q.currentWindow === true && tab.windowId !== windowId) return false;
  if (q.lastFocusedWindow === true && tab.windowId !== windowId) return false;
  if (q.windowId !== undefined && q.windowId !== WINDOW_ID_CURRENT && tab.windowId !== q.windowId) return false;
  if (q.url && !anyMatch(tab.url, q.url)) return false;
  if (q.title && !anyMatch(tab.title, q.title)) return false;
  return true;
}

/** Chrome's extension APIs take either a callback or return a promise. */
function answer(value, callback) {
  if (typeof callback === 'function') {
    setTimeout(() => { try { callback(value); } catch { /* the extension's problem */ } }, 0);
    return undefined;
  }
  return Promise.resolve(value);
}

function noopEvent() {
  return { addListener() {}, removeListener() {}, hasListener() { return false; } };
}

/** Some chrome.windows methods take (info, cb), some just (cb). */
function winArgs(a, b) {
  return (typeof a === 'function') ? { info: null, cb: a } : { info: a, cb: b };
}

/**
 * Patch `scope.chrome` in place. Returns true once applied — callers retry
 * while it returns false, because the extension bindings are not always
 * installed on the very first tick of a preload.
 */
function applyTabsShim(scope, tabs, windowId) {
  const c = scope && scope.chrome;
  if (!c || !c.tabs || typeof c.tabs.query !== 'function') return false;
  if (c.__privooShimmed) return true;

  const originalQuery = c.tabs.query.bind(c.tabs);
  const originalGet = typeof c.tabs.get === 'function' ? c.tabs.get.bind(c.tabs) : null;

  c.tabs.query = function (queryInfo, callback) {
    let out;
    try { out = tabs.filter((t) => tabMatches(t, queryInfo, windowId)); }
    catch { out = []; }
    // Nothing matched anything we know about — let Electron have a go rather
    // than insisting the answer is "no tabs".
    if (!out.length) {
      try { return originalQuery(queryInfo, callback); } catch { /* fall through */ }
    }
    return answer(out, callback);
  };

  c.tabs.get = function (tabId, callback) {
    const found = tabs.find((t) => t.id === tabId);
    if (found) return answer(found, callback);
    if (originalGet) { try { return originalGet(tabId, callback); } catch { /* fall through */ } }
    return answer(undefined, callback);
  };

  // In Chrome this is undefined for a popup (a popup is not a tab), and
  // extensions branch on that.
  c.tabs.getCurrent = function (callback) { return answer(undefined, callback); };

  // chrome.windows is not implemented in this Electron build at all, and a
  // popup that touches it throws before rendering anything.
  const windowInfo = (populate) => ({
    id: windowId,
    focused: true,
    incognito: false,
    alwaysOnTop: false,
    type: 'normal',
    state: 'normal',
    top: 0, left: 0, width: 0, height: 0,
    tabs: populate ? tabs : undefined,
  });
  if (!c.windows) c.windows = {};
  c.windows.WINDOW_ID_CURRENT = WINDOW_ID_CURRENT;
  c.windows.WINDOW_ID_NONE = WINDOW_ID_NONE;
  c.windows.getCurrent = function (a, b) {
    const { info, cb } = winArgs(a, b);
    return answer(windowInfo(!!(info && info.populate)), cb);
  };
  c.windows.getLastFocused = c.windows.getCurrent;
  c.windows.get = function (_id, a, b) {
    const { info, cb } = winArgs(a, b);
    return answer(windowInfo(!!(info && info.populate)), cb);
  };
  c.windows.getAll = function (a, b) {
    const { info, cb } = winArgs(a, b);
    return answer([windowInfo(!!(info && info.populate))], cb);
  };
  if (typeof c.windows.onFocusChanged !== 'object') {
    c.windows.onFocusChanged = noopEvent();
    c.windows.onCreated = noopEvent();
    c.windows.onRemoved = noopEvent();
  }

  // chrome.permissions is missing too, and reading .onAdded / .onRemoved off an
  // undefined object throws at import time — enough to stop an extension dead
  // before it renders. Everything an extension declared in its manifest is
  // already granted here, so "contains" is true and "request" succeeds.
  if (!c.permissions) {
    c.permissions = {
      getAll(cb) { return answer({ permissions: [], origins: [] }, cb); },
      contains(_p, cb) { return answer(true, cb); },
      request(_p, cb) { return answer(true, cb); },
      remove(_p, cb) { return answer(false, cb); },
      onAdded: noopEvent(),
      onRemoved: noopEvent(),
    };
  }

  // Extensions written against the WebExtension spec use `browser`.
  if (typeof scope.browser === 'undefined') {
    try { scope.browser = c; } catch { /* frozen global */ }
  }

  c.__privooShimmed = true;
  return true;
}

/**
 * Apply the shim, retrying briefly if the extension bindings are not up yet.
 * Returns { applied, attempts } for the first attempt; later retries happen in
 * the background, always well before the page's own DOMContentLoaded work.
 */
function installTabsShim(scope, tabs, windowId) {
  if (!Array.isArray(tabs) || !tabs.length) return { applied: false, reason: 'no tabs' };
  const id = windowId || 1;

  if (applyTabsShim(scope, tabs, id)) return { applied: true, reason: 'immediate' };

  let tries = 0;
  const timer = setInterval(() => {
    if (applyTabsShim(scope, tabs, id) || ++tries > 200) clearInterval(timer);
  }, 5);
  const retry = () => applyTabsShim(scope, tabs, id);
  try {
    scope.document.addEventListener('readystatechange', retry, true);
    scope.document.addEventListener('DOMContentLoaded', retry, true);
  } catch { /* no document yet */ }
  return { applied: false, reason: 'deferred' };
}

module.exports = { installTabsShim, applyTabsShim, patternToRe, tabMatches };
