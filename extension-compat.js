'use strict';

/**
 * Installs the background bridge into an unpacked extension.
 *
 * The shim is written into the extension's folder and the manifest's background
 * entry is pointed at a wrapper that imports it first. A module imported before
 * the entry point is evaluated before the entry's own dependencies, which is
 * what makes the APIs available in time.
 *
 * The original manifest is copied to manifest.privoo-original.json first. The
 * extension's own code is never edited.
 *
 * Chromium keeps a service-worker registration per script URL, so an extension
 * that was already installed starts using the bridge on the next launch. A new
 * install is patched before its first load.
 */

const fs = require('fs');
const path = require('path');
const { buildBackgroundShim } = require('./extension-bg-bridge');

const SHIM_FILE = 'privoo-bridge.js';
const WRAPPER_FILE = 'privoo-bridge-background.js';
const MANIFEST_BACKUP = 'manifest.privoo-original.json';

/**
 * Patch one unpacked extension. Idempotent: re-running rewrites the shim — the
 * loopback port changes every launch, so the bridge has to be refreshed even
 * when the manifest already points at the wrapper — but the manifest itself is
 * left alone once patched.
 *
 * Returns { patched, reason }. `patched:false` is normal — most calls have
 * nothing to do — and never an error the caller must surface.
 */
function applyCompatShim(extDir, token, port) {
  const manifestPath = path.join(extDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return { patched: false, reason: 'could not read manifest.json' };
  }

  const bg = manifest.background;
  if (!bg || typeof bg !== 'object') return { patched: false, reason: 'no background context' };

  // The shim carries the session's API token, so refresh it every time even
  // when the manifest is already pointing at the wrapper.
  try {
    fs.writeFileSync(path.join(extDir, SHIM_FILE), buildBackgroundShim(token, port), 'utf8');
  } catch (err) {
    return { patched: false, reason: 'could not write the bridge: ' + err.message };
  }

  if (bg.privooBridge) return { patched: false, reason: 'already patched' };

  if (typeof bg.service_worker === 'string' && bg.service_worker) {
    const original = bg.service_worker.replace(/^\.?\//, '');
    const wrapper = bg.type === 'module'
      ? `import './${SHIM_FILE}';\nimport './${original}';\n`
      : `importScripts('${SHIM_FILE}');\nimportScripts('${original}');\n`;
    fs.writeFileSync(path.join(extDir, WRAPPER_FILE), wrapper, 'utf8');
    backupManifest(extDir, manifestPath);
    bg.service_worker = WRAPPER_FILE;
    bg.privooBridge = true;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return { patched: true, reason: 'service worker' };
  }

  if (Array.isArray(bg.scripts) && bg.scripts.length) {
    backupManifest(extDir, manifestPath);
    bg.scripts = [SHIM_FILE, ...bg.scripts];
    bg.privooBridge = true;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    return { patched: true, reason: 'background scripts' };
  }

  return { patched: false, reason: 'background page not supported' };
}

function backupManifest(extDir, manifestPath) {
  const backup = path.join(extDir, MANIFEST_BACKUP);
  try {
    if (!fs.existsSync(backup)) fs.copyFileSync(manifestPath, backup);
  } catch { /* the bridge is still worth installing without a backup */ }
}

module.exports = { applyCompatShim, SHIM_FILE, WRAPPER_FILE, MANIFEST_BACKUP };
