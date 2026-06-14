const fs = require('fs');
const path = require('path');
const profileStore = require('./profile-store');

const MAX_ENTRIES = 15000;

function file() {
  return path.join(profileStore.getDataDir(), 'history.json');
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return [];
  }
}

function save(entries) {
  try {
    fs.writeFileSync(file(), JSON.stringify(entries), 'utf8');
  } catch (e) {
    console.warn('history-store: write failed:', e.message);
  }
}

function add(entry) {
  const list = load();
  const now = normalizeVisitTime(entry.visitTime) || Date.now();
  const last = list[list.length - 1];
  // Deduplicate: same URL within 10s just refreshes timestamp + title
  if (last && last.url === entry.url && now - last.visitTime < 10000) {
    last.visitTime = now;
    last.title = entry.title || last.title;
    save(list);
    return;
  }
  list.push({ url: entry.url, title: entry.title || entry.url, visitTime: now });
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  save(list);
}

function normalizeVisitTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.round(n) : Math.round(n * 1000);
}

function importEntries(entries = []) {
  const list = load();
  const seen = new Set(list.map((e) => `${e.url}\n${Math.floor((e.visitTime || 0) / 60000)}`));
  let imported = 0;

  for (const entry of entries) {
    if (!entry || !entry.url) continue;
    const visitTime = normalizeVisitTime(entry.visitTime) || Date.now();
    const key = `${entry.url}\n${Math.floor(visitTime / 60000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({
      url: String(entry.url),
      title: entry.title || entry.url,
      visitTime,
    });
    imported++;
  }

  list.sort((a, b) => (a.visitTime || 0) - (b.visitTime || 0));
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  save(list);
  return { imported, total: list.length };
}

function search(query, limit = 200) {
  const list = load();
  if (!query) return [...list].reverse().slice(0, limit);
  const q = query.toLowerCase();
  return [...list]
    .reverse()
    .filter((e) => e.url.toLowerCase().includes(q) || (e.title || '').toLowerCase().includes(q))
    .slice(0, limit);
}

// Returns the last N unique URLs matching a prefix, for omnibox autocomplete
function autocomplete(prefix, limit = 5) {
  if (!prefix) return [];
  const p = prefix.toLowerCase();
  const seen = new Set();
  const results = [];
  const list = load();
  for (let i = list.length - 1; i >= 0 && results.length < limit; i--) {
    const e = list[i];
    if (!seen.has(e.url) && (e.url.toLowerCase().includes(p) || (e.title || '').toLowerCase().includes(p))) {
      seen.add(e.url);
      results.push(e);
    }
  }
  return results;
}

function clearAll() {
  const count = load().length;
  save([]);
  return count;
}

function clearSince(since) {
  const cutoff = normalizeVisitTime(since);
  if (!cutoff) return clearAll();
  const list = load();
  const kept = list.filter((e) => (e.visitTime || 0) < cutoff);
  save(kept);
  return list.length - kept.length;
}

function removeEntry(visitTime) {
  const target = Number(visitTime);
  const list = load();
  const kept = list.filter((e) => e.visitTime !== target);
  save(kept);
  return list.length - kept.length;
}

function removeEntries(visitTimes = []) {
  const targets = new Set(visitTimes.map(Number));
  const list = load();
  const kept = list.filter((e) => !targets.has(e.visitTime));
  save(kept);
  return list.length - kept.length;
}

function removeDomain(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return 0;
  const list = load();
  const kept = list.filter((e) => {
    try {
      const h = new URL(e.url).hostname.toLowerCase();
      return h !== host && !h.endsWith(`.${host}`);
    } catch {
      return true;
    }
  });
  save(kept);
  return list.length - kept.length;
}

function summary() {
  const list = load();
  const domains = new Set();
  let oldest = null;
  let newest = null;
  for (const e of list) {
    if (e.visitTime) {
      oldest = oldest === null ? e.visitTime : Math.min(oldest, e.visitTime);
      newest = newest === null ? e.visitTime : Math.max(newest, e.visitTime);
    }
    try { domains.add(new URL(e.url).hostname); } catch { /* ignore */ }
  }
  return { count: list.length, domains: domains.size, oldest, newest };
}

module.exports = {
  load,
  add,
  importEntries,
  search,
  autocomplete,
  clearAll,
  clearSince,
  removeEntry,
  removeEntries,
  removeDomain,
  summary,
};
