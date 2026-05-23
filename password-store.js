'use strict';

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = () => path.join(app.getPath('userData'), 'privoo-passwords.json');

function machineKey() {
  const seed = [
    app.getName(),
    app.getPath('userData'),
    process.platform,
    process.arch,
  ].join('|');
  return crypto.createHash('sha256').update(seed).digest();
}

function encrypt(plain) {
  const text = String(plain);
  if (safeStorage?.isEncryptionAvailable?.()) {
    return { v: 2, blob: safeStorage.encryptString(text).toString('base64') };
  }
  const iv = crypto.randomBytes(12);
  const key = machineKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
}

function decrypt(record) {
  if (!record?.blob && !record?.data) return '';
  if (record.v === 2 && record.blob) {
    if (!safeStorage?.isEncryptionAvailable?.()) return '';
    return safeStorage.decryptString(Buffer.from(record.blob, 'base64'));
  }
  const iv = Buffer.from(record.iv, 'base64');
  const tag = Buffer.from(record.tag, 'base64');
  const data = Buffer.from(record.data, 'base64');
  const key = machineKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function originOf(url) {
  try {
    const u = new URL(url);
    return u.origin;
  } catch {
    return '';
  }
}

function loadAll() {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    return [];
  }
}

function saveAll(entries) {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify({ entries }, null, 2), 'utf8');
}

function list() {
  return loadAll().map((e) => ({
    id: e.id,
    origin: e.origin,
    username: e.username,
    updatedAt: e.updatedAt,
  }));
}

function getForOrigin(url) {
  const origin = originOf(url);
  if (!origin) return [];
  return loadAll()
    .filter((e) => e.origin === origin)
    .map((e) => ({
      id: e.id,
      origin: e.origin,
      username: e.username,
      password: decrypt(e.secret),
    }));
}

function upsert({ origin, username, password }) {
  const o = origin || '';
  const u = String(username || '').trim();
  const p = String(password || '');
  if (!o || !u || !p) return { ok: false, error: 'Missing fields' };
  const entries = loadAll();
  const existing = entries.find((e) => e.origin === o && e.username === u);
  const secret = encrypt(p);
  if (existing) {
    existing.secret = secret;
    existing.updatedAt = Date.now();
  } else {
    entries.push({
      id: `pw_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      origin: o,
      username: u,
      secret,
      updatedAt: Date.now(),
    });
  }
  saveAll(entries);
  return { ok: true };
}

function remove(id) {
  const entries = loadAll().filter((e) => e.id !== id);
  saveAll(entries);
  return { ok: true };
}

// Returns the decrypted password for the given saved-credential id, or
// null if no record matches. Decryption uses the same path as autofill —
// safeStorage if available, otherwise the machine-key AES fallback — so
// the cleartext never has to live in renderer-side storage.
function reveal(id) {
  const entry = loadAll().find((e) => e.id === id);
  if (!entry) return null;
  try {
    return decrypt(entry.secret);
  } catch {
    return null;
  }
}

module.exports = { list, getForOrigin, upsert, remove, reveal, originOf };
