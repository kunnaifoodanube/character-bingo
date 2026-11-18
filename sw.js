/* Service Worker — ทำให้เกมเปิดได้แม้อินเทอร์เน็ตหลุด หลังโหลดครั้งแรกแล้ว
 * กลยุทธ์: เครือข่ายก่อน (รอไม่เกิน 3.5 วิ) → ถ้าไม่ได้ ใช้สำเนาในเครื่อง
 * เมื่อแก้ไฟล์ในเว็บไซต์ ให้เปลี่ยนเลข VERSION เพื่อล้างแคชเก่า
 */
var VERSION = 'cb-v1.1.1';
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
        return Promise.all((idx.themes || []).map(function (t) { return c.add('themes/' + t.file).catch(function () {}); }));
      });
    }).catch(function () {});
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;
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
