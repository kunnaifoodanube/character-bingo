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
  if (S.timer == null) S.timer = 5;      // วินาทีที่ผู้เล่นมีให้แตะคำ (0 = ไม่จับเวลา)
  if (!S.shuffleSec) S.shuffleSec = 30;   // ระยะเวลาช่วงสลับบัตรเมื่อพิธีกรกดเปิด (วินาที) — ให้ผู้เล่นคิด 30 วิ
  if (!S.swinDef30) { S.swinDef30 = 1; if (S.shuffleSec < 30) S.shuffleSec = 30; } // ค่าเดิม 10 วิ สั้นเกินไป → ปรับเป็น 30 วิ ครั้งเดียว
  delete S.shuffle;                       // แบบเก่า (ติ๊กเปิดตลอด) เลิกใช้แล้ว
  // S.swin = { id, roundId, sec, at } ช่วงสลับบัตรที่เปิดอยู่ (ไม่มี = ปิด)
  function swinOpen() { return !!(S.swin && S.round && S.swin.roundId === S.round.id && Date.now() < S.swin.at + S.swin.sec * 1000); }
  var spinning = false;
  function save() { if (!store.set(KEY, S)) UI.toast('บันทึกสถานะไม่สำเร็จ!'); schedulePublish(); }
  function drawIds() { return S.round ? S.round.draws.map(function (d) { return d.id; }) : []; }

  /** ตัวที่ "เปิดเผยแล้ว" — ระหว่างแอนิเมชันยังไม่ส่งตัวล่าสุดให้ผู้เล่น */
  function lastShownAt() {
    var d = S.round && S.round.draws[S.round.draws.length - 1];
    return (d && !spinning && d.shown) || 0;
  }
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
      pattern: S.round.pattern || 'line1', draws: visibleDraws(), updatedAt: Date.now(),
      timer: +S.timer || 0, shuffle: swinOpen(), swin: swinOpen() ? { id: S.swin.id, sec: S.swin.sec } : null, shownAt: lastShownAt() };
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
  else setInterval(function () { if (!document.hidden) schedulePublish(0); }, 10 * 60 * 1000); // ให้ผู้เล่นที่เปิดลิงก์ตรงหาจอนี้เจอ
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
      return '<option value="' + esc(t.source + ':' + t.id) + '">' + esc(t.name) + (t.source === 'local' ? ' (ฉบับร่างในเครื่องนี้)' : t.source === 'cloud' ? ' — สร้างโดย ' + esc(t.owner || 'ผู้ใช้') : '') + '</option>';
    }).join('');
    // เกมที่ค้างอยู่ (มีการสุ่มแล้ว) ใช้ชุดเดิม · ถ้ายังไม่เริ่ม ใช้ชุดเริ่มต้นจาก index.json
    var midGame = S.round && S.round.draws && S.round.draws.length;
    var want = (UI.qs('t')) || (midGame ? S.themeId : null) || src.defaultId || S.themeId || (src.list[0] && src.list[0].id);
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
    var any = pub || sources.list.filter(function (t) { return t.id === id; })[0];
    if (!any && ThemeSource.cloudEntry(id)) { any = ThemeSource.cloudEntry(id); sources.list.push(any); addOption(any); }
    return any || null;
  }

  function addOption(t) {
    var o = document.createElement('option'); o.value = t.source + ':' + t.id; o.textContent = t.name; $('themeSel').appendChild(o);
  }
  function applyTheme(entry, initial) {
    return ThemeSource.load(entry, sources.index).then(function (t) {
      var v = B.validateTheme(t);
      if (!v.ok) {
        UI.modal({ title: 'ชุดภาพยังใช้งานไม่ได้', html: '<ul>' + v.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' });
        return;
      }
      theme = t; chars = B.charMap(t); theme._source = entry.source;
      var opt = $('themeSel').querySelector('option[value="' + entry.source + ':' + entry.id + '"]'); if (opt && entry.source === 'cloud') opt.textContent = t.name + (t.author ? ' — สร้างโดย ' + t.author : '');
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
      if (c.fallback) { var f = c.fallback; urls.push(f.type === 'video' ? f.poster : f.src); }
      if (B.mediaType(c) === 'youtube') { urls.push('https://i.ytimg.com/vi/' + B.youtubeId(B.mediaSrc(c)) + '/hqdefault.jpg'); return; }
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
    watchPlayers(); renderSettings();
    var ids = drawIds();
    $('roundPill').textContent = 'รอบที่ ' + S.round.no;
    var pat = B.PATTERNS[S.round.pattern || 'line1'];
    $('patternSel').value = pat.id; $('patternLabel').textContent = 'รางวัลนี้: ' + pat.name;
    $('count').textContent = ids.length + ' / ' + theme.characters.length;
    var last = ids[ids.length - 1];
    var text = B.wordLayout(theme), cloud = B.isCloud(theme);
    $('reveal').classList.toggle('textmode', text);
    if (last && chars[last]) showBig(chars[last], noAnim); else if (!spinning) {
      stopYT(); $('bigMedia').classList.add('hidden'); $('bigMedia').innerHTML = ''; shownId = null;
      $('bigName').textContent = ''; $('placeholder').classList.remove('hidden');
      $('placeholder').textContent = 'กด “สุ่มตัวถัดไป” เพื่อเริ่ม';
    }
    var order = {}; ids.forEach(function (id, i) { order[id] = i + 1; });
    $('board').classList.toggle('txt', text && !cloud);
    $('board').innerHTML = theme.characters.map(function (c) {
      if (cloud) { // จอใหญ่เห็นทั้งห้อง: แสดงโจทย์ ไม่เฉลยคำตอบ (ยกเว้นตั้งให้แสดงคำตอบ)
        var qi = c.media && c.media.src, ql = qLabel(c);
        return '<div class="b' + (order[c.id] ? ' on' : '') + (qi ? '' : ' t') + '" title="' + esc(ql) + '">' + (order[c.id] ? '<span class="o">' + order[c.id] + '</span>' : '') +
          (qi ? '<img alt="" src="' + esc(qi) + '">' : esc(ql)) + '</div>';
      }
      return '<div class="b' + (order[c.id] ? ' on' : '') + '" title="' + esc(c.name + (c.th ? ' — ' + c.th : '')) + '">' + (order[c.id] ? '<span class="o">' + order[c.id] + '</span>' : '') +
        (text ? esc(c.name) : '<img alt="' + esc(c.name) + '" src="' + esc(c.img) + '">') + '</div>';
    }).join('');
    $('history').innerHTML = ids.length ? ids.map(function (id, i) {
      var c = chars[id] || { name: '?', img: '' };
      if (cloud) return '<span class="h t">' + (i + 1) + '. ' + esc(qLabel(c)) + '</span>';
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
  // ---------- คลิป YouTube (ฝังจากช่องทางการ) ----------
  var ytApi = null, ytPlayer = null;
  function loadYT() {
    if (ytApi) return ytApi;
    ytApi = new Promise(function (res, rej) {
      if (window.YT && window.YT.Player) { res(window.YT); return; }
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) prev(); res(window.YT); };
      var sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api';
      sc.onerror = function () { rej(new Error('yt')); };
      document.head.appendChild(sc);
      setTimeout(function () { rej(new Error('timeout')); }, 9000);
    });
    ytApi.catch(function () { ytApi = null; }); // ลองใหม่ได้เมื่อเน็ตกลับมา
    return ytApi;
  }
  function stopYT() { if (ytPlayer) { try { ytPlayer.destroy(); } catch (e) { /* */ } ytPlayer = null; } $('btnSound').classList.add('hidden'); }
  function fallbackHtml(c, why) {
    var f = c.fallback, src = f && (f.type === 'video' ? f.poster : f.src);
    return (src ? '<img alt="" src="' + esc(src) + '">' : '') + '<div class="yt-msg' + (src ? ' small' : '') + '">' + esc(why) + '</div>';
  }
  function ytNode(c) {
    var m = c.media || {}, id = B.youtubeId(m.src), wrap = document.createElement('div');
    wrap.className = 'yt';
    wrap.innerHTML = '<div class="yt-msg">กำลังโหลดคลิป…</div><div class="yt-p"></div>';
    wrap._start = function () {
      loadYT().then(function (YT) {
        if (!wrap.isConnected) return;
        var st = +m.start || 0, en = +m.end || 0, vars = { autoplay: 1, mute: 1, controls: 0, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3, disablekb: 1, fs: 0, start: st };
        if (en) vars.end = en;
        stopYT();
        ytPlayer = new YT.Player(wrap.querySelector('.yt-p'), {
          width: '100%', height: '100%', videoId: id, playerVars: vars,
          events: {
            onReady: function (e) { e.target.mute(); e.target.playVideo(); $('btnSound').classList.remove('hidden'); $('btnSound').textContent = '🔇 เปิดเสียง'; },
            onStateChange: function (e) {
              if (e.data === 1) wrap.classList.add('playing');
              if (e.data === 0) { e.target.seekTo(st, true); e.target.playVideo(); } // จบช่วง → วนกลับ
            },
            onError: function () { if (wrap.isConnected) { stopYT(); wrap.innerHTML = fallbackHtml(c, 'คลิป YouTube เล่นไม่ได้ในตอนนี้'); } }
          }
        });
      }).catch(function () { if (wrap.isConnected) wrap.innerHTML = fallbackHtml(c, 'ต้องต่ออินเทอร์เน็ตเพื่อเล่นคลิป YouTube'); });
    };
    return wrap;
  }
  $('btnSound').addEventListener('click', function () {
    if (!ytPlayer || !ytPlayer.isMuted) return;
    if (ytPlayer.isMuted()) { ytPlayer.unMute(); ytPlayer.setVolume(80); this.textContent = '🔊 ปิดเสียง'; }
    else { ytPlayer.mute(); this.textContent = '🔇 เปิดเสียง'; }
  });

  function mediaNode(c) {
    var src = B.mediaSrc(c), m = c.media || {};
    if (B.mediaType(c) === 'youtube') return ytNode(c);
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
    var img = new Image(); img.alt = c.name; img.decoding = 'async';
    if (m.pixel) img.className = 'pixel';
    // โปสเตอร์จากเว็บภายนอกโหลดไม่ได้ (ออฟไลน์/ถูกบล็อก) → ใช้ภาพสำรองจาก Commons
    if (c.fallback) img.onerror = function () { img.onerror = null; var f = c.fallback, fs = f.type === 'video' ? f.poster : f.src; if (fs && fs !== img.src) img.src = fs; };
    img.src = src;
    return img;
  }
  function preload(c) {
    if (!c || !B.mediaAllowed(c) || preloaded[c.id]) return;
    if (B.mediaType(c) === 'youtube') { loadYT().catch(function () { }); return; } // YouTube สร้างตอนแสดงจริง
    preloaded[c.id] = mediaNode(c);
  }
  /** ชื่อเรียกโจทย์ของเกมที่สร้างเอง (ใช้บนจอที่ทั้งห้องเห็น) */
  function qLabel(c) {
    if (c.q) return c.q;
    if (theme.showAnswer) return c.label || c.name;
    return 'ข้อ ' + (theme.characters.indexOf(c) + 1);
  }
  function nameHtml(c) {
    if (B.isCloud(theme)) {
      var ans = theme.showAnswer ? (c.label || c.name) : '';
      return (c.q ? '<span class="en">' + esc(c.q) + '</span>' : '') + (ans ? '<span class="sep"> — </span><span class="th">' + esc(ans) + '</span>' : '');
    }
    return '<span class="en">' + esc(c.name) + '</span>' + (B.isText(theme) && c.th ? '<span class="sep"> — </span><span class="th">' + esc(c.th) + '</span>' : '');
  }
  function showBig(c, noAnim) {
    $('placeholder').classList.add('hidden');
    var box = $('bigMedia'), text = B.wordLayout(theme);
    box.classList.toggle('dark', text);
    if (shownId !== c.id) {
      stopYT(); box.innerHTML = '';
      if (B.mediaAllowed(c)) {
        var node = preloaded[c.id] || mediaNode(c); delete preloaded[c.id];
        box.appendChild(node); box.classList.remove('hidden');
        if (node._start) node._start();
        if (node.play) { var p = node.play(); if (p && p.catch) p.catch(function () { }); }
      } else box.classList.add('hidden');
      shownId = c.id;
    }
    $('bigName').innerHTML = nameHtml(c);
    var r = $('reveal'); r.classList.remove('revealed');
    if (!noAnim) { void r.offsetWidth; r.classList.add('revealed'); }
  }

  // ---------- สุ่ม ----------
  function draw() {
    if (busy || !theme) return;
    if (swinOpen()) { UI.toast('กำลังเปิดช่วงสลับบัตร — รอหมดเวลา หรือกด ⏹ ปิดสลับบัตรก่อน แล้วค่อยสุ่ม', 3500); return; } // ผู้เล่นกำลังเลือกอยู่ หน้าต่างบังบัตร
    var ids = drawIds();
    var next = B.drawNext(theme, ids);
    if (!next) { UI.toast('สุ่มครบทุกตัวแล้ว'); return; }
    busy = true; spinning = true; renderAll(true);
    // บันทึกก่อนแสดงผล: รีเฟรชระหว่างแอนิเมชันก็ไม่สุ่มซ้ำ/ไม่หาย
    S.round.draws.push({ id: next, at: new Date().toISOString() });
    save();
    var r = $('reveal'), box = $('bigMedia'), nm = $('bigName'), text = B.wordLayout(theme), cloud = B.isCloud(theme), img = null;
    preload(chars[next]); // โหลดสื่อของตัวที่ออกระหว่างแอนิเมชัน
    $('placeholder').classList.add('hidden');
    shownId = null; stopYT(); box.innerHTML = '';
    if (text) box.classList.add('hidden');
    else { img = new Image(); img.alt = ''; box.appendChild(img); box.classList.remove('hidden'); box.classList.remove('dark'); }
    r.classList.add('spinning'); r.classList.remove('revealed');
    var pool = theme.characters, t0 = Date.now();
    var timer = setInterval(function () {
      var c = pool[Math.floor(Math.random() * pool.length)];
      if (cloud) nm.textContent = c.q || '…'; else if (text) nm.textContent = c.name; else { img.src = c.img; nm.textContent = '…'; }
      if (Date.now() - t0 > REVEAL_MS) {
        clearInterval(timer);
        r.classList.remove('spinning');
        spinning = false;
        var dd = S.round.draws[S.round.draws.length - 1]; if (dd) { dd.shown = Date.now(); store.set(KEY, S); }
        renderAll(false);
        schedulePublish(0);
        startCountdown(dd && dd.shown);
        setTimeout(function () { busy = false; renderAll(true); }, COOLDOWN_MS);
      }
    }, 90);
  }
  // ---------- นับถอยหลังเวลาแตะ (แสดงบนจอให้ทั้งห้องเห็น) ----------
  var cdTimer = null;
  function stopCountdown() { clearInterval(cdTimer); cdTimer = null; $('cd').classList.add('hidden'); }
  function startCountdown(shownAt) {
    stopCountdown();
    var sec = +S.timer || 0;
    if (!sec || !shownAt) return;
    var el = $('cd');
    function tick() {
      var left = sec - (Date.now() - shownAt) / 1000;
      if (left <= 0) {
        el.textContent = 'หมดเวลา'; el.classList.add('done'); el.style.setProperty('--p', 0);
        clearInterval(cdTimer); cdTimer = setTimeout(function () { el.classList.add('hidden'); }, 1500);
        return;
      }
      el.classList.remove('done', 'hidden');
      el.textContent = Math.ceil(left);
      el.style.setProperty('--p', Math.max(0, left / sec));
    }
    tick(); cdTimer = setInterval(tick, 100);
  }

  // ---------- ตั้งค่า: เวลาแตะ / ช่วงสลับบัตร ----------
  var rulesBad = false; // กฎ Firebase ยังไม่รองรับข้อมูลผู้เล่น/สลับบัตร
  function renderSettings() {
    $('timerSel').value = String(+S.timer || 0);
    $('swinSel').value = String(S.shuffleSec);
    var note = $('shuffleNote');
    if (!Sync.enabled()) note.innerHTML = '⚠️ สลับบัตรใช้ได้เมื่อเปิดซิงก์เรียลไทม์ (Firebase) เท่านั้น';
    else if (rulesBad) note.innerHTML = '⚠️ <b>ระบบสลับบัตรยังไม่พร้อม</b> — ต้องอัปเดตกฎ Firebase (ทำครั้งเดียว ไม่ต้องทำทุกครั้งที่จัดกิจกรรม)';
    else note.textContent = 'กดปุ่ม 🔀 ใต้จอ → มือถือทุกเครื่องเด้งหน้าต่างให้เลือกสลับบัตรเพื่อนหรือบัตรตัวเอง (สิทธิ์ 1 ครั้งต่อรอบ · โดนเพื่อนสลับได้ไม่เกิน 2 ครั้ง · ไม่สลับ = เก็บสิทธิ์ไว้ช่วงหน้า) · ระหว่างเปิดช่วงสลับจะสุ่มตัวถัดไปไม่ได้';
    note.classList.toggle('warn', !Sync.enabled() || rulesBad);
    renderSwin();
  }
  $('timerSel').addEventListener('change', function () {
    S.timer = +this.value; save(); renderSettings();
    UI.toast(S.timer ? 'ผู้เล่นมีเวลาแตะ ' + S.timer + ' วินาทีต่อภาพ' : 'ปิดการจับเวลาแล้ว');
  });
  $('swinSel').addEventListener('change', function () { S.shuffleSec = +this.value || 30; store.set(KEY, S); renderSwin(); });

  var swinTimer = null;
  function renderSwin() {
    var btn = $('btnSwin'), ban = $('swinBanner'), open = swinOpen();
    if (open) {
      var left = Math.max(0, Math.ceil((S.swin.at + S.swin.sec * 1000 - Date.now()) / 1000));
      btn.textContent = '⏹ ปิดสลับบัตร (เหลือ ' + left + ' วิ)';
      btn.classList.add('on');
      ban.innerHTML = '<div class="sw-t">🔀 สลับบัตรได้แล้ว!</div><div class="sw-n">' + left + '</div>' +
        '<div class="sw-s">📱 ดูที่มือถือ — เลือกสลับบัตรเพื่อน หรือบัตรตัวเอง</div>';
      ban.style.setProperty('--p', Math.max(0, Math.min(1, (S.swin.at + S.swin.sec * 1000 - Date.now()) / (S.swin.sec * 1000))).toFixed(3));
      ban.classList.remove('hidden');
      if (!swinTimer) swinTimer = setInterval(renderSwin, 200);
    } else {
      btn.textContent = '🔀 เปิดสลับบัตร ' + S.shuffleSec + ' วิ';
      btn.classList.remove('on');
      ban.classList.add('hidden');
      if (swinTimer) { clearInterval(swinTimer); swinTimer = null; }
      if (S.swin) { S.swin = null; save(); UI.toast('ปิดช่วงสลับบัตรแล้ว'); } // หมดเวลา → แจ้งผู้เล่นว่าปิดแล้ว
    }
  }
  $('btnSwin').addEventListener('click', function () {
    if (swinOpen()) { S.swin = null; save(); renderSwin(); return; } // กดซ้ำ = ปิดก่อนเวลา
    if (!Sync.enabled()) { UI.toast('สลับบัตรใช้ได้เมื่อเปิดซิงก์เรียลไทม์ (Firebase) เท่านั้น', 4000); return; }
    if (rulesBad) {
      UI.modal({ title: 'ระบบสลับบัตรยังไม่พร้อม', html: '<p>ฐานข้อมูล Firebase ของเกมยังไม่ได้อัปเดตกฎให้รองรับการสลับบัตร (ทำครั้งเดียว) จึงยังเปิดช่วงสลับไม่ได้</p><p class="small muted">เกมส่วนอื่นเล่นได้ตามปกติ</p>' });
      return;
    }
    if (!theme || !S.round) return;
    S.swin = { id: 'w' + Date.now().toString(36), roundId: S.round.id, sec: +S.shuffleSec || 30, at: Date.now() };
    save(); schedulePublish(0); renderSwin();
    UI.toast('🔀 เปิดสลับบัตร ' + S.swin.sec + ' วินาที');
  });

  // ---------- ข้อมูลบัตรมือถือที่ส่งขึ้นระบบ (ตำแหน่งหลังสลับ + คำที่แตะทันเวลา) ----------
  var livePlayers = {}, unwatchPlayers = null, watchedRoom = null;
  function watchPlayers() {
    if (!Sync.enabled() || watchedRoom === S.roomId) return;
    if (unwatchPlayers) unwatchPlayers();
    watchedRoom = S.roomId;
    unwatchPlayers = Sync.watchCollection(['rooms', S.roomId, 'players'], function (list) {
      var m = {};
      list.forEach(function (p) { var d = p.data || {}; if (d.code) m[d.code + '|' + d.roundId] = d; });
      livePlayers = m;
    }, function (err) { // ยังไม่ได้ตั้งกฎ Firebase สำหรับผู้เล่น → ตรวจแบบเดิม + ปิดปุ่มสลับบัตร
      if (err && (err.code === 'permission-denied' || /permission/i.test(err.message || ''))) { rulesBad = true; renderSettings(); }
    });
  }
  function livePlayer(code, roundObj) {
    var d = livePlayers[code + '|' + roundObj.id];
    if (!d || !Array.isArray(d.cells) || d.cells.length !== B.CELLS) return null;
    return d;
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
      .then(function (ok) { if (!ok) return; stopCountdown(); S.round.draws.pop(); save(); renderAll(true); UI.toast('ยกเลิก ' + c.name + ' แล้ว'); });
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
      stopCountdown(); S.round = newRound(no, theme.id); save(); renderAll(true);
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
          var lp = livePlayer(B.formatCode(p.num), roundObj);
          var res = B.verifyCard(theme, p.num, ids, lp ? { cells: lp.cells, marked: lp.timed ? (lp.marked || []) : null } : null);
          var pid = roundObj.pattern || 'line1', okNow = !!B.patternAtDraw(res, pid);
          var prev = (roundObj.checks || []).filter(function (c) { return c.code === res.code && c.bingo && (c.pattern || 'line1') === pid; });
          var html = '<p class="center" style="margin:.6rem 0 0">บัตร <b class="mono" style="font-size:1.4rem">' + esc(res.code) + '</b> · ' +
            (p.num <= B.PRINT_RANGE_MAX ? 'บัตรกระดาษ' : 'บัตรมือถือ') + ' · ชุด ' + esc(theme.name) + '</p>';
          if (!p.checked) html += '<div class="banner warn">ไม่ได้พิมพ์เลขตรวจสอบ (หลักสุดท้าย) — บัตรที่ถูกต้องคือ <b class="mono">' + esc(res.code) + '</b> โปรดดูให้ตรงกับบัตรผู้เล่น</div>';
          if (prev.length) html += '<div class="banner warn">บัตรนี้เคยตรวจผ่านแล้วในรอบนี้ เมื่อ ' + new Date(prev[0].at).toLocaleTimeString('th-TH') + '</div>';
          if (lp) html += '<div class="banner ok small">บัตรมือถือที่เชื่อมระบบ' + (lp.name ? ' (' + esc(lp.name) + ')' : '') + ' — ตรวจตามตำแหน่งบนเครื่องผู้เล่น' +
            (lp.shuffledBy && lp.shuffledBy.length ? ' · ถูกสลับโดย ' + esc(lp.shuffledBy.join(', ')) : '') +
            (lp.timed ? '<br>นับเฉพาะคำที่ถูกเรียก <b>และผู้เล่นแตะทันเวลา</b>' : '') + '</div>';
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
    if (e.key !== store.key(KEY) || !e.newValue) return;
    try { S = JSON.parse(e.newValue); } catch (err) { return; }
    renderAll(true);
    UI.toast('มีการสุ่มจากอีกแท็บหนึ่ง — ควรเปิดหน้าพิธีกรแท็บเดียว', 4000);
  });
  window.addEventListener('beforeunload', function (e) { if (busy) { e.preventDefault(); e.returnValue = ''; } });

  // สำหรับการทดสอบอัตโนมัติ
  window.__host = { ytPlayer: function () { return ytPlayer; }, shownId: function () { return shownId; }, state: function () { return S; }, theme: function () { return theme; }, busy: function () { return busy; }, syncText: function () { return syncText(); } };
})();
