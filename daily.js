/* 7 大主題輪動常數 */
const THEMES = [
  '辦公室與商務溝通',
  '差旅、交通與餐飲',
  '求職、人資與職涯',
  '採購、製造與供應鏈',
  '行銷、銷售與客服',
  '財務、合約與商業管理',
  '會議、簡報與提案'
];

/* 題庫資料 */


/* 題庫資料由 daily.json 載入（生成規則見 daily.json 的 _spec，題目在 items） */
let DATA = [];
const itemsOf = j => Array.isArray(j) ? j : (j && j.items) || []; // daily.json 可為陣列，或 { _spec, items }

/* 狀態管理 */
const KEY = 'toeicCoachV2';
let S = { dark: false, ans: {}, saved: {}, gen: {} };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e){}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} };

let cur = { w: 1, d: 1, view: 'day', showTranscript: false };
const idOf = x => `w${x.week}d${x.day}`;
const AUDIO_DIR = 'audio/daily/'; // daily 的 mp3 放這個資料夾（題目有 audio 欄位時以該欄位為準）
const audioPath = x => x.audio || AUDIO_DIR + idOf(x) + '.mp3';
const audioSrc = x => audioPath(x) + (AU.idx && AU.idx.v ? '?v=' + AU.idx.v : ''); // AU / auLoad / auCopy 來自 audio.js（audio/index.json 由 audio/audio_scan.py 產生）
const dyHas = x => !!(AU.idx && AU.idx.daily && (AU.idx.daily.complete || []).includes(idOf(x)));
const find = (w, d) => DATA.find(x => x.week == w && x.day == d);
const L = 'ABCD';

/* 聲音：優先 Zoe（增強/高品質），找不到就挑分數最高的英文語音 */
const VBAD=/novelty|fred|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
const vsc=v=>{const n=v.name+' '+v.voiceURI;let s=0;if(/premium|enhanced|增強|高品質|進階|natural|online/i.test(n))s+=10;if(/google/i.test(n))s+=5;if(/^en[-_]US$/i.test(v.lang))s+=3;if(/^en[-_](IN|ZA|IE|SG|PH)$/i.test(v.lang))s-=5;if(VBAD.test(v.name))s-=50;return s};
const isTZ=v=>!!v&&/\b(Tom|Zoe)\b/i.test(v.name);
const bestVoice=()=>{try{const vs=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang)).sort((a,b)=>vsc(b)-vsc(a));return vs.find(v=>/^en[-_]US$/i.test(v.lang)&&/\bZoe\b/i.test(v.name))||vs[0]||null}catch(e){return null}};
const setVoice=u=>{const v=bestVoice();u.lang=v?v.lang:'en-US';if(v)u.voice=v};
const Sp = { hlIdx:-2, au:null, mode:'', id:null, text:'', st:'idle', offset:0, pos:0, gotB:false, t0:0, cps:0, tok:0, rate:0.9 };
const speak = text => { // 單字發音（一次性，不含控制列）
  try { spStop(); const u = new SpeechSynthesisUtterance(text); setVoice(u); u.rate=0.9; speechSynthesis.speak(u); }
  catch(e) { alert('您的瀏覽器不支援即時語音朗讀'); }
};
const spSnap = i => { while (i > 0 && !/\s/.test(Sp.text[i-1])) i--; return i; };
function spNow() {
  if (Sp.st !== 'playing' || Sp.gotB) return Sp.pos;
  return Math.min(Sp.text.length, Sp.offset + (Date.now()-Sp.t0)/1000 * (Sp.cps || 14*Sp.rate));
}
function spCps() { // 每秒朗讀字元數（有邊界事件時實測，否則估算）
  const el = (Date.now()-Sp.t0)/1000;
  if (Sp.st === 'playing' && Sp.gotB && el > 2 && Sp.pos > Sp.offset) Sp.cps = (Sp.pos-Sp.offset)/el;
  return Sp.cps || 14*Sp.rate;
}
function spRun(from) {
  try {
    speechSynthesis.cancel();
    const tok = ++Sp.tok;
    from = Math.max(0, Math.min(from, Sp.text.length));
    const u = new SpeechSynthesisUtterance(Sp.text.slice(from));
    setVoice(u); u.rate = Sp.rate;
    Sp.offset = from; Sp.pos = from; Sp.gotB = false; Sp.t0 = Date.now(); Sp.st = 'playing';
    u.onboundary = e => { if (tok === Sp.tok) { Sp.gotB = true; Sp.pos = from + e.charIndex; } };
    u.onend = () => { if (tok === Sp.tok) { Sp.st = 'idle'; Sp.pos = 0; spUI(); } };
    u.onerror = e => { if (tok === Sp.tok && e.error !== 'canceled' && e.error !== 'interrupted') { Sp.st = 'idle'; spUI(); } };
    speechSynthesis.speak(u);
  } catch(e) { alert('您的瀏覽器不支援即時語音朗讀'); Sp.st = 'idle'; }
  spUI();
}
function spAudioFail(au) { // 找不到／無法播放 mp3 → 自動改用瀏覽器語音合成
  if (Sp.au !== au) return;
  Sp.au = null; Sp.mode = 'tts'; spRun(0);
}
function spToggle(id, startAt) { // 播放／暫停／繼續；startAt = 從指定秒數開始（點句子時使用）
  if (Sp.id !== id) {
    spStop(); const x = DATA.find(d => idOf(d) === id);
    Sp.id = id; Sp.text = x.passage; Sp.cps = 0;
    const au = new Audio(audioSrc(x));
    Sp.au = au; Sp.mode = 'audio'; Sp.st = 'playing';
    if (startAt) au.currentTime = startAt;
    au.ontimeupdate = () => { if (Sp.au === au) spHl(id, au.currentTime); };
    au.onended = () => { if (Sp.au === au) { Sp.au = null; Sp.mode = ''; Sp.st = 'idle'; Sp.id = null; spClearHl(); spUI(); } };
    au.onerror = () => spAudioFail(au);
    au.play().catch(e => { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') spAudioFail(au); });
    spUI(); return;
  }
  if (Sp.mode === 'audio') {
    if (Sp.st === 'playing') { Sp.au.pause(); Sp.st = 'paused'; } else { Sp.au.play(); Sp.st = 'playing'; }
    spUI(); return;
  }
  if (Sp.st === 'playing') { spCps(); Sp.pos = spNow(); Sp.tok++; speechSynthesis.cancel(); Sp.st = 'paused'; spUI(); }
  else spRun(Sp.st === 'paused' ? Sp.pos : 0);
}
function spBack() { // 倒轉 5 秒：mp3 為精準倒轉，語音合成為估算
  if (Sp.st === 'idle') return;
  if (Sp.mode === 'audio') {
    Sp.au.currentTime = Math.max(0, Sp.au.currentTime - 5);
    if (Sp.st === 'paused') { Sp.au.play(); Sp.st = 'playing'; }
    spUI(); return;
  }
  const cps = spCps(), now = spNow();
  spRun(spSnap(Math.max(0, Math.round(now - cps*5))));
}
function spStop() {
  Sp.tok++; Sp.st = 'idle'; Sp.pos = 0; Sp.id = null; Sp.mode = ''; spClearHl();
  if (Sp.au) { Sp.au.onerror = null; Sp.au.onended = null; Sp.au.pause(); Sp.au = null; }
  try { speechSynthesis.cancel(); } catch(e) {}
  spUI();
}
function spHtml(id) {
  const mine = Sp.id === id && Sp.st !== 'idle', playing = Sp.id === id && Sp.st === 'playing';
  const b = 'rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed';
  return `<button onclick="spToggle('${id}')" class="${b}">${playing ? '⏸ 暫停' : (mine ? '▶ 繼續' : '🔊 播放語音')}</button>
    <button onclick="spBack()" ${mine ? '' : 'disabled'} class="${b}" title="倒轉 5 秒">⏪ 5秒</button>
    <button onclick="spStop()" ${mine ? '' : 'disabled'} class="${b}" title="停止">⏹</button>
    ${mine ? `<span class="text-xs text-slate-400">${Sp.mode === 'audio' ? '音檔' : '語音合成'}</span>` : ''}`;
}
function spClearHl() { Sp.hlIdx = -2; document.querySelectorAll('#passage-text .tsent.active').forEach(e => e.classList.remove('active')); }
function spHl(id, t) { // 依播放秒數標示目前句子（資料來自 daily.json 的 timing）
  const x = DATA.find(d => idOf(d) === id); if (!x || !x.timing) return;
  let idx = -1;
  x.timing.forEach((s, i) => { if (s.start <= t + 0.05) idx = i; });
  if (idx >= 0 && t > x.timing[idx].end + 1) idx = -1;
  if (idx === Sp.hlIdx) return;
  Sp.hlIdx = idx;
  document.querySelectorAll('#passage-text .tsent').forEach(el => el.classList.toggle('active', +el.dataset.i === idx));
  const el = idx >= 0 && document.querySelector(`#passage-text .tsent[data-i="${idx}"]`);
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function spSeek(id, i) { // 點文稿句子：跳到該句播放
  const x = DATA.find(d => idOf(d) === id), t = x.timing[i].start;
  if (Sp.id === id && Sp.mode === 'audio' && Sp.au) {
    Sp.au.currentTime = t;
    if (Sp.st === 'paused') { Sp.au.play(); Sp.st = 'playing'; }
    spUI();
  } else spToggle(id, t);
}
function spMini() { // 手機底部浮動播放列：捲到測驗區時仍可暫停／倒轉
  const el = document.getElementById('mini'); if (!el) return;
  if (Sp.st === 'idle' || !Sp.id) { el.innerHTML = ''; return; }
  const b = 'rounded-lg px-4 py-2.5 text-sm font-medium cursor-pointer bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300';
  el.innerHTML = `<div class="mx-3 mb-3 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur p-2 flex items-center gap-2" style="margin-bottom:max(0.75rem,env(safe-area-inset-bottom))">
    <span class="flex-1 min-w-0 truncate px-2 text-xs text-slate-500">${Sp.id.toUpperCase()} · ${Sp.mode === 'audio' ? '音檔' : '語音合成'}</span>
    <button onclick="spBack()" class="${b}">⏪ 5秒</button>
    <button onclick="spToggle(Sp.id)" class="${b}">${Sp.st === 'playing' ? '⏸' : '▶'}</button>
    <button onclick="spStop()" class="${b}">⏹</button></div>`;
}
function spUI() { const el = document.getElementById('sp-ctl'); if (el) el.innerHTML = spHtml(el.dataset.id); spMini(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) spStop(); });
window.addEventListener('pagehide', () => { try { speechSynthesis.cancel(); } catch(e) {} });

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* 多益等級標籤（資料來自 daily.json 的 level 欄位）：<650 綠、650–749 琥珀、≥750 玫瑰紅 */
function lvColor(sc) {
  return sc < 650 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
    : sc < 750 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
}
function lvBadge(x) {
  const l = x && x.level; if (!l) return '';
  return `<span class="inline-block text-xs rounded-full px-3 py-1 font-medium ${lvColor(l.score)}" title="預估難度，非官方分級">多益約 ${l.score} 分${l.cefr ? ' · ' + esc(l.cefr) : ''}</span>`;
}
const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 md:py-2 text-sm font-medium transition cursor-pointer';

function rec(x) {
  return S.ans[idOf(x)] || (S.ans[idOf(x)] = { sel: Array((x.questions || []).length).fill(null), done: false, score: 0 });
}

const isMobile = () => !!(window.matchMedia && !window.matchMedia('(min-width: 768px)').matches);
function weekDone(w) { return THEMES.filter((t, i) => { const x = find(w, i + 1); return x && S.ans[idOf(x)] && S.ans[idOf(x)].done; }).length; }

function renderSide() {
  const n = Object.keys(S.saved).length, nw = cur.nw ?? cur.w, book = cur.view === 'book';
  const line = 'border border-slate-300 dark:border-slate-700';
  // ===== 手機：首頁顯示標題列；進入內文／生詞本後顯示「← 返回」列 =====
  const label = book ? '★ 生詞本／錯題本' : cur.view === 'gen' ? `＋ 新增 W${cur.w} · D${cur.d}` : cur.view === 'audio' ? '🎧 音檔總覽' : `W${cur.w} · D${cur.d} ${THEMES[cur.d - 1]}`;
  let h = `<div class="md:hidden">` + (cur.view === 'home'
    ? `<div class="flex items-center justify-between">
        <h1 class="text-base font-bold">TOEIC Daily</h1>
        <div class="flex gap-2">
          <a href="index.html" class="${btn} ${line} !py-1.5" aria-label="回到首頁">⌂ 首頁</a>
          <button onclick="toggleAdd()" class="${btn} ${line} !py-1.5 ${addMode ? '!bg-indigo-600 !text-white !border-indigo-600' : ''}" aria-label="新增文章">＋</button>
          ${addMode ? `<button onclick="openAudio()" class="${btn} ${line} !py-1.5" aria-label="音檔總覽">🎧${AU.idx ? DATA.filter(x => !dyHas(x)).length : ''}</button>` : ''}
          <button onclick="openBook()" class="${btn} ${line} !py-1.5" aria-label="生詞本／錯題本">★ ${n}</button>
          <button onclick="toggleDark()" class="${btn} ${line} !py-1.5" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button>
        </div></div>`
    : `<div class="flex items-center gap-2">
        <button onclick="backHome()" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>
        <span class="flex-1 min-w-0 truncate text-sm font-semibold">${label}</span>
        <button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button>
      </div>`) + `</div>`;
  // ===== 桌機：完整側欄（維持原樣）=====
  h += `<div class="hidden md:block">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-lg font-bold">TOEIC Daily</h1>
    <a href="index.html" class="${btn} ${line}" aria-label="回到首頁">⌂ 首頁</a>
    <button onclick="toggleDark()" class="${btn} ${line}">${S.dark ? '☀ 淺色' : '☾ 深色'}</button>
  </div>
  <div class="grid grid-cols-4 gap-1 mb-4">
    ${Array.from({ length: Math.max(4, ...DATA.map(x => x.week)) + (addMode ? 1 : 0) }, (_, i) => i + 1).map(w => `<button onclick="setNavWeek(${w})" class="${btn} ${nw == w ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">W${w}</button>`).join('')}
  </div>
  <p class="text-xs text-slate-500 mb-2 font-medium">Week ${nw} · 7 大主題輪動</p>
  <nav class="space-y-1">`;
  THEMES.forEach((t, i) => {
    const d = i + 1, x = find(nw, d), a = x && S.ans[idOf(x)];
    const st = !x
      ? (addMode ? '<span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">＋ 新增</span>' : '<span class="text-xs text-slate-400 shrink-0">即將推出</span>')
      : a && a.done
        ? `<span class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">✓ ${Math.round(a.score / x.questions.length * 100)}%</span>`
        : '<span class="text-xs text-slate-400 shrink-0">未完成</span>';
    const on = (cur.view == 'day' || cur.view == 'gen') && cur.w == nw && cur.d == d;
    h += `<button ${x ? `onclick="go(${nw},${d})"` : addMode ? `onclick="openGen(${nw},${d})"` : 'disabled'} class="w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${on ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800'} ${x ? '' : addMode ? 'border border-dashed border-indigo-400' : 'opacity-40 cursor-not-allowed'}">
      <span class="text-sm ">D${d} ${t}</span>
      <span class="flex items-center gap-2 shrink-0">${x && x.level ? `<span class="text-[11px] font-semibold rounded px-1.5 py-0.5 ${lvColor(x.level.score)}">${x.level.score}</span>` : ''}${st}</span>
    </button>`;
  });
  h += `</nav>
  <button onclick="toggleAdd()" class="${btn} w-full mt-4 ${addMode ? 'bg-indigo-600 text-white border border-indigo-600' : line}">${addMode ? '✕ 結束新增模式' : '＋ 新增文章'}</button>
  ${addMode ? `<button onclick="openAudio()" class="${btn} w-full mt-2 ${line} ${cur.view === 'audio' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">🎧 音檔總覽（${AU.idx ? '缺 ' + DATA.filter(x => !dyHas(x)).length : '未讀到清單'}）</button>` : ''}
  ${addMode ? `<p class="text-xs text-slate-500 mt-2 leading-relaxed">${THEMES.some((t, i) => !find(nw, i + 1)) ? '點選標示「＋ 新增」的空缺日期' : `W${nw} 已全部建置，請切換其他週次`}</p>` : ''}
  <button onclick="openBook()" class="${btn} w-full mt-4 ${line} ${book ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">★ 生詞本／錯題本（${n}）</button>
  </div>`;
  side.innerHTML = h;
}

/* 手機首頁：D1–D7 垂直（左，含主題標題）× W 週次水平（可左右捲動）；點交叉格直接進入內文 */
function renderHome() {
  const NW = Math.max(4, ...DATA.map(x => x.week)) + (addMode ? 1 : 0), ws = Array.from({ length: NW }, (_, i) => i + 1);
  const last = S.last && find(S.last.w, S.last.d);
  let h = last ? `<button onclick="go(${last.week},${last.day})" class="w-full mb-4 rounded-xl px-4 py-3 text-left bg-indigo-600 text-white cursor-pointer">
      <span class="block text-xs text-indigo-100">▶ 繼續上次</span>
      <span class="block font-semibold">W${last.week} · D${last.day} ${THEMES[last.day - 1]}</span>
      <span class="block text-xs text-indigo-100 truncate">${esc(last.tag || '')}</span></button>` : '';
  h += `<div class="${card} overflow-hidden"><div class="overflow-x-auto"><table class="border-separate border-spacing-0 text-center"><thead><tr>
    <th class="sticky left-0 z-10 w-36 min-w-[9rem] bg-white dark:bg-slate-900 border-b border-r border-slate-200 dark:border-slate-800"></th>
    ${ws.map(w => `<th class="min-w-[4.5rem] px-1 py-2 border-b border-slate-200 dark:border-slate-800"><span class="block text-sm font-bold">W${w}</span><span class="block text-[11px] font-normal text-slate-500">${weekDone(w)}/7</span></th>`).join('')}
    </tr></thead><tbody>`;
  THEMES.forEach((t, i) => {
    const d = i + 1;
    h += `<tr><th class="sticky left-0 z-10 w-36 min-w-[9rem] px-3 py-2 text-left bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 ${d < 7 ? 'border-b' : ''} font-normal">
      <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">D${d}</span> <span class="text-xs leading-4">${t}</span></th>`;
    ws.forEach(w => {
      const x = find(w, d), a = x && S.ans[idOf(x)], done = a && a.done, started = a && a.sel.some(v => v !== null);
      const bd = d < 7 ? 'border-b border-slate-100 dark:border-slate-800' : '';
      if (!x) {
        h += addMode
          ? `<td class="p-1 ${bd}"><button onclick="openGen(${w},${d})" class="w-full h-12 rounded-lg border border-dashed border-indigo-400 text-indigo-600 dark:text-indigo-400 text-lg cursor-pointer">＋</button></td>`
          : `<td class="p-1 ${bd}"><div class="h-12 rounded-lg flex items-center justify-center text-slate-300 dark:text-slate-700">—</div></td>`;
        return;
      }
      const cls = done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300';
      h += `<td class="p-1 ${bd}"><button onclick="go(${w},${d})" class="w-full h-12 rounded-lg text-sm font-semibold cursor-pointer ${cls}">${done ? `✓<span class="block text-[10px] font-normal leading-3">${Math.round(a.score / x.questions.length * 100)}%</span>` : started ? '<span class="text-xs">進行中</span>' : '<span class="text-xs">開始</span>'}</button></td>`;
    });
    h += '</tr>';
  });
  main.innerHTML = h + `</tbody></table></div></div><p class="mt-3 text-xs text-slate-500 text-center">${addMode ? '點「＋」的空格，為該天產生 AI 提示詞；右上 🎧 看音檔缺失' : '點格子進入當天內容 · 左右滑動可查看更多週次'}</p>`;
}
function showHome() { cur.view = 'home'; cur.nw = cur.w; render(); window.scrollTo({ top: 0 }); }
function backHome() { if (history.state && history.state.v) history.back(); else showHome(); } // 支援手機返回鍵
window.addEventListener('popstate', () => { if (isMobile() && cur.view !== 'home') showHome(); });
window.addEventListener('resize', () => { if (isMobile() !== render.m) render(); });
function setNavWeek(w) { cur.nw = w; cur.view === 'home' ? render() : renderSide(); }
function openBook() {
  const fromHome = cur.view === 'home';
  cur.view = 'book'; render(); window.scrollTo({ top: 0 });
  if (fromHome && isMobile()) try { history.pushState({ v: 1 }, ''); } catch (e) {}
}

function renderDay() {
  const x = find(cur.w, cur.d);
  if (!x) {
    main.innerHTML = `<div class="${card} p-12 text-center text-slate-500">
      <h3 class="text-lg font-bold mb-2">此日內容尚未建置</h3>
      <p class="text-sm">請在 daily.json 新增 week:${cur.w}, day:${cur.d} 的資料。</p>
      <button onclick="openGen(${cur.w},${cur.d})" class="${btn} mt-4 bg-indigo-600 text-white">＋ 產生 AI 提示詞</button>
    </div>`;
    return;
  }

  const r = rec(x), id = idOf(x), done = r.done;
  const isListening = x.type === 'Listening';
  const dflt = defOpen(x, r);
  const enOpen = cur.enOpen !== undefined ? cur.enOpen : dflt.en;
  const zhOpen = cur.zhOpen !== undefined ? cur.zhOpen : dflt.zh;
  const vOpen = !!cur.vocabOpen, qOpen = !!cur.quizOpen; // 預設收合

  let h = `<header class="mb-6">
    <div class="flex items-center gap-2">
      <h2 class="text-xl md:text-2xl font-bold">Day ${x.day} ${THEMES[x.day-1]}</h2>
    </div>
    <span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-medium">Week ${x.week} · ${x.tag}</span>
    ${lvBadge(x) ? ` ${lvBadge(x).replace('inline-block', 'inline-block mt-2')}` : ''}
    ${x.level && x.level.why ? `<p class="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">難度：${esc(x.level.why)}（範圍 ${esc(x.level.range || '')}，為預估值）</p>` : ''}
  </header>

  ${addMode ? `<section class="${card} p-4 md:p-6 mb-5 md:mb-6"><h3 class="font-bold text-sm mb-3">🎧 音檔維護 · ${id}</h3>${dyPanel(x)}</section>` : ''}

  <!-- 短文/聽力卡片 -->
  <section class="${card} p-4 md:p-6 mb-5 md:mb-6">
    <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">${x.type}</span>
        ${isListening ? '<span class="text-xs text-indigo-600 dark:text-indigo-400">建議先聽聲音作答</span>' : ''}
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <button onclick="toggleText('en')" class="rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">${enOpen ? '▾ 英文文稿' : '▸ 英文文稿'}</button>
        <button onclick="toggleText('zh')" class="rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">${zhOpen ? '▾ 中文文稿' : '▸ 中文文稿'}</button>
        <div id="sp-ctl" data-id="${id}" class="flex items-center gap-2">${spHtml(id)}</div>
      </div>
    </div>`;

  if (!enOpen) {
    h += `<div class="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
      <p class="text-sm text-slate-500 mb-3">${isListening && !done ? '🎧 聽力練習模式中：點擊上方播放語音作答' : '英文文稿已收合'}</p>
      <button onclick="toggleText('en')" class="text-xs text-indigo-600 dark:text-indigo-400 underline">顯示英文文稿</button>
    </div>`;
  } else {
    h += `<p id="passage-text" class="whitespace-pre-line leading-relaxed text-slate-700 dark:text-slate-300 font-sans">${passageHtml(x)}</p>`;
  }

  if (zhOpen) {
    h += `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
      <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">全文繁體中文翻譯</p>
      <p class="whitespace-pre-line leading-relaxed text-sm text-slate-600 dark:text-slate-400">${esc(x.zh)}</p>
    </div>`;
  }
  h += `</section>`;

  // 核心單字
  h += `<div class="flex items-center justify-between ${vOpen ? 'mb-3' : 'mb-8'} gap-2 flex-wrap"><button onclick="toggleSec('vocab')" class="font-bold text-lg cursor-pointer">${vOpen ? '▾' : '▸'} 核心多益單字（${x.vocab.length}）</button>
  <button onclick="toggleHl()" class="${btn} ${cur.hl ? 'bg-amber-200 text-slate-900 dark:bg-amber-400/80' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}">${cur.hl ? '取消標示單字' : '🔍 在英文文稿標示單字'}</button></div>`;
  if (vOpen) h += `<div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">`;
  if (vOpen) x.vocab.forEach((v, i) => {
    const k = `v:${id}:${i}`;
    h += `<div class="${card} p-4 flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between">
          <div>
            <span class="text-base font-bold">${esc(v.word)}</span>
            <span class="text-xs text-slate-500 italic ml-1">${esc(v.pos)}</span>
            <p class="text-xs text-slate-400">${esc(v.ipa)}</p>
          </div>
          <button onclick="speak(this.dataset.w)" data-w="${esc(v.word)}" class="text-slate-400 hover:text-indigo-600 text-lg">🔊</button>
        </div>
        <p class="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">${esc(v.zh)}</p>
        <p class="text-xs mt-1 text-slate-500 dark:text-slate-400">搭配詞：${esc(v.col)}</p>
      </div>
      <button onclick="toggleSave('${k}')" class="${btn} mt-3 text-xs w-full border border-slate-200 dark:border-slate-800 ${S.saved[k] ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}">
        ${S.saved[k] ? '★ 已加入生詞本' : '☆ 收藏單字'}
      </button>
    </div>`;
  });
  if (vOpen) h += `</div>`;

  // 簡報常用句型（僅資料含 presentation_phrases 時顯示，通常為 D7 會議、簡報與提案）
  const pp = Array.isArray(x.presentation_phrases) ? x.presentation_phrases : [];
  if (pp.length) {
    const pOpen = !!cur.phrasesOpen;
    h += `<div class="flex items-center justify-between ${pOpen ? 'mb-3' : 'mb-8'} gap-2"><button onclick="toggleSec('phrases')" class="font-bold text-lg cursor-pointer">${pOpen ? '▾' : '▸'} 簡報常用句型（${pp.length}）</button></div>`;
    if (pOpen) {
      h += `<div class="grid sm:grid-cols-2 gap-3 mb-8">`;
      pp.forEach((p, i) => {
        h += `<div class="${card} p-4">
          <div class="flex items-start justify-between gap-2">
            <p class="font-bold text-sm">${esc(p.phrase)}</p>
            <button onclick="speakPhrase(${i})" class="text-slate-400 hover:text-indigo-600 text-lg shrink-0" aria-label="播放發音">🔊</button>
          </div>
          <p class="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-300">${esc(p.meaning)}</p>
          <p class="text-xs mt-1 text-slate-500 dark:text-slate-400">${esc(p.usage)}</p>
        </div>`;
      });
      h += `</div>`;
    }
  }

  // 隨堂測驗
  const answered = r.sel.filter(v => v !== null).length;
  h += `<div class="flex items-center justify-between ${qOpen ? 'mb-3' : 'mb-4'} gap-2"><button onclick="toggleSec('quiz')" class="font-bold text-lg cursor-pointer">${qOpen ? '▾' : '▸'} 隨堂測驗（${x.questions.length} 題）</button>
    <span class="text-sm text-slate-500">${done ? `得分 ${r.score} / ${x.questions.length}` : `已作答 ${answered}/${x.questions.length}`}</span></div>`;
  if (qOpen) {
  h += `<div class="space-y-4">`;
  x.questions.forEach((q, qi) => {
    const k = `q:${id}:${qi}`, s = r.sel[qi], ok = s === q.ans;
    h += `<div class="${card} p-4 md:p-5">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">Q${qi+1} · ${q.kind=='context'?'情境理解':'Part 5 單選'}</span>
      </div>
      <p class="font-medium text-slate-800 dark:text-slate-200 mb-4">${esc(q.q)}</p>
      <div class="space-y-2">`;
      
    q.opts.forEach((o, oi) => {
      let c = 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800';
      if (!done && s === oi) c = 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 ring-1 ring-indigo-500 text-indigo-700 dark:text-indigo-300';
      if (done) {
        if (oi === q.ans) c = 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-medium';
        else if (oi === s) c = 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200';
        else c = 'border-slate-200 dark:border-slate-800 opacity-50';
      }
      h += `<button ${done ? 'disabled' : `onclick="pick(${qi},${oi})"`} class="w-full text-left rounded-lg border px-4 py-3 md:py-2.5 text-sm flex items-center justify-between ${c}">
        <span>${L[oi]}. ${esc(o)}</span>
        ${done && oi === q.ans ? '<span class="text-emerald-600 font-bold">✓ 正解</span>' : ''}
        ${done && oi === s && !ok ? '<span class="text-rose-600 font-bold">✗ 你的答案</span>' : ''}
      </button>`;
    });
    h += `</div>`;

    if (done) {
      h += `<div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-sm">
        <p class="font-semibold mb-2 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
          ${ok ? '🎉 答對了！' : '❌ 答錯了，正確答案是 (' + L[q.ans] + ')'}
        </p>
        <div class="space-y-1 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg">
          ${q.why.map((w, wi) => `<p class="${wi === q.ans ? 'font-semibold text-slate-800 dark:text-slate-200' : ''}"><b>${L[wi]}:</b>${esc(w)}</p>`).join('')}
        </div>
        <button onclick="toggleSave('${k}')" class="${btn} mt-3 text-xs border border-slate-200 dark:border-slate-800 ${S.saved[k] ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : ''}">
          ${S.saved[k] ? '★ 已收錄至錯題本' : '☆ 收藏至錯題本'}
        </button>
      </div>`;
    }
    h += `</div>`;
  });
  h += `</div>`;

  // 底部控制按鈕
  h += `<div class="mt-8 flex items-center gap-4">`;
  if (!done) {
    const answeredCount = r.sel.filter(v => v !== null).length;
    h += `<button onclick="submit()" ${answeredCount < x.questions.length ? 'disabled' : ''} class="${btn} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
      提交答案 (${answeredCount}/${x.questions.length})
    </button>`;
  } else {
    h += `<div class="${card} px-5 py-2.5 font-bold text-sm">
      本日得分：<span class="${r.score / x.questions.length >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}">${r.score} / ${x.questions.length}</span>（${Math.round(r.score / x.questions.length * 100)}%）
    </div>
    <button onclick="retry()" class="${btn} border border-slate-300 dark:border-slate-700">重做本日</button>`;
  }
  h += `</div>`;
  }
  main.innerHTML = h + `<button onclick="backHome()" class="${btn} md:hidden w-full mt-6 border border-slate-300 dark:border-slate-700">← 返回 W${x.week} 選擇其他天</button>`;
}

function renderBook() {
  const ks = Object.keys(S.saved);
  let v = '', q = '';
  
  ks.forEach(k => {
    const [type, id, idx] = k.split(':');
    const x = DATA.find(d => idOf(d) === id);
    if (!x) return;
    const rm = `<button onclick="toggleSave('${k}')" class="text-xs text-rose-500 hover:underline">移除</button>`;
    
    if (type === 'v') {
      const w = x.vocab[idx];
      v += `<div class="${card} p-4 flex justify-between items-start">
        <div>
          <div class="flex items-center gap-2">
            <b class="text-base">${esc(w.word)}</b>
            <span class="text-xs text-slate-400">${esc(w.pos)} ${esc(w.ipa)}</span>
            <button onclick="speak(this.dataset.w)" data-w="${esc(w.word)}" class="text-sm">🔊</button>
          </div>
          <p class="text-sm font-medium mt-1">${esc(w.zh)}</p>
          <p class="text-xs text-slate-500 mt-1">搭配詞：${esc(w.col)}</p>
        </div>
        ${rm}
      </div>`;
    } else {
      const z = x.questions[idx];
      q += `<div class="${card} p-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs text-indigo-500 font-medium">Week ${x.week} Day ${x.day} · ${THEMES[x.day-1]}</span>
          ${rm}
        </div>
        <p class="font-medium text-sm my-1">${esc(z.q)}</p>
        <p class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">正解 (${L[z.ans]}): ${esc(z.opts[z.ans])}</p>
        <p class="text-xs text-slate-500 mt-1">${esc(z.why[z.ans])}</p>
      </div>`;
    }
  });

  main.innerHTML = `
    <h2 class="text-xl md:text-2xl font-bold mb-4">生詞本與錯題本</h2>
    <div class="grid md:grid-cols-2 gap-6">
      <div>
        <h3 class="font-bold text-base mb-3 flex items-center gap-2">
          <span>📖 生詞收藏</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">${ks.filter(k=>k.startsWith('v:')).length}</span>
        </h3>
        <div class="space-y-3">${v || '<p class="text-xs text-slate-400">目前沒有收藏任何生詞。</p>'}</div>
      </div>
      <div>
        <h3 class="font-bold text-base mb-3 flex items-center gap-2">
          <span>🎯 錯題記錄</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">${ks.filter(k=>k.startsWith('q:')).length}</span>
        </h3>
        <div class="space-y-3">${q || '<p class="text-xs text-slate-400">目前沒有收藏任何錯題。</p>'}</div>
      </div>
    </div>`;
}

function defOpen(x, r) { // 預設：英文／中文文稿、核心單字、隨堂測驗皆收合
  const done = !!(r && r.done);
  return { en: false, zh: false };
}
function toggleText(k) { // k = 'en' | 'zh'
  const x = find(cur.w, cur.d), d = defOpen(x, S.ans[idOf(x)]), key = k + 'Open';
  cur[key] = !(cur[key] !== undefined ? cur[key] : d[k]); render();
}
function speakPhrase(i) { // 句型發音（省略號不念）
  const x = find(cur.w, cur.d), p = x && x.presentation_phrases && x.presentation_phrases[i];
  if (p) speak(p.phrase.replace(/\.{2,}|…/g, ' '));
}
function toggleSec(k) { cur[k + 'Open'] = !cur[k + 'Open']; render(); } // k = 'vocab' | 'phrases' | 'quiz'
function toggleHl() { cur.hl = !cur.hl; if (cur.hl) cur.enOpen = true; render(); }
function passageHtml(x) { // 英文文稿：核心單字標示 + 依 timing 切成可點擊、可高亮的句子
  let re = null;
  if (cur.hl) {
    const ws = x.vocab.map(v => v.word.trim()).filter(Boolean)
      .map(w => { const e = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return /\s/.test(w) ? e : e.replace(/e$/i, ''); })
      .sort((a, b) => b.length - a.length);
    if (ws.length) re = new RegExp('\\b(' + ws.join('|') + ')[a-z]*', 'gi');
  }
  const chunk = str => { const t = esc(str); return re ? t.replace(re, m => `<mark class="rounded px-1 bg-amber-200 text-slate-900 dark:bg-amber-400/80">${m}</mark>`) : t; };
  const tm = x.timing, p = x.passage;
  const ok = Array.isArray(tm) && tm.length && tm.every((t, i) => t.from < t.to && t.to <= p.length && (i === 0 || t.from >= tm[i-1].to));
  if (!ok) return chunk(p);
  let out = '', pos = 0;
  tm.forEach((t, i) => {
    out += chunk(p.slice(pos, t.from)) + `<span class="tsent" data-i="${i}" onclick="spSeek('${idOf(x)}',${i})">${chunk(p.slice(t.from, t.to))}</span>`;
    pos = t.to;
  });
  return out + chunk(p.slice(pos));
}

/* ===== 新增文章：產生檔名與給 AI 的提示詞 ===== */
let addMode = false; // 「＋ 新增文章」模式：空缺日期變成可點選
const cefrOf = s => s < 575 ? 'A2+' : s < 625 ? 'B1' : s < 675 ? 'B1+' : s < 775 ? 'B2' : s < 825 ? 'B2+' : 'C1';
const clampSc = v => Math.max(400, Math.min(990, Math.round(v / 5) * 5));
function toggleAdd() { addMode = !addMode; if (!addMode && cur.view === 'audio') cur.view = isMobile() ? 'home' : 'day'; render(); }
function openGen(w, d) {
  const fromHome = cur.view === 'home';
  cur = { w, d, nw: w, view: 'gen' };
  render();
  if (fromHome && isMobile()) try { history.pushState({ v: 1 }, ''); } catch (e) {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function genRefs(w, d) { // 同週最近一篇較早／較晚、已存在的文章
  let prev = null, next = null;
  for (let k = d - 1; k >= 1 && !prev; k--) { const x = find(w, k); if (x && x.level) prev = x; }
  for (let k = d + 1; k <= 7 && !next; k++) { const x = find(w, k); if (x && x.level) next = x; }
  return { prev, next };
}
function genEff(w, d) { // 該篇的有效分數：已建置者用實際分數 → 已手動設定者 → 否則用建議值
  const x = find(w, d); if (x && x.level) return x.level.score;
  const g = S.gen && S.gen[`w${w}d${d}`]; if (g && g.score != null) return g.score;
  return genSuggest(w, d).score;
}
function genSuggest(w, d) { // W2 以後：上一週同一天 + 25；W1 沒有上週：從 600 起、同週逐日上升（D7 約 +100，且至少比前一篇高 10）
  if (w > 1) return { score: clampSc(genEff(w - 1, d) + 25), kind: 'week' };
  const f = 600 + Math.round((d - 1) * 100 / 6 / 10) * 10, { prev } = genRefs(w, d);
  const min = prev ? prev.level.score + 10 * (d - prev.day) : 0;
  return { score: clampSc(Math.max(f, min)), kind: 'day', raised: min > f };
}
function genLater(w, d) { // 較晚的週、同一天已建置的最近一篇
  const mx = Math.max(4, ...DATA.map(x => x.week));
  for (let k = w + 1; k <= mx; k++) { const x = find(k, d); if (x && x.level) return x; }
  return null;
}
function genG() {
  const id = `w${cur.w}d${cur.d}`, g = (S.gen && S.gen[id]) || {}, sug = genSuggest(cur.w, cur.d);
  return { id, sug, score: g.score != null ? g.score : sug.score, manual: g.score != null && g.score !== sug.score, type: g.type || 'auto', note: g.note || '' };
}
function genSet(k, v) {
  S.gen = S.gen || {}; const g = S.gen[`w${cur.w}d${cur.d}`] = S.gen[`w${cur.w}d${cur.d}`] || {};
  if (v == null || v === '') delete g[k]; else g[k] = v;
  save();
}
function genStep(n) { genSet('score', clampSc(genG().score + n)); render(); }
function genInput(v) { const n = parseFloat(v); if (isFinite(n)) genSet('score', clampSc(n)); render(); }
function genReset() { genSet('score', null); render(); }
function genType(t) { genSet('type', t === 'auto' ? null : t); render(); }
function genNote(v) { genSet('note', v.trim() ? v : null); const el = document.getElementById('gen-prompt'); if (el) el.value = genPrompt(); }
function genLen(s) { const t = Math.max(0, Math.min(1, (s - 600) / 250)); return t < 0.34 ? '偏短' : t < 0.67 ? '中等' : '偏長'; }
function genPrompt() {
  const g = genG(), w = cur.w, d = cur.d, s = g.score, { prev, next } = genRefs(w, d), c = cefrOf(s);
  const typ = g.type === 'auto' ? '由你依主題與 _spec 自行決定（Reading 或 Listening）' : g.type;
  const L = [];
  L.push(`請依我提供的 daily.json（內含 _spec 規格與既有 items）生成 ${g.id}。`, '');
  L.push('【基本資訊】', `・Week ${w}、Day ${d}（主題：${THEMES[d - 1]}）`, `・type：${typ}`, '');
  L.push('【難度】已指定難度，請直接生成，不需要再詢問難度。', `・目標：多益約 ${s} 分（CEFR ${c}）。`);
  L.push(`・level.score 填 ${s}、range 填 "${s - 50}-${s + 50}"、cefr 填 "${c}"` + (s % 50 ? '（本次分數不是 50 的倍數，優先於 _spec 中「50 的倍數」的規定）。' : '。'));
  if (w > 1) {
    const pe = genEff(w - 1, d), ex = !!(find(w - 1, d) && find(w - 1, d).level), df = s - pe;
    L.push(`・上一週同一天的 w${w - 1}d${d} ${ex ? '為' : '預估約'} ${pe} 分；` + (df > 0 ? `本篇請比它難約 ${df} 分（句子更長或更複雜、資訊點更多、干擾項更接近正解）。` : df === 0 ? '本篇難度與它相當。' : `本篇可比它簡單約 ${-df} 分。`));
  } else {
    if (prev) L.push(`・同週較早的 w${w}d${prev.day} 約 ${prev.level.score} 分；本篇請比它稍難一些（句子更長或更複雜、資訊點更多、干擾項更接近正解），但差距不要過大。`);
    if (next) L.push(`・同週較晚的 w${w}d${next.day} 已有 ${next.level.score} 分；本篇不要比它更難。`);
  }
  const lt = genLater(w, d); if (lt) L.push(`・較晚的 w${lt.week}d${lt.day} 已有 ${lt.level.score} 分；本篇不要比它更難。`);
  L.push('・調整難度請主要靠句型（複合句、被動、分詞構句）、字彙的抽象程度、需整合的資訊量與干擾項；字數只是次要因素。', '');
  L.push(`【長度】在 _spec 的 passage_length 範圍內取「${genLen(s)}」。`, '');
  if (g.note.trim()) L.push('【補充要求】', g.note.trim(), '');
  L.push('【輸出】', '・只輸出 JSON，放在單一 json 程式碼區塊內，單篇輸出單一物件；格式與自我檢查依 _spec 的 how_to_use.output 與 rules.self_check。', '・不要輸出整份 daily.json、不要輸出 timing 欄位；tag、情境與 vocab 單字不得與既有 items 重複。');
  return L.join('\n');
}
/* ===== 音檔維護（沿用 audio.js 的 AU／auCopy；daily 是整篇一個 mp3，所以每篇只有一個檔） ===== */
function dyPanel(x) {
  const id = idOf(x), path = audioPath(x), fn = path.split('/').pop(), has = dyHas(x), pass = String(x.passage || '');
  const sb = `${btn} border border-slate-300 dark:border-slate-700 !py-0.5 !px-2 text-xs shrink-0`;
  const cp = (t, label) => `<button onclick="auCopy(this.dataset.t)" data-t="${esc(t)}" class="${sb}">${label}</button>`;
  const lines = pass.split(/\n+/).map(t => t.trim()).filter(Boolean);
  return `<div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><p class="text-xs font-bold">🔊 音檔 ${has ? '1/1（完整，播放用 mp3）' : '0/1（缺，播放改用機器發音）'}${AU.idx ? '' : ' · 尚未讀到 audio/index.json'}</p>${has ? '' : cp(fn + ' | ' + pass, '複製缺的（檔名 | 全文）')}</div>
    <div class="flex items-center gap-2 text-xs py-0.5"><span class="${has ? 'text-emerald-600' : 'text-rose-500'}">${has ? '✔' : '✖'}</span><code class="shrink-0">${esc(fn)}</code><span class="truncate flex-1 text-slate-500">${esc(lines[0] || '')}</span>${cp(fn, '檔名')}${cp(path, '路徑')}${cp(pass, '全文')}</div>
    <p class="text-[11px] text-slate-400 mt-1">放到 ${esc(path.slice(0, path.lastIndexOf('/') + 1))}，再執行 audio/audio_scan.py 並重新整理本頁。</p>
    <details class="mt-2"><summary class="text-xs cursor-pointer text-slate-500">分段複製（${lines.length} 段）</summary>${lines.map(t => `<div class="flex items-center gap-2 text-xs py-0.5"><span class="truncate flex-1 text-slate-500">${esc(t)}</span>${cp(t, '句子')}</div>`).join('')}</details></div>`;
}
const dyHead = '音檔總覽';
function openAudio() {
  const fromHome = cur.view === 'home';
  cur.view = 'audio'; render(); window.scrollTo({ top: 0 });
  if (fromHome && isMobile()) try { history.pushState({ v: 1 }, ''); } catch (e) {}
}
function toggleAudMiss() { cur.audMiss = !cur.audMiss; render(); }
function renderAudioAdmin() {
  const xs = [...DATA].sort((a, b) => a.week - b.week || a.day - b.day), miss = xs.filter(x => !dyHas(x)), list = cur.audMiss ? miss : xs;
  const orph = (AU.idx && AU.idx.daily && AU.idx.daily.orphans) || [];
  const sb = `${btn} border border-slate-300 dark:border-slate-700 !py-1.5 text-xs`;
  let h = `<header class="mb-5"><h2 class="text-xl md:text-2xl font-bold">🎧 Daily ${dyHead}</h2>
    <p class="mt-2 text-sm">文章 <b>${xs.length}</b> 篇　<span class="text-emerald-600 dark:text-emerald-400">有音檔 <b>${xs.length - miss.length}</b></span>　<span class="${miss.length ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}">缺音檔 <b>${miss.length}</b></span>${AU.idx ? '' : '　<span class="text-amber-600 dark:text-amber-400 text-xs">尚未讀到 audio/index.json（先執行 audio/audio_scan.py；雙擊 file:// 開啟也讀不到）</span>'}</p>
    <div class="flex flex-wrap gap-2 mt-3"><button onclick="toggleAudMiss()" class="${btn} !py-1.5 text-xs ${cur.audMiss ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">只看缺的（${miss.length}）</button>${miss.length ? `<button onclick="auCopy(this.dataset.t)" data-t="${esc(miss.map(x => '【' + audioPath(x).split('/').pop() + '】\n' + String(x.passage || '')).join('\n\n'))}" class="${sb}">複製缺的（檔名＋全文）</button>` : ''}</div>
    <p class="text-xs text-slate-500 mt-2">mp3 放 audio/daily/，檔名 w{週}d{天}.mp3；放好後執行 audio/audio_scan.py 並重新整理。</p></header>`;
  if (orph.length) h += `<div class="${card} p-3 mb-4 text-xs text-amber-600 dark:text-amber-400">⚠ audio/daily 內有不屬於任何文章的檔案（檔名打錯？）：${orph.map(esc).join('、')}</div>`;
  if (!list.length) return main.innerHTML = h + `<div class="${card} p-8 text-center text-sm text-slate-500">${xs.length ? '所有文章都有音檔 ✔' : '目前沒有文章'}</div>`;
  main.innerHTML = h + list.map(x => { const has = dyHas(x);
    return `<details class="${card} p-3 mb-2"><summary class="cursor-pointer flex flex-wrap items-center gap-2"><span class="${has ? 'text-emerald-600' : 'text-rose-500'}">${has ? '✔' : '✖'}</span><b class="text-sm">W${x.week} · D${x.day}</b><code class="text-xs text-slate-500">${esc(audioPath(x).split('/').pop())}</code><span class="text-xs text-slate-500 truncate flex-1 min-w-0">${esc(x.tag || '')}</span>${x.level ? `<span class="text-[11px] font-semibold rounded px-1.5 py-0.5 ${lvColor(x.level.score)}">${x.level.score}</span>` : ''}</summary>
      <div class="mt-3">${dyPanel(x)}<button onclick="go(${x.week},${x.day})" class="${btn} border border-slate-300 dark:border-slate-700 !py-1.5 text-xs mt-3">前往這篇文章</button></div></details>`; }).join('');
}

async function copyEl(id, b) {
  const e = document.getElementById(id), t = e.value !== undefined ? e.value : e.textContent;
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch (_) {}
  if (!ok) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove();
  }
  if (b) { const o = b.dataset.o || (b.dataset.o = b.textContent); b.textContent = '✓ 已複製'; setTimeout(() => { b.textContent = o; }, 1200); }
}
function renderGen() {
  const g = genG(), w = cur.w, d = cur.d, s = g.score, { prev, next } = genRefs(w, d);
  const sb = `${btn} border border-slate-300 dark:border-slate-700 !px-3`;
  const fld = 'rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900';
  const seg = (v, label) => `<button onclick="genType('${v}')" class="${btn} ${g.type === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label}</button>`;
  const strip = THEMES.map((t, i) => {
    const k = i + 1, x = find(w, k);
    const v = k === d ? s : genEff(w, k);
    const cls = k === d ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950' : x ? 'bg-slate-100 dark:bg-slate-800' : 'border border-dashed border-slate-300 dark:border-slate-700 text-slate-400';
    return `<div class="rounded-lg px-2 py-1.5 text-center min-w-[3.5rem] ${cls}"><div class="text-[11px] text-slate-500">D${k}</div><div class="text-sm font-semibold">${v}</div><div class="text-[10px] text-slate-400">${k === d ? '本篇' : x ? '已有' : '建議'}</div></div>`;
  }).join('');
  main.innerHTML = `<header class="mb-6">
    <h2 class="text-xl md:text-2xl font-bold">＋ 新增文章 · Day ${d} ${THEMES[d - 1]}</h2>
    <span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-medium">Week ${w} · ${g.id}</span>
  </header>

  <section class="${card} p-4 md:p-6 mb-5">
    <h3 class="font-bold mb-1">① 檔名</h3>
    <p class="text-xs text-slate-500 mb-3 leading-relaxed">把 AI 回覆的 JSON 存成這個檔名，再用 daily_merge.py 合併進 daily.json。</p>
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <code id="gen-fn" class="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-mono">${g.id}.json</code>
      <button onclick="copyEl('gen-fn',this)" class="${sb}">複製</button>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <code id="gen-mp3" class="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-mono">${g.id}.mp3</code>
      <button onclick="copyEl('gen-mp3',this)" class="${sb}">複製</button>
      <span class="text-xs text-slate-500">錄音檔，放在 audio/daily 資料夾</span>
    </div>
  </section>

  <section class="${card} p-4 md:p-6 mb-5">
    <h3 class="font-bold mb-1">② 建議 AI 難度</h3>
    <p class="text-xs text-slate-500 mb-3 leading-relaxed">${w > 1 ? `預設 = 上一週同一天（w${w - 1}d${d}）的分數 + 25，一週比一週難；可手動調整，下一週會以你調整後的分數為基準再 +25。` : '第 1 週沒有上週可比，從 600 起、同週逐日上升（D7 最高）；可手動調整，之後每週同一天再 +25。'}</p>
    <div class="flex flex-wrap items-center gap-2 mb-3">
      <button onclick="genStep(-25)" class="${sb}" aria-label="減 25 分">−25</button>
      <input type="number" step="5" min="400" max="990" value="${s}" onchange="genInput(this.value)" class="${fld} w-24 text-center px-2 py-2 text-sm font-semibold">
      <button onclick="genStep(25)" class="${sb}" aria-label="加 25 分">＋25</button>
      <span class="inline-block text-xs rounded-full px-3 py-1 font-medium ${lvColor(s)}">多益約 ${s} 分 · ${cefrOf(s)}</span>
      ${g.manual ? `<button onclick="genReset()" class="${sb}">↺ 還原建議值 ${g.sug.score}</button>` : '<span class="text-xs text-slate-400">（建議值）</span>'}
    </div>
    <div class="flex flex-wrap gap-2 mb-3">${strip}</div>
    <ul class="text-xs text-slate-500 leading-relaxed space-y-1 list-disc pl-4">
      ${w > 1 ? `<li>上一週 w${w - 1}d${d}：${find(w - 1, d) && find(w - 1, d).level ? `實際 ${find(w - 1, d).level.score} 分` : `尚未建置，以預估值 ${genEff(w - 1, d)} 分推算`}；本篇比它${s > genEff(w - 1, d) ? '高' : s < genEff(w - 1, d) ? '低' : '相同'} ${Math.abs(s - genEff(w - 1, d))} 分。</li>`
        : `${prev ? `<li>同週較早的 w${w}d${prev.day} 為 ${prev.level.score} 分${g.sug.raised ? '，建議值已調整為至少高 10 分' : ''}。</li>` : ''}${next ? `<li>同週較晚的 w${w}d${next.day} 已有 ${next.level.score} 分，本篇不宜比它更難。</li>` : ''}`}
      ${genLater(w, d) ? `<li>較晚的 w${genLater(w, d).week}d${d} 已有 ${genLater(w, d).level.score} 分，本篇不宜比它更難。</li>` : ''}
      <li>難度主要由句型、字彙抽象度、資訊量與干擾項決定；字數只是次要因素，本篇長度建議「${genLen(s)}」（仍須符合 _spec 的字數範圍）。</li>
    </ul>
  </section>

  <section class="${card} p-4 md:p-6 mb-5">
    <h3 class="font-bold mb-3">③ 類型與補充要求（選填）</h3>
    <div class="flex flex-wrap gap-2 mb-3">${seg('auto', '由 AI 決定')}${seg('Reading', 'Reading 閱讀')}${seg('Listening', 'Listening 聽力')}</div>
    <textarea rows="2" oninput="genNote(this.value)" placeholder="例如：題材請與航空公司客服有關、請多出現被動語態…" class="${fld} w-full p-3 text-sm">${esc(g.note)}</textarea>
  </section>

  <section class="${card} p-4 md:p-6">
    <h3 class="font-bold mb-1">④ 給 AI 的提示詞</h3>
    <p class="text-xs text-slate-500 mb-3 leading-relaxed">請連同 daily.json 一起提供給 AI（提示詞不含 JSON 內容）。</p>
    <textarea id="gen-prompt" readonly rows="16" class="${fld} w-full p-3 text-xs leading-relaxed font-mono">${esc(genPrompt())}</textarea>
    <button onclick="copyEl('gen-prompt',this)" class="${btn} mt-3 bg-indigo-600 text-white">複製提示詞</button>
  </section>`;
}

function render() {
  render.m = isMobile();
  if (cur.view === 'home' && !render.m) cur.view = 'day'; // 桌機沒有首頁，直接顯示內文
  const key = cur.view + cur.w + cur.d;
  if (render.k !== undefined && render.k !== key) spStop(); // 切換頁面即停止語音
  render.k = key;
  Sp.hlIdx = -2;
  document.documentElement.classList.toggle('dark', S.dark);
  renderSide();
  cur.view === 'book' ? renderBook() : cur.view === 'home' ? renderHome() : cur.view === 'gen' ? renderGen() : cur.view === 'audio' ? renderAudioAdmin() : renderDay();
  if (Sp.mode === 'audio' && Sp.au && Sp.id) spHl(Sp.id, Sp.au.currentTime);
}

function go(w, d) {
  const fromHome = cur.view === 'home';
  cur = { w, d, view: 'day', showTranscript: false };
  S.last = { w, d }; save();
  render();
  if (fromHome && isMobile()) try { history.pushState({ v: 1 }, ''); } catch (e) {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function pick(qi, oi) {
  rec(find(cur.w, cur.d)).sel[qi] = oi;
  save();
  render();
}

function submit() {
  const x = find(cur.w, cur.d), r = rec(x);
  r.score = x.questions.filter((q, i) => r.sel[i] === q.ans).length;
  r.done = true;
  
  // 自動將做錯的題目加入錯題本（修復原本清空字典的錯誤）
  x.questions.forEach((q, i) => {
    if (r.sel[i] !== q.ans) {
      S.saved[`q:${idOf(x)}:${i}`] = 1;
    }
  });
  
  save();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function retry() {
  const x = find(cur.w, cur.d), r = rec(x);
  r.sel = Array(x.questions.length).fill(null);
  r.done = false;
  cur.showTranscript = false;
  save();
  render();
}

function toggleSave(k) {
  if (S.saved[k]) delete S.saved[k];
  else S.saved[k] = 1;
  save();
  render();
}

function toggleDark() {
  S.dark = !S.dark;
  save();
  render();
}

const side = document.getElementById('side'), main = document.getElementById('main');

/* 啟動：讀取 daily.json 後渲染；雙擊開啟（file://）時改用手動選取檔案 */
function loadFromText(t) {
  try { DATA = itemsOf(JSON.parse(t)); if (isMobile()) cur.view = 'home'; render(); }
  catch (e) { alert('daily.json 格式有誤：' + e.message); }
}
function pickJson(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => loadFromText(r.result); r.readAsText(f, 'utf-8');
}
async function boot() {
  try {
    const res = await fetch('daily.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = itemsOf(await res.json());
    await auLoad();
    if (isMobile()) cur.view = 'home';
    render();
  } catch (e) {
    main.innerHTML = `<div class="${card} p-8 text-center">
      <h3 class="text-lg font-bold mb-2">請選取 daily.json</h3>
      <p class="text-sm text-slate-500 leading-relaxed mb-4">目前是直接雙擊開啟網頁（file://），瀏覽器不允許自動讀取 daily.json。<br>
      請點下方按鈕，選擇同資料夾的 daily.json 即可開始使用。<br>
      上傳到 GitHub Pages 或用本機伺服器開啟時，會自動載入，不需要手動選取。</p>
      <label class="${btn} inline-block bg-indigo-600 text-white">選取 daily.json
        <input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`;
    renderSide();
  }
}
boot();
