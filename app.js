/* 7 大主題輪動常數 */
const THEMES = [
  '商務書信與內部通訊',
  '人力資源與團隊溝通',
  '差旅、交通與商務行程',
  '採購、供應鏈與材料打樣',
  '工業設計與新品發表',
  '行銷公關與使用者體驗',
  '合約授權、專案預算與財務'
];

/* 題庫資料（範例含 Day 1、Day 2、以及專屬 Day 5） */


/* 題庫資料由 data.json 載入（DATA 格式見 data.json） */
let DATA = [];

/* 狀態管理 */
const KEY = 'toeicCoachV2';
let S = { dark: false, ans: {}, saved: {} };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e){}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} };

let cur = { w: 1, d: 1, view: 'day', showTranscript: false };
const idOf = x => `w${x.week}d${x.day}`;
const find = (w, d) => DATA.find(x => x.week == w && x.day == d);
const L = 'ABCD';

const Sp = { hlIdx:-2, au:null, mode:'', id:null, text:'', st:'idle', offset:0, pos:0, gotB:false, t0:0, cps:0, tok:0, rate:0.9 };
const speak = text => { // 單字發音（一次性，不含控制列）
  try { spStop(); const u = new SpeechSynthesisUtterance(text); u.lang='en-US'; u.rate=0.9; speechSynthesis.speak(u); }
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
    u.lang = 'en-US'; u.rate = Sp.rate;
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
    const au = new Audio(x.audio || `audio/${id}.mp3`);
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
function spHl(id, t) { // 依播放秒數標示目前句子（資料來自 data.json 的 timing）
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
const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 md:py-2 text-sm font-medium transition cursor-pointer';

function rec(x) {
  return S.ans[idOf(x)] || (S.ans[idOf(x)] = { sel: [null, null, null, null], done: false, score: 0 });
}

function weekDone(w) { return THEMES.filter((t, i) => { const x = find(w, i + 1); return x && S.ans[idOf(x)] && S.ans[idOf(x)].done; }).length; }
function selW(w) { go(w, cur.d || 1); }   // 手機：W 與 D 各自獨立，切換其中一個保留另一個
function selD(d) { go(cur.w, d); }

function renderSide() {
  const n = Object.keys(S.saved).length, nw = cur.nw ?? cur.w, book = cur.view === 'book';
  const line = 'border border-slate-300 dark:border-slate-700';
  // ===== 手機：頂部標題列 + D1–D7 橫排分頁；W1–W4 直排在左側（wrail）=====
  let h = `<div class="md:hidden">
    <div class="flex items-center justify-between mb-2">
      <h1 class="text-base font-bold">TOEIC Daily</h1>
      <div class="flex gap-2">
        <button onclick="openBook()" class="${btn} ${line} !py-1.5 ${book ? 'bg-indigo-50 dark:bg-indigo-950' : ''}" aria-label="生詞本／錯題本">★ ${n}</button>
        <button onclick="toggleDark()" class="${btn} ${line} !py-1.5" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button>
      </div>
    </div>
    <div class="grid grid-cols-7 gap-1">
      ${THEMES.map((t, i) => { const d = i + 1, x = find(cur.w, d), a = x && S.ans[idOf(x)], on = !book && cur.d === d;
        return `<button onclick="selD(${d})" class="rounded-lg py-1.5 text-sm font-semibold cursor-pointer ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${x ? '' : 'opacity-50'}">D${d}<span class="block text-[10px] leading-3 h-3 ${on ? '' : 'text-emerald-600 dark:text-emerald-400'}">${a && a.done ? '✓' : ''}</span></button>`; }).join('')}
    </div>
  </div>`;
  // ===== 桌機：完整側欄（維持原樣）=====
  h += `<div class="hidden md:block">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-lg font-bold">TOEIC Daily</h1>
    <button onclick="toggleDark()" class="${btn} ${line}">${S.dark ? '☀ 淺色' : '☾ 深色'}</button>
  </div>
  <div class="grid grid-cols-4 gap-1 mb-4">
    ${[1, 2, 3, 4].map(w => `<button onclick="setNavWeek(${w})" class="${btn} ${nw == w ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">W${w}</button>`).join('')}
  </div>
  <p class="text-xs text-slate-500 mb-2 font-medium">Week ${nw} · 7 大主題輪動</p>
  <nav class="space-y-1">`;
  THEMES.forEach((t, i) => {
    const d = i + 1, x = find(nw, d), a = x && S.ans[idOf(x)];
    const st = !x
      ? '<span class="text-xs text-slate-400 shrink-0">即將推出</span>'
      : a && a.done
        ? `<span class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">✓ ${Math.round(a.score / 4 * 100)}%</span>`
        : '<span class="text-xs text-slate-400 shrink-0">未完成</span>';
    const on = cur.view == 'day' && cur.w == nw && cur.d == d;
    h += `<button ${x ? `onclick="go(${nw},${d})"` : 'disabled'} class="w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${on ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800'} ${x ? '' : 'opacity-40 cursor-not-allowed'}">
      <span class="text-sm ${d === 5 ? 'font-bold text-indigo-600 dark:text-indigo-400' : ''}">D${d} ${t}</span>${st}
    </button>`;
  });
  h += `</nav>
  <button onclick="openBook()" class="${btn} w-full mt-6 ${line} ${book ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">★ 生詞本／錯題本（${n}）</button>
  </div>`;
  side.innerHTML = h;

  // 手機左側 W1–W4 直排；顯示各週完成進度
  const rail = document.getElementById('wrail');
  if (rail) rail.innerHTML = [1, 2, 3, 4].map(w => `<button onclick="selW(${w})" class="w-full rounded-lg py-2.5 text-sm font-semibold cursor-pointer ${cur.w === w ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">W${w}<span class="block text-[10px] font-normal leading-3 mt-0.5 ${cur.w === w ? 'text-indigo-100' : 'text-slate-500'}">${weekDone(w)}/7</span></button>`).join('');
  document.documentElement.style.setProperty('--hdr', side.offsetHeight + 'px'); // 讓 W 欄貼在頂部列下方
}
window.addEventListener('resize', () => renderSide());
function setNavWeek(w) { cur.nw = w; renderSide(); }
function openBook() { cur.view = 'book'; cur.navOpen = false; render(); window.scrollTo({ top: 0 }); }

function renderDay() {
  const x = find(cur.w, cur.d);
  if (!x) {
    main.innerHTML = `<div class="${card} p-12 text-center text-slate-500">
      <h3 class="text-lg font-bold mb-2">此日內容尚未建置</h3>
      <p class="text-sm">請在 data.json 新增 week:${cur.w}, day:${cur.d} 的資料。</p>
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
      ${x.day === 5 ? '<span class="px-2 py-0.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 rounded font-semibold">設計師精選</span>' : ''}
    </div>
    <span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-medium">Week ${x.week} · ${x.tag}</span>
  </header>

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
            <span class="text-base font-bold">${v.word}</span>
            <span class="text-xs text-slate-500 italic ml-1">${v.pos}</span>
            <p class="text-xs text-slate-400">${v.ipa}</p>
          </div>
          <button onclick="speak('${v.word}')" class="text-slate-400 hover:text-indigo-600 text-lg">🔊</button>
        </div>
        <p class="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">${v.zh}</p>
        <p class="text-xs mt-1 text-slate-500 dark:text-slate-400">搭配詞：${v.col}</p>
      </div>
      <button onclick="toggleSave('${k}')" class="${btn} mt-3 text-xs w-full border border-slate-200 dark:border-slate-800 ${S.saved[k] ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}">
        ${S.saved[k] ? '★ 已加入生詞本' : '☆ 收藏單字'}
      </button>
    </div>`;
  });
  if (vOpen) h += `</div>`;

  // 隨堂測驗
  const answered = r.sel.filter(v => v !== null).length;
  h += `<div class="flex items-center justify-between ${qOpen ? 'mb-3' : 'mb-4'} gap-2"><button onclick="toggleSec('quiz')" class="font-bold text-lg cursor-pointer">${qOpen ? '▾' : '▸'} 隨堂測驗（4 題）</button>
    <span class="text-sm text-slate-500">${done ? `得分 ${r.score} / 4` : `已作答 ${answered}/4`}</span></div>`;
  if (qOpen) {
  h += `<div class="space-y-4">`;
  x.questions.forEach((q, qi) => {
    const k = `q:${id}:${qi}`, s = r.sel[qi], ok = s === q.ans;
    h += `<div class="${card} p-4 md:p-5">
      <div class="flex justify-between items-center mb-2">
        <span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">Q${qi+1} · ${q.kind=='context'?'情境理解':'Part 5 單選'}</span>
      </div>
      <p class="font-medium text-slate-800 dark:text-slate-200 mb-4">${q.q}</p>
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
        <span>${L[oi]}. ${o}</span>
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
          ${q.why.map((w, wi) => `<p class="${wi === q.ans ? 'font-semibold text-slate-800 dark:text-slate-200' : ''}"><b>${L[wi]}:</b>${w}</p>`).join('')}
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
    h += `<button onclick="submit()" ${answeredCount < 4 ? 'disabled' : ''} class="${btn} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">
      提交答案 (${answeredCount}/4)
    </button>`;
  } else {
    h += `<div class="${card} px-5 py-2.5 font-bold text-sm">
      本日得分：<span class="${r.score >= 3 ? 'text-emerald-600' : 'text-amber-600'}">${r.score} / 4</span>（${Math.round(r.score / 4 * 100)}%）
    </div>
    <button onclick="retry()" class="${btn} border border-slate-300 dark:border-slate-700">重做本日</button>`;
  }
  h += `</div>`;
  }
  main.innerHTML = h;
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
            <b class="text-base">${w.word}</b>
            <span class="text-xs text-slate-400">${w.pos} ${w.ipa}</span>
            <button onclick="speak('${w.word}')" class="text-sm">🔊</button>
          </div>
          <p class="text-sm font-medium mt-1">${w.zh}</p>
          <p class="text-xs text-slate-500 mt-1">搭配詞：${w.col}</p>
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
        <p class="font-medium text-sm my-1">${z.q}</p>
        <p class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">正解 (${L[z.ans]}): ${z.opts[z.ans]}</p>
        <p class="text-xs text-slate-500 mt-1">${z.why[z.ans]}</p>
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
function toggleSec(k) { cur[k + 'Open'] = !cur[k + 'Open']; render(); } // k = 'vocab' | 'quiz'
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

function render() {
  const key = cur.view + cur.w + cur.d;
  if (render.k !== undefined && render.k !== key) spStop(); // 切換頁面即停止語音
  render.k = key;
  Sp.hlIdx = -2;
  document.documentElement.classList.toggle('dark', S.dark);
  renderSide();
  cur.view === 'book' ? renderBook() : renderDay();
  if (Sp.mode === 'audio' && Sp.au && Sp.id) spHl(Sp.id, Sp.au.currentTime);
}

function go(w, d) {
  cur = { w, d, view: 'day', showTranscript: false };
  render();
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
  r.sel = [null, null, null, null];
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

/* 啟動：讀取 data.json 後渲染；雙擊開啟（file://）時改用手動選取檔案 */
function loadFromText(t) {
  try { DATA = JSON.parse(t); render(); }
  catch (e) { alert('data.json 格式有誤：' + e.message); }
}
function pickJson(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => loadFromText(r.result); r.readAsText(f, 'utf-8');
}
async function boot() {
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = await res.json();
    render();
  } catch (e) {
    main.innerHTML = `<div class="${card} p-8 text-center">
      <h3 class="text-lg font-bold mb-2">請選取 data.json</h3>
      <p class="text-sm text-slate-500 leading-relaxed mb-4">目前是直接雙擊開啟網頁（file://），瀏覽器不允許自動讀取 data.json。<br>
      請點下方按鈕，選擇同資料夾的 data.json 即可開始使用。<br>
      上傳到 GitHub Pages 或用本機伺服器開啟時，會自動載入，不需要手動選取。</p>
      <label class="${btn} inline-block bg-indigo-600 text-white">選取 data.json
        <input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`;
    renderSide();
  }
}
boot();
