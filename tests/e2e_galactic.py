"""End-to-end: เวอร์ชัน Galactic Bingo (สติกเกอร์ SDM 33 ภาพ) + การแยกจากเวอร์ชันหลัก
ใช้: python3 tests/e2e_galactic.py <repo_copy_dir> <out_dir>
- repo_copy_dir: สำเนาทั้ง repo (มีเวอร์ชันหลักที่ / และ Galactic ที่ /galactic/) ปิด Firebase ในสำเนา
"""
import json, os, sys, threading, traceback
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

SITE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PORT = 8769
ROOT = f'http://localhost:{PORT}/'
GX = ROOT + 'galactic/'
THEME = json.load(open(os.path.join(SITE, 'galactic', 'themes', 'galactic-stickers.json')))
BYID = {c['id']: c for c in THEME['characters']}
# ชื่อแคชของแต่ละเวอร์ชันอ่านจาก sw.js (ไม่ต้องแก้เทสต์ทุกครั้งที่เพิ่มเลขเวอร์ชัน)
import re as _re
def _sw_cache(path):
    s = open(path, encoding='utf-8').read()
    return _re.search(r"var PREFIX = '([^']+)'", s).group(1) + _re.search(r"var VERSION = PREFIX \+ '([^']+)'", s).group(1)
CB_CACHE = _sw_cache(os.path.join(SITE, 'sw.js'))
GX_CACHE = _sw_cache(os.path.join(SITE, 'galactic', 'sw.js'))
results, errors, bad_requests, failed_requests = [], [], [], []


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()


srv = ThreadingHTTPServer(('127.0.0.1', PORT), partial(Quiet, directory=SITE))
threading.Thread(target=srv.serve_forever, daemon=True).start()


def record(name, ok, detail=''):
    results.append({'name': name, 'ok': bool(ok), 'detail': detail})
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + detail if detail else ''), flush=True)


def run(name, fn):
    try: fn()
    except Exception as e:
        traceback.print_exc(); record(name + ' (exception)', False, str(e)[:300])


def watch(page, label):
    page.on('pageerror', lambda e: errors.append(f'{label}: pageerror {e}'))
    page.on('console', lambda m: m.type == 'error' and errors.append(f'{label}: console.error {m.text}'))
    page.on('response', lambda r: r.status >= 400 and bad_requests.append(f'{label}: {r.status} {r.url}'))
    page.on('requestfailed', lambda r: failed_requests.append(f'{label}: {r.failure} {r.url}'))


with sync_playwright() as p:
    browser = p.chromium.launch()
    pixel = p.devices['Pixel 7']
    small = dict(p.devices['Galaxy S9+']); small['viewport'] = {'width': 360, 'height': 740}

    def new_player(device, name, base=GX):
        ctx = browser.new_context(service_workers='block', **device); page = ctx.new_page(); watch(page, 'player')
        page.goto(base + 'index.html'); page.wait_for_selector('#join:not(.hidden)', timeout=15000)
        page.fill('#nameInput', name); page.click('#joinForm button[type=submit]')
        page.wait_for_selector('#play:not(.hidden)')
        return ctx, page

    # ---------- G1 ผู้เล่น ----------
    def t_player():
        for label, dev in (('Android Pixel 7 (412px)', pixel), ('Android จอเล็ก 360px', small)):
            ctx, page = new_player(dev, 'นักเรียน')
            st = page.evaluate("JSON.parse(localStorage.getItem('gx.cb.player.v1'))")
            plain = page.evaluate("localStorage.getItem('cb.player.v1')")
            page.wait_for_function("[...document.querySelectorAll('#grid img')].every(i => i.complete && i.naturalWidth > 0)", timeout=15000)
            info = page.evaluate("""() => {
              const cells = [...document.querySelectorAll('#grid .cell')];
              return { n: cells.length, imgs: cells.map(c => { const i = c.querySelector('img'); return i ? i.getAttribute('src') : null; }),
                names: cells.map(c => (c.querySelector('.nm') || {}).textContent),
                natural: cells.map(c => c.querySelector('img').naturalWidth), title: document.title,
                hscroll: document.documentElement.scrollWidth > innerWidth,
                clipped: cells.filter(c => { const nm = c.querySelector('.nm'); return nm && nm.scrollWidth > nm.clientWidth + 1; }).map(c => c.querySelector('.nm').textContent) };
            }""")
            want_imgs = [BYID[i]['img'] for i in st['cells']]
            want_names = [BYID[i]['name'] for i in st['cells']]
            page.screenshot(path=os.path.join(OUT, f'G1-player-{dev["viewport"]["width"]}.png'), full_page=True)
            record(f'G1. ผู้เล่น {label}: บัตร 4×4 แสดงสติกเกอร์ SDM พร้อมชื่อ ภาพโหลดครบ ไม่ล้นจอ',
                   info['n'] == 16 and info['imgs'] == want_imgs and info['names'] == want_names and min(info['natural']) == 600
                   and not info['hscroll'] and 'Galactic Bingo' in info['title'] and plain is None and st['themeId'] == 'galactic-stickers',
                   f'บัตร {st["code"]} · ชื่อถูกตัด {info["clipped"]} · ตัวอย่าง {info["names"][:4]}')
            page.click('#grid .cell >> nth=3')
            st2 = page.evaluate("JSON.parse(localStorage.getItem('gx.cb.player.v1'))")
            record(f'G1b. ผู้เล่น {label}: แตะทำเครื่องหมายได้ และบันทึกในพื้นที่ของ Galactic (gx.)', st2['marks'] == [3], str(st2['marks']))
            ctx.close()
    run('G1', t_player)

    # ---------- G2 พิธีกร ----------
    hctx = browser.new_context(service_workers='block', viewport={'width': 1366, 'height': 768})
    host = hctx.new_page(); watch(host, 'host')

    def hstate(): return host.evaluate('window.__host.state()')

    def draw_once():
        host.wait_for_function('!window.__host.busy()', timeout=10000)
        host.click('#btnDraw')
        host.wait_for_function('!window.__host.busy()', timeout=10000)

    def t_host():
        host.goto(GX + 'host.html')
        host.wait_for_function("document.querySelectorAll('#board .b').length === 33", timeout=15000)
        record('G2a. หน้าพิธีกร Galactic เปิดชุดสติกเกอร์ 33 ภาพเป็นค่าเริ่มต้น', hstate()['themeId'] == 'galactic-stickers' and 'Galactic Bingo' in host.inner_text('h1'), host.inner_text('h1'))
        seen, bad = [], []
        while len(hstate()['round']['draws']) < 33:
            draw_once()
            cid = hstate()['round']['draws'][-1]['id']
            host.wait_for_function("(() => { const i = document.querySelector('#bigMedia img'); return i && i.complete && i.naturalWidth > 0; })()", timeout=8000)
            b = host.evaluate("""() => { const i = document.querySelector('#bigMedia img'), r = i.getBoundingClientRect();
              return { src: i.getAttribute('src'), w: r.width, h: r.height, name: document.getElementById('bigName').innerText,
                ov: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1 }; }""")
            if len(seen) == 0: host.screenshot(path=os.path.join(OUT, 'G2-host-1366.png'))
            if b['src'] != BYID[cid]['img'] or BYID[cid]['name'] not in b['name'] or b['ov'] or b['w'] < 300: bad.append((cid, b))
            seen.append(cid)
        record('G2b. สุ่มครบ 33 ภาพ ไม่ซ้ำ จอใหญ่แสดงภาพ + ชื่อตรงกันทุกครั้ง ไม่ล้นจอ 1366×768',
               len(set(seen)) == 33 and not bad and host.is_disabled('#btnDraw'), f'ผิด {bad[:2]}')
        hk = host.evaluate("Object.keys(localStorage).filter(k => k.indexOf('host') >= 0)")
        record('G2c. สถานะพิธีกรเก็บแยกในพื้นที่ gx. (ไม่ทับเวอร์ชันหลัก)', hk == ['gx.cb.host.v1'], str(hk))
    run('G2', t_host)

    # ---------- G3 ตรวจบัตร ----------
    def t_verify():
        ctx, page = new_player(pixel, 'ผู้ชนะ')
        st = page.evaluate("JSON.parse(localStorage.getItem('gx.cb.player.v1'))")
        host.click('#btnVerify'); host.fill('#vcode', st['code']); host.click('#vf button[type=submit]')
        host.wait_for_selector('#vout .banner'); txt = host.inner_text('#vout')
        cells = host.evaluate("[...document.querySelectorAll('#vout .cell img')].map(i => i.getAttribute('src'))")
        host.screenshot(path=os.path.join(OUT, 'G3-verify.png'))
        host.click('.modal .actions .btn')
        record('G3. ตรวจบัตรผู้เล่น (สุ่มครบแล้ว) → ✅ และหน้าตรวจแสดงภาพตรงกับบัตร', '✅' in txt and cells == [BYID[i]['img'] for i in st['cells']], txt.splitlines()[0])
        ctx.close()
    run('G3', t_verify)

    # ---------- G4 เวอร์ชันหลักไม่ถูกกระทบ (เครื่องเดียวกัน) ----------
    def t_isolation():
        main = hctx.new_page(); watch(main, 'main-host')
        main.goto(ROOT + 'host.html')
        main.wait_for_function("document.querySelectorAll('#board .b').length === 32", timeout=15000)
        ms = main.evaluate('window.__host.state()')
        gx_after = hstate()
        record('G4a. เปิดเวอร์ชันหลักในเครื่องเดียวกัน: ยังเป็น Film & Animation รอบใหม่ (ไม่เห็นการสุ่มของ Galactic)',
               ms['themeId'] == 'film-animation' and len(ms['round']['draws']) == 0 and len(gx_after['round']['draws']) == 33,
               f'หลัก: {ms["themeId"]} สุ่มแล้ว {len(ms["round"]["draws"])} · Galactic สุ่มแล้ว {len(gx_after["round"]["draws"])}')
        main.close()
    run('G4', t_isolation)

    # ---------- G5 Service Worker สองเวอร์ชันไม่ลบแคชของกันและกัน + Galactic เปิดออฟไลน์ได้ ----------
    def t_sw():
        ctx = browser.new_context(viewport={'width': 1366, 'height': 768})
        a = ctx.new_page(); watch(a, 'sw-main')
        import time
        def poll(page, js, ok, secs=30):
            end = time.time() + secs
            while time.time() < end:
                v = page.evaluate(js)
                if ok(v): return v
                time.sleep(0.5)
            return v
        a.goto(ROOT + 'host.html')
        poll(a, 'navigator.serviceWorker.ready.then(r => !!r.active)', bool)
        b = ctx.new_page(); watch(b, 'sw-gx')
        b.goto(GX + 'host.html')
        poll(b, 'navigator.serviceWorker.ready.then(r => !!r.active)', bool)
        # ภาพที่ SW เก็บล่วงหน้า (ไม่รวมภาพที่หน้าเว็บโหลดเอง): ใช้ cache แยกตรวจตอนติดตั้ง
        n_img = poll(b, "caches.open('" + GX_CACHE + "').then(c => c.keys()).then(k => k.filter(r => r.url.endsWith('.webp')).length)", lambda v: v >= 33)
        a.reload(); poll(a, 'navigator.serviceWorker.ready.then(r => !!r.active)', bool)
        keys = b.evaluate('caches.keys()')
        record('G5a. แคชของสองเวอร์ชันอยู่ร่วมกัน (cb- และ gx-) และ Galactic เก็บภาพ 33 ภาพไว้ในเครื่องแล้ว', CB_CACHE in keys and GX_CACHE in keys and n_img >= 33, f'{keys} · ภาพในแคช {n_img}')
        b.reload(); b.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)
        ctx.set_offline(True)
        c = ctx.new_page(); watch(c, 'sw-offline')
        c.goto(GX + 'index.html'); c.wait_for_selector('#join:not(.hidden)', timeout=15000)
        c.fill('#nameInput', 'ออฟไลน์'); c.click('#joinForm button[type=submit]'); c.wait_for_selector('#play:not(.hidden)')
        c.wait_for_function("[...document.querySelectorAll('#grid img')].every(i => i.complete && i.naturalWidth > 0)", timeout=15000)
        record('G5b. หลังเปิดครั้งแรกแล้ว ปิดอินเทอร์เน็ต → หน้าผู้เล่น Galactic ยังเปิดได้และภาพขึ้นครบ', True, '16 ภาพโหลดจากเครื่อง')
        ctx.set_offline(False); ctx.close()
    run('G5', t_sw)

    # ---------- G6 พิมพ์บัตรสำรอง ----------
    def t_print():
        ctx = browser.new_context(service_workers='block'); pg = ctx.new_page(); watch(pg, 'print')
        pg.goto(GX + 'print.html?t=galactic-stickers&from=1&to=8&per=2&auto=1')
        pg.wait_for_function("document.querySelectorAll('.pcard').length >= 8", timeout=20000)
        pg.wait_for_function("[...document.querySelectorAll('.pcard img')].every(i => i.complete && i.naturalWidth > 0)", timeout=20000)
        n = pg.evaluate("document.querySelectorAll('.pcard').length"); im = pg.evaluate("document.querySelectorAll('.pcard img').length")
        pg.pdf(path=os.path.join(OUT, 'G6-print.pdf'), format='A4')
        record('G6. พิมพ์บัตรสำรอง Galactic: บัตรมีสติกเกอร์ครบ 16 ภาพต่อใบ', n >= 8 and im == n * 16, f'{n} ใบ · ภาพ {im}')
        ctx.close()
    run('G6', t_print)

    real = [e for e in errors if 'favicon' not in e and 'ERR_INTERNET_DISCONNECTED' not in e and not e.startswith('sw-offline')]
    bad = [r for r in bad_requests if 'favicon' not in r]
    record('G7. ไม่มี JavaScript error และไม่มีไฟล์หาย (404)', not real and not bad, '; '.join((real + bad)[:5]))
    browser.close()

print('failed requests:', failed_requests[:8])
json.dump(results, open(os.path.join(OUT, 'e2e-galactic-results.json'), 'w'), ensure_ascii=False, indent=1)
print(f'{sum(r["ok"] for r in results)}/{len(results)} passed')
