const { contextBridge, ipcRenderer } = require('electron');

/* ── Tell the host once this page has been typed into ────────────────────
   Tab Snooze must never discard a page with a half-written form on it. The
   host used to ask by injecting a script on a timer, which logged a main
   process error whenever a page declined to run it. This says it once,
   unprompted, and then stops listening.

   Per document by construction: the preload re-runs on every navigation, so
   a fresh page starts clean without anything having to reset it. */
(function reportFormInput() {
  const tell = () => {
    try { ipcRenderer.sendToHost('form-dirty'); } catch { /* host is gone */ }
  };
  // capture:true so it still fires for inputs inside shadow roots and for
  // handlers that stop propagation.
  window.addEventListener('input', tell, { capture: true, once: true });
  window.addEventListener('change', tell, { capture: true, once: true });
})();


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

// ─── "Add to Privoo" on the Chrome Web Store ────────────────────────────────
// Privoo reports a Chrome user agent, so the store renders its normal listing
// with a working "Add to Chrome" button. This takes that button over: it is
// relabelled, its click is intercepted before the store's own handler sees it,
// and the install is done by the main process. From the outside it behaves the
// way the equivalent button does in any other Chromium browser — browse the
// store, click once, confirm.
//
// It lives here rather than in a separate module because this file is a
// SANDBOXED preload: an app-relative require() throws and takes the whole
// preload down with it (see the note above).
(function nativeChromeWebStore() {
  const host = (location.hostname || '').toLowerCase().replace(/^www\./, '');
  const onStore = host === 'chromewebstore.google.com'
    || (host === 'chrome.google.com' && (location.pathname || '').toLowerCase().startsWith('/webstore'));
  if (!onStore) return;

  const MARK = 'data-privoo-store-action';
  // The store uses different wording across its old and new front ends, and
  // localises them; the English forms cover the overwhelming majority, and a
  // miss simply means the page keeps its own button.
  const ADD_RE = /^\s*(add to chrome|add to browser|install|get)\s*$/i;
  const REMOVE_RE = /^\s*(remove from chrome|remove from browser|uninstall|remove)\s*$/i;

  let busy = false;
  let lastHref = '';
  let installed = false;
  let scanTimer = 0;

  function currentId() {
    const segs = (location.pathname || '').split('/').filter(Boolean);
    for (let i = segs.length - 1; i >= 0; i--) {
      if (/^[a-p]{32}$/i.test(segs[i])) return segs[i].toLowerCase();
    }
    return null;
  }

  function listingTitle() {
    const h1 = document.querySelector('h1');
    const t = (h1 && h1.textContent || document.title || '').trim();
    return t.replace(/\s*[-–—]\s*Chrome Web Store\s*$/i, '').trim();
  }

  // The store's markup is generated and its class names change; walking for
  // anything button-shaped (including inside shadow roots) and matching on the
  // visible label is far more durable than a CSS selector.
  function buttonLike() {
    const out = [];
    const seen = new Set();
    const roots = [document];
    while (roots.length) {
      const root = roots.pop();
      if (!root || seen.has(root)) continue;
      seen.add(root);
      let all;
      try { all = root.querySelectorAll('*'); } catch { continue; }
      for (const el of all) {
        if (el.shadowRoot) roots.push(el.shadowRoot);
        if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') {
          out.push(el);
        }
      }
    }
    return out;
  }

  function labelOf(el) {
    return ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
  }

  /** Rewrite the visible label without disturbing the button's icon or layout. */
  function relabel(el, text) {
    const texts = [];
    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      let n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue && n.nodeValue.trim()) texts.push(n);
      }
    } catch { /* fall through to textContent */ }
    if (texts.length) {
      texts[0].nodeValue = text;
      for (let i = 1; i < texts.length; i++) texts[i].nodeValue = '';
    } else {
      el.textContent = text;
    }
    if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', text);
    el.setAttribute('title', text);
  }

  function toast(message, isError) {
    let el = document.getElementById('__privoo_store_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '__privoo_store_toast';
      el.style.cssText = [
        'position:fixed', 'left:50%', 'bottom:28px', 'transform:translateX(-50%)',
        'z-index:2147483647', 'padding:11px 18px', 'border-radius:10px',
        'font:500 13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif',
        'color:#fff', 'box-shadow:0 10px 30px -8px rgba(0,0,0,.5)',
        'pointer-events:none', 'max-width:min(420px,80vw)', 'text-align:center',
      ].join(';');
      document.documentElement.appendChild(el);
    }
    el.style.background = isError ? '#b3261e' : '#1f2023';
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  }

  /**
   * Hide the store's "Switch to Chrome to install extensions" banner and its
   * matching pop-up. They are shown to any non-Chrome browser, and now that the
   * button next to them installs, they are simply wrong — leaving them up would
   * tell the user the thing they are about to do is impossible.
   *
   * Finds the innermost element whose whole visible text is the nag, then walks
   * up while the parent adds nothing else, so the entire banner goes rather
   * than one stray line of it.
   */
  function hideNags() {
    // The nag appears as a banner and as a pop-up, and the pop-up splits its
    // wording across a heading and a body line — matching only the heading
    // hid half a dialog and left the rest floating.
    const NAGS = [
      /switch to chrome/i,
      /google recommends using chrome/i,
      /to install extensions and themes/i,
      // These are what the store says once the button has been pressed. The
      // list above only covered the banner shown on arrival, so the notice
      // that appears on the click was never matched.
      /not (?:available|supported|compatible) (?:on|in|for|with) (?:this|your) browser/i,
      /available only (?:on|in|for) chrome/i,
      /only available (?:on|in|for) (?:google )?chrome/i,
      /(?:you (?:will )?need|requires) (?:google )?chrome/i,
      /this extension (?:is )?(?:only )?works? (?:on|with) chrome/i,
    ];
    const isNag = (t) => t && t.length <= 240 && NAGS.some((re) => re.test(t));
    const DIALOG_ROLES = new Set(['dialog', 'alertdialog', 'alert', 'status', 'banner']);

    let candidates;
    try { candidates = document.querySelectorAll('div, section, aside, span, p, h1, h2, h3'); }
    catch { return; }

    for (const el of candidates) {
      if (el.dataset && el.dataset.privooNagHidden) continue;
      let text;
      try { text = (el.innerText || '').trim(); } catch { continue; }
      if (!isNag(text)) continue;
      // Innermost match only — skip anything a descendant already matched.
      let inner = false;
      for (const child of el.children) {
        try { if (isNag((child.innerText || '').trim())) { inner = true; break; } }
        catch { /* ignore */ }
      }
      if (inner) continue;

      // Prefer the dialog/banner container when the page gives us one: that is
      // the whole nag, buttons included.
      let node = el;
      let hop = el;
      for (let depth = 0; depth < 6 && hop && hop !== document.body; depth++) {
        const role = (hop.getAttribute && hop.getAttribute('role') || '').toLowerCase();
        if (DIALOG_ROLES.has(role)) { node = hop; break; }
        hop = hop.parentElement;
      }
      if (node === el) {
        // No role to go on: walk up while the ancestor adds little beyond this
        // text — enough to swallow the nag's own buttons, not the page.
        let text2 = text;
        while (node.parentElement
               && node.parentElement !== document.body
               && node.parentElement !== document.documentElement) {
          let parentText;
          try { parentText = (node.parentElement.innerText || '').trim(); } catch { break; }
          if (parentText.length > text2.length + 90) break;
          node = node.parentElement;
          text2 = parentText;
        }
      }

      // Never hide something that contains the button we just took over.
      try { if (node.querySelector('[' + MARK + ']')) continue; } catch { /* ignore */ }

      node.style.setProperty('display', 'none', 'important');
      if (node.dataset) node.dataset.privooNagHidden = '1';
      collapseEmptyShell(node);
    }
  }

  /**
   * Take out an ancestor that the hidden nag has left empty.
   *
   * The notice is an amber strip: a coloured, bordered, padded shell with a
   * line of text inside it. Hiding the text leaves the shell, and a padded
   * amber box with nothing in it is a thin amber line sitting exactly where
   * the notice was.
   *
   * Emptiness is the whole test. innerText skips display:none, so an ancestor
   * whose only content was the nag now reports no text at all; and every one
   * of its children is checked for being rendered before anything is touched.
   * An ancestor that still has something in it stops the walk, so this cannot
   * take away part of the page.
   */
  function collapseEmptyShell(hidden) {
    let node = hidden;
    let p = node.parentElement;
    for (let depth = 0; depth < 4; depth++) {
      if (!p || p === document.body || p === document.documentElement) return;

      // Still says something of its own — not an empty shell.
      let text;
      try { text = (p.innerText || '').trim(); } catch { return; }
      if (text) return;

      // Still draws something of its own. An <img>, an icon, a spinner: all
      // have no text and all mean the container is not empty.
      let painted = false;
      try {
        for (const c of p.children) {
          const st = getComputedStyle(c);
          if (st.display !== 'none' && st.visibility !== 'hidden') { painted = true; break; }
        }
      } catch { return; }
      if (painted) return;

      // Never take out something holding the button we took over.
      try { if (p.querySelector('[' + MARK + ']')) return; } catch { return; }

      p.style.setProperty('display', 'none', 'important');
      if (p.dataset) p.dataset.privooNagHidden = '1';
      node = p;
      p = p.parentElement;
    }
  }

  function paint() {
    hideNags();
    const id = currentId();
    for (const el of buttonLike()) {
      const owned = el.getAttribute(MARK);
      const label = labelOf(el);
      if (!id) {
        // Left the listing — hand any button we took over back to the store.
        if (owned) el.removeAttribute(MARK);
        continue;
      }
      if (owned) {
        if (!busy) relabel(el, installed ? 'Remove from Privoo' : 'Add to Privoo');
        continue;
      }
      if (ADD_RE.test(label) || REMOVE_RE.test(label)) {
        el.setAttribute(MARK, '1');
        // The store's button can be disabled for extensions it thinks are
        // already installed; Privoo tracks that itself.
        el.removeAttribute('disabled');
        el.setAttribute('aria-disabled', 'false');
        relabel(el, installed ? 'Remove from Privoo' : 'Add to Privoo');
      }
    }
  }

  async function refreshStatus() {
    const id = currentId();
    if (!id) { installed = false; return; }
    try {
      const res = await ipcRenderer.invoke('webstore-status', id);
      installed = !!(res && res.installed);
    } catch { installed = false; }
  }

  function ourButtonFrom(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    for (const node of path) {
      if (node && node.nodeType === 1 && node.getAttribute && node.getAttribute(MARK)) return node;
    }
    return null;
  }

  async function act(btn) {
    if (busy) return;
    const id = currentId();
    if (!id) return;
    busy = true;
    const wasInstalled = installed;
    relabel(btn, wasInstalled ? 'Removing…' : 'Adding…');

    let res;
    try {
      res = wasInstalled
        ? await ipcRenderer.invoke('webstore-remove', id)
        : await ipcRenderer.invoke('webstore-add', { id, title: listingTitle() });
    } catch (err) {
      res = { ok: false, error: (err && err.message) || 'Install failed.' };
    }

    busy = false;
    if (res && res.ok) {
      installed = !wasInstalled;
      toast(wasInstalled
        ? 'Removed "' + (res.name || 'extension') + '" from Privoo'
        : 'Added "' + (res.name || 'extension') + '" to Privoo');
    } else if (res && res.already) {
      installed = true;
    } else if (res && !res.canceled) {
      toast((res && res.error) || 'Could not add that extension', true);
    }
    paint();
  }

  // Capture phase, and on every event the store might act on, so its own
  // handler never runs and the page never navigates off to a Chrome-only flow.
  for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
    document.addEventListener(type, (e) => {
      const btn = ourButtonFrom(e);
      if (!btn) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (type === 'click') act(btn);
    }, true);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const btn = ourButtonFrom(e);
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    act(btn);
  }, true);

  function schedule() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => { scanTimer = 0; paint(); }, 120);
  }

  async function onNavigate() {
    lastHref = location.href;
    await refreshStatus();
    paint();
  }

  function start() {
    onNavigate();
    // The store is a single-page app: it swaps the listing without a reload,
    // and re-renders its buttons underneath us. Watch both.
    try {
      new MutationObserver(() => {
        if (location.href !== lastHref) onNavigate();
        else schedule();
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch { /* observer unavailable — the interval below still covers it */ }
    setInterval(() => {
      if (location.href !== lastHref) onNavigate();
      else paint();
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

if (location.protocol === 'privoo:') {
  contextBridge.exposeInMainWorld('privooInternal', {
    getSettings:    ()      => ipcRenderer.invoke('get-settings'),
    setSettings:    (patch) => ipcRenderer.invoke('set-settings', patch),
    onSettingsChanged: (fn) => ipcRenderer.on('settings-updated', (_e, data) => fn(data)),

    getPrivacyStats: () => ipcRenderer.invoke('privacy-stats'),
    wallpaperLibList:   ()   => ipcRenderer.invoke('wallpaper-lib-list'),
    wallpaperLibAdd:    ()   => ipcRenderer.invoke('wallpaper-lib-add'),
    wallpaperLibUse:    (id) => ipcRenderer.invoke('wallpaper-lib-use', id),
    wallpaperLibRemove: (id) => ipcRenderer.invoke('wallpaper-lib-remove', id),

    // Privoo Guard. The settings page runs in a webview, so it reads
    // this bridge rather than the main renderer's preload.
    // Privoo AI file attachments - text extraction happens in main.
    aiAttachFile:  ()   => ipcRenderer.invoke('ai-attach-file'),
    aiExtractFile: (fp) => ipcRenderer.invoke('ai-extract-file', fp),

    // Chrome Web Store
    webstoreInstall: (input) => ipcRenderer.invoke('webstore-install', input),
    webstoreParseId: (input) => ipcRenderer.invoke('webstore-parse-id', input),

    protectionStatus: ()     => ipcRenderer.invoke('protection-status'),
    protectionLocate: ()     => ipcRenderer.invoke('protection-locate'),
    // BUG: this was missing, so settings.html's "Check for an existing
    // install" button called undefined, threw, and reported "Could not check
    // for an install" on every machine — including ones with ClamAV present.
    // The main-process handler had been there the whole time.
    protectionDetect: ()     => ipcRenderer.invoke('protection-detect'),

    // Settings -> Appearance -> Pointer. Both handlers existed in main; the
    // page called through to nothing, so choosing a custom pointer threw and
    // the reset button did nothing at all.
    chooseCursorImage: () => ipcRenderer.invoke('choose-cursor-image'),
    clearCursorImage:  () => ipcRenderer.invoke('clear-cursor-image'),

    // Mobile view. main listens with ipcMain.on, so this is a send and not an
    // invoke — the frame told main which webContents to treat as a phone, and
    // the message was never sent, so the device identity was never applied.
    markMobileWebview: (id, device) => ipcRenderer.send('mark-mobile-webview', id, device),
    protectionScan:   (opts) => ipcRenderer.invoke('protection-scan', opts),
    protectionCancel: ()     => ipcRenderer.invoke('protection-cancel'),
    protectionPickTarget: (mode) => ipcRenderer.invoke('protection-pick-target', mode),
    protectionInstall: ()    => ipcRenderer.invoke('protection-install'),
    protectionUpdateSignatures: () => ipcRenderer.invoke('protection-update-signatures'),
    protectionUninstall: ()  => ipcRenderer.invoke('protection-uninstall'),
    protectionQuarantineThreat: (path, threat) => ipcRenderer.invoke('protection-quarantine-threat', path, threat),
    protectionRemoveThreat: (path) => ipcRenderer.invoke('protection-remove-threat', path),
    protectionRevealThreat: (path) => ipcRenderer.invoke('protection-reveal-threat', path),
    protectionActOnThreats: (action, items) => ipcRenderer.invoke('protection-act-on-threats', action, items),
    protectionQuarantineList:    ()   => ipcRenderer.invoke('protection-quarantine-list'),
    protectionQuarantineOpen:    ()   => ipcRenderer.invoke('protection-quarantine-open'),
    protectionQuarantineRestore: (id) => ipcRenderer.invoke('protection-quarantine-restore', id),
    protectionQuarantineDelete:  (id) => ipcRenderer.invoke('protection-quarantine-delete', id),
    protectionQuarantineEmpty:   ()   => ipcRenderer.invoke('protection-quarantine-empty'),
    onProtectionScanEvent: (fn) => ipcRenderer.on('protection-scan-event', (_e, ev) => fn(ev)),
    onProtectionInstallEvent: (fn) => ipcRenderer.on('protection-install-event', (_e, ev) => fn(ev)),
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

    // Identities (privoo://identities)
    identitiesList:       () => ipcRenderer.invoke('identities-list'),
    identitiesSave:       (entry) => ipcRenderer.invoke('identities-save', entry),
    identitiesRemove:     (id) => ipcRenderer.invoke('identities-remove', id),
    identitiesSetDefault: (id) => ipcRenderer.invoke('identities-set-default', id),
    ollamaStatus:         () => ipcRenderer.invoke('ollama-status'),

    // .mariana anonymous hosting (privoo://mariana)
    marianaList:         () => ipcRenderer.invoke('mariana-list'),
    marianaChooseFolder: () => ipcRenderer.invoke('mariana-choose-folder'),
    marianaHost:         (opts) => ipcRenderer.invoke('mariana-host', opts),
    marianaStop:         (id) => ipcRenderer.invoke('mariana-stop', id),
    marianaResume:       (id) => ipcRenderer.invoke('mariana-resume', id),
    marianaRemove:       (id) => ipcRenderer.invoke('mariana-remove', id),

    getDownloads:    ()      => ipcRenderer.invoke('get-downloads'),
    clearDownloads:  ()      => ipcRenderer.invoke('clear-downloads'),
    removeDownload:  (id)    => ipcRenderer.invoke('remove-download', id),
    openDownload:    (p)     => ipcRenderer.invoke('open-download', p),
    showInFolder:    (p)     => ipcRenderer.invoke('show-in-folder', p),
    cancelDownload:  (id)    => ipcRenderer.invoke('cancel-download', id),
    getFileIcon:     (p)     => ipcRenderer.invoke('get-file-icon', p),

    getSuggestions: (q, eng) => ipcRenderer.invoke('search-suggestions', { query: q, engine: eng }),
    // The new tab's search bar had only ever had the remote search engine to
    // suggest from, so it could not offer you a page you visit every day —
    // the address bar could, from the same store, over this same handler.
    historyAutocomplete: (prefix) => ipcRenderer.invoke('history-autocomplete', prefix),
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
    // The streaming form, which the fullscreen AI page had no way to reach:
    // main.js has always sent deltas down a per-request channel and the
    // chrome's preload has always had this, but a guest page goes through
    // THIS file, and it only offered the call that waits for the whole reply.
    //
    // The channel name is generated per request so two conversations open at
    // once cannot receive each other's tokens, and the listener is removed
    // when the request settles, however it settles.
    aiChatStream: (payload, onChunk) => {
      const channel = 'ai-stream-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const listener = (_e, delta) => { try { onChunk(delta); } catch {} };
      ipcRenderer.on(channel, listener);
      return ipcRenderer.invoke('ai-chat-stream', { ...payload, _channel: channel })
        .finally(() => ipcRenderer.removeListener(channel, listener));
    },
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

    uiSound: (kind) => ipcRenderer.sendToHost('ui-sound', kind),
    navigate: (url) => ipcRenderer.sendToHost('navigate', url),
    httpNavigate: (url) => ipcRenderer.sendToHost('http-navigate', url),
    openTab:  (url) => ipcRenderer.sendToHost('open-tab', url),
    // Ask the host shell to open its Customize side panel (NTP "pen" button).
    openCustomizePanel: () => ipcRenderer.sendToHost('open-customize-panel'),
    openVpnPanel: () => ipcRenderer.sendToHost('open-vpn-panel'),
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

/* ── Read aloud ──────────────────────────────────────────────────────────
   Settings, Accessibility. Off unless asked for, and it touches nothing at
   all while it is off: no listeners are attached until the setting arrives
   switched on, so a page pays nothing for a feature nobody wants.

   Two ways in. The pointer, for people who can see roughly where the text is
   and want help reading it; and Alt with the arrow keys, which walks the
   page block by block with no pointer at all. The second is the one that
   works without sight, and it is the reason this is more than a novelty.
   ─────────────────────────────────────────────────────────────────────── */
(function readAloud() {
  const synth = window.speechSynthesis;
  if (!synth) return;                       // no engine, nothing to do

  // The smallest units worth reading as one breath. Deliberately not DIV or
  // SECTION: walking up to the nearest of those would read an entire article
  // because someone pointed at one word in it.
  const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,dt,dd,td,th,caption,figcaption,blockquote,' +
                 'label,summary,legend,a,button,[role="button"],[role="link"],[role="heading"]';
  const MAX = 700;                          // one hover should not read an essay

  let on = false, useKeys = true, rate = 1;
  let hoverTimer = null, current = null, order = null, at = -1;

  const isTop = (() => { try { return window.top === window; } catch { return false; } })();

  function mark(el) {
    if (current === el) return;
    if (current) { try { current.removeAttribute('data-privoo-reading'); } catch {} }
    current = el;
    if (current) { try { current.setAttribute('data-privoo-reading', ''); } catch {} }
  }

  function stop() {
    try { synth.cancel(); } catch {}
    mark(null);
  }

  function textOf(el) {
    if (!el) return '';
    // An icon-only control has no text but does have a name, and the name is
    // the whole point of reading it out.
    const label = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt'));
    const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    const out = t || (label || '').trim();
    return out.length > MAX ? out.slice(0, MAX) + '\u2026' : out;
  }

  function say(el) {
    const text = textOf(el);
    if (!text) return;
    stop();
    mark(el);
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    // No voice is chosen on purpose. getVoices() is populated asynchronously
    // and is empty on the first call in a fresh renderer, so picking one here
    // would silently fall back to nothing on the very first thing you hover.
    // Leaving it unset uses the system default, which is already the voice
    // the user configured for everything else.
    u.onend = () => { if (current === el) mark(null); };
    try { synth.speak(u); } catch {}
  }

  // Containers that are only worth reading when they hold the text
  // THEMSELVES. Privoo's own pages are built out of these — a setting's
  // explanation is a <div class="desc"> — so leaving them out meant the
  // browser read its own buttons and not its own writing.
  const TEXTY = 'div,span,section,article,aside,header,footer,main,figure,figcaption';

  // Children that mean "this element is a container, not the text itself".
  // Deliberately NOT span: a span is an inline wrapper around a phrase, the
  // same as <b> or <code>, and a sentence containing one is still a sentence.
  // Having span here meant every description with an emphasised word in it
  // went back to reading nothing at all.
  const SPLITS = 'div,section,article,aside,header,footer,main,figure';

  /**
   * A div or span that is the end of the line: it has text, and it holds
   * nothing that would be read on its own.
   *
   * That is what keeps the article problem away. Adding div to the block
   * list would mean pointing at one word walks up to the nearest div and
   * reads everything under it; this walks up only until it reaches something
   * whose text is its own.
   */
  function isLeafText(el) {
    if (!el.matches || !el.matches(TEXTY)) return false;
    const t = textOf(el);
    if (!t || t.length > 600) return false;
    // Holds a paragraph, a heading, a link: those get read on their own.
    try { if (el.querySelector(BLOCKS)) return false; } catch { return false; }
    // Holds another container with text of its own — a row holding a label
    // and a description is not the thing to read, either of its two children
    // is.
    for (const c of el.children) {
      if (c.matches && c.matches(SPLITS) && textOf(c)) return false;
    }
    return true;
  }

  function isReadable(el) {
    if (!el || !el.matches || !textOf(el)) return false;
    return el.matches(BLOCKS) || isLeafText(el);
  }

  /**
   * The largest enclosing thing that is still one piece of writing.
   *
   * Returning the first match walking up would read a bolded phrase and stop,
   * because the <span> around it is readable on its own. Carrying on to the
   * top and keeping the outermost gives the whole sentence — and cannot run
   * away with the page, because anything holding paragraphs or rows is not a
   * leaf and so is never readable in the first place.
   */
  function blockFor(node) {
    let el = node && node.nodeType === 3 ? node.parentElement : node;
    let best = null;
    while (el && el !== document.body && el !== document.documentElement) {
      if (isReadable(el)) best = el;
      el = el.parentElement;
    }
    return best;
  }

  // Used by the keyboard walk to keep only outermost matches, so stepping
  // lands on the same things hovering does rather than visiting a sentence
  // and then each emphasised phrase inside it.
  function hasReadableAncestor(el) {
    let p = el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
      if (isReadable(p)) return true;
      p = p.parentElement;
    }
    return false;
  }

  function onOver(e) {
    clearTimeout(hoverTimer);
    // A short settle: crossing the page to reach something should not read
    // out every paragraph on the way past.
    hoverTimer = setTimeout(() => {
      const el = blockFor(e.target);
      if (el && el !== current) say(el);
    }, 260);
  }

  /* Keyboard stepping. The list is rebuilt on each first press rather than
     cached, because pages change under you and a stale list steps into
     elements that are no longer there. */
  function blocks() {
    // The same set the pointer reads, in document order. Querying both lists
    // at once keeps that order: doing them separately and concatenating would
    // step through every paragraph and then every div.
    return Array.prototype.filter.call(
      document.querySelectorAll(BLOCKS + ',' + TEXTY),
      (el) => {
        if (!isReadable(el)) return false;
        // Skip anything invisible: offsetParent is null for display:none and
        // for anything inside it, which is most of a page's hidden menus.
        if (!el.offsetParent && el !== document.body) return false;
        // Outermost only — the same thing hovering settles on. Without this
        // a list item is stepped through once for the <li> and again for the
        // <a> inside it, and a sentence once for itself and again for every
        // emphasised phrase in it.
        return !hasReadableAncestor(el);
      }
    );
  }

  function step(delta) {
    order = blocks();
    if (!order.length) return;
    at = current ? order.indexOf(current) : -1;
    at = at < 0 ? (delta > 0 ? 0 : order.length - 1)
                : Math.max(0, Math.min(order.length - 1, at + delta));
    const el = order[at];
    say(el);
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch {}
  }

  function editable(el) {
    if (!el || !el.tagName) return false;
    const t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
  }

  function onKey(e) {
    if (e.key === 'Escape' && current) { stop(); return; }
    if (!useKeys || !e.altKey || e.ctrlKey || e.metaKey) return;
    if (editable(e.target)) return;          // Alt+arrow belongs to the field
    if (e.key === 'ArrowDown')      { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); step(-1); }
    else if (e.key === ' ')         { e.preventDefault(); if (current) say(current); }
  }

  let bound = false;
  function bind(want) {
    if (want === bound) return;
    bound = want;
    const fn = want ? 'addEventListener' : 'removeEventListener';
    document[fn]('mouseover', onOver, true);
    if (isTop) document[fn]('keydown', onKey, true);
    if (!want) { clearTimeout(hoverTimer); stop(); }
  }

  function apply(s) {
    if (!s) return;
    on = !!s.readAloud;
    useKeys = s.readAloudKeys !== false;
    rate = Math.max(0.5, Math.min(2, (Number(s.readAloudRate) || 100) / 100));
    bind(on);
  }

  try { ipcRenderer.invoke('get-settings').then(apply).catch(() => {}); } catch {}
  try { ipcRenderer.on('settings-updated', (_e, s) => apply(s)); } catch {}

  // Speech does not stop when a page goes away, so a navigation would leave
  // the previous page still talking over the new one.
  window.addEventListener('pagehide', () => { try { synth.cancel(); } catch {} });
})();
