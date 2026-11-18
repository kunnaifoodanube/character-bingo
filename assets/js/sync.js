/* ชั้นซิงก์ข้อมูลพิธีกร → ผู้เล่น
 * โหมด: 'firebase' (Firestore แผนฟรี) | 'mock' (ใช้ในการทดสอบอัตโนมัติเท่านั้น) | 'off'
 * ระบบซิงก์เป็น "ส่วนเสริม" — ถ้าล่ม เกมยังเล่นต่อได้ และตรวจรางวัลจากหน้าพิธีกรได้เหมือนเดิม
 */
(function () {
  'use strict';
  var cfg = window.CB_FIREBASE_CONFIG || null;
  var mockBase = window.CB_SYNC_MOCK || null;
  var mode = mockBase ? 'mock' : (cfg && cfg.apiKey && cfg.projectId ? 'firebase' : 'off');

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('โหลด ' + src + ' ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }

  // ---------- Firebase ----------
  var fbp = null;
  function fb() {
    if (!fbp) {
      fbp = (window.CBFirebase ? Promise.resolve() : loadScript('assets/vendor/firebase.js')).then(function () {
        var F = window.CBFirebase;
        var app = F.initializeApp(cfg);
        var db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
        return { F: F, app: app, db: db };
      });
      fbp.catch(function () { fbp = null; });
    }
    return fbp;
  }
  var authp = null;
  function fbUser(x) {
    if (!authp) {
      authp = new Promise(function (res, rej) {
        var auth = x.F.getAuth(x.app);
        var off = x.F.onAuthStateChanged(auth, function (u) {
          off();
          if (u) return res(u);
          x.F.signInAnonymously(auth).then(function (c) { res(c.user); }).catch(rej);
        }, rej);
      });
      authp.catch(function () { authp = null; });
    }
    return authp;
  }

  // ---------- Mock (ทดสอบ) ----------
  function mockOwner() {
    var k = 'cb.mockOwner', v = localStorage.getItem(k);
    if (!v) { v = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem(k, v); }
    return v;
  }

  var Sync = {
    mode: mode,
    enabled: function () { return mode !== 'off'; },

    /** พิธีกรส่งสถานะห้อง (เขียนทับทั้งเอกสาร) */
    publish: function (roomId, data) {
      if (mode === 'firebase') {
        return fb().then(function (x) {
          return fbUser(x).then(function (u) {
            var payload = Object.assign({}, data, { ownerUid: u.uid });
            return x.F.setDoc(x.F.doc(x.db, 'rooms', roomId), payload);
          });
        });
      }
      if (mode === 'mock') {
        var payload = Object.assign({}, data, { ownerUid: mockOwner() });
        return fetch(mockBase + '/rooms/' + roomId, { method: 'PUT', body: JSON.stringify(payload) }).then(function (r) {
          if (r.status === 403) { var e = new Error('permission-denied'); e.code = 'permission-denied'; throw e; }
          if (!r.ok) throw new Error('HTTP ' + r.status);
        });
      }
      return Promise.resolve();
    },

    /** ผู้เล่นติดตามห้อง: onData(data|null), onStatus('connecting'|'live'|'cache'|'offline'|'error') → คืนฟังก์ชันยกเลิก */
    subscribe: function (roomId, onData, onStatus) {
      var stopped = false, unsub = null, timer = null;
      function st(s, e) { if (!stopped) onStatus(s, e); }
      function goOffline() { st('offline'); }
      window.addEventListener('offline', goOffline);
      st(navigator.onLine === false ? 'offline' : 'connecting');
      if (mode === 'firebase') {
        fb().then(function (x) {
          if (stopped) return;
          unsub = x.F.onSnapshot(x.F.doc(x.db, 'rooms', roomId), { includeMetadataChanges: true }, function (snap) {
            st(snap.metadata.fromCache || navigator.onLine === false ? 'cache' : 'live');
            if (!stopped) onData(snap.exists() ? snap.data() : null);
          }, function (err) { st('error', err); });
        }).catch(function (e) { st('error', e); });
      } else if (mode === 'mock') {
        var poll = function () {
          fetch(mockBase + '/rooms/' + roomId, { cache: 'no-store' }).then(function (r) {
            if (r.status === 404) return null;
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          }).then(function (d) { st('live'); if (!stopped) onData(d); })
            .catch(function () { st('offline'); })
            .then(function () { if (!stopped) timer = setTimeout(poll, 400); });
        };
        poll();
      }
      return function () {
        stopped = true; window.removeEventListener('offline', goOffline);
        if (unsub) unsub(); if (timer) clearTimeout(timer);
      };
    },

    newRoomId: function () {
      var a = 'abcdefghijkmnpqrstuvwxyz23456789', s = '';
      for (var i = 0; i < 10; i++) s += a.charAt(Bingo.randomInt(0, a.length - 1));
      return s;
    }
  };
  window.Sync = Sync;
})();
