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
const { buildGoogleSpoofScript } = require('./google-spoof');

// Chrome version is passed from main via additionalArguments so it always
// matches the UA + client hints set on the popup. Falls back to the spoof's
// own default when absent.
function chromeVersionFromArgv() {
  const flag = '--privoo-cv=';
  const arg = process.argv.find((s) => typeof s === 'string' && s.startsWith(flag));
  return arg ? arg.slice(flag.length) : undefined;
}

try {
  const script = buildGoogleSpoofScript({
    chromeVersion: chromeVersionFromArgv(),
    platform: process.platform,
  });
  webFrame.executeJavaScript(script).catch(() => {});
} catch (e) { /* ignore */ }
