/* quizart.js — TOEIC Daily Coach「🧪 綜合測驗」的第二部分：📖 文章測驗（目前只有 A 文章克漏字）
   載入順序：…→ quiz.js → quizart.js → tsl.js → daily.js（一定要在 quiz.js 之後；函式都是執行時才用到）
   借用 quiz.js 的：QZ／QZ_PREF／QZ_PASS／qzHead／qzTabs／qzRecs／qzSaveR／qzRecMap／qzRecord／qzBucketOf／qzDistract／qzWhyWord／
                    qzExtras／qzArr／qzKey／qzRx／qzH／qzShuf／qzCap／qzStopAudio／qzTts／qzShowInfo
   借用 daily.js／notes.js 的：DATA／idOf／esc／card／btn／main／render／dnPri／dnLine／dnChip／dnToast／vplay；speak.js 的 splitSent（沒有就整段不切）

   A 文章克漏字
     畫面：整篇文章顯示（超過約 170 字依段落／句子分頁），隨機挖空；下方是球標池（答案＋約 50% 干擾字）。
           點空格（選取）→ 點球標（填入空格，空格顯示該字）；點已填的空格 → 球標回到池裡。交卷後逐空顯示對錯＋詳解。
     挖什麼：單字、片語、詞形（例：文中是 confirmed，答案就是 confirmed，干擾字有 confirm／confirms／confirmation）。
             來源＝這一篇的 vocab＋extra_vocab；再補「別篇詳解裡的字剛好出現在這篇」（這篇自己的字優先）。To:／Subject: 等信件標頭不挖。
     干擾字：本字的易混淆（單字／片語分開）→ 詞形（文中是變化形時）→ 同詞性 → 別篇的字；近義字不當干擾（放進去也通順，會有兩個答案）。
     選空格：每個空格依「沒考過 70%／答錯過 25%／答對過 5%」抽；空格不重疊、彼此至少隔 2 個字、同一個答案或同一個字的變化形不重複挖。
     紀錄：沿用 quiz.js 的 localStorage 鍵 toeicQuizV1（雲端同步）
       空格：{ id:'w1d1|confirm|az|<文中位置前 30 字＋答案的雜湊>', n, ok, last, t }（與單字測驗同一種結構）
       一回：{ id:'A|w1d1|<ts>', a:'w1d1', n, ok, t, mode:'az' }（只算文章測驗；不影響文章頁的「✓ 已通過」，那個只看單字測驗的 S| 紀錄）
     偏好：空格密度存在 qzPrefV1 的 den（0 少／1 標準／2 多）。 */

const QA = { st: 'setup', x: null, a: null, den: 1, pages: [], pi: 0, res: [], t0: 0 };
const QA_DEN = [['少', 20], ['標準', 12], ['多', 8]]; // 平均每幾個字挖一格
const QA_MAXW = 170, QA_MAXB = 10, QA_OK = /^[A-Za-z][A-Za-z' -]{2,}$/;
try { const p = JSON.parse(localStorage.getItem(QZ_PREF) || '{}'); if ([0, 1, 2].includes(p.den)) QA.den = p.den; } catch (e) {}
const qaReset = () => { QA.st = 'setup'; QA.pages = []; QA.pi = 0; QA.res = []; };

/* ---------- 字庫：文章裡哪些字可以挖 ---------- */
let QA_G = null;
function qaLex(x) { // Map：小寫字形 → { e: 詳解（或核心單字做的簡易詳解）, own: 是不是這一篇自己的字 }
  const n = DATA.length;
  if (!QA_G || QA_G.n !== n) {
    const m = new Map();
    DATA.forEach(a => qzExtras(a).forEach(e => {
      if (!e || !e.text || e.type === 'sentence') return;
      [e.text].concat(qzArr(e.forms).map(f => f && f.w)).forEach(s => { s = String(s || '').trim(); const k = s.toLowerCase(); if (QA_OK.test(s) && !m.has(k)) m.set(k, { e, own: false }); });
    }));
    QA_G = { n, m };
  }
  const out = new Map(QA_G.m);
  qzExtras(x).forEach(e => {
    if (!e || !e.text || e.type === 'sentence') return;
    [e.text].concat(qzArr(e.forms).map(f => f && f.w)).forEach(s => { s = String(s || '').trim(); if (QA_OK.test(s)) out.set(s.toLowerCase(), { e, own: true }); });
  });
  (x.vocab || []).forEach(v => { const s = String(v && v.word || '').trim(), k = s.toLowerCase(); if (QA_OK.test(s) && !(out.get(k) && out.get(k).own)) out.set(k, { e: { text: s, ipa: v.ipa, pos: v.pos, zh: v.zh, type: 'word' }, own: true }); });
  return out;
}
function qaCands(text, lex) { // 這段文字裡所有可以挖的位置
  const low = text.toLowerCase(), hd = [], out = [];
  text.replace(/^(?:To|From|Subject|Date|Cc|Re)\s*:.*$/gim, (m, i) => { hd.push([i, i + m.length]); return m; });
  lex.forEach((v, k) => {
    if (!low.includes(k)) return;
    const re = new RegExp('(^|[^A-Za-z0-9])(' + qzRx(k) + ')(?![A-Za-z0-9])', 'gi'); let m;
    while ((m = re.exec(text))) {
      const s = m.index + m[1].length, e = s + m[2].length;
      if (hd.some(h => s < h[1] && e > h[0])) continue;
      out.push({ s, e, surf: m[2], lex: v });
    }
  });
  return out;
}
const qaKeyOf = (aid, text, o) => `${aid}|${qzKey(o.lex.e.lemma || o.lex.e.text)}|az|${qzH((text.slice(Math.max(0, o.s - 30), o.s) + '|' + o.surf).toLowerCase())}`;

/* ---------- 分頁 ---------- */
function qaRanges(p) { // → [[from, to], …]
  const wc = (a, b) => (p.slice(a, b).match(/[A-Za-z0-9']+/g) || []).length, paras = [], sep = /\n[ \t]*\n+/g;
  let st = 0, m; while ((m = sep.exec(p))) { if (m.index > st) paras.push([st, m.index]); st = m.index + m[0].length; }
  if (st < p.length) paras.push([st, p.length]);
  const units = [];
  paras.forEach(([a, b]) => {
    if (wc(a, b) <= QA_MAXW) { units.push([a, b]); return; }
    const ss = typeof splitSent === 'function' ? splitSent(p, a, b).map(o => [o.from, o.to]) : [[a, b]];
    let ca = null, cb = null;
    ss.forEach(([s, e]) => { if (ca != null && wc(ca, e) > QA_MAXW * 0.8) { units.push([ca, cb]); ca = null; } if (ca == null) ca = s; cb = e; });
    if (ca != null) units.push([ca, cb]);
  });
  const out = [];
  units.forEach(([a, b]) => { const l = out[out.length - 1]; if (l && wc(l[0], b) <= QA_MAXW) l[1] = b; else out.push([a, b]); });
  return out;
}

/* ---------- 選空格 ---------- */
function qaPick(c, want, rm, text) {
  const bk = { never: [], wrong: [], right: [] }, tm = o => (rm.get(o.key) || {}).t || 0;
  c.forEach(o => { o.bucket = qzBucketOf(rm, o); bk[o.bucket].push(o); });
  bk.never = qzShuf(bk.never).sort((a, b) => (b.lex.own ? 1 : 0) - (a.lex.own ? 1 : 0)); // 這篇自己的字優先
  bk.wrong.sort((a, b) => tm(a) - tm(b)); bk.right.sort((a, b) => tm(a) - tm(b)); // 最久沒考的先
  const W = [['never', 0.70], ['wrong', 0.25], ['right', 0.05]], picks = [], used = new Set(), lems = new Set();
  const lem = o => qzKey(o.lex.e.lemma || o.lex.e.text), gap = (a, b) => (text.slice(a, b).match(/[A-Za-z0-9]+/g) || []).length >= 2;
  const fit = o => !used.has(o.surf.toLowerCase()) && !lems.has(lem(o)) && picks.every(p => o.e <= p.s ? gap(o.e, p.s) : o.s >= p.e ? gap(p.e, o.s) : false);
  while (picks.length < want) {
    const live = W.filter(([k]) => bk[k].length); if (!live.length) break;
    let r = Math.random() * live.reduce((a, [, w]) => a + w, 0), name = live[0][0];
    for (const [k, w] of live) { if ((r -= w) < 0) { name = k; break; } }
    const o = bk[name].shift();
    if (fit(o)) { picks.push(o); used.add(o.surf.toLowerCase()); lems.add(lem(o)); }
  }
  return picks.sort((a, b) => a.s - b.s);
}
const qaLow = s => /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s; // 句首大寫的字，球標上一律小寫（避免用大小寫猜答案）
function qaDs(x, o) { // 干擾字
  const e = o.lex.e, surf = o.surf, ph = /\s/.test(surf), low = surf.toLowerCase(), T = e.text, sw = a => qzArr(a).map(v => v && (v.word || v.phrase || v.w)).filter(Boolean);
  const isForm = !ph && low !== T.toLowerCase();
  const pref = (isForm ? [T].concat(sw(e.forms), sw(e.derived)) : sw(e.confusable)).filter(s => s.toLowerCase() !== low && /\s/.test(s) === ph);
  return qzDistract(x, surf, e.pos || '', ph ? 'phrase' : 'word', 6, pref, isForm ? [] : sw(e.similar)).filter(s => QA_OK.test(s)).slice(0, 3); // 全題庫的字池裡有「annual / annually」這種寫法，不能當球標
}

/* ---------- 做出每一頁 ---------- */
function qaBuild(x) {
  const lex = qaLex(x), rm = qzRecMap(), aid = idOf(x), den = QA_DEN[QA.den][1], pages = [];
  qaRanges(x.passage).forEach(([a, b]) => {
    const text = x.passage.slice(a, b), words = (text.match(/[A-Za-z0-9']+/g) || []).length;
    const c = qaCands(text, lex); c.forEach(o => { o.key = qaKeyOf(aid, text, o); });
    const picks = qaPick(c, Math.max(2, Math.min(QA_MAXB, Math.round(words / den))), rm, text);
    if (picks.length < 2) return; // 這段能挖的字太少：不出題
    const blanks = picks.map(o => { const up = /^[A-Z][a-z]/.test(o.surf); return { s: o.s, e: o.e, surf: o.surf, label: up ? qaLow(o.surf) : o.surf, up, key: o.key, lex: o.lex, ds: qaDs(x, o) }; });
    const nb = blanks.length, total = Math.max(nb + 1, Math.ceil(nb * 1.5)), balls = blanks.map((b, i) => ({ t: b.label, b: i })), seen = new Set(balls.map(o => o.t.toLowerCase())), lists = blanks.map(b => b.ds.slice());
    for (let g = 0; balls.length < total && lists.some(l => l.length) && g < 200; g++) {
      lists.forEach(l => { if (balls.length >= total) return; while (l.length) { const d = qaLow(l.shift()), k = d.toLowerCase(); if (!seen.has(k)) { seen.add(k); balls.push({ t: d, b: -1 }); break; } } });
    }
    pages.push({ text, blanks, balls: qzShuf(balls).map((o, i) => ({ t: o.t, b: o.b, id: i })), fill: blanks.map(() => null), sel: 0, done: false });
  });
  return pages;
}

/* ---------- 畫面 ---------- */
const qaShow = (b, ball) => b.up ? qzCap(ball.t) : ball.t;
const qaSent = (t, b) => { let s = b.s, e = b.e; while (s > 0 && !/[.!?\n]/.test(t[s - 1])) s--; while (e < t.length && !/[.!?\n]/.test(t[e])) e++; if (e < t.length && t[e] !== '\n') e++; return { pre: t.slice(s, b.s).replace(/^\s+/, ''), post: t.slice(b.e, e) }; };
const qaIsOk = (P, i) => { const f = P.fill[i]; return f != null && P.balls[f].b === i; };
function qaBlank(P, i) {
  const b = P.blanks[i], f = P.fill[i], ball = f == null ? null : P.balls[f];
  const base = 'inline-flex items-baseline gap-1 rounded-md border-b-2 px-1.5 mx-0.5 min-w-[4.5rem] justify-center leading-7 ', no = `<sup class="text-[0.625rem] opacity-60">${i + 1}</sup>`;
  if (P.done) {
    const ok = qaIsOk(P, i);
    return `<span class="${base}${ok ? 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200' : 'border-rose-500 bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200'}">${no}${ok ? esc(qaShow(b, ball)) : `${ball ? `<s class="opacity-60">${esc(qaShow(b, ball))}</s> ` : ''}<b>${esc(qaShow(b, { t: b.label }))}</b>`}</span>`;
  }
  const cls = P.sel === i ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300 dark:bg-indigo-950/40' : ball ? 'border-indigo-400 text-indigo-700 dark:text-indigo-300' : 'border-slate-400 border-dashed text-slate-400';
  return `<button type="button" onclick="qaSel(${i})" class="${base}${cls}">${no}${ball ? esc(qaShow(b, ball)) : '＿＿'}</button>`;
}
function qaTabsHead(t, back) { return qzHead(t, back) + qzTabs(); }
function qaSetup() {
  const x = QZ.x; qzReload(); QA.x = x; QA.a = idOf(x);
  const lex = qaLex(x), rm = qzRecMap(), aid = idOf(x), st = { never: 0, wrong: 0, right: 0 }, seen = new Set();
  const pgs = qaRanges(x.passage).filter(([a, b]) => { const text = x.passage.slice(a, b), c = qaCands(text, lex); let k = 0; c.forEach(o => { o.key = qaKeyOf(aid, text, o); if (!seen.has(o.key)) { seen.add(o.key); st[qzBucketOf(rm, o)]++; } k++; }); return k >= 2; });
  const nc = st.never + st.wrong + st.right, l = qaLast(aid);
  main.innerHTML = qaTabsHead(`W${x.week}·D${x.day} ${x.tag || ''}`)
    + `<div class="${card} p-4 mb-4"><p class="text-sm font-bold mb-1">📖 A 文章克漏字</p>
    <p class="text-xs text-slate-500 leading-relaxed">整篇文章隨機挖空（單字、片語、詞形），下方是球標。<b>點空格 → 點球標</b>填入；點已填的空格，球標就回到下方。文章太長會分頁。</p>
    <p class="text-xs text-slate-500 mt-2">${nc ? `這篇約 ${pgs.length} 頁，可挖空 ${nc} 處：沒考過 ${st.never}・答錯過 ${st.wrong}・答對過 ${st.right}` : '這篇沒有可挖空的字'}</p>
    <div class="flex flex-wrap items-center gap-2 mt-3 text-sm"><span>空格數</span>${QA_DEN.map(([n], i) => `<button onclick="qaSetDen(${i})" class="${dnSm} ${QA.den === i ? '!bg-indigo-600 !text-white !border-indigo-600' : ''}">${n}</button>`).join('')}<button onclick="qzShowInfo()" class="${dnSm} ml-auto">📋 資料（給 AI）</button></div>
    <p class="text-xs text-slate-500 mt-3 leading-relaxed">空格的挑選：約 70% 沒考過的、25% 答錯過的、5% 答對過的；每次都重新隨機。${l ? `<br>最近一次：${Math.round(l.ok / l.n * 100)}%（${l.ok}/${l.n}），${new Date(l.t).toLocaleString('zh-TW', { hour12: false })}` : ''}</p>
    <button onclick="qaStart()" ${nc >= 2 ? '' : 'disabled'} class="${btn} ${dnPri} w-full mt-4 disabled:opacity-40">開始</button></div>`;
}
function qaRun() {
  const x = QZ.x, P = QA.pages[QA.pi], n = P.blanks.length, filled = P.fill.filter(f => f != null).length, np = QA.pages.length;
  let h = '', pos = 0; P.blanks.forEach((b, i) => { h += esc(P.text.slice(pos, b.s)) + qaBlank(P, i); pos = b.e; }); h += esc(P.text.slice(pos));
  const okN = P.blanks.filter((_, i) => qaIsOk(P, i)).length;
  let bottom = '';
  if (!P.done) {
    const pool = P.balls.map(o => P.fill.includes(o.id)
      ? `<span class="rounded-full border border-dashed border-slate-300 dark:border-slate-700 px-3 py-1.5 text-sm text-slate-300 dark:text-slate-600 select-none">${esc(o.t)}</span>`
      : `<button type="button" onclick="qaBall(${o.id})" class="rounded-full border border-indigo-300 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 px-3 py-1.5 text-sm shadow-sm">${esc(o.t)}</button>`).join('');
    bottom = `<div class="sticky bottom-0 md:bottom-3 z-20 -mx-3 md:mx-0 mt-3 p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t md:border md:rounded-xl border-slate-200 dark:border-slate-800"><div class="flex flex-wrap gap-2 max-h-40 overflow-y-auto">${pool}</div><button onclick="qaSubmit()" class="${btn} ${dnPri} w-full mt-3">交卷（${filled}/${n}）</button></div>`;
  } else {
    const li = P.blanks.map((b, i) => {
      const ok = qaIsOk(P, i), ball = P.fill[i] == null ? null : P.balls[P.fill[i]], e = b.lex.e, s = qaSent(P.text, b);
      return `<li class="rounded-lg border p-3 ${ok ? 'border-emerald-300 dark:border-emerald-800' : 'border-rose-300 dark:border-rose-800'}"><div class="flex items-center gap-2 mb-1"><span class="${dnChip}">${i + 1}</span><span class="font-bold ${ok ? 'text-emerald-600' : 'text-rose-600'}">${ok ? '✓' : '✗'}</span>${ok ? '' : `<span class="text-xs text-slate-500">你選：${ball ? esc(qaShow(b, ball)) : '（沒填）'}</span>`}<span class="ml-auto flex gap-2"><button type="button" onclick="qaSay(${i})" class="text-slate-400 hover:text-indigo-600 text-lg" aria-label="播放單字">🔊</button><button type="button" onclick="qaSay(${i},1)" class="text-slate-400 hover:text-indigo-600 text-lg" aria-label="朗讀這一句">🗣</button></span></div>
        <p class="text-sm text-slate-600 dark:text-slate-300 mb-1">${esc(s.pre)}<b class="text-indigo-600 dark:text-indigo-400">${esc(b.surf)}</b>${esc(s.post)}</p>
        ${b.surf.toLowerCase() !== e.text.toLowerCase() ? `<p class="text-xs text-slate-500">文中用的是 <b>${esc(b.surf)}</b>（${esc(e.text)} 的變化形）</p>` : ''}<div class="text-sm space-y-0.5">${qzWhyWord(e)}</div></li>`;
    }).join('');
    bottom = `<div class="${card} p-4 mt-4"><p class="font-bold mb-2">本頁 ${okN}/${n}</p><ul class="space-y-2">${li}</ul><button onclick="qaNext()" class="${btn} ${dnPri} w-full mt-4">${QA.pi < np - 1 ? '下一頁' : '看成績'}</button></div>`;
  }
  main.innerHTML = qzHead(`W${x.week}·D${x.day} ${x.tag || ''} · 文章克漏字`, `<button onclick="qaExit()" class="${btn} ${dnLine} !py-1.5 text-xs">離開</button>`)
    + `<div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3"><div class="h-full bg-indigo-500" style="width:${Math.round((QA.pi + (P.done ? 1 : 0)) / np * 100)}%"></div></div>
    <div class="${card} p-4 md:p-5"><div class="flex flex-wrap items-center gap-1.5 mb-3"><span class="${dnChip}">第 ${QA.pi + 1} / ${np} 頁</span><span class="${dnChip}">${n} 個空格</span>${P.done ? '' : '<span class="text-xs text-slate-500">點空格 → 點下方球標</span>'}</div><div class="whitespace-pre-wrap leading-8 text-base">${h}</div></div>` + bottom;
}
function qaResult() {
  const x = QZ.x, n = QA.res.length, ok = QA.res.filter(r => r.ok).length, pc = n ? Math.round(ok / n * 100) : 0, pass = n && ok / n >= QZ_PASS, bad = QA.res.filter(r => !r.ok);
  const li = bad.map(r => { const P = QA.pages[r.p], b = r.b, s = qaSent(P.text, b); return `<li class="rounded-lg border border-rose-300 dark:border-rose-800 p-3 text-sm"><p class="text-slate-600 dark:text-slate-300">${esc(s.pre)}<b class="text-indigo-600 dark:text-indigo-400">${esc(b.surf)}</b>${esc(s.post)}</p><p class="text-xs text-slate-500 mt-1">${r.ball ? `你選：${esc(qaShow(b, r.ball))}　` : '沒填　'}<b>${esc(b.lex.e.text)}</b>${b.lex.e.zh ? ' — ' + esc(b.lex.e.zh) : ''}</p></li>`; }).join('');
  main.innerHTML = qzHead(`W${x.week}·D${x.day} ${x.tag || ''} · 文章克漏字`, `<button onclick="qaExit()" class="${btn} ${dnLine} !py-1.5 text-xs">回設定</button>`)
    + `<div class="${card} p-5 text-center mb-4"><p class="text-4xl font-bold ${pass ? 'text-emerald-600' : 'text-amber-600'}">${pc}%</p><p class="text-sm text-slate-500 mt-1">${ok} / ${n} 空格答對${pass ? '　✓ 通過' : `　（${Math.round(QZ_PASS * 100)}% 通過）`}</p></div>`
    + (bad.length ? `<div class="${card} p-4 mb-4"><p class="text-sm font-bold mb-2">答錯的空格</p><ul class="space-y-2">${li}</ul></div>` : '')
    + `<div class="flex gap-2"><button onclick="qaAgain()" class="${btn} ${dnPri} flex-1">再測一次</button><button onclick="qaExit()" class="${btn} ${dnLine} flex-1">回設定</button></div>`;
}
function qaRender() { if (!QZ.x) return; if (QA.st === 'run' && QA.pages[QA.pi]) return qaRun(); if (QA.st === 'result') return qaResult(); QA.st = 'setup'; qaSetup(); }

/* ---------- 動作 ---------- */
function qaLast(aid) { let b = null; qzRecs().forEach(r => { if (r && String(r.id).startsWith('A|' + aid + '|') && (!b || r.t > b.t)) b = r; }); return b; }
function qaSetDen(i) { QA.den = i; qzPrefSave(); qaSetup(); }
function qaStart() {
  qzReload(); QA.pages = qaBuild(QZ.x); if (!QA.pages.length) { dnToast('這篇沒有可挖空的字'); return; }
  QA.st = 'run'; QA.pi = 0; QA.res = []; QA.t0 = Date.now(); qzStopAudio(); qaRender(); window.scrollTo({ top: 0 });
}
function qaAgain() { qaReset(); qaStart(); }
function qaExit() {
  if (QA.st === 'run' && QA.res.length && !confirm('離開測驗？已交卷的空格會保留紀錄，但這一回不會計入成績。')) return;
  qzStopAudio(); qaReset(); qaRender();
}
const qaNextEmpty = (P, from) => { const n = P.fill.length; for (let k = 1; k <= n; k++) { const j = (from + k) % n; if (P.fill[j] == null) return j; } return -1; };
function qaSel(i) { // 點空格：空的 → 選取；已填的 → 球標回到池裡，並選取這格
  const P = QA.pages[QA.pi]; if (!P || P.done) return;
  P.fill[i] = null; P.sel = i; qaRender();
}
function qaBall(id) { // 點池裡的球標：填進目前選取的空格（沒選或那格已填 → 第一個空格）
  const P = QA.pages[QA.pi]; if (!P || P.done || P.fill.includes(id)) return;
  let t = P.sel; if (t < 0 || P.fill[t] != null) t = P.fill.findIndex(f => f == null); if (t < 0) return;
  P.fill[t] = id; P.sel = qaNextEmpty(P, t); qaRender();
}
function qaSubmit() {
  const P = QA.pages[QA.pi]; if (!P || P.done) return;
  const empty = P.fill.filter(f => f == null).length;
  if (empty && !confirm(`還有 ${empty} 個空格沒填，沒填的算答錯，確定交卷？`)) return;
  P.blanks.forEach((b, i) => { const ok = qaIsOk(P, i); qzRecord({ key: b.key }, ok); QA.res.push({ p: QA.pi, i, ok, b, ball: P.fill[i] == null ? null : P.balls[P.fill[i]] }); });
  P.done = true; P.sel = -1; qaRender(); window.scrollTo({ top: 0 });
}
function qaNext() {
  if (QA.pi < QA.pages.length - 1) { QA.pi++; qzStopAudio(); qaRender(); window.scrollTo({ top: 0 }); return; }
  const aid = QA.a, t = Date.now(), n = QA.res.length, ok = QA.res.filter(r => r.ok).length, L = qzRecs();
  L.push({ id: 'A|' + aid + '|' + t, a: aid, n, ok, t, mode: 'az' });
  const drop = new Set(L.filter(r => r && String(r.id).startsWith('A|' + aid + '|')).sort((p, q) => q.t - p.t).slice(30).map(r => r.id)); // 每篇只留最近 30 回
  if (drop.size) { const keep = L.filter(r => !drop.has(r && r.id)); L.length = 0; keep.forEach(r => L.push(r)); }
  qzSaveR(); QA.st = 'result'; qzStopAudio(); qaRender(); window.scrollTo({ top: 0 });
}
function qaSay(i, sent) { // 🔊 單字（詳解的 mp3，沒有就機器發音）／🗣 這一句（機器發音）
  const P = QA.pages[QA.pi], b = P && P.blanks[i]; if (!b) return; qzStopAudio();
  if (sent) { const s = qaSent(P.text, b); qzTts(s.pre + b.surf + s.post); return; }
  if (typeof vplay === 'function') vplay(QA.a, b.lex.e.text, '', b.lex.e.text); else qzTts(b.surf);
}
