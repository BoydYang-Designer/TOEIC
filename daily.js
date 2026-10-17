/* 7 大主題輪動常數（D8＝我的專案：自備文本、選填，不計入每週進度／下一篇建議） */
const THEMES = [
  '辦公室與商務溝通',
  '差旅、交通、餐飲與休閒',
  '求職、人資與職涯',
  '採購、製造與供應鏈',
  '行銷、銷售與客服',
  '財務、合約與商業管理',
  '會議、簡報與提案',
  '我的專案（自備文本）'
];
const CORE_DAYS = 7; // D1–D7 為每週固定輪動；D8 為選填
/* 各 D 的子題材輪替清單（與 daily.json 的 _spec.subtopics 保持一致） */
const SUBTOPICS = {"D1": ["郵件與備忘錄", "公告與公司規定", "設備與設施維修", "電話與語音留言", "辦公資訊系統與用品", "訪客與安全門禁"], "D2": ["航班與機場", "訂房與住宿", "交通異動與租車", "餐廳訂位與宴請", "出差行程與參展", "休閒娛樂與旅遊", "天氣與行程"], "D3": ["徵才廣告", "履歷與面試", "升遷與績效", "薪資與福利", "培訓與工作坊", "健康與醫療保險"], "D4": ["訂貨與採購", "運送與物流", "貿易與報關", "庫存與發票", "材料與品質檢驗", "供應商評選", "製造與生產線"], "D5": ["廣告與促銷", "客訴與退換貨", "市場調查與客戶回饋", "展覽與活動", "公益與社區行銷", "零售與電商"], "D6": ["合約條款", "預算與成本", "銀行與帳單", "稽核與報告", "投資與經濟趨勢", "保險與稅務", "房地產與租賃"], "D7": ["專案提案", "成果報告", "新產品簡報", "環保與永續提案", "社區與都市發展", "公司政策說明"]};

/* 題庫資料 */


/* 題庫資料由 daily.json 載入（生成規則見 daily.json 的 _spec，題目在 items） */
let DATA = [];
const itemsOf = j => Array.isArray(j) ? j : (j && j.items) || []; // daily.json 可為陣列，或 { _spec, items }

/* 狀態管理 */
const KEY = 'toeicCoachV2';
let S = { dark: false, ans: {}, saved: {}, gen: {} };
try { S = Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch(e){}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e){} };

let cur = { w: 1, d: 1, view: 'launch', showTranscript: false };
const idOf = x => `w${x.week}d${x.day}`;
const AUDIO_DIR = 'audio/daily/'; // daily 的 mp3 放這個資料夾（題目有 audio 欄位時以該欄位為準）
const audioPath = x => x.audio || AUDIO_DIR + idOf(x) + '.mp3';
const audioSrc = x => audioPath(x) + (AU.idx && AU.idx.v ? '?v=' + AU.idx.v : ''); // AU / auLoad / auCopy 來自 audio.js（audio/index.json 由 Scan總表與音檔.py 產生）
// 複製全文用：兩人以上對話時，行首的「人名:」改成「(人名:)」，避免被當成要唸出來的字
const spkParen = t => { t = String(t || ''); const re = /^([A-Z][A-Za-z.'\- ]{0,20}):(?=\s|$)/gm; const names = new Set((t.match(re) || []).map(m => m.slice(0, -1))); return names.size >= 2 ? t.replace(re, '($1:)') : t; };
const dyHas = x => !!(AU.idx && AU.idx.daily && (AU.idx.daily.complete || []).includes(idOf(x)));
const find = (w, d) => DATA.find(x => x.week == w && x.day == d);
const L = 'ABCD';

/* 聲音：優先 Zoe（增強/高品質），找不到就挑分數最高的英文語音 */
const VBAD=/novelty|fred|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
const vsc=v=>{const n=v.name+' '+v.voiceURI;let s=0;if(/premium|enhanced|增強|高品質|進階|natural|online/i.test(n))s+=10;if(/google/i.test(n))s+=5;if(/^en[-_]US$/i.test(v.lang))s+=3;if(/^en[-_](IN|ZA|IE|SG|PH)$/i.test(v.lang))s-=5;if(VBAD.test(v.name))s-=50;return s};
const isTZ=v=>!!v&&/\b(Tom|Zoe)\b/i.test(v.name);
const bestVoice=()=>{try{const vs=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang)).sort((a,b)=>vsc(b)-vsc(a));return vs.find(v=>/^en[-_]US$/i.test(v.lang)&&/\bZoe\b/i.test(v.name))||vs[0]||null}catch(e){return null}};
const setVoice=u=>{const v=bestVoice();u.lang=v?v.lang:'en-US';if(v)u.voice=v};
const Sp = { hlIdx:-2, au:null, mode:'', id:null, text:'', st:'idle', offset:0, pos:0, gotB:false, t0:0, cps:0, tok:0, rate:0.9, speed:1 };
const SP_SPEEDS = [0.75, 1, 1.25];
try { const v = parseFloat(localStorage.getItem('dailyspeed')); if (SP_SPEEDS.includes(v)) Sp.speed = v; } catch(e) {}
Sp.rate = Math.max(0.5, Math.min(2, 0.9 * Sp.speed)); // 語音合成：1× ＝ 原本的 0.9
function spSetSpeed(v) {
  v = parseFloat(v); if (!SP_SPEEDS.includes(v)) return;
  Sp.speed = v; Sp.rate = Math.max(0.5, Math.min(2, 0.9 * v));
  try { localStorage.setItem('dailyspeed', v); } catch(e) {}
  if (Sp.au) { try { Sp.au.defaultPlaybackRate = v; Sp.au.playbackRate = v; } catch(e) {} }       // mp3：立即生效
  else if (Sp.mode === 'tts' && Sp.st === 'playing') { spCps(); const p = spSnap(Math.round(spNow())); Sp.cps = 0; spRun(p); } // 語音合成：從目前位置換速度重播
  else Sp.cps = 0;
  spUI();
}
const speak = (text, ext) => { // 單字發音（一次性，不含控制列）；ext＝呼叫端已建立的「結束脈動」函式
  const done = ext || spkBtn();
  try { spStop(); const u = new SpeechSynthesisUtterance(text); setVoice(u); u.rate=0.9; u.onend = u.onerror = done; speechSynthesis.speak(u); }
  catch(e) { done(); alert('您的瀏覽器不支援即時語音朗讀'); }
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
  if (typeof dnToast === 'function') dnToast('mp3 讀不到，改用語音合成播放');
}
function spToggle(id, startAt) { // 播放／暫停／繼續；startAt = 從指定秒數開始（點句子時使用）
  if (Sp.id !== id) {
    spStop(); const x = DATA.find(d => idOf(d) === id);
    Sp.id = id; Sp.text = x.passage; Sp.cps = 0;
    const au = new Audio(audioSrc(x));
    try { au.defaultPlaybackRate = Sp.speed; au.playbackRate = Sp.speed; au.preservesPitch = true; au.webkitPreservesPitch = true; } catch(e) {}
    Sp.au = au; Sp.mode = 'audio'; Sp.st = 'loading'; // 先顯示「載入中」，真的出聲（playing 事件）才切成播放中
    if (startAt) { const go = () => { try { au.currentTime = startAt; } catch (e) {} }; au.addEventListener('loadedmetadata', go, { once: true }); }
    au.ontimeupdate = () => { if (Sp.au === au) spHl(id, au.currentTime); };
    au.onended = () => { if (Sp.au === au) { Sp.au = null; Sp.mode = ''; Sp.st = 'idle'; Sp.id = null; spClearHl(); spUI(); } };
    au.onerror = () => spAudioFail(au);
    au.onplaying = () => { if (Sp.au === au && Sp.st === 'loading') { Sp.st = 'playing'; spUI(); } };
    au.play().catch(e => {
      if (e.name === 'NotAllowedError') { if (Sp.au === au) { Sp.st = 'paused'; spUI(); if (typeof dnToast === 'function') dnToast('瀏覽器擋住自動播放，請再按一次 ▶'); } }
      else if (e.name !== 'AbortError') spAudioFail(au);
    });
    spUI(); return;
  }
  if (Sp.mode === 'audio') {
    if (Sp.st === 'playing' || Sp.st === 'loading') { Sp.au.pause(); Sp.st = 'paused'; } else { Sp.au.play(); Sp.st = 'playing'; }
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
function spSkip(sec, keep) { // 前後跳 sec 秒（負數＝倒轉）。keep＝true：暫停中就維持暫停（鍵盤用）；mp3 精準，語音合成為估算
  if (Sp.st === 'idle' || !Sp.id) return;
  if (Sp.mode === 'audio' && Sp.au) {
    const a = Sp.au, d = a.duration, t = a.currentTime + sec;
    try { a.currentTime = Math.max(0, isFinite(d) ? Math.min(Math.max(0, d - 0.2), t) : t); } catch (e) {}
    if (Sp.st === 'paused' && !keep) { a.play(); Sp.st = 'playing'; }
    spUI(); return;
  }
  const to = spSnap(Math.max(0, Math.min(Math.max(0, Sp.text.length - 1), Math.round(spNow() + spCps() * sec))));
  if (Sp.st === 'paused' && keep) { Sp.pos = to; spUI(); } else spRun(to);
}
function spFwd() { spSkip(5); } // 快轉 5 秒
function spStop() {
  Sp.tok++; Sp.st = 'idle'; Sp.pos = 0; Sp.id = null; Sp.mode = ''; spClearHl();
  if (Sp.au) { Sp.au.onerror = null; Sp.au.onended = null; Sp.au.pause(); Sp.au = null; }
  try { speechSynthesis.cancel(); } catch(e) {}
  spUI();
}
function spHtml(id) {
  const mine = Sp.id === id && Sp.st !== 'idle', playing = Sp.id === id && Sp.st === 'playing', loading = Sp.id === id && Sp.st === 'loading';
  const b = 'rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 disabled:opacity-40 disabled:cursor-not-allowed';
  const on = 'rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer bg-indigo-600 text-white';
  return `<button onclick="spToggle('${id}')" class="${playing || loading ? on : b}${loading ? ' animate-pulse' : ''}">${loading ? '⏳ 載入中…' : playing ? '⏸ 暫停' : (mine ? '▶ 繼續' : '🔊 播放語音')}</button>
    <button onclick="spBack()" ${mine ? '' : 'disabled'} class="${b}" title="倒轉 5 秒（鍵盤 ←）">⏪ 5秒</button>
    <button onclick="spFwd()" ${mine ? '' : 'disabled'} class="${b}" title="快轉 5 秒（鍵盤 →）">5秒 ⏩</button>
    <button onclick="spStop()" ${mine ? '' : 'disabled'} class="${b}" title="停止">⏹</button>
    <span class="inline-flex items-center gap-1"><span class="text-xs text-slate-400">語速</span>${SP_SPEEDS.map(v => `<button onclick="spSetSpeed(${v})" class="rounded-lg px-2.5 py-2 text-xs font-medium transition cursor-pointer ${v === Sp.speed ? 'bg-indigo-600 text-white' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300'}">${v}×</button>`).join('')}</span>
    ${mine ? `<span class="text-xs ${playing ? 'text-indigo-600 dark:text-indigo-300 font-semibold' : 'text-slate-400'}">${playing ? '● ' : ''}${Sp.mode === 'audio' ? '音檔' : '語音合成'}${loading ? '（載入中）' : playing ? '播放中' : '（已暫停）'}</span>` : ''}`;
}
function spClearHl() { Sp.hlIdx = -2; document.querySelectorAll('#passage-text .tsent.active, #zh-text .zsent.active').forEach(e => e.classList.remove('active')); }
function spHl(id, t) { // 依播放秒數標示目前句子（資料來自 daily.json 的 timing）
  const x = DATA.find(d => idOf(d) === id); if (!x || !x.timing) return;
  let idx = -1;
  x.timing.forEach((s, i) => { if (s.start <= t + 0.05) idx = i; });
  if (idx >= 0 && t > x.timing[idx].end + 1) idx = -1;
  if (idx === Sp.hlIdx) return;
  Sp.hlIdx = idx;
  document.querySelectorAll('#passage-text .tsent').forEach(el => el.classList.toggle('active', +el.dataset.i === idx));
  document.querySelectorAll('#zh-text .zsent').forEach(el => el.classList.toggle('active', +el.dataset.z === idx)); // 中文翻譯：和英文同一句一起亮
  const el = idx >= 0 && document.querySelector(`#passage-text .tsent[data-i="${idx}"]`);
  const zel = idx >= 0 && document.querySelector(`#zh-text .zsent[data-z="${idx}"]`);
  if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); else if (zel) zel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); // 英文收合時改捲中文
}
function spSeek(id, i) { // 點文稿句子：跳到該句播放
  const x = DATA.find(d => idOf(d) === id), t = x.timing[i].start;
  if (Sp.id === id && Sp.mode === 'tts') { spRun(x.timing[i].from); return; } // 語音合成：從該句的字元位置重播
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
    <span class="flex-1 min-w-0 truncate px-2 text-xs text-slate-500">${Sp.st === 'loading' ? '⏳ 載入中 · ' : Sp.st === 'playing' ? '● ' : '⏸ '}${Sp.id.toUpperCase()} · ${Sp.mode === 'audio' ? '音檔' : '語音合成'}</span>
    <button onclick="spBack()" class="${b}">⏪ 5秒</button>
    <button onclick="spFwd()" class="${b}">5秒 ⏩</button>
    <button onclick="spToggle(Sp.id)" class="${b}${Sp.st === 'loading' ? ' animate-pulse' : ''}">${Sp.st === 'loading' ? '⏳' : Sp.st === 'playing' ? '⏸' : '▶'}</button>
    <button onclick="spStop()" class="${b}">⏹</button></div>`;
}
function spUI() { const el = document.getElementById('sp-ctl'); if (el) el.innerHTML = spHtml(el.dataset.id); spMini(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) spStop(); });
window.addEventListener('pagehide', () => { try { speechSynthesis.cancel(); } catch(e) {} });
/* 鍵盤（閱讀頁、正在播放／暫停中才生效）：空白鍵＝暫停／繼續，← 倒轉 5 秒，→ 快轉 5 秒。
   沒在播放時不攔截，空白鍵照常捲動頁面；輸入框、發音練習視窗開著、按住 Ctrl／Alt／Shift 時也不處理。 */
let kbSpace = false;
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const t = e.target, tag = t && t.tagName;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tag))) return;
  if (typeof cur === 'undefined' || cur.view !== 'day' || !Sp.id || Sp.st === 'idle') return;
  if (document.getElementById('pron-ov')) return;
  const k = e.key;
  if (k === ' ' || k === 'Spacebar') { e.preventDefault(); kbSpace = true; spToggle(Sp.id); }
  else if (k === 'ArrowLeft' || k === 'ArrowRight') {
    e.preventDefault();
    spSkip(k === 'ArrowLeft' ? -5 : 5, true);
    if (typeof dnToast === 'function') dnToast(k === 'ArrowLeft' ? '⏪ 倒轉 5 秒' : '⏩ 快轉 5 秒');
  }
});
document.addEventListener('keyup', e => { // 焦點在按鈕上時，空白鍵放開會再觸發一次「點擊」→ 擋掉，避免暫停後又立刻繼續
  if (kbSpace && (e.key === ' ' || e.key === 'Spacebar')) { kbSpace = false; e.preventDefault(); }
});

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
function weekDone(w) { return THEMES.slice(0, CORE_DAYS).filter((t, i) => { const x = find(w, i + 1); return x && S.ans[idOf(x)] && S.ans[idOf(x)].done; }).length; }


/* 手機首頁：D1–D7 垂直（左，含主題標題）× W 週次水平（可左右捲動）；點交叉格直接進入內文 */
window.addEventListener('popstate', () => { if (isMobile()) up(); });
window.addEventListener('resize', () => { if (isMobile() !== render.m) render(); });
function setNavWeek(w) { cur.nw = w; cur.view === 'home' ? render() : renderSide(); }
function openBook() { cur.view = 'book'; push(); render(); window.scrollTo({ top: 0 }); }

/* ===== 頁面架構：選單（launch）→ 學習（learn）／維護（maint） =====
   cur.view：launch 選單｜home 手機週次表｜day 內文｜speak 語音練習｜book 生詞本｜bank 入庫總覽
            maint 維護總覽｜mitem 單篇維護｜gen 新增文章｜audio 音檔／Timing 清單 */
let SEC = null; // null＝選單；'learn'＝學習；'maint'＝維護
const inMaint = () => SEC === 'maint';
const push = () => { if (isMobile()) try { history.pushState({ v: 1 }, ''); } catch (e) {} }; // 手機：每往下一層就記一筆，返回鍵才能一層一層退
function showLaunch() { SEC = null; cur = Object.assign({}, cur, { view: 'launch' }); render(); window.scrollTo({ top: 0 }); }
/* 從 vocab.html（TSL 單字總表）點進來：記住進入的那一天，之後「返回」就回到總表（總表會自動還原篩選與捲動位置） */
let VBACK = null;
const vFrom = () => !!VBACK && VBACK.w == cur.w && VBACK.d == cur.d;
function backToVocab() { VBACK = null; location.href = 'vocab.html'; }
function up() { // 往上一層
  const v = cur.view, m = isMobile();
  if (v === 'launch') return;
  if (dnUp()) { if (vFrom()) backToVocab(); return; } // 入庫彙整／回報彙整／詳解頁：回到上一層並還原捲動位置（從 vocab.html 進來則直接回總表）
  if ((v === 'day' || v === 'mitem') && tFrom()) return backToMatrix();
  if (v === 'day' && vFrom()) return backToVocab();
  if (v === 'speak') { cur.view = 'day'; render(); return; }
  if (SEC === 'maint') { if (v === 'maint') return showLaunch(); cur.view = 'maint'; cur.nw = cur.w; render(); window.scrollTo({ top: 0 }); return; }
  if (v === 'home' || (v === 'day' && !m)) return showLaunch();
  cur.view = m ? 'home' : 'day'; cur.nw = cur.w; render(); window.scrollTo({ top: 0 });
}
function goBack() { if (isMobile() && history.state && history.state.v) history.back(); else up(); }
function backHome() { goBack(); }
function showHome() { up(); }
function enterSec(s) {
  const from = cur.view, keep = { w: cur.w, d: cur.d };
  SEC = s;
  if (s === 'maint') cur = Object.assign(keep, { nw: keep.w, view: 'maint' });
  else if (isMobile()) cur = Object.assign(keep, { nw: keep.w, view: 'home' });
  else { const l = S.last && find(S.last.w, S.last.d) ? S.last : keep; cur = { w: l.w, d: l.d, nw: l.w, view: 'day', showTranscript: false }; }
  if (from === 'launch') push();
  render(); window.scrollTo({ top: 0 });
}
function openAudio() { SEC = 'maint'; cur = Object.assign({}, cur, { view: 'audio' }); push(); render(); window.scrollTo({ top: 0 }); }
function openItem(w, d) { TBACK = TKEEP; TKEEP = null; SEC = 'maint'; cur = { w, d, nw: w, view: 'mitem' }; push(); render(); window.scrollTo({ top: 0 }); }
function goSpeak(w, d) { SEC = 'learn'; cur = { w, d, nw: w, view: 'speak' }; S.last = { w, d }; save(); push(); render(); window.scrollTo({ top: 0 }); }
async function recheckAudio() { await auLoad(); render(); }

/* ===== 狀態小標籤：mp3／timing ===== */
const mp3State = x => AU.idx ? (dyHas(x) ? 'ok' : 'none') : 'unk';
const chipCls = st => st === 'ok' ? TM_COLOR.ok : st === 'partial' ? TM_COLOR.partial : st === 'unk' ? TM_COLOR.none : TM_COLOR.bad;
const chip = (txt, st, tip) => `<span ${tip ? `title="${esc(tip)}"` : ''} class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap ${chipCls(st)}">${txt}</span>`;
function stChips(x) {
  const m = mp3State(x), t = tmInfo(x).state;
  return chip('♪' + (m === 'ok' ? '✔' : m === 'unk' ? '?' : '✖'), m, m === 'ok' ? '有 mp3' : m === 'unk' ? '尚未讀到 audio/index.json' : '缺 mp3')
    + chip('⏱' + (t === 'ok' ? '✔' : t === 'partial' ? '△' : '✖'), t === 'none' ? 'bad' : t, 'timing：' + TM_LABEL[t]);
}
const itemOk = x => mp3State(x) === 'ok' && tmInfo(x).state === 'ok';
function todoOf(x) { // 這篇還缺什麼
  const m = mp3State(x), t = tmInfo(x).state, r = [];
  if (m === 'none') r.push('缺 mp3');
  if (t === 'none') r.push(m === 'none' ? 'timing 未做（需先有 mp3）' : 'timing 未做');
  else if (t === 'bad') r.push('timing 異常');
  else if (t === 'partial') r.push('timing 只涵蓋部分句子');
  return r;
}
function nextEmpty() { const mw = Math.max(4, ...DATA.map(x => x.week)); for (let w = 1; w <= mw + 1; w++) for (let d = 1; d <= CORE_DAYS; d++) if (!find(w, d)) return { w, d }; return { w: mw + 1, d: 1 }; }

/* ===== 題材總覽：每個 D 的小主題（SUBTOPICS）× 已用過的文章；一眼看出覆蓋進度與缺口 ===== */
const stAbbr = t => String(t || '').split(/與|、/)[0].slice(0, 4); // 週次表格子用的縮寫，例如「公告與公司規定」→「公告」
function topicUse() { // { D1: { 子題材: [x, ...] }, ... }；daily.json 內出現、但不在清單內的子題材歸入「其他」
  const U = {};
  Object.keys(SUBTOPICS).forEach(k => { U[k] = {}; SUBTOPICS[k].forEach(t => { U[k][t] = []; }); });
  [...DATA].sort((a, b) => a.week - b.week || a.day - b.day).forEach(x => {
    const k = 'D' + x.day; if (!U[k]) U[k] = {};
    const t = x.subtopic || '（未標子題材）'; (U[k][t] = U[k][t] || []).push(x);
  });
  return U;
}
const topicCover = () => { const U = topicUse(); let t = 0, u = 0; Object.keys(SUBTOPICS).forEach(k => SUBTOPICS[k].forEach(n => { t++; if (U[k][n].length) u++; })); return `已涵蓋 ${u} / ${t}`; };
/* ===== 統一矩陣：週次（列）× D1–D7（欄），三種模式共用同一套骨架 =====
   progress（學習：完成度）｜ media（維護：mp3／timing）｜ topics（題材：子題材與覆蓋）
   模式＝目前的 cur.view：home→progress、maint→media、topics→topics（不另存狀態，up()／dnUp() 照舊運作）
   新增模式：在 MX 加一個條目（label／weeks／cell／empty／head／top／legend／extra） */
let TBACK = null; // 從矩陣點進文章時記住來源（哪個模式、捲動位置），「返回」就回到原處
const tFrom = () => !!TBACK && TBACK.w == cur.w && TBACK.d == cur.d && (cur.view === 'day' || cur.view === 'mitem');
const tLabel = () => TBACK && TBACK.v === 'topics' ? '回題材總覽' : TBACK && TBACK.v === 'maint' ? '回維護總覽' : '回週次表';
let TKEEP = null; // openFromMatrix → go／openItem 之間暫存，讓文章第一次繪製時就能顯示「← 回…」連結
function openFromMatrix(w, d) { TKEEP = { w, d, y: window.scrollY, v: cur.view }; (inMaint() ? openItem : go)(w, d); }
function backToMatrix() { const t = TBACK; TBACK = null; cur.view = t.v; cur.nw = cur.w; render(); window.scrollTo({ top: t.y }); }
function openTopics() { cur.view = 'topics'; push(); render(); window.scrollTo({ top: 0 }); }
const MX_VIEW = { progress: 'home', media: 'maint', topics: 'topics' };
function openMatrix() { cur.view = 'home'; push(); render(); window.scrollTo({ top: 0 }); } // 桌機學習區側欄的「▦ 總表」
function mxSet(m) { cur.view = MX_VIEW[m]; render(); }
const mxMode = () => cur.view === 'topics' ? 'topics' : inMaint() ? 'media' : 'progress';
const mxWeeks = () => Math.max(4, ...DATA.map(x => x.week));
const mxTitle = x => (x.project ? '📁' + x.project + '｜' : '') + (x.subtopic ? x.subtopic + '｜' : '') + (x.tag || '');
const mxMedia = () => { // 維護模式用的統計
  const xs = [...DATA].sort((a, b) => a.week - b.week || a.day - b.day), tm = { ok: 0, partial: 0, bad: 0, none: 0 };
  xs.forEach(x => tm[tmInfo(x).state]++);
  return { xs, N: xs.length, mpOk: xs.filter(x => mp3State(x) === 'ok').length, tm, todo: xs.filter(x => !itemOk(x)), ne: nextEmpty() };
};
function projectSection(name, dn) { // D8（我的專案）：依 project 標籤分組列出
  const xs = [...DATA].filter(x => x.day === dn).sort((a, b) => a.week - b.week), G = {};
  xs.forEach(x => { const p = x.project || '（未標專案）'; (G[p] = G[p] || []).push(x); });
  const names = Object.keys(G);
  return `<section class="${card} p-4"><div class="flex items-baseline justify-between gap-2 mb-2"><h3 class="font-bold text-sm"><span class="text-indigo-600 dark:text-indigo-400">D${dn}</span> ${name}</h3><span class="text-xs text-slate-500 shrink-0">${names.length} 個專案 · ${xs.length} 篇</span></div>`
    + (names.length ? `<ul class="divide-y divide-slate-100 dark:divide-slate-800">` + names.map(p => `<li class="py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span class="font-medium">📁 ${esc(p)}</span>${G[p].map(x => `<button onclick="openFromMatrix(${x.week},${x.day})" title="${esc(x.tag || '')}" class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300 hover:ring-1 hover:ring-sky-400 cursor-pointer">w${x.week}d${x.day}</button><span class="text-xs text-slate-500">${esc(x.tag || '')}</span>`).join('')}</li>`).join('') + '</ul>'
      : '<p class="text-xs text-slate-400">還沒有專案文章。到維護區點「＋ 新增」→ D8，類型選「按照文本」。</p>') + '</section>';
}
function topicSections() { // 題材模式：每個 D 的小主題清單（✔ 已用／未用）
  const U = topicUse();
  return `<div class="space-y-3">` + THEMES.map((name, i) => {
    if (i + 1 > CORE_DAYS) return projectSection(name, i + 1); // D8：依專案標籤分組，方便查找
    const k = 'D' + (i + 1), names = Object.keys(U[k] || {}), n = names.filter(t => U[k][t].length && SUBTOPICS[k].includes(t)).length;
    return `<section class="${card} p-4"><div class="flex items-baseline justify-between gap-2 mb-2"><h3 class="font-bold text-sm"><span class="text-indigo-600 dark:text-indigo-400">D${i + 1}</span> ${name}</h3><span class="text-xs text-slate-500 shrink-0">${n} / ${SUBTOPICS[k].length}</span></div><ul class="divide-y divide-slate-100 dark:divide-slate-800">`
      + names.map(t => {
        const xs = U[k][t], ok = xs.length > 0, odd = !SUBTOPICS[k].includes(t);
        return `<li class="py-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span class="shrink-0 w-4 text-center ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}">${ok ? '✔' : '○'}</span>
        <span class="${ok ? '' : 'text-slate-500'}">${esc(t)}${odd ? ' <span class="text-xs text-amber-600 dark:text-amber-400">（不在清單內）</span>' : ''}</span>
        ${ok ? xs.map(x => `<button onclick="openFromMatrix(${x.week},${x.day})" title="${esc(x.tag || '')}" class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 hover:ring-1 hover:ring-indigo-400 cursor-pointer">w${x.week}d${x.day}</button>`).join('')
        : '<span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">未用</span>'}</li>`;
      }).join('') + '</ul></section>';
  }).join('') + '</div>';
}
const MX = {
  progress: {
    label: '📖 進度', weeks: mxWeeks,
    rowSub: w => `${weekDone(w)}/7`,
    cell(x) {
      const a = S.ans[idOf(x)], done = a && a.done, started = a && a.sel.some(v => v !== null);
      return { title: mxTitle(x), cls: 'text-sm font-semibold ' + (done ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300'),
        html: (done ? `✓<span class="block text-[0.625rem] font-normal leading-3">${Math.round(a.score / x.questions.length * 100)}%${skDone(x) ? ' 🎤' : ''}</span>` : started ? '<span class="text-xs">進行中</span>' : '<span class="text-xs">開始</span>')
          + (x.project ? `<span class="block text-[0.5625rem] font-normal leading-3 opacity-70 truncate px-0.5">📁${esc(String(x.project).slice(0, 5))}</span>` : x.subtopic ? `<span class="block text-[0.5625rem] font-normal leading-3 opacity-70 truncate px-0.5">${esc(stAbbr(x.subtopic))}</span>` : '') };
    },
    top() {
      const last = S.last && find(S.last.w, S.last.d);
      return last ? `<button onclick="go(${last.week},${last.day})" class="w-full mb-4 rounded-xl px-4 py-3 text-left bg-indigo-600 text-white cursor-pointer">
      <span class="block text-xs text-indigo-100">▶ 繼續上次</span>
      <span class="block font-semibold">W${last.week} · D${last.day} ${THEMES[last.day - 1]}</span>
      <span class="block text-xs text-indigo-100 truncate">${esc(last.tag || '')}</span></button>` : '';
    },
    legend: () => '點格子進入當天內容 · 左右滑動可查看更多天；格子下方小字是子題材'
  },
  media: {
    label: '🎧 音檔', weeks: () => mxWeeks() + 1, // 多一列給「＋ 新增」
    cell(x) {
      const m = mp3State(x), t = tmInfo(x).state;
      return { title: mxTitle(x), cls: 'text-xs font-semibold ' + (itemOk(x) ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : ((m === 'none' && t !== 'ok') || t === 'bad') ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'),
        html: `${x.type === 'Listening' ? '🎧' : '📄'}<span class="block text-[0.6875rem] font-normal leading-4">♪${m === 'ok' ? '✔' : m === 'unk' ? '?' : '✖'} ⏱${t === 'ok' ? '✔' : t === 'partial' ? '△' : '✖'}</span>` };
    },
    empty: (w, d) => ({ onclick: `openGen(${w},${d})`, cls: 'border border-dashed border-indigo-400 text-indigo-600 dark:text-indigo-400 text-lg', html: '＋' }),
    head: () => '🛠 維護總覽',
    top() {
      const { N, mpOk, tm } = mxMedia();
      return `<div class="${card} p-4 mb-4 text-sm"><div class="flex flex-wrap gap-x-6 gap-y-1">
    <span>文章 <b>${N}</b> 篇</span>
    <span>mp3：${AU.idx ? `<b class="text-emerald-600 dark:text-emerald-400">${mpOk}</b> / ${N}${mpOk < N ? ` <span class="text-rose-600 dark:text-rose-400">（缺 ${N - mpOk}）</span>` : ' ✔'}` : '<span class="text-amber-600 dark:text-amber-400">尚未讀到 audio/index.json</span>'}</span>
    <span>timing 完成：<b class="text-emerald-600 dark:text-emerald-400">${tm.ok}</b> / ${N}</span></div>
    ${tm.ok < N ? `<p class="mt-1 text-xs text-slate-500">未完成的 timing：未做 <b>${tm.none}</b>　部分 <b>${tm.partial}</b>　異常 <b>${tm.bad}</b></p>` : ''}
    <div class="flex flex-wrap items-center gap-2 mt-2 text-xs"><button onclick="recheckAudio()" class="${btn} border border-slate-300 dark:border-slate-700 !py-0.5 !px-2 text-xs">重新讀取 audio/index.json</button><span class="text-slate-400">timing 看 daily.json 內的 timing 欄位；放好 mp3 並執行 daily_timestamps.py、重新整理後更新</span></div></div>`;
    },
    legend: () => '格子：♪＝有沒有 mp3，⏱＝timing（✔ 完成、△ 只涵蓋部分句子、✖ 未做或異常）。綠＝都完成，黃＝其中一項未完成，紅＝都沒有或 timing 異常。點格子看細節；「＋」是還沒建置的天數。',
    extra() {
      const { todo, ne } = mxMedia();
      let h = `<div class="grid sm:grid-cols-3 gap-3 mb-5">
    <button onclick="dnNav('marks')" class="${btn} ${card} text-left">📌 入庫彙整 <span class="block text-xs text-slate-500 mt-0.5">${dnMarks().length} 個字</span></button>
    <button onclick="dnNav('reports')" class="${btn} ${card} text-left">⚑ 回報彙整 <span class="block text-xs mt-0.5 ${dnOpenRpN() ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}">待處理 ${dnOpenRpN()}</span></button>
    <button onclick="mxSet('topics')" class="${btn} ${card} text-left">🗂 題材總覽 <span class="block text-xs text-slate-500 mt-0.5">${topicCover()}</span></button></div>`;
      if (todo.length) {
        h += `<section class="${card} p-4 mb-4"><h3 class="font-bold text-sm mb-2">待處理（${todo.length}）</h3><div class="space-y-1">${todo.slice(0, 12).map(x => `<button onclick="openItem(${x.week},${x.day})" class="w-full text-left rounded-lg px-2 py-1.5 flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"><b class="shrink-0">W${x.week}·D${x.day}</b><span class="truncate flex-1 text-slate-500">${esc(x.tag || '')}</span><span class="shrink-0 text-xs text-rose-600 dark:text-rose-400">${todoOf(x).join('、') || '確認 mp3 狀態'}</span></button>`).join('')}${todo.length > 12 ? `<p class="text-xs text-slate-400 px-2">…還有 ${todo.length - 12} 篇，請看「音檔／Timing 清單」</p>` : ''}</div></section>`;
      }
      return h + tslSection() + `<div class="grid sm:grid-cols-2 gap-3"><button onclick="openAudio()" class="${btn} border border-slate-300 dark:border-slate-700">🎧 音檔／Timing 清單</button><button onclick="openGen(${ne.w},${ne.d})" class="${btn} bg-indigo-600 text-white">＋ 新增下一篇（W${ne.w} · D${ne.d}）</button></div>
  <a href="vocab.html" onclick="tslPreset()" class="${card} flex items-center gap-3 p-4 mt-3 hover:ring-2 hover:ring-indigo-400"><span class="text-3xl">📚</span><span class="flex-1 min-w-0"><span class="block font-bold">TSL 單字總表</span><span class="block text-xs text-slate-500 dark:text-slate-400">New TOEIC Service List 1250 字 · 看還缺哪些</span></span><span class="text-indigo-600 dark:text-indigo-400 text-xl shrink-0">→</span></a>`;
    }
  },
  topics: {
    label: '🗂 題材', weeks: mxWeeks,
    cell(x, w, d, ctx) { // 同一個 D 之前已用過的子題材標琥珀色
      const seen = ctx.seen = ctx.seen || {}, k = d + '|' + x.subtopic, dup = d <= CORE_DAYS && !!seen[k]; seen[k] = 1;
      return { title: mxTitle(x) + (dup ? '（此 D 已用過）' : ''), cls: 'text-[0.6875rem] leading-4 font-medium ' + (dup ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'),
        html: `<span class="line-clamp-2">${esc(x.project ? '📁' + x.project : x.subtopic || '未標')}</span>` };
    },
    head: () => '🗂 題材總覽',
    top() {
      const U = topicUse(); let total = 0, used = 0;
      Object.keys(SUBTOPICS).forEach(k => SUBTOPICS[k].forEach(t => { total++; if (U[k][t].length) used++; }));
      return `<p class="mb-3 text-sm text-slate-500 dark:text-slate-400">已涵蓋 <b class="text-emerald-600 dark:text-emerald-400">${used}</b> / ${total} 個小主題，還有 <b class="${total - used ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">${total - used}</b> 個未用。點文章編號可直接開啟。</p>`;
    },
    legend: () => '每格是該篇的子題材；<span class="text-amber-600 dark:text-amber-400">琥珀色</span>＝同一個 D 之前已用過。滑鼠停留看完整標題。',
    extra: topicSections
  }
};
function renderMatrix() {
  const mode = mxMode(), C = MX[mode], NW = C.weeks(), ctx = {}, modes = inMaint() ? ['media', 'topics'] : ['progress', 'topics'];
  const bd = 'border-b border-slate-100 dark:border-slate-800', edge = 'border-slate-200 dark:border-slate-800';
  let h = C.head ? `<header class="mb-3"><h2 class="text-xl md:text-2xl font-bold">${C.head()}</h2></header>` : '';
  h += `<div class="flex gap-1 mb-3">${modes.map(m => `<button onclick="mxSet('${m}')" class="${btn} !py-1.5 text-xs ${m === mode ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${MX[m].label}</button>`).join('')}</div>` + (C.top ? C.top() : '');
  h += `<div class="${card} overflow-hidden mb-2"><div class="overflow-x-auto"><table class="border-separate border-spacing-0 text-center"><thead><tr><th class="sticky left-0 z-10 w-14 min-w-[3.5rem] bg-white dark:bg-slate-900 border-b border-r ${edge}"></th>${THEMES.map((t, i) => `<th title="${esc(t)}" class="min-w-[5.5rem] px-1 py-2 border-b ${edge}"><span class="block text-sm font-bold">D${i + 1}</span><span class="block text-[0.625rem] font-normal text-slate-500 truncate max-w-[5.5rem]">${t}</span></th>`).join('')}</tr></thead><tbody>`;
  for (let w = 1; w <= NW; w++) {
    h += `<tr><th class="sticky left-0 z-10 px-2 py-2 bg-white dark:bg-slate-900 border-r border-b ${edge} text-sm font-bold text-indigo-600 dark:text-indigo-400">W${w}${C.rowSub ? `<span class="block text-[0.6875rem] font-normal text-slate-500">${C.rowSub(w)}</span>` : ''}</th>`;
    for (let d = 1; d <= THEMES.length; d++) {
      const x = find(w, d), e = !x && C.empty && C.empty(w, d);
      if (x) { const c = C.cell(x, w, d, ctx); h += `<td class="p-1 ${bd}"><button onclick="openFromMatrix(${w},${d})" title="${esc(c.title)}" class="w-full h-14 px-1 rounded-lg cursor-pointer overflow-hidden ${c.cls}">${c.html}</button></td>`; }
      else if (e) h += `<td class="p-1 ${bd}"><button onclick="${e.onclick}" class="w-full h-14 rounded-lg cursor-pointer ${e.cls}">${e.html}</button></td>`;
      else h += `<td class="p-1 ${bd}"><div class="h-14 rounded-lg flex items-center justify-center text-slate-300 dark:text-slate-700">—</div></td>`;
    }
    h += '</tr>';
  }
  main.innerHTML = h + `</tbody></table></div></div><p class="text-xs text-slate-400 mb-5">${C.legend()}</p>` + (C.extra ? C.extra() : '');
}

/* ===== 選單 ===== */
function renderLaunch() {
  const N = DATA.length, done = DATA.filter(x => S.ans[idOf(x)] && S.ans[idOf(x)].done).length;
  const last = S.last && find(S.last.w, S.last.d);
  const mpMiss = AU.idx ? DATA.filter(x => mp3State(x) !== 'ok').length : null, tmMiss = DATA.filter(x => tmInfo(x).state !== 'ok').length;
  const hov = 'hover:ring-2 hover:ring-indigo-400';
  main.innerHTML = `<header class="mb-6"><h2 class="text-xl md:text-2xl font-bold">TOEIC Daily Coach</h2><p class="mt-1 text-sm text-slate-500">請選擇要進入的頁面</p></header>
  <div class="grid sm:grid-cols-2 gap-4">
    <button onclick="enterSec('learn')" class="${card} ${hov} p-5 text-left cursor-pointer">
      <span class="text-3xl">📖</span><h3 class="font-bold text-lg mt-2">學習</h3>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">每日閱讀／聽力、核心單字、隨堂測驗、語音練習</p>
      <p class="mt-3 text-xs text-slate-500">已完成測驗 ${done} / ${N} 天${last ? `<br>上次：W${last.week} · D${last.day} ${esc(last.tag || '')}` : ''}</p></button>
    <button onclick="enterSec('maint')" class="${card} ${hov} p-5 text-left cursor-pointer">
      <span class="text-3xl">🛠</span><h3 class="font-bold text-lg mt-2">維護</h3>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">文章總覽、mp3 與 timing、新增文章、入庫／回報彙整、題材總覽</p>
      <p class="mt-3 text-xs text-slate-500">文章 ${N} 篇　${mpMiss == null ? 'mp3 狀態未讀到' : `<span class="${mpMiss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">缺 mp3 ${mpMiss}</span>`}　<span class="${tmMiss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">timing 未完成 ${tmMiss}</span>${tslBadge()}<br>入庫 ${dnMarks().length}　新單字 ${nwList().length}　<span class="${dnOpenRpN() ? 'text-rose-600 dark:text-rose-400' : ''}">回報待處理 ${dnOpenRpN()}</span>　題材${topicCover()}</p></button>
    <button onclick="dnFromLaunch('nw')" class="${card} ${hov} p-5 text-left cursor-pointer sm:col-span-2">
      <span class="text-3xl">🆕</span><h3 class="font-bold text-lg mt-2">新單字</h3>
      <p class="mt-1 text-sm text-slate-600 dark:text-slate-400">隨時記下遇到的新單字（可語音輸入）；新增文章時優先排進文章，被採用後自動入庫，備註用來請 AI 補充詳解</p>
      <p class="mt-3 text-xs text-slate-500">${(() => { const c = nwCounts(); return `共 ${c.all} 個　待採用 ${c.pending}　待補充詳解 ${c.todo}　<span class="${c.rem ? 'text-emerald-600 dark:text-emerald-400' : ''}">可移除 ${c.rem}</span>`; })()}</p></button>
  </div>`;
}

/* 維護 → TSL 單字總表：點進去時預設篩成「還缺」（還沒生成詳解的字）；vocab.html 會讀這個設定，用完即清除 */
function tslPreset(st) { try { sessionStorage.setItem('tslState', JSON.stringify({ F: { st: st || 'miss' }, open: [], y: 0 })); } catch (e) {} }

/* ===== 維護總覽：週次 × 天數矩陣，格內顯示 mp3／timing 狀態 ===== */
/* ===== 核心單字卡：顯示「多詞性／多義」摘要（資料來自該字的 extra_vocab 詳解：pos_uses／senses；有 2 筆以上才顯示）===== */
function dyMulti(x, v) {
  const e = typeof dnFindExtraAny === 'function' ? dnFindExtraAny(x, v.word) : null; if (!e) return '';
  const pu = (Array.isArray(e.pos_uses) ? e.pos_uses : []).filter(o => o && o.pos && o.zh), sn = (Array.isArray(e.senses) ? e.senses : []).filter(o => o && o.zh);
  const line = (t, arr) => arr.length > 1 ? `<p class="text-xs mt-1 text-amber-700 dark:text-amber-300"><b>${t}</b>：${arr.map(o => `${o.pos ? `<i>${esc(o.pos)}</i> ` : ''}${esc(o.zh)}${o.in_passage ? '（本篇）' : ''}`).join('　／　')}</p>` : '';
  return line('多詞性', pu) + line('多義', sn);
}
/* ===== TSL 詳解缺口：核心單字（vocab）裡屬於 TSL、但還沒有 extra_vocab 詳解的字 =====
   判斷：任何一篇文章的 extra_vocab 有該字（text），或它出現在該篇某個詳解的 forms／derived 裡，就算有詳解（與 Scan總表與音檔.py 同一套）。 */
function tslGaps() {
  if (typeof TSL_WORDS === 'undefined') return null; // daily.html 沒載入 tsl.js
  const rk = new Map(); TSL_WORDS.forEach((w, i) => { const k = tslNz(w); if (!rk.has(k)) rk.set(k, i + 1); });
  const cov = new Set(); // 同一個字在別篇已有詳解就沿用，所以全部文章一起算
  DATA.forEach(x => dnExtraOf(x).forEach(e => { cov.add(tslNz(e.text || e.word)); (e.forms || []).concat(e.derived || []).forEach(f => { if (f && f.w) cov.add(tslNz(f.w)); }); }));
  const groups = []; let total = 0, ok = 0;
  [...DATA].sort((a, b) => a.week - b.week || a.day - b.day).forEach(x => {
    const miss = [];
    (x.vocab || []).forEach((v, i) => {
      const k = tslNz(v.word), r = rk.get(k); if (!r) return;
      total++; if (cov.has(k)) ok++; else miss.push({ word: v.word, i, r });
    });
    if (miss.length) groups.push({ x, miss });
  });
  return { groups, total, ok, miss: total - ok };
}
function tslBadge() {
  const g = tslGaps(); if (!g) return '';
  return `　<span class="${g.miss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">TSL 缺詳解 ${g.miss}</span>`;
}
const tslGrp = qid => { const g = tslGaps(); return g && g.groups.find(o => idOf(o.x) === qid); };
function tslEnsure(o) { o.miss.forEach(m => dnMarkVocab(o.x, o.x.vocab[m.i])); save(); return new Set(o.miss.map(m => dnKey(m.word))); }
function tslFlash(b, t) { if (!b) return; const o = b.dataset.o || (b.dataset.o = b.textContent); b.textContent = t; setTimeout(() => { b.textContent = o; }, 1200); }
function tslCopy(qid, b) { // 把這篇缺詳解的 TSL 字加進入庫，並複製只含這些字的 AI 提示詞
  const o = tslGrp(qid); if (!o) return;
  const only = tslEnsure(o);
  auCopy(dnPrompt(qid, only)); tslFlash(b, '✓ 已複製');
}
function tslToMarks(qid) { const o = tslGrp(qid); if (!o) return; tslEnsure(o); DN.mf = 'todo'; dnNav('marks'); }
function tslOpen(w, d, i) { cur.w = w; cur.d = d; dnOpenVocab(i); } // 看核心單字卡（沒有詳解時會顯示「尚未補充詳解」）
function tslCopyWords(b) {
  const g = tslGaps(); if (!g) return;
  auCopy(g.groups.flatMap(o => o.miss).sort((a, c) => a.r - c.r).map(m => m.word).join(', ')); tslFlash(b, '✓ 已複製');
}
function tslSection() {
  const sec = `${card} p-4 mb-4`, g = tslGaps();
  if (!g) return `<section id="tsl-sec" class="${sec}"><h3 class="font-bold text-sm">📚 TSL 單字詳解</h3><p class="text-xs text-amber-600 mt-1">未載入 tsl.js（請在 daily.html 加入 &lt;script src="tsl.js"&gt;）。</p></section>`;
  const sb = `${btn} border border-slate-300 dark:border-slate-700 !py-1 !px-2.5 text-xs`;
  let h = `<section id="tsl-sec" class="${sec}"><div class="flex flex-wrap items-center justify-between gap-2"><h3 class="font-bold text-sm">📚 TSL 單字詳解</h3>
    <div class="flex gap-2">${g.miss ? `<button onclick="tslCopyWords(this)" class="${sb}">複製缺詳解單字</button>` : ''}<a href="vocab.html" onclick="tslPreset('gap')" class="${sb}">TSL 總表 →</a></div></div>
    <p class="mt-1 text-xs text-slate-500">文章核心單字中屬於 TSL 的字：共 <b>${g.total}</b> 個，已有詳解 <b class="text-emerald-600 dark:text-emerald-400">${g.ok}</b>，缺詳解 <b class="${g.miss ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">${g.miss}</b>。</p>
    <div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 mt-2 overflow-hidden"><div class="h-full bg-emerald-500" style="width:${g.total ? Math.round(g.ok / g.total * 100) : 0}%"></div></div>`;
  if (!g.miss) return h + `<p class="mt-3 text-sm text-emerald-600 dark:text-emerald-400">✔ 目前每個 TSL 核心單字都有詳解</p></section>`;
  h += `<div class="mt-3 space-y-3">` + g.groups.map(o => {
    const x = o.x, id = idOf(x);
    return `<div class="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div class="flex flex-wrap items-center justify-between gap-2"><button onclick="openItem(${x.week},${x.day})" class="text-sm font-bold text-indigo-600 dark:text-indigo-400 underline cursor-pointer">W${x.week} · D${x.day} ${esc(x.tag || '')}</button>
        <div class="flex gap-1.5"><button onclick="tslCopy('${id}',this)" class="${btn} bg-indigo-600 text-white !py-1 !px-2.5 text-xs">複製 AI 提示詞（${o.miss.length}）</button><button onclick="tslToMarks('${id}')" class="${sb}">加入入庫彙整</button></div></div>
      <div class="flex flex-wrap gap-1.5 mt-2">${o.miss.map(m => `<button onclick="tslOpen(${x.week},${x.day},${m.i})" title="TSL 詞頻排名 #${m.r}" class="text-xs rounded-full px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 cursor-pointer">${esc(m.word)} <span class="opacity-60">#${m.r}</span></button>`).join('')}</div></div>`;
  }).join('') + `</div><p class="mt-3 text-[0.6875rem] text-slate-400 leading-relaxed">流程：按「複製 AI 提示詞」（會順便把這些字加入入庫）貼給 AI → AI 回傳的 JSON 存成 w{週}d{天}_extra.json → json_merge.py 合併進 daily.json → 執行 Scan總表與音檔.py 並上傳 → 重新整理，這裡與 TSL 總表就會更新。</p></section>`;
  return h;
}

/* ===== 單篇維護：資料／mp3／timing ===== */
function timingPanel(x) {
  const id = idOf(x), t = tmInfo(x), p = String(x.passage || ''), tm = x.timing || [];
  const sb = `${btn} border border-slate-300 dark:border-slate-700 !py-0.5 !px-2 text-xs shrink-0`;
  let msg;
  if (t.state === 'none') msg = `<p class="text-xs text-rose-600 dark:text-rose-400">尚未對時。放好 audio/daily/${id}.mp3 後，用 daily_timestamps.py 對時，會把 timing 寫進 daily.json。</p>`;
  else if (t.state === 'bad') msg = `<p class="text-xs text-rose-600 dark:text-rose-400 mb-1">timing 資料有誤，建議重新對時：</p><ul class="text-xs text-slate-600 dark:text-slate-400 list-disc pl-4">${t.issues.slice(0, 8).map(s => `<li>${esc(s)}</li>`).join('')}${t.issues.length > 8 ? `<li>…另有 ${t.issues.length - 8} 項</li>` : ''}</ul>`;
  else if (t.state === 'partial') msg = `<p class="text-xs text-amber-600 dark:text-amber-400 mb-1">下面的文字沒有被任何一段 timing 涵蓋（句子漏掉或對時失敗）：</p><ul class="text-xs text-slate-600 dark:text-slate-400 list-disc pl-4">${t.gaps.slice(0, 6).map(s => `<li>${esc(s.length > 90 ? s.slice(0, 90) + '…' : s)}</li>`).join('')}</ul>`;
  else msg = '<p class="text-xs text-emerald-600 dark:text-emerald-400">每一段文字都有對應的時間 ✔</p>';
  const rows = (t.state === 'ok' || t.state === 'partial') ? `<details class="mt-2"><summary class="text-xs cursor-pointer text-slate-500">逐句檢視並試聽（${tm.length} 段）</summary>${tm.map((s, i) => `<div class="flex items-center gap-2 text-xs py-0.5"><span class="shrink-0 w-5 text-slate-400">${i + 1}</span><code class="shrink-0">${(+s.start).toFixed(2)}–${(+s.end).toFixed(2)}s</code><span class="truncate flex-1 text-slate-500">${esc(p.slice(s.from, s.to))}</span><button onclick="skPlayTiming('${id}',${i})" class="${sb}">▶</button></div>`).join('')}</details>` : '';
  return `<div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3"><div class="flex flex-wrap items-center gap-2 mb-2"><p class="text-xs font-bold">⏱ Timing</p>${tmBadge(x)}${t.n ? `<span class="text-xs text-slate-500">${t.n} 段${t.dur ? ` · 最後一段結束於 ${t.dur.toFixed(1)} 秒` : ''}</span>` : ''}</div>${msg}${rows}</div>`;
}
function renderMaintItem() {
  const x = find(cur.w, cur.d);
  if (!x) { main.innerHTML = `<div class="${card} p-12 text-center text-slate-500"><h3 class="text-lg font-bold mb-2">此日內容尚未建置</h3><button onclick="openGen(${cur.w},${cur.d})" class="${btn} mt-4 bg-indigo-600 text-white">＋ 產生 AI 提示詞</button></div>`; return; }
  const id = idOf(x), words = (String(x.passage || '').match(/[A-Za-z0-9']+/g) || []).length, pp = Array.isArray(x.presentation_phrases) ? x.presentation_phrases.length : 0;
  const todo = todoOf(x), sec = `${card} p-4 md:p-6 mb-4`, bb = `${btn} border border-slate-300 dark:border-slate-700 !py-1.5 text-xs`;
  main.innerHTML = `<header class="mb-5">${tFrom() ? `<button onclick="goBack()" class="block text-xs text-indigo-600 dark:text-indigo-400 hover:underline mb-1 cursor-pointer">← ${tLabel()}</button>` : ''}<h2 class="text-xl md:text-2xl font-bold">🛠 W${x.week} · D${x.day} ${esc(x.tag || '')}</h2>
    <div class="flex flex-wrap items-center gap-2 mt-2"><span class="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">${x.type}</span>${lvBadge(x)}${stChips(x)}</div>
    <p class="mt-2 text-sm ${todo.length ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">${todo.length ? '待處理：' + todo.join('、') : '✔ mp3 與 timing 都完成'}</p></header>
  <section class="${sec}"><h3 class="font-bold text-sm mb-2">📄 資料 · ${id}</h3><p class="text-sm text-slate-600 dark:text-slate-400">daily.json ✔　英文 ${words} 字　單字 ${x.vocab.length} 個　題目 ${x.questions.length} 題${pp ? `　簡報句型 ${pp} 句` : ''}</p></section>
  <section class="${sec}"><h3 class="font-bold text-sm mb-3">🔊 音檔 · ${id}</h3>${dyPanel(x)}</section>
  <section class="${sec}"><h3 class="font-bold text-sm mb-3">⏱ Timing · ${id}</h3>${timingPanel(x)}</section>
  <div class="flex flex-wrap gap-2"><button onclick="go(${x.week},${x.day})" class="${bb}">前往學習內容</button><button onclick="goSpeak(${x.week},${x.day})" class="${bb}">試試語音練習</button><button onclick="openAudio()" class="${bb}">🎧 音檔／Timing 清單</button></div>`;
}

/* ===== 側欄：一週七天清單（學習顯示完成度；維護顯示 mp3／timing 狀態） ===== */
function dayNav(nw, M) {
  const mw = Math.max(4, ...DATA.map(x => x.week)) + (M ? 1 : 0);
  let h = `<div class="grid grid-cols-4 gap-1 mb-4">${Array.from({ length: mw }, (_, i) => i + 1).map(w => `<button onclick="setNavWeek(${w})" class="${btn} ${nw == w ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">W${w}</button>`).join('')}</div>
  <p class="text-xs text-slate-500 mb-2 font-medium">Week ${nw} · 7 大主題輪動${THEMES.length > CORE_DAYS ? '＋專案' : ''}</p><nav class="space-y-1">`;
  THEMES.forEach((t, i) => {
    const d = i + 1, x = find(nw, d), a = x && S.ans[idOf(x)];
    if (d > CORE_DAYS && !x && !M) return; // 學習區：沒有 D8 就不顯示這一列
    const st = !x ? (M ? '<span class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">＋ 新增</span>' : '<span class="text-xs text-slate-400 shrink-0">即將推出</span>')
      : M ? `<span class="flex gap-1 shrink-0">${stChips(x)}</span>`
        : a && a.done ? `<span class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">✓ ${Math.round(a.score / x.questions.length * 100)}%</span>` : '<span class="text-xs text-slate-400 shrink-0">未完成</span>';
    const on = M ? (cur.view === 'mitem' || cur.view === 'gen') && cur.w == nw && cur.d == d : (cur.view === 'day' || cur.view === 'speak' || cur.view === 'detail') && cur.w == nw && cur.d == d;
    const click = x ? `onclick="${M ? 'openItem' : 'go'}(${nw},${d})"` : M ? `onclick="openGen(${nw},${d})"` : 'disabled';
    h += `<button ${click} class="w-full text-left rounded-lg px-3 py-2 flex items-center justify-between gap-2 ${on ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800'} ${x ? '' : M ? 'border border-dashed border-indigo-400' : 'opacity-40 cursor-not-allowed'}">
      <span class="text-sm min-w-0">D${d} ${t}${x && (x.project || x.subtopic) ? `<span class="block text-[0.6875rem] text-slate-500 dark:text-slate-400 truncate">${x.project ? '📁 ' : ''}${esc(x.project || x.subtopic)}</span>` : ''}</span>
      <span class="flex items-center gap-2 shrink-0">${!M && x && x.level ? `<span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 ${lvColor(x.level.score)}">${x.level.score}</span>` : ''}${!M && x && skDone(x) ? '<span class="text-xs" title="完成語音練習">🎤</span>' : ''}${st}</span></button>`;
  });
  return h + '</nav>';
}

function renderSide() {
  const n = Object.keys(S.saved).length, nw = cur.nw ?? cur.w, v = cur.view, M = inMaint();
  const line = 'border border-slate-300 dark:border-slate-700';
  const label = v === 'book' ? '★ 生詞本／錯題本' : v === 'gen' ? `＋ 新增 W${cur.w} · D${cur.d}` : v === 'audio' ? '🎧 音檔／Timing 清單' : v === 'mitem' ? `🛠 W${cur.w} · D${cur.d}` : v === 'topics' ? '🗂 題材總覽' : v === 'marks' ? '📌 入庫彙整' : v === 'bank' ? '📚 入庫總覽' : v === 'nw' ? '🆕 新單字' : v === 'reports' ? '⚑ 回報彙整' : v === 'detail' ? '📖 詳解' : v === 'speak' ? `🎙 語音練習 W${cur.w} · D${cur.d}` : `W${cur.w} · D${cur.d} ${THEMES[cur.d - 1]}`;
  const dk = `<button onclick="fontCycle()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="調整字級">Aa</button><button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button>`;
  const root = v === 'launch' || v === 'home' || v === 'maint';
  // ===== 手機：選單／學習首頁／維護總覽顯示標題列；其他頁顯示「← 返回」列 =====
  let h = `<div class="md:hidden">` + (root
    ? `<div class="flex items-center justify-between gap-2"><h1 class="text-base font-bold">${v === 'launch' ? 'TOEIC Daily' : v === 'maint' ? '🛠 維護' : '📖 學習'}</h1>
        <div class="flex gap-2">
          ${v === 'launch' ? `<a href="index.html" class="${btn} ${line} !py-1.5" aria-label="回到首頁">⌂ 首頁</a>` : `<button onclick="showLaunch()" class="${btn} ${line} !py-1.5">☰ 選單</button>`}
          ${v === 'maint' ? `<button onclick="openTopics()" class="${btn} ${line} !py-1.5" aria-label="題材總覽">🗂</button>` : ''}
          ${v === 'home' ? `<button onclick="openBook()" class="${btn} ${line} !py-1.5" aria-label="生詞本／錯題本">★ ${n}</button>` : ''}
          ${v === 'home' ? `<button onclick="dnNav('bank')" class="${btn} ${line} !py-1.5" aria-label="入庫總覽">📚</button>` : ''}
          ${v === 'maint' ? `<button onclick="openAudio()" class="${btn} ${line} !py-1.5" aria-label="音檔／Timing 清單">🎧${AU.idx ? DATA.filter(x => !itemOk(x)).length : ''}</button>` : ''}
          ${v === 'home' || v === 'maint' ? nwMobBtn() : ''}
          ${dk}</div></div>`
    : `<div class="flex items-center gap-2"><button onclick="backHome()" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button><span class="flex-1 min-w-0 truncate text-sm font-semibold">${label}</span>${dk}</div>`) + `</div>`;
  // ===== 桌機：完整側欄 =====
  const tab = (s, t) => `<button onclick="enterSec('${s}')" class="${btn} ${SEC === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${t}</button>`;
  h += `<div class="hidden md:block">
  <div class="flex items-center justify-between mb-4 gap-2"><h1 class="text-lg font-bold">TOEIC Daily</h1>
    <a href="index.html" class="${btn} ${line}" aria-label="回到首頁">⌂ 首頁</a>
    <button onclick="fontCycle()" class="${btn} ${line}" aria-label="調整字級">Aa</button>
    <button onclick="toggleDark()" class="${btn} ${line}">${S.dark ? '☀ 淺色' : '☾ 深色'}</button></div>
  <div class="grid grid-cols-3 gap-1 mb-4"><button onclick="showLaunch()" class="${btn} ${v === 'launch' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}" title="回到選單">☰</button>${tab('learn', '📖 學習')}${tab('maint', '🛠 維護')}</div>`;
  if (SEC === 'learn') {
    h += `<button onclick="openMatrix()" class="${btn} w-full mb-3 ${line} ${v === 'home' || v === 'topics' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">▦ 總表（進度／題材）</button>` + dayNav(nw, false) + `<button onclick="openBook()" class="${btn} w-full mt-4 ${line} ${v === 'book' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">★ 生詞本／錯題本（${n}）</button>` + dnBankBtn() + nwBtn();
  } else if (SEC === 'maint') {
    const act = (c) => c ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : '';
    h += `<button onclick="up2Maint()" class="${btn} w-full mb-2 ${line} ${act(v === 'maint')}">📋 維護總覽</button>
      <button onclick="openAudio()" class="${btn} w-full mb-4 ${line} ${act(v === 'audio')}">🎧 音檔／Timing 清單（${AU.idx ? '未完成 ' + DATA.filter(x => !itemOk(x)).length : '未讀到 mp3 清單'}）</button>` + dnSideBtns() + `<button onclick="openTopics()" class="${btn} w-full mt-2 ${line} ${v === 'topics' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">🗂 題材總覽（${topicCover().replace('已涵蓋 ', '')}）</button>`
      + dayNav(nw, true) + `<p class="text-xs text-slate-500 mt-3 leading-relaxed">${THEMES.slice(0, CORE_DAYS).some((t, i) => !find(nw, i + 1)) ? '點標示「＋ 新增」的空缺日期，產生給 AI 的提示詞' : `W${nw} 已全部建置，請切換其他週次`}</p>`;
  } else h += `<p class="text-xs text-slate-500 leading-relaxed">請在右側選擇「學習」或「維護」。</p>`;
  side.innerHTML = h + '</div>';
}
function up2Maint() { cur.view = 'maint'; cur.nw = cur.w; render(); window.scrollTo({ top: 0 }); }

/* ===== 音檔／Timing 清單（維護） ===== */
function setAudF(f) { cur.audF = f; render(); }
function renderAudioAdmin() {
  const xs = [...DATA].sort((a, b) => a.week - b.week || a.day - b.day);
  const mpMiss = xs.filter(x => mp3State(x) !== 'ok'), tmMiss = xs.filter(x => tmInfo(x).state !== 'ok'), f = cur.audF || 'all';
  const list = f === 'mp3' ? mpMiss : f === 'tm' ? tmMiss : xs;
  const orph = (AU.idx && AU.idx.daily && AU.idx.daily.orphans) || [];
  const sb = `${btn} border border-slate-300 dark:border-slate-700 !py-1.5 text-xs`;
  const fb = (k, t) => `<button onclick="setAudF('${k}')" class="${btn} !py-1.5 text-xs ${f === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${t}</button>`;
  const tmTodo = tmMiss.map(x => `${idOf(x)}.mp3 | timing ${TM_LABEL[tmInfo(x).state]}`).join('\n');
  let h = `<header class="mb-5"><h2 class="text-xl md:text-2xl font-bold">🎧 音檔／Timing 清單</h2>
    <p class="mt-2 text-sm">文章 <b>${xs.length}</b> 篇　${AU.idx ? `<span class="text-emerald-600 dark:text-emerald-400">有 mp3 <b>${xs.length - mpMiss.length}</b></span>　<span class="${mpMiss.length ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}">缺 mp3 <b>${mpMiss.length}</b></span>` : '<span class="text-amber-600 dark:text-amber-400 text-xs">尚未讀到 audio/index.json（先執行 Scan總表與音檔.py；雙擊 file:// 開啟也讀不到）</span>'}　<span class="text-emerald-600 dark:text-emerald-400">timing 完成 <b>${xs.length - tmMiss.length}</b></span>　<span class="${tmMiss.length ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}">未完成 <b>${tmMiss.length}</b></span></p>
    <div class="flex flex-wrap gap-2 mt-3">${fb('all', '全部')}${fb('mp3', `缺 mp3（${mpMiss.length}）`)}${fb('tm', `timing 未完成（${tmMiss.length}）`)}
      <button onclick="recheckAudio()" class="${sb}">重新檢查</button>
      ${mpMiss.length && AU.idx ? `<button onclick="auCopy(this.dataset.t)" data-t="${esc(mpMiss.map(x => '【' + audioPath(x).split('/').pop() + '】\n' + spkParen(x.passage)).join('\n\n'))}" class="${sb}">複製缺的 mp3（檔名＋全文）</button>` : ''}
      ${tmMiss.length ? `<button onclick="auCopy(this.dataset.t)" data-t="${esc(tmTodo)}" class="${sb}">複製 timing 待辦</button>` : ''}</div>
    <p class="text-xs text-slate-500 mt-2">mp3 放 audio/daily/，檔名 w{週}d{天}.mp3；放好後執行 Scan總表與音檔.py 與 daily_timestamps.py，再重新整理。</p></header>`;
  if (orph.length) h += `<div class="${card} p-3 mb-4 text-xs text-amber-600 dark:text-amber-400">⚠ audio/daily 內有不屬於任何文章的檔案（檔名打錯？）：${orph.map(esc).join('、')}</div>`;
  if (!list.length) return main.innerHTML = h + `<div class="${card} p-8 text-center text-sm text-slate-500">${xs.length ? '這個條件下沒有項目 ✔' : '目前沒有文章'}</div>`;
  main.innerHTML = h + list.map(x => `<details class="${card} p-3 mb-2"><summary class="cursor-pointer flex flex-wrap items-center gap-2"><b class="text-sm">W${x.week} · D${x.day}</b>${stChips(x)}<code class="text-xs text-slate-500">${esc(audioPath(x).split('/').pop())}</code><span class="text-xs text-slate-500 truncate flex-1 min-w-0">${esc(x.tag || '')}</span>${x.level ? `<span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 ${lvColor(x.level.score)}">${x.level.score}</span>` : ''}</summary>
      <div class="mt-3 space-y-3">${dyPanel(x)}${timingPanel(x)}<button onclick="openItem(${x.week},${x.day})" class="${sb}">開啟這篇的維護頁</button></div></details>`).join('');
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
    ${tFrom() ? `<button onclick="goBack()" class="text-xs text-indigo-600 dark:text-indigo-400 hover:underline mb-1 cursor-pointer">← ${tLabel()}</button>` : ''}
    <div class="flex items-center gap-2">
      <h2 class="text-xl md:text-2xl font-bold">Day ${x.day} ${THEMES[x.day-1]}</h2>
    </div>
    <span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-medium">Week ${x.week} · ${x.tag}</span>
    ${x.project ? `<span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-medium" title="專案">📁 ${esc(x.project)}</span>` : ''}
    ${x.subtopic ? `<span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-medium" title="子題材">🏷 ${esc(x.subtopic)}</span>` : ''}
    ${lvBadge(x) ? ` ${lvBadge(x).replace('inline-block', 'inline-block mt-2')}` : ''}
    ${x.level && x.level.why ? `<p class="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">難度：${esc(x.level.why)}（範圍 ${esc(x.level.range || '')}，為預估值）</p>` : ''}
    <div class="mt-3 flex flex-wrap gap-2">${dnRpBtn(id, '', 'other')}</div>
  </header>


  <!-- 短文/聽力卡片 -->
  <section class="${card} p-4 md:p-6 mb-5 md:mb-6">
    <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
      <div class="flex items-center gap-2">
        <button onclick="dnToggleMk()" aria-pressed="${!!cur.mk}" title="${cur.mk ? '點一下回到播放模式' : '點一下進入標註模式（選字不再播放音檔）'}" class="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded cursor-pointer transition ${cur.mk ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}">✏️ ${x.type}${cur.mk ? ' · 標註中' : ''}</button>
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
    h += `<p id="passage-text" class="${cur.mk ? 'annot ' : ''}whitespace-pre-line leading-relaxed text-slate-700 dark:text-slate-300 font-sans">${passageHtml(x)}</p>
      <p class="mt-3 text-[0.6875rem] text-slate-400">${cur.mk ? '✏️ 標註模式：選取不懂的字、片語或句子，按「＋ 入庫」；點底線可加備註或看詳解。再按左上角按鈕回到播放模式。' : '💡 點句子會播放該句音檔；播放中可按 空白鍵 暫停／繼續，← → 倒轉／快轉 5 秒。要標註入庫，請先按上方的 ✏️ 按鈕切換到標註模式。'}</p>`;
  }

  if (zhOpen) {
    h += `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
      <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">全文繁體中文翻譯</p>
      <p id="zh-text" class="whitespace-pre-line leading-relaxed text-sm text-slate-600 dark:text-slate-400">${zhHtml(x)}</p>
    </div>`;
  }
  h += `</section>`;

  // 核心單字
  h += `<div class="flex items-center justify-between ${vOpen ? 'mb-3' : 'mb-8'} gap-2 flex-wrap"><button onclick="toggleSec('vocab')" class="font-bold text-lg cursor-pointer">${vOpen ? '▾' : '▸'} 核心多益單字（${x.vocab.length}）</button>
  <button onclick="toggleHl()" class="${btn} ${cur.hl ? 'bg-amber-100 text-slate-900 dark:bg-amber-400/30 dark:text-slate-100' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}">${cur.hl ? '取消標示單字' : '🔍 在英文文稿標示單字'}</button></div>`;
  if (vOpen) h += `<div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">`;
  if (vOpen) x.vocab.forEach((v, i) => {
    const k = `v:${id}:${i}`;
    h += `<div class="${card} p-4 flex flex-col justify-between">
      <div>
        <div class="flex items-start justify-between">
          <div>
            <button onclick="dnOpenVocab(${i})" class="text-base font-bold text-left underline decoration-dotted decoration-slate-400 underline-offset-4 hover:text-indigo-600 cursor-pointer">${esc(v.word)}</button>
            <span class="text-xs text-slate-500 italic ml-1">${esc(v.pos)}</span>
            <p class="text-xs text-slate-400">${esc(v.ipa)}</p>
          </div>
          <button onclick="vplay('${id}', this.dataset.w, '', this.dataset.w)" data-w="${esc(v.word)}" class="text-slate-400 hover:text-indigo-600 text-lg">🔊</button>
        </div>
        <p class="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">${esc(v.zh)}</p>
        <p class="text-xs mt-1 text-slate-500 dark:text-slate-400">搭配詞：${esc(v.col)}</p>${dyMulti(x, v)}
      </div>
      <button onclick="dnOpenVocab(${i})" class="${btn} mt-3 text-xs w-full border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">詳解 ›</button>
      <button onclick="toggleSave('${k}')" class="${btn} mt-2 text-xs w-full border border-slate-200 dark:border-slate-800 ${S.saved[k] ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}">
        ${S.saved[k] ? '★ 已加入生詞本' : '☆ 收藏單字'}
      </button>
    </div>`;
  });
  if (vOpen) h += `</div>`;

  // 簡報常用句型（僅資料含 presentation_phrases 時顯示，通常為 D7 會議、簡報與提案）
  const pp = Array.isArray(x.presentation_phrases) ? x.presentation_phrases : [];
  if (pp.length) {
    const pOpen = !!cur.phrasesOpen;
    h += `<div class="flex items-center justify-between ${pOpen ? 'mb-3' : 'mb-8'} gap-2"><button onclick="toggleSec('phrases')" class="font-bold text-lg cursor-pointer">${pOpen ? '▾' : '▸'} ${x.day > CORE_DAYS ? '常用句型' : '簡報常用句型'}（${pp.length}）</button></div>`;
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

  // 我的入庫（選字入庫）
  h += dnDaySec(x);

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
        ${dnRpBtn(id, 'Q' + (qi + 1), 'quiz')}
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
        <div>${dnWhyH(x, q, qi, ok)}</div>
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
    <button onclick="retry()" class="${btn} border border-slate-300 dark:border-slate-700">重做本日</button>
    <button onclick="dnAllWhy(true)" class="${btn} border border-slate-300 dark:border-slate-700 !px-3 text-xs">展開全部解析</button><button onclick="dnAllWhy(false)" class="${btn} border border-slate-300 dark:border-slate-700 !px-3 text-xs">收合</button>`;
  }
  h += `</div>`;
  }
  h += skEntryHtml(x);
  main.innerHTML = h + `<button onclick="backHome()" class="${btn} md:hidden w-full mt-6 border border-slate-300 dark:border-slate-700">← 返回 W${x.week} 選擇其他天</button>`;
  dnAfterDay();
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
      const w = x.vocab[idx]; if (!w) return;
      v += `<div class="${card} p-4 flex justify-between items-start">
        <div>
          <div class="flex items-center gap-2">
            <b class="text-base">${esc(w.word)}</b>
            <span class="text-xs text-slate-400">${esc(w.pos)} ${esc(w.ipa)}</span>
            <button onclick="vplay('${idOf(x)}', this.dataset.w, '', this.dataset.w)" data-w="${esc(w.word)}" class="text-sm">🔊</button>
          </div>
          <p class="text-sm font-medium mt-1">${esc(w.zh)}</p>
          <p class="text-xs text-slate-500 mt-1">搭配詞：${esc(w.col)}</p>
        </div>
        ${rm}
      </div>`;
    } else {
      const z = x.questions[idx]; if (!z) return;
      q += `<div class="${card} p-4">
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs text-indigo-500 font-medium">Week ${x.week} Day ${x.day} · ${THEMES[x.day-1]}</span>
          ${rm}
        </div>
        <p class="font-medium text-sm my-1">${esc(z.q)}</p>
        <p class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">正解 (${L[z.ans]}): ${esc(z.opts[z.ans])}</p>
        <p class="text-xs text-slate-500 mt-1">${esc((z.why || [])[z.ans] || '')}</p>
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
const tmOk = x => { const tm = x.timing, p = String(x.passage || ''); return Array.isArray(tm) && tm.length > 0 && tm.every((t, i) => t.from < t.to && t.to <= p.length && (i === 0 || t.from >= tm[i-1].to)); };
(function () { const st = document.createElement('style'); st.textContent = '#zh-text .zsent{cursor:pointer;border-radius:3px}#zh-text .zsent.active{background:rgba(250,204,21,.35)}'; document.head.appendChild(st); })();
function zhHtml(x) { // 中文翻譯：切成句子，對應到英文 timing 的句子；播放時中英文同一句一起亮，點中文句也能跳到該句
  const zh = String(x.zh || '');
  if (!tmOk(x)) return esc(zh);
  const toks = zh.match(/[^。！？!?\n]*[。！？!?]+[」』”’）)"']*|[^。！？!?\n]+|\n+/g) || [];
  const si = []; toks.forEach((t, k) => { if (/\S/.test(t)) si.push(k); });
  const n = si.length, tm = x.timing, m = tm.length;
  if (!n) return esc(zh);
  const map = new Array(n);
  if (n === m) { for (let j = 0; j < n; j++) map[j] = j; } // 中英句數相同：一句對一句
  else { // 句數不同（翻譯合併或拆句）：依字數比例對應到最近的英文句
    const pl = String(x.passage).length || 1, lens = si.map(k => toks[k].replace(/\s/g, '').length), tot = lens.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    for (let j = 0; j < n; j++) {
      const c = (acc + lens[j] / 2) / tot; acc += lens[j];
      let best = 0, bd = Infinity;
      tm.forEach((t, i) => { const a = t.from / pl, b = t.to / pl, d = c < a ? a - c : c > b ? c - b : 0; if (d < bd) { bd = d; best = i; } });
      map[j] = j ? Math.max(map[j - 1], best) : best;
    }
  }
  const id = idOf(x); let out = '', j = 0;
  toks.forEach(t => { if (/\S/.test(t)) { out += `<span class="zsent" data-z="${map[j]}" onclick="spSeek('${id}',${map[j]})">${esc(t)}</span>`; j++; } else out += esc(t); });
  return out;
}
function passageHtml(x) { // 英文文稿：核心單字標示 + 依 timing 切成可點擊、可高亮的句子
  let re = null;
  if (cur.hl) {
    const ws = x.vocab.map(v => v.word.trim()).filter(Boolean)
      .map(w => { const e = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return /\s/.test(w) ? e : e.replace(/e$/i, ''); })
      .sort((a, b) => b.length - a.length);
    if (ws.length) re = new RegExp('\\b(' + ws.join('|') + ')[a-z]*', 'gi');
  }
  const chunk = str => { const t = esc(str); return re ? t.replace(re, m => `<mark class="hl">${m}</mark>`) : t; };
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
const cefrOf = s => s < 575 ? 'A2+' : s < 625 ? 'B1' : s < 675 ? 'B1+' : s < 775 ? 'B2' : s < 825 ? 'B2+' : 'C1';
const clampSc = v => Math.max(400, Math.min(990, Math.round(v / 5) * 5));
function openGen(w, d) { SEC = 'maint'; cur = { w, d, nw: w, view: 'gen' }; push(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function genRefs(w, d) { // 同週最近一篇較早／較晚、已存在的文章
  let prev = null, next = null;
  for (let k = d - 1; k >= 1 && !prev; k--) { const x = find(w, k); if (x && x.level) prev = x; }
  for (let k = d + 1; k <= CORE_DAYS && !next; k++) { const x = find(w, k); if (x && x.level) next = x; }
  return { prev, next };
}
function genEff(w, d) { // 該篇的有效分數：已建置者用實際分數 → 已手動設定者 → 否則用建議值
  const x = find(w, d); if (x && x.level) return x.level.score;
  const g = S.gen && S.gen[`w${w}d${d}`]; if (g && g.score != null) return g.score;
  return genSuggest(w, d).score;
}
function genSuggest(w, d) { // W2 以後：上一週同一天 + 25；W1 沒有上週：從 600 起、同週逐日上升（D7 約 +100，且至少比前一篇高 10）
  if (w > 1) return { score: clampSc(genEff(w - 1, d) + 25), kind: 'week' };
  const f = 600 + Math.round((Math.min(d, CORE_DAYS) - 1) * 100 / 6 / 10) * 10, { prev } = genRefs(w, d);
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
  return { id, sug, score: g.score != null ? g.score : sug.score, manual: g.score != null && g.score !== sug.score, type: g.type || (cur.d > CORE_DAYS ? 'text' : 'auto'), note: g.note || '', project: g.project || '' };
}
function genSet(k, v) {
  S.gen = S.gen || {}; const g = S.gen[`w${cur.w}d${cur.d}`] = S.gen[`w${cur.w}d${cur.d}`] || {};
  if (v == null || v === '') delete g[k]; else g[k] = v;
  save();
}
function genStep(n) { genSet('score', clampSc(genG().score + n)); render(); }
function genInput(v) { const n = parseFloat(v); if (isFinite(n)) genSet('score', clampSc(n)); render(); }
function genReset() { genSet('score', null); render(); }
function genType(t) { genSet('type', t === 'auto' && cur.d <= CORE_DAYS ? null : t); render(); } // D8 預設＝按照文本，所以 auto 要明確存起來
function genProj(v) { genSet('project', v.trim() ? v.trim() : null); const el = document.getElementById('gen-prompt'); if (el) el.value = genPrompt(); }
function genNote(v) { genSet('note', v.trim() ? v : null); const el = document.getElementById('gen-prompt'); if (el) el.value = genPrompt(); }
function genLen(s) { const t = Math.max(0, Math.min(1, (s - 600) / 250)); return t < 0.34 ? '偏短' : t < 0.67 ? '中等' : '偏長'; }
/* ===== TSL 候選單字：從 tsl.js（依詞頻排名）挑出「還沒收錄」的字，並依本篇難度取不同區段，放進新增文章的提示詞 ===== */
const TSL_POOL = 24;        // 每篇提供幾個候選字（範圍放寬讓 AI 依主題挑；AI 原則上用 2–5 個，與「我的新單字」大約各占一半，其餘留給之後的文章）
const tslNz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim(); // 自備，不依賴其他函式內的 nz
const TSL_BY_LEVEL = true;  // true＝依難度取區段（分數低取前段＝較常見、分數高取後段＝較少見）；false＝一律取最前面
function tslUsed() { // 已收錄 = 既有文章的 vocab.word 與 extra_vocab.text（含 -s/-es/-d/-ed/-ing 變化形）
  const u = new Set();
  DATA.forEach(x => { (x.vocab || []).forEach(v => u.add(tslNz(v.word))); (x.extra_vocab || []).forEach(v => u.add(tslNz(v.text))); });
  return u;
}
function tslUnused() {
  if (typeof TSL_WORDS === 'undefined') return null; // daily.html 沒載入 tsl.js
  const u = tslUsed();
  const hit = w => [w, w + 's', w + 'es', w + 'd', w + 'ed', w + 'ing', w.replace(/e$/, '') + 'ing', w.replace(/y$/, 'ies'), w.replace(/y$/, 'ied')].some(k => u.has(k));
  const nwx = typeof nwPoolKeys === 'function' ? nwPoolKeys() : new Set(); // 已列為「我的新單字」的字不要再當 TSL 候選字
  return TSL_WORDS.filter(w => !hit(tslNz(w)) && !nwx.has(tslNz(w)));
}
function tslPick(score) { // 未收錄清單依詞頻排名排列；600 分從最前面取、850 分以上從最後面取，中間按比例
  const all = tslUnused(); if (!all) return null;
  const t = TSL_BY_LEVEL ? Math.max(0, Math.min(1, (score - 600) / 250)) : 0;
  const st = Math.round(t * Math.max(0, all.length - TSL_POOL)), words = all.slice(st, st + TSL_POOL);
  const rk = w => TSL_WORDS.indexOf(w) + 1;
  return { words, left: all.length, r1: words.length ? rk(words[0]) : 0, r2: words.length ? rk(words[words.length - 1]) : 0 };
}
function tslMap() { // 變化形 → TSL 原字（例如 renewed → renew）
  if (typeof TSL_WORDS === 'undefined') return null;
  const m = new Map();
  TSL_WORDS.forEach((w, i) => { const b = tslNz(w); [b, b + 's', b + 'es', b + 'd', b + 'ed', b + 'ing', b.replace(/e$/, '') + 'ing', b.replace(/y$/, 'ies'), b.replace(/y$/, 'ied')].forEach(k => { if (!m.has(k)) m.set(k, { w, r: i + 1 }); }); });
  return m;
}
function tslHits() { // 每篇文章實際收錄了哪些 TSL 單字：[{x, list:[{word, w, r}]}]
  const m = tslMap(); if (!m) return null;
  const out = [];
  [...DATA].sort((a, b) => a.week - b.week || a.day - b.day).forEach(x => {
    const seen = new Set(), list = [];
    [...(x.vocab || []).map(v => v.word), ...(x.extra_vocab || []).map(v => v.text)].forEach(t => {
      const h = m.get(tslNz(t)); if (h && !seen.has(h.w)) { seen.add(h.w); list.push({ word: t, w: h.w, r: h.r }); }
    });
    if (list.length) out.push({ x, list });
  });
  return out;
}
function tslPanel(s) {
  const tp = tslPick(s), hs = tslHits();
  if (!tp || !hs) return '<p class="text-[0.6875rem] text-amber-600 mb-2">未載入 tsl.js，提示詞沒有帶入 TSL 候選字（請在 daily.html 加入 &lt;script src="tsl.js"&gt;）。</p>';
  const chip = (t, c) => `<span class="inline-block rounded-full px-2 py-0.5 text-xs ${c}">${t}</span>`;
  const total = hs.reduce((n, h) => n + h.list.length, 0);
  return `<div class="rounded-lg border border-slate-200 dark:border-slate-800 p-3 mb-3 text-xs">
    <p class="font-bold mb-1">本篇候選 TSL 單字（${s} 分，詞頻排名 #${tp.r1}–#${tp.r2}）</p>
    <div class="flex flex-wrap gap-1 mb-1">${tp.words.map(w => chip(esc(w), 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300')).join('')}</div>
    <p class="text-slate-500 mb-2">AI 原則上會從這些字用 2–5 個（可視情況增減，與新單字大約各占一半）；合併進 daily.json 後，被挑中的就會出現在下方「已收錄」。TSL 尚未收錄 <b>${tp.left}</b> / ${TSL_WORDS.length} 字。</p>
    <details><summary class="cursor-pointer font-bold">已收錄的 TSL 單字：${total} 個（${hs.length} 篇）</summary>
      <div class="mt-2 space-y-1.5">${hs.map(h => `<div><span class="text-slate-500">w${h.x.week}d${h.x.day}</span> ${h.list.map(i => chip(`${esc(i.word)} <span class="opacity-60">#${i.r}</span>`, 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300')).join(' ')}</div>`).join('')}</div>
    </details></div>`;
}
function genPromptText(g) { // 按照文本：passage 由使用者提供，AI 只設計單字詳解、考題、常用句等周邊內容
  const w = cur.w, d = cur.d, pool = SUBTOPICS['D' + d] || [], L = [];
  L.push(`請依我提供的 daily.json（內含 _spec 規格與既有 items）生成 ${g.id}。`, '');
  L.push('【模式：按照文本】',
    '・本篇的英文文本由我提供，附在本提示詞最下方「【我的文本】」之後。',
    '・passage 欄位請「逐字照抄」我的文本（不改寫、不增刪、不潤飾、不更正；段落以 \\n\\n 分隔）。你不需要自己設計文章。',
    '・你只需要針對這份文本產生：tag、level、zh（全文繁體中文翻譯）、vocab（單字詳解）、questions（考題）、presentation_phrases（常用句）。', '');
  L.push('【基本資訊】', `・Week ${w}、Day ${d}（主題：${THEMES[d - 1]}）` + (d > CORE_DAYS ? '；_spec 只寫到 D7，D8 為例外，請照填 day: 8，不需要 subtopic' : ''),
    '・type：依文本性質判斷（書面文件、郵件、報告 → Reading；口說稿、對話、廣播 → Listening）');
  if (g.project) L.push(`・project：${g.project}（請在輸出 JSON 的 tag 後面加 "project" 欄位，值固定為此字串）`);
  L.push('');
  L.push('【難度】已不需要詢問難度；請依文本本身的實際難度評估。', '・level.score 填你評估的多益分數（50 的倍數）、range 為 score ±50，cefr 與 why 依 _spec 的 rules.difficulty；不要為了符合建議值而更動文本。', '');
  L.push('【長度】文本多長就多長，不受 _spec 的 passage_length 限制；題數依文本字數，照 _spec 的 questions.count。', '');
  L.push('【單字詳解 vocab】',
    '・3–6 個（文本較長可取上限），必須實際出現在文本中（原形或僅加 -s/-es/-d/-ed/-ing；片語須與文本寫法完全一致）。',
    '・優先選多益高頻商務字彙，或文本中對學習最有用的字；不得與既有 items 的單字重複。',
    '・這是自備文本，不需要套用 TSL 候選字或「我的新單字」，也不要為了塞字而改動文本。', '');
  L.push('【考題 questions】', '・依 _spec 規則：context 與 part5 各約一半（先 context 後 part5）、固定 4 個選項、why 共 4 句且正解那句以「正解：」開頭、正解位置分散。',
    '・context 題依文本內容出題；part5 與文本主題相關、不看文本也能作答，且不是直接把文本句子挖空。', '');
  L.push('【常用句 presentation_phrases】', '・從這份文本的主題與情境整理 6–8 句實用常用句型（可取自文本，或與文本情境相關的延伸句），每筆含 phrase、meaning、usage，格式同 _spec。', '');
  if (pool.length) L.push('【子題材】', `・本日（D${d}）可選子題材：${pool.join('、')}`, '・請依文本內容選最接近的一個，填入 "subtopic"（須與清單文字完全一致）。', '');
  if (g.note.trim()) L.push('【補充要求】', g.note.trim(), '');
  L.push('【輸出】', '・只輸出 JSON，放在單一 json 程式碼區塊內，單篇輸出單一物件；格式與自我檢查依 _spec 的 how_to_use.output 與 rules.self_check（與「AI 自行設計文章」有關的項目，例如難度建議值，在本模式不適用）。',
    '・不要輸出整份 daily.json、不要輸出 timing 欄位；tag 與 vocab 單字不得與既有 items 重複。', '');
  L.push('【我的文本】', '（請把文本貼在這一行下方）');
  return L.join('\n');
}
function genPrompt() {
  if (genG().type === 'text') return genPromptText(genG());
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
  if (typeof nwGenLines === 'function') L.push(...nwGenLines()); // 我的新單字（優先於 TSL 候選字）
  const tp = tslPick(s);
  if (tp && tp.words.length) {
    L.push('【TSL 候選單字】', `・以下是 TSL（New TOEIC Service List）中「尚未收錄」、且程度符合本篇難度（約 ${s} 分）的單字（詞頻排名 #${tp.r1}–#${tp.r2}，數字越大越少見）：${tp.words.join(', ')}`,
      '・請從中挑「原則上 2–5 個」最符合本篇主題與情境的單字，自然地寫進 passage 並放進 vocab；這只是原則、不是硬性規定，可依文章情境與長度增加或減少；不適合的不要硬塞，沒用到的會留給之後的文章。',
      '・本篇的新單字與 TSL 候選字大約各占一半（各約 2–5 個）；若「我的新單字」不足，TSL 候選字可多用幾個，反之亦然。',
      '・vocab 總數仍依 _spec（3–6 個）；若清單以外還有更適合的商務字彙，可補足但不得與既有 items 重複。', '');
  }
  { const pool = SUBTOPICS['D' + d] || [], used = DATA.filter(x => x.day == d && x.subtopic).map(x => x.subtopic), fresh = pool.filter(t => !used.includes(t)), lastW = DATA.filter(x => x.day == d && x.week < w && x.subtopic).sort((a, b) => b.week - a.week)[0];
    if (pool.length) L.push('【子題材】', `・本日（D${d}）可選子題材：${pool.join('、')}`, fresh.length ? `・尚未用過：${fresh.join('、')}；請優先從中挑一個。` : '・清單都用過了，請循環使用，並避免與前一週相同。', lastW ? `・上一週同日（w${lastW.week}d${d}）的子題材是「${lastW.subtopic}」，請不要重複。` : '', '・請在輸出 JSON 的 tag 後面加 "subtopic" 欄位，填所選子題材（須與清單文字完全一致）。', ''); }
  if (g.note.trim()) L.push('【補充要求】', g.note.trim(), '');
  L.push('【輸出】', '・只輸出 JSON，放在單一 json 程式碼區塊內，單篇輸出單一物件；格式與自我檢查依 _spec 的 how_to_use.output 與 rules.self_check。', '・不要輸出整份 daily.json、不要輸出 timing 欄位；tag、情境與 vocab 單字不得與既有 items 重複。');
  return L.join('\n');
}
/* ===== 音檔維護（沿用 audio.js 的 AU／auCopy；daily 是整篇一個 mp3，所以每篇只有一個檔） ===== */
function dyPanel(x) {
  const id = idOf(x), path = audioPath(x), fn = path.split('/').pop(), has = dyHas(x), pass = String(x.passage || '');
  const sb = `${btn} border border-slate-300 dark:border-slate-700 !py-0.5 !px-2 text-xs shrink-0`;
  const cp = (t, label) => `<button onclick="auCopy(this.dataset.t)" data-t="${esc(t)}" class="${sb}">${label}</button>`;
  const first = (pass.split(/\n+/).map(t => t.trim()).find(Boolean)) || '';
  return `<div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><p class="text-xs font-bold">🔊 音檔 ${has ? '1/1（完整，播放用 mp3）' : '0/1（缺，播放改用機器發音）'}${AU.idx ? '' : ' · 尚未讀到 audio/index.json'}</p>${has ? '' : cp(fn + ' | ' + spkParen(pass), '複製缺的（檔名 | 全文）')}</div>
    <div class="flex items-center gap-2 text-xs py-0.5"><span class="${has ? 'text-emerald-600' : 'text-rose-500'}">${has ? '✔' : '✖'}</span><code class="shrink-0">${esc(fn)}</code><span class="truncate flex-1 text-slate-500">${esc(first)}</span>${cp(fn, '檔名')}${cp(path, '路徑')}${cp(spkParen(pass), '全文')}</div>
    <p class="text-[0.6875rem] text-slate-400 mt-1">放到 ${esc(path.slice(0, path.lastIndexOf('/') + 1))}，再執行 Scan總表與音檔.py 並重新整理本頁。</p></div>`;
}
const dyHead = '音檔總覽';

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
    return `<div class="rounded-lg px-2 py-1.5 text-center min-w-[3.5rem] ${cls}"><div class="text-[0.6875rem] text-slate-500">D${k}</div><div class="text-sm font-semibold">${v}</div><div class="text-[0.625rem] text-slate-400">${k === d ? '本篇' : x ? '已有' : '建議'}</div></div>`;
  }).join('');
  main.innerHTML = `<header class="mb-6">
    <h2 class="text-xl md:text-2xl font-bold">＋ 新增文章 · Day ${d} ${THEMES[d - 1]}</h2>
    <span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-medium">Week ${w} · ${g.id}</span>
  </header>

  <section class="${card} p-4 md:p-6 mb-5">
    <h3 class="font-bold mb-1">① 檔名</h3>
    <p class="text-xs text-slate-500 mb-3 leading-relaxed">把 AI 回覆的 JSON 存成這個檔名，再用 json_merge.py 合併進 daily.json。</p>
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
    <div class="flex flex-wrap gap-2 mb-3">${seg('auto', '由 AI 決定')}${seg('text', '按照文本')}${seg('Reading', 'Reading 閱讀')}${seg('Listening', 'Listening 聽力')}</div>
    ${g.type === 'text' ? '<p class="text-xs text-slate-500 mb-3 leading-relaxed">AI 不會自己寫文章，也不會改動你的文本；只針對文本設計單字詳解、考題與常用句。複製提示詞後，把文本貼在提示詞最下方一起送出。</p>' : ''}
    ${d > CORE_DAYS ? `<label class="block text-xs text-slate-500 mb-1">專案小標籤（會顯示在文章上，也可在「題材總覽」依專案查找）</label><input type="text" value="${esc(g.project)}" oninput="genProj(this.value)" placeholder="例如：6H12專案" class="${fld} w-full px-3 py-2 text-sm mb-3">` : ''}
    <textarea rows="2" oninput="genNote(this.value)" placeholder="例如：題材請與航空公司客服有關、請多出現被動語態…" class="${fld} w-full p-3 text-sm">${esc(g.note)}</textarea>
  </section>

  <section class="${card} p-4 md:p-6">
    <h3 class="font-bold mb-1">④ 給 AI 的提示詞</h3>
    <p class="text-xs text-slate-500 mb-3 leading-relaxed">請連同 daily.json 一起提供給 AI（提示詞不含 JSON 內容）。</p>
    ${nwGenPanel()}${tslPanel(s)}
    <textarea id="gen-prompt" readonly rows="16" class="${fld} w-full p-3 text-xs leading-relaxed font-mono">${esc(genPrompt())}</textarea>
    <button onclick="copyEl('gen-prompt',this)" class="${btn} mt-3 bg-indigo-600 text-white">複製提示詞</button>
  </section>`;
}

function render() {
  render.m = isMobile();
  if (!SEC && cur.view !== 'launch') cur.view = 'launch';
  const key = cur.view + cur.w + cur.d;
  if (render.k !== undefined && render.k !== key) { spStop(); skStopAll(); } // 切換頁面即停止語音／錄音
  render.k = key;
  if (!['day', 'mitem', 'speak', 'detail', 'topics'].includes(cur.view)) TBACK = null;
  Sp.hlIdx = -2;
  document.documentElement.classList.toggle('dark', S.dark);
  renderSide();
  const V = { launch: renderLaunch, home: renderMatrix, day: renderDay, speak: skRender, book: renderBook, gen: renderGen, audio: renderAudioAdmin, maint: renderMatrix, topics: renderMatrix, mitem: renderMaintItem, marks: dnRenderMarks, bank: dnRenderBank, reports: dnRenderReports, detail: dnRenderDetail, nw: nwRender };
  (V[cur.view] || renderDay)();
  if (Sp.mode === 'audio' && Sp.au && Sp.id) spHl(Sp.id, Sp.au.currentTime);
  dnSyncBar();
}

function go(w, d) {
  TBACK = TKEEP; TKEEP = null; SEC = 'learn'; cur = { w, d, nw: w, view: 'day', showTranscript: false };
  S.last = { w, d }; save();
  push(); render();
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
  try { DATA = itemsOf(JSON.parse(t)); showLaunch(); }
  catch (e) { alert('daily.json 格式有誤：' + e.message); }
}
function pickJson(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => loadFromText(r.result); r.readAsText(f, 'utf-8');
}
/* 從 vocab.html 連過來：#vocab=單字 → 開到該單字所在那天，並打開核心單字詳解 */
function openVocabByHash() {
  const m = location.hash.match(/^#vocab=(.+)$/); if (!m) return false;
  const nz = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const q = nz(decodeURIComponent(m[1]));
  // 寬鬆比對：入庫的是 annual、TSL 總表是 annually 這類「同字根、只差字尾」的情況（較長者以較短者開頭、最多差 3 字、較短者至少 5 字）
  const near = (a, b) => { if (!a || !b || a === b) return false; const s = a.length <= b.length ? a : b, l = s === a ? b : a; return s.length >= 5 && l.startsWith(s) && l.length - s.length <= 3; };
  const open = (x, i, e) => {
    SEC = 'learn'; cur = { w: x.week, d: x.day, nw: x.week, view: 'day', showTranscript: false };
    VBACK = { w: x.week, d: x.day };
    render();
    if (i >= 0) dnOpenVocab(i);                       // 核心單字 → 開詳解
    else if (e) dnOpenExtra(idOf(x), e.text || e.word); // 入庫單字（extra_vocab）→ 也開詳解
    return true;
  };
  const mk = dnMarks().find(m => nz(m.text) === q && dnArt(m.qid)); // 只入庫、還沒寫回的字：開到入庫所在篇的詳解（顯示「待補詳解」）
  if (mk && !DATA.some(x => (x.vocab || []).some(v => nz(v.word) === q) || (x.extra_vocab || []).some(e => nz(e.text || e.word) === q))) { const x = dnArt(mk.qid); return open(x, -1, { text: mk.text }); }
  for (const ok of [(w) => w === q, (w) => near(w, q)]) { // 先精確比對，找不到再用寬鬆比對
    for (const x of DATA) {
      const i = (x.vocab || []).findIndex(v => ok(nz(v.word)));
      const e = (x.extra_vocab || []).find(e => ok(nz(e.text || e.word)));
      if (i >= 0 || e) return open(x, i, i >= 0 ? null : e);
    }
  }
  return false;
}
async function boot() {
  try {
    const res = await fetch('daily.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    DATA = itemsOf(await res.json());
    await auLoad();
  } catch (e) { return bootFail(e); }
  try {
    cur.view = 'launch'; render(); try { if (typeof nwMigrate === 'function') nwMigrate(); } catch (e) { console.error(e); }
    if (location.hash === '#tsl') { enterSec('maint'); setTimeout(() => { const e = document.getElementById('tsl-sec'); if (e) e.scrollIntoView({ block: 'start' }); }, 50); } else if (location.hash === '#maint') enterSec('maint'); else if (location.hash === '#learn') enterSec('learn'); else if (location.hash === '#nw') dnFromLaunch('nw');
    else if (/^#vocab=/.test(location.hash)) openVocabByHash();
  } catch (e) { console.error(e); main.innerHTML = `<div class="${card} p-8 text-center text-sm text-rose-600">畫面渲染失敗：${esc(e.message)}（請按 F12 看 Console）</div>`; }
}
function bootFail(e) {
  {
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
