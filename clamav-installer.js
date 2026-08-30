'use strict';

/**
 * ClamAV installer for Privoo Guard.
 *
 * Installs the portable ClamAV build into `userData/clamav/` and fetches the
 * signature database with freshclam. Nothing here runs on its own — it is only
 * ever started from the Install button in Settings, because downloading a few
 * hundred megabytes and an antivirus engine is not something to do unasked.
 *
 * Source: GitHub releases for Cisco-Talos/clamav. The portable .zip is used in
 * preference to the .msi so no administrator rights are needed and everything
 * stays inside userData (making uninstall a single directory delete).
 *
 * Windows only for automatic install. On macOS/Linux ClamAV comes from the
 * system package manager (brew/apt/dnf), which we must not drive silently, so
 * those platforms fall back to the download page.
 */

const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const GITHUB_API = 'https://api.github.com/repos/Cisco-Talos/clamav/releases/latest';

function rootDir()  { return path.join(app.getPath('userData'), 'clamav'); }
function binDir()   { return path.join(rootDir(), 'bin'); }
function dbDir()    { return path.join(rootDir(), 'db'); }
function metaPath() { return path.join(rootDir(), '.clamav-meta.json'); }

function readMeta() {
  try { return JSON.parse(fs.readFileSync(metaPath(), 'utf8')); } catch { return {}; }
}
function writeMeta(m) {
  try {
    fs.mkdirSync(rootDir(), { recursive: true });
    fs.writeFileSync(metaPath(), JSON.stringify(m, null, 2), 'utf8');
  } catch (e) { console.warn('Privoo: clamav meta write failed:', e.message); }
}

function exe(name) { return process.platform === 'win32' ? name + '.exe' : name; }

/** Recursively look for a binary inside the extracted tree. */
function findIn(dir, name, depth = 0) {
  if (depth > 4) return null;
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return path.join(dir, e.name);
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      const hit = findIn(path.join(dir, e.name), name, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Path to our managed clamscan, or null if we have not installed one. */
function managedScanner() {
  const p = findIn(binDir(), exe('clamscan'));
  return p && fs.existsSync(p) ? p : null;
}
function managedFreshclam() {
  const p = findIn(binDir(), exe('freshclam'));
  return p && fs.existsSync(p) ? p : null;
}
function managedDbDir() {
  return fs.existsSync(dbDir()) ? dbDir() : null;
}

/** Signatures present? Without a database clamscan refuses to run. */
function hasDatabase() {
  try {
    return fs.readdirSync(dbDir()).some((f) => /\.(cvd|cld)$/i.test(f));
  } catch { return false; }
}

function supportsAutoInstall() { return process.platform === 'win32'; }

function fetchBuffer(url, { headers = {}, onProgress = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET', redirect: 'follow' });
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
    req.setHeader('User-Agent', 'PrivooBrowser/1.0 (Privoo Guard installer)');
    req.on('response', (res) => {
      if (res.statusCode >= 400) { reject(new Error('HTTP ' + res.statusCode)); return; }
      const total = parseInt(res.headers['content-length'] || 0, 10) || 0;
      const chunks = [];
      let got = 0;
      res.on('data', (c) => {
        chunks.push(c); got += c.length;
        if (onProgress) onProgress(got, total);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Pick the portable x64 zip from the latest release. */
async function findAsset() {
  const buf = await fetchBuffer(GITHUB_API, { headers: { Accept: 'application/vnd.github+json' } });
  const rel = JSON.parse(buf.toString('utf8'));
  const assets = rel.assets || [];
  // e.g. clamav-1.4.3.win.x64.zip — prefer the zip over the .msi installer so
  // the whole thing stays in userData and needs no elevation.
  const asset = assets.find((a) => /win\.x64\.zip$/i.test(a.name))
             || assets.find((a) => /win.*x64.*\.zip$/i.test(a.name));
  if (!asset) throw new Error('No portable Windows build in the latest ClamAV release.');
  return { asset, tag: rel.tag_name || '' };
}

/** Extract a zip with bsdtar, which ships with Windows 10+ and handles zips. */
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    execFile('tar', ['-xf', zipPath, '-C', destDir], { windowsHide: true }, (err) => {
      if (err) reject(new Error('Could not extract the ClamAV archive: ' + err.message));
      else resolve();
    });
  });
}

/** Minimal freshclam config — the shipped sample is inert until edited. */
function writeFreshclamConf() {
  const conf = path.join(rootDir(), 'freshclam.conf');
  fs.mkdirSync(dbDir(), { recursive: true });
  fs.writeFileSync(conf, [
    '# Generated by Privoo Guard.',
    'DatabaseDirectory ' + dbDir(),
    'DatabaseMirror database.clamav.net',
    'CompressLocalDatabase no',
    'ScriptedUpdates yes',
    '',
  ].join('\n'), 'utf8');
  return conf;
}

/**
 * Download signatures. This is the slow part (a few hundred MB on first run)
 * and is reported as its own phase so the UI can say so.
 */
function runFreshclam(onEvent) {
  return new Promise((resolve) => {
    const fc = managedFreshclam();
    if (!fc) { resolve(false); return; }
    const conf = writeFreshclamConf();
    const child = spawn(fc, ['--config-file=' + conf, '--datadir=' + dbDir()], { windowsHide: true });
    const line = (s) => {
      const t = String(s).trim();
      if (t) onEvent({ type: 'progress', phase: 'signatures', message: t.split(/\r?\n/).pop() });
    };
    child.stdout.on('data', line);
    child.stderr.on('data', line);
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(hasDatabase()));
  });
}

let _installing = false;
function isInstalling() { return _installing; }

/**
 * Full background install: engine, then signatures.
 * `onEvent` receives { type: 'progress'|'done'|'error', ... } throughout.
 */
async function install(onEvent) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  if (_installing) { emit({ type: 'error', message: 'Install already in progress.' }); return false; }
  if (!supportsAutoInstall()) {
    emit({ type: 'error', message: 'Automatic install is Windows-only. Install ClamAV with your package manager, then use Locate.' });
    return false;
  }
  _installing = true;
  try {
    emit({ type: 'progress', phase: 'engine', message: 'Finding the latest ClamAV…', percent: 0 });
    const { asset, tag } = await findAsset();

    emit({ type: 'progress', phase: 'engine', message: 'Downloading ClamAV ' + tag + '…', percent: 0 });
    const zipBuf = await fetchBuffer(asset.browser_download_url, {
      onProgress: (got, total) => {
        const pct = total ? Math.round((got / total) * 100) : 0;
        emit({ type: 'progress', phase: 'engine', message: 'Downloading ClamAV ' + tag + '…', percent: pct });
      },
    });

    fs.mkdirSync(rootDir(), { recursive: true });
    const zipPath = path.join(rootDir(), 'clamav.zip');
    fs.writeFileSync(zipPath, zipBuf);

    emit({ type: 'progress', phase: 'engine', message: 'Extracting…', percent: 100 });
    // Replace any previous install so a retry cannot mix two versions.
    try { fs.rmSync(binDir(), { recursive: true, force: true }); } catch { /* nothing there */ }
    await extractZip(zipPath, binDir());
    try { fs.unlinkSync(zipPath); } catch { /* keep going */ }

    if (!managedScanner()) throw new Error('clamscan was not found in the downloaded archive.');

    emit({ type: 'progress', phase: 'signatures', message: 'Downloading virus signatures. This is the large part and can take a while…' });
    const ok = await runFreshclam(emit);

    writeMeta({ version: tag, installedAt: Date.now(), hasDatabase: ok });
    _installing = false;

    if (!ok) {
      emit({ type: 'error', message: 'ClamAV installed, but the signature download failed. Use Update signatures to retry.' });
      return false;
    }
    emit({ type: 'done', version: tag });
    return true;
  } catch (e) {
    _installing = false;
    emit({ type: 'error', message: e.message || 'Install failed.' });
    return false;
  }
}

/** Refresh signatures on an existing managed install. */
async function updateSignatures(onEvent) {
  const emit = typeof onEvent === 'function' ? onEvent : () => {};
  if (!managedFreshclam()) { emit({ type: 'error', message: 'ClamAV was not installed by Privoo.' }); return false; }
  emit({ type: 'progress', phase: 'signatures', message: 'Updating signatures…' });
  const ok = await runFreshclam(emit);
  emit(ok ? { type: 'done' } : { type: 'error', message: 'Signature update failed.' });
  return ok;
}

function uninstall() {
  try { fs.rmSync(rootDir(), { recursive: true, force: true }); return true; }
  catch { return false; }
}

module.exports = {
  install, updateSignatures, uninstall, isInstalling,
  managedScanner, managedDbDir, hasDatabase, supportsAutoInstall,
  readMeta, rootDir,
};
