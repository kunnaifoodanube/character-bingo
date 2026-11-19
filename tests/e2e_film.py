"""End-to-end: Film & Animation Bingo (โหมดคำศัพท์ 32 คำ)
ใช้: python3 tests/e2e_film.py <site_dir> <fake_media_dir> <out_dir>
- site_dir: สำเนาโปรเจกต์ (ปิด Firebase ในสำเนา เพราะ sandbox ต่อ Google ไม่ได้)
- fake_media_dir: still.jpg + clip.webm — ใช้แทนไฟล์จาก upload.wikimedia.org ซึ่ง sandbox ต่อไม่ได้
  (ทดสอบว่าเกมเรียก URL ถูกและเล่นคลิปได้จริง; การแสดงภาพจริงตรวจบนเว็บไซต์จริงอีกครั้ง)
"""
import json, os, sys, threading, traceback, csv, io
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

SITE, FAKE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
PORT = 8767
BASE = f'http://localhost:{PORT}/'
results, errors, wm_requests = [], [], []
THEME = json.load(open(os.path.join(SITE, 'themes', 'film-animation.json')))
BYID = {c['id']: c for c in THEME['characters']}
STILL = open(os.path.join(FAKE, 'still.jpg'), 'rb').read()
CLIP = open(os.path.join(FAKE, 'clip.webm'), 'rb').read()


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


YT_STUB = r'''
window.__yt = [];
window.YT = { Player: function (el, o) {
  var self = this, f = document.createElement('iframe');
  f.setAttribute('data-video', o.videoId); f.setAttribute('data-vars', JSON.stringify(o.playerVars || {}));
  f.src = 'about:blank'; el.replaceWith ? el.replaceWith(f) : el.appendChild(f);
  var muted = true; self._vid = o.videoId; self._vars = o.playerVars;
  self.mute = function () { muted = true; }; self.unMute = function () { muted = false; }; self.isMuted = function () { return muted; };
  self.setVolume = function () {}; self.playVideo = function () {}; self.seekTo = function () {};
  self.destroy = function () { f.remove(); self._destroyed = true; };
  window.__yt.push(self);
  setTimeout(function () { o.events.onReady({ target: self }); o.events.onStateChange({ data: 1, target: self }); }, 30);
} };
if (window.onYouTubeIframeAPIReady) setTimeout(window.onYouTubeIframeAPIReady, 0);
'''


def fake_yt(route):
    wm_requests.append(route.request.url)
    route.fulfill(status=200, body=YT_STUB, headers={'Content-Type': 'text/javascript'})


def fake_wm(route):
    url = route.request.url
    wm_requests.append(url)
    if url.endswith('.webm'):
        route.fulfill(status=200, body=CLIP, headers={'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*'})
    else:
        route.fulfill(status=200, body=STILL, headers={'Content-Type': 'image/jpeg', 'Access-Control-Allow-Origin': '*'})


with sync_playwright() as p:
    browser = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pixel = p.devices['Pixel 7']
    small = dict(p.devices['Galaxy S9+']); small['viewport'] = {'width': 360, 'height': 740}
    iphone = dict(p.devices['iPhone 13']); iphone.pop('default_browser_type', None)

    def ctx_of(**kw):
        ctx = browser.new_context(service_workers='block', **kw)
        ctx.route('https://upload.wikimedia.org/**', fake_wm)
        ctx.route('https://www.youtube.com/iframe_api', fake_yt)
        ctx.route('https://i.ytimg.com/**', fake_wm)
        ctx.route('https://m.media-amazon.com/**', fake_wm)
        return ctx

    def new_player(device, name, url='index.html'):
        ctx = ctx_of(**device); page = ctx.new_page(); watch(page, 'player')
        page.goto(BASE + url); page.wait_for_selector('#join:not(.hidden)', timeout=15000)
        page.fill('#nameInput', name); page.click('#joinForm button[type=submit]')
        page.wait_for_selector('#play:not(.hidden)')
        return ctx, page

    def player_state(page): return page.evaluate("JSON.parse(localStorage.getItem('cb.player.v1'))")

    # ---------- F1 ผู้เล่น: คำภาษาอังกฤษอย่างเดียว อ่านครบทุกคำบนจอมือถือ ----------
    def t_player():
        for label, dev in (('Android Pixel 7 (412px)', pixel), ('Android จอเล็ก 360px', small), ('Android จอเล็กมาก 320px', dict(small, viewport={'width': 320, 'height': 640})), ('iPhone 13 (จำลองขนาด)', iphone)):
            ctx, page = new_player(dev, 'นักศึกษา')
            st = player_state(page)
            info = page.evaluate("""() => {
              const cells = [...document.querySelectorAll('#grid .cell')];
              const tw = cells.map(c => c.querySelector('.tw'));
              const broken = t => { // คำใดคำหนึ่งถูกตัดขึ้นบรรทัดใหม่กลางคำ?
                const r = document.createRange(), node = t.firstChild, txt = node.textContent; let pos = 0;
                if (t.classList.contains('hy')) return false; // จอเล็กมาก: ตัดพร้อมขีดโดยตั้งใจ
                for (const w of txt.split(/[ -]/)) { r.setStart(node, pos); r.setEnd(node, pos + w.length); if (r.getClientRects().length > 1) return true; pos += w.length + 1; }
                return false; };
              const cellW = cells.map(c => c.getBoundingClientRect().width), overlap = Math.max(...cellW) - Math.min(...cellW) > 1;
              const clipped = tw.filter(t => !t || t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().width > t.parentElement.getBoundingClientRect().width || t.offsetHeight > t.parentElement.clientHeight || broken(t)).map(t => t ? t.textContent : '?');
              return { overlap, hy: tw.filter(t => t.classList.contains('hy')).map(t => t.textContent), n: cells.length, imgs: document.querySelectorAll('#grid img, #grid video').length,
                words: tw.map(t => t && t.textContent), clipped,
                hscroll: document.documentElement.scrollWidth > innerWidth, gridTxt: document.getElementById('grid').classList.contains('txt'),
                minFont: Math.min(...tw.map(t => parseFloat(getComputedStyle(t).fontSize))) };
            }""")
            names = [BYID[i]['name'] for i in st['cells']]
            thai = any(any('฀' <= ch <= '๿' for ch in w) for w in info['words'])
            page.screenshot(path=os.path.join(OUT, f'F1-player-{dev["viewport"]["width"]}.png'), full_page=True)
            record(f'F1. ผู้เล่น {label}: บัตร 4×4 เป็นคำภาษาอังกฤษล้วน ไม่มีภาพ/คำแปล ตัวอักษรไม่ถูกตัด',
                   info['n'] == 16 and info['imgs'] == 0 and info['words'] == names and not thai and not info['clipped'] and not info['hscroll'] and info['gridTxt'] and not info['overlap'] and info['minFont'] >= 11,
                   f'บัตร {st["code"]} · ตัวอักษรเล็กสุด {info["minFont"]:.1f}px · ตัดคำพร้อมขีด {info["hy"]} · ถูกตัดผิด {info["clipped"]} · ตัวอย่าง {info["words"][:4]}')
            # แตะได้ / ยกเลิกได้
            page.click('#grid .cell >> nth=5'); page.click('#grid .cell >> nth=6'); page.click('#grid .cell >> nth=6')
            st2 = player_state(page)
            record(f'F1b. ผู้เล่น {label}: แตะทำเครื่องหมาย/ยกเลิกได้', st2['marks'] == [5], str(st2['marks']))
            ctx.close()
    run('F1', t_player)

    # ---------- F2 จอพิธีกร (โปรเจกเตอร์ 1366×768) ----------
    hctx = ctx_of(viewport={'width': 1366, 'height': 768})
    host = hctx.new_page(); watch(host, 'host')

    def hstate(): return host.evaluate('window.__host.state()')

    def draw_once():
        host.wait_for_function('!window.__host.busy()', timeout=10000)
        host.click('#btnDraw')
        host.wait_for_function('!window.__host.busy()', timeout=10000)

    def big_info():
        return host.evaluate("""() => {
          const m = document.getElementById('bigMedia'), el = m.querySelector('iframe,img,video');
          const r = m.getBoundingClientRect();
          const yp = window.__host.ytPlayer();
          return { hidden: m.classList.contains('hidden'), tag: el ? el.tagName : null, src: el ? (el.getAttribute('data-video') || el.currentSrc || el.src) : '',
            ytVid: yp && yp._vid, ytVars: yp && yp._vars, sound: !document.getElementById('btnSound').classList.contains('hidden'),
            poster: el && el.poster || '', muted: el && el.muted, loop: el && el.loop, ready: el && el.readyState, paused: el && el.paused,
            playsinline: el && el.hasAttribute('playsinline'), fit: el ? getComputedStyle(el).objectFit : '',
            w: r.width, h: r.height, name: document.getElementById('bigName').innerText,
            credit: !document.getElementById('btnCredit').classList.contains('hidden'),
            overflowY: document.documentElement.scrollHeight > innerHeight + 1, overflowX: document.documentElement.scrollWidth > innerWidth + 1 };
        }""")

    def t_host():
        host.goto(BASE + 'host.html')
        host.wait_for_function("document.querySelectorAll('#board .b').length === 32", timeout=15000)
        sel = host.eval_on_selector('#themeSel', 'e => e.value')
        board_txt = host.evaluate("[...document.querySelectorAll('#board .b')].every(b => !b.querySelector('img'))")
        host.screenshot(path=os.path.join(OUT, 'F2-host-start-1366.png'))
        record('F2a. หน้าพิธีกรเปิดชุด Film & Animation เป็นค่าเริ่มต้น แสดงรายการ 32 คำ',
               sel.endswith(':film-animation') and board_txt and 'film-animation' == hstate()['themeId'], sel)
        draw_once()
        ids = [d['id'] for d in hstate()['round']['draws']]
        c = BYID[ids[-1]]
        host.wait_for_function("document.querySelector('#bigMedia img') && document.querySelector('#bigMedia img').complete", timeout=8000)
        b = big_info()
        name_ok = c['name'] in b['name'] and c['th'] in b['name']
        src_ok = b['tag'] == 'IMG' and b['src'] == c['media']['src'] and b['fit'] == 'contain'
        host.screenshot(path=os.path.join(OUT, f'F2-host-reveal-{c["id"]}.png'))
        record('F2b. สุ่ม 1 คำ → จอใหญ่แสดงโปสเตอร์ของคำนั้น (ไม่ตัดภาพ) + “English — ไทย” + ปุ่มเครดิต ไม่ล้นจอ 1366×768',
               (not b['hidden']) and src_ok and name_ok and b['credit'] and not b['overflowY'] and not b['overflowX'] and abs(b['w'] - b['h']) < 2,
               f'{c["name"]} → {b["src"][-50:]} กรอบ {b["w"]:.0f}×{b["h"]:.0f}px · "{b["name"]}"')
        host.click('#btnCredit'); host.wait_for_selector('.modal table.credit')
        t = host.inner_text('.modal'); links = host.eval_on_selector_all('.modal a', 'as => as.map(a => a.href)')
        host.screenshot(path=os.path.join(OUT, 'F2-host-credit-one.png'))
        host.click('.modal .actions .btn')
        cr = c['credit']
        record('F2c. ปุ่ม “เครดิตภาพนี้” แสดงชื่อผลงาน เจ้าของลิขสิทธิ์ ลิงก์ที่มา สถานะ และภาพสำรอง',
               cr['title'] in t and cr['author'] in t and cr['sourceUrl'] in links and 'โปสเตอร์' in t and c['fallbackCredit']['license'] in t,
               f'{cr["title"][:50]} · {cr["sourceUrl"]}')
        host.click('#btnCredits'); host.wait_for_selector('.modal .credits')
        n = host.evaluate("document.querySelectorAll('.modal .cr-item').length")
        okc = host.evaluate("[...document.querySelectorAll('.modal .cr-item')].filter(e => e.innerText.includes('โปสเตอร์') && e.querySelector('img')).length")
        host.screenshot(path=os.path.join(OUT, 'F2-host-credits-all.png'))
        host.click('.modal .actions .btn')
        record('F2d. ปุ่ม “เครดิต / แหล่งภาพ” แสดงครบ 32 รายการ ทุกรายการมีเครดิต + ภาพย่อ', n == 32 and okc == 32, f'{n} รายการ · ครบ {okc}')
        vids = []
        def grab():
            cid = hstate()['round']['draws'][-1]['id']
            host.wait_for_function("document.querySelector('#bigMedia img')", timeout=8000)
            b = big_info(); b['id'] = cid; vids.append(b)
        grab()
        while len(hstate()['round']['draws']) < 32:
            draw_once(); grab()
        ids = [d['id'] for d in hstate()['round']['draws']]
        good = [v for v in vids if v['tag'] == 'IMG' and v['src'] == BYID[v['id']]['media']['src']]
        alive = host.evaluate("(window.__yt || []).filter(p => !p._destroyed).length")
        record('F2e. ทั้ง 32 คำแสดงโปสเตอร์/ภาพที่ถูกต้อง ไม่มีเครื่องเล่น YouTube ค้าง', len(good) == 32 and alive == 0, f'ถูกต้อง {len(good)}/32 · YouTube ค้าง {alive}')
        record('F2f. สุ่มครบ 32 คำ ไม่ซ้ำ และปุ่มสุ่มปิด', len(ids) == 32 and len(set(ids)) == 32 and host.is_disabled('#btnDraw'), host.inner_text('#btnDraw'))
        host.set_viewport_size({'width': 1920, 'height': 1080}); host.wait_for_timeout(300)
        b = big_info(); host.screenshot(path=os.path.join(OUT, 'F2-host-1920.png'))
        host.set_viewport_size({'width': 1366, 'height': 768})
        record('F2g. จอ Full HD 1920×1080 ไม่ล้นจอ สื่อเป็นสี่เหลี่ยมจัตุรัส', not b['overflowY'] and abs(b['w'] - b['h']) < 2, f'{b["w"]:.0f}×{b["h"]:.0f}')
        others = [u for u in wm_requests if not (u.startswith('https://upload.wikimedia.org/wikipedia/commons/') or u.startswith('https://i.ytimg.com/') or u.startswith('https://m.media-amazon.com/'))]
        record('F2h. โหลดภาพจาก IMDb / YouTube (ภาพปก) / Wikimedia เท่านั้น', not others, f'{len(wm_requests)} คำขอ · อื่น ๆ {others[:3]}')
        octx = browser.new_context(viewport={'width': 1366, 'height': 768}, service_workers='block')
        octx.route('https://upload.wikimedia.org/**', fake_wm)
        octx.route('https://m.media-amazon.com/**', lambda r: r.abort())
        octx.route('https://i.ytimg.com/**', lambda r: r.abort())
        op = octx.new_page(); watch(op, 'host-noyt')
        op.goto(BASE + 'host.html'); op.wait_for_function("document.querySelectorAll('#board .b').length === 32", timeout=15000)
        op.wait_for_function('!window.__host.busy()'); op.click('#btnDraw'); op.wait_for_function('!window.__host.busy()', timeout=10000)
        cid = op.evaluate('window.__host.state().round.draws.slice(-1)[0].id')
        fb = BYID[cid]['fallback']; want = fb['poster'] if fb['type'] == 'video' else fb['src']
        op.wait_for_function("u => document.querySelector('#bigMedia img') && document.querySelector('#bigMedia img').src === u", arg=want, timeout=15000)
        op.screenshot(path=os.path.join(OUT, 'F2-host-offline-fallback.png'))
        record('F2i. โหลดโปสเตอร์ไม่ได้ (ออฟไลน์/ถูกบล็อก) → แสดงภาพสำรองจาก Wikimedia', True, cid)
        octx.close()
    run('F2', t_host)

    # ---------- F3 ตรวจบิงโก ----------
    def verify(code):
        host.click('#btnVerify'); host.fill('#vcode', code); host.click('#vf button[type=submit]')
        host.wait_for_selector('#vout .banner'); txt = host.inner_text('#vout')
        cells = host.evaluate("[...document.querySelectorAll('#vout .cell')].map(c => ({t: c.innerText, img: !!c.querySelector('img')}))")
        host.click('.modal .actions .btn')
        return txt, cells

    def new_round():
        host.click('#btnNewRound'); nxt = hstate()['round']['no'] + 1
        host.fill('#cfm', str(nxt)); host.click('.modal .actions .btn.danger')
        host.wait_for_function(f'window.__host.state().round.no === {nxt}')

    def t_verify():
        ctx, page = new_player(pixel, 'ผู้ชนะ')
        st = player_state(page)
        txt, cells = verify(st['code'])
        record('F3a. สุ่มครบแล้ว → ตรวจบัตรผู้เล่นได้ ✅ และช่องในหน้าตรวจเป็นคำ (ไม่มีภาพ)',
               '✅' in txt and len(cells) == 16 and not any(c['img'] for c in cells) and [c['t'] for c in cells] == [BYID[i]['name'] for i in st['cells']],
               txt.splitlines()[0])
        new_round()
        for _ in range(3): draw_once()
        drawn = [d['id'] for d in hstate()['round']['draws']]
        # ผู้เล่นแตะครบแถวบนเองทั้งที่ยังไม่ถูกเรียกครบ
        page.reload(); page.wait_for_selector('#play:not(.hidden)')
        try:
            for i in (0, 1, 2, 3): page.click(f'#grid .cell >> nth={i}', timeout=8000)
        except Exception:
            page.screenshot(path=os.path.join(OUT, 'F3-debug.png')); raise
        st = player_state(page)
        top = st['cells'][:4]
        txt2, _ = verify(st['code'])
        cheat = not all(x in drawn for x in top)
        record('F3b. ผู้เล่นแตะครบแถวเองแต่พิธีกรยังไม่เรียกครบ → ตรวจแล้ว ❌ (ใช้ประวัติพิธีกรเท่านั้น)', (not cheat) or ('❌' in txt2), txt2.splitlines()[0])
        ctx.close()
    run('F3', t_verify)

    # ---------- F4 Admin: แก้คำ/คำแปล/สื่อ/เครดิต/สิทธิ์ และส่งออก ----------
    def t_admin():
        actx = ctx_of(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        ad = actx.new_page(); watch(ad, 'admin')
        ad.goto(BASE + 'admin.html')
        ad.click('#btnCopyPub'); ad.click('.modal [data-v="film-animation"]')
        ad.wait_for_selector('#editor:not(.hidden)')
        ad.wait_for_function("document.querySelectorAll('#chars .char').length === 32")
        checked = ad.is_checked('#thText')
        ad.screenshot(path=os.path.join(OUT, 'F4-admin-terms.png'), full_page=False)
        # แก้คำแปลของคำแรก
        card = '#chars .char[data-id="action"]'
        ad.fill(card + ' [data-th]', 'แอ็กชัน (แก้ไข)')
        # เปลี่ยนสถานะสิทธิ์เป็น "ยังไม่ยืนยัน"
        ad.click(card + ' [data-det]'); ad.wait_for_selector('.modal #cStatus')
        ad.screenshot(path=os.path.join(OUT, 'F4-admin-details.png'))
        ad.select_option('.modal #cStatus', 'pending'); ad.click('.modal .actions .btn:not(.ghost)')
        ad.wait_for_timeout(500)
        lic = ad.inner_text(card + ' .lic'); warn = ad.inner_text('#validation')
        # ลองตั้ง "ตรวจแล้ว" โดยไม่มีสัญญาอนุญาต → ต้องไม่ยอม
        ad.click(card + ' [data-det]'); ad.fill('.modal #cLicense', ''); ad.select_option('.modal #cStatus', 'ok')
        ad.click('.modal .actions .btn:not(.ghost)'); ad.wait_for_timeout(300)
        still_open = ad.is_visible('.modal #cStatus')
        ad.click('.modal .actions .btn.ghost')
        # เพิ่มคำใหม่แล้วลบ
        ad.click('#btnAddTerm'); n_add = ad.evaluate("document.querySelectorAll('#chars .char').length")
        last = ad.evaluate("[...document.querySelectorAll('#chars .char')].pop().dataset.id")
        ad.click(f'#chars .char[data-id="{last}"] [data-del]'); ad.click('.modal .actions .btn.danger')
        ad.wait_for_function("document.querySelectorAll('#chars .char').length === 32")
        record('F4a. Admin: เปิดชุดคำศัพท์ แก้คำแปล ตั้งสถานะสิทธิ์ เพิ่ม/ลบคำได้ · สื่อที่ยังไม่ยืนยันสิทธิ์ถูกทำเครื่องหมายว่าไม่แสดง และบังคับกรอกสัญญาอนุญาตก่อนตั้ง “ตรวจแล้ว”',
               checked and 'ไม่แสดงในเกม' in lic and 'ยังไม่ยืนยันสิทธิ์' in warn and still_open and n_add == 33, f'{lic} · {warn.splitlines()[1] if len(warn.splitlines()) > 1 else warn}')
        ad.wait_for_timeout(600)
        with ad.expect_download() as d1: ad.click('#btnExportTheme')
        exp = json.load(open(d1.value.path()))
        a = [c for c in exp['characters'] if c['id'] == 'action'][0]
        sand = [c for c in exp['characters'] if c['id'] == 'sand-animation'][0]
        with ad.expect_download() as d2: ad.click('#btnCreditsCsv')
        rows = list(csv.reader(io.StringIO(open(d2.value.path(), encoding='utf-8-sig').read())))
        record('F4b. ส่งออก JSON เก็บโหมดคำศัพท์ คำแปล สื่อ เครดิต ครบ + ส่งออกเครดิตเป็น CSV 32 แถว',
               exp['display'] == 'text' and len(exp['characters']) == 32 and a['th'] == 'แอ็กชัน (แก้ไข)' and a['credit']['status'] == 'pending'
               and sand['media'] == BYID['sand-animation']['media'] and sand['fallback'] == BYID['sand-animation']['fallback'] and sand['credit']['status'] == 'poster' and len(rows) == 33 and rows[0][0] == 'term',
               f'CSV {len(rows) - 1} แถว · หัวตาราง {rows[0][:6]}')
        # เครดิตใน Admin
        ad.click('#btnCredits'); ad.wait_for_selector('.modal .credits')
        n = ad.evaluate("document.querySelectorAll('.modal .cr-item').length"); ad.click('.modal .actions .btn')
        record('F4c. ปุ่ม “เครดิต / แหล่งภาพ” ในหน้า Admin แสดงครบ', n == 32, f'{n} รายการ')
        # ทดลองบนหน้าพิธีกรด้วยฉบับร่าง: คำที่ยังไม่ยืนยันสิทธิ์ต้องไม่แสดงภาพ
        h2 = actx.new_page(); watch(h2, 'host-local')
        h2.goto(BASE + 'host.html?t=film-animation&src=local')
        h2.wait_for_function("document.querySelectorAll('#board .b').length === 32", timeout=15000)
        shown = h2.evaluate("""() => { const t = window.__host.theme(); const c = t.characters.find(x => x.id === 'action');
            return { local: t._source, allowed: Bingo.mediaAllowed(c), th: c.th }; }""")
        record('F4d. ฉบับร่างในเครื่องใช้บนหน้าพิธีกรได้ และสื่อที่ตั้ง “ยังไม่ยืนยันสิทธิ์” จะไม่ถูกแสดง',
               shown['allowed'] is False and shown['th'] == 'แอ็กชัน (แก้ไข)', json.dumps(shown, ensure_ascii=False))
        actx.close()
    run('F4', t_admin)

    # ---------- F5 พิมพ์บัตรสำรอง (โหมดคำ) ----------
    def t_print():
        pctx = ctx_of(); pg = pctx.new_page(); watch(pg, 'print')
        pg.goto(BASE + 'print.html?t=film-animation&from=1&to=20&per=2&auto=1')
        pg.wait_for_selector('#report .banner', timeout=20000)
        info = pg.evaluate("""() => ({ cards: document.querySelectorAll('.pcard').length,
            imgs: document.querySelectorAll('.pcard img').length,
            cellTxt: [...document.querySelectorAll('.pcard .pgrid')][0].innerText,
            call: (document.querySelector('.page.call') || {}).innerText || '' })""")
        pdf = os.path.join(OUT, 'F5-film-cards.pdf')
        pg.pdf(path=pdf, format='A4', print_background=True, prefer_css_page_size=True)
        import pypdf
        pages = len(pypdf.PdfReader(pdf).pages)
        pg.screenshot(path=os.path.join(OUT, 'F5-print.png'))
        record('F5. พิมพ์บัตรสำรองโหมดคำ: 20 ใบ ไม่มีภาพบนบัตร แผ่นเรียกมีคำแปลไทย',
               info['cards'] == 20 and info['imgs'] == 0 and 'Sand Animation' in info['call'] and 'แอนิเมชันทราย' in info['call'], f'{pages} หน้า PDF')
        pctx.close()
    run('F5', t_print)

    hctx.close(); browser.close()

srv.shutdown()
real = [e for e in errors if 'favicon' not in e and not (e.startswith('host-noyt') and 'Failed to load resource' in e)]  # ตั้งใจบล็อก YouTube
record('F6. ไม่มี JavaScript error', not real, '; '.join(real[:5]))
json.dump({'results': results, 'errors': real}, open(os.path.join(OUT, 'e2e-film-results.json'), 'w'), ensure_ascii=False, indent=1)
print(f"\n{sum(r['ok'] for r in results)}/{len(results)} passed")
