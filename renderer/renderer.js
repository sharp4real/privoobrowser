'use strict';

// ─── Internal page URLs ──────────────────────────────────────────────────────
const NEWTAB_URL     = 'privoo://newtab/';
const SETTINGS_URL   = 'privoo://settings/';
const DOWNLOADS_URL  = 'privoo://downloads/';
const HISTORY_URL    = 'privoo://history/';
const EXTENSIONS_URL = 'privoo://extensions/';
const BOOKMARKS_URL  = 'privoo://bookmarks/';

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
  newtab:      'M4 5h7v7H4zM13 5h7v7h-7zM4 13h7v6H4zM13 13h7v6h-7z',
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
  function applyAll(){ var f=css(get()); document.querySelectorAll('video').forEach(function(v){ if(v.style.filter!==f) v.style.filter=f; }); }
  var star=document.createElement('div'); star.id='__pl_star';
  star.style.cssText='position:fixed;z-index:2147483000;width:34px;height:34px;border-radius:9px;display:none;align-items:center;justify-content:center;cursor:pointer;background:rgba(18,20,18,.72);color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.45);opacity:0;transition:opacity .16s';
  star.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l2.9 6.9L22 9.3l-5.5 4.8L18.2 21 12 17.3 5.8 21l1.7-6.9L2 9.3l7.1-.4z"/></svg>';
  var panel=document.createElement('div'); panel.id='__pl_panel';
  panel.style.cssText='position:fixed;z-index:2147483000;display:none;flex-direction:column;gap:7px;padding:10px 12px;border-radius:11px;background:rgba(18,20,18,.9);color:#fff;font:600 11px/1.2 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5);width:186px';
  panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><span>Lucid Mode</span><span id="__pl_v"></span></div><input id="__pl_r" type="range" min="0" max="100" step="1" style="width:100%;accent-color:#4f46e5">';
  (document.body||document.documentElement).appendChild(star);
  (document.body||document.documentElement).appendChild(panel);
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
    star.style.left=(r.left+r.width/2-17)+'px'; star.style.top=(r.top+12)+'px';
    star.style.display='flex'; star.style.opacity='1'; star.style.color=get()>0?'#beb3ff':'#fff';
    if(panel.style.display==='flex'){ panel.style.left=Math.max(6,Math.min(r.left+r.width/2-93,window.innerWidth-192))+'px'; panel.style.top=(r.top+52)+'px'; }
  }
  function hide(){ star.style.opacity='0'; star.style.display='none'; panel.style.display='none'; cur=null; }
  // Show only while the cursor is over the TOP band of a video (or over our own
  // star/panel). Move away from the top and it fades out.
  document.addEventListener('mousemove',function(e){
    var t=e.target;
    if(t===star||star.contains(t)||t===panel||panel.contains(t)) return; // keep while on our UI
    var v=videoAt(e.clientX,e.clientY);
    if(v){ var r=v.getBoundingClientRect(); if(e.clientY<=r.top+Math.min(90,r.height*0.28)){ cur=v; show(); return; } }
    if(panel.style.display!=='flex') hide();
  },true);
  // Keep the star glued to the video while it's shown (scroll / resize). Also
  // re-attach our nodes if the page tore them out — YouTube is an SPA and swaps
  // large parts of the DOM on navigation, which was silently removing the star.
  function follow(){
    var root=document.body||document.documentElement;
    if(root){ if(!star.isConnected) root.appendChild(star); if(!panel.isConnected) root.appendChild(panel); }
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
  ['__pl_star','__pl_panel','__pl_svg'].forEach(function(id){ var e=document.getElementById(id); if(e) e.remove(); });
}catch(e){} })();`;

// ── YouTube black-frame fix ──────────────────────────────────────────────────
// The classic "black video until I refresh" is a GPU compositing cold-start on
// the first video of a session: the player is decoding audio+video but the
// video layer never gets a paint. Refreshing re-triggers the decode with a warm
// GPU. This nudges the video's own compositing layer right after playback
// starts (a couple of times, because the first frame is the flaky one), which
// forces that missing paint — clearing the black frame WITHOUT a reload.
const YOUTUBE_FIX_JS = String.raw`(function(){
  if(window.__privooYtFix) return; window.__privooYtFix=1;
  function poke(v){ if(!v||!v.isConnected) return; var t=v.style.transform||'';
    v.style.transform='translateZ(0)';
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ v.style.transform=t; }); }); }
  var handled=null;
  function attach(){
    var v=document.querySelector('.html5-main-video')||document.querySelector('video');
    if(!v||v===handled) return;
    handled=v;
    function onPlay(){ poke(v); setTimeout(function(){poke(v);},150); setTimeout(function(){poke(v);},600); setTimeout(function(){poke(v);},1400); }
    v.addEventListener('playing', onPlay);
    v.addEventListener('loadeddata', function(){ setTimeout(function(){poke(v);},80); });
    if(v.readyState>=2 && !v.paused) onPlay();
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
  document.body.classList.toggle('themed', !!settings.ntpWaveEnabled);
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
  omnibox.placeholder = `Search ${engName} or type a URL`;
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
  applyVtabsIntegrated(!!settings.verticalTabs && !!settings.vtabsIntegrated);
  document.body.classList.toggle('wobbly-windows', !!settings.wobblyWindows);
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
  document.body.classList.toggle('newtab-circle', !!settings.newTabBtnCircle);
  document.body.classList.toggle('vtabs-centered', !!settings.vtabsCenterIcons);
  // Transparency glass style (only takes effect when transparency is on).
  document.body.classList.remove('tstyle-liquid', 'tstyle-acrylic', 'tstyle-clear');
  const _tst = settings.transparencyStyle || 'frosted';
  if (_tst !== 'frosted') document.body.classList.add('tstyle-' + _tst);
  // Whole-UI style controls (corner roundness + density). Font + custom CSS are
  // applied via an injected stylesheet in applyStyleCustomizations().
  document.body.classList.remove('ui-sharp', 'ui-round');
  const _round = settings.uiRoundness || 'default';
  if (_round === 'sharp' || _round === 'round') document.body.classList.add('ui-' + _round);
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
  const wave    = full && !!settings?.ntpWaveEnabled;
  const wpPath  = settings?.ntpWallpaperPath;
  const wantsDefaultBg = settings?.ntpApplyPrivooBackground !== false;
  const hasWp   = wpPath !== '' && !(wpPath == null && !wantsDefaultBg);
  const on      = full && (wave || hasWp);
  const isVideo = on && !wave && settings?.ntpWallpaperType === 'video';
  const imgEl  = document.getElementById('chrome-wallpaper');
  const vidEl  = document.getElementById('chrome-wallpaper-video');
  const waveEl = document.getElementById('chrome-wave');
  document.documentElement.classList.toggle('wallpaper-chrome-host', on);
  document.body.classList.toggle('wallpaper-chrome', on);
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
        waveEl.style.background = "url('privoo://newtab/themes/" + id + ".png') center/cover no-repeat, linear-gradient(135deg, " + cols.join(',') + ")";
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
  const mood = settings?.ntpThemeMusic;
  const want = !!settings?.ntpWaveEnabled && mood && mood !== 'none';
  const vol = Math.max(0, Math.min(1, typeof settings?.ntpThemeMusicVolume === 'number' ? settings.ntpThemeMusicVolume : 0.4));
  if (!want) { ThemeAudio.stop(); return; }
  ThemeAudio.start(mood, vol);
  // Browsers gate audio until a user gesture — if it didn't start, resume on the
  // next click/keypress anywhere in the chrome.
  if (!_musicGestureHooked) {
    const kick = () => { if (settings?.ntpWaveEnabled && settings?.ntpThemeMusic && settings.ntpThemeMusic !== 'none') ThemeAudio.start(settings.ntpThemeMusic, vol); };
    document.addEventListener('pointerdown', kick, true);
    document.addEventListener('keydown', kick, true);
    _musicGestureHooked = true;
  }
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
    if (tab.url === NEWTAB_URL && tab.wv) {
      const payload = JSON.stringify(settings);
      tab.wv.executeJavaScript(
        `if(typeof window.__privooApplySettings==='function')window.__privooApplySettings(${payload});`
      ).catch(() => {});
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
  // Privoo VPN connected dot — kept in sync even while the popover is closed.
  if (vpnDot) vpnDot.hidden = !vpnIsConnected(settings);
  // Show/hide ytdlp toolbar button based on settings
  if (ytdlpToolbarBtn) ytdlpToolbarBtn.hidden = !settings.showYtdlpToolbar;
  // Show/hide geo toolbar button based on settings
  if (geoToolbarBtn) geoToolbarBtn.hidden = !settings.showGeoToolbar;
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
  if (aiAnchor) aiAnchor.hidden = settings.showAiButton === false;
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
    const brandSvg = brandIconSvgFor(link.url);
    if (brandSvg) {
      btn.innerHTML = brandSvg;
      btn.classList.add('loaded');
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
      openSidebarPanel(link);
    });
    // Hover: if a tab from this site is playing audio, show a tiny rounded
    // "Playing" pill with the track title and a pause/resume button.
    btn.addEventListener('mouseenter', () => showSidebarNowPlaying(btn, link));
    btn.addEventListener('mouseleave', () => hideSidebarNowPlaying(false));
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
  let w = settings?.sidebarPanelWidth || 560;
  const titleEl = document.getElementById('sidebar-panel-title');
  let linkHost = '';
  try { linkHost = new URL(link.url).hostname; } catch {}
  if (titleEl) titleEl.textContent = linkHost ? linkHost.replace(/^www\./, '') : (link.title || link.url);
  sidebarPanel.style.width = `${w}px`;
  // Deliberately NOT marking this as a mobile webview: the panel now uses the
  // default desktop identity across all of Electron's UA layers.
  sidebarWv.src = link.url;
  sidebarPanel.hidden = false;
  sidebarOverlay?.classList.remove('hidden');
  // Trigger slide-in animation
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
sidebarResizeHandle?.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  _sidebarResizing = true;
  _sidebarResizeStart = e.clientX;
  _sidebarResizeW = sidebarPanel ? parseInt(sidebarPanel.style.width) || 480 : 480;
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

function _onSidebarResize(e) {
  if (!_sidebarResizing || !sidebarPanel) return;
  const delta = e.clientX - _sidebarResizeStart;
  const newW = Math.max(180, Math.min(760, _sidebarResizeW + delta));
  sidebarPanel.style.width = `${newW}px`;
}

async function _onSidebarResizeEnd() {
  if (!_sidebarResizing) return;
  _sidebarResizing = false;
  document.body.classList.remove('sidebar-resizing');
  sidebarResizeHandle?.removeEventListener('pointermove', _onSidebarResize);
  sidebarResizeHandle?.removeEventListener('pointerup', _onSidebarResizeEnd);
  sidebarResizeHandle?.removeEventListener('lostpointercapture', _onSidebarResizeEnd);
  if (sidebarPanel) {
    const w = parseInt(sidebarPanel.style.width) || 480;
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
  applySplitTabStripJoin();
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
  const strip = document.getElementById('tabs-strip');
  const newTabBtn = document.getElementById('new-tab');
  if (!strip) return;
  const stripW = strip.clientWidth;
  if (stripW <= 0) return; // not laid out yet — a later trigger will re-run us
  // Measure the whole STRIP (a stable width) — NOT #tabs-scroll, which is now
  // content-sized (reading it would be circular). Reserve room for the "+" and
  // the trailing drag gap, generously, so the tabs are always a touch narrower
  // than the space and NEVER overflow-clip before they truly need to scroll.
  const btnW = (newTabBtn ? newTabBtn.offsetWidth : 30) + 12;
  const pinnedW = tabs.filter(t => t.pinned).length * 42;
  const reserve = btnW + pinnedW + 56;
  const available = stripW - reserve;
  const unpinned = tabs.filter(t => !t.pinned);
  if (!unpinned.length) return;
  // Chrome-style: each tab is (space / count), capped at 240 (a few tabs stay
  // full width, "+" right beside the last) and floored at 76 (then it scrolls).
  const w = available > 0
    ? Math.min(240, Math.max(76, Math.floor(available / unpinned.length)))
    : 76;
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
      try { createTab('privoo://news/'); } catch {}
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
  viewsEl.appendChild(wv);

  const tabEl = document.createElement('div');
  // tab-in: fade only. The tab is appended at its final width (resizeTabs runs
  // synchronously below), so nothing reflows. Cleared after two frames so the
  // opacity transition actually runs.
  tabEl.className = 'tab tab-in';
  requestAnimationFrame(() =>
    requestAnimationFrame(() => tabEl.classList.remove('tab-in')));
  tabEl.draggable = true;
  tabEl.innerHTML =
    `<span class="favicon tab-fav"></span>` +
    `<span class="tab-title">${newTabLabel()}</span>` +
    `<span class="tab-audio-ind" title="Audio playing, click to mute"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg></span>` +
    `<span class="tab-close" title="Close tab"><svg viewBox="0 0 14 14" width="10" height="10"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" fill="none"/></svg></span>`;
  tabsEl.appendChild(tabEl);
  // Tab widths are un-animated now, so the strip's final layout exists this
  // frame: re-spread immediately, then (next frame, and only if it genuinely
  // overflows) reveal the new tab. No settling delay, no clipped edge.
  resizeTabs();
  requestAnimationFrame(() => {
    const sc = document.getElementById('tabs-scroll');
    if (sc && sc.scrollWidth > sc.clientWidth + 2) {
      try { tabEl.scrollIntoView({ inline: 'end', block: 'nearest' }); } catch {}
    }
  });

  const tab = {
    id,
    url,
    title: newTabLabel(),
    wv,
    tabEl,
    pinned: !!opts.pinned,
    groupId: (opts.groupId && tabGroups.some((g) => g.id === opts.groupId)) ? opts.groupId : null,
    isPlayingAudio: false,
    isMuted: false,
    volume: 1,
    // Privoo pages know their icon immediately — no need to wait for onNav
    // to fire, which avoided a flash of the generic favicon.
    faviconUrl: url.startsWith('privoo://') ? faviconForPrivooUrl(url) : null,
    abortController: new AbortController(),
  };
  tabs.push(tab);

  // Paint the Privoo page icon immediately — don't wait for onNav to fire
  // (avoids a flash of the generic favicon on internal pages).
  if (tab.faviconUrl) {
    const initialFaviconEl = tabEl.querySelector('.favicon');
    if (initialFaviconEl) initialFaviconEl.style.backgroundImage = 'url("' + tab.faviconUrl + '")';
  }

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
  renderVtabs();
  scheduleSaveSession();
}

// ─── Tab drag-to-reorder ─────────────────────────────────────────────────────
function wireDrag(tab) {
  const { tabEl } = tab;
  tabEl.addEventListener('dragstart', (e) => { tabEl.classList.add('dragging'); beginTabDrag(tab.id, e); });
  tabEl.addEventListener('dragend',   () => {
    tabEl.classList.remove('dragging');
    endTabDrag();
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
    { id: 'duplicate',    label: 'Duplicate tab' },
    { type: 'separator' },
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
    // Privoo's own pages keep their per-page icon (settings=gear, history=
    // clock, …) set in onNav — don't let the page's own <link rel="icon">
    // (same shield on every internal page) override it.
    if (tab.url?.startsWith('privoo://')) { renderVtabs(); return; }
    const icon = e.favicons?.[0];
    if (icon) applyTabFavicon(tab, icon);
    renderVtabs();
  }, { signal });

  const onNav = () => {
    tab.url = wv.getURL();
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
      void showFilePickerPopover(tab);
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

async function showFilePickerPopover(tab) {
  if (settings?.easyFilesEnabled === false || !window.privoo?.recentFilesList) return;
  closeFilePickerPopover();

  let vx = 200, vy = 200;
  try {
    const c = await window.privoo.getCursorPos();
    if (c && c.x >= 0 && c.y >= 0) { vx = c.x; vy = c.y; }
  } catch { /* fall back to default position */ }

  let files = [];
  try { files = await window.privoo.recentFilesList(); } catch { files = []; }

  const pop = document.createElement('div');
  pop.className = 'fp-pop';
  pop.style.left = Math.min(vx, window.innerWidth - 300) + 'px';
  pop.style.top = Math.min(vy, window.innerHeight - 260) + 'px';

  const rows = files.length
    ? files.map((f) => `<button type="button" class="fp-item" data-path="${esc(f.path)}"><span class="fp-item-name">${esc(f.name)}</span><span class="fp-item-time">${fpRelativeTime(f.mtimeMs)}</span></button>`).join('')
    : '<div class="fp-empty">No recent files yet</div>';

  pop.innerHTML = '<h4>Recent files</h4>' + rows + '<button type="button" class="fp-browse" id="fp-browse">Browse for a file…</button>';
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
  updateZoomIndicator();
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
    openB.className = 'dl-pop-action-btn';
    openB.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg><span>Open</span>';
    openB.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (d.savePath) window.privoo.openDownload(d.savePath);
    });
    const folderB = document.createElement('button');
    folderB.type = 'button';
    folderB.className = 'dl-pop-action-btn';
    folderB.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg><span>Folder</span>';
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

const fmtStat = (n) => (n > 999999 ? '999k+' : String(n ?? 0));

async function refreshStats() {
  try {
    const s = await window.privoo.getPrivacyStats();
    // The toolbar shield is icon-only now, so shieldCount may not exist.
    // It must not throw here: this same function paints the panel's numbers,
    // and a throw would leave them stuck at zero.
    if (shieldCount) {
      const total = (s.blockedAds || 0) + (s.blockedCookies || 0);
      shieldCount.textContent = total > 9999 ? '9999+' : String(total);
    }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmtStat(v); };
    set('stat-ads', s.blockedAds);
    set('stat-cookies', s.blockedCookies);
    set('stat-https', s.upgradedHttps);
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

async function openDockedDevTools(tab, inspectX, inspectY) {
  if (!tab?.wv) return;
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
    empty.textContent = q ? `No emojis match "${q}"` : 'Nothing here yet — pick an emoji to add it to Recent';
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

function openEmojiPicker(wv, inputEl) {
  if (!emojiPickerEl) return;
  closePopovers();
  emojiTargetInput = inputEl || null;
  emojiTargetWv = inputEl ? null : (wv || activeTab()?.wv || null);
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
// True while the TikTok sign-in notice is up for the current visit. Unlike the
// others this one is ALSO gated by a persisted localStorage flag so it only ever
// shows once (it's advice, not a per-visit nudge).
let obTikTokActive = false;
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

  // TikTok sign-in help — shown ONCE, ever (persisted). TikTok blocks logins
  // from VPN/proxy IPs with "maximum number of attempts reached" because the IP
  // region won't match the device timezone; the fix is user-side, so surface it
  // the first time they land on TikTok rather than letting them hit the wall.
  const isTikTok = bareHost === 'tiktok.com' || bareHost.endsWith('.tiktok.com');
  if (isTikTok) {
    let shown = false;
    try { shown = localStorage.getItem('privoo_tiktok_login_notice_v1') === '1'; } catch {}
    if (!shown && !obTikTokActive) {
      obTikTokActive = true;
      try { localStorage.setItem('privoo_tiktok_login_notice_v1', '1'); } catch {}
      showOverlayBanner(
        'Trouble signing in to TikTok?',
        'TikTok sometimes blocks logins with “maximum number of attempts reached”. If that happens, open Settings → Site fixes → Reset TikTok, then wait a few minutes and try once.',
        'Got it',
      );
    }
    return; // stay put on TikTok's in-page navigations; don't hide/re-trigger
  }
  obTikTokActive = false;

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
    if (settings?.identityAutofillEnabled === true) {
      add('Autofill identity', () => requestIdentityAutofill(tab));
    }
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
  add('Inspect',          () => openDockedDevTools(tab, params?.x, params?.y),           { accel: 'F12' });

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
  { name: 'lavender', value: '#4f46e5' },  // default
  { name: 'blue',     value: '#8ab4f8' },
  { name: 'teal',     value: '#4dd0e1' },
  { name: 'green',    value: '#81c995' },
  { name: 'yellow',   value: '#fdd663' },
  { name: 'orange',   value: '#fcad70' },
  { name: 'red',      value: '#f28b82' },
  { name: 'pink',     value: '#f48fb1' },
];
const cpPanel       = document.getElementById('customize-panel');
const cpCloseBtn    = document.getElementById('cp-close');
const cpAccentRow   = document.getElementById('cp-accent-row');
const cpShowHome    = document.getElementById('cp-show-home');
const cpShowBks     = document.getElementById('cp-show-bookmarks');
const cpSidebarMode = document.getElementById('cp-sidebar-mode');
const cpShowNotes      = document.getElementById('cp-show-notes');
const cpVerticalTabs   = document.getElementById('cp-vertical-tabs');
// cpShowGreet removed — greeting feature deleted
const cpWpPickBtn   = document.getElementById('cp-wp-pick');
const cpWpLiveBtn   = document.getElementById('cp-wp-live');
const cpWpClearBtn  = document.getElementById('cp-wp-clear');
const cpWpFull      = document.getElementById('cp-wp-full');
const cpWpSound     = document.getElementById('cp-wp-sound');
const cpWpAnimated  = document.getElementById('cp-wp-animated');

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

// The signature indigo is the default accent — not manually pickable — but
// selecting a colourful Theme (Settings/Customize → New tab background →
// Theme) retunes it to that theme's own colour, so the browser actually
// feels themed rather than always defaulting back to indigo. Chrome
// surfaces (titlebar/toolbar/omnibox) stay neutral regardless — only
// buttons, focus rings, links and the active-tab underline use the accent.
function applyAccentTriad(themeHex) {
  const isDark = document.body.classList.contains('dark');
  const fallback = isDark ? '#948ef2' : '#4f46e5';
  const hex = (themeHex && /^#[0-9a-f]{6}$/i.test(themeHex)) ? themeHex : fallback;
  document.documentElement.style.setProperty('--accent', hex);
  const { r, g, b } = hexToRgb(hex);
  const hover = rgbToHex(
    Math.min(255, Math.round(r + (255 - r) * 0.18)),
    Math.min(255, Math.round(g + (255 - g) * 0.18)),
    Math.min(255, Math.round(b + (255 - b) * 0.18)),
  );
  document.documentElement.style.setProperty('--accent-hover', hover);
  document.documentElement.style.setProperty('--accent-soft', `rgba(${r},${g},${b},.18)`);
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
  if (cpWpFull)         cpWpFull.checked         = !!settings?.ntpWallpaperFullBrowser;
  if (cpWpSound)        cpWpSound.checked        = !!settings?.ntpWallpaperSound;
  if (cpWpAnimated)     cpWpAnimated.checked     = settings?.ntpWallpaperAnimated !== false;
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

cpWpPickBtn?.addEventListener('click', async () => {
  // Picking an image/video wins over the wave — turn the wave off so it shows.
  try { const r = await window.privoo.chooseNtpWallpaper?.(); if (r) saveBrowserSetting({ ntpWaveEnabled: false }); } catch {}
});
cpWpLiveBtn?.addEventListener('click', async () => {
  try { const r = await window.privoo.chooseNtpLiveWallpaper?.(); if (r) saveBrowserSetting({ ntpWaveEnabled: false }); } catch {}
});
cpWpClearBtn?.addEventListener('click', async () => {
  try { await window.privoo.clearNtpWallpaper?.(); } catch {}
  saveBrowserSetting({ ntpWaveEnabled: false });   // "Remove" clears any custom background
});
cpWpSound?.addEventListener('change', () => {
  saveBrowserSetting({ ntpWallpaperSound: cpWpSound.checked });
});
cpWpAnimated?.addEventListener('change', () => {
  saveBrowserSetting({ ntpWallpaperAnimated: cpWpAnimated.checked });
});
cpWpFull?.addEventListener('change', () => {
  saveBrowserSetting({ ntpWallpaperFullBrowser: cpWpFull.checked });
});

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
      preview.style.background = "url('privoo://newtab/themes/" + matched.id + ".png') center/cover no-repeat, linear-gradient(135deg, " + colors.join(',') + ")";
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
      // the UI never ends up with an unusable grey accent.
      ...(maxSat >= 0.12 ? { accentColor: best } : {}),
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
      // Cover = the theme's generated image, with the palette gradient as fallback.
      b.className = 'theme-tile';
      b.dataset.id = t.id; b.title = t.name;
      b.style.background = "url('privoo://newtab/themes/" + t.id + ".png') center/cover no-repeat, linear-gradient(135deg, " + t.colors.join(',') + ")";
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
    saveBrowserSetting({ ntpWaveEnabled: false, vibeEnabled: false, ntpThemeMusic: 'none', ntpThemeId: '' });
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
    const seen = settings?.newsSeenVersion || '';
    const isFreshInstall = !settings?.disclaimerAccepted;
    if (seen !== v) {
      // Only auto-open on a genuine update (we've seen a prior version and the
      // user is past first-run setup). Otherwise just record the version.
      if (seen && !isFreshInstall) {
        setTimeout(() => { try { createTab('privoo://news/'); } catch {} }, 900);
      }
      saveBrowserSetting({ newsSeenVersion: v });
    }
  } catch {}
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

// ── Sidebar now-playing flyout ───────────────────────────────────────────────
let _sbNp = null, _sbNpHide = 0;
function hideSidebarNowPlaying(force) {
  clearTimeout(_sbNpHide);
  if (force) { _sbNp?.remove(); _sbNp = null; return; }
  // grace period so the cursor can travel from the icon into the pill
  _sbNpHide = setTimeout(() => { if (_sbNp && !_sbNp.matches(':hover')) { _sbNp.remove(); _sbNp = null; } }, 250);
}
async function showSidebarNowPlaying(btn, link) {
  let host; try { host = new URL(link.url).hostname.replace(/^(www|web|open)\./, ''); } catch { return; }
  const tab = tabs.find(t => {
    if (!t.isPlayingAudio || !t.wv) return false;
    try { return new URL(t.wv.getURL()).hostname.includes(host); } catch { return false; }
  });
  if (!tab) return;
  let title = tab.title || host;
  try {
    const meta = await tab.wv.executeJavaScript(
      '(function(){try{var m=navigator.mediaSession&&navigator.mediaSession.metadata;return m?(m.title||"")+(m.artist?" — "+m.artist:""):null}catch(e){return null}})()');
    if (meta) title = meta;
  } catch {}
  hideSidebarNowPlaying(true);
  const pill = document.createElement('div');
  pill.className = 'sb-nowplaying';
  pill.innerHTML =
    '<span class="sb-np-badge">Playing</span>' +
    `<span class="sb-np-title">${esc(title)}</span>` +
    '<button type="button" class="sb-np-btn" title="Pause / resume"><svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg></button>';
  const r = btn.getBoundingClientRect();
  pill.style.top = Math.max(8, r.top + r.height / 2 - 22) + 'px';
  document.body.appendChild(pill);
  _sbNp = pill;
  pill.addEventListener('mouseleave', () => hideSidebarNowPlaying(false));
  pill.querySelector('.sb-np-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const svg = pill.querySelector('.sb-np-btn svg');
    tab.wv.executeJavaScript(`(function(){
      try{var m=Array.from(document.querySelectorAll('video,audio'));
      var a=m.find(x=>!x.paused)||m[0];
      if(a){if(a.paused){a.play();return 'playing';}a.pause();return 'paused';}}catch(e){} return null;
    })()`).then((st) => {
      if (st === 'paused') svg.innerHTML = '<path d="M8 5v14l11-7z"/>';
      else if (st === 'playing') svg.innerHTML = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
    }).catch(() => {});
  });
}

// ─── Sidebar wiring ──────────────────────────────────────────────────────────
// Known web apps offered as one-click sidebar toggles in Customize.
const SIDEBAR_APP_CATALOG = [
  { title: 'Snapchat',  url: 'https://web.snapchat.com' },
  { title: 'Spotify',   url: 'https://open.spotify.com' },
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
  pop.innerHTML = '<h4>Customize sidebar</h4>' +
    '<div class="sb-cz-modes" id="sb-cz-modes">' +
      ['off', 'on', 'hover'].map((m) =>
        `<button type="button" class="sb-cz-mode-btn${m === curMode ? ' active' : ''}" data-mode="${m}">${m === 'off' ? 'Off' : m === 'on' ? 'Always on' : 'On hover'}</button>`
      ).join('') +
    '</div>' +
    swRow('<span class="sb-cz-name">Quick access <small>Downloads, History…</small></span>',
          settings?.sidebarQuickAccess !== false, 'id="sb-cz-qa"') +
    '<h4 style="margin-top:12px">Apps</h4>' +
    SIDEBAR_APP_CATALOG.map((a, i) => {
      const brandSvg = brandIconSvgFor(a.url);
      const fav = faviconForSidebar(a.url);
      const icon = brandSvg
        ? `<span class="sb-cz-fav">${brandSvg}</span>`
        : fav
          ? `<img class="sb-cz-fav" src="${fav}" alt="" onerror="this.style.display='none'"/>`
          : `<span class="sb-cz-fav sb-cz-letter">${esc(a.title[0])}</span>`;
      return swRow(icon + `<span class="sb-cz-name">${esc(a.title)}</span>`, has(a.url), `data-app="${i}"`);
    }).join('') +
    '<button type="button" class="sb-cz-add" id="sb-cz-add">Add a custom site…</button>';
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
        ? [...cur, { title: app.title, url: app.url }]
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
  if (e.key === 'ArrowUp')   { e.preventDefault(); highlightSug(Math.max(sugIndex - 1, -1)); if (sugIndex < 0) omnibox.value = displayUrl(activeTab()?.url) || ''; return; }
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
homeBtn.addEventListener('click', () => navigate(settings?.homePage || NEWTAB_URL));
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
  if (!btn || !popover || !display) return;

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
  const show = () => { display.textContent = cur.length > 12 ? Number(cur).toPrecision(8) : cur; };

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
    if (op !== null && !fresh) { acc = apply(acc, v, op); cur = fmt(acc); show(); }
    else { acc = v; }
    op = o; fresh = true;
  }
  function equals() {
    if (op === null) return;
    const v = parseFloat(cur);
    acc = apply(acc, v, op); cur = fmt(acc); show();
    op = null; fresh = true;
  }
  function press(k) {
    if (/^[0-9.]$/.test(k)) return inputDigit(k);
    if (k === '+' || k === '-' || k === '*' || k === '/') return chooseOp(k);
    if (k === '=') return equals();
    if (k === 'clear') { acc = null; op = null; cur = '0'; fresh = true; return show(); }
    if (k === 'sign') { cur = fmt(parseFloat(cur) * -1); return show(); }
    if (k === 'percent') { cur = fmt(parseFloat(cur) / 100); fresh = true; return show(); }
  }

  popover.querySelectorAll('.calc-key').forEach((k) => {
    k.addEventListener('click', (e) => { e.stopPropagation(); press(k.dataset.k); });
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = !popover.classList.contains('hidden');
    closePopovers();
    if (!wasOpen) popover.classList.remove('hidden');
  });
  // Keyboard input while the calculator is open.
  document.addEventListener('keydown', (e) => {
    if (popover.classList.contains('hidden')) return;
    if (/^[0-9.]$/.test(e.key)) { press(e.key); e.preventDefault(); }
    else if (['+','-','*','/'].includes(e.key)) { press(e.key); e.preventDefault(); }
    else if (e.key === 'Enter' || e.key === '=') { press('='); e.preventDefault(); }
    else if (e.key === 'Escape') { press('clear'); }
    else if (e.key === 'Backspace') { cur = cur.length > 1 ? cur.slice(0, -1) : '0'; show(); }
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
  wrap.appendChild(list);

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
  function openList() {
    document.querySelectorAll('.csel-list.open').forEach((l) => l.classList.remove('open'));
    buildList();
    list.classList.add('open');
    trigger.classList.add('open');
  }
  function closeList() { list.classList.remove('open'); trigger.classList.remove('open'); }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    list.classList.contains('open') ? closeList() : openList();
  });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) closeList(); });
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

const YTDLP_DISCLAIMER_KEY = 'privoo:ytdlp-rights-shown';
async function runYtdlpDownload() {
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
}

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
  setInterval(refreshStats, 1500);
  // Incognito windows never persist their tab list — that would leak the
  // private session into the saved session restored by normal windows.
  if (!isIncognitoWin) {
    setInterval(() => { window.privoo.saveTabSession(serializeSession()).catch?.(() => {}); }, 5000);
  }
  // Observe the STRIP (stable width — only changes on window resize), not the
  // content-sized #tabs-scroll: observing the latter feedback-loops because
  // resizeTabs() changes tab widths, which resizes #tabs-scroll, which fires
  // the observer again — visibly janking the tabs when many are open.
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

function applyVerticalTabs(on) {
  document.body.classList.toggle('vertical-tabs', on);
  if (vtabsPanel) vtabsPanel.hidden = !on;
  if (on) {
    closeVtabsNewTabPages();
    renderVtabs();
    // With the popup disabled there's no overlay to fall back on, so make sure
    // there's always at least one real tab open.
    if (!vtabsSearchPopupEnabled() && tabs.length === 0) createTab();
  } else {
    hideSearchPopup();
    if (tabs.length === 0) createTab();
  }
}

// ── Vtabs integrated toolbar ─────────────────────────────────────────────────
const _toolbarActionsEl   = document.getElementById('toolbar-actions');
const _toolbarActionsHome = _toolbarActionsEl?.parentElement;
const _toolbarActionsNext = _toolbarActionsEl?.nextElementSibling;

function applyVtabsIntegrated(on) {
  document.body.classList.toggle('vtabs-integrated', on);
  const slot = document.getElementById('vtf-integrated-slot');
  if (!_toolbarActionsEl || !slot) return;
  if (on) {
    slot.appendChild(_toolbarActionsEl);
  } else if (_toolbarActionsHome && !_toolbarActionsHome.contains(_toolbarActionsEl)) {
    if (_toolbarActionsNext && _toolbarActionsHome.contains(_toolbarActionsNext)) {
      _toolbarActionsHome.insertBefore(_toolbarActionsEl, _toolbarActionsNext);
    } else {
      _toolbarActionsHome.appendChild(_toolbarActionsEl);
    }
  }
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
  if (titleEl) titleEl.textContent = tab.title || newTabLabel();
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
  titleEl.textContent = tab.title || newTabLabel();
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
  document.body.classList.toggle('vtabs-collapsed');
  await window.privoo?.saveSettings({ vtabsCollapsed: document.body.classList.contains('vtabs-collapsed') });
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

function showSearchPopup(forNewTab = true) {
  if (!searchPopupEl) return;
  _spForNewTab = forNewTab !== false;
  clearTimeout(_spCloseTimer);
  searchPopupEl.classList.remove('hidden', 'sp-closing');
  const panelW = (vtabsPanel && !vtabsPanel.hidden) ? vtabsPanel.offsetWidth : 0;
  searchPopupEl.style.paddingLeft = (panelW + 24) + 'px';
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
      ? { surface: '#2a2b2f', text: '#e8eaed', muted: '#bdc1c6', border: 'rgba(255,255,255,0.14)', hover: 'rgba(255,255,255,0.08)', input: '#202124' }
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
  function profileColor(id) {
    if (id === 'default') return cssVar('--accent', '#4f46e5');
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
          `<button id="_capply" style="flex:1;padding:11px;border-radius:10px;border:none;background:${ACCENT()};color:${cssVar('--on-accent','#202124')};font-size:13px;font-weight:600;cursor:pointer;">Apply</button>` +
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
      // Keep CSS var in sync
      avatarCircle.style.background = profileColor(active.id);
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
    if (!profilePanel.classList.contains('hidden') && !profilePanel.contains(e.target) && e.target !== profileBtn) closePanel();
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
    saveBtn.style.cssText = `flex:1;padding:11px;border-radius:10px;border:none;background:${ACCENT()};color:${cssVar('--on-accent','#202124')};font-size:13.5px;font-weight:600;cursor:pointer;`;

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
    { id: 'deepseek-chat',       label: 'DeepSeek V3 — general chat (recommended)' },
    { id: 'deepseek-v4-flash',   label: 'DeepSeek V4 Flash — fast & low cost' },
    { id: 'deepseek-v4-pro',     label: 'DeepSeek V4 Pro — most capable' },
    { id: 'deepseek-reasoner',   label: 'DeepSeek R1 — step-by-step reasoning' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash — fast (recommended)' },
    { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro — most capable' },
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
  ollama:    'Runs locally — no key needed.',
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
    hint.innerHTML = 'Found <b>' + n + '</b> local model' + (n > 1 ? 's' : '') + ' — runs fully offline on this device.';
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
    if (keyInp) keyInp.placeholder = _aiConfig.hasKeyFor?.[provider] ? 'Key saved — leave blank to keep' : 'Paste your key';
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
      '<div class="ai-empty-mark"><img src="privoo://newtab/logo.png" alt="" draggable="false" onerror="this.style.display=\'none\'"></div>' +
      '<h3>How can I help?</h3>' +
      '<p>Ask anything — summaries, ideas, code. Your chats are saved on this device.</p>' +
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

async function _aiSend() {
  if (_aiBusy) return;
  const inp = _aiEl('ai-input');
  const text = inp?.value?.trim();
  if (!text) return;

  // Block questions about Privoo itself — the model will likely make things up.
  if (_aiIsAboutPrivoo(text)) {
    _aiMessages.push({ role: 'user', content: text });
    _aiMessages.push({ role: 'err', content: '⚠ Privoo AI can\'t reliably answer questions about Privoo itself — it uses third-party models that don\'t have accurate info about this browser, so it may make things up. For real answers, check Settings → About or the Privoo website. (Message not sent.)' });
    if (inp) { inp.value = ''; inp.style.height = 'auto'; }
    _aiRenderChat();
    _aiPersistCurrent();
    return;
  }

  if (!_aiConfig.hasKey) {
    _aiMessages.push({ role: 'err', content: '⚠ Add your API key first — click Setup.' });
    _aiRenderChat();
    _aiOpenGate();
    return;
  }
  _aiMessages.push({ role: 'user', content: text });
  if (inp) { inp.value = ''; inp.style.height = 'auto'; }
  _aiRenderChat();
  _aiPersistCurrent();

  const payloadMsgs = _aiMessages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role, content: m.content }));

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
      _aiMessages.push({ role: 'err', content: '⚠ Add your API key first — click Setup.' });
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
    createTab('privoo://ai/');
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
  const show = !!(tab?.url && !tab.url.startsWith('privoo://') && !tab.url.startsWith('about:'));
  pipBtn.hidden = !show;
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
