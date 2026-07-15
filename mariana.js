// mariana.js — Privoo's ".mariana" anonymous hosting + post-quantum transport.
//
// What this is, in plain terms:
//   * A .mariana site is just a Tor v3 hidden service (.onion) that Privoo
//     spins up FOR you from a local folder — no server admin, no port
//     forwarding, no domain. Your PC is the host; Tor makes it reachable
//     and anonymous. Same underlying tech as OnionShare / Tor onion sites.
//   * On top of Tor's own encryption we add an OPTIONAL post-quantum layer
//     (ML-KEM-768, aka Kyber): when a Privoo visitor loads your .mariana
//     site, the two Privoo instances run a post-quantum key exchange and
//     encrypt the page a SECOND time, end to end. Tor already encrypts the
//     circuit; this protects against a future quantum computer recording
//     the traffic today and decrypting it later ("harvest now, decrypt
//     later"). It is NOT magic and NOT "unbreakable" — it is a well-scoped
//     extra layer that only applies Privoo<->Privoo. A non-Privoo Tor
//     browser can still open the site, just over plain Tor with no PQ.
//
// This module runs in the MAIN process. The client-side fetch/decrypt for
// the mariana:// protocol lives in main.js (it needs Electron's net/session
// to route through Tor), but the crypto helpers it uses are exported here so
// both ends speak exactly the same handshake.

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const { MlKem768 } = require('mlkem');

let _app = null;
let _deps = { getTorPort: () => 9100, getControlPort: () => 9101, ensureTor: () => false,
              controlCookiePath: () => '' };

// ── Registry persistence ────────────────────────────────────────────────────
// Sites you host live in userData/mariana-sites.json. It holds the site's
// onion PRIVATE key and its ML-KEM secret key, so treat it like the password
// store — it's what lets the same .mariana address survive a restart.
function sitesFile() { return path.join(_app.getPath('userData'), 'mariana-sites.json'); }

function loadSites() {
  try { return JSON.parse(fs.readFileSync(sitesFile(), 'utf8')); }
  catch { return []; }
}
function saveSites(list) {
  try { fs.writeFileSync(sitesFile(), JSON.stringify(list, null, 2)); } catch { /* ignore */ }
}

// Visited .mariana names you've resolved before (name -> onion), so typing
// the short name works on repeat visits without the full share link.
function visitedFile() { return path.join(_app.getPath('userData'), 'mariana-visited.json'); }
function loadVisited() {
  try { return JSON.parse(fs.readFileSync(visitedFile(), 'utf8')); } catch { return {}; }
}
function saveVisited(map) {
  try { fs.writeFileSync(visitedFile(), JSON.stringify(map, null, 2)); } catch { /* ignore */ }
}
function rememberVisited(name, onion) {
  if (!name || !onion) return;
  const map = loadVisited();
  map[name] = { onion, seenAt: Date.now() };
  saveVisited(map);
}
function lookupVisited(name) {
  const e = loadVisited()[name];
  return e ? e.onion : null;
}

// ── Post-quantum + symmetric crypto helpers (shared by host and client) ──────
const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (str) => new Uint8Array(Buffer.from(str, 'base64'));

async function genKemKeys() {
  const kem = new MlKem768();
  const [pub, sec] = await kem.generateKeyPair();
  return { pub, sec };
}
// Client side: given the host's ML-KEM public key, produce (ciphertext to
// send back, shared secret). Server decapsulates the ciphertext to get the
// same shared secret. Neither the secret nor a usable key ever crosses the
// wire — only the KEM ciphertext, which is useless without the host's key.
async function encapsulate(pubBytes) {
  const kem = new MlKem768();
  const [ct, ss] = await kem.encap(pubBytes);
  return { ct, secret: ss };
}
async function decapsulate(ctBytes, secBytes) {
  const kem = new MlKem768();
  return kem.decap(ctBytes, secBytes);
}
// Turn the 32-byte KEM shared secret into an AES-256-GCM key. HKDF binds it
// to a fixed context string so the key is only ever used for this purpose.
function deriveKey(sharedSecret) {
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(sharedSecret), Buffer.alloc(0),
      Buffer.from('privoo-mariana-pq-v1'), 32),
  );
}
function encryptBody(key, plaintext) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { nonce, tag, ct };
}
function decryptBody(key, nonce, tag, ct) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// ── Tor control-port client ──────────────────────────────────────────────────
// Speaks Tor's control protocol over 127.0.0.1:<controlPort>. We use it only
// to ADD_ONION (create an ephemeral hidden service pointing at our local
// static server) and DEL_ONION (tear it down). Cookie authentication reads
// the auth cookie Tor writes into its data directory.
function controlRequest(commands) {
  // commands: array of {line, terminator?} run in sequence after AUTH.
  return new Promise((resolve, reject) => {
    const port = _deps.getControlPort();
    const sock = net.connect(port, '127.0.0.1');
    let buf = '';
    let stage = 0;
    const results = [];
    let cookieHex = '';
    try {
      const cookie = fs.readFileSync(_deps.controlCookiePath());
      cookieHex = cookie.toString('hex');
    } catch (e) {
      sock.destroy();
      return reject(new Error('Tor control cookie unreadable — is Tor running with ControlPort?'));
    }

    const queue = [`AUTHENTICATE ${cookieHex}`, ...commands];
    let idx = 0;

    sock.setTimeout(15000);
    sock.on('timeout', () => { sock.destroy(); reject(new Error('Tor control timeout')); });
    sock.on('error', reject);

    function sendNext() {
      if (idx >= queue.length) { sock.end(); return resolve(results); }
      sock.write(queue[idx] + '\r\n');
    }

    sock.on('connect', () => sendNext());
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      // A full reply ends with a line like "250 OK" / "550 msg" — status
      // code, a space (not a dash), then text, then CRLF.
      let m;
      while ((m = buf.match(/^(.*?)(\d{3})\s[^\r\n]*\r\n/s))) {
        const full = buf.slice(0, m.index + m[0].length);
        buf = buf.slice(m.index + m[0].length);
        const code = m[2];
        if (code[0] !== '2') { sock.destroy(); return reject(new Error('Tor control error: ' + full.trim())); }
        results[idx] = full;
        idx++;
        sendNext();
      }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Create (or re-create with a saved key) a hidden service mapping the onion's
// port 80 to our local static server. Returns { onion, privKey }.
// Tor's control port + auth cookie aren't ready for a few seconds after the
// process spawns, so retry rather than fail a publish attempted right after
// launch. ~30s of attempts covers a cold Tor bootstrap.
async function addOnion(localPort, savedPrivKey) {
  const keySpec = savedPrivKey ? savedPrivKey : 'NEW:ED25519-V3';
  const cmd = `ADD_ONION ${keySpec} Port=80,127.0.0.1:${localPort}`;
  let lastErr = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const res = await controlRequest([cmd]);
      const reply = res[1] || '';
      const sid = reply.match(/ServiceID=([a-z2-7]{56})/i);
      const pk = reply.match(/PrivateKey=([^\r\n]+)/);
      if (!sid) throw new Error('ADD_ONION did not return a ServiceID');
      return { onion: sid[1] + '.onion', privKey: pk ? pk[1] : savedPrivKey };
    } catch (e) {
      lastErr = e;
      await sleep(1500);
    }
  }
  throw lastErr || new Error('Tor control port did not become ready');
}
async function delOnion(onion) {
  const sid = onion.replace(/\.onion$/, '');
  try { await controlRequest([`DEL_ONION ${sid}`]); } catch { /* already gone */ }
}

// ── Local static file server (the actual host of your folder) ────────────────
// Binds to a random localhost port. Tor points the onion at it. Serves files
// from the site folder, and — when the visitor is Privoo and sends a KEM
// ciphertext — encrypts the response with the derived post-quantum key.
function contentTypeFor(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
  })[ext] || 'application/octet-stream';
}

// Resolve a request path to a real file inside the site root, blocking any
// attempt to climb out of the folder with ../ etc.
function resolveFileInRoot(root, urlPath) {
  let rel = decodeURIComponent((urlPath.split('?')[0] || '/'));
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.normalize(path.join(root, rel));
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

function startLocalServer(site) {
  return new Promise((resolve, reject) => {
    const secBytes = unb64(site.mlkemSec);
    const server = http.createServer(async (req, res) => {
      try {
        // The visitor's Privoo asks for our post-quantum public key first.
        if (req.url.split('?')[0] === '/__mariana/pubkey') {
          const pub = Buffer.from(unb64(site.mlkemPub));
          res.writeHead(200, { 'content-type': 'application/octet-stream',
            'x-mariana': 'pq-v1', 'content-length': pub.length });
          return res.end(pub);
        }

        const file = resolveFileInRoot(site.folder, req.url);
        if (!file) { res.writeHead(400); return res.end('Bad path'); }
        let data;
        try { data = await fs.promises.readFile(file); }
        catch {
          // SPA-friendly fallback to index.html, then a real 404.
          try { data = await fs.promises.readFile(path.join(site.folder, 'index.html')); }
          catch { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
        }
        const ctype = contentTypeFor(file);

        // Opportunistic PQ: if the visitor sent a KEM ciphertext (they're on
        // Privoo), derive the shared key, encrypt the body, and mark it. If
        // not (a plain Tor browser), serve normally over Tor only.
        const kemHeader = req.headers['x-mariana-kem'];
        if (kemHeader) {
          try {
            const shared = await decapsulate(unb64(kemHeader), secBytes);
            const key = deriveKey(shared);
            const { nonce, tag, ct } = encryptBody(key, data);
            res.writeHead(200, {
              'content-type': ctype,
              'x-mariana-pq': '1',
              'x-mariana-nonce': b64(nonce),
              'x-mariana-tag': b64(tag),
              'content-length': ct.length,
            });
            return res.end(ct);
          } catch {
            // KEM failed — fall through to plaintext rather than break the page.
          }
        }
        res.writeHead(200, { 'content-type': ctype, 'content-length': data.length });
        res.end(data);
      } catch (e) {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('Server error');
      }
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
const _running = new Map(); // id -> { server, onion }

function init(app, deps) {
  _app = app;
  _deps = Object.assign(_deps, deps);
}

function shareLink(name, onion) {
  // Canonical, self-contained share link. The friendly name is a label; the
  // 56-char onion is the authoritative, self-authenticating address, so a
  // stranger who has this link can reach the site with no lookup service.
  return `mariana://${name}.${onion.replace(/\.onion$/, '')}/`;
}

async function hostFolder({ name, folder }) {
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error('That path is not a folder.');
  }
  const clean = String(name || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'site';
  if (!_deps.ensureTor()) throw new Error('Tor is not available — cannot create a .mariana site.');

  const keys = await genKemKeys();
  const site = {
    id: 'm_' + crypto.randomBytes(6).toString('hex'),
    name: clean,
    folder,
    mlkemPub: b64(keys.pub),
    mlkemSec: b64(keys.sec),
    onion: '',
    onionKey: '',
    createdAt: Date.now(),
    active: true,
  };

  const server = await startLocalServer(site);
  const localPort = server.address().port;
  let onionInfo;
  try {
    onionInfo = await addOnion(localPort);
  } catch (e) {
    try { server.close(); } catch {}
    throw e;
  }
  site.onion = onionInfo.onion;
  site.onionKey = onionInfo.privKey || '';

  const list = loadSites();
  list.push(site);
  saveSites(list);
  _running.set(site.id, { server, onion: site.onion });

  return decorate(site);
}

// Re-expose a saved site after a restart (same onion via the saved key).
async function startSite(site) {
  if (_running.has(site.id)) return decorate(site);
  if (!_deps.ensureTor()) throw new Error('Tor not available');
  const server = await startLocalServer(site);
  const localPort = server.address().port;
  const onionInfo = await addOnion(localPort, site.onionKey ? ('ED25519-V3:' + site.onionKey.replace(/^ED25519-V3:/, '')) : undefined);
  site.onion = onionInfo.onion;
  if (onionInfo.privKey) site.onionKey = onionInfo.privKey;
  const list = loadSites().map((s) => (s.id === site.id ? site : s));
  saveSites(list);
  _running.set(site.id, { server, onion: site.onion });
  return decorate(site);
}

async function stopSite(id) {
  const run = _running.get(id);
  if (run) {
    try { await delOnion(run.onion); } catch {}
    try { run.server.close(); } catch {}
    _running.delete(id);
  }
  const list = loadSites().map((s) => (s.id === id ? { ...s, active: false } : s));
  saveSites(list);
}

async function resumeSite(id) {
  const site = loadSites().find((s) => s.id === id);
  if (!site) throw new Error('No such site');
  site.active = true;
  const out = await startSite(site);
  const list = loadSites().map((s) => (s.id === id ? { ...s, active: true } : s));
  saveSites(list);
  return out;
}

async function removeSite(id) {
  await stopSite(id);
  saveSites(loadSites().filter((s) => s.id !== id));
}

// On boot, bring every site the user left "active" back online.
async function startAll() {
  for (const site of loadSites()) {
    if (site.active) {
      try { await startSite(site); }
      catch (e) { /* Tor may not be up yet; UI can retry */ }
    }
  }
}

async function stopAllForQuit() {
  for (const [id, run] of _running) {
    try { await delOnion(run.onion); } catch {}
    try { run.server.close(); } catch {}
  }
  _running.clear();
}

function decorate(site) {
  return {
    id: site.id,
    name: site.name,
    folder: site.folder,
    onion: site.onion,
    online: _running.has(site.id),
    active: site.active !== false,
    createdAt: site.createdAt,
    link: shareLink(site.name, site.onion),
    pqPublicKeyPreview: (site.mlkemPub || '').slice(0, 16) + '…',
  };
}

function listSites() { return loadSites().map(decorate); }

// How many sites are live right now — main.js uses this to keep Tor alive
// even when the user's browsing proxy isn't set to Tor.
function runningCount() { return _running.size; }

// Parse a mariana:// address into { name, onion, path }. Accepts both the
// full self-contained form (name.<56-char-onion>) and a short cached name.
function parseAddress(url) {
  let rest = String(url).replace(/^mariana:\/\//i, '');
  const slash = rest.indexOf('/');
  const host = slash >= 0 ? rest.slice(0, slash) : rest;
  const pathPart = slash >= 0 ? rest.slice(slash) : '/';
  const onionMatch = host.match(/([a-z2-7]{56})$/i);
  let name = host, onion = null;
  if (onionMatch) {
    onion = onionMatch[1].toLowerCase() + '.onion';
    name = host.slice(0, host.length - onionMatch[1].length).replace(/\.$/, '') || 'site';
  } else {
    onion = lookupVisited(host);
    name = host;
  }
  return { name, onion, path: pathPart || '/' };
}

module.exports = {
  init, hostFolder, startSite, stopSite, resumeSite, removeSite,
  startAll, stopAllForQuit, listSites, runningCount, shareLink, parseAddress,
  rememberVisited, lookupVisited,
  // crypto for the client side in main.js
  encapsulate, decapsulate, deriveKey, encryptBody, decryptBody, b64, unb64,
};
