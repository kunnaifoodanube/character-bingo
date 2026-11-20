/* Character Bingo — core logic (ใช้ร่วมกันทุกหน้า และใช้ทดสอบใน Node ได้)
 * ไม่มีการเรียกเซิร์ฟเวอร์ใด ๆ นอกจากอ่านไฟล์ static ในเว็บไซต์เดียวกัน
 */
(function (root) {
  'use strict';

  var GRID = 4;
  var CELLS = GRID * GRID; // 16
  var MIN_CHARACTERS = 24;
  var MAX_CHARACTERS = 60;
  var PRINT_RANGE_MAX = 9999;   // บัตรกระดาษ 00001-09999
  var PHONE_MIN = 10000;        // บัตรมือถือ 10000-99999
  var PHONE_MAX = 99999;

  // ---------- Hash / PRNG (deterministic) ----------
  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Damm check digit (จับเลขผิด 1 หลัก และสลับหลักติดกันได้ 100%) ----------
  var DAMM = [
    [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
    [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
    [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
    [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
    [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
    [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
    [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
    [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
    [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
    [2, 5, 8, 1, 4, 3, 6, 7, 9, 0]
  ];
  function damm(digits) {
    var interim = 0;
    for (var i = 0; i < digits.length; i++) interim = DAMM[interim][digits.charCodeAt(i) - 48];
    return interim;
  }
  function pad5(n) { return ('00000' + n).slice(-5); }
  function formatCode(num) { var s = pad5(num); return s + '-' + damm(s); }

  /** แปลงข้อความที่พิมพ์ (เช่น "48213-7", "482137", "48213") → {ok, num, checked, error} */
  function parseCode(input) {
    var s = String(input || '').replace(/[^0-9]/g, '');
    if (s.length === 6) {
      var base = s.slice(0, 5);
      if (damm(s) !== 0) return { ok: false, error: 'เลขตรวจสอบไม่ตรง — อาจพิมพ์เลขบัตรผิด กรุณาตรวจอีกครั้ง' };
      var n = parseInt(base, 10);
      if (n < 1) return { ok: false, error: 'ไม่มีบัตรหมายเลขนี้' };
      return { ok: true, num: n, checked: true, code: formatCode(n) };
    }
    if (s.length >= 1 && s.length <= 5) {
      var m = parseInt(s, 10);
      if (m < 1) return { ok: false, error: 'ไม่มีบัตรหมายเลขนี้' };
      return { ok: true, num: m, checked: false, code: formatCode(m) };
    }
    return { ok: false, error: 'กรุณาพิมพ์เลขบัตร 5 หลัก + เลขตรวจสอบ 1 หลัก เช่น 48213-7' };
  }

  // ---------- Theme ----------
  function sortedIds(theme) {
    return theme.characters.map(function (c) { return c.id; }).sort();
  }
  /** ลายนิ้วมือชุดตัวละคร — เปลี่ยนเมื่อเพิ่ม/ลบตัวละคร (เปลี่ยนภาพ/ชื่อไม่กระทบ) */
  function fingerprint(theme) {
    return fnv1a(theme.id + '#' + sortedIds(theme).join(',')).toString(36).slice(0, 5).toUpperCase();
  }

  var RE_DATA_IMG = /^data:image\/(png|jpeg|webp|svg\+xml|gif);base64,/;
  var RE_PATH = /^[\w\-./%]+\.(png|jpe?g|webp|svg|gif|webm|mp4|ogv)$/i;
  function okImgSrc(u) { return RE_DATA_IMG.test(u) || /^https:\/\/[^\s"'<>]+$/.test(u) || RE_PATH.test(u); }
  function okMediaSrc(u) { return okImgSrc(u); }
  /** แหล่งภาพ/คลิปที่จะใช้บนจอพิธีกร */
  function mediaSrc(c) { return (c && c.media && c.media.src) || (c && c.img) || ''; }
  /** รหัสคลิป YouTube จากลิงก์ (watch?v= / youtu.be / embed / shorts) */
  function youtubeId(u) {
    var m = String(u || '').match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : '';
  }
  function mediaType(c) {
    if (c && c.media && c.media.type) return c.media.type;
    if (youtubeId(mediaSrc(c))) return 'youtube';
    return /\.(webm|mp4|ogv)(\?|$)/i.test(mediaSrc(c)) ? 'video' : 'image';
  }


  // ---------- โหมดคำศัพท์ / สื่อ ----------
  /** ชุดแบบ "คำศัพท์": ผู้เล่นเห็นเฉพาะคำภาษาอังกฤษ, จอพิธีกรแสดงภาพ/คลิป + คำแปล */
  function isText(theme) { return !!theme && theme.display === 'text'; }
  /** แสดงสื่อเมื่อมีสื่อ (ภาพทั้งหมดเป็นของผู้ใช้/คณะเอง — ไม่มีระบบเครดิตแล้ว) */
  function mediaAllowed(c) { return !!mediaSrc(c); }
  /** เนื้อหาในช่องบัตร 4×4 (ผู้เล่น / ตรวจบัตร / ตัวอย่าง) */
  function cellInner(theme, c) {
    if (!c) return '<div class="tw">?</div>';
    if (isText(theme)) return '<div class="tw" lang="en">' + esc(c.name) + '</div>';
    return '<img alt="" src="' + esc(c.img) + '"><div class="nm">' + esc(c.name) + '</div>';
  }
  /** ย่อขนาดตัวอักษรเฉพาะคำที่ยาวเกินช่อง (ไม่ตัดคำกลางคำ) */
  function fitWords(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('.tw'), function (t) {
      t.style.fontSize = '';
      var size = parseFloat(getComputedStyle(t).fontSize), box = t.parentElement, guard = 0;
      var avail = function () { var cs = getComputedStyle(box); return box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); };
      var over = function () { return t.scrollWidth > Math.min(t.clientWidth, avail()) + 0.5 || t.offsetHeight > box.clientHeight - 6; };
      t.classList.remove('hy');
      while (over() && size - 0.5 >= 11 && guard++ < 30) { size -= 0.5; t.style.fontSize = size + 'px'; }
      if (over()) t.classList.add('hy'); // จอเล็กมาก: ยอมตัดคำยาวพร้อมขีด แทนที่จะย่อจนอ่านไม่ออก
    });
  }
  function validateTheme(theme) {
    var errors = [], warnings = [];
    if (!theme || typeof theme !== 'object') return { ok: false, errors: ['ไฟล์ชุดภาพไม่ถูกต้อง'], warnings: [] };
    if (!theme.id || !/^[a-z0-9][a-z0-9-]{0,40}$/.test(theme.id)) errors.push('รหัสชุด (id) ต้องเป็น a-z, 0-9, - เท่านั้น');
    if (!theme.name) errors.push('ยังไม่ได้ตั้งชื่อชุดภาพ');
    var chars = Array.isArray(theme.characters) ? theme.characters : [];
    if (chars.length < MIN_CHARACTERS) errors.push('มีตัวละคร ' + chars.length + ' ตัว ต้องมีอย่างน้อย ' + MIN_CHARACTERS + ' ตัว');
    if (chars.length > MAX_CHARACTERS) errors.push('มีตัวละคร ' + chars.length + ' ตัว เกินสูงสุด ' + MAX_CHARACTERS + ' ตัว');
    var seenId = {}, seenName = {}, missingMedia = [], unverified = [];
    chars.forEach(function (c, i) {
      var label = 'ตัวที่ ' + (i + 1) + (c && c.name ? ' (' + c.name + ')' : '');
      if (!c || !c.id) { errors.push(label + ': ไม่มีรหัส'); return; }
      if (seenId[c.id]) errors.push(label + ': รหัสซ้ำกับตัวอื่น');
      seenId[c.id] = true;
      if (!c.name || !String(c.name).trim()) errors.push(label + ': ยังไม่ได้ตั้งชื่อ');
      else {
        var k = String(c.name).trim().toLowerCase();
        if (seenName[k]) warnings.push('ชื่อ "' + c.name + '" ซ้ำกัน — ผู้เล่นอาจสับสน');
        seenName[k] = true;
      }
      var textMode = theme.display === 'text';
      if (!c.img && !textMode) errors.push(label + ': ไม่มีภาพ');
      else if (c.img && !okImgSrc(c.img)) errors.push(label + ': รูปแบบภาพไม่รองรับ');
      if (c.media && c.media.src && !okMediaSrc(c.media.src)) errors.push(label + ': ลิงก์สื่อไม่รองรับ (ต้องเป็น https:// หรือไฟล์ภาพ/วิดีโอ)');
      if (textMode && !mediaSrc(c)) missingMedia.push(c.name || label);
    });
    if (missingMedia.length) warnings.push('ยังไม่มีสื่อประกอบ ' + missingMedia.length + ' คำ (จอพิธีกรจะแสดงเฉพาะชื่อ): ' + missingMedia.join(', '));
    if (chars.length > 36) warnings.push('มีมากกว่า 36 รายการ เกมจะใช้เวลานานขึ้น');
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  // ---------- Card generation ----------
  /** คืนค่า array รหัสตัวละคร 16 ช่อง (เรียงซ้าย→ขวา บน→ล่าง) */
  function generateCard(theme, num) {
    var ids = sortedIds(theme);
    var rng = mulberry32(fnv1a(theme.id + '|card|' + num));
    for (var i = ids.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = ids[i]; ids[i] = ids[j]; ids[j] = t;
    }
    return ids.slice(0, CELLS);
  }

  // 10 แนว: 4 แนวนอน 4 แนวตั้ง 2 ทแยง
  var LINES = (function () {
    var L = [], r, c;
    for (r = 0; r < GRID; r++) { var row = []; for (c = 0; c < GRID; c++) row.push(r * GRID + c); L.push({ name: 'แนวนอนแถวที่ ' + (r + 1), cells: row }); }
    for (c = 0; c < GRID; c++) { var col = []; for (r = 0; r < GRID; r++) col.push(r * GRID + c); L.push({ name: 'แนวตั้งคอลัมน์ที่ ' + (c + 1), cells: col }); }
    var d1 = [], d2 = [];
    for (r = 0; r < GRID; r++) { d1.push(r * GRID + r); d2.push(r * GRID + (GRID - 1 - r)); }
    L.push({ name: 'ทแยงซ้ายบน→ขวาล่าง', cells: d1 });
    L.push({ name: 'ทแยงขวาบน→ซ้ายล่าง', cells: d2 });
    return L;
  })();

  /** ตรวจจากเครื่องหมายของผู้เล่น (ใช้แสดงผล BINGO บนมือถือเท่านั้น) */
  function linesFromMarks(marks) {
    var set = {};
    (marks || []).forEach(function (i) { set[i] = true; });
    return LINES.filter(function (l) { return l.cells.every(function (i) { return set[i]; }); });
  }

  /** ตรวจรางวัลจริง: ใช้ประวัติการสุ่มของพิธีกรเท่านั้น ไม่สนใจว่าผู้เล่นแตะอะไร */
  /*  opts (บัตรมือถือที่ส่งข้อมูลขึ้นระบบ):
   *   cells  — ลำดับคำบนบัตรหลังถูกสลับตำแหน่ง (ต้องเป็นคำชุดเดียวกับบัตรเดิม 16 คำ)
   *   marked — คำที่ผู้เล่นแตะทันเวลา (ถ้าส่งมา จะนับเฉพาะคำที่ถูกเรียก + แตะทัน) */
  function verifyCard(theme, num, drawIds, opts) {
    var cells = generateCard(theme, num);
    opts = opts || {};
    if (opts.cells && opts.cells.length === cells.length && opts.cells.slice().sort().join('|') === cells.slice().sort().join('|')) cells = opts.cells.slice();
    var okMark = null;
    if (opts.marked) { okMark = {}; opts.marked.forEach(function (id) { okMark[id] = true; }); }
    var pos = {};
    (drawIds || []).forEach(function (id, i) { if (pos[id] === undefined) pos[id] = i + 1; });
    var drawnCells = cells.map(function (id) { return pos[id] !== undefined && (!okMark || !!okMark[id]); });
    var winning = [];
    LINES.forEach(function (l) {
      if (l.cells.every(function (i) { return drawnCells[i]; })) {
        var at = Math.max.apply(null, l.cells.map(function (i) { return pos[cells[i]]; }));
        winning.push({ name: l.name, cells: l.cells, completedAtDraw: at });
      }
    });
    winning.sort(function (a, b) { return a.completedAtDraw - b.completedAtDraw; });
    // แนวที่ขาดน้อยที่สุด (ไว้บอกว่า "ขาดอีก X ตัว")
    var bestMissing = CELLS;
    LINES.forEach(function (l) {
      var miss = l.cells.filter(function (i) { return !drawnCells[i]; }).length;
      if (miss < bestMissing) bestMissing = miss;
    });
    var fullAt = drawnCells.every(Boolean) ? Math.max.apply(null, cells.map(function (id) { return pos[id]; })) : null;
    return {
      num: num, code: formatCode(num), cells: cells, drawnCells: drawnCells,
      bingo: winning.length > 0, winning: winning,
      firstBingoAtDraw: winning.length ? winning[0].completedAtDraw : null,
      linesAtDraw: winning.map(function (w) { return w.completedAtDraw; }),
      fullAtDraw: fullAt,
      missing: bestMissing,
      missingFull: drawnCells.filter(function (d) { return !d; }).length
    };
  }

  // รูปแบบการชนะ (พิธีกรเลือกต่อรางวัล) — กับผู้เล่น 100 คน "1 แนว" จะจบเร็วมาก
  var PATTERNS = {
    line1: { id: 'line1', name: 'ครบ 1 แนว', lines: 1 },
    line2: { id: 'line2', name: 'ครบ 2 แนว', lines: 2 },
    full: { id: 'full', name: 'เต็มบัตร 16 ช่อง', lines: 0 }
  };
  /** ลำดับการสุ่มที่บัตรนี้ได้รางวัลตามรูปแบบ (null = ยังไม่ได้) */
  function patternAtDraw(res, patternId) {
    var p = PATTERNS[patternId] || PATTERNS.line1;
    if (p.id === 'full') return res.fullAtDraw;
    return res.linesAtDraw.length >= p.lines ? res.linesAtDraw[p.lines - 1] : null;
  }
  function missingFor(res, patternId) {
    var p = PATTERNS[patternId] || PATTERNS.line1;
    if (p.id === 'full') return res.missingFull;
    if (p.lines === 1) return res.missing;
    return null;
  }

  /** ตรวจชุดบัตรว่ามีบัตรซ้ำหรือไม่ (ทั้งเหมือนกันทุกช่อง และชุดตัวละคร 16 ตัวเหมือนกัน) */
  function checkCardSet(theme, nums) {
    var layout = {}, sets = {}, sameLayout = [], sameSet = [];
    nums.forEach(function (n) {
      var cells = generateCard(theme, n);
      var lk = cells.join(',');
      var sk = cells.slice().sort().join(',');
      if (layout[lk] !== undefined) sameLayout.push([layout[lk], n]); else layout[lk] = n;
      if (sets[sk] !== undefined) sameSet.push([sets[sk], n]); else sets[sk] = n;
    });
    return { total: nums.length, identicalCards: sameLayout, sameCharacterSet: sameSet, ok: sameLayout.length === 0 };
  }

  function randomInt(min, max) { // inclusive, crypto ถ้ามี
    var range = max - min + 1;
    var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (c) {
      var buf = new Uint32Array(1), limit = Math.floor(4294967296 / range) * range;
      do { c.getRandomValues(buf); } while (buf[0] >= limit);
      return min + (buf[0] % range);
    }
    return min + Math.floor(Math.random() * range);
  }
  function randomPhoneCardNumber() { return randomInt(PHONE_MIN, PHONE_MAX); }

  /** สุ่มตัวละครถัดไปที่ยังไม่ออก */
  function drawNext(theme, drawIds) {
    var drawn = {};
    drawIds.forEach(function (id) { drawn[id] = true; });
    var remaining = theme.characters.filter(function (c) { return !drawn[c.id]; });
    if (!remaining.length) return null;
    return remaining[randomInt(0, remaining.length - 1)].id;
  }

  function charMap(theme) {
    var m = {};
    theme.characters.forEach(function (c) { m[c.id] = c; });
    return m;
  }

  // ---------- QR ซิงก์ (ผู้เล่นสแกนจากจอพิธีกร ไม่ต้องใช้อินเทอร์เน็ต) ----------
  var B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var PCODE = { line1: '1', line2: '2', full: 'f' }, PDEC = { '1': 'line1', '2': 'line2', 'f': 'full' };
  /** round: {id, no, pattern, draws:[ids]} → ข้อความสั้นสำหรับ QR */
  function encodeSync(theme, round) {
    var ids = sortedIds(theme), at = {};
    ids.forEach(function (id, i) { at[id] = i; });
    var d = (round.draws || []).map(function (x) { return B62.charAt(at[x]); }).join('');
    return 'CBS1.' + fingerprint(theme) + '.' + round.id + '.' + round.no + '.' + (PCODE[round.pattern] || '1') + '.' + d;
  }
  function decodeSync(text, theme) {
    var p = String(text || '').trim().split('.');
    if (p.length !== 6 || p[0] !== 'CBS1') return { ok: false, error: 'ไม่ใช่ QR ซิงก์ของเกมนี้' };
    if (p[1] !== fingerprint(theme)) return { ok: false, error: 'QR นี้เป็นคนละชุดภาพกับบัตรของคุณ' };
    var ids = sortedIds(theme), draws = [];
    for (var i = 0; i < p[5].length; i++) {
      var k = B62.indexOf(p[5].charAt(i));
      if (k < 0 || k >= ids.length) return { ok: false, error: 'QR เสียหาย อ่านไม่ครบ' };
      draws.push(ids[k]);
    }
    return { ok: true, fp: p[1], roundId: p[2], roundNo: parseInt(p[3], 10) || 0, pattern: PDEC[p[4]] || 'line1', draws: draws };
  }

  // ---------- Browser helpers ----------
  // แยกพื้นที่เก็บข้อมูลของแต่ละเวอร์ชันเกมที่อยู่โดเมนเดียวกัน (<html data-ns="gx.">) — เวอร์ชันหลักไม่มี ns
  var NS = (typeof document !== 'undefined' && document.documentElement && document.documentElement.getAttribute('data-ns')) || '';
  var store = {
    ns: NS,
    key: function (k) { return NS + k; },
    get: function (k, def) {
      try { var v = localStorage.getItem(NS + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) {
      try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    del: function (k) { try { localStorage.removeItem(NS + k); } catch (e) { /* ignore */ } }
  };

  function fetchJSON(url, timeoutMs) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, timeoutMs || 8000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal, cache: 'no-cache' } : { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  /** โหลดรายการชุดภาพจาก themes/index.json (มีสำรองใน localStorage) */
  function loadThemeIndex(base) {
    base = base || '';
    return fetchJSON(base + 'themes/index.json').then(function (idx) {
      store.set('cb.themeIndex', idx);
      return idx;
    }).catch(function (e) {
      var cached = store.get('cb.themeIndex', null);
      if (cached) return cached;
      throw e;
    });
  }

  /** โหลดชุดภาพ: เครือข่าย → Service Worker cache → localStorage */
  function loadTheme(idx, themeId, base) {
    base = base || '';
    var entry = (idx.themes || []).filter(function (t) { return t.id === themeId; })[0];
    if (!entry) return Promise.reject(new Error('ไม่พบชุดภาพ "' + themeId + '"'));
    return fetchJSON(base + 'themes/' + entry.file).then(function (theme) {
      var v = validateTheme(theme);
      if (!v.ok) throw new Error('ชุดภาพมีปัญหา: ' + v.errors[0]);
      if (!store.set('cb.theme.' + theme.id, theme)) { /* ภาพใหญ่เกินพื้นที่ — อาศัย SW cache */ }
      return theme;
    }).catch(function (e) {
      var cached = store.get('cb.theme.' + themeId, null);
      if (cached) return cached;
      throw e;
    });
  }

  function registerSW() {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ใช้งานต่อได้แม้ลงทะเบียนไม่สำเร็จ */ });
    }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  var api = {
    GRID: GRID, CELLS: CELLS, LINES: LINES, MIN_CHARACTERS: MIN_CHARACTERS, MAX_CHARACTERS: MAX_CHARACTERS,
    PRINT_RANGE_MAX: PRINT_RANGE_MAX, PHONE_MIN: PHONE_MIN, PHONE_MAX: PHONE_MAX,
    fnv1a: fnv1a, mulberry32: mulberry32, damm: damm, formatCode: formatCode, parseCode: parseCode,
    fingerprint: fingerprint, validateTheme: validateTheme, generateCard: generateCard,
    linesFromMarks: linesFromMarks, verifyCard: verifyCard, PATTERNS: PATTERNS, patternAtDraw: patternAtDraw, missingFor: missingFor, checkCardSet: checkCardSet,
    mediaSrc: mediaSrc, mediaType: mediaType, youtubeId: youtubeId, isText: isText, mediaAllowed: mediaAllowed, cellInner: cellInner, fitWords: fitWords, randomInt: randomInt, encodeSync: encodeSync, decodeSync: decodeSync, randomPhoneCardNumber: randomPhoneCardNumber, drawNext: drawNext, charMap: charMap,
    store: store, fetchJSON: fetchJSON, loadThemeIndex: loadThemeIndex, loadTheme: loadTheme,
    registerSW: registerSW, esc: esc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Bingo = api;
})(typeof window !== 'undefined' ? window : globalThis);
