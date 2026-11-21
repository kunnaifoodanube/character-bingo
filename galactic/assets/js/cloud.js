/* เกมที่ผู้ใช้สร้างเอง (เก็บใน Firestore แผนฟรี)
 * games/{gameId}            — ชื่อเกม เจ้าของ จำนวนข้อ สถานะ (draft/published)
 * games/{gameId}/items/{id} — แต่ละข้อ: โจทย์บนจอใหญ่ (qText/qImg) + คำตอบบนบัตร (aText/aImg)
 * ภาพเก็บเป็น data URL (WebP ย่อขนาดแล้ว) ในเอกสารของแต่ละข้อ — ไม่ต้องใช้ Cloud Storage (ฟรี)
 * ทุกคนอ่านได้ · สร้างเกมต้องล็อกอิน Google · แก้/ลบได้เฉพาะเจ้าของ (ดู firebase/firestore.rules)
 */
(function () {
  'use strict';
  var cfg = window.CB_FIREBASE_CONFIG || null;
  var mockBase = window.CB_SYNC_MOCK || null;
  var mode = mockBase ? 'mock' : (cfg && cfg.apiKey && cfg.projectId ? 'firebase' : 'off');
  var PREFIX = 'cloud-'; // รหัสชุดภาพของเกมจากระบบ = cloud-<gameId>

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error('โหลด ' + src + ' ไม่สำเร็จ')); };
      document.head.appendChild(s);
    });
  }
  /** Firebase ตัวเดียวใช้ร่วมกันทั้งหน้า (sync.js + cloud.js) */
  function fb() {
    if (!window.__cbFbP) {
      window.__cbFbP = (window.CBFirebase ? Promise.resolve() : loadScript('assets/vendor/firebase.js?v=11.10.0c')).then(function () {
        var F = window.CBFirebase;
        var app = F.initializeApp(cfg);
        var db = F.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
        return { F: F, app: app, db: db, auth: F.getAuth(app) };
      });
      window.__cbFbP.catch(function () { window.__cbFbP = null; });
    }
    return window.__cbFbP;
  }
  function permErr() { var e = new Error('permission-denied'); e.code = 'permission-denied'; return e; }

  // ---------- mock (ใช้ในการทดสอบอัตโนมัติ) ----------
  function mget(path) {
    return fetch(mockBase + '/docs/' + path, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function mput(path, data) {
    return fetch(mockBase + '/docs/' + path, { method: 'PUT', body: JSON.stringify(data) }).then(function (r) {
      if (r.status === 403) throw permErr(); if (!r.ok) throw new Error('HTTP ' + r.status);
    });
  }
  function mdel(path) {
    return fetch(mockBase + '/docs/' + path, { method: 'DELETE' }).then(function (r) {
      if (r.status === 403) throw permErr(); if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
    });
  }
  var mockListeners = [];
  function mockNotify() { var u = mockUser(); mockListeners.forEach(function (cb) { cb(u); }); }
  function mockUser() { try { return JSON.parse(localStorage.getItem('cb.mockGoogle') || 'null'); } catch (e) { return null; } }

  function listOf(obj) { return Object.keys(obj || {}).map(function (k) { return { id: k, data: obj[k] }; }); }

  // ---------- ผู้ใช้ (Google) ----------
  function userInfo(u) {
    if (!u || u.isAnonymous) return null;
    return { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0] || 'ผู้สร้าง', email: u.email || '', photo: u.photoURL || '' };
  }
  var Cloud = {
    mode: mode,
    PREFIX: PREFIX,
    enabled: function () { return mode !== 'off'; },
    isCloudId: function (themeId) { return String(themeId || '').indexOf(PREFIX) === 0; },
    gameIdOf: function (themeId) { return String(themeId || '').slice(PREFIX.length); },

    /** ติดตามสถานะล็อกอิน → cb(user|null) */
    onUser: function (cb) {
      if (mode === 'mock') { mockListeners.push(cb); setTimeout(function () { cb(mockUser()); }, 0); return function () { mockListeners = mockListeners.filter(function (x) { return x !== cb; }); }; }
      if (mode === 'off') { setTimeout(function () { cb(null); }, 0); return function () { }; }
      var off = null, stopped = false;
      fb().then(function (x) {
        if (stopped) return;
        off = x.F.onAuthStateChanged(x.auth, function (u) { cb(userInfo(u)); });
      }).catch(function () { cb(null); });
      return function () { stopped = true; if (off) off(); };
    },
    signIn: function () {
      if (mode === 'mock') {
        var u = mockUser() || { uid: (localStorage.getItem('cb.mockOwner') || ('u' + Math.random().toString(36).slice(2, 10))), name: 'ครูทดสอบ', email: 'test@example.com' };
        localStorage.setItem('cb.mockOwner', u.uid); localStorage.setItem('cb.mockGoogle', JSON.stringify(u));
        setTimeout(mockNotify, 0);
        return Promise.resolve(u);
      }
      if (mode === 'off') return Promise.reject(new Error('ยังไม่ได้ตั้งค่า Firebase'));
      return fb().then(function (x) {
        var p = new x.F.GoogleAuthProvider();
        p.setCustomParameters({ prompt: 'select_account' });
        return x.F.signInWithPopup(x.auth, p).then(function (c) { return userInfo(c.user); });
      });
    },
    signOut: function () {
      if (mode === 'mock') { localStorage.removeItem('cb.mockGoogle'); setTimeout(mockNotify, 0); return Promise.resolve(); }
      return fb().then(function (x) { return x.F.signOut(x.auth); });
    },

    // ---------- อ่าน ----------
    /** รายชื่อเกมทั้งหมด (ล่าสุดก่อน) → [{id, data}] */
    listGames: function () {
      if (mode === 'mock') return mget('games').then(listOf).then(sortGames);
      if (mode === 'off') return Promise.resolve([]);
      return fb().then(function (x) {
        var q = x.F.query(x.F.collection(x.db, 'games'), x.F.orderBy('updatedAt', 'desc'), x.F.limit(200));
        return x.F.getDocs(q).then(function (snap) { var l = []; snap.forEach(function (d) { l.push({ id: d.id, data: d.data() }); }); return l; });
      });
    },
    /** เกมที่เผยแพร่แล้วและมีข้อครบพอเล่น */
    listPublished: function () {
      return Cloud.listGames().then(function (l) {
        return l.filter(function (g) { return g.data.status === 'published' && (g.data.itemCount || 0) >= Bingo.MIN_CHARACTERS; });
      });
    },
    listMine: function (uid) {
      return Cloud.listGames().then(function (l) { return l.filter(function (g) { return g.data.ownerUid === uid; }); });
    },
    getGame: function (gameId) {
      if (mode === 'mock') return mget('games').then(function (all) { return all[gameId] || null; });
      return fb().then(function (x) { return x.F.getDoc(x.F.doc(x.db, 'games', gameId)).then(function (s) { return s.exists() ? s.data() : null; }); });
    },
    getItems: function (gameId) {
      var p;
      if (mode === 'mock') p = mget('games/' + gameId + '/items').then(listOf);
      else p = fb().then(function (x) {
        return x.F.getDocs(x.F.query(x.F.collection(x.db, 'games', gameId, 'items'), x.F.limit(200))).then(function (snap) {
          var l = []; snap.forEach(function (d) { l.push({ id: d.id, data: d.data() }); }); return l;
        });
      });
      return p.then(function (l) { return l.sort(function (a, b) { return (a.data.order || 0) - (b.data.order || 0) || (a.id < b.id ? -1 : 1); }); });
    },

    // ---------- เขียน (เจ้าของเกมเท่านั้น) ----------
    saveGame: function (gameId, data) {
      if (mode === 'mock') return mput('games/' + gameId, data);
      return fb().then(function (x) { return x.F.setDoc(x.F.doc(x.db, 'games', gameId), data); });
    },
    saveItem: function (gameId, itemId, data) {
      if (mode === 'mock') return mput('games/' + gameId + '/items/' + itemId, data);
      return fb().then(function (x) { return x.F.setDoc(x.F.doc(x.db, 'games', gameId, 'items', itemId), data); });
    },
    deleteItem: function (gameId, itemId) {
      if (mode === 'mock') return mdel('games/' + gameId + '/items/' + itemId);
      return fb().then(function (x) { return x.F.deleteDoc(x.F.doc(x.db, 'games', gameId, 'items', itemId)); });
    },
    deleteGame: function (gameId) {
      return Cloud.getItems(gameId).then(function (items) {
        return Promise.all(items.map(function (it) { return Cloud.deleteItem(gameId, it.id); }));
      }).then(function () {
        if (mode === 'mock') return mdel('games/' + gameId);
        return fb().then(function (x) { return x.F.deleteDoc(x.F.doc(x.db, 'games', gameId)); });
      });
    },
    newId: function (n) {
      var a = 'abcdefghijkmnpqrstuvwxyz23456789', s = '';
      for (var i = 0; i < (n || 10); i++) s += a.charAt(Bingo.randomInt(0, a.length - 1));
      return s;
    },

    // ---------- แปลงเป็นชุดภาพของเกม ----------
    /** game + items → theme (display: 'cloud') ที่หน้าพิธีกร/ผู้เล่น/พิมพ์บัตรใช้ได้เหมือนชุดภาพปกติ */
    toTheme: function (gameId, game, items) {
      var chars = items.map(function (it, i) {
        var d = it.data || {}, n = i + 1;
        var c = {
          id: it.id,
          name: (d.aText || d.qText || ('ข้อ ' + n)).trim(),
          label: (d.aText || '').trim(),  // คำบนบัตร (ว่าง = บัตรเป็นภาพอย่างเดียว)
          q: (d.qText || '').trim()       // โจทย์ (ข้อความ) บนจอใหญ่
        };
        if (d.aImg) c.img = d.aImg;
        if (d.qImg) c.media = { type: 'image', src: d.qImg };
        return c;
      });
      return {
        format: 'character-bingo-theme@1', id: PREFIX + gameId, name: game.name, category: 'เกมที่สร้างเอง',
        display: 'cloud', showAnswer: !!game.showAnswer, description: game.description || '',
        author: game.ownerName || '', updatedAt: game.updatedAt ? new Date(game.updatedAt).toISOString() : '',
        characters: chars
      };
    },
    /** โหลดเกมจากระบบเป็นชุดภาพ (มีสำรองในเครื่องถ้าเน็ตหลุด) */
    loadTheme: function (themeId) {
      var gameId = Cloud.gameIdOf(themeId);
      return Promise.all([Cloud.getGame(gameId), Cloud.getItems(gameId)]).then(function (r) {
        if (!r[0]) throw new Error('ไม่พบเกมนี้ในระบบ (อาจถูกลบแล้ว)');
        var t = Cloud.toTheme(gameId, r[0], r[1]);
        try { Bingo.store.set('cb.theme.' + t.id, t); } catch (e) { /* ภาพใหญ่เกินพื้นที่ */ }
        return t;
      }).catch(function (e) {
        var cached = Bingo.store.get('cb.theme.' + themeId, null);
        if (cached) return cached;
        throw e;
      });
    }
  };
  function sortGames(l) { return l.sort(function (a, b) { return (b.data.updatedAt || 0) - (a.data.updatedAt || 0); }); }
  window.CloudGames = Cloud;
})();
