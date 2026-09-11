'use strict';

/**
 * Runs before every build, locally and in CI. If this fails, the build does
 * not happen — that is the whole point of it.
 *
 * v6.0.4 shipped and could not open: main.js required 8 modules that were
 * never added to package.json's build.files, which electron-builder treats
 * as an allowlist once you specify it. They never made it into app.asar, so
 * the first require() of any of them crashed the process before any window
 * opened. It built cleanly, CI went green, and it still didn't work — because
 * nothing anywhere actually checked that build.files matched what the code
 * requires. This script is that check, made permanent instead of living in a
 * scratch file I have to remember to re-run by hand.
 *
 * It verifies three things, all previously-real ways this project has shipped
 * broken:
 *
 *   1. Every file reachable from main.js — by require() and by the
 *      path.join(__dirname, '...') pattern used for preload scripts, which
 *      require() alone does not see — is covered by build.files.
 *   2. Every literal (non-glob) entry in build.files actually exists on disk.
 *   3. Every extraResources "from" path actually exists on disk.
 *
 * Exit code is the contract: 0 means every file the packaged app will need is
 * genuinely present in the package.json config that decides what ships.
 * Anything else means don't build, don't tag, don't release.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const build = pkg.build || {};

let bad = 0;
const fail = (msg) => { console.error('  FAIL  ' + msg); bad++; };
const ok = (msg) => console.log('  ok    ' + msg);

// ── 1. Every require()-reachable and preload-path-reachable file, covered ──
{
  const filesCfg = build.files || [];
  const flat = new Set();
  const dirGlobs = [];
  for (const pat of filesCfg) {
    if (pat.includes('**')) dirGlobs.push(pat.split('/')[0]);
    else flat.add(pat);
  }
  const covered = (rel) => flat.has(rel) || dirGlobs.some((p) => rel === p || rel.startsWith(p + '/'));

  const seen = new Set();
  const queue = ['main.js'];
  const missing = [];

  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    seen.add(rel);

    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) { missing.push(rel + '  (required, but does not exist on disk)'); continue; }
    if (!covered(rel)) missing.push(rel + '  (required by the app, but not in build.files)');

    const src = fs.readFileSync(full, 'utf8');

    for (const m of src.matchAll(/require\(\s*(['"])(\.\.?\/[^'"]+)\1\s*\)/g)) {
      let r = m[2];
      if (!/\.(js|json|node)$/.test(r)) r += '.js';
      const resolved = path.normalize(path.join(path.dirname(rel), r)).split(path.sep).join('/');
      if (!seen.has(resolved)) queue.push(resolved);
    }
    // Preload scripts are loaded by path, not require() — a second file
    // category that has hidden a missing file from this check before.
    for (const m of src.matchAll(/__dirname,\s*(['"])([a-zA-Z0-9_-]+\.js)\1/g)) {
      const resolved = path.normalize(path.join(path.dirname(rel), m[2])).split(path.sep).join('/');
      if (!seen.has(resolved)) queue.push(resolved);
    }
  }

  if (missing.length) {
    fail(missing.length + ' file(s) the app needs are not covered by build.files:');
    for (const m of missing) console.error('          ' + m);
  } else {
    ok(seen.size + ' files reachable from main.js, all covered by build.files');
  }
}

// ── 2. Every literal build.files entry exists ──────────────────────────────
{
  const missing = (build.files || []).filter((f) => !f.includes('*') && !fs.existsSync(path.join(ROOT, f)));
  if (missing.length) fail('build.files lists file(s) that do not exist: ' + missing.join(', '));
  else ok('every literal build.files entry exists on disk');
}

// ── 3. Every extraResources entry exists ────────────────────────────────────
{
  const missing = (build.extraResources || []).filter((r) => !fs.existsSync(path.join(ROOT, r.from)));
  if (missing.length) fail('extraResources references file(s) that do not exist: ' + missing.map((r) => r.from).join(', '));
  else ok('every extraResources entry exists on disk');
}

console.log('');
if (bad) {
  console.error(bad + ' problem(s) found. Not safe to build or release.');
  process.exit(1);
} else {
  console.log('packaging is consistent with what the app actually needs.');
  process.exit(0);
}
