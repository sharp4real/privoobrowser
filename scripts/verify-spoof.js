'use strict';

/**
 * Runs before every build, alongside verify-release.js.
 *
 * Google's sign-in integrity check rejects a browser with "This browser or app
 * may not be secure" when it finds non-native functions standing in for native
 * ones on window/navigator. google-spoof.js installs a lot of those — that is
 * its whole job — so it carries per-host skips to stay pristine on the hosts
 * that look. Those skips have been quietly re-broken twice: once by a second
 * navigator.permissions wrapper, once by the synthetic window.chrome.runtime.
 * Both times it built fine, looked fine on inspection, and broke sign-in.
 *
 * So this executes the real script in a VM against a stubbed Chrome-shaped DOM
 * and counts what it actually leaves behind — testing the failure condition
 * rather than reading the code and deciding it looks right.
 *
 * Two-sided on purpose:
 *   - Google hosts must end up with ZERO non-native functions, and Electron's
 *     globals (window.process/require/Buffer…) must still be scrubbed.
 *   - A normal host must still get the full spoof, so a future "fix" can't
 *     silently disable fingerprint protection everywhere to make this pass.
 */
const vm = require('vm');
const ROOT = require('path').join(__dirname, '..');
const { buildGoogleSpoofScript } = require(require('path').join(ROOT, 'google-spoof.js'));

const script = buildGoogleSpoofScript({ chromeVersion: '142.0.0.0', platform: 'win32' });

function nativeFn(name) {
  const f = function () {};
  Object.defineProperty(f, 'name', { value: name });
  f.toString = () => `function ${name}() { [native code] }`;
  return f;
}

function run(hostname) {
  const navigator = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Privoo/6.0.5 Safari/537.36',
    language: 'en-GB',
    languages: ['en-GB', 'en'],
    platform: 'Win32',
    hardwareConcurrency: 8,
    deviceMemory: 8,
    // Electron ships the genuine Chromium PDF plugins; model that.
    plugins: Object.assign(Object.create(null), { length: 5 }),
    mimeTypes: { length: 2 },
    permissions: { query: nativeFn('query') },
    credentials: { create: nativeFn('create'), get: nativeFn('get') },
    getBattery: nativeFn('getBattery'),
    connection: { rtt: 50, downlink: 10, effectiveType: '4g', saveData: false },
    webdriver: false,
  };
  const external = { AddSearchProvider: nativeFn('AddSearchProvider'), IsSearchProviderInstalled: nativeFn('IsSearchProviderInstalled') };
  const chrome = { loadTimes: nativeFn('loadTimes'), csi: nativeFn('csi') };

  const win = {
    navigator, external, chrome,
    location: { hostname, href: 'https://' + hostname + '/' },
    document: {
      documentElement: { removeAttribute() {}, classList: { add() {} } },
      addEventListener() {}, querySelector() { return null; },
    },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 },
    // Electron's real leaks, so we can confirm they still get scrubbed.
    process: { versions: { electron: '42.3.3' } },
    require: () => {}, module: {}, exports: {}, global: {}, Buffer: {},
    PluginArray: function PluginArray() {},
    Plugin: function Plugin() {},
    MimeType: function MimeType() {},
    MimeTypeArray: function MimeTypeArray() {},
    Notification: { permission: 'default' },
    PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: nativeFn('x'), isConditionalMediationAvailable: nativeFn('y') },
    Performance: { prototype: { now: nativeFn('now') } },
    performance: { now: () => 1, timing: {}, getEntriesByType: () => [] },
    CanvasRenderingContext2D: { prototype: { getImageData: nativeFn('getImageData') } },
    HTMLCanvasElement: { prototype: { toDataURL: nativeFn('toDataURL'), toBlob: nativeFn('toBlob') } },
    WebGLRenderingContext: { prototype: { getParameter: nativeFn('getParameter') } },
    WebGL2RenderingContext: { prototype: { getParameter: nativeFn('getParameter') } },
    Object, Function, Promise, Math, Date, Array, JSON, String, Number, RegExp,
    DOMException: class DOMException extends Error { constructor(m, n) { super(m); this.name = n; } },
    setTimeout, setInterval, clearInterval,
    Reflect, Proxy, Symbol, Error, TypeError,
  };
  const origPlugins = navigator.plugins;
  const origChrome = chrome;
  const origExternal = external;
  win.window = win;
  win.self = win;
  win.top = win;
  win.globalThis = win;
  const ctx = vm.createContext(win);
  // The real injection runs in the page's main world with `this === window`.
  vm.runInContext(script, ctx, { filename: 'spoof.js' });

  // Must go through the function's OWN toString, the way a page's detector
  // does — Function.prototype.toString.call() from this realm bypasses the
  // stub's native-code marker and would report every function as tampered.
  const isNative = (f) => { try { return /\[native code\]/.test(f.toString()); } catch { return false; } };
  const tells = [];
  const check = (label, f) => { if (typeof f === 'function' && !isNative(f)) tells.push(label); };

  if (win.chrome && win.chrome.runtime) {
    tells.push('window.chrome.runtime (synthetic object)');
    check('window.chrome.runtime.connect', win.chrome.runtime.connect);
  }
  check('window.external.AddSearchProvider', win.external && win.external.AddSearchProvider);
  check('Function.prototype.toString', win.Function.prototype.toString);
  check('navigator.permissions.query', navigator.permissions && navigator.permissions.query);
  check('navigator.getBattery', navigator.getBattery);
  check('navigator.credentials.get', navigator.credentials && navigator.credentials.get);
  check('navigator.credentials.create', navigator.credentials && navigator.credentials.create);
  check('Performance.prototype.now', win.Performance.prototype.now);
  check('CanvasRenderingContext2D.prototype.getImageData', win.CanvasRenderingContext2D.prototype.getImageData);
  check('WebGLRenderingContext.prototype.getParameter', win.WebGLRenderingContext.prototype.getParameter);
  if (navigator.plugins !== origPlugins) tells.push('navigator.plugins (synthetic PluginArray)');
  if (win.chrome !== origChrome) tells.push('window.chrome (replaced object)');
  if (win.external !== origExternal) tells.push('window.external (replaced object)');

  const leaks = ['process', 'require', 'module', 'exports', 'global', 'Buffer'].filter((k) => win[k] !== undefined);

  return { tells, leaks };
}

let bad = 0;
for (const host of ['accounts.google.com', 'www.google.com', 'www.youtube.com']) {
  const { tells, leaks } = run(host);
  if (tells.length) { bad++; console.log(`FAIL  ${host}: ${tells.length} non-native tell(s):`); tells.forEach((t) => console.log('        ' + t)); }
  else console.log(`ok    ${host}: no non-native functions installed`);
  if (leaks.length) { bad++; console.log(`FAIL  ${host}: Electron leaks survived: ${leaks.join(', ')}`); }
  else console.log(`ok    ${host}: Electron globals scrubbed`);
}

// Control: a normal site should STILL get the full treatment, or this change
// quietly disabled fingerprint protection everywhere instead of just on Google.
const ctrl = run('example.com');
if (ctrl.tells.length >= 5) console.log(`ok    example.com: full spoof still active (${ctrl.tells.length} wrappers, as intended off Google)`);
else { bad++; console.log(`FAIL  example.com: spoof weakened everywhere — only ${ctrl.tells.length} wrapper(s): ${ctrl.tells.join(', ')}`); }

console.log('');
console.log(bad ? bad + ' problem(s).' : 'accounts.google.com sees a pristine environment; other sites unchanged.');
process.exit(bad ? 1 : 0);
