/* หน้าสร้างเกมบิงโก: ใครก็สร้างได้ (ล็อกอิน Google) · แก้ได้เฉพาะเจ้าของ
 * แต่ละข้อ = โจทย์บนจอใหญ่ (รูป/คำ) + คำตอบบนบัตร (รูป/คำ) · บันทึกอัตโนมัติขึ้นระบบ */
(function () {
  'use strict';
  var B = Bingo, esc = B.esc, C = window.CloudGames;
  var $ = function (id) { return document.getElementById(id); };
  var ADMINS = ['premwadee.vi@spu.ac.th'];
  var Q_MAX = 1024, Q_LEN = 560000;   // ภาพโจทย์ (จอใหญ่)
  var A_MAX = 360, A_LEN = 180000;    // ภาพคำตอบ (ช่องบนบัตร)

  var user = null, gameId = null, game = null, items = [];
  var views = ['vLoading', 'vOff', 'vSignIn', 'vList', 'vEdit'];
  function show(v) { views.forEach(function (x) { $(x).classList.toggle('hidden', x !== v); }); }

  // ---------- บันทึก (แสดงสถานะ) ----------
  var pending = 0, failed = false;
  function track(p) {
    pending++; failed = false; renderSave();
    return p.then(function (v) { pending--; renderSave(); return v; }, function (e) {
      pending--; failed = true; renderSave();
      UI.toast(e && e.code === 'permission-denied' ? 'บันทึกไม่ได้: ไม่มีสิทธิ์แก้เกมนี้ หรือหลุดจากระบบ' : 'บันทึกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่', 4000);
      throw e;
    });
  }
  function renderSave() {
    var el = $('saveState');
    el.className = 'save-state' + (failed ? ' bad' : pending ? ' busy' : ' ok');
    el.textContent = failed ? '⚠ บันทึกไม่สำเร็จ' : pending ? 'กำลังบันทึก…' : '✓ บันทึกแล้ว';
  }
  window.addEventListener('beforeunload', function (e) { if (pending) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- ผู้ใช้ ----------
  function canEdit(g) { return !!user && !!g && (g.ownerUid === user.uid || ADMINS.indexOf(user.email) >= 0); }
  function renderWho() {
    $('who').classList.toggle('hidden', !user);
    if (!user) return;
    $('whoName').textContent = user.name;
    $('whoPic').classList.toggle('hidden', !user.photo);
    if (user.photo) $('whoPic').src = user.photo;
  }
  $('btnSignIn').addEventListener('click', function () {
    C.signIn().catch(function (e) {
      var msg = e && e.code === 'auth/popup-blocked' ? 'เบราว์เซอร์บล็อกหน้าต่างล็อกอิน — อนุญาตป๊อปอัปแล้วลองใหม่'
        : e && e.code === 'auth/unauthorized-domain' ? 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase — แจ้งผู้ดูแลระบบ'
        : e && e.code === 'auth/operation-not-allowed' ? 'ยังไม่ได้เปิดการล็อกอินด้วย Google ใน Firebase — แจ้งผู้ดูแลระบบ'
        : e && e.code === 'auth/popup-closed-by-user' ? 'ปิดหน้าต่างล็อกอินก่อนเสร็จ' : 'ล็อกอินไม่สำเร็จ: ' + ((e && (e.code || e.message)) || e);
      UI.toast(msg, 5000);
    });
  });
  $('btnSignOut').addEventListener('click', function () { C.signOut().then(function () { location.href = 'create.html'; }); });

  if (!C || !C.enabled()) { show('vOff'); return; }
  $('minN').textContent = B.MIN_CHARACTERS;
  var started = false;
  C.onUser(function (u) {
    user = u; renderWho();
    if (!u) { show('vSignIn'); return; }
    if (started) return; started = true;
    var g = UI.qs('g');
    if (g) openEditor(g); else showList();
  });

  // ---------- รายการเกมของฉัน ----------
  function statusBadge(d) {
    var n = d.itemCount || 0;
    if (d.status === 'published' && n >= B.MIN_CHARACTERS) return '<span class="badge pub">เผยแพร่แล้ว</span>';
    if (d.status === 'published') return '<span class="badge warn">เผยแพร่แล้ว แต่ข้อยังไม่ถึง ' + B.MIN_CHARACTERS + '</span>';
    return '<span class="badge draft">ฉบับร่าง</span>';
  }
  function showList() {
    show('vLoading');
    history.replaceState(null, '', 'create.html');
    C.listMine(user.uid).then(function (list) {
      $('myGames').innerHTML = list.length ? list.map(function (g) {
        var d = g.data;
        return '<div class="game-card" data-id="' + esc(g.id) + '">' +
          '<div class="gc-pic">' + (d.cover ? '<img alt="" src="' + esc(d.cover) + '">' : '<span>B</span>') + '</div>' +
          '<div class="gc-tx"><b>' + esc(d.name) + '</b><div class="small muted">' + (d.itemCount || 0) + ' ข้อ · ' + statusBadge(d) + '</div></div>' +
          '<div class="gc-act"><button class="btn secondary" data-open>แก้ไข</button><a class="btn ghost" target="_blank" href="host.html?t=' + encodeURIComponent(C.PREFIX + g.id) + '">เล่น</a></div></div>';
      }).join('') : '<div class="panel center"><p>ยังไม่มีเกม</p><p class="muted small">กด “+ สร้างเกมใหม่” เพื่อเริ่ม</p></div>';
      show('vList');
    }).catch(function (e) { UI.toast('โหลดรายการเกมไม่สำเร็จ: ' + (e.message || e), 4000); show('vList'); });
  }
  $('myGames').addEventListener('click', function (e) {
    var card = e.target.closest('.game-card');
    if (card && e.target.closest('[data-open]')) openEditor(card.dataset.id);
  });
  $('btnNew').addEventListener('click', function () {
    var id = C.newId(12), now = Date.now();
    var g = { v: 1, name: 'เกมใหม่ของ' + user.name.slice(0, 40), description: '', ownerUid: user.uid, ownerName: user.name.slice(0, 80),
      itemCount: 0, status: 'draft', showAnswer: false, createdAt: now, updatedAt: now };
    $('btnNew').disabled = true;
    C.saveGame(id, g).then(function () { openEditor(id, g, true); })
      .catch(function (e) { UI.toast('สร้างเกมไม่สำเร็จ: ' + (e.code || e.message || e), 5000); })
      .then(function () { $('btnNew').disabled = false; });
  });
  $('btnBack').addEventListener('click', function () { flushAll().then(showList); });

  // ---------- เปิดเกมเพื่อแก้ไข ----------
  function openEditor(id, preset, fresh) {
    show('vLoading');
    Promise.all([preset ? Promise.resolve(preset) : C.getGame(id), fresh ? Promise.resolve([]) : C.getItems(id)]).then(function (r) {
      if (!r[0]) { UI.toast('ไม่พบเกมนี้', 3000); showList(); return; }
      if (!canEdit(r[0])) { UI.toast('เกมนี้เป็นของ ' + (r[0].ownerName || 'ผู้ใช้อื่น') + ' — แก้ไขได้เฉพาะผู้สร้าง', 4000); showList(); return; }
      gameId = id; game = r[0]; items = r[1];
      history.replaceState(null, '', 'create.html?g=' + encodeURIComponent(id));
      $('gName').value = game.name || ''; $('gDesc').value = game.description || ''; $('gShowAns').checked = !!game.showAnswer;
      $('lnkHost').href = 'host.html?t=' + encodeURIComponent(C.PREFIX + id);
      renderItems(); renderStatus(); renderSave();
      show('vEdit');
      if (fresh) { $('gName').select(); $('gName').focus(); }
    }).catch(function (e) { UI.toast('เปิดเกมไม่สำเร็จ: ' + (e.message || e), 4000); showList(); });
  }

  // ---------- ข้อมูลเกม ----------
  var metaTimer = null;
  function scheduleMeta() { clearTimeout(metaTimer); metaTimer = setTimeout(saveMeta, 700); }
  function complete(d) { return !!((d.qText || d.qImg) && (d.aText || d.aImg)); }
  function completeItems() { return items.filter(function (it) { return complete(it.data); }); }
  function saveMeta() {
    clearTimeout(metaTimer); metaTimer = null;
    if (!game) return Promise.resolve();
    game.name = ($('gName').value.trim() || 'เกมไม่มีชื่อ').slice(0, 80);
    game.description = $('gDesc').value.trim().slice(0, 400);
    game.showAnswer = $('gShowAns').checked;
    game.itemCount = completeItems().length;
    game.updatedAt = Date.now();
    var first = items.filter(function (it) { return it.data.qImg || it.data.aImg; })[0];
    var coverSrc = first ? (first.data.qImg || first.data.aImg) : '';
    var p = coverSrc && coverSrc !== game._coverFrom ? thumb(coverSrc, 160).then(function (t) { game.cover = t; game._coverFrom = coverSrc; }).catch(function () { }) : Promise.resolve();
    if (!coverSrc) delete game.cover;
    return p.then(function () {
      var out = {}; Object.keys(game).forEach(function (k) { if (k.charAt(0) !== '_') out[k] = game[k]; });
      return track(C.saveGame(gameId, out));
    }).then(renderStatus, renderStatus);
  }
  ['gName', 'gDesc'].forEach(function (id) { $(id).addEventListener('input', scheduleMeta); });
  $('gShowAns').addEventListener('change', scheduleMeta);

  function duplicates() {
    var seen = {}, dup = [];
    items.forEach(function (it, i) {
      var d = it.data; if (!complete(d)) return;
      var k = d.aImg ? 'img:' + d.aImg.length + ':' + d.aImg.slice(-40) + '|' + (d.aText || '').toLowerCase() : 'txt:' + d.aText.trim().toLowerCase();
      if (seen[k]) dup.push('ข้อ ' + seen[k] + ' กับ ข้อ ' + (i + 1)); else seen[k] = i + 1;
    });
    return dup;
  }
  function renderStatus() {
    if (!game) return;
    var n = completeItems().length, inc = items.length - n, min = B.MIN_CHARACTERS, dup = duplicates();
    var pub = game.status === 'published';
    var html = '<div class="progress"><div style="width:' + Math.min(100, Math.round(n / min * 100)) + '%"></div></div>' +
      '<div class="small">มีข้อที่ครบแล้ว <b>' + n + '</b> ข้อ' + (n < min ? ' · ต้องมีอีก <b>' + (min - n) + '</b> ข้อจึงจะเล่นได้' : ' · พร้อมเล่น ✓') +
      (inc ? ' · <span class="warn-t">ยังไม่ครบ ' + inc + ' ข้อ (ต้องมีทั้งโจทย์และคำตอบ)</span>' : '') + ' · สูงสุด ' + B.MAX_CHARACTERS + ' ข้อ</div>';
    if (dup.length) html += '<div class="small warn-t">⚠ คำตอบซ้ำกัน: ' + esc(dup.join(', ')) + ' — ผู้เล่นจะสับสน ควรแก้ให้ต่างกัน</div>';
    html += '<div class="small" style="margin-top:.3rem">สถานะ: ' + (pub ? '<b class="ok-t">เผยแพร่แล้ว</b> — ขึ้นในรายชื่อเกมบนจอพิธีกร' : '<b>ฉบับร่าง</b> — ยังไม่ขึ้นในรายชื่อ (เปิดด้วยปุ่ม “เปิดจอพิธีกร” ได้)') + '</div>';
    $('gStatus').innerHTML = html;
    $('btnPublish').textContent = pub ? 'ยกเลิกการเผยแพร่' : 'เผยแพร่เกม';
    $('btnPublish').classList.toggle('secondary', pub);
    $('btnAdd').disabled = items.length >= B.MAX_CHARACTERS;
    $('items').querySelectorAll('.item').forEach(function (el, i) { el.querySelector('.inum').textContent = 'ข้อ ' + (i + 1); });
  }

  // ---------- รายการข้อ ----------
  function sideHtml(it, side) {
    var d = it.data, img = d[side + 'Img'], txt = d[side + 'Text'] || '';
    var isQ = side === 'q';
    return '<div class="side ' + side + '">' +
      '<div class="lbl"><span class="tag ' + side + '">' + (isQ ? 'โจทย์' : 'คำตอบ') + '</span> <span class="muted small">' + (isQ ? 'ขึ้นจอใหญ่' : 'อยู่บนบัตร') + '</span></div>' +
      '<button type="button" class="pic' + (img ? ' has' : '') + '" data-pick="' + side + '" aria-label="' + (img ? 'เปลี่ยนรูป' : 'เพิ่มรูป') + '">' +
        (img ? '<img alt="" src="' + esc(img) + '">' : '<span>📷<br>เพิ่มรูป</span>') + '</button>' +
      (img ? '<button type="button" class="btn ghost tiny" data-clear="' + side + '">ลบรูป</button>' : '') +
      '<input class="input" data-text="' + side + '" maxlength="' + (isQ ? 200 : 60) + '" value="' + esc(txt) + '" placeholder="' +
        (isQ ? 'พิมพ์โจทย์ (ไม่ต้องพิมพ์ถ้ามีรูป)' : 'พิมพ์คำตอบ (ไม่ต้องพิมพ์ถ้ามีรูป)') + '">' +
      '</div>';
  }
  function itemHtml(it, i) {
    var ok = complete(it.data);
    return '<div class="item' + (ok ? '' : ' incomplete') + '" data-id="' + esc(it.id) + '">' +
      '<div class="ihead"><b class="inum">ข้อ ' + (i + 1) + '</b><span class="ist">' + (ok ? '✓ ครบ' : 'ใส่โจทย์และคำตอบให้ครบ') + '</span><span class="grow"></span>' +
      '<button type="button" class="btn ghost tiny" data-del>ลบข้อนี้</button></div>' +
      '<div class="sides">' + sideHtml(it, 'q') + '<div class="arrow">→</div>' + sideHtml(it, 'a') + '</div></div>';
  }
  function renderItems() { $('items').innerHTML = items.map(itemHtml).join(''); }
  function rerenderItem(it) {
    var el = $('items').querySelector('.item[data-id="' + it.id + '"]'); if (!el) return;
    var i = items.indexOf(it), tmp = document.createElement('div'); tmp.innerHTML = itemHtml(it, i);
    el.replaceWith(tmp.firstChild);
  }
  function findItem(el) { var box = el.closest('.item'); if (!box) return null; return items.filter(function (x) { return x.id === box.dataset.id; })[0] || null; }

  var itemTimers = {};
  function saveItemNow(it) {
    clearTimeout(itemTimers[it.id]); delete itemTimers[it.id];
    return track(C.saveItem(gameId, it.id, it.data)).then(function () { scheduleMeta(); }, function () { });
  }
  function scheduleItem(it) { clearTimeout(itemTimers[it.id]); itemTimers[it.id] = setTimeout(function () { saveItemNow(it); }, 700); }
  function flushAll() {
    var ps = Object.keys(itemTimers).map(function (id) { var it = items.filter(function (x) { return x.id === id; })[0]; return it ? saveItemNow(it) : null; });
    if (metaTimer) ps.push(saveMeta());
    return Promise.all(ps).catch(function () { });
  }

  $('items').addEventListener('input', function (e) {
    var side = e.target.dataset.text; if (!side) return;
    var it = findItem(e.target); if (!it) return;
    it.data[side + 'Text'] = e.target.value.slice(0, side === 'q' ? 200 : 60);
    var box = e.target.closest('.item'), ok = complete(it.data);
    box.classList.toggle('incomplete', !ok); box.querySelector('.ist').textContent = ok ? '✓ ครบ' : 'ใส่โจทย์และคำตอบให้ครบ';
    scheduleItem(it); renderStatus();
  });
  var pickTarget = null;
  $('items').addEventListener('click', function (e) {
    var it = findItem(e.target); if (!it) return;
    var pick = e.target.closest('[data-pick]'), clear = e.target.closest('[data-clear]');
    if (pick) { pickTarget = { it: it, side: pick.dataset.pick }; $('oneFile').click(); return; }
    if (clear) { it.data[clear.dataset.clear + 'Img'] = ''; rerenderItem(it); saveItemNow(it); renderStatus(); return; }
    if (e.target.closest('[data-del]')) {
      UI.confirm('ลบข้อ ' + (items.indexOf(it) + 1) + '?', '<p>ลบโจทย์และคำตอบของข้อนี้</p>', 'ลบ', 'danger').then(function (ok) {
        if (!ok) return;
        clearTimeout(itemTimers[it.id]); delete itemTimers[it.id];
        track(C.deleteItem(gameId, it.id)).then(function () {
          items = items.filter(function (x) { return x !== it; });
          var el = $('items').querySelector('.item[data-id="' + it.id + '"]'); if (el) el.remove();
          renderStatus(); scheduleMeta();
        }, function () { });
      });
    }
  });
  $('oneFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    var t = pickTarget; pickTarget = null;
    if (!f || !t) return;
    var isQ = t.side === 'q';
    track(processImage(f, isQ ? Q_MAX : A_MAX, isQ ? Q_LEN : A_LEN)).then(function (url) {
      t.it.data[t.side + 'Img'] = url; rerenderItem(t.it); renderStatus();
      return saveItemNow(t.it);
    }, function (e) { UI.toast('ใช้รูปนี้ไม่ได้: ' + (e.message || e), 4000); });
  });

  function maxOrder() { return items.reduce(function (m, it) { return Math.max(m, it.data.order || 0); }, 0); }
  function newItem(data) {
    var it = { id: 'i' + C.newId(9), data: Object.assign({ order: maxOrder() + 1, qText: '', aText: '', qImg: '', aImg: '' }, data || {}) };
    items.push(it);
    var tmp = document.createElement('div'); tmp.innerHTML = itemHtml(it, items.length - 1); $('items').appendChild(tmp.firstChild);
    renderStatus();
    return it;
  }
  $('btnAdd').addEventListener('click', function () {
    if (items.length >= B.MAX_CHARACTERS) return;
    var it = newItem(); saveItemNow(it);
    var el = $('items').lastElementChild; el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    var inp = el.querySelector('[data-text="q"]'); if (inp) setTimeout(function () { inp.focus({ preventScroll: true }); }, 350);
  });

  // ---------- เพิ่มหลายรูปพร้อมกัน ----------
  $('bulkFiles').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files); this.value = '';
    if (!files.length) return;
    var room = B.MAX_CHARACTERS - items.length;
    if (room <= 0) { UI.toast('ครบ ' + B.MAX_CHARACTERS + ' ข้อแล้ว'); return; }
    if (files.length > room) { UI.toast('เพิ่มได้อีก ' + room + ' ข้อ — ใช้ ' + room + ' รูปแรก', 3500); files = files.slice(0, room); }
    UI.modal({
      title: 'ใช้ ' + files.length + ' รูปนี้เป็นอะไร?',
      html: '<p class="small">แต่ละรูปจะกลายเป็น 1 ข้อใหม่ แล้วค่อยพิมพ์อีกฝั่งทีหลังได้</p>',
      buttons: [{ label: 'ยกเลิก', value: null, cls: 'ghost' }, { label: 'เป็นคำตอบบนบัตร', value: 'a', cls: 'secondary' },
        { label: 'เป็นโจทย์บนจอใหญ่', value: 'q', cls: 'secondary' }, { label: 'ทั้งโจทย์และคำตอบ (รูปเดียวกัน)', value: 'both' }]
    }).then(function (mode) {
      if (!mode) return;
      var chain = Promise.resolve(), done = 0;
      files.forEach(function (f) {
        chain = chain.then(function () {
          var jobs = [];
          if (mode === 'q' || mode === 'both') jobs.push(processImage(f, Q_MAX, Q_LEN)); else jobs.push(Promise.resolve(''));
          if (mode === 'a' || mode === 'both') jobs.push(processImage(f, A_MAX, A_LEN)); else jobs.push(Promise.resolve(''));
          return Promise.all(jobs).then(function (r) {
            var it = newItem({ qImg: r[0], aImg: r[1] }); done++;
            $('saveState').textContent = 'กำลังเพิ่มรูป ' + done + '/' + files.length + '…';
            return saveItemNow(it);
          }, function (e) { UI.toast(f.name + ': ' + (e.message || e), 3000); });
        });
      });
      return track(chain).then(function () { UI.toast('เพิ่ม ' + done + ' ข้อแล้ว'); });
    });
  });

  // ---------- ย่อรูป ----------
  function loadImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { rej(new Error('เปิดไฟล์รูปไม่ได้')); }; im.src = src; });
  }
  function encode(im, side, type, q) {
    var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, side / Math.max(w, h));
    var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    var ctx = cv.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    return cv.toDataURL(type, q);
  }
  function processImage(file, side, maxLen) {
    if (!/^image\//.test(file.type)) return Promise.reject(new Error('ไม่ใช่ไฟล์รูป'));
    var url = URL.createObjectURL(file);
    return loadImg(url).then(function (im) {
      URL.revokeObjectURL(url);
      var webp = encode(im, 16, 'image/webp', .8).indexOf('data:image/webp') === 0;
      var type = webp ? 'image/webp' : 'image/jpeg';
      var s = side, out = '';
      for (var tries = 0; tries < 8; tries++) {
        out = encode(im, s, type, tries < 2 ? .85 - tries * .15 : .6);
        if (out.length <= maxLen) return out;
        s = Math.round(s * .8);
      }
      throw new Error('รูปใหญ่เกินไป');
    });
  }
  function thumb(src, side) { return loadImg(src).then(function (im) { var o = encode(im, side, 'image/webp', .7); return o.indexOf('data:image/webp') === 0 ? o : encode(im, side, 'image/jpeg', .7); }); }

  // ---------- ปุ่มด้านล่าง ----------
  $('btnPreview').addEventListener('click', function () {
    var ok = completeItems();
    if (ok.length < B.CELLS) { UI.toast('ต้องมีข้อที่ครบอย่างน้อย ' + B.CELLS + ' ข้อจึงจะดูตัวอย่างบัตรได้', 3500); return; }
    var t = C.toTheme(gameId, game, ok), m = B.charMap(t);
    var cells = B.generateCard(t, B.randomPhoneCardNumber());
    UI.modal({
      title: 'ตัวอย่างบัตร (สุ่ม 16 จาก ' + ok.length + ' ข้อ)', wide: true,
      html: '<div class="grid4 preview">' + cells.map(function (id) { return '<div class="cell">' + B.cellInner(t, m[id]) + '</div>'; }).join('') + '</div>' +
        '<p class="small muted center">บัตรของผู้เล่นแต่ละคนจะสุ่มคำตอบและตำแหน่งต่างกัน</p>',
      onOpen: function (el) { B.fitWords(el.querySelector('.grid4')); }
    });
  });
  $('btnPublish').addEventListener('click', function () {
    if (game.status === 'published') { game.status = 'draft'; saveMeta().then(function () { UI.toast('ยกเลิกการเผยแพร่แล้ว'); }); return; }
    var n = completeItems().length, inc = items.length - n, dup = duplicates(), probs = [];
    if (n < B.MIN_CHARACTERS) probs.push('ต้องมีข้อที่ครบอย่างน้อย ' + B.MIN_CHARACTERS + ' ข้อ (ตอนนี้ ' + n + ' ข้อ)');
    if (inc) probs.push('มี ' + inc + ' ข้อที่ยังไม่ครบ — เติมให้ครบหรือลบทิ้ง');
    if (dup.length) probs.push('คำตอบซ้ำกัน: ' + dup.join(', '));
    if (!$('gName').value.trim()) probs.push('ยังไม่ได้ตั้งชื่อเกม');
    if (probs.length) { UI.modal({ title: 'ยังเผยแพร่ไม่ได้', html: '<ul>' + probs.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' }); return; }
    game.status = 'published';
    flushAll().then(saveMeta).then(function () {
      UI.modal({ title: 'เผยแพร่แล้ว 🎉', html: '<p>เกม “' + esc(game.name) + '” ขึ้นในรายชื่อเกมบนจอพิธีกรแล้ว</p><p class="small muted">กด “เปิดจอพิธีกร” เพื่อเริ่มเล่น แล้วให้ผู้เล่นสแกน “QR เข้าเกม” บนจอ</p>' });
    });
  });
  $('lnkHost').addEventListener('click', function (e) {
    if (completeItems().length < B.MIN_CHARACTERS) { e.preventDefault(); UI.toast('ต้องมีข้อที่ครบอย่างน้อย ' + B.MIN_CHARACTERS + ' ข้อก่อนเปิดเล่น', 3500); return; }
    flushAll();
  });
  $('btnDelete').addEventListener('click', function () {
    UI.confirm('ลบเกม “' + game.name + '”?', '<p>ลบทุกข้อในเกมนี้ถาวร กู้คืนไม่ได้</p>', 'ลบเกม', 'danger').then(function (ok) {
      if (!ok) return;
      Object.keys(itemTimers).forEach(function (k) { clearTimeout(itemTimers[k]); }); itemTimers = {}; clearTimeout(metaTimer); metaTimer = null;
      track(C.deleteGame(gameId)).then(function () { game = null; gameId = null; UI.toast('ลบเกมแล้ว'); showList(); }, function () { });
    });
  });

  window.__create = { items: function () { return items; }, game: function () { return game; }, pending: function () { return pending + (metaTimer ? 1 : 0) + Object.keys(itemTimers).length; } };
})();
