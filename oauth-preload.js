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

// Embed logo.png as a data URI so the badge below renders without depending on
// the page's CSP or the privoo:// scheme being reachable cross-origin. Falls
// back to the privoo:// URL (CSP is stripped on Google auth pages anyway).
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

// A small Privoo logo badge in the top-right of the sign-in popup. Clicking it
// reassures the user that the login is protected. Only shows on Google sign-in
// hosts (the popup these windows actually land on).
function privacyBadgeScript(logoSrc) {
  return `(function(){
  if(window.__privooBadge)return; window.__privooBadge=1;
  function isGoogle(){ try{ return /(^|\\.)(google|gstatic|googleusercontent)\\.[a-z.]+$/i.test(location.hostname) || /(^|\\.)accounts\\.youtube\\.com$/i.test(location.hostname); }catch(e){ return false; } }
  function mount(){
    if(!isGoogle()) return;
    if(!document.body){ return setTimeout(mount,150); }
    if(document.getElementById('privoo-protect-badge')) return;
    var wrap=document.createElement('div');
    wrap.id='privoo-protect-badge';
    wrap.style.cssText='position:fixed;top:12px;right:14px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:9px;font:13px system-ui,-apple-system,Segoe UI,sans-serif;';
    var btn=document.createElement('button');
    btn.type='button'; btn.setAttribute('aria-label','Privoo privacy');
    btn.style.cssText='width:36px;height:36px;border-radius:50%;border:none;padding:0;cursor:pointer;background:rgba(20,20,24,.88);box-shadow:0 2px 12px rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;transition:transform .15s ease;';
    btn.onmouseenter=function(){btn.style.transform='scale(1.09)';};
    btn.onmouseleave=function(){btn.style.transform='scale(1)';};
    var img=document.createElement('img');
    img.src=${JSON.stringify(logoSrc)}; img.alt='Privoo';
    img.style.cssText='width:23px;height:23px;object-fit:contain;border-radius:50%;pointer-events:none;';
    btn.appendChild(img);
    var pop=document.createElement('div');
    pop.style.cssText='max-width:236px;padding:11px 14px;border-radius:13px;background:rgba(20,20,24,.95);color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.45);line-height:1.45;opacity:0;transform:translateY(-6px);pointer-events:none;transition:opacity .18s ease,transform .18s ease;';
    pop.innerHTML='<b style="display:block;margin-bottom:3px">You\\u2019re protected \\uD83D\\uDEE1\\uFE0F</b>Privoo is blocking trackers and fingerprinting on this sign-in \\u2014 nothing here is shared with third parties.';
    var open=false,t;
    function show(){open=true;pop.style.opacity='1';pop.style.transform='translateY(0)';clearTimeout(t);t=setTimeout(hide,4500);}
    function hide(){open=false;pop.style.opacity='0';pop.style.transform='translateY(-6px)';}
    btn.onclick=function(e){e.stopPropagation();open?hide():show();};
    document.addEventListener('click',function(){ if(open) hide(); });
    wrap.appendChild(btn); wrap.appendChild(pop);
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
