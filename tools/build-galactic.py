#!/usr/bin/env python3
"""สร้างเวอร์ชัน "Galactic Bingo" (สติกเกอร์มาสคอต SDM 33 ภาพ) ไว้ในโฟลเดอร์ galactic/

- ใช้โค้ดเกมชุดเดียวกับเวอร์ชันหลัก (คัดลอกมา) แต่แยกพื้นที่เก็บข้อมูล (data-ns="gx.") และแคช (gx-)
  เปิดสองเวอร์ชันบนเครื่องเดียวกันได้โดยไม่ทับกัน
- เวอร์ชันหลัก (/character-bingo/) ไม่ถูกแก้ชุดภาพหรือหน้าตา

- หน้าตาแนว "คืนอวกาศ" + ฟอนต์ Prompt อยู่ที่ tools/galactic-theme/ (คัดลอกเข้า galactic/ ให้อัตโนมัติ)

ใช้:  python3 tools/build-galactic.py                 อัปเดตโค้ดเกมเป็นรุ่นล่าสุด ใช้ภาพและชื่อสติกเกอร์เดิมใน galactic/themes/
      python3 tools/build-galactic.py <โฟลเดอร์ภาพ>    สร้างภาพใหม่จากต้นฉบับ 1.png..33.png, 32b.png
ภาพต้นฉบับ: Google Drive โฟลเดอร์ "สติกเกอร กาแลคติก" (Digital Arts SPU) — ไม่เก็บไฟล์ต้นฉบับขนาดใหญ่ใน repo
"""
import json, os, re, shutil, sys, tempfile
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'galactic')
SRC = sys.argv[1] if len(sys.argv) > 1 else None   # None = ใช้ภาพ/ชื่อเดิม
THEME_DIR = os.path.join(HERE, 'galactic-theme')
GX_VERSION = 'v1.6.5'   # เลขเวอร์ชันของ Galactic — เพิ่มทุกครั้งที่สร้างใหม่ (ล้างแคชเก่าในเครื่องผู้เล่น)

# (เลขไฟล์, ชื่อที่แสดงบนบัตร) — ข้อ 32 ใช้ไฟล์ปรับปรุง 32_(1.2).png
STICKERS = [
    ('1', 'กุ้งหงุดหงิด'), ('2', 'เขินจัง'), ('3', 'หลับปุ๋ย'), ('4', 'เยี่ยมไปเลย'),
    ('5', 'ข้าวไข่ดาว'), ('6', 'รีบส่งงาน'), ('7', 'โบกผ้าลา'), ('8', 'รักนะ'),
    ('9', 'เสียใจ'), ('10', 'โอเค'), ('11', 'เซอร์ไพรส์'), ('12', 'ตาวิบวับ'),
    ('13', 'ไปเรียนกัน'), ('14', 'เต้นเพลิน'), ('15', 'แอบมอง'), ('16', 'ขอบคุณ'),
    ('17', 'เชียร์สุดใจ'), ('18', 'โกรธแล้วนะ'), ('19', 'ไม่ได้จ้า'), ('20', 'ไม่สบาย'),
    ('21', 'สวัสดี'), ('22', 'ตกใจ'), ('23', 'ฟังเพลง'), ('24', 'โลก VR'),
    ('25', 'ส้มร่าเริง'), ('26', 'บินฉิว'), ('27', 'มาราคัส'), ('28', 'หน้านิ่ง'),
    ('29', 'วาดรูป'), ('30', 'สงสัยจัง'), ('31', 'เป่าฟอง'), ('32b', 'เล่นเกม'),
    ('33', 'ต่อบล็อก'),
]
SIZE = 600

SITE_FILES = ['index.html', 'host.html', 'admin.html', 'print.html', 'sw.js', 'manifest.webmanifest', 'firebase-config.js']
SITE_DIRS = ['assets']


def sticker(src, dst):
    im = Image.open(src).convert('RGBA')
    a = im.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    box = a.getbbox()
    im = im.crop(box)
    w, h = im.size
    side = int(max(w, h) * 1.06)
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2), im)
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    canvas.save(dst, 'WEBP', quality=82, method=6)


def main():
    keep = None
    if SRC is None:
        # เก็บภาพ + ชื่อสติกเกอร์เดิมไว้ก่อน แล้วค่อยใส่กลับ
        keep = tempfile.mkdtemp()
        shutil.copytree(os.path.join(OUT, 'themes'), os.path.join(keep, 'themes'))
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    if keep is None:
        os.makedirs(os.path.join(OUT, 'themes', 'galactic'))
    for f in SITE_FILES:
        shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, f))
    for d in SITE_DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(OUT, d))

    if keep is not None:
        shutil.copytree(os.path.join(keep, 'themes'), os.path.join(OUT, 'themes'))
        shutil.rmtree(keep)
        n = len(json.load(open(os.path.join(OUT, 'themes', 'galactic-stickers.json'), encoding='utf-8'))['characters'])
        finish()
        print('built', OUT, n, 'stickers (kept existing images)')
        return

    chars = []
    for i, (num, name) in enumerate(STICKERS, 1):
        cid = 'g%02d' % i
        rel = 'themes/galactic/%s.webp' % cid
        sticker(os.path.join(SRC, num + '.png'), os.path.join(OUT, rel))
        chars.append({'id': cid, 'name': name, 'img': rel})
    theme = {
        'format': 'character-bingo-theme@1',
        'id': 'galactic-stickers',
        'name': 'Galactic Bingo — สติกเกอร์ SDM',
        'category': 'มาสคอตคณะ',
        'updatedAt': '2026-11-19T00:00:00.000Z',
        'creditsNote': 'ภาพสติกเกอร์ชุด "กาแลคติก" มาสคอตคณะดิจิทัลมีเดีย มหาวิทยาลัยศรีปทุม (SDM) · ผลงานจาก Digital Arts SPU · ใช้ในกิจกรรมของคณะ',
        'characters': chars,
    }
    json.dump(theme, open(os.path.join(OUT, 'themes', 'galactic-stickers.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'format': 'character-bingo-index@1', 'default': 'galactic-stickers',
               'themes': [{'id': theme['id'], 'name': theme['name'], 'category': theme['category'], 'file': 'galactic-stickers.json'}]},
              open(os.path.join(OUT, 'themes', 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    finish()
    print('built', OUT, len(chars), 'stickers')


def finish():
    # แยกพื้นที่เก็บข้อมูล + ชื่อเกม
    for f in ['index.html', 'host.html', 'admin.html', 'print.html']:
        p = os.path.join(OUT, f)
        s = open(p, encoding='utf-8').read()
        s = s.replace('<html lang="th">', '<html lang="th" data-ns="gx.">', 1)
        s = s.replace('Character Bingo · Digital Media Open House', 'Galactic Bingo · Digital Media Open House')
        s = s.replace('Character Bingo', 'Galactic Bingo')
        # ?v= ของไฟล์ css/js ใช้เลขของ Galactic
        s = re.sub(r'\?v=[0-9.]+', '?v=' + GX_VERSION[1:], s)
        # ฟอนต์ Prompt ทุกหน้า + สีแนวคืนอวกาศ (ยกเว้นหน้าพิมพ์บัตร ให้พื้นขาวเหมือนเดิม)
        css = '\n  <link rel="stylesheet" href="assets/css/fonts.css?v=%s">' % GX_VERSION[1:]
        if f != 'print.html':
            css += '\n  <link rel="stylesheet" href="assets/css/galactic.css?v=%s">' % GX_VERSION[1:]
            s = s.replace('<meta name="theme-color" content="#6b3df5">', '<meta name="theme-color" content="#0f1433">')
        s, n = re.subn(r'(<link rel="stylesheet" href="assets/css/style\.css[^"]*">)', lambda m: m.group(1) + css, s, count=1)
        assert n == 1, f
        # หน้าสร้างเกมมีที่เดียว (หน้าหลัก) — Galactic ลิงก์ไปที่นั่น
        s = s.replace('href="create.html"', 'href="../create.html"')
        open(p, 'w', encoding='utf-8').write(s)
    for x in ['assets/js/create.js', 'assets/css/create.css']:
        if os.path.exists(os.path.join(OUT, x)): os.remove(os.path.join(OUT, x))
    shutil.copy(os.path.join(THEME_DIR, 'fonts.css'), os.path.join(OUT, 'assets', 'css', 'fonts.css'))
    shutil.copy(os.path.join(THEME_DIR, 'galactic.css'), os.path.join(OUT, 'assets', 'css', 'galactic.css'))
    shutil.copytree(os.path.join(THEME_DIR, 'fonts'), os.path.join(OUT, 'assets', 'fonts'))
    fonts = sorted(x for x in os.listdir(os.path.join(OUT, 'assets', 'fonts')) if x.endswith('.woff2'))
    p = os.path.join(OUT, 'sw.js')
    s = open(p).read()
    s = s.replace(" 'create.html', 'assets/js/create.js', 'assets/css/create.css',", '')
    s, n = re.subn(r"var PREFIX = 'cb-';", "var PREFIX = 'gx-';", s)
    assert n == 1
    s, n = re.subn(r"var VERSION = PREFIX \+ '[^']*';", "var VERSION = PREFIX + '%s';" % GX_VERSION, s)
    assert n == 1
    extra = ["'assets/css/fonts.css'", "'assets/css/galactic.css'"] + ["'assets/fonts/%s'" % x for x in fonts]
    s, n = re.subn(r"('assets/css/style\.css',)", lambda m: m.group(1) + ' ' + ', '.join(extra) + ',', s, count=1)
    assert n == 1
    open(p, 'w').write(s)
    p = os.path.join(OUT, 'manifest.webmanifest')
    m = json.load(open(p))
    m['name'], m['short_name'] = 'Galactic Bingo', 'Galactic'
    m['background_color'], m['theme_color'] = '#0f1433', '#0f1433'
    json.dump(m, open(p, 'w'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
