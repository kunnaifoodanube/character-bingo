#!/usr/bin/env python3
"""สร้าง themes/film-animation.json จากรายการสื่อที่ตรวจสิทธิ์แล้ว (Wikimedia Commons API, 18 พ.ย. 2026)
ไม่มีการดาวน์โหลดไฟล์ใด ๆ มาเก็บใน repo — เกมแสดงสื่อจาก upload.wikimedia.org โดยตรง"""
import json, os, urllib.parse

C = 'https://upload.wikimedia.org/wikipedia/commons/'
PDM = 'https://creativecommons.org/publicdomain/mark/1.0/'
NOTE_US_OLD = 'เผยแพร่ครั้งแรกในสหรัฐฯ ก่อนปี 1931 จึงเป็นสาธารณสมบัติในสหรัฐฯ และพ้นอายุคุ้มครอง 50 ปีตาม พ.ร.บ.ลิขสิทธิ์ไทยแล้ว'
NOTE_OLD = 'งานเก่ากว่า 50 ปี พ้นอายุคุ้มครองตาม พ.ร.บ.ลิขสิทธิ์ไทย และ Commons ระบุเป็นสาธารณสมบัติ'
NOTE_CC = 'ใช้ได้ตามสัญญาอนุญาต Creative Commons โดยต้องระบุชื่อผู้สร้างและลิงก์สัญญาอนุญาต (แสดงในหน้าเครดิตแล้ว)'
NOTE_SA = NOTE_CC + ' · หากดัดแปลงต้องเผยแพร่ด้วยสัญญาอนุญาตเดียวกัน (เกมนี้แสดงไฟล์ต้นฉบับโดยไม่ดัดแปลง)'
LIC = {
    'Public domain': PDM, 'CC0': 'https://creativecommons.org/publicdomain/zero/1.0/',
    'CC BY 2.0': 'https://creativecommons.org/licenses/by/2.0/', 'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/',
    'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/', 'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
}

def enc(name): return urllib.parse.quote(name.replace(' ', '_'), safe="_-.")
def orig(h, name): return C + h + '/' + enc(name)
def thumb(h, name, w=960): n = enc(name); return C + 'thumb/' + h + '/' + n + '/' + str(w) + 'px-' + n
def vthumb(h, name, w=960): n = enc(name); return C + 'thumb/' + h + '/' + n + '/' + str(w) + 'px--' + n + '.jpg'
def webm(h, name, q='480p'): n = enc(name); return C + 'transcoded/' + h + '/' + n + '/' + n + '.' + q + '.vp9.webm'
def page(name): return 'https://commons.wikimedia.org/wiki/File:' + enc(name)

# (id, group, English, Thai, file, hashdir, kind, extra)
#  kind: img (thumb 960) | orig (ไฟล์ต้นฉบับเล็กกว่า 960) | video
T = [
 ('action','genre','Action','แอ็กชัน / ฉากไล่ล่า','Buster Keaton on the cow-catcher in The General.jpg','f/fb','img',
   dict(title='The General (1926) — Buster Keaton บนหัวรถจักรระหว่างฉากไล่ล่า', author='Buster Keaton Productions', lic='Public domain', note=NOTE_US_OLD)),
 ('comedy','genre','Comedy','ตลก','Chaplin The Kid edit.jpg','e/ea','img',
   dict(title='The Kid (1921) — Charlie Chaplin และ Jackie Coogan', author='ไม่ทราบช่างภาพ (Charles Chaplin Productions)', lic='Public domain', note=NOTE_US_OLD)),
 ('horror','genre','Horror','สยองขวัญ','Nosferatu (1922) - Count Orlok Standing In A Wooden Doorway.png','0/0a','img',
   dict(title='Nosferatu (1922) — Count Orlok ยืนที่ประตู', author='F. W. Murnau / Henrik Galeen', lic='Public domain', note=NOTE_OLD + ' (ผู้กำกับเสียชีวิต 1931, ผู้เขียนบทเสียชีวิต 1949)')),
 ('romance','genre','Romance','โรแมนติก','May Irwin Kiss.webm','1/1e','video',
   dict(title='The Kiss / May Irwin Kiss (1896) — หนังฉากจูบเรื่องแรก ๆ ของโลก', author='William Heise (Edison Manufacturing Co.)', lic='Public domain', note=NOTE_US_OLD, poster=vthumb('1/1e','May Irwin Kiss.webm',500))),
 ('sci-fi','genre','Sci-Fi','วิทยาศาสตร์จินตนาการ','Le voyage dans la lune drawing.jpg','c/c8','orig',
   dict(title='A Trip to the Moon / Le Voyage dans la Lune (1902) — ภาพวาดจรวดชนดวงจันทร์', author='Georges Méliès', lic='Public domain', note=NOTE_OLD + ' (ผู้สร้างเสียชีวิต 1938)')),
 ('fantasy','genre','Fantasy','แฟนตาซี','Alice in Wonderland 1903 film tea party.jpg','0/07','orig',
   dict(title='Alice in Wonderland (1903) — ฉากงานเลี้ยงน้ำชา', author='Cecil M. Hepworth & Percy Stow', lic='Public domain', note=NOTE_OLD)),
 ('adventure','genre','Adventure','ผจญภัย','The Lost World (1925) 2.jpg','4/46','img',
   dict(title='The Lost World (1925) — นักสำรวจกับไดโนเสาร์ในดินแดนลึกลับ', author='First National Pictures (ภาพจากภาพยนตร์)', lic='Public domain', note=NOTE_US_OLD)),
 ('musical','genre','Musical','ภาพยนตร์เพลง','Publicity still for The Broadway Melody (1929) 03.jpg','5/5e','img',
   dict(title='The Broadway Melody (1929) — ภาพประชาสัมพันธ์ ภาพยนตร์เพลงเรื่องแรกที่ได้ออสการ์', author='Employee(s) of MGM', lic='Public domain', note=NOTE_US_OLD)),
 ('sports','genre','Sports','ภาพยนตร์กีฬา','Publicity still for Battling Butler (1926) 05.jpg','d/d8','img',
   dict(title='Battling Butler (1926) — ฉากชกมวย', author='Employee(s) of MGM', lic='Public domain', note=NOTE_US_OLD)),
 ('war','genre','War','ภาพยนตร์สงคราม','Lew Ayres and Louis Wolheim in All Quiet on the Western Front.jpg','5/50','img',
   dict(title='All Quiet on the Western Front (1930) — ทหารในสนามเพลาะ', author='ไม่ทราบช่างภาพ (Universal Pictures)', lic='Public domain', note='ภาพยนตร์ปี 1930 เป็นสาธารณสมบัติในสหรัฐฯ ตั้งแต่ 1 ม.ค. 2026 และพ้นอายุคุ้มครอง 50 ปีตาม พ.ร.บ.ลิขสิทธิ์ไทยแล้ว')),
 ('disaster','genre','Disaster','ภัยพิบัติ','Noah\'s Ark (1928) still 2.JPG','0/07','img',
   dict(title="Noah's Ark (1928) — ฉากเมืองพังทลายจากน้ำท่วมโลก", author='ไม่ทราบช่างภาพ (Warner Bros.)', lic='Public domain', note=NOTE_US_OLD)),
 ('western','genre','Western','คาวบอยตะวันตก','Great train robbery Barnes.jpg','e/e0','orig',
   dict(title='The Great Train Robbery (1903) — คาวบอยยิงปืนเข้าหากล้อง', author='Edwin S. Porter (Edison)', lic='Public domain', note=NOTE_US_OLD)),
 ('crime','genre','Crime','อาชญากรรม / การปล้น','Underworld (film) 1927. Josef von Sternberg, director. George Bancroft.jpg','d/d8','orig',
   dict(title='Underworld (1927) — หนังแก๊งสเตอร์ยุคแรก ผู้กำกับ Josef von Sternberg', author='Paramount Pictures', lic='Public domain', note=NOTE_US_OLD)),
 ('zombie','genre','Zombie','ซอมบี้','White Zombie 1932.jpg','f/f4','img',
   dict(title='White Zombie (1932) — ภาพยนตร์ซอมบี้เรื่องยาวเรื่องแรก', author='United Artists', lic='Public domain', note='Commons ระบุเป็นสาธารณสมบัติในสหรัฐฯ (ไม่ได้ต่ออายุลิขสิทธิ์) และพ้นอายุคุ้มครอง 50 ปีตาม พ.ร.บ.ลิขสิทธิ์ไทยแล้ว')),
 ('spy','genre','Spy','สายลับ','Minox B Camera - Flickr - The Central Intelligence Agency.jpg','c/c9','img',
   dict(title='Minox B — กล้องจิ๋วของสายลับ (ภาพจากพิพิธภัณฑ์ CIA)', author='The Central Intelligence Agency', lic='Public domain', note='ผลงานของหน่วยงานรัฐบาลกลางสหรัฐฯ เป็นสาธารณสมบัติ · ไม่ใช่ภาพจากภาพยนตร์ เพราะไม่พบภาพนิ่งหนังสายลับที่ยืนยันสิทธิ์ได้และไม่มีตัวอักษรบนภาพ')),
 ('documentary','format','Documentary','สารคดี','Nanook Harpooner 1920.jpg','7/78','orig',
   dict(title='Nanook of the North (1922) — สารคดีเรื่องยาวยุคบุกเบิก', author='Robert J. Flaherty', lic='Public domain', note=NOTE_US_OLD)),
 ('music-video','format','Music Video','มิวสิกวิดีโอ','Rebel Love Song 12.jpg','7/7a','img',
   dict(title='เบื้องหลังการถ่ายทำมิวสิกวิดีโอ "Rebel Love Song" (2011)', author='Robert Bejil Photography', lic='CC BY 2.0', note=NOTE_CC)),
 ('silent-film','format','Silent Film','ภาพยนตร์เงียบ','The Kid (1921).webm','e/ea','video',
   dict(title='The Kid (1921) — Charlie Chaplin ในบท The Tramp เดินเข้าตรอก ก่อนพบทารก (ภาพยนตร์เงียบเรื่องยาวเรื่องแรกของ Chaplin)', author='Charlie Chaplin', lic='Public domain', note=NOTE_US_OLD + ' · เล่นช่วงนาทีที่ 7:45–9:45 ของไฟล์วิดีโอบน Commons (ตรวจสิทธิ์จาก Commons API 19 พ.ย. 2026)',
        checked='2026-11-19 (Wikimedia Commons API)', start=465, end=585, poster=C + 'thumb/e/ea/The_Kid_%281921%29.webm/960px-seek%3D470-The_Kid_%281921%29.webm.jpg')),
 ('found-footage','format','Found Footage','เรื่องเล่าผ่านภาพบันทึกเหตุการณ์','An exemple of a found footage film from " Taped Up Families (Horror, Found Footage, 2024) ".png','5/57','img',
   dict(title='Taped Up Families (2024) — ภาพแบบกล้องวิดีโอบันทึกเหตุการณ์ มีวันเวลาบนจอ', author='Trash Arts Productions', lic='CC BY 3.0', note=NOTE_CC + ' (เจ้าของเผยแพร่บน YouTube ด้วยสัญญาอนุญาต CC BY)')),
 ('time-lapse','format','Time-Lapse','ภาพเร่งเวลา','Cloud time lapse 1280.ogv','5/53','video',
   dict(title='Cloud time lapse — เมฆเคลื่อนแบบเร่งเวลา', author='Error406', lic='Public domain', note='ผู้สร้างประกาศสละสิทธิ์ให้เป็นสาธารณสมบัติ')),
 ('slow-motion','format','Slow Motion','ภาพเคลื่อนไหวช้า','Ultra slow-motion video of glass tea cup smashed on concrete floor.webm','6/6c','video',
   dict(title='Ultra slow-motion — ถ้วยแก้วตกแตกบนพื้นแบบช้ามาก', author='Pittigrilli', lic='CC BY-SA 4.0', note=NOTE_SA)),
 ('2d-animation','animation','2D Animation','แอนิเมชันสองมิติ','Gertie the Dinosaur and a boulder.jpg','5/5e','img',
   dict(title='Gertie the Dinosaur (1914) — ภาพวาดต้นฉบับแอนิเมชัน', author='Winsor McCay', lic='Public domain', note=NOTE_US_OLD)),
 ('3d-animation','animation','3D Animation','แอนิเมชันสามมิติ','Big.Buck.Bunny.-.Frank.Rinky.Gimera.png','2/2b','img',
   dict(title='Big Buck Bunny (2008) — แอนิเมชัน 3 มิติโอเพนซอร์สจาก Blender', author='Blender Foundation (www.bigbuckbunny.org)', lic='CC BY 3.0', note=NOTE_CC)),
 ('stop-motion','animation','Stop Motion','แอนิเมชันถ่ายทีละเฟรม','Cyclops Park Stop Motion Animation.webm','c/c7','video',
   dict(title='Cyclops Park — Stop Motion Animation (2019)', author='Nalena', lic='CC BY 3.0', note=NOTE_CC + ' (เผยแพร่บน Vimeo ด้วย CC BY)')),
 ('claymation','animation','Claymation','แอนิเมชันดินน้ำมัน','Animacion-con-plastilina-y-clay-animation-pelicula-Kuzmich-153.jpg','c/cf','img',
   dict(title='Kuzmich — ฉากจากแอนิเมชันดินน้ำมัน (2009)', author='Max Sviridov (plastili.com)', lic='Public domain', note='ผู้สร้างประกาศให้เป็นสาธารณสมบัติเอง (Own work)')),
 ('cutout-animation','animation','Cutout Animation','แอนิเมชันชิ้นส่วน','Cutout animation example s.png','0/0b','orig',
   dict(title='ตัวอย่างชิ้นส่วนตัวละครสำหรับ Cutout Animation', author='Flash boy (Arabic Wikipedia)', lic='Public domain', note='ผู้สร้างประกาศให้เป็นสาธารณสมบัติเอง')),
 ('pixel-animation','animation','Pixel Animation','แอนิเมชันพิกเซล','Pixel-Art TAIЯAUQITИA.gif','3/32','orig',
   dict(title='Pixel-Art TAIЯAUQITИA — ภาพเคลื่อนไหวพิกเซลอาร์ต (GIF)', author='Numerobis (pixelplaza.de)', lic='CC BY-SA 3.0', note=NOTE_SA, pixel=True)),
 ('rotoscoping','animation','Rotoscoping','แอนิเมชันวาดตามภาพจริง','US patent 1242674 figure 3.png','7/71','img',
   dict(title='สิทธิบัตรเครื่อง Rotoscope ของ Max Fleischer (US 1,242,674, ยื่นปี 1915)', author='Max Fleischer (ภาพประกอบสิทธิบัตร)', lic='Public domain', note='ภาพประกอบสิทธิบัตรสหรัฐฯ ปี 1917 เป็นสาธารณสมบัติ · ไม่พบคลิปโรโตสโคปที่ยืนยันสิทธิ์ได้ จึงใช้ภาพนิ่ง')),
 ('motion-capture','animation','Motion Capture','บันทึกการเคลื่อนไหว','2010 Motion Capture Suit.jpg','9/94','img',
   dict(title='ชุดบันทึกการเคลื่อนไหว (Motion Capture Suit)', author='Mbrickn', lic='CC0', note='ผู้สร้างสละสิทธิ์ทั้งหมด (CC0)')),
 ('motion-graphics','animation','Motion Graphics','กราฟิกเคลื่อนไหว','Abstract Motion graphics.webm','7/7a','video',
   dict(title='Abstract Motion (2012) — กราฟิกเคลื่อนไหว', author='I-Cheng Lee', lic='CC BY 3.0', note=NOTE_CC + ' (เผยแพร่บน Vimeo ด้วย CC BY)')),
 ('flipbook','animation','Flipbook','ภาพวาดพลิกหน้า','Flip Book - Messi Example.webm','a/ab','video',
   dict(title='Flip Book example — สมุดภาพพลิกหน้าให้ภาพเคลื่อนไหว', author='harun uğur', lic='CC BY 3.0', note=NOTE_CC + ' (เผยแพร่บน YouTube ด้วย CC BY)', poster=vthumb('a/ab','Flip Book - Messi Example.webm',330))),
 ('sand-animation','animation','Sand Animation','แอนิเมชันทราย','Кот и петух – Украинская сказка Сказки на песке -3.webm','a/a3','video',
   dict(title='Кот и петух (แมวกับไก่) — นิทานยูเครน · Сказки на песке #3 (2019)', author='Телеканал КРТ (KRT TV channel)', lic='CC BY 3.0', note=NOTE_CC + ' (เผยแพร่บน YouTube ด้วย CC BY) · เกมเล่นช่วงวินาที 45–105 (ภาพวาดทรายแมวกับไก่) วนซ้ำ ไม่ตัดต่อไฟล์', start=45, end=105,
        poster=C + 'thumb/a/a3/' + enc('Кот и петух – Украинская сказка Сказки на песке -3.webm') + '/960px-seek%3D60-' + enc('Кот и петух – Украинская сказка Сказки на песке -3.webm') + '.jpg')),
]

def build():
    chars = []
    for (cid, grp, en, th, fname, h, kind, x) in T:
        if kind == 'video':
            src = webm(h, fname); poster = x.get('poster') or vthumb(h, fname)
            media = {'type': 'video', 'src': src, 'poster': poster}
            if x.get('start'): media['start'] = x['start']
            if x.get('end'): media['end'] = x['end']
        elif kind == 'still':
            src = x['src']; media = {'type': 'image', 'src': src}
        else:
            src = thumb(h, fname) if kind == 'img' else orig(h, fname)
            media = {'type': 'image', 'src': src}
            if x.get('pixel'): media['pixel'] = True
        chars.append({
            'id': cid, 'name': en, 'th': th, 'group': grp, 'media': media,
            'credit': {
                'title': x['title'], 'author': x['author'], 'sourceUrl': page(fname),
                'license': x['lic'], 'licenseUrl': LIC[x['lic']], 'status': 'ok',
                'file': src, 'fileName': fname, 'note': x['note'], 'checked': x.get('checked', '2026-11-18 (Wikimedia Commons API)')
            }
        })
    # ---- ชั้นที่ 2: คลิป YouTube จากช่องทางการ (ภาพ Commons ข้างบนเก็บเป็นภาพสำรองเมื่อเล่นคลิปไม่ได้) ----
    here0 = os.path.dirname(os.path.abspath(__file__))
    yt = json.load(open(os.path.join(here0, 'film-youtube.json'), encoding='utf-8'))
    for c in chars:
        y = yt[c['id']]
        if y.get('commons'):  # ใช้สื่อ Commons (สิทธิ์ยืนยันแล้ว) เป็นสื่อหลัก ไม่ใช้ YouTube
            continue
        c['fallback'] = c['media']
        oc = c['credit']
        c['fallbackCredit'] = {k: oc[k] for k in ('title', 'author', 'sourceUrl', 'license', 'licenseUrl')}
        url = 'https://www.youtube.com/watch?v=' + y['id']
        c['media'] = {'type': 'youtube', 'src': url}
        if y.get('start'): c['media']['start'] = y['start']
        if y.get('end'): c['media']['end'] = y['end']
        note = 'ฝังด้วยเครื่องเล่น YouTube จากช่องที่เผยแพร่ (เจ้าของเปิดให้ฝังได้) ไม่ได้คัดลอกไฟล์มาเก็บ · ใช้ประกอบการเรียนการสอน ลิขสิทธิ์เป็นของเจ้าของผลงาน'
        if y.get('note'): note = y['note'] + ' · ' + note
        c['credit'] = {
            'title': y['film'] + ' — ' + y['what'], 'author': y['channel'] + ' (ช่อง YouTube)', 'sourceUrl': url,
            'license': 'ลิขสิทธิ์ของเจ้าของผลงาน · ฝังผ่าน YouTube', 'licenseUrl': 'https://www.youtube.com/t/terms',
            'status': 'embed', 'file': url, 'fileName': 'YouTube ' + y['id'], 'note': note, 'checked': '2026-11-19 (YouTube IFrame API: embed OK)'
        }
    theme = {
        'format': 'character-bingo-theme@1', 'id': 'film-animation', 'name': 'Film & Animation Bingo',
        'category': 'Film & Animation', 'display': 'text', 'updatedAt': '2026-11-19T00:00:00Z',
        'description': 'บัตรผู้เล่นแสดงคำภาษาอังกฤษ 16 คำจาก 32 คำ (ประเภทภาพยนตร์ 15 · รูปแบบงาน 6 · เทคนิคแอนิเมชัน 11) จอพิธีกรแสดงภาพ/คลิปจริงพร้อมคำแปลไทย',
        'creditsNote': 'คลิป 31 รายการเป็นตัวอย่างภาพยนตร์/คลิปจริง ฝังด้วยเครื่องเล่น YouTube จากช่องทางการของสตูดิโอ ผู้จัดจำหน่าย หรือผู้สร้าง (เจ้าของเปิดให้ฝังได้) ไม่ได้คัดลอกไฟล์มาเก็บในเว็บไซต์นี้ ใช้ประกอบการเรียนการสอน ลิขสิทธิ์เป็นของเจ้าของผลงานแต่ละราย · เมื่อไม่มีอินเทอร์เน็ตหรือคลิปเล่นไม่ได้ จะแสดงภาพสำรองจาก Wikimedia Commons (สาธารณสมบัติ/Creative Commons) แทน · ไม่มีภาพหรือคลิปที่สร้างด้วย AI · Silent Film ใช้คลิป The Kid (1921) ซึ่งเป็นสาธารณสมบัติจาก Wikimedia Commons โดยตรง',
        'characters': chars,
    }
    assert len(chars) == 32 and len({c['id'] for c in chars}) == 32
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, '..', 'themes', 'film-animation.json')
    with open(out, 'w', encoding='utf-8') as f: json.dump(theme, f, ensure_ascii=False, indent=1)
    print('wrote', out, len(chars), 'terms')

if __name__ == '__main__': build()
