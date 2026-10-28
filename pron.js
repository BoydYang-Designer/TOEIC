/* pron.js — 發音練習（重寫版）：詳解／核心單字／生詞本／句型 裡每一個 🔊 旁邊都多一個 🎙，隨時可以練習、評分、記錄最高分
   依賴（執行時才用到）：daily.js 的 S／save／esc／find／cur／speak／spStop；notes.js 的 dnToast／dnAu；
                        speak.js 的 skLog／skSR／skKeepGet／skKeepFree／SkPcmRec／skPcmOk／skPlayBlob／skStopPlay／skReleaseAudio／skAudioSession／
                                    skCompare／skStopAll／skWordsH／skDiffH／skPctCls／skMsg／skCtl／skSeg／skLoose／skPermHelp／skLogText／skLogCopy／skLogClear
   載入順序：放在 daily.js 之後（daily.html 已加）。
   紀錄：S.pron[文字] = { b：最高分, n：練習次數, l：最近一次, t：時間 }（文字轉小寫、空白合併；同一個字不論在哪一篇都共用同一筆）

   ───────── 這一版的設計（為什麼這樣寫） ─────────
   實測記錄（iPhone、加到主畫面）：沒有聽範例時，連續錄音、回放自己的錄音都正常；
   「聽範例」之後的第一次錄音：建立錄音用 AudioContext 卡 1.1～1.2 秒、麥克風串流 live 卻全是 0（peak=0）、語音辨識也同時聽不到，
   而且同一頁之內放掉再重取、切 audioSession 都救不回來（5 次恢復 0 次成功）。
   已排除：AudioContext 沒等 close() 完成（等完再多等 900ms 一樣壞）、track.enabled=false（錄音前已改回 true）。
   目前最可疑：詳解的 vplay 會建一個帶 mp3 src 的 <audio> 元素。舊版只攔下 play()，元素本身仍然載入了 src，之後在「開始錄音那一刻」才被拆掉。
   所以這一版：
   ① 聽範例時，在 vplay 執行的那一瞬間暫時換掉 Audio 建構子與 HTMLMediaElement.src 的 setter：只記下網址，元素不載入任何東西；
      再攔下 play()，用我們自己的 Web Audio 播放。（S.prDefuse = 0 可關掉這層，S.prGate = 0 整套關掉，對照測試用）
   ② 範例播放、回放自己的錄音、錄音三者用明確的狀態分開（PR.ex／SK.playing／PR.st），任何一個沒結束完，其他兩個的按鈕都鎖住。
      不再用 setTimeout 在「點麥克風」時偷等（iOS 的語音辨識 start() 必須在使用者手勢內同步呼叫）。
   ③ 不再用 track.enabled=false 當播放時靜音（錄音器停止後本來就沒人在收音）。
   ④ 麥克風偵測到全靜音（peak=0）就立刻停下並明講「被 iOS 卡住」＋重新載入按鈕，不再自動重試（實測重試沒有一次成功，只會讓人乾等）。
   ⑤ 靜音辨識結果不再放掉常駐麥克風串流（speak.js 實測：放掉再重取＝全靜音，這是造成壞掉的路徑，不是修復的路徑）。
   ⑥ 除錯記錄新增：攔到的 <audio> 網址、建錄音器耗時、串流狀態、檢查失敗時的 track 狀態。 */

const PR = {
  text: '', key: '', src: null,
  st: 'idle',   // 錄音：idle／prep（準備中）／rec（錄音中）／proc（辨識中）
  ex: '',       // 範例播放：''／play（播放中）／settle（已停，等音訊系統放掉）
  final: '', interim: '', alts: [], cands: null, err: '', res: null, nb: false, dbg: false, dead: false, fail: 0,
  sr: null, tk: 0, restart: 0, stopping: false, srEnd: null, timer: null, wd: null, wdN: 0, everUp: false, rsT: [], srN: 0, t0: 0, keep: null,
  mr: null, stream: null, chunks: [], mime: '', mrDone: null, blob: null, mt: null, pk: 0, blk: 0, relT: null,
  exTk: 0, exEl: null, exCtx: null, exNode: null, exTts: false, exOwn: false, exT: null, gate: null, gateSkip: false, abuf: new Map(), holdUntil: 0 };
const prNorm = t => String(t == null ? '' : t).trim().toLowerCase().replace(/\s+/g, ' ');
const prWc = t => (String(t).match(/\S*[A-Za-z0-9]\S*/g) || []).length;
/* ---------- 音標：從資料裡找這個字的 ipa（核心單字、詳解、屈折變化、相關字、衍生字、多詞性、重點字詞） ---------- */
let PR_IPA = null, PR_IPA_N = -1;
function prIpaMap() { // 全部文章的 {單字(小寫): [音標…]}；資料筆數變了才重建
  const D = (typeof DATA !== 'undefined' && Array.isArray(DATA)) ? DATA : [];
  if (PR_IPA && PR_IPA_N === D.length) return PR_IPA;
  const m = new Map(), add = (w, ipa) => {
    w = prNorm(w); ipa = String(ipa || '').trim(); if (!w || !ipa) return;
    const a = m.get(w) || []; if (!a.includes(ipa)) a.push(ipa); m.set(w, a);
  };
  D.forEach(x => {
    (x.vocab || []).forEach(v => v && add(v.word, v.ipa));
    (x.extra_vocab || []).forEach(e => {
      if (!e || typeof e !== 'object') return;
      add(e.text || e.word, e.ipa);
      ['forms', 'family', 'derived', 'key_words'].forEach(k => (Array.isArray(e[k]) ? e[k] : []).forEach(o => o && typeof o === 'object' && add(o.w, o.ipa)));
      (Array.isArray(e.pos_uses) ? e.pos_uses : []).forEach(o => o && typeof o === 'object' && add(o.w || e.lemma || e.text || e.word, o.ipa));
    });
  });
  PR_IPA = m; PR_IPA_N = D.length; return m;
}
function prIpaOf(text) { // 找不到（片語、句子、還沒補音標的字）回傳空字串
  if (prWc(text) > 1) return '';
  try { return (prIpaMap().get(prNorm(text)) || []).slice(0, 3).join('　／　'); } catch (e) { return ''; }
}
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
function prMicMark(m, k) { // 詳解頁：練習過的字，麥克風位置改顯示最高分（CSS 依 data-sc／data-lv 呈現）
  const b = prBest(k);
  if (b) { m.dataset.sc = b; m.dataset.lv = b >= 85 ? 'g' : b >= 60 ? 'y' : 'r'; } else { delete m.dataset.sc; delete m.dataset.lv; }
}
/* ---------- 單字卡百分比：這個字「詳解頁」所有語音練習項目的總分 ----------
   項目＝詳解頁每個 🎙（單字、原形、詞性、多義、屈折、同字族、搭配、同義改寫、例句、重點字詞、易混淆、近義、相關字…，
   寫法與 notes.js 的 dnRenderDetail 一致；相同文字只算一項）。總分＝各項最高分加總 ÷ 全部項目數，沒練習的算 0；
   一項都沒練習過就回傳 null（不顯示）。 */
function prDetailKeys(x, v) {
  const ex = dnFindExtraAny(x, v.word), e = Object.assign({}, v, ex || {});
  e.text = v.word;
  const T = (ex && ex.type) || (/\s/.test(v.word) ? 'phrase' : 'word'), out = new Map();
  const add = t => { t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); if (/[A-Za-z0-9]/.test(t)) out.set(prNorm(t), t); };
  const arr = a => Array.isArray(a) ? a : (a ? [a] : []);
  const obj = a => arr(a).filter(o => o && typeof o === 'object');
  const exEn = o => { if (o && o.example && o.example.en) add(o.example.en); };
  add(e.text);
  if (e.en) add(e.en);
  const m = dnMarksOf(idOf(x)).find(q => dnKey(q.text) === dnKey(v.word));
  let ctx = m && m.ctx;
  if (!ctx && T !== 'sentence') { const p = String(x.passage || ''), i = p.toLowerCase().indexOf(String(e.text).toLowerCase()); if (i >= 0) ctx = dnCtxOf(p, i, i + e.text.length, e.text); }
  if (ctx && T !== 'sentence') add(ctx);
  if (e.lemma && String(e.lemma).trim().toLowerCase() !== String(e.text).trim().toLowerCase()) add(e.lemma);
  obj(e.pos_uses).forEach(o => { add(o.w || e.lemma || e.text); exEn(o); });
  obj(e.senses).forEach(o => { add(e.lemma || e.text); exEn(o); });
  obj(e.forms).forEach(o => { if (o.w) add(o.w); exEn(o); });
  obj(e.derived).forEach(o => { if (o.w) add(o.w); });
  const cols = arr(e.collocations);
  cols.forEach(c => { add(typeof c === 'string' ? c : (c && (c.phrase || c.p)) || ''); });
  arr(e.paraphrase).forEach(o => { if (o && typeof o === 'object' && o.en) add(o.en); });
  arr(e.examples).forEach(o => add(typeof o === 'string' ? o : o && o.en));
  cols.forEach(c => { if (c && typeof c === 'object' && c.example && c.example.en) add(c.example.en); });
  arr(e.key_words).forEach(o => { if (o && typeof o === 'object' && o.w) add(o.w); });
  obj(e.confusable).forEach(o => { add(o.word || o.phrase || ''); exEn(o); });
  obj(e.similar).forEach(o => { add(o.phrase || o.word || ''); exEn(o); });
  obj(e.family).forEach(o => { if (o.w) add(o.w); exEn(o); });
  return [...out.keys()];
}
function prDetailPct(qid, i) { // → { pct, done, total } 或 null（還沒練習過）
  try {
    const x = dnArt(qid), v = x && x.vocab && x.vocab[i]; if (!v) return null;
    const ks = prDetailKeys(x, v), total = ks.length; if (!total) return null;
    let sum = 0, done = 0; ks.forEach(k => { const b = prBest(k); if (b) { sum += b; done++; } });
    return done ? { pct: Math.round(sum / total), done, total } : null;
  } catch (e) { return null; }
}
const prCardBadge = (qid, i) => { // 核心單字卡右上角：詳解語音練習總分；一項都沒練習就隱藏
  const r = prDetailPct(qid, i);
  return `<span class="pr-badge pr-total ml-0.5 align-middle text-[10px] font-bold rounded px-1 py-0.5 ${r ? skPctCls(r.pct) : 'hidden'}" data-vq="${esc(qid)}" data-vi="${i}" title="${r ? `詳解語音練習總分（已練習 ${r.done}／${r.total} 項，沒練習的算 0 分）` : ''}">${r ? r.pct : ''}</span>`;
};
function prRefreshBadges() {
  document.querySelectorAll('button.pr-mic').forEach(m => prMicMark(m, prNorm(m.dataset.pt)));
  document.querySelectorAll('.pr-badge').forEach(el => {
    if (el.dataset.vq != null) { // 單字卡：詳解總分
      const r = prDetailPct(el.dataset.vq, +el.dataset.vi);
      el.className = 'pr-badge pr-total ml-0.5 align-middle text-[10px] font-bold rounded px-1 py-0.5 ' + (r ? skPctCls(r.pct) : 'hidden');
      el.textContent = r ? r.pct : ''; el.title = r ? `詳解語音練習總分（已練習 ${r.done}／${r.total} 項，沒練習的算 0 分）` : '';
      return;
    }
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
    prMicMark(m, k);
    m.insertAdjacentHTML('afterend', b.dataset.vq != null ? prCardBadge(b.dataset.vq, +b.dataset.vi) : prBadge(k)); // 核心單字卡的 🔊 帶 data-vq／data-vi：徽章顯示詳解總分
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
  prKeepTouch(); prKeepLog('開視窗');
  prCancel(); prMineDrop();
  if (PR.ex === 'play') prExFinish(true);
  try { spStop(); } catch (e) {} try { skStopAll(); } catch (e) {}
  Object.assign(PR, { text, key: prNorm(text), src: src || null, st: 'idle', final: '', interim: '', alts: [], cands: null, err: '', res: null, nb: false, fail: 0, dead: false });
  let ov = document.getElementById('pron-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'pron-ov'; document.body.appendChild(ov); }
  prRender();
}
function prClose() {
  prKeepTouch(); prKeepLog('關視窗'); // 關視窗後仍保留常駐麥克風一段時間，下次開視窗才不用重新取得
  prCancel(); prMineDrop();
  if (PR.ex === 'play') prExFinish(true);
  prRelease();
  const ov = document.getElementById('pron-ov'); if (ov) ov.remove();
  prRefreshBadges();
}
/* 錄音前放掉其他會佔用音訊通道的東西（speak.js 的 skReleaseAudio＋詳解的 <audio>＋語音合成）。
   範例播放用的 <audio> 在「聽範例」那一刻就已經處理掉（見 prGateCaught／prElDone），這裡只是保險。 */
function prRelease() {
  try { skReleaseAudio(); } catch (e) {}
  try {
    if (typeof dnAu !== 'undefined' && dnAu) {
      const a = dnAu; try { dnAu = null; } catch (e) {}
      a.onerror = a.onended = null;
      try { a.pause(); if (a.hasAttribute('src')) { a.removeAttribute('src'); a.load(); } } catch (e) {}
    }
  } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
}

/* 常駐麥克風的保留期：iPhone 上「放掉麥克風再重新 getUserMedia」拿到的是全靜音的串流（speak.js 的實測記錄）。
   speak.js 每 2 秒檢查一次，詳解視窗一關、又不在語音練習頁，就把常駐麥克風放掉——下次再開視窗練習就會錄到全靜音。
   所以詳解視窗最後一次使用後 10 分鐘內都算「保留中」；下面包住 skKeepFree，只擋掉 speak.js 那個 2 秒檢查的情況（不在語音練習頁、詳解視窗已關、頁面可見），
   其他呼叫（切到背景、離開語音練習、錄音時串流失效重取）完全照 speak.js 原本的流程放掉。不需要改 speak.js。 */
const PR_HOLD_MS = 10 * 60 * 1000;
function prKeepHold() { return (PR.holdUntil || 0) > Date.now(); }
function prKeepTouch() { PR.holdUntil = Date.now() + PR_HOLD_MS; }
(function prKeepGuard() {
  const wrap = () => {
    if (typeof skKeepFree !== 'function' || skKeepFree._pr) return !!(typeof skKeepFree === 'function');
    const orig = skKeepFree;
    skKeepFree = function () {
      if (prKeepHold() && typeof cur !== 'undefined' && cur.view !== 'speak' && !document.hidden && !document.getElementById('pron-ov')) return; // 就是 speak.js 2 秒檢查的條件
      return orig.apply(this, arguments);
    };
    skKeepFree._pr = true;
    return true;
  };
  try { if (!wrap()) window.addEventListener('load', () => { try { wrap(); } catch (e) {} }); } catch (e) {} // pron.js 比 speak.js 早載入時，等頁面載完再包
})();

const prKeepOn = () => skKeepOn() && S.prKeep !== 0; // iPhone 預設用常駐麥克風（整頁只取一次、重用同一條串流）；S.prKeep = 0 可單獨關閉
const prRecOn = () => S.prRec !== 0;                 // 同步錄下自己的聲音（供偵測麥克風是否全靜音、回放用）；S.prRec = 0＝只用語音辨識，完全不碰 getUserMedia（對照測試用）
function prKeepSet(v) { S.prKeep = v; save(); try { skKeepFree(); } catch (e) {} skLog('PR 設定 常駐麥克風=' + (v ? '開' : '關')); prRender(); }
function prRecSet(v) { S.prRec = v; save(); try { skKeepFree(); } catch (e) {} skLog('PR 設定 錄音檔=' + (v ? '開' : '關')); prRender(); }
function prKeepBrief() { try { const k = SK.keepSt, t = k && k.getAudioTracks()[0]; return t ? '麥克風 ' + t.readyState + (t.muted ? ' muted' : '') + (t.enabled ? '' : ' 暫時靜音') : '麥克風 無'; } catch (e) { return ''; } }
function prKeepLog(w) { // 除錯：常駐麥克風那條串流現在的狀態
  try { const k = SK.keepSt, t = k && k.getAudioTracks()[0]; skLog('PR ' + w + ' 常駐麥克風=' + (t ? 'readyState=' + t.readyState + ' muted=' + t.muted + ' enabled=' + t.enabled : '無') + ' ex=' + (PR.ex || '-') + ' mineRel=' + !!SK.mineRel); } catch (e) {}
}
const prShort = s => String(s || '').split('?')[0].split('/').pop().slice(-40);

/* ================= 聽範例 =================
   不讓 <audio> 元素真的載入或出聲：在「按下 🔊 的那一瞬間」暫時換掉 Audio 建構子與 src setter（元素只記網址、不載入），
   並攔下 play()，改用自己的 Web Audio 播放；約 1.5 秒內沒攔到（走語音合成）就全部還原。
   page 上任何 🔊（詳解／核心單字／生詞本／句型）都走這條路，所以主播放器（spToggle）與語音練習頁不受影響。 */
const PR_EX_SETTLE = 900; // 範例播放的 AudioContext 關閉完成後，再等這麼久才允許錄音
const PR_D = (() => { try { const P = HTMLMediaElement.prototype; return { src: Object.getOwnPropertyDescriptor(P, 'src'), cur: Object.getOwnPropertyDescriptor(P, 'currentSrc') }; } catch (e) { return {}; } })();
const prCanPlay = () => PR.st === 'idle' && PR.ex === '' && !prPlaying() && !SK.mineRel;
function prAudioForPlay() { // 播放前的音訊準備：常駐麥克風開著就完全不動它（沿用語音練習）；沒有串流時才切 playback（走喇叭、音量正常）
  if (SK.keepSt && prKeepOn()) return;
  try { skKeepFree(); } catch (e) {}
  skAudioSession('playback');
}
function prElSrc(el) { try { return el._prU || (PR_D.cur && PR_D.cur.get && PR_D.cur.get.call(el)) || (PR_D.src && PR_D.src.get && PR_D.src.get.call(el)) || ''; } catch (e) { return ''; } }
function prElDone(el) { // 讓 vplay 的按鈕「播放中」狀態復原，並把這個元素徹底放掉
  if (!el) return;
  try { el.dispatchEvent(new Event('ended')); } catch (e) {}
  try { el.onerror = el.onended = null; } catch (e) {}
  try { if (el.hasAttribute('src')) { el.removeAttribute('src'); el.load(); } } catch (e) {}
  try { if (typeof dnAu !== 'undefined' && dnAu === el) dnAu = null; } catch (e) {}
}
function prGateOff() {
  const g = PR.gate; if (!g) return;
  PR.gate = null; clearTimeout(g.t);
  g.undo.reverse().forEach(f => { try { f(); } catch (e) {} });
}
function prGateArm(tk, mode) { // mode：'play'＝攔下並用 Web Audio 播；'swallow'＝攔下並丟掉（現在不能播放時，避免真的 <audio> 出聲弄壞麥克風）
  prGateOff();
  const g = PR.gate = { tk, mode, caught: false, undo: [], t: null };
  const P = HTMLMediaElement.prototype, origPlay = P.play;
  P.play = function () {
    if (PR.gate !== g || g.caught || this._prPass) return origPlay.apply(this, arguments);
    g.caught = true;
    const el = this, src = prElSrc(el);
    prGateOff();
    prGateCaught(g, el, src);
    return Promise.resolve();
  };
  g.undo.push(() => { P.play = origPlay; });
  if (S.prDefuse !== 0 && PR_D.src && PR_D.src.configurable && PR_D.src.get && PR_D.src.set) {
    try {
      Object.defineProperty(P, 'src', { configurable: true, enumerable: PR_D.src.enumerable, get() { return this._prU !== undefined ? this._prU : PR_D.src.get.call(this); }, set(v) { this._prU = String(v); } });
      g.undo.push(() => { Object.defineProperty(P, 'src', PR_D.src); });
      if (PR_D.cur && PR_D.cur.configurable && PR_D.cur.get) {
        Object.defineProperty(P, 'currentSrc', { configurable: true, enumerable: PR_D.cur.enumerable, get() { return this._prU !== undefined ? this._prU : PR_D.cur.get.call(this); } });
        g.undo.push(() => { Object.defineProperty(P, 'currentSrc', PR_D.cur); });
      }
      const OA = window.Audio;
      window.Audio = function (u) { const a = new OA(); if (u != null) a._prU = String(u); return a; };
      window.Audio.prototype = OA.prototype;
      g.undo.push(() => { window.Audio = OA; });
    } catch (e) { skLog('PR 防載入設定失敗 ' + (e && e.message)); }
  }
  g.t = setTimeout(() => { if (PR.gate === g) { prGateOff(); prGateTimeout(g); } }, 1500);
}
function prGateCaught(g, el, src) {
  skLog('PR 攔下 <audio>.play() ' + prShort(src) + ' mode=' + g.mode + ' el.hasSrcAttr=' + (function () { try { return el.hasAttribute('src'); } catch (e) { return '?'; } })());
  if (g.mode !== 'play' || PR.ex !== 'play' || PR.exTk !== g.tk) { setTimeout(() => prElDone(el), 0); return; }
  PR.exEl = el;
  setTimeout(() => { try { if (el.hasAttribute('src')) { el.removeAttribute('src'); el.load(); } } catch (e) {} }, 0); // 防載入沒生效（例如用 setAttribute 設 src）時的補救：現在就放掉，不要等到錄音那一刻
  if (!src) { prExTts(g.tk); return; }
  prExPlayWeb(src, g.tk);
}
function prGateTimeout(g) { // 1.5 秒內 vplay 既沒呼叫 play()、也沒用語音合成：沒有東西會播放
  if (g.mode !== 'play' || PR.ex !== 'play' || PR.exTk !== g.tk || PR.exCtx || PR.exTts) return;
  skLog('PR 1.5 秒內沒有攔到播放（沒有音檔？）');
  prExFinish(true);
}
function prExBegin(fromOverlay) {
  PR.ex = 'play'; PR.exEl = null; PR.exTts = false; clearTimeout(PR.exT);
  const tk = ++PR.exTk;
  prAudioForPlay();
  if (fromOverlay) {
    if (PR.src && PR.src.isConnected) { prGateArm(tk, 'play'); PR.gateSkip = true; try { PR.src.click(); } finally { PR.gateSkip = false; } }
    else { prGateArm(tk, 'play'); try { speak(PR.text); } catch (e) { prExFinish(true); } }
  } else prGateArm(tk, 'play'); // 從頁面的 🔊 進來：接著 vplay／speakPhrase 自己的 onclick 會執行
  prRender();
}
function prExFetch(src) {
  const url = new URL(src, location.href).href;
  let p = PR.abuf.get(url);
  if (!p) {
    if (PR.abuf.size >= 12) PR.abuf.delete(PR.abuf.keys().next().value);
    p = fetch(url).then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); }).catch(e => { PR.abuf.delete(url); throw e; });
    PR.abuf.set(url, p);
  }
  return p;
}
async function prExPlayWeb(src, tk) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx; try { ctx = new AC(); try { ctx.resume(); } catch (e) {} } catch (e) { skLog('PR 範例 AudioContext 建立失敗，改用語音合成'); prExTts(tk); return; }
  PR.exCtx = ctx;
  skLog('PR 範例播放 開始（Web Audio）' + prShort(src));
  try {
    const ab = await prExFetch(src);
    const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab.slice(0), res, rej); if (p && p.then) p.then(res, rej); });
    if (tk !== PR.exTk || PR.ex !== 'play' || PR.exCtx !== ctx) return;
    const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination);
    s.onended = () => { if (tk === PR.exTk && PR.exNode === s) prExFinish(); };
    PR.exNode = s; s.start(0);
    clearTimeout(PR.exT); PR.exT = setTimeout(() => { if (tk === PR.exTk) prExFinish(); }, (buf.duration + 3) * 1000); // 保險：onended 沒來也會結束
    prRender();
  } catch (e) {
    skLog('PR 範例 Web Audio 失敗 ' + (e && (e.message || e.name)) + '，改用語音合成');
    if (tk === PR.exTk && PR.ex === 'play') prExTts(tk);
  }
}
function prExTts(tk) { // 沒有 mp3（或 Web Audio 失敗）時用語音合成念
  try {
    const u = new SpeechSynthesisUtterance(PR.text || ''); u.lang = 'en-US';
    PR.exTts = true;
    const fin = () => { if (PR.exTk === tk) prExFinish(); };
    u.onend = u.onerror = fin;
    clearTimeout(PR.exT); PR.exT = setTimeout(fin, 15000); // 保險：iOS 的 onend 偶爾不會來
    PR.exOwn = true; try { speechSynthesis.speak(u); } finally { PR.exOwn = false; }
  } catch (e) { prExFinish(true); }
  prRender();
}
function prExFinish(silent) { // 播完／按停止／被打斷：停掉聲音 → 關 AudioContext → 等 close() → 再等 PR_EX_SETTLE → 才算結束（settle 期間不能錄音、不能再聽）
  if (PR.ex !== 'play') return;
  const tk = PR.exTk, el = PR.exEl, c = PR.exCtx, n = PR.exNode, tts = PR.exTts;
  PR.exEl = PR.exCtx = PR.exNode = null; PR.exTts = false; clearTimeout(PR.exT);
  prGateOff();
  if (n) { n.onended = null; try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }
  if (tts) { try { speechSynthesis.cancel(); } catch (e) {} }
  prElDone(el);
  if (!c && !tts) { PR.ex = ''; skLog('PR 範例沒有播放'); if (!silent && document.getElementById('pron-ov')) prRender(); return; }
  PR.ex = 'settle';
  skLog('PR 範例播放結束，等待 AudioContext 關閉');
  let fin = false;
  const done = () => {
    if (fin) return; fin = true; clearTimeout(PR.exT);
    PR.exT = setTimeout(() => {
      if (tk !== PR.exTk) return;
      if (!SK.playing) skAudioSession('play-and-record');
      SK.lastEnd = Date.now(); PR.ex = ''; skLog('PR 範例播放已完整關閉');
      if (document.getElementById('pron-ov')) prRender();
    }, PR_EX_SETTLE);
  };
  if (c) { try { const p = c.close(); if (p && p.then) p.then(done, done); else setTimeout(done, 0); } catch (e) { done(); } PR.exT = setTimeout(done, 1500); }
  else done();
  if (!silent && document.getElementById('pron-ov')) prRender();
}
function prListen() { // 視窗裡的「🔊 聽範例」
  if (PR.ex === 'play') { prExFinish(); return; } // 再按一次＝停止
  if (!prCanPlay()) { try { dnToast('請先等音檔關閉（或按 ⏹ 停止），再播範例'); } catch (e) {} return; }
  if (S.prGate === 0) { // 整套關掉＝原本的 <audio> 播放（對照測試用）
    if (PR.src && PR.src.isConnected) { PR.gateSkip = true; try { PR.src.click(); } finally { PR.gateSkip = false; } } else { try { speak(PR.text); } catch (e) {} }
    return;
  }
  prExBegin(true);
}
document.addEventListener('click', e => { // capture：在 vplay／speakPhrase 的 onclick 之前先處理頁面上的 🔊
  if (PR.gateSkip || S.prGate === 0) return;
  const b = e.target && e.target.closest && e.target.closest('button[onclick^="vplay("],button[onclick^="speakPhrase("]');
  if (!b || (b.closest && b.closest('#pron-ov'))) return;
  if (typeof cur !== 'undefined' && cur.view === 'speak') return; // 語音練習頁有自己的播放流程
  if (PR.ex === 'play') { prExFinish(); prGateArm(0, 'swallow'); return; }          // 播放中再按＝停止（這次的播放丟掉）
  if (!prCanPlay()) { prGateArm(0, 'swallow'); try { dnToast('音檔還在關閉或錄音中，請稍後再播'); } catch (e) {} return; }
  prExBegin(false);
}, true);

/* 診斷：頁面上任何 <audio>／<video> 播放、暫停、結束、錯誤，以及語音合成，都寫進 🐞 記錄（附上當下常駐麥克風狀態）。
   同時負責：聽範例時 vplay 若走語音合成，要知道什麼時候念完；現在不能播放時，把 vplay 的語音合成吞掉。 */
(function prAudioProbe() {
  const lg = msg => { try { if (typeof skLog === 'function') skLog(msg); } catch (e) {} };
  try {
    ['play', 'pause', 'ended', 'error'].forEach(ev => document.addEventListener(ev, e => {
      const t = e.target; let src = ''; try { src = prShort(t.currentSrc || t.src); } catch (_) {}
      lg('頁面音訊 ' + ev + ' <' + String(t.tagName || '').toLowerCase() + '> ' + src + ' ｜' + prKeepBrief());
    }, true));
  } catch (e) {}
  try {
    const ss = window.speechSynthesis;
    if (ss && !ss._prProbe) {
      const orig = ss.speak.bind(ss);
      ss.speak = function (u) {
        lg('語音合成 speak ｜' + prKeepBrief());
        const g = PR.gate;
        if (g && !PR.exOwn && !g.caught) {
          prGateOff();
          if (g.mode !== 'play' || PR.ex !== 'play' || PR.exTk !== g.tk) return; // 現在不能播放：吞掉
          PR.exTts = true; const tk = g.tk, fin = () => { if (PR.exTk === tk) prExFinish(); };
          try { u.addEventListener('end', fin); u.addEventListener('error', fin); } catch (e) {}
          clearTimeout(PR.exT); PR.exT = setTimeout(fin, 15000);
        }
        return orig(u);
      };
      ss._prProbe = true;
    }
  } catch (e) {}
})();

/* ================= 回放自己的錄音 =================
   直接用 speak.js 的那一套（skPlayBlob／skStopPlay／skMineFree／SK.mineRel）：播放、關閉 AudioContext、等 350ms、切回 play-and-record 都由 speak.js 負責。
   用 SK.playing==='mine'＋SK.pm==='pr' 表示「詳解視窗正在回放」。實測：這條路徑播完之後再錄音是正常的。 */
const prPlaying = () => SK.playing === 'mine' && SK.pm === 'pr';
function prMineStop() { // 停止回放（沒在回放就什麼都不做）
  if (!prPlaying()) return;
  skStopPlay(); SK.lastEnd = Date.now();
  clearTimeout(PR.relT); PR.relT = setTimeout(() => { prKeepLog('回放關閉後'); prRender(); }, 350 + 60); // 比 speak.js 的 SK_MINE_REL 多一點，確定 mineRel 已清掉再重畫
}
function prMineDrop() { prMineStop(); PR.blob = null; } // 停止回放並刪掉錄音（記憶體即釋放）
function prPlayMine() {
  if (!PR.blob || SK.mineRel || PR.ex !== '' || PR.st !== 'idle') return;
  if (prPlaying()) { prMineStop(); prRender(); return; }
  prRelease();
  skStopPlay();
  prAudioForPlay();
  const tk = SK.tk;
  SK.playing = 'mine'; SK.pm = 'pr';
  const end = () => { if (tk === SK.tk) { prMineStop(); prRender(); } };
  const fail = () => { if (tk !== SK.tk) return; skLog('PR 播放我的錄音 無法解碼'); try { dnToast('這支錄音無法播放，請重新錄一次'); } catch (e) {} end(); };
  skLog('PR 播放我的錄音 開始（Web Audio）');
  skPlayBlob(PR.blob, tk, () => { skLog('PR 播放我的錄音 播完'); end(); }, fail);
  prRender();
}

function prRender() {
  const ov = document.getElementById('pron-ov'); if (!ov) return;
  const rec = PR.st === 'rec', prep = PR.st === 'prep', proc = PR.st === 'proc', r = PR.res, rc = (S.pron || {})[PR.key] || {}, long = prWc(PR.text) > 3;
  const warn = [];
  if (!window.isSecureContext) warn.push('麥克風需要 https 或 localhost；直接雙擊（file://）開啟時無法錄音。');
  if (!skSR()) warn.push('此瀏覽器不支援語音辨識（建議用 Chrome／Edge／Safari）。');
  const busy = prep || proc || SK.mineRel || prPlaying() || PR.ex !== ''; // 回放中（含關閉中）不能錄音：和 speak.js 的 skMineBusy 一樣，要先按「停止回放」
  const micCls = rec ? 'bg-rose-600 text-white animate-pulse' : busy ? 'bg-slate-300 dark:bg-slate-700 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 text-white';
  const lbl = rec ? (long ? '🔴 錄音中…念完再點一次停止' : '🔴 請念出來…') : prep ? '⏳ 準備麥克風…' : (SK.mineRel || PR.ex === 'settle') ? '⏳ 正在關閉播放音檔…完成後即可錄音' : PR.ex === 'play' ? '🔊 範例播放中…請先按「⏹ 停止」，音檔關閉後才能錄音' : prPlaying() ? '🔊 播放錄音中…請先按「⏹ 停止回放」，音檔關閉後才能錄音' : proc ? '⏳ 辨識中…' : PR.dead ? '⚠ 麥克風被系統卡住了，請看下方說明' : '點麥克風開始（或按空白鍵）';
  let res = '';
  if (r) {
    if (r.none) res = '<p class="text-sm text-rose-600 dark:text-rose-400">沒有辨識到聲音，靠近麥克風再試一次。</p>';
    else res = `<div class="flex flex-wrap items-center gap-2 mb-2"><span class="rounded-full px-3 py-1 text-sm font-bold ${skPctCls(r.pct)}">${r.pct}%</span><span class="text-sm">${skMsg(r.pct)}</span>${PR.nb ? '<span class="text-sm font-bold text-amber-600 dark:text-amber-400">🏆 新的最高分！</span>' : ''}</div>
      <p class="leading-relaxed">${skWordsH(r.words)}</p>${r.pct >= 100 ? '' : skDiffH({ heard: r.heard, diff: r.diff })}`; // 100 分不顯示「你說的」對照與紅字／括號說明，有錯才出現
  }
  if (PR.blob) res += `<div class="flex flex-wrap items-center gap-2 mt-3"><button onclick="prPlayMine()" ${SK.mineRel ? 'disabled' : ''} class="${skCtl} ${SK.mineRel ? 'opacity-50' : ''}">${SK.mineRel ? '⏳ 關閉中…' : prPlaying() ? '⏹ 停止回放' : '▶ 聽我的錄音'}</button><span class="text-[0.6875rem] text-slate-400">錄音只暫存在這個視窗，關閉就刪除</span></div>`;
  const hot = PR.dead || PR.fail >= 2 || !!PR.err; // 平常是不顯眼的小字；麥克風全靜音、連續沒收到聲音或出錯時變成明顯的橘色提示
  const reset = hot
    ? `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 text-center"><p class="mb-1.5">${PR.dead ? 'iPhone 的麥克風被系統卡住了（錄到的是全靜音），這個狀態在這個頁面裡救不回來。' : PR.fail >= 2 ? '連續 ' + PR.fail + ' 次沒收到聲音，麥克風可能卡住了。' : '麥克風可能卡住了。'}</p>${/權限/.test(PR.err) ? skPermHelp() + '<div class="h-2"></div>' : ''}<p>請按「重新載入頁面」；還是不行，請把 App 從多工畫面上滑關掉再開。</p><button onclick="location.reload()" class="${skCtl} mt-2">🔄 重新載入頁面</button></div>`
    : '';
  const mrRow = '';
  const dbg = PR.dbg
    ? `<div class="mt-4 rounded-lg border border-slate-300 dark:border-slate-700 p-3"><div class="flex flex-wrap items-center gap-2 mb-2"><button onclick="skLogCopy()" class="${skCtl}">📋 複製</button><button onclick="skLogClear()" class="${skCtl}">清除</button><button onclick="prDbg()" class="${skCtl}">收起</button></div><div class="flex flex-wrap items-center gap-2 mb-2 text-xs"><span class="text-slate-500">常駐麥克風</span><button onclick="prKeepSet(1)" class="${skSeg(prKeepOn())} !py-1">開</button><button onclick="prKeepSet(0)" class="${skSeg(!prKeepOn())} !py-1">關</button><span class="text-slate-400">開＝和語音練習一樣，整頁只開一次麥克風</span></div><div class="flex flex-wrap items-center gap-2 mb-2 text-xs"><span class="text-slate-500">錄音檔</span><button onclick="prRecSet(1)" class="${skSeg(prRecOn())} !py-1">開</button><button onclick="prRecSet(0)" class="${skSeg(!prRecOn())} !py-1">關</button><span class="text-slate-400">關＝只用語音辨識、不開 getUserMedia（沒有回放，對照測試用）</span></div><pre id="sk-log" class="text-[0.6875rem] leading-snug whitespace-pre-wrap break-all max-h-60 overflow-y-auto text-slate-600 dark:text-slate-300">${esc(skLogText())}</pre></div>`
    : `<div class="mt-3 text-center"><button onclick="prDbg()" class="text-xs text-slate-400 underline underline-offset-2 cursor-pointer">🐞 除錯記錄</button></div>`;
  ov.innerHTML = `<div class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onclick="if(event.target===this)prClose()">
    <div class="w-full md:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-5 shadow-xl" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <div class="flex items-center justify-between gap-2 mb-3"><h3 class="font-bold">🎙 發音練習</h3>
        <span class="text-xs text-slate-500">${rc.b ? `🏆 最高 <b class="rounded px-1.5 py-0.5 ${skPctCls(rc.b)}">${rc.b}%</b> · 練習 ${rc.n} 次` : '還沒練習過'}</span>
        <button onclick="prClose()" class="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1 cursor-pointer" aria-label="關閉">×</button></div>
      <p class="${long ? 'text-lg' : 'text-3xl'} font-bold leading-relaxed break-words mb-3">${esc(PR.text)}</p>${(() => { const ip = prIpaOf(PR.text); return ip ? `<p class="-mt-2 mb-3 text-base text-slate-500">${esc(ip)}</p>` : ''; })()}
      ${warn.length ? `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">${warn.map(w => `<p>⚠ ${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="flex flex-wrap items-center gap-2 mb-3"><button onclick="prListen()" ${PR.ex === 'settle' || PR.st !== 'idle' ? 'disabled' : ''} class="${skCtl} ${PR.ex === 'settle' || PR.st !== 'idle' ? 'opacity-50' : ''}">${PR.ex === 'settle' ? '⏳ 關閉中…' : PR.ex === 'play' ? '⏹ 停止' : '🔊 聽範例'}</button>
        <span class="text-xs text-slate-500 ml-auto">評分</span><button onclick="prLevel('loose')" class="${skSeg(skLoose())} !py-1 text-xs">寬鬆</button><button onclick="prLevel('strict')" class="${skSeg(!skLoose())} !py-1 text-xs">嚴格</button></div>
      <section class="sticky top-0 z-10 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-md px-3 py-2 mb-2"><div class="flex items-center gap-3">
        <button onclick="prToggle()" ${busy ? 'disabled' : ''} class="h-12 w-12 shrink-0 rounded-full text-xl shadow ${micCls}" aria-label="錄音">${rec ? '⏹' : '🎙'}</button>
        <div class="min-w-0 flex-1"><p class="text-xs text-slate-500 leading-snug">${lbl}</p>
          <p id="pr-heard" class="text-xs text-slate-500 italic break-words line-clamp-2 empty:hidden">${rec ? esc((PR.final + ' ' + PR.interim).trim()) : ''}</p></div></div></section>
      <div class="mb-3 flex flex-col items-center gap-2">${PR.err ? `<p class="text-xs text-rose-600 dark:text-rose-400 text-center">${esc(PR.err)}</p>` : ''}${reset}${mrRow}</div>
      ${res ? `<div class="mt-3 pt-4 border-t border-slate-200 dark:border-slate-800 text-left">${res}</div>` : ''}
      ${dbg}
      <p class="mt-3 text-[0.6875rem] text-slate-400 text-center">快捷鍵：空白鍵＝錄音／停止，Enter＝聽範例，Esc＝關閉</p>
    </div></div>`;
}
function prLevel(v) { S.spkLevel = v; save(); if (PR.cands) prScore(false); prRender(); }
function prDbg() { PR.dbg = !PR.dbg; prRender(); }

/* ================= 錄音＋語音辨識 =================
   做法沿用語音練習（speak.js）的「手機麥克風穩定化」：
   ① 錄音前先放掉所有播放資源（prRelease），並和上一次收麥克風隔至少 prSettle 毫秒（常駐麥克風開著時為 0）。
   ② 辨識斷線自動用「新物件」重開；6 秒內沒有 soundstart／speechstart／result 就重開辨識（最多 2 次）。
   ③ iPhone 用常駐麥克風（skKeepGet）：視窗開著期間重用同一條串流。
   ④ 開始 1.8 秒後若錄到的完全是 0（peak=0）＝串流死了，立刻停止並提示重新載入（不自動重試）。
   除錯記錄寫進 speak.js 的 skLog，視窗最下方「🐞 除錯記錄」可展開、複製。 */
const prSettle = () => (typeof S.spkWait === 'number' ? S.spkWait : PR.fail ? 700 : SK_MOB ? 350 : 0);
function prToggle() {
  skLog('PR 點麥克風 st=' + PR.st);
  if (PR.st === 'rec') { prStop(); return; }
  if (PR.st !== 'idle') return;
  if (PR.ex !== '' || prPlaying() || SK.mineRel) { try { dnToast('請先按 ⏹ 停止播放，等音檔關閉後再錄音'); } catch (e) {} return; } // 播放（含關閉中）時不接著錄音
  const SRc = skSR();
  if (!SRc) { PR.err = '此瀏覽器不支援語音辨識。'; prRender(); return; }
  prKeepLog('錄音前'); prKeepTouch();
  let freed = false;
  if (!prKeepOn() && SK.keepSt && !(typeof cur !== 'undefined' && cur.view === 'speak')) { try { skKeepFree(); freed = true; SK.lastEnd = Date.now(); } catch (e) {} }
  skAudioSession('play-and-record');
  prRelease();
  prCancel(true);
  Object.assign(PR, { err: '', dead: false, final: '', interim: '', alts: [], cands: null, res: null, nb: false, restart: 0, rsT: [], stopping: false, wdN: 0, blob: null, st: 'prep', pk: 0, blk: 0 });
  prRender();
  const tk = ++PR.tk, wait = Math.max(Math.max(prSettle(), prKeepOn() ? 0 : (freed ? 600 : 400)) - (Date.now() - (SK.lastEnd || 0)), 0);
  skLog('PR 準備錄音 等待 ' + wait + 'ms');
  if (wait) setTimeout(() => prGo(tk), wait); else prGo(tk); // 沒有要等就同步開始（保留使用者手勢，iOS 需要）
}
function prGo(tk) {
  if (tk !== PR.tk || PR.st !== 'prep') return;
  PR.st = 'rec'; PR.everUp = false; PR.stopping = false;
  const r = prSrNew(tk, true);
  try { r.start(); skLog('PR r.start() 成功'); prSrWatch(tk, r); }
  catch (e) { skLog('PR r.start() 丟出 ' + (e && e.name) + ' ' + (e && e.message)); PR.sr = null; PR.st = 'idle'; PR.err = '語音辨識沒有啟動成功。請再錄一次；還是不行請把 App 從多工畫面上滑關掉再開。'; prRender(); return; }
  prMediaStart(tk);
  clearTimeout(PR.timer); PR.timer = setTimeout(() => { if (PR.st === 'rec' && tk === PR.tk) prStop(); }, prWc(PR.text) <= 3 ? 15000 : 60000);
  prRender();
}
function prSrNew(tk, fresh) { // 每次（含重啟）都建新的辨識物件，比重複 start 同一個穩
  const SRc = skSR(); if (!SRc) return null;
  const r = (fresh && S.prReuse === 1 && PR.keep) || new SRc(); r._ended = false; PR.keep = r; PR.sr = r; PR.t0 = Date.now(); // 預設每次新建（實測：重用時第 2 次就靜音）。S.prReuse=1 才重用（對照測試用）
  r.lang = 'en-US'; r.continuous = S.spkCont !== 0; r.interimResults = true; r.maxAlternatives = 5;
  const id = (PR.srN = (PR.srN || 0) + 1), few = prWc(PR.text) <= 3;
  const ev = n => () => { skLog('PR SR#' + id + ' ' + n + ' +' + (Date.now() - PR.t0) + 'ms' + (r === PR.sr ? '' : '（舊的）')); if ((n === 'soundstart' || n === 'speechstart') && r === PR.sr) PR.everUp = true; }; // 只有 soundstart／speechstart／result 才算真的收到聲音；audiostart 只代表辨識開了
  ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'nomatch'].forEach(n => { r['on' + n] = ev(n); });
  skLog('PR SR#' + id + ' 建立');
  r.onresult = e => {
    if (r !== PR.sr) return;
    PR.everUp = true; PR.rsT = [];
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
    skLog('PR SR#' + id + ' ERROR ' + e.error + (e.message ? ' ' + e.message : '') + (r === PR.sr ? '' : '（舊的）'));
    if (r !== PR.sr || e.error === 'no-speech' || e.error === 'aborted') return;
    PR.err = ({ 'not-allowed': '麥克風權限被拒絕：請點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 允許，然後重新整理頁面。', 'service-not-allowed': '此瀏覽器不允許語音辨識服務。', 'audio-capture': '找不到麥克風，或被其他程式佔用。', network: '語音辨識需要網路連線。' })[e.error] || ('語音辨識錯誤（' + e.error + '），請再試一次。');
    prStop();
  };
  r.onend = () => {
    r._ended = true;
    skLog('PR SR#' + id + ' end st=' + PR.st + ' stopping=' + PR.stopping + (r === PR.sr ? '' : '（舊的）'));
    if (r !== PR.sr) return;
    if (PR.stopping) { if (PR.srEnd) PR.srEnd(); return; }
    if (PR.st === 'rec') { // 非使用者停止（停頓、瀏覽器自己斷線）→ 用新物件接回去，直到使用者按停止
      if (PR.interim) { PR.final = (PR.final + ' ' + PR.interim).trim(); PR.interim = ''; }
      const now = Date.now(); PR.rsT = (PR.rsT || []).filter(t => now - t < 8000); PR.rsT.push(now);
      if (PR.rsT.length <= 6) { prSrRestart(tk, 0); return; } // 8 秒內連續斷 6 次以上才放棄（代表真的壞了）
      prStop();
    }
  };
  return r;
}
function prSrOff(old) { if (old) { old.onresult = old.onend = old.onerror = old.onaudiostart = old.onsoundstart = old.onspeechstart = null; try { old.abort(); } catch (e) {} } }
function prSrRestart(tk, n) { // start 失敗（上一個還沒完全結束）就等一下再試，不默默放棄
  setTimeout(() => {
    if (tk !== PR.tk || PR.st !== 'rec' || PR.stopping) return;
    skLog('PR 自動重開辨識 n=' + n);
    prSrOff(PR.sr);
    const r = prSrNew(tk);
    try { r.start(); prSrWatch(tk, r); }
    catch (e) { skLog('PR 重開 start() 失敗：' + (e && e.name)); if (n < 8) prSrRestart(tk, n + 1); else { PR.err = '語音辨識沒辦法重新啟動，請把 App 從多工畫面上滑關掉再開。'; prStop(); } }
  }, n ? 250 : 60);
}
function prSrWatch(tk, r) { // 看門狗：開始 6 秒內沒有 soundstart／speechstart／result，就用新的辨識物件重開（最多 2 次）
  clearTimeout(PR.wd); if (PR.everUp) return;
  PR.wd = setTimeout(() => {
    if (r !== PR.sr || tk !== PR.tk || PR.st !== 'rec' || PR.stopping || PR.everUp) return;
    const n = (PR.wdN = (PR.wdN || 0) + 1);
    skLog('PR 看門狗：6 秒內沒有 soundstart／speechstart／result（第 ' + n + ' 次）');
    if (n <= 2) { prSrReopen(tk, n); return; }
    PR.fail++; PR.err = '一直沒有聽到聲音。請靠近麥克風再錄一次。'; prRender();
  }, 6000);
}
async function prSrReopen(tk, n) {
  const old = PR.sr; PR.sr = null; prSrOff(old);
  await new Promise(res => setTimeout(res, 300 * n));
  if (tk !== PR.tk || PR.st !== 'rec' || PR.stopping) return;
  const r = prSrNew(tk);
  try { r.start(); skLog('PR 重開辨識 n=' + n); prSrWatch(tk, r); }
  catch (e) { skLog('PR 重開辨識 start() 失敗 ' + (e && e.name)); PR.err = '語音辨識沒有啟動成功。請再錄一次；還是不行請把 App 從多工畫面上滑關掉再開。'; prRender(); }
}
/* ---------- 同步錄下自己的聲音（只存記憶體；做法同 skMediaStart）＋ 偵測麥克風是不是全靜音 ---------- */
async function prMediaStart(tk) {
  PR.mr = null; PR.chunks = [];
  if (!prRecOn()) return; // 只用語音辨識（S.prRec=0）：完全不碰 getUserMedia
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
  const keep = prKeepOn();
  let stream;
  try {
    if (keep) stream = await skKeepGet();
    else { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const t0 = stream.getAudioTracks()[0] || {}; skLog('PR getUserMedia 成功 track=' + t0.readyState + ' muted=' + t0.muted + ' enabled=' + t0.enabled); }
  } catch (e) {
    skLog('PR getUserMedia 失敗 ' + (e && e.name) + ' ' + (e && e.message));
    PR.err = e && e.name === 'NotAllowedError' ? '麥克風權限被拒絕：請點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 允許，然後重新整理頁面。' : '取不到麥克風（可能被別的 App 佔用）。請再錄一次；還是不行請把 App 從多工畫面上滑關掉再開。';
    return;
  }
  if (PR.st !== 'rec' || tk !== PR.tk) { if (!keep) stream.getTracks().forEach(t => t.stop()); return; }
  try { const t1 = stream.getAudioTracks()[0]; if (t1) skLog('PR 串流 enabled=' + t1.enabled + ' muted=' + t1.muted + ' rs=' + t1.readyState); } catch (e) {}
  if (typeof MediaRecorder === 'undefined' && !skPcmOk()) return;
  if (!keep) PR.stream = stream; // 常駐的串流不放進 PR.stream（錄完不能被 stop）
  const mt = typeof MediaRecorder === 'undefined' ? '' : (['audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '');
  try {
    const tc = performance.now();
    const mr = skPcmOk() ? new SkPcmRec(stream) : new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
    skLog('PR 建錄音器耗時 ' + Math.round(performance.now() - tc) + 'ms'); // 正常 <100ms；上千毫秒代表 iOS 音訊硬體還沒穩定
    PR.mr = mr; PR.mime = mr.mimeType || mt;
    mr.ondataavailable = e => { if (e.data && e.data.size) PR.chunks.push(e.data); };
    mr.onstop = () => {
      if (!keep) stream.getTracks().forEach(t => t.stop());
      if (PR.stream === stream) PR.stream = null;
      if (tk === PR.tk) PR.blob = PR.chunks.length ? new Blob(PR.chunks, { type: PR.mime }) : null;
      PR.chunks = []; PR.mr = null;
      if (PR.mrDone) PR.mrDone();
      if (tk === PR.tk && PR.st === 'idle' && PR.res) prRender(); // 辨識先結束、錄音檔稍後才好 → 補上回放鈕
    };
    PR.pk = 0; PR.blk = 0; // 量測這條串流有沒有真的收到聲音（包在 SkPcmRec 的處理函式外面，不改 speak.js）
    if (mr.proc && mr.proc.onaudioprocess) {
      const o = mr.proc.onaudioprocess;
      mr.proc.onaudioprocess = function (e) {
        try { const d = e.inputBuffer.getChannelData(0); let m = 0; for (let i = 0; i < d.length; i += 8) { const v = d[i] < 0 ? -d[i] : d[i]; if (v > m) m = v; } if (m > PR.pk) PR.pk = m; PR.blk++; } catch (x) {}
        return o.apply(this, arguments);
      };
    }
    mr.start();
    clearTimeout(PR.mt); PR.mt = setTimeout(() => prMicCheck(tk), 1800);
  } catch (e) { skLog('PR 建立錄音器失敗 ' + (e && (e.name || e.message))); if (!keep) stream.getTracks().forEach(t => t.stop()); PR.stream = null; PR.mr = null; }
}
function prMicCheck(tk) { // 真的麥克風連環境雜音都不會是精確的 0
  if (tk !== PR.tk || PR.st !== 'rec' || PR.stopping || !PR.mr || PR.mr.state === 'inactive') return;
  if (PR.blk > 0 && PR.pk > 0.0001) { skLog('PR 麥克風檢查 OK peak=' + PR.pk.toFixed(4)); return; }
  skLog('PR 麥克風檢查：沒有訊號 peak=' + PR.pk + ' blocks=' + PR.blk);
  prMicDead();
}
function prMicDead() { // 串流是 live 但全是 0：這個狀態在同一頁內救不回來（實測重試 0／5），所以不重試，直接講清楚
  prKeepLog('檢查失敗');
  PR.dead = true; PR.fail++; PR.err = ''; PR.holdUntil = 0;
  prCancel(true);                    // 停辨識、停錄音器、不留 blob
  try { skKeepFree(); } catch (e) {} // 放掉這條死掉的串流，下次手動再按會重新取
  skAudioSession('play-and-record');
  prRender();
}
function prStop() {
  if (PR.st !== 'rec') return;
  skLog('PR 停止錄音');
  PR.st = 'proc'; PR.stopping = true; clearTimeout(PR.timer); clearTimeout(PR.wd); clearTimeout(PR.mt);
  const tk = PR.tk, ws = [];
  if (PR.sr) ws.push(new Promise(res => { PR.srEnd = res; try { PR.sr.stop(); } catch (e) { res(); } }));
  if (PR.mr && PR.mr.state !== 'inactive') ws.push(new Promise(res => { PR.mrDone = res; try { PR.mr.stop(); } catch (e) { res(); } }));
  Promise.race([Promise.all(ws), new Promise(r => setTimeout(r, 1500))]).then(() => { if (tk === PR.tk && PR.st === 'proc') prFinish(); });
  prRender();
}
function prCancel(keepBlob) {
  const had = !!(PR.sr || PR.mr || PR.stream); if (had) SK.lastEnd = Date.now();
  PR.tk++; clearTimeout(PR.timer); clearTimeout(PR.wd); clearTimeout(PR.mt); PR.stopping = true;
  const r = PR.sr; PR.sr = null;
  if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort(); } catch (e) {} }
  PR.srEnd = null; PR.st = 'idle';
  const m = PR.mr; PR.mr = null; PR.mrDone = null; PR.chunks = [];
  if (m) { m.ondataavailable = null; m.onstop = null; try { if (m.state !== 'inactive') m.stop(); } catch (e) {} }
  if (PR.stream) { PR.stream.getTracks().forEach(t => t.stop()); PR.stream = null; }
  if (!keepBlob) prMineDrop(); // 換字、關閉視窗、切到背景：舊錄音一律刪掉
}
function prFinish() {
  const r = PR.sr; PR.sr = null; PR.srEnd = null; PR.st = 'idle'; SK.lastEnd = Date.now(); clearTimeout(PR.wd);
  if (r) { r.onresult = r.onend = r.onerror = null; if (!r._ended) { try { r.abort(); } catch (e) {} } } // 確實關掉辨識，釋放麥克風
  const m = PR.mr; PR.mr = null; PR.mrDone = null;
  if (m) { m.ondataavailable = null; m.onstop = null; try { if (m.state !== 'inactive') m.stop(); } catch (e) {} }
  if (PR.stream) { PR.stream.getTracks().forEach(t => t.stop()); PR.stream = null; }
  const heard = (PR.final + ' ' + PR.interim).trim();
  skLog('PR 完成 heard=' + heard.length + '字 blob=' + (PR.blob ? PR.blob.size + 'B' : '無') + ' peak=' + (PR.pk || 0).toFixed(4) + ' blocks=' + PR.blk);
  if (!heard && !PR.err && PR.blk >= 6 && PR.pk <= 0.0001) { PR.res = null; prMicDead(); return; } // 還沒到 1.8 秒檢查就按了停止，但錄到的全是 0：一樣是串流死了
  // 注意：只是「沒說話／沒辨識到」不放掉常駐麥克風（speak.js 實測：放掉再重取＝全靜音）
  PR.fail = heard ? 0 : PR.fail + 1; // 沒辨識到字連續 2 次 → 畫面提醒
  // 候選：只有一段時，辨識引擎給的前幾名候選都試，取最高分（單字常聽成同音字，第二、三名才是對的）
  let c = PR.alts.length === 1 ? PR.alts[0].slice() : [PR.final];
  if (PR.interim) c.push((PR.final + ' ' + PR.interim).trim());
  PR.cands = c.map(s => String(s).trim()).filter(Boolean);
  if (!PR.cands.length && PR.err) { PR.res = null; prRender(); return; } // 出錯就只顯示錯誤，不要再多一行「沒辨識到聲音」
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (PR.ex === 'play') prExFinish(true); if (document.getElementById('pron-ov')) { prCancel(); prRender(); } } });
window.addEventListener('pagehide', () => { try { if (PR.ex === 'play') prExFinish(true); } catch (e) {} prCancel(); });
