'use strict';

/** Injected into guest pages — communicates via sendToHost (privoo-password-*). */
function buildPasswordAutofillScript() {
  return `(function(){
  if (window.__privoo_pw__) return;
  window.__privoo_pw__ = true;
  var HOST = function(ch, data) {
    try {
      if (window.privooPassword && window.privooPassword.send) {
        window.privooPassword.send(ch, data || {});
        return;
      }
    } catch(e) {}
  };
  function origin() {
    try { return location.origin; } catch(e) { return ''; }
  }
  function isVisible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function findLoginFields() {
    var pass = document.querySelector('input[type="password"]:not([disabled])');
    if (!pass || !isVisible(pass)) return null;
    var form = pass.form || pass.closest('form');
    var user = null;
    var inputs = form ? form.querySelectorAll('input') : document.querySelectorAll('input');
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (inp === pass || !isVisible(inp)) continue;
      var t = (inp.type || 'text').toLowerCase();
      if (t === 'password' || t === 'hidden' || t === 'submit' || t === 'button') continue;
      if (t === 'email' || t === 'text' || t === 'tel' || t === '') {
        var ac = (inp.autocomplete || '').toLowerCase();
        var nm = (inp.name || '').toLowerCase();
        var id = (inp.id || '').toLowerCase();
        if (/user|email|login|account|identifier/.test(ac + nm + id) || !user) user = inp;
      }
    }
    return { user: user, pass: pass, form: form };
  }
  function fillEntry(entry) {
    var f = findLoginFields();
    if (!f || !entry) return;
    if (f.user && entry.username) {
      f.user.focus();
      f.user.value = entry.username;
      f.user.dispatchEvent(new Event('input', { bubbles: true }));
      f.user.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (entry.password) {
      f.pass.focus();
      f.pass.value = entry.password;
      f.pass.dispatchEvent(new Event('input', { bubbles: true }));
      f.pass.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  HOST('password-request-fill', { origin: origin(), url: location.href });
  document.addEventListener('submit', function(ev) {
    var f = findLoginFields();
    if (!f) return;
    var username = f.user ? f.user.value : '';
    var password = f.pass ? f.pass.value : '';
    if (!password) return;
    setTimeout(function() {
      HOST('password-offer-save', { origin: origin(), url: location.href, username: username, password: password });
    }, 300);
  }, true);
  window.addEventListener('message', function(ev) {
    if (!ev.data || ev.data.__privoo_pw_fill !== true) return;
    fillEntry(ev.data.entry);
  });
})();`;
}

/** Prefer password over passkey on Google sign-in UIs. */
function buildGooglePasswordPreferScript() {
  return `(function(){
  if (window.__privoo_gp__) return;
  window.__privoo_gp__ = true;
  
  // Disable all WebAuthn/Passkey APIs immediately
  try {
    if (window.PublicKeyCredential) {
      Object.defineProperty(window, 'PublicKeyCredential', { value: undefined, configurable: true, writable: true });
    }
    if (navigator.credentials) {
      var fakeCreds = {
        get: function() { return Promise.reject(new DOMException('Operation not supported', 'NotSupportedError')); },
        create: function() { return Promise.reject(new DOMException('Operation not supported', 'NotSupportedError')); },
        store: function() { return Promise.resolve(); },
        preventSilentAccess: function() { return Promise.resolve(); }
      };
      Object.defineProperty(navigator, 'credentials', { value: fakeCreds, configurable: true, writable: true });
    }
    if (window.PasswordCredential) {
      Object.defineProperty(window, 'PasswordCredential', { value: undefined, configurable: true, writable: true });
    }
    if (window.FederatedCredential) {
      Object.defineProperty(window, 'FederatedCredential', { value: undefined, configurable: true, writable: true });
    }
  } catch(e) {}
  
  var labels = /try another way|use password|enter your password|use your password|password instead|email or phone|skip|not now|cancel|use another method/i;
  function clickPasswordPath() {
    var nodes = document.querySelectorAll('button, a, div[role="button"], span[role="link"], [role="button"]');
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].textContent || '').trim();
      if (labels.test(t) && t.length < 80) {
        try { 
          nodes[i].click(); 
          console.log('Privoo: Clicked password option:', t);
          return true; 
        } catch(e) {}
      }
    }
    return false;
  }
  
  // Hide passkey prompts
  function hidePasskeyPrompts() {
    var selectors = [
      '[data-challengetype="12"]',
      '[data-challengetype="13"]', 
      '[jsname*="passkey"]',
      '[jsname*="Passkey"]',
      'div[role="dialog"]',
      'div[aria-modal="true"]'
    ];
    selectors.forEach(function(sel) {
      try {
        var els = document.querySelectorAll(sel);
        for (var i = 0; i < els.length; i++) {
          var txt = (els[i].textContent || '').toLowerCase();
          if (txt.includes('passkey') || txt.includes('security key') || txt.includes('windows hello')) {
            els[i].style.display = 'none';
            console.log('Privoo: Hidden passkey prompt');
          }
        }
      } catch(e) {}
    });
  }
  
  // Immediate execution
  clickPasswordPath();
  hidePasskeyPrompts();
  
  // Continuous monitoring
  var n = 0;
  var iv = setInterval(function() {
    clickPasswordPath();
    hidePasskeyPrompts();
    if (++n > 20) clearInterval(iv);
  }, 500);
  
  // Monitor DOM changes
  try {
    var observer = new MutationObserver(function() {
      clickPasswordPath();
      hidePasskeyPrompts();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(function() { observer.disconnect(); }, 15000);
  } catch(e) {}
})();`;
}

module.exports = { buildPasswordAutofillScript, buildGooglePasswordPreferScript };
