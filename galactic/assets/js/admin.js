/* หน้าจัดการภาพตัวละคร (Admin) */
(function () {
  'use strict';
  var B = Bingo, esc = B.esc;
  var $ = function (id) { return document.getElementById(id); };
  var MAX_FILE = 20 * 1024 * 1024, MAX_SIDE = 360;
  var OK_TYPES = { 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };
  var cur = null, saveTimer = null, replaceTarget = null, originalFp = null;

  // ---------- รายการชุดภาพ ----------
  function refreshList() {
    return LocalThemes.list().then(function (list) {
      list.sort(function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
      $('themeList').innerHTML = list.length ? list.map(function (t) {
        var v = B.validateTheme(t);
        return '<div class="it' + (cur && cur.id === t.id ? ' active' : '') + '"><div class="grow"><b>' + esc(t.name) + '</b> <span class="small muted">· ' + esc(t.category || '') +
          ' · ' + t.characters.length + ' ตัว · <span class="mono">' + esc(t.id) + '</span></span><br><span class="small ' + (v.ok ? '' : 'muted') + '">' +
          (v.ok ? '✅ พร้อมใช้งาน' : '⚠️ ยังไม่พร้อม: ' + esc(v.errors[0])) + '</span></div><button class="btn secondary" data-open="' + esc(t.id) + '">แก้ไข</button></div>';
      }).join('') : '<p class="muted">ยังไม่มีชุดภาพในเครื่องนี้ — กด “สร้างชุดใหม่” หรือ “คัดลอกชุดจากเว็บไซต์มาแก้”</p>';
    }).catch(function (e) { $('themeList').innerHTML = '<div class="banner err">' + esc(e.message) + '</div>'; });
  }
  $('themeList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-open]'); if (!b) return;
    LocalThemes.get(b.dataset.open).then(openTheme);
  });

  function slugify(s) {
    var a = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
    return a.length >= 3 ? a : 'theme-' + Math.random().toString(36).slice(2, 6);
  }
  function newId(theme) {
    var id;
    do { id = 'c' + Math.random().toString(36).slice(2, 9); } while (theme.characters.some(function (c) { return c.id === id; }));
    return id;
  }

  $('btnNewTheme').addEventListener('click', function () {
    UI.modal({
      title: 'สร้างชุดภาพใหม่',
      html: '<label class="field"><span>ชื่อชุด เช่น Anime Open House 2026</span><input class="input" id="nn" maxlength="60"></label>' +
        '<label class="field"><span>ประเภท</span><input class="input" id="nc" list="cats" value="Cartoon"></label>' +
        '<label class="row small"><input type="checkbox" id="nt"> โหมดคำศัพท์ (บัตรผู้เล่นเป็นคำภาษาอังกฤษ จอพิธีกรแสดงภาพ/คลิป)</label>',
      buttons: [{ label: 'ยกเลิก', value: null, cls: 'ghost' }, {
        label: 'สร้าง', getValue: function (el) {
          var n = el.querySelector('#nn').value.trim();
          if (!n) { UI.toast('กรุณาตั้งชื่อชุด'); return undefined; }
          return { name: n, category: el.querySelector('#nc').value.trim(), text: el.querySelector('#nt').checked };
        }
      }],
      onOpen: function (el) { setTimeout(function () { el.querySelector('#nn').focus(); }, 50); }
    }).then(function (v) {
      if (!v) return;
      LocalThemes.list().then(function (list) {
        var id = slugify(v.name);
        while (list.some(function (t) { return t.id === id; })) id = slugify(v.name) + '-' + Math.random().toString(36).slice(2, 4);
        var t = { format: 'character-bingo-theme@1', id: id, name: v.name, category: v.category, updatedAt: new Date().toISOString(), characters: [] };
        if (v.text) t.display = 'text';
        return LocalThemes.put(t).then(function () { openTheme(t); refreshList(); });
      });
    });
  });

  $('importFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    f.text().then(function (txt) {
      var t;
      try { t = JSON.parse(txt); } catch (e) { throw new Error('ไฟล์ไม่ใช่ JSON ที่ถูกต้อง'); }
      if (!t || !Array.isArray(t.characters)) throw new Error('ไฟล์นี้ไม่ใช่ไฟล์ชุดภาพ Character Bingo');
      t.format = 'character-bingo-theme@1';
      return LocalThemes.get(t.id).then(function (exist) {
        if (!exist) return t;
        return UI.confirm('มีชุดรหัส “' + t.id + '” อยู่แล้ว', '<p>ต้องการเขียนทับชุด “' + esc(exist.name) + '” ในเครื่องนี้หรือไม่?</p>', 'เขียนทับ', 'danger')
          .then(function (ok) { return ok ? t : null; });
      });
    }).then(function (t) {
      if (!t) return;
      return LocalThemes.put(t).then(function () { openTheme(t); refreshList(); UI.toast('นำเข้า “' + t.name + '” แล้ว'); });
    }).catch(function (e) { UI.modal({ title: 'นำเข้าไม่สำเร็จ', html: '<p>' + esc(e.message) + '</p>' }); });
  });

  $('btnCopyPub').addEventListener('click', function () {
    B.loadThemeIndex().then(function (idx) {
      var list = idx.themes || [];
      if (!list.length) throw new Error('ยังไม่มีชุดภาพบนเว็บไซต์');
      return UI.modal({
        title: 'คัดลอกชุดจากเว็บไซต์',
        html: '<p class="small muted">ชุดที่คัดลอกจะใช้รหัสเดิม เมื่อส่งออกแล้วอัปโหลดจะเป็นการ “อัปเดต” ชุดเดิมบนเว็บ</p><div class="list">' +
          list.map(function (t) { return '<button class="btn secondary" data-v="' + esc(t.id) + '">' + esc(t.name) + '</button>'; }).join('') + '</div>',
        buttons: [{ label: 'ยกเลิก', value: null, cls: 'ghost' }],
        onOpen: function (el) {
          el.querySelector('.list').addEventListener('click', function (e) {
            var b = e.target.closest('[data-v]'); if (!b) return;
            el.remove();
            B.loadTheme(idx, b.dataset.v).then(function (t) {
              return LocalThemes.get(t.id).then(function (exist) {
                if (exist) return UI.confirm('มีฉบับร่างของชุดนี้อยู่แล้ว', '<p>เขียนทับฉบับร่างในเครื่องด้วยฉบับบนเว็บ?</p>', 'เขียนทับ', 'danger').then(function (ok) { return ok ? t : null; });
                return t;
              });
            }).then(function (t) {
              if (!t) return;
              t.updatedAt = new Date().toISOString();
              return LocalThemes.put(t).then(function () { openTheme(t); refreshList(); UI.toast('คัดลอกแล้ว'); });
            }).catch(function (err) { UI.toast(err.message); });
          });
        }
      });
    }).catch(function (e) { UI.modal({ title: 'ทำไม่สำเร็จ', html: '<p>' + esc(e.message) + '</p>' }); });
  });

  // ---------- Editor ----------
  function openTheme(t) {
    cur = t; originalFp = B.fingerprint(t);
    $('editor').classList.remove('hidden');
    $('thName').value = t.name || ''; $('thCat').value = t.category || ''; $('thId').value = t.id; $('thText').checked = B.isText(t);
    renderEditor(); refreshList();
    $('editor').scrollIntoView({ behavior: 'smooth' });
  }
  function scheduleSave() {
    if (!cur) return;
    $('saveState').textContent = 'กำลังบันทึก…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      cur.updatedAt = new Date().toISOString();
      LocalThemes.put(cur).then(function () { $('saveState').textContent = '✓ บันทึกในเครื่องแล้ว'; refreshList(); })
        .catch(function (e) { $('saveState').textContent = '✗ บันทึกไม่สำเร็จ: ' + e.message; });
    }, 300);
  }

  $('thName').addEventListener('input', function () { cur.name = this.value.trim(); $('edTitle').textContent = cur.name; scheduleSave(); renderValidation(); });
  $('thCat').addEventListener('input', function () { cur.category = this.value.trim(); scheduleSave(); });
  $('thText').addEventListener('change', function () {
    if (this.checked) cur.display = 'text'; else delete cur.display;
    scheduleSave(); renderEditor();
  });
  $('thId').addEventListener('change', function () {
    var nv = this.value.trim().toLowerCase(), self = this;
    if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(nv)) { UI.toast('ใช้ได้เฉพาะ a-z, 0-9 และ -'); self.value = cur.id; return; }
    if (nv === cur.id) return;
    UI.confirm('เปลี่ยนรหัสชุด?', '<p>บัตรกระดาษที่พิมพ์ไว้แล้วของชุดนี้จะใช้ไม่ได้ และจะถือเป็นชุดใหม่บนเว็บไซต์</p>', 'เปลี่ยนรหัส', 'danger').then(function (ok) {
      if (!ok) { self.value = cur.id; return; }
      var old = cur.id; cur.id = nv;
      LocalThemes.put(cur).then(function () { return LocalThemes.del(old); }).then(function () { refreshList(); renderEditor(); });
    });
  });

  function renderEditor() {
    $('edTitle').textContent = cur.name;
    $('charCount').textContent = '(' + cur.characters.length + ' ตัว)';
    $('fnTheme').textContent = cur.id + '.json';
    $('btnTryHost').href = 'host.html?t=' + encodeURIComponent(cur.id) + '&src=local';
    var text = B.isText(cur);
    $('textTools').classList.toggle('hidden', !text);
    $('itemsLabel').textContent = text ? 'คำศัพท์' : 'ตัวละคร';
    $('chars').innerHTML = cur.characters.map(function (c, i) {
      if (text) return termCard(c, i);
      var bad = !c.img || !c.name || !String(c.name).trim();
      return '<div class="char' + (bad ? ' bad' : '') + '" data-id="' + esc(c.id) + '"><div class="idx">#' + (i + 1) + (c.bytes ? ' · ' + Math.round(c.bytes / 1024) + ' KB' : '') + '</div>' +
        '<div class="pic">' + (c.img ? '<img alt="" src="' + esc(c.img) + '">' : '<span class="muted">ไม่มีภาพ</span>') + '</div>' +
        '<input value="' + esc(c.name) + '" maxlength="30" data-name aria-label="ชื่อตัวละคร">' +
        '<div class="tools"><button class="btn secondary" data-rep title="เปลี่ยนภาพ">เปลี่ยนภาพ</button><button class="btn danger" data-del>ลบ</button></div></div>';
    }).join('');
    renderValidation();
  }
  function termCard(c, i) {
    var src = B.mediaSrc(c), ok = B.mediaAllowed(c), vid = B.mediaType(c) === 'video';
    var yt = B.mediaType(c) === 'youtube' ? B.youtubeId(src) : '';
    var thumb = yt ? 'https://i.ytimg.com/vi/' + yt + '/mqdefault.jpg' : vid ? ((c.media && c.media.poster) || '') : src;
    var lic = src ? '' : '<span class="lic no">ยังไม่มีสื่อ</span>';
    return '<div class="char' + (!c.name ? ' bad' : '') + '" data-id="' + esc(c.id) + '"><div class="idx">#' + (i + 1) + '</div>' +
      '<div class="pic dark">' + (thumb ? '<img alt="" loading="lazy" src="' + esc(thumb) + '">' : '<span class="muted small">' + (vid ? 'คลิป' : 'ไม่มีภาพ') + '</span>') + (vid ? '<span class="cr-v">คลิป</span>' : '') + (yt ? '<span class="cr-v">YouTube</span>' : '') + '</div>' +
      '<input value="' + esc(c.name) + '" maxlength="40" data-name aria-label="คำภาษาอังกฤษ" placeholder="English">' +
      '<input value="' + esc(c.th || '') + '" maxlength="60" data-th aria-label="คำแปลภาษาไทย" placeholder="คำแปลไทย">' + lic +
      '<div class="tools"><button class="btn secondary" data-det>สื่อ</button><button class="btn secondary" data-rep title="อัปโหลดภาพจากเครื่อง">อัปโหลด</button><button class="btn danger" data-del>ลบ</button></div></div>';
  }
  function findChar(id) { return cur.characters.filter(function (x) { return x.id === id; })[0]; }

  // ---------- แก้สื่อ ----------
  function openDetails(c) {
    var m = c.media || {};
    function f(id, label, val, cls, ph) { return '<label class="field ' + (cls || '') + '"><span>' + label + '</span><input class="input" id="' + id + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"></label>'; }
    UI.modal({
      title: 'สื่อ: ' + c.name, wide: true,
      html: '<div class="fgrid">' +
        '<h4>สื่อบนจอพิธีกร</h4>' +
        '<label class="field"><span>ชนิดสื่อ</span><select class="input" id="dType"><option value="image"' + (B.mediaType(c) === 'image' ? ' selected' : '') + '>ภาพนิ่ง</option><option value="video"' + (B.mediaType(c) === 'video' ? ' selected' : '') + '>คลิปวิดีโอ (เล่นวน ไม่มีเสียง)</option><option value="youtube"' + (B.mediaType(c) === 'youtube' ? ' selected' : '') + '>คลิป YouTube (ฝังจากช่องทางการ)</option></select></label>' +
        f('dPoster', 'ภาพปกคลิป (ใช้เมื่อออฟไลน์)', m.poster, '', 'https://…') +
        f('dSrc', 'ลิงก์ไฟล์ภาพ/คลิป หรือลิงก์ YouTube (https://…) — เว้นว่างถ้าใช้ภาพที่อัปโหลด', m.src, 'full', 'https://www.youtube.com/watch?v=…') +
        f('dStart', 'คลิป: เริ่มที่วินาที', m.start, '', '0') + f('dEnd', 'คลิป: วนกลับที่วินาที', m.end, '', 'เว้นว่าง = ทั้งคลิป') +
        '</div>',
      buttons: [{ label: 'ยกเลิก', value: null, cls: 'ghost' }, { label: 'บันทึก', getValue: function (el) {
        var g = function (id) { return el.querySelector('#' + id).value.trim(); };
        var src = g('dSrc');
        if (src && !/^https:\/\//.test(src)) { UI.toast('ลิงก์สื่อต้องขึ้นต้นด้วย https://'); return undefined; }
        if (g('dType') === 'youtube' && !B.youtubeId(src)) { UI.toast('ลิงก์ YouTube ไม่ถูกต้อง'); return undefined; }
        return { type: B.youtubeId(src) ? 'youtube' : g('dType'), src: src, poster: g('dPoster'), start: g('dStart'), end: g('dEnd') };
      } }]
    }).then(function (v) {
      if (!v) return;
      if (v.src) {
        c.media = { type: v.type, src: v.src };
        if (v.poster) c.media.poster = v.poster;
        if (+v.start) c.media.start = +v.start;
        if (+v.end) c.media.end = +v.end;
        if (m.pixel) c.media.pixel = true;
      } else delete c.media;
      delete c.credit; delete c.fallbackCredit;
      scheduleSave(); renderEditor(); UI.toast('บันทึก “' + c.name + '” แล้ว');
    });
  }
  $('btnAddTerm').addEventListener('click', function () {
    if (!cur) return;
    if (cur.characters.length >= B.MAX_CHARACTERS) { UI.toast('ครบจำนวนสูงสุด ' + B.MAX_CHARACTERS + ' คำแล้ว'); return; }
    var c = { id: newId(cur), name: 'New term', th: '' };
    cur.characters.push(c); scheduleSave(); renderEditor();
    var inp = document.querySelector('.char[data-id="' + c.id + '"] [data-name]'); if (inp) { inp.focus(); inp.select(); }
  });

  function renderValidation() {
    var v = B.validateTheme(cur), html = '';
    var fpNow = B.fingerprint(cur);
    if (v.ok) html += '<div class="banner ok">✅ พร้อมใช้งาน — ' + cur.characters.length + ' ตัว · รหัสชุด ' + fpNow + '</div>';
    else html += '<div class="banner err"><b>ยังเริ่มเกมไม่ได้:</b><ul style="margin:.3rem 0 0">' + v.errors.slice(0, 8).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
      (v.errors.length > 8 ? '<li>…และอีก ' + (v.errors.length - 8) + ' รายการ</li>' : '') + '</ul></div>';
    v.warnings.forEach(function (w) { html += '<div class="banner warn">' + esc(w) + '</div>'; });
    if (fpNow !== originalFp && cur.characters.length) html += '<div class="banner warn">มีการเพิ่ม/ลบตัวละครในรอบแก้ไขนี้ — ถ้าเคยพิมพ์บัตรกระดาษของชุดนี้ไว้ ต้องพิมพ์ใหม่</div>';
    var total = cur.characters.reduce(function (s, c) { return s + (c.img ? c.img.length : 0) + 0; }, 0);
    html += '<p class="small muted">ขนาดไฟล์ชุดภาพโดยประมาณ ' + (total / 1024 / 1024).toFixed(2) + ' MB' + (total > 3 * 1024 * 1024 ? ' — ใหญ่เกินไป ผู้เล่นอาจโหลดช้า' : '') + '</p>';
    $('validation').innerHTML = html;
  }

  $('chars').addEventListener('input', function (e) {
    if (!e.target.matches('[data-name],[data-th]')) return;
    var id = e.target.closest('.char').dataset.id;
    var c = findChar(id);
    if (e.target.matches('[data-th]')) { c.th = e.target.value.trim(); scheduleSave(); return; }
    c.name = e.target.value.trim();
    e.target.closest('.char').classList.toggle('bad', !c.name || (!c.img && !B.isText(cur)));
    scheduleSave(); renderValidation();
  });
  $('chars').addEventListener('click', function (e) {
    var card = e.target.closest('.char'); if (!card) return;
    var id = card.dataset.id;
    if (e.target.closest('[data-rep]')) { replaceTarget = id; $('replaceFile').click(); }
    if (e.target.closest('[data-det]')) openDetails(findChar(id));
    if (e.target.closest('[data-del]')) {
      var c = cur.characters.filter(function (x) { return x.id === id; })[0];
      UI.confirm('ลบ “' + c.name + '”?', '<p>ถ้าเคยพิมพ์บัตรกระดาษของชุดนี้แล้ว การลบตัวละครจะทำให้บัตรเดิมใช้ไม่ได้</p>', 'ลบ', 'danger').then(function (ok) {
        if (!ok) return;
        cur.characters = cur.characters.filter(function (x) { return x.id !== id; });
        scheduleSave(); renderEditor();
      });
    }
  });
  $('replaceFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f || !replaceTarget) return;
    processFile(f).then(function (r) {
      var c = cur.characters.filter(function (x) { return x.id === replaceTarget; })[0];
      c.img = r.img; c.bytes = r.bytes;
      if (B.isText(cur)) {
        // ภาพจากเครื่องแทนลิงก์เดิม
        delete c.media; delete c.credit; delete c.fallbackCredit;
      }
      scheduleSave(); renderEditor(); UI.toast('เปลี่ยนภาพ “' + c.name + '” แล้ว');
    }).catch(function (e) { UI.modal({ title: 'เปลี่ยนภาพไม่สำเร็จ', html: '<p>' + esc(f.name) + ': ' + esc(e.message) + '</p>' }); });
  });

  // ---------- อัปโหลดภาพ ----------
  $('addFiles').addEventListener('change', function () { var fs = Array.prototype.slice.call(this.files); this.value = ''; addFiles(fs); });
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(Array.prototype.slice.call(e.dataTransfer.files || [])); });

  function addFiles(files) {
    if (!cur || !files.length) return;
    var room = B.MAX_CHARACTERS - cur.characters.length;
    var errors = [];
    if (files.length > room) { errors.push('เพิ่มได้อีกเพียง ' + room + ' ภาพ (สูงสุด ' + B.MAX_CHARACTERS + ' ตัว) — ข้ามไฟล์ที่เกิน ' + (files.length - room) + ' ไฟล์'); files = files.slice(0, Math.max(0, room)); }
    var done = 0, added = 0;
    $('progress').textContent = 'กำลังประมวลผล 0/' + files.length;
    return files.reduce(function (p, f) {
      return p.then(function () {
        return processFile(f).then(function (r) {
          cur.characters.push({ id: newId(cur), name: r.name, img: r.img, bytes: r.bytes }); added++;
        }).catch(function (e) { errors.push(f.name + ': ' + e.message); })
          .then(function () { done++; $('progress').textContent = 'กำลังประมวลผล ' + done + '/' + files.length; });
      });
    }, Promise.resolve()).then(function () {
      $('progress').innerHTML = 'เพิ่มสำเร็จ ' + added + ' ภาพ' + (errors.length ? ' · <span style="color:var(--bad)">ผิดพลาด ' + errors.length + ' ไฟล์</span>' : '');
      scheduleSave(); renderEditor();
      if (errors.length) UI.modal({ title: 'มีไฟล์ที่ใช้ไม่ได้', html: '<ul>' + errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' });
    });
  }

  function loadBitmap(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file).catch(function () { return loadImg(file); });
    }
    return loadImg(file);
  }
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res(img); setTimeout(function () { URL.revokeObjectURL(url); }, 1000); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('เปิดไฟล์ภาพไม่ได้ (ไฟล์อาจเสียหาย)')); };
      img.src = url;
    });
  }
  /** ย่อภาพ → data URL (WebP ถ้าเบราว์เซอร์รองรับ, ไม่งั้น PNG/JPEG) */
  function processFile(file) {
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!OK_TYPES[file.type] && ['png', 'jpg', 'jpeg', 'webp'].indexOf(ext) < 0) return Promise.reject(new Error('ไม่ใช่ไฟล์ PNG / JPG / WebP'));
    if (file.size > MAX_FILE) return Promise.reject(new Error('ไฟล์ใหญ่เกิน 20 MB'));
    if (file.size === 0) return Promise.reject(new Error('ไฟล์ว่างเปล่า'));
    return loadBitmap(file).then(function (bmp) {
      var w = bmp.width, h = bmp.height;
      if (!w || !h) throw new Error('อ่านขนาดภาพไม่ได้');
      if (w < 64 || h < 64) throw new Error('ภาพเล็กเกินไป (' + w + '×' + h + ' px) ต้องไม่ต่ำกว่า 64 px แนะนำ 300 px ขึ้นไป');
      var s = Math.min(1, MAX_SIDE / Math.max(w, h));
      var cw = Math.round(w * s), ch = Math.round(h * s);
      var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      var ctx = cv.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, cw, ch);
      if (bmp.close) bmp.close();
      var url = cv.toDataURL('image/webp', 0.86);
      if (url.indexOf('data:image/webp') !== 0) {
        // Safari: ไม่รองรับการเข้ารหัส WebP
        var alpha = hasAlpha(ctx, cw, ch);
        url = alpha ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.88);
      }
      var bytes = Math.round((url.length - url.indexOf(',') - 1) * 0.75);
      var name = file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim().slice(0, 30) || 'ตัวละคร';
      return { name: name, img: url, bytes: bytes };
    });
  }
  function hasAlpha(ctx, w, h) {
    try {
      var d = ctx.getImageData(0, 0, w, h).data;
      for (var i = 3; i < d.length; i += 16) if (d[i] < 250) return true;
    } catch (e) { return true; }
    return false;
  }

  // ---------- ตัวอย่างบัตร ----------
  $('btnPreview').addEventListener('click', function () {
    var v = B.validateTheme(cur);
    if (!v.ok) { UI.modal({ title: 'ยังดูตัวอย่างไม่ได้', html: '<p>' + esc(v.errors[0]) + '</p>' }); return; }
    var num = B.randomPhoneCardNumber(), cells = B.generateCard(cur, num), m = B.charMap(cur);
    UI.modal({
      title: 'ตัวอย่างบัตร ' + B.formatCode(num),
      html: '<div class="grid4' + (B.isText(cur) ? ' txt' : '') + '" style="max-width:360px;margin:auto">' + cells.map(function (id) {
        return '<div class="cell" style="cursor:default">' + B.cellInner(cur, m[id]) + '</div>';
      }).join('') + '</div><p class="small muted center">แบบนี้คือสิ่งที่ผู้เล่นจะเห็นบนมือถือ</p>'
    });
  });

  // ---------- ส่งออก ----------
  function exportable() {
    var v = B.validateTheme(cur);
    if (!v.ok) { UI.modal({ title: 'ยังส่งออกไม่ได้', html: '<ul>' + v.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>' }); return null; }
    var out = { format: 'character-bingo-theme@1', id: cur.id, name: cur.name, category: cur.category || '', updatedAt: new Date().toISOString() };
    if (cur.display) out.display = cur.display;
    if (cur.description) out.description = cur.description;
    out.characters = cur.characters.map(function (c) {
      var o = { id: c.id, name: c.name.trim() };
      if (c.th) o.th = c.th;
      if (c.group) o.group = c.group;
      if (c.img) o.img = c.img;
      if (c.media) o.media = c.media;
      if (c.fallback) o.fallback = c.fallback;
      return o;
    });
    return out;
  }
  $('btnExportTheme').addEventListener('click', function () {
    var t = exportable(); if (!t) return;
    UI.download(t.id + '.json', JSON.stringify(t));
    UI.toast('ดาวน์โหลด ' + t.id + '.json แล้ว');
  });
  $('btnExportIndex').addEventListener('click', function () {
    var t = exportable(); if (!t) return;
    B.loadThemeIndex().catch(function () { return { themes: [] }; }).then(function (idx) {
      var themes = (idx.themes || []).filter(function (x) { return x.id !== t.id; });
      themes.push({ id: t.id, name: t.name, category: t.category, file: t.id + '.json' });
      var out = { format: 'character-bingo-index@1', default: $('setDefault').checked ? t.id : (idx.default || t.id), themes: themes };
      UI.download('index.json', JSON.stringify(out, null, 2));
      UI.toast('ดาวน์โหลด index.json แล้ว (' + themes.length + ' ชุด)');
    });
  });

  $('btnDeleteTheme').addEventListener('click', function () {
    UI.confirm('ลบชุด “' + cur.name + '” ออกจากเครื่องนี้?', '<p>ไม่กระทบชุดที่อัปโหลดขึ้นเว็บไซต์แล้ว · ควรส่งออกไฟล์เก็บไว้ก่อน</p>', 'ลบ', 'danger').then(function (ok) {
      if (!ok) return;
      LocalThemes.del(cur.id).then(function () { cur = null; $('editor').classList.add('hidden'); refreshList(); });
    });
  });

  refreshList();
  window.__admin = { cur: function () { return cur; }, processFile: processFile };
})();
