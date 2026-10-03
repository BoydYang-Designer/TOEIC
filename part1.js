/* Part 1 照片描述：首頁分「練習」與「測驗」；題庫來自 part1.json
   練習：與測驗相同的選題方式（難度／主題／題數），隨機抽題，不計分；音檔可重播，作答後立即看解析
   編碼：題目 id = d{N}-{NNN}-{e|m|h}（N=主題 1–7、NNN=該主題流水號、尾碼=難度）；每題一張獨立的圖（圖片檔 images/{id}.jpg），不跨難度共用。
   維護頁：首頁「🛠 維護」→ 難度×主題題數矩陣 → 該格的題目與圖片 → 答案；「新增題目」產生圖片檔名與給 AI 的指令。
   維護頁另有「資料健檢」（格式錯誤／被略過的題目）、缺圖檢查與圖片數比對；「寫文本」指令已內含精簡規格，不必再上傳整份 part1.json。
   題庫格式：每題有 pool（12 句：3 正確＋9 錯誤）；每次作答隨機抽 1 正確＋3 錯誤並隨機排成 A–D。舊格式（statements 四句）仍可讀，但不會洗牌。
   測驗：先選難度（初／中／高），再選主題（D1–D7），隨機抽 6 題，音檔只播一次，完成後才檢討、記錄成績 */
const KEY = 'toeicCoachV2', PK = 'toeicPart1V1'; // KEY 只讀寫 dark（與其他頁同步），作答紀錄存在 PK
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
let R = { rec: {}, sets: {}, saved: {}, tests: {} };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
if (!R.tests) R.tests = {};
if (!Array.isArray(R.reports)) R.reports = []; // 提報紀錄（存在 PK 裡，與作答紀錄同一份 localStorage）
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };
const OLD2NEW = { p1s1q1: 'd1-001-e', p1s1q2: 'd2-001-e', p1s1q3: 'd3-001-e', p1s1q4: 'd4-001-e', p1s1q5: 'd5-001-e', p1s1q6: 'd6-001-e', p1s2q1: 'd7-001-e' };
(() => { let m = false; ['rec', 'saved'].forEach(k => { const o = R[k] || {}; for (const a in OLD2NEW) if (o[a] !== undefined) { if (o[OLD2NEW[a]] === undefined) o[OLD2NEW[a]] = o[a]; delete o[a]; m = true; } }); if (m) saveR(); })();
let DATA = [];
const TESTN = 6; // 每次測驗題數
const itemsOf = j => Array.isArray(j) ? j : (j && j.items) || [];
const find = id => DATA.find(x => x.id === id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = 'ABCD';
const TR = { 'sound-alike': '音近字', 'not-in-photo': '圖中沒有', 'wrong-action': '動作錯誤', 'wrong-place-or-number': '位置／人數錯', 'over-inference': '過度推論' };
/* 難度三級：依 level.score 判定（level.tier 有填就以它為準） */
const TIER = { easy: '初級', medium: '中級', hard: '高級' };
/* 主題 D1–D7：依 scene 對應（part1.json 的 _spec.domains 有定義時會覆蓋這份預設） */
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
const tierOf = x => {
  const t = x.level && x.level.tier; if (TIER[t]) return t;
  const s = (x.level && x.level.score) || 600;
  return s <= 550 ? 'easy' : s <= 650 ? 'medium' : 'hard';
};
const domOf = x => {
  if (DOM[x.domain]) return x.domain;
  for (const k in DOM) if ((DOM[k].scenes || []).includes(x.scene)) return k;
  return null;
};
const domLabel = k => DOM[k] ? k.toUpperCase() + ' ' + DOM[k].n : '';
const pool = (t, m) => DATA.filter(x => (!t || tierOf(x) === t) && (!m || domOf(x) === m));

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* 每題各有自己的圖；同一輪仍以圖片路徑去重，避免萬一有題目共用同一張圖時重複出現 */
const imgPath = x => x.image || `images/${x.id}.jpg`; // 一題一張圖：images/{id}.jpg
const imgKey = imgPath;
const uniqN = list => new Set(list.map(imgKey)).size;
function pickUnique(ids, n) {
  const seen = new Set(), out = [];
  for (const id of shuffle(ids)) { const k = imgKey(find(id)); if (seen.has(k)) continue; seen.add(k); out.push(id); if (n && out.length >= n) break; }
  return out;
}

/* ---------- 題庫格式：pool（12 句）／舊格式 statements（4 句）---------- */
function normItem(x) {
  if (!x || !x.id) return null;
  let pool, legacy = false;
  if (Array.isArray(x.pool)) pool = x.pool.filter(p => p && typeof p.t === 'string');
  else if (Array.isArray(x.statements) && x.statements.length === 4) {
    legacy = true;
    pool = x.statements.map((t, i) => ({ t, zh: (x.zh || [])[i], why: (x.why || [])[i], trap: (x.traps || [])[i] || '', ok: i === x.ans }));
  } else return null;
  const nOk = pool.filter(p => p.ok).length;
  if (nOk < 1 || pool.length - nOk < 3) return null;
  x._pool = pool; x._legacy = legacy; return x;
}
/* 抽 4 句：1 正確 + 3 錯誤，再打亂；回傳 pool 索引。舊格式維持原順序（可能搭配固定 mp3） */
function draw(x) {
  if (x._legacy) return [0, 1, 2, 3];
  const ok = [], bad = [];
  x._pool.forEach((p, i) => (p.ok ? ok : bad).push(i));
  return shuffle([ok[Math.floor(Math.random() * ok.length)], ...shuffle(bad).slice(0, 3)]);
}
/* 沒有存下當時選項時（舊紀錄）的預設：pool 前 4 句若恰有 1 個正確就用它，否則取 1 正確＋3 錯誤 */
function defShown(x) {
  const f = [0, 1, 2, 3];
  if (x._pool.length >= 4 && f.filter(i => x._pool[i].ok).length === 1) return f;
  const bad = []; x._pool.forEach((p, i) => { if (!p.ok && bad.length < 3) bad.push(i); });
  return [x._pool.findIndex(p => p.ok), ...bad];
}
const okShown = (x, sh) => Array.isArray(sh) && sh.length === 4 && sh.every(i => x._pool[i]) && sh.filter(i => x._pool[i].ok).length === 1;
const vw = (x, sh) => { sh = okShown(x, sh) ? sh : defShown(x); const s = sh.map(i => x._pool[i]); return { sh, s, ans: s.findIndex(p => p.ok) }; };
const shownOf = x => { const r = V.run; return r.shown[x.id] || (r.shown[x.id] = draw(x)); };

const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');
/* fd 難度、fm 主題 → 練習篩選；tt 難度、tm 主題 → 測驗篩選 */
let V = { rp: null, rf: null, rkf: null, view: 'home', pn: 6, fd: null, fm: null, tt: null, tm: null, run: null };

/* ---------- 音訊：優先 mp3，找不到就用瀏覽器語音合成念四句 ----------
   手機（尤其 iOS Safari）規定：語音合成必須在「點擊」當下啟動，不能等 mp3 載入失敗後才改用。
   所以每次按播放都先在點擊當下解鎖語音引擎；mp3 失敗過的檔案會記住，之後直接用語音。 */
const P = { au: null, tok: 0, playing: false, voice: null, started: false, hint: '', bad: {}, unlocked: false, wd: 0 };
const hasTTS = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
function pickVoice() {
  try { const vs = speechSynthesis.getVoices(); P.voice = vs.find(v => /^en[-_]US$/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null; } catch (e) {}
}
if (hasTTS()) { pickVoice(); try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) {} }
function unlockTTS() {
  if (P.unlocked || !hasTTS()) return; P.unlocked = true;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {}
}
function stopAudio() {
  auStop();
  P.tok++; P.playing = false; clearTimeout(P.wd);
  if (P.au) { P.au.onerror = P.au.onended = null; P.au.pause(); P.au = null; }
  try { speechSynthesis.cancel(); } catch (e) {}
}
function failPlay(x, tok, msg) {
  if (tok !== P.tok) return;
  stopAudio(); P.hint = msg;
  if (V.run && x) delete V.run.played[x.id]; // 沒播成功就不算用掉測驗的那一次
  paintAudio();
}
function ttsPlay(x, tok) {
  if (!hasTTS()) { failPlay(x, tok, '這個瀏覽器不支援語音合成，請改用 Chrome 或 Safari。'); return; }
  const parts = ['Number ' + (V.run ? V.run.i + 1 : x.no) + '.', ...vw(x, shownOf(x)).s.map((p, i) => L[i] + '. ' + p.t)];
  let i = 0; P.started = false; clearTimeout(P.wd);
  P.wd = setTimeout(() => { if (tok === P.tok && !P.started) failPlay(x, tok, '沒有聽到聲音？請確認手機音量與靜音開關；Android 請在系統設定安裝英文語音（Google 文字轉語音）。'); }, 4000);
  const next = () => {
    if (tok !== P.tok) return;
    if (i >= parts.length) { P.playing = false; paintAudio(); return; }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    u.lang = 'en-US'; u.rate = 0.9; if (P.voice) u.voice = P.voice;
    u.onstart = () => { P.started = true; };
    u.onend = () => setTimeout(next, i === 1 ? 600 : 1500);
    u.onerror = e => { if (tok !== P.tok || e.error === 'interrupted' || e.error === 'canceled') return; failPlay(x, tok, '語音播放失敗（' + (e.error || 'error') + '），請再按一次播放。'); };
    speechSynthesis.speak(u);
  };
  try { speechSynthesis.cancel(); setTimeout(next, 80); } // cancel 後稍等再 speak，避免部分瀏覽器吃掉第一句
  catch (e) { failPlay(x, tok, '語音合成啟動失敗，請再按一次播放。'); }
}
/* 整題 12 句 mp3 到齊（audio/index.json 判定）才走這裡：依抽到的順序播 A–D；中途失敗就從頭改用機器發音並記住這題 */
function mp3Play(x, tok) {
  const n = auNames('p1', x), sh = vw(x, shownOf(x)).sh, q = auSeq(sh.map(i => auSrc('p1', n.s[i])), 1500);
  auChain(q.srcs, q.gaps, () => tok === P.tok,
    () => { P.playing = false; paintAudio(); },
    () => { if (tok !== P.tok) return; auStop(); if (q.letters) { AU.noLet = true; mp3Play(x, tok); return; } AU.bad['p1' + x.id] = 1; ttsPlay(x, tok); }); // 字母檔壞了先改成只播句子，再壞才改機器發音
}
function playQ() {
  const r = V.run, x = cx();
  if (!x || P.playing || (r.mode === 'mock' && r.played[x.id])) return;
  r.played[x.id] = 1; stopAudio(); P.hint = '';
  unlockTTS(); // 必須在點擊當下同步執行
  const tok = ++P.tok; P.playing = true;
  if (!x._legacy && auFull('p1', x.id)) { mp3Play(x, tok); paintAudio(); return; }
  const src = x._legacy ? (x.audio || `audio/${x.id}.mp3`) : null; // pool 題目選項會隨機，不使用整題 mp3
  if (!src || P.bad[src]) { ttsPlay(x, tok); paintAudio(); return; }
  const au = new Audio(src); P.au = au; let fell = false;
  const fb = () => { if (fell || tok !== P.tok) return; fell = true; P.bad[src] = 1; P.au = null; ttsPlay(x, tok); };
  au.onended = () => { if (tok === P.tok) { P.playing = false; P.au = null; paintAudio(); } };
  au.onerror = fb;
  au.play().catch(e => { if (e.name !== 'AbortError') fb(); });
  paintAudio();
}
function audHtml() {
  const r = V.run, x = cx(); if (!x) return '';
  const mock = r.mode === 'mock', done = !!r.played[x.id];
  const hint = P.hint ? `<span class="text-xs text-rose-500 basis-full">${esc(P.hint)}</span>` : '';
  if (P.playing) return (mock ? `<button disabled class="${btn} ${pri}">🔊 播放中…</button>` : `<button onclick="stopAudio();paintAudio()" class="${btn} ${line}">⏹ 停止</button>`) + hint;
  if (mock && done) return `<button disabled class="${btn} ${pri}">已播放</button>`;
  const answered = r.sel[x.id] !== undefined; // 已作答：重播改次要樣式，讓「下一題」成為唯一主要按鈕
  return `<button onclick="playQ()" class="${btn} ${answered ? line : pri}">${done ? '🔁 重播' : '🔊 播放'}</button>` + hint;
}
function paintAudio() { const e = document.getElementById('aud'); if (e) e.innerHTML = audHtml(); }

/* ---------- 作答流程 ---------- */
const cx = () => V.run && find(V.run.ids[V.run.i]);
function startRun(ids, mode, key, cfg) {
  if (!ids.length) return;
  stopAudio(); P.hint = ''; V.run = { ids, mode, key, cfg, i: 0, sel: {}, played: {}, shown: {} }; V.view = 'run'; render(); window.scrollTo({ top: 0 });
}
const matches = () => pool(V.fd, V.fm);
function startPractice() {
  startRun(pickUnique(matches().map(x => x.id), V.pn), 'practice', 'practice');
}
const tcKey = () => (V.tt || 'all') + '|' + (V.tm || 'all');
function startTest() {
  const ids = pickUnique(pool(V.tt, V.tm).map(x => x.id), TESTN);
  startRun(ids, 'mock', 'test', tcKey());
}
function pick(oi) {
  const r = V.run, x = cx(); if (r.sel[x.id] !== undefined) return;
  const v = vw(x, shownOf(x));
  r.sel[x.id] = oi;
  const ok = oi === v.ans;
  R.rec[x.id] = { sel: oi, ok, trap: v.s[oi].trap || '', shown: v.sh };
  if (!ok) R.saved[x.id] = 1; else delete R.saved[x.id]; // 答錯加入錯題本；之後答對就自動移出
  saveR();
  if (r.mode === 'mock') nextQ(); else render();
}
function nextQ() {
  const r = V.run; stopAudio(); P.hint = '';
  if (r.i + 1 < r.ids.length) { r.i++; render(); window.scrollTo({ top: 0 }); playQ(); return; } // 換題後自動播放（沿用按「下一題」／選項的點擊手勢，手機也能播）
  const sc = score(), n = r.ids.length;
  if (r.key === 'test') { const o = R.tests[r.cfg] || {}, pct = Math.round(sc / n * 100); R.tests[r.cfg] = { best: Math.max(o.best || 0, pct), last: pct, n }; saveR(); }
  V.view = 'result'; render(); window.scrollTo({ top: 0 });
}
const score = () => V.run.ids.filter(id => V.run.sel[id] !== undefined && V.run.sel[id] === vw(find(id), V.run.shown[id]).ans).length;
function go(view) { stopAudio(); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const goHome = () => go('home');
const goBack = () => go(V.run && V.run.key === 'test' ? 'test' : V.run && V.run.key === 'book' ? 'book' : 'practice');
function quit() { if (V.run.mode === 'mock' && Object.keys(V.run.sel).length && !confirm('離開後這次測驗不會計分，確定離開？')) return; goBack(); }
function openBook() { go('book'); }
function openPractice() { go('practice'); }
function openTest() { go('test'); }
function unsave(id) { delete R.saved[id]; saveR(); render(); }
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }
function toggleDark() {
  S.dark = !S.dark;
  try { const c = JSON.parse(localStorage.getItem(KEY) || '{}'); c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  render();
}

/* ---------- 畫面 ---------- */
function hdr(title, back) {
  const b = back ? `<button onclick="${back}" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>` : `<a href="index.html" class="${btn} ${line} !py-1.5 shrink-0" aria-label="回到首頁">⌂</a>`;
  return `<header class="flex items-center justify-between gap-2 mb-5"><div class="flex items-center gap-2 min-w-0">${b}<h1 class="text-lg md:text-2xl font-bold truncate">${title}</h1></div>
    <button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button></header>`;
}
function fbtn(k, v, label, n) {
  const on = (V[k] || null) === v;
  return `<button onclick="setF('${k}',${v ? `'${v}'` : 'null'})" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${n === 0 ? ' opacity-40' : ''}">${label}${n == null ? '' : ` <span class="text-xs opacity-70">${n}</span>`}</button>`;
}
function imgH(x) {
  const src = esc(imgPath(x));
  return `<div class="rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 aspect-[4/3]"><img src="${src}" alt="" class="w-full h-full object-cover" onerror="this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden')"><div class="hidden w-full h-full flex items-center justify-center p-4 text-center text-xs text-slate-500">圖片尚未放入：${src}</div></div>`;
}
function metaH(x) {
  const t = tierOf(x), m = domOf(x), sc = x.level && x.level.score;
  return `<div class="flex flex-wrap gap-1.5 mt-4"><span class="${chip}">${TIER[t]}${sc ? ' · ' + sc : ''}</span>${m ? `<span class="${chip}">${esc(domLabel(m))}</span>` : ''}</div>`;
}
function revealH(x, sel, sh) {
  const v = vw(x, sh);
  const vocab = (x.vocab || []).map(w => `<span class="${chip}">${esc(w.word)} ${esc(w.zh)}</span>`).join(' ');
  const others = x._pool.filter((p, i) => p.ok && !v.sh.includes(i));
  return metaH(x) + `<div class="space-y-2 mt-3">${v.s.map((p, i) => {
    const good = i === v.ans, bad = i === sel && !good, t = TR[p.trap] || '';
    const c = good ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : bad ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50' : 'border-slate-200 dark:border-slate-800';
    return `<div class="rounded-lg border px-3 py-2 text-sm ${c}"><div class="flex justify-between gap-2"><span><b>${L[i]}.</b> ${esc(p.t)}</span>
      <span class="text-xs shrink-0 ${good ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${good ? '✓ 正解' : (bad ? '✗ 你選的 · ' : '') + esc(t)}</span></div>
      <p class="text-xs text-slate-500 mt-0.5">${esc(p.zh)}</p><p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc(p.why)}</p></div>`;
  }).join('')}</div>${others.length ? `<p class="text-xs text-slate-500 mt-3">這張圖其他也正確的說法：${others.map(p => esc(p.t)).join('　／　')}</p>` : ''}${vocab ? `<p class="mt-3 flex flex-wrap gap-1.5 items-center text-xs text-slate-500">重點單字：${vocab}</p>` : ''}`;
}
function runH() {
  const r = V.run, x = cx(), n = r.ids.length, sel = r.sel[x.id], ans = sel !== undefined, mock = r.mode === 'mock', sh = shownOf(x), v = vw(x, sh);
  let h = hdr(`${mock ? '測驗' : '練習'} · ${r.i + 1} / ${n}`, 'quit()');
  h += `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-4"><div class="h-1.5 rounded bg-indigo-600" style="width:${(r.i + (ans ? 1 : 0)) / n * 100}%"></div></div>`;
  const nextBtn = ans ? `<button onclick="nextQ()" class="${btn} ${pri}">${r.i + 1 < n ? '下一題 →' : '完成，看結果'}</button>` : '';
  h += imgH(x) + `<div class="flex items-center gap-3 my-4 flex-wrap"><span id="aud" class="flex items-center gap-2 flex-wrap">${audHtml()}</span>${nextBtn}<span class="text-xs text-slate-400">${mock ? '只播放一次' : '可重複播放'}</span><span class="ml-auto">${rpBtn(x.id)}</span></div>`;
  if (!ans) h += `<p class="text-xs text-slate-500 mb-2">聽四句敘述，選出最符合照片的一句（文字作答後才顯示）</p>`;
  h += `<div class="grid grid-cols-4 gap-2">${[0, 1, 2, 3].map(i => {
    let c = 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800';
    if (ans) c = i === v.ans ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700' : i === sel ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700' : 'opacity-40 border-slate-200 dark:border-slate-800';
    return `<button ${ans ? 'disabled' : `onclick="pick(${i})"`} class="rounded-lg border py-3 text-lg font-bold cursor-pointer ${c}">${L[i]}</button>`;
  }).join('')}</div>`;
  if (ans) h += revealH(x, sel, sh);
  return h;
}
function resultH() {
  const r = V.run, n = r.ids.length, sc = score(), test = r.key === 'test', prac = r.key === 'practice', book = r.key === 'book';
  let h = hdr('作答結果', 'goBack()');
  let sub = test ? '測驗成績' : '練習結果（不計入成績）';
  if (test) { const [t, m] = r.cfg.split('|'); sub += ` · ${TIER[t] || '不限難度'} · ${DOM[m] ? domLabel(m) : '不限主題'}`; }
  h += `<div class="${card} p-5 text-center mb-5"><p class="text-sm text-slate-500">${sub}</p>
    <p class="text-4xl font-bold mt-1 ${sc / n >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}">${sc} / ${n}</p>
    <div class="flex gap-2 justify-center mt-4"><button onclick="goBack()" class="${btn} ${line}">${test ? '回測驗選單' : book ? '回錯題本' : '回練習選單'}</button>
    ${test ? `<button onclick="startTest()" class="${btn} ${pri}">再測一次（重新抽題）</button>` : prac ? `<button onclick="startPractice()" class="${btn} ${pri}">再練一次（重新抽題）</button>` : ''}</div></div>`;
  r.ids.forEach((id, i) => {
    const x = find(id), s = r.sel[id], ok = s === vw(x, r.shown[id]).ans;
    h += `<div class="${card} p-4 mb-3"><p class="text-sm font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}">${ok ? '✓' : '✗'} Q${i + 1} · ${esc(x.tag)}</p><div class="max-w-xs mt-2">${imgH(x)}</div>${revealH(x, s, r.shown[id])}<div class="mt-3 text-right">${rpBtn(id)}</div></div>`;
  });
  return h;
}
function bookH() {
  const ids = Object.keys(R.saved).filter(find);
  let h = hdr('錯題本', 'goHome()');
  if (!ids.length) return h + `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`;
  h += `<button onclick="startRun(${JSON.stringify(ids).replace(/"/g, '&quot;')},'practice','book')" class="${btn} ${pri} w-full mb-4">重做這 ${ids.length} 題</button>`;
  ids.forEach(id => {
    const x = find(id);
    h += `<div class="${card} p-4 mb-3"><div class="flex justify-between items-center"><p class="text-sm font-bold">${esc(x.tag)}</p>
      <button onclick="unsave(this.dataset.id)" data-id="${esc(id)}" class="text-xs text-rose-500 hover:underline">移除</button></div>
      <div class="max-w-xs mt-2">${imgH(x)}</div>${revealH(x, (R.rec[id] || {}).sel, (R.rec[id] || {}).shown)}<div class="mt-3 text-right">${rpBtn(id)}</div></div>`;
  });
  return h;
}
/* 首頁：練習／測驗 */
function homeH() {
  let h = hdr('Part 1 照片描述');
  if (!DATA.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">part1.json 還沒有題目。請把 AI 生成的題目貼進 items。<br><button onclick="openAdmin()" class="${btn} ${line} mt-4">🛠 維護</button></div>`;
  const nSaved = Object.keys(R.saved).filter(find).length;
  h += `<div class="grid gap-3 md:grid-cols-2 mb-4">
    <button onclick="openPractice()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📖 練習</p>
      <p class="text-sm text-slate-500 mt-2">依難度、主題隨機抽題，不計分。作答後立即看解析，可重複播放音檔。</p></button>
    <button onclick="openTest()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📝 測驗</p>
      <p class="text-sm text-slate-500 mt-2">先選難度（初／中／高），主題（D1–D7）可選可不選，隨機抽 ${TESTN} 題。音檔只播一次，完成後才檢討。</p></button></div>
    <div class="grid grid-cols-3 gap-3"><button onclick="openBook()" class="${btn} ${line}">★ 錯題本 ${nSaved}</button><button onclick="go('reports')" class="${btn} ${line}">⚑ 提報${openRpN() ? ' ' + openRpN() : ''}</button><button onclick="openAdmin()" class="${btn} ${line}">🛠 維護</button></div>`;
  const cnt = {};
  Object.values(R.rec).forEach(r => { if (!r.ok && TR[r.trap]) cnt[r.trap] = (cnt[r.trap] || 0) + 1; });
  const top3 = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  if (top3.length) h += `<h2 class="font-bold mt-8 mb-2">你常中的陷阱（依最近一次作答）</h2><div class="flex flex-wrap gap-2">${top3.map(([k, v]) => `<span class="${chip}">${TR[k]} × ${v}</span>`).join('')}</div>`;
  return h;
}
/* 練習：與測驗相同的選題方式，但不計分 */
function practiceH() {
  let h = hdr('練習', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">跟測驗一樣依條件隨機抽題，但不計分、不留最佳紀錄。音檔可重複播放，每題作答後立即看解析；答錯的題會放進錯題本。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('fd', null, '不限難度', pool(null, V.fm).length)}${Object.keys(TIER).map(k => fbtn('fd', k, TIER[k], pool(k, V.fm).length)).join('')}</div>
    <p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-5">${fbtn('fm', null, '不限主題', pool(V.fd, null).length)}${Object.keys(DOM).map(k => fbtn('fm', k, domLabel(k), pool(V.fd, k).length)).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">3. 題數</h2><div class="flex flex-wrap gap-2 mb-5">${[[6, '6 題'], [12, '12 題'], [0, '全部']].map(([v, l]) => `<button onclick="V.pn=${v};render()" class="${btn} !py-1.5 ${V.pn === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div>`;
  const m = matches(), u = uniqN(m), n = V.pn ? Math.min(u, V.pn) : u;
  h += `<button onclick="startPractice()" ${m.length ? '' : 'disabled'} class="${btn} ${pri} w-full">開始練習（${n} 題）</button>`;
  if (!m.length) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`;
  else if (V.pn && u < V.pn) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${u} 題（同一輪不重複圖片），將全部出題。</p>`;
  return h;
}
/* 測驗：選難度 → 選主題 → 開始 */
function testH() {
  let h = hdr('測驗', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件從題庫隨機抽 ${TESTN} 題。音檔只播放一次，作答中不顯示對錯，完成後一次檢討。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tt', null, '不限難度', pool(null, V.tm).length)}${Object.keys(TIER).map(k => fbtn('tt', k, TIER[k], pool(k, V.tm).length)).join('')}</div>
    <p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tm', null, '不限主題', pool(V.tt, null).length)}${Object.keys(DOM).map(k => fbtn('tm', k, domLabel(k), pool(V.tt, k).length)).join('')}</div>
    <p class="text-xs text-slate-400 mb-5">${V.tm ? '只從「' + domLabel(V.tm) + '」抽題；再點一次可取消。' : '不限主題：依上面選的難度，從所有主題隨機抽題。'}</p>`;
  const n = uniqN(pool(V.tt, V.tm)), o = R.tests[tcKey()];
  h += `<button onclick="startTest()" ${n ? '' : 'disabled'} class="${btn} ${pri} w-full">開始測驗（${Math.min(n, TESTN)} 題）</button>`;
  if (!n) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`;
  else if (n < TESTN) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${n} 題，將全部出題。</p>`;
  if (o) h += `<p class="text-xs text-slate-500 mt-3">這個組合的紀錄：最佳 ${o.best}% · 最近一次 ${o.last}%</p>`;
  return h;
}
/* ---------- 維護頁：題數矩陣 → 該格的題目（每題一張圖）→ 圖片與答案；新增題目 ---------- */
const TS = { easy: 'e', medium: 'm', hard: 'h' };
const TARGET = 2; // 每格（難度 × 主題）至少題數，與 part1.json 的 _spec.coverage 一致
let SPEC = null;  // part1.json 的 _spec（loadText 讀入），用來帶入各難度的 guide
/* 各難度的多益分數範圍：以 part1.json 的 _spec.tiers.*.score 為準，讀不到時用預設 */
const TSC_DEF = { easy: '500–550', medium: '600–650', hard: '700–800' };
const tScore = k => (SPEC && SPEC.tiers && SPEC.tiers[k] && SPEC.tiers[k].score) || TSC_DEF[k];
const tierHint = () => Object.keys(TIER).map(k => `${TIER[k]} ${tScore(k)}`).join('；') + '（多益預估分數）';
const SCORE_RG = { easy: [500, 550], medium: [600, 650], hard: [700, 800] };
const A = { d: null, t: null, k: null, nd: null, nt: null, sd: null, out: [] }; // 維護頁狀態
const goAdmin = () => goA('admin');
function goA(view, p) { stopAudio(); Object.assign(A, p || {}); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const openAdmin = goAdmin;
const adminCell = (d, t) => goA('adminCell', { d, t });
const adminItem = k => goA('adminItem', { k });
const adminNew = (d, t) => goA('adminNew', { nd: d || null, nt: t || null, sd: null, out: [], oid: null });
function adminPick(k, v) { A[k] = v; A.sd = null; A.oid = null; render(); }
const adminOrph = id => { const m = /^(d\d+)-\d+-([emh])$/.exec(id), t = m && Object.keys(TS).find(k => TS[k] === m[2]); if (t) goA('adminNew', { nd: m[1], nt: t, sd: null, out: [], oid: id }); };
const rerollSeed = () => { A.sd = (A.sd == null ? 0 : A.sd) + 1; render(); };
const SK = { easy: ['single'], medium: ['multi'], hard: ['multi', 'none'] }; // 難度 → 出圖情境（seeds）來源；只影響出圖 prompt 的情境，不限制 AI 寫文本與圖片人數
/* 從該主題的 seeds 挑一個情境；避開已出現在既有題目 image_prompt 的情境；A.sd 固定住，按「換情境」才變 */
function pickSeed(d, t) {
  const sd = DOM[d].seeds && [].concat(...SK[t].map(k => DOM[d].seeds[k] || [])); if (!sd || !sd.length) return null;
  const used = DATA.map(x => String(x.image_prompt || '').toLowerCase());
  let ls = sd.filter(s => !used.some(u => u.includes(s.toLowerCase()))); if (!ls.length) ls = sd;
  if (A.sd == null) A.sd = Math.floor(Math.random() * 1000);
  return ls[A.sd % ls.length];
}
const inCell = (d, t) => DATA.filter(x => domOf(x) === d && (!t || tierOf(x) === t)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
/* 流水號：同一「主題＋難度」內最大編號 + 1（d1-001-e、d1-001-m、d1-001-h 是三張不同的圖） */
function nextCode(d, t) {
  if (A.oid && A.oid.startsWith(d + '-') && A.oid.endsWith('-' + TS[t])) return A.oid.slice(0, -2); // 從「待寫文本圖片」進來
  const op = orphIn(d, t); if (op.length) return op[0].slice(0, -2);                                  // 該格已有圖片但還沒題目：沿用它
  let mx = 0; DATA.forEach(x => { const m = /^d(\d+)-(\d+)/.exec(x.id); if (m && 'd' + m[1] === d && tierOf(x) === t) mx = Math.max(mx, +m[2]); });
  return d + '-' + String(mx + 1).padStart(3, '0');
}
const tcol = n => n >= TARGET ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : n ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400';

/* ---------- 資料健檢（auditAll）＋圖片檢查（checkImages）---------- */
/* 規則來自 part1.json 的 _spec.rules.self_check 與 json_merge.py 的 validate()；只讀取、不修改資料。
   ✖ 錯誤＝會讓題目壞掉或被略過；⚠ 提醒＝不符規格但仍可作答；ℹ 備註＝題目自己寫的 issues。 */
const ID_RE = /^d([1-7])-(\d{3})-([emh])$/, SUF = { e: 'easy', m: 'medium', h: 'hard' };
const OLD_F = ['set', 'no', 'ans', 'statements', 'zh', 'why', 'traps', 'audio'];
const nrm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const nWords = s => (String(s).match(/[A-Za-z0-9']+/g) || []).length;
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let RAW = [];                                                     // part1.json 原始 items（含被略過的）
let HEALTH = { list: [], err: 0, warn: 0, info: 0, dropped: 0 };  // 健檢結果
const IMG = { st: {}, tok: 0, running: false, total: 0, n: 0 };   // 圖片檢查：st[id] = 'ok' | 'missing'

function auditAll(raw) {
  const list = [], add = (id, lv, msg) => list.push({ id, lv, msg });
  const scenesOf = k => (DOM[k] && DOM[k].scenes) || [];
  const idCount = {}, own = { tag: {}, vocab: {}, img: {}, sent: {} };
  let dropped = 0;
  raw.forEach((x, i) => {
    if (!x || typeof x !== 'object') { dropped++; add('第 ' + (i + 1) + ' 筆', 'err', '不是物件，已被略過'); return; }
    const id = x.id ? String(x.id) : '第 ' + (i + 1) + ' 筆（無 id）';
    /* 1. 被 normItem 丟掉的題目：不會出現在練習／測驗／矩陣 */
    if (!x._pool) {
      dropped++;
      add(id, 'err', !x.id ? '缺少 id，已被略過' : !Array.isArray(x.pool) && !Array.isArray(x.statements)
        ? '缺少 pool（也不是舊格式 statements），已被略過，不會出現在練習／測驗'
        : 'pool 至少要 1 句正確、3 句錯誤（舊格式需 4 句），已被略過，不會出現在練習／測驗');
      return;
    }
    /* 2. id／主題／難度 */
    idCount[id] = (idCount[id] || 0) + 1;
    if (idCount[id] > 1) add(id, 'err', 'id 重複：「看題目」只會開到第一筆，錯題本與紀錄也會混在一起');
    const m = ID_RE.exec(id), lv = x.level || {}, sc = lv.score, tier = tierOf(x);
    if (!m) add(id, 'err', 'id 格式應為 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-m');
    else {
      const dom = 'd' + m[1];
      if (x.domain !== dom) add(id, 'err', `domain 應為 ${dom}（要等於 id 前段），目前是 ${x.domain}`);
      if (lv.tier !== SUF[m[3]]) add(id, 'err', `level.tier 必須等於 id 尾碼（${m[3]} → ${SUF[m[3]]}），目前是 ${lv.tier}`);
      if (DOM[dom] && !scenesOf(dom).includes(x.scene)) add(id, 'err', `scene「${x.scene}」不屬於 ${dom}（可用：${scenesOf(dom).join('、')}）`);
    }
    if (!domOf(x)) add(id, 'err', '不屬於任何主題，不會出現在維護矩陣，也抽不到');
    if (typeof sc !== 'number') add(id, 'err', 'level.score 必須是數字');
    else {
      if (sc % 50) add(id, 'warn', 'level.score 建議為 50 的倍數');
      const ex = sc <= 550 ? 'easy' : sc <= 650 ? 'medium' : 'hard';
      if (lv.tier && lv.tier !== ex) add(id, 'err', `level.score ${sc} 對應${TIER[ex]}，與 tier「${TIER[lv.tier] || lv.tier}」不一致`);
      else if (SCORE_RG[tier] && (sc < SCORE_RG[tier][0] || sc > SCORE_RG[tier][1])) add(id, 'err', `level.score ${sc} 不在${TIER[tier]}的範圍 ${tScore(tier)}`);
    }
    if (!lv.cefr || !lv.why) add(id, 'warn', 'level.cefr 或 level.why 是空的');
    if (!String(x.tag || '').trim()) add(id, 'err', '缺少 tag');
    else if (own.tag[x.tag] && own.tag[x.tag] !== id) add(id, 'warn', `tag「${x.tag}」與 ${own.tag[x.tag]} 相同`);
    else own.tag[x.tag] = id;
    /* 3. 圖片路徑：一題一張圖，images/{id}.jpg */
    const ip = imgPath(x);
    if (!x.image) add(id, 'warn', `沒有 image 欄位，網頁改用 ${ip}`);
    else if (x.image !== `images/${id}.jpg`) add(id, 'warn', `image 建議為 images/${id}.jpg（目前 ${x.image}）`);
    if (own.img[ip] && own.img[ip] !== id) add(id, 'warn', `與 ${own.img[ip]} 共用同一張圖片（${ip}）；每題應各有獨立的圖，測驗同一輪也只會抽到其中一題`);
    else own.img[ip] = id;
    /* 4. pool（12 句：3 正確＋9 錯誤） */
    if (x._legacy) add(id, 'warn', '舊格式（statements 4 句）：不會洗牌，也沒有 12 句句子庫，建議改為 pool');
    else {
      const pl = x.pool, okN = pl.filter(p => p && p.ok === true).length, seenT = {}, kinds = new Set(), badLen = [], dupS = new Set();
      if (pl.length !== 12) add(id, 'err', `pool 必須剛好 12 句（目前 ${pl.length}）`);
      if (okN !== 3) add(id, 'err', `pool 必須 3 句正確、9 句錯誤（目前正確 ${okN} 句）`);
      pl.forEach((p, k) => {
        const n = k + 1;
        if (!p || typeof p.t !== 'string' || typeof p.ok !== 'boolean') { add(id, 'err', `pool 第 ${n} 句格式不對（需要 t 與 ok:true／false）`); return; }
        const key = nrm(p.t);
        if (seenT[key]) add(id, 'err', `pool 第 ${n} 句與第 ${seenT[key]} 句重複`); else seenT[key] = n;
        if (own.sent[key] && own.sent[key] !== id) dupS.add(own.sent[key]); else own.sent[key] = id;
        const w = nWords(p.t); if (w < 6 || w > 14) badLen.push(`第 ${n} 句 ${w} 字`);
        if (p.ok) {
          if (p.trap !== 'correct') add(id, 'err', `pool 第 ${n} 句 ok:true，trap 應為 'correct'（目前 ${p.trap}）`);
          if (!String(p.why || '').startsWith('正解：')) add(id, 'warn', `pool 第 ${n} 句（正解）的 why 建議以「正解：」開頭`);
        } else if (!TR[p.trap]) add(id, 'err', `pool 第 ${n} 句 trap 不合法：${p.trap}`);
        else kinds.add(p.trap);
        if (!String(p.zh || '').trim() || !String(p.why || '').trim()) add(id, 'warn', `pool 第 ${n} 句缺少 zh 或 why`);
      });
      if (badLen.length) add(id, 'warn', `句子字數不在 6–14：${badLen.join('、')}`);
      if (dupS.size) add(id, 'warn', `有句子與既有題目重複：${[...dupS].join('、')}`);
      if (kinds.size < 4) add(id, 'warn', `錯誤句只涵蓋 ${kinds.size} 種 trap 類型（建議盡量涵蓋 5 種）`);
      const old = OLD_F.filter(k => k in x); if (old.length) add(id, 'warn', `含舊欄位（網頁不使用）：${old.join('、')}`);
    }
    /* 5. vocab */
    const vc = Array.isArray(x.vocab) ? x.vocab : [];
    if (!vc.length) add(id, 'err', '缺少 vocab');
    else {
      if (vc.length < 2 || vc.length > 4) add(id, 'warn', `vocab 有 ${vc.length} 個（建議 2–4 個）`);
      const blob = x._pool.map(p => nrm(p.t)).join(' ');
      vc.forEach((v, k) => {
        const miss = ['word', 'ipa', 'pos', 'col', 'zh'].filter(f => !v || !String(v[f] || '').trim());
        if (miss.length) { add(id, 'err', `vocab 第 ${k + 1} 項缺少：${miss.join('、')}`); return; }
        const w = nrm(v.word), stem = w.includes(' ') ? w : w.replace(/e$/, '');
        if (!new RegExp('\\b' + escRe(stem)).test(blob)) add(id, 'warn', `單字「${v.word}」沒有出現在 pool 的句子中`);
        if (own.vocab[w] && own.vocab[w] !== id) add(id, 'warn', `單字「${v.word}」與 ${own.vocab[w]} 重複`); else own.vocab[w] = id;
      });
    }
    /* 6. issues（圖片備註） */
    if (!('issues' in x)) add(id, 'warn', '沒有 issues 欄位（無瑕疵請填 []）');
    else if (Array.isArray(x.issues) && x.issues.length) add(id, 'info', '圖片備註：' + x.issues.join('；'));
  });
  const c = lv => list.filter(h => h.lv === lv).length;
  return { list, err: c('err'), warn: c('warn'), info: c('info'), dropped };
}
const hItems = id => (HEALTH.list || []).filter(h => h.id === id);

/* 逐張預載圖片，確認 images/{id}.jpg 真的存在（瀏覽器讀不到資料夾清單，所以只能「題目→圖片」單向檢查） */
function checkImages(bust) {
  const tok = ++IMG.tok; IMG.st = {}; IMG.n = 0; IMG.total = DATA.length; IMG.running = DATA.length > 0;
  const fin = () => { if (tok !== IMG.tok || ++IMG.n < IMG.total) return; IMG.running = false; if (V.view === 'admin' || V.view === 'adminCell') render(); };
  const q = bust && /^https?:$/.test(location.protocol) ? '?v=' + Date.now() : ''; // 重新檢查時避開快取
  DATA.forEach(x => { const im = new Image(); im.onload = () => { if (tok === IMG.tok) { IMG.st[x.id] = 'ok'; fin(); } }; im.onerror = () => { if (tok === IMG.tok) { IMG.st[x.id] = 'missing'; fin(); } }; im.src = imgPath(x) + q; });
}
/* 反向檢查：瀏覽器讀不到資料夾清單，但檔名有固定規則（d{N}-{NNN}-{e|m|h}.jpg），
   所以每格從 001 試探到「現有最大編號 + 6」，找出「圖片已放好、但 part1.json 還沒有題目」的圖。 */
const ORPH = { found: [], tok: 0, running: false };
const orphIn = (d, t) => ORPH.found.filter(id => id.startsWith(d + '-') && id.endsWith('-' + TS[t]));
function checkOrphans(bust) {
  const tok = ++ORPH.tok, have = new Set(DATA.map(x => x.id)), cand = [];
  const q = bust && /^https?:$/.test(location.protocol) ? '?v=' + Date.now() : '';
  Object.keys(DOM).forEach(d => Object.keys(TS).forEach(t => {
    let mx = 0; DATA.forEach(x => { const m = /^d(\d+)-(\d+)/.exec(x.id); if (m && 'd' + m[1] === d && tierOf(x) === t) mx = Math.max(mx, +m[2]); });
    for (let i = 1; i <= mx + 6; i++) { const id = d + '-' + String(i).padStart(3, '0') + '-' + TS[t]; if (!have.has(id)) cand.push(id); }
  }));
  ORPH.found = []; ORPH.running = cand.length > 0; let n = 0;
  const fin = () => { if (tok !== ORPH.tok || ++n < cand.length) return; ORPH.running = false; ORPH.found.sort(); if (['admin', 'adminCell', 'adminNew'].includes(V.view)) render(); };
  cand.forEach(id => { const im = new Image(); im.onload = () => { if (tok === ORPH.tok) { ORPH.found.push(id); fin(); } }; im.onerror = () => { if (tok === ORPH.tok) fin(); }; im.src = 'images/' + id + '.jpg' + q; });
}
const recheckImages = () => { checkImages(true); checkOrphans(true); render(); };
function orphanH() {
  if (!ORPH.found.length) return '';
  return `<div class="${card} p-4 mb-4 !border-sky-300 dark:!border-sky-800"><p class="text-sm font-bold text-sky-700 dark:text-sky-300">🖼 有 ${ORPH.found.length} 張圖片還沒有題目</p>`
    + `<p class="text-xs text-slate-500 mt-1">圖片已經放在 images 資料夾，但 part1.json 還沒有對應的題目，所以不會算進下面的格子。若已經請 AI 寫好文本，請把 AI 給你的 <b>檔名.json</b> 放到 json_merge.py 同一個資料夾合併，再重新整理本頁；還沒寫的，按下面的按鈕取得「寫文本」指令。</p>`
    + `<div class="flex flex-wrap gap-2 mt-2">${ORPH.found.map(id => `<button onclick="adminOrph('${id}')" class="${btn} ${line} !py-1 text-xs">${esc(id)} → 取得寫文本指令</button>`).join('')}</div></div>`;
}
const missImgs = () => DATA.filter(x => IMG.st[x.id] === 'missing');

/* 某「主題 × 難度」格子：題數、不重複圖片數、缺圖數（達標以不重複圖片數計，因為測驗同一輪不會出現同一張圖） */
/* ---------- 缺音檔提示：以 audio/index.json 為準；整題 12 句沒到齊＝缺音檔（該題改用機器發音，仍可作答）。舊格式（statements）不用句子音檔，不算 ---------- */
const auNeed = x => !x._legacy;
const auHas = x => !!(AU.idx && AU.idx.p1 && (AU.idx.p1.complete || []).includes(x.id));
const auMissing = x => auNeed(x) && !auHas(x);
const missAud = () => DATA.filter(auMissing);
/* 某題缺的音檔：[{name, text}]（只含缺的；partial 清單有列出缺哪幾句，沒列＝全缺） */
function auMissRows(x) {
  if (!auMissing(x)) return [];
  const n = auNames('p1', x), I = (AU.idx && AU.idx.p1) || {}, ms = (I.partial || {})[x.id];
  return x._pool.map((p, i) => ({ name: n.s[i], text: p.t })).filter(r => !ms || ms.includes(r.name));
}
async function recheckAudio() { await auLoad(); render(); }
function clipText(t, bid) {
  const done = () => { const b = document.getElementById(bid); if (b) { b.dataset.l = b.dataset.l || b.textContent; b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = b.dataset.l || '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb); else fb();
}
function copyCellMiss(d, t) { clipText(inCell(d, t).flatMap(auMissRows).map(r => r.name + '.mp3 | ' + r.text).join('\n'), 'cm'); }
function cellStat(d, t) {
  const xs = DATA.filter(x => domOf(x) === d && tierOf(x) === t);
  return { n: xs.length, img: uniqN(xs), miss: xs.filter(x => IMG.st[x.id] === 'missing').length, aud: xs.filter(auMissing).length, orph: orphIn(d, t).length };
}

const HL = { err: ['✖', 'text-rose-600 dark:text-rose-400'], warn: ['⚠', 'text-amber-600 dark:text-amber-400'], info: ['ℹ', 'text-slate-500'] };
const idBtn = id => find(id) ? `<button onclick="adminItem(this.dataset.k)" data-k="${esc(id)}" class="font-bold underline decoration-dotted cursor-pointer">${esc(id)}</button>` : `<b>${esc(id)}</b>`;
function imgStatusH() {
  const N = DATA.length, miss = missImgs().length, ok = DATA.filter(x => IMG.st[x.id] === 'ok').length;
  const s = !N ? '' : IMG.running ? '<span class="text-slate-500">檢查圖片檔中…</span>'
    : miss ? `<span class="text-rose-600 dark:text-rose-400">✖ 缺 <b>${miss}</b> 張（已找到 ${ok} / ${N}）</span>`
      : `<span class="text-emerald-600 dark:text-emerald-400">✔ ${ok} 張圖片檔都找到了</span>`;
  return `<span class="flex items-center gap-2">${s}${N ? `<button onclick="recheckImages()" class="${btn} ${line} !py-0.5 !px-2 text-xs">重新檢查</button>` : ''}</span>`;
}
function audioStatusH() {
  const N = DATA.filter(auNeed).length, miss = missAud().length, ok = N - miss;
  const s = !N ? '' : !AU.idx ? '<span class="text-rose-600 dark:text-rose-400">✖ 尚未讀到 audio/index.json（全部用機器發音）</span>'
    : miss ? `<span class="text-rose-600 dark:text-rose-400">✖ 缺 <b>${miss}</b> 題（有 mp3：${ok} / ${N}；缺的整題改用機器發音）</span>`
      : `<span class="text-emerald-600 dark:text-emerald-400">✔ ${ok} 題都有 mp3</span>`;
  return `<span class="flex items-center gap-2">${s}${N ? `<button onclick="recheckAudio()" class="${btn} ${line} !py-0.5 !px-2 text-xs">重新檢查</button>` : ''}</span>`;
}
function healthH() {
  const H = HEALTH, miss = missImgs(), clean = !H.err && !H.warn && !H.info && !miss.length;
  const chips = [H.err ? `<span class="${HL.err[1]}">✖ 錯誤 <b>${H.err}</b></span>` : '', miss.length ? `<span class="${HL.err[1]}">🖼 缺圖 <b>${miss.length}</b></span>` : '',
    H.warn ? `<span class="${HL.warn[1]}">⚠ 提醒 <b>${H.warn}</b></span>` : '', H.info ? `<span class="${HL.info[1]}">ℹ 備註 <b>${H.info}</b></span>` : ''].filter(Boolean).join('');
  let h = `<div class="${card} p-4 mb-4"><div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><b>資料健檢</b>${clean ? '<span class="text-emerald-600 dark:text-emerald-400">✔ 全部通過</span>' : chips}</div>`;
  if (miss.length) h += `<p class="text-xs mt-2 ${HL.err[1]}">找不到圖片檔（請放進 images 資料夾，檔名要與 image 欄位一致）：${miss.map(x => idBtn(x.id)).join('、')}</p>`;
  if (H.list.length) {
    const g = {}, order = []; H.list.forEach(it => { if (!g[it.id]) { g[it.id] = []; order.push(it.id); } g[it.id].push(it); });
    h += `<details class="mt-2" ${H.err ? 'open' : ''}><summary class="text-xs cursor-pointer text-slate-500">查看明細（${order.length} 題有項目）</summary><div class="max-h-96 overflow-auto">`
      + order.map(id => `<div class="mt-2"><p class="text-xs">${idBtn(id)}</p><ul class="text-xs space-y-0.5 mt-0.5">${g[id].map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`).join('') + '</div></details>';
  }
  return h + '</div>';
}

function adminH() {
  const doms = Object.keys(DOM), tiers = Object.keys(TIER), N = DATA.length, M = uniqN(DATA);
  let low = 0; doms.forEach(d => tiers.forEach(t => { if (cellStat(d, t).img < TARGET) low++; }));
  let h = hdr('維護', 'backAdmin()');
  h += `<div class="${card} p-4 mb-4 text-sm"><div class="flex flex-wrap gap-x-6 gap-y-1"><span>題目 <b>${N}</b> 題${HEALTH.dropped ? ` <span class="${HL.err[1]}">（另有 ${HEALTH.dropped} 筆格式不合被略過）</span>` : ''}</span>`
    + `<span>圖片 <b>${M}</b> 張${M !== N ? ` <span class="${HL.warn[1]}">⚠ 與題數不符：有題目共用同一張圖</span>` : ''}</span>`
    + `<span>音檔 <b>${DATA.filter(x => auNeed(x) && auHas(x)).length}</b> 題</span>`
    + `<span class="text-slate-500">未達標格子 <b>${low}</b> / ${doms.length * tiers.length}（目標每格 ≥ ${TARGET} 張圖）</span></div>`
    + `<div class="flex flex-wrap items-center gap-2 mt-2 text-xs"><span class="text-slate-500">圖片檔：</span>${imgStatusH()}</div>`
    + `<div class="flex flex-wrap items-center gap-2 mt-2 text-xs"><span class="text-slate-500">音檔：</span>${audioStatusH()}</div></div>`;
  h += healthH();
  h += orphanH();
  h += `<div class="overflow-x-auto mb-3"><div class="grid gap-1.5 text-center text-sm min-w-[32rem]" style="grid-template-columns:4.5rem repeat(${doms.length},minmax(3rem,1fr))"><div></div>${doms.map(d => `<button onclick="adminCell('${d}',null)" class="text-xs font-bold py-1 cursor-pointer hover:text-indigo-600">${d.toUpperCase()}<br><span class="font-normal text-slate-500">${esc(DOM[d].n)}</span></button>`).join('')}`;
  tiers.forEach(t => {
    h += `<div class="text-left self-center text-xs font-bold">${TIER[t]} ${TS[t]}<span class="block font-normal text-slate-500">${tScore(t)}</span></div>` + doms.map(d => {
      const s = cellStat(d, t);
      return `<button onclick="adminCell('${d}','${t}')" class="rounded-lg py-3 font-bold cursor-pointer ${tcol(s.img)}">${s.img}`
        + (s.n !== s.img ? `<span class="block text-[10px] font-normal">${s.n} 題</span>` : '')
        + (s.miss ? `<span class="block text-[10px] font-normal text-rose-600 dark:text-rose-400">缺圖 ${s.miss}</span>` : '')
        + (s.aud ? `<span class="block text-[10px] font-normal text-rose-600 dark:text-rose-400">缺音檔 ${s.aud}</span>` : '')
        + (s.orph ? `<span class="block text-[10px] font-normal text-sky-600 dark:text-sky-400">有圖待寫 ${s.orph}</span>` : '') + '</button>';
    }).join('');
  });
  h += `</div></div><p class="text-xs text-slate-400 mb-5">格子＝該難度、該主題的「不重複圖片數」（正常情況＝題數）。紅＝0、黃＝未達 ${TARGET}、綠＝達標；格內小字：題數與圖片數不同、有圖片檔找不到、缺音檔的題數（缺的整題用機器發音，仍可作答），或（藍字）圖片已放好但還沒有題目。點格子看該格的圖片與題目；點上方 D1–D7 看該主題全部難度。</p>`;
  h += `<button onclick="go('reports')" class="${btn} ${line} w-full mb-3">⚑ 提報彙整${openRpN() ? `（待處理 ${openRpN()}）` : ''}</button>`;
  return h + `<button onclick="adminNew()" class="${btn} ${pri} w-full">＋ 新增題目</button>`;
}

function adminCellH() {
  const d = A.d, t = A.t, xs = inCell(d, t), nm = domLabel(d) + (t ? ' · ' + TIER[t] : '');
  let h = hdr(nm, 'goAdmin()');
  h += `<button onclick="adminNew('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${pri} w-full mb-3">＋ 新增 ${esc(nm.replace(' · ', ' '))} 題目</button>`;
  { const nm_ = xs.filter(auMissing).length; h += `<button id="cm" ${nm_ ? '' : 'disabled'} onclick="copyCellMiss('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${line} w-full mb-4">複製本格缺的音檔清單（${nm_}）</button>`; }
  if (!xs.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有圖片（0 題）。<br><span class="text-xs text-slate-400">點上方「＋ 新增」開始建立。</span></div>`;
  return h + xs.map(x => {
    const k = tierOf(x), sc = x.level && x.level.score;
    const nh = hItems(x.id).filter(h => h.lv !== 'info').length;
    const badge = (IMG.st[x.id] === 'missing' ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">缺圖</span>` : '')
      + (auMissing(x) ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">缺音檔</span>` : '')
      + (nh ? `<span class="${chip} !bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300">⚠ ${nh}</span>` : '')
      + (openRpN(x.id) ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">⚑ 提報 ${openRpN(x.id)}</span>` : '');
    return `<div class="${card} p-3 mb-3 flex gap-3"><button onclick="adminItem(this.dataset.k)" data-k="${esc(x.id)}" class="w-28 shrink-0 cursor-pointer text-left">${imgH(x)}</button>
      <div class="min-w-0 flex-1"><p class="font-bold text-sm">${esc(x.id)}</p><p class="text-xs text-slate-500 truncate">${esc(x.tag)}</p>
      <div class="flex flex-wrap gap-1 mt-2">${badge}<span class="${chip}">${TIER[k]}${sc ? ' · ' + sc : ''}</span></div>
      <button onclick="adminItem(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1 text-xs mt-2">看題目與答案</button></div></div>`;
  }).join('');
}

const poolRowH = p => `<div class="rounded-lg border px-3 py-2 text-sm ${p.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-800'}"><div class="flex justify-between gap-2"><span>${esc(p.t)}</span><span class="text-xs shrink-0 ${p.ok ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${p.ok ? '✓ 正解' : esc(TR[p.trap] || '')}</span></div><p class="text-xs text-slate-500 mt-0.5">${esc(p.zh)}</p><p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc(p.why)}</p></div>`;
function adminItemH() {
  const x = find(A.k);
  if (!x) return hdr('維護', 'goAdmin()') + `<p class="text-sm text-slate-400 text-center py-8">找不到這一題。</p>`;
  const d = domOf(x), t = tierOf(x), sc = x.level && x.level.score;
  const facts = (x.visible_facts || []).map(s => `<li>${esc(s)}</li>`).join('');
  const vocab = (x.vocab || []).map(w => `<span class="${chip}">${esc(w.word)} ${esc(w.zh)}</span>`).join(' ');
  let h = hdr(x.id, d ? `adminCell('${d}','${t}')` : 'goAdmin()');
  h += `<div class="max-w-md">${imgH(x)}</div><p class="text-sm font-bold mt-3">${esc(x.tag)}</p>
    <div class="flex flex-wrap gap-1.5 mt-2"><span class="${chip}">${TIER[t]}${sc ? ' · ' + sc : ''}</span>${d ? `<span class="${chip}">${esc(domLabel(d))}</span>` : ''}<span class="${chip}">${esc(imgPath(x))}</span></div>`;
  if (x.level && x.level.why) h += `<p class="text-xs text-slate-500 mt-2">${esc(x.level.why)}</p>`;
  if (facts) h += `<p class="text-xs font-bold mt-3">圖中事實（visible_facts）</p><ul class="text-xs text-slate-500 list-disc pl-5 mt-1">${facts}</ul>`;
  if (x.image_prompt) h += `<details class="mt-3 text-xs text-slate-500"><summary class="cursor-pointer">出圖 prompt</summary><p class="mt-1 select-all">${esc(x.image_prompt)}</p></details>`;
  h += `<p class="text-xs font-bold mt-5 mb-2">題庫 12 句（網頁每次作答隨機抽 1 正確＋3 錯誤）</p><div class="space-y-1.5">${[...x._pool].sort((a, b) => (b.ok ? 1 : 0) - (a.ok ? 1 : 0)).map(poolRowH).join('')}</div>`;
  if (vocab) h += `<p class="mt-3 flex flex-wrap gap-1.5 items-center text-xs text-slate-500">單字：${vocab}</p>`;
  h += auPanel('p1', x);
  { const rs = reportsOf(x.id); h += `<div class="mt-5"><div class="flex items-center justify-between mb-2"><p class="text-xs font-bold">提報（${rs.length}）</p>${rpBtn(x.id)}</div>${rs.map(r => reportCardH(r, false)).join('')}</div>`; }
  if ((x.issues || []).length) h += `<p class="text-xs text-amber-600 mt-3">圖片備註：${x.issues.map(esc).join('；')}</p>`;
  const hs = hItems(x.id).filter(it => it.lv !== 'info'), noImg = IMG.st[x.id] === 'missing';
  if (hs.length || noImg) h += `<div class="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><p class="text-xs font-bold mb-1">此題健檢</p><ul class="text-xs space-y-0.5">`
    + (noImg ? `<li class="${HL.err[1]}">🖼 找不到圖片檔 ${esc(imgPath(x))}</li>` : '')
    + hs.map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('') + '</ul></div>';
  return h;
}

/* 「寫文本」用的精簡規格：只留寫文本需要的部分（目標主題、目標難度、entry_schema、rules、example），
   保留 _spec 原本的鍵名結構（tiers.guide、rules.tier…），讓規格裡的互相參照仍然成立；不含出圖 seeds、其他難度、app_modes。
   這樣使用者只要上傳圖片、貼指令，不必再附上整份 part1.json（題數增加後它會越來越大）。 */
function specLite(d, t) {
  if (!SPEC) return '';
  const T = SPEC.tiers || {}, H = SPEC.how_to_use || {}, dm = Object.assign({}, SPEC.domains && SPEC.domains[d]);
  delete dm.seeds;
  return JSON.stringify({
    how_to_use: { stage2_rule: H.stage2_rule, output: H.output, avoid_duplicates: H.avoid_duplicates },
    domains: { [d]: dm },
    tiers: { [t]: T[t], image_by_tier: { [t]: T.image_by_tier && T.image_by_tier[t] } },
    entry_schema: SPEC.entry_schema, rules: SPEC.rules, example: SPEC.example
  });
}

/* ---- 新增題目：選主題＋難度 → 圖片檔名＋給 AI 的指令（每題一張新圖）---- */
function buildOut(d, t) {
  const tn = TIER[t], guide = (SPEC && SPEC.tiers && SPEC.tiers[t] && SPEC.tiers[t].guide) || '', ig = (SPEC && SPEC.image_gen) || {};
  const code = nextCode(d, t), id = code + '-' + TS[t], path = 'images/' + id + '.jpg';
  const same = inCell(d, t).map(x => x.id + '（' + x.tag + '）');
  const seed = pickSeed(d, t), scene = seed || 'a typical ' + (DOM[d].scenes || []).join(' or ') + ' scene';
  const rule = ig.by_tier && ig.by_tier[t];
  const ip = [(ig.base || 'A realistic photograph of {scene}. Natural lighting, 4:3 landscape.').replace('{scene}', scene), rule ? 'Composition: ' + rule : '', ig.constraints || 'No text, logos or readable screens; at most 4 people.'].filter(Boolean).join(' ');
  const common = [`主題：${domLabel(d)}（scene 必須屬於：${(DOM[d].scenes || []).join('、')}）`, `目標難度：${tn}（id 尾碼 ${TS[t]}）｜多益分數範圍 ${tScore(t)}${guide ? '｜難度定義：' + guide : ''}`];
  const tc = (SPEC && SPEC.tiers && SPEC.tiers[t]) || {};
  const usedTags = DATA.map(x => x.tag).filter(Boolean), usedVocab = [...new Set(DATA.flatMap(x => (x.vocab || []).map(v => v.word)).filter(Boolean))];
  const lite = specLite(d, t);
  const tail = `輸出方式：請把結果建立成一個檔案，檔名必須是 ${id}.json（內容只有單一 JSON 物件，合法 JSON、UTF-8，不要加程式碼區塊標記），讓我直接下載；回覆中除了檔案，只需一行說明檔名。若你無法建立檔案，才改成只輸出單一 json 程式碼區塊，區塊外不要加任何文字。若這張圖寫不出該難度，不要建立檔案，只輸出 skip 物件的 json 程式碼區塊。`;
  const text = [
    lite ? `我已上傳圖片（${path}）。規格附在最後面，不需要另外附 part1.json，請依規格執行：` : `我已上傳圖片（${path}）與 part1.json，請依 _spec 執行：`,
    `寫文本 ${id}`, '',
    ...common.map(s => '- ' + s), '- 不限制出題方式，也不限制圖片人數：只依上面的難度定義與圖片實際內容出題；photo_type 依圖片實際人數填 single／multi／none（記錄用，不影響難度）。', `- image 欄位填：${path}`,
    `- image_prompt 欄位請原樣填入我實際使用的出圖 prompt：${ip}`,
    '- visible_facts 與所有句子一律依圖片實際看到的內容撰寫，不要依 prompt 想像。',
    '- pool 必須剛好 12 句：3 句 ok:true ＋ 9 句 ok:false；輸出前請逐句數過，不可多也不可少。',
    `- 已用過的 tag（不得重複）：${usedTags.join('；') || '（目前沒有）'}`,
    `- 已用過的 vocab（不得重複）：${usedVocab.join('、') || '（目前沒有）'}`,
    same.length ? `- 此格已有題目（畫面與句型不要雷同）：${same.join('；')}` : null,
    `- level.tier 填 ${t}；level.score 必須在 ${tScore(t)}（50 的倍數）${tc.score_pick ? '，依下列標準挑：' + tc.score_pick : ''}`,
    `- 如果這張圖寫不出${tn}該有的內容${tc.skip_if ? '（' + tc.skip_if.replace(/。$/, '') + '）' : ''}，輸出 skip 物件，不要硬寫。`,
    '', tail,
    ...(lite ? ['', '【規格：part1.json 的 _spec 精簡版，只含寫文本需要的部分】', lite] : [])
  ].filter(s => s !== null).join('\n');
  return [
    { title: '圖片檔名', note: '生好的圖片請存成這個檔名，放進 images 資料夾。每題一張獨立的圖，不與其他題目共用。', text: id + '.jpg' },
    { title: '出圖 prompt（直接貼給生圖 AI）', reroll: !!seed, note: `不用附 part1.json。${seed ? '情境：' + seed + '。不喜歡可按「換情境」。' : '（part1.json 沒有這個主題的 seeds，請自行指定情境。）'}${same.length ? '此格已有：' + same.join('；') + '。' : ''}生好圖後先檢查有沒有怪手指、文字或商標，再存成上面的檔名。`, text: ip },
    { title: '給 AI 的「寫文本」指令', note: lite ? `只要上傳圖片，再貼這段（約 ${text.length.toLocaleString()} 字，已內含精簡規格與已用過的 tag／vocab，不必附 part1.json）。AI 會依圖片實際內容寫出完整題目，並直接給你一個 ${id}.json 檔案（檔名已對應圖片）；若 AI 無法建檔，它會貼出 json 區塊，再自行存成 ${id}.json。圖片若不適合這個難度，它會回傳 skip（不會給檔案）。` : '（找不到 part1.json 的 _spec，所以這份指令不含規格，請把圖片與 part1.json 一起上傳給 AI。）AI 會依圖片實際內容寫出完整題目，並直接給你一個 ${id}.json 檔案（檔名已對應圖片）；若 AI 無法建檔，它會貼出 json 區塊，再自行存成 ${id}.json。圖片若不適合這個難度，它會回傳 skip（不會給檔案）。', text },
    { title: '存檔與合併', note: `把 AI 給你的 ${id}.json 下載後（檔名不用改），放到 json_merge.py 同一個資料夾，雙擊執行並勾選合併。合併後重新整理本頁，題數就會更新。若 AI 回傳的是 skip，就不要合併。` }
  ];
}

function adminNewH() {
  const doms = Object.keys(DOM), tiers = Object.keys(TIER), d = A.nd, t = A.nt;
  const on = c => `${btn} !py-1.5 ${c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`;
  let h = hdr('新增題目', 'goAdmin()');
  h += `<h2 class="font-bold mb-2">1. 選主題</h2><div class="flex flex-wrap gap-2 mb-5">${doms.map(k => `<button onclick="adminPick('nd','${k}')" class="${on(d === k)}">${esc(domLabel(k))}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">2. 選難度</h2><div class="flex flex-wrap gap-2 mb-5">${tiers.map(k => `<button onclick="adminPick('nt','${k}')" class="${on(t === k)}">${TIER[k]} ${TS[k]} <span class="text-xs opacity-70">${tScore(k)}${d ? ` · ${pool(k, d).length} 題` : ''}</span></button>`).join('')}</div>`;
  h += `<p class="text-xs text-slate-400 -mt-3 mb-5">難度只看句型與干擾項的細緻度，不限制圖片人數；分數是 AI 寫文本時 level.score 可以填的範圍。</p>`;
  if (!d || !t) return h + `<p class="text-xs text-slate-400">選好主題與難度後，會出現圖片檔名與給 AI 的指令。</p>`;
  const n = pool(t, d).length;
  h += `<p class="text-sm mb-4">${esc(domLabel(d))} · ${TIER[t]}（${tScore(t)}）目前 <b>${n}</b> 題${n < TARGET ? `，未達目標 ${TARGET} 題` : '，已達標'}。${orphIn(d, t).includes(nextCode(d, t) + '-' + TS[t]) ? '這格已經有圖片（還沒有題目）：' : '新題會是一張全新的圖片：'}<b>${esc(nextCode(d, t) + '-' + TS[t])}</b>${orphIn(d, t).includes(nextCode(d, t) + '-' + TS[t]) ? '。這張圖不用再生圖，直接上傳它並貼第 3 則「寫文本」指令即可，第 2 則出圖 prompt 可略過。' : ''}</p>`;
  const outs = buildOut(d, t); A.out = outs.map(s => s.text || '');
  outs.forEach((s, i) => {
    h += `<div class="${card} p-4 mb-3"><div class="flex items-center justify-between gap-2 mb-1"><p class="font-bold text-sm">${i + 1}. ${esc(s.title)}</p><span class="flex gap-1.5 shrink-0">${s.reroll ? `<button onclick="rerollSeed()" class="${btn} ${line} !py-1 text-xs">🎲 換情境</button>` : ''}${s.text ? `<button id="cp${i}" onclick="copyOut(${i})" class="${btn} ${line} !py-1 text-xs">複製</button>` : ''}</span></div><p class="text-xs text-slate-500 mb-2">${esc(s.note)}</p>${s.text ? `<pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(s.text)}</pre>` : ''}</div>`;
  });
  return h;
}
function copyOut(i) {
  const t = A.out[i] || '', done = () => { const b = document.getElementById('cp' + i); if (b) { b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb); else fb();
}

/* ---------- 提報：發現答案、解析、照片或音檔有瑕疵時記錄；存在 localStorage（PK.reports），管理員可彙整、編輯狀態、匯出／匯入 ---------- */
const RK = { answer: '答案／解析有誤', photo: '照片瑕疵', audio: '音檔問題', other: '其他' };
const RS = { open: '待處理', fixing: '處理中', fixed: '已修正', wontfix: '不處理' };
const RSC = { open: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300', fixing: '!bg-sky-100 !text-sky-700 dark:!bg-sky-950 dark:!text-sky-300', fixed: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-300', wontfix: '' };
const fmtT = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const reportsOf = id => R.reports.filter(r => r.qid === id).sort((a, b) => b.created - a.created);
const openRpN = id => R.reports.filter(r => (r.status === 'open' || r.status === 'fixing') && (!id || r.qid === id)).length;
const rpBtn = qid => { const n = reportsOf(qid).length; return `<button onclick="openReport(this.dataset.q)" data-q="${esc(qid)}" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">⚑ 提報${n ? ` (${n})` : ''}</button>`; };
function toast(m) { const d = document.createElement('div'); d.textContent = m; d.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
/* 提報當下的四句敘述快照：之後題庫改了，管理員仍看得到使用者當時看到什麼 */
function snapOf(qid) {
  const x = find(qid); if (!x) return null;
  let sh = null, sel = null;
  if (V.run && V.run.ids.includes(qid)) { sh = V.run.shown[qid]; sel = V.run.sel[qid]; }
  if (!sh && R.rec[qid]) { sh = R.rec[qid].shown; sel = R.rec[qid].sel; }
  if (!okShown(x, sh)) return null;
  const v = vw(x, sh);
  return { sents: v.s.map(p => ({ t: p.t, ok: !!p.ok })), sel: sel === undefined ? null : sel };
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
    ${x ? `<div class="max-w-[10rem] mb-3">${imgH(x)}</div>` : ''}
    <label class="block text-xs text-slate-500 mb-1">問題類型</label><select id="rpk" class="${inp} mb-3">${opt(RK, p.kind)}</select>
    <label class="block text-xs text-slate-500 mb-1">描述問題（例如：A 句其實也符合照片、圖中人物手部變形…）</label><textarea id="rpn" rows="4" class="${inp} mb-3">${esc(p.note)}</textarea>
    <label class="block text-xs text-slate-500 mb-1">提報人（選填）</label><input id="rpr" value="${esc(p.reporter)}" class="${inp} mb-3" maxlength="30">
    ${edit ? `<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-xs text-slate-500 mb-1">處理狀態</label><select id="rps" class="${inp}">${opt(RS, p.status)}</select></div></div>
    <label class="block text-xs text-slate-500 mb-1">管理員備註（例如：已重生圖片、已改 pool 第 3 句）</label><textarea id="rpa" rows="2" class="${inp} mb-3">${esc(p.adminNote)}</textarea>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">提報當下的四句敘述</summary><ul class="mt-1 space-y-0.5">${sn.sents.map((s, i) => `<li>${L[i]}. ${esc(s.t)}${s.ok ? ' <b class="text-emerald-600">✓ 正解</b>' : ''}${sn.sel === i ? ' <span class="text-rose-500">（使用者選）</span>' : ''}</li>`).join('')}</ul></details>` : ''}
    <div class="flex gap-2 justify-end"><button onclick="closeReport()" class="${btn} ${line}">取消</button><button onclick="saveReport()" class="${btn} ${pri}">${edit ? '儲存變更' : '送出提報'}</button></div></div></div></div>`;
}
function reportCardH(r, img) {
  const x = find(r.qid), sn = r.snap;
  return `<div class="${card} p-3 mb-3"><div class="flex gap-3">${img && x ? `<div class="w-24 shrink-0">${imgH(x)}</div>` : ''}<div class="min-w-0 flex-1">
    <div class="flex flex-wrap items-center gap-1.5">${x ? idBtn(r.qid) : `<b class="text-sm">${esc(r.qid)}</b><span class="${chip}">題目已不存在</span>`}<span class="${chip}">${RK[r.kind] || esc(r.kind)}</span><span class="${chip} ${RSC[r.status] || ''}">${RS[r.status] || esc(r.status)}</span></div>
    <p class="text-sm mt-1.5 whitespace-pre-wrap break-words">${esc(r.note)}</p>
    <p class="text-xs text-slate-400 mt-1">${esc(r.reporter || '匿名')} · ${fmtT(r.created)}${r.updated > r.created ? ' · 更新 ' + fmtT(r.updated) : ''}</p>
    ${r.adminNote ? `<p class="text-xs mt-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 whitespace-pre-wrap break-words"><b>管理員：</b>${esc(r.adminNote)}</p>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mt-1.5"><summary class="cursor-pointer">當時的四句敘述</summary><ul class="mt-1 space-y-0.5">${sn.sents.map((s, i) => `<li>${L[i]}. ${esc(s.t)}${s.ok ? ' ✓' : ''}${sn.sel === i ? ' ←使用者選' : ''}</li>`).join('')}</ul></details>` : ''}</div></div>
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
  return h + `<p class="text-xs text-slate-500 mb-2">共 ${list.length} 筆</p>` + list.map(r => reportCardH(r, true)).join('');
}
function download(name, text, mime) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportReports(fmt) {
  if (!R.reports.length) { toast('沒有可匯出的提報'); return; }
  const d = new Date(), p = n => String(n).padStart(2, '0'), stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  if (fmt === 'json') { download(`part1-reports-${stamp}.json`, JSON.stringify({ app: 'toeic-part1-reports', v: 1, exported: Date.now(), reports: R.reports }, null, 2), 'application/json'); return; }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['提報編號', '題目ID', '類型', '狀態', '描述', '提報人', '建立時間', '更新時間', '管理員備註', '圖片', 'A', 'B', 'C', 'D', '正解', '使用者選'];
  const rows = R.reports.slice().sort((a, b) => a.created - b.created).map(r => { const s = r.snap, x = find(r.qid);
    return [r.id, r.qid, RK[r.kind] || r.kind, RS[r.status] || r.status, r.note, r.reporter, fmtT(r.created), fmtT(r.updated), r.adminNote, x ? imgPath(x) : '',
      ...[0, 1, 2, 3].map(i => s && s.sents[i] ? s.sents[i].t : ''), s ? L[s.sents.findIndex(z => z.ok)] || '' : '', s && s.sel != null ? L[s.sel] : ''].map(cell).join(','); });
  download(`part1-reports-${stamp}.csv`, '﻿' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
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
  if (V.rp && V.rp.focus) { V.rp.focus = false; const t = document.getElementById('rpn'); if (t) t.focus(); }
}

/* ---------- 啟動：讀取 part1.json；雙擊開啟（file://）時改用手動選取 ---------- */
function backAdmin() { if (window._ah) location.href = 'index.html#mt'; else goHome(); } // 從首頁「維護總覽」進來的，返回就回總覽
function loadText(t) {
  try {
    const j = JSON.parse(t), d = j && j._spec && j._spec.domains; SPEC = (j && j._spec) || null;
    if (d && typeof d === 'object') { // 主題名稱與 scene 對照以 part1.json 為準
      const m = {}; Object.keys(d).forEach(k => { const v = d[k]; if (v && v.name) m[k] = { n: v.name, scenes: v.scenes || [], seeds: v.seeds || null }; });
      if (Object.keys(m).length) DOM = m;
    }
    RAW = itemsOf(j); DATA = RAW.map(normItem).filter(Boolean);
    HEALTH = auditAll(RAW); checkImages(false); checkOrphans(false); // 資料健檢（同步）＋ 圖片檔檢查（非同步，完成後維護頁自動更新）
    render();
    if (location.hash === '#admin' && !window._ah) { window._ah = 1; goAdmin(); } // 從首頁「維護總覽」直接進入維護頁
  } catch (e) { alert('part1.json 格式有誤：' + e.message); }
}
function pickJson(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8'); }
async function boot() {
  await auLoad();
  try {
    const res = await fetch('part1.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    loadText(await res.text());
  } catch (e) {
    main.innerHTML = `<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 part1.json</h3>
      <p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取。請選擇同資料夾的 part1.json；上傳到 GitHub Pages 或用本機伺服器開啟則會自動載入。</p>
      <label class="${btn} inline-block ${pri}">選取 part1.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`;
  }
}
boot();
