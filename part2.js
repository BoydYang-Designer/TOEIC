/* Part 2 應答問題：首頁分「練習」與「測驗」；題庫來自 part2.json
   題目 id = d{N}-{NNN}-{e|m|h}（N=主題 D1–D7，與 Part 1 相同）；qtype = q1–q6 只是題型標籤。
   題庫格式：q（固定問句）＋ pool（12 句：3 正確＋9 錯誤）；每次作答隨機抽 1 正確＋2 錯誤並排成 A–C。
   練習：可開英文／中文文稿、可重播、答完立即看解析；測驗：音檔只播一次、全程不顯示文字、完成後才檢討。
   維護：D×難度矩陣 → 該格題目 → 單題頁（12 句、音檔面板、提報）；另有「⚑ 提報」（存在 PK.reports，介面比照 Part 1）；「新增題目」選 D／難度／Q 後產生給 AI 的指令（一次多題，AI 回傳 JSON 陣列，再用 json_merge.py 合併）。 */
const KEY = 'toeicCoachV2', PK = 'toeicPart2V1'; // KEY 只讀寫 dark；作答紀錄存在 PK
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
let R = { rec: {}, saved: {}, tests: {} };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
if (!R.tests) R.tests = {};
if (!Array.isArray(R.reports)) R.reports = []; // 提報紀錄（存在 PK 裡，與作答紀錄同一份 localStorage）
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };
let DATA = [], RAW = [], SPEC = null, HEALTH = { list: [], err: 0, warn: 0, dropped: 0 };
const TESTN = 6, TARGET = 2, L = 'ABC'; // 與 Part 1 相同（PART_UI_GUIDE 1.2 #4 預設；若要維持 10／4 只改這一行）
const TIER = { easy: '初級', medium: '中級', hard: '高級' }, TS = { easy: 'e', medium: 'm', hard: 'h' }, TSC = { easy: '500–550', medium: '600–650', hard: '700–800' };
const SCORE_RG = { easy: [500, 550], medium: [600, 650], hard: [700, 800] };
const QT = { q1: 'WH 疑問句', q2: 'Yes/No 疑問句', q3: '選擇疑問句', q4: '附加問句', q5: '陳述句', q6: '建議／請求／提議' };
const TR = { 'sound-alike': '音近字', 'word-repeat': '重複題目字', 'wrong-wh': '答非所問', association: '相關但非所問', 'wrong-tense-person': '時態／人稱錯' };
let DOM = { d1: { n: '辦公室', scenes: ['office'] }, d2: { n: '餐廳飲食', scenes: ['restaurant'] }, d3: { n: '商店購物', scenes: ['store'] }, d4: { n: '街道與交通', scenes: ['street', 'station'] }, d5: { n: '工地與倉庫', scenes: ['workplace'] }, d6: { n: '旅館與居家', scenes: ['hotel', 'home'] }, d7: { n: '戶外與公園', scenes: ['outdoor'] } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const find = id => DATA.find(x => x.id === id);
const tierOf = x => { const t = x.level && x.level.tier; if (TIER[t]) return t; const s = (x.level && x.level.score) || 600; return s <= 550 ? 'easy' : s <= 650 ? 'medium' : 'hard'; };
const domOf = x => { if (DOM[x.domain]) return x.domain; const m = /^(d\d)-/.exec(x.id); return m && DOM[m[1]] ? m[1] : null; };
const domLabel = k => DOM[k] ? k.toUpperCase() + ' ' + DOM[k].n : '';
const qLabel = k => QT[k] ? k.toUpperCase() + ' ' + QT[k] : '';
const pool = (t, m, q) => DATA.filter(x => (!t || tierOf(x) === t) && (!m || domOf(x) === m) && (!q || x.qtype === q));
const itemsOf = j => Array.isArray(j) ? j : (j && j.items) || [];

/* ---------- 題庫：pool 12 句，每次抽 1 正確＋2 錯誤 ---------- */
function normItem(x) {
  if (!x || !x.id || !x.q || typeof x.q.t !== 'string' || !Array.isArray(x.pool)) return null;
  const p = x.pool.filter(v => v && typeof v.t === 'string'), nOk = p.filter(v => v.ok).length;
  if (nOk < 1 || p.length - nOk < 2) return null;
  x._pool = p; return x;
}
function draw(x) { // 兩個錯誤句盡量取不同陷阱類型
  const ok = [], bad = []; x._pool.forEach((p, i) => (p.ok ? ok : bad).push(i));
  const b = shuffle(bad), b2 = b.slice(1).find(i => x._pool[i].trap !== x._pool[b[0]].trap);
  return shuffle([ok[Math.floor(Math.random() * ok.length)], b[0], b2 !== undefined ? b2 : b[1]]);
}
const okShown = (x, sh) => Array.isArray(sh) && sh.length === 3 && sh.every(i => x._pool[i]) && sh.filter(i => x._pool[i].ok).length === 1;
function defShown(x) { const bad = []; x._pool.forEach((p, i) => { if (!p.ok && bad.length < 2) bad.push(i); }); return [x._pool.findIndex(p => p.ok), ...bad]; }
const vw = (x, sh) => { sh = okShown(x, sh) ? sh : defShown(x); const s = sh.map(i => x._pool[i]); return { sh, s, ans: s.findIndex(p => p.ok) }; };
const shownOf = x => V.run.shown[x.id] || (V.run.shown[x.id] = draw(x));

const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');
let V = { rp: null, rf: null, rkf: null, view: 'home', pn: 10, fd: null, fm: null, fq: null, tt: null, tm: null, tx: 0, run: null };

/* ---------- 音訊：瀏覽器語音合成（問句與回答盡量用不同聲音）；iOS 必須在點擊當下解鎖 ---------- */
const P = { tok: 0, playing: false, hint: '', started: false, unlocked: false, wd: 0, vq: null, va: null };
const hasTTS = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
/* 挑聲音：優先 Tom（問句）與 Zoe（回答）的增強/高品質版；找不到就挑分數最高的美式英文，再不行才用任何英文 */
const VOICE_BAD = /novelty|fred|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
function voiceScore(v) {
  const n = v.name + ' ' + v.voiceURI; let s = 0;
  if (/premium|enhanced|增強|高品質|進階|natural|online/i.test(n)) s += 10;
  if (/google/i.test(n)) s += 5;
  if (/^en[-_]US$/i.test(v.lang)) s += 3;
  if (/^en[-_](IN|ZA|IE|SG|PH)$/i.test(v.lang)) s -= 5;
  if (VOICE_BAD.test(v.name)) s -= 50;
  return s;
}
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => voiceScore(b) - voiceScore(a));
    const byName = re => vs.find(v => /^en[-_]US$/i.test(v.lang) && re.test(v.name));
    P.vq = byName(/\bTom\b/i) || vs[0] || null;
    P.va = byName(/\bZoe\b/i) || vs.find(v => v !== P.vq && /^en[-_](GB|AU|US)$/i.test(v.lang)) || null;
    if (P.va === P.vq) P.va = null;
  } catch (e) {}
}
if (hasTTS()) { pickVoice(); try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) {} }
function unlockTTS() { if (P.unlocked || !hasTTS()) return; P.unlocked = true; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (e) {} }
function stopAudio() { auStop(); P.tok++; P.playing = false; clearTimeout(P.wd); try { speechSynthesis.cancel(); } catch (e) {} }
function failPlay(x, tok, msg) { if (tok !== P.tok) return; stopAudio(); P.hint = msg; if (V.run && x) delete V.run.played[x.id]; paintAudio(); }
function ttsPlay(x, tok) {
  if (!hasTTS()) { failPlay(x, tok, '這個瀏覽器不支援語音合成，請改用 Chrome 或 Safari。'); return; }
  const s = vw(x, shownOf(x)).s;
  const parts = [{ t: 'Number ' + (V.run.i + 1) + '.', v: P.vq, g: 700 }, { t: x.q.t, v: P.vq, g: 1600 }, ...s.map((p, i) => ({ t: L[i] + '. ' + p.t, v: P.va || P.vq, hi: !P.va, g: 1300 }))];
  let i = 0; P.started = false; clearTimeout(P.wd);
  P.wd = setTimeout(() => { if (tok === P.tok && !P.started) failPlay(x, tok, '沒有聽到聲音？請確認手機音量與靜音開關；Android 請安裝英文語音（Google 文字轉語音）。'); }, 4000);
  const next = () => {
    if (tok !== P.tok) return;
    if (i >= parts.length) { P.playing = false; paintAudio(); return; }
    const q = parts[i++], u = new SpeechSynthesisUtterance(q.t);
    u.lang = q.v ? q.v.lang : 'en-US'; u.rate = 0.9 * AU.rate; if (q.v) u.voice = q.v; if (q.hi) u.pitch = 1.25;
    u.onstart = () => { P.started = true; };
    u.onend = () => setTimeout(next, q.g);
    u.onerror = e => { if (tok !== P.tok || e.error === 'interrupted' || e.error === 'canceled') return; failPlay(x, tok, '語音播放失敗（' + (e.error || 'error') + '），請再按一次播放。'); };
    speechSynthesis.speak(u);
  };
  try { speechSynthesis.cancel(); setTimeout(next, 80); } catch (e) { failPlay(x, tok, '語音合成啟動失敗，請再按一次播放。'); }
}
/* 整題 mp3 到齊（audio/index.json 判定）才走這裡：問句 → A → B → C；中途播放失敗就從頭改用機器發音並記住這題 */
function mp3Play(x, tok) {
  const n = auNames('p2', x), sh = vw(x, shownOf(x)).sh, q = auSeq(sh.map(i => auSrc('p2', n.s[i])), 1300, { src: auSrc('p2', n.q), gap: 1600 });
  auChain(q.srcs, q.gaps, () => tok === P.tok,
    () => { P.playing = false; paintAudio(); },
    () => { if (tok !== P.tok) return; auStop(); if (q.letters) { AU.noLet = true; mp3Play(x, tok); return; } AU.bad['p2' + x.id] = 1; ttsPlay(x, tok); }); // 字母檔壞了先改成只播句子，再壞才改機器發音
}
function playQ() {
  const r = V.run, x = cx(); if (!x || P.playing || (r.mode === 'mock' && r.played[x.id])) return;
  r.played[x.id] = 1; AU.rate = r.mode === 'practice' ? AU.speed : 1; stopAudio(); P.hint = ''; unlockTTS();
  const tok = ++P.tok; P.playing = true; if (auFull('p2', x.id)) mp3Play(x, tok); else ttsPlay(x, tok); paintAudio();
}
function audHtml() {
  const r = V.run, x = cx(); if (!x) return '';
  const mock = r.mode === 'mock', done = !!r.played[x.id], hint = P.hint ? `<span class="text-xs text-rose-500 basis-full">${esc(P.hint)}</span>` : '';
  if (P.playing) return (mock ? `<button disabled class="${btn} ${pri}">🔊 播放中…</button>` : `<button onclick="stopAudio();paintAudio()" class="${btn} ${line}">⏹ 停止</button>` + auSpeedSel()) + hint;
  if (mock && done) return `<button disabled class="${btn} ${pri}">已播放</button>`;
  const answered = r.sel[x.id] !== undefined; // 已作答：重播改次要樣式，讓「下一題」成為唯一主要按鈕
  return `<button onclick="playQ()" class="${btn} ${answered ? line : pri}">${done ? '🔁 重播' : '🔊 播放'}</button>` + (mock ? '' : auSpeedSel()) + hint;
}
function paintAudio() { const e = document.getElementById('aud'); if (e) e.innerHTML = audHtml(); }

/* ---------- 作答流程 ---------- */
const cx = () => V.run && find(V.run.ids[V.run.i]);
function startRun(ids, mode, key, cfg) { if (!ids.length) return; stopAudio(); P.hint = ''; V.run = { ids, mode, key, cfg, i: 0, sel: {}, played: {}, shown: {} }; V.view = 'run'; render(); window.scrollTo({ top: 0 }); }
const startPractice = () => startRun(shuffle(pool(V.fd, V.fm, V.fq).map(x => x.id)).slice(0, V.pn || 9999), 'practice', 'practice');
const tcKey = () => (V.tt || 'all') + '|' + (V.tm || 'all');
const startTest = () => startRun(shuffle(pool(V.tt, V.tm).map(x => x.id)).slice(0, TESTN), 'mock', 'test', tcKey());
function pick(oi) {
  const r = V.run, x = cx(); if (r.sel[x.id] !== undefined) return;
  const v = vw(x, shownOf(x)); r.sel[x.id] = oi; const ok = oi === v.ans;
  R.rec[x.id] = { sel: oi, ok, trap: v.s[oi].trap || '', shown: v.sh };
  if (!ok) R.saved[x.id] = 1; else delete R.saved[x.id]; saveR(); // 答錯加入錯題本；之後答對就自動移出
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
const goHome = () => go('home'), openPractice = () => go('practice'), openTest = () => go('test'), openBook = () => go('book'), openAdmin = () => go('admin');
const goBack = () => go(V.run && V.run.key === 'test' ? 'test' : V.run && V.run.key === 'book' ? 'book' : 'practice');
function quit() { if (V.run.mode === 'mock' && Object.keys(V.run.sel).length && !confirm('離開後這次測驗不會計分，確定離開？')) return; goBack(); }
function unsave(id) { delete R.saved[id]; saveR(); render(); }
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }
function toggleDark() { S.dark = !S.dark; try { const c = JSON.parse(localStorage.getItem(KEY) || '{}'); c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} render(); }

/* ---------- 畫面 ---------- */
function hdr(title, back) {
  const b = back ? `<button onclick="${back}" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>` : `<a href="index.html" class="${btn} ${line} !py-1.5 shrink-0" aria-label="回到首頁">⌂</a>`;
  return `<header class="flex items-center justify-between gap-2 mb-5"><div class="flex items-center gap-2 min-w-0">${b}<h1 class="text-lg md:text-2xl font-bold truncate">${title}</h1></div><button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button></header>`;
}
function fbtn(k, v, label, n) {
  const on = (V[k] || null) === v;
  return `<button onclick="setF('${k}',${v ? `'${v}'` : 'null'})" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${n === 0 ? ' opacity-40' : ''}">${label}${n == null ? '' : ` <span class="text-xs opacity-70">${n}</span>`}</button>`;
}
function metaH(x) {
  const t = tierOf(x), m = domOf(x), sc = x.level && x.level.score;
  return `<div class="flex flex-wrap gap-1.5 mt-4"><span class="${chip}">${TIER[t]}${sc ? ' · ' + sc : ''}</span>${m ? `<span class="${chip}">${esc(domLabel(m))}</span>` : ''}${QT[x.qtype] ? `<span class="${chip}">${esc(qLabel(x.qtype))}${x.wh ? ' · ' + esc(x.wh) : ''}</span>` : ''}</div>`;
}
function revealH(x, sel, sh) {
  const v = vw(x, sh), others = x._pool.filter((p, i) => p.ok && !v.sh.includes(i));
  const vocab = (x.vocab || []).map(w => `<span class="${chip}">${esc(w.word)} ${esc(w.zh)}</span>`).join(' ');
  return metaH(x) + `<p class="mt-3 text-sm"><b>Q：</b>${esc(x.q.t)}<span class="block text-xs text-slate-500">${esc(x.q.zh)}</span></p><div class="space-y-2 mt-3">${v.s.map((p, i) => {
    const good = i === v.ans, bad = i === sel && !good;
    const c = good ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : bad ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50' : 'border-slate-200 dark:border-slate-800';
    return `<div class="rounded-lg border px-3 py-2 text-sm ${c}"><div class="flex justify-between gap-2"><span><b>${L[i]}.</b> ${esc(p.t)}</span><span class="text-xs shrink-0 ${good ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${good ? '✓ 正解' + (p.pattern ? ' · ' + esc(p.pattern) : '') : (bad ? '✗ 你選的 · ' : '') + esc(TR[p.trap] || '')}</span></div><p class="text-xs text-slate-500 mt-0.5">${esc(p.zh)}</p><p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc(p.why)}</p></div>`;
  }).join('')}</div>${others.length ? `<p class="text-xs text-slate-500 mt-3">這題其他也正確的說法：${others.map(p => esc(p.t) + (p.pattern ? '（' + esc(p.pattern) + '）' : '')).join('　／　')}</p>` : ''}${vocab ? `<p class="mt-3 flex flex-wrap gap-1.5 items-center text-xs text-slate-500">重點單字：${vocab}</p>` : ''}`;
}
function runH() {
  const r = V.run, x = cx(), n = r.ids.length, sel = r.sel[x.id], ans = sel !== undefined, mock = r.mode === 'mock', sh = shownOf(x), v = vw(x, sh), tx = mock ? 0 : V.tx;
  let h = hdr(`${mock ? '測驗' : '練習'} · ${r.i + 1} / ${n}`, 'quit()');
  h += `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-4"><div class="h-1.5 rounded bg-indigo-600" style="width:${(r.i + (ans ? 1 : 0)) / n * 100}%"></div></div>`;
  const nextBtn = ans ? `<button onclick="nextQ()" class="${btn} ${pri}">${r.i + 1 < n ? '下一題 →' : '完成，看結果'}</button>` : '';
  h += `<div class="flex items-center gap-3 mb-4 flex-wrap"><span id="aud" class="flex items-center gap-2 flex-wrap">${audHtml()}</span>${nextBtn}<span class="text-xs text-slate-400">${mock ? '只播放一次' : '可重複播放'}</span><span class="ml-auto">${rpBtn(x.id)}</span></div>`;
  if (!mock && !ans) h += `<div class="flex items-center gap-2 mb-3 text-xs text-slate-500">文稿：${[[0, '關'], [1, '英文'], [2, '中文']].map(([k, l]) => `<button onclick="V.tx=${k};render()" class="${btn} !py-1 !px-3 text-xs ${V.tx === k ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div>`;
  if (!ans) {
    if (tx) h += `<p class="text-sm mb-3"><b>Q：</b>${esc(tx === 1 ? x.q.t : x.q.zh)}</p><div class="space-y-2">${v.s.map((p, i) => `<button onclick="pick(${i})" class="${btn} ${line} w-full text-left hover:bg-slate-100 dark:hover:bg-slate-800"><b>${L[i]}.</b> ${esc(tx === 1 ? p.t : p.zh)}</button>`).join('')}</div>`;
    else h += `<p class="text-xs text-slate-500 mb-2">聽一句問句與三個回答，選出最適當的回應（文字作答後才顯示）</p><div class="grid grid-cols-3 gap-2">${[0, 1, 2].map(i => `<button onclick="pick(${i})" class="rounded-lg border ${line} py-3 text-lg font-bold cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800">${L[i]}</button>`).join('')}</div>`;
  } else {
    h += `<div class="grid grid-cols-3 gap-2">${[0, 1, 2].map(i => {
      const c = i === v.ans ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700' : i === sel ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700' : 'opacity-40 border-slate-200 dark:border-slate-800';
      return `<button disabled class="rounded-lg border py-3 text-lg font-bold ${c}">${L[i]}</button>`;
    }).join('')}</div>`;
    h += revealH(x, sel, sh);
  }
  return h;
}
function resultH() {
  const r = V.run, n = r.ids.length, sc = score(), test = r.key === 'test', prac = r.key === 'practice', book = r.key === 'book';
  let h = hdr('作答結果', 'goBack()'), sub = test ? '測驗成績' : '練習結果（不計入成績）';
  if (test) { const [t, m] = r.cfg.split('|'); sub += ` · ${TIER[t] || '不限難度'} · ${DOM[m] ? domLabel(m) : '不限主題'}`; }
  h += `<div class="${card} p-5 text-center mb-5"><p class="text-sm text-slate-500">${sub}</p><p class="text-4xl font-bold mt-1 ${sc / n >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}">${sc} / ${n}</p><div class="flex gap-2 justify-center mt-4"><button onclick="goBack()" class="${btn} ${line}">${test ? '回測驗選單' : book ? '回錯題本' : '回練習選單'}</button>${test ? `<button onclick="startTest()" class="${btn} ${pri}">再測一次（重新抽題）</button>` : prac ? `<button onclick="startPractice()" class="${btn} ${pri}">再練一次（重新抽題）</button>` : ''}</div></div>`;
  r.ids.forEach((id, i) => { const x = find(id), s = r.sel[id], ok = s === vw(x, r.shown[id]).ans; h += `<div class="${card} p-4 mb-3"><p class="text-sm font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}">${ok ? '✓' : '✗'} Q${i + 1} · ${esc(x.tag)}</p>${revealH(x, s, r.shown[id])}<div class="mt-3 text-right">${rpBtn(id)}</div></div>`; });
  return h;
}
function bookH() {
  const ids = Object.keys(R.saved).filter(find); let h = hdr('錯題本', 'goHome()');
  if (!ids.length) return h + `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`;
  h += `<button onclick="startRun(${JSON.stringify(ids).replace(/"/g, '&quot;')},'practice','book')" class="${btn} ${pri} w-full mb-4">重做這 ${ids.length} 題</button>`;
  ids.forEach(id => { const x = find(id); h += `<div class="${card} p-4 mb-3"><div class="flex justify-between items-center"><p class="text-sm font-bold">${esc(x.tag)}</p><button onclick="unsave(this.dataset.id)" data-id="${esc(id)}" class="text-xs text-rose-500 hover:underline">移除</button></div>${revealH(x, (R.rec[id] || {}).sel, (R.rec[id] || {}).shown)}<div class="mt-3 text-right">${rpBtn(id)}</div></div>`; });
  return h;
}
function homeH() {
  let h = hdr('Part 2 應答問題');
  if (!DATA.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">part2.json 還沒有題目。<br><button onclick="openAdmin()" class="${btn} ${line} mt-4">🛠 維護</button></div>`;
  const nSaved = Object.keys(R.saved).filter(find).length;
  h += `<div class="grid gap-3 md:grid-cols-2 mb-4"><button onclick="openPractice()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📖 練習</p><p class="text-sm text-slate-500 mt-2">依難度、主題、題型隨機抽題，不計分。可開英文／中文文稿，可重複播放，作答後立即看解析。</p></button>
    <button onclick="openTest()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📝 測驗</p><p class="text-sm text-slate-500 mt-2">選難度（可再選主題），隨機抽 ${TESTN} 題。音檔只播一次、不顯示文字，完成後才檢討。</p></button></div>
    <div class="grid grid-cols-3 gap-3"><button onclick="openBook()" class="${btn} ${line}">★ 錯題本 ${nSaved}</button><button onclick="go('reports')" class="${btn} ${line}">⚑ 提報${openRpN() ? ' ' + openRpN() : ''}</button><button onclick="openAdmin()" class="${btn} ${line}">🛠 維護</button></div>`;
  const cnt = {}; Object.values(R.rec).forEach(r => { if (!r.ok && TR[r.trap]) cnt[r.trap] = (cnt[r.trap] || 0) + 1; });
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  if (top.length) h += `<h2 class="font-bold mt-8 mb-2">你常中的陷阱（依最近一次作答）</h2><div class="flex flex-wrap gap-2">${top.map(([k, v]) => `<span class="${chip}">${TR[k]} × ${v}</span>`).join('')}</div>`;
  return h;
}
const tierHint = () => Object.keys(TIER).map(k => `${TIER[k]} ${((SPEC && SPEC.tiers && SPEC.tiers[k] && SPEC.tiers[k].score) || TSC[k])}`).join('；') + '（多益預估分數）';
function practiceH() {
  let h = hdr('練習', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件隨機抽題，不計分。音檔可重播，作答中可開英文／中文文稿；答錯的題會放進錯題本。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('fd', null, '不限難度', pool(null, V.fm, V.fq).length)}${Object.keys(TIER).map(k => fbtn('fd', k, TIER[k], pool(k, V.fm, V.fq).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-5">${fbtn('fm', null, '不限主題', pool(V.fd, null, V.fq).length)}${Object.keys(DOM).map(k => fbtn('fm', k, domLabel(k), pool(V.fd, k, V.fq).length)).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">3. 選題型 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-5">${fbtn('fq', null, '不限題型', pool(V.fd, V.fm, null).length)}${Object.keys(QT).map(k => fbtn('fq', k, qLabel(k), pool(V.fd, V.fm, k).length)).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">4. 題數</h2><div class="flex flex-wrap gap-2 mb-5">${[[10, '10 題'], [20, '20 題'], [0, '全部']].map(([v, l]) => `<button onclick="V.pn=${v};render()" class="${btn} !py-1.5 ${V.pn === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div>`;
  const m = pool(V.fd, V.fm, V.fq).length, n = V.pn ? Math.min(m, V.pn) : m;
  h += `<button onclick="startPractice()" ${m ? '' : 'disabled'} class="${btn} ${pri} w-full">開始練習（${n} 題）</button>`;
  if (!m) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`;
  else if (V.pn && m < V.pn) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${m} 題，將全部出題。</p>`;
  return h;
}
function testH() {
  let h = hdr('測驗', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件隨機抽 ${TESTN} 題。音檔只播放一次，作答中不顯示文字與對錯，完成後一次檢討。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tt', null, '不限難度', pool(null, V.tm).length)}${Object.keys(TIER).map(k => fbtn('tt', k, TIER[k], pool(k, V.tm).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tm', null, '不限主題', pool(V.tt, null).length)}${Object.keys(DOM).map(k => fbtn('tm', k, domLabel(k), pool(V.tt, k).length)).join('')}</div><p class="text-xs text-slate-400 mb-5">${V.tm ? '只從「' + domLabel(V.tm) + '」抽題；再點一次可取消。' : '不限主題：依上面選的難度，從所有主題隨機抽題。'}</p>`;
  const n = pool(V.tt, V.tm).length, o = R.tests[tcKey()];
  h += `<button onclick="startTest()" ${n ? '' : 'disabled'} class="${btn} ${pri} w-full">開始測驗（${Math.min(n, TESTN)} 題）</button>`;
  if (!n) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`; else if (n < TESTN) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${n} 題，將全部出題。</p>`;
  if (o) h += `<p class="text-xs text-slate-500 mt-3">這個組合的紀錄：最佳 ${o.best}% · 最近一次 ${o.last}%</p>`;
  return h;
}

/* ---------- 資料健檢（只讀取、不修改資料）---------- */
const ID_RE = /^d([1-7])-(\d{3})-([emh])$/, SUF = { e: 'easy', m: 'medium', h: 'hard' };
function auditAll(raw) {
  const list = [], add = (id, lv, msg) => list.push({ id, lv, msg }), ids = {}, tags = {}; let dropped = 0;
  const pats = q => (SPEC && SPEC.qtypes && SPEC.qtypes[q] && SPEC.qtypes[q].patterns) || null;
  raw.forEach((x, i) => {
    const id = x && x.id ? String(x.id) : '第 ' + (i + 1) + ' 筆';
    if (!x || !x._pool) { dropped++; add(id, 'err', '格式不合（缺 id／q／pool，或 pool 至少要 1 正確、2 錯誤），已被略過，不會出現在練習／測驗'); return; }
    if (ids[id]) add(id, 'err', 'id 重複'); ids[id] = 1;
    const m = ID_RE.exec(id), lv = x.level || {}, sc = lv.score, tr = m && SUF[m[3]];
    if (!m) add(id, 'err', 'id 格式應為 d{1-7}-{3 位數}-{e|m|h}');
    else { if (x.domain !== 'd' + m[1]) add(id, 'err', 'domain 應為 d' + m[1]); if (lv.tier !== tr) add(id, 'err', 'level.tier 應等於 id 尾碼（' + tr + '）'); }
    if (typeof sc !== 'number') add(id, 'err', 'level.score 必須是數字'); else if (tr && (sc < SCORE_RG[tr][0] || sc > SCORE_RG[tr][1])) add(id, 'err', `level.score ${sc} 不在${TIER[tr]}範圍 ${TSC[tr]}`);
    if (!QT[x.qtype]) add(id, 'err', 'qtype 必須是 q1–q6'); else {
      const q = x.q.t.trim();
      if (x.qtype === 'q1' && !/\b(who|what|which|when|where|why|how)\b/i.test(q)) add(id, 'warn', 'Q1 問句應含疑問詞');
      if (x.qtype === 'q2' && !/^(do|does|did|is|are|am|was|were|have|has|had|can|could|will|would|should|shall)\b/i.test(q)) add(id, 'warn', 'Q2 問句應以助動詞或 be 動詞開頭');
      if (x.qtype === 'q3' && !/\bor\b/i.test(q)) add(id, 'warn', 'Q3 問句應含 or');
      if (x.qtype === 'q4' && !/,\s*\w+(n't)?\s+(I|you|he|she|it|we|they|there)\s*\??$/i.test(q)) add(id, 'warn', 'Q4 句尾應為附加問句');
    }
    if (!String(x.tag || '').trim()) add(id, 'err', '缺少 tag'); else if (tags[x.tag] && tags[x.tag] !== id) add(id, 'warn', `tag「${x.tag}」與 ${tags[x.tag]} 相同`); else tags[x.tag] = id;
    const pl = x.pool, okN = pl.filter(p => p && p.ok === true).length, kinds = new Set(), seen = {};
    if (pl.length !== 12) add(id, 'err', `pool 必須剛好 12 句（目前 ${pl.length}）`);
    if (okN !== 3) add(id, 'err', `pool 必須 3 句正確、9 句錯誤（目前正確 ${okN} 句）`);
    const pp = pats(x.qtype);
    pl.forEach((p, k) => {
      const n = k + 1;
      if (!p || typeof p.t !== 'string' || typeof p.ok !== 'boolean') { add(id, 'err', `pool 第 ${n} 句格式不對`); return; }
      const key = p.t.toLowerCase().replace(/[^a-z0-9 ]/g, ''); if (seen[key]) add(id, 'err', `pool 第 ${n} 句與第 ${seen[key]} 句重複`); else seen[key] = n;
      const w = (p.t.match(/[A-Za-z0-9']+/g) || []).length; if (w < 2 || w > 15) add(id, 'warn', `第 ${n} 句字數 ${w}（建議 2–15）`);
      if (p.ok) { if (p.trap !== 'correct') add(id, 'err', `第 ${n} 句 ok:true，trap 應為 correct`); if (pp && !pp.includes(p.pattern)) add(id, 'warn', `第 ${n} 句 pattern「${p.pattern}」不在 ${x.qtype} 的合法值（${pp.join('、')}）`); }
      else if (!TR[p.trap]) add(id, 'err', `第 ${n} 句 trap 不合法：${p.trap}`); else kinds.add(p.trap);
      if (!String(p.zh || '').trim() || !String(p.why || '').trim()) add(id, 'warn', `第 ${n} 句缺少 zh 或 why`);
    });
    if (kinds.size < 4) add(id, 'warn', `錯誤句只涵蓋 ${kinds.size} 種 trap（建議 4 種以上）`);
    if (!x.q.zh) add(id, 'warn', 'q 缺少 zh');
    const vc = Array.isArray(x.vocab) ? x.vocab : [];
    if (!vc.length) add(id, 'err', '缺少 vocab');
    else { const blob = (x.q.t + ' ' + x._pool.map(p => p.t).join(' ')).toLowerCase(); vc.forEach(v => { if (!v || !v.word || !v.zh) add(id, 'err', 'vocab 項目缺少 word 或 zh'); else if (!blob.includes(String(v.word).toLowerCase().replace(/e$/, ''))) add(id, 'warn', `單字「${v.word}」沒有出現在句子中`); }); }
  });
  const c = lv => list.filter(h => h.lv === lv).length; return { list, err: c('err'), warn: c('warn'), dropped };
}

/* ---------- 維護：D×難度矩陣 → 該格題目；新增題目 ---------- */
const A = { d: null, t: null, nd: 'd1', nt: 'easy', nq: 'q1', nn: 5, out: [] };
const tcol = n => n >= TARGET ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : n ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400';
const HL = { err: ['✖', 'text-rose-600 dark:text-rose-400'], warn: ['⚠', 'text-amber-600 dark:text-amber-400'] };
function goA(view, p) { stopAudio(); Object.assign(A, p || {}); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const adminCell = (d, t) => goA('adminCell', { d, t }), adminItem = k => goA('adminItem', { k }), adminNew = (d, t) => goA('adminNew', { nd: d || A.nd, nt: t || A.nt });
const apick = (k, v) => { A[k] = v; render(); };
/* ---------- 缺音檔提示（PART_UI_GUIDE 5.7）：以 audio/index.json 為準；整題（問句＋全部回答句）沒到齊＝缺音檔，該題整題改用機器發音，仍可作答 ---------- */
const UNIT = '題';
const auHas = x => !!(AU.idx && AU.idx.p2 && (AU.idx.p2.complete || []).includes(x.id));
const auMissing = x => !auHas(x);
const missAud = () => DATA.filter(auMissing);
const inCell = (d, t) => DATA.filter(x => domOf(x) === d && (!t || tierOf(x) === t)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
/* 某題缺的音檔：[{name, text}]（含問句 -q；partial 清單有列出缺哪幾檔，沒列＝全缺） */
function auMissRows(x) {
  if (!auMissing(x)) return [];
  const n = auNames('p2', x), ms = (((AU.idx || {}).p2 || {}).partial || {})[x.id];
  return [{ name: n.q, text: x.q.t }].concat(x._pool.map((p, i) => ({ name: n.s[i], text: p.t }))).filter(r => !ms || ms.includes(r.name));
}
async function recheckAudio() { await auLoad(); render(); }
function clipText(t, bid) {
  const done = () => { const b = document.getElementById(bid); if (b) { b.dataset.l = b.dataset.l || b.textContent; b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = b.dataset.l || '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb); else fb();
}
function copyCellMiss(d, t) { clipText(inCell(d, t).flatMap(auMissRows).map(r => r.name + '.mp3 | ' + r.text).join('\n'), 'cm'); }
function cellStat(d, t) { const xs = pool(t, d); return { n: xs.length, aud: xs.filter(auMissing).length }; }
function audioStatusH() {
  const N = DATA.length, miss = missAud().length, ok = N - miss;
  const s = !N ? '' : !AU.idx ? '<span class="text-rose-600 dark:text-rose-400">✖ 尚未讀到 audio/index.json（全部用機器發音）</span>'
    : miss ? `<span class="text-rose-600 dark:text-rose-400">✖ 缺 <b>${miss}</b> ${UNIT}（有 mp3：${ok} / ${N}；缺的整${UNIT}改用機器發音）</span>`
      : `<span class="text-emerald-600 dark:text-emerald-400">✔ ${ok} ${UNIT}都有 mp3</span>`;
  return `<span class="flex items-center gap-2">${s}${N ? `<button onclick="recheckAudio()" class="${btn} ${line} !py-0.5 !px-2 text-xs">重新檢查</button>` : ''}</span>`;
}
function adminH() {
  const doms = Object.keys(DOM), tiers = Object.keys(TIER), qc = {}; DATA.forEach(x => { qc[x.qtype] = (qc[x.qtype] || 0) + 1; });
  let low = 0; doms.forEach(d => tiers.forEach(t => { if (pool(t, d).length < TARGET) low++; }));
  let h = hdr('維護', 'backAdmin()');
  h += `<div class="${card} p-4 mb-4 text-sm"><div class="flex flex-wrap gap-x-6 gap-y-1"><span>題目 <b>${DATA.length}</b> 題${HEALTH.dropped ? ` <span class="${HL.err[1]}">（另有 ${HEALTH.dropped} 筆格式不合被略過）</span>` : ''}</span><span>音檔 <b>${DATA.filter(auHas).length}</b> 題</span><span class="text-slate-500">未達標格子 <b>${low}</b> / ${doms.length * tiers.length}（目標每格 ≥ ${TARGET} 題）</span></div>
    <div class="flex flex-wrap gap-1.5 mt-3">${Object.keys(QT).map(k => `<span class="${chip}">${qLabel(k)} <b>${qc[k] || 0}</b></span>`).join('')}</div>
    <div class="flex flex-wrap items-center gap-2 mt-2 text-xs"><span class="text-slate-500">音檔：</span>${audioStatusH()}</div></div>`;
  const H = HEALTH;
  h += `<div class="${card} p-4 mb-4"><div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><b>資料健檢</b>${!H.err && !H.warn ? '<span class="text-emerald-600 dark:text-emerald-400">✔ 全部通過</span>' : `${H.err ? `<span class="${HL.err[1]}">✖ 錯誤 <b>${H.err}</b></span>` : ''}${H.warn ? `<span class="${HL.warn[1]}">⚠ 提醒 <b>${H.warn}</b></span>` : ''}`}</div>`;
  if (H.list.length) { const g = {}, order = []; H.list.forEach(it => { if (!g[it.id]) { g[it.id] = []; order.push(it.id); } g[it.id].push(it); }); h += `<details class="mt-2" ${H.err ? 'open' : ''}><summary class="text-xs cursor-pointer text-slate-500">查看明細（${order.length} 題有項目）</summary><div class="max-h-96 overflow-auto">${order.map(id => `<div class="mt-2"><p class="text-xs">${idBtn(id)}</p><ul class="text-xs space-y-0.5 mt-0.5">${g[id].map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`).join('')}</div></details>`; }
  h += `</div><div class="overflow-x-auto mb-3"><div class="grid gap-1.5 text-center text-sm min-w-[32rem]" style="grid-template-columns:4.5rem repeat(${doms.length},minmax(3rem,1fr))"><div></div>${doms.map(d => `<button onclick="adminCell('${d}',null)" class="text-xs font-bold py-1 cursor-pointer hover:text-indigo-600">${d.toUpperCase()}<br><span class="font-normal text-slate-500">${esc(DOM[d].n)}</span></button>`).join('')}`;
  tiers.forEach(t => { h += `<div class="text-left self-center text-xs font-bold">${TIER[t]} ${TS[t]}<span class="block font-normal text-slate-500">${TSC[t]}</span></div>` + doms.map(d => { const s = cellStat(d, t); return `<button onclick="adminCell('${d}','${t}')" class="rounded-lg py-3 font-bold cursor-pointer ${tcol(s.n)}">${s.n}${s.aud ? `<span class="block text-[10px] font-normal text-rose-600 dark:text-rose-400">缺音檔 ${s.aud}</span>` : ''}</button>`; }).join(''); });
  return h + `</div></div><p class="text-xs text-slate-400 mb-5">格子＝該難度、該主題的題數。紅＝0、黃＝未達 ${TARGET}、綠＝達標；格內紅字小字＝缺音檔的題數（缺的整題用機器發音，仍可作答）。點格子看題目；點上方 D1–D7 看該主題全部難度。</p><button onclick="go('reports')" class="${btn} ${line} w-full mb-3">⚑ 提報彙整${openRpN() ? `（待處理 ${openRpN()}）` : ''}</button><button onclick="adminNew()" class="${btn} ${pri} w-full">＋ 新增題目</button>`;
}
function adminCellH() {
  const d = A.d, t = A.t, xs = DATA.filter(x => domOf(x) === d && (!t || tierOf(x) === t)).sort((a, b) => String(a.id).localeCompare(String(b.id))), nm = domLabel(d) + (t ? ' · ' + TIER[t] : '');
  let h = hdr(nm, 'openAdmin()') + `<button onclick="adminNew('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${pri} w-full mb-3">＋ 新增 ${esc(nm.replace(' · ', ' '))} 題目</button>`;
  { const nm_ = xs.filter(auMissing).length; h += `<button id="cm" ${nm_ ? '' : 'disabled'} onclick="copyCellMiss('${d}',${t ? `'${t}'` : 'null'})" class="${btn} ${line} w-full mb-4">複製本格缺的音檔清單（${nm_}）</button>`; }
  if (!xs.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有題目（0 題）。<br><span class="text-xs text-slate-400">點上方「＋ 新增」開始建立。</span></div>`;
  return h + xs.map(x => {
    const k = tierOf(x), sc = x.level && x.level.score, nh = hItems(x.id).length, nr = openRpN(x.id);
    const badge = (auMissing(x) ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">缺音檔</span>` : '') + (nh ? `<span class="${chip} !bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300">⚠ ${nh}</span>` : '')
      + (nr ? `<span class="${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300">⚑ 提報 ${nr}</span>` : '');
    return `<div class="${card} p-3 mb-3"><p class="font-bold text-sm">${esc(x.id)}</p><p class="text-xs text-slate-500 truncate">${esc(x.tag)}</p><p class="text-sm mt-2">${esc(x.q.t)}</p>
      <div class="flex flex-wrap gap-1 mt-2">${badge}<span class="${chip}">${TIER[k]}${sc ? ' · ' + sc : ''}</span>${QT[x.qtype] ? `<span class="${chip}">${esc(qLabel(x.qtype))}</span>` : ''}</div>
      <button onclick="adminItem(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1 text-xs mt-2">看題目與答案</button></div>`;
  }).join('');
}
const poolRowH = p => `<div class="rounded-lg border px-3 py-2 text-sm ${p.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-800'}"><div class="flex justify-between gap-2"><span>${esc(p.t)}</span><span class="text-xs shrink-0 ${p.ok ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${p.ok ? '✓ 正解' + (p.pattern ? ' · ' + esc(p.pattern) : '') : esc(TR[p.trap] || '')}</span></div><p class="text-xs text-slate-500 mt-0.5">${esc(p.zh)}</p><p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc(p.why)}</p></div>`;
function adminItemH() {
  const x = find(A.k);
  if (!x) return hdr('維護', 'openAdmin()') + `<p class="text-sm text-slate-400 text-center py-8">找不到這一題。</p>`;
  const d = domOf(x), t = tierOf(x), sc = x.level && x.level.score;
  const vocab = (x.vocab || []).map(w => `<span class="${chip}">${esc(w.word)} ${esc(w.zh)}</span>`).join(' ');
  let h = hdr(x.id, d ? `adminCell('${d}','${t}')` : 'openAdmin()');
  h += `<p class="text-sm font-bold">${esc(x.tag)}</p><div class="flex flex-wrap gap-1.5 mt-2"><span class="${chip}">${TIER[t]}${sc ? ' · ' + sc : ''}</span>${d ? `<span class="${chip}">${esc(domLabel(d))}</span>` : ''}${QT[x.qtype] ? `<span class="${chip}">${esc(qLabel(x.qtype))}${x.wh ? ' · ' + esc(x.wh) : ''}</span>` : ''}</div>`;
  if (x.level && x.level.why) h += `<p class="text-xs text-slate-500 mt-2">${esc(x.level.why)}</p>`;
  h += `<p class="text-sm mt-4"><b>Q：</b>${esc(x.q.t)}<span class="block text-xs text-slate-500">${esc(x.q.zh)}</span></p>`;
  h += `<p class="text-xs font-bold mt-5 mb-2">題庫 12 句（網頁每次作答隨機抽 1 正確＋2 錯誤）</p><div class="space-y-1.5">${[...x._pool].sort((a, b) => (b.ok ? 1 : 0) - (a.ok ? 1 : 0)).map(poolRowH).join('')}</div>`;
  if (vocab) h += `<p class="mt-3 flex flex-wrap gap-1.5 items-center text-xs text-slate-500">單字：${vocab}</p>`;
  h += auPanel('p2', x);
  { const rs = reportsOf(x.id); h += `<div class="mt-5"><div class="flex items-center justify-between mb-2"><p class="text-xs font-bold">提報（${rs.length}）</p>${rpBtn(x.id)}</div>${rs.map(r => reportCardH(r)).join('')}</div>`; }
  const hs = hItems(x.id);
  if (hs.length) h += `<div class="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><p class="text-xs font-bold mb-1">此題健檢</p><ul class="text-xs space-y-0.5">${hs.map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`;
  return h;
}
const serial = (d, t) => { let mx = 0; RAW.forEach(x => { const m = x && x.id && /^d(\d)-(\d+)-([emh])$/.exec(x.id); if (m && 'd' + m[1] === d && m[3] === TS[t]) mx = Math.max(mx, +m[2]); }); return mx; };
const cefrOf = s => s <= 550 ? 'A2+' : s === 600 ? 'B1' : s === 650 ? 'B1+' : s <= 750 ? 'B2' : 'B2+';
const scoreList = t => { const r = []; for (let s = SCORE_RG[t][0]; s <= SCORE_RG[t][1]; s += 50) r.push(s); return r; };
function buildOut(d, t, q, n) {
  const mx = serial(d, t), ids = Array.from({ length: n }, (_, i) => d + '-' + String(mx + 1 + i).padStart(3, '0') + '-' + TS[t]), fname = 'p2_' + ids[0] + '_x' + n + '.json';
  const sp = SPEC || {}, tc = (sp.tiers && sp.tiers[t]) || {}, any = q === 'any', qs = any ? {} : (sp.qtypes && sp.qtypes[q]) || {};
  const cell = DATA.filter(x => domOf(x) === d && tierOf(x) === t), cellQ = {}, cellWh = [...new Set(cell.filter(x => x.qtype === 'q1' && x.wh).map(x => x.wh))];
  cell.forEach(x => { cellQ[x.qtype] = (cellQ[x.qtype] || 0) + 1; });
  const tags = DATA.map(x => x.tag).filter(Boolean), vocab = [...new Set(DATA.flatMap(x => (x.vocab || []).map(v => v.word)).filter(Boolean))];
  const sameD = DATA.filter(x => domOf(x) === d).map(x => x.id + '：' + x.q.t);
  const lite = JSON.stringify({ domain: { [d]: sp.domains && sp.domains[d] }, tier: { [t]: tc }, qtype: any ? (sp.qtypes || {}) : { [q]: qs }, traps: sp.traps, entry_schema: sp.entry_schema, rules: sp.rules });
  const text = [`請為多益 Part 2 應答問題寫 ${n} 題，輸出為單一 JSON 陣列（每題一個物件），規格附在最後面，不需要另外附 part2.json。`, '',
    `- 主題：${domLabel(d)}（scene 必須屬於：${(DOM[d].scenes || []).join('、')}；問句與回答的情境請貼近此主題）`,
    `- 難度：${TIER[t]}（id 尾碼 ${TS[t]}）｜多益分數 ${TSC[t]}｜level.score 只能填：${scoreList(t).map(s => s + '（cefr 填 ' + cefrOf(s) + '）').join('、')}${tc.guide ? '｜難度定義：' + tc.guide : ''}`,
    any ? `- 題型：不限，由你判斷。每題的 qtype 請從 q1–q6 擇一，並依下列規則分配：${n <= 6 ? '每題的 qtype 都要不同（q1–q6 各最多用一次）' : '各題型盡量平均，同一題型最多 ' + Math.ceil(n / 6) + ' 題'}；每題正解的 pattern 只能用該題 qtype 的合法值：${Object.keys(QT).map(k => k + '＝' + ((((sp.qtypes || {})[k] || {}).patterns) || []).join('／')).join('；')}（各題型的說明見最後面的規格）` : `- 題型：${qLabel(q)}（qtype 填 ${q}）${qs.note ? '｜' + qs.note : ''}｜正解 pattern 只能用：${(qs.patterns || []).join('、')}`,
    q === 'q1' || any ? (any ? '- 凡 qtype 為 q1 的題目必須另填 wh 欄位，並讓 wh 涵蓋不同疑問詞（who／what／which／when／where／why／how）；其他題型不要填 wh。' : '- 這批請讓 wh 欄位涵蓋不同疑問詞（who／what／which／when／where／why／how），不要全部相同。') : null,
    any ? `- 此主題＋難度已有的題型數量：${Object.keys(QT).map(k => k + '×' + (cellQ[k] || 0)).join('、')}${cellWh.length ? '；q1 已用過的 wh：' + cellWh.join('、') : ''}。請優先補數量最少的題型，q1 則優先用尚未用過的 wh。` : (q === 'q1' && cellWh.length ? `- 此主題＋難度的 q1 已用過的 wh：${cellWh.join('、')}，請優先用尚未用過的。` : null),
    `- id 請依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）`,
    '- 每題 pool 必須剛好 12 句：3 句 ok:true ＋ 9 句 ok:false；輸出前請逐題數過。',
    '- 3 句正解必須是不同說法（中高級盡量用不同 pattern），各自都能獨立成立；9 句錯誤句在任何情況下都不能回答該問句，不可模稜兩可，且至少涵蓋 4 種 trap。',
    '- 寫完每題後逐句自我檢查：把這句當成對問句的回應，會不會被聽成「間接回答、理由或暗示」？錯誤句不可有這種可能（例如對提議回 Because…、對 Yes/No 問句陳述暗示答案的事實）；要「相關但非所問」，也必須明確沒回答到。',
    `- 已用過的 tag（不得重複）：${tags.join('；') || '（目前沒有）'}`,
    `- 已用過的 vocab（不得重複）：${vocab.join('、') || '（目前沒有）'}`,
    sameD.length ? `- 此主題已有的問句（不要雷同）：${sameD.join('；')}` : null,
    `- 輸出方式：請把結果建立成一個檔案，檔名 ${fname}（內容只有一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記），回覆中除了檔案只需一行說明檔名；若無法建檔，才改成只輸出單一 json 程式碼區塊，區塊外不要加任何文字。`,
    '', '【規格：part2.json 的 _spec 精簡版】', lite].filter(s => s !== null).join('\n');
  return [{ title: '給 AI 的「寫題目」指令', note: `不需要上傳 part2.json（約 ${text.length.toLocaleString()} 字，已含規格、已用過的 tag／vocab 與此主題既有問句）。AI 會一次寫 ${n} 題，直接給你 ${fname}。`, text },
    { title: '存檔與合併', note: `AI 會依指令建立 ${fname}（id ${ids[0]}${n > 1 ? '～' + ids[n - 1] : ''} 是網頁依目前最大流水號算的，已寫在指令裡）。檔名只方便辨識，合併程式看的是檔案內容。下載後放到 json_merge.py 同一個資料夾，執行並選上方的「Part 2 應答」；p2_ 開頭的檔案會自動列出並勾選，其他檔名請按「新增檔案…」。遇到問句雷同或 id 衝突時，程式會列出句子讓你決定合併或拒絕。合併後重新整理本頁，題數就會更新。` }];
}
function adminNewH() {
  const on = c => `${btn} !py-1.5 ${c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`;
  let h = hdr('新增題目', 'openAdmin()');
  h += `<h2 class="font-bold mb-2">1. 選主題</h2><div class="flex flex-wrap gap-2 mb-5">${Object.keys(DOM).map(k => `<button onclick="apick('nd','${k}')" class="${on(A.nd === k)}">${esc(domLabel(k))}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">2. 選難度</h2><div class="flex flex-wrap gap-2 mb-5">${Object.keys(TIER).map(k => `<button onclick="apick('nt','${k}')" class="${on(A.nt === k)}">${TIER[k]} ${TS[k]} <span class="text-xs opacity-70">${TSC[k]} · ${pool(k, A.nd).length} 題</span></button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">3. 選題型</h2><div class="flex flex-wrap gap-2 mb-5"><button onclick="apick('nq','any')" class="${on(A.nq === 'any')}">🎲 讓 AI 判斷（不限題型）</button>${Object.keys(QT).map(k => `<button onclick="apick('nq','${k}')" class="${on(A.nq === k)}">${qLabel(k)}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">4. 一次幾題</h2><div class="flex flex-wrap gap-2 mb-5">${[3, 5, 8].map(k => `<button onclick="apick('nn',${k})" class="${on(A.nn === k)}">${k} 題</button>`).join('')}</div>`;
  const outs = buildOut(A.nd, A.nt, A.nq, A.nn); A.out = outs.map(s => s.text || '');
  return h + outs.map((s, i) => `<div class="${card} p-4 mb-3"><div class="flex items-center justify-between gap-2 mb-1"><p class="font-bold text-sm">${i + 1}. ${esc(s.title)}</p>${s.text ? `<button id="cp${i}" onclick="copyOut(${i})" class="${btn} ${line} !py-1 text-xs shrink-0">複製</button>` : ''}</div><p class="text-xs text-slate-500 mb-2">${esc(s.note)}</p>${s.text ? `<pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(s.text)}</pre>` : ''}</div>`).join('');
}
function copyOut(i) {
  const t = A.out[i] || '', done = () => { const b = document.getElementById('cp' + i); if (b) { b.textContent = '已複製 ✓'; setTimeout(() => { if (b.isConnected) b.textContent = '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb); else fb();
}
/* ---------- 提報：發現答案、解析或音檔有瑕疵時記錄；存在 localStorage（PK.reports），管理員可彙整、編輯狀態、匯出／匯入（與 Part 1 相同；沒有圖片，所以「照片瑕疵」改為「問句／題目不自然」） ---------- */
const RK = { answer: '答案／解析有誤', question: '問句／題目不自然', audio: '音檔問題', other: '其他' };
const RS = { open: '待處理', fixing: '處理中', fixed: '已修正', wontfix: '不處理' };
const RSC = { open: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300', fixing: '!bg-sky-100 !text-sky-700 dark:!bg-sky-950 dark:!text-sky-300', fixed: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-300', wontfix: '' };
const fmtT = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const reportsOf = id => R.reports.filter(r => r.qid === id).sort((a, b) => b.created - a.created);
const openRpN = id => R.reports.filter(r => (r.status === 'open' || r.status === 'fixing') && (!id || r.qid === id)).length;
const rpBtn = qid => { const n = reportsOf(qid).length; return `<button onclick="openReport(this.dataset.q)" data-q="${esc(qid)}" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">⚑ 提報${n ? ` (${n})` : ''}</button>`; };
const idBtn = id => find(id) ? `<button onclick="adminItem(this.dataset.k)" data-k="${esc(id)}" class="font-bold underline decoration-dotted cursor-pointer">${esc(id)}</button>` : `<b>${esc(id)}</b>`;
const hItems = id => (HEALTH.list || []).filter(h => h.id === id);
function toast(m) { const d = document.createElement('div'); d.textContent = m; d.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
/* 提報當下的問句與三個回答快照：之後題庫改了，管理員仍看得到使用者當時聽到什麼 */
function snapOf(qid) {
  const x = find(qid); if (!x) return null;
  let sh = null, sel = null;
  if (V.run && V.run.ids.includes(qid)) { sh = V.run.shown[qid]; sel = V.run.sel[qid]; }
  if (!sh && R.rec[qid]) { sh = R.rec[qid].shown; sel = R.rec[qid].sel; }
  if (!okShown(x, sh)) return null;
  const v = vw(x, sh);
  return { q: x.q.t, sents: v.s.map(p => ({ t: p.t, ok: !!p.ok })), sel: sel === undefined ? null : sel };
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
  const edit = p.mode === 'edit', sn = p.snap;
  const hide = !!(V.run && V.run.mode === 'mock' && V.run.ids.includes(p.qid) && V.run.sel[p.qid] === undefined); // 測驗中還沒作答：不顯示文字
  const opt = (o, cur) => Object.keys(o).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${o[k]}</option>`).join('');
  const inp = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm';
  return `<div class="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onclick="if(event.target===this)closeReport()"><div class="min-h-full flex items-end sm:items-center justify-center p-3">
    <div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">${edit ? '編輯提報' : '⚑ 提報問題'} · ${esc(p.qid)}</h2><button onclick="closeReport()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <label class="block text-xs text-slate-500 mb-1">問題類型</label><select id="rpk" class="${inp} mb-3">${opt(RK, p.kind)}</select>
    <label class="block text-xs text-slate-500 mb-1">描述問題（例如：B 句其實也能回答問句、音檔念錯、中文翻譯不對…）</label><textarea id="rpn" rows="4" class="${inp} mb-3">${esc(p.note)}</textarea>
    <label class="block text-xs text-slate-500 mb-1">提報人（選填）</label><input id="rpr" value="${esc(p.reporter)}" class="${inp} mb-3" maxlength="30">
    ${edit ? `<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-xs text-slate-500 mb-1">處理狀態</label><select id="rps" class="${inp}">${opt(RS, p.status)}</select></div></div>
    <label class="block text-xs text-slate-500 mb-1">管理員備註（例如：已改 pool 第 3 句、已重做音檔）</label><textarea id="rpa" rows="2" class="${inp} mb-3">${esc(p.adminNote)}</textarea>` : ''}
    ${sn && !hide ? `<details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">提報當下的問句與三個回答</summary><p class="mt-1">Q：${esc(sn.q)}</p><ul class="mt-1 space-y-0.5">${sn.sents.map((s, i) => `<li>${L[i]}. ${esc(s.t)}${s.ok ? ' <b class="text-emerald-600">✓ 正解</b>' : ''}${sn.sel === i ? ' <span class="text-rose-500">（使用者選）</span>' : ''}</li>`).join('')}</ul></details>` : ''}
    <div class="flex gap-2 justify-end"><button onclick="closeReport()" class="${btn} ${line}">取消</button><button onclick="saveReport()" class="${btn} ${pri}">${edit ? '儲存變更' : '送出提報'}</button></div></div></div></div>`;
}
function reportCardH(r) {
  const x = find(r.qid), sn = r.snap;
  return `<div class="${card} p-3 mb-3"><div class="min-w-0">
    <div class="flex flex-wrap items-center gap-1.5">${x ? idBtn(r.qid) : `<b class="text-sm">${esc(r.qid)}</b><span class="${chip}">題目已不存在</span>`}<span class="${chip}">${RK[r.kind] || esc(r.kind)}</span><span class="${chip} ${RSC[r.status] || ''}">${RS[r.status] || esc(r.status)}</span></div>
    <p class="text-sm mt-1.5 whitespace-pre-wrap break-words">${esc(r.note)}</p>
    <p class="text-xs text-slate-400 mt-1">${esc(r.reporter || '匿名')} · ${fmtT(r.created)}${r.updated > r.created ? ' · 更新 ' + fmtT(r.updated) : ''}</p>
    ${r.adminNote ? `<p class="text-xs mt-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 whitespace-pre-wrap break-words"><b>管理員：</b>${esc(r.adminNote)}</p>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mt-1.5"><summary class="cursor-pointer">當時的問句與回答</summary><p class="mt-1">Q：${esc(sn.q)}</p><ul class="mt-1 space-y-0.5">${sn.sents.map((s, i) => `<li>${L[i]}. ${esc(s.t)}${s.ok ? ' ✓' : ''}${sn.sel === i ? ' ←使用者選' : ''}</li>`).join('')}</ul></details>` : ''}</div>
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
  if (fmt === 'json') { download(`part2-reports-${stamp}.json`, JSON.stringify({ app: 'toeic-part2-reports', v: 1, exported: Date.now(), reports: R.reports }, null, 2), 'application/json'); return; }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['提報編號', '題目ID', '類型', '狀態', '描述', '提報人', '建立時間', '更新時間', '管理員備註', '問句', 'A', 'B', 'C', '正解', '使用者選'];
  const rows = R.reports.slice().sort((a, b) => a.created - b.created).map(r => { const s = r.snap;
    return [r.id, r.qid, RK[r.kind] || r.kind, RS[r.status] || r.status, r.note, r.reporter, fmtT(r.created), fmtT(r.updated), r.adminNote, s ? s.q : '',
      ...[0, 1, 2].map(i => s && s.sents[i] ? s.sents[i].t : ''), s ? L[s.sents.findIndex(z => z.ok)] || '' : '', s && s.sel != null ? L[s.sel] : ''].map(cell).join(','); });
  download(`part2-reports-${stamp}.csv`, '\ufeff' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
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

/* ---------- 啟動：讀取 part2.json；雙擊開啟（file://）時改用手動選取 ---------- */
function backAdmin() { if (window._ah) location.href = 'index.html#mt'; else goHome(); } // 從首頁「維護總覽」進來的，返回就回總覽
function loadText(t) {
  try {
    const j = JSON.parse(t), d = j && j._spec && j._spec.domains; SPEC = (j && j._spec) || null;
    if (d && typeof d === 'object') { const m = {}; Object.keys(d).forEach(k => { if (d[k] && d[k].name) m[k] = { n: d[k].name, scenes: d[k].scenes || [] }; }); if (Object.keys(m).length) DOM = m; }
    RAW = itemsOf(j); DATA = RAW.map(normItem).filter(Boolean); HEALTH = auditAll(RAW); render();
    if (location.hash === '#admin' && !window._ah) { window._ah = 1; openAdmin(); } // 從首頁「維護總覽」直接進入維護頁
  } catch (e) { alert('part2.json 格式有誤：' + e.message); }
}
function pickJson(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8'); }
async function boot() {
  await auLoad();
  try { const res = await fetch('part2.json', { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status); loadText(await res.text()); }
  catch (e) { main.innerHTML = `<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 part2.json</h3><p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取。請選擇同資料夾的 part2.json；上傳到 GitHub Pages 或用本機伺服器開啟則會自動載入。</p><label class="${btn} inline-block ${pri}">選取 part2.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`; }
}
boot();
