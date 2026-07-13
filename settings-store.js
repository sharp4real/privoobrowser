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

/**
 * Built-in ad/tracker filter lists. Each can be toggled on/off individually in
 * Settings → Privacy. When ALL of these are enabled and the user hasn't added
 * any custom lists, the ad blocker uses Ghostery's prebuilt (well-tuned)
 * ads+tracking bundle. As soon as the user disables one or adds a custom list,
 * the engine is rebuilt from the explicit set of enabled list URLs below.
 */
const FILTER_LISTS = [
  { id: 'easylist',    name: 'EasyList',                    desc: 'The primary ad-blocking filter list.',            url: 'https://easylist.to/easylist/easylist.txt' },
  { id: 'easyprivacy', name: 'EasyPrivacy',                 desc: 'Blocks tracking scripts and analytics.',          url: 'https://easylist.to/easylist/easyprivacy.txt' },
  { id: 'ubo-filters', name: 'uBlock Origin filters',       desc: "uBO's own extra ad + privacy coverage.",          url: 'https://ublockorigin.github.io/uAssets/filters/filters.txt' },
  { id: 'ubo-badware', name: 'uBlock Origin — badware risks', desc: 'Blocks sites known to host malware/scams.',     url: 'https://ublockorigin.github.io/uAssets/filters/badware.txt' },
  { id: 'plowe',       name: "Peter Lowe's Ad/Tracking list", desc: 'Long-standing ad + tracking server blocklist.', url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=0&mimetype=plaintext' },
];

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

  // Language — preferred content language sent to sites (Accept-Language) and
  // reported via navigator.languages. 'auto' follows the device locale, which
  // keeps content in your language even behind a VPN in another country.
  preferredLanguage: 'auto',

  // Proxy / Tor
  proxyMode: 'none',   // 'none' | 'manual' | 'tor'
  proxyUrl: '',        // manual proxy, e.g. socks5://127.0.0.1:1080 or http://host:port
  proxyTorPort: 9100,  // local SOCKS port Tor listens on / we route through

  // Appearance
  darkMode: false,   // light is the default look; dark stays one toggle away
  forceDarkMode: false,
  // Increase Transparency — uses Mica/Acrylic on Win11, vibrancy on macOS,
  // and a translucent toolbar fallback on Linux. Off by default; turn it on
  // in Settings → Appearance for the frosted look.
  increaseTransparency: false,
  transparencyStyle: 'frosted', // glass look when transparency is on: frosted | liquid | acrylic | clear
  // Aero gradient — layers a soft colored gradient behind the chrome when
  // transparency is on, for the classic Aero / colour-acrylic look. Has no
  // effect when increaseTransparency is off.
  aeroGradient: false,
  // Your Vibe — ambient hue gradient behind the browser chrome.
  vibeEnabled: false,
  vibeHue: 210,    // 210 = Ocean blue default
  vibeStyle: 'glow',
  // When false, the ambient vibe gradient is confined to the browser chrome
  // and never bleeds over the web page area. The chrome tinting stays either way.
  vibeOverPages: true,
  fontSizeScale: 1,        // 1 = default, 0.9 = small, 1.2 = large
  showBookmarksBar: true,
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
  // Optional "Privoo News" link on the Speed Dial (off by default). The news
  // itself lives at privoo://news and auto-opens after setup / an update.
  ntpNewsLink: false,
  // Last app version we auto-opened Privoo News for — drives "show news once
  // after an update". Empty on a fresh install (setup records it instead).
  newsSeenVersion: '',
  // What shows above the search bar on the new tab page: the "privoo." text
  // wordmark, or the logo.png mark. Settings → New tab.
  ntpBrandStyle: 'text', // 'text' | 'logo'
  ntpShowQuickLinks: true,   // shortcut cards under the search bar — on by default
  // Brave-style focused search: when the user clicks/focuses the search bar
  // on the new tab page, it scales up and the shortcuts below fade out so
  // the attention is on the search input.
  ntpFocusedSearch: false,
  ntpBackground: 'default',
  ntpWallpaperPath: '',
  ntpWallpaperDim: 0.42,
  ntpDark: false,
  // Looping animation for the "privoo." wordmark on the new tab:
  // none | pulse | pop | fizzle | glow | bounce | shimmer
  ntpWordmarkAnim: 'none',
  // Starter shortcuts seeded for fresh installs. (Existing users keep their
  // own — an empty array they've already saved is respected.)
  ntpQuickLinks: [
    { name: 'WhatsApp',  url: 'https://web.whatsapp.com' },
    { name: 'Gmail',     url: 'https://mail.google.com' },
    { name: 'Snapchat',  url: 'https://web.snapchat.com' },
    { name: 'Spotify',   url: 'https://open.spotify.com' },
    { name: 'Discord',   url: 'https://discord.com/app' },
    { name: 'YouTube',   url: 'https://youtube.com' },
    { name: 'Reddit',    url: 'https://reddit.com' },
    { name: 'Amazon',    url: 'https://www.amazon.com' },
  ],

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
  showNotesButton: false, // hidden by default — enable via the Notes extension
  showCalculator: false,  // Calculator toolbar button — enable via the Calculator extension
  lucidMode: false,       // Lucid Mode — hover a video for a star that enhances its picture
  extMoveNoticeShown: false, // one-time "features moved to Extensions" notice in Settings
  showSidebar: true,      // shortcuts rail on the left (toggle in Settings → Features)
  sidebarPanelWidth: 320, // width of the embedded web panel in the sidebar
  showAiButton: true,     // AI toolbar button — can be hidden via Settings → Features
  showTranslateButton: false, // Translate toolbar button — off by default, enable in Settings → Features
  centerSidebarIcons: true, // vertically center shortcut icons in the sidebar rail
  verticalTabs: false,    // show tabs in a vertical left panel instead of horizontal strip
  vtabsCollapsed: false,  // vertical tabs panel collapsed to icon-only rail
  vtabsIntegrated: false,   // move toolbar icon buttons into the vertical tabs panel
  vtabsSearchPopup: true,   // show the Spotlight-style search overlay on New Tab in vtabs mode (off = open a normal new tab page)
  searchPopupGlass: true,   // apply the transparency/glass effect to the vtabs search popup
  ntpWallpaperFullBrowser: false, // stretch the new-tab wallpaper behind the whole browser chrome (toolbar + tab strip)
  ntpWallpaperSound: false, // play the audio of a live (video) wallpaper (unmutes after first interaction)
  ntpWaveEnabled: false,  // animated colour-theme gradient as the new-tab background (takes precedence over wallpaper)
  ntpWaveColors: ['#7c5cff', '#b14bff', '#ff5c9e', '#4bc5ff'], // 4-colour palette for the wave background
  ntpWaveAnimate: true,   // whether the theme background slowly animates (off = static)
  ntpThemeId: '',         // selected curated theme id (e.g. 'aurora'); '' = custom/none
  ntpThemeStyle: 'aurora',// visual style of the background: aurora | waves | glow | beams | solid
  ntpThemeMusic: 'none',  // per-theme looped soundscape id: none | drift | warm | rain | waves | deep | chime
  ntpThemeMusicVolume: 0.4, // 0..1 volume for the soundscape
  uiSounds: true,         // play short blips on typing/clicks/tab open+close (uses the active theme's character)
  uiSoundVolume: 0.7,     // 0..1 volume for the UI blips
  newSearchBarStyle: false, // legacy boolean for the "soft" address bar (superseded by searchBarStyle)
  searchBarStyle: '',     // address-bar appearance: classic | soft | pill | square ('' = derive from newSearchBarStyle)
  vtabsCenterIcons: false, // vertically centre the vertical-tabs icon rail
  newTabBtnCircle: true, // draw a circle around the new-tab "+" button
  syncDiscordTheme: true,  // recolor discord.com to match Privoo's accent + theme palette
  uiFont: 'system',       // interface font: system | rounded | classic | grotesk | mono | dyslexic
  uiRoundness: 'default', // corner style of the whole UI: default | sharp | round
  customChromeCss: '',    // power-user: raw CSS injected into the browser chrome
  sidebarLinks: [
    { title: 'WhatsApp', url: 'https://web.whatsapp.com' },
    { title: 'Gmail',    url: 'https://mail.google.com' },
    { title: 'Snapchat', url: 'https://web.snapchat.com' },
    { title: 'Spotify',  url: 'https://open.spotify.com' },
    { title: 'Discord',  url: 'https://discord.com/app' },
    { title: 'Instagram',url: 'https://www.instagram.com' },
  ],
  ghostName: '',          // user-supplied name for the Privoo mascot
  accentColor: '#8b7cf7', // Lavender — the single "quiet & precise" accent, whole UI
  /** Last window bounds + maximized state — restored on next launch. */
  windowState: null,
  disclaimerAccepted: false,
  welcomeShown: false,
  mmhmShown: false,
  updatesToastShown: false,
  discordPromptShown: false,
  thankYouShown: false,    // one-time "Thank you for using Privoo" popup
  androidPromptShown: false, // one-time "Android has released!" popup (v4.0.1 only)
  britainShown: false,     // one-time "Made with care in Britain" popup
  siteVisitCount: 0,       // running count of real website visits — paces one-time popups
  popupVisitMark: 0,       // siteVisitCount when the last one-time popup was released

  // Background music
  musicPath: null,
  musicEnabled: false,
  musicVolume: 0.5,
  ntpShowWeather: false,
  ntpShowClock: false,    // show a clock on the new tab page
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

  // Per-site ad-blocking exclusions — domains where the ad blocker is paused.
  adBlockExcludedDomains: [],

  // Filter lists. `defaultFilterLists` maps each built-in list id (see
  // FILTER_LISTS) to whether it's enabled — absent/undefined means enabled.
  // `customFilterLists` holds user-added lists: { name, url, enabled }.
  // Changes take effect on the next launch (the engine is built once).
  defaultFilterLists: {},
  customFilterLists: [],

  // Low-end device mode — disables heavy GPU rasterization paths and CSS
  // transitions/animations so the browser stays responsive on weaker hardware.
  // Requires a restart to take full effect on the GPU side.
  lowEndDevice: false,

  // Discord Rich Presence — shows current browsing state in Discord.
  // Off by default; opt-in via Settings → System.
  discordRpc: false,

  // Wobbly Windows — adds a springy wobble animation when switching tabs.
  // Off by default; opt-in via Settings → Appearance.
  wobblyWindows: false,

  // Stronger tracking protection — strips tracking URL parameters (utm_*,
  // fbclid, etc.), minimises the Referer header on cross-origin requests,
  // and sends the Global Privacy Control signal.
  strongerTrackingProtection: false,
};

const profileStore = require('./profile-store');

let cache = null;

function filePath() {
  return path.join(profileStore.getDataDir(), 'privoo-settings.json');
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
    // NOTE: the old `ntpDark → darkMode` migration was removed — it fired
    // against a stale ntpDark and silently reverted the user's darkMode choice
    // on every launch. darkMode is the single source of truth; whatever the
    // user saved wins.
    // One-time design-refresh migration (v4.1 light/lavender look). Only
    // touches values still on their OLD defaults — an explicitly chosen
    // custom accent or theme is left exactly as the user set it.
    if (!parsed.uiRefresh2Applied) {
      if (parsed.accentColor === '#57a97e' || parsed.accentColor === undefined) {
        cache.accentColor = '#8b7cf7';
      }
      // Shortcut cards under the search bar used to default off; the refresh
      // turns them on once. (false here was the old global default, not a choice.)
      if (parsed.ntpShowQuickLinks === false || parsed.ntpShowQuickLinks === undefined) {
        cache.ntpShowQuickLinks = true;
      }
      if (parsed.newTabBtnCircle === false || parsed.newTabBtnCircle === undefined) {
        cache.newTabBtnCircle = true;
      }
      if (parsed.showSidebar === false || parsed.showSidebar === undefined) {
        cache.showSidebar = true;
      }
      if (parsed.showBookmarksBar === false || parsed.showBookmarksBar === undefined) {
        cache.showBookmarksBar = true;
      }
      cache.uiRefresh2Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
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

module.exports = { load, save, SEARCH_ENGINES, DOH_PROVIDERS, FILTER_LISTS, DEFAULTS };
