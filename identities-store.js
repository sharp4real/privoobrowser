'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = () => path.join(app.getPath('userData'), 'privoo-identities.json');

const FIELD_KEYS = [
  'fullName', 'firstName', 'lastName', 'email', 'phone',
  'address1', 'address2', 'city', 'state', 'zip', 'country', 'company',
];

function loadAll() {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    const parsed = JSON.parse(raw);
    return {
      identities: Array.isArray(parsed.identities) ? parsed.identities : [],
      defaultId: parsed.defaultId || null,
    };
  } catch {
    return { identities: [], defaultId: null };
  }
}

function saveAll(data) {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(data, null, 2), 'utf8');
}

function list() {
  const { identities, defaultId } = loadAll();
  return identities.map((i) => ({ ...i, __default: i.id === defaultId }));
}

function getDefault() {
  const { identities, defaultId } = loadAll();
  if (!identities.length) return null;
  return identities.find((i) => i.id === defaultId) || identities[0];
}

function upsert(identity) {
  const data = loadAll();
  const label = String(identity?.label || '').trim();
  if (!label) return { ok: false, error: 'Missing label' };
  const fields = {};
  for (const k of FIELD_KEYS) fields[k] = String(identity?.fields?.[k] || '').trim();

  if (identity.id) {
    const existing = data.identities.find((i) => i.id === identity.id);
    if (!existing) return { ok: false, error: 'Not found' };
    existing.label = label;
    existing.fields = fields;
    existing.updatedAt = Date.now();
  } else {
    const id = `id_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    data.identities.push({ id, label, fields, updatedAt: Date.now() });
    if (!data.defaultId) data.defaultId = id;
  }
  saveAll(data);
  return { ok: true };
}

function remove(id) {
  const data = loadAll();
  data.identities = data.identities.filter((i) => i.id !== id);
  if (data.defaultId === id) data.defaultId = data.identities[0]?.id || null;
  saveAll(data);
  return { ok: true };
}

function setDefault(id) {
  const data = loadAll();
  if (!data.identities.some((i) => i.id === id)) return { ok: false, error: 'Not found' };
  data.defaultId = id;
  saveAll(data);
  return { ok: true };
}

module.exports = { FIELD_KEYS, list, getDefault, upsert, remove, setDefault };
