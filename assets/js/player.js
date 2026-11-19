/* หน้าผู้เล่น */
(function () {
  'use strict';
  var B = Bingo, store = B.store, esc = B.esc;
  var KEY = 'cb.player.v1', HIST = 'cb.player.history', SKEY = 'cb.player.sync';
  var theme = null, chars = {}, state = null;
  // ข้อมูลซิงก์ล่าสุด {source:'live'|'qr', fp, roundId, roundNo, pattern, draws:[ids], at}
  var SY = store.get(SKEY, null), liveStatus = 'off', unsubscribe = null, hostMissing = false;

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

  var urlRoom = UI.qs('room');
  function play(s) {
    state = s;
    if (urlRoom && state.themeId === (UI.qs('t') || state.themeId) && state.room !== urlRoom) { state.room = urlRoom; save(); }
    render(); startLive();
  }

  function start() {
    var saved = store.get(KEY, null);
    var urlT = UI.qs('t');
    B.loadThemeIndex().catch(function () { return null; }).then(function (idx) {
      var target = urlT || (saved && saved.themeId) || (idx && idx.default);
      if (!target) throw new Error('ยังไม่มีชุดภาพในระบบ');
      if (saved && saved.themeId !== target) {
        return getTheme(idx, target).then(function (t) {
          return UI.modal({
            title: 'คุณมีบัตรเดิมอยู่แล้ว', dismissable: false,
            html: '<p>บัตรเดิม <b class="mono">' + esc(saved.code) + '</b> เป็นชุด “' + esc(saved.themeName) + '”</p><p>ลิงก์นี้เป็นเกมชุด “' + esc(t.name) + '”</p>',
            buttons: [{ label: 'ใช้บัตรเดิม', value: 'old', cls: 'ghost' }, { label: 'รับบัตรใหม่ชุดนี้', value: 'new' }]
          }).then(function (choice) {
            if (choice === 'new') { archive(saved); store.del(KEY); useTheme(t); askName(saved.name); return; }
            urlRoom = null;
            return getTheme(idx, saved.themeId).then(function (old) { useTheme(old); play(saved); });
          });
        });
      }
      return getTheme(idx, target).then(function (t) {
        useTheme(t);
        if (saved) play(saved); else askName('');
      });
    }).catch(function (e) {
      if (saved) {
        var c = store.get('cb.theme.' + saved.themeId, null);
        if (c) { useTheme(c); play(saved); return; }
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

  function askName(prefill) { show('join'); $('nameInput').value = prefill || ''; }

  $('joinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameInput').value.trim().slice(0, 24);
    if (!name) { $('nameInput').focus(); return; }
    newCard(name);
  });

  function newCard(name, room) {
    var num = B.randomPhoneCardNumber();
    var fp = B.fingerprint(theme);
    var s = {
      v: 1, name: name, themeId: theme.id, themeName: theme.name, fp: fp,
      num: num, code: B.formatCode(num), cells: B.generateCard(theme, num), marks: [],
      room: room || urlRoom || null, roundId: SY && SY.fp === fp && !SY.mismatch ? SY.roundId : null,
      createdAt: new Date().toISOString()
    };
    state = s; save(); play(s);
    UI.toast('ได้รับบัตรหมายเลข ' + state.code);
  }

  function save() {
    if (!store.set(KEY, state)) UI.toast('บันทึกในเครื่องไม่สำเร็จ — โปรดอย่าปิดหน้านี้ แจ้งเจ้าหน้าที่');
  }

  // ---------- ข้อมูลซิงก์ ----------
  function syncValid() { return !!(SY && !SY.mismatch && state && SY.fp === state.fp); }
  function drawnSet() {
    var d = {};
    if (syncValid()) SY.draws.forEach(function (id) { d[id] = true; });
    return d;
  }
  function fresh() { return syncValid() && SY.source === 'live' && liveStatus === 'live'; }

  function applySync(data, source) {
    if (!data || !state) return;
    if (data.fp && data.fp !== state.fp) { SY = { source: source, fp: data.fp, mismatch: true, at: Date.now(), draws: [] }; render(); return; }
    hostMissing = false;
    SY = { source: source, fp: state.fp, roundId: data.roundId, roundNo: data.roundNo, pattern: data.pattern || 'line1',
      draws: (data.draws || []).filter(function (id) { return chars[id]; }), at: Date.now() };
    store.set(SKEY, SY);
    // ยังไม่ได้แตะอะไร → ใช้รอบปัจจุบันของพิธีกรได้เลย (เช่น เพิ่งเปิดบัตร หรือจอพิธีกรเปลี่ยนรอบ/เปลี่ยนเครื่อง)
    if (!state.roundId || (state.roundId !== SY.roundId && !state.marks.length)) { state.roundId = SY.roundId; save(); }
    render();
  }

  function showRoundBanner() {
    var b = $('roundBanner');
    b.innerHTML = '<b>พิธีกรเริ่มรอบที่ ' + esc(SY.roundNo) + ' แล้ว</b><br>เลือกเล่นต่อด้วยบัตรเดิม (ล้างเครื่องหมาย) หรือขอบัตรใบใหม่' +
      '<div class="row" style="margin-top:.5rem"><button class="btn" id="rbClear" type="button">ล้างเครื่องหมาย เล่นรอบใหม่</button>' +
      '<button class="btn ghost" id="rbNew" type="button">ขอบัตรใบใหม่</button></div>';
    b.classList.remove('hidden');
    $('rbClear').onclick = function () { state.marks = []; state.roundId = SY.roundId; save(); render(); UI.toast('พร้อมเล่นรอบที่ ' + SY.roundNo); };
    $('rbNew').onclick = function () { $('btnNew').click(); };
  }

  function startLive() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (!Sync.enabled() || !state) { liveStatus = 'off'; render(); return; }
    var onSt = function (st) { liveStatus = st; if (state) { renderSyncBar(); renderCellsOnly(); } };
    if (state.room) {
      unsubscribe = Sync.subscribe(state.room, function (data) {
        if (data) applySync(data, 'live'); else render();
      }, onSt);
    } else {
      // เปิดลิงก์ตรง → เชื่อมกับจอพิธีกรชุดเดียวกันที่เปิดอยู่ล่าสุดโดยอัตโนมัติ
      unsubscribe = Sync.subscribeLatest(state.fp, function (data) {
        if (data) applySync(data, 'live'); else { hostMissing = true; render(); }
      }, onSt);
    }
  }

  function renderSyncBar() {
    var bar = $('syncBar');
    if (SY && SY.mismatch) {
      bar.innerHTML = '<span class="dot"></span><span>เกมบนจอเป็นคนละชุดภาพกับบัตรนี้ — ขอบัตรใบใหม่จาก QR เข้าเกม</span>';
      bar.classList.remove('hidden'); return;
    }
    if (!syncValid() && liveStatus === 'off') { bar.classList.add('hidden'); return; }
    var dot = fresh() ? 'live' : (syncValid() ? 'stale' : '');
    var txt;
    if (!syncValid()) txt = '<span>' + (liveStatus === 'offline' || liveStatus === 'error' ? 'เชื่อมต่อจอพิธีกรไม่ได้ — แตะได้ แต่ต้องให้เจ้าหน้าที่ตรวจบัตร' : (liveStatus === 'connecting' ? 'กำลังเชื่อมต่อกับจอพิธีกร…' : (hostMissing ? 'ยังไม่พบจอพิธีกร — รอพิธีกรเปิดเกม หรือสแกน “QR เข้าเกม” บนจอ' : 'รอพิธีกรเริ่มเกม…'))) + '</span>';
    else {
      var n = SY.draws.length, last = SY.draws[n - 1], c = last && chars[last];
      var when = fresh() ? 'สดจากพิธีกร' : (SY.source === 'qr' ? 'จาก QR เมื่อ ' + new Date(SY.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : 'ข้อมูลล่าสุด (ขาดการเชื่อมต่อ)');
      txt = (c && c.img && !B.isText(theme) ? '<img alt="" src="' + esc(c.img) + '">' : '') + '<span>รอบที่ ' + esc(SY.roundNo) + ' · เรียกแล้ว <b id="syncCount">' + n + '</b> ตัว' +
        (c ? ' · ล่าสุด <b>' + esc(c.name) + '</b>' : '') + '<br><span class="muted small">' + when + ' · รางวัล: ' + esc(B.PATTERNS[SY.pattern || 'line1'].name) + '</span></span>';
    }
    bar.innerHTML = '<span class="dot ' + dot + '"></span>' + txt;
    bar.classList.remove('hidden');
  }

  // ---------- แสดงผล ----------
  var lastBingoCount = 0;
  window.addEventListener('resize', function () { if (theme && B.isText(theme)) B.fitWords($('grid')); });
  function render() {
    if (!state) return;
    show('play');
    $('pName').textContent = state.name;
    $('pCode').textContent = state.code;
    $('cardMeta').textContent = 'ชุด: ' + state.themeName + ' · รหัสชุด ' + state.fp + ' · สร้างเมื่อ ' + new Date(state.createdAt).toLocaleString('th-TH');
    var grid = $('grid');
    grid.classList.toggle('txt', B.isText(theme));
    if (!grid.children.length) {
      state.cells.forEach(function (id, i) {
        var c = chars[id];
        var d = document.createElement('div');
        d.className = 'cell'; d.dataset.i = i; d.setAttribute('role', 'gridcell');
        d.innerHTML = c ? B.cellInner(theme, c) : '<div style="font-size:2rem">?</div><div class="nm">ไม่พบภาพ</div>';
        grid.appendChild(d);
      });
    }
    if (B.isText(theme)) B.fitWords(grid);
    renderSyncBar();
    if (syncValid() && state.roundId && SY.roundId && state.roundId !== SY.roundId) showRoundBanner(); else $('roundBanner').classList.add('hidden');
    renderCellsOnly();
  }

  function renderCellsOnly() {
    var grid = $('grid'), known = syncValid(), D = drawnSet();
    // ข้อมูลซิงก์เป็นของรอบอื่น (ยังไม่เลือกเล่นรอบใหม่) → ไม่ใช้ตรวจเครื่องหมาย
    if (known && state.roundId && SY.roundId !== state.roundId) { known = false; D = {}; }
    var marks = {}; state.marks.forEach(function (i) { marks[i] = true; });
    var lines = B.linesFromMarks(state.marks);
    var verified = known ? lines.filter(function (l) { return l.cells.every(function (i) { return D[state.cells[i]]; }); }) : lines;
    var win = {}; verified.forEach(function (l) { l.cells.forEach(function (i) { win[i] = true; }); });
    Array.prototype.forEach.call(grid.children, function (d, i) {
      var called = !!D[state.cells[i]];
      d.classList.toggle('marked', !!marks[i]);
      d.classList.toggle('win', !!win[i]);
      d.classList.toggle('unverified', known && !!marks[i] && !called);
      var badge = d.querySelector('.called');
      if (known && called && !badge) { badge = document.createElement('span'); badge.className = 'called'; badge.textContent = 'เรียกแล้ว'; d.appendChild(badge); }
      if ((!known || !called) && badge) badge.remove();
      d.setAttribute('aria-pressed', marks[i] ? 'true' : 'false');
    });
    $('legend').innerHTML = (known && fresh())
      ? 'ซิงก์กับพิธีกรอยู่ — <b>แตะได้เฉพาะตัวที่ขึ้น “เรียกแล้ว”</b> · ครบแนวนอน แนวตั้ง หรือทแยง = BINGO'
      : 'แตะช่องเมื่อพิธีกรเรียกตัวละครนั้น · แตะซ้ำเพื่อยกเลิก · ครบ 4 ช่องแนวนอน แนวตั้ง หรือทแยง = BINGO' +
        (known ? '' : '<br><b>BINGO จะขึ้นเมื่อบัตรเชื่อมกับจอพิธีกรแล้วเท่านั้น</b>') + '<br>บัตรถูกบันทึกในเครื่องนี้ รีเฟรชหรือเน็ตหลุดก็ไม่หาย';

    var flag = $('bingoFlag'), pid = (known && SY.pattern) || 'line1', pat = B.PATTERNS[pid];
    var full = state.marks.length >= B.CELLS && (!known || state.cells.every(function (id) { return D[id]; }));
    var meets = pid === 'full' ? full : verified.length >= pat.lines;
    flag.classList.remove('pending');
    if (known && meets) {
      flag.classList.remove('hidden');
      flag.firstChild.nodeValue = full ? 'เต็มบัตร!' : 'BINGO!';
      $('bingoLines').innerHTML = (full ? 'ครบทั้ง 16 ช่อง' : 'ครบ ' + verified.length + ' แนว') + ' — ' + esc(verified.map(function (l) { return l.name; }).join(' · ')) +
        '<br>✓ ตรงกับตัวที่พิธีกรเรียกแล้ว' +
        '<br>ยกมือ แล้วแสดงหน้าจอนี้และเลขบัตร <span class="mono">' + esc(state.code) + '</span> ให้เจ้าหน้าที่ตรวจ';
      if (verified.length > lastBingoCount && navigator.vibrate) { try { navigator.vibrate([120, 60, 120]); } catch (e) { /* */ } }
    } else if (!known && lines.length) {
      // ไม่ได้เชื่อมกับจอพิธีกร → ยืนยันเองไม่ได้ ห้ามขึ้น BINGO
      flag.classList.remove('hidden'); flag.classList.add('pending');
      flag.firstChild.nodeValue = 'ยังยืนยันไม่ได้';
      $('bingoLines').innerHTML = 'บัตรนี้ยังไม่ได้เชื่อมกับจอพิธีกร จึงไม่รู้ว่าตัวที่แตะถูกเรียกจริงหรือไม่' +
        '<br>สแกน “QR เข้าเกม” บนจอ หรือกด “ซิงก์จากจอ” · ถ้าคิดว่าครบแล้ว ยกมือให้เจ้าหน้าที่ตรวจเลขบัตร <span class="mono">' + esc(state.code) + '</span>';
    } else if (known && lines.length > verified.length) {
      flag.classList.remove('hidden'); flag.classList.add('pending');
      flag.firstChild.nodeValue = 'ยังไม่ BINGO';
      $('bingoLines').innerHTML = 'แนวที่ครบมีช่องที่พิธีกรยังไม่ได้เรียก (กรอบเส้นประสีส้ม)' + (fresh() ? '' : '<br>ถ้าเพิ่งเรียก ให้กด “ซิงก์จากจอ” อีกครั้ง');
    } else if (known && verified.length) {
      flag.classList.remove('hidden'); flag.classList.add('pending');
      flag.firstChild.nodeValue = 'ครบ ' + verified.length + ' แนว';
      $('bingoLines').innerHTML = 'รางวัลตอนนี้ต้อง “' + esc(pat.name) + '” — เล่นต่อได้เลย';
    } else flag.classList.add('hidden');
    lastBingoCount = verified.length;
  }

  // แตะช่อง — ใช้ event เดียว (click)
  $('grid').addEventListener('click', function (e) {
    var cell = e.target.closest('.cell'); if (!cell || !state) return;
    var i = +cell.dataset.i;
    var k = state.marks.indexOf(i);
    if (k >= 0) state.marks.splice(k, 1);
    else {
      var sameRound = !state.roundId || (SY && SY.roundId === state.roundId);
      if (fresh() && sameRound && !drawnSet()[state.cells[i]]) {
        cell.classList.remove('blocked'); void cell.offsetWidth; cell.classList.add('blocked');
        UI.toast('“' + (chars[state.cells[i]] || {}).name + '” ยังไม่ถูกเรียก');
        return;
      }
      state.marks.push(i);
    }
    save(); renderCellsOnly();
  });

  $('btnClear').addEventListener('click', function () {
    UI.confirm('ล้างเครื่องหมายทั้งหมด?', '<p>ใช้เมื่อเริ่มรอบใหม่ด้วยบัตรใบเดิม</p>', 'ล้างเครื่องหมาย', 'danger').then(function (ok) {
      if (!ok) return; state.marks = []; if (syncValid()) state.roundId = SY.roundId; save(); render(); UI.toast('ล้างเครื่องหมายแล้ว');
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
      var name = state.name, room = state.room; archive(state); store.del(KEY);
      $('grid').innerHTML = ''; $('roundBanner').classList.add('hidden'); newCard(name, room);
    });
  });

  // ---------- สแกน QR ซิงก์ ----------
  function applySyncText(text) {
    var d = B.decodeSync(text, theme);
    if (!d.ok) { UI.toast(d.error, 3500); return false; }
    if (fresh() && SY.roundId === d.roundId && SY.draws.length >= d.draws.length) { UI.toast('ข้อมูลเป็นปัจจุบันอยู่แล้ว'); return true; }
    applySync({ fp: d.fp, roundId: d.roundId, roundNo: d.roundNo, pattern: d.pattern, draws: d.draws }, 'qr');
    UI.toast('ซิงก์แล้ว: พิธีกรเรียกไปแล้ว ' + d.draws.length + ' ตัว');
    return true;
  }
  var jsqrP = null;
  function loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    if (!jsqrP) jsqrP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = 'assets/vendor/jsqr.js?v=1.4.0'; s.onload = res; s.onerror = function () { jsqrP = null; rej(new Error('โหลดตัวอ่าน QR ไม่ได้')); };
      document.head.appendChild(s);
    });
    return jsqrP;
  }
  $('btnScan').addEventListener('click', function () {
    var stream = null, stop = false, detector = null;
    if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
    var p = UI.modal({
      title: 'สแกน QR ซิงก์บนจอ',
      html: '<div class="scanner"><video id="scanVideo" playsinline muted autoplay></video></div><p class="small muted center" id="scanMsg">เล็งกล้องไปที่ “QR ซิงก์” บนจอพิธีกร</p>',
      buttons: [{ label: 'ปิด', value: null, cls: 'ghost' }],
      onOpen: function (el) {
        var video = el.querySelector('#scanVideo'), msg = el.querySelector('#scanMsg');
        var cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg.textContent = 'เบราว์เซอร์นี้เปิดกล้องไม่ได้ — ดูจอแล้วแตะเองได้ตามปกติ'; return; }
        function closeModal() { var b = el.querySelector('.actions .btn'); if (b) b.click(); }
        function tick() {
          if (stop) return;
          var done = function (txt) {
            if (stop) return;
            if (txt && txt.indexOf('CBS1.') === 0 && applySyncText(txt)) { stop = true; closeModal(); return; }
            setTimeout(tick, 180);
          };
          if (!video.videoWidth) { setTimeout(tick, 200); return; }
          if (detector) {
            detector.detect(video).then(function (codes) { done(codes[0] && codes[0].rawValue); }).catch(function () { done(null); });
          } else {
            var w = Math.min(640, video.videoWidth), h = Math.round(video.videoHeight * w / video.videoWidth);
            cv.width = w; cv.height = h; ctx.drawImage(video, 0, 0, w, h);
            var q = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
            done(q && q.data);
          }
        }
        Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }), detector ? null : loadJsQR()]).then(function (r) {
          stream = r[0];
          if (stop) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          video.srcObject = stream; return video.play();
        }).then(function () { tick(); }).catch(function (e) {
          msg.textContent = (e && e.name === 'NotAllowedError') ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — อนุญาตกล้องในการตั้งค่าเบราว์เซอร์ หรือดูจอแล้วแตะเอง' : 'เปิดกล้องไม่ได้ — ดูจอแล้วแตะเองได้ตามปกติ';
        });
      }
    });
    p.then(function () { stop = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); });
  });

  // กันหน้าจอดับระหว่างเล่น (ถ้าเบราว์เซอร์รองรับ)
  function keepAwake() {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      navigator.wakeLock.request('screen').catch(function () { /* */ });
    }
  }
  document.addEventListener('visibilitychange', keepAwake);
  keepAwake();

  window.addEventListener('storage', function (e) {
    if (e.key === store.key(KEY) && e.newValue) { try { state = JSON.parse(e.newValue); $('grid').innerHTML = ''; render(); } catch (err) { /* */ } }
  });

  window.__player = { applySyncText: applySyncText, sync: function () { return SY; }, live: function () { return liveStatus; } };
  start();
})();
