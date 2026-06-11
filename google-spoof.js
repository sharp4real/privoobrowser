'use strict';

/**
 * google-spoof.js
 *
 * Builds a main-world JavaScript string that makes Electron's webview
 * look like a normal Chrome browser to embedded-browser detection used by
 * Google, Microsoft (Teams/Outlook), and similar services.
 *
 * Injection happens via CDP (Page.addScriptToEvaluateOnNewDocument) so the
 * script executes BEFORE any page script — this is the only reliable way
 * to beat detection that runs in inline <script> tags at the top of the page.
 *
 * Falls back to executeJavaScript at dom-ready if CDP is unavailable.
 */
function buildGoogleSpoofScript(opts) {
  opts = opts || {};
  const chromeFull = String(opts.chromeVersion || '142.0.0.0');
  const chromeMajor = chromeFull.split('.')[0] || '142';
  const hostPlatform = String(opts.platform || 'win32');
  const winUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + chromeFull + ' Safari/537.36';
  const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + chromeFull + ' Safari/537.36';
  const linUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + chromeFull + ' Safari/537.36';
  const defaultUA = hostPlatform === 'darwin' ? macUA : hostPlatform === 'linux' ? linUA : winUA;
  const uaPlatform = hostPlatform === 'darwin' ? 'macOS' : hostPlatform === 'linux' ? 'Linux' : 'Windows';
  const navPlatform = hostPlatform === 'darwin' ? 'MacIntel' : hostPlatform === 'linux' ? 'Linux x86_64' : 'Win32';
  const platformVersion = hostPlatform === 'darwin' ? '14.0.0' : hostPlatform === 'linux' ? '6.5.0' : '15.0.0';

  return `(function(){
  'use strict';
  // Education platforms (Bedrock, Sparx) run anti-cheat that LOCKS task controls
  // (the audio skip / progress slider stops advancing) the moment they detect a
  // non-standard environment. Unlike bot-detectors, they want a *legit* browser,
  // and our spoof — fake plugins, synthetic chrome object, farbled canvas, the
  // __privoo_spoofed__ marker — reads as tampering. Bail out completely so they
  // get a pristine page. Safe: the webview already runs contextIsolation +
  // nodeIntegration:false with a real Chrome UA, so nothing Electron leaks.
  try {
    var _eduH = location.hostname || '';
    if (/(^|\\.)bedrocklearning\\.(org|com|co\\.uk)$/i.test(_eduH)
      || /(^|\\.)sparxmaths\\.(com|uk)$/i.test(_eduH)
      || /(^|\\.)sparx-learning\\.com$/i.test(_eduH)) return;
  } catch(e) {}
  if (window.__privoo_spoofed__) return;
  try { Object.defineProperty(window, '__privoo_spoofed__', { value: true, configurable: false, writable: false }); } catch(e) { window.__privoo_spoofed__ = true; }

  var _win = window;
  var _nav = navigator;

  // Hosts with aggressive integrity / bot checks. For these we keep the Chrome
  // *identity* spoof (webdriver, chrome object, UA, Electron-trace removal) but
  // skip the fingerprint *farbling* (canvas noise, WebGL renderer override,
  // performance.now jitter). Farbled values are inconsistent with the rest of
  // the environment, which these sites flag — e.g. TikTok's "maximum number of
  // attempts reached", Google's reCAPTCHA loops, Bedrock locking task controls.
  var _h = location.hostname;
  var _isGoogleAuth = /(^|\\.)accounts\\.google\\.com$/i.test(_h)
    || /(^|\\.)google\\.(com|[a-z]{2,3}|co\\.[a-z]{2})$/i.test(_h)
    || /(^|\\.)youtube\\.com$/i.test(_h)
    || /(^|\\.)gstatic\\.com$/i.test(_h)
    || /(^|\\.)googleusercontent\\.com$/i.test(_h);
  var _isTikTok = /(^|\\.)tiktok\\.com$/i.test(_h)
    || /(^|\\.)tiktokv\\.com$/i.test(_h)
    || /(^|\\.)tiktokcdn\\.com$/i.test(_h)
    || /(^|\\.)byteoversea\\.com$/i.test(_h);
  var _isSnap = /(^|\\.)snapchat\\.com$/i.test(_h)
    || /(^|\\.)snap\\.com$/i.test(_h);
  var _isEdu = /(^|\\.)bedrocklearning\\.(org|com|co\\.uk)$/i.test(_h)
    || /(^|\\.)sparxmaths\\.(com|uk)$/i.test(_h)
    || /(^|\\.)sparx-learning\\.com$/i.test(_h);
  var _isStrictFp = _isGoogleAuth || _isTikTok || _isSnap || _isEdu;

  function def(obj, prop, val) {
    try {
      Object.defineProperty(obj, prop, {
        get: typeof val === 'function' ? val : function(){ return val; },
        configurable: true,
        enumerable: true
      });
    } catch(e) {}
  }

  // ── User-Agent ────────────────────────────────────────────────────────────
  var cleanUA = ${JSON.stringify(defaultUA)};
  try {
    var plat = _nav.platform || '';
    if (plat.indexOf('Mac') !== -1)        cleanUA = ${JSON.stringify(macUA)};
    else if (plat.indexOf('Linux') !== -1) cleanUA = ${JSON.stringify(linUA)};
    else if (plat.indexOf('Win') !== -1)   cleanUA = ${JSON.stringify(winUA)};
  } catch(e) {}

  def(_nav, 'userAgent',  cleanUA);
  def(_nav, 'appVersion', cleanUA.replace(/^Mozilla\\//, ''));
  def(_nav, 'vendor',     'Google Inc.');
  def(_nav, 'platform',   ${JSON.stringify(navPlatform)});
  def(_nav, 'productSub', '20030107');
  def(_nav, 'appName',    'Netscape');
  def(_nav, 'appCodeName','Mozilla');
  def(_nav, 'product',    'Gecko');

  // ── webdriver — the #1 signal embedded-browser detection checks ────────────
  // Must appear as if the property doesn't exist at all (not just === undefined).
  try {
    var proto = Object.getPrototypeOf(_nav);
    if (proto) {
      try { delete proto.webdriver; } catch(e) {}
      try {
        Object.defineProperty(proto, 'webdriver', {
          get: function(){ return false; },
          configurable: true,
          enumerable: true
        });
      } catch(e) {}
    }
  } catch(e) {}
  def(_nav, 'webdriver', false);
  try { if (document.documentElement) document.documentElement.removeAttribute('webdriver'); } catch(e) {}

  // ── Remove Electron traces ────────────────────────────────────────────────
  try { if (_win.process && _win.process.versions && _win.process.versions.electron) delete _win.process; } catch(e) {}
  try { delete _win.electron; } catch(e) {}
  try { delete _win.__electron_webpack_init__; } catch(e) {}
  try { delete _win.require; } catch(e) {}
  try { delete _win.module; } catch(e) {}
  try { delete _win.exports; } catch(e) {}
  try { delete _win.global; } catch(e) {}
  try { delete _win.Buffer; } catch(e) {}

  // ── Remove WebView2 / embedded-browser markers (Microsoft Teams/Outlook checks) ──
  try { delete _win.WebView; } catch(e) {}
  try { delete _win.chrome_webview; } catch(e) {}
  try { delete _win.__msEdge; } catch(e) {}
  try { delete _win.opr; } catch(e) {}
  try { delete _win.brave; } catch(e) {}
  try { delete _win.safari; } catch(e) {}
  // window.external must exist on Chrome (Microsoft sites check this)
  try {
    if (!_win.external || typeof _win.external.AddSearchProvider !== 'function') {
      Object.defineProperty(_win, 'external', {
        value: {
          AddSearchProvider: function(){},
          IsSearchProviderInstalled: function(){ return 0; },
          getHostEnvironmentValue: function(){ return ''; }
        },
        writable: true, configurable: true
      });
    }
  } catch(e) {}

  // navigator.languages — only patch if it is genuinely empty. Electron
  // normally populates it correctly, so this is a no-op in practice. We
  // deliberately DON'T wrap navigator.permissions.query here: the script
  // already has a dedicated, toString-masked permissions override further
  // down, and adding a second un-masked wrapper produced a non-native
  // function that Google's "is this a real browser" check flags — which
  // is what brought back "this browser may not be secure".
  try {
    if (!Array.isArray(_nav.languages) || _nav.languages.length === 0) {
      var _primary = _nav.language || 'en-US';
      var _langList = [_primary];
      var _base = _primary.indexOf('-') > 0 ? _primary.split('-')[0] : '';
      if (_base && _base !== _primary) _langList.push(_base);
      try {
        Object.defineProperty(_nav, 'languages', {
          get: function(){ return _langList; },
          configurable: true,
        });
      } catch(e) {}
    }
  } catch(e) {}

  // ── window.chrome (Google checks for this object) ─────────────────────────
  try {
    var cr = _win.chrome || {};
    if (!cr.runtime) {
      cr.runtime = {
        id: undefined,
        connect: function(){ return { onMessage:{ addListener:function(){}, removeListener:function(){} }, postMessage:function(){}, disconnect:function(){} }; },
        sendMessage: function(){},
        onMessage: { addListener:function(){}, removeListener:function(){}, hasListeners:function(){ return false; } },
        onConnect: { addListener:function(){}, removeListener:function(){} },
        getManifest: function(){ return {}; },
        getURL: function(p){ return 'chrome-extension://invalid/' + p; },
        PlatformOs: { MAC:'mac', WIN:'win', ANDROID:'android', CROS:'cros', LINUX:'linux', OPENBSD:'openbsd' },
        PlatformArch: { ARM:'arm', X86_32:'x86-32', X86_64:'x86-64' }
      };
    }
    if (!cr.loadTimes) cr.loadTimes = function(){ return { commitLoadTime:Date.now()/1000, connectionInfo:'h2', finishDocumentLoadTime:Date.now()/1000, finishLoadTime:Date.now()/1000, firstPaintAfterLoadTime:0, firstPaintTime:Date.now()/1000, navigationType:'Other', npnNegotiatedProtocol:'h2', requestTime:Date.now()/1000-1, startLoadTime:Date.now()/1000-1, wasAlternateProtocolAvailable:false, wasFetchedViaSpdy:true, wasNpnNegotiated:true }; };
    if (!cr.csi) cr.csi = function(){ return { onloadT:Date.now(), pageT:Date.now(), startE:Date.now(), tran:15 }; };
    if (!cr.app) cr.app = { isInstalled:false, getDetails:function(){ return null; }, getIsInstalled:function(){ return false; }, installState:function(cb){ if(cb) cb('not_installed'); }, runningState:function(){ return 'cannot_run'; } };
    try { Object.defineProperty(_win, 'chrome', { value:cr, writable:true, configurable:true, enumerable:true }); } catch(e) {}
  } catch(e) {}

  // ── Plugins (empty plugins list is a red flag) ────────────────────────────
  try {
    if (!_nav.plugins || _nav.plugins.length === 0) {
      var fakePlugins = [
        { name:'PDF Viewer', filename:'internal-pdf-viewer', description:'Portable Document Format' },
        { name:'Chrome PDF Viewer', filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai', description:'Portable Document Format' },
        { name:'Chromium PDF Viewer', filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai', description:'Portable Document Format' },
        { name:'Microsoft Edge PDF Viewer', filename:'mhjfbmdgcfjbbpaeojofohoefgiehjai', description:'Portable Document Format' },
        { name:'WebKit built-in PDF', filename:'internal-pdf-viewer', description:'Portable Document Format' }
      ];
      try {
        var pArr = Object.create(PluginArray.prototype);
        fakePlugins.forEach(function(p, i){ pArr[i] = p; });
        Object.defineProperty(pArr, 'length', { value:fakePlugins.length, configurable:true });
        pArr.item = function(i){ return fakePlugins[i] || null; };
        pArr.namedItem = function(n){ return fakePlugins.find(function(p){ return p.name===n; }) || null; };
        pArr.refresh = function(){};
        def(_nav, 'plugins', pArr);
      } catch(e) {
        // Fallback: plain array-like
        var arr = fakePlugins.slice();
        arr.item = function(i){ return arr[i] || null; };
        arr.namedItem = function(n){ return arr.find(function(p){ return p.name===n; }) || null; };
        arr.refresh = function(){};
        def(_nav, 'plugins', arr);
      }
    }
  } catch(e) {}

  // ── userAgentData / Client Hints ──────────────────────────────────────────
  try {
    var brands = [
      { brand:'Not_A Brand',   version:'24' },
      { brand:'Chromium',      version:${JSON.stringify(chromeMajor)} },
      { brand:'Google Chrome', version:${JSON.stringify(chromeMajor)} }
    ];
    var fullVersionList = [
      { brand:'Not_A Brand',   version:'24.0.0.0' },
      { brand:'Chromium',      version:${JSON.stringify(chromeFull)} },
      { brand:'Google Chrome', version:${JSON.stringify(chromeFull)} }
    ];
    var uaPlat = ${JSON.stringify(uaPlatform)};
    var platVer = ${JSON.stringify(platformVersion)};
    var uaFullVer = ${JSON.stringify(chromeFull)};
    var uaData = {
      brands: brands,
      mobile: false,
      platform: uaPlat,
      getHighEntropyValues: function(hints) {
        var result = {
          brands: brands,
          mobile: false,
          platform: uaPlat,
          platformVersion: platVer,
          architecture: 'x86',
          bitness: '64',
          model: '',
          uaFullVersion: uaFullVer,
          fullVersionList: fullVersionList,
          wow64: false,
          formFactors: ['Desktop']
        };
        return Promise.resolve(result);
      },
      toJSON: function(){ return { brands:brands, mobile:false, platform:uaPlat }; }
    };
    def(_nav, 'userAgentData', uaData);
  } catch(e) {}

  // NOTE: We deliberately do NOT override PublicKeyCredential / navigator.credentials.
  // The permission handler in main.js denies publickey-credentials-{get,create}
  // at request time, which is enough to stop the Windows Hello / passkey UI from
  // appearing. Pretending the APIs don't exist breaks federated sign-in flows
  // (Google's "verify your account" loop, gsi/transform hanging, etc.) because
  // sites use feature detection to choose between password and WebAuthn flows.

  // ── Misc navigator properties ─────────────────────────────────────────────
  // navigator.language(s) are intentionally NOT overridden here — they reflect
  // the session's accept-languages (pinned to the device locale in main), so a
  // VPN exit-node region never changes the reported language.
  try { def(_nav, 'hardwareConcurrency', 8); } catch(e) {}
  try { def(_nav, 'deviceMemory',        8); } catch(e) {}
  try { def(_nav, 'maxTouchPoints',      0); } catch(e) {}
  try { def(_nav, 'cookieEnabled',    true); } catch(e) {}
  try { def(_nav, 'onLine',           true); } catch(e) {}
  try { def(_nav, 'doNotTrack',       null); } catch(e) {}
  try { def(_nav, 'pdfViewerEnabled', true); } catch(e) {}

  // ── Screen properties (TikTok checks these) ───────────────────────────────
  try {
    var _screen = window.screen;
    if (_screen) {
      // Make sure screen dimensions are realistic
      def(_screen, 'availWidth',  _screen.width || 1920);
      def(_screen, 'availHeight', _screen.height || 1080);
      def(_screen, 'colorDepth',  24);
      def(_screen, 'pixelDepth',  24);
    }
  } catch(e) {}

  // ── Permissions API ───────────────────────────────────────────────────────
  // Skipped on strict-fingerprint hosts (TikTok, Google auth, Snapchat, edu):
  // swapping permissions.query for a non-native function is itself a tamper
  // signal their bot checks flag. Let the real, native API run there.
  if (_isStrictFp) {} else
  try {
    if (_nav.permissions && _nav.permissions.query) {
      var _origQuery = _nav.permissions.query.bind(_nav.permissions);
      _nav.permissions.query = function(desc) {
        if (desc && (desc.name === 'notifications' || desc.name === 'push'))
          return Promise.resolve({ state:'prompt', onchange:null });
        return _origQuery(desc);
      };
      // Hide the override
      try {
        Object.defineProperty(_nav.permissions.query, 'toString', {
          value: function() { return 'function query() { [native code] }'; },
          writable: false,
          configurable: false
        });
      } catch(e) {}
    }
  } catch(e) {}

  // ── Battery API ───────────────────────────────────────────────────────────
  // Real getBattery values are plausible on desktop; a non-native wrapper is a
  // tamper tell on strict hosts, so only patch it elsewhere.
  if (_isStrictFp) {} else
  try {
    if (_nav.getBattery) {
      var _origGetBattery = _nav.getBattery.bind(_nav);
      _nav.getBattery = function() {
        return _origGetBattery().catch(function() {
          return Promise.resolve({
            charging: true,
            chargingTime: 0,
            dischargingTime: Infinity,
            level: 1.0,
            addEventListener: function() {},
            removeEventListener: function() {},
            dispatchEvent: function() { return true; }
          });
        });
      };
    }
  } catch(e) {}

  // ── Connection API ────────────────────────────────────────────────────────
  // Same reasoning: let the real navigator.connection through on strict hosts.
  if (_isStrictFp) {} else
  try {
    if (_nav.connection || _nav.mozConnection || _nav.webkitConnection) {
      var conn = _nav.connection || _nav.mozConnection || _nav.webkitConnection || {};
      def(_nav, 'connection', {
        effectiveType: '4g',
        downlink: 10,
        rtt: 50,
        saveData: false,
        addEventListener: function() {},
        removeEventListener: function() {},
        dispatchEvent: function() { return true; }
      });
    }
  } catch(e) {}

  // ── Remove CDP / Selenium / automation artifacts ──────────────────────────
  try {
    ['cdc_adoQpoasnfa76pfcZLmcfl_Array','cdc_adoQpoasnfa76pfcZLmcfl_Promise',
     'cdc_adoQpoasnfa76pfcZLmcfl_Symbol','$cdc_asdjflasutopfhvcZLmcfl_',
     '$chrome_asyncScriptInfo','__webdriver_script_fn','__driver_evaluate',
     '__webdriver_evaluate','__selenium_evaluate','__fxdriver_evaluate',
     '__driver_unwrapped','__webdriver_unwrapped','__selenium_unwrapped',
     '__fxdriver_unwrapped','__webdriverFunc','__webdriver_script_func',
     '_Selenium_IDE_Recorder','_selenium','calledSelenium','_WEBDRIVER_ELEM_CACHE',
     'domAutomation','domAutomationController','__nightmare','__puppeteer_evaluation_script__',
     '__playwright_evaluation_script__','__webdriver_script_function'
    ].forEach(function(k){ try { delete _win[k]; } catch(e) {} });
  } catch(e) {}

  // ── Remove automation detection from document ─────────────────────────────
  try {
    if (document.documentElement) {
      document.documentElement.removeAttribute('webdriver');
      document.documentElement.removeAttribute('selenium');
      document.documentElement.removeAttribute('driver');
    }
  } catch(e) {}

  // ── Override toString to hide function modifications ──────────────────────
  // CRITICAL: this replaces the global Function.prototype.toString with a
  // non-native function — and calling toString on toString itself then reveals
  // the tampering, which is exactly what TikTok's anti-bot checks for (the cause
  // of "maximum number of attempts reached"). We only install it on non-strict
  // hosts, and ONLY to mask the permissions/battery wrappers that also only
  // exist there — so strict hosts keep a pristine, native prototype.
  if (_isStrictFp) {} else
  try {
    var origToString = Function.prototype.toString;
    var origCall = Function.prototype.call;
    Function.prototype.toString = function() {
      if (this === _nav.permissions.query) {
        return 'function query() { [native code] }';
      }
      if (this === _nav.getBattery) {
        return 'function getBattery() { [native code] }';
      }
      return origCall.call(origToString, this);
    };
  } catch(e) {}

  // ── Mouse and touch events (TikTok checks for human-like behavior) ────────
  // NOTE: a window.getComputedStyle passthrough wrapper used to live here. It
  // did nothing but turn a native function into a non-native one — a free
  // bot-detection signal (its .toString() is no longer native code) — so it was
  // removed. Don't re-add no-op wrappers around native APIs.

  // ── Timing APIs ──────────────────────────────────────────────────────────
  // A constant offset on performance.now() is itself a fingerprint-tampering
  // tell, so skip it on strict hosts (TikTok et al. flag inconsistent timing).
  if (_isStrictFp) {} else
  try {
    var _origNow = Performance.prototype.now;
    var _timeOffset = Math.random() * 0.1;
    Performance.prototype.now = function() {
      return _origNow.call(this) + _timeOffset;
    };
  } catch(e) {}

  // ── Canvas fingerprint noise ─────────────────────────────────────────────
  // Adds ±1 noise to pixel values on readback so every canvas fingerprint
  // is unique per session while remaining visually identical. Skipped on
  // strict-fingerprint hosts (see _isStrictFp at the top) so their bot/integrity
  // checks see a real, consistent canvas.
  if (_isStrictFp) {} else
  try {
    // Seed is fixed for the page's lifetime and reset before every readback so
    // the SAME canvas always hashes the same way within a session. (Advancing
    // the seed across calls produced a different hash each time — an unstable
    // fingerprint that bot detectors flag.)
    var _cBase = (Math.random() * 0xFFFFFFFF) >>> 0;
    var _cSeed = _cBase;
    function _cRand() {
      _cSeed ^= _cSeed << 13; _cSeed ^= _cSeed >> 17; _cSeed ^= _cSeed << 5;
      return (_cSeed >>> 0) / 0x100000000;
    }
    function _noiseData(d) {
      _cSeed = _cBase;
      for (var i = 0; i < d.length; i += 4) {
        var r = _cRand(); var n = r < 0.15 ? -1 : r > 0.85 ? 1 : 0;
        d[i]   = Math.max(0, Math.min(255, d[i]   + n));
        d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
        d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
      }
    }
    var _origGID = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function() {
      var id = _origGID.apply(this, arguments);
      _noiseData(id.data); return id;
    };
    var _origTDU = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
      var ctx = this.getContext && this.getContext('2d');
      if (ctx) {
        var id = _origGID.call(ctx, 0, 0, this.width, this.height);
        _noiseData(id.data); ctx.putImageData(id, 0, 0);
      }
      return _origTDU.apply(this, arguments);
    };
    var _origTB = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function(cb) {
      var ctx = this.getContext && this.getContext('2d');
      if (ctx) {
        var id = _origGID.call(ctx, 0, 0, this.width, this.height);
        _noiseData(id.data); ctx.putImageData(id, 0, 0);
      }
      return _origTB.apply(this, arguments);
    };
  } catch(e) {}

  // ── WebGL fingerprint normalization ──────────────────────────────────────
  // Report generic vendor/renderer strings instead of the real GPU identity.
  // Skipped on strict hosts: a generic renderer that doesn't match the rest of
  // the environment is a detection signal there (let the real GPU show).
  if (_isStrictFp) {} else
  try {
    var _UNMASKED_VENDOR   = 0x9245;
    var _UNMASKED_RENDERER = 0x9246;
    var _patchWebGL = function(proto) {
      var _orig = proto.getParameter;
      proto.getParameter = function(p) {
        if (p === _UNMASKED_VENDOR)   return 'Google Inc. (Intel)';
        if (p === _UNMASKED_RENDERER) return 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return _orig.call(this, p);
      };
    };
    if (window.WebGLRenderingContext)  _patchWebGL(WebGLRenderingContext.prototype);
    if (window.WebGL2RenderingContext) _patchWebGL(WebGL2RenderingContext.prototype);
  } catch(e) {}

  // ── Platform passkey suppression ─────────────────────────────────────────
  // Block requests that would trigger the OS-native credential picker
  // (Windows Hello, Touch ID, etc.) while leaving generic WebAuthn alone so
  // OAuth token-transport flows that ride on it keep working.
  //
  // Three flavours of request get rejected:
  //   1. publicKey.authenticatorSelection.authenticatorAttachment === 'platform'
  //   2. mediation === 'conditional' (autofill-passkey UI)
  //   3. isUserVerifyingPlatformAuthenticatorAvailable() — return false so
  //      sites stop offering "Sign in with passkey" buttons in the first place
  // Skip the WebAuthn override entirely on Google sign-in hosts. Google's
  // "verify it's you" flow chains passkey + recovery prompts and our
  // synthetic NotAllowedError makes the flow retry in a tight loop, which
  // user-side looks like the Cancel button being spammed.
  try {
    if (!_isGoogleAuth && window.PublicKeyCredential) {
      try {
        Object.defineProperty(PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', {
          value: function() { return Promise.resolve(false); }, configurable: true,
        });
      } catch(e) {}
      try {
        Object.defineProperty(PublicKeyCredential, 'isConditionalMediationAvailable', {
          value: function() { return Promise.resolve(false); }, configurable: true,
        });
      } catch(e) {}
    }
    if (!_isGoogleAuth && navigator.credentials) {
      var _origCreate = navigator.credentials.create.bind(navigator.credentials);
      var _origGet    = navigator.credentials.get.bind(navigator.credentials);
      var wantsPlatform = function(opts) {
        if (!opts || !opts.publicKey) return false;
        var pk = opts.publicKey;
        var sel = pk.authenticatorSelection || {};
        if (sel.authenticatorAttachment === 'platform') return true;
        return false;
      };
      navigator.credentials.create = function(opts) {
        if (wantsPlatform(opts)) {
          // Same shape sites see when the user cancels the OS picker.
          return Promise.reject(new DOMException('Platform authenticator disabled', 'NotAllowedError'));
        }
        return _origCreate(opts);
      };
      navigator.credentials.get = function(opts) {
        if (opts && opts.mediation === 'conditional') {
          return Promise.reject(new DOMException('Conditional UI disabled', 'NotAllowedError'));
        }
        // For .get() we can't always tell up-front whether the request will
        // hit a platform authenticator (allowCredentials may be empty), but
        // since the platform authenticator flag above returns false, the
        // browser won't surface platform creds. Pass through to the real
        // implementation so security keys and cross-origin transports still
        // work.
        return _origGet(opts);
      };
    }
  } catch(e) {}

})();`;
}

module.exports = { buildGoogleSpoofScript };
