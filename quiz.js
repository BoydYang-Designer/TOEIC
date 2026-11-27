/* quiz.js — TOEIC Daily Coach 的「🧪 綜合測驗」（每一篇一個）：🔤 單字測驗（單字＋聽力，本檔）＋ 📖 文章測驗（quizart.js，需在本檔之後載入）
   載入順序：…→ newwords.js → quiz.js → tsl.js → daily.js（函式都是執行時才用到，放前放後都可以）
   依賴（執行時才用到）：daily.js／notes.js 的全域 S／cur／DATA／main／find／idOf／esc／card／btn／render／up／isLib／setVoice／spStop／skStopAll／
   dnNav／dnToast／dnKey／dnExtraOf／dnLine／dnPri／dnSm／dnChip／dnBackBtn／vplay（單字、英文解釋、例句的 mp3 走詳解頁同一套，沒有檔案就機器發音）

   題庫：不寫死，每次打開設定頁時，從「這一篇現在」的詳解資料（核心單字 vocab＋extra_vocab）即時組出來。
     🔤 單字：英文解釋選單字／中文選英文／例句克漏字／詞形／搭配／多義／易混淆／近義／衍生字／相關字／（句子）同義改寫；答完可播整句 mp3
     🎧 聽力（題幹只能聽，答完才顯示文字）：聽例句選中文／聽詞形（-s、-ed、-ing…）／聽音辨字（易混淆裡標 sound／spell 的字）／聽英文解釋選字／聽搭配
   「題目面向」＝最小單位，每個面向各自記錄（鍵 = 文章 id | 字 | 面向 | 內容雜湊，與題目順序無關）。

   選題：每個段落各自套用 沒考過 70%／答錯過 25%／答對過 5%；某一類不夠就依 沒考過 → 答錯過 → 答對過（最久沒考的先）補；
         每個字這一回隨機問 1–3 題（單字、聽力各自算），排序時相鄰兩題盡量不同字、不同題型。
   紀錄：localStorage 鍵 toeicQuizV1（以 toeic 開頭 → cloud-sync 自動同步）。每筆都有 id、t → 兩台裝置依 id 合併。
     面向：{ id:'w1d1|confirm|col|abc', n:考過幾次, ok:答對幾次, last:最近一次對錯(1/0), t:最後考的時間 }
     一回：{ id:'S|w1d1|<ts>', a:'w1d1', n, ok, t, secs:{ vocab:[對,題], listen:[對,題] } }
   偏好（段落勾選、題數）：qzPrefV1（只存在這台裝置）。 */

const QZ_KEY = 'toeicQuizV1', QZ_PREF = 'qzPrefV1', QZ_PASS = 0.8;
const QZ_SECS = [['vocab', '🔤', '單字', 2], ['listen', '🎧', '聽力', 1]]; // 最後一欄＝分配題數的權重（15 題＝單字 10＋聽力 5）
const QZ_MIX = [['never', 0.70], ['wrong', 0.25], ['right', 0.05]];
const QZ_WORD_CAP = 2;
const QZ = { st: 'setup', part: 'word', a: null, x: null, pool: null, sec: { vocab: 1, listen: 1 }, n: 15, qs: [], i: 0, picked: null, res: [], t0: 0 };
try { const p = JSON.parse(localStorage.getItem(QZ_PREF) || '{}'); if (p.sec) Object.keys(QZ.sec).forEach(k => { if (k in p.sec) QZ.sec[k] = p.sec[k] ? 1 : 0; }); if ([10, 15, 20].includes(p.n)) QZ.n = p.n; if (p.part === 'art') QZ.part = 'art'; } catch (e) {}
const qzPrefSave = () => { try { localStorage.setItem(QZ_PREF, JSON.stringify({ sec: QZ.sec, n: QZ.n, part: QZ.part, den: typeof QA !== 'undefined' ? QA.den : 1 })); } catch (e) {} };

/* ---------- 小工具 ---------- */
const qzShuf = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const qzH = s => { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const qzRx = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const qzCap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const qzIsUp = s => /^[A-Z]/.test(s || '');
const qzPad = n => String(n).padStart(2, '0');
const qzBlankStr = '＿＿＿＿';
const qzKey = s => (typeof dnKey === 'function' ? dnKey(s) : String(s).trim().toLowerCase());
const qzArr = v => Array.isArray(v) ? v : (v ? [v] : []);
const qzExtras = x => Array.isArray(x && x.extra_vocab) ? x.extra_vocab : [];
function qzFind(sent, surf) { // 在句子裡找 surf（單字邊界、不分大小寫）→ { from, to, s } 或 null
  if (!surf) return null;
  const m = new RegExp('(^|[^A-Za-z0-9])(' + qzRx(surf) + ')(?![A-Za-z0-9])', 'i').exec(sent);
  return m ? { from: m.index + m[1].length, to: m.index + m[1].length + m[2].length, s: m[2] } : null;
}
const qzBlankAt = (sent, from, to) => sent.slice(0, from) + qzBlankStr + sent.slice(to);
const qzMask = (s, w) => { // 英文解釋裡出現答案（含常見變化形）→ 遮起來
  if (!s || !w || /\s/.test(w)) return s;
  const b = qzRx(w.toLowerCase()), st = qzRx(w.toLowerCase().replace(/e$/, '').replace(/([^aeiou])y$/, '$1'));
  return String(s).replace(new RegExp('\\b(?:' + b + '(?:s|es|d|ed|ing|ly|er|ers)?|' + st + '(?:ing|ed|er|ers|ies|ied|ier|ily))\\b', 'gi'), qzBlankStr);
};

/* ---------- 紀錄 ---------- */
let QZ_R = null;
const qzRecs = () => { if (QZ_R) return QZ_R; try { QZ_R = JSON.parse(localStorage.getItem(QZ_KEY) || '[]'); } catch (e) { QZ_R = []; } if (!Array.isArray(QZ_R)) QZ_R = []; return QZ_R; };
const qzReload = () => { QZ_R = null; return qzRecs(); };
const qzSaveR = () => { try { localStorage.setItem(QZ_KEY, JSON.stringify(qzRecs())); } catch (e) {} };
const qzRecMap = () => { const m = new Map(); qzRecs().forEach(r => { if (r && r.id && !String(r.id).startsWith('S|')) m.set(r.id, r); }); return m; };
function qzRecord(q, ok) {
  const L = qzRecs(); let r = L.find(v => v && v.id === q.key);
  if (!r) { r = { id: q.key, n: 0, ok: 0 }; L.push(r); }
  r.n = (r.n || 0) + 1; r.ok = (r.ok || 0) + (ok ? 1 : 0); r.last = ok ? 1 : 0; r.t = Date.now(); qzSaveR();
}
function qzLast(aid) { let b = null; qzRecs().forEach(r => { if (r && r.a === aid && String(r.id).startsWith('S|') && (!b || r.t > b.t)) b = r; }); return b; }
function qzSaveSession(aid, res) {
  const secs = {}; res.forEach(o => { const s = secs[o.q.sec] || (secs[o.q.sec] = [0, 0]); s[1]++; if (o.ok) s[0]++; });
  const t = Date.now(), n = res.length, ok = res.filter(o => o.ok).length, L = qzRecs();
  L.push({ id: 'S|' + aid + '|' + t, a: aid, n, ok, t, secs });
  const mine = L.filter(r => r && r.a === aid && String(r.id).startsWith('S|')).sort((p, q) => q.t - p.t).slice(30); // 每篇只留最近 30 回
  if (mine.length) { const drop = new Set(mine.map(r => r.id)); QZ_R = L.filter(r => !drop.has(r && r.id)); }
  qzSaveR();
}

/* ---------- 字池（拿來做干擾選項）---------- */
function qzWords(x) {
  const out = new Map();
  const add = (w, pos, type) => { w = String(w || '').trim(); if (!w || /[一-鿿]/.test(w)) return; const k = w.toLowerCase(); if (!out.has(k)) out.set(k, { w, pos: pos || '', type: type || (/\s/.test(w) ? 'phrase' : 'word') }); };
  (x.vocab || []).forEach(v => add(v.word, v.pos, 'word'));
  qzExtras(x).forEach(e => { if (e.type !== 'sentence') add(e.text, e.pos, e.type); });
  return [...out.values()];
}
let QZ_GW = null;
function qzGlobalWords() {
  const n = (typeof DATA !== 'undefined' ? DATA.length : 0);
  if (QZ_GW && QZ_GW.n === n) return QZ_GW.a;
  const m = new Map(); DATA.forEach(x => qzWords(x).forEach(o => { const k = o.w.toLowerCase(); if (!m.has(k)) m.set(k, o); }));
  QZ_GW = { n, a: [...m.values()] }; return QZ_GW.a;
}
function qzDistract(x, ans, pos, type, k, pref, ban) { // 干擾選項：先用 pref（易混淆、近義…），再同詞性，再同類型，最後別篇的字；ban＝不能當干擾的字（近義字：放進句子也通順，會變成兩個答案）
  const seen = new Set([String(ans).toLowerCase(), qzKey(ans)]), out = [];
  qzArr(ban).forEach(b => { seen.add(String(b).toLowerCase()); seen.add(qzKey(b)); });
  const take = a => { for (const o of a) { if (out.length >= k) return; const s = typeof o === 'string' ? o : o.w, key = s.toLowerCase(); if (!s || seen.has(key) || seen.has(qzKey(s))) continue; seen.add(key); seen.add(qzKey(s)); out.push(s); } };
  const ty = o => (type === 'phrase') === (o.type === 'phrase');
  take(qzShuf(pref || []));
  const P = qzWords(x).filter(ty), G = qzGlobalWords().filter(ty);
  take(qzShuf(P.filter(o => pos && o.pos === pos))); take(qzShuf(P));
  take(qzShuf(G.filter(o => pos && o.pos === pos))); take(qzShuf(G));
  return out;
}

/* ---------- 做一題 ---------- */
function qzMake(o) {
  const ans = String(o.ans), seen = new Set([ans.toLowerCase()]), ds = [];
  for (const d of (o.ds || [])) { const k = String(d).toLowerCase(); if (!d || seen.has(k)) continue; seen.add(k); ds.push(String(d)); if (ds.length >= 3) break; }
  const min = o.min || 4; if (ds.length + 1 < min) return null;
  let opts = [{ t: ans, c: 1 }].concat(ds.map(t => ({ t })));
  if (!o.fixed) opts = qzShuf(opts);
  if (o.optAu) opts.forEach(p => { p.au = { kind: 'vplay', text: p.t, suf: '', fb: p.t }; });
  return { key: o.key, sec: o.sec, kind: o.kind, w: o.w || '', cap: o.cap || QZ_WORD_CAP, base: o.base || '', stem: o.stem, stemAu: o.stemAu || null, au: o.au || null, opts, ans: opts.findIndex(p => p.c), why: o.why || '', sentAu: o.sentAu || null };
}
const qzWhyWord = e => `<p><b>${esc(e.text)}</b>${e.ipa ? ` <span class="text-slate-400">${esc(e.ipa)}</span>` : ''}${e.pos ? ' ' + esc(e.pos) : ''}${e.zh ? ' — ' + esc(e.zh) : ''}</p>${e.en ? `<p class="text-slate-500">${esc(e.en)}</p>` : ''}`;
const qzStemCloze = (sent, hint) => `<p class="text-lg leading-relaxed">${esc(sent).replace(qzBlankStr, '<span class="inline-block min-w-[4rem] border-b-2 border-indigo-500 text-center text-indigo-500">？</span>')}</p>${hint ? `<p class="text-xs text-slate-400 mt-1">${hint}</p>` : ''}`;

/* ===== 🔤 單字 ===== */
function qzVocab(x) {
  const Q = [], add = q => { if (q) { q.sec = 'vocab'; Q.push(qzMake(q)); } };
  const extras = qzExtras(x), has = new Set(extras.map(e => qzKey(e.lemma || e.text)).concat(extras.map(e => qzKey(e.text))));
  const SW = o => qzArr(o).map(v => v && (v.word || v.phrase || v.w)).filter(Boolean);
  const PREPS = ['by', 'to', 'for', 'of', 'on', 'in', 'at', 'with', 'from', 'about', 'into', 'as', 'over', 'under', 'through', 'after', 'before', 'within'];
  const STOP = new Set(['a', 'an', 'the', 'your', 'our', 'my', 'his', 'her', 'their', 'its', 'some', 'any', 'this', 'that', 'one', "someone's", 'someone', 'something', 'sth', 'sb']);
  const formSurf = (e, sent) => { // 這句裡出現的是原形還是某個屈折形／衍生字
    const base = qzFind(sent, e.text); if (base) return { kind: 'base', m: base };
    for (const f of qzArr(e.forms)) { const m = f && f.w && qzFind(sent, f.w); if (m) return { kind: 'form', m, f }; }
    return null;
  };
  extras.forEach(e => {
    if (!e || !e.text) return;
    const aid = idOf(x), wk = qzKey(e.lemma || e.text), id = (suf) => `${wk}|${suf}`, T = e.text, ph = e.type === 'phrase', pos = e.pos || '';
    const why0 = qzWhyWord(e);
    if (e.type === 'sentence') { // 句子：同義改寫
      const pp = qzArr(e.paraphrase)[0]; if (!pp || !pp.en) return;
      const others = extras.filter(o => o !== e && o.type === 'sentence').flatMap(o => [qzArr(o.paraphrase)[0] && qzArr(o.paraphrase)[0].en, o.text]).filter(Boolean);
      add({ key: `${qzH(e.text)}|pp`, w: 's' + qzH(e.text), cap: 1, kind: '同義改寫', stem: `<p class="text-xs text-slate-500 mb-1">哪一句和下面這句意思最接近？</p><p class="text-lg leading-relaxed">${esc(e.text)}</p>`, stemAu: { kind: 'tts', text: e.text }, ans: pp.en, ds: others.filter(s => s !== pp.en), why: `<p>${esc(pp.en)}</p><p class="text-slate-500">${esc(pp.zh || '')}</p><p class="text-slate-500 mt-1">原句：${esc(e.zh || '')}</p>` });
      return;
    }
    const conf = SW(e.confusable), sim = SW(e.similar), fam = SW(e.family);
    const sameTy = a => a.filter(s => /\s/.test(s) === ph);
    /* 英文解釋選單字（可播解釋、可播每個候選字） */
    if (e.en) add({ key: id('en'), w: wk, kind: '英文解釋 → 單字', stem: `<p class="text-xs text-slate-500 mb-1">哪一個字／片語的意思是：</p><p class="text-lg leading-relaxed">${esc(qzMask(e.en, T))}</p>`, stemAu: { kind: 'vplay', text: T, suf: '_en', fb: e.en }, ans: T, ds: qzDistract(x, T, pos, e.type, 3, sameTy(conf.concat(sim, fam))), optAu: true, why: why0 });
    /* 中文選英文 */
    if (e.zh) add({ key: id('zh'), w: wk, kind: '中文 → 英文', stem: `<p class="text-xs text-slate-500 mb-1">哪一個字／片語的意思是：</p><p class="text-xl font-bold">${esc(e.zh)} <span class="text-sm font-normal text-slate-400">${esc(pos)}</span></p>`, ans: T, ds: qzDistract(x, T, pos, e.type, 3, sameTy(conf)), optAu: true, why: why0 });
    /* 例句：原形 → 克漏字；出現的是屈折形 → 詞形題 */
    qzArr(e.examples).slice(0, 8).forEach((ex, ei) => {
      if (!ex || !ex.en) return;
      const sa = { kind: 'vplay', text: T, suf: '_e' + (ei + 1), fb: ex.en }; // 詳解頁「例句」的整句 mp3（vocab/<字>_e<第幾句>.mp3），沒有檔案就機器發音
      const hit = formSurf(e, ex.en); if (!hit) return;
      if (hit.kind === 'base') {
        const up = hit.m.from === 0, ds = qzDistract(x, hit.m.s, pos, e.type, 3, sameTy(conf), sim);
        add({ key: id('ex|' + qzH(ex.en)), w: wk, kind: '例句克漏字', sentAu: sa, stem: qzStemCloze(qzBlankAt(ex.en, hit.m.from, hit.m.to), ''), stemAu: null, ans: up ? qzCap(hit.m.s) : hit.m.s, ds: up ? ds.map(qzCap) : ds, optAu: true, why: `<p>${esc(ex.en)}</p><p class="text-slate-500">${esc(ex.zh || '')}</p>${why0}` });
      } else qzForm(add, e, wk, ex.en, ex.zh, hit.m, 'fx|' + qzH(ex.en), why0, x, null, sa);
    });
    if (!ph) {
      /* 詞形 */
      qzArr(e.forms).forEach((f, fi) => { if (!f || !f.w || !f.example || !f.example.en) return; const m = qzFind(f.example.en, f.w); if (m) qzForm(add, e, wk, f.example.en, f.example.zh, m, 'fm|' + qzKey(f.w) + qzH(f.label || ''), why0 + `<p class="text-xs text-slate-500">${esc(f.w)}：${esc(f.label || '')} ${esc(f.zh || '')}</p>`, x, f.w, { kind: 'vplay', text: T, suf: '_fx' + (fi + 1), fb: f.example.en }); });
      /* 搭配 */
      qzArr(e.collocations).forEach((c, ci) => {
        if (!c || !c.phrase) return;
        const toks = c.phrase.trim().split(/\s+/), lem = (e.lemma || e.text).toLowerCase(), pre = lem.slice(0, Math.max(3, lem.length - 2));
        const ki = toks.findIndex(t => t.toLowerCase().replace(/[^a-z]/g, '').startsWith(pre)); if (ki < 0) return;
        let bi = toks.findIndex((t, i) => i !== ki && PREPS.includes(t.toLowerCase())), prep = bi >= 0;
        if (bi < 0) { for (let i = toks.length - 1; i >= 0; i--) { const t = toks[i].toLowerCase().replace(/[^a-z']/g, ''); if (i !== ki && t.length >= 3 && !STOP.has(t)) { bi = i; break; } } }
        if (bi < 0) return;
        const ans = toks[bi].replace(/[.,;]/g, ''), blank = toks.map((t, i) => i === bi ? qzBlankStr : t).join(' ');
        const partners = extras.flatMap(o => qzArr(o.collocations)).flatMap(o => String(o && o.phrase || '').split(/\s+/)).map(t => t.replace(/[^A-Za-z]/g, '')).filter(t => t.length >= 3 && !STOP.has(t.toLowerCase()) && !PREPS.includes(t.toLowerCase()));
        const ds = prep ? qzShuf(PREPS.filter(p => p !== ans.toLowerCase())) : qzDistract(x, ans, '', 'word', 3, qzShuf(partners.filter(t => t.toLowerCase() !== ans.toLowerCase())));
        add({ key: id('col|' + qzH(c.phrase)), w: wk, kind: '搭配詞', sentAu: c.example && c.example.en ? { kind: 'vplay', text: T, suf: '_c' + (ci + 1), fb: c.example.en } : null, stem: `<p class="text-xs text-slate-500 mb-1">填入空格，完成常用搭配${c.zh ? '（' + esc(c.zh) + '）' : ''}：</p><p class="text-xl font-bold">${esc(blank).replace(qzBlankStr, '<span class="inline-block min-w-[3rem] border-b-2 border-indigo-500 text-center text-indigo-500">？</span>')}</p>`, ans, ds, optAu: true, why: `<p class="font-semibold">${esc(c.phrase)} <span class="font-normal text-slate-500">${esc(c.zh || '')}</span></p>${c.example ? `<p>${esc(c.example.en)}</p><p class="text-slate-500">${esc(c.example.zh || '')}</p>` : ''}` });
      });
      /* 多義：這句的意思是？ */
      const sn = qzArr(e.senses).filter(s => s && s.zh && s.example && s.example.en);
      if (sn.length >= 2) sn.forEach(s => add({ key: id('sn|' + qzH(s.example.en)), w: wk, kind: '多義', sentAu: { kind: 'vplay', text: T, suf: '_s' + (qzArr(e.senses).indexOf(s) + 1), fb: s.example.en }, min: Math.min(4, sn.length), stem: `<p class="text-xs text-slate-500 mb-1">這個句子裡的 <b>${esc(T)}</b> 是什麼意思？</p><p class="text-lg leading-relaxed">${esc(s.example.en)}</p>`, stemAu: { kind: 'tts', text: s.example.en }, ans: s.zh, ds: sn.filter(o => o !== s).map(o => o.zh), why: `<p>${esc(s.example.zh || '')}</p>${s.distinguish ? `<p class="text-slate-500">${esc(s.distinguish)}</p>` : ''}${s.en ? `<p class="text-slate-500">${esc(s.en)}</p>` : ''}` }));
      /* 衍生字 */
      qzArr(e.derived).forEach((d, di) => { if (!d || !d.w || !d.zh) return; add({ key: id('dv|' + qzKey(d.w)), w: wk, kind: '衍生字', sentAu: d.example && d.example.en ? { kind: 'vplay', text: T, suf: '_dx' + (di + 1), fb: d.example.en } : null, stem: `<p class="text-xs text-slate-500 mb-1">和 <b>${esc(T)}</b> 同一個字族，意思是：</p><p class="text-xl font-bold">${esc(d.zh)} <span class="text-sm font-normal text-slate-400">${esc(d.pos || '')}</span></p>`, ans: d.w, ds: [T].concat(qzArr(e.forms).map(f => f && f.w), qzArr(e.derived).map(o => o && o.w), fam).filter(s => s && qzKey(s) !== qzKey(d.w)).concat(qzDistract(x, d.w, d.pos, 'word', 3)), optAu: true, why: `<p><b>${esc(d.w)}</b> ${esc(d.ipa || '')} ${esc(d.pos || '')} ${esc(d.zh)}</p>${d.link ? `<p class="text-slate-500">${esc(d.link)}</p>` : ''}${d.example && d.example.en ? `<p>${esc(d.example.en)}</p><p class="text-slate-500">${esc(d.example.zh || '')}</p>` : ''}` }); });
    }
    /* 近義 */
    qzArr(e.similar).forEach((s, si) => { const sp = s && (s.phrase || s.word); if (!sp) return; add({ key: id('sm|' + qzKey(sp)), w: wk, kind: '近義字', sentAu: s.example && s.example.en ? { kind: 'vplay', text: T, suf: '_sx' + (si + 1), fb: s.example.en } : null, stem: `<p class="text-xs text-slate-500 mb-1">哪一個和 <b>${esc(T)}</b> 意思最接近？</p>`, ans: sp, ds: qzDistract(x, sp, pos, /\s/.test(sp) ? 'phrase' : 'word', 3, []).filter(w => qzKey(w) !== qzKey(T)), optAu: true, why: `<p><b>${esc(T)}</b> ≈ <b>${esc(sp)}</b></p><p class="text-slate-500">${esc(s.diff || '')}</p>${s.example ? `<p>${esc(s.example.en)}</p><p class="text-slate-500">${esc(s.example.zh || '')}</p>` : ''}` }); });
    /* 易混淆：句子填空，選本字還是它 */
    qzArr(e.confusable).forEach((c, ci) => {
      const cw = c && (c.word || c.phrase), ce = c && c.example && c.example.en; if (!cw || !ce) return;
      const m = qzFind(ce, cw); if (!m) return; const up = m.from === 0;
      const ds = [T].concat(conf.filter(o => o !== cw), qzDistract(x, cw, pos, /\s/.test(cw) ? 'phrase' : 'word', 3, [], sim.concat(fam)));
      add({ key: id('cf|' + qzKey(cw)), w: wk, kind: '易混淆', sentAu: { kind: 'vplay', text: T, suf: '_cf' + (ci + 1), fb: ce }, stem: qzStemCloze(qzBlankAt(ce, m.from, m.to), ''), ans: up ? qzCap(m.s) : m.s, ds: up ? ds.map(qzCap) : ds, optAu: true, why: `<p>${esc(ce)}</p><p class="text-slate-500">${esc(c.example.zh || '')}</p><p class="mt-1"><b>${esc(cw)}</b> vs <b>${esc(T)}</b>：${esc(c.diff || '')}</p>${c.usage ? `<p class="text-slate-500">${esc(c.usage)}</p>` : ''}` });
    });
    /* 相關字（family）：句子填空 */
    qzArr(e.family).forEach((f, fi) => {
      if (!f || !f.w || !f.example || !f.example.en) return; const m = qzFind(f.example.en, f.w); if (!m) return;
      const up = m.from === 0, ds = qzDistract(x, f.w, f.pos, 'word', 3, [T].concat(qzArr(e.forms).map(o => o && o.w)));
      add({ key: id('fa|' + qzKey(f.w)), w: wk, kind: '相關字', sentAu: { kind: 'vplay', text: T, suf: '_mx' + (fi + 1), fb: f.example.en }, stem: qzStemCloze(qzBlankAt(f.example.en, m.from, m.to), ''), ans: up ? qzCap(m.s) : m.s, ds: up ? ds.map(qzCap) : ds, optAu: true, why: `<p>${esc(f.example.en)}</p><p class="text-slate-500">${esc(f.example.zh || '')}</p><p><b>${esc(f.w)}</b> ${esc(f.pos || '')} ${esc(f.zh || '')}</p>` });
    });
  });
  /* 核心單字（vocab）：沒有詳解的才補 */
  (x.vocab || []).forEach(v => {
    if (!v || !v.word || has.has(qzKey(v.word))) return;
    const wk = qzKey(v.word), pos = v.pos || '';
    if (v.zh) add({ key: `${wk}|zh`, w: wk, kind: '中文 → 英文', stem: `<p class="text-xs text-slate-500 mb-1">哪一個字的意思是：</p><p class="text-xl font-bold">${esc(v.zh)} <span class="text-sm font-normal text-slate-400">${esc(pos)}</span></p>`, ans: v.word, ds: qzDistract(x, v.word, pos, 'word', 3), optAu: true, why: `<p><b>${esc(v.word)}</b> ${esc(v.ipa || '')} ${esc(pos)} — ${esc(v.zh || '')}</p>${v.col ? `<p class="text-slate-500">${esc(v.col)}</p>` : ''}` });
    const seg = String(v.col || '').split('/')[0].trim(), m = seg && qzFind(seg, v.word);
    if (m) { const up = m.from === 0, ds = qzDistract(x, m.s, pos, 'word', 3); add({ key: `${wk}|vc`, w: wk, kind: '搭配詞', stem: qzStemCloze(qzBlankAt(seg, m.from, m.to), (v.zh ? esc(v.zh) : '')), ans: up ? qzCap(m.s) : m.s, ds: up ? ds.map(qzCap) : ds, optAu: true, why: `<p>${esc(v.col)}</p><p class="text-slate-500">${esc(v.word)} ${esc(pos)} ${esc(v.zh || '')}</p>` }); }
  });
  return Q.filter(Boolean);
}
function qzForm(add, e, wk, sent, zh, m, suf, why, x, ans0, au) { // 詞形：句子裡的字換成空格，選正確的形態
  const T = e.text, ansS = m.s, up = m.from === 0;
  const pool = [T].concat(qzArr(e.forms).map(f => f && f.w), qzArr(e.derived).map(d => d && d.w), qzArr(e.family).filter(f => f && /^n\.|^v\.|^adj\.|^adv\./.test(f.pos || '') && qzKey(f.w) !== qzKey(T)).map(f => f.w)).filter(s => s && !/\s/.test(s) && s.toLowerCase() !== ansS.toLowerCase());
  if (new Set(pool.map(s => s.toLowerCase())).size < 2) return;
  const ds = qzShuf([...new Set(pool)]).concat(qzDistract(x, ansS, e.pos, 'word', 3));
  add({ key: `${wk}|${suf}`, w: wk, kind: '詞形', sentAu: au || null, stem: qzStemCloze(qzBlankAt(sent, m.from, m.to), ''), ans: ansS, ds: up ? ds.map(qzCap) : ds, optAu: true, why: `<p>${esc(sent)}</p><p class="text-slate-500">${esc(zh || '')}</p>${why}` });
}

/* ===== 🎧 聽力（用詳解的內容；題幹只能聽、不顯示文字，答完才顯示）===== */
const qzFormSurf = (e, sent) => { // 這句裡出現的是原形還是屈折形 → { m: 比對結果 }
  const base = qzFind(sent, e.text); if (base) return { m: base };
  for (const f of qzArr(e.forms)) { const m = f && f.w && qzFind(sent, f.w); if (m) return { m }; }
  return null;
};
function qzListen(x) {
  const Q = [], add = q => { if (q) { q.sec = 'listen'; Q.push(qzMake(q)); } };
  const extras = qzExtras(x).filter(e => e && e.text && e.type !== 'sentence');
  const vp = (T, suf, fb) => ({ kind: 'vplay', text: T, suf, fb }); // 詳解頁同一套檔名：vocab/<字><後綴>.mp3，沒有檔案就機器發音
  const stemOf = t => `<p class="text-lg leading-relaxed">🎧 ${t}</p>`;
  const allZh = extras.flatMap(o => qzArr(o.examples).map(z => z && z.zh)).filter(Boolean);
  const allCol = extras.flatMap(o => qzArr(o.collocations).map(c => c && c.phrase)).filter(Boolean);
  const SB = ['sound', 'spell'];
  extras.forEach(e => {
    const T = e.text, wk = qzKey(e.lemma || e.text), id = suf => `${wk}|${suf}`, ph = e.type === 'phrase', pos = e.pos || '';
    const exs = qzArr(e.examples).slice(0, 8);
    /* ① 聽例句選中文：播詳解的例句，選正確的中文翻譯 */
    exs.forEach((ex, ei) => {
      if (!ex || !ex.en || !ex.zh) return;
      const own = exs.map(o => o && o.zh).filter(z => z && z !== ex.zh);
      add({ key: id('lz|' + qzH(ex.en)), w: wk, kind: '聽例句選中文', au: vp(T, '_e' + (ei + 1), ex.en), stem: stemOf('聽句子，選出正確的中文意思。'),
        ans: ex.zh, ds: qzShuf(own).concat(qzShuf(allZh.filter(z => z !== ex.zh && !own.includes(z)))), why: `<p>${esc(ex.en)}</p><p class="text-slate-500">${esc(ex.zh)}</p><p class="text-xs text-slate-400 mt-1">${esc(T)} ${esc(e.zh || '')}</p>` });
    });
    /* ② 聽詞形：播一句，句子裡這個字是哪一種形態（-s、-ed、-ing、名詞…）*/
    if (!ph) {
      const forms = qzArr(e.forms).filter(f => f && f.w && !/\s/.test(f.w)), srcs = exs.map((ex, ei) => ex && ex.en && { en: ex.en, zh: ex.zh, au: vp(T, '_e' + (ei + 1), ex.en) }).concat(forms.map((f, fi) => f.example && f.example.en ? { en: f.example.en, zh: f.example.zh, au: vp(T, '_fx' + (fi + 1), f.example.en) } : null)).filter(Boolean);
      const pool = [T].concat(forms.map(f => f.w), qzArr(e.derived).map(d => d && d.w)).filter(w => w && !/\s/.test(w));
      srcs.forEach(sr => {
        const hit = qzFormSurf(e, sr.en); if (!hit) return;
        const ans = hit.m.s.toLowerCase(), ds = [...new Set(pool.map(w => w.toLowerCase()))].filter(w => w !== ans);
        const lab = qzArr(e.forms).find(f => f && f.w && f.w.toLowerCase() === ans);
        add({ key: id('lf|' + qzH(sr.en)), w: wk, kind: '聽詞形', min: 3, au: sr.au, stem: stemOf(`聽句子，句子裡的 <b>${esc(e.lemma || T)}</b> 是哪一個詞形？`),
          ans, ds, why: `<p>${esc(sr.en)}</p><p class="text-slate-500">${esc(sr.zh || '')}</p><p class="text-xs text-slate-500 mt-1"><b>${esc(ans)}</b>${lab ? '：' + esc(lab.label || '') + ' ' + esc(lab.zh || '') : (ans === T.toLowerCase() ? '：原形' : '')}</p>` });
      });
    }
    /* ③ 聽音辨字：播一個單字，選拼法。干擾項是易混淆裡標「音似／形似」的字 */
    if (!ph) qzArr(e.confusable).forEach(c => {
      const cw = c && c.word; if (!cw || /\s/.test(cw) || !qzArr(c.kind).some(k => SB.includes(k))) return;
      const played = Math.random() < 0.5 ? T : cw, other = played === T ? cw : T;
      const more = extras.flatMap(o => qzArr(o.confusable).filter(z => z && z.word && !/\s/.test(z.word) && qzArr(z.kind).some(k => SB.includes(k))).map(z => z.word)).filter(w => w !== played && w !== other);
      add({ key: id('ld|' + qzKey(cw)), w: wk, kind: '聽音辨字', au: vp(played, '', played), stem: stemOf('聽單字，選出你聽到的拼法。'),
        ans: played, ds: [other].concat(qzShuf(more), qzDistract(x, played, pos, 'word', 3, [])), optAu: true, why: `<p><b>${esc(T)}</b> ${esc(e.ipa || '')} ${esc(e.zh || '')}</p><p><b>${esc(cw)}</b> ${esc(c.ipa || '')}</p><p class="text-slate-500 mt-1">${esc(c.diff || '')}</p>` });
    });
    /* ④ 聽英文解釋選字：播 _en 解釋（不顯示文字）*/
    if (e.en) {
      const conf = qzArr(e.confusable).map(c => c && (c.word || c.phrase)), sim = qzArr(e.similar).map(c => c && (c.phrase || c.word)), fam = qzArr(e.family).map(c => c && c.w), tyOk = a => a.filter(s => s && /\s/.test(s) === ph);
      add({ key: id('le'), w: wk, kind: '聽解釋選字', au: vp(T, '_en', e.en), stem: stemOf('聽英文解釋，選出它說的單字／片語。'),
        ans: T, ds: qzDistract(x, T, pos, e.type, 3, tyOk(conf.concat(sim, fam))), optAu: true, why: qzWhyWord(e) });
    }
    /* ⑤ 聽搭配：播搭配例句，選句子裡用到的搭配 */
    qzArr(e.collocations).forEach((c, ci) => {
      if (!c || !c.phrase || !c.example || !c.example.en) return;
      const own = qzArr(e.collocations).map(o => o && o.phrase).filter(p => p && p !== c.phrase);
      add({ key: id('lc|' + qzH(c.phrase)), w: wk, kind: '聽搭配', au: vp(T, '_c' + (ci + 1), c.example.en), stem: stemOf('聽句子，選出句子裡用到的搭配。'),
        ans: c.phrase, ds: qzShuf(own).concat(qzShuf(allCol.filter(p => p !== c.phrase && !own.includes(p)))), why: `<p>${esc(c.example.en)}</p><p class="text-slate-500">${esc(c.example.zh || '')}</p><p class="mt-1"><b>${esc(c.phrase)}</b> ${esc(c.zh || '')}</p>` });
    });
  });
  return Q.filter(Boolean);
}
function qzBuild(x) {
  const aid = idOf(x), Q = [].concat(qzVocab(x), qzListen(x)), seen = new Map();
  Q.filter(Boolean).forEach(q => { q.key = aid + '|' + q.key; if (!seen.has(q.key)) seen.set(q.key, q); });
  return [...seen.values()];
}

/* ===== 選題：每個段落 70% 沒考過／25% 答錯過／5% 答對過 ===== */
function qzLrm(total, ws) { // 最大餘數法：把 total 依權重分成整數，加總剛好 = total
  const sum = ws.reduce((a, b) => a + b, 0) || 1, raw = ws.map(w => total * w / sum), out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0]).forEach(([_, i]) => { if (rest > 0) { out[i]++; rest--; } });
  return out;
}
function qzBucketOf(rm, q) { const r = rm.get(q.key); return !r ? 'never' : (r.last ? 'right' : 'wrong'); }
function qzTake(list, n, ctx, tcap, capAdd) { // 依序挑 n 個：守「同字上限（可加寬 capAdd 題）＋同題型上限（先守、不夠再放寬）」；capAdd = Infinity＝不限（最後手段）。同一個句子／題目（base）絕不重複
  const got = [], tc = {};
  const ok = (q, strict, wordStrict) => {
    if (q.base && ctx.base.has(q.base)) return false;
    if (wordStrict && q.w && (ctx.wc[q.sec + q.w] || 0) >= ctx.capOf(q) + (capAdd || 0)) return false;
    if (strict && (tc[q.kind] || 0) >= tcap) return false;
    return true;
  };
  (capAdd === Infinity ? [[false, false]] : [[true, true], [false, true]]).forEach(([st, ws]) => {
    for (const q of list) {
      if (got.length >= n) return;
      if (got.includes(q) || ctx.taken.has(q) || !ok(q, st, ws)) continue;
      got.push(q); ctx.taken.add(q); if (q.base) ctx.base.add(q.base); if (q.w) ctx.wc[q.sec + q.w] = (ctx.wc[q.sec + q.w] || 0) + 1; tc[q.kind] = (tc[q.kind] || 0) + 1;
    }
  });
  return got;
}
function qzSpread(list) { // 打散順序：相鄰兩題盡量不是同一個字、同一種題型（交錯）
  const left = qzShuf(list), out = [];
  while (left.length) {
    const last = out[out.length - 1];
    let i = left.findIndex(q => !last || (q.w !== last.w && q.kind !== last.kind));
    if (i < 0) i = left.findIndex(q => !last || q.w !== last.w);
    out.push(left.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}
function qzRoundRobin(list) { // 依題型輪流排（題型順序、每個題型內的順序都是隨機的）
  const g = new Map(); qzShuf(list).forEach(q => { if (!g.has(q.kind)) g.set(q.kind, []); g.get(q.kind).push(q); });
  const ks = qzShuf([...g.keys()]), out = [];
  for (let i = 0; out.length < list.length; i++) ks.forEach(k => { const a = g.get(k); if (i < a.length) out.push(a[i]); });
  return out;
}
function qzSecPick(items, k, ctx, rm) {
  const B = { never: [], wrong: [], right: [] };
  items.forEach(q => { q.bucket = qzBucketOf(rm, q); B[q.bucket].push(q); });
  B.never = qzRoundRobin(B.never); // 沒考過的：各種題型輪流出，不會被題數最多的題型（例如詞形）佔滿
  const tm = q => (rm.get(q.key) || {}).t || 0; B.wrong.sort((a, b) => tm(a) - tm(b)); B.right.sort((a, b) => tm(a) - tm(b));
  const tcap = Math.max(2, Math.ceil(k / 4)), want = qzLrm(k, QZ_MIX.map(m => m[1])), out = [], names = ['never', 'wrong', 'right'];
  const got = QZ_MIX.map(([name], i) => qzTake(B[name], want[i], ctx, tcap)); // ① 70／25／5，同字上限 2 題
  QZ_MIX.forEach(([name], i) => { if (got[i].length < want[i]) got[i] = got[i].concat(qzTake(B[name], want[i] - got[i].length, ctx, tcap, 1)); }); // ② 這一類題目集中在少數字：同字放寬到 3 題，比例優先
  got.forEach(g => out.push(...g));
  names.forEach(name => { if (out.length < k) out.push(...qzTake(B[name], k - out.length, ctx, tcap)); }); // ③ 這一類真的不夠：名額依 沒考過 → 答錯過 → 答對過（最久沒考的先）補
  names.forEach(name => { if (out.length < k) out.push(...qzTake(B[name], k - out.length, ctx, tcap, Infinity)); }); // ④ 最後才完全不限同字
  return qzSpread(out);
}
function qzSelect(pool, secs, n) {
  const rm = qzRecMap(), chosen = QZ_SECS.filter(s => secs[s[0]]);
  if (!chosen.length) return [];
  const per = {}; chosen.forEach(s => { per[s[0]] = pool.filter(q => q.sec === s[0]); });
  const quota = qzLrm(n, chosen.map(s => s[3])), caps = {}, got = {};
  const ctx = { wc: {}, base: new Set(), taken: new Set(), capOf: q => q.w ? (caps[q.sec + q.w] || (caps[q.sec + q.w] = 1 + Math.floor(Math.random() * 3))) : q.cap }; // 每個字這一回隨機問 1–3 題（單字、聽力各自算），再跳到別的字
  chosen.forEach((s, i) => { got[s[0]] = qzSecPick(per[s[0]], Math.min(quota[i], per[s[0]].length), ctx, rm); });
  let short = n - Object.values(got).reduce((a, b) => a + b.length, 0);
  for (const s of chosen) { // 某段題庫不夠：名額讓給還有題的段落
    if (short <= 0) break;
    const left = per[s[0]].filter(q => !ctx.taken.has(q));
    if (left.length) { const more = qzSecPick(left, Math.min(short, left.length), ctx, rm); got[s[0]] = got[s[0]].concat(more); short -= more.length; }
  }
  return chosen.flatMap(s => got[s[0]]);
}

/* ===== 播放（整篇／單句 mp3；解釋與單字走詳解頁同一套 vplay）===== */
let QT = 0;
function qzStopAudio() { QT++; try { speechSynthesis.cancel(); } catch (e) {} try { if (typeof spStop === 'function') spStop(); if (typeof skStopAll === 'function') skStopAll(); } catch (e) {} }
function qzTts(text) { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(String(text)); if (typeof setVoice === 'function') setVoice(u); else u.lang = 'en-US'; u.rate = 0.9; speechSynthesis.speak(u); } catch (e) { dnToast('這個瀏覽器不支援語音朗讀'); } }
function qzPlay() { // 聽力題的「▶ 播放」：用詳解頁同一套 mp3（單字、英文解釋、例句、搭配例句），沒有檔案就機器發音
  const q = QZ.qs[QZ.i], sp = q && q.au; if (!sp) return;
  qzStopAudio(); if (typeof vplay === 'function') vplay(QZ.a, sp.text, sp.suf, sp.fb); else qzTts(sp.fb || sp.text);
}
function qzSay(which, q) { // q 省略＝目前這一題（結果頁會指定那一題）
  q = q || QZ.qs[QZ.i]; if (!q) return;
  const sp = which === 's' ? q.stemAu : which === 'f' ? q.sentAu : which === 'a' ? q.au : (q.opts[which] && q.opts[which].au); if (!sp) return;
  qzStopAudio();
  if (sp.kind === 'vplay' && typeof vplay === 'function') vplay(QZ.a, sp.text, sp.suf, sp.fb); else qzTts(sp.text);
}
const qzSpk = (arg, cls, ri) => `<button type="button" onclick="event.stopPropagation();qzSay(${arg}${ri == null ? '' : ',QZ.res[' + ri + '].q'})" class="${cls || 'text-slate-400 hover:text-indigo-600 text-lg shrink-0'}" aria-label="發音">🔊</button>`;

/* ===== 畫面 ===== */
const qzSecInfo = k => QZ_SECS.find(s => s[0] === k);
function qzOpen(w, d) { const x = find(w, d); if (!x) return; QZ.x = x; QZ.a = idOf(x); QZ.st = 'setup'; QZ.pool = null; if (typeof qaReset === 'function') qaReset(); cur.w = w; cur.d = d; dnNav('quiz'); }
function qzEntry(x) { // 放在文章頁（隨堂測驗上方）
  if (!x || !x.passage || isLib(x)) return '';
  const l = qzLast(idOf(x)), pc = l ? Math.round(l.ok / l.n * 100) : 0, pass = l && l.ok / l.n >= QZ_PASS;
  return `<section class="${card} p-4 mb-4 flex flex-wrap items-center justify-between gap-2"><div><div class="font-bold">🧪 綜合測驗${pass ? ' <span class="text-emerald-600 dark:text-emerald-400 text-sm">✓ 已通過</span>' : ''}</div><div class="text-xs text-slate-500 mt-0.5">${l ? `最近一次 ${pc}%（${l.ok}/${l.n}）· ${new Date(l.t).toLocaleDateString('zh-TW')}` : '單字・聽力・文章克漏字 · 約 10 分鐘'}</div></div><button onclick="qzOpen(${x.week},${x.day})" class="${btn} ${dnPri}">開始測驗</button></section>`;
}
function qzRender() {
  if (!QZ.x || idOf(QZ.x) !== idOf(find(cur.w, cur.d) || QZ.x)) { const x = find(cur.w, cur.d); if (x) { QZ.x = x; QZ.a = idOf(x); QZ.st = 'setup'; QZ.pool = null; if (typeof qaReset === 'function') qaReset(); } }
  if (!QZ.x) { main.innerHTML = '<p class="text-sm text-slate-500">找不到這一篇。</p>'; return; }
  if (QZ.st === 'info') return qzInfo();
  if (QZ.part === 'art' && typeof qaRender === 'function') return qaRender();
  if (QZ.st === 'run') return qzRun(); if (QZ.st === 'result') return qzResult(); qzSetup();
}
const qzHead = (t, back) => `<header class="mb-4 flex items-center justify-between gap-2"><div><h2 class="text-xl md:text-2xl font-bold">🧪 綜合測驗</h2><p class="text-xs text-slate-500 mt-0.5">${esc(t)}</p></div>${back || dnBackBtn()}</header>`;
const qzTabs = () => `<div class="flex gap-2 mb-4">${[['word', '🔤 單字測驗'], ['art', '📖 文章測驗']].map(([k, t]) => `<button onclick="qzPart('${k}')" class="${btn} flex-1 ${QZ.part === k ? dnPri : dnLine}">${t}</button>`).join('')}</div>`;
function qzPart(k) { if (QZ.part === k) return; qzStopAudio(); QZ.part = k; qzPrefSave(); if (typeof qaReset === 'function') qaReset(); QZ.st = 'setup'; qzRender(); window.scrollTo({ top: 0 }); }
function qzSetup() {
  if (QZ.part === 'art' && typeof qaRender === 'function') return qaRender();
  const x = QZ.x; qzReload();
  if (!QZ.pool) QZ.pool = qzBuild(x);
  const rm = qzRecMap(), st = {}; QZ_SECS.forEach(([k]) => { st[k] = { never: 0, wrong: 0, right: 0 }; });
  QZ.pool.forEach(q => { st[q.sec][qzBucketOf(rm, q)]++; });
  const tot = k => st[k].never + st[k].wrong + st[k].right, on = QZ_SECS.filter(s => QZ.sec[s[0]]), avail = on.reduce((a, s) => a + tot(s[0]), 0), n = avail ? qzSelect(QZ.pool, QZ.sec, QZ.n).length : 0; // 試抽一次，算出實際會出幾題（有些題共用同一句，會互斥）
  const l = qzLast(QZ.a);
  main.innerHTML = qzHead(`W${x.week}·D${x.day} ${x.tag || ''}`) + qzTabs() + `<div class="${card} p-4 mb-4"><p class="text-sm font-bold mb-2">測驗項目</p><div class="space-y-2">${QZ_SECS.map(([k, ic, nm]) => `<label class="flex items-start gap-3 rounded-lg border ${QZ.sec[k] ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-800'} p-3 cursor-pointer"><input type="checkbox" ${QZ.sec[k] ? 'checked' : ''} ${tot(k) ? '' : 'disabled'} onchange="qzToggle('${k}')" class="mt-1"><span class="flex-1"><b>${ic} ${nm}</b> <span class="text-xs text-slate-500">${tot(k) ? `題庫 ${tot(k)} 題：沒考過 ${st[k].never}・答錯過 ${st[k].wrong}・答對過 ${st[k].right}` : '這篇沒有可出的題'}</span><span class="block text-xs text-slate-400">${{ listen: '聽例句選中文、聽詞形、聽音辨字、聽英文解釋選字、聽搭配（題幹只能聽，答完才顯示文字）', vocab: '英文解釋、中文、例句克漏字、詞形、搭配、多義、易混淆、近義、衍生字' }[k]}</span></span></label>`).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-3"><button onclick="qzPreset('all')" class="${dnSm}">全部</button><button onclick="qzPreset('vocab')" class="${dnSm}">只考單字</button><button onclick="qzPreset('listen')" class="${dnSm}">只考聽力</button><button onclick="qzShowInfo()" class="${dnSm} ml-auto">📋 資料（給 AI）</button></div>
    <div class="flex flex-wrap items-center gap-2 mt-4 text-sm"><span>題數</span>${[10, 15, 20].map(v => `<button onclick="qzSetN(${v})" class="${dnSm} ${QZ.n === v ? '!bg-indigo-600 !text-white !border-indigo-600' : ''}">${v}</button>`).join('')}<span class="text-xs text-slate-500">約 ${Math.max(1, Math.round(n * 0.7))} 分鐘</span></div>
    <p class="text-xs text-slate-500 mt-3 leading-relaxed">每個項目的題目：約 70% 沒考過的、25% 答錯過的、5% 答對過的；某一類不夠就依序補（沒考過 → 答錯過 → 最久沒考的答對題）。每個字這一回隨機問 1–3 題，再跳到別的字，相鄰題盡量不重複同一個字或題型。${l ? `<br>最近一次：${Math.round(l.ok / l.n * 100)}%（${l.ok}/${l.n}），${new Date(l.t).toLocaleString('zh-TW', { hour12: false })}` : ''}</p>
    <button onclick="qzStart()" ${avail ? '' : 'disabled'} class="${btn} ${dnPri} w-full mt-4 disabled:opacity-40">開始（${n} 題）</button></div>`;
}
/* ===== 資料頁：之後要請 AI 增修綜合測驗時，需要提供哪些檔案＋可一鍵複製的說明 ===== */
/* 注意：修改綜合測驗後，要同步檢查這份說明（QZ_AI_TEXT）和下面的 QZ_FILES 是否需要更新，才不會誤導下一位 AI */
const QZ_AI_TEXT = [
  '【TOEIC Daily Coach — 綜合測驗（quiz.js）修改說明】',
  '我會一併提供：quiz.js、quizart.js、daily.js、notes.js、daily.html，以及 daily.json 的一小段（某一篇有 extra_vocab 的文章）和「單字詳解 AI 提示檔」（說明每個詳解欄位的意思）。',
  '',
  '■ 範圍：只考「單字」與「聽力」（聽力＝只用單字詳解內容出題，每題都有現成 mp3）。閱讀／文法／文章內容的出題已移除。',
  '■ 文章測驗（quizart.js，狀態物件 QA）：綜合測驗分「單字測驗」（quiz.js）與「文章測驗」（quizart.js）兩個分頁（QZ.part：word／art），目前文章測驗只有 A 文章克漏字。整篇文章（超過約 170 字依段落／句子分頁）隨機挖空單字／片語／詞形，來源是該篇 vocab＋extra_vocab，不足時補「別篇詳解的字剛好出現在這篇」；下方球標池＝答案＋約 50% 干擾字（取易混淆、詞形、同詞性，近義字不當干擾）。操作：點空格→點球標填入，點已填的空格球標回池，交卷後逐空顯示對錯與詳解。選空格依 沒考過 70／答錯 25／答對 5。紀錄與單字測驗同存 toeicQuizV1：空格鍵＝文章id|字|az|雜湊；一回總成績鍵＝A|文章id|時間（不影響「✓ 已通過」）。借用 quiz.js 的 qzRecord／qzDistract／qzWhyWord／qzHead／qzTabs 等，所以 quizart.js 要在 quiz.js 之後載入。',
  '■ 單字測驗題庫：每次開測驗時，從該篇「當下」的資料（核心單字 + extra_vocab 詳解）即時產生；新增單字只要有詳解就自動進題庫。',
  '■ 選題：各項目依 70% 沒考過 / 25% 答錯過 / 5% 答對過；不足時依 沒考過→答錯→答對（最久沒考的先）補。每個字每回隨機 1–3 題再換字，相鄰題避免同字、同題型。題數可選 10/15/20（約 10 分鐘）。',
  '■ 記錄：localStorage「toeicQuizV1」（跨裝置雲端同步，key 以 toeic 開頭）；題目 key＝「文章id|單字|題型|hash」；偏好在「qzPrefV1」（僅本機）。通過門檻 80%，通過後入口卡顯示「✓ 已通過」。',
  '■ 音檔：用 notes.js 的 vplay(qid, text, suf, fallback)；檔案 audio/daily/vocab/<slug(text)><suf>.mp3。suf：_en 英文解釋；_e{i} 例句；_c{i} 搭配例句；_fx{i} 詞形例句；_s{i} 多義例句；_cf{i} 易混淆例句；_sx{i} 近義例句；_mx{i} 相關字例句；_dx{i} 衍生字例句；空字串＝單字本身。',
  '■ 接點：daily.js 的 qzEntry(x)（入口卡，位於「語音練習」下方）、render 的 V map 的 quiz、離開頁面時呼叫 qzStopAudio()；notes.js 的 dnUp 把 quiz 視為子頁（返回鍵）。',
  '■ 改檔注意：原檔是 CRLF 換行（notes.js 有 12 行是 LF），請保留原換行，不要整檔轉換；請直接回傳「完整檔案」供我覆蓋。介面為繁體中文、Tailwind、純前端靜態網站。',
  '■ 維護提醒（給接手的 AI）：每次更新綜合測驗後，請一併檢查本頁「資料（給 AI）」的內容是否還正確——這份說明（QZ_AI_TEXT）和「需要提供的檔案」清單（QZ_FILES）——有變動就在同一次修改裡更新，並在回覆中告訴我改了哪些，這樣下一位 AI 拿到的資料才不會過時。'
].join('\n');
const QZ_FILES = [
  ['quiz.js', '綜合測驗全部的出題、選題、記錄和畫面邏輯都在這裡，大部分修改只動這個檔。', 1, ['quiz.js']],
  ['quizart.js', '綜合測驗「文章測驗」（目前是 A 文章克漏字）的挖空、球標、畫面、記錄都在這裡；會借用 quiz.js 的函式。', 1, ['quizart.js']],
  ['daily.js', '綜合測驗有三個地方接在這裡：入口卡片（qzEntry）、頁面登記（quiz）、離開頁面時停止播放。', 1, ['daily.js']],
  ['notes.js', '裡面有 quiz.js 用到的 vplay（播 mp3）、dnKey、dnExtraOf 等函式，還有返回鍵對 quiz 頁的處理。', 1, ['notes.js']],
  ['daily.html', '要看 quiz.js 的載入順序。', 1, ['daily.html']],
  ['daily.json 的一小段', '只貼一篇有 extra_vocab 的文章（例如 W1D1）即可，整個檔案太大不需要。複製的是目前這一篇（extra_vocab 只取前 5 筆）。', 1, 'json'],
  ['單字詳解 AI 提示檔', '說明每個詳解欄位的意思，AI 才知道能出哪些題型。複製的是目前這一篇第 1 個核心單字的提示詞（含完整欄位規則）。', 1, 'prompt'],
  ['speak.js、pron.js', '只有要做口說測驗時才需要。', 0, ['speak.js', 'pron.js']],
  ['audio.js、timing.js', '只有要改音檔命名或時間軸時才需要。', 0, ['audio.js', 'timing.js']]
];
function qzShowInfo() { QZ.st = 'info'; qzInfo(); window.scrollTo({ top: 0 }); }
function qzInfoBack() { QZ.st = 'setup'; qzSetup(); }
function qzInfo() {
  const back = `<button onclick="qzInfoBack()" class="${btn}">← 返回</button>`;
  main.innerHTML = qzHead('要請 AI 增修綜合測驗時，請提供這些資料', back)
    + `<div class="${card} p-4 mb-4"><p class="text-sm font-bold mb-2">① 需要提供的檔案</p><ul class="space-y-2 text-sm">${QZ_FILES.map((f, i) => `<li class="flex items-start gap-2"><span class="shrink-0">${f[2] ? '✅' : '➕'}</span><span class="flex-1 min-w-0"><b>${esc(f[0])}</b>${f[2] ? '' : ' <span class="text-xs text-slate-400">（視需求）</span>'}<br><span class="text-xs text-slate-500">${esc(f[1])}</span></span><button onclick="qzCopyFile(this,${i})" class="${btn} ${dnLine} !py-1 !px-2 text-xs shrink-0">📋 複製</button></li>`).join('')}</ul></div>`
    + `<div class="${card} p-4 mb-4"><div class="flex items-center justify-between gap-2 mb-2"><p class="text-sm font-bold">② 一鍵複製：貼給 AI 的說明</p><button onclick="qzCopyInfo(this)" class="${btn} ${dnPri}">📋 複製</button></div><textarea id="qzAiText" readonly rows="14" class="w-full text-xs leading-relaxed rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent p-2" onclick="this.select()">${esc(QZ_AI_TEXT)}</textarea><p class="text-xs text-slate-500 mt-2">貼上說明後，再把①的檔案一起附上即可。</p></div>`;
}
async function qzClip(t) { // 先用 clipboard API；不行（例如非 https）就用暫時的 textarea＋execCommand
  if (navigator.clipboard && navigator.clipboard.writeText) { try { await navigator.clipboard.writeText(t); return true; } catch (e) {} }
  const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok;
}
function qzJsonSample() { // daily.json 的一小段：目前這一篇，extra_vocab 只留前 5 筆
  const x = QZ.x; if (!x) return '';
  const o = {}; Object.keys(x).forEach(k => { if (k[0] !== '_') o[k] = x[k]; });
  const ev = Array.isArray(o.extra_vocab) ? o.extra_vocab : [], n = ev.length; o.extra_vocab = ev.slice(0, 5);
  return `【daily.json 的一小段：${idOf(x)}（extra_vocab 共 ${n} 筆，這裡只附前 ${o.extra_vocab.length} 筆）】\n` + JSON.stringify(o, null, 2);
}
async function qzFileText(f) {
  if (f === 'json') return qzJsonSample();
  if (f === 'prompt') { const x = QZ.x, v = x && (x.vocab || [])[0]; return v ? dnTempPrompt(idOf(x), [v]) : ''; }
  const out = [];
  for (const name of f) { const r = await fetch(name, { cache: 'no-store' }); if (!r.ok) throw new Error(name); out.push(`【檔案：${name}】\n` + await r.text()); }
  return out.join('\n\n');
}
async function qzCopyFile(b, i) {
  const f = QZ_FILES[i][3], o = b.dataset.o || b.textContent; b.dataset.o = o;
  const say = s => { b.textContent = s; clearTimeout(b._t); b._t = setTimeout(() => { b.textContent = o; }, 1500); };
  try {
    const t = await qzFileText(f);
    if (!t) { dnToast('這一篇沒有可複製的內容'); return; }
    if (await qzClip(t)) say('✓ 已複製'); else dnToast('無法複製（請用 https 或 localhost 開啟）');
  } catch (e) { dnToast('讀不到檔案：' + (e && e.message || e) + '（請用 https 或 localhost 開啟，不要直接開檔案）'); }
}
function qzCopyInfo(b) {
  const t = QZ_AI_TEXT, ok = () => { const o = b.textContent; b.textContent = '✓ 已複製'; setTimeout(() => { b.textContent = o; }, 1500); };
  const fb = () => { const ta = document.getElementById('qzAiText'); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { dnToast('請手動長按選取複製'); } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fb); else fb();
}
function qzToggle(k) { QZ.sec[k] = QZ.sec[k] ? 0 : 1; qzPrefSave(); qzSetup(); }
function qzSetN(v) { QZ.n = v; qzPrefSave(); qzSetup(); }
function qzPreset(p) { const m = { all: ['vocab', 'listen'], vocab: ['vocab'], listen: ['listen'] }[p]; QZ_SECS.forEach(([k]) => { QZ.sec[k] = m.includes(k) ? 1 : 0; }); qzPrefSave(); qzSetup(); }
function qzStart() {
  qzReload(); if (!QZ.pool) QZ.pool = qzBuild(QZ.x);
  const qs = qzSelect(QZ.pool, QZ.sec, QZ.n); if (!qs.length) { dnToast('沒有可出的題目'); return; }
  QZ.qs = qs; QZ.i = 0; QZ.picked = null; QZ.res = []; QZ.t0 = Date.now(); QZ.st = 'run'; qzStopAudio(); render(); window.scrollTo({ top: 0 });
}
function qzAgain() { QZ.pool = null; QZ.st = 'setup'; qzSetup(); qzStart(); }
function qzExit() { if (QZ.st === 'run' && QZ.res.length && !confirm('離開測驗？已作答的題目會保留紀錄，但這一回不會計入成績。')) return; qzStopAudio(); QZ.st = 'setup'; QZ.pool = null; render(); }
const QZ_BK = { never: ['新題', 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'], wrong: ['錯題複習', 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'], right: ['複習', 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'] };
function qzRun() {
  const q = QZ.qs[QZ.i], x = QZ.x, n = QZ.qs.length, si = qzSecInfo(q.sec), picked = QZ.picked, done = picked != null, bk = QZ_BK[q.bucket] || QZ_BK.never;
  const opt = (o, i) => {
    let c = 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800';
    if (done) c = i === q.ans ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 font-medium' : i === picked ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200' : 'border-slate-200 dark:border-slate-800 opacity-60';
    return `<div class="flex items-center gap-2"><button ${done ? 'disabled' : `onclick="qzAnswer(${i})"`} class="flex-1 text-left rounded-lg border px-4 py-3 md:py-2.5 text-sm ${c}"><span class="text-slate-400 mr-1">${'ABCD'[i]}.</span>${esc(o.t)}${done && i === q.ans ? ' <span class="text-emerald-600 font-bold">✓</span>' : ''}${done && i === picked && i !== q.ans ? ' <span class="text-rose-600 font-bold">✗</span>' : ''}</button>${o.au && (q.sec !== 'listen' || done) ? qzSpk(i) : ''}</div>`;
  };
  const ok = done && picked === q.ans;
  main.innerHTML = qzHead(`W${x.week}·D${x.day} ${x.tag || ''}`, `<button onclick="qzExit()" class="${btn} ${dnLine} !py-1.5 text-xs">離開</button>`)
    + `<div class="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden mb-3"><div class="h-full bg-indigo-500" style="width:${Math.round((QZ.i + (done ? 1 : 0)) / n * 100)}%"></div></div>
    <div class="${card} p-4 md:p-5"><div class="flex flex-wrap items-center gap-1.5 mb-3"><span class="${dnChip}">${QZ.i + 1} / ${n}</span><span class="${dnChip}">${si[1]} ${si[2]}</span><span class="${dnChip}">${esc(q.kind)}</span><span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 ${bk[1]}">${bk[0]}</span></div>
    ${q.au ? `<button onclick="qzPlay()" class="${btn} ${dnPri} mb-3">▶ ${done ? '再播一次' : '播放'}</button> <span class="text-xs text-slate-400">可以重複播放（鍵盤 P）</span>` : ''}
    <div class="flex items-start gap-2"><div class="flex-1 min-w-0">${q.stem}</div>${q.stemAu ? qzSpk("'s'") : ''}</div>
    <div class="space-y-2 mt-4">${q.opts.map(opt).join('')}</div>
    ${done ? `<div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 text-sm"><p class="font-semibold mb-2 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${ok ? '🎉 答對了' : '❌ 答錯了，正解是 ' + 'ABCD'[q.ans]}</p><div class="space-y-1 leading-relaxed">${q.why}</div>${q.sentAu ? `<button type="button" onclick="qzSay('f')" class="${btn} ${dnLine} !py-1.5 mt-3 text-xs">🔊 播放整句</button>` : ''}</div><button onclick="qzNext()" class="${btn} ${dnPri} w-full mt-4">${QZ.i + 1 >= n ? '看結果' : '下一題 →'}</button>` : ''}</div>`;
  if (!done && q.au && q.sec === 'listen') setTimeout(() => { if (QZ.st === 'run' && QZ.qs[QZ.i] === q && QZ.picked == null) qzPlay(); }, 250);
}
function qzAnswer(i) {
  const q = QZ.qs[QZ.i]; if (!q || QZ.picked != null) return;
  QZ.picked = i; const ok = i === q.ans; QZ.res.push({ q, i, ok }); qzRecord(q, ok);
  qzStopAudio(); qzRun();
  if (q.sec === 'vocab' && q.opts[q.ans] && q.opts[q.ans].au) setTimeout(() => { if (QZ.qs[QZ.i] === q) qzSay(q.ans); }, 150);
}
function qzNext() { qzStopAudio(); if (QZ.i + 1 >= QZ.qs.length) { qzSaveSession(QZ.a, QZ.res); QZ.st = 'result'; render(); window.scrollTo({ top: 0 }); return; } QZ.i++; QZ.picked = null; qzRun(); window.scrollTo({ top: 0 }); }
function qzResult() {
  const x = QZ.x, R = QZ.res, ok = R.filter(o => o.ok).length, n = R.length, pc = Math.round(ok / n * 100), pass = ok / n >= QZ_PASS;
  const bySec = QZ_SECS.map(([k, ic, nm]) => { const r = R.filter(o => o.q.sec === k); return r.length ? `<div class="flex items-center justify-between text-sm py-1"><span>${ic} ${nm}</span><span><b>${r.filter(o => o.ok).length}</b> / ${r.length}</span></div>` : ''; }).join('');
  const byB = ['never', 'wrong', 'right'].map(b => { const r = R.filter(o => o.q.bucket === b); return r.length ? `${QZ_BK[b][0]} ${r.filter(o => o.ok).length}/${r.length}` : ''; }).filter(Boolean).join(' ・ ');
  const bad = R.map((o, ri) => Object.assign({ ri }, o)).filter(o => !o.ok);
  main.innerHTML = qzHead(`W${x.week}·D${x.day} ${x.tag || ''}`) + `<div class="${card} p-5 mb-4 text-center"><div class="text-4xl font-bold ${pass ? 'text-emerald-600' : 'text-amber-600'}">${pc}%</div><div class="text-sm text-slate-500 mt-1">${ok} / ${n} 題${pass ? '・✓ 通過（≥ ' + Math.round(QZ_PASS * 100) + '%）' : '・再加油'}・用時 ${Math.max(1, Math.round((Date.now() - QZ.t0) / 60000))} 分鐘</div>
    <div class="mt-3 text-left max-w-xs mx-auto">${bySec}</div>${byB ? `<p class="text-xs text-slate-500 mt-2">${byB}</p>` : ''}
    <div class="flex flex-wrap justify-center gap-2 mt-4"><button onclick="qzAgain()" class="${btn} ${dnPri}">再考一回</button><button onclick="QZ.st='setup';QZ.pool=null;render()" class="${btn} ${dnLine}">調整項目</button><button onclick="up()" class="${btn} ${dnLine}">回到文章</button></div></div>`
    + (bad.length ? `<h3 class="font-bold text-sm mb-2">答錯的題目（${bad.length}）</h3><div class="space-y-3">${bad.map(o => `<div class="${card} p-4 text-sm"><div class="flex flex-wrap gap-1.5 mb-2"><span class="${dnChip}">${qzSecInfo(o.q.sec)[1]} ${esc(o.q.kind)}</span></div>${o.q.stem}<p class="mt-2 text-rose-600 dark:text-rose-400">你選：${esc(o.q.opts[o.i].t)}</p><p class="text-emerald-700 dark:text-emerald-300">正解：${esc(o.q.opts[o.q.ans].t)} ${o.q.opts[o.q.ans].au ? qzSpk(o.q.ans, 'text-base align-middle', o.ri) : ''}</p>${o.q.au ? `<p class="mt-1">${qzSpk("'a'", 'text-base align-middle', o.ri)} <span class="text-xs text-slate-400">播放音檔</span></p>` : ''}${o.q.sentAu ? `<p class="mt-1">${qzSpk("'f'", 'text-base align-middle', o.ri)} <span class="text-xs text-slate-400">播放整句</span></p>` : ''}<div class="mt-2 text-slate-600 dark:text-slate-300 leading-relaxed">${o.q.why}</div></div>`).join('')}</div>` : '<p class="text-center text-emerald-600 font-semibold">全對！🎉</p>');
}
document.addEventListener('keydown', e => {
  if (typeof cur === 'undefined' || cur.view !== 'quiz' || QZ.st !== 'run' || /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '')) return;
  const q = QZ.qs[QZ.i]; if (!q) return;
  if (QZ.picked == null) { if (/^[1-4]$/.test(e.key) && q.opts[+e.key - 1]) { e.preventDefault(); qzAnswer(+e.key - 1); } else if (e.key === 'p' || e.key === 'P') { if (q.au) qzPlay(); else if (q.stemAu) qzSay('s'); } }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); qzNext(); }
});
