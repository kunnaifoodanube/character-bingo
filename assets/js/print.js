/* หน้าพิมพ์บัตรสำรอง (ใช้ระบบพิมพ์ของเบราว์เซอร์ → บันทึกเป็น PDF) */
(function () {
  'use strict';
  var B = Bingo, esc = B.esc;
  var $ = function (id) { return document.getElementById(id); };
  var sources = null, theme = null;

  ['from', 'to'].forEach(function (k) { if (UI.qs(k)) $(k).value = UI.qs(k); });
  if (UI.qs('per')) $('per').value = UI.qs('per');

  ThemeSource.all().then(function (src) {
    sources = src;
    $('themeSel').innerHTML = src.list.map(function (t) {
      return '<option value="' + esc(t.source + ':' + t.id) + '">' + esc(t.name) + (t.source === 'local' ? ' (ฉบับร่างในเครื่อง)' : '') + '</option>';
    }).join('');
    var want = UI.qs('t') || src.defaultId, wantSrc = UI.qs('src') === 'local' ? 'local' : 'published';
    var e = src.list.filter(function (t) { return t.id === want && t.source === wantSrc; })[0] || src.list.filter(function (t) { return t.id === want; })[0];
    if (e) $('themeSel').value = e.source + ':' + e.id;
    if (UI.qs('auto')) build();
  });

  function entry() {
    var v = $('themeSel').value.split(':');
    return sources.list.filter(function (t) { return t.source === v[0] && t.id === v.slice(1).join(':'); })[0];
  }

  function build() {
    var e = entry(); if (!e) return Promise.resolve();
    $('btnPrint').disabled = true;
    return ThemeSource.load(e, sources.index).then(function (t) {
      var v = B.validateTheme(t);
      if (!v.ok) { $('report').innerHTML = '<div class="banner err">' + esc(v.errors.join(' · ')) + '</div>'; return; }
      theme = t;
      var from = Math.max(1, Math.min(B.PRINT_RANGE_MAX, parseInt($('from').value, 10) || 1));
      var to = Math.max(from, Math.min(B.PRINT_RANGE_MAX, parseInt($('to').value, 10) || from));
      if (to - from > 999) to = from + 999;
      $('from').value = from; $('to').value = to;
      var nums = []; for (var n = from; n <= to; n++) nums.push(n);
      var chk = B.checkCardSet(t, nums);
      var rep = chk.ok ? '<div class="banner ok">✅ ตรวจชุดบัตรแล้ว: ' + nums.length + ' ใบ ไม่มีบัตรซ้ำกัน' +
        (chk.sameCharacterSet.length ? ' (มี ' + chk.sameCharacterSet.length + ' คู่ที่ใช้ตัวละครชุดเดียวกันแต่ตำแหน่งต่างกัน)' : '') + '</div>'
        : '<div class="banner err">พบบัตรซ้ำ ' + chk.identicalCards.length + ' คู่: ' + chk.identicalCards.map(function (p) { return p.join('=') ; }).join(', ') + '</div>';
      $('report').innerHTML = rep + '<p class="small muted">ชุด “' + esc(t.name) + '” · รหัสชุด ' + B.fingerprint(t) + ' · บัตร ' + B.formatCode(from) + ' ถึง ' + B.formatCode(to) + '</p>';
      render(nums, +$('per').value);
      $('btnPrint').disabled = false;
    }).catch(function (err) { $('report').innerHTML = '<div class="banner err">' + esc(err.message) + '</div>'; });
  }

  function pic(c) { return B.isText(theme) || !c.img ? '' : '<img alt="" src="' + esc(c.img) + '">'; }
  function label(c) { return esc(c.name) + (B.isText(theme) && c.th ? '<br><small>' + esc(c.th) + '</small>' : ''); }
  function cardHtml(num, m, title, fp) {
    var cells = B.generateCard(theme, num);
    return '<div class="pcard"><div class="hd"><div><div class="ttl">' + esc(title) + '</div><div class="sub">ชุด ' + esc(theme.name) + '</div></div>' +
      '<div class="no">' + B.formatCode(num) + '</div></div>' +
      '<div class="nm-line">ชื่อผู้เล่น ______________________________</div>' +
      '<div class="pgrid' + (B.isText(theme) ? ' txt' : '') + '">' + cells.map(function (id) { return '<div>' + pic(m[id]) + '<span>' + esc(m[id].name) + '</span></div>'; }).join('') + '</div>' +
      '<div class="ft"><span>ขีด ✕ ตัวที่ถูกเรียก · ครบแนวนอน/ตั้ง/ทแยง = BINGO</span><span>รหัสชุด ' + fp + '</span></div></div>';
  }

  function render(nums, per) {
    var m = B.charMap(theme), title = $('title').value, fp = B.fingerprint(theme), html = '';
    for (var i = 0; i < nums.length; i += per) {
      html += '<div class="page per' + per + '">';
      for (var k = i; k < Math.min(i + per, nums.length); k++) html += cardHtml(nums[k], m, title, fp);
      html += '</div>';
    }
    if ($('incCall').checked) {
      html += '<div class="page call"><h2>แผ่นบันทึกการเรียกตัวละคร — ' + esc(theme.name) + '</h2><p class="small">เขียนลำดับที่เรียก (1, 2, 3…) ใช้ตรวจรางวัลเมื่อระบบสำรอง · รหัสชุด ' + fp + '</p><table><tr><th>' + (B.isText(theme) ? '' : 'ภาพ') + '</th><th>ชื่อ</th><th style="width:28mm">ลำดับที่เรียก</th><th>' + (B.isText(theme) ? '' : 'ภาพ') + '</th><th>ชื่อ</th><th style="width:28mm">ลำดับที่เรียก</th></tr>';
      var cs = theme.characters, half = Math.ceil(cs.length / 2);
      for (var r = 0; r < half; r++) {
        html += '<tr>' + [cs[r], cs[r + half]].map(function (c) { return c ? '<td>' + pic(c) + '</td><td>' + label(c) + '</td><td></td>' : '<td></td><td></td><td></td>'; }).join('') + '</tr>';
      }
      html += '</table></div>';
    }
    if ($('incSlips').checked) {
      for (var s = 0; s < theme.characters.length; s += 24) {
        html += '<div class="page slips">' + theme.characters.slice(s, s + 24).map(function (c) { return '<div' + (B.isText(theme) ? ' class="txt"' : '') + '>' + pic(c) + '<span>' + label(c) + '</span></div>'; }).join('') + '</div>';
      }
    }
    $('out').innerHTML = html;
  }

  $('btnBuild').addEventListener('click', build);
  $('btnPrint').addEventListener('click', function () { window.print(); });
  window.__print = { build: build };
})();
