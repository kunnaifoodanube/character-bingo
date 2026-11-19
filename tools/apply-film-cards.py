#!/usr/bin/env python3
"""เปลี่ยนสื่อหลักบนจอพิธีกรของชุด Film & Animation เป็นการ์ดภาพสเก็ตดินสอของอาจารย์ (32 ภาพ)
รันหลัง tools/build-film-theme.py และ tools/apply-film-posters.py:
    python3 tools/build-film-theme.py && python3 tools/apply-film-posters.py && python3 tools/apply-film-cards.py
- ไฟล์ภาพอยู่ที่ themes/film-animation/<รหัสคำ>.webp (1920×1080 ความละเอียดเต็ม ไม่ผ่าน admin.html จึงไม่ถูกย่อเหลือ 360 px)
- ต้นฉบับ PNG จาก Canva เก็บไว้ใน Google Drive โฟลเดอร์ "Bingo Game"
- โปสเตอร์เดิม (IMDb / YouTube) ย้ายไปเป็นลิงก์อ้างอิงในหมายเหตุเครดิต
- ภาพสำรองจาก Wikimedia Commons คงไว้ ใช้เมื่อโหลดการ์ดไม่ได้
- ชื่ออังกฤษ + คำแปลไทยยังแสดงจาก name / th เหมือนเดิม (ไม่ได้อยู่ในภาพการ์ด)"""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..')
theme_p = os.path.join(root, 'themes', 'film-animation.json')
theme = json.load(open(theme_p, encoding='utf-8'))
REPO = 'https://github.com/kunnaifoodanube/character-bingo/blob/main/'
AUTHOR = 'ผศ.เปรมวดี วินิจฉัยกุล (ออกแบบใน Canva)'
LIC = 'ผลงานของผู้สอน · ใช้ประกอบการเรียนการสอน'
CHECKED = '2026-11-19 (ตรวจภาพตรงกับคำครบ 32 ภาพ)'

for c in theme['characters']:
    rel = 'themes/film-animation/' + c['id'] + '.webp'
    if not os.path.exists(os.path.join(root, rel)):
        raise SystemExit('ไม่พบไฟล์ ' + rel)
    old = c.get('credit', {})
    if old.get('status') != 'ok' or old.get('author') != AUTHOR:
        ref = 'สื่ออ้างอิงเดิม: ' + old.get('title', '') + ' — ' + old.get('author', '') + (' · ' + old.get('sourceUrl', '') if old.get('sourceUrl') else '')
    else:
        ref = old.get('note', '')
    c['media'] = {'type': 'image', 'src': rel}
    c['credit'] = {
        'title': c['name'] + ' — การ์ดภาพประกอบสำหรับจออาจารย์ (สเก็ตดินสอ)',
        'author': AUTHOR,
        'sourceUrl': REPO + rel,
        'license': LIC,
        'licenseUrl': '',
        'status': 'ok',
        'file': rel,
        'fileName': c['id'] + '.webp',
        'note': ref,
        'checked': CHECKED,
    }

theme['description'] = ('บัตรผู้เล่นแสดงคำภาษาอังกฤษ 16 คำจาก 32 คำ (ประเภทภาพยนตร์ 15 · รูปแบบงาน 6 · เทคนิคแอนิเมชัน 11) '
                        'จอพิธีกรแสดงการ์ดภาพสเก็ตดินสอประกอบคำ พร้อมคำแปลไทย')
theme['creditsNote'] = ('จอพิธีกรแสดงการ์ดภาพประกอบสเก็ตดินสอ 32 ภาพ ออกแบบโดย ผศ.เปรมวดี วินิจฉัยกุล ใน Canva '
                        'ใช้ประกอบการเรียนการสอน · โปสเตอร์ภาพยนตร์ที่เคยใช้ยังอ้างอิงไว้ในหมายเหตุเครดิตของแต่ละคำ · '
                        'ถ้าโหลดการ์ดไม่ได้ จะแสดงภาพสำรองจาก Wikimedia Commons แทน')
theme['updatedAt'] = '2026-11-19T06:00:00Z'
json.dump(theme, open(theme_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(theme_p, 'a', encoding='utf-8').write('\n')
print('อัปเดต', len(theme['characters']), 'คำ')
