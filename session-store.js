'use strict';

const fs = require('fs');
const path = require('path');
const profileStore = require('./profile-store');

function filePath() {
  return path.join(profileStore.getDataDir(), 'privoo-last-session.json');
}

function load() {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function save(data) {
  try {
    fs.writeFileSync(filePath(), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('session-store: write failed:', e.message);
  }
}

module.exports = { load, save, filePath };
