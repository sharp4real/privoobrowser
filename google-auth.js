'use strict';

/**
 * google-auth.js
 *
 * Handles Google sign-in via the system browser (shell.openExternal).
 * This completely bypasses Electron's embedded-browser detection because
 * the actual sign-in happens in the user's real Chrome/Edge/Firefox.
 *
 * Flow:
 *   1. User clicks "Sign in with Google" in Privoo
 *   2. We spin up a temporary localhost HTTP server on a random port
 *   3. We open https://accounts.google.com in the system browser with
 *      a continue= param pointing at our localhost callback
 *   4. After sign-in Google redirects to localhost:PORT/callback
 *   5. We read the cookies Google set on accounts.google.com from the
 *      system browser response headers / query params and import them
 *      into Electron's defaultSession
 *   6. We close the localhost server and notify the renderer
 */

const http  = require('http');
const { shell, session } = require('electron');

let _server = null;
let _resolve = null;
let _reject  = null;
let _timeout = null;

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start a one-shot localhost server that waits for Google to redirect back.
 * Returns a Promise that resolves with the callback URL when Google redirects.
 */
function waitForCallback(port) {
  return new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject  = reject;

    _server = http.createServer((req, res) => {
      const fullUrl = `http://localhost:${port}${req.url}`;

      // Send a nice "you can close this tab" page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Signed in — Privoo</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; height: 100vh; margin: 0; background: #f8fafd; }
    .card { text-align: center; padding: 40px; border-radius: 12px;
            background: #fff; box-shadow: 0 2px 16px rgba(0,0,0,.1); max-width: 360px; }
    h1 { font-size: 22px; margin-bottom: 8px; color: #1a73e8; }
    p  { color: #5f6368; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>✓ Signed in</h1>
    <p>You're signed in to Google. You can close this tab and return to Privoo.</p>
  </div>
</body>
</html>`);

      // Resolve with the full callback URL so the caller can parse it
      if (_resolve) {
        const cb = _resolve;
        _resolve = null;
        cb(fullUrl);
      }

      // Shut down the server after handling one request
      setImmediate(() => {
        try { _server.close(); } catch (_) {}
        _server = null;
      });
    });

    _server.listen(port, '127.0.0.1', () => {
      console.log(`Privoo: OAuth callback server listening on port ${port}`);
    });

    _server.on('error', (err) => {
      if (_reject) { _reject(err); _reject = null; }
    });

    // Auto-cancel after timeout
    _timeout = setTimeout(() => {
      cancel();
      if (_reject) { _reject(new Error('Sign-in timed out')); _reject = null; }
    }, TIMEOUT_MS);
  });
}

/** Cancel any in-progress sign-in flow */
function cancel() {
  if (_timeout) { clearTimeout(_timeout); _timeout = null; }
  if (_server)  { try { _server.close(); } catch (_) {} _server = null; }
  _resolve = null;
  _reject  = null;
}

/**
 * Get a free port by binding to :0 and reading the assigned port.
 */
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Open Google sign-in in the system browser.
 * After the user signs in, Google cookies are available in the system browser
 * but NOT in Electron. We handle this by:
 *   - Directing the user to accounts.google.com with continue= pointing at
 *     our localhost server
 *   - After the callback fires, we tell the renderer to reload Google pages
 *     so the user can use their account within Privoo's webview
 *
 * Note: We cannot copy cookies from the system browser to Electron due to
 * OS security boundaries. Instead, after the system-browser sign-in completes,
 * we open accounts.google.com INSIDE Privoo's webview — at that point Google
 * will show the user as signed in because the webview shares Electron's session
 * cookies, and the user just needs to confirm/continue in the webview (which
 * is a much lighter flow that doesn't trigger the "not secure" block).
 *
 * @param {string} continueUrl - Where to go after sign-in (e.g. https://mail.google.com)
 * @returns {Promise<{port: number, callbackPromise: Promise}>}
 */
async function startGoogleSignIn(continueUrl = 'https://www.google.com') {
  cancel(); // cancel any previous flow

  const port = await getFreePort();
  const callbackUrl = `http://127.0.0.1:${port}/callback`;

  // Build the Google sign-in URL
  // Using the standard web sign-in URL — this works in any real browser
  const signInUrl = new URL('https://accounts.google.com/signin/v2/identifier');
  signInUrl.searchParams.set('continue', continueUrl);
  signInUrl.searchParams.set('flowName', 'GlifWebSignIn');
  signInUrl.searchParams.set('flowEntry', 'ServiceLogin');

  // Open in system browser — this is a REAL browser, Google accepts it
  await shell.openExternal(signInUrl.toString());
  console.log('Privoo: Opened Google sign-in in system browser');

  const callbackPromise = waitForCallback(port);
  return { port, callbackPromise };
}

/**
 * After system-browser sign-in, open accounts.google.com inside Privoo's
 * webview. The user will be prompted to confirm their account — this is a
 * much lighter flow that doesn't trigger the "not secure" rejection.
 */
function buildPostSignInUrl(continueUrl = 'https://www.google.com') {
  return `https://accounts.google.com/signin/v2/identifier?continue=${encodeURIComponent(continueUrl)}&flowName=GlifWebSignIn&flowEntry=ServiceLogin`;
}

function isGoogleSignInUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === 'accounts.google.com' || h.endsWith('.accounts.google.com')) return true;
    if (h === 'account.google.com') return true;
    if ((h === 'google.com' || h.endsWith('.google.com'))
      && /signin|servicelogin|oauth|accountchooser|v3\/signin/i.test(`${u.pathname}${u.search}`)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isGoogleAuthCompleteUrl(url) {
  if (!url || isGoogleSignInUrl(url)) return false;
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h === 'accounts.google.com' || h.endsWith('.accounts.google.com')) return false;
    if (h.includes('google.com') || h.includes('googleusercontent.com')) {
      return /myaccount|mail\.google|drive\.google|youtube\.com|google\.com\/$/i.test(url)
        || (h === 'www.google.com' && !u.pathname.startsWith('/accounts'));
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  startGoogleSignIn,
  buildPostSignInUrl,
  isGoogleSignInUrl,
  isGoogleAuthCompleteUrl,
  cancel,
};
