const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { buildPasswordAutofillScript, buildGooglePasswordPreferScript } = require('./password-autofill');
const { buildIdentityAutofillScript } = require('./identity-autofill');
const { buildFilePickerScript } = require('./file-picker-recent');

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
  captureTabPreview:   (id)    => ipcRenderer.invoke('capture-tab-preview', id),
  setSettings:         (patch) => ipcRenderer.invoke('set-settings', patch),
  chooseDownloadPath:  ()      => ipcRenderer.invoke('choose-download-path'),
  chooseFolder:        ()      => ipcRenderer.invoke('choose-folder'),
  // Wallpaper pickers — used by the Customize side panel and the NTP
  chooseNtpWallpaper:  ()      => ipcRenderer.invoke('choose-ntp-wallpaper'),
  chooseNtpLiveWallpaper: ()   => ipcRenderer.invoke('choose-ntp-live-wallpaper'),
  getNtpWallpaperUrl:  ()      => ipcRenderer.invoke('get-ntp-wallpaper-url'),
  clearNtpWallpaper:   ()      => ipcRenderer.invoke('clear-ntp-wallpaper'),
  // Custom pointer
  chooseCursorImage:   ()      => ipcRenderer.invoke('choose-cursor-image'),
  getCursorImageUrl:   ()      => ipcRenderer.invoke('get-cursor-image-url'),
  clearCursorImage:    ()      => ipcRenderer.invoke('clear-cursor-image'),
  listBrowserProfiles: ()      => ipcRenderer.invoke('list-browser-profiles'),
  chooseBrowserProfile: ()     => ipcRenderer.invoke('choose-browser-profile'),
  importBrowserData:   (opts)  => ipcRenderer.invoke('import-browser-data', opts),
  clearBrowsingData:   (opts)  => ipcRenderer.invoke('clear-browsing-data', opts),
  clearTikTokData:     ()      => ipcRenderer.invoke('clear-tiktok-data'),
  dataSummary:         ()      => ipcRenderer.invoke('data-summary'),

  // Privacy stats
  getPrivacyStats:   () => ipcRenderer.invoke('privacy-stats'),

  // Privoo AI file attachments — the AI panel lives in the chrome, so it needs
  // these as much as the full-page privoo://ai does.
  aiAttachFile:  ()   => ipcRenderer.invoke('ai-attach-file'),
  aiExtractFile: (fp) => ipcRenderer.invoke('ai-extract-file', fp),

  // Chrome Web Store — the chrome offers an install when you land on a
  // store listing, so it needs the same two calls the Extensions page uses.
  webstoreInstall: (input) => ipcRenderer.invoke('webstore-install', input),
  webstoreParseId: (input) => ipcRenderer.invoke('webstore-parse-id', input),

  // Privoo Guard
  protectionStatus: ()      => ipcRenderer.invoke('protection-status'),
  protectionLocate: ()      => ipcRenderer.invoke('protection-locate'),
  protectionDetect: ()      => ipcRenderer.invoke('protection-detect'),
  protectionScan:   (opts)  => ipcRenderer.invoke('protection-scan', opts),
  protectionCancel: ()      => ipcRenderer.invoke('protection-cancel'),
  protectionInstall: ()     => ipcRenderer.invoke('protection-install'),
  protectionUpdateSignatures: () => ipcRenderer.invoke('protection-update-signatures'),
  protectionUninstall: ()   => ipcRenderer.invoke('protection-uninstall'),
  protectionQuarantineThreat: (path, threat) => ipcRenderer.invoke('protection-quarantine-threat', path, threat),
  protectionRemoveThreat: (path) => ipcRenderer.invoke('protection-remove-threat', path),
  protectionRevealThreat: (path) => ipcRenderer.invoke('protection-reveal-threat', path),
  protectionActOnThreats: (action, items) => ipcRenderer.invoke('protection-act-on-threats', action, items),
  protectionQuarantineOpen: () => ipcRenderer.invoke('protection-quarantine-open'),
  onProtectionInstallEvent: (fn) => ipcRenderer.on('protection-install-event', (_e, ev) => fn(ev)),
  onProtectionScanEvent: (fn) => ipcRenderer.on('protection-scan-event', (_e, ev) => fn(ev)),
  resetPrivacyStats: () => ipcRenderer.invoke('reset-privacy-stats'),
  getPageBlockedCount: (wcId) => ipcRenderer.invoke('page-blocked-count', wcId),

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
  aiChatStream: (payload, onChunk) => {
    const channel = 'ai-stream-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const listener = (_e, delta) => { try { onChunk(delta); } catch {} };
    ipcRenderer.on(channel, listener);
    return ipcRenderer.invoke('ai-chat-stream', { ...payload, _channel: channel })
      .finally(() => ipcRenderer.removeListener(channel, listener));
  },
  aiDetectOllama: ()     => ipcRenderer.invoke('ai-detect-ollama'),

  // yt-dlp (main window)
  ytdlpDownload:      (url, opts) => ipcRenderer.invoke('ytdlp-download', url, opts || {}),
  ytdlpCancel:        (id)  => ipcRenderer.invoke('ytdlp-cancel', id),
  ytdlpInspect:       (url) => ipcRenderer.invoke('ytdlp-inspect', url),
  ytdlpHasFfmpeg:     ()    => ipcRenderer.invoke('ytdlp-has-ffmpeg'),
  onYtdlpProgress:    (fn)  => ipcRenderer.on('ytdlp-progress', (_e, ev) => fn(ev)),
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
  saveTabSessionSync: (payload) => { try { return ipcRenderer.sendSync('save-tab-session-sync', payload); } catch { return false; } },

  // Search suggestions (proxied through main to avoid CORS)
  getSuggestions: (q, eng) => ipcRenderer.invoke('search-suggestions', { query: q, engine: eng }),

  // Frameless window controls
  minimize:       () => ipcRenderer.send('window-minimize'),
  toggleMaximize: () => ipcRenderer.send('window-maximize'),
  close:          () => ipcRenderer.send('window-close'),
  setupFinished:  () => ipcRenderer.send('setup-finished'),
  isMaximized:    () => ipcRenderer.invoke('window-is-maximized'),
  getPlatform:    () => ipcRenderer.invoke('get-platform'),
  translucencySupported: () => ipcRenderer.invoke('translucency-supported'),
  getAppVersion:  () => ipcRenderer.invoke('get-app-version'),
  openDevTools:   (guestWcId, opts) => ipcRenderer.invoke('open-devtools', guestWcId, opts),
  closeDevTools:  (guestWcId) => ipcRenderer.invoke('close-devtools', guestWcId),
  updateDevToolsBounds: (guestWcId, bounds) => ipcRenderer.invoke('update-devtools-bounds', guestWcId, bounds),
  setDiscordActivity: (activity) => ipcRenderer.send('discord-rpc-set-activity', activity),
  showContextMenu:(items) => ipcRenderer.invoke('show-context-menu', items),
  contextCopyImage:(id, x, y) => ipcRenderer.invoke('context-copy-image', id, x, y),
  openWindow:     (url)      => ipcRenderer.invoke('open-in-new-window', url),
  addToDictionary:(id, word) => ipcRenderer.invoke('add-to-dictionary', id, word),
  showEmojiPanel: () => ipcRenderer.invoke('show-emoji-panel'),
  captureFullPage:(wcId) => ipcRenderer.invoke('capture-full-page', wcId),
  getCursorPos:       () => ipcRenderer.invoke('get-cursor-pos'),
  openMobileWindow:   (url) => ipcRenderer.invoke('open-mobile-window', url),
  isDefaultBrowser:   () => ipcRenderer.invoke('is-default-browser'),
  setDefaultBrowser:  () => ipcRenderer.invoke('set-default-browser'),
  markMobileWebview:  (id, device) => ipcRenderer.send('mark-mobile-webview', id, device),

  passwordsList:       () => ipcRenderer.invoke('passwords-list'),
  passwordsGetForUrl:  (url) => ipcRenderer.invoke('passwords-get-for-url', url),
  passwordsSave:       (entry) => ipcRenderer.invoke('passwords-save', entry),
  passwordsRemove:     (id) => ipcRenderer.invoke('passwords-remove', id),
  passwordAutofillScript: buildPasswordAutofillScript(),
  googlePasswordPreferScript: buildGooglePasswordPreferScript(),

  identityAutofillScript: buildIdentityAutofillScript(),
  identitiesList:      () => ipcRenderer.invoke('identities-list'),
  identitiesGetDefault:() => ipcRenderer.invoke('identities-get-default'),
  identitiesSave:      (entry) => ipcRenderer.invoke('identities-save', entry),
  identitiesRemove:    (id) => ipcRenderer.invoke('identities-remove', id),
  identitiesSetDefault:(id) => ipcRenderer.invoke('identities-set-default', id),
  ollamaResolveFields: (fields, keys) => ipcRenderer.invoke('ollama-resolve-fields', fields, keys),
  ollamaStatus:        () => ipcRenderer.invoke('ollama-status'),

  filePickerScript: buildFilePickerScript(),
  recentFilesList:  () => ipcRenderer.invoke('recent-files-list'),
  recentFileRead:   (p) => ipcRenderer.invoke('recent-file-read', p),

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
  onPopupBlocked:   (fn) => ipcRenderer.on('popup-blocked', (_e, d) => fn(d)),
  onDownloadBoostStarted: (fn) => ipcRenderer.on('download-boost-started', (_e, d) => fn(d)),
  onTabRendererGone: (fn) => ipcRenderer.on('tab-renderer-gone', (_e, d) => fn(d)),
  onTabUnresponsive: (fn) => ipcRenderer.on('tab-unresponsive', (_e, d) => fn(d)),
  onTabResponsive:   (fn) => ipcRenderer.on('tab-responsive', (_e, d) => fn(d)),
  onSettingsChanged: (fn) => ipcRenderer.on('settings-updated', (_e, s) => fn(s)),
  onBrowsingDataCleared: (fn) => ipcRenderer.on('browsing-data-cleared', (_e, r) => fn(r)),
  onPlatform: (fn) => ipcRenderer.on('platform', (_e, p) => fn(p)),

  // Profiles
  profilesList:    ()      => ipcRenderer.invoke('profiles:list'),
  profileCreate:   (data)  => ipcRenderer.invoke('profiles:create', data),
  profileUpdate:   (data)  => ipcRenderer.invoke('profiles:update', data),
  profileDelete:   (id)    => ipcRenderer.invoke('profiles:delete', id),
  profileSwitch:   (id)    => ipcRenderer.invoke('profiles:switch', id),
  profileOpenPicker: ()    => ipcRenderer.invoke('profiles:open-picker'),

  // Auto-updater events
  onUpdateAvailable:  (fn) => ipcRenderer.on('update-available',  (_e, info) => fn(info)),
  onUpdateProgress:   (fn) => ipcRenderer.on('update-progress',   (_e, p)    => fn(p)),
  onUpdateDownloaded: (fn) => ipcRenderer.on('update-downloaded', (_e, info) => fn(info)),
  onUpdateError:      (fn) => ipcRenderer.on('update-error',      (_e, msg)  => fn(msg)),
  onUpdateInstallFailed: (fn) => ipcRenderer.on('update-install-failed', (_e, msg) => fn(msg)),
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
