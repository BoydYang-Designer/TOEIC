/* pron.js — 發音練習：詳解／核心單字／生詞本／句型 裡每一個 🔊 旁邊都多一個 🎙，隨時可以練習、評分、記錄最高分
   依賴（執行時才用到）：daily.js 的 S／save／esc／find／cur／speak／spStop；notes.js 的 dnToast／dnAu；
                         speak.js 的 skCompare／skSR／skStopAll／skWordsH／skDiffH／skPctCls／skMsg／skCtl／skSeg／skLoose
   載入順序：放在 daily.js 之後（daily.html 已加）。
   做法：不改動既有每個 🔊 的產生程式，而是在畫面更新後，替每個 vplay(...)／speakPhrase(...) 按鈕補上 🎙；
         按下去開底部視窗：聽範例 → 錄音 → 辨識 → 逐字比對 → 分數。
   錄音／辨識／麥克風處理：沿用 speak.js（語音練習）的手機麥克風穩定化（skSR／skKeepGet／SkPcmRec／skReleaseAudio／skAudioSession／skLog…），介面也比照語音練習。
   回放：電腦（或手機打開「錄音檔」）時同步錄下聲音，評分後可按「聽我的錄音」用 Web Audio 回放；錄音只存在記憶體，
         關閉視窗／換字／重錄／切到背景／離開頁面時立即刪除，不會寫入 IndexedDB 或 localStorage。
   紀錄：S.pron[文字] = { b：最高分, n：練習次數, l：最近一次, t：時間 }（文字轉小寫、空白合併；同一個字不論在哪一篇都共用同一筆） */

const PR = { text: '', key: '', src: null, st: 'idle', final: '', interim: '', alts: [], cands: null, err: '', sr: null, tk: 0, restart: 0, stopping: false, srEnd: null, timer: null, wd: null, wdN: 0, everUp: false, rsT: [], fail: 0, srN: 0, t0: 0, res: null, nb: false, dbg: false,
  mr: null, stream: null, chunks: [], mime: '', mrDone: null, blob: null, ctx: null, node: null, pl: false, rel: false, relT: null, ptk: 0 }; // mr…ptk：自己的錄音（只放記憶體，關閉視窗就刪）；prep＝準備麥克風中、rel＝回放關閉中
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
  prKeepTouch();
  prCancel(); prMineDrop();
  try { spStop(); } catch (e) {} try { skStopAll(); } catch (e) {}
  Object.assign(PR, { text, key: prNorm(text), src: src || null, st: 'idle', final: '', interim: '', alts: [], cands: null, err: '', res: null, nb: false, fail: 0 });
  let ov = document.getElementById('pron-ov');
  if (!ov) { ov = document.createElement('div'); ov.id = 'pron-ov'; document.body.appendChild(ov); }
  prRender();
}
function prClose() {
  prKeepTouch(); // 關視窗後仍保留常駐麥克風一段時間，下次開視窗才不用重新取得
  prCancel(); prMineDrop(); prRelease();
  const ov = document.getElementById('pron-ov'); if (ov) ov.remove();
  prRefreshBadges();
}
/* 放掉所有會佔用音訊通道的東西（和語音練習 skReleaseAudio 同一套）。
   詳解 mp3 的 <audio>（dnAu）也要真的釋放：pause 之後移除 src 並 load()，否則 iOS／部分 Android 的麥克風會收不到聲。
   先把 onerror／onended 清掉，避免移除 src 時觸發 vplay 的「失敗就改用語音合成」。 */
function prRelease() {
  try { prMineStop(); } catch (e) {} // 先停掉詳解視窗自己的回放（走 speak.js 的 skStopPlay／skMineFree，會關掉播放用 AudioContext），再放掉其他音訊資源
  try { skReleaseAudio(); } catch (e) {}
  try {
    if (typeof dnAu !== 'undefined' && dnAu) {
      const a = dnAu; dnAu = null; a.onerror = a.onended = null;
      try { a.pause(); a.removeAttribute('src'); a.load(); } catch (e) {}
    }
  } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
}
function prListen() { // 聽範例：直接按原本那個 🔊（有 mp3 就播 mp3，沒有就語音合成）
  if (PR.st !== 'idle') return; // 錄音中不播放，免得佔住音訊通道
  if (prPlaying() || SK.mineRel) { try { dnToast('請先按 ⏹ 停止回放，等音檔關閉後再播範例'); } catch (e) {} return; }
  try { speechSynthesis.cancel(); } catch (e) {}
  try { skPlayPrep(); } catch (e) {} // 播放前的準備（iOS 切到 playback、常駐麥克風暫時靜音）
  if (PR.src && PR.src.isConnected) PR.src.click(); else speak(PR.text);
}
function prRender() {
  const ov = document.getElementById('pron-ov'); if (!ov) return;
  const rec = PR.st === 'rec', prep = PR.st === 'prep', proc = PR.st === 'proc', r = PR.res, rc = (S.pron || {})[PR.key] || {}, long = prWc(PR.text) > 3;
  const warn = [];
  if (!window.isSecureContext) warn.push('麥克風需要 https 或 localhost；直接雙擊（file://）開啟時無法錄音。');
  if (!skSR()) warn.push('此瀏覽器不支援語音辨識（建議用 Chrome／Edge／Safari）。');
  const busy = prep || proc || SK.mineRel || prPlaying(); // 回放中（含關閉中）不能錄音：和 speak.js 的 skMineBusy 一樣，要先按「停止回放」
  const micCls = rec ? 'bg-rose-600 text-white animate-pulse' : busy ? 'bg-slate-300 dark:bg-slate-700 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 text-white';
  const lbl = rec ? (long ? '🔴 錄音中…念完再點一次停止' : '🔴 請念出來…') : prep ? '⏳ 準備麥克風…' : SK.mineRel ? '⏳ 正在關閉播放音檔…完成後即可錄音' : prPlaying() ? '🔊 播放錄音中…請先按「⏹ 停止回放」，音檔關閉後才能錄音' : proc ? '⏳ 辨識中…' : '點麥克風開始（或按空白鍵）';
  let res = '';
  if (r) {
    if (r.none) res = '<p class="text-sm text-rose-600 dark:text-rose-400">沒有辨識到聲音，靠近麥克風再試一次。</p>';
    else res = `<div class="flex flex-wrap items-center gap-2 mb-2"><span class="rounded-full px-3 py-1 text-sm font-bold ${skPctCls(r.pct)}">${r.pct}%</span><span class="text-sm">${skMsg(r.pct)}</span>${PR.nb ? '<span class="text-sm font-bold text-amber-600 dark:text-amber-400">🏆 新的最高分！</span>' : ''}</div>
      <p class="leading-relaxed">${skWordsH(r.words)}</p>${r.pct >= 100 ? '' : skDiffH({ heard: r.heard, diff: r.diff })}`; // 100 分不顯示「你說的」對照與紅字／括號說明，有錯才出現
  }
  if (PR.blob) res += `<div class="flex flex-wrap items-center gap-2 mt-3"><button onclick="prPlayMine()" ${SK.mineRel ? 'disabled' : ''} class="${skCtl} ${SK.mineRel ? 'opacity-50' : ''}">${SK.mineRel ? '⏳ 關閉中…' : prPlaying() ? '⏹ 停止回放' : '▶ 聽我的錄音'}</button><span class="text-[0.6875rem] text-slate-400">錄音只暫存在這個視窗，關閉就刪除</span></div>`;
  const hot = PR.fail >= 2 || !!PR.err; // 平常是不顯眼的小字；連續沒收到聲音或出錯時變成明顯的橘色按鈕（和語音練習一樣）
  const reset = hot
    ? `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 text-center"><p class="mb-1.5">${PR.fail >= 2 ? '連續 ' + PR.fail + ' 次沒收到聲音，麥克風可能卡住了。' : '麥克風可能卡住了。'}</p>${/權限/.test(PR.err) ? skPermHelp() + '<div class="h-2"></div>' : ''}<button onclick="prReset()" class="${skCtl} !bg-amber-500 !text-white hover:!bg-amber-600">🔧 重置麥克風</button></div>`
    : `<button onclick="prReset()" class="text-xs text-slate-400 underline underline-offset-2 cursor-pointer">🔧 麥克風沒反應？按此重置</button>`;
  const mrRow = SK_MOB && skSR() ? `<div class="flex flex-wrap items-center justify-center gap-2 text-xs"><span class="text-slate-500">錄音檔（回放用）</span><button onclick="prMrSet(1)" class="${skSeg(S.spkMr === 1)} !py-1">開</button><button onclick="prMrSet(0)" class="${skSeg(S.spkMr !== 1)} !py-1">關</button><span class="text-slate-400">手機同時錄音檔可能不穩，預設關</span></div>` : '';
  const dbg = PR.dbg
    ? `<div class="mt-4 rounded-lg border border-slate-300 dark:border-slate-700 p-3"><div class="flex flex-wrap items-center gap-2 mb-2"><button onclick="skLogCopy()" class="${skCtl}">📋 複製</button><button onclick="skLogClear()" class="${skCtl}">清除</button><button onclick="prDbg()" class="${skCtl}">收起</button></div><pre id="sk-log" class="text-[0.6875rem] leading-snug whitespace-pre-wrap break-all max-h-60 overflow-y-auto text-slate-600 dark:text-slate-300">${esc(skLogText())}</pre></div>`
    : `<div class="mt-3 text-center"><button onclick="prDbg()" class="text-xs text-slate-400 underline underline-offset-2 cursor-pointer">🐞 除錯記錄</button></div>`;
  ov.innerHTML = `<div class="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50" onclick="if(event.target===this)prClose()">
    <div class="w-full md:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 p-5 shadow-xl" style="padding-bottom:max(1.25rem,env(safe-area-inset-bottom))">
      <div class="flex items-center justify-between gap-2 mb-3"><h3 class="font-bold">🎙 發音練習</h3>
        <span class="text-xs text-slate-500">${rc.b ? `🏆 最高 <b class="rounded px-1.5 py-0.5 ${skPctCls(rc.b)}">${rc.b}%</b> · 練習 ${rc.n} 次` : '還沒練習過'}</span>
        <button onclick="prClose()" class="text-slate-400 hover:text-slate-600 text-2xl leading-none px-1 cursor-pointer" aria-label="關閉">×</button></div>
      <p class="${long ? 'text-lg' : 'text-3xl'} font-bold leading-relaxed break-words mb-3">${esc(PR.text)}</p>${(() => { const ip = prIpaOf(PR.text); return ip ? `<p class="-mt-2 mb-3 text-base text-slate-500">${esc(ip)}</p>` : ''; })()}
      ${warn.length ? `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">${warn.map(w => `<p>⚠ ${esc(w)}</p>`).join('')}</div>` : ''}
      <div class="flex flex-wrap items-center gap-2 mb-3"><button onclick="prListen()" class="${skCtl}">🔊 聽範例</button>
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
function prMrSet(v) { S.spkMr = v; save(); skLog('PR 設定 錄音檔(spkMr)=' + (v ? '開' : '關')); prRender(); }

/* ================= 錄音＋語音辨識 =================
   做法完全沿用語音練習（speak.js）的「手機麥克風穩定化」，共用它的函式與設定：
   ① 手機預設只開語音辨識，不同時用 MediaRecorder／PCM 錄音檔（要回放可在視窗裡打開「錄音檔」）。
   ② 錄音前先放掉所有播放資源（prRelease），並和上一次收麥克風隔至少 prSettle 毫秒。
   ③ 辨識斷線自動用「新物件」重開、失敗會重試；6 秒內沒有 soundstart／speechstart／result 就自動恢復（看門狗）。
   ④ iPhone 用常駐麥克風（skKeepGet）：視窗開著期間重用同一條串流，播放時只暫時靜音。
   ⑤ 🔧 重置麥克風：把辨識、錄音、麥克風、AudioContext 全部關掉重來。
   除錯記錄寫進 speak.js 的 skLog，視窗最下方「🐞 除錯記錄」可展開、複製。 */
/* 常駐麥克風的保留期：iPhone 上「放掉麥克風再重新 getUserMedia」拿到的是全靜音的串流（speak.js 的實測記錄）。
   speak.js 每 2 秒檢查一次，詳解視窗一關、又不在語音練習頁，就把常駐麥克風放掉——下次再開視窗練習就會錄到全靜音。
   所以詳解視窗最後一次使用後 10 分鐘內都算「保留中」；下面包住 skKeepFree，只擋掉 speak.js 那個 2 秒檢查的情況（不在語音練習頁、詳解視窗已關、頁面可見），
   其他呼叫（切到背景、離開語音練習、重置麥克風、錄音時串流失效重取）完全照 speak.js 原本的流程放掉。不需要改 speak.js。 */
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
const prSettle = () => (typeof S.spkWait === 'number' ? S.spkWait : PR.fail ? 700 : SK_MOB ? 350 : 0);
function prToggle() {
  skLog('PR 點麥克風 st=' + PR.st);
  if (PR.st === 'rec') { prStop(); return; }
  if (PR.st === 'proc' || PR.st === 'prep') return;
  if (prPlaying() || SK.mineRel) { try { dnToast('請先按 ⏹ 停止回放，等音檔關閉後再錄音'); } catch (e) {} return; } // 同 speak.js skRecToggle：回放（含關閉中）時不接著錄音，不在同一個動作裡「關播放→開麥克風」
  const SRc = skSR();
  if (!SRc) { PR.err = '此瀏覽器不支援語音辨識。'; prRender(); return; }
  prKeepLog('錄音前'); prKeepTouch();
  skAudioSession('play-and-record');
  prRelease();
  prCancel(true);
  Object.assign(PR, { err: '', final: '', interim: '', alts: [], cands: null, res: null, nb: false, restart: 0, rsT: [], stopping: false, wdN: 0, blob: null, st: 'prep' });
  prRender();
  const tk = ++PR.tk, wait = Math.max(prSettle() - (Date.now() - (SK.lastEnd || 0)), 0);
  skLog('PR 準備錄音 等待 ' + wait + 'ms');
  if (wait) setTimeout(() => prGo(tk), wait); else prGo(tk); // 沒有要等就同步開始（保留使用者手勢，iOS 需要）
}
function prGo(tk) {
  if (tk !== PR.tk || PR.st !== 'prep') return;
  PR.st = 'rec'; PR.everUp = false; PR.stopping = false;
  const r = prSrNew(tk);
  try { r.start(); skLog('PR r.start() 成功'); prSrWatch(tk, r); }
  catch (e) { skLog('PR r.start() 丟出 ' + (e && e.name) + ' ' + (e && e.message)); PR.sr = null; PR.st = 'idle'; PR.err = '語音辨識沒有啟動成功。請按下方「🔧 重置麥克風」，再錄一次。'; prRender(); return; }
  prMediaStart(tk);
  clearTimeout(PR.timer); PR.timer = setTimeout(() => { if (PR.st === 'rec' && tk === PR.tk) prStop(); }, prWc(PR.text) <= 3 ? 15000 : 60000);
  prRender();
}
function prSrNew(tk) { // 每次（含重啟）都建新的辨識物件，比重複 start 同一個穩
  const SRc = skSR(); if (!SRc) return null;
  const r = new SRc(); PR.sr = r; PR.t0 = Date.now();
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
    catch (e) { skLog('PR 重開 start() 失敗：' + (e && e.name)); if (n < 8) prSrRestart(tk, n + 1); else { PR.err = '語音辨識沒辦法重新啟動，請按下方「🔧 重置麥克風」。'; prStop(); } }
  }, n ? 250 : 60);
}
function prSrWatch(tk, r) { // 看門狗：開始 6 秒內沒有 soundstart／speechstart／result＝麥克風沒真正收到聲音，自動恢復（最多 2 次）
  clearTimeout(PR.wd); if (PR.everUp) return;
  PR.wd = setTimeout(() => {
    if (r !== PR.sr || tk !== PR.tk || PR.st !== 'rec' || PR.stopping || PR.everUp) return;
    const n = (PR.wdN = (PR.wdN || 0) + 1);
    skLog('PR 看門狗：6 秒內沒有 soundstart／speechstart／result（第 ' + n + ' 次）');
    if (n <= 2) { prSrRecover(tk, n); return; }
    PR.fail++; PR.err = '麥克風好像沒有收到聲音。請按下方「🔧 重置麥克風」，再錄一次。'; prRender();
  }, 6000);
}
async function prSrRecover(tk, n) { // 第 1 次：放掉舊辨識、隔一下再開新的；第 2 次：先短暫開關一次麥克風（重設 iOS 音訊工作階段）再開
  const old = PR.sr; PR.sr = null; prSrOff(old);
  if (n >= 2 && !PR.stream && !SK.keepSt && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); skLog('PR 預熱麥克風 成功'); st.getTracks().forEach(t => t.stop()); }
    catch (e) { skLog('PR 預熱麥克風 失敗 ' + (e && e.name)); }
  }
  await new Promise(res => setTimeout(res, n >= 2 ? 500 : 300));
  if (tk !== PR.tk || PR.st !== 'rec' || PR.stopping) return;
  const r = prSrNew(tk);
  try { r.start(); skLog('PR 恢復 start() 成功 n=' + n); prSrWatch(tk, r); }
  catch (e) { skLog('PR 恢復 start() 失敗 ' + (e && e.name)); PR.err = '語音辨識沒有啟動成功。請按下方「🔧 重置麥克風」，再錄一次。'; prRender(); }
}
/* ---------- 同步錄下自己的聲音（只存記憶體；做法同 skMediaStart） ---------- */
async function prMediaStart(tk) {
  PR.mr = null; PR.chunks = [];
  const keep = skKeepOn(), wantMr = skUseMr();
  if (!keep && !wantMr) return; // 手機預設不同時錄音檔，避免和語音辨識搶麥克風
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) return;
  let stream;
  try {
    if (keep) stream = await skKeepGet();
    else { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); skLog('PR getUserMedia 成功'); }
  } catch (e) {
    skLog('PR getUserMedia 失敗 ' + (e && e.name) + ' ' + (e && e.message));
    PR.err = e && e.name === 'NotAllowedError' ? '麥克風權限被拒絕：請點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 允許，然後重新整理頁面。' : '取不到麥克風（可能被別的 App 佔用）。請按下方「🔧 重置麥克風」，再錄一次。';
    return;
  }
  if (PR.st !== 'rec' || tk !== PR.tk) { if (!keep) stream.getTracks().forEach(t => t.stop()); return; }
  if (!wantMr || (typeof MediaRecorder === 'undefined' && !skPcmOk())) return; // 只要常駐麥克風、不錄音檔
  if (!keep) PR.stream = stream; // 常駐的串流不放進 PR.stream（錄完不能被 stop）
  const mt = typeof MediaRecorder === 'undefined' ? '' : (['audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '');
  try {
    const mr = skPcmOk() ? new SkPcmRec(stream) : new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
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
    mr.start();
  } catch (e) { skLog('PR 建立錄音器失敗 ' + (e && (e.name || e.message))); if (!keep) stream.getTracks().forEach(t => t.stop()); PR.stream = null; PR.mr = null; }
}
/* ---------- 回放自己的錄音：用 Web Audio（不經過 <audio>，否則之後語音辨識會聽不到聲音），停止時整個 AudioContext 關掉 ---------- */
/* 回放自己的錄音：直接用 speak.js 的那一套（skPlayBlob／skStopPlay／skMineFree／SK.mineRel），不再自己開 AudioContext 和計時器。
   原本 pron 另寫了一份（自己的 AudioContext 和關閉計時器），和語音練習的釋放流程是兩套；現在兩邊走同一條路，播放、關閉、等待 350ms、切回 play-and-record 都由 speak.js 負責。
   用 SK.playing==='mine'＋SK.pm==='pr' 表示「詳解視窗正在回放」；SK.mineRel＝上一個播放檔還在關閉中。 */
const prPlaying = () => SK.playing === 'mine' && SK.pm === 'pr';
function prKeepLog(w) { // 除錯：常駐麥克風那條串流現在的狀態（回放後 track 若不是 live／被 mute，下一次錄音就會是死的）
  try { const k = SK.keepSt, t = k && k.getAudioTracks()[0]; skLog('PR ' + w + ' 常駐麥克風=' + (t ? 'readyState=' + t.readyState + ' muted=' + t.muted + ' enabled=' + t.enabled : '無') + ' ctx=' + (SK.ctx ? SK.ctx.state : '無') + ' mineRel=' + !!SK.mineRel); } catch (e) {}
}
function prMineStop() { // 停止回放（沒在回放就什麼都不做）；skStopPlay 會整個關掉播放用的 AudioContext，並進入 350ms 的「關閉中」
  if (!prPlaying()) return;
  skStopPlay(); SK.lastEnd = Date.now();
  clearTimeout(PR.relT); PR.relT = setTimeout(() => { prKeepLog('回放關閉後'); prRender(); }, 350 + 60); // 比 speak.js 的 SK_MINE_REL 多一點，確定 mineRel 已清掉再重畫
}
function prMineDrop() { prMineStop(); PR.blob = null; } // 停止回放並刪掉錄音（記憶體即釋放）
function prPlayMine() {
  if (!PR.blob || SK.mineRel) return;
  if (prPlaying()) { prMineStop(); prRender(); return; }
  prRelease(); // 先放掉詳解 mp3／語音合成（pron 才有的）
  skStopPlay();
  skPlayPrep(); // 和 skPlayMine 一樣：常駐麥克風只暫時靜音，不放掉
  const tk = SK.tk;
  SK.playing = 'mine'; SK.pm = 'pr';
  const end = () => { if (tk === SK.tk) { prMineStop(); prRender(); } }; // 播完也走完整釋放流程
  const fail = () => { if (tk !== SK.tk) return; skLog('PR 播放我的錄音 無法解碼'); try { dnToast('這支錄音無法播放，請重新錄一次'); } catch (e) {} end(); };
  skLog('PR 播放我的錄音 開始（Web Audio）');
  skPlayBlob(PR.blob, tk, () => { skLog('PR 播放我的錄音 播完'); end(); }, fail);
  prRender();
}
function prStop() {
  if (PR.st !== 'rec') return;
  skLog('PR 停止錄音');
  PR.st = 'proc'; PR.stopping = true; clearTimeout(PR.timer); clearTimeout(PR.wd);
  const tk = PR.tk, ws = [];
  if (PR.sr) ws.push(new Promise(res => { PR.srEnd = res; try { PR.sr.stop(); } catch (e) { res(); } }));
  if (PR.mr && PR.mr.state !== 'inactive') ws.push(new Promise(res => { PR.mrDone = res; try { PR.mr.stop(); } catch (e) { res(); } }));
  Promise.race([Promise.all(ws), new Promise(r => setTimeout(r, 1500))]).then(() => { if (tk === PR.tk && PR.st === 'proc') prFinish(); });
  prRender();
}
function prCancel(keepBlob) {
  const had = !!(PR.sr || PR.mr || PR.stream); if (had) SK.lastEnd = Date.now();
  PR.tk++; clearTimeout(PR.timer); clearTimeout(PR.wd); PR.stopping = true;
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
  PR.fail = heard ? 0 : PR.fail + 1; // 沒辨識到字連續 2 次 → 畫面提醒重置
  skLog('PR 完成 heard=' + heard.length + '字 blob=' + (PR.blob ? PR.blob.size + 'B' : '無'));
  // 候選：只有一段時，辨識引擎給的前幾名候選都試，取最高分（單字常聽成同音字，第二、三名才是對的）
  let c = PR.alts.length === 1 ? PR.alts[0].slice() : [PR.final];
  if (PR.interim) c.push((PR.final + ' ' + PR.interim).trim());
  PR.cands = c.map(s => String(s).trim()).filter(Boolean);
  if (!PR.cands.length && PR.err) { PR.res = null; prRender(); return; } // 出錯就只顯示錯誤，不要再多一行「沒辨識到聲音」
  prScore(true); prRender();
}
/* 🔧 重置麥克風：已錄的分數與紀錄都不會動 */
async function prReset() {
  skLog('PR 按了重置麥克風');
  PR.holdUntil = 0; prCancel(); skAudioSession('auto'); try { skKeepFree(); } catch (e) {} prRelease(); SK.lastEnd = Date.now();
  PR.fail = 0; PR.err = ''; PR.res = null; PR.final = PR.interim = ''; PR.alts = []; PR.cands = null; PR.st = 'idle';
  let msg = '已重置，請再按一次麥克風錄音';
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); }
    catch (e) {
      msg = e && e.name === 'NotAllowedError' ? '麥克風權限被拒絕：請點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 允許，然後重新整理頁面。' : '已重置，但還是取不到麥克風：請先關掉通話、錄音、語音助理等佔用麥克風的 App，必要時把這個分頁關掉重開';
      PR.err = msg;
    }
  }
  try { dnToast(msg); } catch (e) {}
  prRender();
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
