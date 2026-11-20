/* Service Worker — ทำให้เกมเปิดได้แม้อินเทอร์เน็ตหลุด หลังโหลดครั้งแรกแล้ว
 * กลยุทธ์: เครือข่ายก่อน (รอไม่เกิน 3.5 วิ) → ถ้าไม่ได้ ใช้สำเนาในเครื่อง
 * เมื่อแก้ไฟล์ในเว็บไซต์ ให้เปลี่ยนเลข VERSION เพื่อล้างแคชเก่า
 */
var PREFIX = 'cb-';             // แต่ละเวอร์ชันเกมใช้ PREFIX ของตัวเอง (โดเมนเดียวกันใช้แคชร่วมกัน)
var VERSION = PREFIX + 'v1.5.9';
var MEDIA = PREFIX + 'media-v1'; // ภาพจาก Wikimedia Commons (ไม่ลบเมื่ออัปเดตเวอร์ชัน)
var SHELL = [
  './', 'index.html', 'host.html', 'admin.html', 'print.html',
  'assets/css/style.css', 'assets/js/core.js', 'assets/js/ui.js', 'assets/js/player.js',
  'assets/js/host.js', 'assets/js/admin.js', 'assets/js/print.js', 'assets/js/themes-local.js',
  'assets/vendor/qrcode.js', 'assets/vendor/jsqr.js', 'assets/js/sync.js', 'firebase-config.js', 'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'manifest.webmanifest', 'themes/index.json'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // ใส่ทีละไฟล์ ไฟล์ใดพลาดก็ไม่ทำให้ทั้งหมดล้ม
    return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () {
    // แคชชุดภาพทุกชุดที่อยู่ใน index.json ล่วงหน้า
    return fetch('themes/index.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (idx) {
      return caches.open(VERSION).then(function (c) {
        return Promise.all((idx.themes || []).map(function (t) {
          // ชุดภาพ + ไฟล์ภาพในเว็บไซต์ที่ชุดนั้นอ้างถึง (เปิดเล่นออฟไลน์ได้)
          return fetch('themes/' + t.file, { cache: 'reload' }).then(function (r) {
            if (!r.ok) return;
            return c.put('themes/' + t.file, r.clone()).then(function () { return r.json(); }).then(function (th) {
              var imgs = (th.characters || []).map(function (ch) { return ch.img; }).filter(function (u) { return u && /^[\w\-./%]+\.(png|jpe?g|webp|svg|gif)$/i.test(u); });
              return Promise.all(imgs.map(function (u) { return c.add(u).catch(function () {}); }));
            });
          }).catch(function () {});
        }));
      });
    }).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== VERSION && k !== MEDIA; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) {
    // ภาพนิ่ง/ภาพปกคลิปจาก Wikimedia: ใช้สำเนาในเครื่องก่อน (ไฟล์บน Commons ไม่เปลี่ยนตาม URL) → เปิดเกมออฟไลน์ได้
    // คลิปวิดีโอ (.webm) ไม่แคช เพราะไฟล์ใหญ่และเบราว์เซอร์โหลดเป็นช่วง — ออฟไลน์จะแสดงภาพปกแทน
    if (url.hostname === 'upload.wikimedia.org' && !/\.(webm|ogv|mp4)$/i.test(url.pathname) && req.destination !== 'video') {
      e.respondWith(caches.open(MEDIA).then(function (c) {
        return c.match(req, { ignoreVary: true }).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
            return res;
          });
        });
      }));
    }
    return;
  }
  e.respondWith((function () {
    // ตรวจกับเซิร์ฟเวอร์ทุกครั้ง (ไม่ใช้แคช HTTP 10 นาทีของ GitHub Pages) เพื่อไม่ให้ได้ไฟล์คนละเวอร์ชัน
    var net = (req.mode === 'navigate' ? fetch(req) : fetch(req, { cache: 'no-cache' })).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      return res;
    });
    return Promise.race([net, timeout(3500)]).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return caches.match('index.html');
        return net; // รอเครือข่ายต่อ (อาจช้า)
      });
    });
  })());
});
