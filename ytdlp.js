'use strict';

const { spawn } = require('child_process');
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

function downloadMedia(url, settings, opts) {
  const bin = resolveBinary(settings);
  const customFolder = opts && typeof opts.folder === 'string' && opts.folder.trim() ? opts.folder.trim() : null;
  const outDir = customFolder || (settings && settings.downloadPath) || app.getPath('downloads');
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url.trim())) {
    return Promise.resolve({ ok: false, error: 'invalid-url' });
  }
  const u = url.trim();
  const format = opts && opts.format ? String(opts.format) : 'best';
  const template = path.join(outDir, '%(title).80B [%(id)s].%(ext)s');
  // Highest-quality video + best audio, merged into mp4. Falls back to the
  // best single-file stream if ffmpeg isn't available for merging.
  const BEST_VIDEO_FMT = 'bv*+ba/bestvideo+bestaudio/best';
  let args;
  if (format === 'mp3') {
    args = ['-o', template, '--no-mtime', '--no-playlist', '-x',
            '--audio-format', 'mp3', '--audio-quality', '0', u];
  } else if (format === 'mp4') {
    args = ['-o', template, '--no-mtime', '--no-playlist',
            '-f', 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/best',
            '--merge-output-format', 'mp4', u];
  } else {
    // Default "best" — explicitly grab the highest-resolution video stream
    // and the best audio stream and merge. Without this yt-dlp's default
    // can pick a lower 720p combined stream when separate 1080p+ exists.
    args = ['-o', template, '--no-mtime', '--no-playlist',
            '-f', BEST_VIDEO_FMT,
            '--merge-output-format', 'mp4', u];
  }
  return new Promise((resolve) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    let stdout = '';
    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => {
      resolve({
        ok: false,
        error: e.code === 'ENOENT' ? 'not-found' : String(e.message || e),
      });
    });
    child.on('close', (code) => {
      const log = (stderr || stdout).slice(-4000);
      resolve({ ok: code === 0, code, log });
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

module.exports = { resolveBinary, downloadMedia, probe };
