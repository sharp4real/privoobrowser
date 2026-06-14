'use strict';

// Preload for OAuth / "Sign in with X" popup windows (e.g. TikTok's "Continue
// with Google"). Those open as a real BrowserWindow that navigates to
// accounts.google.com immediately. Injecting the anti-detection spoof via CDP
// raced the page's inline detection scripts and intermittently produced
// "This browser or app may not be secure".
//
// Preloads run at document-start, before any page script, so running the spoof
// here is race-free. With contextIsolation on we hop into the page's main world
// via webFrame.executeJavaScript so the navigator/window overrides actually
// apply to the page.

const { webFrame } = require('electron');
const fs = require('fs');
const path = require('path');
const { buildGoogleSpoofScript } = require('./google-spoof');

// Embed logo.png as a data URI so the badge renders without depending on
// the page's CSP or the privoo:// scheme being reachable cross-origin.
function logoDataUri() {
  const candidates = [
    path.join(__dirname, 'logo.png'),
    process.resourcesPath ? path.join(process.resourcesPath, 'logo.png') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'app.asar', 'logo.png') : null,
  ].filter(Boolean);
  for (const p of candidates) {
    try { return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); } catch { /* try next */ }
  }
  return 'privoo://newtab/logo.png';
}

// Privacy protection badge shown in the top-right of Google sign-in popups.
// Horizontal layout: logo on left, "Privoo / Protected" text on right.
// Always visible; clicking shows a detail popover.
function privacyBadgeScript(logoSrc) {
  return `(function(){
  if(window.__privooBadge)return; window.__privooBadge=1;
  var F='-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
  function isGoogle(){ try{ return /(^|\\.)(google|gstatic|googleusercontent)\\.[a-z.]+$/i.test(location.hostname)||/(^|\\.)accounts\\.youtube\\.com$/i.test(location.hostname); }catch(e){ return false; } }
  function mount(){
    if(!isGoogle()) return;
    if(!document.body){ return setTimeout(mount,150); }
    if(document.getElementById('privoo-protect-badge')) return;

    // ── Outer wrapper ──────────────────────────────────────────────────────────
    var wrap=document.createElement('div');
    wrap.id='privoo-protect-badge';
    wrap.style.cssText='position:fixed;top:16px;right:18px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:10px;';

    // ── Persistent card ────────────────────────────────────────────────────────
    var card=document.createElement('div');
    card.style.cssText=[
      'display:flex;align-items:center;gap:10px;',
      'padding:10px 14px 10px 10px;',
      'background:rgba(15,15,18,0.93);',
      'border:1px solid rgba(255,255,255,0.1);',
      'border-radius:16px;',
      'box-shadow:0 6px 24px rgba(0,0,0,0.5);',
      'cursor:pointer;',
      'transition:background .15s,transform .15s,box-shadow .15s;',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      'user-select:none;',
      'font-family:'+F+';',
    ].join('');
    card.onmouseenter=function(){ card.style.background='rgba(24,24,30,0.97)'; card.style.transform='scale(1.03)'; card.style.boxShadow='0 8px 30px rgba(0,0,0,0.6)'; };
    card.onmouseleave=function(){ card.style.background='rgba(15,15,18,0.93)'; card.style.transform=''; card.style.boxShadow='0 6px 24px rgba(0,0,0,0.5)'; };

    // Logo
    var imgWrap=document.createElement('div');
    imgWrap.style.cssText='width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    var img=document.createElement('img');
    img.src=${JSON.stringify(logoSrc)}; img.alt='';
    img.style.cssText='width:26px;height:26px;object-fit:contain;pointer-events:none;display:block;';
    imgWrap.appendChild(img);

    // Text column
    var col=document.createElement('div');
    col.style.cssText='display:flex;flex-direction:column;gap:2px;';

    var name=document.createElement('div');
    name.textContent='Privoo';
    name.style.cssText='font-size:14px;font-weight:700;color:#fff;line-height:1.2;letter-spacing:-.01em;';

    var sub=document.createElement('div');
    sub.style.cssText='display:flex;align-items:center;gap:4px;font-size:11px;color:rgba(255,255,255,0.55);line-height:1.2;font-weight:500;';
    // Green shield SVG
    var svg='<svg width="11" height="11" viewBox="0 0 24 24" fill="none" style="flex-shrink:0"><path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z" fill="#34d399"/></svg>';
    sub.innerHTML=svg+'<span>Protecting this sign-in</span>';

    col.appendChild(name);
    col.appendChild(sub);
    card.appendChild(imgWrap);
    card.appendChild(col);

    // ── Detail popover ─────────────────────────────────────────────────────────
    var pop=document.createElement('div');
    pop.style.cssText=[
      'max-width:260px;padding:14px 16px;',
      'border-radius:14px;',
      'background:rgba(15,15,18,0.97);',
      'border:1px solid rgba(255,255,255,0.1);',
      'color:#fff;font-family:'+F+';',
      'box-shadow:0 12px 36px rgba(0,0,0,0.6);',
      'font-size:13px;line-height:1.55;',
      'opacity:0;transform:translateY(-4px) scale(0.97);pointer-events:none;',
      'transition:opacity .18s ease,transform .18s ease;',
    ].join('');
    pop.innerHTML=[
      '<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px;">',
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4z" fill="#34d399"/></svg>',
        '<span style="font-size:14px;font-weight:700;letter-spacing:-.01em;">You\'re protected</span>',
      '</div>',
      '<p style="margin:0 0 8px;color:rgba(255,255,255,0.78);font-size:12.5px;">',
        'Privoo is blocking trackers and fingerprinting on this sign-in.',
      '</p>',
      '<p style="margin:0;color:rgba(255,255,255,0.45);font-size:11px;">',
        'Nothing you enter here is shared with third parties.',
      '</p>',
    ].join('');

    var open=false,t;
    function show(){ open=true; pop.style.opacity='1'; pop.style.transform='translateY(0) scale(1)'; pop.style.pointerEvents='auto'; clearTimeout(t); t=setTimeout(hide,5500); }
    function hide(){ open=false; pop.style.opacity='0'; pop.style.transform='translateY(-4px) scale(0.97)'; pop.style.pointerEvents='none'; }
    card.addEventListener('click',function(e){ e.stopPropagation(); open?hide():show(); });
    document.addEventListener('click',function(){ if(open) hide(); });

    wrap.appendChild(pop);
    wrap.appendChild(card);
    document.documentElement.appendChild(wrap);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount); else mount();
  })();`;
}

// Chrome version is passed from main via additionalArguments so it always
// matches the UA + client hints set on the popup. Falls back to the spoof's
// own default when absent.
function chromeVersionFromArgv() {
  const flag = '--privoo-cv=';
  const arg = process.argv.find((s) => typeof s === 'string' && s.startsWith(flag));
  return arg ? arg.slice(flag.length) : undefined;
}

// Set by main for popups opened from a TikTok/ByteDance page — forces the
// pristine (no-tampering) environment even when the popup is on about:blank,
// so webmssdk doesn't flag the verification window with "maximum attempts".
function forcePristineFromArgv() {
  return process.argv.some((s) => s === '--privoo-pristine=1');
}

try {
  const script = buildGoogleSpoofScript({
    chromeVersion: chromeVersionFromArgv(),
    platform: process.platform,
    forcePristine: forcePristineFromArgv(),
  });
  webFrame.executeJavaScript(script).catch(() => {});
} catch (e) { /* ignore */ }

try {
  webFrame.executeJavaScript(privacyBadgeScript(logoDataUri())).catch(() => {});
} catch (e) { /* ignore */ }
