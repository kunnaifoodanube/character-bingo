#!/usr/bin/env python3
"""สร้างเวอร์ชัน "Galactic Bingo" (สติกเกอร์มาสคอต SDM 33 ภาพ) ไว้ในโฟลเดอร์ galactic/

- ใช้โค้ดเกมชุดเดียวกับเวอร์ชันหลัก (คัดลอกมา) แต่แยกพื้นที่เก็บข้อมูล (data-ns="gx.") และแคช (gx-)
  เปิดสองเวอร์ชันบนเครื่องเดียวกันได้โดยไม่ทับกัน
- เวอร์ชันหลัก (/character-bingo/) ไม่ถูกแก้ชุดภาพหรือหน้าตา

ใช้:  python3 tools/build-galactic.py <โฟลเดอร์ภาพต้นฉบับ 1.png..33.png>
ภาพต้นฉบับ: Google Drive โฟลเดอร์ "สติกเกอร กาแลคติก" (Digital Arts SPU) — ไม่เก็บไฟล์ต้นฉบับขนาดใหญ่ใน repo
"""
import json, os, re, shutil, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'galactic')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/galactic-src'

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
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, 'themes', 'galactic'))
    for f in SITE_FILES:
        shutil.copy(os.path.join(ROOT, f), os.path.join(OUT, f))
    for d in SITE_DIRS:
        shutil.copytree(os.path.join(ROOT, d), os.path.join(OUT, d))

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

    # แยกพื้นที่เก็บข้อมูล + ชื่อเกม
    for f in ['index.html', 'host.html', 'admin.html', 'print.html']:
        p = os.path.join(OUT, f)
        s = open(p, encoding='utf-8').read()
        s = s.replace('<html lang="th">', '<html lang="th" data-ns="gx.">', 1)
        s = s.replace('Character Bingo · Digital Media Open House', 'Galactic Bingo · Digital Media Open House')
        s = s.replace('Character Bingo', 'Galactic Bingo')
        open(p, 'w', encoding='utf-8').write(s)
    p = os.path.join(OUT, 'sw.js')
    s = open(p).read()
    s, n = re.subn(r"var PREFIX = 'cb-';", "var PREFIX = 'gx-';", s)
    assert n == 1
    open(p, 'w').write(s)
    p = os.path.join(OUT, 'manifest.webmanifest')
    m = json.load(open(p))
    m['name'], m['short_name'] = 'Galactic Bingo', 'Galactic'
    json.dump(m, open(p, 'w'), ensure_ascii=False, indent=2)
    print('built', OUT, len(chars), 'stickers')


if __name__ == '__main__':
    main()
