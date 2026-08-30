const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const CHROME_EPOCH_OFFSET_MS = 11644473600000;

function chromeTimeToMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return Math.max(0, Math.round(n / 1000 - CHROME_EPOCH_OFFSET_MS));
}

function firefoxTimeToMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return Date.now();
  return Math.max(0, Math.round(n / 1000));
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || /^(chrome|edge|brave|vivaldi|opera|about):/i.test(raw)) return '';
  return raw;
}

function flattenChromiumBookmarks(bookmarksJson, limit = 1000) {
  const out = [];
  const roots = bookmarksJson && bookmarksJson.roots ? Object.values(bookmarksJson.roots) : [];

  function walk(node) {
    if (!node || out.length >= limit) return;
    if (node.type === 'url') {
      const url = normalizeUrl(node.url);
      if (url) {
        out.push({
          name: node.name || url,
          url,
          addedAt: chromeTimeToMs(node.date_added),
        });
      }
      return;
    }
    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child);
    }
  }

  for (const root of roots) walk(root);
  return out;
}

function readSignedInt(buf, offset, byteLength) {
  let value = 0n;
  for (let i = 0; i < byteLength; i++) {
    value = (value << 8n) | BigInt(buf[offset + i]);
  }
  const bits = BigInt(byteLength * 8);
  const signBit = 1n << (bits - 1n);
  if (value & signBit) value -= 1n << bits;
  return Number(value);
}

class SQLiteReader {
  constructor(buffer) {
    this.buf = buffer;
    const header = buffer.subarray(0, 16).toString('ascii');
    if (header !== 'SQLite format 3\0') throw new Error('Not a SQLite database');
    const pageSize = buffer.readUInt16BE(16);
    this.pageSize = pageSize === 1 ? 65536 : pageSize;
    this.encoding = buffer.readUInt32BE(56) || 1;
    this.tablesCache = null;
  }

  pageStart(pageNo) {
    return (pageNo - 1) * this.pageSize;
  }

  readVarint(offset) {
    let value = 0n;
    let pos = offset;
    for (let i = 0; i < 9; i++) {
      const b = this.buf[pos++];
      if (i === 8) {
        value = (value << 8n) | BigInt(b);
        return { value: Number(value), offset: pos };
      }
      value = (value << 7n) | BigInt(b & 0x7f);
      if ((b & 0x80) === 0) return { value: Number(value), offset: pos };
    }
    return { value: Number(value), offset: pos };
  }

  decodeText(offset, length) {
    if (length <= 0) return '';
    if (this.encoding === 2) return this.buf.toString('utf16le', offset, offset + length);
    if (this.encoding === 3) {
      const copy = Buffer.alloc(length);
      for (let i = 0; i < length; i += 2) {
        copy[i] = this.buf[offset + i + 1] || 0;
        copy[i + 1] = this.buf[offset + i] || 0;
      }
      return copy.toString('utf16le');
    }
    return this.buf.toString('utf8', offset, offset + length);
  }

  readSerial(serial, offset) {
    if (serial === 0) return { value: null, offset };
    if (serial === 1) return { value: readSignedInt(this.buf, offset, 1), offset: offset + 1 };
    if (serial === 2) return { value: readSignedInt(this.buf, offset, 2), offset: offset + 2 };
    if (serial === 3) return { value: readSignedInt(this.buf, offset, 3), offset: offset + 3 };
    if (serial === 4) return { value: readSignedInt(this.buf, offset, 4), offset: offset + 4 };
    if (serial === 5) return { value: readSignedInt(this.buf, offset, 6), offset: offset + 6 };
    if (serial === 6) return { value: readSignedInt(this.buf, offset, 8), offset: offset + 8 };
    if (serial === 7) return { value: this.buf.readDoubleBE(offset), offset: offset + 8 };
    if (serial === 8) return { value: 0, offset };
    if (serial === 9) return { value: 1, offset };
    if (serial >= 12) {
      const length = Math.floor((serial - 12) / 2);
      if (serial % 2 === 0) {
        return { value: this.buf.subarray(offset, offset + length), offset: offset + length };
      }
      return { value: this.decodeText(offset, length), offset: offset + length };
    }
    return { value: null, offset };
  }

  readRecord(offset) {
    const header = this.readVarint(offset);
    const headerEnd = offset + header.value;
    let pos = header.offset;
    const serials = [];
    while (pos < headerEnd) {
      const next = this.readVarint(pos);
      serials.push(next.value);
      pos = next.offset;
    }

    let body = headerEnd;
    const values = [];
    for (const serial of serials) {
      const read = this.readSerial(serial, body);
      values.push(read.value);
      body = read.offset;
    }
    return values;
  }

  readTableBtree(rootPage, limit = 10000) {
    const rows = [];
    const visited = new Set();

    const visit = (pageNo, depth = 0) => {
      if (!pageNo || rows.length >= limit || depth > 80 || visited.has(pageNo)) return;
      visited.add(pageNo);
      const pageStart = this.pageStart(pageNo);
      const headerOffset = pageNo === 1 ? 100 : 0;
      const pageHeader = pageStart + headerOffset;
      const pageType = this.buf[pageHeader];
      const cellCount = this.buf.readUInt16BE(pageHeader + 3);

      if (pageType === 0x05) {
        const rightMost = this.buf.readUInt32BE(pageHeader + 8);
        const ptrStart = pageHeader + 12;
        for (let i = 0; i < cellCount && rows.length < limit; i++) {
          const cellPtr = this.buf.readUInt16BE(ptrStart + i * 2);
          const cell = pageStart + cellPtr;
          visit(this.buf.readUInt32BE(cell), depth + 1);
        }
        visit(rightMost, depth + 1);
        return;
      }

      if (pageType !== 0x0d) return;

      const ptrStart = pageHeader + 8;
      for (let i = 0; i < cellCount && rows.length < limit; i++) {
        const cellPtr = this.buf.readUInt16BE(ptrStart + i * 2);
        let cell = pageStart + cellPtr;
        const payload = this.readVarint(cell);
        cell = payload.offset;
        const rowid = this.readVarint(cell);
        cell = rowid.offset;
        try {
          rows.push({ rowid: rowid.value, values: this.readRecord(cell) });
        } catch {
          // Ignore malformed or overflow-heavy rows. Browser history rows are
          // small enough for the common no-overflow path this reader supports.
        }
      }
    };

    visit(rootPage);
    return rows;
  }

  splitColumns(sql) {
    const start = sql.indexOf('(');
    const end = sql.lastIndexOf(')');
    if (start === -1 || end === -1 || end <= start) return [];
    const body = sql.slice(start + 1, end);
    const parts = [];
    let current = '';
    let depth = 0;
    let quote = '';
    for (const ch of body) {
      if (quote) {
        current += ch;
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === '"' || ch === '\'' || ch === '`') {
        quote = ch;
        current += ch;
        continue;
      }
      if (ch === '[') {
        quote = ']';
        current += ch;
        continue;
      }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());

    return parts
      .map((part) => {
        const upper = part.toUpperCase();
        if (/^(CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK|KEY)\b/.test(upper)) return null;
        const match = part.match(/^"([^"]+)"|^`([^`]+)`|^\[([^\]]+)\]|^([^\s]+)/);
        return match ? (match[1] || match[2] || match[3] || match[4]) : null;
      })
      .filter(Boolean);
  }

  tables() {
    if (this.tablesCache) return this.tablesCache;
    const masterRows = this.readTableBtree(1, 5000);
    const masterCols = ['type', 'name', 'tbl_name', 'rootpage', 'sql'];
    this.tablesCache = masterRows.map((row) => {
      const obj = {};
      masterCols.forEach((col, idx) => { obj[col] = row.values[idx]; });
      return obj;
    });
    return this.tablesCache;
  }

  table(name, limit = 10000) {
    const entry = this.tables().find((t) => t.type === 'table' && t.name === name);
    if (!entry || !entry.rootpage) return [];
    const columns = this.splitColumns(String(entry.sql || ''));
    const rows = this.readTableBtree(Number(entry.rootpage), limit);
    return rows.map((row) => {
      const obj = { rowid: row.rowid };
      columns.forEach((col, idx) => { obj[col] = row.values[idx]; });
      return obj;
    });
  }
}

function withTempCopy(filePath, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'privoo-import-'));
  const copy = path.join(dir, path.basename(filePath));
  try {
    fs.copyFileSync(filePath, copy);
    return fn(copy);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

function readSqliteTable(filePath, tableName, limit) {
  return withTempCopy(filePath, (copy) => {
    const reader = new SQLiteReader(fs.readFileSync(copy));
    return reader.table(tableName, limit);
  });
}

function readChromiumHistory(historyFile, limit = 5000) {
  const rows = readSqliteTable(historyFile, 'urls', limit);
  return rows
    .map((row) => {
      const url = normalizeUrl(row.url);
      if (!url) return null;
      return {
        url,
        title: row.title || url,
        visitTime: chromeTimeToMs(row.last_visit_time),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.visitTime - a.visitTime)
    .slice(0, limit);
}

function readFirefoxPlaces(placesFile, limit = 5000) {
  const places = readSqliteTable(placesFile, 'moz_places', limit * 2);
  const history = places
    .map((row) => {
      const url = normalizeUrl(row.url);
      if (!url || !row.last_visit_date) return null;
      return {
        url,
        title: row.title || url,
        visitTime: firefoxTimeToMs(row.last_visit_date),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.visitTime - a.visitTime)
    .slice(0, limit);

  let bookmarks = [];
  try {
    const byId = new Map(places.map((row) => [Number(row.id || row.rowid), row]));
    const bookmarkRows = readSqliteTable(placesFile, 'moz_bookmarks', limit * 2);
    bookmarks = bookmarkRows
      .filter((row) => Number(row.type) === 1 && row.fk)
      .map((row) => {
        const place = byId.get(Number(row.fk));
        const url = normalizeUrl(place && place.url);
        if (!url) return null;
        return {
          name: row.title || place.title || url,
          url,
          addedAt: firefoxTimeToMs(row.dateAdded),
        };
      })
      .filter(Boolean)
      .slice(0, limit);
  } catch {
    bookmarks = [];
  }

  return { history, bookmarks };
}

// ─── Cookie import ──────────────────────────────────────
// Chromium stores cookie values encrypted. On Windows the scheme is:
//   1. `Local State` holds os_crypt.encrypted_key: base64, prefixed "DPAPI".
//   2. Strip that prefix and DPAPI-unprotect it to get a 256-bit AES key.
//   3. Each encrypted_value is "v10"/"v11" + 12-byte nonce + ciphertext +
//      16-byte tag, decrypted with AES-256-GCM using that key.
// Firefox does not encrypt cookie values, so that path is much shorter.

/** DPAPI unprotect. Node has no binding for this, so shell out to .NET. */
function dpapiUnprotect(buf) {
  if (process.platform !== "win32") return null;
  const b64 = buf.toString("base64");
  const script =
    "Add-Type -AssemblyName System.Security; " +
    "$b=[Convert]::FromBase64String('" + b64 + "'); " +
    "$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'); " +
    "[Convert]::ToBase64String($p)";
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script],
      { encoding: "utf8", windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });
    return Buffer.from(out.trim(), "base64");
  } catch { return null; }
}

/** The AES key Chromium uses for this profile's cookies, or null. */
let _cookieKeyCache = new Map();
function chromiumCookieKey(profilePath) {
  if (_cookieKeyCache.has(profilePath)) return _cookieKeyCache.get(profilePath);
  // Local State lives in the USER DATA dir, one level above the profile.
  const candidates = [
    path.join(path.dirname(profilePath), "Local State"),
    path.join(profilePath, "Local State"),
  ];
  let key = null;
  for (const f of candidates) {
    const json = safeReadJson(f);
    const enc = json && json.os_crypt && json.os_crypt.encrypted_key;
    if (!enc) continue;
    let raw;
    try { raw = Buffer.from(enc, "base64"); } catch { continue; }
    if (raw.slice(0, 5).toString() !== "DPAPI") continue;
    const k = dpapiUnprotect(raw.slice(5));
    if (k && k.length === 32) { key = k; break; }
  }
  _cookieKeyCache.set(profilePath, key);
  return key;
}

function decryptChromiumValue(encrypted, key) {
  if (!encrypted || !encrypted.length) return "";
  const prefix = encrypted.slice(0, 3).toString();
  if (prefix !== "v10" && prefix !== "v11") {
    // Pre-v80 cookies were DPAPI-encrypted directly, with no AES layer.
    const legacy = dpapiUnprotect(encrypted);
    return legacy ? legacy.toString("utf8") : "";
  }
  if (!key) return "";
  try {
    const nonce = encrypted.slice(3, 15);
    const tag = encrypted.slice(encrypted.length - 16);
    const body = encrypted.slice(15, encrypted.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", key, nonce);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  } catch { return ""; }
}

function readChromiumCookies(profilePath, limit) {
  const cap = limit || 5000;
  const modern = path.join(profilePath, "Network", "Cookies");
  const legacy = path.join(profilePath, "Cookies");
  const src = fs.existsSync(modern) ? modern : (fs.existsSync(legacy) ? legacy : null);
  if (!src) return [];
  const key = chromiumCookieKey(profilePath);
  const rows = readSqliteTable(src, "cookies", cap);
  const out = [];
  for (const row of rows) {
    const host = String(row.host_key || "").replace(/^\./, "");
    const name = String(row.name || "");
    if (!host || !name) continue;
    let value = String(row.value || "");
    if (!value && row.encrypted_value) {
      const buf = Buffer.isBuffer(row.encrypted_value)
        ? row.encrypted_value
        : Buffer.from(row.encrypted_value || []);
      value = decryptChromiumValue(buf, key);
    }
    if (!value) continue;   // undecryptable - skip rather than import garbage
    out.push({
      url: (row.is_secure ? "https://" : "http://") + host + (row.path || "/"),
      name,
      value,
      domain: String(row.host_key || ""),
      path: String(row.path || "/"),
      secure: !!row.is_secure,
      httpOnly: !!row.is_httponly,
      expirationDate: (row.has_expires && row.expires_utc)
        ? Math.floor(chromeTimeToMs(row.expires_utc) / 1000)
        : undefined,
    });
  }
  return out;
}

function readFirefoxCookies(profilePath, limit) {
  const cap = limit || 5000;
  const file = path.join(profilePath, "cookies.sqlite");
  if (!fs.existsSync(file)) return [];
  const rows = readSqliteTable(file, "moz_cookies", cap);
  const out = [];
  for (const row of rows) {
    const host = String(row.host || "").replace(/^\./, "");
    const name = String(row.name || "");
    if (!host || !name) continue;
    out.push({
      url: (row.isSecure ? "https://" : "http://") + host + (row.path || "/"),
      name,
      value: String(row.value || ""),   // Firefox stores these in the clear
      domain: String(row.host || ""),
      path: String(row.path || "/"),
      secure: !!row.isSecure,
      httpOnly: !!row.isHttpOnly,
      expirationDate: row.expiry ? Number(row.expiry) : undefined,
    });
  }
  return out;
}

function profileInfo(kind, browser, profile, profilePath) {
  const types = [];
  if (kind === 'firefox') {
    if (fs.existsSync(path.join(profilePath, 'places.sqlite'))) types.push('bookmarks', 'history');
  } else {
    if (fs.existsSync(path.join(profilePath, 'Bookmarks'))) types.push('bookmarks');
    if (fs.existsSync(path.join(profilePath, 'History'))) types.push('history');
  }
  if (!types.length) return null;
  return {
    id: `${kind}:${profilePath}`,
    kind,
    browser,
    profile,
    path: profilePath,
    types: [...new Set(types)],
  };
}

function addChromiumProfiles(out, browser, userDataPath, profileRoot = false) {
  if (!userDataPath || !fs.existsSync(userDataPath)) return;
  const dirs = [];
  if (profileRoot) {
    dirs.push(userDataPath);
  } else {
    for (const name of ['Default']) {
      const dir = path.join(userDataPath, name);
      if (fs.existsSync(dir)) dirs.push(dir);
    }
    try {
      for (const entry of fs.readdirSync(userDataPath, { withFileTypes: true })) {
        if (entry.isDirectory() && /^Profile \d+$/i.test(entry.name)) {
          dirs.push(path.join(userDataPath, entry.name));
        }
      }
    } catch {
      // ignore unreadable browser folders
    }
  }

  for (const dir of dirs) {
    const info = profileInfo('chromium', browser, path.basename(dir), dir);
    if (info) out.push(info);
  }
}

function listBrowserProfiles() {
  const out = [];
  const home = os.homedir();
  let chromiumRoots = []; // [{ browser, rootDir }]
  let firefoxProfilesDir = '';

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    chromiumRoots = [
      { browser: 'Google Chrome',  rootDir: path.join(local, 'Google', 'Chrome', 'User Data') },
      { browser: 'Microsoft Edge', rootDir: path.join(local, 'Microsoft', 'Edge', 'User Data') },
      { browser: 'Brave',          rootDir: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { browser: 'Vivaldi',        rootDir: path.join(local, 'Vivaldi', 'User Data') },
      { browser: 'Opera',          rootDir: path.join(roaming, 'Opera Software', 'Opera Stable'),    singleProfile: true },
      { browser: 'Opera GX',       rootDir: path.join(roaming, 'Opera Software', 'Opera GX Stable'), singleProfile: true },
    ];
    firefoxProfilesDir = path.join(roaming, 'Mozilla', 'Firefox', 'Profiles');
  } else if (process.platform === 'darwin') {
    const app = path.join(home, 'Library', 'Application Support');
    chromiumRoots = [
      { browser: 'Google Chrome',  rootDir: path.join(app, 'Google', 'Chrome') },
      { browser: 'Google Chrome (Beta)',   rootDir: path.join(app, 'Google', 'Chrome Beta') },
      { browser: 'Google Chrome Canary',   rootDir: path.join(app, 'Google', 'Chrome Canary') },
      { browser: 'Microsoft Edge', rootDir: path.join(app, 'Microsoft Edge') },
      { browser: 'Brave',          rootDir: path.join(app, 'BraveSoftware', 'Brave-Browser') },
      { browser: 'Vivaldi',        rootDir: path.join(app, 'Vivaldi') },
      { browser: 'Arc',            rootDir: path.join(app, 'Arc', 'User Data') },
      { browser: 'Opera',          rootDir: path.join(app, 'com.operasoftware.Opera'),  singleProfile: true },
      { browser: 'Opera GX',       rootDir: path.join(app, 'com.operasoftware.OperaGX'), singleProfile: true },
      { browser: 'Chromium',       rootDir: path.join(app, 'Chromium') },
    ];
    firefoxProfilesDir = path.join(app, 'Firefox', 'Profiles');
  } else {
    // Linux + other Unix
    const cfg = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    chromiumRoots = [
      { browser: 'Google Chrome',  rootDir: path.join(cfg, 'google-chrome') },
      { browser: 'Google Chrome (Beta)',   rootDir: path.join(cfg, 'google-chrome-beta') },
      { browser: 'Google Chrome Unstable', rootDir: path.join(cfg, 'google-chrome-unstable') },
      { browser: 'Chromium',       rootDir: path.join(cfg, 'chromium') },
      { browser: 'Microsoft Edge', rootDir: path.join(cfg, 'microsoft-edge') },
      { browser: 'Brave',          rootDir: path.join(cfg, 'BraveSoftware', 'Brave-Browser') },
      { browser: 'Vivaldi',        rootDir: path.join(cfg, 'vivaldi') },
      { browser: 'Opera',          rootDir: path.join(cfg, 'opera'),    singleProfile: true },
      { browser: 'Opera GX',       rootDir: path.join(cfg, 'opera-gx'), singleProfile: true },
    ];
    firefoxProfilesDir = path.join(home, '.mozilla', 'firefox');
  }

  for (const { browser, rootDir, singleProfile } of chromiumRoots) {
    addChromiumProfiles(out, browser, rootDir, !!singleProfile);
  }

  if (firefoxProfilesDir && fs.existsSync(firefoxProfilesDir)) {
    try {
      for (const entry of fs.readdirSync(firefoxProfilesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(firefoxProfilesDir, entry.name);
        const info = profileInfo('firefox', 'Firefox', entry.name, dir);
        if (info) out.push(info);
      }
    } catch {
      // ignore unreadable Firefox folders
    }
  }

  return out;
}

function inferProfileKind(profilePath) {
  if (fs.existsSync(path.join(profilePath, 'places.sqlite'))) return 'firefox';
  if (fs.existsSync(path.join(profilePath, 'Bookmarks')) || fs.existsSync(path.join(profilePath, 'History'))) {
    return 'chromium';
  }
  return '';
}

function importFromProfile(options = {}) {
  const profilePath = String(options.profilePath || '').trim();
  if (!profilePath || !fs.existsSync(profilePath)) {
    return { ok: false, error: 'Profile folder not found.', bookmarks: [], history: [] };
  }

  const kind = options.kind || inferProfileKind(profilePath);
  const includeBookmarks = options.includeBookmarks !== false;
  const includeHistory = options.includeHistory !== false;
  // Cookies are opt-IN: importing them carries live signed-in sessions across,
  // which is powerful but not something to do by default.
  const includeCookies = options.includeCookies === true;
  const cookieLimit = Math.max(0, Math.min(Number(options.cookieLimit) || 5000, 20000));
  const bookmarkLimit = Math.max(0, Math.min(Number(options.bookmarkLimit) || 1000, 5000));
  const historyLimit = Math.max(0, Math.min(Number(options.historyLimit) || 5000, 10000));

  try {
    if (kind === 'firefox') {
      const places = path.join(profilePath, 'places.sqlite');
      const data = fs.existsSync(places) ? readFirefoxPlaces(places, Math.max(bookmarkLimit, historyLimit)) : {};
      return {
        ok: true,
        kind,
        bookmarks: includeBookmarks ? (data.bookmarks || []).slice(0, bookmarkLimit) : [],
        history: includeHistory ? (data.history || []).slice(0, historyLimit) : [],
        cookies: includeCookies ? readFirefoxCookies(profilePath, cookieLimit) : [],
      };
    }

    const bookmarksFile = path.join(profilePath, 'Bookmarks');
    const historyFile = path.join(profilePath, 'History');
    const bookmarks = includeBookmarks && fs.existsSync(bookmarksFile)
      ? flattenChromiumBookmarks(safeReadJson(bookmarksFile), bookmarkLimit)
      : [];
    const history = includeHistory && fs.existsSync(historyFile)
      ? readChromiumHistory(historyFile, historyLimit)
      : [];
    const cookies = includeCookies ? readChromiumCookies(profilePath, cookieLimit) : [];
    return { ok: true, kind: 'chromium', bookmarks, history, cookies };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : 'Import failed.',
      bookmarks: [],
      history: [],
      cookies: [],
    };
  }
}

module.exports = { listBrowserProfiles, importFromProfile };
