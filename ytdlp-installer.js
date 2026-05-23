'use strict';

/**
 * yt-dlp auto-installer.
 *
 * On first run (and periodically after that) downloads the latest yt-dlp
 * release for the current platform into `userData/bin/`. Works on Windows,
 * macOS, and Linux without bundling a binary into the app package.
 *
 * Source: GitHub Releases for yt-dlp/yt-dlp.
 *   Windows  → yt-dlp.exe
 *   macOS    → yt-dlp_macos
 *   Linux    → yt-dlp (single-file Python "zipapp"; needs python3 on PATH)
 *
 * Auto-update cadence: a background check fires once per launch but only
 * actually re-downloads if more than 24 h has passed since the last install.
 */

const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const GITHUB_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h between background updates

function platformAssetName() {
  if (process.platform === 'win32')  return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  return 'yt-dlp';
}
function localBinaryName() {
  // What we save it as on disk + run via spawn.
  return process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
}

function binDir() {
  return path.join(app.getPath('userData'), 'bin');
}
function binPath() {
  return path.join(binDir(), localBinaryName());
}
function metaPath() {
  return path.join(binDir(), '.ytdlp-meta.json');
}
function readMeta() {
  try { return JSON.parse(fs.readFileSync(metaPath(), 'utf8')); } catch { return {}; }
}
function writeMeta(meta) {
  try {
    fs.mkdirSync(binDir(), { recursive: true });
    fs.writeFileSync(metaPath(), JSON.stringify(meta, null, 2), 'utf8');
  } catch (e) {
    console.warn('Privoo: yt-dlp meta write failed:', e.message);
  }
}

// Net request returning a Buffer. Uses Electron's `net` so it follows system
// proxy settings and shares the app's network stack (no extra deps).
function fetchBuffer(url, { followRedirects = true, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({
      url,
      method: 'GET',
      redirect: followRedirects ? 'follow' : 'manual',
    });
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
    req.setHeader('User-Agent', 'PrivooBrowser/1.0 (yt-dlp installer)');
    req.on('response', (res) => {
      if (res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} from ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end',  () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fetchLatestRelease() {
  const buf = await fetchBuffer(GITHUB_API, { headers: { Accept: 'application/vnd.github+json' } });
  return JSON.parse(buf.toString('utf8'));
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function downloadLatest() {
  const release = await fetchLatestRelease();
  const tag = release.tag_name || '';
  const wantName = platformAssetName();
  const asset = (release.assets || []).find(a => a.name === wantName);
  if (!asset) throw new Error(`Asset "${wantName}" not found in yt-dlp ${tag}`);

  const dataBuf = await fetchBuffer(asset.browser_download_url);
  fs.mkdirSync(binDir(), { recursive: true });
  const out = binPath();
  fs.writeFileSync(out, dataBuf);
  if (process.platform !== 'win32') {
    // chmod +x — required for Unix systems to actually execute the binary.
    try { fs.chmodSync(out, 0o755); } catch {}
  }
  writeMeta({
    version: tag,
    installedAt: Date.now(),
    sha256: sha256(dataBuf),
    asset: wantName,
  });
  return { version: tag, path: out };
}

/** Returns path to a working yt-dlp binary, downloading it if missing.
 *  Resolves with `null` if installation fails (e.g. no network). */
async function ensureInstalled() {
  const target = binPath();
  if (fs.existsSync(target)) return target;
  try {
    const res = await downloadLatest();
    console.log(`Privoo: yt-dlp ${res.version} installed at ${res.path}`);
    return res.path;
  } catch (e) {
    console.warn('Privoo: yt-dlp install failed:', e.message);
    return null;
  }
}

/** Update in the background if the last install is older than CHECK_INTERVAL_MS.
 *  Doesn't block anything — safe to fire-and-forget on launch. */
async function maybeUpdate() {
  try {
    const meta = readMeta();
    const installedAt = Number(meta.installedAt) || 0;
    if (Date.now() - installedAt < CHECK_INTERVAL_MS) return;
    const release = await fetchLatestRelease();
    const latest = release.tag_name || '';
    if (latest && latest !== meta.version) {
      console.log(`Privoo: updating yt-dlp ${meta.version || '(none)'} -> ${latest}`);
      await downloadLatest();
    } else {
      // No new version — bump the timestamp so we don't recheck for another day.
      writeMeta({ ...meta, installedAt: Date.now() });
    }
  } catch (e) {
    console.warn('Privoo: yt-dlp update check failed:', e.message);
  }
}

module.exports = {
  binPath,
  ensureInstalled,
  maybeUpdate,
};
