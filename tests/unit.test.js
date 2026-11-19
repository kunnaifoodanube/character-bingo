// การทดสอบตรรกะหลัก: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const B = require('../assets/js/core.js');
const theme = require('../themes/sample-monsters.json');

test('ชุดภาพตัวอย่างผ่านการตรวจสอบ', () => {
  const v = B.validateTheme(theme);
  assert.ok(v.ok, v.errors.join());
  assert.equal(theme.characters.length, 24);
});

test('ตรวจจับชุดภาพที่ผิด: น้อยกว่า 24 ตัว / ไม่มีชื่อ / ไม่มีภาพ / รหัสซ้ำ', () => {
  const bad = JSON.parse(JSON.stringify(theme));
  bad.characters = bad.characters.slice(0, 20);
  bad.characters[0].name = '';
  bad.characters[1].img = '';
  bad.characters[2].id = bad.characters[3].id;
  const v = B.validateTheme(bad);
  assert.ok(!v.ok);
  assert.ok(v.errors.some(e => e.includes('อย่างน้อย 24')));
  assert.ok(v.errors.some(e => e.includes('ยังไม่ได้ตั้งชื่อ')));
  assert.ok(v.errors.some(e => e.includes('ไม่มีภาพ')));
  assert.ok(v.errors.some(e => e.includes('รหัสซ้ำ')));
});

test('บัตร: 16 ช่องไม่ซ้ำกัน และหมายเลขเดิมได้บัตรเดิมเสมอ', () => {
  for (let n = 1; n <= 2000; n++) {
    const c = B.generateCard(theme, n);
    assert.equal(c.length, 16);
    assert.equal(new Set(c).size, 16);
    assert.deepEqual(c, B.generateCard(theme, n));
  }
});

test('บัตรไม่ขึ้นกับลำดับตัวละครในไฟล์ (สลับลำดับแล้วยังเหมือนเดิม)', () => {
  const t2 = JSON.parse(JSON.stringify(theme));
  t2.characters.reverse();
  for (let n = 1; n <= 200; n++) assert.deepEqual(B.generateCard(theme, n), B.generateCard(t2, n));
  assert.equal(B.fingerprint(theme), B.fingerprint(t2));
});

test('เลขตรวจสอบ (Damm): จับเลขผิด 1 หลัก และสลับหลักติดกันได้ทุกกรณี', () => {
  let single = 0, swaps = 0;
  for (let n = 1; n <= 99999; n += 7) {
    const code = B.formatCode(n).replace('-', '');
    for (let p = 0; p < 6; p++) {
      for (let d = 0; d <= 9; d++) {
        if (String(d) === code[p]) continue;
        const bad = code.slice(0, p) + d + code.slice(p + 1);
        assert.equal(B.parseCode(bad).ok, false, 'ไม่จับ ' + bad);
        single++;
      }
      if (p < 5 && code[p] !== code[p + 1]) {
        const sw = code.slice(0, p) + code[p + 1] + code[p] + code.slice(p + 2);
        assert.equal(B.parseCode(sw).ok, false, 'ไม่จับการสลับ ' + sw);
        swaps++;
      }
    }
  }
  assert.ok(single > 700000 && swaps > 50000);
});

test('parseCode รองรับหลายรูปแบบ', () => {
  const code = B.formatCode(48213);
  assert.equal(B.parseCode(code).num, 48213);
  assert.equal(B.parseCode(code.replace('-', '')).num, 48213);
  assert.equal(B.parseCode(' ' + code + ' ').checked, true);
  assert.equal(B.parseCode('48213').checked, false);
  assert.equal(B.parseCode('').ok, false);
  assert.equal(B.parseCode('1234567').ok, false);
});

test('การสุ่มของพิธีกร: ไม่ซ้ำ ครบ 24 ตัว แล้วหยุด (ทดสอบ 2,000 เกม)', () => {
  for (let g = 0; g < 2000; g++) {
    const draws = [];
    let x;
    while ((x = B.drawNext(theme, draws)) !== null) draws.push(x);
    assert.equal(draws.length, 24);
    assert.equal(new Set(draws).size, 24);
  }
});

test('ตรวจรางวัลตรงกับนิยามแบบ brute-force (สุ่ม 20,000 กรณี)', () => {
  for (let k = 0; k < 20000; k++) {
    const num = B.randomInt(1, 99999);
    const draws = []; let x; const take = B.randomInt(0, 24);
    while (draws.length < take && (x = B.drawNext(theme, draws)) !== null) draws.push(x);
    const r = B.verifyCard(theme, num, draws);
    const cells = B.generateCard(theme, num);
    const set = new Set(draws);
    const expect = B.LINES.some(l => l.cells.every(i => set.has(cells[i])));
    assert.equal(r.bingo, expect);
    if (r.bingo) {
      // ตัวที่ทำให้ครบแนวต้องอยู่ในลำดับที่บอกจริง
      const w = r.winning[0];
      const prefix = new Set(draws.slice(0, w.completedAtDraw));
      assert.ok(w.cells.every(i => prefix.has(cells[i])));
      const prefixLess = new Set(draws.slice(0, w.completedAtDraw - 1));
      assert.ok(!w.cells.every(i => prefixLess.has(cells[i])));
    }
  }
});

test('กันแจ้งชนะผิด: ผู้เล่นแตะครบแนวเอง แต่ตัวละครยังไม่ถูกเรียก → ตรวจไม่ผ่าน', () => {
  let falseClaims = 0;
  for (let k = 0; k < 5000; k++) {
    const num = B.randomInt(10000, 99999);
    const draws = []; let x;
    while (draws.length < 3 && (x = B.drawNext(theme, draws)) !== null) draws.push(x); // สุ่มแค่ 3 ตัว (ยังไม่มีใครชนะได้)
    const marks = B.LINES[k % 10].cells;      // ผู้เล่นโกง/แตะผิด ครบ 1 แนว
    assert.equal(B.linesFromMarks(marks).length >= 1, true); // มือถือขึ้น BINGO
    const r = B.verifyCard(theme, num, draws);
    assert.equal(r.bingo, false);              // แต่ตรวจจริงไม่ผ่าน
    falseClaims++;
  }
  assert.equal(falseClaims, 5000);
});

test('ตรวจชุดบัตรกระดาษ 1–9999 ไม่มีบัตรซ้ำกันทุกช่อง', () => {
  const nums = Array.from({ length: 9999 }, (_, i) => i + 1);
  const r = B.checkCardSet(theme, nums);
  assert.equal(r.identicalCards.length, 0);
});

test('จำลองผู้เล่น 100 คน × 1,000 เกม: สถิติสำหรับวางแผนกิจกรรม', () => {
  const games = 1000, players = 100;
  let numCollisionGames = 0, identicalCardGames = 0;
  const firstWinDraw = [], winnersAtFirst = [], per = {};
  for (let g = 0; g < games; g++) {
    const nums = Array.from({ length: players }, () => B.randomPhoneCardNumber());
    if (new Set(nums).size < players) numCollisionGames++;
    const r = B.checkCardSet(theme, [...new Set(nums)]);
    if (r.identicalCards.length) identicalCardGames++;
    const draws = []; let x;
    while ((x = B.drawNext(theme, draws)) !== null) draws.push(x);
    const res = nums.map(n => B.verifyCard(theme, n, draws));
    for (const pid of Object.keys(B.PATTERNS)) {
      const at = res.map(r => B.patternAtDraw(r, pid));
      const first = Math.min(...at);
      (per[pid] = per[pid] || { first: [], ties: [] });
      per[pid].first.push(first);
      per[pid].ties.push(at.filter(v => v === first).length);
    }
    const results = res.map(r => r.firstBingoAtDraw);
    const first = Math.min(...results);
    firstWinDraw.push(first);
    winnersAtFirst.push(results.filter(v => v === first).length);
  }
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
  const stats = {
    games, players,
    pctGamesWithSameCardNumber: (numCollisionGames / games * 100).toFixed(1) + '%',
    pctGamesWithIdenticalCardsBesidesSameNumber: (identicalCardGames / games * 100).toFixed(1) + '%',
    firstWinnerAtDraw_avg: avg(firstWinDraw).toFixed(1),
    firstWinnerAtDraw_p10_p50_p90: [pct(firstWinDraw, .1), pct(firstWinDraw, .5), pct(firstWinDraw, .9)],
    simultaneousWinners_avg: avg(winnersAtFirst).toFixed(2),
    pctGamesWithMoreThanOneFirstWinner: (winnersAtFirst.filter(v => v > 1).length / games * 100).toFixed(1) + '%',
    maxSimultaneousWinners: Math.max(...winnersAtFirst),
    byPattern: Object.fromEntries(Object.entries(per).map(([k, v]) => [k, {
      name: B.PATTERNS[k].name,
      firstWinnerAtDraw_avg: avg(v.first).toFixed(1),
      firstWinnerAtDraw_p10_p50_p90: [pct(v.first, .1), pct(v.first, .5), pct(v.first, .9)],
      simultaneousWinners_avg: avg(v.ties).toFixed(2),
      pctGamesWithTie: (v.ties.filter(x => x > 1).length / games * 100).toFixed(1) + '%',
      maxSimultaneousWinners: Math.max(...v.ties)
    }]))
  };
  require('fs').writeFileSync(__dirname + '/sim-100-players.json', JSON.stringify(stats, null, 2));
  console.log(stats);
  assert.ok(firstWinDraw.every(v => v >= 4 && v <= 24));
});

test('QR ซิงก์: เข้ารหัส/ถอดรหัสได้ตรง ทุกลำดับการสุ่ม และสั้นพอสำหรับ QR', () => {
  for (let g = 0; g < 500; g++) {
    const draws = []; let x; const take = B.randomInt(0, 24);
    while (draws.length < take && (x = B.drawNext(theme, draws)) !== null) draws.push(x);
    const round = { id: 'r' + g.toString(36), no: g % 9 + 1, pattern: ['line1', 'line2', 'full'][g % 3], draws };
    const txt = B.encodeSync(theme, round);
    assert.ok(txt.length <= 60, 'ยาว ' + txt.length);
    const d = B.decodeSync(txt, theme);
    assert.ok(d.ok);
    assert.deepEqual(d.draws, draws);
    assert.equal(d.roundId, round.id); assert.equal(d.roundNo, round.no); assert.equal(d.pattern, round.pattern);
  }
});

test('QR ซิงก์: ปฏิเสธ QR คนละชุดภาพ / QR อื่น / QR เสีย', () => {
  const other = JSON.parse(JSON.stringify(theme)); other.id = 'other-theme';
  const txt = B.encodeSync(other, { id: 'r1', no: 1, pattern: 'line1', draws: [other.characters[0].id] });
  assert.equal(B.decodeSync(txt, theme).ok, false);
  assert.match(B.decodeSync(txt, theme).error, /คนละชุด/);
  assert.equal(B.decodeSync('https://example.com', theme).ok, false);
  const good = B.encodeSync(theme, { id: 'r1', no: 1, pattern: 'line1', draws: [] });
  assert.equal(B.decodeSync(good + '~', theme).ok, false);
});

// ---------- Film & Animation Bingo (โหมดคำศัพท์ 32 คำ) ----------
const film = require('../themes/film-animation.json');

test('Film & Animation: 32 คำครบตามรายการ ผ่านการตรวจสอบ ไม่มีคำซ้ำ', () => {
  const v = B.validateTheme(film);
  assert.ok(v.ok, v.errors.join());
  assert.deepEqual(v.warnings, []);
  assert.equal(film.display, 'text');
  assert.equal(film.characters.length, 32);
  const g = {}; film.characters.forEach(c => { g[c.group] = (g[c.group] || 0) + 1; });
  assert.deepEqual(g, { genre: 15, format: 6, animation: 11 });
  const names = film.characters.map(c => c.name);
  assert.equal(new Set(names.map(n => n.toLowerCase())).size, 32);
  for (const n of ['Action', 'Spy', 'Documentary', 'Slow Motion', '2D Animation', 'Rotoscoping', 'Sand Animation', 'Flipbook']) assert.ok(names.includes(n), n);
  film.characters.forEach(c => assert.ok(c.th && c.th.trim(), 'ไม่มีคำแปล: ' + c.name));
});

test('Film & Animation: ทุกคำเป็นการ์ดภาพของอาจารย์ (ไฟล์ในเว็บไซต์ 1920×1080) พร้อมเครดิต และมีภาพสำรองจาก Wikimedia Commons', () => {
  const okLic = /^(Public domain|CC0|CC BY 2\.0|CC BY 3\.0|CC BY-SA 3\.0|CC BY-SA 4\.0)$/;
  const fs = require('node:fs'), path = require('node:path');
  const srcs = new Set();
  film.characters.forEach(c => {
    const cr = c.credit;
    for (const k of ['title', 'author', 'sourceUrl', 'license', 'status', 'file']) assert.ok(cr[k], c.name + ' ไม่มี ' + k);
    assert.equal(cr.status, 'ok'); assert.equal(B.mediaType(c), 'image'); assert.ok(B.mediaAllowed(c));
    assert.equal(B.mediaSrc(c), 'themes/film-animation/' + c.id + '.webp'); srcs.add(B.mediaSrc(c));
    assert.ok(fs.existsSync(path.join(__dirname, '..', B.mediaSrc(c))), 'ไม่พบไฟล์ ' + B.mediaSrc(c));
    const f = c.fallback, fc = c.fallbackCredit;
    assert.ok(f && fc, 'ไม่มีภาพสำรอง ' + c.name);
    assert.match(f.type === 'video' ? f.poster : f.src, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\//);
    assert.match(fc.license, okLic);
  });
  assert.equal(srcs.size, 32, 'ภาพซ้ำกัน');
});

test('Film & Animation: สื่อที่ยังไม่ยืนยันสิทธิ์จะไม่ถูกแสดง', () => {
  const c = JSON.parse(JSON.stringify(film.characters[0]));
  c.credit.status = 'pending'; assert.equal(B.mediaAllowed(c), false);
  c.credit.status = 'link-only'; assert.equal(B.mediaAllowed(c), false);
  const t = JSON.parse(JSON.stringify(film)); t.characters[0] = c;
  assert.match(B.validateTheme(t).warnings.join(), /ยังไม่ยืนยันสิทธิ์/);
  const own = { id: 'x', name: 'X', img: 'data:image/png;base64,AAAA' }; // ภาพที่อัปโหลดเองในชุดภาพปกติ
  assert.equal(B.mediaAllowed(own), true);
  assert.equal(B.youtubeId('https://youtu.be/hEJnMQG9ev8?t=4'), 'hEJnMQG9ev8');
  assert.equal(B.youtubeId('https://www.youtube.com/shorts/hEJnMQG9ev8'), 'hEJnMQG9ev8');
  assert.equal(B.youtubeId('https://example.com/watch?v=hEJnMQG9ev8'), '');
});

test('Film & Animation: บัตรผู้เล่นมี 16 คำไม่ซ้ำ เป็นข้อความอย่างเดียว และ 10,000 บัตรไม่มีบัตรซ้ำ', () => {
  const nums = []; for (let n = 10000; n < 20000; n++) nums.push(n);
  const chk = B.checkCardSet(film, nums);
  assert.equal(chk.identicalCards.length, 0);
  const m = B.charMap(film);
  for (let n = 1; n <= 200; n++) {
    const cells = B.generateCard(film, n);
    assert.equal(cells.length, 16); assert.equal(new Set(cells).size, 16);
    const html = B.cellInner(film, m[cells[0]]);
    assert.ok(!/img|video|ภาพ/.test(html) && !html.includes(m[cells[0]].th), html);
  }
});

test('Film & Animation: สุ่มครบ 32 คำไม่ซ้ำ และตรวจบิงโกจากประวัติพิธีกรเท่านั้น', () => {
  let draws = [], x;
  while ((x = B.drawNext(film, draws)) !== null) draws.push(x);
  assert.equal(draws.length, 32); assert.equal(new Set(draws).size, 32);
  const r = B.verifyCard(film, 12345, draws);
  assert.equal(r.fullAtDraw !== null, true);
  assert.equal(B.verifyCard(film, 12345, []).bingo, false);
  // กดมั่ว: ผู้เล่นแตะครบแถวแต่พิธีกรยังไม่เรียก → ไม่ได้รางวัล
  const card = B.generateCard(film, 777);
  const partial = card.slice(0, 3);
  assert.equal(B.verifyCard(film, 777, partial).bingo, false);
  assert.equal(B.verifyCard(film, 777, card.slice(0, 4)).bingo, true);
});

test('Film & Animation: จำลองผู้เล่น 100 คน — ผู้ชนะคนแรกมาเมื่อสุ่มกี่คำ', () => {
  const res = { line1: [], line2: [], full: [] };
  for (let g = 0; g < 300; g++) {
    let draws = [], x; while ((x = B.drawNext(film, draws)) !== null) draws.push(x);
    const cards = []; for (let p = 0; p < 100; p++) cards.push(B.verifyCard(film, 10000 + g * 100 + p, draws));
    for (const pid of ['line1', 'line2', 'full']) res[pid].push(Math.min(...cards.map(c => B.patternAtDraw(c, pid))));
  }
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const out = {}; for (const k in res) out[k] = +avg(res[k]).toFixed(1);
  console.log('ผู้เล่น 100 คน, 32 คำ — เฉลี่ยผู้ชนะคนแรก:', JSON.stringify(out));
  assert.ok(out.line1 >= 4 && out.line1 < out.line2 && out.line2 < out.full && out.full <= 32);
});
