/* Part 5 句子填空：首頁分「練習」與「測驗」＋錯題本／提報／維護；版型與操作以 Part 1 為準（見 PART_UI_GUIDE.md）。
   題庫 part5.json（一題＝一個句子＋1 正解＋11 干擾項）。記錄存在 toeicPart5V1（rec／saved／rot／stat／tests／reports），KEY 只讀寫 dark。
   選項：每次作答「正解＋從 11 個干擾項抽 3 個」共 4 個再洗牌（bag 輪替、至少 1 個 near、wordform 優先同字根、正解位置不與上次相同）。
   音訊：audio/index.json 的 p5.complete 有此題 → 播 audio/p5/{id}.mp3；否則用瀏覽器 TTS（依 voice 選男女聲）。自成一體，不依賴 audio.js。
   練習：依難度／主題／考點隨機抽題，不計分；作答後立即看解析。測驗：隨機抽 TESTN 題，按選項立刻跳下一題，不顯示對錯，完成後一次檢討。
   無圖片：維護頁沒有缺圖檢查；矩陣＝難度 × 主題，達標＝每格 ≥ TARGET 題。 */
const KEY = 'toeicCoachV2', PK = 'toeicPart5V1';
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
let R = { rec: {}, saved: {}, rot: {}, stat: {}, tests: {}, reports: [] };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
['rec', 'saved', 'rot', 'stat', 'tests'].forEach(k => { if (!R[k] || typeof R[k] !== 'object' || Array.isArray(R[k])) R[k] = {}; });
if (!Array.isArray(R.reports)) R.reports = [];
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };
let DATA = [], RAW = [], SPEC = null;
const BLANK = '_____', TESTN = 6, TARGET = 2, TESTSEC = 22, WARN = 30, L = 'ABCD';
const TIER = { easy: '初級', medium: '中級', hard: '高級' }, TS = { easy: 'e', medium: 'm', hard: 'h' }, SUG = { easy: '10–15 秒', medium: '15–25 秒', hard: '20–30 秒' };
const SC = { easy: [500, 550], medium: [600, 650], hard: [700, 800] }, cefr = s => s <= 550 ? 'A2+' : s === 600 ? 'B1' : s === 650 ? 'B1+' : s <= 750 ? 'B2' : 'B2+';
const tScore = k => (SPEC && SPEC.tiers && SPEC.tiers[k] && SPEC.tiers[k].score) || SC[k].join('–');
const tierHint = () => Object.keys(TIER).map(k => `${TIER[k]} ${tScore(k)}`).join('；') + '（多益預估分數）';
const PT = { wordform: ['grammar', '詞性', [25, 30]], tense: ['grammar', '時態', [8, 10]], voice: ['grammar', '語態', [6, 8]], agree: ['grammar', '主詞動詞一致', [5, 5]], verbform: ['grammar', '不定詞／動名詞／分詞', [6, 8]], conj: ['grammar', '連接詞 vs 介系詞', [7, 9]], prep: ['grammar', '介系詞', [5, 7]], pronoun: ['grammar', '代名詞／所有格', [4, 5]], relative: ['grammar', '關係詞', [3, 4]], compare: ['grammar', '比較級／最高級', [2, 3]], quant: ['grammar', '數量詞／限定詞', [2, 3]], vmeaning: ['vocab', '語意辨析', [15, 20]], vcolloc: ['vocab', '搭配詞', [10, 12]], vconfuse: ['vocab', '易混淆字', [5, 8]] };
const TR = { pos: '詞性不符', tense: '時態不符', voice: '語態不符', agree: '一致性錯誤', form: '動詞形式錯誤', case: '代名詞格／限定詞錯誤', structure: '連接詞與介系詞結構不符', logic: '邏輯關係不符', confusable: '形似音近', collocation: '搭配錯誤', meaning: '語意不符' };
let DOM = { d1: '辦公室', d2: '餐廳飲食', d3: '商店購物', d4: '街道與交通', d5: '工地與倉庫', d6: '旅館與居家', d7: '戶外與公園' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick1 = a => a[Math.floor(Math.random() * a.length)];
const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');
/* fd 難度、fm 主題、fp 考點、pn 題數 → 練習篩選；tt 難度、tm 主題、tp 考點 → 測驗篩選 */
let V = { rp: null, rf: null, rkf: null, view: 'home', pn: 6, fd: null, fm: null, fp: null, tt: null, tm: null, tp: null, run: null };

const filled = x => x.sentence.t.replace(BLANK, () => x.answer.t);
const sayText = x => x.say || filled(x);
const tier = x => (x.level && x.level.tier) || 'medium';
const find = id => DATA.find(x => x.id === id);
const okItem = x => !!(x && x.id && x.sentence && typeof x.sentence.t === 'string' && x.sentence.t.split(BLANK).length === 2 && x.answer && x.answer.t && Array.isArray(x.distractors) && x.distractors.length >= 3 && x.distractors.every(d => d && d.t));
const pool = (t, m, p) => DATA.filter(x => (!t || tier(x) === t) && (!m || x.domain === m) && (!p || x.point === p));
const ptName = k => (PT[k] && PT[k][1]) || k;
const domLabel = k => DOM[k] ? k.toUpperCase() + ' ' + DOM[k] : '';

/* ---------- 選項輪替（核心）：回傳 {shown:[選項索引（0=正解，j+1=第 j 個干擾項）], pos:正解位置} ---------- */
function deal(x) {
  const D = x.distractors, low = s => String(s).trim().toLowerCase();
  const seen = new Set([low(x.answer.t)]), ok = [];
  D.forEach((d, i) => { const k = low(d.t); if (!seen.has(k)) { seen.add(k); ok.push(i); } });   // 文字與正解或前面干擾項重複者不用
  const near = i => D[i].near === true, root = i => D[i].fam === 'root';
  let r = R.rot[x.id]; if (!r || typeof r !== 'object') r = R.rot[x.id] = { bag: [], last: -1 };
  let bag = (Array.isArray(r.bag) ? r.bag : []).filter((v, k, a) => ok.indexOf(v) >= 0 && a.indexOf(v) === k);
  const take = [];
  if (bag.length < 3) { take.push(...bag); bag = shuf(ok.filter(i => !take.includes(i))); }   // 不足 3 個：先取剩下的，再把其餘重新洗牌補進 bag
  while (take.length < 3 && bag.length) take.push(bag.shift());
  const rootsAll = ok.filter(root), need = x.point === 'wordform' ? Math.min(2, rootsAll.length) : 0, rc = () => take.filter(root).length;
  const swapIn = (cand, out) => { take[take.indexOf(out)] = cand; const b = bag.indexOf(cand); if (b >= 0) bag.splice(b, 1); if (bag.indexOf(out) < 0) bag.unshift(out); };
  while (rc() < need) {   // 詞性題成套：至少 2 個同字根
    const out = take.find(i => !root(i)); if (out === undefined) break;
    const pl = ok.filter(i => root(i) && !take.includes(i)); if (!pl.length) break;
    const inbag = bag.find(i => pl.includes(i)); swapIn(inbag !== undefined ? inbag : pick1(pl), out);
  }
  if (!take.some(near)) {   // 至少 1 個 near
    const cands = ok.filter(i => near(i) && !take.includes(i));
    if (cands.length) {
      const fs = [c => bag.includes(c) && (!need || root(c)), c => !need || root(c), c => bag.includes(c), () => true];
      let cand; for (const f of fs) { const l = cands.filter(f); if (l.length) { cand = pick1(l); break; } }
      const outs = take.filter(o => rc() - (root(o) ? 1 : 0) + (root(cand) ? 1 : 0) >= need);
      swapIn(cand, pick1(outs.length ? outs : take));
    }
  }
  const m = take.length + 1; let pos, tries = 0;   // 正解位置：隨機，且不與上次相同
  do { pos = Math.floor(Math.random() * m); tries++; } while (pos === r.last && tries <= 5);
  if (pos === r.last && m > 1) pos = (r.last + 1 + Math.floor(Math.random() * (m - 1))) % m;
  const rest = shuf(take), shown = []; let q = 0;
  for (let j = 0; j < m; j++) shown.push(j === pos ? 0 : rest[q++] + 1);
  r.bag = bag; r.last = pos;
  const st = R.stat[x.id] || (R.stat[x.id] = { shown: [], picked: [] });
  for (let k = 0; k <= D.length; k++) { st.shown[k] = st.shown[k] || 0; st.picked[k] = st.picked[k] || 0; }
  shown.forEach(k => { st.shown[k]++; });
  saveR(); return { shown, pos };
}
const optOf = (x, k) => k === 0 ? { k, t: x.answer.t, zh: x.answer.zh, pos: x.answer.pos, ok: true, why: x.answer.why } : (d => ({ k, t: d.t, zh: d.zh, pos: d.pos, ok: false, trap: d.trap, near: d.near, why: d.why }))(x.distractors[k - 1]);
const okShown = (x, sh) => Array.isArray(sh) && sh.length >= 2 && sh.length <= 4 && sh.every(k => Number.isInteger(k) && k >= 0 && k <= x.distractors.length) && sh.filter(k => k === 0).length === 1 && new Set(sh).size === sh.length;
const defShown = x => [0, 1, 2, 3].filter(k => k <= x.distractors.length);   // 沒有存下當時選項時（舊紀錄）的預設
const vw = (x, sh) => { sh = okShown(x, sh) ? sh : defShown(x); return { sh, o: sh.map(k => optOf(x, k)), ans: sh.indexOf(0) }; };

/* ---------- 音訊（自成一體）：同一個 Audio 元素、點擊啟動、切題或離開一定停止 ---------- */
const AU = new Set(), P = { tok: 0, a: new Audio(), vs: [], rate: 1, rounds: 3, on: false, cur: null, fr: null, w: null };
async function auLoad() { AU.clear(); try { const j = await (await fetch('audio/index.json', { cache: 'no-store' })).json(); ((j.p5 && j.p5.complete) || []).forEach(i => AU.add(i)); } catch (e) {} }
const hasTTS = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const VBAD = /novelty|fred|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
const vsc = v => { const n = v.name + ' ' + v.voiceURI; let s = 0; if (/premium|enhanced|增強|高品質|進階|natural|online/i.test(n)) s += 10; if (/google/i.test(n)) s += 5; if (/^en[-_]US$/i.test(v.lang)) s += 3; if (/^en[-_](IN|ZA|IE|SG|PH)$/i.test(v.lang)) s -= 5; if (VBAD.test(v.name)) s -= 50; return s; };
const isTZ = v => !!v && /\b(Tom|Zoe)\b/i.test(v.name);
if (hasTTS()) { const g = () => { try { P.vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => vsc(b) - vsc(a)); } catch (e) {} }; g(); try { speechSynthesis.addEventListener('voiceschanged', g); } catch (e) {} }
const voiceFor = g => { const us = P.vs.filter(v => /^en[-_]US$/i.test(v.lang)); return g === 'F' ? (us.find(v => /\bZoe\b/i.test(v.name)) || P.vs.find(v => /female|samantha|zira|karen|susan|hazel|jenny|aria|victoria/i.test(v.name))) : (us.find(v => /\bTom\b/i.test(v.name)) || P.vs.find(v => /david|james|daniel|alex|fred|mark|george|guy|ryan|\bmale/i.test(v.name) && !/female/i.test(v.name))); };
function stop() {
  P.tok++; if (P.w) { clearInterval(P.w); P.w = null; }
  try { P.a.onended = null; P.a.onerror = null; P.a.pause(); } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
  P.on = false; P.fr = null; P.cur = null; paintAudio();
}
function speakOnce(x, rate, tok, done) {
  let fin = false; const end = () => { if (fin) return; fin = true; if (tok === P.tok) done(); };
  if (AU.has(x.id)) {
    const a = P.a; a.onended = end; a.onerror = end; a.src = 'audio/p5/' + x.id + '.mp3';
    try { a.defaultPlaybackRate = rate; a.playbackRate = rate; a.preservesPitch = true; a.webkitPreservesPitch = true; a.mozPreservesPitch = true; } catch (e) {}
    try { const pr = a.play(); if (pr && pr.catch) pr.catch(end); } catch (e) { end(); }
    return;
  }
  if (!hasTTS()) return end();
  const u = new SpeechSynthesisUtterance(sayText(x)), g = x.voice === 'M' ? 'M' : 'F';
  const v = voiceFor(g) || P.vs[0]; u.lang = v ? v.lang : 'en-US'; if (v) u.voice = v;
  u.pitch = isTZ(v) ? 1 : (g === 'F' ? 1.2 : 0.8); u.rate = Math.max(.5, Math.min(2, .95 * rate)); u.onend = end; u.onerror = end;
  try { speechSynthesis.speak(u); } catch (e) { end(); }
}
function playSent(id) {
  const x = find(id); if (!x) return; stop(); const tok = P.tok; P.on = true; P.cur = id; if (V.run) V.run.played[id] = 1; paintAudio();
  speakOnce(x, P.rate, tok, () => { if (tok === P.tok) { P.on = false; P.cur = null; paintAudio(); } });
}
function follow(id, n) {   // 跟讀：播放 → 靜音等待（句長×1.5）→ 再播，共 n 輪
  const x = find(id); if (!x) return; stop(); const tok = P.tok, rate = P.rate;
  const F = P.fr = { n, round: 1, phase: 'play', left: 0 }; P.on = true; P.cur = id;
  const round = () => {
    if (tok !== P.tok) return; F.phase = 'play'; paintAudio(); const t0 = Date.now();
    speakOnce(x, rate, tok, () => {
      const wait = Math.max(1000, (Date.now() - t0) * 1.5), endAt = Date.now() + wait; F.phase = 'wait'; F.left = Math.ceil(wait / 1000); paintAudio();
      P.w = setInterval(() => {
        if (tok !== P.tok) { clearInterval(P.w); P.w = null; return; }
        const l = endAt - Date.now();
        if (l <= 0) { clearInterval(P.w); P.w = null; if (F.round < F.n) { F.round++; round(); } else { P.on = false; P.fr = null; P.cur = null; paintAudio(); } }
        else { F.left = Math.ceil(l / 1000); paintAudio(); }
      }, 200);
    });
  };
  round();
}
function speakWord(w) {   // 單字發音只用機器發音
  stop(); if (!hasTTS()) return;
  try { const u = new SpeechSynthesisUtterance(w); const v = voiceFor('F') || P.vs[0]; u.lang = v ? v.lang : 'en-US'; u.rate = .9; if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) {}
}
const togglePlay = id => { if (P.on && !P.fr && P.cur === id) stop(); else playSent(id); };
const toggleFollow = id => { if (P.fr && P.cur === id) stop(); else follow(id, P.rounds); };
function setRate(v) { P.rate = v; try { P.a.playbackRate = v; } catch (e) {} render(); }
const setRounds = n => { P.rounds = n; render(); };
function paintAudio() {
  document.querySelectorAll('[data-play]').forEach(b => { const id = b.dataset.play, o = P.on && !P.fr && P.cur === id; b.textContent = o ? '⏹ 停止' : (b.dataset.lbl === 'run' ? (V.run && V.run.played[id] ? '🔁 重播' : '🔊 播放') : (b.dataset.lbl || '▶ 播放整句')); });
  document.querySelectorAll('[data-follow]').forEach(b => { b.textContent = P.fr && P.cur === b.dataset.follow ? '⏹ 停止跟讀' : '🔁 開始跟讀'; });
  document.querySelectorAll('[data-sid]').forEach(e => e.classList.toggle('active', P.on && P.cur === e.dataset.sid));
  document.querySelectorAll('[data-fr]').forEach(e => { const f = P.fr; e.textContent = f && P.cur === e.dataset.fr ? `第 ${f.round}/${f.n} 輪｜${f.phase === 'play' ? '播放中…' : '換你跟讀 ' + f.left + ' 秒'}` : ''; });
}
window.addEventListener('pagehide', () => { try { stop(); } catch (e) {} });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

/* ---------- 計時（只提示，不強制） ---------- */
const T = { id: null };
function clrT() { if (T.id) { clearInterval(T.id); T.id = null; } }
function clockInfo() {
  const r = V.run, x = r && find(r.ids[r.i]); if (!x) return ['', ''];
  if (r.mode === 'mock') {
    const left = r.limit - Math.floor((Date.now() - r.t0) / 1000), a = Math.abs(left), f = `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
    return left < 0 ? ['時間到 +' + f + '（僅提示，可繼續作答）', 'text-rose-600 dark:text-rose-400 font-bold'] : ['剩餘 ' + f, left < 60 ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-400'];
  }
  if (r.sel[x.id] !== undefined) { const s = Math.round(r.secs[x.id] || 0); return ['用時 ' + s + ' 秒' + (s > WARN ? '（超過 30 秒）' : ''), s > WARN ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400']; }
  const s = Math.floor((Date.now() - r.cur) / 1000);
  return [s + ' 秒・建議 ' + SUG[tier(x)] + (s > WARN ? '（已超過 30 秒，先猜後跳）' : ''), s > WARN ? 'text-rose-600 dark:text-rose-400 font-bold' : s > 20 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'];
}
function tickClock() { const e = document.getElementById('tm'); if (!e || V.view !== 'run') return; const [t, c] = clockInfo(); e.textContent = t; e.className = 'text-xs ' + c; }
function startClock() { clrT(); T.id = setInterval(tickClock, 1000); }

/* ---------- 作答流程 ---------- */
const cx = () => V.run && find(V.run.ids[V.run.i]);
const dealOf = (r, x) => r.deal[x.id] || (r.deal[x.id] = deal(x));
function startRun(ids, mode, key, cfg) {
  if (!ids.length) return;
  stop(); V.run = { ids, mode, key, cfg, i: 0, sel: {}, deal: {}, secs: {}, played: {}, t0: Date.now(), cur: Date.now(), limit: ids.length * TESTSEC };
  V.view = 'run'; render(); window.scrollTo({ top: 0 });
}
const matches = () => pool(V.fd, V.fm, V.fp);
function startPractice() { const l = shuf(matches().map(x => x.id)); startRun(V.pn ? l.slice(0, V.pn) : l, 'practice', 'practice'); }
const tcKey = () => (V.tt || 'all') + '|' + (V.tm || 'all') + '|' + (V.tp || 'all');
function startTest() { startRun(shuf(pool(V.tt, V.tm, V.tp).map(x => x.id)).slice(0, TESTN), 'mock', 'test', tcKey()); }
function record(x, d, j, secs) {
  const k = d.shown[j], ok = k === 0, trap = k > 0 ? (x.distractors[k - 1].trap || '') : '';
  R.rec[x.id] = { ok, t: Date.now(), sel: j, shown: d.shown.slice(), trap, secs: Math.round(secs * 10) / 10 };
  if (!ok) R.saved[x.id] = 1; else delete R.saved[x.id];   // 答錯加入錯題本；之後在任何作答畫面答對同一題就自動移出
  const st = R.stat[x.id] || (R.stat[x.id] = { shown: [], picked: [] }); st.picked[k] = (st.picked[k] || 0) + 1;
  saveR();
}
function pick(j) {
  const r = V.run, x = cx(); if (r.sel[x.id] !== undefined) return;
  const d = dealOf(r, x); r.sel[x.id] = j; r.secs[x.id] = (Date.now() - r.cur) / 1000; record(x, d, j, r.secs[x.id]);
  if (r.mode === 'mock') nextQ(); else { const y = scrollY; render(); scrollTo(0, y); }
}
const score = () => V.run.ids.filter(id => { const d = V.run.deal[id], s = V.run.sel[id]; return d && s !== undefined && d.shown[s] === 0; }).length;
function nextQ() {
  const r = V.run; stop();
  if (r.i + 1 < r.ids.length) { r.i++; r.cur = Date.now(); render(); window.scrollTo({ top: 0 }); return; }
  const sc = score(), n = r.ids.length;
  if (r.key === 'test') { const o = R.tests[r.cfg] || {}, pct = Math.round(sc / n * 100); R.tests[r.cfg] = { best: Math.max(o.best || 0, pct), last: pct, n }; saveR(); }
  V.view = 'result'; render(); window.scrollTo({ top: 0 });
}
function go(view) { stop(); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const goHome = () => go('home');
const goBack = () => go(V.run && V.run.key === 'test' ? 'test' : V.run && V.run.key === 'book' ? 'book' : 'practice');
function quit() { if (V.run.mode === 'mock' && Object.keys(V.run.sel).length && !confirm('離開後這次測驗不會計分，確定離開？')) return; goBack(); }
const openBook = () => go('book'), openPractice = () => go('practice'), openTest = () => go('test');
function unsave(id) { delete R.saved[id]; saveR(); render(); }
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }
function toggleDark() {
  S.dark = !S.dark;
  try { const c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  render();
}

/* ---------- 畫面 ---------- */
function hdr(title, back) {
  const b = back ? `<button onclick="${back}" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>` : `<a href="index.html" class="${btn} ${line} !py-1.5 shrink-0" aria-label="回到首頁">⌂</a>`;
  return `<header class="flex items-center justify-between gap-2 mb-5"><div class="flex items-center gap-2 min-w-0">${b}<h1 class="text-lg md:text-2xl font-bold truncate">${esc(title)}</h1></div>
    <button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button></header>`;
}
function fbtn(k, v, label, n) {
  const on = (V[k] || null) === v;
  return `<button onclick="setF('${k}',${v ? `'${v}'` : 'null'})" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${n === 0 ? ' opacity-40' : ''}">${label}${n == null ? '' : ` <span class="text-xs opacity-70">${n}</span>`}</button>`;
}
const blankH = '<span class="inline-block align-baseline border-b-2 border-slate-500 dark:border-slate-400 mx-1" style="min-width:5.5rem">&nbsp;</span>';
const sentH = (x, fill) => { const p = x.sentence.t.split(BLANK); return esc(p[0]) + (fill ? `<mark class="rounded px-1 bg-emerald-200 dark:bg-emerald-800 text-inherit">${esc(x.answer.t)}</mark>` : blankH) + esc(p[1]); };
const ptChip = x => `<span class="${chip}">${x.kind === 'vocab' ? '單字' : '文法'}・${esc(ptName(x.point))}</span>`;
function metaH(x) {
  const sc = x.level && x.level.score, m = x.domain;
  return `<div class="flex flex-wrap gap-1.5 mt-4"><span class="${chip}">${TIER[tier(x)]}${sc ? ' · ' + sc : ''}</span>${m && DOM[m] ? `<span class="${chip}">${esc(domLabel(m))}</span>` : ''}${ptChip(x)}</div>`;
}
function revealH(x, sel, sh) {
  const v = vw(x, sh);
  return metaH(x) + `<div class="space-y-2 mt-3">${v.o.map((o, i) => {
    const good = o.ok, bad = i === sel && !good, t = TR[o.trap] || '';
    const c = good ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : bad ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50' : 'border-slate-200 dark:border-slate-800';
    return `<div class="rounded-lg border px-3 py-2 text-sm ${c}"><div class="flex justify-between gap-2"><span><b>${L[i]}.</b> ${esc(o.t)}</span>
      <span class="text-xs shrink-0 ${good ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${good ? '✓ 正解' : (bad ? '✗ 你選的 · ' : '') + esc(t)}</span></div>
      <p class="text-xs text-slate-500 mt-0.5">${esc(o.zh || '')} ${esc(o.pos || '')}</p><p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc(o.why)}</p></div>`;
  }).join('')}</div>`;
}
function explainH(x) {
  const cl = x.clue;
  return `<div class="${card} p-4 mt-3"><p class="text-sm font-bold mb-1">解析</p><p class="text-sm">${esc(x.sentence.zh || '')}</p>
  ${cl ? `<p class="text-xs text-slate-500 mt-2">線索：<b>${esc(cl.text || '')}</b></p><ol class="text-sm list-decimal pl-5 mt-1">${(cl.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
  ${(x.vocab || []).length ? `<div class="flex flex-wrap gap-2 mt-3">${x.vocab.map(w => `<button data-w="${esc(w.word)}" onclick="speakWord(this.dataset.w)" class="${btn} ${line} !py-1.5 text-left">🔊 <b>${esc(w.word)}</b> <span class="text-xs text-slate-500">${esc(w.ipa || '')} ${esc(w.pos || '')}</span><span class="block text-xs text-slate-500">${esc(w.zh || '')}・${esc(w.col || '')}</span></button>`).join('')}</div>` : ''}</div>`;
}
function bankH(x, d) {
  const all = [0, ...x.distractors.map((_, i) => i + 1)];
  return `<details class="${card} p-3 mt-3"><summary class="cursor-pointer text-sm font-bold">看完整選項庫（${all.length} 個）</summary><div class="mt-2 space-y-1.5">${all.map(k => {
    const o = optOf(x, k), was = d && d.shown.includes(k);
    return `<div class="rounded-lg border px-3 py-1.5 text-sm ${o.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-800'}"><b>${esc(o.t)}</b> <span class="text-xs text-slate-500">${esc(o.zh || '')} ${esc(o.pos || '')}</span>${d ? `<span class="text-xs ml-1 ${was ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}">${was ? '本次出現' : '本次沒抽到'}</span>` : ''}${o.near ? '<span class="text-xs ml-1 text-amber-600">near</span>' : ''}<span class="block text-xs ${o.ok ? 'text-emerald-600' : 'text-slate-500'}">${o.ok ? '✓ 正解' : esc(TR[o.trap] || o.trap || '')}：${esc(o.why)}</span></div>`;
  }).join('')}</div></details>`;
}
function audioH(x) {   // 整句音檔＋速度＋跟讀（練習作答後）
  const rt = [0.75, 1, 1.25], has = AU.has(x.id), id = esc(x.id);
  return `<div class="${card} p-3 mt-3"><p class="text-sm font-bold mb-1">🎧 整句音檔 <span class="text-xs font-normal text-slate-500">${has ? '錄音檔' : '機器發音'}</span></p>
  <p class="tsent px-2 py-1.5 text-base" data-sid="${id}" data-id="${id}" onclick="togglePlay(this.dataset.id)">${sentH(x, true)}</p><p class="text-xs text-slate-500 px-2 mb-2">${esc(x.sentence.zh || '')}</p>
  <div class="flex flex-wrap items-center gap-2 mb-2"><button data-play="${id}" onclick="togglePlay(this.dataset.play)" class="${btn} ${pri} !py-1.5">▶ 播放整句</button>${rt.map(v => `<button onclick="setRate(${v})" class="${btn} !py-1.5 ${P.rate === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${v}×</button>`).join('')}</div>
  <div class="flex flex-wrap items-center gap-2"><button data-follow="${id}" onclick="toggleFollow(this.dataset.follow)" class="${btn} ${line} !py-1.5">🔁 開始跟讀</button><span class="text-xs text-slate-500">輪數</span>${[1, 3, 5].map(n => `<button onclick="setRounds(${n})" class="${btn} !py-1.5 ${P.rounds === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${n}</button>`).join('')}<span data-fr="${id}" class="text-sm text-indigo-600 dark:text-indigo-400"></span></div>
  ${!has && !hasTTS() ? '<p class="text-xs text-rose-600 mt-2">這個瀏覽器沒有機器發音，也還沒有音檔。</p>' : ''}</div>`;
}
function runH() {
  const r = V.run, x = cx(), n = r.ids.length, sel = r.sel[x.id], ans = sel !== undefined, mock = r.mode === 'mock', d = dealOf(r, x), [ct, cc] = clockInfo();
  let h = hdr(`${mock ? '測驗' : '練習'} · ${r.i + 1} / ${n}`, 'quit()');
  h += `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-4"><div class="h-1.5 rounded bg-indigo-600" style="width:${(r.i + (ans ? 1 : 0)) / n * 100}%"></div></div>`;
  h += `<div class="${card} p-5"><p class="text-lg leading-relaxed">${sentH(x, ans && !mock)}</p></div>`;
  const nextBtn = ans && !mock ? `<button onclick="nextQ()" class="${btn} ${pri}">${r.i + 1 < n ? '下一題 →' : '完成，看結果'}</button>` : ''; // 作答後才出現，緊接播放鈕右側；Part 5 換題不自動播放
  h += `<div class="flex items-center gap-3 my-4 flex-wrap">${mock ? '' : `<button data-play="${esc(x.id)}" data-lbl="run" onclick="togglePlay(this.dataset.play)" class="${btn} ${ans ? line : pri}">${P.on && !P.fr && P.cur === x.id ? '⏹ 停止' : (r.played[x.id] ? '🔁 重播' : '🔊 播放')}</button>`}${nextBtn}<span id="tm" class="text-xs ${cc}">${esc(ct)}</span><span class="ml-auto">${rpBtn(x.id)}</span></div>`;
  if (!ans) h += `<p class="text-xs text-slate-500 mb-2">選出最適合填入空格的選項${mock ? '（作答中不顯示對錯，選完直接下一題）' : '（播放會念出完整句子，含答案）'}</p>`;
  h += `<div class="grid grid-cols-2 gap-2">${d.shown.map((k, i) => {
    let c = 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800';
    if (ans) c = i === d.pos ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : i === sel ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400' : 'opacity-40 border-slate-200 dark:border-slate-800';
    return `<button ${ans ? 'disabled' : `onclick="pick(${i})"`} class="rounded-lg border px-3 py-3 text-base font-bold cursor-pointer text-left ${c}"><span class="mr-1">${L[i]}.</span>${esc(optOf(x, k).t)}</button>`;
  }).join('')}</div>`;
  if (ans) h += revealH(x, sel, d.shown) + explainH(x) + bankH(x, d) + audioH(x);
  return h;
}
function resultH() {
  const r = V.run, n = r.ids.length, sc = score(), test = r.key === 'test', prac = r.key === 'practice', book = r.key === 'book';
  let h = hdr('作答結果', 'goBack()');
  let sub = test ? '測驗成績' : '練習結果（不計入成績）';
  if (test) { const [t, m, p] = r.cfg.split('|'); sub += ` · ${TIER[t] || '不限難度'} · ${DOM[m] ? domLabel(m) : '不限主題'} · ${PT[p] ? ptName(p) : '不限考點'}`; }
  const secs = r.ids.map(id => r.secs[id] || 0), avg = Math.round(secs.reduce((a, b) => a + b, 0) / n * 10) / 10, over = secs.filter(s => s > WARN).length;
  h += `<div class="${card} p-5 text-center mb-5"><p class="text-sm text-slate-500">${esc(sub)}</p>
    <p class="text-4xl font-bold mt-1 ${sc / n >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}">${sc} / ${n}</p>
    <p class="text-xs text-slate-500 mt-2">平均每題 ${avg} 秒${over ? `・超過 30 秒 ${over} 題` : ''}</p>
    <div class="flex gap-2 justify-center mt-4"><button onclick="goBack()" class="${btn} ${line}">${test ? '回測驗選單' : book ? '回錯題本' : '回練習選單'}</button>
    ${test ? `<button onclick="startTest()" class="${btn} ${pri}">再測一次（重新抽題）</button>` : prac ? `<button onclick="startPractice()" class="${btn} ${pri}">再練一次（重新抽題）</button>` : ''}</div></div>`;
  const bp = {}, tp = {};
  r.ids.forEach(id => { const x = find(id), d = r.deal[id], s = r.sel[id], ok = d && s !== undefined && d.shown[s] === 0, b = bp[x.point] = bp[x.point] || [0, 0]; b[1]++; if (ok) b[0]++; else if (d && s !== undefined) { const t = x.distractors[d.shown[s] - 1].trap; if (t) tp[t] = (tp[t] || 0) + 1; } });
  const row = (a, b) => `<div class="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800"><span>${a}</span><span>${b}</span></div>`;
  h += `<details class="${card} p-3 mb-3"><summary class="cursor-pointer text-sm font-bold">各考點正確率${Object.keys(tp).length ? '與最常中的陷阱' : ''}</summary><div class="mt-2">${Object.keys(bp).map(k => row(esc(ptName(k)), bp[k][0] + '/' + bp[k][1] + '（' + Math.round(bp[k][0] / bp[k][1] * 100) + '%）')).join('')}${Object.keys(tp).length ? `<p class="text-xs font-bold mt-3 mb-1">你最常中的陷阱</p>` + Object.keys(tp).sort((a, b) => tp[b] - tp[a]).map(k => row(esc(TR[k] || k), tp[k] + ' 次')).join('') : ''}</div></details>`;
  r.ids.forEach((id, i) => {
    const x = find(id), d = r.deal[id], s = r.sel[id], ok = d && s !== undefined && d.shown[s] === 0;
    h += `<div class="${card} p-4 mb-3"><p class="text-sm font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}">${ok ? '✓' : '✗'} Q${i + 1} · ${esc(x.tag)}</p><p class="text-sm mt-2">${sentH(x, true)}</p><p class="text-xs text-slate-500">${esc(x.sentence.zh || '')}</p>${revealH(x, s, d && d.shown)}<div class="mt-3 text-right">${rpBtn(id)}</div></div>`;
  });
  return h;
}
function bookH() {
  const ids = Object.keys(R.saved).filter(find);
  let h = hdr('錯題本', 'goHome()');
  if (!ids.length) return h + `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`;
  h += `<button onclick="startRun(shuf(Object.keys(R.saved).filter(find)),'practice','book')" class="${btn} ${pri} w-full mb-4">重做這 ${ids.length} 題</button>`;
  ids.forEach(id => {
    const x = find(id), rc = R.rec[id] || {};
    h += `<div class="${card} p-4 mb-3"><div class="flex justify-between items-center"><p class="text-sm font-bold">${esc(x.tag)}</p>
      <button onclick="unsave(this.dataset.id)" data-id="${esc(id)}" class="text-xs text-rose-500 hover:underline cursor-pointer">移除</button></div>
      <p class="text-sm mt-2">${sentH(x, true)}</p><p class="text-xs text-slate-500">${esc(x.sentence.zh || '')}</p>${revealH(x, rc.sel, rc.shown)}<div class="mt-3 text-right">${rpBtn(id)}</div></div>`;
  });
  return h;
}
/* 首頁：練習／測驗 */
function homeH() {
  let h = hdr('Part 5 句子填空');
  if (!DATA.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">part5.json 還沒有題目。請把 AI 生成的題目合併進 items。<br><button onclick="go('admin')" class="${btn} ${line} mt-4">🛠 維護</button></div>`;
  const nSaved = Object.keys(R.saved).filter(find).length;
  h += `<div class="grid gap-3 md:grid-cols-2 mb-4">
    <button onclick="openPractice()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📖 練習</p>
      <p class="text-sm text-slate-500 mt-2">依難度、主題、考點隨機抽題，不計分。作答後立即看解析，可重複播放整句。</p></button>
    <button onclick="openTest()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📝 測驗</p>
      <p class="text-sm text-slate-500 mt-2">先選難度（初／中／高），主題與考點可選可不選，隨機抽 ${TESTN} 題。作答中不顯示對錯，完成後才檢討。</p></button></div>
    <div class="grid grid-cols-3 gap-3"><button onclick="openBook()" class="${btn} ${line}">★ 錯題本 ${nSaved}</button><button onclick="go('reports')" class="${btn} ${line}">⚑ 提報${openRpN() ? ' ' + openRpN() : ''}</button><button onclick="go('admin')" class="${btn} ${line}">🛠 維護</button></div>`;
  const cnt = {};
  Object.keys(R.rec).forEach(id => { const r = R.rec[id]; if (find(id) && !r.ok && TR[r.trap]) cnt[r.trap] = (cnt[r.trap] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  if (top.length) h += `<h2 class="font-bold mt-8 mb-2">你常中的陷阱（依最近一次作答）</h2><div class="flex flex-wrap gap-2">${top.map(([k, v]) => `<span class="${chip}">${TR[k]} × ${v}</span>`).join('')}</div>`;
  return h;
}
function ptBtns(k, base) {   // 考點篩選鈕：文法／單字兩組
  const pts = Object.keys(PT).filter(p => DATA.some(x => x.point === p)), g = gr => pts.filter(p => PT[p][0] === gr).map(p => fbtn(k, p, esc(PT[p][1]), base(p))).join('');
  return `<div class="flex flex-wrap items-center gap-2 mb-1">${fbtn(k, null, '不限考點', base(null))}<span class="text-xs text-slate-500 ml-1">文法</span>${g('grammar')}</div><div class="flex flex-wrap items-center gap-2 mb-5"><span class="text-xs text-slate-500">單字</span>${g('vocab')}</div>`;
}
/* 練習：與測驗相同的選題方式，但不計分 */
function practiceH() {
  let h = hdr('練習', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">跟測驗一樣依條件隨機抽題，但不計分、不留最佳紀錄。每題作答後立即看解析，可重複播放整句；答錯的題會放進錯題本。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('fd', null, '不限難度', pool(null, V.fm, V.fp).length)}${Object.keys(TIER).map(k => fbtn('fd', k, TIER[k], pool(k, V.fm, V.fp).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-5">${fbtn('fm', null, '不限主題', pool(V.fd, null, V.fp).length)}${Object.keys(DOM).map(k => fbtn('fm', k, esc(domLabel(k)), pool(V.fd, k, V.fp).length)).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">3. 選考點 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2>${ptBtns('fp', p => pool(V.fd, V.fm, p).length)}`;
  h += `<h2 class="font-bold mb-2">4. 題數</h2><div class="flex flex-wrap gap-2 mb-5">${[[6, '6 題'], [12, '12 題'], [0, '全部']].map(([v, l]) => `<button onclick="V.pn=${v};render()" class="${btn} !py-1.5 ${V.pn === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div>`;
  const m = matches(), n = V.pn ? Math.min(m.length, V.pn) : m.length;
  h += `<button onclick="startPractice()" ${m.length ? '' : 'disabled'} class="${btn} ${pri} w-full">開始練習（${n} 題）</button>`;
  if (!m.length) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`;
  else if (V.pn && m.length < V.pn) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${m.length} 題，將全部出題。</p>`;
  return h;
}
/* 測驗：選難度 → 選主題 → 選考點 → 開始 */
function testH() {
  let h = hdr('測驗', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件從題庫隨機抽 ${TESTN} 題。作答中不顯示對錯、選完直接下一題，完成後一次檢討。時間只提示（每題約 ${TESTSEC} 秒），不強制交卷。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tt', null, '不限難度', pool(null, V.tm, V.tp).length)}${Object.keys(TIER).map(k => fbtn('tt', k, TIER[k], pool(k, V.tm, V.tp).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tm', null, '不限主題', pool(V.tt, null, V.tp).length)}${Object.keys(DOM).map(k => fbtn('tm', k, esc(domLabel(k)), pool(V.tt, k, V.tp).length)).join('')}</div>
    <p class="text-xs text-slate-400 mb-5">${V.tm ? '只從「' + esc(domLabel(V.tm)) + '」抽題；再點一次可取消。' : '不限主題：依上面選的難度，從所有主題隨機抽題。'}</p>`;
  h += `<h2 class="font-bold mb-2">3. 選考點 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2>${ptBtns('tp', p => pool(V.tt, V.tm, p).length)}`;
  const n = pool(V.tt, V.tm, V.tp).length, o = R.tests[tcKey()];
  h += `<button onclick="startTest()" ${n ? '' : 'disabled'} class="${btn} ${pri} w-full">開始測驗（${Math.min(n, TESTN)} 題）</button>`;
  if (!n) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`;
  else if (n < TESTN) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${n} 題，將全部出題。</p>`;
  if (o) h += `<p class="text-xs text-slate-500 mt-3">這個組合的紀錄：最佳 ${o.best}% · 最近一次 ${o.last}%</p>`;
  return h;
}

/* ---------- 維護頁：題數矩陣 → 該格的題目 → 單題；新增題目 ---------- */
const A = { d: null, t: null, k: null, nd: null, nt: null, pts: [], n: 3, out: [] }; // 維護頁狀態
function goA(view, p) { stop(); Object.assign(A, p || {}); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const goAdmin = () => goA('admin');
const adminCell = (d, t) => goA('adminCell', { d, t });
const adminItem = k => goA('adminItem', { k });
const adminNew = (d, t) => goA('adminNew', { nd: d || null, nt: t || null, out: [] });
const adminPick = (k, v) => { A[k] = A[k] === v ? null : v; render(); };
const togglePt = k => { A.pts = A.pts.includes(k) ? A.pts.filter(v => v !== k) : [...A.pts, k]; render(); };
const inCell = (d, t) => DATA.filter(x => x.domain === d && (!t || tier(x) === t)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
const serial = (d, t) => { let mx = 0; DATA.forEach(x => { const m = /^d(\d)-(\d+)-([emh])$/.exec(x.id); if (m && 'd' + m[1] === d && m[3] === TS[t]) mx = Math.max(mx, +m[2]); }); return mx; };
const tcol = n => n >= TARGET ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : n ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400';
const cellStat = (d, t) => { const xs = inCell(d, t); return { n: xs.length, miss: xs.filter(x => !AU.has(x.id)).length }; };

/* ---------- 資料健檢（auditAll）：只讀取、不修改資料。✖ 錯誤＝題目壞掉或被略過；⚠ 提醒＝不符規格但仍可作答；ℹ 備註＝題目自己寫的 issues ---------- */
const ID_RE = /^d([1-7])-(\d{3})-([emh])$/, SUF = { e: 'easy', m: 'medium', h: 'hard' };
let HEALTH = { list: [], err: 0, warn: 0, info: 0, dropped: 0 };
function auditAll(raw) {
  const list = [], add = (id, lv, msg) => list.push({ id, lv, msg });
  const idc = {}, tags = {}, vocs = {}; let dropped = 0;
  raw.forEach((x, i) => {
    if (!x || typeof x !== 'object') { dropped++; add('第 ' + (i + 1) + ' 筆', 'err', '不是物件，已被略過'); return; }
    const id = x.id || '第 ' + (i + 1) + ' 筆';
    if (!okItem(x)) { dropped++; add(id, 'err', '格式不合，已被略過：需要 id、sentence.t（恰好一個 _____）、answer.t、至少 3 個含 t 的 distractors'); return; }
    (idc[id] = idc[id] || []).push(i);
    const m = ID_RE.exec(x.id);
    if (!m) add(id, 'warn', 'id 格式應為 d{1–7}-{三位數}-{e|m|h}');
    else { if ('d' + m[1] !== x.domain) add(id, 'warn', 'id 的主題與 domain 欄位不一致'); if (SUF[m[3]] !== tier(x)) add(id, 'warn', 'id 的難度尾碼與 level.tier 不一致'); }
    if (!PT[x.point]) add(id, 'warn', '考點 point 不在規格內：' + x.point);
    else if (x.kind !== PT[x.point][0]) add(id, 'warn', 'kind 與考點不符（應為 ' + PT[x.point][0] + '）');
    if (!DOM[x.domain]) add(id, 'warn', 'domain 不在 D1–D7：' + x.domain);
    const sc = x.level && x.level.score, rg = SC[tier(x)];
    if (!(sc >= rg[0] && sc <= rg[1])) add(id, 'warn', 'level.score ' + sc + ' 不在 ' + TIER[tier(x)] + ' 的範圍 ' + rg.join('–'));
    if (x.voice !== 'F' && x.voice !== 'M') add(id, 'warn', 'voice 應為 F 或 M');
    if (!x.sentence.zh) add(id, 'warn', '缺 sentence.zh');
    if (!x.answer.why) add(id, 'warn', '缺 answer.why');
    const D = x.distractors, low = s => String(s).trim().toLowerCase();
    if (D.length !== 11) add(id, 'warn', '干擾項應剛好 11 個，目前 ' + D.length + ' 個');
    if (D.filter(d => d.near === true).length < 3) add(id, 'warn', 'near:true 的干擾項少於 3 個');
    if (x.point === 'wordform' && D.filter(d => d.fam === 'root').length < 4) add(id, 'warn', '詞性題 fam:"root" 少於 4 個');
    const seen = new Set([low(x.answer.t)]); D.forEach(d => { if (seen.has(low(d.t))) add(id, 'warn', '干擾項「' + d.t + '」與正解或其他干擾項重複（作答時不會抽到）'); seen.add(low(d.t)); });
    if (D.some(d => !d.why || !d.trap)) add(id, 'warn', '有干擾項缺 why 或 trap');
    D.forEach(d => { if (d.trap && !TR[d.trap]) add(id, 'warn', '未知的 trap：' + d.trap); });
    if (x.tag) (tags[x.tag] = tags[x.tag] || []).push(id);
    (x.vocab || []).forEach(v => { if (v.word) (vocs[low(v.word)] = vocs[low(v.word)] || []).push(id); });
    (x.issues || []).forEach(s => add(id, 'info', String(s)));
  });
  Object.keys(idc).forEach(k => { if (idc[k].length > 1) add(k, 'err', 'id 重複 ' + idc[k].length + ' 次（只有第一筆會被查到）'); });
  Object.keys(tags).forEach(k => { if (tags[k].length > 1) tags[k].forEach(id => add(id, 'warn', 'tag「' + k + '」與 ' + tags[k].filter(z => z !== id).join('、') + ' 重複')); });
  Object.keys(vocs).forEach(k => { const u = [...new Set(vocs[k])]; if (u.length > 1) u.forEach(id => add(id, 'warn', 'vocab「' + k + '」與 ' + u.filter(z => z !== id).join('、') + ' 重複')); });
  return { list, err: list.filter(h => h.lv === 'err').length, warn: list.filter(h => h.lv === 'warn').length, info: list.filter(h => h.lv === 'info').length, dropped };
}
const hItems = id => (HEALTH.list || []).filter(h => h.id === id);
const HL = { err: ['✖', 'text-rose-600 dark:text-rose-400'], warn: ['⚠', 'text-amber-600 dark:text-amber-400'], info: ['ℹ', 'text-slate-500'] };
const idBtn = id => find(id) ? `<button onclick="adminItem(this.dataset.k)" data-k="${esc(id)}" class="font-bold underline decoration-dotted cursor-pointer">${esc(id)}</button>` : `<b>${esc(id)}</b>`;
const missAu = () => DATA.filter(x => !AU.has(x.id));
async function recheckAudio() { await auLoad(); render(); }
function audioStatusH() {
  const N = DATA.length, miss = missAu().length, ok = N - miss;
  const s = !N ? '' : miss ? `<span class="text-rose-600 dark:text-rose-400">✖ 缺 <b>${miss}</b> 題（有 mp3：${ok} / ${N}；缺的整題改用機器發音）</span>` : `<span class="text-emerald-600 dark:text-emerald-400">✔ ${ok} 題都有 mp3</span>`;
  return `<span class="flex items-center gap-2">${s}${N ? `<button onclick="recheckAudio()" class="${btn} ${line} !py-0.5 !px-2 text-xs">重新檢查</button>` : ''}</span>`;
}
function healthH() {
  const H = HEALTH, clean = !H.err && !H.warn && !H.info;
  const chips = [H.err ? `<span class="${HL.err[1]}">✖ 錯誤 <b>${H.err}</b></span>` : '', H.warn ? `<span class="${HL.warn[1]}">⚠ 提醒 <b>${H.warn}</b></span>` : '', H.info ? `<span class="${HL.info[1]}">ℹ 備註 <b>${H.info}</b></span>` : ''].filter(Boolean).join('');
  let h = `<div class="${card} p-4 mb-4"><div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><b>資料健檢</b>${clean ? '<span class="text-emerald-600 dark:text-emerald-400">✔ 全部通過</span>' : chips}</div>`;
  if (H.list.length) {
    const g = {}, order = []; H.list.forEach(it => { if (!g[it.id]) { g[it.id] = []; order.push(it.id); } g[it.id].push(it); });
    h += `<details class="mt-2" ${H.err ? 'open' : ''}><summary class="text-xs cursor-pointer text-slate-500">查看明細（${order.length} 題有項目）</summary><div class="max-h-96 overflow-auto">`
      + order.map(id => `<div class="mt-2"><p class="text-xs">${idBtn(id)}</p><ul class="text-xs space-y-0.5 mt-0.5">${g[id].map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`).join('') + '</div></details>';
  }
  return h + '</div>';
}
function ptCount() { const c = {}; Object.keys(PT).forEach(k => c[k] = 0); DATA.forEach(x => { c[x.point] = (c[x.point] || 0) + 1; }); return c; }
function adminH() {
  const doms = Object.keys(DOM), tiers = Object.keys(TIER), N = DATA.length, cnt = ptCount();
  let low = 0; doms.forEach(d => tiers.forEach(t => { if (cellStat(d, t).n < TARGET) low++; }));
  let h = hdr('維護', 'backAdmin()');
  h += `<div class="${card} p-4 mb-4 text-sm"><div class="flex flex-wrap gap-x-6 gap-y-1"><span>題目 <b>${N}</b> 題${HEALTH.dropped ? ` <span class="${HL.err[1]}">（另有 ${HEALTH.dropped} 筆格式不合被略過）</span>` : ''}</span>`
    + `<span>音檔 <b>${N - missAu().length}</b> 題</span>`
    + `<span class="text-slate-500">未達標格子 <b>${low}</b> / ${doms.length * tiers.length}（目標每格 ≥ ${TARGET} 題）</span></div>`
    + `<div class="flex flex-wrap items-center gap-2 mt-2 text-xs"><span class="text-slate-500">音檔：</span>${audioStatusH()}</div></div>`;
  h += healthH();
  h += `<div class="overflow-x-auto mb-3"><div class="grid gap-1.5 text-center text-sm min-w-[32rem]" style="grid-template-columns:4.5rem repeat(${doms.length},minmax(3rem,1fr))"><div></div>${doms.map(d => `<button onclick="adminCell('${d}',null)" class="text-xs font-bold py-1 cursor-pointer hover:text-indigo-600">${d.toUpperCase()}<br><span class="font-normal text-slate-500">${esc(DOM[d])}</span></button>`).join('')}`;
  tiers.forEach(t => {
    h += `<div class="text-left self-center text-xs font-bold">${TIER[t]} ${TS[t]}<span class="block font-normal text-slate-500">${tScore(t)}</span></div>` + doms.map(d => {
      const s = cellStat(d, t);
      return `<button onclick="adminCell('${d}','${t}')" class="rounded-lg py-3 font-bold cursor-pointer ${tcol(s.n)}">${s.n}`
        + (s.n ? `<span class="block text-[10px] font-normal">${s.n} 題</span>` : '')
        + (s.miss ? `<span class="block text-[10px] font-normal text-rose-600 dark:text-rose-400">缺音檔 ${s.miss}</span>` : '') + '</button>';
    }).join('');
  });
  h += `</div></div><p class="text-xs text-slate-400 mb-5">格子＝該難度、該主題的題數。紅＝0、黃＝未達 ${TARGET}、綠＝達標；格內小字：缺 mp3 的題數（缺的整題用機器發音，仍可作答）。點格子看該格的題目；點上方 D1–D7 看該主題全部難度。</p>`;
  h += `<div class="${card} p-3 mb-5"><p class="text-sm font-bold mb-1">各考點題數（共 ${N} 題）</p><div class="flex flex-wrap gap-1.5">${Object.keys(PT).map(k => { const p = N ? cnt[k] / N * 100 : 0, lw = N && p < PT[k][2][0]; return `<span class="${chip} ${lw ? '!bg-amber-100 dark:!bg-amber-900/40 !text-amber-800 dark:!text-amber-200' : ''}">${esc(PT[k][1])} ${cnt[k]}${lw ? ' ⚠偏少' : ''}<span class="opacity-60"> 建議 ${PT[k][2][0] === PT[k][2][1] ? PT[k][2][0] : PT[k][2].join('–')}%</span></span>`; }).join('')}</div></div>`;
  h += `<button onclick="go('reports')" class="${btn} ${line} w-full mb-3">⚑ 提報彙整${openRpN() ? `（待處理 ${openRpN()}）` : ''}</button>`;
  return h + `<button onclick="adminNew()" class="${btn} ${pri} w-full">＋ 新增題目</button>`;
}
const auName = x => x.id + '.mp3';
function copyMiss(d, t) { const xs = inCell(d, t || null).filter(x => !AU.has(x.id)); clip(xs.map(x => auName(x) + ' | ' + sayText(x) + ' | ' + (x.voice === 'M' ? 'M' : 'F')).join('\n'), 'cm'); }
function adminCellH() {
  const d = A.d, t = A.t, xs = inCell(d, t), nm = domLabel(d) + (t ? ' · ' + TIER[t] : ''), miss = xs.filter(x => !AU.has(x.id)).length;
  let h = hdr(nm, 'goAdmin()');
  h += `<button onclick="adminNew('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${pri} w-full mb-3">＋ 新增 ${esc(nm.replace(' · ', ' '))} 題目</button>`;
  h += `<button id="cm" ${miss ? '' : 'disabled'} onclick="copyMiss('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${line} w-full mb-4">複製本格缺的音檔清單（${miss}）</button>`;
  if (!xs.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有題目（0 題）。<br><span class="text-xs text-slate-400">點上方「＋ 新增」開始建立。</span></div>`;
  return h + xs.map(x => {
    const sc = x.level && x.level.score, nh = hItems(x.id).filter(i => i.lv !== 'info').length, rp = openRpN(x.id);
    const badge = (!AU.has(x.id) ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">缺音檔</span>` : '')
      + (nh ? `<span class="${chip} !bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300">⚠ ${nh}</span>` : '')
      + (rp ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">⚑ 提報 ${rp}</span>` : '');
    return `<div class="${card} p-3 mb-3"><p class="font-bold text-sm">${esc(x.id)}</p><p class="text-xs text-slate-500 truncate">${esc(x.tag)}</p><p class="text-sm mt-2">${sentH(x, false)}</p>
      <div class="flex flex-wrap gap-1 mt-2">${badge}<span class="${chip}">${TIER[tier(x)]}${sc ? ' · ' + sc : ''}</span>${ptChip(x)}</div>
      <button onclick="adminItem(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1 text-xs mt-2">看題目與答案</button></div>`;
  }).join('');
}
function copySent(id) { clip(filled(find(id)), 'cs-' + id); }
function copyName(id) { clip(auName(find(id)), 'cn-' + id); }
function auPanelH(x) {
  const has = AU.has(x.id), id = esc(x.id);
  return `<div class="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><p class="text-xs font-bold mb-2">🔊 音檔 <span class="${has ? 'text-emerald-600' : 'text-rose-500'}">${has ? '✔ 有（播放用 mp3）' : '✖ 缺（整題用機器發音）'}</span></p>
  <div class="flex flex-wrap items-center gap-2"><code class="text-xs ${has ? 'text-emerald-600' : 'text-rose-500'}">${esc(auName(x))}</code><button data-play="${id}" data-lbl="試聽" onclick="togglePlay(this.dataset.play)" class="${btn} ${line} !py-0.5 !px-2 text-xs">試聽</button>
  <button id="cn-${id}" data-id="${id}" onclick="copyName(this.dataset.id)" class="${btn} ${line} !py-0.5 !px-2 text-xs">檔名</button><button id="cs-${id}" data-id="${id}" onclick="copySent(this.dataset.id)" class="${btn} ${line} !py-0.5 !px-2 text-xs">句子</button><span class="text-xs text-slate-500">${x.voice === 'M' ? '男聲' : '女聲'}</span></div>
  <p class="text-xs text-slate-500 mt-1">${esc(sayText(x))}</p></div>`;
}
function statH(x) {
  const st = R.stat[x.id], D = x.distractors; if (!st) return `<p class="text-xs text-slate-500 mt-4">選項曝光統計：這台裝置還沒有作答紀錄。</p>`;
  const all = [0, ...D.map((_, i) => i + 1)], sh = k => st.shown[k] || 0, pk = k => st.picked[k] || 0;
  const nn = all.filter(k => k > 0 && !D[k - 1].near), mean = nn.length ? nn.reduce((a, k) => a + sh(k), 0) / nn.length : 0;
  return `<div class="mt-4"><p class="text-xs font-bold">選項曝光統計（本機，共出現 ${sh(0)} 次；非 near 干擾項平均 ${Math.round(mean * 10) / 10} 次，低於 70% 會標紅）</p><div class="overflow-x-auto"><table class="text-xs w-full mt-1"><tr class="text-left text-slate-500"><th>選項</th><th class="text-right">出現</th><th class="text-right">被選</th></tr>${all.map(k => { const o = optOf(x, k), lw = k > 0 && !o.near && mean > 0 && sh(k) < mean * 0.7; return `<tr class="border-t border-slate-100 dark:border-slate-800 ${lw ? 'text-rose-600' : ''}"><td>${esc(o.t)}${o.ok ? ' ✓' : ''}${o.near ? ' <span class="text-amber-600">near</span>' : ''}</td><td class="text-right">${sh(k)}</td><td class="text-right">${pk(k)}</td></tr>`; }).join('')}</table></div></div>`;
}
const poolRowH = o => `<div class="rounded-lg border px-3 py-2 text-sm ${o.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-800'}"><div class="flex justify-between gap-2"><span><b>${esc(o.t)}</b> <span class="text-xs text-slate-500">${esc(o.zh || '')} ${esc(o.pos || '')}</span></span><span class="text-xs shrink-0 ${o.ok ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${o.ok ? '✓ 正解' : esc(TR[o.trap] || o.trap || '') + (o.near ? '・near' : '')}</span></div><p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc(o.why)}</p></div>`;
function adminItemH() {
  const x = find(A.k);
  if (!x) return hdr('維護', 'goAdmin()') + `<p class="text-sm text-slate-400 text-center py-8">找不到這一題。</p>`;
  const d = x.domain, t = tier(x), sc = x.level && x.level.score, cl = x.clue;
  let h = hdr(x.id, DOM[d] ? `adminCell('${d}','${t}')` : 'goAdmin()');
  h += `<div class="${card} p-4"><p class="text-base leading-relaxed">${sentH(x, true)}</p><p class="text-xs text-slate-500 mt-1">${esc(x.sentence.zh || '')}</p></div>
    <p class="text-sm font-bold mt-3">${esc(x.tag)}</p>
    <div class="flex flex-wrap gap-1.5 mt-2"><span class="${chip}">${TIER[t]}${sc ? ' · ' + sc : ''}</span>${DOM[d] ? `<span class="${chip}">${esc(domLabel(d))}</span>` : ''}${ptChip(x)}<span class="${chip}">${x.voice === 'M' ? '男聲' : '女聲'}</span></div>`;
  if (x.level && x.level.why) h += `<p class="text-xs text-slate-500 mt-2">${esc(x.level.why)}</p>`;
  if (cl) h += `<p class="text-xs font-bold mt-3">線索：${esc(cl.text || '')}</p><ol class="text-xs text-slate-500 list-decimal pl-5 mt-1">${(cl.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>`;
  h += `<p class="text-xs font-bold mt-5 mb-2">題庫 ${1 + x.distractors.length} 個選項（網頁每次作答隨機抽 1 正解＋3 干擾項）</p><div class="space-y-1.5">${[0, ...x.distractors.map((_, i) => i + 1)].map(k => poolRowH(optOf(x, k))).join('')}</div>`;
  if ((x.vocab || []).length) h += `<p class="mt-3 flex flex-wrap gap-1.5 items-center text-xs text-slate-500">單字：${x.vocab.map(w => `<span class="${chip}">${esc(w.word)} ${esc(w.zh || '')}</span>`).join(' ')}</p>`;
  h += statH(x) + auPanelH(x);
  { const rs = reportsOf(x.id); h += `<div class="mt-5"><div class="flex items-center justify-between mb-2"><p class="text-xs font-bold">提報（${rs.length}）</p>${rpBtn(x.id)}</div>${rs.map(r => reportCardH(r)).join('')}</div>`; }
  if ((x.issues || []).length) h += `<p class="text-xs text-amber-600 mt-3">題目備註：${x.issues.map(esc).join('；')}</p>`;
  const hs = hItems(x.id).filter(it => it.lv !== 'info');
  if (hs.length) h += `<div class="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><p class="text-xs font-bold mb-1">此題健檢</p><ul class="text-xs space-y-0.5">${hs.map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`;
  return h;
}

/* ---- 新增題目：選主題＋難度（＋考點、題數）→ 題目編號＋給 AI 的指令（沒有圖片，所以沒有出圖 prompt）---- */
const RULES = ['一題一空，只有一個正解。任一干擾項放進空格都必須明確錯誤，原因寫在 why；任何 3 個干擾項與正解的組合都要是合格考題，不能有兩個選項同時成立。', '11 個干擾項要有層次：至少 3 個 near:true；wordform 題優先用同字根（fam:"root"）的各種變化，至少 4 個 root，不夠再用形似字；單字題 11 個必須詞性相同，意思與句子不符或搭配不自然；conj 題要混合連接詞與介系詞。', '文法題不依賴詞彙語意，看空格前後 3–5 字的結構就能判斷；單字題要讀懂語意或知道搭配才能答，盡量用商務情境。', '句子是自然的商務英文，不過度生僻，除人名外不出現專有名詞；zh 要通順。', '同一批題目不要重複句型或單字；tag、vocab.word、句子首句不得與已有題目重複。', '考點比例照規格的 share；本批若指定考點，就只出該考點。', '不確定的題目放進 issues，不要硬湊。無法達到 11 個合格干擾項時，回傳 {"skip":"原因"} 而不是勉強湊數。', '輸出單一合法 JSON 陣列（UTF-8、不加程式碼區塊標記）。'];
function nextIds(d, t, n) { const mx = serial(d, t); return Array.from({ length: n }, (_, i) => d + '-' + String(mx + 1 + i).padStart(3, '0') + '-' + TS[t]); }
function promptText(d, t, pts, n) {
  const ids = nextIds(d, t, n), sp = SPEC || {}, cnt = ptCount();
  const rules = sp.rules && typeof sp.rules === 'object' ? Object.values(sp.rules) : RULES;
  const lite = JSON.stringify({ domain: { [d]: sp.domains && sp.domains[d] }, tier: { [t]: sp.tiers && sp.tiers[t] }, points: sp.points, traps: sp.traps, biz: sp.biz, entry_schema: sp.entry_schema });
  const ptLine = pts.length ? `- 考點：只出 ${pts.map(k => k + '（' + ptName(k) + '）').join('、')}；這些考點目前題數：${pts.map(k => k + '×' + cnt[k]).join('、')}。` : `- 考點：不限。各考點現有題數（建議占比）：${Object.keys(PT).map(k => k + '×' + cnt[k] + '（' + PT[k][2].join('–') + '%）').join('、')}。請優先補數量最少、離建議占比最遠的考點。`;
  return [`請為多益 Part 5 句子填空寫 ${n} 題（每題一個句子、一個空格、1 個正解＋11 個干擾項），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part5.json。`, '',
    `- 主題：${d.toUpperCase()} ${DOM[d]}（scene 須屬於：${((sp.domains && sp.domains[d] && sp.domains[d].scenes) || []).join('、')}）；句子要是商務情境，可選填 biz（hr／marketing／finance／manufacturing／it／general）。`,
    `- 難度：${TIER[t]}（id 尾碼 ${TS[t]}）｜level.score 只能填：${SC[t].map(s => s + '（cefr 填 ' + cefr(s) + '）').join('、')}${sp.tiers && sp.tiers[t] ? '｜' + sp.tiers[t].guide : ''}`,
    ptLine,
    `- id 依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）；voice 填 F 或 M（音檔性別）。`,
    '- 每題 distractors 剛好 11 個，每個含 t、zh、pos、trap、near、fam、why；選項順序網頁會每次重新抽選，不要在意順序。',
    '- clue.steps 依四步驟解題法各寫一句：掃描選項判斷題型 → 分析空格前後線索 → 刪去法 → 代入驗證。',
    '', ...rules.map(s => '- ' + s), '',
    `- 已用過的 vocab（不得重複）：${[...new Set(DATA.flatMap(x => (x.vocab || []).map(v => v.word)))].join('、') || '（無）'}`,
    `- 已用過的 tag（不得重複）：${DATA.map(x => x.tag).join('；') || '（無）'}`,
    `- 已有的句子首句（不要雷同）：${DATA.map(x => x.sentence.t).join('；') || '（無）'}`,
    `- 輸出方式：建立檔案 p5_${ids[0]}_x${n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。`,
    '', '【規格：part5.json 的 _spec 精簡版】', lite].join('\n');
}
function buildOut(d, t, pts, n) {
  const ids = nextIds(d, t, n), text = promptText(d, t, pts, n);
  return [
    { title: '題目編號', note: `這一批新題會依序使用這些 id（同一「主題＋難度」內最大編號 + 1）。音檔請存成 audio/p5/{id}.mp3，一題一檔。`, text: ids.join('\n') },
    { title: '給 AI 的「寫題目」指令', note: `直接貼給 AI（約 ${text.length.toLocaleString()} 字，已內含精簡規格與已用過的 tag／vocab／句子，不必附 part5.json）。AI 會給你一個 p5_ 開頭的 JSON 檔；若 AI 無法建檔，它會貼出 json 區塊，再自行存成同名檔案。`, text },
    { title: '存檔與合併', note: `把 AI 給你的 p5_ 開頭檔案放到 json_merge.py 同一個資料夾，雙擊執行並選「Part 5 填空」合併。合併後重新整理本頁，題數就會更新；再到上方矩陣點該格，展開題目即可複製檔名與句子，音檔放 audio/p5/ 後執行 Scan總表與音檔.py。` }
  ];
}
function adminNewH() {
  const doms = Object.keys(DOM), tiers = Object.keys(TIER), d = A.nd, t = A.nt;
  const on = c => `${btn} !py-1.5 ${c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`;
  let h = hdr('新增題目', 'goAdmin()');
  h += `<h2 class="font-bold mb-2">1. 選主題</h2><div class="flex flex-wrap gap-2 mb-5">${doms.map(k => `<button onclick="adminPick('nd','${k}')" class="${on(d === k)}">${esc(domLabel(k))}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">2. 選難度</h2><div class="flex flex-wrap gap-2 mb-5">${tiers.map(k => `<button onclick="adminPick('nt','${k}')" class="${on(t === k)}">${TIER[k]} ${TS[k]} <span class="text-xs opacity-70">${tScore(k)}${d ? ` · ${pool(k, d).length} 題` : ''}</span></button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">3. 選考點 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-5"><button onclick="A.pts=[];render()" class="${on(!A.pts.length)}">不限考點</button>${Object.keys(PT).map(k => `<button onclick="togglePt('${k}')" class="${on(A.pts.includes(k))}">${esc(PT[k][1])}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">4. 題數</h2><div class="flex flex-wrap gap-2 mb-5">${[1, 2, 3, 5, 10].map(k => `<button onclick="A.n=${k};render()" class="${on(A.n === k)}">${k} 題</button>`).join('')}</div>`;
  if (!d || !t) return h + `<p class="text-xs text-slate-400">選好主題與難度後，會出現題目編號與給 AI 的指令。</p>`;
  const c = pool(t, d).length;
  h += `<p class="text-sm mb-4">${esc(domLabel(d))} · ${TIER[t]}（${tScore(t)}）目前 <b>${c}</b> 題${c < TARGET ? `，未達目標 ${TARGET} 題` : '，已達標'}。新題 id 會從 <b>${esc(nextIds(d, t, 1)[0])}</b> 開始。</p>`;
  const outs = buildOut(d, t, A.pts, A.n); A.out = outs.map(s => s.text || '');
  outs.forEach((s, i) => {
    h += `<div class="${card} p-4 mb-3"><div class="flex items-center justify-between gap-2 mb-1"><p class="font-bold text-sm">${i + 1}. ${esc(s.title)}</p>${s.text ? `<button id="cp${i}" onclick="copyOut(${i})" class="${btn} ${line} !py-1 text-xs shrink-0">複製</button>` : ''}</div><p class="text-xs text-slate-500 mb-2">${esc(s.note)}</p>${s.text ? `<pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(s.text)}</pre>` : ''}</div>`;
  });
  return h;
}
function clip(t, bid) {
  const d = () => { const b = document.getElementById(bid); if (b) { b.dataset.l = b.dataset.l || b.textContent; b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = b.dataset.l || '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); d(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(d, fb); else fb();
}
const copyOut = i => clip(A.out[i] || '', 'cp' + i);

/* ---------- 提報：發現答案、解析、題幹或音檔有瑕疵時記錄；存在 localStorage（PK.reports），管理員可彙整、編輯狀態、匯出／匯入 ---------- */
const RK = { answer: '答案／解析有誤', stem: '題幹／選項問題', audio: '音檔問題', other: '其他' };
const RS = { open: '待處理', fixing: '處理中', fixed: '已修正', wontfix: '不處理' };
const RSC = { open: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300', fixing: '!bg-sky-100 !text-sky-700 dark:!bg-sky-950 dark:!text-sky-300', fixed: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-300', wontfix: '' };
const fmtT = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const reportsOf = id => R.reports.filter(r => r.qid === id).sort((a, b) => b.created - a.created);
const openRpN = id => R.reports.filter(r => (r.status === 'open' || r.status === 'fixing') && (!id || r.qid === id)).length;
const rpBtn = qid => { const n = reportsOf(qid).length; return `<button onclick="openReport(this.dataset.q)" data-q="${esc(qid)}" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">⚑ 提報${n ? ` (${n})` : ''}</button>`; };
function toast(m) { const d = document.createElement('div'); d.textContent = m; d.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
/* 提報當下的選項快照：之後題庫改了，管理員仍看得到使用者當時看到什麼 */
function snapOf(qid) {
  const x = find(qid); if (!x) return null;
  let sh = null, sel = null;
  if (V.run && V.run.deal[qid]) { sh = V.run.deal[qid].shown; sel = V.run.sel[qid]; }
  if (!okShown(x, sh) && R.rec[qid]) { sh = R.rec[qid].shown; sel = R.rec[qid].sel; }
  if (!okShown(x, sh)) return null;
  return { sent: x.sentence.t, sents: sh.map(k => ({ t: optOf(x, k).t, ok: k === 0 })), sel: sel === undefined ? null : sel };
}
function openReport(qid) { V.rp = { mode: 'new', qid, kind: 'answer', note: '', reporter: R.reporter || '', snap: snapOf(qid), focus: true }; render(); }
function editReport(id) { const r = R.reports.find(q => q.id === id); if (!r) return; V.rp = Object.assign({ mode: 'edit', id, focus: true }, JSON.parse(JSON.stringify(r))); render(); }
function closeReport() { V.rp = null; render(); }
function saveReport() {
  const p = V.rp; if (!p) return;
  const g = i => { const e = document.getElementById(i); return e ? e.value : ''; };
  const note = g('rpn').trim(), kind = g('rpk') || 'other', reporter = g('rpr').trim();
  if (!note) { toast('請簡單描述問題'); return; }
  const now = Date.now();
  if (p.mode === 'new') {
    R.reports.push({ id: 'r' + now.toString(36) + Math.random().toString(36).slice(2, 6), qid: p.qid, kind, note, reporter, status: 'open', adminNote: '', created: now, updated: now, snap: p.snap || null });
    R.reporter = reporter; toast('已提報，謝謝！');
  } else {
    const r = R.reports.find(q => q.id === p.id); if (!r) return closeReport();
    Object.assign(r, { kind, note, reporter, status: g('rps') || r.status, adminNote: g('rpa').trim(), updated: now }); toast('已更新');
  }
  saveR(); V.rp = null; render();
}
function setRs(id, st) { const r = R.reports.find(q => q.id === id); if (!r) return; r.status = st; r.updated = Date.now(); saveR(); render(); }
function delReport(id) { if (!confirm('確定刪除這筆提報？')) return; R.reports = R.reports.filter(q => q.id !== id); saveR(); render(); }
function setRf(k, v) { V[k] = V[k] === v ? null : v; render(); }
function rpModalH() {
  const p = V.rp; if (!p) return '';
  const edit = p.mode === 'edit', x = find(p.qid), sn = p.snap;
  const opt = (o, cur) => Object.keys(o).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${o[k]}</option>`).join('');
  const inp = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm';
  return `<div class="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onclick="if(event.target===this)closeReport()"><div class="min-h-full flex items-end sm:items-center justify-center p-3">
    <div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">${edit ? '編輯提報' : '⚑ 提報問題'} · ${esc(p.qid)}</h2><button onclick="closeReport()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    ${x ? `<p class="text-sm mb-3">${sentH(x, false)}</p>` : ''}
    <label class="block text-xs text-slate-500 mb-1">問題類型</label><select id="rpk" class="${inp} mb-3">${opt(RK, p.kind)}</select>
    <label class="block text-xs text-slate-500 mb-1">描述問題（例如：B 選項放進去其實也通、中文翻譯不通順…）</label><textarea id="rpn" rows="4" class="${inp} mb-3">${esc(p.note)}</textarea>
    <label class="block text-xs text-slate-500 mb-1">提報人（選填）</label><input id="rpr" value="${esc(p.reporter)}" class="${inp} mb-3" maxlength="30">
    ${edit ? `<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-xs text-slate-500 mb-1">處理狀態</label><select id="rps" class="${inp}">${opt(RS, p.status)}</select></div></div>
    <label class="block text-xs text-slate-500 mb-1">管理員備註（例如：已改 distractors 第 3 個、已重錄音檔）</label><textarea id="rpa" rows="2" class="${inp} mb-3">${esc(p.adminNote)}</textarea>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">提報當下的選項</summary><ul class="mt-1 space-y-0.5">${sn.sents.map((s, i) => `<li>${L[i]}. ${esc(s.t)}${s.ok ? ' <b class="text-emerald-600">✓ 正解</b>' : ''}${sn.sel === i ? ' <span class="text-rose-500">（使用者選）</span>' : ''}</li>`).join('')}</ul></details>` : ''}
    <div class="flex gap-2 justify-end"><button onclick="closeReport()" class="${btn} ${line}">取消</button><button onclick="saveReport()" class="${btn} ${pri}">${edit ? '儲存變更' : '送出提報'}</button></div></div></div></div>`;
}
function reportCardH(r) {
  const x = find(r.qid), sn = r.snap;
  return `<div class="${card} p-3 mb-3"><div class="min-w-0">
    <div class="flex flex-wrap items-center gap-1.5">${x ? idBtn(r.qid) : `<b class="text-sm">${esc(r.qid)}</b><span class="${chip}">題目已不存在</span>`}<span class="${chip}">${RK[r.kind] || esc(r.kind)}</span><span class="${chip} ${RSC[r.status] || ''}">${RS[r.status] || esc(r.status)}</span></div>
    ${x ? `<p class="text-xs text-slate-500 mt-1.5">${esc(filled(x))}</p>` : ''}
    <p class="text-sm mt-1.5 whitespace-pre-wrap break-words">${esc(r.note)}</p>
    <p class="text-xs text-slate-400 mt-1">${esc(r.reporter || '匿名')} · ${fmtT(r.created)}${r.updated > r.created ? ' · 更新 ' + fmtT(r.updated) : ''}</p>
    ${r.adminNote ? `<p class="text-xs mt-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 whitespace-pre-wrap break-words"><b>管理員：</b>${esc(r.adminNote)}</p>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mt-1.5"><summary class="cursor-pointer">當時的選項</summary><p class="mt-1">${esc(sn.sent || '')}</p><ul class="mt-1 space-y-0.5">${sn.sents.map((s, i) => `<li>${L[i]}. ${esc(s.t)}${s.ok ? ' ✓' : ''}${sn.sel === i ? ' ←使用者選' : ''}</li>`).join('')}</ul></details>` : ''}</div>
    <div class="flex flex-wrap gap-1.5 mt-2.5">${Object.keys(RS).map(k => `<button onclick="setRs(this.dataset.id,'${k}')" data-id="${esc(r.id)}" class="text-xs rounded-lg px-2.5 py-1 cursor-pointer ${r.status === k ? 'bg-indigo-600 text-white' : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}">${RS[k]}</button>`).join('')}
    <button onclick="editReport(this.dataset.id)" data-id="${esc(r.id)}" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 cursor-pointer ml-auto">✎ 編輯</button><button onclick="delReport(this.dataset.id)" data-id="${esc(r.id)}" class="text-xs rounded-lg px-2.5 py-1 text-rose-500 hover:underline cursor-pointer">刪除</button></div></div>`;
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
  if (fmt === 'json') { download(`part5-reports-${stamp}.json`, JSON.stringify({ app: 'toeic-part5-reports', v: 1, exported: Date.now(), reports: R.reports }, null, 2), 'application/json'); return; }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['提報編號', '題目ID', '類型', '狀態', '描述', '提報人', '建立時間', '更新時間', '管理員備註', '句子', 'A', 'B', 'C', 'D', '正解', '使用者選'];
  const rows = R.reports.slice().sort((a, b) => a.created - b.created).map(r => { const s = r.snap, x = find(r.qid);
    return [r.id, r.qid, RK[r.kind] || r.kind, RS[r.status] || r.status, r.note, r.reporter, fmtT(r.created), fmtT(r.updated), r.adminNote, s && s.sent ? s.sent : (x ? x.sentence.t : ''),
      ...[0, 1, 2, 3].map(i => s && s.sents[i] ? s.sents[i].t : ''), s ? L[s.sents.findIndex(z => z.ok)] || '' : '', s && s.sel != null ? L[s.sel] : ''].map(cell).join(','); });
  download(`part5-reports-${stamp}.csv`, '\ufeff' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
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
        const n = { id: r.id, qid: r.qid, kind: RK[r.kind] ? r.kind : 'other', note: String(r.note || ''), reporter: String(r.reporter || ''), status: RS[r.status] ? r.status : 'open', adminNote: String(r.adminNote || ''), created: +r.created || Date.now(), updated: +r.updated || +r.created || Date.now(), snap: r.snap || null };
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
  if (v === 'run') { if (!T.id) startClock(); } else clrT();
  if (V.rp && V.rp.focus) { V.rp.focus = false; const t = document.getElementById('rpn'); if (t) t.focus(); }
  paintAudio();
}

/* ---------- 啟動：讀取 part5.json；雙擊開啟（file://）時改用手動選取 ---------- */
function backAdmin() { if (window._ah) location.href = 'index.html#mt'; else goHome(); } // 從首頁「維護總覽」進來的，返回就回總覽
function loadText(t) {
  try {
    const j = JSON.parse(t); SPEC = (j && j._spec) || null; const d = SPEC && SPEC.domains;
    if (d) Object.keys(d).forEach(k => { if (d[k] && d[k].name) DOM[k] = d[k].name; });
    RAW = Array.isArray(j) ? j : (j && j.items) || []; DATA = RAW.filter(okItem);
    HEALTH = auditAll(RAW); render();
    if (location.hash === '#admin' && !window._ah) { window._ah = 1; goAdmin(); } // 從首頁「維護總覽」直接進入維護頁
  } catch (e) { alert('part5.json 格式有誤：' + e.message); }
}
function pickJson(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8'); }
async function boot() {
  main.innerHTML = '<p class="text-sm text-slate-500 text-center py-16">載入中…</p>';
  await auLoad();
  try { const res = await fetch('part5.json', { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status); loadText(await res.text()); }
  catch (e) {
    main.innerHTML = `<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 part5.json</h3><p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取；上傳到 GitHub Pages 或用本機伺服器則會自動載入。</p><label class="${btn} inline-block ${pri}">選取 part5.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`;
  }
}
boot();
