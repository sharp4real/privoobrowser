'use strict';

// ─── Internal page URLs ──────────────────────────────────────────────────────
const NEWTAB_URL     = 'privoo://newtab/';
const SETTINGS_URL   = 'privoo://settings/';
const DOWNLOADS_URL  = 'privoo://downloads/';
const HISTORY_URL    = 'privoo://history/';
const EXTENSIONS_URL = 'privoo://extensions/';

// Default favicon shown for internal pages and when a real favicon fails to load
const VTAB_DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16' height='16'%3E%3Cpath fill='%235f6368' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z'/%3E%3C/svg%3E";

// ─── Fingerprint spoofing — injected into every real web page ────────────────
// Brave-style "farbling": canvas noise is DETERMINISTIC per-origin instead of
// random per-page-load. This means the same site sees the same canvas hash on
// every visit (so reCAPTCHA / Cloudflare / hCaptcha treat you as a returning
// human and don't show challenges) while different sites see different hashes
// (so trackers still can't correlate you across origins).
//
// We deliberately do NOT spoof WebGL renderer — claiming "RTX 3080 D3D11" on
// macOS or Linux is impossible and is an instant bot signal to captcha services.
const FINGERPRINT_JS = `(function(){
  try {
    // Stable per-origin salt — same site -> same hash every visit.
    var _origin = (location && location.origin) || (location && location.hostname) || '';
    var _h = 5381;
    for (var i = 0; i < _origin.length; i++) {
      _h = ((_h << 5) + _h + _origin.charCodeAt(i)) | 0;
    }
    var _salt = Math.abs(_h) % 251 + 5; // 5..255, deterministic per origin
    
    // Reduce farbling on Google domains to avoid captcha triggers, and
    // disable it entirely on YouTube — the video player runs continuous
    // getImageData/toDataURL calls for the timeline and quality menu, and
    // even our cheap farbling slows initial video startup noticeably.
    var _host = location.hostname;
    var _isGoogle = /google\\.(com|[a-z]{2,3}|co\\.[a-z]{2})$/i.test(_host);
    var _isYouTube = /(^|\\.)(youtube\\.com|youtu\\.be|ytimg\\.com|googlevideo\\.com)$/i.test(_host);
    if (_isYouTube) return;
    var _farblingIntensity = _isGoogle ? 2 : 16; // Much lighter on Google

    var _toDU = HTMLCanvasElement.prototype.toDataURL;
    var _toB  = HTMLCanvasElement.prototype.toBlob;
    var _gID  = CanvasRenderingContext2D.prototype.getImageData;
    var _pID  = CanvasRenderingContext2D.prototype.putImageData;

    function farble(ctx, w, h) {
      if (!w || !h) return;
      try {
        var d = _gID.call(ctx, 0, 0, w, h);
        // Modify a small, deterministic set of pixels — enough to defeat
        // fingerprint hashing, subtle enough not to trip image-tamper detectors.
        var total = (d.data.length / 4) | 0;
        var N = Math.min(_farblingIntensity, total);
        for (var k = 0; k < N; k++) {
          var px = ((_salt * 9301 + k * 49297 + 233280) % total) * 4;
          if (d.data[px + 3] === 0) continue;
          d.data[px]     = (d.data[px]     ^ ((_salt + k)     & 1)) & 0xff;
          d.data[px + 1] = (d.data[px + 1] ^ ((_salt + k + 1) & 1)) & 0xff;
        }
        _pID.call(ctx, d, 0, 0);
      } catch(e) {}
    }

    HTMLCanvasElement.prototype.toDataURL = function(t, q) {
      var o = document.createElement('canvas');
      o.width = this.width; o.height = this.height;
      var c = o.getContext('2d');
      if (c) { c.drawImage(this, 0, 0); farble(c, o.width, o.height); }
      return _toDU.call(o, t, q);
    };
    HTMLCanvasElement.prototype.toBlob = function(cb, t, q) {
      var o = document.createElement('canvas');
      o.width = this.width; o.height = this.height;
      var c = o.getContext('2d');
      if (c) { c.drawImage(this, 0, 0); farble(c, o.width, o.height); }
      _toB.call(o, cb, t, q);
    };

    // AudioContext fingerprint — also deterministic per-origin
    // Skip audio farbling on Google to reduce captcha triggers
    if (!_isGoogle) {
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC && AC.prototype && AC.prototype.createAnalyser) {
          var _gfd = AnalyserNode.prototype.getFloatFrequencyData;
          AnalyserNode.prototype.getFloatFrequencyData = function(arr) {
            _gfd.call(this, arr);
            // Tiny deterministic perturbation
            for (var j = 0; j < arr.length; j += 100) {
              arr[j] = arr[j] + ((_salt % 7) * 1e-7);
            }
          };
        }
      } catch(e) {}
    }
  } catch(e) {}
})();`;

// Force Dark Mode. A single script handles both turning it ON and OFF, so
// toggling the setting (or loading a new page) always lands in the right
// state without needing a reload.
//
// main.js already emulates `prefers-color-scheme: dark`, so a site that ships
// a real dark theme has painted a dark backdrop by the time this runs — those
// are left alone. Pages still showing a light backdrop get a hue-preserving
// invert, with media re-inverted so photos and video look normal.
function forceDarkScript(enabled) {
  return `(function(){
    var ID='__privoo_fdm__';
    var html=document.documentElement;
    function clear(){
      var s=document.getElementById(ID);
      if(s)s.remove();
      html.style.colorScheme='';
    }
    if(!${enabled ? 'true' : 'false'}){ clear(); return; }
    if(location.protocol==='privoo:'||location.protocol==='about:'||
       location.protocol==='chrome:'||location.protocol==='devtools:'){ clear(); return; }

    // The page explicitly declares dark support — keep its own theme.
    var meta=document.querySelector('meta[name="color-scheme"]');
    if(meta&&/dark/i.test(meta.content)){ clear(); html.style.colorScheme='dark'; return; }

    // Sample the rendered backdrop. If it's already dark the site has its own
    // dark theme (applied via prefers-color-scheme) — don't double-invert it.
    function luma(c){
      if(!c)return null;
      var m=c.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
      if(!m)return null;
      if(m[4]!==undefined&&parseFloat(m[4])===0)return null;
      return (parseInt(m[1])*299+parseInt(m[2])*587+parseInt(m[3])*114)/1000;
    }
    try{
      var bodyL=document.body?luma(getComputedStyle(document.body).backgroundColor):null;
      var bg=bodyL!=null?bodyL:luma(getComputedStyle(html).backgroundColor);
      if(bg!=null&&bg<128){ clear(); html.style.colorScheme='dark'; return; }
    }catch(e){}

    // Light page — invert the whole page, then re-invert media so photos and
    // video keep their real colours. Page and media MUST use the identical
    // filter (invert(1) hue-rotate(180deg)) so applying it twice to media is
    // a perfect round-trip — invert(0.92) did not cancel and tinted images.
    var s=document.getElementById(ID);
    if(!s){ s=document.createElement('style'); s.id=ID; (document.head||html).appendChild(s); }
    s.textContent=
      'html{filter:invert(1) hue-rotate(180deg)!important}'+
      'img,video,iframe,canvas,picture,embed,object,[style*="background-image"],'+
      '[class*="thumbnail"],[class*="avatar"],[class*="logo"]{'+
        'filter:invert(1) hue-rotate(180deg)!important}'+
      'pre,code,[class*="highlight"]{filter:none!important}';
    html.style.colorScheme='dark';
  })();`;
}

const VIDEO_POPOUT_JS = `(function(){
  if(window.__privooVpip)return;window.__privooVpip=1;

  /* ── Toast ── */
  var toast=document.createElement('div');
  toast.style.cssText='position:fixed;top:18px;left:50%;transform:translateX(-50%) translateY(-10px);z-index:2147483647;padding:7px 18px;border-radius:20px;background:rgba(15,15,18,.92);color:#fff;font:12px system-ui,sans-serif;box-shadow:0 2px 14px rgba(0,0,0,.45);opacity:0;transition:opacity .18s,transform .18s;pointer-events:none;white-space:nowrap';
  toast.textContent='Video popped out';
  document.documentElement.appendChild(toast);
  var _tt;
  function showToast(){clearTimeout(_tt);toast.style.opacity='1';toast.style.transform='translateX(-50%) translateY(0)';_tt=setTimeout(function(){toast.style.opacity='0';toast.style.transform='translateX(-50%) translateY(-10px)';},2000);}

  /* ── Button ── */
  var b=document.createElement('button');
  b.type='button';
  b.setAttribute('aria-label','Picture-in-picture');
  b.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.6L7.8 14.8l1.4 1.4L19 5.4V9h2V3h-7z"/></svg>Pop out';
  b.style.cssText='position:fixed;z-index:2147483647;display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:20px;border:none;background:rgba(15,15,18,.85);color:#fff;font:12px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.4);opacity:0;transition:opacity .15s;pointer-events:none';
  document.documentElement.appendChild(b);

  var _vid=null;

  function bestVideo(){
    var all=[].slice.call(document.querySelectorAll('video'));
    var pl=all.filter(function(v){return !v.paused&&v.readyState>1&&v.videoWidth>0;});
    if(pl.length)return pl.reduce(function(a,c){return a.videoWidth*a.videoHeight>=c.videoWidth*c.videoHeight?a:c;});
    var rd=all.filter(function(v){return v.readyState>1&&v.videoWidth>0;});
    if(rd.length)return rd.reduce(function(a,c){return a.videoWidth*a.videoHeight>=c.videoWidth*c.videoHeight?a:c;});
    return null;
  }

  function place(vid){
    var r=vid.getBoundingClientRect();
    if(r.width<80||r.height<50||r.bottom<0||r.top>window.innerHeight){hide();return;}
    b.style.top=(r.top+10)+'px';
    b.style.left=(r.right-b.offsetWidth-10)+'px';
    b.style.opacity='1';b.style.pointerEvents='auto';
  }
  function hide(){b.style.opacity='0';b.style.pointerEvents='none';}

  document.addEventListener('mousemove',function(e){
    var all=[].slice.call(document.querySelectorAll('video'));
    var hit=null;
    for(var i=0;i<all.length;i++){var r=all[i].getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom&&r.width>=80&&r.height>=50){hit=all[i];break;}}
    if(hit){_vid=hit;place(hit);}
    else{var br=b.getBoundingClientRect();if(e.clientX>=br.left&&e.clientX<=br.right&&e.clientY>=br.top&&e.clientY<=br.bottom)return;_vid=null;hide();}
  },true);
  window.addEventListener('scroll',function(){if(_vid)place(_vid);},true);
  window.addEventListener('resize',function(){if(_vid)place(_vid);});

  b.onclick=function(e){
    e.stopPropagation();
    var v=_vid||bestVideo();
    if(v&&v.requestPictureInPicture)v.requestPictureInPicture().then(showToast).catch(function(){});
  };
})();`;

const GEO_PRESETS = {
  off: null,
  nyc: [40.7128, -74.0060],
  london: [51.5074, -0.1278],
  tokyo: [35.6762, 139.6503],
  paris: [48.8566, 2.3522],
  sydney: [-33.8688, 151.2093],
};

function geoCoordsFromSettings(s) {
  if (!s?.geoSpoofEnabled || s.geoPreset === 'off' || !s.geoPreset) return null;
  if (s.geoPreset === 'custom') {
    const la = parseFloat(s.geoLatitude);
    const lo = parseFloat(s.geoLongitude);
    if (Number.isFinite(la) && Number.isFinite(lo)) return [la, lo];
    return null;
  }
  const p = GEO_PRESETS[s.geoPreset];
  return Array.isArray(p) ? p : null;
}

function geolocationOverrideScript(lat, lon) {
  const la = Number(lat) || 0;
  const lo = Number(lon) || 0;
  return `(function(){
    try{
      var lat=${JSON.stringify(la)}, lon=${JSON.stringify(lo)};
      if(!navigator.geolocation){
        navigator.geolocation={};
      }
      var watchId=0;
      function mk(){
        return {
          coords:{
            latitude:lat,longitude:lon,altitude:null,altitudeAccuracy:null,
            accuracy:40,heading:null,speed:null
          },
          timestamp:Date.now()
        };
      }
      navigator.geolocation.getCurrentPosition=function(success,err,opts){
        if(typeof success==='function'){
          setTimeout(function(){
            try{success(mk());}catch(e){}
          },10);
        }
      };
      navigator.geolocation.watchPosition=function(success,err,opts){
        if(typeof success==='function'){
          setTimeout(function(){
            try{success(mk());}catch(e){}
          },10);
        }
        return ++watchId;
      };
      navigator.geolocation.clearWatch=function(id){};
      Object.defineProperty(navigator,'geolocation',{
        value:navigator.geolocation,
        writable:false,
        configurable:false
      });
    }catch(e){console.error('Geolocation override error:',e);}
  })();`;
}

// ─── DOM elements ────────────────────────────────────────────────────────────
const tabsEl       = document.getElementById('tabs');
const viewsEl      = document.getElementById('views');
const omnibox      = document.getElementById('omnibox');
const siteIcon         = document.getElementById('site-icon');
const siteInfoPopover  = document.getElementById('site-info-popover');
const backBtn      = document.getElementById('back');
const forwardBtn   = document.getElementById('forward');
const reloadBtn    = document.getElementById('reload');
const reloadIcon   = document.getElementById('reload-icon');
const homeBtn      = document.getElementById('home');
const newTabBtn    = document.getElementById('new-tab');
const shieldBtn    = document.getElementById('shield-btn');
const shieldPanel  = document.getElementById('shield-panel');
const pageShieldBtn     = document.getElementById('page-shield');
const pageShieldPopover = document.getElementById('page-shield-popover');
const shieldCount  = document.getElementById('shield-count');
const menuBtn      = document.getElementById('menu-btn');
const menuEl       = document.getElementById('menu');
const suggestEl    = document.getElementById('suggestions');
const dlBtn        = document.getElementById('downloads-btn');
const dlBadge      = document.getElementById('dl-badge');
const dlTray       = document.getElementById('download-tray');
const bookmarkBtn  = document.getElementById('bookmark-btn');
const bookmarksBar = document.getElementById('bookmarks-bar');
// Right-click empty area of the bookmarks bar → option to hide it.
bookmarksBar?.addEventListener('contextmenu', async (e) => {
  // Skip if the right-click landed on a bookmark chip — that has its own menu.
  if (e.target.closest('.bookmark-chip')) return;
  e.preventDefault();
  const action = await showHtmlMenu([
    { id: 'bb-hide', label: 'Hide bookmarks bar' },
    { type: 'separator' },
    { id: 'bb-manage', label: 'Bookmark manager…' },
  ], e.clientX, e.clientY);
  if (action === 'bb-hide') {
    await saveBrowserSetting({ showBookmarksBar: false });
  } else if (action === 'bb-manage') {
    createTab('privoo://bookmarks/');
  }
});

const setupOverlay      = document.getElementById('setup-overlay');
const appSidebar        = document.getElementById('app-sidebar');
const sidebarRail       = document.getElementById('sidebar-rail');
const sidebarFlyout     = document.getElementById('sidebar-flyout');
const sidebarOverlay    = document.getElementById('sidebar-overlay');
const sidebarPanel      = document.getElementById('sidebar-panel');
const sidebarWv         = document.getElementById('sidebar-wv');
const ytdlpToolbarBtn   = document.getElementById('ytdlp-toolbar-btn');
const ytdlpPopover      = document.getElementById('ytdlp-popover');
const ytdlpUrlInput     = document.getElementById('ytdlp-url');
const ytdlpRunBtn       = document.getElementById('ytdlp-run');
const ytdlpPasteBtn     = document.getElementById('ytdlp-paste');
const ytdlpStatusEl     = document.getElementById('ytdlp-status');
const geoToolbarBtn     = document.getElementById('geo-toolbar-btn');
const notesBtn          = document.getElementById('notes-btn');
const geoPopover        = document.getElementById('geo-popover');
const geoPresetSelect   = document.getElementById('geo-preset');
const geoCustomWrap     = document.getElementById('geo-custom-wrap');
const geoLatInput       = document.getElementById('geo-lat');
const geoLonInput       = document.getElementById('geo-lon');
const geoApplyBtn       = document.getElementById('geo-apply');
const geoStatusLine     = document.getElementById('geo-status-line');
const dlPopover         = document.getElementById('dl-popover');
const dlPopoverList     = document.getElementById('dl-popover-list');
const dlPopoverAll      = document.getElementById('dl-popover-all');
const tabContextMenu    = document.getElementById('tab-context-menu');
const wvContextMenu     = document.getElementById('wv-context-menu');
const ctxBackdrop       = document.getElementById('ctx-backdrop');
const audioBtn          = document.getElementById('audio-btn');
const audioPopover      = document.getElementById('audio-popover');
const audioMuteBtn      = document.getElementById('audio-mute-btn');
const audioVolumeSlider = document.getElementById('audio-volume');
const extToolbar        = document.getElementById('ext-toolbar');
const audioVolLabel     = document.getElementById('audio-vol-label');
const bgMusic           = document.getElementById('bg-music');
const vtabsPanel        = document.getElementById('vtabs-panel');
const vtabsList         = document.getElementById('vtabs-list');
const vtabsNewBtn       = document.getElementById('vtabs-new');
const aiPanel           = document.getElementById('ai-panel');
const aiBtn             = document.getElementById('ai-btn');

const STOP_ICON   = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
const RELOAD_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;
const DEFAULT_FAVICON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16' height='16'%3E%3Cpath fill='%235f6368' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z'/%3E%3C/svg%3E")`;

function faviconFallbackForUrl(url) {
  try {
    const host = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch { return null; }
}

function applyTabFavicon(tab, iconUrl) {
  if (!tab?.tabEl || !iconUrl) return;
  tab.faviconUrl = iconUrl;
  const faviconEl = tab.tabEl.querySelector('.favicon');
  if (!faviconEl) return;
  const img = new Image();
  img.onload = () => {
    faviconEl.style.backgroundImage = `url("${iconUrl}")`;
    faviconEl.classList.remove('spin');
  };
  img.onerror = () => {
    const fb = faviconFallbackForUrl(tab.url);
    if (fb && fb !== iconUrl) applyTabFavicon(tab, fb);
    else faviconEl.style.backgroundImage = DEFAULT_FAVICON;
    faviconEl.classList.remove('spin');
  };
  img.src = iconUrl;
}
const AUDIO_ON_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`;
const AUDIO_MUTED_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>`;

// ─── State ───────────────────────────────────────────────────────────────────
let tabs        = [];
let activeId    = null;
let tabSeq      = 0;
let closedStack = [];
let settings    = null;
let searchEngines = {};
let sugItems    = [];
let sugIndex    = -1;
let activeDls   = new Map();   // id → partial record for tray

let tabGroups   = [];
let nextGroupId = 1;
// Chrome's tab-group palette: 9 distinct hues that stay readable on both
// light and dark tab strips. Cycle through them when the user creates groups.
const GROUP_COLORS = [
  { name: 'grey',   solid: '#5f6368', tint: 'rgba(95,99,104,.18)'  },
  { name: 'blue',   solid: '#1a73e8', tint: 'rgba(26,115,232,.18)' },
  { name: 'red',    solid: '#ea4335', tint: 'rgba(234,67,53,.18)'  },
  { name: 'yellow', solid: '#fbbc04', tint: 'rgba(251,188,4,.22)'  },
  { name: 'green',  solid: '#34a853', tint: 'rgba(52,168,83,.18)'  },
  { name: 'pink',   solid: '#ff6d8a', tint: 'rgba(255,109,138,.20)' },
  { name: 'purple', solid: '#a142f4', tint: 'rgba(161,66,244,.18)' },
  { name: 'cyan',   solid: '#24c1e0', tint: 'rgba(36,193,224,.20)' },
  { name: 'orange', solid: '#ff8a65', tint: 'rgba(255,138,101,.20)' },
];
let ctxTabId    = null;
let saveSessionTimer = null;

// ─── Settings ────────────────────────────────────────────────────────────────
async function loadSettings() {
  const data = await window.privoo.getSettings();
  settings = data.settings;
  searchEngines = data.searchEngines;
  applyAppSettings();
  paintFeatures();
  initBgMusic();
}

function applyAppSettings() {
  if (!settings) return;
  const isDark = !!settings.darkMode;
  document.body.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('dark', isDark);
  // Aero gradient — only meaningful while transparency is on; the body class
  // gates the CSS overlay either way so toggling transparency off cleanly
  // hides the gradient without needing a second toggle.
  document.body.classList.toggle('aero-ui', !!settings.aeroGradient);
  document.body.style.fontSize = `${Math.max(0.85, Math.min(Number(settings.fontSizeScale) || 1, 1.25)) * 100}%`;
  homeBtn.hidden = !settings.showHomeButton;
  // Derive a friendly placeholder. For the "custom" engine we surface the
  // hostname so the user can tell at a glance which resolver is active.
  let engName = searchEngines[settings.searchEngine]?.name?.replace(' Search', '') || 'the web';
  if (settings.searchEngine === 'custom') {
    try { engName = new URL(settings.customSearchUrl || '').hostname || 'your search engine'; }
    catch { engName = 'your search engine'; }
  } else if (engName === 'Custom…') {
    engName = 'the web';
  }
  omnibox.placeholder = `Search ${engName} or type a URL`;
  // Custom accent color from the Customize panel — also derive the matching
  // hover (slightly lighter) and soft-fill (low alpha) variants so the entire
  // accent system stays consistent. Without these the hover/focus-ring stayed
  // blue while the main accent went pink/green/etc.
  if (settings.accentColor) {
    applyAccentTriad(settings.accentColor);
  } else {
    document.documentElement.style.removeProperty('--accent');
    document.documentElement.style.removeProperty('--accent-hover');
    document.documentElement.style.removeProperty('--accent-soft');
  }
  renderBookmarksBar();
  updateBookmarkButton();
  paintToolbarWidgets();
  applyVerticalTabs(!!settings.verticalTabs);
  document.body.classList.toggle('vtabs-collapsed', !!settings.vtabsCollapsed);
}

function onSettingsChanged(next) {
  settings = { ...(settings || {}), ...(next || {}) };
  applyAppSettings();
  paintFeatures();
  paintToolbarWidgets();
  // Keep the Customize panel in sync if it's open (otherwise the toggles
  // inside it drift from reality after settings change from elsewhere —
  // e.g. user flips dark mode from the Settings page).
  if (cpPanel && !cpPanel.hidden && !cpPanel.classList.contains('hidden')) {
    paintCustomizePanel();
  }
  initBgMusic();
  for (const tab of tabs) {
    if (tab.ready) applyInjections(tab.wv);
  }
}

function bookmarkList() {
  return Array.isArray(settings?.bookmarks) ? settings.bookmarks : [];
}

function isBookmarkUrl(url) {
  return !!url && bookmarkList().some((b) => b.url === url);
}

function updateBookmarkButton() {
  const tab = activeTab();
  const url = tab?.url || '';
  const canBookmark = url && !url.startsWith('privoo://') && !url.startsWith('about:');
  bookmarkBtn.disabled = !canBookmark;
  bookmarkBtn.classList.toggle('active', canBookmark && isBookmarkUrl(url));
}

function bookmarkFaviconUrl(url) {
  try {
    const h = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${h}.ico`;
  } catch { return ''; }
}

function renderBookmarksBar() {
  if (!bookmarksBar || !settings) return;
  bookmarksBar.hidden = !settings.showBookmarksBar;
  bookmarksBar.innerHTML = '';
  if (bookmarksBar.hidden) return;

  const list = bookmarkList().slice(0, 80);
  for (let i = 0; i < list.length; i++) {
    const bm = list[i];
    const idx = i;
    const btn = document.createElement('button');
    btn.className = 'bookmark-chip';
    btn.title = bm.url;
    const letter = esc(((bm.name || bm.url || '?')[0]).toUpperCase());
    // Render with both <img> (favicon) and a letter fallback. CSS hides the
    // letter once the image loads.
    btn.innerHTML =
      `<span class="bookmark-fav"><img alt="" /><span class="bookmark-letter">${letter}</span></span>` +
      `<span class="bookmark-title">${esc(bm.name || bm.url)}</span>`;
    const img = btn.querySelector('img');
    const favWrap = btn.querySelector('.bookmark-fav');
    const ico = bookmarkFaviconUrl(bm.url);
    if (ico) {
      img.src = ico;
      img.onload  = () => favWrap.classList.add('loaded');
      img.onerror = () => favWrap.classList.remove('loaded');
    }
    btn.addEventListener('click', () => navigate(bm.url));
    btn.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = await showHtmlMenu([
        { id: 'bm-open',   label: 'Open' },
        { id: 'bm-newtab', label: 'Open in new tab' },
        { id: 'bm-copy',   label: 'Copy link address' },
        { type: 'separator' },
        { id: 'bm-remove', label: 'Remove from bookmarks' },
      ], e.clientX, e.clientY);
      if (action === 'bm-open') navigate(bm.url);
      else if (action === 'bm-newtab') createTab(bm.url);
      else if (action === 'bm-copy') navigator.clipboard.writeText(bm.url).catch(() => {});
      else if (action === 'bm-remove') {
        const next = bookmarkList().slice();
        next.splice(idx, 1);
        await saveBrowserSetting({ bookmarks: next });
        updateBookmarkButton();
      }
    });
    bookmarksBar.appendChild(btn);
  }
}

function renderPinnedExtensions() {
  if (!extToolbar) return;
  const pinned = (settings?.extensions || []).filter(e => e.enabled && e.pinnedToToolbar && e.path);
  extToolbar.innerHTML = '';
  for (const ext of pinned) {
    const btn = document.createElement('button');
    btn.className = 'tb-btn round ext-tb-btn';
    btn.title = ext.name || 'Extension';
    btn.dataset.extPath = ext.path;
    if (ext.iconUrl) {
      btn.style.backgroundImage = `url("${ext.iconUrl}")`;
      btn.style.backgroundSize = 'contain';
      btn.style.backgroundPosition = 'center';
      btn.style.backgroundRepeat = 'no-repeat';
    } else {
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>`;
    }
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      closePopovers();
      const rect = btn.getBoundingClientRect();
      const res = await window.privoo.openExtensionPopup({
        extPath: ext.path,
        x: rect.left,
        y: rect.bottom + 4,
      });
      if (!res?.ok) createTab(EXTENSIONS_URL);
    });
    extToolbar.appendChild(btn);
  }
  extToolbar.hidden = pinned.length === 0;
}

function paintToolbarWidgets() {
  if (!settings) return;
  // Show/hide ytdlp toolbar button based on settings
  if (ytdlpToolbarBtn) ytdlpToolbarBtn.hidden = !settings.showYtdlpToolbar;
  // Show/hide geo toolbar button based on settings
  if (geoToolbarBtn) geoToolbarBtn.hidden = !settings.showGeoToolbar;
  // Notes button — off by default, enable in Settings → Features
  if (notesBtn) notesBtn.hidden = !settings.showNotesButton;
  // Translate toolbar button — off by default, enable in Settings → Features
  const translateAnchor = document.getElementById('translate-anchor');
  if (translateAnchor) translateAnchor.hidden = !settings.showTranslateButton;
  const translateBtnEl = document.getElementById('translate-btn');
  if (translateBtnEl) translateBtnEl.hidden = !settings.showTranslateButton;
  // AI toolbar button — on by default, can be hidden in Settings → Features
  const aiAnchor = document.getElementById('ai-anchor');
  if (aiAnchor) aiAnchor.hidden = settings.showAiButton === false;
  // Shortcuts sidebar — also off by default, enable in Settings → Features
  if (appSidebar) appSidebar.hidden = !settings.showSidebar;
  document.body.classList.toggle('sidebar-centered', !!settings.centerSidebarIcons);
  renderPinnedExtensions();
  if (settings.showSidebar) renderSidebarRail();
}

function sidebarLinkList() {
  return Array.isArray(settings?.sidebarLinks) ? settings.sidebarLinks : [];
}

function hideSidebarFlyout() {
  sidebarFlyout?.classList.add('hidden');
  sidebarFlyout?.setAttribute('aria-hidden', 'true');
  if (openSidebarBtn) {
    openSidebarBtn.classList.remove('open');
    openSidebarBtn = null;
  }
}

let openSidebarBtn = null;

function faviconForSidebar(url) {
  try {
    const h = new URL(url).hostname;
    return `https://icons.duckduckgo.com/ip3/${h}.ico`;
  } catch { return ''; }
}

function renderSidebarRail() {
  if (!sidebarRail) return;
  sidebarRail.innerHTML = '';
  hideSidebarFlyout();
  const links = sidebarLinkList().slice(0, 24);
  for (const link of links) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-rail-btn';
    btn.title = link.title || link.url || '';
    btn.setAttribute('role', 'listitem');
    const letter = ((link.title || link.url || '?')[0] || '?').toUpperCase();
    // Proper <img> + letter fallback (no overlap).
    btn.innerHTML =
      `<img alt="" />` +
      `<span class="sb-letter">${esc(letter)}</span>`;
    const img = btn.querySelector('img');
    const ico = faviconForSidebar(link.url);
    if (ico) {
      img.src = ico;
      img.onload  = () => btn.classList.add('loaded');
      img.onerror = () => btn.classList.remove('loaded');
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSidebarPanel(link);
    });
    btn.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const idx = links.indexOf(link);
      const action = await showHtmlMenu([
        { id: 'sb-open',   label: 'Open in new tab' },
        { id: 'sb-copy',   label: 'Copy link' },
        { type: 'separator' },
        { id: 'sb-remove', label: 'Remove shortcut' },
      ], e.clientX, e.clientY);
      if (action === 'sb-open') createTab(link.url);
      else if (action === 'sb-copy') navigator.clipboard.writeText(link.url).catch(() => {});
      else if (action === 'sb-remove') {
        const next = sidebarLinkList().slice();
        next.splice(idx, 1);
        await saveBrowserSetting({ sidebarLinks: next });
        renderSidebarRail();
      }
    });
    sidebarRail.appendChild(btn);
  }
}

// ─── Sidebar add-shortcut modal ──────────────────────────────────────────────
function openSidebarAddModal() {
  const modal = document.getElementById('sidebar-add-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const urlInput = document.getElementById('sb-url');
  const nameInput = document.getElementById('sb-name');
  if (urlInput) { urlInput.value = ''; setTimeout(() => urlInput.focus(), 0); }
  if (nameInput) nameInput.value = '';
}
function closeSidebarAddModal() {
  document.getElementById('sidebar-add-modal')?.classList.add('hidden');
}
async function saveSidebarShortcut() {
  const urlInput = document.getElementById('sb-url');
  const nameInput = document.getElementById('sb-name');
  if (!urlInput) return;
  let url = (urlInput.value || '').trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let title = (nameInput?.value || '').trim();
  if (!title) {
    try { title = new URL(url).hostname.replace(/^www\./, ''); }
    catch { title = url; }
  }
  const next = sidebarLinkList().slice();
  next.push({ url, title });
  await saveBrowserSetting({ sidebarLinks: next });
  renderSidebarRail();
  closeSidebarAddModal();
}

function openSidebarFlyout(anchorBtn, link) {
  if (!sidebarFlyout) return;
  const fly = sidebarFlyout;
  fly.classList.remove('hidden');
  fly.setAttribute('aria-hidden', 'false');
  const r = anchorBtn.getBoundingClientRect();
  fly.style.left = `${r.right + 8}px`;
  fly.style.top = `${Math.min(Math.max(8, r.top), window.innerHeight - 220)}px`;
  fly.innerHTML =
    `<div class="sf-title">${esc(link.title || 'Shortcut')}</div>` +
    `<div class="sf-url">${esc(link.url)}</div>` +
    `<div class="sf-actions">` +
      `<button type="button" class="primary" id="sf-go">Open</button>` +
      `<button type="button" id="sf-close">Close</button>` +
    `</div>`;
  fly.querySelector('#sf-close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    hideSidebarFlyout();
  });
  fly.querySelector('#sf-go')?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigate(link.url);
    hideSidebarFlyout();
  });
}

// ─── Sidebar web panel ────────────────────────────────────────────────────────
let _sidebarResizing = false;
let _sidebarResizeStart = 0;
let _sidebarResizeW = 320;

function openSidebarPanel(link) {
  if (!sidebarPanel || !sidebarWv) return;
  // Apply preload + partition once before first real navigation
  if (!sidebarWv.getAttribute('preload') && window.privoo?.webviewPreloadUrl) {
    sidebarWv.setAttribute('preload', window.privoo.webviewPreloadUrl);
  }
  const _incoPart = window.__privooIncognitoPartition || window.privoo?.incognitoPartition;
  if (_incoPart && !sidebarWv.getAttribute('partition')) {
    sidebarWv.setAttribute('partition', _incoPart);
  }
  const w = settings?.sidebarPanelWidth || 320;
  sidebarPanel.style.width = `${w}px`;
  const titleEl = document.getElementById('sidebar-panel-title');
  if (titleEl) {
    try { titleEl.textContent = new URL(link.url).hostname.replace(/^www\./, ''); }
    catch { titleEl.textContent = link.title || link.url; }
  }
  sidebarWv.src = link.url;
  sidebarPanel.hidden = false;
  sidebarOverlay?.classList.remove('hidden');
  // Trigger Opera-style slide-in animation
  sidebarPanel.classList.remove('sp-enter');
  requestAnimationFrame(() => sidebarPanel.classList.add('sp-enter'));
  // Keep title current as the page navigates
  sidebarWv.addEventListener('page-title-updated', (e) => {
    if (titleEl) {
      try { titleEl.textContent = new URL(sidebarWv.getURL()).hostname.replace(/^www\./, ''); }
      catch { titleEl.textContent = e.title || ''; }
    }
  });
}

function closeSidebarPanel() {
  if (!sidebarPanel) return;
  sidebarPanel.hidden = true;
  sidebarOverlay?.classList.add('hidden');
  if (sidebarWv) sidebarWv.src = 'about:blank';
}

// Sidebar panel header buttons
document.getElementById('sidebar-panel-close')?.addEventListener('click', closeSidebarPanel);
// Click outside the panel (on the transparent overlay) dismisses it
sidebarOverlay?.addEventListener('click', closeSidebarPanel);
document.getElementById('sidebar-panel-back')?.addEventListener('click', () => {
  if (sidebarWv?.canGoBack()) sidebarWv.goBack();
});
document.getElementById('sidebar-panel-newtab')?.addEventListener('click', () => {
  try { const url = sidebarWv?.getURL(); if (url && url !== 'about:blank') createTab(url); } catch {}
});

// Drag-to-resize handle
const sidebarResizeHandle = document.getElementById('sidebar-resize');
sidebarResizeHandle?.addEventListener('mousedown', (e) => {
  e.preventDefault();
  _sidebarResizing = true;
  _sidebarResizeStart = e.clientX;
  _sidebarResizeW = sidebarPanel ? parseInt(sidebarPanel.style.width) || 320 : 320;
  document.body.classList.add('sidebar-resizing');
  document.addEventListener('mousemove', _onSidebarResize);
  document.addEventListener('mouseup', _onSidebarResizeEnd);
});

function _onSidebarResize(e) {
  if (!_sidebarResizing || !sidebarPanel) return;
  const delta = e.clientX - _sidebarResizeStart;
  const newW = Math.max(180, Math.min(640, _sidebarResizeW + delta));
  sidebarPanel.style.width = `${newW}px`;
}

async function _onSidebarResizeEnd() {
  if (!_sidebarResizing) return;
  _sidebarResizing = false;
  document.body.classList.remove('sidebar-resizing');
  document.removeEventListener('mousemove', _onSidebarResize);
  document.removeEventListener('mouseup', _onSidebarResizeEnd);
  if (sidebarPanel) {
    const w = parseInt(sidebarPanel.style.width) || 320;
    await saveBrowserSetting({ sidebarPanelWidth: w });
  }
}

function serializeSession() {
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.id === activeId));
  return {
    version: 1,
    activeIndex: tabs.length ? Math.min(activeIndex, tabs.length - 1) : 0,
    groups: tabGroups.slice(),
    tabs: tabs.map((t) => ({
      url: t.url || NEWTAB_URL,
      title: t.title || 'Tab',
      pinned: !!t.pinned,
      groupId: t.groupId || null,
    })),
  };
}

function scheduleSaveSession() {
  clearTimeout(saveSessionTimer);
  saveSessionTimer = setTimeout(() => {
    window.privoo.saveTabSession(serializeSession()).catch?.(() => {});
  }, 600);
}

async function saveSessionNow() {
  await window.privoo.saveTabSession(serializeSession()).catch?.(() => {});
}

function updateGeoStatusLine() {
  if (!geoStatusLine || !settings) return;
  const c = geoCoordsFromSettings(settings);
  if (!settings.geoSpoofEnabled || !c) {
    geoStatusLine.textContent = 'Status: not masking — pages use default geolocation.';
    return;
  }
  const labels = { nyc: 'New York', london: 'London', tokyo: 'Tokyo', paris: 'Paris', sydney: 'Sydney', custom: 'Custom' };
  const nm = labels[settings.geoPreset] || settings.geoPreset;
  geoStatusLine.textContent = `Status: masking active — ${nm} (${c[0].toFixed(3)}, ${c[1].toFixed(3)})`;
}

function syncGeoPopoverFromSettings() {
  if (!geoPresetSelect || !settings) return;
  const p = settings.geoSpoofEnabled ? (settings.geoPreset || 'off') : 'off';
  const valid = p === 'off' || p === 'custom' || (GEO_PRESETS[p] != null);
  geoPresetSelect.value = valid ? p : 'off';
  if (geoLatInput) geoLatInput.value = String(settings.geoLatitude ?? '40.7128');
  if (geoLonInput) geoLonInput.value = String(settings.geoLongitude ?? '-74.0060');
  if (geoCustomWrap) geoCustomWrap.classList.toggle('hidden', geoPresetSelect.value !== 'custom');
  updateGeoStatusLine();
}

function enforcePinnedFirst() {
  const pinned = tabs.filter((t) => t.pinned);
  const rest = tabs.filter((t) => !t.pinned);
  tabs = [...pinned, ...rest];
  renderTabStrip();
}

// Renders pinned → ungrouped → [group chip + group tabs]...
// Keeps grouped tabs visually contiguous behind their group chip.
function renderTabStrip() {
  if (!tabsEl) return;
  // Remove any existing chips
  tabsEl.querySelectorAll('.tab-group-chip').forEach(el => el.remove());

  const pinned    = tabs.filter(t => t.pinned);
  const ungrouped = tabs.filter(t => !t.pinned && !t.groupId);
  const grouped   = tabs.filter(t => !t.pinned && t.groupId);

  for (const t of pinned)    tabsEl.appendChild(t.tabEl);
  for (const t of ungrouped) tabsEl.appendChild(t.tabEl);

  // Group tabs into buckets, preserving insertion order of groups
  const seenGroups = [];
  const buckets = new Map();
  for (const t of grouped) {
    if (!buckets.has(t.groupId)) {
      buckets.set(t.groupId, []);
      seenGroups.push(t.groupId);
    }
    buckets.get(t.groupId).push(t);
  }
  for (const gid of seenGroups) {
    const g = tabGroups.find(x => x.id === gid);
    if (g) tabsEl.appendChild(makeGroupChip(g));
    for (const t of buckets.get(gid)) tabsEl.appendChild(t.tabEl);
  }
  requestAnimationFrame(resizeTabs);
  renderVtabs();
}

function makeGroupChip(g) {
  const chip = document.createElement('div');
  chip.className = 'tab-group-chip';
  chip.style.setProperty('--group-color', g.solid || g.color || '#5f6368');
  chip.style.setProperty('--group-tint',  g.tint || `${g.solid || g.color || '#5f6368'}26`);
  chip.dataset.groupId = String(g.id);

  const dot = document.createElement('span');
  dot.className = 'tg-dot';
  chip.appendChild(dot);

  const name = document.createElement('span');
  name.className = 'tg-name';
  name.textContent = g.name || `Group ${g.id}`;
  name.spellcheck = false;
  chip.appendChild(name);

  // Click → open the group context menu (rename / recolor / ungroup / close).
  // ContentEditable rename mode is entered via the "Rename" action.
  chip.addEventListener('click', (e) => {
    if (name.isContentEditable) return;
    e.stopPropagation();
    openGroupContextMenu(g.id, e.clientX, e.clientY);
  });
  chip.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!name.isContentEditable) openGroupContextMenu(g.id, e.clientX, e.clientY);
  });
  return chip;
}

async function openGroupContextMenu(groupId, x = 0, y = 0) {
  const g = tabGroups.find(x => x.id === groupId);
  if (!g) return;
  const colorSubmenu = GROUP_COLORS.map((p, i) => ({
    id: `g-color-${i}`,
    label: p.name.charAt(0).toUpperCase() + p.name.slice(1),
    type: g.paletteName === p.name ? 'checkbox' : 'normal',
    checked: g.paletteName === p.name,
  }));
  const items = [
    { id: 'g-rename',  label: 'Rename group' },
    { label: 'Color',  submenu: colorSubmenu },
    { type: 'separator' },
    { id: 'g-ungroup', label: 'Ungroup' },
    { id: 'g-close',   label: 'Close all tabs in group' },
  ];
  const action = await showHtmlMenu(items, x, y);
  if (!action) return;
  if (action === 'g-rename') {
    renameGroupInline(g);
  } else if (action.startsWith('g-color-')) {
    const idx = parseInt(action.slice(8), 10);
    const p = GROUP_COLORS[idx];
    if (!p) return;
    g.solid = p.solid; g.tint = p.tint; g.color = p.solid; g.paletteName = p.name;
    for (const t of tabs.filter(t => t.groupId === g.id)) applyGroupStyle(t);
    renderTabStrip();
    scheduleSaveSession();
  } else if (action === 'g-ungroup') {
    for (const t of tabs.filter(t => t.groupId === g.id)) {
      t.groupId = null;
      applyGroupStyle(t);
    }
    tabGroups = tabGroups.filter(x => x.id !== g.id);
    renderTabStrip();
    scheduleSaveSession();
  } else if (action === 'g-close') {
    const toClose = tabs.filter(t => t.groupId === g.id).map(t => t.id);
    for (const id of toClose) closeTab(id);
  }
}

function renameGroupInline(g) {
  const chip = tabsEl.querySelector(`.tab-group-chip[data-group-id="${g.id}"]`);
  if (!chip) return;
  const nameEl = chip.querySelector('.tg-name');
  if (!nameEl) return;
  nameEl.contentEditable = 'true';
  nameEl.focus();
  const range = document.createRange();
  range.selectNodeContents(nameEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  const finish = (save) => {
    nameEl.contentEditable = 'false';
    if (save) {
      const t = nameEl.textContent.trim();
      g.name = t || `Group ${g.id}`;
      scheduleSaveSession();
    }
    nameEl.textContent = g.name;
  };
  nameEl.addEventListener('blur', () => finish(true), { once: true });
  nameEl.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Enter')  { e.preventDefault(); nameEl.removeEventListener('keydown', onKey); nameEl.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); nameEl.removeEventListener('keydown', onKey); finish(false); }
  });
}

function applyGroupStyle(tab) {
  const g = tab.groupId && tabGroups.find((x) => x.id === tab.groupId);
  if (g) {
    // Backward-compat: old saved sessions may have just `color: '#hex'`.
    const solid = g.solid || g.color || '#5f6368';
    const tint  = g.tint  || `${solid}26`; // ~15% alpha if no tint stored
    tab.tabEl.style.setProperty('--group-color', solid);
    tab.tabEl.style.setProperty('--group-tint',  tint);
    tab.tabEl.classList.add('grouped');
  } else {
    tab.tabEl.style.removeProperty('--group-color');
    tab.tabEl.style.removeProperty('--group-tint');
    tab.tabEl.classList.remove('grouped');
  }
}

function resizeTabs() {
  const scrollEl = document.getElementById('tabs-scroll');
  const newTabBtn = document.getElementById('new-tab');
  if (!scrollEl || !newTabBtn) return;
  const available = scrollEl.clientWidth - newTabBtn.offsetWidth - 12;
  if (available <= 0) return;
  const unpinned = tabs.filter(t => !t.pinned);
  if (!unpinned.length) return;
  const w = Math.min(240, Math.max(76, Math.floor(available / unpinned.length)));
  for (const t of unpinned) {
    if (t.tabEl) t.tabEl.style.flexBasis = w + 'px';
  }
}

function ensureNewGroupForTab(tab) {
  const id = nextGroupId++;
  const palette = GROUP_COLORS[(id - 1) % GROUP_COLORS.length];
  const g = {
    id,
    name: `Group ${id}`,
    color: palette.solid,  // legacy field for session persistence
    solid: palette.solid,
    tint:  palette.tint,
    paletteName: palette.name,
  };
  tabGroups.push(g);
  tab.groupId = g.id;
  applyGroupStyle(tab);
  return g;
}

function removeTabFromGroup(tab) {
  tab.groupId = null;
  applyGroupStyle(tab);
}

async function restoreSession(data) {
  if (!data?.tabs?.length) return false;
  tabGroups = Array.isArray(data.groups) ? data.groups : [];
  if (tabGroups.length) nextGroupId = Math.max(...tabGroups.map((g) => g.id), 0) + 1;
  const list = [...data.tabs].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  for (const spec of list) {
    const gid = spec.groupId && tabGroups.some((g) => g.id === spec.groupId) ? spec.groupId : null;
    const tab = createTab(spec.url || NEWTAB_URL, false, { pinned: !!spec.pinned, groupId: gid });
    if (spec.title) {
      tab.title = spec.title;
      const te = tab.tabEl.querySelector('.tab-title');
      if (te) { te.textContent = spec.title; te.title = spec.title; }
    }
    applyGroupStyle(tab);
  }
  enforcePinnedFirst();
  const idx = Math.min(Math.max(0, data.activeIndex | 0), tabs.length - 1);
  if (tabs[idx]) activateTab(tabs[idx].id);
  requestAnimationFrame(() => requestAnimationFrame(resizeTabs));
  return true;
}

function ensureDisclaimer() {
  if (settings?.disclaimerAccepted) return Promise.resolve();
  if (!setupOverlay) return Promise.resolve();

  document.body.classList.add('setup-mode');
  setupOverlay.removeAttribute('hidden');

  // Apply current dark setting so overlay matches any persisted preference
  document.body.classList.toggle('dark', !!settings?.darkMode);

  return new Promise((resolve) => {
    let selectedTheme = settings?.darkMode ? 'dark' : 'light';
    let selectedProfile = null;
    let hwaChoice = settings?.hardwareAcceleration === false ? 'off' : 'on';

    // Mark theme card selected
    document.querySelectorAll('.sw-theme-card').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.theme === selectedTheme);
    });
    // Mark HWA card selected
    document.querySelectorAll('.sw-choice-card[data-hwa]').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.hwa === hwaChoice);
    });

    // Directional, animated step transitions — the outgoing step plays a
    // quick exit, then the incoming step slides in and cascades its contents.
    const swSteps = [...document.querySelectorAll('.sw-step')];
    let swCurrent = 0;
    let swBusy = false;
    let swTimer = 0;

    // Progress dots are generated, so adding or removing steps needs no
    // hand-edited dot markup. Every step with a .sw-progress-dots container
    // gets one dot per dotted step, with its own position marked active.
    const dotSteps = swSteps.filter((s) => s.querySelector('.sw-progress-dots'));
    dotSteps.forEach((step, idx) => {
      const wrap = step.querySelector('.sw-progress-dots');
      wrap.innerHTML = '';
      for (let i = 0; i < dotSteps.length; i++) {
        const d = document.createElement('span');
        d.className = i === idx ? 'sw-dot active' : 'sw-dot';
        wrap.appendChild(d);
      }
    });

    function goStep(n) {
      if (n === swCurrent || swBusy) return;
      const from = swSteps[swCurrent];
      const to = swSteps[n];
      if (!from || !to) return;
      const back = n < swCurrent;
      swBusy = true;
      swCurrent = n;
      // Both cards move at once: the old one lifts away while the new one
      // slides in — a single continuous cross-slide.
      from.classList.toggle('sw-back', back);
      to.classList.toggle('sw-back', back);
      to.scrollTop = 0;
      from.classList.add('sw-exit');
      to.classList.add('active');
      clearTimeout(swTimer);
      swTimer = setTimeout(() => {
        // Only the outgoing card is cleaned up. Removing 'sw-back' from the
        // incoming card would swap its animation rule and re-trigger the
        // entrance (the bug on Back) — goStep re-toggles it next time.
        from.classList.remove('active', 'sw-exit', 'sw-back');
        swBusy = false;
      }, 470);
      // The "Setting up everything…" step runs a timed progress meter, then
      // advances itself to the final step.
      if (to.id === 'sw-step-setup') {
        runSetupProgress(() => goStep(n + 1));
      }
    }

    // Simple "Getting Privoo ready" screen — the dots animate on their own
    // via CSS; this just waits a moment, then advances to Done.
    function runSetupProgress(done) {
      setTimeout(done, 3000);
    }

    // ── Step 1: Branded EU intro — the Start button begins setup ──
    document.getElementById('sw-1-next').onclick = () => goStep(1);

    // ── Step 2: Terms — checkbox gates the "Agree & continue" button ──
    const termsCheck = document.getElementById('sw-terms-check');
    const termsNext  = document.getElementById('sw-2-next');
    if (termsCheck && termsNext) {
      termsCheck.addEventListener('change', () => {
        termsNext.disabled = !termsCheck.checked;
      });
    }
    document.getElementById('sw-2-back').onclick = () => goStep(0);
    termsNext.onclick = () => {
      if (!termsCheck?.checked) return;
      goStep(2);
    };

    // ── Step 3: Theme ──
    document.querySelectorAll('.sw-theme-card').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.sw-theme-card').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTheme = btn.dataset.theme;
        document.body.classList.toggle('dark', selectedTheme === 'dark');
      };
    });
    document.getElementById('sw-3-back').onclick = () => goStep(1);
    document.getElementById('sw-3-next').onclick = async () => {
      await saveBrowserSetting({ darkMode: selectedTheme === 'dark' });
      goStep(3);
    };

    // ── Step 4: Search engine ──
    let searchChoice = settings?.searchEngine || 'google';
    document.querySelectorAll('.sw-choice-card[data-engine]').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.engine === searchChoice);
      btn.onclick = () => {
        document.querySelectorAll('.sw-choice-card[data-engine]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        searchChoice = btn.dataset.engine;
      };
    });
    document.getElementById('sw-search-back').onclick = () => goStep(2);
    document.getElementById('sw-search-next').onclick = async () => {
      await saveBrowserSetting({ searchEngine: searchChoice });
      goStep(4);
    };

    // ── Step 5: Hardware acceleration ──
    document.querySelectorAll('.sw-choice-card[data-hwa]').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.sw-choice-card[data-hwa]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        hwaChoice = btn.dataset.hwa;
      };
    });
    document.getElementById('sw-4-back').onclick = () => goStep(3);
    document.getElementById('sw-4-next').onclick = async () => {
      await saveBrowserSetting({ hardwareAcceleration: hwaChoice === 'on' });
      goStep(5);
      loadImportProfiles();
    };

    // ── Step 5: Import ──
    async function loadImportProfiles() {
      const wrap = document.getElementById('sw-profiles-wrap');
      try {
        const profiles = await window.privoo.listBrowserProfiles();
        if (!profiles || !profiles.length) {
          wrap.innerHTML = '<p class="sw-no-browsers">No other browsers detected on this computer.</p>';
          document.getElementById('sw-5-import').disabled = true;
          return;
        }
        wrap.innerHTML = '';
        profiles.forEach(p => {
          const btn = document.createElement('button');
          btn.className = 'sw-profile-btn';
          const label = [p.browser, p.name].filter(Boolean).join(' — ');
          btn.textContent = label;
          btn.onclick = () => {
            document.querySelectorAll('.sw-profile-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedProfile = p;
            document.getElementById('sw-5-import').disabled = false;
          };
          wrap.appendChild(btn);
        });
      } catch {
        wrap.innerHTML = '<p class="sw-no-browsers">Could not detect installed browsers.</p>';
        document.getElementById('sw-5-import').disabled = true;
      }
    }

    document.getElementById('sw-5-back').onclick = () => goStep(4);
    document.getElementById('sw-5-skip').onclick = () => goStep(6);
    document.getElementById('sw-5-import').onclick = async () => {
      const msg = document.getElementById('sw-import-msg');
      const importBtn = document.getElementById('sw-5-import');
      importBtn.disabled = true;
      msg.textContent = 'Importing…';
      try {
        const result = await window.privoo.importBrowserData({
          profilePath: selectedProfile.path,
          bookmarks: document.getElementById('sw-chk-bookmarks').checked,
          history: document.getElementById('sw-chk-history').checked,
        });
        const bk = result.bookmarksAdded ?? result.bookmarks ?? 0;
        const hi = result.historyAdded  ?? result.history  ?? 0;
        msg.textContent = `Done — imported ${bk} bookmark${bk !== 1 ? 's' : ''} and ${hi} history item${hi !== 1 ? 's' : ''}.`;
        setTimeout(() => goStep(6), 1600);
      } catch {
        msg.textContent = 'Import failed. You can try again from Settings → Your data.';
        setTimeout(() => goStep(6), 2000);
      }
    };

    // ── Step 6: Finish ──
    document.getElementById('sw-finish').onclick = async () => {
      await saveBrowserSetting({ disclaimerAccepted: true });
      // Setup is done — let the window be resized again.
      window.privoo.setupFinished?.();
      // Reveal the browser, then lift the wizard away with a soft fade so the
      // hand-off feels deliberate rather than an abrupt cut.
      document.body.classList.remove('setup-mode');
      setupOverlay.classList.add('sw-closing');
      fireConfetti();
      setTimeout(() => {
        setupOverlay.setAttribute('hidden', '');
        setupOverlay.classList.remove('sw-closing');
      }, 300);
      resolve();
    };
  });
}

// ─── Confetti ───────────────────────────────────────────────────────────────
// Self-contained canvas burst — no deps. Spawns colourful particles from the
// bottom-centre that arc upward + outward with gravity, then removes the
// canvas once everything has fallen below the viewport. Used to celebrate
// finishing the setup wizard.
function fireConfetti() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width  = Math.round(canvas.clientWidth  * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
  };
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#8ab4f8', '#f48fb1', '#fdd663', '#81c995', '#a78bfa', '#fcad70', '#f28b82'];
  const W = () => canvas.width, H = () => canvas.height;

  const make = (originX) => ({
    x: originX,
    y: H() * 0.95,
    vx: (Math.random() - 0.5) * 18 * dpr,
    vy: -(Math.random() * 16 + 14) * dpr,
    g:  0.35 * dpr,
    size: (Math.random() * 6 + 4) * dpr,
    rot: Math.random() * Math.PI * 2,
    vrot: (Math.random() - 0.5) * 0.35,
    color: COLORS[(Math.random() * COLORS.length) | 0],
    shape: Math.random() < 0.5 ? 'rect' : 'circle',
    life: 0,
  });

  // Two bursts from left and right of centre for a fuller arc.
  const parts = [];
  for (let i = 0; i < 90; i++) parts.push(make(W() * 0.35));
  for (let i = 0; i < 90; i++) parts.push(make(W() * 0.65));

  let raf = 0;
  const step = () => {
    ctx.clearRect(0, 0, W(), H());
    let alive = 0;
    for (const p of parts) {
      p.vy += p.g;
      p.x  += p.vx;
      p.y  += p.vy;
      p.rot += p.vrot;
      p.life++;
      // Slight air drag so things don't fly forever.
      p.vx *= 0.995;
      if (p.y - p.size < H()) alive++;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.life / 220);
      if (p.shape === 'rect') {
        ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size / 1.5);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (alive > 0) {
      raf = requestAnimationFrame(step);
    } else {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.remove();
    }
  };
  raf = requestAnimationFrame(step);
}

async function saveBrowserSetting(patch) {
  const updated = await window.privoo.setSettings(patch);
  settings = updated;
  applyAppSettings();
  paintFeatures();
  return updated;
}

function searchUrl(q) {
  const key = settings?.searchEngine;
  // Custom search engine: settings.customSearchUrl is a template. Supports
  // "%s" substitution (Chrome-style) or, if absent, appends the query to
  // the end of the URL (suits "...?q=" templates). Falls back to Google
  // when the custom URL is blank or malformed.
  if (key === 'custom') {
    const raw = String(settings?.customSearchUrl || '').trim();
    if (/^https?:\/\//i.test(raw)) {
      const encoded = encodeURIComponent(q);
      return raw.includes('%s') ? raw.replace(/%s/g, encoded) : raw + encoded;
    }
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }
  const eng = searchEngines[key] || { url: 'https://www.google.com/search?q=' };
  return eng.url + encodeURIComponent(q);
}

function toUrl(input) {
  const t = input.trim();
  if (!t) return NEWTAB_URL;
  // Only treat http:// as a URL if there's a valid hostname after it
  // e.g. "http:// meaning" or "http://" alone should be searched, not navigated
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      if (u.hostname) return t; // valid URL with a hostname
    } catch {}
    // malformed or no hostname — treat as a search query
    return searchUrl(t);
  }
  if (/^(privoo:\/\/|about:|view-source:|file:\/\/)/i.test(t)) return t;
  const host = !/\s/.test(t) && (/\.[a-z]{2,}(:\d+)?(\/|\?|#|$)/i.test(t) || /^localhost(:\d+)?(\/|$)/i.test(t));
  return host ? 'https://' + t : searchUrl(t);
}

function displayUrl(url) {
  if (!url || url.startsWith('privoo://')) return '';
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return url.slice(8); // strip https://
  } catch { /* not a valid URL, show as-is */ }
  return url;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
const getTab    = (id) => tabs.find((t) => t.id === id);
const activeTab = ()   => getTab(activeId);

// In an incognito window the default "new tab" is the dedicated incognito
// landing page, not the normal NTP.
function defaultNewTabUrl() {
  return window.privoo?.incognitoPartition ? 'privoo://incognito/' : NEWTAB_URL;
}

function createTab(url = defaultNewTabUrl(), activate = true, opts = {}) {
  const id = ++tabSeq;

  // Redirect HTTP URLs to the upgrading splash (or insecure warning) before the webview loads them
  if (isBlockedHttp(url)) {
    const showNotice = settings?.httpsUpgradeShowNotice !== false;
    url = showNotice
      ? `privoo://upgrading/?url=${encodeURIComponent(url)}`
      : `privoo://insecure/?url=${encodeURIComponent(url)}`;
  }

  const wv = document.createElement('webview');
  wv.classList.add('inactive');
  wv.setAttribute('preload', window.privoo.webviewPreloadUrl);
  // In an incognito window every tab must run inside the private,
  // non-persistent partition — otherwise the webviews would quietly use
  // the default persistent session and "incognito" would be a lie. The
  // partition is read synchronously from the preload so even the very
  // first tab created at boot gets it.
  const _incoPart = window.__privooIncognitoPartition || window.privoo.incognitoPartition;
  if (_incoPart) {
    wv.setAttribute('partition', _incoPart);
  }
  wv.setAttribute('src', url);
  wv.setAttribute('allowpopups', 'true');
  viewsEl.appendChild(wv);

  const tabEl = document.createElement('div');
  // tab-no-anim: the new tab snaps straight to its final width with no
  // entrance animation. Cleared after two frames so later width changes
  // (closing tabs, window resize) still glide.
  tabEl.className = 'tab tab-no-anim';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => tabEl.classList.remove('tab-no-anim')));
  tabEl.draggable = true;
  tabEl.innerHTML =
    `<span class="favicon tab-fav"></span>` +
    `<span class="tab-title">New tab</span>` +
    `<span class="tab-audio-ind" title="Audio playing — click to mute"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></span>` +
    `<span class="tab-close" title="Close tab"><svg viewBox="0 0 14 14" width="10" height="10"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></span>`;
  tabsEl.appendChild(tabEl);
  const tabsScrollEl = document.getElementById('tabs-scroll');
  if (tabsScrollEl) requestAnimationFrame(() => { tabsScrollEl.scrollLeft = tabsScrollEl.scrollWidth; });

  const tab = {
    id,
    url,
    title: 'New tab',
    wv,
    tabEl,
    pinned: !!opts.pinned,
    groupId: (opts.groupId && tabGroups.some((g) => g.id === opts.groupId)) ? opts.groupId : null,
    isPlayingAudio: false,
    isMuted: false,
    volume: 1,
    faviconUrl: null,
    abortController: new AbortController(),
  };
  tabs.push(tab);

  if (tab.pinned) tabEl.classList.add('pinned');
  applyGroupStyle(tab);

  tabEl.addEventListener('mousedown', (e) => {
    if (e.button === 0 && !e.target.closest('.tab-close')) activateTab(id);
  });
  tabEl.addEventListener('auxclick', (e) => { if (e.button === 1 && !tab.pinned) closeTab(id); });
  tabEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openTabContextMenu(e.clientX, e.clientY, id);
  });
  tabEl.querySelector('.tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });
  tabEl.querySelector('.tab-audio-ind').addEventListener('click', (e) => {
    e.stopPropagation();
    tab.isMuted = !tab.isMuted;
    tab.wv.setAudioMuted(tab.isMuted);
    updateTabAudioIndicator(tab);
    updateAudioButton();
  });
  wireDrag(tab);
  wireWebview(tab);
  enforcePinnedFirst();

  // Network pages: hold a solid theme-colored fill until did-stop-loading so
  // the user never sees the blank empty webview frame.
  // privoo:// pages (new tab, settings): use opacity:0 until dom-ready
  // instead of a solid fill — they load in <50 ms and this avoids flashing
  // an opaque panel over a transparent window.
  if (!url.startsWith('privoo://')) {
    wv.classList.add('first-paint');
  } else {
    wv.classList.add('ntp-loading');
    let _ntpDone = false;
    const clearNtpLoading = () => {
      if (_ntpDone) return;
      _ntpDone = true;
      requestAnimationFrame(() => wv.classList.remove('ntp-loading'));
    };
    wv.addEventListener('dom-ready', clearNtpLoading, { once: true });
    setTimeout(clearNtpLoading, 600);
  }
  let _fpCleared = false;
  const clearFirstPaint = () => {
    if (_fpCleared) return;
    _fpCleared = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wv.classList.remove('first-paint');
    }));
  };
  wv.addEventListener('did-stop-loading', clearFirstPaint, { once: true });
  // Fallback: some long-loading pages never settle quickly — drop the mask
  // after 1.2s so the user isn't staring at a blank fill forever.
  setTimeout(clearFirstPaint, 1200);

  if (activate) activateTab(id);
  else resizeTabs();
  scheduleSaveSession();
  return tab;
}

function activateTab(id) {
  const tab = getTab(id);
  if (!tab) return;
  // In Split View, activating one of the two pane tabs keeps the split and
  // just moves "focus" to that pane; activating any other tab ends it.
  if (typeof splitExitOnActivate === 'function') splitExitOnActivate(id);
  activeId = id;
  for (const t of tabs) {
    const on = t.id === id;
    t.tabEl.classList.toggle('active', on);
    t.wv.classList.toggle('inactive', !on);
  }
  // The loop above hid every non-active webview — if a split is still up,
  // re-apply its layout so both panes stay visible and positioned.
  if (typeof isSplit === 'function' && isSplit()) layoutSplit();
  tab.tabEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  syncToolbar();
  updateAudioButton();
  // Re-evaluate the welcome / leaving-Privoo banner for the new active tab
  // so it doesn't stick around from the previous one.
  if (typeof maybeShowOverlayBanner === 'function') maybeShowOverlayBanner(tab.url);
  requestAnimationFrame(resizeTabs);
  scheduleSaveSession();
  renderVtabs();
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  // Closing either Split View pane tears the split down cleanly.
  if (typeof splitExitOnClose === 'function') splitExitOnClose(id);
  const [tab] = tabs.splice(idx, 1);
  if (tab.url && !tab.url.startsWith('privoo://')) {
    closedStack.push(tab.url);
    if (closedStack.length > 30) closedStack.shift();
  }
  tab.abortController.abort();
  try { tab.wv.stop(); } catch (_) {}
  // Animate the tab's strip slot collapsing shut, then drop the element —
  // neighbouring tabs glide over to fill the gap.
  const closingEl = tab.tabEl;
  closingEl.classList.add('tab-closing');
  setTimeout(() => closingEl.remove(), 240);
  if (tabs.length === 0) {
    try { tab.wv.remove(); } catch (_) {}
    createTab();
    return;
  }
  if (activeId === id) activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
  else resizeTabs();
  try { tab.wv.remove(); } catch (_) {}
  scheduleSaveSession();
}

// ─── Tab drag-to-reorder ─────────────────────────────────────────────────────
function wireDrag(tab) {
  const { tabEl } = tab;
  tabEl.addEventListener('dragstart', () => tabEl.classList.add('dragging'));
  tabEl.addEventListener('dragend',   () => {
    tabEl.classList.remove('dragging');
    const order = [...tabsEl.children].map((el) => tabs.find((t) => t.tabEl === el)).filter(Boolean);
    const pinned = order.filter((t) => t.pinned);
    const rest = order.filter((t) => !t.pinned);
    tabs = [...pinned, ...rest];
    renderTabStrip();
    scheduleSaveSession();
  });
}
tabsEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  const dragging = tabsEl.querySelector('.tab.dragging');
  if (!dragging) return;
  const after = [...tabsEl.querySelectorAll('.tab:not(.dragging)')].find((el) => {
    return e.clientX < el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2;
  });
  after ? tabsEl.insertBefore(dragging, after) : tabsEl.appendChild(dragging);
});

// ─── Custom HTML context menu ────────────────────────────────────────────────
let _ctxResolve = null;
let _ctxFlyout  = null;

function _closeCtxMenu(chosen = null) {
  if (_ctxFlyout) { _ctxFlyout.remove(); _ctxFlyout = null; }
  ctxBackdrop?.classList.add('hidden');
  tabContextMenu?.classList.add('hidden');
  wvContextMenu?.classList.add('hidden');
  const r = _ctxResolve; _ctxResolve = null;
  if (r) r(chosen);
}

function _buildCtxRows(container, items) {
  container.innerHTML = '';
  for (const item of items) {
    if (item.type === 'separator') {
      const s = document.createElement('div');
      s.className = 'ctx-sep';
      container.appendChild(s);
      continue;
    }
    const row = document.createElement('div');
    const off = item.enabled === false;
    row.className = 'ctx-item' + (off ? ' disabled' : '');
    const lbl = document.createElement('span');
    lbl.className = 'ctx-label';
    lbl.textContent = item.label;
    row.appendChild(lbl);
    if (item.submenu) {
      const arr = document.createElement('span');
      arr.className = 'ctx-accel';
      arr.textContent = '▸';
      row.appendChild(arr);
      const subItems = item.submenu;
      row.addEventListener('mouseenter', function () {
        if (_ctxFlyout) { _ctxFlyout.remove(); _ctxFlyout = null; }
        const fly = document.createElement('div');
        fly.className = 'context-menu';
        _buildCtxRows(fly, subItems);
        document.body.appendChild(fly);
        _ctxFlyout = fly;
        const rect = this.getBoundingClientRect();
        fly.style.left = '0'; fly.style.top = '0';
        const fw = fly.offsetWidth, fh = fly.offsetHeight;
        const vw = window.innerWidth, vh = window.innerHeight;
        fly.style.left = `${Math.min(rect.right + 2, vw - fw - 4)}px`;
        fly.style.top  = `${Math.min(rect.top,      vh - fh - 4)}px`;
        fly.addEventListener('mousedown', (e) => {
          const r = e.target.closest('.ctx-item');
          if (!r || r.classList.contains('disabled') || !r.dataset.menuId) return;
          e.preventDefault(); e.stopPropagation();
          _closeCtxMenu(r.dataset.menuId);
        }, true);
      });
      row.addEventListener('mouseleave', function (e) {
        if (_ctxFlyout && !_ctxFlyout.contains(e.relatedTarget)) {
          _ctxFlyout.remove(); _ctxFlyout = null;
        }
      });
    } else if (!off && item.id) {
      row.dataset.menuId = item.id;
    }
    container.appendChild(row);
  }
}

function showHtmlMenu(items, x, y, el) {
  _closeCtxMenu(null);
  const target = el || wvContextMenu;
  if (!target) return Promise.resolve(null);
  return new Promise((resolve) => {
    _ctxResolve = resolve;
    ctxBackdrop?.classList.remove('hidden');
    _buildCtxRows(target, items);
    target.style.left = '0';
    target.style.top  = '0';
    target.classList.remove('hidden');
    const mw = target.offsetWidth, mh = target.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    target.style.left = `${Math.min(x, vw - mw - 4)}px`;
    target.style.top  = `${Math.min(y, vh - mh - 4)}px`;
  });
}

// Backdrop click dismisses any open HTML menu
ctxBackdrop?.addEventListener('mousedown', (e) => { e.preventDefault(); _closeCtxMenu(null); });

// Delegated handler for tab context menu
tabContextMenu?.addEventListener('mousedown', (e) => {
  const row = e.target.closest('.ctx-item');
  if (!row || row.classList.contains('disabled') || !row.dataset.menuId) return;
  e.preventDefault(); e.stopPropagation();
  _closeCtxMenu(row.dataset.menuId);
}, true);

// Delegated handler for webview context menu
wvContextMenu?.addEventListener('mousedown', (e) => {
  const row = e.target.closest('.ctx-item');
  if (!row || row.classList.contains('disabled') || !row.dataset.menuId) return;
  e.preventDefault(); e.stopPropagation();
  _closeCtxMenu(row.dataset.menuId);
}, true);

function hideTabContextMenu() {
  ctxTabId = null;
  _closeCtxMenu(null);
}

async function openTabContextMenu(x, y, tabId) {
  ctxTabId = tabId;
  const tab = getTab(tabId);
  if (!tab) return;
  closePopovers();

  // Build the "Tab group" submenu — Chrome-style nested list of existing
  // groups, plus "New group" and (when grouped) "Remove from group".
  const groupSubmenu = [{ id: 'g-new', label: 'New group' }];
  const otherGroups = tabGroups.filter(g => g.id !== tab.groupId);
  if (otherGroups.length) {
    groupSubmenu.push({ type: 'separator' });
    for (const g of otherGroups) {
      groupSubmenu.push({ id: `g-add-${g.id}`, label: `Add to "${g.name}"` });
    }
  }
  if (tab.groupId) {
    groupSubmenu.push({ type: 'separator' });
    groupSubmenu.push({ id: 'g-leave', label: 'Remove from group' });
  }

  const items = [
    { id: 'pin',          label: tab.pinned ? 'Unpin tab' : 'Pin tab' },
    { id: 'mute',         label: tab.isMuted ? 'Unmute tab' : 'Mute tab' },
    { id: 'close',        label: 'Close tab' },
    { id: 'close-others', label: 'Close other tabs', enabled: tabs.length > 1 },
    { type: 'separator' },
    { label: 'Tab group',   submenu: groupSubmenu },
  ];

  const action = await showHtmlMenu(items, x, y, tabContextMenu);
  if (!action) return;

  switch (action) {
    case 'pin':
      tab.pinned = !tab.pinned;
      tab.tabEl.classList.toggle('pinned', tab.pinned);
      enforcePinnedFirst();
      requestAnimationFrame(resizeTabs);
      scheduleSaveSession();
      break;
    case 'mute':
      tab.isMuted = !tab.isMuted;
      tab.wv.setAudioMuted(tab.isMuted);
      updateTabAudioIndicator(tab);
      updateAudioButton();
      break;
    case 'close':
      closeTab(tabId);
      break;
    case 'close-others':
      for (const t of [...tabs]) if (t.id !== tabId) closeTab(t.id);
      break;
    default:
      if (action === 'g-new') {
        const g = ensureNewGroupForTab(tab);
        renderTabStrip();
        scheduleSaveSession();
        // Pop the freshly-rendered chip into rename mode right away
        requestAnimationFrame(() => renameGroupInline(g));
      } else if (action === 'g-leave') {
        removeTabFromGroup(tab);
        renderTabStrip();
        scheduleSaveSession();
      } else if (action.startsWith('g-add-')) {
        const gid = parseInt(action.slice(6), 10);
        if (tabGroups.some(g => g.id === gid)) {
          tab.groupId = gid;
          applyGroupStyle(tab);
          renderTabStrip();
          scheduleSaveSession();
        }
      }
  }
}

// ─── Webview wiring ──────────────────────────────────────────────────────────
function wireWebview(tab) {
  const { wv, tabEl } = tab;
  const titleEl   = tabEl.querySelector('.tab-title');
  const faviconEl = tabEl.querySelector('.favicon');
  const { signal } = tab.abortController;

  wv.addEventListener('dom-ready', () => {
    tab.ready = true;
    applyInjections(wv);
  }, { signal });

  wv.addEventListener('page-title-updated', (e) => {
    tab.title = e.title || tab.url;
    if (titleEl) { titleEl.textContent = tab.title; titleEl.title = tab.title; }
    if (tab.id === activeId) updateBookmarkButton();
    renderVtabs();
  }, { signal });

  wv.addEventListener('page-favicon-updated', (e) => {
    const icon = e.favicons?.[0];
    if (icon) applyTabFavicon(tab, icon);
    renderVtabs();
  }, { signal });

  const onNav = () => {
    tab.url = wv.getURL();
    if (tab.url.startsWith('privoo://')) {
      if (faviconEl) { faviconEl.style.backgroundImage = 'url("privoo://newtab/logo.png")'; faviconEl.classList.remove('spin'); }
      if (tab.url === NEWTAB_URL && titleEl) titleEl.textContent = tab.title = 'New tab';
    }
    if (tab.id === activeId) {
      syncToolbar();
      maybeShowOverlayBanner(tab.url);
    }
    recordHistory(tab);
  };
  wv.addEventListener('did-navigate',         onNav, { signal });
  wv.addEventListener('did-navigate-in-page', onNav, { signal });

  wv.addEventListener('did-start-loading', () => {
    faviconEl.classList.add('spin');
    if (tab.id === activeId) {
      reloadBtn.innerHTML = STOP_ICON;
      // Suggestion dropdown should never linger over a loading page.
      hideSuggestions();
      omnibox.blur();
    }
  }, { signal });
  wv.addEventListener('did-stop-loading', () => {
    faviconEl.classList.remove('spin');
    if (!tab.faviconUrl && !tab.url?.startsWith('privoo://') && !tab.url?.startsWith('about:')) {
      const fb = faviconFallbackForUrl(tab.url);
      if (fb) applyTabFavicon(tab, fb);
      else {
        faviconEl.style.backgroundImage = DEFAULT_FAVICON;
      }
    }
    if (tab.id === activeId) {
      reloadBtn.innerHTML = RELOAD_ICON;
      syncToolbar();
      // Banners (welcome / leaving-Privoo) want to show once the page has
      // actually rendered, not on did-navigate when the URL bar changes but
      // nothing's visible yet.
      maybeShowOverlayBanner(tab.url);
    }
  }, { signal });

  wv.addEventListener('did-finish-load', () => {
    tab.everLoaded = true;
    applyInjections(wv);
    if (tab === activeTab()) refreshPageShield(tab);
  }, { signal });

  wv.addEventListener('did-stop-loading', () => {
    if (tab === activeTab()) refreshPageShield(tab);
  }, { signal });

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) return;   // -3 = ERR_ABORTED (navigation cancelled, not a real failure)
    if (!e.isMainFrame) return;       // subframe failures (ads, iframes) — ignore
    const failedUrl = e.validatedURL || '';
    // Don't replace our own internal pages with the error page
    if (failedUrl.startsWith('privoo://')) return;

    // Download-only tab: a fresh tab that's never rendered anything and just
    // failed with ERR_FAILED/ERR_ABORTED is almost certainly a window.open()
    // that resolved to a Content-Disposition: attachment. The download
    // already kicked off via the session's will-download handler — just
    // close the empty tab instead of showing the error page.
    if (!tab.everLoaded && (e.errorCode === -2 || e.errorCode === -3)) {
      closeTab(tab.id);
      return;
    }

    titleEl.textContent = tab.title = 'Nothing here';
    const code = e.errorDescription || '';
    const params = new URLSearchParams();
    if (failedUrl) params.set('url', failedUrl);
    if (code)      params.set('code', code);
    wv.loadURL(`privoo://error/?${params.toString()}`).catch(() => {});
  }, { signal });

  wv.addEventListener('context-menu', async (e) => {
    e.preventDefault();
    // Position the host context menu at the real cursor. Two sources:
    //  1. getCursorPos() from main — true OS cursor minus window content
    //     bounds. Should always be right but Windows DPI scaling has
    //     historically had edge cases.
    //  2. e.params.x/y — the guest's compositor coords. On Windows HiDPI
    //     these come back in physical pixels, so divide by devicePixelRatio
    //     to get CSS pixels.
    // Use source 1, then fall back to source 2 if the result lands outside
    // the viewport (a sign that DPI math went wrong).
    let vx = 0, vy = 0;
    let usable = false;
    try {
      const c = await window.privoo.getCursorPos();
      if (c && c.x >= 0 && c.y >= 0 && c.x <= window.innerWidth && c.y <= window.innerHeight) {
        vx = c.x; vy = c.y; usable = true;
      }
    } catch {}
    if (!usable) {
      const rect = wv.getBoundingClientRect();
      const dpr  = window.devicePixelRatio || 1;
      vx = rect.left + (e.params?.x || 0) / dpr;
      vy = rect.top  + (e.params?.y || 0) / dpr;
    }
    showWvContextMenu(tab, e.params || {}, vx, vy);
  }, { signal });

  wv.addEventListener('media-started-playing', () => {
    tab.isPlayingAudio = true;
    updateTabAudioIndicator(tab);
    updateAudioButton();
  }, { signal });
  wv.addEventListener('media-paused', () => {
    tab.isPlayingAudio = false;
    updateTabAudioIndicator(tab);
    updateAudioButton();
  }, { signal });

  wv.addEventListener('ipc-message', (e) => {
    if (e.channel === 'guest-pointer') {
      if (tab.id === activeId) closePopovers();
      return;
    }
    if (e.channel === 'google-auth-done') {
      try { tab.wv.reload(); } catch { /* ignore */ }
      return;
    }
    if (e.channel === 'password-request-fill') {
      void handlePasswordFillRequest(tab, e.args?.[0] || {});
      return;
    }
    if (e.channel === 'password-offer-save') {
      showPasswordSaveOffer(tab, e.args?.[0] || {});
      return;
    }
    if (e.channel === 'open-customize-panel') {
      openCustomizePanel();
      return;
    }
    // Route NTP searches / internal navigations back to THIS webview — vital
    // for Split View, where typing in the right pane's search must NOT
    // navigate the left (active) pane.
    if (e.channel === 'navigate')        navigate(String(e.args[0] || ''), false, tab);
    else if (e.channel === 'http-navigate') navigate(String(e.args[0] || ''), true,  tab);
    else if (e.channel === 'open-tab')   createTab(toUrl(String(e.args[0] || '')));
  }, { signal });
}

// Hosts where our anti-fingerprinting / force-dark hijinks break the site
// (Bedrock images not loading because of canvas spoofing; Sparx text turning
// white because force-dark inverts colors that are already dark). For these
// we run minimal injections only.
function isSiteCompatibilityHost(host) {
  if (!host) return false;
  const h = String(host).toLowerCase();
  return (
    h.endsWith('bedrocklearning.org')   || h === 'bedrocklearning.org' ||
    h.endsWith('bedrocklearning.co.uk') || h === 'bedrocklearning.co.uk' ||
    h.endsWith('bedrocklearning.com')   || h === 'bedrocklearning.com' ||
    h.endsWith('sparxmaths.com')        || h === 'sparxmaths.com' ||
    h.endsWith('sparxmaths.uk')         || h === 'sparxmaths.uk' ||
    h.endsWith('sparx-learning.com')    || h === 'sparx-learning.com' ||
    // Google domains — canvas farbling + other anti-fingerprint tweaks make
    // Google flag Privoo as a bot and bury the user in reCAPTCHAs. Treat
    // Google as a compat host so its pages get the minimal-interference path.
    h === 'google.com'                  || h.endsWith('.google.com')
  );
}

function applyInjections(wv) {
  const url = wv.getURL();
  if (!url || url.startsWith('privoo://') || url.startsWith('about:')) return;
  let compatMode = false;
  try { compatMode = isSiteCompatibilityHost(new URL(url).hostname); } catch {}
  // Canvas farbling messes with image/text rendering on some education sites
  // (Bedrock's question images come out blank; Sparx's video titles become
  // invisible). Skip on the compat list.
  if (settings?.canvasSpoofing !== false && !compatMode) {
    wv.executeJavaScript(FINGERPRINT_JS).catch(() => {});
  }
  // Force Dark Mode. The script is idempotent — passing `false` (or running
  // it on a compat site) clears any prior invert, so toggling the setting off
  // takes effect immediately without a reload. Compat sites (Sparx, Bedrock)
  // are never inverted: their own dark UI would turn text white-on-white.
  wv.executeJavaScript(
    forceDarkScript(!!settings?.forceDarkMode && !compatMode)
  ).catch(() => {});
  if (settings?.videoPopOut) {
    wv.executeJavaScript(VIDEO_POPOUT_JS).catch(() => {});
  }
  const geo = geoCoordsFromSettings(settings);
  if (geo) {
    wv.executeJavaScript(geolocationOverrideScript(geo[0], geo[1])).catch(() => {});
  }
  if (settings?.passwordManagerEnabled !== false && window.privoo?.passwordAutofillScript) {
    wv.executeJavaScript(window.privoo.passwordAutofillScript).catch(() => {});
  }
  if (settings?.preferPasswordLogin !== false && window.privoo?.googlePasswordPreferScript) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes('google.com') || host.includes('accounts.google')) {
        wv.executeJavaScript(window.privoo.googlePasswordPreferScript).catch(() => {});
      }
    } catch { /* ignore */ }
  }
}

let pendingPasswordSave = null;
const passwordSaveBar = document.getElementById('password-save-bar');
const passwordSaveText = document.getElementById('password-save-text');
const passwordSaveBtn = document.getElementById('password-save-btn');
const passwordSaveNever = document.getElementById('password-save-never');

async function handlePasswordFillRequest(tab, _payload) {
  if (!window.privoo?.passwordsGetForUrl || settings?.passwordManagerEnabled === false) return;
  // SECURITY: always look up credentials against the *real* current tab URL.
  // Trusting payload.url from the guest would let a malicious page request a
  // fill for victim.com and harvest those credentials via postMessage.
  let url = '';
  try { url = tab?.wv?.getURL?.() || tab?.url || ''; } catch { url = tab?.url || ''; }
  if (!url || url.startsWith('privoo://') || url.startsWith('about:')) return;
  // Also require an https:// origin for autofill — never fill into plain
  // http, even if we have a saved credential for that origin.
  if (!/^https:\/\//i.test(url)) return;

  let entries = [];
  try {
    entries = await window.privoo.passwordsGetForUrl(url);
  } catch { return; }
  if (!entries?.length) return;
  const entry = entries[0];
  // Re-check the URL hasn't navigated away during the async hop. Belt and
  // braces — passwordsGetForUrl already scopes to the URL we passed.
  let nowUrl = '';
  try { nowUrl = tab?.wv?.getURL?.() || ''; } catch {}
  if (nowUrl && nowUrl !== url) return;

  const json = JSON.stringify({ username: entry.username, password: entry.password });
  tab.wv.executeJavaScript(
    `window.postMessage({ __privoo_pw_fill: true, entry: ${json} }, '*');`
  ).catch(() => {});
}

function showPasswordSaveOffer(tab, payload) {
  if (!passwordSaveBar || settings?.passwordManagerEnabled === false) return;
  // SECURITY: derive origin from the actual tab URL, NOT from payload.origin.
  // A guest page could otherwise lie and offer to save credentials for a
  // different site, tricking the user into pinning attacker creds to a bank.
  let origin = '';
  try { origin = new URL(tab?.wv?.getURL?.() || tab?.url || '').origin; } catch {}
  if (!origin || !origin.startsWith('https://')) return;

  const username = String(payload?.username || '');
  const password = String(payload?.password || '');
  if (!password) return;
  pendingPasswordSave = { origin, username, password, tabId: tab.id };
  if (passwordSaveText) {
    // Show the host part of the URL so the user sees what they're saving for.
    let host = origin;
    try { host = new URL(origin).hostname; } catch {}
    passwordSaveText.textContent = username
      ? `Save password for ${username} on ${host}?`
      : `Save password for ${host}?`;
  }
  passwordSaveBar.classList.remove('hidden');
}

function hidePasswordSaveBar() {
  passwordSaveBar?.classList.add('hidden');
  pendingPasswordSave = null;
}

passwordSaveBtn?.addEventListener('click', async () => {
  if (!pendingPasswordSave || !window.privoo?.passwordsSave) return;
  try {
    await window.privoo.passwordsSave({
      origin: pendingPasswordSave.origin,
      username: pendingPasswordSave.username,
      password: pendingPasswordSave.password,
    });
  } catch { /* ignore */ }
  hidePasswordSaveBar();
});

passwordSaveNever?.addEventListener('click', () => hidePasswordSaveBar());

function recordHistory(tab) {
  // Incognito windows never write to history — that's the whole point.
  if (window.privoo?.incognitoPartition) return;
  const url = tab.url;
  if (!url || url.startsWith('privoo://') || url.startsWith('about:')) return;
  window.privoo.addHistory({ url, title: tab.title || url }).catch?.(() => {});
}

// ─── Toolbar sync ────────────────────────────────────────────────────────────
function syncToolbar() {
  const tab = activeTab();
  if (!tab) return;
  const wv = tab.wv;

  if (document.activeElement !== omnibox) omnibox.value = displayUrl(tab.url);

  const isInternal = tab.url?.startsWith('privoo://');
  const isSecure   = tab.url?.startsWith('https://') || isInternal;
  const isHttp     = tab.url?.startsWith('http://') && !isInternal;

  siteIcon.className = 'site-icon ' + (isInternal ? 'internal' : isSecure ? 'secure' : 'insecure');
  siteIcon.title = isInternal ? 'Privoo internal page' : isSecure ? 'Connection is secure' : 'Connection is not secure';
  updateSiteInfoPopover(tab.url, isInternal, isSecure, isHttp);
  refreshPageShield(tab);

  try {
    backBtn.disabled    = !wv.canGoBack();
    forwardBtn.disabled = !wv.canGoForward();
  } catch {
    backBtn.disabled = forwardBtn.disabled = true;
  }
  updateBookmarkButton();
}

function isBlockedHttp(url) {
  if (!settings?.httpsUpgrade) return false;
  if (!url.startsWith('http://')) return false;
  try {
    const h = new URL(url).hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) return false;
  } catch { return false; }
  return true;
}

function isBlockedAdult(url) {
  if (!settings?.blockAdultSites) return false;
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (!h || h === 'localhost') return false;
    // The actual domain check happens in main.js via will-navigate.
    // This renderer-side check is a fast pre-flight using a small known list
    // so the blocked page shows immediately on typed navigation too.
    // Main process will catch anything this misses.
    return false; // rely on main process will-navigate for accuracy
  } catch { return false; }
}

function navigate(input, bypassHttpCheck = false, targetTab) {
  // targetTab lets internal pages (NTP search) navigate the webview that
  // sent the request rather than the active tab — so a search submitted in
  // the right split pane lands in the right pane, not the focused one.
  const tab = targetTab || activeTab();
  if (!tab) return;
  hideSuggestions();
  const url = toUrl(input);
  if (!bypassHttpCheck && isBlockedHttp(url)) {
    // Show upgrading splash if the notice is enabled, otherwise go straight to insecure warning
    const showNotice = settings?.httpsUpgradeShowNotice !== false;
    const dest = showNotice
      ? `privoo://upgrading/?url=${encodeURIComponent(url)}`
      : `privoo://insecure/?url=${encodeURIComponent(url)}`;
    tab.wv.loadURL(dest).catch(() => {});
    omnibox.blur();
    return;
  }
  tab.wv.loadURL(url).catch(() => tab.wv.setAttribute('src', url));
  omnibox.blur();
}

// ─── Suggestions ─────────────────────────────────────────────────────────────
let suggestTimer = null;
// Monotonic generation counter. Bumped on every hide/Enter/blur so that a
// suggestion fetch in flight when the user navigates can't render its
// results on top of the new page.
let _sugGen = 0;

function debounce(fn, ms) {
  return (...args) => { clearTimeout(suggestTimer); suggestTimer = setTimeout(() => fn(...args), ms); };
}

const triggerSuggest = debounce(async (q) => {
  if (!q.trim() || q.startsWith('privoo://')) { hideSuggestions(); return; }
  const myGen = _sugGen;

  // History matches (local, fast)
  const hist = await window.privoo.historyAutocomplete(q);
  if (myGen !== _sugGen) return;

  // Search suggestions (remote, proxied)
  let remote = [];
  if (settings?.searchSuggestions !== false) {
    remote = await window.privoo.getSuggestions(q, settings?.searchEngine);
  }
  if (myGen !== _sugGen) return;

  // Also bail if the omnibox isn't focused or the user has moved past this
  // query — covers the "typed, navigated, suggestion came back" race.
  if (document.activeElement !== omnibox) return;
  if (omnibox.value !== q) return;

  const items = [
    ...hist.map((h) => ({ text: h.url, label: h.title || h.url, type: 'history' })),
    ...remote.map((r) => ({ text: r.text, label: r.text, type: 'search' })),
  ];
  renderSuggestions(items);
}, 180);

const SUG_SEARCH_SVG = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>`;
const SUG_CLOCK_SVG  = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M13 3a9 9 0 1 0 2.8 17.5l-1.4-1.4A7 7 0 1 1 19 12h-3l4 4-4 4v-3a9 9 0 0 0-3-17z"/></svg>`;

function renderSuggestions(items) {
  if (!items.length) { hideSuggestions(); return; }
  sugItems = items;
  sugIndex = -1;
  suggestEl.innerHTML = '';

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const el = document.createElement('div');
    el.className = 'sug-item';
    el.dataset.idx = i;

    // History rows get a real favicon (DuckDuckGo's ip3 proxy works for any
    // host without us having to fetch the page first). Search rows keep the
    // magnifying glass. Build the body first, then drop in the icon as a
    // real DOM node so the onerror handler can be a function reference —
    // the previous inline onerror embedded an SVG whose double quotes broke
    // out of the attribute string, leaving the broken-image glyph behind.
    el.innerHTML =
      `<span class="sug-icon"></span>` +
      `<div class="sug-body">` +
        `<div class="sug-title">${esc(it.label)}</div>` +
        (it.type === 'history' && it.text !== it.label ? `<div class="sug-url">${esc(it.text)}</div>` : '') +
      `</div>`;

    const iconSlot = el.querySelector('.sug-icon');
    if (it.type === 'history') {
      const fav = faviconFallbackForUrl(it.text);
      if (fav) {
        const img = document.createElement('img');
        img.src = fav;
        img.width = 16; img.height = 16; img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { iconSlot.innerHTML = SUG_CLOCK_SVG; }, { once: true });
        iconSlot.appendChild(img);
      } else {
        iconSlot.innerHTML = SUG_CLOCK_SVG;
      }
    } else {
      iconSlot.innerHTML = SUG_SEARCH_SVG;
    }

    el.addEventListener('mousedown', (e) => { e.preventDefault(); navigate(it.text); });
    suggestEl.appendChild(el);
  }

  suggestEl.classList.remove('hidden');
}

function highlightSug(idx) {
  sugIndex = idx;
  suggestEl.querySelectorAll('.sug-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  if (idx >= 0 && sugItems[idx]) omnibox.value = sugItems[idx].text;
}

function hideSuggestions() {
  clearTimeout(suggestTimer);
  _sugGen++;
  suggestEl.classList.add('hidden');
  sugItems = [];
  sugIndex = -1;
}

// ─── Download progress ───────────────────────────────────────────────────────
// The bottom-left status tray is intentionally gone — progress lives in the
// toolbar download popover (and the privoo://downloads page).
function onDownloadUpdate(dl) {
  activeDls.set(dl.id, dl);
  if (dl.state === 'progressing') dlBadge.classList.add('show');
  else if ([...activeDls.values()].every(d => d.state !== 'progressing')) {
    dlBadge.classList.remove('show');
  }
  if (dlPopover && !dlPopover.classList.contains('hidden')) fillDlPopover();

  // Forward the update into any open downloads tab so it refreshes live
  for (const tab of tabs) {
    if (tab.url && tab.url.startsWith(DOWNLOADS_URL) && tab.wv && !tab.wv.isDestroyed?.()) {
      try { tab.wv.send('download-update', dl); } catch { /* ignore */ }
    }
  }
}

// File-type icon system used by the toolbar download popover. Kept small
// (one SVG per category) since this strip only renders 12 rows.
const DL_POP_ICONS = {
  app:       '<svg viewBox="0 0 24 24"><path d="M12 2 2 7v10l10 5 10-5V7L12 2Zm0 2.2 7.4 3.7L12 11.6 4.6 7.9 12 4.2ZM4 9.6l7 3.5v7.4l-7-3.5V9.6Zm9 10.9V13.1l7-3.5v7.4l-7 3.5Z"/></svg>',
  image:     '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2ZM8.5 12.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5ZM7 9.5A1.5 1.5 0 1 1 7 6.5a1.5 1.5 0 0 1 0 3Z"/></svg>',
  video:     '<svg viewBox="0 0 24 24"><path d="M4 6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2v-2.5l3.3 3.3c.6.6 1.7.2 1.7-.7V7.9c0-.9-1.1-1.3-1.7-.7L17 10.5V8c0-1.1-.9-2-2-2H4Zm6.5 3.5 4.5 2.5-4.5 2.5v-5Z"/></svg>',
  audio:     '<svg viewBox="0 0 24 24"><path d="M12 3 9 4v9.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7l8-2V3h-7Z"/></svg>',
  archive:   '<svg viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2Zm-7 4h-2V8h2v2Zm0 3h-2v-2h2v2Zm0 3h-2v-2h2v2Zm0 3h-2v-2h2v2Z"/></svg>',
  extension: '<svg viewBox="0 0 24 24"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11Z"/></svg>',
  pdf:       '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6Zm-1 1.5L18.5 9H14a1 1 0 0 1-1-1V3.5Z"/></svg>',
  doc:       '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6Zm-1 1.5L18.5 9H14a1 1 0 0 1-1-1V3.5ZM7 13h10v1.5H7V13Zm0 3h10v1.5H7V16Z"/></svg>',
  sheet:     '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2Zm-9 14H5v-3h5v3Zm0-4H5v-3h5v3Zm0-4H5V6h5v3Zm9 8h-8v-3h8v3Zm0-4h-8v-3h8v3Zm0-4h-8V6h8v3Z"/></svg>',
  slides:    '<svg viewBox="0 0 24 24"><path d="M21 3H3v14h7l-1 4h6l-1-4h7V3Zm-2 12H5V5h14v10Z"/></svg>',
  code:      '<svg viewBox="0 0 24 24"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0L19.2 12 14.6 7.4 16 6l6 6-6 6-1.4-1.4Z"/></svg>',
  text:      '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6Zm-1 1.5L18.5 9H14a1 1 0 0 1-1-1V3.5ZM7 12h10v1.5H7V12Zm0 3h10v1.5H7V15Zm0 3h7v1.5H7V18Z"/></svg>',
  generic:   '<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6Zm-1 1.5L18.5 9H14a1 1 0 0 1-1-1V3.5Z"/></svg>',
};
const DL_POP_TYPES = {
  exe:'app', msi:'app', appx:'app', appxbundle:'app', msix:'app',
  dmg:'app', pkg:'app', app:'app', deb:'app', rpm:'app', snap:'app',
  flatpak:'app', appimage:'app', apk:'app', ipa:'app',
  jpg:'image', jpeg:'image', png:'image', gif:'image', webp:'image',
  bmp:'image', svg:'image', ico:'image', heic:'image', avif:'image',
  mp4:'video', mkv:'video', avi:'video', mov:'video', webm:'video',
  flv:'video', wmv:'video', m4v:'video',
  mp3:'audio', wav:'audio', flac:'audio', aac:'audio', ogg:'audio', m4a:'audio', opus:'audio',
  zip:'archive', rar:'archive', '7z':'archive', tar:'archive', gz:'archive',
  tgz:'archive', bz2:'archive', xz:'archive', iso:'archive',
  crx:'extension', xpi:'extension', nex:'extension', safariextz:'extension',
  pdf:'pdf',
  doc:'doc', docx:'doc', odt:'doc', rtf:'doc',
  xls:'sheet', xlsx:'sheet', csv:'sheet', ods:'sheet',
  ppt:'slides', pptx:'slides', odp:'slides',
  js:'code', ts:'code', json:'code', html:'code', css:'code', py:'code',
  rb:'code', go:'code', java:'code', c:'code', cpp:'code', sh:'code',
  txt:'text', log:'text', md:'text',
};
const DL_POP_COLORS = {
  app: '#5b6cff', image: '#34a853', video: '#9c27b0', audio: '#ff9800',
  archive: '#f4b400', extension: '#16a085', pdf: '#ea4335', doc: '#2196f3',
  sheet: '#43a047', slides: '#ff5722', code: '#455a64', text: '#9e9e9e',
  generic: '#78909c',
};
function dlPopFileType(fn) {
  const ext = String(fn || '').split('.').pop().toLowerCase();
  return DL_POP_TYPES[ext] || 'generic';
}

async function fillDlPopover() {
  if (!dlPopoverList) return;
  let items = [];
  try { items = await window.privoo.getDownloads(); } catch { /* ignore */ }
  const recent = (items || []).slice(0, 12);
  dlPopoverList.innerHTML = '';
  if (!recent.length) {
    const empty = document.createElement('div');
    empty.className = 'dl-pop-row dl-pop-empty';
    empty.textContent = 'No downloads yet';
    dlPopoverList.appendChild(empty);
    return;
  }
  for (const d of recent) {
    const row = document.createElement('div');
    row.className = 'dl-pop-row';

    const t = dlPopFileType(d.filename);
    const icon = document.createElement('div');
    icon.className = 'dl-pop-icon';
    icon.style.background = DL_POP_COLORS[t] || DL_POP_COLORS.generic;
    icon.innerHTML = DL_POP_ICONS[t] || DL_POP_ICONS.generic;
    // Swap in the real OS file icon for any completed download — Windows
    // gives us the associated app icon (Word doc → Word icon, .exe → its
    // own artwork, etc). The colored category SVG stays as the fallback
    // while the download is still in progress or if extraction fails.
    if (d.state === 'completed' && d.savePath && window.privoo.getFileIcon) {
      window.privoo.getFileIcon(d.savePath).then((url) => {
        if (!url) return;
        icon.classList.add('has-real-icon');
        const img = document.createElement('img');
        img.src = url;
        img.alt = '';
        icon.innerHTML = '';
        icon.appendChild(img);
      }).catch(() => {});
    }

    const main = document.createElement('div');
    main.className = 'dl-pop-main';
    const name = document.createElement('div');
    name.className = 'dl-pop-name';
    name.textContent = d.filename || '';
    name.title = d.filename || '';
    const meta = document.createElement('div');
    meta.className = 'dl-pop-meta';
    meta.textContent = d.state === 'progressing'
      ? `${Math.round(d.totalBytes > 0 ? (d.receivedBytes / d.totalBytes) * 100 : 0)}%`
      : (d.state === 'completed' ? 'Done' : String(d.state || ''));
    main.appendChild(name);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'dl-pop-actions';
    const openB = document.createElement('button');
    openB.type = 'button';
    openB.textContent = 'Open';
    openB.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (d.savePath) window.privoo.openDownload(d.savePath);
    });
    const folderB = document.createElement('button');
    folderB.type = 'button';
    folderB.textContent = 'Folder';
    folderB.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (d.savePath) window.privoo.showInFolder(d.savePath);
    });
    actions.appendChild(openB);
    actions.appendChild(folderB);

    row.appendChild(icon);
    row.appendChild(main);
    row.appendChild(actions);
    dlPopoverList.appendChild(row);
  }
}

// Removed renderTray() — the bottom-left progress tray is gone. Download
// progress is shown in the toolbar popover (real-time via fillDlPopover)
// and on the privoo://downloads page (real-time via its own listener).

// ─── Audio / media control ────────────────────────────────────────────────────
let mediaPollingTimer = null;

function fmtTime(s) {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function updateTabAudioIndicator(tab) {
  if (!tab?.tabEl) return;
  const ind = tab.tabEl.querySelector('.tab-audio-ind');
  if (!ind) return;
  const show = tab.isPlayingAudio || tab.isMuted;
  ind.classList.toggle('visible', show);
  ind.classList.toggle('muted', !!tab.isMuted);
  ind.title = tab.isMuted ? 'Muted — click to unmute' : 'Playing audio — click to mute';
  const svg = ind.querySelector('svg');
  if (svg) {
    svg.innerHTML = tab.isMuted
      ? `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`
      : `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>`;
  }
}

function updateAudioButton() {
  const tab = activeTab();
  if (!audioBtn) return;
  const anyPlaying = tabs.some(t => t.isPlayingAudio || t.isMuted);
  audioBtn.hidden = !anyPlaying;
  const isMuted = tab?.isMuted || false;
  const volIcon = document.getElementById('mp-vol-icon');
  if (volIcon) {
    volIcon.innerHTML = isMuted
      ? `<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>`
      : `<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>`;
  }
  // update volume slider
  const volSlider = document.getElementById('mp-volume');
  if (volSlider) volSlider.value = Math.round((tab?.volume ?? 1) * 100);
}

async function pollMediaInfo() {
  const tab = activeTab();
  if (!tab || !tab.wv || !tab.ready) { stopMediaPolling(); return; }
  try {
    const info = await tab.wv.executeJavaScript(`(function(){
      try {
        const ms = navigator.mediaSession;
        const meta = ms && ms.metadata;
        const meds = Array.from(document.querySelectorAll('video,audio'));
        const active = meds.find(m=>!m.paused&&m.duration>0) || meds.find(m=>m.duration>0);
        return {
          title: (meta && meta.title) || document.title || '',
          artist: (meta && meta.artist) || '',
          artwork: (meta && meta.artwork && meta.artwork[0] && meta.artwork[0].src) || '',
          currentTime: active ? active.currentTime : 0,
          duration: active ? active.duration : 0,
          paused: active ? active.paused : true,
          playbackState: ms ? ms.playbackState : 'none'
        };
      } catch(e) { return null; }
    })()`);
    if (!info) return;
    const titleEl = document.getElementById('mp-title');
    const artistEl = document.getElementById('mp-artist');
    const seekEl = document.getElementById('mp-seek');
    const currentEl = document.getElementById('mp-current');
    const durationEl = document.getElementById('mp-duration');
    const playIcon = document.getElementById('mp-play-icon');
    const artworkEl = document.getElementById('mp-artwork');
    const siteRow = document.getElementById('mp-site-row');
    const siteFav = document.getElementById('mp-site-fav');
    const siteHost = document.getElementById('mp-site-host');
    if (titleEl) titleEl.textContent = info.title || 'Unknown';
    if (artistEl) artistEl.textContent = info.artist || '';
    if (info.artwork && artworkEl) {
      artworkEl.style.backgroundImage = `url("${info.artwork}")`;
      artworkEl.style.backgroundSize = 'cover';
      artworkEl.innerHTML = '';
    } else if (artworkEl) {
      const tabFavBg = tab.tabEl.querySelector('.favicon')?.style.backgroundImage;
      if (tabFavBg) {
        artworkEl.style.backgroundImage = tabFavBg;
        artworkEl.style.backgroundSize = '32px 32px';
        artworkEl.style.backgroundPosition = 'center';
        artworkEl.style.backgroundRepeat = 'no-repeat';
        artworkEl.innerHTML = '';
      } else {
        artworkEl.style.backgroundImage = '';
        artworkEl.style.backgroundSize = '';
        artworkEl.innerHTML = `<svg viewBox="0 0 24 24" width="28" height="28"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`;
      }
    }
    try {
      const tabUrl = tab.wv.getURL();
      if (tabUrl && !tabUrl.startsWith('privoo://') && siteRow) {
        const host = new URL(tabUrl).hostname;
        const tabFavBg = tab.tabEl.querySelector('.favicon')?.style.backgroundImage;
        if (siteFav && tabFavBg) siteFav.style.backgroundImage = tabFavBg;
        if (siteHost) siteHost.textContent = host;
        siteRow.hidden = false;
      } else if (siteRow) {
        siteRow.hidden = true;
      }
    } catch { if (siteRow) siteRow.hidden = true; }
    if (seekEl && info.duration > 0) {
      seekEl.max = 1000;
      if (document.activeElement !== seekEl)
        seekEl.value = Math.round((info.currentTime / info.duration) * 1000);
    }
    if (currentEl) currentEl.textContent = fmtTime(info.currentTime);
    if (durationEl) durationEl.textContent = fmtTime(info.duration);
    if (playIcon) {
      const playing = !info.paused || info.playbackState === 'playing';
      playIcon.innerHTML = playing
        ? `<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>` // pause
        : `<path d="M8 5v14l11-7z"/>`; // play
    }
  } catch { /* ignore */ }
}

function startMediaPolling() {
  if (mediaPollingTimer) return;
  mediaPollingTimer = setInterval(pollMediaInfo, 500);
  pollMediaInfo();
}

function stopMediaPolling() {
  if (mediaPollingTimer) { clearInterval(mediaPollingTimer); mediaPollingTimer = null; }
}

// Toolbar audio button
if (audioBtn) {
  audioBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const was = !audioPopover?.classList.contains('hidden');
    closePopovers();
    if (!was) {
      audioPopover?.classList.remove('hidden');
      updateAudioButton();
      startMediaPolling();
    }
  });
}

// Play/pause
document.getElementById('mp-play')?.addEventListener('click', () => {
  const tab = activeTab();
  if (!tab?.wv) return;
  tab.wv.executeJavaScript(`(function(){
    try {
      var m=Array.from(document.querySelectorAll('video,audio'));
      var a=m.find(x=>!x.paused)||m[0];
      if(a){if(a.paused)a.play();else a.pause();}
    } catch(e){}
  })()`).catch(()=>{});
});

// Prev / next (MediaSession skip)
document.getElementById('mp-prev')?.addEventListener('click', () => {
  const tab = activeTab();
  if (!tab?.wv) return;
  tab.wv.executeJavaScript(`try{navigator.mediaSession.callActionHandler&&navigator.mediaSession.callActionHandler('previoustrack');}catch(e){try{var m=document.querySelector('video,audio');if(m)m.currentTime=Math.max(0,m.currentTime-10);}catch(e2){}}`).catch(()=>{});
});
document.getElementById('mp-next')?.addEventListener('click', () => {
  const tab = activeTab();
  if (!tab?.wv) return;
  tab.wv.executeJavaScript(`try{navigator.mediaSession.callActionHandler&&navigator.mediaSession.callActionHandler('nexttrack');}catch(e){try{var m=document.querySelector('video,audio');if(m)m.currentTime=Math.min(m.duration,m.currentTime+10);}catch(e2){}}`).catch(()=>{});
});

// Seek slider
document.getElementById('mp-seek')?.addEventListener('input', () => {
  const tab = activeTab();
  if (!tab?.wv) return;
  const seekEl = document.getElementById('mp-seek');
  const frac = parseInt(seekEl.value, 10) / 1000;
  tab.wv.executeJavaScript(`(function(){
    try{var m=Array.from(document.querySelectorAll('video,audio')).find(x=>x.duration>0);
    if(m)m.currentTime=m.duration*${frac};}catch(e){}
  })()`).catch(()=>{});
});

// Mute/unmute via media player vol button
document.getElementById('mp-mute-btn')?.addEventListener('click', () => {
  const tab = activeTab();
  if (!tab?.wv) return;
  tab.isMuted = !tab.isMuted;
  tab.wv.setAudioMuted(tab.isMuted);
  updateTabAudioIndicator(tab);
  updateAudioButton();
});

// Volume slider in media player
document.getElementById('mp-volume')?.addEventListener('input', function() {
  const tab = activeTab();
  if (!tab?.wv) return;
  const vol = parseInt(this.value, 10) / 100;
  tab.volume = vol;
  tab.wv.executeJavaScript(`(function(){try{var m=document.querySelectorAll('video,audio');for(var i=0;i<m.length;i++)m[i].volume=${vol};}catch(e){}})();`).catch(()=>{});
});

// ─── Background music ─────────────────────────────────────────────────────────
function initBgMusic() {
  if (!bgMusic || !settings) return;
  if (settings.musicEnabled && settings.musicPath) {
    const url = new URL('file://' + settings.musicPath.replace(/\\/g, '/')).href;
    if (bgMusic.src !== url) {
      bgMusic.src = url;
      bgMusic.volume = typeof settings.musicVolume === 'number' ? settings.musicVolume : 0.5;
    }
    bgMusic.play().catch(() => {});
  } else {
    bgMusic.pause();
  }
}

// ─── Privacy panel ───────────────────────────────────────────────────────────
function paintFeatures() {
  if (!settings) return;
  const map = {
    'f-adblock': settings.adBlocking,
    'f-https':   settings.httpsUpgrade,
    'f-cookies': settings.blockThirdPartyCookies,
    'f-doh':     settings.dnsOverHttps,
    'f-spoof':   settings.spoofUserAgent || settings.canvasSpoofing,
    'f-webrtc':  settings.webrtcProtection,
  };
  for (const [id, on] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.toggle('off', !on);
  }
  // Update hero subtitle with the active site host (or a generic message
  // for internal pages where there is no real site).
  const siteEl = document.getElementById('sp-hero-site');
  if (siteEl) {
    const tab = tabs.find(t => t.id === activeId);
    let host = '';
    try { host = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : ''; } catch {}
    if (!host || tab?.url?.startsWith('privoo://')) {
      siteEl.textContent = 'across every site you visit';
    } else {
      siteEl.textContent = `on ${host}`;
    }
  }
}

async function refreshStats() {
  try {
    const s = await window.privoo.getPrivacyStats();
    const total = s.blockedAds + s.blockedCookies;
    shieldCount.textContent = total > 9999 ? '9999+' : String(total);
    document.getElementById('stat-ads').textContent    = s.blockedAds;
    document.getElementById('stat-cookies').textContent = s.blockedCookies;
    document.getElementById('stat-https').textContent  = s.upgradedHttps;
  } catch { /* ignore */ }
}

async function refreshPageShield(tab) {
  if (!pageShieldBtn) return;
  tab = tab || activeTab();
  let wcId = 0;
  try { wcId = tab?.wv?.getWebContentsId?.() || 0; } catch {}
  let count = 0;
  if (wcId) {
    try { count = await window.privoo.getPageBlockedCount(wcId); } catch {}
  }
  pageShieldBtn.classList.toggle('has-blocks', count > 0);
  const label = count > 999 ? '999+' : String(count);
  const heroNum = document.getElementById('ps-hero-num');
  if (heroNum) heroNum.textContent = label;
  const hostEl = document.getElementById('ps-foot-host');
  if (hostEl) {
    let host = '';
    try { host = tab?.url ? new URL(tab.url).hostname.replace(/^www\./, '') : ''; } catch {}
    if (!host || tab?.url?.startsWith('privoo://')) {
      hostEl.textContent = 'Internal page';
    } else {
      hostEl.textContent = host;
    }
  }
}

// ─── Popovers ────────────────────────────────────────────────────────────────
function togglePopover(el) {
  const wasHidden = el.classList.contains('hidden');
  closePopovers();
  if (wasHidden) el.classList.remove('hidden');
}

// ─── Site security popover (click the lock/shield in the omnibox) ────────────
function updateSiteInfoPopover(url, isInternal, isSecure, isHttp) {
  if (!siteInfoPopover) return;
  const icon   = document.getElementById('si-icon');
  const status = document.getElementById('si-status');
  const host   = document.getElementById('si-host');
  const detail = document.getElementById('si-detail');
  if (!icon || !status || !host || !detail) return;

  let hostname = '';
  try { hostname = new URL(url || '').hostname || url || ''; } catch { hostname = url || ''; }

  if (isInternal) {
    icon.className = 'si-icon internal';
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5z"/></svg>`;
    status.textContent = 'Privoo internal page';
    host.textContent   = url || 'privoo://';
    detail.textContent = 'This page is part of Privoo and is served locally — no network connection is involved.';
  } else if (isSecure) {
    icon.className = 'si-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3.1-9H8.9V6a3.1 3.1 0 0 1 6.2 0v2z"/></svg>`;
    status.textContent = 'Connection is secure';
    host.textContent   = hostname;
    detail.textContent = 'Your data (passwords, credit-card numbers, messages) is encrypted in transit. Privoo verified this site’s certificate.';
  } else if (isHttp) {
    icon.className = 'si-icon insecure';
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 1 21h22L12 2zm0 6 7.5 13H4.5L12 8zm-1 4v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>`;
    status.textContent = 'Connection is not secure';
    host.textContent   = hostname;
    detail.textContent = 'This site is using an unencrypted HTTP connection. Anyone on your network can see what you send — don’t enter passwords or credit-card info here.';
  } else {
    icon.className = 'si-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-11h2V7h-2v2z"/></svg>`;
    status.textContent = 'About this page';
    host.textContent   = hostname || '—';
    detail.textContent = 'No connection details available.';
  }

}

function closePopovers() {
  shieldPanel.classList.add('hidden');
  menuEl.classList.add('hidden');
  hideSuggestions();
  dlPopover?.classList.add('hidden');
  ytdlpPopover?.classList.add('hidden');
  geoPopover?.classList.add('hidden');
  siteInfoPopover?.classList.add('hidden');
  pageShieldPopover?.classList.add('hidden');
  notesPopover?.classList.add('hidden');
  document.getElementById('translate-popover')?.classList.add('hidden');
  emojiPickerEl?.classList.add('hidden');
  if (audioPopover && !audioPopover.classList.contains('hidden')) {
    audioPopover.classList.add('hidden');
    stopMediaPolling();
  }
  hideTabContextMenu();
  hideWvContextMenu();
  hideSidebarFlyout();
}

function hideWvContextMenu() {
  _closeCtxMenu(null);
}

// ─── DevTools ───────────────────────────────────────────────────────────────
async function openDockedDevTools(tab) {
  if (!tab?.wv) return;
  const pane    = document.getElementById('devtools-pane');
  const devView = document.getElementById('devtools-view');
  try {
    // Toggle: already open → close it
    if (tab.wv.isDevToolsOpened?.()) {
      tab.wv.closeDevTools();
      if (pane) pane.hidden = true;
      return;
    }
    const wcId    = tab.wv.getWebContentsId?.() || 0;
    const devWcId = devView?.getWebContentsId?.() || 0;
    if (wcId && window.privoo?.openDevTools) {
      const res = await window.privoo.openDevTools(wcId, devWcId || undefined);
      if (res?.closed) {
        if (pane) pane.hidden = true;
      } else if (!res?.detached && pane) {
        // Embedded DevTools loaded in #devtools-view — show pane
        pane.hidden = false;
        const titleEl = document.getElementById('devtools-pane-title');
        if (titleEl) titleEl.textContent = 'DevTools';
      }
      // If detached: native window handles it, no pane needed
    } else {
      if (tab.wv.isDevToolsOpened?.()) tab.wv.closeDevTools();
      else tab.wv.openDevTools();
    }
  } catch { /* ignore */ }
}

function closeDockedDevTools() {
  const pane = document.getElementById('devtools-pane');
  if (pane) pane.hidden = true;
  const tab = activeTab();
  if (!tab?.wv) return;
  try { if (tab.wv.isDevToolsOpened?.()) tab.wv.closeDevTools(); } catch {}
}

// ─── Standalone emoji picker (Chrome/Edge-style) ────────────────────────────
const emojiPickerEl    = document.getElementById('emoji-picker');
const emojiSearchInp   = document.getElementById('emoji-search');
const emojiCloseBtn    = document.getElementById('emoji-close');
const emojiCategoriesEl= document.getElementById('emoji-categories');
const emojiGridEl      = document.getElementById('emoji-grid');
const emojiPrevGlyphEl = document.getElementById('emoji-preview-glyph');
const emojiPrevNameEl  = document.getElementById('emoji-preview-name');

const EMOJI_RECENT_KEY = 'privoo:emoji-recent';
let emojiTargetWv = null;   // which webview to insert into
let emojiActiveCat = 'recent';
const emojiRecent = (() => {
  try { return JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) || '[]'); } catch { return []; }
})();
function pushRecent(em) {
  const idx = emojiRecent.indexOf(em);
  if (idx >= 0) emojiRecent.splice(idx, 1);
  emojiRecent.unshift(em);
  if (emojiRecent.length > 40) emojiRecent.length = 40;
  try { localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(emojiRecent)); } catch {}
}

// Render emoji natively via system color-emoji fonts (Segoe UI Emoji on
// Windows, Apple Color Emoji on macOS, Noto Color Emoji on Linux). Previously
// we fetched Twemoji SVGs from a CDN, which 404'd on many codepoints, leaked
// network requests, and broke offline. Native rendering is faster, offline-
// safe, and matches what the user's OS shows everywhere else.

function buildEmojiCategories() {
  if (!emojiCategoriesEl || !window.PRIVOO_EMOJI_DATA) return;
  emojiCategoriesEl.innerHTML = '';
  for (const cat of window.PRIVOO_EMOJI_DATA.categories) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ep-cat';
    b.dataset.cat = cat.id;
    b.title = cat.label;
    b.textContent = cat.icon;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => {
      emojiSearchInp.value = '';
      emojiActiveCat = cat.id;
      renderEmojiGrid();
    });
    emojiCategoriesEl.appendChild(b);
  }
}

function emojiList(catId) {
  if (catId === 'recent') {
    if (!emojiRecent.length) return [];
    // Return as [glyph, name] tuples — names from any category we can find.
    const all = window.PRIVOO_EMOJI_DATA.emojis;
    const lookup = {};
    for (const list of Object.values(all)) for (const e of list) lookup[e[0]] = e;
    return emojiRecent.map(g => lookup[g] || [g, '', '']).filter(Boolean);
  }
  return window.PRIVOO_EMOJI_DATA.emojis[catId] || [];
}

function renderEmojiGrid() {
  if (!emojiGridEl || !window.PRIVOO_EMOJI_DATA) return;
  emojiGridEl.innerHTML = '';
  // Mark active category button
  emojiCategoriesEl?.querySelectorAll('.ep-cat').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === emojiActiveCat);
  });
  const q = (emojiSearchInp?.value || '').trim().toLowerCase();
  let entries;
  if (q) {
    entries = [];
    for (const list of Object.values(window.PRIVOO_EMOJI_DATA.emojis)) {
      for (const e of list) {
        if (e[1].includes(q) || (e[2] && e[2].includes(q))) entries.push(e);
      }
      if (entries.length > 300) break;
    }
  } else {
    entries = emojiList(emojiActiveCat);
  }
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'ep-empty';
    empty.textContent = q ? `No emojis match "${q}"` : 'Nothing here yet — pick an emoji to add it to Recent';
    emojiGridEl.appendChild(empty);
    return;
  }
  for (const [glyph, name] of entries) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'ep-cell';
    cell.title = name;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', name || glyph);
    cell.textContent = glyph;
    cell.addEventListener('mouseenter', () => updateEmojiPreview(glyph, name));
    cell.addEventListener('focus',      () => updateEmojiPreview(glyph, name));
    cell.addEventListener('click', () => selectEmoji(glyph));
    emojiGridEl.appendChild(cell);
  }
}

function updateEmojiPreview(glyph, name) {
  if (emojiPrevGlyphEl) {
    emojiPrevGlyphEl.textContent = glyph;
  }
  if (emojiPrevNameEl)  emojiPrevNameEl.textContent  = name || '';
}

function selectEmoji(glyph) {
  pushRecent(glyph);
  const wv = emojiTargetWv || activeTab()?.wv;
  if (wv) insertEmojiInWebview(wv, glyph);
  // Try clipboard too — useful if no focused input
  try { navigator.clipboard.writeText(glyph).catch(() => {}); } catch {}
  // Keep picker open — matches Chrome/Edge so users can insert several.
}

async function openEmojiPicker(wv) {
  // Prefer the real OS emoji panel (the Win+. flyout) — the exact one
  // Chrome and Edge open. It inserts straight into the focused field.
  try {
    if (await window.privoo.showEmojiPanel?.()) return;
  } catch {}
  // Fallback for platforms with no native panel — the built-in picker.
  if (!emojiPickerEl) return;
  closePopovers();
  emojiTargetWv = wv || activeTab()?.wv || null;
  emojiPickerEl.classList.remove('hidden');
  if (!emojiCategoriesEl.children.length) buildEmojiCategories();
  emojiActiveCat = emojiRecent.length ? 'recent' : 'smileys';
  if (emojiSearchInp) emojiSearchInp.value = '';
  renderEmojiGrid();
  setTimeout(() => emojiSearchInp?.focus(), 0);
}
function closeEmojiPicker() {
  emojiPickerEl?.classList.add('hidden');
  emojiTargetWv = null;
}

emojiCloseBtn?.addEventListener('click', (e) => { e.stopPropagation(); closeEmojiPicker(); });
emojiSearchInp?.addEventListener('input', () => renderEmojiGrid());
emojiSearchInp?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeEmojiPicker(); return; }
  if (e.key === 'Enter') {
    // Insert first match
    const first = emojiGridEl?.querySelector('.ep-cell');
    if (first) { e.preventDefault(); first.click(); }
  }
});

function insertEmojiInWebview(wv, em) {
  const js = `(function(){
    try {
      var s = ${JSON.stringify(em)};
      if (document.execCommand && document.queryCommandSupported && document.queryCommandSupported('insertText')) {
        document.execCommand('insertText', false, s);
        return;
      }
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        var v = el.value || '';
        var a = el.selectionStart || v.length, b = el.selectionEnd || a;
        el.value = v.slice(0,a) + s + v.slice(b);
        el.selectionStart = el.selectionEnd = a + s.length;
        el.dispatchEvent(new Event('input', {bubbles:true}));
      }
    } catch(e) {}
  })();`;
  wv.executeJavaScript(js).catch(() => {});
}

// ─── Overlay banners (welcome on first site, "leaving Privoo" on rivals) ─
const overlayBannerEl = document.getElementById('overlay-banner');
const obTitleEl       = document.getElementById('ob-title');
const obTextEl        = document.getElementById('ob-text');
const obDismissBtn    = document.getElementById('ob-dismiss');

const OB_WELCOME_KEY  = 'privoo:welcome-shown';
// Leaving-Privoo dismiss is per session only (in-memory). The user wants the
// nudge to keep appearing on rival browser sites until they navigate away,
// not be silenced forever after one dismissal.
const OB_LEAVING_DISMISSED = new Set();
// True while the Chrome Web Store notice is up for the current visit — reset
// when the user navigates away, so it shows again on the next visit.
let obWebStoreActive = false;
// Hosts where we show a friendly "Are you leaving Privoo?" nudge. Entries
// without a slash match the bare host (and any subdomain via endsWith).
// Entries WITH a slash require pathLower to start with the needle — used for
// generic vendor sites (apple.com, microsoft.com) where only specific
// product pages should trigger.
const RIVAL_BROWSER_HOSTS = [
  // Chrome
  'google.com/chrome', 'chrome.com', 'chromium.org', 'dl.google.com/chrome',
  // Firefox
  'mozilla.org', 'firefox.com', 'getfirefox.com',
  // Safari
  'apple.com/safari', 'apple.com/macos/safari',
  // Edge
  'microsoft.com/edge', 'microsoftedgewelcome.microsoft.com',
  'microsoftedgeinsider.com', 'microsoftedgetips.microsoft.com',
  // Opera
  'opera.com',
  // Brave
  'brave.com',
  // Vivaldi
  'vivaldi.com',
  // Tor
  'torproject.org',
  // DuckDuckGo browser
  'duckduckgo.com/app', 'duckduckgo.com/browser',
  // Arc / Dia
  'arc.net', 'diabrowser.com',
  // Misc privacy / niche browsers
  'librewolf.net', 'waterfox.net', 'palemoon.org', 'ungoogled-software.github.io',
];

// Search-engine hosts: never trigger the leaving nudge here, even if the user
// is searching for the literal word "chrome" or "firefox". Match by host
// (with subdomain support via endsWith).
const SEARCH_ENGINE_HOSTS = [
  'google.com', 'www.google.com',
  'bing.com', 'www.bing.com',
  'duckduckgo.com', 'www.duckduckgo.com',
  'search.brave.com', 'brave.com/search',
  'startpage.com', 'www.startpage.com',
  'ecosia.org', 'www.ecosia.org',
  'qwant.com', 'www.qwant.com',
  'yandex.com', 'www.yandex.com',
  'baidu.com', 'www.baidu.com',
  'kagi.com', 'www.kagi.com',
  'searx.be', 'search.marginalia.nu',
];

// Paths on search-engine hosts where queries land — anything under these
// paths is treated as a search and skipped. We still allow nudges on
// product pages like google.com/chrome by requiring the rival match to be
// path-prefixed.
const SEARCH_PATHS = ['/search', '/?q', '/?query', '/s', '/results'];

function isSearchPage(host, pathname, search) {
  if (!host) return false;
  const h = host.toLowerCase();
  const inSearchHost = SEARCH_ENGINE_HOSTS.some(needle =>
    needle.includes('/') ? false : (h === needle || h.endsWith('.' + needle))
  );
  if (!inSearchHost) return false;
  const p = (pathname || '').toLowerCase();
  const qs = (search || '').toLowerCase();
  // Any path with a query string on a search engine is almost certainly a
  // search; otherwise look for the typical search path prefixes.
  if (qs && (qs.includes('q=') || qs.includes('query='))) return true;
  return SEARCH_PATHS.some(sp => p.startsWith(sp));
}

function hideOverlayBanner() {
  overlayBannerEl?.classList.add('hidden');
}
function showOverlayBanner(title, text, primaryLabel, onPrimary) {
  if (!overlayBannerEl) return;
  if (obTitleEl)    obTitleEl.textContent = title;
  if (obTextEl)     obTextEl.textContent  = text;
  if (obDismissBtn) obDismissBtn.textContent = primaryLabel || 'Okay!';
  overlayBannerEl.classList.remove('hidden');
  // One-shot click — re-bind each time so the closure captures the right cb.
  const handler = () => {
    obDismissBtn.removeEventListener('click', handler);
    hideOverlayBanner();
    if (typeof onPrimary === 'function') onPrimary();
  };
  obDismissBtn.addEventListener('click', handler);
}

function maybeShowOverlayBanner(url) {
  if (!url) return;
  // Skip internal pages — banner is for the open web.
  if (url.startsWith('privoo://') || url.startsWith('about:') || url.startsWith('devtools:')) {
    hideOverlayBanner();
    obWebStoreActive = false;
    return;
  }

  let host = '';
  let pathLower = '';
  let pathname = '';
  let search = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    pathname = u.pathname || '';
    search = u.search || '';
    pathLower = (u.hostname + u.pathname).toLowerCase();
  } catch { return; }

  // Never trigger the leaving nudge on search-engine result pages, even if
  // the query happens to contain a rival browser name. We still want to
  // show the welcome banner there though, so fall through to that.
  const onSearch = isSearchPage(host, pathname, search);

  // Normalize host (drop leading "www.") so a needle like "google.com/chrome"
  // matches www.google.com/chrome, dl.google.com/chrome, etc. The old check
  // did pathLower.startsWith(needle) which always failed on www-prefixed URLs.
  const bareHost = host.replace(/^www\./, '');
  const pathLow  = pathname.toLowerCase();

  // Chrome Web Store — Privoo can't install extensions directly from it, so
  // let the user know and point them at the Extensions page.
  const isWebStore = bareHost === 'chromewebstore.google.com'
    || (bareHost === 'chrome.google.com' && pathLow.startsWith('/webstore'));
  if (isWebStore) {
    // Show once per visit. Don't hide on the follow-up did-stop-loading /
    // in-page navigations the store fires — that was killing the banner the
    // instant it appeared.
    if (!obWebStoreActive) {
      obWebStoreActive = true;
      showOverlayBanner(
        "Chrome Web Store isn't supported",
        "Privoo can't install extensions straight from the Chrome Web Store. Download the extension's .crx file and add it from Privoo's Extensions page instead.",
        'Open Extensions page',
        () => { createTab(EXTENSIONS_URL); },
      );
    }
    return;
  }
  obWebStoreActive = false;

  const isRival = !onSearch && RIVAL_BROWSER_HOSTS.some(needle => {
    if (needle.includes('/')) {
      const slash = needle.indexOf('/');
      const nHost = needle.slice(0, slash);
      const nPath = needle.slice(slash); // includes leading "/"
      const hostOk = bareHost === nHost || bareHost.endsWith('.' + nHost);
      return hostOk && pathLow.startsWith(nPath);
    }
    return bareHost === needle || bareHost.endsWith('.' + needle);
  });
  if (isRival) {
    if (!OB_LEAVING_DISMISSED.has(host)) {
      showOverlayBanner(
        'Are you leaving Privoo… 🥺',
        "We'll miss you! Privoo blocks ads, trackers, and fingerprinting by default and keeps everything on your device.",
        'Stay with Privoo',
        () => { OB_LEAVING_DISMISSED.add(host); },
      );
      return;
    }
  }

  // 2) Welcome banner — only on the very first real website visit, ever.
  let welcomeShown = false;
  try { welcomeShown = localStorage.getItem(OB_WELCOME_KEY) === '1'; } catch {}
  if (!welcomeShown) {
    showOverlayBanner(
      'Privoo keeps you safe!',
      'Ads, trackers, and fingerprinting scripts are blocked by default. No accounts, no sync — your browsing stays on this device.',
      'Okay!',
      () => { try { localStorage.setItem(OB_WELCOME_KEY, '1'); } catch {} },
    );
    return;
  }

  // Otherwise hide.
  hideOverlayBanner();
}

async function showWvContextMenu(tab, params, vx = 200, vy = 200) {
  closePopovers();
  const wv = tab.wv;
  const flags = params?.editFlags || {};
  const can = (k) => flags[k] !== false;

  // The webview context menu uses the OS-native menu (Menu.popup via the
  // show-context-menu IPC). A native menu always renders above the webview
  // surface and its clicks always register — an HTML overlay positioned
  // over a <webview> can't be relied on for either.
  const items = [];
  const actions = {};
  let seq = 0;
  const add = (label, onClick, opts = {}) => {
    const id = `c${++seq}`;
    items.push({ id, label, enabled: opts.disabled ? false : true, accelerator: opts.accel });
    if (!opts.disabled) actions[id] = onClick;
  };
  const sep = () => items.push({ type: 'separator' });

  if (params?.isEditable) {
    add('Emojis', () => openEmojiPicker(wv));
    sep();
  }

  add('Back',    () => wv.goBack(),    { accel: 'Alt+Left',  disabled: !wv.canGoBack() });
  add('Forward', () => wv.goForward(), { accel: 'Alt+Right', disabled: !wv.canGoForward() });
  add('Reload',  () => wv.reload(),    { accel: 'CmdOrCtrl+R' });

  const hasEdit = can('canCut') || can('canCopy') || can('canPaste')
    || can('canSelectAll') || params?.selectionText || params?.isEditable;
  if (hasEdit) {
    sep();
    if (can('canCut'))                            add('Cut',   () => wv.cut(),   { accel: 'CmdOrCtrl+X' });
    if (can('canCopy') || params?.selectionText)  add('Copy',  () => wv.copy(),  { accel: 'CmdOrCtrl+C' });
    if (can('canPaste') || params?.isEditable)    add('Paste', () => wv.paste(), { accel: 'CmdOrCtrl+V' });
    if (can('canSelectAll'))                      add('Select all', () => wv.selectAll(), { accel: 'CmdOrCtrl+A' });
  }

  if (params?.selectionText) {
    const t = params.selectionText.slice(0, 40) + (params.selectionText.length > 40 ? '…' : '');
    sep();
    add(`Search the web for "${t}"`, () => createTab(searchUrl(params.selectionText)));
  }

  if (params?.linkURL) {
    sep();
    add('Open link in new tab', () => createTab(params.linkURL));
    add('Copy link address',    () => navigator.clipboard.writeText(params.linkURL).catch(() => {}));
  }
  if (params?.srcURL && params.mediaType === 'image') {
    sep();
    add('Open image in new tab', () => createTab(params.srcURL));
    add('Copy image address',    () => navigator.clipboard.writeText(params.srcURL).catch(() => {}));
    add('Save image as…',        () => { try { wv.downloadURL(params.srcURL); } catch {} });
  }
  if (params?.srcURL && params.mediaType === 'video') {
    sep();
    add('Open video in new tab', () => createTab(params.srcURL));
  }

  const suggestions = (params?.misspelledWord && params.dictionarySuggestions) || [];
  if (suggestions.length) {
    sep();
    suggestions.slice(0, 4).forEach(w => add(w, () => wv.replaceMisspelling?.(w)));
  }

  sep();
  add('Open in mobile view', () => openMobileView());
  add('Print…',           () => wv.print(),                                              { accel: 'CmdOrCtrl+P' });
  add('View page source', () => { const u = wv.getURL(); if (u) createTab(`view-source:${u}`); });
  add('Inspect',          () => openDockedDevTools(tab),                                  { accel: 'F12' });

  let chosen = null;
  try { chosen = await showHtmlMenu(items, vx, vy); } catch { chosen = null; }
  if (chosen && typeof actions[chosen] === 'function') {
    try { actions[chosen](); } catch (err) { console.error('ctx-item handler:', err); }
  }
}

shieldBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePopover(shieldPanel);
  if (!shieldPanel.classList.contains('hidden')) { refreshStats(); paintFeatures(); }
});
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePopover(menuEl); });

// Toolbar extensions button — opens the manager page in a new tab
document.getElementById('extensions-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  createTab(EXTENSIONS_URL);
});

// ─── Customize side panel (right-side, opens from menu) ─────────────────────
const CP_ACCENTS = [
  { name: 'blue',   value: '#8ab4f8' },  // default
  { name: 'indigo', value: '#a78bfa' },
  { name: 'pink',   value: '#f48fb1' },
  { name: 'red',    value: '#f28b82' },
  { name: 'orange', value: '#fcad70' },
  { name: 'yellow', value: '#fdd663' },
  { name: 'green',  value: '#81c995' },
];
const cpPanel       = document.getElementById('customize-panel');
const cpCloseBtn    = document.getElementById('cp-close');
const cpAccentRow   = document.getElementById('cp-accent-row');
const cpShowHome    = document.getElementById('cp-show-home');
const cpShowBks     = document.getElementById('cp-show-bookmarks');
const cpShowSidebar = document.getElementById('cp-show-sidebar');
const cpShowNotes      = document.getElementById('cp-show-notes');
const cpVerticalTabs   = document.getElementById('cp-vertical-tabs');
// cpShowGreet removed — greeting feature deleted
const cpWpPickBtn   = document.getElementById('cp-wp-pick');
const cpWpClearBtn  = document.getElementById('cp-wp-clear');

function paintAccentSwatches() {
  if (!cpAccentRow) return;
  cpAccentRow.innerHTML = '';
  // Compare case-insensitively — the saved value might be lower/uppercase hex.
  const current = String(settings?.accentColor || CP_ACCENTS[0].value).toLowerCase();
  for (const a of CP_ACCENTS) {
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'cp-accent-swatch';
    sw.style.setProperty('--accent-color', a.value);
    sw.title = a.name;
    if (a.value.toLowerCase() === current) sw.classList.add('active');
    sw.addEventListener('click', async () => {
      // Apply IMMEDIATELY so the user sees the change without waiting for
      // the round-trip through settings → broadcast → applyAppSettings.
      // (Previously the "default" swatch took a clear-properties path that
      // worked, while non-default swatches relied on the broadcast — which
      // landed AFTER paintAccentSwatches, sometimes losing the update.)
      applyAccentTriad(a.value);
      // Persist + broadcast so other tabs/popouts pick up the change.
      await saveBrowserSetting({ accentColor: a.value });
      paintAccentSwatches();
    });
    cpAccentRow.appendChild(sw);
  }
}
function applyAccentColor(hex) {
  applyAccentTriad(hex);
}

// Compute --accent, --accent-hover and --accent-soft together so all UI
// states (default, hover, focus-ring) stay in the same color family.
function applyAccentTriad(hex) {
  if (!hex || typeof hex !== 'string') return;
  document.documentElement.style.setProperty('--accent', hex);
  // Lighten by ~12% for hover (works for accent values that already sit
  // mid-range like #8ab4f8). For dark accent values this naturally produces
  // a brighter hover state.
  const { r, g, b } = hexToRgb(hex) || { r: 138, g: 180, b: 248 };
  const hover = rgbToHex(
    Math.min(255, Math.round(r + (255 - r) * 0.18)),
    Math.min(255, Math.round(g + (255 - g) * 0.18)),
    Math.min(255, Math.round(b + (255 - b) * 0.18)),
  );
  document.documentElement.style.setProperty('--accent-hover', hover);
  document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},.18)`);
}
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex(r, g, b) {
  const h = (n) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function paintThemeButtons() {
  const isDark = !!settings?.darkMode;
  document.querySelectorAll('.cp-theme-btn').forEach(b => {
    b.classList.toggle('active', (b.dataset.theme === 'dark') === isDark);
  });
}
function paintCustomizePanel() {
  if (!cpPanel) return;
  paintThemeButtons();
  paintAccentSwatches();
  if (cpShowHome)       cpShowHome.checked       = !!settings?.showHomeButton;
  if (cpShowBks)        cpShowBks.checked        = !!settings?.showBookmarksBar;
  if (cpShowSidebar)    cpShowSidebar.checked    = !!settings?.showSidebar;
  if (cpVerticalTabs)   cpVerticalTabs.checked   = !!settings?.verticalTabs;
  if (cpShowNotes)      cpShowNotes.checked      = !!settings?.showNotesButton;
}

function openCustomizePanel() {
  if (!cpPanel) return;
  cpPanel.hidden = false;
  cpPanel.classList.remove('hidden');
  paintCustomizePanel();
}
function closeCustomizePanel() {
  if (!cpPanel) return;
  cpPanel.classList.add('hidden');
  cpPanel.hidden = true;
}

cpCloseBtn?.addEventListener('click', closeCustomizePanel);

document.querySelectorAll('.cp-theme-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const want = btn.dataset.theme === 'dark';
    await saveBrowserSetting({ darkMode: want });
    paintThemeButtons();
  });
});
cpShowHome?.addEventListener('change',    () => saveBrowserSetting({ showHomeButton:    cpShowHome.checked }));
cpShowBks?.addEventListener('change',     () => saveBrowserSetting({ showBookmarksBar:  cpShowBks.checked  }));
cpShowSidebar?.addEventListener('change', () => saveBrowserSetting({ showSidebar: cpShowSidebar.checked }));
cpVerticalTabs?.addEventListener('change', async () => {
  const on = cpVerticalTabs.checked;
  const patch = { verticalTabs: on };
  if (on && settings?.showSidebar) {
    patch.showSidebar = false;
    if (cpShowSidebar) cpShowSidebar.checked = false;
  }
  await saveBrowserSetting(patch);
});
cpShowNotes?.addEventListener('change',   () => saveBrowserSetting({ showNotesButton:   cpShowNotes.checked }));

cpWpPickBtn?.addEventListener('click', async () => {
  try { await window.privoo.chooseNtpWallpaper?.(); } catch {}
});
cpWpClearBtn?.addEventListener('click', async () => {
  try { await window.privoo.clearNtpWallpaper?.(); } catch {}
});

// Link rows inside panel — Settings / Extensions
cpPanel?.querySelectorAll('[data-action]').forEach(el => {
  el.addEventListener('click', () => {
    const a = el.dataset.action;
    if (a === 'settings')   { createTab(SETTINGS_URL);   closeCustomizePanel(); }
    if (a === 'extensions') { createTab(EXTENSIONS_URL); closeCustomizePanel(); }
  });
});

// Apply saved accent on startup so existing user accent persists across launches
if (settings?.accentColor) applyAccentColor(settings.accentColor);

// Populate the version chip in the main menu from package.json so the text
// never drifts out of sync with the actual build.
window.privoo?.getAppVersion?.().then((v) => {
  const el = document.getElementById('menu-ver');
  if (el && v) el.textContent = 'Privoo v' + v;
}).catch(() => {});

siteIcon?.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePopover(siteInfoPopover);
});

pageShieldBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshPageShield();
  togglePopover(pageShieldPopover);
});

document.getElementById('devtools-close')?.addEventListener('click', () => closeDockedDevTools());

// ─── Notes popover — multi-note with home + edit views ──────────────────────
// (notesBtn is declared at the top with other toolbar refs so paintToolbarWidgets
// can read it before this block runs.)
const notesPopover   = document.getElementById('notes-popover');
const notesListView  = document.getElementById('notes-list-view');
const notesEditView  = document.getElementById('notes-edit-view');
const notesListEl    = document.getElementById('notes-list');
const notesEmptyEl   = document.getElementById('notes-empty');
const notesNewBtn    = document.getElementById('notes-new');
const notesBackBtn   = document.getElementById('notes-back');
const notesDelBtn    = document.getElementById('notes-delete');
const notesTitleInp  = document.getElementById('notes-edit-title');
const notesBodyArea  = document.getElementById('notes-edit-body');
const notesStatus    = document.getElementById('notes-status');
const notesCount     = document.getElementById('notes-count');

const NOTES_KEY = 'privoo:notes:v2';
let notes = [];        // [{ id, title, body, updatedAt }]
let openNoteId = null;
let notesSaveTimer = null;

function loadNotes() {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (raw) notes = JSON.parse(raw) || [];
  } catch { notes = []; }
  if (!Array.isArray(notes)) notes = [];
}
function persistNotes() {
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch {}
}
function noteSnippet(body) {
  return (body || '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'Empty note';
}
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}
function renderNotesList() {
  if (!notesListEl) return;
  notesListEl.innerHTML = '';
  if (notesEmptyEl) notesEmptyEl.style.display = notes.length ? 'none' : '';
  const sorted = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  for (const n of sorted) {
    const item = document.createElement('div');
    item.className = 'note-row';
    item.innerHTML =
      `<div class="note-row-title">${esc(n.title || 'Untitled note')}</div>` +
      `<div class="note-row-snippet">${esc(noteSnippet(n.body))}</div>` +
      `<div class="note-row-meta">${esc(timeAgo(n.updatedAt || Date.now()))}</div>`;
    item.addEventListener('click', () => openNote(n.id));
    notesListEl.appendChild(item);
  }
  if (notesEmptyEl && !notes.length) notesListEl.appendChild(notesEmptyEl);
}
function showNotesList() {
  openNoteId = null;
  if (notesEditView) notesEditView.hidden = true;
  if (notesListView) notesListView.hidden = false;
  renderNotesList();
}
function openNote(id) {
  const n = notes.find(x => x.id === id);
  if (!n) return;
  openNoteId = id;
  if (notesTitleInp) notesTitleInp.value = n.title || '';
  if (notesBodyArea) notesBodyArea.value = n.body || '';
  if (notesListView) notesListView.hidden = true;
  if (notesEditView) notesEditView.hidden = false;
  updateNoteCount();
  if (notesStatus) { notesStatus.textContent = 'Saved'; notesStatus.classList.remove('saving'); }
  setTimeout(() => notesBodyArea?.focus(), 0);
}
function newNote() {
  const n = {
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: '',
    body: '',
    updatedAt: Date.now(),
  };
  notes.push(n);
  persistNotes();
  openNote(n.id);
  notesTitleInp?.focus();
}
function deleteCurrentNote() {
  if (!openNoteId) return;
  notes = notes.filter(x => x.id !== openNoteId);
  persistNotes();
  showNotesList();
}
function updateNoteCount() {
  if (notesCount && notesBodyArea) {
    const n = notesBodyArea.value.length;
    notesCount.textContent = `${n} char${n === 1 ? '' : 's'}`;
  }
}
function scheduleSaveCurrentNote() {
  if (!openNoteId) return;
  if (notesStatus) { notesStatus.textContent = 'Saving…'; notesStatus.classList.add('saving'); }
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(() => {
    const n = notes.find(x => x.id === openNoteId);
    if (!n) return;
    n.title = (notesTitleInp?.value || '').trim();
    n.body  = notesBodyArea?.value || '';
    n.updatedAt = Date.now();
    persistNotes();
    if (notesStatus) { notesStatus.textContent = 'Saved'; notesStatus.classList.remove('saving'); }
  }, 300);
}

loadNotes();
notesTitleInp?.addEventListener('input', scheduleSaveCurrentNote);
notesBodyArea?.addEventListener('input', () => { scheduleSaveCurrentNote(); updateNoteCount(); });
notesNewBtn?.addEventListener('click', (e) => { e.stopPropagation(); newNote(); });
notesBackBtn?.addEventListener('click', (e) => { e.stopPropagation(); showNotesList(); });
notesDelBtn?.addEventListener('click', (e) => { e.stopPropagation(); deleteCurrentNote(); });

notesBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const wasHidden = notesPopover?.classList.contains('hidden');
  togglePopover(notesPopover);
  if (wasHidden) showNotesList();
});

// ─── Translate ───────────────────────────────────────────────────────────────
{
  const translateBtn     = document.getElementById('translate-btn');
  const translatePopover = document.getElementById('translate-popover');
  const translateLang    = document.getElementById('translate-lang');
  const translateGo      = document.getElementById('translate-go');

  translateBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePopover(translatePopover);
  });

  translateGo?.addEventListener('click', () => {
    const tab = activeTab();
    if (!tab?.url || tab.url.startsWith('privoo://') || tab.url.startsWith('about:')) return;
    const lang = translateLang?.value || 'en';
    try {
      const u = new URL(tab.url);
      // Google Translate's current page-translation format: replace dots with
      // hyphens in the hostname, then load via *.translate.goog
      const slug = u.hostname.replace(/\./g, '-');
      const path = u.pathname + u.search + u.hash;
      navigate(`https://${slug}.translate.goog${path}?_x_tr_sl=auto&_x_tr_tl=${lang}&_x_tr_hl=en&_x_tr_hist=true`);
    } catch {
      navigate(`https://translate.google.com/?sl=auto&tl=${lang}&op=websites&u=${encodeURIComponent(tab.url)}`);
    }
    translatePopover?.classList.add('hidden');
  });
}

// ─── Sidebar wiring ──────────────────────────────────────────────────────────
document.getElementById('sidebar-add')?.addEventListener('click', (e) => {
  e.stopPropagation();
  openSidebarAddModal();
});
document.getElementById('sb-cancel')?.addEventListener('click', closeSidebarAddModal);
document.getElementById('sb-save')?.addEventListener('click', saveSidebarShortcut);
document.getElementById('sidebar-add-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'sidebar-add-modal') closeSidebarAddModal();
});
document.getElementById('sb-url')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveSidebarShortcut(); }
  if (e.key === 'Escape') { e.preventDefault(); closeSidebarAddModal(); }
});
document.getElementById('sb-name')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); saveSidebarShortcut(); }
  if (e.key === 'Escape') { e.preventDefault(); closeSidebarAddModal(); }
});

// Drag-to-resize the DevTools pane (right edge of #views, left edge of pane).
(function wireDevtoolsResize() {
  const handle = document.getElementById('devtools-resize');
  const pane   = document.getElementById('devtools-pane');
  if (!handle || !pane) return;
  let dragging = false;
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const wrap = document.getElementById('views-wrap');
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    // Pane width = distance from cursor to right edge of wrap
    let w = rect.right - e.clientX;
    if (w < 300) w = 300;
    if (w > rect.width * 0.8) w = rect.width * 0.8;
    pane.style.width = `${w}px`;
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
  });
})();

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const t = e.target;
  if (menuEl && !menuEl.classList.contains('hidden')) {
    if (!menuEl.contains(t) && !menuBtn.contains(t)) menuEl.classList.add('hidden');
  }
  if (shieldPanel && !shieldPanel.classList.contains('hidden')) {
    if (!shieldPanel.contains(t) && !shieldBtn.contains(t)) shieldPanel.classList.add('hidden');
  }
  if (!suggestEl.contains(t) && t !== omnibox) hideSuggestions();
  if (dlPopover && !dlPopover.classList.contains('hidden') && !t.closest('#dl-anchor')) {
    dlPopover.classList.add('hidden');
  }
  if (ytdlpPopover && !ytdlpPopover.classList.contains('hidden') && !t.closest('#ytdlp-anchor')) {
    ytdlpPopover.classList.add('hidden');
  }
  if (geoPopover && !geoPopover.classList.contains('hidden') && !t.closest('#geo-anchor')) {
    geoPopover.classList.add('hidden');
  }
  if (tabContextMenu && !tabContextMenu.classList.contains('hidden') && !tabContextMenu.contains(t)) {
    hideTabContextMenu();
  }
  if (wvContextMenu && !wvContextMenu.classList.contains('hidden') && !wvContextMenu.contains(t)) {
    hideWvContextMenu();
  }
  if (notesPopover && !notesPopover.classList.contains('hidden') && !t.closest('#notes-anchor')) {
    notesPopover.classList.add('hidden');
  }
  if (emojiPickerEl && !emojiPickerEl.classList.contains('hidden') && !emojiPickerEl.contains(t)) {
    closeEmojiPicker();
  }
  if (siteInfoPopover && !siteInfoPopover.classList.contains('hidden') && !siteInfoPopover.contains(t) && t !== siteIcon && !siteIcon.contains(t)) {
    siteInfoPopover.classList.add('hidden');
  }
  if (pageShieldPopover && !pageShieldPopover.classList.contains('hidden') && !pageShieldPopover.contains(t) && !pageShieldBtn?.contains(t)) {
    pageShieldPopover.classList.add('hidden');
  }
  if (audioPopover && !audioPopover.classList.contains('hidden') && !t.closest('#audio-anchor')) {
    audioPopover.classList.add('hidden');
    stopMediaPolling();
  }
  if (sidebarFlyout && !sidebarFlyout.classList.contains('hidden')) {
    if (!sidebarFlyout.contains(t) && !t.closest('#app-sidebar')) hideSidebarFlyout();
  }
}, true);

function handleAction(action) {
  closePopovers();
  switch (action) {
    case 'new-tab':    createTab(); break;
    case 'new-incognito':
      window.privoo.openIncognitoWindow?.().catch(() => {});
      break;
    case 'reopen':     if (closedStack.length) createTab(closedStack.pop()); break;
    case 'add-sidebar-link': {
      const tab = activeTab();
      if (!tab?.url || tab.url.startsWith('privoo://')) break;
      const list = sidebarLinkList();
      if (list.some((l) => l.url === tab.url)) break;
      const next = [...list, { url: tab.url, title: tab.title || tab.url }].slice(0, 24);
      void saveBrowserSetting({ sidebarLinks: next }).then(() => renderSidebarRail());
      break;
    }
    case 'bookmarks':  createTab('privoo://bookmarks/'); break;
    case 'history':    createTab(HISTORY_URL); break;
    case 'downloads':  createTab(DOWNLOADS_URL); break;
    case 'extensions': createTab(EXTENSIONS_URL); break;
    case 'ai-browser': toggleAiPanel(); break;
    case 'settings':   createTab(SETTINGS_URL); break;
    case 'customize':  openCustomizePanel(); break;
    case 'zoom-in':    activeTab()?.wv.setZoomLevel((activeTab()?.wv.getZoomLevel() || 0) + 1); break;
    case 'zoom-out':   activeTab()?.wv.setZoomLevel((activeTab()?.wv.getZoomLevel() || 0) - 1); break;
    case 'zoom-reset': activeTab()?.wv.setZoomLevel(0); break;
    case 'reader-mode':  toggleReaderMode(); break;
    case 'mobile-view':  openMobileView(); break;
    case 'split-view':   toggleSplitView(); break;
    case 'capture-page': captureFullPage(); break;
    case 'tab-search':   openTabSearch(); break;
    case 'quit':       window.privoo.close(); break;
  }
}

[menuEl, shieldPanel].forEach((el) =>
  el.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]')?.dataset.action;
    if (a) handleAction(a);
  })
);

// ─── Toolbar events ───────────────────────────────────────────────────────────
omnibox.addEventListener('focus', () => {
  omnibox.select();
  const val = omnibox.value;
  if (!val) return;
  triggerSuggest(val);
});

// Right-click on the URL bar: a Chrome-style cut/copy/paste menu, anchored
// at the exact cursor with clientX/Y (DOM CSS pixels — no DPR math, no IPC).
omnibox.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const hasSel = omnibox.selectionStart !== omnibox.selectionEnd;
  let clip = '';
  try { clip = await navigator.clipboard.readText(); } catch {}
  const items = [
    { id: 'undo',  label: 'Undo' },
    { type: 'separator' },
    { id: 'cut',   label: 'Cut',   enabled: hasSel },
    { id: 'copy',  label: 'Copy',  enabled: hasSel },
    { id: 'paste', label: 'Paste', enabled: !!clip },
    { id: 'paste-go', label: 'Paste and go', enabled: !!clip },
    { type: 'separator' },
    { id: 'select-all', label: 'Select all', enabled: omnibox.value.length > 0 },
  ];
  const action = await showHtmlMenu(items, e.clientX, e.clientY);
  if (!action) return;
  const start = omnibox.selectionStart || 0;
  const end   = omnibox.selectionEnd   || 0;
  switch (action) {
    case 'undo':
      try { document.execCommand('undo'); } catch {}
      break;
    case 'cut':
      if (hasSel) {
        try { await navigator.clipboard.writeText(omnibox.value.slice(start, end)); } catch {}
        omnibox.setRangeText('', start, end, 'end');
      }
      break;
    case 'copy':
      if (hasSel) {
        try { await navigator.clipboard.writeText(omnibox.value.slice(start, end)); } catch {}
      }
      break;
    case 'paste':
      if (clip) omnibox.setRangeText(clip, start, end, 'end');
      break;
    case 'paste-go':
      if (clip) navigate(clip);
      break;
    case 'select-all':
      omnibox.select();
      break;
  }
});
omnibox.addEventListener('input', (e) => triggerSuggest(e.target.value));

omnibox.addEventListener('blur', () => {
  // Hide suggestions when omnibox loses focus (e.g., when clicking on the page)
  setTimeout(() => hideSuggestions(), 150);
});

omnibox.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); highlightSug(Math.min(sugIndex + 1, sugItems.length - 1)); return; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); highlightSug(Math.max(sugIndex - 1, -1)); if (sugIndex < 0) omnibox.value = displayUrl(activeTab()?.url) || ''; return; }
  if (e.key === 'Escape')    { hideSuggestions(); omnibox.blur(); closePopovers(); return; }
  if (e.key === 'Enter') {
    const val = sugIndex >= 0 && sugItems[sugIndex] ? sugItems[sugIndex].text : omnibox.value;
    // Hide the dropdown synchronously so an in-flight suggestion fetch
    // can't render results over the new page after navigation starts.
    hideSuggestions();
    omnibox.blur();
    navigate(val);
  }
});

backBtn.addEventListener('click',    () => { const w = activeTab()?.wv; if (w?.canGoBack()) w.goBack(); });
forwardBtn.addEventListener('click', () => { const w = activeTab()?.wv; if (w?.canGoForward()) w.goForward(); });
reloadBtn.addEventListener('click',  () => {
  const w = activeTab()?.wv;
  if (!w) return;
  if (w.isLoading()) w.stop(); else w.reload();
});
homeBtn.addEventListener('click', () => navigate(settings?.homePage || NEWTAB_URL));
newTabBtn.addEventListener('click', () => createTab());
dlBtn.addEventListener('click',     async (e) => {
  e.stopPropagation();
  const was = !dlPopover?.classList.contains('hidden');
  closePopovers();
  if (!was) {
    dlPopover?.classList.remove('hidden');
    await fillDlPopover();
  }
  dlBadge.classList.remove('show');
});
dlPopoverAll?.addEventListener('click', (e) => {
  e.stopPropagation();
  dlPopover?.classList.add('hidden');
  createTab(DOWNLOADS_URL);
});

ytdlpToolbarBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const was = !ytdlpPopover?.classList.contains('hidden');
  closePopovers();
  if (!was) {
    ytdlpPopover?.classList.remove('hidden');
    const u = activeTab()?.url || '';
    if (ytdlpUrlInput && u && !u.startsWith('privoo://')) ytdlpUrlInput.value = u;
    ytdlpStatusEl && (ytdlpStatusEl.textContent = '');
    const folderInput = document.getElementById('ytdlp-folder');
    if (folderInput && !folderInput.value && settings?.downloadPath) {
      folderInput.value = settings.downloadPath;
    }
  }
});

document.getElementById('ytdlp-choose-folder')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  const folder = await window.privoo.chooseYtdlpFolder();
  if (folder) {
    const folderInput = document.getElementById('ytdlp-folder');
    if (folderInput) folderInput.value = folder;
  }
});

ytdlpPasteBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const u = activeTab()?.url || '';
  if (ytdlpUrlInput && u && !u.startsWith('privoo://')) ytdlpUrlInput.value = u;
});

geoToolbarBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const was = !geoPopover?.classList.contains('hidden');
  closePopovers();
  if (!was) {
    geoPopover?.classList.remove('hidden');
    syncGeoPopoverFromSettings();
  }
});

geoPresetSelect?.addEventListener('change', () => {
  if (geoCustomWrap) geoCustomWrap.classList.toggle('hidden', geoPresetSelect.value !== 'custom');
});

geoApplyBtn?.addEventListener('click', async () => {
  const preset = geoPresetSelect?.value || 'off';
  const spoof = preset !== 'off';
  const patch = { geoSpoofEnabled: spoof, geoPreset: preset };
  if (preset === 'custom') {
    patch.geoLatitude = parseFloat(geoLatInput?.value || '') || 0;
    patch.geoLongitude = parseFloat(geoLonInput?.value || '') || 0;
  }
  await saveBrowserSetting(patch);
  geoPopover?.classList.add('hidden');
});

ytdlpRunBtn?.addEventListener('click', async () => {
  const url = (ytdlpUrlInput?.value || '').trim();
  if (!url) return;
  const format = document.getElementById('ytdlp-format')?.value || 'best';
  const folder = (document.getElementById('ytdlp-folder')?.value || '').trim();
  ytdlpRunBtn.disabled = true;
  ytdlpStatusEl.textContent = 'Starting…';
  try {
    const r = await window.privoo.ytdlpDownload(url, { format, folder: folder || undefined });
    if (r?.ok) ytdlpStatusEl.textContent = `Finished. Saved to ${folder || 'your download folder'}.`;
    else ytdlpStatusEl.textContent = r?.error === 'not-found'
      ? 'yt-dlp not found. Set path in Settings → Media or place binary in bin/.'
      : (r?.log || r?.error || 'Failed');
  } catch (err) {
    ytdlpStatusEl.textContent = String(err?.message || err);
  }
  ytdlpRunBtn.disabled = false;
});

document.getElementById('stats-reset-btn')?.addEventListener('click', async () => {
  try {
    await window.privoo.resetPrivacyStats();
    await refreshStats();
  } catch { /* ignore */ }
});
bookmarkBtn.addEventListener('click', async () => {
  // Bookmark toggle — stored in a session array for now
  const tab = activeTab();
  if (!tab || !tab.url || tab.url.startsWith('privoo://')) return;
  const list = bookmarkList();
  const exists = list.some((b) => b.url === tab.url);
  const next = exists
    ? list.filter((b) => b.url !== tab.url)
    : [{ name: tab.title || tab.url, url: tab.url, addedAt: Date.now() }, ...list];
  await saveBrowserSetting({ bookmarks: next.slice(0, 5000) });
});

// Window controls
document.getElementById('win-min').addEventListener('click',   () => window.privoo.minimize());
document.getElementById('win-max').addEventListener('click',   () => window.privoo.toggleMaximize());
document.getElementById('win-close').addEventListener('click', () => window.privoo.close());

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════
//  Privoo extras — Reader Mode, Split View, full-page capture, tab search.
//  Things Chrome either lacks outright or hides behind flags.
// ════════════════════════════════════════════════════════════════════════

// Transient bottom-centre toast for lightweight feedback.
let _toastTimer = null;
function privooToast(msg) {
  let el = document.getElementById('privoo-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'privoo-toast';
    el.style.cssText =
      'position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(8px);' +
      'background:#202124;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:10px 18px;' +
      'border-radius:10px;z-index:9000;opacity:0;box-shadow:0 6px 24px rgba(0,0,0,.4);' +
      'transition:opacity .16s,transform .16s;max-width:78vw;text-align:center;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(8px)';
  }, 2600);
}

// ─── Reader Mode ──────────────────────────────────────────────────────────
// Injects a clean, distraction-free article view as a top-layer overlay. The
// original page stays intact underneath, so closing the reader needs no
// reload. The script is a toggle — running it again removes the overlay.
function readerModeScript(dark) {
  const BG = dark ? '#1b1c1f' : '#fbfaf7';
  const FG = dark ? '#e7e8ea' : '#1b1b1b';
  const MU = dark ? '#9aa0a6' : '#6c6c6c';
  const LN = dark ? '#34353a' : '#e4e2db';
  const CB = dark ? '#26272b' : '#f0efe9';
  return `(function(){
    var ID="__privoo_reader";
    var ex=document.getElementById(ID);
    if(ex){ ex.remove(); document.documentElement.style.overflow=ex.dataset.po||""; return "closed"; }
    if(location.protocol==="privoo:"||location.protocol==="about:") return "no-article";

    function tl(el){ return ((el&&el.innerText)||"").trim().length; }
    var best=null,score=0,i;
    var sem=document.querySelectorAll("article,[role='main'],main,.post-content,.entry-content,.article-body,.article__body,#article");
    for(i=0;i<sem.length;i++){ var sc=tl(sem[i]); if(sc>score){score=sc;best=sem[i];} }
    if(!best||score<500){
      var divs=document.body?document.body.querySelectorAll("div,section,article"):[];
      for(i=0;i<divs.length;i++){
        var ps=divs[i].getElementsByTagName("p"),pt=0,j;
        for(j=0;j<ps.length;j++)pt+=tl(ps[j]);
        if(pt>score){score=pt;best=divs[i];}
      }
    }
    if(!best||score<250) return "no-article";

    var clone=best.cloneNode(true);
    var junk=clone.querySelectorAll("script,style,noscript,iframe,form,nav,aside,footer,header,button,input,svg,[role='navigation'],[aria-hidden='true'],[class*='share'],[class*='social'],[class*='comment'],[class*='related'],[class*='promo'],[class*='advert'],[class*='newsletter'],[id*='comment']");
    for(i=0;i<junk.length;i++)junk[i].remove();

    var h1=document.querySelector("h1");
    var title=((h1&&h1.innerText)||document.title||"").trim();
    var site=location.hostname; if(site.indexOf("www.")===0)site=site.slice(4);
    var bl=document.querySelector("[rel='author'],.byline,.author-name,[itemprop='author']");
    var by=bl?((bl.innerText||"").trim().slice(0,140)):"";
    var po=document.documentElement.style.overflow;

    var o=document.createElement("div");
    o.id=ID; o.dataset.po=po;
    o.style.cssText="position:fixed;inset:0;z-index:2147483646;overflow-y:auto;background:${BG};color:${FG}";
    o.innerHTML=
      "<div id='__pr_wrap' style='max-width:720px;margin:0 auto;padding:58px 26px 140px;font:19px/1.72 Georgia,serif'>"+
        "<div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:28px;font:600 12px system-ui,sans-serif;letter-spacing:.4px;color:${MU}'>"+
          "<span>PRIVOO READER</span>"+
          "<span>"+
            "<button id='__pr_a' title='Smaller text' style='font:600 13px system-ui;color:${FG};background:none;border:1px solid ${LN};border-radius:13px;width:30px;height:30px;cursor:pointer'>A-</button> "+
            "<button id='__pr_b' title='Larger text' style='font:600 15px system-ui;color:${FG};background:none;border:1px solid ${LN};border-radius:13px;width:30px;height:30px;cursor:pointer'>A+</button> "+
            "<button id='__pr_x' style='font:600 13px system-ui;color:#4c8bf5;background:none;border:1px solid ${LN};border-radius:15px;padding:7px 14px;cursor:pointer'>Close</button>"+
          "</span>"+
        "</div>"+
        "<h1 id='__pr_h' style='font:800 35px/1.24 system-ui,sans-serif;margin:0 0 12px'></h1>"+
        "<div id='__pr_by' style='font:14px system-ui,sans-serif;color:${MU};margin-bottom:4px'></div>"+
        "<div style='height:1px;background:${LN};margin:24px 0 34px'></div>"+
        "<div id='__pr_body'></div>"+
        "<div style='margin-top:64px;padding-top:20px;border-top:1px solid ${LN};font:12px system-ui,sans-serif;color:${MU}'>Cleaned up by Privoo Reader from "+site+". The original page is untouched underneath.</div>"+
      "</div>";
    o.querySelector("#__pr_h").textContent=title;
    var byEl=o.querySelector("#__pr_by");
    if(by)byEl.textContent=by; else byEl.style.display="none";
    var bodyEl=o.querySelector("#__pr_body");
    bodyEl.appendChild(clone);

    var im=bodyEl.querySelectorAll("img"),k;
    for(k=0;k<im.length;k++){ im[k].style.maxWidth="100%"; im[k].style.height="auto"; im[k].style.margin="20px 0"; im[k].style.borderRadius="6px"; im[k].removeAttribute("width"); im[k].removeAttribute("height"); }
    var aa=bodyEl.querySelectorAll("a"); for(k=0;k<aa.length;k++)aa[k].style.color="#4c8bf5";
    var pp=bodyEl.querySelectorAll("p,li"); for(k=0;k<pp.length;k++)pp[k].style.margin="0 0 22px";
    var hh=bodyEl.querySelectorAll("h1,h2,h3,h4"); for(k=0;k<hh.length;k++){ hh[k].style.font="800 25px/1.3 system-ui,sans-serif"; hh[k].style.margin="36px 0 14px"; }
    var pr=bodyEl.querySelectorAll("pre"); for(k=0;k<pr.length;k++)pr[k].style.cssText="background:${CB};padding:14px;border-radius:8px;overflow-x:auto;font:14px ui-monospace,Consolas,monospace";
    var bq=bodyEl.querySelectorAll("blockquote"); for(k=0;k<bq.length;k++)bq[k].style.cssText="border-left:3px solid #4c8bf5;margin:24px 0;padding:4px 0 4px 20px;color:${MU}";

    var fs=19, wrap=o.querySelector("#__pr_wrap");
    function setFs(d){ fs=Math.max(14,Math.min(26,fs+d)); wrap.style.fontSize=fs+"px"; }
    function close(){ o.remove(); document.documentElement.style.overflow=po; }
    o.querySelector("#__pr_x").onclick=close;
    o.querySelector("#__pr_a").onclick=function(){ setFs(-1); };
    o.querySelector("#__pr_b").onclick=function(){ setFs(1); };
    document.addEventListener("keydown",function esc(e){
      if(e.key==="Escape"&&document.getElementById(ID)){ close(); document.removeEventListener("keydown",esc); }
    });

    document.documentElement.style.overflow="hidden";
    document.documentElement.appendChild(o);
    return "open";
  })();`;
}
function openMobileView() {
  const tab = activeTab();
  if (!tab?.url || tab.url.startsWith('privoo://') || tab.url.startsWith('about:')) return;
  window.privoo.openMobileWindow(tab.url).catch?.(() => {});
}

function toggleReaderMode() {
  const tab = activeTab();
  if (!tab || !tab.wv) return;
  const url = tab.url || '';
  if (url.startsWith('privoo://') || url.startsWith('about:')) {
    privooToast('Reader mode works on web articles');
    return;
  }
  tab.wv.executeJavaScript(readerModeScript(!!settings?.darkMode)).then((r) => {
    if (r === 'no-article') privooToast("Reader mode couldn't find an article here");
    else if (r === 'open')   privooToast('Reader mode on — press Esc to exit');
  }).catch(() => {});
}

// ─── Full-page screenshot ─────────────────────────────────────────────────
async function captureFullPage() {
  const tab = activeTab();
  if (!tab || !tab.wv) return;
  const url = tab.url || '';
  if (url.startsWith('privoo://') || url.startsWith('about:')) {
    privooToast('Screenshots work on web pages');
    return;
  }
  let wcId;
  try { wcId = tab.wv.getWebContentsId(); } catch { return; }
  privooToast('Capturing full page…');
  let res;
  try { res = await window.privoo.captureFullPage(wcId); }
  catch (e) { res = { ok: false, error: String(e?.message || e) }; }
  if (res?.ok) privooToast('Screenshot saved');
  else if (!res?.canceled) privooToast('Screenshot failed: ' + (res?.error || 'unknown error'));
}

// ─── Tab search / quick-switcher ──────────────────────────────────────────
const tabSearchEl = document.getElementById('tab-search');
const tsInput = document.getElementById('ts-input');
const tsList  = document.getElementById('ts-list');
let tsResults = [];
let tsSel = 0;

function tabSearchOpen() { return tabSearchEl && !tabSearchEl.classList.contains('hidden'); }
function openTabSearch() {
  if (!tabSearchEl) return;
  if (tabSearchOpen()) { closeTabSearch(); return; }
  closePopovers();
  tabSearchEl.classList.remove('hidden');
  tsInput.value = '';
  renderTabSearch('');
  setTimeout(() => tsInput.focus(), 0);
}
function closeTabSearch() {
  tabSearchEl?.classList.add('hidden');
}
function renderTabSearch(q) {
  const query = q.trim().toLowerCase();
  tsResults = tabs.filter((t) => {
    if (!query) return true;
    return (t.title || '').toLowerCase().includes(query)
        || (t.url || '').toLowerCase().includes(query);
  });
  tsSel = 0;
  tsList.innerHTML = '';
  if (!tsResults.length) {
    tsList.innerHTML = '<div class="ts-empty">No matching tabs</div>';
    return;
  }
  tsResults.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'ts-item' + (i === tsSel ? ' sel' : '');
    const fav = document.createElement('div');
    fav.className = 'ts-fav';
    if (t.faviconUrl) fav.style.backgroundImage = `url("${t.faviconUrl}")`;
    const meta = document.createElement('div');
    meta.className = 'ts-meta';
    const ti = document.createElement('div');
    ti.className = 'ts-title';
    ti.textContent = t.title || 'New tab';
    const u = document.createElement('div');
    u.className = 'ts-url';
    u.textContent = displayUrl(t.url) || '';
    meta.appendChild(ti);
    meta.appendChild(u);
    row.appendChild(fav);
    row.appendChild(meta);
    if (t.id === activeId) {
      const b = document.createElement('span');
      b.className = 'ts-badge';
      b.textContent = 'Current';
      row.appendChild(b);
    }
    row.addEventListener('mouseenter', () => { tsSel = i; paintTsSel(); });
    row.addEventListener('click', () => { activateTab(t.id); closeTabSearch(); });
    tsList.appendChild(row);
  });
}
function paintTsSel() {
  [...tsList.children].forEach((c, i) => c.classList?.toggle('sel', i === tsSel));
  tsList.children[tsSel]?.scrollIntoView({ block: 'nearest' });
}
if (tsInput) {
  tsInput.addEventListener('input', () => renderTabSearch(tsInput.value));
  tsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeTabSearch(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); tsSel = Math.min(tsSel + 1, tsResults.length - 1); paintTsSel(); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); tsSel = Math.max(tsSel - 1, 0); paintTsSel(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const t = tsResults[tsSel];
      if (t) { activateTab(t.id); closeTabSearch(); }
    }
  });
}
tabSearchEl?.addEventListener('mousedown', (e) => {
  if (e.target === tabSearchEl) closeTabSearch();
});

// ─── Split View ───────────────────────────────────────────────────────────
// Two tabs side by side with a draggable divider. The pane positions are
// fixed (left tab stays left, right tab stays right). Whichever pane's tab is
// the active one in the tab strip is the "focused" pane — the address bar and
// toolbar drive that one. Click the other pane's tab to drive it instead;
// switch to any non-pane tab to leave Split View.
let splitLeftId = null;
let splitRightId = null;
let splitRatio = 0.5;
const splitDivider = document.getElementById('split-divider');

function isSplit() {
  return splitLeftId != null && splitRightId != null
    && !!getTab(splitLeftId) && !!getTab(splitRightId)
    && splitLeftId !== splitRightId;
}

function setPaneBox(wv, leftPx, widthPx) {
  // setProperty with !important so nothing in the cascade (the default
  // `inset:0; width:100%` rule for webviews, transparency mode overrides,
  // anything) can override the explicit pane positioning.
  wv.style.setProperty('left',   leftPx + 'px',   'important');
  wv.style.setProperty('width',  widthPx + 'px',  'important');
  wv.style.setProperty('right',  'auto',          'important');
  wv.style.setProperty('top',    '0',             'important');
  wv.style.setProperty('bottom', 'auto',          'important');
  wv.style.setProperty('height', '100%',          'important');
}
function clearPaneBox(wv) {
  for (const p of ['left','width','right','top','bottom','height']) {
    wv.style.removeProperty(p);
  }
}

function layoutSplit() {
  if (!isSplit()) { exitSplitView(); return; }
  const left = getTab(splitLeftId);
  const right = getTab(splitRightId);
  const w = viewsEl.clientWidth;
  const divX = Math.round(w * splitRatio);
  for (const t of tabs) {
    const isPane = (t.id === splitLeftId || t.id === splitRightId);
    t.wv.classList.toggle('split-pane', isPane);
    t.wv.classList.toggle('split-focused', isPane && t.id === activeId);
    if (isPane) {
      t.wv.classList.remove('inactive');
    } else {
      t.wv.classList.add('inactive');
      clearPaneBox(t.wv);
    }
  }
  setPaneBox(left.wv,  0,         Math.max(0, divX - 3));
  setPaneBox(right.wv, divX + 3,  Math.max(0, w - divX - 3));
  splitDivider.hidden = false;
  splitDivider.style.left = divX + 'px';
}

function enterSplitView() {
  const cur = activeTab();
  if (!cur) return;
  const li = tabs.findIndex((t) => t.id === cur.id);
  let other = tabs[li + 1] || tabs[li - 1] || null;
  if (!other) other = createTab(defaultNewTabUrl(), false);
  if (!other || other.id === cur.id) return;
  splitLeftId = cur.id;
  splitRightId = other.id;
  splitRatio = 0.5;
  viewsEl.classList.add('split');
  layoutSplit();
  privooToast('Split View — click a pane’s tab to control that side, or any other tab to exit');
}

function exitSplitView() {
  splitLeftId = splitRightId = null;
  viewsEl.classList.remove('split', 'split-dragging');
  if (splitDivider) splitDivider.hidden = true;
  for (const t of tabs) {
    t.wv.classList.remove('split-pane', 'split-focused');
    clearPaneBox(t.wv);
    t.wv.classList.toggle('inactive', t.id !== activeId);
  }
}

function toggleSplitView() {
  if (!tabs.length) return;
  isSplit() ? exitSplitView() : enterSplitView();
}

// Called from activateTab BEFORE activeId changes. Activating a pane tab
// keeps the split (activateTab re-runs layoutSplit afterwards); activating
// any other tab ends it.
function splitExitOnActivate(id) {
  if (!isSplit()) return;
  if (id !== splitLeftId && id !== splitRightId) exitSplitView();
}
function splitExitOnClose(id) {
  if (isSplit() && (id === splitLeftId || id === splitRightId)) exitSplitView();
}
if (splitDivider) {
  splitDivider.addEventListener('mousedown', (e) => {
    if (!isSplit()) return;
    e.preventDefault();
    viewsEl.classList.add('split-dragging');
    const move = (ev) => {
      const r = viewsEl.getBoundingClientRect();
      let ratio = (ev.clientX - r.left) / r.width;
      splitRatio = Math.max(0.2, Math.min(0.8, ratio));
      layoutSplit();
    };
    const up = () => {
      viewsEl.classList.remove('split-dragging');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
}
window.addEventListener('resize', () => { if (isSplit()) layoutSplit(); });

// Clicking into either split pane focuses it — the address bar and toolbar
// then drive whichever side you're actually working in, so typing never
// lands in the wrong pane.
viewsEl.addEventListener('focusin', (e) => {
  if (!isSplit()) return;
  const t = tabs.find((tt) => tt.wv === e.target);
  if (t && (t.id === splitLeftId || t.id === splitRightId) && t.id !== activeId) {
    activateTab(t.id);
  }
});

window.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;

  if (e.key === 'Escape' && tabSearchOpen()) { closeTabSearch(); return; }

  if (e.key === 'Escape' && document.activeElement !== omnibox) {
    // Close the customize panel first if it's open — closePopovers doesn't
    // touch the side panel (it lives outside the popover system).
    if (cpPanel && !cpPanel.hidden && !cpPanel.classList.contains('hidden')) {
      closeCustomizePanel();
      return;
    }
    closePopovers();
    return;
  }

  if (mod && e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); if (closedStack.length) createTab(closedStack.pop()); return; }
  // Privoo extras — Shift combos must precede the plain Ctrl shortcuts below
  // (Ctrl+R reload etc. don't check Shift, so they'd otherwise swallow these).
  if (mod && e.shiftKey && e.key.toLowerCase() === 'r') { e.preventDefault(); toggleReaderMode(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'e') { e.preventDefault(); toggleSplitView(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); captureFullPage(); return; }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); openTabSearch(); return; }
  if (mod && e.key.toLowerCase() === 't') { e.preventDefault(); createTab(); return; }
  if (mod && e.key.toLowerCase() === 'w') { e.preventDefault(); if (activeId) closeTab(activeId); return; }
  if (mod && e.key.toLowerCase() === 'r') { e.preventDefault(); activeTab()?.wv.reload(); return; }
  if (mod && e.key.toLowerCase() === 'l') { e.preventDefault(); omnibox.focus(); return; }
  if (mod && e.key.toLowerCase() === 'h') { e.preventDefault(); createTab(HISTORY_URL); return; }
  if (mod && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    const was = !dlPopover?.classList.contains('hidden');
    closePopovers();
    if (!was) {
      dlPopover?.classList.remove('hidden');
      fillDlPopover();
    }
    return;
  }
  // Ctrl/Cmd + Shift + N → new incognito window (matches Chrome's shortcut).
  // Must come BEFORE the plain Ctrl+N rule or it'd be eaten by it.
  if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
    e.preventDefault();
    window.privoo.openIncognitoWindow?.().catch(() => {});
    return;
  }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); createTab(); return; }
  if (mod && e.key === '+') { e.preventDefault(); activeTab()?.wv.setZoomLevel((activeTab()?.wv.getZoomLevel() || 0) + 1); return; }
  if (mod && e.key === '-') { e.preventDefault(); activeTab()?.wv.setZoomLevel((activeTab()?.wv.getZoomLevel() || 0) - 1); return; }
  if (mod && e.key === '0') { e.preventDefault(); activeTab()?.wv.setZoomLevel(0); return; }
  if (e.key === 'F5')  { e.preventDefault(); activeTab()?.wv.reload(); return; }
  if (e.key === 'F12') {
    // openDockedDevTools toggles DevTools on/off itself.
    const t = activeTab();
    if (t) openDockedDevTools(t);
    return;
  }
  // Ctrl/Cmd + Period → open emoji picker (matches Windows Win+. and Chrome's accel)
  if (mod && (e.key === '.' || e.key === '>')) {
    e.preventDefault();
    if (emojiPickerEl && !emojiPickerEl.classList.contains('hidden')) closeEmojiPicker();
    else openEmojiPicker(activeTab()?.wv);
    return;
  }
  if (e.altKey && e.key === 'ArrowLeft')  { const w = activeTab()?.wv; if (w?.canGoBack()) w.goBack(); return; }
  if (e.altKey && e.key === 'ArrowRight') { const w = activeTab()?.wv; if (w?.canGoForward()) w.goForward(); return; }

  // Ctrl+1-8 switch to tab, Ctrl+9 last tab
  if (mod && e.key >= '1' && e.key <= '8') { const t = tabs[parseInt(e.key) - 1]; if (t) activateTab(t.id); return; }
  if (mod && e.key === '9') { if (tabs.length) activateTab(tabs[tabs.length - 1].id); return; }

  // Tab cycling
  if (mod && !e.shiftKey && e.key === 'Tab') { e.preventDefault(); const i = tabs.findIndex(t => t.id === activeId); activateTab(tabs[(i + 1) % tabs.length]?.id); return; }
  if (mod && e.shiftKey  && e.key === 'Tab') { e.preventDefault(); const i = tabs.findIndex(t => t.id === activeId); activateTab(tabs[(i - 1 + tabs.length) % tabs.length]?.id); return; }
});

// ─── Main-process push events ────────────────────────────────────────────────
window.privoo.onOpenTab((url) => createTab(url));

// Forward keyboard shortcuts that were captured inside webviews back into
// the host renderer's keydown handler. before-input-event in main fires for
// every keypress in the guest contents; we re-dispatch a synthetic event so
// the existing window.addEventListener('keydown') logic runs unchanged.
window.privoo.onWebviewShortcut?.((k) => {
  try {
    const ev = new KeyboardEvent('keydown', {
      key: k.key,
      altKey: !!k.alt,
      shiftKey: !!k.shift,
      ctrlKey: !!k.ctrl,
      metaKey: !!k.meta,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(ev);
  } catch { /* ignore */ }
});
// Maximized state — drop the rounded corners when maximized so the window
// sits edge-to-edge with no see-through gaps at the screen border.
window.privoo.onWindowState((maximized) => {
  document.body.classList.toggle('maximized', !!maximized);
  document.documentElement.classList.toggle('maximized', !!maximized);
});
window.privoo.onDownloadUpdate((dl) => onDownloadUpdate(dl));
window.privoo.onSettingsChanged((next) => onSettingsChanged(next));
window.privoo.onGoogleAuthDone?.(() => {
  const tab = activeTab();
  if (tab?.wv) try { tab.wv.reload(); } catch { /* ignore */ }
});
window.privoo.onPlatform?.((platform) => {
  document.body.classList.toggle('platform-mac', platform === 'darwin');
  document.body.classList.toggle('platform-win', platform === 'win32');
  document.body.classList.toggle('platform-linux', platform === 'linux');
  // Mirror platform onto <html> so the corner-rounding rules can target it.
  document.documentElement.classList.toggle('platform-win', platform === 'win32');
  document.documentElement.classList.toggle('platform-mac', platform === 'darwin');
  const wc = document.getElementById('window-controls');
  if (wc) wc.hidden = platform === 'darwin';
});
// Increase Transparency — main flips the OS material (acrylic / vibrancy)
// and sends us this signal so the toolbar / tab strip / popovers can switch
// to translucent rgba() backgrounds.
window.privoo.onTransparencyState?.((on) => {
  document.body.classList.toggle('transparent-ui', !!on);
  // Also clip the <html> element — without this the rectangular html fill
  // shows as a hard square just outside the body's rounded corners.
  document.documentElement.classList.toggle('transparent-ui-host', !!on);
});

// Incognito window — main fires this once on did-finish-load if the window
// is private. We flip body.incognito for the purple chrome tint + titlebar
// pill, and stash the private partition name so every tab/webview created
// afterwards runs inside that non-persistent session.
window.privoo.onIncognitoMode?.((data) => {
  const on = data && typeof data === 'object' ? !!data.on : !!data;
  document.body.classList.toggle('incognito', on);
  if (on && data && data.partition) {
    window.__privooIncognitoPartition = data.partition;
  }
});
window.privoo.onBrowsingDataCleared(() => {
  for (const tab of tabs) {
    if (tab.url === HISTORY_URL || tab.url === DOWNLOADS_URL) tab.wv.reload();
  }
});

// When system-browser sign-in completes, open accounts.google.com in a new tab
// so the user can finish the lightweight "continue" step inside Privoo
window.privoo.onGoogleSignInSystemDone?.((data) => {
  const continueUrl = data?.continueUrl || 'https://www.google.com';
  window.privoo.googleSignInGetUrl(continueUrl).then((url) => {
    createTab(url);
  }).catch(() => {
    createTab('https://accounts.google.com');
  });
});

// ─── Google sign-in via system browser ───────────────────────────────────────
async function handleGoogleSignIn() {
  closePopovers();
  const continueUrl = activeTab()?.url?.startsWith('http') ? activeTab().url : 'https://www.google.com';
  try {
    const result = await window.privoo.googleSignIn(continueUrl);
    if (!result?.ok) {
      console.warn('Privoo: Google sign-in failed to start:', result?.error);
    }
  } catch (err) {
    console.error('Privoo: handleGoogleSignIn error:', err);
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function esc(s) {
  // Also escape single quotes (`) so output is safe inside both single- and
  // double-quoted HTML attributes. Some templates use the single-quoted
  // variant for embedded JSON/URLs.
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Boot ────────────────────────────────────────────────────────────────────
// Apply incognito chrome immediately at parse time (before first paint) so
// the private window never flashes the normal light theme. The partition is
// available synchronously from the preload.
if (window.privoo?.incognitoPartition) {
  window.__privooIncognitoPartition = window.privoo.incognitoPartition;
  document.body.classList.add('incognito');
}

function applyPlatformChrome(platform) {
  document.body.classList.toggle('platform-mac', platform === 'darwin');
  document.body.classList.toggle('platform-win', platform === 'win32');
  document.body.classList.toggle('platform-linux', platform === 'linux');
  const wc = document.getElementById('window-controls');
  if (wc) wc.hidden = platform === 'darwin';
}

(async () => {
  await loadSettings();
  try {
    const platform = await window.privoo.getPlatform?.();
    if (platform) applyPlatformChrome(platform);
  } catch { /* ignore */ }
  window.privoo.onPlatform?.(applyPlatformChrome);
  await ensureDisclaimer();

  let restored = false;
  // Incognito windows always start fresh — they have no saved session and
  // shouldn't inherit the normal window's tabs. Restore is also gated on
  // the "Restore tabs on launch" setting (default on).
  const isIncognitoWin = !!(window.privoo?.incognitoPartition);
  if (!isIncognitoWin && settings?.restoreTabsOnLaunch !== false) {
    try {
      const saved = await window.privoo.getTabSession();
      restored = await restoreSession(saved);
    } catch { /* ignore */ }
  }
  if (!restored) createTab();
  refreshStats();
  setInterval(refreshStats, 1500);
  // Incognito windows never persist their tab list — that would leak the
  // private session into the saved session restored by normal windows.
  if (!isIncognitoWin) {
    setInterval(() => { window.privoo.saveTabSession(serializeSession()).catch?.(() => {}); }, 5000);
  }
  const tabsScrollEl = document.getElementById('tabs-scroll');
  if (tabsScrollEl) new ResizeObserver(() => resizeTabs()).observe(tabsScrollEl);
})();

// ─── Vertical Tabs ───────────────────────────────────────────────────────────

function applyVerticalTabs(on) {
  document.body.classList.toggle('vertical-tabs', on);
  if (vtabsPanel) vtabsPanel.hidden = !on;
  if (on) renderVtabs();
}

let _vtabsRafPending = false;
function renderVtabs() {
  if (!vtabsList || !document.body.classList.contains('vertical-tabs')) return;
  if (_vtabsRafPending) return;
  _vtabsRafPending = true;
  requestAnimationFrame(_doRenderVtabs);
}

function _doRenderVtabs() {
  _vtabsRafPending = false;
  if (!vtabsList || !document.body.classList.contains('vertical-tabs')) return;

  const pinned    = tabs.filter(t => t.pinned);
  const ungrouped = tabs.filter(t => !t.pinned && !t.groupId);
  const grouped   = tabs.filter(t => !t.pinned && t.groupId);

  // Build ordered list of desired items with stable keys
  const desired = [];
  if (pinned.length) {
    desired.push({ key: '__pinned-label__', make: () => {
      const el = document.createElement('div');
      el.className = 'vtabs-section-label';
      el.textContent = 'Pinned';
      el.dataset.vtabKey = '__pinned-label__';
      return el;
    }});
    for (const t of pinned) desired.push({ key: `tab-${t.id}`, tab: t });
    desired.push({ key: '__pinned-divider__', make: () => {
      const el = document.createElement('div');
      el.className = 'vtabs-section-divider';
      el.dataset.vtabKey = '__pinned-divider__';
      return el;
    }});
  }
  for (const t of ungrouped) desired.push({ key: `tab-${t.id}`, tab: t });
  const seenGroups = [];
  const buckets = new Map();
  for (const t of grouped) {
    if (!buckets.has(t.groupId)) { seenGroups.push(t.groupId); buckets.set(t.groupId, []); }
    buckets.get(t.groupId).push(t);
  }
  for (const gid of seenGroups) {
    const g = tabGroups.find(x => x.id === gid);
    if (g) desired.push({ key: `group-${gid}`, group: g });
    for (const t of (buckets.get(gid) || [])) desired.push({ key: `tab-${t.id}`, tab: t });
  }

  // Index all existing keyed nodes
  const existingByKey = new Map();
  for (const el of vtabsList.querySelectorAll('[data-vtab-key]')) {
    existingByKey.set(el.dataset.vtabKey, el);
  }

  const usedKeys = new Set();
  const newEls = [];

  // Single forward pass: reuse/update existing nodes, insert new ones, reorder with insertBefore
  let cursor = vtabsList.firstChild;
  for (const item of desired) {
    usedKeys.add(item.key);
    let el;
    if (existingByKey.has(item.key)) {
      el = existingByKey.get(item.key);
      if (item.tab) _updateVtabEl(el, item.tab);
      if (item.group) {
        const nameEl = el.querySelector('.vtab-group-name');
        if (nameEl) nameEl.textContent = item.group.name || 'Group';
      }
    } else {
      if (item.tab) {
        el = _makeVtabEl(item.tab);
      } else if (item.group) {
        el = _makeVtabGroupEl(item.group);
        el.dataset.vtabKey = item.key;
      } else {
        el = item.make();
      }
      newEls.push(el);
    }
    // Move to correct position if not already there
    if (el !== cursor) {
      vtabsList.insertBefore(el, cursor || null);
    } else {
      cursor = el.nextSibling;
    }
  }

  // Remove stale nodes that are no longer in the desired list
  for (const [key, el] of existingByKey) {
    if (!usedKeys.has(key)) el.remove();
  }

  // Trigger enter animation on new tab nodes only, after the browser paints them
  if (newEls.length) {
    requestAnimationFrame(() => {
      for (const el of newEls) {
        if (el.classList.contains('vtab')) el.classList.add('vtab-enter');
      }
    });
  }
}

function _updateVtabEl(el, tab) {
  const isActive = tab.id === activeId;
  let cls = 'vtab';
  if (isActive) cls += ' active';
  if (tab.pinned) cls += ' vtab-pinned';
  if (tab.groupId) {
    const g = tabGroups.find(x => x.id === tab.groupId);
    if (g) {
      el.style.setProperty('--vtab-group-color', g.solid || g.color || '#5f6368');
      cls += ' vtab-grouped';
    }
  } else {
    el.style.removeProperty('--vtab-group-color');
  }
  el.className = cls;
  const titleEl = el.querySelector('.vtab-title');
  if (titleEl) titleEl.textContent = tab.title || 'New Tab';
  const favEl = el.querySelector('.vtab-favicon');
  if (favEl) {
    const newSrc = tab.faviconUrl || VTAB_DEFAULT_FAVICON;
    if (favEl.src !== newSrc) favEl.src = newSrc;
  }
}

function _makeVtabEl(tab) {
  const el = document.createElement('div');
  el.className = 'vtab' + (tab.id === activeId ? ' active' : '') + (tab.pinned ? ' vtab-pinned' : '');
  el.dataset.tabId = String(tab.id);
  el.dataset.vtabKey = `tab-${tab.id}`;

  if (tab.groupId) {
    const g = tabGroups.find(x => x.id === tab.groupId);
    if (g) {
      el.style.setProperty('--vtab-group-color', g.solid || g.color || '#5f6368');
      el.classList.add('vtab-grouped');
    }
  }

  const fav = document.createElement('img');
  fav.className = 'vtab-favicon';
  fav.src = tab.faviconUrl || VTAB_DEFAULT_FAVICON;
  fav.alt = '';
  fav.addEventListener('error', () => { fav.src = VTAB_DEFAULT_FAVICON; });
  el.appendChild(fav);

  const titleEl = document.createElement('span');
  titleEl.className = 'vtab-title';
  titleEl.textContent = tab.title || 'New Tab';
  el.appendChild(titleEl);

  if (tab.pinned) {
    const pin = document.createElement('span');
    pin.className = 'vtab-pin-icon';
    pin.innerHTML = `<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5l-2 3h4v5l1 1 1-1v-5h4l-2-3z"/></svg>`;
    el.appendChild(pin);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'vtab-close';
  closeBtn.type = 'button';
  closeBtn.title = 'Close tab';
  closeBtn.innerHTML = `<svg viewBox="0 0 14 14" width="10" height="10"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
  el.appendChild(closeBtn);

  el.addEventListener('click', (e) => {
    if (e.target.closest('.vtab-close')) { closeTab(tab.id); return; }
    activateTab(tab.id);
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openTabContextMenu(e.clientX, e.clientY, tab.id);
  });
  return el;
}

function _makeVtabGroupEl(g) {
  const el = document.createElement('div');
  el.className = 'vtab-group-header';
  el.dataset.groupId = String(g.id);
  el.style.setProperty('--vtab-group-color', g.solid || g.color || '#5f6368');

  const dot = document.createElement('span');
  dot.className = 'vtab-group-dot';
  el.appendChild(dot);

  const name = document.createElement('span');
  name.className = 'vtab-group-name';
  name.textContent = g.name || 'Group';
  el.appendChild(name);

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openGroupContextMenu(g.id);
  });
  return el;
}

vtabsNewBtn?.addEventListener('click', () => createTab());

document.getElementById('vtabs-collapse')?.addEventListener('click', async () => {
  document.body.classList.toggle('vtabs-collapsed');
  await window.privoo?.saveSettings({ vtabsCollapsed: document.body.classList.contains('vtabs-collapsed') });
});

// ─── Inline AI Panel ─────────────────────────────────────────────────────────

let _aiPanelInited = false;
let _aiConfig = { provider: 'anthropic', model: 'claude-sonnet-4-6', hasKey: false, hasKeyFor: {}, accepted: false };
let _aiMessages = [];
let _aiBusy = false;

const AI_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6 — balanced (recommended)' },
    { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7 — most capable' },
    { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5 — fastest' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku' },
  ],
  openai: [
    { id: 'gpt-4o-mini',   label: 'GPT-4o mini — fast & low cost (recommended)' },
    { id: 'gpt-4o',        label: 'GPT-4o — flagship' },
    { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
    { id: 'gpt-4.1-mini',  label: 'GPT-4.1 mini' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo — cheapest' },
  ],
  deepseek: [
    { id: 'deepseek-chat',     label: 'DeepSeek V3 — general chat (recommended)' },
    { id: 'deepseek-v4',       label: 'DeepSeek V4 — latest' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1 — step-by-step reasoning' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — fast (recommended)' },
    { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro — most capable' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro' },
  ],
};
const AI_DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o-mini',
  deepseek:  'deepseek-chat',
  gemini:    'gemini-2.0-flash',
};
const AI_KEY_HINTS = {
  anthropic: 'Get a key from <b>console.anthropic.com</b>',
  openai:    'Get a key from <b>platform.openai.com</b>',
  deepseek:  'Get a key from <b>platform.deepseek.com</b>',
  gemini:    'Get a key from <b>aistudio.google.com</b>',
};
const AI_PROVIDER_LABELS = { anthropic: 'Claude', openai: 'GPT (OpenAI)', deepseek: 'DeepSeek', gemini: 'Gemini' };

function _aiEl(id) { return document.getElementById(id); }

function _aiModelLabel(provider, modelId) {
  const m = (AI_MODELS[provider] || []).find(x => x.id === modelId);
  return m ? m.label.split(' — ')[0] : (modelId || '');
}

function _aiFillModels(provider, selected) {
  const sel = _aiEl('ai-model');
  if (!sel) return;
  sel.innerHTML = '';
  const list = AI_MODELS[provider] || [];
  for (const m of list) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.label;
    sel.appendChild(o);
  }
  if (selected && !list.some(m => m.id === selected)) {
    const o = document.createElement('option');
    o.value = selected; o.textContent = selected + ' — saved';
    sel.appendChild(o);
  }
  sel.value = selected || AI_DEFAULT_MODELS[provider] || (list[0]?.id) || '';
}

function _aiRefreshStatus() {
  const pill   = _aiEl('ai-status');
  const text   = _aiEl('ai-status-text');
  const dot    = pill?.querySelector('.ai-dot');
  if (!pill || !text) return;
  if (_aiConfig.hasKey) {
    pill.className = 'ai-pill ai-pill-ok';
    text.innerHTML =
      '<b>' + (AI_PROVIDER_LABELS[_aiConfig.provider] || _aiConfig.provider) + '</b>' +
      '<span class="ai-pill-model">' + _aiModelLabel(_aiConfig.provider, _aiConfig.model) + '</span>';
  } else {
    pill.className = 'ai-pill ai-pill-no';
    text.textContent = 'No API key — click Setup';
  }
}

function _aiRenderChat() {
  const inner = _aiEl('ai-chat-inner');
  if (!inner) return;
  inner.innerHTML = '';
  if (!_aiMessages.length) {
    const e = document.createElement('div');
    e.className = 'ai-empty';
    e.innerHTML =
      '<div class="ai-empty-mark"><svg viewBox="0 0 24 24" width="24" height="24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg></div>' +
      '<h3>How can I help?</h3>' +
      '<p>Ask anything — summaries, ideas, code. Powered by your own API key.</p>' +
      '<div class="ai-chips" id="ai-chips"></div>';
    inner.appendChild(e);
    ['Explain a concept', 'Summarize text', 'Write some code', 'Brainstorm ideas'].forEach(c => {
      const b = document.createElement('button');
      b.className = 'ai-chip'; b.type = 'button'; b.textContent = c;
      b.addEventListener('click', () => {
        const inp = _aiEl('ai-input');
        if (inp) { inp.value = c + ': '; inp.focus(); }
      });
      e.querySelector('#ai-chips').appendChild(b);
    });
    return;
  }
  for (const m of _aiMessages) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-msg ' + (m.role === 'user' ? 'ai-user' : m.role === 'err' ? 'ai-err' : 'ai-assistant');
    const av = document.createElement('div'); av.className = 'ai-av';
    if (m.role === 'user') av.textContent = 'You';
    else if (m.role === 'err') av.textContent = '!';
    else av.textContent = 'AI';
    const b = document.createElement('div'); b.className = 'ai-bubble'; b.textContent = m.content;
    wrap.appendChild(av); wrap.appendChild(b);
    inner.appendChild(wrap);
  }
  const area = _aiEl('ai-chat-area');
  if (area) area.scrollTop = area.scrollHeight;
}

async function _aiSend() {
  if (_aiBusy) return;
  const inp = _aiEl('ai-input');
  const text = inp?.value?.trim();
  if (!text) return;
  if (!_aiConfig.hasKey) {
    _aiMessages.push({ role: 'err', content: '⚠ Add your API key first — click Setup.' });
    _aiRenderChat();
    _aiOpenGate();
    return;
  }
  _aiMessages.push({ role: 'user', content: text });
  if (inp) { inp.value = ''; inp.style.height = 'auto'; }
  _aiRenderChat();
  _aiBusy = true;
  const sendBtn = _aiEl('ai-send');
  if (sendBtn) sendBtn.disabled = true;
  // Typing indicator
  const area = _aiEl('ai-chat-area');
  const typing = document.createElement('div');
  typing.className = 'ai-msg ai-typing';
  typing.innerHTML = '<div class="ai-av">AI</div><div class="ai-bubble"><span class="ai-dots"><i></i><i></i><i></i></span></div>';
  _aiEl('ai-chat-inner')?.appendChild(typing);
  if (area) area.scrollTop = area.scrollHeight;
  let res;
  try {
    res = await window.privoo.aiChat({ messages: _aiMessages.map(m => ({ role: m.role, content: m.content })) });
  } catch (e) { res = { ok: false, error: String(e?.message || e) }; }
  typing.remove();
  if (res?.ok) {
    _aiMessages.push({ role: 'assistant', content: res.text || '(empty response)' });
  } else if (res?.error === 'NO_KEY') {
    _aiMessages.push({ role: 'err', content: '⚠ Add your API key first — click Setup.' });
    _aiOpenGate();
  } else {
    _aiMessages.push({ role: 'err', content: '⚠ ' + (res?.error || 'Request failed.') });
  }
  _aiBusy = false;
  if (sendBtn) sendBtn.disabled = false;
  _aiRenderChat();
}

function _aiOpenGate() {
  const gate = _aiEl('ai-gate');
  if (!gate) return;
  const provSel = _aiEl('ai-provider');
  if (provSel) provSel.value = _aiConfig.provider;
  _aiFillModels(_aiConfig.provider, _aiConfig.model);
  const keyInp = _aiEl('ai-apikey');
  if (keyInp) {
    keyInp.value = '';
    keyInp.placeholder = _aiConfig.hasKeyFor?.[_aiConfig.provider] ? 'Key saved — leave blank to keep' : 'Paste your key';
  }
  const hint = _aiEl('ai-model-hint');
  if (hint) hint.innerHTML = AI_KEY_HINTS[_aiConfig.provider] || '';
  const title = _aiEl('ai-gate-title');
  if (title) title.textContent = _aiConfig.hasKey ? 'AI settings' : 'Connect an AI';
  gate.hidden = false;
  setTimeout(() => keyInp?.focus(), 50);
}

function initAiPanel() {
  if (_aiPanelInited) return;
  _aiPanelInited = true;

  // Close button
  _aiEl('ai-panel-close')?.addEventListener('click', () => toggleAiPanel());

  // New chat
  _aiEl('ai-new-chat')?.addEventListener('click', () => {
    if (_aiBusy) return;
    _aiMessages = [];
    _aiRenderChat();
    _aiEl('ai-input')?.focus();
  });

  // Setup button
  _aiEl('ai-cfg-btn')?.addEventListener('click', _aiOpenGate);

  // Provider change in gate
  _aiEl('ai-provider')?.addEventListener('change', () => {
    const p = _aiEl('ai-provider')?.value;
    if (!p) return;
    _aiFillModels(p, p === _aiConfig.provider ? _aiConfig.model : null);
    const hint = _aiEl('ai-model-hint');
    if (hint) hint.innerHTML = AI_KEY_HINTS[p] || '';
    const keyInp = _aiEl('ai-apikey');
    if (keyInp) keyInp.placeholder = _aiConfig.hasKeyFor?.[p] ? 'Key saved — leave blank to keep' : 'Paste your key';
  });

  // Gate save
  _aiEl('ai-gate-save')?.addEventListener('click', async () => {
    const provider = _aiEl('ai-provider')?.value;
    const model    = _aiEl('ai-model')?.value?.trim() || AI_DEFAULT_MODELS[provider];
    const apiKey   = _aiEl('ai-apikey')?.value?.trim();
    const patch    = { provider, model, accepted: true };
    if (apiKey) patch.apiKey = apiKey;
    try { _aiConfig = await window.privoo.aiSetConfig(patch); } catch {}
    _aiRefreshStatus();
    const gate = _aiEl('ai-gate');
    if (gate) gate.hidden = true;
  });

  // Gate later
  _aiEl('ai-gate-later')?.addEventListener('click', async () => {
    const p = _aiEl('ai-provider')?.value || _aiConfig.provider;
    try { _aiConfig = await window.privoo.aiSetConfig({ provider: p, accepted: true }); } catch {}
    _aiRefreshStatus();
    const gate = _aiEl('ai-gate');
    if (gate) gate.hidden = true;
  });

  // Send button
  _aiEl('ai-send')?.addEventListener('click', _aiSend);

  // Textarea: Enter sends, Shift+Enter newline; auto-resize
  const inp = _aiEl('ai-input');
  inp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _aiSend(); }
  });
  inp?.addEventListener('input', () => {
    if (!inp) return;
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 110) + 'px';
  });

  // Load config and init state
  window.privoo.aiGetConfig?.().then((cfg) => {
    if (cfg) _aiConfig = cfg;
    _aiRefreshStatus();
    _aiRenderChat();
    if (!_aiConfig.hasKey && !_aiConfig.accepted) _aiOpenGate();
    _aiEl('ai-input')?.focus();
  }).catch(() => { _aiRenderChat(); });
}

function toggleAiPanel() {
  if (!aiPanel) return;
  const opening = aiPanel.hidden;
  aiPanel.hidden = !opening;
  if (aiBtn) aiBtn.classList.toggle('ai-active', opening);
  if (opening) initAiPanel();
}

// AI toolbar button click
aiBtn?.addEventListener('click', toggleAiPanel);
