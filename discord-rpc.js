'use strict';

const net  = require('net');

const APP_ID    = '1448744514406846554';
const OP_HANDSHAKE = 0;
const OP_FRAME     = 1;

let _socket    = null;
let _ready     = false;
let _pending   = null;   // activity to apply once READY arrives
let _nonce     = 0;
let _retryTimer = null;

// ─── wire helpers ────────────────────────────────────────────────────────────

function encode(op, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const buf  = Buffer.allocUnsafe(8 + body.length);
  buf.writeUInt32LE(op,          0);
  buf.writeUInt32LE(body.length, 4);
  body.copy(buf, 8);
  return buf;
}

function pipePath(n) {
  if (process.platform === 'win32') {
    return `\\\\?\\pipe\\discord-ipc-${n}`;
  }
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || '/tmp';
  return `${dir}/discord-ipc-${n}`;
}

// ─── connect ─────────────────────────────────────────────────────────────────

function tryConnect(n = 0) {
  if (n > 9) { scheduleRetry(); return; }

  const sock = net.createConnection(pipePath(n));
  sock.once('connect', () => {
    _socket = sock;
    sock.write(encode(OP_HANDSHAKE, { v: 1, client_id: APP_ID }));
    listenFrames(sock);
  });
  sock.once('error', () => tryConnect(n + 1));
}

function listenFrames(sock) {
  let buf = Buffer.alloc(0);

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const len = buf.readUInt32LE(4);
      if (buf.length < 8 + len) break;
      const body = buf.slice(8, 8 + len).toString('utf8');
      buf = buf.slice(8 + len);
      try { handleFrame(JSON.parse(body)); } catch {}
    }
  });

  sock.on('close', onDisconnect);
  sock.on('error', onDisconnect);
}

function handleFrame(msg) {
  if (msg?.evt === 'READY') {
    _ready = true;
    if (_pending) applyActivity(_pending);
  }
}

function onDisconnect() {
  _socket = null;
  _ready  = false;
  scheduleRetry();
}

function scheduleRetry() {
  clearTimeout(_retryTimer);
  _retryTimer = setTimeout(() => { if (!_socket) tryConnect(0); }, 15000);
}

// ─── activity ────────────────────────────────────────────────────────────────

function applyActivity(activity) {
  if (!_socket || !_ready) return;
  const payload = {
    cmd:   'SET_ACTIVITY',
    args:  { pid: process.pid, activity },
    nonce: String(++_nonce),
  };
  try { _socket.write(encode(OP_FRAME, payload)); } catch {}
}

// ─── public API ──────────────────────────────────────────────────────────────

function connect() {
  if (_socket) return;
  clearTimeout(_retryTimer);
  tryConnect(0);
}

function disconnect() {
  clearTimeout(_retryTimer);
  _ready = false;
  _pending = null;
  if (_socket) {
    try { _socket.destroy(); } catch {}
    _socket = null;
  }
}

function setActivity(activity) {
  _pending = {
    ...activity,
    assets: { large_image: 'privoo', large_text: 'Privoo Browser', ...activity?.assets },
  };
  applyActivity(_pending);
}

function clearActivity() {
  _pending = null;
  if (!_socket || !_ready) return;
  const payload = {
    cmd:   'SET_ACTIVITY',
    args:  { pid: process.pid, activity: null },
    nonce: String(++_nonce),
  };
  try { _socket.write(encode(OP_FRAME, payload)); } catch {}
}

module.exports = { connect, disconnect, setActivity, clearActivity };
