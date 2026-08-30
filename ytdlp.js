'use strict';

const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const installer = require('./ytdlp-installer');

function resolveBinary(settings) {
  const s = settings || {};
  // Highest priority: user-picked binary.
  if (s.ytdlpPath && typeof s.ytdlpPath === 'string' && fs.existsSync(s.ytdlpPath)) {
    return s.ytdlpPath;
  }
  // Auto-installed copy in userData/bin/ (downloaded by ytdlp-installer).
  const auto = installer.binPath();
  if (fs.existsSync(auto)) return auto;
  // Bundled binary inside the app package (if shipped).
  const name = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const bundled = path.join(__dirname, 'bin', name);
  if (fs.existsSync(bundled)) return bundled;
  // Fall back to PATH lookup.
  return name;
}

/**
 * Is ffmpeg reachable? Merging separate video+audio streams needs it, and so
 * does audio extraction. Without this check yt-dlp happily downloads two files
 * it cannot join, leaving the user with something unplayable and an error
 * buried in a log dump.
 */
let _ffmpegCache = null;
function hasFfmpeg() {
  if (_ffmpegCache !== null) return _ffmpegCache;
  try {
    const r = spawnSync('ffmpeg', ['-version'], { windowsHide: true, timeout: 4000 });
    _ffmpegCache = !r.error && r.status === 0;
  } catch { _ffmpegCache = false; }
  return _ffmpegCache;
}

/** Format selector for a requested quality, honouring ffmpeg availability. */
function formatArgs(format) {
  if (format === 'mp3') {
    // The one case that genuinely cannot proceed without ffmpeg.
    return { args: ['-x', '--audio-format', 'mp3', '--audio-quality', '0'], needsFfmpeg: true };
  }
  if (!hasFfmpeg()) {
    // Ask for a single pre-muxed stream so nothing needs joining.
    return { args: ['-f', 'best[ext=mp4]/best'], needsFfmpeg: false };
  }
  const heights = { '1080': 1080, '720': 720, '480': 480 };
  const h = heights[format];
  if (h) {
    return {
      args: ['-f', 'bv*[height<=' + h + ']+ba/b[height<=' + h + ']/best',
             '--merge-output-format', 'mp4'],
      needsFfmpeg: false,
    };
  }
  if (format === 'mp4') {
    return {
      args: ['-f', 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/best', '--merge-output-format', 'mp4'],
      needsFfmpeg: false,
    };
  }
  // "best": highest-resolution video plus best audio, merged.
  return {
    args: ['-f', 'bv*+ba/bestvideo+bestaudio/best', '--merge-output-format', 'mp4'],
    needsFfmpeg: false,
  };
}

/** Active downloads, so they can be cancelled. */
const _jobs = new Map();
let _jobSeq = 0;

/**
 * Download media.
 *
 * `onProgress` receives structured updates as yt-dlp reports them:
 *   { phase: 'probe' | 'download' | 'merge', percent, speed, eta, title, file }
 *
 * The previous version returned nothing at all until the whole download
 * finished, so the UI sat on "Starting…" for the entire duration of a long
 * video with no way to tell whether it had stalled.
 */
function downloadMedia(url, settings, opts, onProgress) {
  const emit = typeof onProgress === 'function' ? onProgress : () => {};
  const bin = resolveBinary(settings);
  const customFolder = opts && typeof opts.folder === 'string' && opts.folder.trim()
    ? opts.folder.trim() : null;
  const outDir = customFolder || (settings && settings.downloadPath) || app.getPath('downloads');

  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return Promise.resolve({ ok: false, error: 'invalid-url' });
  }
  const u = url.trim();
  const format = opts && opts.format ? String(opts.format) : 'best';
  const sel = formatArgs(format);
  if (sel.needsFfmpeg && !hasFfmpeg()) {
    return Promise.resolve({ ok: false, error: 'no-ffmpeg' });
  }

  const template = path.join(outDir, '%(title).80B [%(id)s].%(ext)s');
  const args = [
    '-o', template,
    '--no-mtime', '--no-playlist',
    // --newline makes yt-dlp emit one progress line per update instead of
    // rewriting a single line with \r, which is what makes streaming possible.
    '--newline', '--progress',
    ...sel.args,
    u,
  ];

  const id = ++_jobSeq;

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, { windowsHide: true });
    } catch (e) {
      resolve({ ok: false, error: 'not-found' });
      return;
    }
    _jobs.set(id, child);

    let stderr = '';
    let tail = '';
    let title = '';
    let lastFile = '';
    let cancelled = false;
    child.__markCancelled = () => { cancelled = true; };

    emit({ phase: 'probe', jobId: id, message: 'Fetching media details…' });

    const handleLine = (line) => {
      tail += line + '\n';
      if (tail.length > 6000) tail = tail.slice(-6000);

      // [download]  42.7% of  118.35MiB at   3.20MiB/s ETA 00:21
      const m = line.match(/^\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\w+)(?:\s+at\s+(\S+))?(?:\s+ETA\s+(\S+))?/);
      if (m) {
        emit({
          phase: 'download',
          percent: parseFloat(m[1]),
          total: m[2],
          speed: m[3] || '',
          eta: m[4] || '',
          title,
        });
        return;
      }
      const dest = line.match(/^\[download\] Destination: (.+)$/);
      if (dest) {
        lastFile = dest[1].trim();
        emit({ phase: 'download', percent: 0, file: lastFile, title });
        return;
      }
      if (/^\[Merger\]/.test(line)) {
        emit({ phase: 'merge', message: 'Merging video and audio…', title });
        return;
      }
      if (/^\[ExtractAudio\]/.test(line)) {
        emit({ phase: 'merge', message: 'Extracting audio…', title });
        return;
      }
      const t = line.match(/^\[info\] (.+): Downloading/);
      if (t) { title = t[1]; emit({ phase: 'probe', title }); }
    };

    let buf = '';
    child.stdout?.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || '';
      for (const l of lines) { if (l.trim()) handleLine(l.trim()); }
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('error', (e) => {
      _jobs.delete(id);
      resolve({ ok: false, error: e.code === 'ENOENT' ? 'not-found' : String(e.message || e) });
    });
    child.on('close', (code) => {
      _jobs.delete(id);
      if (cancelled) { resolve({ ok: false, error: 'cancelled' }); return; }
      const log = (stderr || tail).slice(-4000);
      resolve({ ok: code === 0, code, log, file: lastFile, title, jobId: id });
    });
  });
}

/** Cancel one job, or every running job when no id is given. */
function cancelDownload(id) {
  const child = id ? _jobs.get(id) : null;
  const targets = child ? [child] : Array.from(_jobs.values());
  for (const c of targets) {
    try { c.__markCancelled?.(); c.kill(); } catch { /* already gone */ }
  }
  return targets.length > 0;
}

/**
 * Read a URL's title and available heights without downloading anything, so
 * the UI can show what it is about to fetch.
 */
function inspect(url, settings) {
  const bin = resolveBinary(settings);
  return new Promise((resolve) => {
    if (!url || !/^https?:\/\//i.test(String(url).trim())) {
      resolve({ ok: false, error: 'invalid-url' });
      return;
    }
    let child;
    try {
      child = spawn(bin, ['-J', '--no-playlist', '--no-warnings', String(url).trim()], { windowsHide: true });
    } catch {
      resolve({ ok: false, error: 'not-found' });
      return;
    }
    let out = '';
    child.stdout?.on('data', (d) => { out += d.toString(); });
    child.on('error', () => resolve({ ok: false, error: 'not-found' }));
    child.on('close', () => {
      try {
        const j = JSON.parse(out);
        const heights = Array.from(new Set(
          (j.formats || []).map((f) => f.height).filter((h) => typeof h === 'number' && h > 0)
        )).sort((a, b) => b - a);
        resolve({
          ok: true,
          title: j.title || '',
          duration: j.duration || 0,
          thumbnail: j.thumbnail || '',
          uploader: j.uploader || '',
          heights,
        });
      } catch {
        resolve({ ok: false, error: 'probe-failed' });
      }
    });
  });
}

function probe(settings) {
  const bin = resolveBinary(settings);
  return new Promise((resolve) => {
    const child = spawn(bin, ['--version'], { windowsHide: true });
    let out = '';
    child.stdout?.on('data', (d) => { out += d.toString(); });
    child.stderr?.on('data', (d) => { out += d.toString(); });
    child.on('error', (e) => {
      resolve({
        ok: false,
        error: e.code === 'ENOENT' ? 'not-found' : String(e.message || e),
      });
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, version: out.trim().split('\n')[0] || '' });
    });
  });
}

module.exports = { resolveBinary, downloadMedia, cancelDownload, inspect, probe, hasFfmpeg };
