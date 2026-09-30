/* Part 1 照片描述：首頁分「練習」與「測驗」；題庫來自 photo.json
   練習：依組別（Set）或依 難度／主題／類型／重點 自由篩選，作答後立即看解析
   測驗：先選難度（初／中／高），再選主題（D1–D7），隨機抽 6 題，音檔只播一次，完成後才檢討 */
const KEY = 'toeicCoachV2', PK = 'toeicPart1V1'; // KEY 只讀寫 dark（與其他頁同步），作答紀錄存在 PK
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
let R = { rec: {}, sets: {}, saved: {}, tests: {} };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
if (!R.tests) R.tests = {};
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };
let DATA = [];
const TESTN = 6; // 每次測驗題數
const itemsOf = j => Array.isArray(j) ? j : (j && j.items) || [];
const find = id => DATA.find(x => x.id === id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const L = 'ABCD';
const PT = { single: '單人', multi: '多人', none: '無人物' }, FO = { action: '動作', state: '物品狀態', location: '位置', mixed: '綜合' };
const TR = { 'sound-alike': '音近字', 'not-in-photo': '圖中沒有', 'wrong-action': '動作錯誤', 'wrong-place-or-number': '位置／人數錯', 'over-inference': '過度推論' };
/* 難度三級：依 level.score 判定（level.tier 有填就以它為準） */
const TIER = { easy: '初級', medium: '中級', hard: '高級' };
/* 主題 D1–D7：依 scene 對應（photo.json 的 _spec.domains 有定義時會覆蓋這份預設） */
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
const pool = (t, m, ft, ff) => DATA.filter(x => (!t || tierOf(x) === t) && (!m || domOf(x) === m) && (!ft || x.photo_type === ft) && (!ff || x.focus === ff));

const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');
/* ft 類型、ff 重點、fd 難度、fm 主題 → 練習篩選；tt 難度、tm 主題 → 測驗篩選 */
let V = { view: 'home', ft: null, ff: null, fd: null, fm: null, tt: null, tm: null, run: null };

/* ---------- 音訊：優先 mp3，找不到就用瀏覽器語音合成念四句 ---------- */
const P = { au: null, tok: 0, playing: false };
function stopAudio() {
  P.tok++; P.playing = false;
  if (P.au) { P.au.onerror = P.au.onended = null; P.au.pause(); P.au = null; }
  try { speechSynthesis.cancel(); } catch (e) {}
}
function ttsPlay(x, tok) {
  const parts = ['Number ' + x.no + '.', ...x.statements.map((s, i) => L[i] + '. ' + s)];
  let i = 0;
  const next = () => {
    if (tok !== P.tok) return;
    if (i >= parts.length) { P.playing = false; paintAudio(); return; }
    const u = new SpeechSynthesisUtterance(parts[i++]);
    u.lang = 'en-US'; u.rate = 0.9;
    u.onend = () => setTimeout(next, i === 1 ? 600 : 1500);
    speechSynthesis.speak(u);
  };
  try { speechSynthesis.cancel(); next(); } catch (e) { P.playing = false; alert('您的瀏覽器不支援語音合成'); }
}
function playQ() {
  const r = V.run, x = cx();
  if (!x || P.playing || (r.mode === 'mock' && r.played[x.id])) return;
  r.played[x.id] = 1; stopAudio();
  const tok = ++P.tok; P.playing = true;
  const au = new Audio(x.audio || `audio/${x.id}.mp3`); P.au = au;
  const fb = () => { if (tok === P.tok) { P.au = null; ttsPlay(x, tok); } };
  au.onended = () => { if (tok === P.tok) { P.playing = false; P.au = null; paintAudio(); } };
  au.onerror = fb;
  au.play().catch(e => { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') fb(); });
  paintAudio();
}
function audHtml() {
  const r = V.run, x = cx(); if (!x) return '';
  const mock = r.mode === 'mock', done = !!r.played[x.id];
  if (P.playing) return mock ? `<button disabled class="${btn} ${pri}">🔊 播放中…</button>` : `<button onclick="stopAudio();paintAudio()" class="${btn} ${line}">⏹ 停止</button>`;
  if (mock && done) return `<button disabled class="${btn} ${pri}">已播放</button>`;
  return `<button onclick="playQ()" class="${btn} ${pri}">${done ? '🔁 重播' : '🔊 播放'}</button>`;
}
function paintAudio() { const e = document.getElementById('aud'); if (e) e.innerHTML = audHtml(); }

/* ---------- 作答流程 ---------- */
const cx = () => V.run && find(V.run.ids[V.run.i]);
function startRun(ids, mode, key, cfg) {
  if (!ids.length) return;
  stopAudio(); V.run = { ids, mode, key, cfg, i: 0, sel: {}, played: {} }; V.view = 'run'; render(); window.scrollTo({ top: 0 });
}
function startSet(n) { startRun(DATA.filter(x => x.set === n).sort((a, b) => a.no - b.no).map(x => x.id), 'practice', 's' + n); }
function startDrill() {
  const ids = matches().map(x => x.id).sort(() => Math.random() - 0.5);
  startRun(ids, 'practice', 'drill');
}
const tcKey = () => (V.tt || 'all') + '|' + (V.tm || 'all');
function startTest() {
  const ids = pool(V.tt, V.tm).map(x => x.id).sort(() => Math.random() - 0.5).slice(0, TESTN);
  startRun(ids, 'mock', 'test', tcKey());
}
function pick(oi) {
  const r = V.run, x = cx(); if (r.sel[x.id] !== undefined) return;
  r.sel[x.id] = oi;
  const ok = oi === x.ans;
  R.rec[x.id] = { sel: oi, ok, trap: (x.traps || [])[oi] || '' };
  if (!ok) R.saved[x.id] = 1;
  saveR();
  if (r.mode === 'mock') nextQ(); else render();
}
function nextQ() {
  const r = V.run; stopAudio();
  if (r.i + 1 < r.ids.length) { r.i++; render(); window.scrollTo({ top: 0 }); return; }
  const sc = score(), n = r.ids.length;
  if (r.key === 'test') { const o = R.tests[r.cfg] || {}, pct = Math.round(sc / n * 100); R.tests[r.cfg] = { best: Math.max(o.best || 0, pct), last: pct, n }; saveR(); }
  else if (r.key && r.key !== 'drill') { const o = R.sets[r.key] || {}; R.sets[r.key] = { best: Math.max(o.best || 0, sc), last: sc }; saveR(); }
  V.view = 'result'; render(); window.scrollTo({ top: 0 });
}
const score = () => V.run.ids.filter(id => V.run.sel[id] === find(id).ans).length;
function go(view) { stopAudio(); V.view = view; V.run = null; render(); window.scrollTo({ top: 0 }); }
const goHome = () => go('home');
const goBack = () => go(V.run && V.run.key === 'test' ? 'test' : 'practice');
function quit() { if (V.run.mode === 'mock' && Object.keys(V.run.sel).length && !confirm('離開後這次測驗不會計分，確定離開？')) return; goBack(); }
function openBook() { go('book'); }
function openPractice() { go('practice'); }
function openTest() { go('test'); }
function unsave(id) { delete R.saved[id]; saveR(); render(); }
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }
const matches = () => pool(V.fd, V.fm, V.ft, V.ff);
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
  const src = esc(x.image || `images/${x.id}.jpg`);
  return `<div class="rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 aspect-[4/3]"><img src="${src}" alt="" class="w-full h-full object-cover" onerror="this.classList.add('hidden');this.nextElementSibling.classList.remove('hidden')"><div class="hidden w-full h-full flex items-center justify-center p-4 text-center text-xs text-slate-500">圖片尚未放入：${src}</div></div>`;
}
function metaH(x) {
  const t = tierOf(x), m = domOf(x), sc = x.level && x.level.score;
  return `<div class="flex flex-wrap gap-1.5 mt-4"><span class="${chip}">${TIER[t]}${sc ? ' · ' + sc : ''}</span>${m ? `<span class="${chip}">${esc(domLabel(m))}</span>` : ''}${PT[x.photo_type] ? `<span class="${chip}">${PT[x.photo_type]}</span>` : ''}${FO[x.focus] ? `<span class="${chip}">${FO[x.focus]}</span>` : ''}</div>`;
}
function revealH(x, sel) {
  const vocab = (x.vocab || []).map(v => `<span class="${chip}">${esc(v.word)} ${esc(v.zh)}</span>`).join(' ');
  return metaH(x) + `<div class="space-y-2 mt-3">${x.statements.map((s, i) => {
    const good = i === x.ans, bad = i === sel && !good, t = TR[(x.traps || [])[i]] || '';
    const c = good ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : bad ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50' : 'border-slate-200 dark:border-slate-800';
    return `<div class="rounded-lg border px-3 py-2 text-sm ${c}"><div class="flex justify-between gap-2"><span><b>${L[i]}.</b> ${esc(s)}</span>
      <span class="text-xs shrink-0 ${good ? 'text-emerald-600 font-bold' : 'text-slate-400'}">${good ? '✓ 正解' : (bad ? '✗ 你選的 · ' : '') + esc(t)}</span></div>
      <p class="text-xs text-slate-500 mt-0.5">${esc((x.zh || [])[i])}</p><p class="text-xs mt-1 text-slate-600 dark:text-slate-400">${esc((x.why || [])[i])}</p></div>`;
  }).join('')}</div>${vocab ? `<p class="mt-3 flex flex-wrap gap-1.5 items-center text-xs text-slate-500">重點單字：${vocab}</p>` : ''}`;
}
function runH() {
  const r = V.run, x = cx(), n = r.ids.length, sel = r.sel[x.id], ans = sel !== undefined, mock = r.mode === 'mock';
  let h = hdr(`${mock ? '測驗' : '練習'} · ${r.i + 1} / ${n}`, 'quit()');
  h += `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-4"><div class="h-1.5 rounded bg-indigo-600" style="width:${(r.i + (ans ? 1 : 0)) / n * 100}%"></div></div>`;
  h += imgH(x) + `<div class="flex items-center gap-3 my-4"><span id="aud" class="flex items-center gap-2">${audHtml()}</span><span class="text-xs text-slate-400">${mock ? '只播放一次' : '可重複播放'}</span></div>`;
  if (!ans) h += `<p class="text-xs text-slate-500 mb-2">聽四句敘述，選出最符合照片的一句（文字作答後才顯示）</p>`;
  h += `<div class="grid grid-cols-4 gap-2">${[0, 1, 2, 3].map(i => {
    let c = 'border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800';
    if (ans) c = i === x.ans ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700' : i === sel ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700' : 'opacity-40 border-slate-200 dark:border-slate-800';
    return `<button ${ans ? 'disabled' : `onclick="pick(${i})"`} class="rounded-lg border py-3 text-lg font-bold cursor-pointer ${c}">${L[i]}</button>`;
  }).join('')}</div>`;
  if (ans) h += revealH(x, sel) + `<button onclick="nextQ()" class="${btn} ${pri} w-full mt-5">${r.i + 1 < n ? '下一題 →' : '完成，看結果'}</button>`;
  return h;
}
function resultH() {
  const r = V.run, n = r.ids.length, sc = score(), test = r.key === 'test';
  let h = hdr('作答結果', 'goBack()');
  let sub = r.mode === 'mock' ? '測驗成績' : '練習成績';
  if (test) { const [t, m] = r.cfg.split('|'); sub += ` · ${TIER[t] || '不限難度'} · ${DOM[m] ? domLabel(m) : '不限主題'}`; }
  h += `<div class="${card} p-5 text-center mb-5"><p class="text-sm text-slate-500">${sub}</p>
    <p class="text-4xl font-bold mt-1 ${sc / n >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}">${sc} / ${n}</p>
    <div class="flex gap-2 justify-center mt-4"><button onclick="goBack()" class="${btn} ${line}">${test ? '回測驗選單' : '回練習選單'}</button>
    ${test ? `<button onclick="startTest()" class="${btn} ${pri}">再測一次（重新抽題）</button>` : (r.key && r.key !== 'drill' ? `<button onclick="startSet(${+r.key.slice(1)})" class="${btn} ${pri}">再做一次</button>` : '')}</div></div>`;
  r.ids.forEach((id, i) => {
    const x = find(id), s = r.sel[id], ok = s === x.ans;
    h += `<div class="${card} p-4 mb-3"><p class="text-sm font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}">${ok ? '✓' : '✗'} Q${i + 1} · ${esc(x.tag)}</p><div class="max-w-xs mt-2">${imgH(x)}</div>${revealH(x, s)}</div>`;
  });
  return h;
}
function bookH() {
  const ids = Object.keys(R.saved).filter(find);
  let h = hdr('錯題本', 'goHome()');
  if (!ids.length) return h + `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`;
  h += `<button onclick="startRun(${JSON.stringify(ids).replace(/"/g, '&quot;')},'practice','drill')" class="${btn} ${pri} w-full mb-4">重做這 ${ids.length} 題</button>`;
  ids.forEach(id => {
    const x = find(id);
    h += `<div class="${card} p-4 mb-3"><div class="flex justify-between items-center"><p class="text-sm font-bold">${esc(x.tag)}</p>
      <button onclick="unsave(this.dataset.id)" data-id="${esc(id)}" class="text-xs text-rose-500 hover:underline">移除</button></div>
      <div class="max-w-xs mt-2">${imgH(x)}</div>${revealH(x, (R.rec[id] || {}).sel)}</div>`;
  });
  return h;
}
/* 首頁：練習／測驗 */
function homeH() {
  let h = hdr('Part 1 照片描述');
  if (!DATA.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">photo.json 還沒有題目。請把 AI 生成的題目貼進 items。</div>`;
  const nSaved = Object.keys(R.saved).filter(find).length;
  h += `<div class="grid gap-3 md:grid-cols-2 mb-4">
    <button onclick="openPractice()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📖 練習</p>
      <p class="text-sm text-slate-500 mt-2">依組別，或依難度、主題、類型自由篩選。作答後立即看解析，可重複播放音檔。</p></button>
    <button onclick="openTest()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📝 測驗</p>
      <p class="text-sm text-slate-500 mt-2">先選難度（初／中／高），主題（D1–D7）可選可不選，隨機抽 ${TESTN} 題。音檔只播一次，完成後才檢討。</p></button></div>
    <button onclick="openBook()" class="${btn} ${line} w-full">★ 錯題本 ${nSaved}</button>`;
  const cnt = {};
  Object.values(R.rec).forEach(r => { if (!r.ok && TR[r.trap]) cnt[r.trap] = (cnt[r.trap] || 0) + 1; });
  const top3 = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  if (top3.length) h += `<h2 class="font-bold mt-8 mb-2">你常中的陷阱（依最近一次作答）</h2><div class="flex flex-wrap gap-2">${top3.map(([k, v]) => `<span class="${chip}">${TR[k]} × ${v}</span>`).join('')}</div>`;
  return h;
}
/* 練習：依組別 + 跨組篩選 */
function practiceH() {
  let h = hdr('練習', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-4">每組 6 題，聽四句敘述選出符合照片的一句。</p>`;
  const sets = [...new Set(DATA.map(x => x.set))].sort((a, b) => a - b);
  h += `<div class="space-y-3 mb-8">`;
  sets.forEach(n => {
    const it = DATA.filter(x => x.set === n), o = R.sets['s' + n];
    const tiers = ['easy', 'medium', 'hard'].filter(t => it.some(x => tierOf(x) === t)).map(t => TIER[t]);
    const types = [...new Set(it.map(x => PT[x.photo_type]).filter(Boolean))];
    h += `<div class="${card} p-4"><div class="flex items-center justify-between gap-2"><div><p class="font-bold">Set ${n}</p>
      <p class="text-xs text-slate-500 mt-0.5">${it.length}/6 題${it.length < 6 ? '（建置中）' : ''} · ${o ? `最佳 ${o.best}/${it.length}` : '尚未作答'}</p></div>
      <button onclick="startSet(${n})" class="${btn} ${pri} !py-2 shrink-0">開始練習</button></div>
      <p class="mt-2 flex flex-wrap gap-1.5">${tiers.concat(types).map(t => `<span class="${chip}">${t}</span>`).join('')}</p></div>`;
  });
  h += `</div><h2 class="font-bold mb-2">自由篩選（跨組隨機練習）</h2>`;
  h += `<p class="text-xs text-slate-400 mb-1">難度</p><div class="flex flex-wrap gap-2 mb-3">${Object.keys(TIER).map(k => fbtn('fd', k, TIER[k], pool(k, V.fm, V.ft, V.ff).length)).join('')}</div>`;
  h += `<p class="text-xs text-slate-400 mb-1">主題</p><div class="flex flex-wrap gap-2 mb-3">${Object.keys(DOM).map(k => fbtn('fm', k, domLabel(k), pool(V.fd, k, V.ft, V.ff).length)).join('')}</div>`;
  h += `<p class="text-xs text-slate-400 mb-1">類型</p><div class="flex flex-wrap gap-2 mb-3">${Object.keys(PT).map(k => fbtn('ft', k, PT[k], pool(V.fd, V.fm, k, V.ff).length)).join('')}</div>`;
  h += `<p class="text-xs text-slate-400 mb-1">重點</p><div class="flex flex-wrap gap-2 mb-3">${Object.keys(FO).map(k => fbtn('ff', k, FO[k], pool(V.fd, V.fm, V.ft, k).length)).join('')}</div>`;
  const m = matches(), any = V.ft || V.ff || V.fd || V.fm;
  h += any ? `<button onclick="startDrill()" ${m.length ? '' : 'disabled'} class="${btn} ${pri}">練習符合的 ${m.length} 題（隨機）</button>` : '<p class="text-xs text-slate-400">選任一條件後，可跨組隨機練習（可複選不同列的條件）。</p>';
  return h;
}
/* 測驗：選難度 → 選主題 → 開始 */
function testH() {
  let h = hdr('測驗', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件從題庫隨機抽 ${TESTN} 題。音檔只播放一次，作答中不顯示對錯，完成後一次檢討。</p>`;
  h += `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tt', null, '不限難度', pool(null, V.tm).length)}${Object.keys(TIER).map(k => fbtn('tt', k, TIER[k], pool(k, V.tm).length)).join('')}</div>
    <p class="text-xs text-slate-400 mb-5">初級 ≈ 多益 550 分以下；中級 600–650；高級 700 以上。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-1">${fbtn('tm', null, '不限主題', pool(V.tt, null).length)}${Object.keys(DOM).map(k => fbtn('tm', k, domLabel(k), pool(V.tt, k).length)).join('')}</div>
    <p class="text-xs text-slate-400 mb-5">${V.tm ? '只從「' + domLabel(V.tm) + '」抽題；再點一次可取消。' : '不限主題：依上面選的難度，從所有主題隨機抽題。'}</p>`;
  const n = pool(V.tt, V.tm).length, o = R.tests[tcKey()];
  h += `<button onclick="startTest()" ${n ? '' : 'disabled'} class="${btn} ${pri} w-full">開始測驗（${Math.min(n, TESTN)} 題）</button>`;
  if (!n) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有題目，請換一個條件。</p>`;
  else if (n < TESTN) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${n} 題，將全部出題。</p>`;
  if (o) h += `<p class="text-xs text-slate-500 mt-3">這個組合的紀錄：最佳 ${o.best}% · 最近一次 ${o.last}%</p>`;
  return h;
}
function render() {
  document.documentElement.classList.toggle('dark', !!S.dark);
  const v = V.view;
  main.innerHTML = v === 'run' ? runH() : v === 'result' ? resultH() : v === 'book' ? bookH() : v === 'practice' ? practiceH() : v === 'test' ? testH() : homeH();
}

/* ---------- 啟動：讀取 photo.json；雙擊開啟（file://）時改用手動選取 ---------- */
function loadText(t) {
  try {
    const j = JSON.parse(t), d = j && j._spec && j._spec.domains;
    if (d && typeof d === 'object') { // 主題名稱與 scene 對照以 photo.json 為準
      const m = {}; Object.keys(d).forEach(k => { const v = d[k]; if (v && v.name) m[k] = { n: v.name, scenes: v.scenes || [] }; });
      if (Object.keys(m).length) DOM = m;
    }
    DATA = itemsOf(j).filter(x => x && x.id && Array.isArray(x.statements) && x.statements.length === 4);
    render();
  } catch (e) { alert('photo.json 格式有誤：' + e.message); }
}
function pickJson(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8'); }
async function boot() {
  try {
    const res = await fetch('photo.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    loadText(await res.text());
  } catch (e) {
    main.innerHTML = `<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 photo.json</h3>
      <p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取。請選擇同資料夾的 photo.json；上傳到 GitHub Pages 或用本機伺服器開啟則會自動載入。</p>
      <label class="${btn} inline-block ${pri}">選取 photo.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`;
  }
}
boot();
