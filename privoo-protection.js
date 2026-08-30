'use strict';

/**
 * Privoo Guard — on-demand malware scanning, backed by ClamAV.
 *
 * WHY CLAMAV IS NOT BUNDLED
 * -------------------------
 * ClamAV is GPL-2.0 and its engine plus signature database is several hundred
 * megabytes. Shipping it inside an MIT-licensed app would both bloat the
 * installer and create a licence conflict. So Privoo Guard is an OPTIONAL
 * component: the user installs ClamAV themselves (or points us at an existing
 * install), and Privoo drives the `clamscan` binary it finds.
 *
 * That is the same shape as the yt-dlp integration already in this codebase —
 * detect, offer to fetch, then shell out — except that here we never download
 * the binary automatically, because an antivirus engine is not something to
 * install behind someone's back.
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

/** Where clamscan usually lives, per platform. Checked in order. */
function candidatePaths() {
  if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    return [
      path.join(pf, 'ClamAV', 'clamscan.exe'),
      path.join(pf86, 'ClamAV', 'clamscan.exe'),
      path.join(pf, 'ClamAV', 'bin', 'clamscan.exe'),
    ];
  }
  if (process.platform === 'darwin') {
    return ['/opt/homebrew/bin/clamscan', '/usr/local/bin/clamscan', '/usr/bin/clamscan'];
  }
  return ['/usr/bin/clamscan', '/usr/local/bin/clamscan'];
}

/** A user-chosen override wins over auto-detection. */
let _override = null;
function setBinaryPath(p) { _override = p || null; }

let _installer = null;
function installer() {
  if (!_installer) { try { _installer = require('./clamav-installer'); } catch { _installer = false; } }
  return _installer || null;
}

function findBinary() {
  if (_override && fs.existsSync(_override)) return _override;
  // A Privoo-managed install wins over a system one: we know it has a
  // database, because we fetched it.
  const m = installer()?.managedScanner?.();
  if (m) return m;
  for (const c of candidatePaths()) {
    try { if (fs.existsSync(c)) return c; } catch { /* unreadable - try next */ }
  }
  return null;
}

function isInstalled() { return !!findBinary(); }
/**
 * Look for a ClamAV install Privoo did not create: the usual folders for the
 * platform, then anything named clamscan on PATH. Used by the Check button in
 * Settings so people who already have ClamAV do not install a second copy.
 */
function detectExisting() {
  const seen = [];
  for (const c of candidatePaths()) {
    try { if (fs.existsSync(c)) seen.push(c); } catch { /* unreadable */ }
  }
  const sep = process.platform === 'win32' ? ';' : ':';
  const name = process.platform === 'win32' ? 'clamscan.exe' : 'clamscan';
  for (const dir of String(process.env.PATH || '').split(sep)) {
    if (!dir) continue;
    const full = path.join(dir, name);
    try { if (fs.existsSync(full) && !seen.includes(full)) seen.push(full); } catch { /* unreadable */ }
  }
  const managed = installer()?.managedScanner?.() || null;
  return {
    found: seen.length > 0,
    paths: seen,
    path: seen[0] || null,
    managed: !!managed,
  };
}


/** Engine + signature-database version, or null when not installed. */
function version() {
  return new Promise((resolve) => {
    const bin = findBinary();
    if (!bin) return resolve(null);
    execFile(bin, ['--version'], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout || '').trim() || null);
    });
  });
}

/**
 * Directory names skipped on a full scan. These are package and build caches:
 * enormous, thousands of tiny files, and essentially never where a threat that
 * matters to a browser user lands. A home folder with a few checked-out
 * projects in it is mostly node_modules by file count, so skipping these is the
 * difference between a full scan finishing and a full scan being abandoned.
 *
 * Matched on the exact directory NAME (not a substring), so a folder called
 * "Cached memories" is never caught by accident.
 */
const SKIP_DIRS = [
  'node_modules', '.git', '.svn', '.hg',
  '.cache', '.npm', '.gradle', '.nuget', '.m2', '.cargo',
  '.venv', 'venv', '__pycache__',
];
const SKIP_DIR_SET = new Set(SKIP_DIRS.map((d) => d.toLowerCase()));

/** Privoo's own profile: its cache churns constantly, and re-scanning the
 *  quarantine would just re-detect everything already dealt with. */
function selfDirs() {
  try {
    return [app.getPath('userData')];
  } catch { return []; }
}

function isSkippedDir(name) { return SKIP_DIR_SET.has(String(name).toLowerCase()); }

/** Escape a literal string for clamscan's --exclude-dir (POSIX ERE). */
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * Default scan targets.
 *   quick — the places drive-by downloads actually land.
 *   full  — the whole user profile. Deliberately NOT the entire disk: scanning
 *           system directories needs privileges Privoo does not have, and would
 *           take hours to produce mostly noise.
 */
function scanTargets(kind) {
  const home = os.homedir();
  if (kind === 'full') return [home];
  return [
    app.getPath('downloads'),
    path.join(home, 'Desktop'),
    app.getPath('temp'),
  ].filter((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

let _active = null;

// Count regular files without following symlinks. This runs alongside ClamAV,
// yielding regularly so the browser stays responsive. Once it has a total the
// UI can report real scanned/total progress instead of a made-up percentage.
async function estimateFiles(targets, onCount = null, skip = null) {
  let total = 0;
  const pending = [...targets];
  let visited = 0;
  let lastReport = 0;
  // Must mirror exactly what clamscan is told to skip, or the denominator
  // counts files that will never produce a result line and the percentage
  // stalls short of 100.
  const skipPaths = new Set((skip?.paths || []).map((p) => path.resolve(p).toLowerCase()));
  const skipNames = !!skip?.names;
  while (pending.length) {
    const current = pending.pop();
    if (skipPaths.has(path.resolve(current).toLowerCase())) continue;
    try {
      const stat = await fs.promises.lstat(current);
      if (stat.isSymbolicLink()) continue;
      if (stat.isFile()) { total++; continue; }
      if (!stat.isDirectory()) continue;
      const entries = await fs.promises.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const next = path.join(current, entry.name);
        if (entry.isFile()) total++;
        else if (entry.isDirectory()) {
          if (skipNames && isSkippedDir(entry.name)) continue;
          pending.push(next);
        }
      }
    } catch { /* inaccessible entries are skipped, just like clamscan */ }
    if (++visited % 200 === 0) {
      // Report the running total no more than a few times a second, so a
      // deep tree cannot flood the IPC channel.
      const now = Date.now();
      if (onCount && now - lastReport > 250) { lastReport = now; onCount(total); }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return total;
}

/**
 * Run a scan. `onEvent` receives progress as it happens:
 *   { type: 'file',    path }              a file was examined
 *   { type: 'threat',  path, threat }      something was found
 *   { type: 'done',    scanned, infected, threats, code }
 *   { type: 'error',   message }
 * Returns a handle with cancel().
 */
function scan({ kind = 'quick', paths = null } = {}, onEvent = () => {}) {
  const bin = findBinary();
  if (!bin) {
    onEvent({ type: 'error', message: 'ClamAV is not installed.' });
    return { cancel() {} };
  }
  if (_active) {
    onEvent({ type: 'error', message: 'A scan is already running.' });
    return { cancel() {} };
  }

  const targets = (Array.isArray(paths) && paths.length) ? paths : scanTargets(kind);
  if (!targets.length) {
    onEvent({ type: 'error', message: 'Nothing to scan.' });
    return { cancel() {} };
  }

  // --stdout keeps findings on stdout so stderr stays for real errors.
  // --recursive walks directories; --no-summary because we tally ourselves.
  // --database is required for a portable install: without it clamscan looks
  // in a compiled-in system path that does not exist here.
  const db = installer()?.managedDbDir?.();
  const args = ['--stdout', '--recursive', '--no-summary'];
  if (db && bin === installer()?.managedScanner?.()) args.push('--database=' + db);

  // A full scan is the only one big enough for the skip list to matter; a
  // quick scan or one the user aimed at a folder themselves should check
  // exactly what it was pointed at.
  const useSkips = kind === 'full';
  const skipPaths = selfDirs();
  // --exclude-dir takes a POSIX extended regex matched against the path, so
  // dots have to be escaped or ".git" would also match "digit".
  for (const p of skipPaths) args.push('--exclude-dir=' + escapeRe(p));
  if (useSkips) {
    for (const name of SKIP_DIRS) args.push('--exclude-dir=' + escapeRe(name));
    // Keeps a full scan from wandering onto mapped network or removable
    // drives, which is the other way it silently turns into an hours-long job.
    args.push('--cross-fs=no');
  }
  args.push(...targets);

  const child = spawn(bin, args, { windowsHide: true });
  _active = child;

  let scanned = 0;
  let estimatedTotal = 0;
  let counting = true;
  let finished = false;
  const threats = [];
  let buf = '';
  let lastEmit = 0;
  let lastPath = '';
  const startedAt = Date.now();

  // clamscan loads its entire signature database — several hundred megabytes,
  // around a million signatures — BEFORE it looks at the first file. That takes
  // anywhere from a few seconds to a minute, and it prints nothing at all while
  // it does. Progress used to be emitted only from stdout, so for that whole
  // stretch the UI received no events and looked frozen. Tracking the phase
  // explicitly lets it say what is actually happening.
  let phase = 'loading';

  // The heartbeat is what guarantees an event even when clamscan is silent —
  // during the database load, and later on a single very large archive that
  // takes many seconds to unpack.
  const beat = setInterval(() => {
    if (finished) return;
    emitProgress('', true);
  }, 500);
  if (typeof beat.unref === 'function') beat.unref();

  // Deliberately started AFTER the process: the walk and clamscan's database
  // load both hammer the disk, and running them together made the slowest part
  // of a scan slower still. A short delay costs nothing — there is no
  // percentage to show until clamscan starts reporting files anyway.
  const countTimer = setTimeout(() => {
    if (finished) return;
    estimateFiles(targets, (soFar) => {
      if (finished) return;
      // A partial count is still worth showing: it is what turns "0%" into a
      // number that visibly climbs while the walk is still running.
      estimatedTotal = soFar;
      emitProgress(lastPath, true);
    }, { paths: skipPaths, names: useSkips }).then((total) => {
      if (finished) return;
      estimatedTotal = total;
      counting = false;
      emitProgress(lastPath, true);
    }).catch(() => { counting = false; });
  }, 400);
  if (typeof countTimer.unref === 'function') countTimer.unref();

  // `force` bypasses the rate limit for the events that must not be dropped:
  // the first file, and each time the total changes.
  function emitProgress(filePath, force = false) {
    if (filePath) lastPath = filePath;
    const now = Date.now();
    if (!force && now - lastEmit < 180) return;
    lastEmit = now;
    // The count is only ever an estimate — a directory can grow while the scan
    // runs. Rather than let the bar sit pinned at 99%, let the denominator
    // catch up to reality.
    if (scanned > estimatedTotal) estimatedTotal = scanned;
    onEvent({
      type: 'progress',
      phase,
      scanned,
      total: estimatedTotal,
      counting,
      elapsedMs: now - startedAt,
      path: filePath || lastPath || '',
    });
  }

  child.stdout.on('data', (chunk) => {
    buf += chunk.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      // clamscan prints "<path>: <Threat> FOUND" for hits.
      const hit = line.match(/^(.*): (.+) FOUND$/);
      // Anything on stdout means the database is loaded and real scanning has
      // begun.
      const wasLoading = phase === 'loading';
      phase = 'scanning';
      if (hit) {
        const rec = { path: hit[1], threat: hit[2] };
        scanned++;
        threats.push(rec);
        onEvent({ type: 'threat', ...rec });
        emitProgress(hit[1], true);
      } else if (line.includes(': OK')) {
        scanned++;
        emitProgress(line.split(':')[0], wasLoading || scanned === 1);
      }
    }
  });

  let errText = '';
  child.stderr.on('data', (c) => { errText += c.toString(); });

  function stopTimers() {
    clearInterval(beat);
    clearTimeout(countTimer);
  }

  child.on('error', (e) => {
    finished = true;
    stopTimers();
    _active = null;
    onEvent({ type: 'error', message: e.message });
  });

  child.on('close', (code) => {
    finished = true;
    counting = false;
    stopTimers();
    _active = null;
    // clamscan exit codes: 0 = clean, 1 = virus found, 2 = error.
    if (code === 2) {
      onEvent({ type: 'error', message: errText.trim() || 'Scan failed.' });
      return;
    }
    onEvent({ type: 'done', scanned, infected: threats.length, threats, code });
  });

  return {
    cancel() {
      finished = true;
      stopTimers();
      try { child.kill(); } catch { /* already gone */ }
      _active = null;
    },
  };
}

function cancel() {
  if (_active) { try { _active.kill(); } catch { /* ignore */ } _active = null; }
}
function isScanning() { return !!_active; }

// ── Quarantine ──────────────────────────────────────────────────────────────
// Quarantined files are moved into the profile folder under a mangled name, so
// nothing can execute them by accident. A manifest alongside them records where
// each one came from — without it a quarantined file is unrecoverable, which
// makes "Quarantine" a scarier button than "Remove" rather than a safer one.
function quarantineDir() { return path.join(app.getPath('userData'), 'quarantine'); }
function manifestPath() { return path.join(quarantineDir(), 'manifest.json'); }

async function readManifest() {
  try {
    const raw = await fs.promises.readFile(manifestPath(), 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
async function writeManifest(list) {
  await fs.promises.mkdir(quarantineDir(), { recursive: true });
  await fs.promises.writeFile(manifestPath(), JSON.stringify(list, null, 2), 'utf8');
}

/**
 * Resolve a manifest entry's stored file, refusing anything that would escape
 * the quarantine folder. `stored` comes off disk, so it is not trusted.
 */
function storedPath(entry) {
  const dir = quarantineDir();
  const full = path.resolve(dir, path.basename(String(entry?.stored || '')));
  if (path.dirname(full) !== path.resolve(dir)) throw new Error('Invalid quarantine entry.');
  return full;
}

async function quarantine(filePath, threat = '') {
  const source = path.resolve(String(filePath || ''));
  const stat = await fs.promises.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only a regular file can be quarantined.');
  await fs.promises.mkdir(quarantineDir(), { recursive: true });
  const safeName = path.basename(source).replace(/[^a-z0-9._-]/gi, '_');
  const stored = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safeName}`;
  const dest = path.join(quarantineDir(), stored);
  try { await fs.promises.rename(source, dest); }
  catch {
    // rename fails across volumes; copy-then-delete is the fallback.
    await fs.promises.copyFile(source, dest);
    await fs.promises.unlink(source);
  }
  const list = await readManifest();
  list.push({
    id: stored,
    stored,
    name: path.basename(source),
    original: source,
    threat: String(threat || ''),
    size: stat.size,
    at: Date.now(),
  });
  await writeManifest(list);
  return { ok: true, path: dest };
}

/** Everything currently held, newest first, with dead entries pruned. */
async function quarantineList() {
  const list = await readManifest();
  const alive = [];
  let pruned = false;
  for (const entry of list) {
    try {
      const p = storedPath(entry);
      const st = await fs.promises.stat(p);
      alive.push({ ...entry, size: st.size });
    } catch { pruned = true; }
  }
  if (pruned) await writeManifest(alive);
  return alive.sort((a, b) => (b.at || 0) - (a.at || 0));
}

/** Put a quarantined file back where it came from. */
async function quarantineRestore(id) {
  const list = await readManifest();
  const entry = list.find((e) => e && e.id === id);
  if (!entry) throw new Error('That file is no longer in quarantine.');
  const from = storedPath(entry);
  const to = path.resolve(String(entry.original || ''));
  if (!to || to === from) throw new Error('The original location is unknown.');
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  try { await fs.promises.rename(from, to); }
  catch {
    await fs.promises.copyFile(from, to);
    await fs.promises.unlink(from);
  }
  await writeManifest(list.filter((e) => e !== entry));
  return { ok: true, path: to };
}

/** Delete a quarantined file for good. */
async function quarantineDelete(id) {
  const list = await readManifest();
  const entry = list.find((e) => e && e.id === id);
  if (!entry) throw new Error('That file is no longer in quarantine.');
  try { await fs.promises.unlink(storedPath(entry)); } catch { /* already gone */ }
  await writeManifest(list.filter((e) => e !== entry));
  return { ok: true };
}

/** Empty the whole quarantine folder. Returns how many files went. */
async function quarantineEmpty() {
  const list = await readManifest();
  let removed = 0;
  for (const entry of list) {
    try { await fs.promises.unlink(storedPath(entry)); removed++; } catch { /* already gone */ }
  }
  await writeManifest([]);
  return { ok: true, removed };
}

async function removeThreat(filePath) {
  const source = path.resolve(String(filePath || ''));
  const stat = await fs.promises.lstat(source);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only a regular file can be removed.');
  await fs.promises.unlink(source);
  return { ok: true };
}

/** Where to send someone who wants to install it. */
function downloadPageUrl() {
  return 'https://www.clamav.net/downloads';
}

module.exports = {
  detectExisting,
  isInstalled, findBinary, setBinaryPath, version,
  scan, cancel, isScanning, scanTargets, downloadPageUrl,
  quarantine, removeThreat,
  quarantineDir, quarantineList, quarantineRestore, quarantineDelete, quarantineEmpty,
};
