/* ชุดภาพฉบับร่างในเครื่อง (IndexedDB) + ตัวรวมรายการชุดภาพ (เผยแพร่แล้ว + ในเครื่อง) */
(function () {
  'use strict';
  var DB = 'cb-admin', STORE = 'themes';

  function open() {
    return new Promise(function (res, rej) {
      if (!('indexedDB' in window)) return rej(new Error('เบราว์เซอร์นี้ไม่รองรับ IndexedDB'));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), s = t.objectStore(STORE), out;
        var req = fn(s);
        if (req) req.onsuccess = function () { out = req.result; };
        t.oncomplete = function () { db.close(); res(out); };
        t.onerror = function () { db.close(); rej(t.error); };
        t.onabort = function () { db.close(); rej(t.error || new Error('บันทึกไม่สำเร็จ (พื้นที่อาจเต็ม)')); };
      });
    });
  }
  var Local = {
    list: function () { return tx('readonly', function (s) { return s.getAll(); }).then(function (a) { return a || []; }); },
    get: function (id) { return tx('readonly', function (s) { return s.get(id); }); },
    put: function (theme) { return tx('readwrite', function (s) { return s.put(theme); }); },
    del: function (id) { return tx('readwrite', function (s) { return s.delete(id); }); }
  };

  /** รวมรายการ: [{id,name,source:'published'|'local', file?}] */
  function allThemes() {
    var pub = Bingo.loadThemeIndex().catch(function () { return { themes: [] }; });
    var loc = Local.list().catch(function () { return []; });
    return Promise.all([pub, loc]).then(function (r) {
      var out = (r[0].themes || []).map(function (t) { return { id: t.id, name: t.name, category: t.category, file: t.file, source: 'published' }; });
      r[1].forEach(function (t) { out.push({ id: t.id, name: t.name, category: t.category, source: 'local' }); });
      return { index: r[0], list: out, defaultId: r[0].default };
    });
  }
  function loadAny(entry, index) {
    if (entry.source === 'local') return Local.get(entry.id);
    return Bingo.loadTheme(index, entry.id);
  }
  window.LocalThemes = Local;
  window.ThemeSource = { all: allThemes, load: loadAny };
})();
