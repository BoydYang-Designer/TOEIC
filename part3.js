/* Part 3 簡短對話：首頁分「練習」與「測驗」；題庫來自 part3.json（一組＝一段對話＋3 題四選一）
   題目 id = d{N}-{NNN}-{e|m|h}（N=主題 D1–D7，與 Part 1 相同）；紀錄存在 toeicPart3V1，KEY（toeicCoachV2）只讀寫 dark。
   練習：可開文稿（英文／英＋中文，點句子可單句重播）、可重播、每題作答後立即看解析；測驗：對話只播一次、不顯示文稿與對錯，3 題全部作答才能進下一組，完成後才檢討。
   音訊：audio/index.json 的 p3.complete 有此組 → 播 audio/p3/{id}-sNN.mp3（一句一檔，用 audio.js 讀索引）；否則用瀏覽器語音合成（男女聲分開）。
   維護：D×難度矩陣 → 該格題組 → 單題頁（對話、題目、音檔面板、提報）；另有「資料健檢」「⚑ 提報」（存在 PK.reports，介面比照 Part 1）與「新增題目」（產生給 AI 的指令）。 */
const KEY = 'toeicCoachV2', PK = 'toeicPart3V1';
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
let R = { rec: {}, saved: {} };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
if (!R.tests) R.tests = {};                      // 測驗紀錄：{ '難度|主題': { best, last, n } }
if (!R.qrec) R.qrec = {};                        // 每題最近一次作答：{ 'd1-001-e|q1': { sel, ok, trap } }（首頁「常中的陷阱」與錯題本用）
if (!Array.isArray(R.reports)) R.reports = [];  // 提報紀錄（存在 PK 裡，與作答紀錄同一份 localStorage）
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };
let DATA = [], RAW = [], SPEC = null, HEALTH = { list: [], err: 0, warn: 0, dropped: 0 };
const TESTN = 6, TARGET = 2, LT = 'ABCD'; // TESTN／TARGET 與 Part 1 相同（PART_UI_GUIDE 1.2 #4 預設；單位是「組」）
const TIER = { easy: '初級', medium: '中級', hard: '高級' }, TS = { easy: 'e', medium: 'm', hard: 'h' }, TSC = { easy: '500–550', medium: '600–650', hard: '700–800' };
const SCORE_RG = { easy: [500, 550], medium: [600, 650], hard: [700, 800] };
const QT = { main: '主旨', detail: '細節', infer: '推論', intent: '意圖', next: '未來行動', graphic: '圖表' };
const TR = { 'mention-not-ask': '提到但非所問', 'wrong-speaker': '張冠李戴', 'number-mix': '數字混淆', 'sound-alike': '音近字', 'over-infer': '過度推論', opposite: '相反', partial: '部分正確' };
let DOM = { d1: { n: '辦公室', scenes: ['office'] }, d2: { n: '餐廳飲食', scenes: ['restaurant'] }, d3: { n: '商店購物', scenes: ['store'] }, d4: { n: '街道與交通', scenes: ['street', 'station'] }, d5: { n: '工地與倉庫', scenes: ['workplace'] }, d6: { n: '旅館與居家', scenes: ['hotel', 'home'] }, d7: { n: '戶外與公園', scenes: ['outdoor'] } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pad = i => String(i).padStart(2, '0');
const find = id => DATA.find(x => x.id === id);
const qKey = (x, q) => x.id + '|' + q.id;
const tierOf = x => { const t = x.level && x.level.tier; if (TIER[t]) return t; const s = (x.level && x.level.score) || 600; return s <= 550 ? 'easy' : s <= 650 ? 'medium' : 'hard'; };
const domOf = x => { if (DOM[x.domain]) return x.domain; const m = /^(d\d)-/.exec(x.id); return m && DOM[m[1]] ? m[1] : null; };
const domLabel = k => DOM[k] ? k.toUpperCase() + ' ' + DOM[k].n : '';
const pool = (t, m) => DATA.filter(x => (!t || tierOf(x) === t) && (!m || domOf(x) === m));
const itemsOf = j => Array.isArray(j) ? j : (j && j.items) || [];
const formL = x => x.form === '3p' ? '三人' : '兩人';

/* ---------- 題庫 ---------- */
function normItem(x) {
  if (!x || !x.id || !Array.isArray(x.dialogue) || !x.dialogue.length || !Array.isArray(x.questions) || !x.questions.length) return null;
  const ok = x.questions.every(q => q && q.q && typeof q.q.t === 'string' && Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.filter(c => c && c.ok).length === 1);
  if (!ok) return null;
  x._ok = true; return x;
}

const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');
/* fd 難度、fm 主題 → 練習篩選；tt 難度、tm 主題 → 測驗篩選；tx 文稿（0 關／1 英文／2 英＋中） */
let V = { view: 'home', pn: 3, fd: null, fm: null, tt: null, tm: null, tx: 0, rp: null, rf: null, rkf: null, run: null };

/* ---------- 音訊：優先 mp3（audio.js 讀 audio/index.json），否則瀏覽器語音合成（男女聲分開）---------- */
const P = { tok: 0, on: false, vs: [], hint: '' };
const hasTTS = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const VBAD = /novelty|fred|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
const vsc = v => { const n = v.name + ' ' + v.voiceURI; let s = 0; if (/premium|enhanced|增強|高品質|進階|natural|online/i.test(n)) s += 10; if (/google/i.test(n)) s += 5; if (/^en[-_]US$/i.test(v.lang)) s += 3; if (/^en[-_](IN|ZA|IE|SG|PH)$/i.test(v.lang)) s -= 5; if (VBAD.test(v.name)) s -= 50; return s; };
const isTZ = v => !!v && /\b(Tom|Zoe)\b/i.test(v.name);
if (hasTTS()) { const g = () => { try { P.vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => vsc(b) - vsc(a)); } catch (e) {} }; g(); try { speechSynthesis.addEventListener('voiceschanged', g); } catch (e) {} }
const voiceFor = g => { const us = P.vs.filter(v => /^en[-_]US$/i.test(v.lang)); return g === 'F' ? (us.find(v => /\bZoe\b/i.test(v.name)) || P.vs.find(v => /female|samantha|zira|karen|susan|hazel|jenny|aria|victoria/i.test(v.name))) : (us.find(v => /\bTom\b/i.test(v.name)) || P.vs.find(v => /david|james|daniel|alex|fred|mark|george|guy|ryan|\bmale/i.test(v.name) && !/female/i.test(v.name))); };
function stopAudio() { P.tok++; P.on = false; auStop(); try { speechSynthesis.cancel(); } catch (e) {} hl(-1); paintAudio(); }
function failPlay(x, tok, msg) { if (tok !== P.tok) return; stopAudio(); P.hint = msg; if (V.run && x) delete V.run.played[x.id]; paintAudio(); } // 沒播成功就不算用掉測驗的那一次
function say(x, idx, tok, next) {
  const l = x.dialogue[idx], sp = x.speakers || [], i = Math.max(0, sp.findIndex(s => s.id === l.sp)), g = (sp[i] || {}).gender || 'F';
  const done = () => { if (tok === P.tok) next(); };
  if (auFull('p3', x.id)) { // 整組 mp3 到齊：全程重複使用同一個 Audio 元素（iOS 需要）；播放失敗就改用機器發音
    const a = AU.el || (AU.el = new Audio()), bad = () => { if (tok !== P.tok) return; AU.bad['p3' + x.id] = 1; say(x, idx, tok, next); };
    a.onended = () => setTimeout(done, 350); a.onerror = bad; a.src = auSrc('p3', x.id + '-s' + pad(idx + 1));
    a.play().catch(e => { if (e.name !== 'AbortError') bad(); });
    return;
  }
  if (!hasTTS()) { failPlay(x, tok, '這個瀏覽器不支援語音合成，請改用 Chrome 或 Safari。'); return; }
  const u = new SpeechSynthesisUtterance(l.t), v = voiceFor(g) || P.vs[0];
  u.lang = v ? v.lang : 'en-US'; if (v) u.voice = v;
  u.pitch = isTZ(v) ? 1 + (i > 1 ? 0.1 : 0) : (g === 'F' ? 1.2 : 0.8) + (i > 1 ? 0.15 : 0); u.rate = .95;
  u.onend = () => setTimeout(done, 350);
  u.onerror = e => { if (tok !== P.tok || e.error === 'interrupted' || e.error === 'canceled') return; failPlay(x, tok, '語音播放失敗（' + (e.error || 'error') + '），請再按一次播放。'); };
  speechSynthesis.speak(u);
}
function play(x, from, only) {
  stopAudio(); const tok = P.tok; let i = from || 0; P.hint = ''; P.on = true; paintAudio();
  const step = () => {
    if (tok !== P.tok) return;
    if (i >= x.dialogue.length || (only && i > from)) { P.on = false; hl(-1); paintAudio(); return; }
    hl(i); say(x, i++, tok, step);
  };
  step();
}
function hl(i) { document.querySelectorAll('.tsent').forEach((e, k) => e.classList.toggle('active', k === i)); }
function playSet() { const r = V.run, x = r.sets[r.i]; if (P.on || (r.mode === 'mock' && r.played[x.id])) return; r.played[x.id] = 1; play(x, 0); }
function play1(i) { const r = V.run; if (r && r.mode === 'practice') play(r.sets[r.i], i, true); }
function audHtml() {
  const r = V.run; if (!r || !r.sets[r.i]) return '';
  const x = r.sets[r.i], mock = r.mode === 'mock', done = !!r.played[x.id], hint = P.hint ? `<span class="text-xs text-rose-500 basis-full">${esc(P.hint)}</span>` : '';
  if (P.on) return (mock ? `<button disabled class="${btn} ${pri}">🔊 播放中…</button>` : `<button onclick="stopAudio()" class="${btn} ${line}">⏹ 停止</button>`) + hint;
  if (mock && done) return `<button disabled class="${btn} ${pri}">已播放</button>`;
  const allDone = x.questions.every(q => r.ans[qKey(x, q)] !== undefined); // 整組都答完：重播改次要樣式，讓「下一組」成為唯一主要按鈕
  return `<button onclick="playSet()" class="${btn} ${allDone ? line : pri}">${done ? '🔁 重播' : '🔊 播放對話'}</button>` + hint;
}
function paintAudio() { const e = document.getElementById('aud'); if (e && V.view === 'run') e.innerHTML = audHtml(); }

/* ---------- 作答流程 ---------- */
function startRun(sets, mode, key, cfg, back) {
  if (!sets.length) return; stopAudio(); P.hint = '';
  V.run = { sets, mode, key, cfg, back, i: 0, ord: {}, ans: {}, played: {}, bag: [] }; V.view = 'run'; render(); window.scrollTo({ top: 0 });
}
const startPractice = () => startRun(shuffle(pool(V.fd, V.fm)).slice(0, V.pn || 9999), 'practice', 'practice');
const tcKey = () => (V.tt || 'all') + '|' + (V.tm || 'all');
const startTest = () => startRun(shuffle(pool(V.tt, V.tm)).slice(0, TESTN), 'mock', 'test', tcKey());
const one = id => { const x = find(id); if (x) startRun([x], 'practice', 'item', null, id); };
function savedKeys() { return Object.keys(R.saved).filter(k => { const [s, q] = k.split('|'), x = find(s); return x && x.questions.some(v => v.id === q); }); }
function startBook() { const seen = {}, sets = []; savedKeys().forEach(k => { const x = find(k.split('|')[0]); if (!seen[x.id]) { seen[x.id] = 1; sets.push(x); } }); startRun(sets, 'practice', 'book'); }
/* 選項順序：每個選項位置輪流放正解（用「袋子」避免連續同一位置），其餘隨機 */
const ordFor = (r, x, q) => {
  const k = qKey(x, q); if (r.ord[k]) return r.ord[k];
  const ok = q.choices.findIndex(c => c.ok);
  if (!r.bag.length) r.bag = shuffle(q.choices.map((_, i) => i));
  const pos = Math.min(r.bag.pop(), q.choices.length - 1), rest = shuffle(q.choices.map((_, i) => i).filter(i => i !== ok));
  rest.splice(pos, 0, ok); return r.ord[k] = rest;
};
function recQ(x, q, ci) { const ch = q.choices[ci], ok = !!(ch && ch.ok), k = qKey(x, q); R.qrec[k] = { sel: ci, ok, trap: ok ? '' : (ch && ch.trap) || '' }; if (!ok) R.saved[k] = 1; else delete R.saved[k]; } // 答錯加入錯題本；之後答對就自動移出
function pick(k, ci) {
  const r = V.run, x = r.sets[r.i], pr = r.mode === 'practice'; if (pr && r.ans[k] !== undefined) return;
  r.ans[k] = ci;
  if (pr) { // 練習：作答當下就記錄（答錯進錯題本；之後答對會自動移出）
    const q = x.questions.find(v => qKey(x, v) === k); if (q) recQ(x, q, ci);
    if (x.questions.every(v => r.ans[qKey(x, v)] !== undefined)) R.rec[x.id] = { s: x.questions.filter(v => v.choices[r.ans[qKey(x, v)]].ok).length, t: Date.now() };
    saveR();
  }
  const y = window.scrollY; render(); window.scrollTo(0, y);
}
function nextSet() {
  const r = V.run; stopAudio(); P.hint = '';
  if (r.i + 1 < r.sets.length) { r.i++; render(); window.scrollTo({ top: 0 }); playSet(); return; } // 換組後自動播放對話（沿用按「下一組」的點擊手勢，手機也能播）
  finish();
}
function finish() {
  const r = V.run; let c = 0, n = 0; const bt = {}, tp = {};
  r.sets.forEach(x => {
    let s = 0;
    x.questions.forEach(q => {
      const k = qKey(x, q), a = r.ans[k], ch = q.choices[a], t = (bt[q.qtype] = bt[q.qtype] || [0, 0]); n++; t[1]++;
      if (ch && ch.ok) { c++; s++; t[0]++; } else if (ch && ch.trap) tp[ch.trap] = (tp[ch.trap] || 0) + 1;
      if (r.mode === 'mock' && a !== undefined) recQ(x, q, a);
    });
    if (r.mode === 'mock') R.rec[x.id] = { s, t: Date.now() };
  });
  if (r.key === 'test') { const o = R.tests[r.cfg] || {}, pct = Math.round(c / n * 100); R.tests[r.cfg] = { best: Math.max(o.best || 0, pct), last: pct, n }; }
  saveR(); r.res = { c, n, bt, tp }; V.view = 'result'; render(); window.scrollTo({ top: 0 });
}
function go(view) { stopAudio(); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const goHome = () => go('home'), openPractice = () => go('practice'), openTest = () => go('test'), openBook = () => go('book'), openAdmin = () => go('admin');
const goBack = () => { const r = V.run; if (r && r.key === 'item' && find(r.back)) adminItem(r.back); else go(r && r.key === 'test' ? 'test' : r && r.key === 'book' ? 'book' : 'practice'); };
function quit() { if (V.run.mode === 'mock' && Object.keys(V.run.ans).length && !confirm('離開後這次測驗不會計分，確定離開？')) return; goBack(); }
function unsave(k) { delete R.saved[k]; saveR(); render(); }
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }
function toggleDark() { S.dark = !S.dark; try { const c = JSON.parse(localStorage.getItem(KEY) || '{}'); c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} render(); }

/* ---------- 畫面 ---------- */
function hdr(title, back) {
  const b = back ? `<button onclick="${back}" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>` : `<a href="index.html" class="${btn} ${line} !py-1.5 shrink-0" aria-label="回到首頁">⌂</a>`;
  return `<header class="flex items-center justify-between gap-2 mb-5"><div class="flex items-center gap-2 min-w-0">${b}<h1 class="text-lg md:text-2xl font-bold truncate">${esc(title)}</h1></div><button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button></header>`;
}
function fbtn(k, v, label, n) {
  const on = (V[k] || null) === v;
  return `<button onclick="setF('${k}',${v ? `'${v}'` : 'null'})" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${n === 0 ? ' opacity-40' : ''}">${label}${n == null ? '' : ` <span class="text-xs opacity-70">${n}</span>`}</button>`;
}
const gH = g => g && Array.isArray(g.columns) && Array.isArray(g.rows) ? `<div class="${card} p-3 mb-3 overflow-x-auto"><p class="text-xs font-bold mb-1">${esc(g.title)}</p><table class="text-sm w-full"><tr>${g.columns.map(c => `<th class="text-left pr-4 border-b border-slate-300 dark:border-slate-700">${esc(c)}</th>`).join('')}</tr>${g.rows.map(r => `<tr>${r.map(c => `<td class="pr-4 py-0.5">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : '';
function metaH(x) {
  const t = tierOf(x), m = domOf(x), sc = x.level && x.level.score;
  return `<div class="flex flex-wrap gap-1.5 mt-2"><span class="${chip}">${TIER[t]}${sc ? ' · ' + sc : ''}</span>${m ? `<span class="${chip}">${esc(domLabel(m))}</span>` : ''}<span class="${chip}">${formL(x)}</span>${x.graphic ? `<span class="${chip}">圖表</span>` : ''}</div>`;
}
const dialogH = (x, zh) => x.dialogue.map(l => `<p class="text-sm py-0.5"><b>${esc(l.sp)}:</b> ${esc(l.t)}${zh && l.zh ? `<span class="block text-xs text-slate-500">${esc(l.zh)}</span>` : ''}</p>`).join('');
/* 解析：題目＋四個選項（正解綠、你選的紅），每個選項附中文、陷阱類型與原因 */
function reviewQH(x, q, qi, sel, order) {
  const ord = order || q.choices.map((_, i) => i);
  return `<div class="mt-3"><p class="text-sm"><b>Q${qi + 1}.</b> [${esc(QT[q.qtype] || q.qtype)}] ${esc(q.q.t)}<span class="block text-xs text-slate-500">${esc(q.q.zh)}　證據句：${(q.evidence || []).join(', ')}</span></p><div class="space-y-1.5 mt-1.5">${ord.map((ci, j) => {
    const c = q.choices[ci], good = !!c.ok, bad = ci === sel && !good;
    const cls = good ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : bad ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50' : 'border-slate-200 dark:border-slate-800';
    return `<div class="rounded-lg border px-3 py-2 text-sm ${cls}"><div class="flex justify-between gap-2"><span><b>${LT[j]}.</b> ${esc(c.t)}</span><span class="text-xs shrink-0 ${good ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${good ? '✓ 正解' + (c.pattern ? ' · ' + esc(c.pattern) : '') : (bad ? '✗ 你選的 · ' : '') + esc(TR[c.trap] || '')}</span></div>${c.zh ? `<p class="text-xs text-slate-500 mt-0.5">${esc(c.zh)}</p>` : ''}<p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc(c.why)}</p></div>`;
  }).join('')}</div></div>`;
}
function runH() {
  const r = V.run, x = r.sets[r.i], n = r.sets.length, pr = r.mode === 'practice', mock = !pr, last = r.i === n - 1;
  const done = q => r.ans[qKey(x, q)] !== undefined, nAns = x.questions.filter(done).length, allDone = nAns === x.questions.length, ev = new Set();
  if (pr) x.questions.forEach(q => { if (done(q)) (q.evidence || []).forEach(i => ev.add(i)); });
  let h = hdr(`${mock ? '測驗' : '練習'} · ${r.i + 1} / ${n}`, 'quit()');
  h += `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-4"><div class="h-1.5 rounded bg-indigo-600" style="width:${(r.i + nAns / x.questions.length) / n * 100}%"></div></div>`;
  const nextBtn = `<button ${mock && !allDone ? 'disabled' : ''} onclick="nextSet()" class="${btn} ${allDone ? pri : line + ' disabled:opacity-40 disabled:cursor-not-allowed'}">${last ? '完成，看結果' : '下一組 →'}</button>`;
  h += `<div class="flex items-center gap-3 mb-4 flex-wrap"><span id="aud" class="flex items-center gap-2 flex-wrap">${audHtml()}</span>${nextBtn}<span class="text-xs text-slate-400">${mock ? '只播放一次' : '可重複播放'}</span><span class="ml-auto">${rpBtn(x.id)}</span></div>`;
  if (pr) h += `<div class="flex items-center gap-2 mb-3 text-xs text-slate-500">文稿：${[[0, '關'], [1, '英文'], [2, '英＋中']].map(([k, l]) => `<button onclick="V.tx=${k};render()" class="${btn} !py-1 !px-3 text-xs ${V.tx === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div>`;
  if (pr && V.tx) h += `<div class="${card} p-3 mb-3">${x.dialogue.map((l, i) => `<p class="tsent px-2 py-1 text-sm ${ev.has(i) ? '!bg-amber-100 dark:!bg-amber-900/40' : ''}" onclick="play1(${i})"><b>${esc(l.sp)}:</b> ${esc(l.t)}${V.tx === 2 && l.zh ? `<span class="block text-xs text-slate-500">${esc(l.zh)}</span>` : ''}</p>`).join('')}</div>`;
  else if (mock) h += `<p class="text-xs text-slate-500 mb-3">${formL(x)}對話，聽完後回答 ${x.questions.length} 題（文字作答後才顯示）</p>`;
  h += gH(x.graphic);
  h += x.questions.map((q, qi) => {
    const k = qKey(x, q), a = r.ans[k], dn = a !== undefined;
    return `<div class="${card} p-4 mb-3"><p class="text-sm font-bold">${qi + 1}. ${esc(q.q.t)}</p>${pr && dn && q.q.zh ? `<p class="text-xs text-slate-500">${esc(q.q.zh)}</p>` : ''}<div class="mt-2">${ordFor(r, x, q).map((ci, j) => {
      const c = q.choices[ci]; let cls = line + (pr && dn ? '' : ' hover:bg-slate-100 dark:hover:bg-slate-800');
      if (pr && dn) { if (c.ok) cls = 'border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50'; else if (ci === a) cls = 'border border-rose-500 bg-rose-50 dark:bg-rose-950/50'; }
      else if (mock && ci === a) cls = 'border border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50';
      return `<button ${pr && dn ? 'disabled' : ''} data-k="${esc(k)}" data-c="${ci}" onclick="pick(this.dataset.k,+this.dataset.c)" class="w-full text-left rounded-lg px-3 py-2 text-sm mb-1.5 cursor-pointer ${cls}"><b>${LT[j]}.</b> ${esc(c.t)}${pr && dn && c.zh ? `<span class="block text-xs text-slate-500">${esc(c.zh)}</span>` : ''}${pr && dn ? `<span class="block text-xs mt-1 ${c.ok ? 'text-emerald-600' : 'text-slate-500'}">${c.ok ? '✓ 正解' : esc(TR[c.trap] || '')}：${esc(c.why)}</span>` : ''}</button>`;
    }).join('')}</div></div>`;
  }).join('');
  if (mock && !allDone) h += `<p class="text-xs text-slate-400 mt-2">請先回答這一組的 ${x.questions.length} 題（還差 ${x.questions.length - nAns} 題），才能按「${last ? '完成，看結果' : '下一組'}」。</p>`;
  return h;
}
function resultH() {
  const r = V.run, { c, n, bt, tp } = r.res, test = r.key === 'test', prac = r.key === 'practice', book = r.key === 'book', item = r.key === 'item';
  let h = hdr('作答結果', 'goBack()'), sub = test ? '測驗成績' : '練習結果（不計入成績）';
  if (test) { const [t, m] = r.cfg.split('|'); sub += ` · ${TIER[t] || '不限難度'} · ${DOM[m] ? domLabel(m) : '不限主題'}`; }
  const row = (a, b) => `<div class="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800"><span>${a}</span><span>${b}</span></div>`;
  h += `<div class="${card} p-5 text-center mb-5"><p class="text-sm text-slate-500">${sub} · ${r.sets.length} 組</p><p class="text-4xl font-bold mt-1 ${c / n >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}">${c} / ${n}</p><div class="flex gap-2 justify-center mt-4"><button onclick="goBack()" class="${btn} ${line}">${test ? '回測驗選單' : book ? '回錯題本' : item ? '回題目頁' : '回練習選單'}</button>${test ? `<button onclick="startTest()" class="${btn} ${pri}">再測一次（重新抽題）</button>` : prac ? `<button onclick="startPractice()" class="${btn} ${pri}">再練一次（重新抽題）</button>` : item ? `<button onclick="one('${esc(r.back)}')" class="${btn} ${pri}">再練一次</button>` : ''}</div></div>`;
  h += `<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">各題型</p>${Object.keys(bt).map(k => row(QT[k] || k, bt[k][0] + '/' + bt[k][1])).join('')}</div>`;
  if (Object.keys(tp).length) h += `<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">你這次中的陷阱</p>${Object.keys(tp).sort((a, b) => tp[b] - tp[a]).map(k => row(TR[k] || k, tp[k] + ' 次')).join('')}</div>`;
  r.sets.forEach((x, i) => {
    const s = x.questions.filter(q => { const ch = q.choices[r.ans[qKey(x, q)]]; return ch && ch.ok; }).length, ok = s === x.questions.length;
    h += `<div class="${card} p-4 mb-3"><p class="text-sm font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}">${ok ? '✓' : '✗'} 第 ${i + 1} 組 · ${esc(x.tag)} <span class="text-xs font-normal text-slate-500">${s} / ${x.questions.length} 題</span></p>${metaH(x)}`
      + x.questions.map((q, qi) => reviewQH(x, q, qi, r.ans[qKey(x, q)], ordFor(r, x, q))).join('')
      + `<details class="mt-3"><summary class="text-xs text-slate-500 cursor-pointer">看對話文稿</summary><div class="mt-1">${dialogH(x, true)}</div></details><div class="mt-3 text-right">${rpBtn(x.id)}</div></div>`;
  });
  return h;
}
function bookH() {
  const ks = savedKeys(); let h = hdr('錯題本', 'goHome()');
  if (!ks.length) return h + `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`;
  const nSets = new Set(ks.map(k => k.split('|')[0])).size;
  h += `<button onclick="startBook()" class="${btn} ${pri} w-full mb-1">重做這 ${ks.length} 題</button><p class="text-xs text-slate-400 mb-4">會重做含這些題的 ${nSets} 組對話（每組 3 題）。</p>`;
  ks.forEach(k => {
    const [sid, qid] = k.split('|'), x = find(sid), qi = x.questions.findIndex(v => v.id === qid), q = x.questions[qi];
    h += `<div class="${card} p-4 mb-3"><div class="flex justify-between items-center"><p class="text-sm font-bold">${esc(x.id)} · ${esc(x.tag)}</p><button onclick="unsave(this.dataset.k)" data-k="${esc(k)}" class="text-xs text-rose-500 hover:underline">移除</button></div>${reviewQH(x, q, qi, (R.qrec[k] || {}).sel, null)}<details class="mt-3"><summary class="text-xs text-slate-500 cursor-pointer">看對話文稿</summary><div class="mt-1">${dialogH(x, true)}</div></details><div class="mt-3 text-right">${rpBtn(x.id, qi + 1)}</div></div>`;
  });
  return h;
}
function homeH() {
  let h = hdr('Part 3 簡短對話');
  if (!DATA.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">part3.json 還沒有題目。<br><button onclick="openAdmin()" class="${btn} ${line} mt-4">🛠 維護</button></div>`;
  const nSaved = savedKeys().length;
  h += `<div class="grid gap-3 md:grid-cols-2 mb-4"><button onclick="openPractice()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📖 練習</p><p class="text-sm text-slate-500 mt-2">依難度、主題隨機抽題組，不計分。可開文稿、單句重播，每題作答後立即看解析。</p></button>
    <button onclick="openTest()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📝 測驗</p><p class="text-sm text-slate-500 mt-2">選難度（可再選主題），隨機抽 ${TESTN} 組對話（每組 3 題）。對話只播一次、不顯示文稿，完成後才檢討。</p></button></div>
    <div class="grid grid-cols-3 gap-3"><button onclick="openBook()" class="${btn} ${line}">★ 錯題本 ${nSaved}</button><button onclick="go('reports')" class="${btn} ${line}">⚑ 提報${openRpN() ? ' ' + openRpN() : ''}</button><button onclick="openAdmin()" class="${btn} ${line}">🛠 維護</button></div>`;
  const cnt = {}; Object.values(R.qrec).forEach(r => { if (!r.ok && TR[r.trap]) cnt[r.trap] = (cnt[r.trap] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  if (top.length) h += `<h2 class="font-bold mt-8 mb-2">你常中的陷阱（依最近一次作答）</h2><div class="flex flex-wrap gap-2">${top.map(([k, v]) => `<span class="${chip}">${TR[k]} × ${v}</span>`).join('')}</div>`;
  return h;
}
const tierHint = () => Object.keys(TIER).map(k => `${TIER[k]} ${((SPEC && SPEC.tiers && SPEC.tiers[k] && SPEC.tiers[k].score) || TSC[k])}`).join('；') + '（多益預估分數）';
function practiceH() {
  let h = hdr('練習', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件隨機抽題組（每組一段對話＋3 題），不計分。對話可重播，作答中可開文稿；答錯的題會放進錯題本。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('fd', null, '不限難度', pool(null, V.fm).length)}${Object.keys(TIER).map(k => fbtn('fd', k, TIER[k], pool(k, V.fm).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-5">${fbtn('fm', null, '不限主題', pool(V.fd, null).length)}${Object.keys(DOM).map(k => fbtn('fm', k, domLabel(k), pool(V.fd, k).length)).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">3. 組數</h2><div class="flex flex-wrap gap-2 mb-5">${[[3, '3 組'], [6, '6 組'], [0, '全部']].map(([v, l]) => `<button onclick="V.pn=${v};render()" class="${btn} !py-1.5 ${V.pn === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div>`;
  const m = pool(V.fd, V.fm).length, n = V.pn ? Math.min(m, V.pn) : m;
  h += `<button onclick="startPractice()" ${m ? '' : 'disabled'} class="${btn} ${pri} w-full">開始練習（${n} 組）</button>`;
  if (!m) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`;
  else if (V.pn && m < V.pn) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${m} 組，將全部出題。</p>`;
  return h;
}
function testH() {
  let h = hdr('測驗', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件隨機抽 ${TESTN} 組對話（每組 3 題）。對話只播放一次，作答中不顯示文稿與對錯，完成後一次檢討。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tt', null, '不限難度', pool(null, V.tm).length)}${Object.keys(TIER).map(k => fbtn('tt', k, TIER[k], pool(k, V.tm).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tm', null, '不限主題', pool(V.tt, null).length)}${Object.keys(DOM).map(k => fbtn('tm', k, domLabel(k), pool(V.tt, k).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${V.tm ? '只從「' + domLabel(V.tm) + '」抽題；再點一次可取消。' : '不限主題：依上面選的難度，從所有主題隨機抽題。'}</p>`;
  const n = pool(V.tt, V.tm).length, o = R.tests[tcKey()];
  h += `<button onclick="startTest()" ${n ? '' : 'disabled'} class="${btn} ${pri} w-full">開始測驗（${Math.min(n, TESTN)} 組）</button>`;
  if (!n) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`; else if (n < TESTN) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${n} 組，將全部出題。</p>`;
  if (o) h += `<p class="text-xs text-slate-500 mt-3">這個組合的紀錄：最佳 ${o.best}% · 最近一次 ${o.last}%</p>`;
  return h;
}

/* ---------- 資料健檢（只讀取、不修改資料；規則來自 part3.json 的 _spec.entry_schema／rules／tiers）---------- */
const ID_RE = /^d([1-7])-(\d{3})-([emh])$/, SUF = { e: 'easy', m: 'medium', h: 'hard' }, PAT = ['direct', 'paraphrase', 'summary'];
const nWords = s => (String(s).match(/[A-Za-z0-9']+/g) || []).length;
const nrm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
function auditAll(raw) {
  const list = [], add = (id, lv, msg) => list.push({ id, lv, msg }), ids = {}, tags = {}, vocabSeen = {}; let dropped = 0;
  raw.forEach((x, i) => {
    const id = x && x.id ? String(x.id) : '第 ' + (i + 1) + ' 筆';
    if (!x || !x._ok) { dropped++; add(id, 'err', '格式不合（缺 id／dialogue／questions，或某題不是「至少 2 個選項、剛好 1 個正解」），已被略過，不會出現在練習／測驗'); return; }
    if (ids[id]) add(id, 'err', 'id 重複'); ids[id] = 1;
    const m = ID_RE.exec(id), lv = x.level || {}, sc = lv.score, tr = m && SUF[m[3]];
    if (!m) add(id, 'err', 'id 格式應為 d{1-7}-{3 位數}-{e|m|h}');
    else {
      if (x.domain !== 'd' + m[1]) add(id, 'err', 'domain 應為 d' + m[1]);
      if (lv.tier !== tr) add(id, 'err', 'level.tier 應等於 id 尾碼（' + tr + '）');
      if (DOM['d' + m[1]] && !(DOM['d' + m[1]].scenes || []).includes(x.scene)) add(id, 'err', `scene「${x.scene}」不屬於 d${m[1]}（可用：${(DOM['d' + m[1]].scenes || []).join('、')}）`);
    }
    if (typeof sc !== 'number') add(id, 'err', 'level.score 必須是數字');
    else { if (sc % 50) add(id, 'warn', 'level.score 建議為 50 的倍數'); if (tr && (sc < SCORE_RG[tr][0] || sc > SCORE_RG[tr][1])) add(id, 'err', `level.score ${sc} 不在${TIER[tr]}範圍 ${TSC[tr]}`); }
    if (!lv.cefr || !lv.why) add(id, 'warn', 'level.cefr 或 level.why 是空的');
    if (!String(x.tag || '').trim()) add(id, 'err', '缺少 tag'); else if (tags[x.tag] && tags[x.tag] !== id) add(id, 'warn', `tag「${x.tag}」與 ${tags[x.tag]} 相同`); else tags[x.tag] = id;
    /* 說話者與對話 */
    const sp = Array.isArray(x.speakers) ? x.speakers : [], spIds = sp.map(s => s && s.id);
    if (x.form !== '2p' && x.form !== '3p') add(id, 'err', "form 必須是 '2p' 或 '3p'");
    if (!sp.length) add(id, 'err', '缺少 speakers');
    else {
      if (sp.some(s => !s || !s.id || (s.gender !== 'F' && s.gender !== 'M'))) add(id, 'err', 'speakers 每位都要有 id 與 gender（F／M）');
      if (x.form === '2p' && sp.length !== 2) add(id, 'err', `2p 需要 2 位說話者（目前 ${sp.length}）`);
      if (x.form === '3p') { if (sp.length !== 3) add(id, 'err', `3p 需要 3 位說話者（目前 ${sp.length}）`); else if (!['F', 'M'].some(g => sp.filter(s => s.gender === g).length >= 2)) add(id, 'err', '3p 須有兩位同性別說話者'); }
    }
    const nd = x.dialogue.length, bad = [];
    x.dialogue.forEach((l, k) => {
      if (!l || typeof l.t !== 'string' || !l.sp) { add(id, 'err', `對話第 ${k + 1} 句格式不對（需要 sp 與 t）`); return; }
      if (sp.length && !spIds.includes(l.sp)) add(id, 'err', `對話第 ${k + 1} 句的 sp「${l.sp}」不在 speakers`);
      if (!String(l.zh || '').trim()) add(id, 'warn', `對話第 ${k + 1} 句缺少 zh`);
      const w = nWords(l.t); if (w < 5 || w > 25) bad.push(`第 ${k + 1} 句 ${w} 字`);
    });
    if (bad.length) add(id, 'warn', `對話句子字數不在 5–25：${bad.join('、')}`);
    if (tr === 'easy' && (x.form !== '2p' || nd < 6 || nd > 8)) add(id, 'warn', `初級定義為兩人、6–8 句（目前 ${formL(x)}、${nd} 句）`);
    if (tr === 'hard' && (x.form !== '3p' || nd < 10)) add(id, 'warn', `高級定義為三人、10 句以上（目前 ${formL(x)}、${nd} 句）`);
    /* 圖表 */
    const g = x.graphic;
    if (g != null) {
      if (!g.title || !Array.isArray(g.columns) || !g.columns.length || !Array.isArray(g.rows) || !g.rows.length) add(id, 'err', 'graphic 需要 title、columns、rows');
      else if (g.rows.some(r => !Array.isArray(r) || r.length !== g.columns.length)) add(id, 'err', 'graphic 有一列的欄數與 columns 不同');
    }
    /* 題目 */
    const qs = x.questions;
    if (qs.length !== 3) add(id, 'err', `每組必須剛好 3 題（目前 ${qs.length}）`);
    let prev = -1, hasG = false;
    qs.forEach((q, k) => {
      const n = k + 1;
      if (!QT[q.qtype]) add(id, 'err', `第 ${n} 題 qtype 不合法：${q.qtype}`);
      if (q.qtype === 'graphic') { hasG = true; if (g == null) add(id, 'err', `第 ${n} 題是圖表題，但這組沒有 graphic`); if (!/^look at the graphic/i.test(q.q.t)) add(id, 'warn', `第 ${n} 題（圖表題）題目應以 Look at the graphic 開頭`); }
      if (!q.q.zh) add(id, 'warn', `第 ${n} 題缺少題目 zh`);
      if (q.choices.length !== 4) add(id, 'err', `第 ${n} 題必須剛好 4 個選項（目前 ${q.choices.length}）`);
      const seen = {};
      q.choices.forEach((c, j) => {
        const cn = LT[j] || j + 1;
        if (!c || typeof c.t !== 'string' || typeof c.ok !== 'boolean') { add(id, 'err', `第 ${n} 題選項 ${cn} 格式不對（需要 t 與 ok）`); return; }
        const key = nrm(c.t); if (seen[key]) add(id, 'err', `第 ${n} 題選項 ${cn} 與 ${seen[key]} 重複`); else seen[key] = cn;
        if (c.ok) { if (!PAT.includes(c.pattern)) add(id, 'warn', `第 ${n} 題正解 pattern「${c.pattern}」不在 ${PAT.join('／')}`); }
        else if (!TR[c.trap]) add(id, 'err', `第 ${n} 題選項 ${cn} trap 不合法：${c.trap}`);
        if (!String(c.zh || '').trim() || !String(c.why || '').trim()) add(id, 'warn', `第 ${n} 題選項 ${cn} 缺少 zh 或 why`);
      });
      const ev = q.evidence;
      if (!Array.isArray(ev) || !ev.length) add(id, 'warn', `第 ${n} 題缺少 evidence`);
      else if (ev.some(v => !Number.isInteger(v) || v < 0 || v >= nd)) add(id, 'err', `第 ${n} 題 evidence 含超出對話範圍的索引（0–${nd - 1}）`);
      else { if (ev[0] < prev) add(id, 'warn', `第 ${n} 題 evidence 沒有隨題號遞增`); prev = ev[0]; }
    });
    if (g != null && !hasG) add(id, 'warn', '有 graphic 但沒有圖表題');
    /* vocab */
    const vc = Array.isArray(x.vocab) ? x.vocab : [];
    if (!vc.length) add(id, 'err', '缺少 vocab');
    else {
      if (vc.length < 2 || vc.length > 4) add(id, 'warn', `vocab 有 ${vc.length} 個（建議 2–4 個）`);
      const blob = nrm(x.dialogue.map(l => l.t).join(' ') + ' ' + qs.map(q => q.q.t + ' ' + q.choices.map(c => c.t).join(' ')).join(' '));
      vc.forEach((v, k) => {
        const miss = ['word', 'ipa', 'pos', 'col', 'zh'].filter(f => !v || !String(v[f] || '').trim());
        if (miss.length) { add(id, 'err', `vocab 第 ${k + 1} 項缺少：${miss.join('、')}`); return; }
        const w = nrm(v.word), stem = w.includes(' ') ? w : w.replace(/e$/, '');
        if (!blob.includes(stem)) add(id, 'warn', `單字「${v.word}」沒有出現在對話或題目中`);
        if (vocabSeen[w] && vocabSeen[w] !== id) add(id, 'warn', `單字「${v.word}」與 ${vocabSeen[w]} 重複`); else vocabSeen[w] = id;
      });
    }
  });
  const c = lv => list.filter(h => h.lv === lv).length; return { list, err: c('err'), warn: c('warn'), dropped };
}
const hItems = id => (HEALTH.list || []).filter(h => h.id === id);

/* ---------- 維護：D×難度矩陣 → 該格題組 → 單題頁；新增題目 ---------- */
const A = { d: null, t: null, k: null, nd: 'd1', nt: 'easy', nf: '2p', nn: 1, ng: 'one', out: [] };
const tcol = n => n >= TARGET ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : n ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400';
const HL = { err: ['✖', 'text-rose-600 dark:text-rose-400'], warn: ['⚠', 'text-amber-600 dark:text-amber-400'] };
function goA(view, p) { stopAudio(); Object.assign(A, p || {}); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const adminCell = (d, t) => goA('adminCell', { d, t }), adminItem = k => goA('adminItem', { k }), adminNew = (d, t) => goA('adminNew', { nd: d || A.nd, nt: t || A.nt });
const apick = (k, v) => { A[k] = v; render(); };
const idBtn = id => find(id) ? `<button onclick="adminItem(this.dataset.k)" data-k="${esc(id)}" class="font-bold underline decoration-dotted cursor-pointer">${esc(id)}</button>` : `<b>${esc(id)}</b>`;
const auSt = id => auFull('p3', id) ? ['complete', '✓ 音檔齊', 'text-emerald-600'] : (((AU.idx || {}).p3 || {}).partial || {})[id] ? ['partial', '✖ 缺 ' + AU.idx.p3.partial[id].length + ' 檔', 'text-rose-600'] : ['none', '✖ 缺音檔（整組改用機器發音）', 'text-rose-600'];
const gOf = (x, sp) => ((x.speakers || []).find(s => s.id === sp) || {}).gender || '?';
const auName = (x, i) => x.id + '-s' + pad(i + 1) + '.mp3';
const copyAudio = id => { const x = find(id); clip(x.dialogue.map((l, i) => auName(x, i) + '\t' + l.sp + '(' + gOf(x, l.sp) + ')\t' + l.t).join('\n'), 'ca-' + id); };
const copyNames = id => { const x = find(id); clip(x.dialogue.map((l, i) => auName(x, i)).join('\n'), 'cn-' + id); };
/* ---------- 缺音檔提示（PART_UI_GUIDE 5.7）：以 audio/index.json 為準；整組對話沒到齊（不在 p3.complete）＝缺音檔，該組改用機器發音，仍可作答 ---------- */
const UNIT = '組';
const auHas = x => !!(AU.idx && AU.idx.p3 && (AU.idx.p3.complete || []).includes(x.id));
const auMissing = x => !auHas(x);
const missAud = () => DATA.filter(auMissing);
const inCell = (d, t) => DATA.filter(x => domOf(x) === d && (!t || tierOf(x) === t)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
/* 某組缺的音檔：[{name, text, g}]（partial 清單有列出缺哪幾句，沒列＝全缺） */
function auMissRows(x) {
  if (!auMissing(x)) return [];
  const ms = (((AU.idx || {}).p3 || {}).partial || {})[x.id];
  return x.dialogue.map((l, i) => ({ name: auName(x, i).slice(0, -4), text: l.t, g: gOf(x, l.sp) })).filter(r => !ms || ms.includes(r.name));
}
const auChipH = x => auHas(x) ? `<span class="${chip} !text-emerald-700 dark:!text-emerald-400">✓ 音檔齊</span>`
  : `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">缺音檔${((((AU.idx || {}).p3 || {}).partial || {})[x.id] || []).length ? '（缺 ' + AU.idx.p3.partial[x.id].length + ' 檔）' : ''}</span>`;
async function recheckAudio() { await auLoad(); render(); }
function clipText(t, bid) {
  const done = () => { const b = document.getElementById(bid); if (b) { b.dataset.l = b.dataset.l || b.textContent; b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = b.dataset.l || '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb); else fb();
}
function copyCellMiss(d, t) { clipText(inCell(d, t).flatMap(auMissRows).map(r => r.name + '.mp3 | ' + r.text + ' | ' + r.g).join('\n'), 'cm'); }
function cellStat(d, t) { const xs = pool(t, d); return { n: xs.length, aud: xs.filter(auMissing).length }; }
function audioStatusH() {
  const N = DATA.length, miss = missAud().length, ok = N - miss;
  const s = !N ? '' : !AU.idx ? '<span class="text-rose-600 dark:text-rose-400">✖ 尚未讀到 audio/index.json（全部用機器發音）</span>'
    : miss ? `<span class="text-rose-600 dark:text-rose-400">✖ 缺 <b>${miss}</b> ${UNIT}（有 mp3：${ok} / ${N}；缺的整${UNIT}改用機器發音）</span>`
      : `<span class="text-emerald-600 dark:text-emerald-400">✔ ${ok} ${UNIT}都有 mp3</span>`;
  return `<span class="flex items-center gap-2">${s}${N ? `<button onclick="recheckAudio()" class="${btn} ${line} !py-0.5 !px-2 text-xs">重新檢查</button>` : ''}</span>`;
}
function auPanelH(x) {
  const miss = (((AU.idx || {}).p3 || {}).partial || {})[x.id] || [], st = auSt(x.id);
  const rows = x.dialogue.map((l, i) => { const f = auName(x, i), m = st[0] === 'none' || miss.includes(f.slice(0, -4));
    return `<tr class="border-t border-slate-100 dark:border-slate-800 align-top"><td class="pr-2 py-1 font-mono text-xs whitespace-nowrap ${m ? 'text-rose-600' : 'text-emerald-600'}">${m ? '✗' : '✓'} ${esc(f)}</td><td class="pr-2 text-xs whitespace-nowrap">${esc(l.sp)}／${gOf(x, l.sp)}</td><td class="text-xs">${esc(l.t)}</td></tr>`; }).join('');
  return `<div class="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><div class="flex flex-wrap items-center justify-between gap-2 mb-1"><p class="text-xs font-bold">🎧 音檔 <span class="${st[2]}">${st[1]}</span>${AU.idx ? '' : ' · 尚未讀到 audio/index.json'}</p><span class="flex gap-1.5 shrink-0"><button id="cn-${esc(x.id)}" onclick="copyNames(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1 text-xs">複製檔名</button><button id="ca-${esc(x.id)}" onclick="copyAudio(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1 text-xs">複製錄音稿</button></span></div><p class="text-xs text-slate-500 mb-1">放到 audio/p3/，一句一檔；F＝女聲、M＝男聲，請依性別錄製。放好後執行 audio_scan.py。</p><div class="overflow-x-auto"><table class="w-full">${rows}</table></div></div>`;
}
function adminH() {
  const doms = Object.keys(DOM), tiers = Object.keys(TIER), qc = {}; DATA.forEach(x => x.questions.forEach(q => { qc[q.qtype] = (qc[q.qtype] || 0) + 1; }));
  let low = 0; doms.forEach(d => tiers.forEach(t => { if (pool(t, d).length < TARGET) low++; }));
  const nAu = DATA.filter(auHas).length, H = HEALTH;
  let h = hdr('維護', 'backAdmin()');
  h += `<div class="${card} p-4 mb-4 text-sm"><div class="flex flex-wrap gap-x-6 gap-y-1"><span>題組 <b>${DATA.length}</b> 組（共 ${DATA.reduce((a, x) => a + x.questions.length, 0)} 題）${H.dropped ? ` <span class="${HL.err[1]}">（另有 ${H.dropped} 筆格式不合被略過）</span>` : ''}</span><span>音檔 <b>${nAu}</b> 組</span><span class="text-slate-500">未達標格子 <b>${low}</b> / ${doms.length * tiers.length}（目標每格 ≥ ${TARGET} 組）</span></div>
    <div class="flex flex-wrap gap-1.5 mt-3">${Object.keys(QT).map(k => `<span class="${chip}">${QT[k]} <b>${qc[k] || 0}</b></span>`).join('')}</div>
    <div class="flex flex-wrap items-center gap-2 mt-2 text-xs"><span class="text-slate-500">音檔：</span>${audioStatusH()}</div></div>`;
  h += `<div class="${card} p-4 mb-4"><div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><b>資料健檢</b>${!H.err && !H.warn ? '<span class="text-emerald-600 dark:text-emerald-400">✔ 全部通過</span>' : `${H.err ? `<span class="${HL.err[1]}">✖ 錯誤 <b>${H.err}</b></span>` : ''}${H.warn ? `<span class="${HL.warn[1]}">⚠ 提醒 <b>${H.warn}</b></span>` : ''}`}</div>`;
  if (H.list.length) { const g = {}, order = []; H.list.forEach(it => { if (!g[it.id]) { g[it.id] = []; order.push(it.id); } g[it.id].push(it); }); h += `<details class="mt-2" ${H.err ? 'open' : ''}><summary class="text-xs cursor-pointer text-slate-500">查看明細（${order.length} 組有項目）</summary><div class="max-h-96 overflow-auto">${order.map(id => `<div class="mt-2"><p class="text-xs">${idBtn(id)}</p><ul class="text-xs space-y-0.5 mt-0.5">${g[id].map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`).join('')}</div></details>`; }
  h += `</div><div class="overflow-x-auto mb-3"><div class="grid gap-1.5 text-center text-sm min-w-[32rem]" style="grid-template-columns:4.5rem repeat(${doms.length},minmax(3rem,1fr))"><div></div>${doms.map(d => `<button onclick="adminCell('${d}',null)" class="text-xs font-bold py-1 cursor-pointer hover:text-indigo-600">${d.toUpperCase()}<br><span class="font-normal text-slate-500">${esc(DOM[d].n)}</span></button>`).join('')}`;
  tiers.forEach(t => { h += `<div class="text-left self-center text-xs font-bold">${TIER[t]} ${TS[t]}<span class="block font-normal text-slate-500">${TSC[t]}</span></div>` + doms.map(d => { const s = cellStat(d, t); return `<button onclick="adminCell('${d}','${t}')" class="rounded-lg py-3 font-bold cursor-pointer ${tcol(s.n)}">${s.n}${s.aud ? `<span class="block text-[10px] font-normal text-rose-600 dark:text-rose-400">缺音檔 ${s.aud}</span>` : ''}</button>`; }).join(''); });
  return h + `</div></div><p class="text-xs text-slate-400 mb-5">格子＝該難度、該主題的題組數（每組一段對話＋3 題）。紅＝0、黃＝未達 ${TARGET}、綠＝達標；格內紅字小字＝缺音檔的組數（缺的整組用機器發音，仍可作答）。點格子看題組；點上方 D1–D7 看該主題全部難度。</p><button onclick="go('reports')" class="${btn} ${line} w-full mb-3">⚑ 提報彙整${openRpN() ? `（待處理 ${openRpN()}）` : ''}</button><button onclick="adminNew()" class="${btn} ${pri} w-full">＋ 新增題目</button>`;
}
function adminCellH() {
  const d = A.d, t = A.t, xs = DATA.filter(x => domOf(x) === d && (!t || tierOf(x) === t)).sort((a, b) => String(a.id).localeCompare(String(b.id))), nm = domLabel(d) + (t ? ' · ' + TIER[t] : '');
  let h = hdr(nm, 'openAdmin()') + `<button onclick="adminNew('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${pri} w-full mb-3">＋ 新增 ${esc(nm.replace(' · ', ' '))} 題目</button>`;
  { const nm_ = xs.filter(auMissing).length; h += `<button id="cm" ${nm_ ? '' : 'disabled'} onclick="copyCellMiss('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${line} w-full mb-4">複製本格缺的音檔清單（${nm_}）</button>`; }
  if (!xs.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有題目（0 組）。<br><span class="text-xs text-slate-400">點上方「＋ 新增」開始建立。</span></div>`;
  return h + xs.map(x => {
    const k = tierOf(x), sc = x.level && x.level.score, nh = hItems(x.id).length, nr = openRpN(x.id), r = R.rec[x.id];
    const badge = (nh ? `<span class="${chip} !bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300">⚠ ${nh}</span>` : '') + (nr ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">⚑ 提報 ${nr}</span>` : '');
    return `<div class="${card} p-3 mb-3"><p class="font-bold text-sm">${esc(x.id)}</p><p class="text-xs text-slate-500 truncate">${esc(x.tag)}</p><p class="text-sm mt-2">${esc(x.dialogue[0].t)}</p>
      <div class="flex flex-wrap gap-1 mt-2">${badge}<span class="${chip}">${TIER[k]}${sc ? ' · ' + sc : ''}</span><span class="${chip}">${formL(x)}</span>${x.graphic ? `<span class="${chip}">圖表</span>` : ''}${auChipH(x)}${r ? `<span class="${chip}">上次 ${r.s}/${x.questions.length}</span>` : ''}</div>
      <button onclick="adminItem(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1 text-xs mt-2">看題目與答案</button></div>`;
  }).join('');
}
function adminItemH() {
  const x = find(A.k);
  if (!x) return hdr('維護', 'openAdmin()') + `<p class="text-sm text-slate-400 text-center py-8">找不到這一組。</p>`;
  const d = domOf(x), t = tierOf(x), vocab = (x.vocab || []).map(w => `<span class="${chip}">${esc(w.word)} ${esc(w.zh)}</span>`).join(' ');
  let h = hdr(x.id, d ? `adminCell('${d}','${t}')` : 'openAdmin()');
  h += `<p class="text-sm font-bold">${esc(x.tag)}</p>${metaH(x)}`;
  if (x.level && x.level.why) h += `<p class="text-xs text-slate-500 mt-2">${esc(x.level.why)}</p>`;
  h += `<button onclick="one(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1.5 text-xs mt-3">▶ 練習這一組</button>`;
  h += `<p class="text-xs font-bold mt-5 mb-2">對話（${x.dialogue.length} 句；說話者 ${(x.speakers || []).map(s => esc(s.id) + '＝' + esc(s.gender) + (s.role ? '·' + esc(s.role) : '')).join('、')}）</p><div class="space-y-1">${x.dialogue.map((l, i) => `<p class="text-sm"><span class="text-xs text-slate-400">${i}</span> <b>${esc(l.sp)}:</b> ${esc(l.t)}<span class="block text-xs text-slate-500">${esc(l.zh)}</span></p>`).join('')}</div>`;
  h += `<div class="mt-3">${gH(x.graphic)}</div>` + x.questions.map((q, qi) => reviewQH(x, q, qi, undefined, null)).join('');
  if (vocab) h += `<p class="mt-3 flex flex-wrap gap-1.5 items-center text-xs text-slate-500">單字：${vocab}</p>`;
  h += auPanelH(x);
  { const rs = reportsOf(x.id); h += `<div class="mt-5"><div class="flex items-center justify-between mb-2"><p class="text-xs font-bold">提報（${rs.length}）</p>${rpBtn(x.id)}</div>${rs.map(r => reportCardH(r)).join('')}</div>`; }
  const hs = hItems(x.id);
  if (hs.length) h += `<div class="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><p class="text-xs font-bold mb-1">此題健檢</p><ul class="text-xs space-y-0.5">${hs.map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`;
  return h;
}
const serial = (d, t) => { let mx = 0; RAW.forEach(x => { const m = x && x.id && /^d(\d)-(\d+)-([emh])$/.exec(x.id); if (m && 'd' + m[1] === d && m[3] === TS[t]) mx = Math.max(mx, +m[2]); }); return mx; };
const cefrOf = s => s <= 550 ? 'A2+' : s === 600 ? 'B1' : s === 650 ? 'B1+' : s <= 750 ? 'B2' : 'B2+';
const scoreList = t => { const r = []; for (let s = SCORE_RG[t][0]; s <= SCORE_RG[t][1]; s += 50) r.push(s); return r; };
/* 題型配置：把 n×3 個題位依「該格已有題數＋本批已分配數」由少到多輪流分給各題型；每組 3 題不重複；中級／高級每組保證含推論或意圖 */
function planQ(cq, ids, t, g) {
  const order = Object.keys(QT), ks = order.filter(k => g !== 'no' || k !== 'graphic'), used = {}, load = k => (cq[k] || 0) + (used[k] || 0);
  const take = (set, k) => { set.push(k); used[k] = (used[k] || 0) + 1; };
  return ids.map((id, si) => {
    const set = [];
    if (g === 'one' && si === 0) take(set, 'graphic');
    while (set.length < 3) take(set, ks.filter(k => !set.includes(k)).sort((a, b) => load(a) - load(b) || order.indexOf(a) - order.indexOf(b))[0]);
    if (t !== 'easy' && !set.some(k => k === 'infer' || k === 'intent')) {
      const k = ['infer', 'intent'].sort((a, b) => load(a) - load(b))[0], i = set.map((v, j) => v === 'graphic' ? -1 : j).filter(j => j >= 0).pop();
      used[set[i]]--; set[i] = k; used[k] = (used[k] || 0) + 1;
    }
    return { id, set: set.sort((a, b) => order.indexOf(a) - order.indexOf(b)) };
  });
}
function buildOut(d, t, f, n, g) {
  const mx = serial(d, t), ids = Array.from({ length: n }, (_, i) => d + '-' + String(mx + 1 + i).padStart(3, '0') + '-' + TS[t]), fname = 'p3_' + ids[0] + '_x' + n + '.json', sp = SPEC || {};
  const cq = {}; DATA.filter(x => domOf(x) === d && tierOf(x) === t).forEach(x => x.questions.forEach(q => { cq[q.qtype] = (cq[q.qtype] || 0) + 1; }));
  const lite = JSON.stringify({ domain: { [d]: sp.domains && sp.domains[d] }, tier: { [t]: sp.tiers && sp.tiers[t] }, qtypes: sp.qtypes, traps: sp.traps, entry_schema: sp.entry_schema, rules: sp.rules });
  const text = [`請為多益 Part 3 簡短對話寫 ${n} 組題目（每組一段對話＋3題），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part3.json。`, '',
    `- 主題：${domLabel(d)}（scene 須屬於：${((DOM[d] && DOM[d].scenes) || []).join('、')}）`,
    `- 難度：${TIER[t]}（id 尾碼 ${TS[t]}）｜level.score 只能填：${scoreList(t).map(s => s + '（cefr 填 ' + cefrOf(s) + '）').join('、')}${sp.tiers && sp.tiers[t] ? '｜' + sp.tiers[t].guide : ''}`,
    `- 形式：${f === '3p' ? '三人對話（form 填 3p，須有兩位同性別說話者）' : '兩人對話（form 填 2p）'}`,
    `- id 依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）`,
    `- 每組 3 題；題型請搭配（主旨／細節／推論／意圖／未來行動${g === 'no' ? '' : '／圖表'}），各組不要完全相同；${g === 'no' ? '本批不要出圖表題（graphic 填 null）' : g === 'one' ? '這批至少 1 組要含圖表題，圖表題須提供 graphic，且答案需結合圖表與對話' : '圖表題可有可無（沒有圖表題的組，graphic 填 null）；出圖表題時須提供 graphic，且答案需結合圖表與對話'}。`,
    `- 此主題＋難度已有的題型題數：${Object.keys(QT).map(k => k + '×' + (cq[k] || 0)).join('、')}，請優先補數量最少的題型。`,
    `- 建議題型配置（可小幅調整，但各組不要完全相同）：${planQ(cq, ids, t, g).map(p => p.id + '：' + p.set.map(k => QT[k] + '(' + k + ')').join('／')).join('；')}`,
    `- 每組對話 ${f === '3p' ? '10 句以上' : '6–8 句'}，每句英文 5–25 個單字；speakers 的 id ${f === '3p' ? '用 W1／W2／M 這類（兩位同性別）' : '用 W／M'}，role 用中文；level.why 用一句中文說明。`,
    '- 每題 4 選項、剛好 1 正解；錯誤選項須有明確依據可排除，並標 trap；每個選項都要附 zh（中文翻譯）；evidence 為對話句索引（從 0 起），依題號遞增。',
    `- 已用過的 vocab（不得重複）：${[...new Set(DATA.flatMap(x => (x.vocab || []).map(v => v.word)))].join('、') || '（無）'}`,
    `- 已用過的 tag（不得重複）：${DATA.map(x => x.tag).join('；') || '（無）'}`,
    `- 已有的對話首句（不要雷同）：${DATA.map(x => x.dialogue[0].t).join('；') || '（無）'}`,
    `- 輸出方式：建立檔案 ${fname}（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。`,
    '', '【規格：part3.json 的 _spec 精簡版】', lite].join('\n');
  return [{ title: '給 AI 的「寫題目」指令', note: `不需要上傳 part3.json（約 ${text.length.toLocaleString()} 字，已含規格、已用過的 tag／vocab 與既有對話首句）。AI 會一次寫 ${n} 組，直接給你 ${fname}。`, text },
    { title: '存檔與合併', note: `AI 會依指令建立 ${fname}（id ${ids[0]}${n > 1 ? '～' + ids[n - 1] : ''} 是網頁依目前最大流水號算的，已寫在指令裡）。下載後放到 json_merge.py 同一個資料夾，執行並選「Part 3 對話」；p3_ 開頭的檔案會自動列出並勾選，其他檔名請按「新增檔案…」。合併後重新整理本頁，題數就會更新。音檔放 audio/p3/ 後執行 audio_scan.py，再到該組題目頁複製錄音稿與檔名。` }];
}
function adminNewH() {
  const on = c => `${btn} !py-1.5 ${c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`;
  let h = hdr('新增題目', 'openAdmin()');
  h += `<h2 class="font-bold mb-2">1. 選主題</h2><div class="flex flex-wrap gap-2 mb-5">${Object.keys(DOM).map(k => `<button onclick="apick('nd','${k}')" class="${on(A.nd === k)}">${esc(domLabel(k))}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">2. 選難度</h2><div class="flex flex-wrap gap-2 mb-5">${Object.keys(TIER).map(k => `<button onclick="apick('nt','${k}')" class="${on(A.nt === k)}">${TIER[k]} ${TS[k]} <span class="text-xs opacity-70">${TSC[k]} · ${pool(k, A.nd).length} 組</span></button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">3. 選形式</h2><div class="flex flex-wrap gap-2 mb-5">${['2p', '3p'].map(k => `<button onclick="apick('nf','${k}')" class="${on(A.nf === k)}">${k === '3p' ? '三人' : '兩人'}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">4. 一次幾組</h2><div class="flex flex-wrap gap-2 mb-5">${[1, 2, 3].map(k => `<button onclick="apick('nn',${k})" class="${on(A.nn === k)}">${k} 組</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">5. 圖表題</h2><div class="flex flex-wrap gap-2 mb-5">${[['any', '不限（AI 決定）'], ['one', '至少 1 組含圖表題'], ['no', '不含圖表題']].map(([k, v]) => `<button onclick="apick('ng','${k}')" class="${on(A.ng === k)}">${v}</button>`).join('')}</div>`;
  const outs = buildOut(A.nd, A.nt, A.nf, A.nn, A.ng); A.out = outs.map(s => s.text || '');
  return h + outs.map((s, i) => `<div class="${card} p-4 mb-3"><div class="flex items-center justify-between gap-2 mb-1"><p class="font-bold text-sm">${i + 1}. ${esc(s.title)}</p>${s.text ? `<button id="cp${i}" onclick="copyOut(${i})" class="${btn} ${line} !py-1 text-xs shrink-0">複製</button>` : ''}</div><p class="text-xs text-slate-500 mb-2">${esc(s.note)}</p>${s.text ? `<pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(s.text)}</pre>` : ''}</div>`).join('');
}
function clip(t, bid) {
  const d = () => { const b = document.getElementById(bid); if (b) { b.dataset.l = b.dataset.l || b.textContent; b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = b.dataset.l || '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); d(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(d, fb); else fb();
}
const copyOut = i => clip(A.out[i] || '', 'cp' + i);

/* ---------- 提報：發現答案、解析、對話或音檔有瑕疵時記錄；存在 localStorage（PK.reports），管理員可彙整、編輯狀態、匯出／匯入（與 Part 1 相同；沒有圖片，所以「照片瑕疵」改為「對話／題目不自然」）---------- */
const RK = { answer: '答案／解析有誤', question: '對話／題目不自然', audio: '音檔問題', other: '其他' };
const RS = { open: '待處理', fixing: '處理中', fixed: '已修正', wontfix: '不處理' };
const RSC = { open: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300', fixing: '!bg-sky-100 !text-sky-700 dark:!bg-sky-950 dark:!text-sky-300', fixed: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-300', wontfix: '' };
const fmtT = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const reportsOf = id => R.reports.filter(r => r.qid === id).sort((a, b) => b.created - a.created);
const openRpN = id => R.reports.filter(r => (r.status === 'open' || r.status === 'fixing') && (!id || r.qid === id)).length;
const rpBtn = (qid, qn) => { const n = reportsOf(qid).length; return `<button onclick="openReport(this.dataset.q,+this.dataset.n)" data-q="${esc(qid)}" data-n="${qn || 0}" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">⚑ 提報${n ? ` (${n})` : ''}</button>`; };
function toast(m) { const d = document.createElement('div'); d.textContent = m; d.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
/* 提報當下的對話與三題選項快照：之後題庫改了，管理員仍看得到使用者當時看到的順序與作答 */
function snapOf(qid) {
  const x = find(qid); if (!x) return null;
  const r = V.run && V.run.sets.some(s => s.id === qid) ? V.run : null;
  return { lines: x.dialogue.map(l => l.sp + ': ' + l.t), qs: x.questions.map(q => {
    const k = qKey(x, q), order = (r && r.ord[k]) || q.choices.map((_, i) => i);
    const so = r && r.ans[k] !== undefined ? r.ans[k] : (R.qrec[k] && R.qrec[k].sel !== undefined ? R.qrec[k].sel : null);
    return { q: q.q.t, ch: order.map(i => q.choices[i].t), ok: order.findIndex(i => q.choices[i].ok), sel: so == null ? null : order.indexOf(so) };
  }) };
}
function openReport(qid, qn) { V.rp = { mode: 'new', qid, qn: qn || 0, kind: 'answer', note: '', reporter: R.reporter || '', snap: snapOf(qid), focus: true }; render(); }
function editReport(id) { const r = R.reports.find(q => q.id === id); if (!r) return; V.rp = Object.assign({ mode: 'edit', id, focus: true }, JSON.parse(JSON.stringify(r))); render(); }
function closeReport() { V.rp = null; render(); }
function saveReport() {
  const p = V.rp; if (!p) return;
  const g = i => { const e = document.getElementById(i); return e ? e.value : ''; };
  const note = g('rpn').trim(), kind = g('rpk') || 'other', reporter = g('rpr').trim(), qn = +g('rpq') || 0;
  if (!note) { toast('請簡單描述問題'); return; }
  const now = Date.now();
  if (p.mode === 'new') {
    R.reports.push({ id: 'r' + now.toString(36) + Math.random().toString(36).slice(2, 6), qid: p.qid, qn, kind, note, reporter, status: 'open', adminNote: '', created: now, updated: now, snap: p.snap || null });
    R.reporter = reporter; toast('已提報，謝謝！');
  } else {
    const r = R.reports.find(q => q.id === p.id); if (!r) return closeReport();
    Object.assign(r, { qn, kind, note, reporter, status: g('rps') || r.status, adminNote: g('rpa').trim(), updated: now }); toast('已更新');
  }
  saveR(); V.rp = null; render();
}
function setRs(id, st) { const r = R.reports.find(q => q.id === id); if (!r) return; r.status = st; r.updated = Date.now(); saveR(); render(); }
function delReport(id) { if (!confirm('確定刪除這筆提報？')) return; R.reports = R.reports.filter(q => q.id !== id); saveR(); render(); }
function setRf(k, v) { V[k] = V[k] === v ? null : v; render(); }
const snapH = sn => `<p class="mt-1">對話：</p><ul class="space-y-0.5">${sn.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` + sn.qs.map((q, qi) => `<p class="mt-1.5">Q${qi + 1}. ${esc(q.q)}</p><ul class="space-y-0.5">${q.ch.map((c, i) => `<li>${LT[i]}. ${esc(c)}${q.ok === i ? ' <b class="text-emerald-600">✓ 正解</b>' : ''}${q.sel === i ? ' <span class="text-rose-500">（使用者選）</span>' : ''}</li>`).join('')}</ul>`).join('');
function rpModalH() {
  const p = V.rp; if (!p) return '';
  const edit = p.mode === 'edit', x = find(p.qid), sn = p.snap;
  const hide = !!(V.run && V.run.mode === 'mock' && V.run.sets.some(s => s.id === p.qid && !s.questions.every(q => V.run.ans[qKey(s, q)] !== undefined))); // 測驗中還沒作答完：不顯示文字與正解
  const opt = (o, cur) => Object.keys(o).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${o[k]}</option>`).join('');
  const inp = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm';
  const qopt = [`<option value="0"${!p.qn ? ' selected' : ''}>整組對話</option>`].concat((x ? x.questions : []).map((q, i) => `<option value="${i + 1}"${p.qn === i + 1 ? ' selected' : ''}>第 ${i + 1} 題</option>`)).join('');
  return `<div class="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onclick="if(event.target===this)closeReport()"><div class="min-h-full flex items-end sm:items-center justify-center p-3">
    <div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">${edit ? '編輯提報' : '⚑ 提報問題'} · ${esc(p.qid)}</h2><button onclick="closeReport()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <label class="block text-xs text-slate-500 mb-1">問題出在</label><select id="rpq" class="${inp} mb-3">${qopt}</select>
    <label class="block text-xs text-slate-500 mb-1">問題類型</label><select id="rpk" class="${inp} mb-3">${opt(RK, p.kind)}</select>
    <label class="block text-xs text-slate-500 mb-1">描述問題（例如：B 選項其實也對、第 3 句念錯、中文翻譯不對…）</label><textarea id="rpn" rows="4" class="${inp} mb-3">${esc(p.note)}</textarea>
    <label class="block text-xs text-slate-500 mb-1">提報人（選填）</label><input id="rpr" value="${esc(p.reporter)}" class="${inp} mb-3" maxlength="30">
    ${edit ? `<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-xs text-slate-500 mb-1">處理狀態</label><select id="rps" class="${inp}">${opt(RS, p.status)}</select></div></div>
    <label class="block text-xs text-slate-500 mb-1">管理員備註（例如：已改第 2 題選項、已重做音檔）</label><textarea id="rpa" rows="2" class="${inp} mb-3">${esc(p.adminNote)}</textarea>` : ''}
    ${sn && !hide ? `<details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">提報當下的對話與選項</summary>${snapH(sn)}</details>` : ''}
    <div class="flex gap-2 justify-end"><button onclick="closeReport()" class="${btn} ${line}">取消</button><button onclick="saveReport()" class="${btn} ${pri}">${edit ? '儲存變更' : '送出提報'}</button></div></div></div></div>`;
}
function reportCardH(r) {
  const x = find(r.qid), sn = r.snap;
  return `<div class="${card} p-3 mb-3"><div class="min-w-0">
    <div class="flex flex-wrap items-center gap-1.5">${x ? idBtn(r.qid) : `<b class="text-sm">${esc(r.qid)}</b><span class="${chip}">題目已不存在</span>`}${r.qn ? `<span class="${chip}">第 ${r.qn} 題</span>` : ''}<span class="${chip}">${RK[r.kind] || esc(r.kind)}</span><span class="${chip} ${RSC[r.status] || ''}">${RS[r.status] || esc(r.status)}</span></div>
    <p class="text-sm mt-1.5 whitespace-pre-wrap break-words">${esc(r.note)}</p>
    <p class="text-xs text-slate-400 mt-1">${esc(r.reporter || '匿名')} · ${fmtT(r.created)}${r.updated > r.created ? ' · 更新 ' + fmtT(r.updated) : ''}</p>
    ${r.adminNote ? `<p class="text-xs mt-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 whitespace-pre-wrap break-words"><b>管理員：</b>${esc(r.adminNote)}</p>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mt-1.5"><summary class="cursor-pointer">當時的對話與選項</summary>${snapH(sn)}</details>` : ''}</div>
    <div class="flex flex-wrap gap-1.5 mt-2.5">${Object.keys(RS).map(k => `<button onclick="setRs('${r.id}','${k}')" class="text-xs rounded-lg px-2.5 py-1 cursor-pointer ${r.status === k ? 'bg-indigo-600 text-white' : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}">${RS[k]}</button>`).join('')}
    <button onclick="editReport('${r.id}')" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 cursor-pointer ml-auto">✎ 編輯</button><button onclick="delReport('${r.id}')" class="text-xs rounded-lg px-2.5 py-1 text-rose-500 hover:underline cursor-pointer">刪除</button></div></div>`;
}
function reportsH() {
  const all = R.reports.slice().sort((a, b) => b.created - a.created);
  const list = all.filter(r => (!V.rf || r.status === V.rf) && (!V.rkf || r.kind === V.rkf));
  const fb = (k, v, label, n) => `<button onclick="setRf('${k}','${v}')" class="${btn} !py-1.5 !px-3 text-xs ${V[k] === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label} <span class="opacity-70">${n}</span></button>`;
  let h = hdr('提報彙整', 'goHome()');
  h += `<div class="${card} p-4 mb-4"><div class="flex flex-wrap gap-2">${Object.keys(RS).map(k => fb('rf', k, RS[k], all.filter(r => r.status === k).length)).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-2">${Object.keys(RK).map(k => fb('rkf', k, RK[k], all.filter(r => r.kind === k).length)).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><button onclick="exportReports('json')" class="${btn} ${line} !py-1.5 text-xs">匯出 JSON</button><button onclick="exportReports('csv')" class="${btn} ${line} !py-1.5 text-xs">匯出 CSV（Excel）</button>
    <label class="${btn} ${line} !py-1.5 text-xs">匯入合併 JSON<input type="file" accept=".json,application/json" class="hidden" onchange="importReports(this)"></label></div>
    <p class="text-xs text-slate-400 mt-2">提報只存在各人瀏覽器的 localStorage。要彙整時，請使用者匯出 JSON 傳給管理員，管理員在這裡「匯入合併」（以提報編號去重，較新的版本優先）。</p></div>`;
  if (!list.length) return h + `<p class="text-sm text-slate-400 text-center py-10">${all.length ? '沒有符合篩選的提報。' : '目前沒有提報。作答時按「⚑ 提報」即可記錄。'}</p>`;
  return h + `<p class="text-xs text-slate-500 mb-2">共 ${list.length} 筆</p>` + list.map(r => reportCardH(r)).join('');
}
function download(name, text, mime) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportReports(fmt) {
  if (!R.reports.length) { toast('沒有可匯出的提報'); return; }
  const d = new Date(), p = n => String(n).padStart(2, '0'), stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  if (fmt === 'json') { download(`part3-reports-${stamp}.json`, JSON.stringify({ app: 'toeic-part3-reports', v: 1, exported: Date.now(), reports: R.reports }, null, 2), 'application/json'); return; }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['提報編號', '題組ID', '題號', '類型', '狀態', '描述', '提報人', '建立時間', '更新時間', '管理員備註', '對話', '該題問句', 'A', 'B', 'C', 'D', '正解', '使用者選'];
  const rows = R.reports.slice().sort((a, b) => a.created - b.created).map(r => { const s = r.snap, q = s && r.qn ? s.qs[r.qn - 1] : null;
    return [r.id, r.qid, r.qn ? '第 ' + r.qn + ' 題' : '整組', RK[r.kind] || r.kind, RS[r.status] || r.status, r.note, r.reporter, fmtT(r.created), fmtT(r.updated), r.adminNote, s ? s.lines.join(' / ') : '', q ? q.q : '',
      ...[0, 1, 2, 3].map(i => q && q.ch[i] != null ? q.ch[i] : ''), q && q.ok >= 0 ? LT[q.ok] : '', q && q.sel != null ? LT[q.sel] : ''].map(cell).join(','); });
  download(`part3-reports-${stamp}.csv`, '\ufeff' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
}
function importReports(input) {
  const f = input.files[0]; if (!f) return; const fr = new FileReader();
  fr.onload = () => {
    try {
      const j = JSON.parse(fr.result), arr = Array.isArray(j) ? j : j && j.reports;
      if (!Array.isArray(arr)) throw new Error('找不到 reports 陣列');
      let add = 0, upd = 0;
      arr.forEach(r => {
        if (!r || typeof r.id !== 'string' || typeof r.qid !== 'string') return;
        const n = { id: r.id, qid: r.qid, qn: +r.qn || 0, kind: RK[r.kind] ? r.kind : 'other', note: String(r.note || ''), reporter: String(r.reporter || ''), status: RS[r.status] ? r.status : 'open', adminNote: String(r.adminNote || ''), created: +r.created || Date.now(), updated: +r.updated || +r.created || Date.now(), snap: r.snap || null };
        const o = R.reports.find(q => q.id === n.id);
        if (!o) { R.reports.push(n); add++; } else if (n.updated > o.updated) { Object.assign(o, n); upd++; }
      });
      saveR(); toast(`匯入完成：新增 ${add}、更新 ${upd}`); render();
    } catch (e) { alert('匯入失敗：' + e.message); }
  };
  fr.readAsText(f, 'utf-8'); input.value = '';
}

function render() {
  document.documentElement.classList.toggle('dark', !!S.dark);
  const v = V.view;
  const body = v === 'run' ? runH() : v === 'result' ? resultH() : v === 'book' ? bookH() : v === 'practice' ? practiceH() : v === 'test' ? testH() : v === 'admin' ? adminH() : v === 'adminCell' ? adminCellH() : v === 'adminItem' ? adminItemH() : v === 'adminNew' ? adminNewH() : v === 'reports' ? reportsH() : homeH();
  main.innerHTML = body + rpModalH();
  if (V.rp && V.rp.focus) { V.rp.focus = false; const t = document.getElementById('rpn'); if (t) t.focus(); }
}

/* ---------- 啟動：讀取 part3.json；雙擊開啟（file://）時改用手動選取 ---------- */
function backAdmin() { if (window._ah) location.href = 'index.html#mt'; else goHome(); } // 從首頁「維護總覽」進來的，返回就回總覽
function loadText(t) {
  try {
    const j = JSON.parse(t), d = j && j._spec && j._spec.domains; SPEC = (j && j._spec) || null;
    if (d && typeof d === 'object') { const m = {}; Object.keys(d).forEach(k => { if (d[k] && d[k].name) m[k] = { n: d[k].name, scenes: d[k].scenes || [] }; }); if (Object.keys(m).length) DOM = m; }
    RAW = itemsOf(j); DATA = RAW.map(normItem).filter(Boolean); HEALTH = auditAll(RAW); render();
    if (location.hash === '#admin' && !window._ah) { window._ah = 1; openAdmin(); } // 從首頁「維護總覽」直接進入維護頁
  } catch (e) { alert('part3.json 格式有誤：' + e.message); }
}
function pickJson(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8'); }
async function boot() {
  await auLoad();
  try { const res = await fetch('part3.json', { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status); loadText(await res.text()); }
  catch (e) { main.innerHTML = `<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 part3.json</h3><p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取。請選擇同資料夾的 part3.json；上傳到 GitHub Pages 或用本機伺服器開啟則會自動載入。</p><label class="${btn} inline-block ${pri}">選取 part3.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`; }
}
boot();
