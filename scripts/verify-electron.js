'use strict';

/**
 * Runs after every `npm install`.
 *
 * The castLabs Electron fork this project depends on ("electron-releases#v42.3.3+wvcus")
 * is installed from a git URL rather than the npm registry, and its own postinstall
 * step (which downloads the actual multi-hundred-MB binary from GitHub) does not
 * always finish before control returns to the rest of the install — this project's
 * own CI workflow works around it with a separate, explicit, properly-awaited
 * download step right after `npm ci`, because that race was found to bite there.
 * The same thing can happen with a plain `npm install` on a real machine:
 * node_modules/electron exists (so npm calls the install successful) but
 * node_modules/electron/dist is empty, so there is nothing for `electron .` to
 * launch — and depending on how it's invoked, that can fail with no visible
 * output at all, indistinguishable from the outside from the app simply not
 * opening.
 *
 * This checks for the binary and, if it's missing, says so clearly — but it is
 * NOT the download step, and it never fails the install. Two earlier, more
 * aggressive versions of this file both turned out to be wrong in ways that only
 * showed up under real conditions, not in the one test I ran (which happened to
 * already have the binary in place, so it never exercised the missing-binary
 * path at all):
 *
 *   - It tried requiring node_modules/electron/install.js itself as a "fallback"
 *     download. That starts a real, asynchronous, multi-minute network fetch and
 *     does not wait for it, so the very next line — checking whether the binary
 *     is now there — still saw it missing and treated that as final failure.
 *   - It then exited non-zero on that "final" failure. During `npm ci` the
 *     binary is EXPECTED to still be missing at this exact point — that's the
 *     whole reason the workflow has a separate step for it right afterward —
 *     so this made every CI run fail immediately, before that step ever got a
 *     chance to run. It broke the v6.0.5 release in 37 seconds.
 *
 * So: check only, warn only, never fail. A real local dev whose binary never
 * shows up at all still gets a clear pointer to the fix the first time they run
 * `npm start` and nothing happens — see main.js's own startup crash dialog,
 * which now fires for exactly that case. This script's job is just to make the
 * likely cause visible at install time, not to police it.
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'node_modules', 'electron', 'dist');

function binaryPath() {
  if (process.platform === 'win32') return path.join(distDir, 'electron.exe');
  if (process.platform === 'darwin') return path.join(distDir, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  return path.join(distDir, 'electron');
}

function looksReal(p) {
  try {
    const st = fs.statSync(p);
    // A failed/partial download can leave a stub file behind; the real
    // binary is well over 100MB on every platform this ships for.
    return st.isFile() && st.size > 50 * 1024 * 1024;
  } catch {
    return false;
  }
}

const bin = binaryPath();

if (looksReal(bin)) {
  console.log('electron binary present: ' + bin);
} else {
  console.log('');
  console.log('  Note: the electron binary is not at ' + bin + ' yet.');
  console.log('  That is expected right after `npm ci` in CI, and can happen briefly');
  console.log('  after a plain `npm install` too — its own postinstall download does');
  console.log('  not always finish before this runs.');
  console.log('');
  console.log('  If `npm start` does nothing once install has fully finished, run:');
  console.log('    node node_modules/electron/install.js');
  console.log('  and read what it prints — usually a network/firewall problem reaching');
  console.log('  GitHub, or an antivirus quarantining the download.');
  console.log('');
}

// Always succeed. This is a diagnostic note, not a gate — see the file header
// for why a version of this that failed the install was actively wrong.
process.exit(0);
