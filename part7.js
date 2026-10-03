/* Part 7 閱讀理解（階段 1：練習模式＋錯題本）。版型以 Part 1 為準（PART_UI_GUIDE.md），題組格式見 part7_設計指引.md。
   題庫 part7.json（一組＝1–3 份文件＋2–5 題）。記錄存在 toeicPart7V1（rec／saved／rot／stat／tests／reports），KEY 只讀寫 dark。
   key＝「組id#n」。音訊：audio/index.json 的 p7.complete 含「{id}-d{k}」→ 播 audio/p7/{id}-d{k}.mp3，否則瀏覽器 TTS。自成一體，不依賴 audio.js。
   尚未實作（後續階段）：模擬測驗、提報、維護頁；首頁對應按鈕先停用。 */
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
let V = { view: 'home', ft: null, fd: null, ff: null, fq: null, fk: null, run: null, dt: 0, all: false, scroll: null };
const tier = x => (x.level && x.level.tier) || 'medium';
const find = id => DATA.find(x => x.id === id);
const qkey = (x, q) => x.id + '#' + q.n;
const isInt = q => (q.src || []).length >= 2;
const okItem = x => !!(x && x.id && Array.isArray(x.docs) && x.docs.length && Array.isArray(x.questions) && x.questions.length && x.questions.every(q => Array.isArray(q.options) && q.options.length === 4 && q.options.filter(o => o.ok).length === 1));
const pool = () => DATA.filter(x => (!V.ft || tier(x) === V.ft) && (!V.fd || x.domain === V.fd) && (!V.ff || x.format === V.ff) && (!V.fq || x.questions.some(q => q.type === V.fq)) && (!V.fk || x.docs.some(d => d.kind === V.fk)));
const readable = d => d.read !== false && !NOAUD.includes(d.kind);
const nQ = ids => ids.reduce((s, id) => s + find(id).questions.length, 0);

/* ---------- 音訊（依文件播放） ---------- */
const AU = new Set(), P = { tok: 0, a: new Audio(), vs: [], rate: 1, cur: null };
async function auLoad() { AU.clear(); try { const j = await (await fetch('audio/index.json', { cache: 'no-store' })).json(); ((j.p7 && j.p7.complete) || []).forEach(i => AU.add(i)); } catch (e) {} }
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
function nextSet() { if (V.run.i < V.run.ids.length - 1) { V.run.i++; V.run.last = Date.now(); V.dt = 0; V.all = false; stop(); render(); window.scrollTo(0, 0); } else { stop(); V.view = 'result'; render(); window.scrollTo(0, 0); } }
function go(view) { stop(); V.view = view; V.run = null; render(); window.scrollTo(0, 0); }
const goBack = () => go(V.run && V.run.key === 'book' ? 'book' : V.run && V.run.key === 'practice' ? 'practice' : 'home');
function setF(k, v) { V[k] = (v === null || V[k] === v) ? null : v; render(); }
function unsave(id) { const x = find(id); if (x) x.questions.forEach(q => delete R.saved[qkey(x, q)]); saveR(); render(); }
function toggleDark() {
  S.dark = !S.dark;
  try { const c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {}
  render();
}

/* ---------- 文件呈現與高亮 ---------- */
function marksFor(x, di) {   // 此刻要在文件 di 高亮的片段
  const m = [];
  x.questions.forEach(q => {
    const key = qkey(x, q), done = V.run && V.run.sel[key] !== undefined;
    if (q.type === 'vocab' && q.target && q.target.doc === di) m.push({ s: q.target.word, c: 'underline decoration-2 decoration-indigo-500 font-semibold', q: key });
    if (done) (q.evidence || []).forEach(e => { if (e.doc === di) m.push({ s: e.quote, c: 'bg-amber-200 dark:bg-amber-700/60 rounded px-0.5', q: key, ev: 1 }); });
  });
  return m;
}
function insInfo(x, di) {   // 此文件上的插入題
  const q = x.questions.find(z => z.type === 'insert' && z.target && z.target.doc === di); if (!q) return null;
  const done = V.run && V.run.sel[qkey(x, q)] !== undefined; return { q, done, at: q.options.findIndex(o => o.ok) + 1 };
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
  const aud = readable(d) ? `<div class="flex flex-wrap items-center gap-2 mb-3"><button data-play="${x.id}:${di}" onclick="playDoc(this.dataset.play.split(':')[0],+this.dataset.play.split(':')[1])" class="${btn} ${line} !py-1 text-xs">▶ 播放這篇</button>${[.75, 1, 1.25].map(r => `<button data-rate="${r}" onclick="setRate(+this.dataset.rate)" class="${btn} ${line} !py-1 !px-2 text-xs">${r}×</button>`).join('')}<span class="text-[11px] text-slate-400">${AU.has(dkey(x, di)) ? '錄音檔' : '機器發音'}</span></div>` : '';
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
  const x = cx(), r = V.run, done = setDone(x), nA = x.questions.filter(q => r.sel[qkey(x, q)] !== undefined).length;
  const sec = x.format === 'single' ? 60 : 65, lim = x.questions.length * sec;
  return hdr(`${r.mode === 'book' ? '錯題本' : '練習'} · 第 ${r.i + 1} / ${r.ids.length} 組`, 'if(V.run&&Object.keys(V.run.sel).length&&!confirm(\'離開後本次練習不會繼續，確定嗎？\'))void 0;else goBack()')
    + `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-3"><div class="h-1.5 rounded bg-indigo-600" style="width:${Math.round(nA / x.questions.length * 100)}%"></div></div>
    <div class="flex flex-wrap items-center gap-2 mb-3"><span class="${chip}">${esc(x.id)}</span><span class="${chip}">${esc(FMT[x.format] || x.format)}</span><span class="${chip}">${esc(TIER[tier(x)] || '')}</span><span class="${chip}">建議 ${lim} 秒</span></div>
    <details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">解題提示</summary><ul class="list-disc pl-5 mt-1"><li>先瀏覽題目 10–15 秒再讀文章</li><li>NOT 題最後做</li><li>整合題先找共同連結點（人名、日期、產品）</li></ul></details>
    <div class="grid md:grid-cols-2 gap-4 items-start"><div class="md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto">${docsH(x)}</div><div class="space-y-3">${x.questions.map(q => qH(x, q)).join('')}${done ? reviewH(x) : ''}${done ? `<button onclick="nextSet()" class="${btn} ${pri} w-full mt-2">${r.i < r.ids.length - 1 ? '下一組 →' : '完成，看結果'}</button>` : ''}</div></div>`;
}
function resultH() {
  const r = V.run || V.last; const ids = r.ids, rows = []; ids.forEach(id => { const x = find(id); x.questions.forEach(q => { const k = r.sel[qkey(x, q)]; if (k !== undefined) rows.push({ x, q, ok: !!q.options[k].ok, secs: r.secs[qkey(x, q)] || 0, k }); }); });
  const n = rows.length, c = rows.filter(z => z.ok).length, pct = n ? Math.round(c / n * 100) : 0, tot = rows.reduce((s, z) => s + z.secs, 0), slow = rows.filter(z => z.secs > SLOW).length;
  const grp = f => { const m = {}; rows.forEach(z => { const k = f(z); (m[k] = m[k] || [0, 0]); m[k][1]++; if (z.ok) m[k][0]++; }); return m; };
  const bars = (m, nm) => Object.keys(m).map(k => `<div class="flex items-center gap-2 text-xs mb-1"><span class="w-24 shrink-0">${esc(nm(k))}</span><div class="flex-1 h-2 rounded bg-slate-200 dark:bg-slate-800"><div class="h-2 rounded ${m[k][0] / m[k][1] >= .75 ? 'bg-emerald-500' : 'bg-amber-500'}" style="width:${Math.round(m[k][0] / m[k][1] * 100)}%"></div></div><span class="w-12 text-right">${m[k][0]}/${m[k][1]}</span></div>`).join('');
  const trap = {}; rows.filter(z => !z.ok).forEach(z => { const o = z.q.options[z.k]; if (o.trap) trap[o.trap] = (trap[o.trap] || 0) + 1; });
  const bad = ids.filter(id => rows.some(z => z.x.id === id && !z.ok));
  return hdr('作答結果') + `<div class="${card} p-6 text-center mb-4"><div class="text-4xl font-bold ${pct >= 75 ? 'text-emerald-600' : 'text-amber-600'}">${c} / ${n}</div><div class="text-sm text-slate-500 mt-1">答對率 ${pct}% · 總用時 ${tot} 秒 · 平均 ${n ? Math.round(tot / n) : 0} 秒／題 · 偏慢 ${slow} 題</div>
    <div class="grid grid-cols-2 gap-3 mt-4"><button onclick="go('${r.key === 'book' ? 'book' : 'practice'}')" class="${btn} ${line}">回${r.key === 'book' ? '錯題本' : '練習選單'}</button><button onclick="${r.key === 'book' ? 'startBook()' : 'startPractice()'}" class="${btn} ${pri}">${r.key === 'book' ? '再做錯題' : '再練一次（重新抽題）'}</button></div></div>
    <div class="${card} p-4 mb-4"><h2 class="font-bold text-sm mb-2">各題型正確率</h2>${bars(grp(z => z.q.type), k => QT[k] || k)}<h2 class="font-bold text-sm mb-2 mt-4">整合題 vs 單篇題</h2>${bars(grp(z => isInt(z.q) ? '整合題' : '單文件題'), k => k)}<h2 class="font-bold text-sm mb-2 mt-4">組別</h2>${bars(grp(z => z.x.format), k => FMT[k] || k)}
    ${Object.keys(trap).length ? `<h2 class="font-bold text-sm mb-2 mt-4">你常中的陷阱</h2><div class="flex flex-wrap gap-2">${Object.keys(trap).sort((a, b) => trap[b] - trap[a]).map(k => `<span class="${chip}">${esc(TR[k] || k)} ×${trap[k]}</span>`).join('')}</div>` : ''}</div>
    ${bad.length ? `<h2 class="font-bold mb-2">答錯的題組</h2>` + bad.map(id => { const x = find(id); return `<details class="${card} p-3 mb-2"><summary class="cursor-pointer text-sm"><b class="text-rose-600">✗</b> ${esc(x.id)} · ${esc(x.tag)}</summary>${rows.filter(z => z.x.id === id && !z.ok).map(z => `<div class="mt-2 text-xs"><b>Q${z.q.n}</b> ${esc(z.q.stem)}<div class="text-rose-600">你的答案：${esc(z.q.options[z.k].t)}</div><div class="text-emerald-700 dark:text-emerald-400">正解：${esc(z.q.options.find(o => o.ok).t)}</div><div class="text-slate-500">${esc(z.q.options.find(o => o.ok).why)}</div></div>`).join('')}</details>`; }).join('') : `<p class="text-sm text-center text-emerald-600">全部答對！</p>`}`;
}
function bookH() {
  const xs = DATA.filter(bookHas);
  return hdr('錯題本', 'goHome()') + (xs.length ? `<button onclick="startBook()" class="${btn} ${pri} w-full mb-4">重做這 ${xs.length} 組</button>` + xs.map(x => `<div class="${card} p-4 mb-3"><div class="flex items-center justify-between gap-2 mb-1"><div class="text-sm font-bold">${esc(x.id)} · ${esc(x.tag)}</div><button data-id="${x.id}" onclick="unsave(this.dataset.id)" class="text-xs text-rose-500 cursor-pointer">移除</button></div><div class="flex flex-wrap gap-2"><span class="${chip}">${esc(FMT[x.format])}</span><span class="${chip}">答錯 ${x.questions.filter(q => R.saved[qkey(x, q)]).map(q => 'Q' + q.n).join('、')}</span></div></div>`).join('') : `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`);
}
const goHome = () => go('home');
function homeH() {
  if (!DATA.length) return hdr('Part 7 閱讀理解') + `<div class="${card} p-8 text-center text-sm text-slate-500">題庫是空的。</div>`;
  const nb = DATA.filter(bookHas).length, off = `${btn} ${line} opacity-40 cursor-not-allowed`;
  return hdr('Part 7 閱讀理解') + `<div class="grid gap-3 md:grid-cols-2 mb-4"><button onclick="go('practice')" class="${card} p-5 text-left cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-950"><div class="text-xl font-bold">練習</div><div class="text-sm text-slate-500">一次一組 · 作答後立即看解析與證據</div></button>
    <div class="${card} p-5 text-left opacity-50"><div class="text-xl font-bold">測驗</div><div class="text-sm text-slate-500">模擬測驗（即將推出）</div></div></div>
    <div class="grid grid-cols-3 gap-3 mb-6"><button onclick="go('book')" class="${btn} ${line}">★ 錯題本 ${nb}</button><button disabled class="${off}">⚑ 提報</button><button disabled class="${off}">🛠 維護</button></div>`;
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
  main.innerHTML = v === 'run' ? runH() : v === 'result' ? resultH() : v === 'book' ? bookH() : v === 'practice' ? practiceH() : homeH();
  if (v === 'result' && V.run) { V.last = V.run; V.run = null; }
  paintAudio();
  if (V.scroll) { const k = V.scroll; V.scroll = null; const e = [...document.querySelectorAll('[data-ev]')].find(n => n.dataset.ev === k); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
}

/* ---------- 啟動 ---------- */
function loadText(t) {
  try {
    const j = JSON.parse(t); SPEC = (j && j._spec) || null;
    if (SPEC) { [['domains', DOM, o => o.name], ['formats', FMT, o => o.name], ['qtypes', QT, o => o.name], ['kinds', KD, o => o], ['traps', TR, o => o]].forEach(([k, tg, f]) => { const s = SPEC[k]; if (s) Object.keys(s).forEach(i => { const v = f(s[i]); if (v) tg[i] = v; }); }); }
    DATA = (Array.isArray(j) ? j : (j && j.items) || []).filter(okItem); render();
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
