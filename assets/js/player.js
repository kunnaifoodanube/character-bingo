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
      draws: (data.draws || []).filter(function (id) { return chars[id]; }), at: Date.now(),
      timer: source === 'live' ? (+data.timer || 0) : 0,
      swin: source === 'live' && data.swin && data.swin.id ? { id: String(data.swin.id), sec: Math.max(1, Math.min(60, +data.swin.sec || 10)) } : null,
      shownAt: +data.shownAt || 0, roomId: state.room || data._roomId || (SY && SY.roomId) || null };
    store.set(SKEY, SY);
    // ยังไม่ได้แตะอะไร → ใช้รอบปัจจุบันของพิธีกรได้เลย (เช่น เพิ่งเปิดบัตร หรือจอพิธีกรเปลี่ยนรอบ/เปลี่ยนเครื่อง)
    if (!state.roundId || (state.roundId !== SY.roundId && !state.marks.length)) { state.roundId = SY.roundId; save(); }
    updateSeen();
    noteSwin();
    render();
    startShuffleWatch();
    schedulePlayerPush();
  }

  // ---------- จับเวลาแตะ ----------
  // state.seen = { roundId, init, at: {รหัสคำ: เวลาที่เครื่องนี้เห็นคำนั้นครั้งแรก (ms)} } — 1 = เรียกก่อนเข้าร่วม (หมดเวลาแล้ว)
  function updateSeen() {
    if (!SY || SY.source !== 'live' || state.roundId !== SY.roundId) return;
    if (!state.seen || state.seen.roundId !== SY.roundId) state.seen = { roundId: SY.roundId, init: false, at: {} };
    var at = state.seen.at, now = Date.now(), first = !state.seen.init, last = SY.draws[SY.draws.length - 1], changed = first;
    SY.draws.forEach(function (id) {
      if (at[id]) return;
      changed = true;
      if (first && id !== last) at[id] = 1;
      else if (first && SY.shownAt) at[id] = Math.min(now, SY.shownAt);
      else at[id] = now;
    });
    state.seen.init = true;
    if (changed) save();
  }
  function timed() { return fresh() && SY.timer > 0 && state.roundId === SY.roundId && !!state.seen && state.seen.roundId === SY.roundId; }
  function leftMs(id) {
    var t = state.seen && state.seen.at[id];
    if (!t) return SY.timer * 1000;
    return SY.timer * 1000 - (Date.now() - t);
  }
  var tbTimer = null;
  function renderTimeBar() {
    var bar = $('timeBar');
    if (!timed()) { bar.classList.add('hidden'); clearInterval(tbTimer); tbTimer = null; return; }
    var last = SY.draws[SY.draws.length - 1], c = last && chars[last];
    var left = last ? leftMs(last) : 0;
    var markedIds = {}; state.marks.forEach(function (i) { markedIds[state.cells[i]] = true; });
    var anyActive = SY.draws.some(function (id) { var l = leftMs(id); return l > 0 && l <= SY.timer * 1000 + 1000; });
    if (!c || left <= 0) bar.classList.add('hidden');
    else {
      bar.classList.remove('hidden');
      bar.innerHTML = markedIds[last]
        ? '✓ แตะ “' + esc(c.name) + '” ทันเวลาแล้ว'
        : '⏱ เหลือ ' + Math.ceil(left / 1000) + ' วินาที — มี “' + esc(c.name) + '” ในบัตรไหม? หาให้เจอแล้วแตะ!' +
          '<div class="tb-track"><div class="tb-fill" style="transform:scaleX(' + Math.max(0, Math.min(1, left / (SY.timer * 1000))).toFixed(3) + ')"></div></div>';
    }
    if (anyActive && !tbTimer) tbTimer = setInterval(function () { renderTimeBar(); renderCellsOnly(); }, 200);
    if (!anyActive && tbTimer) { clearInterval(tbTimer); tbTimer = null; }
  }

  // ---------- ส่งข้อมูลบัตรขึ้นระบบ (ให้พิธีกรตรวจตามตำแหน่งจริง + ให้เพื่อนเลือกสลับบัตรได้) ----------
  var pushTimer = null, myUid = null, lastPushSig = '', lastPushAt = 0;
  function canPush() { return Sync.enabled() && state && SY && !SY.mismatch && SY.source === 'live' && SY.roomId && state.roundId === SY.roundId; }
  function schedulePlayerPush() {
    if (!canPush() || pushTimer) return; // มีรอส่งอยู่แล้ว (ไม่เลื่อนออกไปเรื่อย ๆ)
    pushTimer = setTimeout(function () { pushTimer = null; pushPlayer(); }, 600);
  }
  function pushPlayer() {
    if (!canPush()) return;
    var room = SY.roomId;
    var data = {
      v: 1, name: state.name, code: state.code, roundId: state.roundId, cells: state.cells.slice(),
      marked: state.marks.map(function (i) { return state.cells[i]; }), timed: timed(),
      shuffledBy: (state.shuffledBy || []).slice(-20)
    };
    if (state.shuf && state.shuf.roundId === state.roundId) { // ผลการรับคำสลับจากเพื่อน (ให้ผู้สลับรู้ว่าสำเร็จหรือช้าไป)
      data.hitBy = (state.shuf.hits || []).slice(0, MAX_HITS);
      data.blocked = (state.shuf.blocked || []).slice(-30);
    }
    var sig = room + '|' + JSON.stringify(data);
    if (sig === lastPushSig && Date.now() - lastPushAt < 10 * 60 * 1000) return; // ไม่มีอะไรเปลี่ยน → ไม่เขียนซ้ำ (ประหยัดโควตาฟรี)
    data.updatedAt = Date.now();
    Sync.uid().then(function (uid) {
      myUid = uid;
      return Sync.putDoc(['rooms', room, 'players', uid], data);
    }).then(function () { lastPushSig = sig; lastPushAt = Date.now(); })
      .catch(function () { /* ยังไม่ได้ตั้งกฎ Firebase สำหรับผู้เล่น — เล่นต่อได้ตามปกติ */ });
  }

  // ---------- สลับบัตร (คนละ 1 ครั้งต่อรอบ) ----------
  var unwatchShuffle = null, watchedShuffleRoom = null;
  // ใช้สิทธิ์ได้เฉพาะตอนพิธีกรเปิด "ช่วงสลับบัตร" · ไม่ใช้ = เก็บสิทธิ์ไว้ช่วงถัดไปในรอบเดียวกัน
  // เพื่อนสลับบัตรคนหนึ่งได้ไม่เกิน MAX_HITS ครั้งต่อรอบ (สลับบัตรตัวเองไม่นับ) · คำสลับที่เกินโควตา → คนสลับได้สิทธิ์คืน
  // หน้าจอ: แถบ "🔀 สลับบัตร" เหนือบัตร (เห็นตลอด) + หน้าต่างเลือกที่เด้งขึ้นเองเมื่อพิธีกรเปิดช่วงสลับ
  var MAX_HITS = 2, lastShufList = [];
  function shuffleState() {
    if (!state.shuf || state.shuf.roundId !== state.roundId) state.shuf = { roundId: state.roundId, used: false, applied: [], hits: [], blocked: [], retry: 0 };
    var sh = state.shuf; sh.hits = sh.hits || []; sh.blocked = sh.blocked || []; sh.retry = sh.retry || 0;
    return sh;
  }
  function baseRound(r) { return String(r || '').split('~')[0]; }
  /** รหัสรอบที่ใช้ตั้งชื่อคำสลับครั้งนี้ (ได้สิทธิ์คืน → ต่อท้าย ~1, ~2 เพื่อสร้างเอกสารใหม่ได้ตามกฎ Firebase เดิม) */
  function shotRound() { var sh = shuffleState(); return state.roundId + (sh.retry ? '~' + sh.retry : ''); }
  /** นับว่าเพื่อนแต่ละคนโดนเพื่อนสลับไปแล้วกี่ครั้งในรอบนี้ (จากคำสลับที่เห็นในระบบ) */
  function hitCounts() {
    var m = {};
    lastShufList.forEach(function (it) {
      var d = it.data || {};
      if (baseRound(d.roundId) !== state.roundId || !d.target || d.from === d.target) return;
      m[d.target] = (m[d.target] || 0) + 1;
    });
    return m;
  }
  /** แฮชข้อความเป็นตัวเลข (FNV-1a) ใช้สุ่มลำดับรายชื่อแบบคงที่ */
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /** จุดแสดงจำนวนครั้งที่โดนสลับ ●●○ */
  function dots(n) {
    var s = '<span class="dots" aria-hidden="true">';
    for (var i = 0; i < MAX_HITS; i++) s += '<i' + (i < n ? ' class="on"' : '') + '></i>';
    return s + '</span>';
  }
  /** จำเวลาที่เครื่องนี้เห็นช่วงสลับบัตรครั้งแรก (นับถอยหลังด้วยนาฬิกาเครื่องตัวเอง ไม่ขึ้นกับนาฬิกาจอพิธีกร) */
  function noteSwin() {
    if (!SY || !SY.swin || !state || state.roundId !== SY.roundId) return;
    if (!state.swinSeen || state.swinSeen.id !== SY.swin.id) {
      state.swinSeen = { id: SY.swin.id, at: Date.now() };
      var sh = shuffleState(); sh.seenWin = true;
      save();
      if (!liveOk()) return;
      if (navigator.vibrate) { try { navigator.vibrate([60, 40, 60]); } catch (e) { /* */ } }
      if (!sh.used) openPicker(); // เด้งหน้าต่างเลือกขึ้นมาเองทันที
      else UI.toast('🔀 พิธีกรเปิดช่วงสลับบัตร — คุณใช้สิทธิ์รอบนี้ไปแล้ว', 3000);
    }
  }
  function swinLeft() {
    if (!SY || !SY.swin || !state || !state.swinSeen || state.swinSeen.id !== SY.swin.id || state.roundId !== SY.roundId) return 0;
    return SY.swin.sec * 1000 - (Date.now() - state.swinSeen.at);
  }
  function liveOk() { return canPush() && fresh(); }
  function swinOpenNow() { return liveOk() && swinLeft() > 0; }
  function shuffleOn() { return liveOk() && (swinLeft() > 0 || !!shuffleState().seenWin); }
  function startShuffleWatch() {
    if (!shuffleOn()) { if (unwatchShuffle) { unwatchShuffle(); unwatchShuffle = null; watchedShuffleRoom = null; } return; }
    if (watchedShuffleRoom === SY.roomId) return;
    if (unwatchShuffle) unwatchShuffle();
    watchedShuffleRoom = SY.roomId;
    Sync.uid().then(function (uid) {
      myUid = uid;
      unwatchShuffle = Sync.watchCollection(['rooms', SY.roomId, 'shuffles'], function (list) {
        if (!state) return;
        lastShufList = list;
        var sh = shuffleState(), changed = false;
        list.forEach(function (it) {
          var d = it.data || {};
          if (baseRound(d.roundId) !== state.roundId) return;
          if (it.id === shotRound() + '_' + uid && !sh.used) { sh.used = true; changed = true; }
          if (d.target !== uid || sh.applied.indexOf(it.id) >= 0 || sh.hits.indexOf(it.id) >= 0 || sh.blocked.indexOf(it.id) >= 0) return;
          changed = true;
          if (d.from === uid) { sh.applied.push(it.id); applyShuffle(+d.seed || 1, null); return; }
          if (sh.hits.length >= MAX_HITS) { sh.blocked.push(it.id); return; } // โดนครบแล้ว → ไม่สลับ (คนสลับได้สิทธิ์คืน)
          sh.hits.push(it.id);
          applyShuffle(+d.seed || 1, String(d.fromName || 'เพื่อน').slice(0, 24));
        });
        if (changed) { save(); renderShuffleBtn(); schedulePlayerPush(); }
        renderPicker(); // จำนวนครั้งที่เพื่อนแต่ละคนโดนสลับเปลี่ยน
      }, function () { /* */ });
    }).catch(function () { /* */ });
  }
  function applyShuffle(seed, byName) {
    var markedIds = state.marks.map(function (i) { return state.cells[i]; });
    var cells = state.cells.slice(), rng = B.mulberry32(seed >>> 0);
    for (var i = cells.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = cells[i]; cells[i] = cells[j]; cells[j] = t; }
    if (cells.join('|') === state.cells.join('|')) cells.push(cells.shift());
    state.cells = cells;
    state.marks = markedIds.map(function (id) { return cells.indexOf(id); }).filter(function (i) { return i >= 0; });
    state.shuffledBy = (state.shuffledBy || []).concat([byName || 'ตัวเอง']);
    save();
    var grid = $('grid'); grid.innerHTML = ''; render();
    grid.classList.remove('shuffling'); void grid.offsetWidth; grid.classList.add('shuffling');
    var bar = $('btnShuffle'); bar.classList.remove('hitflash'); void bar.offsetWidth;
    if (byName) { bar.classList.add('hitflash'); setTimeout(function () { bar.classList.remove('hitflash'); }, 1000); }
    var nh = shuffleState().hits.length;
    UI.toast(byName ? '🔀 ' + byName + ' สลับบัตรของคุณ! (โดนเพื่อนสลับ ' + nh + '/' + MAX_HITS + ')' : '🔀 สลับตำแหน่งบัตรของคุณแล้ว', 3500);
    if (navigator.vibrate) { try { navigator.vibrate([80, 40, 80, 40, 80]); } catch (e) { /* */ } }
    schedulePlayerPush();
    renderPicker();
  }

  // แถบสถานะเหนือบัตร: สิทธิ์ของฉัน 1/1 · โดนเพื่อนสลับ n/2 · แตะเพื่อเปิดหน้าต่างเลือก (เฉพาะตอนเปิดช่วงสลับ)
  var swTick = null, wasOpen = false;
  function renderShuffleBtn() {
    var b = $('btnShuffle');
    var open = swinOpenNow();
    if (open && !swTick) swTick = setInterval(renderShuffleBtn, 250);
    if (!open && swTick) { clearInterval(swTick); swTick = null; }
    if (wasOpen && !open) closeShufflePicker();
    wasOpen = open;
    if (!Sync.enabled() || !state) { b.classList.add('hidden'); return; }
    var live = liveOk(), sh = shuffleState(), used = !!sh.used, nh = Math.min(MAX_HITS, sh.hits.length);
    var left = Math.max(0, Math.ceil(swinLeft() / 1000)), st;
    if (!live) st = (syncValid() && state.roundId && SY.roundId !== state.roundId) ? 'เลือกเล่นรอบใหม่ก่อน' : 'ใช้ได้เมื่อเชื่อมกับจอพิธีกร';
    else if (open && !used) st = 'เปิดแล้ว! เหลือ ' + left + ' วิ · แตะเพื่อเลือก';
    else if (open) st = 'ช่วงสลับเหลือ ' + left + ' วิ · ใช้สิทธิ์แล้ว';
    else if (!used) st = 'รอพิธีกรเปิดช่วงสลับ';
    else st = 'ใช้สิทธิ์รอบนี้แล้ว';
    b.disabled = !(open && !used);
    b.classList.toggle('on', open && !used);
    b.classList.toggle('off', !live);
    b.classList.toggle('full', nh >= MAX_HITS);
    b.setAttribute('aria-label', 'สลับบัตร: ' + st + ' · สิทธิ์ของฉัน ' + (used ? 0 : 1) + ' ใน 1 · โดนเพื่อนสลับ ' + nh + ' ใน ' + MAX_HITS);
    b.innerHTML = '<span class="sb-top"><span class="sb-t">🔀 สลับบัตร</span><span class="sb-st">' + esc(st) + '</span></span>' +
      '<span class="sb-chips">' +
        '<span class="chip me' + (used ? ' used' : '') + '">สิทธิ์ของฉัน <b>' + (used ? 0 : 1) + '/1</b></span>' +
        '<span class="chip hit h' + nh + '">โดนเพื่อนสลับ <b>' + nh + '/' + MAX_HITS + '</b>' + dots(nh) + '</span>' +
      '</span>';
    b.classList.remove('hidden');
    renderPicker();
  }

  // ---------- หน้าต่างเลือกว่าจะสลับบัตรของใคร (นับถอยหลังตามช่วงสลับที่พิธีกรเปิด) ----------
  var picker = null; // { el, sel:{t, n, self}, list:[ผู้เล่น], loaded, stop, sig, timedOut, centered }
  function openPicker() {
    if (picker || !swinOpenNow() || shuffleState().used) return;
    var room = SY.roomId, roundId = state.roundId;
    var p = picker = { el: null, sel: null, list: [], loaded: false, stop: null, sig: '', timedOut: false };
    Sync.uid().then(function (uid) { myUid = uid; renderPicker(); }).catch(function () { /* */ });
    // ติดตามรายชื่อเพื่อนเฉพาะตอนหน้าต่างเปิดอยู่ (ประหยัดโควตาฟรี)
    p.stop = Sync.watchCollection(['rooms', room, 'players'], function (list) {
      if (picker !== p) return; p.list = list; p.loaded = true; renderPicker();
    }, function () { if (picker !== p) return; p.loaded = true; renderPicker(); });
    UI.modal({
      title: '🔀 สลับบัตรได้แล้ว!', dismissable: false,
      html: '<div class="sp-timer" role="timer" aria-live="off"><div class="sp-n">' + Math.max(0, Math.ceil(swinLeft() / 1000)) + '</div>' +
          '<div class="sp-track"><div class="sp-fill"></div></div><div class="sp-hint">วินาที — คิดให้ดีแล้วเลือกว่าจะสลับบัตรของใคร</div></div>' +
        '<div class="sp-me"></div>' +
        '<div class="sp-pick">แตะชื่อเพื่อนที่จะสลับบัตร หรือบัตรของฉันเอง <span>(ลำดับชื่อสุ่ม ไม่เหมือนกันทุกเครื่อง)</span></div>' +
        '<div class="shuffle-list" role="radiogroup" aria-label="เลือกบัตรที่จะสลับ"></div>' +
        '<p class="small muted sp-rule">สลับ = ย้ายตำแหน่งคำในบัตร (คำเดิม ช่องที่แตะแล้วยังอยู่) · สิทธิ์ 1 ครั้งต่อรอบ · โดนเพื่อนสลับได้ไม่เกิน ' + MAX_HITS + ' ครั้ง · ไม่สลับ = เก็บสิทธิ์ไว้ช่วงหน้า</p>',
      buttons: [
        { label: 'เก็บสิทธิ์ไว้ก่อน', value: null, cls: 'ghost' },
        { label: 'แตะเลือกชื่อก่อน', cls: 'sp-go', getValue: function () {
          if (!p.sel) { UI.toast('แตะเลือกบัตรที่จะสลับก่อน'); return undefined; }
          return p.sel;
        } }
      ],
      onOpen: function (el) { p.el = el; el.classList.add('sp-back'); renderPicker(); }
    }).then(function (ch) {
      if (p.stop) p.stop();
      if (picker === p) picker = null;
      if (ch) doShuffle(ch, room, roundId);
      else if (p.timedOut) UI.toast('หมดเวลาสลับบัตร — สิทธิ์ยังอยู่ ใช้ได้ในช่วงสลับครั้งหน้า', 3500);
      else if (swinOpenNow()) UI.toast('เก็บสิทธิ์ไว้แล้ว — เปลี่ยนใจได้ แตะแถบ 🔀 เหนือบัตรก่อนหมดเวลา', 3500);
      renderShuffleBtn();
    });
  }
  function renderPicker() {
    var p = picker;
    if (!p || !p.el || !state) return;
    var el = p.el, sec = (SY && SY.swin && SY.swin.sec) || 30, ms = Math.max(0, swinLeft()), left = Math.ceil(ms / 1000);
    var n = el.querySelector('.sp-n'); n.textContent = left; n.classList.toggle('urgent', left <= 5);
    el.querySelector('.sp-fill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, ms / (sec * 1000))).toFixed(3) + ')';
    var nh = Math.min(MAX_HITS, shuffleState().hits.length);
    el.querySelector('.sp-me').innerHTML = '<span>สิทธิ์ของฉัน <b>1/1</b></span><span>โดนเพื่อนสลับ <b>' + nh + '/' + MAX_HITS + '</b>' + dots(nh) + '</span>';

    var box = el.querySelector('.shuffle-list'), uid = myUid, now = Date.now();
    var items = [], self = null;
    if (uid) {
      self = { t: uid, n: state.name, self: true };
      var hc = hitCounts(), names = {};
      // ลำดับรายชื่อสุ่มแยกแต่ละเครื่อง (ไม่เรียงตามชื่อ) — ไม่มีใครเสียเปรียบเพราะอยู่บนสุดของทุกเครื่อง
      // ใช้ค่าแฮชของ (เครื่องนี้ + ช่วงสลับนี้ + เพื่อน) → ลำดับคงที่ตลอดช่วงสลับ คนที่เข้ามาใหม่แทรกตำแหน่งสุ่ม
      var salt = uid + '|' + ((state.swinSeen && state.swinSeen.id) || '') + '|';
      var others = p.list.filter(function (x) { var d = x.data || {}; return x.id !== uid && d.roundId === state.roundId && now - (d.updatedAt || 0) < 3 * 3600 * 1000; })
        .sort(function (a, b) { return hashStr(salt + a.id) - hashStr(salt + b.id); })
        .map(function (x) {
          var h = Math.min(MAX_HITS, Math.max(hc[x.id] || 0, (x.data.hitBy || []).length));
          var nm = String(x.data.name || 'ผู้เล่น').slice(0, 24);
          names[nm] = (names[nm] || 0) + 1;
          return { t: x.id, n: nm, code: String(x.data.code || ''), h: h, full: h >= MAX_HITS };
        });
      others.forEach(function (it) { it.dup = names[it.n] > 1; }); // ชื่อซ้ำ → แสดงเลขบัตรช่วยแยก
      // บัตรของฉันอยู่แถวกลางของรายชื่อ (แถบเต็มความกว้าง เห็นชัด)
      var cols = 3;
      try { cols = getComputedStyle(box).gridTemplateColumns.split(' ').filter(Boolean).length || 3; } catch (e) { /* */ }
      var mid = Math.min(others.length, Math.round(others.length / 2 / cols) * cols);
      items = others.slice(0, mid).concat([self], others.slice(mid));
    }
    if (p.sel && !items.some(function (it) { return it.t === p.sel.t && !it.full; })) {
      if (p.sel && !p.sel.self) UI.toast((p.sel.n || 'เพื่อน') + ' โดนสลับครบ ' + MAX_HITS + ' ครั้งแล้ว — เลือกคนอื่น', 3000);
      p.sel = null;
    }
    var sig = JSON.stringify(items) + '|' + (p.sel ? p.sel.t : '') + '|' + p.loaded;
    if (sig !== p.sig) {
      p.sig = sig;
      var html = items.map(function (it, k) {
        var on = p.sel && p.sel.t === it.t;
        var attrs = ' role="radio" aria-checked="' + (on ? 'true' : 'false') + '" data-k="' + k + '"';
        if (it.self) {
          return '<button type="button" class="sp-item self' + (on ? ' sel' : '') + '"' + attrs + '>' +
            '<span class="sp-name">🙋 บัตรของฉันเอง</span><span class="sp-sub">' + esc(it.n) + ' · สลับตำแหน่งบัตรตัวเอง (ไม่นับเป็นโดนสลับ)</span></button>';
        }
        return '<button type="button" class="sp-item' + (on ? ' sel' : '') + (it.full ? ' full' : '') + '"' + (it.full ? ' disabled' : '') + attrs + '>' +
          '<span class="sp-name">' + esc(it.n) + '</span>' + (it.dup ? '<span class="sp-code mono">' + esc(it.code) + '</span>' : '') +
          '<span class="sp-hit h' + it.h + '">' + (it.full ? 'เต็มแล้ว ' : 'โดน ') + it.h + '/' + MAX_HITS + '</span></button>';
      }).join('');
      if (!uid) html = '<p class="small muted sp-empty">กำลังโหลด…</p>';
      else if (items.length === 1) html += '<p class="small muted sp-empty">' + (p.loaded ? 'ยังไม่มีเพื่อนที่ออนไลน์ในรอบนี้ — สลับบัตรตัวเองได้' : 'กำลังโหลดรายชื่อเพื่อน…') + '</p>';
      var keep = box.scrollTop;
      box.innerHTML = html;
      box.scrollTop = keep;
      Array.prototype.forEach.call(box.querySelectorAll('.sp-item'), function (btn) {
        btn.addEventListener('click', function () {
          var it = items[+btn.getAttribute('data-k')];
          if (!it || it.full) return;
          p.sel = { t: it.t, n: it.self ? '' : it.n, self: !!it.self };
          renderPicker();
        });
      });
    }
    if (p.loaded && uid && !p.centered) { // เลื่อนให้บัตรของฉันอยู่กลางกรอบตั้งแต่แรก
      var se = box.querySelector('.sp-item.self');
      if (se) { p.centered = true; box.scrollTop = Math.max(0, se.offsetTop - (box.clientHeight - se.offsetHeight) / 2); }
    }
    var go = el.querySelector('.actions .sp-go');
    if (go) {
      go.disabled = !p.sel;
      go.textContent = !p.sel ? 'แตะเลือกชื่อก่อน' : (p.sel.self ? '🔀 สลับบัตรของฉันเลย' : '🔀 สลับบัตรของ ' + p.sel.n);
    }
  }
  function closeShufflePicker() {
    var p = picker;
    if (!p || !p.el) return;
    p.timedOut = true;
    var c = p.el.querySelector('.actions .btn'); if (c) c.click();
  }
  $('btnShuffle').addEventListener('click', function () { if (swinOpenNow() && !shuffleState().used) openPicker(); });

  var shooting = false;
  function doShuffle(ch, room, roundId) {
    if (shooting || !state || state.roundId !== roundId || shuffleState().used) return;
    if (swinLeft() < -1500 || !liveOk()) { UI.toast('หมดเวลาสลับบัตรแล้ว — สิทธิ์ยังอยู่ ใช้ได้ในช่วงสลับครั้งหน้า', 3500); return; } // เผื่อเน็ตช้าเล็กน้อย
    shooting = true;
    Sync.uid().then(function (uid) {
      myUid = uid;
      var self = ch.t === uid;
      var seed = B.randomInt(1, 2147483646), sr = shotRound(), shotId = sr + '_' + uid;
      return Sync.putDoc(['rooms', room, 'shuffles', shotId], {
        roundId: sr, from: uid, fromName: state.name, target: ch.t, targetName: ch.n || state.name, seed: seed, at: Date.now()
      }, true).then(function () {
        var sh = shuffleState(); sh.used = true;
        if (self) { sh.applied.push(shotId); save(); applyShuffle(seed, null); }
        else { save(); UI.toast('🔀 สลับบัตรของ ' + ch.n + ' แล้ว!'); watchShotResult(room, ch, shotId, roundId); }
      }, function (e) {
        var denied = e && (e.code === 'permission-denied' || /permission/i.test(e.message || ''));
        if (denied) { shuffleState().used = true; save(); }
        UI.toast(denied ? 'ใช้สิทธิ์สลับบัตรไปแล้ว หรือระบบสลับบัตรยังไม่พร้อม — แจ้งอาจารย์' : 'สลับไม่สำเร็จ ลองใหม่อีกครั้ง', 4000);
      });
    }).catch(function () { UI.toast('เชื่อมต่อระบบไม่ได้ ลองใหม่อีกครั้ง'); })
      .then(function () { shooting = false; renderShuffleBtn(); });
  }
  /** รอดูผลจากเครื่องเพื่อน ~10 วิ: ถ้าเพื่อนโดนสลับครบโควตาไปก่อน (กดพร้อมกันหลายคน) → คืนสิทธิ์ให้เลือกใหม่ */
  function watchShotResult(room, ch, shotId, roundId) {
    var done = false, stop = null;
    var finish = function () { done = true; if (stop) { stop(); stop = null; } };
    stop = Sync.watchCollection(['rooms', room, 'players'], function (list) {
      if (done) return;
      var p = list.filter(function (x) { return x.id === ch.t; })[0], d = p && p.data;
      if (!d || d.roundId !== roundId) return;
      if ((d.hitBy || []).indexOf(shotId) >= 0) { finish(); return; }
      if ((d.blocked || []).indexOf(shotId) >= 0) {
        finish();
        if (!state || state.roundId !== roundId) return;
        var sh = shuffleState(); sh.used = false; sh.retry += 1; save();
        UI.toast('ช้าไปนิด! ' + (ch.n || 'เพื่อน') + ' โดนสลับครบ ' + MAX_HITS + ' ครั้งแล้ว — ได้สิทธิ์คืน เลือกใหม่ได้', 4500);
        renderShuffleBtn();
        if (swinOpenNow()) setTimeout(openPicker, 600); // ยังอยู่ในช่วงสลับ → เปิดหน้าต่างเลือกให้ใหม่
      }
    }, function () { finish(); });
    setTimeout(finish, 10000);
  }

  function showRoundBanner() {
    var b = $('roundBanner');
    b.innerHTML = '<b>พิธีกรเริ่มรอบที่ ' + esc(SY.roundNo) + ' แล้ว</b><br>เลือกเล่นต่อด้วยบัตรเดิม (ล้างเครื่องหมาย) หรือขอบัตรใบใหม่' +
      '<div class="row" style="margin-top:.5rem"><button class="btn" id="rbClear" type="button">ล้างเครื่องหมาย เล่นรอบใหม่</button>' +
      '<button class="btn ghost" id="rbNew" type="button">ขอบัตรใบใหม่</button></div>';
    b.classList.remove('hidden');
    $('rbClear').onclick = function () { state.marks = []; state.roundId = SY.roundId; updateSeen(); noteSwin(); save(); render(); startShuffleWatch(); schedulePlayerPush(); UI.toast('พร้อมเล่นรอบที่ ' + SY.roundNo); };
    $('rbNew').onclick = function () { $('btnNew').click(); };
  }

  function startLive() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    if (!Sync.enabled() || !state) { liveStatus = 'off'; render(); return; }
    var onSt = function (st) { liveStatus = st; if (state) { renderSyncBar(); renderCellsOnly(); renderTimeBar(); renderShuffleBtn(); startShuffleWatch(); } };
    if (state.room) {
      unsubscribe = Sync.subscribe(state.room, function (data) {
        if (data) applySync(data, 'live'); else render();
      }, onSt);
    } else {
      // เปิดลิงก์ตรง → เชื่อมกับจอพิธีกรชุดเดียวกันที่เปิดอยู่ล่าสุดโดยอัตโนมัติ
      unsubscribe = Sync.subscribeLatest(state.fp, function (data, roomId) {
        if (data) { data = Object.assign({}, data, { _roomId: roomId }); applySync(data, 'live'); } else { hostMissing = true; render(); }
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
    renderCellsOnly(); renderTimeBar(); renderShuffleBtn();
  }

  function renderCellsOnly() {
    var grid = $('grid'), known = syncValid(), D = drawnSet();
    // ข้อมูลซิงก์เป็นของรอบอื่น (ยังไม่เลือกเล่นรอบใหม่) → ไม่ใช้ตรวจเครื่องหมาย
    if (known && state.roundId && SY.roundId !== state.roundId) { known = false; D = {}; }
    var marks = {}; state.marks.forEach(function (i) { marks[i] = true; });
    var lines = B.linesFromMarks(state.marks);
    var verified = known ? lines.filter(function (l) { return l.cells.every(function (i) { return D[state.cells[i]]; }); }) : lines;
    var win = {}; verified.forEach(function (l) { l.cells.forEach(function (i) { win[i] = true; }); });
    var T = known && timed();
    Array.prototype.forEach.call(grid.children, function (d, i) {
      var called = !!D[state.cells[i]];
      // จับเวลาอยู่: ไม่บอกว่าช่องไหนถูกเรียก (ต้องหาเอง) — หมดเวลาแล้วยังไม่แตะ = พลาด
      var missed = T && called && !marks[i] && leftMs(state.cells[i]) <= 0;
      var showCalled = known && called && (!T || !!marks[i]);
      d.classList.toggle('marked', !!marks[i]);
      d.classList.toggle('win', !!win[i]);
      d.classList.toggle('missed', missed);
      d.classList.toggle('unverified', known && !!marks[i] && !called);
      var badge = d.querySelector('.called');
      if (showCalled && !badge) { badge = document.createElement('span'); badge.className = 'called'; badge.textContent = 'เรียกแล้ว'; d.appendChild(badge); }
      if (!showCalled && badge) badge.remove();
      var mt = d.querySelector('.missedTag');
      if (missed && !mt) { mt = document.createElement('span'); mt.className = 'missedTag'; mt.textContent = 'พลาด'; d.appendChild(mt); }
      if (!missed && mt) mt.remove();
      d.setAttribute('aria-pressed', marks[i] ? 'true' : 'false');
    });
    $('legend').innerHTML = T
      ? 'จับเวลาอยู่ — ภาพขึ้นจอแล้วมีเวลา <b>' + SY.timer + ' วินาที</b> หาคำในบัตรแล้วแตะ · แตะผิดไม่ได้ · หมดเวลา = พลาด · ครบแนวนอน แนวตั้ง หรือทแยง = BINGO'
      : (known && fresh())
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
    var blocked = function (msg) { cell.classList.remove('blocked'); void cell.offsetWidth; cell.classList.add('blocked'); UI.toast(msg); };
    if (k >= 0) {
      if (timed()) { UI.toast('แตะช่องนี้แล้ว'); return; } // จับเวลาอยู่ → ห้ามยกเลิก (แตะใหม่ไม่ได้)
      state.marks.splice(k, 1);
    } else {
      var sameRound = !state.roundId || (SY && SY.roundId === state.roundId);
      if (fresh() && sameRound && !drawnSet()[state.cells[i]]) { blocked('“' + (chars[state.cells[i]] || {}).name + '” ยังไม่ถูกเรียก'); return; }
      if (timed() && leftMs(state.cells[i]) <= 0) { blocked('หมดเวลาแล้ว — “' + (chars[state.cells[i]] || {}).name + '” พลาดไปแล้ว'); return; }
      state.marks.push(i);
    }
    save(); renderCellsOnly(); renderTimeBar(); schedulePlayerPush();
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
