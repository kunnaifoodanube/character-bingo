/* UI helpers: modal, toast, สถานะเน็ต */
(function () {
  'use strict';
  var esc = Bingo.esc;

  /** opts: {title, html, buttons:[{label, value, cls}], onOpen(el)} → Promise<value> */
  function modal(opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById('modalRoot') || document.body;
      var back = document.createElement('div');
      back.className = 'modal-back';
      back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h2>' + esc(opts.title || '') + '</h2>' +
        '<div class="mb">' + (opts.html || '') + '</div><div class="actions"></div></div>';
      var actions = back.querySelector('.actions');
      (opts.buttons || [{ label: 'ตกลง', value: true }]).forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ' + (b.cls || '');
        btn.textContent = b.label;
        btn.dataset.value = String(b.value);
        btn.addEventListener('click', function () {
          var v = b.value;
          if (typeof b.getValue === 'function') { v = b.getValue(back); if (v === undefined) return; }
          close(v);
        });
        actions.appendChild(btn);
      });
      function close(v) { if (back.parentNode) back.parentNode.removeChild(back); document.removeEventListener('keydown', onKey); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') close(null); }
      back.addEventListener('click', function (e) { if (e.target === back && opts.dismissable !== false) close(null); });
      document.addEventListener('keydown', onKey);
      root.appendChild(back);
      if (opts.onOpen) opts.onOpen(back);
    });
  }

  function confirmBox(title, html, okLabel, okCls) {
    return modal({ title: title, html: html, buttons: [
      { label: 'ยกเลิก', value: false, cls: 'ghost' },
      { label: okLabel || 'ยืนยัน', value: true, cls: okCls || '' }
    ] });
  }

  var toastTimer;
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 2200);
  }

  function watchNet(el) {
    if (!el) return;
    function upd() {
      var on = navigator.onLine;
      el.textContent = on ? '● ออนไลน์' : '● ออฟไลน์ (เล่นต่อได้)';
      el.classList.toggle('off', !on);
    }
    window.addEventListener('online', upd); window.addEventListener('offline', upd); upd();
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function qs(name) { return new URLSearchParams(location.search).get(name); }

  window.UI = { modal: modal, confirm: confirmBox, toast: toast, watchNet: watchNet, download: download, qs: qs };
})();
