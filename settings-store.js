const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const SEARCH_ENGINES = {
  google:     { name: 'Google',       url: 'https://www.google.com/search?q=' },
  bing:       { name: 'Bing',         url: 'https://www.bing.com/search?q=' },
  duckduckgo: { name: 'DuckDuckGo',   url: 'https://duckduckgo.com/?q=' },
  brave:      { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
  startpage:  { name: 'Startpage',    url: 'https://www.startpage.com/do/search?q=' },
  ecosia:     { name: 'Ecosia',       url: 'https://www.ecosia.org/search?q=' },
  qwant:      { name: 'Qwant',        url: 'https://www.qwant.com/?q=' },
  yandex:     { name: 'Yandex',       url: 'https://yandex.com/search/?text=' },
  kagi:       { name: 'Kagi',         url: 'https://kagi.com/search?q=' },
  // Sentinel — when selected, the actual URL template comes from
  // settings.customSearchUrl. The query is appended at the end (or
  // substituted for "%s" if present).
  custom:     { name: 'Custom…',      url: '' },
};

/**
 * DNS-over-HTTPS providers. `urls` is the ordered list used as
 * secureDnsServers — Chromium tries them in order and falls back to the
 * next only on connection failure (never to plaintext system DNS). The
 * `family` variants (e.g. AdGuard Family) include built-in adult-content
 * filtering, which we wire up via the 18+ blocker setting.
 */
const DOH_PROVIDERS = {
  cloudflare: {
    name: 'Cloudflare',
    desc: '1.1.1.1 — fast, widely used. Default.',
    urls: ['https://cloudflare-dns.com/dns-query', 'https://1.1.1.1/dns-query'],
  },
  'cloudflare-malware': {
    name: 'Cloudflare (Malware blocking)',
    desc: 'Blocks known malware domains via Cloudflare 1.1.1.2.',
    urls: ['https://security.cloudflare-dns.com/dns-query'],
  },
  'cloudflare-family': {
    name: 'Cloudflare (Family — adult + malware)',
    desc: 'Filters adult content + malware via Cloudflare 1.1.1.3.',
    urls: ['https://family.cloudflare-dns.com/dns-query'],
  },
  adguard: {
    name: 'AdGuard',
    desc: 'Blocks ads + trackers at the DNS level.',
    urls: ['https://dns.adguard-dns.com/dns-query', 'https://94.140.14.14/dns-query'],
  },
  'adguard-family': {
    name: 'AdGuard (Family — adult + ads)',
    desc: 'Filters adult content alongside ads + trackers.',
    urls: ['https://family.adguard-dns.com/dns-query'],
  },
  quad9: {
    name: 'Quad9',
    desc: 'Blocks known malicious domains. Run by a Swiss non-profit.',
    urls: ['https://dns.quad9.net/dns-query', 'https://9.9.9.9/dns-query'],
  },
  nextdns: {
    name: 'NextDNS',
    desc: 'Configurable DNS resolver — sign up for a personal endpoint.',
    urls: ['https://dns.nextdns.io/dns-query'],
  },
  google: {
    name: 'Google',
    desc: '8.8.8.8 — reliable. Operated by Google.',
    urls: ['https://dns.google/dns-query', 'https://8.8.8.8/dns-query'],
  },
  // Sentinel — when selected, the URL comes from settings.customDohUrl.
  // Useful for self-hosted resolvers (Pi-hole + Unbound, etc.) or a personal
  // NextDNS profile URL.
  custom: {
    name: 'Custom…',
    desc: 'Use your own DNS-over-HTTPS endpoint.',
    urls: [],
  },
};

const DEFAULTS = {
  // System
  // When true (default), closing the main window hides it to the system
  // tray instead of quitting Privoo. The user can re-open from the tray
  // icon or use Quit explicitly.
  minimizeToTray: true,
  // When true (default), Privoo reopens the tabs you had open last session
  // on launch. When false, it always starts with a single new tab.
  restoreTabsOnLaunch: true,

  // Search
  searchEngine: 'brave',
  // Used when searchEngine === 'custom'. Either a full URL ending in "=" so
  // the query is appended, or include "%s" where the query should land.
  // Example: https://www.example.com/search?q=%s
  customSearchUrl: '',
  searchSuggestions: true,

  // Privacy
  adBlocking: true,
  httpsUpgrade: true,
  httpsUpgradeShowNotice: true,  // show the "upgrading to HTTPS" splash for 3s
  blockThirdPartyCookies: true,
  dnsOverHttps: true,
  dohProvider: 'cloudflare',  // key into DOH_PROVIDERS
  // Used when dohProvider === 'custom'. Must be an https:// URL pointing at
  // a DNS-over-HTTPS endpoint, typically ending in /dns-query.
  customDohUrl: '',
  dohServer: '',              // legacy single-URL field (still honored if set)
  adultContentBlocking: false, // routes DNS through a family-filter provider
  spoofUserAgent: true,
  canvasSpoofing: true,
  webrtcProtection: true,
  doNotTrack: true,
  allowGeolocation: false,

  // Appearance
  darkMode: false,
  forceDarkMode: false,
  // Increase Transparency — uses Mica/Acrylic on Win11, vibrancy on macOS,
  // and a translucent toolbar fallback on Linux. Off by default; turn it on
  // in Settings → Appearance for the frosted look.
  increaseTransparency: false,
  // Aero gradient — layers a soft colored gradient behind the chrome when
  // transparency is on, for the classic Aero / colour-acrylic look. Has no
  // effect when increaseTransparency is off.
  aeroGradient: false,
  fontSizeScale: 1,        // 1 = default, 0.9 = small, 1.2 = large
  showBookmarksBar: false,
  showHomeButton: false,
  homePage: 'privoo://newtab/',
  bookmarks: [
    { name: 'Amazon',       url: 'https://www.amazon.com',       addedAt: 0 },
    { name: 'eBay',         url: 'https://www.ebay.com',         addedAt: 0 },
    { name: 'YouTube',      url: 'https://www.youtube.com',      addedAt: 0 },
    { name: 'Reddit',       url: 'https://www.reddit.com',       addedAt: 0 },
    { name: 'GitHub',       url: 'https://github.com',           addedAt: 0 },
    { name: 'Stack Overflow', url: 'https://stackoverflow.com',  addedAt: 0 },
    { name: 'DoorDash',     url: 'https://www.doordash.com',     addedAt: 0 },
    { name: 'Just Eat',     url: 'https://www.just-eat.co.uk',   addedAt: 0 },
    { name: 'BBC News',     url: 'https://www.bbc.com/news',     addedAt: 0 },
    { name: 'CNN',          url: 'https://www.cnn.com',          addedAt: 0 },
  ],

  // New tab
  ntpShowClock: true,
  ntpShowStats: true,
  ntpShowQuickLinks: true,
  // Brave-style focused search: when the user clicks/focuses the search bar
  // on the new tab page, it scales up and the shortcuts below fade out so
  // the attention is on the search input.
  ntpFocusedSearch: true,
  ntpBackground: 'default',
  ntpWallpaperPath: '',
  ntpWallpaperDim: 0.42,
  ntpDark: false,
  // No shortcuts seeded by default — the user adds their own.
  ntpQuickLinks: [],

  // Downloads
  downloadPath: null,   // null = use system default (app.getPath('downloads'))
  askDownloadPath: false,

  // Extensions
  extensions: [],

  // Misc
  hardwareAcceleration: true,
  smoothScrolling: true,
  videoPopOut: false,
  ytdlpPath: null,
  showYtdlpToolbar: true,
  showGeoToolbar: true,
  showNotesButton: false, // hidden by default — opt-in via Settings → Features
  showSidebar: false,     // shortcuts rail on the left — opt-in via Settings → Features
  showAiButton: true,     // AI toolbar button — can be hidden via Settings → Features
  showTranslateButton: false, // Translate toolbar button — off by default, enable in Settings → Features
  centerSidebarIcons: false, // vertically center shortcut icons in the sidebar rail
  verticalTabs: false,    // show tabs in a vertical left panel instead of horizontal strip
  vtabsCollapsed: false,  // vertical tabs panel collapsed to icon-only rail
  sidebarLinks: [],
  ghostName: '',          // user-supplied name for the Privoo mascot
  accentColor: '',        // empty = use stylesheet default (light blue)
  /** Last window bounds + maximized state — restored on next launch. */
  windowState: null,
  disclaimerAccepted: false,
  welcomeShown: false,

  // Background music
  musicPath: null,
  musicEnabled: false,
  musicVolume: 0.5,
  ntpShowWeather: false,
  weatherLocation: '',
  /** Spoof navigator.geolocation for pages (injected). */
  geoSpoofEnabled: false,
  geoPreset: 'off',
  geoLatitude: 40.7128,
  geoLongitude: -74.006,

  /** Encrypted local password vault + autofill on pages. */
  passwordManagerEnabled: true,
  /** On Google sign-in, steer toward password instead of passkey prompts. */
  preferPasswordLogin: true,

  // Safety
  safeMode: false,        // blur/block explicit images via CSS injection
  blockAdultSites: false, // block navigation to known adult domains

  // Updates
  autoUpdates: true,      // check for updates on launch and install on quit
};

let cache = null;

function filePath() {
  return path.join(app.getPath('userData'), 'privoo-settings.json');
}

function load() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    const parsed = JSON.parse(raw);
    cache = { ...DEFAULTS, ...parsed };
    if (!Object.prototype.hasOwnProperty.call(parsed, 'disclaimerAccepted')) {
      cache.disclaimerAccepted = true;
    }
    if (parsed.ntpShowWeather === undefined && parsed.showWeatherWidget !== undefined) {
      cache.ntpShowWeather = !!parsed.showWeatherWidget;
    }
    // Migrate ntpDark to darkMode for consistency
    if (parsed.ntpDark !== undefined && parsed.darkMode === DEFAULTS.darkMode) {
      cache.darkMode = !!parsed.ntpDark;
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  try {
    fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    console.warn('settings-store: write failed:', e.message);
  }
  return cache;
}

module.exports = { load, save, SEARCH_ENGINES, DOH_PROVIDERS, DEFAULTS };
