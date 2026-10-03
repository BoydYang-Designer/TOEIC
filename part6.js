/* Part 6 段落填空：介面依 PART_UI_GUIDE.md 統一為 Part 1 的版型與操作；題庫來自 part6.json（一題＝一篇文章、4 個空格）
   首頁：練習／測驗兩張大卡＋★ 錯題本／⚑ 提報／🛠 維護；選單頁為編號步驟（難度→主題→文章類型→考點→篇數）。
   作答記錄存在 toeicPart6V1（rec／saved／rot／stat，key＝題目id#空格編號，結構與舊版相同；新增 reports／reporter／tests），KEY 只讀寫 dark。
   音訊：audio/index.json 的 p6.complete 有此題 → 播 audio/p6/{id}.mp3；否則用瀏覽器 TTS（整題缺音檔＝機器發音，仍可作答，不算健檢錯誤）。
   與 Part 1 刻意不同（Part 6 是閱讀題）：選項顯示完整文字而非只有 A–D；音檔念的是「填入答案的全文」，所以不自動播放、測驗中不提供音檔。 */
const KEY = 'toeicCoachV2', PK = 'toeicPart6V1';
let S = {}; try { S = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) {}
let R = { rec: {}, saved: {}, rot: {}, stat: {} };
try { R = Object.assign(R, JSON.parse(localStorage.getItem(PK) || '{}')); } catch (e) {}
['rec', 'saved', 'rot', 'stat', 'tests'].forEach(k => { if (!R[k] || typeof R[k] !== 'object' || Array.isArray(R[k])) R[k] = {}; });
if (!Array.isArray(R.reports)) R.reports = []; // 提報紀錄（存在 PK 裡，與作答紀錄同一份 localStorage）
const saveR = () => { try { localStorage.setItem(PK, JSON.stringify(R)); } catch (e) {} };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick1 = a => a[Math.floor(Math.random() * a.length)];
const card = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900';
const btn = 'rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer';
const line = 'border border-slate-300 dark:border-slate-700';
const pri = 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed';
const chip = 'text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main = document.getElementById('main');

/* ---------- 選項輪替（核心，邏輯與舊版相同）：回傳 {shown:[4 個選項索引（0=正解，j+1=第 j 個干擾項）], pos:正解位置 0–3} ---------- */
function deal(x) {
  const D = x.distractors, low = s => String(s).trim().toLowerCase();
  const seen = new Set([low(x.answer.t)]), ok = [];
  D.forEach((d, i) => { const k = low(d.t); if (!seen.has(k)) { seen.add(k); ok.push(i); } });   // 文字與正解或前面干擾項重複者不用
  const near = i => D[i].near === true, root = i => D[i].fam === 'root';
  let r = R.rot[x.id]; if (!r || typeof r !== 'object') r = R.rot[x.id] = { bag: [], last: -1 };
  let bag = (Array.isArray(r.bag) ? r.bag : []).filter((v, k, a) => ok.indexOf(v) >= 0 && a.indexOf(v) === k);
  const take = [];
  if (bag.length < 3) { take.push(...bag); bag = shuf(ok.filter(i => !take.includes(i))); }   // 不足 3 個：先取剩下的，再把其餘（不含本次已取）重新洗牌補進 bag
  while (take.length < 3 && bag.length) take.push(bag.shift());
  const rootsAll = ok.filter(root), need = x.point === 'wordform' ? Math.min(2, rootsAll.length) : 0, rc = () => take.filter(root).length;
  const swapIn = (cand, out) => { take[take.indexOf(out)] = cand; const b = bag.indexOf(cand); if (b >= 0) bag.splice(b, 1); if (bag.indexOf(out) < 0) bag.unshift(out); };   // 被換下的放回 bag
  while (rc() < need) {   // 詞性題成套：至少 2 個同字根
    const out = take.find(i => !root(i)); if (out === undefined) break;
    const pool = ok.filter(i => root(i) && !take.includes(i)); if (!pool.length) break;
    const inbag = bag.find(i => pool.includes(i)); swapIn(inbag !== undefined ? inbag : pick1(pool), out);
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
  const m = take.length + 1; let pos, tries = 0;   // 正解位置：隨機，且不與上次相同（最多重試 5 次，再不行就從其餘位置挑）
  do { pos = Math.floor(Math.random() * m); tries++; } while (pos === r.last && tries <= 5);
  if (pos === r.last) pos = (r.last + 1 + Math.floor(Math.random() * (m - 1))) % m;
  const rest = shuf(take), shown = []; let q = 0;
  for (let j = 0; j < m; j++) shown.push(j === pos ? 0 : rest[q++] + 1);
  r.bag = bag; r.last = pos;
  const st = R.stat[x.id] || (R.stat[x.id] = { shown: [], picked: [] });
  for (let k = 0; k <= D.length; k++) { st.shown[k] = st.shown[k] || 0; st.picked[k] = st.picked[k] || 0; }
  shown.forEach(k => { st.shown[k]++; });
  saveR(); return { shown, pos };
}
const optOf = (x, k) => k === 0 ? { k, t: x.answer.t, zh: x.answer.zh, pos: x.answer.pos, ok: true, why: x.answer.why } : (d => ({ k, t: d.t, zh: d.zh, pos: d.pos, ok: false, trap: d.trap, near: d.near, why: d.why }))(x.distractors[k - 1]);

/* ---------- 題庫、分類、小工具 ---------- */
let DATA = [], RAW = [], SPEC = null, LERR = '', LMSG = '';
let V = { view: 'home', run: null, t: null, pf: { d: '', t: '', c: '', k: '', p: '' }, tf: { d: '', t: '', c: '', k: '', p: '' }, pn: 6, tn: 1, rp: null, rf: null, rkf: null };
const TIER = { easy: '初級', medium: '中級', hard: '高級' }, TS = { easy: 'e', medium: 'm', hard: 'h' };
const KD = { grammar: '文法', vocab: '詞彙', transition: '轉折詞', insert: '句子插入' };
const SC = { local: '線索在空格附近', near: '線索在前後句', far: '線索在標頭或跨段' }, SCN = { local: '空格附近', near: '前後句', far: '標頭／跨段' };
const SUG = { easy: 100, medium: 120, hard: 140 };
const TARGET = 2; // 每格（難度 × 主題）至少篇數
const L = 'ABCD';
const tier = x => (x.level && x.level.tier) || 'medium', byId = id => DATA.find(x => x.id === id), qk = (x, q) => x.id + '#' + q.n, sug = x => SUG[tier(x)] || 120;
const qi = (x, q) => ({ id: qk(x, q), point: q.point, answer: q.answer, distractors: q.distractors });   // 讓 deal()／optOf() 把「一個空格」當成一題
const sayText = x => x.say || [x.head.join('. ') + '.', ...x.body.map(p => p.replace(/\[\[(\d)\]\]/g, (_, n) => x.questions.find(q => q.n === +n).answer.t))].join(' ');
const trn = k => (SPEC && SPEC.traps && SPEC.traps[k]) || k || '';
const pName = p => (SPEC && SPEC.points && SPEC.points[p] && SPEC.points[p].name) || p;
const docN = d => (SPEC && SPEC.docs && SPEC.docs[d]) || d || '';
const dnm = d => (SPEC && SPEC.domains && SPEC.domains[d] && SPEC.domains[d].name) || '';
const domLabel = d => d ? d.toUpperCase() + (dnm(d) ? ' ' + dnm(d) : '') : '';
const DOMS = () => [...new Set([...Object.keys((SPEC && SPEC.domains) || {}), ...DATA.map(x => x.domain)])].filter(Boolean).sort();
const TSC_DEF = { easy: '500–550', medium: '600–650', hard: '700–800' };
const tScore = k => (SPEC && SPEC.tiers && SPEC.tiers[k] && SPEC.tiers[k].score) || TSC_DEF[k];
const tierHint = () => Object.keys(TIER).map(k => `${TIER[k]} ${tScore(k)}`).join('；') + '（多益預估分數）';
const PA = 'px-2 mx-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold';
const allQ = () => DATA.flatMap(x => x.questions);
const qOk = (f, q) => (!f.k || q.kind === f.k) && (!f.p || q.point === f.p);
const poolOf = f => DATA.filter(x => (!f.d || x.domain === f.d) && (!f.t || tier(x) === f.t) && (!f.c || x.doc === f.c) && x.questions.some(q => qOk(f, q)));
const wrongItems = () => DATA.filter(x => x.questions.some(q => R.saved[qk(x, q)]));
const fm = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');

/* ---------- 缺音檔判定：以 audio/index.json 的 p6.complete 為準（讀 audio.js 已載入的索引，讀不到再自己讀） ---------- */
let IDX = null;
async function auInit() {
  try { if (typeof auLoad === 'function') await auLoad(); } catch (e) {}
  IDX = (typeof AU !== 'undefined' && AU && AU.idx) || null;
  if (!IDX) { try { IDX = await (await fetch('audio/index.json', { cache: 'no-store' })).json(); } catch (e) { IDX = null; } }
}
const auHas = x => !!(IDX && IDX.p6 && (IDX.p6.complete || []).includes(x.id));
const auMissing = x => !auHas(x);
const missAud = () => DATA.filter(auMissing);
const who = x => x.voice === 'M' ? 'M' : 'F';
const missRow = x => `${x.id}.mp3 | ${sayText(x)} | ${who(x)}`;   // 檔名 | 念出的全文 | F/M

/* ---------- 音訊（自成一體）：同一個 Audio 元素、點擊啟動、切題或離開一定停止 ---------- */
const P = { tok: 0, a: new Audio(), vs: [], rate: 1, on: false, cur: null, did: {} };
const hasTTS = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
if (hasTTS()) { const g = () => { try { P.vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); } catch (e) {} }; g(); try { speechSynthesis.addEventListener('voiceschanged', g); } catch (e) {} }
const voiceFor = g => g === 'F' ? P.vs.find(v => /female|samantha|zira|karen|susan|hazel|jenny|aria|victoria/i.test(v.name)) : P.vs.find(v => /david|james|daniel|alex|fred|mark|george|guy|ryan|\bmale/i.test(v.name) && !/female/i.test(v.name));
function stop() {
  P.tok++;
  try { P.a.onended = null; P.a.onerror = null; P.a.pause(); } catch (e) {}
  try { speechSynthesis.cancel(); } catch (e) {}
  P.on = false; P.cur = null; paintAudio();
}
function speakOnce(x, rate, tok, done) {
  let fin = false; const end = () => { if (fin) return; fin = true; if (tok === P.tok) done(); };
  if (auHas(x)) {
    const a = P.a; a.onended = end; a.onerror = end; a.src = 'audio/p6/' + x.id + '.mp3';
    try { a.defaultPlaybackRate = rate; a.playbackRate = rate; a.preservesPitch = true; a.webkitPreservesPitch = true; a.mozPreservesPitch = true; } catch (e) {}
    try { const pr = a.play(); if (pr && pr.catch) pr.catch(end); } catch (e) { end(); }
    return;
  }
  if (!hasTTS()) return end();
  const u = new SpeechSynthesisUtterance(sayText(x)), g = who(x);
  u.lang = 'en-US'; const v = voiceFor(g) || P.vs[0]; if (v) u.voice = v;
  u.pitch = g === 'F' ? 1.2 : 0.8; u.rate = Math.max(.5, Math.min(2, .95 * rate)); u.onend = end; u.onerror = end;
  try { speechSynthesis.speak(u); } catch (e) { end(); }
}
function playSent(id) {
  const x = byId(id); if (!x) return; stop(); const tok = P.tok; P.on = true; P.cur = id; P.did[id] = 1; paintAudio();
  speakOnce(x, P.rate, tok, () => { if (tok === P.tok) { P.on = false; P.cur = null; paintAudio(); } });
}
function speakWord(w) {   // 單字發音只用機器發音
  stop(); if (!hasTTS()) return;
  try { const u = new SpeechSynthesisUtterance(w); u.lang = 'en-US'; u.rate = .9; const v = voiceFor('F') || P.vs[0]; if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) {}
}
const togglePlay = id => { if (P.on && P.cur === id) stop(); else playSent(id); };
function setRate(v) { P.rate = v; try { P.a.playbackRate = v; } catch (e) {} render(); }
/* 播放鈕：Part 6 的音檔會念出答案，所以一律用次要樣式（不搶「下一篇」的主要位置） */
const audBtn = id => `<button data-aid="${esc(id)}" onclick="togglePlay(this.dataset.aid)" class="${btn} ${line}">${P.on && P.cur === id ? '⏹ 停止' : (P.did[id] ? '🔁 重播' : '🔊 播放')}</button>`;
function paintAudio() { document.querySelectorAll('[data-aud]').forEach(e => { e.innerHTML = audBtn(e.dataset.aud); }); }
const rateH = x => `<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-3"><span>語速</span>${[0.75, 1, 1.25].map(v => `<button onclick="setRate(${v})" class="${btn} !py-1 !px-2.5 text-xs ${P.rate === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${v}×</button>`).join('')}<span class="text-slate-400">${auHas(x) ? '錄音檔' : '機器發音'}</span>${!auHas(x) && !hasTTS() ? '<span class="text-rose-500">這個瀏覽器沒有機器發音，也還沒有音檔。</span>' : ''}</div>`;
window.addEventListener('pagehide', () => { try { stop(); } catch (e) {} });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
function toggleDark() { S.dark = !S.dark; try { const c = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; c.dark = S.dark; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} render(); }

/* ---------- 導覽、頁首 ---------- */
const T = { id: null };
const clrT = () => { if (T.id) { clearInterval(T.id); T.id = null; } };
function go(view) {
  stop(); clrT(); V.view = view;
  if (!['run', 'result'].includes(view)) { V.run = null; V.t = null; }
  render(); window.scrollTo({ top: 0 });
}
const goHome = () => go('home');
const goBack = () => go(V.t ? 'test' : V.run && V.run.key === 'book' ? 'book' : 'practice');
const openPractice = () => go('practice'), openTest = () => go('test'), openBook = () => go('book');
function hdr(title, back) {
  const b = back ? `<button onclick="${back}" class="${btn} ${line} !py-1.5 shrink-0">← 返回</button>` : `<a href="index.html" class="${btn} ${line} !py-1.5 shrink-0" aria-label="回到首頁">⌂</a>`;
  return `<header class="flex items-center justify-between gap-2 mb-5"><div class="flex items-center gap-2 min-w-0">${b}<h1 class="text-lg md:text-2xl font-bold truncate">${title}</h1></div>
    <button onclick="toggleDark()" class="${btn} ${line} !py-1.5 shrink-0" aria-label="切換深淺色">${S.dark ? '☀' : '☾'}</button></header>`;
}
const progH = f => `<div class="h-1.5 rounded bg-slate-200 dark:bg-slate-800 mb-4"><div class="h-1.5 rounded bg-indigo-600" style="width:${Math.max(0, Math.min(1, f)) * 100}%"></div></div>`;
function clipText(t, el) {
  const done = () => { if (el) { el.dataset.l = el.dataset.l || el.textContent; el.textContent = '已複製 ✓'; setTimeout(() => { if (el.isConnected) el.textContent = el.dataset.l || '複製'; }, 1500); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb); else fb();
}
function toast(m) { const d = document.createElement('div'); d.textContent = m; d.className = 'fixed left-1/2 -translate-x-1/2 bottom-6 z-[60] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }

/* ---------- 文章顯示：標頭＋段落；pill(n) 決定空格怎麼畫；clues 是要高亮的線索原文 ---------- */
function fmt(raw, clues, pill) {
  const iv = []; (clues || []).forEach(c => { if (!c) return; const a = raw.indexOf(c); if (a < 0) return; const b = a + c.length; if (iv.every(v => b <= v[0] || a >= v[1])) iv.push([a, b]); });
  iv.sort((p, q) => p[0] - q[0]); let s = '', p = 0;
  iv.forEach(([a, b]) => { s += raw.slice(p, a) + '\u0001' + raw.slice(a, b) + '\u0002'; p = b; }); s += raw.slice(p);
  return esc(s).replace(/\[\[(\d)\]\]/g, (_, n) => pill(+n)).replace(/\u0001/g, '<mark class="rounded px-0.5 bg-amber-200/70 dark:bg-amber-500/30 text-inherit">').replace(/\u0002/g, '</mark>');
}
const passH = (x, pill, clues, flat) => `<div class="${flat ? 'rounded-lg bg-slate-50 dark:bg-slate-950/50 p-4 mb-3' : card + ' p-5 mb-3'}">${x.head.length ? `<div class="text-xs text-slate-500 mb-2">${x.head.map(h => `<div>${fmt(h, clues, pill)}</div>`).join('')}</div>` : ''}${x.body.map(p => `<p class="leading-relaxed mb-2">${fmt(p, clues, pill)}</p>`).join('')}</div>`;
const hintH = () => `<details class="${card} p-3 mb-3"><summary class="cursor-pointer text-sm font-bold">解題流程提示</summary><ol class="text-sm list-decimal pl-5 mt-2 text-slate-600 dark:text-slate-300 space-y-1"><li>先快速掃讀 30–45 秒，抓文章類型與語氣。</li><li>先做文法與詞彙題，句子插入留到最後。</li><li>聚焦空格前後 2–3 個詞找線索；時態、代名詞、轉折詞要回頭看標頭與前後句。</li><li>用刪去法，再把答案代回整句、整段檢查。</li></ol></details>`;
const mk = (t, c) => `<mark class="rounded px-0.5 bg-amber-200/70 dark:bg-amber-500/30 text-inherit">${esc(t)}</mark>`;
/* 選項庫：看全部選項（含本次出現與否、near、trap、累計出現次數） */
function bankH(x, q, d) {
  const all = [0, ...q.distractors.map((_, i) => i + 1)], st = R.stat[qk(x, q)], y = qi(x, q);
  return `<details class="mt-2"><summary class="cursor-pointer text-xs font-bold text-indigo-600 dark:text-indigo-400">看完整選項庫（${all.length} 個）</summary><div class="mt-2 space-y-1.5">${all.map(k => {
    const o = optOf(y, k), was = d && d.shown.includes(k);
    return `<div class="rounded-lg border px-3 py-1.5 text-sm ${o.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-800'}"><b>${esc(o.t)}</b> <span class="text-xs text-slate-500">${esc(o.zh || '')} ${esc(o.pos || '')}</span>${d ? `<span class="text-xs ml-1 ${was ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}">${was ? '本次出現' : '本次沒抽到'}</span>` : ''}${o.near ? '<span class="text-xs ml-1 text-amber-600">near</span>' : ''}${st ? `<span class="text-xs ml-1 text-slate-400">累計出現 ${st.shown[k] || 0} 次</span>` : ''}<span class="block text-xs ${o.ok ? 'text-emerald-600' : 'text-slate-500'}">${o.ok ? '✓ 正解' : esc(trn(o.trap))}：${esc(o.why)}</span></div>`;
  }).join('')}</div></details>`;
}
const vocabH = x => `<div class="flex flex-wrap gap-2">${(x.vocab || []).map(v => `<button data-w="${esc(v.word)}" onclick="speakWord(this.dataset.w)" class="${btn} ${line} !py-1.5 text-left">🔊 <b>${esc(v.word)}</b> <span class="text-xs text-slate-500">${esc(v.ipa || '')} ${esc(v.pos || '')}</span><span class="block text-xs text-slate-500">${esc(v.zh || '')}・${esc(v.col || '')}</span></button>`).join('')}</div>`;
const zhH = x => `<details class="mb-3"><summary class="cursor-pointer text-sm font-bold">全文中文翻譯</summary>${x.zh.map(p => `<p class="text-sm mt-1">${esc(p)}</p>`).join('')}</details>`;
const chips = q => `<span class="${chip}">${KD[q.kind] || q.kind}・${esc(pName(q.point))}</span> <span class="${chip}">${esc(SCN[q.scope] || '')}</span>`;
const metaH = x => `<div class="flex flex-wrap gap-1.5 mb-3"><span class="${chip}">${TIER[tier(x)]}${x.level && x.level.score ? ' · ' + x.level.score : ''}</span>${x.domain ? `<span class="${chip}">${esc(domLabel(x.domain))}</span>` : ''}<span class="${chip}">${esc(docN(x.doc))}</span></div>`;
const exOne = (x, q, d) => `<div class="mb-3"><p class="text-sm"><b>第 ${q.n} 空</b> ${esc(q.tag || '')} ${chips(q)}</p><p class="text-sm mt-1">線索：${mk(q.clue.text)}</p><ol class="text-sm list-decimal pl-5 text-slate-600 dark:text-slate-300">${q.clue.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>${bankH(x, q, d)}</div>`;

/* ===================== 首頁 ===================== */
const pickBtn = () => `<label class="${btn} ${pri} inline-block mt-3">選取 part6.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label>`;
function loadWarn() {
  if (!LERR) return '';
  const code = 'px-1 rounded bg-amber-100 dark:bg-amber-900/50';
  const ttl = { file: '請手動選取 part6.json', fetch: '讀不到 part6.json，可以手動選取', bad: 'part6.json 格式有誤', empty: 'part6.json 內沒有可用的題目' }[LERR];
  const body = {
    file: `直接雙擊開啟時，瀏覽器不允許自動讀取本機的 json 檔。請選擇同資料夾的 part6.json（本次開啟有效，重新整理後要再選一次）。<br>想要自動載入：在專案資料夾執行 <code class="${code}">python -m http.server 8000</code>，再開 <code class="${code}">http://localhost:8000/part6.html</code>；或上傳到 GitHub Pages。<br><span class="text-xs">備註：用手動選取時讀不到 audio/index.json，所以暫時都用機器發音。</span>`,
    fetch: '請確認 part6.json 與 part6.html 在同一個資料夾、檔名大小寫正確（GitHub Pages 區分大小寫）。也可以先手動選取檔案使用。',
    bad: 'JSON 解析失敗：' + esc(LMSG) + '。可用 json_merge.py 重新合併，或改選另一個檔案。',
    empty: '請確認 items 內每篇都有 head、body、zh、questions（4 題）。可用 json_merge.py 合併並驗證題目，或改選另一個檔案。'
  }[LERR];
  return `<div class="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 p-4 mb-4 text-sm leading-relaxed"><b>${ttl}</b><br>${body}<br>${pickBtn()}</div>`;
}
function trapCounts() {   // 依最近一次作答，每個空格選到的干擾項陷阱
  const cnt = {};
  Object.keys(R.rec).forEach(key => {
    const r = R.rec[key]; if (!r || r.ok || !(r.k > 0)) return;
    const [id, n] = key.split('#'), x = byId(id), q = x && x.questions.find(z => z.n === +n), d = q && q.distractors[r.k - 1];
    if (d && d.trap) cnt[d.trap] = (cnt[d.trap] || 0) + 1;
  });
  return Object.entries(cnt).sort((a, b) => b[1] - a[1]);
}
function homeH() {
  let h = hdr('Part 6 段落填空');
  if (!DATA.length) return h + loadWarn() + (LERR ? '' : `<div class="${card} p-8 text-center text-sm text-slate-500">part6.json 還沒有題目。請把 AI 生成的題目合併進 items。</div>`) + `<button onclick="go('admin')" class="${btn} ${line} w-full mt-4">🛠 維護</button>`;
  const nSaved = wrongItems().length;
  h += loadWarn();
  h += `<div class="grid gap-3 md:grid-cols-2 mb-4">
    <button onclick="openPractice()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📖 練習</p>
      <p class="text-sm text-slate-500 mt-2">依難度、主題、文章類型隨機抽文章，不計分。作答後立即看解析，可重複播放音檔。</p></button>
    <button onclick="openTest()" class="${card} p-5 text-left hover:border-indigo-500 cursor-pointer"><p class="text-xl font-bold">📝 測驗</p>
      <p class="text-sm text-slate-500 mt-2">先選難度，主題與考點可選可不選，抽 1 篇或 4 篇（16 題）。有倒數計時，交卷後才檢討。</p></button></div>
    <div class="grid grid-cols-3 gap-3"><button onclick="openBook()" class="${btn} ${line}">★ 錯題本 ${nSaved}</button><button onclick="go('reports')" class="${btn} ${line}">⚑ 提報${openRpN() ? ' ' + openRpN() : ''}</button><button onclick="go('admin')" class="${btn} ${line}">🛠 維護</button></div>`;
  const top = trapCounts();
  if (top.length) h += `<h2 class="font-bold mt-8 mb-2">你常中的陷阱（依最近一次作答）</h2><div class="flex flex-wrap gap-2">${top.map(([k, v]) => `<span class="${chip}">${esc(trn(k))} × ${v}</span>`).join('')}</div>`;
  return h;
}

/* ===================== 練習／測驗選單（編號步驟） ===================== */
function fbtn(w, k, v, label) {
  const f = V[w === 'p' ? 'pf' : 'tf'], on = f[k] === v;
  const n = poolOf(Object.assign({}, f, { [k]: v }, k === 'k' ? { p: '' } : {})).length;
  return `<button data-w="${w}" data-k="${k}" data-v="${esc(v)}" onclick="setF(this.dataset.w,this.dataset.k,this.dataset.v)" class="${btn} !py-1.5 ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${n === 0 ? ' opacity-40' : ''}">${label} <span class="text-xs opacity-70">${n}</span></button>`;
}
function setF(w, k, v) {
  const f = V[w === 'p' ? 'pf' : 'tf']; f[k] = (v === '' || f[k] === v) ? '' : v;   // 再點一次已選中的＝取消
  if (k === 'k') f.p = '';
  render();
}
function filtersH(w) {
  const f = V[w === 'p' ? 'pf' : 'tf'], ds = DOMS(), docs = Object.keys((SPEC && SPEC.docs) || {}).filter(c => DATA.some(x => x.doc === c));
  const ks = Object.keys(KD).filter(k => DATA.some(x => x.questions.some(q => q.kind === k)));
  const pts = f.k ? Object.keys((SPEC && SPEC.points) || {}).filter(p => SPEC.points[p].kind === f.k && DATA.some(x => x.questions.some(q => q.point === p))) : [];
  let h = `<h2 class="font-bold mb-2">1. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${fbtn(w, 't', '', '不限難度')}${Object.keys(TIER).map(k => fbtn(w, 't', k, TIER[k])).join('')}</div><p class="text-xs text-slate-400 mb-5">${tierHint()}。</p>`;
  h += `<h2 class="font-bold mb-2">2. 選主題 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-1">${fbtn(w, 'd', '', '不限主題')}${ds.map(d => fbtn(w, 'd', d, esc(domLabel(d)))).join('')}</div><p class="text-xs text-slate-400 mb-5">${f.d ? '只從「' + esc(domLabel(f.d)) + '」抽文章；再點一次可取消。' : '不限主題：從所有主題隨機抽文章。'}</p>`;
  h += `<h2 class="font-bold mb-2">3. 選文章類型 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-5">${fbtn(w, 'c', '', '不限類型')}${docs.map(c => fbtn(w, 'c', c, esc(docN(c)))).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">4. 選考點 <span class="text-xs font-normal text-slate-400">（可不選）</span></h2><div class="flex flex-wrap gap-2 mb-2">${fbtn(w, 'k', '', '不限考點')}${ks.map(k => fbtn(w, 'k', k, KD[k])).join('')}</div>`;
  if (pts.length > 1) h += `<div class="flex flex-wrap items-center gap-2 mb-2"><span class="text-xs text-slate-500">細分</span>${fbtn(w, 'p', '', '該類全部')}${pts.map(p => fbtn(w, 'p', p, esc(pName(p)))).join('')}</div>`;
  return h + `<p class="text-xs text-slate-400 mb-5">選了考點，只會抽到含該考點空格的文章（一篇仍是 4 個空格全部作答）。</p>`;
}
function startPractice() {
  const l = shuf(poolOf(V.pf)); begin(V.pn ? l.slice(0, V.pn) : l, 'practice', startPractice);
}
function startOne(id) { const x = byId(id); if (x) begin([x], 'practice', () => startOne(id)); }
const startBook = () => begin(shuf(wrongItems()), 'book');
function practiceH() {
  let h = hdr('練習', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">跟測驗一樣依條件隨機抽文章，但不計分、不留最佳紀錄。每篇 4 個空格，作答後立即看解析；音檔會念出填入答案的全文，可重複播放。答錯的空格會放進錯題本。</p>`;
  h += filtersH('p');
  h += `<h2 class="font-bold mb-2">5. 篇數</h2><div class="flex flex-wrap gap-2 mb-5">${[[6, '6 篇'], [12, '12 篇'], [0, '全部']].map(([v, l]) => `<button onclick="V.pn=${v};render()" class="${btn} !py-1.5 ${V.pn === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div>`;
  const m = poolOf(V.pf), n = V.pn ? Math.min(m.length, V.pn) : m.length;
  h += `<button onclick="startPractice()" ${m.length ? '' : 'disabled'} class="${btn} ${pri} w-full">開始練習（${n} 篇）</button>`;
  if (!m.length) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有文章，請換一個條件。</p>`;
  else if (V.pn && m.length < V.pn) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${m.length} 篇，將全部出題。</p>`;
  if (m.length) h += `<details class="mt-6"><summary class="cursor-pointer text-sm font-bold">或指定一篇練習（${m.length} 篇）</summary><div class="mt-2">${m.map(x => {
    const rs = x.questions.map(q => R.rec[qk(x, q)]), all = rs.every(Boolean), c = rs.filter(t => t && t.ok).length;
    return `<button data-id="${esc(x.id)}" onclick="startOne(this.dataset.id)" class="${card} p-3 mb-2 w-full text-left flex justify-between gap-2 cursor-pointer"><span class="min-w-0"><b class="text-sm">${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="flex flex-wrap gap-1 mt-1"><span class="${chip}">${TIER[tier(x)]}</span><span class="${chip}">${esc(docN(x.doc))}</span></span></span><span class="text-xs shrink-0 ${all ? (c === 4 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}">${all ? (c === 4 ? '✓ ' : '✗ ') + c + '/4' : '尚未作答'}</span></button>`;
  }).join('')}</div></details>`;
  return h;
}
const tcKey = () => [V.tf.t, V.tf.d, V.tf.c, V.tf.k, V.tf.p, V.tn].join('|');
function startTest() { beginTest(shuf(poolOf(V.tf)).slice(0, V.tn)); }
function testH() {
  let h = hdr('測驗', 'goHome()');
  h += `<p class="text-sm text-slate-500 mb-5">依條件從題庫隨機抽文章。作答中不顯示對錯、沒有音檔；有倒數計時（只提示，不強制），可標記待檢查，交卷後一次檢討。</p>`;
  h += filtersH('t');
  h += `<h2 class="font-bold mb-2">5. 選篇數</h2><div class="flex flex-wrap gap-2 mb-1">${[[1, '1 篇（4 題）'], [4, '4 篇完整版（16 題）']].map(([v, l]) => `<button onclick="V.tn=${v};render()" class="${btn} !py-1.5 ${V.tn === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${l}</button>`).join('')}</div><p class="text-xs text-slate-400 mb-5">計時＝各篇建議作答時間加總（初級 100 秒、中級 120 秒、高級 140 秒）。</p>`;
  const m = poolOf(V.tf), n = Math.min(m.length, V.tn), o = R.tests[tcKey()];
  h += `<button onclick="startTest()" ${m.length ? '' : 'disabled'} class="${btn} ${pri} w-full">開始測驗（${n} 篇）</button>`;
  if (!m.length) h += `<p class="text-xs text-rose-500 mt-2">這個組合目前沒有文章，請換一個條件。</p>`;
  else if (m.length < V.tn) h += `<p class="text-xs text-amber-600 mt-2">這個組合目前只有 ${m.length} 篇，將全部出題。</p>`;
  if (o) h += `<p class="text-xs text-slate-500 mt-3">這個組合的紀錄：最佳 ${o.best}% · 最近一次 ${o.last}%</p>`;
  return h;
}

/* ===================== 練習／錯題重做（一篇一畫面） ===================== */
const SNAP = {};   // 提報用的快照：SNAP[題目id][空格編號] = {shown, sel}
function begin(list, key, again) {
  if (!list || !list.length) return; stop(); clrT(); V.t = null;
  V.run = { list, i: 0, key, hist: [], again: again || null }; startPass();
}
function startPass() {
  stop(); const run = V.run, x = run.list[run.i], rev = {};
  if (run.key === 'book') x.questions.forEach(q => { if (R.saved[qk(x, q)]) rev[q.n] = 1; });   // 上次答錯的空格，標黃
  P.did = {}; run.r = { x, deal: {}, ans: {}, secs: {}, rev, last: Date.now() };
  V.view = 'run'; render(); window.scrollTo({ top: 0 });
}
const dealOf = (r, q) => r.deal[q.n] || (r.deal[q.n] = deal(qi(r.x, q)));
function pick(n, j) {
  const r = V.run.r, x = r.x, q = x.questions.find(t => t.n === n); if (r.ans[n] !== undefined) return;
  const d = dealOf(r, q), k = d.shown[j], key = qk(x, q), now = Date.now(), secs = Math.round((now - r.last) / 1000);
  r.last = now; r.ans[n] = j; r.secs[n] = secs;
  R.rec[key] = { ok: k === 0, k, secs, t: now };
  if (k === 0) delete R.saved[key]; else R.saved[key] = true;   // 答錯加入錯題本；之後在任何作答畫面答對就自動移出
  const st = R.stat[key]; if (st) st.picked[k] = (st.picked[k] || 0) + 1;
  (SNAP[x.id] = SNAP[x.id] || {})[n] = { shown: d.shown.slice(), sel: j };
  saveR(); const y = scrollY; render(); scrollTo(0, y);
}
function entryOf(r) {
  const x = r.x, dl = {};
  const rows = x.questions.map(q => { const key = qk(x, q), d = dealOf(r, q), j = r.ans[q.n], k = j === undefined ? -1 : d.shown[j]; dl[key] = d; return { x, q, key, j, k, ok: k === 0, secs: r.secs[q.n] || 0, slow: true }; });
  return { x, rows, dl };
}
function nextPass() {
  const run = V.run; stop(); run.hist.push(entryOf(run.r));
  if (run.i + 1 < run.list.length) { run.i++; startPass(); return; }
  V.view = 'result'; render(); window.scrollTo({ top: 0 });   // 最後一篇進結果頁時不播放音檔
}
function quit() {
  if (V.t && Object.keys(V.t.ans).length && !confirm('離開後這次測驗不會計分，確定離開？')) return;
  goBack();
}
function runPill(r) {
  return n => {
    const x = r.x, q = x.questions.find(t => t.n === n), j = r.ans[n];
    if (j === undefined) return `<a href="#q${n}" class="px-2 mx-0.5 rounded font-bold ${r.rev[n] ? 'bg-amber-200 dark:bg-amber-500/40 text-amber-900 dark:text-amber-100' : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'}">(${n})</a>`;
    const o = optOf(qi(x, q), dealOf(r, q).shown[j]);
    return `<b class="px-1 rounded ${o.ok ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'}">${esc(o.t)}</b>`;
  };
}
function qH(r, q) {
  const x = r.x, d = dealOf(r, q), a = r.ans[q.n], done = a !== undefined;
  return `<div id="q${q.n}" class="${card} p-4 mb-3"><p class="text-sm font-bold mb-2">第 ${q.n} 空 <span class="${chip}">${KD[q.kind] || q.kind}</span>${r.rev[q.n] ? ' <span class="text-xs rounded-full px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">上次答錯</span>' : ''}</p><div class="space-y-2">${d.shown.map((k, j) => {
    const o = optOf(qi(x, q), k);
    const cls = done ? (o.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : a === j ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50' : 'opacity-40 border-slate-200 dark:border-slate-800') : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer';
    return `<button ${done ? 'disabled' : `onclick="pick(${q.n},${j})"`} class="w-full text-left rounded-lg border px-3 py-2 text-sm ${cls}"><b>(${L[j]})</b> ${esc(o.t)}${done ? `<span class="block text-xs ${o.ok ? 'text-emerald-600' : 'text-slate-500'}">${esc(o.zh || '')}${o.ok ? '' : '・' + esc(trn(o.trap))}：${esc(o.why)}</span>` : ''}</button>`;
  }).join('')}</div>${done ? `<p class="text-xs text-slate-500 mt-2">${esc(pName(q.point))}・${esc(SC[q.scope] || '')}・用時 ${r.secs[q.n] || 0} 秒</p>` : ''}</div>`;
}
const exH = r => `<div class="${card} p-4 mb-3"><p class="text-sm font-bold mb-2">解析</p>${r.x.questions.map(q => exOne(r.x, q, r.deal[q.n])).join('')}${zhH(r.x)}${vocabH(r.x)}</div>`;
function runH() {
  const run = V.run, r = run.r, x = r.x, qs = x.questions, n = run.list.length;
  const an = qs.filter(q => r.ans[q.n] !== undefined).length, done = an === qs.length, last = run.i + 1 === n;
  const c = qs.filter(q => r.ans[q.n] !== undefined && dealOf(r, q).shown[r.ans[q.n]] === 0).length;
  let h = hdr(`練習 · ${run.i + 1} / ${n}`, 'quit()');
  h += progH((run.i + an / qs.length) / n);
  h += metaH(x);
  if (run.key === 'book') h += `<p class="text-xs text-slate-500 mb-2">黃色空格是上次答錯的。</p>`;
  h += passH(x, runPill(r), done ? qs.map(q => q.clue.text) : []);
  // 下一篇：一篇有 4 個空格（成組），練習可以不答完就跳；答完＝主要樣式，未答完＝次要樣式
  const nextBtn = `<button onclick="nextPass()" class="${btn} ${done ? pri : line}">${last ? '完成，看結果' : '下一篇 →'}</button>`;
  h += `<div class="flex items-center gap-3 my-4 flex-wrap"><span data-aud="${esc(x.id)}" class="flex items-center gap-2">${audBtn(x.id)}</span>${nextBtn}<span class="text-xs text-slate-400">可重複播放（會念出答案）</span><span class="ml-auto">${rpBtn(x.id)}</span></div>${rateH(x)}`;
  if (!done) h += hintH();
  h += qs.map(q => qH(r, q)).join('');
  if (!done) h += `<p class="text-xs text-slate-400 mb-3">還差 ${qs.length - an} 題；也可以先按「${last ? '完成，看結果' : '下一篇'}」跳過。</p>`;
  else h += `<div class="${card} p-3 mb-3 text-center"><b>${c}/${qs.length} 答對</b></div>${exH(r)}`;
  return h;
}

/* ===================== 結果頁／錯題本共用的「一篇」呈現 ===================== */
function resBodyH(e, withBank) {
  const x = e.x, rows = e.rows, wr = rows.filter(r => !r.ok);
  const pill = n => {
    const r = rows.find(z => z.q.n === n), a = optOf(qi(x, r.q), 0).t, good = `<b class="px-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">${esc(a)}</b>`;
    if (r.ok) return good;
    const my = r.k > 0 ? optOf(qi(x, r.q), r.k).t : '';
    return `${my ? `<s class="text-rose-600">${esc(my)}</s> ` : '<span class="text-xs text-amber-600">（未答）</span> '}${good}`;
  };
  return `${passH(x, pill, wr.map(r => r.q.clue.text), true)}${wr.map(r => {
    const my = r.k > 0 ? optOf(qi(x, r.q), r.k) : null, ans = optOf(qi(x, r.q), 0);
    return `<div class="mb-3"><p class="text-sm"><b>第 ${r.q.n} 空</b> ${chips(r.q)}${r.secs > sug(x) / 2 && r.slow ? ` <span class="text-xs rounded-full px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">偏慢 ${r.secs} 秒</span>` : ''}</p>
    <p class="text-sm text-rose-600 mt-1">你選：${my ? esc(my.t) + '（' + esc(trn(my.trap)) + '）' : '（未作答）'}</p>${my ? `<p class="text-xs text-slate-500">${esc(my.why)}</p>` : ''}
    <p class="text-sm text-emerald-600 mt-1">正解：${esc(ans.t)}</p><p class="text-xs text-slate-500">${esc(ans.why)}</p>
    <p class="text-sm mt-1">線索：${mk(r.q.clue.text)}</p><ol class="text-sm list-decimal pl-5 mt-1 text-slate-600 dark:text-slate-300">${r.q.clue.steps.map(z => `<li>${esc(z)}</li>`).join('')}</ol>${bankH(x, r.q, e.dl && e.dl[r.key])}</div>`;
  }).join('')}${zhH(x)}${vocabH(x)}`;
}
function resCardH(e, i) {
  const c = e.rows.filter(r => r.ok).length, all = c === e.rows.length;
  return `<div class="${card} p-4 mb-3"><p class="text-sm font-bold mb-2 ${all ? 'text-emerald-600' : 'text-rose-600'}">${all ? '✓' : '✗'} Q${i + 1} · ${esc(e.x.tag)} <span class="text-xs font-normal text-slate-500">答對 ${c}/${e.rows.length}</span></p>${metaH(e.x)}${resBodyH(e)}<div class="mt-3 text-right">${rpBtn(e.x.id)}</div></div>`;
}
function scoreCardH(sub, c, n, btns) {
  return `<div class="${card} p-5 text-center mb-5"><p class="text-sm text-slate-500">${sub}</p>
    <p class="text-4xl font-bold mt-1 ${c / n >= 0.75 ? 'text-emerald-600' : 'text-amber-600'}">${c} / ${n}</p><p class="text-sm text-slate-500 mt-1">答對率 ${Math.round(c / n * 100)}%</p>
    <div class="flex gap-2 justify-center mt-4">${btns}</div></div>`;
}
const againRun = () => { if (V.run && V.run.again) V.run.again(); };
function resultH() {
  if (V.t && V.t.res) return testResultH();
  const run = V.run, es = run.hist, rows = es.flatMap(e => e.rows), c = rows.filter(r => r.ok).length, book = run.key === 'book';
  let h = hdr('作答結果', 'goBack()');
  h += scoreCardH('練習結果（不計入成績）· 空格數', c, rows.length, `<button onclick="goBack()" class="${btn} ${line}">${book ? '回錯題本' : '回練習選單'}</button>${run.again ? `<button onclick="againRun()" class="${btn} ${pri}">再練一次（重新抽題）</button>` : ''}`);
  return h + es.map(resCardH).join('');
}

/* ===================== 錯題本（以篇為單位，鍵仍是 題目id#空格編號） ===================== */
function bookRows(x) {
  return x.questions.map(q => { const key = qk(x, q), rec = R.rec[key]; return { x, q, key, k: rec && rec.k != null ? rec.k : -1, ok: !R.saved[key], secs: 0 }; });
}
function unsave(id) { const x = byId(id); if (x) x.questions.forEach(q => { delete R.saved[qk(x, q)]; }); saveR(); render(); }
function bookH() {
  const xs = wrongItems(); let h = hdr('錯題本', 'goHome()');
  if (!xs.length) return h + `<p class="text-sm text-slate-400 text-center py-10">目前沒有錯題。</p>`;
  h += `<button onclick="startBook()" class="${btn} ${pri} w-full mb-4">重做這 ${xs.length} 篇</button>`;
  xs.forEach(x => {
    const e = { x, rows: bookRows(x), dl: null }, nw = e.rows.filter(r => !r.ok).length;
    h += `<div class="${card} p-4 mb-3"><div class="flex justify-between items-center gap-2"><p class="text-sm font-bold">${esc(x.tag)} <span class="text-xs font-normal text-rose-500">答錯 ${nw} 空</span></p>
      <button onclick="unsave(this.dataset.id)" data-id="${esc(x.id)}" class="text-xs text-rose-500 hover:underline cursor-pointer shrink-0">移除</button></div>
      <div class="mt-2">${metaH(x)}${resBodyH(e)}</div><div class="mt-3 text-right">${rpBtn(x.id)}</div></div>`;
  });
  return h;
}

/* ===================== 模擬測驗：不顯示對錯與播放鈕；題號格、旗標、倒數、交卷 ===================== */
function clockInfo() {
  const t = V.t; if (!t) return ['', ''];
  const left = t.limit - Math.floor((Date.now() - t.t0) / 1000), a = Math.abs(left), f = fm(a);
  return left < 0 ? ['時間到 +' + f + '（僅提示，可繼續作答）', 'text-rose-600 font-bold'] : ['剩餘 ' + f, left < 60 ? 'text-amber-600 font-bold' : ''];
}
function tickClock() { const e = document.getElementById('tm'); if (!e || V.view !== 'run' || !V.t || V.t.res) return; const [t, c] = clockInfo(); e.textContent = t; e.className = 'text-sm ' + c; }
const startClock = () => { clrT(); T.id = setInterval(tickClock, 1000); };
function beginTest(l) {
  if (!l.length) return; stop(); clrT(); V.run = null;
  const t = { list: l, i: 0, deal: {}, ans: {}, flag: {}, qs: {}, ps: {}, t0: Date.now(), last: Date.now(), pc: Date.now(), limit: l.reduce((s, x) => s + sug(x), 0), cfg: tcKey() };
  l.forEach(x => x.questions.forEach(q => { t.deal[qk(x, q)] = deal(qi(x, q)); }));   // 開始時一次抽好，整場固定
  V.t = t; V.view = 'run'; render(); startClock(); window.scrollTo({ top: 0 });
}
function leave(t) { const x = t.list[t.i], now = Date.now(); t.ps[x.id] = (t.ps[x.id] || 0) + (now - t.pc) / 1000; t.pc = now; }
function tgo(i) { const t = V.t; leave(t); t.i = i; t.last = Date.now(); render(); window.scrollTo({ top: 0 }); }
function tq(pi, n) { const t = V.t; if (pi !== t.i) { leave(t); t.i = pi; t.last = Date.now(); } render(); const e = document.getElementById('q' + n); if (e && e.scrollIntoView) e.scrollIntoView({ block: 'start' }); else window.scrollTo({ top: 0 }); }
function tpick(n, j) {
  const t = V.t, x = t.list[t.i], q = x.questions.find(z => z.n === n), key = qk(x, q), now = Date.now();
  t.qs[key] = (t.qs[key] || 0) + (now - t.last) / 1000; t.last = now;
  if (t.ans[key] === j) delete t.ans[key]; else t.ans[key] = j;   // 再點一次同一個選項＝取消作答
  const y = scrollY; render(); scrollTo(0, y);
}
function tflag(n) { const t = V.t, x = t.list[t.i], key = x.id + '#' + n; t.flag[key] = !t.flag[key]; const y = scrollY; render(); scrollTo(0, y); }
function submit() {
  const t = V.t, un = t.list.length * 4 - Object.keys(t.ans).length;
  if (un && !confirm(`還有 ${un} 題沒作答（會算答錯），確定交卷？`)) return; finishTest();
}
function finishTest() {
  const t = V.t; stop(); clrT(); leave(t); const rows = [];
  t.list.forEach(x => x.questions.forEach(q => {
    const key = qk(x, q), j = t.ans[key], d = t.deal[key], k = j === undefined ? -1 : d.shown[j], ok = k === 0, secs = Math.round(t.qs[key] || 0);
    R.rec[key] = { ok, k, secs, t: Date.now() }; if (ok) delete R.saved[key]; else R.saved[key] = true;   // 答錯（含未答）的空格進錯題本；答對則自動移出
    if (k >= 0) { const st = R.stat[key]; if (st) st.picked[k] = (st.picked[k] || 0) + 1; }
    (SNAP[x.id] = SNAP[x.id] || {})[q.n] = { shown: d.shown.slice(), sel: j === undefined ? null : j };
    rows.push({ x, q, key, j, k, ok, secs, slow: true, trap: k > 0 ? q.distractors[k - 1].trap : null });
  }));
  const c = rows.filter(r => r.ok).length, pct = Math.round(c / rows.length * 100), o = R.tests[t.cfg] || {};
  R.tests[t.cfg] = { best: Math.max(o.best || 0, pct), last: pct, n: rows.length };
  saveR(); t.res = summarize(t, rows); V.view = 'result'; render(); window.scrollTo({ top: 0 });
}
function summarize(t, rows) {
  const grp = f => { const o = {}; rows.forEach(r => { const k = f(r), b = o[k] = o[k] || [0, 0]; b[1]++; if (r.ok) b[0]++; }); return o }, tp = {};
  rows.forEach(r => { if (!r.ok && r.trap) tp[r.trap] = (tp[r.trap] || 0) + 1; });
  const ps = t.list.map(x => t.ps[x.id] || 0), sum = ps.reduce((a, b) => a + b, 0);
  return {
    n: rows.length, c: rows.filter(r => r.ok).length, rows, byKind: grp(r => r.q.kind), byPoint: grp(r => r.q.point), byScope: grp(r => r.q.scope), tp,
    avg: Math.round(sum / t.list.length), over: t.list.filter((x, i) => ps[i] > sug(x)).length, slow: rows.filter(r => r.secs > sug(r.x) / 2).length,
    total: Math.round((Date.now() - t.t0) / 1000)
  };
}
function tqH(t, x, q) {
  const key = qk(x, q), a = t.ans[key], d = t.deal[key];
  return `<div id="q${q.n}" class="${card} p-4 mb-3"><div class="flex items-center justify-between mb-2"><p class="text-sm font-bold">第 ${q.n} 空 <span class="text-xs font-normal text-slate-500">（全卷第 ${t.i * 4 + q.n} 題）</span></p><button onclick="tflag(${q.n})" class="${btn} ${line} !py-1 text-xs">${t.flag[key] ? '⚑ 取消標記' : '⚐ 待檢查'}</button></div><div class="space-y-2">${d.shown.map((k, j) => {
    const o = optOf(qi(x, q), k);
    return `<button onclick="tpick(${q.n},${j})" class="w-full text-left rounded-lg border px-3 py-2 text-sm cursor-pointer ${a === j ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50' : 'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}"><b>(${L[j]})</b> ${esc(o.t)}</button>`;
  }).join('')}</div></div>`;
}
function testRunH() {
  const t = V.t, x = t.list[t.i], last = t.i === t.list.length - 1, [ct, cc] = clockInfo(), tot = t.list.length * 4, an = Object.keys(t.ans).length;
  const pill = n => { const q = x.questions.find(z => z.n === n), key = qk(x, q), j = t.ans[key];   // 只顯示所選詞，不顯示對錯
    return `<a href="#q${n}" class="${PA}">${j === undefined ? '(' + n + ')' : esc(optOf(qi(x, q), t.deal[key].shown[j]).t)}</a>`; };
  const grid = t.list.map((y, pi) => `<span class="inline-flex flex-wrap gap-1.5 mr-3 mb-1.5">${y.questions.map(q => { const key = qk(y, q);
    return `<button onclick="tq(${pi},${q.n})" aria-label="第 ${pi * 4 + q.n} 題" class="w-9 h-9 rounded-lg text-sm cursor-pointer ${t.ans[key] !== undefined ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-slate-100 dark:bg-slate-800'} ${t.flag[key] ? 'ring-2 ring-amber-500' : pi === t.i ? 'ring-2 ring-indigo-400' : ''}">${pi * 4 + q.n}</button>`; }).join('')}</span>`).join('');
  return hdr(`測驗 · 第 ${t.i + 1} / ${t.list.length} 篇`, 'quit()') + progH(an / tot)
    + `<div class="${card} p-3 mb-3 flex items-center justify-between gap-2"><span id="tm" class="text-sm ${cc}">${esc(ct)}</span><span class="text-xs text-slate-500">共 ${Math.round(t.limit / 60 * 10) / 10} 分鐘</span></div>
    <div class="${card} p-3 mb-3">${grid}<p class="text-xs text-slate-500">藍底＝已作答；琥珀框＝待檢查；藍框＝目前這一篇</p></div>
    ${metaH(x)}${passH(x, pill, [])}${x.questions.map(q => tqH(t, x, q)).join('')}
    <div class="grid grid-cols-2 gap-2 mt-3"><button ${t.i === 0 ? 'disabled' : ''} onclick="tgo(${t.i - 1})" class="${btn} ${line} disabled:opacity-40 disabled:cursor-not-allowed">← 上一篇</button><button ${last ? 'disabled' : ''} onclick="tgo(${t.i + 1})" class="${btn} ${line} disabled:opacity-40 disabled:cursor-not-allowed">下一篇 →</button></div>
    <button onclick="submit()" class="${btn} ${pri} w-full mt-3">交卷（已答 ${an}/${tot}）</button>`;
}
function testResultH() {
  const t = V.t, s = t.res, { n, c } = s;
  const row = (a, b, cls) => `<div class="flex justify-between gap-3 text-sm py-1 border-b border-slate-100 dark:border-slate-800 ${cls || ''}"><span>${a}</span><span class="shrink-0">${b}</span></div>`, pc = b => b[0] + '/' + b[1] + '（' + Math.round(b[0] / b[1] * 100) + '%）', weak = b => b[0] / b[1] < 0.6 ? 'text-rose-600' : '';
  const ptKeys = Object.keys(s.byPoint).sort((a, b) => s.byPoint[a][0] / s.byPoint[a][1] - s.byPoint[b][0] / s.byPoint[b][1]);
  const ps = t.list.map(x => ({ x, s: Math.round(t.ps[x.id] || 0) }));
  let h = hdr('作答結果', 'goBack()');
  h += scoreCardH(`測驗成績 · ${t.list.length} 篇 · 空格數`, c, n, `<button onclick="goBack()" class="${btn} ${line}">回測驗選單</button><button onclick="startTest()" class="${btn} ${pri}">再測一次（重新抽題）</button>`);
  h += t.list.map((x, i) => resCardH({ x, rows: s.rows.filter(r => r.x === x), dl: t.deal }, i)).join('');
  h += `<details class="${card} p-4 mb-3"><summary class="cursor-pointer text-sm font-bold">詳細統計（用時、題型、考點、線索位置、陷阱）</summary><div class="mt-3">
  <div class="mb-4"><p class="font-bold text-sm mb-1">用時</p>${row('總用時', fm(s.total) + '（時限 ' + fm(t.limit) + '）')}${row('平均每篇用時', s.avg + ' 秒')}${row('超過建議時間的篇數', s.over + ' 篇')}${row('偏慢的空格（超過該篇建議秒數一半）', s.slow + ' 題')}${ps.map(p => row(esc(p.x.id), p.s + ' 秒／建議 ' + sug(p.x) + ' 秒', p.s > sug(p.x) ? 'text-rose-600' : '')).join('')}</div>
  <div class="mb-4"><p class="font-bold text-sm mb-1">各題型正確率</p>${Object.keys(KD).filter(k => s.byKind[k]).map(k => row(KD[k], pc(s.byKind[k]), weak(s.byKind[k]))).join('')}</div>
  <div class="mb-4"><p class="font-bold text-sm mb-1">各考點正確率（由低到高）</p>${ptKeys.map(k => row(esc(pName(k)), pc(s.byPoint[k]), weak(s.byPoint[k]))).join('')}</div>
  <div class="mb-4"><p class="font-bold text-sm mb-1">依線索位置</p>${['local', 'near', 'far'].filter(k => s.byScope[k]).map(k => row(esc(SC[k]), pc(s.byScope[k]), weak(s.byScope[k]))).join('')}${s.byScope.local && (s.byScope.near || s.byScope.far) ? '<p class="text-xs text-slate-500 mt-1">「前後句」「標頭或跨段」偏低，代表需要讀上下文的題比較弱。</p>' : ''}</div>
  ${Object.keys(s.tp).length ? `<div><p class="font-bold text-sm mb-1">你最常中的陷阱</p>${Object.keys(s.tp).sort((a, b) => s.tp[b] - s.tp[a]).map(k => row(esc(trn(k)), s.tp[k] + ' 次')).join('')}</div>` : ''}</div></details>`;
  return h;
}

/* ===================== 提報：發現答案、解析、文章或音檔有瑕疵時記錄；存在 localStorage（PK.reports），管理員可彙整、編輯狀態、匯出／匯入 ===================== */
const RK = { answer: '答案／解析有誤', text: '文章或翻譯有誤', audio: '音檔問題', other: '其他' };   // 無圖的 Part：「照片瑕疵」改為「文章或翻譯有誤」
const RS = { open: '待處理', fixing: '處理中', fixed: '已修正', wontfix: '不處理' };
const RSC = { open: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300', fixing: '!bg-sky-100 !text-sky-700 dark:!bg-sky-950 dark:!text-sky-300', fixed: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-300', wontfix: '' };
const fmtT = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const reportsOf = id => R.reports.filter(r => r.qid === id).sort((a, b) => b.created - a.created);
const openRpN = id => R.reports.filter(r => (r.status === 'open' || r.status === 'fixing') && (!id || r.qid === id)).length;
const rpBtn = qid => { const n = reportsOf(qid).length; return `<button onclick="openReport(this.dataset.q)" data-q="${esc(qid)}" class="text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">⚑ 提報${n ? ` (${n})` : ''}</button>`; };
/* 提報當下四個空格的選項與使用者所選：之後題庫改了，管理員仍看得到使用者當時看到什麼 */
function snapOf(qid) {
  const x = byId(qid), s = SNAP[qid]; if (!x || !s) return null;
  return { qs: x.questions.map(q => { const e = s[q.n]; if (!e) return { n: q.n, opts: null, sel: null }; return { n: q.n, opts: e.shown.map(k => { const o = optOf(qi(x, q), k); return { t: o.t, ok: !!o.ok }; }), sel: e.sel }; }) };
}
const snapLine = (q, ok, sel) => q.opts ? `第 ${q.n} 空：` + q.opts.map((o, i) => `${L[i]}. ${o.t}${o.ok ? ok : ''}${q.sel === i ? sel : ''}`).join('　') : `第 ${q.n} 空：（沒有作答紀錄）`;
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
  const edit = p.mode === 'edit', x = byId(p.qid), sn = p.snap;
  const opt = (o, cur) => Object.keys(o).map(k => `<option value="${k}"${k === cur ? ' selected' : ''}>${o[k]}</option>`).join('');
  const inp = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm';
  return `<div class="fixed inset-0 z-50 bg-black/50 overflow-y-auto" onclick="if(event.target===this)closeReport()"><div class="min-h-full flex items-end sm:items-center justify-center p-3">
    <div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">${edit ? '編輯提報' : '⚑ 提報問題'} · ${esc(p.qid)}</h2><button onclick="closeReport()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    ${x ? `<p class="text-xs text-slate-500 mb-3">${esc(x.tag)}</p>` : ''}
    <label class="block text-xs text-slate-500 mb-1">問題類型</label><select id="rpk" class="${inp} mb-3">${opt(RK, p.kind)}</select>
    <label class="block text-xs text-slate-500 mb-1">描述問題（請寫第幾空，例如：第 2 空 B 其實也成立、中文翻譯有誤…）</label><textarea id="rpn" rows="4" class="${inp} mb-3">${esc(p.note)}</textarea>
    <label class="block text-xs text-slate-500 mb-1">提報人（選填）</label><input id="rpr" value="${esc(p.reporter)}" class="${inp} mb-3" maxlength="30">
    ${edit ? `<div class="grid grid-cols-2 gap-3 mb-3"><div><label class="block text-xs text-slate-500 mb-1">處理狀態</label><select id="rps" class="${inp}">${opt(RS, p.status)}</select></div></div>
    <label class="block text-xs text-slate-500 mb-1">管理員備註（例如：已改第 2 空干擾項、已修正翻譯）</label><textarea id="rpa" rows="2" class="${inp} mb-3">${esc(p.adminNote)}</textarea>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">提報當下四個空格的選項</summary><ul class="mt-1 space-y-0.5">${sn.qs.map(q => `<li>${esc(snapLine(q, ' ✓', '（使用者選）'))}</li>`).join('')}</ul></details>` : ''}
    <div class="flex gap-2 justify-end"><button onclick="closeReport()" class="${btn} ${line}">取消</button><button onclick="saveReport()" class="${btn} ${pri}">${edit ? '儲存變更' : '送出提報'}</button></div></div></div></div>`;
}
const HL = { err: ['✖', 'text-rose-600 dark:text-rose-400'], warn: ['⚠', 'text-amber-600 dark:text-amber-400'], info: ['ℹ', 'text-slate-500'] };
const idBtn = id => byId(id) ? `<button onclick="adminItem(this.dataset.k)" data-k="${esc(id)}" class="font-bold underline decoration-dotted cursor-pointer">${esc(id)}</button>` : `<b>${esc(id)}</b>`;
function reportCardH(r) {
  const x = byId(r.qid), sn = r.snap;
  return `<div class="${card} p-3 mb-3"><div class="min-w-0">
    <div class="flex flex-wrap items-center gap-1.5">${x ? idBtn(r.qid) : `<b class="text-sm">${esc(r.qid)}</b><span class="${chip}">題目已不存在</span>`}<span class="${chip}">${RK[r.kind] || esc(r.kind)}</span><span class="${chip} ${RSC[r.status] || ''}">${RS[r.status] || esc(r.status)}</span></div>
    ${x ? `<p class="text-xs text-slate-500 mt-1">${esc(x.tag)}</p>` : ''}
    <p class="text-sm mt-1.5 whitespace-pre-wrap break-words">${esc(r.note)}</p>
    <p class="text-xs text-slate-400 mt-1">${esc(r.reporter || '匿名')} · ${fmtT(r.created)}${r.updated > r.created ? ' · 更新 ' + fmtT(r.updated) : ''}</p>
    ${r.adminNote ? `<p class="text-xs mt-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 whitespace-pre-wrap break-words"><b>管理員：</b>${esc(r.adminNote)}</p>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mt-1.5"><summary class="cursor-pointer">當時四個空格的選項</summary><ul class="mt-1 space-y-0.5">${sn.qs.map(q => `<li>${esc(snapLine(q, ' ✓', ' ←使用者選'))}</li>`).join('')}</ul></details>` : ''}</div>
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
  return h + `<p class="text-xs text-slate-500 mb-2">共 ${list.length} 筆</p>` + list.map(reportCardH).join('');
}
function download(name, text, mime) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportReports(fmt) {
  if (!R.reports.length) { toast('沒有可匯出的提報'); return; }
  const d = new Date(), p = n => String(n).padStart(2, '0'), stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  if (fmt === 'json') { download(`part6-reports-${stamp}.json`, JSON.stringify({ app: 'toeic-part6-reports', v: 1, exported: Date.now(), reports: R.reports }, null, 2), 'application/json'); return; }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['提報編號', '題目ID', '類型', '狀態', '描述', '提報人', '建立時間', '更新時間', '管理員備註', 'tag', '提報當下的選項與作答'];
  const rows = R.reports.slice().sort((a, b) => a.created - b.created).map(r => { const s = r.snap, x = byId(r.qid);
    return [r.id, r.qid, RK[r.kind] || r.kind, RS[r.status] || r.status, r.note, r.reporter, fmtT(r.created), fmtT(r.updated), r.adminNote, x ? x.tag : '', s ? s.qs.map(q => snapLine(q, '✓', '←選')).join(' ／ ') : ''].map(cell).join(','); });
  download(`part6-reports-${stamp}.csv`, '\ufeff' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
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

/* ===================== 資料健檢（auditAll）：規則來自 part6.json 的 _spec.rules 與 json_merge.py 的 Part6.validate()；只讀取、不修改資料 =====================
   ✖ 錯誤＝會讓題目壞掉或被略過；⚠ 提醒＝不符規格但仍可作答；ℹ 備註＝題目自己寫的 issues。缺音檔不算錯誤。 */
const ID_RE = /^d([1-7])-(\d{3})-([emh])$/, SUF = { e: 'easy', m: 'medium', h: 'hard' }, WORDS = { e: [80, 110], m: [100, 140], h: [130, 180] };
const SCORE_RG = { easy: [500, 550], medium: [600, 650], hard: [700, 800] };
const nrm = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const nWords = s => (String(s).match(/[A-Za-z0-9']+/g) || []).length;
const ansOf = x => { const o = {}; (x.questions || []).forEach(q => { if (q && q.answer) o[q.n] = String(q.answer.t || '').trim(); }); return o; };
const filledP = x => { const a = ansOf(x); return (x.body || []).filter(p => typeof p === 'string').map(p => p.replace(/\[\[(\d)\]\]/g, (m, n) => a[+n] != null ? a[+n] : m)); };
const subjOf = x => { const s = (x.head || []).find(h => /^\s*subject\s*:/i.test(h)); return s ? s.replace(/^[^:]*:/, '').trim() : ((x.head || [])[0] || ''); };
const firstOf = x => { const t = filledP(x).join(' ').trim(), m = t.match(/[.?!](\s|$)/); return m ? t.slice(0, m.index + 1) : t; };
function auditAll(raw) {
  const list = [], add = (id, lv, msg) => list.push({ id, lv, msg });
  const sp = SPEC || {}, PTS = sp.points || {}, TRAPS = sp.traps || {}, DOCS = Object.keys(sp.docs || {});
  const INS_TRAPS = ['topic', 'reference', 'sequence', 'contradiction', 'logic', 'redundant', 'tone'];
  const scenesOf = d => (sp.domains && sp.domains[d] && sp.domains[d].scenes) || [];
  const idCount = {}, own = { tag: {}, vocab: {}, subj: {}, first: {} };
  let dropped = 0;
  raw.forEach((x, i) => {
    if (!x || typeof x !== 'object') { dropped++; add('第 ' + (i + 1) + ' 筆', 'err', '不是物件，已被略過'); return; }
    const id = x.id ? String(x.id) : '第 ' + (i + 1) + ' 筆（無 id）';
    if (!x.id || !['head', 'body', 'zh', 'questions'].every(k => Array.isArray(x[k])) || x.questions.length !== 4) {
      dropped++; add(id, 'err', !x.id ? '缺少 id，已被略過' : 'head／body／zh／questions 都必須是陣列，且 questions 剛好 4 題，已被略過，不會出現在練習／測驗'); return;
    }
    idCount[id] = (idCount[id] || 0) + 1;
    if (idCount[id] > 1) add(id, 'err', 'id 重複：「看題目」只會開到第一筆，錯題本與紀錄也會混在一起');
    const m = ID_RE.exec(id), lv = x.level || {}, sc = lv.score, tr = tier(x);
    if (!m) add(id, 'err', 'id 格式應為 d{1-7}-{3 位數}-{e|m|h}，例如 d1-002-m');
    else {
      const dom = 'd' + m[1];
      if (x.domain !== dom) add(id, 'err', `domain 應為 ${dom}（要等於 id 前段），目前是 ${x.domain}`);
      if (lv.tier !== SUF[m[3]]) add(id, 'err', `level.tier 必須等於 id 尾碼（${m[3]} → ${SUF[m[3]]}），目前是 ${lv.tier}`);
      if (scenesOf(dom).length && !scenesOf(dom).includes(x.scene)) add(id, 'err', `scene「${x.scene}」不屬於 ${dom}（可用：${scenesOf(dom).join('、')}）`);
    }
    if (DOCS.length && !DOCS.includes(x.doc)) add(id, 'err', `doc 必須是 ${DOCS.join('／')}，目前是 ${x.doc}`);
    if (typeof sc !== 'number') add(id, 'err', 'level.score 必須是數字');
    else {
      if (sc % 50) add(id, 'warn', 'level.score 建議為 50 的倍數');
      const ex = sc <= 550 ? 'easy' : sc <= 650 ? 'medium' : 'hard';
      if (lv.tier && lv.tier !== ex) add(id, 'err', `level.score ${sc} 對應${TIER[ex]}，與 tier「${TIER[lv.tier] || lv.tier}」不一致`);
      else if (SCORE_RG[tr] && (sc < SCORE_RG[tr][0] || sc > SCORE_RG[tr][1])) add(id, 'err', `level.score ${sc} 不在${TIER[tr]}的範圍 ${tScore(tr)}`);
    }
    if (!lv.cefr || !lv.why) add(id, 'warn', 'level.cefr 或 level.why 是空的');
    if (x.voice !== 'F' && x.voice !== 'M') add(id, 'err', "voice 必須是 'F' 或 'M'");
    if (!String(x.tag || '').trim()) add(id, 'err', '缺少 tag');
    else if (own.tag[x.tag] && own.tag[x.tag] !== id) add(id, 'warn', `tag「${x.tag}」與 ${own.tag[x.tag]} 相同`); else own.tag[x.tag] = id;
    /* 本文與空格標記 */
    if (x.head.some(h => typeof h !== 'string')) add(id, 'err', 'head 必須是字串陣列'); else if (x.head.length > 5) add(id, 'warn', `head 有 ${x.head.length} 行（建議 0–5 行）`);
    if (x.body.some(p => typeof p !== 'string' || !p.trim())) { add(id, 'err', 'body 必須是字串陣列（段落）'); return; }
    if (x.body.length < 2 || x.body.length > 4) add(id, 'err', `body 必須 2–4 段（目前 ${x.body.length} 段）`);
    if (x.zh.length !== x.body.length) add(id, 'err', `zh 必須與 body 同長（body ${x.body.length} 段，zh ${x.zh.length} 段）`);
    const marks = []; x.body.forEach(p => p.replace(/\[\[(\d)\]\]/g, (_, n) => { marks.push(+n); }));
    if (marks.join() !== '1,2,3,4') add(id, 'err', `[[1]]–[[4]] 必須在 body 內各出現一次且依閱讀順序（目前：${marks.join('、') || '沒有'}）`);
    const full = filledP(x), src = [...x.head, ...x.body, ...full];
    if (full.some(p => p.includes('[['))) add(id, 'err', '把正解填回後，全文仍殘留 [[ 標記');
    /* 4 個空格 */
    const qs = x.questions;
    if (qs.some(q => !q || typeof q !== 'object')) { add(id, 'err', 'questions 內有不是物件的項目'); return; }
    if (qs.map(q => q.n).join() !== '1,2,3,4') add(id, 'err', `questions 的 n 必須依序是 1、2、3、4（目前 ${qs.map(q => q.n).join('、')}）`);
    const nIns = qs.filter(q => q.kind === 'insert').length; if (nIns !== 1) add(id, 'err', `每篇必須剛好 1 題 insert（目前 ${nIns} 題）`);
    const kinds = qs.map(q => q.kind), pts = qs.map(q => q.point), scopes = qs.map(q => q.scope);
    qs.forEach(q => {
      const lab = `第 ${q.n} 空`, ins = q.kind === 'insert', a = q.answer;
      if (!KD[q.kind]) add(id, 'err', `${lab} kind 必須是 grammar／vocab／transition／insert，目前是 ${q.kind}`);
      if (Object.keys(PTS).length) { if (!PTS[q.point]) add(id, 'err', `${lab} point「${q.point}」不在 _spec.points`); else if (PTS[q.point].kind !== q.kind) add(id, 'err', `${lab} point ${q.point} 屬於 ${PTS[q.point].kind}，但 kind 填了 ${q.kind}`); }
      if (!SC[q.scope]) add(id, 'warn', `${lab} scope 應為 local／near／far，目前是 ${q.scope}`);
      if (!String(q.tag || '').trim()) add(id, 'warn', `${lab} 缺少 tag`);
      let at = '';
      if (!a || !String(a.t || '').trim()) add(id, 'err', `${lab} answer.t 不可為空`);
      else {
        at = String(a.t).trim();
        if (!String(a.why || '').startsWith('正解：')) add(id, 'err', `${lab} answer.why 必須以「正解：」開頭`);
        if (!String(a.zh || '').trim()) add(id, 'warn', `${lab} answer 缺少 zh`);
        if (!ins && !String(a.pos || '').trim()) add(id, 'warn', `${lab} answer 缺少 pos`);
      }
      const want = ins ? 3 : 7, ds = Array.isArray(q.distractors) ? q.distractors : [];
      if (ds.length !== want) add(id, 'err', `${lab} distractors 必須剛好 ${want} 個（目前 ${ds.length}）`);
      const texts = at ? [at.toLowerCase()] : [], poss = new Set(a && a.pos ? [a.pos] : []), traps = new Set(); let nNear = 0, nRoot = 0;
      ds.forEach((d, k) => {
        if (!d || typeof d !== 'object') { add(id, 'err', `${lab} 干擾項第 ${k + 1} 個不是物件`); return; }
        const need = ins ? ['t', 'zh', 'trap', 'why'] : ['t', 'zh', 'pos', 'trap', 'why'], miss = need.filter(f => !String(d[f] || '').trim());
        if (miss.length) add(id, 'err', `${lab} 干擾項第 ${k + 1} 個（${d.t || ''}）缺少：${miss.join('、')}`);
        if (d.trap && Object.keys(TRAPS).length && !TRAPS[d.trap]) add(id, 'err', `${lab} 干擾項第 ${k + 1} 個 trap 不合法：${d.trap}`);
        else if (ins && d.trap && !INS_TRAPS.includes(d.trap)) add(id, 'warn', `${lab} 插入題干擾句第 ${k + 1} 個 trap「${d.trap}」不在插入題常用原因`);
        traps.add(d.trap); if (d.t) texts.push(String(d.t).trim().toLowerCase());
        if (!ins) {
          if (typeof d.near !== 'boolean') add(id, 'err', `${lab} 干擾項第 ${k + 1} 個 near 必須是 true/false`);
          if (d.fam !== 'root' && d.fam !== 'other') add(id, 'err', `${lab} 干擾項第 ${k + 1} 個 fam 必須是 'root' 或 'other'`);
          if (d.near === true) nNear++; if (d.fam === 'root') nRoot++; poss.add(d.pos);
        }
      });
      if (new Set(texts).size !== texts.length) add(id, 'err', `${lab} 的選項（正解＋干擾項）裡有文字重複（忽略大小寫）`);
      if (!ins && ds.length) {
        if (nNear < 2) add(id, 'err', `${lab} near:true 至少要有 2 個（目前 ${nNear} 個）`);
        if (q.point === 'wordform' && nRoot < 3) add(id, 'err', `${lab} wordform 題 fam:'root' 至少要有 3 個（目前 ${nRoot} 個）`);
        const ps = [...poss].filter(Boolean); if (q.kind === 'vocab' && ps.length > 1) add(id, 'err', `${lab} 單字題的正解與干擾項詞性必須一致（目前有 ${ps.join('／')}）`);
      }
      if (ins && ds.length === 3 && traps.size < 2) add(id, 'warn', `${lab} 插入題 3 個干擾句只用了 1 種 trap（建議至少 2 種）`);
      const cl = q.clue;
      if (!cl || !String(cl.text || '').trim() || !Array.isArray(cl.steps)) add(id, 'err', `${lab} 缺少 clue（需要 text 與 steps）`);
      else {
        if (cl.steps.length !== 4 || cl.steps.some(z => !String(z || '').trim())) add(id, 'err', `${lab} clue.steps 必須剛好 4 句`);
        if (!src.some(ln => ln.includes(cl.text))) add(id, 'err', `${lab} clue.text 必須是 head 或 body 的原文片段：「${cl.text}」`);
      }
      if (ins) {   // 插入題空格要在句首，且不是全文第一句
        const tok = `[[${q.n}]]`;
        x.body.forEach((p, pi) => { const at2 = p.indexOf(tok); if (at2 < 0) return; const pre = p.slice(0, at2);
          if (pre.trim() && !/[.?!]["”’)]?\s+$/.test(pre)) add(id, 'err', `insert 空格 ${tok} 必須在句首（前面要是句號／問號／驚嘆號，或段首）`);
          if (pi === 0 && !pre.trim()) add(id, 'err', `insert 空格 ${tok} 不可是全文第一句`); });
      }
    });
    /* vocab */
    const vc = Array.isArray(x.vocab) ? x.vocab : [];
    if (vc.length < 3 || vc.length > 5) add(id, 'err', `vocab 必須 3–5 個（目前 ${vc.length}）`);
    const blob = nrm([...x.head, ...full].join(' '));
    vc.forEach((v, k) => {
      const miss = ['word', 'ipa', 'pos', 'col', 'zh'].filter(f => !v || !String(v[f] || '').trim());
      if (miss.length) { add(id, 'err', `vocab 第 ${k + 1} 項缺少：${miss.join('、')}`); return; }
      const w = nrm(v.word), stem = w.includes(' ') ? w : w.replace(/e$/, '');
      if (!new RegExp('\\b' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(blob)) add(id, 'warn', `單字「${v.word}」沒有出現在文章中`);
      if (own.vocab[w] && own.vocab[w] !== id) add(id, 'warn', `單字「${v.word}」與 ${own.vocab[w]} 重複`); else own.vocab[w] = id;
    });
    /* 提醒 */
    if (WORDS[m && m[3]]) { const nw = nWords(full.join(' ')), r = WORDS[m[3]]; if (nw < r[0] || nw > r[1]) add(id, 'warn', `本文 ${nw} 字，不在${TIER[tr]}的範圍 ${r[0]}–${r[1]} 字`); }
    if (scopes.every(s => s === 'local')) add(id, 'warn', 'scope 全是 local（文章不合格，會變成 Part 5）');
    else if (scopes.filter(s => s === 'near' || s === 'far').length < 2) add(id, 'warn', '至少要有 2 題 scope 為 near 或 far');
    if (!kinds.some(k => k === 'vocab' || k === 'transition')) add(id, 'warn', '沒有 vocab 或 transition 題');
    if (!kinds.includes('grammar')) add(id, 'warn', '沒有文法題');
    [...new Set(pts)].filter(p => p && pts.filter(z => z === p).length >= 3).forEach(p => add(id, 'warn', `同一個 point（${p}）出現 ${pts.filter(z => z === p).length} 次`));
    if (x.say && String(x.say).includes('[[')) add(id, 'warn', 'say 含有 [[ 標記');
    const sj = nrm(subjOf(x)), fs = nrm(firstOf(x));
    if (sj) { if (own.subj[sj] && own.subj[sj] !== id) add(id, 'warn', `標頭主旨與 ${own.subj[sj]} 相同`); else own.subj[sj] = id; }
    if (fs) { if (own.first[fs] && own.first[fs] !== id) add(id, 'warn', `首句與 ${own.first[fs]} 相同`); else own.first[fs] = id; }
    if (Array.isArray(x.issues) && x.issues.length) add(id, 'info', '備註：' + x.issues.join('；'));
  });
  const c = lv => list.filter(h => h.lv === lv).length;
  return { list, err: c('err'), warn: c('warn'), info: c('info'), dropped };
}
let HEALTH = { list: [], err: 0, warn: 0, info: 0, dropped: 0 };
const hItems = id => (HEALTH.list || []).filter(h => h.id === id);

/* ===================== 維護頁：概況 → 資料健檢 → 題數矩陣（難度 × 主題）→ 格子 → 單題；新增題目 ===================== */
const A = { d: null, t: null, k: null, nd: null, nt: null, gdoc: 'memo', n: 1, pts: {}, out: [] };
function goA(view, p) { stop(); Object.assign(A, p || {}); V.view = view; V.run = null; V.t = null; render(); window.scrollTo({ top: 0 }); }
const goAdmin = () => go('admin');
const adminCell = (d, t) => goA('adminCell', { d, t: t || null });
function adminItem(k) { const x = byId(k); goA('adminItem', { k, d: x ? x.domain : A.d, t: x ? tier(x) : A.t }); }
const backCell = () => adminCell(A.d, A.t);
const adminNew = (d, t) => goA('adminNew', { nd: d || null, nt: t || null, out: [] });
function adminPick(k, v) { A[k] = (A[k] === v && (k === 'nd' || k === 'nt')) ? null : v; render(); }
function togglePt(p) { A.pts[p] = !A.pts[p]; render(); }
const inCell = (d, t) => DATA.filter(x => x.domain === d && (!t || tier(x) === t)).sort((a, b) => String(a.id).localeCompare(String(b.id)));
const cellStat = (d, t) => { const xs = DATA.filter(x => x.domain === d && tier(x) === t); return { n: xs.length, aud: xs.filter(auMissing).length }; };
const tcol = n => n >= TARGET ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' : n ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400' : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400';
const ROSE_CHIP = `${chip} !bg-rose-100 !text-rose-700 dark:!bg-rose-950 dark:!text-rose-300`, AMB_CHIP = `${chip} !bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300`;
async function recheckAudio() { await auInit(); render(); }
function copyCellMiss() { clipText(inCell(A.d, A.t).filter(auMissing).map(missRow).join('\n'), document.getElementById('cm')); }
function audioStatusH() {
  const N = DATA.length, miss = missAud().length, ok = N - miss;
  const s = !N ? '' : !IDX ? '<span class="text-rose-600 dark:text-rose-400">✖ 尚未讀到 audio/index.json（全部用機器發音）</span>'
    : miss ? `<span class="text-rose-600 dark:text-rose-400">✖ 缺 <b>${miss}</b> 題（有 mp3：${ok} / ${N}；缺的整題改用機器發音）</span>`
      : `<span class="text-emerald-600 dark:text-emerald-400">✔ ${ok} 題都有 mp3</span>`;
  return `<span class="flex items-center gap-2">${s}${N ? `<button onclick="recheckAudio()" class="${btn} ${line} !py-0.5 !px-2 text-xs">重新檢查</button>` : ''}</span>`;
}
function healthH() {
  const H = HEALTH, clean = !H.err && !H.warn && !H.info;
  const chips_ = [H.err ? `<span class="${HL.err[1]}">✖ 錯誤 <b>${H.err}</b></span>` : '', H.warn ? `<span class="${HL.warn[1]}">⚠ 提醒 <b>${H.warn}</b></span>` : '', H.info ? `<span class="${HL.info[1]}">ℹ 備註 <b>${H.info}</b></span>` : ''].filter(Boolean).join('');
  let h = `<div class="${card} p-4 mb-4"><div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><b>資料健檢</b>${clean ? '<span class="text-emerald-600 dark:text-emerald-400">✔ 全部通過</span>' : chips_}</div>`;
  if (H.list.length) {
    const g = {}, order = []; H.list.forEach(it => { if (!g[it.id]) { g[it.id] = []; order.push(it.id); } g[it.id].push(it); });
    h += `<details class="mt-2" ${H.err ? 'open' : ''}><summary class="text-xs cursor-pointer text-slate-500">查看明細（${order.length} 篇有項目）</summary><div class="max-h-96 overflow-auto">`
      + order.map(id => `<div class="mt-2"><p class="text-xs">${idBtn(id)}</p><ul class="text-xs space-y-0.5 mt-0.5">${g[id].map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`).join('') + '</div></details>';
  }
  return h + '</div>';
}
function adminH() {
  const doms = DOMS(), tiers = Object.keys(TIER), N = DATA.length;
  let low = 0; doms.forEach(d => tiers.forEach(t => { if (cellStat(d, t).n < TARGET) low++; }));
  let h = hdr('維護', 'backAdmin()');
  h += `<div class="${card} p-4 mb-4 text-sm"><div class="flex flex-wrap gap-x-6 gap-y-1"><span>題目 <b>${N}</b> 篇（${N * 4} 個空格）${HEALTH.dropped ? ` <span class="${HL.err[1]}">（另有 ${HEALTH.dropped} 筆格式不合被略過）</span>` : ''}</span>`
    + `<span>音檔 <b>${DATA.filter(auHas).length}</b> 題</span>`
    + `<span class="text-slate-500">未達標格子 <b>${low}</b> / ${doms.length * tiers.length}（目標每格 ≥ ${TARGET} 篇）</span></div>`
    + `<div class="flex flex-wrap items-center gap-2 mt-2 text-xs"><span class="text-slate-500">音檔：</span>${audioStatusH()}</div></div>`;
  h += healthH();
  h += `<div class="overflow-x-auto mb-3"><div class="grid gap-1.5 text-center text-sm min-w-[32rem]" style="grid-template-columns:4.5rem repeat(${doms.length},minmax(3rem,1fr))"><div></div>${doms.map(d => `<button data-d="${esc(d)}" onclick="adminCell(this.dataset.d,null)" class="text-xs font-bold py-1 cursor-pointer hover:text-indigo-600">${esc(d.toUpperCase())}<br><span class="font-normal text-slate-500">${esc(dnm(d))}</span></button>`).join('')}`;
  tiers.forEach(t => {
    h += `<div class="text-left self-center text-xs font-bold">${TIER[t]} ${TS[t]}<span class="block font-normal text-slate-500">${tScore(t)}</span></div>` + doms.map(d => {
      const s = cellStat(d, t);
      return `<button data-d="${esc(d)}" data-t="${t}" onclick="adminCell(this.dataset.d,this.dataset.t)" class="rounded-lg py-3 font-bold cursor-pointer ${tcol(s.n)}">${s.n}`
        + (s.aud ? `<span class="block text-[10px] font-normal text-rose-600 dark:text-rose-400">缺音檔 ${s.aud}</span>` : '') + '</button>';
    }).join('');
  });
  h += `</div></div><p class="text-xs text-slate-400 mb-5">格子＝該難度、該主題的文章篇數。紅＝0、黃＝未達 ${TARGET}、綠＝達標；格內小字：缺音檔的篇數（缺的整篇用機器發音，仍可作答）。點格子看該格的文章；點上方 D1–D7 看該主題全部難度。</p>`;
  h += `<button onclick="go('reports')" class="${btn} ${line} w-full mb-3">⚑ 提報彙整${openRpN() ? `（待處理 ${openRpN()}）` : ''}</button>`;
  return h + `<button onclick="adminNew()" class="${btn} ${pri} w-full">＋ 新增題目</button>`;
}
function adminCellH() {
  const d = A.d, t = A.t, xs = inCell(d, t), nm = domLabel(d) + (t ? ' · ' + TIER[t] : '');
  let h = hdr(esc(nm), 'goAdmin()');
  h += `<button data-d="${esc(d)}" data-t="${t || ''}" onclick="adminNew(this.dataset.d,this.dataset.t)" class="${btn} ${pri} w-full mb-3">＋ 新增 ${esc(nm.replace(' · ', ' '))} 題目</button>`;
  const nmiss = xs.filter(auMissing).length;
  h += `<button id="cm" ${nmiss ? '' : 'disabled'} onclick="copyCellMiss()" class="${btn} ${line} w-full mb-4 disabled:opacity-40 disabled:cursor-not-allowed">複製本格缺的音檔清單（${nmiss}）</button>`;
  if (!xs.length) return h + `<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有文章（0 篇）。<br><span class="text-xs text-slate-400">點上方「＋ 新增」開始建立。</span></div>`;
  return h + `<p class="text-xs text-slate-400 mb-3">清單格式：檔名.mp3 | 念出的全文 | F 或 M，可直接貼給 AI 語音工具。</p>` + xs.map(x => {
    const nh = hItems(x.id).filter(z => z.lv !== 'info').length, sc = x.level && x.level.score;
    const badge = (auMissing(x) ? `<span class="${ROSE_CHIP}">缺音檔</span>` : '') + (nh ? `<span class="${AMB_CHIP}">⚠ ${nh}</span>` : '') + (openRpN(x.id) ? `<span class="${ROSE_CHIP}">⚑ 提報 ${openRpN(x.id)}</span>` : '');
    return `<div class="${card} p-3 mb-3"><p class="font-bold text-sm">${esc(x.id)} <span class="font-normal text-xs text-slate-500">${esc(x.tag)}</span></p>
      <p class="text-xs text-slate-500 mt-1 line-clamp-2">${esc(firstOf(x))}</p>
      <div class="flex flex-wrap gap-1 mt-2">${badge}<span class="${chip}">${TIER[tier(x)]}${sc ? ' · ' + sc : ''}</span><span class="${chip}">${esc(docN(x.doc))}</span></div>
      <button onclick="adminItem(this.dataset.k)" data-k="${esc(x.id)}" class="${btn} ${line} !py-1 text-xs mt-2">看題目與答案</button></div>`;
  }).join('');
}
function adminItemH() {
  const x = byId(A.k);
  if (!x) return hdr('維護', 'goAdmin()') + `<p class="text-sm text-slate-400 text-center py-8">找不到這一篇。</p>`;
  const has = auHas(x), pill = n => { const q = x.questions.find(z => z.n === n); return `<b class="${PA}">(${n}) ${esc(q.answer.t)}</b>`; };
  const qh = q => { const st = R.stat[qk(x, q)], y = qi(x, q), all = [0, ...q.distractors.map((_, i) => i + 1)], ex = (a, k) => (a && a[k]) || 0;
    return `<div class="mb-3"><p class="text-sm"><b>第 ${q.n} 空</b> ${chips(q)}</p><div class="mt-1 space-y-1">${all.map(k => { const o = optOf(y, k), fam = k > 0 && q.kind !== 'insert' && q.distractors[k - 1].fam === 'root';
      return `<div class="text-xs rounded border px-2 py-1 ${o.ok ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50' : 'border-slate-200 dark:border-slate-800'}"><b>${esc(o.t)}</b> <span class="text-slate-500">${esc(o.zh || '')} ${esc(o.pos || '')}</span>${o.ok ? ' <span class="text-emerald-600">✓ 正解</span>' : ` <span class="text-slate-500">[${esc(trn(o.trap))}]</span>`}${o.near ? ' <span class="text-amber-600">near</span>' : ''}${fam ? ' <span class="text-sky-600">root</span>' : ''}${st ? ` <span class="text-slate-400">· 曝光 ${ex(st.shown, k)}／選 ${ex(st.picked, k)}</span>` : ''}<span class="block text-slate-500">${esc(o.why)}</span></div>`; }).join('')}</div></div>`; };
  let h = hdr(esc(x.id), 'backCell()');
  h += `<p class="text-sm font-bold">${esc(x.tag)}</p><div class="mt-2">${metaH(x)}</div>`;
  if (x.level && x.level.why) h += `<p class="text-xs text-slate-500 mb-3">${esc(x.level.why)}</p>`;
  h += passH(x, pill) + x.questions.map(qh).join('') + zhH(x) + vocabH(x);
  h += `<div class="${card} p-3 mt-3"><p class="text-xs font-bold mb-2">🔊 音檔 <span class="${has ? 'text-emerald-600' : 'text-rose-600'}">${has ? '✔ 有' : '✖ 缺'}</span>：<code class="${has ? 'text-emerald-600' : 'text-rose-600'}">audio/p6/${esc(x.id)}.mp3</code>（${x.voice === 'M' ? '男聲' : '女聲'}，一篇一檔，朗讀答案填入的整篇）</p>`
    + (!IDX ? `<p class="text-xs text-rose-500 mb-2">尚未讀到 audio/index.json，所以暫時都當作缺音檔。</p>` : '')
    + `<div class="flex flex-wrap items-center gap-2 mb-2"><span data-aud="${esc(x.id)}">${audBtn(x.id)}</span><button onclick="clipText(this.dataset.t,this)" data-t="${esc(x.id + '.mp3')}" class="${btn} ${line} !py-1 text-xs">複製檔名</button><button onclick="clipText(this.dataset.t,this)" data-t="${esc(sayText(x))}" class="${btn} ${line} !py-1 text-xs">複製朗讀稿</button></div>${rateH(x)}</div>`;
  { const rs = reportsOf(x.id); h += `<div class="mt-5"><div class="flex items-center justify-between mb-2"><p class="text-xs font-bold">提報（${rs.length}）</p>${rpBtn(x.id)}</div>${rs.map(reportCardH).join('')}</div>`; }
  if ((x.issues || []).length) h += `<p class="text-xs text-amber-600 mt-3">備註：${x.issues.map(esc).join('；')}</p>`;
  const hs = hItems(x.id).filter(it => it.lv !== 'info');
  if (hs.length) h += `<div class="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><p class="text-xs font-bold mb-1">此題健檢</p><ul class="text-xs space-y-0.5">${hs.map(it => `<li class="${HL[it.lv][1]}">${HL[it.lv][0]} ${esc(it.msg)}</li>`).join('')}</ul></div>`;
  return h;
}

/* ---- 統計與「寫文本」指令（新增題目頁使用） ---- */
const SCORES = { easy: [500, 550], medium: [600, 650], hard: [700, 750, 800] };
const cefrOf = s => s <= 550 ? 'A2+' : s === 600 ? 'B1' : s === 650 ? 'B1+' : s <= 750 ? 'B2' : 'B2+';
const shr = s => { const m = String(s || '').match(/(\d+)(?:\s*[–-]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : null; };
function statsH() {
  const qs = allQ(), tot = qs.length, P_ = (SPEC && SPEC.points) || {}, cnt = (k, v) => qs.filter(q => q[k] === v).length;
  const pct = n => tot ? (n / tot * 100).toFixed(1) : '0.0';
  const docs = [...new Set(DATA.map(x => x.doc))].filter(Boolean);
  const rows = Object.keys(P_).map(p => { const n = cnt('point', p), r = shr(P_[p].share), low = r && tot && n / tot * 100 < r[0];
    return `<tr class="${low ? 'bg-amber-50 dark:bg-amber-900/20' : ''}"><td class="py-1 pr-2">${esc(P_[p].name || p)} <span class="text-xs text-slate-400">${KD[P_[p].kind] || ''}</span></td><td class="pr-3 text-right">${n}</td><td class="pr-3 text-right">${pct(n)}%</td><td class="text-xs text-slate-500">${esc(P_[p].share || '')}${low ? ' <b class="text-amber-600">偏少</b>' : ''}</td></tr>`; }).join('');
  return `<details class="${card} p-4 mb-4"><summary class="cursor-pointer text-sm font-bold">題庫統計（以「空格」計，共 ${tot} 個空格 / ${DATA.length} 篇）</summary><div class="mt-3">
  <div class="flex flex-wrap gap-1.5 mb-3">${Object.keys(KD).map(k => `<span class="${chip}">${KD[k]} ${cnt('kind', k)}（${pct(cnt('kind', k))}%）</span>`).join('')}</div>
  <div class="overflow-x-auto"><table class="text-sm w-full"><thead><tr class="text-xs text-slate-500 text-left"><th class="font-medium">考點</th><th class="font-medium text-right pr-3">題數</th><th class="font-medium text-right pr-3">占比</th><th class="font-medium">建議占比</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="text-xs text-slate-500 mt-3 mb-1">文章類型</p><div class="flex flex-wrap gap-1.5 mb-2">${docs.map(k => `<span class="${chip}">${esc(docN(k))} ${DATA.filter(x => x.doc === k).length}</span>`).join('') || '<span class="text-xs text-slate-400">—</span>'}</div>
  <p class="text-xs text-slate-500 mb-1">線索範圍（scope）</p><div class="flex flex-wrap gap-1.5">${Object.keys(SCN).map(k => `<span class="${chip}">${SCN[k]} ${cnt('scope', k)}（${pct(cnt('scope', k))}%）</span>`).join('')}</div></div></details>`;
}
const uniq = f => [...new Set(DATA.flatMap(f))].filter(Boolean);
function promptInfo() {
  const sp = SPEC || {}, d = A.nd, t = A.nt, n = A.n, sc = (sp.domains && sp.domains[d] && sp.domains[d].scenes) || [], Tt = (sp.tiers && sp.tiers[t]) || {};
  const mx = DATA.filter(x => x.domain === d && tier(x) === t).reduce((a, x) => Math.max(a, +String(x.id).split('-')[1] || 0), 0);
  const ids = Array.from({ length: n }, (_, i) => `${d}-${String(mx + 1 + i).padStart(3, '0')}-${TS[t]}`);
  const sel = Object.keys(A.pts).filter(k => A.pts[k]), qs = allQ(), cnt = p => qs.filter(q => q.point === p).length, P_ = sp.points || {};
  const ptLine = sel.length ? `只出下列考點（每篇仍須符合組成規則）：${sel.map(p => pName(p) + '(' + p + ')').join('、')}`
    : `不限；各考點現有「空格」題數與建議占比：${Object.keys(P_).map(p => `${pName(p)}(${p}) 現有 ${cnt(p)}、建議 ${P_[p].share}`).join('；')}；請優先補數量最少者`;
  const rules = sp.rules ? (Array.isArray(sp.rules) ? sp.rules : Object.values(sp.rules)) : [];
  const vocab = uniq(x => (x.vocab || []).map(v => v.word)), tags = uniq(x => [x.tag]);
  const heads = DATA.map(x => `${x.id}：${subjOf(x)}／${firstOf(x)}`);
  const spec = JSON.stringify(Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'domains')));
  const text = `請為多益 Part 6 段落填空寫 ${n} 篇（每篇一篇文章、4 個空格；非插入題 1 正解＋7 干擾項，插入題 1 正解句＋3 干擾句），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part6.json。

- 主題：${d.toUpperCase()} ${dnm(d)}（scene 須屬於：${sc.join('、') || '—'}）；可選填 biz。
- 文章類型：${A.gdoc}（${docN(A.gdoc)}；doc 欄位照填）。
- 難度：${TIER[t]}（id 尾碼 ${TS[t]}）｜level.score 只能填：${SCORES[t].map(s => `${s}（cefr ${cefrOf(s)}）`).join('、')}｜${Tt.guide || ''}
- 考點：${ptLine}。
- id 依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）；voice 填 F 或 M。
- 每篇剛好 4 空格 [[1]]–[[4]]、剛好 1 題 insert；其餘規則見下方 rules。
- clue.steps 依四步驟各寫一句：掃描選項判斷題型 → 分析空格前後線索 → 刪去法 → 代入驗證（插入題改為：判斷為插入題留到最後 → 找前後連結線索 → 逐句排除 → 代入檢查連貫）。
${rules.map(r => '- ' + r).join('\n')}
- 已用過的 vocab（不得重複）：${vocab.join('、') || '（無）'}
- 已用過的 tag（不得重複）：${tags.join('、') || '（無）'}
- 已有的標頭主旨或標題與首句（不要雷同）：${heads.join('；') || '（無）'}
- 輸出方式：建立檔案 p6_${ids[0]}_x${n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。

【規格：part6.json 的 _spec 精簡版】
${spec}

寫完請自我檢查：逐篇逐空格把每個干擾項代回整篇，確認只有 1 個選項成立；確認 [[1]]–[[4]] 依序各 1 次；確認至少 2 題 scope 為 near 或 far；確認 clue.text 是原文片段；確認數字與日期一致。有任何不確定寫進 issues。`;
  return { text, ids };
}
const copyOut = i => clipText(A.out[i] || '', document.getElementById('cp' + i));
function adminNewH() {
  const doms = DOMS(), tiers = Object.keys(TIER), d = A.nd, t = A.nt, docs = Object.keys((SPEC && SPEC.docs) || {}), P_ = (SPEC && SPEC.points) || {};
  const on = c => `${btn} !py-1.5 ${c ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`;
  let h = hdr('新增題目', 'goAdmin()') + statsH();
  h += `<h2 class="font-bold mb-2">1. 選主題</h2><div class="flex flex-wrap gap-2 mb-5">${doms.map(k => `<button data-v="${esc(k)}" onclick="adminPick('nd',this.dataset.v)" class="${on(d === k)}">${esc(domLabel(k))}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">2. 選難度</h2><div class="flex flex-wrap gap-2 mb-1">${tiers.map(k => `<button data-v="${k}" onclick="adminPick('nt',this.dataset.v)" class="${on(t === k)}">${TIER[k]} ${TS[k]} <span class="text-xs opacity-70">${tScore(k)}${d ? ` · ${DATA.filter(x => x.domain === d && tier(x) === k).length} 篇` : ''}</span></button>`).join('')}</div>`;
  h += `<p class="text-xs text-slate-400 mb-5">分數是 AI 寫文本時 level.score 可以填的範圍。</p>`;
  h += `<h2 class="font-bold mb-2">3. 選文章類型</h2><div class="flex flex-wrap gap-2 mb-5">${docs.map(k => `<button data-v="${esc(k)}" onclick="adminPick('gdoc',this.dataset.v)" class="${on(A.gdoc === k)}">${esc(docN(k))}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">4. 篇數</h2><div class="flex flex-wrap gap-2 mb-5">${[1, 2, 3, 5].map(k => `<button onclick="adminPick('n',${k})" class="${on(A.n === k)}">${k}</button>`).join('')}</div>`;
  h += `<h2 class="font-bold mb-2">5. 本批必含的考點 <span class="text-xs font-normal text-slate-400">（可不選，由 AI 補數量最少者）</span></h2><div class="flex flex-wrap gap-2 mb-5">${Object.keys(P_).map(p => `<button data-v="${esc(p)}" onclick="togglePt(this.dataset.v)" class="${btn} !py-1 !px-2.5 text-xs ${A.pts[p] ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${esc(P_[p].name || p)}</button>`).join('')}</div>`;
  if (!d || !t) return h + `<p class="text-xs text-slate-400">選好主題與難度後，會出現給 AI 的「寫文本」指令。</p>`;
  const n = DATA.filter(x => x.domain === d && tier(x) === t).length, info = promptInfo();
  A.out = [info.text];
  h += `<p class="text-sm mb-4">${esc(domLabel(d))} · ${TIER[t]}（${tScore(t)}）目前 <b>${n}</b> 篇${n < TARGET ? `，未達目標 ${TARGET} 篇` : '，已達標'}。新題 id 預計：<b>${esc(info.ids.join('、'))}</b></p>`;
  h += `<div class="${card} p-4 mb-3"><div class="flex items-center justify-between gap-2 mb-1"><p class="font-bold text-sm">1. 給 AI 的「寫文本」指令</p><button id="cp0" onclick="copyOut(0)" class="${btn} ${line} !py-1 text-xs shrink-0">複製</button></div>
    <p class="text-xs text-slate-500 mb-2">貼給 AI 即可（約 ${info.text.length.toLocaleString()} 字，已內含精簡規格與已用過的 tag／vocab／首句，不必附 part6.json）。AI 會直接給你一個 p6_${esc(info.ids[0])}_x${A.n}.json 檔案；若無法建檔，它會貼出 json 區塊，再自行存成該檔名。寫不出該難度時它會回傳 skip（不要合併）。</p>
    <pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(info.text)}</pre></div>`;
  h += `<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">2. 存檔與合併</p><p class="text-xs text-slate-500">把 AI 給你的 p6_ 開頭的 .json 下載後（檔名不用改），放到 json_merge.py 同一個資料夾，雙擊執行並勾選合併。合併後重新整理本頁，篇數就會更新。音檔請放進 audio/p6/（{id}.mp3，一篇一檔，朗讀答案填入的整篇），再執行 audio_scan.py；沒有音檔時網頁會用機器發音。</p></div>`;
  return h;
}

/* ===================== 畫面切換 ===================== */
function render() {
  document.documentElement.classList.toggle('dark', !!S.dark);
  const v = V.view, testing = !!(V.t && !V.t.res);
  let body;
  if (v === 'run') body = testing ? testRunH() : V.run && V.run.r ? runH() : homeH();
  else if (v === 'result') body = (V.t && V.t.res) || (V.run && V.run.hist) ? resultH() : homeH();
  else body = v === 'practice' ? practiceH() : v === 'test' ? testH() : v === 'book' ? bookH() : v === 'reports' ? reportsH()
    : v === 'admin' ? adminH() : v === 'adminCell' ? adminCellH() : v === 'adminItem' ? adminItemH() : v === 'adminNew' ? adminNewH() : homeH();
  main.innerHTML = body + rpModalH();
  if (v === 'run' && testing) { if (!T.id) startClock(); } else clrT();
  paintAudio();
  if (V.rp && V.rp.focus) { V.rp.focus = false; const t = document.getElementById('rpn'); if (t) t.focus(); }
}

/* ---------- 啟動：讀取 part6.json；雙擊開啟（file://）或讀不到時，可在首頁手動選取 ---------- */
function backAdmin() { if (window._ah) location.href = 'index.html#mt'; else goHome(); } // 從首頁「維護總覽」進來的，返回就回總覽
function loadText(t) {
  try {
    const j = JSON.parse(t); SPEC = (j && j._spec) || null;
    RAW = Array.isArray(j) ? j : (j && j.items) || [];
    DATA = RAW.filter(x => x && x.id && ['head', 'body', 'zh', 'questions'].every(k => Array.isArray(x[k])) && x.questions.length === 4);
    LERR = DATA.length ? '' : 'empty'; HEALTH = auditAll(RAW);
  } catch (e) { LERR = 'bad'; LMSG = e.message; }
  render();
  if (location.hash === '#admin' && !window._ah) { window._ah = 1; goAdmin(); } // 從首頁「維護總覽」直接進入維護頁
}
function pickJson(input) { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => loadText(r.result); r.readAsText(f, 'utf-8'); input.value = ''; }
(async () => {
  await auInit();
  try { const res = await fetch('part6.json', { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status); loadText(await res.text()); }
  catch (e) { LERR = location.protocol === 'file:' ? 'file' : 'fetch'; render(); }
})();
