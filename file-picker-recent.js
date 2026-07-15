'use strict';

/** Injected into guest pages — communicates via sendToHost (privooPassword bridge,
 *  a plain channel/data proxy reused across autofill features). Lets a click on
 *  <input type="file"> show Privoo's own "recent files" quick-access popover
 *  (the same idea as Opera's Easy Files) before falling back to the native
 *  OS picker. */
function buildFilePickerScript() {
  return `(function(){
  if (window.__privoo_fp__) return;
  window.__privoo_fp__ = true;
  var HOST = function(ch, data) {
    try {
      if (window.privooPassword && window.privooPassword.send) {
        window.privooPassword.send(ch, data || {});
        return;
      }
    } catch(e) {}
  };
  var targetInput = null;
  var allowNativeOnce = false;

  document.addEventListener('click', function(ev) {
    var el = ev.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'file' || el.disabled) return;
    if (allowNativeOnce) { allowNativeOnce = false; return; }
    ev.preventDefault();
    ev.stopPropagation();
    targetInput = el;
    HOST('file-picker-request', { multiple: !!el.multiple, accept: el.accept || '' });
  }, true);

  function openNative() {
    if (!targetInput) return;
    allowNativeOnce = true;
    targetInput.click();
  }

  function fillFile(payload) {
    if (!targetInput || !payload) return;
    try {
      var bytes = atob(payload.base64);
      var arr = new Uint8Array(bytes.length);
      for (var i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      var file = new File([arr], payload.name, { type: payload.mime || '' });
      var dt = new DataTransfer();
      dt.items.add(file);
      targetInput.files = dt.files;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    } catch(e) {}
  }

  window.addEventListener('message', function(ev) {
    if (!ev.data) return;
    if (ev.data.__privoo_fp_open_native === true) { openNative(); return; }
    if (ev.data.__privoo_fp_fill === true) { fillFile(ev.data.file); return; }
  });
})();`;
}

module.exports = { buildFilePickerScript };
