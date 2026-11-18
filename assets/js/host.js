/* หน้าจอพิธีกร */
(function () {
  'use strict';
  var B = Bingo, store = B.store, esc = B.esc;
  var KEY = 'cb.host.v1';
  var $ = function (id) { return document.getElementById(id); };
  var theme = null, chars = {}, sources = null, busy = false;
  var REVEAL_MS = 1300, COOLDOWN_MS = 900;

  B.registerSW();

  function newRound(no, themeId) {
    return { no: no, id: 'r' + Date.now().toString(36), themeId: themeId, startedAt: new Date().toISOString(), draws: [], checks: [], pattern: 'line1' };
  }
  var S = store.get(KEY, null);
  if (!S || !S.round) S = { themeId: null, round: null, archive: [] };
  if (!S.roomId) S.roomId = Sync.newRoomId();
  var spinning = false;
  function save() { if (!store.set(KEY, S)) UI.toast('บันทึกสถานะไม่สำเร็จ!'); schedulePublish(); }
  function drawIds() { return S.round ? S.round.draws.map(function (d) { return d.id; }) : []; }

  /** ตัวที่ "เปิดเผยแล้ว" — ระหว่างแอนิเมชันยังไม่ส่งตัวล่าสุดให้ผู้เล่น */
  function visibleDraws() {
    var ids = drawIds();
    return spinning ? ids.slice(0, -1) : ids;
  }

  // ---------- ซิงก์เรียลไทม์ ----------
  var pubTimer = null, pubBusy = false, pubAgain = false;
  function syncPill(text, ok) { var p = $('syncPill'); p.textContent = text; p.classList.toggle('off', !ok); }
  function schedulePublish(delay) {
    if (!Sync.enabled() || !theme || !S.round) return;
    clearTimeout(pubTimer);
    pubTimer = setTimeout(publish, delay == null ? 250 : delay);
  }
  function publish() {
    if (spinning) return; // จะส่งหลังเปิดเผยแล้ว
    if (pubBusy) { pubAgain = true; return; }
    pubBusy = true; syncPill('ซิงก์: กำลังส่ง…', true);
    var data = { v: 1, themeId: theme.id, fp: B.fingerprint(theme), roundId: S.round.id, roundNo: S.round.no,
      pattern: S.round.pattern || 'line1', draws: visibleDraws(), updatedAt: Date.now() };
    Sync.publish(S.roomId, data).then(function () {
      syncPill('ซิงก์: ส่งแล้ว ✓ (' + data.draws.length + ')', true);
    }).catch(function (e) {
      if (e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''))) {
        // เครื่องนี้ไม่ใช่เจ้าของห้องเดิม → สร้างห้องใหม่
        S.roomId = Sync.newRoomId(); store.set(KEY, S);
        UI.toast('สร้างห้องซิงก์ใหม่แล้ว — ให้ผู้เล่นสแกน “QR เข้าเกม” อีกครั้งเพื่อเปิดซิงก์', 6000);
        pubAgain = true;
      } else {
        syncPill('ซิงก์: ส่งไม่สำเร็จ ลองใหม่…', false);
        setTimeout(function () { schedulePublish(0); }, 5000);
      }
    }).then(function () {
      pubBusy = false;
      if (pubAgain) { pubAgain = false; schedulePublish(0); }
    });
  }
  if (!Sync.enabled()) syncPill('ซิงก์: ใช้ QR', false);
  window.addEventListener('online', function () { schedulePublish(0); });

  // ---------- QR ซิงก์ ----------
  function syncText() { return B.encodeSync(theme, { id: S.round.id, no: S.round.no, pattern: S.round.pattern, draws: visibleDraws() }); }
  function renderSyncQR() {
    if (!theme || !S.round) return;
    var txt = syncText();
    $('qrSyncSmall').innerHTML = qrSvg(txt);
    if (!$('qrSyncFull').classList.contains('hidden')) {
      $('qrSyncBig').innerHTML = qrSvg(txt);
      $('qrSyncInfo').textContent = 'รอบที่ ' + S.round.no + ' · เรียกแล้ว ' + visibleDraws().length + ' ตัว · QR อัปเดตอัตโนมัติทุกครั้งที่สุ่ม';
    }
  }
  function openSyncQR() { if (!theme) return; $('qrSyncFull').classList.remove('hidden'); renderSyncQR(); }

  // ---------- โหลดชุดภาพ ----------
  ThemeSource.all().then(function (src) {
    sources = src;
    var sel = $('themeSel');
    sel.innerHTML = src.list.map(function (t) {
      return '<option value="' + esc(t.source + ':' + t.id) + '">' + esc(t.name) + (t.source === 'local' ? ' (ฉบับร่างในเครื่องนี้)' : '') + '</option>';
    }).join('');
    var want = (UI.qs('t')) || S.themeId || src.defaultId || (src.list[0] && src.list[0].id);
    var entry = findEntry(want, UI.qs('src') === 'local' && UI.qs('t') === want) || src.list[0];
    if (!entry) { UI.modal({ title: 'ยังไม่มีชุดภาพ', html: '<p>ไปที่หน้า “จัดการภาพ” เพื่อสร้างชุดภาพก่อน</p>' }); return; }
    return applyTheme(entry, true);
  }).catch(function (e) {
    UI.modal({ title: 'โหลดชุดภาพไม่สำเร็จ', html: '<p>' + esc(e.message) + '</p>' });
  });

  function findEntry(id, preferLocal) {
    if (!sources || !id) return null;
    if (preferLocal) { var loc = sources.list.filter(function (t) { return t.id === id && t.source === 'local'; })[0]; if (loc) return loc; }
    var pub = sources.list.filter(function (t) { return t.id === id && t.source === 'published'; })[0];
    return pub || sources.list.filter(function (t) { return t.id === id; })[0] || null;
  }

  function applyTheme(entry, initial) {
    return ThemeSource.load(entry, sources.index).then(function (t) {
      var v = B.validateTheme(t);
      if (!v.ok) {
        UI.modal({ title: 'ชุดภาพยังใช้งานไม่ได้', html: '<ul>' + v.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' });
        return;
      }
      theme = t; chars = B.charMap(t); theme._source = entry.source;
      $('themeSel').value = entry.source + ':' + entry.id;
      if (!S.round || S.round.themeId !== t.id) {
        if (S.round && S.round.draws.length) archiveRound();
        S.round = newRound(S.round ? S.round.no + 1 : 1, t.id);
      }
      S.themeId = t.id; save();
      // ตรวจว่าประวัติยังตรงกับชุดภาพ
      var unknown = drawIds().filter(function (id) { return !chars[id]; });
      if (unknown.length) UI.modal({ title: 'คำเตือน', html: '<p>ประวัติการสุ่มมีตัวละครที่ไม่อยู่ในชุดภาพปัจจุบัน ' + unknown.length + ' ตัว ควรเริ่มรอบใหม่</p>' });
      $('fp').textContent = 'รหัสชุด ' + B.fingerprint(t);
      $('lnkPrint').href = 'print.html?t=' + encodeURIComponent(t.id) + (entry.source === 'local' ? '&src=local' : '');
      renderAll(true);
      warmMedia(t);
    });
  }
  /** โหลดภาพนิ่ง/ภาพปกของทุกคำไว้ล่วงหน้า (Service Worker เก็บไว้ → เปิดออฟไลน์ได้) */
  function warmMedia(t) {
    var urls = [];
    t.characters.forEach(function (c) {
      if (!B.mediaAllowed(c)) return;
      if (B.mediaType(c) === 'video') { if (c.media && c.media.poster) urls.push(c.media.poster); }
      else if (/^https:/.test(B.mediaSrc(c))) urls.push(B.mediaSrc(c));
    });
    var i = 0;
    function next() { if (i >= urls.length) return; var im = new Image(); im.onload = im.onerror = next; im.src = urls[i++]; }
    setTimeout(function () { for (var k = 0; k < 4; k++) next(); }, 1500);
  }

  $('themeSel').addEventListener('change', function () {
    var parts = this.value.split(':'), entry = sources.list.filter(function (t) { return t.source === parts[0] && t.id === parts.slice(1).join(':'); })[0];
    var self = this;
    if (S.round && S.round.draws.length) {
      UI.confirm('เปลี่ยนชุดภาพ?', '<p>รอบนี้สุ่มไปแล้ว ' + S.round.draws.length + ' ตัว การเปลี่ยนชุดภาพจะเก็บรอบนี้เข้าประวัติและเริ่มรอบใหม่</p>', 'เปลี่ยนและเริ่มรอบใหม่', 'danger')
        .then(function (ok) { if (ok) applyTheme(entry); else self.value = theme._source + ':' + theme.id; });
    } else applyTheme(entry);
  });

  $('patternSel').addEventListener('change', function () {
    S.round.pattern = this.value; save(); renderAll(true);
    UI.toast('เปลี่ยนรางวัลเป็น “' + B.PATTERNS[this.value].name + '” — ประกาศให้ผู้เล่นทราบ');
  });

  // ---------- แสดงผล ----------
  function renderAll(noAnim) {
    if (!theme) return;
    var ids = drawIds();
    $('roundPill').textContent = 'รอบที่ ' + S.round.no;
    var pat = B.PATTERNS[S.round.pattern || 'line1'];
    $('patternSel').value = pat.id; $('patternLabel').textContent = 'รางวัลนี้: ' + pat.name;
    $('count').textContent = ids.length + ' / ' + theme.characters.length;
    var last = ids[ids.length - 1];
    var text = B.isText(theme);
    $('reveal').classList.toggle('textmode', text);
    if (last && chars[last]) showBig(chars[last], noAnim); else if (!spinning) {
      $('bigMedia').classList.add('hidden'); $('bigMedia').innerHTML = ''; shownId = null;
      $('bigName').textContent = ''; $('btnCredit').classList.add('hidden'); $('placeholder').classList.remove('hidden');
      $('placeholder').textContent = 'กด “สุ่มตัวถัดไป” เพื่อเริ่ม';
    }
    var order = {}; ids.forEach(function (id, i) { order[id] = i + 1; });
    $('board').classList.toggle('txt', text);
    $('board').innerHTML = theme.characters.map(function (c) {
      return '<div class="b' + (order[c.id] ? ' on' : '') + '" title="' + esc(c.name + (c.th ? ' — ' + c.th : '')) + '">' + (order[c.id] ? '<span class="o">' + order[c.id] + '</span>' : '') +
        (text ? esc(c.name) : '<img alt="' + esc(c.name) + '" src="' + esc(c.img) + '">') + '</div>';
    }).join('');
    $('history').innerHTML = ids.length ? ids.map(function (id, i) {
      var c = chars[id] || { name: '?', img: '' };
      return '<span class="h' + (text ? ' t' : '') + '">' + (text ? '' : '<img alt="" src="' + esc(c.img) + '">') + (i + 1) + '. ' + esc(c.name) + '</span>';
    }).reverse().join('') : '<span class="muted small">ยังไม่มี</span>';
    var done = ids.length >= theme.characters.length;
    $('btnDraw').disabled = busy || done;
    $('btnDraw').textContent = done ? 'สุ่มครบทุกตัวแล้ว' : '🎲 สุ่มตัวถัดไป';
    $('btnUndo').disabled = busy || !ids.length;
    renderSyncQR();
  }
  // ---------- สื่อบนจอใหญ่ (ภาพ / คลิป) ----------
  var shownId = null, preloaded = {};
  function mediaNode(c) {
    var src = B.mediaSrc(c), m = c.media || {};
    if (B.mediaType(c) === 'video') {
      var v = document.createElement('video');
      v.muted = true; v.defaultMuted = true; v.autoplay = true; v.playsInline = true; v.preload = 'auto';
      v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('disablepictureinpicture', '');
      var st = +m.start || 0, en = +m.end || 0;
      v.loop = !en && !st;
      if (m.poster) v.poster = m.poster;
      v.addEventListener('loadedmetadata', function () { if (st) { try { v.currentTime = st; } catch (e) { /* */ } } });
      v.addEventListener('timeupdate', function () { if (en && v.currentTime >= en) { v.currentTime = st; } });
      v.addEventListener('ended', function () { v.currentTime = st; var p = v.play(); if (p && p.catch) p.catch(function () { }); });
      v.addEventListener('error', function () { // ออฟไลน์/เล่นไม่ได้ → ใช้ภาพปกแทน
        if (!m.poster || !v.parentNode) return;
        var i = new Image(); i.alt = c.name; i.src = m.poster; v.parentNode.replaceChild(i, v);
      });
      v.src = src;
      return v;
    }
    var img = new Image(); img.alt = c.name; img.decoding = 'async'; img.src = src;
    if (m.pixel) img.className = 'pixel';
    return img;
  }
  function preload(c) { if (c && B.mediaAllowed(c) && !preloaded[c.id]) preloaded[c.id] = mediaNode(c); }
  function nameHtml(c) {
    return '<span class="en">' + esc(c.name) + '</span>' + (B.isText(theme) && c.th ? '<span class="sep"> — </span><span class="th">' + esc(c.th) + '</span>' : '');
  }
  function showBig(c, noAnim) {
    $('placeholder').classList.add('hidden');
    var box = $('bigMedia'), text = B.isText(theme);
    box.classList.toggle('dark', text);
    if (shownId !== c.id) {
      box.innerHTML = '';
      if (B.mediaAllowed(c)) {
        var node = preloaded[c.id] || mediaNode(c); delete preloaded[c.id];
        box.appendChild(node); box.classList.remove('hidden');
        if (node.play) { var p = node.play(); if (p && p.catch) p.catch(function () { }); }
      } else box.classList.add('hidden');
      shownId = c.id;
    }
    $('bigName').innerHTML = nameHtml(c);
    $('btnCredit').classList.toggle('hidden', !(c.credit || (text && B.mediaSrc(c))));
    $('btnCredit').dataset.id = c.id;
    var r = $('reveal'); r.classList.remove('revealed');
    if (!noAnim) { void r.offsetWidth; r.classList.add('revealed'); }
  }
  $('btnCredit').addEventListener('click', function () {
    var c = chars[this.dataset.id]; if (!c) return;
    UI.modal({ title: 'เครดิต: ' + c.name, html: B.creditHtml(c) });
  });
  function openCredits() {
    if (!theme) return;
    UI.modal({
      title: 'เครดิต / แหล่งที่มาของภาพและคลิป', wide: true,
      html: '<p class="small"><b>' + esc(theme.name) + '</b>' + (theme.creditsNote ? '<br>' + esc(theme.creditsNote) : '') + '</p>' + B.creditsListHtml(theme)
    });
  }
  $('btnCredits').addEventListener('click', openCredits);

  // ---------- สุ่ม ----------
  function draw() {
    if (busy || !theme) return;
    var ids = drawIds();
    var next = B.drawNext(theme, ids);
    if (!next) { UI.toast('สุ่มครบทุกตัวแล้ว'); return; }
    busy = true; spinning = true; renderAll(true);
    // บันทึกก่อนแสดงผล: รีเฟรชระหว่างแอนิเมชันก็ไม่สุ่มซ้ำ/ไม่หาย
    S.round.draws.push({ id: next, at: new Date().toISOString() });
    save();
    var r = $('reveal'), box = $('bigMedia'), nm = $('bigName'), text = B.isText(theme), img = null;
    preload(chars[next]); // โหลดสื่อของตัวที่ออกระหว่างแอนิเมชัน
    $('placeholder').classList.add('hidden'); $('btnCredit').classList.add('hidden');
    shownId = null; box.innerHTML = '';
    if (text) box.classList.add('hidden');
    else { img = new Image(); img.alt = ''; box.appendChild(img); box.classList.remove('hidden'); box.classList.remove('dark'); }
    r.classList.add('spinning'); r.classList.remove('revealed');
    var pool = theme.characters, t0 = Date.now();
    var timer = setInterval(function () {
      var c = pool[Math.floor(Math.random() * pool.length)];
      if (text) nm.textContent = c.name; else { img.src = c.img; nm.textContent = '…'; }
      if (Date.now() - t0 > REVEAL_MS) {
        clearInterval(timer);
        r.classList.remove('spinning');
        spinning = false;
        renderAll(false);
        schedulePublish(0);
        setTimeout(function () { busy = false; renderAll(true); }, COOLDOWN_MS);
      }
    }, 90);
  }
  $('btnDraw').addEventListener('click', draw);
  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.modal-back') || /INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ''))) return;
    if (e.repeat) return; // กดค้างไม่สุ่มรัว
    if (e.key === ' ' || e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); draw(); }
  });

  $('btnUndo').addEventListener('click', function () {
    var ids = drawIds(); if (!ids.length || busy) return;
    var c = chars[ids[ids.length - 1]] || { name: '?' };
    UI.confirm('ยกเลิกตัวล่าสุด?', '<p>จะลบ “<b>' + esc(c.name) + '</b>” (ลำดับที่ ' + ids.length + ') ออกจากประวัติ ใช้เมื่อกดสุ่มผิดพลาดเท่านั้น และควรประกาศให้ผู้เล่นทราบ</p>', 'ยกเลิกตัวนี้', 'danger')
      .then(function (ok) { if (!ok) return; S.round.draws.pop(); save(); renderAll(true); UI.toast('ยกเลิก ' + c.name + ' แล้ว'); });
  });

  function archiveRound() {
    if (!S.round) return;
    S.round.endedAt = new Date().toISOString();
    S.archive = S.archive || [];
    S.archive.unshift(S.round);
    S.archive = S.archive.slice(0, 50);
  }
  $('btnNewRound').addEventListener('click', function () {
    if (busy) return;
    UI.modal({
      title: 'เริ่มรอบใหม่?',
      html: '<p>รอบที่ ' + S.round.no + ' (สุ่มแล้ว ' + S.round.draws.length + ' ตัว) จะถูกเก็บไว้ใน “ประวัติทุกรอบ” ไม่สูญหาย</p>' +
        '<label class="field"><span>พิมพ์ <b>' + (S.round.no + 1) + '</b> เพื่อยืนยันเริ่มรอบที่ ' + (S.round.no + 1) + '</span><input class="input" id="cfm" inputmode="numeric" autocomplete="off"></label>',
      buttons: [{ label: 'ยกเลิก', value: false, cls: 'ghost' }, {
        label: 'เริ่มรอบใหม่', cls: 'danger', getValue: function (el) {
          if (el.querySelector('#cfm').value.trim() !== String(S.round.no + 1)) { UI.toast('พิมพ์หมายเลขรอบให้ถูกต้องก่อน'); return undefined; }
          return true;
        }
      }],
      onOpen: function (el) { setTimeout(function () { el.querySelector('#cfm').focus(); }, 50); }
    }).then(function (ok) {
      if (!ok) return;
      var no = S.round.no + 1;
      if (S.round.draws.length || (S.round.checks && S.round.checks.length)) archiveRound();
      S.round = newRound(no, theme.id); save(); renderAll(true);
      UI.toast('เริ่มรอบที่ ' + no + ' แล้ว — แจ้งผู้เล่นให้ล้างเครื่องหมายหรือขอบัตรใหม่');
    });
  });

  // ---------- ตรวจบัตร ----------
  function verifyHtml(res, roundObj, patternId) {
    var pat = B.PATTERNS[patternId || 'line1'];
    var at = B.patternAtDraw(res, pat.id), html = '';
    if (at) html += '<div class="banner ok" style="font-size:1.25rem"><b>✅ ถูกต้อง: ' + esc(pat.name) + '</b><br>ครบเมื่อสุ่มตัวที่ <b>' + at + '</b> (สุ่มแล้วทั้งหมด ' + roundObj.draws.length + ' ตัว)</div>';
    else {
      var miss = B.missingFor(res, pat.id);
      html += '<div class="banner err" style="font-size:1.25rem"><b>❌ ยังไม่ได้รางวัล “' + esc(pat.name) + '”</b>' +
        (miss !== null ? '<br>ยังขาดอีก ' + miss + ' ตัว' : '<br>ตอนนี้ครบ ' + res.linesAtDraw.length + ' แนว') + '</div>';
    }
    var ms = [];
    if (res.linesAtDraw.length) ms.push('1 แนว: ตัวที่ ' + res.linesAtDraw[0]);
    if (res.linesAtDraw.length > 1) ms.push('2 แนว: ตัวที่ ' + res.linesAtDraw[1]);
    if (res.fullAtDraw) ms.push('เต็มบัตร: ตัวที่ ' + res.fullAtDraw);
    if (ms.length) html += '<p class="small center" style="margin:.3rem 0">ประวัติบัตรนี้ — ' + esc(ms.join(' · ')) + (res.winning.length ? '<br>แนวที่ครบ: ' + esc(res.winning.map(function (w) { return w.name; }).join(' · ')) : '') + '</p>';
    var win = {}; res.winning.forEach(function (w) { w.cells.forEach(function (i) { win[i] = true; }); });
    html += '<div class="grid4' + (B.isText(theme) ? ' txt' : '') + '" style="max-width:340px;margin:.6rem auto">' + res.cells.map(function (id, i) {
      var cls = win[i] ? 'win' : (res.drawnCells[i] ? 'drawn' : 'notdrawn');
      return '<div class="cell ' + cls + '" style="cursor:default">' + B.cellInner(theme, chars[id]) + '</div>';
    }).join('') + '</div><p class="small muted center">เขียว = ถูกเรียกแล้ว · เหลือง = แนวที่ชนะ · จาง = ยังไม่ถูกเรียก<br>เทียบ' + (B.isText(theme) ? 'คำ' : 'ภาพ') + 'บนจอผู้เล่นกับบัตรนี้ให้ตรงกันทุกช่อง</p>';
    return html;
  }

  $('btnVerify').addEventListener('click', openVerify);
  function openVerify(prefill, roundObj) {
    roundObj = roundObj || S.round;
    if (!theme) return;
    UI.modal({
      title: 'ตรวจบัตร — รอบที่ ' + roundObj.no,
      html: '<form id="vf"><label class="field"><span>หมายเลขบัตร (เช่น 48213-7)</span><input class="input mono" id="vcode" inputmode="numeric" autocomplete="off" value="' + esc(typeof prefill === 'string' ? prefill : '') + '"></label>' +
        '<button class="btn block" type="submit">ตรวจ</button></form><div id="vout"></div>',
      buttons: [{ label: 'ปิด', value: null, cls: 'ghost' }],
      onOpen: function (el) {
        var inp = el.querySelector('#vcode');
        setTimeout(function () { inp.focus(); }, 50);
        el.querySelector('#vf').addEventListener('submit', function (e) {
          e.preventDefault();
          var p = B.parseCode(inp.value), out = el.querySelector('#vout');
          if (!p.ok) { out.innerHTML = '<div class="banner err">' + esc(p.error) + '</div>'; return; }
          var ids = roundObj.draws.map(function (d) { return d.id; });
          var res = B.verifyCard(theme, p.num, ids);
          var pid = roundObj.pattern || 'line1', okNow = !!B.patternAtDraw(res, pid);
          var prev = (roundObj.checks || []).filter(function (c) { return c.code === res.code && c.bingo && (c.pattern || 'line1') === pid; });
          var html = '<p class="center" style="margin:.6rem 0 0">บัตร <b class="mono" style="font-size:1.4rem">' + esc(res.code) + '</b> · ' +
            (p.num <= B.PRINT_RANGE_MAX ? 'บัตรกระดาษ' : 'บัตรมือถือ') + ' · ชุด ' + esc(theme.name) + '</p>';
          if (!p.checked) html += '<div class="banner warn">ไม่ได้พิมพ์เลขตรวจสอบ (หลักสุดท้าย) — บัตรที่ถูกต้องคือ <b class="mono">' + esc(res.code) + '</b> โปรดดูให้ตรงกับบัตรผู้เล่น</div>';
          if (prev.length) html += '<div class="banner warn">บัตรนี้เคยตรวจผ่านแล้วในรอบนี้ เมื่อ ' + new Date(prev[0].at).toLocaleTimeString('th-TH') + '</div>';
          out.innerHTML = html + verifyHtml(res, roundObj, roundObj.pattern);
          B.fitWords(out);
          if (roundObj === S.round) {
            S.round.checks = S.round.checks || [];
            S.round.checks.push({ code: res.code, bingo: okNow, pattern: pid, atDraw: ids.length, at: new Date().toISOString() });
            save();
          }
        });
        if (prefill && typeof prefill === 'string') el.querySelector('#vf').requestSubmit();
      }
    });
  }

  // ---------- ประวัติทุกรอบ ----------
  $('btnRounds').addEventListener('click', function () {
    var rounds = [S.round].concat(S.archive || []);
    var html = rounds.map(function (r, k) {
      var names = r.draws.map(function (d, i) { return (i + 1) + '.' + ((chars[d.id] || {}).name || d.id); }).join(' ');
      var wins = (r.checks || []).filter(function (c) { return c.bingo; });
      return '<div class="panel" style="margin:.5rem 0;padding:.8rem"><b>รอบที่ ' + r.no + (k === 0 ? ' (ปัจจุบัน)' : '') + '</b> · ชุด ' + esc(r.themeId) +
        ' · สุ่ม ' + r.draws.length + ' ตัว · เริ่ม ' + new Date(r.startedAt).toLocaleString('th-TH') +
        '<div class="small muted" style="margin:.3rem 0">' + esc(names || '—') + '</div>' +
        (wins.length ? '<div class="small">ผู้ชนะที่ตรวจแล้ว: ' + wins.map(function (w) { return '<span class="mono">' + esc(w.code) + '</span> (' + esc(B.PATTERNS[w.pattern || 'line1'].name) + ', ตรวจตอนสุ่มแล้ว ' + w.atDraw + ' ตัว)'; }).join(', ') + '</div>' : '') +
        '<div class="row" style="margin-top:.4rem"><button class="btn ghost small" data-csv="' + k + '">ดาวน์โหลด CSV</button>' +
        (r.themeId === theme.id ? '<button class="btn ghost small" data-ver="' + k + '">ตรวจบัตรกับรอบนี้</button>' : '') + '</div></div>';
    }).join('');
    UI.modal({
      title: 'ประวัติทุกรอบ', html: html, buttons: [{ label: 'ดาวน์โหลดทั้งหมด (JSON)', value: 'json', cls: 'ghost' }, { label: 'ปิด', value: null }],
      onOpen: function (el) {
        el.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b) return;
          if (b.dataset.csv) {
            var r = rounds[+b.dataset.csv];
            var csv = '﻿ลำดับ,รหัส,ชื่อ,เวลา\n' + r.draws.map(function (d, i) { return [i + 1, d.id, '"' + String((chars[d.id] || {}).name || '').replace(/"/g, '""') + '"', d.at].join(','); }).join('\n');
            UI.download('bingo-round-' + r.no + '.csv', csv, 'text/csv');
          }
          if (b.dataset.ver) { var rr = rounds[+b.dataset.ver]; el.remove(); openVerify('', rr); }
        });
      }
    }).then(function (v) { if (v === 'json') UI.download('bingo-host-log.json', JSON.stringify(S, null, 2)); });
  });

  // ---------- QR ----------
  function joinUrl() {
    return new URL('index.html?t=' + encodeURIComponent(theme.id) + (Sync.enabled() ? '&room=' + S.roomId : ''), location.href).href;
  }
  function qrSvg(text) { var q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }
  $('btnQR').addEventListener('click', function () {
    if (!theme) return;
    if (theme._source === 'local') {
      UI.modal({ title: 'ชุดภาพนี้ยังไม่ได้เผยแพร่', html: '<p>ชุดภาพ “' + esc(theme.name) + '” อยู่ในเครื่องนี้เท่านั้น ผู้เล่นจะเปิดไม่ได้ ให้ส่งออกไฟล์จากหน้าจัดการภาพแล้วอัปโหลดขึ้น GitHub ก่อน</p>' });
      return;
    }
    var url = joinUrl();
    $('qrBig').innerHTML = qrSvg(url); $('qrUrl').textContent = url;
    $('qrFull').classList.remove('hidden');
  });
  $('btnQRClose').addEventListener('click', function () { $('qrFull').classList.add('hidden'); });
  $('btnQRSync').addEventListener('click', openSyncQR);
  $('qrSyncSmall').addEventListener('click', openSyncQR);
  $('btnQRSyncClose').addEventListener('click', function () { $('qrSyncFull').classList.add('hidden'); });
  $('btnFull').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });

  // ---------- กันเปิดหลายแท็บ ----------
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || !e.newValue) return;
    try { S = JSON.parse(e.newValue); } catch (err) { return; }
    renderAll(true);
    UI.toast('มีการสุ่มจากอีกแท็บหนึ่ง — ควรเปิดหน้าพิธีกรแท็บเดียว', 4000);
  });
  window.addEventListener('beforeunload', function (e) { if (busy) { e.preventDefault(); e.returnValue = ''; } });

  // สำหรับการทดสอบอัตโนมัติ
  window.__host = { openCredits: openCredits, shownId: function () { return shownId; }, state: function () { return S; }, theme: function () { return theme; }, busy: function () { return busy; }, syncText: function () { return syncText(); } };
})();
