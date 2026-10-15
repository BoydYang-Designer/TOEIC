/* newwords.js — TOEIC Daily Coach 的「🆕 新單字」
   載入順序：audio.js → timing.js → speak.js → notes.js → newwords.js → tsl.js → daily.js
   依賴（執行時才用到）：daily.js／notes.js 的全域 S／save／cur／DATA／idOf／esc／card／btn／main／render／speak／spStop／skStopAll／auCopy／
   dnKey／dnId／dnArr／dnArts／dnArt／dnMarks／dnBanked／dnExtraOf／dnFindExtra／dnFindExtraAny／dnExtraSrc／dnCtxOf／dnPrompt／dnModal／dnClose／dnToast／dnNav／dnGoArt／dnOpenExtra／dnInp／dnLine／dnPri／dnSm／dnChip／tslMap／tslNz

   資料：localStorage 鍵 toeicNewWordsV1（鍵名以 toeic 開頭 → cloud-sync.js 會自動同步；是「每筆都有 id 的陣列」，兩台裝置都有新增時會依 id 自動合併，不會跳衝突視窗）
     { id:'n…', text, type:'word|phrase', note, created, updated, t, base:[建立當下已有的文章 id], noauto?, own? }
     own＝1：想讓這個字獨立產生詳解，不要當成「收在別的字的屈折變化／衍生字裡」。它維持「待採用」，等新文章採用後才入庫（掛在那篇新文章底下）
   寫回主檔（daily.json）的欄位：extra_vocab 每筆可加 nw_done:[{ id, result:'added|covered|unclear', fix? }]
     → 由「入庫彙整」產生的 AI 提示詞要求 AI 回傳；網頁看到 nw_done 含該 id，就把這個新單字標為「已更新、可移除」。

   新單字的狀態（nwStatus）
     pending     待採用：還沒被任何文章採用、也還不在庫 → 會列進「新增文章」提示詞的「我的新單字」（優先於 TSL 候選字）
     waitdetail  已入庫、等 AI 詳解：有備註，但詳解還沒寫回 → 備註會隨詳解提示詞交給 AI
     supplement  待補充詳解：已有詳解，但備註還沒被 AI 處理 → 在「入庫彙整」的「新單字補充」複製提示詞
     updated     已更新：AI 已處理備註（added／covered／unclear）→ 可移除
     removable   已被文章採用或已在庫，且沒有備註要處理 → 可移除 */

const NW_KEY = 'toeicNewWordsV1';
const NW_OWN_NOTE = '使用者要求：請當成獨立入庫項目寫完整詳解，lemma 用它自己，不要併進其他字的詳解';
const NW_POOL = 6; // 每篇新文章最多優先帶入幾個新單字
let NW = null, NW_TM = null, NW_REC = null;
const nwList = () => { if (NW) return NW; try { NW = JSON.parse(localStorage.getItem(NW_KEY) || '[]'); } catch (e) { NW = []; } if (!Array.isArray(NW)) NW = []; return NW; };
const nwSave = () => { try { localStorage.setItem(NW_KEY, JSON.stringify(nwList())); } catch (e) {} };
const nwTouch = n => { n.updated = Date.now(); n.t = n.updated; };
const nwHasNote = n => !!String(n.note || '').trim();

/* ---------- 舊「單字紀錄」（index.html 舊版，鍵 toeicVocabV1）→ 併入新單字 ----------
   id 固定為 'nv_' + 舊 id：每台裝置各搬一次也不會重複（雲端同步依 id 合併）。舊鍵不動，當備份。
   nwMigratedV1（不以 toeic 開頭 → 不同步）記這台裝置搬過哪些，搬過後你刪掉新單字也不會又被加回來。 */
function nwMigrate() {
  let old; try { old = JSON.parse(localStorage.getItem('toeicVocabV1') || '[]'); } catch (e) { return 0; }
  if (!Array.isArray(old) || !old.length) return 0;
  let done = []; try { done = JSON.parse(localStorage.getItem('nwMigratedV1') || '[]'); } catch (e) {}
  const doneSet = new Set(done), have = new Set(nwList().map(n => n.id)), base = DATA.map(idOf);
  let add = 0;
  old.slice().reverse().forEach(o => {
    if (!o || !o.id || doneSet.has(o.id)) return;
    doneSet.add(o.id);
    const text = nwNormText(o.word), note = String(o.note || '').trim(), id = 'nv_' + o.id;
    if (!text || have.has(id)) return;
    if (nwList().some(n => dnKey(n.text) === dnKey(text) && String(n.note || '').trim() === note)) return;
    const tm = Number(o.t) || Date.now();
    nwList().push({ id, text, type: /\s/.test(text) ? 'phrase' : 'word', note, created: tm, updated: tm, t: tm, base });
    have.add(id); add++;
  });
  try { localStorage.setItem('nwMigratedV1', JSON.stringify([...doneSet])); } catch (e) {}
  if (add) { nwSave(); if (typeof dnToast === 'function') dnToast('已把舊「單字紀錄」的 ' + add + ' 個字併入新單字'); }
  return add;
}

/* ---------- 比對工具 ---------- */
function nwTslHit(text) { // TSL 核心單字（含 -s／-ed／-ing 等變化形）→ { w, r } 或 null
  if (typeof TSL_WORDS === 'undefined' || typeof tslMap !== 'function') return null;
  if (!NW_TM) NW_TM = tslMap();
  return (NW_TM && NW_TM.get(tslNz(text))) || null;
}
const nwEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function nwTok(t) { // 單字 → 含常見屈折變化的樣式
  const b = nwEsc(t), a = [b + '(?:s|es|d|ed|ing|er|ers|ly)?'];
  if (/e$/.test(t)) a.push(nwEsc(t.slice(0, -1)) + '(?:ing|er|ers)');
  if (/[^aeiou]y$/.test(t)) a.push(nwEsc(t.slice(0, -1)) + '(?:ies|ied|ier|ily)');
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(t)) a.push(b + t.slice(-1) + '(?:ed|ing|er|ers)');
  return '(?:' + a.join('|') + ')';
}
function nwRe(text) {
  const w = String(text).toLowerCase().match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/g) || [];
  if (!w.length) return null;
  try { return new RegExp('\\b' + w.map(nwTok).join('[\\s-]+') + '\\b', 'i'); } catch (e) { return null; }
}
function nwFindArt(n) { // 這個新單字被哪一篇文章採用：核心單字／詳解（一律算）、文稿裡出現（只算建立之後才有的文章）
  const k = dnKey(n.text), base = new Set(n.base || []);
  for (const a of dnArts()) {
    if ((a.vocab || []).some(v => dnKey(v.word) === k)) return { x: a, via: 'vocab' };
    if (dnFindExtra(a, n.text)) return { x: a, via: 'extra' };
  }
  const re = nwRe(n.text); if (!re) return null;
  for (const a of dnArts()) {
    if (base.has(idOf(a))) continue;
    const m = re.exec(String(a.passage || '')); if (m) return { x: a, via: 'passage', hit: m[0], from: m.index };
  }
  return null;
}
function nwCovered(text) { // 這個拼法已收在別的字詳解的屈折變化／衍生字裡
  const k = dnKey(text);
  for (const a of dnArts()) for (const e of dnExtraOf(a)) if (dnArr(e.forms).concat(dnArr(e.derived)).some(f => f && f.w && dnKey(f.w) === k)) return { a, e };
  return null;
}
function nwBanked(n) { // 已在庫：入庫清單／核心單字／詳解，或收在別的字的屈折變化
  const b = dnBanked(n.text); if (b) return b;
  const m = dnMarks().find(q => q.nw === n.id); if (m) return { where: 'mark', qid: m.qid };
  const c = n.own ? null : nwCovered(n.text); if (c) return { where: 'forms', qid: idOf(c.a), lemma: c.e.text };
  return null;
}
const nwDoneRec = n => { for (const a of dnArts()) for (const e of dnExtraOf(a)) { const o = dnArr(e.nw_done).find(q => q && q.id === n.id); if (o) return { a, e, o }; } return null; };
function nwEntry(n) { // 這個新單字對應的詳解：{ a: 詳解所在文章, e: extra_vocab 那一筆 } 或 null
  const d = nwDoneRec(n); if (d) return { a: d.a, e: d.e };
  const k = dnKey(n.text);
  for (const a of dnArts()) for (const e of dnExtraOf(a)) if (dnKey(e.text || e.word) === k || (e.lemma && dnKey(e.lemma) === k)) return { a, e };
  const m = dnMarks().find(q => q.nw === n.id);
  if (m) { const x = dnArt(m.qid), s = x && dnExtraSrc(x, m.text); if (s) return { a: s, e: dnFindExtra(s, m.text) }; }
  const c = n.own ? null : nwCovered(n.text); if (c) return c;
  return null;
}
function nwStatus(n) {
  const ent = nwEntry(n), art = nwFindArt(n), bk = nwBanked(n), rec = nwDoneRec(n), note = nwHasNote(n);
  const adopted = !!(art || bk || ent);
  let st;
  if (!adopted) st = 'pending';
  else if (note) st = ent ? (rec ? 'updated' : 'supplement') : 'waitdetail';
  else st = 'removable';
  return { st, art, bk, ent, rec, note, tsl: nwTslHit(n.text) };
}
const nwIsDone = n => !!nwDoneRec(n);
function nwNotesFor(m) { // 這筆入庫項目還沒被 AI 處理的新單字備註
  const ks = new Set([dnKey(m.text)].concat(m.keys || [])), ids = new Set(Array.isArray(m.nw) ? m.nw : (m.nw ? [m.nw] : []));
  return nwList().filter(n => nwHasNote(n) && (ids.has(n.id) || ks.has(dnKey(n.text))) && !nwIsDone(n));
}
function nwNoteTxt(m) { // 提示詞「要寫的項目」每一行後面接的備註
  let t = m.note ? `｜我的備註：${m.note}` : '';
  nwNotesFor(m).forEach(n => { t += `｜新單字備註[id=${n.id}]：${String(n.note).trim().replace(/\s+/g, ' ')}`; });
  return t;
}
const nwRules = () => [
  '【新單字備註（很重要）】',
  '- 標有「新單字備註[id=…]」的項目，備註是使用者自己記下的疑問或想學的重點，可能是語音輸入，會有錯字、同音字或中英夾雜（例如把 affect 打成 effect）。請先結合該單字與文章，判斷使用者真正想問什麼；看不懂、或明顯與該單字無關，就不要硬猜。',
  '- 備註主要用來決定「詳解要補強什麼」（用法、文法、易混淆、搭配、記憶方式…），請放進適當的欄位，格式與程度照上面的規則；不要把備註原文貼進去。',
  '- 如果備註想知道的內容，原本的詳解（或你這次要寫的內容）已經涵蓋，就不要為了回應備註硬加新的、也不要重複；一樣算處理完成。',
  '- 每一筆含新單字備註的項目，都要多一個 "nw_done" 陣列，每一條備註各一筆：{ "id": "（備註的 id）", "result": "added｜covered｜unclear", "fix": "（選填）你判斷備註裡打錯的字，例如 effect→affect" }。added＝已補進詳解；covered＝原本就有，沒有新增；unclear＝看不懂或無關，沒有處理。若該筆原本已有 nw_done，既有的一律保留，再加上這次的。',
  ''
];

/* ---------- 自動入庫：非核心單字被文章採用（只出現在文稿裡）→ 自動加入入庫清單，之後用「入庫彙整」請 AI 補詳解 ---------- */
function nwAutoMark() {
  let add = 0; const now = Date.now();
  nwList().forEach(n => {
    if (n.noauto || dnMarks().some(m => m.nw === n.id) || dnBanked(n.text) || (!n.own && nwCovered(n.text))) return;
    const a = nwFindArt(n); if (!a || a.via !== 'passage') return;
    const text = a.hit, p = String(a.x.passage || '');
    if (dnMarks().some(m => dnKey(m.text) === dnKey(text))) return;
    dnMarks().push({ id: dnId('m'), qid: idOf(a.x), text, type: /\s/.test(text.trim()) ? 'phrase' : 'word', ctx: dnCtxOf(p, a.from, a.from + text.length, text), from: a.from, to: a.from + text.length, note: n.own ? NW_OWN_NOTE : '', nw: n.id, auto: 1, created: now, updated: now });
    add++;
  });
  if (add) { save(); dnToast(`新單字已被文章採用，自動入庫 ${add} 個`); }
  return add;
}
function nwOnMarkDel(markId) { // 使用者自己刪掉自動入庫的項目 → 不要再自動加回來
  const m = dnMarks().find(q => q.id === markId); if (!m || !m.nw) return;
  const n = nwList().find(q => q.id === m.nw); if (n) { n.noauto = 1; nwTouch(n); nwSave(); }
}

/* ---------- 補充區：已有詳解、但備註還沒被 AI 處理的新單字 ---------- */
function nwSupGroups() {
  const by = new Map();
  nwList().forEach(n => {
    const s = nwStatus(n); if (s.st !== 'supplement' || !s.ent) return;
    const e = s.ent.e, a = s.ent.a, qid = idOf(a), ek = dnKey(e.text || e.word);
    const g = by.get(qid) || { qid, a, ents: new Map() }; by.set(qid, g);
    const it = g.ents.get(ek) || { e, ns: [] }; g.ents.set(ek, it); it.ns.push(n);
  });
  return Array.from(by.values()).sort((p, q) => p.a.week - q.a.week || p.a.day - q.a.day);
}
function nwSupItems(g) {
  return Array.from(g.ents.values()).map(({ e, ns }) => {
    const text = String(e.text || e.word).trim(), type = e.type || (/\s/.test(text) ? 'phrase' : 'word'), p = String(g.a.passage || ''), i = p.toLowerCase().indexOf(text.toLowerCase());
    const m = { id: '~nw-' + dnKey(text), qid: g.qid, text, type, ctx: type === 'sentence' ? text : (i >= 0 ? dnCtxOf(p, i, i + text.length, text) : text), note: '', nw: ns.map(n => n.id), keys: ns.map(n => dnKey(n.text)).concat(e.lemma ? [dnKey(e.lemma)] : []) };
    return { m, fill: ['nwnote'] };
  });
}
function nwSupPrompt(qid, rng) { const g = nwSupGroups().find(q => q.qid === qid); if (!g) return ''; const its = nwSupItems(g); return dnPrompt(qid, new Set(), false, rng ? its.slice(rng[0], rng[1]) : its); }
function nwSupCopy(qid) {
  const g = nwSupGroups().find(q => q.qid === qid); if (!g) return;
  const its = nwSupItems(g), b = dnBatchPick('sup:' + qid, its.map(o => o.m.id).join(','), its.length), t = nwSupPrompt(qid, b.nb > 1 ? [b.lo, b.hi] : null); if (!t) return;
  auCopy(t); dnToast(b.nb > 1 ? dnBatchMsg(b, b.hi - b.lo) : '已複製新單字補充提示詞，貼給 AI');
}
function nwSupSec() { // 掛在「入庫彙整」頁與「新單字」頁
  const gs = nwSupGroups(); if (!gs.length) return '';
  const n = gs.reduce((s, g) => s + Array.from(g.ents.values()).reduce((t, it) => t + it.ns.length, 0), 0);
  return `<section class="${card} p-4 mb-4"><h3 class="font-bold text-sm">🆕 新單字補充 <span class="text-xs font-normal text-slate-400">${n}</span></h3>
    <p class="text-xs text-slate-500 mt-1 leading-relaxed">這些字已經有詳解，但你記的備註還沒被 AI 處理。按「複製 AI 提示詞」會連同現有詳解與備註交給 AI：AI 會判斷備註有沒有打錯字、原詳解是否已經涵蓋，需要才補，處理完會回傳 nw_done；合併進 daily.json 後，新單字就會顯示「已更新」。</p><div class="mt-2">${dnCapCtl()}</div>`
    + gs.map(g => `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><div class="flex flex-wrap items-center justify-between gap-2"><button onclick="dnGoArt('${g.qid}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(g.qid))}</button><button onclick="nwSupCopy('${g.qid}')" class="${btn} ${dnPri} !py-1 !px-2.5 text-xs">複製 AI 提示詞（${g.ents.size}${dnCapTag(g.ents.size)}）</button></div>
      <div class="mt-2 space-y-1.5">${Array.from(g.ents.values()).map(it => `<div class="text-xs"><button onclick="dnOpenExtra('${g.qid}',this.dataset.t)" data-t="${esc(it.e.text || it.e.word)}" class="font-bold underline decoration-dotted cursor-pointer">${esc(it.e.text || it.e.word)}</button>${it.ns.map(x => `<p class="text-amber-700 dark:text-amber-300 break-words">備註：${esc(x.note)}</p>`).join('')}</div>`).join('')}</div></div>`).join('')
    + `</section>`;
}

/* ---------- 新增文章提示詞：我的新單字（優先）---------- */
function nwPending() { return nwList().map(n => ({ n, s: nwStatus(n) })).filter(o => o.s.st === 'pending').sort((a, b) => (a.n.created || 0) - (b.n.created || 0)).slice(0, NW_POOL); }
function nwPoolKeys() { return new Set(nwPending().map(o => tslNz(o.n.text))); } // 供 tslUnused 排除：已列為新單字的字，不要再當 TSL 候選字重複出現
function nwGenLines() {
  const ps = nwPending(); if (!ps.length) return [];
  const L = ['【我的新單字（優先採用）】', `・以下是使用者自己遇到、想學的新單字／片語（${ps.length} 個，依加入順序）。請「優先」把它們自然地寫進本篇 passage，優先順序高於下方的 TSL 候選單字：`];
  ps.forEach(({ n, s }, i) => L.push(`  ${i + 1}. ${n.text}（${n.type === 'phrase' ? '片語' : '單字'}｜${s.tsl ? 'TSL 核心單字 #' + s.tsl.r : '非 TSL 核心單字'}）` + (nwHasNote(n) ? `｜備註：${String(n.note).trim().replace(/\s+/g, ' ')}` : '') + (n.own ? '｜獨立詳解：請當成獨立項目，lemma 用它自己，不併進其他字' : '')));
  L.push('・情境真的放不進本篇主題的字可以跳過，不要硬塞（沒用到的會留給之後的文章）；單字可用原形或自然的屈折變化，片語要照原樣出現在 passage 裡。',
    '・標「TSL 核心單字」的字：除了寫進 passage，也要放進 vocab（算在 vocab 總數 3–6 個之內，並優先於 TSL 候選單字）。',
    '・標「非 TSL 核心單字」的字：寫進 passage 即可，不要放進 vocab；文章合併進 daily.json 後，網頁會自動把它入庫，之後再用「入庫彙整」請 AI 補詳解。',
    '・備註主要是之後補詳解用的（使用者的疑問或想學的用法），是否反映在文章裡由你判斷：例如備註說想學某個用法，可以讓文章剛好用到；備註可能有錯字（語音輸入），請自行判斷原意，不要把備註原文抄進文章。', '');
  return L;
}
function nwGenPanel() {
  const ps = nwPending();
  return `<div class="rounded-lg border border-slate-200 dark:border-slate-800 p-3 mb-3 text-xs"><p class="font-bold mb-1">🆕 我的新單字（優先帶入提示詞）</p>${ps.length
    ? `<div class="flex flex-wrap gap-1 mb-1">${ps.map(({ n, s }) => `<span class="inline-block rounded-full px-2 py-0.5 ${s.tsl ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' : 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'}" title="${s.tsl ? 'TSL 核心單字：會放進 vocab' : '非核心單字：只寫進文章，之後自動入庫'}">${esc(n.text)}${nwHasNote(n) ? ' 📝' : ''}</span>`).join('')}</div><p class="text-slate-500">藍色＝TSL 核心單字（會放進 vocab）；紫色＝非核心單字（只寫進文章，合併後自動入庫）；📝＝有備註。最多帶 ${NW_POOL} 個，其餘留給之後的文章。</p>`
    : '<p class="text-slate-500">目前沒有待採用的新單字。</p>'}</div>`;
}

/* ---------- 語音輸入（Web Speech API）---------- */
const nwCleanWord = t => String(t || '').toLowerCase().replace(/[.,!?;:"“”()]+/g, ' ').replace(/\s+/g, ' ').trim();
function nwMic(id, lang, btnEl) { // 再按一次＝停止
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { dnToast('這個瀏覽器不支援語音輸入，可改用手機鍵盤上的麥克風'); return; }
  if (NW_REC) { try { NW_REC.stop(); } catch (e) {} return; }
  const el = document.getElementById(id); if (!el) return;
  try { if (typeof spStop === 'function') spStop(); if (typeof skStopAll === 'function') skStopAll(); speechSynthesis.cancel(); } catch (e) {}
  const isW = el.tagName === 'INPUT', keep = isW ? '' : el.value, r = new SR(), alt = document.getElementById('nw-alt');
  r.lang = lang; r.interimResults = true; r.maxAlternatives = 5; r.continuous = false;
  const rest = () => { NW_REC = null; if (btnEl) { btnEl.textContent = '🎤'; btnEl.classList.remove('animate-pulse', 'text-rose-600'); } };
  r.onstart = () => { if (btnEl) { btnEl.textContent = '⏹'; btnEl.classList.add('animate-pulse', 'text-rose-600'); } if (alt && isW) alt.innerHTML = ''; };
  r.onresult = ev => {
    const res = ev.results[ev.results.length - 1], t = String(res[0].transcript || '');
    if (isW) {
      el.value = nwCleanWord(t);
      if (res.isFinal && alt && el.id === 'nw-w') { const seen = new Set([el.value]), opts = []; for (let i = 1; i < res.length; i++) { const c = nwCleanWord(res[i].transcript); if (c && !seen.has(c)) { seen.add(c); opts.push(c); } } alt.innerHTML = opts.length ? `<span class="text-xs text-slate-500 self-center">其他可能：</span>` + opts.map(c => `<button onclick="nwPickAlt(this.dataset.w)" data-w="${esc(c)}" class="${dnSm}">${esc(c)}</button>`).join('') : ''; }
    } else el.value = (keep ? keep.replace(/\s+$/, '') + ' ' : '') + t.trim();
    nwDraftSync(); nwHint();
  };
  r.onerror = ev => { const m = { 'not-allowed': '麥克風權限被拒絕，請到瀏覽器設定允許', 'service-not-allowed': '麥克風權限被拒絕，請到瀏覽器設定允許', 'no-speech': '沒聽到聲音，再按一次麥克風', 'audio-capture': '找不到麥克風', 'network': '語音辨識需要網路' }[ev.error]; if (m) dnToast(m); };
  r.onend = rest;
  NW_REC = r; try { r.start(); } catch (e) { rest(); }
}
function nwPickAlt(w) { const el = document.getElementById('nw-w'); if (!el) return; el.value = w; const a = document.getElementById('nw-alt'); if (a) a.innerHTML = ''; nwDraftSync(); nwHint(); }

/* ---------- 新增／編輯／移除 ---------- */
DN.nwDraft = DN.nwDraft || { w: '', n: '' }; DN.nwTab = DN.nwTab || 'all';
function nwDraftSync() { const w = document.getElementById('nw-w'), n = document.getElementById('nw-n'); if (w) DN.nwDraft.w = w.value; if (n) DN.nwDraft.n = n.value; }
const nwNormText = t => { t = String(t || '').trim().replace(/\s+/g, ' '); return /^[A-Z][a-z'’-]+$/.test(t) ? t.toLowerCase() : t; };
function nwHint() {
  const el = document.getElementById('nw-w'), h = document.getElementById('nw-hint'); if (!el || !h) return;
  const t = nwNormText(el.value); if (!t || !/[A-Za-z]/.test(t)) { h.innerHTML = ''; return; }
  const row = (c, s) => `<span class="block ${c}">${s}</span>`, out = [], tsl = nwTslHit(t);
  if (nwList().some(n => dnKey(n.text) === dnKey(t))) out.push(row('text-amber-600 dark:text-amber-400', '⚠ 這個字已經在新單字清單裡（有不同的備註才能再加一筆）'));
  const bk = dnBanked(t), cv = nwCovered(t);
  if (bk) out.push(row('text-emerald-600 dark:text-emerald-400', `✔ 已是入庫單字：${bk.where === 'vocab' ? '文章核心單字' : bk.where === 'extra' ? '已有詳解' : '在入庫清單'}（${esc(dnArtLabel(bk.qid))}）。仍可加入，備註會用來請 AI 補充詳解。`));
  else if (cv) out.push(row('text-emerald-600 dark:text-emerald-400', `✔ 已收在「${esc(cv.e.text)}」詳解的屈折變化／衍生字裡。仍可加入；想讓它獨立產生詳解，加入後按該列的「單獨入庫」（會等新文章採用後再入庫）。`));
  out.push(row('text-slate-500', tsl ? `多益核心單字（TSL #${tsl.r}）：新增文章時優先排進文章與核心單字。` : '不是 TSL 核心單字：文章採用後會自動入庫。'));
  h.innerHTML = out.join('');
}
function nwAdd() {
  nwDraftSync(); const t = nwNormText(DN.nwDraft.w), note = String(DN.nwDraft.n || '').trim();
  if (!t) { dnToast('請先輸入單字'); return; }
  if (!/[A-Za-z]/.test(t) || /[\u4e00-\u9fff]/.test(t)) { dnToast('請輸入英文單字或片語'); return; }
  if (t.length > 80) { dnToast('太長了，新單字請輸入單字或短片語（句子請在文稿上選取入庫）'); return; }
  const dup = nwList().filter(n => dnKey(n.text) === dnKey(t));
  if (dup.length && (!note || dup.some(n => String(n.note || '').trim() === note))) { dnToast('這個字已經在新單字清單裡'); return; }
  const now = Date.now();
  nwList().push({ id: dnId('n'), text: t, type: /\s/.test(t) ? 'phrase' : 'word', note, created: now, updated: now, t: now, base: DATA.map(idOf) });
  nwSave(); DN.nwDraft = { w: '', n: '' };
  const s = nwStatus(nwList()[nwList().length - 1]);
  dnToast(s.st === 'pending' ? '已加入新單字' : '已加入（這個字已在庫' + (nwHasNote(nwList()[nwList().length - 1]) ? '，備註會用來補充詳解）' : '）'));
  render();
}
function nwDel(id) {
  const n = nwList().find(q => q.id === id); if (!n) return;
  const st = nwStatus(n).st;
  if ((st === 'pending' || st === 'supplement' || st === 'waitdetail') && !confirm('這個新單字還沒完成（' + NW_ST[st].label + '），確定要移除嗎？')) return;
  NW = nwList().filter(q => q.id !== id); nwSave(); dnClose(); render();
}
function nwRemoveDone() {
  const done = nwList().filter(n => { const s = nwStatus(n).st; return s === 'removable' || s === 'updated'; });
  if (!done.length) { dnToast('沒有可移除的'); return; }
  if (!confirm(`移除 ${done.length} 個已完成的新單字？`)) return;
  const ids = new Set(done.map(n => n.id)); NW = nwList().filter(n => !ids.has(n.id)); nwSave(); render();
}
function nwEdit(id) {
  const n = nwList().find(q => q.id === id); if (!n) return; DN.nwEd = id;
  dnModal(`<div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">🆕 編輯新單字</h2><button onclick="dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <label class="block text-xs text-slate-500 mb-1">單字／片語</label><div class="flex gap-2 mb-3"><input id="nw-ew" value="${esc(n.text)}" autocapitalize="none" autocomplete="off" spellcheck="false" class="${dnInp} flex-1"><button onclick="nwMic('nw-ew','en-US',this)" class="${btn} ${dnLine} !px-3" aria-label="語音輸入">🎤</button></div>
    <label class="block text-xs text-slate-500 mb-1">備註（給 AI 補詳解用；改了備註會重新列入「待補充」）</label><div class="flex gap-2 items-start mb-3"><textarea id="nw-en" rows="3" class="${dnInp} flex-1">${esc(n.note || '')}</textarea><button onclick="nwMic('nw-en','zh-TW',this)" class="${btn} ${dnLine} !px-3" aria-label="語音輸入">🎤</button></div>
    <div class="flex justify-between"><button onclick="nwDel('${n.id}')" class="${btn} text-rose-500">移除</button><button onclick="nwEditSave()" class="${btn} ${dnPri}">儲存</button></div></div>`);
}
function nwEditSave() {
  const n = nwList().find(q => q.id === DN.nwEd); if (!n) return dnClose();
  const t = nwNormText((document.getElementById('nw-ew') || {}).value), note = String((document.getElementById('nw-en') || {}).value || '').trim();
  if (!t || !/[A-Za-z]/.test(t) || /[\u4e00-\u9fff]/.test(t)) { dnToast('請輸入英文單字或片語'); return; }
  if (note !== String(n.note || '').trim()) { const old = n.id; n.id = dnId('n'); dnMarks().forEach(m => { if (m.nw === old) m.nw = n.id; }); save(); } // 備註改了 → 換新 id，舊的「已更新」紀錄就不再算數
  n.text = t; n.type = /\s/.test(t) ? 'phrase' : 'word'; n.note = note; nwTouch(n); nwSave(); dnClose(); render();
}
function nwTab(t) { DN.nwTab = t; nwRefresh(); }

/* ---------- 畫面 ---------- */
const NW_ST = {
  pending: { label: '待採用', c: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  waitdetail: { label: '等 AI 詳解', c: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  supplement: { label: '待補充詳解', c: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
  updated: { label: '已更新・可移除', c: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  removable: { label: '已入庫・可移除', c: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' }
};
const NW_RES = { added: 'AI 已把備註補進詳解', covered: '原詳解已涵蓋備註，沒有重複新增', unclear: 'AI 看不懂備註，沒有處理' };
function nwCounts() {
  const c = { all: 0, pending: 0, todo: 0, rem: 0 };
  nwList().forEach(n => { const s = nwStatus(n).st; c.all++; if (s === 'pending') c.pending++; else if (s === 'waitdetail' || s === 'supplement') c.todo++; else c.rem++; });
  return c;
}
const nwBtn = () => `<button onclick="dnNav('nw')" class="${btn} w-full mt-2 ${dnLine} ${cur.view === 'nw' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">🆕 新單字（${nwList().length}）</button>`;
const nwMobBtn = () => `<button onclick="dnNav('nw')" class="${btn} ${dnLine} !py-1.5" aria-label="新單字">🆕</button>`;
function nwWhere(s) {
  if (s.art) return `${s.art.via === 'vocab' ? '文章核心單字' : s.art.via === 'extra' ? '已有詳解' : '文稿裡用到'}：<button onclick="dnGoArt('${idOf(s.art.x)}')" class="underline cursor-pointer">${esc(dnArtLabel(idOf(s.art.x)))}</button>`;
  if (s.bk) return s.bk.where === 'forms' ? `收在「${esc(s.bk.lemma)}」詳解的屈折變化／衍生字` : `在庫：<button onclick="dnGoArt('${s.bk.qid}')" class="underline cursor-pointer">${esc(dnArtLabel(s.bk.qid))}</button>`;
  return '';
}
/* 單獨入庫（獨立詳解）：這個字被判定收在別的字的屈折變化／衍生字裡，但想讓它自己產生詳解。
   不綁舊文章：只是加上 own 旗標 → 維持「待採用」，等新文章採用後才入庫（掛在那篇新文章底下，所在句用新文章的）。再按一次＝取消。 */
function nwOwn(id) {
  const n = nwList().find(q => q.id === id); if (!n) return;
  n.own = n.own ? 0 : 1; nwTouch(n); nwSave();
  dnToast(n.own ? '已設為獨立詳解：等新文章採用後入庫' : '已取消獨立詳解');
  nwRefresh();
}
/* 在別篇再入庫「已有詳解」的字 → 建一筆新單字，備註帶這篇的所在句 → 進「待補充詳解」，AI 看現有詳解判斷要不要補 */
function nwAddSupplement(s, ctx, art) {
  const t = nwNormText(s.text);
  if (!t || !/[A-Za-z]/.test(t) || /[\u4e00-\u9fff]/.test(t) || t.length > 80) return false;
  const lab = art ? dnLabel(art) : '另一篇', note = `${lab} 又出現「${t}」，所在句：「${String(ctx || t).trim().replace(/\s+/g, ' ')}」。請看現有詳解有沒有涵蓋這裡的用法（詞性、意思、搭配），沒有才補。`;
  if (nwList().some(n => dnKey(n.text) === dnKey(t) && String(n.note || '').trim() === note)) return false;
  const now = Date.now();
  nwList().push({ id: dnId('n'), text: t, type: /\s/.test(t) ? 'phrase' : 'word', note, created: now, updated: now, t: now, base: DATA.map(idOf) });
  nwSave(); return true;
}
function nwRow(n) {
  const s = nwStatus(n), st = NW_ST[s.st], done = s.st === 'updated' || s.st === 'removable';
  const msg = {
    pending: s.tsl ? `多益核心單字（TSL #${s.tsl.r}）：新增文章時優先排進文章與核心單字` : '非核心單字：被文章採用後會自動入庫',
    waitdetail: '已入庫、詳解還沒寫回：備註會隨詳解提示詞一起交給 AI（到「📌 入庫彙整」複製）',
    supplement: '已有詳解、備註還沒處理：到「📌 入庫彙整」的「新單字補充」複製提示詞',
    updated: s.rec ? esc(NW_RES[s.rec.o.result] || '已處理') + (s.rec.o.fix ? `（AI 判斷備註有誤字：${esc(s.rec.o.fix)}）` : '') : '',
    removable: '已被文章採用或已在庫'
  }[s.st] + (n.own && s.st === 'pending' ? '<br>獨立詳解：等新文章採用後入庫，不併入其他字的詳解' : ''), wh = nwWhere(s);
  return `<div class="py-3 flex items-start gap-2">
    <button onclick="speak(this.dataset.t)" data-t="${esc(n.text)}" class="text-slate-400 hover:text-indigo-600 text-lg shrink-0 mt-0.5" aria-label="發音">🔊</button>
    <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><b class="text-base break-words">${esc(n.text)}</b><span class="${dnChip}">${n.type === 'phrase' ? '片語' : '單字'}</span>${s.tsl ? `<span class="${dnChip} !bg-indigo-100 !text-indigo-800 dark:!bg-indigo-950 dark:!text-indigo-300">TSL #${s.tsl.r}</span>` : ''}<span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 ${st.c}">${st.label}</span></div>
      ${nwHasNote(n) ? `<p class="text-xs text-amber-700 dark:text-amber-300 mt-1 break-words">備註：${esc(n.note)}</p>` : ''}
      <p class="text-xs text-slate-500 mt-1 leading-relaxed">${msg}${wh ? `<br>${wh}` : ''}</p></div>
    <div class="flex flex-col gap-1 shrink-0">${s.ent ? `<button onclick="dnOpenExtra('${idOf(s.ent.a)}',this.dataset.t)" data-t="${esc(s.ent.e.text || s.ent.e.word)}" class="${dnSm}">詳解</button>` : ''}${n.own ? (s.st === 'pending' ? `<button onclick="nwOwn('${n.id}')" class="${dnSm}">取消獨立</button>` : '') : (s.bk && s.bk.where === 'forms' ? `<button onclick="nwOwn('${n.id}')" class="${dnSm}">單獨入庫</button>` : '')}<button onclick="nwEdit('${n.id}')" class="${dnSm}">✎</button><button onclick="nwDel('${n.id}')" class="text-xs ${done ? 'rounded-lg px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-700' : 'text-rose-500 hover:underline'} cursor-pointer">移除</button></div></div>`;
}
function nwListHtml() {
  const c = nwCounts(), tab = DN.nwTab, T = [['all', '全部', c.all], ['pending', '待採用', c.pending], ['todo', '待補充詳解', c.todo], ['rem', '可移除', c.rem]];
  const tb = ([t, n, k]) => `<button onclick="nwTab('${t}')" class="${btn} !py-1.5 !px-3 text-xs ${tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${k ? '' : ' opacity-50'}">${n} <span class="opacity-70">${k}</span></button>`;
  const rows = nwList().slice().sort((a, b) => (b.created || 0) - (a.created || 0)).filter(n => { const s = nwStatus(n).st; return tab === 'all' || (tab === 'pending' ? s === 'pending' : tab === 'todo' ? s === 'waitdetail' || s === 'supplement' : s === 'removable' || s === 'updated'); });
  return `<div class="flex flex-wrap items-center gap-2 mb-3">${T.map(tb).join('')}${c.rem ? `<button onclick="nwRemoveDone()" class="${btn} !py-1.5 !px-3 text-xs ml-auto bg-emerald-600 text-white hover:bg-emerald-700">移除全部可移除（${c.rem}）</button>` : ''}</div>`
    + (tab === 'todo' ? nwSupSec() : '')
    + (rows.length ? `<div class="${card} px-4 divide-y divide-slate-100 dark:divide-slate-800">${rows.map(nwRow).join('')}</div>` : `<p class="text-sm text-slate-400 text-center py-8">${c.all ? '這個分類沒有項目。' : '還沒有新單字。在上面輸入或按 🎤 說出一個單字。'}</p>`);
}
function nwRefresh() { const el = document.getElementById('nw-list'); if (el) el.innerHTML = nwListHtml(); }
function nwRender() {
  nwAutoMark();
  const D = DN.nwDraft, sr = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const mic = (id, lang) => sr ? `<button onclick="nwMic('${id}','${lang}',this)" class="${btn} ${dnLine} !px-3 shrink-0" aria-label="語音輸入">🎤</button>` : '';
  main.innerHTML = `<header class="mb-4 flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">🆕 新單字</h2>${dnBackBtn()}</header>
    <div class="${card} p-4 mb-4">
      <label class="block text-xs text-slate-500 mb-1">新單字／片語（英文）</label>
      <div class="flex gap-2"><input id="nw-w" value="${esc(D.w)}" oninput="nwDraftSync();nwHint()" onkeydown="if(event.key==='Enter'){event.preventDefault();nwAdd()}" placeholder="輸入，或按 🎤 說出單字" autocapitalize="none" autocomplete="off" spellcheck="false" class="${dnInp} flex-1">${mic('nw-w', 'en-US')}</div>
      <div id="nw-alt" class="flex flex-wrap gap-1.5 mt-2"></div>
      <div id="nw-hint" class="text-xs mt-2 leading-relaxed"></div>
      <label class="block text-xs text-slate-500 mt-3 mb-1">備註（選填，主要給 AI 補詳解用；例如：不懂為什麼用 on、和 affect 有什麼不同）</label>
      <div class="flex gap-2 items-start"><textarea id="nw-n" rows="2" oninput="nwDraftSync()" class="${dnInp} flex-1">${esc(D.n)}</textarea>${mic('nw-n', 'zh-TW')}</div>
      <div class="flex items-center justify-between gap-2 mt-3"><span class="text-[0.6875rem] text-slate-400 leading-relaxed">${sr ? '🎤 單字欄聽英文、備註欄聽中文；再按一次停止。' : '這個瀏覽器沒有語音輸入，可用手機鍵盤上的麥克風。'}</span><button onclick="nwAdd()" class="${btn} ${dnPri} shrink-0">＋ 加入</button></div>
    </div>
    <div id="nw-list">${nwListHtml()}</div>
    <p class="mt-4 text-[0.6875rem] text-slate-400 leading-relaxed"><b>流程：</b>① 加入新單字（備註選填）→ ② 新增文章時，「我的新單字」會優先帶進提示詞；TSL 核心單字放進核心單字，非核心單字寫進文章、合併後自動入庫 → ③ 被文章採用／已在庫後顯示「可移除」→ ④ 有備註的字，到「📌 入庫彙整」複製 AI 提示詞，AI 會判斷備註是否有誤字、原詳解是否已涵蓋，再補詳解；合併 daily.json 後顯示「已更新」。已在庫的字也能加入，備註會用來補充既有詳解。</p>`;
  nwHint();
}
