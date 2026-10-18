/* pron.js — 發音練習：詳解／核心單字／生詞本／句型 裡每一個 🔊 旁邊都多一個 🎙，隨時可以練習、評分、記錄最高分
   依賴（執行時才用到）：daily.js 的 S／save／esc／find／cur／speak／spStop；notes.js 的 dnToast／dnAu；
                         speak.js 的 skCompare／skSR／skStopAll／skWordsH／skDiffH／skPctCls／skMsg／skCtl／skSeg／skLoose
   載入順序：放在 daily.js 之後（daily.html 已加）。
   做法：不改動既有每個 🔊 的產生程式，而是在畫面更新後，替每個 vplay(...)／speakPhrase(...) 按鈕補上 🎙；
         按下去開底部視窗：聽範例 → 錄音 → 辨識 → 逐字比對 → 分數。
   回放：錄音時同步用 MediaRecorder 錄下聲音，評分後可按「聽我的錄音」回放；錄音只存在記憶體（blob URL），
         關閉視窗／換字／重錄／切到背景／離開頁面時立即刪除，不會寫入 IndexedDB 或 localStorage。
   紀錄：S.pron[文字] = { b：最高分, n：練習次數, l：最近一次, t：時間 }（文字轉小寫、空白合併；同一個字不論在哪一篇都共用同一筆） */

const PR = { text: '', key: '', src: null, st: 'idle', final: '', interim: '', alts: [], cands: null, err: '', sr: null, tk: 0, restart: 0, stopping: false, srEnd: null, timer: null, res: null, nb: false,
  mr: null, stream: null, chunks: [], mime: '', mrDone: null, url: null, au: null, pl: false }; // mr…pl：自己的錄音（只放記憶體，關閉視窗就刪）
const prNorm = t => String(t == null ? '' : t).trim().toLowerCase().replace(/\s+/g, ' ');
const prWc = t => (String(t).match(/\S*[A-Za-z0-9]\S*/g) || []).length;
const prBest = k => ((S.pron || {})[k] || {}).b || 0;

/* ---------- 紀錄 ---------- */
function prRecord(key, pct) { // 回傳：這次是不是新的最高分（第一次練習不算「破紀錄」）
  S.pron = S.pron || {};
  const o = S.pron[key] || { b: 0, n: 0 }, first = !o.n, nb = pct > o.b && !first;
  o.n++; o.l = pct; o.t = Date.now(); if (pct > o.b) o.b = pct;
  S.pron[key] = o; save();
  return nb;
}
const prBadge = (key, extra) => { // 小徽章：最高分；沒練習過就不顯示
  const b = prBest(key);
  return `<span class="pr-badge ml-0.5 align-middle text-[10px] font-bold rounded px-1 py-0.5 ${b ? skPctCls(b) : 'hidden'}" data-k="${esc(key)}" title="最高分${extra || ''}">${b ? b : ''}</span>`;
};
function prRefreshBadges() {
  document.querySelectorAll('.pr-badge').forEach(el => {
    const b = prBest(el.dataset.k);
    el.className = 'pr-badge ml-0.5 align-middle text-[10px] font-bold rounded px-1 py-0.5 ' + (b ? skPctCls(b) : 'hidden');
    el.textContent = b || '';
  });
}

/* ---------- 在每個 🔊 旁邊補上 🎙 ---------- */
function prTextOf(btn) {
  const oc = btn.getAttribute('onclick') || '';
  if (/^\s*vplay\(/.test(oc)) return btn.dataset.w || btn.dataset.t || '';
  const m = /^\s*speakPhrase\((\d+)\)/.exec(oc);
  if (m) { // 簡報句型：省略號不念（與 speakPhrase 相同）
    try { const x = find(cur.w, cur.d), p = x && x.presentation_phrases && x.presentation_phrases[+m[1]]; return p ? String(p.phrase).replace(/\.{2,}|…/g, ' ') : ''; } catch (e) { return ''; }
  }
  return '';
}
function prInject(root) {
  (root || document).querySelectorAll('button[onclick^="vplay("],button[onclick^="speakPhrase("]').forEach(b => {
    if (b.dataset.pr) return;
    b.dataset.pr = '1';
    const text = prTextOf(b).replace(/\s+/g, ' ').trim();
    if (!/[A-Za-z0-9]/.test(text)) return;
    const k = prNorm(text), m = document.createElement('button');
    m.type = 'button'; m.className = b.className.replace(/hover:text-indigo-\d+/g, 'hover:text-rose-600') + ' pr-mic';
    m.textContent = '🎙'; m.title = '練習發音（評分並記錄最高分）'; m.setAttribute('aria-label', '練習發音');
    m.dataset.pt = text;
    m.addEventListener('click', ev => { ev.stopPropagation(); prOpen(text, b); });
    b.after(m);
    m.insertAdjacentHTML('afterend', prBadge(k));
  });
}
(function () {
  let q = 0;
  const run = () => { q = 0; try { prInject(document.getElementById('main')); } catch (e) {} };
  const start = () => {
    const m = document.getElementById('main'); if (!m) return;
    new MutationObserver(() => { if (!q) q = requestAnimationFrame(run); }).observe(m, { childList: true, subtree: true });
    run();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();

/* ---------- 練習視窗 ---------- */
function prOpen(text, src) {
  prCancel();
  try { spStop(); } catch (e) {} try { skStopAll(); } catch (e) {}
  Object.assign(PR, { text, key: prNorm(text), src: src || null, st: 'idle', final: '', interim: '', alts: [], cands: null, err: '', res: null, nb: false });
  let ov = document.getElementById('pron-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'pron-ov'; document.body.appendChild(ov); }
  prRender();
}
function prClose() {
  prCancel();
  try { speechSynthesis.cancel(); } catch (e) {} try { if (typeof dnAu !== 'undefined' && dnAu) dnAu.pause(); } catch (e) {}
  const ov = document.getElementById('pron-ov'); if (ov) ov.remove();
  prRefreshBadges();
}
function prListen() { // 聽範例：直接按原本那個 🔊（有 mp3 就播 mp3，沒有就語音合成）
  if (PR.pl) { prMineStop(); prRender(); }
  try { speechSynthesis.cancel(); } catch (e) {}
  if (PR.src && PR.src.isConnected) PR.src.click(); else speak(PR.text);
}
function prRender() {
  const ov = document.getElementById('pron-ov'); if (!ov) return;
  const rec = PR.st === 'rec', proc = PR.st === 'proc', r = PR.res, rc = (S.pron || {})[PR.key] || {}, long = prWc(PR.text) > 3;
  const warn = [];
  if (!window.isSecureContext) warn.push('麥克風需要 https 或 localhost；直接雙擊（file://）開啟時無法錄音。');
  if (!skSR()) warn.push('此瀏覽器不支援語音辨識（建議用 Chrome／Edge／Safari）。');
  const micCls = rec ? 'bg-rose-600 text-white animate-pulse' : proc ? 'bg-slate-300 dark:bg-slate-700 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 text-white';
  let res = '';
  if (r) {
    if (r.none) res = '<p class="text-sm text-rose-600 dark:text-rose-400">沒有辨識到聲音，靠近麥克風再試一次。</p>';
    else res = `<div class="flex flex-wrap items-center gap-2 mb-2"><span class="rounded-full px-3 py-1 text-sm font-bold ${skPctCls(r.pct)}">${r.pct}%</span><span class="text-sm">${skMsg(r.pct)}</span>${PR.nb ? '<span class="text-sm font-bold text-amber-600 dark:text-amber-400">🏆 新的最高分！</span>' : ''}</div>
      <p class="leading-relaxed">${skWordsH(r.words)}</p>${r.pct >= 100 ? '' : skDiffH({ heard: r.heard, diff: r.diff })}`; // 100 分不顯示「你說的」對照與紅字／括號說明，有錯才出現
    if (PR.url) res += `<div class="flex flex-wrap items-center gap-2 mt-3"><button onclick="prPlayMine()" class="${skCtl}">${PR.pl ? '⏹ 停止回放' : '▶ 聽我的錄音'}</button><span class="text-[0.6875rem] text-slate-400">錄音只暫存在這個視窗，關閉就刪除</span></div>`;
  }
  ov.innerHTML = `<div class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onclick="if(event.target===this)prClose()">
    <div class="w-full md:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-5 shadow-xl" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <div class="flex items-center justify-between gap-2 mb-3"><h3 class="font-bold">🎙 發音練習</h3>
        <span class="text-xs text-slate-500">${rc.b ? `🏆 最高 <b class="rounded px-1.5 py-0.5 ${skPctCls(rc.b)}">${rc.b}%</b> · 練習 ${rc.n} 次` : '還沒練習過'}</span>
        <button onclick="prClose()" class="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1 cursor-pointer" aria-label="關閉">×</button></div>
      <p class="${long ? 'text-lg' : 'text-3xl'} font-bold leading-relaxed break-words mb-3">${esc(PR.text)}</p>
      ${warn.length ? `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">${warn.map(w => `<p>⚠ ${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="flex flex-wrap items-center gap-2 mb-4"><button onclick="prListen()" class="${skCtl}">🔊 聽範例</button>
        <span class="text-xs text-slate-500 ml-auto">評分</span><button onclick="prLevel('loose')" class="${skSeg(skLoose())} !py-1 text-xs">寬鬆</button><button onclick="prLevel('strict')" class="${skSeg(!skLoose())} !py-1 text-xs">嚴格</button></div>
      <div class="flex flex-col items-center gap-2">
        <button onclick="prToggle()" ${proc ? 'disabled' : ''} class="h-16 w-16 rounded-full text-2xl shadow ${micCls}" aria-label="錄音">${rec ? '⏹' : '🎙'}</button>
        <p class="text-sm text-slate-500">${rec ? (long ? '🔴 錄音中…念完再點一次停止' : '🔴 請念出來…') : proc ? '⏳ 辨識中…' : '點麥克風開始（或按空白鍵）'}</p>
        <p id="pr-heard" class="min-h-[1.25rem] text-xs text-slate-500 italic break-words max-w-full">${rec ? esc((PR.final + ' ' + PR.interim).trim()) : ''}</p>
        ${PR.err ? `<p class="text-xs text-rose-600 dark:text-rose-400">${esc(PR.err)}</p>` : ''}</div>
      ${res ? `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-left">${res}</div>` : ''}
      <p class="mt-4 text-[0.6875rem] text-slate-400 text-center">快捷鍵：空白鍵＝錄音／停止，Enter＝聽範例，Esc＝關閉</p>
    </div></div>`;
}
function prLevel(v) { S.spkLevel = v; save(); if (PR.cands) prScore(false); prRender(); }

/* ---------- 錄音＋辨識 ---------- */
function prToggle() {
  if (PR.st === 'rec') { prStop(); return; }
  if (PR.st === 'proc') return;
  try { speechSynthesis.cancel(); } catch (e) {} try { if (typeof dnAu !== 'undefined' && dnAu) dnAu.pause(); } catch (e) {}
  const SRc = skSR();
  if (!SRc) { PR.err = '此瀏覽器不支援語音辨識。'; prRender(); return; }
  prCancel();
  Object.assign(PR, { err: '', final: '', interim: '', alts: [], cands: null, res: null, nb: false, restart: 0, stopping: false, st: 'rec' });
  const tk = ++PR.tk, r = new SRc(), few = prWc(PR.text) <= 3; PR.sr = r;
  r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 5;
  r.onresult = e => {
    if (r !== PR.sr) return;
    let itm = '';
    for (let k = e.resultIndex; k < e.results.length; k++) {
      const q = e.results[k];
      if (q.isFinal) { PR.restart = 0; PR.final = (PR.final + ' ' + q[0].transcript).trim(); PR.alts.push(Array.from(q).map(a => a.transcript)); }
      else itm += ' ' + q[0].transcript;
    }
    PR.interim = itm.trim();
    const el = document.getElementById('pr-heard'); if (el) el.textContent = (PR.final + ' ' + PR.interim).trim() || '…';
    if (few && PR.alts.length) prStop(); // 單字／短詞：辨識到一句就自動結束
  };
  r.onerror = e => {
    if (r !== PR.sr || e.error === 'no-speech' || e.error === 'aborted') return;
    PR.err = ({ 'not-allowed': '麥克風權限被拒絕，請在瀏覽器網址列允許使用麥克風。', 'service-not-allowed': '此瀏覽器不允許語音辨識服務。', 'audio-capture': '找不到麥克風，或被其他程式佔用。', network: '語音辨識需要網路連線。' })[e.error] || ('語音辨識錯誤（' + e.error + '），請再試一次。');
    prStop();
  };
  r.onend = () => {
    if (r !== PR.sr) return;
    if (PR.stopping) { if (PR.srEnd) PR.srEnd(); return; }
    if (PR.st === 'rec') { if (PR.restart++ < 3) { try { r.start(); return; } catch (e) {} } prStop(); }
  };
  try { r.start(); } catch (e) { PR.err = '無法啟動語音辨識，請再試一次。'; PR.st = 'idle'; PR.sr = null; prRender(); return; }
  prMediaStart(tk);
  clearTimeout(PR.timer); PR.timer = setTimeout(() => { if (PR.st === 'rec' && tk === PR.tk) prStop(); }, few ? 15000 : 60000);
  prRender();
}
/* ---------- 同步錄下自己的聲音（只存記憶體） ---------- */
async function prMediaStart(tk) {
  PR.mr = null; PR.chunks = [];
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof MediaRecorder === 'undefined') return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return; }
  if (PR.st !== 'rec' || tk !== PR.tk) { stream.getTracks().forEach(t => t.stop()); return; }
  PR.stream = stream;
  const mt = ['audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  try {
    const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
    PR.mr = mr; PR.mime = mr.mimeType || mt;
    mr.ondataavailable = e => { if (e.data && e.data.size) PR.chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (PR.stream === stream) PR.stream = null;
      if (tk === PR.tk && PR.chunks.length) {
        if (PR.url) { try { URL.revokeObjectURL(PR.url); } catch (e) {} }
        PR.url = URL.createObjectURL(new Blob(PR.chunks, { type: PR.mime }));
      }
      PR.chunks = []; PR.mr = null;
      if (PR.mrDone) PR.mrDone();
      if (tk === PR.tk && PR.st === 'idle' && PR.res) prRender(); // 辨識先結束、錄音檔稍後才好 → 補上回放鈕
    };
    mr.start();
  } catch (e) { stream.getTracks().forEach(t => t.stop()); PR.stream = null; PR.mr = null; }
}
function prMineStop() { const a = PR.au; PR.au = null; PR.pl = false; if (a) { a.onended = a.onerror = null; try { a.pause(); } catch (e) {} } }
function prMineDrop() { // 停止回放並刪掉錄音（revoke 後記憶體即釋放）
  prMineStop();
  if (PR.url) { try { URL.revokeObjectURL(PR.url); } catch (e) {} PR.url = null; }
}
function prPlayMine() {
  if (!PR.url) return;
  if (PR.pl) { prMineStop(); prRender(); return; }
  try { speechSynthesis.cancel(); } catch (e) {} try { if (typeof dnAu !== 'undefined' && dnAu) dnAu.pause(); } catch (e) {}
  const a = new Audio(PR.url); PR.au = a; PR.pl = true;
  const end = () => { if (PR.au === a) { PR.au = null; PR.pl = false; prRender(); } };
  a.onended = a.onerror = end; a.play().catch(end);
  prRender();
}
function prStop() {
  if (PR.st !== 'rec') return;
  PR.st = 'proc'; PR.stopping = true; clearTimeout(PR.timer);
  const tk = PR.tk;
  const w = new Promise(res => { PR.srEnd = res; try { PR.sr.stop(); } catch (e) { res(); } });
  const ws = [w];
  if (PR.mr && PR.mr.state !== 'inactive') ws.push(new Promise(res => { PR.mrDone = res; try { PR.mr.stop(); } catch (e) { res(); } }));
  Promise.race([Promise.all(ws), new Promise(r => setTimeout(r, 1500))]).then(() => { if (tk === PR.tk && PR.st === 'proc') prFinish(); });
  prRender();
}
function prCancel() {
  PR.tk++; clearTimeout(PR.timer); PR.stopping = true;
  const r = PR.sr; PR.sr = null;
  if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort(); } catch (e) {} }
  PR.srEnd = null; PR.st = 'idle';
  const m = PR.mr; PR.mr = null; PR.mrDone = null; PR.chunks = [];
  if (m) { m.ondataavailable = null; m.onstop = null; try { if (m.state !== 'inactive') m.stop(); } catch (e) {} }
  if (PR.stream) { PR.stream.getTracks().forEach(t => t.stop()); PR.stream = null; }
  prMineDrop(); // 換字、重錄、關閉視窗、切到背景：舊錄音一律刪掉
}
function prFinish() {
  const r = PR.sr; PR.sr = null; PR.srEnd = null; PR.st = 'idle';
  if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort(); } catch (e) {} }
  // 候選：只有一段時，辨識引擎給的前幾名候選都試，取最高分（單字常聽成同音字，第二、三名才是對的）
  let c = PR.alts.length === 1 ? PR.alts[0].slice() : [PR.final];
  if (PR.interim) c.push((PR.final + ' ' + PR.interim).trim());
  PR.cands = c.map(s => String(s).trim()).filter(Boolean);
  prScore(true); prRender();
}
function prScore(record) {
  if (!PR.cands || !PR.cands.length) { PR.res = { none: true }; return; }
  let best = null;
  PR.cands.forEach(h => { const c = skCompare([{ t: PR.text }], h); if (!best || c.pct > best.c.pct) best = { h, c }; });
  PR.res = { heard: best.h, pct: best.c.pct, words: best.c.sents[0].words, diff: best.c.diff };
  if (record) { PR.nb = prRecord(PR.key, best.c.pct); prRefreshBadges(); if (PR.nb) { try { dnToast('🏆 新的最高分 ' + best.c.pct + '%'); } catch (e) {} } }
}

/* ---------- 快捷鍵（視窗開著時） ---------- */
document.addEventListener('keydown', e => {
  if (!document.getElementById('pron-ov') || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (e.key === 'Escape') { e.preventDefault(); prClose(); }
  else if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); prToggle(); }
  else if (e.key === 'Enter') { e.preventDefault(); prListen(); }
}, true);
document.addEventListener('keyup', e => { if (document.getElementById('pron-ov') && (e.key === ' ' || e.key === 'Spacebar')) e.preventDefault(); }, true);
document.addEventListener('visibilitychange', () => { if (document.hidden && document.getElementById('pron-ov')) { prCancel(); prRender(); } });
window.addEventListener('pagehide', () => { prCancel(); });
