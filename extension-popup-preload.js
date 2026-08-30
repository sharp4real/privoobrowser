'use strict';

/**
 * Preload for extension popup windows.
 *
 * Runs in the popup page's own world (the window is created with
 * contextIsolation disabled precisely so this can reach `chrome`), before any
 * of the extension's scripts, and installs the tabs/windows/permissions shim
 * from extension-tabs-shim.js.
 *
 * The tab snapshot arrives through `additionalArguments` rather than IPC so it
 * is available synchronously — by the time an async round trip finished, the
 * extension's own startup code would already have asked its questions and got
 * the wrong answers.
 *
 * The shim is applied as ordinary function calls, never by evaluating a string:
 * extension pages ship a `script-src 'self'` CSP, so eval() throws
 * ("'unsafe-eval' is not an allowed source of script") and the shim silently
 * does nothing at all.
 */

const { ipcRenderer } = require('electron');
const { installTabsShim } = require('./extension-tabs-shim');
const { installApis } = require('./extension-api-client');

function readSnapshot() {
  const prefix = '--privoo-ext-tabs=';
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return null;
  try {
    return JSON.parse(Buffer.from(arg.slice(prefix.length), 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

// Left on the page so the outcome can be read back when something looks wrong.
// A preload's console output goes to the popup's own console, where nobody is
// looking — this is what made the CSP failure above so hard to spot.
const status = { ran: true, count: -1, applied: false, reason: null, apis: false, error: null };
try {
  const snapshot = readSnapshot();
  status.count = snapshot && Array.isArray(snapshot.tabs) ? snapshot.tabs.length : -1;
  if (status.count > 0) {
    const res = installTabsShim(globalThis, snapshot.tabs, snapshot.windowId);
    status.applied = res.applied;
    status.reason = res.reason;
  }
  // The APIs Electron leaves out, backed for real by the main process. Applied
  // regardless of the tab snapshot — a popup can want cookies without caring
  // which tab is in front.
  status.apis = installApis(globalThis, ipcRenderer);
} catch (err) {
  // A popup that renders without the shim is far better than one that does not
  // render at all.
  status.error = (err && err.message) || String(err);
}
try { globalThis.__privooShimStatus = status; } catch { /* nothing to report to */ }
