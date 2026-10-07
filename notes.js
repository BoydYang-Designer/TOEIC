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
const dnChip = 'text-[11px] font-semibold rounded px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const dnSm = 'text-xs rounded-lg px-2.5 py-1 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer';
const DN = { sel: null, rp: null, mk: null, rf: null, rkf: null, mf: 'todo', chk: {}, fill: { en: true, col: true, forms: true, fam: true } };
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
  const v = cur.view; if (v !== 'marks' && v !== 'reports' && v !== 'detail') return false;
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
const dnFindExtra = (x, text) => dnExtraOf(x).find(e => dnKey(e.text || e.word) === dnKey(text));
const dnMerged = m => { const x = dnArt(m.qid); return !!(x && dnFindExtra(x, m.text)); };
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
function dnSelRead() {
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
  const S_ = DN.sel, dup = dnMarks().some(m => m.qid === S_.qid && dnKey(m.text) === dnKey(S_.text));
  el.style.display = '';
  el.className = 'fixed inset-x-2 bottom-[4.5rem] md:inset-x-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:w-[30rem] z-50 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2.5';
  const tb = t => `<button onmousedown="event.preventDefault()" onclick="dnSetType('${t}')" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${S_.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${DNT[t]}</button>`;
  el.innerHTML = `<p class="text-xs text-slate-500 truncate mb-1.5">已選：<b class="text-slate-800 dark:text-slate-200">${esc(S_.text)}</b></p>
    <div class="flex items-center gap-1.5">${tb('word')}${tb('phrase')}${tb('sentence')}
    <button onmousedown="event.preventDefault()" onclick="dnAddMark()" class="ml-auto text-sm rounded-lg px-3 py-1.5 cursor-pointer ${dup ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : dnPri}">${dup ? '已入庫' : '＋ 入庫'}</button>
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
fetch('audio/daily/vocab/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null)
  .then(j => { if (j && Array.isArray(j.files)) { VA.files = new Set(j.files); VA.v = j.v || ''; } }).catch(() => {});
const dnNorm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
function dnFnv6(s) { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0').slice(0, 6); }
function dnSlug(t) { const k = dnNorm(t), s = k.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return s && s.length <= 40 ? s : s.slice(0, 40).replace(/-+$/, '') + (s ? '-' : '') + dnFnv6(k); }
let dnAu = null;
function vplay(qid, text, suf, fallback) {
  const f = `${qid}-${dnSlug(text)}${suf || ''}.mp3`;
  try { if (dnAu) { dnAu.pause(); dnAu = null; } } catch (e) {}
  if (VA.files && VA.files.has(f)) {
    try { if (typeof spStop === 'function') spStop(); speechSynthesis.cancel(); } catch (e) {}
    const a = dnAu = new Audio('audio/daily/vocab/' + f + (VA.v ? '?v=' + VA.v : ''));
    a.onerror = () => speak(fallback);
    a.play().catch(() => speak(fallback));
  } else speak(fallback);
}
function dnSetType(t) { if (DN.sel) { DN.sel.type = t; dnBar(); } }
function dnSelClear() { DN.sel = null; try { window.getSelection().removeAllRanges(); } catch (e) {} dnBar(); }
function dnAddMark() {
  const s = DN.sel; if (!s) return;
  if (dnMarks().some(m => m.qid === s.qid && dnKey(m.text) === dnKey(s.text))) { dnToast('這個已經入庫了'); return; }
  const x = dnArt(s.qid), p = String(x ? x.passage : '');
  const now = Date.now();
  dnMarks().push({ id: dnId('m'), qid: s.qid, text: s.text, type: s.type, ctx: s.type === 'sentence' ? s.text : dnCtxOf(p, s.from, s.to, s.text), from: s.from, to: s.to, note: '', created: now, updated: now });
  save(); dnSelClear(); dnToast(`已入庫（${DNT[s.type]}）`); render();
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
  const merged = dnMerged(m);
  dnModal(`<div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">📌 入庫項目</h2><button onclick="dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <p class="text-lg font-bold break-words">${esc(m.text)}</p><p class="text-xs text-slate-500 mt-1 mb-3">${esc(dnArtLabel(m.qid))}　${merged ? '<span class="text-emerald-600">✔ 詳解已寫回</span>' : '待補詳解'}</p>
    <label class="block text-xs text-slate-500 mb-1">類型</label><div class="flex gap-1.5 mb-3">${['word', 'phrase', 'sentence'].map(t => `<button onclick="dnMkType('${t}')" id="dn-mt-${t}" data-on="${m.type === t ? 1 : 0}" class="text-xs rounded-lg px-3 py-1.5 cursor-pointer ${m.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${DNT[t]}</button>`).join('')}</div>
    <label class="block text-xs text-slate-500 mb-1">我的備註（給 AI 看，例如：不懂為什麼用 on）</label><textarea id="dn-mn" rows="3" class="${dnInp} mb-3">${esc(m.note || '')}</textarea>
    <div class="flex flex-wrap gap-2 justify-between">${merged ? '<span class="text-[11px] text-slate-400 self-center max-w-[14rem]">詳解已寫回 daily.json，無法在這裡刪除。</span>' : `<button onclick="dnDelMark('${m.id}')" class="${btn} text-rose-500">刪除</button>`}<div class="flex gap-2">${merged ? `<button onclick="dnClose();dnOpenExtra('${m.qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${btn} ${dnLine}">看詳解</button>` : ''}<button onclick="dnSaveMark()" class="${btn} ${dnPri}">儲存</button></div></div></div>`);
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
  const x = dnArt(m.qid), e = x && dnFindExtra(x, m.text), full = m.type === 'sentence';
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
          <span class="ml-1 align-middle text-[10px] rounded px-1.5 py-0.5 ${DNTC[m.type]}">${DNT[m.type]}</span>${sp}
        </div>
        <button onclick="speak(this.dataset.w)" data-w="${esc(m.text)}" class="text-slate-400 hover:text-indigo-600 text-lg shrink-0">🔊</button>
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
    h += ms.length
      ? `<div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">${ms.map(dnMyCard).join('')}</div>`
      : `<p class="text-xs text-slate-400 mb-8">在英文文稿上選取不懂的字、片語或句子，按「＋ 入庫」就會收在這裡。</p>`;
  }
  return h;
}
function dnOpenMark(id) { const m = dnMarks().find(q => q.id === id); if (!m) return; if (dnMerged(m)) dnOpenExtra(m.qid, m.text); else dnMarkMenu(id); }

/* ======================= 入庫彙整頁（含 AI 提示詞） ======================= */
const dnChecked = m => DN.chk[m.id] !== undefined ? DN.chk[m.id] : (!dnMerged(m) || DN.mf === 'gap');
/* ---------- 已寫回的詳解還缺什麼（可在提示詞區選擇補上）---------- */
const dnFillKeys = { en: '英文解說', col: '搭配例句', forms: '詞性變化＋發音', fam: '相關字音標＋例句' };
function dnGapsOf(m) {
  const x = dnArt(m.qid), e = x && dnFindExtra(x, m.text); if (!e || m.type === 'sentence') return [];
  const g = [];
  if (!(e.en && String(e.en).trim())) g.push('en');
  if (m.type === 'word') {
    const cs = dnArr(e.collocations); if (!cs.length || !cs.every(c => c && c.example && c.example.en)) g.push('col');
    const fs = dnArr(e.forms); if (!fs.length || !fs.every(f => f && typeof f === 'object' && f.ipa)) g.push('forms');
    const ms = dnArr(e.family); if (ms.length && !ms.every(f => f && typeof f === 'object' && f.ipa && f.example && f.example.en)) g.push('fam');
  }
  return g;
}
function dnToggleFill(k) { DN.fill[k] = !DN.fill[k]; render(); }
function dnFillRow(ms) {
  if (!ms.some(m => dnMerged(m) && dnChecked(m) && dnGapsOf(m).length)) return '';
  return `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2"><span class="font-semibold text-amber-800 dark:text-amber-300">補齊內容：</span>${Object.keys(dnFillKeys).map(k => `<label class="flex items-center gap-1 cursor-pointer"><input type="checkbox" ${DN.fill[k] ? 'checked' : ''} onchange="dnToggleFill('${k}')" class="h-3.5 w-3.5">${dnFillKeys[k]}</label>`).join('')}<span class="text-slate-500">（只補勾選項目裡缺的部分）</span></div>`;
}
function dnToggleChk(id) { const m = dnMarks().find(q => q.id === id); if (!m) return; DN.chk[id] = !dnChecked(m); render(); }
function dnSetMf(v) { DN.mf = v; render(); }
const FENCE = '`'.repeat(3);
const DNF = {
  en: '補上 en（英文解說）',
  col: '補上 collocations（常用搭配＋每個搭配的例句）；若現有詳解有舊的 col 字串，把裡面的搭配轉成 collocations 後刪掉 col',
  forms: '補齊 forms（屈折變化與衍生詞；每一筆都要有 label、pos、zh、ipa；缺的單複數、過去式等也要補）',
  fam: '補齊 family（每一個都要有 ipa、pos、zh，以及至少 1 句 example）'
};
function dnPromptItems(qid) { // 要寫進提示詞的項目：新項目＝全寫；已寫回但缺內容的＝只補缺的
  const out = [];
  dnMarksOf(qid).filter(dnChecked).forEach(m => {
    if (!dnMerged(m)) { out.push({ m, fill: null }); return; }
    const g = dnGapsOf(m).filter(k => DN.fill[k]); if (g.length) out.push({ m, fill: g });
  });
  return out;
}
function dnPrompt(qid) {
  const x = dnArt(qid); if (!x) return '';
  const its = dnPromptItems(qid), lv = x.level || {}, sc = lv.score || 600, hasFill = its.some(o => o.fill);
  const items = its.map(({ m, fill }, i) => {
    let t = `${i + 1}. ` + (fill ? '【補齊】' : '') + `type=${m.type}｜text="${m.text}"` + (m.type === 'sentence' ? '' : `｜所在句："${m.ctx}"`) + (m.note ? `｜我的備註：${m.note}` : '');
    if (fill) t += `\n   要補：${fill.map(k => DNF[k]).join('；')}\n   現有詳解（既有內容保留，只補缺的）：${JSON.stringify(dnFindExtra(x, m.text))}`;
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
    '- 沒有內容的欄位直接省略，不要寫空字串或 null。',
    '',
    '【內容規則（單字、片語）】',
    '- 英文解說 en：用同程度的簡單英文一句話解釋，不要用比該字更難的字。',
    '- 例句 examples 數量不限：依這個字或片語實際常見的用法與情境判斷。只有一種常見用法就 2–3 句；有多個詞義、詞性或情境（會議、電子郵件、採購、出差…）就每個情境各 1–2 句，通常 3–6 句、最多 8 句。每句加 tag 標示情境（如「會議」「電子郵件」）；不要為了湊數寫重複的句型。',
    '- 常用搭配 collocations（單字）：列出多益常見的搭配（通常 2–5 個），每個搭配都要有自己的例句 example，例句必須真的用到該搭配，且不要與 examples 重複（網頁會把這些例句放進「例句」區並標上「常用搭配」）。',
    '- 詞性變化 forms（單字）：列出屈折變化與常見衍生詞——名詞的單數／複數、動詞的第三人稱單數／過去式／過去分詞／現在分詞、形容詞的比較級與副詞形式等；不規則變化一定要列。每一筆都要有 label（如「複數」「過去式」）、pos、zh、ipa。',
    '- 相關字群組 family（單字）最多 4 個、同程度；每個都要有 ipa、pos、zh，以及至少 1 句例句 example（en + zh）。超過這個程度的字不要列。',
    '',
    '【文章全文】',
    String(x.passage || ''),
    '',
    '【要寫的項目】（每項的 text 必須與下面完全相同，不可改寫或加減字）',
    items || '（尚未勾選任何項目）',
    '',
    ...(hasFill ? [
      '【補齊規則】',
      '- 標示【補齊】的項目，請輸出「完整的一筆」：保留現有詳解的所有內容（text、zh、note、examples 等不要改動，除非明顯有錯），再加上「要補」的部分。',
      '- 輸出會用 text 整筆取代舊的，所以不能只寫新增的欄位。',
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
    '{ "text": "invoice", "type": "word", "ipa": "/ˈɪnvɔɪs/", "pos": "n.", "zh": "發票、請款單", "en": "a document that lists what was sold and how much to pay", "note": "…在這篇的用法…", "forms": [ { "w": "invoices", "label": "複數", "pos": "n.", "zh": "發票（複數）", "ipa": "/ˈɪnvɔɪsɪz/" }, { "w": "invoiced", "label": "過去式／過去分詞", "pos": "v.", "zh": "開立發票", "ipa": "/ˈɪnvɔɪst/" } ], "collocations": [ { "phrase": "send an invoice", "zh": "寄發票", "example": { "en": "…", "zh": "…" } }, { "phrase": "pay an invoice", "zh": "付發票款項", "example": { "en": "…", "zh": "…" } } ], "examples": [ { "tag": "情境", "en": "…", "zh": "…" } ], "confusable": [ { "word": "receipt", "diff": "…差異…" } ], "family": [ { "w": "bill", "pos": "n.", "zh": "帳單", "ipa": "/bɪl/", "example": { "en": "…", "zh": "…" } } ] }',
    FENCE,
    '▸ phrase（片語／搭配）',
    FENCE + 'json',
    '{ "text": "no later than", "type": "phrase", "zh": "最遲在…之前", "en": "not after a certain time", "note": "…", "pattern": "no later than + 時間", "examples": [ { "tag": "情境", "en": "…", "zh": "…" } ], "similar": [ { "phrase": "by", "diff": "…" } ], "confusable": [ { "word": "…", "diff": "…" } ] }',
    FENCE,
    '▸ sentence（句子：重點在文法與句型）',
    FENCE + 'json',
    '{ "text": "（整句照抄）", "type": "sentence", "zh": "整句中文翻譯", "structure": "句型結構拆解，例如：Please + V（祈使）＋ by V-ing ＋ no later than 時間", "grammar": [ { "point": "by + V-ing", "explain": "…" } ], "examples": [ { "en": "同句型的改寫例句", "zh": "…" } ], "key_words": [ { "w": "attendance", "zh": "出席" } ] }',
    FENCE,
    '單字／片語的例句數量依情境自行判斷（見「內容規則」）；句子需 1–2 句同句型的改寫例句。'
  ].join('\n');
}
function dnListText(qid) {
  return dnMarksOf(qid).filter(dnChecked).map(m => `[${DNT[m.type]}] ${m.text}` + (m.type === 'sentence' ? '' : `  —  ${m.ctx}`) + (m.note ? `  （備註：${m.note}）` : '')).join('\n');
}
function dnRenderMarks() {
  const all = dnMarks(), done = all.filter(dnMerged).length, todo = all.length - done;
  const f = DN.mf, vis = m => f === 'all' || (f === 'gap' ? dnMerged(m) && dnGapsOf(m).length > 0 : f === 'done' ? dnMerged(m) : !dnMerged(m));
  const ids = Array.from(new Set(all.filter(vis).map(m => m.qid))).sort((a, b) => { const A = dnArt(a), B = dnArt(b); return A && B ? (A.week - B.week) || (A.day - B.day) : a < b ? -1 : 1; });
  const fb = (v, label, n) => `<button onclick="dnSetMf('${v}')" class="${btn} !py-1.5 !px-3 text-xs ${f === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label} <span class="opacity-70">${n}</span></button>`;
  let h = `<header class="mb-4 flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">📌 入庫彙整</h2>${dnBackBtn()}</header>
    <div class="${card} p-4 mb-4"><div class="flex flex-wrap gap-2">${fb('todo', '待補詳解', todo)}${fb('done', '詳解已寫回', done)}${fb('gap', '可補齊', all.filter(m => dnMerged(m) && dnGapsOf(m).length).length)}${fb('all', '全部', all.length)}</div>
    <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><button onclick="dnExportMarks()" class="${btn} ${dnLine} !py-1.5 text-xs">匯出入庫 JSON</button>
    <label class="${btn} ${dnLine} !py-1.5 text-xs cursor-pointer">匯入合併 JSON<input type="file" accept=".json,application/json" class="hidden" onchange="dnImportMarks(this)"></label></div>
    <p class="text-xs text-slate-500 mt-3 leading-relaxed"><b>流程：</b>① 在文稿選字入庫 → ② 這裡按「複製 AI 提示詞」貼給 AI → ③ AI 回傳的 JSON 存成 <code>w{週}d{天}_extra.json</code>，放在 daily.json 同資料夾 → ④ 執行 json_merge.py（選「每日文章」）合併 → ⑤ 重新整理網頁，該項目就會顯示「詳解已寫回」，點進去看詳解。<br><b>可補齊：</b>已寫回、但缺英文解說／搭配例句／詞性變化發音／相關字音標例句的項目。勾選後，在該區「補齊內容」選擇要補哪些，提示詞會連同現有詳解交給 AI，合併時會整筆取代舊的。<br>入庫只存在這個瀏覽器；在手機入庫、電腦合併時，用上面的「匯出／匯入」搬過去。</p></div>`;
  if (!ids.length) h += `<p class="text-sm text-slate-400 text-center py-10">${all.length ? '這個分類沒有項目。' : '還沒有入庫。到文章頁選取不懂的字、片語或句子，按「＋ 入庫」。'}</p>`;
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
        return `<div class="py-2 flex items-start gap-2"><input type="checkbox" ${dnChecked(m) ? 'checked' : ''} onchange="dnToggleChk('${m.id}')" class="mt-1.5 h-4 w-4 shrink-0 cursor-pointer" aria-label="選取">
          <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><span class="${dnChip} ${DNTC[m.type]}">${DNT[m.type]}</span><b class="text-sm break-words">${esc(m.text)}</b>${mg ? '<span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">✔ 已寫回</span>' : ''}${mg && dnGapsOf(m).length ? `<span class="text-[11px] text-amber-600 dark:text-amber-400">缺：${dnGapsOf(m).map(k => dnFillKeys[k]).join('、')}</span>` : ''}</div>
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
const dnV = o => typeof o === 'string' ? esc(o) : (o && typeof o === 'object' ? Object.values(o).filter(v => v != null && v !== '').map(v => esc(v)).join(' · ') : esc(o == null ? '' : o));
const dnArr = v => Array.isArray(v) ? v : (v ? [v] : []);
function dnDetailData() {
  const x = find(cur.w, cur.d), d = cur.det || {}; if (!x) return null;
  let base = null, text;
  if (d.kind === 'vocab') { base = x.vocab[d.i]; if (!base) return null; text = base.word; } else text = d.text;
  const ex = dnFindExtra(x, text), m = dnMarksOf(idOf(x)).find(q => dnKey(q.text) === dnKey(text));
  const e = Object.assign({}, base || {}, ex || {}); e.text = text; e.type = (ex && ex.type) || (base ? (/\s/.test(text) ? 'phrase' : 'word') : (m && m.type) || 'word');
  return { x, e, base, ex, m, i: d.i };
}
function dnHiCtx(ctx, text) {
  const i = String(ctx).toLowerCase().indexOf(String(text).toLowerCase());
  return i < 0 ? esc(ctx) : esc(ctx.slice(0, i)) + `<b class="bg-amber-100 dark:bg-amber-400/20 rounded">${esc(ctx.slice(i, i + text.length))}</b>` + esc(ctx.slice(i + text.length));
}
const dnSpk = (x, e, suf, w) => `<button onclick="vplay('${idOf(x)}', this.dataset.t, '${suf}', this.dataset.w)" data-t="${esc(e.text)}" data-w="${esc(w)}" class="text-slate-400 hover:text-indigo-600 shrink-0" aria-label="發音">🔊</button>`;
const dnExHtml = o => o && o.en ? `<p>${esc(o.en)}</p>${o.zh ? `<p class="text-xs text-slate-500">${esc(o.zh)}</p>` : ''}` : '';
function dnRenderDetail() {
  const D = dnDetailData();
  if (!D) { main.innerHTML = `<div class="${card} p-8 text-center text-sm text-slate-500">找不到這個項目。<br><button onclick="up()" class="${btn} ${dnLine} mt-4">← 返回</button></div>`; return; }
  const { x, e, ex, m } = D, T = e.type, sec = (t, body) => body ? `<section class="${card} p-4 md:p-5 mb-3"><h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${t}</h3>${body}</section>` : '';
  let ctx = m && m.ctx; if (!ctx && T !== 'sentence') { const p = String(x.passage || ''), i = p.toLowerCase().indexOf(String(e.text).toLowerCase()); if (i >= 0) ctx = dnCtxOf(p, i, i + e.text.length, e.text); }
  const list = (arr, fn) => arr.length ? `<ul class="space-y-1.5 text-sm">${arr.map(fn).join('')}</ul>` : '';
  const ex2 = dnArr(e.examples).map(o => typeof o === 'string' ? { en: o } : o);
  let h = `<header class="mb-4 flex items-start justify-between gap-2"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="${dnChip} ${DNTC[T]}">${DNT[T]}</span><span class="text-xs text-slate-500">W${x.week} · D${x.day} ${esc(x.tag || '')}</span>${lvBadge(x)}</div>
    <h2 class="${T === 'sentence' ? 'text-lg leading-relaxed' : 'text-2xl'} font-bold mt-2 break-words">${esc(e.text)} <button onclick="vplay('${idOf(x)}', this.dataset.w, '', this.dataset.w)" data-w="${esc(e.text)}" class="text-slate-400 hover:text-indigo-600 text-xl align-middle" aria-label="發音">🔊</button></h2>
    ${e.ipa || e.pos ? `<p class="text-sm text-slate-500 mt-1">${esc(e.ipa || '')} ${e.pos ? `<i>${esc(e.pos)}</i>` : ''}</p>` : ''}
    ${e.zh ? `<p class="text-base font-semibold mt-2">${esc(e.zh)}</p>` : ''}${e.en ? `<p class="text-sm text-slate-500 italic mt-1 leading-relaxed">${esc(e.en)}</p>` : ''}</div>${dnBackBtn()}</header>`;
  if (!ex) {
    h += `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">這個項目還沒有補充詳解（${D.base ? '目前只顯示核心單字卡的內容' : '待補'}）。${m ? '已在入庫，請到「📌 入庫彙整」複製 AI 提示詞，合併回 daily.json 後就會出現。' : '按下面的按鈕入庫，再到「📌 入庫彙整」產生 AI 提示詞。'}
      <div class="mt-2">${m ? `<button onclick="dnNav('marks')" class="${dnSm}">前往 📌 入庫彙整</button>` : D.base ? `<button onclick="dnAddFromVocab(${D.i})" class="${dnSm}">＋ 入庫（請 AI 補詳解）</button>` : ''}</div></div>`;
  }
  h += sec('在文章裡', ctx ? `<div class="flex items-start gap-2"><p class="text-sm leading-relaxed flex-1">${dnHiCtx(ctx, e.text)}</p>${T === 'sentence' ? '' : `<button onclick="vplay('${idOf(x)}', this.dataset.t, '_ctx', this.dataset.w)" data-t="${esc(e.text)}" data-w="${esc(ctx)}" class="text-slate-400 hover:text-indigo-600 shrink-0" aria-label="發音">🔊</button>`}</div>` : '');
  h += sec('說明', e.note ? `<p class="text-sm leading-relaxed whitespace-pre-line">${esc(e.note)}</p>` : '');
  h += sec('句型結構', e.structure ? `<p class="text-sm leading-relaxed whitespace-pre-line">${esc(e.structure)}</p>` : '');
  h += sec('句型', e.pattern ? `<p class="text-sm font-semibold">${esc(e.pattern)}</p>` : '');
  h += sec('文法重點', list(dnArr(e.grammar), o => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><b>${esc(o.point || '')}</b>${o.explain ? `　${esc(o.explain)}` : ''}</li>`));
  h += sec('詞性變化', list(dnArr(e.forms), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li class="flex items-start gap-2">${o.w ? dnSpk(x, e, '_f' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b>${o.label ? ` <span class="${dnChip}">${esc(o.label)}</span>` : ''} <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}</div></li>`));
  const cols = dnArr(e.collocations);
  h += sec('常用搭配', cols.length ? `<ul class="space-y-1.5 text-sm">${cols.map((c, i) => { const ph = typeof c === 'string' ? c : (c.phrase || c.p || ''); return `<li class="flex items-start gap-2">${ph ? dnSpk(x, e, '_cp' + (i + 1), ph) : ''}<div><b>${esc(ph)}</b>${c && c.zh ? `　${esc(c.zh)}` : ''}</div></li>`; }).join('')}</ul>` : (dnArr(e.col).length ? `<p class="text-sm">${dnArr(e.col).map(esc).join('；')}</p>` : ''));
  const exAll = ex2.map((o, i) => ({ o, suf: '_e' + (i + 1), tag: o.tag })).concat(cols.map((c, i) => ({ o: c && c.example, suf: '_c' + (i + 1), tag: '常用搭配', hi: c && (c.phrase || c.p) })).filter(r => r.o && r.o.en)); // 搭配的例句併入例句區，標「常用搭配」
  h += sec('例句', list(exAll, r => `<li class="flex items-start gap-2">${dnSpk(x, e, r.suf, r.o.en || '')}<div>${r.tag ? `<span class="${r.tag === '常用搭配' ? 'text-[11px] font-semibold rounded px-1.5 py-0.5 ' + DNTC.phrase : dnChip}">${esc(r.tag)}</span>` : ''}<p>${r.hi ? dnHiCtx(r.o.en, r.hi) : esc(r.o.en || '')}</p>${r.o.zh ? `<p class="text-xs text-slate-500">${esc(r.o.zh)}</p>` : ''}</div></li>`));
  h += sec('句中值得注意的字', list(dnArr(e.key_words), o => `<li>${dnV(o)}</li>`));
  h += sec('易混淆', list(dnArr(e.confusable), o => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><b>${esc(o.word || o.phrase || '')}</b>${o.diff ? `　${esc(o.diff)}` : ''}</li>`));
  h += sec('近義片語', list(dnArr(e.similar), o => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><b>${esc(o.phrase || o.word || '')}</b>${o.diff ? `　${esc(o.diff)}` : ''}</li>`));
  h += sec('相關字群組', list(dnArr(e.family), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${o.w ? dnSpk(x, e, '_m' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b> <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(x, e, '_mx' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}</li>`));
  h += `<div class="flex flex-wrap gap-2 mt-4"><button onclick="up()" class="${btn} ${dnLine}">← 返回</button>${dnRpBtn(idOf(x), '', 'vocab')}</div>`;
  main.innerHTML = h;
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
function dnSyncBar() { if (DN.sel && (cur.view !== 'day' || DN.sel.qid !== idOf(find(cur.w, cur.d) || {}))) DN.sel = null; dnBar(); }
function dnWhyH(x, q, qi, ok) { // 解析：預設收合，點「看解析」展開
  const open = !!(cur.why && cur.why[qi]);
  return `<button onclick="dnToggleWhy(${qi})" class="text-xs ${dnSm} !px-3 !py-1.5">${open ? '▾ 收起解析' : '▸ 看解析'}</button>`
    + (open ? `<div class="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg">${q.why.map((w, wi) => `<p class="${wi === q.ans ? 'font-semibold text-slate-800 dark:text-slate-200' : ''}"><b>${L[wi]}:</b>${esc(w)}</p>`).join('')}</div>` : '');
}
function dnToggleWhy(qi) { cur.why = cur.why || {}; cur.why[qi] = !cur.why[qi]; render(); }
function dnAllWhy(on) { const x = find(cur.w, cur.d); cur.why = {}; if (on && x) x.questions.forEach((q, i) => { cur.why[i] = true; }); render(); }
