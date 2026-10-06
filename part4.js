/* Part 4 簡短獨白：依 PART_UI_GUIDE 以 Part 1 為準重構。
   一組＝一段獨白＋3題四選一；練習／測驗／錯題本／提報／維護。
   音訊：audio/index.json 的 p4.complete 有此題 → 播 audio/p4/{id}.mp3；否則瀏覽器 TTS。
   localStorage：PK=toeicPart4V1（不改）；共用鍵 toeicCoachV2 只讀寫 dark。 */
const KEY = 'toeicCoachV2', PK = 'toeicPart4V1';
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
let R = { rec: {}, saved: {}, tests: {}, reports: [] };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
if (!R.tests) R.tests = {};
if (!Array.isArray(R.reports)) R.reports = [];
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };

let DATA = [], SPEC = null, RAW = [], HEALTH = { err: [], warn: [], info: [] };
const TESTN = 3;   // 每次測驗組數（一組＝3題）
const TARGET = 2;  // 每格（難度×主題）目標組數
const PRE = 10, ANS = 24;
const TIER = { easy: '初級', medium: '中級', hard: '高級' };
const TS = { easy: 'e', medium: 'm', hard: 'h' };
const QT = { main: '主旨', detail: '細節', infer: '推論', intent: '意圖', next: '未來行動', graphic: '圖表', who: '身份' };
const TR = {
  'mention-not-ask': '提到但非所問', 'wrong-speaker': '張冠李戴', 'number-mix': '數字混淆',
  'sound-alike': '音近字', 'over-infer': '過度推論', opposite: '相反', partial: '部分正確'
};
const MT = {
  voicemail: '電話留言', announcement: '公告／廣播', news: '新聞報導', ad: '廣告',
  radio: '廣播節目', tour: '導覽介紹', meeting: '會議摘錄', speech: '演講'
};
const DOM_DEF = {
  d1: { n: '辦公室', scenes: ['office'] },
  d2: { n: '餐廳飲食', scenes: ['restaurant'] },
  d3: { n: '商店購物', scenes: ['store'] },
  d4: { n: '街道與交通', scenes: ['street', 'station'] },
  d5: { n: '工地與倉庫', scenes: ['workplace'] },
  d6: { n: '旅館與居家', scenes: ['hotel', 'home'] },
  d7: { n: '戶外與公園', scenes: ['outdoor'] }
};
let DOM = DOM_DEF;

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');

const okSet = x => x && x.id && Array.isArray(x.script) && x.script.length && Array.isArray(x.questions) && x.questions.length &&
  x.questions.every(q => q.q && Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.filter(c => c.ok).length === 1);
const tierOf = x => (x.level && x.level.tier) || 'medium';
const find = id => DATA.find(x => x.id === id);
const pool = (t, m) => DATA.filter(x => (!t || tierOf(x) === t) && (!m || x.domain === m));
const L = 'ABCD';

/* ---------- 音訊 ---------- */
const AU = new Set(); AU.partial = {};
const SPEEDS = [0.75, 1, 1.25];
const P = { tok: 0, a: null, vs: [], on: false, unlocked: false, speed: (() => { try { const v = parseFloat(localStorage.getItem('p4speed')); return SPEEDS.includes(v) ? v : 1; } catch (e) { return 1; } })() };
function setSpeed(v) { v = parseFloat(v); if (!SPEEDS.includes(v)) return; P.speed = v; try { localStorage.setItem('p4speed', v); } catch (e) {} if (P.a) { try { P.a.defaultPlaybackRate = v; P.a.playbackRate = v; } catch (e) {} } document.querySelectorAll('[data-spd]').forEach(b => { const on = +b.dataset.spd === v; b.classList.toggle('bg-indigo-600', on); b.classList.toggle('text-white', on); b.classList.toggle('bg-slate-100', !on); b.classList.toggle('dark:bg-slate-800', !on); }); }
const speedH = () => `<span class="inline-flex items-center gap-1"><span class="text-xs text-slate-500">語速</span>${SPEEDS.map(v => `<button data-spd="${v}" onclick="setSpeed(${v})" class="${btn} !py-1.5 !px-2.5 text-xs ${v === P.speed ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${v}×</button>`).join('')}</span>`;
const T = { id: null, k: 0 };
async function auLoad() {
  try {
    const j = await (await fetch('audio/index.json', { cache: 'no-store' })).json();
    ((j.p4 && j.p4.complete) || []).forEach(i => AU.add(i));
    AU.partial = (j.p4 && j.p4.partial) || {};
  } catch (e) {}
}
const hasTTS = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const VBAD = /novelty|fred|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
const vsc = v => {
  const n = v.name + ' ' + v.voiceURI; let s = 0;
  if (/premium|enhanced|增強|高品質|進階|natural|online/i.test(n)) s += 10;
  if (/google/i.test(n)) s += 5;
  if (/^en[-_]US$/i.test(v.lang)) s += 3;
  if (/^en[-_](IN|ZA|IE|SG|PH)$/i.test(v.lang)) s -= 5;
  if (VBAD.test(v.name)) s -= 50;
  return s;
};
const isTZ = v => !!v && /\b(Tom|Zoe)\b/i.test(v.name);
if (hasTTS()) {
  const g = () => { try { P.vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => vsc(b) - vsc(a)); } catch (e) {} };
  g(); try { speechSynthesis.addEventListener('voiceschanged', g); } catch (e) {}
}
const voiceFor = g => {
  const us = P.vs.filter(v => /^en[-_]US$/i.test(v.lang));
  return g === 'F'
    ? (us.find(v => /\bZoe\b/i.test(v.name)) || P.vs.find(v => /female|samantha|zira|karen|susan|hazel|jenny|aria|victoria/i.test(v.name)))
    : (us.find(v => /\bTom\b/i.test(v.name)) || P.vs.find(v => /david|james|daniel|alex|fred|mark|george|guy|ryan|\bmale/i.test(v.name) && !/female/i.test(v.name)));
};
function unlockTTS() {
  if (P.unlocked || !hasTTS()) return; P.unlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
}
function clr() { if (T.id) { clearInterval(T.id); T.id = null; } }
function stop() {
  P.tok++; clr();
  if (P.a) { P.a.pause(); P.a = null; }
  try { speechSynthesis.cancel(); } catch (e) {}
  paintBar(false);
}
const gOf = x => ((x.speakers || [])[0] || {}).gender || '?';
function say(x, idx, tok, next) {
  const l = x.script[idx], g = gOf(x) === 'M' ? 'M' : 'F';
  const done = () => { if (tok === P.tok) next(); };
  if (!hasTTS()) return done();
  const u = new SpeechSynthesisUtterance(l.t);
  const v = voiceFor(g) || P.vs[0];
  u.lang = v ? v.lang : 'en-US'; if (v) u.voice = v;
  u.pitch = isTZ(v) ? 1 : (g === 'F' ? 1.2 : 0.8);
  u.rate = 0.95 * P.speed;
  u.onend = () => setTimeout(done, 350);
  u.onerror = done;
  speechSynthesis.speak(u);
}
function playWhole(x, tok, cb) {
  const a = new Audio('audio/p4/' + x.id + '.mp3'); P.a = a;
  const lens = x.script.map(l => l.t.length), tot = lens.reduce((s, v) => s + v, 0) || 1;
  a.ontimeupdate = () => {
    if (tok !== P.tok || !a.duration) return;
    const p = a.currentTime / a.duration * tot;
    let k = 0, s = 0;
    while (k < lens.length - 1 && s + lens[k] <= p) { s += lens[k]; k++; }
    hl(k);
  };
  a.onended = () => { if (tok !== P.tok) return; P.a = null; hl(-1); paintBar(false); if (cb) cb(); };
  const bad = () => { if (tok !== P.tok) return; P.a = null; AU.delete(x.id); play(x, 0, false, cb); };
  a.onerror = bad; try { a.defaultPlaybackRate = P.speed; a.playbackRate = P.speed; a.preservesPitch = true; a.webkitPreservesPitch = true; } catch (e) {} a.play().catch(bad);
}
function play(x, from, only, cb) {
  stop(); const tok = P.tok; let i = from || 0; paintBar(true);
  if (AU.has(x.id) && !only && !from) { playWhole(x, tok, cb); return; }
  const step = () => {
    if (tok !== P.tok) return;
    if (i >= x.script.length || (only && i > from)) { paintBar(false); if (cb) cb(); return; }
    hl(i); say(x, i++, tok, step);
  };
  step();
}
function hl(i) { document.querySelectorAll('.tsent').forEach((e, k) => e.classList.toggle('active', k === i)); }
function paintBar(o) {
  P.on = o;
  const b = document.getElementById('pb');
  if (b) b.textContent = o ? '⏹ 停止' : '▶ 播放獨白';
}
function toggle() {
  const r = V.run, x = r.sets[r.i];
  if (P.on) { stop(); return; }
  unlockTTS();
  play(x, 0);
}
function play1(i) {
  const r = V.run;
  if (r.mode === 'practice') { unlockTTS(); play(r.sets[r.i], i, true); }
}
function tick(n, fin) {
  clr(); T.k = n;
  const up = () => { const e = document.getElementById('cd'); if (e) e.textContent = T.k; };
  up();
  T.id = setInterval(() => { T.k = Math.max(0, T.k - 1); up(); if (T.k <= 0) { clr(); if (fin) fin(); } }, 1000);
}
function startPre() {
  const r = V.run, x = r.sets[r.i];
  stop(); r.stage[x.id] = 'pre'; T.k = PRE; render();
  tick(PRE, startPlay);
}
function startPlay() {
  const r = V.run, x = r.sets[r.i];
  stop();
  if (r.mode === 'test') { if (r.played[x.id]) return; r.played[x.id] = 1; }
  r.stage[x.id] = 'play'; render();
  unlockTTS();
  play(x, 0, false, () => {
    if (V.run !== r || r.sets[r.i] !== x) return;
    r.stage[x.id] = 'ans'; render();
    if (r.mode === 'test') tick(ANS);
  });
}
function autoStart() {
  const r = V.run;
  if (r && r.mode === 'test' && !r.stage[r.sets[r.i].id]) startPre();
}
const auSt = id => AU.has(id) ? ['complete', '✓ 已有音檔', 'text-emerald-600'] : ['none', '✗ 無音檔', 'text-slate-400'];
const auName = x => x.id + '.mp3';

/* ---------- 狀態與導覽 ---------- */
let V = {
  view: 'home', fd: null, fm: null, tt: null, tm: null, pn: 3,
  run: null, rp: null, rf: null, rkf: null,
  A: { d: 'd1', t: 'easy', m: 'any', n: 1, g: 'any', cd: null, ct: null }
};
function go(view) { stop(); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const goHome = () => go('home');
function openPractice() { go('practice'); }
function openTest() { go('test'); }
function openBook() { go('book'); }
function openAdmin() { go('admin'); }
function toggleDark() {
  S.dark = !S.dark;
  try { const c = JSON.parse(localStorage.getItem(KEY) || '{}'); c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  render();
}
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }

/* ---------- 作答流程 ---------- */
function begin(mode, sets, key) {
  if (!sets.length) return;
  stop();
  V.run = {
    mode, sets, key: key || mode, i: 0,
    ord: {}, ans: {}, played: {}, stage: {}, showT: false, zh: false
  };
  V.view = 'run'; render(); window.scrollTo({ top: 0 });
}
function startPractice() {
  const list = pool(V.fd, V.fm);
  begin('practice', shuf(list).slice(0, V.pn), 'practice');
}
function startTest() {
  const list = pool(V.tt, V.tm);
  begin('test', shuf(list).slice(0, TESTN), 'test');
}
function startBook() {
  const sets = wrongSets();
  if (!sets.length) return;
  begin('practice', shuf(sets), 'book');
}
const wrongSets = () => {
  const ids = new Set();
  Object.keys(R.saved).forEach(k => { const id = k.split('|')[0]; if (find(id)) ids.add(id); });
  return [...ids].map(find).filter(Boolean);
};
const ordFor = (r, x, q) => {
  const k = x.id + '|' + q.id;
  return r.ord[k] || (r.ord[k] = (q.qtype === 'graphic' || q.choices.every(c => /\d/.test(c.t) && c.t.split(' ').length <= 4))
    ? q.choices.map((_, i) => i) : shuf(q.choices.map((_, i) => i)));
};
function pick(k, ci) {
  const r = V.run, x = r.sets[r.i];
  if (r.mode === 'practice') {
    if (r.ans[k] !== undefined) return;
    const st = r.stage[x.id];
    if (!st || st === 'idle' || st === 'pre') return;
  }
  r.ans[k] = ci;
  // 錯題本：答錯加入、答對移出（以「組|題」為鍵）
  const q = x.questions.find(qq => (x.id + '|' + qq.id) === k);
  if (q) {
    const ch = q.choices[ci];
    if (ch && ch.ok) delete R.saved[k];
    else R.saved[k] = 1;
    saveR();
  }
  const y = scrollY; render(); scrollTo(0, y);
}
const tg = k => { V.run[k] = !V.run[k]; const y = scrollY; render(); scrollTo(0, y); };
function next() {
  stop();
  const r = V.run;
  if (r.i >= r.sets.length - 1) finish();
  else { r.i++; render(); window.scrollTo({ top: 0 }); if (r.mode === 'practice') startPlay(); } // 練習：換組後直接自動播放（沿用按「下一組」的點擊手勢）；測驗由 render() 的 autoStart() 自動預讀＋播放
}
function finish() {
  const r = V.run;
  let c = 0, n = 0;
  const bt = {}, tp = {}, wr = [];
  r.sets.forEach(x => {
    let s = 0;
    x.questions.forEach(q => {
      const k = x.id + '|' + q.id, a = r.ans[k], ch = q.choices[a];
      n++;
      (bt[q.qtype] = bt[q.qtype] || [0, 0])[1]++;
      if (ch && ch.ok) {
        c++; s++;
        bt[q.qtype][0]++;
        delete R.saved[k];
      } else {
        R.saved[k] = 1;
        if (ch && ch.trap) tp[ch.trap] = (tp[ch.trap] || 0) + 1;
        wr.push({ x, q, a });
      }
    });
    R.rec[x.id] = { s, t: Date.now() };
  });
  saveR();
  if (r.key === 'test') {
    const pct = Math.round(c / n * 100);
    const cfg = (V.tt || 'all') + '|' + (V.tm || 'all');
    const o = R.tests[cfg] || {};
    R.tests[cfg] = { best: Math.max(o.best || 0, pct), last: pct, n };
    saveR();
  }
  r.res = { c, n, bt, tp, wr };
  V.view = 'result'; render(); window.scrollTo({ top: 0 });
}
function quit() {
  if (V.run.mode === 'test' && Object.keys(V.run.ans).length && !confirm('離開後這次測驗不會計分，確定離開？')) return;
  go(V.run.key === 'test' ? 'test' : V.run.key === 'book' ? 'book' : 'practice');
}

/* ---------- 頁首 ---------- */
function hdr(title, back) {
  const b = back
    ? `<button onclick="${back}" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>`
    : `<a href="index.html" class="${btn} ${line} !py-1.5 shrink-0" aria-label="回到首頁">⌂</a>`;
  return `<header class="flex items-center justify-between gap-2 mb-5"><div class="flex items-center gap-2 min-w-0">${b}<h1 class="text-lg md:text-2xl font-bold truncate">${title}</h1></div>
    <button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button></header>`;
}

/* ---------- 圖表 ---------- */
const gH = g => g
  ? `<div class="${card} p-3 mb-3 overflow-x-auto"><p class="text-xs font-bold mb-1">${esc(g.title)}</p>
    <table class="text-sm w-full"><tr>${g.columns.map(c => `<th class="text-left pr-4 border-b border-slate-300 dark:border-slate-700">${esc(c)}</th>`).join('')}</tr>
    ${g.rows.map(r => `<tr>${r.map(c => `<td class="pr-4 py-0.5">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`
  : '';

/* ---------- 首頁 ---------- */
function homeH() {
  const tot = DATA.length;
  const nSaved = Object.keys(R.saved).filter(k => find(k.split('|')[0])).length;
  const openN = openRpN();
  let h = hdr('Part 4 簡短獨白');
  if (!tot) {
    h += `<div class="${card} p-8 text-center"><p class="text-sm text-slate-500 mb-4">題庫為空，請到維護頁新增或載入 part4.json。</p>
      <button onclick="openAdmin()" class="${btn} ${pri}">🛠 維護</button></div>`;
    return h;
  }
  h += `<div class="grid gap-3 md:grid-cols-2 mb-4">
    <button onclick="openPractice()" class="${card} p-5 text-left hover:border-indigo-400 transition">
      <p class="text-xl font-bold">練習</p>
      <p class="text-sm text-slate-500 mt-2">選難度與主題，隨機抽組練習。可重播獨白、即時看解析與文稿。</p>
    </button>
    <button onclick="openTest()" class="${card} p-5 text-left hover:border-indigo-400 transition">
      <p class="text-xl font-bold">測驗</p>
      <p class="text-sm text-slate-500 mt-2">先選難度（初／中／高），主題可選可不選，隨機抽 ${TESTN} 組。預讀後獨白只播一次，完成後才檢討。</p>
    </button>
  </div>
  <div class="grid grid-cols-3 gap-3 mb-4">
    <button onclick="openBook()" class="${btn} ${line}">★ 錯題本 ${nSaved}</button>
    <button onclick="go('reports')" class="${btn} ${line}">⚑ 提報${openN ? ' ' + openN : ''}</button>
    <button onclick="openAdmin()" class="${btn} ${line}">🛠 維護</button>
  </div>`;
  // 常見陷阱
  const traps = {};
  Object.keys(R.saved).forEach(k => {
    const [sid, qid] = k.split('|');
    const x = find(sid);
    if (!x) return;
    const q = x.questions.find(qq => qq.id === qid);
    if (!q) return;
    // 從 rec 或略過
  });
  return h;
}

/* ---------- 練習／測驗選單 ---------- */
function practiceH() {
  let h = hdr('練習', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">選難度與主題後開始練習。可重播、顯示文稿與中文，作答後立即看解析。</p>`;
  h += stepFilters('fd', 'fm', 'pn');
  const n = pool(V.fd, V.fm).length;
  const take = Math.min(n, V.pn || 3);
  h += `<button onclick="startPractice()" ${n ? '' : 'disabled'} class="${btn} ${pri} w-full">開始練習（${take} 組）</button>`;
  if (!n) h += `<p class="text-xs text-rose-500 mt-2">請換一個條件。</p>`;
  else if (n < (V.pn || 3)) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${n} 組，將全部出題。</p>`;
  return h;
}
function testH() {
  let h = hdr('測驗', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件從題庫隨機抽 ${TESTN} 組。預讀題目後獨白只播放一次，作答中不顯示對錯，完成後一次檢討。</p>`;
  h += stepFilters('tt', 'tm', null, true);
  const n = pool(V.tt, V.tm).length;
  const take = Math.min(n, TESTN);
  h += `<button onclick="startTest()" ${n ? '' : 'disabled'} class="${btn} ${pri} w-full">開始測驗（${take} 組）</button>`;
  if (!n) h += `<p class="text-xs text-rose-500 mt-2">請換一個條件。</p>`;
  else if (n < TESTN) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${n} 組，將全部出題。</p>`;
  const cfg = (V.tt || 'all') + '|' + (V.tm || 'all');
  const rec = R.tests[cfg];
  if (rec) h += `<p class="text-xs text-slate-500 mt-3">最佳 ${rec.best}% · 最近一次 ${rec.last}%</p>`;
  return h;
}
function stepFilters(tk, mk, nk, isTest) {
  let h = '';
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">`;
  h += fbtn(tk, null, '不限難度', DATA.length);
  Object.keys(TIER).forEach(t => { h += fbtn(tk, t, TIER[t], pool(t, null).length); });
  h += `</div><p class="text-xs text-slate-400 mb-5">再點一次已選中的＝取消</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-1">`;
  h += fbtn(mk, null, '不限主題', pool(V[tk], null).length);
  Object.keys(DOM).forEach(d => { h += fbtn(mk, d, d.toUpperCase() + ' ' + DOM[d].n, pool(V[tk], d).length); });
  h += `</div><p class="text-xs text-slate-400 mb-5">再點一次已選中的＝取消</p>`;
  if (nk) {
    h += `<h2 class="font-bold mb-2">3. 練習組數</h2><div class="flex flex-wrap gap-2 mb-5">`;
    [1, 2, 3, 5].forEach(n => {
      const on = (V[nk] || 3) === n;
      h += `<button onclick="V.${nk}=${n};render()" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${n} 組</button>`;
    });
    h += `</div>`;
  }
  return h;
}
function fbtn(k, v, label, n) {
  const on = (V[k] || null) === v;
  return `<button onclick="setF('${k}',${v ? `'${v}'` : 'null'})" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${n === 0 ? ' opacity-40' : ''}">${label}${n == null ? '' : ` <span class="text-xs opacity-70">${n}</span>`}</button>`;
}

/* ---------- 作答畫面 ---------- */
function runH() {
  const r = V.run, x = r.sets[r.i], pr = r.mode === 'practice', last = r.i === r.sets.length - 1;
  const st = r.stage[x.id] || 'idle', locked = pr && (st === 'idle' || st === 'pre');
  const ev = new Set();
  if (pr) x.questions.forEach(q => { if (r.ans[x.id + '|' + q.id] !== undefined) (q.evidence || []).forEach(i => ev.add(i)); });
  const allDone = x.questions.every(q => r.ans[x.id + '|' + q.id] !== undefined);
  const pct = Math.round((r.i / r.sets.length) * 100);
  // 「下一組」放在控制列（練習：播放鈕右側）；整組答完＝主要樣式，未答完＝次要樣式（測驗另加 disabled）。預讀／尚未播放時不顯示。
  const nextBtn = `<button ${!pr && !allDone ? 'disabled' : ''} onclick="next()" class="${btn} ${allDone ? pri : line + ' disabled:opacity-40 disabled:cursor-not-allowed'} !py-1.5">${last ? (pr ? '結束' : '交卷') : '下一組 →'}</button>`;
  let h = `<div class="flex items-center justify-between gap-2 mb-3">
    <button onclick="quit()" class="${btn} ${line} !py-1.5">← 離開</button>
    <span class="text-sm font-medium">${pr ? '練習' : '測驗'} · ${r.i + 1} / ${r.sets.length}</span>
    <span class="text-xs text-slate-500">${esc(MT[x.mtype] || '')} · ${TIER[tierOf(x)]}</span>
  </div>
  <div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-4"><div class="h-full rounded bg-indigo-600 transition-all" style="width:${pct}%"></div></div>`;

  // 控制列
  let ctl = '';
  if (pr && st === 'idle') {
    ctl = `<button onclick="startPre()" class="${btn} ${pri} !py-1.5">⏱ 預讀 ${PRE} 秒後播放</button>
      <button onclick="startPlay()" class="${btn} ${line} !py-1.5">▶ 直接播放</button>
      <span class="text-xs text-slate-500">先讀題目與圖表，再聽獨白</span>`;
  } else if (st === 'pre') {
    ctl = `<span class="text-sm">預讀題目與圖表… <b id="cd">${T.k}</b> 秒後自動播放（只播一次）</span>
      <button onclick="startPlay()" class="${btn} ${pri} !py-1.5">跳過，立即播放</button>`;
  } else if (pr) {
    ctl = `<button id="pb" onclick="toggle()" class="${btn} ${allDone ? line : pri} !py-1.5"></button>${speedH()}
      ${nextBtn}
      <button onclick="tg('showT')" class="${btn} ${line} !py-1.5">${r.showT ? '隱藏' : '顯示'}文稿</button>
      ${r.showT ? `<button onclick="tg('zh')" class="${btn} ${line} !py-1.5">${r.zh ? '隱藏' : '顯示'}中文</button>` : ''}
      <span class="ml-auto">${rpBtn(x.id)}</span>`;
  } else if (st === 'play') {
    ctl = `<span class="text-sm">播放中…（獨白只播一次，可邊聽邊作答）</span>${nextBtn}<span class="ml-auto">${rpBtn(x.id)}</span>`;
  } else {
    ctl = `<span class="text-sm">作答提示時間 <b id="cd">${T.k}</b> 秒（僅提示，不會強制換題）</span>${nextBtn}<span class="ml-auto">${rpBtn(x.id)}</span>`;
  }
  h += `<div class="${card} p-3 mb-3 flex flex-wrap items-center gap-2">${ctl}</div>`;

  // 文稿（練習模式可顯示）
  if (pr && r.showT && !locked) {
    h += `<div class="${card} p-3 mb-3">${x.script.map((l, i) =>
      `<p class="tsent px-2 py-1 text-sm ${ev.has(i) ? '!bg-amber-100 dark:!bg-amber-900/40' : ''}" onclick="play1(${i})">${esc(l.t)}${r.zh ? `<span class="block text-xs text-slate-500">${esc(l.zh)}</span>` : ''}</p>`
    ).join('')}</div>`;
  }

  h += gH(x.graphic);

  // 題目
  x.questions.forEach((q, qi) => {
    const k = x.id + '|' + q.id, a = r.ans[k], done = a !== undefined;
    h += `<div class="${card} p-4 mb-3"><p class="text-sm font-bold">${qi + 1}. ${esc(q.q.t)}</p>`;
    if (pr && done && q.q.zh) h += `<p class="text-xs text-slate-500">${esc(q.q.zh)}</p>`;
    h += `<div class="mt-2">${ordFor(r, x, q).map((ci, j) => {
      const c = q.choices[ci];
      let cls = line;
      if (pr && done) {
        if (c.ok) cls = 'border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50';
        else if (ci === a) cls = 'border border-rose-500 bg-rose-50 dark:bg-rose-950/50';
      } else if (!pr && ci === a) cls = 'border border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50';
      return `<button ${(pr && done) || locked ? 'disabled' : ''} onclick="pick('${k}',${ci})"
        class="w-full text-left rounded-lg px-3 py-2 text-sm mb-1.5 ${cls} ${locked ? 'opacity-70' : ''}">
        <b>${L[j]}.</b> ${esc(c.t)}
        ${pr && done && c.zh ? `<span class="block text-xs text-slate-500">${esc(c.zh)}</span>` : ''}
        ${pr && done ? `<span class="block text-xs mt-1 ${c.ok ? 'text-emerald-600' : 'text-slate-500'}">${c.ok ? '✓ 正解' : esc(TR[c.trap] || '')}：${esc(c.why)}</span>` : ''}
      </button>`;
    }).join('')}</div></div>`;
  });

  return h;
}

/* ---------- 結果頁 ---------- */
function resultH() {
  const { c, n, bt, tp, wr } = V.run.res;
  const pr = V.run.mode === 'practice';
  const pct = Math.round(c / n * 100);
  const back = V.run.key === 'test' ? 'go(\'test\')' : V.run.key === 'book' ? 'go(\'book\')' : 'go(\'practice\')';
  let h = hdr('作答結果', back);
  h += `<div class="${card} p-5 mb-3 text-center">
    <div class="text-4xl font-bold ${pct >= 75 ? 'text-emerald-600' : 'text-amber-600'}">${c}/${n}</div>
    <div class="text-sm text-slate-500">答對率 ${pct}%</div>
    <div class="flex gap-2 mt-4 justify-center">
      <button onclick="${back}" class="${btn} ${line}">回選單</button>
      <button onclick="${V.run.key === 'test' ? 'startTest()' : V.run.key === 'book' ? 'startBook()' : 'startPractice()'}" class="${btn} ${pri}">再${pr ? '練' : '測'}一次（重新抽題）</button>
    </div>
  </div>`;
  h += `<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">各題型</p>
    ${Object.keys(bt).map(k => `<div class="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800"><span>${QT[k] || k}</span><span>${bt[k][0]}/${bt[k][1]}</span></div>`).join('')}
  </div>`;
  if (Object.keys(tp).length) {
    h += `<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">你最常中的陷阱</p>
      ${Object.keys(tp).sort((a, b) => tp[b] - tp[a]).map(k => `<div class="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800"><span>${TR[k] || k}</span><span>${tp[k]} 次</span></div>`).join('')}
    </div>`;
  }
  if (wr.length) {
    h += `<p class="font-bold text-sm mb-2">答錯的題目</p>`;
    wr.forEach(w => {
      const ok = w.q.choices.find(c => c.ok), my = w.q.choices[w.a];
      h += `<div class="${card} p-3 mb-2 text-sm">
        <div class="flex items-start justify-between gap-2">
          <p class="font-bold">${esc(w.x.id)} · ${esc(w.q.q.t)}</p>
          ${rpBtn(w.x.id)}
        </div>
        <p class="text-rose-600 mt-1">你選：${my ? esc(my.t) : '（未作答）'}${my && my.trap ? '（' + esc(TR[my.trap] || '') + '）' : ''}</p>
        <p class="text-emerald-600">正解：${esc(ok.t)}</p>
        <p class="text-xs text-slate-500 mt-1">${esc(ok.why)}</p>
      </div>`;
    });
  } else {
    h += `<div class="${card} p-4 text-sm text-center">全部答對 🎉</div>`;
  }
  return h;
}

/* ---------- 錯題本 ---------- */
function bookH() {
  const sets = wrongSets();
  let h = hdr('錯題本', 'goHome()');
  if (!sets.length) {
    h += `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`;
    return h;
  }
  h += `<button onclick="startBook()" class="${btn} ${pri} w-full mb-4">重做這 ${sets.length} 組</button>`;
  sets.forEach(x => {
    const wrongQs = x.questions.filter(q => R.saved[x.id + '|' + q.id]);
    h += `<div class="${card} p-3 mb-3">
      <div class="flex items-center justify-between gap-2">
        <div><b class="text-sm">${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span>
          <span class="flex flex-wrap gap-1 mt-1"><span class="${chip}">${TIER[tierOf(x)]}</span><span class="${chip}">${esc(MT[x.mtype] || '')}</span></span>
        </div>
        <button onclick="unsaveSet('${esc(x.id)}')" class="text-xs text-rose-500 hover:underline cursor-pointer">移除</button>
      </div>
      <p class="text-xs text-slate-500 mt-2">錯 ${wrongQs.length} 題：${wrongQs.map(q => esc(q.q.t)).join('；')}</p>
      <div class="flex justify-end mt-2">${rpBtn(x.id)}</div>
    </div>`;
  });
  return h;
}
function unsaveSet(id) {
  Object.keys(R.saved).filter(k => k.startsWith(id + '|')).forEach(k => delete R.saved[k]);
  saveR(); render();
}

/* ---------- 提報 ---------- */
const RK = { answer: '答案／解析有誤', audio: '音檔問題', graphic: '圖表問題', other: '其他' };
const RS = { open: '待處理', fixing: '處理中', fixed: '已修正', ignored: '不處理' };
const RSC = { open: 'text-rose-600', fixing: 'text-amber-600', fixed: 'text-emerald-600', ignored: 'text-slate-400' };
const fmtT = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const reportsOf = id => R.reports.filter(r => r.qid === id).sort((a, b) => b.created - a.created);
const openRpN = id => R.reports.filter(r => (r.status === 'open' || r.status === 'fixing') && (!id || r.qid === id)).length;
const rpBtn = qid => {
  const n = reportsOf(qid).length;
  return `<button onclick="openReport(this.dataset.q)" data-q="${esc(qid)}" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">⚑ 提報${n ? ` (${n})` : ''}</button>`;
};
function toast(m) {
  const d = document.createElement('div'); d.textContent = m;
  d.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1800);
}
function openReport(qid) {
  V.rp = { mode: 'new', qid, kind: 'answer', note: '', reporter: R.reporter || '', focus: true };
  render();
}
function editReport(id) {
  const r = R.reports.find(q => q.id === id); if (!r) return;
  V.rp = Object.assign({ mode: 'edit', id, focus: true }, JSON.parse(JSON.stringify(r)));
  render();
}
function closeReport() { V.rp = null; render(); }
function saveReport() {
  const p = V.rp; if (!p) return;
  const g = i => { const e = document.getElementById(i); return e ? e.value : ''; };
  const note = g('rpn').trim(), kind = g('rpk') || 'other', reporter = g('rpr').trim();
  if (!note) { toast('請簡單描述問題'); return; }
  const now = Date.now();
  if (p.mode === 'new') {
    R.reports.push({
      id: 'r' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      qid: p.qid, kind, note, reporter, status: 'open', adminNote: '', created: now, updated: now
    });
    R.reporter = reporter; toast('已提報，謝謝！');
  } else {
    const r = R.reports.find(q => q.id === p.id); if (!r) return closeReport();
    Object.assign(r, { kind, note, reporter, status: g('rps') || r.status, adminNote: g('rpa').trim(), updated: now });
    toast('已更新');
  }
  saveR(); V.rp = null; render();
}
function setRs(id, st) { const r = R.reports.find(q => q.id === id); if (!r) return; r.status = st; r.updated = Date.now(); saveR(); render(); }
function delReport(id) { if (!confirm('確定刪除這筆提報？')) return; R.reports = R.reports.filter(q => q.id !== id); saveR(); render(); }
function setRf(k, v) { V[k] = V[k] === v ? null : v; render(); }
function rpModalH() {
  const p = V.rp; if (!p) return '';
  const edit = p.mode === 'edit', x = find(p.qid);
  const opt = (o, cur) => Object.keys(o).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${o[k]}</option>`).join('');
  const inp = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm';
  return `<div class="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onclick="if(event.target===this)closeReport()">
    <div class="min-h-full flex items-end sm:items-center justify-center p-3">
      <div class="${card} w-full max-w-lg p-4 md:p-5">
        <div class="flex items-center justify-between mb-3"><h2 class="font-bold">${edit ? '編輯提報' : '⚑ 提報問題'} · ${esc(p.qid)}</h2>
          <button onclick="closeReport()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
        ${x ? `<p class="text-xs text-slate-500 mb-3">${esc(x.tag)} · ${esc(MT[x.mtype] || '')}</p>` : ''}
        <label class="block text-xs text-slate-500 mb-1">問題類型</label>
        <select id="rpk" class="${inp} mb-3">${opt(RK, p.kind)}</select>
        <label class="block text-xs text-slate-500 mb-1">描述問題</label>
        <textarea id="rpn" rows="4" class="${inp} mb-3">${esc(p.note)}</textarea>
        <label class="block text-xs text-slate-500 mb-1">提報人（選填）</label>
        <input id="rpr" value="${esc(p.reporter)}" class="${inp} mb-3" maxlength="30">
        ${edit ? `<div class="mb-3"><label class="block text-xs text-slate-500 mb-1">處理狀態</label>
          <select id="rps" class="${inp}">${opt(RS, p.status)}</select></div>
          <label class="block text-xs text-slate-500 mb-1">管理員備註</label>
          <textarea id="rpa" rows="2" class="${inp} mb-3">${esc(p.adminNote || '')}</textarea>` : ''}
        <div class="flex gap-2 justify-end">
          <button onclick="closeReport()" class="${btn} ${line}">取消</button>
          <button onclick="saveReport()" class="${btn} ${pri}">${edit ? '儲存變更' : '送出提報'}</button>
        </div>
      </div>
    </div>
  </div>`;
}
function reportCardH(r) {
  const x = find(r.qid);
  return `<div class="${card} p-3 mb-3">
    <div class="flex flex-wrap items-center gap-1.5">
      <b class="text-sm">${esc(r.qid)}</b>
      <span class="${chip}">${RK[r.kind] || esc(r.kind)}</span>
      <span class="${chip} ${RSC[r.status] || ''}">${RS[r.status] || esc(r.status)}</span>
    </div>
    <p class="text-sm mt-1.5 whitespace-pre-wrap break-words">${esc(r.note)}</p>
    <p class="text-xs text-slate-400 mt-1">${esc(r.reporter || '匿名')} · ${fmtT(r.created)}${r.updated > r.created ? ' · 更新 ' + fmtT(r.updated) : ''}</p>
    ${r.adminNote ? `<p class="text-xs mt-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1"><b>管理員：</b>${esc(r.adminNote)}</p>` : ''}
    <div class="flex flex-wrap gap-1.5 mt-2.5">
      ${Object.keys(RS).map(k => `<button onclick="setRs('${r.id}','${k}')" class="text-xs rounded-lg px-2.5 py-1 cursor-pointer ${r.status === k ? 'bg-indigo-600 text-white' : 'border border-slate-300 dark:border-slate-700'}">${RS[k]}</button>`).join('')}
      <button onclick="editReport('${r.id}')" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 cursor-pointer ml-auto">✎ 編輯</button>
      <button onclick="delReport('${r.id}')" class="text-xs rounded-lg px-2.5 py-1 text-rose-500 hover:underline cursor-pointer">刪除</button>
    </div>
  </div>`;
}
function reportsH() {
  const all = R.reports.slice().sort((a, b) => b.created - a.created);
  const list = all.filter(r => (!V.rf || r.status === V.rf) && (!V.rkf || r.kind === V.rkf));
  const fb = (k, v, label, n) => `<button onclick="setRf('${k}','${v}')" class="${btn} !py-1.5 !px-3 text-xs ${V[k] === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label} <span class="opacity-70">${n}</span></button>`;
  let h = hdr('提報彙整', 'goHome()');
  h += `<div class="${card} p-4 mb-4">
    <div class="flex flex-wrap gap-2">${Object.keys(RS).map(k => fb('rf', k, RS[k], all.filter(r => r.status === k).length)).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-2">${Object.keys(RK).map(k => fb('rkf', k, RK[k], all.filter(r => r.kind === k).length)).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
      <button onclick="exportReports('json')" class="${btn} ${line} !py-1.5 text-xs">匯出 JSON</button>
      <button onclick="exportReports('csv')" class="${btn} ${line} !py-1.5 text-xs">匯出 CSV（Excel）</button>
      <label class="${btn} ${line} !py-1.5 text-xs">匯入合併 JSON<input type="file" accept=".json,application/json" class="hidden" onchange="importReports(this)"></label>
    </div>
    <p class="text-xs text-slate-400 mt-2">提報只存在各人瀏覽器的 localStorage。要彙整時，請使用者匯出 JSON 傳給管理員。</p>
  </div>`;
  if (!list.length) return h + `<p class="text-sm text-slate-400 text-center py-10">${all.length ? '沒有符合篩選的提報。' : '目前沒有提報。作答時按「⚑ 提報」即可記錄。'}</p>`;
  return h + `<p class="text-xs text-slate-500 mb-2">共 ${list.length} 筆</p>` + list.map(r => reportCardH(r)).join('');
}
function download(name, text, mime) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportReports(fmt) {
  if (!R.reports.length) { toast('沒有可匯出的提報'); return; }
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  if (fmt === 'json') {
    download(`part4-reports-${stamp}.json`, JSON.stringify({ app: 'toeic-part4-reports', v: 1, exported: Date.now(), reports: R.reports }, null, 2), 'application/json');
    return;
  }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['提報編號', '題組ID', '類型', '狀態', '描述', '提報人', '建立時間', '更新時間', '管理員備註'];
  const rows = R.reports.slice().sort((a, b) => a.created - b.created).map(r =>
    [r.id, r.qid, RK[r.kind] || r.kind, RS[r.status] || r.status, r.note, r.reporter, fmtT(r.created), fmtT(r.updated), r.adminNote].map(cell).join(',')
  );
  download(`part4-reports-${stamp}.csv`, '\uFEFF' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
}
function importReports(input) {
  const f = input.files[0]; if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const j = JSON.parse(fr.result), arr = Array.isArray(j) ? j : j && j.reports;
      if (!Array.isArray(arr)) throw new Error('找不到 reports 陣列');
      let add = 0, upd = 0;
      arr.forEach(r => {
        if (!r || typeof r.id !== 'string' || typeof r.qid !== 'string') return;
        const n = {
          id: r.id, qid: r.qid, kind: RK[r.kind] ? r.kind : 'other',
          note: String(r.note || ''), reporter: String(r.reporter || ''),
          status: RS[r.status] ? r.status : 'open', adminNote: String(r.adminNote || ''),
          created: +r.created || Date.now(), updated: +r.updated || +r.created || Date.now()
        };
        const o = R.reports.find(q => q.id === n.id);
        if (!o) { R.reports.push(n); add++; }
        else if (n.updated > o.updated) { Object.assign(o, n); upd++; }
      });
      saveR(); toast(`匯入完成：新增 ${add}、更新 ${upd}`); render();
    } catch (e) { alert('匯入失敗：' + e.message); }
  };
  fr.readAsText(f, 'utf-8'); input.value = '';
}

/* ---------- 維護 ---------- */
const serial = (d, t) => {
  let mx = 0;
  DATA.forEach(x => {
    const m = /^d(\d)-(\d+)-([emh])$/.exec(x.id);
    if (m && 'd' + m[1] === d && m[3] === TS[t]) mx = Math.max(mx, +m[2]);
  });
  return mx;
};
const SC = { easy: [500, 550], medium: [600, 650], hard: [700, 800] };
const cefr = s => s <= 550 ? 'A2+' : s === 600 ? 'B1' : s === 650 ? 'B1+' : s <= 750 ? 'B2' : 'B2+';
function promptText() {
  const A = V.A;
  const cq = {}, cm = {};
  DATA.filter(x => x.domain === A.d && tierOf(x) === A.t).forEach(x => {
    cm[x.mtype] = (cm[x.mtype] || 0) + 1;
    x.questions.forEach(q => { cq[q.qtype] = (cq[q.qtype] || 0) + 1; });
  });
  const { d, t, m, n, g } = A, mx = serial(d, t);
  const ids = Array.from({ length: n }, (_, i) => d + '-' + String(mx + 1 + i).padStart(3, '0') + '-' + TS[t]);
  const sp = SPEC || {}, mts = (sp.mtypes && Object.keys(sp.mtypes)) || Object.keys(MT);
  const lite = JSON.stringify({
    domain: { [d]: sp.domains && sp.domains[d] },
    tier: { [t]: sp.tiers && sp.tiers[t] },
    qtypes: sp.qtypes, mtypes: sp.mtypes, traps: sp.traps,
    entry_schema: sp.entry_schema, rules: sp.rules
  });
  return [
    `請為多益 Part 4 簡短獨白寫 ${n} 組題目（每組一段獨白＋3題），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part4.json。`, '',
    `- 主題：${d.toUpperCase()} ${DOM[d].n}（scene 須屬於：${((sp.domains && sp.domains[d] && sp.domains[d].scenes) || []).join('、')}）`,
    `- 難度：${TIER[t]}（id 尾碼 ${TS[t]}）｜level.score 只能填：${SC[t].map(s => s + '（cefr 填 ' + cefr(s) + '）').join('、')}${sp.tiers && sp.tiers[t] ? '｜' + sp.tiers[t].guide : ''}`,
    `- 獨白類型 mtype：${m === 'any' ? '請依主題選合適的類型並分散（可用：' + mts.join('、') + '）' : m + '（' + MT[m] + '）'}；此主題＋難度已有的類型題數：${mts.map(k => k + '×' + (cm[k] || 0)).join('、')}。`,
    '- 形式：單一說話者獨白（form 填 talk，speakers 只有 1 位 {id:"S",gender,role}；script 每句 {t,zh}，不要出現說話者標籤）；開場與結尾要符合該 mtype 的慣用語。',
    `- id 依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）`,
    `- 每組 3 題；題型請搭配（主旨／細節／推論／意圖／未來行動／身份${g === 'no' ? '' : '／圖表'}），各組不要完全相同；${g === 'no' ? '本批不要出圖表題（graphic 填 null）' : g === 'one' ? '這批至少 1 組要含圖表題，圖表題須提供 graphic，且答案需結合圖表與獨白（獨白更正圖表資訊，或需兩個條件對照）' : '圖表題須提供 graphic'}。`,
    `- 此主題＋難度已有的題型題數：${Object.keys(QT).map(k => k + '×' + (cq[k] || 0)).join('、')}，請優先補數量最少的題型。`,
    '- 每題 4 選項、剛好 1 正解；錯誤選項須有明確依據可排除，並標 trap；每個選項都要附 zh（中文翻譯）；evidence 為 script 句索引（從 0 起），依題號遞增；意圖題引號內的句子必須逐字出現在 script。',
    `- 已用過的 vocab（不得重複）：${[...new Set(DATA.flatMap(x => (x.vocab || []).map(v => v.word)))].join('、') || '（無）'}`,
    `- 已用過的 tag（不得重複）：${DATA.map(x => x.tag).join('；') || '（無）'}`,
    `- 已有的獨白首句（不要雷同）：${DATA.map(x => x.script[0] && x.script[0].t).filter(Boolean).join('；') || '（無）'}`,
    `- 輸出方式：建立檔案 p4_${ids[0]}_x${n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。`,
    '', '【規格：part4.json 的 _spec 精簡版】', lite
  ].join('\n');
}
function cellCount(d, t) { return DATA.filter(x => x.domain === d && tierOf(x) === t).length; }
function cellMissingAu(d, t) { return DATA.filter(x => x.domain === d && tierOf(x) === t && !AU.has(x.id)).length; }
function adminH() {
  const ds = Object.keys(DOM), tiers = Object.keys(TIER);
  let missAu = 0, tot = DATA.length;
  DATA.forEach(x => { if (!AU.has(x.id)) missAu++; });
  let h = hdr('維護', 'backAdmin()');
  // 概況
  h += `<div class="${card} p-4 mb-3">
    <div class="flex flex-wrap gap-4 text-sm">
      <span>題組 <b>${tot}</b></span>
      <span>音檔 <b class="${missAu ? 'text-rose-600' : 'text-emerald-600'}">${missAu ? '✖ 缺 ' + missAu + ' 組' : '✔ ' + tot + ' 組都有 mp3'}</b>
        <button onclick="auLoad().then(()=>render())" class="text-xs underline ml-1 cursor-pointer">重新檢查</button></span>
    </div>
  </div>`;
  // 矩陣
  h += `<div class="${card} p-3 mb-2 overflow-x-auto"><table class="text-sm w-full">
    <tr><th class="text-left py-1">主題 \\ 難度</th>${tiers.map(t => `<th class="text-center">${TIER[t]}</th>`).join('')}</tr>`;
  ds.forEach(d => {
    h += `<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-1.5">${d.toUpperCase()} ${esc(DOM[d].n)}</td>`;
    tiers.forEach(t => {
      const n = cellCount(d, t), miss = cellMissingAu(d, t);
      const bg = n === 0 ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
        : n < TARGET ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300';
      h += `<td class="text-center p-1"><button onclick="openCell('${d}','${t}')" class="w-full rounded-lg px-2 py-1.5 ${bg}">
        <span class="font-bold">${n}</span>
        <span class="block text-[10px] font-normal">${n} 組${miss ? `<br><span class="text-rose-600 dark:text-rose-400">缺音檔 ${miss}</span>` : ''}</span>
      </button></td>`;
    });
    h += `</tr>`;
  });
  h += `</table></div>
  <p class="text-xs text-slate-400 mb-4">格底色：紅＝0 組／黃＝未達 ${TARGET} 組／綠＝達標。格內「缺音檔 N」不影響底色。</p>`;
  // mtype 統計
  const cm = {}; DATA.forEach(x => { cm[x.mtype] = (cm[x.mtype] || 0) + 1; });
  h += `<div class="flex flex-wrap gap-1.5 mb-4">${Object.keys(MT).map(k => `<span class="${chip}">${esc(MT[k])} ${cm[k] || 0}</span>`).join('')}</div>`;
  h += `<button onclick="go('reports')" class="${btn} ${line} w-full mb-3">⚑ 提報彙整${openRpN() ? `（待處理 ${openRpN()}）` : ''}</button>`;
  h += `<button onclick="go('adminNew')" class="${btn} ${pri} w-full">＋ 新增題目</button>`;
  return h;
}
function openCell(d, t) { V.A.cd = d; V.A.ct = t; go('adminCell'); }
function adminCellH() {
  const d = V.A.cd, t = V.A.ct;
  const xs = DATA.filter(x => x.domain === d && tierOf(x) === t).sort((a, b) => a.id.localeCompare(b.id));
  const nm = d.toUpperCase() + ' ' + DOM[d].n + ' · ' + TIER[t];
  const missList = xs.filter(x => !AU.has(x.id));
  let h = hdr(nm, "go('admin')");
  h += `<button onclick="V.A.d='${d}';V.A.t='${t}';go('adminNew')" class="${btn} ${pri} w-full mb-3">＋ 新增 ${esc(nm)} 題目</button>`;
  h += `<button onclick="copyMissAu()" ${missList.length ? '' : 'disabled'} class="${btn} ${line} w-full mb-4" id="cma">複製本格缺的音檔清單（${missList.length}）</button>`;
  window._missAu = missList.map(x => auName(x) + ' | ' + x.script.map(l => l.t).join(' ') + ' | ' + gOf(x)).join('\n');
  if (!xs.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有題目（0 組）。</div>`;
  xs.forEach(x => {
    const st = auSt(x.id);
    h += `<div class="${card} p-3 mb-3">
      <div class="flex items-start justify-between gap-2">
        <div><b class="text-sm cursor-pointer underline" onclick="openItem('${esc(x.id)}')">${esc(x.id)}</b>
          <span class="text-xs text-slate-500">${esc(x.tag)}</span>
          <span class="flex flex-wrap gap-1 mt-1">
            <span class="${chip}">${esc(MT[x.mtype] || '')}</span>
            ${x.graphic ? `<span class="${chip}">圖表</span>` : ''}
            <span class="${chip} ${st[2]}">${st[1]}</span>
            ${reportsOf(x.id).length ? `<span class="${chip} text-rose-600">提報 ${reportsOf(x.id).length}</span>` : ''}
          </span>
        </div>
      </div>
    </div>`;
  });
  return h;
}
function copyMissAu() {
  const t = window._missAu || '';
  clip(t, 'cma');
}
function openItem(id) { V.A.item = id; go('adminItem'); }
function adminItemH() {
  const x = find(V.A.item); if (!x) return hdr('題組', "go('admin')") + '<p class="text-sm text-slate-400">找不到題組。</p>';
  const st = auSt(x.id);
  let h = hdr(x.id, `openCell('${x.domain}','${tierOf(x)}')`);
  h += `<div class="${card} p-4 mb-3">
    <p class="text-sm font-bold mb-1">${esc(x.tag)} · ${esc(MT[x.mtype] || '')} · ${TIER[tierOf(x)]}</p>
    <div class="mt-3 space-y-1">${x.script.map((l, i) =>
      `<p class="text-sm"><span class="text-xs text-slate-400">${i}</span> ${esc(l.t)}<span class="block text-xs text-slate-500">${esc(l.zh)}</span></p>`
    ).join('')}</div>
    ${gH(x.graphic)}
  </div>`;
  x.questions.forEach((q, qi) => {
    h += `<div class="${card} p-3 mb-3">
      <p class="text-sm font-bold">${qi + 1}. [${esc(QT[q.qtype] || q.qtype)}] ${esc(q.q.t)}
        <span class="block text-xs font-normal text-slate-500">${esc(q.q.zh)}　證據句：${(q.evidence || []).join(', ')}</span></p>
      ${q.choices.map(c =>
        `<div class="rounded-lg border px-3 py-1.5 text-sm mt-1 ${c.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-800'}">
          ${esc(c.t)}<span class="block text-xs text-slate-500">${c.ok ? '✓ ' + esc(c.pattern || '') : esc(TR[c.trap] || '')}：${esc(c.why)}</span>
        </div>`
      ).join('')}
    </div>`;
  });
  // 音檔面板
  h += `<div class="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3">
    <div class="flex items-center justify-between gap-2 mb-1">
      <p class="text-sm font-bold">🎧 音檔 <span class="text-xs ${st[2]}">${st[1]}</span></p>
      <span class="flex gap-1.5 shrink-0">
        <button id="cn-${esc(x.id)}" onclick="clip('${esc(auName(x))}','cn-${esc(x.id)}')" class="${btn} ${line} !py-1 text-xs">複製檔名</button>
        <button id="ca-${esc(x.id)}" onclick="clip(find('${esc(x.id)}').script.map(l=>l.t).join(' '),'ca-${esc(x.id)}')" class="${btn} ${line} !py-1 text-xs">複製錄音稿</button>
      </span>
    </div>
    <p class="text-xs text-slate-500 mb-1">整段獨白錄成一個檔，存成 audio/p4/<b class="font-mono">${esc(auName(x))}</b>（${gOf(x) === 'F' ? '女聲' : '男聲'}）。放好後執行 Scan總表與音檔.py。</p>
    <p class="text-xs rounded bg-white dark:bg-slate-900 p-2 leading-relaxed">${esc(x.script.map(l => l.t).join(' '))}</p>
  </div>`;
  // 提報
  const rs = reportsOf(x.id);
  h += `<div class="mt-5"><div class="flex items-center justify-between mb-2"><p class="text-xs font-bold">提報（${rs.length}）</p>${rpBtn(x.id)}</div>
    ${rs.map(r => reportCardH(r)).join('')}</div>`;
  return h;
}
function adminNewH() {
  const A = V.A, ds = Object.keys(DOM);
  let h = hdr('新增題目', "go('admin')");
  h += `<h2 class="font-bold mb-2">1. 選主題</h2><div class="flex flex-wrap gap-2 mb-4">
    ${ds.map(d => `<button onclick="ap('d','${d}')" class="${btn} !py-1.5 ${A.d === d ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${d.toUpperCase()} ${esc(DOM[d].n)}</button>`).join('')}
  </div>`;
  h += `<h2 class="font-bold mb-2">2. 選難度</h2><div class="flex flex-wrap gap-2 mb-4">
    ${Object.keys(TIER).map(t => `<button onclick="ap('t','${t}')" class="${btn} !py-1.5 ${A.t === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${TIER[t]}</button>`).join('')}
  </div>`;
  h += `<h2 class="font-bold mb-2">3. 組數與類型</h2>
    <div class="flex flex-wrap gap-2 mb-2">${[1, 2, 3].map(k => `<button onclick="ap('n',${k})" class="${btn} !py-1.5 ${A.n === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${k} 組</button>`).join('')}</div>
    <div class="flex flex-wrap gap-2 mb-2">
      <button onclick="ap('m','any')" class="${btn} !py-1.5 ${A.m === 'any' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">類型：不限</button>
      ${Object.keys(MT).map(k => `<button onclick="ap('m','${k}')" class="${btn} !py-1.5 ${A.m === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${esc(MT[k])}</button>`).join('')}
    </div>
    <div class="flex flex-wrap gap-2 mb-4">
      ${[['any', '圖表：不限'], ['one', '至少 1 組圖表題'], ['no', '不含圖表題']].map(([k, v]) =>
        `<button onclick="ap('g','${k}')" class="${btn} !py-1.5 ${A.g === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${v}</button>`
      ).join('')}
    </div>`;
  const tx = promptText();
  window._out = tx;
  h += `<div class="${card} p-4">
    <div class="flex items-center justify-between mb-2">
      <p class="font-bold text-sm">給 AI 的「寫題目」指令（約 ${tx.length.toLocaleString()} 字）</p>
      <button id="cp" onclick="copyOut()" class="${btn} ${line} !py-1 text-xs">複製</button>
    </div>
    <pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(tx)}</pre>
    <p class="text-xs text-slate-500 mt-2">AI 回傳的檔案（p4_ 開頭）放到 json_merge.py 同資料夾，選「Part 4 獨白」合併；合併後到維護矩陣點該格即可複製錄音稿與檔名。音檔放 audio/p4/ 後執行 Scan總表與音檔.py。</p>
  </div>`;
  return h;
}
const ap = (k, v) => { V.A[k] = v; render(); };
function copyOut() { clip(window._out || '', 'cp'); }
function clip(t, bid) {
  const d = () => {
    const b = document.getElementById(bid);
    if (b) { b.dataset.l = b.dataset.l || b.textContent; b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = b.dataset.l || '複製'; }, 1500); }
  };
  const fb = () => {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); d();
  };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(d, fb); else fb();
}

/* ---------- 渲染 ---------- */
function render() {
  document.documentElement.classList.toggle('dark', !!S.dark);
  const v = V.view;
  const body =
    v === 'run' ? runH() :
    v === 'result' ? resultH() :
    v === 'book' ? bookH() :
    v === 'practice' ? practiceH() :
    v === 'test' ? testH() :
    v === 'admin' ? adminH() :
    v === 'adminCell' ? adminCellH() :
    v === 'adminItem' ? adminItemH() :
    v === 'adminNew' ? adminNewH() :
    v === 'reports' ? reportsH() :
    homeH();
  main.innerHTML = body + rpModalH();
  if (v === 'run') { paintBar(P.on); autoStart(); }
  if (V.rp && V.rp.focus) { V.rp.focus = false; const t = document.getElementById('rpn'); if (t) t.focus(); }
}

/* ---------- 啟動 ---------- */
function backAdmin() { if (window._ah) location.href = 'index.html#mt'; else goHome(); } // 從首頁「維護總覽」進來的，返回就回總覽
function loadText(t) {
  try {
    const j = JSON.parse(t);
    SPEC = (j && j._spec) || null;
    const d = SPEC && SPEC.domains;
    if (d) {
      const m = {};
      Object.keys(d).forEach(k => {
        const v = d[k];
        if (v && v.name) m[k] = { n: v.name, scenes: v.scenes || [] };
      });
      if (Object.keys(m).length) DOM = m;
    }
    RAW = Array.isArray(j) ? j : (j && j.items) || [];
    DATA = RAW.filter(okSet);
    render();
    if (location.hash === '#admin' && !window._ah) { window._ah = 1; openAdmin(); } // 從首頁「維護總覽」直接進入維護頁
  } catch (e) { alert('part4.json 格式有誤：' + e.message); }
}
function pickJson(i) {
  const f = i.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8');
}
async function boot() {
  await auLoad();
  try {
    const res = await fetch('part4.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    loadText(await res.text());
  } catch (e) {
    main.innerHTML = `<div class="${card} p-8 text-center">
      <h3 class="text-lg font-bold mb-2">請選取 part4.json</h3>
      <p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取；上傳到 GitHub Pages 或用本機伺服器則會自動載入。</p>
      <label class="${btn} inline-block ${pri}">選取 part4.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label>
    </div>`;
  }
}
boot();
