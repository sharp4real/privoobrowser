const { contextBridge, ipcRenderer } = require('electron');

// IMPORTANT: do NOT `require('./google-spoof')` (or any app-relative module) here.
// This <webview> preload runs in Electron's *sandboxed* preload bundle, where a
// relative require throws "module not found" and aborts the ENTIRE preload —
// which stops the contextBridge.exposeInMainWorld('privooInternal') below from
// ever running, breaking every privoo:// page (settings, history, downloads,
// passwords). That was the v3.0.1 settings regression.
//
// The Chrome identity spoof is injected by the main process via CDP
// (Page.addScriptToEvaluateOnNewDocument at document-start) with an
// executeJavaScript fallback at dom-ready — see main.js. No preload-side
// injection is needed or safe here.

if (location.protocol === 'privoo:') {
  contextBridge.exposeInMainWorld('privooInternal', {
    getSettings:    ()      => ipcRenderer.invoke('get-settings'),
    setSettings:    (patch) => ipcRenderer.invoke('set-settings', patch),
    onSettingsChanged: (fn) => ipcRenderer.on('settings-updated', (_e, data) => fn(data)),

    getPrivacyStats: () => ipcRenderer.invoke('privacy-stats'),
    dataSummary:     () => ipcRenderer.invoke('data-summary'),
    clearBrowsingData: (opts) => ipcRenderer.invoke('clear-browsing-data', opts),
    onBrowsingDataCleared: (fn) => ipcRenderer.on('browsing-data-cleared', (_e, data) => fn(data)),

    getHistory:     (query) => ipcRenderer.invoke('get-history', query),
    clearHistory:   ()      => ipcRenderer.invoke('clear-history'),
    removeHistory:  (t)     => ipcRenderer.invoke('remove-history', t),
    removeHistoryEntries: (items) => ipcRenderer.invoke('remove-history-entries', items),
    removeHistoryDomain:  (host)  => ipcRenderer.invoke('remove-history-domain', host),

    // Password manager (privoo://settings only — exposeInMainWorld is gated
     // by the privoo:// protocol check at the top of this block).
     passwordsList:   ()      => ipcRenderer.invoke('passwords-list'),
     passwordsReveal: (id)    => ipcRenderer.invoke('passwords-reveal', id),
     passwordsRemove: (id)    => ipcRenderer.invoke('passwords-remove', id),
     passwordsSave:   (entry) => ipcRenderer.invoke('passwords-save', entry),

    getDownloads:    ()      => ipcRenderer.invoke('get-downloads'),
    clearDownloads:  ()      => ipcRenderer.invoke('clear-downloads'),
    removeDownload:  (id)    => ipcRenderer.invoke('remove-download', id),
    openDownload:    (p)     => ipcRenderer.invoke('open-download', p),
    showInFolder:    (p)     => ipcRenderer.invoke('show-in-folder', p),
    cancelDownload:  (id)    => ipcRenderer.invoke('cancel-download', id),
    getFileIcon:     (p)     => ipcRenderer.invoke('get-file-icon', p),

    getSuggestions: (q, eng) => ipcRenderer.invoke('search-suggestions', { query: q, engine: eng }),
    getAppVersion:  () => ipcRenderer.invoke('get-app-version'),
    isDefaultBrowser:  () => ipcRenderer.invoke('is-default-browser'),
    setDefaultBrowser: () => ipcRenderer.invoke('set-default-browser'),
    httpProceed:    (url)    => ipcRenderer.invoke('http-proceed', url),
    clearTikTokData: ()      => ipcRenderer.invoke('clear-tiktok-data'),
    clearSiteData:   (host)  => ipcRenderer.invoke('clear-site-data', host),

    // AI Browser
    aiGetConfig:  ()        => ipcRenderer.invoke('ai-get-config'),
    aiSetConfig:  (cfg)     => ipcRenderer.invoke('ai-set-config', cfg),
    aiChat:       (payload) => ipcRenderer.invoke('ai-chat', payload),
    aiDetectOllama: ()      => ipcRenderer.invoke('ai-detect-ollama'),
    // One-time new-tab popups: claim the single per-launch slot (true once).
    claimNtpPopup: ()       => ipcRenderer.invoke('claim-newtab-popup'),
    // Frameless AI window controls.
    aiWindowMinimize: () => ipcRenderer.send('ai-window-minimize'),
    aiWindowClose:    () => ipcRenderer.send('ai-window-close'),

    chooseDownloadPath: () => ipcRenderer.invoke('choose-download-path'),
    chooseFolder:       () => ipcRenderer.invoke('choose-folder'),
    chooseBrowserProfile: () => ipcRenderer.invoke('choose-browser-profile'),
    listBrowserProfiles: () => ipcRenderer.invoke('list-browser-profiles'),
    importBrowserData:   (opts) => ipcRenderer.invoke('import-browser-data', opts),
    openDirectory:      (p) => ipcRenderer.invoke('open-directory', p),
    chooseNtpWallpaper: () => ipcRenderer.invoke('choose-ntp-wallpaper'),
    chooseNtpLiveWallpaper: () => ipcRenderer.invoke('choose-ntp-live-wallpaper'),
    clearNtpWallpaper:  () => ipcRenderer.invoke('clear-ntp-wallpaper'),
    // chooseYtdlpBinary removed — auto-installer handles the binary.
    chooseMusicFile:    () => ipcRenderer.invoke('choose-music-file'),
    chooseCrxFile:      () => ipcRenderer.invoke('choose-crx-file'),
    readExtManifest:    (p) => ipcRenderer.invoke('read-ext-manifest', p),
    loadExtension:      (p) => ipcRenderer.invoke('load-extension', p),
    ytdlpProbe:         () => ipcRenderer.invoke('ytdlp-probe'),
    ytdlpDownload:      (url, opts) => ipcRenderer.invoke('ytdlp-download', url, opts || {}),
    onDownloadUpdate: (fn) => {
      ipcRenderer.on('download-update', (_e, data) => fn(data));
    },

    navigate: (url) => ipcRenderer.sendToHost('navigate', url),
    httpNavigate: (url) => ipcRenderer.sendToHost('http-navigate', url),
    openTab:  (url) => ipcRenderer.sendToHost('open-tab', url),
    // Ask the host shell to open its Customize side panel (NTP "pen" button).
    openCustomizePanel: () => ipcRenderer.sendToHost('open-customize-panel'),
  });
}

// Password manager bridge (guest page main world ↔ host renderer).
if (location.protocol !== 'privoo:') {
  try {
    contextBridge.exposeInMainWorld('privooPassword', {
      send: (channel, data) => ipcRenderer.sendToHost(channel, data || {}),
    });
  } catch { /* already exposed */ }
}

window.addEventListener(
  'mousedown',
  () => { try { ipcRenderer.sendToHost('guest-pointer'); } catch (_) {} },
  true
);
