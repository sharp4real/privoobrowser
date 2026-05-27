const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildPasswordAutofillScript, buildGooglePasswordPreferScript } = require('./password-autofill');

// Read the incognito partition passed via webPreferences.additionalArguments
// — available synchronously so the renderer knows it's private before it
// builds its first tab. Empty string for a normal window.
const _incognitoPartition = (() => {
  try {
    const arg = process.argv.find((a) => a.startsWith('--privoo-incognito-partition='));
    return arg ? arg.split('=').slice(1).join('=') : '';
  } catch { return ''; }
})();

contextBridge.exposeInMainWorld('privoo', {
  // Preload URL injected into every <webview> element
  webviewPreloadUrl: pathToFileURL(path.join(__dirname, 'webview-preload.js')).toString(),

  // Incognito partition (empty for normal windows). Read synchronously by
  // the renderer at startup so private tabs use the right session.
  incognitoPartition: _incognitoPartition,

  // Settings
  getSettings:         ()      => ipcRenderer.invoke('get-settings'),
  setSettings:         (patch) => ipcRenderer.invoke('set-settings', patch),
  chooseDownloadPath:  ()      => ipcRenderer.invoke('choose-download-path'),
  chooseFolder:        ()      => ipcRenderer.invoke('choose-folder'),
  // Wallpaper pickers — used by the Customize side panel and the NTP
  chooseNtpWallpaper:  ()      => ipcRenderer.invoke('choose-ntp-wallpaper'),
  clearNtpWallpaper:   ()      => ipcRenderer.invoke('clear-ntp-wallpaper'),
  listBrowserProfiles: ()      => ipcRenderer.invoke('list-browser-profiles'),
  chooseBrowserProfile: ()     => ipcRenderer.invoke('choose-browser-profile'),
  importBrowserData:   (opts)  => ipcRenderer.invoke('import-browser-data', opts),
  clearBrowsingData:   (opts)  => ipcRenderer.invoke('clear-browsing-data', opts),
  clearTikTokData:     ()      => ipcRenderer.invoke('clear-tiktok-data'),
  dataSummary:         ()      => ipcRenderer.invoke('data-summary'),

  // Privacy stats
  getPrivacyStats:   () => ipcRenderer.invoke('privacy-stats'),
  resetPrivacyStats: () => ipcRenderer.invoke('reset-privacy-stats'),

  // History (recorded by renderer after each page load)
  addHistory:          (entry)  => ipcRenderer.invoke('add-history', entry),
  searchHistory:       (query)  => ipcRenderer.invoke('get-history', query),
  historyAutocomplete: (prefix) => ipcRenderer.invoke('history-autocomplete', prefix),
  removeHistoryEntries: (items) => ipcRenderer.invoke('remove-history-entries', items),
  removeHistoryDomain: (host)   => ipcRenderer.invoke('remove-history-domain', host),

  // Downloads
  getDownloads:   () => ipcRenderer.invoke('get-downloads'),
  openDownload:   (p)  => ipcRenderer.invoke('open-download', p),
  showInFolder:   (p)  => ipcRenderer.invoke('show-in-folder', p),
  cancelDownload: (id) => ipcRenderer.invoke('cancel-download', id),
  getFileIcon:    (p)  => ipcRenderer.invoke('get-file-icon', p),

  // Incognito (BETA) — opens a separate BrowserWindow with a non-persistent
  // session. Cookies, history, cache, downloads are scoped to that window
  // and wiped on close.
  openIncognitoWindow: () => ipcRenderer.invoke('open-incognito-window'),
  onIncognitoMode: (fn) => ipcRenderer.on('incognito-mode', (_e, on) => fn(on)),

  // AI Browser (BETA) — inline side panel + config/chat IPC.
  openAiWindow: () => ipcRenderer.invoke('open-ai-window'),
  aiGetConfig: ()        => ipcRenderer.invoke('ai-get-config'),
  aiSetConfig: (cfg)     => ipcRenderer.invoke('ai-set-config', cfg),
  aiChat:      (payload) => ipcRenderer.invoke('ai-chat', payload),

  // yt-dlp (main window)
  ytdlpDownload:      (url, opts) => ipcRenderer.invoke('ytdlp-download', url, opts || {}),
  ytdlpProbe:         () => ipcRenderer.invoke('ytdlp-probe'),
  chooseYtdlpFolder:  () => ipcRenderer.invoke('choose-folder'),
  // chooseYtdlpBinary removed — yt-dlp is auto-installed; no picker UI.
  chooseMusicFile:    () => ipcRenderer.invoke('choose-music-file'),

  // Extensions
  chooseCrxFile:      () => ipcRenderer.invoke('choose-crx-file'),
  readExtManifest:    (p) => ipcRenderer.invoke('read-ext-manifest', p),
  loadExtension:      (p) => ipcRenderer.invoke('load-extension', p),
  openExtensionPopup: (opts) => ipcRenderer.invoke('open-extension-popup', opts),
  openDirectory:      (p) => ipcRenderer.invoke('open-directory', p),

  // Tab session
  getTabSession: () => ipcRenderer.invoke('get-tab-session'),
  saveTabSession: (payload) => ipcRenderer.invoke('save-tab-session', payload),

  // Search suggestions (proxied through main to avoid CORS)
  getSuggestions: (q, eng) => ipcRenderer.invoke('search-suggestions', { query: q, engine: eng }),

  // Frameless window controls
  minimize:       () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  close:          () => ipcRenderer.send('window-close'),
  setupFinished:  () => ipcRenderer.send('setup-finished'),
  isMaximized:    () => ipcRenderer.invoke('window-is-maximized'),
  getPlatform:    () => ipcRenderer.invoke('get-platform'),
  getAppVersion:  () => ipcRenderer.invoke('get-app-version'),
  openDevTools:   (guestWcId, devWcId) => ipcRenderer.invoke('open-devtools', guestWcId, devWcId),
  showContextMenu:(items) => ipcRenderer.invoke('show-context-menu', items),
  showEmojiPanel: () => ipcRenderer.invoke('show-emoji-panel'),
  captureFullPage:(wcId) => ipcRenderer.invoke('capture-full-page', wcId),
  getCursorPos:       () => ipcRenderer.invoke('get-cursor-pos'),
  isDefaultBrowser:   () => ipcRenderer.invoke('is-default-browser'),
  setDefaultBrowser:  () => ipcRenderer.invoke('set-default-browser'),

  passwordsList:       () => ipcRenderer.invoke('passwords-list'),
  passwordsGetForUrl:  (url) => ipcRenderer.invoke('passwords-get-for-url', url),
  passwordsSave:       (entry) => ipcRenderer.invoke('passwords-save', entry),
  passwordsRemove:     (id) => ipcRenderer.invoke('passwords-remove', id),
  passwordAutofillScript: buildPasswordAutofillScript(),
  googlePasswordPreferScript: buildGooglePasswordPreferScript(),

  // Google sign-in via system browser
  googleSignIn: (continueUrl) => ipcRenderer.invoke('google-signin-start', continueUrl),
  googleSignInGetUrl: (continueUrl) => ipcRenderer.invoke('google-signin-get-url', continueUrl),
  onGoogleSignInSystemDone: (fn) => ipcRenderer.on('google-signin-system-done', (_e, d) => fn(d)),

  // Push events from main → renderer
  onGoogleAuthDone: (fn) => ipcRenderer.on('google-auth-done', () => fn()),
  onOpenTab:      (fn) => ipcRenderer.on('open-tab',      (_e, url)  => fn(url)),
  onWebviewShortcut: (fn) => ipcRenderer.on('webview-shortcut', (_e, k) => fn(k)),
  onWindowState:  (fn) => ipcRenderer.on('window-state',  (_e, max)  => fn(max)),
  onDownloadUpdate: (fn) => ipcRenderer.on('download-update', (_e, d) => fn(d)),
  onSettingsChanged: (fn) => ipcRenderer.on('settings-updated', (_e, s) => fn(s)),
  onBrowsingDataCleared: (fn) => ipcRenderer.on('browsing-data-cleared', (_e, r) => fn(r)),
  onPlatform: (fn) => ipcRenderer.on('platform', (_e, p) => fn(p)),
  onTransparencyState: (fn) => ipcRenderer.on('transparency-state', (_e, on) => fn(on)),

  // Auto-updater events
  onUpdateAvailable:  (fn) => ipcRenderer.on('update-available',  (_e, info) => fn(info)),
  onUpdateProgress:   (fn) => ipcRenderer.on('update-progress',   (_e, p)    => fn(p)),
  onUpdateDownloaded: (fn) => ipcRenderer.on('update-downloaded', (_e, info) => fn(info)),
  onUpdateError:      (fn) => ipcRenderer.on('update-error',      (_e, msg)  => fn(msg)),
  installUpdateNow:   ()   => ipcRenderer.send('install-update-now'),
  getUpdateStatus:    ()   => ipcRenderer.invoke('get-update-status'),
  triggerUpdateCheck: ()   => ipcRenderer.invoke('trigger-update-check'),
});

// Expose version information for About section
contextBridge.exposeInMainWorld('versions', {
  electron: process.versions.electron,
  node: process.versions.node,
  v8: process.versions.v8,
  chrome: process.versions.chrome,
});
