'use strict';

/**
 * Which Chrome extension APIs Privoo can actually run.
 *
 * WHY THIS EXISTS
 * ---------------
 * Privoo is built on Electron, which implements a deliberately small subset of
 * the Chrome extension APIs. An extension that touches a missing namespace does
 * not degrade — it throws while its background is still loading:
 *
 *     browser.webNavigation.onBeforeNavigate.addListener(...)
 *     → TypeError: Cannot read properties of undefined (reading 'onBeforeNavigate')
 *     → Service worker registration failed. Status code: 15
 *
 * The extension then sits in the list looking installed and does nothing at all,
 * and the only clue is a stack trace in a log nobody reads.
 *
 * Defining empty stubs for the missing namespaces would let the background load
 * and would be WORSE: a content blocker whose webRequest never fires blocks
 * nothing while appearing to work. So Privoo does not fake these APIs — it
 * reads the manifest up front and says plainly what will not work.
 *
 * The supported list below was measured against this Electron build by loading
 * a probe extension and enumerating `Object.keys(chrome)`, not copied from
 * documentation.
 *
 * WHAT PRIVOO ADDS ON TOP
 * -----------------------
 * Several namespaces in the supported list are not Electron's — Privoo
 * implements them (extension-api-host.js) and injects them into both an
 * extension's popup and its background service worker: cookies, webNavigation,
 * windows, permissions, contextMenus, notifications, idle and commands. They
 * are backed by real data, not stubbed.
 *
 * webRequest is the one that stays out. Blocking a request needs a synchronous
 * verdict before it is sent, and every route into an extension here is async, so
 * a stub would let a content blocker start and then block nothing at all.
 * declarativeNetRequest — which is how modern blockers work — does function.
 */

/** Namespaces this build genuinely provides. */
const SUPPORTED_APIS = new Set([
  // Electron's own.
  'action',
  'alarms',
  'declarativeNetRequest',
  'declarativeNetRequestFeedback',
  'extension',
  'i18n',
  'management',
  'offscreen',
  'runtime',
  'scripting',
  'storage',
  'tabs',
  // Added by Privoo, in popups and background workers alike.
  'commands',
  'contextMenus',
  'cookies',
  'idle',
  'notifications',
  'permissions',
  'webNavigation',
  'windows',
]);

/**
 * Manifest permissions that are not an API surface at all — they grant access
 * or capacity rather than a `chrome.*` namespace, so their absence from the
 * supported list means nothing.
 */
const NON_API_PERMISSIONS = new Set([
  'activeTab',
  'background',
  'unlimitedStorage',
  'clipboardWrite',
  'declarativeNetRequestWithHostAccess',
  'webRequestAuthProvider',
]);

/**
 * What each unsupported permission actually costs the user, in plain terms.
 * Anything not listed here still gets reported, just without the detail.
 */
const IMPACT = {
  webRequest: 'inspect or block network requests',
  webRequestBlocking: 'block network requests as they happen',
  topSites: 'read your most-visited sites',
  favicon: 'read site icons',
  bookmarks: 'read or change your bookmarks',
  history: 'read or change your browsing history',
  downloads: 'manage downloads',
  notifications: 'show desktop notifications',
  privacy: 'change privacy settings',
  proxy: 'change proxy settings',
  idle: 'detect when you are idle',
  identity: 'sign you in to an account',
  sessions: 'restore recently closed tabs',
  browsingData: 'clear browsing data',
  tabGroups: 'manage tab groups',
  sidePanel: 'show a side panel',
  contentSettings: 'change per-site content settings',
  debugger: 'attach a debugger to pages',
  pageCapture: 'save pages as MHTML',
  tabCapture: 'capture tab audio or video',
  desktopCapture: 'capture your screen',
  search: 'run searches through the browser',
  readingList: 'manage a reading list',
  fontSettings: 'change font settings',
  tts: 'speak text aloud',
  ttsEngine: 'provide a speech engine',
  power: 'keep the system awake',
  gcm: 'receive push messages',
  declarativeContent: 'act on page content rules',
  nativeMessaging: 'talk to apps on your computer',
  printerProvider: 'provide printers',
  webAuthenticationProxy: 'proxy security-key requests',
  processes: 'inspect browser processes',
  topSitesPrivate: 'read your most-visited sites',
};

/** Permissions that, when missing, usually stop the extension working at all. */
const CRITICAL = new Set([
  'webRequest',
  'webRequestBlocking',
  'proxy',
  'privacy',
  'nativeMessaging',
  'debugger',
]);

function permissionList(manifest) {
  if (!manifest || typeof manifest !== 'object') return [];
  const out = [];
  for (const key of ['permissions', 'optional_permissions']) {
    const v = manifest[key];
    if (Array.isArray(v)) out.push(...v.filter((p) => typeof p === 'string'));
  }
  return out;
}

/**
 * Inspect a manifest and report what Privoo cannot run.
 *
 * Returns:
 *   { unsupported: [{ permission, impact, critical }], critical: bool,
 *     summary: string|null }
 * `summary` is null when nothing is wrong, so callers can branch on it.
 */
function checkExtension(manifest) {
  const seen = new Set();
  const unsupported = [];

  for (const raw of permissionList(manifest)) {
    // "downloads.open" and "system.cpu" are sub-permissions of a namespace.
    const ns = String(raw).split('.')[0];
    if (!ns || seen.has(ns)) continue;
    if (NON_API_PERMISSIONS.has(ns) || SUPPORTED_APIS.has(ns)) continue;
    // Host patterns can appear in the permissions array in MV2 manifests.
    if (ns.includes('://') || ns === '<all_urls>') continue;
    seen.add(ns);
    unsupported.push({
      permission: ns,
      impact: IMPACT[ns] || null,
      critical: CRITICAL.has(ns),
    });
  }

  unsupported.sort((a, b) => Number(b.critical) - Number(a.critical) || a.permission.localeCompare(b.permission));
  const critical = unsupported.some((u) => u.critical);

  let summary = null;
  if (unsupported.length) {
    const names = unsupported.map((u) => u.permission).join(', ');
    summary = critical
      ? 'This extension needs ' + names + ', which Privoo does not support. '
        + 'It will almost certainly not work.'
      : 'This extension uses ' + names + ', which Privoo does not support. '
        + 'It should still load, but those parts will not work.';
  }

  return { unsupported, critical, summary };
}

/** The same thing as lines for a dialog, e.g. "• block network requests". */
function impactLines(check) {
  return (check.unsupported || []).map((u) =>
    u.impact ? u.permission + ' — ' + u.impact : u.permission);
}

module.exports = { checkExtension, impactLines, SUPPORTED_APIS, CRITICAL, IMPACT };
