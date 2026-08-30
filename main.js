const {
  app, BrowserWindow, BrowserView, session, ipcMain, webContents, protocol, net, shell, dialog,
  Menu, Tray, nativeImage, screen, components, nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { pathToFileURL } = require('url');
const profileStore = require('./profile-store');
const settingsStore = require('./settings-store');
const { DOH_PROVIDERS } = settingsStore;

// Compute the DoH server list to hand to Chromium. The 18+ blocker always
// wins over the user's manual provider choice — it routes through a family
// filter regardless. `secureDnsMode: 'secure'` keeps Chromium from ever
// falling back to plaintext system DNS, so no leaks.
// webContents id -> timestamp of the last real user interaction with it.
// Read by the popup guard in setWindowOpenHandler.
const _lastGestureAt = new Map();

function resolveDohServers(settings) {
  if (!settings.dnsOverHttps) return [];
  if (settings.adultContentBlocking) {
    // Prefer Cloudflare Family if the user is on a Cloudflare flavor,
    // otherwise AdGuard Family. Either way it filters adult + malware.
    const key = String(settings.dohProvider || '').startsWith('adguard')
      ? 'adguard-family' : 'cloudflare-family';
    return DOH_PROVIDERS[key].urls;
  }
  // User-provided custom DoH endpoint.
  if (settings.dohProvider === 'custom') {
    const raw = String(settings.customDohUrl || '').trim();
    if (/^https:\/\//i.test(raw)) return [raw];
    // Fall through to Cloudflare if the custom URL is missing / malformed
    // so the user never accidentally falls back to plaintext DNS.
    return DOH_PROVIDERS.cloudflare.urls;
  }
  const provider = DOH_PROVIDERS[settings.dohProvider];
  if (provider && provider.urls.length) return provider.urls;
  // Legacy single-URL fallback for users who set a custom dohServer.
  if (settings.dohServer) return [settings.dohServer];
  return DOH_PROVIDERS.cloudflare.urls;
}
const historyStore  = require('./history-store');
const downloadStore = require('./download-store');
const sessionStore = require('./session-store');
const ytdlp = require('./ytdlp');
const browserImport = require('./browser-import');
const { isBlockedHost } = require('./blocklist');
const { isAdultDomain, buildSafeModeScript } = require('./safety');
const { buildGoogleSpoofScript } = require('./google-spoof');
const { startGoogleSignIn, buildPostSignInUrl, isGoogleSignInUrl } = require('./google-auth');
const { buildGooglePasswordPreferScript } = require('./password-autofill');
const passwordStore = require('./password-store');
const identitiesStore = require('./identities-store');
const mariana = require('./mariana');
const aiBrowser = require('./ai');

// ---------------------------------------------------------------------------
// Per-profile isolation — when Privoo is launched into a named profile via
// `--privoo-profile=<id>`, redirect Chromium's ENTIRE userData directory to
// that profile's folder. This isolates cookies, cache, logins, localStorage,
// history and settings completely. Must run at module load, before app ready
// (the userData path is locked once Chromium starts). profile-store captured
// the real root above, so the shared profiles registry still resolves there.
(function applyProfileUserData() {
  try {
    const arg = process.argv.find((a) => a.startsWith('--privoo-profile='));
    if (!arg) return;
    const id = arg.split('=')[1];
    if (!id || id === 'default') return;
    const dir = profileStore.getProfileDataDir(id);
    fs.mkdirSync(dir, { recursive: true });
    app.setPath('userData', dir);
  } catch (e) {
    console.warn('Privoo: profile userData redirect failed:', e.message);
  }
})();

const loadedExtensionIds = new Map();
let extensionPopupWin = null;
let googleAuthWin = null;
let profilePickerWin = null;

function parentWinForGuest(contents) {
  const host = contents.hostWebContents;
  if (!host || host.isDestroyed()) return null;
  return BrowserWindow.fromWebContents(host);
}

// Google auth functions removed - sign-in now works directly in webview

// ---------------------------------------------------------------------------
// Widevine CDM — detect from local Chrome install and load before app ready
// ---------------------------------------------------------------------------
// IMPORTANT: this is a fallback for STOCK Electron only. Privoo ships on
// castLabs' Electron fork (see package.json — the `+wvcus` build), which
// already provides a proper, VMP-signable Widevine CDM via the `components`
// API (see components.whenReady() further down + afterPack-vmp.js). Passing
// --widevine-cdm-path/--widevine-cdm-version here would REPLACE that CDM with
// whatever Chrome happens to be installed locally — one that was never VMP
// signed by our build, and whose CDM Host API may not even match this
// Chromium version. Widevine then reports as an unverified media path, so
// DRM services (Spotify, Netflix, etc.) throttle robustness or refuse to
// issue a license outright. That silently broke Spotify DRM despite the
// castLabs + EVS signing pipeline being fully wired up. Only run this
// borrow-from-Chrome path when `components` doesn't exist at all (i.e. we're
// somehow running on stock Electron), so it can never shadow the real CDM.
if (!components) (function loadWidevine() {
  try {
    const candidates = [];
    if (process.platform === 'win32') {
      const dirs = [
        path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application'),
        path.join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application'),
        path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application'),
      ];
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        const versions = fs.readdirSync(dir)
          .filter(d => /^\d+\.\d+\.\d+\.\d+$/.test(d))
          .sort((a, b) => { const p = s => s.split('.').map(Number); const [A,B] = [p(a),p(b)]; return B[0]-A[0]||B[1]-A[1]||B[2]-A[2]||B[3]-A[3]; });
        for (const ver of versions) {
          const dll = path.join(dir, ver, 'WidevineCdm', '_platform_specific', 'win_x64', 'widevinecdm.dll');
          if (!fs.existsSync(dll)) continue;
          let wvVer = ver;
          try { wvVer = JSON.parse(fs.readFileSync(path.join(dir, ver, 'WidevineCdm', 'manifest.json'), 'utf8')).version || ver; } catch {}
          candidates.push({ dll, version: wvVer });
          break;
        }
      }
    } else if (process.platform === 'darwin') {
      const macBases = [
        path.join(process.env.HOME || '', 'Library', 'Application Support', 'Google', 'Chrome'),
        path.join(process.env.HOME || '', 'Library', 'Application Support', 'Chromium'),
        '/Library/Application Support/Google/Chrome',
      ];
      for (const base of macBases) {
        if (!fs.existsSync(base)) continue;
        const versions = fs.readdirSync(base).filter(d => /^\d+\.\d+\.\d+\.\d+$/.test(d))
          .sort((a, b) => { const p = s => s.split('.').map(Number); const [A,B] = [p(a),p(b)]; return B[0]-A[0]||B[1]-A[1]||B[2]-A[2]||B[3]-A[3]; });
        for (const ver of versions) {
          const arch = process.arch === 'arm64' ? 'mac_arm64' : 'mac_x64';
          const lib = path.join(base, ver, 'WidevineCdm', '_platform_specific', arch, 'widevinecdm.dylib');
          if (!fs.existsSync(lib)) continue;
          let wvVer = ver;
          try { wvVer = JSON.parse(fs.readFileSync(path.join(base, ver, 'WidevineCdm', 'manifest.json'), 'utf8')).version || ver; } catch {}
          candidates.push({ dll: lib, version: wvVer });
          break;
        }
        if (candidates.length) break;
      }
    } else if (process.platform === 'linux') {
      const linuxDirs = [
        '/usr/lib/chromium-browser',
        '/usr/lib/chromium',
        '/opt/google/chrome',
        '/usr/lib/google-chrome',
        path.join(process.env.HOME || '', '.config', 'google-chrome'),
      ];
      for (const dir of linuxDirs) {
        const lib = path.join(dir, 'libwidevinecdm.so');
        const lib2 = path.join(dir, 'WidevineCdm', '_platform_specific', 'linux_x64', 'libwidevinecdm.so');
        const found = [lib, lib2].find(p => fs.existsSync(p));
        if (found) { candidates.push({ dll: found, version: '4.10.0.0' }); break; }
      }
    }
    if (candidates.length) {
      app.commandLine.appendSwitch('widevine-cdm-path', candidates[0].dll);
      app.commandLine.appendSwitch('widevine-cdm-version', candidates[0].version);
      console.log(`Privoo: Widevine CDM loaded (${candidates[0].version})`);
    }
  } catch (e) {
    console.warn('Privoo: Widevine detection failed:', e.message);
  }
})();

// Waits for the castLabs-managed Widevine CDM component to actually be ready,
// with retries and a generous total budget instead of one short race. Runs
// once at startup, before any window is created — see the call site for why.
//
// `whenReady()` resolving is not treated as sufficient on its own: we also
// require `components.status()[WIDEVINE_CDM_ID].version` to be a non-null
// string, since that's the one field the typings document as only being set
// once a component is actually installed. Logs a diagnostic snapshot on every
// attempt so a failure here is visible in the log rather than a silent
// "DRM just doesn't work" report from a user.
async function waitForWidevineReady() {
  const id = components.WIDEVINE_CDM_ID;
  const maxAttempts = 4;
  const perAttemptTimeoutMs = 20000; // 4 x 20s = 80s worst case, vs. the old flat 15s
  const startedAt = Date.now();

  function snapshot() {
    try {
      const s = components.status ? components.status()[id] : null;
      return s ? { status: s.status, version: s.version, title: s.title } : null;
    } catch {
      return null;
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartedAt = Date.now();
    let outcome = 'timeout';
    let results = null;
    let error = null;

    try {
      results = await Promise.race([
        components.whenReady([id]).then((r) => { outcome = 'resolved'; return r; }),
        new Promise((res) => setTimeout(res, perAttemptTimeoutMs)),
      ]);
    } catch (e) {
      outcome = 'rejected';
      error = e;
    }

    const elapsed = Date.now() - attemptStartedAt;
    const total = Date.now() - startedAt;
    const snap = snapshot();

    if (outcome === 'rejected') {
      // ComponentsError carries per-component detail in `.errors` — log each
      // one instead of a single flattened message, since with more than one
      // registered component it's otherwise unclear which one actually failed.
      const details = Array.isArray(error && error.errors)
        ? error.errors.map((e2) => `${e2.detail?.id ?? '?'}:${e2.detail?.status ?? e2.message}`).join(', ')
        : (error && error.message) || String(error);
      console.warn(
        `Privoo: Widevine attempt ${attempt}/${maxAttempts} rejected after ${elapsed}ms ` +
        `(total ${total}ms) — ${details}. status: ${JSON.stringify(snap)}`
      );
    } else if (outcome === 'timeout') {
      console.warn(
        `Privoo: Widevine attempt ${attempt}/${maxAttempts} timed out after ${elapsed}ms ` +
        `(total ${total}ms). status: ${JSON.stringify(snap)}`
      );
    } else if (snap && snap.version) {
      // whenReady() resolved AND status() confirms a version is actually installed.
      console.log(
        `Privoo: Widevine ready after ${total}ms (attempt ${attempt}/${maxAttempts}) — ` +
        `version ${snap.version}, status "${snap.status}"`
      );
      return;
    } else {
      // whenReady() resolved but status() still shows no installed version —
      // this is exactly the gap the old code didn't check for. Retry rather
      // than trust the resolve.
      console.warn(
        `Privoo: Widevine attempt ${attempt}/${maxAttempts} resolved but reported no ` +
        `installed version after ${elapsed}ms (total ${total}ms). status: ${JSON.stringify(snap)}. ` +
        `Results: ${JSON.stringify(results)}`
      );
    }
  }

  console.warn(
    `Privoo: Widevine CDM never confirmed ready after ${maxAttempts} attempts / ` +
    `${Date.now() - startedAt}ms. Opening the window anyway — DRM playback ` +
    `(Spotify, Netflix, etc.) may fail or cut out shortly after starting. ` +
    `Last known status: ${JSON.stringify(snapshot())}`
  );
}

// Remove the navigator.webdriver flag Chromium sets in automated contexts —
// Google's sign-in page refuses login when it detects this flag.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Suppress the OS-native passkey UI (Windows Hello / Touch ID) for the
// "platform authenticator" path while keeping plain WebAuthn around so
// OAuth token transport (Google gsi/transform, Microsoft, GitHub) keeps
// working — those flows don't request a platform authenticator. The JS
// override in webview-preload finishes the job by short-circuiting any
// publicKey request that asks for a platform-attached authenticator, so
// sites cleanly fall back to password without ever popping the OS picker.
app.commandLine.appendSwitch('disable-features', [
  'WebAuthenticationUseNativeWinApi', // stops Windows Hello prompts
  'WebAuthnConditionalUI',            // stops autofill-passkey suggestions
  'WebAuthenticationChromeOSAuthenticator',
  'WebAuthenticationMacPlatformAuthenticator',
].join(','));

// Treat Privoo as a regular browser, not an automation tool
app.commandLine.appendSwitch('no-first-run');
app.commandLine.appendSwitch('no-default-browser-check');

// Load settings early — hardwareAcceleration and lowEndDevice must be known
// before the GPU process starts; calling disableHardwareAcceleration() or
// setting num-raster-threads after app-ready has no effect.
let _earlySettings = {};
try {
  _earlySettings = settingsStore.load();
  if (_earlySettings.hardwareAcceleration === false) app.disableHardwareAcceleration();
} catch { /* settings file may not exist yet on first run */ }

// GPU: use Chromium's own defaults. We deliberately force NOTHING here.
//
// This block used to set `ignore-gpu-blocklist`, `enable-gpu-rasterization`,
// `enable-zero-copy` and `CanvasOopRasterization` in an attempt to FIX black
// YouTube frames. They were causing them. `ignore-gpu-blocklist` in particular
// overrides the blocklist Chromium maintains precisely because those GPU/driver
// combinations have broken video decode — the result is the classic "player is
// empty, then a black frame on refresh, then it finally plays ~30s later once
// Chromium gives up and falls back to software decode".
//
// Chromium already enables GPU rasterization by default wherever it's safe, so
// dropping these overrides costs nothing on healthy hardware and stops forcing
// the broken paths on everyone else. Users who still hit driver bugs can turn
// off hardware acceleration in Settings -> Performance (handled above).
if (_earlySettings.lowEndDevice) {
  app.commandLine.appendSwitch('num-raster-threads', '1');
}

// The ONE exception to "force nothing" above, and it is a disable, not a
// force-enable — which is why it does not carry the risk the removed flags did.
//
// On Windows with DirectComposition, Chromium hands decoded video straight to a
// hardware overlay plane. On several NVIDIA driver branches that plane is never
// composited into the visible surface: audio plays, the picture stays black,
// and a refresh or a window resize fixes it. `app.getGPUInfo('complete')` on an
// affected machine reports exactly the setup that triggers it:
//     directComposition: true, supportsOverlays: true, nv12OverlaySupport: SCALING
//
// Measured on an affected machine (RTX 4060, driver 32.0.16.1088) via
// app.getGPUInfo('complete'):
//
//                        default        with this switch
//   directComposition    true           false
//   supportsOverlays     true           false
//   nv12OverlaySupport   SCALING        NONE
//   gpu_compositing      enabled        enabled     <- kept
//   video_decode         enabled        enabled     <- kept
//   rasterization        enabled        enabled     <- kept
//
// So this costs us the overlay presentation path and nothing else: hardware
// decode, GPU compositing and rasterization all stay on. The frame simply takes
// the normal composited route instead of a dedicated hardware plane.
//
// NOTE ON THE SWITCH NAME: the narrower `disable-direct-composition-video-overlays`
// is NOT recognised in this Chromium — verified by checking the gpu-process
// command line, which Chromium populates only with switches it forwards.
// `disable-blink-features` and `disable-features` show up there; the video-overlays
// one never does, on any process. `disable-direct-composition` does. Do not
// "improve" this to the narrower name without re-checking that.
//
// Worth knowing for anyone debugging this later: you cannot detect this failure
// from page JS. Sampling the <video> into a canvas returns the DECODED frame,
// which is perfectly fine — the black happens downstream at presentation. Any
// in-page "is the frame black?" check will see a healthy image and do nothing.
if (_earlySettings.videoOverlayCompat !== false) {
  app.commandLine.appendSwitch('disable-direct-composition');
}

// ---------------------------------------------------------------------------
// Single-instance lock + default-browser registration
// ---------------------------------------------------------------------------
// A browser MUST be single-instance: when the OS opens an http(s) link or an
// .html/.pdf file, it relaunches Privoo's exe with the URL/path as an
// argument. We grab a lock so that relaunch routes into the already-running
// window instead of spawning a second copy.
const _singleInstanceLock = app.requestSingleInstanceLock();
if (!_singleInstanceLock) {
  app.quit();
} else {
  // Register Privoo as a handler for the web protocols + mailto. This is what
  // makes Windows / macOS / Linux list Privoo under "Default apps" so the
  // user can actually pick it as their default browser.
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      // Dev mode (`electron .`) — pass the script path so the OS relaunches
      // us correctly.
      app.setAsDefaultProtocolClient('http',  process.execPath, [path.resolve(process.argv[1])]);
      app.setAsDefaultProtocolClient('https', process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('https');
    }
    app.setAsDefaultProtocolClient('mailto');
  } catch (e) {
    console.warn('Privoo: protocol client registration failed:', e.message);
  }

  // Write the full StartMenuInternet registry subtree so Windows shows
  // Privoo in Settings > Default apps as a choosable browser.
  // setAsDefaultProtocolClient alone does NOT write these keys.
  if (process.platform === 'win32' && app.isPackaged) {
    registerWindowsBrowserCapabilities();
  }
}

function registerWindowsBrowserCapabilities() {
  try {
    const { spawnSync } = require('child_process');
    const exe     = process.execPath;
    const exeCmd  = `"${exe}"`;
    const icon0   = `"${exe}",0`;
    const CAP     = 'Software\\Clients\\StartMenuInternet\\Privoo\\Capabilities';
    const entries = [
      // ProgID: HTML files
      ['HKCU\\Software\\Classes\\PrivooBrowserHTM', '/ve', '/d', 'Privoo HTML Document', '/f'],
      ['HKCU\\Software\\Classes\\PrivooBrowserHTM\\DefaultIcon', '/ve', '/d', icon0, '/f'],
      ['HKCU\\Software\\Classes\\PrivooBrowserHTM\\shell\\open\\command', '/ve', '/d', `${exeCmd} "%1"`, '/f'],
      // ProgID: URL protocols
      ['HKCU\\Software\\Classes\\PrivooBrowser', '/ve', '/d', 'Privoo URL', '/f'],
      ['HKCU\\Software\\Classes\\PrivooBrowser', '/v', 'URL Protocol', '/d', '', '/f'],
      ['HKCU\\Software\\Classes\\PrivooBrowser\\DefaultIcon', '/ve', '/d', icon0, '/f'],
      ['HKCU\\Software\\Classes\\PrivooBrowser\\shell\\open\\command', '/ve', '/d', `${exeCmd} "%1"`, '/f'],
      // StartMenuInternet entry
      ['HKCU\\Software\\Clients\\StartMenuInternet\\Privoo', '/ve', '/d', 'Privoo', '/f'],
      ['HKCU\\Software\\Clients\\StartMenuInternet\\Privoo\\DefaultIcon', '/ve', '/d', icon0, '/f'],
      ['HKCU\\Software\\Clients\\StartMenuInternet\\Privoo\\shell\\open\\command', '/ve', '/d', exeCmd, '/f'],
      // Capabilities
      [`HKCU\\${CAP}`, '/v', 'ApplicationDescription', '/d', 'Private, fast browsing with built-in ad blocking and tracking protection.', '/f'],
      [`HKCU\\${CAP}`, '/v', 'ApplicationIcon', '/d', icon0, '/f'],
      [`HKCU\\${CAP}`, '/v', 'ApplicationName', '/d', 'Privoo', '/f'],
      // File associations
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.htm',   '/d', 'PrivooBrowserHTM', '/f'],
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.html',  '/d', 'PrivooBrowserHTM', '/f'],
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.shtml', '/d', 'PrivooBrowserHTM', '/f'],
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.xhtml', '/d', 'PrivooBrowserHTM', '/f'],
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.xht',   '/d', 'PrivooBrowserHTM', '/f'],
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.webp',  '/d', 'PrivooBrowserHTM', '/f'],
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.svg',   '/d', 'PrivooBrowserHTM', '/f'],
      [`HKCU\\${CAP}\\FileAssociations`, '/v', '.pdf',   '/d', 'PrivooBrowserHTM', '/f'],
      // URL associations
      [`HKCU\\${CAP}\\URLAssociations`, '/v', 'http',   '/d', 'PrivooBrowser', '/f'],
      [`HKCU\\${CAP}\\URLAssociations`, '/v', 'https',  '/d', 'PrivooBrowser', '/f'],
      [`HKCU\\${CAP}\\URLAssociations`, '/v', 'ftp',    '/d', 'PrivooBrowser', '/f'],
      [`HKCU\\${CAP}\\URLAssociations`, '/v', 'mailto', '/d', 'PrivooBrowser', '/f'],
      // RegisteredApplications pointer
      ['HKCU\\Software\\RegisteredApplications', '/v', 'Privoo', '/d', CAP, '/f'],
    ];
    for (const [key, ...args] of entries) {
      spawnSync('reg', ['add', key, ...args], { windowsHide: true });
    }
  } catch (e) {
    console.warn('Privoo: Windows browser capabilities registration failed:', e.message);
  }
}

// Pull a navigable URL or local file path out of a process argv array.
// Used both for the initial launch and for `second-instance` relaunches.
function urlFromArgv(argv) {
  if (!Array.isArray(argv)) return '';
  for (const raw of argv.slice(1)) {
    if (!raw || raw.startsWith('--') || raw.startsWith('-')) continue;
    // A web URL passed by the OS protocol handler.
    if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
    // A local file the OS asked us to open (.html, .pdf, etc).
    try {
      if (fs.existsSync(raw) && fs.statSync(raw).isFile()) {
        return pathToFileURL(raw).toString();
      }
    } catch { /* not a path */ }
  }
  return '';
}
// URL Privoo was launched with (if any) — consumed once the first window
// finishes loading.
let _pendingLaunchUrl = urlFromArgv(process.argv);

// Suppress noisy Electron internals:
//   - "Script failed to execute" — executeJavaScript races during nav
//   - "ERR_ABORTED (-3)" — our HTTPS-upgrade preventDefault aborts the
//     original navigation, which is intended (we re-issue as https://)
//     but Electron logs the aborted IPC call as an error.
// A throw that reaches the top of the main process takes the whole browser
// down with every open tab. Log it and stay up: a broken feature is better
// than losing the window.
process.on('uncaughtException', (err) => {
  const msg = (err && (err.stack || err.message)) || String(err);
  console.error('Privoo: uncaught exception in the main process:', msg);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason && (reason.message || String(reason));
  if (!msg) return;
  if (/Script failed to execute/i.test(msg)) return;
  if (/ERR_ABORTED/i.test(msg)) return;
  // Navigation -> download handoff (server returns Content-Disposition).
  // Chromium aborts the page load with ERR_FAILED, the download still
  // proceeds via the session's will-download handler, so the rejection is
  // benign noise — same category as ERR_ABORTED.
  if (/ERR_FAILED/i.test(msg) && /loading/i.test(msg)) return;
  console.warn('Privoo unhandled rejection:', msg);
});

// Same noise also comes through console.error from the GUEST_VIEW_MANAGER_CALL
// IPC handler when a webview's loadURL gets cancelled. Patch console.error
// to drop those specific lines.
const _origConsoleError = console.error.bind(console);
const _origConsoleWarn = console.warn.bind(console);
const _isBenignExtensionNoise = (joined) => (
  // Electron's extension loader prints these whenever an MV2 extension
  // references chrome.* APIs we don't implement. They're informational —
  // there's no action the user can take, so they shouldn't pollute the
  // terminal output of a shipping app.
  /Manifest version 2 is deprecated/i.test(joined) ||
  /Permission '\w+' is unknown or URL pattern is malformed/i.test(joined) ||
  /Unrecognized manifest key/i.test(joined) ||
  /'?manifest_version'?.*invalid/i.test(joined)
);
// Anything we want silenced regardless of whether Electron prints it via
// console.error or console.warn lives here. Centralised so the two
// interceptors below stay in sync.
function _isBenignNavigationNoise(joined) {
  if (/GUEST_VIEW_MANAGER_CALL.*ERR_(ABORTED|FAILED|BLOCKED_BY_CLIENT)/i.test(joined)) return true;
  if (/ERR_ABORTED \(-3\)/i.test(joined)) return true;
  if (/ERR_FAILED \(-2\)/i.test(joined) && /loading/i.test(joined)) return true;
  if (/Failed to load URL:.*ERR_(ABORTED|FAILED|BLOCKED_BY_CLIENT)/i.test(joined)) return true;
  if (/electron.*Failed to load URL.*ERR_/i.test(joined)) return true;
  // Chromium disk-cache self-heal noise — it recreates the cache on its own,
  // nothing the user can act on. Happens after an unclean shutdown or when
  // multiple sessions touch the cache dir.
  if (/disk_cache.*Invalid cache/i.test(joined)) return true;
  if (/backend_impl\.cc.*cache/i.test(joined)) return true;
  // Transient TLS/socket noise — a remote server closed the connection
  // mid-handshake (flaky network, server hiccup, captive portal). Chromium
  // retries or shows its own error page; the raw socket log is just noise.
  if (/ssl_client_socket.*handshake failed/i.test(joined)) return true;
  if (/handshake failed; returned/i.test(joined)) return true;
  if (/net_error -(100|101|102|105|118|2)\b/i.test(joined)) return true;
  if (/ERR_(CONNECTION_CLOSED|CONNECTION_RESET|SSL_PROTOCOL_ERROR|TIMED_OUT|NETWORK_CHANGED)/i.test(joined)) return true;
  return false;
}
console.error = (...args) => {
  try {
    const joined = args.map(a => (a && a.message) || String(a)).join(' ');
    if (_isBenignNavigationNoise(joined)) return;
    if (_isBenignExtensionNoise(joined)) return;
  } catch {}
  _origConsoleError(...args);
};
console.warn = (...args) => {
  try {
    const joined = args.map(a => (a && a.message) || String(a)).join(' ');
    if (_isBenignNavigationNoise(joined)) return;
    if (_isBenignExtensionNoise(joined)) return;
  } catch {}
  _origConsoleWarn(...args);
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const RENDERER_DIR = path.join(__dirname, 'renderer');
const INTERNAL_DIR = path.join(RENDERER_DIR, 'internal');

const INTERNAL_PAGES = {
  newtab:     'newtab.html',
  settings:   'settings.html',
  downloads:  'downloads.html',
  history:    'history.html',
  extensions: 'extensions.html',
  bookmarks:  'bookmarks.html',
  insecure:   'insecure.html',
  upgrading:  'upgrading.html',
  error:      'error.html',
  blocked:    'blocked.html',
  incognito:  'incognito.html',
  ai:         'ai.html',
  news:       'news.html',
  identities: 'identities.html',
  mariana:    'mariana.html',
  privacy:    'privacy.html',
  terms:      'terms.html',
};

// Pin Chrome identity centrally. It must match Electron's bundled Chromium
// version so UA, Client Hints, and navigator.userAgentData all agree.
const CHROME_VERSION_FULL = process.versions.chrome || '142.0.0.0';
const CHROME_MAJOR = CHROME_VERSION_FULL.split('.')[0];

function buildChromeUA() {
  const v = CHROME_VERSION_FULL;
  if (process.platform === 'darwin') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
  }
  if (process.platform === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
}

function buildSecChUaPlatform() {
  if (process.platform === 'darwin') return '"macOS"';
  if (process.platform === 'linux') return '"Linux"';
  return '"Windows"';
}

const CHROME_UA = buildChromeUA();
try { app.userAgentFallback = CHROME_UA; } catch { /* older Electron */ }

// Native User-Agent Client Hints. Pushed via CDP (Network.setUserAgentOverride)
// so navigator.userAgentData and its getHighEntropyValues() stay *native* —
// no JS getter, no own-accessor on navigator. This is what lets us hand TikTok
// a pristine environment: Electron's own userAgentData otherwise leaks the app
// brand ("Privoo"), while a JS override leaks as a non-native function. The CDP
// route is the only way to report clean Chrome client hints that survive
// webmssdk's "is this property native?" checks.
const UA_PLATFORM = process.platform === 'darwin' ? 'macOS' : process.platform === 'linux' ? 'Linux' : 'Windows';
const UA_PLATFORM_VERSION = process.platform === 'darwin' ? '14.0.0' : process.platform === 'linux' ? '6.5.0' : '15.0.0';
const UA_METADATA = {
  brands: [
    { brand: 'Not_A Brand', version: '24' },
    { brand: 'Chromium', version: String(CHROME_MAJOR) },
    { brand: 'Google Chrome', version: String(CHROME_MAJOR) },
  ],
  fullVersionList: [
    { brand: 'Not_A Brand', version: '24.0.0.0' },
    { brand: 'Chromium', version: CHROME_VERSION_FULL },
    { brand: 'Google Chrome', version: CHROME_VERSION_FULL },
  ],
  fullVersion: CHROME_VERSION_FULL,
  platform: UA_PLATFORM,
  platformVersion: UA_PLATFORM_VERSION,
  architecture: 'x86',
  model: '',
  mobile: false,
  bitness: '64',
  wow64: false,
};

// Mobile emulation used by the sidebar web panel and Mobile View. Three
// separate layers otherwise force every webview back to the desktop
// identity: contents.setUserAgent(CHROME_UA) on creation, the CDP
// Network.setUserAgentOverride in each webview's spoof setup, and the
// session wide User-Agent/Client Hints header rewrite (when "spoof user
// agent" is on). webContentsIds tracked in _mobileEmulatedDevices are
// exempted from all three and get the matching device profile instead.
const _mobileEmulatedDevices = new Map();
const MOBILE_DEVICE_PROFILES = {
  samsung: {
    ua: `Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION_FULL} Mobile Safari/537.36`,
    clientHints: true,
    metadata: {
      brands: UA_METADATA.brands,
      fullVersionList: UA_METADATA.fullVersionList,
      fullVersion: CHROME_VERSION_FULL,
      platform: 'Android',
      platformVersion: '14.0.0',
      architecture: '',
      model: 'SM-S928B',
      mobile: true,
      bitness: '',
      wow64: false,
    },
    secChUaPlatform: '"Android"',
    secChUaModel: '"SM-S928B"',
  },
  iphone: {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    clientHints: false,
  },
};
function mobileProfileFor(id) {
  const device = _mobileEmulatedDevices.get(id);
  return MOBILE_DEVICE_PROFILES[device] || MOBILE_DEVICE_PROFILES.samsung;
}
// Built once — depends only on the runtime Chromium version + host platform.
// Reused for webview guests and OAuth popups so both get spoofed identically.
const SPOOF_SCRIPT = buildGoogleSpoofScript({
  chromeVersion: CHROME_VERSION_FULL,
  platform: process.platform,
});
// Preload for OAuth / "Sign in with X" popup windows. It injects the same
// spoof into the popup's main world at document-start — guaranteed to run
// before the OAuth page's inline detection scripts, which the CDP attach
// couldn't always beat (the cause of the intermittent "browser may not be
// secure" only on popup *windows*, never the in-tab flow).
const OAUTH_PRELOAD = path.join(__dirname, 'oauth-preload.js');

// ── Preferred language ────────────────────────────────────────────────────
// Sites pick a language from the Accept-Language header and/or the request IP.
// Behind a VPN the IP belongs to the exit node (e.g. Germany), so without a
// firm Accept-Language the user gets German pages. We pin Accept-Language and
// navigator.languages to the *device* locale so content follows the user, not
// the VPN. Computed lazily — app locale APIs need the app to be ready.
// Normalise a BCP-47 tag to the clean "language" or "language-REGION" form
// that a real Chrome sends. Windows' getPreferredSystemLanguages() can return
// tags with a SCRIPT subtag (e.g. "en-Latn-GB", "zh-Hans-CN") or other extras
// that Chrome strips — leaving them in navigator.languages / Accept-Language
// makes Google's sign-in flag the browser as "not secure". We keep only the
// language + the first genuine region subtag (2 letters or a 3-digit UN M.49
// code) and drop 4-letter script subtags and everything else.
function normalizeLangTag(tag) {
  const parts = String(tag || '').trim().replace(/_/g, '-').split('-').filter(Boolean);
  if (!parts.length) return '';
  const lang = parts[0].toLowerCase();
  if (!/^[a-z]{2,3}$/.test(lang)) return '';
  let region = '';
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (/^[A-Za-z]{2}$/.test(p) || /^\d{3}$/.test(p)) { region = p.toUpperCase(); break; }
  }
  return region ? `${lang}-${region}` : lang;
}

let _langList = null;
let _langKey = null;
function preferredLanguageList() {
  const pref = (() => {
    try { return settingsStore.load().preferredLanguage || 'auto'; } catch { return 'auto'; }
  })();
  if (_langList && _langKey === pref) return _langList;
  let langs = [];
  let ready = true;
  if (pref && pref !== 'auto') {
    // Explicit user choice (e.g. 'en-GB', 'de', 'fr').
    langs = [pref];
  } else {
    ready = false;
    try { langs = app.getPreferredSystemLanguages() || []; ready = !!(app.isReady && app.isReady()); } catch { /* not ready */ }
    if (!langs.length) { try { const l = app.getLocale(); if (l) langs = [l]; } catch {} }
  }
  if (!langs.length) langs = ['en-GB', 'en'];
  const seen = new Set();
  const out = [];
  for (const raw of langs) {
    const l = normalizeLangTag(raw);
    if (!l) continue;
    if (!seen.has(l)) { seen.add(l); out.push(l); }
    const base = l.split('-')[0];
    if (base && base !== l && !seen.has(base)) { seen.add(base); out.push(base); }
    // Chrome sends a short list — cap it so an OS with many display languages
    // doesn't produce an unusually long Accept-Language that also looks off.
    if (out.length >= 4) break;
  }
  if (!out.length) out.push('en');
  // Only cache once we have a definitive answer. For 'auto' before app-ready
  // the system-language query can come back empty, and we don't want that
  // temporary fallback pinned for the rest of the session.
  if (pref !== 'auto' || ready) { _langList = out; _langKey = pref; }
  return out;
}
// HTTP Accept-Language header value with descending q-weights.
function acceptLanguageHeader() {
  return preferredLanguageList()
    .map((l, i) => (i === 0 ? l : `${l};q=${Math.max(1 - i * 0.1, 0.1).toFixed(1)}`))
    .join(',');
}

const SEC_CH_UA_PLATFORM = buildSecChUaPlatform();
const SEC_CH_UA =
  `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not_A Brand";v="24"`;
const SEC_CH_UA_FULL_VERSION_LIST =
  `"Chromium";v="${CHROME_VERSION_FULL}", "Google Chrome";v="${CHROME_VERSION_FULL}", "Not_A Brand";v="24.0.0.0"`;
const SEC_CH_UA_PLATFORM_VERSION =
  process.platform === 'darwin' ? '"14.0.0"'
    : process.platform === 'linux' ? '"6.5.0"'
      : '"15.0.0"';

// Lifetime privacy counters. These are PERSISTED: they used to live only in
// memory, so every relaunch silently reset the Privacy Shield numbers to zero
// and the panel looked like it was never counting anything. `since` is the
// first time we started counting, so the UI can say what period it covers.
const stats = { blockedAds: 0, blockedCookies: 0, upgradedHttps: 0, since: Date.now() };

function statsFilePath() {
  return path.join(profileStore.getDataDir(), 'privoo-stats.json');
}
function loadStats() {
  try {
    const raw = JSON.parse(fs.readFileSync(statsFilePath(), 'utf8'));
    // Add rather than assign: this runs after the first window exists, so a
    // handful of requests may already have been counted this session.
    for (const k of ['blockedAds', 'blockedCookies', 'upgradedHttps']) {
      if (Number.isFinite(raw[k])) stats[k] += raw[k];
    }
    if (Number.isFinite(raw.since)) stats.since = Math.min(stats.since, raw.since);
  } catch { /* first run, or unreadable — keep the zeroed defaults */ }
}
// These counters tick many times per page load, so we never write on the
// increment itself — a dirty check every few seconds (plus one final flush on
// quit) keeps the file current without an fs write per blocked request.
let _statsWritten = '';
function persistStatsNow() {
  const json = JSON.stringify(stats);
  if (json === _statsWritten) return;
  try { fs.writeFileSync(statsFilePath(), json, 'utf8'); _statsWritten = json; }
  catch { /* non-fatal */ }
}
function initStats() {
  loadStats();
  _statsWritten = JSON.stringify(stats);
  setInterval(persistStatsNow, 5000).unref?.();
}
// Per-webContents block counts — reset on each main-frame navigation so the
// omnibox shield can show "blocked on this page" without bleeding across loads.
const pageBlockedCounts = new Map();
let defaultUserAgent = null;

// In-progress download items keyed by ID
const activeDownloads = new Map();

// ---------------------------------------------------------------------------
// Custom scheme — must register before app is ready
// ---------------------------------------------------------------------------
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'privoo',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      // Required so the new-tab live (video) wallpaper can stream from
      // privoo://newtab/wallpaper with range requests.
      stream: true,
    },
  },
  {
    // Anonymous .mariana sites (Tor hidden service + optional post-quantum
    // layer). Treated as a real, secure, standard-origin scheme so hosted
    // pages get a normal origin, fetch(), and relative URLs that work.
    scheme: 'mariana',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Builds the privoo:// request handler. The same handler works for any
// session — the default one and each incognito partition. Without
// registering it on the incognito session, privoo://newtab etc. fail with
// "no app to open this link" inside incognito windows.
function buildPrivooProtocolHandler() {
  return async (request) => {
    let host = '';
    let pathname = '/';
    let search = '';
    try {
      const u = new URL(request.url);
      host = u.hostname;
      pathname = u.pathname;
      search = u.search;
    } catch { /* use defaults */ }

    // Extension background workers get no preload and so no IPC; they reach
    // the same API handlers over fetch instead. Every request carries a secret
    // Privoo generated and baked into the extension's copy of the bridge, so an
    // ordinary web page — which cannot read a file inside an extension — cannot
    // reach this even though the scheme is fetchable.
    if (host === 'ext-api') {
      const json = (body, status = 200) => new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
      const deny = () => json({ error: 'forbidden' }, 403);

      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            'access-control-allow-headers': '*',
            'access-control-max-age': '86400',
          },
        });
      }

      if (pathname === '/events') {
        const params = new URLSearchParams(search);
        if (params.get('token') !== extensionApiToken()) return deny();
        const since = Number(params.get('since') || 0) || 0;
        // Hangs until there is something to report, so a worker with listeners
        // does no polling of its own.
        return json(await extensionApiHost.waitForEvents(since, 25000));
      }

      if (pathname === '/call') {
        let body = null;
        try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad request' }, 400); }
        if (!body || body.token !== extensionApiToken()) return deny();
        return json(await extensionApiHost.handleCall(body.method, body.args));
      }

      return json({ error: 'not found' }, 404);
    }

    // Shared finish-pass stylesheet for the internal pages (privoo://settings,
    // history, downloads, …). Each of those pages carries its own <style>
    // block; this is the one file that gives them a common palette, so it is
    // linked from all of them as privoo://<page>/page-theme.css and served here
    // regardless of host. fs.readFile, not net.fetch — it lives inside ASAR.
    if (/^\/page-theme\.css$/i.test(pathname)) {
      try {
        const data = await fs.promises.readFile(path.join(INTERNAL_DIR, 'page-theme.css'));
        return new Response(data, {
          headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' },
        });
      } catch {
        // A missing finish pass must not take the page down with it — the
        // page's own styles are still a working (if unbranded) UI.
        return new Response('', { headers: { 'content-type': 'text/css' } });
      }
    }

    // NOTE: privoo://newtab/themes/<id>.png used to be served here. The themes
    // are drawn from their own palettes as gradients now — no image to fetch,
    // nothing to ship, and no 404 on a theme whose PNG was never generated.
    // renderer/themes/ is unreferenced; it can be deleted.

    // Serve root image assets (logo.png, europeprivoobanner.png, …) for any
    // privoo://*/<name>.<ext> request. path.basename strips any directory
    // parts so this can't be used to traverse outside the app root.
    // We use fs.readFile (ASAR-aware) rather than net.fetch(file://) because
    // net.fetch cannot read from inside ASAR archives in packaged builds.
    const imgMatch = pathname.toLowerCase().match(/\/([a-z0-9._-]+\.(?:png|jpe?g|svg|webp|gif))$/);
    if (imgMatch) {
      const name = path.basename(imgMatch[1]);
      const ext  = path.extname(name).slice(1).replace('jpg', 'jpeg');
      const ct   = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
      // Prefer extraResources path (outside ASAR) so the file is always reachable.
      const candidates = process.resourcesPath
        ? [path.join(process.resourcesPath, name), path.join(__dirname, name)]
        : [path.join(__dirname, name)];
      for (const asset of candidates) {
        if (fs.existsSync(asset)) {
          try {
            const data = await fs.promises.readFile(asset);
            return new Response(data, { headers: { 'content-type': ct } });
          } catch { /* try next candidate */ }
        }
      }
      // Fallback: transparent 1x1 PNG
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      return new Response(Buffer.from(b64, 'base64'), { headers: { 'content-type': 'image/png' } });
    }

    // New-tab wallpaper (image copied into userData)
    const pathNorm = pathname.replace(/\/$/, '') || '/';
    // One wallpaper out of the collection, by id. The settings page is a
    // guest document and cannot load a file:// URL, and sending ten
    // multi-megabyte images across as data URLs to draw ten thumbnails would
    // be absurd, so they are served.
    if (host === 'newtab' && /^\/wallpaper\/[a-z0-9]+$/i.test(pathNorm)) {
      const id = pathNorm.slice('/wallpaper/'.length);
      const file = wallpaperLibPath(id);
      if (!file) return new Response('', { status: 404 });
      const range = request.headers.get('range');
      return net.fetch(pathToFileURL(file).toString(), range ? { headers: { range } } : undefined);
    }

    if (host === 'newtab' && pathNorm === '/wallpaper') {
      const s = settingsStore.load();
      const wp = s.ntpWallpaperPath;
      // Empty string means user explicitly removed wallpaper
      if (wp === '') {
        return new Response('', { status: 404 });
      }
      if (wp && fs.existsSync(wp)) {
        // Always the user's own file, in their profile directory. Forward the
        // Range header so a video wallpaper streams and loops smoothly (the
        // media element issues range requests; net.fetch returns 206).
        const range = request.headers.get('range');
        return net.fetch(pathToFileURL(wp).toString(), range ? { headers: { range } } : undefined);
      }
      // No wallpaper set. Privoo ships no default background and no bundled
      // gallery — an unset wallpaper means no wallpaper, full stop. The
      // Random Wallpaper option fetches its photos in the new tab page itself.
      return new Response('', { status: 404 });
    }

    const fileName = INTERNAL_PAGES[host] || INTERNAL_PAGES.newtab;
    const full = path.join(INTERNAL_DIR, fileName);
    // Path traversal guard
    if (!full.startsWith(INTERNAL_DIR)) return new Response('Not found', { status: 404 });
    // Read through fs (ASAR-aware) and send it as no-store. These pages ship
    // inside the app, so a cached copy is never fresher than the file — but
    // Chromium was caching them anyway, which meant a restored tab could keep
    // serving the version of privoo://newtab from before an update until the
    // user happened to hard-reload it.
    try {
      const html = await fs.promises.readFile(full);
      return new Response(html, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
}

function registerPrivooProtocol() {
  // Default session — the global protocol module routes here.
  protocol.handle('privoo', buildPrivooProtocolHandler());
}

// Register privoo:// on a non-default (incognito) session so its webviews
// can load privoo://newtab, privoo://settings, etc. We call handle()
// directly — `isProtocolHandled` isn't reliably present across Electron
// versions, and calling it on a missing method threw, which silently left
// the incognito session WITHOUT the protocol (blank/broken incognito tabs).
function registerPrivooProtocolForSession(sess) {
  if (!sess || !sess.protocol) return;
  try {
    sess.protocol.handle('privoo', buildPrivooProtocolHandler());
  } catch (e) {
    // Already registered for this session — fine, ignore.
    if (!/already.*registered|second handler/i.test(String(e && e.message))) {
      console.warn('Privoo: privoo:// protocol register (incognito) failed:', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// mariana:// — client side. Fetches a .mariana site's files over Tor and, if
// the host offers it, runs a post-quantum (ML-KEM-768) handshake so the page
// is encrypted end-to-end a second time on top of Tor's own circuit crypto.
// ---------------------------------------------------------------------------
let _marianaTorSession = null;
// Returns the dedicated Tor-proxied session, guaranteeing the SOCKS proxy is
// actually applied before we hand it back — otherwise the first request could
// race ahead of setProxy() and leak out directly instead of over Tor.
async function marianaTorSession() {
  if (!_marianaTorSession) _marianaTorSession = session.fromPartition('mariana-tor');
  await _marianaTorSession.setProxy({
    proxyRules: `socks5://127.0.0.1:${torPortOf(settingsStore.load())}`,
  }).catch(() => {});
  return _marianaTorSession;
}

// One HTTP GET to an .onion over Tor, returning status + headers + raw body.
async function torGet(onion, urlPath, extraHeaders) {
  const torSess = await marianaTorSession();
  return new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url: `http://${onion}${urlPath}`,
      session: torSess,
      useSessionCookies: false,
    });
    for (const [k, v] of Object.entries(extraHeaders || {})) req.setHeader(k, v);
    const chunks = [];
    req.on('response', (res) => {
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

function marianaErrorPage(title, detail) {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#1c1b26;color:#eceaf6;` +
    `display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center;text-align:center}` +
    `.b{max-width:440px;padding:32px}h1{font-size:20px;margin:0 0 10px}p{color:#a5a2bd;line-height:1.6;font-size:14px}` +
    `code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px}</style>` +
    `<div class="b"><h1>${title}</h1><p>${detail}</p></div>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function buildMarianaProtocolHandler() {
  return async (request) => {
    const { name, onion, path: reqPath } = mariana.parseAddress(request.url);
    if (!onion) {
      return marianaErrorPage('Unknown .mariana address',
        `Privoo doesn't know which Tor service <code>${name}.mariana</code> points to yet. ` +
        `Open the full share link the site owner gave you (it ends in a long address), then this short name will work.`);
    }
    if (!ensureTorForOnion()) {
      return marianaErrorPage('Tor unavailable',
        'This site is reached over Tor, but Privoo could not start Tor. Check that Tor is installed/bundled, then try again.');
    }
    // Cache the friendly name so the short form resolves next time.
    mariana.rememberVisited(name, onion);

    try {
      // 1) Ask the host for its post-quantum public key. The onion address is
      //    self-authenticating, so fetching it over Tor is safe from MITM.
      let pqKey = null;
      try {
        const pub = await torGet(onion, '/__mariana/pubkey');
        if (pub.status === 200 && pub.body && pub.body.length > 1000) pqKey = new Uint8Array(pub.body);
      } catch { /* no PQ — fall back to plain Tor */ }

      // 2) If PQ is offered, encapsulate a fresh shared secret for this load.
      let kemHeader = null, aesKey = null;
      if (pqKey) {
        try {
          const { ct, secret } = await mariana.encapsulate(pqKey);
          kemHeader = mariana.b64(ct);
          aesKey = mariana.deriveKey(secret);
        } catch { kemHeader = null; aesKey = null; }
      }

      // 3) Fetch the actual resource, handing over the KEM ciphertext.
      const resp = await torGet(onion, reqPath, kemHeader ? { 'x-mariana-kem': kemHeader } : {});
      if (resp.status >= 400) {
        return marianaErrorPage('Not found', `The host returned ${resp.status} for <code>${reqPath}</code>.`);
      }

      const ctype = resp.headers['content-type']
        ? (Array.isArray(resp.headers['content-type']) ? resp.headers['content-type'][0] : resp.headers['content-type'])
        : 'application/octet-stream';

      // 4) Decrypt if the host actually used the PQ layer.
      const pqFlag = resp.headers['x-mariana-pq'];
      let bodyBuf = resp.body;
      if (aesKey && pqFlag && (Array.isArray(pqFlag) ? pqFlag[0] : pqFlag) === '1') {
        const nonceH = resp.headers['x-mariana-nonce'];
        const tagH = resp.headers['x-mariana-tag'];
        const nonce = Buffer.from(mariana.unb64(Array.isArray(nonceH) ? nonceH[0] : nonceH));
        const tag = Buffer.from(mariana.unb64(Array.isArray(tagH) ? tagH[0] : tagH));
        try {
          bodyBuf = mariana.decryptBody(aesKey, nonce, tag, resp.body);
        } catch {
          return marianaErrorPage('Decryption failed',
            'The post-quantum layer could not verify this page. It may have been tampered with in transit, so Privoo refused to show it.');
        }
      }

      return new Response(bodyBuf, {
        status: 200,
        headers: {
          'content-type': ctype,
          // Flag the load so the UI can show a "post-quantum" indicator.
          'x-privoo-mariana-pq': aesKey && pqFlag ? '1' : '0',
        },
      });
    } catch (e) {
      return marianaErrorPage('Could not reach site',
        `Privoo couldn't connect to this .mariana site over Tor. The host may be offline. ` +
        `<br><br><code>${String(e && e.message || e).slice(0, 120)}</code>`);
    }
  };
}

function registerMarianaProtocol() {
  try { protocol.handle('mariana', buildMarianaProtocolHandler()); }
  catch (e) { console.warn('Privoo: mariana:// register failed:', e.message); }
}
function registerMarianaProtocolForSession(sess) {
  if (!sess || !sess.protocol) return;
  try { sess.protocol.handle('mariana', buildMarianaProtocolHandler()); }
  catch (e) {
    if (!/already.*registered|second handler/i.test(String(e && e.message))) {
      console.warn('Privoo: mariana:// register (session) failed:', e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Base-domain helper
// ---------------------------------------------------------------------------
const TWO_LEVEL_TLDS = new Set([
  'co.uk','org.uk','gov.uk','ac.uk','co.jp','co.kr','co.nz','co.za',
  'com.au','net.au','org.au','com.br','com.cn','com.mx','com.tr',
]);

function baseDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.toLowerCase().split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  const lastTwo = parts.slice(-2).join('.');
  return TWO_LEVEL_TLDS.has(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

function hostnameOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// ── URL scheme classification (for navigation / window.open routing) ─────────
// Schemes a webview can actually render or that we handle internally. Anything
// NOT matching this is some other app's custom protocol.
const WEB_SCHEME_RE = /^(https?|privoo|about|data|blob|file|chrome|devtools|ws|wss):/i;
// Mobile-app deep links. TikTok/ByteDance kick these off mid-flow (e.g. during
// "verify it's really you") to try to hand off to their native app: snssdk1233://
// is the TikTok app, plus aweme://, musically://, tiktok://, bytedance://, etc.
// On desktop these can NEVER resolve (no such app), and real desktop Chrome just
// no-ops them so the page falls back to its in-browser flow. If we instead let
// the webview navigate to one — or spawn a tab for it — the user dead-ends on an
// "open this URL in <app>" page and the email-code step then fails. So we swallow
// them silently. Match is broad on purpose (any snssdk<digits>, any aweme*).
const MOBILE_DEEPLINK_RE = /^(snssdk\d*|aweme[a-z]*|musical(?:ly)?|tiktok|bytedance|byteh|lark|feishu|helo|vigo|tikcast|trill):/i;
function isWebScheme(url) { return typeof url === 'string' && WEB_SCHEME_RE.test(url); }
function isMobileDeepLink(url) { return typeof url === 'string' && MOBILE_DEEPLINK_RE.test(url); }

/**
 * Spotify web-player ad / telemetry endpoints.
 *
 * We deliberately match only (a) Spotify's dedicated ad / analytics subdomains
 * and (b) the ad-serving + ad-event PATHS on the main API host — never the API
 * host wholesale (spclient.wg.spotify.com also drives real playback) and never
 * the audio CDNs (scdn.co), so music keeps streaming while audio/visual ads and
 * their tracking are cut off. Pairs with the in-page spotifyAdScript that mutes
 * and skips any ad slot that still slips through.
 */
function isSpotifyAdRequest(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  const h = u.hostname.toLowerCase();
  if (!(h === 'spotify.com' || h.endsWith('.spotify.com'))) return false;
  // Dedicated ad / analytics / logging subdomains — block wholesale.
  if (/^(pixel|pixel-static|analytics|ads-fa|adstudio|adeventtracker|log\d*|crashdump)\./.test(h)) return true;
  // Ad-serving + ad-event paths on the API host(s).
  if (/\/(ads|ad-logic|adlogic|gabo-receiver-service|ad-content|adapt-ads)(\/|$)/i.test(u.pathname)) return true;
  return false;
}

/**
 * Heuristic: would loading this URL in a fresh tab be pointless because the
 * server is going to respond with Content-Disposition: attachment anyway?
 * Used in setWindowOpenHandler to route window.open() download links straight
 * into the session's downloader instead of spawning an empty tab.
 *
 * Errs on the side of false-positives only for URLs that *look* unambiguously
 * download-y — direct binary file extensions or hostnames/paths that exist
 * specifically to serve downloads (download.*, /install/Download, etc.).
 */
const DOWNLOAD_EXT_RE = /\.(exe|msi|dmg|pkg|deb|rpm|apk|ipa|appx|appxbundle|msix|zip|tar|gz|tgz|tbz2?|bz2|xz|7z|rar|iso|img|bin|jar|war|torrent|crx|xpi|nupkg|whl|wheel)(?:$|\?)/i;
function isLikelyDownloadUrl(url) {
  try {
    const u = new URL(url);
    if (DOWNLOAD_EXT_RE.test(u.pathname)) return true;
    const host = u.hostname.toLowerCase();
    if (host.startsWith('download.') || host.startsWith('downloads.') || host.startsWith('dl.')) return true;
    const path = u.pathname.toLowerCase();
    if (/^\/install\/(download|installer)\b/.test(path)) return true;

    // Chrome extension distribution endpoints. Loading these in a popup
    // returns ERR_CACHE_MISS because the server streams the .crx with
    // Content-Disposition: attachment and there's nothing to render.
    // Route them straight into the session downloader instead.
    if (host === 'clients2.googleusercontent.com' && path.includes('/crx/')) return true;
    if (host === 'crx4chrome.com' || host.endsWith('.crx4chrome.com')) {
      // /go.php?...&l=<actual crx url> redirector
      if (path === '/go.php' || path.startsWith('/crx/')) return true;
    }
    if (host === 'crxdl.com' || host.endsWith('.crxdl.com')) return true;
    if (host === 'crxextractor.com' || host.endsWith('.crxextractor.com')) {
      if (path.includes('/download') || path.includes('/extract')) return true;
    }
    return false;
  } catch { return false; }
}

/**
 * Hosts where our privacy hijinks (auto-dark, canvas farbling, aggressive
 * cookie stripping) break the site. Bedrock images don't render and Sparx
 * Maths shows white text on its dark UI when force-dark is on. Treat these
 * as "compatibility-first" — minimal interference.
 */
function isSiteCompatibilityHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return (
    h === 'bedrocklearning.org'   || h.endsWith('.bedrocklearning.org')   ||
    h === 'bedrocklearning.co.uk' || h.endsWith('.bedrocklearning.co.uk') ||
    h === 'bedrocklearning.com'   || h.endsWith('.bedrocklearning.com')   ||
    h === 'sparxmaths.com'        || h.endsWith('.sparxmaths.com')        ||
    h === 'sparxmaths.uk'         || h.endsWith('.sparxmaths.uk')         ||
    h === 'sparx-learning.com'    || h.endsWith('.sparx-learning.com')    ||
    // Snapchat web is a heavy SPA with its own bot/integrity checks; request
    // rewriting + fingerprint farbling left it stuck on a blank page. Give it
    // the minimal-interference path so it actually loads.
    h === 'snapchat.com'          || h.endsWith('.snapchat.com')          ||
    h === 'snap.com'              || h.endsWith('.snap.com')              ||
    h.endsWith('.sc-cdn.net')     ||
    h === 'mediafire.com'         || h.endsWith('.mediafire.com')         ||
    h.endsWith('.mfi.re')         ||
    // Google domains - canvas farbling and friends make Google's bot
    // detection bury the user in reCAPTCHAs. Treat Google as a compat host
    // so its pages get the minimal-interference path.
    h === 'google.com'            || h.endsWith('.google.com')              ||
    // TikTok — its login captcha / device-verification calls a swarm of
    // security + telemetry endpoints. When the ad/tracker engine blocks any of
    // them the verification keeps failing → "maximum number of attempts
    // reached". Give TikTok the minimal-interference path so login works.
    h === 'tiktok.com'            || h.endsWith('.tiktok.com')              ||
    h === 'tiktokv.com'           || h.endsWith('.tiktokv.com')            ||
    h === 'tiktokcdn.com'         || h.endsWith('.tiktokcdn.com')          ||
    h.endsWith('.tiktokcdn-us.com') ||
    h === 'byteoversea.com'       || h.endsWith('.byteoversea.com')        ||
    h === 'bytedance.com'         || h.endsWith('.bytedance.com')          ||
    // ByteDance security-SDK + verification CDNs: ttwstatic.com serves
    // webmssdk.js (the login signature engine) and ibytedtos.com / ibyteimg.com
    // host the device-verification + captcha assets. Blocking any of them makes
    // the email-code step fail with "something went wrong".
    h.endsWith('.ttwstatic.com')  ||
    h.endsWith('.ibytedtos.com')  ||
    h.endsWith('.ibyteimg.com')   ||
    h.endsWith('.bytescm.com')
  );
}

/** Sites whose own dark theme is broken enough that we keep them on light.
 *  NOT the same list as isSiteCompatibilityHost() — that one is about
 *  request rewriting and fingerprinting, and Google and TikTok are on it for
 *  bot detection. Being awkward about network requests says nothing about
 *  whether a site's dark mode works.
 *
 *  Sparx Maths ships white text in white login inputs under prefers-dark;
 *  Bedrock misrenders quiz images. Everything else follows the browser. */
function prefersLightOnlyHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return (
    h === 'bedrocklearning.org'   || h.endsWith('.bedrocklearning.org')   ||
    h === 'bedrocklearning.co.uk' || h.endsWith('.bedrocklearning.co.uk') ||
    h === 'bedrocklearning.com'   || h.endsWith('.bedrocklearning.com')   ||
    h === 'sparxmaths.com'        || h.endsWith('.sparxmaths.com')        ||
    h === 'sparxmaths.uk'         || h.endsWith('.sparxmaths.uk')         ||
    h === 'sparx-learning.com'    || h.endsWith('.sparx-learning.com')
  );
}

/** The ONLY place that decides a page's prefers-color-scheme.
 *
 *  Every caller goes through here. Three of them used to work it out
 *  independently and disagree, and because setEmulatedMedia persists, the
 *  disagreement did not show up as a flicker — it showed up as a site stuck
 *  on the wrong theme until it was navigated again. */
function prefersDarkFor(url, settings) {
  const s = settings || settingsStore.load();
  const host = hostnameOf(url || '');
  if (prefersLightOnlyHost(host)) return false;
  const isInternal = !url || url.startsWith('privoo://') || url.startsWith('about:') || url.startsWith('devtools:');
  // Force Dark inverts pages that have no dark theme of their own, so it
  // implies the preference too — but never for Privoo's own pages, which
  // have a real light mode and follow darkMode alone.
  return isInternal ? !!s.darkMode : !!(s.darkMode || s.forceDarkMode);
}

/** TikTok / ByteDance family hosts. Their login + verification requests are
 *  signed (msToken / X-Bogus) and the server cross-checks the request's client
 *  hints; if any request leaks Electron's UA-CH (e.g. a popup whose CDP override
 *  hasn't applied yet) the server risk-rejects it with a delayed "maximum number
 *  of attempts reached". So we force clean Chrome UA + client-hint headers for
 *  these hosts at the SESSION layer — independent of the spoofUserAgent toggle
 *  and of any per-webContents CDP timing. */
function isByteDanceFamilyHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return h === 'tiktok.com'        || h.endsWith('.tiktok.com')        ||
         h === 'tiktokv.com'       || h.endsWith('.tiktokv.com')       ||
         h === 'tiktokcdn.com'     || h.endsWith('.tiktokcdn.com')     ||
         h.endsWith('.tiktokcdn-us.com')                               ||
         h === 'byteoversea.com'   || h.endsWith('.byteoversea.com')   ||
         h === 'bytedance.com'     || h.endsWith('.bytedance.com')     ||
         h.endsWith('.ttwstatic.com')                                  ||
         h.endsWith('.ibytedtos.com')                                  ||
         h.endsWith('.ibyteimg.com')                                   ||
         h.endsWith('.bytescm.com');
}

/** Always spoof UA for these hosts (Google sign-in blocks non-Chrome UAs). */
function isGoogleAuthHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return h === 'accounts.google.com' || h === 'google.com' || h === 'myaccount.google.com'
    || h.endsWith('.google.com') || h.endsWith('.googleapis.com')
    || h.endsWith('.gstatic.com') || h.endsWith('.googleusercontent.com')
    || h.endsWith('.youtube.com') || h === 'youtube.com'
    || h.endsWith('.googlevideo.com') || h.endsWith('.ggpht.com')
    || h.endsWith('.googleadservices.com') || h.endsWith('.doubleclick.net');
}

/** Only the actual Google sign-in/account pages — used to scope CSP-stripping
 *  narrowly. isGoogleAuthHost() above is intentionally broad (it just swaps
 *  UA/sec-ch-ua headers, which is harmless), but stripping a page's
 *  Content-Security-Policy is a real security downgrade and must NOT be
 *  applied to the whole google.com/youtube.com/doubleclick.net family — that
 *  would silently disable CSP protection on some of the most-visited sites
 *  on the web, which is exactly the kind of regression a security scan
 *  (e.g. browseraudit.com) flags. */
function isGoogleSignInPage(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return h === 'accounts.google.com' || h === 'myaccount.google.com';
}

/** Allow OAuth / SSO / CDN flows when third-party cookie blocking is on.
 *  Without this, sign-in flows that bounce through identity providers break. */
function isRelaxedThirdPartyCookieHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  // Google
  if (h === 'google.com' || h.endsWith('.google.com')) return true;
  if (h.endsWith('.googleusercontent.com')) return true;
  if (h.endsWith('.gstatic.com')) return true;
  if (h.endsWith('.googleapis.com')) return true;
  if (h.endsWith('.googlevideo.com')) return true;
  if (h.endsWith('.ggpht.com')) return true;
  if (h.endsWith('.youtube.com') || h === 'youtube.com') return true;
  if (h.endsWith('.ytimg.com')) return true;
  if (h === 'recaptcha.net' || h.endsWith('.recaptcha.net')) return true;
  // Microsoft (Teams, Outlook, Office, Live, Azure SSO)
  if (h === 'microsoft.com' || h.endsWith('.microsoft.com')) return true;
  if (h === 'microsoftonline.com' || h.endsWith('.microsoftonline.com')) return true;
  if (h === 'live.com' || h.endsWith('.live.com')) return true;
  if (h === 'office.com' || h.endsWith('.office.com')) return true;
  if (h === 'office365.com' || h.endsWith('.office365.com')) return true;
  if (h.endsWith('.officeapps.live.com')) return true;
  if (h === 'outlook.com' || h.endsWith('.outlook.com')) return true;
  if (h === 'teams.com' || h.endsWith('.teams.com')) return true;
  if (h === 'teams.live.com' || h.endsWith('.teams.live.com')) return true;
  if (h === 'teams.microsoft.com' || h.endsWith('.teams.microsoft.com')) return true;
  if (h === 'sharepoint.com' || h.endsWith('.sharepoint.com')) return true;
  if (h === 'msn.com' || h.endsWith('.msn.com')) return true;
  if (h === 'bing.com' || h.endsWith('.bing.com')) return true;
  if (h.endsWith('.windows.net')) return true; // azure storage / sso
  if (h.endsWith('.azure.com')) return true;
  if (h.endsWith('.skype.com')) return true;
  // TikTok / ByteDance (login passport + email/SMS verification bounce through
  // byteoversea + the *static / *dtos CDNs, so relax those too).
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return true;
  if (h === 'tiktokv.com' || h.endsWith('.tiktokv.com')) return true;
  if (h === 'tiktokcdn.com' || h.endsWith('.tiktokcdn.com')) return true;
  if (h.endsWith('.tiktokcdn-us.com')) return true;
  if (h === 'byteoversea.com' || h.endsWith('.byteoversea.com')) return true;
  if (h === 'bytedance.com' || h.endsWith('.bytedance.com')) return true;
  if (h.endsWith('.ttwstatic.com')) return true;
  if (h.endsWith('.ibytedtos.com')) return true;
  if (h.endsWith('.ibyteimg.com')) return true;
  // Meta
  if (h === 'facebook.com' || h.endsWith('.facebook.com')) return true;
  if (h.endsWith('.fbcdn.net')) return true;
  if (h === 'instagram.com' || h.endsWith('.instagram.com')) return true;
  if (h === 'whatsapp.com' || h.endsWith('.whatsapp.com')) return true;
  // Twitter / X
  if (h === 'twitter.com' || h.endsWith('.twitter.com')) return true;
  if (h.endsWith('.twimg.com')) return true;
  if (h === 'x.com' || h.endsWith('.x.com')) return true;
  // Apple
  if (h === 'apple.com' || h.endsWith('.apple.com')) return true;
  if (h === 'icloud.com' || h.endsWith('.icloud.com')) return true;
  // GitHub
  if (h === 'github.com' || h.endsWith('.github.com')) return true;
  if (h.endsWith('.githubusercontent.com')) return true;
  // Cloudflare, Stripe, common identity / payment providers
  if (h.endsWith('.cloudflare.com')) return true;
  if (h === 'stripe.com' || h.endsWith('.stripe.com')) return true;
  if (h === 'paypal.com' || h.endsWith('.paypal.com')) return true;
  if (h === 'auth0.com' || h.endsWith('.auth0.com')) return true;
  if (h === 'okta.com' || h.endsWith('.okta.com')) return true;
  // Captcha services — they NEED cookies to remember you passed the challenge,
  // otherwise you get re-challenged on every page navigation.
  if (h === 'hcaptcha.com' || h.endsWith('.hcaptcha.com')) return true;
  if (h === 'hcaptcha.io'  || h.endsWith('.hcaptcha.io'))  return true;
  if (h === 'arkoselabs.com' || h.endsWith('.arkoselabs.com')) return true;
  if (h.endsWith('.funcaptcha.com')) return true;
  if (h.endsWith('.cloudflareinsights.com')) return true;
  if (h === 'challenges.cloudflare.com') return true;
  if (h.endsWith('.turnstile.cloudflare.com')) return true;
  return false;
}

function documentBaseDomain(wcId) {
  if (!wcId) return '';
  const wc = webContents.fromId(wcId);
  if (!wc || wc.isDestroyed()) return '';
  return baseDomain(hostnameOf(wc.getURL()));
}

// ---------------------------------------------------------------------------
// Ad / tracker blocking
// ---------------------------------------------------------------------------
// The ElectronBlocker registers a process-wide ipcMain handler
// ('@ghostery/adblocker/inject-cosmetic-filters') the first time it touches
// a session. Building a second blocker (e.g. for an incognito session)
// throws "Attempted to register a second handler". So we build the engine
// ONCE and reuse the same instance across every session.
let _sharedBlocker = null;
let _sharedBlockerPromise = null;
// Extra YouTube-specific rules applied on top of the prebuilt filter lists.
// These target YouTube's anti-adblock detection wall and the ad UI elements
// the standard lists don't always catch between filter-list update cycles.
// Playback allowlist — applied SEPARATELY (and first) so that even if a block
// or cosmetic rule below ever fails to parse, this critical set still lands.
// Exception (@@) rules win over any blocking rule in the prebuilt lists, so an
// over-eager EasyList/EasyPrivacy rule can't starve the player. This is the
// main guard against "video won't play / black screen / infinite spinner".
const _YT_ALLOWLIST = [
  '@@||www.youtube.com/youtubei/v1/player^',
  '@@||www.youtube.com/youtubei/v1/next^',
  '@@||www.youtube.com/youtubei/v1/browse^',
  '@@||www.youtube.com/youtubei/v1/search^',
  '@@||www.youtube.com/youtubei/v1/guide^',
  '@@||www.youtube.com/youtubei/v1/reel_watch_sequence^',
  '@@||youtubei.googleapis.com^',
  '@@||www.youtube.com/videoplayback',
  '@@||youtube.com/videoplayback',
  '@@||googlevideo.com^',
  '@@||*.googlevideo.com^',
  '@@||i.ytimg.com^',
  '@@||s.ytimg.com^',
  '@@||ytimg.com^',
  '@@||yt3.ggpht.com^',
  '@@||yt4.ggpht.com^',
  '@@||www.youtube.com/s/player/',
  '@@||www.youtube.com/s/desktop/',
  '@@||www.youtube.com/generate_204',
  '@@||www.youtube.com/api/stats/watchtime^',
  '@@||www.youtube.com/api/stats/playback^',
  '@@||www.youtube.com/api/timedtext^',
  '@@||jnn-pa.googleapis.com^',   // player attestation — blocking it breaks playback
];

// Same problem, same fix, for Spotify's web player: EasyPrivacy/EasyList
// carry generic rules that key on path fragments like "collection" or
// "library" as tracking signals, which also happen to be the literal names
// of Spotify's own saved-library endpoints. An over-eager match there is
// exactly what produces "Something went wrong" on the Your Library page —
// the request never leaves the machine, so Spotify's client just sees a
// failed fetch. apresolve.spotify.com is the most critical entry: it's how
// the client discovers which spclient host to talk to, so blocking it can
// break the player entirely, not just the library view. isSpotifyAdRequest()
// (webRequest-based, applied separately in setupHeaderPrivacy) still blocks
// Spotify's actual ad/telemetry hosts — this only protects the real API.
const _SPOTIFY_ALLOWLIST = [
  '@@||apresolve.spotify.com^',
  '@@||api.spotify.com^',
  '@@||api-partner.spotify.com^',
  '@@||spclient.wg.spotify.com^',
  '@@||*.spclient.wg.spotify.com^',   // regional hosts, e.g. gew4-spclient.spotify.com
  '@@||open.spotify.com/api/^',
  '@@||open.spotify.com/collection^',
  '@@||open.spotify.com/library^',
  '@@||guc-spclient.spotify.com^',
  '@@||scdn.co^',
  '@@||*.scdn.co^',
];

// In-browser cryptomining ("cryptojacking") scripts hijack the visitor's CPU
// to mine cryptocurrency for the site owner, usually without disclosure.
// EasyPrivacy catches some of this incidentally, but these are the actual
// dedicated miner-widget services (CoinHive-era and its successors) — worth
// blocking explicitly rather than hoping a generic tracker rule catches them.
// Settings → Privacy → "Cryptojacking protection" (on by default).
const _CRYPTOJACKING_BLOCKLIST = [
  '||coinhive.com^',
  '||coin-hive.com^',
  '||cnhv.co^',
  '||authedmine.com^',
  '||crypto-loot.com^',
  '||cryptoloot.pro^',
  '||coinimp.com^',
  '||www.coinimp.com^',
  '||api.coinimp.com^',
  '||jsecoin.com^',
  '||load.jsecoin.com^',
  '||webmine.pro^',
  '||www.webmine.pro^',
  '||minero.pw^',
  '||webminepool.com^',
  '||monerise.com^',
  '||deepminer.cc^',
  '||coinerra.com^',
  '||minemytraffic.com^',
  '||projectpoi.com^',
  '||papoto.com^',
  '||crypto-webminer.com^',
  '||moneroocean.stream^',
  '||coinhiveproxy.com^',
  '||minecrunch.co^',
  '||coin-have.com^',
  '||server.gridcash.net^',
];

// Ad-serving/tracking network blocks + cosmetic ad-UI removal. Kept separate
// from the allowlist above so a parse hiccup here can never drop that.
const _YT_EXTRA_FILTERS = [
  // ── Block: ad serving + ad tracking requests ─────────────────────────────
  '||www.youtube.com/api/stats/ads^',
  '||youtube.com/api/stats/ads^',
  '||www.youtube.com/pagead/',
  '||youtube.com/pagead/',
  '||www.youtube.com/ptracking^',
  '||youtube.com/ptracking^',
  '||www.youtube.com/get_midroll_info^',
  '||youtube.com/get_midroll_info^',
  '||www.youtube.com/youtubei/v1/player/ad_break^',
  '||googleads.g.doubleclick.net^$domain=youtube.com',
  '||static.doubleclick.net^$domain=youtube.com',
  '||doubleclick.net^$domain=youtube.com',
  '||googleadservices.com^$domain=youtube.com',
  '||google.com/pagead/$domain=youtube.com',
  // ── Cosmetic: remove in-stream + overlay ad UI ───────────────────────────
  'youtube.com##.video-ads.ytp-ad-module',
  'youtube.com##.ytp-ad-overlay-container',
  'youtube.com##.ytp-ad-overlay-slot',
  'youtube.com##.ytp-ad-player-overlay',
  'youtube.com##.ytp-ad-player-overlay-layout',
  'youtube.com##.ytp-ad-text-overlay',
  'youtube.com##.ytp-ad-simple-ad-badge',
  'youtube.com##.ytp-ad-preview-container',
  'youtube.com##.ytp-ad-message-container',
  // ── Cosmetic: remove feed / sidebar / masthead ad slots ──────────────────
  'youtube.com###player-ads',
  'youtube.com###masthead-ad',
  'youtube.com##ytd-action-companion-ad-renderer',
  'youtube.com##ytd-display-ad-renderer',
  'youtube.com##ytd-video-masthead-ad-v3-renderer',
  'youtube.com##ytd-ad-slot-renderer',
  'youtube.com##ytd-in-feed-ad-layout-renderer',
  'youtube.com##ytd-banner-promo-renderer',
  'youtube.com##ytd-statement-banner-renderer',
  'youtube.com##ytd-compact-promoted-video-renderer',
  'youtube.com##ytd-promoted-sparkles-web-renderer',
  'youtube.com##ytd-promoted-video-renderer',
  'youtube.com##ytd-rich-item-renderer:has(> #content ytd-ad-slot-renderer)',
  'youtube.com##.ytd-ad-slot-renderer',
  'youtube.com###related ytd-ad-slot-renderer',
  // ── Cosmetic: anti-adblock enforcement wall + promo dialogs ──────────────
  'youtube.com##ytd-enforcement-message-view-model',
  'youtube.com##tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
  'youtube.com##tp-yt-paper-dialog:has(ytd-mealbar-promo-renderer)',
  'youtube.com##ytd-mealbar-promo-renderer',
  'youtube.com##ytd-popup-container:has(ytd-mealbar-promo-renderer)',
];

// Is this host part of the YouTube playback stack?
function isYouTubeHost(host) {
  if (!host) return false;
  const h = String(host).toLowerCase();
  return h === 'youtube.com' || h.endsWith('.youtube.com')
      || h === 'youtu.be' || h.endsWith('.youtu.be')
      || h === 'youtube-nocookie.com' || h.endsWith('.youtube-nocookie.com')
      || h === 'googlevideo.com' || h.endsWith('.googlevideo.com')
      || h === 'youtubei.googleapis.com';
}

// Known content-blocker extensions, by Chrome Web Store id and by name. When
// the user runs one of these, Privoo should get out of its way on sites like
// YouTube — two blockers racing over the same requests can black-screen the
// player. "surely if you have uBlock you don't need your own YouTube blocking."
const _BLOCKER_EXT_IDS = new Set([
  'cjpalhdlnbpafiamejdnhcphjbkeiagm', // uBlock Origin
  'ddkjiahejlhfcafbddmgiahcphecmpfh', // uBlock Origin Lite
  'gighmmpiobklfepjocnamgkkbiglidom', // AdBlock
  'cfhdojbkjhnklbpkdaibdccddilifddb', // Adblock Plus
  'bgnkhhnnamicmpeenaelnjfhikgbkllg', // AdGuard
  'mlomiejdfkolichcflejclcbmpeaniij', // Ghostery
]);
function isBlockerExtension(ext) {
  if (!ext) return false;
  const id = String(ext.chromeId || ext.id || '').toLowerCase();
  if (_BLOCKER_EXT_IDS.has(id)) return true;
  const name = String(ext.name || '').toLowerCase();
  return /ublock|ublock origin|adguard|adblock|ad block|ad-block|ghostery|adnauseam|brave shield/.test(name);
}
// Cached (keyed off the settings.extensions array reference, which only changes
// on a settings write) so the hot onBeforeRequest path stays cheap.
let _blockerExtCache = { ref: null, val: false };
function hasContentBlockerExtension() {
  try {
    const list = settingsStore.load().extensions || [];
    if (_blockerExtCache.ref === list) return _blockerExtCache.val;
    const val = list.some((e) => e && e.enabled && isBlockerExtension(e));
    _blockerExtCache = { ref: list, val };
    return val;
  } catch { return false; }
}

// Resolve the user's filter-list configuration into the set of list URLs the
// engine should be built from. Returns { usePrebuilt, urls }:
//   • usePrebuilt — true when every built-in list is enabled AND no custom
//     lists exist, so we can use Ghostery's well-tuned prebuilt bundle.
//   • urls — the explicit list of enabled list URLs (built-in + custom) used
//     when the user has customised their lists.
function resolveFilterLists() {
  const settings = settingsStore.load();
  const { FILTER_LISTS } = settingsStore;
  const toggles = settings.defaultFilterLists || {};
  const customs = Array.isArray(settings.customFilterLists) ? settings.customFilterLists : [];

  const enabledDefaults = FILTER_LISTS.filter((l) => toggles[l.id] !== false);
  const enabledCustoms = customs.filter((c) => c && c.enabled !== false && /^https?:\/\//i.test(c.url || ''));

  const allDefaultsOn = enabledDefaults.length === FILTER_LISTS.length;
  const usePrebuilt = allDefaultsOn && enabledCustoms.length === 0;

  const urls = [
    ...enabledDefaults.map((l) => l.url),
    ...enabledCustoms.map((c) => c.url.trim()),
  ];
  return { usePrebuilt, urls };
}

async function getSharedBlocker() {
  if (_sharedBlocker) return _sharedBlocker;
  if (_sharedBlockerPromise) return _sharedBlockerPromise;
  _sharedBlockerPromise = (async () => {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const crypto = require('crypto');
    const { usePrebuilt, urls } = resolveFilterLists();

    // Cache file: the prebuilt bundle has a stable name; a custom list set is
    // keyed by a hash of its URLs so changing the lists invalidates the cache
    // automatically (and offline launches still work from the last good cache).
    const cacheName = usePrebuilt
      ? 'adblock-engine-v2.bin'
      : 'adblock-lists-' + crypto.createHash('sha1').update(urls.join('|')).digest('hex').slice(0, 12) + '.bin';
    const cachePath = path.join(app.getPath('userData'), cacheName);

    // Refresh filter lists every 7 days so YouTube anti-adblock bypass rules
    // stay current. Without this, a stale cache can miss rules that were
    // added after the user first installed the app.
    try {
      const stat = await fs.promises.stat(cachePath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 7 * 24 * 60 * 60 * 1000) {
        await fs.promises.unlink(cachePath).catch(() => {});
      }
    } catch { /* cache doesn't exist yet — that's fine */ }

    const caching = {
      path: cachePath,
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    };
    // Electron's net.fetch instead of Node's global fetch — it goes through
    // the same networking stack as everything else in the browser (proxy,
    // Tor, certificate handling), instead of a raw connection that answers
    // to none of that and had nothing to fall back to when it failed.
    let blocker;
    try {
      if (usePrebuilt) {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(net.fetch, caching);
      } else if (urls.length) {
        // User customised their lists — build straight from the enabled URLs.
        console.log('Privoo: building adblock engine from', urls.length, 'custom filter list(s)');
        blocker = await ElectronBlocker.fromLists(net.fetch, urls, {}, caching);
      } else {
        // Everything disabled — an empty engine that blocks nothing, so the
        // 18+/compat wrapper below still functions without the user's lists.
        blocker = ElectronBlocker.empty();
      }
    } catch (e) {
      // A failed fetch/build must not poison every future call — without
      // resetting the promise here, one bad network moment at startup left
      // ad blocking silently stuck on the crude built-in fallback list for
      // the rest of the session, with no retry, ever.
      console.warn('Privoo: adblock engine build failed, will retry on next use:', e.message);
      _sharedBlockerPromise = null;
      throw e;
    }

    // Apply the YouTube playback allowlist FIRST and on its own, so it always
    // lands even if a later ad/cosmetic rule fails to parse. Then the ad rules.
    try { blocker.updateFromDiff({ added: _YT_ALLOWLIST }); } catch {}
    try { blocker.updateFromDiff({ added: _YT_EXTRA_FILTERS }); } catch {}
    try { blocker.updateFromDiff({ added: _SPOTIFY_ALLOWLIST }); } catch {}
    if (settingsStore.load().cryptojackingProtection !== false) {
      try { blocker.updateFromDiff({ added: _CRYPTOJACKING_BLOCKLIST }); } catch {}
    }

    // NOTE: this library version's onBeforeRequest does not emit
    // 'request-blocked'/'request-redirected', so those events never fire.
    // The global block count is tallied off the actual response in the
    // onBeforeRequest wrapper in setupAdBlocking instead.
    _sharedBlocker = blocker;
    return blocker;
  })();
  return _sharedBlockerPromise;
}

// ── onBeforeRequest pipeline ────────────────────────────────────────────────
// Electron allows exactly ONE onBeforeRequest listener per session — a second
// registration silently replaces the first. We had two: the ad blocker's (from
// setupAdBlocking) and the tracking-parameter stripper's (from
// setupHeaderPrivacy). hardenSession() calls them in that order, so the
// stripper was replacing the ad blocker's listener on every session: network-
// level ad blocking never ran, the blocked-request counters never moved, and
// switching the setting off changed nothing visible because only the cosmetic
// (element-hiding) half was ever active.
//
// This routes every consumer through one registered listener that runs the
// handlers in the order they were added. A handler calls done(response) to
// answer the request, or done(null) to pass it to the next handler.
const _obrChains = new WeakMap();   // session -> Map<name, handler>
function addBeforeRequestHandler(sess, name, handler) {
  let chain = _obrChains.get(sess);
  if (!chain) { chain = new Map(); _obrChains.set(sess, chain); }
  chain.set(name, handler);   // keyed, so re-running setup replaces rather than stacks
  // Always (re-)register: third-party code — @ghostery's enableBlockingInSession
  // among them — can install its own listener after ours and take the slot back.
  sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
    const handlers = [...chain.values()];
    let i = 0;
    let answered = false;
    const next = () => {
      if (answered) return;
      if (i >= handlers.length) { answered = true; return cb({ cancel: false }); }
      const h = handlers[i++];
      try {
        h(details, (res) => {
          if (answered) return;
          if (res) { answered = true; cb(res); } else next();
        });
      } catch { next(); }
    };
    next();
  });
}

async function setupAdBlocking(sess) {
  // We always register the request wrapper below and gate the actual
  // blocking decision live off settings.adBlocking on every request. There
  // is only one onBeforeRequest slot per session, so if we skipped
  // registering entirely while the setting started off, turning it on later
  // in Settings would silently do nothing until a restart. Registering
  // unconditionally and checking live makes the toggle take effect the
  // moment the user flips it, in both directions.
  try {
    const blocker = await getSharedBlocker();

    if (typeof sess.registerPreloadScript !== 'function') {
      sess.registerPreloadScript = () => {};
    }
    // @ghostery's BlockingContext.enable() unconditionally calls
    // ipcMain.handle() for its two cosmetic-filter channels, so enabling a
    // SECOND session throws "Attempted to register a second handler".
    // Clear them first — the re-registered handlers still point at our
    // shared blocker, so cosmetic filtering keeps working for both sessions.
    try { ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters'); } catch {}
    try { ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled'); } catch {}
    blocker.enableBlockingInSession(sess);

    // ── Make "Ad blocking: off" actually mean off ──────────────────────────
    // enableBlockingInSession() wires up THREE things, and only one of them is
    // the request listener we re-register (and gate) below:
    //   1. onBeforeRequest      — network blocking (re-registered + gated here)
    //   2. cosmetic filtering   — element hiding, injected over IPC
    //   3. onHeadersReceived    — the engine's own CSP directives
    // (2) ran unconditionally, so switching the setting off still left every ad
    // slot collapsed by element-hiding rules — which is exactly why turning the
    // ad blocker off looked like it did nothing. It is now gated on the same
    // live setting the request path uses.
    const adBlockingOn = (url) => {
      const s = settingsStore.load();
      if (!s.adBlocking) return false;
      const host = hostnameOf(url || '');
      if (host && isSiteCompatibilityHost(host)) return false;
      const excl = s.adBlockExcludedDomains;
      if (Array.isArray(excl) && excl.length && host) {
        if (excl.some((d) => host === d || host.endsWith('.' + d))) return false;
      }
      return true;
    };
    const cosmeticImpl = blocker.onInjectCosmeticFilters;
    const mutationImpl = blocker.onIsMutationObserverEnabled;
    try { ipcMain.removeHandler('@ghostery/adblocker/inject-cosmetic-filters'); } catch {}
    try { ipcMain.removeHandler('@ghostery/adblocker/is-mutation-observer-enabled'); } catch {}
    ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (event, url, msg) => {
      if (!adBlockingOn(url)) return undefined;
      return cosmeticImpl(event, url, msg);
    });
    ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', (event) => {
      const u = (() => { try { return event.sender.getURL(); } catch { return ''; } })();
      if (!adBlockingOn(u)) return false;
      return mutationImpl(event);
    });
    // (3) needs no gate: setupHeaderPrivacy() runs right after us and registers
    // its own onHeadersReceived, and Electron allows exactly one listener per
    // event per session — so the engine's CSP listener is already replaced and
    // never runs. Registering a gated wrapper here would only risk clobbering
    // the cookie/CSP privacy handler on the delayed retry path below.

    // Wrap the blocker's onBeforeRequest so requests originating from
    // compatibility hosts (Sparx, Bedrock, etc. — school sites that need
    // unrestricted CDN access) bypass the engine entirely. Without this
    // wrap, EasyList/EasyPrivacy false-positives can take out Bedrock's
    // quiz image CDN. We still apply the 18+ block before delegating.
    const blockerOnBeforeRequest = blocker.onBeforeRequest.bind(blocker);
    addBeforeRequestHandler(sess, 'adblock', (details, cb) => {
      // 18+ enforcement first — must apply everywhere, including compat sites.
      const s2 = settingsStore.load();
      const reqHost = hostnameOf(details.url);
      if (s2.blockAdultSites && reqHost && isAdultDomain(reqHost)) {
        const isMain = details.resourceType === 'mainFrame';
        if (isMain && details.webContentsId) {
          try {
            const wc = webContents.fromId(details.webContentsId);
            if (wc && !wc.isDestroyed()) {
              wc.loadURL(`privoo://blocked/?url=${encodeURIComponent(details.url)}&reason=adult`).catch(() => {});
            }
          } catch {}
        }
        return cb({ cancel: true });
      }
      // Compat-host exemption: if the document making the request is a
      // school/edu site we marked as needing full compatibility, let
      // everything through. Top-level navigation to that host counts too.
      // NOTE: cb(null) here means "I have nothing to say about this request" —
      // it hands off to the next handler in the pipeline (the tracking-parameter
      // stripper), rather than answering "allow" and ending the chain.
      const sourceHost = documentBaseDomain(details.webContentsId) || hostnameOf(details.url);
      if (isSiteCompatibilityHost(sourceHost)) return cb(null);
      // Hand YouTube entirely to a user-installed content blocker (uBlock,
      // AdGuard, …) when one is present. Running Privoo's engine AND the
      // extension over the same YouTube requests fights over the player and
      // can leave it black until a refresh — so we fully step aside here.
      if ((isYouTubeHost(sourceHost) || isYouTubeHost(reqHost)) && hasContentBlockerExtension()) {
        return cb(null);
      }
      // Ad blocking itself — checked live on every request, not just once at
      // startup, so switching it off in Settings actually stops it instead
      // of continuing to run for the rest of the session.
      if (!s2.adBlocking) return cb(null);
      // Per-site ad-block exclusion — user toggled ads off for this host.
      const excl = s2.adBlockExcludedDomains;
      if (Array.isArray(excl) && excl.length && sourceHost) {
        if (excl.some((d) => sourceHost === d || sourceHost.endsWith('.' + d))) {
          return cb(null);
        }
      }
      // Spotify web-player ads: block ad/telemetry endpoints so the audio ads
      // never load (the in-page script skips any that do).
      if (isSpotifyAdRequest(details.url)) {
        stats.blockedAds++;
        if (details.webContentsId) {
          pageBlockedCounts.set(details.webContentsId, (pageBlockedCounts.get(details.webContentsId) || 0) + 1);
        }
        return cb({ cancel: true });
      }
      // Reset the per-page counter on a fresh main-frame navigation so each
      // page starts at 0 — keeps the omnibox shield accurate.
      if (details.resourceType === 'mainFrame' && details.webContentsId) {
        pageBlockedCounts.set(details.webContentsId, 0);
      }
      // Hand off to the real adblock engine, but watch the response so we can
      // tally blocks. This version of @ghostery/adblocker-electron does NOT
      // emit the 'request-blocked' / 'request-redirected' events we used to
      // listen for, so the global stats counter only moves if we count here,
      // off the actual response. A cancel or a redirect both mean a block.
      blockerOnBeforeRequest(details, (response) => {
        if (response && (response.cancel || response.redirectURL)) {
          stats.blockedAds++;
          if (details.webContentsId) {
            pageBlockedCounts.set(
              details.webContentsId,
              (pageBlockedCounts.get(details.webContentsId) || 0) + 1
            );
          }
          return cb(response);
        }
        // Engine had no opinion — keep the chain going.
        cb(null);
      });
    });
    console.log('Privoo: adblock engine (EasyList + EasyPrivacy + uBO) active');
    return;
  } catch (e) {
    console.warn('Privoo: adblock engine unavailable, using built-in list:', e.message);
    // A single delayed retry — covers a network blip at startup (DNS not
    // ready yet, VPN still connecting, etc). getSharedBlocker() resets its
    // own promise on failure, so this is a fresh attempt, not a repeat of
    // the same rejection. Re-registering onBeforeRequest below replaces the
    // fallback listener with the real one if this succeeds.
    if (!sess._adblockRetried) {
      sess._adblockRetried = true;
      setTimeout(() => { setupAdBlocking(sess).catch(() => {}); }, 15000);
    }
  }

  // Same pipeline slot name as the engine path, so if the delayed retry above
  // eventually succeeds it REPLACES this fallback rather than stacking on it.
  addBeforeRequestHandler(sess, 'adblock', (details, cb) => {
    const host = hostnameOf(details.url);

    // 18+ block: when the setting is on, cancel any main-frame navigation
    // (and embedded sub-frames) heading to an adult-classified domain, then
    // route the top-level webContents to the block page. will-navigate alone
    // misses script-driven redirects, popups, and the initial loadURL of a
    // freshly created tab, so we enforce here at the request layer.
    const s = settingsStore.load();
    if (s.blockAdultSites && host && isAdultDomain(host)) {
      const isMain = details.resourceType === 'mainFrame';
      if (isMain && details.webContentsId) {
        try {
          const wc = webContents.fromId(details.webContentsId);
          if (wc && !wc.isDestroyed()) {
            wc.loadURL(`privoo://blocked/?url=${encodeURIComponent(details.url)}&reason=adult`).catch(() => {});
          }
        } catch {}
      }
      return cb({ cancel: true });
    }

    // Same compat-host carve-out as the engine path above — keep school
    // sites unblocked even on the fallback list.
    const sourceHost = documentBaseDomain(details.webContentsId) || host;
    if (isSiteCompatibilityHost(sourceHost)) return cb(null);

    if (!s.adBlocking) return cb(null);

    // Spotify web-player ad / telemetry endpoints.
    if (isSpotifyAdRequest(details.url)) {
      stats.blockedAds++;
      if (details.webContentsId) {
        pageBlockedCounts.set(details.webContentsId, (pageBlockedCounts.get(details.webContentsId) || 0) + 1);
      }
      return cb({ cancel: true });
    }

    if (isBlockedHost(host)) {
      stats.blockedAds++;
      if (details.webContentsId) {
        pageBlockedCounts.set(
          details.webContentsId,
          (pageBlockedCounts.get(details.webContentsId) || 0) + 1
        );
      }
      return cb({ cancel: true });
    }
    if (details.resourceType === 'mainFrame' && details.webContentsId) {
      pageBlockedCounts.set(details.webContentsId, 0);
    }
    cb(null);
  });
}

// ---------------------------------------------------------------------------
// Header privacy: UA spoofing + third-party cookie blocking
// ---------------------------------------------------------------------------
function setupHeaderPrivacy(sess) {
  // Pin the session's accept-languages to the device locale so navigator.languages
  // matches the forced Accept-Language header below (and isn't the VPN's locale).
  const _langs = preferredLanguageList().join(',');
  try {
    if (settingsStore.load().spoofUserAgent) sess.setUserAgent(CHROME_UA, _langs);
    else sess.setUserAgent(sess.getUserAgent(), _langs);
  } catch { /* ignore */ }

  sess.webRequest.onBeforeSendHeaders((details, cb) => {
    const settings = settingsStore.load();
    const headers = details.requestHeaders;

    // Always serve the user's real language regardless of the VPN exit IP.
    {
      const al = acceptLanguageHeader();
      let had = false;
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'accept-language') { headers[key] = al; had = true; }
      }
      if (!had) headers['Accept-Language'] = al;
    }

    const reqHostname = hostnameOf(details.url);
    // Rewrite to the emulated device's identity instead of skipping the
    // rewrite outright, so it stays internally consistent (a request with a
    // mobile User-Agent but sec-ch-ua-mobile:?0 is itself a giveaway sites
    // can key off, and the point here is for the site to confidently serve
    // its mobile layout).
    const isMobileEmu = details.webContentsId && _mobileEmulatedDevices.has(details.webContentsId);
    if (isMobileEmu) {
      const profile = mobileProfileFor(details.webContentsId);
      for (const key of Object.keys(headers)) {
        const low = key.toLowerCase();
        if (!profile.clientHints && low.startsWith('sec-ch-ua')) { delete headers[key]; continue; }
        if (low === 'sec-ch-ua-mobile')             headers[key] = '?1';
        else if (low === 'sec-ch-ua-platform')       headers[key] = profile.secChUaPlatform;
        else if (low === 'sec-ch-ua-model')          headers[key] = profile.secChUaModel;
        else if (low === 'sec-ch-ua-form-factors')   headers[key] = '"Mobile"';
        else if (low === 'user-agent')               headers[key] = profile.ua;
      }
      if (!Object.keys(headers).some(k => k.toLowerCase() === 'user-agent')) headers['User-Agent'] = profile.ua;
    } else if (settings.spoofUserAgent || isGoogleAuthHost(reqHostname) || isByteDanceFamilyHost(reqHostname)) {
      const seenSpoofHeaders = new Set();
      for (const key of Object.keys(headers)) {
        const low = key.toLowerCase();
        seenSpoofHeaders.add(low);
        if (low === 'sec-ch-ua')                         headers[key] = SEC_CH_UA;
        else if (low === 'sec-ch-ua-mobile')             headers[key] = '?0';
        else if (low === 'sec-ch-ua-platform')           headers[key] = SEC_CH_UA_PLATFORM;
        else if (low === 'sec-ch-ua-full-version-list')  headers[key] = SEC_CH_UA_FULL_VERSION_LIST;
        else if (low === 'sec-ch-ua-full-version')       headers[key] = `"${CHROME_VERSION_FULL}"`;
        else if (low === 'sec-ch-ua-platform-version')   headers[key] = SEC_CH_UA_PLATFORM_VERSION;
        else if (low === 'sec-ch-ua-arch')               headers[key] = '"x86"';
        else if (low === 'sec-ch-ua-bitness')            headers[key] = '"64"';
        else if (low === 'sec-ch-ua-model')              headers[key] = '""';
        else if (low === 'sec-ch-ua-form-factors')       headers[key] = '"Desktop"';
        else if (low === 'user-agent')                   headers[key] = CHROME_UA;
      }
      if (!seenSpoofHeaders.has('user-agent')) headers['User-Agent'] = CHROME_UA;
      if (isGoogleAuthHost(reqHostname) || isByteDanceFamilyHost(reqHostname)) {
        if (!seenSpoofHeaders.has('sec-ch-ua')) headers['sec-ch-ua'] = SEC_CH_UA;
        if (!seenSpoofHeaders.has('sec-ch-ua-mobile')) headers['sec-ch-ua-mobile'] = '?0';
        if (!seenSpoofHeaders.has('sec-ch-ua-platform')) headers['sec-ch-ua-platform'] = SEC_CH_UA_PLATFORM;
        if (!seenSpoofHeaders.has('sec-ch-ua-full-version-list')) headers['sec-ch-ua-full-version-list'] = SEC_CH_UA_FULL_VERSION_LIST;
        if (!seenSpoofHeaders.has('sec-ch-ua-platform-version')) headers['sec-ch-ua-platform-version'] = SEC_CH_UA_PLATFORM_VERSION;
      }
    }

    if (settings.doNotTrack) headers.DNT = '1';

    if (settings.strongerTrackingProtection) {
      // Global Privacy Control — tells compliant sites not to sell/share data.
      headers['Sec-GPC'] = '1';
      // Minimize Referer on cross-origin requests: send origin only, not path+query.
      const reqOrigin = (() => { try { return new URL(details.url).origin; } catch { return ''; } })();
      const pageOrigin = (() => {
        const wc = details.webContentsId ? webContents.fromId(details.webContentsId) : null;
        if (!wc || wc.isDestroyed()) return '';
        try { return new URL(wc.getURL()).origin; } catch { return ''; }
      })();
      if (reqOrigin && pageOrigin && reqOrigin !== pageOrigin) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'referer') {
            headers[key] = pageOrigin + '/';
            break;
          }
        }
      }
    }

    // A top-level document request IS the first party — whatever it sets or sends
    // is by definition first-party, so it must never be treated as third-party.
    // We can't decide that by comparing against documentBaseDomain(): during a
    // navigation wc.getURL() still returns the PREVIOUS page, so a main-frame load
    // was being compared against e.g. privoo://newtab ("newtab") and stripped as
    // cross-site. Sites on isRelaxedThirdPartyCookieHost() were exempt and stayed
    // signed in, which is why this only ever showed up on sites missing from that
    // list (Spotify) — the allowlist was masking the bug, not fixing it.
    if (settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame') {
      const reqDomain  = baseDomain(reqHostname);
      const pageDomain = documentBaseDomain(details.webContentsId);
      if (pageDomain && reqDomain && reqDomain !== pageDomain && !isRelaxedThirdPartyCookieHost(reqHostname)) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'cookie') { delete headers[key]; stats.blockedCookies++; }
        }
      }
    }

    cb({ requestHeaders: headers });
  });

  // Strip known tracking URL parameters (utm_*, fbclid, gclid, etc.) when
  // stronger tracking protection is enabled. We redirect to a cleaned URL so
  // the page still loads — the only change is removal of tracker params.
  // Runs as the second handler in the shared onBeforeRequest pipeline. It used
  // to register its own listener, which silently replaced the ad blocker's.
  addBeforeRequestHandler(sess, 'tracking-params', (details, cb) => {
    if (!settingsStore.load().strongerTrackingProtection) return cb(null);
    if (!/^https?:/i.test(details.url)) return cb(null);
    if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') {
      return cb(null);
    }
    let u;
    try { u = new URL(details.url); } catch { return cb(null); }
    const TRACKING_PARAMS = /^(utm_\w+|fbclid|gclid|gad_source|gbraid|wbraid|dclid|msclkid|twclid|mc_eid|igshid|_ga|yclid|zanpid|srsltid|epik|ref_src|ref_url|ttclid|s_kwcid|ef_id|affiliate_id|cmpid|adid|ad_id|campaignid|campaign_id|adgroupid)$/i;
    let stripped = false;
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) { u.searchParams.delete(key); stripped = true; }
    }
    if (!stripped) return cb(null);
    cb({ redirectURL: u.toString() });
  });

  // Strip third-party Set-Cookie; also strip CSP for Google auth so UA overrides can inject
  sess.webRequest.onHeadersReceived((details, cb) => {
    const settings = settingsStore.load();
    const headers = details.responseHeaders || {};
    const hostname = hostnameOf(details.url);

    // Remove CSP for the actual Google sign-in pages ONLY, so our preload
    // script injection is not blocked there. executeJavaScript at dom-ready
    // also bypasses CSP, but stripping it here is a belt+suspenders — scoped
    // tightly to accounts.google.com / myaccount.google.com, NOT the whole
    // Google/YouTube/doubleclick family (see isGoogleSignInPage() above).
    if (isGoogleSignInPage(hostname)) {
      for (const key of Object.keys(headers)) {
        const low = key.toLowerCase();
        if (low === 'content-security-policy' || low === 'content-security-policy-report-only') {
          delete headers[key];
        }
      }
    }

    // See the matching note in onBeforeSendHeaders: a main-frame document response
    // is first-party by definition. Stripping its Set-Cookie was dropping sites'
    // own login cookies on navigation (they survived in memory for the session,
    // then vanished on restart — Spotify's sign-out-every-launch bug).
    if (settings.blockThirdPartyCookies && details.resourceType !== 'mainFrame') {
      const reqDomain  = baseDomain(hostname);
      const pageDomain = documentBaseDomain(details.webContentsId);
      if (pageDomain && reqDomain && reqDomain !== pageDomain && !isRelaxedThirdPartyCookieHost(hostname)) {
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'set-cookie') delete headers[key];
        }
      }
    }
    cb({ responseHeaders: headers });
  });
}

// ---------------------------------------------------------------------------
// Download tracking
// ---------------------------------------------------------------------------
// Download Booster — splits a large download into several parallel
// range-requested chunks instead of one single stream, the same idea as
// classic download accelerators. Only worth it for big files whose server
// actually advertises range support; anything else just isn't faster split
// up, so this probes first and quietly declines rather than forcing it.
const DOWNLOAD_BOOST_MIN_BYTES = 8 * 1024 * 1024; // below this, one stream is plenty
const _boostBypassUrls = new Set();
const DOWNLOAD_BOOST_CHUNKS = 6;

function probeRangeSupport(url) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch { return resolve(null); }
    const lib = u.protocol === 'http:' ? require('http') : require('https');
    const req = lib.request(u, { method: 'GET', headers: { Range: 'bytes=0-0' }, timeout: 8000 }, (res) => {
      res.resume(); // discard the 1-byte probe body
      const total = parseInt(String(res.headers['content-range'] || '').split('/')[1] || '', 10);
      const ranges = res.statusCode === 206 && Number.isFinite(total) && total > 0;
      resolve(ranges ? { totalBytes: total } : null);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

// Downloads one byte range into `fd` at the matching file offset. Resolves
// the number of bytes actually written; rejects on any network failure so
// the caller can abandon the whole boosted attempt rather than saving a
// silently-truncated file.
function fetchRange(url, fd, start, end, onBytes) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch (e) { return reject(e); }
    const lib = u.protocol === 'http:' ? require('http') : require('https');
    const req = lib.request(u, { method: 'GET', headers: { Range: `bytes=${start}-${end}` }, timeout: 20000 }, (res) => {
      if (res.statusCode !== 206 && res.statusCode !== 200) {
        res.resume();
        return reject(new Error('Unexpected status ' + res.statusCode));
      }
      let pos = start;
      res.on('data', (chunk) => {
        try {
          fs.writeSync(fd, chunk, 0, chunk.length, pos);
          pos += chunk.length;
          onBytes(chunk.length);
        } catch (e) { req.destroy(); reject(e); }
      });
      res.on('end', () => resolve(pos - start));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Chunk timed out')));
    req.on('error', reject);
    req.end();
  });
}

async function runBoostedDownload(url, savePath, id, record, totalBytes) {
  const chunkSize = Math.ceil(totalBytes / DOWNLOAD_BOOST_CHUNKS);
  const fd = fs.openSync(savePath, 'w');
  let received = 0;
  let lastBroadcast = 0;
  const bump = (n) => {
    received += n;
    const now = Date.now();
    if (now - lastBroadcast < 200 && received < totalBytes) return; // throttle UI updates
    lastBroadcast = now;
    const patch = { receivedBytes: received, state: 'progressing' };
    downloadStore.update(id, patch);
    broadcastAll('download-update', { ...record, ...patch });
  };
  try {
    const tasks = [];
    for (let start = 0; start < totalBytes; start += chunkSize) {
      const end = Math.min(start + chunkSize - 1, totalBytes - 1);
      tasks.push(fetchRange(url, fd, start, end, bump));
    }
    await Promise.all(tasks);
    fs.closeSync(fd);
    const patch = { state: 'completed', endTime: Date.now(), receivedBytes: totalBytes };
    downloadStore.update(id, patch);
    activeDownloads.delete(id);
    broadcastAll('download-update', { ...record, ...patch });
  } catch (e) {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(savePath); } catch {}
    console.warn('Privoo: boosted download failed, no partial file kept:', e.message);
    const patch = { state: 'interrupted', endTime: Date.now() };
    downloadStore.update(id, patch);
    activeDownloads.delete(id);
    broadcastAll('download-update', { ...record, ...patch });
  }
}

function setupDownloads(sess) {
  // url -> timestamp of the last time we started downloading it. Used only
  // by the duplicate guard below.
  const _recentDownloadStarts = new Map();

  sess.on('will-download', (event, item, wc) => {
    const settings = settingsStore.load();

    // Duplicate guard. The same URL starting again within a few seconds is a
    // double-click or an impatient second click on a slow link, not an
    // intention to keep two copies — and the second one silently lands as
    // "file (1).zip", so nothing tells you it happened. Short window on
    // purpose: downloading the same file again ten seconds later is a real
    // decision and is left alone.
    const dlUrl = item.getURL();
    const lastAt = _recentDownloadStarts.get(dlUrl) || 0;
    if (Date.now() - lastAt < 4000) {
      item.cancel();
      return;
    }
    _recentDownloadStarts.set(dlUrl, Date.now());
    // Keep the map from growing for the life of the process.
    if (_recentDownloadStarts.size > 64) {
      const cutoff = Date.now() - 60000;
      for (const [k, t] of _recentDownloadStarts) if (t < cutoff) _recentDownloadStarts.delete(k);
    }
    // A probe that declined to boost re-triggers this same download once,
    // normally — without this guard that retry would probe again and loop.
    const boostBypass = _boostBypassUrls.delete(item.getURL());
    const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let savePath = path.join(
      settings.downloadPath || app.getPath('downloads'),
      item.getFilename(),
    );

    if (settings.askDownloadPath) {
      const picked = dialog.showSaveDialogSync(BrowserWindow.getFocusedWindow(), {
        title: 'Save download',
        defaultPath: savePath,
      });
      if (!picked) {
        item.cancel();
        return;
      }
      savePath = picked;
    }

    const record = {
      id,
      filename: item.getFilename(),
      url: item.getURL(),
      savePath,
      mime: item.getMimeType(),
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      startTime: Date.now(),
      endTime: null,
    };
    downloadStore.add(record);
    // The id of the page that started this. A site that opens a new tab just
    // to serve a file leaves that tab behind on a blank page; the renderer
    // uses this to find it and close it, the way every other browser does.
    let initiatorId = 0;
    try { initiatorId = wc && !wc.isDestroyed() ? wc.id : 0; } catch { /* gone already */ }
    broadcastAll('download-update', { ...record, initiatorId });

    if (settings.downloadBoosterEnabled && !boostBypass) {
      const downloadUrl = item.getURL();
      item.cancel();
      probeRangeSupport(downloadUrl).then((info) => {
        if (info && info.totalBytes >= DOWNLOAD_BOOST_MIN_BYTES) {
          record.totalBytes = info.totalBytes;
          downloadStore.update(id, { totalBytes: info.totalBytes });
          broadcastAll('download-boost-started', { id, filename: record.filename });
          runBoostedDownload(downloadUrl, savePath, id, record, info.totalBytes);
        } else {
          // Not worth boosting (small file or server doesn't support ranges) —
          // the item is already cancelled, so re-trigger a normal download,
          // marked to bypass the boost check this next time around.
          downloadStore.remove(id);
          _boostBypassUrls.add(downloadUrl);
          try { if (wc && !wc.isDestroyed()) wc.downloadURL(downloadUrl); } catch {}
        }
      });
      return;
    }

    item.setSavePath(savePath);
    activeDownloads.set(id, item);

    item.on('updated', (_e, state) => {
      const received = item.getReceivedBytes();
      const patch = { receivedBytes: received, state };
      downloadStore.update(id, patch);
      broadcastAll('download-update', { ...record, ...patch });
    });

    item.once('done', (_e, state) => {
      const patch = { state, endTime: Date.now(), receivedBytes: item.getReceivedBytes() };
      downloadStore.update(id, patch);
      activeDownloads.delete(id);
      broadcastAll('download-update', { ...record, ...patch });
    });
  });
}

function broadcastAll(channel, payload) {
  // Send to every webContents — BrowserWindows AND <webview> guests.
  // The internal pages (privoo://downloads, history, etc.) live inside
  // webviews; iterating only top-level windows means they never get IPC
  // updates and have to be manually refreshed. webContents.getAllWebContents()
  // covers both.
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) {
      try { wc.send(channel, payload); } catch { /* ignore destroyed contents */ }
    }
  }
}

function broadcastSettings(settings) {
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.isDestroyed()) wc.send('settings-updated', settings);
  }
}

function applyRuntimeSettings(settings) {
  // Set prefers-color-scheme at the engine, not per tab. A CDP override only
  // lands once the debugger has attached to that specific page, so any tab
  // that painted first — or whose attach failed — showed a site's light theme
  // inside a dark browser. This applies to every web contents at once,
  // including ones created later, with nothing to race.
  try {
    nativeTheme.themeSource = settings.darkMode ? 'dark' : 'light';
  } catch { /* older Electron, or headless — the CDP path still covers it */ }

  if (!defaultUserAgent) defaultUserAgent = session.defaultSession.getUserAgent();
  session.defaultSession.setUserAgent(
    settings.spoofUserAgent ? CHROME_UA : defaultUserAgent,
    preferredLanguageList().join(','),
  );

  applyProxyAll(settings);

  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || wc.getType() !== 'webview') continue;
    applyGuestBackground(wc, settings);
    try {
      wc.setWebRTCIPHandlingPolicy(
        settings.webrtcProtection ? 'default_public_interface_only' : 'default',
      );
    } catch { /* ignore */ }
    // Keep each live tab's `prefers-color-scheme` in sync. This used to pin
    // every compatibility host to light, which is how Google and TikTok ended
    // up stuck on their light themes: they are on that list for bot
    // detection, and any settings write dragged them back to light and left
    // them there. prefersDarkFor() is now the only thing that decides.
    try {
      if (wc.debugger && wc.debugger.isAttached()) {
        const url = (() => { try { return wc.getURL(); } catch { return ''; } })();
        wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: prefersDarkFor(url, settings) ? 'dark' : 'light' }],
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    if (win.privooMainWindow) applyWindowTranslucency(win, settings);
    else win.setBackgroundColor(settings.darkMode ? '#202024' : '#ffffff');
  }

  try {
    app.configureHostResolver({
      // 'secure' mode = DoH only, never fall back to plaintext system DNS.
      // That's what prevents the leak users would otherwise get when the
      // DoH server is temporarily unreachable.
      secureDnsMode: settings.dnsOverHttps ? 'secure' : 'off',
      secureDnsServers: resolveDohServers(settings),
    });
  } catch (e) {
    console.warn('Privoo: host resolver update failed:', e.message);
  }

  // React to the system tray toggle without restart. Toggling it off
  // destroys the tray icon; toggling on re-creates it.
  if (settings.minimizeToTray) {
    ensureTray();
  } else if (_tray && !_tray.isDestroyed()) {
    try { _tray.destroy(); } catch {}
    _tray = null;
  }

  // Discord RPC — start/stop in response to the setting toggle.
  if (settings.discordRpc && !_discordRpc) initDiscordRpc();
  else if (!settings.discordRpc && _discordRpc) shutdownDiscordRpc();
}

// Cosmetic (element-hiding) rules are injected into a page once, at load, and
// there is no way to un-inject them. So flipping ad blocking off only fully
// takes hold after a reload — otherwise the ad slots stay collapsed and the
// setting looks broken. Reload the open web pages when (and only when) the
// value actually changes.
function reloadWebPagesForAdBlockChange() {
  for (const wc of webContents.getAllWebContents()) {
    try {
      if (wc.isDestroyed() || wc.getType() !== 'webview') continue;
      const u = wc.getURL() || '';
      if (!/^https?:/i.test(u)) continue;
      wc.reload();
    } catch { /* tab went away mid-loop */ }
  }
}

async function saveSettingsAndBroadcast(patch) {
  const hadExtPatch = patch && Object.prototype.hasOwnProperty.call(patch, 'extensions');
  const adBlockBefore = settingsStore.load().adBlocking;
  const updated = settingsStore.save(patch || {});
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'adBlocking')
      && !!adBlockBefore !== !!updated.adBlocking) {
    reloadWebPagesForAdBlockChange();
  }
  applyRuntimeSettings(updated);
  if (hadExtPatch) {
    try {
      await syncExtensionsFromSettings(updated);
    } catch (e) {
      console.warn('Privoo: extension sync failed:', e.message);
    }
  }
  broadcastSettings(updated);
  return updated;
}

function cutoffForRange(range) {
  const now = Date.now();
  switch (range) {
    case 'hour': return now - 60 * 60 * 1000;
    case 'day': return now - 24 * 60 * 60 * 1000;
    case 'week': return now - 7 * 24 * 60 * 60 * 1000;
    case 'fourWeeks': return now - 28 * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function mergeBookmarks(existing = [], incoming = []) {
  const merged = [];
  const seen = new Set();
  let added = 0;

  for (const item of [...existing, ...incoming]) {
    const url = String(item?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    merged.push({
      name: String(item.name || item.title || url).slice(0, 120),
      url,
      addedAt: Number(item.addedAt) || Date.now(),
    });
    if (!existing.some((old) => old?.url === url)) added++;
  }

  return { bookmarks: merged.slice(0, 5000), added };
}

async function clearSessionData({ cache, cookies, siteData }) {
  const result = {};
  if (cache) {
    await session.defaultSession.clearCache();
    result.cache = true;
  }

  const storages = [];
  if (cookies) storages.push('cookies');
  if (siteData) {
    storages.push('localstorage', 'indexdb', 'websql', 'cachestorage', 'serviceworkers', 'filesystem');
  }
  if (storages.length) {
    try {
      await session.defaultSession.clearStorageData({ storages: [...new Set(storages)] });
      result.siteData = true;
    } catch {
      for (const storage of [...new Set(storages)]) {
        try { await session.defaultSession.clearStorageData({ storages: [storage] }); } catch { /* ignore */ }
      }
      result.siteData = true;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Session hardening
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Proxy / Tor
// ---------------------------------------------------------------------------
const _proxiedSessions = new Set();
let _torProc = null;
let _torPort = null;

function torPortOf(settings) {
  const p = parseInt(settings.proxyTorPort, 10);
  return (p >= 1 && p <= 65535) ? p : 9100;
}

// Control port sits one above the SOCKS port. mariana hosting needs it to
// create hidden services; ordinary .onion browsing doesn't touch it.
function torControlPortOf(settings) { return torPortOf(settings) + 1; }
function torControlCookiePath() {
  return path.join(app.getPath('userData'), 'tor-data', 'control_auth_cookie');
}

function proxyRulesFor(settings) {
  if (settings.proxyMode === 'tor') return `socks5://127.0.0.1:${torPortOf(settings)}`;
  if (settings.proxyMode === 'manual') {
    const raw = String(settings.proxyUrl || '').trim();
    if (raw) return raw;
  }
  return null;
}

// Converts a "socks5://host:port" / "http://host:port" style setting into
// the directive PAC scripts use ("SOCKS5 host:port" / "PROXY host:port").
function pacProxyDirective(raw) {
  try {
    const u = new URL(raw);
    const hostport = `${u.hostname}:${u.port || (u.protocol.startsWith('socks') ? 1080 : 8080)}`;
    if (u.protocol.startsWith('socks5')) return `SOCKS5 ${hostport}`;
    if (u.protocol.startsWith('socks')) return `SOCKS ${hostport}`;
    return `PROXY ${hostport}`;
  } catch { return 'DIRECT'; }
}

// .onion addresses only resolve over Tor's own SOCKS proxy, no matter what
// the user's general proxy setting is — so route them through Tor via PAC
// unconditionally, and fall back to whatever proxyMode already dictates for
// everything else.
function buildPacScript(settings) {
  const torPort = torPortOf(settings);
  let fallback = 'DIRECT';
  if (settings.proxyMode === 'tor') fallback = `SOCKS5 127.0.0.1:${torPort}`;
  else if (settings.proxyMode === 'manual') {
    const raw = String(settings.proxyUrl || '').trim();
    if (raw) fallback = pacProxyDirective(raw);
  }
  return `function FindProxyForURL(url, host) {
    if (shExpMatch(host, "*.onion")) return "SOCKS5 127.0.0.1:${torPort}";
    return "${fallback}";
  }`;
}

function applyProxyToSession(sess, settings) {
  try {
    const pac = buildPacScript(settings);
    const pacScript = `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pac, 'utf8').toString('base64')}`;
    sess.setProxy({ pacScript, proxyBypassRules: '<local>' }).catch(() => {});
  } catch { /* ignore */ }
}

// Lazily brings up the Tor SOCKS proxy the first time an .onion address is
// visited, independent of the user's proxyMode setting. Returns true if Tor
// is already up (safe to navigate now), false if it was just launched (the
// caller should retry the navigation after a short delay).
function ensureTorForOnion() {
  if (_torProc) return true;
  launchTor();
  return false;
}

function torBinaryPath() {
  const names = process.platform === 'win32' ? ['tor.exe'] : ['tor'];
  if (process.resourcesPath) {
    for (const n of names) {
      const p = path.join(process.resourcesPath, 'tor', n);
      if (fs.existsSync(p)) return p;
    }
  }
  return names[0]; // fall back to PATH
}

function launchTor() {
  const port = torPortOf(settingsStore.load());
  // Already running on the right port — nothing to do. If the port changed,
  // restart Tor so it listens where we route.
  if (_torProc && _torPort === port) return;
  stopTor();
  _torPort = port;
  const bin = torBinaryPath();
  const dataDir = path.join(app.getPath('userData'), 'tor-data');
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch { /* ignore */ }
  try {
    // ControlPort + cookie auth let mariana create/destroy hidden services.
    // CookieAuthFileGroupReadable stays off (default) so only our user reads it.
    const ctrlPort = torControlPortOf(settingsStore.load());
    _torProc = spawn(bin, [
      '--SocksPort', `127.0.0.1:${port}`,
      '--ControlPort', `127.0.0.1:${ctrlPort}`,
      '--CookieAuthentication', '1',
      '--DataDirectory', dataDir,
    ], {
      stdio: 'ignore', windowsHide: true,
    });
    _torProc.on('error', () => {
      // Tor isn't installed / couldn't launch — fall back to direct so the
      // browser still works instead of pointing at a dead proxy port.
      _torProc = null;
      for (const sess of _proxiedSessions) {
        try { sess.setProxy({ mode: 'direct' }).catch(() => {}); } catch { /* ignore */ }
      }
    });
    _torProc.on('exit', () => { _torProc = null; });
  } catch { _torProc = null; }
}

function stopTor() {
  if (_torProc) { try { _torProc.kill(); } catch { /* ignore */ } _torProc = null; }
}

function applyProxyAll(settings) {
  // Keep Tor alive if the browsing proxy wants it OR a .mariana site is
  // being hosted (hosting is independent of the browsing proxy setting).
  if (settings.proxyMode === 'tor') launchTor();
  else if (mariana.runningCount() === 0) stopTor();
  for (const sess of _proxiedSessions) applyProxyToSession(sess, settings);
}

// ── Cookie durability ────────────────────────────────────────────────────────
// Chromium commits cookie writes to disk on a ~30s timer, and with
// minimizeToTray on (the default) Privoo's process usually dies by being
// KILLED — OS shutdown, Task Manager — never by a graceful quit, because
// "closing" the browser only hides it. Any cookie written in the last commit
// window dies with the process. Sites with long-lived static cookies (Google,
// GitHub) never notice; sites that continuously ROTATE their auth cookies
// (Spotify's sp_dc, TikTok's device tokens) come back presenting a stale,
// server-side-superseded token and treat the user as signed out / a brand-new
// suspicious device. Reproduced deterministically: a cookie rewritten every 2s
// lost its last ~10s of writes on a tray-hide + kill.
//
// Fix: flush the cookie store shortly after any cookie change. Schedule-once
// (not a resetting debounce) so a steady stream of rotations can't starve the
// flush — worst case a write sits unflushed for FLUSH_DELAY_MS instead of 30s.
const FLUSH_DELAY_MS = 3000;
const _cookieFlushTimers = new WeakMap();
function scheduleCookieFlush(sess) {
  if (_cookieFlushTimers.has(sess)) return;
  _cookieFlushTimers.set(sess, setTimeout(() => {
    _cookieFlushTimers.delete(sess);
    try { sess.cookies.flushStore().catch(() => {}); } catch { /* session gone */ }
  }, FLUSH_DELAY_MS));
}
// Belt-and-braces for "user closes the window, OS kills the hidden process
// later": force everything to disk the moment the browser goes to the tray.
function flushAllCookieStores() {
  try { session.defaultSession.cookies.flushStore().catch(() => {}); } catch {}
  for (const sess of _proxiedSessions) {
    try { sess.cookies.flushStore().catch(() => {}); } catch {}
  }
}

async function hardenSession(sess) {
  await setupAdBlocking(sess);
  setupHeaderPrivacy(sess);
  setupDownloads(sess);
  _proxiedSessions.add(sess);
  applyProxyToSession(sess, settingsStore.load());
  sess.cookies.on('changed', () => scheduleCookieFlush(sess));

  sess.setPermissionRequestHandler((wc, permission, cb) => {
    const settings = settingsStore.load();
    if (permission === 'geolocation') return cb(!!settings.allowGeolocation);
    // Hard-deny APIs that have no real use in a privacy browser. We deliberately
    // do NOT block publickey-credentials-{get,create} — modern OAuth (Google
    // gsi/transform, Microsoft, GitHub etc.) hands out the auth token via the
    // WebAuthn / Credentials API, and denying it causes blank result pages and
    // "verify your account" loops. Users can still dismiss the Windows Hello
    // prompt if they don't want to use a passkey.
    const denied = ['notifications', 'midi', 'midiSysex', 'hid', 'serial', 'usb'];
    cb(!denied.includes(permission));
  });
  sess.setPermissionCheckHandler(() => true);
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
function resolveIcon() {
  // extraResources places both logo.ico and logo.png outside the ASAR so the
  // window manager / taskbar can read them from the real filesystem.
  // On Windows prefer .ico (native multi-resolution); on Linux prefer .png.
  const byPlatform = process.platform === 'win32'
    ? ['logo.ico', 'logo.png']
    : ['logo.png', 'logo.ico'];
  if (process.resourcesPath) {
    for (const name of byPlatform) {
      const rp = path.join(process.resourcesPath, name);
      if (fs.existsSync(rp)) return rp;
    }
  }
  for (const name of byPlatform) {
    const p = path.join(__dirname, name);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

// Chrome-style "Who's using Privoo?" launcher. A lightweight frameless window
// shown at startup (when 2+ profiles exist and none is pinned) and openable any
// time from the toolbar avatar → Manage profiles.
function createProfilePicker() {
  if (profilePickerWin && !profilePickerWin.isDestroyed()) {
    profilePickerWin.focus();
    return profilePickerWin;
  }
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 700,
    height: 600,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Privoo Profiles',
    icon: resolveIcon(),
    backgroundColor: '#16161c',
    ...(isMac
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 14 } }
      : { frame: false }
    ),
    webPreferences: {
      preload: path.join(__dirname, 'profile-picker-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(RENDERER_DIR, 'internal', 'profile-picker.html'));
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    profilePickerWin = null;
    // If the picker is closed without choosing a profile and no browser
    // window is open, quit — the user dismissed the launcher.
    if (BrowserWindow.getAllWindows().length === 0) app.quit();
  });
  profilePickerWin = win;
  return win;
}

function semiTransparencySupported() {
  if (process.platform === 'darwin') return true;
  if (process.platform !== 'win32') return false;
  const build = Number(String(require('os').release()).split('.')[2] || 0);
  return build >= 22000;
}

function wantsSemiTransparency(settings) {
  return semiTransparencySupported()
    && !!settings.semiTransparent
    && !!settings.disclaimerAccepted;
}

function applyGuestBackground(wc, settings) {
  if (!wc || wc.isDestroyed()) return;
  try {
    const url = wc.getURL() || '';
    const seeThrough = wantsSemiTransparency(settings) && url.startsWith('privoo://');
    wc.setBackgroundColor(seeThrough ? '#00000000' : (settings.darkMode ? '#202024' : '#ffffff'));
  } catch { /* ignore */ }
}

function applyWindowTranslucency(win, settings) {
  if (!win || win.isDestroyed()) return;
  const on = wantsSemiTransparency(settings);
  const base = on ? '#00000000' : (settings.darkMode ? '#202024' : '#ffffff');
  try {
    win.setBackgroundColor(base);
    if (!win.webContents.isDestroyed()) win.webContents.setBackgroundColor?.(base);
    if (process.platform === 'win32') win.setBackgroundMaterial(on ? 'acrylic' : 'none');
    else if (process.platform === 'darwin') win.setVibrancy(on ? 'under-window' : null);
  } catch (e) {
    console.warn('Privoo: translucency update failed:', e.message);
  }
}

function createWindow(opts = {}) {
  const isMac = process.platform === 'darwin';
  const settings = settingsStore.load();
  const isIncognito = !!opts.incognito;
  const useSession = opts.session || session.defaultSession;

  // Restore the window's last size and position from settings. Default to
  // 1280×820 centered. Validate against the current display work area so a
  // window saved on a now-disconnected monitor doesn't open off-screen.
  const saved = settings.windowState || {};
  const { screen } = require('electron');
  const { width: dispW, height: dispH, x: dispX, y: dispY } =
    screen.getPrimaryDisplay().workArea;
  // Bigger default so the first launch on a modern display doesn't look
  // cramped. Capped against the actual work area below so it never lands
  // off-screen on smaller monitors.
  let width  = Number.isFinite(saved.width)  ? Math.max(680, Math.min(saved.width,  dispW)) : Math.min(1480, dispW - 40);
  let height = Number.isFinite(saved.height) ? Math.max(480, Math.min(saved.height, dispH)) : Math.min(960,  dispH - 40);
  let x = Number.isFinite(saved.x) ? saved.x : undefined;
  let y = Number.isFinite(saved.y) ? saved.y : undefined;
  // Bound x/y to a visible display so a stale value from a removed monitor
  // doesn't spawn the window off-screen.
  if (x != null) {
    const inAnyDisplay = screen.getAllDisplays().some(d =>
      x >= d.workArea.x - 50 && x + 200 <= d.workArea.x + d.workArea.width
    );
    if (!inAnyDisplay) { x = undefined; y = undefined; }
  }

  // Rounded corners are left to the OS. Windows 11 automatically rounds
  // frameless windows via DWM.
  const isFirstRun = !settings.disclaimerAccepted;

  // First run: open at a generous fixed size, centred, with resizing locked
  // so the setup wizard always has a stable, comfortable canvas. Resizing is
  // re-enabled by the 'setup-finished' IPC once the wizard completes.
  if (isFirstRun) {
    width  = Math.min(1380, dispW - 48);
    height = Math.min(900, dispH - 48);
    x = undefined;
    y = undefined;
  }

  const translucent = !isFirstRun && wantsSemiTransparency(settings);

  const win = new BrowserWindow({
    width, height, x, y,
    minWidth: 680,
    minHeight: 480,
    resizable: !isFirstRun,
    roundedCorners: true,
    ...(isMac
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 11 } }
      : { frame: false }
    ),
    ...(translucent
      ? (isMac ? { vibrancy: 'under-window' } : { backgroundMaterial: 'acrylic' })
      : {}
    ),
    backgroundColor: translucent ? '#00000000' : (settings.darkMode ? '#202024' : '#ffffff'),
    title: isIncognito ? 'Privoo Incognito' : 'Privoo',
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      session: useSession,
      // Pass the incognito partition synchronously so the renderer knows
      // it's private BEFORE it creates its first tab. The did-finish-load
      // 'incognito-mode' IPC arrives too late for that.
      additionalArguments: isIncognito
        ? [`--privoo-incognito-partition=${opts.partition || ''}`]
        : [],
    },
  });
  win.privooMainWindow = true;
  if (!isIncognito && saved.maximized) win.maximize();

  win.loadFile(path.join(RENDERER_DIR, 'index.html'));

  // Defence-in-depth: when the shell renderer attaches a <webview>, force
  // the safe webPreferences regardless of what the tag says. If our own
  // renderer ever has an XSS, this stops the attacker from injecting a
  // <webview nodeIntegration> to break out of the sandbox.
  win.webContents.on('will-attach-webview', (_e, webPreferences, params) => {
    delete webPreferences.preloadURL;
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.webSecurity = true;
    // Keep hidden/background tabs fully alive. Inactive webviews are set to
    // `visibility: hidden` in the renderer, which makes Chromium treat the
    // guest page as occluded and throttle its timers + media/compositor
    // pipeline. YouTube's player, initialised or resumed while throttled,
    // frequently paints a black frame that only clears on a manual refresh.
    // Disabling background throttling keeps the video pipeline warm so
    // switching to a YouTube tab shows the frame immediately.
    webPreferences.backgroundThrottling = false;
    // Enable the built-in Chromium PDF viewer so opening a .pdf actually
    // renders it in-tab instead of downloading it.
    webPreferences.plugins = true;
    // Block file:// and other unexpected schemes — let the renderer
    // explicitly opt into them via internal navigation if needed.
    // Block data:/javascript: src (real XSS vectors). file:// is allowed —
    // a browser legitimately opens local .html/.pdf files the user picked
    // or that the OS handed us as a default-app file association.
    if (params && params.src && /^(data|javascript):/i.test(params.src)) {
      params.src = 'about:blank';
    }
  });

  win.webContents.on('did-attach-webview', (_e, guest) => {
    const sync = () => applyGuestBackground(guest, settingsStore.load());
    guest.on('did-navigate', sync);
    guest.on('did-navigate-in-page', sync);
    guest.on('dom-ready', sync);
    sync();
    // Feed this tab's navigations to any extension listening on
    // chrome.webNavigation. No-ops when nothing has subscribed.
    try { extensionApiHost.watchNavigation(guest); } catch { /* guest already gone */ }

    // A tab whose renderer dies leaves a blank frame with no way back, and a
    // hung one just freezes with no explanation. Tell the shell in both cases
    // so it can offer a reload instead of looking broken.
    guest.on('render-process-gone', (_ev, details) => {
      const reason = (details && details.reason) || 'crashed';
      console.warn('Privoo: tab renderer gone:', reason);
      try {
        if (!win.isDestroyed()) win.webContents.send('tab-renderer-gone', { guestId: guest.id, reason });
      } catch { /* window closing */ }
    });
    guest.on('unresponsive', () => {
      try {
        if (!win.isDestroyed()) win.webContents.send('tab-unresponsive', { guestId: guest.id });
      } catch { /* window closing */ }
    });
    guest.on('responsive', () => {
      try {
        if (!win.isDestroyed()) win.webContents.send('tab-responsive', { guestId: guest.id });
      } catch { /* window closing */ }
    });
  });

  win.on('maximize',   () => win.webContents.send('window-state', true));
  win.on('unmaximize', () => win.webContents.send('window-state', false));
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('platform', process.platform);
    // Send the initial maximized state so the renderer can square off the
    // corners if the window was restored maximized.
    win.webContents.send('window-state', win.isMaximized());
    if (isIncognito) {
      // Hand the renderer the partition name so every <webview> it creates
      // runs inside the same private session as the window.
      win.webContents.send('incognito-mode', { on: true, partition: opts.partition || '' });
    }
    // If Privoo was launched by the OS to open a URL / file, hand it to the
    // first real window once it's ready. Consumed once.
    if (!isIncognito && _pendingLaunchUrl) {
      const u = _pendingLaunchUrl;
      _pendingLaunchUrl = '';
      win.webContents.send('open-tab', u);
    }
  });

  // Debounce write-on-resize so we don't hammer the settings file while the
  // user drags. Save final state on close as a backstop.
  let saveTimer = null;
  const saveState = () => {
    if (win.isDestroyed()) return;
    if (win.isMinimized() || win.isFullScreen()) return; // don't capture transient states
    // Incognito windows leave no trace — don't persist their bounds.
    if (isIncognito) return;
    const maximized = win.isMaximized();
    const bounds = maximized ? (win.getNormalBounds?.() || win.getBounds()) : win.getBounds();
    settingsStore.save({
      windowState: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        maximized,
      },
    });
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveState, 400);
  };
  win.on('resize', scheduleSave);
  win.on('move',   scheduleSave);
  win.on('maximize',   scheduleSave);
  win.on('unmaximize', scheduleSave);

  // Close-to-tray: instead of letting the close button quit Privoo, hide
  // the window into the system tray icon. The user can re-open by clicking
  // the tray, or quit explicitly from the tray menu (which sets the
  // `quittingForReal` flag so this handler steps aside).
  win.on('close', (e) => {
    clearTimeout(saveTimer);
    saveState();
    // Incognito windows always close fully — they shouldn't survive in the
    // tray with their private session still in memory.
    if (isIncognito) return;
    const s = settingsStore.load();
    // On macOS the platform convention is "close hides; ⌘Q quits", which
    // Electron handles via the default app behaviour we already keep
    // elsewhere. The tray path here is mainly for Windows + Linux but is
    // safe on macOS too.
    if (s.minimizeToTray && !global.privooQuittingForReal) {
      e.preventDefault();
      win.hide();
      // From the user's point of view the browser is now "closed" — but the
      // process only dies later, by being killed. Make sure every cookie
      // (Spotify/TikTok rotate theirs constantly) is on disk before that.
      flushAllCookieStores();
    }
  });

  return win;
}

// ---------------------------------------------------------------------------
// System tray — single tray icon shared across windows. Created lazily so a
// startup with minimizeToTray=false never spawns one.
// ---------------------------------------------------------------------------
let _tray = null;

function buildTrayMenu() {
  const showAll = () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length === 0) return createWindow();
    for (const w of wins) { if (!w.isDestroyed()) { w.show(); w.focus(); } }
  };
  const s = settingsStore.load();
  return Menu.buildFromTemplate([
    { label: 'Open Privoo', click: showAll },
    { label: 'New tab', click: () => openUrlInPrivoo('privoo://newtab/') },
    { label: 'New incognito window', click: () => openIncognitoWindow().catch((e) => console.error('Privoo: tray incognito:', e)) },
    { type: 'separator' },
    { label: 'Downloads', click: () => openUrlInPrivoo('privoo://downloads/') },
    { label: 'History', click: () => openUrlInPrivoo('privoo://history/') },
    { label: 'Bookmarks', click: () => openUrlInPrivoo('privoo://bookmarks/') },
    { label: 'Anonymous hosting (.mariana)', click: () => openUrlInPrivoo('privoo://mariana/') },
    { type: 'separator' },
    { label: 'Settings', click: () => openUrlInPrivoo('privoo://settings/') },
    {
      label: 'Minimize to tray when closed',
      type: 'checkbox',
      checked: s.minimizeToTray !== false,
      click: (item) => saveSettingsAndBroadcast({ minimizeToTray: item.checked }),
    },
    { label: 'Check for updates', click: () => checkForUpdatesIfEnabled(true) },
    { type: 'separator' },
    {
      label: 'Quit Privoo', click: () => {
        global.privooQuittingForReal = true;
        app.quit();
      },
    },
  ]);
}

function ensureTray() {
  if (_tray) return _tray;
  let icon = nativeImage.createFromPath(resolveIcon() || '');
  // On macOS the tray uses a small template image; scale ours down so it
  // doesn't render at full window-icon size in the menu bar.
  if (process.platform === 'darwin') {
    icon = icon.resize({ width: 18, height: 18 });
  } else if (icon.isEmpty()) {
    // Fallback: build a 1px transparent image so Tray() doesn't throw.
    icon = nativeImage.createEmpty();
  }
  try {
    _tray = new Tray(icon);
  } catch (e) {
    console.warn('Privoo: tray unavailable:', e.message);
    return null;
  }
  _tray.setToolTip('Privoo');
  const showAll = () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length === 0) return createWindow();
    for (const w of wins) { if (!w.isDestroyed()) { w.show(); w.focus(); } }
  };
  _tray.on('click', showAll);
  // Rebuilt on every right-click rather than set once, so the "minimize to
  // tray" checkbox always reflects the latest setting instead of whatever it
  // was when the app started.
  _tray.on('right-click', () => _tray.popUpContextMenu(buildTrayMenu()));
  _tray.setContextMenu(buildTrayMenu());
  return _tray;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------
// Windows-only manual download path. electron-updater's sha512 verification
// breaks every time Defender touches the downloaded exe — even though the
// file is fine the hash won't match and the install silently fails. We let
// electron-updater detect new versions, then download the installer ourselves
// over plain HTTPS (no hash check) and run it.
const IS_WIN = process.platform === 'win32';
autoUpdater.autoDownload = !IS_WIN;
autoUpdater.autoInstallOnAppQuit = process.platform === 'linux';
autoUpdater.disableDifferentialDownload = true;

let _updateAvailableInfo   = null;
let _updateDownloadedInfo  = null;
let _updateProgressInfo    = null;
let _manualInstallerPath   = null;
let _manualDownloadActive  = false;

function _broadcastUpdate(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function _sendUpdateToWin(win) {
  if (!win || win.isDestroyed()) return;
  if (_updateDownloadedInfo)     win.webContents.send('update-downloaded', _updateDownloadedInfo);
  else if (_updateAvailableInfo) win.webContents.send('update-available',  _updateAvailableInfo);
}

function _httpsGetFollow(url, onResponse, onError, hops = 0) {
  if (hops > 6) { onError(new Error('too many redirects')); return; }
  const https = require('https');
  const req = https.get(url, { headers: { 'User-Agent': 'Privoo-Updater' } }, (res) => {
    const code = res.statusCode || 0;
    if (code >= 300 && code < 400 && res.headers.location) {
      res.resume();
      _httpsGetFollow(res.headers.location, onResponse, onError, hops + 1);
      return;
    }
    if (code !== 200) { res.resume(); onError(new Error('HTTP ' + code)); return; }
    onResponse(res);
  });
  req.on('error', onError);
}

async function _downloadInstallerWindows(info) {
  if (_manualDownloadActive) return;
  _manualDownloadActive = true;

  const version  = info.version;
  const fileName = `Privoo-Setup-${version}.exe`;
  const url      = `https://github.com/sharp4real/privoobrowser/releases/download/v${version}/${fileName}`;

  const dir = path.join(app.getPath('userData'), '__privoo_update__');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f !== fileName) { try { fs.unlinkSync(path.join(dir, f)); } catch {} }
    }
  } catch {}
  const dest = path.join(dir, fileName);

  const expectedSize = (info.files && info.files[0] && info.files[0].size) || 0;

  // Reuse already-downloaded installer if intact
  try {
    const st = fs.statSync(dest);
    if (expectedSize > 0 && st.size === expectedSize) {
      _manualInstallerPath  = dest;
      _updateDownloadedInfo = info;
      _updateProgressInfo   = null;
      _manualDownloadActive = false;
      _broadcastUpdate('update-downloaded', info);
      return;
    }
    try { fs.unlinkSync(dest); } catch {}
  } catch {}

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let downloaded = 0;
    let total = expectedSize;
    const start = Date.now();
    let lastEmit = 0;

    _httpsGetFollow(url, (res) => {
      const cl = parseInt(res.headers['content-length'] || '', 10);
      if (cl > 0) total = cl;

      res.on('data', (chunk) => {
        downloaded += chunk.length;
        const now = Date.now();
        if (now - lastEmit > 200) {
          lastEmit = now;
          const elapsed = (now - start) / 1000;
          const bps = elapsed > 0 ? downloaded / elapsed : 0;
          const percent = total > 0 ? (downloaded / total) * 100 : 0;
          _updateProgressInfo = { percent, bytesPerSecond: bps, transferred: downloaded, total };
          _broadcastUpdate('update-progress', _updateProgressInfo);
        }
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => {
        _updateProgressInfo = { percent: 100, bytesPerSecond: 0, transferred: downloaded, total };
        _broadcastUpdate('update-progress', _updateProgressInfo);
        resolve();
      }));
      res.on('error', reject);
      file.on('error', reject);
    }, reject);
  }).then(() => {
    _manualInstallerPath  = dest;
    _updateDownloadedInfo = info;
    _updateProgressInfo   = null;
    _manualDownloadActive = false;
    _broadcastUpdate('update-downloaded', info);
  }).catch((err) => {
    _manualDownloadActive = false;
    try { fs.unlinkSync(dest); } catch {}
    console.warn('Privoo manual update download failed:', err.message);
    _broadcastUpdate('update-error', err.message || String(err));
    _updateAvailableInfo = null;
    _updateProgressInfo  = null;
    setTimeout(() => checkForUpdatesIfEnabled(), 60_000);
  });
}

autoUpdater.on('update-available', (info) => {
  _updateAvailableInfo = info;
  _broadcastUpdate('update-available', info);
  if (IS_WIN) _downloadInstallerWindows(info);
});

autoUpdater.on('download-progress', (progress) => {
  _updateProgressInfo = progress;
  _broadcastUpdate('update-progress', progress);
});

autoUpdater.on('update-downloaded', (info) => {
  _updateDownloadedInfo = info;
  _updateProgressInfo   = null;
  _broadcastUpdate('update-downloaded', info);
});

autoUpdater.on('error', (err) => {
  const msg = err.message || String(err);
  console.warn('Privoo updater error:', msg);
  // Silently swallow electron-updater errors on Windows while our manual
  // download is healthy — the sha512 mismatch we know about is harmless.
  if (IS_WIN && (_manualDownloadActive || _manualInstallerPath)) return;
  _broadcastUpdate('update-error', msg);
  _updateAvailableInfo = null;
  _updateProgressInfo  = null;
  setTimeout(() => checkForUpdatesIfEnabled(), 60_000);
});

ipcMain.on('install-update-now', (e) => {
  if (process.platform === 'darwin') {
    shell.openExternal('https://github.com/sharp4real/privoobrowser/releases/latest');
    return;
  }
  if (IS_WIN) {
    // autoDownload is off on Windows (see the sha512-mismatch note above),
    // so electron-updater never actually has anything cached to install —
    // quitAndInstall() below would silently no-op. The manually-downloaded
    // installer is the only real path on this platform; if it's missing,
    // report back instead of falling through to a call that does nothing
    // and leaves the renderer's button stuck disabled forever.
    if (!_manualInstallerPath || !fs.existsSync(_manualInstallerPath)) {
      console.warn('Privoo: install-update-now on Windows with no installer downloaded');
      try { e.sender.send('update-install-failed', 'The update file is missing. Re-checking for updates…'); } catch {}
      _updateDownloadedInfo = null;
      checkForUpdatesIfEnabled();
      return;
    }
    const { spawn } = require('child_process');
    try {
      spawn(_manualInstallerPath, ['/S', '--force-run'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } catch (err) {
      console.warn('Privoo: spawn installer failed, opening installer manually instead:', err.message);
      shell.openPath(_manualInstallerPath).then((errMsg) => {
        if (errMsg) {
          console.warn('Privoo: openPath also failed:', errMsg);
          try { e.sender.send('update-install-failed', 'Could not launch the installer automatically. Find it at: ' + _manualInstallerPath); } catch {}
        }
      });
      return;
    }
    setTimeout(() => app.quit(), 400);
    return;
  }
  autoUpdater.quitAndInstall(true, true);
});

// Renderer asks for current update state on load (catches missed events).
ipcMain.handle('get-update-status', () => ({
  available:  _updateAvailableInfo  || null,
  downloaded: _updateDownloadedInfo || null,
  progress:   _updateProgressInfo   || null,
}));

ipcMain.handle('trigger-update-check', () => {
  checkForUpdatesIfEnabled();
});

function checkForUpdatesIfEnabled(force) {
  if (!app.isPackaged) return;
  const settings = settingsStore.load();
  if (!force && !settings.autoUpdates) return;
  autoUpdater.checkForUpdates().catch((e) => {
    console.warn('Privoo updater check failed:', e.message);
  });
}

// ---------------------------------------------------------------------------
// Discord Rich Presence
// ---------------------------------------------------------------------------
let _discordRpc = null;

function initDiscordRpc() {
  if (_discordRpc) return;
  try {
    _discordRpc = require('./discord-rpc');
    _discordRpc.connect();
  } catch (e) {
    console.warn('Privoo: Discord RPC unavailable:', e.message);
    _discordRpc = null;
  }
}

function shutdownDiscordRpc() {
  if (!_discordRpc) return;
  try { _discordRpc.disconnect(); } catch {}
  _discordRpc = null;
}

ipcMain.on('discord-rpc-set-activity', (_e, activity) => {
  if (!_discordRpc) return;
  try {
    if (activity) _discordRpc.setActivity(activity);
    else _discordRpc.clearActivity();
  } catch {}
});

// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  const profileArg = process.argv.find((a) => a.startsWith('--privoo-profile='));
  const skipPicker = process.argv.includes('--privoo-skip-picker');
  const wantIncognito = process.argv.includes('--privoo-incognito');
  const explicitId = profileArg ? profileArg.split('=')[1] : null;

  // Relaunched directly into a profile (from the picker or a pinned default).
  if (explicitId || skipPicker) {
    profileStore.setActiveId(explicitId || 'default');
    return startBrowser({ incognito: wantIncognito });
  }

  // Launcher mode — no profile chosen yet. Decide: show the picker, or
  // auto-open a profile.
  const prefs = profileStore.loadPrefs();
  const totalProfiles = profileStore.listWithDefault().length;
  const wantPicker = prefs.alwaysShowPicker || (totalProfiles >= 2 && !prefs.defaultProfileId);
  if (wantPicker) {
    return createProfilePicker();
  }

  const id = prefs.defaultProfileId || 'default';
  if (id === 'default') {
    profileStore.setActiveId('default');
    return startBrowser();
  }
  return relaunchIntoProfile(id);
});

// Relaunch the whole app into a given profile. For non-default profiles the
// `--privoo-profile=<id>` arg triggers the userData redirect at module load,
// giving full session isolation. The single-instance lock is released by
// app.exit(0) so the relaunched process acquires it cleanly.
function relaunchIntoProfile(id) {
  profileStore.setActiveId(id);
  const args = process.argv.slice(1).filter(
    (a) => !a.startsWith('--privoo-profile=') && a !== '--privoo-skip-picker'
  );
  if (id && id !== 'default') args.push(`--privoo-profile=${id}`);
  else args.push('--privoo-skip-picker');
  app.relaunch({ args });
  app.exit(0);
}

// Full browser startup — only runs in the chosen-profile process, never in
// the lightweight picker process. When `incognito` is set (Guest mode from the
// picker), the profile session is initialised but only a private window opens.
async function startBrowser(opts = {}) {
  const _startIncognito = !!opts.incognito;
  const settings = settingsStore.load();
  defaultUserAgent = session.defaultSession.getUserAgent();
  if (settings.minimizeToTray) ensureTray();

  // Force Chrome User-Agent on session + pin language to the device locale
  session.defaultSession.setUserAgent(CHROME_UA, preferredLanguageList().join(','));
  console.log('Privoo: Using User-Agent:', CHROME_UA);

  if (settings.dnsOverHttps) {
    try {
      app.configureHostResolver({
        secureDnsMode: 'secure',
        secureDnsServers: resolveDohServers(settings),
      });
    } catch (e) {
      console.warn('Privoo: DoH unavailable:', e.message);
    }
  }

  registerPrivooProtocol();
  registerMarianaProtocol();
  await installExtensionApiBridge();
  await hardenSession(session.defaultSession);
  // Dark mode has to be set at boot, not only when a setting changes:
  // applyRuntimeSettings only runs on save, so on a cold start every page
  // loaded before the first settings change saw the system preference.
  try {
    nativeTheme.themeSource = settingsStore.load().darkMode ? 'dark' : 'light';
  } catch { /* older Electron — the CDP path still covers it */ }

  // Launch Tor on boot if the saved proxy mode needs it.
  applyProxyAll(settingsStore.load());

  // Wire the .mariana hosting engine to our Tor process, then bring any
  // sites the user left running back online. Tor needs a few seconds to
  // bootstrap before ADD_ONION works, so give it a head start.
  mariana.init(app, {
    getTorPort: () => torPortOf(settingsStore.load()),
    getControlPort: () => torControlPortOf(settingsStore.load()),
    ensureTor: () => ensureTorForOnion(),
    controlCookiePath: () => torControlCookiePath(),
  });
  setTimeout(() => { mariana.startAll().catch(() => {}); }, 8000);

  // Resolve any legacy __MSG_*__ placeholders saved into settings before
  // the i18n fix landed (uBlock and friends shipped names/descriptions as
  // Chrome locale references). Done once on startup so existing installs
  // pick up real localized strings without the user reinstalling.
  try {
    const extList = Array.isArray(settings.extensions) ? settings.extensions : [];
    let dirty = false;
    for (const ext of extList) {
      if (!ext || !ext.path) continue;
      try {
        const mp = path.join(ext.path, 'manifest.json');
        if (!fs.existsSync(mp)) continue;
        const raw = JSON.parse(fs.readFileSync(mp, 'utf8'));
        const resolved = resolveManifestI18n(raw, ext.path);
        if (resolved.name && typeof ext.name === 'string' && /^__MSG_/.test(ext.name)) {
          ext.name = resolved.name; dirty = true;
        }
        if (resolved.description && typeof ext.description === 'string' && /^__MSG_/.test(ext.description)) {
          ext.description = resolved.description; dirty = true;
        }
        // Re-checked every launch rather than trusted from the record: the
        // supported API list changes with the Electron version, so a verdict
        // saved by an older build could be wrong.
        const compat = checkExtension(resolved);
        const names = compat.unsupported.map((u) => u.permission);
        if (String(ext.unsupported || '') !== String(names)
            || !!ext.unsupportedCritical !== compat.critical) {
          ext.unsupported = names;
          ext.unsupportedCritical = compat.critical;
          dirty = true;
        }
      } catch {}
    }
    if (dirty) settingsStore.save({ extensions: extList });
  } catch {}

  await syncExtensionsFromSettings(settings);

  if (settings.discordRpc) initDiscordRpc();

  // castLabs Electron (ECS) ships the Widevine CDM as a runtime component that
  // downloads/verifies on first launch. Wait for it before opening any window
  // so DRM playback (Spotify, Netflix, etc.) works immediately. `components`
  // only exists on the castLabs fork, so this is a harmless no-op on stock
  // Electron — and we never let a slow/failed CDM fetch block startup forever.
  //
  // A single 15s Promise.race against whenReady() was cutting this off too
  // early on a first install or a slow network: whenReady() would still be
  // mid-download when the timer won, we'd open the window anyway, and
  // Spotify/Netflix would start a DRM session against a CDM that was only
  // partially in place — playing for a few seconds off whatever was already
  // buffered/negotiated before the license path failed. Retrying with a much
  // larger total budget (and actually confirming a version string is present,
  // not just that the promise settled) gives slow first-time installs enough
  // time to finish before any page gets a chance to start a DRM session.
  if (components && typeof components.whenReady === 'function') {
    await waitForWidevineReady();
  }

  if (_startIncognito) openIncognitoWindow();
  else createWindow();

  // Check for updates in the background (only works in packaged builds).
  setTimeout(checkForUpdatesIfEnabled, 3000);

  // yt-dlp installer — runs in the background so it never blocks startup.
  // ensureInstalled() downloads the binary on first run; maybeUpdate() checks
  // for a newer release once per launch (rate-limited internally to 24 h).
  const ytdlpInstaller = require('./ytdlp-installer');
  ytdlpInstaller.ensureInstalled()
    .then(() => ytdlpInstaller.maybeUpdate())
    .catch((e) => console.warn('Privoo: yt-dlp installer error:', e.message));

  // Pre-load the adult domain blocklist in the background so it's ready
  // before the user navigates anywhere.
  const { initAdultBlocker: _initAdult } = require('./safety');
  _initAdult().catch((e) => console.warn('Privoo: adult blocker init error:', e.message));

  // Restore the lifetime privacy counters and start the periodic flush.
  initStats();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// Proxy authentication — Privoo VPN's manual-proxy PAC script (buildPacScript
// / applyProxyToSession above) can only express "PROXY host:port", so any
// user:pass@ embedded in proxyUrl gets dropped when it's parsed into that
// directive. A proxy that requires auth challenges with HTTP 407, which
// Electron surfaces here rather than as a normal page load. Answer it with
// the credentials the user entered in the Privoo VPN popover (or Settings →
// Privacy → Proxy, which shares the same proxyUrl).
app.on('login', (event, _webContents, _details, authInfo, callback) => {
  if (!authInfo.isProxy) return; // let normal site auth prompts through
  const s = settingsStore.load();
  if (s.proxyMode !== 'manual' || !s.vpnProxyUsername) return;
  event.preventDefault();
  callback(s.vpnProxyUsername, s.vpnProxyPassword || '');
});

app.on('web-contents-created', (_event, contents) => {
  contents.setMaxListeners(200);
  if (contents.getType() !== 'webview') return;

  // Force clean Chrome UA on every webview, except ones marked mobile via
  // mark-mobile-webview, which get their device identity set explicitly.
  if (!_mobileEmulatedDevices.has(contents.id)) contents.setUserAgent(CHROME_UA);

  if (settingsStore.load().webrtcProtection) {
    contents.setWebRTCIPHandlingPolicy('default_public_interface_only');
  }

  // Popup blocking works on one question: did the user just do something?
  // A page that opens a window a second after a click is acting on that
  // click; one that opens a window with no interaction at all is acting on
  // its own. Every real case — a link, a Sign in with X button, a download —
  // follows an interaction, so the gesture test costs them nothing.
  contents.on('input-event', (_e, ev) => {
    if (ev.type === 'mouseDown' || ev.type === 'keyDown' || ev.type === 'rawKeyDown') {
      _lastGestureAt.set(contents.id, Date.now());
    }
  });
  contents.once('destroyed', () => _lastGestureAt.delete(contents.id));

  contents.setWindowOpenHandler(({ url, disposition, features, frameName }) => {
    const host = contents.hostWebContents;

    if (settingsStore.load().popupBlocking !== false) {
      const since = Date.now() - (_lastGestureAt.get(contents.id) || 0);
      // A generous window: some sites do real work between the click and the
      // open. Popunders do not wait at all, and neither do timer-driven ad
      // redirects, so this still catches them.
      if (since > 2500) {
        try {
          broadcastAll('popup-blocked', { url, host: hostnameOf(url) });
        } catch { /* the block is what matters, not the notice */ }
        return { action: 'deny' };
      }
    }

    // Custom (non-web) scheme via window.open() — never spawn a tab for it.
    // A blank tab pointed at snssdk:// / bytedance:// just dead-ends on an
    // "open this URL in <app>" screen (the exact thing that was breaking
    // TikTok's email verification). Mobile-only app links are dropped silently
    // so the opener page keeps its in-browser fallback; any other app protocol
    // is handed to the OS.
    if (!isWebScheme(url)) {
      if (!isMobileDeepLink(url)) { try { shell.openExternal(url); } catch {} }
      return { action: 'deny' };
    }

    // Direct download URLs (Overwolf installer, GitHub release .exe, etc.):
    // a window.open() to a Content-Disposition: attachment endpoint, opened in
    // a fresh tab, dies with ERR_FAILED because the new webContents has no
    // referer and the server rejects the request. Use contents.downloadURL()
    // from the host page instead — it inherits cookies, UA, and Referer, and
    // routes straight into the session's will-download handler.
    if (isLikelyDownloadUrl(url)) {
      try { contents.downloadURL(url); } catch {}
      return { action: 'deny' };
    }

    // OAuth / "Sign in with X" flows open a popup via window.open(url, name, "width=...,height=...")
    // and depend on `window.opener` being set so the popup can postMessage the
    // auth token back. If we deny and create a regular tab instead, the tab has
    // no opener and the flow hangs at accounts.google.com/gsi/transform.
    // Detect "real popup" requests and let Electron open them as a child window.
    const feat = String(features || '');
    // TikTok/ByteDance "verify it's really you" can open its verification page in
    // a NAMED window (window.open(url, 'someName')) WITHOUT width/height features
    // and postMessage the result back through window.opener. Without an opener it
    // reports "something went wrong". So when the opener page is on a ByteDance
    // host and it targets a named (non-blank) window, treat it as a real popup.
    // Scoped to those hosts so normal named-tab opens elsewhere are unaffected.
    let openerHost = '';
    try { openerHost = hostnameOf(contents.getURL()); } catch {}
    const isByteHost = /(^|\.)(tiktok\.com|tiktokv\.com|tiktokcdn\.com|byteoversea\.com|bytedance\.com|ibyteimg\.com|ibytedtos\.com)$/i.test(openerHost);
    const isNamedRef = !!frameName && frameName !== '_blank' && frameName !== '_self' && frameName !== '_top' && frameName !== '_parent';
    const isPopup =
      disposition === 'new-window' ||
      /\bpopup\s*=/i.test(feat) ||
      (/\bwidth\s*=/i.test(feat) && /\bheight\s*=/i.test(feat)) ||
      frameName === 'oauthwindow' || frameName === 'oauth' || frameName === 'signin' ||
      (isByteHost && isNamedRef);

    if (isPopup) {
      return {
        action: 'allow',
        outlivesOpener: false,
        overrideBrowserWindowOptions: {
          width: 520,
          height: 640,
          minWidth: 360,
          minHeight: 420,
          autoHideMenuBar: true,
          icon: resolveIcon(),
          // Inherit the host BrowserWindow's session so cookies / spoofing /
          // adblock are all in scope. The OAuth preload injects the spoof at
          // document-start so the popup never trips "browser may not be secure".
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            session: session.defaultSession,
            preload: OAUTH_PRELOAD,
            // Tell the preload to force the pristine (no-tampering) spoof when
            // this popup was opened by a TikTok/ByteDance page — its verification
            // window runs webmssdk and must look exactly like the main tab.
            additionalArguments: ['--privoo-cv=' + CHROME_VERSION_FULL]
              .concat(isByteHost ? ['--privoo-pristine=1'] : []),
          },
        },
      };
    }

    // Plain target="_blank" or middle-click → open as a tab in our UI.
    if (host && !host.isDestroyed()) host.send('open-tab', url);
    return { action: 'deny' };
  });

  // When an OAuth/popup window is created, apply the same UA + CDP spoofing
  // we use for webview tabs. Without this, Google sees an unspoofed popup
  // and rejects the sign-in with "browser may not be secure" or hangs.
  contents.on('did-create-window', (popupWindow, _details) => {
    if (!popupWindow || popupWindow.isDestroyed()) return;
    const pc = popupWindow.webContents;
    
    // Set icon for popup window
    try {
      popupWindow.setIcon(resolveIcon());
    } catch {}
    
    // If THIS popup was opened by a TikTok/ByteDance page, use a pristine-forced
    // spoof for the CDP/dom-ready fallbacks too (the preload already gets the
    // --privoo-pristine flag). Belt-and-suspenders: a verification popup must
    // stay pristine on every injection path or webmssdk re-flags it.
    let popupSpoof = spoofScript;
    try {
      const oh = hostnameOf(contents.getURL());
      if (/(^|\.)(tiktok\.com|tiktokv\.com|tiktokcdn\.com|tiktokcdn-us\.com|byteoversea\.com|bytedance\.com|ibyteimg\.com|ibytedtos\.com|ttwstatic\.com|bytescm\.com)$/i.test(oh)) {
        popupSpoof = buildGoogleSpoofScript({
          chromeVersion: CHROME_VERSION_FULL,
          platform: process.platform,
          forcePristine: true,
        });
      }
    } catch {}

    try { pc.setUserAgent(CHROME_UA); } catch {}
    try {
      if (!pc.debugger.isAttached()) pc.debugger.attach('1.3');
      pc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: popupSpoof,
        runImmediately: true,
      }).catch(() => {});
      pc.debugger.sendCommand('Network.setUserAgentOverride', {
        userAgent: CHROME_UA,
        acceptLanguage: preferredLanguageList().join(','),
        userAgentMetadata: UA_METADATA,
      }).catch(() => {});
    } catch { /* ignore — fallback below */ }
    // Fallback main-world injection at dom-ready in case CDP attach failed.
    // The .catch must be attached SYNCHRONOUSLY in the same tick the Promise
    // is created — wrapping the call itself in try/catch would let the
    // rejection escape, hence the bare `.catch(()=>{})`.
    const onDomReady = () => {
      if (pc.isDestroyed()) return;
      const u = (() => { try { return pc.getURL(); } catch { return ''; } })();
      if (!u || u.startsWith('privoo://') || u.startsWith('about:')) return;
      Promise.resolve(pc.executeJavaScript(popupSpoof, true)).catch(() => {});
    };
    pc.on('dom-ready', onDomReady);

    // Handle navigation errors gracefully (TikTok rate limiting, etc.)
    pc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      // Ignore aborted loads and other common navigation errors
      if (errorCode === -3 || errorCode === -27) { // ERR_ABORTED or ERR_BLOCKED_BY_CLIENT
        console.log(`Privoo: Popup navigation aborted for ${validatedURL} (code: ${errorCode})`);
        // Don't close the window - let the user see what happened
        return;
      }
    });

    // Popup-in-popup: some OAuth flows (e.g. Microsoft → school SSO) open a
    // further popup from the auth window. Allow those as real windows too so
    // window.opener still works at every level of the chain.
    pc.setWindowOpenHandler(({ url, disposition, features, frameName }) => {
      // Custom (non-web) scheme — drop mobile app links, hand the rest to the OS.
      if (!isWebScheme(url)) {
        if (!isMobileDeepLink(url)) { try { shell.openExternal(url); } catch {} }
        return { action: 'deny' };
      }
      const feat = String(features || '');
      const isPopup =
        disposition === 'new-window' ||
        /\bpopup\s*=/i.test(feat) ||
        (/\bwidth\s*=/i.test(feat) && /\bheight\s*=/i.test(feat)) ||
        frameName === 'oauthwindow' || frameName === 'oauth' || frameName === 'signin';
      if (isPopup) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520, height: 640,
            icon: resolveIcon(),
            webPreferences: {
              contextIsolation: true,
              nodeIntegration: false,
              sandbox: false,
              session: session.defaultSession,
              preload: OAUTH_PRELOAD,
              additionalArguments: ['--privoo-cv=' + CHROME_VERSION_FULL],
            },
          },
        };
      }
      const h = contents.hostWebContents || contents;
      if (h && !h.isDestroyed()) h.send('open-tab', url);
      return { action: 'deny' };
    });
    popupWindow.once('closed', () => { /* free reference */ });
  });

  // Reuse the module-level spoof script (same for every guest + popup).
  const spoofScript = SPOOF_SCRIPT;

  // YouTube ad-block + video-fix script. Injected before any page script runs
  // so it wins the race against YouTube's detection code. Three layers:
  //   1. JSON.parse intercept  — strips adPlacements from ytInitialPlayerResponse
  //   2. fetch intercept       — strips ad slots from /player and /next API calls
  //   3. setInterval DOM poll  — auto-skips/fast-forwards any ad that slips through
  const ytAdScript = `(function(){
  const isYT = h => h === 'youtube.com' || h.endsWith('.youtube.com');
  if (!isYT(location.hostname)) return;
  // Intercept ytInitialPlayerResponse assigned via inline <script> object literal
  // (bypasses JSON.parse — this is why the first video needed a refresh).
  try {
    // One helper, used by all three intercept points, so a gap in one can't
    // let ads through the others. YouTube has added fields over time
    // (adSlots, server-side inserted placements); strip every known one.
    window.__privooStripYtAds = function(o){
      if (!o || typeof o !== 'object') return o;
      try { if ('adPlacements' in o) o.adPlacements = []; } catch {}
      try { if ('playerAds'    in o) o.playerAds    = []; } catch {}
      try { if ('adSlots'      in o) o.adSlots      = []; } catch {}
      try { if ('serverSideSpecialCaseAdInsertion' in o) o.serverSideSpecialCaseAdInsertion = []; } catch {}
      try { if ('serverSideInsertedAdPlacements'   in o) o.serverSideInsertedAdPlacements   = []; } catch {}
      return o;
    };
    let _ytipr;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get: () => _ytipr,
      set: v => { _ytipr = window.__privooStripYtAds(v); },
      configurable: true,
    });
  } catch {}
  const _jp = JSON.parse;
  JSON.parse = function(t, ...a) {
    return window.__privooStripYtAds(_jp.call(this, t, ...a));
  };
  const _f = window.fetch;
  window.fetch = function(input, ...rest) {
    return _f.call(this, input, ...rest).then(async res => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (!url.includes('/youtubei/v1/player') && !url.includes('/youtubei/v1/next')) return res;
      try {
        const body = await res.clone().json();
        let changed = false;
        for (const k of ['adPlacements','playerAds','adSlots','serverSideSpecialCaseAdInsertion','serverSideInsertedAdPlacements']) {
          if (Array.isArray(body[k]) && body[k].length) { body[k] = []; changed = true; }
        }
        // Only hand back a rebuilt response when we actually stripped ads.
        // Re-wrapping every player/next response (e.g. when switching audio
        // track or quality) corrupts it and breaks those features.
        if (!changed) return res;
        const headers = new Headers(res.headers);
        headers.delete('content-length');
        headers.delete('content-encoding');
        return new Response(JSON.stringify(body), {
          status: res.status, statusText: res.statusText, headers,
        });
      } catch {}
      return res;
    });
  };
  setInterval(function() {
    try {
      var wall = document.querySelector('ytd-enforcement-message-view-model');
      if (wall) wall.remove();
      // Only act while an ad is ACTUALLY playing. YouTube marks the player with
      // the 'ad-showing'/'ad-interrupting' class for the duration of an ad and
      // removes it after — unlike the .ytp-ad-* container elements, which linger
      // in the DOM and caused real videos to get fast-forwarded to black.
      var player = document.querySelector('.html5-video-player');
      var isAd = !!player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
      if (!isAd) return;
      var skip = document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button-modern,.ytp-ad-skip-button');
      if (skip) skip.click();
      var video = document.querySelector('video.html5-main-video');
      if (video && isFinite(video.duration) && video.duration > 0) {
        if (!video.muted) video.muted = true;
        video.playbackRate = 16;
        if (video.duration - video.currentTime > 0.1) video.currentTime = video.duration - 0.1;
      }
    } catch {}
  }, 300);
})();`;

  // Spotify web player: cosmetic ad removal + audio-ad skip. The network layer
  // (isSpotifyAdRequest) already starves ad/telemetry endpoints; this catches
  // whatever still renders — hides ad billboards/upgrade nags and, when an ad
  // track plays, mutes it and seeks to the end so playback advances to the next
  // real song. Bails out immediately off Spotify so it costs nothing elsewhere.
  const spotifyAdScript = `(function(){
  if (!/(^|\\.)spotify\\.com$/.test(location.hostname)) return;
  if (window.__privoo_spotify_ads__) return;
  window.__privoo_spotify_ads__ = true;

  // Hide ad billboards, sponsored slots and the upgrade nags.
  try {
    var st = document.createElement('style');
    st.textContent = [
      '[data-testid="ad-slot-container"]',
      '[data-testid="hpto-container"]',
      '[data-testid="bannerAd"]',
      '[aria-label="Advertisement"]',
      '.sponsor-container',
      '.ad-container',
      'iframe[src*="adstudio"]'
    ].join(',') + '{display:none !important;height:0 !important;}';
    (document.head || document.documentElement).appendChild(st);
  } catch(e){}

  function adPlaying() {
    try {
      var w = document.querySelector('[data-testid="now-playing-widget"]');
      var label = (w && (w.getAttribute('aria-label') || '')) || '';
      if (/advert/i.test(label)) return true;
      var link = document.querySelector('[data-testid="context-item-link"],[data-testid="context-item-info-title"] a');
      var href = (link && (link.getAttribute('href') || '')) || '';
      if (/spotify:ad|\\/ad[\\/:]/i.test(href)) return true;
    } catch(e){}
    return false;
  }

  // When an ad slips through, mute it and fast-forward to the end so the
  // player moves on to the next real track.
  setInterval(function(){
    try {
      if (!adPlaying()) return;
      var media = document.querySelector('audio, video');
      if (!media) return;
      media.muted = true;
      if (isFinite(media.duration) && media.duration > 0 && media.duration - media.currentTime > 0.2) {
        media.currentTime = media.duration;
      }
    } catch(e){}
  }, 400);
})();`;

  // ── PRIMARY: CDP injection ─────────────────────────────────────────────────
  // Page.addScriptToEvaluateOnNewDocument runs the script BEFORE any page
  // script executes — including inline <script> tags. This is the only way
  // to win the race against detection scripts that run at the very top of
  // sites like accounts.google.com, login.microsoftonline.com, teams.live.com.
  let cdpAttached = false;
  const tryAttachCdp = () => {
    if (cdpAttached || contents.isDestroyed()) return;
    try {
      if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
      cdpAttached = true;
      contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: spoofScript,
        runImmediately: true,
      }).catch(() => { /* command may fail on internal pages */ });
      // Native client hints, keeps navigator.userAgentData native (see UA_METADATA).
      // Mobile emulated webviews get their device identity instead.
      {
        const mobileProfile = _mobileEmulatedDevices.has(contents.id) ? mobileProfileFor(contents.id) : null;
        contents.debugger.sendCommand('Network.setUserAgentOverride', {
          userAgent: mobileProfile ? mobileProfile.ua : CHROME_UA,
          acceptLanguage: preferredLanguageList().join(','),
          userAgentMetadata: mobileProfile ? (mobileProfile.metadata || UA_METADATA) : UA_METADATA,
        }).catch(() => {});
      }
      contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: ytAdScript,
        runImmediately: true,
      }).catch(() => {});
      contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: spotifyAdScript,
        runImmediately: true,
      }).catch(() => {});

      // Emulate `prefers-color-scheme` so sites that ship a real dark theme
      // follow the user's choice. Pages with no dark theme are handled by the
      // renderer's Force Dark inversion (forceDarkScript) instead.
      // This one used to skip the host check entirely, so it disagreed with
      // both of the other two — see prefersDarkFor().
      try {
        const url = (() => { try { return contents.getURL(); } catch { return ''; } })();
        contents.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: prefersDarkFor(url) ? 'dark' : 'light' }],
        }).catch(() => {});
      } catch { /* ignore */ }
    } catch (e) {
      // Attach can fail if DevTools is already open; we still have the dom-ready fallback.
      cdpAttached = false;
    }
  };
  // Detaching when DevTools opens is normal; clear the flag so we can re-attach.
  contents.debugger.on('detach', () => { cdpAttached = false; });
  contents.once('destroyed', () => {
    try { if (contents.debugger.isAttached()) contents.debugger.detach(); } catch {}
  });
  tryAttachCdp();

  // Re-apply prefers-color-scheme on every navigation. What it should be is
  // prefersDarkFor()'s job — see the note there for why that matters.
  const reapplyDarkMode = () => {
    if (contents.isDestroyed() || !cdpAttached) return;
    try {
      const url = (() => { try { return contents.getURL(); } catch { return ''; } })();
      contents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: prefersDarkFor(url) ? 'dark' : 'light' }],
      }).catch(() => {});
    } catch { /* ignore */ }
  };
  contents.on('did-navigate',         reapplyDarkMode);
  contents.on('did-navigate-in-page', reapplyDarkMode);
  contents.on('did-frame-navigate',   reapplyDarkMode);

  // Google's bot detection flags the masked-WebRTC policy and buries the user
  // in reCAPTCHAs. On google.com only, fall back to the default WebRTC policy;
  // everywhere else, honour the webrtcProtection setting.
  const reapplyWebRTC = () => {
    if (contents.isDestroyed()) return;
    try {
      const s = settingsStore.load();
      const url = (() => { try { return contents.getURL(); } catch { return ''; } })();
      const host = hostnameOf(url);
      const isGoogle = host === 'google.com' || host.endsWith('.google.com');
      contents.setWebRTCIPHandlingPolicy(
        (s.webrtcProtection !== false) && !isGoogle
          ? 'default_public_interface_only'
          : 'default'
      );
    } catch { /* ignore */ }
  };
  contents.on('did-navigate', reapplyWebRTC);

  // Forward browser keyboard shortcuts (Ctrl+T, Ctrl+W, F12, etc.) from the
  // webview's renderer up to the host renderer. Without this, shortcuts only
  // work when focus is on Privoo's own chrome — when you click into a tab
  // (especially privoo://newtab where the omnibox isn't focused), keypresses
  // get swallowed by the guest renderer.
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    const isFnKey = input.key === 'F5' || input.key === 'F12';
    const isAltNav = input.alt && (input.key === 'ArrowLeft' || input.key === 'ArrowRight');
    if (!mod && !isFnKey && !isAltNav) return;
    // Skip keys we don't want to steal from the page (text editing).
    if (mod && (input.key === 'c' || input.key === 'v' || input.key === 'x'
             || input.key === 'a' || input.key === 'z' || input.key === 'y'
             || input.key === 's' || input.key === 'p' || input.key === 'f')) return;
    const host = contents.hostWebContents;
    if (host && !host.isDestroyed()) {
      host.send('webview-shortcut', {
        key: input.key,
        alt: input.alt,
        shift: input.shift,
        ctrl: input.control,
        meta: input.meta,
      });
    }
  });

  // ── FALLBACK: dom-ready injection ──────────────────────────────────────────
  // Runs in main world (executeJavaScript default). Late, but catches the case
  // where CDP attach failed (e.g. DevTools is open) or the script registration
  // missed a fast navigation.
  const injectSpoof = () => {
    if (contents.isDestroyed()) return;
    try {
      const url = contents.getURL();
      if (!url || url.startsWith('privoo://') || url.startsWith('about:') || url.startsWith('devtools:')) return;
    } catch { return; }
    // Re-try CDP attach on each navigation in case DevTools was closed.
    if (!cdpAttached) tryAttachCdp();
    contents.executeJavaScript(spoofScript, true).catch(() => {});
    contents.executeJavaScript(ytAdScript, true).catch(() => {});
    contents.executeJavaScript(spotifyAdScript, true).catch(() => {});
    // Safe Mode — blur explicit imagery, but only on hosts the adult-domain
    // classifier flagged. Applying it on every page (its previous behaviour)
    // blurred normal photos on completely innocuous sites.
    const sm = settingsStore.load();
    if (sm.safeMode) {
      let host = '';
      try { host = new URL(contents.getURL()).hostname; } catch {}
      if (host && isAdultDomain(host)) {
        contents.executeJavaScript(buildSafeModeScript(), true).catch(() => {});
      }
    }
  };

  contents.on('dom-ready', injectSpoof);

  // will-navigate fires for user-initiated navigations and is cancellable.
  // isSameDocument=true means it's a hash change / pushState — never block those.
  contents.on('will-navigate', (event, url, isSameDocument, isMainFrame) => {
    if (!isMainFrame) return;
    if (isSameDocument) return;
    // Don't intercept internal pages or our own .mariana scheme (handled by
    // the mariana:// protocol handler, which already routes it over Tor).
    if (url.startsWith('privoo://') || url.startsWith('mariana://')) return;

    // ── Custom (non-web) schemes ───────────────────────────────────────────
    // A page driving the top frame to snssdk://, bytedance://, zoommtg://, etc.
    // Cancel the navigation (a webview can't render these and would dead-end),
    // then route it: mobile-only app links are dropped silently so flows like
    // TikTok's email verification keep going in-page; any other app protocol is
    // handed to the OS, mirroring Chrome's "open external app?" behaviour.
    // ── IPFS / IPNS ─────────────────────────────────────────────────────────
    // Not an http(s) scheme, so it must be handled before the generic
    // "unknown scheme → hand to OS" fallback below.
    if (url.startsWith('ipfs://') || url.startsWith('ipns://')) {
      event.preventDefault();
      const scheme = url.startsWith('ipfs://') ? 'ipfs' : 'ipns';
      const rest = url.slice(scheme.length + 3);
      contents.loadURL(`https://${scheme}.io/${scheme}/${rest}`).catch(() => {});
      return;
    }

    if (!isWebScheme(url)) {
      event.preventDefault();
      if (!isMobileDeepLink(url)) { try { shell.openExternal(url); } catch {} }
      return;
    }

    const s = settingsStore.load();
    const h = hostnameOf(url);
    const local = h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');

    // ── .onion (Tor hidden services) ───────────────────────────────────────
    // Route transparently over Tor's SOCKS proxy regardless of the general
    // proxy setting. First visit in a session bootstraps Tor and retries.
    if (h && h.endsWith('.onion')) {
      if (!ensureTorForOnion()) {
        event.preventDefault();
        setTimeout(() => { try { contents.loadURL(url).catch(() => {}); } catch {} }, 4000);
        return;
      }
    }

    // ── ENS / Unstoppable Domains / IPFS naming ────────────────────────────
    // .eth (ENS) and the Unstoppable Domains TLDs aren't resolvable by plain
    // DNS. eth.limo runs a public gateway that resolves both naming systems
    // and IPFS content hashes server-side, so redirect there instead of
    // running our own chain RPC.
    const NAMING_TLDS = ['.eth', '.crypto', '.wallet', '.x', '.nft', '.dao', '.888', '.blockchain', '.bitcoin'];
    if (h && NAMING_TLDS.some(tld => h.endsWith(tld))) {
      event.preventDefault();
      const rest = url.replace(/^[a-z]+:\/\/[^/]+/i, '');
      contents.loadURL(`https://${h}.limo${rest}`).catch(() => {});
      return;
    }

    // ── 18+ / adult site blocking ──────────────────────────────────────────
    if (s.blockAdultSites && !local && isAdultDomain(h)) {
      event.preventDefault();
      contents.loadURL(
        `privoo://blocked/?url=${encodeURIComponent(url)}&reason=adult`
      ).catch(() => {});
      return;
    }

    // ── Force HTTPS upgrade ────────────────────────────────────────────────
    if (!s.httpsUpgrade) return;
    if (!url.startsWith('http://')) return;
    if (local) return;
    if (httpBypassHosts.has(h)) return;
    event.preventDefault();
    stats.upgradedHttps++;
    const showNotice = s.httpsUpgradeShowNotice !== false;
    const target = showNotice
      ? `privoo://upgrading/?url=${encodeURIComponent(url)}`
      : `privoo://insecure/?url=${encodeURIComponent(url)}`;
    contents.loadURL(target).catch(() => {});
  });

  // will-navigate only fires for the TOP frame. TikTok's "verify it's really
  // you" security widget runs inside an iframe and fires its app-handoff
  // navigation (snssdk://, bytedance://…) from there, so guard subframes too.
  // Wrapped defensively: the event shape differs slightly across Electron
  // versions, and will-frame-navigate is absent on very old ones.
  try {
    contents.on('will-frame-navigate', (e) => {
      try {
        const u = e && e.url;
        if (!u || isWebScheme(u)) return;
        e.preventDefault();
        if (!isMobileDeepLink(u)) { try { shell.openExternal(u); } catch {} }
      } catch {}
    });
  } catch {}
});

// Hostnames the user has explicitly allowed plain-http navigation for in this
// app session. Cleared on quit; not persisted.
const httpBypassHosts = new Set();

ipcMain.handle('http-proceed', (_e, url) => {
  try {
    const h = hostnameOf(url);
    if (h) httpBypassHosts.add(h);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

// Marks a webview's webContents as mobile emulated. Applies the device
// identity immediately (both the plain webContents level UA and the CDP
// Client Hints override, which otherwise only gets sent once, on that
// guest's very first dom-ready, long before the renderer ever knows to
// ask for mobile).
ipcMain.on('mark-mobile-webview', (_e, id, device) => {
  if (typeof id !== 'number') return;
  _mobileEmulatedDevices.set(id, MOBILE_DEVICE_PROFILES[device] ? device : 'samsung');
  const wc = webContents.fromId(id);
  if (!wc || wc.isDestroyed()) return;
  const profile = mobileProfileFor(id);
  try { wc.setUserAgent(profile.ua); } catch { /* ignore */ }
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    wc.debugger.sendCommand('Network.setUserAgentOverride', {
      userAgent: profile.ua,
      acceptLanguage: preferredLanguageList().join(','),
      userAgentMetadata: profile.metadata || UA_METADATA,
    }).catch(() => {});
  } catch { /* debugger already attached elsewhere, or contents gone */ }
});

let _lastRecentFiles = [];
// Broad file category, used for the icon shown in the picker.
function fileKindFromExt(filePath) {
  const e = path.extname(filePath).toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|ico)$/.test(e)) return 'image';
  if (/\.(mp4|mkv|mov|avi|webm|m4v|wmv|flv)$/.test(e))         return 'video';
  if (/\.(mp3|wav|flac|m4a|aac|ogg|opus|wma)$/.test(e))        return 'audio';
  if (/\.pdf$/.test(e))                                        return 'pdf';
  if (/\.(docx?|odt|rtf|pages)$/.test(e))                      return 'doc';
  if (/\.(xlsx?|csv|ods|numbers)$/.test(e))                    return 'sheet';
  if (/\.(pptx?|odp|key)$/.test(e))                            return 'slides';
  if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(e))                 return 'archive';
  if (/\.(js|ts|jsx|tsx|json|html?|css|py|rb|go|rs|java|c|cpp|h|sh|yml|yaml|xml|md)$/.test(e)) return 'code';
  if (/\.(txt|log|ini|cfg)$/.test(e))                          return 'text';
  return 'file';
}

// Recent files. Previously this only listed things Privoo itself had
// downloaded, which is rarely what you want to attach - the file you just
// saved from another app, or a screenshot on the Desktop, never appeared.
// Now it merges Privoo's own downloads with the most recently modified files
// in the usual folders, newest first.
function scanRecentDir(dir, out, seen, cutoffMs) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    if (!ent.isFile() || ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (seen.has(full)) continue;
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    // Skip partial downloads and anything ancient.
    if (/\.(crdownload|part|tmp)$/i.test(ent.name)) continue;
    if (stat.mtimeMs < cutoffMs) continue;
    seen.add(full);
    out.push({ name: ent.name, path: full, size: stat.size, mtimeMs: stat.mtimeMs, kind: fileKindFromExt(full) });
  }
}

ipcMain.handle('recent-files-list', () => {
  const seen = new Set();
  const out = [];

  // Privoo's completed downloads first - they are the most likely target.
  for (const d of downloadStore.load()) {
    if (d.state !== 'completed' || !d.savePath || seen.has(d.savePath)) continue;
    let stat;
    try { stat = fs.statSync(d.savePath); } catch { continue; }
    seen.add(d.savePath);
    out.push({
      name: d.filename || path.basename(d.savePath),
      path: d.savePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      kind: fileKindFromExt(d.savePath),
    });
  }

  // Then whatever is genuinely recent in the usual places. 30 days keeps the
  // scan cheap and the list relevant.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const dirs = [];
  const pushPath = (name) => { try { dirs.push(app.getPath(name)); } catch { /* not on this OS */ } };
  pushPath('downloads'); pushPath('desktop'); pushPath('documents'); pushPath('pictures');
  for (const d of dirs) scanRecentDir(d, out, seen, cutoff);

  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const top = out.slice(0, 12);
  _lastRecentFiles = top;
  return top;
});
ipcMain.handle('recent-file-read', async (_e, filePath) => {
  const entry = _lastRecentFiles.find((f) => f.path === filePath);
  if (!entry) return { ok: false, error: 'Not in recent files list' };
  try {
    const data = await fs.promises.readFile(filePath);
    return { ok: true, base64: data.toString('base64'), name: entry.name, mime: mimeFromExt(filePath) };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
function mimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const table = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.zip': 'application/zip', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  };
  return table[ext] || 'application/octet-stream';
}

// Clear Data on Exit — only on a genuine app quit (tray Quit, Alt+F4 with
// minimizeToTray off, etc), never on a close-to-tray, which just hides the
// window rather than firing before-quit at all.
let _exitDataCleared = false;
app.on('before-quit', async (event) => {
  if (_exitDataCleared) return;
  const s = settingsStore.load();
  if (!s.clearDataOnExit) return;
  event.preventDefault();
  _exitDataCleared = true;
  try {
    historyStore.clearAll();
    downloadStore.clearAll();
    await clearSessionData({ cache: true, cookies: true, siteData: true });
  } catch (e) {
    console.warn('Privoo: clear data on exit failed:', e.message);
  }
  app.quit();
});

app.on('will-quit', () => {
  persistStatsNow();
  shutdownDiscordRpc();
  // Tear down hosted .mariana services (DEL_ONION) before Tor dies, so we
  // don't leave orphaned hidden-service descriptors on the network.
  try { mariana.stopAllForQuit(); } catch { /* ignore */ }
  stopTor();
});

app.on('window-all-closed', () => {
  // With minimize-to-tray on, our `close` handler hides instead of destroys
  // so this event normally won't fire. The check below is a backstop for
  // the case where the user explicitly destroys the last window (e.g. via
  // the renderer's Quit menu item) — in that path we DO quit.
  if (process.platform === 'darwin') return;
  const s = settingsStore.load();
  if (s.minimizeToTray && !global.privooQuittingForReal) return;
  app.quit();
});

// Open a URL/file in the most appropriate existing window, or spawn a fresh
// window if there are none. Used by the OS default-browser / file-open path.
function openUrlInPrivoo(url) {
  if (!url) return;
  // Prefer a normal (non-incognito) window.
  let target = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
  if (!target) {
    const w = createWindow();
    w.webContents.once('did-finish-load', () => {
      w.webContents.send('open-tab', url);
    });
    return;
  }
  if (target.isMinimized()) target.restore();
  target.show();
  target.focus();
  try { target.webContents.send('open-tab', url); } catch {}
}

// Re-launch (OS opened an http link / .html file while Privoo is running, or
// the user clicked the exe / tray icon again). Route any URL/file argument
// into the running window; always surface a window.
app.on('second-instance', (_e, argv) => {
  const url = urlFromArgv(argv);
  if (url) {
    openUrlInPrivoo(url);
    return;
  }
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    if (w.isMinimized()) w.restore();
    w.show();
    w.focus();
  }
});

// macOS delivers file/URL opens through these events rather than argv.
app.on('open-url', (e, url) => {
  e.preventDefault();
  if (app.isReady()) openUrlInPrivoo(url);
  else _pendingLaunchUrl = url;
});
app.on('open-file', (e, filePath) => {
  e.preventDefault();
  let url = '';
  try { url = pathToFileURL(filePath).toString(); } catch {}
  if (!url) return;
  if (app.isReady()) openUrlInPrivoo(url);
  else _pendingLaunchUrl = url;
});

// ---------------------------------------------------------------------------
// IPC — window controls
// ---------------------------------------------------------------------------
function winOf(e) {
  const wc = e && e.sender;
  if (!wc) return null;
  const direct = BrowserWindow.fromWebContents(wc);
  if (direct) return direct;
  // A <webview> guest is not owned by a window directly — its embedder is.
  try {
    const host = wc.hostWebContents;
    if (host && !host.isDestroyed()) {
      const viaHost = BrowserWindow.fromWebContents(host);
      if (viaHost) return viaHost;
    }
  } catch { /* guest already gone */ }
  return null;
}

ipcMain.on('window-minimize',  (e) => winOf(e)?.minimize());
ipcMain.on('window-maximize',  (e) => { const w = winOf(e); if (!w) return; w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.on('window-close',     (e) => winOf(e)?.close());
// The setup wizard locks the window size; this re-enables resizing once the
// user finishes (or skips) first-run setup.
ipcMain.on('setup-finished',   (e) => { const w = winOf(e); if (w && !w.isDestroyed()) { try { w.setResizable(true); } catch {} if (w.privooMainWindow) applyWindowTranslucency(w, settingsStore.load()); } });
ipcMain.handle('window-is-maximized', (e) => !!winOf(e)?.isMaximized());
ipcMain.handle('get-platform', () => process.platform);

// The renderer needs this so it does not paint the translucent chrome on a
// platform where the window behind it can never actually be see-through.
ipcMain.handle('translucency-supported', () => semiTransparencySupported());
ipcMain.handle('get-app-version', () => app.getVersion());

// Returns the OS cursor position translated into the window's content area
// (viewport coords). Lets the renderer position HTML overlays — like the
// right-click context menu — directly under the cursor, even when the event
// originated inside a webview guest where renderer-side mouse coords aren't
// available.
ipcMain.handle('get-cursor-pos', (e) => {
  try {
    const win = BrowserWindow.fromWebContents(e.sender) || BrowserWindow.getFocusedWindow();
    if (!win || win.isDestroyed()) return { x: 0, y: 0 };
    // screen.getCursorScreenPoint() and getContentBounds() both return DIPs
    // on Electron 14+, but Windows has had historical inconsistencies on
    // scaled displays. Pick the display the cursor is over and use its
    // scaleFactor as a sanity check.
    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getContentBounds();
    return { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
  } catch {
    return { x: 0, y: 0 };
  }
});

// Mobile View — frameless window showing an interactive phone frame with the
// page loaded inside a webview. The phone bezel is draggable via CSS
// -webkit-app-region: drag set in mobile-frame.html.
ipcMain.handle('open-mobile-window', (_e, url) => {
  try {
    const iconPath = resolveIcon();
    const device = settingsStore.load().mobileEmulationDevice === 'iphone' ? 'iphone' : 'samsung';
    const win = new BrowserWindow({
      width: 560,
      height: 920,
      minWidth: 480,
      minHeight: 700,
      title: 'Mobile View',
      frame: false,
      // NOT transparent. With a transparent window and a transparent body the
      // desktop showed through around the phone, so whatever happened to be
      // behind the window became the backdrop - and changing device changed
      // the phone size, which changed how much of it you saw. An opaque stage
      // looks the same on every machine and for every device.
      transparent: false,
      backgroundColor: '#15161a',
      autoHideMenuBar: true,
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true,
        // Minimal preload, only exposes the mobile UA marker + settings
        // get/set. The full webview-preload.js broke the inner webview's
        // ability to load external URLs when tried here before.
        preload: path.join(__dirname, 'mobile-frame-preload.js'),
      },
    });

    // A webview paints white until the guest page's own stylesheet loads —
    // set its background before first paint so that flash reads as the
    // phone shell's black instead of a stray white panel.
    win.webContents.on('will-attach-webview', (_e2, webPreferences) => {
      webPreferences.backgroundColor = '#000000';
    });

    const framePath = path.join(RENDERER_DIR, 'internal', 'mobile-frame.html');
    win.loadFile(framePath, { query: { url: url || '', device } });

    return { ok: true };
  } catch (e) {
    console.error('[mobile-view]', e);
    return { ok: false };
  }
});

ipcMain.handle('is-default-browser', () => app.isDefaultProtocolClient('https'));
ipcMain.handle('set-default-browser', () => {
  if (process.platform === 'win32') {
    if (app.isPackaged) registerWindowsBrowserCapabilities();
    try {
      app.setAsDefaultProtocolClient('https');
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('ftp');
    } catch {}
    // Open the "Set program defaults" dialog for Privoo via COM.
    // IApplicationAssociationRegistrationUI::LaunchAdvancedAssociationUI shows
    // ALL of Privoo's registered file types + protocols so the user can enable
    // them all in one click — not just http/https like ms-settings:defaultapps.
    // Falls back to the Settings Default apps page if COM call fails.
    const { spawn } = require('child_process');
    try {
      spawn('powershell', [
        '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command',
        `try {` +
        `  $ui = [Activator]::CreateInstance([Type]::GetTypeFromCLSID([Guid]'1968106d-f3b5-44cf-890e-116a0d5cf8e9'));` +
        `  $ui.LaunchAdvancedAssociationUI('Privoo')` +
        `} catch {` +
        `  Start-Process 'ms-settings:defaultapps'` +
        `}`,
      ], { detached: true, windowsHide: true }).unref();
    } catch {
      shell.openExternal('ms-settings:defaultapps');
    }
  } else {
    app.setAsDefaultProtocolClient('https');
    app.setAsDefaultProtocolClient('http');
  }
});

// Show a native OS context menu. Renderer sends a tree of items
// (`{id, label, type, enabled, submenu}`); we build a Menu, popup it at the
// cursor position (OS handles positioning so it's always exactly under the
// cursor), and resolve with the clicked item id (or null on dismiss).
// "Open link in new window". A real second window, with the link as its
// first tab — the renderer cannot make one.
ipcMain.handle('open-in-new-window', (_e, url) => {
  if (!url || typeof url !== 'string') return false;
  try {
    const w = createWindow();
    w.webContents.once('did-finish-load', () => {
      try { w.webContents.send('open-tab', url); } catch {}
    });
    return true;
  } catch { return false; }
});

// "Add to dictionary". The word list belongs to the session the page is in,
// not to the default one — an incognito or profile partition has its own.
ipcMain.handle('add-to-dictionary', (_e, guestWcId, word) => {
  if (!word || typeof word !== 'string') return false;
  try {
    const guest = webContents.fromId(Number(guestWcId));
    const ses = guest && !guest.isDestroyed() ? guest.session : session.defaultSession;
    ses.addWordToSpellCheckerDictionary(word);
    return true;
  } catch { return false; }
});

// "Copy image" puts the decoded bitmap on the clipboard, which only the
// page's own webContents can do — the renderer has the URL, not the pixels.
ipcMain.handle('context-copy-image', (_e, guestWcId, x, y) => {
  try {
    const guest = webContents.fromId(Number(guestWcId));
    if (!guest || guest.isDestroyed()) return false;
    guest.copyImageAt(Number(x) || 0, Number(y) || 0);
    return true;
  } catch { return false; }
});

ipcMain.handle('show-context-menu', (e, items) => {
  return new Promise((resolve) => {
    const win = winOf(e);
    if (!Array.isArray(items) || items.length === 0) { resolve(null); return; }
    let resolved = false;
    const finish = (id) => {
      if (resolved) return;
      resolved = true;
      resolve(id);
    };
    const build = (list) => list.map((it) => {
      if (!it || it.type === 'separator') return { type: 'separator' };
      if (Array.isArray(it.submenu) && it.submenu.length) {
        return {
          label: String(it.label || ''),
          enabled: it.enabled !== false,
          submenu: build(it.submenu),
        };
      }
      return {
        id: String(it.id),
        label: String(it.label || ''),
        enabled: it.enabled !== false,
        type: it.type || 'normal',
        accelerator: it.accelerator || undefined,
        click: () => finish(String(it.id)),
      };
    });
    const menu = Menu.buildFromTemplate(build(items));
    menu.popup({
      window: win || undefined,
      callback: () => finish(null),
    });
  });
});

// "Emoji & symbols" — open the real OS emoji panel, the same flyout Chrome
// and Edge use. On Windows that panel is a shell feature bound to Win+. , so
// we synthesise the LWIN+OEM_PERIOD keystroke at the OS level via
// keybd_event; it then appears over whatever editable field has focus.
// Returns true if a native panel was triggered, false to let the caller fall
// back to the built-in picker (macOS / Linux have no equivalent shell panel).
ipcMain.handle('show-emoji-panel', () => {
  if (process.platform !== 'win32') return false;
  try {
    const { execFile } = require('child_process');
    const script = [
      "Add-Type -Namespace PV -Name Emoji -MemberDefinition '[DllImport(\"user32.dll\")]public static extern void keybd_event(byte b,byte s,uint f,UIntPtr e);'",
      '$w=0x5B;$d=0xBE;$u=2',
      '[PV.Emoji]::keybd_event($w,0,0,[UIntPtr]::Zero)',
      '[PV.Emoji]::keybd_event($d,0,0,[UIntPtr]::Zero)',
      '[PV.Emoji]::keybd_event($d,0,$u,[UIntPtr]::Zero)',
      '[PV.Emoji]::keybd_event($w,0,$u,[UIntPtr]::Zero)',
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { windowsHide: true }, () => {});
    return true;
  } catch {
    return false;
  }
});

// Capture the FULL scrolling page (not just the visible viewport) of a guest
// webContents and save it as a PNG. Uses CDP Page.captureScreenshot with
// captureBeyondViewport — the only reliable way to get below-the-fold content
// in a single image. Chrome buries this; Privoo puts it one click away.
/* Thumbnail of a tab, for the hover preview in the tab strip.
   Deliberately NOT the CDP path that capture-full-page uses: attaching the
   debugger to a page just because the pointer crossed its tab would fight
   with DevTools, and capturing "beyond viewport" would render the whole
   document to produce a 220px picture. capturePage() takes what is already
   composited, which for a background tab is its last painted frame — exactly
   what a preview should show.

   The resize happens here rather than in CSS so what crosses the IPC boundary
   is a ~15KB data URL instead of a full-window PNG. */
ipcMain.handle('capture-tab-preview', async (_e, guestWcId) => {
  try {
    const guest = webContents.fromId(Number(guestWcId));
    if (!guest || guest.isDestroyed()) return null;
    // A page that has never been shown has no frame to capture and returns an
    // empty image; the renderer treats null as "no preview" and falls back to
    // the title card.
    if (guest.isLoadingMainFrame() && guest.getURL() === '') return null;
    const img = await guest.capturePage();
    if (!img || img.isEmpty()) return null;
    // JPEG, not PNG. This is a 260px photograph of a web page — the base64
    // of a PNG at that size is roughly three times the bytes for no visible
    // difference, and every one of those bytes crosses an IPC boundary
    // before the card can be shown.
    const small = img.resize({ width: 260, quality: 'good' });
    return 'data:image/jpeg;base64,' + small.toJPEG(70).toString('base64');
  } catch {
    return null;
  }
});

ipcMain.handle('capture-full-page', async (e, guestWcId) => {
  const guest = webContents.fromId(Number(guestWcId));
  if (!guest || guest.isDestroyed()) return { ok: false, error: 'Page unavailable' };

  let attachedHere = false;
  try {
    if (!guest.debugger.isAttached()) { guest.debugger.attach('1.3'); attachedHere = true; }
  } catch {
    // Already attached (DevTools or our spoof CDP) — try to reuse it; if that
    // fails the command calls below will reject and we surface the error.
  }
  const detachIfOurs = () => { if (attachedHere) { try { guest.debugger.detach(); } catch {} } };

  try {
    const metrics = await guest.debugger.sendCommand('Page.getLayoutMetrics');
    const size = metrics.cssContentSize || metrics.contentSize || {};
    const width  = Math.max(1, Math.min(Math.ceil(size.width  || 1280), 16384));
    const height = Math.max(1, Math.min(Math.ceil(size.height || 800), 30000));
    const shot = await guest.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    detachIfOurs();

    const buf = Buffer.from(shot.data, 'base64');
    const host = (() => {
      try { return new URL(guest.getURL()).hostname.replace(/^www\./, ''); }
      catch { return 'page'; }
    })();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const defaultPath = path.join(
      settingsStore.load().downloadPath || app.getPath('downloads'),
      `privoo-${host}-${stamp}.png`,
    );
    const res = await dialog.showSaveDialog(winOf(e), {
      title: 'Save full-page screenshot',
      defaultPath,
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, buf);
    return { ok: true, path: res.filePath };
  } catch (err) {
    detachIfOurs();
    return { ok: false, error: String(err?.message || err) };
  }
});

// Embed DevTools UI for `guestWcId` into the webContents identified by `devWcId`
// (a hidden <webview> in the renderer). This is what gives us Chrome-style
// docked DevTools — without this, openDevTools always spawns a new window.
// Open DevTools for guestWcId.  If devWcId is supplied (the #devtools-view
// webview's webContents id) we try to embed via setDevToolsWebContents so
// DevTools renders inside our custom right-side panel.  If that throws we
// fall back to a native right-docked window — either way { detached } tells
// the renderer whether to show #devtools-pane.
const dockedDevToolsViews = new Map();

function cleanDevToolsBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const x = Math.max(0, Math.round(Number(bounds.x) || 0));
  const y = Math.max(0, Math.round(Number(bounds.y) || 0));
  const width = Math.max(1, Math.round(Number(bounds.width) || 0));
  const height = Math.max(1, Math.round(Number(bounds.height) || 0));
  return { x, y, width, height };
}

function destroyDockedDevToolsView(guestId) {
  const id = Number(guestId);
  const entry = dockedDevToolsViews.get(id);
  if (!entry) return;
  dockedDevToolsViews.delete(id);
  try {
    if (entry.win && !entry.win.isDestroyed()) entry.win.removeBrowserView(entry.view);
  } catch {}
  try {
    if (!entry.view.webContents.isDestroyed()) entry.view.webContents.destroy();
  } catch {}
}

function ensureDockedDevToolsView(guest, bounds) {
  const guestId = guest.id;
  const win = BrowserWindow.fromWebContents(guest);
  const nextBounds = cleanDevToolsBounds(bounds);
  if (!win || win.isDestroyed() || !nextBounds) return null;

  let entry = dockedDevToolsViews.get(guestId);
  if (entry && (entry.win !== win || entry.win?.isDestroyed?.() || entry.view.webContents.isDestroyed())) {
    destroyDockedDevToolsView(guestId);
    entry = null;
  }
  if (!entry) {
    const view = new BrowserView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.addBrowserView(view);
    entry = { win, view };
    dockedDevToolsViews.set(guestId, entry);
  }
  entry.view.setBounds(nextBounds);
  try { entry.view.setAutoResize({ width: false, height: false }); } catch {}
  try { entry.win.setTopBrowserView(entry.view); } catch {}
  return entry.view.webContents;
}

ipcMain.handle('open-devtools', (_e, guestWcId, opts) => {
  try {
    const guest = webContents.fromId(Number(guestWcId));
    if (!guest || guest.isDestroyed()) return { ok: false };
    // Privoo's own pages are app UI, not inspectable content. The renderer
    // already hides the menu item; this stops any other route in.
    const gurl = (() => { try { return guest.getURL() || ''; } catch { return ''; } })();
    if (gurl.startsWith('privoo://') || gurl.startsWith('devtools://')) return { ok: false };
    const hasCoords = opts && opts.x !== undefined && opts.y !== undefined;
    const guestId = guest.id;

    if (guest.isDevToolsOpened()) {
      if (hasCoords) {
        guest.inspectElement(opts.x, opts.y);
        try { guest.devToolsWebContents?.focus(); } catch {}
        return { ok: true, opened: true, embedded: dockedDevToolsViews.has(guestId) };
      }
      guest.closeDevTools();
      destroyDockedDevToolsView(guestId);
      return { ok: true, closed: true };
    }

    // Preferred: render DevTools INTO our right-side panel webview (devWcId).
    // This is the only reliable way to dock DevTools on the right for a
    // <webview> guest — openDevTools({mode:'right'}) is ignored for guests.
    const host = ensureDockedDevToolsView(guest, opts?.bounds);
    if (host && !host.isDestroyed()) {
      try {
        guest.setDevToolsWebContents(host);
        if (hasCoords) {
          guest.once('devtools-opened', () => {
            if (!guest.isDestroyed()) guest.inspectElement(opts.x, opts.y);
          });
        }
        guest.openDevTools({ mode: 'detach' });
        return { ok: true, opened: true, embedded: true };
      } catch {
        destroyDockedDevToolsView(guestId);
      }
    }

    // Fallback: native right-docked DevTools.
    guest.openDevTools({ mode: 'right', activate: true });
    if (hasCoords) {
      guest.once('devtools-opened', () => {
        if (!guest.isDestroyed()) guest.inspectElement(opts.x, opts.y);
      });
    }
    return { ok: true, opened: true, embedded: false };
  } catch (e) {
    return { ok: false };
  }
});

// Detach DevTools from the right-side panel (called when the panel is closed).
ipcMain.handle('close-devtools', (_e, guestWcId) => {
  try {
    const guestId = Number(guestWcId);
    const guest = webContents.fromId(guestId);
    if (guest && !guest.isDestroyed() && guest.isDevToolsOpened()) guest.closeDevTools();
    destroyDockedDevToolsView(guestId);
    return { ok: true };
  } catch { return { ok: false }; }
});

ipcMain.handle('update-devtools-bounds', (_e, guestWcId, bounds) => {
  try {
    const entry = dockedDevToolsViews.get(Number(guestWcId));
    const nextBounds = cleanDevToolsBounds(bounds);
    if (!entry || !nextBounds || entry.view.webContents.isDestroyed()) return { ok: false };
    entry.view.setBounds(nextBounds);
    try { entry.win?.setTopBrowserView(entry.view); } catch {}
    return { ok: true };
  } catch { return { ok: false }; }
});

// ---------------------------------------------------------------------------
// IPC — privacy / stats / settings
// ---------------------------------------------------------------------------
// ── Privoo Guard (optional ClamAV-backed scanning) ───────────────────
const privooProtection = require('./privoo-protection');
let _scanHandle = null;

ipcMain.handle('protection-status', async () => ({
  installed: privooProtection.isInstalled(),
  binary:    privooProtection.findBinary(),
  version:   await privooProtection.version(),
  scanning:  privooProtection.isScanning(),
  installing: clamInstaller.isInstalling(),
  managed:    !!clamInstaller.managedScanner(),
  hasDatabase: clamInstaller.hasDatabase(),
  canAutoInstall: clamInstaller.supportsAutoInstall(),
  targets:   { quick: privooProtection.scanTargets('quick'), full: privooProtection.scanTargets('full') },
  downloadUrl: privooProtection.downloadPageUrl(),
}));

ipcMain.handle('protection-locate', async (e) => {
  const { dialog } = require('electron');
  const res = await dialog.showOpenDialog(winOf(e), {
    title: 'Locate clamscan',
    properties: ['openFile'],
    filters: process.platform === 'win32' ? [{ name: 'clamscan', extensions: ['exe'] }] : [],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  privooProtection.setBinaryPath(res.filePaths[0]);
  settingsStore.save({ protectionBinaryPath: res.filePaths[0] });
  return res.filePaths[0];
});

ipcMain.handle('protection-scan', (e, opts) => {
  const wc = e.sender;
  if (_scanHandle) return { ok: false, error: 'A scan is already running.' };
  const started = Date.now();
  // Show the browser-wide status immediately. ClamAV only reports individual
  // files periodically, which used to leave the notification absent for the
  // first part of a large scan.
  const begin = { type: 'start', startedAt: started };
  try { if (!wc.isDestroyed()) wc.send('protection-scan-event', begin); } catch { /* closed */ }
  try { broadcastAll('protection-scan-event', begin); } catch { /* ignore */ }
  _scanHandle = privooProtection.scan(opts || {}, (ev) => {
    if (ev.type === 'done' || ev.type === 'error') _scanHandle = null;
    // The requesting page (Settings, in a webview) gets the detailed stream.
    try { if (!wc.isDestroyed()) wc.send('protection-scan-event', ev); } catch { /* closed */ }
    // Every browser window also gets it, so the progress toast can live in
    // the main chrome and stay visible while you carry on browsing.
    try { broadcastAll('protection-scan-event', { ...ev, startedAt: started }); } catch { /* ignore */ }
  });
  return { ok: true };
});

const clamInstaller = require('./clamav-installer');

// Runs in the background; progress is streamed to the requesting page so the
// Settings section can show the download without blocking anything.
ipcMain.handle('protection-install', async (e) => {
  const wc = e.sender;
  const send = (ev) => { try { if (!wc.isDestroyed()) wc.send('protection-install-event', ev); } catch { /* page gone */ } };
  const ok = await clamInstaller.install(send);
  return { ok };
});

ipcMain.handle('protection-update-signatures', async (e) => {
  const wc = e.sender;
  const send = (ev) => { try { if (!wc.isDestroyed()) wc.send('protection-install-event', ev); } catch {} };
  const ok = await clamInstaller.updateSignatures(send);
  return { ok };
});

ipcMain.handle('protection-detect', () => {
  const res = privooProtection.detectExisting();
  // Adopting it here means the user does not have to point at it by hand.
  if (res.found && !res.managed) {
    privooProtection.setBinaryPath(res.path);
    settingsStore.save({ protectionBinaryPath: res.path });
  }
  return res;
});

// Removes a Privoo-managed copy. For a system install there is nothing of
// ours to delete, so it just forgets the path and leaves the package alone.
ipcMain.handle('protection-uninstall', () => {
  const managed = !!clamInstaller.managedScanner();
  privooProtection.setBinaryPath(null);
  settingsStore.save({ protectionBinaryPath: '' });
  if (!managed) return true;
  return clamInstaller.uninstall();
});

// Every action that destroys or moves a file confirms first, and the bulk
// variants confirm ONCE for the whole set rather than once per file — a scan
// that turns up forty hits must not mean forty dialogs.
function threatDetail(paths) {
  const list = paths.slice(0, 8).join('\n');
  return paths.length > 8 ? list + '\n…and ' + (paths.length - 8) + ' more' : list;
}

ipcMain.handle('protection-quarantine-threat', async (e, filePath, threat) => {
  const answer = await dialog.showMessageBox(winOf(e), {
    type: 'warning', buttons: ['Quarantine', 'Cancel'], defaultId: 1, cancelId: 1,
    title: 'Quarantine detected file?',
    message: 'Move this detected file into Privoo Guard quarantine?',
    detail: String(filePath || ''),
  });
  if (answer.response !== 0) return { ok: false, canceled: true };
  try { return await privooProtection.quarantine(filePath, threat); }
  catch (err) { return { ok: false, error: err.message || 'Could not quarantine the file.' }; }
});

ipcMain.handle('protection-remove-threat', async (e, filePath) => {
  const answer = await dialog.showMessageBox(winOf(e), {
    type: 'warning', buttons: ['Remove permanently', 'Cancel'], defaultId: 1, cancelId: 1,
    title: 'Remove detected file?',
    message: 'Permanently remove this detected file?',
    detail: String(filePath || ''),
  });
  if (answer.response !== 0) return { ok: false, canceled: true };
  try { return await privooProtection.removeThreat(filePath); }
  catch (err) { return { ok: false, error: err.message || 'Could not remove the file.' }; }
});

// Bulk actions. `items` is [{ path, threat }]; the result reports per-path
// outcomes so the list can mark each row without a second round trip.
ipcMain.handle('protection-act-on-threats', async (e, action, items) => {
  const list = (Array.isArray(items) ? items : []).filter((i) => i && i.path);
  if (!list.length) return { ok: false, error: 'Nothing to act on.' };
  const paths = list.map((i) => String(i.path));
  const removing = action === 'remove';
  const answer = await dialog.showMessageBox(winOf(e), {
    type: 'warning',
    buttons: [removing ? 'Remove all permanently' : 'Quarantine all', 'Cancel'],
    defaultId: 1, cancelId: 1,
    title: removing ? 'Remove all detected files?' : 'Quarantine all detected files?',
    message: removing
      ? `Permanently remove ${paths.length} detected file${paths.length === 1 ? '' : 's'}?`
      : `Move ${paths.length} detected file${paths.length === 1 ? '' : 's'} into Privoo Guard quarantine?`,
    detail: threatDetail(paths),
  });
  if (answer.response !== 0) return { ok: false, canceled: true };

  const results = [];
  for (const item of list) {
    try {
      if (removing) await privooProtection.removeThreat(item.path);
      else await privooProtection.quarantine(item.path, item.threat);
      results.push({ path: item.path, ok: true });
    } catch (err) {
      results.push({ path: item.path, ok: false, error: err.message || 'Failed.' });
    }
  }
  return { ok: true, results, done: results.filter((r) => r.ok).length };
});

// Open the containing folder with the file selected — the "let me look at it
// myself before deciding" option.
ipcMain.handle('protection-reveal-threat', (_e, filePath) => {
  try { shell.showItemInFolder(path.resolve(String(filePath || ''))); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message || 'Could not open that folder.' }; }
});

// ── Quarantine management ──────────────────────────────────────────────────
ipcMain.handle('protection-quarantine-list', async () => {
  try { return { ok: true, items: await privooProtection.quarantineList() }; }
  catch (err) { return { ok: false, error: err.message || 'Could not read the quarantine.', items: [] }; }
});

ipcMain.handle('protection-quarantine-open', async () => {
  const dir = privooProtection.quarantineDir();
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const err = await shell.openPath(dir);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (err) { return { ok: false, error: err.message || 'Could not open the folder.' }; }
});

ipcMain.handle('protection-quarantine-restore', async (e, id) => {
  const answer = await dialog.showMessageBox(winOf(e), {
    type: 'warning', buttons: ['Restore anyway', 'Cancel'], defaultId: 1, cancelId: 1,
    title: 'Restore a quarantined file?',
    message: 'Put this file back where it came from?',
    detail: 'It was detected as a threat. Restoring it makes it runnable again.',
  });
  if (answer.response !== 0) return { ok: false, canceled: true };
  try { return await privooProtection.quarantineRestore(id); }
  catch (err) { return { ok: false, error: err.message || 'Could not restore the file.' }; }
});

ipcMain.handle('protection-quarantine-delete', async (e, id) => {
  const answer = await dialog.showMessageBox(winOf(e), {
    type: 'warning', buttons: ['Delete permanently', 'Cancel'], defaultId: 1, cancelId: 1,
    title: 'Delete a quarantined file?',
    message: 'Permanently delete this quarantined file?',
    detail: 'This cannot be undone.',
  });
  if (answer.response !== 0) return { ok: false, canceled: true };
  try { return await privooProtection.quarantineDelete(id); }
  catch (err) { return { ok: false, error: err.message || 'Could not delete the file.' }; }
});

ipcMain.handle('protection-quarantine-empty', async (e) => {
  const answer = await dialog.showMessageBox(winOf(e), {
    type: 'warning', buttons: ['Empty quarantine', 'Cancel'], defaultId: 1, cancelId: 1,
    title: 'Empty the quarantine?',
    message: 'Permanently delete everything Privoo Guard has quarantined?',
    detail: 'This cannot be undone.',
  });
  if (answer.response !== 0) return { ok: false, canceled: true };
  try { return await privooProtection.quarantineEmpty(); }
  catch (err) { return { ok: false, error: err.message || 'Could not empty the quarantine.' }; }
});

// Pick an arbitrary folder or file to scan, rather than the fixed quick/full
// target sets.
ipcMain.handle('protection-pick-target', async (e, mode) => {
  const { dialog } = require('electron');
  const wantFile = mode === 'file';
  const res = await dialog.showOpenDialog(winOf(e), {
    title: wantFile ? 'Choose a file to scan' : 'Choose a folder to scan',
    properties: [wantFile ? 'openFile' : 'openDirectory'],
    filters: wantFile && process.platform === 'win32'
      ? [{ name: 'Programs and files', extensions: ['exe', 'msi', 'com', 'bat', 'cmd', '*'] }]
      : [],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return res.filePaths[0];
});

ipcMain.handle('protection-cancel', () => {
  privooProtection.cancel();
  _scanHandle = null;
  return true;
});

ipcMain.handle('privacy-stats', () => stats);

ipcMain.handle('reset-privacy-stats', () => {
  stats.blockedAds = 0;
  stats.blockedCookies = 0;
  stats.upgradedHttps = 0;
  stats.since = Date.now();
  persistStatsNow();
  return stats;
});

// Per-page blocked-request count, keyed by guest webContents id.
// The omnibox shield reads this to show "N trackers blocked on this page".
ipcMain.handle('page-blocked-count', (_e, wcId) => {
  if (!wcId) return 0;
  return pageBlockedCounts.get(wcId) || 0;
});

ipcMain.handle('get-settings', () => ({
  settings: settingsStore.load(),
  searchEngines: settingsStore.SEARCH_ENGINES,
  dohProviders: settingsStore.DOH_PROVIDERS,
  downloadPath: settingsStore.load().downloadPath || app.getPath('downloads'),
}));

// Reject anything that isn't a plain object, and strip prototype-pollution
// keys defensively even though JSON.parse + spread already won't trigger
// them. Belt-and-braces for a public IPC surface.
const _BLOCKED_SETTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
ipcMain.handle('set-settings', (_e, patch) => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return saveSettingsAndBroadcast({});
  }
  const clean = {};
  for (const k of Object.keys(patch)) {
    if (_BLOCKED_SETTING_KEYS.has(k)) continue;
    clean[k] = patch[k];
  }
  return saveSettingsAndBroadcast(clean);
});

// ---------------------------------------------------------------------------
// IPC — Google sign-in via system browser
// ---------------------------------------------------------------------------
ipcMain.handle('google-signin-start', async (_e, continueUrl) => {
  try {
    const target = continueUrl || 'https://www.google.com';
    const { callbackPromise } = await startGoogleSignIn(target);

    // Wait for the callback (non-blocking — renderer gets notified via event)
    callbackPromise.then(() => {
      // Sign-in complete in system browser.
      // Now broadcast to all windows so the renderer can open accounts.google.com
      // inside the webview for the lightweight "continue" step.
      broadcastAll('google-signin-system-done', { continueUrl: target });
      console.log('Privoo: System-browser Google sign-in completed');
    }).catch((err) => {
      console.warn('Privoo: Google sign-in callback error:', err.message);
    });

    return { ok: true };
  } catch (err) {
    console.error('Privoo: google-signin-start error:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('google-signin-get-url', (_e, continueUrl) => {
  return buildPostSignInUrl(continueUrl || 'https://www.google.com');
});

ipcMain.handle('choose-download-path', async (e) => {
  const { dialog } = require('electron');
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Choose download folder',
  });
  if (!result.canceled && result.filePaths[0]) {
    saveSettingsAndBroadcast({ downloadPath: result.filePaths[0] });
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('choose-folder', async (e) => {
  const { dialog } = require('electron');
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Choose extension folder',
  });
  if (!result.canceled && result.filePaths[0]) {
    return result.filePaths[0];
  }
  return null;
});

// ── .mariana hosting IPC ────────────────────────────────────────────────────
ipcMain.handle('mariana-list', () => {
  try { return { ok: true, sites: mariana.listSites() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('mariana-choose-folder', async (e) => {
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Choose a folder to host as a .mariana site',
  });
  if (!result.canceled && result.filePaths[0]) return result.filePaths[0];
  return null;
});

ipcMain.handle('mariana-host', async (_e, opts) => {
  try {
    const site = await mariana.hostFolder({ name: opts?.name, folder: opts?.folder });
    return { ok: true, site };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('mariana-stop',   async (_e, id) => {
  try { await mariana.stopSite(id); return { ok: true, sites: mariana.listSites() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('mariana-resume', async (_e, id) => {
  try { const site = await mariana.resumeSite(id); return { ok: true, site, sites: mariana.listSites() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
ipcMain.handle('mariana-remove', async (_e, id) => {
  try { await mariana.removeSite(id); return { ok: true, sites: mariana.listSites() }; }
  catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});

ipcMain.handle('open-directory', async (_e, dirPath) => {
  if (!dirPath || typeof dirPath !== 'string') return { ok: false, error: 'no-path' };
  const normalized = path.normalize(dirPath.trim());
  try {
    if (!fs.existsSync(normalized) || !fs.statSync(normalized).isDirectory()) {
      return { ok: false, error: 'not-found' };
    }
    const err = await shell.openPath(normalized);
    return err ? { ok: false, error: err } : { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Remove any previously-copied wallpaper file (image OR video) from userData so
// switching between an image and a live wallpaper never leaves a stale file and
// the privoo://newtab/wallpaper route always resolves to the current one.
function removeNtpWallpaperFiles() {
  try {
    const dir = app.getPath('userData');
    for (const f of fs.readdirSync(dir)) {
      if (/^ntp-wallpaper\.[a-z0-9]+$/i.test(f)) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

/* ── The wallpaper collection ──────────────────────────────────────────
   Files live in userData/wallpapers/<id><ext>, one per entry. The active
   wallpaper is still ntpWallpaperPath and is still a copy at a fixed name,
   so nothing that reads it has to change: choosing from the collection is
   the same write the file picker has always done.
   ─────────────────────────────────────────────────────────────────────── */
function wallpaperLibDir() {
  const dir = path.join(app.getPath('userData'), 'wallpapers');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* already there */ }
  return dir;
}

function wallpaperLibList() {
  const lib = settingsStore.load().ntpWallpaperLibrary;
  if (!Array.isArray(lib)) return [];
  // Drop entries whose file has gone — deleted outside Privoo, or a profile
  // copied between machines. A tile that opens nothing is worse than no tile.
  const dir = wallpaperLibDir();
  return lib.filter((w) => w && w.id && fs.existsSync(path.join(dir, w.id + w.ext)));
}

function wallpaperLibPath(id) {
  const w = wallpaperLibList().find((x) => x.id === id);
  return w ? path.join(wallpaperLibDir(), w.id + w.ext) : null;
}

ipcMain.handle('wallpaper-lib-list', () => wallpaperLibList());

ipcMain.handle('wallpaper-lib-add', async (e) => {
  const { dialog } = require('electron');
  const res = await dialog.showOpenDialog(winOf(e), {
    title: 'Add wallpapers',
    // More than one at a time: building a collection one file picker at a
    // time is the tedium this feature exists to remove.
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images and video', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'mp4', 'webm', 'mov', 'm4v'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
      { name: 'Video', extensions: ['mp4', 'webm', 'mov', 'm4v'] },
    ],
  });
  if (res.canceled || !res.filePaths.length) return wallpaperLibList();

  const dir = wallpaperLibDir();
  const lib = wallpaperLibList();
  for (const src of res.filePaths) {
    const ext = (path.extname(src) || '.jpg').toLowerCase();
    if (!/^\.(jpe?g|png|gif|webp|bmp|mp4|webm|mov|m4v)$/i.test(ext)) continue;
    const id = 'wp' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    try {
      fs.copyFileSync(src, path.join(dir, id + ext));
      lib.push({
        id,
        ext,
        type: /^\.(mp4|webm|mov|m4v)$/i.test(ext) ? 'video' : 'image',
        name: path.basename(src),
        addedAt: Date.now(),
      });
    } catch (err) {
      console.warn('wallpaper-lib-add:', err.message);
    }
  }
  saveSettingsAndBroadcast({ ntpWallpaperLibrary: lib });
  return lib;
});

ipcMain.handle('wallpaper-lib-use', (_e, id) => {
  const src = wallpaperLibPath(String(id || ''));
  if (!src) return null;
  const entry = wallpaperLibList().find((w) => w.id === id);
  // Copied to the active name rather than pointed at, so removing it from the
  // collection later cannot pull the wallpaper out from under the new tab.
  removeNtpWallpaperFiles();
  const dest = path.join(app.getPath('userData'), 'ntp-wallpaper' + entry.ext);
  try {
    fs.copyFileSync(src, dest);
    saveSettingsAndBroadcast({
      ntpWallpaperPath: dest,
      ntpWallpaperType: entry.type,
      ntpWallpaperVersion: Date.now(),
      ntpWallpaperActiveId: id,
    });
    return dest;
  } catch (err) {
    console.warn('wallpaper-lib-use:', err.message);
    return null;
  }
});

ipcMain.handle('wallpaper-lib-remove', (_e, id) => {
  const key = String(id || '');
  const file = wallpaperLibPath(key);
  if (file) { try { fs.unlinkSync(file); } catch { /* already gone */ } }
  const lib = wallpaperLibList().filter((w) => w.id !== key);
  const s = settingsStore.load();
  const patch = { ntpWallpaperLibrary: lib };
  // Removing the one currently in use leaves the new tab with a wallpaper
  // that is no longer in the collection, which is a state nobody asked for.
  if (s.ntpWallpaperActiveId === key) {
    removeNtpWallpaperFiles();
    patch.ntpWallpaperPath = '';
    patch.ntpWallpaperActiveId = '';
    patch.ntpWallpaperVersion = Date.now();
  }
  saveSettingsAndBroadcast(patch);
  return lib;
});

ipcMain.handle('choose-ntp-wallpaper', async (e) => {
  const { dialog } = require('electron');
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose new tab wallpaper',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase() || '.jpg';
  const safeExt = /^\.(jpe?g|png|gif|webp|bmp)$/i.test(ext) ? ext : '.jpg';
  removeNtpWallpaperFiles();
  const dest = path.join(app.getPath('userData'), `ntp-wallpaper${safeExt}`);
  try {
    fs.copyFileSync(src, dest);
    saveSettingsAndBroadcast({ ntpWallpaperPath: dest, ntpWallpaperType: 'image', ntpWallpaperVersion: Date.now() });
    return dest;
  } catch (err) {
    console.warn('choose-ntp-wallpaper:', err.message);
    return null;
  }
});

// Custom pointer. The image is copied into the profile so it survives the
// original file being moved, and read back as a data URL because CSS cursor()
// will not load a privoo:// URL from the chrome document.
ipcMain.handle('choose-cursor-image', async (e) => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(winOf(e), {
    title: 'Choose a cursor image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'gif', 'webp', 'cur', 'svg'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const src = result.filePaths[0];
  const ext = (path.extname(src).toLowerCase().match(/^.(png|gif|webp|cur|svg)$/) || [])[0] || '.png';
  try {
    const stat = fs.statSync(src);
    // A cursor bigger than this is not a cursor, and browsers cap it anyway.
    if (stat.size > 512 * 1024) return { error: 'That image is too large. Use one under 512 KB.' };
    const dest = path.join(app.getPath('userData'), 'cursor' + ext);
    for (const old of ['.png', '.gif', '.webp', '.cur', '.svg']) {
      try { fs.rmSync(path.join(app.getPath('userData'), 'cursor' + old), { force: true }); } catch {}
    }
    fs.copyFileSync(src, dest);
    saveSettingsAndBroadcast({ cursorImagePath: dest, cursorStyle: 'custom' });
    return { path: dest };
  } catch (err) {
    return { error: err.message };
  }
});

// Handed to the renderer as a data URL for the CSS cursor property.
ipcMain.handle('get-cursor-image-url', () => {
  const p = settingsStore.load().cursorImagePath;
  if (!p) return null;
  try {
    const ext = path.extname(p).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : ext === '.cur' ? 'image/x-icon'
      : 'image/png';
    return 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64');
  } catch { return null; }
});

ipcMain.handle('clear-cursor-image', () => {
  const p = settingsStore.load().cursorImagePath;
  if (p) { try { fs.rmSync(p, { force: true }); } catch {} }
  // 'system', not 'default' — the Settings dropdown offers
  // system/large/precise/custom, so 'default' matched no option and left the
  // control blank after clearing the image.
  saveSettingsAndBroadcast({ cursorImagePath: '', cursorStyle: 'system' });
  return true;
});
// Live (video) wallpaper — a muted, looping video plays behind the new tab.
ipcMain.handle('choose-ntp-live-wallpaper', async (e) => {
  const { dialog } = require('electron');
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose a live wallpaper (video)',
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv', 'ogg'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase() || '.mp4';
  const safeExt = /^\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(ext) ? ext : '.mp4';
  removeNtpWallpaperFiles();
  const dest = path.join(app.getPath('userData'), `ntp-wallpaper${safeExt}`);
  try {
    fs.copyFileSync(src, dest);
    saveSettingsAndBroadcast({ ntpWallpaperPath: dest, ntpWallpaperType: 'video', ntpWallpaperVersion: Date.now() });
    return dest;
  } catch (err) {
    console.warn('choose-ntp-live-wallpaper:', err.message);
    return null;
  }
});

// The browser-chrome (full-window) wallpaper is rendered by the host renderer,
// which runs from file://. Hand it a correctly-encoded file:// URL to the
// wallpaper so it can use it as a background / <video> src same-origin.
ipcMain.handle('get-ntp-wallpaper-url', () => {
  const wp = settingsStore.load().ntpWallpaperPath;
  if (!wp || wp === '' || !fs.existsSync(wp)) return '';
  try { return pathToFileURL(wp).toString(); } catch { return ''; }
});

ipcMain.handle('clear-ntp-wallpaper', () => {
  const s = settingsStore.load();
  if (s.ntpWallpaperPath && fs.existsSync(s.ntpWallpaperPath)) {
    // Only delete if it's a custom wallpaper in userData, not the default background.jpg
    const isCustomWallpaper = s.ntpWallpaperPath.includes(app.getPath('userData'));
    if (isCustomWallpaper) {
      try { fs.unlinkSync(s.ntpWallpaperPath); } catch { /* ignore */ }
    }
  }
  removeNtpWallpaperFiles();
  // Set to empty string to indicate "no wallpaper" (vs null which means "use default")
  saveSettingsAndBroadcast({ ntpWallpaperPath: '', ntpWallpaperType: '' });
  return true;
});

ipcMain.handle('choose-music-file', async (e) => {
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose background music',
    properties: ['openFile'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'flac', 'm4a', 'aac'] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const musicPath = result.filePaths[0];
  saveSettingsAndBroadcast({ musicPath });
  return musicPath;
});

// choose-ytdlp-binary IPC removed — ytdlp-installer auto-downloads + updates
// the binary in userData/bin/, so no manual selection is needed.

ipcMain.handle('ytdlp-probe', () => ytdlp.probe(settingsStore.load()));

ipcMain.handle('ytdlp-download', async (e, url, opts) => {
  const settings = settingsStore.load();
  const wc = e.sender;
  // Progress is streamed to the requesting page rather than withheld until
  // the download completes.
  const send = (ev) => {
    try { if (!wc.isDestroyed()) wc.send('ytdlp-progress', ev); } catch { /* page gone */ }
  };
  return ytdlp.downloadMedia(url, settings, opts || {}, send);
});

ipcMain.handle('ytdlp-cancel', (_e, id) => ytdlp.cancelDownload(id));

ipcMain.handle('ytdlp-inspect', (_e, url) => ytdlp.inspect(url, settingsStore.load()));

ipcMain.handle('ytdlp-has-ffmpeg', () => ytdlp.hasFfmpeg());

// ---------------------------------------------------------------------------
// Extensions — load / unload / CRX unpack
// ---------------------------------------------------------------------------
const { checkExtension, impactLines } = require('./extension-compat-check');
const extensionApiHost = require('./extension-api-host');
const { applyCompatShim } = require('./extension-compat');

// Baked into each extension's copy of the bridge and required on every call.
// Persisted so it survives a restart — the bridge file is only rewritten when
// an extension is loaded, and a token that changed underneath it would lock the
// extension out until its next load.
let _extApiToken = null;
let _extApiPort = 0;
function extensionApiToken() {
  if (_extApiToken) return _extApiToken;
  const saved = settingsStore.load().extensionApiToken;
  if (typeof saved === 'string' && saved.length >= 32) {
    _extApiToken = saved;
    return _extApiToken;
  }
  _extApiToken = require('crypto').randomBytes(24).toString('hex');
  try { settingsStore.save({ extensionApiToken: _extApiToken }); } catch { /* read-only profile */ }
  return _extApiToken;
}

// Electron leaves several Chrome extension APIs out entirely, and an extension
// that touches a missing one dies while its background is still loading. These
// are implemented for real — cookies from Electron's own jar, webNavigation
// from Privoo's actual navigation events — and injected into extension service
// workers through a preload, which is the only hook that reaches a background
// context. See extension-api-host.js for what is deliberately NOT provided.
async function installExtensionApiBridge() {
  extensionApiHost.install({
    getWindowInfo: () => {
      const win = BrowserWindow.getAllWindows().find((w) => w.privooMainWindow)
        || BrowserWindow.getAllWindows()[0];
      let bounds = { x: 0, y: 0, width: 0, height: 0 };
      try { if (win && !win.isDestroyed()) bounds = win.getBounds(); } catch { /* gone */ }
      return {
        id: PRIVOO_EXT_WINDOW_ID,
        focused: !!(win && !win.isDestroyed() && win.isFocused()),
        incognito: false,
        alwaysOnTop: false,
        type: 'normal',
        state: win && !win.isDestroyed() && win.isMaximized() ? 'maximized' : 'normal',
        top: bounds.y, left: bounds.x, width: bounds.width, height: bounds.height,
      };
    },
  });

  // Background workers get no preload — Electron accepts
  // registerPreloadScript({ type: 'service-worker' }) and never runs it — and
  // they cannot fetch a custom scheme across origins either. A loopback server
  // is the transport that does reach them. It listens on 127.0.0.1 only and
  // every request must carry a secret that exists solely inside each
  // extension's copy of the bridge.
  return extensionApiHost.startServer(extensionApiToken()).then((port) => {
    _extApiPort = port;
    if (!port) console.warn('Privoo: extension API server could not bind; background bridge is off');
  }).catch(() => { _extApiPort = 0; });
}

function extensionSession() {
  return session.defaultSession.extensions || session.defaultSession;
}

function extPopupPath(manifest) {
  const action = manifest?.action || manifest?.browser_action || {};
  const popup = action.default_popup || manifest?.page_action?.default_popup;
  return popup ? String(popup).replace(/^\//, '') : null;
}

async function loadExtensionAtPath(extPath) {
  // Electron omits several Chrome APIs, and an extension that touches a missing
  // one dies while its background is still loading. The bridge is written into
  // the extension here — before it loads — so it is in place from the first
  // run. See extension-compat.js for what this touches and why.
  try {
    const res = applyCompatShim(extPath, extensionApiToken(), _extApiPort);
    if (res.patched) {
      console.log('Privoo: extension bridge installed for', path.basename(extPath), '(' + res.reason + ')');
    }
  } catch (err) {
    console.warn('Privoo: could not install the extension bridge:', err.message);
  }

  const sess = extensionSession();
  const loaded = await sess.loadExtension(extPath, { allowFileAccess: true });
  loadedExtensionIds.set(extPath, loaded.id);
  // The bridge answers chrome.commands out of the extension's own manifest.
  try {
    extensionApiHost.registerExtensionManifest('chrome-extension://' + loaded.id, loaded.manifest);
  } catch { /* nothing to register */ }
  return loaded;
}

async function unloadExtensionAtPath(extPath) {
  const electronId = loadedExtensionIds.get(extPath);
  if (!electronId) return;
  try {
    extensionSession().removeExtension(electronId);
  } catch { /* ignore */ }
  loadedExtensionIds.delete(extPath);
}

async function syncExtensionsFromSettings(settings) {
  const list = settings?.extensions || [];
  const want = new Set();
  for (const ext of list) {
    if (!ext.enabled || !ext.path) continue;
    try {
      if (!fs.existsSync(ext.path) || !fs.statSync(ext.path).isDirectory()) continue;
      want.add(ext.path);
      if (!loadedExtensionIds.has(ext.path)) {
        await loadExtensionAtPath(ext.path);
      }
    } catch (e) {
      console.warn('Privoo: extension load failed:', ext.path, e.message);
    }
  }
  for (const [extPath, electronId] of [...loadedExtensionIds.entries()]) {
    if (!want.has(extPath)) {
      try { extensionSession().removeExtension(electronId); } catch { /* ignore */ }
      loadedExtensionIds.delete(extPath);
    }
  }
}

/**
 * Strip the CRX wrapper off a buffer and return the raw ZIP bytes.
 * Handles CRX v3 (current — used by every modern Chrome Web Store package)
 * and falls back to v2 (legacy) layout. The previous hand-rolled ZIP parser
 * couldn't handle the data-descriptor flag, which is why crx4chrome
 * downloads failed with "Could not read manifest.json from .crx".
 */
function stripCrxHeader(buf) {
  const isCrx = buf.length > 16
    && buf[0] === 0x43 && buf[1] === 0x72 && buf[2] === 0x32 && buf[3] === 0x34;
  if (!isCrx) return buf;
  const version = buf.readUInt32LE(4);
  if (version === 3) {
    const headerSize = buf.readUInt32LE(8);
    return buf.slice(12 + headerSize);
  }
  if (version === 2) {
    const publicKeyLength = buf.readUInt32LE(8);
    const signatureLength = buf.readUInt32LE(12);
    return buf.slice(16 + publicKeyLength + signatureLength);
  }
  throw new Error(`Unsupported CRX version: ${version}`);
}

async function unpackCrxToUserData(crxPath) {
  const buf = fs.readFileSync(crxPath);
  const zipBuf = stripCrxHeader(buf);
  return unpackZipBuffer(zipBuf, path.basename(crxPath, path.extname(crxPath)));
}

// Unpack a plain packaged extension .zip (many devs distribute extensions this
// way, or you can rename a .crx). Same destination + nested-folder handling as
// the CRX path.
async function unpackZipToUserData(zipPath) {
  const buf = fs.readFileSync(zipPath);
  return unpackZipBuffer(buf, path.basename(zipPath, path.extname(zipPath)));
}

// Shared: write the ZIP bytes to a temp file, extract into userData/extensions,
// then resolve to the folder that actually holds manifest.json (some archives
// wrap the extension in a single top-level directory).
async function unpackZipBuffer(zipBuf, baseName) {
  const extract = require('extract-zip');
  const base = String(baseName).replace(/[^\w.-]+/g, '_');
  const destRoot = path.join(app.getPath('userData'), 'extensions');
  fs.mkdirSync(destRoot, { recursive: true });
  const dest = path.join(destRoot, `${base}_${Date.now()}`);
  const tempZip = path.join(destRoot, `_unpack_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zip`);
  fs.writeFileSync(tempZip, zipBuf);
  try {
    await extract(tempZip, { dir: dest });
  } finally {
    try { fs.unlinkSync(tempZip); } catch {}
  }
  return findManifestRoot(dest);
}

// Return `dir` if it directly contains manifest.json; otherwise, if there's
// exactly one subdirectory that does, return that (handles wrapped archives).
function findManifestRoot(dir) {
  try {
    if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
    const subs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(dir, d.name));
    const withManifest = subs.filter((s) => fs.existsSync(path.join(s, 'manifest.json')));
    if (withManifest.length === 1) return withManifest[0];
  } catch { /* fall through */ }
  return dir;
}

/**
 * Resolve Chrome's __MSG_*__ i18n placeholders in a manifest. uBlock Origin
 * and many other Chrome Web Store packages ship `"name": "__MSG_extName__"`
 * and `"description": "__MSG_extShortDesc__"` — Chrome looks them up in
 * `_locales/<lang>/messages.json`, but Electron doesn't do that
 * automatically, so users would see the literal placeholder strings.
 *
 * Walks the manifest object recursively, replacing any `__MSG_foo__` string
 * with the message text from the extension's locale (preferring the user's
 * `default_locale`, falling back to `en`/`en_US`, then any locale present).
 */
function resolveManifestI18n(manifest, extDir) {
  if (!manifest || typeof manifest !== 'object') return manifest;
  const localesDir = path.join(extDir, '_locales');
  if (!fs.existsSync(localesDir)) return manifest;

  const preferred = [];
  if (manifest.default_locale) preferred.push(String(manifest.default_locale));
  preferred.push('en', 'en_US', 'en_GB');
  try {
    for (const d of fs.readdirSync(localesDir)) {
      if (!preferred.includes(d)) preferred.push(d);
    }
  } catch {}

  let messages = null;
  for (const locale of preferred) {
    const mp = path.join(localesDir, locale, 'messages.json');
    if (fs.existsSync(mp)) {
      try { messages = JSON.parse(fs.readFileSync(mp, 'utf8')); break; }
      catch { /* try next */ }
    }
  }
  if (!messages) return manifest;

  const lookup = (key) => {
    // Chrome message keys are case-insensitive.
    const lc = key.toLowerCase();
    for (const k of Object.keys(messages)) {
      if (k.toLowerCase() === lc) return messages[k]?.message || '';
    }
    return '';
  };
  const RE = /__MSG_([A-Za-z0-9_@-]+)__/g;
  const walk = (val) => {
    if (typeof val === 'string') {
      return val.replace(RE, (_, key) => lookup(key) || `__MSG_${key}__`);
    }
    if (Array.isArray(val)) return val.map(walk);
    if (val && typeof val === 'object') {
      const out = {};
      for (const k of Object.keys(val)) out[k] = walk(val[k]);
      return out;
    }
    return val;
  };
  return walk(manifest);
}

// ---------------------------------------------------------------------------
// Chrome Web Store
// ---------------------------------------------------------------------------
// Store pages have no "install" hook a third-party browser can call, but the
// packages themselves come from a plain, unauthenticated endpoint: the same
// update service Chrome uses to fetch and refresh extensions. Given an
// extension ID it answers with a 302 to the CRX. That is the whole mechanism —
// download the CRX, then reuse the unpack/load path that already handles a
// hand-downloaded .crx.

/** Pull the 32-character extension ID out of a store URL, or accept a bare ID. */
function parseWebStoreId(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  // IDs are exactly 32 characters from a-p (a base-16 alphabet shifted to letters).
  if (/^[a-p]{32}$/i.test(raw)) return raw.toLowerCase();
  let u;
  try { u = new URL(raw.includes('://') ? raw : 'https://' + raw); } catch { return null; }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const onStore = host === 'chromewebstore.google.com'
    || (host === 'chrome.google.com' && u.pathname.toLowerCase().startsWith('/webstore'));
  if (!onStore) return null;
  // The ID is the last path segment on both the current and legacy URL shapes.
  const segs = u.pathname.split('/').filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) {
    if (/^[a-p]{32}$/i.test(segs[i])) return segs[i].toLowerCase();
  }
  return null;
}

/** The update service wants to know what it is serving; wrong values get a 204. */
function crxDownloadUrl(id) {
  const chromeVersion = process.versions.chrome || '120.0.0.0';
  const os = process.platform === 'win32' ? 'win'
    : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86-64';
  const naclArch = process.arch === 'arm64' ? 'arm' : 'x86-64';
  const params = new URLSearchParams({
    response: 'redirect',
    acceptformat: 'crx2,crx3',
    prodversion: chromeVersion,
    prodchannel: 'stable',
    prod: 'chromiumcrx',
    os,
    arch,
    os_arch: arch,
    nacl_arch: naclArch,
    x: `id=${id}&installsource=ondemand&uc`,
  });
  return 'https://clients2.google.com/service/update2/crx?' + params.toString();
}

async function downloadWebStoreCrx(id) {
  const res = await net.fetch(crxDownloadUrl(id), { redirect: 'follow' });
  // 204 is the update service's way of saying "nothing for this ID on this
  // platform / browser version" — it is not an HTTP error, so it has to be
  // checked separately or we would hand an empty buffer to the unpacker.
  if (res.status === 204) {
    throw new Error('The Chrome Web Store has no package for this extension on this platform.');
  }
  if (!res.ok) {
    throw new Error(`The Chrome Web Store returned ${res.status}.`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 64) throw new Error('The downloaded package was empty.');
  return buf;
}

ipcMain.handle('webstore-install', async (_e, input) => {
  const id = parseWebStoreId(input);
  if (!id) {
    return { ok: false, error: 'That is not a Chrome Web Store link or extension ID.' };
  }
  try {
    const crx = await downloadWebStoreCrx(id);
    const zip = stripCrxHeader(crx);
    const dir = await unpackZipBuffer(zip, id);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('The package did not contain a manifest.json.');
    }
    const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const manifest = resolveManifestI18n(raw, dir);
    return {
      ok: true,
      id,
      path: dir,
      name: manifest.name || id,
      version: manifest.version || '',
      description: manifest.description || '',
      manifestVersion: manifest.manifest_version || 2,
    };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not install from the Chrome Web Store.' };
  }
});

/** Used by the chrome to decide whether to offer an install on the page. */
ipcMain.handle('webstore-parse-id', (_e, input) => parseWebStoreId(input));

// ── "Add to Privoo" on the store page itself ───────────────────────────────
// The content script in webview-preload.js relabels the store's own install
// button and routes its click here, so installing from the Chrome Web Store is
// the same two clicks it is in any other Chromium browser.

function extensionList() {
  const list = settingsStore.load().extensions;
  return Array.isArray(list) ? list : [];
}

function findWebStoreExtension(id) {
  return extensionList().find((x) => x && x.webstoreId === id) || null;
}

/**
 * A short, human-readable summary of what the extension is asking for, for the
 * confirmation dialog. Deliberately plain sentences rather than raw permission
 * strings — "Read and change your data on all sites" is what a person needs to
 * decide, not "<all_urls>".
 */
function describePermissions(manifest) {
  const perms = []
    .concat(manifest.permissions || [])
    .concat(manifest.host_permissions || [])
    .filter((p) => typeof p === 'string');
  const hosts = perms.filter((p) => p.includes('://') || p === '<all_urls>');
  const lines = [];
  if (hosts.some((h) => h === '<all_urls>' || /^(\*|https?):\/\/\*\/?/.test(h))) {
    lines.push('Read and change your data on every site you visit');
  } else if (hosts.length) {
    const shown = hosts.slice(0, 4).join(', ');
    lines.push('Read and change your data on: ' + shown + (hosts.length > 4 ? ', and more' : ''));
  }
  const named = {
    tabs: 'See your open tabs and their addresses',
    history: 'Read your browsing history',
    bookmarks: 'Read and change your bookmarks',
    downloads: 'Manage your downloads',
    cookies: 'Read and change cookies',
    clipboardRead: 'Read your clipboard',
    nativeMessaging: 'Talk to applications on your computer',
    proxy: 'Change your proxy settings',
    webRequest: 'Observe and change network requests',
    declarativeNetRequest: 'Block or change network requests',
    management: 'Manage your other extensions',
  };
  for (const key of Object.keys(named)) {
    if (perms.includes(key)) lines.push(named[key]);
  }
  return lines;
}

ipcMain.handle('webstore-status', (_e, input) => {
  const id = parseWebStoreId(input);
  if (!id) return { ok: false, installed: false };
  const found = findWebStoreExtension(id);
  return {
    ok: true,
    installed: !!found,
    enabled: !!(found && found.enabled),
    name: found ? found.name : '',
  };
});

ipcMain.handle('webstore-add', async (e, payload) => {
  const id = parseWebStoreId(payload && payload.id ? payload.id : payload);
  if (!id) return { ok: false, error: 'That is not a Chrome Web Store extension.' };
  if (findWebStoreExtension(id)) {
    return { ok: false, already: true, error: 'That extension is already installed.' };
  }

  let dir, manifest;
  try {
    const crx = await downloadWebStoreCrx(id);
    dir = await unpackZipBuffer(stripCrxHeader(crx), id);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('The package did not contain a manifest.json.');
    manifest = resolveManifestI18n(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), dir);
  } catch (err) {
    return { ok: false, error: err.message || 'Could not download that extension.' };
  }

  const name = manifest.name || (payload && payload.title) || id;
  const perms = describePermissions(manifest);
  // Electron implements only part of the Chrome extension API surface, and an
  // extension that needs a missing piece fails on load rather than degrading.
  // Better to say so now than let it sit in the list doing nothing.
  const compat = checkExtension(manifest);
  const compatBlock = compat.summary
    ? (compat.critical ? "⚠ This extension will not work in Privoo.\n\n" : "⚠ Parts of this extension will not work.\n\n")
      + 'It needs:\n• ' + impactLines(compat).join('\n• ') + '\n\n'
    : '';
  const answer = await dialog.showMessageBox(winOf(e), {
    type: compat.critical ? 'warning' : 'question',
    buttons: [compat.critical ? 'Install anyway' : 'Add extension', 'Cancel'],
    defaultId: compat.critical ? 1 : 0,
    cancelId: 1,
    title: 'Add "' + name + '"?',
    message: compat.critical
      ? '"' + name + '" is not compatible with Privoo'
      : 'Add "' + name + '" to Privoo?',
    detail: compatBlock
      + (perms.length ? 'It can:\n• ' + perms.join('\n• ') + '\n\n' : '')
      + 'Privoo runs on Electron, which implements most but not all Chrome extension APIs.',
  });
  if (answer.response !== 0) {
    // Clean up the package we downloaded for a install that was declined.
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    return { ok: false, canceled: true };
  }

  const record = {
    id: 'ext_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    webstoreId: id,
    name,
    version: manifest.version || '1.0.0',
    description: manifest.description || 'No description provided.',
    path: dir,
    crxPath: '',
    iconUrl: iconAsDataUrl(resolveExtIcon(manifest, dir)),
    unsupported: compat.unsupported.map((u) => u.permission),
    unsupportedCritical: compat.critical,
    enabled: true,
    // Installed from the store on purpose, so put it where the user can reach
    // it — an extension that vanishes on install reads as a failed install.
    pinnedToToolbar: true,
  };

  try {
    const loaded = await loadExtensionAtPath(dir);
    record.electronId = loaded && loaded.id;
  } catch (err) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    return { ok: false, error: 'Privoo could not load that extension: ' + (err.message || 'unknown error') };
  }

  const updated = settingsStore.save({ extensions: [...extensionList(), record] });
  broadcastSettings(updated);
  return { ok: true, name, version: record.version };
});

ipcMain.handle('webstore-remove', async (e, input) => {
  const id = parseWebStoreId(input);
  const found = id && findWebStoreExtension(id);
  if (!found) return { ok: false, error: 'That extension is not installed.' };

  const answer = await dialog.showMessageBox(winOf(e), {
    type: 'warning',
    buttons: ['Remove', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Remove "' + found.name + '"?',
    message: 'Remove "' + found.name + '" from Privoo?',
  });
  if (answer.response !== 0) return { ok: false, canceled: true };

  try { await unloadExtensionAtPath(found.path); } catch { /* already gone */ }
  try { if (found.path) fs.rmSync(found.path, { recursive: true, force: true }); } catch {}
  const updated = settingsStore.save({
    extensions: extensionList().filter((x) => x !== found),
  });
  broadcastSettings(updated);
  return { ok: true, name: found.name };
});

ipcMain.handle('choose-crx-file', async (e) => {
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose Chrome extension (.crx or .zip)',
    properties: ['openFile'],
    filters: [{ name: 'Chrome Extension', extensions: ['crx', 'zip'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('read-ext-manifest', async (_e, filePath) => {
  if (!filePath) return { error: 'No path provided' };
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      const mp = path.join(filePath, 'manifest.json');
      if (!fs.existsSync(mp)) return { error: 'No manifest.json in folder' };
      const raw = JSON.parse(fs.readFileSync(mp, 'utf8'));
      const manifest = resolveManifestI18n(raw, filePath);
      const iconFile = resolveExtIcon(manifest, filePath);
      return {
        ok: true, manifest, path: filePath, iconUrl: iconAsDataUrl(iconFile),
        compat: checkExtension(manifest),
      };
    }
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.crx') || lower.endsWith('.zip')) {
      // Unpack straight away — extract-zip handles all ZIP edge cases (data
      // descriptors, ZIP64, etc.). CRX files get their signed header stripped
      // first; plain .zip packages extract directly.
      const unpacked = lower.endsWith('.crx')
        ? await unpackCrxToUserData(filePath)
        : await unpackZipToUserData(filePath);
      const mp = path.join(unpacked, 'manifest.json');
      if (!fs.existsSync(mp)) return { error: 'No manifest.json found inside the archive' };
      const raw = JSON.parse(fs.readFileSync(mp, 'utf8'));
      const manifest = resolveManifestI18n(raw, unpacked);
      const iconFile = resolveExtIcon(manifest, unpacked);
      return {
        ok: true, manifest, path: unpacked, crxPath: filePath,
        iconUrl: iconAsDataUrl(iconFile),
        compat: checkExtension(manifest),
      };
    }
    return { error: 'Unsupported file. Use a .crx, a .zip, or an unpacked folder' };
  } catch (e) {
    return { error: String(e.message || e) };
  }
});

function resolveExtIcon(manifest, extDir) {
  // Pick the largest icon Chrome would (for crisp toolbar display).
  const iconsField = manifest?.icons || manifest?.action?.default_icon || manifest?.browser_action?.default_icon || {};
  let sizes;
  if (typeof iconsField === 'string') {
    sizes = [iconsField];
  } else {
    sizes = Object.entries(iconsField)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([, v]) => v);
  }
  for (const rel of sizes) {
    if (!rel) continue;
    const abs = path.join(extDir, String(rel).replace(/^\//, ''));
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function iconAsDataUrl(iconPath) {
  if (!iconPath) return null;
  try {
    const buf = fs.readFileSync(iconPath);
    const ext = path.extname(iconPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
      : ext === '.svg' ? 'image/svg+xml'
      : ext === '.gif' ? 'image/gif'
      : ext === '.webp' ? 'image/webp'
      : 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

ipcMain.handle('load-extension', async (_e, extPath) => {
  if (!extPath || !fs.existsSync(extPath) || !fs.statSync(extPath).isDirectory()) {
    return { ok: false, error: 'Path must be an unpacked extension directory' };
  }
  try {
    const ext = await loadExtensionAtPath(extPath);
    return { ok: true, id: ext.id, electronId: ext.id };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});


// Extensions see Privoo as a single browser window. The id only has to be
// stable and non-zero so "currentWindow" filtering has something to match.
const PRIVOO_EXT_WINDOW_ID = 1;

/**
 * Privoo's open tabs, in the shape chrome.tabs.query returns. Tab ids are real
 * webContents ids, which is what Electron's own tabs methods use, so anything
 * the shim does not cover still lines up.
 */
function privooTabSnapshot(parentWin, activeTabId) {
  const out = [];
  let index = 0;
  for (const wc of webContents.getAllWebContents()) {
    try {
      if (wc.isDestroyed() || wc.getType() !== 'webview') continue;
      // Only the tabs belonging to the window the popup was opened from.
      if (parentWin && wc.hostWebContents && wc.hostWebContents.id !== parentWin.webContents.id) continue;
      const url = wc.getURL() || '';
      if (!url || url.startsWith('chrome-extension://') || url === 'about:blank') continue;
      out.push({
        id: wc.id,
        index: index++,
        windowId: PRIVOO_EXT_WINDOW_ID,
        url,
        pendingUrl: url,
        title: wc.getTitle() || '',
        favIconUrl: '',
        active: wc.id === activeTabId,
        highlighted: wc.id === activeTabId,
        selected: wc.id === activeTabId,
        incognito: false,
        pinned: false,
        audible: typeof wc.isCurrentlyAudible === 'function' ? wc.isCurrentlyAudible() : false,
        mutedInfo: { muted: typeof wc.isAudioMuted === 'function' ? wc.isAudioMuted() : false },
        status: wc.isLoading() ? 'loading' : 'complete',
        discarded: false,
        autoDiscardable: true,
        groupId: -1,
        openerTabId: undefined,
        width: 0,
        height: 0,
      });
    } catch { /* a guest that went away mid-enumeration */ }
  }
  // The renderer should have told us which tab is active; if it did not, the
  // first one is a better answer than none.
  if (out.length && !out.some((t) => t.active)) {
    out[0].active = out[0].highlighted = out[0].selected = true;
  }
  return out;
}

// Chrome sizes an extension popup to whatever its page lays out to, capped at
// 800x600. Privoo used a fixed 380x540 window, which left small popups adrift
// in a large empty panel — uBlock Origin Lite's popup is 273x223, so two thirds
// of the window was blank. Measure the page and fit the window to it.
const POPUP_MAX_W = 800;
const POPUP_MAX_H = 600;
const POPUP_MIN_W = 180;
const POPUP_MIN_H = 80;

const POPUP_MEASURE_JS = `(() => {
  const b = document.body;
  if (!b) return null;
  const cs = getComputedStyle(b);
  const r = b.getBoundingClientRect();
  const mw = (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
  const mh = (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
  return [
    Math.ceil(Math.max(b.scrollWidth, r.width + mw)),
    Math.ceil(Math.max(b.scrollHeight, r.height + mh)),
  ];
})()`;

/**
 * Poll the popup's content size for a moment and keep the window matched to it.
 * Polling rather than measuring once because extension popups almost always
 * populate asynchronously — they render a shell, then fill it in once their
 * service worker answers, and the final size is only knowable after that.
 */
function fitPopupToContent(win) {
  let stable = 0;
  let last = '';
  const deadline = Date.now() + 4000;

  const tick = async () => {
    if (!win || win.isDestroyed()) return;
    let size = null;
    try { size = await win.webContents.executeJavaScript(POPUP_MEASURE_JS); }
    catch { return; /* navigated away or closed */ }
    if (!win || win.isDestroyed()) return;

    if (Array.isArray(size) && size.length === 2) {
      const w = Math.min(POPUP_MAX_W, Math.max(POPUP_MIN_W, Math.round(size[0])));
      const h = Math.min(POPUP_MAX_H, Math.max(POPUP_MIN_H, Math.round(size[1])));
      try {
        const [cw, ch] = win.getContentSize();
        if (Math.abs(cw - w) > 2 || Math.abs(ch - h) > 2) win.setContentSize(w, h);
      } catch { /* window went away mid-measure */ }
      const key = w + 'x' + h;
      stable = key === last ? stable + 1 : 0;
      last = key;
    }
    if (stable < 3 && Date.now() < deadline) setTimeout(tick, 250);
  };
  tick();
}

ipcMain.handle('open-extension-popup', async (e, { extPath, x, y, activeTabId } = {}) => {
  if (!extPath) return { ok: false, error: 'No extension path' };
  const electronId = loadedExtensionIds.get(extPath);
  if (!electronId) return { ok: false, error: 'Extension is not loaded. Enable it first' };
  const loaded = extensionSession().getExtension(electronId);
  if (!loaded) return { ok: false, error: 'Extension not found in session' };
  const popupRel = extPopupPath(loaded.manifest);
  if (!popupRel) return { ok: false, error: 'This extension has no popup' };
  // loaded.url is `chrome-extension://<id>/`. Fall back to building it from
  // the id directly if the loader returned something unexpected.
  const baseUrl = loaded.url && /^chrome-extension:\/\//.test(loaded.url)
    ? loaded.url
    : `chrome-extension://${loaded.id}/`;
  const popupUrl = `${baseUrl}${popupRel.replace(/^\//, '')}`;

  if (extensionPopupWin && !extensionPopupWin.isDestroyed()) {
    extensionPopupWin.close();
    extensionPopupWin = null;
  }
  const parent = winOf(e);

  // x/y arrive from the renderer in viewport-relative CSS pixels (the rect
  // of the toolbar button). Convert to screen coords by adding the parent
  // window's content origin, then clamp to the active display so the popup
  // doesn't open off-screen when the toolbar is at the right/bottom edge.
  const POPUP_W = 380;
  const POPUP_H = 540;
  let screenX = 100, screenY = 100;
  if (parent && !parent.isDestroyed()) {
    const cb = parent.getContentBounds();
    screenX = cb.x + (Number.isFinite(x) ? Math.round(x) : 100);
    screenY = cb.y + (Number.isFinite(y) ? Math.round(y) : 100);
    try {
      const disp = screen.getDisplayNearestPoint({ x: screenX, y: screenY }).workArea;
      if (screenX + POPUP_W > disp.x + disp.width)  screenX = disp.x + disp.width  - POPUP_W - 8;
      if (screenY + POPUP_H > disp.y + disp.height) screenY = disp.y + disp.height - POPUP_H - 8;
      if (screenX < disp.x + 8) screenX = disp.x + 8;
      if (screenY < disp.y + 8) screenY = disp.y + 8;
    } catch {
      if (screenX + POPUP_W > cb.x + cb.width) screenX = cb.x + cb.width - POPUP_W - 8;
      if (screenX < cb.x + 8) screenX = cb.x + 8;
    }
  }

  // No `parent:` relationship. On Windows, child windows created with
  // `parent: parent` + `frame: false` fight the parent for focus during
  // attachment and often disappear immediately. A standalone top-level
  // window with `alwaysOnTop: true` reliably renders above the main window
  // without that focus war.
  // Privoo's tabs are <webview> guests of the main window, so an extension
  // popup — its own BrowserWindow — is the only "tab" Electron can see from
  // inside it. Hand it the real list up front; see extension-tabs-shim.js.
  const tabSnapshot = {
    tabs: privooTabSnapshot(parent, activeTabId),
    windowId: PRIVOO_EXT_WINDOW_ID,
  };

  extensionPopupWin = new BrowserWindow({
    width: POPUP_W,
    height: POPUP_H,
    x: screenX,
    y: screenY,
    frame: false,
    resizable: true,
    show: false,
    modal: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      session: session.defaultSession,
      // The shim has to reach the same `chrome` object the extension's own
      // scripts use, which means sharing their world. This page is extension
      // code Privoo already loads and runs; the preload only adds the missing
      // API surface.
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'extension-popup-preload.js'),
      additionalArguments: [
        '--privoo-ext-tabs=' + Buffer.from(JSON.stringify(tabSnapshot), 'utf8').toString('base64'),
      ],
    },
  });
  extensionPopupWin.setMenuBarVisibility(false);
  // Pin above the panel level briefly so the popup paints in front of the
  // main window. We can't keep alwaysOnTop forever (it'd hover over every
  // other app), so we drop the flag once it's safely shown.
  try { extensionPopupWin.setAlwaysOnTop(true, 'pop-up-menu'); } catch {}

  // Belt + braces around the show/blur dance: only arm the blur-to-close
  // handler AFTER ready-to-show fires AND a grace window has elapsed.
  let popupBlurArmed = false;
  // Local handle: `extensionPopupWin` is module state that the 'closed' handler
  // sets to null, and every one of these callbacks can fire after that.
  const popupWin = extensionPopupWin;
  const popupAlive = () => !!popupWin && !popupWin.isDestroyed();

  popupWin.once('ready-to-show', () => {
    if (!popupAlive()) return;
    popupWin.show();
    popupWin.focus();
    setTimeout(() => {
      popupBlurArmed = true;
      if (!popupAlive()) return;
      try { popupWin.setAlwaysOnTop(false); } catch {}
    }, 250);
  });
  // Fallback: if ready-to-show never fires (some MV2 extensions stall on
  // their first paint), force-show 600ms in so the user isn't staring at
  // nothing.
  const forceShowTimer = setTimeout(() => {
    if (popupAlive() && !popupWin.isVisible()) {
      popupWin.show();
      popupWin.focus();
      setTimeout(() => { popupBlurArmed = true; }, 200);
    }
  }, 600);

  popupWin.on('blur', () => {
    if (!popupBlurArmed || !popupAlive()) return;
    try {
      if (!popupWin.webContents.isDestroyed() && !popupWin.webContents.isDevToolsOpened()) {
        popupWin.close();
      }
    } catch { /* window went away between the check and the call */ }
  });
  popupWin.on('closed', () => {
    clearTimeout(forceShowTimer);
    if (extensionPopupWin === popupWin) extensionPopupWin = null;
  });
  popupWin.webContents.on('preload-error', (_e, preloadPath, error) => {
    console.warn('Privoo: extension popup preload failed:', preloadPath, '—', (error && error.message) || error);
  });
  popupWin.webContents.once('dom-ready', () => fitPopupToContent(popupWin));

  try {
    await popupWin.loadURL(popupUrl);
    fitPopupToContent(popupWin);
  } catch (err) {
    clearTimeout(forceShowTimer);
    if (popupAlive()) popupWin.close();
    return { ok: false, error: `Popup failed to load: ${err.message || err}` };
  }
  return { ok: true };
});

// ---------------------------------------------------------------------------
// IPC - browser data import / clearing
// ---------------------------------------------------------------------------
ipcMain.handle('list-browser-profiles', () => browserImport.listBrowserProfiles());

ipcMain.handle('choose-browser-profile', async (e) => {
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Choose browser profile folder',
  });
  return !result.canceled && result.filePaths[0] ? result.filePaths[0] : null;
});

ipcMain.handle('import-browser-data', async (_e, options = {}) => {
  const data = browserImport.importFromProfile(options);
  if (!data.ok) return data;

  const result = {
    ok: true,
    bookmarksImported: 0,
    historyImported: 0,
    historyTotal: historyStore.summary().count,
  };

  if (options.includeBookmarks !== false && data.bookmarks?.length) {
    const current = settingsStore.load();
    const merged = mergeBookmarks(current.bookmarks || [], data.bookmarks);
    saveSettingsAndBroadcast({ bookmarks: merged.bookmarks });
    result.bookmarksImported = merged.added;
  }

  if (options.includeHistory !== false && data.history?.length) {
    const imported = historyStore.importEntries(data.history);
    result.historyImported = imported.imported;
    result.historyTotal = imported.total;
  }

  // Cookies. Written one at a time because Electron has no bulk API, and a
  // single malformed row must not abort the whole import - a cookie whose
  // domain no longer parses is skipped rather than fatal.
  result.cookiesImported = 0;
  result.cookiesSkipped = 0;
  if (options.includeCookies === true && data.cookies?.length) {
    const jar = session.defaultSession.cookies;
    for (const c of data.cookies) {
      try {
        await jar.set({
          url: c.url,
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          secure: c.secure,
          httpOnly: c.httpOnly,
          expirationDate: c.expirationDate,
        });
        result.cookiesImported++;
      } catch {
        result.cookiesSkipped++;
      }
    }
  }

  return result;
});

ipcMain.handle('data-summary', async () => {
  let cookieCount = 0;
  try {
    cookieCount = (await session.defaultSession.cookies.get({})).length;
  } catch { /* ignore */ }
  return {
    history: historyStore.summary(),
    downloads: downloadStore.load().length,
    cookies: cookieCount,
  };
});

ipcMain.handle('clear-browsing-data', async (_e, options = {}) => {
  const since = cutoffForRange(options.range);
  const result = { ok: true, range: options.range || 'all' };

  if (options.history) result.historyRemoved = historyStore.clearSince(since);
  if (options.downloads) result.downloadsRemoved = since ? downloadStore.clearSince(since) : downloadStore.clearAll();

  Object.assign(result, await clearSessionData({
    cache: !!options.cache,
    cookies: !!options.cookies,
    siteData: !!options.siteData,
  }));

  broadcastAll('browsing-data-cleared', result);
  return result;
});

// Clear TikTok-specific data to reset their rate-limit / fingerprint state.
// Scoped — does NOT touch cookies for other sites, so the user stays signed
// in elsewhere.
ipcMain.handle('clear-tiktok-data', async () => {
  try {
    const isTikTokDomain = (d) => {
      const h = String(d || '').toLowerCase().replace(/^\./, '');
      return h.endsWith('tiktok.com') || h.endsWith('tiktokv.com') ||
             h.endsWith('tiktokcdn.com') || h.endsWith('bytedance.com') ||
             h.endsWith('musical.ly') || h.endsWith('byteoversea.com');
    };

    // Remove only TikTok-related cookies.
    let cleared = 0;
    const allCookies = await session.defaultSession.cookies.get({});
    for (const cookie of allCookies) {
      if (!isTikTokDomain(cookie.domain)) continue;
      try {
        await session.defaultSession.cookies.remove(
          `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
          cookie.name,
        );
        cleared++;
      } catch {}
    }

    // Per-origin storage wipe — localStorage / IndexedDB / SW / caches for
    // every TikTok variant. clearStorageData with an `origin:` filter is
    // surgical, so other sites are unaffected.
    const tiktokOrigins = [
      'https://www.tiktok.com',
      'https://tiktok.com',
      'https://m.tiktok.com',
      'https://www.tiktokv.com',
      'https://www.tiktokcdn.com',
      'https://www.bytedance.com',
    ];
    for (const origin of tiktokOrigins) {
      try {
        await session.defaultSession.clearStorageData({
          origin,
          storages: ['localstorage', 'indexdb', 'websql', 'cachestorage', 'serviceworkers', 'filesystem'],
        });
      } catch {}
    }
    
    // Clear history for TikTok
    const tiktokHistory = historyStore.load().filter(h => 
      h.url && (h.url.includes('tiktok') || h.url.includes('bytedance'))
    );
    for (const entry of tiktokHistory) {
      historyStore.removeEntry(entry.visitTime);
    }
    
    console.log(`Privoo: cleared ${cleared} TikTok cookies + site storage`);
    return { ok: true, cleared };
  } catch (e) {
    console.error('Privoo: Failed to clear TikTok data:', e.message);
    return { ok: false, error: e.message };
  }
});

// Generic "clear cookies + site storage" for any host the user types in.
// Used by the Site fixes section for sites with aggressive bot detection
// (Discord, Snapchat, Reddit, etc.). Strips www. / leading-dot from the
// input so users can paste either form. Wildcards into subdomains: any
// cookie whose domain ends in the requested base host is removed.
ipcMain.handle('clear-site-data', async (_e, rawHost) => {
  try {
    const base = String(rawHost || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^www\./, '')
      .replace(/^\./, '');
    if (!base || !base.includes('.')) {
      return { ok: false, error: 'Enter a domain like discord.com' };
    }

    let cleared = 0;
    const allCookies = await session.defaultSession.cookies.get({});
    for (const cookie of allCookies) {
      const d = String(cookie.domain || '').replace(/^\./, '').toLowerCase();
      if (d !== base && !d.endsWith('.' + base)) continue;
      try {
        await session.defaultSession.cookies.remove(
          `http${cookie.secure ? 's' : ''}://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
          cookie.name,
        );
        cleared++;
      } catch {}
    }

    for (const origin of [`https://${base}`, `https://www.${base}`]) {
      try {
        await session.defaultSession.clearStorageData({
          origin,
          storages: ['localstorage', 'indexdb', 'websql', 'cachestorage', 'serviceworkers', 'filesystem'],
        });
      } catch {}
    }

    return { ok: true, cleared, host: base };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

// ---------------------------------------------------------------------------
// IPC — history
// ---------------------------------------------------------------------------
ipcMain.handle('add-history',    (_e, entry) => {
  // Count each real website visit so one-time popups can be paced by browsing
  // activity (see claim-newtab-popup) rather than firing instantly.
  try { settingsStore.save({ siteVisitCount: (settingsStore.load().siteVisitCount || 0) + 1 }); } catch {}
  return historyStore.add(entry);
});
ipcMain.handle('get-history',    (_e, query) => historyStore.search(query, 500));
ipcMain.handle('history-autocomplete', (_e, prefix) => historyStore.autocomplete(prefix, 4));
ipcMain.handle('clear-history',  () => historyStore.clearAll());
ipcMain.handle('remove-history', (_e, visitTime) => historyStore.removeEntry(visitTime));
ipcMain.handle('remove-history-entries', (_e, visitTimes) => historyStore.removeEntries(visitTimes));
ipcMain.handle('remove-history-domain', (_e, hostname) => historyStore.removeDomain(hostname));

// ---------------------------------------------------------------------------
// IPC — downloads
// ---------------------------------------------------------------------------
ipcMain.handle('get-downloads',   () => downloadStore.load());
ipcMain.handle('clear-downloads', () => downloadStore.clearAll());
ipcMain.handle('remove-download', (_e, id) => downloadStore.remove(id));

// Only paths that are actually in the download store may be passed to
// shell.openPath / showItemInFolder / getFileIcon. Without this guard, any
// compromised internal page could pass C:\Windows\System32\cmd.exe and
// shell.openPath would happily launch it.
function isKnownDownloadPath(p) {
  if (!p || typeof p !== 'string') return false;
  try {
    const target = path.resolve(p);
    return downloadStore.load().some((d) => {
      if (!d.savePath) return false;
      try { return path.resolve(d.savePath) === target; } catch { return false; }
    });
  } catch { return false; }
}

ipcMain.handle('open-download', (_e, savePath) => {
  if (!isKnownDownloadPath(savePath)) return { ok: false, error: 'unknown-path' };
  shell.openPath(savePath);
  return { ok: true };
});
ipcMain.handle('show-in-folder', (_e, savePath) => {
  if (!isKnownDownloadPath(savePath)) return { ok: false, error: 'unknown-path' };
  shell.showItemInFolder(savePath);
  return { ok: true };
});

// Extract the OS-native icon for a downloaded file (Chrome-style — the
// actual icon embedded in the .exe / .dmg / .pdf etc.). Returns a data URL,
// or null if the file is missing or has no extractable icon. Cached by
// "<path>:<mtime>" so we only pay the disk hit + decode once per file.
// LRU-bounded so a misbehaving renderer can't grow the cache unboundedly.
const _iconCache = new Map();
const _ICON_CACHE_MAX = 256;
ipcMain.handle('get-file-icon', async (_e, filePath) => {
  if (!isKnownDownloadPath(filePath)) return null;
  let mtime = 0;
  try { mtime = fs.statSync(filePath).mtimeMs; } catch { return null; }
  const key = `${filePath}:${mtime}`;
  if (_iconCache.has(key)) {
    // Bump to MRU
    const val = _iconCache.get(key);
    _iconCache.delete(key); _iconCache.set(key, val);
    return val;
  }
  let dataUrl = null;
  try {
    const img = await app.getFileIcon(filePath, { size: 'large' });
    if (img && !img.isEmpty()) dataUrl = img.toDataURL();
  } catch {}
  _iconCache.set(key, dataUrl);
  while (_iconCache.size > _ICON_CACHE_MAX) {
    const oldest = _iconCache.keys().next().value;
    _iconCache.delete(oldest);
  }
  return dataUrl;
});
ipcMain.handle('cancel-download', (_e, id) => {
  const item = activeDownloads.get(id);
  if (item) { item.cancel(); activeDownloads.delete(id); }
});

// ---------------------------------------------------------------------------
// Incognito window — BETA
// ---------------------------------------------------------------------------
// Each invocation spawns a fresh BrowserWindow attached to a unique
// non-persistent session (cache + cookies + storage live only in memory and
// disappear when the window closes). The renderer flips body.incognito so
// the chrome gets its purple tint + "Incognito" pill in the titlebar.
let _incognitoSeq = 0;
async function openIncognitoWindow() {
  _incognitoSeq++;
  const partition = `incognito-${Date.now()}-${_incognitoSeq}`;
  const incognitoSession = session.fromPartition(partition, { cache: true });
  // privoo:// must be registered on this session BEFORE the window loads,
  // otherwise privoo://newtab etc. fail with "no app to open this link".
  registerPrivooProtocolForSession(incognitoSession);
  registerMarianaProtocolForSession(incognitoSession);
  // Apply the same privacy hardening the default session gets so the
  // private window doesn't behave worse than a regular one.
  try { await hardenSession(incognitoSession); } catch (e) {
    console.warn('Privoo: incognito hardenSession failed:', e.message);
  }
  const win = createWindow({ session: incognitoSession, incognito: true, partition });
  if (win && !win.isDestroyed()) {
    win.on('closed', () => {
      // Drop everything held in the temp partition once the window is gone.
      try { incognitoSession.clearStorageData(); } catch {}
      try { incognitoSession.clearCache(); } catch {}
    });
  }
  return win;
}

ipcMain.handle('open-incognito-window', async () => {
  try {
    await openIncognitoWindow();
    return { ok: true };
  } catch (e) {
    console.error('Privoo: open-incognito-window:', e);
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('get-tab-session', () => sessionStore.load());
ipcMain.handle('save-tab-session', (_e, payload) => {
  try {
    sessionStore.save(payload && typeof payload === 'object' ? payload : {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// Synchronous flush — used from the renderer's pagehide/beforeunload handler so
// the session is written to disk BEFORE the window unloads on quit. The async
// (debounced) save above can be lost if the app quits before it fires, which
// is why closed tabs could reappear after a quick close-and-quit.
ipcMain.on('save-tab-session-sync', (e, payload) => {
  try { sessionStore.save(payload && typeof payload === 'object' ? payload : {}); } catch {}
  e.returnValue = true;
});

// ---------------------------------------------------------------------------
// IPC — Profiles (toolbar avatar popover, inside the running browser)
// ---------------------------------------------------------------------------
ipcMain.handle('profiles:list', () => ({
  profiles: profileStore.listWithDefault(),
  activeId: profileStore.getActiveId(),
  prefs: profileStore.loadPrefs(),
}));

ipcMain.handle('profiles:create', (_e, { name, avatar }) => profileStore.create({ name, avatar }));
ipcMain.handle('profiles:update', (_e, { id, name, avatar }) => profileStore.update(id, { name, avatar }));

ipcMain.handle('profiles:delete', (_e, id) => {
  const wasActive = profileStore.getActiveId() === id;
  profileStore.remove(id);
  if (wasActive) relaunchIntoProfile('default');
});

ipcMain.handle('profiles:switch', (_e, id) => {
  if (id === profileStore.getActiveId()) return;
  relaunchIntoProfile(id);
});

// Open the full picker/manager window from within the running browser.
ipcMain.handle('profiles:open-picker', () => { createProfilePicker(); });

// ---------------------------------------------------------------------------
// IPC — Profile picker window (the standalone launcher process)
// ---------------------------------------------------------------------------
ipcMain.handle('picker:list', () => ({
  profiles: profileStore.listWithDefault(),
  prefs: profileStore.loadPrefs(),
  activeId: profileStore.getActiveId(),
  accent: (() => { try { return settingsStore.load().accentColor || '#8ab4f8'; } catch { return '#8ab4f8'; } })(),
  uiFont: (() => { try { return settingsStore.load().uiFont || 'system'; } catch { return 'system'; } })(),
  dark:   (() => { try { return !!settingsStore.load().darkMode; } catch { return true; } })(),
  hasBrowserOpen: BrowserWindow.getAllWindows().some(
    (w) => w !== profilePickerWin && !w.isDestroyed()
  ),
}));

ipcMain.handle('picker:create', (_e, { name, avatar }) => profileStore.create({ name, avatar }));
ipcMain.handle('picker:update', (_e, { id, name, avatar }) => profileStore.update(id, { name, avatar }));
ipcMain.handle('picker:delete', (_e, id) => { profileStore.remove(id); });
ipcMain.handle('picker:get-prefs', () => profileStore.loadPrefs());
ipcMain.handle('picker:set-prefs', (_e, patch) => profileStore.savePrefs(patch || {}));

ipcMain.handle('picker:choose', (_e, { id, makeDefault }) => {
  if (makeDefault) profileStore.setDefaultProfileId(id);
  // Stamped here rather than on window creation: this is the moment somebody
  // picked this profile, which is what the picker's "last used" line means.
  try { profileStore.markUsed(id); } catch {}

  // If a browser is already running (picker opened from the toolbar), just
  // switch into the chosen profile (relaunch). Otherwise this is the startup
  // launcher: open the profile fresh.
  const browserOpen = BrowserWindow.getAllWindows().some(
    (w) => w !== profilePickerWin && !w.isDestroyed()
  );

  if (profilePickerWin && !profilePickerWin.isDestroyed()) {
    profilePickerWin.removeAllListeners('closed');
    profilePickerWin.close();
    profilePickerWin = null;
  }

  if (browserOpen) {
    if (id !== profileStore.getActiveId()) relaunchIntoProfile(id);
    return;
  }

  if (id === 'default') {
    profileStore.setActiveId('default');
    startBrowser();
  } else {
    relaunchIntoProfile(id);
  }
});

ipcMain.on('picker:close-window', () => {
  if (profilePickerWin && !profilePickerWin.isDestroyed()) profilePickerWin.close();
});

// "Browse as Guest" — open a private/incognito window from the picker.
ipcMain.handle('picker:incognito', async () => {
  const browserOpen = BrowserWindow.getAllWindows().some(
    (w) => w !== profilePickerWin && !w.isDestroyed()
  );
  if (profilePickerWin && !profilePickerWin.isDestroyed()) {
    profilePickerWin.removeAllListeners('closed');
    profilePickerWin.close();
    profilePickerWin = null;
  }
  if (browserOpen) {
    // App already running — just open a private window in-process.
    await openIncognitoWindow();
  } else {
    // Startup launcher — relaunch into the default profile in guest mode.
    profileStore.setActiveId('default');
    const args = process.argv.slice(1).filter(
      (a) => !a.startsWith('--privoo-profile=') && a !== '--privoo-skip-picker' && a !== '--privoo-incognito'
    );
    args.push('--privoo-skip-picker', '--privoo-incognito');
    app.relaunch({ args });
    app.exit(0);
  }
});

ipcMain.handle('weather-snippet', async (_e, location) => {
  const loc = typeof location === 'string' ? location.trim() : '';
  const pathPart = loc ? `/${encodeURIComponent(loc)}` : '';
  const url = `https://wttr.in${pathPart}?format=%l:+%C+%t&u=0`;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, text: 'Weather unavailable' };
    let text = (await r.text()).trim();
    // Clean up the text - remove extra spaces and format nicely
    text = text.replace(/\s+/g, ' ').trim();
    if (!text || text.length < 3) return { ok: false, text: 'Weather unavailable' };
    return { ok: true, text };
  } catch (err) {
    console.warn('Weather fetch error:', err.message);
    return { ok: false, text: 'Weather unavailable' };
  }
});

// ---------------------------------------------------------------------------
// IPC — search suggestions (proxied to avoid CORS)
// ---------------------------------------------------------------------------
const SUGGESTION_URLS = {
  google:     (q) => `https://suggestqueries.google.com/complete/search?client=firefox&q=${q}`,
  bing:       (q) => `https://api.bing.com/osjson.aspx?query=${q}&form=OSDJAS`,
  duckduckgo: (q) => `https://duckduckgo.com/ac/?q=${q}&type=list`,
  brave:      (q) => `https://search.brave.com/api/suggest?q=${q}`,
};

ipcMain.handle('passwords-list', () => passwordStore.list());
ipcMain.handle('passwords-get-for-url', (_e, url) => passwordStore.getForOrigin(url));
ipcMain.handle('passwords-save', (_e, entry) => passwordStore.upsert(entry || {}));
ipcMain.handle('passwords-remove', (_e, id) => passwordStore.remove(id));
// Reveal returns the decrypted password for a single saved entry. Only the
// privoo://settings page calls this — guarded by the privoo:// protocol
// check that gates window.privooInternal in the webview preload.
ipcMain.handle('passwords-reveal', (_e, id) => passwordStore.reveal(id));

// ---------------------------------------------------------------------------
// IPC — AI Browser
// ---------------------------------------------------------------------------
ipcMain.handle('ai-get-config', () => aiBrowser.getConfig());
ipcMain.handle('ai-set-config', (_e, cfg) => aiBrowser.setConfig(cfg || {}));
ipcMain.handle('ai-chat', async (_e, payload) => {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  return aiBrowser.chat(messages, { systemPrompt: payload?.systemPrompt });
});
// Streaming chat — forwards each token to the caller's renderer over a private
// channel, then resolves with the full text once the stream ends.
ipcMain.handle('ai-chat-stream', async (event, payload) => {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const channel = payload?._channel;
  return aiBrowser.chatStream(messages, {
    systemPrompt: payload?.systemPrompt,
    onChunk: (delta) => {
      try { if (channel && !event.sender.isDestroyed()) event.sender.send(channel, delta); } catch {}
    },
  });
});
ipcMain.handle('ai-detect-ollama', () => aiBrowser.detectOllama());

const aiFiles = require('./ai-files');

// Attach a file to a Privoo AI conversation. Only the EXTRACTED TEXT is
// returned to the page and, from there, sent to the provider - the bytes
// never leave this process.
ipcMain.handle('ai-attach-file', async (e) => {
  const { dialog } = require('electron');
  const res = await dialog.showOpenDialog(winOf(e), {
    title: 'Attach a file',
    properties: ['openFile'],
    filters: [
      // Everything readable, first, so the common case needs no choosing.
      { name: 'Everything Privoo AI can read', extensions: [
        'png','jpg','jpeg','bmp','gif','tif','tiff','webp',
        'pdf','docx','xlsx','pptx','txt','md','csv','json','html','xml','log','rtf',
        'js','ts','jsx','tsx','py','rb','go','rs','java','c','cpp','h','cs','php','sh','sql','yml','yaml',
      ] },
      // Images were missing entirely, which made the OCR that has been in
      // ai-ocr.js all along reachable only by switching to "All files".
      { name: 'Images', extensions: ['png','jpg','jpeg','bmp','gif','tif','tiff','webp'] },
      { name: 'Documents & text', extensions: ['pdf','docx','xlsx','pptx','txt','md','csv','json','html','xml','log','rtf'] },
      { name: 'Code', extensions: ['js','ts','jsx','tsx','py','rb','go','rs','java','c','cpp','h','cs','php','sh','sql','yml','yaml'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  // Anything thrown here surfaces in the page as a rejected invoke, which the
  // AI page could only report as "could not open the file picker" — blaming the
  // dialog for a problem reading the file. Return the failure as data instead.
  try {
    return await aiFiles.extractText(res.filePaths[0]);
  } catch (err) {
    return { ok: false, error: 'Could not read that file: ' + (err.message || 'unknown error') };
  }
});

// Same, for a path that arrived by drag-and-drop.
ipcMain.handle('ai-extract-file', async (_e, filePath) => {
  try {
    return await aiFiles.extractText(String(filePath || ''));
  } catch (err) {
    return { ok: false, error: 'Could not read that file: ' + (err.message || 'unknown error') };
  }
});

// ---------------------------------------------------------------------------
// Identities — multi-identity form autofill (name/address/phone/etc, separate
// from the encrypted password vault above). Ollama assists field-matching
// for labels the regex heuristics in the renderer can't classify.
// ---------------------------------------------------------------------------
ipcMain.handle('identities-list',       () => identitiesStore.list());
ipcMain.handle('identities-get-default',() => identitiesStore.getDefault());
ipcMain.handle('identities-save',       (_e, entry) => identitiesStore.upsert(entry || {}));
ipcMain.handle('identities-remove',     (_e, id) => identitiesStore.remove(id));
ipcMain.handle('identities-set-default',(_e, id) => identitiesStore.setDefault(id));
ipcMain.handle('ollama-status',         () => aiBrowser.detectOllama());
ipcMain.handle('ollama-resolve-fields', (_e, fields, keys) => {
  const s = settingsStore.load();
  if (s.identityAutofillEnabled !== true) return {};
  return aiBrowser.resolveIdentityFields(fields, keys, s.ollamaModel);
});

// One-time new-tab popups (Britain, Men's Mental Health, …) are paced by
// browsing activity: the next one is only released once the user has visited
// POPUP_VISIT_GAP more websites since the last popup. The decision is made here
// (single-threaded, so it's atomic) and the popup is marked shown immediately,
// so two tabs opening at once can never show the same — or two different —
// popups together. Returns the popup key to show, or null.
const POPUP_VISIT_GAP = 10; // websites to visit between popups
// One-time promo popups removed (Britain / Men's Mental Health). Empty = none.
const NTP_POPUP_ORDER = [];
ipcMain.handle('claim-newtab-popup', () => {
  try {
    const s = settingsStore.load();
    if (!s.disclaimerAccepted) return null;
    const visits = s.siteVisitCount || 0;
    const mark   = s.popupVisitMark || 0;
    if (visits - mark < POPUP_VISIT_GAP) return null;        // not enough browsing yet
    const next = NTP_POPUP_ORDER.find(p => !s[p.flag]);
    if (!next) return null;                                   // all already shown
    // Mark shown + re-anchor the gap so the following popup waits another batch.
    settingsStore.save({ [next.flag]: true, popupVisitMark: visits });
    return next.key;
  } catch { return null; }
});

// Privoo AI opens in its own compact, frameless window — a companion
// surface rather than a tab. Single instance: re-focus if already open.
let aiWindow = null;
ipcMain.handle('open-ai-window', () => {
  try {
    if (aiWindow && !aiWindow.isDestroyed()) {
      if (aiWindow.isMinimized()) aiWindow.restore();
      aiWindow.show();
      aiWindow.focus();
      return { ok: true };
    }
    const aiSettings = settingsStore.load();
    aiWindow = new BrowserWindow({
      width: 460,
      height: 720,
      minWidth: 380,
      minHeight: 480,
      frame: false,
      roundedCorners: true,
      backgroundColor: aiSettings.darkMode ? '#1c1d20' : '#f6f7f9',
      title: 'Privoo AI',
      icon: resolveIcon(),
      skipTaskbar: false,
      webPreferences: {
        preload: path.join(__dirname, 'webview-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        session: session.defaultSession,
      },
    });
    aiWindow.setMenuBarVisibility(false);
    aiWindow.loadURL('privoo://ai/?window=1');
    aiWindow.on('closed', () => { aiWindow = null; });
    return { ok: true };
  } catch (e) {
    console.error('Privoo: open-ai-window:', e);
    return { ok: false, error: String(e.message || e) };
  }
});

// The AI window is frameless — its own chrome buttons drive these.
ipcMain.on('ai-window-minimize', () => { try { aiWindow?.minimize(); } catch {} });
ipcMain.on('ai-window-close',    () => { try { aiWindow?.close(); } catch {} });

ipcMain.handle('search-suggestions', async (_e, { query, engine }) => {
  if (!query || query.length < 2) return [];
  try {
    const enc = encodeURIComponent(query);
    const urlFn = SUGGESTION_URLS[engine] || SUGGESTION_URLS.google;
    const resp = await fetch(urlFn(enc), {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(1500),
    });
    const json = await resp.json();
    if (Array.isArray(json) && Array.isArray(json[1])) {
      return json[1].slice(0, 8).map((s) => ({ text: String(s), type: 'search' }));
    }
  } catch { /* timeout or parse fail — return empty */ }
  return [];
});
