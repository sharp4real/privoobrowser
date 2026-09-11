'use strict';

/**
 * Runs after every `npm install`.
 *
 * The castLabs Electron fork this project depends on ("electron-releases#v42.3.3+wvcus")
 * is installed from a git URL rather than the npm registry, and its own postinstall
 * step (which downloads the actual multi-hundred-MB binary from GitHub) does not
 * always run to completion — this project's own CI workflow works around it with an
 * explicit fallback step, because `npm ci` was found not to run it reliably. The same
 * flakiness can happen with a plain `npm install` on a real machine: node_modules/electron
 * exists (so npm considers the install successful) but node_modules/electron/dist is
 * empty, so there is no binary to launch.
 *
 * When that happens, `npm start` / `electron .` has nothing to run. Depending on how it
 * is invoked, that can fail with no visible output at all — indistinguishable, from the
 * outside, from the app simply not opening.
 *
 * This checks for the binary right after install and, if it is missing, runs the same
 * fallback CI already relies on. If it is STILL missing after that, this fails the
 * install loudly with a clear reason, rather than leaving a broken environment for
 * `npm start` to fail against later with no explanation.
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
  process.exit(0);
}

console.log('electron binary missing or incomplete (' + bin + ') — running its installer…');

try {
  // Same fallback the release workflow uses. This is the actual download
  // step; electron's own package.json postinstall calls the same file.
  require(path.join(__dirname, '..', 'node_modules', 'electron', 'install.js'));
} catch (err) {
  console.error('electron/install.js threw: ' + (err && err.message));
}

if (looksReal(bin)) {
  console.log('electron binary downloaded successfully: ' + bin);
  process.exit(0);
}

console.error('');
console.error('  Electron did not finish downloading, and `npm start` will not');
console.error('  do anything until it does — no window, no error, nothing.');
console.error('');
console.error('  Try:');
console.error('    node node_modules/electron/install.js');
console.error('  and read whatever it prints. It usually means a network or');
console.error('  firewall problem reaching GitHub, or an antivirus quarantining');
console.error('  the download. If it says nothing useful, delete node_modules');
console.error('  and run npm install again.');
console.error('');
process.exit(1);
