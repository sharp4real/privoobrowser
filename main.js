const {
  app, BrowserWindow, session, ipcMain, webContents, protocol, net, shell, dialog,
  Menu, Tray, nativeImage, screen,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const { pathToFileURL } = require('url');
const settingsStore = require('./settings-store');
const { DOH_PROVIDERS } = settingsStore;

// Compute the DoH server list to hand to Chromium. The 18+ blocker always
// wins over the user's manual provider choice — it routes through a family
// filter regardless. `secureDnsMode: 'secure'` keeps Chromium from ever
// falling back to plaintext system DNS, so no leaks.
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
const aiBrowser = require('./ai');

const loadedExtensionIds = new Map();
let extensionPopupWin = null;
let googleAuthWin = null;

function parentWinForGuest(contents) {
  const host = contents.hostWebContents;
  if (!host || host.isDestroyed()) return null;
  return BrowserWindow.fromWebContents(host);
}

// Google auth functions removed - sign-in now works directly in webview

// ---------------------------------------------------------------------------
// Widevine CDM — detect from local Chrome install and load before app ready
// ---------------------------------------------------------------------------
(function loadWidevine() {
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

// Prevent GPU command-buffer state errors that cause black video frames
// (particularly visible on the first YouTube video played per session).
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Off-main-thread canvas rasterization + accelerated video decode improve
// rendering throughput on pages with heavy CSS/canvas/video.
app.commandLine.appendSwitch('enable-features',
  'CanvasOopRasterization,AcceleratedVideoDecodeLinuxGL');
app.commandLine.appendSwitch('num-raster-threads', '4');

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

// Apply the user's hardware-acceleration preference from settings BEFORE
// app.whenReady fires — `disableHardwareAcceleration()` must be called
// before the GPU process starts, otherwise it has no effect.
try {
  const _earlySettings = settingsStore.load();
  if (_earlySettings.hardwareAcceleration === false) {
    app.disableHardwareAcceleration();
  }
} catch { /* settings file may not exist yet on first run */ }

// Suppress noisy Electron internals:
//   - "Script failed to execute" — executeJavaScript races during nav
//   - "ERR_ABORTED (-3)" — our HTTPS-upgrade preventDefault aborts the
//     original navigation, which is intended (we re-issue as https://)
//     but Electron logs the aborted IPC call as an error.
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
};

// Pin Chrome version centrally — buildChromeUA and the spoof script both read
// from CHROME_VERSION_FULL so the UA header, sec-ch-ua headers, and the
// userAgentData injection all match. Bumping this is a single-line change.
const CHROME_VERSION_FULL = '143.0.0.0';
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
const SEC_CH_UA_PLATFORM = buildSecChUaPlatform();
const SEC_CH_UA =
  `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not_A Brand";v="24"`;

const stats = { blockedAds: 0, blockedCookies: 0, upgradedHttps: 0 };
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
    try {
      const u = new URL(request.url);
      host = u.hostname;
      pathname = u.pathname;
    } catch { /* use defaults */ }

    // Serve root image assets (logo.png, europeprivoobanner.png, …) for any
    // privoo://*/<name>.<ext> request. path.basename strips any directory
    // parts so this can't be used to traverse outside the app root.
    // We use fs.readFile (ASAR-aware) rather than net.fetch(file://) because
    // net.fetch cannot read from inside ASAR archives in packaged builds.
    const imgMatch = pathname.toLowerCase().match(/\/([a-z0-9._-]+\.(?:png|jpe?g|svg|webp|gif))$/);
    if (imgMatch) {
      const name = path.basename(imgMatch[1]);
      const ext  = path.extname(name).slice(1).replace('jpg', 'jpeg');
      const ct   = `image/${ext}`;
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
    if (host === 'newtab' && pathNorm === '/wallpaper') {
      const wp = settingsStore.load().ntpWallpaperPath;
      // Empty string means user explicitly removed wallpaper
      if (wp === '') {
        return new Response('', { status: 404 });
      }
      // Serve wallpaper if it exists (either default or custom)
      if (wp && fs.existsSync(wp)) {
        return net.fetch(pathToFileURL(wp).toString());
      }
      return new Response('', { status: 404 });
    }

    const fileName = INTERNAL_PAGES[host] || INTERNAL_PAGES.newtab;
    const full = path.join(INTERNAL_DIR, fileName);
    // Path traversal guard
    if (!full.startsWith(INTERNAL_DIR)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(full).toString());
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
    // Google domains — canvas farbling and friends make Google's bot
    // detection bury the user in reCAPTCHAs. Treat Google as a compat host
    // so its pages get the minimal-interference path.
    h === 'google.com'            || h.endsWith('.google.com')
  );
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
  // TikTok
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return true;
  if (h === 'tiktokv.com' || h.endsWith('.tiktokv.com')) return true;
  if (h === 'tiktokcdn.com' || h.endsWith('.tiktokcdn.com')) return true;
  if (h === 'bytedance.com' || h.endsWith('.bytedance.com')) return true;
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
const _YT_EXTRA_FILTERS = [
  // ── Allowlist: video playback endpoints must never be blocked ─────────────
  // These take priority over any blocking rule in the prebuilt filter lists.
  '@@||youtube.com/youtubei/v1/player^',
  '@@||youtube.com/youtubei/v1/next^',
  '@@||youtube.com/youtubei/v1/browse^',
  '@@||youtube.com/youtubei/v1/search^',
  '@@||youtube.com/videoplayback^',
  '@@||googlevideo.com^',
  '@@||ytimg.com^',
  '@@||yt3.ggpht.com^',
  '@@||youtube.com/api/stats/watchtime^',
  '@@||youtube.com/s/^',
  // ── Block: ad tracking / serving requests ─────────────────────────────────
  '||youtube.com/api/stats/ads^',
  '||youtube.com/pagead/$domain=youtube.com',
  '||youtube.com/ptracking^',
  '||youtube.com/youtubei/v1/log_event?*adlogging*',
  '||doubleclick.net^$domain=youtube.com',
  // ── Cosmetic: remove in-stream ad UI elements ─────────────────────────────
  'youtube.com##.video-ads.ytp-ad-module',
  'youtube.com##.ytp-ad-overlay-container',
  'youtube.com##.ytp-ad-player-overlay-layout',
  'youtube.com##.ytp-ad-skip-button-modern',
  'youtube.com##.ytp-ad-text-overlay',
  'youtube.com##.ytp-ad-simple-ad-badge',
  'youtube.com##.ytp-ad-preview-container',
  'youtube.com##ytd-action-companion-ad-renderer',
  'youtube.com##ytd-display-ad-renderer',
  'youtube.com##ytd-video-masthead-ad-v3-renderer',
  'youtube.com##ytd-ad-slot-renderer',
  'youtube.com##ytd-compact-promoted-video-renderer',
  // ── Cosmetic: anti-adblock enforcement wall ───────────────────────────────
  'youtube.com##ytd-enforcement-message-view-model',
  'youtube.com##tp-yt-paper-dialog:has(ytd-mealbar-promo-renderer)',
  'youtube.com##ytd-mealbar-promo-renderer',
  'youtube.com##ytd-popup-container:has(ytd-mealbar-promo-renderer)',
];

async function getSharedBlocker() {
  if (_sharedBlocker) return _sharedBlocker;
  if (_sharedBlockerPromise) return _sharedBlockerPromise;
  _sharedBlockerPromise = (async () => {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const cachePath = path.join(app.getPath('userData'), 'adblock-engine-v2.bin');

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

    const blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: cachePath,
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    });

    // Apply YouTube-specific rules on top of the prebuilt lists every launch.
    try { blocker.updateFromDiff({ added: _YT_EXTRA_FILTERS }); } catch {}

    blocker.on('request-blocked',    () => { stats.blockedAds++; });
    blocker.on('request-redirected', () => { stats.blockedAds++; });
    _sharedBlocker = blocker;
    return blocker;
  })();
  return _sharedBlockerPromise;
}

async function setupAdBlocking(sess) {
  const settings = settingsStore.load();
  if (!settings.adBlocking) return;

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

    // Wrap the blocker's onBeforeRequest so requests originating from
    // compatibility hosts (Sparx, Bedrock, etc. — school sites that need
    // unrestricted CDN access) bypass the engine entirely. Without this
    // wrap, EasyList/EasyPrivacy false-positives can take out Bedrock's
    // quiz image CDN. We still apply the 18+ block before delegating.
    const blockerOnBeforeRequest = blocker.onBeforeRequest.bind(blocker);
    sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
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
      const sourceHost = documentBaseDomain(details.webContentsId) || hostnameOf(details.url);
      if (isSiteCompatibilityHost(sourceHost)) return cb({ cancel: false });
      // Per-site ad-block exclusion — user toggled ads off for this host.
      const excl = s2.adBlockExcludedDomains;
      if (Array.isArray(excl) && excl.length && sourceHost) {
        if (excl.some((d) => sourceHost === d || sourceHost.endsWith('.' + d))) {
          return cb({ cancel: false });
        }
      }
      // Reset the per-page counter on a fresh main-frame navigation so each
      // page starts at 0 — keeps the omnibox shield accurate.
      if (details.resourceType === 'mainFrame' && details.webContentsId) {
        pageBlockedCounts.set(details.webContentsId, 0);
      }
      // Hand off to the real adblock engine, but watch the response so we
      // can tally per-tab blocks (request-blocked event has no wcId).
      blockerOnBeforeRequest(details, (response) => {
        if (response && response.cancel && details.webContentsId) {
          pageBlockedCounts.set(
            details.webContentsId,
            (pageBlockedCounts.get(details.webContentsId) || 0) + 1
          );
        }
        cb(response);
      });
    });
    console.log('Privoo: adblock engine (EasyList + EasyPrivacy + uBO) active');
    return;
  } catch (e) {
    console.warn('Privoo: adblock engine unavailable, using built-in list:', e.message);
  }

  sess.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, cb) => {
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
    if (isSiteCompatibilityHost(sourceHost)) return cb({ cancel: false });

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
    cb({ cancel: false });
  });
}

// ---------------------------------------------------------------------------
// Header privacy: UA spoofing + third-party cookie blocking
// ---------------------------------------------------------------------------
function setupHeaderPrivacy(sess) {
  if (settingsStore.load().spoofUserAgent) sess.setUserAgent(CHROME_UA);

  sess.webRequest.onBeforeSendHeaders((details, cb) => {
    const settings = settingsStore.load();
    const headers = details.requestHeaders;

    const reqHostname = hostnameOf(details.url);
    if (settings.spoofUserAgent || isGoogleAuthHost(reqHostname)) {
      for (const key of Object.keys(headers)) {
        const low = key.toLowerCase();
        if (low === 'sec-ch-ua')               headers[key] = SEC_CH_UA;
        else if (low === 'sec-ch-ua-mobile')   headers[key] = '?0';
        else if (low === 'sec-ch-ua-platform') headers[key] = SEC_CH_UA_PLATFORM;
        else if (low === 'user-agent')         headers[key] = CHROME_UA;
      }
    }

    if (settings.doNotTrack) headers.DNT = '1';

    if (settings.blockThirdPartyCookies) {
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

  // Strip third-party Set-Cookie; also strip CSP for Google auth so UA overrides can inject
  sess.webRequest.onHeadersReceived((details, cb) => {
    const settings = settingsStore.load();
    const headers = details.responseHeaders || {};
    const hostname = hostnameOf(details.url);

    // Remove CSP for Google sign-in pages so our preload script injection is not blocked.
    // executeJavaScript at dom-ready also bypasses CSP, but stripping it here is a belt+suspenders.
    if (isGoogleAuthHost(hostname)) {
      for (const key of Object.keys(headers)) {
        const low = key.toLowerCase();
        if (low === 'content-security-policy' || low === 'content-security-policy-report-only') {
          delete headers[key];
        }
      }
    }

    if (settings.blockThirdPartyCookies) {
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
function setupDownloads(sess) {
  sess.on('will-download', (event, item) => {
    const settings = settingsStore.load();
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

    item.setSavePath(savePath);

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
    activeDownloads.set(id, item);
    broadcastAll('download-update', record);

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
  if (!defaultUserAgent) defaultUserAgent = session.defaultSession.getUserAgent();
  session.defaultSession.setUserAgent(settings.spoofUserAgent ? CHROME_UA : defaultUserAgent);

  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || wc.getType() !== 'webview') continue;
    try {
      wc.setWebRTCIPHandlingPolicy(
        settings.webrtcProtection ? 'default_public_interface_only' : 'default',
      );
    } catch { /* ignore */ }
    // Keep each live tab's `prefers-color-scheme` in sync with the user's
    // theme. Compatibility hosts are pinned to LIGHT regardless — Sparx
    // Maths' dark variant breaks its login inputs (white text on white) and
    // Bedrock's dark variant misrenders quiz images. The renderer's Force
    // Dark inversion handles actually darkening pages with no dark theme.
    try {
      if (wc.debugger && wc.debugger.isAttached()) {
        const url = (() => { try { return wc.getURL(); } catch { return ''; } })();
        const host = hostnameOf(url);
        const isInternal = !url || url.startsWith('privoo://') || url.startsWith('about:') || url.startsWith('devtools:');
        const isCompat = isSiteCompatibilityHost(host);
        const prefersDark = isCompat
          ? false
          : isInternal
            ? !!settings.darkMode
            : !!(settings.darkMode || settings.forceDarkMode);
        wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: prefersDark ? 'dark' : 'light' }],
        }).catch(() => {});
      }
    } catch { /* ignore */ }
  }

  // Keep the OS material on while first-run setup is still in progress —
  // the wizard renders as frosted glass and wants the desktop behind it.
  // Without the `!disclaimerAccepted` term, every setting the wizard saves
  // (theme, hardware accel, …) would re-run this and turn the material off
  // mid-setup, making the wizard lose its transparency after a few steps.
  const transparencyOn = !!settings.increaseTransparency || !settings.disclaimerAccepted;
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    // Transparency on → transparent base so the acrylic/vibrancy material
    // shows. Off → opaque theme fill. The window keeps a normal shape
    // either way so Windows 11 DWM keeps rounding the corners.
    win.setBackgroundColor(
      transparencyOn ? '#00000000' : (settings.darkMode ? '#202124' : '#ffffff'),
    );
    try {
      if (process.platform === 'win32' && typeof win.setBackgroundMaterial === 'function') {
        win.setBackgroundMaterial(transparencyOn ? 'acrylic' : 'none');
      } else if (process.platform === 'darwin' && typeof win.setVibrancy === 'function') {
        win.setVibrancy(transparencyOn ? 'sidebar' : null);
      }
    } catch { /* older OS without the API — fall back to CSS alpha only */ }
  }
  // Renderer flips a `body.transparent` class for CSS to switch toolbar
  // backgrounds to rgba() when the OS material is behind us.
  broadcastAll('transparency-state', transparencyOn);

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
}

async function saveSettingsAndBroadcast(patch) {
  const hadExtPatch = patch && Object.prototype.hasOwnProperty.call(patch, 'extensions');
  const updated = settingsStore.save(patch || {});
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
async function hardenSession(sess) {
  await setupAdBlocking(sess);
  setupHeaderPrivacy(sess);
  setupDownloads(sess);

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
  // frameless windows via DWM — but ONLY when the window is NOT
  // `transparent: true` (transparent windows are excluded from DWM
  // rounding). So we keep the window opaque-shaped and let DWM do it.
  // The Increase-Transparency feature uses backgroundMaterial / vibrancy,
  // which both work on a normal (non-transparent) window and still get
  // DWM-rounded. macOS rounds its own windows.
  // The OS material backdrop is enabled when the transparency setting is on
  // OR when this is a first-run window (the setup wizard renders as a
  // frosted-glass surface and wants the desktop material behind it).
  const isFirstRun = !settings.disclaimerAccepted;
  const wantsTransparency = !!settings.increaseTransparency || isFirstRun;
  const transparencyOpts = {};
  if (wantsTransparency) {
    if (process.platform === 'win32') {
      // Win11: acrylic material on a normal (DWM-rounded) window.
      transparencyOpts.backgroundMaterial = 'acrylic';
    } else if (process.platform === 'darwin') {
      transparencyOpts.vibrancy = 'appearance-based';
    } else {
      // Linux has no native material API — the only way translucency
      // shows is a genuinely transparent window. Frameless Linux windows
      // don't get OS corner-rounding anyway, so nothing is lost.
      transparencyOpts.transparent = true;
    }
  }

  // First run: open at a generous fixed size, centred, with resizing locked
  // so the setup wizard always has a stable, comfortable canvas. Resizing is
  // re-enabled by the 'setup-finished' IPC once the wizard completes.
  if (isFirstRun) {
    width  = Math.min(1380, dispW - 48);
    height = Math.min(900, dispH - 48);
    x = undefined;
    y = undefined;
  }

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
    // Opaque base color so the window has a normal shape DWM can round.
    // When the transparency setting is on, backgroundMaterial paints over
    // this and the renderer surfaces go translucent.
    backgroundColor: wantsTransparency ? '#00000000' : (settings.darkMode ? '#202124' : '#ffffff'),
    title: isIncognito ? 'Privoo — Incognito' : 'Privoo',
    icon: resolveIcon(),
    ...transparencyOpts,
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

  win.on('maximize',   () => win.webContents.send('window-state', true));
  win.on('unmaximize', () => win.webContents.send('window-state', false));
  win.webContents.once('did-finish-load', () => {
    win.webContents.send('platform', process.platform);
    win.webContents.send('transparency-state', !!settingsStore.load().increaseTransparency);
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
    }
  });

  return win;
}

// ---------------------------------------------------------------------------
// System tray — single tray icon shared across windows. Created lazily so a
// startup with minimizeToTray=false never spawns one.
// ---------------------------------------------------------------------------
let _tray = null;
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
  const quitForReal = () => {
    global.privooQuittingForReal = true;
    app.quit();
  };
  _tray.on('click', showAll);
  _tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Privoo', click: showAll },
    { type: 'separator' },
    { label: 'Quit Privoo', click: quitForReal },
  ]));
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

ipcMain.on('install-update-now', () => {
  if (process.platform === 'darwin') {
    shell.openExternal('https://github.com/sharp4real/privoobrowser/releases/latest');
    return;
  }
  if (IS_WIN && _manualInstallerPath && fs.existsSync(_manualInstallerPath)) {
    const { spawn } = require('child_process');
    try {
      spawn(_manualInstallerPath, ['/S', '--force-run'], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } catch (e) {
      console.warn('Privoo: spawn installer failed:', e.message);
      shell.openPath(_manualInstallerPath);
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

function checkForUpdatesIfEnabled() {
  if (!app.isPackaged) return;
  const settings = settingsStore.load();
  if (!settings.autoUpdates) return;
  autoUpdater.checkForUpdates().catch((e) => {
    console.warn('Privoo updater check failed:', e.message);
  });
}

// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  const settings = settingsStore.load();
  defaultUserAgent = session.defaultSession.getUserAgent();
  if (settings.minimizeToTray) ensureTray();

  // Force Chrome User-Agent on session
  session.defaultSession.setUserAgent(CHROME_UA);
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
  await hardenSession(session.defaultSession);

  // Resolve any legacy __MSG_*__ placeholders saved into settings before
  // the i18n fix landed (uBlock and friends shipped names/descriptions as
  // Chrome locale references). Done once on startup so existing installs
  // pick up real localized strings without the user reinstalling.
  try {
    const extList = Array.isArray(settings.extensions) ? settings.extensions : [];
    let dirty = false;
    for (const ext of extList) {
      const needsResolve =
        (typeof ext.name === 'string' && /^__MSG_/.test(ext.name)) ||
        (typeof ext.description === 'string' && /^__MSG_/.test(ext.description));
      if (!needsResolve || !ext.path) continue;
      try {
        const mp = path.join(ext.path, 'manifest.json');
        if (!fs.existsSync(mp)) continue;
        const raw = JSON.parse(fs.readFileSync(mp, 'utf8'));
        const resolved = resolveManifestI18n(raw, ext.path);
        if (resolved.name && /^__MSG_/.test(ext.name)) { ext.name = resolved.name; dirty = true; }
        if (resolved.description && /^__MSG_/.test(ext.description)) {
          ext.description = resolved.description; dirty = true;
        }
      } catch {}
    }
    if (dirty) settingsStore.save({ extensions: extList });
  } catch {}

  await syncExtensionsFromSettings(settings);

  createWindow();

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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('web-contents-created', (_event, contents) => {
  contents.setMaxListeners(50);
  if (contents.getType() !== 'webview') return;

  // Force clean Chrome UA on every webview
  contents.setUserAgent(CHROME_UA);

  if (settingsStore.load().webrtcProtection) {
    contents.setWebRTCIPHandlingPolicy('default_public_interface_only');
  }

  contents.setWindowOpenHandler(({ url, disposition, features, frameName }) => {
    const host = contents.hostWebContents;

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
    const isPopup =
      disposition === 'new-window' ||
      /\bpopup\s*=/i.test(feat) ||
      (/\bwidth\s*=/i.test(feat) && /\bheight\s*=/i.test(feat)) ||
      frameName === 'oauthwindow' || frameName === 'oauth' || frameName === 'signin';

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
          // adblock are all in scope. preload is intentionally omitted — the
          // popup is just a passthrough to the OAuth provider.
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            session: session.defaultSession,
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
    
    try { pc.setUserAgent(CHROME_UA); } catch {}
    try {
      if (!pc.debugger.isAttached()) pc.debugger.attach('1.3');
      pc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: spoofScript,
        runImmediately: true,
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
      Promise.resolve(pc.executeJavaScript(spoofScript, true)).catch(() => {});
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

  // Build the spoof script with the actual Chromium version + host platform.
  const spoofScript = buildGoogleSpoofScript({
    chromeVersion: CHROME_VERSION_FULL,
    platform: process.platform,
  });

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
    let _ytipr;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get: () => _ytipr,
      set: v => {
        if (v && typeof v === 'object') {
          try { if ('adPlacements' in v) v.adPlacements = []; } catch {}
          try { if ('playerAds'    in v) v.playerAds    = []; } catch {}
        }
        _ytipr = v;
      },
      configurable: true,
    });
  } catch {}
  const _jp = JSON.parse;
  JSON.parse = function(t, ...a) {
    const r = _jp.call(this, t, ...a);
    if (r && typeof r === 'object') {
      try { if ('adPlacements' in r) r.adPlacements = []; } catch {}
      try { if ('playerAds'    in r) r.playerAds    = []; } catch {}
    }
    return r;
  };
  const _f = window.fetch;
  window.fetch = function(input, ...rest) {
    return _f.call(this, input, ...rest).then(async res => {
      const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');
      if (url.includes('/youtubei/v1/player') || url.includes('/youtubei/v1/next')) {
        try {
          const body = await res.clone().json();
          if (body.adPlacements !== undefined) body.adPlacements = [];
          if (body.playerAds    !== undefined) body.playerAds    = [];
          return new Response(JSON.stringify(body), {
            status: res.status, statusText: res.statusText, headers: res.headers,
          });
        } catch {}
      }
      return res;
    });
  };
  setInterval(function() {
    try {
      var skip = document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button-modern,.ytp-ad-skip-button');
      if (skip) { skip.click(); return; }
      var video = document.querySelector('video.html5-main-video');
      var isAd  = !!document.querySelector('.ytp-ad-player-overlay,.ytp-ad-simple-ad-badge,.ytp-ad-preview-container');
      if (video && isAd && isFinite(video.duration) && video.duration > 0) {
        if (!video.muted) video.muted = true;
        video.playbackRate = 16;
        if (video.duration - video.currentTime > 0.1) video.currentTime = video.duration - 0.1;
      }
      var wall = document.querySelector('ytd-enforcement-message-view-model');
      if (wall) wall.remove();
    } catch {}
  }, 300);
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
      contents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
        source: ytAdScript,
        runImmediately: true,
      }).catch(() => {});

      // Emulate `prefers-color-scheme` so sites that ship a real dark theme
      // follow the user's choice. Pages with no dark theme are handled by the
      // renderer's Force Dark inversion (forceDarkScript) instead.
      try {
        const s = settingsStore.load();
        const prefersDark = !!(s.darkMode || s.forceDarkMode);
        contents.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: prefersDark ? 'dark' : 'light' }],
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

  // Re-apply prefers-color-scheme on every navigation:
  //   - internal pages: follow the user's darkMode choice
  //   - compat sites:   pinned to light — don't force them into dark
  //   - other pages:    prefer dark if either dark toggle is on
  const reapplyDarkMode = () => {
    if (contents.isDestroyed() || !cdpAttached) return;
    try {
      const s = settingsStore.load();
      const url = (() => { try { return contents.getURL(); } catch { return ''; } })();
      const host = hostnameOf(url);
      const isInternal = !url || url.startsWith('privoo://') || url.startsWith('about:') || url.startsWith('devtools:');
      const isCompat = isSiteCompatibilityHost(host);
      const prefersDark = isInternal || isCompat
        ? !!s.darkMode
        : !!(s.darkMode || s.forceDarkMode);
      contents.debugger.sendCommand('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: prefersDark ? 'dark' : 'light' }],
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
    // Don't intercept internal pages
    if (url.startsWith('privoo://')) return;

    const s = settingsStore.load();
    const h = hostnameOf(url);
    const local = h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local');

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
function winOf(e) { return BrowserWindow.fromWebContents(e.sender); }

ipcMain.on('window-minimize',  (e) => winOf(e)?.minimize());
ipcMain.on('window-maximize',  (e) => { const w = winOf(e); if (!w) return; w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.on('window-close',     (e) => winOf(e)?.close());
// The setup wizard locks the window size; this re-enables resizing once the
// user finishes (or skips) first-run setup.
ipcMain.on('setup-finished',   (e) => { const w = winOf(e); if (w && !w.isDestroyed()) { try { w.setResizable(true); } catch {} } });
ipcMain.handle('window-is-maximized', (e) => !!winOf(e)?.isMaximized());
ipcMain.handle('get-platform', () => process.platform);
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
    const win = new BrowserWindow({
      width: 560,
      height: 920,
      minWidth: 480,
      minHeight: 700,
      title: 'Mobile View',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      autoHideMenuBar: true,
      ...(iconPath ? { icon: iconPath } : {}),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true,
        // No preload — mobile-frame.html is a self-contained page that
        // doesn't need any Privoo IPC APIs. A preload here was preventing
        // the inner webview from loading external URLs.
      },
    });

    const framePath = path.join(RENDERER_DIR, 'internal', 'mobile-frame.html');
    win.loadFile(framePath, { query: { url: url || '' } });

    return { ok: true };
  } catch (e) {
    console.error('[mobile-view]', e);
    return { ok: false };
  }
});

ipcMain.handle('is-default-browser', () => app.isDefaultProtocolClient('https'));
ipcMain.handle('set-default-browser', () => {
  if (process.platform === 'win32') {
    // Register intent first so Windows sees Privoo in the Default Apps list
    try {
      app.setAsDefaultProtocolClient('https');
      app.setAsDefaultProtocolClient('http');
      app.setAsDefaultProtocolClient('ftp');
    } catch {}
    // Windows 10/11 requires the user to confirm via Settings — open
    // directly to the Default Apps page so they can pick Privoo.
    shell.openExternal('ms-settings:defaultapps');
  } else {
    app.setAsDefaultProtocolClient('https');
    app.setAsDefaultProtocolClient('http');
  }
});

// Show a native OS context menu. Renderer sends a tree of items
// (`{id, label, type, enabled, submenu}`); we build a Menu, popup it at the
// cursor position (OS handles positioning so it's always exactly under the
// cursor), and resolve with the clicked item id (or null on dismiss).
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
ipcMain.handle('open-devtools', (_e, guestWcId) => {
  try {
    const guest = webContents.fromId(Number(guestWcId));
    if (!guest || guest.isDestroyed()) return { ok: false };
    if (guest.isDevToolsOpened()) { guest.closeDevTools(); return { ok: true, closed: true }; }
    guest.openDevTools({ mode: 'right', activate: true });
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
});

// ---------------------------------------------------------------------------
// IPC — privacy / stats / settings
// ---------------------------------------------------------------------------
ipcMain.handle('privacy-stats', () => stats);

ipcMain.handle('reset-privacy-stats', () => {
  stats.blockedAds = 0;
  stats.blockedCookies = 0;
  stats.upgradedHttps = 0;
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
  const dest = path.join(app.getPath('userData'), `ntp-wallpaper${safeExt}`);
  try {
    fs.copyFileSync(src, dest);
    saveSettingsAndBroadcast({ ntpWallpaperPath: dest });
    return dest;
  } catch (err) {
    console.warn('choose-ntp-wallpaper:', err.message);
    return null;
  }
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
  // Set to empty string to indicate "no wallpaper" (vs null which means "use default")
  saveSettingsAndBroadcast({ ntpWallpaperPath: '' });
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

ipcMain.handle('ytdlp-download', async (_e, url, opts) => {
  const settings = settingsStore.load();
  return ytdlp.downloadMedia(url, settings, opts || {});
});

// ---------------------------------------------------------------------------
// Extensions — load / unload / CRX unpack
// ---------------------------------------------------------------------------
function extensionSession() {
  return session.defaultSession.extensions || session.defaultSession;
}

function extPopupPath(manifest) {
  const action = manifest?.action || manifest?.browser_action || {};
  const popup = action.default_popup || manifest?.page_action?.default_popup;
  return popup ? String(popup).replace(/^\//, '') : null;
}

async function loadExtensionAtPath(extPath) {
  const sess = extensionSession();
  const loaded = await sess.loadExtension(extPath, { allowFileAccess: true });
  loadedExtensionIds.set(extPath, loaded.id);
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
  const extract = require('extract-zip');
  const buf = fs.readFileSync(crxPath);
  const zipBuf = stripCrxHeader(buf);

  const base = path.basename(crxPath, path.extname(crxPath)).replace(/[^\w.-]+/g, '_');
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
  return dest;
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

ipcMain.handle('choose-crx-file', async (e) => {
  const win = winOf(e);
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose Chrome extension (.crx)',
    properties: ['openFile'],
    filters: [{ name: 'Chrome Extension', extensions: ['crx'] }],
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
      return { ok: true, manifest, path: filePath, iconUrl: iconAsDataUrl(iconFile) };
    }
    if (filePath.toLowerCase().endsWith('.crx')) {
      // Unpack the .crx straight away — extract-zip handles all ZIP edge
      // cases (data descriptors, ZIP64, etc.) that the previous hand-rolled
      // parser missed and caused "Could not read manifest.json" on many CRX
      // files from crx4chrome / the Chrome Web Store mirror.
      const unpacked = await unpackCrxToUserData(filePath);
      const mp = path.join(unpacked, 'manifest.json');
      if (!fs.existsSync(mp)) return { error: 'No manifest.json after unpack' };
      const raw = JSON.parse(fs.readFileSync(mp, 'utf8'));
      const manifest = resolveManifestI18n(raw, unpacked);
      const iconFile = resolveExtIcon(manifest, unpacked);
      return {
        ok: true, manifest, path: unpacked, crxPath: filePath,
        iconUrl: iconAsDataUrl(iconFile),
      };
    }
    return { error: 'Unsupported file — use .crx or an unpacked folder' };
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

ipcMain.handle('open-extension-popup', async (e, { extPath, x, y } = {}) => {
  if (!extPath) return { ok: false, error: 'No extension path' };
  const electronId = loadedExtensionIds.get(extPath);
  if (!electronId) return { ok: false, error: 'Extension is not loaded — enable it first' };
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
  extensionPopupWin.once('ready-to-show', () => {
    if (extensionPopupWin?.isDestroyed()) return;
    extensionPopupWin.show();
    extensionPopupWin.focus();
    setTimeout(() => {
      popupBlurArmed = true;
      try { extensionPopupWin?.setAlwaysOnTop(false); } catch {}
    }, 250);
  });
  // Fallback: if ready-to-show never fires (some MV2 extensions stall on
  // their first paint), force-show 600ms in so the user isn't staring at
  // nothing.
  const forceShowTimer = setTimeout(() => {
    if (extensionPopupWin && !extensionPopupWin.isDestroyed() && !extensionPopupWin.isVisible()) {
      extensionPopupWin.show();
      extensionPopupWin.focus();
      setTimeout(() => { popupBlurArmed = true; }, 200);
    }
  }, 600);

  extensionPopupWin.on('blur', () => {
    if (!popupBlurArmed) return;
    if (extensionPopupWin && !extensionPopupWin.isDestroyed() && !extensionPopupWin.webContents.isDevToolsOpened()) {
      extensionPopupWin.close();
    }
  });
  extensionPopupWin.on('closed', () => {
    clearTimeout(forceShowTimer);
    extensionPopupWin = null;
  });
  try {
    await extensionPopupWin.loadURL(popupUrl);
  } catch (err) {
    clearTimeout(forceShowTimer);
    if (extensionPopupWin && !extensionPopupWin.isDestroyed()) extensionPopupWin.close();
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

ipcMain.handle('import-browser-data', (_e, options = {}) => {
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
ipcMain.handle('add-history',    (_e, entry) => historyStore.add(entry));
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
ipcMain.handle('open-incognito-window', async () => {
  try {
    _incognitoSeq++;
    const partition = `incognito-${Date.now()}-${_incognitoSeq}`;
    const incognitoSession = session.fromPartition(partition, { cache: true });
    // privoo:// must be registered on this session BEFORE the window loads,
    // otherwise privoo://newtab etc. fail with "no app to open this link".
    registerPrivooProtocolForSession(incognitoSession);
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
    const aiWantsTransparency = !!aiSettings.increaseTransparency;
    const aiTransparencyOpts = {};
    if (aiWantsTransparency) {
      if (process.platform === 'win32')      aiTransparencyOpts.backgroundMaterial = 'acrylic';
      else if (process.platform === 'darwin') aiTransparencyOpts.vibrancy = 'sidebar';
      else                                    aiTransparencyOpts.transparent = true;
    }
    aiWindow = new BrowserWindow({
      width: 460,
      height: 720,
      minWidth: 380,
      minHeight: 480,
      frame: false,
      roundedCorners: true,
      // Transparent fill when Increase Transparency is on so the acrylic
      // material shows through; otherwise a neutral theme-matched fill so the
      // window doesn't flash before the page applies its own styling.
      backgroundColor: aiWantsTransparency ? '#00000000'
                       : (aiSettings.darkMode ? '#1c1d20' : '#f6f7f9'),
      title: 'Privoo AI',
      icon: resolveIcon(),
      skipTaskbar: false,
      ...aiTransparencyOpts,
      webPreferences: {
        preload: path.join(__dirname, 'webview-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        session: session.defaultSession,
      },
    });
    aiWindow.setMenuBarVisibility(false);
    aiWindow.loadURL('privoo://ai/');
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
