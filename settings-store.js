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
  // Reachable from inside mainland China, where Google/Bing/DuckDuckGo are not.
  baidu:      { name: 'Baidu 百度',    url: 'https://www.baidu.com/s?wd=' },
  sogou:      { name: 'Sogou 搜狗',    url: 'https://www.sogou.com/web?query=' },
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
  // Mainland China: the resolvers above are unreachable from inside the
  // country, and because Privoo never falls back to plaintext system DNS, a
  // blocked DoH endpoint means every lookup hangs and nothing loads at all.
  // These two answer from inside China.
  alidns: {
    name: 'AliDNS (Mainland China)',
    desc: 'Alibaba public DNS — reachable from inside mainland China.',
    urls: ['https://dns.alidns.com/dns-query', 'https://223.5.5.5/dns-query'],
  },
  dnspod: {
    name: 'DNSPod (Mainland China)',
    desc: 'Tencent DNSPod — reachable from inside mainland China.',
    urls: ['https://doh.pub/dns-query', 'https://1.12.12.12/dns-query'],
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
  searchEngine: 'google',
  // Used when searchEngine === 'custom'. Either a full URL ending in "=" so
  // the query is appended, or include "%s" where the query should land.
  // Example: https://www.example.com/search?q=%s
  customSearchUrl: '',
  searchSuggestions: true,

  // Privacy
  adBlocking: true,
  cryptojackingProtection: true, // blocks known in-browser cryptomining scripts
  protectedToastSeen: false,
  surveyPromptShown: false, // one-time "Take the survey" card on the new tab page // "We ❤️ keeping you protected online!" — shown once on the new tab page
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
  // Warn before following a pasted link that looks like it is pretending to
  // be somewhere else. See looksSuspiciousUrl() in renderer.js for what
  // "looks like" means — it is deliberately a short list of things that are
  // almost never innocent, because a warning people learn to click through
  // is worse than no warning.
  // Thumbnail of a page when you rest on its tab. Costs one capturePage()
  // per tab per navigation, cached in between — but it is a picture of what
  // you were doing appearing on hover, so it gets a switch.
  // A one-time note at the top of Settings saying what is already protecting
  // you. Dated key, like the other one-time notes: a future message gets its
  // own rather than re-showing itself to people who dismissed this one.
  settingsPrivacyNote1Seen: false,
  // ── Vision assistance ──────────────────────────────────────────────
  // All off by default: each one is a real change to how the browser looks,
  // and none of them should arrive uninvited.
  visionUiScale: 100,          // 100 | 115 | 130 | 150 (percent)
  visionHighContrast: false,   // stronger text and hairlines in the chrome
  visionBoldText: false,       // heavier interface text
  visionFocusRings: false,     // focus outline always visible, not just on Tab
  visionReduceMotion: false,   // no animation anywhere in the chrome
  visionUnderlineLinks: false, // underline every link on every page
  visionMinFontSize: 0,        // 0 = off, otherwise a px floor for page text
  // Night light. Strength 0-3; the schedule is local clock hours, because
  // working out real sunset needs a location and Privoo does not ask for one.
  nightLight: 0,
  nightLightAuto: false,
  nightLightFrom: 21,
  nightLightTo: 7,
  // Distance breaks: minutes between reminders, 0 = off.
  eyeBreakMinutes: 0,
  // Read aloud. Rate is a percentage so it stays an integer like the rest.
  readAloud: false,
  readAloudKeys: true,
  readAloudRate: 100,

  tabHoverPreview: true,
  // Tab Snooze. A tab you have not looked at in a while lets go of its page
  // and keeps only its title, favicon and address; touching it loads the page
  // back. This is what Chrome calls Memory Saver, and it is the same trade:
  // a second of reload in exchange for the memory a background tab was
  // holding onto for a page nobody was reading.
  tabSnooze: true,
  // Minutes of not being looked at. 0 means never — the switch above is the
  // on/off, this is only the delay.
  tabSnoozeMinutes: 30,
  // A one-time note shown quietly at the bottom of the window. The key is
  // dated and names its subject on purpose: the next one gets its own key
  // rather than resetting this one, so nobody who has already seen this
  // message sees it again.
  noteNepalChinaFloods2026: false,
  pasteProtection: true,
  // Only let a page open a new tab or window if the user just interacted with
  // it. Blocks popunders and the redirect-on-any-click pattern without
  // touching the OAuth popups and download links that follow a real click.
  popupBlocking: true,
  allowGeolocation: false,

  // Language — preferred content language sent to sites (Accept-Language) and
  // reported via navigator.languages. 'auto' follows the device locale, which
  // keeps content in your language even behind a VPN in another country.
  preferredLanguage: 'auto',

  // Region preset — '' (worldwide defaults) or 'cn' (mainland China). Picking
  // one writes the individual search/DoH/language settings below; it is stored
  // only so the Settings dropdown can show which preset is currently applied.
  regionPreset: '',

  // Proxy / Tor
  proxyMode: 'none',   // 'none' | 'manual' | 'tor'
  proxyUrl: '',        // manual proxy, e.g. socks5://127.0.0.1:1080 or http://host:port
  proxyTorPort: 9100,  // local SOCKS port Tor listens on / we route through

  // Appearance
  darkMode: true,    // Dark by default — a neutral grey ladder, not pure black
  forceDarkMode: false,
  // Your Vibe — ambient hue gradient behind the browser chrome.
  vibeEnabled: false,
  vibeHue: 210,    // 210 = Ocean blue default
  vibeStyle: 'glow',
  // When false, the ambient vibe gradient is confined to the browser chrome
  // and never bleeds over the web page area. The chrome tinting stays either way.
  vibeOverPages: true,
  // When true, picking a Theme in Settings also retunes My Vibe's hue/on-off
  // state to match that theme's colours. Off by default so a manually chosen
  // Vibe setting isn't silently overwritten by a theme pick.
  themeAutoVibe: false,
  semiTransparent: false,
  fontSizeScale: 1,       // 1 = default, 0.9 = small, 1.2 = large
  showBookmarksBar: false,
  showHomeButton: false,
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
  ntpShowStats: false,       // privacy widget — opt in from Settings → New tab
  // Optional "Privoo News" link on the Speed Dial (off by default). The news
  // itself lives at privoo://news and auto-opens after setup / an update.
  ntpNewsLink: false,
  // Last app version we auto-opened Privoo News for — drives "show news once
  // Random wallpaper: a freely licensed photo behind the new tab, credited to
  // its photographer. A batch is fetched once an hour and every new tab picks
  // one out of it, so ten tabs is one download, not ten.
  ntpRandomWallpaper: false,
  // Superseded by ntpRandomWallpaper. Kept so an existing profile's choice can
  // be carried across once, in the migration below.
  ntpWallpaperSlideshow: false,
  ntpShowQuickLinks: true,   // shortcut cards under the search bar — on by default
  ntpShowAddShortcutBtn: true, // top-right "Add shortcut" pill
  // Brave-style focused search: when the user clicks/focuses the search bar
  // on the new tab page, it scales up and the shortcuts below fade out so
  // the attention is on the search input.
  ntpFocusedSearch: false,
  ntpBackground: 'default',
  // null = use the shipped default wallpaper (wallpaper.png); '' = user
  // explicitly removed it via "Remove wallpaper"; anything else = custom path.
  ntpWallpaperPath: null,
  // Gates the shipped default wallpaper.png specifically (Settings → Apply
  // Privoo Background). Has no effect once the user sets their own custom
  // wallpaper — that always shows regardless of this toggle.
  ntpApplyPrivooBackground: false,
  ntpWallpaperDim: 0.42,
  // Wallpapers kept for reuse. Each entry is { id, type, ext, name, addedAt };
  // the file lives in userData/wallpapers/<id><ext>. The ACTIVE wallpaper is
  // still ntpWallpaperPath — the library just sets it, the same way the file
  // picker always did, so nothing downstream needs to know this exists.
  ntpWallpaperLibrary: [],
  // Which library entry is currently the active wallpaper, so the collection
  // can show which tile is in use and know what to clear if it is removed.
  ntpWallpaperActiveId: '',
  ntpDark: false,
  // No shortcuts on a fresh install. They can be added in Settings under
  // New tab page. An empty array a user has saved is respected too.
  ntpQuickLinks: [],

  // Downloads
  downloadPath: null,   // null = use system default (app.getPath('downloads'))
  askDownloadPath: false,

  // Extensions
  extensions: [],

  // Misc
  hardwareAcceleration: true,
  // Routes video through normal GPU compositing instead of a DirectComposition
  // hardware overlay plane. On by default: the overlay path is what produces
  // black video (with working audio) on a number of NVIDIA driver branches.
  // Turn it off to reclaim a little GPU bandwidth if your machine is unaffected.
  // Requires a restart — the switch is read before the GPU process starts.
  videoOverlayCompat: true,
  smoothScrolling: true,
  videoPopOut: false,
  ytdlpPath: null,
  showYtdlpToolbar: false,
  showGeoToolbar: true,
  // Downloads is the one toolbar button that earns permanent space: it is
  // where an in-flight transfer reports and where a finished one waits.
  showDownloadsButton: true,
  showExtensionsButton: true,   // pinned by default; unpin from the Extensions page
  showNotesButton: false, // hidden by default — enable via the Notes extension
  showCalculator: false,  // Calculator toolbar button — enable via the Calculator extension
  lucidMode: false,       // Lucid Mode — hover a video for a star that enhances its picture
  clearDataOnExit: false, // wipes history, cache, cookies, site data and downloads on quit
  extMoveNoticeShown: false, // one-time "features moved to Extensions" notice in Settings
  showSidebar: true,      // legacy boolean — derived from/kept in sync with sidebarMode below
  sidebarMode: 'on',      // 'on' | 'off' | 'hover' — hover auto-collapses the rail until the cursor nears the edge
  sidebarQuickAccess: true, // pinned Downloads/History/Bookmarks/Settings row at the top of the rail
  sidebarPanelWidth: 880, // width of the embedded web panel in the sidebar (drag the edge to resize)
  sidebarMusicPlayer: '', // remembered choice behind the sidebar Music shortcut ('' = ask on next click)
  // Surface the sidebar music player in the toolbar media dropdown rather
  // than as a hover pill on the sidebar icon. On by default.
  musicInToolbar: true,
  mobileEmulationDevice: 'samsung', // 'samsung' | 'iphone', used by the sidebar web panel and Mobile View
  showAiButton: false,    // AI toolbar button — off by default, turned on from the Extensions page
  aiTabPinned1Applied: false,  // one-time: place the pinned Privoo AI tab
  noteInControl: false,        // one-time: the line shown after fifteen sites
  extButtonPinned1Applied: false,  // one-time: pin the extensions button on existing profiles
  showVpnButton: false,   // VPN toolbar button — enable via the Privoo VPN extension

  // Privoo VPN — a friendly toolbar front-end for the existing manual-proxy
  // system below (proxyMode/proxyUrl). Privoo doesn't operate or provide any
  // proxy servers itself — connecting composes these fields into proxyUrl and
  // sets proxyMode to 'manual', so it reuses the same session plumbing as the
  // Settings → Privacy → Proxy control. "Connected" is derived from
  // proxyMode/proxyUrl directly, not tracked separately, so the two controls
  // can never disagree about the actual state.
  vpnTermsAccepted: false,
  vpnProxyType: 'http',   // 'http' | 'https' | 'socks5'
  vpnProxyHost: '',
  vpnProxyPort: '',
  vpnProxyUsername: '',
  vpnProxyPassword: '',
  showTranslateButton: false, // Translate toolbar button — off by default, enable in Settings → Features
  verticalTabs: false,    // show tabs in a vertical left panel instead of horizontal strip
  vtabsCollapsed: false,  // vertical tabs panel collapsed to icon-only rail
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
  uiSounds: false,        // play short blips on typing/clicks/tab open+close (uses the active theme's character)
  uiSoundVolume: 0.7,     // 0..1 volume for the UI blips
  newSearchBarStyle: false, // legacy boolean for the "soft" address bar (superseded by searchBarStyle)
  searchBarStyle: '',     // address-bar appearance: classic | soft | pill | square ('' = derive from newSearchBarStyle)
  syncDiscordTheme: true,  // recolor discord.com to match Privoo's accent + theme palette
  // Pointer shown over Privoo's own interface: system | large | precise | custom
  cursorStyle: 'system',
  cursorImagePath: '',    // set when cursorStyle is 'custom'
  customChromeCss: '',    // power-user: raw CSS injected into the browser chrome
  sidebarLinks: [
    { title: 'Snapchat', url: 'https://web.snapchat.com' },
    { title: 'Music',    url: 'privoo://music', music: true },
    { title: 'Discord',  url: 'https://discord.com/app' },
    { title: 'Instagram',url: 'https://www.instagram.com' },
  ],
  ghostName: '',          // user-supplied name for the Privoo mascot
  // Monochrome accent. The literal value is only a fallback: the renderer
  // treats MONO_ACCENT as adaptive and resolves it to white on the black
  // chrome and to near-black in light mode, so "the accent" is always the
  // opposite of the surface it sits on. Any other hex is used verbatim.
  accentColor: '#ffffff',

  accentBeforeTheme: '',  // accent in use before a theme retuned it; restored when the theme is turned off
  /** Last window bounds + maximized state — restored on next launch. */
  windowState: null,
  disclaimerAccepted: false,
  welcomeShown: false,
  mmhmShown: false,
  updatesToastShown: false,
  discordPromptShown: false,
  thankYouShown: false,    // one-time "Thank you for using Privoo" popup
  ownBrowsingShown: false, // one-time "Your browsing belongs to you, not advertisers" popup
  incognitoWelcomeShown: false, // one-time "Welcome to Incognito" intro on the private new-tab page
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

  /** Multi-identity form autofill (name/address/etc, distinct from the
   *  password vault above). Ollama assists field-matching when a local
   *  Ollama server is reachable; heuristics alone otherwise. */
  // Opt-in. Autofilling saved personal details into a page is something the
  // user should ask for, so the right-click item stays hidden until they do.
  identityAutofillEnabled: false,
  ollamaModel: 'llama3.2',
  easyFilesEnabled: true,
  downloadBoosterEnabled: false, // splits large downloads into parallel range requests

  // Privoo Guard — optional ClamAV-backed on-demand scanning. Off by
  // default and does nothing at all unless ClamAV is installed separately.
  protectionEnabled: false,
  protectionBinaryPath: '',

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
  // On. Stripping utm_*/fbclid, minimising Referer and sending GPC break
  // nothing — they are the cheapest privacy in the browser, and shipping
  // them off by default meant almost nobody had them.
  strongerTrackingProtection: true,
};

const profileStore = require('./profile-store');

let cache = null;

function filePath() {
  return path.join(profileStore.getDataDir(), 'privoo-settings.json');
}

// Flags for every one-time migration wave below. A new profile is stamped with
// all of them, because it starts life at the shape those waves exist to reach.
// Adding a wave means adding its flag here too, or new installs will run it.
const MIGRATIONS_ALREADY_APPLIED = {
  uiRefresh2Applied: true,
  // Turns Stronger tracking protection on once, for profiles created while
  // it defaulted to off. Guarded by its own flag so it never fights someone
  // who has since turned it off on purpose.
  trackingProt1Applied: true,
  seedTrim1Applied: true,
  circleUndo1Applied: true,
  identityOptIn1Applied: true,
  sidebarWiden1Applied: true,
  musicShortcut1Applied: true,
  quietUi1Applied: true,
  qlSeedClear1Applied: true,
  downloadsBtn1Applied: true,
  onyx1Applied: true,
  randomWp1Applied: true,
};

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
      if (parsed.showSidebar === false || parsed.showSidebar === undefined) {
        cache.showSidebar = true;
      }
      if (parsed.showBookmarksBar === false || parsed.showBookmarksBar === undefined) {
        cache.showBookmarksBar = true;
      }
      cache.uiRefresh2Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // Second migration wave — MUST live outside the uiRefresh2 block: profiles
    // that already ran wave 1 have the flag set, so anything added inside that
    // block after the fact never fires for them.
    if (!parsed.trackingProt1Applied) {
      cache.strongerTrackingProtection = true;
      cache.trackingProt1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }

    if (!parsed.seedTrim1Applied) {
      if (!parsed.sidebarPanelWidth || parsed.sidebarPanelWidth <= 340) {
        cache.sidebarPanelWidth = 480;
      }
      const _dropSeed = (l) => !/mail\.google\.com|whatsapp\.com/i.test((l && l.url) || '');
      if (Array.isArray(parsed.sidebarLinks)) cache.sidebarLinks = parsed.sidebarLinks.filter(_dropSeed);
      if (Array.isArray(parsed.ntpQuickLinks)) cache.ntpQuickLinks = parsed.ntpQuickLinks.filter(_dropSeed);
      cache.seedTrim1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // Third migration wave. It used to flip newTabBtnCircle back off; that
    // setting no longer exists, so all this does now is clear the key out of
    // profiles that still carry it. The flag stays so the waves below keep
    // running in the order they expect.
    if (!parsed.circleUndo1Applied) {
      delete cache.newTabBtnCircle;
      cache.circleUndo1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // Fourth migration wave. sidebarMode is new; derive it from whatever the
    // old showSidebar boolean already said so nobody's existing choice
    // changes on upgrade.
    if (!parsed.sidebarMode) {
      cache.sidebarMode = parsed.showSidebar === false ? 'off' : 'on';
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // The five starter shortcuts are no longer seeded. Clear them for anyone
    // still carrying the shipped set untouched. A customised list is kept.
    if (!parsed.qlSeedClear1Applied) {
      const SEEDED = 'YouTube|Spotify|Amazon|eBay|Reddit';
      const current = Array.isArray(parsed.ntpQuickLinks) ? parsed.ntpQuickLinks : null;
      if (current && current.map((l) => l && l.name).join('|') === SEEDED) {
        cache.ntpQuickLinks = [];
      }
      cache.qlSeedClear1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // Fifth migration wave, again outside the earlier blocks. Identity autofill
    // shipped defaulting ON, so every profile has `true` persisted whether or
    // not the user ever wanted it. It is now opt-in, so clear that once for
    // anyone still sitting on the old default.
    if (!parsed.identityOptIn1Applied) {
      if (parsed.identityAutofillEnabled === true) {
        cache.identityAutofillEnabled = false;
      }
      cache.identityOptIn1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // Sixth migration wave. sidebarPanelWidth's default widened from 480 to
    // 640 — bump anyone still sitting on the old default, but leave any width
    // the user actually dragged untouched.
    if (!parsed.sidebarWiden1Applied) {
      if (parsed.sidebarPanelWidth === 480) {
        cache.sidebarPanelWidth = 640;
      }
      cache.sidebarWiden1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    if (!parsed.musicShortcut1Applied) {
      if (Array.isArray(parsed.sidebarLinks)) {
        cache.sidebarLinks = parsed.sidebarLinks.map((l) => (
          /open\.spotify\.com/i.test((l && l.url) || '')
            ? { title: 'Music', url: 'privoo://music', music: true }
            : l
        ));
      }
      if (!parsed.sidebarPanelWidth || parsed.sidebarPanelWidth === 640) {
        cache.sidebarPanelWidth = 880;
      }
      cache.musicShortcut1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    if (!parsed.quietUi1Applied) {
      if (parsed.accentColor === '#8b7cf7' || parsed.accentColor === undefined) {
        cache.accentColor = '#5b7fb9';
      }
      if (parsed.ntpApplyPrivooBackground !== false && parsed.ntpWallpaperPath == null) {
        cache.ntpApplyPrivooBackground = false;
      }
      if (parsed.searchEngine === 'brave' || parsed.searchEngine === undefined) {
        cache.searchEngine = 'google';
      }
      if (parsed.showYtdlpToolbar === true) cache.showYtdlpToolbar = false;
      if (parsed.showAiButton !== false) cache.showAiButton = false;
      cache.quietUi1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // The extensions button is pinned by default now. A change of default
    // reaches only profiles that do not exist yet, so this reaches the rest,
    // once. Flagged, so unpinning it afterwards sticks rather than being
    // undone on the next launch.
    if (!parsed.extButtonPinned1Applied) {
      cache.showExtensionsButton = true;
      cache.extButtonPinned1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }

    // showDownloadsButton shipped defaulting to false and its toggle drove
    // nothing — the renderer forced the button visible regardless — so a
    // persisted `false` is leftover from the old default, never a choice
    // anyone made. Clear it once; from here the toggle is live and whatever
    // the user sets afterwards sticks.
    if (!parsed.downloadsBtn1Applied) {
      if (parsed.showDownloadsButton === false) cache.showDownloadsButton = true;
      cache.downloadsBtn1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // Dark-by-default refresh, with a monochrome accent. Like every migration
    // above it only moves values still sitting on the OLD default: someone
    // who deliberately picked light mode or a coloured accent keeps both.
    // (The flag is named onyx1 after the black theme this first shipped as;
    // the name is load-bearing in existing profiles, so it stays.)
    if (!parsed.onyx1Applied) {
      if (parsed.darkMode === undefined || parsed.darkMode === false) {
        cache.darkMode = true;
      }
      // Every accent Privoo has ever shipped as a default, in order. Any of
      // them still in place means the user never chose one.
      const SHIPPED_ACCENTS = ['#57a97e', '#8b7cf7', '#5b7fb9', '#4f46e5'];
      if (parsed.accentColor === undefined
          || SHIPPED_ACCENTS.includes(String(parsed.accentColor).toLowerCase())) {
        cache.accentColor = '#ffffff';
      }
      cache.onyx1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
    // The bundled wallpaper gallery is gone, and the hourly single-photo
    // slideshow became "Random wallpaper" — a batch an hour, one per tab.
    // Carry the old switch across, and clear a wallpaper that pointed into the
    // gallery, so a profile that had one falls back to a plain new tab rather
    // than to a file that no longer exists.
    if (!parsed.randomWp1Applied) {
      if (parsed.ntpWallpaperSlideshow === true) cache.ntpRandomWallpaper = true;
      const wp = String(parsed.ntpWallpaperPath || '').split(String.fromCharCode(92)).join('/');
      if (wp.includes('/renderer/wallpapers/')) {
        cache.ntpWallpaperPath = '';
        cache.ntpWallpaperType = 'image';
      }
      cache.randomWp1Applied = true;
      try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
    }
  } catch {
    // No settings file yet: this is a brand-new profile.
    cache = { ...DEFAULTS, ...MIGRATIONS_ALREADY_APPLIED };
    try { fs.writeFileSync(filePath(), JSON.stringify(cache, null, 2), 'utf8'); } catch {}
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
