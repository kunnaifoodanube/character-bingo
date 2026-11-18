"""End-to-end tests (Playwright + Chromium)
ใช้: python3 tests/e2e.py <site_dir> <test_images_dir> <out_dir>
site_dir ต้องเป็นสำเนาของโปรเจกต์ (การทดสอบจะเขียนไฟล์ชุดภาพใหม่ลงไป)
"""
import json, os, sys, time, shutil, subprocess, threading, traceback
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

SITE, IMGS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
PORT = 8765
BASE = f'http://localhost:{PORT}/'
results = []
errors = []


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


srv = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Quiet, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()


def first_result(txt):
    return next((l.strip() for l in txt.splitlines() if '✅' in l or '❌' in l), txt[:80])


def record(name, ok, detail=''):
    results.append({'test': name, 'pass': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + detail if detail else ''), flush=True)


def run(name, fn):
    try:
        fn()
    except Exception as e:
        record(name, False, 'exception: ' + repr(e)[:300])
        traceback.print_exc()


def watch(page, label):
    page.on('pageerror', lambda e: errors.append(f'{label}: pageerror {e}'))
    page.on('console', lambda m: errors.append(f'{label}: console.{m.type} {m.text}') if m.type == 'error' else None)


with sync_playwright() as p:
    browser = p.chromium.launch()
    pixel = p.devices['Pixel 7']
    iphone = dict(p.devices['iPhone 13'])
    iphone.pop('default_browser_type', None)

    def new_player(device, name, url='index.html'):
        ctx = browser.new_context(**device, service_workers='allow')
        page = ctx.new_page(); watch(page, 'player')
        page.goto(BASE + url)
        page.wait_for_selector('#join:not(.hidden)', timeout=15000)
        page.fill('#nameInput', name)
        page.click('#joinForm button[type=submit]')
        page.wait_for_selector('#play:not(.hidden)')
        return ctx, page

    def player_state(page):
        return page.evaluate("JSON.parse(localStorage.getItem('cb.player.v1'))")

    # ---------------- 1. มือถือ Android/iPhone (จำลอง) ----------------
    shared = {}

    def t_mobile():
        for label, dev in (('Android (Pixel 7)', pixel), ('iPhone 13 (จำลองขนาดจอบน Chromium)', iphone)):
            ctx, page = new_player(dev, 'ทดสอบ')
            st = player_state(page)
            n_cells = page.locator('#grid .cell').count()
            imgs_ok = page.evaluate("[...document.querySelectorAll('#grid img')].every(i => i.complete && i.naturalWidth > 0)")
            overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
            page.screenshot(path=os.path.join(OUT, f"player-{'android' if 'Pixel' in label else 'iphone'}.png"), full_page=True)
            record(f'1. เปิดหน้าผู้เล่นบน {label}', n_cells == 16 and imgs_ok and not overflow and len(st['cells']) == 16,
                   f"บัตร {st['code']} · 16 ช่อง={n_cells == 16} · ภาพโหลดครบ={imgs_ok} · ล้นจอแนวนอน={overflow}")
            ctx.close()
    run('1. mobile', t_mobile)

    # ---------------- 2. รีเฟรชระหว่างเล่น ----------------
    def t_refresh():
        ctx, page = new_player(pixel, 'มิว')
        code = player_state(page)['code']
        for i in (0, 5, 10, 15):
            page.locator('#grid .cell').nth(i).click()
        page.locator('#grid .cell').nth(5).click()  # แตะซ้ำ = ยกเลิก
        before = sorted(player_state(page)['marks'])
        page.reload(); page.wait_for_selector('#play:not(.hidden)')
        after = sorted(player_state(page)['marks'])
        code2 = page.inner_text('#pCode')
        marked_dom = page.locator('#grid .cell.marked').count()
        record('2. รีเฟรชหน้าเว็บระหว่างเล่น — บัตรและเครื่องหมายไม่หาย', code == code2 and before == after == [0, 10, 15] and marked_dom == 3,
               f'เลขบัตรก่อน/หลัง {code}/{code2} · เครื่องหมาย {before}→{after}')
        # ปิดแล้วเปิดใหม่ (แท็บใหม่ใน context เดิม)
        page.close(); page = ctx.new_page(); page.goto(BASE + 'index.html'); page.wait_for_selector('#play:not(.hidden)')
        record('2b. ปิดแท็บแล้วสแกน QR เข้าใหม่ — ได้บัตรเดิม', page.inner_text('#pCode') == code, code)
        shared['refresh_ctx'] = (ctx, page)
    run('2. refresh', t_refresh)

    # ---------------- 3. ออฟไลน์หลังโหลด ----------------
    def t_offline():
        ctx, page = shared['refresh_ctx']
        page.evaluate("navigator.serviceWorker.ready.then(() => true)")
        time.sleep(1.5)
        code = page.inner_text('#pCode')
        ctx.set_offline(True)
        page.reload(); page.wait_for_selector('#play:not(.hidden)', timeout=15000)
        imgs_ok = page.evaluate("[...document.querySelectorAll('#grid img')].every(i => i.complete && i.naturalWidth > 0)")
        page.locator('#grid .cell').nth(3).click()
        marks = sorted(player_state(page)['marks'])
        pill = page.inner_text('#net')
        page.screenshot(path=os.path.join(OUT, 'player-offline.png'))
        record('3. ปิดอินเทอร์เน็ตแล้วรีโหลด — เปิดบัตรได้และทำเครื่องหมายได้',
               page.inner_text('#pCode') == code and imgs_ok and 3 in marks and 'ออฟไลน์' in pill,
               f'บัตร {code} · ภาพครบ={imgs_ok} · เครื่องหมาย {marks} · สถานะ "{pill}"')
        # ผู้เล่นใหม่ที่ไม่เคยเปิดเว็บ ขณะออฟไลน์ (คาดว่าเปิดไม่ได้ — ข้อจำกัด)
        ctx.set_offline(False); ctx.close()
    run('3. offline', t_offline)

    # ---------------- 4. พิธีกร: สุ่มไม่ซ้ำ + กันกดซ้ำ ----------------
    hctx = browser.new_context(viewport={'width': 1366, 'height': 768})
    host = hctx.new_page(); watch(host, 'host')

    def hstate():
        return host.evaluate("window.__host.state()")

    def draw_once():
        host.wait_for_function("!window.__host.busy()", timeout=10000)
        host.click('#btnDraw')
        host.wait_for_function("!window.__host.busy()", timeout=10000)

    def t_host_draw():
        host.goto(BASE + 'host.html')
        host.wait_for_function("document.querySelectorAll('#board .b').length === 24", timeout=15000)
        # ดับเบิลคลิก/กดรัว
        host.dblclick('#btnDraw')
        host.click('#btnDraw', force=True)
        time.sleep(0.3)
        n1 = len(hstate()['round']['draws'])
        host.wait_for_selector('#btnDraw:not([disabled])', timeout=10000)
        for _ in range(5):
            host.keyboard.press('Space')
        time.sleep(0.2)
        n2 = len(hstate()['round']['draws'])
        record('5a. ป้องกันการกดสุ่มซ้ำโดยไม่ตั้งใจ (ดับเบิลคลิก + กด Space รัว 5 ครั้ง)', n1 == 1 and n2 == 2, f'ได้ {n1} ตัว และ {n2} ตัว (ควรเป็น 1 และ 2)')
        host.wait_for_selector('#btnDraw:not([disabled])', timeout=10000)
        for _ in range(8):
            draw_once()
        host.reload(); host.wait_for_function("document.querySelectorAll('#board .b.on').length === 10", timeout=15000)
        n3 = len(hstate()['round']['draws'])
        record('5b. รีเฟรชหน้าพิธีกรกลางเกม — ประวัติไม่หาย', n3 == 10, f'{n3} ตัว')
        while len(hstate()['round']['draws']) < 24:
            draw_once()
        ids = [d['id'] for d in hstate()['round']['draws']]
        host.screenshot(path=os.path.join(OUT, 'host.png'))
        record('5c. สุ่มครบ 24 ตัว ไม่ซ้ำ และปุ่มสุ่มปิดเมื่อครบ', len(ids) == 24 and len(set(ids)) == 24 and host.is_disabled('#btnDraw'),
               f'สุ่ม {len(ids)} ครั้ง ไม่ซ้ำ {len(set(ids))} ตัว · ปุ่ม: "{host.inner_text("#btnDraw")}"')
    run('4. host draw', t_host_draw)

    # ---------------- 6. ตรวจบิงโก + กันแจ้งชนะผิด ----------------
    def verify(code):
        host.click('#btnVerify')
        host.fill('#vcode', code)
        host.click('#vf button[type=submit]')
        host.wait_for_selector('#vout .banner')
        txt = host.inner_text('#vout')
        host.click('.modal .actions .btn')
        return txt

    def new_round():
        host.click('#btnNewRound')
        nxt = hstate()['round']['no'] + 1
        host.fill('#cfm', str(nxt))
        host.click('.modal .actions .btn.danger')
        host.wait_for_function(f"window.__host.state().round.no === {nxt}")

    def t_verify():
        # รอบที่ 1 สุ่มครบแล้ว → ทุกบัตรต้อง BINGO
        ctx, page = new_player(pixel, 'ผู้ชนะ')
        code = player_state(page)['code']
        txt = verify(code)
        r1 = '✅' in txt
        # เลขตรวจสอบผิด
        bad = code[:-1] + str((int(code[-1]) + 1) % 10)
        host.click('#btnVerify'); host.fill('#vcode', bad); host.click('#vf button[type=submit]')
        host.wait_for_selector('#vout .banner'); badtxt = host.inner_text('#vout'); host.click('.modal .actions .btn')
        record('6a. ตรวจบัตรที่ชนะจริง → ✅ และพิมพ์เลขบัตรผิด → แจ้งเตือน', r1 and 'เลขตรวจสอบไม่ตรง' in badtxt, f'{code} → {first_result(txt)} · {bad} → เลขตรวจสอบไม่ตรง')
        # รอบใหม่ สุ่ม 3 ตัว ผู้เล่นแตะครบแถวบนเอง
        new_round()
        for _ in range(3):
            draw_once()
        for i in (0, 1, 2, 3):
            page.locator('#grid .cell').nth(i).click()
        flag = page.is_visible('#bingoFlag')
        page.screenshot(path=os.path.join(OUT, 'player-bingo.png'), full_page=True)
        txt2 = verify(code)
        record('6b. ผู้เล่นแตะครบแนวเอง (ตัวละครยังไม่ถูกเรียก) → มือถือขึ้น BINGO แต่ตรวจแล้ว ❌', flag and '❌' in txt2,
               f'มือถือแสดง BINGO={flag} · ผลตรวจ: {first_result(txt2)}')
        # ตรวจผู้เล่น 30 คน เทียบกับผลคำนวณอิสระใน Node
        new_round()
        for _ in range(7):
            draw_once()
        draws = [d['id'] for d in hstate()['round']['draws']]
        codes = []
        for i in range(30):
            c2, p2 = new_player(pixel if i % 2 else iphone, f'P{i}')
            codes.append(player_state(p2)['code']); c2.close()
        ui = []
        for c in codes:
            ui.append('✅' in verify(c))
        node = json.loads(subprocess.check_output(['node', '-e', f"""
const B=require('{SITE}/assets/js/core.js');const t=require('{SITE}/themes/sample-monsters.json');
const d={json.dumps(draws)};const cs={json.dumps(codes)};
console.log(JSON.stringify(cs.map(c=>B.verifyCard(t,B.parseCode(c).num,d).bingo)));"""]).decode())
        record('6c. ผลตรวจบนหน้าพิธีกรตรงกับการคำนวณอิสระ (30 บัตร, สุ่ม 7 ตัว)', ui == node,
               f'ตรงกัน {sum(1 for a, b in zip(ui, node) if a == b)}/30 · ชนะ {sum(node)} ใบ')
        host.click('#btnVerify'); host.fill('#vcode', codes[0]); host.click('#vf button[type=submit]'); host.wait_for_selector('#vout .banner')
        host.screenshot(path=os.path.join(OUT, 'host-verify.png')); host.click('.modal .actions .btn')
        ctx.close()
    run('6. verify', t_verify)

    # ---------------- 8. เริ่มรอบใหม่ไม่กระทบรอบเดิม ----------------
    def t_rounds():
        before = hstate()
        prev_round = json.loads(json.dumps(before['round']))
        archive_before = json.loads(json.dumps(before['archive']))
        # ยกเลิกการยืนยัน (พิมพ์ผิด) ต้องไม่เริ่มรอบใหม่
        host.click('#btnNewRound'); host.fill('#cfm', '999'); host.click('.modal .actions .btn.danger'); time.sleep(0.3)
        still = hstate()['round']['no'] == prev_round['no']
        host.click('.modal .actions .btn.ghost')
        new_round()
        after = hstate()
        arch = after['archive']
        same = arch[0]['draws'] == prev_round['draws'] and arch[1:] == archive_before
        record('8. เริ่มรอบใหม่ — รอบเดิมถูกเก็บครบไม่เปลี่ยนแปลง และพิมพ์ยืนยันผิดจะไม่เริ่มรอบ',
               still and same and after['round']['draws'] == [] and after['round']['no'] == prev_round['no'] + 1,
               f"รอบ {prev_round['no']} ({len(prev_round['draws'])} ตัว) เก็บในประวัติ · ประวัติทั้งหมด {len(arch)} รอบ · รอบใหม่ = {after['round']['no']}")
    run('8. rounds', t_rounds)

    # ---------------- 7. ผู้เล่นจำลอง 100 คน ----------------
    def t_100():
        t0 = time.time(); codes = []; cells = []; fails = 0
        for i in range(100):
            try:
                c, pg = new_player(pixel if i % 2 else iphone, f'นักเรียน{i+1:03d}')
                st = player_state(pg); codes.append(st['code']); cells.append(','.join(st['cells'])); c.close()
            except Exception as e:
                fails += 1
        dt = time.time() - t0
        record('7. ผู้เล่นจำลอง 100 คน (100 browser context แยกกัน)', fails == 0 and len(codes) == 100,
               f'สำเร็จ {len(codes)}/100 ใน {dt:.0f} วินาที · เลขบัตรไม่ซ้ำ {len(set(codes))} · บัตรไม่ซ้ำ {len(set(cells))}')
    run('7. 100 players', t_100)

    # ---------------- 4. อัปโหลดและเปลี่ยนชุดภาพ ----------------
    def t_admin():
        actx = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        ad = actx.new_page(); watch(ad, 'admin')
        ad.goto(BASE + 'admin.html')
        ad.click('#btnNewTheme'); ad.fill('#nn', 'Art Toy Test'); ad.fill('#nc', 'Art Toy'); ad.click('.modal .actions .btn:not(.ghost)')
        ad.wait_for_selector('#editor:not(.hidden)')
        files = sorted(os.path.join(IMGS, f) for f in os.listdir(IMGS))
        ad.set_input_files('#addFiles', files)
        ad.wait_for_selector('.modal h2:has-text("มีไฟล์ที่ใช้ไม่ได้")', timeout=30000)
        errs = ad.inner_text('.modal .mb')
        ad.click('.modal .actions .btn')
        n = ad.locator('#chars .char').count()
        ok_valid = 'พร้อมใช้งาน' in ad.inner_text('#validation')
        record('4a. อัปโหลดภาพ PNG/JPG/WebP 24 ไฟล์ + ไฟล์เสีย 3 ไฟล์ → รับ 24 ตัว และแจ้งไฟล์ที่ผิด',
               n == 24 and ok_valid and 'broken.png' in errs and 'notes.txt' in errs and 'tiny.png' in errs,
               f'รับ {n} ตัว · ไฟล์ที่ถูกปฏิเสธ: ' + ' | '.join(l for l in errs.splitlines() if l.strip()))
        # แก้ชื่อ + เปลี่ยนภาพ + ลบ แล้วตรวจ validation
        ad.locator('#chars .char input').nth(0).fill('น้องหมีอาร์ตทอย')
        ad.locator('#chars .char [data-del]').nth(23).click(); ad.click('.modal .actions .btn.danger')
        warn = ad.inner_text('#validation')
        ad.locator('#chars .char [data-rep]').nth(1).click()
        ad.set_input_files('#replaceFile', os.path.join(IMGS, 'Toy_24.webp'))
        time.sleep(0.8)
        not_ready = 'ต้องมีอย่างน้อย 24' in warn
        ad.set_input_files('#addFiles', [os.path.join(IMGS, 'Toy_01.png')]); time.sleep(1.2)
        ad.screenshot(path=os.path.join(OUT, 'admin.png'), full_page=False)
        ready = 'พร้อมใช้งาน' in ad.inner_text('#validation')
        record('4b. แก้ชื่อ / ลบ / เปลี่ยนภาพ — ระบบเตือนเมื่อเหลือ 23 ตัว และกลับมาพร้อมเมื่อครบ 24', not_ready and ready, '')
        theme_id = ad.input_value('#thId')
        # ส่งออก
        with ad.expect_download() as d1:
            ad.click('#btnExportTheme')
        d1.value.save_as(os.path.join(SITE, 'themes', theme_id + '.json'))
        ad.uncheck('#setDefault')
        with ad.expect_download() as d2:
            ad.click('#btnExportIndex')
        d2.value.save_as(os.path.join(SITE, 'themes', 'index.json'))
        exported = json.load(open(os.path.join(SITE, 'themes', theme_id + '.json')))
        idx = json.load(open(os.path.join(SITE, 'themes', 'index.json')))
        size_kb = os.path.getsize(os.path.join(SITE, 'themes', theme_id + '.json')) / 1024
        record('4c. ส่งออกไฟล์ชุดภาพ + index.json (จำลองการอัปโหลดขึ้น GitHub)',
               len(exported['characters']) == 24 and len(idx['themes']) == 2 and idx['default'] == 'sample-monsters',
               f'{theme_id}.json {size_kb:.0f} KB · index มี {len(idx["themes"])} ชุด')
        # พิธีกรเปลี่ยนชุด → ผู้เล่นได้บัตรชุดใหม่
        host.reload(); host.wait_for_function("[...document.querySelectorAll('#themeSel option')].some(o => o.value.endsWith(':' + '" + theme_id + "'))", timeout=15000)
        opts = host.eval_on_selector_all('#themeSel option', 'os => os.map(o => o.value)')
        host.select_option('#themeSel', 'published:' + theme_id)
        host.wait_for_function(f"window.__host.state().themeId === '{theme_id}'")
        draw_once()
        hs = hstate()
        c3, p3 = new_player(pixel, 'ผู้เล่นชุดใหม่', url='index.html?t=' + theme_id)
        st = player_state(p3)
        tn = p3.inner_text('#themeName')
        imgs_ok = p3.evaluate("[...document.querySelectorAll('#grid img')].every(i => i.complete && i.naturalWidth > 0)")
        p3.screenshot(path=os.path.join(OUT, 'player-new-theme.png'), full_page=True)
        # ผู้เล่นเดิมเข้า QR ชุดใหม่ → ถามก่อน
        record('4d. พิธีกรสลับชุดภาพ → รอบใหม่อัตโนมัติ และผู้เล่นที่สแกน QR ชุดใหม่ได้บัตรชุดใหม่',
               hs['round']['themeId'] == theme_id and st['themeId'] == theme_id and imgs_ok and 'Art Toy Test' in tn and hs['archive'][0]['themeId'] == 'sample-monsters',
               f'ตัวเลือกในหน้าพิธีกร: {opts} · บัตร {st["code"]} ชุด "{tn}" · รอบ {hs["round"]["no"]}')
        c3.close(); actx.close()
    run('4. admin', t_admin)

    # ---------------- PDF ----------------
    def t_pdf():
        pctx = browser.new_context(); pg = pctx.new_page(); watch(pg, 'print')
        pg.goto(BASE + 'print.html?t=sample-monsters&from=1&to=100&per=2&auto=1')
        pg.wait_for_selector('#report .banner', timeout=20000)
        rep = pg.inner_text('#report')
        pg.wait_for_function("[...document.images].every(i => i.complete)")
        pdf_path = os.path.join(OUT, 'cards-00001-00100.pdf')
        pg.pdf(path=pdf_path, format='A4', print_background=True, prefer_css_page_size=True)
        import pypdf
        pages = len(pypdf.PdfReader(pdf_path).pages)
        pg.screenshot(path=os.path.join(OUT, 'print.png'))
        record('9. ส่งออกบัตร PDF 100 ใบ (2 ใบ/หน้า) + แผ่นรายชื่อ + สลิปจับฉลาก', pages == 52 and '✅' in rep,
               f'{pages} หน้า (คาด 52) · {rep.splitlines()[0]}')
        pctx.close()
    run('9. pdf', t_pdf)

    hctx.close(); browser.close()

srv.shutdown()
real_errors = [e for e in errors if 'favicon' not in e]
record('10. ไม่มี JavaScript error ระหว่างการทดสอบทั้งหมด', not real_errors, '; '.join(real_errors[:8]))
json.dump({'results': results, 'errors': real_errors}, open(os.path.join(OUT, 'e2e-results.json'), 'w'), ensure_ascii=False, indent=2)
print(f"\n{sum(r['pass'] for r in results)}/{len(results)} passed")
