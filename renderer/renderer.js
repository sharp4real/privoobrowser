'use strict';

// ─── Internal page URLs ──────────────────────────────────────────────────────
const NEWTAB_URL     = 'privoo://newtab/';
const SETTINGS_URL   = 'privoo://settings/';
const DOWNLOADS_URL  = 'privoo://downloads/';
const HISTORY_URL    = 'privoo://history/';
const EXTENSIONS_URL = 'privoo://extensions/';
const BOOKMARKS_URL  = 'privoo://bookmarks/';
const AI_URL         = 'privoo://ai/';

// Default favicon shown for internal pages and when a real favicon fails to load
const VTAB_DEFAULT_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16' height='16'%3E%3Cpath fill='%235f6368' d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z'/%3E%3C/svg%3E";
// Favicons for Privoo's own pages, each drawn in the CURRENT accent colour so
// they update live when the user changes their accent (settings gets a gear,
// history a clock, etc.). Only the SVG path is stored; the colour is baked in
// at build time from _pvAccent.
let _pvAccent = '#4f46e5';
let _lucidPrev = null; // tracks Lucid Mode on/off to inject/clean up live on toggle
function _pvIcon(path) {
  const col = encodeURIComponent(_pvAccent || '#4f46e5');
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='" + col + "' d='" + encodeURIComponent(path) + "'%3E%3C/path%3E%3C/svg%3E";
}
// The pine-shield fallback (shield body in the accent, white check on top).
function _pvShield() {
  const col = encodeURIComponent(_pvAccent || '#4f46e5');
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='" + col + "' d='M12 2 4 5v6c0 5 3.4 9.4 8 10.6 4.6-1.2 8-5.6 8-10.6V5l-8-3z'/%3E%3Cpath fill='%23fff' d='M10.6 15.4 7.4 12.2l1.3-1.3 1.9 1.9 4-4 1.3 1.3z'/%3E%3C/svg%3E";
}
const PRIVOO_PAGE_PATHS = {
  settings:    'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
  history:     'M13 3a9 9 0 1 0 8.94 10h-2.02A7 7 0 1 1 13 5c1.93 0 3.68.78 4.95 2.05L14 11h7V4l-2.64 2.64A8.98 8.98 0 0 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
  downloads:   'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z',
  bookmarks:   'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z',
  extensions:  'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z',
  ai:          'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zm6.5 11 .9 2.4L22 17.3l-2.6.9-.9 2.4-.9-2.4-2.6-.9 2.6-.9.9-2.4z',
  blocked:     'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  insecure:    'M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4a3 3 0 0 1 3 3v2h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h1V8a3 3 0 0 1 3-3z',
  error:       'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
  upgrading:   'M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-8-2a2 2 0 0 1 4 0v2h-4V6z',
  news:        'M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1v4h2v-4h1l5 3V6L8 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z',
};
function faviconForPrivooUrl(url) {
  try {
    const host = new URL(url).hostname;
    if (host === 'incognito') return _pvShield();
    const p = PRIVOO_PAGE_PATHS[host];
    return p ? _pvIcon(p) : _pvShield();
  } catch { return _pvShield(); }
}
// When the accent changes, repaint the favicons of every open Privoo page.
function refreshPrivooFavicons() {
  for (const t of tabs) {
    if (!t.url || !t.url.startsWith('privoo://')) continue;
    const icon = faviconForPrivooUrl(t.url);
    t.faviconUrl = icon;
    const favEl = t.tabEl?.querySelector('.favicon');
    if (favEl) favEl.style.backgroundImage = 'url("' + icon + '")';
  }
  if (typeof renderVtabs === 'function') renderVtabs();
}
// New-tab label — "Incognito" in a private window, "New Private Tab" otherwise.
function newTabLabel() {
  return document.body.classList.contains('incognito') ? 'Incognito' : 'New Private Tab';
}

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
    // TikTok's risk engine treats heavy canvas noise as an automation signal
    // and locks the login verification step ("maximum number of attempts
    // reached") — the same wall Brave users hit with shields up. Same
    // compromise as Google: keep farbling ON but below the alarm threshold.
    var _isTikTok = /(^|\\.)(tiktok\\.com|tiktokv\\.com|tiktokcdn\\.com)$/i.test(_host);
    var _farblingIntensity = (_isGoogle || _isTikTok) ? 2 : 16; // Much lighter on Google/TikTok

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

// ── Lucid Mode ──────────────────────────────────────────────────────────────
// Hover the TOP of a video and a star fades in; click it for a slider that
// enhances the picture — clarity (contrast), colour (saturation) and a touch
// of brightness. IMPORTANT: it uses only colour filters, never an SVG
// reference filter (url(#…)) — those render the video BLACK on hardware-
// composited players like YouTube and darken it. Strength persists per-site.
const LUCID_MODE_JS = String.raw`(function(){
  if (window.__privooLucid) return; window.__privooLucid = 1;
  var KEY='privoo_lucid_strength';
  function get(){ var v=parseFloat(localStorage.getItem(KEY)); return isNaN(v)?0:Math.max(0,Math.min(1,v)); }
  function set(v){ try{ localStorage.setItem(KEY,String(v)); }catch(e){} }
  function css(s){ if(s<=0) return ''; return 'contrast('+(1+0.20*s).toFixed(3)+') saturate('+(1+0.35*s).toFixed(3)+') brightness('+(1+0.06*s).toFixed(3)+')'; }
  // The filter lives in a stylesheet rule with !important, NOT in the video's
  // inline style. YouTube's player rewrites the <video> style attribute on every
  // resize/quality change/SPA navigation, which silently wiped an inline filter
  // (and there was no attribute observer to put it back) — that is why Lucid
  // appeared to do nothing on YouTube. A stylesheet rule survives all of that.
  var styleEl=null;
  function applyAll(){
    var f=css(get());
    if(!styleEl||!styleEl.isConnected){
      styleEl=document.getElementById('__pl_css');
      if(!styleEl){
        styleEl=document.createElement('style'); styleEl.id='__pl_css';
        (document.head||document.documentElement).appendChild(styleEl);
      }
    }
    var rule=f?('video{filter:'+f+' !important}'):'';
    if(styleEl.textContent!==rule) styleEl.textContent=rule;
    // Clear any inline filter left behind by an older build of this script.
    document.querySelectorAll('video[style*="filter"]').forEach(function(v){ v.style.filter=''; });
  }
  var star=document.createElement('div'); star.id='__pl_star';
  star.style.cssText='position:fixed;z-index:2147483000;width:34px;height:34px;border-radius:9px;display:none;align-items:center;justify-content:center;cursor:pointer;background:rgba(18,20,18,.72);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:0;transition:opacity .16s';
  star.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6.9L22 9.3l-5.5 4.8L18.2 21 12 17.3 5.8 21l1.7-6.9L2 9.3l7.1-.4z"/></svg>';
  var panel=document.createElement('div'); panel.id='__pl_panel';
  panel.style.cssText='position:fixed;z-index:2147483000;display:none;flex-direction:column;gap:7px;padding:10px 12px;border-radius:11px;background:rgba(18,20,18,.9);color:#fff;font:600 11px/1.2 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5);width:186px';
  panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><span>Lucid Mode</span><span id="__pl_v"></span></div><input id="__pl_r" type="range" min="0" max="100" step="1" style="width:100%;accent-color:#4f46e5">';
  // Mount into the fullscreen element when one is active. A position:fixed node
  // parented to <body> is NOT rendered while another element is fullscreen, so
  // without this the star vanished the moment you went fullscreen on YouTube.
  function mountRoot(){
    return document.fullscreenElement || document.webkitFullscreenElement || document.body || document.documentElement;
  }
  function mount(){
    var root=mountRoot(); if(!root) return;
    if(star.parentNode!==root) root.appendChild(star);
    if(panel.parentNode!==root) root.appendChild(panel);
  }
  mount();
  document.addEventListener('fullscreenchange', mount, true);
  document.addEventListener('webkitfullscreenchange', mount, true);
  var range=panel.querySelector('#__pl_r'), valEl=panel.querySelector('#__pl_v');
  function syncPanel(){ var s=get(); range.value=Math.round(s*100); valEl.textContent=s<=0?'Off':Math.round(s*100)+'%'; star.style.color=s>0?'#beb3ff':'#fff'; }
  range.addEventListener('input',function(){ set(range.value/100); syncPanel(); applyAll(); });
  var cur=null;
  // Find the video whose box contains (x,y) — bounding-box hit-test works even
  // when the site's controls sit on top of the <video> (YouTube, etc.).
  function videoAt(x,y){
    var best=null,bestA=0,vids=document.querySelectorAll('video'),i,v,r,a;
    for(i=0;i<vids.length;i++){ v=vids[i]; r=v.getBoundingClientRect();
      if(r.width<160||r.height<100) continue;
      if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom){ a=r.width*r.height; if(a>bestA){bestA=a;best=v;} }
    }
    return best;
  }
  function show(){
    if(!cur||!cur.isConnected){ hide(); return; }
    var r=cur.getBoundingClientRect();
    // Top-LEFT of the video, not centred: YouTube parks its own title/channel
    // overlay dead centre at the top of the player, and a centred star landed
    // underneath it (and on top of the title, which is worse).
    var sx=Math.max(6,Math.min(r.left+14,window.innerWidth-40));
    star.style.left=sx+'px'; star.style.top=(r.top+12)+'px';
    star.style.display='flex'; star.style.opacity='1'; star.style.color=get()>0?'#beb3ff':'#fff';
    if(panel.style.display==='flex'){ panel.style.left=Math.max(6,Math.min(sx,window.innerWidth-192))+'px'; panel.style.top=(r.top+52)+'px'; }
  }
  function hide(){ star.style.opacity='0'; star.style.display='none'; panel.style.display='none'; cur=null; }
  // Show only while the cursor is over the TOP band of a video (or over our own
  // star/panel). Move away from the top and it fades out.
  document.addEventListener('mousemove',function(e){
    var t=e.target;
    if(t===star||star.contains(t)||t===panel||panel.contains(t)) return; // keep while on our UI
    var v=videoAt(e.clientX,e.clientY);
    if(v){ var r=v.getBoundingClientRect(); if(e.clientY<=r.top+Math.max(64,Math.min(130,r.height*0.3))){ cur=v; show(); return; } }
    if(panel.style.display!=='flex') hide();
  },true);
  // Keep the star glued to the video while it's shown (scroll / resize). Also
  // re-attach our nodes if the page tore them out — YouTube is an SPA and swaps
  // large parts of the DOM on navigation, which was silently removing the star.
  function follow(){
    mount();
    if(cur&&(star.style.display==='flex'||panel.style.display==='flex')){ if(!cur.isConnected) hide(); else show(); }
    requestAnimationFrame(follow);
  }
  requestAnimationFrame(follow);
  star.addEventListener('click',function(e){ e.stopPropagation(); e.preventDefault(); syncPanel(); panel.style.display=(panel.style.display==='flex')?'none':'flex'; show(); });
  document.addEventListener('click',function(e){ if(panel.style.display==='flex'&&e.target!==star&&!star.contains(e.target)&&e.target!==panel&&!panel.contains(e.target)) panel.style.display='none'; },true);
  applyAll();
  var raf=0; new MutationObserver(function(){ if(raf) return; raf=requestAnimationFrame(function(){ raf=0; applyAll(); }); }).observe(document.documentElement,{childList:true,subtree:true});
})();`;

// Turn Lucid Mode off live (without a reload): remove its UI and clear filters.
const LUCID_CLEANUP_JS = String.raw`(function(){ try{
  window.__privooLucid=0;
  document.querySelectorAll('video').forEach(function(v){ v.style.filter=''; });
  ['__pl_star','__pl_panel','__pl_svg','__pl_css'].forEach(function(id){ var e=document.getElementById(id); if(e) e.remove(); });
}catch(e){} })();`;

// ── YouTube black-frame fix ──────────────────────────────────────────────────
// The classic "black video until I refresh" is a GPU compositing cold-start on
// the first video of a session: the player is decoding audio+video but the
// video layer never gets a paint. Refreshing re-triggers the decode with a warm
// GPU. This nudges the video's own compositing layer right after playback
// starts (a couple of times, because the first frame is the flaky one), which
// forces that missing paint — clearing the black frame WITHOUT a reload.
// ── YouTube ad skipper ───────────────────────────────────────────────────────
// Network filters cannot remove modern YouTube ads. They are stitched into the
// SAME stream as the video, described in the /youtubei/v1/player response, which
// we deliberately allowlist because blocking it breaks playback outright. So the
// ad arrives as part of the legitimate video and has to be dealt with in-page.
//
// Three things happen here, in order of preference:
//   1. Click the real Skip button the moment it appears.
//   2. For unskippable ads, seek to the end of the ad segment. YouTube treats a
//      seek past the ad duration as the ad having been watched, and moves on.
//   3. Mute while an ad is on screen, restoring the previous state after, so a
//      seek that lands mid-roll never blasts audio.
const YOUTUBE_ADSKIP_JS = String.raw`(function(){
  if(window.__privooYtAds) return; window.__privooYtAds=1;

  // ── 1. Cosmetic: the ad slots that are just page furniture ──────────────
  // These are same-origin YouTube components, so the network blocker never
  // sees them — they have to be removed here or not at all.
  var CSS = [
    "ytd-ad-slot-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-promoted-sparkles-text-search-renderer",
    "ytd-promoted-video-renderer",
    "ytd-companion-slot-renderer",
    "ytd-action-companion-ad-renderer",
    "ytd-banner-promo-renderer",
    "ytd-statement-banner-renderer",
    "ytd-primetime-promo-renderer",
    "ytd-merch-shelf-renderer",
    "ytd-engagement-panel-section-list-renderer[target-id='engagement-panel-ads']",
    "ytd-rich-item-renderer:has(ytd-ad-slot-renderer)",
    "ytd-reel-video-renderer:has(.ytd-ad-slot-renderer)",
    "#masthead-ad",
    "#player-ads",
    "#panels-full-bleed-container ytd-ad-slot-renderer",
    ".ytp-ad-module",
    ".ytp-ad-overlay-slot",
    ".ytd-video-masthead-ad-v3-renderer",
    "ytm-promoted-video-renderer"
  ].join(",") + "{display:none !important}";
  try{
    var st = document.createElement("style");
    st.id = "privoo-yt-ads";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }catch(e){}

  // ── 2. In-stream: skip, seek past, or outrun the ad ─────────────────────
  var SKIP_SELECTORS = [
    ".ytp-ad-skip-button-modern",
    ".ytp-skip-ad-button",
    ".ytp-ad-skip-button",
    ".ytp-ad-skip-button-slot button",
    "button.ytp-ad-skip-button-modern",
    ".ytp-ad-survey-answer-selector-skip-button"
  ];
  var OVERLAY_SELECTORS = [
    ".ytp-ad-overlay-close-button",
    ".ytp-ad-overlay-slot .ytp-ad-overlay-close-container",
    ".ytp-ad-visit-advertiser-button + .ytp-ad-overlay-close-button"
  ];

  var wasMuted = null;
  var wasRate  = null;

  function player(){ return document.querySelector("#movie_player") || document.querySelector(".html5-video-player"); }
  function video(){ return document.querySelector(".html5-main-video") || document.querySelector("video"); }

  function adShowing(){
    var p = player();
    if(!p) return false;
    return p.classList.contains("ad-showing")
        || p.classList.contains("ad-interrupting")
        || !!document.querySelector(".ytp-ad-player-overlay, .ytp-ad-player-overlay-layout");
  }

  function clickFirst(sels){
    for(var i=0;i<sels.length;i++){
      var el = document.querySelector(sels[i]);
      if(el && el.offsetParent !== null){ try{ el.click(); return true; }catch(e){} }
    }
    return false;
  }

  function tick(){
    clickFirst(OVERLAY_SELECTORS);

    var v = video();
    if(!v) return;

    if(adShowing()){
      // Silence and speed it up first — that alone disposes of most ads
      // before the skip button is even eligible.
      if(wasMuted === null){ wasMuted = v.muted; wasRate = v.playbackRate; }
      v.muted = true;
      try{ if(v.playbackRate < 16) v.playbackRate = 16; }catch(e){}

      if(clickFirst(SKIP_SELECTORS)) return;

      // Unskippable: jump to the end. Guarded on a finite duration so this
      // can never seek the real video and never touches a live stream.
      var d = v.duration;
      if(isFinite(d) && d > 0 && v.currentTime < d - 0.15){
        try{ v.currentTime = d; }catch(e){}
      }
      return;
    }

    // Back to real content: undo everything, restoring the user's own rate
    // rather than assuming it was 1x.
    if(wasMuted !== null){
      try{ v.muted = wasMuted; }catch(e){}
      try{ v.playbackRate = (wasRate && isFinite(wasRate)) ? wasRate : 1; }catch(e){}
      wasMuted = null; wasRate = null;
    }
  }

  // A short interval beats MutationObserver here: the ad state lives in a class
  // on the player, which changes without any DOM mutation we could observe
  // cheaply. 200ms is fast enough that an ad is gone before it registers.
  setInterval(tick, 200);
  tick();

  // ── 3. The "ad blockers violate YouTube Terms" interstitial ─────────────
  // It pauses playback until acknowledged, so it has to go promptly.
  setInterval(function(){
    var dlg = document.querySelector("tp-yt-paper-dialog, ytd-enforcement-message-view-model, ytd-popup-container tp-yt-paper-dialog");
    if(!dlg) return;
    var txt = (dlg.innerText||"").toLowerCase();
    if(txt.indexOf("ad blocker") === -1 && txt.indexOf("ad blockers") === -1) return;
    var btn = dlg.querySelector("button, tp-yt-paper-button, yt-button-shape button");
    if(btn){ try{ btn.click(); }catch(e){} }
    try{ dlg.remove(); }catch(e){}
    // The overlay leaves the page scroll-locked behind it.
    try{ document.body.style.overflow = ""; }catch(e){}
    var v = video();
    if(v && v.paused){ try{ v.play(); }catch(e){} }
  }, 1000);

  // YouTube is a single-page app: the player survives navigation, so the
  // loops above keep running — but re-assert the stylesheet, because a route
  // change can rebuild <head> and drop it.
  window.addEventListener("yt-navigate-finish", function(){
    if(!document.getElementById("privoo-yt-ads")){
      try{
        var s2 = document.createElement("style");
        s2.id = "privoo-yt-ads";
        s2.textContent = CSS;
        (document.head || document.documentElement).appendChild(s2);
      }catch(e){}
    }
  }, true);
})`;

const YOUTUBE_FIX_JS = String.raw`(function(){
  if(window.__privooYtFix) return; window.__privooYtFix=1;

  // Cheap recovery: bounce the video's compositing layer.
  function poke(v){ if(!v||!v.isConnected) return; var t=v.style.transform||'';
    v.style.transform='translateZ(0)';
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ v.style.transform=t; }); }); }

  // Hard recovery, for when the layer bounce wasn't enough. Detaching the
  // element from layout and re-attaching forces Chromium to build a brand new
  // compositing layer, and a sub-frame seek forces a fresh decode + paint into
  // it. Together these clear a stuck black frame without reloading the page
  // (and without losing playback position).
  function hardPoke(v){
    if(!v||!v.isConnected) return;
    try{
      var d=v.style.display;
      v.style.display='none';
      void v.offsetHeight;          // force the style/layout flush
      v.style.display=d;
    }catch(e){}
    try{
      if(v.seekable && v.seekable.length && v.duration && isFinite(v.duration)){
        var t=v.currentTime;
        if(t>0.2){ v.currentTime=Math.max(0,t-0.04); }
      }
    }catch(e){}
  }

  // Is the visible frame actually black? Sampling is the only way to know —
  // decode can be running perfectly while nothing reaches the screen. Reading
  // the canvas throws on DRM/tainted video, in which case we just skip
  // detection and fall back to the blind pokes below.
  var probe=null;
  function looksBlack(v){
    try{
      if(!v.videoWidth||!v.videoHeight) return false;
      if(!probe){ probe=document.createElement('canvas'); probe.width=32; probe.height=18; }
      var c=probe.getContext('2d',{willReadFrequently:true});
      if(!c) return false;
      c.drawImage(v,0,0,probe.width,probe.height);
      var d=c.getImageData(0,0,probe.width,probe.height).data, sum=0;
      for(var i=0;i<d.length;i+=4){ sum+=d[i]+d[i+1]+d[i+2]; }
      // Mean channel value across the thumbnail. Real frames — even dark
      // scenes and letterboxed content — sit well above this.
      return (sum/(d.length/4)/3) < 3;
    }catch(e){ return false; }   // tainted canvas (DRM) — cannot tell
  }

  var handled=null;
  function attach(){
    var v=document.querySelector('.html5-main-video')||document.querySelector('video');
    if(!v||v===handled) return;
    handled=v;

    // Blind pokes right after playback starts: the very first frame is the
    // flaky one, and this costs nothing when the video is already fine.
    function onPlay(){
      poke(v);
      setTimeout(function(){poke(v);},150);
      setTimeout(function(){poke(v);},600);
      setTimeout(function(){poke(v);},1400);
      watch(v);
    }
    v.addEventListener('playing', onPlay);
    v.addEventListener('loadeddata', function(){ setTimeout(function(){poke(v);},80); });
    // Returning to a backgrounded tab, and entering/leaving fullscreen, both
    // rebuild the video layer and are common ways to land on a black frame.
    document.addEventListener('visibilitychange', function(){
      if(!document.hidden){ setTimeout(function(){ poke(v); watch(v); },120); }
    });
    document.addEventListener('fullscreenchange', function(){
      setTimeout(function(){ poke(v); watch(v); },160);
    });
    if(v.readyState>=2 && !v.paused) onPlay();
  }

  // Escalating watchdog: sample a few times over ~6s and only act when the
  // frame really is black while decode is advancing. Stops as soon as a real
  // frame appears, so a healthy video is left completely alone.
  var watching=0;
  function watch(v){
    if(watching) clearInterval(watching);
    var tries=0, lastFrames=-1, escalated=false;
    watching=setInterval(function(){
      if(!v.isConnected||v.paused||++tries>12){ clearInterval(watching); watching=0; return; }
      var frames=-1;
      try{ frames=v.getVideoPlaybackQuality?v.getVideoPlaybackQuality().totalVideoFrames:-1; }catch(e){}
      var decoding = frames<0 || frames!==lastFrames;
      lastFrames=frames;
      if(!decoding) return;               // still buffering, not our problem
      if(!looksBlack(v)){ clearInterval(watching); watching=0; return; }
      if(!escalated){ escalated=true; poke(v); }
      else { hardPoke(v); }
    },500);
  }

  attach();
  // YouTube is a single-page app — re-attach when the watched video changes.
  document.addEventListener('yt-navigate-finish', function(){ handled=null; setTimeout(attach,400); }, true);
  var n=0, iv=setInterval(function(){ attach(); if(++n>16) clearInterval(iv); }, 400);
})();`;

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
// Re-spread tabs to fit the strip (Chrome-style shrink) whenever one is added
// or removed — the single reliable trigger, independent of the create / close /
// activate / drag code paths. Debounced to one call per frame.
if (tabsEl) {
  let _tabResizeRaf = 0;
  new MutationObserver(() => {
    if (_tabResizeRaf) return;
    _tabResizeRaf = requestAnimationFrame(() => { _tabResizeRaf = 0; resizeTabs(); });
  }).observe(tabsEl, { childList: true });
}
const viewsEl      = document.getElementById('views');
const omnibox      = document.getElementById('omnibox');
const siteIcon         = document.getElementById('site-icon');
const SITE_ICON_STROKE = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
// Sliders, not a padlock and not an "i".
//
// A padlock overstates what it knows: HTTPS says the connection is encrypted,
// not that the site is safe or honest, and every phishing page has one too —
// which is why Chrome and Safari both dropped theirs.
//
// An "i" was the first replacement here, and it undersold the control: it
// reads as a footnote, something to hover for a definition, when the thing it
// opens is where you grant or revoke this site's camera, location and
// notifications. Sliders say "settings for this page", which is what the panel
// actually is, and it is the glyph Chrome settled on for the same reason.
const SITE_ICON_SETTINGS_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" ${SITE_ICON_STROKE}><path d="M5 7.5h5.2"/><path d="M13.8 7.5H19"/><path d="M5 16.5h3.4"/><path d="M12 16.5h7"/><circle cx="12" cy="7.5" r="2.1"/><circle cx="10.2" cy="16.5" r="2.1"/></svg>`;
const SITE_ICON_SHIELD_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" ${SITE_ICON_STROKE}><path d="M12 3.2 5.2 6v5.2c0 4.3 2.8 8.1 6.8 9.3 4-1.2 6.8-5 6.8-9.3V6z"/></svg>`;
const siteInfoPopover  = document.getElementById('site-info-popover');
const backBtn      = document.getElementById('back');
const forwardBtn   = document.getElementById('forward');
const reloadBtn    = document.getElementById('reload');
const reloadIcon   = document.getElementById('reload-icon');
const homeBtn      = document.getElementById('home');
const newTabBtn    = document.getElementById('new-tab');
const shieldBtn    = document.getElementById('shield-btn');
const shieldPanel  = document.getElementById('shield-panel');
const vpnBtn       = document.getElementById('vpn-btn');
const vpnPanel     = document.getElementById('vpn-panel');
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
const geoDd             = document.getElementById('geo-dd');
const geoDdBtn          = document.getElementById('geo-dd-btn');
const geoDdMenu         = document.getElementById('geo-dd-menu');
const geoDdLabel        = document.getElementById('geo-dd-label');
const geoDdFlag         = document.getElementById('geo-dd-flag');
let   geoValue          = 'off';
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
// Island colours. New islands take these in order, so the first two you make
// are always visibly different from each other. Grey is last on purpose: as
// the opening colour it made a new island indistinguishable from the strip it
// was drawn on, which rather defeated the point.
const GROUP_COLORS = [
  { name: 'blue',   solid: '#4d8df6', tint: 'rgba(77,141,246,.22)'  },
  { name: 'green',  solid: '#4ade80', tint: 'rgba(74,222,128,.20)'  },
  { name: 'purple', solid: '#a78bfa', tint: 'rgba(167,139,250,.22)' },
  { name: 'orange', solid: '#fb923c', tint: 'rgba(251,146,60,.22)'  },
  { name: 'pink',   solid: '#f472b6', tint: 'rgba(244,114,182,.22)' },
  { name: 'cyan',   solid: '#2dd4bf', tint: 'rgba(45,212,191,.22)'  },
  { name: 'red',    solid: '#f87171', tint: 'rgba(248,113,113,.22)' },
  { name: 'yellow', solid: '#fbbf24', tint: 'rgba(251,191,36,.24)'  },
  { name: 'grey',   solid: '#8e8e99', tint: 'rgba(142,142,153,.20)' },
];
let ctxTabId    = null;
let saveSessionTimer = null;

// ─── Settings ────────────────────────────────────────────────────────────────
async function loadSettings() {
  const data = await window.privoo.getSettings();
  settings = data.settings;
  // Retire the old generated themes and their soundscapes. Keep a user's
  // wallpaper, chosen accent and dark mode; only the bundled theme system is
  // removed.
  if (settings?.ntpWaveEnabled || (settings?.ntpThemeMusic && settings.ntpThemeMusic !== 'none') || settings?.accentBeforeTheme) {
    const patch = {
      ntpWaveEnabled: false, ntpThemeId: '', ntpThemeMusic: 'none', vibeEnabled: false,
      accentColor: settings.accentBeforeTheme || settings.accentColor,
      accentBeforeTheme: '',
    };
    Object.assign(settings, patch);
    // setSettings, not saveSettings — there has never been a saveSettings on
    // the bridge, so the optional call quietly did nothing and this migration
    // re-ran on every launch.
    window.privoo.setSettings?.(patch)?.catch?.(() => {});
  }
  searchEngines = data.searchEngines;
  applyAppSettings();
  paintFeatures();
  initBgMusic();
}

document.getElementById('eb-close')?.addEventListener('click', dismissEyeBreak);

/* Right-click the AI button to unpin it. The moment somebody wants a button
   off a toolbar is the moment they are looking at that button, not the moment
   they think to go and find the page it is configured on. The Extensions page
   still has the switch, and turning it back on lives there. */
document.getElementById('ai-btn')?.addEventListener('contextmenu', async (e) => {
  e.preventDefault();
  const pick = await showHtmlMenu([
    { id: 'unpin', label: 'Unpin from toolbar' },
    { type: 'separator' },
    { id: 'manage', label: 'Manage extensions' },
  ], e.clientX, e.clientY);
  if (pick === 'unpin') {
    await saveBrowserSetting({ showAiButton: false });
    privooToast('Privoo AI unpinned. Turn it back on in Extensions.');
  } else if (pick === 'manage') {
    createTab(EXTENSIONS_URL);
  }
});

function applyAppSettings() {
  if (!settings) return;
  const isDark = !!settings.darkMode;
  document.body.classList.toggle('dark', isDark);
  document.documentElement.classList.toggle('dark', isDark);
  // Privoo One skin — floating content island + navy chrome (default on).
  // Privoo One is the browser's design language — always on (no legacy look).
  document.body.classList.add('privoo-one');
  document.body.classList.toggle('ui-compact', !!settings.compactMode);
  document.body.classList.toggle('has-vibe', !!settings.vibeEnabled);
  // Recompute the accent for the CURRENT dark/light state and theme —
  // without this, toggling dark mode alone left the accent using whichever
  // light/dark value was last computed. A manually picked accent swatch
  // always applies; selecting a Theme (ntpWaveEnabled) just sets accentColor
  // to match its palette, so both paths flow through the same value.
  applyAccentTriad(settings.accentColor);
  // Confine the ambient vibe gradient to the chrome when the user doesn't want
  // it bleeding over web pages (chrome surface tinting stays regardless).
  document.body.classList.toggle('vibe-chrome-only', settings.vibeOverPages === false);
  // Themed mode (a colour Theme is active) — extends the Vibe chrome tint up to
  // the tab strip so the whole browser shifts with the theme.
  document.body.classList.toggle('themed', false);
  // Chrome saturation follows the palette, so greyscale themes (Mono) stay grey
  // instead of picking up a hue tint from an arbitrary "vivid" colour.
  {
    let maxSat = 1;
    if (settings.ntpWaveEnabled && Array.isArray(settings.ntpWaveColors)) {
      maxSat = 0;
      for (const c of settings.ntpWaveColors) {
        const m = String(c).replace('#', '').match(/.{2}/g);
        if (!m) continue;
        const [r, g, b] = m.map(x => parseInt(x, 16) / 255);
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const s = mx ? (mx - mn) / mx : 0;
        if (s > maxSat) maxSat = s;
      }
    }
    document.documentElement.style.setProperty('--vibe-sat', String(Math.round(maxSat * 100) / 100));
  }
  // Apply vibe style class (glow/flow/aura/edge) — glow is default, no class needed
  document.body.classList.remove('vibe-flow', 'vibe-aura', 'vibe-edge');
  const vs = settings.vibeStyle || 'glow';
  if (vs !== 'glow') document.body.classList.add(`vibe-${vs}`);
  if (settings.vibeHue !== undefined) {
    document.documentElement.style.setProperty('--vibe-hue', String(settings.vibeHue));
  }
  document.documentElement.style.zoom = String(Math.max(0.85, Math.min(Number(settings.fontSizeScale) || 1, 1.25)));
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
  omnibox.placeholder = `Search ${engName} or enter an address`;
  // Lucid Mode — apply or remove live on toggle so it takes effect without a
  // page reload (the inject/cleanup scripts are idempotent).
  {
    const lucidOn = !!settings.lucidMode;
    if (_lucidPrev !== null && _lucidPrev !== lucidOn) {
      for (const t of tabs) {
        if (!t.ready || !t.wv || !t.url || t.url.startsWith('privoo://')) continue;
        t.wv.executeJavaScript(lucidOn ? LUCID_MODE_JS : LUCID_CLEANUP_JS).catch(() => {});
      }
    }
    _lucidPrev = lucidOn;
  }
  renderBookmarksBar();
  updateBookmarkButton();
  paintToolbarWidgets();
  applyVerticalTabs(!!settings.verticalTabs);
  document.body.classList.toggle('vtabs-collapsed', !!settings.vtabsCollapsed);
  document.body.classList.toggle('wobbly-windows', !!settings.wobblyWindows);
  const _translucent = !!settings.semiTransparent && _translucencyOk;
  applyCursorStyle(settings);
  applyVisionSettings(settings);
  applyNightLight(settings);
  applyEyeBreaks(settings);
  applyReadAloud(settings);
  document.documentElement.classList.toggle('semi-transparent-host', _translucent);
  document.body.classList.toggle('semi-transparent', _translucent);
  document.body.classList.toggle('low-end-device', !!settings.lowEndDevice);
  // Address-bar style: explicit searchBarStyle, else legacy newSearchBarStyle.
  const _sbs = settings.searchBarStyle || (settings.newSearchBarStyle ? 'soft' : 'classic');
  document.body.classList.toggle('new-search-bar', _sbs === 'soft');
  document.body.classList.remove('search-pill', 'search-square');
  if (_sbs === 'pill' || _sbs === 'square') document.body.classList.add('search-' + _sbs);
  // Search popup glass: `sp-glass` opts the popup INTO a translucent look even
  // when the rest of the UI isn't transparent; `sp-no-glass` forces it solid.
  document.body.classList.toggle('sp-glass', settings.searchPopupGlass !== false);
  document.body.classList.toggle('sp-no-glass', settings.searchPopupGlass === false);
  // Tab style customization removed — Privoo One's tab design is the only look.
  document.body.classList.remove('tabs-pill', 'tabs-underline', 'tabs-chrome', 'tabs-modern');
  // Font and custom CSS are applied via an injected stylesheet in
  // applyStyleCustomizations().
  applyStyleCustomizations();
  applyChromeWallpaper();
  applyThemeMusic();
  // Keep any open Discord tabs in sync with the live accent / theme palette.
  try { refreshDiscordThemeTabs(); } catch { /* ignore */ }
}

// Applies the user's raw custom CSS to a single injected <style>, wins over
// everything else since it's appended last.
function applyStyleCustomizations() {
  let el = document.getElementById('privoo-style-custom');
  if (!el) {
    el = document.createElement('style');
    el.id = 'privoo-style-custom';
    document.head.appendChild(el);
  }
  let css = '';
  if (settings?.customChromeCss) css += String(settings.customChromeCss) + '\n';
  el.textContent = css;
}

// Full-browser wallpaper — stretch the new-tab wallpaper behind the whole
// browser chrome (toolbar + tab strip). The host runs from file://, so we get a
// correctly-encoded file:// URL from main and use it for the image/video layer.
const WAVE_DEFAULT = ['#7c5cff', '#b14bff', '#ff5c9e', '#4bc5ff'];
// Curated themes: each has a name, a 4-colour palette, a visual style and its own
// looped soundscape. Shared by the Customize popup gallery.
const THEME_LIST = [
  { id: 'aurora',   name: 'Aurora',   colors: ['#7c5cff', '#b14bff', '#ff5c9e', '#4bc5ff'], style: 'aurora', sound: 'drift' },
  { id: 'neon',     name: 'Neon',     colors: ['#06111f', '#00e5ff', '#7c3cff', '#ff2bd6'], style: 'beams',  sound: 'pulse' },
  { id: 'sunset',   name: 'Sunset',   colors: ['#ff6a3d', '#ff2e63', '#a02cff', '#2c7bff'], style: 'waves',  sound: 'warm'  },
  { id: 'solar',    name: 'Solar',    colors: ['#301400', '#ff7a18', '#ffd166', '#fff3b0'], style: 'glow',   sound: 'solar' },
  { id: 'forest',   name: 'Forest',   colors: ['#0b6b3a', '#1f9d55', '#7ee787', '#c7f9cc'], style: 'glow',   sound: 'rain'  },
  { id: 'mint',     name: 'Mint',     colors: ['#033f3a', '#00c2a8', '#a7f3d0', '#f0fdfa'], style: 'aurora', sound: 'mist'  },
  { id: 'ocean',    name: 'Ocean',    colors: ['#012a4a', '#2563eb', '#0ea5e9', '#76e0f0'], style: 'waves',  sound: 'waves' },
  { id: 'lagoon',   name: 'Lagoon',   colors: ['#052e2b', '#0891b2', '#22d3ee', '#99f6e4'], style: 'waves',  sound: 'waves' },
  { id: 'ember',    name: 'Ember',    colors: ['#3a0ca3', '#f72585', '#ff6a3d', '#ffd166'], style: 'beams',  sound: 'warm'  },
  { id: 'orchid',   name: 'Orchid',   colors: ['#210124', '#7e22ce', '#d946ef', '#f0abfc'], style: 'aurora', sound: 'bloom' },
  { id: 'midnight', name: 'Midnight', colors: ['#0b1020', '#1e293b', '#334155', '#5b6b86'], style: 'glow',   sound: 'deep'  },
  { id: 'cyberpunk',name: 'Cyberpunk',colors: ['#0b0220', '#ff2bd6', '#7a2bff', '#00eaff'], style: 'glow',   sound: 'cyber' },
  { id: 'candy',    name: 'Candy',    colors: ['#ff5c9e', '#ff9ec7', '#a06bff', '#6bd5ff'], style: 'aurora', sound: 'chime' },
  { id: 'paper',    name: 'Paper',    colors: ['#f8fafc', '#e2e8f0', '#94a3b8', '#38bdf8'], style: 'solid',  sound: 'mist'  },
  { id: 'mono',     name: 'Mono',     colors: ['#101010', '#2b2b2b', '#484848', '#6c6c6c'], style: 'solid',  sound: 'none'  },
];
function applyWaveColors(el) {
  if (!el) return;
  const c = Array.isArray(settings?.ntpWaveColors) ? settings.ntpWaveColors : [];
  for (let i = 0; i < 4; i++) el.style.setProperty('--wave-' + (i + 1), c[i] || WAVE_DEFAULT[i]);
}
function themeVisualClass(id) {
  const clean = String(id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return clean ? ' tw-' + clean : '';
}

let _chromeWpReqId = 0;
async function applyChromeWallpaper() {
  const full    = !!settings?.ntpWallpaperFullBrowser;
  const wave    = false;
  const wpPath  = settings?.ntpWallpaperPath;
  // No shipped default any more: a wallpaper shows only if the user set one.
  const hasWp   = !!wpPath;
  const on      = full && (wave || hasWp);
  const isVideo = on && !wave && settings?.ntpWallpaperType === 'video';
  const imgEl  = document.getElementById('chrome-wallpaper');
  const vidEl  = document.getElementById('chrome-wallpaper-video');
  const waveEl = document.getElementById('chrome-wave');
  document.documentElement.classList.toggle('wallpaper-chrome-host', on);
  document.body.classList.toggle('wallpaper-chrome', on);
  // True whenever the new tab page has ANY custom background, whether or not it
  // is stretched over the chrome. Used to stop #views painting a near-black
  // fill behind a loading new tab, which flashed against a live wallpaper.
  document.body.classList.toggle(
    'ntp-has-wallpaper',
    !!settings?.ntpWaveEnabled || hasWp
  );
  document.body.classList.toggle('wallpaper-chrome-video', !!isVideo);
  document.body.classList.toggle('wallpaper-chrome-wave', !!wave);

  // Stop the video whenever we're not in video mode.
  if (!isVideo && vidEl) { try { vidEl.pause(); } catch {} vidEl.removeAttribute('src'); vidEl.dataset.ver = ''; }

  if (wave) {
    if (imgEl) imgEl.style.backgroundImage = '';
    if (waveEl) {
      const cols = Array.isArray(settings?.ntpWaveColors) ? settings.ntpWaveColors : WAVE_DEFAULT;
      const id = settings?.ntpThemeId;
      if (id) {
        waveEl.className = '';
        waveEl.style.background = "linear-gradient(135deg, " + cols.join(',') + ")";
      } else {
        waveEl.style.background = '';
        const st = settings?.ntpThemeStyle || 'aurora';
        waveEl.className = 'wave-bg ts-' + st + themeVisualClass(settings?.ntpThemeId) + (settings?.ntpWaveAnimate === false ? ' wave-static' : '');
        applyWaveColors(waveEl);
      }
    }
    return;
  }
  if (waveEl) { waveEl.className = ''; waveEl.style.background = ''; }

  if (!on) {
    if (imgEl) imgEl.style.backgroundImage = '';
    return;
  }
  // Resolve the on-disk file:// URL (guards against a stale path after switch).
  const reqId = ++_chromeWpReqId;
  let url = '';
  try { url = await window.privoo.getNtpWallpaperUrl?.(); } catch {}
  if (reqId !== _chromeWpReqId || !url) return;   // superseded or no wallpaper
  const ver = String(settings?.ntpWallpaperVersion || '1');
  if (isVideo) {
    if (imgEl) imgEl.style.backgroundImage = '';
    if (vidEl && vidEl.dataset.ver !== ver) {
      vidEl.dataset.ver = ver;
      vidEl.src = url;
      vidEl.load();
    }
    if (vidEl) { vidEl.muted = true; maybePlayChromeVideo(vidEl); }
  } else {
    if (imgEl) imgEl.style.backgroundImage = "url('" + url.replace(/'/g, "%27") + "')";
  }
}

function maybePlayChromeVideo(vid) {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { vid.pause(); return; }
    if (document.hidden) { vid.pause(); return; }
    const p = vid.play();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

// Pause the chrome live wallpaper when the window isn't visible — saves CPU/GPU.
document.addEventListener('visibilitychange', () => {
  const vid = document.getElementById('chrome-wallpaper-video');
  if (!vid || !document.body.classList.contains('wallpaper-chrome-video')) return;
  if (document.hidden) { try { vid.pause(); } catch {} }
  else maybePlayChromeVideo(vid);
});

// ── Ambient theme music ────────────────────────────────────────────────────
// A small *generative* engine (Web Audio) — no bundled audio files. Each sound
// is a soft drone plus an ever-changing melody that random-walks over a musical
// scale, so it evolves instead of holding one note. Everything runs through a
// reverb so it sounds like spacious ambience, not raw synth.
const ThemeAudio = (function () {
  let ctx = null, master = null, droneNodes = [], voices = [], stepTimer = null, curId = null, idx = 0;
  let lastNote = null, phrase = [], phraseAt = 0;

  const semi = (root, n) => root * Math.pow(2, n / 12);

  // root = base note (Hz); scale = semitone offsets; beat = ms between notes;
  // dur = note length (s); pad = drone intervals; noise = airy texture amount.
  const MUSIC = {
    drift: { root: 261.63, scale: [0, 2, 4, 7, 9, 12, 16], wave: 'sine',     beat: 1680, dur: 2.7, pad: [-12, -5, 0], noise: 0,    drift: 2 },
    warm:  { root: 196.00, scale: [0, 3, 5, 7, 10, 12, 15], wave: 'triangle', beat: 1980, dur: 3.0, pad: [-12, -5, 3], noise: 0,    drift: 3 },
    rain:  { root: 233.08, scale: [0, 2, 3, 5, 7, 10, 12], wave: 'sine',     beat: 1320, dur: 2.1, pad: [-12, -7, 0], noise: 0.045, drift: 2 },
    waves: { root: 174.61, scale: [0, 2, 4, 7, 9, 12, 14], wave: 'sine',     beat: 2220, dur: 3.4, pad: [-12, -5, 2], noise: 0.055, drift: 2 },
    deep:  { root: 130.81, scale: [0, 3, 7, 10, 12, 15], wave: 'sine',       beat: 2650, dur: 3.8, pad: [-24, -12, -5], noise: 0,  drift: 1 },
    chime: { root: 523.25, scale: [0, 4, 7, 9, 12, 16, 19], wave: 'triangle', beat: 1080, dur: 1.9, pad: [-12, 0, 7], noise: 0,    drift: 4 },
    pulse: { root: 246.94, scale: [0, 2, 5, 7, 10, 12, 14, 17], wave: 'sawtooth', beat: 880,  dur: 1.25, pad: [-12, -5], noise: 0.012, drift: 4 },
    solar: { root: 220.00, scale: [0, 2, 4, 7, 9, 11, 12, 16], wave: 'triangle', beat: 1520, dur: 2.35, pad: [-12, -5, 4], noise: 0, drift: 3 },
    mist:  { root: 293.66, scale: [0, 2, 5, 7, 9, 12, 14], wave: 'sine',     beat: 1820, dur: 2.9, pad: [-12, -7, 2], noise: 0.035, drift: 2 },
    bloom: { root: 329.63, scale: [0, 3, 5, 7, 10, 12, 17], wave: 'triangle', beat: 1420, dur: 2.4, pad: [-12, -5, 0], noise: 0, drift: 3 },
    cyber: { root: 277.18, scale: [0, 3, 6, 7, 10, 13, 14], wave: 'sawtooth', beat: 1180, dur: 1.8, pad: [-24, -12, -5], noise: 0.02, drift: 4 },
  };
  MUSIC.calm = MUSIC.drift; MUSIC.focus = MUSIC.drift; // legacy aliases

  function makeIR(seconds, decay) {
    const rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    const dry = ctx.createGain(); dry.gain.value = 0.62;
    const wet = ctx.createGain(); wet.gain.value = 0.6;
    const rev = ctx.createConvolver(); rev.buffer = makeIR(3.4, 2.6);
    master.connect(dry); dry.connect(ctx.destination);
    master.connect(rev); rev.connect(wet); wet.connect(ctx.destination);
    return ctx;
  }

  // One plucked/blown note with a soft attack + long release.
  function note(freq, wave, dur, gain, pan = 0, cutoff = 1600) {
    const o = ctx.createOscillator(); o.type = wave; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.5;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(f);
    if (p) { f.connect(p); p.pan.value = pan; p.connect(g); }
    else f.connect(g);
    g.connect(master);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.09 + Math.random() * 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.1);
    voices.push(o);
    o.onended = () => { try { o.disconnect(); f.disconnect(); p?.disconnect(); g.disconnect(); } catch {} voices = voices.filter(x => x !== o); };
  }

  function startDrone(cfg) {
    cfg.pad.forEach(s => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = semi(cfg.root, s);
      const g = ctx.createGain(); g.gain.value = 0.05;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
      const l = ctx.createOscillator(); l.frequency.value = 0.05;
      const lg = ctx.createGain(); lg.gain.value = 120;
      l.connect(lg); lg.connect(f.frequency); l.start();
      o.connect(g); g.connect(f); f.connect(master); o.start();
      droneNodes.push(o, g, f, l, lg);
    });
    if (cfg.noise) {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 720;
      const g = ctx.createGain(); g.gain.value = cfg.noise;
      src.connect(f); f.connect(g); g.connect(master); src.start();
      droneNodes.push(src, f, g);
    }
  }

  function step(cfg) {
    if (!phrase.length || phraseAt >= phrase.length || Math.random() < 0.14) {
      const len = 4 + Math.floor(Math.random() * 5);
      phrase = [];
      for (let i = 0; i < len; i++) {
        const leap = Math.random() < 0.28 ? cfg.drift : 1;
        idx += (Math.random() < 0.5 ? -1 : 1) * leap;
        idx = Math.max(0, Math.min(cfg.scale.length - 1, idx));
        phrase.push(idx);
      }
      phraseAt = 0;
    }

    let next = phrase[phraseAt++];
    if (next === lastNote) {
      next += Math.random() < 0.5 ? -1 : 1;
      next = Math.max(0, Math.min(cfg.scale.length - 1, next));
      if (next === lastNote) next = (next + 2) % cfg.scale.length;
    }
    idx = next;
    lastNote = next;

    const octave = Math.random() < 0.16 ? 12 : 0;
    const pan = (Math.random() - 0.5) * 0.8;
    const cutoff = 900 + Math.random() * 2200;
    note(semi(cfg.root, cfg.scale[idx] + octave), cfg.wave, cfg.dur * (0.85 + Math.random() * 0.35), 0.09 + Math.random() * 0.045, pan, cutoff);

    if (Math.random() < 0.42) {
      const harmonySteps = Math.random() < 0.55 ? 2 : 3;
      const up = cfg.scale[Math.min(cfg.scale.length - 1, idx + harmonySteps)] + (Math.random() < 0.22 ? 12 : 0);
      note(semi(cfg.root, up), cfg.wave === 'sawtooth' ? 'triangle' : cfg.wave, cfg.dur * 0.72, 0.045, -pan * 0.7, cutoff * 0.9);
    }
    if (Math.random() < 0.18) {
      const low = cfg.scale[Math.max(0, idx - 2)] - 12;
      note(semi(cfg.root, low), 'sine', cfg.dur * 1.25, 0.035, 0, 760);
    }
  }

  function scheduleStep(cfg) {
    if (!curId) return;
    step(cfg);
    const swing = cfg.beat * (0.72 + Math.random() * 0.62);
    stepTimer = setTimeout(() => scheduleStep(cfg), swing);
  }

  function clearAll() {
    if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; }
    droneNodes.forEach(n => { try { n.stop && n.stop(); } catch {} try { n.disconnect(); } catch {} });
    droneNodes = [];
    voices.forEach(o => { try { o.stop(); } catch {} });
    voices = [];
  }

  function start(id, vol) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const cfg = MUSIC[id] || MUSIC.drift;
    if (curId !== id) {
      clearAll();
      curId = id; idx = Math.floor(Math.random() * cfg.scale.length);
      lastNote = null; phrase = []; phraseAt = 0;
      startDrone(cfg);
      scheduleStep(cfg);
    }
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, vol)), now + 1.2);
  }
  function stop() {
    if (!ctx || !curId) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.7);
    curId = null;
    setTimeout(clearAll, 800);
  }
  return { start, stop, isPlaying: () => !!curId };
})();

// Short browser UI sounds for themed mode: typing, deleting, clicking, confirming.
// Separate from the background soundscape so the browser feels responsive without
// turning the ambience into a noisy loop.
const ThemeUiSfx = (function () {
  let ctx = null, out = null, lastAt = 0, lastKind = '';
  const scale = [0, 2, 4, 7, 9, 12];
  const PROFILES = {
    aurora:   { root: 330, wave: 'sine',     bright: 1800, click: [0, 7], type: [0, 4, 7], del: [-5, 0], gain: .045 },
    neon:     { root: 247, wave: 'square',   bright: 2600, click: [12, 19], type: [0, 7, 12], del: [-2, 5], gain: .034 },
    sunset:   { root: 220, wave: 'triangle', bright: 1600, click: [4, 9], type: [0, 3, 7], del: [-5, -2], gain: .045 },
    solar:    { root: 196, wave: 'triangle', bright: 2100, click: [7, 12], type: [0, 4, 9], del: [-7, -3], gain: .048 },
    forest:   { root: 294, wave: 'sine',     bright: 1200, click: [0, 5], type: [0, 2, 7], del: [-5, 0], gain: .04  },
    mint:     { root: 349, wave: 'sine',     bright: 1700, click: [2, 9], type: [0, 5, 9], del: [-5, 2], gain: .038 },
    ocean:    { root: 175, wave: 'sine',     bright: 1300, click: [0, 7], type: [0, 2, 9], del: [-7, -2], gain: .042 },
    lagoon:   { root: 196, wave: 'sine',     bright: 1500, click: [5, 12], type: [0, 5, 7], del: [-7, 0], gain: .04  },
    ember:    { root: 208, wave: 'triangle', bright: 1900, click: [3, 10], type: [0, 3, 7], del: [-7, -3], gain: .047 },
    orchid:   { root: 330, wave: 'triangle', bright: 2000, click: [5, 12], type: [0, 3, 10], del: [-5, 0], gain: .04  },
    midnight: { root: 147, wave: 'sine',     bright: 900,  click: [0, 7], type: [0, 3, 7], del: [-12, -5], gain: .04  },
    cyberpunk:{ root: 277, wave: 'square',   bright: 3000, click: [0, 12], type: [0, 7, 12], del: [-5, 2], gain: .04  },
    candy:    { root: 523, wave: 'triangle', bright: 2800, click: [7, 16], type: [0, 4, 9], del: [-5, 0], gain: .032 },
    paper:    { root: 392, wave: 'sine',     bright: 1500, click: [0, 7], type: [0, 2, 7], del: [-5, 0], gain: .032 },
    mono:     { root: 196, wave: 'sine',     bright: 900,  click: [0, 12], type: [0, 7],    del: [-12, 0], gain: .026 },
  };
  const semi = (root, n) => root * Math.pow(2, n / 12);
  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0.95;
    out.connect(ctx.destination);
    return ctx;
  }
  function currentProfile() {
    // Play whenever UI sounds are on (default), using the active theme's
    // character if one's applied, otherwise a sensible default.
    if (settings?.uiSounds === false) return null;
    const id = String(settings?.ntpThemeId || '').toLowerCase();
    return PROFILES[id] || PROFILES.aurora;
  }
  function blip(freq, dur, gain, wave, cutoff, pan) {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.985), t + dur);
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f);
    if (p) { f.connect(p); p.pan.value = pan || 0; p.connect(g); } else f.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => { try { o.disconnect(); f.disconnect(); p?.disconnect(); g.disconnect(); } catch {} };
  }
  function play(kind) {
    const p = currentProfile();
    if (!p) return;
    const now = performance.now();
    if (kind === lastKind && now - lastAt < 34) return;
    lastKind = kind; lastAt = now;
    // Audible by default; scaled by the optional uiSoundVolume (0..1).
    const uiVol = Math.max(0.25, Math.min(1, settings?.uiSoundVolume ?? 0.7));
    const gain = Math.min(0.34, p.gain * uiVol * 7);
    if (kind === 'type') {
      const n = p.type[Math.floor(Math.random() * p.type.length)];
      blip(semi(p.root, n), 0.055, gain, p.wave, p.bright, (Math.random() - 0.5) * 0.3);
    } else if (kind === 'delete') {
      blip(semi(p.root, p.del[0]), 0.07, gain * 0.9, p.wave, p.bright * 0.72, -0.12);
      setTimeout(() => blip(semi(p.root, p.del[1]), 0.045, gain * 0.55, p.wave, p.bright * 0.62, 0.12), 28);
    } else if (kind === 'confirm') {
      blip(semi(p.root, p.click[0]), 0.075, gain, p.wave, p.bright, -0.08);
      setTimeout(() => blip(semi(p.root, p.click[1]), 0.09, gain * 0.85, p.wave, p.bright * 1.15, 0.1), 42);
    } else if (kind === 'open') {
      // rising two-note flourish for a new tab
      blip(semi(p.root, p.click[0]), 0.08, gain, p.wave, p.bright, -0.1);
      setTimeout(() => blip(semi(p.root, p.click[1] + 5), 0.11, gain * 0.85, p.wave, p.bright * 1.2, 0.12), 40);
    } else if (kind === 'close') {
      // falling two-note flourish for a closed tab
      blip(semi(p.root, p.click[1]), 0.08, gain, p.wave, p.bright, 0.1);
      setTimeout(() => blip(semi(p.root, p.del[0]), 0.11, gain * 0.7, p.wave, p.bright * 0.7, -0.1), 40);
    } else {
      const n = p.click[Math.floor(Math.random() * p.click.length)];
      blip(semi(p.root, n), 0.05, gain * 0.75, p.wave, p.bright, 0);
    }
  }
  return { play };
})();

function isEditableTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === 'TEXTAREA' || tag === 'INPUT';
}
function isClickSoundTarget(el) {
  return !!el?.closest?.('button, [role="button"], .tab, .bookmark-chip, .menu-item, .ctx-item, .suggestion, .ts-item, .cp-card-btn, .cp-link-row, input[type="checkbox"], input[type="range"], select');
}
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || isEditableTarget(e.target)) return;
  if (isClickSoundTarget(e.target)) ThemeUiSfx.play('click');
}, true);
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!isEditableTarget(e.target)) return;
  if (e.key === 'Backspace' || e.key === 'Delete') ThemeUiSfx.play('delete');
  else if (e.key === 'Enter') ThemeUiSfx.play('confirm');
  else if (e.key.length === 1) ThemeUiSfx.play('type');
}, true);

// Drive the soundscape from settings. Music only plays while a theme is active.
let _musicGestureHooked = false;
function applyThemeMusic() {
  // Themes and their ambient soundscapes were removed. This is kept as a
  // no-op that actively stops playback, so any profile still carrying an old
  // ntpThemeMusic value goes quiet instead of looping forever.
  try { ThemeAudio.stop(); } catch { /* audio graph may not exist yet */ }
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
    // Forward settings to NTP tabs — settings-updated IPC only reaches the
    // main renderer, not webview guest processes, so we push via executeJavaScript.
    // `tab.ready` matters as much as `tab.wv` here: before the guest attaches,
    // executeJavaScript is not yet a function on the element, so calling it
    // throws synchronously and the .catch() never gets the chance to run.
    if (tab.url === NEWTAB_URL && tab.ready && typeof tab.wv?.executeJavaScript === 'function') {
      const payload = JSON.stringify(settings);
      try {
        tab.wv.executeJavaScript(
          `if(typeof window.__privooApplySettings==='function')window.__privooApplySettings(${payload});`
        ).catch(() => {});
      } catch { /* guest went away mid-call */ }
    }
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
  // A hidden element measures as zero, so the bar has to be re-indented once
  // it is actually on screen.
  if (typeof syncVtabsToolbarIndent === 'function') syncVtabsToolbarIndent();
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
      // The popup is its own window, so it cannot work out which page the
      // user is looking at — tell it.
      let activeTabId = null;
      try {
        const active = tabs.find((t) => t.id === activeId);
        if (active && active.wv && !active.wv.isDestroyed?.()) {
          activeTabId = active.wv.getWebContentsId();
        }
      } catch { /* guest not attached yet */ }
      const res = await window.privoo.openExtensionPopup({
        extPath: ext.path,
        x: rect.left,
        y: rect.bottom + 4,
        activeTabId,
      });
      if (!res?.ok) createTab(EXTENSIONS_URL);
    });
    extToolbar.appendChild(btn);
  }
  extToolbar.hidden = pinned.length === 0;
}

function paintToolbarWidgets() {
  if (!settings) return;
  // Privoo VPN connected dot — kept in sync even while the popover is closed.
  if (vpnDot) vpnDot.hidden = !vpnIsConnected(settings);
  // Show/hide ytdlp toolbar button based on settings
  if (ytdlpToolbarBtn) ytdlpToolbarBtn.hidden = !settings.showYtdlpToolbar;
  // Show/hide geo toolbar button based on settings
  if (geoToolbarBtn) geoToolbarBtn.hidden = !settings.showGeoToolbar;
  // Downloads is a permanent toolbar control by default: it is the home for
  // active and completed file transfers, not a temporary notification. It can
  // be switched off in Extensions, and `=== false` (rather than a truthiness
  // check) is what makes a profile that has never seen the setting show it.
  const dlBtnEl = document.getElementById('downloads-btn');
  const dlAnchorEl = document.getElementById('dl-anchor');
  const showDl = settings.showDownloadsButton !== false;
  if (dlBtnEl) dlBtnEl.hidden = !showDl;
  if (dlAnchorEl) dlAnchorEl.hidden = !showDl;
  const extBtnEl = document.getElementById('extensions-btn');
  if (extBtnEl) extBtnEl.hidden = settings.showExtensionsButton !== true;
  // Notes button — off by default, enable via the Notes extension
  if (notesBtn) notesBtn.hidden = !settings.showNotesButton;
  // Calculator button — off by default, enable via the Calculator extension
  const calcBtnEl = document.getElementById('calc-btn');
  if (calcBtnEl) calcBtnEl.hidden = !settings.showCalculator;
  // Translate toolbar button — off by default, enable in Settings → Features
  const translateAnchor = document.getElementById('translate-anchor');
  if (translateAnchor) translateAnchor.hidden = !settings.showTranslateButton;
  const translateBtnEl = document.getElementById('translate-btn');
  if (translateBtnEl) translateBtnEl.hidden = !settings.showTranslateButton;
  // AI toolbar button — on by default, can be hidden in Settings → Features
  const aiAnchor = document.getElementById('ai-anchor');
  if (aiAnchor) aiAnchor.hidden = settings.showAiButton !== true;
  const vpnAnchorEl = document.getElementById('vpn-anchor') || vpnBtn;
  if (vpnAnchorEl) vpnAnchorEl.hidden = settings.showVpnButton !== true;
  // Shortcuts sidebar — three modes: off, always on, or reveal on hover.
  // sidebarMode is the source of truth; showSidebar is kept in sync as a
  // simple on/off mirror for any code that only cares about visibility.
  const sidebarMode = settings.sidebarMode || (settings.showSidebar === false ? 'off' : 'on');
  const sidebarVisible = sidebarMode !== 'off';
  if (appSidebar) appSidebar.hidden = !sidebarVisible;
  document.body.classList.toggle('sidebar-hover-mode', sidebarMode === 'hover');
  renderPinnedExtensions();
  if (sidebarVisible) renderSidebarRail();
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

const FAVICON_HOST_ALIASES = {
  'mail.google.com': 'gmail.com',
  'open.spotify.com': 'spotify.com',
  'web.snapchat.com': 'snapchat.com',
  'web.whatsapp.com': 'whatsapp.com',
  'web.telegram.org': 'telegram.org',
};
function faviconHostFor(url) {
  try {
    let h = new URL(url).hostname.toLowerCase();
    h = FAVICON_HOST_ALIASES[h] || h.replace(/^www\./, '');
    return h;
  } catch { return ''; }
}

// A small, deliberate embedded-icon list — not the whole app catalog.
// WhatsApp and Gmail are here because Google's s2 favicon service returns
// the plain Google "G" for mail.google.com (not the Gmail envelope) and
// nothing at all for WhatsApp — both wrong regardless of network
// conditions, so a local SVG is the only real fix. Spotify is here
// because its real mark (green circle, black sound-wave arcs) reads
// better than the favicon service's result. Discord/Instagram/Snapchat/
// etc. were resolving fine via the normal favicon lookup and were
// swapped to hand-drawn approximations in a previous pass that looked
// worse than the originals — reverted, so they use the lookup again.
const BRAND_ICON_SVG = {
  'whatsapp.com': '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#25D366"/><path fill="#fff" d="M12 5.5a6.5 6.5 0 0 0-5.6 9.8L5.5 18.5l3.3-.9A6.5 6.5 0 1 0 12 5.5zm-2.7 3.6c.14 0 .3.01.43.02.14.01.3-.02.47.37.18.42.6 1.46.65 1.56.05.11.09.23.02.37-.07.14-.11.23-.22.35-.11.13-.23.28-.33.38-.11.11-.22.22-.1.44.13.22.57.98 1.24 1.6.85.8 1.57 1.05 1.79 1.17.22.11.35.1.48-.06.13-.16.55-.65.7-.87.15-.22.29-.19.49-.11.2.07 1.28.62 1.5.73.22.11.37.17.42.26.06.1.06.55-.13 1.08-.19.54-1.11 1.02-1.55 1.09-.4.06-.89.09-1.44-.09-.33-.1-.75-.24-1.3-.48-2.4-.9-3.88-3.25-4-3.4-.11-.16-.93-1.24-.93-2.36s.6-1.66.8-1.9c.2-.24.45-.3.6-.3z"/></svg>',
  'gmail.com': '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#fff" stroke="#e3e1ef" stroke-width="1"/><path fill="#EA4335" d="M5 8.2 12 13l7-4.8V17a1 1 0 0 1-1 1h-1V9.9l-5 3.5-5-3.5V18H6a1 1 0 0 1-1-1z"/><path fill="#4285F4" d="M17 7H7a1 1 0 0 0-.85.47L12 12.1l5.85-4.63A1 1 0 0 0 17 7z"/></svg>',
  // Real Spotify mark: green circle, BLACK arcs (the earlier hand-drawn
  // version used white strokes, which isn't the actual logo).
  'spotify.com': '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1DB954"/><path d="M7.3 15.6c2.9-.9 6.4-.7 8.9.8" stroke="#000" stroke-width="1.6" stroke-linecap="round" fill="none"/><path d="M6.7 12.3c3.5-1.2 7.9-1 10.9.9" stroke="#000" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M6.1 8.9c4.1-1.5 9.4-1.2 12.9 1" stroke="#000" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
};
function brandIconSvgFor(url) {
  const h = faviconHostFor(url);
  return h ? BRAND_ICON_SVG[h] || null : null;
}
function faviconForSidebar(url) {
  const h = faviconHostFor(url);
  return h ? `https://www.google.com/s2/favicons?domain=${h}&sz=64` : '';
}
function faviconFallbackForSidebar(url) {
  const h = faviconHostFor(url);
  return h ? `https://icons.duckduckgo.com/ip3/${h}.ico` : '';
}

// Fixed, non-removable quick-access shortcuts to Privoo's own pages — always
// pinned at the top of the sidebar rail, above the user's own shortcuts.
const SIDEBAR_QUICK_ACCESS = [
  { url: DOWNLOADS_URL, title: 'Downloads', icon: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z' },
  { url: HISTORY_URL,   title: 'History',   icon: 'M13 3a9 9 0 1 0 8.94 10h-2.02A7 7 0 1 1 13 5c1.93 0 3.68.78 4.95 2.05L14 11h7V4l-2.64 2.64A8.98 8.98 0 0 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z' },
  { url: BOOKMARKS_URL, title: 'Bookmarks', icon: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z' },
  { url: SETTINGS_URL,  title: 'Settings',  icon: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z' },
];

const MUSIC_PLAYERS = [
  { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#1DB954"/><path d="M6.9 16.4c3.2-1 7-.8 9.8.9" stroke="#000" stroke-width="1.7" stroke-linecap="round" fill="none"/><path d="M6.2 12.7c3.9-1.3 8.7-1.1 12 1" stroke="#000" stroke-width="1.9" stroke-linecap="round" fill="none"/><path d="M5.6 8.9c4.5-1.6 10.3-1.3 14.1 1.1" stroke="#000" stroke-width="2.1" stroke-linecap="round" fill="none"/></svg>' },
  { id: 'ytmusic', name: 'YouTube Music', url: 'https://music.youtube.com',
    icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#FF0033"/><circle cx="12" cy="12" r="6.4" fill="none" stroke="#fff" stroke-width="1.3"/><path d="M10.4 9.2 15 12l-4.6 2.8z" fill="#fff"/></svg>' },
  { id: 'apple', name: 'Apple Music', url: 'https://music.apple.com',
    icon: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="url(#am-g)"/><defs><linearGradient id="am-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FB5C74"/><stop offset="1" stop-color="#FA233B"/></linearGradient></defs><path fill="#fff" d="M17 5.4v8.9a2.5 2.5 0 1 1-1.6-2.33V8.2l-5.6 1.24v6.66a2.5 2.5 0 1 1-1.6-2.33V7.6L17 5.4z"/></svg>' },
  { id: 'amazon', name: 'Amazon Music', url: 'https://music.amazon.com',
    icon: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#25D1DA"/><path fill="#0B2E36" d="M16.5 6v7.6a2.2 2.2 0 1 1-1.5-2.09V8.1l-4.8 1.06v5.9a2.2 2.2 0 1 1-1.5-2.09V7.9l7.8-1.9z"/></svg>' },
  { id: 'deezer', name: 'Deezer', url: 'https://www.deezer.com',
    icon: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#111"/><g fill="#A238FF"><rect x="14" y="6" width="6" height="2.2" rx="1"/><rect x="14" y="9.6" width="6" height="2.2" rx="1"/><rect x="6.5" y="9.6" width="6" height="2.2" rx="1"/><rect x="14" y="13.2" width="6" height="2.2" rx="1"/><rect x="6.5" y="13.2" width="6" height="2.2" rx="1"/><rect x="14" y="16.8" width="6" height="2.2" rx="1"/><rect x="6.5" y="16.8" width="6" height="2.2" rx="1"/><rect x="-1" y="16.8" width="6" height="2.2" rx="1" transform="translate(5)"/></g></svg>' },
  { id: 'tidal', name: 'Tidal', url: 'https://listen.tidal.com',
    icon: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0B0B0B"/><g fill="#fff"><path d="m7 8.4 2.1-2.1 2.1 2.1-2.1 2.1z"/><path d="m12.8 8.4 2.1-2.1L17 8.4l-2.1 2.1z"/><path d="m9.9 11.3 2.1-2.1 2.1 2.1-2.1 2.1z"/><path d="m9.9 14.2 2.1 2.1 2.1-2.1L12 12.1z" opacity=".85"/></g></svg>' },
  { id: 'soundcloud', name: 'SoundCloud', url: 'https://soundcloud.com',
    icon: '<svg viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#FF5500"/><g fill="#fff"><rect x="4.5" y="11" width="1.5" height="6" rx=".75"/><rect x="7" y="9" width="1.5" height="8" rx=".75"/><rect x="9.5" y="7.5" width="1.5" height="9.5" rx=".75"/><rect x="12" y="9" width="1.5" height="8" rx=".75"/><path d="M15 8.6c2.4-.5 4.5 1.1 4.5 3.5 0 2.6-1.9 4.9-4.5 4.9z"/></g></svg>' },
];
const MUSIC_ICON_SVG = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 3.5v11.2a3.3 3.3 0 1 1-2-3.03V7.2l-7 1.55v8.45a3.3 3.3 0 1 1-2-3.03V6.4l11-2.9z"/></svg>';
const COG_ICON_SVG = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8zm8.5 3.4c0 .5 0 1-.1 1.4l2 1.5-2 3.4-2.3-1a7.7 7.7 0 0 1-2.4 1.4l-.3 2.4h-4l-.3-2.4a7.7 7.7 0 0 1-2.4-1.4l-2.3 1-2-3.4 2-1.5a8.6 8.6 0 0 1 0-2.8l-2-1.5 2-3.4 2.3 1a7.7 7.7 0 0 1 2.4-1.4l.3-2.4h4l.3 2.4c.9.3 1.7.8 2.4 1.4l2.3-1 2 3.4-2 1.5c.1.4.1.9.1 1.4z"/></svg>';

function isMusicSidebarLink(link) {
  return !!(link && (link.music || link.url === 'privoo://music'));
}

function currentMusicPlayer() {
  return MUSIC_PLAYERS.find((p) => p.id === settings?.sidebarMusicPlayer) || null;
}

let _musicPickPop = null, _musicPickBackdrop = null;
function closeMusicPicker() {
  _musicPickPop?.remove(); _musicPickPop = null;
  _musicPickBackdrop?.remove(); _musicPickBackdrop = null;
}

function pickSidebarMusicPlayer(anchorBtn) {
  closeMusicPicker();
  return new Promise((resolve) => {
    const pop = document.createElement('div');
    pop.className = 'music-pick';
    const curId = settings?.sidebarMusicPlayer || '';
    pop.innerHTML =
      '<div class="music-pick-head">Music player</div>' +
      '<div class="music-pick-sub">Opens in the sidebar. You stay signed in to whichever you pick.</div>' +
      '<div class="music-pick-grid">' +
      MUSIC_PLAYERS.map((p) =>
        `<button type="button" class="music-pick-item${p.id === curId ? ' active' : ''}" data-id="${p.id}">` +
        `<span class="music-pick-ico">${p.icon}</span>` +
        `<span class="music-pick-name">${esc(p.name)}</span>` +
        // A tick on the current one rather than a coloured row: colour on a
        // row of brand logos reads as another brand, not as "this is yours".
        `<span class="music-pick-tick" aria-hidden="true"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg></span>` +
        '</button>'
      ).join('') +
      '</div>';
    const backdrop = document.createElement('div');
    backdrop.className = 'music-pick-backdrop';
    document.body.appendChild(backdrop);
    _musicPickBackdrop = backdrop;
    document.body.appendChild(pop);
    // Drop from under the anchor, aligned to its left edge — the standard
    // menu placement. It used to be pinned to the anchor's RIGHT edge, which
    // is right for the narrow icon rail but wrong for the switcher button in
    // the music panel's header: from there the menu flew off to the side of a
    // wide panel instead of opening under the control that spawned it.
    const r = anchorBtn.getBoundingClientRect();
    const M = 8;                                    // keep clear of the window edge
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const left = Math.max(M, Math.min(r.left, window.innerWidth - w - M));
    // Below by default; flip above when there isn't room, so the menu never
    // hangs off the bottom of the window.
    const below = r.bottom + 6;
    const top = (below + h + M <= window.innerHeight)
      ? below
      : Math.max(M, r.top - h - 6);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
    _musicPickPop = pop;

    let settled = false;
    const finish = (player) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('pointerdown', onOutside, true);
      closeMusicPicker();
      resolve(player);
    };
    function onOutside(ev) { if (!pop.contains(ev.target)) finish(null); }
    // Two dismissal paths, because neither covers everything on its own:
    //  - the backdrop catches clicks over the page, which a <webview> would
    //    otherwise swallow without ever notifying this document;
    //  - the document listener catches clicks on the browser chrome, which
    //    sits ABOVE the backdrop in z-order.
    backdrop.addEventListener('pointerdown', () => finish(null));
    setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
    pop.querySelectorAll('.music-pick-item').forEach((item) => {
      item.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const player = MUSIC_PLAYERS.find((p) => p.id === item.dataset.id);
        if (!player) return finish(null);
        await saveBrowserSetting({ sidebarMusicPlayer: player.id });
        finish(player);
        renderSidebarRail();
      });
    });
  });
}

async function openSidebarMusic(anchorBtn, forcePick) {
  let player = forcePick ? null : currentMusicPlayer();
  if (!player) player = await pickSidebarMusicPlayer(anchorBtn);
  // `music: true` is what makes openSidebarPanel show the player switcher in
  // the panel header. Without it the panel opened Spotify and offered no way
  // to get to anything else.
  if (player) openSidebarPanel({ url: player.url, title: player.name, music: true });
}

function renderSidebarRail() {
  if (!sidebarRail) return;
  sidebarRail.innerHTML = '';
  hideSidebarFlyout();

  // Pinned quick-access row — opens as a real tab (these are full pages, not
  // sites suited to the cramped preview panel). Optional via Customize sidebar.
  for (const q of (settings?.sidebarQuickAccess === false ? [] : SIDEBAR_QUICK_ACCESS)) {
    const qbtn = document.createElement('button');
    qbtn.type = 'button';
    qbtn.className = 'sidebar-rail-btn sidebar-quick-btn';
    qbtn.title = q.title;
    qbtn.setAttribute('role', 'listitem');
    qbtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="${q.icon}"/></svg>`;
    qbtn.addEventListener('click', (e) => { e.stopPropagation(); createTab(q.url); });
    sidebarRail.appendChild(qbtn);
  }
  if (SIDEBAR_QUICK_ACCESS.length) {
    const div = document.createElement('div');
    div.className = 'sidebar-rail-divider';
    sidebarRail.appendChild(div);
  }

  const links = sidebarLinkList().slice(0, 24);
  for (const link of links) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sidebar-rail-btn';
    btn.title = link.title || link.url || '';
    btn.setAttribute('role', 'listitem');
    const letter = ((link.title || link.url || '?')[0] || '?').toUpperCase();
    // Known catalog apps use an embedded brand SVG — no network lookup, and
    // it can never come back wrong. Everything else falls back to <img> +
    // letter (favicon service, then DDG, then the letter avatar).
    const isMusic = isMusicSidebarLink(link);
    const brandSvg = isMusic
      ? (currentMusicPlayer()?.icon || MUSIC_ICON_SVG)
      : brandIconSvgFor(link.url);
    if (brandSvg) {
      btn.innerHTML = brandSvg;
      btn.classList.add('loaded');
      if (isMusic) {
        btn.classList.add('sb-music-btn');
        btn.title = currentMusicPlayer()?.name || 'Music';
        // No cog on hover any more - switching players lives in the panel
        // header once the panel is open, which is where you actually are when
        // you decide you want a different service.
      }
    } else {
      btn.innerHTML =
        `<img alt="" />` +
        `<span class="sb-letter">${esc(letter)}</span>`;
      const img = btn.querySelector('img');
      const ico = faviconForSidebar(link.url);
      if (ico) {
        img.src = ico;
        img.onload  = () => btn.classList.add('loaded');
        img.onerror = () => {
          const fb = faviconFallbackForSidebar(link.url);
          if (fb && img.src !== fb) { img.src = fb; return; }
          btn.classList.remove('loaded');
        };
      }
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMusic) void openSidebarMusic(btn, false);
      else openSidebarPanel(link);
    });
    // Hover: if a tab from this site is playing audio, show a tiny rounded
    // "Playing" pill with the track title and a pause/resume button.
    btn.addEventListener('mouseenter', () => showSidebarNowPlaying(btn, link));
    btn.addEventListener('mouseleave', () => hideSidebarNowPlaying(false));
    btn.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const idx = links.indexOf(link);
      const action = await showHtmlMenu(isMusic ? [
        { id: 'sb-music',  label: 'Change music player…' },
        { type: 'separator' },
        { id: 'sb-remove', label: 'Remove shortcut' },
      ] : [
        { id: 'sb-open',   label: 'Open in new tab' },
        { id: 'sb-copy',   label: 'Copy link' },
        { type: 'separator' },
        { id: 'sb-remove', label: 'Remove shortcut' },
      ], e.clientX, e.clientY);
      if (action === 'sb-music') void openSidebarMusic(btn, true);
      else if (action === 'sb-open') createTab(link.url);
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
  // Render sidebar sites with the normal DESKTOP identity. A forced mobile UA
  // made sites "appear different / weird" (mobile layouts, mobile redirects
  // like m.site.com), which is not what people expect from a pinned site.
  // The panel is just a narrower desktop viewport; responsive sites adapt.
  sidebarWv.removeAttribute('useragent');
  const _incoPart = window.__privooIncognitoPartition || window.privoo?.incognitoPartition;
  if (_incoPart && !sidebarWv.getAttribute('partition')) {
    sidebarWv.setAttribute('partition', _incoPart);
  }
  // Comfortable desktop-panel width. A phone-narrow strip (~400px) clips
  // desktop layouts, so default wider when the user hasn't set a width.
  const w = clampSidebarPanelWidth(settings?.sidebarPanelWidth || 880);
  sidebarPanel.style.width = `${w}px`;
  // Deliberately NOT marking this as a mobile webview: the panel now uses the
  // default desktop identity across all of Electron's UA layers.
  // Re-pointing src reloads the guest, which would kill anything it is
  // playing — only navigate when the panel isn't already on that site.
  let liveUrl = '';
  try { liveUrl = sidebarWv.getURL() || ''; } catch {}
  const sameSite = (() => {
    try { return !!liveUrl && new URL(liveUrl).hostname === new URL(link.url).hostname; }
    catch { return false; }
  })();
  if (!sameSite) sidebarWv.src = link.url;
  const wasTucked = sidebarPanel.classList.contains('sp-tucked');
  sidebarPanel.hidden = false;
  sidebarPanel.classList.remove('sp-tucked');
  sidebarOverlay?.classList.remove('hidden');
  // Slide-in animation only on a true first open. Re-opening a tucked panel
  // already animates back via the .sp-tucked transform transition, and running
  // both at once double-animates it.
  syncSidebarMusicSwitch(link);
  sidebarPanel.classList.remove('sp-enter');
  if (!wasTucked) requestAnimationFrame(() => sidebarPanel.classList.add('sp-enter'));
}

// Closing only tucks the panel out of view — the guest stays attached and keeps
// running, so music carries on playing while you browse. It must NOT be hidden
// with `hidden`/display:none: that detaches the <webview>'s guest WebContents
// and kills playback (this is exactly why Spotify stopped on click-away).
// The panel header carries the player switcher while the music player is open.
// It is populated on every open so it reflects the current choice.
function syncSidebarMusicSwitch(link) {
  const btn  = document.getElementById('sidebar-music-switch');
  if (!btn) return;
  const isMusic = isMusicSidebarLink(link);
  btn.hidden = !isMusic;
  if (!isMusic) return;
  const cur = currentMusicPlayer();
  const ico  = document.getElementById('sidebar-music-switch-ico');
  const name = document.getElementById('sidebar-music-switch-name');
  if (ico)  ico.innerHTML  = cur?.icon || MUSIC_ICON_SVG;
  if (name) name.textContent = cur?.name || 'Music';
}

document.getElementById('sidebar-music-switch')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  const btn = e.currentTarget;
  const player = await pickSidebarMusicPlayer(btn);
  if (!player) return;
  openSidebarPanel({ url: player.url, title: player.name, music: true });
  renderSidebarRail();
});

function closeSidebarPanel() {
  if (!sidebarPanel) return;
  sidebarPanel.classList.remove('sp-enter');
  sidebarPanel.classList.add('sp-tucked');
  sidebarOverlay?.classList.add('hidden');
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
sidebarResizeHandle?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  _sidebarResizing = true;
  _sidebarResizeStart = e.clientX;
  _sidebarResizeW = sidebarPanel ? parseInt(sidebarPanel.style.width) || 880 : 880;
  document.body.classList.add('sidebar-resizing');
  // Pointer capture: move/up are delivered to the handle even when the
  // cursor crosses the <webview>, which never forwards mouse events to this
  // document. Without this, a release over the page left the
  // 'sidebar-resizing' class (pointer-events:none on everything) stuck on
  // <body> — permanently dead header buttons.
  try { sidebarResizeHandle.setPointerCapture(e.pointerId); } catch {}
  sidebarResizeHandle.addEventListener('pointermove', _onSidebarResize);
  sidebarResizeHandle.addEventListener('pointerup', _onSidebarResizeEnd);
  sidebarResizeHandle.addEventListener('lostpointercapture', _onSidebarResizeEnd);
});
// Belt & braces: any focus loss or stray release ends the drag too.
window.addEventListener('blur', _onSidebarResizeEnd);
document.addEventListener('pointerup', _onSidebarResizeEnd);

function clampSidebarPanelWidth(w) {
  const max = Math.max(320, window.innerWidth - 120);
  return Math.max(260, Math.min(max, Math.round(w)));
}

function _onSidebarResize(e) {
  if (!_sidebarResizing || !sidebarPanel) return;
  const delta = e.clientX - _sidebarResizeStart;
  sidebarPanel.style.width = `${clampSidebarPanelWidth(_sidebarResizeW + delta)}px`;
}

async function _onSidebarResizeEnd() {
  if (!_sidebarResizing) return;
  _sidebarResizing = false;
  document.body.classList.remove('sidebar-resizing');
  sidebarResizeHandle?.removeEventListener('pointermove', _onSidebarResize);
  sidebarResizeHandle?.removeEventListener('pointerup', _onSidebarResizeEnd);
  sidebarResizeHandle?.removeEventListener('lostpointercapture', _onSidebarResizeEnd);
  if (sidebarPanel) {
    const w = clampSidebarPanelWidth(parseInt(sidebarPanel.style.width) || 880);
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
      // A sleeping tab is parked on about:blank — snoozedUrl is where it
      // really goes. Persisting t.url here would turn every sleeping tab
      // into a blank one on the next launch.
      url: t.snoozedUrl || t.url || NEWTAB_URL,
      title: t.title || 'Tab',
      pinned: !!t.pinned,
      groupId: t.groupId || null,
      reaction: t.reaction || null,
    })),
  };
}

// Incognito / Guest windows must never persist their tabs — otherwise the
// private tabs get written to the shared last-session file and reappear in the
// normal browser on the next launch. (History is already gated the same way.)
function _sessionPersistDisabled() {
  return !!(window.__privooIncognitoPartition || window.privoo?.incognitoPartition);
}

function scheduleSaveSession() {
  if (_sessionPersistDisabled()) return;
  clearTimeout(saveSessionTimer);
  saveSessionTimer = setTimeout(() => {
    window.privoo.saveTabSession(serializeSession()).catch?.(() => {});
  }, 600);
}

async function saveSessionNow() {
  if (_sessionPersistDisabled()) return;
  await window.privoo.saveTabSession(serializeSession()).catch?.(() => {});
}

// Flush the session synchronously right before the window unloads (app quit),
// so a debounced save can't be lost — otherwise tabs you just closed reappear
// on next launch.
function flushSessionSync() {
  if (_sessionPersistDisabled()) return;
  try { window.privoo.saveTabSessionSync?.(serializeSession()); } catch { /* ignore */ }
}
window.addEventListener('pagehide', flushSessionSync);
window.addEventListener('beforeunload', flushSessionSync);

function updateGeoStatusLine() {
  if (!settings) return;
  const badgeEl  = geoStatusLine;                              // titlebar "Off"/"On"
  const stateEl  = document.getElementById('geo-connect-state'); // big "Not connected"/"Connected"
  const regionEl = document.getElementById('geo-region-label');
  const c = geoCoordsFromSettings(settings);
  const labels = { nyc: 'New York, United States', london: 'London, United Kingdom', tokyo: 'Tokyo, Japan', paris: 'Paris, France', sydney: 'Sydney, Australia', custom: 'Custom coordinates' };
  const connected = !!(settings.geoSpoofEnabled && c);
  geoPopover?.classList.toggle('connected', connected);
  if (badgeEl)  badgeEl.textContent  = connected ? 'On' : 'Off';
  if (stateEl)  stateEl.textContent  = connected ? 'Connected' : 'Not connected';
  if (regionEl) regionEl.textContent = connected ? (labels[settings.geoPreset] || settings.geoPreset) : 'Real location';
  if (geoApplyBtn) geoApplyBtn.setAttribute('aria-label', connected ? 'Disconnect' : 'Connect');
}

// Reflect the selected region in the custom dropdown's button (flag + label),
// toggle the custom-coordinates fields, and refresh the Connect/Disconnect label.
function setGeoValue(val) {
  geoValue = val || 'off';
  const opt = geoDdMenu?.querySelector('.geo-dd-opt[data-value="' + geoValue + '"]');
  if (opt) {
    if (geoDdLabel) geoDdLabel.textContent = opt.textContent;
    if (geoDdFlag)  geoDdFlag.textContent  = opt.dataset.flag || '🌐';
  }
  if (geoCustomWrap) geoCustomWrap.classList.toggle('hidden', geoValue !== 'custom');
  updateGeoConnectLabel();
}
function closeGeoDropdown() {
  geoDdMenu?.classList.add('hidden');
  geoDdBtn?.setAttribute('aria-expanded', 'false');
}

function syncGeoPopoverFromSettings() {
  if (!settings) return;
  const p = settings.geoSpoofEnabled ? (settings.geoPreset || 'off') : 'off';
  const valid = p === 'off' || p === 'custom' || (GEO_PRESETS[p] != null);
  if (geoLatInput) geoLatInput.value = String(settings.geoLatitude ?? '40.7128');
  if (geoLonInput) geoLonInput.value = String(settings.geoLongitude ?? '-74.0060');
  setGeoValue(valid ? p : 'off');
  closeGeoDropdown();
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
  syncNoTabsClass();
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
  markIslandCaps();
  applySplitTabStripJoin();
  requestAnimationFrame(resizeTabs);
  renderVtabs();
}

// An island is drawn as one continuous tinted capsule: the chip caps its left
// end, the last tab caps the right, and everything between has square edges so
// there is no seam down the middle of it. Only the right cap needs marking,
// and it has to be re-marked whenever the run's membership changes — including
// on close, which does not re-render the strip.
function markIslandCaps() {
  const runs = new Map();
  for (const t of tabs) {
    if (t.pinned || !t.groupId) continue;
    if (!runs.has(t.groupId)) runs.set(t.groupId, []);
    runs.get(t.groupId).push(t);
  }
  for (const t of tabs) t.tabEl?.classList.remove('island-last');
  for (const run of runs.values()) {
    run[run.length - 1]?.tabEl?.classList.add('island-last');
  }
}

/* ── Tab reactions ────────────────────────────────────────────────────
   An emoji pinned to a tab. It carries no behaviour at all — it exists
   because a row of twenty tabs that all say "Google Docs" is unnavigable,
   and a red dot on the one you actually want solves that instantly.

   Hovering a tab reveals a small face button; clicking it opens a strip of
   the eight most-used reactions plus a "+" into the full emoji picker.
   ──────────────────────────────────────────────────────────────────────── */

// Deliberately eight, and deliberately these eight: enough range to mean
// something, few enough to pick from without reading. Anything else is one
// click further, behind the "+".
const QUICK_REACTIONS = ['⭐', '❗', '✅', '🔥', '👀', '💡', '🐛', '❤️'];

function paintTabReaction(tab) {
  const el = tab.tabEl?.querySelector('.tab-reaction');
  if (el) {
    el.textContent = tab.reaction || '';
    el.hidden = !tab.reaction;
  }
  tab.tabEl?.classList.toggle('has-reaction', !!tab.reaction);
  // Vertical tabs render from the same tab objects, so they follow along.
  const vt = document.querySelector(`.vtab[data-tab-id="${tab.id}"] .vtab-reaction`);
  if (vt) {
    vt.textContent = tab.reaction || '';
    vt.hidden = !tab.reaction;
  }
}

function setTabReaction(tab, emoji) {
  // Clicking the reaction that is already set removes it — the same gesture
  // both ways, so there is no separate "remove" to go looking for.
  tab.reaction = (emoji && emoji !== tab.reaction) ? emoji : null;
  paintTabReaction(tab);
  scheduleSaveSession();
}

let _reactionBar = null, _reactionBackdrop = null;
function closeReactionBar() {
  _reactionBar?.remove();
  _reactionBar = null;
  _reactionBackdrop?.remove();
  _reactionBackdrop = null;
  document.removeEventListener('pointerdown', _onReactionOutside, true);
}
function _onReactionOutside(e) {
  if (_reactionBar && !_reactionBar.contains(e.target)) closeReactionBar();
}

function openReactionBar(tab, anchorEl) {
  closeReactionBar();
  closePopovers();

  const bar = document.createElement('div');
  bar.className = 'reaction-bar';

  for (const emoji of QUICK_REACTIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'reaction-chip' + (tab.reaction === emoji ? ' active' : '');
    b.textContent = emoji;
    b.title = tab.reaction === emoji ? 'Remove reaction' : 'React with ' + emoji;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      setTabReaction(tab, emoji);
      closeReactionBar();
    });
    bar.appendChild(b);
  }

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'reaction-chip reaction-more';
  more.textContent = '+';
  more.title = 'All emoji';
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    closeReactionBar();
    openEmojiPicker(null, null, (glyph) => setTabReaction(tab, glyph));
  });
  bar.appendChild(more);

  if (tab.reaction) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'reaction-chip reaction-clear';
    clear.title = 'Remove reaction';
    clear.innerHTML = '<svg viewBox="0 0 14 14" width="10" height="10"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" fill="none"/></svg>';
    clear.addEventListener('click', (e) => {
      e.stopPropagation();
      setTabReaction(tab, null);
      closeReactionBar();
    });
    bar.appendChild(clear);
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'reaction-backdrop';
  backdrop.addEventListener('pointerdown', () => closeReactionBar());
  document.body.appendChild(backdrop);
  _reactionBackdrop = backdrop;

  document.body.appendChild(bar);
  _reactionBar = bar;

  // Centre under the button it came from, clamped to the window so the strip
  // never hangs off the edge on the last tab in the row.
  const r = anchorEl.getBoundingClientRect();
  const M = 8;
  const left = Math.max(M, Math.min(r.left + r.width / 2 - bar.offsetWidth / 2,
                                    window.innerWidth - bar.offsetWidth - M));
  bar.style.left = `${Math.round(left)}px`;
  bar.style.top = `${Math.round(r.bottom + 6)}px`;

  setTimeout(() => document.addEventListener('pointerdown', _onReactionOutside, true), 0);
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
  name.textContent = g.name || `Island ${g.id}`;
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
    { id: 'g-rename',  label: 'Rename island' },
    { label: 'Color',  submenu: colorSubmenu },
    { type: 'separator' },
    { id: 'g-ungroup', label: 'Dissolve island' },
    { id: 'g-close',   label: 'Close all tabs in island' },
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
      g.name = t || `Island ${g.id}`;
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
    tab.tabEl.classList.remove('grouped', 'island-last');
  }
}

function resizeTabs() {
  const strip = document.getElementById('tabs-strip');
  const newTabBtn = document.getElementById('new-tab');
  if (!strip) return;
  const stripW = strip.clientWidth;
  if (stripW <= 0) return; // not laid out yet — a later trigger will re-run us

  const unpinned = tabs.filter(t => !t.pinned);
  if (!unpinned.length) return;
  const pinnedCount = tabs.filter(t => t.pinned).length;

  // flex-basis sets the CONTENT box only. Every tab also carries horizontal
  // margins (3px a side in the current chrome) and the scroll box has its own
  // padding — none of which used to be subtracted here. With a dozen tabs that
  // unaccounted margin came to ~70px, so the row was laid out wider than the
  // viewport and the last tab was clipped mid-title. Read the real values off
  // the DOM rather than hard-coding them, because several theme variants
  // change the tab metrics.
  const sample = unpinned[0].tabEl;
  const cs = sample ? getComputedStyle(sample) : null;
  const perTab = cs
    ? (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0)
    : 0;
  const scrollEl = document.getElementById('tabs-scroll');
  const scrollPad = scrollEl
    ? (() => {
        const s = getComputedStyle(scrollEl);
        return (parseFloat(s.paddingLeft) || 0) + (parseFloat(s.paddingRight) || 0);
      })()
    : 0;
  // The CSS cap can be tighter than the 240 this function used to assume
  // (220 in the current chrome). Honouring it keeps the two in agreement.
  const capW = cs ? (parseFloat(cs.maxWidth) || 240) : 240;
  const minW = cs ? (parseFloat(cs.minWidth) || 88) : 88;

  // Measure the whole STRIP (a stable width) — NOT #tabs-scroll, which is
  // content-sized, so reading it would be circular. The reserve covers the
  // "+" button and the trailing drag region that shares the strip.
  const btnW = (newTabBtn ? newTabBtn.offsetWidth : 30) + 12;
  const pinnedW = pinnedCount * (42 + perTab);
  const reserve = btnW + pinnedW + scrollPad + perTab * unpinned.length + 56;
  const available = stripW - reserve;

  // Chrome-style: each tab is (space / count), capped so a few tabs stay full
  // width with the "+" right beside the last, and floored so that past a
  // certain count the strip scrolls instead of shrinking to nothing.
  const w = available > 0
    ? Math.min(capW, Math.max(minW, Math.floor(available / unpinned.length)))
    : minW;
  for (const t of unpinned) {
    if (t.tabEl) t.tabEl.style.flexBasis = w + 'px';
  }
}

function ensureNewGroupForTab(tab) {
  const id = nextGroupId++;
  const palette = GROUP_COLORS[(id - 1) % GROUP_COLORS.length];
  const g = {
    id,
    name: `Island ${id}`,
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
    const tab = createTab(spec.url || NEWTAB_URL, false, { pinned: !!spec.pinned, groupId: gid, reaction: spec.reaction });
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
  document.body.classList.toggle('dark', !!settings?.darkMode);

  return new Promise((resolve) => {
    const discCheck = document.getElementById('sw-disc-check');
    const discAccept = document.getElementById('sw-disc-accept');
    discCheck?.addEventListener('change', () => {
      if (discAccept) discAccept.disabled = !discCheck.checked;
    });
    discAccept?.addEventListener('click', async () => {
      if (!discCheck?.checked) return;
      await saveBrowserSetting({ disclaimerAccepted: true });
      window.privoo.setupFinished?.();
      document.body.classList.remove('setup-mode');
      setupOverlay.setAttribute('hidden', '');
      resolve();
    });
  });
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
  if (/^(privoo:\/\/|mariana:\/\/|about:|view-source:|file:\/\/|ipfs:\/\/|ipns:\/\/)/i.test(t)) return t;
  // Bare ".mariana" name (Privoo's anonymous Tor sites) — route to the
  // mariana:// scheme rather than trying to load it as a normal https host.
  if (/^[a-z0-9-]+\.mariana(\/.*)?$/i.test(t) && !/\s/.test(t)) {
    const m = t.match(/^([a-z0-9-]+)\.mariana(\/.*)?$/i);
    return `mariana://${m[1].toLowerCase()}${m[2] || '/'}`;
  }
  const host = !/\s/.test(t) && (/\.[a-z]{2,}(:\d+)?(\/|\?|#|$)/i.test(t) || /^localhost(:\d+)?(\/|$)/i.test(t));
  return host ? 'https://' + t : searchUrl(t);
}

function displayUrl(url) {
  if (!url) return '';
  if (url.startsWith('mariana://')) {
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }
  if (url.startsWith('privoo://')) {
    // Show clean privoo:// URL without trailing slash (newtab shows blank)
    if (url === NEWTAB_URL || url.startsWith('privoo://newtab')) return '';
    return url.endsWith('/') ? url.slice(0, -1) : url;
  }
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
  // New-tab sound — skip the startup burst when restoring a session.
  if (activate && performance.now() > 2500) ThemeUiSfx.play('open');
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
  // Set before the first paint, not on did-navigate: otherwise a new tab
  // flashes the opaque page colour for a frame before losing it again.
  wv.classList.toggle('is-ntp', isNewTabPage(url));
  viewsEl.appendChild(wv);

  const tabEl = document.createElement('div');
  // tab-in: fade only. The tab is appended at its final width (resizeTabs runs
  // synchronously below), so nothing reflows. Cleared after two frames so the
  // opacity transition actually runs.
  tabEl.className = 'tab tab-in';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => tabEl.classList.remove('tab-in')));
  // NOT draggable. HTML5 drag-and-drop is what made Chromium take a
  // translucent snapshot of the tab and drag that around instead of the tab
  // itself; wireDrag() runs a pointer-driven reorder instead.
  tabEl.draggable = false;
  tabEl.innerHTML =
    `<span class="favicon tab-fav"></span>` +
    `<span class="tab-title">${newTabLabel()}</span>` +
    `<span class="tab-reaction" hidden></span>` +
    `<span class="tab-react-btn" title="Add a reaction"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" stroke-linecap="round"/><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none"/></svg></span>` +
    `<span class="tab-audio-ind" title="Audio playing, click to mute"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></span>` +
    `<span class="tab-close" title="Close tab"><svg viewBox="0 0 14 14" width="10" height="10"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></span>`;
  tabsEl.appendChild(tabEl);

  const tab = {
    id,
    url,
    title: newTabLabel(),
    wv,
    tabEl,
    pinned: !!opts.pinned,
    groupId: (opts.groupId && tabGroups.some((g) => g.id === opts.groupId)) ? opts.groupId : null,
    // An emoji the user pinned to this tab. Purely a marker — it changes
    // nothing about the page, it just makes one tab findable in a row of
    // twenty that all say the same thing.
    reaction: typeof opts.reaction === 'string' ? opts.reaction : null,
    isPlayingAudio: false,
    isMuted: false,
    volume: 1,
    // Privoo pages know their icon immediately — no need to wait for onNav
    // to fire, which avoided a flash of the generic favicon.
    faviconUrl: url.startsWith('privoo://') ? faviconForPrivooUrl(url) : null,
    abortController: new AbortController(),
  };
  tabs.push(tab);

  // Tab widths are un-animated, so the strip's final layout exists this frame:
  // re-spread immediately — now that this tab is IN `tabs` and will actually
  // be sized — then (next frame, and only if it genuinely overflows) reveal it.
  // No settling delay, no clipped edge.
  resizeTabs();
  requestAnimationFrame(() => {
    const sc = document.getElementById('tabs-scroll');
    if (sc && sc.scrollWidth > sc.clientWidth + 2) {
      try { tabEl.scrollIntoView({ inline: 'end', block: 'nearest' }); } catch {}
    }
  });

  // Paint the Privoo page icon immediately — don't wait for onNav to fire
  // (avoids a flash of the generic favicon on internal pages).
  if (tab.faviconUrl) {
    const initialFaviconEl = tabEl.querySelector('.favicon');
    if (initialFaviconEl) initialFaviconEl.style.backgroundImage = 'url("' + tab.faviconUrl + '")';
  }

  if (tab.pinned) tabEl.classList.add('pinned');
  applyGroupStyle(tab);
  paintTabReaction(tab);

  tabEl.querySelector('.tab-react-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openReactionBar(tab, e.currentTarget);
  });

  tabEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // Neither the close button nor the reaction button should switch tabs on
    // the way to doing their own job.
    if (e.target.closest('.tab-close, .tab-react-btn')) return;
    activateTab(id);
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
  // Set once the guest has actually painted something. activateTab() reads it
  // to decide whether it is safe to hide the page underneath yet.
  wv._privooPainted = false;
  const markPainted = () => {
    if (wv._privooPainted) return;
    wv._privooPainted = true;
    wv.dispatchEvent(new CustomEvent('privoo-painted'));
  };
  if (!url.startsWith('privoo://')) {
    wv.classList.add('first-paint');
  } else {
    wv.classList.add('ntp-loading');
    let _ntpDone = false;
    const clearNtpLoading = () => {
      if (_ntpDone) return;
      _ntpDone = true;
      // Two frames, not one: at dom-ready the page's own background (wallpaper,
      // theme gradient) has not necessarily painted yet, and revealing on the
      // very next frame showed the bare default fill underneath it first.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        wv.classList.remove('ntp-loading');
        markPainted();
      }));
    };
    // did-stop-loading rather than dom-ready — a privoo:// page is local and
    // settles in a few ms either way, and waiting for it means the new tab
    // fades in already showing its wallpaper instead of flashing a blank frame.
    wv.addEventListener('did-stop-loading', clearNtpLoading, { once: true });
    setTimeout(clearNtpLoading, 700);
  }
  let _fpCleared = false;
  const clearFirstPaint = () => {
    if (_fpCleared) return;
    _fpCleared = true;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wv.classList.remove('first-paint');
      markPainted();
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

function triggerWobble() {
  if (!settings?.wobblyWindows) return;
  const vw = document.getElementById('views-wrap');
  if (!vw) return;
  vw.classList.remove('wobbly-active');
  requestAnimationFrame(() => vw.classList.add('wobbly-active'));
  setTimeout(() => vw.classList.remove('wobbly-active'), 500);
}

// After a webview goes from hidden → visible, its HTML5 video can be stuck on
// a black/stale frame (the decoder produced nothing while occluded). Firing a
// window resize inside the guest makes the YouTube player re-measure and paint
// a fresh frame — the same thing a manual reload would do, but seamless. Gated
// to video hosts so ordinary pages are never touched.
function nudgeMediaRepaint(tab) {
  if (!tab || !tab.wv || !tab.ready) return;
  const url = tab.url || '';
  if (!/(?:^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be)\//.test(url) &&
      !/(?:^|\/\/)(?:www\.)?(?:youtube\.com|youtu\.be)/.test(url)) return;
  // Two frames after the visibility flip so the compositor has re-shown the
  // guest, then force the player to re-lay-out AND poke the video's own
  // compositing layer — a black-but-playing frame clears without a reload.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      tab.wv.executeJavaScript(
        '(function(){try{window.dispatchEvent(new Event("resize"));' +
        'var v=document.querySelector("video");' +
        'if(v){var t=v.style.transform;v.style.transform="translateZ(0)";' +
        'requestAnimationFrame(function(){v.style.transform=t||"";});}}catch(e){}})();',
        true,
      ).catch(() => {});
    } catch { /* webview torn down mid-switch — ignore */ }
  }));
}

// Hold the outgoing page on screen, underneath, until the incoming one has
// painted. Hiding it immediately exposed the empty #views fill for the frame or
// two before the new page drew — the black flash when opening a new tab (most
// obvious against a live wallpaper, where the surrounding chrome keeps moving
// while the content area blinks out).
function releaseUnderlay(under) {
  if (!under) return;
  under.classList.remove('underlay');
  // Only actually hide it if it is still not the active tab.
  if (activeTab()?.wv !== under) under.classList.add('inactive');
}

function activateTab(id) {
  const tab = getTab(id);
  if (!tab) return;
  // Both halves of Tab Snooze hang off this: the tab you are leaving starts
  // its clock, and the one you are arriving at gets its page back.
  const leaving = activeTab();
  if (leaving && leaving !== tab) {
    leaving.lastSeenAt = Date.now();
    // …and its hover preview is taken here, on the way out. This is the one
    // moment the tab is certainly rendered and its picture has stopped
    // changing, so the capture is free and the card is instant later.
    warmTabPreview(leaving, true);
  }
  tab.lastSeenAt = Date.now();
  wakeTab(tab);
  // In Split View, activating one of the two pane tabs keeps the split and
  // just moves "focus" to that pane; activating any other tab ends it.
  if (typeof splitExitOnActivate === 'function') splitExitOnActivate(id);
  const prevWv = activeTab()?.wv || null;
  activeId = id;
  // Only worth an underlay when there IS an outgoing page and the incoming one
  // has nothing to show yet.
  // Never in Split View: both panes are meant to be on screen at once, and an
  // underlay would sit over/under them and fight layoutSplit() for visibility.
  const inSplit = typeof isSplit === 'function' && isSplit();
  const useUnderlay = !inSplit && !!prevWv && prevWv !== tab.wv && tab.wv._privooPainted === false;
  for (const t of tabs) {
    const on = t.id === id;
    t.tabEl.classList.toggle('active', on);
    if (!on && useUnderlay && t.wv === prevWv) {
      t.wv.classList.add('underlay');
      continue;
    }
    t.wv.classList.remove('underlay');
    t.wv.classList.toggle('inactive', !on);
  }
  if (useUnderlay) {
    // Whichever comes first: the incoming page paints, or a hard cap so a page
    // that never settles can't pin the old one on screen indefinitely.
    const timer = setTimeout(() => releaseUnderlay(prevWv), 1400);
    tab.wv.addEventListener('privoo-painted', () => {
      clearTimeout(timer);
      releaseUnderlay(prevWv);
    }, { once: true });
  }
  // The loop above hid every non-active webview — if a split is still up,
  // re-apply its layout so both panes stay visible and positioned.
  if (typeof isSplit === 'function' && isSplit()) layoutSplit();
  // Nudge the newly-visible page to repaint its video. Coming back from
  // `visibility: hidden`, the HTML5 player can be left showing a stale/black
  // frame; a synthetic resize makes YouTube (and other players) re-lay-out
  // and paint a fresh frame instead of needing a manual refresh.
  nudgeMediaRepaint(tab);
  tab.tabEl.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  syncToolbar();
  updateAudioButton();
  if (typeof updatePipBtn === 'function') updatePipBtn();
  if (typeof updateZoomIndicator === 'function') updateZoomIndicator();
  // Re-evaluate the welcome / leaving-Privoo banner for the new active tab
  // so it doesn't stick around from the previous one.
  if (typeof maybeShowOverlayBanner === 'function') maybeShowOverlayBanner(tab.url);
  triggerWobble();
  requestAnimationFrame(resizeTabs);
  scheduleSaveSession();
  renderVtabs();
  updateDiscordActivity();
  // A new tab coming to the front is the one moment the "after fifteen sites"
  // note has somewhere to belong, so that is when it is offered the chance.
  void maybeNoteOnNewTab();
}

function closeTab(id) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return;
  if (performance.now() > 2500) ThemeUiSfx.play('close');
  // Closing either Split View pane tears the split down cleanly.
  if (typeof splitExitOnClose === 'function') splitExitOnClose(id);
  const [tab] = tabs.splice(idx, 1);
  // Immediately flush the session so that even if the app is quit before
  // the debounced scheduleSaveSession fires, the closed tab is not restored.
  // (Skipped for incognito/guest windows — they never persist their tabs.)
  if (!_sessionPersistDisabled()) {
    try { window.privoo.saveTabSessionSync?.(serializeSession()); } catch { /* ignore */ }
  }
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
    if (document.body.classList.contains('vertical-tabs') && vtabsSearchPopupEnabled()) {
      activeId = null;
      omnibox.value = '';
      omnibox.blur();
      hideOverlayBanner();
      renderVtabs();
      scheduleSaveSession();
      showSearchPopup();
      return;
    }
    createTab();
    return;
  }
  if (activeId === id) activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
  else resizeTabs();
  try { tab.wv.remove(); } catch (_) {}
  // The strip is not re-rendered here (that would fight the closing
  // animation), so the island's end cap has to be moved by hand.
  markIslandCaps();
  renderVtabs();
  scheduleSaveSession();
}

// ─── Tab drag-to-reorder ─────────────────────────────────────────────────────
// See the long note above wireDrag() for why this is pointer-driven rather
// than HTML5 drag-and-drop.
const DRAG_THRESHOLD = 4;        // px of movement before it is a drag

let _drag = null;                // the live gesture, or null

function wireDrag(tab) {
  const { tabEl } = tab;
  // draggable=true is what makes Chromium take over the gesture and draw its
  // own drag image. It has to be off for a pointer-driven drag to work.
  tabEl.draggable = false;

  tabEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    // These are buttons that happen to live on a tab, not handles for it.
    if (e.target.closest('.tab-close, .tab-react-btn, .tab-audio-ind')) return;
    startDragArm(tab, e);
  });
}

function startDragArm(tab, e) {
  const strip = tab.tabEl.parentElement;
  if (!strip) return;

  // Only the run of tabs on the same side of the pinned divide can be
  // reordered against each other.
  const peers = tabs.filter((t) => !!t.pinned === !!tab.pinned && t.tabEl.parentElement === strip);
  const index = peers.indexOf(tab);
  if (index < 0) return;

  _drag = {
    tab, peers, strip,
    from: index,
    to: index,
    startX: e.clientX,
    moved: false,
    // Every peer's resting position, measured once. Nothing is re-measured
    // during the gesture, so the numbers cannot drift as things animate.
    slots: peers.map((t) => {
      const r = t.tabEl.getBoundingClientRect();
      return { left: r.left, width: r.width, mid: r.left + r.width / 2 };
    }),
  };

  try { tab.tabEl.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
  tab.tabEl.addEventListener('pointermove', onDragMove);
  tab.tabEl.addEventListener('pointerup', onDragEnd);
  tab.tabEl.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!_drag) return;
  const dx = e.clientX - _drag.startX;

  if (!_drag.moved) {
    if (Math.abs(dx) < DRAG_THRESHOLD) return;
    _drag.moved = true;
    _drag.tab.tabEl.classList.add('dragging');
    document.body.classList.add('tab-reordering');
    beginTabDrag(_drag.tab.id, null);
    hideTabPreview();
  }

  const { slots, from } = _drag;
  const self = slots[from];

  // Where the grabbed tab's centre is now, clamped to the run it belongs to.
  const minX = slots[0].left - self.left;
  const maxX = slots[slots.length - 1].left + slots[slots.length - 1].width - (self.left + self.width);
  const clamped = Math.max(minX, Math.min(dx, maxX));
  _drag.tab.tabEl.style.transform = 'translateX(' + clamped + 'px)';

  // Which slot is it over? The first one whose centre it has passed.
  const centre = self.mid + clamped;
  let to = from;
  for (let i = 0; i < slots.length; i++) {
    if (i === from) continue;
    if (i < from && centre < slots[i].mid) { to = Math.min(to, i); }
    if (i > from && centre > slots[i].mid) { to = Math.max(to, i); }
  }
  if (to !== _drag.to) {
    _drag.to = to;
    paintDragShift();
  }

  // Dragged down onto the page: offer to split. The dropzones are only
  // reachable this way now, since a pointer drag fires no dragover.
  _drag.splitSide = splitSideAt(e.clientX, e.clientY);
  paintSplitTarget(_drag.splitSide);
}

// Which half of the page area the pointer is over, or null if it is still up
// in the tab strip.
function splitSideAt(x, y) {
  if (tabs.length < 2) return null;            // nothing to split against
  const wrap = document.getElementById('views');
  if (!wrap) return null;
  const r = wrap.getBoundingClientRect();
  if (y < r.top + 40 || y > r.bottom || x < r.left || x > r.right) return null;
  return x < r.left + r.width / 2 ? 'left' : 'right';
}

function paintSplitTarget(side) {
  splitDropzones?.querySelectorAll('.split-dz').forEach((dz) => {
    dz.classList.toggle('drop-active', !!side && dz.dataset.side === side);
  });
}

// Slide every OTHER tab by exactly one slot, in the direction that opens a
// gap where the grabbed tab is going. Transform only — no reflow, so the
// strip cannot jump under the pointer.
function paintDragShift() {
  const { peers, slots, from, to, tab } = _drag;
  const width = slots[from].width;
  for (let i = 0; i < peers.length; i++) {
    if (peers[i] === tab) continue;
    let shift = 0;
    if (from < to && i > from && i <= to) shift = -width;
    else if (from > to && i >= to && i < from) shift = width;
    peers[i].tabEl.style.transform = shift ? 'translateX(' + shift + 'px)' : '';
  }
}

function onDragEnd() {
  if (!_drag) return;
  const { tab, peers, from, to, moved, splitSide } = _drag;

  tab.tabEl.removeEventListener('pointermove', onDragMove);
  tab.tabEl.removeEventListener('pointerup', onDragEnd);
  tab.tabEl.removeEventListener('pointercancel', onDragEnd);
  _drag = null;

  // Clear every transform before the DOM changes, or the tabs animate from
  // wherever the gesture left them to wherever they now belong.
  for (const t of peers) {
    t.tabEl.style.transform = '';
    t.tabEl.classList.remove('dragging');
  }
  document.body.classList.remove('tab-reordering');
  endTabDrag();

  if (!moved) return;              // it was a click; activateTab handles it

  // Released over the page rather than the strip — that is a split, not a
  // reorder, so the order is left alone.
  if (splitSide) { dragSplit(tab.id, splitSide); return; }

  if (to === from) return;

  // Reorder the model, then let the strip redraw into the arrangement the
  // user was already looking at.
  const moving = peers[from];
  const reordered = peers.filter((t) => t !== moving);
  reordered.splice(to, 0, moving);

  // Splice the reordered run back into `tabs` in place, leaving the tabs on
  // the other side of the pinned divide exactly where they were.
  const rest = tabs.filter((t) => !peers.includes(t));
  tabs = moving.pinned ? [...reordered, ...rest] : [...rest, ...reordered];

  renderTabStrip();
  renderVtabs();
  scheduleSaveSession();
}

// ─── Custom HTML context menu ────────────────────────────────────────────────
let _ctxResolve = null;
let _ctxFlyout  = null;

function _closeCtxMenu(chosen = null) {
  _ctxUnbindKeys();
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
    /* A strip of quick emoji across the top, the way Chrome does on a text
       field. The stylesheet has had rules for this since before the item was
       taken out; this is the code that draws them. */
    if (item.type === 'emoji') {
      const row = document.createElement('div');
      row.className = 'ctx-emoji-row';
      const pick = (fn) => (e) => {
        // mousedown, not click: the backdrop dismisses the menu on mousedown,
        // so a click handler here would never see its own press.
        e.preventDefault(); e.stopPropagation();
        _closeCtxMenu(null);
        try { fn(); } catch { /* the field went away */ }
      };
      for (const glyph of QUICK_REACTIONS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ctx-emoji';
        b.textContent = glyph;
        b.title = glyph;
        b.addEventListener('mousedown', pick(() => item.onPick(glyph)));
        row.appendChild(b);
      }
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'ctx-emoji ctx-emoji-more';
      more.textContent = '\u22ef';
      more.title = 'All emoji';
      more.addEventListener('mousedown', pick(() => item.onMore()));
      row.appendChild(more);
      container.appendChild(row);
      continue;
    }
    if (item.type === 'separator') {
      const s = document.createElement('div');
      s.className = 'ctx-sep';
      container.appendChild(s);
      continue;
    }
    const row = document.createElement('div');
    const off = item.enabled === false;
    row.className = 'ctx-item' + (off ? ' disabled' : '');
    // The pointer and the keyboard have to agree on which row is current, or
    // arrowing down after hovering jumps back to wherever the keyboard was.
    if (!off) {
      row.addEventListener('mouseenter', () => {
        container.querySelectorAll('.ctx-item.sel').forEach((r) => r.classList.remove('sel'));
        row.classList.add('sel');
      });
    }
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
      // Click to open/close, not hover. A hover flyout depends on the
      // pointer's exact path between the row and the flyout never crossing
      // a dead zone, which is fragile and was the previous bug here
      // ("New group" doing nothing). A click toggle has no such dependency.
      row.addEventListener('mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (_ctxFlyout && row.classList.contains('ctx-submenu-open')) {
          _ctxFlyout.remove(); _ctxFlyout = null;
          row.classList.remove('ctx-submenu-open');
          return;
        }
        if (_ctxFlyout) { _ctxFlyout.remove(); _ctxFlyout = null; }
        container.querySelectorAll('.ctx-submenu-open').forEach((r) => r.classList.remove('ctx-submenu-open'));
        row.classList.add('ctx-submenu-open');
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
        fly.addEventListener('mousedown', (ev) => {
          const r = ev.target.closest('.ctx-item');
          if (!r || r.classList.contains('disabled') || !r.dataset.menuId) return;
          ev.preventDefault(); ev.stopPropagation();
          _closeCtxMenu(r.dataset.menuId);
        }, true);
      });
    } else if (!off && item.id) {
      row.dataset.menuId = item.id;
    }
    container.appendChild(row);
  }
}

/* Everything a native menu gave for free and an HTML one has to be told. */
let _ctxKeys = null;

function _ctxRows(target) {
  return [...target.querySelectorAll('.ctx-item:not(.disabled)')];
}

function _ctxSelect(target, next) {
  const rows = _ctxRows(target);
  if (!rows.length) return;
  const cur = rows.findIndex((r) => r.classList.contains('sel'));
  let i;
  if (next === 'first') i = 0;
  else if (next === 'last') i = rows.length - 1;
  // Wrapping, because a menu is a ring: Up on the first row should reach the
  // last rather than doing nothing.
  else i = (cur + next + rows.length) % rows.length;
  rows.forEach((r) => r.classList.remove('sel'));
  rows[i].classList.add('sel');
  rows[i].scrollIntoView({ block: 'nearest' });
}

function _ctxBindKeys(target) {
  _ctxUnbindKeys();
  _ctxKeys = (e) => {
    const k = e.key;
    if (k === 'Escape')    { e.preventDefault(); _closeCtxMenu(null); return; }
    if (k === 'ArrowDown') { e.preventDefault(); _ctxSelect(target, 1); return; }
    if (k === 'ArrowUp')   { e.preventDefault(); _ctxSelect(target, -1); return; }
    if (k === 'Home')      { e.preventDefault(); _ctxSelect(target, 'first'); return; }
    if (k === 'End')       { e.preventDefault(); _ctxSelect(target, 'last'); return; }
    if (k === 'Enter' || k === ' ') {
      const sel = target.querySelector('.ctx-item.sel');
      if (!sel) return;
      e.preventDefault();
      // A row with a submenu opens it rather than choosing anything, which is
      // what its arrow has been promising.
      if (sel.dataset.menuId) _closeCtxMenu(sel.dataset.menuId);
      else sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return;
    }
    // Type-ahead: one printable character, no modifiers.
    if (k.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const rows = _ctxRows(target);
      const at = rows.findIndex((r) => r.classList.contains('sel'));
      const want = k.toLowerCase();
      // From the row AFTER the current one, so pressing the same letter again
      // steps through every item beginning with it.
      for (let n = 1; n <= rows.length; n++) {
        const r = rows[(at + n + rows.length) % rows.length];
        const label = (r.querySelector('.ctx-label') || {}).textContent || '';
        if (label.trim().toLowerCase().startsWith(want)) {
          e.preventDefault();
          rows.forEach((x) => x.classList.remove('sel'));
          r.classList.add('sel');
          r.scrollIntoView({ block: 'nearest' });
          return;
        }
      }
    }
  };
  document.addEventListener('keydown', _ctxKeys, true);
}

function _ctxUnbindKeys() {
  if (_ctxKeys) document.removeEventListener('keydown', _ctxKeys, true);
  _ctxKeys = null;
}

function showHtmlMenu(items, x, y, el) {
  _closeCtxMenu(null);
  const target = el || wvContextMenu;
  if (!target) return Promise.resolve(null);
  return new Promise((resolve) => {
    _ctxResolve = resolve;
    _ctxBindKeys(target);
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
ctxBackdrop?.addEventListener('mousedown', () => { _closeCtxMenu(null); });

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

  // Build the "Tab island" submenu — the existing islands, plus a way to
  // start a new one or leave the current one.
  const groupSubmenu = [{ id: 'g-new', label: 'New island' }];
  const otherGroups = tabGroups.filter(g => g.id !== tab.groupId);
  if (otherGroups.length) {
    groupSubmenu.push({ type: 'separator' });
    for (const g of otherGroups) {
      groupSubmenu.push({ id: `g-add-${g.id}`, label: `Move to "${g.name}"` });
    }
  }
  if (tab.groupId) {
    groupSubmenu.push({ type: 'separator' });
    groupSubmenu.push({ id: 'g-leave', label: 'Remove from island' });
  }

  // Quick reactions inline, so the common case is one menu and one click.
  const reactionSubmenu = QUICK_REACTIONS.map((e) => ({
    id: 'react-' + e,
    label: e + '   ' + (tab.reaction === e ? '(remove)' : ''),
  }));
  reactionSubmenu.push({ type: 'separator' });
  reactionSubmenu.push({ id: 'react-more', label: 'All emoji…' });
  if (tab.reaction) reactionSubmenu.push({ id: 'react-clear', label: 'Remove reaction' });

  const items = [
    { id: 'pin',          label: tab.pinned ? 'Unpin tab' : 'Pin tab' },
    { id: 'duplicate',    label: 'Duplicate tab' },
    { label: 'Reaction',  submenu: reactionSubmenu },
    { type: 'separator' },
    { id: 'mute',         label: tab.isMuted ? 'Unmute tab' : 'Mute tab' },
    { id: 'close',        label: 'Close tab' },
    { id: 'close-others', label: 'Close other tabs', enabled: tabs.length > 1 },
    { type: 'separator' },
    { label: 'Tab island',  submenu: groupSubmenu },
  ];

  // Privoo's own menu, the same as the page menu. Positioned by hand, which
  // showHtmlMenu already clamps to the viewport so it cannot be clipped.
  const action = await showHtmlMenu(items, x, y);
  if (!action) return;

  switch (action) {
    case 'pin':
      tab.pinned = !tab.pinned;
      tab.tabEl.classList.toggle('pinned', tab.pinned);
      enforcePinnedFirst();
      requestAnimationFrame(resizeTabs);
      scheduleSaveSession();
      break;
    case 'duplicate':
      if (tab.url) createTab(tab.url);
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
      if (action === 'react-more') {
        openEmojiPicker(null, null, (glyph) => setTabReaction(tab, glyph));
      } else if (action === 'react-clear') {
        setTabReaction(tab, null);
      } else if (action.startsWith('react-')) {
        setTabReaction(tab, action.slice(6));
      } else if (action === 'g-new') {
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
    // insertCSS does not survive a navigation, so every document gets it.
    applyGuestCursor(wv);
    applyGuestVision(wv);
  }, { signal });

  wv.addEventListener('page-title-updated', (e) => {
    // about:blank has no title, and a sleeping tab keeps the one it had.
    if (tab.snoozed) return;
    tab.title = e.title || tab.url;
    if (titleEl) { titleEl.textContent = tab.title; titleEl.title = tab.title; }
    if (tab.id === activeId) updateBookmarkButton();
    renderVtabs();
  }, { signal });

  wv.addEventListener('page-favicon-updated', (e) => {
    // Privoo's own pages keep their per-page icon (settings=gear, history=
    // clock, …) set in onNav — don't let the page's own <link rel="icon">
    // (same shield on every internal page) override it.
    if (tab.url?.startsWith('privoo://')) { renderVtabs(); return; }
    const icon = e.favicons?.[0];
    if (icon) applyTabFavicon(tab, icon);
    renderVtabs();
  }, { signal });

  const onNav = () => {
    // Parking a sleeping tab on about:blank fires this. Its address is still
    // the page it will come back to, so leave the model alone.
    if (tab.snoozed) return;
    tab.url = wv.getURL();
    // The new tab is the only page allowed to have no backing of its own.
    wv.classList.toggle('is-ntp', isNewTabPage(tab.url));
    // A new document, so nothing has been typed into it yet.
    tab.formDirty = false;
    // The hover preview caches the last capture per tab, because capturePage()
    // on a background tab returns its last painted frame and re-taking it on
    // every hover would be wasted work. A navigation is the one moment that
    // cache is certainly wrong.
    tab._previewShot = null;
    if (tab.url.startsWith('privoo://')) {
      const icon = faviconForPrivooUrl(tab.url);
      tab.faviconUrl = icon;
      if (faviconEl) { faviconEl.style.backgroundImage = 'url("' + icon + '")'; faviconEl.classList.remove('spin'); }
      if (tab.url === NEWTAB_URL && titleEl) titleEl.textContent = tab.title = newTabLabel();
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
    tab.loading = true;
    tab.tabEl.classList.add('loading');
    faviconEl.classList.add('spin');
    renderVtabs();
    if (tab.id === activeId) {
      reloadBtn.innerHTML = STOP_ICON;
      // Suggestion dropdown should never linger over a loading page.
      hideSuggestions();
      omnibox.blur();
    }
  }, { signal });
  wv.addEventListener('did-stop-loading', () => {
    tab.loading = false;
    tab.tabEl.classList.remove('loading');
    faviconEl.classList.remove('spin');
    renderVtabs();
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
    // Late requests (lazy-loaded ads, XHR beacons) keep getting blocked after
    // the page reports itself done — catch those without polling forever.
    setTimeout(() => { if (tab === activeTab()) refreshPageShield(tab); }, 1500);
    setTimeout(() => { if (tab === activeTab()) refreshPageShield(tab); }, 4000);
  }, { signal });

  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame) return;       // subframe failures (ads, iframes) — ignore
    const failedUrl = e.validatedURL || '';

    // Download-only tab: a fresh tab that has never rendered anything and
    // failed with ERR_FAILED / ERR_ABORTED is a window.open() that resolved
    // to a Content-Disposition: attachment. The download is already running
    // via the session's will-download handler, so close the empty tab rather
    // than leaving it on a blank page.
    //
    // This check has to come BEFORE the ERR_ABORTED early-return below.
    // ERR_ABORTED (-3) is exactly what this case reports — the navigation is
    // cancelled the instant the response turns out to be an attachment — so
    // while the return came first, the tab could never be closed.
    if (!tab.everLoaded && (e.errorCode === -2 || e.errorCode === -3)) {
      closeTab(tab.id);
      return;
    }

    if (e.errorCode === -3) return;   // -3 = ERR_ABORTED (navigation cancelled, not a real failure)
    // Don't replace our own internal pages with the error page
    if (failedUrl.startsWith('privoo://')) return;

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
    // 'media-started-playing' also fires for MUTED/inaudible media — e.g. the
    // live-wallpaper video, or background gradients — so only show the speaker
    // icon when the tab is actually producing sound.
    setTimeout(() => {
      try {
        const audible = typeof wv.isCurrentlyAudible === 'function' ? wv.isCurrentlyAudible() : true;
        const muted = typeof wv.isAudioMuted === 'function' ? wv.isAudioMuted() : false;
        tab.isPlayingAudio = !!audible && !muted;
      } catch { tab.isPlayingAudio = true; }
      updateTabAudioIndicator(tab);
      updateAudioButton();
    }, 150);
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
    if (e.channel === 'form-dirty') {
      // This page has been typed into — Tab Snooze leaves it alone from here.
      tab.formDirty = true;
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
    if (e.channel === 'identity-request-fill') {
      void handleIdentityFillRequest(tab, e.args?.[0] || {});
      return;
    }
    if (e.channel === 'file-picker-request') {
      void showFilePickerPopover(tab, e.args?.[0] || {});
      return;
    }
    if (e.channel === 'open-customize-panel') {
      openCustomizePanel();
      return;
    }
    if (e.channel === 'open-vpn-panel') {
      closePopovers();
      vpnPanel?.classList.remove('hidden');
      vpnRender(settings);
      return;
    }
    if (e.channel === 'ui-sound') {
      ThemeUiSfx.play(String(e.args?.[0] || 'type'));
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
    h === 'google.com'                  || h.endsWith('.google.com') ||
    // YouTube — forceDark injects CSS filter:invert on <video> which makes the
    // player render a black frame on first play. Skip all injection on YouTube.
    h === 'youtube.com'                 || h.endsWith('.youtube.com') ||
    h === 'youtu.be'                    || h.endsWith('.youtu.be') ||
    // TikTok / ByteDance — their login uses a device-fingerprint SDK
    // (webmssdk/secsdk) that reads canvas output. Farbling it feeds the SDK a
    // value it then fails to base64-decode (atob error), which is exactly why
    // login was breaking. Must match main.js's compat list, which already has
    // these — the two lists had drifted, leaving farbling on for TikTok here.
    h === 'tiktok.com'                  || h.endsWith('.tiktok.com') ||
    h === 'tiktokv.com'                 || h.endsWith('.tiktokv.com') ||
    h === 'tiktokcdn.com'               || h.endsWith('.tiktokcdn.com') ||
    h.endsWith('.tiktokcdn-us.com')     ||
    h === 'byteoversea.com'             || h.endsWith('.byteoversea.com') ||
    h === 'bytedance.com'               || h.endsWith('.bytedance.com') ||
    h.endsWith('.ttwstatic.com')        ||
    // Snapchat web — same class of integrity check; farbling left it blank.
    h === 'snapchat.com'                || h.endsWith('.snapchat.com') ||
    h === 'snap.com'                    || h.endsWith('.snap.com')
  );
}

// ── Discord theme sync ──────────────────────────────────────────────────────
// Map Privoo's current accent + theme palette onto Discord's CSS custom
// properties so discord.com takes on the browser's look. Injected on Discord
// pages from applyInjections and refreshed live when the theme changes.
function isDiscordHost(host) {
  return /(^|\.)discord\.com$/i.test(host) || /(^|\.)discordapp\.com$/i.test(host);
}
function privooThemePalette() {
  if (Array.isArray(settings?.ntpWaveColors) && settings.ntpWaveColors.length) return settings.ntpWaveColors;
  if (settings?.ntpThemeId) {
    const t = THEME_LIST.find(x => x.id === settings.ntpThemeId);
    if (t) return t.colors;
  }
  return WAVE_DEFAULT;
}
function privooThemeColors() {
  const accent = String(settings?.accentColor || '#4f46e5');
  const pal = privooThemePalette();
  // Darkest palette entry → background tint base (kept dark for text contrast).
  let dark = pal[0], lum = Infinity;
  for (const c of pal) {
    const h = String(c).replace('#', '');
    if (h.length < 6) continue;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const L = 0.299 * r + 0.587 * g + 0.114 * b;
    if (L < lum) { lum = L; dark = c; }
  }
  return { accent, dark };
}
function discordThemeSyncScript(accent, dark) {
  return `(function(){
  try{
    var ACCENT=${JSON.stringify(accent)};
    var DARK=${JSON.stringify(dark || '')};
    function rgbOf(h){h=String(h||'').replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];if(h.length<6)return null;return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
    function mix(a,b,t){return 'rgb('+Math.round(a[0]+(b[0]-a[0])*t)+','+Math.round(a[1]+(b[1]-a[1])*t)+','+Math.round(a[2]+(b[2]-a[2])*t)+')';}
    var ac=rgbOf(ACCENT); if(!ac) return;
    var BLACK=[0,0,0];
    var css=':root{';
    var brandVars=['--brand-experiment','--brand-experiment-100','--brand-experiment-200','--brand-experiment-300','--brand-experiment-360','--brand-experiment-400','--brand-experiment-460','--brand-experiment-500','--brand-experiment-560','--brand-experiment-600','--brand-experiment-700','--brand-260','--brand-300','--brand-345','--brand-360','--brand-400','--brand-430','--brand-460','--brand-500','--brand-530','--brand-560','--brand-600','--brand-630','--brand-660','--brand-700','--button-filled-brand-background','--button-filled-brand-background-hover','--button-filled-brand-background-active','--text-link','--text-link-low-saturation','--mention-foreground','--control-brand-foreground','--control-brand-foreground-new','--input-focused-border-color'];
    for(var i=0;i<brandVars.length;i++){css+=brandVars[i]+':'+ACCENT+' !important;';}
    css+='--brand-experiment-opacity-6:rgba('+ac[0]+','+ac[1]+','+ac[2]+',.06) !important;';
    css+='--brand-experiment-opacity-12:rgba('+ac[0]+','+ac[1]+','+ac[2]+',.12) !important;';
    css+='--background-modifier-selected:rgba('+ac[0]+','+ac[1]+','+ac[2]+',.16) !important;';
    css+='--background-message-hover:rgba('+ac[0]+','+ac[1]+','+ac[2]+',.04) !important;';
    var dk=rgbOf(DARK);
    if(dk){
      css+='--background-primary:'+mix(dk,BLACK,.55)+' !important;';
      css+='--background-secondary:'+mix(dk,BLACK,.45)+' !important;';
      css+='--background-secondary-alt:'+mix(dk,BLACK,.38)+' !important;';
      css+='--background-tertiary:'+mix(dk,BLACK,.62)+' !important;';
      css+='--background-floating:'+mix(dk,BLACK,.68)+' !important;';
      css+='--background-nested-floating:'+mix(dk,BLACK,.6)+' !important;';
      css+='--channeltextarea-background:'+mix(dk,BLACK,.42)+' !important;';
      css+='--bg-base-primary:'+mix(dk,BLACK,.55)+' !important;';
      css+='--bg-base-secondary:'+mix(dk,BLACK,.45)+' !important;';
      css+='--bg-base-tertiary:'+mix(dk,BLACK,.62)+' !important;';
      css+='--bg-base-lower:'+mix(dk,BLACK,.68)+' !important;';
    }
    css+='}';
    var id='privoo-discord-theme';
    var el=document.getElementById(id);
    if(!el){el=document.createElement('style');el.id=id;(document.head||document.documentElement).appendChild(el);}
    el.textContent=css;
  }catch(e){}
  })();`;
}
function injectDiscordTheme(wv) {
  try {
    const { accent, dark } = privooThemeColors();
    wv.executeJavaScript(discordThemeSyncScript(accent, dark)).catch(() => {});
  } catch {}
}
function clearDiscordTheme(wv) {
  try {
    wv.executeJavaScript("(function(){var e=document.getElementById('privoo-discord-theme');if(e)e.remove();})();").catch(() => {});
  } catch {}
}
// Re-apply (or clear) the Discord theme on every open Discord tab — called when
// the accent/theme changes or the setting is toggled, so it updates live.
function refreshDiscordThemeTabs() {
  for (const t of tabs) {
    let host = '';
    try { host = new URL(t.url).hostname; } catch { continue; }
    if (!isDiscordHost(host)) continue;
    if (settings?.syncDiscordTheme !== false) injectDiscordTheme(t.wv);
    else clearDiscordTheme(t.wv);
  }
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
  if (settings?.lucidMode) {
    wv.executeJavaScript(LUCID_MODE_JS).catch(() => {});
  }
  // YouTube black-frame auto-fix — poke the video's compositor when it starts
  // playing so the first-video-of-session black screen clears without a reload.
  try {
    if (/(?:^|\.)(youtube\.com|youtube-nocookie\.com)$/.test(new URL(url).hostname)) {
      wv.executeJavaScript(YOUTUBE_FIX_JS).catch(() => {});
      // Ad skipping is gated on the ad blocker being on, so switching it off
      // really does mean ads play.
      if (settings?.adBlocking !== false) {
        wv.executeJavaScript(YOUTUBE_ADSKIP_JS + '()').catch(() => {});
      }
    }
  } catch { /* invalid URL — skip */ }
  const geo = geoCoordsFromSettings(settings);
  if (geo) {
    wv.executeJavaScript(geolocationOverrideScript(geo[0], geo[1])).catch(() => {});
  }
  if (settings?.passwordManagerEnabled !== false && window.privoo?.passwordAutofillScript) {
    wv.executeJavaScript(window.privoo.passwordAutofillScript).catch(() => {});
  }
  if (settings?.identityAutofillEnabled === true && window.privoo?.identityAutofillScript) {
    wv.executeJavaScript(window.privoo.identityAutofillScript).catch(() => {});
  }
  if (settings?.easyFilesEnabled !== false && window.privoo?.filePickerScript) {
    wv.executeJavaScript(window.privoo.filePickerScript).catch(() => {});
  }
  if (settings?.preferPasswordLogin !== false && window.privoo?.googlePasswordPreferScript) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes('google.com') || host.includes('accounts.google')) {
        wv.executeJavaScript(window.privoo.googlePasswordPreferScript).catch(() => {});
      }
    } catch { /* ignore */ }
  }
  // Discord theme sync — recolor discord.com to match Privoo's accent + theme.
  if (settings?.syncDiscordTheme !== false) {
    try { if (isDiscordHost(new URL(url).hostname)) injectDiscordTheme(wv); } catch { /* ignore */ }
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

// ── Identity autofill (name/address/phone/etc, separate from the password
// vault above) ──────────────────────────────────────────────────────────────
// Cheap regex heuristics handle the common cases (autocomplete attributes,
// conventional name/id patterns) with zero latency. Fields that don't match
// anything fall back to a local Ollama model, when one is reachable, to
// interpret less conventional labels/placeholders — this never blocks the
// fill if Ollama is absent or slow.
const IDENTITY_HEURISTICS = [
  ['email',     /email|e-mail/i],
  ['phone',     /phone|tel(ephone)?|mobile/i],
  ['firstName', /first[-_ ]?name|given[-_ ]?name|fname/i],
  ['lastName',  /last[-_ ]?name|sur[-_ ]?name|family[-_ ]?name|lname/i],
  ['fullName',  /full[-_ ]?name|^name$|your[-_ ]?name/i],
  ['company',   /compan(y|ies)|organi[sz]ation|business/i],
  ['address2',  /address[-_ ]?(line)?[-_ ]?2|apt|suite|unit/i],
  ['address1',  /address[-_ ]?(line)?[-_ ]?1|street|address$/i],
  ['city',      /city|town/i],
  ['state',     /\bstate\b|province|region/i],
  ['zip',       /zip|postal/i],
  ['country',   /country/i],
];

function heuristicIdentityMap(fields) {
  const map = {};
  const used = new Set();
  for (const f of fields) {
    const hay = [f.autocomplete, f.name, f.id, f.label, f.placeholder].join(' ').toLowerCase();
    for (const [key, re] of IDENTITY_HEURISTICS) {
      if (used.has(key)) continue;
      if (re.test(hay)) { map[f.index] = key; used.add(key); break; }
    }
  }
  return map;
}

function requestIdentityAutofill(tab) {
  if (!tab?.wv) return;
  tab.wv.executeJavaScript(`window.postMessage({ __privoo_id_request: true }, '*');`).catch(() => {});
}

async function handleIdentityFillRequest(tab, payload) {
  if (!window.privoo?.identitiesGetDefault || settings?.identityAutofillEnabled !== true) return;
  const fields = Array.isArray(payload?.fields) ? payload.fields : [];
  if (!fields.length) return;

  let identity = null;
  try { identity = await window.privoo.identitiesGetDefault(); } catch { return; }
  if (!identity?.fields) return;

  let map = heuristicIdentityMap(fields);
  const unmatched = fields.filter((f) => map[f.index] == null);
  if (unmatched.length && window.privoo?.ollamaResolveFields) {
    try {
      const extra = await window.privoo.ollamaResolveFields(unmatched, Object.keys(identity.fields));
      if (extra && typeof extra === 'object') map = { ...extra, ...map };
    } catch { /* Ollama unreachable — heuristics-only fill still applies */ }
  }

  const values = {};
  for (const idx in map) {
    const v = identity.fields[map[idx]];
    if (v) values[idx] = v;
  }
  if (!Object.keys(values).length) return;
  tab.wv.executeJavaScript(
    `window.postMessage({ __privoo_id_fill: true, map: ${JSON.stringify(values)} }, '*');`
  ).catch(() => {});
}

let _fpPop = null;
function closeFilePickerPopover() { _fpPop?.remove(); _fpPop = null; }
document.addEventListener('click', (ev) => {
  if (!_fpPop || _fpPop.dataset.justOpened) return;
  if (!_fpPop.contains(ev.target)) closeFilePickerPopover();
});

function fpRelativeTime(ms) {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

// One glyph per file category. Colour comes from CSS so they pick up the
// theme rather than being baked in here.
const FP_ICONS = {
  image:   '<svg viewBox="0 0 24 24"><path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z"/></svg>',
  video:   '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
  audio:   '<svg viewBox="0 0 24 24"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>',
  pdf:     '<svg viewBox="0 0 24 24"><path d="M6 2h8l6 6v14a0 0 0 0 1 0 0H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM8 13h8v1.6H8V13zm0 3.2h8v1.6H8v-1.6z"/></svg>',
  doc:     '<svg viewBox="0 0 24 24"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15zm0 3h5v1.5H8V18z"/></svg>',
  sheet:   '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 2v3h4V6H6zm6 0v3h6V6h-6zM6 11v3h4v-3H6zm6 0v3h6v-3h-6zM6 16v2h4v-2H6zm6 0v2h6v-2h-6z"/></svg>',
  slides:  '<svg viewBox="0 0 24 24"><path d="M2 3h20v13H13v3l3 3h-2l-2-2-2 2H8l3-3v-3H2V3zm2 2v9h16V5H4z"/></svg>',
  archive: '<svg viewBox="0 0 24 24"><path d="M4 3h16v4H4V3zm1 6h14v12H5V9zm6 2v2h2v-2h-2zm0 3v2h2v-2h-2z"/></svg>',
  code:    '<svg viewBox="0 0 24 24"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
  text:    '<svg viewBox="0 0 24 24"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5zM8 12h8v1.5H8V12zm0 3h8v1.5H8V15z"/></svg>',
  file:    '<svg viewBox="0 0 24 24"><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5L13 3.5z"/></svg>',
};

function fpFormatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1048576).toFixed(1) + " MB";
  return (n / 1073741824).toFixed(1) + " GB";
}

// Honour the input's accept="" so a page asking for images does not get a
// list full of spreadsheets.
function fpMatchesAccept(file, accept) {
  if (!accept) return true;
  const parts = String(accept).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return true;
  const name = String(file.name || "").toLowerCase();
  const ext = name.slice(name.lastIndexOf("."));
  const kind = file.kind || "file";
  for (const a of parts) {
    if (a.startsWith(".")) { if (ext === a) return true; continue; }
    if (a === "image/*") { if (kind === "image") return true; continue; }
    if (a === "video/*") { if (kind === "video") return true; continue; }
    if (a === "audio/*") { if (kind === "audio") return true; continue; }
    if (a === "application/pdf") { if (kind === "pdf") return true; continue; }
    if (a === "*/*") return true;
  }
  return false;
}

async function showFilePickerPopover(tab, req) {
  if (settings?.easyFilesEnabled === false || !window.privoo?.recentFilesList) return;
  closeFilePickerPopover();

  let files = [];
  try { files = await window.privoo.recentFilesList(); } catch { files = []; }

  const pop = document.createElement('div');
  pop.className = 'fp-pop';

  const accept = (req && req.accept) || "";
  // Cap the row rather than letting it scroll forever — past about eight,
  // scanning the strip is slower than opening the folder, which is what the
  // button on the end is for.
  const shown = files.filter((f) => fpMatchesAccept(f, accept)).slice(0, 8);
  const rows = shown.length
    ? shown.map((f) => (
        '<button type="button" class="fp-item" data-path="' + esc(f.path) + '" title="' + esc(f.path) + '">' +
          '<span class="fp-item-ico fp-k-' + esc(f.kind || "file") + '">' + (FP_ICONS[f.kind] || FP_ICONS.file) + '</span>' +
          '<span class="fp-item-main">' +
            '<span class="fp-item-name">' + esc(f.name) + '</span>' +
            '<span class="fp-item-meta">' + fpFormatSize(f.size) + ' · ' + fpRelativeTime(f.mtimeMs) + '</span>' +
          '</span>' +
        '</button>'
      )).join("")
    : '<div class="fp-empty">No recent files' + (accept ? " of that type" : "") + '</div>';

  pop.innerHTML =
    '<div class="fp-head">' +
      '<span class="fp-title">Recent files</span>' +
      '<span class="fp-hint">Pick one, or view more to browse</span>' +
    '</div>' +
    '<div class="fp-row">' + rows + '</div>' +
    '<button type="button" class="fp-browse" id="fp-browse">' +
      '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3.5 6.5a1.6 1.6 0 0 1 1.6-1.6h3.4l1.8 2.2h7.9a1.6 1.6 0 0 1 1.6 1.6v8.8a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z"/></svg>' +
      '<span>View more</span>' +
    '</button>';
  document.body.appendChild(pop);
  _fpPop = pop;
  pop.dataset.justOpened = '1';
  requestAnimationFrame(() => { delete pop.dataset.justOpened; });

  pop.querySelectorAll('.fp-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const filePath = btn.dataset.path;
      closeFilePickerPopover();
      let res = null;
      try { res = await window.privoo.recentFileRead(filePath); } catch { res = null; }
      if (!res?.ok) return;
      const payload = JSON.stringify({ name: res.name, mime: res.mime, base64: res.base64 });
      tab.wv.executeJavaScript(`window.postMessage({ __privoo_fp_fill: true, file: ${payload} }, '*');`).catch(() => {});
    });
  });
  pop.querySelector('#fp-browse').addEventListener('click', () => {
    closeFilePickerPopover();
    tab.wv.executeJavaScript(`window.postMessage({ __privoo_fp_open_native: true }, '*');`).catch(() => {});
  });
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

// ─── Discord Rich Presence ───────────────────────────────────────────────────
function updateDiscordActivity() {
  if (!settings?.discordRpc || !window.privoo?.setDiscordActivity) return;
  const tab = activeTab();
  if (!tab) { window.privoo.setDiscordActivity(null); return; }
  const url = tab.url || '';
  const title = (tab.title || '').trim();
  const isInternal = url.startsWith('privoo://') || url.startsWith('about:');
  let details = title || 'Browsing';
  let state;
  if (!isInternal) {
    try { state = new URL(url).hostname.replace(/^www\./, '') || undefined; } catch {}
  }
  // Don't repeat the same text on both lines (e.g. "New tab" / "newtab").
  if (state && state.toLowerCase() === details.toLowerCase()) state = undefined;
  window.privoo.setDiscordActivity({
    details: details.slice(0, 128),
    state: state ? state.slice(0, 128) : undefined,
    timestamps: { start: Math.floor(Date.now() / 1000) },
  });
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
  // The tooltip leads with what clicking does and reports the connection
  // second — the icon is a control, not a verdict on the site.
  siteIcon.title = isInternal
    ? 'Privoo internal page'
    : isSecure
      ? 'Site settings and permissions — the connection is encrypted'
      : 'Site settings and permissions — the connection is NOT encrypted';
  // Internal pages have no site permissions to manage and no connection to
  // report, so they get the shield instead.
  const wantIcon = isInternal ? 'shield' : 'settings';
  if (siteIcon.dataset.glyph !== wantIcon) {
    siteIcon.dataset.glyph = wantIcon;
    siteIcon.innerHTML = wantIcon === 'shield' ? SITE_ICON_SHIELD_SVG : SITE_ICON_SETTINGS_SVG;
  }
  updateSiteInfoPopover(tab.url, isInternal, isSecure, isHttp);
  refreshPageShield(tab);

  try {
    backBtn.disabled    = !wv.canGoBack();
    forwardBtn.disabled = !wv.canGoForward();
  } catch {
    backBtn.disabled = forwardBtn.disabled = true;
  }
  updateBookmarkButton();
  updateZoomIndicator();
  updatePipBtn();
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
// The text the user actually typed, kept so arrowing back above the first
// row can restore it.
let _sugTyped = '';
// Monotonic generation counter. Bumped on every hide/Enter/blur so that a
// suggestion fetch in flight when the user navigates can't render its
// results on top of the new page.
let _sugGen = 0;

function debounce(fn, ms) {
  return (...args) => { clearTimeout(suggestTimer); suggestTimer = setTimeout(() => fn(...args), ms); };
}

// How many of each kind survive into the list. History is capped low on
// purpose: the point of a history row is "you have been here", and if you
// have been to four matching places the top one is almost always the one.
const SUG_MAX_HISTORY = 3;
const SUG_MAX_SEARCH  = 5;

// Two URLs are the same suggestion if they differ only by scheme, www. or a
// trailing slash. Without this, typing a site you visit daily listed it
// twice — once from history, once from the search engine guessing the same.
function sugKey(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

const triggerSuggest = debounce(async (q) => {
  if (!q.trim() || q.startsWith('privoo://')) { hideSuggestions(); return; }
  const myGen = _sugGen;

  // History matches (local, fast)
  let hist = [];
  try { hist = await window.privoo.historyAutocomplete(q) || []; } catch {}
  if (myGen !== _sugGen) return;

  // Search suggestions (remote, proxied)
  let remote = [];
  if (settings?.searchSuggestions !== false) {
    try { remote = await window.privoo.getSuggestions(q, settings?.searchEngine) || []; } catch {}
  }
  if (myGen !== _sugGen) return;

  // Also bail if the omnibox isn't focused or the user has moved past this
  // query — covers the "typed, navigated, suggestion came back" race.
  if (document.activeElement !== omnibox) return;
  if (omnibox.value !== q) return;

  const typed = q.trim();
  const items = [];
  const seen = new Set();
  const push = (it) => {
    const k = sugKey(it.text);
    if (!k || seen.has(k)) return;
    seen.add(k);
    items.push(it);
  };

  // No row for what you just typed. Enter already does that, and a row
  // repeating your own query back at you took the top slot away from the
  // first real suggestion.
  for (const h of hist.slice(0, SUG_MAX_HISTORY)) {
    push({ text: h.url, label: h.title || h.url, type: 'history' });
  }
  for (const r of remote.slice(0, SUG_MAX_SEARCH)) {
    push({ text: r.text, label: r.text, type: 'search' });
  }

  renderSuggestions(items, typed);
}, 180);

const SUG_SEARCH_SVG = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>`;
const SUG_CLOCK_SVG  = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M13 3a9 9 0 1 0 2.8 17.5l-1.4-1.4A7 7 0 1 1 19 12h-3l4 4-4 4v-3a9 9 0 0 0-3-17z"/></svg>`;
const SUG_DOMAIN_RE = /^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?$/i;

// Bold the part of a row that matches what has been typed, so it is obvious
// at a glance why the row is in the list at all. Escaping happens here
// because the match has to be found in the raw text, before any entities
// exist to confuse the offsets.
function sugHighlight(text, query) {
  const raw = String(text || '');
  const q = String(query || '').trim();
  if (!q) return esc(raw);
  const at = raw.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return esc(raw);
  return esc(raw.slice(0, at))
       + '<b>' + esc(raw.slice(at, at + q.length)) + '</b>'
       + esc(raw.slice(at + q.length));
}

function renderSuggestions(items, query) {
  if (!items.length) { hideSuggestions(); return; }
  sugItems = items;
  sugIndex = -1;
  // What was in the field before any arrow key moved through the list, so
  // arrowing back past the top can put it back.
  _sugTyped = query != null ? query : omnibox.value;
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
    el.classList.add('sug-' + it.type);
    el.innerHTML =
      `<span class="sug-icon"></span>` +
      `<div class="sug-body">` +
        `<div class="sug-title">${sugHighlight(it.label, query)}</div>` +
        (it.type === 'history' && it.text !== it.label
          ? `<div class="sug-url">${sugHighlight(displayUrl(it.text), query)}</div>` : '') +
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
    } else if (SUG_DOMAIN_RE.test(it.text.trim())) {
      // Search-suggest text that looks like a domain (e.g. typing "youtub"
      // suggested "youtube.com") gets the site's real favicon instead of the
      // generic magnifying glass, matching Google's navigational suggestions.
      iconSlot.innerHTML = SUG_SEARCH_SVG;
      const raw = it.text.trim();
      const fav = faviconFallbackForUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (fav) {
        const img = document.createElement('img');
        img.src = fav;
        img.width = 16; img.height = 16; img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { iconSlot.innerHTML = SUG_SEARCH_SVG; }, { once: true });
        img.addEventListener('load', () => { iconSlot.innerHTML = ''; iconSlot.appendChild(img); }, { once: true });
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
  const rows = suggestEl.querySelectorAll('.sug-item');
  rows.forEach((el, i) => el.classList.toggle('active', i === idx));
  if (idx >= 0 && sugItems[idx]) {
    omnibox.value = sugItems[idx].text;
    // Keep the highlighted row on screen when the list is long enough to
    // scroll — arrowing into a row you cannot see is the same as no row.
    rows[idx]?.scrollIntoView({ block: 'nearest' });
  } else {
    // Back above the first row: restore what was actually typed, rather
    // than leaving the last suggestion sitting in the field.
    omnibox.value = _sugTyped;
  }
}

function hideSuggestions() {
  clearTimeout(suggestTimer);
  _sugGen++;
  suggestEl.classList.add('hidden');
  sugItems = [];
  sugIndex = -1;
  _sugTyped = '';
}

// ─── Download progress ───────────────────────────────────────────────────────
// The bottom-left status tray is intentionally gone — progress lives in the
// toolbar download popover (and the privoo://downloads page).
function onDownloadUpdate(dl) {
  activeDls.set(dl.id, dl);
  // Only the very first broadcast for a download carries initiatorId, which is
  // exactly when the leftover tab still exists.
  if (dl.initiatorId) closeDownloadOnlyTab(dl.initiatorId);
  if (dl.state === 'progressing') dlBadge.classList.add('show');
  else if ([...activeDls.values()].every(d => d.state !== 'progressing')) {
    dlBadge.classList.remove('show');
  }
  // A transfer in flight always brings the button back, even for someone who
  // has turned the permanent one off.
  if (dlBtn) dlBtn.hidden = false;
  const dlAnchor = document.getElementById('dl-anchor');
  if (dlAnchor) dlAnchor.hidden = false;
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

// Human sizes. Downloads report bytes; nobody reads bytes.
// A tab that exists only because a site opened it to serve a file. It has
// loaded nothing, it is showing nothing, and every other browser closes it.
//
// "Loaded nothing" is the whole test: everLoaded is set by did-stop-loading,
// so a tab the user is actually reading is never a candidate no matter what
// it downloads.
function closeDownloadOnlyTab(initiatorId) {
  if (!initiatorId) return;
  const tab = tabs.find((t) => {
    try { return t.wv?.getWebContentsId?.() === initiatorId; } catch { return false; }
  });
  if (!tab || tab.everLoaded) return;
  if (tabs.length <= 1) return;          // never leave the window with no tabs
  const url = String(tab.url || '');
  if (url && !/^about:blank$/i.test(url) && !url.startsWith('privoo://')) {
    // It navigated somewhere real before the download; leave it be.
    if (tab.everLoaded) return;
  }
  closeTab(tab.id);
}

function dlPopSize(n) {
  if (!n || n < 0) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
}

async function fillDlPopover() {
  if (!dlPopoverList) return;
  let items = [];
  try { items = await window.privoo.getDownloads(); } catch { /* ignore */ }
  const recent = (items || []).slice(0, 12);
  dlPopoverList.innerHTML = '';

  if (!recent.length) {
    const empty = document.createElement('div');
    empty.className = 'dl-pop-empty';
    empty.innerHTML =
      '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>' +
      '<b>Nothing downloaded yet</b>' +
      '<span>Files you download will show up here.</span>';
    dlPopoverList.appendChild(empty);
    return;
  }

  for (const d of recent) {
    const inProgress = d.state === 'progressing';
    const failed = d.state === 'cancelled' || d.state === 'interrupted' || d.state === 'failed';

    const row = document.createElement('div');
    row.className = 'dl-pop-row' + (inProgress ? ' is-progressing' : '') + (failed ? ' is-failed' : '');

    const t = dlPopFileType(d.filename);
    const icon = document.createElement('div');
    icon.className = 'dl-pop-icon';
    icon.style.background = DL_POP_COLORS[t] || DL_POP_COLORS.generic;
    icon.innerHTML = DL_POP_ICONS[t] || DL_POP_ICONS.generic;
    // Swap in the real OS file icon for any completed download - Windows
    // gives us the associated app icon (Word doc -> Word icon, .exe -> its
    // own artwork). The coloured category SVG stays as the fallback while
    // the download is still running or if extraction fails.
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
    main.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'dl-pop-meta';
    if (inProgress) {
      // "12.4 MB of 80 MB" says more than a bare percentage, and the bar
      // below already carries the percentage visually.
      const got = dlPopSize(d.receivedBytes);
      const tot = d.totalBytes > 0 ? dlPopSize(d.totalBytes) : '';
      meta.textContent = tot ? (got + ' of ' + tot) : (got || 'Downloading');
    } else if (failed) {
      meta.textContent = d.state === 'cancelled' ? 'Cancelled' : 'Failed';
    } else {
      meta.textContent = dlPopSize(d.totalBytes || d.receivedBytes) || 'Done';
    }
    main.appendChild(meta);

    if (inProgress) {
      const track = document.createElement('div');
      track.className = 'dl-pop-bar';
      const fill = document.createElement('div');
      fill.className = 'dl-pop-bar-fill';
      const pct = d.totalBytes > 0 ? (d.receivedBytes / d.totalBytes) * 100 : 0;
      // No known total (a chunked response) means no honest percentage, so
      // the bar loops rather than lying about progress.
      if (d.totalBytes > 0) fill.style.width = Math.max(2, Math.min(100, pct)) + '%';
      else track.classList.add('is-indeterminate');
      track.appendChild(fill);
      main.appendChild(track);
    }

    // Actions are icons, and only while the row is hovered. Two labelled
    // buttons on every row made a list of five downloads read as a list of
    // ten buttons.
    const actions = document.createElement('div');
    actions.className = 'dl-pop-actions';
    if (!inProgress && !failed) {
      const openB = document.createElement('button');
      openB.type = 'button';
      openB.className = 'dl-pop-action-btn';
      openB.title = 'Open';
      openB.setAttribute('aria-label', 'Open ' + (d.filename || 'file'));
      openB.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';
      openB.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (d.savePath) window.privoo.openDownload(d.savePath);
      });
      actions.appendChild(openB);

      const folderB = document.createElement('button');
      folderB.type = 'button';
      folderB.className = 'dl-pop-action-btn';
      folderB.title = 'Show in folder';
      folderB.setAttribute('aria-label', 'Show in folder');
      folderB.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>';
      folderB.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (d.savePath) window.privoo.showInFolder(d.savePath);
      });
      actions.appendChild(folderB);

      // The whole row opens the file; the icons cover the rarer case.
      row.addEventListener('click', () => {
        if (d.savePath) window.privoo.openDownload(d.savePath);
      });
      row.classList.add('is-openable');
    } else if (inProgress) {
      const cancelB = document.createElement('button');
      cancelB.type = 'button';
      cancelB.className = 'dl-pop-action-btn';
      cancelB.title = 'Cancel';
      cancelB.setAttribute('aria-label', 'Cancel download');
      cancelB.innerHTML = '<svg viewBox="0 0 14 14" width="11" height="11"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.7" fill="none"/></svg>';
      cancelB.addEventListener('click', (ev) => {
        ev.stopPropagation();
        try { window.privoo.cancelDownload(d.id); } catch { /* already gone */ }
      });
      actions.appendChild(cancelB);
    }

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
  ind.title = tab.isMuted ? 'Muted. Click to unmute' : 'Playing audio. Click to mute';
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
  // Sidebar music counts as "something is playing" even though it is not a tab.
  const anyPlaying = tabs.some(t => t.isPlayingAudio || t.isMuted)
    || (musicInToolbarEnabled() && !!sidebarMediaWv());
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

// The toolbar media dropdown can be driven by two different guests: a normal
// tab, or the sidebar music panel. The sidebar is not in `tabs`, so it used to
// be invisible to this whole subsystem and music playing there never appeared
// in the toolbar at all.
//
// Once the sidebar guest has been audible we keep treating it as a media
// source even while paused, otherwise the controls would disappear the moment
// you hit pause - which is exactly when you want them.
let _sidebarMediaSeen = false;
function sidebarMediaWv() {
  if (!sidebarWv) return null;
  try {
    const u = sidebarWv.getURL?.() || "";
    if (!u || u === "about:blank" || u.startsWith("privoo://")) return null;
    if (sidebarWv.isCurrentlyAudible?.()) _sidebarMediaSeen = true;
    return _sidebarMediaSeen ? sidebarWv : null;
  } catch { return null; }
}

// The guest the media popover should read from and control.
function mediaTarget() {
  const sb = musicInToolbarEnabled() ? sidebarMediaWv() : null;
  if (sb) return { wv: sb, tabEl: null, isSidebar: true };
  const t = activeTab();
  if (t && t.wv && t.ready) return { wv: t.wv, tabEl: t.tabEl, isSidebar: false };
  return null;
}

function musicInToolbarEnabled() { return settings?.musicInToolbar !== false; }

async function pollMediaInfo() {
  const target = mediaTarget();
  if (!target) { stopMediaPolling(); return; }
  const tab = target.isSidebar ? null : activeTab();
  try {
    const info = await target.wv.executeJavaScript(`(function(){
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
      const tabFavBg = tab?.tabEl?.querySelector('.favicon')?.style.backgroundImage;
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
      const tabUrl = target.wv.getURL();
      if (tabUrl && !tabUrl.startsWith('privoo://') && siteRow) {
        const host = new URL(tabUrl).hostname;
        const tabFavBg = tab?.tabEl?.querySelector('.favicon')?.style.backgroundImage;
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
  // Polling stops with the window; nothing reads the result while hidden.
  pollMediaInfo();
}

// Sidebar playback raises no tab-level events, so nothing would ever call
// updateAudioButton() for it. A slow poll keeps the toolbar button honest.
visibleInterval(() => { try { updateAudioButton(); } catch {} }, 1500);

function stopMediaPolling() {
  if (mediaPollingTimer) { clearInterval(mediaPollingTimer); mediaPollingTimer = null; }
}

// The 500ms media poll is the most expensive timer in the shell. Suspend it
// while the window is hidden and pick it up again on return.
let _mediaPollWasActive = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    _mediaPollWasActive = !!mediaPollingTimer;
    stopMediaPolling();
  } else if (_mediaPollWasActive) {
    _mediaPollWasActive = false;
    startMediaPolling();
  }
});

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
  // The background-music feature was removed. Stop and detach anything a
  // previously-saved musicPath might still be playing.
  if (!bgMusic) return;
  try { bgMusic.pause(); bgMusic.removeAttribute('src'); } catch { /* ignore */ }
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
  // The hero must not keep claiming "You're protected" once the user has
  // switched ad blocking off — that was the panel telling them the opposite of
  // what the setting says.
  const heroTitle = document.getElementById('sp-hero-title');
  const heroEl = heroTitle?.closest('.sp-hero');
  if (heroTitle) {
    heroTitle.textContent = settings.adBlocking ? "You're protected" : 'Ad blocking is off';
  }
  if (heroEl) heroEl.classList.toggle('sp-hero-off', !settings.adBlocking);
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

// Group the thousands so a big lifetime number still reads at a glance.
const fmtStat = (n) => {
  const v = Number(n) || 0;
  return v >= 1000 ? v.toLocaleString() : String(v);
};


async function refreshStats() {
  let s;
  try {
    s = await window.privoo.getPrivacyStats();
  } catch { return; }
  if (!s) return;
  // Painting is deliberately OUTSIDE the try that wraps the IPC call. It used
  // to be inside, so any single bad element reference aborted the whole repaint
  // and every counter stayed frozen at zero with no error surfaced.
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtStat(v); };
  set('stat-ads', s.blockedAds);
  // The toolbar shield is icon-only now, so shieldCount may legitimately be null.
  if (shieldCount) {
    const total = (s.blockedAds || 0) + (s.blockedCookies || 0);
    shieldCount.textContent = fmtStat(total);
  }
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
    detail.textContent = 'This page is part of Privoo and is served locally. No network connection is involved.';
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
  detail.textContent = 'This site is using an unencrypted HTTP connection. Anyone on your network can see what you send, so do not enter passwords or card details here.';
  } else {
    icon.className = 'si-icon';
    icon.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-11h2V7h-2v2z"/></svg>`;
    status.textContent = 'About this page';
    host.textContent   = hostname || '—';
    detail.textContent = 'No connection details available.';
  }

}

function closePopovers() {
  hideTabPreview();
  shieldPanel.classList.add('hidden');
  vpnPanel?.classList.add('hidden');
  menuEl.classList.add('hidden');
  hideSuggestions();
  dlPopover?.classList.add('hidden');
  ytdlpPopover?.classList.add('hidden');
  geoPopover?.classList.add('hidden');
  siteInfoPopover?.classList.add('hidden');
  pageShieldPopover?.classList.add('hidden');
  notesPopover?.classList.add('hidden');
  document.getElementById('calc-popover')?.classList.add('hidden');
  document.getElementById('translate-popover')?.classList.add('hidden');
  emojiPickerEl?.classList.add('hidden');
  if (audioPopover && !audioPopover.classList.contains('hidden')) {
    audioPopover.classList.add('hidden');
    stopMediaPolling();
  }
  document.getElementById('profile-panel')?.classList.add('hidden');
  closeWallpaperChooser();
  closeReactionBar();
  hideTabContextMenu();
  hideWvContextMenu();
  hideSidebarFlyout();
  closeSidebarCustomize();
  closeFilePickerPopover();
}

function hideWvContextMenu() {
  _closeCtxMenu(null);
}

// ─── DevTools ───────────────────────────────────────────────────────────────
let dockedDevToolsGuestId = 0;

function devToolsPaneEls() {
  return {
    pane: document.getElementById('devtools-pane'),
    view: document.getElementById('devtools-view'),
  };
}

function showDevToolsPane() {
  const { pane, view } = devToolsPaneEls();
  if (!pane || !view) return null;
  pane.hidden = false;
  if (!pane.style.width) pane.style.width = '460px';
  return view;
}

function hideDevToolsPane() {
  const { pane } = devToolsPaneEls();
  if (pane) pane.hidden = true;
  dockedDevToolsGuestId = 0;
}

function devToolsContentBounds() {
  const { view } = devToolsPaneEls();
  if (!view) return null;
  const r = view.getBoundingClientRect();
  return {
    x: r.left,
    y: r.top,
    width: r.width,
    height: r.height,
  };
}

function updateDockedDevToolsBounds() {
  if (!dockedDevToolsGuestId || !window.privoo?.updateDevToolsBounds) return;
  const bounds = devToolsContentBounds();
  if (bounds) window.privoo.updateDevToolsBounds(dockedDevToolsGuestId, bounds).catch?.(() => {});
}

function nextAnimationFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

/* ── Read aloud, over the browser itself ─────────────────────────────────
   Pages are handled by the guest preload. This is the other half: the tab
   strip, the toolbar, the menus. A browser that reads web pages aloud and
   then goes silent the moment you point at one of its own buttons has only
   done half the job, and the half it skipped is the one you need in order to
   reach the pages.

   Controls here are mostly icons, so the label matters more than the text.
   ─────────────────────────────────────────────────────────────────────── */
const RA_TARGETS = '.tab, .vtab, button, a, .menu-item, .sug-item, .bookmark, ' +
                   '[role="button"], [aria-label], [title]';
let _raOn = false, _raRate = 1, _raTimer = null, _raCurrent = null;

function raTextOf(el) {
  if (!el) return '';
  const label = el.getAttribute('aria-label') || el.getAttribute('title') || '';
  const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
  // The visible text first: a tab's label attribute is often the full URL
  // while its text is the page title, and the title is what you want read.
  const out = text || label.trim();
  return out.length > 300 ? out.slice(0, 300) + '\u2026' : out;
}

function raSay(el) {
  const text = raTextOf(el);
  if (!text) return;
  try { speechSynthesis.cancel(); } catch { return; }
  _raCurrent = el;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = _raRate;
  try { speechSynthesis.speak(u); } catch {}
}

function raOver(e) {
  clearTimeout(_raTimer);
  _raTimer = setTimeout(() => {
    // A <webview> is an element in THIS document, so pointing at a page also
    // raises mouseover here. The page has its own reader in the guest preload,
    // and without this the two would speak over each other.
    if (e.target?.closest?.('webview')) return;
    const el = e.target?.closest?.(RA_TARGETS);
    if (el && el !== _raCurrent) raSay(el);
  }, 260);
}

function applyReadAloud(settings) {
  const want = !!settings?.readAloud;
  _raRate = Math.max(0.5, Math.min(2, (Number(settings?.readAloudRate) || 100) / 100));
  if (want === _raOn) return;
  _raOn = want;
  if (want) {
    document.addEventListener('mouseover', raOver, true);
  } else {
    document.removeEventListener('mouseover', raOver, true);
    clearTimeout(_raTimer);
    _raCurrent = null;
    try { speechSynthesis.cancel(); } catch {}
  }
}

/* ── Night light ─────────────────────────────────────────────────────────
   A warm overlay across the whole window, chrome included. Doing this as a
   filter on each page would leave the toolbar and the tab strip cold, and a
   warm page in a blue-white frame is more jarring than no night light at
   all.

   It multiplies rather than tints. Multiply leaves black at black and pulls
   the blues down out of everything else, which is what warming a display
   means; a flat translucent orange laid over the top would wash the whole
   picture grey instead.
   ─────────────────────────────────────────────────────────────────────── */
const NIGHT_ALPHA = [0, 0.13, 0.26, 0.42];   // off, low, medium, high
let _nightTimer = null;

function nightLightWanted(s) {
  const level = Math.max(0, Math.min(3, Number(s && s.nightLight) || 0));
  if (!level) return 0;
  if (!(s && s.nightLightAuto)) return level;
  // A window that wraps past midnight (21 to 7) is the normal case, so this
  // has to handle from > to rather than assuming a simple range.
  const h = new Date().getHours();
  const from = Number(s.nightLightFrom) || 21, to = Number(s.nightLightTo) || 7;
  const on = from === to ? true : (from < to ? (h >= from && h < to) : (h >= from || h < to));
  return on ? level : 0;
}

function applyNightLight(settings) {
  const el = document.getElementById('night-light');
  if (!el) return;
  const level = nightLightWanted(settings);
  el.hidden = !level;
  el.style.opacity = level ? String(NIGHT_ALPHA[level]) : '0';

  // The schedule needs re-checking as the clock moves, but only while a
  // schedule is actually set. Otherwise this is a timer running all day for a
  // feature nobody turned on.
  clearInterval(_nightTimer); _nightTimer = null;
  if (settings && settings.nightLightAuto && Number(settings.nightLight) > 0) {
    _nightTimer = setInterval(() => applyNightLight(settings), 60000);
  }
}

/* ── Distance breaks ─────────────────────────────────────────────────────
   The honest version of "stop shortsightedness". Nothing a browser can do
   prevents myopia, and claiming otherwise would be a lie printed in a
   settings page. What is actually supported is breaking up long stretches at
   one fixed close distance by focusing far away, the 20-20-20 rule, and a
   browser is well placed to help, because it is the program that knows you
   have been reading for an hour.

   Rules it keeps: it never blocks the page, it never steals focus, and it
   does not fire at a window you are not looking at. A reminder that goes off
   at a browser you walked away from only teaches you to ignore it.
   ─────────────────────────────────────────────────────────────────────── */
let _eyeTimer = null, _eyeCount = null;

function eyeBreakDue() {
  const card = document.getElementById('eye-break');
  if (!card || !card.hidden) return;
  if (document.hidden) return;            // not in front of you, so not now

  card.hidden = false;
  card.classList.add('in');

  let left = 20;
  const num = document.getElementById('eb-count');
  const fill = card.querySelector('.eb-fill');
  if (num) num.textContent = String(left);
  if (fill) { fill.style.transition = 'none'; fill.style.strokeDashoffset = '0'; }
  // A frame between the reset and the animation, or the two get collapsed
  // into one style recalculation and the ring never moves.
  requestAnimationFrame(() => {
    if (fill) { fill.style.transition = 'stroke-dashoffset 20s linear'; fill.style.strokeDashoffset = '107'; }
  });

  clearInterval(_eyeCount);
  _eyeCount = setInterval(() => {
    left -= 1;
    if (num) num.textContent = String(Math.max(0, left));
    if (left <= 0) { clearInterval(_eyeCount); _eyeCount = null; dismissEyeBreak(); }
  }, 1000);
}

function dismissEyeBreak() {
  const card = document.getElementById('eye-break');
  if (!card) return;
  clearInterval(_eyeCount); _eyeCount = null;
  card.classList.remove('in');
  setTimeout(() => { card.hidden = true; }, 220);
}

function applyEyeBreaks(settings) {
  clearInterval(_eyeTimer); _eyeTimer = null;
  const mins = Math.max(0, Number(settings && settings.eyeBreakMinutes) || 0);
  if (!mins) { dismissEyeBreak(); return; }
  _eyeTimer = setInterval(eyeBreakDue, mins * 60000);
}

/* ── Vision assistance ───────────────────────────────────────────────────
   Half of this is body classes on Privoo's own chrome; the other half is a
   stylesheet pushed into every page, because enlarging the toolbar and
   leaving the page at 11px helps nobody. The page half rides the same
   insertCSS path as the custom cursor.
   ─────────────────────────────────────────────────────────────────────── */
let _guestVisionCss = '';
const _guestVisionKeys = new WeakMap();

function guestVisionCss(settings) {
  const parts = [];
  const min = Number(settings?.visionMinFontSize) || 0;
  if (min > 0) {
    // A floor, not a scale: text already larger than the floor is left
    // alone, so a page's own hierarchy survives. !important because the
    // pages that set 11px body text are exactly the ones that set it hard.
    parts.push(
      'html, body, p, li, td, th, span, a, div, label, input, button, select, textarea {'
      + ' font-size: max(' + min + 'px, 1em) !important;'
      + ' line-height: 1.5 !important; }'
    );
  }
  if (settings?.readAloud) {
    // Marks the block currently being spoken. The preload sets the attribute;
    // the appearance is decided here so a page's CSP cannot suppress it.
    parts.push(
      '[data-privoo-reading] { outline: 2px solid #6ea8ff !important;'
      + ' outline-offset: 2px !important;'
      + ' background: rgba(110,168,255,.14) !important;'
      + ' border-radius: 3px !important; }'
    );
  }
  if (settings?.visionUnderlineLinks) {
    // Colour alone is not a distinction you can rely on. Underlines are.
    parts.push('a[href] { text-decoration: underline !important; text-underline-offset: 2px !important; }');
  }
  return parts.join('\n');
}

async function applyGuestVision(wv) {
  if (!wv) return;
  const prev = _guestVisionKeys.get(wv);
  if (prev) {
    try { await wv.removeInsertedCSS(prev); } catch { /* page already gone */ }
    _guestVisionKeys.delete(wv);
  }
  if (!_guestVisionCss) return;
  try {
    const key = await wv.insertCSS(_guestVisionCss);
    _guestVisionKeys.set(wv, key);
  } catch { /* not loaded yet; dom-ready will do it */ }
}

function applyVisionSettings(settings) {
  const b = document.body;
  if (!b) return;

  b.classList.toggle('vision-contrast',  !!settings?.visionHighContrast);
  b.classList.toggle('vision-bold',      !!settings?.visionBoldText);
  b.classList.toggle('vision-focus',     !!settings?.visionFocusRings);
  b.classList.toggle('vision-still',     !!settings?.visionReduceMotion);

  // The interface scale is a root font-size multiplier rather than a zoom:
  // zooming the window would scale the PAGE too, which has its own control.
  const scale = Math.min(200, Math.max(100, Number(settings?.visionUiScale) || 100));
  document.documentElement.style.setProperty('--ui-scale', (scale / 100).toFixed(3));
  b.classList.toggle('vision-scaled', scale !== 100);

  _guestVisionCss = guestVisionCss(settings);
  for (const t of tabs) applyGuestVision(t.wv);
}

/* ── Pointer style ───────────────────────────────────────────────────────
   Applies to the chrome AND to the pages inside it. It used to be the chrome
   only, which meant that after choosing a cursor you saw it over the tab
   strip and the toolbar and then lost it the moment the pointer crossed onto
   a web page — i.e. everywhere you actually look. A cursor that only works
   over the furniture is not a working cursor.

   Pages get it by injected stylesheet, one per webview, removed and
   re-inserted when the setting changes so switching back really does give
   the page its own cursors again.
   ─────────────────────────────────────────────────────────────────────── */
const CURSOR_LARGE_URL = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M6 3l24 15-10 2 6 11-5 3-6-11-9 7z' fill='%23fff' stroke='%23000' stroke-width='2.2' stroke-linejoin='round'/%3E%3C/svg%3E\") 5 3, auto";
const CURSOR_PRECISE_URL = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 26 26'%3E%3Cg stroke='%23000' stroke-width='3'%3E%3Cpath d='M13 1v9M13 16v9M1 13h9M16 13h9'/%3E%3C/g%3E%3Cg stroke='%23fff' stroke-width='1.4'%3E%3Cpath d='M13 1v9M13 16v9M1 13h9M16 13h9'/%3E%3C/g%3E%3C/svg%3E\") 13 13, crosshair";

// The stylesheet currently pushed into guests, and the key insertCSS gave us
// for it per webview so it can be taken out again.
let _guestCursorCss = '';
const _guestCursorKeys = new WeakMap();

function guestCursorCss(style, url) {
  let value = '';
  if (style === 'large') value = CURSOR_LARGE_URL;
  else if (style === 'precise') value = CURSOR_PRECISE_URL;
  else if (style === 'custom' && url) value = 'url("' + url + '") 4 4, auto';
  if (!value) return '';
  // `* ` as well as html/body: a page that sets its own cursor on an element
  // would otherwise win over a rule on the root.
  return 'html, body, * { cursor: ' + value + ' !important; }';
}

async function applyGuestCursor(wv) {
  if (!wv) return;
  const prev = _guestCursorKeys.get(wv);
  if (prev) {
    try { await wv.removeInsertedCSS(prev); } catch { /* page already gone */ }
    _guestCursorKeys.delete(wv);
  }
  if (!_guestCursorCss) return;
  try {
    const key = await wv.insertCSS(_guestCursorCss);
    _guestCursorKeys.set(wv, key);
  } catch { /* not loaded yet; dom-ready will do it */ }
}

let _cursorUrlCache = null;
let _cursorPathCache = null;
function applyCursorStyle(settings) {
  const style = settings?.cursorStyle || 'system';
  const b = document.body;
  if (!b) return;
  b.classList.toggle('cursor-large',   style === 'large');
  b.classList.toggle('cursor-precise', style === 'precise');
  b.classList.toggle('cursor-custom',  style === 'custom');

  const finish = (url) => {
    _guestCursorCss = guestCursorCss(style, url);
    for (const t of tabs) applyGuestCursor(t.wv);
  };

  if (style !== 'custom') {
    document.documentElement.style.removeProperty('--privoo-cursor');
    _cursorUrlCache = null;
    _cursorPathCache = null;
    finish(null);
    return;
  }

  // Re-fetch when the FILE changes, not just when the style does. Keying the
  // cache on nothing meant picking a second image kept showing the first.
  const path = settings?.cursorImagePath || '';
  if (_cursorUrlCache && _cursorPathCache === path) { finish(_cursorUrlCache); return; }

  window.privoo.getCursorImageUrl?.().then((url) => {
    if (!url) { b.classList.remove('cursor-custom'); finish(null); return; }
    _cursorUrlCache = url;
    _cursorPathCache = path;
    document.documentElement.style.setProperty('--privoo-cursor', 'url("' + url + '") 4 4, auto');
    finish(url);
  }).catch(() => { b.classList.remove('cursor-custom'); finish(null); });
}

// Repeating work that only matters while the window is on screen. Minimised
// or hidden, the timer is stopped entirely rather than left running.
// Windows 11 and macOS can show the desktop through the chrome; nothing else
// can. Painting the translucent styles anywhere else just washes the UI out
// over an opaque window.
let _translucencyOk = true;
window.privoo.translucencySupported?.().then((ok) => {
  _translucencyOk = !!ok;
  if (!ok) {
    document.documentElement.classList.remove('semi-transparent-host');
    document.body.classList.remove('semi-transparent');
  }
}).catch(() => {});

function visibleInterval(fn, ms) {
  let id = null;
  const start = () => { if (id === null) id = setInterval(fn, ms); };
  const stop  = () => { if (id !== null) { clearInterval(id); id = null; } };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stop(); return; }
    try { fn(); } catch { /* keep the timer alive */ }
    start();
  });
  if (!document.hidden) start();
  return { stop };
}
function isPrivooInternalPage(url) {
  const u = String(url || '');
  return u.startsWith('privoo://') || u.startsWith('devtools://');
}

async function openDockedDevTools(tab, inspectX, inspectY) {
  if (!tab?.wv) return;
  // Privoo's own pages are part of the app, not content to inspect.
  try { if (isPrivooInternalPage(tab.wv.getURL())) return; } catch { return; }
  const hasCoords = Number.isFinite(inspectX) && Number.isFinite(inspectY);
  const guestId = tab.wv.getWebContentsId?.() || 0;
  try {
    if (guestId && window.privoo?.openDevTools) {
      showDevToolsPane();
      await nextAnimationFrame();
      const res = await window.privoo.openDevTools(guestId, {
        bounds: devToolsContentBounds(),
        ...(hasCoords ? { x: Math.round(inspectX), y: Math.round(inspectY) } : {}),
      });
      if (res?.closed || !res?.embedded) {
        hideDevToolsPane();
      } else {
        dockedDevToolsGuestId = guestId;
        requestAnimationFrame(updateDockedDevToolsBounds);
        updateDockedDevToolsBounds();
      }
      return;
    }

    showDevToolsPane();
    if (hasCoords && typeof tab.wv.inspectElement === 'function') {
      tab.wv.inspectElement(Math.round(inspectX), Math.round(inspectY));
      dockedDevToolsGuestId = guestId;
    } else if (tab.wv.isDevToolsOpened?.()) {
      tab.wv.closeDevTools();
      hideDevToolsPane();
    } else {
      tab.wv.openDevTools();
      dockedDevToolsGuestId = guestId;
    }
  } catch {
    hideDevToolsPane();
  }
}

async function closeDockedDevTools() {
  const guestId = dockedDevToolsGuestId || activeTab()?.wv?.getWebContentsId?.() || 0;
  hideDevToolsPane();
  try {
    if (guestId && window.privoo?.closeDevTools) {
      await window.privoo.closeDevTools(guestId);
      return;
    }
    const tab = activeTab();
    if (tab?.wv?.isDevToolsOpened?.()) tab.wv.closeDevTools();
  } catch {}
}

// ─── Standalone emoji picker (Chrome/Edge-style) ────────────────────────────
const emojiPickerEl    = document.getElementById('emoji-picker');
// Set while the picker is open on behalf of a caller that wants the glyph
// handed back (tab reactions) rather than typed into a page.
let emojiOnPick = null;
const emojiSearchInp   = document.getElementById('emoji-search');
const emojiCloseBtn    = document.getElementById('emoji-close');
const emojiCategoriesEl= document.getElementById('emoji-categories');
const emojiGridEl      = document.getElementById('emoji-grid');
const emojiPrevGlyphEl = document.getElementById('emoji-preview-glyph');
const emojiPrevNameEl  = document.getElementById('emoji-preview-name');

const EMOJI_RECENT_KEY = 'privoo:emoji-recent';
let emojiTargetWv = null;   // which webview to insert into
let emojiTargetInput = null; // or a chrome <input> (search popup / omnibox)
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
    empty.textContent = q ? `No emojis match "${q}"` : 'Nothing here yet. Pick an emoji to add it to Recent';
    emojiGridEl.replaceChildren(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  for (const [glyph, name] of entries) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'ep-cell';
    cell.title = name;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', name || glyph);
    cell.dataset.glyph = glyph;
    cell.dataset.name  = name || '';
    cell.textContent = glyph;
    frag.appendChild(cell);
  }
  emojiGridEl.replaceChildren(frag);
}

function updateEmojiPreview(glyph, name) {
  if (emojiPrevGlyphEl) {
    emojiPrevGlyphEl.textContent = glyph;
  }
  if (emojiPrevNameEl)  emojiPrevNameEl.textContent  = name || '';
}

function selectEmoji(glyph) {
  pushRecent(glyph);
  // A caller can ask for the glyph instead of having it typed somewhere —
  // that is how tab reactions reuse this picker rather than shipping a second
  // one. Picking closes it, because unlike inserting emoji into a message you
  // only ever want one.
  if (emojiOnPick) {
    const cb = emojiOnPick;
    closeEmojiPicker();
    try { cb(glyph); } catch { /* the caller's problem, not the picker's */ }
    return;
  }
  if (emojiTargetInput) {
    const input = emojiTargetInput;
    input.focus();
    const s = input.selectionStart ?? input.value.length;
    const en = input.selectionEnd ?? input.value.length;
    input.setRangeText(glyph, s, en, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const wv = emojiTargetWv || activeTab()?.wv;
    if (wv) insertEmojiInWebview(wv, glyph);
  }
  // Try clipboard too — useful if no focused input
  try { navigator.clipboard.writeText(glyph).catch(() => {}); } catch {}
  // Keep picker open — matches Chrome/Edge so users can insert several.
}

function openEmojiPicker(wv, inputEl, onPick) {
  if (!emojiPickerEl) return;
  closePopovers();
  emojiOnPick = typeof onPick === 'function' ? onPick : null;
  emojiTargetInput = emojiOnPick ? null : (inputEl || null);
  emojiTargetWv = (emojiOnPick || inputEl) ? null : (wv || activeTab()?.wv || null);
  // Snapshot the focused element in the webview BEFORE focus moves to the
  // picker UI — we re-focus it when an emoji is clicked so insertText works.
  if (emojiTargetWv) {
    emojiTargetWv.executeJavaScript(
      '(function(){var el=document.activeElement;if(el&&el!==document.body&&el!==document.documentElement)window.__privooEmojiTarget=el;})();'
    ).catch(() => {});
  }
  // Center the picker inside the actual content area, not the full viewport.
  // Sidebars (vtabs panel, app sidebar) shift the content area to the right,
  // so we offset by half the sidebar width to stay visually centered.
  const viewsEl = document.getElementById('views');
  if (viewsEl) {
    const r = viewsEl.getBoundingClientRect();
    const offset = Math.round(r.left + r.width / 2 - window.innerWidth / 2);
    emojiPickerEl.style.setProperty('--emoji-center-offset', `${offset}px`);
  } else {
    emojiPickerEl.style.removeProperty('--emoji-center-offset');
  }
  emojiPickerEl.classList.remove('hidden');
  // Always rebuild categories so they're never stale
  buildEmojiCategories();
  // Always start on smileys so users immediately see a full grid of emojis
  emojiActiveCat = 'smileys';
  if (emojiSearchInp) emojiSearchInp.value = '';
  renderEmojiGrid();
  setTimeout(() => emojiSearchInp?.focus(), 0);
}
function closeEmojiPicker() {
  emojiPickerEl?.classList.add('hidden');
  emojiTargetWv = null;
  emojiTargetInput = null;
  emojiOnPick = null;
}

emojiCloseBtn?.addEventListener('click', (e) => { e.stopPropagation(); closeEmojiPicker(); });
let _emojiSearchTimer = null;
emojiSearchInp?.addEventListener('input', () => {
  clearTimeout(_emojiSearchTimer);
  _emojiSearchTimer = setTimeout(renderEmojiGrid, 120);
});

// Delegated handlers — set up once, survive every grid re-render
emojiGridEl?.addEventListener('mouseover', (e) => {
  const cell = e.target.closest('.ep-cell');
  if (cell) updateEmojiPreview(cell.dataset.glyph, cell.dataset.name);
});
emojiGridEl?.addEventListener('focusin', (e) => {
  const cell = e.target.closest('.ep-cell');
  if (cell) updateEmojiPreview(cell.dataset.glyph, cell.dataset.name);
});
emojiGridEl?.addEventListener('click', (e) => {
  const cell = e.target.closest('.ep-cell');
  if (cell) selectEmoji(cell.dataset.glyph);
});
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
      var el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement)
        el = window.__privooEmojiTarget;
      if (!el) return;
      el.focus();

      // INPUT / TEXTAREA — direct value splice (always works, framework-safe)
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        var v = el.value || '';
        var a = el.selectionStart !== null ? el.selectionStart : v.length;
        var b = el.selectionEnd   !== null ? el.selectionEnd   : a;
        el.value = v.slice(0, a) + s + v.slice(b);
        el.selectionStart = el.selectionEnd = a + s.length;
        el.dispatchEvent(new Event('input',  {bubbles: true}));
        el.dispatchEvent(new Event('change', {bubbles: true}));
        return;
      }

      // contenteditable — try execCommand (still works in Chromium for
      // trusted user gestures), then fall back to Selection API
      var ok = false;
      try { ok = !!(document.execCommand && document.execCommand('insertText', false, s)); } catch(_) {}
      if (!ok) {
        var sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          var r = sel.getRangeAt(0);
          r.deleteContents();
          var tn = document.createTextNode(s);
          r.insertNode(tn);
          r.setStartAfter(tn); r.setEndAfter(tn);
          sel.removeAllRanges(); sel.addRange(r);
        }
      }
      el.dispatchEvent(new Event('input', {bubbles: true}));
    } catch(e) {}
  })();`;
  wv.executeJavaScript(js).catch(() => {});
}

// ─── Overlay banners (welcome on first site, "leaving Privoo" on rivals) ─
const overlayBannerEl = document.getElementById('overlay-banner');
const obTitleEl       = document.getElementById('ob-title');
const obTextEl        = document.getElementById('ob-text');
const obDismissBtn    = document.getElementById('ob-dismiss');

// Leaving-Privoo dismiss is per session only (in-memory). The user wants the
// nudge to keep appearing on rival browser sites until they navigate away,
// not be silenced forever after one dismissal.
const OB_LEAVING_DISMISSED = new Set();
// True while the Chrome Web Store notice is up for the current visit — reset
// when the user navigates away, so it shows again on the next visit.
let obWebStoreActive = false;
// Hosts that get a nudge before the user leaves for another browser.
// An entry without a slash matches the bare host and any subdomain.
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

  // Chrome Web Store — nothing to say here any more. The listing's own button
  // is relabelled "Add to Privoo" and installs directly (see the content
  // script in webview-preload.js), so a banner on top of it would just be
  // telling the user about a button they are already looking at.
  const isWebStore = bareHost === 'chromewebstore.google.com'
    || (bareHost === 'chrome.google.com' && pathLow.startsWith('/webstore'));
  if (isWebStore) {
    hideOverlayBanner();
    return;
  }

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
        'Before you go',
        'Privoo blocks ads, trackers and fingerprinting by default, and keeps your browsing on this device.',
        'Stay with Privoo',
        () => { OB_LEAVING_DISMISSED.add(host); },
      );
      return;
    }
  }

  hideOverlayBanner();
}

async function showWvContextMenu(tab, params, vx = 200, vy = 200) {
  closePopovers();
  const wv = tab.wv;
  const flags = params?.editFlags || {};
  const can = (k) => flags[k] !== false;

  // Privoo's own menu, drawn in the chrome. It paints over the guest because
  // a <webview> is an ordinary element in this document, and the click that
  // dismisses it is caught by .ctx-backdrop, which sits above the guest and
  // below the menu.
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
    // Remember which field was right-clicked, now, while the guest still has
    // focus. By the time a glyph is chosen the menu has been open for a while
    // and document.activeElement in the guest may have moved on; the insert
    // falls back to this. openEmojiPicker() does the same thing for the same
    // reason, so this is the proven form rather than a new guess.
    try {
      wv.executeJavaScript(
        '(function(){var el=document.activeElement;if(el&&el!==document.body&&el!==document.documentElement)window.__privooEmojiTarget=el;})();'
      ).catch(() => {});
    } catch { /* the tab went away */ }
    // Quick emoji across the top, the way Chrome does on a text field. This
    // does not replace the Windows panel on Win+period — but a shortcut you
    // may not know, that this menu has no way to mention, is not an answer to
    // right-clicking a text box.
    items.push({
      type: 'emoji',
      onPick: (glyph) => insertEmojiInWebview(wv, glyph),
      onMore: () => openEmojiPicker(wv, null, null),
    });
    sep();
    if (settings?.identityAutofillEnabled === true) {
      add('Autofill identity', () => requestIdentityAutofill(tab));
    }
    sep();
  }

  add('Back',    () => wv.goBack(),    { accel: 'Alt+Left',  disabled: !wv.canGoBack() });
  add('Forward', () => wv.goForward(), { accel: 'Alt+Right', disabled: !wv.canGoForward() });
  add('Reload',  () => wv.reload(),    { accel: 'CmdOrCtrl+R' });

  // Spelling first, above the edit commands — that is where Chrome puts it,
  // because when you right-click a red-underlined word the correction is the
  // only thing you wanted.
  const misspelled = params?.misspelledWord;
  const suggestions = (misspelled && params.dictionarySuggestions) || [];
  if (misspelled) {
    sep();
    if (suggestions.length) {
      suggestions.slice(0, 5).forEach((w) => add(w, () => wv.replaceMisspelling?.(w)));
    } else {
      add('No spelling suggestions', () => {}, { disabled: true });
    }
    sep();
    add('Add to dictionary', () => {
      try { window.privoo.addToDictionary(wv.getWebContentsId(), misspelled); } catch {}
    });
  }

  const hasEdit = can('canCut') || can('canCopy') || can('canPaste')
    || can('canSelectAll') || params?.selectionText || params?.isEditable;
  if (hasEdit) {
    sep();
    if (params?.isEditable) {
      add('Undo', () => wv.undo(), { accel: 'CmdOrCtrl+Z', disabled: !can('canUndo') });
      add('Redo', () => wv.redo(), { accel: 'CmdOrCtrl+Shift+Z', disabled: !can('canRedo') });
      sep();
    }
    if (can('canCut'))                            add('Cut',   () => wv.cut(),   { accel: 'CmdOrCtrl+X' });
    if (can('canCopy') || params?.selectionText)  add('Copy',  () => wv.copy(),  { accel: 'CmdOrCtrl+C' });
    if (can('canPaste') || params?.isEditable) {
      add('Paste', () => wv.paste(), { accel: 'CmdOrCtrl+V' });
      // Chrome's "Paste as plain text" — drops the formatting that comes with
      // anything copied out of a rich editor.
      add('Paste as plain text', () => wv.pasteAndMatchStyle(), { accel: 'CmdOrCtrl+Shift+V' });
    }
    if (can('canSelectAll'))                      add('Select all', () => wv.selectAll(), { accel: 'CmdOrCtrl+A' });
  }

  if (params?.selectionText) {
    const t = params.selectionText.slice(0, 40) + (params.selectionText.length > 40 ? '…' : '');
    sep();
    add(`Search the web for "${t}"`, () => createTab(searchUrl(params.selectionText)));
  }

  if (params?.linkURL) {
    sep();
    add('Open link in new tab',    () => createTab(params.linkURL));
    add('Open link in new window', () => { window.privoo.openWindow(params.linkURL).catch(() => createTab(params.linkURL)); });
    add('Save link as…',           () => { try { wv.downloadURL(params.linkURL); } catch {} });
    add('Copy link address',       () => navigator.clipboard.writeText(params.linkURL).catch(() => {}));
    if (params.linkText) {
      add('Copy link text', () => navigator.clipboard.writeText(params.linkText).catch(() => {}));
    }
  }
  if (params?.srcURL && params.mediaType === 'image') {
    sep();
    add('Open image in new tab', () => createTab(params.srcURL));
    add('Save image as…',        () => { try { wv.downloadURL(params.srcURL); } catch {} });
    // The bitmap, not the address — only the guest's own webContents can put
    // decoded pixels on the clipboard, so this goes through main.
    add('Copy image', () => {
      try { window.privoo.contextCopyImage(wv.getWebContentsId(), params.x, params.y); } catch {}
    });
    add('Copy image address',    () => navigator.clipboard.writeText(params.srcURL).catch(() => {}));
  }
  if (params?.srcURL && (params.mediaType === 'video' || params.mediaType === 'audio')) {
    const kind = params.mediaType === 'audio' ? 'audio' : 'video';
    sep();
    add('Open ' + kind + ' in new tab', () => createTab(params.srcURL));
    add('Save ' + kind + ' as…',        () => { try { wv.downloadURL(params.srcURL); } catch {} });
    add('Copy ' + kind + ' address',    () => navigator.clipboard.writeText(params.srcURL).catch(() => {}));
  }

  sep();
  add('Open in mobile view', () => openMobileView());
  add('Print…',           () => wv.print(),                                              { accel: 'CmdOrCtrl+P' });
  // Privoo's own pages are part of the app, so no source view or inspector.
  if (!isPrivooInternalPage(wv.getURL?.())) {
    add('View page source', () => { const u = wv.getURL(); if (u) createTab(`view-source:${u}`); });
    add('Inspect',          () => openDockedDevTools(tab, params?.x, params?.y),           { accel: 'F12' });
  }

  // Privoo's own menu, drawn in the chrome. A <webview> is an ordinary
  // element in this document, so a fixed layer at z-index 15000 paints over
  // it; and the click that DISMISSES the menu — the one the guest would
  // otherwise swallow — is caught by .ctx-backdrop, which showHtmlMenu()
  // raises at inset:0 above the guest and below the menu.
  //
  // vx/vy are the real cursor position in chrome coordinates, worked out by
  // the context-menu listener from getCursorPos() with the guest's own
  // compositor coordinates as a fallback.
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

const vpnDot = document.getElementById('vpn-dot');
function vpnIsConnected(s) {
  return s?.proxyMode === 'manual' && !!String(s?.proxyUrl || '').trim();
}
function vpnIsConfigured(s) {
  return !!(s?.vpnProxyHost && s?.vpnProxyPort);
}
function vpnShowView(name) {
  for (const id of ['vpn-intro', 'vpn-main', 'vpn-config', 'vpn-status']) {
    document.getElementById(id)?.classList.toggle('hidden', id !== name);
  }
}
function vpnRender(s) {
  const connected = vpnIsConnected(s);
  if (vpnDot) vpnDot.hidden = !connected;
  if (!s?.vpnTermsAccepted) {
    vpnShowView('vpn-intro');
    return;
  }
  if (connected) {
    vpnShowView('vpn-status');
    const addr = document.getElementById('vpn-status-addr');
    if (addr) addr.textContent = `${(s.vpnProxyType || 'http').toUpperCase()} · ${s.vpnProxyHost}:${s.vpnProxyPort}`;
    return;
  }
  vpnShowView('vpn-main');
  const statusText = document.getElementById('vpn-main-status');
  const connectBtn = document.getElementById('vpn-connect-btn');
  const configured = vpnIsConfigured(s);
  if (statusText) {
    statusText.textContent = configured
      ? `${(s.vpnProxyType || 'http').toUpperCase()} · ${s.vpnProxyHost}:${s.vpnProxyPort}`
      : 'No proxy configured yet.';
  }
  if (connectBtn) connectBtn.disabled = !configured;
}
function vpnFillConfigForm(s) {
  const typeSel = document.getElementById('vpn-type');
  const hostInp = document.getElementById('vpn-host');
  const portInp = document.getElementById('vpn-port');
  const userInp = document.getElementById('vpn-user');
  if (typeSel) typeSel.value = s?.vpnProxyType || 'http';
  if (hostInp) hostInp.value = s?.vpnProxyHost || '';
  if (portInp) portInp.value = s?.vpnProxyPort || '';
  if (userInp) userInp.value = s?.vpnProxyUsername || '';
  const errEl = document.getElementById('vpn-form-err');
  if (errEl) errEl.hidden = true;
}

vpnBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePopover(vpnPanel);
  if (!vpnPanel.classList.contains('hidden')) vpnRender(settings);
});

document.getElementById('vpn-terms-check')?.addEventListener('change', (e) => {
  const btn = document.getElementById('vpn-agree-btn');
  if (btn) btn.disabled = !e.target.checked;
});

document.getElementById('vpn-agree-btn')?.addEventListener('click', async () => {
  await saveBrowserSetting({ vpnTermsAccepted: true });
  vpnRender(settings);
});

document.getElementById('vpn-configure-btn')?.addEventListener('click', () => {
  vpnFillConfigForm(settings);
  vpnShowView('vpn-config');
});

document.getElementById('vpn-edit-btn')?.addEventListener('click', () => {
  vpnFillConfigForm(settings);
  vpnShowView('vpn-config');
});

document.getElementById('vpn-config-back')?.addEventListener('click', () => vpnRender(settings));

function vpnComposeProxyUrl(type, host, port) {
  return `${type}://${host}:${port}`;
}

document.getElementById('vpn-save-btn')?.addEventListener('click', async () => {
  const type = document.getElementById('vpn-type')?.value || 'http';
  const host = document.getElementById('vpn-host')?.value.trim() || '';
  const port = document.getElementById('vpn-port')?.value.trim() || '';
  const user = document.getElementById('vpn-user')?.value.trim() || '';
  const pass = document.getElementById('vpn-pass')?.value || '';
  const errEl = document.getElementById('vpn-form-err');
  const portNum = Number(port);
  if (!host || !/^\d{1,5}$/.test(port) || portNum < 1 || portNum > 65535) {
    if (errEl) { errEl.textContent = 'Enter a valid host and port (1-65535).'; errEl.hidden = false; }
    return;
  }
  if (errEl) errEl.hidden = true;
  const wasConnected = vpnIsConnected(settings);
  await saveBrowserSetting({
    ...(wasConnected ? { proxyMode: 'manual', proxyUrl: vpnComposeProxyUrl(type, host, port) } : {}),
    vpnProxyType: type,
    vpnProxyHost: host,
    vpnProxyPort: port,
    vpnProxyUsername: user,
    vpnProxyPassword: pass,
  });
  vpnRender(settings);
});

document.getElementById('vpn-connect-btn')?.addEventListener('click', async () => {
  if (!vpnIsConfigured(settings)) return;
  await saveBrowserSetting({
    proxyMode: 'manual',
    proxyUrl: vpnComposeProxyUrl(settings.vpnProxyType || 'http', settings.vpnProxyHost, settings.vpnProxyPort),
  });
  vpnRender(settings);
});

document.getElementById('vpn-disconnect-btn')?.addEventListener('click', async () => {
  await saveBrowserSetting({ proxyMode: 'none' });
  vpnRender(settings);
});

menuBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePopover(menuEl); });

// Toolbar extensions button — opens the manager page in a new tab
document.getElementById('extensions-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  createTab(EXTENSIONS_URL);
});

// ─── Customize side panel (right-side, opens from menu) ─────────────────────
const CP_ACCENTS = [
  { name: 'Mono',     value: '#ffffff' },  // default — adapts to light/dark
  { name: 'Blue',     value: '#4d8df6' },
  { name: 'Teal',     value: '#2dd4bf' },
  { name: 'Green',    value: '#4ade80' },
  { name: 'Amber',    value: '#fbbf24' },
  { name: 'Orange',   value: '#fb923c' },
  { name: 'Red',      value: '#f87171' },
  { name: 'Pink',     value: '#f472b6' },
  { name: 'Violet',   value: '#a78bfa' },
];
const cpPanel       = document.getElementById('customize-panel');
const cpCloseBtn    = document.getElementById('cp-close');
const cpAccentRow   = document.getElementById('cp-accent-row');
const cpShowHome    = document.getElementById('cp-show-home');
const cpShowBks     = document.getElementById('cp-show-bookmarks');
const cpSidebarMode = document.getElementById('cp-sidebar-mode');
const cpShowNotes      = document.getElementById('cp-show-notes');
const cpRandomWp       = document.getElementById('cp-random-wp');
const cpVerticalTabs   = document.getElementById('cp-vertical-tabs');
// cpShowGreet removed — greeting feature deleted

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
    // Mono is white in dark mode and near-black in light mode, so a flat
    // swatch of its stored value would vanish against one of the two. It
    // gets a split black/white chip instead, which reads in both.
    if (a.value.toLowerCase() === MONO_ACCENT) sw.classList.add('is-mono');
    sw.title = a.name;
    sw.setAttribute('aria-label', `${a.name} accent`);
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

// The signature indigo is the default accent — not manually pickable — but
// selecting a colourful Theme (Settings/Customize → New tab background →
// Theme) retunes it to that theme's own colour, so the browser actually
// feels themed rather than always defaulting back to indigo. Chrome
// surfaces (titlebar/toolbar/omnibox) stay neutral regardless — only
// buttons, focus rings, links and the active-tab underline use the accent.
// Ships as the settings-store default too — turning a theme off falls back
// here when no pre-theme accent was stashed.
const DEFAULT_ACCENT = '#ffffff';

// The monochrome accent is a *role*, not a colour: it always resolves to the
// opposite of the surface it sits on — white on the black chrome, near-black
// on the light one. Storing it as plain #ffffff keeps the settings file
// readable and keeps every other accent path (swatches, extensions, themes)
// working unchanged; only this one value is re-read per mode.
const MONO_ACCENT = '#ffffff';
const MONO_ACCENT_LIGHT = '#101014';   // what "mono" means when the UI is light

function applyAccentTriad(themeHex) {
  const isDark = document.body.classList.contains('dark');
  const fallback = isDark ? MONO_ACCENT : MONO_ACCENT_LIGHT;
  let hex = (themeHex && /^#[0-9a-f]{6}$/i.test(themeHex)) ? themeHex : fallback;
  if (hex.toLowerCase() === MONO_ACCENT && !isDark) hex = MONO_ACCENT_LIGHT;
  document.documentElement.style.setProperty('--accent', hex);
  const { r, g, b } = hexToRgb(hex);
  // Hover normally brightens. A white accent has no headroom to brighten
  // into, so above ~72% luminance we darken instead — otherwise hovering the
  // primary button did visibly nothing.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const mix = lum > 0.72 ? 0 : 255;   // pull toward black when already bright
  const k = lum > 0.72 ? 0.12 : 0.18;
  const hover = rgbToHex(
    Math.round(r + (mix - r) * k),
    Math.round(g + (mix - g) * k),
    Math.round(b + (mix - b) * k),
  );
  document.documentElement.style.setProperty('--accent-hover', hover);
  // Text/icons drawn ON the accent follow its luminance, so a light accent
  // never gets light text on it (which is what made a white accent unusable).
  document.documentElement.style.setProperty('--on-accent', lum > 0.6 ? '#1b1b1e' : '#ffffff');
  // The soft wash sits on the chrome, not on the accent, so it needs more
  // presence on black than the .18 that read fine over a light surface.
  document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},${isDark ? '.16' : '.13'})`);
  document.documentElement.style.removeProperty('--strip');
  document.documentElement.style.removeProperty('--toolbar');
  document.documentElement.style.removeProperty('--omni-bg');
  // Repaint Privoo-page favicons in the fixed accent.
  if (_pvAccent !== hex) { _pvAccent = hex; if (typeof refreshPrivooFavicons === 'function') refreshPrivooFavicons(); }
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
  if (cpSidebarMode) {
    const mode = settings?.sidebarMode || (settings?.showSidebar === false ? 'off' : 'on');
    cpSidebarMode.querySelectorAll('.cp-seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  }
  if (cpVerticalTabs)   cpVerticalTabs.checked   = !!settings?.verticalTabs;
  if (cpShowNotes)      cpShowNotes.checked      = !!settings?.showNotesButton;
  if (cpRandomWp)       cpRandomWp.checked       = !!settings?.ntpRandomWallpaper;
  paintWpPreview();
  paintWpChooser();
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
cpSidebarMode?.querySelectorAll('.cp-seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    cpSidebarMode.querySelectorAll('.cp-seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
    saveBrowserSetting({ sidebarMode: mode, showSidebar: mode !== 'off' });
  });
});
cpVerticalTabs?.addEventListener('change', async () => {
  const on = cpVerticalTabs.checked;
  const patch = { verticalTabs: on };
  const curMode = settings?.sidebarMode || (settings?.showSidebar === false ? 'off' : 'on');
  if (on && curMode !== 'off') {
    patch.sidebarMode = 'off';
    patch.showSidebar = false;
    cpSidebarMode?.querySelectorAll('.cp-seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'off'));
  }
  await saveBrowserSetting(patch);
});
cpShowNotes?.addEventListener('change',   () => saveBrowserSetting({ showNotesButton:   cpShowNotes.checked }));
cpRandomWp?.addEventListener('change',    () => saveBrowserSetting({ ntpRandomWallpaper: cpRandomWp.checked }));

/* ── Wallpaper chooser ───────────────────────────────────────────────────
   "Choose a wallpaper" used to drop you straight into Settings. But there
   are three different answers to it — a picture, a video, or let Privoo pick
   one — and choosing between them IS the decision. A file dialog cannot ask
   that question, so this sheet asks it first and then opens the right one.
   ─────────────────────────────────────────────────────────────────────── */
const wpChooser = document.getElementById('wp-chooser');

function openWallpaperChooser() {
  if (!wpChooser) return;
  paintWpChooser();
  wpChooser.classList.remove('hidden');
  // Focus the first option so the sheet is usable from the keyboard the
  // moment it appears.
  wpChooser.querySelector('.wp-opt')?.focus();
}
function closeWallpaperChooser() {
  wpChooser?.classList.add('hidden');
}
function paintWpChooser() {
  const st = document.getElementById('wp-opt-random-state');
  if (st) {
    const on = !!settings?.ntpRandomWallpaper && !settings?.ntpWallpaperPath;
    st.textContent = on ? 'On' : '';
    st.hidden = !on;
  }
}

document.getElementById('cp-wp-choose')?.addEventListener('click', (e) => {
  e.stopPropagation();
  openWallpaperChooser();
});
document.getElementById('wp-chooser-backdrop')?.addEventListener('click', closeWallpaperChooser);

document.getElementById('wp-opt-image')?.addEventListener('click', async () => {
  closeWallpaperChooser();
  try { await window.privoo.chooseNtpWallpaper?.(); } catch { /* cancelled */ }
});
document.getElementById('wp-opt-live')?.addEventListener('click', async () => {
  closeWallpaperChooser();
  try { await window.privoo.chooseNtpLiveWallpaper?.(); } catch { /* cancelled */ }
});
document.getElementById('wp-opt-random')?.addEventListener('click', async () => {
  closeWallpaperChooser();
  // Random photos and a file of your own are mutually exclusive, and the file
  // wins wherever both are set — so turning random on clears the file rather
  // than leaving a setting switched on that visibly does nothing.
  try { await window.privoo.clearNtpWallpaper?.(); } catch { /* ignore */ }
  await saveBrowserSetting({ ntpRandomWallpaper: true });
});
document.getElementById('wp-opt-none')?.addEventListener('click', async () => {
  closeWallpaperChooser();
  try { await window.privoo.clearNtpWallpaper?.(); } catch { /* ignore */ }
  await saveBrowserSetting({ ntpRandomWallpaper: false });
});
document.getElementById('wp-opt-library')?.addEventListener('click', () => {
  closeWallpaperChooser();
  closeCustomizePanel();
  createTab(SETTINGS_URL + '#wallpaper-card');
});

/* A thumbnail of the actual background, so the panel shows what it is
   talking about. The chrome bars drawn over it are three grey lines — enough
   to read as "a browser window", cheap enough to be pure CSS. */
async function paintWpPreview() {
  const art = document.getElementById('cp-wp-preview-art');
  const label = document.getElementById('cp-wp-preview-label');
  if (!art || !label) return;

  const path = settings?.ntpWallpaperPath;
  const isVideo = settings?.ntpWallpaperType === 'video';

  if (path) {
    // The chrome renderer runs from file://, so it needs a URL it can
    // actually load rather than the raw path.
    let url = '';
    try { url = await window.privoo.getNtpWallpaperUrl?.() || ''; } catch { /* ignore */ }
    art.style.backgroundImage = url && !isVideo ? `url("${url.replace(/"/g, '%22')}")` : '';
    art.classList.toggle('is-video', isVideo);
    label.textContent = isVideo ? 'Your video' : 'Your image';
  } else if (settings?.ntpRandomWallpaper) {
    art.style.backgroundImage = '';
    art.classList.remove('is-video');
    label.textContent = 'Random photos';
  } else {
    art.style.backgroundImage = '';
    art.classList.remove('is-video');
    label.textContent = 'No wallpaper';
  }
  art.classList.toggle('is-empty', !path);
  art.classList.toggle('is-random', !path && !!settings?.ntpRandomWallpaper);
}


// ── Theme gallery + colour picker ──────────────────────────────────────────
(function initThemePopup() {
  const popup    = document.getElementById('wave-popup');
  const preview  = document.getElementById('wave-preview');
  const backdrop = document.getElementById('wave-backdrop');
  const gridEl   = document.getElementById('theme-grid');
  const pad      = document.getElementById('theme-pad');
  const padThumb = document.getElementById('theme-pad-thumb');
  const hueEl    = document.getElementById('theme-hue');
  const dotsEl   = document.getElementById('theme-dots');
  const hexEl    = document.getElementById('theme-hex');
  const animChk  = document.getElementById('wave-animate');
  const custToggle = document.getElementById('theme-cust-toggle');
  const custPanel  = document.getElementById('theme-cust');
  const stylesEl   = document.getElementById('theme-styles');
  const soundRow   = document.getElementById('theme-sound');
  const soundBtn   = document.getElementById('theme-sound-toggle');
  const soundNameEl= document.getElementById('theme-sound-name');
  const volEl    = document.getElementById('theme-vol');
  const applyBtn = document.getElementById('wave-apply');
  const offBtn   = document.getElementById('wave-off');
  const closeBtn = document.getElementById('wave-close');
  const openBtn  = document.getElementById('cp-wp-wave');
  if (!popup || !openBtn || !pad || !hueEl || !dotsEl || !gridEl) return;

  const SOUND_NAMES = {
    none: 'No sound',
    drift: 'Aurora drift',
    pulse: 'Neon pulse',
    warm: 'Warm glow',
    solar: 'Solar rise',
    rain: 'Soft rain',
    mist: 'Quiet mist',
    waves: 'Ocean waves',
    deep: 'Deep space',
    bloom: 'Orchid bloom',
    noir: 'Noir keys',
    chime: 'Crystal',
  };

  // ── colour maths ──
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function hexToRgb(hex) {
    let x = String(hex || '').replace('#', '');
    if (x.length === 3) x = x.split('').map(c => c + c).join('');
    const n = parseInt(x, 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (r, g, b) => '#' + [r, g, b].map(x => clamp(Math.round(x), 0, 255).toString(16).padStart(2, '0')).join('');
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hh = 0;
    if (d) { if (mx === r) hh = ((g - b) / d) % 6; else if (mx === g) hh = (b - r) / d + 2; else hh = (r - g) / d + 4; hh *= 60; if (hh < 0) hh += 360; }
    return [hh, mx ? d / mx : 0, mx];
  }
  function hsvToRgb(hh, s, v) {
    const c = v * s, x = c * (1 - Math.abs((hh / 60) % 2 - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (hh < 60) { r = c; g = x; } else if (hh < 120) { r = x; g = c; } else if (hh < 180) { g = c; b = x; }
    else if (hh < 240) { g = x; b = c; } else if (hh < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  const hexToHsv = (hex) => rgbToHsv(...hexToRgb(hex));
  const hsvToHex = (hh, s, v) => rgbToHex(...hsvToRgb(hh, s, v));
  function normHex(str) {
    str = String(str || '').trim(); if (str[0] !== '#') str = '#' + str;
    if (/^#[0-9a-f]{3}$/i.test(str)) str = '#' + str.slice(1).split('').map(c => c + c).join('');
    return /^#[0-9a-f]{6}$/i.test(str) ? str.toLowerCase() : null;
  }
  function sameColors(a, b) { return Array.isArray(b) && b.length >= 4 && b.every((c, i) => String(a[i] || '').toLowerCase() === String(c).toLowerCase()); }

  // ── state ──
  let colors = WAVE_DEFAULT.slice();
  let style = 'aurora', soundId = 'none', soundOn = false, vol = 0.4;
  let sel = 0, h = 265, s = 1, v = 1;

  function setPreviewClass() {
    const matched = THEME_LIST.find(t => sameColors(colors, t.colors) && style === t.style);
    if (matched) {
      preview.className = 'wave-hero';
      preview.style.background = "linear-gradient(135deg, " + colors.join(',') + ")";
    } else {
      preview.style.background = '';
      preview.className = 'wave-hero wave-bg ts-' + style + ((animChk && !animChk.checked) ? ' wave-static' : '');
      colors.forEach((c, i) => preview.style.setProperty('--wave-' + (i + 1), c));
    }
  }
  function updateGridActive() {
    gridEl.querySelectorAll('.theme-tile').forEach(t => {
      const th = THEME_LIST.find(x => x.id === t.dataset.id);
      t.classList.toggle('active', !!th && sameColors(colors, th.colors) && style === th.style);
    });
  }
  function paintPreview() {
    setPreviewClass();
    dotsEl.querySelectorAll('.theme-dot').forEach((d, i) => { d.style.background = colors[i]; d.classList.toggle('active', i === sel); });
    stylesEl?.querySelectorAll('.theme-style-chip').forEach(c => c.classList.toggle('active', c.dataset.style === style));
    updateGridActive();
  }
  function placeThumb() {
    padThumb.style.left = (s * 100) + '%';
    padThumb.style.top = ((1 - v) * 100) + '%';
    padThumb.style.background = colors[sel];
  }
  function setHueBg() { pad.style.setProperty('--theme-hue', String(Math.round(h))); }
  function commit() { colors[sel] = hsvToHex(h, s, v); if (hexEl) hexEl.value = colors[sel].toUpperCase(); setHueBg(); placeThumb(); paintPreview(); }
  function loadSel() {
    [h, s, v] = hexToHsv(colors[sel]);
    if (hueEl) hueEl.value = String(Math.round(h));
    if (hexEl) hexEl.value = colors[sel].toUpperCase();
    setHueBg(); placeThumb(); paintPreview();
  }

  function updateSoundUI() {
    const on = soundOn && soundId !== 'none';
    if (soundNameEl) soundNameEl.textContent = on ? (SOUND_NAMES[soundId] || 'Sound') : 'No sound';
    soundRow?.classList.toggle('muted', !on);
  }
  function previewSound() { if (soundOn && soundId !== 'none') ThemeAudio.start(soundId, vol); else ThemeAudio.stop(); }

  function selectTheme(t) {
    colors = t.colors.slice();
    style = t.style || 'aurora';
    soundId = t.sound || 'none';
    soundOn = soundId !== 'none';
    sel = 0;
    if (volEl) volEl.value = String(Math.round(vol * 100));
    updateSoundUI(); previewSound();
    loadSel();
    applyCurrent();   // apply live so clicking a theme actually changes the browser
  }

  // Save the current selection to the browser. Called on every change so the
  // popup is fully WYSIWYG; closeAfter=true also dismisses the popup.
  function applyCurrent(closeAfter) {
    let best = colors[0], bs = -1, maxSat = 0;
    for (const c of colors) { const hsv = hexToHsv(c); const sc = hsv[1] * hsv[2]; if (sc > bs) { bs = sc; best = c; } if (hsv[1] > maxSat) maxSat = hsv[1]; }
    const vibeHue = Math.round(hexToHsv(best)[0]);
    const matched = THEME_LIST.find(t => sameColors(colors, t.colors) && style === t.style);
    saveBrowserSetting({
      ntpWaveEnabled: true,
      ntpWaveColors: colors.slice(),
      ntpThemeStyle: style,
      ntpThemeId: matched ? matched.id : '',
      ntpWaveAnimate: animChk ? animChk.checked : true,
      // Picking a theme retunes the whole UI: the accent follows the theme's
      // most saturated colour. Greyscale themes keep the existing accent so
      // the UI never ends up with an unusable grey accent. The accent in use
      // before the first theme is stashed so turning the theme off restores it.
      ...(maxSat >= 0.12
        ? {
          accentColor: best,
          ...(settings?.accentBeforeTheme
            ? {}
            : { accentBeforeTheme: settings?.accentColor || DEFAULT_ACCENT }),
        }
        : {}),
      // Greyscale palettes (Mono) leave Vibe off so the chrome stays neutral grey
      // instead of picking up the saturated hue glow.
      vibeEnabled: maxSat >= 0.12,
      vibeHue,
      ntpThemeMusic: soundOn ? soundId : 'none',
      ntpThemeMusicVolume: vol,
    });
    if (closeAfter) popup.classList.add('hidden');
  }

  function buildGrid() {
    if (gridEl.childElementCount) return;
    THEME_LIST.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      // Cover = the theme's own palette. It used to be a rendered PNG per
      // theme with this gradient as the fallback behind it.
      b.className = 'theme-tile';
      b.dataset.id = t.id; b.title = t.name;
      b.style.background = "linear-gradient(135deg, " + t.colors.join(',') + ")";
      b.innerHTML = '<span class="tt-name"></span>';
      b.querySelector('.tt-name').textContent = t.name;
      b.addEventListener('click', () => selectTheme(t));
      gridEl.appendChild(b);
    });
  }

  // pad drag
  function padFromEvent(e) {
    const r = pad.getBoundingClientRect();
    s = clamp((e.clientX - r.left) / r.width, 0, 1);
    v = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    commit();
  }
  let padDrag = false;
  pad.addEventListener('pointerdown', (e) => { padDrag = true; pad.setPointerCapture(e.pointerId); padFromEvent(e); });
  pad.addEventListener('pointermove', (e) => { if (padDrag) padFromEvent(e); });
  pad.addEventListener('pointerup', () => { if (padDrag) { padDrag = false; applyCurrent(); } });
  pad.addEventListener('pointercancel', () => { padDrag = false; });
  hueEl.addEventListener('input', () => { h = +hueEl.value; commit(); });
  hueEl.addEventListener('change', () => applyCurrent());
  hexEl?.addEventListener('change', () => { const n = normHex(hexEl.value); if (n) { colors[sel] = n; loadSel(); applyCurrent(); } else { hexEl.value = colors[sel].toUpperCase(); } });
  dotsEl.querySelectorAll('.theme-dot').forEach(d => d.addEventListener('click', () => { sel = +d.dataset.i; loadSel(); }));
  animChk?.addEventListener('change', () => { setPreviewClass(); applyCurrent(); });
  soundBtn?.addEventListener('click', () => { if (soundId === 'none') soundId = 'drift'; soundOn = !soundOn; updateSoundUI(); previewSound(); applyCurrent(); });
  volEl?.addEventListener('input', () => { vol = (+volEl.value) / 100; if (soundOn && soundId !== 'none') ThemeAudio.start(soundId, vol); });
  volEl?.addEventListener('change', () => applyCurrent());
  custToggle?.addEventListener('click', () => {
    const opening = custPanel.hasAttribute('hidden');
    if (opening) custPanel.removeAttribute('hidden'); else custPanel.setAttribute('hidden', '');
    custToggle.setAttribute('aria-expanded', String(opening));
  });
  stylesEl?.querySelectorAll('.theme-style-chip').forEach(c => c.addEventListener('click', () => {
    style = c.dataset.style; paintPreview(); applyCurrent();
  }));

  function open() {
    buildGrid();
    const c = (Array.isArray(settings?.ntpWaveColors) && settings.ntpWaveColors.length) ? settings.ntpWaveColors : WAVE_DEFAULT;
    colors = [0, 1, 2, 3].map(i => normHex(c[i]) || WAVE_DEFAULT[i]);
    style = settings?.ntpThemeStyle || 'aurora';
    soundId = (settings?.ntpThemeMusic && settings.ntpThemeMusic !== 'none') ? settings.ntpThemeMusic
      : ((THEME_LIST.find(t => t.id === settings?.ntpThemeId) || {}).sound || 'drift');
    soundOn = !!settings?.ntpThemeMusic && settings.ntpThemeMusic !== 'none';
    vol = typeof settings?.ntpThemeMusicVolume === 'number' ? settings.ntpThemeMusicVolume : 0.4;
    sel = 0;
    if (animChk) animChk.checked = settings?.ntpWaveAnimate !== false;
    if (volEl) volEl.value = String(Math.round(vol * 100));
    updateSoundUI();
    loadSel();
    popup.classList.remove('hidden');
  }
  function close() { popup.classList.add('hidden'); }

  openBtn.addEventListener('click', open);
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !popup.classList.contains('hidden')) close(); });
  applyBtn?.addEventListener('click', () => applyCurrent(true));   // "Use theme" = apply + close
  offBtn?.addEventListener('click', () => {
    ThemeAudio.stop();
    saveBrowserSetting({
      ntpWaveEnabled: false, vibeEnabled: false, ntpThemeMusic: 'none', ntpThemeId: '',
      accentColor: settings?.accentBeforeTheme || DEFAULT_ACCENT,
      accentBeforeTheme: '',
    });
    popup.classList.add('hidden');
  });
})();

// Link rows inside panel — Settings / Extensions
cpPanel?.querySelectorAll('[data-action]').forEach(el => {
  el.addEventListener('click', () => {
    const a = el.dataset.action;
    if (a === 'settings')   { createTab(SETTINGS_URL);   closeCustomizePanel(); }
    if (a === 'extensions') { createTab(EXTENSIONS_URL); closeCustomizePanel(); }
  });
});

// Apply the theme-driven accent on startup, if a Theme is active.
if (settings?.ntpWaveEnabled && settings?.accentColor) applyAccentColor(settings.accentColor);

// Populate the version chip in the main menu from package.json so the text
// never drifts out of sync with the actual build. Also: show Privoo News once
// after an update — when the running version differs from the last version we
// showed news for. Fresh installs (no stored version) are handled by the setup
// wizard instead, so we only record the version there without opening a tab.
window.privoo?.getAppVersion?.().then((v) => {
  const el = document.getElementById('menu-ver');
  if (el && v) el.textContent = 'Privoo v' + v;
  if (!v) return;
  try {
    // Nothing opens by itself after an update any more. Release notes live
    // on GitHub, and a tab appearing unasked to tell you the browser changed
    // is the thing people close without reading.
  } catch {}
}).catch(() => {});

siteIcon?.addEventListener('click', (e) => {
  e.stopPropagation();
  togglePopover(siteInfoPopover);
});

// Blocking carries on for as long as the page keeps making requests, so a
// count read once at open goes stale immediately — poll while it's on screen.
let _psPollTimer = 0;
function stopShieldPolling() { clearInterval(_psPollTimer); _psPollTimer = 0; }
function startShieldPolling() {
  stopShieldPolling();
  _psPollTimer = setInterval(() => {
    if (!pageShieldPopover || pageShieldPopover.classList.contains('hidden')) {
      stopShieldPolling();
      return;
    }
    refreshPageShield();
  }, 900);
}

pageShieldBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  refreshPageShield();
  togglePopover(pageShieldPopover);
  if (pageShieldPopover && !pageShieldPopover.classList.contains('hidden')) startShieldPolling();
  else stopShieldPolling();
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

// ── Sidebar now-playing flyout ───────────────────────────────────────────────
let _sbNp = null, _sbNpHide = 0, _sbNpPoll = 0;
function hideSidebarNowPlaying(force) {
  clearTimeout(_sbNpHide);
  const drop = () => {
    clearInterval(_sbNpPoll); _sbNpPoll = 0;
    _sbNp?.remove(); _sbNp = null;
  };
  if (force) { drop(); return; }
  // grace period so the cursor can travel from the icon into the pill
  _sbNpHide = setTimeout(() => { if (_sbNp && !_sbNp.matches(':hover')) drop(); }, 250);
}
const NP_META_JS = `(function(){try{
  var m = navigator.mediaSession && navigator.mediaSession.metadata;
  var els = Array.prototype.slice.call(document.querySelectorAll('video,audio'));
  var a = els.filter(function(x){ return !x.paused; })[0] || els[0];
  var art = '';
  if (m && m.artwork && m.artwork.length) art = m.artwork[m.artwork.length - 1].src || '';
  return JSON.stringify({
    title: (m && m.title) || '',
    artist: (m && m.artist) || '',
    art: art,
    paused: a ? !!a.paused : true,
    live: !!(m || a)
  });
} catch (e) { return null; } })()`;

const NP_ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h3.4v14H7zm6.6 0H17v14h-3.4z"/></svg>';
const NP_ICON_PLAY  = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const NP_ICON_PREV  = '<svg viewBox="0 0 24 24"><path d="M7 6h2.2v12H7zm11 0v12l-8.2-6z"/></svg>';
const NP_ICON_NEXT  = '<svg viewBox="0 0 24 24"><path d="M14.8 6H17v12h-2.2zM6 6l8.2 6L6 18z"/></svg>';

function npClickJs(selectors) {
  return `(function(){try{
    var sels = ${JSON.stringify(selectors)};
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) { el.click(); return true; }
    }
  } catch (e) {} return false; })()`;
}
const NP_NEXT_JS = npClickJs([
  '[data-testid="control-button-skip-forward"]',
  'button[aria-label*="Next" i]',
  '.ytmusic-player-bar .next-button',
  '.skipControl__next',
]);
const NP_PREV_JS = npClickJs([
  '[data-testid="control-button-skip-back"]',
  'button[aria-label*="Previous" i]',
  '.ytmusic-player-bar .previous-button',
  '.skipControl__previous',
]);
const NP_TOGGLE_JS = `(function(){try{
  var els = Array.prototype.slice.call(document.querySelectorAll('video,audio'));
  var a = els.filter(function(x){ return !x.paused; })[0] || els[0];
  if (a) { if (a.paused) { a.play(); return 'playing'; } a.pause(); return 'paused'; }
  var sels = ['[data-testid="control-button-playpause"]', 'button[aria-label*="Play" i]', 'button[aria-label*="Pause" i]'];
  for (var i = 0; i < sels.length; i++) { var el = document.querySelector(sels[i]); if (el) { el.click(); return 'toggled'; } }
} catch (e) {} return null; })()`;

// The player can live in the sidebar panel (kept alive while you browse) or
// in a normal tab — hover reads whichever of the two is on that host.
function findMediaGuest(host) {
  try {
    const u = sidebarWv?.getURL?.();
    if (u && new URL(u).hostname.includes(host)) return sidebarWv;
  } catch { /* ignore */ }
  const tab = tabs.find((t) => {
    if (!t.wv) return false;
    try { return new URL(t.wv.getURL()).hostname.includes(host); } catch { return false; }
  });
  return tab?.wv || null;
}

async function showSidebarNowPlaying(btn, link) {
  // With the toolbar dropdown enabled, now-playing lives there instead. Two
  // competing surfaces for the same information is worse than either alone.
  if (musicInToolbarEnabled()) return;
  let target = link;
  if (isMusicSidebarLink(link)) {
    target = currentMusicPlayer();
    if (!target) return;
  }
  let host; try { host = new URL(target.url).hostname.replace(/^(www|web|open)\./, ''); } catch { return; }
  const wv = findMediaGuest(host);
  if (!wv) return;

  let meta = null;
  try { meta = JSON.parse(await wv.executeJavaScript(NP_META_JS) || 'null'); } catch { /* ignore */ }
  if (!meta) return;
  // A loaded player with nothing playing still gets a pill — hovering the icon
  // and having nothing at all happen reads as broken. It just has no transport.
  const idle = !meta.live;

  const title = meta.title || target.name || target.title || host;
  const artist = meta.artist || '';
  hideSidebarNowPlaying(true);
  const pill = document.createElement('div');
  pill.className = 'sb-nowplaying' + (idle ? ' is-idle' : '');
  pill.innerHTML =
    (meta.art ? `<img class="sb-np-art" src="${esc(meta.art)}" alt="" />` : '<span class="sb-np-art sb-np-art-ph">' + MUSIC_ICON_SVG + '</span>') +
    '<span class="sb-np-meta">' +
      `<span class="sb-np-title">${esc(title)}</span>` +
      `<span class="sb-np-artist">${esc(artist || (idle ? 'Nothing playing' : meta.paused ? 'Paused' : 'Playing'))}</span>` +
    '</span>' +
    '<span class="sb-np-controls">' +
      `<button type="button" class="sb-np-btn ghost" data-np="prev" title="Previous">${NP_ICON_PREV}</button>` +
      `<button type="button" class="sb-np-btn" data-np="toggle" title="Play / pause">${meta.paused ? NP_ICON_PLAY : NP_ICON_PAUSE}</button>` +
      `<button type="button" class="sb-np-btn ghost" data-np="next" title="Next">${NP_ICON_NEXT}</button>` +
    '</span>';
  const r = btn.getBoundingClientRect();
  pill.style.top = Math.max(8, Math.min(r.top + r.height / 2 - 34, window.innerHeight - 90)) + 'px';
  document.body.appendChild(pill);
  _sbNp = pill;
  pill.addEventListener('mouseleave', () => hideSidebarNowPlaying(false));

  const refresh = async () => {
    try {
      const m = JSON.parse(await wv.executeJavaScript(NP_META_JS) || 'null');
      if (!m || !_sbNp) return;
      const tEl = pill.querySelector('.sb-np-title');
      const aEl = pill.querySelector('.sb-np-artist');
      const bEl = pill.querySelector('[data-np="toggle"]');
      const artEl = pill.querySelector('img.sb-np-art');
      const nowIdle = !m.live;
      pill.classList.toggle('is-idle', nowIdle);
      if (tEl && m.title) tEl.textContent = m.title;
      if (aEl) aEl.textContent = m.artist || (nowIdle ? 'Nothing playing' : m.paused ? 'Paused' : 'Playing');
      if (bEl) bEl.innerHTML = m.paused ? NP_ICON_PLAY : NP_ICON_PAUSE;
      // Artwork changes with the track, so follow it too.
      if (artEl && m.art && artEl.getAttribute('src') !== m.art) artEl.setAttribute('src', m.art);
    } catch { /* ignore */ }
  };

  // Poll while the pill is on screen so a track change (or a play/pause from
  // the page itself) is reflected live, instead of freezing on whatever was
  // playing at the moment you hovered.
  clearInterval(_sbNpPoll);
  _sbNpPoll = setInterval(() => {
    if (!_sbNp || !_sbNp.isConnected) { clearInterval(_sbNpPoll); _sbNpPoll = 0; return; }
    void refresh();
  }, 1000);

  pill.querySelectorAll('.sb-np-btn').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const kind = b.dataset.np;
      const js = kind === 'next' ? NP_NEXT_JS : kind === 'prev' ? NP_PREV_JS : NP_TOGGLE_JS;
      try { await wv.executeJavaScript(js); } catch { /* ignore */ }
      setTimeout(refresh, kind === 'toggle' ? 120 : 700);
    });
  });
}

// ─── Sidebar wiring ──────────────────────────────────────────────────────────
// Known web apps offered as one-click sidebar toggles in Customize.
const SIDEBAR_APP_CATALOG = [
  { title: 'Snapchat',  url: 'https://web.snapchat.com' },
  { title: 'Music',     url: 'privoo://music', music: true },
  { title: 'Discord',   url: 'https://discord.com/app' },
  { title: 'Instagram', url: 'https://www.instagram.com' },
  { title: 'Messenger', url: 'https://www.messenger.com' },
  { title: 'Telegram',  url: 'https://web.telegram.org' },
  { title: 'X',         url: 'https://x.com' },
];
let _sbCustomizePop = null;
function closeSidebarCustomize() { _sbCustomizePop?.remove(); _sbCustomizePop = null; }
function openSidebarCustomize() {
  closeSidebarCustomize();
  const pop = document.createElement('div');
  pop.className = 'sb-customize-pop';
  const links = sidebarLinkList();
  const has = (url) => links.some(l => l.url === url);
  const swRow = (inner, checked, attrs) =>
    `<label class="sb-cz-row">${inner}` +
    `<span class="sb-cz-sw"><input type="checkbox" ${attrs} ${checked ? 'checked' : ''}/><i></i></span></label>`;
  const curMode = settings?.sidebarMode || (settings?.showSidebar === false ? 'off' : 'on');
  pop.innerHTML =
    '<div class="sb-cz-head">' +
      '<div class="sb-cz-head-title">Sidebar</div>' +
      '<div class="sb-cz-head-sub">Choose when it shows and what sits on it.</div>' +
    '</div>' +
    '<div class="sb-cz-body">' +
    '<h4>Visibility</h4>' +
    '<div class="sb-cz-modes" id="sb-cz-modes">' +
      ['off', 'on', 'hover'].map((m) =>
        `<button type="button" class="sb-cz-mode-btn${m === curMode ? ' active' : ''}" data-mode="${m}">${m === 'off' ? 'Off' : m === 'on' ? 'Always on' : 'On hover'}</button>`
      ).join('') +
    '</div>' +
    '<h4 style="margin-top:12px">Shortcuts</h4>' +
    swRow('<span class="sb-cz-name">Quick access <small>Downloads, history and more</small></span>',
          settings?.sidebarQuickAccess !== false, 'id="sb-cz-qa"') +
    '<h4 style="margin-top:12px">Apps</h4>' +
    SIDEBAR_APP_CATALOG.map((a, i) => {
      const brandSvg = isMusicSidebarLink(a) ? MUSIC_ICON_SVG : brandIconSvgFor(a.url);
      const fav = faviconForSidebar(a.url);
      const icon = brandSvg
        ? `<span class="sb-cz-fav">${brandSvg}</span>`
        : fav
          ? `<img class="sb-cz-fav" src="${fav}" alt="" onerror="this.style.display='none'"/>`
          : `<span class="sb-cz-fav sb-cz-letter">${esc(a.title[0])}</span>`;
      return swRow(icon + `<span class="sb-cz-name">${esc(a.title)}</span>`, has(a.url), `data-app="${i}"`);
    }).join('') +
    '</div>' +
    '<div class="sb-cz-foot">' +
      '<button type="button" class="sb-cz-add" id="sb-cz-add">Add a site</button>' +
    '</div>';
  document.body.appendChild(pop);
  _sbCustomizePop = pop;

  pop.querySelector('#sb-cz-qa').addEventListener('change', (ev) => {
    void saveBrowserSetting({ sidebarQuickAccess: ev.target.checked }).then(renderSidebarRail);
  });
  pop.querySelectorAll('.sb-cz-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      pop.querySelectorAll('.sb-cz-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      void saveBrowserSetting({ sidebarMode: mode, showSidebar: mode !== 'off' });
      if (cpSidebarMode) {
        cpSidebarMode.querySelectorAll('.cp-seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
      }
    });
  });
  pop.querySelectorAll('input[data-app]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const app = SIDEBAR_APP_CATALOG[Number(cb.dataset.app)];
      const cur = sidebarLinkList();
      const next = cb.checked
        ? [...cur, app.music ? { title: app.title, url: app.url, music: true } : { title: app.title, url: app.url }]
        : cur.filter(l => l.url !== app.url);
      void saveBrowserSetting({ sidebarLinks: next }).then(renderSidebarRail);
    });
  });
  pop.querySelector('#sb-cz-add').addEventListener('click', () => { closeSidebarCustomize(); openSidebarAddModal(); });
  // Popover flagged "just opened" for one tick so the SAME click that opened
  // it (the cog button) doesn't immediately fall through to the single
  // persistent outside-click listener below and close it right back.
  pop.dataset.justOpened = '1';
  requestAnimationFrame(() => { delete pop.dataset.justOpened; });
}
// One persistent listener instead of attaching/detaching a new one on every
// open — the previous version added a fresh document click listener each
// time openSidebarCustomize() ran, and closing via the cog button (rather
// than an outside click) never removed it, so listeners piled up on every
// open/close cycle and the popover's outside-click behaviour got flakier
// the longer a session ran.
document.addEventListener('click', (ev) => {
  if (!_sbCustomizePop || _sbCustomizePop.dataset.justOpened) return;
  if (!_sbCustomizePop.contains(ev.target)) closeSidebarCustomize();
});
document.getElementById('sidebar-add')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (_sbCustomizePop) closeSidebarCustomize(); else openSidebarCustomize();
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

// Drag-to-resize the vertical tabs panel (right edge of panel).
// A full-window overlay is shown during the drag so the <webview> can't swallow
// the mouse — without it, releasing over a page meant mouseup never fired, so
// the new width was never saved (and the drag stuttered over the content).
(function wireVtabsResize() {
  const handle = document.getElementById('vtabs-resize');
  const panel  = vtabsPanel;
  if (!handle || !panel) return;
  const VTABS_WIDTH_KEY = 'privoo:vtabs-width';
  // Restore saved width
  try {
    const saved = localStorage.getItem(VTABS_WIDTH_KEY);
    if (saved) panel.style.width = saved;
  } catch {}
  let startX = 0, startW = 0, overlay = null;
  const onMove = (e) => {
    const delta = e.clientX - startX;
    const wrap  = document.getElementById('views-wrap');
    const max   = wrap ? wrap.offsetWidth * 0.5 : 500;
    const w = Math.max(180, Math.min(startW + delta, max));
    panel.style.width = `${w}px`;
  };
  const onUp = () => {
    if (overlay) { overlay.remove(); overlay = null; }
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    try { localStorage.setItem(VTABS_WIDTH_KEY, panel.style.width); } catch {}
  };
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    startX = e.clientX;
    startW = panel.offsetWidth;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    // Overlay above everything (incl. webviews) captures the drag reliably.
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:col-resize;';
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseup', onUp);
    document.body.appendChild(overlay);
    e.preventDefault();
  });
})();

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
    updateDockedDevToolsBounds();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
  });
})();

window.addEventListener('resize', () => {
  requestAnimationFrame(updateDockedDevToolsBounds);
});

window.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const t = e.target;
  if (menuEl && !menuEl.classList.contains('hidden')) {
    if (!menuEl.contains(t) && !menuBtn.contains(t)) menuEl.classList.add('hidden');
  }
  if (shieldPanel && !shieldPanel.classList.contains('hidden')) {
    if (!shieldPanel.contains(t) && !shieldBtn.contains(t)) shieldPanel.classList.add('hidden');
  }
  if (vpnPanel && !vpnPanel.classList.contains('hidden')) {
    if (!vpnPanel.contains(t) && !vpnBtn.contains(t)) vpnPanel.classList.add('hidden');
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
  const calcPop = document.getElementById('calc-popover');
  if (calcPop && !calcPop.classList.contains('hidden') && !t.closest('#calc-anchor')) {
    calcPop.classList.add('hidden');
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
    case 'new-tab':
      if (document.body.classList.contains('vertical-tabs') && vtabsSearchPopupEnabled()) showSearchPopup();
      else createTab();
      break;
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
    case 'zoom-in':    activeTab()?.wv.setZoomLevel((activeTab()?.wv.getZoomLevel() || 0) + 1); setTimeout(updateZoomIndicator, 50); break;
    case 'zoom-out':   activeTab()?.wv.setZoomLevel((activeTab()?.wv.getZoomLevel() || 0) - 1); setTimeout(updateZoomIndicator, 50); break;
    case 'zoom-reset': activeTab()?.wv.setZoomLevel(0); setTimeout(updateZoomIndicator, 50); break;
    case 'reader-mode':  toggleReaderMode(); break;
    case 'focus-mode':   toggleFocusMode(); break;
    case 'mobile-view':  openMobileView(); break;
    case 'split-view':   toggleSplitView(); break;
    case 'capture-page': captureFullPage(); break;
    case 'cmd-palette':  openCmdPalette(); break;
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
// In vertical-tabs mode the top address bar opens the centered search popup
// when there's no real website to edit (empty state / internal pages). When a
// http(s) site is loaded it stays a normal, editable address bar so you can
// edit the current URL in place.
function vtabsOmniboxShouldPopup() {
  if (!document.body.classList.contains('vertical-tabs')) return false;
  if (!vtabsSearchPopupEnabled()) return false;
  const t = activeTab();
  const u = t && t.url ? t.url : '';
  return !(u.startsWith('http://') || u.startsWith('https://'));
}
omnibox.addEventListener('mousedown', (e) => {
  if (vtabsOmniboxShouldPopup()) {
    e.preventDefault();
    showSearchPopup(false);
  }
});
// Track whether focus arrived via a pointer click vs. the keyboard (Ctrl+L).
let _omniFocusByPointer = false;
omnibox.addEventListener('pointerdown', () => { _omniFocusByPointer = true; });
omnibox.addEventListener('focus', () => {
  if (vtabsOmniboxShouldPopup()) {
    omnibox.blur();
    showSearchPopup(false);
    return;
  }
  const val = omnibox.value;
  if (_omniFocusByPointer) {
    // A click lands the caret exactly where you clicked — the native, expected
    // behavior. We deliberately don't force it to the start or end.
    _omniFocusByPointer = false;
  } else {
    // Keyboard focus (Ctrl+L / Alt+D) selects all for a quick replace.
    omnibox.select();
  }
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
omnibox.addEventListener('input', (e) => {
  triggerSuggest(e.target.value);
  // Play typing sound if theme UI sounds are enabled
  if (settings?.ntpWaveEnabled && settings?.ntpThemeId) {
    ThemeUiSfx.play('type');
  }
});

omnibox.addEventListener('blur', () => {
  // Hide suggestions when omnibox loses focus (e.g., when clicking on the page)
  setTimeout(() => hideSuggestions(), 150);
});

omnibox.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); highlightSug(Math.min(sugIndex + 1, sugItems.length - 1)); return; }
  // highlightSug() restores what was typed when the index goes back to -1.
  // This used to put the CURRENT PAGE's url in the field instead, which meant
  // arrowing down and back up silently replaced your query with the address of
  // the page you were trying to leave.
  if (e.key === 'ArrowUp')   { e.preventDefault(); highlightSug(Math.max(sugIndex - 1, -1)); return; }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    // Play delete sound
    if (settings?.ntpWaveEnabled && settings?.ntpThemeId) {
      ThemeUiSfx.play('delete');
    }
  }
  if (e.key === 'Escape')    { hideSuggestions(); omnibox.blur(); closePopovers(); return; }
  if (e.key === 'Enter') {
    // Play confirmation sound for search/navigate
    if (settings?.ntpWaveEnabled && settings?.ntpThemeId) {
      ThemeUiSfx.play('confirm');
    }
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
// The new tab page, always. The setting that let this point somewhere else
// has been removed, so there is nothing left for it to read.
homeBtn.addEventListener('click', () => navigate(NEWTAB_URL));
newTabBtn.addEventListener('click', () => {
  if (document.body.classList.contains('vertical-tabs') && vtabsSearchPopupEnabled()) showSearchPopup();
  else createTab();
});
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
    // Clear any progress left from a previous run.
    ytdlpResetUi();
    // MP3 needs ffmpeg. Say so up front rather than after a failed download.
    window.privoo.ytdlpHasFfmpeg?.().then((has) => {
      const sel = document.getElementById('ytdlp-format');
      const mp3 = sel?.querySelector('option[value="mp3"]');
      if (mp3) {
        mp3.disabled = !has;
        mp3.textContent = has ? 'MP3 (audio only)' : 'MP3 (needs ffmpeg)';
      }
    }).catch(() => { /* leave the option as-is */ });
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

// ── Calculator (Calculator extension) ────────────────────────────────────────
(function initCalculator() {
  const btn     = document.getElementById('calc-btn');
  const popover = document.getElementById('calc-popover');
  const display = document.getElementById('calc-display');
  const exprEl  = document.getElementById('calc-expr');
  if (!btn || !popover || !display) return;

  const OP_SIGN = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  let acc = null;      // running total
  let op = null;       // pending operator
  let cur = '0';       // current entry (string)
  let fresh = true;    // next digit starts a new entry

  const fmt = (n) => {
    if (!isFinite(n)) return 'Error';
    let s = String(Math.round(n * 1e10) / 1e10);
    if (s.length > 12) s = Number(n).toPrecision(10).replace(/\.?0+$/, '');
    return s;
  };
  const group = (s) => {
    const [int, dec] = String(s).split('.');
    const sign = int.startsWith('-') ? '-' : '';
    const digits = sign ? int.slice(1) : int;
    if (!/^\d+$/.test(digits)) return s;
    return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec !== undefined ? '.' + dec : '');
  };
  function show() {
    display.textContent = cur.length > 12 ? Number(cur).toPrecision(8) : group(cur);
    if (exprEl) {
      exprEl.textContent = op !== null && acc !== null
        ? `${group(fmt(acc))} ${OP_SIGN[op]}${fresh ? '' : ' ' + group(cur)}`
        : '';
    }
    popover.querySelectorAll('.calc-op').forEach((k) => {
      k.classList.toggle('armed', fresh && k.dataset.k === op);
    });
  }

  function apply(a, b, o) {
    switch (o) { case '+': return a + b; case '-': return a - b; case '*': return a * b; case '/': return b === 0 ? NaN : a / b; }
    return b;
  }
  function inputDigit(d) {
    if (fresh) { cur = (d === '.') ? '0.' : d; fresh = false; }
    else if (d === '.') { if (!cur.includes('.')) cur += '.'; }
    else { cur = (cur === '0') ? d : cur + d; }
    show();
  }
  function chooseOp(o) {
    const v = parseFloat(cur);
    if (op !== null && !fresh) { acc = apply(acc, v, op); cur = fmt(acc); }
    else { acc = v; }
    op = o; fresh = true;
    show();
  }
  function equals() {
    if (op === null) return;
    const v = parseFloat(cur);
    const done = `${group(fmt(acc))} ${OP_SIGN[op]} ${group(fmt(v))}`;
    acc = apply(acc, v, op); cur = fmt(acc);
    op = null; fresh = true;
    show();
    if (exprEl) exprEl.textContent = done;
  }
  function press(k) {
    if (/^[0-9.]$/.test(k)) return inputDigit(k);
    if (k === '+' || k === '-' || k === '*' || k === '/') return chooseOp(k);
    if (k === '=') return equals();
    if (k === 'clear') { acc = null; op = null; cur = '0'; fresh = true; return show(); }
    if (k === 'sign') { cur = fmt(parseFloat(cur) * -1); return show(); }
    if (k === 'percent') { cur = fmt(parseFloat(cur) / 100); fresh = true; return show(); }
    if (k === 'back') {
      if (fresh) return;
      cur = cur.length > 1 ? cur.slice(0, -1) : '0';
      if (cur === '-' || cur === '') cur = '0';
      return show();
    }
  }
  // Flash the on-screen key so typing on the keyboard reads back visually.
  function flash(k) {
    const el = popover.querySelector(`.calc-key[data-k="${CSS.escape(k)}"]`);
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(() => el.classList.remove('pressed'), 110);
  }

  popover.querySelectorAll('.calc-key').forEach((k) => {
    k.addEventListener('click', (e) => { e.stopPropagation(); press(k.dataset.k); });
  });
  display.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cur).then(() => {
      display.classList.add('copied');
      setTimeout(() => display.classList.remove('copied'), 500);
    }).catch(() => {});
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = !popover.classList.contains('hidden');
    closePopovers();
    if (!wasOpen) { popover.classList.remove('hidden'); show(); }
  });
  // Keyboard input while the calculator is open.
  document.addEventListener('keydown', (e) => {
    if (popover.classList.contains('hidden')) return;
    const k = e.key === 'x' || e.key === 'X' ? '*' : e.key;
    if (/^[0-9.]$/.test(k)) { press(k); flash(k); e.preventDefault(); }
    else if (['+','-','*','/'].includes(k)) { press(k); flash(k); e.preventDefault(); }
    else if (k === 'Enter' || k === '=') { press('='); flash('='); e.preventDefault(); }
    else if (k === 'Escape') { press('clear'); flash('clear'); }
    else if (k === 'Backspace') { press('back'); flash('back'); e.preventDefault(); }
    else if (k === '%') { press('percent'); flash('percent'); e.preventDefault(); }
  });
})();

function updateGeoConnectLabel() {
  // The connect control is now an icon power button — its text must not be
  // overwritten. Aria-label is kept in sync inside updateGeoStatusLine().
}

// ── Custom region dropdown (replaces the native <select> — the OS-rendered
// select forced a mismatched serif font and couldn't be themed). ──
geoDdBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = geoDdMenu.classList.contains('hidden');
  geoDdMenu.classList.toggle('hidden', !willOpen);
  geoDdBtn.setAttribute('aria-expanded', String(willOpen));
});
geoDdMenu?.querySelectorAll('.geo-dd-opt').forEach((opt) => {
  opt.addEventListener('click', (e) => {
    e.stopPropagation();
    setGeoValue(opt.dataset.value);
    closeGeoDropdown();
  });
});
// Close the dropdown when clicking anywhere outside it (but keep the popover open).
document.addEventListener('click', (e) => {
  if (geoDdMenu && !geoDdMenu.classList.contains('hidden') && !e.target.closest('#geo-dd')) {
    closeGeoDropdown();
  }
}, true);

geoApplyBtn?.addEventListener('click', async () => {
  // Power button toggles the connection like a VPN app: if we're currently
  // connected, tapping it disconnects; otherwise it connects to the selected
  // region. The popover stays open and updates in place to show the new state.
  const currentlyConnected = !!(settings?.geoSpoofEnabled && geoCoordsFromSettings(settings));
  let patch;
  if (currentlyConnected) {
    patch = { geoSpoofEnabled: false, geoPreset: 'off' };
    setGeoValue('off');
  } else {
    const preset = (geoValue && geoValue !== 'off') ? geoValue : 'off';
    if (preset === 'off') return; // nothing selected to connect to
    patch = { geoSpoofEnabled: true, geoPreset: preset };
    if (preset === 'custom') {
      patch.geoLatitude = parseFloat(geoLatInput?.value || '') || 0;
      patch.geoLongitude = parseFloat(geoLonInput?.value || '') || 0;
    }
  }
  Object.assign(settings, patch);   // optimistic — reflect immediately
  updateGeoStatusLine();
  await saveBrowserSetting(patch);
});

// Progressive-enhancement custom dropdown. The native <select> stays in the
// DOM as the real source of truth (value/change events keep working
// unmodified everywhere else in this file), just visually hidden, with a
// themed button + floating list drawn on top. Mirrors the pattern already
// used in settings.html, ported here for the media download format picker.
function enhanceNativeSelect(select) {
  if (!select || select.dataset.enhanced) return;
  select.dataset.enhanced = '1';
  const wrap = document.createElement('div');
  wrap.className = 'csel-wrap';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);
  select.classList.add('csel-native');
  select.tabIndex = -1;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = select.className.replace('csel-native', '').trim() + ' csel-trigger';
  wrap.appendChild(trigger);

  const list = document.createElement('div');
  list.className = 'csel-list';
  // On <body>, not in the wrap. Every one of these lives inside a
  // .toolbar-popover, and a popover is overflow:hidden — an absolutely
  // positioned list inside one is clipped by it, which is why the media
  // downloader's dropdown appeared to do nothing at all.
  document.body.appendChild(list);

  function syncLabel() {
    const opt = select.options[select.selectedIndex];
    trigger.textContent = opt ? opt.textContent : '';
  }
  function buildList() {
    list.innerHTML = '';
    Array.from(select.options).forEach((opt, i) => {
      const item = document.createElement('div');
      item.className = 'csel-item' + (i === select.selectedIndex ? ' active' : '');
      item.textContent = opt.textContent;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (select.selectedIndex !== i) {
          select.selectedIndex = i;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
        closeList();
      });
      list.appendChild(item);
    });
  }
  /* Placed from the trigger's own rectangle, in viewport coordinates. No
     ancestor can clip it and no ancestor's scrolling can move it out from
     under the control it belongs to. */
  function positionList() {
    const r = trigger.getBoundingClientRect();
    list.style.minWidth = r.width + 'px';
    list.style.left = '0px';
    list.style.top = '0px';
    const h = list.offsetHeight;
    const below = window.innerHeight - r.bottom - 8;
    // Open upward when there is not room below. The format picker sits near
    // the bottom of a tall panel, so this is the normal case there, not the
    // edge case.
    const up = below < h && r.top > below;
    list.style.left = Math.max(8, Math.min(r.left, window.innerWidth - list.offsetWidth - 8)) + 'px';
    list.style.top = (up ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  }

  function openList() {
    document.querySelectorAll('.csel-list.open').forEach((l) => l.classList.remove('open'));
    buildList();
    list.classList.add('open');
    trigger.classList.add('open');
    positionList();
  }
  function closeList() { list.classList.remove('open'); trigger.classList.remove('open'); }
  // A fixed list does not travel with the thing it is attached to, so it is
  // closed rather than left floating somewhere the control no longer is.
  window.addEventListener('resize', closeList);
  window.addEventListener('scroll', closeList, true);

  /* The list lives on <body> so no panel can clip it — which also means no
     panel can hide it. Closing the popover used to take the list with it
     because the list was inside it; now the list has to notice.

     Watching the panel's attributes rather than hooking whatever closes it:
     these panels are opened and closed from several places, and a dropdown
     that only closes when someone remembered to tell it is a dropdown that
     will be left on screen again. */
  const panel = trigger.closest('.toolbar-popover, .vpn-panel, .sidebar-panel');
  if (panel) {
    const gone = () => panel.classList.contains('hidden') || panel.hidden;
    try {
      new MutationObserver(() => { if (gone()) closeList(); })
        .observe(panel, { attributes: true, attributeFilter: ['class', 'hidden'] });
    } catch { /* no observer: the checks below still cover the common cases */ }
  }
  // Belt and braces for a panel taken off screen some other way — a tab
  // change, a window resize, a view swapped inside the panel.
  const wasVisible = () => !!(trigger.offsetParent || trigger.getClientRects().length);
  document.addEventListener('mousedown', () => {
    if (list.classList.contains('open') && !wasVisible()) closeList();
  }, true);
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    list.classList.contains('open') ? closeList() : openList();
  });
  document.addEventListener('click', (e) => {
    // The list is on <body> now, so "outside" has to mean outside BOTH the
    // control and the list — testing the wrap alone would close the list on
    // the click that was choosing from it.
    if (!wrap.contains(e.target) && !list.contains(e.target)) closeList();
  });
  for (const prop of ['value', 'selectedIndex']) {
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    if (!desc) continue;
    Object.defineProperty(select, prop, {
      configurable: true,
      get() { return desc.get.call(select); },
      set(v) { desc.set.call(select, v); syncLabel(); },
    });
  }
  syncLabel();
}
enhanceNativeSelect(document.getElementById('ytdlp-format'));
// The translate popover's language list. It was the last native <select> in
// the chrome, which meant one dropdown in the whole browser opened an
// OS-drawn list in the OS's own colours inside a themed popover.
enhanceNativeSelect(document.getElementById('translate-lang'));
// The proxy type in the VPN panel's config view. It had no class on it at
// all, so it was the one dropdown in the browser that opened the operating
// system's list, in the operating system's colours, inside a themed panel.
enhanceNativeSelect(document.getElementById('vpn-type'));

const YTDLP_DISCLAIMER_KEY = 'privoo:ytdlp-rights-shown';

// Friendly text for the failure modes people actually hit, instead of dumping
// four kilobytes of yt-dlp log into a popover.
function ytdlpErrorText(r) {
  const code = r?.error || '';
  if (code === 'not-found')   return 'yt-dlp is not installed yet. It downloads automatically on first launch, so try again in a moment.';
  if (code === 'invalid-url') return 'That does not look like a link. Paste a page URL or a direct media link.';
  if (code === 'no-ffmpeg')   return 'Converting to MP3 needs ffmpeg, which is not installed. Install ffmpeg, or pick a video format instead.';
  if (code === 'cancelled')   return 'Cancelled.';
  const log = String(r?.log || '');
  // Pull the one meaningful ERROR line out of the log rather than showing it all.
  const m = log.match(/^ERROR:s*(.+)$/m);
  if (m) {
    let msg = m[1].trim();
    if (/private video/i.test(msg))          return 'That video is private.';
    if (/members-only/i.test(msg))           return 'That video is members-only.';
    if (/video unavailable/i.test(msg))      return 'That video is unavailable.';
    if (/sign in|age.?restricted/i.test(msg))return 'That video requires signing in (age-restricted).';
    if (/unsupported url/i.test(msg))        return 'That site is not supported.';
    if (msg.length > 180) msg = msg.slice(0, 180) + '…';
    return msg;
  }
  return 'Download failed.';
}

let _ytdlpJobId = null;

function ytdlpResetUi() {
  const wrap = document.getElementById('ytdlp-progress-wrap');
  const cancel = document.getElementById('ytdlp-cancel');
  if (wrap) wrap.hidden = true;
  if (cancel) cancel.hidden = true;
  if (ytdlpRunBtn) ytdlpRunBtn.disabled = false;
  _ytdlpJobId = null;
}

async function runYtdlpDownload() {
  const url = (ytdlpUrlInput?.value || '').trim();
  if (!url) { ytdlpStatusEl.textContent = 'Paste a link first.'; return; }
  const format = document.getElementById('ytdlp-format')?.value || 'best';
  const folder = (document.getElementById('ytdlp-folder')?.value || '').trim();

  const wrap   = document.getElementById('ytdlp-progress-wrap');
  const bar    = document.getElementById('ytdlp-bar');
  const titleEl= document.getElementById('ytdlp-title');
  const metaEl = document.getElementById('ytdlp-meta');
  const cancel = document.getElementById('ytdlp-cancel');

  ytdlpRunBtn.disabled = true;
  if (cancel) cancel.hidden = false;
  if (wrap) wrap.hidden = false;
  if (bar) { bar.style.width = '0%'; bar.classList.add('indeterminate'); }
  if (titleEl) titleEl.textContent = '';
  if (metaEl) metaEl.textContent = '';
  ytdlpStatusEl.textContent = '';

  try {
    const r = await window.privoo.ytdlpDownload(url, { format, folder: folder || undefined });
    if (r?.ok) {
      if (bar) { bar.classList.remove('indeterminate'); bar.style.width = '100%'; }
      const name = r.file ? r.file.split(/[\/]/).pop() : (r.title || 'File');
      ytdlpStatusEl.textContent = 'Saved ' + name;
      if (metaEl) metaEl.textContent = 'Done';
    } else {
      ytdlpStatusEl.textContent = ytdlpErrorText(r);
      if (wrap) wrap.hidden = true;
    }
  } catch (err) {
    ytdlpStatusEl.textContent = String(err?.message || err);
    if (wrap) wrap.hidden = true;
  }
  if (cancel) cancel.hidden = true;
  ytdlpRunBtn.disabled = false;
  _ytdlpJobId = null;
}

// Live progress from the main process.
window.privoo.onYtdlpProgress?.((ev) => {
  if (!ev) return;
  const bar    = document.getElementById('ytdlp-bar');
  const titleEl= document.getElementById('ytdlp-title');
  const metaEl = document.getElementById('ytdlp-meta');
  if (ev.jobId) _ytdlpJobId = ev.jobId;
  if (ev.title && titleEl && !titleEl.textContent) titleEl.textContent = ev.title;

  if (ev.phase === 'download' && typeof ev.percent === 'number') {
    if (bar) { bar.classList.remove('indeterminate'); bar.style.width = ev.percent + '%'; }
    if (metaEl) {
      const bits = [ev.percent.toFixed(1) + '%'];
      if (ev.total) bits.push('of ' + ev.total);
      if (ev.speed) bits.push('at ' + ev.speed);
      if (ev.eta)   bits.push('ETA ' + ev.eta);
      metaEl.textContent = bits.join('  ');
    }
  } else if (ev.phase === 'merge') {
    if (bar) bar.classList.add('indeterminate');
    if (metaEl) metaEl.textContent = ev.message || 'Finishing…';
  } else if (ev.phase === 'probe' && ev.message && metaEl && !metaEl.textContent) {
    metaEl.textContent = ev.message;
  }
});

document.getElementById('ytdlp-cancel')?.addEventListener('click', async () => {
  try { await window.privoo.ytdlpCancel?.(_ytdlpJobId); } catch { /* already gone */ }
  ytdlpStatusEl.textContent = 'Cancelled.';
  ytdlpResetUi();
});

ytdlpRunBtn?.addEventListener('click', () => {
  let shown = false;
  try { shown = !!localStorage.getItem(YTDLP_DISCLAIMER_KEY); } catch {}
  if (shown) { runYtdlpDownload(); return; }
  const overlay = document.getElementById('ytdlp-disclaimer');
  if (!overlay) { runYtdlpDownload(); return; }
  overlay.classList.remove('hidden');
  document.getElementById('ytdlp-disc-ok').onclick = () => {
    try { localStorage.setItem(YTDLP_DISCLAIMER_KEY, '1'); } catch {}
    overlay.classList.add('hidden');
    runYtdlpDownload();
  };
  document.getElementById('ytdlp-disc-cancel').onclick = () => {
    overlay.classList.add('hidden');
  };
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
// Opera-style tab search magnifier at the right edge of the tab strip.
document.getElementById('tab-search-btn')?.addEventListener('click', () => openTabSearch());
document.getElementById('vtabs-search')?.addEventListener('click', () => openTabSearch());
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
      'background:#202020;color:#fff;font:13px/1.4 system-ui,sans-serif;padding:10px 18px;' +
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
const MOBILE_DISCLAIMER_KEY = 'privoo:mobile-view-shown';
function openMobileView() {
  const tab = activeTab();
  if (!tab?.url || tab.url.startsWith('privoo://') || tab.url.startsWith('about:')) return;
  const url = tab.url;
  let shown = false;
  try { shown = !!localStorage.getItem(MOBILE_DISCLAIMER_KEY); } catch {}
  if (shown) {
    window.privoo.openMobileWindow(url).catch?.(() => {});
    return;
  }
  const overlay = document.getElementById('mobile-disclaimer');
  if (!overlay) { window.privoo.openMobileWindow(url).catch?.(() => {}); return; }
  overlay.classList.remove('hidden');
  const ok = document.getElementById('mdisc-ok');
  const cancel = document.getElementById('mdisc-cancel');
  const dismiss = () => overlay.classList.add('hidden');
  ok.onclick = () => {
    try { localStorage.setItem(MOBILE_DISCLAIMER_KEY, '1'); } catch {}
    dismiss();
    window.privoo.openMobileWindow(url).catch?.(() => {});
  };
  cancel.onclick = dismiss;
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
    else if (r === 'open')   privooToast('Reader mode on, press Esc to exit');
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
  // Same treatment as the address search popup — otherwise this dialog centres
  // on the window and sits well left of the tabs it is searching.
  const pad = contentAreaPadding();
  tabSearchEl.style.paddingLeft = pad.left + 'px';
  tabSearchEl.style.paddingRight = pad.right + 'px';
  tsInput.value = '';
  renderTabSearch('');
  setTimeout(() => tsInput.focus(), 0);
}
function closeTabSearch() {
  tabSearchEl?.classList.add('hidden');
}
tabSearchEl?.addEventListener('mousedown', (e) => {
  if (e.target === tabSearchEl) closeTabSearch();
});
function renderTabSearch(q) {
  const query = q.trim().toLowerCase();
  tsResults = tabs.filter((t) => {
    if (!query) return true;
    return (t.title || '').toLowerCase().includes(query)
        || (t.url || '').toLowerCase().includes(query);
  });
  tsSel = 0;
  tsList.innerHTML = '';
  const countEl = document.getElementById('ts-count');
  if (countEl) countEl.textContent = tsResults.length + (tsResults.length === 1 ? ' tab' : ' tabs');
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
    ti.textContent = t.title || newTabLabel();
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
  applySplitTabStripJoin();
}

// Joins the two split tabs into one connected pill in the strip, matching
// the joined panes below, instead of leaving them as two disconnected tabs.
function applySplitTabStripJoin() {
  for (const t of tabs) t.tabEl.classList.remove('split-left', 'split-right');
  if (!isSplit()) return;
  const left = getTab(splitLeftId);
  const right = getTab(splitRightId);
  if (!left || !right) return;
  left.tabEl.classList.add('split-left');
  right.tabEl.classList.add('split-right');
  if (left.tabEl.nextElementSibling !== right.tabEl) {
    left.tabEl.after(right.tabEl);
  }
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
  privooToast("Split View, click a panel's tab to control that side, or any other tab to exit");
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

// ─── Drag a tab onto the page area to enter Split View ───────────────────────
let _draggingTabId = null;
const splitDropzones = document.getElementById('split-dropzones');

// `e` is null for the pointer-driven strip drag; it is still a DragEvent for
// the vertical-tabs list, which has its own HTML5 drag.
function beginTabDrag(id, e) {
  _draggingTabId = id;
  document.body.classList.add('tab-dragging');
  try { if (e?.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(id)); } } catch {}
}
function endTabDrag() {
  _draggingTabId = null;
  document.body.classList.remove('tab-dragging');
  splitDropzones?.querySelectorAll('.split-dz').forEach(d => d.classList.remove('drop-active'));
}

function dragSplit(draggedId, side) {
  const dragged = getTab(draggedId);
  if (!dragged) return;
  let other = activeTab();
  if (!other || other.id === draggedId) other = tabs.find(t => t.id !== draggedId);
  if (!other) { activateTab(draggedId); return; }
  splitLeftId  = side === 'left' ? draggedId : other.id;
  splitRightId = side === 'left' ? other.id  : draggedId;
  splitRatio = 0.5;
  viewsEl.classList.add('split');
  activateTab(draggedId);
}

if (splitDropzones) {
  splitDropzones.querySelectorAll('.split-dz').forEach((dz) => {
    dz.addEventListener('dragover', (e) => {
      if (_draggingTabId == null) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = 'move'; } catch {}
      dz.classList.add('drop-active');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('drop-active'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault();
      const id = _draggingTabId;
      if (id != null) dragSplit(id, dz.dataset.side);
      endTabDrag();
    });
  });
}

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
  // Ctrl/Cmd + Period → open emoji picker
  if (mod && (e.key === '.' || e.key === '>')) {
    e.preventDefault();
    if (emojiPickerEl && !emojiPickerEl.classList.contains('hidden')) closeEmojiPicker();
    else openEmojiPicker(activeTab()?.wv);
    return;
  }
  // Ctrl+K → Command Palette
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (cmdPaletteEl && !cmdPaletteEl.classList.contains('hidden')) closeCmdPalette();
    else openCmdPalette();
    return;
  }
  // Ctrl+Shift+F → Focus mode
  if (mod && e.shiftKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    toggleFocusMode();
    return;
  }
  // Ctrl+Shift+P → Picture in Picture
  if (mod && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    togglePiP();
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

let _boostBannerTimer = null;
// Download Booster tells the user it is working, in the same bottom banner the
// protection notice uses. It closes itself; there is nothing to act on.
// A tab whose renderer died shows a blank frame. Offer a reload rather than
// leaving the user staring at nothing.
window.privoo.onTabRendererGone?.(({ guestId, reason }) => {
  const tab = tabs.find((t) => {
    try { return t.wv && t.wv.getWebContentsId() === guestId; } catch { return false; }
  });
  if (!tab) return;
  privooToast(reason === 'killed'
    ? 'This tab was closed by the system. Press Ctrl+R to reload it.'
    : 'This tab stopped responding and was reloaded.');
  try { tab.wv.reload(); } catch { /* the view is gone */ }
});

// A hung page: say so instead of letting it look like Privoo has frozen.
let _unresponsiveToastAt = 0;
window.privoo.onTabUnresponsive?.(() => {
  const now = Date.now();
  if (now - _unresponsiveToastAt < 20000) return;
  _unresponsiveToastAt = now;
  privooToast('This page is busy and not responding. Privoo is still running.');
});

window.privoo.onDownloadBoostStarted?.(() => {
  showOverlayBanner(
    'Download Booster is on',
    "Accelerating your download speed with Privoo's Download Booster.",
    'Got it',
  );
  clearTimeout(_boostBannerTimer);
  _boostBannerTimer = setTimeout(hideOverlayBanner, 5000);
});
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

// ─── Google sign-in (directly inside Privoo's webview) ────────────────────────
// Earlier builds bounced sign-in to the system browser, but Electron can't
// import those cookies back across the OS boundary, so you'd sign in there and
// still be logged out inside Privoo. The document-start Chrome spoof plus the
// Sec-CH-UA header rewrite now let the in-tab flow pass Google's "this browser
// may not be secure" check, so we sign in right here in a tab — and the session
// actually sticks because it's Privoo's own session.
async function handleGoogleSignIn() {
  closePopovers();
  const cur = activeTab()?.url;
  const continueUrl = (cur && cur.startsWith('http')) ? cur : 'https://www.google.com';
  let url;
  try { url = await window.privoo.googleSignInGetUrl(continueUrl); } catch {}
  createTab(url || 'https://accounts.google.com/signin/v2/identifier?flowName=GlifWebSignIn&flowEntry=ServiceLogin');
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
  /* Privoo AI, pinned, once ever.

     After the restore so a session that already has it is not given a second
     one, and before the fallback new tab below so that on a first run the new
     tab is still what ends up active — this is placed, not opened.

     The flag is written as soon as the tab is placed and nothing ever looks
     to see whether it is still there. That is the whole point: unpin it,
     close it, or both, and it does not come back. A default that reappears
     after you have removed it is not a default. */
  if (!isIncognitoWin && !settings?.aiTabPinned1Applied) {
    try {
      const already = tabs.some((t) => String(t.url || '').startsWith(AI_URL));
      if (!already) {
        createTab(AI_URL, false, { pinned: true });
        enforcePinnedFirst();
        requestAnimationFrame(resizeTabs);
      }
    } catch { /* a tab strip that is not ready is not worth an error here */ }
    // Written even if the tab was skipped for already existing, so this can
    // only ever run once.
    void saveBrowserSetting({ aiTabPinned1Applied: true });
  }

  if (!restored) {
    if (document.body.classList.contains('vertical-tabs')) {
      activeId = null;
      omnibox.value = '';
      renderVtabs();
    } else {
      createTab();
    }
  } else if (document.body.classList.contains('vertical-tabs')) {
    closeVtabsNewTabPages();
  }
  refreshStats();
  visibleInterval(refreshStats, 1500);
  // Incognito windows never persist their tab list — that would leak the
  // private session into the saved session restored by normal windows.
  if (!isIncognitoWin) {
    // Writing every five seconds regardless of change was a constant disk hit
    // for nothing. Serialise, compare, and only write when it differs.
    let _lastSession = '';
    setInterval(() => {
      let snapshot;
      try { snapshot = serializeSession(); } catch { return; }
      const key = JSON.stringify(snapshot);
      if (key === _lastSession) return;
      _lastSession = key;
      window.privoo.saveTabSession(snapshot).catch?.(() => {});
    }, 5000);
  }
  // Observe the STRIP (stable width — only changes on window resize), not the
  // content-sized #tabs-scroll: observing the latter feedback-loops because
  // resizeTabs() changes tab widths, which resizes #tabs-scroll, which fires
  // the observer again — visibly janking the tabs when many are open.
  // Once the window has settled and the first tab is up. Not before: a note
  // that appears while the chrome is still assembling itself reads as part of
  // the loading, not as something said to you.
  setTimeout(showChromeNote, 1400);

  const tabsStripEl = document.getElementById('tabs-strip');
  if (tabsStripEl) {
    let _rt = 0;
    new ResizeObserver(() => {
      if (_rt) return;
      _rt = requestAnimationFrame(() => { _rt = 0; resizeTabs(); });
    }).observe(tabsStripEl);
  }
})();

// ─── Vertical Tabs ───────────────────────────────────────────────────────────

// Two background layers: the site's icon over the generic globe. If the
// site's fails to load, the globe underneath is what shows — which is what
// the <img> error handler used to do, without the handler.
function vtabFaviconImage(el, tab) {
  const own = tab.faviconUrl;
  const next = (own ? 'url("' + own + '"), ' : '') + 'url("' + VTAB_DEFAULT_FAVICON + '")';
  if (el.dataset.fav !== next) {
    el.dataset.fav = next;
    el.style.backgroundImage = next;
  }
}

function isNewTabPage(url) {
  const u = url || '';
  return u === NEWTAB_URL || u.startsWith('privoo://newtab');
}

// Whether the vtabs Spotlight search overlay is enabled (Settings → Layout).
// Default ON. When off, New Tab opens a normal new-tab page and the address
// bar behaves like the horizontal-tabs omnibox.
function vtabsSearchPopupEnabled() {
  return settings?.vtabsSearchPopup !== false;
}

// In vertical-tabs mode with the search popup ON there are no blank new-tab
// pages — the popup replaces them — so close any that are open. With the popup
// OFF we keep normal new-tab pages, so this is a no-op.
function closeVtabsNewTabPages() {
  if (!document.body.classList.contains('vertical-tabs')) return;
  if (!vtabsSearchPopupEnabled()) return;
  for (const t of tabs.filter(t => isNewTabPage(t.url))) closeTab(t.id);
}

// Mirror the tabs panel's real width onto --vtabs-w. The toolbar uses it to
// indent past the panel so the strip above the panel stays empty (Zen-style).
// A ResizeObserver rather than reading the setting: the panel width also comes
// from the collapse class and from drag-to-resize, and it animates between them.
// How much air between the panel's edge and the first toolbar control. The
// panel's own gutter, so the two surfaces sit next to each other rather than
// either touching or drifting apart.
const VTABS_TOOLBAR_GAP = 6;

// Indent the toolbar and the bookmarks bar so their contents begin where the
// page does, instead of in the column the tabs panel occupies below them.
//
// Measured, not calculated. The panel's right edge and the toolbar's left
// edge are both read from the layout, so this holds regardless of what is to
// the left of either (the shortcuts sidebar, window insets) — and it is
// written inline, which no stylesheet rule can override.
function syncVtabsToolbarIndent() {
  const bar = document.getElementById('toolbar');
  const bm  = document.getElementById('bookmarks-bar');
  const on  = document.body.classList.contains('vertical-tabs');

  if (!on || !vtabsPanel || vtabsPanel.hidden) {
    if (bar) bar.style.paddingLeft = '';
    if (bm)  bm.style.paddingLeft = '';
    return;
  }
  const panelRight = vtabsPanel.getBoundingClientRect().right;
  for (const el of [bar, bm]) {
    if (!el) continue;
    // Reading left is safe after writing padding — padding does not move an
    // element's own left edge, so there is no feedback here.
    const left = el.getBoundingClientRect().left;
    const indent = Math.max(0, Math.round(panelRight - left)) + VTABS_TOOLBAR_GAP;
    el.style.paddingLeft = indent + 'px';
  }
}

let _vtabsWidthObserver = null;
function watchVtabsWidth() {
  if (!vtabsPanel || _vtabsWidthObserver || typeof ResizeObserver !== 'function') return;
  _vtabsWidthObserver = new ResizeObserver(() => {
    const w = vtabsPanel.hidden ? 0 : Math.round(vtabsPanel.getBoundingClientRect().width);
    document.body.style.setProperty('--vtabs-w', w + 'px');
    syncVtabsToolbarIndent();
  });
  _vtabsWidthObserver.observe(vtabsPanel);
  // #views-wrap as well: the panel does not resize when the shortcuts sidebar
  // opens or closes, but the toolbar's left edge moves, and the indent is the
  // distance between the two. Nothing here writes to #views-wrap, so
  // observing it cannot loop.
  const wrap = document.getElementById('views-wrap');
  if (wrap) _vtabsWidthObserver.observe(wrap);
  window.addEventListener('resize', syncVtabsToolbarIndent);
}

function applyVerticalTabs(on) {
  document.body.classList.toggle('vertical-tabs', on);
  if (vtabsPanel) vtabsPanel.hidden = !on;
  if (on) {
    watchVtabsWidth();
    // Seed immediately — the observer's first callback is a frame away, and
    // without this the toolbar flashes at zero indent when vtabs is turned on.
    if (vtabsPanel) {
      const w = Math.round(vtabsPanel.getBoundingClientRect().width);
      if (w > 0) document.body.style.setProperty('--vtabs-w', w + 'px');
    }
    syncVtabsToolbarIndent();
    closeVtabsNewTabPages();
    renderVtabs();
    // With the popup disabled there's no overlay to fall back on, so make sure
    // there's always at least one real tab open.
    if (!vtabsSearchPopupEnabled() && tabs.length === 0) createTab();
  } else {
    document.body.style.removeProperty('--vtabs-w');
    syncVtabsToolbarIndent();      // clears the inline padding
    hideSearchPopup();
    if (tabs.length === 0) createTab();
  }
}

// body.no-tabs — every tab closed, which in vertical-tabs mode is a normal
// resting state (the search popup is how you start a new one). Used by the
// stylesheet to stop painting a page-coloured slab where there is no page.
function syncNoTabsClass() {
  document.body.classList.toggle('no-tabs', tabs.length === 0);
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
  syncNoTabsClass();
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
  if (titleEl) titleEl.textContent = tab.title || newTabLabel();
  const favEl = el.querySelector('.vtab-favicon');
  if (favEl) vtabFaviconImage(favEl, tab);
  // Loading state is re-derived from the model, because renderVtabs()
  // rebuilds these rows and a class set on the old element is gone.
  el.classList.toggle('loading', !!tab.loading);
  const reactEl = el.querySelector('.vtab-reaction');
  if (reactEl) {
    reactEl.textContent = tab.reaction || '';
    reactEl.hidden = !tab.reaction;
  }
}

function _makeVtabEl(tab) {
  const el = document.createElement('div');
  // .snoozed matters here as much as in the horizontal strip — renderVtabs
  // rebuilds these rows from scratch, so the class has to be re-derived from
  // the tab rather than left on an element that no longer exists.
  el.className = 'vtab' + (tab.id === activeId ? ' active' : '')
    + (tab.pinned ? ' vtab-pinned' : '')
    + (tab.snoozed ? ' snoozed' : '');
  el.dataset.tabId = String(tab.id);
  el.dataset.vtabKey = `tab-${tab.id}`;

  if (tab.groupId) {
    const g = tabGroups.find(x => x.id === tab.groupId);
    if (g) {
      el.style.setProperty('--vtab-group-color', g.solid || g.color || '#5f6368');
      el.classList.add('vtab-grouped');
    }
  }

  // A span, not an img — see the note by vtabFaviconImage(). An <img>
  // cannot have its pixels cleared for the loading ring.
  const fav = document.createElement('span');
  fav.className = 'vtab-favicon';
  vtabFaviconImage(fav, tab);
  el.appendChild(fav);

  const titleEl = document.createElement('span');
  titleEl.className = 'vtab-title';
  titleEl.textContent = tab.title || newTabLabel();
  el.appendChild(titleEl);

  const reactEl = document.createElement('span');
  reactEl.className = 'vtab-reaction';
  reactEl.textContent = tab.reaction || '';
  reactEl.hidden = !tab.reaction;
  el.appendChild(reactEl);

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

  el.draggable = true;
  el.addEventListener('dragstart', (e) => {
    if (e.target.closest('.vtab-close')) { e.preventDefault(); return; }
    el.classList.add('dragging'); beginTabDrag(tab.id, e);
  });
  el.addEventListener('dragend', () => { el.classList.remove('dragging'); endTabDrag(); });
  // Close on mousedown, not click. Two reasons: a tiny drag would otherwise
  // turn the press into a drag and swallow the click, and when the active tab's
  // <webview> has focus (e.g. the Settings page) the click gets eaten by the
  // focus transition so the tab only closed once you switched away. mousedown
  // always fires first, so the X closes the tab you're on immediately.
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('.vtab-close')) {
      e.stopPropagation();
      e.preventDefault();
      closeTab(tab.id);
    }
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('.vtab-close')) { e.stopPropagation(); return; }
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

vtabsNewBtn?.addEventListener('click', () => {
  if (document.body.classList.contains('vertical-tabs') && vtabsSearchPopupEnabled()) showSearchPopup();
  else createTab();
});

document.getElementById('vtabs-collapse')?.addEventListener('click', async () => {
  const collapsed = document.body.classList.toggle('vtabs-collapsed');
  // saveSettings has never existed on the bridge. The optional chain here
  // guarded `privoo`, not the method, so this threw a TypeError every time
  // the panel was collapsed — and the state was never written, so it came
  // back expanded on the next launch.
  try { await window.privoo?.setSettings?.({ vtabsCollapsed: collapsed }); } catch {}
});

// ─── Vtabs Search Popup ───────────────────────────────────────────────────────
const searchPopupEl    = document.getElementById('search-popup');
const searchPopupInput = document.getElementById('search-popup-input');
const searchPopupSugs  = document.getElementById('search-popup-suggestions');

let _spSugTimer = null;
let _spSugGen   = 0;
let _spSugItems = [];
let _spSugIndex = -1;

let _spCloseTimer = null;
let _spForNewTab = true;

// A full-window overlay has to be told where the page actually is: the
// shortcuts rail and the vertical-tabs panel both eat into the left edge, and
// centring on the viewport puts the card noticeably off to one side of the
// content it belongs to. Returns padding that makes `justify-content: center`
// land on the content area's true centre.
// Where the page area actually starts, on all four sides. Used to keep the
// search popup inside it — over the page, never over the chrome or the tabs
// panel. `top` is the toolbar's lower edge; without it the popup's card sat
// at the top of the WINDOW, on top of the toolbar.
function contentAreaPadding() {
  const views = document.getElementById('views-wrap');
  if (!views) return { left: 0, right: 0, top: 0 };
  const r = views.getBoundingClientRect();
  const panelW = (vtabsPanel && !vtabsPanel.hidden) ? vtabsPanel.offsetWidth : 0;
  return {
    left: Math.max(0, Math.round(r.left + panelW)),
    right: Math.max(0, Math.round(window.innerWidth - r.right)),
    top: Math.max(0, Math.round(r.top)),
  };
}

// The popup is a flex box that centres its card; what it centres the card
// IN is the page area, described by this padding. It is applied here rather
// than once on open because the box has to be re-measured whenever the thing
// being measured could have moved — otherwise the first frame is positioned
// from a stale rect and the card only looks centred once something else
// forces a relayout, which in practice was the suggestion list appearing.
function positionSearchPopup() {
  if (!searchPopupEl || searchPopupEl.classList.contains('hidden')) return;
  const pad = contentAreaPadding();
  searchPopupEl.style.paddingLeft = pad.left + 'px';
  searchPopupEl.style.paddingRight = pad.right + 'px';
  // Only with vertical tabs, where the popup is confined to the page area.
  // With the tab strip on top the card centres in the window as it always did.
  searchPopupEl.style.paddingTop =
    document.body.classList.contains('vertical-tabs') ? pad.top + 'px' : '';
}
window.addEventListener('resize', positionSearchPopup);

function showSearchPopup(forNewTab = true) {
  if (!searchPopupEl) return;
  _spForNewTab = forNewTab !== false;
  clearTimeout(_spCloseTimer);
  searchPopupEl.classList.remove('hidden', 'sp-closing');
  positionSearchPopup();
  const card = searchPopupEl.querySelector('.search-popup-card');
  for (const el of [searchPopupEl, card]) {
    if (!el) continue;
    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.animation = '';
  }
  searchPopupInput.value = '';
  let engName = searchEngines?.[settings?.searchEngine]?.name?.replace(' Search', '') || 'the web';
  if (settings?.searchEngine === 'custom') {
    try { engName = new URL(settings.customSearchUrl || '').hostname || 'your search engine'; }
    catch { engName = 'your search engine'; }
  } else if (engName === 'Custom…') { engName = 'the web'; }
  searchPopupInput.placeholder = `Search ${engName} or enter address`;
  _spSugItems = [];
  _spSugIndex = -1;
  if (searchPopupSugs) {
    clearTimeout(_spSugHideTimer);
    searchPopupSugs.classList.remove('sp-sug-closing');
    searchPopupSugs.classList.add('hidden');
  }
  requestAnimationFrame(() => searchPopupInput?.focus());
}

function hideSearchPopup() {
  if (!searchPopupEl || searchPopupEl.classList.contains('hidden')) return;
  searchPopupEl.classList.add('sp-closing');
  clearTimeout(_spCloseTimer);
  _spCloseTimer = setTimeout(() => {
    searchPopupEl.classList.add('hidden');
    searchPopupEl.classList.remove('sp-closing');
  }, 160);
  if (searchPopupSugs) searchPopupSugs.classList.add('hidden');
  clearTimeout(_spSugTimer);
  _spSugGen++;
}

function _spNavigate(text) {
  hideSearchPopup();
  // Opened via a "new tab" trigger (or there's nothing open) → make a new tab.
  // Opened by clicking the address bar → navigate the current tab instead.
  if (_spForNewTab || tabs.length === 0) {
    createTab(toUrl(text));
  } else {
    navigate(text);
  }
}

let _spSugHideTimer = null;
function _spHideSugs() {
  if (!searchPopupSugs || searchPopupSugs.classList.contains('hidden')) return;
  searchPopupSugs.classList.add('sp-sug-closing');
  clearTimeout(_spSugHideTimer);
  _spSugHideTimer = setTimeout(() => {
    searchPopupSugs.classList.add('hidden');
    searchPopupSugs.classList.remove('sp-sug-closing');
  }, 150);
}

function _spRenderSugs(items) {
  if (!searchPopupSugs || !items.length) {
    _spHideSugs();
    _spSugItems = [];
    return;
  }
  clearTimeout(_spSugHideTimer);
  searchPopupSugs.classList.remove('sp-sug-closing');
  _spSugItems = items.slice(0, 7);
  _spSugIndex = -1;
  searchPopupSugs.innerHTML = '';
  // The card just changed height; re-centre it in the same box.
  requestAnimationFrame(positionSearchPopup);
  const SP_MAGNIFIER = `<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 5 1.49-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/></svg>`;
  for (let i = 0; i < _spSugItems.length; i++) {
    const it = _spSugItems[i];
    const el = document.createElement('div');
    el.className = 'sp-sug-item';
    el.dataset.idx = i;

    const iconWrap = document.createElement('span');
    iconWrap.className = 'sp-sug-icon-wrap';
    if (it.type === 'history') {
      const fav = faviconFallbackForUrl(it.text);
      if (fav) {
        const img = document.createElement('img');
        img.src = fav; img.alt = ''; img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { iconWrap.innerHTML = SP_MAGNIFIER; }, { once: true });
        iconWrap.appendChild(img);
      } else {
        iconWrap.innerHTML = SP_MAGNIFIER;
      }
    } else {
      iconWrap.innerHTML = SP_MAGNIFIER;
    }

    const body = document.createElement('div');
    body.className = 'sp-sug-body';
    const title = document.createElement('div');
    title.className = 'sp-sug-title';
    title.textContent = it.label;
    body.appendChild(title);
    if (it.type === 'history' && it.text !== it.label) {
      const url = document.createElement('div');
      url.className = 'sp-sug-url';
      url.textContent = it.text;
      body.appendChild(url);
    }

    el.appendChild(iconWrap);
    el.appendChild(body);
    el.addEventListener('mousedown', (e) => { e.preventDefault(); _spNavigate(it.text); });
    searchPopupSugs.appendChild(el);
  }
  searchPopupSugs.classList.remove('hidden');
}

function _spHighlight(idx) {
  _spSugIndex = idx;
  searchPopupSugs?.querySelectorAll('.sp-sug-item').forEach((el, i) => el.classList.toggle('active', i === idx));
  if (idx >= 0 && _spSugItems[idx]) searchPopupInput.value = _spSugItems[idx].text;
}

async function _spFetch(q) {
  if (!q.trim()) { _spHideSugs(); return; }
  const myGen = ++_spSugGen;
  const hist = await window.privoo.historyAutocomplete(q).catch(() => []);
  if (myGen !== _spSugGen) return;
  let remote = [];
  if (settings?.searchSuggestions !== false) {
    remote = await window.privoo.getSuggestions(q, settings?.searchEngine).catch(() => []);
  }
  if (myGen !== _spSugGen) return;
  const items = [
    ...hist.map(h  => ({ text: h.url,  label: h.title || h.url, type: 'history' })),
    ...remote.map(r => ({ text: r.text, label: r.text,           type: 'search'  })),
  ];
  _spRenderSugs(items);
}

searchPopupInput?.addEventListener('input', () => {
  clearTimeout(_spSugTimer);
  _spSugTimer = setTimeout(() => _spFetch(searchPopupInput.value), 160);
});

searchPopupInput?.addEventListener('keydown', (e) => {
  const count = _spSugItems.length;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _spHighlight(Math.min(_spSugIndex + 1, count - 1));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _spHighlight(Math.max(_spSugIndex - 1, -1));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const text = (_spSugIndex >= 0 && _spSugItems[_spSugIndex]) ? _spSugItems[_spSugIndex].text : searchPopupInput.value;
    if (text.trim()) _spNavigate(text.trim());
  } else if (e.key === 'Escape') {
    hideSearchPopup();
  }
});

searchPopupEl?.addEventListener('mousedown', (e) => {
  if (e.target === searchPopupEl) hideSearchPopup();
});

// Right-click edit menu for chrome text inputs (search popup + address bar).
function wireFieldContextMenu(input) {
  if (!input) return;
  input.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const hasSel = input.selectionStart != null && input.selectionStart !== input.selectionEnd;
    let clip = '';
    try { clip = await navigator.clipboard.readText(); } catch {}
    const action = await showHtmlMenu([
      { id: 'emoji', label: 'Emojis' },
      { type: 'separator' },
      { id: 'cut',   label: 'Cut',        enabled: hasSel },
      { id: 'copy',  label: 'Copy',       enabled: hasSel },
      { id: 'paste', label: 'Paste',      enabled: !!clip },
      { type: 'separator' },
      { id: 'all',   label: 'Select all', enabled: input.value.length > 0 },
    ], e.clientX, e.clientY);
    if (!action) return;
    if (action === 'emoji') { openEmojiPicker(null, input); return; }
    input.focus();
    const s = input.selectionStart ?? input.value.length;
    const en = input.selectionEnd ?? input.value.length;
    if (action === 'copy' && hasSel) {
      try { await navigator.clipboard.writeText(input.value.slice(s, en)); } catch {}
    } else if (action === 'cut' && hasSel) {
      try { await navigator.clipboard.writeText(input.value.slice(s, en)); } catch {}
      input.setRangeText('', s, en, 'end');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (action === 'paste') {
      try {
        const t = await navigator.clipboard.readText();
        input.setRangeText(t, s, en, 'end');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      } catch {}
    } else if (action === 'all') {
      input.select();
    }
  });
}
wireFieldContextMenu(searchPopupInput);

// True while any blocking main-window popup/overlay is on screen — used to
// keep the one-time popups from stacking on top of each other.
function _anyBlockingOverlayOpen() {
  if (setupOverlay && !setupOverlay.hasAttribute('hidden')) return true;
  const updating = document.getElementById('updating-overlay');
  if (updating && !updating.hasAttribute('hidden')) return true;
  return false;
}

(function initThankYouPopup() {
  const popup = document.getElementById('thankyou-popup');
  if (!popup) return;
  const ok = document.getElementById('thankyou-ok');
  const close = () => popup.classList.add('hidden');
  ok?.addEventListener('click', close);
  popup.addEventListener('mousedown', (e) => { if (e.target === popup) close(); });
  const tryShow = () => {
    if (!settings) { setTimeout(tryShow, 500); return; }
    if (settings.thankYouShown) return;
    if (_anyBlockingOverlayOpen()) { setTimeout(tryShow, 800); return; }
    setTimeout(() => {
      // Mark shown the moment it appears so it can never come back, even if the
      // app is closed before the user dismisses it.
      settings.thankYouShown = true;
      window.privoo.setSettings?.({ thankYouShown: true });
      popup.classList.remove('hidden');
    }, 900);
  };
  tryShow();
})();

(function initDiscordPrompt() {
  const popup = document.getElementById('discord-popup');
  if (!popup) return;
  const join = document.getElementById('discord-join');
  const dismiss = document.getElementById('discord-dismiss');
  const close = () => popup.classList.add('hidden');
  join?.addEventListener('click', () => { close(); createTab('https://discord.gg/WweUzF3YCQ'); });
  dismiss?.addEventListener('click', close);
  popup.addEventListener('mousedown', (e) => { if (e.target === popup) close(); });
  let firstRun = null;
  const tryShow = () => {
    if (!settings) { setTimeout(tryShow, 500); return; }
    if (firstRun === null) firstRun = !settings.disclaimerAccepted;
    if (settings.discordPromptShown || firstRun) return;
    if (_anyBlockingOverlayOpen()) { setTimeout(tryShow, 800); return; }
    // Never overlap the thank-you popup: wait while it's pending or on screen,
    // then show. (Checked here at show time, so there's no race.)
    const ty = document.getElementById('thankyou-popup');
    const tyPending = !settings.thankYouShown;
    const tyVisible = ty && !ty.classList.contains('hidden');
    if (tyPending || tyVisible) { setTimeout(tryShow, 800); return; }
    settings.discordPromptShown = true;
    window.privoo.setSettings?.({ discordPromptShown: true });
    popup.classList.remove('hidden');
  };
  // Give the thank-you popup a head start so it's first in line.
  setTimeout(tryShow, 1400);
})();

(function initOwnBrowsingPopup() {
  const popup = document.getElementById('ownbrowsing-popup');
  if (!popup) return;
  const ok = document.getElementById('ownbrowsing-ok');
  const close = () => popup.classList.add('hidden');
  ok?.addEventListener('click', close);
  popup.addEventListener('mousedown', (e) => { if (e.target === popup) close(); });
  // The Discord prompt deliberately never fires (and never sets its flag) on a
  // first run, so waiting on it unconditionally would wait forever. Cap the
  // queueing and show anyway once the wait stops being about a visible popup.
  let waits = 0;
  const tryShow = () => {
    if (!settings) { setTimeout(tryShow, 500); return; }
    if (settings.ownBrowsingShown) return;
    if (_anyBlockingOverlayOpen()) { setTimeout(tryShow, 800); return; }
    // Queue behind the other two one-time popups, both pending and on-screen,
    // so they never stack. Same check-at-show-time approach as the Discord one.
    const blocked = [['thankyou-popup', 'thankYouShown'], ['discord-popup', 'discordPromptShown']]
      .some(([id, flag]) => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) return true;   // on screen now
        return !settings[flag] && waits < 12;                      // still pending
      });
    if (blocked) { waits++; setTimeout(tryShow, 900); return; }
    // Mark shown as it appears, so a crash or a quick quit can't bring it back.
    settings.ownBrowsingShown = true;
    window.privoo.setSettings?.({ ownBrowsingShown: true });
    popup.classList.remove('hidden');
  };
  setTimeout(tryShow, 2600);
})();

/* ── Paste protection ────────────────────────────────────────────────────
   A link you paste is a link someone else wrote. The checks below are
   deliberately a SHORT list of things that are almost never innocent, because
   a warning people learn to click through is worse than no warning at all —
   so no "http is insecure", no "this domain is new", nothing that fires on
   ordinary browsing.

   What is left is the small set of tricks used to make a URL read as one site
   while pointing at another.
   ─────────────────────────────────────────────────────────────────────── */

// Brands worth impersonating. A host that contains one of these but is not
// actually on that domain is the classic phishing shape:
// "paypal.secure-login.example.com".
const PASTE_BRANDS = [
  'paypal', 'google', 'apple', 'microsoft', 'amazon', 'netflix', 'facebook',
  'instagram', 'whatsapp', 'discord', 'steampowered', 'roblox', 'binance',
  'coinbase', 'metamask', 'outlook', 'office365', 'dropbox', 'github',
];

function looksSuspiciousUrl(raw) {
  const text = String(raw || '').trim();
  if (!text || /\s/.test(text.trim()) && !/^[a-z]+:\/\//i.test(text)) return null;

  // Scripts and inline data pretending to be a link. There is no legitimate
  // reason for either to arrive via the clipboard.
  if (/^\s*javascript:/i.test(text)) return 'It runs a script instead of opening a page.';
  if (/^\s*data:/i.test(text)) return 'It embeds a whole page inside the link itself.';

  let u;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : 'https://' + text); }
  catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;

  const host = u.hostname.toLowerCase();

  // Credentials in the URL. Browsers hide everything before the @, so
  // "https://apple.com@evil.example" reads as Apple and goes to evil.example.
  if (u.username || u.password) {
    return 'Everything before the @ is ignored — this actually opens ' + host + '.';
  }

  // Punycode. The only reason to paste an encoded hostname is that the
  // decoded one looks like a name it is not.
  if (host.split('.').some((p) => p.startsWith('xn--'))) {
    return 'The address uses characters that look like ordinary letters but are not.';
  }

  // A brand name that is not on the brand's domain.
  const parts = host.split('.');
  const registrable = parts.slice(-2).join('.');
  for (const brand of PASTE_BRANDS) {
    if (host.includes(brand) && !registrable.startsWith(brand + '.')) {
      return 'It mentions "' + brand + '" but the site is actually ' + registrable + '.';
    }
  }

  // A bare IP address where a name belongs — but not one on your own
  // network. A router admin page at 192.168.1.1 is a normal thing to open,
  // and warning about it is how a warning becomes noise.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) {
    const priv = /^(10\.|127\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)
      || host === '[::1]';
    if (!priv) return 'It points at a raw IP address rather than a named site.';
  }

  return null;
}

const pasteWarnEl = document.getElementById('paste-warn');
let _pasteWarnGo = null;

function closePasteWarn() {
  pasteWarnEl?.classList.add('hidden');
  _pasteWarnGo = null;
}

function showPasteWarn(url, reason, onProceed) {
  if (!pasteWarnEl) { onProceed(); return; }
  _pasteWarnGo = onProceed;
  const r = document.getElementById('paste-warn-reason');
  const u = document.getElementById('paste-warn-url');
  if (r) r.textContent = reason;
  if (u) u.textContent = url;
  pasteWarnEl.classList.remove('hidden');
  document.getElementById('paste-warn-cancel')?.focus();
}

document.getElementById('paste-warn-backdrop')?.addEventListener('click', closePasteWarn);
document.getElementById('paste-warn-cancel')?.addEventListener('click', () => {
  // Clear the field too. Leaving the link sitting there invites a second
  // Enter press, which is the thing we just talked them out of.
  omnibox.value = displayUrl(activeTab()?.url || '');
  closePasteWarn();
});
document.getElementById('paste-warn-go')?.addEventListener('click', () => {
  const go = _pasteWarnGo;
  closePasteWarn();
  if (go) go();
});
document.getElementById('paste-warn-off')?.addEventListener('click', async () => {
  closePasteWarn();
  await saveBrowserSetting({ pasteProtection: false });
  privooToast('Paste protection turned off. You can switch it back on in Settings, Privacy.');
});

// The check runs on paste, not on Enter: the moment to question a link is
// while you are still looking at where it came from.
omnibox?.addEventListener('paste', (e) => {
  if (settings?.pasteProtection === false) return;
  const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  const reason = looksSuspiciousUrl(text);
  if (!reason) return;
  e.preventDefault();
  showPasteWarn(text.trim(), reason, () => {
    omnibox.value = text.trim();
    omnibox.focus();
  });
});

// A page that tried to open a window without the user doing anything.
window.privoo.onPopupBlocked?.((d) => {
  privooToast('Blocked a pop-up from ' + (d?.host || 'this page') + '.');
});

/* ── One-time notes ──────────────────────────────────────────────────────
   Small text along the bottom of the window, once each, in order.

   These are deliberately not notifications: nothing to click, nothing to
   dismiss, no icon, and they never return. Something worth saying once in a
   browser you use every day should cost about as much attention as a line in
   a footer, and then it should be gone.

   They run through ONE element, strictly one at a time. That is the whole
   design: the protection line used to be drawn by the new tab page instead,
   which meant two documents each putting a message at the bottom centre of
   the same screen with no way to know about each other. They landed on top
   of one another, letter over letter. Two documents cannot take turns
   without a handshake, so there is only one document now.
   ─────────────────────────────────────────────────────────────────────── */

// Filled, still, and small. Not animated: a beating heart is a flourish, and
// a flourish on a line about people who died is the wrong register.
const NOTE_HEART = '<svg class="note-heart" viewBox="0 0 24 24" aria-hidden="true">'
  + '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 '
  + '3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 '
  + '6.86-8.55 11.54L12 21.35z"/></svg>';

const CHROME_NOTES = [
  {
    // Bumping this means writing a new settings key alongside it. Reusing the
    // old one would show the new note only to people who never saw the old.
    flag: 'noteNepalChinaFloods2026',
    holdMs: 10000,
    build: async (el) => {
      el.append('In memory of those lost to the floods in Nepal and China, and with '
        + 'hope for the thousands still missing. Our thoughts are with their families. ');
      el.insertAdjacentHTML('beforeend', NOTE_HEART);
    },
  },
  {
    // The same key the new tab page used, so anyone who has already seen this
    // does not meet it again after the move.
    flag: 'protectedToastSeen',
    holdMs: 7000,
    pill: true,
    build: async (el) => {
      // A real number they can check, rather than a slogan. If the count is
      // not available yet, the plain statement is still true.
      let line = 'Ad and tracker blocking is on.';
      try {
        const st = await window.privoo.getPrivacyStats?.();
        const n = (st?.blockedAds || 0) + (st?.blockedCookies || 0);
        if (n > 0) line = n.toLocaleString() + ' ads and trackers blocked so far.';
      } catch { /* keep the plain line */ }
      el.textContent = line;
    },
  },
  {
    // Not a first-run note. It waits until somebody has actually used the
    // browser for a while, because it is a claim about what Privoo is for and
    // a claim like that means nothing on the first minute of the first day.
    flag: 'noteInControl',
    holdMs: 8000,
    when: (s) => (Number(s.siteVisitCount) || 0) >= 15 && activeTabIsNewTab(),
    build: async (el) => { el.append('Putting people back in control of their browsing.'); },
  },
];

function showOneNote(el, note) {
  return new Promise((resolve) => {
    (async () => {
      el.className = 'chrome-note' + (note.pill ? ' pill' : '');
      el.textContent = '';
      await note.build(el);
      el.hidden = false;
      // Two frames: one for the element to exist un-hidden at opacity 0, one
      // for the class change to be a transition rather than a starting value.
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));

      // Persist as soon as it is on screen rather than when it finishes. If
      // the window is closed halfway through, it has still been seen.
      void saveBrowserSetting({ [note.flag]: true });

      setTimeout(() => {
        el.classList.remove('is-in');
        // Match the fade-out in theme.css before taking it out of the layout.
        setTimeout(() => { el.hidden = true; resolve(); }, 700);
      }, note.holdMs);
    })();
  });
}

/* The visit count is incremented in the main process on every page added to
   history, and that write does not broadcast — so the copy of settings this
   window is holding is stale almost immediately. Reading it directly would
   mean the note fired on some later launch rather than when the fifteenth
   site was actually visited.

   The flag is checked BEFORE the round trip, so once this has been shown the
   whole thing costs nothing at all. Without that it would be an IPC call
   every time anyone opens a new tab, forever, for a message that has already
   been read once. */
async function maybeNoteOnNewTab() {
  if (!settings || settings.noteInControl) return;
  if (!activeTabIsNewTab()) return;
  try {
    const d = await window.privoo.getSettings();
    const live = (d && d.settings) || d;
    if (live && typeof live.siteVisitCount === 'number') {
      settings.siteVisitCount = live.siteVisitCount;
    }
  } catch { /* the count stays as it was; it will be right next time */ }
  showChromeNote();
}

function activeTabIsNewTab() {
  const t = tabs.find((x) => x.id === activeId);
  return !!t && isNewTabPage(t.url);
}

// The queue is asynchronous and is now started from more than one place, so
// it has to be impossible for two runs to overlap — that would put two notes
// in the one element at once, which is the exact thing this queue exists to
// prevent.
let _notesRunning = false;

async function showChromeNote() {
  const el = document.getElementById('chrome-note');
  if (!el || !settings || _notesRunning) return;
  _notesRunning = true;
  try {
  for (const note of CHROME_NOTES) {
    // saveBrowserSetting replaces `settings`, so this reads the live object
    // each time round rather than a copy taken before the first note ran.
    if (settings[note.flag]) continue;
    // A note can also decline for now without being marked as shown, which is
    // how the third one waits for fifteen sites and a new tab.
    if (note.when && !note.when(settings)) continue;
    await showOneNote(el, note);
    // A breath between them, so the second does not begin the instant the
    // first has gone and read as one message changing its mind.
    await new Promise((r) => setTimeout(r, 700));
  }
  } finally { _notesRunning = false; }
}

/* ── Tab Snooze ──────────────────────────────────────────────────────────
   A background tab is a whole renderer process holding a page nobody is
   reading. After a while Privoo lets that page go and keeps the tab: its
   title, its favicon, its address and its place in the strip. Touch it and
   the page loads back.

   This is Chrome's Memory Saver, and it is the same bargain — a second of
   reload for the memory. What matters is being conservative about WHEN, so
   it never costs anyone anything they notice:

     - never the tab you are looking at, or either half of a split
     - never a tab playing audio, which is a tab being used without being
       looked at — the whole reason background tabs exist
     - never a tab you pinned, which is the one signal a person gives that
       a tab should stay put
     - never a page that is still loading, and never one already asleep
     - never a form: a page with something typed into it and not submitted
       is the one case where a reload loses real work

   The last check is the one worth having. Everything else here is
   convenience; that one is the difference between a memory feature and a
   feature that eats what somebody wrote.
   ─────────────────────────────────────────────────────────────────────── */
const SNOOZE_SWEEP_MS = 60000;   // how often to look; the delay is a setting

function snoozeDelayMs() {
  if (!settings || settings.tabSnooze === false) return 0;
  const mins = Number(settings.tabSnoozeMinutes);
  return Number.isFinite(mins) && mins > 0 ? mins * 60000 : 0;
}

function canSnooze(tab) {
  if (!tab || tab.snoozed || tab.pinned) return false;
  // Somebody typed into this page and has not navigated since. Reloading it
  // would throw that away, which is the one cost this feature must never
  // impose. Set by the 'form-dirty' message from the guest preload.
  if (tab.formDirty) return false;
  if (tab.id === activeId) return false;
  if (tab.isPlayingAudio) return false;
  // Either half of a split is on screen, so neither is a background tab.
  if (tab.id === splitLeftId || tab.id === splitRightId) return false;
  const url = tab.url || '';
  // Nothing to reclaim from a blank tab, and an internal page is cheap.
  if (!/^https?:/i.test(url)) return false;
  try { if (tab.wv.isLoading()) return false; } catch { return false; }
  return true;
}

function snoozeTab(tab) {
  if (!canSnooze(tab)) return false;

  tab.snoozedUrl = tab.url;
  tab.snoozed = true;
  tab.tabEl.classList.add('snoozed');
  tab.tabEl.title = (tab.title || tab.url) + ' — asleep, click to load';
  try { tab.wv.loadURL('about:blank'); } catch { tab.wv.setAttribute('src', 'about:blank'); }
  renderVtabs();
  return true;
}

function wakeTab(tab) {
  if (!tab || !tab.snoozed) return;
  const url = tab.snoozedUrl;
  tab.snoozed = false;
  tab.snoozedUrl = null;
  tab.tabEl.classList.remove('snoozed');
  tab.tabEl.removeAttribute('title');
  if (!url) return;
  try { tab.wv.loadURL(url); } catch { tab.wv.setAttribute('src', url); }
  renderVtabs();
}

function sweepSnooze() {
  const delay = snoozeDelayMs();
  if (!delay) return;
  const now = Date.now();
  for (const tab of tabs) {
    // A tab that has never been active has no clock yet — start it now
    // rather than snoozing something the moment it is restored from a
    // session, which would undo the restore.
    if (!tab.lastSeenAt) { tab.lastSeenAt = now; continue; }
    if (now - tab.lastSeenAt < delay) continue;
    snoozeTab(tab);
  }
}

setInterval(sweepSnooze, SNOOZE_SWEEP_MS);

/* ── Tab hover preview ───────────────────────────────────────────────────
   Rest on a tab and a thumbnail of that page appears beneath it. The point is
   the case Firefox built theirs for: nine tabs on the same site, all titled
   the same, and no way to tell them apart except by clicking each one.

   Three things keep it from being annoying:

     - It waits. HOVER_DELAY is long enough that crossing the strip on the way
       to the address bar never triggers it, and moving between two tabs while
       one is already open swaps instantly (the delay is only paid once).
     - It never covers the tab you are pointing at, and it clamps to the
       window rather than hanging off the edge.
     - It is pointer-transparent, so it cannot eat the click you were about
       to make on the tab underneath it.

   Captures are cached per tab and re-taken when the page navigates, because
   capturePage() on a background tab returns its last painted frame and that
   does not change while the tab sits there.
   ─────────────────────────────────────────────────────────────────────── */
const TAB_PREVIEW_DELAY   = 130;      // ms of stillness before the first one
const TAB_PREVIEW_MAX_AGE = 20000;    // ms before a cached shot is stale

const tabPreviewEl = document.getElementById('tab-preview');
let _tpTimer = null;
let _tpTab = null;
let _tpToken = 0;

function tabForEl(el) {
  return tabs.find((t) => t.tabEl === el) || null;
}

function hideTabPreview() {
  clearTimeout(_tpTimer);
  _tpTimer = null;
  _tpTab = null;
  _tpToken++;
  if (tabPreviewEl) {
    tabPreviewEl.hidden = true;
    tabPreviewEl.classList.remove('is-in');
  }
}

// Position under the tab, centred on it, clamped to the window.
function placeTabPreview(tabEl) {
  if (!tabPreviewEl) return;
  const r = tabEl.getBoundingClientRect();
  const w = tabPreviewEl.offsetWidth || 260;
  const margin = 8;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
  tabPreviewEl.style.left = Math.round(left) + 'px';
  tabPreviewEl.style.top = Math.round(r.bottom + 6) + 'px';
}

async function showTabPreview(tab) {
  if (!tabPreviewEl || !tab) return;
  const token = ++_tpToken;
  _tpTab = tab;

  const titleEl = document.getElementById('tab-preview-title');
  const hostEl  = document.getElementById('tab-preview-host');
  const imgEl   = document.getElementById('tab-preview-img');
  const fbEl    = document.getElementById('tab-preview-fallback');

  if (titleEl) titleEl.textContent = tab.title || newTabLabel();
  if (hostEl) {
    let host = '';
    try {
      host = tab.url?.startsWith('privoo://')
        ? 'Privoo'
        : new URL(tab.url).hostname.replace(/^www\./, '');
    } catch { host = ''; }
    hostEl.textContent = host;
    hostEl.hidden = !host;
  }

  // Show the card immediately with whatever shot we already have — waiting on
  // the capture before showing anything makes the whole thing feel broken on
  // the first hover of every tab.
  const cached = tab._previewShot && (Date.now() - tab._previewShotAt < TAB_PREVIEW_MAX_AGE)
    ? tab._previewShot : null;
  paintTabPreviewShot(cached, imgEl, fbEl);

  tabPreviewEl.hidden = false;
  placeTabPreview(tab.tabEl);
  requestAnimationFrame(() => {
    if (_tpToken === token) tabPreviewEl.classList.add('is-in');
  });

  if (cached) return;

  let wcId = 0;
  try { wcId = tab.wv?.getWebContentsId?.() || 0; } catch {}
  if (!wcId) return;
  let shot = null;
  try { shot = await window.privoo.captureTabPreview?.(wcId); } catch {}
  if (_tpToken !== token) return;      // pointer moved on while we waited
  if (!shot) return;
  tab._previewShot = shot;
  tab._previewShotAt = Date.now();
  paintTabPreviewShot(shot, imgEl, fbEl);
  placeTabPreview(tab.tabEl);          // the image changes the card's height
}

function paintTabPreviewShot(shot, imgEl, fbEl) {
  if (!imgEl || !fbEl) return;
  if (shot) {
    imgEl.src = shot;
    imgEl.hidden = false;
    fbEl.hidden = true;
  } else {
    imgEl.removeAttribute('src');
    imgEl.hidden = true;
    fbEl.hidden = false;
  }
}

// Take the capture NOW, before the delay, so the picture is usually already
// decoded by the time the card is shown. The delay is there to stop the card
// appearing when you are only passing over the strip — there is no reason for
// the network-free part of the work to wait for it too.
function warmTabPreview(tab, force) {
  if (!tab || tab._previewWarming) return;
  // On hover: keep what we have. On the way out of a tab: take a new one,
  // because what is on screen has just changed and the old shot is now a
  // picture of something you were doing a while ago.
  if (!force && tab._previewShot) return;
  let wcId = 0;
  try { wcId = tab.wv?.getWebContentsId?.() || 0; } catch {}
  if (!wcId) return;
  tab._previewWarming = true;
  Promise.resolve(window.privoo.captureTabPreview?.(wcId))
    .then((shot) => {
      tab._previewWarming = false;
      if (!shot) return;
      tab._previewShot = shot;
      tab._previewShotAt = Date.now();
      // Already on screen with the placeholder? Swap it in.
      if (_tpTab === tab) {
        paintTabPreviewShot(shot, document.getElementById('tab-preview-img'),
          document.getElementById('tab-preview-fallback'));
        placeTabPreview(tab.tabEl);
      }
    })
    .catch(() => { tab._previewWarming = false; });
}

function queueTabPreview(tabEl) {
  const tab = tabForEl(tabEl);
  if (!tab) return;
  if (_tpTab === tab) return;                 // already showing this one
  warmTabPreview(tab);
  clearTimeout(_tpTimer);
  // Once one preview is up, moving along the strip swaps without re-waiting.
  const delay = _tpTab ? 0 : TAB_PREVIEW_DELAY;
  _tpTimer = setTimeout(() => showTabPreview(tab), delay);
}

if (tabsEl && tabPreviewEl) {
  // Delegated, so it survives every re-render of the strip.
  tabsEl.addEventListener('mouseover', (e) => {
    if (settings?.tabHoverPreview === false) return;
    const tabEl = e.target.closest?.('.tab');
    if (!tabEl || !tabsEl.contains(tabEl)) return;
    queueTabPreview(tabEl);
  });
  tabsEl.addEventListener('mouseleave', hideTabPreview);
  // Anything that moves the strip, moves the tab, or takes over the window.
  tabsEl.addEventListener('mousedown', hideTabPreview);
  tabsEl.addEventListener('wheel', hideTabPreview, { passive: true });
  document.getElementById('tabs-scroll')?.addEventListener('scroll', hideTabPreview, { passive: true });
  window.addEventListener('blur', hideTabPreview);
  window.addEventListener('resize', hideTabPreview);
  // A guest page taking the pointer means the cursor left the chrome without
  // the strip ever seeing a mouseleave. That arrives as the 'guest-pointer'
  // ipc-message, which already routes to closePopovers() — hideTabPreview is
  // called from there.
}

// ─── Profile UI ──────────────────────────────────────────────────────────────

(function initProfileUI() {
  const profileBtn    = document.getElementById('profile-btn');
  const profilePanel  = document.getElementById('profile-panel');
  const avatarCircle  = document.getElementById('profile-avatar-btn');
  const initialsEl    = document.getElementById('profile-initials-btn');
  const imgEl         = document.getElementById('profile-img-btn');
  if (!profileBtn || !profilePanel) return;

  let _profiles = [];
  let _activeId = 'default';

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  // Buttons/inputs don't inherit font-family, and our floating popups are
  // appended to <html> (outside <body>'s font scope). Inject one rule that
  // forces the active interface font onto every profile-UI element. `.pp-pop`
  // is added to each floating overlay root below.
  (function injectFontRule() {
    const apply = () => {
      const f = getComputedStyle(document.body).fontFamily
        || '"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif';
      let s = document.getElementById('privoo-prof-font');
      if (!s) { s = document.createElement('style'); s.id = 'privoo-prof-font'; document.head.appendChild(s); }
      s.textContent = `#profile-panel, #profile-panel *, .pp-pop, .pp-pop * { font-family: ${f} !important; }`;
    };
    apply();
    // Re-apply if the user changes the interface font while the app is open.
    window.privoo?.onSettingsChanged?.(() => apply());
  })();

  // SOLID surface colours for our popups. We can't use --toolbar/--border here:
  // in Increase-Transparency / Liquid-Glass mode those become translucent, which
  // made the modal render as a faint see-through box. These are always opaque.
  function themeColors() {
    const dark = document.body.classList.contains('dark');
    return dark
      ? { surface: '#2a2b2f', text: '#e8eaed', muted: '#bdc1c6', border: 'rgba(255,255,255,0.14)', hover: 'rgba(255,255,255,0.08)', input: '#202020' }
      : { surface: '#ffffff', text: '#1f1f1f', muted: '#5f6368', border: '#dadce0', hover: '#f1f3f4', input: '#f3f4f6' };
  }
  const ACCENT = () => cssVar('--accent', '#4f46e5');

  // Styled confirmation dialog — replaces the native confirm() so the
  // "are you sure" matches the rest of the UI.
  function showConfirm({ title, message, confirmLabel = 'Delete', danger = true }) {
    return new Promise((resolve) => {
      const C = themeColors();
      const back = document.createElement('div');
      back.className = 'pp-pop';
      back.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
      const m = document.createElement('div');
      m.style.cssText = `width:300px;background:${C.surface};border:1px solid ${C.border};border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,0.5);`;
      const t = document.createElement('div');
      t.textContent = title;
      t.style.cssText = `font-size:16px;font-weight:700;color:${C.text};margin-bottom:8px;`;
      const msg = document.createElement('div');
      msg.textContent = message;
      msg.style.cssText = `font-size:13px;line-height:1.55;color:${C.muted};margin-bottom:20px;`;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;';
      const cancel = document.createElement('button');
      cancel.textContent = 'Cancel';
      cancel.style.cssText = `flex:1;padding:10px;border-radius:9px;border:1.5px solid ${C.border};background:transparent;color:${C.muted};font-size:13px;font-weight:600;cursor:pointer;`;
      cancel.onmouseenter = () => { cancel.style.background = C.hover; };
      cancel.onmouseleave = () => { cancel.style.background = 'transparent'; };
      const ok = document.createElement('button');
      ok.textContent = confirmLabel;
      ok.style.cssText = `flex:1;padding:10px;border-radius:9px;border:none;background:${danger ? '#d93025' : ACCENT()};color:#fff;font-size:13px;font-weight:600;cursor:pointer;`;
      const done = (v) => { back.remove(); resolve(v); };
      cancel.addEventListener('click', () => done(false));
      ok.addEventListener('click', () => done(true));
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(false); });
      row.appendChild(cancel); row.appendChild(ok);
      m.appendChild(t); m.appendChild(msg); m.appendChild(row);
      back.appendChild(m);
      document.documentElement.appendChild(back);
    });
  }

  // Stable colour palette for profile initials circles. The built-in "Default"
  // profile follows the browser's accent colour; others get a distinct palette
  // colour so they're easy to tell apart.
  const PALETTE = ['#e05c8a','#28b67a','#e08c2c','#9b59b6','#e74c3c','#1abc9c','#f39c12','#5b7fff'];
  // Everything drawn on this disc is white, and the Mono accent resolves to
  // #ffffff, so the built-in profile was white on white. Judged by luminance
  // rather than by testing for one hex value, because #fafafa would have been
  // just as invisible and would have come back as a new bug later.
  function safeDisc(hex) {
    const m = String(hex).trim().replace('#', '').match(/^([0-9a-f]{6})$/i);
    if (!m) return hex;
    const [r, g, b] = m[1].match(/.{2}/g).map((x) => parseInt(x, 16) / 255);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.72 ? '#6b7280' : hex;
  }

  function profileColor(id) {
    if (id === 'default') return safeDisc(cssVar('--accent', '#4f46e5'));
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function initials(name) {
    const parts = (name || 'P').trim().split(/\s+/);
    return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : (name[0] || 'P').toUpperCase();
  }

  // ── Photo cropper (drag to reposition, scroll / slider to zoom) ────────────
  function openCropper(src) {
    return new Promise((resolve) => {
      const C = themeColors();
      const back = document.createElement('div');
      back.className = 'pp-pop';
      back.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;';
      const panel = document.createElement('div');
      panel.style.cssText = `width:320px;background:${C.surface};border:1px solid ${C.border};border-radius:18px;padding:22px;box-shadow:0 24px 64px rgba(0,0,0,0.5);`;
      panel.innerHTML =
        `<div style="font-size:16px;font-weight:700;color:${C.text};text-align:center;margin-bottom:4px;">Adjust photo</div>` +
        `<div style="font-size:12px;color:${C.muted};text-align:center;margin-bottom:16px;">Drag to reposition · scroll or use the slider to zoom</div>` +
        '<div id="_cstage" style="width:240px;height:240px;margin:0 auto 16px;position:relative;overflow:hidden;border-radius:16px;background:#000;cursor:grab;touch-action:none;">' +
          '<img id="_cimg" alt="" draggable="false" style="position:absolute;top:0;left:0;max-width:none;-webkit-user-drag:none;user-select:none;" />' +
          '<div style="position:absolute;inset:0;border-radius:50%;pointer-events:none;box-shadow:0 0 0 240px rgba(0,0,0,0.55);border:2px solid rgba(255,255,255,0.85);"></div>' +
        '</div>' +
        `<input id="_czoom" type="range" min="1" max="3" step="0.01" value="1" style="width:100%;accent-color:${ACCENT()};margin-bottom:8px;" />` +
        '<div style="display:flex;gap:10px;margin-top:12px;">' +
          `<button id="_ccancel" style="flex:1;padding:11px;border-radius:10px;border:1px solid ${C.border};background:transparent;color:${C.muted};font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>` +
          `<button id="_capply" style="flex:1;padding:11px;border-radius:10px;border:none;background:${ACCENT()};color:${cssVar('--on-accent','#202020')};font-size:13px;font-weight:600;cursor:pointer;">Apply</button>` +
        '</div>';
      back.appendChild(panel);
      document.documentElement.appendChild(back);

      const stage = panel.querySelector('#_cstage');
      const img   = panel.querySelector('#_cimg');
      const zoom  = panel.querySelector('#_czoom');
      const V = 240;
      let iw = 0, ih = 0, base = 1, scale = 1, ox = 0, oy = 0, drag = null;

      function clamp() {
        const minx = V - iw * scale, miny = V - ih * scale;
        ox = Math.min(0, Math.max(minx, ox));
        oy = Math.min(0, Math.max(miny, oy));
      }
      function layout() {
        clamp();
        img.style.width = (iw * scale) + 'px';
        img.style.height = (ih * scale) + 'px';
        img.style.transform = `translate(${ox}px,${oy}px)`;
      }
      img.onload = () => {
        iw = img.naturalWidth; ih = img.naturalHeight;
        base = Math.max(V / iw, V / ih);
        scale = base;
        ox = (V - iw * scale) / 2; oy = (V - ih * scale) / 2;
        layout();
      };
      img.src = src;

      zoom.addEventListener('input', () => {
        const cx = V / 2, cy = V / 2;
        const px = (cx - ox) / scale, py = (cy - oy) / scale;
        scale = base * parseFloat(zoom.value);
        ox = cx - px * scale; oy = cy - py * scale;
        layout();
      });
      stage.addEventListener('wheel', (e) => {
        e.preventDefault();
        let z = parseFloat(zoom.value) + (e.deltaY < 0 ? 0.06 : -0.06);
        z = Math.min(3, Math.max(1, z));
        zoom.value = z; zoom.dispatchEvent(new Event('input'));
      }, { passive: false });
      stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; stage.setPointerCapture(e.pointerId); });
      stage.addEventListener('pointermove', (e) => { if (!drag) return; ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y); layout(); });
      stage.addEventListener('pointerup', () => { drag = null; });

      const done = (val) => { back.remove(); resolve(val); };
      panel.querySelector('#_ccancel').addEventListener('click', () => done(null));
      back.addEventListener('mousedown', (e) => { if (e.target === back) done(null); });
      panel.querySelector('#_capply').addEventListener('click', () => {
        const OUT = 256, s = OUT / V;
        const c = document.createElement('canvas'); c.width = OUT; c.height = OUT;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, OUT, OUT);
        ctx.drawImage(img, ox * s, oy * s, iw * scale * s, ih * scale * s);
        done(c.toDataURL('image/jpeg', 0.9));
      });
    });
  }

  function renderAvatarInto(container, imgEl, initialsEl, profile) {
    const color = profileColor(profile.id);
    container.style.setProperty('--profile-color', color);
    container.style.background = color;
    if (profile.avatar) {
      imgEl.src = profile.avatar;
      imgEl.style.display = 'block';
      initialsEl.style.display = 'none';
    } else if (profile.id === 'default') {
      // One built-in profile means a letter distinguishes it from nothing.
      imgEl.style.display = 'none';
      initialsEl.style.display = '';
      initialsEl.innerHTML = '<svg class="pp-person" viewBox="0 0 64 64" aria-hidden="true">' + '<circle cx="32" cy="24.5" r="11.2"/>' + '<path d="M32 39.5c-10.2 0-18.5 6.7-18.5 15V64h37v-9.5c0-8.3-8.3-15-18.5-15z"/>' + '</svg>';
    } else {
      imgEl.style.display = 'none';
      initialsEl.style.display = '';
      initialsEl.textContent = initials(profile.name);
    }
  }

  function activeProfile() {
    return _profiles.find((p) => p.id === _activeId) || { id: 'default', name: 'Default', avatar: '' };
  }

  function loadProfiles() {
    return window.privoo.profilesList().then(({ profiles, activeId }) => {
      _profiles = profiles;
      _activeId = activeId;
      const active = activeProfile();
      renderAvatarInto(avatarCircle, imgEl, initialsEl, active);
      // The toolbar button stays monochrome line art unless the profile has a
      // real picture; the coloured initials still identify it in the panel.
      if (active.avatar) {
        avatarCircle.querySelector('.pp-glyph')?.remove();
        avatarCircle.style.background = profileColor(active.id);
      } else {
        initialsEl.style.display = 'none';
        avatarCircle.style.background = 'transparent';
        avatarCircle.style.color = 'var(--muted)';
        if (!avatarCircle.querySelector('.pp-glyph')) {
          avatarCircle.insertAdjacentHTML('beforeend',
            `<svg class="pp-glyph" viewBox="0 0 24 24" width="18" height="18" ${SITE_ICON_STROKE}>` +
            '<circle cx="12" cy="8.4" r="3.6"/><path d="M5.5 19.4a6.5 6.5 0 0 1 13 0"/></svg>');
        }
      }
    }).catch(() => {});
  }

  // ── Panel render ──────────────────────────────────────────────────────────
  function rowButton(svg, label) {
    const btn = document.createElement('button');
    btn.style.cssText = 'width:100%;padding:10px 14px;display:flex;align-items:center;gap:12px;background:transparent;border:none;cursor:pointer;color:var(--text);font-size:13px;border-radius:10px;transition:background .12s;text-align:left;';
    btn.onmouseenter = () => { btn.style.background = 'var(--hover)'; };
    btn.onmouseleave = () => { btn.style.background = ''; };
    const icon = document.createElement('div');
    icon.style.cssText = 'width:32px;height:32px;border-radius:50%;background:var(--hover);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--muted);';
    icon.innerHTML = svg;
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(label));
    return btn;
  }

  function buildPanel() {
    profilePanel.innerHTML = '';

    // ── Current profile hero ──
    const hero = document.createElement('div');
    hero.style.cssText = 'padding:16px 16px 14px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);';

    const cur = activeProfile();
    const heroCircle = document.createElement('div');
    heroCircle.style.cssText = `width:46px;height:46px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff;background:${profileColor(cur.id)};`;
    const heroImg = document.createElement('img'); heroImg.alt = ''; heroImg.style.cssText = 'display:none;width:100%;height:100%;object-fit:cover;';
    const heroInit = document.createElement('span');
    renderAvatarInto(heroCircle, heroImg, heroInit, cur);
    heroCircle.appendChild(heroImg); heroCircle.appendChild(heroInit);

    const heroText = document.createElement('div');
    heroText.style.cssText = 'flex:1;min-width:0;';
    const heroName = document.createElement('div');
    heroName.textContent = cur.name;
    heroName.style.cssText = 'font-size:15px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    const heroSub = document.createElement('div');
    heroSub.textContent = 'Active profile';
    heroSub.style.cssText = 'font-size:11px;color:var(--muted);margin-top:2px;';
    heroText.appendChild(heroName); heroText.appendChild(heroSub);

    const editBtn = document.createElement('button');
    editBtn.textContent = 'Edit';
    editBtn.style.cssText = 'padding:5px 12px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;cursor:pointer;white-space:nowrap;transition:background .12s;';
    editBtn.onmouseenter = () => { editBtn.style.background = 'var(--hover)'; };
    editBtn.onmouseleave = () => { editBtn.style.background = 'transparent'; };
    editBtn.addEventListener('click', () => { closePanel(); showEditModal(cur); });

    hero.appendChild(heroCircle); hero.appendChild(heroText); hero.appendChild(editBtn);

    // ── Other profiles list ──
    const others = _profiles.filter((p) => p.id !== _activeId);
    let listEl = null;
    if (others.length) {
      listEl = document.createElement('div');
      listEl.style.cssText = 'padding:6px;border-bottom:1px solid var(--border);';
      const listLabel = document.createElement('div');
      listLabel.textContent = 'Switch to';
      listLabel.style.cssText = 'padding:4px 10px 4px;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;';
      listEl.appendChild(listLabel);

      for (const p of others) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px 10px;cursor:pointer;border-radius:10px;transition:background .12s;';
        row.onmouseenter = () => { row.style.background = 'var(--hover)'; };
        row.onmouseleave = () => { row.style.background = ''; };

        const rc = document.createElement('div');
        rc.style.cssText = `width:32px;height:32px;border-radius:50%;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;background:${profileColor(p.id)};`;
        const ri = document.createElement('img'); ri.alt = ''; ri.style.cssText = 'display:none;width:100%;height:100%;object-fit:cover;';
        const rn = document.createElement('span');
        renderAvatarInto(rc, ri, rn, p);
        rc.appendChild(ri); rc.appendChild(rn);

        const rname = document.createElement('div');
        rname.textContent = p.name;
        rname.style.cssText = 'font-size:13px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;';

        row.appendChild(rc); row.appendChild(rname);
        row.addEventListener('click', () => { closePanel(); switchProfile(p.id); });
        listEl.appendChild(row);
      }
    }

    // ── Actions ──
    const actions = document.createElement('div');
    actions.style.cssText = 'padding:6px;';

    const guestBtn = rowButton('<svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 10c3.31 0 8 1.34 8 4v2H4v-2c0-2.66 4.69-4 8-4z"/></svg>', 'Open Guest window');
    guestBtn.addEventListener('click', () => { closePanel(); window.privoo.openIncognitoWindow?.(); });

    const addBtn = rowButton('<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>', 'Add profile');
    addBtn.addEventListener('click', () => { closePanel(); showCreateModal(); });

    const manageBtn = rowButton('<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-4.42 0-8 1.79-8 4v2h16v-2c0-2.21-3.58-4-8-4z"/></svg>', 'Manage profiles');
    manageBtn.addEventListener('click', () => { closePanel(); window.privoo.profileOpenPicker?.(); });

    actions.appendChild(guestBtn);
    actions.appendChild(addBtn);
    actions.appendChild(manageBtn);

    profilePanel.appendChild(hero);
    if (listEl) profilePanel.appendChild(listEl);
    profilePanel.appendChild(actions);
  }

  // ── Open / close panel ────────────────────────────────────────────────────
  function openPanel() {
    buildPanel();
    profilePanel.classList.remove('hidden');
  }
  function closePanel() {
    profilePanel.classList.add('hidden');
  }

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (profilePanel.classList.contains('hidden')) openPanel(); else closePanel();
  });
  document.addEventListener('click', (e) => {
    if (!profilePanel.classList.contains('hidden') && !profilePanel.contains(e.target) && !profileBtn.contains(e.target)) closePanel();
  });

  // ── Profile switch ────────────────────────────────────────────────────────
  function switchProfile(id) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#fff;font-size:14px;';
    overlay.textContent = 'Switching profile…';
    document.documentElement.appendChild(overlay);
    window.privoo.profileSwitch(id).catch(() => overlay.remove());
  }

  // ── Create / Edit modal ───────────────────────────────────────────────────
  function showProfileModal({ title, profile = null, onSave }) {
    let pendingAvatar = profile?.avatar || '';
    const C = themeColors();

    const backdrop = document.createElement('div');
    backdrop.className = 'pp-pop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';

    const modal = document.createElement('div');
    modal.style.cssText = `background:${C.surface};border:1px solid ${C.border};border-radius:18px;padding:26px 24px 22px;width:320px;box-shadow:0 24px 64px rgba(0,0,0,0.5);`;

    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.cssText = `font-size:18px;font-weight:700;color:${C.text};margin-bottom:4px;text-align:center;`;

    const sub = document.createElement('div');
    sub.textContent = profile ? 'Update the name or photo for this profile.' : 'Give it a name and an optional photo.';
    sub.style.cssText = `font-size:12.5px;color:${C.muted};margin-bottom:20px;text-align:center;`;

    // Avatar picker
    const avatarWrap = document.createElement('div');
    avatarWrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:9px;margin-bottom:20px;';
    const avatarCircleM = document.createElement('div');
    const initColor = profile ? profileColor(profile.id) : PALETTE[Math.floor(Math.random() * PALETTE.length)];
    avatarCircleM.style.cssText = `width:96px;height:96px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700;color:#fff;background:${initColor};cursor:pointer;position:relative;box-shadow:0 0 0 4px ${cssVar('--accent-soft','rgba(138,180,248,.18)')};`;
    const avatarImgM = document.createElement('img'); avatarImgM.alt = ''; avatarImgM.style.cssText = 'display:none;width:100%;height:100%;object-fit:cover;position:absolute;inset:0;';
    const avatarInitM = document.createElement('span'); avatarInitM.textContent = profile ? initials(profile.name) : 'N';
    const avatarHover = document.createElement('div');
    avatarHover.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:2px;align-items:center;justify-content:center;opacity:0;transition:opacity .15s;border-radius:50%;color:#fff;font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;';
    avatarHover.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="#fff"><path d="M9 3l-1.83 2H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg><span>Change</span>';
    avatarCircleM.onmouseenter = () => { avatarHover.style.opacity = '1'; };
    avatarCircleM.onmouseleave = () => { avatarHover.style.opacity = '0'; };
    avatarCircleM.appendChild(avatarImgM); avatarCircleM.appendChild(avatarInitM); avatarCircleM.appendChild(avatarHover);

    if (pendingAvatar) {
      avatarImgM.src = pendingAvatar; avatarImgM.style.display = 'block'; avatarInitM.style.display = 'none';
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
    fileInput.addEventListener('change', () => {
      const f = fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const cropped = await openCropper(ev.target.result);
        if (cropped) {
          pendingAvatar = cropped;
          avatarImgM.src = pendingAvatar; avatarImgM.style.display = 'block'; avatarInitM.style.display = 'none';
        }
      };
      reader.readAsDataURL(f);
      fileInput.value = '';
    });
    avatarCircleM.addEventListener('click', () => fileInput.click());

    const avatarHint = document.createElement('div');
    avatarHint.textContent = 'Click to choose a photo';
    avatarHint.style.cssText = `font-size:11.5px;color:${C.muted};`;
    avatarWrap.appendChild(avatarCircleM); avatarWrap.appendChild(avatarHint); avatarWrap.appendChild(fileInput);

    // Name input
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Profile name';
    nameLabel.style.cssText = `display:block;font-size:11px;font-weight:600;color:${C.muted};text-transform:uppercase;letter-spacing:.06em;margin-bottom:7px;`;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = profile?.name || '';
    nameInput.placeholder = 'e.g. Work, Personal, School';
    nameInput.maxLength = 40;
    nameInput.style.cssText = `width:100%;box-sizing:border-box;padding:11px 13px;border-radius:10px;border:1.5px solid ${C.border};background:${C.input};color:${C.text};font-size:14px;outline:none;transition:border-color .14s;`;
    nameInput.onfocus = () => { nameInput.style.borderColor = ACCENT(); };
    nameInput.onblur = () => { nameInput.style.borderColor = C.border; };
    nameInput.addEventListener('input', () => {
      if (!pendingAvatar) avatarInitM.textContent = nameInput.value ? initials(nameInput.value) : 'N';
    });

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;margin-top:24px;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `flex:1;padding:11px;border-radius:10px;border:1.5px solid ${C.border};background:transparent;color:${C.muted};font-size:13.5px;font-weight:600;cursor:pointer;transition:background .12s;`;
    cancelBtn.onmouseenter = () => { cancelBtn.style.background = C.hover; };
    cancelBtn.onmouseleave = () => { cancelBtn.style.background = 'transparent'; };
    const saveBtn = document.createElement('button');
    saveBtn.textContent = profile ? 'Save' : 'Create';
    saveBtn.style.cssText = `flex:1;padding:11px;border-radius:10px;border:none;background:${ACCENT()};color:${cssVar('--on-accent','#202020')};font-size:13.5px;font-weight:600;cursor:pointer;`;

    // Delete (edit only, non-default profiles)
    let deleteBtn = null;
    if (profile && profile.id !== 'default') {
      deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete this profile';
      deleteBtn.style.cssText = 'width:100%;margin-top:12px;padding:10px;border-radius:10px;border:1.5px solid rgba(217,48,37,0.35);background:transparent;color:#e0556b;font-size:12.5px;cursor:pointer;transition:background .12s;';
      deleteBtn.onmouseenter = () => { deleteBtn.style.background = 'rgba(217,48,37,0.1)'; };
      deleteBtn.onmouseleave = () => { deleteBtn.style.background = 'transparent'; };
      deleteBtn.addEventListener('click', async () => {
        const yes = await showConfirm({
          title: 'Delete profile?',
          message: `"${profile.name}" and all its history, logins and settings will be permanently erased.`,
          confirmLabel: 'Delete',
        });
        if (!yes) return;
        backdrop.remove();
        window.privoo.profileDelete(profile.id)
          .then(() => loadProfiles())
          .catch(() => {});
      });
    }

    const close = () => backdrop.remove();
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      close();
      onSave({ name, avatar: pendingAvatar }).then(() => loadProfiles()).catch(() => {});
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveBtn.click(); });

    btnRow.appendChild(cancelBtn); btnRow.appendChild(saveBtn);
    modal.appendChild(heading);
    modal.appendChild(sub);
    modal.appendChild(avatarWrap);
    modal.appendChild(nameLabel);
    modal.appendChild(nameInput);
    modal.appendChild(btnRow);
    if (deleteBtn) modal.appendChild(deleteBtn);
    backdrop.appendChild(modal);
    document.documentElement.appendChild(backdrop);
    setTimeout(() => nameInput.focus(), 50);
  }

  function showCreateModal() {
    showProfileModal({
      title: 'Create profile',
      onSave: ({ name, avatar }) => window.privoo.profileCreate({ name, avatar }),
    });
  }

  function showEditModal(profile) {
    showProfileModal({
      title: 'Edit profile',
      profile,
      onSave: ({ name, avatar }) => window.privoo.profileUpdate({ id: profile.id, name, avatar }),
    });
  }

  loadProfiles();
})();

// ─── Inline AI Panel ─────────────────────────────────────────────────────────

let _aiPanelInited = false;
let _aiConfig = { provider: 'anthropic', model: 'claude-sonnet-4-6', hasKey: false, hasKeyFor: {}, accepted: false };
let _aiMessages = [];
let _aiBusy = false;
// Persisted chat history (kept in localStorage on this device).
const AI_STORE_KEY = 'privoo-ai-chats-v1';
let _aiConvos = [];       // [{ id, title, messages:[{role,content}], updatedAt }]
let _aiCurrentId = null;  // id of the conversation currently on screen (null = unsaved new chat)
// Assistant avatar = the Privoo logo (falls back to "AI" text if it won't load).
const AI_AVATAR_HTML = '<img class="ai-av-img" src="privoo://newtab/logo.png" alt="AI" draggable="false" onerror="this.replaceWith(document.createTextNode(\'AI\'))">';

const AI_MODELS = {
  anthropic: [
    { id: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6, balanced (recommended)' },
    { id: 'claude-opus-4-7',            label: 'Claude Opus 4.7, most capable' },
    { id: 'claude-haiku-4-5-20251001',  label: 'Claude Haiku 4.5, fastest' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022',  label: 'Claude 3.5 Haiku' },
  ],
  openai: [
    { id: 'gpt-4o-mini',   label: 'GPT-4o mini, fast and low cost (recommended)' },
    { id: 'gpt-4o',        label: 'GPT-4o, flagship' },
    { id: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
    { id: 'gpt-4.1-mini',  label: 'GPT-4.1 mini' },
    { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo, cheapest' },
  ],
  deepseek: [
    { id: 'deepseek-chat',       label: 'DeepSeek V3, general chat (recommended)' },
    { id: 'deepseek-v4-flash',   label: 'DeepSeek V4 Flash, fast and low cost' },
    { id: 'deepseek-v4-pro',     label: 'DeepSeek V4 Pro, most capable' },
    { id: 'deepseek-reasoner',   label: 'DeepSeek R1, step by step reasoning' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash, fast (recommended)' },
    { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro, most capable' },
    { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro' },
  ],
  // Ollama models are discovered at runtime from the local server.
  ollama: [],
};
const AI_DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o-mini',
  deepseek:  'deepseek-chat',
  gemini:    'gemini-2.0-flash',
  ollama:    '',
};
const AI_KEY_HINTS = {
  anthropic: 'Get a key from <b>console.anthropic.com</b>',
  openai:    'Get a key from <b>platform.openai.com</b>',
  deepseek:  'Get a key from <b>platform.deepseek.com</b>',
  gemini:    'Get a key from <b>aistudio.google.com</b>',
  ollama:    'Runs locally. No key needed.',
};
const AI_PROVIDER_LABELS = { anthropic: 'Claude', openai: 'GPT (OpenAI)', deepseek: 'DeepSeek', gemini: 'Gemini', ollama: 'Ollama (Local)' };

function _aiEl(id) { return document.getElementById(id); }

// ── Chat history (localStorage) ──────────────────────────────────────────────
function _aiLoadConvos() {
  try {
    const raw = JSON.parse(localStorage.getItem(AI_STORE_KEY));
    _aiConvos = Array.isArray(raw) ? raw : [];
  } catch { _aiConvos = []; }
}
function _aiSaveConvos() {
  try { localStorage.setItem(AI_STORE_KEY, JSON.stringify(_aiConvos.slice(0, 100))); } catch {}
}
function _aiNewId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// Sync the on-screen messages into the current conversation (creating it on the
// first message), retitle it from the first user line, and float it to the top.
function _aiPersistCurrent() {
  const msgs = _aiMessages.filter(m => m.role === 'user' || m.role === 'assistant')
                          .map(m => ({ role: m.role, content: m.content }));
  if (!msgs.length) return;
  let convo = _aiConvos.find(c => c.id === _aiCurrentId);
  if (!convo) {
    convo = { id: _aiCurrentId || _aiNewId(), title: '', messages: [], updatedAt: 0 };
    _aiCurrentId = convo.id;
  }
  convo.messages = msgs;
  const firstUser = msgs.find(m => m.role === 'user');
  convo.title = (firstUser ? firstUser.content : 'New chat').replace(/\s+/g, ' ').trim().slice(0, 60) || 'New chat';
  convo.updatedAt = Date.now();
  _aiConvos = [convo, ..._aiConvos.filter(c => c.id !== convo.id)];
  _aiSaveConvos();
  _aiRenderHistory();
}

function _aiNewChat() {
  if (_aiBusy) return;
  _aiMessages = [];
  _aiCurrentId = null;       // a fresh conversation is created on first send
  _aiRenderChat();
  _aiRenderHistory();
  _aiEl('ai-input')?.focus();
}
function _aiOpenConvo(id) {
  const c = _aiConvos.find(x => x.id === id);
  if (!c) return;
  _aiCurrentId = id;
  _aiMessages = (c.messages || []).map(m => ({ role: m.role, content: m.content }));
  _aiRenderChat();
  _aiRenderHistory();
  _aiEl('ai-input')?.focus();
}
function _aiDeleteConvo(id) {
  _aiConvos = _aiConvos.filter(c => c.id !== id);
  _aiSaveConvos();
  if (_aiCurrentId === id) { _aiCurrentId = null; _aiMessages = []; _aiRenderChat(); }
  _aiRenderHistory();
}

function _aiRelTime(ts) {
  const d = Date.now() - (ts || 0), m = 60000, h = 3600000, day = 86400000;
  if (d < m) return 'just now';
  if (d < h) return Math.floor(d / m) + 'm ago';
  if (d < day) return Math.floor(d / h) + 'h ago';
  if (d < day * 7) return Math.floor(d / day) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function _aiRenderHistory() {
  const list = _aiEl('ai-history-list');
  if (!list) return;
  list.innerHTML = '';
  if (!_aiConvos.length) {
    const e = document.createElement('div');
    e.className = 'ai-hist-empty';
    e.textContent = 'No conversations yet';
    list.appendChild(e);
    return;
  }
  for (const c of _aiConvos) {
    const item = document.createElement('div');
    item.className = 'ai-hist-item' + (c.id === _aiCurrentId ? ' active' : '');

    const open = document.createElement('button');
    open.type = 'button'; open.className = 'ai-hist-open';
    const title = document.createElement('span'); title.className = 'ai-hist-title';
    title.textContent = c.title || 'New chat';
    const time = document.createElement('span'); time.className = 'ai-hist-time';
    time.textContent = _aiRelTime(c.updatedAt);
    open.appendChild(title); open.appendChild(time);
    open.addEventListener('click', () => _aiOpenConvo(c.id));

    const del = document.createElement('button');
    del.type = 'button'; del.className = 'ai-hist-del'; del.title = 'Delete chat';
    del.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>';
    del.addEventListener('click', (e) => { e.stopPropagation(); _aiDeleteConvo(c.id); });

    item.appendChild(open); item.appendChild(del);
    list.appendChild(item);
  }
}
function _aiToggleSidebar() { _aiEl('ai-sidebar')?.classList.toggle('collapsed'); }

// ── Minimal, safe markdown for assistant replies ─────────────────────────────
function _aiEscapeHtml(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Inline + block formatting for a (non-code) segment that is already escaped.
function _aiRenderInline(s) {
  s = s.replace(/`([^`]+)`/g, '<code class="ai-ic">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(?:^|\n)((?:[ \t]*[-*] .*(?:\n|$))+)/g, (_m, blk) => {
    const items = blk.trim().split('\n')
      .map(l => '<li>' + l.replace(/^[ \t]*[-*]\s+/, '') + '</li>').join('');
    return '\n<ul class="ai-ul">' + items + '</ul>\n';
  });
  return s.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (/^<ul/.test(p)) return p;
    return '<p>' + p.replace(/\n/g, '<br>') + '</p>';
  }).join('');
}
function _aiRenderMd(text) {
  // Split on fenced code so code is escaped and never run through inline rules.
  const segs = String(text).split('```');
  let html = '';
  for (let i = 0; i < segs.length; i++) {
    if (i % 2 === 1) {
      const code = segs[i].replace(/^[^\n]*\n/, '');   // drop the optional language line
      html += '<pre class="ai-code"><code>' + _aiEscapeHtml(code.replace(/\n$/, '')) + '</code></pre>';
    } else if (segs[i]) {
      html += _aiRenderInline(_aiEscapeHtml(segs[i]));
    }
  }
  return html;
}

function _aiModelLabel(provider, modelId) {
  const m = (AI_MODELS[provider] || []).find(x => x.id === modelId);
  return m ? m.label.split(', ')[0] : (modelId || '');
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
    o.value = selected; o.textContent = selected + ' (saved)';
    sel.appendChild(o);
  }
  sel.value = selected || AI_DEFAULT_MODELS[provider] || (list[0]?.id) || '';
}

// Probe the local Ollama server and fill the model dropdown with whatever is
// installed — no API key, runs offline.
async function _aiLoadOllama(selected) {
  const hint = _aiEl('ai-model-hint');
  if (hint) hint.textContent = 'Scanning for Ollama…';
  let info = { running: false, models: [] };
  try { info = await window.privoo.aiDetectOllama(); } catch {}
  AI_MODELS.ollama = (info.models || []).map(n => ({ id: n, label: n }));
  _aiFillModels('ollama', selected);
  if (!hint) return;
  if (!info.running) {
    hint.innerHTML = 'Ollama not detected. Install it from <b>ollama.com</b>, start it, then click <b>Re-scan</b>.';
  } else if (!AI_MODELS.ollama.length) {
    hint.innerHTML = 'Ollama is running, but no models are installed. Run <b>ollama pull llama3.2</b>, then <b>Re-scan</b>.';
  } else {
    const n = AI_MODELS.ollama.length;
    hint.innerHTML = 'Found <b>' + n + '</b> local model' + (n > 1 ? 's' : '') + '. They run fully offline on this device.';
  }
}

// Show the right controls for the chosen provider (Ollama hides the API-key
// field and auto-detects local models; others use a key + fixed model list).
function _aiApplyProviderUI(provider, selected) {
  const isOllama = provider === 'ollama';
  const keyField = _aiEl('ai-apikey-field');
  if (keyField) keyField.style.display = isOllama ? 'none' : '';
  const rescan = _aiEl('ai-ollama-rescan');
  if (rescan) rescan.style.display = isOllama ? '' : 'none';
  if (isOllama) {
    _aiLoadOllama(selected || '');
  } else {
    _aiFillModels(provider, selected);
    const hint = _aiEl('ai-model-hint');
    if (hint) hint.innerHTML = AI_KEY_HINTS[provider] || '';
    const keyInp = _aiEl('ai-apikey');
    if (keyInp) keyInp.placeholder = _aiConfig.hasKeyFor?.[provider] ? 'Key saved. Leave blank to keep it' : 'Paste your key';
  }
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
    text.textContent = 'No API key. Click Setup';
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
      '<div class="ai-empty-mark"><img src="privoo://newtab/logo.png" alt="" draggable="false" onerror="this.style.display=\'none\'"></div>' +
      '<h3>How can I help?</h3>' +
      '<p>Explanations, summaries, ideas, code. Answered by the AI you chose. Chats stay on this device.</p>' +
      '<div class="ai-chips" id="ai-chips"></div>';
    inner.appendChild(e);
    // Real opening lines, not labels. "Brainstorm ideas: " in the box left
    // you to write the actual question anyway — the same blank page with an
    // extra step in front of it.
    const STARTERS = [
      ['Explain something', 'Explain how HTTPS actually works, in plain English.'],
      ['Summarise', 'Summarise this in five bullet points:\n\n'],
      ['Get unstuck', 'I am trying to '],
      ['Write some code', 'Write a small script that '],
    ];
    for (const [label, prompt] of STARTERS) {
      const b = document.createElement('button');
      b.className = 'ai-chip'; b.type = 'button'; b.textContent = label;
      b.addEventListener('click', () => {
        const inp = _aiEl('ai-input');
        if (!inp) return;
        inp.value = prompt;
        inp.focus();
        // Caret at the end, so a half-written starter can be typed into
        // rather than selected past first.
        inp.setSelectionRange(prompt.length, prompt.length);
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      });
      e.querySelector('#ai-chips').appendChild(b);
    }
    return;
  }
  for (const m of _aiMessages) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-msg ' + (m.role === 'user' ? 'ai-user' : m.role === 'err' ? 'ai-err' : 'ai-assistant');
    const av = document.createElement('div'); av.className = 'ai-av';
    if (m.role === 'user') av.textContent = 'You';
    else if (m.role === 'err') av.textContent = '!';
    else av.innerHTML = AI_AVATAR_HTML;
    const b = document.createElement('div'); b.className = 'ai-bubble';
    if (m.role === 'assistant') b.innerHTML = _aiRenderMd(m.content);
    else b.textContent = m.content;
    wrap.appendChild(av); wrap.appendChild(b);
    inner.appendChild(wrap);
  }
  const area = _aiEl('ai-chat-area');
  if (area) area.scrollTop = area.scrollHeight;
}

// Privoo AI runs third-party models with no reliable knowledge of Privoo itself,
// so questions about the browser tend to be answered with confident nonsense.
// We catch those and warn instead of sending.
function _aiIsAboutPrivoo(text) {
  const t = text.toLowerCase();
  if (!/\bprivoo\b/.test(t)) return false;
  return /\b(privoo)\b.*\b(browser|app|feature|setting|version|made|built|who|what|how|why|when|company|owner|developer|safe|secure|privacy|vpn|tor|proxy|update)\b/.test(t)
      || /\b(browser|app|who|what|how|tell me|about|is|are|does|do)\b.*\bprivoo\b/.test(t);
}

const _aiAttached = [];

function _aiFmtChars(n) {
  return n < 1000 ? n + ' chars' : Math.round(n / 1000) + 'k chars';
}

function _aiRenderAttachments() {
  const wrap = _aiEl('ai-attachments');
  if (!wrap) return;
  wrap.hidden = _aiAttached.length === 0;
  wrap.innerHTML = '';
  _aiAttached.forEach((a, idx) => {
    const chip = document.createElement('div');
    chip.className = 'ai-att-chip';
    const name = document.createElement('span');
    name.className = 'ai-att-name';
    name.textContent = a.name;
    name.title = a.name;
    const meta = document.createElement('span');
    meta.className = 'ai-att-meta';
    meta.textContent = _aiFmtChars(a.chars || (a.text || '').length) + (a.truncated ? ' · trimmed' : '');
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ai-att-x';
    x.textContent = '\u00d7';
    x.title = 'Remove';
    x.addEventListener('click', () => { _aiAttached.splice(idx, 1); _aiRenderAttachments(); });
    chip.append(name, meta, x);
    wrap.appendChild(chip);
  });
}

/** Text block for the attached files, then clears them. */
function _aiTakeAttachments() {
  if (!_aiAttached.length) return '';
  const blocks = _aiAttached.map((a) =>
    '--- Attached file: ' + a.name + (a.truncated ? ' (trimmed) ' : ' ') + '---\n' + a.text);
  _aiAttached.length = 0;
  _aiRenderAttachments();
  return blocks.join('\n\n') + '\n\n';
}

function _aiAcceptAttachment(res) {
  if (!res) return;                       // cancelled
  if (!res.ok) { _aiAttachError(res.error || 'Could not read that file.'); return; }
  _aiAttached.push(res);
  _aiRenderAttachments();
}

// Failures show as a chip rather than a toast: it sits with the other
// attachments, where the user is already looking.
function _aiAttachError(message) {
  const wrap = _aiEl('ai-attachments');
  if (!wrap) return;
  wrap.hidden = false;
  const chip = document.createElement('div');
  chip.className = 'ai-att-chip error';
  const name = document.createElement('span');
  name.className = 'ai-att-name';
  name.textContent = message;
  name.title = message;
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'ai-att-x';
  x.textContent = '\u00d7';
  x.addEventListener('click', () => {
    chip.remove();
    if (!_aiAttached.length && !wrap.children.length) wrap.hidden = true;
  });
  chip.append(name, x);
  wrap.appendChild(chip);
}

function _aiWireAttachments() {
  const btn = _aiEl('ai-attach');
  if (btn && !btn._privooWired) {
    btn._privooWired = true;
    btn.addEventListener('click', async () => {
      if (typeof window.privoo?.aiAttachFile !== 'function') {
        _aiAttachError("File attachments aren't available in this build.");
        return;
      }
      btn.disabled = true;
      try { _aiAcceptAttachment(await window.privoo.aiAttachFile()); }
      catch (err) {
        _aiAttachError('Could not open the file picker' + (err?.message ? ': ' + err.message : '.'));
      } finally { btn.disabled = false; }
    });
  }

  // Drag a file straight onto the composer, same as the full page.
  const box = document.querySelector('.ai-composer-box');
  if (box && !box._privooWired) {
    box._privooWired = true;
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('dropping'); });
    box.addEventListener('dragleave', () => box.classList.remove('dropping'));
    box.addEventListener('drop', async (e) => {
      e.preventDefault();
      box.classList.remove('dropping');
      for (const f of Array.from(e.dataTransfer?.files || [])) {
        const fp = f.path;   // Electron exposes the real path on dropped files
        if (!fp) { _aiAttachError('Could not read that file.'); continue; }
        try { _aiAcceptAttachment(await window.privoo.aiExtractFile(fp)); }
        catch { _aiAttachError('Could not read that file.'); }
      }
    });
  }
}

async function _aiSend() {
  if (_aiBusy) return;
  const inp = _aiEl('ai-input');
  const text = inp?.value?.trim();
  // An attachment on its own is a perfectly good message ("summarise this").
  if (!text && !_aiAttached.length) return;

  // Block questions about Privoo itself — the model will likely make things up.
  if (text && _aiIsAboutPrivoo(text)) {
    _aiMessages.push({ role: 'user', content: text });
    _aiMessages.push({ role: 'err', content: '⚠ Privoo AI can\'t reliably answer questions about Privoo itself. It uses third-party models that don\'t have accurate info about this browser, so it may make things up. For real answers, check Settings → About or the Privoo website. (Message not sent.)' });
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }
    _aiRenderChat();
    _aiPersistCurrent();
    return;
  }

  if (!_aiConfig.hasKey) {
    _aiMessages.push({ role: 'err', content: '⚠ Add your API key first. Click Setup.' });
    _aiRenderChat();
    _aiOpenGate();
    return;
  }
  const attachedNames = _aiAttached.map((a) => a.name);
  const attachedText = _aiTakeAttachments();
  const shown = text || ('Attached: ' + attachedNames.join(', '));
  _aiMessages.push({ role: 'user', content: shown, attachments: attachedNames });
  if (inp) { inp.value = ''; inp.style.height = 'auto'; }
  _aiRenderChat();
  _aiPersistCurrent();

  const payloadMsgs = _aiMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));
  // Send the file text with THIS message only — the transcript keeps the short
  // version, so re-sending history does not repeat the whole document.
  if (attachedText && payloadMsgs.length) {
    const last = payloadMsgs[payloadMsgs.length - 1];
    last.content = attachedText + (text || 'Please look at the attached file(s).');
  }

  _aiBusy = true;
  const sendBtn = _aiEl('ai-send');
  if (sendBtn) sendBtn.disabled = true;
  const area = _aiEl('ai-chat-area');

  // Create the reply bubble right away with a blinking caret (no "..." dots).
  const assistant = { role: 'assistant', content: '' };
  _aiMessages.push(assistant);
  _aiRenderChat();
  const bubble = _aiEl('ai-chat-inner')?.lastElementChild?.querySelector('.ai-bubble');
  if (bubble) bubble.innerHTML = '<span class="ai-caret"></span>';

  // Smooth typewriter: tokens land in `pending`; a steady timer reveals them so
  // the reply always types out, even if the backend delivers it in big bursts.
  let pending = '', finished = false;
  const typer = new Promise((resolve) => {
    const iv = setInterval(() => {
      if (pending.length) {
        const n = Math.max(2, Math.ceil(pending.length / 40));   // speed up on big backlogs
        assistant.content += pending.slice(0, n);
        pending = pending.slice(n);
        if (bubble) bubble.innerHTML = _aiRenderMd(assistant.content) + '<span class="ai-caret"></span>';
        if (area) area.scrollTop = area.scrollHeight;
      } else if (finished) {
        clearInterval(iv);
        resolve();
      }
    }, 16);
  });

  let res;
  try {
    res = await window.privoo.aiChatStream({ messages: payloadMsgs }, (delta) => { if (delta) pending += delta; });
  } catch (e) { res = { ok: false, error: String(e?.message || e) }; }

  if (res?.ok) {
    const fullText = res.text || (assistant.content + pending) || '(empty response)';
    pending = fullText.slice(assistant.content.length);   // queue whatever isn't typed yet
    finished = true;
    await typer;                                          // let it finish typing out
    assistant.content = fullText;
  } else {
    pending = ''; finished = true;
    await typer;
    _aiMessages = _aiMessages.filter(m => m !== assistant);   // drop the empty reply bubble
    if (res?.error === 'NO_KEY') {
      _aiMessages.push({ role: 'err', content: '⚠ Add your API key first. Click Setup.' });
      _aiOpenGate();
    } else {
      _aiMessages.push({ role: 'err', content: '⚠ ' + (res?.error || 'Request failed.') });
    }
  }

  _aiBusy = false;
  if (sendBtn) sendBtn.disabled = false;
  _aiRenderChat();        // final clean render — drops the caret
  _aiPersistCurrent();
}

function _aiOpenGate() {
  const gate = _aiEl('ai-gate');
  if (!gate) return;
  const provSel = _aiEl('ai-provider');
  if (provSel) provSel.value = _aiConfig.provider;
  const keyInp = _aiEl('ai-apikey');
  if (keyInp) keyInp.value = '';
  _aiApplyProviderUI(_aiConfig.provider, _aiConfig.model);
  const title = _aiEl('ai-gate-title');
  if (title) title.textContent = _aiConfig.hasKey ? 'AI settings' : 'Connect an AI';
  gate.hidden = false;
  if (_aiConfig.provider !== 'ollama') setTimeout(() => keyInp?.focus(), 50);
}

// Drag the left edge of the panel to resize it; width is remembered.
// A full-window overlay is shown during the drag so the <webview> page content
// can't swallow the mouse events (which is why resizing did nothing before).
function _aiInitResize() {
  const handle = _aiEl('ai-resize');
  const panel = document.getElementById('ai-panel');
  if (!handle || !panel) return;
  const MIN = 320, MAX = 900;
  try {
    const saved = parseInt(localStorage.getItem('privoo-ai-width') || '', 10);
    if (saved >= MIN && saved <= MAX) panel.style.width = saved + 'px';
  } catch {}

  let startX = 0, startW = 0, overlay = null;
  const onMove = (e) => {
    let w = startW + (startX - e.clientX);   // panel sits on the right: drag left → wider
    const cap = Math.min(MAX, window.innerWidth - 260);   // always leave room for the page
    w = Math.max(MIN, Math.min(cap, w));
    panel.style.width = w + 'px';
  };
  const onUp = () => {
    if (overlay) { overlay.remove(); overlay = null; }
    handle.classList.remove('dragging');
    try { localStorage.setItem('privoo-ai-width', String(Math.round(panel.getBoundingClientRect().width))); } catch {}
  };
  handle.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    startW = panel.getBoundingClientRect().width;
    handle.classList.add('dragging');
    // Overlay above everything (incl. webviews) captures the drag reliably.
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;cursor:ew-resize;';
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('mouseup', onUp);
    document.body.appendChild(overlay);
    e.preventDefault();
  });
}

function initAiPanel() {
  if (_aiPanelInited) return;
  _aiPanelInited = true;

  _aiLoadConvos();
  _aiInitResize();
  _aiRenderHistory();

  // Close button
  _aiEl('ai-panel-close')?.addEventListener('click', () => toggleAiPanel());

  // Open the AI as a full page (tab) and close the side panel.
  _aiEl('ai-expand')?.addEventListener('click', () => {
    createTab(AI_URL);
    if (aiPanel && !aiPanel.hidden) toggleAiPanel();
  });

  // New chat (header + sidebar)
  _aiEl('ai-new-chat')?.addEventListener('click', _aiNewChat);
  _aiEl('ai-sidebar-new')?.addEventListener('click', _aiNewChat);

  // Show / hide the chats sidebar
  _aiEl('ai-sidebar-toggle')?.addEventListener('click', _aiToggleSidebar);

  // Setup button
  _aiEl('ai-cfg-btn')?.addEventListener('click', _aiOpenGate);

  // Provider change in gate
  _aiEl('ai-provider')?.addEventListener('change', () => {
    const p = _aiEl('ai-provider')?.value;
    if (!p) return;
    _aiApplyProviderUI(p, p === _aiConfig.provider ? _aiConfig.model : null);
  });

  // Re-scan for local Ollama models
  _aiEl('ai-ollama-rescan')?.addEventListener('click', () => {
    _aiLoadOllama(_aiEl('ai-model')?.value || _aiConfig.model || '');
  });

  // Gate save
  _aiEl('ai-gate-save')?.addEventListener('click', async () => {
    const provider = _aiEl('ai-provider')?.value;
    const model    = _aiEl('ai-model')?.value?.trim() || AI_DEFAULT_MODELS[provider];
    const apiKey   = _aiEl('ai-apikey')?.value?.trim();
    const patch    = { provider, model, accepted: true };
    if (apiKey && provider !== 'ollama') patch.apiKey = apiKey;
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

  // Attach button + drag-and-drop onto the composer.
  _aiWireAttachments();

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

// =============================================================================
// v2.0.0 NEW FEATURES
// =============================================================================

// --- Zoom indicator -----------------------------------------------------------
const zoomIndicatorEl = document.getElementById('zoom-indicator');
function updateZoomIndicator() {
  if (!zoomIndicatorEl) return;
  try {
    const tab = activeTab();
    if (!tab?.wv || tab.url?.startsWith('privoo://')) {
      zoomIndicatorEl.classList.add('hidden'); return;
    }
    const level = tab.wv.getZoomLevel?.() ?? 0;
    const pct = Math.round(Math.pow(1.2, level) * 100);
    if (pct === 100) { zoomIndicatorEl.classList.add('hidden'); }
    else { zoomIndicatorEl.textContent = pct + '%'; zoomIndicatorEl.classList.remove('hidden'); }
  } catch { zoomIndicatorEl.classList.add('hidden'); }
}
zoomIndicatorEl?.addEventListener('click', () => {
  activeTab()?.wv.setZoomLevel(0);
  updateZoomIndicator();
});

// --- Focus Mode (Ctrl+Shift+F) ------------------------------------------------
const focusStripEl = document.getElementById('focus-strip');
let _focusMode = false;
function toggleFocusMode() {
  _focusMode = !_focusMode;
  document.body.classList.toggle('focus-mode', _focusMode);
  if (focusStripEl) focusStripEl.hidden = !_focusMode;
  privooToast(_focusMode ? 'Focus mode on, press Ctrl+Shift+F to exit' : 'Focus mode off');
}
focusStripEl?.addEventListener('click', () => { if (_focusMode) toggleFocusMode(); });

// --- Picture-in-Picture -------------------------------------------------------
const pipBtn = document.getElementById('pip-btn');
let _pipProbeToken = 0;
function togglePiP() {
  const tab = activeTab();
  if (!tab?.wv) return;
  const js = '(function(){try{var v=document.querySelector("video");if(!v)return "no-video";if(document.pictureInPictureElement){document.exitPictureInPicture().catch(function(){});return "exit";}v.requestPictureInPicture().catch(function(){});return "enter";}catch(e){return "err";}})();';
  tab.wv.executeJavaScript(js).then(function(r) {
    if (r === 'no-video') privooToast('No video found on this page');
  }).catch(function() {});
}
function updatePipBtn() {
  if (!pipBtn) return;
  const tab = activeTab();
  const eligible = !!(tab?.url && !tab.url.startsWith('privoo://') && !tab.url.startsWith('about:'));
  if (!eligible) { pipBtn.hidden = true; return; }
  // Ask the page whether it has a video worth popping out. Sites like YouTube
  // build the player after first paint and swap it on SPA navigation, so a
  // URL test alone is either wrong or permanently optimistic — this asks the
  // DOM, and re-asks on every toolbar sync.
  const probe = '(function(){try{'
    + 'var vs=document.querySelectorAll("video");'
    + 'for(var i=0;i<vs.length;i++){var v=vs[i];'
    + 'if(v.readyState>0||v.currentSrc||v.src||v.querySelector("source"))return true;}'
    + 'return false;}catch(e){return false;}})();';
  const wv = tab.wv;
  const token = ++_pipProbeToken;
  try {
    wv.executeJavaScript(probe).then((has) => {
      // A slow probe from a tab the user has already left must not decide
      // the button's state for the tab they are looking at now.
      if (token !== _pipProbeToken) return;
      pipBtn.hidden = !has;
    }).catch(() => { if (token === _pipProbeToken) pipBtn.hidden = true; });
  } catch { pipBtn.hidden = true; }
}
pipBtn?.addEventListener('click', togglePiP);

// --- Command Palette (Ctrl+K) -------------------------------------------------
const cmdPaletteEl  = document.getElementById('cmd-palette');
const cmdpInputEl   = document.getElementById('cmdp-input');
const cmdpResultsEl = document.getElementById('cmdp-results');
let _cmdpItems = [];
let _cmdpIdx = -1;

const CMDP_ACTIONS = [
  { title: 'New tab',              sub: 'Ctrl+T',       action: 'new-tab'       },
  { title: 'New incognito window', sub: 'Ctrl+Shift+N', action: 'new-incognito' },
  { title: 'Bookmarks',            sub: '',             action: 'bookmarks'     },
  { title: 'History',              sub: 'Ctrl+H',       action: 'history'       },
  { title: 'Downloads',            sub: 'Ctrl+J',       action: 'downloads'     },
  { title: 'Extensions',           sub: '',             action: 'extensions'    },
  { title: 'Settings',             sub: '',             action: 'settings'      },
  { title: 'Privoo AI',            sub: '',             action: 'ai-browser'    },
  { title: 'Reader mode',          sub: 'Ctrl+Shift+R', action: 'reader-mode'   },
  { title: 'Focus mode',           sub: 'Ctrl+Shift+F', action: 'focus-mode'    },
  { title: 'Mobile view',          sub: '',             action: 'mobile-view'   },
  { title: 'Split view',           sub: 'Ctrl+Shift+E', action: 'split-view'    },
  { title: 'Full-page screenshot', sub: 'Ctrl+Shift+S', action: 'capture-page'  },
  { title: 'Search open tabs',     sub: 'Ctrl+Shift+A', action: 'tab-search'    },
  { title: 'Zoom in',              sub: 'Ctrl+=',       action: 'zoom-in'       },
  { title: 'Zoom out',             sub: 'Ctrl+-',       action: 'zoom-out'      },
  { title: 'Reset zoom',           sub: 'Ctrl+0',       action: 'zoom-reset'    },
  { title: 'Customize Privoo',     sub: '',             action: 'customize'     },
];

function _cpEsc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function _cpHost(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}
function openCmdPalette() {
  if (!cmdPaletteEl) return;
  closePopovers();
  cmdPaletteEl.classList.remove('hidden');
  _cmdpIdx = -1;
  if (cmdpInputEl) cmdpInputEl.value = '';
  _renderCmdp('');
  setTimeout(function() { cmdpInputEl && cmdpInputEl.focus(); }, 0);
}
function closeCmdPalette() {
  cmdPaletteEl && cmdPaletteEl.classList.add('hidden');
}
function _renderCmdp(query) {
  if (!cmdpResultsEl) return;
  const q = query.toLowerCase().trim();
  _cmdpItems = [];
  const frag = document.createDocumentFragment();

  // Open tabs
  const mTabs = tabs.filter(function(t) {
    return !q || (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q);
  }).slice(0, 5);
  if (mTabs.length) {
    _cpSection(frag, 'Open tabs');
    mTabs.forEach(function(t) {
      _cpItem(frag, {
        iconHtml: '<img src="https://www.google.com/s2/favicons?domain=' + _cpHost(t.url) + '&sz=16" width="16" height="16" style="border-radius:2px" onerror="this.style.display=\'none\'"/>',
        title: t.title || t.url,
        sub: displayUrl(t.url),
        onSelect: function() { activateTab(t.id); closeCmdPalette(); },
      });
    });
  }

  // Actions
  const mActs = q ? CMDP_ACTIONS.filter(function(a) { return a.title.toLowerCase().includes(q); }) : CMDP_ACTIONS;
  if (mActs.length) {
    _cpSection(frag, q ? 'Actions' : 'Quick actions');
    mActs.slice(0, 7).forEach(function(a) {
      _cpItem(frag, {
        iconHtml: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M13 3L4 14h7l-1 7 9-11h-7z"/></svg>',
        title: a.title,
        kbd: a.sub,
        onSelect: function() { handleMenuAction(a.action); closeCmdPalette(); },
      });
    });
  }

  // Bookmarks
  const mBms = bookmarkList().filter(function(b) {
    return !q || (b.name || '').toLowerCase().includes(q) || (b.url || '').toLowerCase().includes(q);
  }).slice(0, 4);
  if (mBms.length) {
    _cpSection(frag, 'Bookmarks');
    mBms.forEach(function(b) {
      _cpItem(frag, {
        iconHtml: '<img src="https://www.google.com/s2/favicons?domain=' + _cpHost(b.url) + '&sz=16" width="16" height="16" style="border-radius:2px" onerror="this.style.display=\'none\'"/>',
        title: b.name,
        sub: displayUrl(b.url),
        onSelect: function() { createTab(b.url); closeCmdPalette(); },
      });
    });
  }

  cmdpResultsEl.innerHTML = '';
  cmdpResultsEl.appendChild(frag);
  _cmdpIdx = -1;
}
function _cpSection(frag, label) {
  const el = document.createElement('div');
  el.className = 'cmdp-section-label';
  el.textContent = label;
  frag.appendChild(el);
}
function _cpItem(frag, opts) {
  const el = document.createElement('div');
  el.className = 'cmdp-item';
  el.innerHTML =
    '<div class="cmdp-item-icon">' + (opts.iconHtml || '') + '</div>' +
    '<div class="cmdp-item-body">' +
      '<div class="cmdp-item-title">' + _cpEsc(opts.title) + '</div>' +
      (opts.sub && !opts.kbd ? '<div class="cmdp-item-sub">' + _cpEsc(opts.sub) + '</div>' : '') +
    '</div>' +
    (opts.kbd ? '<kbd class="cmdp-item-kbd">' + _cpEsc(opts.kbd) + '</kbd>' : '');
  el.addEventListener('click', opts.onSelect);
  el.addEventListener('mouseenter', function() {
    _cmdpItems.forEach(function(i, n) {
      i.classList.toggle('active', i === el);
      if (i === el) _cmdpIdx = n;
    });
  });
  _cmdpItems.push(el);
  frag.appendChild(el);
}
function _cmdpMove(dir) {
  if (!_cmdpItems.length) return;
  _cmdpItems[_cmdpIdx] && _cmdpItems[_cmdpIdx].classList.remove('active');
  _cmdpIdx = Math.max(0, Math.min(_cmdpItems.length - 1, _cmdpIdx + dir));
  const el = _cmdpItems[_cmdpIdx];
  if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); }
}
if (cmdPaletteEl) {
  const backdrop = cmdPaletteEl.querySelector('.cmdp-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeCmdPalette);
  cmdPaletteEl.addEventListener('mousedown', (e) => {
    if (e.target === cmdPaletteEl) closeCmdPalette();
  });
  if (cmdpInputEl) {
    cmdpInputEl.addEventListener('input', function() { _renderCmdp(cmdpInputEl.value); });
    cmdpInputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Escape')    { e.preventDefault(); closeCmdPalette(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); _cmdpMove(1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); _cmdpMove(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const active = _cmdpItems[_cmdpIdx] || _cmdpItems[0];
        if (active) active.click();
      }
    });
  }
}

// --- Per-site ad-block toggle -------------------------------------------------
const spSiteToggle = document.getElementById('sp-site-ads-toggle');
const spSiteLabel  = document.getElementById('sp-site-label');
function _shieldHost() {
  try { return new URL(activeTab()?.url || '').hostname; } catch { return null; }
}
function updateShieldSiteToggle() {
  if (!spSiteToggle) return;
  const host = _shieldHost();
  const row = spSiteToggle.closest && spSiteToggle.closest('.sp-site-toggle-row');
  if (!host) { if (row) row.hidden = true; return; }
  if (row) row.hidden = false;
  const excl = Array.isArray(settings && settings.adBlockExcludedDomains) ? settings.adBlockExcludedDomains : [];
  const blocked = !excl.includes(host);
  spSiteToggle.checked = blocked;
  if (spSiteLabel) spSiteLabel.textContent = blocked ? 'Ads blocked on this site' : 'Ads allowed on this site';
}
if (spSiteToggle) {
  spSiteToggle.addEventListener('change', function() {
    const host = _shieldHost();
    if (!host) return;
    const excl = Array.isArray(settings && settings.adBlockExcludedDomains) ? settings.adBlockExcludedDomains.slice() : [];
    if (!spSiteToggle.checked) {
      if (!excl.includes(host)) excl.push(host);
    } else {
      const i = excl.indexOf(host);
      if (i >= 0) excl.splice(i, 1);
    }
    saveBrowserSetting({ adBlockExcludedDomains: excl });
    if (spSiteLabel) spSiteLabel.textContent = !spSiteToggle.checked ? 'Ads allowed on this site' : 'Ads blocked on this site';
    const tab = activeTab();
    if (tab && tab.wv) try { tab.wv.reload(); } catch(_) {}
  });
}
// shieldBtn already declared at top of file — just add the listener
if (shieldBtn) {
  shieldBtn.addEventListener('click', function() { setTimeout(updateShieldSiteToggle, 60); }, true);
}


