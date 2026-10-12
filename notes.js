/* notes.js — TOEIC Daily Coach 的「回報」「入庫」「詳解頁」
   依賴 daily.js／timing.js／audio.js 的全域（執行時才用到）：S／save／cur／find／idOf／esc／card／btn／main／render／push／up／go／openItem／
   speak／DATA／THEMES／L／lvBadge／lvColor／inMaint／toggleSec／splitSentences／auCopy
   載入順序：audio.js → timing.js → speak.js → notes.js → daily.js

   資料（都存在 localStorage 的 S 裡，與作答紀錄同一份）
     S.reports  回報：{ id, qid:'w1d1', ref:'Q2', kind, note, reporter, status, adminNote, created, updated, snap }
     S.marks    入庫：{ id, qid:'w1d1', text, type:'word|phrase|sentence', ctx, from, to, note, created, updated }
   寫回主檔（daily.json）的欄位：每篇文章的 extra_vocab 陣列（由 AI 依本頁產生的提示詞回傳，json_merge.py 補丁合併） */

const dnLine = 'border border-slate-300 dark:border-slate-700';
const dnPri = 'bg-indigo-600 text-white hover:bg-indigo-700';
const dnInp = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm';
const dnChip = 'text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const dnSm = 'text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer';
const DN = { mgOpen: {}, sel: null, rp: null, mk: null, rf: null, rkf: null, mf: 'todo', chk: {}, fill: { en: true, col: true, forms: true, fam: true, deriv: true, pos: true, sense: true, conf: true, sim: true, schunk: true, spara: true, spat: true, skw: true } };
const DNT = { word: '單字', phrase: '片語', sentence: '句子' };
const DNTC = { word: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300', phrase: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300', sentence: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' };
const DRK = { passage: '英文文稿', zh: '中文翻譯', vocab: '核心單字／搭配', quiz: '題目／答案／解析', audio: '音檔／對時', other: '其他' };
const DRS = { open: '待處理', fixing: '處理中', fixed: '已修正', wontfix: '不處理' };
const DRSC = { open: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300', fixing: '!bg-sky-100 !text-sky-700 dark:!bg-sky-950 dark:!text-sky-300', fixed: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-300', wontfix: '' };

/* ---------- 共用小工具 ---------- */
function dnToast(m) { const d = document.createElement('div'); d.textContent = m; d.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 z-[70] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
const dnTime = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const dnStamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
function dnDownload(name, text, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const dnArt = qid => DATA.find(d => idOf(d) === qid);
const dnArtLabel = qid => { const x = dnArt(qid); return x ? `W${x.week}·D${x.day} ${x.tag || ''}` : qid; };
const dnKey = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const dnId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function dnModal(html) {
  let m = document.getElementById('dn-modal');
  if (!m) { m = document.createElement('div'); m.id = 'dn-modal'; document.body.appendChild(m); }
  m.innerHTML = html ? `<div class="fixed inset-0 z-[60] bg-black/50 overflow-y-auto" onclick="if(event.target===this)dnClose()"><div class="min-h-full flex items-end sm:items-center justify-center p-3">${html}</div></div>` : '';
}
function dnClose() { DN.rp = null; DN.mk = null; dnModal(''); }
function dnNav(view) { // 往下一層：記住目前頁面與捲動位置，「返回」時還原
  cur.stk = cur.stk || []; cur.stk.push({ v: cur.view, y: window.scrollY });
  cur.view = view; push(); render(); window.scrollTo({ top: 0 });
}
const dnSideBtns = () => `<button onclick="dnNav('marks')" class="${btn} w-full mt-2 ${dnLine} ${cur.view === 'marks' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">📌 入庫彙整（${dnMarks().length}）</button><button onclick="dnNav('reports')" class="${btn} w-full mt-2 ${dnLine} ${cur.view === 'reports' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">⚑ 回報彙整（待處理 ${dnOpenRpN()}）</button>`;
function dnFromLaunch(view) { SEC = 'learn'; cur.stk = [{ v: 'launch', y: 0 }]; cur.view = view; push(); render(); window.scrollTo({ top: 0 }); }
function dnUp() { // 供 daily.js 的 up() 呼叫；回傳 true 表示已處理
  const v = cur.view; if (v !== 'marks' && v !== 'reports' && v !== 'detail' && v !== 'bank') return false;
  const p = cur.stk && cur.stk.pop();
  cur.view = p ? p.v : (inMaint() ? 'maint' : (find(cur.w, cur.d) ? 'day' : 'home'));
  if (cur.view === 'launch') SEC = null;
  render(); window.scrollTo({ top: p ? p.y : 0 }); return true;
}
const dnBackBtn = () => `<button onclick="up()" class="${btn} ${dnLine} !py-1.5 text-xs hidden md:block">← 返回</button>`;

/* ======================= 回報 ======================= */
const dnReports = () => S.reports || (S.reports = []);
const dnRpOf = qid => dnReports().filter(r => r.qid === qid).sort((a, b) => b.created - a.created);
const dnOpenRpN = qid => dnReports().filter(r => (r.status === 'open' || r.status === 'fixing') && (!qid || r.qid === qid)).length;
function dnRpBtn(qid, ref, kind) {
  const n = ref ? 0 : dnRpOf(qid).length;
  return `<button onclick="dnOpenReport('${qid}','${ref || ''}','${kind || 'other'}')" class="${dnSm}">⚑ 回報${n ? ` (${n})` : ''}</button>`;
}
function dnSnapOf(qid, ref) {
  const x = dnArt(qid), m = /^Q(\d+)$/.exec(ref || ''); if (!x || !m) return null;
  const qi = +m[1] - 1, q = x.questions[qi]; if (!q) return null;
  const r = S.ans[qid], s = r && r.sel ? r.sel[qi] : null;
  return { q: q.q, opts: q.opts.slice(), ans: q.ans, sel: s == null ? null : s, why: (q.why || []).slice() };
}
function dnOpenReport(qid, ref, kind) { DN.rp = { mode: 'new', qid, ref: ref || '', kind: kind || 'other', note: '', reporter: S.reporter || '', snap: dnSnapOf(qid, ref) }; dnRpModal(); }
function dnEditReport(id) { const r = dnReports().find(q => q.id === id); if (!r) return; DN.rp = Object.assign({ mode: 'edit' }, JSON.parse(JSON.stringify(r))); dnRpModal(); }
function dnRpModal() {
  const p = DN.rp; if (!p) return;
  const edit = p.mode === 'edit', sn = p.snap;
  const opt = (o, c) => Object.keys(o).map(k => `<option value="${k}"${k === c ? ' selected' : ''}>${o[k]}</option>`).join('');
  dnModal(`<div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">${edit ? '編輯回報' : '⚑ 回報問題'} · ${esc(dnArtLabel(p.qid))}</h2><button onclick="dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <div class="grid grid-cols-3 gap-3 mb-3"><div class="col-span-2"><label class="block text-xs text-slate-500 mb-1">問題類型</label><select id="dn-k" class="${dnInp}">${opt(DRK, p.kind)}</select></div>
    <div><label class="block text-xs text-slate-500 mb-1">位置（選填）</label><input id="dn-ref" value="${esc(p.ref)}" placeholder="Q2" class="${dnInp}" maxlength="20"></div></div>
    <label class="block text-xs text-slate-500 mb-1">描述問題（例如：Q2 選項 B 其實也對、第 3 句翻譯不通順…）</label><textarea id="dn-n" rows="4" class="${dnInp} mb-3">${esc(p.note)}</textarea>
    <label class="block text-xs text-slate-500 mb-1">回報人（選填）</label><input id="dn-r" value="${esc(p.reporter)}" class="${dnInp} mb-3" maxlength="30">
    ${edit ? `<label class="block text-xs text-slate-500 mb-1">處理狀態</label><select id="dn-s" class="${dnInp} mb-3">${opt(DRS, p.status)}</select>
    <label class="block text-xs text-slate-500 mb-1">管理員備註（例如：已改 daily.json）</label><textarea id="dn-a" rows="2" class="${dnInp} mb-3">${esc(p.adminNote || '')}</textarea>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mb-3"><summary class="cursor-pointer">回報當下的題目內容</summary><p class="mt-1">${esc(sn.q)}</p><ul class="mt-1 space-y-0.5">${sn.opts.map((o, i) => `<li>${L[i]}. ${esc(o)}${sn.ans === i ? ' <b class="text-emerald-600">✓ 正解</b>' : ''}${sn.sel === i ? ' <span class="text-rose-500">（使用者選）</span>' : ''}</li>`).join('')}</ul></details>` : ''}
    <div class="flex gap-2 justify-end"><button onclick="dnClose()" class="${btn} ${dnLine}">取消</button><button onclick="dnSaveReport()" class="${btn} ${dnPri}">${edit ? '儲存變更' : '送出回報'}</button></div></div>`);
  setTimeout(() => { const e = document.getElementById('dn-n'); if (e) e.focus(); }, 50);
}
function dnSaveReport() {
  const p = DN.rp; if (!p) return;
  const g = i => { const e = document.getElementById(i); return e ? e.value : ''; };
  const note = g('dn-n').trim(), kind = g('dn-k') || 'other', ref = g('dn-ref').trim(), reporter = g('dn-r').trim();
  if (!note) { dnToast('請簡單描述問題'); return; }
  const now = Date.now();
  if (p.mode === 'new') {
    dnReports().push({ id: dnId('r'), qid: p.qid, ref, kind, note, reporter, status: 'open', adminNote: '', created: now, updated: now, snap: p.snap || null });
    S.reporter = reporter; dnToast('已回報，謝謝！');
  } else {
    const r = dnReports().find(q => q.id === p.id); if (!r) return dnClose();
    Object.assign(r, { ref, kind, note, reporter, status: g('dn-s') || r.status, adminNote: g('dn-a').trim(), updated: now }); dnToast('已更新');
  }
  save(); dnClose(); render();
}
function dnSetRs(id, st) { const r = dnReports().find(q => q.id === id); if (!r) return; r.status = st; r.updated = Date.now(); save(); render(); }
function dnDelReport(id) { if (!confirm('確定刪除這筆回報？')) return; S.reports = dnReports().filter(r => r.id !== id); save(); render(); }
function dnSetF(k, v) { DN[k] = DN[k] === v ? null : v; render(); }
function dnGoArt(qid) { const x = dnArt(qid); if (!x) return; cur.stk = []; if (inMaint()) openItem(x.week, x.day); else go(x.week, x.day); }
function dnRpCard(r) {
  const x = dnArt(r.qid), sn = r.snap;
  return `<div class="${card} p-3 mb-3"><div class="min-w-0">
    <div class="flex flex-wrap items-center gap-1.5">${x ? `<button onclick="dnGoArt('${r.qid}')" class="text-sm font-bold text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(r.qid))}</button>` : `<b class="text-sm">${esc(r.qid)}</b><span class="${dnChip}">文章已不存在</span>`}<span class="${dnChip}">${DRK[r.kind] || esc(r.kind)}</span>${r.ref ? `<span class="${dnChip}">${esc(r.ref)}</span>` : ''}<span class="${dnChip} ${DRSC[r.status] || ''}">${DRS[r.status] || esc(r.status)}</span></div>
    <p class="text-sm mt-1.5 whitespace-pre-wrap break-words">${esc(r.note)}</p>
    <p class="text-xs text-slate-400 mt-1">${esc(r.reporter || '匿名')} · ${dnTime(r.created)}${r.updated > r.created ? ' · 更新 ' + dnTime(r.updated) : ''}</p>
    ${r.adminNote ? `<p class="text-xs mt-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 whitespace-pre-wrap break-words"><b>管理員：</b>${esc(r.adminNote)}</p>` : ''}
    ${sn ? `<details class="text-xs text-slate-500 mt-1.5"><summary class="cursor-pointer">當時的題目內容</summary><p class="mt-1">${esc(sn.q)}</p><ul class="mt-1 space-y-0.5">${sn.opts.map((o, i) => `<li>${L[i]}. ${esc(o)}${sn.ans === i ? ' ✓' : ''}${sn.sel === i ? ' ←使用者選' : ''}</li>`).join('')}</ul></details>` : ''}</div>
    <div class="flex flex-wrap gap-1.5 mt-2.5">${Object.keys(DRS).map(k => `<button onclick="dnSetRs('${r.id}','${k}')" class="text-xs rounded-lg px-2.5 py-1 cursor-pointer ${r.status === k ? 'bg-indigo-600 text-white' : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}">${DRS[k]}</button>`).join('')}
    <button onclick="dnEditReport('${r.id}')" class="${dnSm} ml-auto">✎ 編輯</button><button onclick="dnDelReport('${r.id}')" class="text-xs rounded-lg px-2.5 py-1 text-rose-500 hover:underline cursor-pointer">刪除</button></div></div>`;
}
function dnRenderReports() {
  const all = dnReports().slice().sort((a, b) => b.created - a.created);
  const list = all.filter(r => (!DN.rf || r.status === DN.rf) && (!DN.rkf || r.kind === DN.rkf));
  const fb = (k, v, label, n) => `<button onclick="dnSetF('${k}','${v}')" class="${btn} !py-1.5 !px-3 text-xs ${DN[k] === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label} <span class="opacity-70">${n}</span></button>`;
  main.innerHTML = `<header class="mb-4 flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">⚑ 回報彙整</h2>${dnBackBtn()}</header>
    <div class="${card} p-4 mb-4"><div class="flex flex-wrap gap-2">${Object.keys(DRS).map(k => fb('rf', k, DRS[k], all.filter(r => r.status === k).length)).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-2">${Object.keys(DRK).map(k => fb('rkf', k, DRK[k], all.filter(r => r.kind === k).length)).join('')}</div>
    <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><button onclick="dnExportReports('json')" class="${btn} ${dnLine} !py-1.5 text-xs">匯出 JSON</button><button onclick="dnExportReports('csv')" class="${btn} ${dnLine} !py-1.5 text-xs">匯出 CSV（Excel）</button>
    <label class="${btn} ${dnLine} !py-1.5 text-xs cursor-pointer">匯入合併 JSON<input type="file" accept=".json,application/json" class="hidden" onchange="dnImportReports(this)"></label></div>
    <p class="text-xs text-slate-400 mt-2">回報只存在這個瀏覽器的 localStorage。要彙整時，從手機「匯出 JSON」傳到電腦，再在這裡「匯入合併」（以編號去重，較新的版本優先）。</p></div>
    ${list.length ? `<p class="text-xs text-slate-500 mb-2">共 ${list.length} 筆</p>` + list.map(dnRpCard).join('') : `<p class="text-sm text-slate-400 text-center py-10">${all.length ? '沒有符合篩選的回報。' : '目前沒有回報。閱讀或作答時按「⚑ 回報」即可記錄。'}</p>`}`;
}
function dnExportReports(fmt) {
  const rs = dnReports(); if (!rs.length) { dnToast('沒有可匯出的回報'); return; }
  const st = dnStamp();
  if (fmt === 'json') { dnDownload(`daily-reports-${st}.json`, JSON.stringify({ app: 'toeic-daily-reports', v: 1, exported: Date.now(), reports: rs }, null, 2), 'application/json'); return; }
  const cell = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const head = ['回報編號', '文章', '位置', '類型', '狀態', '描述', '回報人', '建立時間', '更新時間', '管理員備註', '題目', 'A', 'B', 'C', 'D', '正解', '使用者選'];
  const rows = rs.slice().sort((a, b) => a.created - b.created).map(r => { const s = r.snap;
    return [r.id, r.qid, r.ref || '', DRK[r.kind] || r.kind, DRS[r.status] || r.status, r.note, r.reporter, dnTime(r.created), dnTime(r.updated), r.adminNote, s ? s.q : '',
      ...[0, 1, 2, 3].map(i => s && s.opts[i] != null ? s.opts[i] : ''), s ? L[s.ans] || '' : '', s && s.sel != null ? L[s.sel] : ''].map(cell).join(','); });
  dnDownload(`daily-reports-${st}.csv`, '\ufeff' + [head.map(cell).join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
}
function dnImportReports(input) {
  const f = input.files[0]; if (!f) return; const fr = new FileReader();
  fr.onload = () => {
    try {
      const j = JSON.parse(fr.result), arr = Array.isArray(j) ? j : j && j.reports;
      if (!Array.isArray(arr)) throw new Error('找不到 reports 陣列');
      let add = 0, upd = 0;
      arr.forEach(r => {
        if (!r || typeof r.id !== 'string' || typeof r.qid !== 'string') return;
        const n = { id: r.id, qid: r.qid, ref: String(r.ref || ''), kind: DRK[r.kind] ? r.kind : 'other', note: String(r.note || ''), reporter: String(r.reporter || ''), status: DRS[r.status] ? r.status : 'open', adminNote: String(r.adminNote || ''), created: +r.created || Date.now(), updated: +r.updated || +r.created || Date.now(), snap: r.snap || null };
        const o = dnReports().find(q => q.id === n.id);
        if (!o) { dnReports().push(n); add++; } else if (n.updated > o.updated) { Object.assign(o, n); upd++; }
      });
      save(); dnToast(`匯入完成：新增 ${add}、更新 ${upd}`); render();
    } catch (e) { alert('匯入失敗：' + e.message); }
  };
  fr.readAsText(f, 'utf-8'); input.value = '';
}

/* ======================= 入庫（在英文文稿選字） ======================= */
const dnMarks = () => S.marks || (S.marks = []);
const dnMarksOf = qid => dnMarks().filter(m => m.qid === qid);
const dnExtraOf = x => Array.isArray(x && x.extra_vocab) ? x.extra_vocab : [];
const dnFindExtra = (x, text) => dnExtraOf(x).find(e => dnKey(e.text || e.word) === dnKey(text)); // 只找本篇
/* 同一個字在別篇已有詳解時，沿用那一份：先找本篇，再依週次找其他篇 */
const dnArts = () => DATA.slice().sort((a, b) => a.week - b.week || a.day - b.day);
const dnLabel = a => `W${a.week}·D${a.day}`;
const dnExtraSrc = (x, text) => dnArts().find(a => dnFindExtra(a, text)) || null; // 全題庫同一個字只有一份詳解：一律取最早（週、天）有的那一篇，資料裡就算還有重複也不會各顯示各的
const dnFindExtraAny = (x, text) => { const s = x && dnExtraSrc(x, text); return s ? dnFindExtra(s, text) : undefined; };
function dnElsewhere(qid, text) { // 同一個字在「其他篇」的入庫狀態：{ label, merged } 或 null
  for (const a of dnArts()) if (idOf(a) !== qid && dnFindExtra(a, text)) return { label: dnLabel(a), merged: true };
  const k = dnKey(text), o = dnMarks().filter(m => m.qid !== qid && dnKey(m.text) === k && dnArt(m.qid)).sort((a, b) => { const A = dnArt(a.qid), B = dnArt(b.qid); return A.week - B.week || A.day - B.day; })[0];
  return o ? { label: dnLabel(dnArt(o.qid)), merged: false } : null;
}
/* 同一個字在多篇入庫時只算一份：以最早（週、天）那一篇的入庫為「主」，其他篇只標示「共用」，不重複進提示詞、不重複計數 */
const dnPrimaryOf = m => { const k = dnKey(m.text); return dnMarks().filter(q => dnKey(q.text) === k && dnArt(q.qid)).sort((p, q) => { const P = dnArt(p.qid), Q = dnArt(q.qid); return P.week - Q.week || P.day - Q.day || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0); })[0] || m; };
const dnIsPrimary = m => dnPrimaryOf(m).id === m.id;
const dnMerged = m => { const x = dnArt(m.qid); return !!(x && dnExtraSrc(x, m.text)); }; // 本篇或其他篇有詳解都算已寫回
const dnOff = (root, node, off) => { const r = document.createRange(); r.selectNodeContents(root); r.setEnd(node, off); return r.toString().length; };
const dnWordN = t => (String(t).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length;
function dnGuess(p, text, from, to) { // 1 字＝單字；2–6 字＝片語；整句或更長＝句子
  const n = dnWordN(text); if (n <= 1) return 'word';
  const ss = typeof splitSentences === 'function' ? splitSentences(p) : [];
  if (n >= 3 && ss.some(s => Math.abs(s[0] - from) <= 1 && Math.abs(s[1] - to) <= 1)) return 'sentence';
  return n <= 6 ? 'phrase' : 'sentence';
}
function dnCtxOf(p, from, to, text) {
  const ss = typeof splitSentences === 'function' ? splitSentences(p) : [];
  const s = ss.find(a => a[0] <= from && from < a[1]);
  return s ? p.slice(s[0], s[1]).trim() : text;
}
let dnSelT;
document.addEventListener('selectionchange', () => { clearTimeout(dnSelT); dnSelT = setTimeout(dnSelRead, 200); });
/* 全域入庫判斷：已在入庫清單、任何一篇的核心單字、或任何一篇的詳解，都算已在庫 */
function dnBanked(text) {
  const k = dnKey(text), m = dnMarks().find(q => dnKey(q.text) === k);
  if (m) return { where: 'mark', qid: m.qid };
  for (const a of dnArts()) {
    if (dnFindExtra(a, text)) return { where: 'extra', qid: idOf(a) };
    if ((a.vocab || []).some(v => dnKey(v.word) === k)) return { where: 'vocab', qid: idOf(a) };
  }
  return null;
}
function dnSelDetail() { // 詳解頁：選取例句／說明裡的英文字、片語或句子 → 跳出入庫列
  const el = document.getElementById('detail-text'); if (!el) return;
  const s = window.getSelection(); if (!s || !s.rangeCount || s.isCollapsed) return;
  const rg = s.getRangeAt(0); if (!el.contains(rg.startContainer) || !el.contains(rg.endContainer)) return;
  const D = dnDetailData(); if (!D) return;
  const wc = /[A-Za-z0-9'’$%-]/;
  let sn = rg.startContainer, so = rg.startOffset, en = rg.endContainer, eo = rg.endOffset;
  if (sn.nodeType === 3) { const t = sn.nodeValue; while (so > 0 && wc.test(t[so - 1]) && wc.test(t[so] || '')) so--; }      // 選到字的一半 → 補成整個字
  if (en.nodeType === 3) { const t = en.nodeValue; while (eo < t.length && wc.test(t[eo - 1] || '') && wc.test(t[eo])) eo++; }
  const r2 = document.createRange(); try { r2.setStart(sn, so); r2.setEnd(en, eo); } catch (e) { return; }
  let text = r2.toString().replace(/\s+/g, ' ').replace(/^[\s,;:"“”()]+|[\s,;:"“”()]+$/g, '');
  if (dnWordN(text) <= 6) text = text.replace(/[.!?]+$/, '');
  if (!text || !/[A-Za-z]/.test(text) || /[\u4e00-\u9fff]/.test(text) || text.length > 300) return;
  const host = (sn.nodeType === 3 ? sn.parentElement : sn), blk = host && (host.closest('p') || host.closest('li') || host.closest('h2'));
  let ctx = blk ? blk.textContent.replace(/\s+/g, ' ').trim() : text;
  if (/[\u4e00-\u9fff]/.test(ctx) || ctx.length > 400) ctx = text;
  const n = dnWordN(text);
  DN.sel = { qid: idOf(D.x), text, type: n <= 1 ? 'word' : n <= 6 ? 'phrase' : 'sentence', ctx, src: 'detail', head: D.e.text };
  dnBar();
}
function dnSelRead() {
  if (cur.view === 'detail') { dnSelDetail(); return; }
  if (cur.view !== 'day' || !cur.mk) return;
  const el = document.getElementById('passage-text'); if (!el) return;
  const s = window.getSelection(); if (!s || !s.rangeCount || s.isCollapsed) return;
  const rg = s.getRangeAt(0); if (!el.contains(rg.startContainer) || !el.contains(rg.endContainer)) return;
  const x = find(cur.w, cur.d); if (!x) return;
  const p = String(x.passage || '');
  let a = dnOff(el, rg.startContainer, rg.startOffset), b = dnOff(el, rg.endContainer, rg.endOffset);
  if (b < a) [a, b] = [b, a];
  const wc = /[A-Za-z0-9'’$%-]/;
  while (a < b && /[\s,;:"“”()]/.test(p[a])) a++;
  while (b > a && /[\s,;:"“”()]/.test(p[b - 1])) b--;
  while (a > 0 && wc.test(p[a]) && wc.test(p[a - 1])) a--;      // 選到字的一半 → 往外補成整個字
  while (b < p.length && wc.test(p[b - 1]) && wc.test(p[b])) b++;
  let text = p.slice(a, b);
  if (dnWordN(text) <= 6) { while (b > a && /[.!?]/.test(p[b - 1])) b--; text = p.slice(a, b); }
  if (!text.trim() || !/[A-Za-z]/.test(text) || text.length > 400) return;
  if (/\n/.test(text)) { dnToast('請在同一段內選取'); return; }
  DN.sel = { qid: idOf(x), from: a, to: b, text, type: dnGuess(p, text, a, b) };
  dnBar();
}
function dnBar() {
  let el = document.getElementById('dn-bar');
  if (!DN.sel) { if (el) el.style.display = 'none'; return; }
  if (!el) { el = document.createElement('div'); el.id = 'dn-bar'; document.body.appendChild(el); }
  const S_ = DN.sel, det = S_.src === 'detail', bk = det ? dnBanked(S_.text) : null;
  const dup = det ? !!bk : dnMarks().some(m => m.qid === S_.qid && dnKey(m.text) === dnKey(S_.text));
  const el2 = det ? null : dnElsewhere(S_.qid, S_.text);
  const chip = bk ? ` <span class="ml-1 text-[0.6875rem] rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">${bk.where === 'vocab' ? '已是核心單字' : bk.where === 'extra' ? '已有詳解' : '已在入庫清單'}</span>` : el2 ? ` <span class="ml-1 text-[0.6875rem] rounded px-1.5 py-0.5 ${el2.merged ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}">已在 ${el2.label} 入庫${el2.merged ? '，沿用詳解' : '（詳解待補）'}</span>` : '';
  el.style.display = '';
  el.className = 'fixed inset-x-2 bottom-[4.5rem] md:inset-x-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:w-[30rem] z-50 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2.5';
  const tb = t => `<button onmousedown="event.preventDefault()" onclick="dnSetType('${t}')" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${S_.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${DNT[t]}</button>`;
  el.innerHTML = `<p class="text-xs text-slate-500 truncate mb-1.5">已選：<b class="text-slate-800 dark:text-slate-200">${esc(S_.text)}</b>${chip}</p>
    <div class="flex items-center gap-1.5">${tb('word')}${tb('phrase')}${tb('sentence')}
    <button onmousedown="event.preventDefault()" onclick="dnAddMark()" class="ml-auto text-sm rounded-lg px-3 py-1.5 cursor-pointer ${dup ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : dnPri}">${dup ? '已入庫' : (el2 && el2.merged ? '＋ 入庫（沿用詳解）' : '＋ 入庫')}</button>
    <button onmousedown="event.preventDefault()" onclick="dnSelClear()" class="text-slate-400 hover:text-slate-600 text-xl leading-none px-1.5 cursor-pointer" aria-label="關閉">×</button></div>`;
}
function dnToggleMk() { // 標註模式開關（與文稿卡片上的 Reading/Listening 標籤共用）
  cur.mk = !cur.mk;
  if (cur.mk) { cur.enOpen = true; if (typeof spClearHl === 'function') spClearHl(); }
  else { DN.sel = null; try { window.getSelection().removeAllRanges(); } catch (e) {} dnBar(); }
  render();
}
/* ---------- 詳解／例句／含入庫字的句子：優先播 mp3（audio/daily/vocab/，由 daily-auto-speech.py 產生），沒有就用語音合成 ---------- */
const VA = { files: null, v: '' };
const VW = { files: null, v: '' }; // 共用單字發音庫：audio/daily/words/{單字}.mp3（同一個字不論出現在哪一篇、哪一欄，都只錄一次）
fetch('audio/daily/words/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null)
  .then(j => { if (j && Array.isArray(j.files)) { VW.files = new Set(j.files); VW.v = j.v || ''; } }).catch(() => {});
const DN_WORD_SUF = /^(?:_lm|_f\d+|_m\d+|_d\d+|_pw\d+|_sw\d+|_cp\d+|_cw\d+|_sm\d+|_kw\d+)?$/; // 這些後綴的 🔊 念的是「單字／片語本身」→ 走共用發音庫；例句、所在句仍是每篇各一檔
fetch('audio/daily/vocab/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null)
  .then(j => { if (j && Array.isArray(j.files)) { VA.files = new Set(j.files); VA.v = j.v || ''; } }).catch(() => {});
const dnNorm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
function dnFnv6(s) { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0').slice(0, 6); }
function dnSlug(t) { const k = dnNorm(t), s = k.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return s && s.length <= 40 ? s : s.slice(0, 40).replace(/-+$/, '') + (s ? '-' : '') + dnFnv6(k); }
let dnAu = null;
function vplay(qid, text, suf, fallback) {
  const done = spkBtn(); // 按下立刻脈動，播完／失敗才停
  const f = `${qid}-${dnSlug(text)}${suf || ''}.mp3`, wf = fallback && DN_WORD_SUF.test(suf || '') ? `${dnSlug(fallback)}.mp3` : ''; // 單字類：先找共用庫 words/，再找舊的逐篇檔，最後語音合成
  try { if (dnAu) { dnAu.pause(); dnAu = null; } } catch (e) {}
  if (wf && VW.files && VW.files.has(wf)) {
    try { if (typeof spStop === 'function') spStop(); speechSynthesis.cancel(); } catch (e) {}
    const a = dnAu = new Audio('audio/daily/words/' + wf + (VW.v ? '?v=' + VW.v : ''));
    a.onended = a.onpause = done;
    a.onerror = () => speak(fallback, done);
    a.play().catch(() => speak(fallback, done));
  } else if (VA.files && VA.files.has(f)) {
    try { if (typeof spStop === 'function') spStop(); speechSynthesis.cancel(); } catch (e) {}
    const a = dnAu = new Audio('audio/daily/vocab/' + f + (VA.v ? '?v=' + VA.v : ''));
    a.onended = a.onpause = done;
    a.onerror = () => speak(fallback, done);
    a.play().catch(() => speak(fallback, done));
  } else speak(fallback, done);
}
function dnSetType(t) { if (DN.sel) { DN.sel.type = t; dnBar(); } }
function dnSelClear() { DN.sel = null; try { window.getSelection().removeAllRanges(); } catch (e) {} dnBar(); }
function dnAddMark() {
  const s = DN.sel; if (!s) return;
  if (s.src === 'detail') { // 從詳解頁入庫：全域去重，不綁週次；qid 只當「發現於」與提示詞的文章脈絡
    if (dnBanked(s.text)) { dnToast('這個已經在庫了'); return; }
    const now = Date.now();
    dnMarks().push({ id: dnId('m'), qid: s.qid, text: s.text, type: s.type, ctx: s.type === 'sentence' ? s.text : (s.ctx || s.text), from: 0, to: 0, src: 'detail', head: s.head || '', note: '', created: now, updated: now });
    save(); dnSelClear(); dnToast(`已入庫（${DNT[s.type]}），到「📌 入庫彙整」補詳解`); render(); return;
  }
  if (dnMarks().some(m => m.qid === s.qid && dnKey(m.text) === dnKey(s.text))) { dnToast('這個已經入庫了'); return; }
  const x = dnArt(s.qid), p = String(x ? x.passage : '');
  const now = Date.now();
  dnMarks().push({ id: dnId('m'), qid: s.qid, text: s.text, type: s.type, ctx: s.type === 'sentence' ? s.text : dnCtxOf(p, s.from, s.to, s.text), from: s.from, to: s.to, note: '', created: now, updated: now });
  const el = dnElsewhere(s.qid, s.text); save(); dnSelClear(); dnToast(el && el.merged ? `已入庫，沿用 ${el.label} 的詳解` : `已入庫（${DNT[s.type]}）`); render();
}
/* 文稿上畫底線：事後在 DOM 上把對應的文字包起來（不影響排版、不影響 timing 句子的 span） */
function dnLocate(p, m) {
  if (p.slice(m.from, m.to) === m.text) return { from: m.from, to: m.to };
  const i = p.toLowerCase().indexOf(String(m.text).toLowerCase());
  return i < 0 ? null : { from: i, to: i + m.text.length };
}
function dnApplyMarks() {
  const el = document.getElementById('passage-text'), x = find(cur.w, cur.d); if (!el || !x) return;
  const ms = dnMarksOf(idOf(x)); if (!ms.length) return;
  const p = String(x.passage || '');
  ms.slice().sort((a, b) => (b.to - b.from) - (a.to - a.from)).forEach(m => { // 長的先包，短的包在裡面
    const loc = dnLocate(p, m); if (!loc) return;
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = []; let pos = 0, n;
    while ((n = tw.nextNode())) { nodes.push({ n, s: pos, e: pos + n.nodeValue.length }); pos += n.nodeValue.length; }
    if (pos !== p.length) return;
    nodes.forEach(o => {
      const a = Math.max(loc.from, o.s) - o.s, b = Math.min(loc.to, o.e) - o.s;
      if (a >= b) return;
      let mid = o.n; if (a > 0) mid = mid.splitText(a); if (b - a < mid.nodeValue.length) mid.splitText(b - a);
      const sp = document.createElement('span'); sp.className = 'mk mk-' + m.type; sp.dataset.id = m.id;
      mid.parentNode.insertBefore(sp, mid); sp.appendChild(mid);
    });
  });
}
document.getElementById('main').addEventListener('click', e => { // 在文稿上：選字時不要觸發「點句子播放」；點底線＝開啟該筆入庫
  const t = e.target, inP = t.closest && t.closest('#passage-text'); if (!inP) return;
  if (!cur.mk) return; // 播放模式：照舊點句子播放
  e.stopPropagation(); // 標註模式：點／選文稿一律不播放
  const s = window.getSelection();
  if (s && !s.isCollapsed) return;
  const m = t.closest('.mk'); if (m) dnMarkMenu(m.dataset.id);
}, true);
function dnMarkMenu(id) {
  const m = dnMarks().find(q => q.id === id); if (!m) return;
  DN.mk = id;
  const merged = dnMerged(m), own = !!dnFindExtra(dnArt(m.qid) || {}, m.text), srcA = merged ? dnExtraSrc(dnArt(m.qid), m.text) : null;
  dnModal(`<div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">📌 入庫項目</h2><button onclick="dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <p class="text-lg font-bold break-words">${esc(m.text)}</p><p class="text-xs text-slate-500 mt-1 mb-3">${esc(dnArtLabel(m.qid))}　${merged ? `<span class="text-emerald-600">✔ 詳解已寫回${srcA && !own ? '（沿用 ' + dnLabel(srcA) + '）' : ''}</span>` : '待補詳解'}</p>
    <label class="block text-xs text-slate-500 mb-1">類型</label><div class="flex gap-1.5 mb-3">${['word', 'phrase', 'sentence'].map(t => `<button onclick="dnMkType('${t}')" id="dn-mt-${t}" data-on="${m.type === t ? 1 : 0}" class="text-xs rounded-lg px-3 py-1.5 cursor-pointer ${m.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${DNT[t]}</button>`).join('')}</div>
    <label class="block text-xs text-slate-500 mb-1">我的備註（給 AI 看，例如：不懂為什麼用 on）</label><textarea id="dn-mn" rows="3" class="${dnInp} mb-3">${esc(m.note || '')}</textarea>
    <div class="flex flex-wrap gap-2 justify-between">${own ? '<span class="text-[0.6875rem] text-slate-400 self-center max-w-[14rem]">詳解已寫回 daily.json，無法在這裡刪除。</span>' : `<button onclick="dnDelMark('${m.id}')" class="${btn} text-rose-500">刪除</button>`}<div class="flex gap-2">${merged ? `<button onclick="dnClose();dnOpenExtra('${m.qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${btn} ${dnLine}">看詳解</button>` : ''}<button onclick="dnSaveMark()" class="${btn} ${dnPri}">儲存</button></div></div></div>`);
}
function dnMkType(t) { ['word', 'phrase', 'sentence'].forEach(k => { const b = document.getElementById('dn-mt-' + k); if (!b) return; const on = k === t; b.dataset.on = on ? 1 : 0; b.className = 'text-xs rounded-lg px-3 py-1.5 cursor-pointer ' + (on ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'); }); }
function dnSaveMark() {
  const m = dnMarks().find(q => q.id === DN.mk); if (!m) return dnClose();
  const on = ['word', 'phrase', 'sentence'].find(k => { const b = document.getElementById('dn-mt-' + k); return b && b.dataset.on === '1'; });
  const nt = (document.getElementById('dn-mn') || {}).value || '';
  m.type = on || m.type; m.note = nt.trim(); m.updated = Date.now(); save(); dnClose(); render();
}
function dnDelMark(id) { if (!confirm('確定刪除這筆入庫？')) return; S.marks = dnMarks().filter(m => m.id !== id); save(); dnClose(); render(); }
function dnDelMark2(id) { if (!confirm('確定刪除這筆入庫？')) return; S.marks = dnMarks().filter(m => m.id !== id); save(); render(); }

function dnMyCard(m) { // 我的入庫卡片：版型與核心多益單字一致，初步說明取自已寫回的 extra_vocab（zh／en／note）
  const x = dnArt(m.qid), e = x && dnFindExtraAny(x, m.text), full = m.type === 'sentence';
  const sp = e && e.ipa ? `<p class="text-xs text-slate-400">${esc(e.ipa)}</p>` : '';
  const pos = e && e.pos ? `<span class="text-xs text-slate-500 italic ml-1">${esc(e.pos)}</span>` : '';
  const body = e
    ? `${e.zh ? `<p class="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">${esc(e.zh)}</p>` : ''}${e.en ? `<p class="text-xs mt-1 text-slate-500 dark:text-slate-400">${esc(e.en)}</p>` : ''}${e.note ? `<p class="text-xs mt-1.5 text-slate-600 dark:text-slate-300 line-clamp-3">${esc(e.note)}</p>` : ''}`
    : `<p class="mt-2 text-xs text-slate-400">尚無詳解，可到「📌 入庫彙整」產生提示詞請 AI 補。</p>${m.note ? `<p class="text-xs mt-1 text-slate-500 dark:text-slate-400">我的備註：${esc(m.note)}</p>` : ''}`;
  return `<div class="${card} p-4 flex flex-col justify-between${full ? ' sm:col-span-2 md:col-span-3' : ''}">
    <div>
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <button onclick="dnOpenMark('${m.id}')" class="text-base font-bold text-left break-words underline decoration-dotted decoration-slate-400 underline-offset-4 hover:text-indigo-600 cursor-pointer">${esc(full && m.text.length > 80 ? m.text.slice(0, 80) + '…' : m.text)}</button>${pos}
          <span class="ml-1 align-middle text-[0.625rem] rounded px-1.5 py-0.5 ${DNTC[m.type]}">${DNT[m.type]}</span>${sp}
        </div>
        <button onclick="vplay('${m.qid}', this.dataset.w, '', this.dataset.w)" data-w="${esc(m.text)}" class="text-slate-400 hover:text-indigo-600 text-lg shrink-0">🔊</button>
      </div>
      ${body}
    </div>
    <div class="flex gap-2 mt-3">
      ${e ? `<button onclick="dnOpenMark('${m.id}')" class="${btn} text-xs flex-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">詳解 ›</button>` : ''}
      ${e ? '' : `<button onclick="dnMarkMenu('${m.id}')" class="${btn} text-xs flex-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">備註／類型／刪除</button>`}
    </div>
  </div>`;
}
/* 每日頁：「我的入庫」區塊 */
function dnDaySec(x) {
  const id = idOf(x), ms = dnMarksOf(id), open = !!cur.myOpen;
  let h = `<div class="flex items-center justify-between ${open ? 'mb-3' : 'mb-8'} gap-2 flex-wrap"><button onclick="toggleSec('my')" class="font-bold text-lg cursor-pointer">${open ? '▾' : '▸'} 我的入庫（${ms.length}）</button>
    <button onclick="dnToggleMhl()" class="${btn} ${cur.mhl ? 'bg-sky-100 text-slate-900 dark:bg-sky-400/30 dark:text-slate-100' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}">${cur.mhl ? '取消標示入庫' : '🔍 在英文文稿標示入庫'}</button></div>`;
  if (open) {
    const ty = cur.myType || 'all', cnt = t => t === 'all' ? ms.length : ms.filter(m => m.type === t).length;
    const list = ty === 'all' ? ms : ms.filter(m => m.type === ty);
    const tab = ([t, n]) => `<button onclick="dnMyType('${t}')" class="${btn} !py-1 !px-3 text-xs ${ty === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}${cnt(t) ? '' : ' opacity-50'}">${n} <span class="opacity-70">${cnt(t)}</span></button>`;
    if (ms.length) h += `<div class="flex flex-wrap gap-2 mb-3">${[['all', '全部'], ['word', '單字'], ['phrase', '片語'], ['sentence', '句子']].map(tab).join('')}</div>`;
    h += !ms.length
      ? `<p class="text-xs text-slate-400 mb-8">在英文文稿上選取不懂的字、片語或句子，按「＋ 入庫」就會收在這裡。</p>`
      : list.length
        ? `<div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">${list.map(dnMyCard).join('')}</div>`
        : `<p class="text-xs text-slate-400 mb-8">這個分類還沒有項目。</p>`;
  }
  return h;
}
function dnMyType(t) { cur.myType = t; render(); }
function dnOpenMark(id) { const m = dnMarks().find(q => q.id === id); if (!m) return; if (dnMerged(m)) dnOpenExtra(m.qid, m.text); else dnMarkMenu(id); }

/* ======================= 入庫彙整頁（含 AI 提示詞） ======================= */
const dnChecked = m => DN.chk[m.id] !== undefined ? DN.chk[m.id] : (!dnMerged(m) || DN.mf === 'gap');
/* ---------- 已寫回的詳解還缺什麼（可在提示詞區選擇補上）---------- */
const dnFillKeys = { en: '英文解說', col: '搭配例句', forms: '屈折變化＋發音', fam: '相關字音標＋例句', deriv: '衍生字＋記憶連結', pos: '多詞性用法', sense: '多義', conf: '易混淆例句', sim: '近義片語例句', schunk: '句子：意群斷句', spara: '句子：同義改寫', spat: '句子：句型模板', skw: '句子：重點字詞' };
function dnGapsOf(m) {
  const x = dnArt(m.qid), e = x && dnFindExtraAny(x, m.text); if (!e || !dnIsPrimary(m)) return [];
  if (m.type === 'sentence') return dnSentGaps(e);
  const g = [];
  if (!(e.en && String(e.en).trim())) g.push('en');
  if (m.type === 'word') {
    const cs = dnArr(e.collocations); if (!cs.length || !cs.every(c => c && c.example && c.example.en)) g.push('col');
    const fs = e.forms; if (!Array.isArray(fs) || !fs.every(f => f && typeof f === 'object' && f.ipa)) g.push('forms'); // forms 是空陣列＝AI 已確認沒有屈折變化，視為完整；沒有這個欄位＝缺
    const ms = dnArr(e.family); if (ms.length && !ms.every(f => f && typeof f === 'object' && f.ipa && f.example && f.example.en)) g.push('fam');
    const ds = e.derived; if (!Array.isArray(ds) || !ds.every(f => f && typeof f === 'object' && f.w && f.zh && f.link)) g.push('deriv'); // derived 是空陣列＝AI 已確認沒有常見衍生字，視為完整
    const pu = e.pos_uses; if (!Array.isArray(pu) || !pu.every(f => f && typeof f === 'object' && f.pos && f.zh && f.example && f.example.en)) g.push('pos'); // pos_uses／senses 空陣列＝AI 已確認只有單一詞性／單一意思，視為完整；舊詳解沒這兩欄＝缺
    const sn = e.senses; if (!Array.isArray(sn) || !sn.every(f => f && typeof f === 'object' && f.pos && f.zh && f.example && f.example.en)) g.push('sense');
  }
  if (m.type === 'word' || m.type === 'phrase') { // 易混淆：每一筆都要有例句；沒有易混淆項目（空陣列／沒欄位）不算缺
    const cf = dnArr(e.confusable); if (cf.length && !cf.every(c => c && typeof c === 'object' && c.example && c.example.en)) g.push('conf');
    const sm = dnArr(e.similar); if (sm.length && !sm.every(c => c && typeof c === 'object' && c.example && c.example.en)) g.push('sim'); // 近義片語：每一筆都要有例句
  }
  return g;
}
/* 入庫句子：缺哪些內容（意群斷句、同義改寫、句型模板、重點字詞）；key_words 空陣列＝AI 已確認沒有值得註記的字，視為完整 */
function dnSentGaps(e) {
  const g = [], ok = (a, f) => Array.isArray(a) && a.length > 0 && a.every(o => o && typeof o === 'object' && f(o));
  if (!ok(e.chunks, c => c.en && c.zh)) g.push('schunk');
  if (!ok(e.paraphrase, c => c.en)) g.push('spara');
  if (!(e.pattern && String(e.pattern).trim())) g.push('spat');
  const kw = e.key_words;
  if (!Array.isArray(kw) || !kw.every(o => o && typeof o === 'object' && o.w && o.zh && (/\s/.test(String(o.w).trim()) || (o.ipa && o.pos)))) g.push('skw');
  return g;
}
/* 句中值得注意的字：發音＋音標詞性＋中文；已在庫的字給連結（點了看詳解），還沒入庫的字給「＋ 入庫」 */
function dnKwHtml(x, xs, e, o, i) {
  if (!o || typeof o !== 'object' || !o.w) return `<li>${dnV(o)}</li>`;
  const b = dnBanked(o.w); let act;
  if (!b) act = `<button onclick="dnAddKw(this)" data-q="${idOf(x)}" data-w="${esc(o.w)}" data-h="${esc(e.text)}" class="${dnSm} !px-2 !py-0.5 shrink-0">＋ 入庫</button>`;
  else {
    const mk = b.where === 'mark' ? dnMarks().find(q => dnKey(q.text) === dnKey(o.w)) : null;
    const lab = b.where === 'vocab' ? '核心單字' : (b.where === 'extra' || (mk && dnMerged(mk))) ? '詳解' : '已入庫';
    act = `<button onclick="dnOpenKw(this)" data-w="${esc(o.w)}" class="${dnSm} !px-2 !py-0.5 shrink-0">${lab} ›</button>`;
  }
  return `<li class="flex items-start gap-2">${dnSpk(xs, e, '_kw' + (i + 1), o.w)}<div class="flex-1 min-w-0"><b>${esc(o.w)}</b>${o.ipa ? ` <span class="text-slate-500">${esc(o.ipa)}</span>` : ''}${o.pos ? ` <i class="text-slate-500">${esc(o.pos)}</i>` : ''}${o.zh ? `　${esc(o.zh)}` : ''}</div>${act}</li>`;
}
function dnOpenKw(el) { // 已在庫的重點字詞 → 開啟詳解（已有詳解／核心單字／入庫清單）
  const w = el.dataset.w, b = dnBanked(w); if (!b) return;
  if (b.where === 'extra') { dnOpenExtra(b.qid, w); return; }
  if (b.where === 'vocab') { const a = dnArt(b.qid), i = a ? a.vocab.findIndex(v => dnKey(v.word) === dnKey(w)) : -1; if (a && i >= 0) { cur.w = a.week; cur.d = a.day; dnOpenVocab(i); } return; }
  const m = dnMarks().find(q => dnKey(q.text) === dnKey(w)); if (m) dnOpenMark(m.id);
}
function dnAddKw(el) { // 句子詳解頁：把重點字詞直接入庫（之後到「📌 入庫彙整」請 AI 補詳解）
  const q = el.dataset.q, w = el.dataset.w, head = el.dataset.h || ''; if (!q || !w) return;
  if (dnBanked(w)) { dnToast('這個已經在庫了'); render(); return; }
  const now = Date.now(), t = dnWordN(w) <= 1 ? 'word' : 'phrase';
  dnMarks().push({ id: dnId('m'), qid: q, text: w, type: t, ctx: head || w, from: 0, to: 0, src: 'detail', head, note: '', created: now, updated: now });
  save(); dnToast(`已入庫（${DNT[t]}），到「📌 入庫彙整」補詳解`); render();
}
function dnToggleFill(k) { DN.fill[k] = !DN.fill[k]; render(); }
function dnFillRow(ms) {
  if (!ms.some(m => dnMerged(m) && dnChecked(m) && dnGapsOf(m).length)) return '';
  return `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2"><span class="font-semibold text-amber-800 dark:text-amber-300">補齊內容：</span>${Object.keys(dnFillKeys).map(k => { const n = ms.filter(m => dnMerged(m) && dnGapsOf(m).includes(k)).length; return `<label class="flex items-center gap-1 cursor-pointer ${n ? '' : 'opacity-40'}"><input type="checkbox" ${DN.fill[k] ? 'checked' : ''} onchange="dnToggleFill('${k}')" class="h-3.5 w-3.5">${dnFillKeys[k]}<span class="${n ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-400'}">（${n}）</span></label>`; }).join('')}<span class="text-slate-500">（括號＝這篇有幾個字缺這項；只補勾選且缺的部分，灰色＝這篇沒有字缺）</span></div>`;
}
function dnToggleChk(id) { const m = dnMarks().find(q => q.id === id); if (!m) return; DN.chk[id] = !dnChecked(m); render(); }
function dnSetMg(v) { DN.mg = v; render(); }
function dnSetMf(v) { DN.mf = v; render(); }
function dnMgAll(open) { (DN.mgKeys || []).forEach(k => { DN.mgOpen[k] = open; }); render(); } // A–Z 全部展開／收合
/* ---- A–Z 模式的勾選與 AI 提示詞：提示詞需要整篇文章，所以依來源文章分組，每篇一份 ---- */
function dnVisFn() { const f = DN.mf; return m => f === 'all' || (f === 'gap' ? dnMerged(m) && dnGapsOf(m).length > 0 : f === 'done' ? dnMerged(m) : !dnMerged(m)); }
function dnWithVisOnly(fn) { // 暫時把目前分類看不到的項目設為未勾選，避免它們被算進提示詞
  const vis = dnVisFn(), bak = {};
  dnMarks().forEach(m => { if (!vis(m)) { bak[m.id] = DN.chk[m.id]; DN.chk[m.id] = false; } });
  try { return fn(vis); } finally { Object.keys(bak).forEach(id => { if (bak[id] === undefined) delete DN.chk[id]; else DN.chk[id] = bak[id]; }); }
}
function dnMgQids(vis) { return Array.from(new Set(dnMarks().filter(vis).map(m => m.qid))).sort((a, b) => { const A = dnArt(a), B = dnArt(b); return A && B ? (A.week - B.week) || (A.day - B.day) : a < b ? -1 : 1; }).filter(q => dnPromptItems(q).length); }
function dnMgSel() { return dnWithVisOnly(vis => { const q = dnMgQids(vis); return { nArt: q.length, nItems: q.reduce((n, id) => n + dnPromptItems(id).length, 0) }; }); }
function dnMgCopy() {
  const t = dnWithVisOnly(vis => {
    const q = dnMgQids(vis); if (!q.length) return '';
    if (q.length === 1) return dnPrompt(q[0]);
    return `以下共 ${q.length} 份獨立的任務（各對應一篇文章）。請依序處理，每一份各自產生一個獨立的 JSON 檔案，檔名以各份「輸出格式」所寫為準，不要合併成同一個檔案。\n\n` + q.map((id, i) => `==================== 第 ${i + 1}／${q.length} 份 ====================\n` + dnPrompt(id)).join('\n\n');
  });
  if (!t) { dnToast('沒有勾選可寫提示詞的項目'); return; }
  auCopy(t);
}
function dnChkLetter(c, v) { (DN.mgIds[c] || []).forEach(id => { DN.chk[id] = v; }); render(); }
function dnChkAllVis(v) { Object.keys(DN.mgIds || {}).forEach(c => DN.mgIds[c].forEach(id => { DN.chk[id] = v; })); render(); }
const FENCE = '`'.repeat(3);
const DNF = {
  en: '補上 en（英文解說）',
  col: '補上 collocations（常用搭配＋每個搭配的例句）；若現有詳解有舊的 col 字串，把裡面的搭配轉成 collocations 後刪掉 col',
  forms: '補齊 forms（只放屈折變化：單複數、第三人稱單數、過去式、過去分詞、現在分詞、比較級等；每一筆都要有 label、pos、zh、ipa；缺的也要補；衍生字不要放這裡；若這個字沒有屈折變化，輸出 "forms": []）',
  fam: '補齊 family（每一個都要有 ipa、pos、zh，以及至少 1 句 example）',
  deriv: '新增或補齊 derived（衍生字：同詞幹、由這個字加字首／字尾長出來的常見單字；每一筆都要有 w、ipa、pos、zh、link）；其他欄位一律原樣保留',
  pos: '新增或補齊 pos_uses（多詞性：同一拼法的各種詞性用法，每一筆都要有 pos、ipa、zh、example；只有單一詞性就輸出空陣列 []）；其他欄位一律原樣保留',
  sense: '新增或補齊 senses（多義：同一詞性內的不同意思，每一筆都要有 pos、zh、en、example；只有單一意思就輸出空陣列 []）；其他欄位一律原樣保留',
  conf: '補齊 confusable（易混淆）：每一筆都保留原有的 word（片語用 phrase）與 diff，並各加一句 example { en, zh }：例句必須真的用到該易混淆字、8–15 字、商務情境、同程度，且要讓人看得出它和本字的差異；缺的筆數也要補；其他欄位一律原樣保留',
  schunk: '補齊 chunks（意群斷句）：照原句順序切成 3–8 個意群，每筆 en（原文片段）＋ zh；所有 en 依序接起來必須剛好等於整句；其他欄位一律原樣保留',
  spara: '補齊 paraphrase（同義改寫）：1–2 句、意思與原句相同、換一種說法，每筆 en＋zh，程度同上，且不要與 examples 重複；其他欄位一律原樣保留',
  spat: '補齊 pattern（句型模板）：把這句抽成可重複使用的模板，可替換的部分用 V、N、時間、人物 等標示；其他欄位一律原樣保留',
  skw: '補齊 key_words（重點字詞）：每一筆都要有 w、zh；w 是單字時還要有 ipa（美式）與 pos；w 是片語時不用 ipa、pos；既有的項目保留並補齊缺的；真的沒有值得註記的字就輸出空陣列 []；其他欄位一律原樣保留',
  sim: '補齊 similar（近義片語）：每一筆都保留原有的 phrase（單字用 word）與 diff，並各加一句 example { en, zh }：例句必須真的用到該近義片語、8–15 字、商務情境、同程度，且要讓人看得出它和本片語的差異；缺的筆數也要補；其他欄位一律原樣保留'
};
function dnPromptItems(qid, only) { // only＝Set(單字小寫)：只取這些字的新項目（TSL 缺詳解用）；省略則依勾選 // 要寫進提示詞的項目：新項目＝全寫；已寫回但缺內容的＝只補缺的
  const out = [];
  dnMarksOf(qid).filter(m => only ? only.has(dnKey(m.text)) : dnChecked(m)).forEach(m => {
    if (!only && !dnIsPrimary(m)) return; // 同字在更早的篇已入庫：共用同一份，不重複寫提示詞
    if (!dnMerged(m)) { out.push({ m, fill: null }); return; }
    if (only) return;
    const g = dnGapsOf(m).filter(k => DN.fill[k]); if (g.length) out.push({ m, fill: g });
  });
  return out;
}
function dnPrompt(qid, only) {
  const x = dnArt(qid); if (!x) return '';
  const its = dnPromptItems(qid, only), lv = x.level || {}, sc = lv.score || 600, hasFill = its.some(o => o.fill);
  const items = its.map(({ m, fill }, i) => {
    let t = `${i + 1}. ` + (fill ? '【補齊】' : '') + `type=${m.type}｜text="${m.text}"` + (m.type === 'sentence' ? '' : `｜所在句："${m.ctx}"`) + (m.note ? `｜我的備註：${m.note}` : '');
    if (fill) t += `\n   要補：${fill.map(k => DNF[k]).join('；')}\n   現有詳解（既有內容保留，只補缺的）：${JSON.stringify(dnFindExtraAny(x, m.text))}`;
    return t;
  }).join('\n');
  return [
    '你是 TOEIC 英語教材編輯。請替下面「我不懂的單字／片語／句子」各寫一筆詳解。結果會寫回 daily.json 的 extra_vocab，網頁會用來顯示詳解頁。',
    '',
    `【這篇文章】W${x.week} D${x.day}｜${x.tag || ''}｜多益約 ${sc} 分${lv.cefr ? `（CEFR ${lv.cefr}` + (lv.range ? `，範圍 ${lv.range}` : '') + '）' : ''}`,
    '',
    '【程度規則（很重要）】',
    `- 說明、例句、搭配、相關字都要控制在多益約 ${sc} 分的程度：用字與句型不要超過這個程度；例句 8–15 字、商務情境、不要用罕見字。`,
    '- 中文一律繁體；音標用美式 IPA（含斜線，如 /kənˈfɜːrm/）。',
    '- note 要說明「在這篇文章裡」的用法與語感，1–3 句，不要寫成字典式長篇。',
    '- 沒有內容的欄位直接省略，不要寫空字串或 null；選填欄位（grammar_note、confusable 的 usage）沒有必要就不要寫。',
    '',
    '【內容規則（單字、片語）】',
    '- 英文解說 en：用同程度的簡單英文一句話解釋，不要用比該字更難的字。',
    '- 例句 examples 數量不限：依這個字或片語實際常見的用法與情境判斷。只有一種常見用法就 2–3 句；有多個詞義、詞性或情境（會議、電子郵件、採購、出差…）就每個情境各 1–2 句，通常 3–6 句、最多 8 句。每句加 tag 標示情境（如「會議」「電子郵件」）；不要為了湊數寫重複的句型。',
    '- 常用搭配 collocations（單字）：列出多益常見的搭配（通常 2–5 個），每個搭配都要有自己的例句 example，例句必須真的用到該搭配，且不要與 examples 重複（網頁會把這些例句放進「例句」區並標上「常用搭配」）。',
    '- 屈折變化 forms（單字，Inflections）：只列同一個字「拼法變化」的屈折形（例：work → works、worked、working）——名詞的單數／複數、動詞的第三人稱單數／過去式／過去分詞／現在分詞、形容詞的比較級與副詞形式等；不規則變化一定要列。每一筆都要有 label（如「複數」「過去式」）、pos、zh、ipa。加字尾或字首長出來的新字（worker、workable）不是屈折變化，一律放 derived，不要放 forms。若這個字沒有屈折變化（如介系詞、連接詞、多數副詞），輸出 "forms": []（空陣列，網頁會視為已確認、不再列入未完整）。',
    '- 易混淆 confusable（單字、片語）：容易和本字／本片語搞混的字（拼法、發音或意思相近），通常 1–3 個、同程度。每一筆都要有 word（片語用 phrase）、diff（一句話說明和本字的差異），以及 example（en + zh）：例句 8–15 字、商務情境、必須真的用到「該易混淆字」，並讓讀者從句意看出它和本字的差異；不要只寫 diff 沒有例句。真的沒有容易混淆的字就省略這個欄位。若兩者的差異不只是意思（例如詞性不同、及物與不及物、可數與不可數、後面接的句型不同），才在該筆加選填的 usage（一到兩句繁體中文，具體說明用法或文法差異，如「affect 是動詞、effect 是名詞」）；只是意思不同就不要寫 usage。',
    '- 近義片語 similar（單字、片語）：意思相近、可以互相替換（或常被拿來比較）的字或片語，通常 1–3 個、同程度。每一筆都要有 phrase（單字用 word）、diff（一句話說明和本項目在語氣、用法或後面接的詞上的差異），以及 example（en + zh）：例句 8–15 字、商務情境、必須真的用到「該近義片語」。不要與 confusable 重複（confusable 是拼法、發音容易搞混的字；similar 是意思相近的說法）。真的沒有就省略這個欄位。',
    '- 文法說明 grammar_note（單字、片語，選填）：只有當這個字或片語有學習者「真的容易用錯」的文法點時才寫，一到兩句繁體中文，要具體、可直接套用，例如「look forward to 的 to 是介系詞，後面接 V-ing，不接原形」「information 是不可數名詞，不加 s」。常見的固定搭配、被動或使役句型、後面接 to V 還是 V-ing、可數或不可數、介系詞選擇都算。沒有特別的文法點就整個省略這個欄位，不要為了湊數寫「這是個及物動詞」這類空話；也不要和 note、pattern、confusable 的 usage 重複同一件事。',
    '- 相關字 family（單字，語意相近或常一起考的字，例：invoice → bill、receipt；不是同詞幹的字，同詞幹的放 derived）最多 4 個、同程度；每個都要有 ipa、pos、zh，以及至少 1 句例句 example（en + zh）。超過這個程度的字不要列。',
    '- 衍生字 derived（單字，即「同字族 Word Family」，例：work → worker、workable）：列出與這個字「同一個詞幹」、直接衍生的常見單字，最多 6 個（通常 3–6 個；真正常見的只有 1–2 個就只列那幾個，不要為了湊數硬找，也不要列不相關的字）（例如 invent → invention、inventor、inventive、inventory），只放同詞幹加字首／字尾長出來的字，不要擴及只是字根相同但拼法差很多的字（如 event、convenient）。由最基礎的字開始排。每一筆要有 w、ipa、pos、zh，以及 link（記憶連結）：用簡單直覺的繁體中文，說明「詞幹加什麼字尾，變成什麼意思」，並盡量連到我已知的單字（例：「invent + -or，做事的人，像 actor、visitor」）。這個字本身不要放進 derived；如果項目的 text 是變化形（如 updates、submitted），以原形（update、submit）為詞幹，原形本身也不要放進 derived；程度同上，太難或罕見的字不要列；單純的屈折變化（複數、第三人稱單數、過去式、-ing 分詞、比較級）已在 forms，不要放進 derived。worker、workable、submission 這類加字尾長出的字一律放 derived（forms 只放屈折變化）。若這個字真的沒有常見的衍生字，輸出 "derived": []（空陣列，這是唯一允許的空欄位），網頁會視為已確認、不再列入未完整。',
    '- 多詞性 pos_uses（單字）：同一個拼法在多益常見的「不同詞性」用法（例：bill 是 n. 帳單、v. 開帳單；present 是 n.／v.／adj.；record、increase、order、issue 都是）。每個詞性一筆，包含這個字在本篇的詞性本身。每一筆要有 pos、ipa（不同詞性發音或重音不同時要分開寫，如 record n. /ˈrekɚd/、v. /rɪˈkɔːrd/）、zh（該詞性最常用的意思）、example（en + zh，8–15 字、商務情境、必須真的用該詞性）；本篇用到的那一筆加 "in_passage": true，並排在第一個，其餘依多益常見度排序。只列多益真的常見的詞性（通常 2–3 個）。不要與 forms 重複（複數、過去式等屈折變化放 forms，不是不同詞性）。如果這個字在多益只當一種詞性用，輸出 "pos_uses": []（空陣列，與 derived 相同，是允許的空欄位，網頁會視為已確認）。',
    '- 多義 senses（單字）：同一個詞性裡「不同的意思」（例：bill 當 n. 時有「帳單」「法案」「紙鈔」；issue 當 n. 時有「議題」「發行期數」）。不同詞性的差異放 pos_uses，這裡只放「同詞性、不同意思」，兩邊不要重複列同一件事。最多 4 個，只列多益常見的；本篇用到的那個意思加 "in_passage": true 並排第一，其餘依多益常見度排序。每一筆要有 pos、zh、en（同程度的簡單英文一句話）、example（en + zh，8–15 字、商務情境、必須真的用該意思），可加 distinguish 一句話說明和其他意思如何從情境分辨。如果這個字在多益只有一個常見意思，輸出 "senses": []（空陣列，網頁會視為已確認）。',
    '- 原形 lemma（單字）：如果項目的 text 是變化形（如 billed、updates、submitted、working），要多寫 "lemma": "原形"（bill、update、submit、work）；這時 pos_uses、senses、forms、derived 都以「原形」為準來寫（例：text 是 billed，就要寫 bill 當 n. 與 v. 的各種詞性、bill 的各個意思）；本篇文章實際用到的詞性或意思標 "in_passage": true（billed 在文章裡是動詞 → bill 的 v. 那一筆）。pos_uses 每一筆可選加 "w"（該筆的拼法，預設就是原形）：只有變化形本身另有常見的獨立詞性時才寫（例：interested 當形容詞 → "w": "interested"）。forms 列原形的屈折形，不含 text 本身與原形。text 本身就是原形時不要寫 lemma。',
    '',
    '【內容規則（句子）】',
    '- 句子的 text 必須整句照抄。翻譯與解釋要參考上面的「文章全文」來判斷 it、this、they 等指代與語氣，但只解釋這一句。',
    '- zh：整句繁體中文翻譯，通順自然。',
    '- 意群斷句 chunks：照原句順序切成 3–8 個意群（主詞、動詞片語、受詞、介系詞片語、子句、連接詞…），每個意群以 2–6 個字為宜；每一筆有 en（原文片段）與 zh（該片段的中文）。所有 en 依序接起來必須剛好等於整句，不可增減或改寫任何字。',
    '- 句型結構 structure：用一行拆解句型，例如「Please + V（祈使）＋ by + 時間」。',
    '- 文法重點 grammar：1–3 個這句真正值得學的文法點，每筆 point 與 explain（繁體中文、具體）。',
    '- 句型模板 pattern（每句都要有）：把這句抽成可重複使用的模板，可替換的部分用 V、N、時間、人物 等標示，例如「Please + V + by + 時間」。',
    '- 同義改寫 paraphrase（必填，1–2 句）：意思與原句相同、換一種說法（換字、換句型、主動與被動互換、片語改單字等），程度同上。不要與 examples 重複：examples 是「同句型、換內容」，paraphrase 是「同內容、換說法」。每筆有 en、zh。',
    '- 例句 examples（1–2 句）：同句型、換成不同內容的商務例句，8–15 字。',
    '- 重點字詞 key_words：這句裡對該程度值得注意的單字或片語，通常 2–5 個，太簡單的字不要列。每一筆要有 w、zh；w 是單字時還要有 ipa（美式）與 pos；w 是片語時不用 ipa、pos。w 用句子裡實際出現的拼法。真的沒有值得註記的字，輸出 \"key_words\": []（空陣列，是允許的空欄位）。',
    '- 語氣與用途 note（選填）：這句話在這篇文章裡的語氣與用途（例如客氣的請求、正式通知、委婉拒絕），1–2 句；沒有特別之處就省略。',
    '',
    '【文章全文】',
    String(x.passage || ''),
    '',
    '【要寫的項目】（每項的 text 必須與下面完全相同，不可改寫或加減字）',
    items || '（尚未勾選任何項目）',
    '',
    ...(hasFill ? [
      '【補齊規則】',
      '- 標示【補齊】的項目，請輸出「完整的一筆」：保留現有詳解的所有內容（text、zh、note、examples 等一律不要改動，即使你覺得可以寫得更好），再加上「要補」的部分。',
      '- 輸出會用 text 整筆取代舊的，所以不能只寫新增的欄位。',
      '- 「要補」沒有列出的欄位（zh、ipa、pos、en、note、forms、collocations、examples、confusable、family、derived、pos_uses、senses、grammar_note、confusable 的 usage、chunks、structure、grammar、pattern、paraphrase、key_words 等），必須逐字原樣抄回，不可改寫、刪減、重新排序或「順便優化」；只有「要補」列出的欄位可以新增或補齊。',
      ''
    ] : []),
    '【輸出格式】',
    `請直接產生一個「可下載的 JSON 檔案」，檔名 w${x.week}d${x.day}_extra.json（UTF-8、純 JSON，不要包 markdown 程式碼框）。聊天裡只需一句話說明檔案已產生，不要貼出全文。若你無法產生檔案，才改成只輸出一個 json 程式碼區塊（${FENCE}json … ${FENCE}），區塊外不加任何文字。內容是單一物件，extra_vocab 依上面項目順序、每項一筆；不要輸出文章的其他欄位，不要修改既有資料。檔案內容格式：`,
    FENCE + 'json',
    `{ "week": ${x.week}, "day": ${x.day}, "extra_vocab": [ { …依 type 填欄位… } ] }`,
    FENCE,
    '',
    '各 type 的欄位（範例只示範格式，內容請依實際項目寫）：',
    '▸ word（單字）',
    FENCE + 'json',
    '{ "text": "invoice", "type": "word", "ipa": "/ˈɪnvɔɪs/", "pos": "n.", "zh": "發票、請款單", "en": "a document that lists what was sold and how much to pay", "note": "…在這篇的用法…", "grammar_note": "（選填）容易用錯的文法點", "forms": [ { "w": "invoices", "label": "複數", "pos": "n.", "zh": "發票（複數）", "ipa": "/ˈɪnvɔɪsɪz/" }, { "w": "invoiced", "label": "過去式／過去分詞", "pos": "v.", "zh": "開立發票", "ipa": "/ˈɪnvɔɪst/" } ], "collocations": [ { "phrase": "send an invoice", "zh": "寄發票", "example": { "en": "…", "zh": "…" } }, { "phrase": "pay an invoice", "zh": "付發票款項", "example": { "en": "…", "zh": "…" } } ], "examples": [ { "tag": "情境", "en": "…", "zh": "…" } ], "confusable": [ { "word": "receipt", "diff": "…差異…", "usage": "（選填）用法／文法上的差異", "example": { "en": "…", "zh": "…" } } ], "family": [ { "w": "bill", "pos": "n.", "zh": "帳單", "ipa": "/bɪl/", "example": { "en": "…", "zh": "…" } } ], "derived": [ { "w": "invoicing", "pos": "n.", "zh": "開立發票作業", "ipa": "/ˈɪnvɔɪsɪŋ/", "link": "invoice + -ing，把「開發票」這件事變成名詞" } ], "pos_uses": [ { "pos": "n.", "ipa": "/ˈɪnvɔɪs/", "zh": "發票", "in_passage": true, "example": { "en": "…", "zh": "…" } }, { "pos": "v.", "ipa": "/ˈɪnvɔɪs/", "zh": "開發票給（某人）", "example": { "en": "…", "zh": "…" } } ], "senses": [ { "pos": "n.", "zh": "發票", "en": "…", "in_passage": true, "example": { "en": "…", "zh": "…" } }, { "pos": "n.", "zh": "（一筆）請款", "en": "…", "distinguish": "…", "example": { "en": "…", "zh": "…" } } ] }',
    FENCE,
    '▸ phrase（片語／搭配）',
    FENCE + 'json',
    '{ "text": "no later than", "type": "phrase", "zh": "最遲在…之前", "en": "not after a certain time", "note": "…", "pattern": "no later than + 時間", "grammar_note": "（選填）容易用錯的文法點", "examples": [ { "tag": "情境", "en": "…", "zh": "…" } ], "similar": [ { "phrase": "by", "diff": "…", "example": { "en": "…", "zh": "…" } } ], "confusable": [ { "word": "…", "diff": "…", "example": { "en": "…", "zh": "…" } } ] }',
    FENCE,
    '▸ sentence（句子：重點在文法與句型）',
    FENCE + 'json',
    '{ "text": "（整句照抄）", "type": "sentence", "zh": "整句中文翻譯", "note": "（選填）這句在文章裡的語氣與用途", "chunks": [ { "en": "Please submit your report", "zh": "請提交你的報告" }, { "en": "by Friday", "zh": "在星期五之前" } ], "structure": "句型結構拆解，例如：Please + V（祈使）＋ by + 時間", "grammar": [ { "point": "by + 時間", "explain": "…" } ], "pattern": "Please + V + by + 時間", "paraphrase": [ { "en": "同義改寫（意思相同、換說法）", "zh": "…" } ], "examples": [ { "en": "同句型、換內容的例句", "zh": "…" } ], "key_words": [ { "w": "submit", "ipa": "/səbˈmɪt/", "pos": "v.", "zh": "提交" }, { "w": "no later than", "zh": "最遲在…之前" } ] }',
    FENCE,
    '單字／片語的例句數量依情境自行判斷（見「內容規則」）；句子的欄位與數量見「內容規則（句子）」。'
  ].join('\n');
}
function dnListText(qid) {
  return dnMarksOf(qid).filter(dnChecked).map(m => `[${DNT[m.type]}] ${m.text}` + (m.type === 'sentence' ? '' : `  —  ${m.ctx}`) + (m.note ? `  （備註：${m.note}）` : '')).join('\n');
}
/* ===== 核心多益單字的缺口（還沒入庫的）：none＝完全沒有詳解、gap＝有詳解但缺內容。已入庫的字交給下面一般清單處理，不重複列 ===== */
function dnCoreGaps(kind) {
  const seen = new Set(), out = [];
  dnArts().forEach(x => {
    const id = idOf(x), list = [];
    (x.vocab || []).forEach((v, i) => {
      const t = String((v && v.word) || '').trim(), k = dnKey(t); if (!t || seen.has(k)) return; seen.add(k);
      if (dnMarks().some(m => dnKey(m.text) === k)) return;
      const has = !!dnExtraSrc(x, t); if (kind === 'none' ? has : !has) return;
      const gaps = has ? dnGapsOf({ id: '~', qid: id, text: t, type: /\s/.test(t) ? 'phrase' : 'word' }) : [];
      if (kind === 'gap' && !gaps.length) return;
      list.push({ v, t, i, gaps });
    });
    if (list.length) out.push({ x, id, list });
  });
  return out;
}
const dnCoreN = g => g.reduce((s, o) => s + o.list.length, 0);
function dnCoreAdd(qid, kind, copy) { // 把這篇的核心單字缺口加入入庫；copy＝順便複製只含這些字的 AI 提示詞
  const o = dnCoreGaps(kind).find(q => q.id === qid); if (!o) return;
  const only = new Set(); o.list.forEach(it => { dnMarkVocab(o.x, it.v); only.add(dnKey(it.t)); });
  save();
  if (copy) { auCopy(dnPrompt(qid, only)); dnToast('已入庫並複製提示詞，貼給 AI'); } else dnToast(`已加入入庫 ${o.list.length} 個字`);
  render();
}
function dnCoreSec(kind) {
  const g = dnCoreGaps(kind); if (!g.length) return '';
  const none = kind === 'none', bs = `${btn} ${dnLine} !py-1 !px-2.5 text-xs`;
  return `<section class="${card} p-4 mb-4"><h3 class="font-bold text-sm">${none ? '核心多益單字：還沒有詳解' : '核心多益單字：詳解不完整'} <span class="text-xs font-normal text-slate-400">${dnCoreN(g)}</span></h3>
    <p class="text-xs text-slate-500 mt-1 leading-relaxed">${none ? '這些字在文章的核心單字裡，但還沒有詳解、也還沒入庫。按「加入入庫並複製提示詞」會把它們入庫，並複製只含這些字的 AI 提示詞。' : '這些字有詳解但缺內容（括號是缺的項目）。按「加入入庫」後，到下方該篇勾選「補齊內容」再複製提示詞。'}</p>`
    + g.map(o => `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><div class="flex flex-wrap items-center justify-between gap-2"><button onclick="dnGoArt('${o.id}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(o.id))}</button>
      <div class="flex flex-wrap gap-1.5">${none ? `<button onclick="dnCoreAdd('${o.id}','none',true)" class="${btn} ${dnPri} !py-1 !px-2.5 text-xs">加入入庫並複製提示詞（${o.list.length}）</button>` : ''}<button onclick="dnCoreAdd('${o.id}','${kind}',false)" class="${bs}">加入入庫</button></div></div>
      <div class="flex flex-wrap gap-1.5 mt-2">${o.list.map(it => `<button onclick="tslOpen(${o.x.week},${o.x.day},${it.i})" class="text-xs rounded-full px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 cursor-pointer">${esc(it.t)}${it.gaps.length ? `（${it.gaps.map(k => dnFillKeys[k] || k).join('、')}）` : ''}</button>`).join('')}</div></div>`).join('')
    + `</section>`;
}
function dnRenderMarks() {
  const all = dnMarks(), pri = all.filter(dnIsPrimary), done = pri.filter(dnMerged).length, todo = pri.length - done; // 同一個字只算一次
  const cNone = dnCoreN(dnCoreGaps('none')), cGap = dnCoreN(dnCoreGaps('gap')), f = DN.mf, vis = m => f === 'all' || (f === 'gap' ? dnMerged(m) && dnGapsOf(m).length > 0 : f === 'done' ? dnMerged(m) : !dnMerged(m));
  const ids = Array.from(new Set(all.filter(vis).map(m => m.qid))).sort((a, b) => { const A = dnArt(a), B = dnArt(b); return A && B ? (A.week - B.week) || (A.day - B.day) : a < b ? -1 : 1; });
  const fb = (v, label, n) => `<button onclick="dnSetMf('${v}')" class="${btn} !py-1.5 !px-3 text-xs ${f === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label} <span class="opacity-70">${n}</span></button>`;
  let h = `<header class="mb-4 flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">📌 入庫彙整</h2>${dnBackBtn()}</header>
    <div class="${card} p-4 mb-4"><div class="flex flex-wrap gap-2">${fb('todo', '待補詳解', todo + cNone)}${fb('done', '詳解已寫回', done)}${fb('gap', '未完整詳解', all.filter(m => dnMerged(m) && dnGapsOf(m).length).length + cGap)}${fb('all', '全部', pri.length)}</div>
    <div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><span class="text-xs text-slate-500">排列</span><button onclick="dnSetMg('art')" class="${btn} !py-1.5 !px-3 text-xs ${DN.mg !== 'abc' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">依文章</button><button onclick="dnSetMg('abc')" class="${btn} !py-1.5 !px-3 text-xs ${DN.mg === 'abc' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">A–Z（全域）</button></div>
    <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><button onclick="dnExportMarks()" class="${btn} ${dnLine} !py-1.5 text-xs">匯出入庫 JSON</button>
    <label class="${btn} ${dnLine} !py-1.5 text-xs cursor-pointer">匯入合併 JSON<input type="file" accept=".json,application/json" class="hidden" onchange="dnImportMarks(this)"></label></div>
    <p class="text-xs text-slate-500 mt-3 leading-relaxed"><b>流程：</b>① 在文稿選字入庫 → ② 這裡按「複製 AI 提示詞」貼給 AI → ③ AI 回傳的 JSON 存成 <code>w{週}d{天}_extra.json</code>，放在 daily.json 同資料夾 → ④ 執行 json_merge.py（選「每日文章」）合併 → ⑤ 重新整理網頁，該項目就會顯示「詳解已寫回」，點進去看詳解。<br><b>未完整詳解：</b>已寫回、但缺英文解說／搭配例句／詞性變化發音／相關字音標例句／衍生字／易混淆例句的項目。勾選後，在該區「補齊內容」選擇要補哪些，提示詞會連同現有詳解交給 AI，合併時會整筆取代舊的。<br>入庫只存在這個瀏覽器；在手機入庫、電腦合併時，用上面的「匯出／匯入」搬過去。</p></div>`;
  const coreSec = f === 'todo' ? dnCoreSec('none') : f === 'gap' ? dnCoreSec('gap') : ''; h += coreSec;
  if (!ids.length && !coreSec) h += `<p class="text-sm text-slate-400 text-center py-10">${all.length ? '這個分類沒有項目。' : '還沒有入庫。到文章頁選取不懂的字、片語或句子，按「＋ 入庫」。'}</p>`;
  if (DN.mg === 'abc') { // 全域 A–Z：不分週次，來源只用小字標示
    const list = all.filter(vis).filter(dnIsPrimary).slice().sort((a, b) => dnKey(a.text).localeCompare(dnKey(b.text))), g = {};
    list.forEach(m => { const c = (dnKey(m.text).replace(/[^a-z]/g, '')[0] || '#').toUpperCase(); (g[c] = g[c] || []).push(m); });
    DN.mgKeys = Object.keys(g).sort(); DN.mgIds = {}; DN.mgKeys.forEach(c => { DN.mgIds[c] = g[c].map(m => m.id); });
    if (DN.mgKeys.length) {
      const sel = f === 'done' ? null : dnMgSel(), bs = `${btn} ${dnLine} !py-1 !px-3 text-xs`;
      h += `<div class="${card} p-3 mb-3">${sel ? `<div class="flex flex-wrap items-center gap-2"><button onclick="dnMgCopy()" ${sel.nItems ? '' : 'disabled'} class="${btn} ${dnPri} !py-1.5 text-xs disabled:opacity-40">複製 AI 提示詞（${sel.nItems} 項${sel.nArt > 1 ? `・${sel.nArt} 篇` : ''}）</button><button onclick="dnChkAllVis(true)" class="${bs}">全選</button><button onclick="dnChkAllVis(false)" class="${bs}">全不選</button></div>${dnFillRow(list)}` : ''}<div class="flex justify-end gap-2 ${sel ? 'mt-2' : ''}"><button onclick="dnMgAll(true)" class="${bs}">全部展開</button><button onclick="dnMgAll(false)" class="${bs}">全部收合</button></div></div>`;
    }
    h += DN.mgKeys.map(c => `<details class="${card} p-3 mb-3 group" ${DN.mgOpen[c] ? 'open' : ''} ontoggle="DN.mgOpen['${c}']=this.open"><summary class="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"><span class="text-xs text-slate-400 w-3 transition-transform group-open:rotate-90">▶</span><span class="text-lg font-bold w-6">${c}</span><span class="text-xs text-slate-400">${g[c].length}</span>${f === 'done' ? '' : `<input type="checkbox" ${g[c].every(dnChecked) ? 'checked' : ''} onchange="dnChkLetter('${c}', this.checked)" onclick="event.stopPropagation()" class="ml-auto mr-1 h-4 w-4 cursor-pointer" aria-label="選取這個字母全部">`}</summary><div class="divide-y divide-slate-100 dark:divide-slate-800 mt-1">${g[c].map(m => {
      const mg = dnMerged(m), a = dnArt(m.qid);
      return `<div class="py-2 flex items-start gap-2">${f === 'done' ? '' : `<input type="checkbox" ${dnChecked(m) ? 'checked' : ''} onchange="dnToggleChk('${m.id}')" class="mt-1.5 h-4 w-4 shrink-0 cursor-pointer" aria-label="選取">`}<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><span class="${dnChip} ${DNTC[m.type]}">${DNT[m.type]}</span><b class="text-sm break-words">${esc(m.text)}</b>${mg ? '<span class="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 font-semibold">✔ 已寫回</span>' : ''}${a ? `<span class="text-[0.6875rem] text-slate-400">${dnLabel(a)}</span>` : ''}${mg && dnGapsOf(m).length ? `<span class="text-[0.6875rem] text-amber-600 dark:text-amber-400">缺：${dnGapsOf(m).map(k => dnFillKeys[k]).join('、')}</span>` : ''}</div>${m.type !== 'sentence' && m.ctx ? `<p class="text-xs text-slate-500 mt-0.5 break-words">${esc(m.ctx)}</p>` : ''}${m.note ? `<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5 break-words">備註：${esc(m.note)}</p>` : ''}</div>
        <div class="flex flex-col gap-1 shrink-0"><button onclick="dnOpenExtra('${m.qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${dnSm}">詳解</button>${mg ? '' : `<button onclick="dnMarkMenu('${m.id}')" class="${dnSm}">✎</button><button onclick="dnDelMark2('${m.id}')" class="text-xs text-rose-500 hover:underline cursor-pointer">刪除</button>`}</div></div>`;
    }).join('')}</div></details>`).join('');
    if (list.length) h += `<p class="text-xs text-slate-400 mb-4">勾選的字若來自多篇文章，會依文章分成多份提示詞（每篇各產生一個 w?d?_extra.json），請依序貼給 AI。</p>`;
    main.innerHTML = h; return;
  }
  ids.forEach(qid => {
    const x = dnArt(qid), ms = dnMarksOf(qid).filter(vis), nSel = dnPromptItems(qid).length;
    if (f === 'done') { // 「詳解已寫回」：只單純列出單字，不提供勾選／提示詞／補齊／編輯
      h += `<section class="${card} p-4 mb-4"><div class="mb-2"><button onclick="dnGoArt('${qid}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(qid))}</button>${x && x.level ? ` ${lvBadge(x)}` : ''}</div>
        <div class="divide-y divide-slate-100 dark:divide-slate-800">${ms.map(m => `<div class="py-2 flex items-center gap-2"><span class="${dnChip} ${DNTC[m.type]}">${DNT[m.type]}</span><button onclick="vplay('${qid}', this.dataset.t, '', this.dataset.t)" data-t="${esc(m.text)}" class="min-w-0 flex-1 text-left text-sm font-bold break-words cursor-pointer hover:text-indigo-600" aria-label="發音">${esc(m.text)} <span class="text-slate-400 font-normal">🔊</span></button><button onclick="dnOpenExtra('${qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${dnSm} shrink-0">詳解 ›</button></div>`).join('')}</div></section>`;
      return;
    }
    h += `<section class="${card} p-4 mb-4"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><div class="min-w-0"><button onclick="dnGoArt('${qid}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(qid))}</button>${x && x.level ? ` ${lvBadge(x)}` : ''}</div>
      <div class="flex flex-wrap gap-1.5"><button onclick="auCopy(dnPrompt('${qid}'))" ${nSel ? '' : 'disabled'} class="${btn} ${dnPri} !py-1.5 text-xs disabled:opacity-40">複製 AI 提示詞（${nSel}）</button><button onclick="auCopy(dnListText('${qid}'))" ${nSel ? '' : 'disabled'} class="${btn} ${dnLine} !py-1.5 text-xs disabled:opacity-40">複製清單</button></div></div>
      ${dnFillRow(ms)}<div class="divide-y divide-slate-100 dark:divide-slate-800">${ms.map(m => {
        const mg = dnMerged(m);
        return `<div class="py-2 flex items-start gap-2"><input type="checkbox" ${dnIsPrimary(m) && dnChecked(m) ? 'checked' : ''} ${dnIsPrimary(m) ? '' : 'disabled'} onchange="dnToggleChk('${m.id}')" class="mt-1.5 h-4 w-4 shrink-0 ${dnIsPrimary(m) ? 'cursor-pointer' : 'opacity-30'}" aria-label="選取">
          <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><span class="${dnChip} ${DNTC[m.type]}">${DNT[m.type]}</span><b class="text-sm break-words">${esc(m.text)}</b>${mg ? '<span class="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 font-semibold">✔ 已寫回</span>' : ''}${dnIsPrimary(m) ? '' : `<span class="text-[0.6875rem] text-sky-600 dark:text-sky-400">↔ 與 ${dnLabel(dnArt(dnPrimaryOf(m).qid))} 共用同一份</span>`}${mg && dnGapsOf(m).length ? `<span class="text-[0.6875rem] text-amber-600 dark:text-amber-400">缺：${dnGapsOf(m).map(k => dnFillKeys[k]).join('、')}</span>` : ''}</div>
          ${m.type !== 'sentence' ? `<p class="text-xs text-slate-500 mt-0.5 break-words">${esc(m.ctx)}</p>` : ''}${m.note ? `<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5 break-words">備註：${esc(m.note)}</p>` : ''}</div>
          <div class="flex flex-col gap-1 shrink-0">${mg ? `<button onclick="dnOpenExtra('${m.qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${dnSm}">詳解</button>` : ''}${mg ? '' : `<button onclick="dnMarkMenu('${m.id}')" class="${dnSm}">✎</button>`}${mg ? '' : `<button onclick="dnDelMark2('${m.id}')" class="text-xs text-rose-500 hover:underline cursor-pointer">刪除</button>`}</div></div>`;
      }).join('')}</div>
      <details class="mt-2"><summary class="text-xs text-slate-500 cursor-pointer">預覽提示詞</summary><textarea readonly rows="10" class="${dnInp} mt-2 font-mono text-xs">${esc(dnPrompt(qid))}</textarea></details></section>`;
  });
  main.innerHTML = h;
}
function dnExportMarks() {
  if (!dnMarks().length) { dnToast('沒有可匯出的入庫'); return; }
  dnDownload(`daily-marks-${dnStamp()}.json`, JSON.stringify({ app: 'toeic-daily-marks', v: 1, exported: Date.now(), marks: dnMarks() }, null, 2), 'application/json');
}
function dnImportMarks(input) {
  const f = input.files[0]; if (!f) return; const fr = new FileReader();
  fr.onload = () => {
    try {
      const j = JSON.parse(fr.result), arr = Array.isArray(j) ? j : j && j.marks;
      if (!Array.isArray(arr)) throw new Error('找不到 marks 陣列');
      let add = 0, upd = 0;
      arr.forEach(r => {
        if (!r || typeof r.id !== 'string' || typeof r.qid !== 'string' || !r.text) return;
        const n = { id: r.id, qid: r.qid, text: String(r.text), type: DNT[r.type] ? r.type : 'word', ctx: String(r.ctx || r.text), from: +r.from || 0, to: +r.to || 0, note: String(r.note || ''), created: +r.created || Date.now(), updated: +r.updated || +r.created || Date.now() };
        const o = dnMarks().find(q => q.id === n.id) || dnMarks().find(q => q.qid === n.qid && dnKey(q.text) === dnKey(n.text));
        if (!o) { dnMarks().push(n); add++; } else if (n.updated > (o.updated || 0)) { n.id = o.id; Object.assign(o, n); upd++; }
      });
      save(); dnToast(`匯入完成：新增 ${add}、更新 ${upd}`); render();
    } catch (e) { alert('匯入失敗：' + e.message); }
  };
  fr.readAsText(f, 'utf-8'); input.value = '';
}

/* ======================= 詳解頁 ======================= */
function dnOpenVocab(i) { const x = find(cur.w, cur.d); if (!x || !x.vocab[i]) return; cur.det = { kind: 'vocab', i }; dnNav('detail'); }
function dnOpenExtra(qid, text) { const x = dnArt(qid); if (!x) return; if (cur.w != x.week || cur.d != x.day) { cur.w = x.week; cur.d = x.day; } cur.det = { kind: 'extra', text }; dnNav('detail'); }
function dnAddFromVocab(i) { // 核心單字沒有詳解時：一鍵入庫（之後用提示詞請 AI 補）
  const x = find(cur.w, cur.d), v = x && x.vocab[i]; if (!v) return;
  const id = idOf(x), p = String(x.passage || '');
  if (dnMarks().some(m => m.qid === id && dnKey(m.text) === dnKey(v.word))) { dnToast('已經入庫了'); return; }
  const stem = /\s/.test(v.word) ? v.word : v.word.replace(/e$/i, ''), re = new RegExp('\\b' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-z]*', 'i'), mm = re.exec(p);
  const from = mm ? mm.index : 0, to = mm ? mm.index + v.word.length : 0, now = Date.now();
  dnMarks().push({ id: dnId('m'), qid: id, text: v.word, type: /\s/.test(v.word) ? 'phrase' : 'word', ctx: mm ? dnCtxOf(p, from, to, v.word) : v.word, from: mm ? from : 0, to: mm ? to : 0, note: '', created: now, updated: now });
  save(); dnToast('已入庫，可到「📌 入庫彙整」產生提示詞'); render();
}
function dnMarkVocab(x, v) { // 核心單字 → 入庫（已存在就回傳舊的）；不重繪、不存檔，呼叫端自己 save()
  const id = idOf(x), p = String(x.passage || ''), old = dnMarks().find(m => m.qid === id && dnKey(m.text) === dnKey(v.word));
  if (old) return old;
  const stem = /\s/.test(v.word) ? v.word : v.word.replace(/e$/i, ''), re = new RegExp('\\b' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-z]*', 'i'), mm = re.exec(p);
  const from = mm ? mm.index : 0, to = mm ? mm.index + v.word.length : 0, now = Date.now();
  const m = { id: dnId('m'), qid: id, text: v.word, type: /\s/.test(v.word) ? 'phrase' : 'word', ctx: mm ? dnCtxOf(p, from, to, v.word) : v.word, from: mm ? from : 0, to: mm ? to : 0, note: '', created: now, updated: now };
  dnMarks().push(m); return m;
}
const dnV = o => typeof o === 'string' ? esc(o) : (o && typeof o === 'object' ? Object.values(o).filter(v => v != null && v !== '').map(v => esc(v)).join(' · ') : esc(o == null ? '' : o));
const dnArr = v => Array.isArray(v) ? v : (v ? [v] : []);
function dnDetailData() {
  const x = find(cur.w, cur.d), d = cur.det || {}; if (!x) return null;
  let base = null, text;
  if (d.kind === 'vocab') { base = x.vocab[d.i]; if (!base) return null; text = base.word; } else text = d.text;
  const ex = dnFindExtraAny(x, text), src = ex ? dnExtraSrc(x, text) : null, m = dnMarksOf(idOf(x)).find(q => dnKey(q.text) === dnKey(text));
  const e = Object.assign({}, base || {}, ex || {}); e.text = text; e.type = (ex && ex.type) || (base ? (/\s/.test(text) ? 'phrase' : 'word') : (m && m.type) || 'word');
  return { x, e, base, ex, m, src, i: d.i };
}
function dnHiCtx(ctx, text) {
  const i = String(ctx).toLowerCase().indexOf(String(text).toLowerCase());
  return i < 0 ? esc(ctx) : esc(ctx.slice(0, i)) + `<b class="bg-amber-100 dark:bg-amber-400/20 rounded">${esc(ctx.slice(i, i + text.length))}</b>` + esc(ctx.slice(i + text.length));
}
const dnSpk = (x, e, suf, w) => `<button onclick="vplay('${idOf(x)}', this.dataset.t, '${suf}', this.dataset.w)" data-t="${esc(e.text)}" data-w="${esc(w)}" class="text-slate-400 hover:text-indigo-600 shrink-0" aria-label="發音">🔊</button>`;
const dnExHtml = o => o && o.en ? `<p>${esc(o.en)}</p>${o.zh ? `<p class="text-xs text-slate-500">${esc(o.zh)}</p>` : ''}` : '';
function dnCopyOne() { // 詳解頁：只為這個字複製 AI 提示詞（核心單字會順便入庫，提示詞需要所在句）
  const D = dnDetailData(); if (!D) return;
  const mk = D.m || (D.base && dnMarkVocab(D.x, D.base)); if (!mk) return;
  save();
  auCopy(dnPrompt(idOf(D.x), new Set([dnKey(mk.text)]))); dnToast('已複製這個字的提示詞，貼給 AI');
}
function dnRenderDetail() {
  const D = dnDetailData();
  if (!D) { main.innerHTML = `<div class="${card} p-8 text-center text-sm text-slate-500">找不到這個項目。<br><button onclick="up()" class="${btn} ${dnLine} mt-4">← 返回</button></div>`; return; }
  const { x, e, ex, m, src } = D, xs = src || x, T = e.type, sec = (t, body) => body ? `<section class="${card} p-4 md:p-5 mb-3"><h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${t}</h3>${body}</section>` : '';
  let ctx = m && m.ctx; if (!ctx && T !== 'sentence') { const p = String(x.passage || ''), i = p.toLowerCase().indexOf(String(e.text).toLowerCase()); if (i >= 0) ctx = dnCtxOf(p, i, i + e.text.length, e.text); }
  const list = (arr, fn) => arr.length ? `<ul class="space-y-1.5 text-sm">${arr.map(fn).join('')}</ul>` : '';
  const ex2 = dnArr(e.examples).map(o => typeof o === 'string' ? { en: o } : o);
  let h = `<header class="mb-4 flex items-start justify-between gap-2"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="${dnChip} ${DNTC[T]}">${DNT[T]}</span><span class="text-xs text-slate-500">W${x.week} · D${x.day} ${esc(x.tag || '')}</span>${lvBadge(x)}</div>
    <h2 class="${T === 'sentence' ? 'text-lg leading-relaxed' : 'text-2xl'} font-bold mt-2 break-words">${esc(e.text)} <button onclick="vplay('${idOf(xs)}', this.dataset.w, '', this.dataset.w)" data-w="${esc(e.text)}" class="text-slate-400 hover:text-indigo-600 text-xl align-middle" aria-label="發音">🔊</button></h2>
    ${e.ipa || e.pos ? `<p class="text-sm text-slate-500 mt-1">${esc(e.ipa || '')} ${e.pos ? `<i>${esc(e.pos)}</i>` : ''}</p>` : ''}
    ${e.zh ? `<p class="text-base font-semibold mt-2">${esc(e.zh)}</p>` : ''}${e.en ? `<p class="text-sm text-slate-500 italic mt-1 leading-relaxed">${esc(e.en)} ${dnSpk(xs, e, '_en', e.en)}</p>` : ''}</div>${dnBackBtn()}</header>`;
  if (!ex) {
    h += `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">這個項目還沒有補充詳解（${D.base ? '目前只顯示核心單字卡的內容' : '待補'}）。${m ? '已在入庫，請到「📌 入庫彙整」複製 AI 提示詞，合併回 daily.json 後就會出現。' : '按下面的按鈕入庫，再到「📌 入庫彙整」產生 AI 提示詞。'}
      <div class="mt-2 flex flex-wrap gap-2">${(m || D.base) ? `<button onclick="dnCopyOne()" class="text-xs rounded-lg px-2.5 py-1 ${dnPri} cursor-pointer">複製 AI 提示詞（這個字）</button>` : ''}${m ? `<button onclick="dnNav('marks')" class="${dnSm}">前往 📌 入庫彙整</button>` : D.base ? `<button onclick="dnAddFromVocab(${D.i})" class="${dnSm}">＋ 入庫（請 AI 補詳解）</button>` : ''}</div></div>`;
  }
  if (ex && src && src !== x) h += `<p class="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs px-3 py-2 mb-3">這個字已在 ${dnLabel(src)} 入庫並寫好詳解，這裡沿用同一份。「說明」寫的是當時那篇的用法。</p>`;
  h += sec('在文章裡', ctx ? `<div class="flex items-start gap-2"><p class="text-sm leading-relaxed flex-1">${dnHiCtx(ctx, e.text)}</p>${T === 'sentence' ? '' : `<button onclick="vplay('${idOf(x)}', this.dataset.t, '_ctx', this.dataset.w)" data-t="${esc(e.text)}" data-w="${esc(ctx)}" class="text-slate-400 hover:text-indigo-600 shrink-0" aria-label="發音">🔊</button>`}</div>` : '');
  h += sec(T === 'sentence' ? '語氣與用途' : '說明', e.note ? `<p class="text-sm leading-relaxed whitespace-pre-line">${esc(e.note)}</p>` : '');
  const chs = dnArr(e.chunks).filter(c => c && typeof c === 'object' && c.en);
  h += sec('意群斷句', chs.length ? `<p class="text-sm font-semibold mb-2 leading-relaxed">${chs.map(c => esc(c.en)).join(' <span class="text-slate-400">/</span> ')}</p>${list(chs, c => `<li><b>${esc(c.en)}</b>${c.zh ? `　${esc(c.zh)}` : ''}</li>`)}` : '');
  h += sec('句型結構', e.structure ? `<p class="text-sm leading-relaxed whitespace-pre-line">${esc(e.structure)}</p>` : '');
  h += sec('文法說明', e.grammar_note ? `<details class="text-sm"><summary class="cursor-pointer select-none text-indigo-600 dark:text-indigo-400">點開看文法說明</summary><p class="mt-2 leading-relaxed whitespace-pre-line">${esc(e.grammar_note)}</p></details>` : '');
  h += sec('句型', e.pattern ? `<p class="text-sm font-semibold">${esc(e.pattern)}</p>` : '');
  h += sec('文法重點', list(dnArr(e.grammar), o => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><b>${esc(o.point || '')}</b>${o.explain ? `　${esc(o.explain)}` : ''}</li>`));
  const inP = o => o.in_passage ? ` <span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">本篇用法</span>` : '';
  const lem = e.lemma && String(e.lemma).trim().toLowerCase() !== String(e.text).trim().toLowerCase() ? String(e.lemma).trim() : '';
  h += sec('原形', lem ? `<p class="text-sm flex items-center gap-2">${dnSpk(xs, e, '_lm', lem)}<b>${esc(lem)}</b><span class="text-slate-500">　${esc(e.text)} 是 ${esc(lem)} 的變化形；下面的詞性、多義、同字族都以 ${esc(lem)} 為準</span></p>` : '');
  h += sec('詞性（Parts of Speech）', list(dnArr(e.pos_uses), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex flex-wrap items-center gap-x-1.5">${dnSpk(xs, e, '_pw' + (i + 1), o.w || e.lemma || e.text)}<b>${esc(o.w || e.lemma || e.text)}</b><span class="${dnChip}">${esc(o.pos || '')}</span> <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''}</span>　<b>${esc(o.zh || '')}</b>${inP(o)}</div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1">${dnSpk(xs, e, '_p' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}</li>`));
  h += sec('多義（Multiple Meanings）', list(dnArr(e.senses), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex flex-wrap items-center gap-x-1.5">${dnSpk(xs, e, '_sw' + (i + 1), e.lemma || e.text)}<b>${esc(e.lemma || e.text)}</b><span class="${dnChip}">${esc(o.pos || '')}</span>　<b>${esc(o.zh || '')}</b>${inP(o)}</div>${o.en ? `<p class="text-xs text-slate-500 italic mt-0.5">${esc(o.en)}</p>` : ''}${o.distinguish ? `<p class="text-xs text-slate-500 mt-0.5">🔎 ${esc(o.distinguish)}</p>` : ''}${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1">${dnSpk(xs, e, '_s' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}</li>`));
  h += sec('屈折變化（Inflections）', list(dnArr(e.forms), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li class="flex items-start gap-2">${o.w ? dnSpk(xs, e, '_f' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b>${o.label ? ` <span class="${dnChip}">${esc(o.label)}</span>` : ''} <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}</div></li>`));
  h += sec('同字族（Word Family）', list(dnArr(e.derived), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${o.w ? dnSpk(xs, e, '_d' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b> <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}${o.link ? `<p class="text-xs text-slate-500 mt-0.5">🔗 ${esc(o.link)}</p>` : ''}</div></div></li>`));
  const cols = dnArr(e.collocations);
  h += sec('常用搭配', cols.length ? `<ul class="space-y-1.5 text-sm">${cols.map((c, i) => { const ph = typeof c === 'string' ? c : (c.phrase || c.p || ''); return `<li class="flex items-start gap-2">${ph ? dnSpk(xs, e, '_cp' + (i + 1), ph) : ''}<div><b>${esc(ph)}</b>${c && c.zh ? `　${esc(c.zh)}` : ''}</div></li>`; }).join('')}</ul>` : (dnArr(e.col).length ? `<p class="text-sm">${dnArr(e.col).map(esc).join('；')}</p>` : ''));
  const exAll = ex2.map((o, i) => ({ o, suf: '_e' + (i + 1), tag: o.tag })).concat(cols.map((c, i) => ({ o: c && c.example, suf: '_c' + (i + 1), tag: '常用搭配', hi: c && (c.phrase || c.p) })).filter(r => r.o && r.o.en)); // 搭配的例句併入例句區，標「常用搭配」
  h += sec('同義改寫', list(dnArr(e.paraphrase), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : (o && o.en ? `<li class="flex items-start gap-2">${dnSpk(xs, e, '_pr' + (i + 1), o.en)}<div>${dnExHtml(o)}</div></li>` : '')));
  h += sec(T === 'sentence' ? '同句型例句' : '例句', list(exAll, r => `<li class="flex items-start gap-2">${dnSpk(xs, e, r.suf, r.o.en || '')}<div>${r.tag ? `<span class="${r.tag === '常用搭配' ? 'text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 ' + DNTC.phrase : dnChip}">${esc(r.tag)}</span>` : ''}<p>${r.hi ? dnHiCtx(r.o.en, r.hi) : esc(r.o.en || '')}</p>${r.o.zh ? `<p class="text-xs text-slate-500">${esc(r.o.zh)}</p>` : ''}</div></li>`));
  h += sec('句中值得注意的字', list(dnArr(e.key_words), (o, i) => dnKwHtml(x, xs, e, o, i)));
  h += sec('易混淆', list(dnArr(e.confusable), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${(o.word || o.phrase) ? dnSpk(xs, e, '_cw' + (i + 1), o.word || o.phrase) : ''}<div><b>${esc(o.word || o.phrase || '')}</b>${o.diff ? `　${esc(o.diff)}` : ''}</div></div>${o.usage ? `<details class="mt-1 ml-6 text-xs text-slate-600 dark:text-slate-300"><summary class="cursor-pointer select-none text-indigo-600 dark:text-indigo-400">用法／文法差異</summary><p class="mt-1 leading-relaxed whitespace-pre-line">${esc(o.usage)}</p></details>` : ''}${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_cf' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}</li>`));
  h += sec('近義片語', list(dnArr(e.similar), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${(o.phrase || o.word) ? dnSpk(xs, e, '_sm' + (i + 1), o.phrase || o.word) : ''}<div><b>${esc(o.phrase || o.word || '')}</b>${o.diff ? `　${esc(o.diff)}` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_sx' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}</li>`));
  h += sec('相關字（語意相近）', list(dnArr(e.family), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${o.w ? dnSpk(xs, e, '_m' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b> <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_mx' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}</li>`));
  h += `<div class="flex flex-wrap gap-2 mt-4"><button onclick="up()" class="${btn} ${dnLine}">← 返回</button>${dnRpBtn(idOf(x), '', 'vocab')}</div>`;
  main.innerHTML = `<div id="detail-text">${h}</div><p class="mt-3 text-[0.6875rem] text-slate-400">💡 選取例句或說明裡的英文字、片語或句子，下方會跳出「＋ 入庫」；入庫的字不分週次，全域共用。</p>`;
}


/* ======================= 📚 入庫總覽（學習用：只看、不管理）=======================
   資料來源：各篇 extra_vocab（已寫回詳解）＋ 入庫清單中還沒有詳解的項目（待補）。同一個字全題庫只算一筆。
   分頁：單字｜多義單字（senses 或 pos_uses 至少 2 筆）｜片語｜句子｜待補詳解
   單字、片語、多義單字：A–Z；句子：依文章或依句型模板（pattern）；待補：依文章。 */
DN.bk = { tab: 'word', q: '', sm: 'art', open: {} }; // open：A–Z 各字母區塊的展開狀態（預設全部收合）
function dnBankItems(core) { // core＝true：再把「文章核心多益單字裡還沒有詳解、也還沒入庫」的字併進待補詳解
  const map = new Map();
  dnArts().forEach(a => dnExtraOf(a).forEach(e => {
    const t = String(e.text || e.word || '').trim(); if (!t) return;
    const k = dnKey(t); if (map.has(k)) return;
    map.set(k, { text: t, e, qid: idOf(a), merged: true, type: e.type || (/\s/.test(t) ? 'phrase' : 'word'), mark: null });
  }));
  dnMarks().filter(dnIsPrimary).forEach(m => {
    const k = dnKey(m.text); if (map.has(k) || !dnArt(m.qid)) return;
    map.set(k, { text: m.text, e: null, qid: m.qid, merged: false, type: m.type || 'word', mark: m });
  });
  if (core) dnArts().forEach(a => (a.vocab || []).forEach(v => {
    const t = String((v && v.word) || '').trim(), k = dnKey(t); if (!t || map.has(k)) return;
    map.set(k, { text: t, e: null, qid: idOf(a), merged: false, type: /\s/.test(t) ? 'phrase' : 'word', mark: null, core: true });
  }));
  return Array.from(map.values());
}
const dnBankKind = it => it.type === 'sentence' ? 'sent' : it.type === 'phrase' ? 'phrase' : 'word';
function dnMulti(e) { // 多義（同詞性不同意思）與多詞性
  const f = a => dnArr(a).filter(o => o && typeof o === 'object');
  const se = f(e && e.senses), us = f(e && e.pos_uses);
  return { se, us, multi: se.length >= 2 || us.length >= 2 };
}
function dnBankTab(it, tab) {
  const k = dnBankKind(it);
  if (tab === 'todo') return !it.merged;
  if (!it.merged) return false;
  if (tab === 'word') return k === 'word';
  if (tab === 'multi') return k === 'word' && dnMulti(it.e).multi;
  if (tab === 'phrase') return k === 'phrase';
  return k === 'sent';
}
function dnBankHay(it) {
  const e = it.e || {}, m = dnMulti(e);
  return [it.text, e.zh, e.pattern, it.mark && it.mark.ctx, it.mark && it.mark.note].concat(m.se.map(o => o.zh), m.us.map(o => o.zh)).filter(Boolean).join(' ').toLowerCase();
}
function dnBankRow(it) {
  const e = it.e || {}, k = dnBankKind(it), mu = dnMulti(e), T = esc(it.text), tag = 'text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  const spk = `<button onclick="vplay('${it.qid}', this.dataset.t, '', this.dataset.t)" data-t="${T}" class="text-slate-400 hover:text-indigo-600 shrink-0 mt-0.5" aria-label="發音">🔊</button>`;
  let body;
  if (!it.merged) {
    const m = it.mark || {};
    body = `<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><span class="${dnChip} ${DNTC[it.type] || DNTC.word}">${DNT[it.type] || '單字'}</span><b class="text-sm break-words">${T}</b>${it.core ? '<span class="' + dnChip + '">核心單字</span>' : ''}</div>${it.type !== 'sentence' && m.ctx ? `<p class="text-xs text-slate-500 mt-0.5 break-words">${esc(m.ctx)}</p>` : ''}${m.note ? `<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5 break-words">備註：${esc(m.note)}</p>` : ''}</div><button onclick="dnBankCopy('${it.qid}', this.dataset.t, this)" data-t="${T}" class="${btn} ${dnLine} !py-1 !px-2 text-xs shrink-0">複製提示詞</button>`;
  } else if (k === 'sent') {
    body = `<div class="min-w-0 flex-1 cursor-pointer" onclick="dnBankOpen(this)" data-q="${it.qid}" data-t="${T}"><p class="text-sm leading-relaxed">${T}</p>${e.zh ? `<p class="text-xs text-slate-500 mt-0.5">${esc(e.zh)}</p>` : ''}${e.pattern && DN.bk.sm !== 'pat' ? `<p class="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">🧩 ${esc(e.pattern)}</p>` : ''}</div>`;
  } else {
    const chips = k === 'word' ? `${mu.se.length >= 2 ? `<span class="${tag}">多義</span>` : ''}${mu.us.length >= 2 ? `<span class="${tag}">多詞性</span>` : ''}` : '';
    const lines = DN.bk.tab === 'multi' ? `${mu.us.length >= 2 ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1"><b>詞性</b>　${mu.us.map(o => `${o.pos ? `<i>${esc(o.pos)}</i> ` : ''}${esc(o.zh || '')}`).join('；')}</p>` : ''}${mu.se.length >= 2 ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1"><b>意思</b>　${mu.se.map(o => `${o.pos ? `<i>${esc(o.pos)}</i> ` : ''}${esc(o.zh || '')}`).join('；')}</p>` : ''}` : '';
    body = `<div class="min-w-0 flex-1 cursor-pointer" onclick="dnBankOpen(this)" data-q="${it.qid}" data-t="${T}"><div class="flex flex-wrap items-baseline gap-x-1.5"><b class="text-sm break-words">${T}</b>${e.ipa ? `<span class="text-xs text-slate-500">${esc(e.ipa)}</span>` : ''}${k === 'word' && e.pos ? `<i class="text-xs text-slate-500">${esc(e.pos)}</i>` : ''}${e.zh ? `<span class="text-sm">${esc(e.zh)}</span>` : ''}${chips}</div>${lines}</div>`;
  }
  return `<div class="py-2 flex items-start gap-2">${spk}${body}${it.merged ? '<span class="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5">›</span>' : ''}</div>`;
}
const dnBankArtOrder = (a, b) => { const A = dnArt(a.qid), B = dnArt(b.qid); return A && B ? (A.week - B.week) || (A.day - B.day) : 0; };
function dnBankFold(key, on) { if (!DN.bk.q) DN.bk.open[key] = !!on; } // 搜尋中是強制展開，不記錄
function dnBankGroup(title, rows, id, fold) {
  const body = `<div class="divide-y divide-slate-100 dark:divide-slate-800">${rows.map(dnBankRow).join('')}</div>`;
  if (fold) { // 可收合（A–Z）：預設收合；搜尋時自動展開，才看得到結果
    const key = DN.bk.tab + ':' + fold, op = !!DN.bk.q || !!DN.bk.open[key];
    return `<details ${id ? `id="${id}"` : ''} ${op ? 'open' : ''} ontoggle="dnBankFold('${key}',this.open)" class="${card} p-3 mb-3 scroll-mt-20 group"><summary class="cursor-pointer select-none list-none flex items-center gap-2 text-sm font-bold [&::-webkit-details-marker]:hidden"><span class="inline-block text-[0.625rem] text-slate-400 transition-transform group-open:rotate-90">▶</span><span>${title}</span><span class="text-xs font-normal text-slate-400">${rows.length}</span></summary><div class="mt-1">${body}</div></details>`;
  }
  return `<section class="${card} p-3 mb-3"><h3 ${id ? `id="${id}"` : ''} class="text-sm font-bold mb-1 scroll-mt-20">${title} <span class="text-xs font-normal text-slate-400">${rows.length}</span></h3><div class="divide-y divide-slate-100 dark:divide-slate-800">${rows.map(dnBankRow).join('')}</div></section>`;
}
function dnBankList() {
  const B = DN.bk, all = dnBankItems(true), q = dnKey(B.q);
  const arr = all.filter(it => dnBankTab(it, B.tab) && (!q || dnBankHay(it).includes(q)));
  if (!arr.length) return `<p class="text-sm text-slate-400 text-center py-10">${!all.length ? '還沒有入庫。到文章頁選取不懂的字、片語或句子，按「＋ 入庫」。' : q ? '沒有符合搜尋的項目。' : '這個分類目前沒有項目。'}</p>`;
  const artTitle = qid => `<button onclick="dnGoArt('${qid}')" class="text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(qid))}</button>`;
  if (B.tab === 'todo' || (B.tab === 'sent' && B.sm !== 'pat')) { // 依文章
    const g = {}; arr.slice().sort((a, b) => dnBankArtOrder(a, b) || dnKey(a.text).localeCompare(dnKey(b.text))).forEach(it => (g[it.qid] = g[it.qid] || []).push(it));
    return Object.keys(g).map(qid => dnBankGroup(artTitle(qid), g[qid])).join('');
  }
  if (B.tab === 'sent') { // 依句型模板：沒有 pattern 的放「未分類」
    const g = {}, label = {};
    arr.slice().sort(dnBankArtOrder).forEach(it => { const p = String((it.e && it.e.pattern) || '').trim(), k = p ? dnKey(p) : ''; (g[k] = g[k] || []).push(it); if (p) label[k] = label[k] || p; });
    const keys = Object.keys(g).sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
    return keys.map(k => dnBankGroup(k ? `🧩 ${esc(label[k])}` : '未分類（還沒有句型模板，可到「入庫彙整」補齊）', g[k])).join('');
  }
  const g = {}; arr.slice().sort((a, b) => dnKey(a.text).localeCompare(dnKey(b.text))).forEach(it => { const c = (dnKey(it.text).replace(/[^a-z]/g, '')[0] || '#').toUpperCase(); (g[c] = g[c] || []).push(it); });
  const ks = Object.keys(g).sort(), jid = c => 'bk-' + (c === '#' ? 'sym' : c);
  return `<div class="flex flex-wrap gap-1 mb-3">${ks.map(c => `<button onclick="dnBankJump('${jid(c)}')" class="${btn} bg-slate-100 dark:bg-slate-800 !py-1 !px-2.5 text-xs">${c}</button>`).join('')}<span class="flex-1"></span><button onclick="dnBankAll(true)" class="${btn} ${dnLine} !py-1 !px-2.5 text-xs">全部展開</button><button onclick="dnBankAll(false)" class="${btn} ${dnLine} !py-1 !px-2.5 text-xs">全部收合</button></div>` + ks.map(c => dnBankGroup(c, g[c], jid(c), c)).join('');
}
function dnBankJump(id) { const el = document.getElementById(id); if (!el) return; if (el.tagName === 'DETAILS') el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } // 跳到字母時自動展開該區
function dnBankAll(on) { document.querySelectorAll('#bank-list details').forEach(d => { d.open = on; }); }
function dnBankQ(v) { DN.bk.q = v; const el = document.getElementById('bank-list'); if (el) el.innerHTML = dnBankList(); } // 只更新清單，輸入框不重繪（才不會每打一個字就失去焦點）
function dnBankTabSet(t) { DN.bk.tab = t; render(); window.scrollTo({ top: 0 }); }
function dnBankSm(v) { DN.bk.sm = v; render(); }
function dnBankCopy(qid, text, b) { // 待補詳解：只為這個字複製 AI 提示詞（核心單字會順便入庫，提示詞需要所在句）
  const x = dnArt(qid); if (!x) return;
  let m = dnMarksOf(qid).find(q => dnKey(q.text) === dnKey(text));
  if (!m) { const v = (x.vocab || []).find(v => dnKey(v.word) === dnKey(text)); if (!v) return; m = dnMarkVocab(x, v); save(); }
  auCopy(dnPrompt(qid, new Set([dnKey(m.text)]))); dnToast('已複製這個字的提示詞，貼給 AI');
}
function dnBankOpen(el) { dnOpenExtra(el.dataset.q, el.dataset.t); }
const dnBankBtn = () => `<button onclick="dnNav('bank')" class="${btn} w-full mt-2 ${dnLine} ${cur.view === 'bank' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">📚 入庫總覽（${dnBankItems().length}）</button>`;
function dnRenderBank() {
  const B = DN.bk, all = dnBankItems(true), cnt = t => all.filter(it => dnBankTab(it, t)).length;
  const tabs = [['word', '單字'], ['multi', '多義單字'], ['phrase', '片語'], ['sent', '句子'], ['todo', '待補詳解']];
  const tb = ([t, n]) => `<button onclick="dnBankTabSet('${t}')" class="${btn} !py-1.5 !px-3 text-xs ${B.tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${n} <span class="opacity-70">${cnt(t)}</span></button>`;
  const sm = (v, n) => `<button onclick="dnBankSm('${v}')" class="${btn} !py-1 !px-3 text-xs ${B.sm === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${n}</button>`;
  main.innerHTML = `<header class="mb-4 flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">📚 入庫總覽</h2>${dnBackBtn()}</header>
    <div class="${card} p-3 mb-4"><div class="flex flex-wrap gap-2">${tabs.map(tb).join('')}</div>
    <input id="bank-q" type="search" value="${esc(B.q)}" placeholder="搜尋英文或中文…" oninput="dnBankQ(this.value)" class="${dnInp} mt-3 w-full">
    ${B.tab === 'sent' ? `<div class="flex flex-wrap items-center gap-2 mt-3"><span class="text-xs text-slate-500">排列</span>${sm('art', '依文章')}${sm('pat', '依句型模板')}</div>` : ''}
    ${B.tab === 'multi' ? '<p class="text-xs text-slate-500 mt-3 leading-relaxed">「詞性」是同一個拼法的不同詞性用法，「意思」是同詞性裡的不同意思；點一列看完整詳解。</p>' : ''}
    ${B.tab === 'todo' ? `<p class="text-xs text-slate-500 mt-3 leading-relaxed">這些是還沒有詳解的項目：你入庫的，加上文章核心多益單字裡還沒補詳解的（標「核心單字」）。每列可直接「複製提示詞」；也可到 <button onclick="dnNav('marks')" class="underline text-indigo-600 dark:text-indigo-400 cursor-pointer">📌 入庫彙整</button> 複製 AI 提示詞，合併回 daily.json 後就會出現在這裡的其他分頁。</p>` : ''}</div>
    <div id="bank-list">${dnBankList()}</div>`;
}

/* ======================= 掛進 daily.js 的小工具 ======================= */
function dnToggleMhl() { cur.mhl = !cur.mhl; if (cur.mhl) cur.enOpen = true; render(); }
(function () { // 入庫標示色：單字藍、片語紫、句子綠（與核心單字的黃色標示區分）
  const s = document.createElement('style');
  s.textContent = '#passage-text.mhl .mk{border-radius:3px;padding:0 2px;color:inherit}'
    + '#passage-text.mhl .mk-word{background:rgba(56,189,248,.35)}#passage-text.mhl .mk-phrase{background:rgba(167,139,250,.35)}#passage-text.mhl .mk-sentence{background:rgba(52,211,153,.30)}';
  document.head.appendChild(s);
})();
function dnAfterDay() { dnApplyMarks(); const el = document.getElementById('passage-text'); if (el) el.classList.toggle('mhl', !!cur.mhl); dnSyncBar(); }
function dnSyncBar() { if (DN.sel && (DN.sel.src === 'detail' ? cur.view !== 'detail' : (cur.view !== 'day' || DN.sel.qid !== idOf(find(cur.w, cur.d) || {})))) DN.sel = null; dnBar(); }
function dnWhyH(x, q, qi, ok) { // 解析：預設收合，點「看解析」展開
  const open = !!(cur.why && cur.why[qi]);
  return `<button onclick="dnToggleWhy(${qi})" class="text-xs ${dnSm} !px-3 !py-1.5">${open ? '▾ 收起解析' : '▸ 看解析'}</button>`
    + (open ? `<div class="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg">${q.why.map((w, wi) => `<p class="${wi === q.ans ? 'font-semibold text-slate-800 dark:text-slate-200' : ''}"><b>${L[wi]}:</b>${esc(w)}</p>`).join('')}</div>` : '');
}
function dnToggleWhy(qi) { cur.why = cur.why || {}; cur.why[qi] = !cur.why[qi]; render(); }
function dnAllWhy(on) { const x = find(cur.w, cur.d); cur.why = {}; if (on && x) x.questions.forEach((q, i) => { cur.why[i] = true; }); render(); }
