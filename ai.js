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
const http = require('http');

const CONFIG_FILE = () => path.join(app.getPath('userData'), 'privoo-ai.json');

const DEFAULTS = {
  provider: 'anthropic',          // 'anthropic' | 'openai' | 'deepseek' | 'gemini' | 'ollama'
  model: 'claude-sonnet-4-6',
};

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o-mini',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-2.0-flash',
  ollama: 'llama3.2',
};

// OpenAI-compatible providers (same request/response shape, different host).
const OPENAI_COMPATIBLE = {
  openai:   'https://api.openai.com/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/chat/completions',
};

const VALID_PROVIDERS = ['anthropic', 'openai', 'deepseek', 'gemini', 'ollama'];

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
  // hasKeyFor: which providers are ready to use. Ollama needs no key (it talks
  // to a local server), so it's always considered "ready" here — whether the
  // server is actually running is surfaced separately via detectOllama().
  const hasKeyFor = {};
  for (const p of VALID_PROVIDERS) {
    hasKeyFor[p] = p === 'ollama' ? true : !!(keys[p] && decrypt(keys[p]));
  }
  // Migrate retired model ids to their current replacement so saved configs
  // don't keep sending an invalid name to the provider.
  const RETIRED_MODELS = { 'deepseek-v4': 'deepseek-v4-flash' };
  let model = models[provider] || DEFAULT_MODELS[provider] || DEFAULTS.model;
  if (RETIRED_MODELS[model]) model = RETIRED_MODELS[model];

  return {
    provider,
    model,
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

// Ollama talks to a LOCAL server. We deliberately use Node's http (not Electron
// `net`) so the request goes straight to 127.0.0.1 and is never routed through
// the app's proxy/Tor, system proxy, or Chromium's origin checks — any of which
// would make a local Ollama look "not detected".
function ollamaRequest(pathname, { method = 'GET', body, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 11434,
        path: pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let chunks = '';
        res.on('data', (d) => { chunks += d.toString(); });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(chunks); } catch {}
          resolve({ status: res.statusCode, json: parsed, text: chunks });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Ollama request timed out')));
    if (data) req.write(data);
    req.end();
  });
}

// --- streaming helpers ------------------------------------------------------
// Stream a cloud request via Electron `net`; `onData` gets each raw text chunk.
// Resolves with { status, raw } once the response ends (raw = full body, used to
// read an error message on non-200 responses).
function netStream(url, { method = 'POST', headers = {}, body } = {}, onData) {
  return new Promise((resolve, reject) => {
    let req;
    try { req = net.request({ method, url }); }
    catch (e) { return reject(e); }
    for (const [k, v] of Object.entries(headers)) req.setHeader(k, v);
    let status = 0, raw = '';
    req.on('response', (res) => {
      status = res.statusCode;
      res.on('data', (d) => { const s = d.toString(); raw += s; try { onData(s); } catch {} });
      res.on('end', () => resolve({ status, raw }));
      res.on('error', reject);
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}
// Same, but straight to the local Ollama server via Node http (no proxy).
function ollamaStream(pathname, body, onData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1', port: 11434, path: pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        timeout: 600000,
      },
      (res) => {
        let raw = '';
        res.on('data', (d) => { const s = d.toString(); raw += s; try { onData(s); } catch {} });
        res.on('end', () => resolve({ status: res.statusCode, raw }));
        res.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Ollama request timed out')));
    req.write(data);
    req.end();
  });
}
// Feed raw chunks; invokes `handler` once per complete '\n'-terminated line.
function makeLineParser(handler) {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (line) handler(line);
    }
  };
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
  // Ollama is local and keyless; every other provider needs an API key.
  if (cfg.provider !== 'ollama' && !key) return { ok: false, error: 'NO_KEY' };
  if (!Array.isArray(messages) || !messages.length) return { ok: false, error: 'Nothing to send.' };

  // Trim + sanitise the conversation.
  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }))
    .slice(-20);
  if (!clean.length) return { ok: false, error: 'Nothing to send.' };

  const sys = (systemPrompt || 'You are a helpful assistant inside the Privoo web browser. Be concise and accurate.').slice(0, 4000);

  try {
    // Ollama — local server, OpenAI-ish but its own /api/chat shape.
    if (cfg.provider === 'ollama') {
      const res = await ollamaRequest('/api/chat', {
        method: 'POST',
        timeoutMs: 120000, // model inference can be slow on first load
        body: {
          model: cfg.model || DEFAULT_MODELS.ollama,
          messages: [{ role: 'system', content: sys }, ...clean],
          stream: false,
        },
      });
      if (res.status !== 200) {
        const err = res.json?.error || `Ollama HTTP ${res.status}`;
        return { ok: false, error: String(err) };
      }
      const text = res.json?.message?.content || '';
      return { ok: true, text };
    }
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
    // Gemini — Google Generative Language API (different wire format).
    if (cfg.provider === 'gemini') {
      const model = cfg.model || DEFAULT_MODELS.gemini;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
      const contents = clean.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const res = await httpJson(url, {
        headers: { 'Content-Type': 'application/json' },
        body: {
          systemInstruction: { parts: [{ text: sys }] },
          contents,
        },
      });
      if (res.status !== 200) {
        return { ok: false, error: res.json?.error?.message || `Gemini HTTP ${res.status}` };
      }
      const text = res.json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
    if (cfg.provider === 'ollama') {
      return { ok: false, error: 'Could not reach Ollama. Make sure it is installed and running (ollama.com), then try again.' };
    }
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Streaming variant of chat(). Calls `onChunk(textDelta)` as tokens arrive and
 * resolves with { ok, text } (the full text) or { ok:false, error }. Falls back
 * to a partial result if the connection drops mid-stream.
 */
async function chatStream(messages, { systemPrompt, onChunk } = {}) {
  const raw = loadRaw();
  const cfg = getConfig();
  const key = decrypt((raw.keys || {})[cfg.provider]);
  if (cfg.provider !== 'ollama' && !key) return { ok: false, error: 'NO_KEY' };
  if (!Array.isArray(messages) || !messages.length) return { ok: false, error: 'Nothing to send.' };

  const clean = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 24000) }))
    .slice(-20);
  if (!clean.length) return { ok: false, error: 'Nothing to send.' };

  const sys = (systemPrompt || 'You are a helpful assistant inside the Privoo web browser. Be concise and accurate.').slice(0, 4000);

  let full = '';
  const emit = (t) => { if (!t) return; full += t; try { onChunk && onChunk(t); } catch {} };

  try {
    // Ollama — newline-delimited JSON, each line { message:{content}, done }.
    if (cfg.provider === 'ollama') {
      let errMsg = '';
      const parse = makeLineParser((line) => {
        let o = null; try { o = JSON.parse(line); } catch { return; }
        if (o.message && o.message.content) emit(o.message.content);
        if (o.error) errMsg = o.error;
      });
      const res = await ollamaStream('/api/chat', {
        model: cfg.model || DEFAULT_MODELS.ollama,
        messages: [{ role: 'system', content: sys }, ...clean],
        stream: true,
      }, parse);
      if (res.status !== 200 && !full) return { ok: false, error: errMsg || `Ollama HTTP ${res.status}` };
      return { ok: true, text: full };
    }

    // OpenAI / DeepSeek — SSE: lines "data: {choices:[{delta:{content}}]}".
    if (OPENAI_COMPATIBLE[cfg.provider]) {
      const parse = makeLineParser((line) => {
        if (!line.startsWith('data:')) return;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        let o = null; try { o = JSON.parse(data); } catch { return; }
        const d = o?.choices?.[0]?.delta?.content;
        if (d) emit(d);
      });
      const res = await netStream(OPENAI_COMPATIBLE[cfg.provider], {
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: { model: cfg.model, messages: [{ role: 'system', content: sys }, ...clean], max_tokens: 1024, stream: true },
      }, parse);
      if (res.status !== 200 && !full) {
        const label = cfg.provider === 'deepseek' ? 'DeepSeek' : 'OpenAI';
        let j = null; try { j = JSON.parse(res.raw); } catch {}
        return { ok: false, error: j?.error?.message || `${label} HTTP ${res.status}` };
      }
      return { ok: true, text: full };
    }

    // Gemini — SSE via streamGenerateContent?alt=sse.
    if (cfg.provider === 'gemini') {
      const model = cfg.model || DEFAULT_MODELS.gemini;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
      const contents = clean.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
      const parse = makeLineParser((line) => {
        if (!line.startsWith('data:')) return;
        let o = null; try { o = JSON.parse(line.slice(5).trim()); } catch { return; }
        const d = o?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (d) emit(d);
      });
      const res = await netStream(url, {
        headers: { 'Content-Type': 'application/json' },
        body: { systemInstruction: { parts: [{ text: sys }] }, contents },
      }, parse);
      if (res.status !== 200 && !full) {
        let j = null; try { j = JSON.parse(res.raw); } catch {}
        return { ok: false, error: j?.error?.message || `Gemini HTTP ${res.status}` };
      }
      return { ok: true, text: full };
    }

    // Anthropic — SSE: content_block_delta events with delta.text.
    const parse = makeLineParser((line) => {
      if (!line.startsWith('data:')) return;
      let o = null; try { o = JSON.parse(line.slice(5).trim()); } catch { return; }
      if (o.type === 'content_block_delta' && o.delta && o.delta.text) emit(o.delta.text);
    });
    const res = await netStream('https://api.anthropic.com/v1/messages', {
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: { model: cfg.model, max_tokens: 1024, system: sys, messages: clean, stream: true },
    }, parse);
    if (res.status !== 200 && !full) {
      let j = null; try { j = JSON.parse(res.raw); } catch {}
      return { ok: false, error: j?.error?.message || `Anthropic HTTP ${res.status}` };
    }
    return { ok: true, text: full };
  } catch (e) {
    if (full) return { ok: true, text: full };   // keep whatever streamed before the drop
    if (cfg.provider === 'ollama') return { ok: false, error: 'Could not reach Ollama. Make sure it is installed and running (ollama.com), then try again.' };
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Probe the local Ollama server. Returns:
 *   { running: boolean, models: string[] }
 * `running` is true when the server answered; `models` lists the installed
 * model names (e.g. "llama3.2:latest"). Never throws.
 */
async function detectOllama() {
  try {
    const res = await ollamaRequest('/api/tags', { method: 'GET', timeoutMs: 6000 });
    if (res.status !== 200 || !res.json) return { running: false, models: [] };
    const models = Array.isArray(res.json.models)
      ? res.json.models.map((m) => m && (m.name || m.model)).filter(Boolean)
      : [];
    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

module.exports = { getConfig, setConfig, chat, chatStream, detectOllama, DEFAULT_MODELS };
