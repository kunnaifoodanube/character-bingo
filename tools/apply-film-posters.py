#!/usr/bin/env python3
"""เปลี่ยนสื่อหลักของชุด Film & Animation เป็นภาพนิ่ง (โปสเตอร์หนัง / ภาพปกคลิป) ตาม tools/film-posters.json
รันหลัง tools/build-film-theme.py:  python3 tools/build-film-theme.py && python3 tools/apply-film-posters.py
- สื่อหลักเดิม (คลิป YouTube / คลิป Commons) ย้ายไปเก็บเป็นลิงก์อ้างอิงในเครดิต (หมายเหตุ)
- ภาพสำรองจาก Wikimedia Commons คงไว้ ใช้เมื่อโหลดโปสเตอร์ไม่ได้"""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
theme_p = os.path.join(here, '..', 'themes', 'film-animation.json')
theme = json.load(open(theme_p, encoding='utf-8'))
P = json.load(open(os.path.join(here, 'film-posters.json'), encoding='utf-8'))
LIC = 'ลิขสิทธิ์ของเจ้าของผลงาน · ใช้ประกอบการเรียนการสอน'

for c in theme['characters']:
    p = P[c['id']]
    old_media, old_credit = c['media'], c['credit']
    if 'imdb' in p:
        src = 'https://m.media-amazon.com/images/M/' + p['img'] + '._V1_SY1200_.jpg'
        source, kind = 'https://www.imdb.com/title/' + p['imdb'] + '/', 'โปสเตอร์จาก IMDb'
    else:
        src = 'https://i.ytimg.com/vi/' + p['yt'] + '/maxresdefault.jpg'
        source, kind = 'https://www.youtube.com/watch?v=' + p['yt'], 'ภาพปกคลิปจากช่อง YouTube ของเจ้าของ'
    # ภาพสำรอง: ถ้ายังไม่มี (เช่นคำที่สื่อหลักเดิมเป็นคลิป Commons) ใช้สื่อ Commons เดิม
    if 'fallback' not in c:
        c['fallback'] = old_media
        c['fallbackCredit'] = {k: old_credit[k] for k in ('title', 'author', 'sourceUrl', 'license', 'licenseUrl')}
    clip = old_credit.get('sourceUrl', '')
    c['media'] = {'type': 'image', 'src': src}
    c['credit'] = {
        'title': p['title'], 'author': p['owner'], 'sourceUrl': source,
        'license': LIC, 'licenseUrl': '', 'status': 'poster', 'file': src, 'fileName': kind,
        'note': kind + ' · ไม่ได้คัดลอกไฟล์มาเก็บในเว็บไซต์ · คลิปตัวอย่างที่เคยใช้: ' + clip,
        'checked': '2026-11-19 (เปิดภาพตรวจแล้ว)'
    }

theme['updatedAt'] = '2026-11-19T03:00:00Z'
theme['creditsNote'] = ('จอพิธีกรแสดงโปสเตอร์ภาพยนตร์/แอนิเมชัน 26 ภาพ (จาก IMDb) และภาพจากคลิปของช่องเจ้าของผลงาน 6 ภาพ (คำที่เป็นเทคนิค) '
                        'ลิขสิทธิ์เป็นของเจ้าของผลงานแต่ละราย ใส่เครดิตทุกภาพ ใช้ประกอบการเรียนการสอน ไม่ได้คัดลอกไฟล์มาเก็บในเว็บไซต์นี้ · '
                        'ถ้าโหลดภาพไม่ได้ (ไม่มีอินเทอร์เน็ต) จะแสดงภาพสำรองจาก Wikimedia Commons แทน · ไม่มีภาพที่สร้างด้วย AI')
assert len(theme['characters']) == 32
json.dump(theme, open(theme_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('posters applied:', sum(1 for c in theme['characters'] if c['credit']['status'] == 'poster'))
