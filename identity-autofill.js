'use strict';

/** Injected into guest pages — communicates via sendToHost (privoo-password-* bridge,
 *  reused here since it's a plain channel/data proxy). */
function buildIdentityAutofillScript() {
  return `(function(){
  if (window.__privoo_id__) return;
  window.__privoo_id__ = true;
  var HOST = function(ch, data) {
    try {
      if (window.privooPassword && window.privooPassword.send) {
        window.privooPassword.send(ch, data || {});
        return;
      }
    } catch(e) {}
  };
  function isVisible(el) {
    if (!el || el.disabled || el.readOnly) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function labelFor(el) {
    if (el.id) {
      var lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) return lab.textContent.trim().slice(0, 60);
    }
    var p = el.closest('label');
    if (p) return p.textContent.trim().slice(0, 60);
    return '';
  }
  var fieldEls = [];
  function findFields() {
    fieldEls = [];
    var inputs = document.querySelectorAll('input, textarea, select');
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      var t = (el.type || 'text').toLowerCase();
      if (['password', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'file', 'image', 'reset'].indexOf(t) !== -1) continue;
      if (!isVisible(el)) continue;
      fieldEls.push(el);
    }
    return fieldEls.map(function(el, idx) {
      return {
        index: idx,
        type: (el.type || 'text').toLowerCase(),
        name: el.name || '',
        id: el.id || '',
        placeholder: el.placeholder || '',
        autocomplete: el.autocomplete || '',
        label: labelFor(el),
      };
    });
  }
  function fillByIndex(map) {
    if (!map) return;
    for (var idxStr in map) {
      var el = fieldEls[+idxStr];
      var val = map[idxStr];
      if (!el || val == null || val === '') continue;
      el.focus();
      if (el.tagName === 'SELECT') {
        var opt = Array.prototype.find.call(el.options, function(o) {
          return o.value === val || o.textContent.trim().toLowerCase() === String(val).toLowerCase();
        });
        if (opt) el.value = opt.value; else continue;
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    var lastEl = fieldEls[fieldEls.length - 1];
    if (lastEl) lastEl.blur();
  }
  window.addEventListener('message', function(ev) {
    if (!ev.data) return;
    if (ev.data.__privoo_id_request === true) {
      var fields = findFields();
      if (fields.length) HOST('identity-request-fill', { fields: fields });
      return;
    }
    if (ev.data.__privoo_id_fill === true) {
      fillByIndex(ev.data.map);
    }
  });
})();`;
}

module.exports = { buildIdentityAutofillScript };
