'use strict';

/**
 * ai.js — AI Browser backend.
 *
 * Stores the user's AI provider config and API key (the key is encrypted
 * at rest with the OS keychain via Electron safeStorage) and proxies chat
 * requests to Anthropic / OpenAI from the main process. The renderer never
 * receives the raw key — it only ever learns whether one is set.
 */

const { app, safeStorage, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'privoo-ai.json');

const DEFAULTS = {
  provider: 'anthropic',          // 'anthropic' | 'openai' | 'deepseek'
  model: 'claude-sonnet-4-6',
};

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
};

// OpenAI-compatible providers (same request/response shape, different host).
const OPENAI_COMPATIBLE = {
  openai:   'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
};

const VALID_PROVIDERS = ['anthropic', 'openai', 'deepseek'];

// --- key encryption (same approach as password-store) -----------------------
function machineKey() {
  const seed = [app.getName(), app.getPath('userData'), process.platform, process.arch].join('|');
  return crypto.createHash('sha256').update(seed).digest();
}
function encrypt(plain) {
  const text = String(plain || '');
  if (!text) return null;
  if (safeStorage?.isEncryptionAvailable?.()) {
    return { v: 2, blob: safeStorage.encryptString(text).toString('base64') };
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', machineKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: enc.toString('base64') };
}
function decrypt(rec) {
  if (!rec) return '';
  try {
    if (rec.v === 2 && rec.blob) {
      if (!safeStorage?.isEncryptionAvailable?.()) return '';
      return safeStorage.decryptString(Buffer.from(rec.blob, 'base64'));
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', machineKey(), Buffer.from(rec.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(rec.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(rec.data, 'base64')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}

// --- config load / save -----------------------------------------------------
function loadRaw() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE(), 'utf8')) || {};
  } catch { return {}; }
}
function saveRaw(obj) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
    fs.writeFileSync(CONFIG_FILE(), JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) { console.warn('Privoo AI: config save failed:', e.message); }
}

/**
 * Public config — never exposes the raw key. Each provider keeps its own
 * key + model, so switching provider in the UI doesn't lose the others.
 */
function getConfig() {
  const raw = loadRaw();
  const provider = VALID_PROVIDERS.includes(raw.provider) ? raw.provider : 'anthropic';
  const keys = raw.keys || {};
  const models = raw.models || {};
  // hasKeyFor: which providers already have a key saved.
  const hasKeyFor = {};
  for (const p of VALID_PROVIDERS) hasKeyFor[p] = !!(keys[p] && decrypt(keys[p]));
  return {
    provider,
    model: models[provider] || DEFAULT_MODELS[provider] || DEFAULTS.model,
    hasKey: !!hasKeyFor[provider],
    hasKeyFor,
    accepted: !!raw.accepted,        // disclaimer accepted
  };
}

function setConfig({ provider, model, apiKey, accepted } = {}) {
  const raw = loadRaw();
  if (!raw.keys) raw.keys = {};
  if (!raw.models) raw.models = {};
  const p = VALID_PROVIDERS.includes(provider) ? provider : raw.provider;
  if (p) raw.provider = p;
  if (typeof model === 'string' && model.trim() && p) raw.models[p] = model.trim();
  if (typeof apiKey === 'string' && p) {
    raw.keys[p] = apiKey.trim() ? encrypt(apiKey.trim()) : null;
  }
  if (typeof accepted === 'boolean') raw.accepted = accepted;
  saveRaw(raw);
  return getConfig();
}

// --- HTTP helper (Electron net, respects proxy + system certs) --------------
function httpJson(url, { method = 'POST', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = net.request({ method, url }); }
    catch (e) { return reject(e); }
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
    let chunks = '';
    req.on('response', (res) => {
      res.on('data', (d) => { chunks += d.toString(); });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(chunks); } catch {}
        resolve({ status: res.statusCode, json: parsed, text: chunks });
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

/**
 * Send a chat conversation to the configured provider.
 * `messages` = [{ role:'user'|'assistant', content:'…' }, …]
 * Returns { ok, text } or { ok:false, error }.
 */
async function chat(messages, { systemPrompt } = {}) {
  const raw = loadRaw();
  const cfg = getConfig();
  const key = decrypt((raw.keys || {})[cfg.provider]);
  if (!key) return { ok: false, error: 'NO_KEY' };
  if (!Array.isArray(messages) || !messages.length) return { ok: false, error: 'Nothing to send.' };

  // Trim + sanitise the conversation.
  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }))
    .slice(-20);
  if (!clean.length) return { ok: false, error: 'Nothing to send.' };

  const sys = (systemPrompt || 'You are a helpful assistant inside the Privoo web browser. Be concise and accurate.').slice(0, 4000);

  try {
    // OpenAI + DeepSeek share the same wire format.
    if (OPENAI_COMPATIBLE[cfg.provider]) {
      const res = await httpJson(OPENAI_COMPATIBLE[cfg.provider], {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: {
          model: cfg.model,
          messages: [{ role: 'system', content: sys }, ...clean],
          max_tokens: 1024,
        },
      });
      if (res.status !== 200) {
        const label = cfg.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI';
        return { ok: false, error: res.json?.error?.message || `${label} HTTP ${res.status}` };
      }
      const text = res.json?.choices?.[0]?.message?.content || '';
      return { ok: true, text };
    }
    // Anthropic
    const res = await httpJson('https://api.anthropic.com/v1/messages', {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: cfg.model,
        max_tokens: 1024,
        system: sys,
        messages: clean,
      },
    });
    if (res.status !== 200) {
      return { ok: false, error: res.json?.error?.message || `Anthropic HTTP ${res.status}` };
    }
    const text = (res.json?.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('') || '';
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

module.exports = { getConfig, setConfig, chat, DEFAULT_MODELS };
