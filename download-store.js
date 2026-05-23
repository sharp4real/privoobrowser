const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const MAX_RECORDS = 1000;

function file() {
  return path.join(app.getPath('userData'), 'downloads.json');
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return [];
  }
}

function save(list) {
  try {
    fs.writeFileSync(file(), JSON.stringify(list), 'utf8');
  } catch (e) {
    console.warn('download-store: write failed:', e.message);
  }
}

function add(record) {
  const list = load();
  list.unshift(record);
  if (list.length > MAX_RECORDS) list.splice(MAX_RECORDS);
  save(list);
}

function update(id, patch) {
  const list = load();
  const idx = list.findIndex((d) => d.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch };
    save(list);
    return list[idx];
  }
  return null;
}

function remove(id) {
  const list = load();
  const kept = list.filter((d) => d.id !== id);
  save(kept);
  return list.length - kept.length;
}

function clearAll() {
  const count = load().length;
  save([]);
  return count;
}

function clearSince(since) {
  const cutoff = Number(since);
  if (!Number.isFinite(cutoff) || cutoff <= 0) return clearAll();
  const list = load();
  const kept = list.filter((d) => {
    const ts = d.endTime || d.startTime || 0;
    return ts < cutoff;
  });
  save(kept);
  return list.length - kept.length;
}

module.exports = { load, add, update, remove, clearAll, clearSince };
