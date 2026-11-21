"""End-to-end: จับเวลาแตะ + ช่วงสลับบัตร (พิธีกรกดเปิด N วินาที → มือถือเด้งหน้าต่างเลือก) ด้วยระบบซิงก์จำลอง (mock)
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

    A = player('เอ'); Bp = player('บี'); C = player('ซี'); D = player('ดี'); F = player('เอฟ')
    swin_default = host.input_value('#swinSel')
    host.select_option('#timerSel', '5'); host.wait_for_timeout(800)

    def hidden(pg, sel): return pg.evaluate("document.getElementById('%s').classList.contains('hidden')" % sel)
    def bar(pg): return pg.inner_text('#btnShuffle').replace('\n', ' ')
    def bar_on(pg): return pg.evaluate("document.getElementById('btnShuffle').classList.contains('on') && !document.getElementById('btnShuffle').disabled")
    def picker_open(pg): return pg.locator('.sp-back .shuffle-list').count() > 0
    def wait_picker(pg): pg.wait_for_selector('.sp-back .shuffle-list .sp-item', timeout=10000)
    def select(pg, text):
        wait_picker(pg); pg.locator('.shuffle-list .sp-item', has_text=text).click()
    def confirm(pg): pg.click('.sp-back .actions .sp-go')

    def t1():
        A.wait_for_function("(window.__player.sync()||{}).timer === 5", timeout=10000)
        A.wait_for_function("!document.getElementById('btnShuffle').classList.contains('hidden')", timeout=10000)
        t = bar(A)
        if OUT: A.screenshot(path=os.path.join(OUT, 'bar-idle.png'))
        record('T1. ค่าเริ่มต้นช่วงสลับ 30 วิ · มือถือเห็นแถบสลับบัตรเหนือบัตรตลอด (สิทธิ์ 1/1 · โดนสลับ 0/2 · รอพิธีกร) · ยังกดไม่ได้',
               swin_default == '30' and '1/1' in t and '0/2' in t and 'รอพิธีกร' in t and not bar_on(A) and hidden(host, 'swinBanner'), f'default={swin_default} bar={t}')
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
        for pg in (A, Bp, C, D, F): wait_picker(pg)
        ban = host.inner_text('#swinBanner'); n0 = int(A.inner_text('.sp-n'))
        me = A.inner_text('.sp-me').replace('\n', ' ')
        b_item = A.locator('.shuffle-list .sp-item', has_text='บี').inner_text().replace('\n', ' ')
        go_dis = A.is_disabled('.sp-back .actions .sp-go')
        if OUT: A.screenshot(path=os.path.join(OUT, 'swin-popup.png')); host.screenshot(path=os.path.join(OUT, 'swin-host.png'))
        record('T4a. พิธีกรกดเปิดสลับบัตร → มือถือทุกเครื่องเด้งหน้าต่างเลือกเอง นับถอยหลัง 30 วิ · รายชื่อบอกโดนแล้ว 0/2 · ต้องเลือกก่อนถึงกดสลับได้',
               'สลับบัตรได้แล้ว' in ban and 27 <= n0 <= 30 and '0/2' in me and '0/2' in b_item and go_dis, f'n={n0} me={me} item={b_item}')
        # ลำดับรายชื่อสุ่มแยกแต่ละเครื่อง · บัตรของฉันอยู่แถวกลาง · ลำดับไม่กระโดดระหว่างเลือก
        names = ['เอ', 'บี', 'ซี', 'ดี', 'เอฟ']
        def order(pg):
            return pg.evaluate("Array.from(document.querySelectorAll('.shuffle-list .sp-item')).map(b => b.classList.contains('self') ? '*' : b.querySelector('.sp-name').innerText.trim())")
        views = {n: order(pg) for n, pg in zip(names, (A, Bp, C, D, F))}
        A.wait_for_timeout(1200)
        stable = order(A) == views['เอ']
        mids = all(v.index('*') == 3 and len(v) == 5 for v in views.values())
        rel = set()
        for v in views.values():
            rel.add(tuple(x for x in v if x in ('ดี', 'เอฟ')) if 'ดี' in v and 'เอฟ' in v else None)
        pairs = {}
        for n, v in views.items():
            fr = [x for x in v if x != '*']
            for i in range(len(fr)):
                for j in range(i + 1, len(fr)):
                    k = tuple(sorted((fr[i], fr[j]))); pairs.setdefault(k, set()).add(fr[i] == k[0])
        differs = any(len(x) > 1 for x in pairs.values())
        record('T4c. รายชื่อสุ่มลำดับไม่เหมือนกันทุกเครื่อง · บัตรของฉันอยู่แถวกลาง (เต็มความกว้าง) · ลำดับคงที่ระหว่างเลือก', differs and mids and stable,
               ' | '.join(n + ':' + ','.join(v) for n, v in views.items()))
        select(A, 'บี')
        go = A.inner_text('.sp-back .actions .sp-go')
        if OUT: A.screenshot(path=os.path.join(OUT, 'swin-selected.png'))
        confirm(A)
        Bp.wait_for_function("JSON.stringify(%s) !== JSON.stringify(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('cb.player.v1')))).cells)" % json.dumps(b_before), timeout=10000)
        b_after = cells(Bp)
        same_words = sorted(b_after) == sorted(b_before)
        marks_kept = sorted(b_after[i] for i in marks(Bp)) == b_marks_words
        A.wait_for_timeout(300)
        used = A.evaluate("document.getElementById('btnShuffle').disabled") and '0/1' in bar(A) and not picker_open(A)
        toast = Bp.inner_text('#toast')
        Bp.wait_for_function("document.querySelector('.sp-me') && document.querySelector('.sp-me').innerText.indexOf('1/2') >= 0", timeout=5000)
        if OUT: Bp.screenshot(path=os.path.join(OUT, 'swin-hit.png'))
        record('T4. A เลือกบี → กดสลับ: บีตำแหน่งเปลี่ยน คำเดิม ช่องที่แตะยังอยู่ · บีเห็นโดนสลับ 1/2 · A ใช้สิทธิ์แล้ว (0/1)',
               same_words and marks_kept and used and 'เอ' in toast and 'บี' in go and '1/2' in bar(Bp), f'go={go} toast={toast} barB={bar(Bp)}')
        n = len([k for k in DOCS if '/shuffles/' in k])
        record('T4b. สิทธิ์ 1 ครั้ง: มีคำขอสลับในระบบ 1 รายการ', n == 1, n)
    run('T4', t4)

    def t5():
        before = cells(Bp); mw = sorted(before[i] for i in marks(Bp))
        select(Bp, 'บัตรของฉันเอง'); confirm(Bp)
        Bp.wait_for_timeout(800)
        after = cells(Bp)
        record('T5. บีสลับบัตรตัวเอง (หน้าต่างเดิมที่เด้งขึ้นมา): ตำแหน่งเปลี่ยน ช่องที่แตะยังอยู่ · ไม่นับเป็นโดนสลับ',
               after != before and sorted(after) == sorted(before) and sorted(after[i] for i in marks(Bp)) == mw and '1/2' in bar(Bp), bar(Bp))
    run('T5', t5)

    def t5b():
        # เอฟกด "เก็บสิทธิ์ไว้ก่อน" → หน้าต่างปิด แถบยังกดเปิดใหม่ได้ระหว่างช่วงสลับ
        F.click('.sp-back .actions .btn.ghost'); F.wait_for_timeout(300)
        closed = not picker_open(F) and bar_on(F)
        F.click('#btnShuffle'); wait_picker(F); reopened = picker_open(F)
        record('T5a. กดเก็บสิทธิ์ไว้ก่อน → หน้าต่างปิด · แตะแถบสลับบัตรเปิดใหม่ได้ก่อนหมดเวลา', closed and reopened)
        # ซี ไม่ใช้สิทธิ์ → พิธีกรปิดก่อนเวลา → หน้าต่างปิดเอง แถบกดไม่ได้ แต่ยังบอกว่ามีสิทธิ์ 1/1
        host.click('#btnSwin')
        C.wait_for_function("document.getElementById('btnShuffle').disabled && !document.querySelector('.sp-back')", timeout=10000)
        txt = bar(C); before = cells(C)
        C.click('#btnShuffle', force=True); C.wait_for_timeout(600)
        none = not picker_open(C) and cells(C) == before
        if OUT: C.screenshot(path=os.path.join(OUT, 'swin-saved.png'))
        record('T5b. นอกช่วงสลับ: หน้าต่างปิดเอง กดสลับไม่ได้ · คนที่ยังไม่ใช้ เห็นสิทธิ์ 1/1 · ป้ายจอใหญ่หายไป', none and '1/1' in txt and 'รอพิธีกร' in txt and hidden(host, 'swinBanner'), txt)
        A.wait_for_timeout(300)
        record('T5c. คนที่ใช้สิทธิ์แล้ว ยังเห็นแถบสถานะ (สิทธิ์ 0/1 · ใช้สิทธิ์รอบนี้แล้ว)', not hidden(A, 'btnShuffle') and '0/1' in bar(A) and 'ใช้สิทธิ์' in bar(A), bar(A))
    run('T5b', t5b)

    def t5d():
        # ช่วงสลับครั้งที่ 2 (10 วิ): ซี ใช้สิทธิ์ที่เก็บไว้สลับบัตรตัวเอง · ระหว่างช่วงสลับสุ่มไม่ได้ · หมดเวลาแล้วปิดเอง
        host.select_option('#swinSel', '10'); host.click('#btnSwin')
        wait_picker(C)
        before = cells(C); select(C, 'บัตรของฉันเอง'); confirm(C); C.wait_for_timeout(800)
        after = cells(C)
        record('T5d. ช่วงสลับครั้งที่ 2: ซี ใช้สิทธิ์ที่เก็บไว้สลับบัตรตัวเองได้', after != before and sorted(after) == sorted(before))
        n0 = len(host.evaluate('window.__host.state().round.draws'))
        host.click('#btnDraw'); host.wait_for_timeout(500)
        n1 = len(host.evaluate('window.__host.state().round.draws'))
        record('T5f. ระหว่างเปิดช่วงสลับ พิธีกรสุ่มตัวถัดไปไม่ได้ (มีข้อความบอก)', n0 == n1 and 'ช่วงสลับ' in host.inner_text('#toast'), host.inner_text('#toast'))
        host.wait_for_function("document.getElementById('swinBanner').classList.contains('hidden')", timeout=14000)
        host.wait_for_timeout(1500)
        swin = ROOMS[room].get('swin')
        D.wait_for_timeout(300)
        record('T5e. ครบ 10 วิ ช่วงสลับปิดเองบนจอพิธีกร · หน้าต่างบนมือถือที่ยังไม่เลือกปิดเอง', swin is None and not bar_on(C) and not picker_open(D) and '1/1' in bar(D), swin)
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

    def state(pg): return pg.evaluate("JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('cb.player.v1'))))")

    def t7():
        # บีโดนเอสลับไปแล้ว 1 ครั้ง · เปิดช่วงสลับ 30 วิ
        host.select_option('#swinSel', '30'); host.click('#btnSwin')
        wait_picker(D); wait_picker(F)
        f_txt = F.locator('.shuffle-list .sp-item', has_text='บี').inner_text().replace('\n', ' ')
        # ดีกับเอฟเลือกบีพร้อมกัน (บีโดนอยู่ 1/2) → ดีกดก่อน = ครั้งที่ 2/2 · เอฟกดตามทันที = เกินโควตา
        select(D, 'บี'); select(F, 'บี')
        b0 = cells(Bp)
        confirm(D); confirm(F)
        Bp.wait_for_function("JSON.stringify(%s) !== JSON.stringify(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('cb.player.v1')))).cells)" % json.dumps(b0), timeout=10000)
        b1 = cells(Bp)
        record('T7. เพื่อนคนที่ 2 สลับบีได้ (บีโดน 2/2) · รายชื่อบอกจำนวนครั้งที่โดน', len(state(Bp)['shuf']['hits']) == 2 and '1/2' in f_txt, f_txt)
        F.wait_for_function("(() => { const s = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('cb.player.v1')))).shuf; return s && s.retry === 1 && !s.used; })()", timeout=12000)
        toast = F.inner_text('#toast')
        if OUT: F.screenshot(path=os.path.join(OUT, 'cap-refund.png'))
        Bp.wait_for_timeout(600)
        record('T7b. โดนครบ 2 ครั้งแล้ว: คำสลับที่ 3 ไม่มีผลกับบี และคนสลับได้สิทธิ์คืน · บีเห็น 2/2', cells(Bp) == b1 and len(state(Bp)['shuf']['blocked']) == 1 and 'ได้สิทธิ์คืน' in toast and '2/2' in bar(Bp), toast + ' | ' + bar(Bp))
        # หน้าต่างเลือกของเอฟเด้งขึ้นใหม่เอง → บีกดไม่ได้ (เต็มแล้ว) · ใช้สิทธิ์ที่ได้คืนสลับบัตรตัวเองได้
        wait_picker(F)
        bloc = F.locator('.shuffle-list .sp-item', has_text='บี')
        bdis = bloc.is_disabled(); btxt = bloc.inner_text().replace('\n', ' ')
        if OUT: F.screenshot(path=os.path.join(OUT, 'cap-picker.png')); Bp.screenshot(path=os.path.join(OUT, 'bar-full.png'))
        f0 = cells(F); select(F, 'บัตรของฉันเอง'); confirm(F); F.wait_for_timeout(800)
        record('T7c. หน้าต่างเลือกเด้งใหม่: บีกดไม่ได้ (เต็มแล้ว 2/2) · ใช้สิทธิ์ที่ได้คืนสลับบัตรตัวเองได้', bdis and 'เต็มแล้ว 2/2' in btxt and cells(F) != f0 and state(F)['shuf']['used'], btxt)
        host.click('#btnSwin')
    run('T7', t7)

    print('page errors:', errors[:5]); print('DOCS', list(DOCS.keys()))
    br.close()
srv.shutdown()
print('PASSED %d/%d' % (sum(r['pass'] for r in results), len(results)))
