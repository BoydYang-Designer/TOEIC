/* Part 7 閱讀理解（階段 1–3：練習、錯題本、模擬測驗、結果頁、提報、維護頁）。版型以 Part 1 為準（PART_UI_GUIDE.md），題組格式見 part7_設計指引.md。
   題庫 part7.json（一組＝1–3 份文件＋2–5 題）。記錄存在 toeicPart7V1（rec／saved／rot／stat／tests／reports），KEY 只讀寫 dark。
   key＝「組id#n」。音訊：audio/index.json 的 p7.complete 含「{id}-d{k}」→ 播 audio/p7/{id}-d{k}.mp3，否則瀏覽器 TTS。自成一體，不依賴 audio.js。
   畫面：home／practice／book／run／result／test／reports／maint。模擬測驗的作答資料先放在 run.ans，交卷時才一次寫進 rec／saved／stat／rot／tests。 */
const KEY = 'toeicCoachV2', PK = 'toeicPart7V1';
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
let R = { rec: {}, saved: {}, rot: {}, stat: {}, tests: {}, reports: [] };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
['rec', 'saved', 'rot', 'stat', 'tests'].forEach(k => { if (!R[k] || typeof R[k] !== 'object' || Array.isArray(R[k])) R[k] = {}; });
if (!Array.isArray(R.reports)) R.reports = [];
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };
let DATA = [], SPEC = null;
const L = 'ABCD', PERQ = 3, SLOW = 120, NOAUD = ['form', 'invoice', 'schedule', 'table'];
const TIER = { easy: '初級', medium: '中級', hard: '高級' };
let DOM = { d1: '辦公室', d2: '餐廳飲食', d3: '商店購物', d4: '街道與交通', d5: '工地與倉庫', d6: '旅館與居家', d7: '戶外與公園' };
let FMT = { single: '單篇', double: '雙篇', triple: '三篇' };
let QT = { purpose: '總覽', detail: '細節', notTrue: 'NOT／TRUE', inference: '推論', vocab: '詞彙同義', intent: '說話意圖', insert: '句子插入位置' };
let KD = { email: '電子郵件', letter: '書信', memo: '備忘錄', notice: '公告', article: '文章', ad: '廣告', review: '評論', webpage: '網頁', form: '表單', invoice: '發票', schedule: '時間表', table: '表格', chat: '線上聊天／簡訊串' };
let TR = { unmentioned: '文中沒提', distort: '扭曲細節', opposite: '與原文相反', partial: '只對一半', overreach: '過度推論', wrongdoc: '張冠李戴', commonmeaning: '熟義陷阱', nearmeaning: '近義但語境不符', position: '位置錯誤' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');
let V = { view: 'home', ft: null, fd: null, ff: null, fq: null, fk: null, run: null, dt: 0, all: false, scroll: null, rp: false, tm: null, mf: { d: null, t: null }, nw: { d: 'd1', t: 'medium', f: 'single', k: [], n: 1, q: [] } };
const tier = x => (x.level && x.level.tier) || 'medium';
const find = id => DATA.find(x => x.id === id);
const qkey = (x, q) => x.id + '#' + q.n;
const isInt = q => (q.src || []).length >= 2;
const okItem = x => !!(x && x.id && Array.isArray(x.docs) && x.docs.length && Array.isArray(x.questions) && x.questions.length && x.questions.every(q => Array.isArray(q.options) && q.options.length === 4 && q.options.filter(o => o.ok).length === 1));
const pool = () => DATA.filter(x => (!V.ft || tier(x) === V.ft) && (!V.fd || x.domain === V.fd) && (!V.ff || x.format === V.ff) && (!V.fq || x.questions.some(q => q.type === V.fq)) && (!V.fk || x.docs.some(d => d.kind === V.fk)));
const readable = d => d.read !== false && !NOAUD.includes(d.kind);
const nQ = ids => ids.reduce((s, id) => s + find(id).questions.length, 0);

/* ---------- 音訊（依文件播放） ---------- */
let AUI = null;
const AU = new Set(), P = { tok: 0, a: new Audio(), vs: [], rate: 1, cur: null };
async function auLoad() { AU.clear(); AUI = null; try { const j = await (await fetch('audio/index.json', { cache: 'no-store' })).json(); AUI = j.p7 || {}; (AUI.complete || []).forEach(i => AU.add(i)); } catch (e) {} }
const hasTTS = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const VBAD = /novelty|fred|albert|bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;
const vsc = v => { const n = v.name + ' ' + v.voiceURI; let s = 0; if (/premium|enhanced|增強|高品質|進階|natural|online/i.test(n)) s += 10; if (/google/i.test(n)) s += 5; if (/^en[-_]US$/i.test(v.lang)) s += 3; if (/^en[-_](IN|ZA|IE|SG|PH)$/i.test(v.lang)) s -= 5; if (VBAD.test(v.name)) s -= 50; return s; };
const isTZ = v => !!v && /\b(Tom|Zoe)\b/i.test(v.name);
if (hasTTS()) { const g = () => { try { P.vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)).sort((a, b) => vsc(b) - vsc(a)); } catch (e) {} }; g(); try { speechSynthesis.addEventListener('voiceschanged', g); } catch (e) {} }
const voiceFor = g => { const us = P.vs.filter(v => /^en[-_]US$/i.test(v.lang)); return g === 'F' ? (us.find(v => /\bZoe\b/i.test(v.name)) || P.vs.find(v => /female|samantha|zira|karen|susan|hazel|jenny|aria|victoria/i.test(v.name))) : (us.find(v => /\bTom\b/i.test(v.name)) || P.vs.find(v => /david|james|daniel|alex|fred|mark|george|guy|ryan|\bmale/i.test(v.name) && !/female/i.test(v.name))); };
const strip = s => String(s).replace(/\s*\[[1-4]\]\s*/g, ' ').replace(/\s+/g, ' ').trim();   // 插入題的標記不念
function chunks(d) {   // 朗讀片段：[{text, g}]；chat 不念姓名與時間
  const g = d.voice === 'M' ? 'M' : 'F';
  if (d.say) return [{ text: d.say, g }];
  if (d.kind === 'chat') return (d.messages || []).map(m => ({ text: m.t, g: ((d.speakers || {})[m.who]) === 'M' ? 'M' : 'F' }));
  return (d.head || []).concat(d.body || []).map(t => ({ text: strip(t), g })).filter(c => c.text);
}
const dkey = (x, k) => x.id + '-d' + (k + 1);
function stop() {
  P.tok++; try { P.a.onended = null; P.a.onerror = null; P.a.pause(); } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {} P.cur = null; paintAudio();
}
function speakChunk(c, tok, done) {
  let fin = false; const end = () => { if (fin) return; fin = true; if (tok === P.tok) setTimeout(done, 400); };
  if (!hasTTS()) return end();
  const u = new SpeechSynthesisUtterance(c.text), v = voiceFor(c.g) || P.vs[0];
  u.lang = v ? v.lang : 'en-US'; if (v) u.voice = v; u.pitch = isTZ(v) ? 1 : (c.g === 'F' ? 1.2 : 0.8); u.rate = Math.max(.5, Math.min(2, .95 * P.rate)); u.onend = end; u.onerror = end;
  try { speechSynthesis.speak(u); } catch (e) { end(); }
}
function playDoc(id, k) {
  const x = find(id); if (!x) return; const cur = id + ':' + k;
  if (P.cur === cur) { stop(); return; }
  stop(); const tok = P.tok; P.cur = cur; paintAudio();
  const fin = () => { if (tok === P.tok) { P.cur = null; paintAudio(); } };
  if (AU.has(dkey(x, k))) {
    const a = P.a; a.onended = fin; a.onerror = fin; a.src = 'audio/p7/' + dkey(x, k) + '.mp3';
    try { a.defaultPlaybackRate = P.rate; a.playbackRate = P.rate; a.preservesPitch = true; a.webkitPreservesPitch = true; } catch (e) {}
    try { const pr = a.play(); if (pr && pr.catch) pr.catch(fin); } catch (e) { fin(); }
    return;
  }
  const cs = chunks(x.docs[k]); let i = 0;
  const next = () => { if (tok !== P.tok) return; if (i >= cs.length) return fin(); speakChunk(cs[i++], tok, next); };
  next();
}
function setRate(v) { P.rate = v; try { P.a.playbackRate = v; } catch (e) {} paintAudio(); }
function speakWord(w) { stop(); if (!hasTTS()) return; try { const u = new SpeechSynthesisUtterance(w), v = voiceFor('F') || P.vs[0]; u.lang = v ? v.lang : 'en-US'; u.rate = .9; if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) {} }
function paintAudio() {
  document.querySelectorAll('[data-play]').forEach(b => { b.textContent = P.cur === b.dataset.play ? '⏹ 停止' : '▶ 播放這篇'; });
  document.querySelectorAll('[data-rate]').forEach(b => { const on = +b.dataset.rate === P.rate; b.classList.toggle('bg-indigo-600', on); b.classList.toggle('text-white', on); });
}
window.addEventListener('pagehide', () => { try { stop(); } catch (e) {} });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });

/* ---------- 作答流程 ---------- */
function dealSet(x) {   // 每題的顯示順序；insert 不洗牌；正解位置不與上次相同
  const d = {};
  x.questions.forEach(q => {
    let ord = [0, 1, 2, 3];
    if (q.type !== 'insert') {
      const last = (R.rot[qkey(x, q)] || {}).last;
      for (let t = 0; t < 8; t++) { ord = shuf(ord); if (ord.findIndex(i => q.options[i].ok) !== last) break; }
    }
    d[q.n] = ord;
  });
  return d;
}
function startRun(ids, mode, key) {
  const hl = {}; ids.forEach(id => find(id).questions.forEach(q => { if (R.saved[qkey(find(id), q)]) hl[qkey(find(id), q)] = 1; }));
  V.run = { ids, i: 0, mode, key, sel: {}, secs: {}, deal: {}, hl, last: Date.now(), t0: Date.now() };
  V.dt = 0; V.all = false; stop(); V.view = 'run'; render(); window.scrollTo(0, 0);
}
const cx = () => V.run && find(V.run.ids[V.run.i]);
const dealOf = x => V.run.deal[x.id] || (V.run.deal[x.id] = dealSet(x));
function startPractice() { const l = shuf(pool().map(x => x.id)).slice(0, PERQ); if (l.length) startRun(l, 'practice', 'practice'); }
function startBook() { const l = DATA.filter(bookHas).map(x => x.id); if (l.length) startRun(l, 'book', 'book'); }
const bookHas = x => x.questions.some(q => R.saved[qkey(x, q)]);
function pick(qn, di) {
  const x = cx(), q = x.questions.find(z => z.n === qn), key = qkey(x, q); if (V.run.sel[key] !== undefined) return;
  const ord = dealOf(x)[q.n], k = ord[di], ok = !!q.options[k].ok, now = Date.now(), secs = Math.max(1, Math.round((now - V.run.last) / 1000));
  V.run.last = now; V.run.sel[key] = k; V.run.secs[key] = secs;
  R.rec[key] = { ok, k, secs, t: now }; const st = R.stat[key] || (R.stat[key] = { picked: [0, 0, 0, 0] }); st.picked[k] = (st.picked[k] || 0) + 1;
  R.rot[key] = { last: ord.findIndex(i => q.options[i].ok) };
  if (ok) delete R.saved[key]; else R.saved[key] = 1;   // 答錯加入錯題本，答對自動移出
  saveR();
  const ev = (q.evidence || [])[0]; if (ev && !V.all) V.dt = ev.doc; V.scroll = key; render();
}
const setDone = x => x.questions.every(q => V.run.sel[qkey(x, q)] !== undefined);
function nextSet() { V.rp = false; if (V.run.i < V.run.ids.length - 1) { V.run.i++; V.run.last = Date.now(); V.dt = 0; V.all = false; stop(); render(); window.scrollTo(0, 0); } else { stop(); V.view = 'result'; render(); window.scrollTo(0, 0); } }
function go(view) { stop(); clearInterval(V.tm); V.rp = false; V.view = view; V.run = null; render(); window.scrollTo(0, 0); }
const goBack = () => go(({ book: 'book', practice: 'practice', test: 'test', reports: 'reports' })[V.run && V.run.key] || 'home');
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }
function unsave(id) { const x = find(id); if (x) x.questions.forEach(q => delete R.saved[qkey(x, q)]); saveR(); render(); }
function toggleDark() {
  S.dark = !S.dark;
  try { const c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  render();
}

/* ---------- 文件呈現與高亮 ---------- */
const shown = k => !!(V.run && V.run.mode !== 'test' && V.run.sel[k] !== undefined);   // 測驗模式交卷前不顯示作答後的任何標示
function marksFor(x, di) {   // 此刻要在文件 di 高亮的片段
  const m = [];
  x.questions.forEach(q => {
    const key = qkey(x, q), done = shown(key);
    if (q.type === 'vocab' && q.target && q.target.doc === di) m.push({ s: q.target.word, c: 'underline decoration-2 decoration-indigo-500 font-semibold', q: key });
    if (done) (q.evidence || []).forEach(e => { if (e.doc === di) m.push({ s: e.quote, c: 'bg-amber-200 dark:bg-amber-700/60 rounded px-0.5', q: key, ev: 1 }); });
  });
  return m;
}
function insInfo(x, di) {   // 此文件上的插入題
  const q = x.questions.find(z => z.type === 'insert' && z.target && z.target.doc === di); if (!q) return null;
  const done = shown(qkey(x, q)); return { q, done, at: q.options.findIndex(o => o.ok) + 1 };
}
function hl(raw, marks, ins) {
  const rs = [];
  marks.forEach(m => { const i = raw.indexOf(m.s); if (i >= 0) rs.push({ s: i, e: i + m.s.length, h: `<mark class="${m.c}"${m.ev ? ` data-ev="${m.q}"` : ''}>${esc(m.s)}</mark>` }); });
  if (ins) { const re = /\[([1-4])\]/g; let g; while ((g = re.exec(raw))) { const n = +g[1];
    rs.push({ s: g.index, e: g.index + 3, h: ins.done && n === ins.at ? `<span class="bg-emerald-100 dark:bg-emerald-900/60 rounded px-1" data-ev="${qkey({ id: ins.x }, ins.q)}">${esc(ins.q.target.sentence)}</span>` : (ins.done ? '' : `<span class="inline-block text-[11px] font-bold px-1 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200 align-baseline">[${n}]</span>`) }); } }
  rs.sort((a, b) => a.s - b.s); let out = '', p = 0;
  rs.forEach(r => { if (r.s < p) return; out += esc(raw.slice(p, r.s)) + r.h; p = r.e; });
  return out + esc(raw.slice(p));
}
function docH(x, di) {
  const d = x.docs[di], mk = marksFor(x, di), ii = insInfo(x, di); if (ii) ii.x = x.id;
  const H = t => hl(t, mk, null);
  const intent = new Set(x.questions.filter(q => q.type === 'intent' && q.target && q.target.doc === di).map(q => q.target.msg));
  let body = '';
  if (d.kind === 'chat') {
    const sp = Object.keys(d.speakers || {});
    body = `<div class="space-y-2">${(d.messages || []).map((m, i) => { const right = sp.indexOf(m.who) % 2 === 1;
      return `<div class="flex ${right ? 'justify-end' : ''}"><div class="max-w-[85%] rounded-2xl px-3 py-2 text-sm ${right ? 'bg-indigo-50 dark:bg-indigo-950/60' : 'bg-slate-100 dark:bg-slate-800'} ${intent.has(i) ? 'ring-2 ring-indigo-500' : ''}"><div class="text-[11px] text-slate-500 mb-0.5">${esc(m.who)} · ${esc(m.time)}</div>${H(m.t)}</div></div>`; }).join('')}</div>`;
  } else {
    body = (d.head && d.head.length ? `<div class="text-sm font-semibold mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">${d.head.map(t => `<div>${H(t)}</div>`).join('')}</div>` : '')
      + (d.body || []).map((t, i) => `<p class="text-sm leading-relaxed mb-3"><span class="text-[10px] text-slate-400 mr-1 select-none">¶${i + 1}</span>${hl(t, mk, ii)}</p>`).join('');
  }
  if (d.table) body += `<div class="overflow-x-auto mt-2"><table class="text-sm border-collapse"><thead><tr>${d.table.header.map(h => `<th class="border border-slate-300 dark:border-slate-700 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-left">${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.table.rows.map(r => `<tr>${r.map(c => `<td class="border border-slate-300 dark:border-slate-700 px-3 py-1">${H(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const aud = readable(d) && !(V.run && V.run.mode === 'test') ? `<div class="flex flex-wrap items-center gap-2 mb-3"><button data-play="${x.id}:${di}" onclick="playDoc(this.dataset.play.split(':')[0],+this.dataset.play.split(':')[1])" class="${btn} ${line} !py-1 text-xs">▶ 播放這篇</button>${[.75, 1, 1.25].map(r => `<button data-rate="${r}" onclick="setRate(+this.dataset.rate)" class="${btn} ${line} !py-1 !px-2 text-xs">${r}×</button>`).join('')}<span class="text-[11px] text-slate-400">${AU.has(dkey(x, di)) ? '錄音檔' : '機器發音'}</span></div>` : '';
  return `<div class="${card} p-4"><div class="flex items-center gap-2 mb-2"><span class="${chip}">文件 ${di + 1}</span><span class="text-xs text-slate-500">${esc(KD[d.kind] || d.label || d.kind)}</span></div>${aud}${body}</div>`;
}
function docsH(x) {
  const n = x.docs.length;
  const tabs = n > 1 ? `<div class="flex flex-wrap items-center gap-2 mb-2">${x.docs.map((d, i) => `<button onclick="V.dt=${i};V.all=false;render()" class="${btn} !py-1 text-xs ${!V.all && V.dt === i ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">文件 ${i + 1}</button>`).join('')}<button onclick="V.all=!V.all;render()" class="${btn} !py-1 text-xs ${V.all ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">全部顯示</button></div>` : '';
  const show = V.all || n === 1 ? x.docs.map((_, i) => i) : [Math.min(V.dt, n - 1)];
  return tabs + `<div class="space-y-3">${show.map(i => docH(x, i)).join('')}</div>`;
}

/* ---------- 題目 ---------- */
function qH(x, q) {
  const key = qkey(x, q), sel = V.run.sel[key], done = sel !== undefined, ord = dealOf(x)[q.n];
  const opts = ord.map((k, di) => {
    const o = q.options[k], isSel = sel === k;
    const cls = !done ? 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800' : o.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : isSel ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40' : 'border-slate-200 dark:border-slate-800 opacity-50';
    const lab = q.type === 'insert' ? '' : `<span class="font-bold mr-2">${L[di]}</span>`;
    return `<button ${done ? 'disabled' : ''} data-q="${q.n}" data-di="${di}" onclick="pick(+this.dataset.q,+this.dataset.di)" class="w-full text-left rounded-lg border px-3 py-2.5 text-sm ${cls}">${lab}${esc(o.t)}${done ? `<div class="text-xs text-slate-500 mt-0.5">${esc(o.zh)}</div>` : ''}</button>`;
  }).join('');
  let why = '';
  if (done) {
    why = `<div class="mt-3 space-y-1.5">${isInt(q) ? `<div class="text-xs rounded-lg px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">這是整合題：需要文件 ${q.src.map(i => i + 1).join('＋')}</div>` : ''}`
      + ord.map((k, di) => { const o = q.options[k]; return `<div class="text-xs rounded-lg px-2.5 py-1.5 ${o.ok ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200' : sel === k ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200' : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300'}"><b>${q.type === 'insert' ? esc(o.t) : L[di]}</b> ${!o.ok && o.trap ? `<span class="${chip} !py-0 mr-1">${esc(TR[o.trap] || o.trap)}</span>` : ''}${esc(o.why)}</div>`; }).join('') + '</div>';
  }
  const ins = q.type === 'insert' && q.target ? `<div class="rounded-lg border border-dashed border-indigo-400 px-3 py-2 text-sm mb-3 bg-indigo-50/50 dark:bg-indigo-950/30">${esc(q.target.sentence)}${done ? `<div class="text-xs text-slate-500 mt-0.5">${esc(q.target.sentence_zh || '')}</div>` : ''}</div>` : '';
  const sl = done && V.run.secs[key] > SLOW ? `<span class="text-xs text-amber-600 ml-2">偏慢 ${V.run.secs[key]} 秒</span>` : '';
  return `<div class="${card} p-4 ${V.run.hl[key] && !done ? 'ring-2 ring-amber-400' : ''}"><div class="flex items-center gap-2 mb-2"><span class="${chip}">Q${q.n}</span><span class="text-xs text-slate-500">${esc(QT[q.type] || q.type)}</span>${V.run.hl[key] && !done ? '<span class="text-xs text-amber-600">上次答錯</span>' : ''}${sl}</div>
    <div class="text-sm font-medium">${esc(q.stem)}</div>${done ? `<div class="text-xs text-slate-500 mt-0.5 mb-2">${esc(q.stem_zh)}</div>` : '<div class="mb-2"></div>'}${ins}<div class="space-y-2">${opts}</div>${why}</div>`;
}
function reviewH(x) {
  const tot = x.questions.reduce((s, q) => s + (V.run.secs[qkey(x, q)] || 0), 0);
  const zh = x.docs.map((d, i) => `<div class="mb-2"><div class="text-xs font-bold mb-1">文件 ${i + 1}</div>${d.kind === 'chat' ? (d.messages || []).map(m => `<div class="text-xs"><b>${esc(m.who)}</b> ${esc(m.zh)}</div>`).join('') : (d.zh || []).map(t => `<p class="text-xs mb-1">${esc(t)}</p>`).join('')}</div>`).join('');
  return `<div class="${card} p-4 mt-4"><div class="flex flex-wrap items-center gap-2 mb-3"><b class="text-sm">本組完成</b><span class="${chip}">${x.questions.filter(q => q.options[V.run.sel[qkey(x, q)]].ok).length} / ${x.questions.length} 題答對</span><span class="${chip}">用時 ${tot} 秒</span></div>
    <details class="mb-2" open><summary class="text-sm font-bold cursor-pointer">解題線索</summary>${x.questions.map(q => `<div class="mt-2 text-xs"><b>Q${q.n}</b>（${esc(QT[q.type] || q.type)}）<ol class="list-decimal pl-5 text-slate-600 dark:text-slate-300">${q.clue.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`).join('')}</details>
    <details class="mb-2"><summary class="text-sm font-bold cursor-pointer">全文中文翻譯</summary><div class="mt-2">${zh}</div></details>
    ${(x.vocab || []).length ? `<div class="text-sm font-bold mb-1 mt-3">本組單字（點擊發音）</div><div class="flex flex-wrap gap-2">${x.vocab.map(v => `<button data-w="${esc(v.word)}" onclick="speakWord(this.dataset.w)" class="${btn} ${line} !py-1 text-xs text-left"><b>${esc(v.word)}</b> <span class="text-slate-400">${esc(v.ipa || '')}</span><br>${esc(v.pos || '')} ${esc(v.zh || '')}<br><span class="text-slate-400">${esc(v.col || '')}</span></button>`).join('')}</div>` : ''}</div>`;
}

/* ---------- 畫面 ---------- */
function hdr(title, back) {
  const b = back ? `<button onclick="${back}" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>` : `<a href="index.html" class="${btn} ${line} !py-1.5 shrink-0" aria-label="回到首頁">⌂</a>`;
  return `<header class="flex items-center justify-between gap-2 mb-5"><div class="flex items-center gap-2 min-w-0">${b}<h1 class="text-lg md:text-2xl font-bold truncate">${esc(title)}</h1></div>
    <button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button></header>`;
}
function fbtn(k, v, label, n) {
  const on = (V[k] || null) === v;
  return `<button data-k="${k}" data-v="${v == null ? '' : v}" onclick="setF(this.dataset.k,this.dataset.v||null)" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${n === 0 ? ' opacity-40' : ''}">${esc(label)}${n == null ? '' : ` <span class="text-xs opacity-70">${n}</span>`}</button>`;
}
function runH() {
  if (V.run.mode === 'test') return testRunH();
  const x = cx(), r = V.run, done = setDone(x), nA = x.questions.filter(q => r.sel[qkey(x, q)] !== undefined).length;
  const sec = x.format === 'single' ? 60 : 65, lim = x.questions.length * sec;
  const nextBtn = done ? `<button onclick="nextSet()" class="${btn} ${pri} !py-1.5">${r.i < r.ids.length - 1 ? '下一組 →' : '完成，看結果'}</button>` : ''; // 整組答完才出現，放在上方控制列（Part 7 無播放鈕、不自動播放）
  return hdr(`${r.mode === 'book' ? '錯題本' : '練習'} · 第 ${r.i + 1} / ${r.ids.length} 組`, 'if(V.run&&Object.keys(V.run.sel).length&&!confirm(\'離開後本次練習不會繼續，確定嗎？\'))void 0;else goBack()')
    + `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-3"><div class="h-1.5 rounded bg-indigo-600" style="width:${Math.round(nA / x.questions.length * 100)}%"></div></div>
    <div class="flex flex-wrap items-center gap-2 mb-3"><span class="${chip}">${esc(x.id)}</span><span class="${chip}">${esc(FMT[x.format] || x.format)}</span><span class="${chip}">${esc(TIER[tier(x)] || '')}</span><span class="${chip}">建議 ${lim} 秒</span>${nextBtn}<button onclick="V.rp=!V.rp;render()" class="${btn} ${line} !py-1 text-xs ml-auto">⚑ 提報</button></div>${V.rp ? rpH(x) : ''}
    <details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">解題提示</summary><ul class="list-disc pl-5 mt-1"><li>先瀏覽題目 10–15 秒再讀文章</li><li>NOT 題最後做</li><li>整合題先找共同連結點（人名、日期、產品）</li></ul></details>
    <div class="grid md:grid-cols-2 gap-4 items-start"><div class="md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">${docsH(x)}</div><div class="space-y-3">${x.questions.map(q => qH(x, q)).join('')}${done ? reviewH(x) : ''}</div></div>`;
}
function resultH() {
  const r = V.run || V.last, test = r.mode === 'test', ids = r.ids, rows = [];
  ids.forEach(id => { const x = find(id); x.questions.forEach(q => { const k = r.sel[qkey(x, q)]; if (k !== undefined) rows.push({ x, q, k, ok: k >= 0 && !!q.options[k].ok, secs: r.secs[qkey(x, q)] || 0 }); }); });
  const n = rows.length, c = rows.filter(z => z.ok).length, pct = n ? Math.round(c / n * 100) : 0, tot = test && r.wall != null ? r.wall : rows.reduce((s, z) => s + z.secs, 0), slow = rows.filter(z => z.secs > SLOW).length, un = rows.filter(z => z.k < 0).length;
  const grp = f => { const m = {}; rows.forEach(z => { const k = f(z); (m[k] = m[k] || [0, 0]); m[k][1]++; if (z.ok) m[k][0]++; }); return m; };
  const bars = (m, nm) => Object.keys(m).map(k => `<div class="flex items-center gap-2 text-xs mb-1"><span class="w-24 shrink-0 truncate">${esc(nm(k))}</span><div class="flex-1 h-2 rounded bg-slate-200 dark:bg-slate-800"><div class="h-2 rounded ${m[k][0] / m[k][1] >= .75 ? 'bg-emerald-500' : 'bg-amber-500'}" style="width:${Math.round(m[k][0] / m[k][1] * 100)}%"></div></div><span class="w-12 text-right">${m[k][0]}/${m[k][1]}</span></div>`).join('');
  const trap = {}; rows.filter(z => !z.ok && z.k >= 0).forEach(z => { const o = z.q.options[z.k]; if (o.trap) trap[o.trap] = (trap[o.trap] || 0) + 1; });
  const bad = ids.filter(id => rows.some(z => z.x.id === id && !z.ok));
  const BK = { book: ['book', '錯題本'], practice: ['practice', '練習選單'], test: ['test', '測驗選單'], reports: ['reports', '提報清單'] }, bk = BK[r.key] || BK.practice;
  const again = r.key === 'book' ? 'startBook()' : r.key === 'test' ? `startTest('${r.tmode}')` : r.key === 'practice' ? 'startPractice()' : '';
  const againLab = r.key === 'book' ? '再做錯題' : r.key === 'test' ? '再測一次（重新抽題）' : '再練一次（重新抽題）';
  const over = test && r.limit != null ? (tot > r.limit ? `<span class="text-amber-600">超時 ${mmss(tot - r.limit)}</span>` : `<span class="text-emerald-600">時限內</span>`) : '';
  return hdr(test ? '測驗結果' : '作答結果') + `<div class="${card} p-6 text-center mb-4"><div class="text-4xl font-bold ${pct >= 75 ? 'text-emerald-600' : 'text-amber-600'}">${c} / ${n}</div><div class="text-sm text-slate-500 mt-1">答對率 ${pct}% · 總用時 ${test ? mmss(tot) : tot + ' 秒'} · 平均 ${n ? Math.round(tot / n) : 0} 秒／題 · 偏慢 ${slow} 題${un ? ` · 未作答 ${un} 題` : ''}</div>${test ? `<div class="text-xs text-slate-500 mt-1">${esc(TM[r.tmode] || '')} · 限時 ${mmss(r.limit)} ${over}</div>` : ''}
    <div class="grid ${again ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mt-4"><button onclick="go('${bk[0]}')" class="${btn} ${line}">回${bk[1]}</button>${again ? `<button onclick="${again}" class="${btn} ${pri}">${againLab}</button>` : ''}</div></div>
    <div class="${card} p-4 mb-4"><h2 class="font-bold text-sm mb-2">各題型正確率</h2>${bars(grp(z => z.q.type), k => QT[k] || k)}<h2 class="font-bold text-sm mb-2 mt-4">整合題 vs 單篇題</h2>${bars(grp(z => isInt(z.q) ? '整合題' : '單文件題'), k => k)}<h2 class="font-bold text-sm mb-2 mt-4">組別</h2>${bars(grp(z => z.x.format), k => FMT[k] || k)}${ids.length > 1 ? `<h2 class="font-bold text-sm mb-2 mt-4">各組成績</h2>${bars(grp(z => z.x.id), k => k)}` : ''}
    ${Object.keys(trap).length ? `<h2 class="font-bold text-sm mb-2 mt-4">你常中的陷阱</h2><div class="flex flex-wrap gap-2">${Object.keys(trap).sort((a, b) => trap[b] - trap[a]).map(k => `<span class="${chip}">${esc(TR[k] || k)} ×${trap[k]}</span>`).join('')}</div>` : ''}</div>
    ${bad.length ? `<h2 class="font-bold mb-2">答錯的題組${test ? '（已加入錯題本）' : ''}</h2>` + bad.map(id => { const x = find(id); return `<details class="${card} p-3 mb-2"><summary class="cursor-pointer text-sm"><b class="text-rose-600">✗</b> ${esc(x.id)} · ${esc(x.tag)}</summary>${rows.filter(z => z.x.id === id && !z.ok).map(z => `<div class="mt-2 text-xs"><b>Q${z.q.n}</b> ${esc(z.q.stem)}<div class="text-rose-600">你的答案：${z.k < 0 ? '未作答' : esc(z.q.options[z.k].t)}</div><div class="text-emerald-700 dark:text-emerald-400">正解：${esc(z.q.options.find(o => o.ok).t)}</div><div class="text-slate-500">${esc(z.q.options.find(o => o.ok).why)}</div><ul class="pl-4 mt-1">${z.q.options.map(o => `<li class="${o.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}">${o.ok ? '✔' : '✗'} ${esc(o.t)}${o.trap ? ` <span class="${chip} !py-0">${esc(TR[o.trap] || o.trap)}</span>` : ''}</li>`).join('')}</ul><div class="text-slate-400 mt-1">證據：${(z.q.evidence || []).map(e => `文件 ${e.doc + 1}「${esc(e.quote)}」`).join('；')}</div></div>`).join('')}</details>`; }).join('') : `<p class="text-sm text-center text-emerald-600">全部答對！</p>`}`;
}
function bookH() {
  const xs = DATA.filter(bookHas);
  return hdr('錯題本', 'goHome()') + (xs.length ? `<button onclick="startBook()" class="${btn} ${pri} w-full mb-4">重做這 ${xs.length} 組</button>` + xs.map(x => `<div class="${card} p-4 mb-3"><div class="flex items-center justify-between gap-2 mb-1"><div class="text-sm font-bold">${esc(x.id)} · ${esc(x.tag)}</div><button data-id="${x.id}" onclick="unsave(this.dataset.id)" class="text-xs text-rose-500 cursor-pointer">移除</button></div><div class="flex flex-wrap gap-2"><span class="${chip}">${esc(FMT[x.format])}</span><span class="${chip}">答錯 ${x.questions.filter(q => R.saved[qkey(x, q)]).map(q => 'Q' + q.n).join('、')}</span></div></div>`).join('') : `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`);
}
const goHome = () => go('home');
function homeH() {
  if (!DATA.length) return hdr('Part 7 閱讀理解') + `<div class="${card} p-8 text-center text-sm text-slate-500">題庫是空的。</div>`;
  const nb = DATA.filter(bookHas).length;
  return hdr('Part 7 閱讀理解') + `<div class="grid gap-3 md:grid-cols-2 mb-4"><button onclick="go('practice')" class="${card} p-5 text-left cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950"><div class="text-xl font-bold">練習</div><div class="text-sm text-slate-500">一次一組 · 作答後立即看解析與證據</div></button>
    <button onclick="go('test')" class="${card} p-5 text-left cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950"><div class="text-xl font-bold">測驗</div><div class="text-sm text-slate-500">模擬測驗 · 單組／迷你／完整版 · 交卷後才看結果</div></button></div>
    <div class="grid grid-cols-3 gap-3 mb-6"><button onclick="go('book')" class="${btn} ${line}">★ 錯題本 ${nb}</button><button onclick="go('reports')" class="${btn} ${line}">⚑ 提報 ${R.reports.length}</button><button onclick="go('maint')" class="${btn} ${line}">🛠 維護</button></div>`;
}
function practiceH() {
  const m = pool(), cnt = (k, v) => DATA.filter(x => { const sv = V[k]; V[k] = v; const r = pool().includes(x); V[k] = sv; return r; }).length;
  const kinds = [...new Set(DATA.flatMap(x => x.docs.map(d => d.kind)))];
  const sec = (t, opt, inner, hint) => `<h2 class="font-bold mb-2">${t}${opt ? ' <span class="text-xs font-normal text-slate-400">（可不選）</span>' : ''}</h2><div class="flex flex-wrap gap-2 mb-1">${inner}</div><div class="text-xs text-slate-400 mb-5">${hint || ''}</div>`;
  return hdr('練習', 'goHome()') + `<p class="text-sm text-slate-500 mb-5">每次最多出 ${PERQ} 組；作答後立即顯示解析，並在文件中標出證據。</p>`
    + sec('1. 選難度', 0, fbtn('ft', null, '不限難度', cnt('ft', null)) + Object.keys(TIER).map(k => fbtn('ft', k, TIER[k], cnt('ft', k))).join(''), '初級 500–550・中級 600–650・高級 700–800')
    + sec('2. 選主題', 0, fbtn('fd', null, '不限主題', cnt('fd', null)) + Object.keys(DOM).map(k => fbtn('fd', k, k.toUpperCase() + ' ' + DOM[k], cnt('fd', k))).join(''), '再點一次已選的項目可取消')
    + sec('3. 選組別', 1, fbtn('ff', null, '不限', cnt('ff', null)) + Object.keys(FMT).map(k => fbtn('ff', k, FMT[k], cnt('ff', k))).join(''), '雙篇、三篇含整合題')
    + sec('4. 選題型', 1, fbtn('fq', null, '不限', cnt('fq', null)) + Object.keys(QT).map(k => fbtn('fq', k, QT[k], cnt('fq', k))).join(''), '')
    + sec('5. 選文件類型', 1, fbtn('fk', null, '不限', cnt('fk', null)) + kinds.map(k => fbtn('fk', k, KD[k] || k, cnt('fk', k))).join(''), '')
    + `<button onclick="startPractice()" ${m.length ? '' : 'disabled'} class="${btn} ${pri} w-full">開始練習（${Math.min(m.length, PERQ)} 組）</button>`
    + (m.length ? (m.length < PERQ ? `<div class="text-xs text-amber-600 mt-2">符合的題組只有 ${m.length} 組，會全部出題。</div>` : '') : `<div class="text-xs text-rose-500 mt-2">沒有符合的題組，請換一個條件。</div>`);
}
function render() {
  document.documentElement.classList.toggle('dark', !!S.dark);
  const v = V.view;
  main.className = (v === 'run' ? 'max-w-6xl' : 'max-w-3xl') + ' mx-auto p-3 md:p-8 pb-16';
  main.innerHTML = v === 'run' ? runH() : v === 'result' ? resultH() : v === 'book' ? bookH() : v === 'practice' ? practiceH() : v === 'test' ? testH() : v === 'reports' ? reportsH() : v === 'maint' ? maintH() : homeH();
  if (v === 'result' && V.run) { V.last = V.run; V.run = null; }
  paintAudio();
  if (v === 'run' && V.run && V.run.mode === 'test') updTimer();
  if (V.scroll) { const k = V.scroll; V.scroll = null; const e = [...document.querySelectorAll('[data-ev]')].find(n => n.dataset.ev === k); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

/* ---------- 模擬測驗（階段 2） ---------- */
const TM = { single: '單組', mini: '迷你', full: '完整版' };
const secOf = x => x.format === 'single' ? 60 : 65;
const nq = x => x.questions.length;
const mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
const tpool = f => DATA.filter(x => (!V.ft || tier(x) === V.ft) && (!V.fd || x.domain === V.fd) && (!f || x.format === f));
const sumQ = f => tpool(f).reduce((s, x) => s + nq(x), 0);
const fullOK = () => sumQ('single') >= 29 && sumQ('double') >= 10 && sumQ('triple') >= 15;
function buildTest(mode) {
  if (mode === 'single') { const p = tpool(V.ff); return p.length ? [shuf(p)[0].id] : []; }
  const S = tpool('single'), D = tpool('double'), T = tpool('triple');
  if (mode === 'mini') return S.length && D.length && T.length ? [shuf(S)[0].id, shuf(D)[0].id, shuf(T)[0].id] : [];
  if (!fullOK()) return [];
  const take = (p, goal) => {   // 先挑不超過目標的組；還不夠就補到剛好跨過目標
    const out = []; let n = 0;
    shuf(p).forEach(x => { if (n + nq(x) <= goal) { out.push(x); n += nq(x); } });
    if (n < goal) shuf(p.filter(x => !out.includes(x))).some(x => { out.push(x); n += nq(x); return n >= goal; });
    return out;
  };
  return [].concat(take(S, 29), take(D, 10), take(T, 15)).map(x => x.id);
}
function startTest(mode) {
  const ids = buildTest(mode); if (!ids.length) return;
  const qs = []; ids.forEach(id => find(id).questions.forEach(q => qs.push({ id, n: q.n })));
  const limit = ids.reduce((s, id) => s + nq(find(id)) * secOf(find(id)), 0);
  V.run = { ids, i: 0, qi: 0, mode: 'test', tmode: mode, key: 'test', qs, ans: {}, flag: {}, ms: {}, sel: {}, secs: {}, deal: {}, hl: {}, last: Date.now(), t0: Date.now(), limit };
  const q0 = find(ids[0]).questions[0]; V.dt = (q0.src || [0])[0] || 0; V.all = false; V.rp = false;
  stop(); clearInterval(V.tm); V.tm = setInterval(updTimer, 1000);
  V.view = 'run'; render(); window.scrollTo(0, 0);
}
const tkey = c => c.id + '#' + c.n;
const tq = c => find(c.id).questions.find(z => z.n === c.n);
function tick() {   // 把這一題停留的時間累加進去
  const r = V.run; if (!r || r.mode !== 'test') return;
  const c = r.qs[r.qi], now = Date.now(); if (c) r.ms[tkey(c)] = (r.ms[tkey(c)] || 0) + (now - r.last); r.last = now;
}
function tgo(qi) {
  const r = V.run; if (!r || qi < 0 || qi >= r.qs.length) return;
  tick(); stop(); const was = r.qs[r.qi].id; r.qi = qi; const c = r.qs[qi]; r.i = r.ids.indexOf(c.id);
  V.dt = (tq(c).src || [0])[0] || 0; V.all = false; render(); if (was !== c.id) window.scrollTo(0, 0);
}
function tsel(di) {
  const r = V.run, c = r.qs[r.qi], x = find(c.id), q = tq(c), k = dealOf(x)[q.n][di], key = tkey(c);
  if (r.ans[key] === k) delete r.ans[key]; else r.ans[key] = k; paintTest();
}
function tflag() { const r = V.run, key = tkey(r.qs[r.qi]); if (r.flag[key]) delete r.flag[key]; else r.flag[key] = 1; paintTest(); }
function paintTest() { const e = document.getElementById('tq'); if (e) e.innerHTML = tqInner(); }
function updTimer() {
  const r = V.run, e = document.getElementById('tmr');
  if (!r || r.mode !== 'test') { clearInterval(V.tm); return; } if (!e) return;
  const left = r.limit - Math.floor((Date.now() - r.t0) / 1000);
  e.textContent = left >= 0 ? '剩 ' + mmss(left) : '已超時 ' + mmss(-left); e.classList.toggle('text-rose-600', left < 0);
}
function tqInner() {
  const r = V.run, c = r.qs[r.qi], x = find(c.id), q = tq(c), key = tkey(c), ord = dealOf(x)[q.n], cur = r.ans[key];
  const opts = ord.map((k, di) => { const o = q.options[k], on = cur === k;
    return `<button onclick="tsel(${di})" class="w-full text-left rounded-lg border px-3 py-2.5 text-sm ${on ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50' : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}">${q.type === 'insert' ? '' : `<span class="font-bold mr-2">${L[di]}</span>`}${esc(o.t)}</button>`; }).join('');
  const ins = q.type === 'insert' && q.target ? `<div class="rounded-lg border border-dashed border-indigo-400 px-3 py-2 text-sm mb-3 bg-indigo-50/50 dark:bg-indigo-950/30">${esc(q.target.sentence)}</div>` : '';
  let gi = 0;
  const grid = r.ids.map((id, si) => { const xs = find(id);
    return `<div class="mb-2"><div class="text-[11px] text-slate-500 mb-1">第 ${si + 1} 組 · ${esc(FMT[xs.format] || xs.format)}</div><div class="flex flex-wrap gap-1.5">${xs.questions.map(qq => { const g = gi++, kk = id + '#' + qq.n, a = r.ans[kk] !== undefined, f = !!r.flag[kk];
      return `<button onclick="tgo(${g})" aria-label="第 ${g + 1} 題" class="w-9 h-9 rounded-lg text-xs font-bold border ${g === r.qi ? 'ring-2 ring-indigo-500 ' : ''}${f ? 'bg-amber-200 border-amber-400 text-amber-900' : a ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}">${g + 1}</button>`; }).join('')}</div></div>`; }).join('');
  const na = r.qs.filter(z => r.ans[tkey(z)] !== undefined).length, nf = Object.keys(r.flag).length, last = r.qi === r.qs.length - 1;
  return `<div class="${card} p-4"><div class="flex flex-wrap items-center gap-2 mb-2"><span class="${chip}">第 ${r.qi + 1} / ${r.qs.length} 題</span><span class="text-xs text-slate-500">第 ${r.i + 1} 組 · ${esc(FMT[x.format] || x.format)} · Q${q.n}</span><button onclick="tflag()" class="${btn} !py-1 text-xs ml-auto ${r.flag[key] ? 'bg-amber-200 text-amber-900' : line}">⚑ ${r.flag[key] ? '已標待檢查' : '待檢查'}</button></div>
    <div class="text-sm font-medium mb-3">${esc(q.stem)}</div>${ins}<div class="space-y-2">${opts}</div>
    <div class="grid grid-cols-2 gap-3 mt-4"><button onclick="tgo(${r.qi - 1})" ${r.qi === 0 ? 'disabled' : ''} class="${btn} ${line} disabled:opacity-40 disabled:cursor-not-allowed">← 上一題</button><button onclick="tgo(${r.qi + 1})" ${last ? 'disabled' : ''} class="${btn} ${line} disabled:opacity-40 disabled:cursor-not-allowed">下一題 →</button></div></div>
    <div class="${card} p-4"><div class="flex flex-wrap items-center gap-2 mb-3"><b class="text-sm">題號</b><span class="text-xs text-slate-500">已作答 ${na} / ${r.qs.length}${nf ? ` · 待檢查 ${nf}` : ''}</span></div>${grid}<div class="text-[11px] text-slate-400 mb-3">藍＝已作答　黃＝待檢查　白＝未作答</div><button onclick="submitTest()" class="${btn} ${pri} w-full">交卷</button></div>`;
}
function testRunH() {
  const r = V.run, x = cx();
  return hdr(`模擬測驗 · ${TM[r.tmode]}`, "if(confirm('離開後本次測驗不會保留，確定嗎？'))goBack()")
    + `<div class="flex flex-wrap items-center gap-2 mb-3"><span class="${chip}">限時 ${mmss(r.limit)}</span><span id="tmr" class="${chip} font-mono"></span><span class="text-xs text-slate-400">時限只提示、不強制</span></div>
    <div class="grid md:grid-cols-2 gap-4 items-start"><div class="md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">${docsH(x)}</div><div id="tq" class="space-y-3">${tqInner()}</div></div>`;
}
function submitTest() {
  const r = V.run; if (!r || r.mode !== 'test') return; tick();
  const un = r.qs.filter(c => r.ans[tkey(c)] === undefined).length, fl = Object.keys(r.flag).length;
  if (!confirm('確定交卷？' + (un ? `還有 ${un} 題未作答（算答錯）。` : '') + (fl ? `還有 ${fl} 題標為待檢查。` : ''))) return;
  clearInterval(V.tm); stop(); const now = Date.now(); let c = 0;
  r.qs.forEach(z => {
    const x = find(z.id), q = tq(z), key = tkey(z), k = r.ans[key], secs = Math.max(1, Math.round((r.ms[key] || 0) / 1000)); r.secs[key] = secs;
    if (k === undefined) { r.sel[key] = -1; R.saved[key] = 1; return; }   // 未作答：算答錯、進錯題本、不記入 rec
    const ok = !!q.options[k].ok; if (ok) c++; r.sel[key] = k; R.rec[key] = { ok, k, secs, t: now };
    const st = R.stat[key] || (R.stat[key] = { picked: [0, 0, 0, 0] }); st.picked[k] = (st.picked[k] || 0) + 1;
    R.rot[key] = { last: dealOf(x)[q.n].findIndex(i => q.options[i].ok) };
    if (ok) delete R.saved[key]; else R.saved[key] = 1;
  });
  r.wall = Math.round((now - r.t0) / 1000);
  R.tests[String(now)] = { mode: r.tmode, c, n: r.qs.length, secs: r.wall, limit: r.limit, t: now };
  Object.keys(R.tests).sort().slice(0, Math.max(0, Object.keys(R.tests).length - 30)).forEach(k => delete R.tests[k]);   // 只留最近 30 次
  saveR(); V.view = 'result'; render(); window.scrollTo(0, 0);
}
function testH() {
  const nS = tpool('single').length, nD = tpool('double').length, nT = tpool('triple').length, nA = tpool(V.ff).length;
  const card_ = (m, name, desc, ok, hint) => `<button ${ok ? '' : 'disabled'} onclick="startTest('${m}')" class="${card} p-4 text-left w-full ${ok ? 'cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950' : 'opacity-40 cursor-not-allowed'}"><div class="font-bold">${name}</div><div class="text-sm text-slate-500">${desc}</div><div class="text-xs text-slate-400 mt-1">${hint}</div></button>`;
  const hist = Object.keys(R.tests).sort().reverse().slice(0, 5).map(k => { const t = R.tests[k], d = new Date(t.t);
    return `<div class="flex flex-wrap items-center gap-2 text-xs py-1 border-b border-slate-100 dark:border-slate-800"><span class="text-slate-400">${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span><span class="${chip}">${esc(TM[t.mode] || t.mode)}</span><b>${t.c} / ${t.n}</b><span class="text-slate-500">${t.n ? Math.round(t.c / t.n * 100) : 0}% · 用時 ${mmss(t.secs)}／限時 ${mmss(t.limit)}</span></div>`; }).join('');
  return hdr('模擬測驗', 'goHome()') + `<p class="text-sm text-slate-500 mb-5">作答時不顯示對錯、證據與播放鈕；交卷後才看結果。限時＝各組（題數 × 60 秒［單篇］／65 秒［雙篇、三篇］）加總，只提示、不強制。</p>`
    + `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-5">${fbtn('ft', null, '不限難度') + Object.keys(TIER).map(k => fbtn('ft', k, TIER[k])).join('')}</div>`
    + `<h2 class="font-bold mb-2">2. 選主題</h2><div class="flex flex-wrap gap-2 mb-5">${fbtn('fd', null, '不限主題') + Object.keys(DOM).map(k => fbtn('fd', k, k.toUpperCase() + ' ' + DOM[k])).join('')}</div>`
    + `<h2 class="font-bold mb-2">3. 選模式</h2><div class="grid gap-3 mb-2">`
    + card_('single', '單組', '隨機一組，依該組題數計時', nA > 0, `符合條件 ${nA} 組`) + card_('mini', '迷你', '1 單篇＋1 雙篇＋1 三篇（約 12–14 題）', nS && nD && nT, `單篇 ${nS}・雙篇 ${nD}・三篇 ${nT} 組`)
    + (fullOK() ? card_('full', '完整版', '單篇 29 題＋雙篇 10 題＋三篇 15 題（共 54 題）', true, `題庫：單篇 ${sumQ('single')}・雙篇 ${sumQ('double')}・三篇 ${sumQ('triple')} 題`) : '') + `</div>`
    + `<div class="text-xs text-slate-400 mb-4">單組模式可再選組別：<span class="inline-flex flex-wrap gap-1 align-middle">${fbtn('ff', null, '不限') + Object.keys(FMT).map(k => fbtn('ff', k, FMT[k])).join('')}</span>${fullOK() ? '' : '<br>完整版需要單篇 29、雙篇 10、三篇 15 題（依目前的難度、主題條件），題庫不足，已隱藏。'}</div>`
    + (hist ? `<h2 class="font-bold mb-1 mt-6">最近的測驗</h2><div class="${card} px-3 py-1">${hist}</div>` : '');
}

/* ---------- 提報（階段 3） ---------- */
const RW = ['文件內容有誤', '題目或選項有誤', '答案有疑義', '翻譯有誤', '音檔有問題', '其他'];
const fld = 'block w-full mt-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm';
function rpH(x) {
  return `<div class="${card} p-3 mb-3 text-sm"><div class="font-bold mb-2">提報 ${esc(x.id)} · ${esc(x.tag)}</div><div class="grid gap-2 sm:grid-cols-2 mb-2"><label class="text-xs">範圍<select id="rpq" class="${fld}"><option value="0">整組／文件</option>${x.questions.map(q => `<option value="${q.n}">Q${q.n} ${esc(QT[q.type] || q.type)}</option>`).join('')}</select></label><label class="text-xs">問題類型<select id="rpw" class="${fld}">${RW.map(w => `<option>${w}</option>`).join('')}</select></label></div><textarea id="rpn" rows="2" placeholder="補充說明（選填）" class="${fld} mb-2"></textarea><div class="flex gap-2"><button onclick="sendRP()" class="${btn} ${pri} !py-1.5">送出</button><button onclick="V.rp=false;render()" class="${btn} ${line} !py-1.5">取消</button></div></div>`;
}
function sendRP() {
  const x = cx(); if (!x) return; const v = id => document.getElementById(id);
  R.reports.push({ id: x.id, n: +v('rpq').value || 0, why: v('rpw').value, note: v('rpn').value.trim(), t: Date.now() });
  saveR(); V.rp = false; render(); alert('已加入提報清單（首頁 → 提報）。');
}
function delRP(i) { R.reports.splice(i, 1); saveR(); render(); }
function clearRP() { if (R.reports.length && confirm('清除全部 ' + R.reports.length + ' 則提報？')) { R.reports = []; saveR(); render(); } }
const rpLine = r => `[${r.id}] ${r.n ? 'Q' + r.n : '整組'}｜${r.why}${r.note ? '：' + r.note : ''}`;
function cp(t, b) {
  const ok = () => { if (b) { const o = b.textContent; b.textContent = '✓ 已複製'; setTimeout(() => { b.textContent = o; }, 1200); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); ok(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, fb); else fb();
}
function reportsH() {
  const rs = R.reports.map((r, i) => ({ r, i })).reverse();
  return hdr('提報', 'goHome()') + `<p class="text-sm text-slate-500 mb-4">練習時按「⚑ 提報」記錄有問題的題組（文件內容有誤、答案有疑義等）。這份清單只存在這個瀏覽器；可複製後交給 AI 修正題庫。</p>`
    + (rs.length ? `<div class="grid grid-cols-2 gap-3 mb-4"><button data-t="${esc(R.reports.map(rpLine).join('\n'))}" onclick="cp(this.dataset.t,this)" class="${btn} ${pri}">複製全部提報</button><button onclick="clearRP()" class="${btn} ${line}">全部清除</button></div>` : '')
    + (rs.length ? rs.map(({ r, i }) => { const x = find(r.id), d = new Date(r.t);
      return `<div class="${card} p-3 mb-2"><div class="flex items-center justify-between gap-2"><div class="text-sm font-bold">${esc(r.id)}${x ? ' · ' + esc(x.tag) : '（題庫中找不到）'}</div><button data-i="${i}" onclick="delRP(+this.dataset.i)" class="text-xs text-rose-500 cursor-pointer">刪除</button></div><div class="flex flex-wrap gap-2 mt-1"><span class="${chip}">${r.n ? 'Q' + r.n : '整組'}</span><span class="${chip}">${esc(r.why)}</span><span class="text-xs text-slate-400">${d.getMonth() + 1}/${d.getDate()}</span></div>${r.note ? `<div class="text-xs text-slate-600 dark:text-slate-300 mt-1">${esc(r.note)}</div>` : ''}${x ? `<button data-id="${esc(r.id)}" onclick="startRun([this.dataset.id],'practice','reports')" class="${btn} ${line} !py-1 text-xs mt-2">重做這組</button>` : ''}</div>`; }).join('')
      : `<p class="text-sm text-slate-400 text-center py-10">目前沒有提報。</p>`);
}

/* ---------- 維護頁（階段 3） ---------- */
const nSets = (d, t) => DATA.filter(x => x.domain === d && tier(x) === t);
const rd = x => x.docs.map((d, k) => ({ d, k })).filter(o => readable(o.d));
const auDone = x => rd(x).every(o => AU.has(dkey(x, o.k)));   // 沒有需要朗讀的文件＝不缺
const voiceOf = d => d.kind === 'chat' ? 'M+F' : (d.voice === 'M' ? 'M' : 'F');
const sayText = d => d.say ? d.say : d.kind === 'chat' ? (d.messages || []).map(m => `(${(d.speakers || {})[m.who] === 'M' ? 'M' : 'F'}) ${m.t}`).join(' ') : chunks(d).map(c => c.text).join(' ');
const wordsOf = d => [].concat(d.head || [], d.body || [], (d.messages || []).map(m => m.t), d.table ? d.table.header.concat.apply(d.table.header, d.table.rows) : []).join(' ').split(/\s+/).filter(Boolean).length;
const missOf = xs => { const out = []; xs.forEach(x => rd(x).forEach(o => { if (!AU.has(dkey(x, o.k))) out.push(`${dkey(x, o.k)}.mp3 | ${sayText(o.d)} | ${voiceOf(o.d)}`); })); return out; };
const rng = s => { const m = String(s || '').match(/(\d+)\D+(\d+)/); return m ? [+m[1], +m[2]] : null; };
function setM(d, t) { V.mf = (V.mf.d === (d || null) && V.mf.t === (t || null)) ? { d: null, t: null } : { d: d || null, t: t || null }; render(); }
function mCell(d, t) {
  const xs = nSets(d, t), n = xs.length, a = xs.filter(auDone).length, on = V.mf.d === d && V.mf.t === t;
  return `<button data-d="${d}" data-t="${t}" onclick="setM(this.dataset.d,this.dataset.t)" class="w-full rounded-lg border px-2 py-2 text-xs ${on ? 'ring-2 ring-indigo-500 ' : ''}${n < 2 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700' : 'border-slate-300 dark:border-slate-700'}"><b class="text-sm">${n}</b> 組<br><span class="text-slate-500">🎧 ${a}</span></button>`;
}
function statH() {
  const N = DATA.reduce((s, x) => s + nq(x), 0), qn = {}, fn = {};
  let ni = 0; DATA.forEach(x => { fn[x.format] = fn[x.format] || [0, 0, 0]; fn[x.format][0]++; fn[x.format][1] += nq(x); x.questions.forEach(q => { qn[q.type] = (qn[q.type] || 0) + 1; if (isInt(q)) { ni++; fn[x.format][2]++; } }); });
  const th = 'text-left font-medium text-slate-500 px-2 py-1', td = 'px-2 py-1';
  const frows = Object.keys(FMT).map(k => { const v = fn[k] || [0, 0, 0]; return `<tr><td class="${td}">${esc(FMT[k])}</td><td class="${td}">${v[0]}</td><td class="${td}">${v[1]}</td><td class="${td}">${v[2]}</td></tr>`; }).join('');
  const trows = Object.keys(QT).map(k => { const n = qn[k] || 0, pct = N ? n / N * 100 : 0, r = rng(SPEC && SPEC.qtypes && SPEC.qtypes[k] && SPEC.qtypes[k].share), low = r && pct < r[0], high = r && pct > r[1];
    return `<tr class="${low ? 'bg-amber-50 dark:bg-amber-950/30' : ''}"><td class="${td}">${esc(QT[k])}</td><td class="${td}">${n}</td><td class="${td}">${pct.toFixed(1)}%</td><td class="${td}">${r ? r[0] + '–' + r[1] + '%' : '—'}</td><td class="${td} ${low ? 'text-amber-600' : 'text-slate-400'}">${low ? '偏少' : high ? '偏多' : ''}</td></tr>`; }).join('');
  const ip = N ? ni / N * 100 : 0;
  return `<div class="${card} p-4 mb-4 overflow-x-auto"><h2 class="font-bold text-sm mb-2">組別統計</h2><table class="text-sm w-full mb-4"><thead><tr><th class="${th}">組別</th><th class="${th}">組數</th><th class="${th}">題數</th><th class="${th}">整合題</th></tr></thead><tbody>${frows}</tbody></table>
    <h2 class="font-bold text-sm mb-2">題型統計（共 ${N} 題）</h2><table class="text-sm w-full"><thead><tr><th class="${th}">題型</th><th class="${th}">題數</th><th class="${th}">實際</th><th class="${th}">建議</th><th class="${th}"></th></tr></thead><tbody>${trows}</tbody></table>
    <div class="text-sm mt-3 ${ip < 20 ? 'text-amber-600' : ''}">整合題 ${ni} 題，占 ${ip.toFixed(1)}%（建議 ≥ 20%）${ip < 20 ? ' · 偏少' : ''}</div></div>`;
}
function setDetailH(x) {
  const need = rd(x), got = need.filter(o => AU.has(dkey(x, o.k))).length, ink = 'text-xs py-0.5';
  const docs = x.docs.map((d, k) => `<div class="text-xs mb-1"><b>文件 ${k + 1}</b> ${esc(KD[d.kind] || d.kind)}（${esc(d.voice || '')}）· ${wordsOf(d)} 字${readable(d) ? '' : ' <span class="text-slate-400">· 不朗讀</span>'}<div class="text-slate-500 truncate">${esc(sayText(d))}</div></div>`).join('');
  const qs = x.questions.map(q => `<div class="text-xs mt-2"><b>Q${q.n}</b> ${esc(QT[q.type] || q.type)}${isInt(q) ? ' · 整合題（文件 ' + q.src.map(i => i + 1).join('＋') + '）' : ''}<div>${esc(q.stem)}</div><ul class="pl-4">${q.options.map(o => `<li class="${o.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}">${o.ok ? '✔' : '✗'} ${esc(o.t)}${o.trap ? ` <span class="${chip} !py-0">${esc(TR[o.trap] || o.trap)}</span>` : ''}</li>`).join('')}</ul><div class="text-slate-500">證據：${(q.evidence || []).map(e => `文件 ${e.doc + 1}「${esc(e.quote)}」`).join('；')}</div></div>`).join('');
  const aud = `<div class="mt-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><p class="text-xs font-bold mb-1">🔊 音檔 ${got}/${need.length}${need.length ? (got === need.length ? '（完整，播放用 mp3）' : '（未到齊，缺的文件用機器發音）') : '（這組沒有需要朗讀的文件）'}${AUI ? '' : ' · 尚未讀到 audio/index.json'}</p>`
    + need.map(o => { const nm = dkey(x, o.k), has = AU.has(nm), tx = sayText(o.d);
      return `<div class="flex items-center gap-2 ${ink}"><span class="${has ? 'text-emerald-600' : 'text-rose-500'}">${has ? '✔' : '✖'}</span><code class="shrink-0">${nm}.mp3</code><span class="truncate flex-1 text-slate-500">${esc(tx)}</span><button data-t="${esc(nm + '.mp3')}" onclick="cp(this.dataset.t,this)" class="${btn} ${line} !py-0.5 !px-2 text-xs">檔名</button><button data-t="${esc(tx)}" onclick="cp(this.dataset.t,this)" class="${btn} ${line} !py-0.5 !px-2 text-xs">朗讀稿</button></div>`; }).join('') + '</div>';
  return docs + qs + aud;
}
/* 新增題目：產生「給 AI 的寫題目指令」 */
const SC = { easy: [[500, 'A2+'], [550, 'A2+']], medium: [[600, 'B1'], [650, 'B1+']], hard: [[700, 'B2'], [750, 'B2'], [800, 'B2+']] };
const SUF = { easy: 'e', medium: 'm', hard: 'h' };
const FD = { single: '單篇（1 份文件、2–4 題）', double: '雙篇（2 份文件、剛好 5 題、至少 2 題整合題）', triple: '三篇（3 份文件、剛好 5 題、至少 2 題整合題，且至少 1 題需要比對 2 份以上文件）' };
function nextIds(d, t, n) {
  let mx = 0; DATA.forEach(x => { const m = /^d(\d)-(\d{3})-[emh]$/.exec(x.id); if (m && 'd' + m[1] === d) mx = Math.max(mx, +m[2]); });
  return Array.from({ length: n }, (_, i) => d + '-' + String(mx + i + 1).padStart(3, '0') + '-' + SUF[t]);
}
const firstSent = x => { const d = x.docs[0] || {}, t = (d.kind === 'chat' ? (d.messages || []).map(m => m.t) : (d.body || [])).join(' ').replace(/\s*\[[1-4]\]\s*/g, ' '), ss = t.match(/[^.?!]+[.?!]+/g) || [t]; return (ss.find(s => s.trim().split(/\s+/).length >= 5) || t).trim().slice(0, 140); };
function promptText() {
  const w = V.nw, ids = nextIds(w.d, w.t, w.n), sc = (SPEC && SPEC.domains && SPEC.domains[w.d] && SPEC.domains[w.d].scenes) || [];
  const N = DATA.reduce((s, x) => s + nq(x), 0), qn = {}; DATA.forEach(x => x.questions.forEach(q => { qn[q.type] = (qn[q.type] || 0) + 1; }));
  const types = Object.keys(QT).map(k => `${QT[k]} ${qn[k] || 0} 題（建議 ${(SPEC && SPEC.qtypes && SPEC.qtypes[k] && SPEC.qtypes[k].share) || '—'}）`).join('、');
  const spec = {}; if (SPEC) { ['schema_version', 'formats', 'kinds', 'qtypes', 'traps', 'entry_schema', 'rules'].forEach(k => { if (SPEC[k] !== undefined) spec[k] = SPEC[k]; }); if (SPEC.tiers) spec.tiers = SPEC.tiers[w.t] ? { [w.t]: SPEC.tiers[w.t] } : SPEC.tiers; }
  const rules = SPEC && SPEC.rules ? Object.keys(SPEC.rules).map((k, i) => `  ${i + 1}. ${SPEC.rules[k]}`).join('\n') : '  （題庫沒有 _spec.rules）';
  const vocab = [...new Set(DATA.flatMap(x => (x.vocab || []).map(v => v.word)))], tags = DATA.map(x => x.tag);
  const heads = DATA.map(x => `${x.id}：${(x.docs[0].head || []).join(' / ') || x.tag}｜${firstSent(x)}`);
  return `請為多益 Part 7 閱讀理解寫 ${w.n} 組（組別：${FMT[w.f]}），每組的文件與題目規格見下方；輸出為單一 JSON 陣列，規格在最後，不需要另外附 part7.json。

- 主題：${w.d.toUpperCase()} ${DOM[w.d]}（scene 須屬於：${sc.join('、')}）；可選填 biz。
- 組別：${FD[w.f]}；文件類型建議：${w.k.length ? w.k.map(k => KD[k] + '（' + k + '）').join('＋') : '不限（依組別挑選合理組合）'}。
- 難度：${TIER[w.t]}（id 尾碼 ${SUF[w.t]}）｜level.score 只能填：${SC[w.t].map(s => `${s[0]}（cefr ${s[1]}）`).join('、')}｜${SPEC && SPEC.tiers && SPEC.tiers[w.t] ? SPEC.tiers[w.t].guide : ''}
- 題型：${w.q.length ? '本批必含：' + w.q.map(k => QT[k] + '（' + k + '）').join('、') + '；' : ''}目前各題型題數與建議占比：${types}；請優先補數量最少者。
- id 依序使用：${ids.join('、')}（domain 填 ${w.d}，level.tier 填 ${w.t}）；每份文件填 voice（F 或 M）。
- 每題剛好 4 個選項、1 個正解；每個干擾項必須有 trap 與 why；每題至少 1 筆 evidence，quote 必須逐字出現在對應文件；整合題至少 2 筆且來自不同文件。
- clue.steps 依四步驟各寫一句：判斷題型 → 定位關鍵詞或證據 → 排除干擾項 → 代入驗證。
- 規則：
${rules}
- 已用過的 vocab（不得重複）：${vocab.join('、') || '（無）'}
- 已用過的 tag（不得重複）：${tags.join('、') || '（無）'}
- 已有的文件標頭與首句（不要雷同）：
${heads.map(h => '  ' + h).join('\n') || '  （無）'}
- 輸出方式：建立檔案 p7_${ids[0]}_x${w.n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。

【規格：part7.json 的 _spec 精簡版】
${JSON.stringify(spec)}

寫完請自我檢查：
1. 每個 quote 逐字複製自文件，沒有改動標點或大小寫。
2. 把每個干擾項代回整份文件，確認只有 1 個選項成立（尤其整合題：單看一份文件會得到哪個錯誤答案？它是否標了 partial 或 wrongdoc？）。
3. 正解沒有照抄原文；至少 1 個干擾項沿用原文字詞但意思不對。
4. 用程式驗算所有金額、日期、星期與時間。
5. intent 只用在 chat；vocab 目標字在該文件只出現 1 次；insert 的 [1]–[4] 各 1 次，插入後文法與邏輯成立。
6. 有任何不確定寫進 issues；無法達到規格時回傳 {"skip":"原因"}。`;
}
function setN(k, v) { V.nw[k] = v; render(); }
function togN(k, v) { const a = V.nw[k], i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); render(); }
function pillN(k, v, label, multi) {
  const on = multi ? V.nw[k].includes(v) : V.nw[k] === v;
  return `<button data-k="${k}" data-v="${v}" onclick="${multi ? 'togN' : 'setN'}(this.dataset.k,${typeof v === 'number' ? '+' : ''}this.dataset.v)" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${esc(label)}</button>`;
}
function newH() {
  const row = (t, inner) => `<div class="mb-3"><div class="text-xs font-bold mb-1">${t}</div><div class="flex flex-wrap gap-2">${inner}</div></div>`;
  return `<div class="${card} p-4 mb-4"><h2 class="font-bold text-sm mb-3">新增題目：產生「給 AI 的寫題目指令」</h2>`
    + row('主題', Object.keys(DOM).map(k => pillN('d', k, k.toUpperCase() + ' ' + DOM[k])).join('')) + row('難度', Object.keys(TIER).map(k => pillN('t', k, TIER[k])).join(''))
    + row('組別', Object.keys(FMT).map(k => pillN('f', k, FMT[k])).join('')) + row('文件類型（可複選，可不選）', Object.keys(KD).map(k => pillN('k', k, KD[k], 1)).join(''))
    + row('組數', [1, 2, 3, 5].map(n => pillN('n', n, n + ' 組')).join('')) + row('本批必含題型（可複選，可不選）', Object.keys(QT).map(k => pillN('q', k, QT[k], 1)).join(''))
    + (SPEC ? '' : `<div class="text-xs text-amber-600 mb-2">題庫沒有 _spec，指令裡的規格會是空的。</div>`)
    + `<textarea id="pt" readonly rows="8" class="${fld} font-mono text-xs mb-2">${esc(promptText())}</textarea><button onclick="cp(document.getElementById('pt').value,this)" class="${btn} ${pri} w-full">複製指令</button></div>`;
}
function maintH() {
  const rows = Object.keys(DOM).map(d => `<tr><td class="pr-2 py-1 text-xs whitespace-nowrap"><button data-d="${d}" data-t="" onclick="setM(this.dataset.d,this.dataset.t)" class="cursor-pointer ${V.mf.d === d && !V.mf.t ? 'font-bold text-indigo-600' : ''}">${d.toUpperCase()} ${esc(DOM[d])}</button></td>${Object.keys(TIER).map(t => `<td class="p-1">${mCell(d, t)}</td>`).join('')}<td class="pl-2 text-xs text-slate-500 whitespace-nowrap">${DATA.filter(x => x.domain === d).length} 組</td></tr>`).join('');
  const xs = DATA.filter(x => (!V.mf.d || x.domain === V.mf.d) && (!V.mf.t || tier(x) === V.mf.t)), miss = missOf(xs), label = V.mf.d || V.mf.t ? [V.mf.d ? V.mf.d.toUpperCase() : '', V.mf.t ? TIER[V.mf.t] : ''].filter(Boolean).join(' · ') : '全部';
  const orph = AUI && Array.isArray(AUI.orphans) ? AUI.orphans.length : 0;
  return hdr('維護', 'backAdmin()')
    + `<div class="text-xs text-slate-500 mb-3">${AUI ? `audio/index.json 已讀取（p7 完整文件音檔 ${AU.size} 個${orph ? `，孤兒檔 ${orph} 個` : ''}）` : '<span class="text-amber-600">尚未讀到 audio/index.json（含雙擊開啟 file://），所有音檔都視為缺。</span>'} · <a href="#" onclick="go('reports');return false" class="text-indigo-600 underline">提報 ${R.reports.length} 則</a></div>`
    + `<div class="${card} p-4 mb-4 overflow-x-auto"><h2 class="font-bold text-sm mb-1">題數矩陣（主題 × 難度）</h2><div class="text-xs text-slate-400 mb-2">格內：組數、🎧 文件音檔整組到齊的組數；每格目標 2 組，偏少標黃。點格子可篩選下方題組。</div><table class="w-full"><thead><tr><th></th>${Object.keys(TIER).map(t => `<th class="text-xs font-medium text-slate-500 pb-1"><button data-d="" data-t="${t}" onclick="setM(this.dataset.d,this.dataset.t)" class="cursor-pointer ${V.mf.t === t && !V.mf.d ? 'font-bold text-indigo-600' : ''}">${TIER[t]}</button></th>`).join('')}<th></th></tr></thead><tbody>${rows}</tbody></table></div>`
    + statH() + newH()
    + `<div class="flex flex-wrap items-center justify-between gap-2 mb-2"><h2 class="font-bold text-sm">題組（${esc(label)}・${xs.length} 組）</h2>${miss.length ? `<button data-t="${esc(miss.join('\n'))}" onclick="cp(this.dataset.t,this)" class="${btn} ${line} !py-1 text-xs">複製${V.mf.d || V.mf.t ? '本格' : '全部'}缺的清單（${miss.length} 檔）</button>` : '<span class="text-xs text-emerald-600">音檔都到齊了</span>'}</div><div class="text-[11px] text-slate-400 mb-2">缺音檔清單格式：檔名.mp3 | 朗讀稿 | M 或 F（chat 為 M+F，朗讀稿內以 (M)／(F) 標每則訊息的聲音）</div>`
    + (xs.length ? xs.map(x => { const need = rd(x), got = need.filter(o => AU.has(dkey(x, o.k))).length;
      return `<details class="${card} p-3 mb-2"><summary class="cursor-pointer text-sm"><b>${esc(x.id)}</b> · ${esc(x.tag)} <span class="${chip} ml-1">${esc(FMT[x.format] || x.format)}</span> <span class="${chip}">${esc(TIER[tier(x)] || '')}</span> <span class="${chip}">${nq(x)} 題</span> <span class="${chip}">🎧 ${got}/${need.length}</span></summary><div class="mt-2">${setDetailH(x)}</div></details>`; }).join('') : `<p class="text-sm text-slate-400 text-center py-6">這個條件下沒有題組。</p>`);
}

/* ---------- 啟動 ---------- */
function backAdmin() { if (window._ah) location.href = 'index.html#mt'; else goHome(); } // 從首頁「維護總覽」進來的，返回就回總覽
function loadText(t) {
  try {
    const j = JSON.parse(t); SPEC = (j && j._spec) || null;
    if (SPEC) { [['domains', DOM, o => o.name], ['formats', FMT, o => o.name], ['qtypes', QT, o => o.name], ['kinds', KD, o => o], ['traps', TR, o => o]].forEach(([k, tg, f]) => { const s = SPEC[k]; if (s) Object.keys(s).forEach(i => { const v = f(s[i]); if (v) tg[i] = v; }); }); }
    DATA = (Array.isArray(j) ? j : (j && j.items) || []).filter(okItem); render();
    if (location.hash === '#admin' && !window._ah) { window._ah = 1; go('maint'); } // 從首頁「維護總覽」直接進入維護頁
  } catch (e) { alert('part7.json 格式有誤：' + e.message); }
}
function pickJson(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8'); }
async function boot() {
  main.innerHTML = '<p class="text-sm text-slate-500 text-center py-16">載入中…</p>';
  await auLoad();
  try { const res = await fetch('part7.json', { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status); loadText(await res.text()); }
  catch (e) {
    main.innerHTML = `<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 part7.json</h3><p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取；上傳到 GitHub Pages 或用本機伺服器則會自動載入。</p><label class="${btn} inline-block ${pri}">選取 part7.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`;
  }
}
boot();
