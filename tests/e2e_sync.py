"""ทดสอบระบบซิงก์ (ใช้ mock server แทน Firestore + ทดสอบ QR ซิงก์ด้วยกล้องจำลอง)
ใช้: python3 tests/e2e_sync.py <site_dir> <out_dir>
"""
import json, os, sys, time, threading, subprocess, traceback
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

SITE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PORT = 8777
BASE = f'http://localhost:{PORT}/'
MOCK = f'http://localhost:{PORT}/__mock'
ROOMS = {}
results, errors = [], []


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        if self.path.rstrip('/') == '/__mock/rooms' or self.path.startswith('/__mock/rooms?'):
            body = json.dumps(ROOMS).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(body); return
        if self.path.startswith('/__mock/rooms/'):
            rid = self.path.split('/')[-1]
            if rid not in ROOMS:
                self.send_response(404); self.end_headers(); return
            body = json.dumps(ROOMS[rid]).encode()
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(body); return
        return super().do_GET()

    def do_PUT(self):
        rid = self.path.split('/')[-1]
        data = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if rid in ROOMS and ROOMS[rid]['ownerUid'] != data['ownerUid']:
            self.send_response(403); self.end_headers(); return
        ROOMS[rid] = data
        self.send_response(204); self.end_headers()


srv = ThreadingHTTPServer(('127.0.0.1', PORT), partial(H, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()


def record(name, ok, detail=''):
    results.append({'test': name, 'pass': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + detail if detail else ''), flush=True)


def run(name, fn):
    try:
        fn()
    except Exception as e:
        record(name, False, 'exception: ' + repr(e)[:300]); traceback.print_exc()


def watch(page, label):
    page.on('pageerror', lambda e: errors.append(f'{label}: {e}'))
    page.on('console', lambda m: errors.append(f'{label}: {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)


INIT_MOCK = f"window.CB_SYNC_MOCK = '{MOCK}';"

with sync_playwright() as p:
    br = p.chromium.launch()
    pixel = p.devices['Pixel 7']
    hctx = br.new_context(viewport={'width': 1366, 'height': 768}); hctx.add_init_script(INIT_MOCK)
    host = hctx.new_page(); watch(host, 'host')
    host.goto(BASE + 'host.html?t=sample-monsters')
    host.wait_for_function("document.querySelectorAll('#board .b').length === 24")
    host.select_option('#timerSel', '0')  # ชุดทดสอบนี้ทดสอบโหมดไม่จับเวลา (จับเวลา: tests/e2e_timer_shuffle.py)
    H_ = lambda: host.evaluate('window.__host.state()')

    def draw():
        host.wait_for_function('!window.__host.busy()', timeout=10000)
        host.click('#btnDraw')
        host.wait_for_function('!window.__host.busy()', timeout=10000)

    st = {}

    def t_join():
        host.click('#btnQR'); url = host.inner_text('#qrUrl'); host.click('#btnQRClose')
        st['url'] = url
        ctx = br.new_context(**pixel); ctx.add_init_script(INIT_MOCK)
        pg = ctx.new_page(); watch(pg, 'player')
        pg.goto(url.replace('http://localhost:' + str(PORT) + '/', BASE))
        pg.fill('#nameInput', 'ซิงก์'); pg.click('#joinForm button[type=submit]')
        pg.wait_for_selector('#play:not(.hidden)')
        pg.wait_for_function("window.__player.live() === 'live' && document.querySelector('#syncCount')", timeout=10000)
        st['ctx'], st['pg'] = ctx, pg
        record('S1. ลิงก์ QR เข้าเกมมีรหัสห้อง และมือถือเชื่อมต่อพิธีกรได้', 'room=' in url and pg.inner_text('#syncCount') == '0', url)
    run('S1', t_join)

    def t_block():
        pg = st['pg']
        pg.locator('#grid .cell').nth(0).click(); time.sleep(0.2)
        marks = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).marks")
        toast = pg.inner_text('#toast')
        record('S2. ยังไม่มีการสุ่ม → แตะช่องไม่ได้ (บล็อกกดมั่ว)', marks == [] and 'ยังไม่ถูกเรียก' in toast, f'เครื่องหมาย={marks} · "{toast}"')
    run('S2', t_block)

    def t_live():
        pg = st['pg']
        host.click('#btnDraw'); time.sleep(0.35)
        during = pg.inner_text('#syncCount')
        host.wait_for_function('!window.__host.busy()', timeout=10000)
        draw(); draw()
        t0 = time.time()
        pg.wait_for_function("document.querySelector('#syncCount') && document.querySelector('#syncCount').textContent === '3'", timeout=10000)
        lag = time.time() - t0
        draws = [d['id'] for d in H_()['round']['draws']]
        cells = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).cells")
        expect_called = [i for i, c in enumerate(cells) if c in draws]
        badges = pg.evaluate("[...document.querySelectorAll('#grid .cell')].map((d,i)=>d.querySelector('.called')?i:-1).filter(i=>i>=0)")
        record('S3. พิธีกรสุ่ม → มือถืออัปเดตเอง และไม่เปิดเผยตัวล่าสุดก่อนแอนิเมชันจบ',
               during == '0' and badges == expect_called, f'ระหว่างหมุนมือถือเห็น {during} ตัว · ช่องที่ขึ้น “เรียกแล้ว” {badges} (คาด {expect_called}) · หน่วง {lag:.1f} วิ')
        uncalled = [i for i in range(16) if i not in expect_called]
        pg.locator('#grid .cell').nth(uncalled[0]).click()
        ok_marks = []
        for i in expect_called:
            pg.locator('#grid .cell').nth(i).click()
        marks = sorted(pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).marks"))
        record('S4. แตะได้เฉพาะตัวที่ถูกเรียกแล้ว', marks == sorted(expect_called), f'แตะตัวที่ยังไม่เรียก 1 ครั้ง + ตัวที่เรียกแล้ว {len(expect_called)} ครั้ง → เครื่องหมาย {marks}')
        st['called'] = expect_called
        pg.screenshot(path=os.path.join(OUT, 'sync-player-live.png'), full_page=True)
    run('S3-4', t_live)

    def t_undo():
        pg = st['pg']
        host.click('#btnUndo'); host.click('.modal .actions .btn.danger')
        pg.wait_for_function("document.querySelector('#syncCount').textContent === '2'", timeout=10000)
        draws = [d['id'] for d in H_()['round']['draws']]
        cells = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).cells")
        unver = pg.evaluate("[...document.querySelectorAll('#grid .cell')].map((d,i)=>d.classList.contains('unverified')?i:-1).filter(i=>i>=0)")
        expect = [i for i in st['called'] if cells[i] not in draws]
        record('S5. พิธีกรยกเลิกตัวล่าสุด → มือถือลดจำนวน และช่องที่เคยแตะขึ้นเป็น “รอยืนยัน”', unver == expect, f'ช่องรอยืนยัน {unver} (คาด {expect})')
    run('S5', t_undo)

    def t_offline():
        pg, ctx = st['pg'], st['ctx']
        ctx.set_offline(True)
        pg.evaluate("window.dispatchEvent(new Event('offline'))")
        pg.wait_for_function("window.__player.live() !== 'live'", timeout=10000)
        cells = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).cells")
        draws = [d['id'] for d in H_()['round']['draws']]
        free = [i for i in range(16) if cells[i] not in draws and i not in pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).marks")][0]
        pg.locator('#grid .cell').nth(free).click()
        marked = free in pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).marks")
        unv = pg.locator('#grid .cell').nth(free).get_attribute('class')
        bar = pg.inner_text('#syncBar')
        record('S6. เน็ตหลุด → กลับไปแตะเองได้ (ไม่ล็อกบัตร) และช่องนั้นแสดงเป็น “รอยืนยัน”', marked and 'unverified' in unv, f'แถบสถานะ: "{bar.splitlines()[-1]}"')
        pg.locator('#grid .cell').nth(free).click()
        ctx.set_offline(False)
        pg.evaluate("window.dispatchEvent(new Event('online'))")
        pg.wait_for_function("window.__player.live() === 'live'", timeout=15000)
        record('S6b. เน็ตกลับมา → ซิงก์ต่ออัตโนมัติ', True, '')
    run('S6', t_offline)

    def t_round():
        pg = st['pg']
        host.click('#btnNewRound'); nxt = H_()['round']['no'] + 1
        host.fill('#cfm', str(nxt)); host.click('.modal .actions .btn.danger')
        pg.wait_for_selector('#roundBanner:not(.hidden)', timeout=10000)
        txt = pg.inner_text('#roundBanner')
        old_marks = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).marks")
        pg.click('#rbClear')
        after = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1'))")
        pg.locator('#grid .cell').nth(5).click()
        blocked = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).marks") == []
        record('S7. พิธีกรเริ่มรอบใหม่ → มือถือแจ้งเตือน กด “ล้างเครื่องหมาย” แล้วเล่นรอบใหม่ (และบล็อกกดมั่วต่อ)',
               f'รอบที่ {nxt}' in txt and len(old_marks) > 0 and after['marks'] == [] and after['roundId'] == H_()['round']['id'] and blocked,
               txt.splitlines()[0])
    run('S7', t_round)

    def t_takeover():
        # เครื่องพิธีกรเครื่องที่ 2 พยายามใช้ห้องเดิม → ถูกปฏิเสธและสร้างห้องใหม่เอง
        c2 = br.new_context(viewport={'width': 1366, 'height': 768}); c2.add_init_script(INIT_MOCK)
        h2 = c2.new_page(); watch(h2, 'host2')
        h2.goto(BASE + 'host.html'); h2.wait_for_function("document.querySelectorAll('#board .b').length === 24")
        stolen = H_()['roomId']
        h2.evaluate(f"(()=>{{const s=window.__host.state(); s.roomId='{stolen}'; localStorage.setItem('cb.host.v1', JSON.stringify(s));}})()")
        h2.reload(); h2.wait_for_function("document.querySelectorAll('#board .b').length === 24")
        h2.wait_for_function(f"window.__host.state().roomId !== '{stolen}'", timeout=10000)
        record('S8. คนอื่นเปิดหน้าพิธีกรแล้วพยายามเขียนห้องของพิธีกรตัวจริง → ถูกปฏิเสธ (ข้อมูลห้องเดิมไม่เปลี่ยน)',
               ROOMS[stolen]['roundId'] == H_()['round']['id'], 'เครื่องที่ 2 ถูกย้ายไปห้องใหม่อัตโนมัติ')
        c2.close()
    run('S8', t_takeover)

    # ---------- QR ซิงก์ (ไม่มีเรียลไทม์) ----------
    def t_qr():
        c3 = br.new_context(viewport={'width': 1366, 'height': 768})
        h3 = c3.new_page(); watch(h3, 'host-qr')
        h3.goto(BASE + 'host.html'); h3.wait_for_function("document.querySelectorAll('#board .b').length === 24")
        pill = h3.inner_text('#syncPill')
        for _ in range(5):
            h3.wait_for_function('!window.__host.busy()'); h3.click('#btnDraw'); h3.wait_for_function('!window.__host.busy()', timeout=10000)
        h3.click('#btnQRSync'); time.sleep(0.3)
        h3.screenshot(path=os.path.join(OUT, 'sync-host-qr.png'))
        qr_png = os.path.join(OUT, 'qr-sync.png')
        h3.locator('#qrSyncBig svg').screenshot(path=qr_png)
        text = h3.evaluate('window.__host.syncText()')
        draws = [d['id'] for d in h3.evaluate('window.__host.state()')['round']['draws']]
        # กล้องจำลอง: แปลงภาพ QR เป็นวิดีโอ
        y4m = os.path.join(OUT, 'qr.y4m')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-i', qr_png, '-t', '4', '-r', '10',
                        '-vf', 'scale=480:480,pad=640:640:80:80:white,format=yuv420p', y4m], check=True)
        br2 = p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={y4m}'])
        c4 = br2.new_context(**pixel, permissions=['camera'])
        pg = c4.new_page(); watch(pg, 'player-qr')
        pg.goto(BASE + 'index.html'); pg.fill('#nameInput', 'สแกน'); pg.click('#joinForm button[type=submit]')
        pg.wait_for_selector('#play:not(.hidden)')
        pg.click('#btnScan')
        pg.wait_for_function("document.querySelector('#syncCount') && document.querySelector('#syncCount').textContent === '5'", timeout=20000)
        sy = pg.evaluate('window.__player.sync()')
        bar = pg.inner_text('#syncBar')
        pg.screenshot(path=os.path.join(OUT, 'sync-player-qr.png'), full_page=True)
        record('S9. ไม่ได้ตั้งค่าเรียลไทม์ → สแกน QR ซิงก์ด้วยกล้อง (จำลอง) แล้วมือถือรู้ 5 ตัวที่ถูกเรียก',
               'QR' in pill and sy['draws'] == draws and sy['source'] == 'qr', f'ป้ายหน้าพิธีกร: "{pill}" · {bar.splitlines()[0]}')
        cells = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).cells")
        unc = [i for i in range(16) if cells[i] not in draws][0]
        pg.locator('#grid .cell').nth(unc).click()
        cls = pg.locator('#grid .cell').nth(unc).get_attribute('class')
        record('S10. โหมด QR: แตะตัวที่ยังไม่ถูกเรียกได้ (เพราะข้อมูลอาจไม่สด) แต่ขึ้นกรอบ “รอยืนยัน”', 'unverified' in cls and 'marked' in cls, '')
        # QR จากชุดภาพอื่น
        other = text.replace(text.split('.')[1], 'ZZZZZ')
        ok = pg.evaluate(f"window.__player.applySyncText({json.dumps(other)})")
        record('S11. สแกน QR ของเกมคนละชุดภาพ → ปฏิเสธ', ok is False, pg.inner_text('#toast'))
        c4.close(); br2.close(); c3.close()
    run('S9-11', t_qr)

    def t_plain_link():
        # ผู้เล่นเปิดลิงก์ตรง (ไม่มีรหัสห้อง เช่น ลิงก์ที่ส่งทาง LINE) → ต้องเชื่อมกับจอพิธีกรเองอัตโนมัติ
        ctx = br.new_context(**pixel); ctx.add_init_script(INIT_MOCK)
        pg = ctx.new_page(); watch(pg, 'player-plain')
        pg.goto(BASE + 'index.html'); pg.fill('#nameInput', 'ลิงก์ตรง'); pg.click('#joinForm button[type=submit]')
        pg.wait_for_selector('#play:not(.hidden)')
        pg.wait_for_function("window.__player.live() === 'live' && document.querySelector('#syncCount')", timeout=10000)
        draws = [d['id'] for d in H_()['round']['draws']]
        n = pg.inner_text('#syncCount'); room = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).room")
        cells = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).cells")
        uncalled = [i for i, c in enumerate(cells) if c not in draws]
        for i in uncalled[:4]: pg.locator('#grid .cell').nth(i).click()
        marks = pg.evaluate("JSON.parse(localStorage.getItem('cb.player.v1')).marks")
        flag = pg.evaluate("(() => { const f = document.getElementById('bingoFlag'); return f.classList.contains('hidden') ? '' : f.innerText; })()")
        pg.screenshot(path=os.path.join(OUT, 'sync-player-plain-link.png'), full_page=True)
        record('S13. เปิดลิงก์ตรง (ไม่ได้สแกน QR) → มือถือเชื่อมกับจอพิธีกรเอง แตะมั่วไม่ได้ และไม่ขึ้น BINGO',
               room is None and n == str(len(draws)) and marks == [] and 'BINGO' not in flag, f'เรียกแล้ว {n}/{len(draws)} · แตะตัวที่ยังไม่เรียก 4 ครั้ง → เครื่องหมาย {marks}')
        ctx.close()
        # ไม่มีระบบซิงก์เลย (ปิด Firebase/ออฟไลน์) → แตะครบแถวเองได้ แต่ไม่ขึ้น BINGO ต้องให้เจ้าหน้าที่ตรวจ
        ctx = br.new_context(**pixel); pg = ctx.new_page(); watch(pg, 'player-nosync')
        pg.goto(BASE + 'index.html'); pg.fill('#nameInput', 'ไม่มีซิงก์'); pg.click('#joinForm button[type=submit]')
        pg.wait_for_selector('#play:not(.hidden)')
        for i in (0, 1, 2, 3): pg.locator('#grid .cell').nth(i).click()
        flag = pg.inner_text('#bingoFlag')
        pg.screenshot(path=os.path.join(OUT, 'sync-player-nosync.png'), full_page=True)
        record('S14. ไม่ได้เชื่อมกับจอพิธีกร → แตะครบแถวแล้วขึ้น “ยังยืนยันไม่ได้” ไม่ขึ้น BINGO', 'BINGO' not in flag and 'ยังยืนยันไม่ได้' in flag, flag.splitlines()[0])
        ctx.close()
    run('S13-14', t_plain_link)

    def t_real_bingo():
        # เชื่อมกับจอแล้ว + พิธีกรเรียกครบแถว → BINGO ของจริง
        ctx = br.new_context(**pixel); ctx.add_init_script(INIT_MOCK)
        pg = ctx.new_page(); watch(pg, 'player-real')
        pg.goto(BASE + 'index.html'); pg.fill('#nameInput', 'ของจริง'); pg.click('#joinForm button[type=submit]')
        pg.wait_for_selector('#play:not(.hidden)')
        pg.wait_for_function("window.__player.live() === 'live' && document.querySelector('#syncCount')", timeout=10000)
        while not host.is_disabled('#btnDraw'): draw()
        pg.wait_for_function(f"document.querySelector('#syncCount').textContent === '{len(H_()['round']['draws'])}'", timeout=10000)
        for i in (0, 1, 2, 3): pg.locator('#grid .cell').nth(i).click()
        pg.wait_for_selector('#bingoFlag:not(.hidden)')
        flag = pg.inner_text('#bingoFlag')
        record('S15. เชื่อมกับจอแล้ว และพิธีกรเรียกครบแถว → ขึ้น BINGO! พร้อม ✓ ตรงกับตัวที่พิธีกรเรียก', 'BINGO!' in flag and '✓' in flag, flag.splitlines()[0])
        ctx.close()
    run('S15', t_real_bingo)

    st['ctx'].close(); hctx.close(); br.close()

srv.shutdown()
real = [e for e in errors if 'favicon' not in e]
record('S12. ไม่มี JavaScript error', not real, '; '.join(real[:6]))
json.dump({'results': results, 'errors': real}, open(os.path.join(OUT, 'e2e-sync-results.json'), 'w'), ensure_ascii=False, indent=2)
print(f"\n{sum(r['pass'] for r in results)}/{len(results)} passed")
