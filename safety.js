'use strict';

/**
 * safety.js — Safe Mode & 18+ site blocking for Privoo.
 *
 * blockAdultSites: blocks navigation to adult/18+ domains using the
 *                  Hagezi "porn" blocklist — a plain-text domain list
 *                  with 100k+ entries, downloaded once and cached locally.
 *                  Refreshed every 24 hours in the background.
 *
 * safeMode:        injects CSS to blur images/videos on any page.
 *
 * Blocklist: https://github.com/hagezi/dns-blocklists (porn.txt)
 */

const path    = require('path');
const fs      = require('fs');
const { app } = require('electron');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
// Tried in order; first one that 200s wins. Hagezi reorganises the repo
// every so often (the old /domains/porn.txt path 404s now), and Steven
// Black's hosts repo is a known long-lived fallback.
const LIST_URLS = [
  'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/wildcard/porn-onlydomains.txt',
  'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/hosts/porn.txt',
  'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/domains/porn.txt',
  'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts',
];
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 h

function cachePath() {
  return path.join(app.getPath('userData'), 'adult-domains.txt');
}

// ---------------------------------------------------------------------------
// In-memory domain set — populated on first call to initAdultBlocker()
// ---------------------------------------------------------------------------
let _domains = null;   // Set<string> | null
let _initPromise = null;

/**
 * Parse a plain-text domain list (one domain per line, # comments ignored).
 * Handles:
 *   - bare domains: "example.com"
 *   - hosts format: "0.0.0.0 example.com" / "127.0.0.1 example.com"
 *   - wildcard format: "*.example.com" (strip the wildcard prefix)
 */
function parseDomainList(text) {
  const set = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const parts = line.split(/\s+/);
    let domain = (parts.length >= 2 ? parts[1] : parts[0]).toLowerCase();
    // Strip wildcards / leading dot.
    if (domain.startsWith('*.')) domain = domain.slice(2);
    if (domain.startsWith('.'))  domain = domain.slice(1);
    if (domain && !domain.includes('/') && domain.includes('.')) {
      set.add(domain);
    }
  }
  return set;
}

/**
 * Try each LIST_URL in turn until one returns 200. Falls back through the
 * list so a single broken mirror doesn't disable the blocker.
 */
async function downloadList() {
  let lastErr = null;
  for (const url of LIST_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) { lastErr = new Error(`HTTP ${res.status} (${url})`); continue; }
      const text = await res.text();
      if (!text || text.length < 1024) { lastErr = new Error(`Empty or tiny body (${url})`); continue; }
      fs.writeFileSync(cachePath(), text, 'utf8');
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All blocklist sources failed');
}

/**
 * Load the domain set from cache or network.
 * Safe to call multiple times — only runs once.
 */
async function initAdultBlocker() {
  if (_domains) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      let text = null;
      const cp = cachePath();

      // Use cached file if it exists, is fresh, AND non-trivial. The old
      // LIST_URL 404'd silently and wrote the 404 HTML body to disk, so
      // a small cached file is almost certainly garbage from a prior run.
      try {
        const stat = fs.statSync(cp);
        if (Date.now() - stat.mtimeMs < CACHE_TTL && stat.size > 4096) {
          text = fs.readFileSync(cp, 'utf8');
        }
      } catch { /* no cache yet */ }

      // Download if needed
      if (!text) {
        try {
          text = await downloadList();
        } catch (e) {
          console.warn('Privoo: adult blocklist download failed:', e.message);
          // Try stale cache as last resort (better than nothing)
          try { text = fs.readFileSync(cp, 'utf8'); } catch { /* nothing */ }
        }
      }

      if (text) {
        _domains = parseDomainList(text);
        // Sanity-check: if the parse yielded almost nothing, the cache is
        // probably stale HTML or an error page. Throw it out and try the
        // network again so we don't permanently no-op.
        if (_domains.size < 100) {
          try { fs.unlinkSync(cp); } catch {}
          _domains = null;
          try {
            const fresh = await downloadList();
            _domains = parseDomainList(fresh);
          } catch (e) {
            console.warn('Privoo: adult blocklist re-fetch failed:', e.message);
            _domains = new Set();
          }
        }
        console.log(`Privoo: adult blocklist loaded — ${_domains.size} domains`);
      } else {
        _domains = new Set(); // empty — fail open
        console.warn('Privoo: adult blocklist unavailable, 18+ blocking disabled');
      }
    } catch (e) {
      _domains = new Set();
      console.warn('Privoo: adult blocker init error:', e.message);
    }
  })();

  return _initPromise;
}

/**
 * Returns true if the hostname is on the adult blocklist.
 * Always returns false until initAdultBlocker() has resolved.
 */
function isAdultDomain(hostname) {
  if (!hostname || !_domains || _domains.size === 0) return false;
  const h = hostname.toLowerCase().replace(/^www\./, '');
  if (_domains.has(h)) return true;
  // Check parent domains (e.g. sub.porn.com → porn.com)
  const parts = h.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    if (_domains.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Safe Mode — CSS injection
// ---------------------------------------------------------------------------
const SAFE_MODE_CSS = `
  img, video {
    filter: blur(14px) !important;
    transition: filter 0.15s !important;
  }
  img:hover, video:hover { filter: blur(14px) !important; }
  [class*="nude"],[class*="nsfw"],[class*="adult"],[class*="xxx"],[class*="porn"],[class*="erotic"] {
    filter: blur(22px) !important;
    pointer-events: none !important;
  }
`;

function buildSafeModeScript() {
  const escaped = SAFE_MODE_CSS.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  return `(function(){
  if(document.getElementById('__privoo_safe__'))return;
  var s=document.createElement('style');
  s.id='__privoo_safe__';
  s.textContent=\`${escaped}\`;
  document.documentElement.appendChild(s);
})();`;
}

module.exports = { isAdultDomain, initAdultBlocker, buildSafeModeScript };
