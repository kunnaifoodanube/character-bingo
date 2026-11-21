"""End-to-end: หน้าสร้างเกม (create.html) → เผยแพร่ → เล่นบนจอพิธีกร + มือถือผู้เล่น ด้วยฐานข้อมูลจำลอง (mock)
ใช้: python3 tests/e2e_creator.py <site_dir> [out_dir สำหรับภาพหน้าจอ]
"""
import json, os, sys, threading, traceback, tempfile
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

SITE = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
if OUT: os.makedirs(OUT, exist_ok=True)
PORT = 8771
BASE = f'http://localhost:{PORT}/'
MOCK = BASE + '__mock'
ROOMS, DOCS = {}, {}
results, errors = [], []


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
            return self._json({k.split('/')[-1]: v for k, v in DOCS.items() if k.rsplit('/', 1)[0] == col})
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

    def do_DELETE(self):
        u = urlparse(self.path)
        key = u.path[len('/__mock/docs/'):].strip('/')
        DOCS.pop(key, None); self.send_response(204); self.end_headers()


srv = ThreadingHTTPServer(('127.0.0.1', PORT), partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()


def record(name, ok, detail=''):
    results.append({'test': name, 'pass': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + str(detail) if detail else ''), flush=True)


def run(name, fn):
    try: fn()
    except Exception as e: record(name, False, 'exception: ' + repr(e)[:300]); traceback.print_exc()


# ภาพทดสอบ 26 รูป (สีต่างกัน + ตัวเลข)
TMP = tempfile.mkdtemp()
PICS = []
for i in range(26):
    im = Image.new('RGB', (1600, 1000), ((i * 37) % 255, (i * 91) % 255, (i * 53 + 80) % 255))
    d = ImageDraw.Draw(im); d.rectangle([500, 300, 1100, 700], fill=(255, 255, 255)); d.text((760, 480), str(i + 1), fill=(0, 0, 0))
    p = os.path.join(TMP, f'pic{i + 1:02d}.png'); im.save(p); PICS.append(p)
ANSWERS = ['Cat', 'Dog', 'Bird', 'Fish', 'Lion', 'Tiger', 'Bear', 'Wolf', 'Fox', 'Deer', 'Horse', 'Cow', 'Pig', 'Goat', 'Sheep', 'Duck',
           'Frog', 'Snake', 'Owl', 'Bee', 'Ant', 'Crab', 'Shark', 'Whale']
QTEXT = 'ตัวนี้คืออะไร'

INIT = f"window.CB_SYNC_MOCK = '{MOCK}';"
with sync_playwright() as p:
    br = p.chromium.launch()

    def ctx_of(**kw):
        c = br.new_context(service_workers='block', **kw); c.add_init_script(INIT)
        c.route('**/*', lambda r: r.abort() if not r.request.url.startswith(BASE) else r.continue_())
        return c

    cctx = ctx_of(viewport={'width': 1280, 'height': 900})
    cr = cctx.new_page(); cr.on('pageerror', lambda e: errors.append('creator: %s' % e))
    st = {}

    def games(): return {k: v for k, v in DOCS.items() if k.count('/') == 1 and k.startswith('games/')}
    def items_of(gid): return {k: v for k, v in DOCS.items() if k.startswith('games/' + gid + '/items/')}
    def idle():
        cr.wait_for_timeout(300)
        for _ in range(2): cr.wait_for_function('window.__create && window.__create.pending() === 0', timeout=20000); cr.wait_for_timeout(900)

    def t_signin():
        cr.goto(BASE + 'create.html')
        cr.wait_for_selector('#vSignIn:not(.hidden)', timeout=10000)
        if OUT: cr.screenshot(path=os.path.join(OUT, 'C1-signin.png'))
        cr.click('#btnSignIn')
        cr.wait_for_selector('#vList:not(.hidden)', timeout=10000)
        record('C1. ยังไม่ล็อกอิน → ขอให้ล็อกอิน Google · ล็อกอินแล้วเห็น “เกมของฉัน”', cr.is_visible('#btnNew') and 'ครูทดสอบ' in cr.inner_text('#whoName'))
    run('C1', t_signin)

    def t_create():
        cr.click('#btnNew'); cr.wait_for_selector('#vEdit:not(.hidden)', timeout=10000)
        cr.fill('#gName', 'คำศัพท์สัตว์ (ทดสอบ)'); cr.fill('#gDesc', 'ดูภาพแล้วหาคำภาษาอังกฤษ')
        idle()
        gid = list(games().keys())[0].split('/')[1]; st['gid'] = gid
        g = DOCS['games/' + gid]
        record('C2. สร้างเกมใหม่ → บันทึกขึ้นระบบอัตโนมัติ (ชื่อ เจ้าของ ฉบับร่าง)', g['name'] == 'คำศัพท์สัตว์ (ทดสอบ)' and g['status'] == 'draft' and g['ownerName'] == 'ครูทดสอบ', g['name'])
        # เพิ่มหลายรูปพร้อมกัน เป็นโจทย์
        cr.set_input_files('#bulkFiles', PICS[:24])
        cr.wait_for_selector('.modal'); cr.click('.modal .actions .btn:has-text("เป็นโจทย์บนจอใหญ่")')
        cr.wait_for_function("document.querySelectorAll('#items .item').length === 24", timeout=60000)
        idle()
        n_img = sum(1 for v in items_of(gid).values() if v['qImg'].startswith('data:image/'))
        sizes = [len(v['qImg']) for v in items_of(gid).values()]
        record('C3. ปุ่ม “เพิ่มหลายรูปพร้อมกัน” → 24 ข้อใหม่ ภาพโจทย์ถูกย่อและบันทึกขึ้นระบบ', n_img == 24 and max(sizes) <= 560000, f'{n_img} ข้อ · ภาพใหญ่สุด {max(sizes) // 1024} KB')
        # พิมพ์คำตอบ + โจทย์ข้อความ
        for i, a in enumerate(ANSWERS):
            it = cr.locator('#items .item').nth(i)
            it.locator('[data-text="a"]').fill(a)
            if i == 0: it.locator('[data-text="q"]').fill(QTEXT)
        # ข้อ 25: โจทย์เป็นข้อความ คำตอบเป็นรูป (เพิ่มทีละข้อ)
        cr.click('#btnAdd'); last = cr.locator('#items .item').last
        last.locator('[data-text="q"]').fill('สัตว์ที่ร้องเหมียว ๆ (รูป)')
        with cr.expect_file_chooser() as fc: last.locator('[data-pick="a"]').click()
        fc.value.set_files(PICS[24])
        cr.wait_for_function("document.querySelectorAll('#items .item')[24].querySelector('.side.a .pic img')", timeout=10000)
        idle()
        its = items_of(gid)
        ok_txt = sorted(v['aText'] for v in its.values() if v['aText']) == sorted(ANSWERS)
        img_ans = [v for v in its.values() if v['aImg']]
        if OUT: cr.screenshot(path=os.path.join(OUT, 'C4-editor.png'), full_page=False)
        record('C4. พิมพ์คำตอบ/โจทย์ได้ทุกข้อ · ข้อที่ 25 ใช้ข้อความเป็นโจทย์และรูปเป็นคำตอบ · บันทึกครบ',
               len(its) == 25 and ok_txt and len(img_ans) == 1 and len(img_ans[0]['aImg']) <= 180000 and DOCS['games/' + gid]['itemCount'] == 25,
               f"{len(its)} ข้อ · itemCount {DOCS['games/' + gid]['itemCount']}")
        status = cr.inner_text('#gStatus')
        record('C5. แถบสถานะบอกจำนวนข้อที่ครบและพร้อมเล่น', 'พร้อมเล่น' in status and '25' in status, status.splitlines()[0][:80])
    run('C2-5', t_create)

    def t_dup_publish():
        gid = st['gid']
        # คำตอบซ้ำ → เผยแพร่ไม่ได้
        it = cr.locator('#items .item').nth(1); it.locator('[data-text="a"]').fill('Cat'); idle()
        cr.click('#btnPublish'); cr.wait_for_selector('.modal')
        txt = cr.inner_text('.modal'); cr.click('.modal .actions .btn')
        it.locator('[data-text="a"]').fill('Dog'); idle()
        record('C6. คำตอบซ้ำกัน → เตือนและไม่ให้เผยแพร่', 'ซ้ำ' in txt and DOCS['games/' + gid]['status'] == 'draft', txt.replace('\n', ' ')[:90])
        # ตัวอย่างบัตร
        cr.click('#btnPreview'); cr.wait_for_selector('.modal .grid4.preview')
        n = cr.locator('.modal .grid4.preview .cell').count(); n_img = cr.locator('.modal .grid4.preview .cell img').count()
        if OUT: cr.screenshot(path=os.path.join(OUT, 'C7-preview.png'))
        cr.click('.modal .actions .btn')
        record('C7. ดูตัวอย่างบัตร 4×4 ได้', n == 16, f'{n} ช่อง · ช่องที่เป็นรูป {n_img}')
        cr.click('#btnPublish'); cr.wait_for_selector('.modal'); cr.click('.modal .actions .btn'); idle()
        record('C8. เผยแพร่เกม → สถานะ published', DOCS['games/' + gid]['status'] == 'published' and 'cover' in DOCS['games/' + gid])
    run('C6-8', t_dup_publish)

    hctx = ctx_of(viewport={'width': 1366, 'height': 768})
    host = hctx.new_page(); host.on('pageerror', lambda e: errors.append('host: %s' % e))

    def t_host():
        gid = st['gid']
        host.goto(BASE + 'host.html')
        host.wait_for_function("document.querySelectorAll('#themeSel option').length > 1", timeout=20000)
        opts = host.eval_on_selector_all('#themeSel option', 'os => os.map(o => o.value + "|" + o.textContent)')
        listed = [o for o in opts if o.startswith('cloud:cloud-' + gid)]
        record('C9. เกมที่เผยแพร่แล้วขึ้นในรายชื่อเกมบนจอพิธีกร พร้อมชื่อผู้สร้าง', bool(listed) and 'ครูทดสอบ' in listed[0], listed[0] if listed else opts)
        host.goto(BASE + 'host.html?t=cloud-' + gid)
        host.wait_for_function("document.querySelectorAll('#board .b').length === 25", timeout=20000)
        board_txt = host.inner_text('#board')
        st['room'] = host.evaluate('window.__host.state().roomId')
        for _ in range(4):  # ให้ข้อที่เรียกล่าสุดมีคำตอบเป็นข้อความ (ตรวจว่าไม่เฉลยได้ชัด)
            host.click('#btnDraw'); host.wait_for_function('!window.__host.busy()', timeout=15000)
            did = host.evaluate('window.__host.state().round.draws.slice(-1)[0].id')
            if DOCS['games/' + gid + '/items/' + did]['aText']: break
        st['drawn'] = did
        d = DOCS['games/' + gid + '/items/' + did]
        big = host.evaluate("""() => ({ img: (document.querySelector('#bigMedia img') || {}).src || '', name: document.getElementById('bigName').innerText,
            over: document.documentElement.scrollHeight > innerHeight + 1 })""")
        if OUT: host.screenshot(path=os.path.join(OUT, 'C10-host.png'))
        ans = d['aText'] or '(รูป)'
        no_spoil = (not d['aText'] or d['aText'] not in big['name']) and not any(a in board_txt for a in ANSWERS)
        q_ok = big['img'].startswith('data:image/') if d['qImg'] else (d['qText'] in big['name'])
        record('C10. จอพิธีกรเปิดเกมที่สร้างเอง สุ่มแล้วแสดงโจทย์ · ไม่เฉลยคำตอบบนจอ (ค่าเริ่มต้น)', q_ok and no_spoil and not big['over'], f'คำตอบ {ans} · ข้อความบนจอ "{big["name"]}"')
    run('C9-10', t_host)

    def t_player():
        gid = st['gid']
        pctx = ctx_of(viewport={'width': 390, 'height': 844})
        pg = pctx.new_page(); pg.on('pageerror', lambda e: errors.append('player: %s' % e))
        pg.goto(BASE + 'index.html?t=cloud-' + gid + '&room=' + st['room'])
        pg.fill('#nameInput', 'นักเรียน'); pg.click('#joinForm button[type=submit]')
        pg.wait_for_selector('#play:not(.hidden)', timeout=15000)
        pg.wait_for_function("window.__player.live() === 'live'", timeout=15000)
        n = pg.locator('#grid .cell').count()
        txt = pg.inner_text('#grid')
        words = [a for a in ANSWERS if a in txt]
        overflow = pg.evaluate("[...document.querySelectorAll('#grid .tw')].some(t => t.scrollWidth > t.parentElement.clientWidth + 1)")
        if OUT: pg.screenshot(path=os.path.join(OUT, 'C11-player.png'))
        did = st['drawn']; ans = DOCS['games/' + gid + '/items/' + did]['aText']
        bars = pg.inner_text('#syncBar') + ' ' + pg.evaluate("(document.getElementById('timeBar')||{}).innerText || ''")
        record('C11b. มือถือไม่บอกคำตอบของข้อที่เพิ่งเรียก (แถบเวลา/แถบสถานะ)', not ans or ans not in bars, bars.replace('\n', ' ')[:120])
        record('C11. ผู้เล่นสแกนเข้าเกมที่สร้างเอง ได้บัตร 16 ช่องเป็นคำตอบ (คำหรือรูป) ไม่ล้นช่อง', n == 16 and len(words) + pg.locator('#grid .cell img').count() == 16 and not overflow,
               f'คำ {len(words)} · รูป {pg.locator("#grid .cell img").count()}')
        pctx.close()
    run('C11', t_player)

    def t_other_user():
        gid = st['gid']
        octx = ctx_of(viewport={'width': 390, 'height': 844})
        op = octx.new_page(); op.on('pageerror', lambda e: errors.append('other: %s' % e))
        op.goto(BASE + 'create.html')
        op.evaluate("localStorage.setItem('cb.mockOwner','uOTHER123'); localStorage.setItem('cb.mockGoogle', JSON.stringify({uid:'uOTHER123',name:'คนอื่น',email:'x@y.z'}))")
        op.goto(BASE + 'create.html?g=' + gid)
        op.wait_for_selector('#vList:not(.hidden)', timeout=10000)
        toast = op.inner_text('#toast')
        mine = op.inner_text('#myGames')
        if OUT: op.screenshot(path=os.path.join(OUT, 'C12-other-user.png'))
        record('C12. ผู้ใช้อื่นเปิดลิงก์แก้เกมของคนอื่น → แก้ไม่ได้ และไม่เห็นในเกมของฉัน', 'แก้ไขได้เฉพาะผู้สร้าง' in toast and 'คำศัพท์สัตว์' not in mine, toast)
        octx.close()
    run('C12', t_other_user)

    def t_mobile_editor():
        mctx = ctx_of(viewport={'width': 390, 'height': 844})
        mp = mctx.new_page(); mp.on('pageerror', lambda e: errors.append('mobile: %s' % e))
        mp.goto(BASE + 'create.html')
        mp.evaluate("localStorage.setItem('cb.mockOwner', %s); localStorage.setItem('cb.mockGoogle', %s)" % (
            json.dumps(cr.evaluate("localStorage.getItem('cb.mockOwner')")), json.dumps(cr.evaluate("localStorage.getItem('cb.mockGoogle')"))))
        mp.goto(BASE + 'create.html?g=' + st['gid'])
        mp.wait_for_selector('#vEdit:not(.hidden)', timeout=15000)
        ow = mp.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
        if OUT: mp.screenshot(path=os.path.join(OUT, 'C13-mobile-editor.png'))
        record('C13. เปิดหน้าแก้เกมบนมือถือ (390px) ได้ ไม่ล้นจอด้านข้าง', not ow and mp.locator('#items .item').count() == 25)
        mctx.close()
    run('C13', t_mobile_editor)

    def t_delete():
        gid = st['gid']
        cr.locator('#items .item').last.locator('[data-del]').click(); cr.click('.modal .actions .btn.danger'); idle()
        record('C14. ลบข้อได้ (เหลือ 24 ข้อ)', len(items_of(gid)) == 24 and DOCS['games/' + gid]['itemCount'] == 24)
        cr.click('#btnDelete'); cr.click('.modal .actions .btn.danger')
        cr.wait_for_selector('#vList:not(.hidden)', timeout=15000)
        record('C15. ลบเกมทั้งเกม → ข้อมูลหายจากระบบ', not games() and not items_of(gid))
    run('C14-15', t_delete)

    record('C16. ไม่มี JavaScript error', not errors, errors[:3])
    br.close()

passed = sum(1 for r in results if r['pass'])
print(f'PASSED {passed}/{len(results)}')
json.dump(results, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'e2e-creator-results.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
srv.shutdown()
