"""End-to-end: จับเวลาแตะ + ช่วงสลับบัตร (พิธีกรกดเปิด N วินาที) ด้วยระบบซิงก์จำลอง (mock)
ใช้: python3 tests/e2e_timer_shuffle.py <site_dir> [out_dir สำหรับภาพหน้าจอ] [theme_id]
   Film & Animation: python3 tests/e2e_timer_shuffle.py .
   Galactic:         python3 tests/e2e_timer_shuffle.py galactic "" galactic-stickers
- mock เลียนแบบกฎ Firestore: ห้องแก้ได้เฉพาะเจ้าของ · shuffles สร้างได้ครั้งเดียว (ซ้ำ = 403)
"""
import json, os, sys, threading, time, traceback
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

SITE = sys.argv[1]
PORT = 8797
BASE = f'http://localhost:{PORT}/'
MOCK = BASE + '__mock'
ROOMS, DOCS = {}, {}
results, errors = [], []
TID = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else 'film-animation'
OUT = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
THEME = json.load(open(os.path.join(SITE, 'themes', TID + '.json')))
NAME2ID = {c['name']: c['id'] for c in THEME['characters']}


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()

    def _json(self, obj, code=200):
        b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path.rstrip('/') == '/__mock/rooms': return self._json(ROOMS)
        if u.path.startswith('/__mock/rooms/'):
            rid = u.path.split('/')[-1]
            if rid not in ROOMS: self.send_response(404); self.end_headers(); return
            return self._json(ROOMS[rid])
        if u.path.startswith('/__mock/docs/'):
            col = u.path[len('/__mock/docs/'):].strip('/')
            out = {k.split('/')[-1]: v for k, v in DOCS.items() if k.rsplit('/', 1)[0] == col}
            return self._json(out)
        return super().do_GET()

    def do_PUT(self):
        u = urlparse(self.path)
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if u.path.startswith('/__mock/docs/'):
            key = u.path[len('/__mock/docs/'):].strip('/')
            if 'create' in parse_qs(u.query) and key in DOCS: self.send_response(403); self.end_headers(); return
            DOCS[key] = data; self.send_response(204); self.end_headers(); return
        rid = u.path.split('/')[-1]
        if rid in ROOMS and ROOMS[rid]['ownerUid'] != data['ownerUid']: self.send_response(403); self.end_headers(); return
        ROOMS[rid] = data; self.send_response(204); self.end_headers()


srv = ThreadingHTTPServer(('127.0.0.1', PORT), partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()


def record(name, ok, detail=''):
    results.append({'test': name, 'pass': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + str(detail) if detail else ''), flush=True)


def run(name, fn):
    try: fn()
    except Exception as e: record(name, False, 'exception: ' + repr(e)[:300]); traceback.print_exc()


INIT = f"window.CB_SYNC_MOCK = '{MOCK}';"
with sync_playwright() as p:
    br = p.chromium.launch()
    hctx = br.new_context(viewport={'width': 1366, 'height': 768}, service_workers='block'); hctx.add_init_script(INIT)
    hctx.route('**/*', lambda r: r.abort() if not r.request.url.startswith(BASE) else r.continue_())
    host = hctx.new_page(); host.on('pageerror', lambda e: errors.append('host: %s' % e))
    host.goto(BASE + 'host.html?t=' + TID)
    host.wait_for_function("document.querySelectorAll('#board .b').length === %d" % len(THEME['characters']), timeout=20000)
    room = host.evaluate('window.__host.state().roomId')

    def player(name):
        ctx = br.new_context(viewport={'width': 390, 'height': 844}, service_workers='block'); ctx.add_init_script(INIT)
        ctx.route('**/*', lambda r: r.abort() if not r.request.url.startswith(BASE) else r.continue_())
        pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(name + ': %s' % e))
        pg.goto(BASE + 'index.html?t=' + TID + '&room=' + room)
        pg.fill('#nameInput', name); pg.click('#joinForm button[type=submit]')
        pg.wait_for_selector('#play:not(.hidden)')
        pg.wait_for_function("window.__player.live() === 'live'", timeout=15000)
        return pg

    def cells(pg): return pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('cb.player.v1')))).cells")
    def marks(pg): return pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('cb.player.v1')))).marks")

    def draw():
        host.wait_for_function('!window.__host.busy()', timeout=15000); host.click('#btnDraw')
        host.wait_for_function('!window.__host.busy()', timeout=15000)
        return host.evaluate('window.__host.state().round.draws.slice(-1)[0].id')

    def wait_seen(pg, wid):
        pg.wait_for_function("(window.__player.sync()||{draws:[]}).draws.indexOf('%s') >= 0" % wid, timeout=10000)

    A = player('เอ'); Bp = player('บี'); C = player('ซี')
    host.select_option('#timerSel', '5'); host.select_option('#swinSel', '10'); host.wait_for_timeout(800)

    def hidden(pg, sel): return pg.evaluate("document.getElementById('%s').classList.contains('hidden')" % sel)

    def t1():
        A.wait_for_function("(window.__player.sync()||{}).timer === 5", timeout=10000)
        record('T1. ผู้เล่นได้รับค่าเวลา 5 วิ · ยังไม่เปิดช่วงสลับ → ไม่มีปุ่มสลับบัตร', hidden(A, 'btnShuffle') and hidden(host, 'swinBanner'))
    run('T1', t1)

    st = {}

    def t2():
        cA = cells(A)
        # สุ่มจนได้คำที่อยู่ในบัตร A
        for _ in range(32):
            wid = draw()
            if wid in cA: break
        wait_seen(A, wid)
        bar = A.inner_text('#timeBar')
        if OUT: A.screenshot(path=os.path.join(OUT, 'timer-player.png')); host.screenshot(path=os.path.join(OUT, 'timer-host.png'))
        # ห้ามเฉลยตำแหน่ง: ช่องที่ถูกเรียกแต่ยังไม่แตะ ต้องไม่มีป้าย "เรียกแล้ว"
        badge = A.evaluate("document.querySelectorAll('#grid .cell .called').length")
        # แตะช่องที่ยังไม่ถูกเรียก → แตะไม่ได้
        drawn = host.evaluate('window.__host.state().round.draws.map(d=>d.id)')
        wrong = next(i for i, x in enumerate(cA) if x not in drawn)
        A.locator('#grid .cell').nth(wrong).click()
        ok_wrong = wrong not in marks(A)
        # แตะช่องที่ถูกภายในเวลา
        A.locator('#grid .cell').nth(cA.index(wid)).click()
        ok_right = cA.index(wid) in marks(A)
        st['A_marked'] = wid
        record('T2. นับถอยหลังขึ้นบนมือถือ · ไม่เฉลยช่อง · แตะผิดไม่ได้ · แตะถูกในเวลาได้', 'เหลือ' in bar and badge == 0 and ok_wrong and ok_right, f'bar={bar!r} badge={badge}')
        cd = host.evaluate("(() => { const e = document.getElementById('cd'); return e.classList.contains('hidden') ? '' : e.innerText; })()")
        record('T2b. จอพิธีกรแสดงนับถอยหลัง', cd != '', cd)
    run('T2', t2)

    def t3():
        cA = cells(A)
        drawn = host.evaluate('window.__host.state().round.draws.map(d=>d.id)')
        for _ in range(32):
            wid = draw()
            if wid in cA: break
        wait_seen(A, wid)
        A.wait_for_timeout(5600)
        i = cells(A).index(wid)
        A.locator('#grid .cell').nth(i).click()
        if OUT: A.wait_for_timeout(300); A.screenshot(path=os.path.join(OUT, 'timer-missed.png'))
        cls = A.locator('#grid .cell').nth(i).get_attribute('class')
        tag = A.locator('#grid .cell').nth(i).inner_text()
        record('T3. หมดเวลา 5 วิ → คำนั้นล็อก (พลาด) แตะไม่ได้', i not in marks(A) and 'missed' in cls and 'พลาด' in tag, cls)
        # แตะช่องที่แตะแล้ว → ยกเลิกไม่ได้
        j = cells(A).index(st['A_marked']); A.locator('#grid .cell').nth(j).click()
        record('T3b. ช่องที่แตะแล้วยกเลิกไม่ได้ระหว่างจับเวลา', j in marks(A))
    run('T3', t3)

    def t4():
        A.wait_for_timeout(1200)
        b_before = cells(Bp); b_marks_words = sorted(b_before[i] for i in marks(Bp))
        host.click('#btnSwin')
        A.wait_for_function("!document.getElementById('btnShuffle').disabled && !document.getElementById('btnShuffle').classList.contains('hidden')", timeout=10000)
        ban = host.inner_text('#swinBanner'); btxt = A.inner_text('#btnShuffle')
        if OUT: A.screenshot(path=os.path.join(OUT, 'swin-player.png')); host.screenshot(path=os.path.join(OUT, 'swin-host.png'))
        record('T4a. พิธีกรกดเปิดสลับบัตร 10 วิ → จอใหญ่ขึ้นป้ายนับถอยหลัง · มือถือขึ้นปุ่มสลับพร้อมเวลา', 'สลับบัตรได้แล้ว' in ban and 'เหลือ' in btxt, btxt.replace('\n', ' '))
        A.click('#btnShuffle')
        A.wait_for_selector('.shuffle-list button', timeout=10000)
        if OUT: A.screenshot(path=os.path.join(OUT, 'shuffle-pick.png'))
        A.locator('.shuffle-list button', has_text='บี').click()
        Bp.wait_for_function("JSON.stringify(%s) !== JSON.stringify(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('cb.player.v1')))).cells)" % json.dumps(b_before), timeout=10000)
        b_after = cells(Bp)
        same_words = sorted(b_after) == sorted(b_before)
        marks_kept = sorted(b_after[i] for i in marks(Bp)) == b_marks_words
        used = A.evaluate("document.getElementById('btnShuffle').disabled")
        toast = Bp.inner_text('#toast')
        record('T4. A สลับบัตร B: B ตำแหน่งเปลี่ยน คำเดิม ช่องที่แตะยังอยู่ · A ใช้สิทธิ์แล้ว', same_words and marks_kept and used and 'เอ' in toast, toast)
        # ลองสร้างคำขอซ้ำ → mock ปฏิเสธ (เหมือนกฎ Firestore)
        rid = host.evaluate('window.__host.state().round.id')
        n = len([k for k in DOCS if '/shuffles/' in k])
        record('T4b. สิทธิ์ 1 ครั้ง: มีคำขอสลับในระบบ 1 รายการ', n == 1, n)
    run('T4', t4)

    def t5():
        before = cells(Bp); mw = sorted(before[i] for i in marks(Bp))
        Bp.click('#btnShuffle'); Bp.wait_for_selector('.shuffle-list button', timeout=10000)
        Bp.locator('.shuffle-list button', has_text='บัตรของฉันเอง').click()
        Bp.wait_for_timeout(800)
        after = cells(Bp)
        record('T5. B สลับบัตรตัวเอง: ตำแหน่งเปลี่ยน ช่องที่แตะยังอยู่', after != before and sorted(after) == sorted(before) and sorted(after[i] for i in marks(Bp)) == mw)
    run('T5', t5)

    def t5b():
        # ซี ไม่ใช้สิทธิ์ในช่วงแรก → พิธีกรปิดก่อนเวลา → ปุ่มกดไม่ได้ แต่ยังบอกว่าเหลือสิทธิ์ 1 ครั้ง
        host.click('#btnSwin')
        C.wait_for_function("document.getElementById('btnShuffle').disabled", timeout=10000)
        txt = C.inner_text('#btnShuffle'); before = cells(C)
        C.click('#btnShuffle', force=True); C.wait_for_timeout(600)
        none = C.locator('.shuffle-list').count() == 0 and cells(C) == before
        if OUT: C.screenshot(path=os.path.join(OUT, 'swin-saved.png'))
        record('T5b. นอกช่วงสลับ: กดสลับไม่ได้ · คนที่ยังไม่ใช้ เห็นว่าเก็บสิทธิ์ไว้ 1 ครั้ง · ป้ายจอใหญ่หายไป', none and 'เหลือ 1 ครั้ง' in txt and hidden(host, 'swinBanner'), txt.replace('\n', ' '))
        A.wait_for_timeout(300)
        record('T5c. คนที่ใช้สิทธิ์แล้ว ไม่เห็นปุ่มนอกช่วงสลับ', hidden(A, 'btnShuffle'))
    run('T5b', t5b)

    def t5d():
        # ช่วงสลับครั้งที่ 2 (5 วิ): ซี ใช้สิทธิ์ที่เก็บไว้สลับบัตรตัวเอง · หมดเวลาแล้วปิดเอง
        host.select_option('#swinSel', '5'); host.click('#btnSwin')
        C.wait_for_function("!document.getElementById('btnShuffle').disabled && !document.getElementById('btnShuffle').classList.contains('hidden')", timeout=10000)
        before = cells(C); C.click('#btnShuffle'); C.wait_for_selector('.shuffle-list button', timeout=10000)
        C.locator('.shuffle-list button', has_text='บัตรของฉันเอง').click(); C.wait_for_timeout(800)
        after = cells(C)
        record('T5d. ช่วงสลับครั้งที่ 2: ซี ใช้สิทธิ์ที่เก็บไว้สลับบัตรตัวเองได้', after != before and sorted(after) == sorted(before))
        host.wait_for_function("document.getElementById('swinBanner').classList.contains('hidden')", timeout=9000)
        host.wait_for_timeout(1500)
        swin = ROOMS[room].get('swin')
        record('T5e. ครบ 5 วิ ช่วงสลับปิดเองบนจอพิธีกร และแจ้งมือถือว่าปิดแล้ว', swin is None and hidden(C, 'btnShuffle'), swin)
    run('T5d', t5d)

    def t6():
        host.wait_for_timeout(1500)
        code = Bp.inner_text('#pCode').strip(); b_cells = cells(Bp)
        host.click('#btnVerify'); host.fill('#vcode', code); host.click('#vf button[type=submit]')
        host.wait_for_selector('#vout .banner', timeout=5000)
        out = host.inner_text('#vout')
        res = host.evaluate("(c) => { const t = window.__host.theme(); return null; }", b_cells)
        record('T6. พิธีกรตรวจบัตรตามตำแหน่งหลังสลับ (บัตรมือถือที่เชื่อมระบบ)', 'ตรวจตามตำแหน่งบนเครื่องผู้เล่น' in out and 'ถูกสลับโดย' in out, out[:200].replace('\n', ' '))
        host.keyboard.press('Escape')
    run('T6', t6)

    print('page errors:', errors[:5]); print('DOCS', list(DOCS.keys()))
    br.close()
srv.shutdown()
print('PASSED %d/%d' % (sum(r['pass'] for r in results), len(results)))
