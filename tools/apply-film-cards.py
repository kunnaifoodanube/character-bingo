#!/usr/bin/env python3
"""ตั้งสื่อบนจอพิธีกรของชุด Film & Animation เป็นการ์ดภาพของอาจารย์ (32 ภาพ)
    python3 tools/apply-film-cards.py
- ไฟล์ภาพอยู่ที่ themes/film-animation/<รหัสคำ>.webp (1920×1080)
- ต้นฉบับ PNG จาก Canva เก็บไว้ใน Google Drive โฟลเดอร์ "Bingo Game"
- ชื่ออังกฤษ + คำแปลไทยแสดงจาก name / th (ไม่ได้อยู่ในภาพการ์ด)"""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.join(here, '..')
theme_p = os.path.join(root, 'themes', 'film-animation.json')
theme = json.load(open(theme_p, encoding='utf-8'))

for c in theme['characters']:
    rel = 'themes/film-animation/' + c['id'] + '.webp'
    if not os.path.exists(os.path.join(root, rel)):
        raise SystemExit('ไม่พบไฟล์ ' + rel)
    c['media'] = {'type': 'image', 'src': rel}
    for k in ('credit', 'fallback', 'fallbackCredit'):
        c.pop(k, None)
theme.pop('creditsNote', None)
json.dump(theme, open(theme_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(theme_p, 'a', encoding='utf-8').write('\n')
print('อัปเดต', len(theme['characters']), 'คำ')
