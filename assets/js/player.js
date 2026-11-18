/* หน้าผู้เล่น */
(function () {
  'use strict';
  var B = Bingo, store = B.store, esc = B.esc;
  var KEY = 'cb.player.v1', HIST = 'cb.player.history';
  var theme = null, chars = {}, state = null;

  var $ = function (id) { return document.getElementById(id); };
  function show(id) { ['loading', 'error', 'join', 'play'].forEach(function (s) { $(s).classList.toggle('hidden', s !== id); }); }
  function fail(msg) { $('errorMsg').textContent = msg; show('error'); }

  B.registerSW();
  UI.watchNet($('net'));

  function getTheme(idx, id) {
    if (idx) return B.loadTheme(idx, id).catch(function (e) {
      var c = store.get('cb.theme.' + id, null); if (c) return c; throw e;
    });
    var c = store.get('cb.theme.' + id, null);
    return c ? Promise.resolve(c) : Promise.reject(new Error('ไม่มีอินเทอร์เน็ต และยังไม่เคยโหลดชุดภาพนี้'));
  }

  function useTheme(t) {
    theme = t; chars = B.charMap(t);
    $('themeName').textContent = t.name;
  }

  function start() {
    var saved = store.get(KEY, null);
    var urlT = UI.qs('t');
    B.loadThemeIndex().catch(function () { return null; }).then(function (idx) {
      var target = urlT || (saved && saved.themeId) || (idx && idx.default);
      if (!target) throw new Error('ยังไม่มีชุดภาพในระบบ');
      if (saved && saved.themeId !== target) {
        // มีบัตรเดิมจากชุดอื่น
        return getTheme(idx, target).then(function (t) {
          return UI.modal({
            title: 'คุณมีบัตรเดิมอยู่แล้ว', dismissable: false,
            html: '<p>บัตรเดิม <b class="mono">' + esc(saved.code) + '</b> เป็นชุด “' + esc(saved.themeName) + '”</p><p>ลิงก์นี้เป็นเกมชุด “' + esc(t.name) + '”</p>',
            buttons: [{ label: 'ใช้บัตรเดิม', value: 'old', cls: 'ghost' }, { label: 'รับบัตรใหม่ชุดนี้', value: 'new' }]
          }).then(function (choice) {
            if (choice === 'new') { archive(saved); store.del(KEY); useTheme(t); askName(saved.name); return; }
            return getTheme(idx, saved.themeId).then(function (old) { useTheme(old); state = saved; render(); });
          });
        });
      }
      return getTheme(idx, target).then(function (t) {
        useTheme(t);
        if (saved) { state = saved; render(); } else askName('');
      });
    }).catch(function (e) {
      // กรณีสุดท้าย: มีบัตรเดิม + ชุดภาพในเครื่อง
      if (saved) {
        var c = store.get('cb.theme.' + saved.themeId, null);
        if (c) { useTheme(c); state = saved; render(); return; }
      }
      fail(e && e.message ? e.message : String(e));
    });
  }

  function archive(s) {
    if (!s) return;
    var h = store.get(HIST, []);
    h.unshift({ code: s.code, name: s.name, themeId: s.themeId, createdAt: s.createdAt, archivedAt: new Date().toISOString() });
    store.set(HIST, h.slice(0, 20));
  }

  function askName(prefill) {
    show('join');
    $('nameInput').value = prefill || '';
  }

  $('joinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameInput').value.trim().slice(0, 24);
    if (!name) { $('nameInput').focus(); return; }
    newCard(name);
  });

  function newCard(name) {
    var num = B.randomPhoneCardNumber();
    state = {
      v: 1, name: name, themeId: theme.id, themeName: theme.name, fp: B.fingerprint(theme),
      num: num, code: B.formatCode(num), cells: B.generateCard(theme, num), marks: [],
      createdAt: new Date().toISOString()
    };
    save();
    render();
    UI.toast('ได้รับบัตรหมายเลข ' + state.code);
  }

  function save() {
    if (!store.set(KEY, state)) UI.toast('บันทึกในเครื่องไม่สำเร็จ — โปรดอย่าปิดหน้านี้ แจ้งเจ้าหน้าที่');
  }

  var lastBingoCount = 0;
  function render() {
    show('play');
    $('pName').textContent = state.name;
    $('pCode').textContent = state.code;
    $('cardMeta').textContent = 'ชุด: ' + state.themeName + ' · รหัสชุด ' + state.fp + ' · สร้างเมื่อ ' + new Date(state.createdAt).toLocaleString('th-TH');
    var grid = $('grid');
    var marks = {}; state.marks.forEach(function (i) { marks[i] = true; });
    var lines = B.linesFromMarks(state.marks);
    var win = {}; lines.forEach(function (l) { l.cells.forEach(function (i) { win[i] = true; }); });
    if (!grid.children.length) {
      state.cells.forEach(function (id, i) {
        var c = chars[id];
        var d = document.createElement('div');
        d.className = 'cell'; d.dataset.i = i; d.setAttribute('role', 'gridcell');
        d.innerHTML = (c ? '<img alt="" src="' + esc(c.img) + '">' : '<div style="font-size:2rem">?</div>') +
          '<div class="nm">' + esc(c ? c.name : 'ไม่พบภาพ') + '</div>';
        grid.appendChild(d);
      });
    }
    Array.prototype.forEach.call(grid.children, function (d, i) {
      d.classList.toggle('marked', !!marks[i]);
      d.classList.toggle('win', !!win[i]);
      d.setAttribute('aria-pressed', marks[i] ? 'true' : 'false');
    });
    var flag = $('bingoFlag');
    if (lines.length) {
      flag.classList.remove('hidden');
      var full = state.marks.length >= B.CELLS;
      flag.firstChild.nodeValue = full ? 'เต็มบัตร!' : 'BINGO!';
      $('bingoLines').innerHTML = (full ? 'ครบทั้ง 16 ช่อง' : 'ครบ ' + lines.length + ' แนว') + ' — ' + esc(lines.map(function (l) { return l.name; }).join(' · ')) +
        '<br>ยกมือ แล้วแสดงหน้าจอนี้และเลขบัตร <span class="mono">' + esc(state.code) + '</span> ให้เจ้าหน้าที่ตรวจ';
      if (lines.length > lastBingoCount && navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) { /* */ } }
    } else flag.classList.add('hidden');
    lastBingoCount = lines.length;
  }

  // แตะช่อง — ใช้ event เดียว (click) กันการนับซ้ำจาก touch + click
  $('grid').addEventListener('click', function (e) {
    var cell = e.target.closest('.cell'); if (!cell || !state) return;
    var i = +cell.dataset.i;
    var k = state.marks.indexOf(i);
    if (k >= 0) state.marks.splice(k, 1); else state.marks.push(i);
    save(); render();
  });

  $('btnClear').addEventListener('click', function () {
    UI.confirm('ล้างเครื่องหมายทั้งหมด?', '<p>ใช้เมื่อเริ่มรอบใหม่ด้วยบัตรใบเดิม</p>', 'ล้างเครื่องหมาย', 'danger').then(function (ok) {
      if (!ok) return; state.marks = []; save(); render(); UI.toast('ล้างเครื่องหมายแล้ว');
    });
  });

  $('btnNew').addEventListener('click', function () {
    UI.modal({
      title: 'ขอบัตรใบใหม่?',
      html: '<p>บัตรเดิม <b class="mono">' + esc(state.code) + '</b> จะถูกยกเลิก ใช้เมื่อพิธีกรประกาศเริ่มรอบใหม่เท่านั้น</p>' +
        '<label class="field"><span>พิมพ์คำว่า <b>ใหม่</b> เพื่อยืนยัน</span><input class="input" id="confirmNew" autocomplete="off"></label>',
      buttons: [{ label: 'ยกเลิก', value: false, cls: 'ghost' }, {
        label: 'รับบัตรใหม่', cls: 'danger', getValue: function (el) {
          var v = el.querySelector('#confirmNew').value.trim();
          if (v !== 'ใหม่') { el.querySelector('#confirmNew').focus(); UI.toast('พิมพ์คำว่า "ใหม่" ก่อน'); return undefined; }
          return true;
        }
      }],
      onOpen: function (el) { setTimeout(function () { el.querySelector('#confirmNew').focus(); }, 50); }
    }).then(function (ok) {
      if (!ok) return;
      var name = state.name; archive(state); store.del(KEY);
      $('grid').innerHTML = ''; newCard(name);
    });
  });

  // กันหน้าจอดับระหว่างเล่น (ถ้าเบราว์เซอร์รองรับ)
  var wakeLock = null;
  function keepAwake() {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () { /* */ });
    }
  }
  document.addEventListener('visibilitychange', keepAwake);
  keepAwake();

  // ซิงก์ระหว่างแท็บ (เปิดหลายแท็บในเครื่องเดียว)
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && e.newValue) { try { state = JSON.parse(e.newValue); $('grid').innerHTML = ''; render(); } catch (err) { /* */ } }
  });

  start();
})();
