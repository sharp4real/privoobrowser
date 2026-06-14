'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

// The REAL userData root, captured at module load — BEFORE main.js may
// redirect app.setPath('userData', …) to a per-profile folder for isolation.
// The profiles registry + prefs always live here so every profile process
// reads the same shared list, regardless of which profile is active.
const ROOT = app.getPath('userData');

function registryFile() { return path.join(ROOT, 'privoo-profiles.json'); }
function prefsFile()    { return path.join(ROOT, 'privoo-profile-prefs.json'); }

// Where the active profile's data (settings, history, cookies, cache…) lives.
// After main.js calls app.setPath('userData', profileDir) at launch, this
// returns that per-profile directory. For the default profile it's ROOT.
function getDataDir() { return app.getPath('userData'); }

function rootDir() { return ROOT; }

// ── Registry (the extra, user-created profiles — "default" is implicit) ──────
function loadAll() {
  try { return JSON.parse(fs.readFileSync(registryFile(), 'utf8')); } catch { return []; }
}
function saveAll(list) {
  try { fs.writeFileSync(registryFile(), JSON.stringify(list, null, 2), 'utf8'); } catch {}
}

// ── Prefs (default profile to auto-open, picker behaviour, last active) ──────
const PREFS_DEFAULTS = {
  defaultProfileId: null,   // profile to auto-open on launch (null = ask via picker)
  alwaysShowPicker: false,  // always show the picker even when a default is set
  activeId: 'default',      // last-launched profile
  defaultName: 'Default',   // the built-in profile's display name (customisable)
  defaultAvatar: '',        // the built-in profile's avatar (data URI)
};
function loadPrefs() {
  try { return { ...PREFS_DEFAULTS, ...JSON.parse(fs.readFileSync(prefsFile(), 'utf8')) }; }
  catch { return { ...PREFS_DEFAULTS }; }
}
function savePrefs(patch) {
  const next = { ...loadPrefs(), ...patch };
  try { fs.writeFileSync(prefsFile(), JSON.stringify(next, null, 2), 'utf8'); } catch {}
  return next;
}

function getActiveId()           { return loadPrefs().activeId || 'default'; }
function setActiveId(id)          { savePrefs({ activeId: id || 'default' }); }
function getDefaultProfileId()    { return loadPrefs().defaultProfileId || null; }
function setDefaultProfileId(id)  { savePrefs({ defaultProfileId: id || null }); }
function getAlwaysShowPicker()    { return !!loadPrefs().alwaysShowPicker; }
function setAlwaysShowPicker(v)   { savePrefs({ alwaysShowPicker: !!v }); }

// ── Per-profile data directory ──────────────────────────────────────────────
function getProfileDataDir(id) {
  if (!id || id === 'default') return ROOT;
  return path.join(ROOT, 'profiles', id);
}

// ── CRUD ────────────────────────────────────────────────────────────────────
function defaultProfile() {
  const p = loadPrefs();
  return { id: 'default', name: p.defaultName || 'Default', avatar: p.defaultAvatar || '', createdAt: 0 };
}

function getById(id) {
  if (!id || id === 'default') return defaultProfile();
  return loadAll().find((p) => p.id === id) || null;
}

function listWithDefault() {
  return [defaultProfile(), ...loadAll()];
}

function create({ name, avatar = '' }) {
  const list = loadAll();
  const id = randomUUID();
  const profile = { id, name: (name || 'New Profile').trim(), avatar, createdAt: Date.now() };
  list.push(profile);
  saveAll(list);
  try { fs.mkdirSync(getProfileDataDir(id), { recursive: true }); } catch {}
  return profile;
}

function update(id, patch) {
  if (!id || id === 'default') {
    // The built-in profile's name/avatar live in prefs (no registry row).
    savePrefs({ defaultName: patch.name || 'Default', defaultAvatar: patch.avatar || '' });
    return defaultProfile();
  }
  const list = loadAll();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error('Profile not found: ' + id);
  list[idx] = { ...list[idx], ...patch };
  saveAll(list);
  return list[idx];
}

function remove(id) {
  if (!id || id === 'default') throw new Error('Cannot delete the default profile');
  saveAll(loadAll().filter((p) => p.id !== id));
  const prefs = loadPrefs();
  if (prefs.defaultProfileId === id) setDefaultProfileId(null);
  if (prefs.activeId === id) setActiveId('default');
  try { fs.rmSync(getProfileDataDir(id), { recursive: true, force: true }); } catch {}
}

module.exports = {
  rootDir,
  getDataDir,
  getProfileDataDir,
  loadAll,
  listWithDefault,
  defaultProfile,
  getById,
  create,
  update,
  remove,
  // prefs
  loadPrefs,
  savePrefs,
  getActiveId,
  setActiveId,
  getDefaultProfileId,
  setDefaultProfileId,
  getAlwaysShowPicker,
  setAlwaysShowPicker,
};
