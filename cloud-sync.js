/* cloud-sync.js — Google 登入 + Firestore 雲端同步 localStorage（鍵名以 toeic 開頭者）
   用法：每個要同步的頁面，在「會讀寫 localStorage 的 script」之前加上
         <script src="cloud-sync.js"></script>
   設定：把下面 FIREBASE_CONFIG 換成你的 Firebase 專案設定（見說明）。 */
(function () {
  'use strict';
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCCur8xvDVVk3VucVQOL67BHFE_3oaS3Ms',
    authDomain: 'toeic-web-5d5c1.firebaseapp.com',
    projectId: 'toeic-web-5d5c1',
    appId: '1:174019544058:web:62e9cd6decc7a0fca65a43'
  };

  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const META = 'syncMetaV1';                       // 本機同步狀態（不會被同步）
  const isSync = k => typeof k === 'string' && /^toeic/i.test(k);
  const ls = window.localStorage;
  const rawGet = Storage.prototype.getItem, rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  const fmtT = t => t ? new Date(t).toLocaleString('zh-TW', { hour12: false }) : '未知';
  const isEmpty = v => v === null || v === '' || v === '{}' || v === '[]';

  let meta = { base: {}, dirty: {}, mod: {}, last: 0, cloudLast: 0 };
  try { meta = Object.assign(meta, JSON.parse(rawGet.call(ls, META) || '{}')); } catch (e) {}
  const saveMeta = () => { try { rawSet.call(ls, META, JSON.stringify(meta)); } catch (e) {} };

  let applying = false, user = null, db = null, timer = null, busy = false, status = 'out';

  /* ---- 攔截 localStorage 寫入，標記為「待上傳」 ---- */
  function markDirty(k) { meta.dirty[k] = 1; meta.mod[k] = Date.now(); saveMeta(); schedule(); }
  Storage.prototype.setItem = function (k, v) { rawSet.call(this, k, v); if (this === ls && !applying && isSync(k)) markDirty(k); };
  Storage.prototype.removeItem = function (k) { rawRemove.call(this, k); if (this === ls && !applying && isSync(k)) markDirty(k); };

  function schedule() { if (!user) return; clearTimeout(timer); timer = setTimeout(() => sync(), 1500); }
  window.addEventListener('pagehide', () => { if (user && Object.keys(meta.dirty).length) sync(); });

  /* ---- 合併：兩邊都有變更時 ---- */
  function mergeById(a, b) {
    try {
      const A = JSON.parse(a), B = JSON.parse(b);
      if (!Array.isArray(A) || !Array.isArray(B) || ![...A, ...B].every(x => x && x.id)) return null;
      const m = new Map(); [...B, ...A].forEach(x => m.set(x.id, x));
      return JSON.stringify([...m.values()].sort((x, y) => (y.t || 0) - (x.t || 0)));
    } catch (e) { return null; }
  }

  /* ---- 同步主流程 ---- */
  async function sync() {
    if (!user || busy) return;
    busy = true; setStatus('sync');
    try {
      const col = db.collection('users').doc(user.uid).collection('data');
      const snap = await col.get();
      const cloud = {}; snap.forEach(d => { cloud[d.id] = d.data(); });
      const keys = new Set(Object.keys(cloud));
      for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (isSync(k)) keys.add(k); }
      Object.keys(meta.dirty).forEach(k => keys.add(k));

      const pull = [], push = [];
      keys.forEach(key => {
        const c = cloud[key], cv = c && c.value != null ? c.value : null;
        const local = rawGet.call(ls, key), dirty = !!meta.dirty[key];
        if (cv === null) { if (dirty || !isEmpty(local)) push.push(key); return; }
        if (local === cv) { meta.base[key] = c.ts; delete meta.dirty[key]; return; }
        if (isEmpty(local) && !dirty) { pull.push([key, cv, c.ts]); return; }
        if (c.ts === meta.base[key]) { push.push(key); return; }          // 雲端沒變，本機有改
        if (!dirty && meta.base[key] !== undefined) { pull.push([key, cv, c.ts]); return; } // 雲端有改，本機沒改
        // 兩邊都有不同內容 → 衝突
        const merged = mergeById(local, cv);
        if (merged) { applying = true; rawSet.call(ls, key, merged); applying = false; push.push(key); pull.merged = true; }
        else if (confirm('「' + key + '」雲端與本機內容不同。\n\n雲端最後存檔：' + fmtT(c.ts) + '\n本機最後修改：' + fmtT(meta.mod[key]) + '\n\n按「確定」＝使用雲端版本（本機被覆蓋）\n按「取消」＝使用本機版本（雲端被覆蓋）')) pull.push([key, cv, c.ts]);
        else push.push(key);
      });

      const batch = db.batch(); const now = Date.now();
      push.forEach(key => {
        const v = rawGet.call(ls, key);
        batch.set(col.doc(key), { value: v, ts: now });
        meta.base[key] = now; delete meta.dirty[key];
      });
      if (push.length) await batch.commit();

      applying = true;
      pull.forEach(([k, v, ts]) => { rawSet.call(ls, k, v); meta.base[k] = ts; delete meta.dirty[k]; });
      applying = false;
      let latest = 0; keys.forEach(k => { const c = cloud[k]; if (c && c.ts > latest) latest = c.ts; });
      if (push.length) latest = now;
      meta.last = Date.now(); meta.cloudLast = latest || meta.cloudLast;
      saveMeta(); setStatus('ok');

      if ((pull.length || pull.merged) && Date.now() - Number(sessionStorage.getItem('syncReload') || 0) > 8000) {
        sessionStorage.setItem('syncReload', Date.now()); location.reload();   // 讓頁面用雲端資料重新載入
      }
    } catch (e) { console.error('[sync]', e); setStatus('err', e && e.message); }
    finally { applying = false; busy = false; }
  }

  /* ---- UI ---- */
  let btn, panel;
  function setStatus(s, msg) {
    status = s; if (!btn) return;
    btn.textContent = { out: '☁ 登入同步', sync: '☁ 同步中…', ok: '☁ ✔ 已同步', err: '☁ ⚠ 同步失敗', nocfg: '☁ 尚未設定' }[s];
    btn.title = msg || (user ? user.email + '\n上次同步：' + fmtT(meta.last) : '');
    if (panel) {
      panel.querySelector('#cs-who').textContent = user ? user.email : '';
      panel.querySelector('#cs-time').innerHTML = user ? '上次同步：' + fmtT(meta.last) + '<br>雲端最後存檔：' + fmtT(meta.cloudLast) : '';
    }
  }
  function buildUI() {
    btn = document.createElement('button'); btn.type = 'button';
    btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:8px 14px;border-radius:999px;border:0;background:#4f46e5;color:#fff;font:600 13px system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3);cursor:pointer';
    panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;right:12px;bottom:56px;z-index:99999;display:none;padding:12px;border-radius:12px;background:#fff;color:#1e293b;font:13px system-ui,sans-serif;box-shadow:0 2px 12px rgba(0,0,0,.35)';
    panel.innerHTML = '<div id="cs-who" style="margin-bottom:4px;word-break:break-all"></div>' +
      '<div id="cs-time" style="margin-bottom:8px;font-size:12px;color:#64748b;line-height:1.5"></div>' +
      '<button type="button" id="cs-now" style="margin-right:6px;padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#1e293b">立即同步</button>' +
      '<button type="button" id="cs-out" style="padding:6px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#be123c">登出</button>';
    document.body.append(panel, btn);
    btn.onclick = () => {
      if (status === 'nocfg') { alert('請先在 cloud-sync.js 填入 Firebase 設定。'); return; }
      if (!user) { signIn(); return; }
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    };
    panel.querySelector('#cs-now').onclick = () => { panel.style.display = 'none'; sync(); };
    panel.querySelector('#cs-out').onclick = () => { panel.style.display = 'none'; firebase.auth().signOut(); };
    setStatus(FIREBASE_CONFIG.apiKey ? 'out' : 'nocfg');
  }
  async function signIn() {
    const auth = firebase.auth(), p = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(p); }
    catch (e) {
      if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') auth.signInWithRedirect(p);
      else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') { alert('登入失敗：' + e.message); }
    }
  }

  /* ---- 載入 Firebase SDK ---- */
  const load = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  async function start() {
    buildUI();
    if (!FIREBASE_CONFIG.apiKey) return;
    try {
      await load(SDK + 'firebase-app-compat.js');
      await Promise.all([load(SDK + 'firebase-auth-compat.js'), load(SDK + 'firebase-firestore-compat.js')]);
      firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
      firebase.auth().getRedirectResult().catch(() => {});
      firebase.auth().onAuthStateChanged(u => { user = u; if (u) sync(); else setStatus('out'); });
    } catch (e) { console.error(e); setStatus('err', '無法載入 Firebase'); }
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
