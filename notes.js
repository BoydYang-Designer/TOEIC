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
const DN = { mgOpen: {}, sel: null, rp: null, mk: null, rf: null, rkf: null, mf: 'todo', chk: {}, fill: { en: true, col: true, forms: true, fam: true, deriv: true, pos: true, sense: true, conf: true, sim: true, schunk: true, spara: true, spat: true, skw: true, ckind: false, dex: false, ipa: true } };
const DNT = { word: '單字', phrase: '片語', sentence: '句子' };
const DNTC = { word: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300', phrase: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300', sentence: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' };
const DRK = { passage: '英文文稿', zh: '中文翻譯', vocab: '核心單字／搭配', quiz: '題目／答案／解析', audio: '音檔／對時', other: '其他' };
const DRS = { open: '待處理', fixing: '處理中', fixed: '已修正', wontfix: '不處理' };
const DRSC = { open: '!bg-amber-100 !text-amber-700 dark:!bg-amber-950 dark:!text-amber-300', fixing: '!bg-sky-100 !text-sky-700 dark:!bg-sky-950 dark:!text-sky-300', fixed: '!bg-emerald-100 !text-emerald-700 dark:!bg-emerald-950 dark:!text-emerald-300', wontfix: '' };

/* ---------- 共用小工具 ---------- */
function dnToast(m) { const d = document.createElement('div'); d.textContent = m; d.className = 'fixed left-1/2 -translate-x-1/2 bottom-24 z-[70] rounded-lg bg-slate-800 text-white text-sm px-4 py-2 shadow-lg'; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); }
const dnTime = t => { const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
const dnStamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`; };
function dnDownload(name, text, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
const dnArt = qid => DATA.find(d => idOf(d) === qid) || (LIB && idOf(LIB) === qid ? LIB : undefined); // 字庫（LIB）也算一篇，只是沒有內文
const dnArtLabel = qid => { const x = dnArt(qid); return x ? (isLib(x) ? 'TSL 字庫' : `W${x.week}·D${x.day} ${x.tag || ''}`) : qid; };
/* 比對用的「字鍵」：小寫、空白合併，並把英文單複數視為同一個字（magnet／magnets、company／companies、box／boxes 都同一個）。
   只用來比較、去重、找詳解；畫面顯示與存檔的文字不變。規則很保守：ss／us／is 結尾與少數常見例外（news、series…）不處理。 */
const DN_SG_STOP = new Set(['news', 'series', 'species', 'this', 'does', 'has', 'was', 'yes', 'its', 'plus', 'thus', 'means', 'always', 'perhaps', 'sometimes', 'whereas', 'physics', 'economics', 'analytics', 'logistics', 'headquarters', 'goods']);
function dnSg(w) {
  if (w.length < 4 || DN_SG_STOP.has(w) || !/^[a-z]+$/.test(w)) return w;
  if (/[^aeiou]ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y'; // companies → company
  if (/(sses|shes|ches|xes)$/.test(w)) return w.slice(0, -2);              // businesses → business、boxes → box
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);       // magnets → magnet
  return w;
}
const dnKey = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ').replace(/[a-z]+/g, dnSg);
const dnId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function dnModal(html) {
  let m = document.getElementById('dn-modal');
  if (!m) { m = document.createElement('div'); m.id = 'dn-modal'; document.body.appendChild(m); }
  m.innerHTML = html ? `<div class="fixed inset-0 z-[60] bg-black/50 overflow-y-auto" onclick="if(event.target===this)dnClose()"><div class="min-h-full flex items-end sm:items-center justify-center p-3">${html}</div></div>` : '';
}
function dnClose() { DN.rp = null; DN.mk = null; dnModal(''); }
function dnNav(view, prevDet) { // 往下一層：記住目前頁面與捲動位置，「返回」時還原
  const o = render.wd || cur; // 記「目前畫面上那一篇」（不是呼叫端剛改過的 cur.w/d），返回時才會回到原本的文章
  cur.stk = cur.stk || []; cur.stk.push({ v: cur.view, y: window.scrollY, w: o.w, d: o.d, ...(cur.view === 'detail' && (prevDet || cur.det) ? { det: prevDet || cur.det } : {}) }); // 從詳解頁再開另一個詳解：記住是從哪一筆詳解出發，返回才回得去
  cur.view = view; push(); render(); window.scrollTo({ top: 0 });
}
const dnSideBtns = () => `<button onclick="dnNav('marks')" class="${btn} w-full mt-2 ${dnLine} ${cur.view === 'marks' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">📌 入庫彙整（${dnMarks().length}）</button><button onclick="dnNav('reports')" class="${btn} w-full mt-2 ${dnLine} ${cur.view === 'reports' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">⚑ 回報彙整（待處理 ${dnOpenRpN()}）</button>${typeof nwBtn === 'function' ? nwBtn() : ''}`;
function dnFromLaunch(view) { SEC = 'learn'; cur.stk = [{ v: 'launch', y: 0 }]; cur.view = view; push(); render(); window.scrollTo({ top: 0 }); }
function dnUp() { // 供 daily.js 的 up() 呼叫；回傳 true 表示已處理
  const v = cur.view; if (v !== 'marks' && v !== 'reports' && v !== 'detail' && v !== 'bank' && v !== 'nw' && v !== 'groups' && v !== 'quiz') return false;
  const p = cur.stk && cur.stk.pop();
  if (p && p.det) cur.det = p.det; // 返回到上一筆詳解（例如句子詳解 → arrange 詳解 → 返回＝回到句子）
  if (p && p.w != null && find(p.w, p.d)) { cur.w = p.w; cur.d = p.d; } // 返回時連「是哪一篇」一起還原（從別篇的詳解返回才不會跑到別篇）
  cur.view = p ? p.v : (inMaint() ? 'maint' : (find(cur.w, cur.d) ? 'day' : 'home'));
  dnTrailSync();
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
function dnOpenReport(qid, ref, kind) {
  const D = cur.view === 'detail' && kind === 'vocab' ? dnDetailData() : null, t = D && D.e && D.e.text ? String(D.e.text) : ''; // 從詳解頁來：位置先帶入這個字；已有詳解就多出「重整詳解」區塊
  DN.rp = { mode: 'new', qid, ref: ref || (t && t.length <= 20 ? t : ''), kind: kind || 'other', note: '', reporter: S.reporter || '', snap: dnSnapOf(qid, ref), rv: !!(D && D.ex) };
  dnRpModal();
}
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
    ${p.rv && !edit ? dnReviseBox() : ''}
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
function dnGoArt(qid) { const x = dnArt(qid); if (!x) return; if (isLib(x)) { dnToast('TSL 字庫沒有文章內文'); return; } cur.stk = []; if (inMaint()) openItem(x.week, x.day); else go(x.week, x.day); }
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
/* 選字時 blk.textContent 會連 pron.js 加在畫面上的 🔊🎙0＋ 按鈕文字一起抓進來（入庫的所在句變成「caught up 🔊🎙0＋」）→ 一律先清掉 */
function dnCleanUi(t) { return String(t == null ? '' : t).replace(/\s*[🔊🎙⏹]\uFE0F?(?:\s*[🔊🎙⏹]\uFE0F?)*\s*\d{0,3}\s*[＋+]?/gu, '').replace(/\s+/g, ' ').trim(); }
let DN_MKFIX = false; // 修復一次：以前已經被存進去的所在句（ctx）有 🔊🎙 的，清乾淨並存回
const dnMarks = () => { const a = S.marks || (S.marks = []); if (!DN_MKFIX && a.length) { DN_MKFIX = true; let n = 0; a.forEach(m => { if (m && typeof m.ctx === 'string' && /[🔊🎙]/u.test(m.ctx)) { m.ctx = dnCleanUi(m.ctx); n++; } }); if (n) { try { save(); } catch (e) {} } } return a; };
const dnMarksOf = qid => dnMarks().filter(m => m.qid === qid);
const dnExtraOf = x => Array.isArray(x && x.extra_vocab) ? x.extra_vocab : [];
const dnFindExtra = (x, text) => dnExtraOf(x).find(e => dnKey(e.text || e.word) === dnKey(text)); // 只找本篇
/* 同一個字在別篇已有詳解時，沿用那一份：先找本篇，再依週次找其他篇 */
const dnArts = () => (LIB ? [LIB] : []).concat(DATA.slice().sort((a, b) => a.week - b.week || a.day - b.day)); // 字庫（week 0）排最前面：同一個字的詳解一律以字庫那一筆為主
const dnLabel = a => isLib(a) ? 'TSL 字庫' : `W${a.week}·D${a.day}`;
const dnExtraSrc = (x, text) => dnArts().find(a => dnFindExtra(a, text)) || null; // 全題庫同一個字只有一份詳解：一律取最早（週、天）有的那一篇，資料裡就算還有重複也不會各顯示各的
const dnFindExtraAny = (x, text) => { const s = x && dnExtraSrc(x, text); return s ? dnFindExtra(s, text) : undefined; };
function dnElsewhere(qid, text) { // 同一個字在「其他篇」的入庫狀態：{ label, merged } 或 null
  for (const a of dnArts()) if (idOf(a) !== qid && dnFindExtra(a, text)) return { label: dnLabel(a), merged: true };
  const k = dnKey(text), o = dnMarks().filter(m => m.qid !== qid && dnKey(m.text) === k && dnArt(m.qid)).sort((a, b) => { const A = dnArt(a.qid), B = dnArt(b.qid); return A.week - B.week || A.day - B.day; })[0];
  return o ? { label: dnLabel(dnArt(o.qid)), merged: false } : null;
}
/* 同一個字在多篇入庫時只算一份：以最早（週、天）那一篇的入庫為「主」，其他篇只標示「共用」，不重複進提示詞、不重複計數 */
const dnPrimaryOf = m => { const k = dnKey(m.text); return dnMarks().filter(q => !q.own && dnKey(q.text) === k && dnArt(q.qid)).sort((p, q) => { const P = dnArt(p.qid), Q = dnArt(q.qid); return P.week - Q.week || P.day - Q.day || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0); })[0] || m; };
const dnIsPrimary = m => !m.own && dnPrimaryOf(m).id === m.id; // own＝「本篇入庫（複習用）」：不補詳解、不進提示詞、不算缺口
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
  let text = dnCleanUi(r2.toString()).replace(/^[\s,;:"“”()]+|[\s,;:"“”()]+$/g, '');
  if (dnWordN(text) <= 6) text = text.replace(/[.!?]+$/, '');
  if (!text || !/[A-Za-z]/.test(text) || /[\u4e00-\u9fff]/.test(text) || text.length > 300) return;
  const host = (sn.nodeType === 3 ? sn.parentElement : sn), blk = host && (host.closest('p') || host.closest('li') || host.closest('h2'));
  let ctx = blk ? (() => { const c = blk.cloneNode(true); c.querySelectorAll('button,.pr-badge').forEach(q => q.remove()); return dnCleanUi(c.textContent); })() : text; // 先拿掉 🔊／🎙／分數／＋ 這些按鈕再取文字
  if (/[\u4e00-\u9fff]/.test(ctx) || ctx.length > 400) ctx = text;
  const n = dnWordN(text);
  DN.sel = { qid: idOf(D.x), text, type: n <= 1 ? 'word' : n <= 6 ? 'phrase' : 'sentence', ctx, src: 'detail', head: D.e.text };
  dnBar();
}
/* 文稿的「英文區」有兩種：單語＝#passage-text（整個元素的文字就是 passage，位置從 0 起算）；
   中英對照＝#pair-text 裡每一句英文 .tsent（對應 timing 的 from／to，前後空白已 trim，所以起點要補上被 trim 掉的空白數）。
   入庫位置（from／to）一律是 passage 的字元位置，兩種模式共用同一套，標註的底線在兩種模式下位置完全一致。 */
function dnPairSegs(x) { // [{el, base, len}]：每個英文句的元素、它在 passage 裡的起點、字數
  const root = document.getElementById('pair-text'), tm = x && x.timing, p = String((x && x.passage) || ''); if (!root || !Array.isArray(tm)) return [];
  const out = [];
  root.querySelectorAll('.tsent[data-i]').forEach(el => { const t = tm[+el.dataset.i]; if (!t) return; const raw = p.slice(t.from, t.to); out.push({ el, base: t.from + (raw.length - raw.replace(/^\s+/, '').length), len: raw.trim().length }); });
  return out;
}
function dnPairPos(segs, node, off, isEnd) { // 選取端點 → passage 位置；端點落在中文或句子之間時，起點取後面第一個英文句的開頭、終點取前面最後一個英文句的結尾
  const hit = segs.find(s => s.el.contains(node)); if (hit) return hit.base + dnOff(hit.el, node, off);
  if (isEnd) { const b = segs.filter(s => s.el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING); return b.length ? b[b.length - 1].base + b[b.length - 1].len : null; }
  const a = segs.find(s => s.el.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING); return a ? a.base : null;
}
function dnSelRead() {
  if (cur.view === 'detail') { dnSelDetail(); return; }
  if (cur.view === 'speak') { if (typeof skSelRead === 'function') skSelRead(); return; } // 語音練習「一句一句」：選字入庫（speak.js）
  if (cur.view !== 'day' || !cur.mk) return;
  const el = document.getElementById('passage-text') || document.getElementById('pair-text'); if (!el) return;
  const s = window.getSelection(); if (!s || !s.rangeCount || s.isCollapsed) return;
  const rg = s.getRangeAt(0); if (!el.contains(rg.startContainer) || !el.contains(rg.endContainer)) return;
  const x = find(cur.w, cur.d); if (!x) return;
  const p = String(x.passage || '');
  let a, b;
  if (el.id === 'passage-text') { a = dnOff(el, rg.startContainer, rg.startOffset); b = dnOff(el, rg.endContainer, rg.endOffset); }
  else { const segs = dnPairSegs(x); a = dnPairPos(segs, rg.startContainer, rg.startOffset, false); b = dnPairPos(segs, rg.endContainer, rg.endOffset, true); if (a == null || b == null) return; }
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
/* ---- 變化形（-ing／-ed／-er／-est…）：push 已入庫，選 pushing 時提醒「push 已入庫，還要入庫 pushing 嗎？」 ----
   單複數已在 dnKey 視為同一個字（直接判定已入庫）；變化形只提醒、可選擇仍要入庫，所以另外處理。 */
function dnStems(w) { // 這個字可能的原形（含自己）
  const S = new Set([w]), add = b => { if (b.length >= 3) S.add(b); }, base = b => { add(b); add(b + 'e'); if (/([^aeiou])\1$/.test(b)) add(b.slice(0, -1)); }; // pushing→push、making→make、running→run
  if (w.length >= 5 && w.endsWith('ing')) base(w.slice(0, -3));
  if (w.length >= 5 && w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  else if (w.length >= 4 && w.endsWith('ed')) base(w.slice(0, -2));
  if (w.length >= 6 && w.endsWith('ier')) add(w.slice(0, -3) + 'y');
  else if (w.length >= 6 && w.endsWith('er')) base(w.slice(0, -2));
  if (w.length >= 7 && w.endsWith('iest')) add(w.slice(0, -4) + 'y');
  else if (w.length >= 6 && w.endsWith('est')) base(w.slice(0, -3));
  return S;
}
function dnRelated(text) { // 找「同一個字的另一種變化形」已入庫／已是核心單字／已有詳解的項目；找不到回傳 null
  const t = dnKey(text); if (!t || !/^[a-z]+$/.test(t)) return null;
  const S1 = dnStems(t), hit = w => { const k = dnKey(w); if (!k || k === t || !/^[a-z]+$/.test(k)) return false; const S2 = dnStems(k); for (const x of S1) if (S2.has(x)) return true; return false; };
  for (const a of dnArts()) {
    const i = (a.vocab || []).findIndex(v => hit(v.word)); if (i >= 0) return { text: a.vocab[i].word, where: 'vocab', qid: idOf(a), i };
    const e = dnExtraOf(a).find(q => hit(q.text || q.word)); if (e) return { text: e.text || e.word, where: 'extra', qid: idOf(a) };
  }
  const m = dnMarks().find(q => dnArt(q.qid) && hit(q.text));
  return m ? { text: m.text, where: 'mark', qid: m.qid, merged: dnMerged(m) } : null;
}
const dnRelWhere = r => r.where === 'vocab' ? '是核心單字' : r.where === 'extra' ? '已有詳解' : '已入庫';
function dnRelAsk(text) { // 要入庫前：有變化形已在庫就問一下；回傳 true＝照樣入庫
  if (dnBanked(text)) return true;
  const r = dnRelated(text); if (!r) return true;
  return confirm(`「${r.text}」${dnRelWhere(r)}。\n\n還要另外入庫「${text}」嗎？`);
}
function dnBar() {
  let el = document.getElementById('dn-bar');
  if (!DN.sel) { if (el) el.style.display = 'none'; return; }
  if (!el) { el = document.createElement('div'); el.id = 'dn-bar'; document.body.appendChild(el); }
  const S_ = DN.sel, det = S_.src === 'detail', bk = det ? dnBanked(S_.text) : null;
  // 核心單字（x.vocab）：本篇優先、其次別篇；單複數視為同一個字（magnets ＝ magnet）
  const vk = dnKey(S_.text), vOwn = det ? -1 : ((dnArt(S_.qid) || {}).vocab || []).findIndex(v => dnKey(v.word) === vk);
  const vh = det ? null : vOwn >= 0 ? { a: dnArt(S_.qid), i: vOwn, own: true } : (() => { for (const a of dnArts()) { const i = (a.vocab || []).findIndex(v => dnKey(v.word) === vk); if (i >= 0) return { a, i, own: false }; } return null; })();
  const dup = det ? !!bk : (dnMarks().some(m => m.qid === S_.qid && dnKey(m.text) === dnKey(S_.text)) || !!(vh && vh.own));
  const el2 = det ? null : dnElsewhere(S_.qid, S_.text);
  const ownM = det ? null : dnMarks().find(m => m.own && m.qid === S_.qid && dnKey(m.text) === dnKey(S_.text)), two = !det && !dup && !!(el2 && el2.merged) && S_.type !== 'sentence', upg = !!(ownM && el2 && el2.merged && S_.type !== 'sentence'); // two＝別篇已有詳解：讓使用者選「補充詳解」或「本篇入庫（複習）」
  const xs0 = det ? (bk && bk.where === 'extra' ? dnArt(bk.qid) : null) : dnExtraSrc(dnArt(S_.qid) || {}, S_.text), xq = xs0 ? idOf(xs0) : ''; // 這個字已有詳解（本篇或別篇）→ 顯示「看詳解」
  const chip = bk ? ` <span class="ml-1 text-[0.6875rem] rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">${bk.where === 'vocab' ? '已是核心單字' : bk.where === 'extra' ? '已有詳解' : '已在入庫清單'}</span>` : el2 ? ` <span class="ml-1 text-[0.6875rem] rounded px-1.5 py-0.5 ${el2.merged ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}">已在 ${el2.label} 入庫${el2.merged ? '，沿用詳解' : '（詳解待補）'}</span>` : vh ? ` <span class="ml-1 text-[0.6875rem] rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">${vh.own ? '已是核心單字' : '核心單字（' + dnLabel(vh.a) + '）'}</span>` : '';
  const rel = (!bk && !el2 && !vh && !xq && !dup) ? dnRelated(S_.text) : null; // 變化形已在庫
  const relChip = rel ? ` <span class="ml-1 text-[0.6875rem] rounded px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">${esc(rel.text)} ${dnRelWhere(rel)}</span>` : '';
  const relBtn = rel && rel.where === 'vocab' ? `<button onmousedown="event.preventDefault()" onclick="dnGoExtra(this)" data-q="${esc(rel.qid)}" data-i="${rel.i}" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer border border-amber-400 text-amber-700 dark:text-amber-300">📖 看 ${esc(rel.text)}</button>`
    : rel && (rel.where === 'extra' || rel.merged) ? `<button onmousedown="event.preventDefault()" onclick="dnGoExtra(this)" data-q="${esc(rel.qid)}" data-t="${esc(rel.text)}" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer border border-amber-400 text-amber-700 dark:text-amber-300">📖 看 ${esc(rel.text)}</button>` : '';
  el.style.display = '';
  el.className = 'fixed inset-x-2 bottom-[4.5rem] md:inset-x-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2 md:w-[30rem] z-50 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-2.5';
  const tb = t => `<button onmousedown="event.preventDefault()" onclick="dnSetType('${t}')" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${S_.type === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${DNT[t]}</button>`;
  el.innerHTML = `<p class="text-xs text-slate-500 truncate mb-1.5">已選：<b class="text-slate-800 dark:text-slate-200">${esc(S_.text)}</b>${chip || relChip}</p>
    <div class="flex flex-wrap items-center gap-1.5">${tb('word')}${tb('phrase')}${tb('sentence')}${det ? '' : `<button onmousedown="event.preventDefault()" onclick="myphAddSel()" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer border border-amber-400 text-amber-700 dark:text-amber-300">⭐ 常用句</button>`}${relBtn}${xq ? `<button onmousedown="event.preventDefault()" onclick="dnGoExtra(this)" data-q="${esc(xq)}" data-t="${esc(S_.text)}" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer border border-emerald-400 text-emerald-700 dark:text-emerald-300">📖 看詳解</button>` : vh ? `<button onmousedown="event.preventDefault()" onclick="dnGoExtra(this)" data-q="${esc(idOf(vh.a))}" data-i="${vh.i}" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer border border-emerald-400 text-emerald-700 dark:text-emerald-300">📖 看詳解</button>` : ''}${(!xq && !vh && det && bk && dnStudyTarget(S_.text)) ? `<button onmousedown="event.preventDefault()" onclick="dnStudyGo(this.dataset.t)" data-t="${esc(S_.text)}" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer border border-emerald-400 text-emerald-700 dark:text-emerald-300">📖 看詳解${bk.where === 'mark' ? '（待補）' : ''}</button>` : ''}
    ${two ? `<button onmousedown="event.preventDefault()" onclick="dnAddMark('own')" class="ml-auto text-sm rounded-lg px-3 py-1.5 cursor-pointer bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600">＋ 本篇入庫（複習）</button><button onmousedown="event.preventDefault()" onclick="dnAddMark('sup')" class="text-sm rounded-lg px-3 py-1.5 cursor-pointer ${dnPri}">＋ 入庫補充詳解</button>`
    : `${upg ? `<button onmousedown="event.preventDefault()" onclick="dnAddMark('sup')" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer border border-indigo-400 text-indigo-700 dark:text-indigo-300">改為補充詳解</button>` : ''}<button onmousedown="event.preventDefault()" onclick="dnAddMark()" class="ml-auto text-sm rounded-lg px-3 py-1.5 cursor-pointer ${dup ? 'bg-slate-200 dark:bg-slate-700 text-slate-500' : dnPri}">${dup ? (ownM ? '已入庫（本篇複習）' : '已入庫') : (el2 && el2.merged ? (S_.type === 'sentence' ? '＋ 入庫（沿用詳解）' : '＋ 入庫（補充到詳解）') : '＋ 入庫')}</button>`}
    <button onmousedown="event.preventDefault()" onclick="dnSelClear()" class="text-slate-400 hover:text-slate-600 text-xl leading-none px-1.5 cursor-pointer" aria-label="關閉">×</button></div>`;
}
function dnToggleMk() { // 標註模式開關（與文稿卡片上的 Reading/Listening 標籤共用）
  cur.mk = !cur.mk;
  if (cur.mk) {
    if (!cur.hl) { // 進入標註模式：順便標示核心單字（要看得到英文：目前是收合或純中文就切到英文；中英對照可以直接標註英文句）
      const m = typeof textModeOf === 'function' ? textModeOf(find(cur.w, cur.d)).raw : '';
      if (m === '' || m === 'zh') { cur.zhOpen = false; cur.pair = false; }
      cur.hl = true; cur.hlAuto = true;
    }
    cur.enOpen = true; if (typeof spClearHl === 'function') spClearHl();
  } else {
    if (cur.hlAuto) cur.hl = false; cur.hlAuto = false; // 只關掉「自動打開」的標示；自己手動開的不動
    DN.sel = null; try { window.getSelection().removeAllRanges(); } catch (e) {} dnBar();
  }
  render();
}
/* ---------- 詳解／例句／含入庫字的句子：優先播 mp3（audio/daily/vocab/，由 daily-auto-speech.py 產生），沒有就用語音合成 ---------- */
const VA = { files: null, v: '' };
const VW = { files: null, v: '' }; // 共用單字發音庫：audio/daily/words/{單字}.mp3（同一個字不論出現在哪一篇、哪一欄，都只錄一次）
fetch('audio/daily/words/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null)
  .then(j => { if (j && Array.isArray(j.files)) { VW.files = new Set(j.files); VW.v = j.v || ''; } }).catch(() => {});
const DN_WORD_SUF = /^(?:_lm|_f\d+|_m\d+|_d\d+|_pw\d+|_sw\d+|_cp\d+|_cw\d+|_sm\d+|_kw\d+)?$/; // 這些後綴的 🔊 念的是「單字／片語本身」→ 走共用發音庫；例句、所在句、整句放在 vocab/，檔名不含文章 id
fetch('audio/daily/vocab/index.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null)
  .then(j => { if (j && Array.isArray(j.files)) { VA.files = new Set(j.files); VA.v = j.v || ''; } }).catch(() => {});
const dnNorm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
function dnFnv6(s) { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0').slice(0, 6); }
function dnSlug(t) { const k = dnNorm(t), s = k.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); return s && s.length <= 40 ? s : s.slice(0, 40).replace(/-+$/, '') + (s ? '-' : '') + dnFnv6(k); }
let dnAu = null;
function vplay(qid, text, suf, fallback) {
  const done = spkBtn(); // 按下立刻脈動，播完／失敗才停
  suf = suf || '';
  /* vocab/ 檔名（不含文章 id，詳解搬家或文章刪除都不受影響）：
     _ctx 所在句、整句（無後綴）→ 依「句子內容」：{句子slug}.mp3（所在句與入庫的整句是同一句時共用一檔）
     例句等（_c1／_e1／_fx1…）→ 依單字：{單字slug}{後綴}.mp3（qid 參數保留給呼叫端，已不參與檔名） */
  const { wf, nf } = dnAuFiles(text, suf, fallback), f = VA.files && VA.files.has(nf) ? nf : ''; // 單字類：先找共用庫 words/，再找 vocab/，最後語音合成（檔名規則在 dnAuFiles）
  try { if (dnAu) { dnAu.pause(); dnAu = null; } } catch (e) {}
  if (wf && VW.files && VW.files.has(wf)) {
    try { if (typeof spStop === 'function') spStop(); speechSynthesis.cancel(); } catch (e) {}
    const a = dnAu = new Audio('audio/daily/words/' + wf + (VW.v ? '?v=' + VW.v : ''));
    a.onended = a.onpause = done;
    a.onerror = () => speak(fallback, done, 'words/' + wf + ' 讀不到');
    a.play().catch(() => speak(fallback, done, 'words/' + wf + ' 播放失敗'));
  } else if (f) {
    try { if (typeof spStop === 'function') spStop(); speechSynthesis.cancel(); } catch (e) {}
    const a = dnAu = new Audio('audio/daily/vocab/' + f + (VA.v ? '?v=' + VA.v : ''));
    a.onended = a.onpause = done;
    a.onerror = () => speak(fallback, done, 'vocab/' + f + ' 讀不到');
    a.play().catch(() => speak(fallback, done, 'vocab/' + f + ' 播放失敗'));
  } else speak(fallback, done, '沒有 mp3：' + (wf || nf));
}
/* ======================= 🔧 音檔修復（詳解頁，回報旁邊）=======================
   做什麼：掃描目前詳解頁上每一個 🔊，列出「哪一句文字 ↔ 哪個 mp3 ↔ 路徑 ↔ 錄音時間」，
   並找出這個字名下「現在詳解已經用不到」的舊 mp3（孤兒），方便手動試聽、刪除後重錄。
   檔名規則直接共用 vplay 的 dnAuFiles（改一處就好，不會和實際播放不同步）。 */
const DN_AUSUF = { '': '單字本身', _lm: '原形', _ctx: '所在句', _en: '英文解說', _e: '例句', _c: '搭配例句', _cp: '搭配片語', _f: '屈折變化的字', _fx: '屈折變化例句',
  _m: '相關字', _mx: '相關字例句', _d: '衍生字', _p: '詞性例句', _pw: '詞性單字', _dx: '同字族例句', _s: '多義例句', _se: '多義英文解說', _sw: '多義單字', _cf: '易混淆例句', _cw: '易混淆單字',
  _sm: '近義片語', _sx: '近義片語例句', _kw: '值得注意的字', _pr: '同義改寫' };
function dnAuFiles(text, suf, fallback) { // vplay 與修復面板共用：回傳 { wf: words/ 的檔名（單字類才有）, nf: vocab/ 的檔名 }
  suf = suf || '';
  return { wf: fallback && DN_WORD_SUF.test(suf) ? `${dnSlug(fallback)}.mp3` : '', nf: suf === '_ctx' ? dnSlug(fallback) + '.mp3' : dnSlug(text) + suf + '.mp3' };
}
const dnAuLabel = suf => { const m = /^(_[a-z]+)(\d*)(?:x(\d+))?$/.exec(suf || ''); return m ? (DN_AUSUF[m[1]] || m[1]) + (m[2] ? ' #' + m[2] : '') + (m[3] ? '＋追加第 ' + m[3] + ' 句' : '') : '單字本身'; };
DN.au = null; DN.auLog = undefined; DN.auPlay = 0;
function dnAuSlots() { // 從目前畫面上的 🔊 讀出每一格：和使用者實際按到的完全一致
  const root = document.getElementById('detail-text'); if (!root) return [];
  const out = [];
  root.querySelectorAll('button[aria-label="發音"]').forEach(b => {
    const m = /vplay\('[^']*',\s*this\.dataset\.(\w),\s*'([^']*)',\s*this\.dataset\.w\)/.exec(b.getAttribute('onclick') || ''); if (!m) return;
    const suf = m[2], t = m[1] === 't' ? b.dataset.t : b.dataset.w, fb = b.dataset.w, f = dnAuFiles(t, suf, fb);
    const inW = f.wf && VW.files && VW.files.has(f.wf), inV = VA.files && VA.files.has(f.nf);
    const dir = inW ? 'audio/daily/words/' : 'audio/daily/vocab/', name = inW ? f.wf : f.nf, shared = !!f.wf;
    out.push({ suf, label: dnAuLabel(suf), text: fb, base: t, dir: shared && !inV ? 'audio/daily/words/' : dir, name: shared && !inW && !inV ? f.wf : name, tag: inW ? '共用單字庫' : inV ? '詳解例句庫' : '無 mp3', has: !!(inW || inV) });
  });
  const seen = new Set(); return out.filter(r => { const k = r.dir + r.name + '|' + r.suf + '|' + r.text; if (seen.has(k)) return false; seen.add(k); return true; });
}
function dnAuOrphans(slots) { // 這個字名下、檔名像 {單字slug}_xx 的 mp3，但目前詳解沒有任何 🔊 會用到它
  const D = dnDetailData(); if (!D || !VA.files) return [];
  const bases = new Set([dnSlug(D.e.at || D.e.text), dnSlug(D.e.text)]), used = new Set(slots.map(r => r.name)), out = [];
  VA.files.forEach(f => { const m = /^(.*?)(_(?:e|c|cf|cp|cw|f|fx|m|mx|d|p|pw|s|sw|sm|sx|kw|pr|en|lm)\d*)\.mp3$/.exec(f); if (m && bases.has(m[1]) && !used.has(f)) out.push(f); });
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}
async function dnAuMeta(r) { // HEAD 取得檔案大小與修改時間（只有透過 http 開啟時才有）
  try { const x = await fetch(r.dir + r.name, { method: 'HEAD', cache: 'no-cache' }); if (!x.ok) return {}; const lm = x.headers.get('Last-Modified'), len = +x.headers.get('Content-Length'); return { size: len || 0, mtime: lm ? new Date(lm).getTime() : 0 }; } catch (e) { return {}; }
}
async function dnAuLoadLog() { if (DN.auLog !== undefined) return DN.auLog; try { const x = await fetch('voices-log.json', { cache: 'no-cache' }); DN.auLog = x.ok ? ((await x.json()).files || {}) : null; } catch (e) { DN.auLog = null; } return DN.auLog; }
async function dnOpenAudioFix() {
  const D = dnDetailData(); if (!D) return;
  dnModal(`<div class="${card} w-full max-w-4xl p-5 text-sm text-slate-500">掃描音檔中…</div>`);
  const slots = dnAuSlots(), orph = dnAuOrphans(slots), log = await dnAuLoadLog();
  await Promise.all(slots.filter(r => r.has).map(async r => { Object.assign(r, await dnAuMeta(r)); const rec = log && log[r.dir + r.name]; if (rec) { r.rec = rec.date || ''; r.voice = rec.voice || ''; } }));
  for (const f of orph) { const r = { dir: 'audio/daily/vocab/', name: f }; Object.assign(r, await dnAuMeta(r)); const rec = log && log[r.dir + f]; if (rec) r.rec = rec.date || ''; orph[orph.indexOf(f)] = r; }
  const fam = s => String(s).replace(/\d+$/, ''), grp = {}; // 同一組（例如 _fx1~_fx5）錄音時間差太多＝可能只補錄了一部分
  slots.forEach(r => { if (r.has && r.suf) { const t = r.rec ? new Date(r.rec.replace(' ', 'T')).getTime() : r.mtime; if (t) (grp[fam(r.suf)] = grp[fam(r.suf)] || []).push(t); } });
  const odd = new Set(Object.keys(grp).filter(k => grp[k].length > 1 && Math.max(...grp[k]) - Math.min(...grp[k]) > 30 * 60 * 1000));
  slots.forEach(r => { r.odd = r.has && odd.has(fam(r.suf)); });
  DN.au = { slots, orph, hasLog: !!log, e: D.e.text, odd };
  dnAuRender();
}
function dnAuRender() {
  const A = DN.au; if (!A) return;
  const fm = t => t ? dnTime(t) : '—', kb = n => n ? Math.round(n / 1024) + ' KB' : '—';
  const miss = A.slots.filter(r => !r.has).length, oddN = A.slots.filter(r => r.odd).length;
  const rows = A.slots.map((r, i) => `<tr class="border-t border-slate-200 dark:border-slate-800 ${r.odd ? 'bg-amber-50 dark:bg-amber-950/30' : ''}" id="dn-au-r${i}">
    <td class="p-1.5"><input type="checkbox" class="dn-au-ck" data-i="${i}" ${r.has ? '' : 'disabled'}></td>
    <td class="p-1.5 whitespace-nowrap"><span class="${dnChip}">${esc(r.label)}</span>${r.odd ? ' <span title="同一組的錄音時間差很多，可能只補錄了一部分，請聽聽看" class="text-amber-600">⚠</span>' : ''}</td>
    <td class="p-1.5 min-w-[12rem]">${esc(r.text)}</td>
    <td class="p-1.5"><button onclick="dnAuPlayOne(${i})" class="${dnSm}" ${r.has ? '' : 'disabled'}>▶</button></td>
    <td class="p-1.5 text-xs break-all"><span class="${r.has ? 'text-slate-500' : 'text-rose-500 font-semibold'}">${esc(r.tag)}</span><br><code>${esc(r.dir + r.name)}</code>${dnAuCpBtn(r.name)}</td>
    <td class="p-1.5 text-xs whitespace-nowrap text-slate-500">${r.has ? `${r.rec ? '錄 ' + esc(r.rec) : '改 ' + fm(r.mtime)}<br>${kb(r.size)}${r.voice ? '<br>' + esc(r.voice.replace('en-US-', '').replace(':DragonHDLatestNeural', ' HD').replace('MultilingualNeural', ' Multi')) : ''}` : '—'}</td></tr>`).join('');
  const orows = A.orph.map(r => `<li class="flex flex-wrap items-center gap-2"><input type="checkbox" class="dn-au-ok" data-n="${esc(r.name)}"><code class="text-xs">${esc(r.dir + r.name)}</code>${dnAuCpBtn(r.name)}<span class="text-xs text-slate-500">${r.rec ? '錄 ' + esc(r.rec) : r.mtime ? '改 ' + fm(r.mtime) : ''} ${kb(r.size)}</span><button onclick="dnAuPlayFile('${esc(r.dir + r.name)}')" class="${dnSm}">▶</button></li>`).join('');
  dnModal(`<div class="${card} w-full max-w-4xl p-4 md:p-5"><div class="flex items-center justify-between mb-2"><h2 class="font-bold">🔧 音檔修復 · ${esc(A.e)}</h2><button onclick="dnAuStop();dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <p class="text-xs text-slate-500 mb-2 leading-relaxed">▶ 只播 mp3 本身（不會退回語音合成），聽到的內容和左邊文字不同＝這個檔過期了。${A.hasLog ? '' : '（讀不到 voices-log.json，錄音時間改用檔案修改時間；用 file:// 開啟則兩者都沒有。）'}</p>
    <div class="flex flex-wrap items-center gap-2 mb-2"><button onclick="dnAuPlayAll()" class="${dnSm}">▶ 依序播放全部</button><button onclick="dnAuStop()" class="${dnSm}">■ 停止</button>
      <button onclick="dnAuCk(true)" class="${dnSm}">勾選有異常的</button><button onclick="dnAuCopy('path')" class="${dnSm}">複製勾選的路徑</button><button onclick="dnAuCopy('del')" class="${dnSm}">複製刪除指令（勾選）</button>
      <span class="text-xs text-slate-500">共 ${A.slots.length} 個 🔊；<b class="${miss ? 'text-rose-500' : ''}">沒有 mp3 ${miss}</b>；<b class="${oddN ? 'text-amber-600' : ''}">時間不一致 ${oddN}</b>；孤兒 ${A.orph.length}</span></div>
    <div class="overflow-x-auto"><table class="w-full text-sm"><thead><tr class="text-xs text-slate-400 text-left"><th class="p-1.5"></th><th class="p-1.5">位置</th><th class="p-1.5">念的文字</th><th class="p-1.5"></th><th class="p-1.5">實際播放的檔案</th><th class="p-1.5">錄音</th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3 class="text-xs font-bold text-slate-400 mt-4 mb-1">孤兒檔（在 vocab/ 裡、名字屬於這個字，但目前詳解沒有任何 🔊 用到它）</h3>
    ${orows ? `<ul class="space-y-1">${orows}</ul>` : '<p class="text-xs text-slate-400">沒有。</p>'}
    <p class="text-[0.6875rem] text-slate-400 mt-3 leading-relaxed">修法：確認是過期檔後，勾選 → 複製刪除指令 → 貼到專案根目錄的命令提示字元執行 → <code>python auto-speech.py daily</code> 勾選詳解重錄（缺檔會自動補，並重建 index.json）→ 網頁 Ctrl+F5。</p></div>`);
}
function dnAuStop() { DN.auPlay++; try { if (dnAu) { dnAu.pause(); dnAu = null; } } catch (e) {} document.querySelectorAll('[id^="dn-au-r"]').forEach(tr => tr.style.outline = ''); }
function dnAuPlayFile(path) { return new Promise(res => { dnAuStop(); const a = dnAu = new Audio(path + '?t=' + Date.now()); a.onended = () => res(true); a.onerror = () => { dnToast('讀不到 ' + path); res(false); }; a.play().catch(() => res(false)); }); }
function dnAuPlayOne(i) { const r = DN.au && DN.au.slots[i]; if (r && r.has) dnAuPlayFile(r.dir + r.name); }
async function dnAuPlayAll() {
  const A = DN.au; if (!A) return; dnAuStop(); const my = ++DN.auPlay;
  for (let i = 0; i < A.slots.length; i++) {
    const r = A.slots[i]; if (!r.has) continue; if (my !== DN.auPlay) return;
    const tr = document.getElementById('dn-au-r' + i); if (tr) { tr.style.outline = '2px solid #6366f1'; tr.scrollIntoView({ block: 'nearest' }); }
    await new Promise(res => { const a = dnAu = new Audio(r.dir + r.name + '?t=' + Date.now()); a.onended = a.onerror = () => res(); a.play().catch(() => res()); });
    if (tr) tr.style.outline = ''; if (my !== DN.auPlay) return; await new Promise(res => setTimeout(res, 500));
  }
}
function dnAuCk(odd) { const A = DN.au; if (!A) return; document.querySelectorAll('.dn-au-ck').forEach(c => { const r = A.slots[+c.dataset.i]; c.checked = !!(r && r.odd); }); document.querySelectorAll('.dn-au-ok').forEach(c => c.checked = true); }
/* 一鍵複製單一音檔的檔名（不含資料夾）；這次開啟網頁期間複製過的，按鈕換成 ✓（關掉視窗再打開也還在，重新整理網頁才清掉） */
const dnAuCpBtn = n => DN.auCopied && DN.auCopied.has(n) ? '<span class="text-emerald-600 font-bold ml-1" title="已複製過">✓</span>' : `<button onclick="dnAuName(this)" data-n="${esc(n)}" class="${dnSm} !px-1.5 !py-0 ml-1" title="複製檔名">📋</button>`;
function dnAuName(b) {
  const n = b.dataset.n;
  (navigator.clipboard ? navigator.clipboard.writeText(n) : Promise.reject()).then(() => { (DN.auCopied = DN.auCopied || new Set()).add(n); b.outerHTML = dnAuCpBtn(n); dnToast('已複製 ' + n); }, () => dnToast('無法複製（請用 https 或 localhost 開啟）'));
}
function dnAuCopy(mode) {
  const A = DN.au; if (!A) return;
  const ps = [...document.querySelectorAll('.dn-au-ck:checked')].map(c => A.slots[+c.dataset.i]).map(r => r.dir + r.name)
    .concat([...document.querySelectorAll('.dn-au-ok:checked')].map(c => 'audio/daily/vocab/' + c.dataset.n));
  const uniq = [...new Set(ps)]; if (!uniq.length) { dnToast('請先勾選'); return; }
  const txt = mode === 'del' ? uniq.map(p => `del "${p.replace(/\//g, '\\')}"`).join('\r\n') : uniq.join('\r\n');
  (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => dnToast(`已複製 ${uniq.length} 筆`), () => { dnDownload('audio-fix.txt', txt, 'text/plain'); dnToast('已下載 audio-fix.txt'); });
}
function dnGoExtra(el) { // 入庫列的「看詳解」：核心單字（data-i）開核心單字詳解，其他開入庫單字的詳解
  dnSelClear();
  if (el.dataset.i != null && el.dataset.i !== '') { const a = dnArt(el.dataset.q); if (!a) return; cur.w = a.week; cur.d = a.day; dnOpenVocab(+el.dataset.i); return; }
  dnOpenExtra(el.dataset.q, el.dataset.t);
} // 入庫列的「看詳解」：直接跳到該字的詳解頁
function dnSetType(t) { if (DN.sel) { DN.sel.type = t; dnBar(); } }
function myphAddSel() { const s = DN.sel; if (!s || s.src === 'detail') return; myphAdd(s.qid, s.from, s.to); dnSelClear(); }
function dnSelClear() { DN.sel = null; try { window.getSelection().removeAllRanges(); } catch (e) {} dnBar(); }
function dnAddMark(mode) { // mode：'own'＝本篇入庫（複習用，不補詳解）、'sup'＝入庫並補充詳解、省略＝照舊
  const s = DN.sel; if (!s) return;
  if (s.src === 'detail') { // 從詳解頁入庫：全域去重，不綁週次；qid 只當「發現於」與提示詞的文章脈絡
    if (dnBanked(s.text)) { if (!dnAskStudy(s.text)) dnToast('這個已經在庫了'); return; }
    if (!dnRelAsk(s.text)) return;
    const now = Date.now();
    dnMarks().push({ id: dnId('m'), qid: s.qid, text: s.text, type: s.type, ctx: s.type === 'sentence' ? s.text : (s.ctx || s.text), from: 0, to: 0, src: 'detail', head: s.head || '', note: '', created: now, updated: now });
    save(); dnSelClear(); dnToast(`已入庫（${DNT[s.type]}），到「📌 入庫彙整」補詳解`); render(); return;
  }
  const exM = dnMarks().find(m => m.qid === s.qid && dnKey(m.text) === dnKey(s.text));
  if (exM && !(exM.own && mode === 'sup')) { if (!dnAskStudy(s.text)) dnToast(exM.own ? '這個已經在本篇入庫（複習用）了' : '這個已經入庫了'); return; }
  if (((dnArt(s.qid) || {}).vocab || []).some(v => dnKey(v.word) === dnKey(s.text))) { dnToast('這是本篇的核心單字，不用入庫（按「看詳解」）'); return; }
  if (!exM && !dnRelAsk(s.text)) return;
  const x = dnArt(s.qid), p = String(x ? x.passage : '');
  const now = Date.now();
  const el = dnElsewhere(s.qid, s.text), cx = s.type === 'sentence' ? s.text : dnCtxOf(p, s.from, s.to, s.text);
  const own = mode === 'own' && !!(el && el.merged) && s.type !== 'sentence'; // 別篇已有詳解、只想在本篇複習：不補詳解
  if (exM) { delete exM.own; exM.updated = now; } // 本篇複習 → 改為補充詳解
  else dnMarks().push({ id: dnId('m'), qid: s.qid, text: s.text, type: s.type, ctx: cx, from: s.from, to: s.to, note: '', ...(own ? { own: true } : {}), created: now, updated: now });
  const sup = !own && !!(el && el.merged && s.type !== 'sentence' && typeof nwAddSupplement === 'function' && nwAddSupplement(s, cx, x)); // 別篇已有詳解：把這篇的句子交給「新單字」流程，請 AI 判斷要不要補充用法
  save(); dnSelClear();
  dnToast(own ? `已在本篇入庫（複習用），沿用 ${el.label} 的詳解，不補充詳解` : el && el.merged ? (sup ? `已入庫，沿用 ${el.label} 的詳解；這句已加進「新單字」，會請 AI 判斷要不要補充用法` : `已入庫，沿用 ${el.label} 的詳解`) : `已入庫（${DNT[s.type]}）`); render();
}
/* 文稿上畫底線：事後在 DOM 上把對應的文字包起來（不影響排版、不影響 timing 句子的 span） */
function dnLocate(p, m) {
  if (p.slice(m.from, m.to) === m.text) return { from: m.from, to: m.to };
  const i = p.toLowerCase().indexOf(String(m.text).toLowerCase());
  return i < 0 ? null : { from: i, to: i + m.text.length };
}
function dnApplyMarks() {
  const x = find(cur.w, cur.d); if (!x) return;
  const ms = dnMarksOf(idOf(x)); if (!ms.length) return;
  const p = String(x.passage || ''), one = document.getElementById('passage-text');
  const segs = one ? [{ el: one, base: 0, len: p.length }] : dnPairSegs(x); // 單語：整段；中英對照：每個英文句各自一段
  if (!segs.length) return;
  ms.slice().sort((a, b) => (b.to - b.from) - (a.to - a.from)).forEach(m => { // 長的先包，短的包在裡面
    const loc = dnLocate(p, m); if (!loc) return;
    segs.forEach(sg => {
      const lo = Math.max(loc.from, sg.base), hi = Math.min(loc.to, sg.base + sg.len); if (lo >= hi) return;
      const tw = document.createTreeWalker(sg.el, NodeFilter.SHOW_TEXT), nodes = []; let pos = 0, n;
      while ((n = tw.nextNode())) { nodes.push({ n, s: pos, e: pos + n.nodeValue.length }); pos += n.nodeValue.length; }
      if (pos !== sg.len) return; // 這段的文字和 passage 對不上（例如文稿剛改過、timing 還沒更新）：不畫，不會壞
      nodes.forEach(o => {
        const a = Math.max(lo - sg.base, o.s) - o.s, b = Math.min(hi - sg.base, o.e) - o.s;
        if (a >= b) return;
        let mid = o.n; if (a > 0) mid = mid.splitText(a); if (b - a < mid.nodeValue.length) mid.splitText(b - a);
        const sp = document.createElement('span'); sp.className = 'mk mk-' + m.type; sp.dataset.id = m.id;
        mid.parentNode.insertBefore(sp, mid); sp.appendChild(mid);
      });
    });
  });
}
document.getElementById('main').addEventListener('click', e => { // 在文稿上：選字時不要觸發「點句子播放」；點底線＝開啟該筆入庫
  const t = e.target, inP = t.closest && t.closest('#passage-text, #pair-text'); if (!inP) return;
  if (!cur.mk) return; // 播放模式：照舊點句子播放
  e.stopPropagation(); // 標註模式：點／選文稿一律不播放
  const s = window.getSelection();
  if (s && !s.isCollapsed) return;
  const m = t.closest('.mk'); if (m) { dnMarkMenu(m.dataset.id); return; }
  const h = t.closest('mark.hl[data-vi]'); if (h && typeof hlOpen === 'function') hlOpen(null, +h.dataset.vi); // 標註模式：點標示的核心單字 → 開詳解（雙擊選字不會開）
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
function dnDelMark(id) { if (!confirm('確定刪除這筆入庫？')) return; if (typeof nwOnMarkDel === 'function') nwOnMarkDel(id); S.marks = dnMarks().filter(m => m.id !== id); save(); dnClose(); render(); }
function dnDelMark2(id) { if (!confirm('確定刪除這筆入庫？')) return; if (typeof nwOnMarkDel === 'function') nwOnMarkDel(id); S.marks = dnMarks().filter(m => m.id !== id); save(); render(); }

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
          <span class="ml-1 align-middle text-[0.625rem] rounded px-1.5 py-0.5 ${DNTC[m.type]}">${DNT[m.type]}</span>${m.own ? '<span class="ml-1 align-middle text-[0.625rem] rounded px-1.5 py-0.5 bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">複習用</span>' : ''}${sp}
        </div>
        <button onclick="vplay('${m.qid}', this.dataset.w, '', this.dataset.w)" data-w="${esc(m.text)}" data-vq="${m.qid}" data-vw="${esc(m.text)}" class="text-slate-400 hover:text-indigo-600 text-lg shrink-0">🔊</button>
      </div>
      ${body}
    </div>
    <div class="flex gap-2 mt-3">
      ${e ? `<button onclick="dnOpenMark('${m.id}')" class="${btn} text-xs flex-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">詳解 ›</button>` : ''}
      ${e ? '' : `<button onclick="dnMarkMenu('${m.id}')" class="${btn} text-xs flex-1 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800">備註／類型／刪除</button>`}${m.own ? `<button onclick="dnDelMark2('${m.id}')" class="${btn} text-xs text-rose-500 border border-slate-200 dark:border-slate-800">移除</button>` : ''}
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
        ? (ty === 'all' ? ['word', 'phrase', 'sentence'].map(k => { const g = list.filter(m => m.type === k); return g.length ? `<p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">${DNT[k]}（${g.length}）</p><div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">${g.map(dnMyCard).join('')}</div>` : ''; }).join('') + '<div class="mb-2"></div>' : `<div class="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8">${list.map(dnMyCard).join('')}</div>`)
        : `<p class="text-xs text-slate-400 mb-8">這個分類還沒有項目。</p>`;
  }
  return h;
}
function dnMyType(t) { cur.myType = t; render(); }
function dnOpenMark(id) { const m = dnMarks().find(q => q.id === id); if (!m) return; if (dnMerged(m)) dnOpenExtra(m.qid, m.text); else dnMarkMenu(id); }

/* ======================= 入庫彙整頁（含 AI 提示詞） ======================= */
const dnChecked = m => DN.chk[m.id] !== undefined ? DN.chk[m.id] : (!dnMerged(m) || DN.mf === 'gap');
/* ---------- 已寫回的詳解還缺什麼（可在提示詞區選擇補上）---------- */
const dnFillKeys = { en: '英文解說', col: '搭配例句', forms: '屈折變化＋發音＋例句', fam: '相關字音標＋例句', deriv: '衍生字＋記憶連結', pos: '多詞性用法', sense: '多義', conf: '易混淆例句', sim: '近義片語例句', schunk: '句子：意群斷句', spara: '句子：同義改寫', spat: '句子：句型模板', skw: '句子：重點字詞', ckind: '易混淆分類', dex: '同字族例句', ipa: '單字音標（多義／易混淆／近義／搭配）' };
/* 易混淆分類 kind（confusable 每一筆的選填欄位，陣列、可複選）：spell 形似／sound 音似／meaning 義近／root 同字根／zhsame 中文同義／antonym 反義（意思相反，如 deposit／withdraw）。純粹可互換的同義說法放 similar，不放這裡 */
const DN_KIND = { spell: '形似', sound: '音似', meaning: '義近', root: '同字根', zhsame: '中文同義', antonym: '反義' };
const dnKindOk = c => !!c && typeof c === 'object' && dnArr(c.kind).length > 0 && dnArr(c.kind).every(k => DN_KIND[k]);
/* 單字音標：多義 senses（每一筆）、易混淆 confusable、近義 similar、常用搭配 collocations 裡「單字」（沒有空格）的項目都要有 ipa；片語不用 */
const dnOneWord = s => !!s && !/\s/.test(String(s).trim());
const dnNoIpa = o => !(o && typeof o === 'object' && o.ipa && String(o.ipa).trim());
const dnIpaGap = (e, withSenses) => {
  const miss = (arr, kf) => dnArr(arr).some(o => o && typeof o === 'object' && dnOneWord(kf(o)) && dnNoIpa(o));
  return !!e && ((withSenses && dnArr(e.senses).some(o => o && typeof o === 'object' && dnNoIpa(o))) || miss(e.confusable, o => o.word || o.phrase) || miss(e.similar, o => o.phrase || o.word) || miss(e.collocations, o => o.phrase || o.p));
};
const dnCkindGap = e => { const cf = dnArr(e && e.confusable); return cf.length > 0 && !cf.every(dnKindOk); }; // 有易混淆、但有任何一筆沒有合法的 kind
const dnCkindOfMark = m => { const x = dnArt(m.qid), e = x && dnFindExtraAny(x, m.text); return !!(e && (m.type === 'word' || m.type === 'phrase') && dnIsPrimary(m) && dnCkindGap(e)); };
const dnKindChips = o => dnArr(o && o.kind).filter(k => DN_KIND[k]).map(k => ` <span class="${dnChip} !bg-sky-100 !text-sky-800 dark:!bg-sky-950 dark:!text-sky-300">${DN_KIND[k]}</span>`).join('');
function dnGapsOf(m, force) { // force＝true：詳解頁單一字的維護用，不檢查是不是「主入庫」
  const x = dnArt(m.qid), e = x && dnFindExtraAny(x, m.text); if (!e || (!force && !dnIsPrimary(m))) return [];
  if (m.type === 'sentence') return dnSentGaps(e);
  const g = [];
  if (!(e.en && String(e.en).trim())) g.push('en');
  if (m.type === 'word') {
    const cs = dnArr(e.collocations); if (!cs.length || !cs.every(c => c && c.example && c.example.en)) g.push('col');
    const fs = e.forms; if (!Array.isArray(fs) || !fs.every(f => f && typeof f === 'object' && f.ipa && f.example && f.example.en)) g.push('forms'); // 每個屈折變化都要有音標與例句；forms 是空陣列＝AI 已確認沒有屈折變化，視為完整；沒有這個欄位＝缺
    const ms = dnArr(e.family); if (ms.length && !ms.every(f => f && typeof f === 'object' && f.ipa && f.example && f.example.en)) g.push('fam');
    const ds = e.derived; if (!Array.isArray(ds) || !ds.every(f => f && typeof f === 'object' && f.w && f.ipa && f.zh && f.link)) g.push('deriv'); // derived 是空陣列＝AI 已確認沒有常見衍生字，視為完整
    if (DN.fill.dex && dnArr(e.derived).length && !dnArr(e.derived).every(f => f && typeof f === 'object' && f.example && f.example.en)) g.push('dex'); // 同字族例句：預設不勾選（舊資料很多），在「補齊內容」勾選後才列入未完整
    const pu = e.pos_uses; if (!Array.isArray(pu) || !pu.every(f => f && typeof f === 'object' && f.pos && f.ipa && f.zh && f.example && f.example.en)) g.push('pos'); // pos_uses／senses 空陣列＝AI 已確認只有單一詞性／單一意思，視為完整；舊詳解沒這兩欄＝缺
    const sn = e.senses; if (!Array.isArray(sn) || !sn.every(f => f && typeof f === 'object' && f.pos && f.zh && f.example && f.example.en)) g.push('sense');
  }
  if (m.type === 'word' || m.type === 'phrase') { // 易混淆：每一筆都要有例句；沒有易混淆項目（空陣列／沒欄位）不算缺
    const cf = dnArr(e.confusable); if (cf.length && !cf.every(c => c && typeof c === 'object' && c.example && c.example.en)) g.push('conf');
    if (DN.fill.ckind && dnCkindGap(e)) g.push('ckind'); // 易混淆分類：預設不勾選（舊資料很多），在「補齊內容」勾選後才列入未完整
    const sm = dnArr(e.similar); if (sm.length && !sm.every(c => c && typeof c === 'object' && c.example && c.example.en)) g.push('sim'); // 近義片語：每一筆都要有例句
    if (dnIpaGap(e, m.type === 'word')) g.push('ipa'); // 單字音標：多義、易混淆、近義、搭配裡的「單字」都要有 ipa
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
  if (dnBanked(w)) { if (!dnAskStudy(w)) { dnToast('這個已經在庫了'); render(); } return; }
  const now = Date.now(), t = dnWordN(w) <= 1 ? 'word' : 'phrase';
  dnMarks().push({ id: dnId('m'), qid: q, text: w, type: t, ctx: head || w, from: 0, to: 0, src: 'detail', head, note: '', created: now, updated: now });
  save(); dnToast(`已入庫（${DNT[t]}），到「📌 入庫彙整」補詳解`); render();
}
function dnToggleFill(k) { DN.fill[k] = !DN.fill[k]; render(); }
function dnToggleCkind() { DN.fill.ckind = !DN.fill.ckind; if (DN.fill.ckind) DN.mf = 'gap'; render(); } // 開啟「易混淆分類」補齊：自動切到「未完整詳解」，缺分類的字才看得到
function dnFillRow(ms) {
  if (!ms.some(m => dnMerged(m) && dnChecked(m) && (dnGapsOf(m).length || dnCkindOfMark(m)))) return '';
  return `<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 px-3 py-2"><span class="font-semibold text-amber-800 dark:text-amber-300">補齊內容：</span>${Object.keys(dnFillKeys).map(k => { const n = ms.filter(m => dnMerged(m) && (k === 'ckind' ? dnCkindOfMark(m) : dnGapsOf(m).includes(k))).length; return `<label class="flex items-center gap-1 cursor-pointer ${n ? '' : 'opacity-40'}"><input type="checkbox" ${DN.fill[k] ? 'checked' : ''} onchange="dnToggleFill('${k}')" class="h-3.5 w-3.5">${dnFillKeys[k]}<span class="${n ? 'font-semibold text-amber-700 dark:text-amber-300' : 'text-slate-400'}">（${n}）</span></label>`; }).join('')}<span class="text-slate-500">（括號＝這篇有幾個字缺這項；只補勾選且缺的部分，灰色＝這篇沒有字缺）</span></div>`;
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
/* 複製提示詞每批上限（存在這台裝置，不同步）：一次交給 AI 的字太多，回傳容易被截斷或變粗糙 → 超過就分批，再按一次複製下一批 */
const DN_CAPS = [5, 8, 10, 15, 0];
function dnCopyMax() { let v = NaN; try { v = parseInt(localStorage.getItem('dailyCopyMax')); } catch (e) {} return DN_CAPS.includes(v) ? v : 8; }
function dnCapSet(v) { try { localStorage.setItem('dailyCopyMax', String(parseInt(v) || 0)); } catch (e) {} render(); }
function dnCapCtl() { const N = dnCopyMax(); return `<label class="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">每批最多<select onchange="dnCapSet(this.value)" class="${dnInp} !py-0.5 !px-1.5 text-xs !w-auto">${DN_CAPS.map(c => `<option value="${c}" ${c === N ? 'selected' : ''}>${c ? c + ' 個字' : '不限'}</option>`).join('')}</select>超過會分批，再按一次「複製」換下一批</label>`; }
const dnCapTag = n => { const N = dnCopyMax(); return N && n > N ? `・分 ${Math.ceil(n / N)} 批` : ''; };
DN.cb = DN.cb || {};
function dnBatchPick(key, sig, total) { // 這次要複製第幾批：同一組項目連按會依序換批；項目變了（例如已寫回）就從第 1 批重來
  const N = dnCopyMax(); if (!N || total <= N) return { i: 0, nb: 1, lo: 0, hi: total };
  const nb = Math.ceil(total / N), st = DN.cb[key], i = st && st.sig === sig ? st.i % nb : 0;
  DN.cb[key] = { sig, i: i + 1 };
  return { i, nb, lo: i * N, hi: Math.min(total, i * N + N) };
}
const dnBatchMsg = (b, n) => `已複製第 ${b.i + 1}／${b.nb} 批（${n} 個字），貼給 AI；再按一次複製下一批`;
function dnCopyArt(qid) {
  const its = dnPromptItems(qid); if (!its.length) return;
  const b = dnBatchPick('art:' + qid, its.map(o => o.m.id).join(','), its.length);
  auCopy(b.nb > 1 ? dnPrompt(qid, undefined, undefined, undefined, [b.lo, b.hi]) : dnPrompt(qid));
  if (b.nb > 1) dnToast(dnBatchMsg(b, b.hi - b.lo));
}
function dnMgCopy(onlySel) { // onlySel＝true：只處理「依文章」模式勾選的文章；省略＝A–Z 模式（全部有勾選項目的文章）
  let b = null;
  const t = dnWithVisOnly(vis => {
    const q = dnMgQids(vis).filter(id => !onlySel || DN.artSel[id]); if (!q.length) return '';
    const its = q.map(id => dnPromptItems(id)), cnt = its.map(a => a.length), total = cnt.reduce((s, n) => s + n, 0);
    b = dnBatchPick(onlySel ? 'mgsel' : 'mg', its.map(a => a.map(o => o.m.id).join(',')).join('|'), total);
    const parts = []; let off = 0;
    q.forEach((id, k) => { const lo = Math.max(b.lo, off) - off, hi = Math.min(b.hi, off + cnt[k]) - off; off += cnt[k]; if (hi > lo) parts.push({ id, rng: b.nb > 1 ? [lo, hi] : null }); });
    if (parts.length === 1) return dnPrompt(parts[0].id, undefined, undefined, undefined, parts[0].rng);
    return `以下共 ${parts.length} 份獨立的任務（各對應一篇文章）。請依序處理，每一份各自產生一個獨立的 JSON 檔案，檔名以各份「輸出格式」所寫為準，不要合併成同一個檔案。\n\n` + parts.map((p, i) => `==================== 第 ${i + 1}／${parts.length} 份 ====================\n` + dnPrompt(p.id, undefined, undefined, undefined, p.rng)).join('\n\n');
  });
  if (!t) { dnToast(onlySel ? '請先勾選要複製的文章（標題左邊的方框）' : '沒有勾選可寫提示詞的項目'); return; }
  auCopy(t); if (b && b.nb > 1) dnToast(dnBatchMsg(b, b.hi - b.lo));
  else if (onlySel) { const n = dnArtSelInfo(); dnToast(`已複製 ${n.nArt} 篇文章、${n.nItems} 個字的提示詞，貼給 AI`); }
}
/* ---- 「依文章」模式：跨文章多選（例如只選 W1·D1 與 W1·D3），一鍵複製多篇的提示詞；每篇各一份、各自輸出一個 w?d?_extra.json ---- */
DN.artSel = DN.artSel || {}; DN.artOpen = DN.artOpen || {}; // artOpen：「依文章」模式每篇是否展開（預設收合）
function dnToggleOpen(qid) { DN.artOpen[qid] = !DN.artOpen[qid]; render(); }
function dnArtOpenAll(v) { (DN.artIds || []).forEach(q => { DN.artOpen[q] = v; }); render(); }
const dnOpenBtn = (qid, open) => `<button onclick="dnToggleOpen('${qid}')" class="text-xs text-slate-400 hover:text-slate-600 mr-2 w-3 align-middle cursor-pointer" aria-label="展開／收合">${open ? '▼' : '▶'}</button>`;
function dnArtSelInfo() { return dnWithVisOnly(vis => { const q = dnMgQids(vis).filter(id => DN.artSel[id]); return { nArt: q.length, nItems: q.reduce((n, id) => n + dnPromptItems(id).length, 0) }; }); }
function dnToggleArt(qid, v) { DN.artSel[qid] = v; render(); }
function dnArtSelAll(v) { dnWithVisOnly(vis => dnMgQids(vis)).forEach(id => { DN.artSel[id] = v; }); render(); }
function dnChkLetter(c, v) { (DN.mgIds[c] || []).forEach(id => { DN.chk[id] = v; }); render(); }
function dnChkAllVis(v) { Object.keys(DN.mgIds || {}).forEach(c => DN.mgIds[c].forEach(id => { DN.chk[id] = v; })); render(); }
const FENCE = '`'.repeat(3);
const DNF = {
  en: '補上 en（英文解說）',
  col: '補上 collocations（常用搭配＋每個搭配的例句；搭配若只是單字，要加 ipa）；若現有詳解有舊的 col 字串，把裡面的搭配轉成 collocations 後刪掉 col',
  forms: '補齊 forms（只放屈折變化：單複數、第三人稱單數、過去式、過去分詞、現在分詞、比較級等；每一筆都要有 label、pos、zh、ipa，以及一句 example { en, zh }：例句 8–15 字、商務情境、必須真的用到該屈折形、同程度，且不要與 examples、collocations 的例句重複；缺的筆數與缺的例句都要補；既有的 w、label、pos、zh、ipa 原樣保留；衍生字不要放這裡；若這個字沒有屈折變化，輸出 "forms": []）',
  fam: '補齊 family（每一個都要有 ipa、pos、zh，以及至少 1 句 example）',
  deriv: '新增或補齊 derived（衍生字：同詞幹、由這個字加字首／字尾長出來的常見單字；每一筆都要有 w、ipa、pos、zh、link、example（en + zh））；其他欄位一律原樣保留',
  dex: '補齊 derived（同字族）每一筆的 example（en + zh，例句 8–15 字、商務情境、同程度，必須真的用到該衍生字本身）；每一筆原有的 w、ipa、pos、zh、link 一律逐字原樣保留，已有 example 的筆數也原樣保留；其他欄位一律原樣保留',
  pos: '新增或補齊 pos_uses（多詞性：同一拼法的各種詞性用法，每一筆都要有 pos、ipa、zh、example；只有單一詞性就輸出空陣列 []）；其他欄位一律原樣保留',
  sense: '新增或補齊 senses（多義：同一詞性內的不同意思，每一筆都要有 pos、ipa（該詞性的美式音標）、zh、en、example；只有單一意思就輸出空陣列 []）；其他欄位一律原樣保留',
  conf: '補齊 confusable（易混淆）：每一筆都保留原有的 word（片語用 phrase）、diff 與 kind（沒有 kind 的請一併補上，值見下方 kind 說明），word 是單字（沒有空格）的要有 ipa（美式音標，片語不用），並各加一句 example { en, zh }：例句必須真的用到該易混淆字、8–15 字、商務情境、同程度，且要讓人看得出它和本字的差異；缺的筆數也要補；其他欄位一律原樣保留',
  schunk: '補齊 chunks（意群斷句）：照原句順序切成 3–8 個意群，每筆 en（原文片段）＋ zh；所有 en 依序接起來必須剛好等於整句；其他欄位一律原樣保留',
  spara: '補齊 paraphrase（同義改寫）：1–2 句、意思與原句相同、換一種說法，每筆 en＋zh，程度同上，且不要與 examples 重複；其他欄位一律原樣保留',
  spat: '補齊 pattern（句型模板）：把這句抽成可重複使用的模板，可替換的部分用 V、N、時間、人物 等標示；其他欄位一律原樣保留',
  skw: '補齊 key_words（重點字詞）：每一筆都要有 w、zh；w 是單字時還要有 ipa（美式）與 pos；w 是片語時不用 ipa、pos；既有的項目保留並補齊缺的；真的沒有值得註記的字就輸出空陣列 []；其他欄位一律原樣保留',
  sim: '補齊 similar（近義片語）：每一筆都保留原有的 phrase（單字用 word）與 diff，phrase 或 word 是單字的要有 ipa（美式音標，片語不用），並各加一句 example { en, zh }：例句必須真的用到該近義片語、8–15 字、商務情境、同程度，且要讓人看得出它和本片語的差異；缺的筆數也要補；其他欄位一律原樣保留',
  ckind: '補上 confusable 每一筆的 kind（易混淆分類，陣列、可複選，值只能是 spell／sound／meaning／root／zhsame／antonym；定義見下方「內容規則」的 kind 說明）；只加 kind，每一筆原有的 word（phrase）、diff、usage、example 一律逐字原樣保留，不要改寫；已有合法 kind 的筆數也原樣保留',
  ipa: '補上單字音標 ipa（美式、斜線包住，如 "/ˈɪnvɔɪs/"；單音節字不標重音；詳見「音標總則」）：senses 每一筆都加 ipa（該詞性的讀音，詞性不同讀音不同時分開寫）；confusable 與 similar 每一筆，若 word／phrase 是「單字」（沒有空格）就加 ipa，片語不用；collocations 的 phrase 若只是單字也加 ipa；只加 ipa，其他內容一律逐字原樣保留；已有 ipa 的原樣保留',
  nwnote: '依「新單字備註」補充：先判斷備註有沒有打錯字、真正想問什麼；若現有詳解已涵蓋就不要硬加新的；需要時才在最合適的欄位新增或微調內容（例如 note、grammar_note、examples、collocations、confusable、similar、pos_uses、senses…），其餘欄位原樣保留；若備註是「另一篇又出現」，要加／更新 usages（見「另一篇的用法」規則）；並依「新單字備註」規則加上 nw_done'
};
function dnPromptItems(qid, only, fillAll) { // fillAll＝true：連已寫回但缺內容的也一併補（核心單字直接複製用） // only＝Set(單字小寫)：只取這些字的新項目（TSL 缺詳解用）；省略則依勾選 // 要寫進提示詞的項目：新項目＝全寫；已寫回但缺內容的＝只補缺的
  const out = [];
  dnMarksOf(qid).filter(m => only ? only.has(dnKey(m.text)) : dnChecked(m)).forEach(m => {
    if (!only && !dnIsPrimary(m)) return; // 同字在更早的篇已入庫：共用同一份，不重複寫提示詞
    if (!dnMerged(m)) { out.push({ m, fill: null }); return; }
    if (only && !fillAll) return;
    const g = dnGapsOf(m).filter(k => fillAll || DN.fill[k]); if (g.length) out.push({ m, fill: g });
  });
  return out;
}
function dnPrompt(qid, only, fillAll, extraIts, rng) { // extraIts：額外的項目（新單字補充區用的 [{ m, fill }]）
  const x = dnArt(qid); if (!x) return '';
  const its0 = dnPromptItems(qid, only, fillAll).concat(extraIts || []), its = rng ? its0.slice(rng[0], rng[1]) : its0, lv = x.level || {}, sc = lv.score || 600, isAdd = o => !!(o.fill && o.fill.includes('nwnote') && typeof nwCfOnly === 'function' && nwCfOnly(o.m)), hasAdd = its.some(isAdd), hasFill = its.some(o => o.fill && !isAdd(o)), hasNw = typeof nwNotesFor === 'function' && its.some(o => nwNotesFor(o.m).length);
  const items = its.map(({ m, fill }, i) => {
    let t = `${i + 1}. ` + (isAdd({ m, fill }) ? '【只追加】' : fill ? '【補齊】' : '') + `type=${m.type}｜text="${m.text}"` + (m.type === 'sentence' || !m.ctx ? '' : `｜所在句："${m.ctx}"`) + (typeof nwNoteTxt === 'function' ? nwNoteTxt(m) : (m.note ? `｜我的備註：${m.note}` : ''));
    if (isAdd({ m, fill })) { // 「＋新增易混淆字」：不附整筆現有詳解，只附現有項目的字（避免重複），AI 只回新增的
      const e0 = dnFindExtraAny(x, m.text) || {}, ws = a => dnArr(a).map(o => typeof o === 'string' ? o : (o && (o.word || o.phrase))).filter(Boolean).join('、') || '（無）';
      t += `\n   本字：${[e0.ipa, e0.pos, e0.zh].filter(Boolean).join(' ')}\n   現有易混淆（不要重複，也不要改動）：${ws(e0.confusable)}\n   現有近義片語（不要重複）：${ws(e0.similar)}`;
    } else if (fill) t += `\n   要補：${fill.map(k => DNF[k]).join('；')}\n   現有詳解（既有內容保留，只補缺的）：${JSON.stringify(dnFindExtraAny(x, m.text))}`;
    return t;
  }).join('\n');
  const R_LV = `- 說明、例句、搭配、相關字都要控制在多益約 ${sc} 分的程度：用字與句型不要超過這個程度；例句 8–15 字、商務情境、不要用罕見字。`;
  const R_IPA = '- 【音標總則】詳解裡出現的每一個「單字」（沒有空格）都要附 ipa：主字、forms、family、derived、pos_uses、senses、confusable、similar、collocations、key_words 皆然；片語（有空格）不用。不可省略，也不可用空字串或「…」代替。格式：美式、斜線包住、不加音節點；母音用 ɑː ɔː iː uː oʊ eɪ aɪ ɔɪ aʊ，字尾 r 寫 ər，g 用 ɡ（U+0261）；單音節字不標重音，多音節字標 ˈ（主重音）與 ˌ（次重音）；同一個拼法不同詞性念法不同時（如 record、present）要分開寫。';
  const R_CONF = '- 易混淆 confusable（單字、片語）：容易和本字／本片語搞混的字（拼法、發音、意思相近，或意思相反），通常 1–3 個、同程度。每一筆都要有 word（片語用 phrase；word 是單字時還要有 ipa）、diff（一句話說明和本字的差異）、kind（分類，陣列），以及 example（en + zh）：例句 8–15 字、商務情境、必須真的用到「該易混淆字」，並讓讀者從句意看出它和本字的差異；不要只寫 diff 沒有例句。產生前請依這 6 類逐一想一遍：spell 形似（拼法接近）、sound 音似（發音接近）、meaning 義近（意思接近，但語氣、用法或搭配不同）、root 同字根（字根相同、字首或字尾不同、意思不同）、zhsame 中文同義（英文意思差很多，只是中文翻譯相同）、antonym 反義（意思相反，常成對出現、也容易用反，如 deposit／withdraw、increase／decrease）。每一類都要實際比對，不要只憑印象：sound 音似請拿雙方的音標（IPA）比，開頭或結尾音節相同、重音位置相同、音節數相近都算音似；spell 形似看字形；meaning 義近看語氣、用法或搭配；root 同字根看字根；zhsame 中文同義看中文翻譯；antonym 反義看是不是正好相反的意思（這個字有常見的反義字就要列）。只要有明顯相似、而且是多益程度的常見字就列入，不必等到考試真的考過；只有完全看不出相似、或太冷僻的字才跳過，不要為了湊數硬加。6 類都沒有，就省略整個 confusable 欄位。若兩者的差異不只是意思（例如詞性不同、及物與不及物、可數與不可數、後面接的句型不同），才在該筆加選填的 usage（一到兩句繁體中文，具體說明用法或文法差異，如「affect 是動詞、effect 是名詞」）；只是意思不同就不要寫 usage。kind 的值只能是這六種，可複選（通常 1–2 個）：spell＝形似（拼法接近，如 principal／principle）；sound＝音似（發音接近，如 accept／except）；meaning＝義近（英文意思也很接近，但語氣、用法或搭配不同，如 economic／economical）；root＝同字根（字根相同、字首或字尾不同、意思不同，如 considerable／considerate）；zhsame＝中文同義（英文意思差很多，只是中文翻譯相同，如 borrow／lend 都翻成「借」）；antonym＝反義（意思相反，常成對出現、也容易用反，如 deposit／withdraw、increase／decrease）。純粹可以互相替換的同義說法請放 similar，不要放 confusable。';
  const R_SIM = '- 近義片語 similar（單字、片語）：意思相近、可以互相替換（或常被拿來比較）的字或片語，通常 1–3 個、同程度。每一筆都要有 phrase（單字用 word；是單字時還要有 ipa）、diff（一句話說明和本項目在語氣、用法或後面接的詞上的差異），以及 example（en + zh）：例句 8–15 字、商務情境、必須真的用到「該近義片語」。不要與 confusable 重複（confusable 是拼法、發音容易搞混的字；similar 是意思相近的說法）。真的沒有就省略這個欄位。';
  const addRules = [
    '【只追加模式（標示【只追加】的項目）】',
    '- 這些字已經有詳解，這次只要「新增易混淆項目」，所以不要輸出整筆詳解。現有項目由程式保留、新項目由程式接在陣列最後面，你不必也不可以抄回、改寫或重新排序現有項目。',
    '- 這一筆只輸出：{ "text": "（與項目完全相同）", "confusable_add": [ { "word": "…", "ipa": "/…/", "diff": "…", "kind": ["…"], "example": { "en": "…", "zh": "…" } } ], "nw_done": [ { "id": "（備註的 id）", "result": "added" } ] }。kind 的值只能是 spell／sound／meaning／root／zhsame／antonym，可複選（依實際關係填，不要照抄範例）；word 若是片語改用 phrase（片語不用 ipa）；usage 只在差異是詞性或文法用法時才加；每筆的內容規則同「易混淆 confusable」。',
    '- 若要加的其實是「意思相近、可互換」的說法，放進 "similar_add"（每筆含 phrase（單字用 word）、ipa（單字才要）、diff、example），不要放進 confusable_add。',
    '- 不要重複「現有易混淆」或「現有近義片語」已經有的字；每個字先確認它真的容易和本字搞混，沒有合適的就不要硬加：這時 confusable_add 輸出 []，nw_done 的 result 填 covered。',
    '- nw_done 的 result：added＝已追加新項目；covered＝現有項目已涵蓋、或找不到合適的字，沒有新增；unclear＝備註看不懂或無關，沒有處理。備註的 id 要照抄，每一條備註各一筆。',
    '- 這種項目的 nw_done 只寫這次處理的備註；既有的 nw_done 由程式保留，不用抄回（這條優先於「新單字備註」規則的最後一條）。',
    '- 這一筆除了 text、confusable_add、similar_add、nw_done，不要出現任何其他欄位（zh、ipa、examples、collocations…），出現了合併時會被擋下。'
  ];
  if (hasAdd && its.every(isAdd)) { // 全部都是「＋新增易混淆字」：精簡提示詞，不附文章全文、其他欄位的規則與整筆詳解範本，避免 AI 寫成整筆
    return [
      '你是 TOEIC 英語教材編輯。下面的單字／片語「已經有詳解」，我想替它們「新增易混淆字」。這次不要重寫詳解，只輸出要新增的項目；程式會把它們接在現有項目的最後面。',
      '',
      `【程度】多益約 ${sc} 分${lv.cefr ? `（CEFR ${lv.cefr}）` : ''}`,
      '',
      '【規則】',
      R_LV,
      '- 中文一律繁體；音標用美式 IPA（含斜線，如 /kənˈfɜːrm/）。',
      R_IPA,
      R_CONF.replace('6 類都沒有，就省略整個 confusable 欄位。', '6 類都沒有，就不要新增（confusable_add 輸出 []，nw_done 填 covered）。').replace('請放 similar，不要放 confusable。', '請放 similar_add，不要放 confusable_add。'),
      R_SIM,
      '',
      '【新單字備註】',
      '- 標有「新單字備註[id=…]」的項目，備註是使用者自己記下的想法，可能是語音輸入，會有錯字、同音字或中英夾雜；請先判斷真正想加的是哪個字；看不懂、或明顯與該單字無關，就不要硬猜。備註原文不要貼進詳解。',
      '',
      '【要寫的項目】（每項的 text 必須與下面完全相同，不可改寫或加減字）',
      items,
      '',
      ...addRules,
      '',
      '【輸出格式】',
      `請直接產生一個「可下載的 JSON 檔案」，檔名 w${x.week}d${x.day}_extra.json（UTF-8、純 JSON，不要包 markdown 程式碼框）。聊天裡只需一句話說明檔案已產生，不要貼出全文。若你無法產生檔案，才改成只輸出一個 json 程式碼區塊（${FENCE}json … ${FENCE}），區塊外不加任何文字。內容是單一物件，extra_vocab 依上面項目順序、每項一筆；不要輸出文章的其他欄位。檔案內容格式：`,
      FENCE + 'json',
      `{ "week": ${x.week}, "day": ${x.day}, "extra_vocab": [ { "text": "（與項目完全相同）", "confusable_add": [ { "word": "…", "ipa": "/…/", "diff": "…", "kind": ["…"], "example": { "en": "…", "zh": "…" } } ], "nw_done": [ { "id": "（備註的 id）", "result": "added" } ] } ] }`,
      FENCE
    ].join('\n');
  }
  return [
    '你是 TOEIC 英語教材編輯。請替下面「我不懂的單字／片語／句子」各寫一筆詳解。結果會寫回 daily.json 的 extra_vocab，網頁會用來顯示詳解頁。',
    '',
    isLib(x) ? `【性質】TSL 字庫（這些字還沒有文章，請寫「通用詳解」）｜多益約 ${sc} 分` : `【這篇文章】W${x.week} D${x.day}｜${x.tag || ''}｜多益約 ${sc} 分${lv.cefr ? `（CEFR ${lv.cefr}` + (lv.range ? `，範圍 ${lv.range}` : '') + '）' : ''}`,
    '',
    '【程度規則（很重要）】',
    R_LV,
    '- 中文一律繁體；音標用美式 IPA（含斜線，如 /kənˈfɜːrm/）。',
    R_IPA,
    isLib(x) ? '- note 寫這個字在多益商務情境最常見的用法與語感，1–3 句，不要寫成字典式長篇；沒有文章，不要提「這篇文章」。' : '- note 要說明「在這篇文章裡」的用法與語感，1–3 句，不要寫成字典式長篇。',
    '- 沒有內容的欄位直接省略，不要寫空字串或 null；選填欄位（grammar_note、confusable 的 usage）沒有必要就不要寫。',
    '',
    '【內容規則（單字、片語）】',
    '- 英文解說 en：用同程度的簡單英文一句話解釋，不要用比該字更難的字。',
    '- 例句 examples 數量不限：依這個字或片語實際常見的用法與情境判斷。只有一種常見用法就 2–3 句；有多個詞義、詞性或情境（會議、電子郵件、採購、出差…）就每個情境各 1–2 句，通常 3–6 句、最多 8 句。每句加 tag 標示情境（如「會議」「電子郵件」）；不要為了湊數寫重複的句型。',
    '- 常用搭配 collocations（單字）：列出多益常見的搭配（通常 2–5 個；搭配本身若只是單字，要加 ipa），每個搭配都要有自己的例句 example，例句必須真的用到該搭配，且不要與 examples 重複（網頁會把這些例句放進「例句」區並標上「常用搭配」）。',
    '- 屈折變化 forms（單字，Inflections）：只列同一個字「拼法變化」的屈折形（例：work → works、worked、working）——名詞的單數／複數、動詞的第三人稱單數／過去式／過去分詞／現在分詞、形容詞的比較級與副詞形式等；不規則變化一定要列。每一筆都要有 label（如「複數」「過去式」）、pos、zh、ipa，以及 example（en + zh）：例句 8–15 字、商務情境、同程度，必須真的用到「這個屈折形本身」（複數就要真的寫 invoices、過去式就要真的寫 invoiced），讓人從句子看出這個形態怎麼用，且不要與 examples、collocations 的例句重複；同一個拼法有多個 label（如 submitted 的過去式與形容詞）時，每一筆各寫一句不同用法的例句。加字尾或字首長出來的新字（worker、workable）不是屈折變化，一律放 derived，不要放 forms。若這個字沒有屈折變化（如介系詞、連接詞、多數副詞），輸出 "forms": []（空陣列，網頁會視為已確認、不再列入未完整）。',
    R_CONF,
    R_SIM,
    '- 文法說明 grammar_note（單字、片語，選填）：只有當這個字或片語有學習者「真的容易用錯」的文法點時才寫，一到兩句繁體中文，要具體、可直接套用，例如「look forward to 的 to 是介系詞，後面接 V-ing，不接原形」「information 是不可數名詞，不加 s」。常見的固定搭配、被動或使役句型、後面接 to V 還是 V-ing、可數或不可數、介系詞選擇都算。沒有特別的文法點就整個省略這個欄位，不要為了湊數寫「這是個及物動詞」這類空話；也不要和 note、pattern、confusable 的 usage 重複同一件事。',
    '- 相關字 family（單字，語意相近或常一起考的字，例：invoice → bill、receipt；不是同詞幹的字，同詞幹的放 derived）最多 4 個、同程度；每個都要有 ipa、pos、zh，以及至少 1 句例句 example（en + zh）。超過這個程度的字不要列。',
    '- 衍生字 derived（單字，即「同字族 Word Family」，例：work → worker、workable）：列出與這個字「同一個詞幹」、直接衍生的常見單字，最多 6 個（通常 3–6 個；真正常見的只有 1–2 個就只列那幾個，不要為了湊數硬找，也不要列不相關的字）（例如 invent → invention、inventor、inventive、inventory），只放同詞幹加字首／字尾長出來的字，不要擴及只是字根相同但拼法差很多的字（如 event、convenient）。由最基礎的字開始排。每一筆要有 w、ipa、pos、zh，以及 link（記憶連結）與 example（en + zh：例句 8–15 字、商務情境、同程度，必須真的用到這個衍生字本身）。link 用簡單直覺的繁體中文，說明「詞幹加什麼字尾，變成什麼意思」，並盡量連到我已知的單字（例：「invent + -or，做事的人，像 actor、visitor」）。這個字本身不要放進 derived；如果項目的 text 是變化形（如 updates、submitted），以原形（update、submit）為詞幹，原形本身也不要放進 derived；程度同上，太難或罕見的字不要列；單純的屈折變化（複數、第三人稱單數、過去式、-ing 分詞、比較級）已在 forms，不要放進 derived。worker、workable、submission 這類加字尾長出的字一律放 derived（forms 只放屈折變化）。若這個字真的沒有常見的衍生字，輸出 "derived": []（空陣列，這是唯一允許的空欄位），網頁會視為已確認、不再列入未完整。',
    '- 多詞性 pos_uses（單字）：同一個拼法在多益常見的「不同詞性」用法（例：bill 是 n. 帳單、v. 開帳單；present 是 n.／v.／adj.；record、increase、order、issue 都是）。每個詞性一筆，包含這個字在本篇的詞性本身。每一筆要有 pos、ipa（不同詞性發音或重音不同時要分開寫，如 record n. /ˈrekɚd/、v. /rɪˈkɔːrd/）、zh（該詞性最常用的意思）、example（en + zh，8–15 字、商務情境、必須真的用該詞性）；本篇用到的那一筆加 "in_passage": true，並排在第一個，其餘依多益常見度排序。只列多益真的常見的詞性（通常 2–3 個）。不要與 forms 重複（複數、過去式等屈折變化放 forms，不是不同詞性）。如果這個字在多益只當一種詞性用，輸出 "pos_uses": []（空陣列，與 derived 相同，是允許的空欄位，網頁會視為已確認）。',
    '- 多義 senses（單字）：同一個詞性裡「不同的意思」（例：bill 當 n. 時有「帳單」「法案」「紙鈔」；issue 當 n. 時有「議題」「發行期數」）。不同詞性的差異放 pos_uses，這裡只放「同詞性、不同意思」，兩邊不要重複列同一件事。最多 4 個，只列多益常見的；本篇用到的那個意思加 "in_passage": true 並排第一，其餘依多益常見度排序。每一筆要有 pos、ipa（該詞性的美式音標）、zh、en（同程度的簡單英文一句話）、example（en + zh，8–15 字、商務情境、必須真的用該意思），可加 distinguish 一句話說明和其他意思如何從情境分辨。如果這個字在多益只有一個常見意思，輸出 "senses": []（空陣列，網頁會視為已確認）。',
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
    ...(hasNw ? nwRules() : []),
    ...(isLib(x) ? ['【字庫說明】', '- 這些字還沒有出現在任何文章裡，所以沒有「本篇用法」：pos_uses、senses 都不要輸出 in_passage 欄位，詞性與意思依多益常見度排序，例句涵蓋最常見的商務情境。', '- 之後有文章用到這個字時，會再把「這篇的用法」補進同一筆；現在不需要為任何文章調整。', ''] : ['【文章全文】', String(x.passage || ''), '']),
    '【要寫的項目】（每項的 text 必須與下面完全相同，不可改寫或加減字）',
    items || '（尚未勾選任何項目）',
    '',
    ...(hasFill ? [
      '【補齊規則】',
      '- 標示【補齊】的項目，請輸出「完整的一筆」：保留現有詳解的所有內容（text、zh、note、examples 等一律不要改動，即使你覺得可以寫得更好），再加上「要補」的部分。',
      '- 輸出會用 text 整筆取代舊的，所以不能只寫新增的欄位。',
      ...(its.some(o => o.fill && o.fill.includes('nwnote')) ? ['- 例外：「要補」寫著「依新單字備註補充」的項目，可以依備註在相關欄位新增或微調內容（含新增 usages），但只動備註需要的地方、仍要符合程度規則；其他欄位一律原樣抄回；nw_done 既有的保留，再加上這次的。'] : []),
      '- 「要補」沒有列出的欄位（zh、ipa、pos、en、note、forms、collocations、examples、confusable、family、derived、pos_uses、senses、grammar_note、confusable 的 usage 與 kind、chunks、structure、grammar、pattern、paraphrase、key_words、usages 等），必須逐字原樣抄回，不可改寫、刪減、重新排序或「順便優化」；只有「要補」列出的欄位可以新增或補齊。',
      ''
    ] : []),
    ...(hasAdd ? addRules.concat(['- 下面「各 type 的欄位」的範例是給其他項目用的，【只追加】的項目不要照它寫。', '']) : []),
    '【輸出格式】',
    `請直接產生一個「可下載的 JSON 檔案」，檔名 w${x.week}d${x.day}_extra.json（UTF-8、純 JSON，不要包 markdown 程式碼框）。聊天裡只需一句話說明檔案已產生，不要貼出全文。若你無法產生檔案，才改成只輸出一個 json 程式碼區塊（${FENCE}json … ${FENCE}），區塊外不加任何文字。內容是單一物件，extra_vocab 依上面項目順序、每項一筆；不要輸出文章的其他欄位，不要修改既有資料。檔案內容格式：`,
    FENCE + 'json',
    `{ "week": ${x.week}, "day": ${x.day}, "extra_vocab": [ { …依 type 填欄位… } ] }`,
    FENCE,
    '',
    '各 type 的欄位（範例只示範格式，內容請依實際項目寫）：',
    '▸ word（單字）',
    FENCE + 'json',
    '{ "text": "invoice", "type": "word", "ipa": "/ˈɪnvɔɪs/", "pos": "n.", "zh": "發票、請款單", "en": "a document that lists what was sold and how much to pay", "note": "…在這篇的用法…", "grammar_note": "（選填）容易用錯的文法點", "forms": [ { "w": "invoices", "label": "複數", "pos": "n.", "zh": "發票（複數）", "ipa": "/ˈɪnvɔɪsɪz/", "example": { "en": "…", "zh": "…" } }, { "w": "invoiced", "label": "過去式／過去分詞", "pos": "v.", "zh": "開立發票", "ipa": "/ˈɪnvɔɪst/", "example": { "en": "…", "zh": "…" } } ], "collocations": [ { "phrase": "send an invoice", "zh": "寄發票", "example": { "en": "…", "zh": "…" } }, { "phrase": "pay an invoice", "zh": "付發票款項", "example": { "en": "…", "zh": "…" } } ], "examples": [ { "tag": "情境", "en": "…", "zh": "…" } ], "confusable": [ { "word": "receipt", "ipa": "/rɪˈsiːt/", "diff": "…差異…", "kind": ["spell", "sound"], "usage": "（選填）用法／文法上的差異", "example": { "en": "…", "zh": "…" } } ], "family": [ { "w": "bill", "pos": "n.", "zh": "帳單", "ipa": "/bɪl/", "example": { "en": "…", "zh": "…" } } ], "derived": [ { "w": "invoicing", "pos": "n.", "zh": "開立發票作業", "ipa": "/ˈɪnvɔɪsɪŋ/", "link": "invoice + -ing，把「開發票」這件事變成名詞", "example": { "en": "…", "zh": "…" } } ], "pos_uses": [ { "pos": "n.", "ipa": "/ˈɪnvɔɪs/", "zh": "發票", "in_passage": true, "example": { "en": "…", "zh": "…" } }, { "pos": "v.", "ipa": "/ˈɪnvɔɪs/", "zh": "開發票給（某人）", "example": { "en": "…", "zh": "…" } } ], "senses": [ { "pos": "n.", "ipa": "/ˈɪnvɔɪs/", "zh": "發票", "en": "…", "in_passage": true, "example": { "en": "…", "zh": "…" } }, { "pos": "n.", "ipa": "/ˈɪnvɔɪs/", "zh": "（一筆）請款", "en": "…", "distinguish": "…", "example": { "en": "…", "zh": "…" } } ] }',
    FENCE,
    '▸ phrase（片語／搭配）',
    FENCE + 'json',
    '{ "text": "no later than", "type": "phrase", "zh": "最遲在…之前", "en": "not after a certain time", "note": "…", "pattern": "no later than + 時間", "grammar_note": "（選填）容易用錯的文法點", "examples": [ { "tag": "情境", "en": "…", "zh": "…" } ], "similar": [ { "phrase": "by", "ipa": "/baɪ/", "diff": "…", "example": { "en": "…", "zh": "…" } } ], "confusable": [ { "word": "…", "ipa": "/…/", "diff": "…", "kind": ["meaning"], "example": { "en": "…", "zh": "…" } } ] }',
    FENCE,
    '▸ sentence（句子：重點在文法與句型）',
    FENCE + 'json',
    '{ "text": "（整句照抄）", "type": "sentence", "zh": "整句中文翻譯", "note": "（選填）這句在文章裡的語氣與用途", "chunks": [ { "en": "Please submit your report", "zh": "請提交你的報告" }, { "en": "by Friday", "zh": "在星期五之前" } ], "structure": "句型結構拆解，例如：Please + V（祈使）＋ by + 時間", "grammar": [ { "point": "by + 時間", "explain": "…" } ], "pattern": "Please + V + by + 時間", "paraphrase": [ { "en": "同義改寫（意思相同、換說法）", "zh": "…" } ], "examples": [ { "en": "同句型、換內容的例句", "zh": "…" } ], "key_words": [ { "w": "submit", "ipa": "/səbˈmɪt/", "pos": "v.", "zh": "提交" }, { "w": "no later than", "zh": "最遲在…之前" } ] }',
    FENCE,
    '單字／片語的例句數量依情境自行判斷（見「內容規則」）；句子的欄位與數量見「內容規則（句子）」。',
    ...(hasNw ? ['含「新單字備註」的項目，每一筆都要多加 "nw_done" 陣列（見「新單字備註」規則），格式例："nw_done": [ { "id": "n1abc", "result": "added" } ]。'] : [])
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
function dnTempPrompt(qid, vocabs, fillAll) { // 核心單字：不入庫，直接產生提示詞（暫時掛上去、產生完就移除、不存檔）
  const x = dnArt(qid); if (!x) return '';
  const added = [], only = new Set();
  vocabs.forEach(v => { const had = dnMarks().some(m => m.qid === qid && dnKey(m.text) === dnKey(v.word)), m = dnMarkVocab(x, v); if (!had) added.push(m); only.add(dnKey(v.word)); });
  try { return dnPrompt(qid, only, fillAll); } finally { S.marks = dnMarks().filter(m => !added.includes(m)); }
}
function dnCoreCopy(qid, kind) { // 這篇的核心單字缺口：不用入庫，直接複製 AI 提示詞
  const o = dnCoreGaps(kind).find(q => q.id === qid); if (!o) return;
  const vs = o.list.map(it => it.v), b = dnBatchPick('core:' + kind + qid, vs.map(v => v.word).join(','), vs.length), part = b.nb > 1 ? vs.slice(b.lo, b.hi) : vs;
  auCopy(dnTempPrompt(qid, part, kind === 'gap')); dnToast(b.nb > 1 ? dnBatchMsg(b, part.length) : `已複製 ${part.length} 個字的提示詞，貼給 AI`);
}
/* 核心單字缺口：跨文章勾選 → 一次（依每批上限分批）複製 */
DN.coreChk = DN.coreChk || {};
const dnCoreOn = (kind, id) => DN.coreChk[kind + ':' + id] !== false;
function dnCoreChk(kind, id, v) { DN.coreChk[kind + ':' + id] = !!v; render(); }
function dnCoreChkAll(kind, v) { dnCoreGaps(kind).forEach(o => { DN.coreChk[kind + ':' + o.id] = !!v; }); render(); }
function dnCoreCopyMulti(kind) {
  const g = dnCoreGaps(kind).filter(o => dnCoreOn(kind, o.id)), flat = [];
  g.forEach(o => o.list.forEach(it => flat.push({ id: o.id, v: it.v })));
  if (!flat.length) { dnToast('沒有勾選的字'); return; }
  const b = dnBatchPick('coremulti:' + kind, flat.map(f => f.id + ':' + f.v.word).join(','), flat.length), pick = b.nb > 1 ? flat.slice(b.lo, b.hi) : flat, parts = [];
  pick.forEach(f => { const last = parts[parts.length - 1]; if (last && last.id === f.id) last.vs.push(f.v); else parts.push({ id: f.id, vs: [f.v] }); });
  const ps = parts.map(p => dnTempPrompt(p.id, p.vs, kind === 'gap'));
  auCopy(ps.length === 1 ? ps[0] : `以下共 ${ps.length} 份獨立的任務（各對應一篇文章）。請依序處理，每一份各自產生一個獨立的 JSON 檔案，檔名以各份「輸出格式」所寫為準，不要合併成同一個檔案。\n\n` + ps.map((t, i) => `==================== 第 ${i + 1}／${ps.length} 份 ====================\n` + t).join('\n\n'));
  dnToast(b.nb > 1 ? dnBatchMsg(b, pick.length) : `已複製 ${pick.length} 個字的提示詞（${ps.length} 篇），貼給 AI`);
}
function dnCoreAdd(qid, kind) { // 想收進入庫清單時才用
  const o = dnCoreGaps(kind).find(q => q.id === qid); if (!o) return;
  o.list.forEach(it => dnMarkVocab(o.x, it.v)); save(); dnToast(`已加入入庫 ${o.list.length} 個字`); render();
}
function dnCoreSec(kind) {
  const g = dnCoreGaps(kind); if (!g.length) return '';
  const none = kind === 'none', bs = `${btn} ${dnLine} !py-1 !px-2.5 text-xs`, nSel = dnCoreN(g.filter(o => dnCoreOn(kind, o.id)));
  return `<section class="${card} p-4 mb-4"><h3 class="font-bold text-sm">${none ? '核心多益單字：還沒有詳解' : '核心多益單字：詳解不完整'} <span class="text-xs font-normal text-slate-400">${dnCoreN(g)}</span></h3>
    <p class="text-xs text-slate-500 mt-1 leading-relaxed">${none ? '這些字在文章的核心單字裡，但還沒有詳解、也還沒入庫。不用入庫，直接按「複製 AI 提示詞」就會產生只含這些字的提示詞。' : '這些字有詳解但缺內容（括號是缺的項目）。按「複製 AI 提示詞」會連同現有詳解，只補缺的項目。'}</p>`
    + `<div class="flex flex-wrap items-center gap-1.5 mt-3"><button onclick="dnCoreCopyMulti('${kind}')" ${nSel ? '' : 'disabled'} class="${btn} ${dnPri} !py-1 !px-2.5 text-xs disabled:opacity-40">複製所選 AI 提示詞（${nSel} 個字${dnCapTag(nSel)}）</button><button onclick="dnCoreChkAll('${kind}',true)" class="${bs}">全選</button><button onclick="dnCoreChkAll('${kind}',false)" class="${bs}">全不選</button></div><div class="mt-2">${dnCapCtl()}</div>`
    + g.map(o => `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><div class="flex flex-wrap items-center justify-between gap-2"><div class="flex items-center gap-2 min-w-0"><input type="checkbox" ${dnCoreOn(kind, o.id) ? 'checked' : ''} onchange="dnCoreChk('${kind}','${o.id}',this.checked)" class="h-4 w-4 shrink-0 cursor-pointer" aria-label="選取這篇"><button onclick="dnGoArt('${o.id}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(o.id))}</button></div>
      <div class="flex flex-wrap gap-1.5"><button onclick="dnCoreCopy('${o.id}','${kind}')" class="${btn} ${dnPri} !py-1 !px-2.5 text-xs">複製 AI 提示詞（${o.list.length}${dnCapTag(o.list.length)}）</button><button onclick="dnCoreAdd('${o.id}','${kind}')" class="${bs}">加入入庫</button></div></div>
      <div class="flex flex-wrap gap-1.5 mt-2">${o.list.map(it => `<button onclick="tslOpen(${o.x.week},${o.x.day},${it.i})" class="text-xs rounded-full px-2.5 py-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 cursor-pointer">${esc(it.t)}${it.gaps.length ? `（${it.gaps.map(k => dnFillKeys[k] || k).join('、')}）` : ''}</button>`).join('')}</div></div>`).join('')
    + `</section>`;
}

/* TSL 字庫：全部沒有詳解的 TSL 單字，依字母挑選後複製通用詳解提示詞 */
DN.tslLet = DN.tslLet || {}; DN.tslOpenLet = DN.tslOpenLet || '';
function dnTslNoDetail() {
  if (typeof TSL_WORDS === 'undefined' || typeof LIB === 'undefined' || !LIB) return [];
  const cov = new Set();
  dnArts().forEach(x => dnExtraOf(x).forEach(e => { cov.add(dnKey(e.text || e.word)); dnArr(e.forms).concat(dnArr(e.derived)).forEach(f => { if (f && f.w) cov.add(dnKey(f.w)); }); }));
  const seen = new Set(), out = [];
  TSL_WORDS.forEach((w, i) => { const k = dnKey(w); if (seen.has(k) || cov.has(k)) return; seen.add(k); out.push({ w, r: i + 1, k, L: (k.replace(/[^a-z]/g, '')[0] || '#').toUpperCase() }); });
  return out;
}
function dnTslLetOpen(L) { DN.tslOpenLet = DN.tslOpenLet === L ? '' : L; render(); }
function dnTslLetAll(L, on) { dnTslNoDetail().filter(o => o.L === L).forEach(o => { if (on) DN.tslLet[o.k] = 1; else delete DN.tslLet[o.k]; }); render(); }
function dnTslTog(k) { if (DN.tslLet[k]) delete DN.tslLet[k]; else DN.tslLet[k] = 1; render(); }
function dnTslClear() { DN.tslLet = {}; render(); }
function dnTslCopy() {
  if (typeof nwLibOn === 'function' && !nwLibOn()) { dnToast('daily.json 裡沒有「TSL 字庫」項目（library:true）'); return; }
  const pick = dnTslNoDetail().filter(o => DN.tslLet[o.k]); if (!pick.length) { dnToast('先勾選要補詳解的字'); return; }
  const b = dnBatchPick('tsl', pick.map(o => o.k).join(','), pick.length), cur = pick.slice(b.lo, b.hi), keys = new Set();
  cur.forEach(o => { const m = dnLibMark(LIB, o.w); keys.add(dnKey(m.text)); });
  save(); auCopy(dnPrompt(idOf(LIB), keys));
  dnToast(b.nb > 1 ? dnBatchMsg(b, cur.length) : `已複製通用詳解提示詞（${cur.length} 個），貼給 AI`);
  render();
}
function dnTslSec() {
  const all = dnTslNoDetail(); if (!all.length) return '';
  const g = {}; all.forEach(o => (g[o.L] = g[o.L] || []).push(o));
  const Ls = Object.keys(g).sort(), nSel = all.filter(o => DN.tslLet[o.k]).length, op = DN.tslOpenLet, bs = `${btn} ${dnLine} !py-1 !px-3 text-xs`;
  const chips = Ls.map(L => { const n = g[L].filter(o => DN.tslLet[o.k]).length; return `<button onclick="dnTslLetOpen('${L}')" class="${btn} !py-1 !px-2.5 text-xs ${op === L ? 'bg-indigo-600 text-white' : n ? 'bg-indigo-100 dark:bg-indigo-900/40' : 'bg-slate-100 dark:bg-slate-800'}">${L} <span class="opacity-70">${n ? n + '/' : ''}${g[L].length}</span></button>`; }).join('');
  let h = `<section class="${card} p-4 mb-4"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><div><b class="text-sm">TSL 字庫・尚無詳解</b> <span class="text-xs text-slate-400 ml-1">${all.length} 個，依字母挑</span></div><div class="flex flex-wrap gap-1.5"><button onclick="dnTslCopy()" ${nSel ? '' : 'disabled'} class="${btn} ${dnPri} !py-1.5 text-xs disabled:opacity-40">複製 AI 提示詞（${nSel}${dnCapTag(nSel)}）</button>${nSel ? `<button onclick="dnTslClear()" class="${bs}">清除選取</button>` : ''}</div></div><div class="flex flex-wrap gap-1.5">${chips}</div>`;
  if (op && g[op]) h += `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><div class="flex gap-2 mb-2"><button onclick="dnTslLetAll('${op}',true)" class="${bs}">全選 ${op}</button><button onclick="dnTslLetAll('${op}',false)" class="${bs}">全不選</button></div><div class="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">${g[op].map(o => `<label class="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" ${DN.tslLet[o.k] ? 'checked' : ''} onchange="dnTslTog('${o.k.replace(/'/g, "\\'")}')" class="h-4 w-4"><span class="break-words">${esc(o.w)}</span><span class="text-xs text-slate-400">#${o.r}</span></label>`).join('')}</div></div>`;
  return h + '</section>';
}
function dnRenderMarks() {
  if (typeof nwAutoMark === 'function') nwAutoMark(); // 非核心的新單字被文章採用 → 自動入庫
  const all = dnMarks(), pri = all.filter(dnIsPrimary), done = pri.filter(dnMerged).length, todo = pri.length - done; // 同一個字只算一次
  const cNone = dnCoreN(dnCoreGaps('none')), cGap = dnCoreN(dnCoreGaps('gap')), f = DN.mf, vis = m => f === 'all' || (f === 'gap' ? dnMerged(m) && dnGapsOf(m).length > 0 : f === 'done' ? dnMerged(m) : !dnMerged(m));
  const ids = Array.from(new Set(all.filter(vis).map(m => m.qid))).sort((a, b) => { const A = dnArt(a), B = dnArt(b); return A && B ? (A.week - B.week) || (A.day - B.day) : a < b ? -1 : 1; });
  DN.artIds = ids;
  const fb = (v, label, n) => `<button onclick="dnSetMf('${v}')" class="${btn} !py-1.5 !px-3 text-xs ${f === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${label} <span class="opacity-70">${n}</span></button>`;
  let h = `<header class="mb-4 flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">📌 入庫彙整</h2>${dnBackBtn()}</header>
    <div class="${card} p-4 mb-4"><div class="flex flex-wrap gap-2">${fb('todo', '待補詳解', todo + cNone)}${fb('done', '詳解已寫回', done)}${fb('gap', '未完整詳解', all.filter(m => dnMerged(m) && dnGapsOf(m).length).length + cGap)}${fb('all', '全部', pri.length)}</div><label class="flex items-center gap-2 text-xs mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 cursor-pointer"><input type="checkbox" ${DN.fill.ckind ? 'checked' : ''} onchange="dnToggleCkind()" class="h-4 w-4"><span>補易混淆分類（kind）：把「易混淆還沒有分類」的字也列進「未完整詳解」<b class="text-amber-700 dark:text-amber-300">（${all.filter(m => dnMerged(m) && dnCkindOfMark(m)).length} 個字）</b></span></label>
    <div class="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><span class="text-xs text-slate-500">排列</span><button onclick="dnSetMg('art')" class="${btn} !py-1.5 !px-3 text-xs ${DN.mg !== 'abc' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">依文章</button><button onclick="dnSetMg('abc')" class="${btn} !py-1.5 !px-3 text-xs ${DN.mg === 'abc' ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">A–Z（全域）</button></div>
    <div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">${dnCapCtl()}</div>
    <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><button onclick="dnExportMarks()" class="${btn} ${dnLine} !py-1.5 text-xs">匯出入庫 JSON</button>
    <label class="${btn} ${dnLine} !py-1.5 text-xs cursor-pointer">匯入合併 JSON<input type="file" accept=".json,application/json" class="hidden" onchange="dnImportMarks(this)"></label></div>
    <p class="text-xs text-slate-500 mt-3 leading-relaxed"><b>流程：</b>① 在文稿選字入庫 → ② 這裡按「複製 AI 提示詞」貼給 AI → ③ AI 回傳的 JSON 存成 <code>w{週}d{天}_extra.json</code>，放在 daily.json 同資料夾 → ④ 執行 json_merge.py（選「每日文章」）合併 → ⑤ 重新整理網頁，該項目就會顯示「詳解已寫回」，點進去看詳解。<br><b>未完整詳解：</b>已寫回、但缺英文解說／搭配例句／詞性變化發音／相關字音標例句／衍生字／易混淆例句的項目。勾選後，在該區「補齊內容」選擇要補哪些，提示詞會連同現有詳解交給 AI，合併時會整筆取代舊的。<br>入庫只存在這個瀏覽器；在手機入庫、電腦合併時，用上面的「匯出／匯入」搬過去。</p></div>`;
  const coreSec = f === 'todo' ? dnCoreSec('none') : f === 'gap' ? dnCoreSec('gap') : ''; h += coreSec;
  if (f !== 'done' && typeof nwSupSec === 'function') h += nwSupSec(); // 🆕 新單字補充區
  if (f !== 'done' && typeof exSec === 'function') h += exSec(); // ➕ 例句追加待辦（exadd.js）
  const tslSec = f === 'todo' ? dnTslSec() : ''; h += tslSec;
  if (!ids.length && !coreSec && !tslSec) h += `<p class="text-sm text-slate-400 text-center py-10">${all.length ? '這個分類沒有項目。' : '還沒有入庫。到文章頁選取不懂的字、片語或句子，按「＋ 入庫」。'}</p>`;
  if (DN.mg === 'abc') { // 全域 A–Z：不分週次，來源只用小字標示
    const list = all.filter(vis).filter(dnIsPrimary).slice().sort((a, b) => dnKey(a.text).localeCompare(dnKey(b.text))), g = {};
    list.forEach(m => { const c = (dnKey(m.text).replace(/[^a-z]/g, '')[0] || '#').toUpperCase(); (g[c] = g[c] || []).push(m); });
    DN.mgKeys = Object.keys(g).sort(); DN.mgIds = {}; DN.mgKeys.forEach(c => { DN.mgIds[c] = g[c].map(m => m.id); });
    if (DN.mgKeys.length) {
      const sel = f === 'done' ? null : dnMgSel(), bs = `${btn} ${dnLine} !py-1 !px-3 text-xs`;
      h += `<div class="${card} p-3 mb-3">${sel ? `<div class="flex flex-wrap items-center gap-2"><button onclick="dnMgCopy()" ${sel.nItems ? '' : 'disabled'} class="${btn} ${dnPri} !py-1.5 text-xs disabled:opacity-40">複製 AI 提示詞（${sel.nItems} 項${sel.nArt > 1 ? `・${sel.nArt} 篇` : ''}${dnCapTag(sel.nItems)}）</button><button onclick="dnChkAllVis(true)" class="${bs}">全選</button><button onclick="dnChkAllVis(false)" class="${bs}">全不選</button></div>${dnFillRow(list)}` : ''}<div class="flex justify-end gap-2 ${sel ? 'mt-2' : ''}"><button onclick="dnMgAll(true)" class="${bs}">全部展開</button><button onclick="dnMgAll(false)" class="${bs}">全部收合</button></div></div>`;
    }
    h += DN.mgKeys.map(c => `<details class="${card} p-3 mb-3 group" ${DN.mgOpen[c] ? 'open' : ''} ontoggle="DN.mgOpen['${c}']=this.open"><summary class="flex items-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"><span class="text-xs text-slate-400 w-3 transition-transform group-open:rotate-90">▶</span><span class="text-lg font-bold w-6">${c}</span><span class="text-xs text-slate-400">${g[c].length}</span>${f === 'done' ? '' : `<input type="checkbox" ${g[c].every(dnChecked) ? 'checked' : ''} onchange="dnChkLetter('${c}', this.checked)" onclick="event.stopPropagation()" class="ml-auto mr-1 h-4 w-4 cursor-pointer" aria-label="選取這個字母全部">`}</summary><div class="divide-y divide-slate-100 dark:divide-slate-800 mt-1">${g[c].map(m => {
      const mg = dnMerged(m), a = dnArt(m.qid);
      return `<div class="py-2 flex items-start gap-2">${f === 'done' ? '' : `<input type="checkbox" ${dnChecked(m) ? 'checked' : ''} onchange="dnToggleChk('${m.id}')" class="mt-1.5 h-4 w-4 shrink-0 cursor-pointer" aria-label="選取">`}<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><span class="${dnChip} ${DNTC[m.type]}">${DNT[m.type]}</span><b class="text-sm break-words">${esc(m.text)}</b>${mg ? '<span class="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 font-semibold">✔ 已寫回</span>' : ''}${a ? `<span class="text-[0.6875rem] text-slate-400">${dnLabel(a)}</span>` : ''}${mg && dnGapsOf(m).length ? `<span class="text-[0.6875rem] text-amber-600 dark:text-amber-400">缺：${dnGapsOf(m).map(k => dnFillKeys[k]).join('、')}</span>` : ''}</div>${m.type !== 'sentence' && m.ctx ? `<p class="text-xs text-slate-500 mt-0.5 break-words">${esc(m.ctx)}</p>` : ''}${m.note ? `<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5 break-words">備註：${esc(m.note)}</p>` : ''}</div>
        <div class="flex flex-col gap-1 shrink-0"><button onclick="dnOpenExtra('${m.qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${dnSm}">詳解</button>${mg ? '' : `<button onclick="dnMarkMenu('${m.id}')" class="${dnSm}">✎</button><button onclick="dnDelMark2('${m.id}')" class="text-xs text-rose-500 hover:underline cursor-pointer">刪除</button>`}</div></div>`;
    }).join('')}</div></details>`).join('');
    if (list.length) h += `<p class="text-xs text-slate-400 mb-4">勾選的字若來自多篇文章，會依文章分成多份提示詞（每篇各產生一個 w?d?_extra.json），請依序貼給 AI。</p>`;
    main.innerHTML = h; return;
  }
  if (ids.length > 1) { // 跨文章工具列：展開／收合全部；非「詳解已寫回」另有多選複製
    const si = f !== 'done' ? dnArtSelInfo() : null, bs2 = `${btn} ${dnLine} !py-1 !px-3 text-xs`;
    h += `<div class="${card} p-3 mb-3"><div class="flex flex-wrap items-center gap-2">${si ? `<button onclick="dnMgCopy(true)" ${si.nArt ? '' : 'disabled'} class="${btn} ${dnPri} !py-1.5 text-xs disabled:opacity-40">複製所選文章的 AI 提示詞（${si.nArt} 篇・${si.nItems} 項${dnCapTag(si.nItems)}）</button><button onclick="dnArtSelAll(true)" class="${bs2}">全選文章</button><button onclick="dnArtSelAll(false)" class="${bs2}">全不選</button>` : ''}<span class="${si ? 'ml-auto ' : ''}flex gap-2"><button onclick="dnArtOpenAll(true)" class="${bs2}">全部展開</button><button onclick="dnArtOpenAll(false)" class="${bs2}">全部收合</button></span></div>${si ? `<p class="text-xs text-slate-500 mt-2 leading-relaxed">勾選各篇標題左邊的方框，就能一次複製多篇；每篇各產生一份獨立的提示詞（各自輸出一個 w?d?_extra.json），貼給 AI 即可。文章預設收合，點標題左邊的 ▶ 展開。</p>` : ''}</div>`;
  }
  ids.forEach(qid => {
    const x = dnArt(qid), ms = dnMarksOf(qid).filter(vis), nSel = dnPromptItems(qid).length, open = !!DN.artOpen[qid];
    if (f === 'done') { // 「詳解已寫回」：只單純列出單字，不提供勾選／提示詞／補齊／編輯
      h += `<section class="${card} p-4 mb-4"><div class="${open ? 'mb-2' : ''}">${dnOpenBtn(qid, open)}<button onclick="dnGoArt('${qid}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(qid))}</button>${x && x.level ? ` ${lvBadge(x)}` : ''} <span class="text-xs text-slate-400 ml-1">${ms.length} 個</span></div>
        ${open ? `<div class="divide-y divide-slate-100 dark:divide-slate-800">${ms.map(m => `<div class="py-2 flex items-center gap-2"><span class="${dnChip} ${DNTC[m.type]}">${DNT[m.type]}</span><button onclick="vplay('${qid}', this.dataset.t, '', this.dataset.t)" data-t="${esc(m.text)}" class="min-w-0 flex-1 text-left text-sm font-bold break-words cursor-pointer hover:text-indigo-600" aria-label="發音">${esc(m.text)} <span class="text-slate-400 font-normal">🔊</span></button><button onclick="dnOpenExtra('${qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${dnSm} shrink-0">詳解 ›</button></div>`).join('')}</div>` : ''}</section>`;
      return;
    }
    h += `<section class="${card} p-4 mb-4"><div class="flex flex-wrap items-center justify-between gap-2 ${open ? 'mb-2' : ''}"><div class="min-w-0">${dnOpenBtn(qid, open)}<input type="checkbox" ${DN.artSel[qid] && nSel ? 'checked' : ''} ${nSel ? '' : 'disabled'} onchange="dnToggleArt('${qid}',this.checked)" class="h-4 w-4 mr-2 align-middle cursor-pointer disabled:opacity-30" aria-label="選取這篇文章，一次複製多篇"><button onclick="dnGoArt('${qid}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(qid))}</button>${x && x.level ? ` ${lvBadge(x)}` : ''} <span class="text-xs text-slate-400 ml-1">${ms.length} 個</span></div>
      <div class="flex flex-wrap gap-1.5"><button onclick="dnCopyArt('${qid}')" ${nSel ? '' : 'disabled'} class="${btn} ${dnPri} !py-1.5 text-xs disabled:opacity-40">複製 AI 提示詞（${nSel}${dnCapTag(nSel)}）</button><button onclick="auCopy(dnListText('${qid}'))" ${nSel ? '' : 'disabled'} class="${btn} ${dnLine} !py-1.5 text-xs disabled:opacity-40">複製清單</button></div></div>
      ${open ? `${dnFillRow(ms)}<div class="divide-y divide-slate-100 dark:divide-slate-800">${ms.map(m => {
        const mg = dnMerged(m);
        return `<div class="py-2 flex items-start gap-2"><input type="checkbox" ${dnIsPrimary(m) && dnChecked(m) ? 'checked' : ''} ${dnIsPrimary(m) ? '' : 'disabled'} onchange="dnToggleChk('${m.id}')" class="mt-1.5 h-4 w-4 shrink-0 ${dnIsPrimary(m) ? 'cursor-pointer' : 'opacity-30'}" aria-label="選取">
          <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><span class="${dnChip} ${DNTC[m.type]}">${DNT[m.type]}</span><b class="text-sm break-words">${esc(m.text)}</b>${mg ? '<span class="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 font-semibold">✔ 已寫回</span>' : ''}${m.own ? '<span class="text-[0.6875rem] text-sky-600 dark:text-sky-400">🔁 本篇複習用（不補詳解）</span>' : dnIsPrimary(m) ? '' : `<span class="text-[0.6875rem] text-sky-600 dark:text-sky-400">↔ 與 ${dnLabel(dnArt(dnPrimaryOf(m).qid))} 共用同一份</span>`}${mg && dnGapsOf(m).length ? `<span class="text-[0.6875rem] text-amber-600 dark:text-amber-400">缺：${dnGapsOf(m).map(k => dnFillKeys[k]).join('、')}</span>` : ''}</div>
          ${m.type !== 'sentence' ? `<p class="text-xs text-slate-500 mt-0.5 break-words">${esc(m.ctx)}</p>` : ''}${m.note ? `<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5 break-words">備註：${esc(m.note)}</p>` : ''}</div>
          <div class="flex flex-col gap-1 shrink-0">${mg ? `<button onclick="dnOpenExtra('${m.qid}',this.dataset.t)" data-t="${esc(m.text)}" class="${dnSm}">詳解</button>` : ''}${mg ? '' : `<button onclick="dnMarkMenu('${m.id}')" class="${dnSm}">✎</button>`}${mg && !m.own ? '' : `<button onclick="dnDelMark2('${m.id}')" class="text-xs text-rose-500 hover:underline cursor-pointer">刪除</button>`}</div></div>`;
      }).join('')}</div>
      <details class="mt-2"><summary class="text-xs text-slate-500 cursor-pointer">預覽提示詞</summary><textarea readonly rows="10" class="${dnInp} mt-2 font-mono text-xs">${esc(dnPrompt(qid))}</textarea></details>` : ''}</section>`;
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
        const n = { id: r.id, qid: r.qid, text: String(r.text), type: DNT[r.type] ? r.type : 'word', ctx: String(r.ctx || r.text), from: +r.from || 0, to: +r.to || 0, note: String(r.note || ''), ...(r.nw ? { nw: String(r.nw) } : {}), ...(r.own ? { own: true } : {}), created: +r.created || Date.now(), updated: +r.updated || +r.created || Date.now() };
        const o = dnMarks().find(q => q.id === n.id) || dnMarks().find(q => q.qid === n.qid && dnKey(q.text) === dnKey(n.text));
        if (!o) { dnMarks().push(n); add++; } else if (n.updated > (o.updated || 0)) { n.id = o.id; Object.assign(o, n); if (!n.own) delete o.own; upd++; }
      });
      save(); dnToast(`匯入完成：新增 ${add}、更新 ${upd}`); render();
    } catch (e) { alert('匯入失敗：' + e.message); }
  };
  fr.readAsText(f, 'utf-8'); input.value = '';
}

/* ======================= 詳解頁 ======================= */
function dnOpenVocab(i) { const x = find(cur.w, cur.d); if (!x || !x.vocab[i]) return; const pd = cur.det; cur.det = { kind: 'vocab', i }; dnNav('detail', pd); }
function dnOpenPP(i) { // 常用句型（presentation_phrases）→ 詳解頁：沒有 extra_vocab 時先顯示句型卡的中文意思與用法
  const x = find(cur.w, cur.d), p = x && x.presentation_phrases && x.presentation_phrases[i]; if (!p) return;
  const pd = cur.det; cur.det = { kind: 'pp', i, text: p.phrase }; dnNav('detail', pd);
}
const dnPPOf = x => (Array.isArray(x && x.presentation_phrases) ? x.presentation_phrases : []).filter(p => p && typeof p.phrase === 'string' && p.phrase.trim());
const dnPPMissing = x => dnPPOf(x).filter(p => !dnFindExtraAny(x, p.phrase)); // 這篇還沒有詳解的句型
function dnPPMark(x, p) { // 句型 → 暫時的入庫項目（type=sentence、整句就是 text）；不存檔
  const now = Date.now();
  return { id: dnId('m'), qid: idOf(x), text: p.phrase, type: 'sentence', ctx: p.phrase, from: 0, to: 0, src: 'detail', head: '', note: '', created: now, updated: now };
}
function dnTempPromptPP(qid, pps) { // 句型：不入庫，直接產生提示詞（暫時掛上去、產生完就移除、不存檔）
  const x = dnArt(qid); if (!x) return '';
  const added = [], only = new Set();
  pps.forEach(p => { const had = dnMarks().some(m => m.qid === qid && dnKey(m.text) === dnKey(p.phrase)); if (!had) { const m = dnPPMark(x, p); dnMarks().push(m); added.push(m); } only.add(dnKey(p.phrase)); });
  try { return dnPrompt(qid, only, false); } finally { S.marks = dnMarks().filter(m => !added.includes(m)); }
}
function dnPPCopy(qid) { // 這篇所有「還沒有詳解」的句型 → 一份 AI 提示詞（超過每批上限會分批，連按換下一批）
  const x = dnArt(qid); if (!x) return;
  const ms = dnPPMissing(x); if (!ms.length) { dnToast('這篇的句型都已經有詳解'); return; }
  const b = dnBatchPick('pp:' + qid, ms.map(p => p.phrase).join('|'), ms.length), part = b.nb > 1 ? ms.slice(b.lo, b.hi) : ms;
  auCopy(dnTempPromptPP(qid, part)); dnToast(b.nb > 1 ? dnBatchMsg(b, part.length) : `已複製 ${part.length} 句句型的提示詞，貼給 AI`);
}
function dnAddFromPP(i) { // 句型沒有詳解時：一鍵入庫（之後到「📌 入庫彙整」產生提示詞）
  const x = find(cur.w, cur.d), p = x && x.presentation_phrases && x.presentation_phrases[i]; if (!p) return;
  if (dnMarks().some(m => m.qid === idOf(x) && dnKey(m.text) === dnKey(p.phrase))) { if (!dnAskStudy(p.phrase)) dnToast('已經入庫了'); return; }
  dnMarks().push(dnPPMark(x, p)); save(); dnToast('已入庫，可到「📌 入庫彙整」產生提示詞'); render();
}
function dnOpenExtra(qid, text) { const x = dnArt(qid); if (!x) return; if (cur.w != x.week || cur.d != x.day) { cur.w = x.week; cur.d = x.day; } const pd = cur.det; cur.det = { kind: 'extra', text }; dnNav('detail', pd); }
function dnAddFromVocab(i) { // 核心單字沒有詳解時：一鍵入庫（之後用提示詞請 AI 補）
  const x = find(cur.w, cur.d), v = x && x.vocab[i]; if (!v) return;
  const id = idOf(x), p = String(x.passage || '');
  if (dnMarks().some(m => m.qid === id && dnKey(m.text) === dnKey(v.word))) { if (!dnAskStudy(v.word)) dnToast('已經入庫了'); return; }
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
  if (d.kind === 'vocab') { base = x.vocab[d.i]; if (!base) return null; text = base.word; }
  else if (d.kind === 'pp') { const p = (x.presentation_phrases || [])[d.i]; if (!p) return null; base = { zh: p.meaning, note: p.usage }; text = p.phrase; } // 句型卡：meaning／usage 當作還沒有詳解時的內容
  else text = d.text;
  const ex = dnFindExtraAny(x, text), src = ex ? dnExtraSrc(x, text) : null, m = dnMarksOf(idOf(x)).find(q => dnKey(q.text) === dnKey(text));
  const e = Object.assign({}, base || {}, ex || {}); e.text = text; e.at = (ex && (ex.text || ex.word)) || text; e.type = (ex && ex.type) || (d.kind === 'pp' ? 'sentence' : base ? (/\s/.test(text) ? 'phrase' : 'word') : (m && m.type) || 'word');
  return { x, e, base, ex, m, src, i: d.i, kind: d.kind };
}
function dnHiCtx(ctx, text, x) { // 詳解頁「在文章裡」：本字黃底；傳入 x（所在文章）時，同一句裡本篇已入庫的片語另外畫紫色底線，點一下開該片語詳解
  const c = String(ctx), lc = c.toLowerCase(), i = lc.indexOf(String(text).toLowerCase());
  const ph = x ? dnCtxPhrases(c, text, x) : [];
  const main = i < 0 ? null : { a: i, b: i + String(text).length };
  if (!ph.length) return main ? esc(c.slice(0, main.a)) + `<b class="bg-amber-100 dark:bg-amber-400/20 rounded">${esc(c.slice(main.a, main.b))}</b>` + esc(c.slice(main.b)) : esc(c);
  const cuts = new Set([0, c.length]); ph.forEach(p => { cuts.add(p.a); cuts.add(p.b); }); if (main) { cuts.add(main.a); cuts.add(main.b); }
  const pts = [...cuts].sort((a, b) => a - b); let out = '';
  for (let k = 0; k + 1 < pts.length; k++) {
    const s0 = pts[k], e0 = pts[k + 1]; if (s0 >= e0) continue;
    let h = esc(c.slice(s0, e0));
    if (main && main.a <= s0 && e0 <= main.b) h = `<b class="bg-amber-100 dark:bg-amber-400/20 rounded">${h}</b>`;
    const p = ph.find(q => q.a <= s0 && e0 <= q.b);
    if (p) h = `<span class="cursor-pointer rounded" style="border-bottom:2px solid #8b5cf6;background:rgba(167,139,250,.18)" title="片語已入庫：點一下看詳解" data-mid="${esc(p.id)}" data-qid="${esc(p.qid)}" data-pt="${esc(p.t)}" onclick="dnOpenPhraseEl(this)">${h}</span>`;
    out += h;
  }
  return out;
}
function dnCtxPhrases(ctx, text, x) { // 這句裡面、本篇已入庫的片語（入庫標註 type=phrase，或本篇詳解 extra_vocab 的片語）；不含本字自己；長的優先
  const lc = String(ctx).toLowerCase(), self = dnKey(text), seen = new Set(), out = [], qid = idOf(x);
  const add = (t, id) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (!t || !/\s/.test(t) || dnWordN(t) > 6) return; const k = dnKey(t); if (k === self || seen.has(k)) return; const i = lc.indexOf(t.toLowerCase()); if (i < 0) return; seen.add(k); out.push({ a: i, b: i + t.length, t, id: id || '', qid }); };
  dnMarksOf(qid).forEach(m => { if (m.type === 'phrase') add(m.text, m.id); });
  dnExtraOf(x).forEach(e => { if (e.type !== 'sentence' && e.type !== 'word') add(e.text || e.word, ''); });
  return out.sort((p, q) => (q.b - q.a) - (p.b - p.a));
}
function dnOpenPhraseEl(el) { const sel = window.getSelection(); if (sel && !sel.isCollapsed) return; if (el.dataset.mid) dnOpenMark(el.dataset.mid); else dnOpenExtra(el.dataset.qid, el.dataset.pt); }
const dnSpk = (x, e, suf, w, zh) => `<button onclick="vplay('${idOf(x)}', this.dataset.t, '${suf}', this.dataset.w)" data-t="${esc(e.at || e.text)}" data-w="${esc(w)}"${zh ? ` data-zh="${esc(zh)}"` : ''} class="text-slate-400 hover:text-indigo-600 shrink-0" aria-label="發音">🔊</button>`;
const dnExHtml = o => o && o.en ? `<p>${esc(o.en)}</p>${o.zh ? `<p class="text-xs text-slate-500">${esc(o.zh)}</p>` : ''}` : '';
function dnLibMark(x, text) { // 字庫：沒有文章可以選字，直接用 TSL 單字建一筆入庫（沒有所在句）；已存在就回傳舊的
  const id = idOf(x), old = dnMarks().find(m => m.qid === id && dnKey(m.text) === dnKey(text)); if (old) return old;
  const now = Date.now(), m = { id: dnId('m'), qid: id, text, type: /\s/.test(text) ? 'phrase' : 'word', ctx: '', from: 0, to: 0, note: '', created: now, updated: now };
  dnMarks().push(m); return m;
}
function dnCopyOne() { // 詳解頁：只為這個字複製 AI 提示詞（核心單字會順便入庫，提示詞需要所在句）
  const D = dnDetailData(); if (!D) return;
  const fresh = !D.m && !D.base && isLib(D.x); if (fresh) D.m = dnLibMark(D.x, D.e.text); // 字庫的字：按下就順便入庫
  if (D.m) { save(); auCopy(dnPrompt(idOf(D.x), new Set([dnKey(D.m.text)]))); }
  else if (D.kind === 'pp') auCopy(dnTempPromptPP(idOf(D.x), [(D.x.presentation_phrases || [])[D.i]]));
  else if (D.base) auCopy(dnTempPrompt(idOf(D.x), [D.base], false));
  else return;
  dnToast('已複製這個字的提示詞，貼給 AI');
  if (fresh) render();
}
/* 易混淆區最前面放「本字」：用詳解已有的例句（examples 第一句，沒有就用搭配的例句），播放沿用既有 mp3（_e1／_c1），不用另外錄；方便和下面的易混淆字一起比較 */
function dnCfSelfRow(xs, e, ex2, cols) {
  const own = e.at || e.text, i1 = ex2.findIndex(o => o && o.en), i2 = cols.findIndex(c => c && c.example && c.example.en);
  const pick = i1 >= 0 ? { o: ex2[i1], suf: '_e' + (i1 + 1) } : i2 >= 0 ? { o: cols[i2].example, suf: '_c' + (i2 + 1) } : null;
  return `<li class="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1.5"><div class="flex items-start gap-2">${dnSpk(xs, e, '', own)}<div><b>${esc(own)}</b> <span class="${dnChip} !bg-indigo-100 !text-indigo-800 dark:!bg-indigo-900 dark:!text-indigo-200">本字</span> <span class="text-slate-500">${e.ipa ? esc(e.ipa) : ''} ${e.pos ? `<i>${esc(e.pos)}</i>` : ''}</span>${e.zh ? `　${esc(e.zh)}` : ''}</div></div>${pick ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, pick.suf, pick.o.en)}<div><p>${dnHiCtx(pick.o.en, own)}</p>${pick.o.zh ? `<p class="text-xs text-slate-500">${esc(pick.o.zh)}</p>` : ''}</div></div>` : ''}</li>`;
}
function dnCfWrap(row, html) { return html && row ? html.replace('<ul class="space-y-1.5 text-sm">', m => m + row) : html; }
/* ---------- 重整這個字的詳解（詳解頁按「⚑ 回報」→ 視窗裡的「🔧 重整…的詳解」）----------
   ⬇ 下載現有詳解：{ week, day, extra_vocab:[這一筆] }，格式和 AI 回傳的 w?d?_extra.json 完全一樣（week／day＝這個字的詳解目前放在哪一篇）。
   📋 複製重整提示詞：沿用「入庫彙整」那一份提示詞的全部規則，再附上「現有詳解」和你寫的問題；AI 回傳 w?d?_extra.json → json_merge.py 合併，
      同一個 text 會整筆取代舊的（全題庫同一個字只留一筆）。不需要改 json_merge.py。 */
function dnReviseCtx() { // → { s: 詳解所在那一篇, ex: 現有詳解, text, type, ctx }；這個字還沒有詳解 → null
  const D = dnDetailData(); if (!D || !D.ex || !D.src) return null;
  const s0 = D.src, ex = D.ex, text = String(ex.text || ex.word || D.e.text || '').trim(); if (!text) return null;
  const type = ex.type || D.e.type || (/\s/.test(text) ? 'phrase' : 'word');
  let ctx = '';
  if (type !== 'sentence' && !isLib(s0)) { const p = String(s0.passage || ''), i = p.toLowerCase().indexOf(text.toLowerCase()); if (i >= 0) ctx = dnCtxOf(p, i, i + text.length, text); }
  if (!ctx && type !== 'sentence' && D.m && D.m.ctx) ctx = D.m.ctx;
  return { s: s0, ex, text, type, ctx };
}
const dnReviseJson = C => JSON.stringify({ week: C.s.week, day: C.s.day, extra_vocab: [C.ex] }, null, 2);
function dnReviseDl() { // ⬇ 下載現有詳解
  const C = dnReviseCtx(); if (!C) return;
  const slug = C.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'item';
  dnDownload(`w${C.s.week}d${C.s.day}_${slug}_current.json`, dnReviseJson(C), 'application/json');
  dnToast('已下載「' + C.text + '」現有詳解');
}
function dnReviseCopyJson() { const C = dnReviseCtx(); if (!C) return; auCopy(dnReviseJson(C)); dnToast('已複製現有詳解 JSON'); }
function dnRevisePrompt(note) {
  const C = dnReviseCtx(); if (!C) return '';
  const now = Date.now(), m = { id: '~rv', qid: idOf(C.s), text: C.text, type: C.type, ctx: C.ctx, from: 0, to: 0, note: '', created: now, updated: now };
  const base = dnPrompt(idOf(C.s), new Set(), false, [{ m, fill: null }]); if (!base) return '';
  const block = [
    '【重整任務（這個字已經有詳解，但有問題，要重新整理）】',
    '- 上面的規則一律照用；但這次不是從零開始，而是「修正下面的現有詳解」。',
    '- 我發現的問題：' + (String(note || '').trim() || '（沒有特別指出；請依上面所有規則逐欄位檢查，找出錯誤、缺漏、程度不符或與規則不一致的地方並修正）'),
    '- 有問題的地方請修正或重寫；沒有問題的欄位請逐字原樣抄回，不要順便潤飾、改順序或改寫。',
    '- 【順序鎖定（很重要）】音檔是依「陣列的第幾筆」命名的（collocations 的 _c1、_c2…，senses 的 _s1、_s2…，pos_uses、forms、family、derived、confusable、similar、examples 也一樣）。所以現有陣列裡每一筆的「位置」一律不可變動：不可插入、刪除、換位置、合併或拆開；要新增的搭配、意思、用法、例句，一律接在該陣列「最後面」（即使依多益常見度應該排前面也一樣；上面「依常見度排序」的規則在重整時不適用於已有的項目）。只有「那一筆本身有錯」才在原位置修改內容。若必須刪除或改順序才能改對，請不要動，在聊天裡說明原因，讓我自己處理。',
    '- 輸出「完整的一筆」（會用 text 整筆取代舊的，所以不能只寫改過的欄位）；text 必須與現有詳解的 text 完全相同。現有詳解裡的 nw_done 與 usages（別篇的用法，每一筆）一併原樣保留，不可刪除或改寫。',
    '- 聊天裡用 2–5 行說明你改了哪些欄位、為什麼；檔案裡不要放說明文字。',
    '',
    '【現有詳解（JSON）】',
    FENCE + 'json',
    JSON.stringify(C.ex, null, 2),
    FENCE
  ].join('\n');
  return base.replace('【輸出格式】', () => block + '\n\n【輸出格式】');
}
/* ---------- 這個字的其他維護（同一個回報視窗）：補齊缺漏、例句／搭配追加待辦 ---------- */
function dnWordMark(C) { const now = Date.now(); return { id: '~rv', qid: idOf(C.s), text: C.text, type: C.type, ctx: C.ctx, from: 0, to: 0, note: '', created: now, updated: now }; }
function dnWordGaps(C) { // 這個字目前缺哪些內容（連預設不勾選的「同字族例句」「易混淆分類」也算）
  const f = DN.fill, keep = { dex: f.dex, ckind: f.ckind };
  try { f.dex = true; f.ckind = true; return dnGapsOf(dnWordMark(C), true); } finally { f.dex = keep.dex; f.ckind = keep.ckind; }
}
function dnWordGapCopy() {
  const C = dnReviseCtx(); if (!C) return;
  const g = dnWordGaps(C); if (!g.length) { dnToast('這個字沒有缺漏的內容'); return; }
  const t = dnPrompt(idOf(C.s), new Set(), false, [{ m: dnWordMark(C), fill: g }]); if (!t) return;
  auCopy(t); dnToast('已複製補齊提示詞（' + g.length + ' 項），貼給 AI');
}
function dnWordExGroup(C) { // 例句／搭配追加待辦裡，屬於這個字的那一份（沒有 → null）
  const k = dnKey(C.text), g = exGroups().find(q => idOf(q.a) === idOf(C.s) && q.ents.has(k)) || exGroups().find(q => q.ents.has(k));
  return g ? Object.assign({}, g, { ents: new Map([[k, g.ents.get(k)]]) }) : null;
}
function dnWordExCopy() {
  const C = dnReviseCtx(); if (!C) return;
  const g = dnWordExGroup(C); if (!g) { dnToast('這個字沒有例句／搭配追加的待辦'); return; }
  auCopy(exPrompt(g, null)); dnToast('已複製這個字的例句／搭配追加提示詞，貼給 AI');
}
function dnReviseCopy() {
  const t = dnRevisePrompt((document.getElementById('dn-n') || {}).value); if (!t) return; // dn-n＝回報視窗的「描述問題」
  auCopy(t); dnToast('已複製重整提示詞（含現有詳解），貼給 AI');
}
function dnWordMaintRows(C, b) { // ② 補齊缺漏　③ 例句／搭配追加（只複製這個字的）
  const gaps = dnWordGaps(C), g = dnWordExGroup(C), nEx = g ? g.ents.get(dnKey(C.text)).recs.length : 0;
  const row = (t, body) => `<div class="mt-3 pt-3 border-t border-indigo-200 dark:border-indigo-900"><p class="text-xs font-semibold text-slate-600 dark:text-slate-300">${t}</p>${body}</div>`;
  return row('② 補齊缺漏（只補沒有的欄位，其他原樣）', gaps.length
      ? `<p class="mt-1 text-xs text-slate-500 leading-relaxed">缺：${gaps.map(k => esc(dnFillKeys[k] || k)).join('、')}</p><div class="mt-2"><button onclick="dnWordGapCopy()" class="${b} ${dnPri} cursor-pointer">複製補齊提示詞（${gaps.length} 項）</button></div>`
      : `<p class="mt-1 text-xs text-emerald-700 dark:text-emerald-400">✔ 這個字沒有缺漏的內容</p>`)
    + row('③ 例句／搭配追加（詳解頁「＋ 例句」「＋ 搭配」的待辦）', nEx
      ? `<p class="mt-1 text-xs text-slate-500 leading-relaxed">待處理 ${nEx} 筆，提示詞只包含這個字。</p><div class="mt-2"><button onclick="dnWordExCopy()" class="${b} ${dnPri} cursor-pointer">複製追加提示詞（${nEx} 筆）</button></div>`
      : `<p class="mt-1 text-xs text-slate-500 leading-relaxed">目前沒有待辦。在詳解頁各用法後面按「＋ 例句」、常用搭配按「＋ 搭配」加入後，這裡就能複製。</p>`);
}
function dnReviseBox() { // 放在「⚑ 回報問題」視窗裡（從詳解頁按回報、而且這個字已有詳解時才有）；上面「描述問題」的內容會一起寫進提示詞
  const C = dnReviseCtx(); if (!C) return '';
  const b = 'text-xs rounded-lg px-2.5 py-1';
  return `<details open class="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-3 mb-3"><summary class="cursor-pointer select-none text-sm font-semibold text-indigo-700 dark:text-indigo-300">🔧 維護「${esc(C.text)}」的詳解（複製這個字的 AI 提示詞）</summary>
    <p class="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">① 重整（修正錯誤）</p>
    <p class="mt-1 text-xs text-slate-500 leading-relaxed">上面「描述問題」寫的內容會一起放進提示詞；不寫＝請 AI 全面檢查。這個視窗不用關，也可以同時送出回報。</p>
    <div class="flex flex-wrap gap-2 mt-2"><button onclick="dnReviseCopy()" class="${b} ${dnPri} cursor-pointer">複製重整提示詞（含現有詳解）</button><button onclick="dnReviseDl()" class="${dnSm}">⬇ 下載現有詳解 JSON</button><button onclick="dnReviseCopyJson()" class="${dnSm}">複製現有詳解 JSON</button></div>
    <p class="mt-2 text-[0.6875rem] text-slate-400 leading-relaxed">流程：複製提示詞 → 貼給 AI → AI 回傳 w${C.s.week}d${C.s.day}_extra.json → 放進 json_merge.py 所在資料夾合併（同一個字整筆取代舊的）。「下載」是把現在這筆存成同格式的檔案，可當附件給 AI 或備份。</p>
    ${dnWordMaintRows(C, b)}</details>`;
}
/* 詳解頁「在文章裡」要顯示的所在句：入庫時存的 ctx 若沒有、或只是文章裡那一句的片段（例如只存「caught up」），改用文章裡這個字所在的完整一句。
   詳解頁（dnRenderDetail）與語音練習計分（pron.js 的 prDetailKeys）共用這一份，顯示的句子、🔊 的 mp3、評分的項目才會是同一句。 */
function dnFullCtx(x, text, m, T) {
  let ctx = m && m.ctx ? dnCleanUi(m.ctx) : (m && m.ctx);
  if (T !== 'sentence') { // 所在句要是文章裡完整的一句：沒存、或只存了片段（例如只存「caught up」）→ 從文章找出這個字所在的整句，和同一句裡的片語（caught up）顯示同一句；🔊 是依句子內容找 mp3，所以也念同一個檔
    const p = String(x.passage || ''), lp = p.toLowerCase(), lt = String(text).toLowerCase(), i = m && m.to > m.from && lp.slice(m.from, m.to) === lt ? m.from : lp.indexOf(lt);
    if (i >= 0) {
      let full = dnCtxOf(p, i, i + text.length, text);
      if (full.length <= String(text).length) { // 切句函式沒有切到（回傳的只有字本身）→ 自己用標點切出這一句
        const a = Math.max(p.lastIndexOf('.', i - 1), p.lastIndexOf('?', i - 1), p.lastIndexOf('!', i - 1), p.lastIndexOf('\n', i - 1)) + 1, r = /[.!?]+(?=\s|$)|\n/.exec(p.slice(i)), b = r ? i + r.index + (r[0] === '\n' ? 0 : r[0].length) : p.length;
        full = p.slice(a, b).trim() || full;
      }
      if (!ctx || (full.length > String(ctx).length && full.toLowerCase().includes(String(ctx).trim().toLowerCase()))) ctx = full;
    }
  }
  return ctx;
}
function dnRenderDetail() {
  const D = dnDetailData();
  if (!D) { main.innerHTML = `<div class="${card} p-8 text-center text-sm text-slate-500">找不到這個項目。<br><button onclick="up()" class="${btn} ${dnLine} mt-4">← 返回</button></div>`; return; }
  const { x, e, ex, m, src } = D, xs = src || x, T = e.type, sec = (t, body) => body ? `<section class="${card} p-4 md:p-5 mb-3"><h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${t}</h3>${body}</section>` : '';
  const ctx = dnFullCtx(x, e.text, m, T);
  const list = (arr, fn) => arr.length ? `<ul class="space-y-1.5 text-sm">${arr.map(fn).join('')}</ul>` : '';
  if (typeof exCtx === 'function') exCtx(ex); // 「＋ 例句」只在有真正詳解（extra_vocab）時顯示
  const ex2 = dnArr(e.examples).map(o => typeof o === 'string' ? { en: o } : o);
  // 其他意思（senses）：標題區主解釋（＝本篇用法）下面，列出同一個字的其他意思＋英文解說＋🔊（音檔 _se{k}）；資料不動，只改顯示
  const snHead = (() => {
    const all = dnArr(e.senses).map((o, i) => ({ o, i })).filter(r => r.o && typeof r.o === 'object' && r.o.zh);
    if (T !== 'word' || all.length < 2) return '';
    const mi = all.findIndex(r => r.o.in_passage), skip = mi >= 0 ? all[mi].i : all[0].i; // 主解釋＝本篇用到的那個意思；字庫沒有 in_passage 就視為第一筆
    const rest = all.filter(r => r.i !== skip);
    return rest.length ? `<div class="mt-2 space-y-1.5">${rest.map(r => `<div class="border-l-2 border-indigo-300 dark:border-indigo-700 pl-2"><p class="text-base font-semibold">${esc(r.o.zh)}${r.o.pos ? ` <span class="${dnChip}">${esc(r.o.pos)}</span>` : ''}</p>${r.o.en ? `<p class="text-sm text-slate-500 italic leading-relaxed">${esc(r.o.en)} ${dnSpk(xs, e, '_se' + (r.i + 1), r.o.en)}</p>` : ''}</div>`).join('')}</div>` : '';
  })();
  let h = `<header class="mb-4 flex items-start justify-between gap-2"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="${dnChip} ${DNTC[T]}">${DNT[T]}</span><span class="text-xs text-slate-500">${isLib(x) ? 'TSL 字庫（通用詳解）' : `W${x.week} · D${x.day} ${esc(x.tag || '')}`}</span>${lvBadge(x)}</div>
    <h2 class="${T === 'sentence' ? 'text-lg leading-relaxed' : 'text-2xl'} font-bold mt-2 break-words">${esc(e.text)} <button onclick="vplay('${idOf(xs)}', this.dataset.w, '', this.dataset.w)" data-w="${esc(e.text)}" data-vq="${idOf(x)}" data-vw="${esc(e.text)}" class="text-slate-400 hover:text-indigo-600 text-xl align-middle" aria-label="發音">🔊</button>${ex && typeof spBtn === 'function' ? spBtn(e) : ''}</h2>
    ${e.ipa || e.pos ? `<p class="text-sm text-slate-500 mt-1">${esc(e.ipa || '')} ${e.pos ? `<i>${esc(e.pos)}</i>` : ''}</p>` : ''}
    ${e.zh ? `<p class="text-base font-semibold mt-2">${esc(e.zh)}</p>` : ''}${e.en ? `<p class="text-sm text-slate-500 italic mt-1 leading-relaxed">${esc(e.en)} ${dnSpk(xs, e, '_en', e.en)}</p>` : ''}${e.en2 ? `<p class="text-sm text-slate-500 italic mt-1 leading-relaxed">${esc(e.en2)} ${dnSpk(xs, e, '_en2', e.en2)}</p>` : ''}${snHead}</div><div class="flex flex-col items-end gap-1.5 shrink-0">${dnBackBtn()}${dnTrailBackBtn()}</div></header>`;
  if (ex && typeof spBanner === 'function') h += spBanner(e);
  if (!ex) {
    h += `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 mb-3 text-xs text-amber-800 dark:text-amber-300 leading-relaxed">這個項目還沒有補充詳解（${D.kind === 'pp' ? '目前只顯示句型卡的中文意思與用法' : D.base ? '目前只顯示核心單字卡的內容' : '待補'}）。${m ? '已在入庫，請到「📌 入庫彙整」複製 AI 提示詞，合併回 daily.json 後就會出現。' : isLib(x) ? '這個字還沒有出現在任何文章裡。按「複製 AI 提示詞」會順便把它加入入庫彙整；貼給 AI → 檔案存成 w0d1_extra.json → json_merge.py 合併 → 重新執行 Scan 腳本，這裡就會有通用詳解。' : '按下面的按鈕入庫，再到「📌 入庫彙整」產生 AI 提示詞。'}
      <div class="mt-2 flex flex-wrap gap-2">${(m || D.base || isLib(x)) ? `<button onclick="dnCopyOne()" class="text-xs rounded-lg px-2.5 py-1 ${dnPri} cursor-pointer">複製 AI 提示詞（這個字）</button>` : ''}${m ? `<button onclick="dnNav('marks')" class="${dnSm}">前往 📌 入庫彙整</button>` : D.base ? `<button onclick="${D.kind === 'pp' ? 'dnAddFromPP' : 'dnAddFromVocab'}(${D.i})" class="${dnSm}">＋ 入庫（請 AI 補詳解）</button>` : ''}</div></div>`;
  }
  if (ex && src && src !== x) h += `<p class="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 text-xs px-3 py-2 mb-3">${isLib(src) ? '這個字的詳解來自「TSL 字庫」（通用說明），這裡沿用同一份。' : `這個字已在 ${dnLabel(src)} 入庫並寫好詳解，這裡沿用同一份。「說明」寫的是當時那篇的用法。`}</p>`;
  const primaryHtml = ctx ? `<div class="flex items-start gap-2"><p class="text-sm leading-relaxed flex-1">${dnHiCtx(ctx, e.text, T === 'sentence' ? null : x)}</p>${T === 'sentence' ? '' : `<button onclick="vplay('${idOf(x)}', this.dataset.t, '_ctx', this.dataset.w)" data-t="${esc(e.text)}" data-w="${esc(ctx)}" class="text-slate-400 hover:text-indigo-600 shrink-0" aria-label="發音">🔊</button>`}</div>${T !== 'sentence' && dnCtxPhrases(ctx, e.text, x).length ? '<p class="mt-1.5 text-[0.6875rem] text-slate-400">紫色底線＝這一句裡本篇已入庫的片語，點一下看詳解</p>' : ''}` : '';
  { // 其他文章的用法：usages＝AI 依「新單字備註」寫回的各篇所在句＋解說；別篇已入庫、AI 還沒寫回的，先列所在句並標「待 AI 補解說」
    const uk = t => { const mm = /W(\d+)\D+(\d+)/i.exec(String(t || '')); return mm ? mm[1] + '-' + mm[2] : String(t || '').trim(); };
    const us = T === 'sentence' ? [] : dnArr(e.usages).filter(u => u && typeof u === 'object' && (u.zh || u.ctx));
    const done = new Set(us.map(u => uk(u.src))), owner = idOf(xs), kk = dnKey(e.text);
    const pend = T === 'sentence' ? [] : dnMarks().filter(q => q.type !== 'sentence' && dnKey(q.text) === kk && dnArt(q.qid) && !isLib(dnArt(q.qid)) && q.qid !== owner && !done.has(uk(dnLabel(dnArt(q.qid)))));
    const row = (lab, a, ctx, zh, wait, px) => `<li class="border-l-2 border-indigo-300 dark:border-indigo-700 pl-3"><div class="flex flex-wrap items-center gap-1.5 mb-0.5">${a ? `<button onclick="dnGoArt('${idOf(a)}')" class="${dnChip} underline cursor-pointer">${esc(lab)}</button>` : `<span class="${dnChip}">${esc(lab)}</span>`}${a && idOf(a) === idOf(x) ? '<span class="text-[0.6875rem] text-slate-400">（本篇）</span>' : ''}${wait ? '<span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">待 AI 補解說</span>' : ''}</div>${ctx ? `<div class="flex items-start gap-2"><p class="text-sm leading-relaxed flex-1">${dnHiCtx(ctx, e.text, px)}</p><button onclick="vplay('${idOf(x)}', this.dataset.t, '_ctx', this.dataset.w)" data-t="${esc(e.text)}" data-w="${esc(ctx)}" class="text-slate-400 hover:text-indigo-600 shrink-0" aria-label="發音">🔊</button></div>` : ''}${zh ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed whitespace-pre-line">${esc(zh)}</p>` : ''}</li>`;
    // 「在文章裡」＝本篇那一句，接續其他文章的句子（同一區塊，不再另開「其他文章的用法」）：別篇入庫就自動接在後面；AI 補好的解說（usages）會顯示在該句下面
    const ck = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(), seenC = new Set(ctx ? [ck(ctx)] : []);
    const ord = a => a ? a.week * 100 + a.day : 1e6;
    const others = us.map(u => { const mm = /W(\d+)\D+(\d+)/i.exec(String(u.src || '')), a = mm ? find(+mm[1], +mm[2]) : null; return { lab: a ? dnLabel(a) : String(u.src || '另一篇'), a, ctx: u.ctx, zh: u.zh, wait: false }; })
      .concat(pend.map(q => ({ lab: dnLabel(dnArt(q.qid)), a: dnArt(q.qid), ctx: q.ctx, zh: '', wait: true })))
      .filter(o => { const k = ck(o.ctx); if (k && seenC.has(k)) return false; if (k) seenC.add(k); return true; }) // 與前面重複的句子只留一次
      .sort((p, q) => ord(p.a) - ord(q.a));
    const rows = (ctx && others.length ? [row(dnLabel(x), x, ctx, '', false, x)] : []).concat(others.map(o => row(o.lab, o.a, o.ctx, o.zh, o.wait)));
    h += sec('在文章裡', others.length
      ? `<ul class="space-y-3">${rows.join('')}</ul>${T !== 'sentence' && ctx && dnCtxPhrases(ctx, e.text, x).length ? '<p class="mt-2 text-[0.6875rem] text-slate-400">紫色底線＝這一句裡本篇已入庫的片語，點一下看詳解</p>' : ''}`
      : (primaryHtml || (T !== 'sentence' && isLib(xs) ? '<p class="text-xs text-slate-400">還沒有文章用到這個字；之後有文章入庫，句子會接在這裡。</p>' : '')));
  }
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
  h += sec('詞性（Parts of Speech）', list(dnArr(e.pos_uses), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${dnSpk(xs, e, '_pw' + (i + 1), o.w || e.lemma || e.text, o.zh)}<div><div class="flex flex-wrap items-center gap-x-1.5"><b>${esc(o.w || e.lemma || e.text)}</b><span class="${dnChip}">${esc(o.pos || '')}</span> <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''}</span>　<b>${esc(o.zh || '')}</b>${inP(o)}</div></div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1">${dnSpk(xs, e, '_p' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}${exTail(xs, e, 'pos_uses', i, o)}</li>`));
  h += sec('多義（Multiple Meanings）', list(dnArr(e.senses), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${dnSpk(xs, e, '_sw' + (i + 1), e.lemma || e.text, o.zh)}<div><div class="flex flex-wrap items-center gap-x-1.5"><b>${esc(e.lemma || e.text)}</b>${o.ipa ? ` <span class="text-slate-500">${esc(o.ipa)}</span>` : ''}<span class="${dnChip}">${esc(o.pos || '')}</span>　<b>${esc(o.zh || '')}</b>${inP(o)}</div>${o.en ? `<p class="text-xs text-slate-500 italic mt-0.5">${esc(o.en)} ${dnSpk(xs, e, '_se' + (i + 1), o.en)}</p>` : ''}${o.distinguish ? `<p class="text-xs text-slate-500 mt-0.5">${esc(o.distinguish)}</p>` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1">${dnSpk(xs, e, '_s' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}${exTail(xs, e, 'senses', i, o)}</li>`));
  h += sec('屈折變化（Inflections）', list(dnArr(e.forms), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${o.w ? dnSpk(xs, e, '_f' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b>${o.label ? ` <span class="${dnChip}">${esc(o.label)}</span>` : ''} <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_fx' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}${exTail(xs, e, 'forms', i, o)}</li>`));
  h += sec('同字族（Word Family）', list(dnArr(e.derived), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${o.w ? dnSpk(xs, e, '_d' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b> <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}${o.link ? `<p class="text-xs text-slate-500 mt-0.5">${esc(o.link)}</p>` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_dx' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}${exTail(xs, e, 'derived', i, o)}</li>`));
  const cols = dnArr(e.collocations);
  h += sec('常用搭配', (cols.length ? `<ul class="space-y-1.5 text-sm">${cols.map((c, i) => { const ph = typeof c === 'string' ? c : (c.phrase || c.p || ''); return `<li class="flex items-start gap-2">${ph ? dnSpk(xs, e, '_cp' + (i + 1), ph) : ''}<div><b>${esc(ph)}</b>${c && c.ipa ? ` <span class="text-slate-500">${esc(c.ipa)}</span>` : ''}${c && c.zh ? `　${esc(c.zh)}` : ''}</div></li>`; }).join('')}</ul>` : (dnArr(e.col).length ? `<p class="text-sm">${dnArr(e.col).map(esc).join('；')}</p>` : '')) + exColPlus());
  const exAll = ex2.map((o, i) => ({ o, suf: '_e' + (i + 1), tag: o.tag || (o.added ? '新增' : '') })).concat(cols.map((c, i) => ({ o: c && c.example, suf: '_c' + (i + 1), tag: '常用搭配', hi: c && (c.phrase || c.p), ci: i, c })).filter(r => r.o && r.o.en)); // 搭配的例句併入例句區，標「常用搭配」
  h += sec('同義改寫', (l => l ? l + exSecPlus('paraphrase') : '')(list(dnArr(e.paraphrase), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : (o && o.en ? `<li class="flex items-start gap-2">${dnSpk(xs, e, '_pr' + (i + 1), o.en)}<div>${dnExHtml(o)}</div></li>` : ''))));
  h += sec(T === 'sentence' ? '同句型例句' : '例句', list(exAll, r => `<li class="flex items-start gap-2">${dnSpk(xs, e, r.suf, r.o.en || '')}<div><p>${r.hi ? dnHiCtx(r.o.en, r.hi) : esc(r.o.en || '')}</p>${r.tag || r.o.zh ? `<p class="text-xs text-slate-500">${r.tag ? `<span class="${r.tag === '常用搭配' ? 'text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 ' + DNTC.phrase : dnChip} mr-1.5 align-middle">${esc(r.tag)}</span>` : ''}${esc(r.o.zh || '')}</p>` : ''}${r.ci != null ? exRows(xs, e, 'collocations', r.ci, r.c) : ''}</div></li>`) + exSecPlus('examples'));
  h += sec('句中值得注意的字', list(dnArr(e.key_words), (o, i) => dnKwHtml(x, xs, e, o, i)));
  h += sec(typeof cfTitle === 'function' ? cfTitle(e) : '易混淆', (typeof cfEmpty === 'function' ? cfEmpty(e) : '') + dnCfWrap(dnCfSelfRow(xs, e, ex2, cols), list(dnArr(e.confusable), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${(o.word || o.phrase) ? dnSpk(xs, e, '_cw' + (i + 1), o.word || o.phrase) : ''}<div><b>${esc(o.word || o.phrase || '')}</b>${o.ipa ? ` <span class="text-slate-500">${esc(o.ipa)}</span>` : ''}${dnKindChips(o)}${o.diff ? `　${esc(o.diff)}` : ''}</div></div>${o.usage ? `<details class="mt-1 ml-6 text-xs text-slate-600 dark:text-slate-300"><summary class="cursor-pointer select-none text-indigo-600 dark:text-indigo-400">用法／文法差異</summary><p class="mt-1 leading-relaxed whitespace-pre-line">${esc(o.usage)}</p></details>` : ''}${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_cf' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}</li>`)));
  h += typeof gpBar === 'function' ? gpBar(e) : '';
  h += sec('近義片語', list(dnArr(e.similar), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${(o.phrase || o.word) ? dnSpk(xs, e, '_sm' + (i + 1), o.phrase || o.word) : ''}<div><b>${esc(o.phrase || o.word || '')}</b>${o.ipa ? ` <span class="text-slate-500">${esc(o.ipa)}</span>` : ''}${o.diff ? `　${esc(o.diff)}` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_sx' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}${exTail(xs, e, 'similar', i, o)}</li>`));
  h += sec('相關字（語意相近）', list(dnArr(e.family), (o, i) => typeof o === 'string' ? `<li>${esc(o)}</li>` : `<li><div class="flex items-start gap-2">${o.w ? dnSpk(xs, e, '_m' + (i + 1), o.w) : ''}<div><b>${esc(o.w || '')}</b> <span class="text-slate-500">${o.ipa ? esc(o.ipa) : ''} ${o.pos ? `<i>${esc(o.pos)}</i>` : ''}</span>${o.zh ? `　${esc(o.zh)}` : ''}</div></div>${o.example && o.example.en ? `<div class="flex items-start gap-2 mt-1 ml-6">${dnSpk(xs, e, '_mx' + (i + 1), o.example.en)}<div>${dnExHtml(o.example)}</div></div>` : ''}${exTail(xs, e, 'family', i, o)}</li>`));
  h += `<div class="flex flex-wrap gap-2 mt-4"><button onclick="up()" class="${btn} ${dnLine}">← 返回</button>${dnRpBtn(idOf(x), '', 'vocab')}${ex ? `<button onclick="dnOpenAudioFix()" class="${dnSm}">🔧 音檔修復</button>` : ''}</div>`;
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
  if (core) dnArts().forEach(a => (a.vocab || []).forEach((v, i) => { // 核心單字：沒有詳解的也列進來（單字／片語分頁顯示卡片上的基本資料，待補詳解分頁顯示提示詞按鈕）
    const t = String((v && v.word) || '').trim(), k = dnKey(t); if (!t || map.has(k)) return;
    map.set(k, { text: t, e: null, qid: idOf(a), merged: false, type: /\s/.test(t) ? 'phrase' : 'word', mark: null, core: true, base: v, w: a.week, d: a.day, i });
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
  if (!it.merged) return !!it.core && ((tab === 'word' && k === 'word') || (tab === 'phrase' && k === 'phrase')); // 核心單字即使沒有詳解，也列在單字／片語分頁
  if (tab === 'word') return k === 'word';
  if (tab === 'multi') return k === 'word' && dnMulti(it.e).multi;
  if (tab === 'phrase') return k === 'phrase';
  return k === 'sent';
}
function dnBankHay(it) {
  const e = it.e || it.base || {}, m = dnMulti(it.e);
  return [it.text, e.zh, e.pattern, it.mark && it.mark.ctx, it.mark && it.mark.note].concat(m.se.map(o => o.zh), m.us.map(o => o.zh)).filter(Boolean).join(' ').toLowerCase();
}
function dnBankRow(it) {
  const e = it.e || {}, k = dnBankKind(it), mu = dnMulti(e), T = esc(it.text), tag = 'text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
  const spk = `<button onclick="vplay('${it.qid}', this.dataset.t, '', this.dataset.t)" data-t="${T}" data-vq="${it.qid}" data-vw="${T}" class="text-slate-400 hover:text-indigo-600 shrink-0 mt-0.5" aria-label="發音">🔊</button>`;
  let body;
  if (!it.merged && it.core && DN.bk.tab !== 'todo') { // 單字／片語分頁裡「還沒有詳解的核心單字」：顯示卡片上的基本資料，點開看核心單字卡
    const b = it.base || {};
    body = `<div class="min-w-0 flex-1 cursor-pointer" onclick="tslOpen(${it.w},${it.d},${it.i})"><div class="flex flex-wrap items-baseline gap-x-1.5"><b class="text-sm break-words">${T}</b>${b.ipa ? `<span class="text-xs text-slate-500">${esc(b.ipa)}</span>` : ''}${b.pos ? `<i class="text-xs text-slate-500">${esc(b.pos)}</i>` : ''}${b.zh ? `<span class="text-sm">${esc(b.zh)}</span>` : ''}<span class="${dnChip}">核心單字</span><span class="${tag}">待補詳解</span></div></div>`;
  } else if (!it.merged) {
    const m = it.mark || {};
    body = `<div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-1.5"><span class="${dnChip} ${DNTC[it.type] || DNTC.word}">${DNT[it.type] || '單字'}</span><b class="text-sm break-words">${T}</b>${it.core ? '<span class="' + dnChip + '">核心單字</span>' : ''}</div>${it.type !== 'sentence' && m.ctx ? `<p class="text-xs text-slate-500 mt-0.5 break-words">${esc(m.ctx)}</p>` : ''}${m.note ? `<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5 break-words">備註：${esc(m.note)}</p>` : ''}</div><button onclick="dnBankCopy('${it.qid}', this.dataset.t, this)" data-t="${T}" class="${btn} ${dnLine} !py-1 !px-2 text-xs shrink-0">複製提示詞</button>`;
  } else if (k === 'sent') {
    body = `<div class="min-w-0 flex-1 cursor-pointer" onclick="dnBankOpen(this)" data-q="${it.qid}" data-t="${T}"><p class="text-sm leading-relaxed">${T}</p>${e.zh ? `<p class="text-xs text-slate-500 mt-0.5">${esc(e.zh)}</p>` : ''}${e.pattern && DN.bk.sm !== 'pat' ? `<p class="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">🧩 ${esc(e.pattern)}</p>` : ''}</div>`;
  } else {
    const chips = k === 'word' ? `${mu.se.length >= 2 ? `<span class="${tag}">多義</span>` : ''}${mu.us.length >= 2 ? `<span class="${tag}">多詞性</span>` : ''}` : '';
    const lines = DN.bk.tab === 'multi' ? `${mu.us.length >= 2 ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1"><b>詞性</b>　${mu.us.map(o => `${o.pos ? `<i>${esc(o.pos)}</i> ` : ''}${esc(o.zh || '')}`).join('；')}</p>` : ''}${mu.se.length >= 2 ? `<p class="text-xs text-slate-600 dark:text-slate-300 mt-1"><b>意思</b>　${mu.se.map(o => `${o.pos ? `<i>${esc(o.pos)}</i> ` : ''}${esc(o.zh || '')}`).join('；')}</p>` : ''}` : '';
    body = `<div class="min-w-0 flex-1 cursor-pointer" onclick="dnBankOpen(this)" data-q="${it.qid}" data-t="${T}"><div class="flex flex-wrap items-baseline gap-x-1.5"><b class="text-sm break-words">${T}</b>${e.ipa ? `<span class="text-xs text-slate-500">${esc(e.ipa)}</span>` : ''}${k === 'word' && e.pos ? `<i class="text-xs text-slate-500">${esc(e.pos)}</i>` : ''}${e.zh ? `<span class="text-sm">${esc(e.zh)}</span>` : ''}${chips}</div>${lines}</div>`;
  }
  return `<div class="py-2 flex items-start gap-2">${spk}${body}${it.merged || (it.core && DN.bk.tab !== 'todo') ? '<span class="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5">›</span>' : ''}</div>`;
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
/* ---------- 入庫總覽搜尋：語音輸入（🎤＋中／EN 切換，語言記在這台裝置）---------- */
let BK_REC = null;
function dnBankLang() { try { return localStorage.getItem('bankmiclang') === 'en-US' ? 'en-US' : 'zh-TW'; } catch (e) { return 'zh-TW'; } }
function dnBankLangToggle() {
  const n = dnBankLang() === 'en-US' ? 'zh-TW' : 'en-US';
  try { localStorage.setItem('bankmiclang', n); } catch (e) {}
  if (BK_REC) { try { BK_REC.stop(); } catch (e) {} }
  document.querySelectorAll('[data-bklang]').forEach(b => { b.textContent = n === 'en-US' ? 'EN' : '中'; });
  dnToast(n === 'en-US' ? '搜尋語音：English' : '搜尋語音：中文');
}
function dnBankMic(btnEl) { // 再按一次＝停止
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { dnToast('這個瀏覽器不支援語音輸入，可改用手機鍵盤上的麥克風'); return; }
  if (BK_REC) { try { BK_REC.stop(); } catch (e) {} return; }
  const el = document.getElementById('bank-q'); if (!el) return;
  try { if (typeof spStop === 'function') spStop(); if (typeof skStopAll === 'function') skStopAll(); if (typeof NW_REC !== 'undefined' && NW_REC) NW_REC.stop(); speechSynthesis.cancel(); } catch (e) {}
  const r = new SR();
  r.lang = dnBankLang(); r.interimResults = true; r.continuous = false;
  const rest = () => { BK_REC = null; if (btnEl) { btnEl.textContent = '🎤'; btnEl.classList.remove('animate-pulse', 'text-rose-600'); } };
  r.onstart = () => { if (btnEl) { btnEl.textContent = '⏹'; btnEl.classList.add('animate-pulse', 'text-rose-600'); } };
  r.onresult = ev => {
    const t = String(ev.results[ev.results.length - 1][0].transcript || '').trim().replace(/[.,!?。，！？]+$/, '');
    el.value = t; dnBankQ(t);
  };
  r.onerror = ev => { const m = { 'not-allowed': '麥克風權限被拒絕，請到瀏覽器設定允許', 'service-not-allowed': '麥克風權限被拒絕，請到瀏覽器設定允許', 'no-speech': '沒聽到聲音，再按一次麥克風', 'audio-capture': '找不到麥克風', 'network': '語音辨識需要網路' }[ev.error]; if (m) dnToast(m); };
  r.onend = rest;
  BK_REC = r; try { r.start(); } catch (e) { rest(); }
}
function dnBankQ(v) { DN.bk.q = v; const el = document.getElementById('bank-list'); if (el) el.innerHTML = dnBankList(); } // 只更新清單，輸入框不重繪（才不會每打一個字就失去焦點）
function dnBankTabSet(t) { DN.bk.tab = t; render(); window.scrollTo({ top: 0 }); }
function dnBankSm(v) { DN.bk.sm = v; render(); }
function dnBankCopy(qid, text, b) { // 待補詳解：只為這個字複製 AI 提示詞（核心單字會順便入庫，提示詞需要所在句）
  const x = dnArt(qid); if (!x) return;
  let m = dnMarksOf(qid).find(q => dnKey(q.text) === dnKey(text));
  if (!m) { const v = (x.vocab || []).find(v => dnKey(v.word) === dnKey(text)); if (!v) return; auCopy(dnTempPrompt(qid, [v], false)); dnToast('已複製這個字的提示詞，貼給 AI'); return; } // 核心單字：不入庫
  auCopy(dnPrompt(qid, new Set([dnKey(m.text)]))); dnToast('已複製這個字的提示詞，貼給 AI');
}
function dnBankOpen(el) { dnOpenExtra(el.dataset.q, el.dataset.t); }
const dnBankBtn = () => `<button onclick="dnNav('bank')" class="${btn} w-full mt-2 ${dnLine} ${cur.view === 'bank' ? 'bg-indigo-50 dark:bg-indigo-950 ring-1 ring-indigo-400' : ''}">📚 入庫總覽（${dnBankItems(true).length}）</button>`;
function dnRenderBank() {
  const B = DN.bk, all = dnBankItems(true), cnt = t => all.filter(it => dnBankTab(it, t)).length;
  const tabs = [['word', '單字'], ['multi', '多義單字'], ['phrase', '片語'], ['sent', '句子'], ['todo', '待補詳解']];
  const tb = ([t, n]) => `<button onclick="dnBankTabSet('${t}')" class="${btn} !py-1.5 !px-3 text-xs ${B.tab === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${n} <span class="opacity-70">${cnt(t)}</span></button>`;
  const sm = (v, n) => `<button onclick="dnBankSm('${v}')" class="${btn} !py-1 !px-3 text-xs ${B.sm === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}">${n}</button>`;
  main.innerHTML = `<header class="mb-4 flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">📚 入庫總覽</h2>${dnBackBtn()}</header>
    <div class="${card} p-3 mb-4"><div class="flex flex-wrap gap-2">${tabs.map(tb).join('')}</div>
    <div class="flex gap-2 mt-3"><input id="bank-q" type="search" value="${esc(B.q)}" placeholder="搜尋英文或中文…" oninput="dnBankQ(this.value)" class="${dnInp} flex-1 min-w-0">${(window.SpeechRecognition || window.webkitSpeechRecognition) ? `<button onclick="dnBankMic(this)" class="${btn} ${dnLine} !px-3 shrink-0" aria-label="語音搜尋">🎤</button><button onclick="dnBankLangToggle()" data-bklang class="${btn} ${dnLine} !px-3 !text-xs !font-semibold shrink-0" aria-label="切換語音語言（中／EN）">${dnBankLang() === 'en-US' ? 'EN' : '中'}</button>` : ''}</div>
    ${B.tab === 'sent' ? `<div class="flex flex-wrap items-center gap-2 mt-3"><span class="text-xs text-slate-500">排列</span>${sm('art', '依文章')}${sm('pat', '依句型模板')}</div>` : ''}
    ${B.tab === 'multi' ? '<p class="text-xs text-slate-500 mt-3 leading-relaxed">「詞性」是同一個拼法的不同詞性用法，「意思」是同詞性裡的不同意思；點一列看完整詳解。</p>' : ''}
    ${B.tab === 'todo' ? `<p class="text-xs text-slate-500 mt-3 leading-relaxed">這些是還沒有詳解的項目：你入庫的，加上文章核心多益單字裡還沒補詳解的（標「核心單字」）。每列可直接「複製提示詞」；也可到 <button onclick="dnNav('marks')" class="underline text-indigo-600 dark:text-indigo-400 cursor-pointer">📌 入庫彙整</button> 複製 AI 提示詞，合併回 daily.json 後就會出現在這裡的其他分頁。</p>` : ''}</div>
    <div id="bank-list">${dnBankList()}</div>`;
}

/* ======================= 掛進 daily.js 的小工具 ======================= */
function dnToggleMhl() { cur.mhl = !cur.mhl; if (cur.mhl) cur.enOpen = true; render(); }
(function () { // 入庫標示色：單字藍、片語紫、句子綠（與核心單字的黃色標示區分）
  const s = document.createElement('style');
  s.textContent = '#passage-text.mhl .mk,#pair-text.mhl .mk{border-radius:3px;padding:0 2px;color:inherit}'
    + '#passage-text.mhl .mk-phrase,#pair-text.mhl .mk-phrase{background:rgba(167,139,250,.35)}#passage-text.mhl .mk-sentence,#pair-text.mhl .mk-sentence{background:rgba(52,211,153,.30)}';
  document.head.appendChild(s);
})();
function dnAfterDay() { dnApplyMarks(); ['passage-text', 'pair-text'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle('mhl', !!cur.mhl); }); dnSyncBar(); }
function dnSyncBar() { if (DN.sel && (DN.sel.src === 'detail' ? cur.view !== 'detail' : (cur.view !== 'day' || DN.sel.qid !== idOf(find(cur.w, cur.d) || {})))) DN.sel = null; dnBar(); }
function dnWhyH(x, q, qi, ok) { // 解析：預設收合，點「看解析」展開
  const open = !!(cur.why && cur.why[qi]);
  return `<button onclick="dnToggleWhy(${qi})" class="text-xs ${dnSm} !px-3 !py-1.5">${open ? '▾ 收起解析' : '▸ 看解析'}</button>`
    + (open ? `<div class="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg">${q.why.map((w, wi) => `<p class="${wi === q.ans ? 'font-semibold text-slate-800 dark:text-slate-200' : ''}"><b>${L[wi]}:</b>${esc(w)}</p>`).join('')}</div>` : '');
}
function dnToggleWhy(qi) { cur.why = cur.why || {}; cur.why[qi] = !cur.why[qi]; render(); }
function dnAllWhy(on) { const x = find(cur.w, cur.d); cur.why = {}; if (on && x) x.questions.forEach((q, i) => { cur.why[i] = true; }); render(); }


/* ======================= 學習軌跡：已入庫的字 → 進去學習 → 回到剛剛那一頁 =======================
   · 在任何地方要入庫、但這個字已經在庫 → 跳出「要進入學習嗎？」；進入前先記下目前這一頁（頁面＋捲動位置）
   · 一路進入下一個字、又下一個字，記錄會累積，顯示在畫面左邊（桌機側欄／手機頂端）；點任一筆就回到那一頁
   · 存在 sessionStorage：重新整理還在，關掉分頁就清掉；最多 DN_TRAIL_MAX 筆，超過丟掉最舊的 */
const DN_TRAIL_KEY = 'dnTrailV1', DN_TRAIL_MAX = 10;
let DN_TRAIL = null;
function dnTrail() {
  if (!DN_TRAIL) { try { DN_TRAIL = JSON.parse(sessionStorage.getItem(DN_TRAIL_KEY) || '[]'); } catch (e) { DN_TRAIL = []; } if (!Array.isArray(DN_TRAIL)) DN_TRAIL = []; }
  return DN_TRAIL;
}
function dnTrailSave() { try { sessionStorage.setItem(DN_TRAIL_KEY, JSON.stringify(dnTrail())); } catch (e) {} }
function dnTrailLabel(c) {
  const x = find(c.w, c.d), wd = `W${c.w}·D${typeof dShow === 'function' ? dShow({ week: c.w, day: c.d }) : c.d}`, v = c.view;
  if (v === 'detail') { const d = c.det || {}, t = d.kind === 'vocab' ? (x && x.vocab && x.vocab[d.i] ? x.vocab[d.i].word : '') : d.text; return '📖 ' + (t || '詳解'); }
  const N = { marks: '📌 入庫彙整', reports: '⚑ 回報彙整', nw: '🆕 新單字', bank: '📚 入庫總覽', book: '★ 生詞本／錯題本', speak: '🎙 語音練習 ' + wd, home: '▦ 總表', launch: '☰ 選單', maint: '🛠 維護', mitem: '🛠 ' + wd };
  return N[v] || ('📄 ' + wd + (x && x.tag ? ' ' + x.tag : ''));
}
function dnTrailPush() { // 記下「目前這一頁」，之後可以回來
  try {
    const t = dnTrail();
    t.push({ sec: SEC, cur: JSON.parse(JSON.stringify(cur)), y: window.scrollY, depth: (cur.stk || []).length });
    while (t.length > DN_TRAIL_MAX) t.shift();
    dnTrailSave();
  } catch (e) { console.error(e); }
}
function dnTrailSync() { // 用「返回」退回到軌跡最後一筆那一頁時，那一筆就不用再留著
  const t = dnTrail(), l = t[t.length - 1];
  if (l && l.cur.view === cur.view && l.cur.w == cur.w && l.cur.d == cur.d && (cur.stk || []).length <= l.depth) { t.pop(); dnTrailSave(); }
}
function dnTrailGo(i) {
  const t = dnTrail(), e = t[i]; if (!e) return;
  if (e.cur.view !== 'launch' && !find(e.cur.w, e.cur.d) && e.cur.view !== 'marks' && e.cur.view !== 'reports' && e.cur.view !== 'nw' && e.cur.view !== 'bank' && e.cur.view !== 'book') { dnToast('這一頁已經不存在了'); DN_TRAIL = t.filter((_, k) => k !== i); dnTrailSave(); render(); return; }
  DN_TRAIL = t.slice(0, i); dnTrailSave();
  SEC = e.sec || 'learn'; cur = JSON.parse(JSON.stringify(e.cur)); cur.stk = cur.stk || [];
  if (isMobile()) push();
  render(); window.scrollTo({ top: e.y || 0 });
}
function dnTrailClear() { DN_TRAIL = []; dnTrailSave(); render(); }
function dnTrailBackBtn() { // 詳解頁右上角：回到剛剛那一頁
  const t = dnTrail(); if (!t.length) return '';
  const i = t.length - 1;
  return `<button onclick="dnTrailGo(${i})" class="text-xs rounded-lg px-2.5 py-1 ${dnPri} cursor-pointer max-w-[14rem] truncate" title="回到 ${esc(dnTrailLabel(t[i].cur))}">↩ 回到：${esc(dnTrailLabel(t[i].cur))}</button>`;
}
function dnTrailSide() { // 桌機側欄
  const t = dnTrail(); if (!t.length) return '';
  const row = (c, i) => `<button onclick="dnTrailGo(${i})" class="w-full text-left text-xs rounded-lg px-2 py-1.5 truncate border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer" title="${esc(dnTrailLabel(c))}"><span class="text-slate-400">${i + 1}.</span> ${esc(dnTrailLabel(c))}</button>`;
  return `<div class="mb-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-2"><div class="flex items-center justify-between mb-1.5"><span class="text-xs font-bold text-indigo-700 dark:text-indigo-300">🧭 學習軌跡</span><button onclick="dnTrailClear()" class="text-[0.6875rem] text-slate-400 hover:text-rose-600 cursor-pointer">清除</button></div><div class="space-y-1">${t.map((e, i) => row(e.cur, i)).join('')}<div class="text-xs rounded-lg px-2 py-1.5 truncate bg-indigo-600 text-white" title="${esc(dnTrailLabel(cur))}">📍 ${esc(dnTrailLabel(cur))}</div></div></div>`;
}
function dnTrailMob() { // 手機頂端：可左右滑動的小標籤
  const t = dnTrail(); if (!t.length) return '';
  return `<div class="md:hidden mt-2 flex items-center gap-1.5 overflow-x-auto pb-1 text-xs whitespace-nowrap"><span class="shrink-0 font-bold text-indigo-700 dark:text-indigo-300">🧭</span>${t.map((e, i) => `<button onclick="dnTrailGo(${i})" class="shrink-0 rounded-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 max-w-[9rem] truncate">${esc(dnTrailLabel(e.cur))}</button>`).join('<span class="shrink-0 text-slate-400">›</span>')}<span class="shrink-0 text-slate-400">›</span><span class="shrink-0 rounded-full px-2.5 py-1 bg-indigo-600 text-white max-w-[9rem] truncate">📍 ${esc(dnTrailLabel(cur))}</span><button onclick="dnTrailClear()" class="shrink-0 text-slate-400 px-1" aria-label="清除軌跡">✕</button></div>`;
}
/* 已在庫的字 → 對應的學習頁（核心單字卡／詳解／待補詳解）；找不到回傳 null */
function dnStudyTarget(text) {
  const b = dnBanked(text); if (!b) return null;
  if (b.where === 'extra') return () => dnOpenExtra(b.qid, text);
  if (b.where === 'vocab') { const a = dnArt(b.qid), i = a ? (a.vocab || []).findIndex(v => dnKey(v.word) === dnKey(text)) : -1; return a && i >= 0 ? () => { cur.w = a.week; cur.d = a.day; dnOpenVocab(i); } : null; }
  const m = dnMarks().find(q => dnKey(q.text) === dnKey(text) && dnArt(q.qid)); return m ? () => dnOpenExtra(m.qid, m.text) : null; // 同一個字有多筆入庫時，挑文章還在的那一筆
}
function dnAskStudy(text) { // 回傳 true＝已跳出詢問；false＝不在庫或找不到學習頁（呼叫端照舊顯示提示）
  if (!dnStudyTarget(text)) return false;
  const b = dnBanked(text), at = b.where === 'vocab' ? '文章核心單字' : b.where === 'extra' ? '已有詳解' : '在入庫清單';
  dnModal(`<div class="${card} w-full max-w-sm p-4 md:p-5"><h2 class="font-bold mb-2">這個字已經入庫了</h2><p class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed"><b>${esc(text)}</b>（${at}）。要進入這個字的學習頁嗎？學完可以回到現在這一頁。</p><div class="flex gap-2 mt-4 justify-end"><button onclick="dnClose()" class="${btn} ${dnLine} !py-1.5 text-sm">留在這裡</button><button data-t="${esc(text)}" onclick="dnStudyGo(this.dataset.t)" class="${btn} ${dnPri} !py-1.5 text-sm">進入學習</button></div></div>`);
  return true;
}
function dnStudyGo(text) {
  dnClose(); dnSelClear();
  const D = cur.view === 'detail' ? dnDetailData() : null;
  if (D && dnKey(D.e.text) === dnKey(text)) { dnToast('你正在這個字的學習頁'); return; }
  const go2 = dnStudyTarget(text); if (!go2) { dnToast('找不到這個字的學習頁'); return; }
  dnTrailPush(); go2();
}

/* ======================= ＋ 例句：詳解頁每個用法後面追加例句 =======================

   流程：
   ① 詳解頁每個用法（詞性、多義、搭配、屈折變化、相關字、近義、例句、同義改寫；易混淆另有自己的「＋」）後面有「＋ 例句」：
      手動輸入一句英文，或選「請 AI 新增 N 句」。這兩種都只是先放進待辦（不會直接顯示，因為要先經過 AI 檢查並補中文翻譯）。
   ② 維護區（📌 入庫彙整／🆕 新單字「待補充詳解」）的「➕ 例句追加」：複製或下載提示詞給 AI。
   ③ AI 回傳只追加的 JSON（w?d?_extra.json）：{"text":"surcharge","example_add":[{"block":"pos_uses","pos":"n.","zh":"額外費用、附加費","examples":[{en,zh}]}],"ex_done":[{id,result}]}
      → json_merge.py 合併（英文句子重複自動略過，沒有數量上限）。
   ④ 合併後：該用法底下依序顯示「原本那句＋新增的句子」，每句都有 🔊🎙 與中文翻譯。

   資料：localStorage 鍵 toeicExAddV1（以 toeic 開頭 → cloud-sync.js 會自動同步；每筆都有 id）
     { id:'x…', text:詳解的 text, block, key:{pos,zh｜phrase｜w[,label]}, lab, mode:'manual|ai', en?（manual）, n?（ai）, created, updated, t }
   寫回主檔（daily.json）：用法底下 extra_examples:[{en,zh}]；examples／paraphrase 直接接在陣列後面（帶 added:1）；extra_vocab 每筆可有 ex_done:[{id,result}]
   mp3：{字}_{後綴}{第幾筆}x{第幾句}.mp3，例如 surcharge_p1x2.mp3（auto-speech.py 的 MAKE_EXTRA_EX 負責）
   待辦完成的判斷：ex_done 有這個 id；或手動輸入的那句英文已經在該用法裡。 */

const EX_KEY = 'toeicExAddV1';
const EX_BLK = {
  pos_uses: { fld: 'pos_uses', suf: 'p', name: '詞性', ml: '' },
  senses: { fld: 'senses', suf: 's', name: '多義', ml: '' },
  collocations: { fld: 'collocations', suf: 'c', name: '常用搭配', ml: '' },
  forms: { fld: 'forms', suf: 'fx', name: '屈折變化', ml: 'ml-6' },
  family: { fld: 'family', suf: 'mx', name: '相關字', ml: 'ml-6' },
  similar: { fld: 'similar', suf: 'sx', name: '近義片語', ml: 'ml-6' },
  derived: { fld: 'derived', suf: 'dx', name: '同字族', ml: 'ml-6' },
  newcol: { fld: 'collocations', suf: 'c', name: '新增搭配', ml: '', add: true },
  examples: { fld: 'examples', suf: 'e', name: '例句', direct: true },
  paraphrase: { fld: 'paraphrase', suf: 'pr', name: '同義改寫', direct: true }
};
let EXL = null, EXC = null;
const exList = () => { if (EXL) return EXL; try { EXL = JSON.parse(localStorage.getItem(EX_KEY) || '[]'); } catch (e) { EXL = []; } if (!Array.isArray(EXL)) EXL = []; return EXL; };
const exSave = () => { try { localStorage.setItem(EX_KEY, JSON.stringify(exList())); } catch (e) {} };
const exNz = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
const exEnKey = s => exNz(String(s == null ? '' : s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"')).replace(/[\s.!?"']+$/, '');
const exCtx = ex => { EXC = ex ? { text: String(ex.text || ex.word || '') } : null; }; // 詳解頁每次繪製前設定：沒有真正的詳解（只有核心單字資料）就不顯示「＋」

function exKeyOf(blk, o) { // 用法的比對鍵（與 json_merge.py 的 _ex_usage_key 一致）
  if (!o || typeof o !== 'object') return {};
  if (blk === 'pos_uses' || blk === 'senses') return { pos: String(o.pos || '').trim(), zh: String(o.zh || '').trim() };
  if (blk === 'collocations' || blk === 'similar') return { phrase: String(o.phrase || o.p || o.word || '').trim() };
  if (blk === 'forms') return Object.assign({ w: String(o.w || o.word || '').trim() }, o.label ? { label: String(o.label).trim() } : {});
  if (blk === 'family' || blk === 'derived') return { w: String(o.w || o.word || '').trim() };
  return {};
}
function exSame(a, b) { const ks = new Set(Object.keys(a || {}).concat(Object.keys(b || {}))); return Array.from(ks).every(k => exNz(a && a[k]) === exNz(b && b[k])); }
function exLabel(blk, o) {
  const k = exKeyOf(blk, o);
  if (blk === 'pos_uses' || blk === 'senses') return `${k.pos} ${k.zh}`.trim();
  return String(k.phrase || k.w || '') + (k.label ? `（${k.label}）` : '');
}
function exEntry(text) { // 這個字的詳解（全題庫只有一筆）：{ a: 所在那一篇, e: extra_vocab 那一筆 }
  const k = dnKey(text);
  for (const a of dnArts()) for (const e of dnExtraOf(a)) if (e && dnKey(e.text || e.word) === k) return { a, e };
  return null;
}
function exTarget(r) { // 待辦指到的位置：{ o, item, ens: 現有英文句子, have: 鍵集合 } 或 null（找不到詳解）
  const o = exEntry(r.text), cfg = EX_BLK[r.block]; if (!o || !cfg) return null;
  let item = null, ens;
  if (cfg.add) { ens = dnArr(o.e[cfg.fld]).map(c => typeof c === 'string' ? c : c && (c.phrase || c.p)).filter(Boolean); return { o, item: null, ens, have: new Set(ens.map(exEnKey)), missing: false }; }
  if (cfg.direct) ens = dnArr(o.e[cfg.fld]).map(x => typeof x === 'string' ? x : x && x.en).filter(Boolean);
  else {
    item = dnArr(o.e[cfg.fld]).find(x => x && typeof x === 'object' && exSame(exKeyOf(r.block, x), r.key));
    ens = item ? [item.example && item.example.en].concat(dnArr(item.extra_examples).map(x => x && x.en)).filter(Boolean) : [];
  }
  return { o, item, ens, have: new Set(ens.map(exEnKey)), missing: !cfg.direct && !item };
}
function exDone(r) {
  const t = exTarget(r); if (!t) return false;
  if (dnArr(t.o.e.ex_done).some(q => q && q.id === r.id)) return true;
  return r.mode === 'manual' && t.have.has(exEnKey(r.en));
}
const exPending = (text, blk, key) => exList().filter(r => r.block === blk && dnKey(r.text) === dnKey(text) && exSame(r.key, key) && !exDone(r));

/* ---------- 詳解頁：用法底下的追加句、待辦提示、「＋ 例句」 ---------- */
const exRecTxt = r => r.mode === 'manual' ? `手動「${esc(String(r.en).slice(0, 40))}」` : `AI 新增 ${r.n} ${r.block === 'newcol' ? '個搭配' : '句'}`;
function exPendHtml(text, blk, key, ml) {
  const rs = exPending(text, blk, key); if (!rs.length) return '';
  return `<div class="mt-1 text-[0.6875rem] text-amber-700 dark:text-amber-300${ml ? ' ' + ml : ''}">⏳ 待處理（到維護區複製提示詞給 AI）：${rs.map(r => `${exRecTxt(r)}<button onclick="exDel('${r.id}')" class="ml-1 text-slate-400 hover:text-rose-600" title="取消這一筆">✕</button>`).join('、')}</div>`;
}
const exPlusHtml = (blk, i, ml) => `<div class="mt-1${ml ? ' ' + ml : ''}"><button onclick="exOpen('${blk}',${i == null ? 'null' : i})" class="${dnSm} !px-2 !py-0.5" title="新增例句：手動輸入一句，或請 AI 新增">＋ 例句</button></div>`;
function exRows(xs, e, blk, i, o) { // 只顯示用法底下已追加的句子（沒有「＋」）：常用搭配的「＋」統一放在例句區塊最後面
  if (!EXC || !o || typeof o !== 'object') return '';
  const cfg = EX_BLK[blk], ml = cfg.ml;
  return dnArr(o.extra_examples).filter(x => x && x.en).map((x, j) => `<div class="flex items-start gap-2 mt-1${ml ? ' ' + ml : ''}">${dnSpk(xs, e, '_' + cfg.suf + (i + 1) + 'x' + (j + 1), x.en)}<div>${dnExHtml(x)}</div></div>`).join('');
}
function exTail(xs, e, blk, i, o) { // 用法（第 i 筆）底下：追加的句子（🔊＋中文）→ 待處理 → ＋
  if (!EXC || !o || typeof o !== 'object') return '';
  const cfg = EX_BLK[blk], ml = cfg.ml;
  const rows = dnArr(o.extra_examples).filter(x => x && x.en).map((x, j) => `<div class="flex items-start gap-2 mt-1${ml ? ' ' + ml : ''}">${dnSpk(xs, e, '_' + cfg.suf + (i + 1) + 'x' + (j + 1), x.en)}<div>${dnExHtml(x)}</div></div>`).join('');
  return rows + exPendHtml(EXC.text, blk, exKeyOf(blk, o), ml) + exPlusHtml(blk, i, ml);
}
const exColPlus = () => EXC ? exPendHtml(EXC.text, 'newcol', {}, '') + `<div class="mt-2"><button onclick="exOpen('newcol',null)" class="${dnSm} !px-2 !py-0.5" title="新增常用搭配：手動輸入一個，或請 AI 新增（AI 會連同例句一起補）">＋ 搭配</button></div>` : '';
const exSecPlus = blk => EXC ? exPendHtml(EXC.text, blk, {}, '') + exPlusHtml(blk, null, '') : ''; // examples／paraphrase：整個區塊就是一串句子，「＋」放在區塊最後

/* ---------- 按「＋ 例句」：手動輸入，或請 AI 新增 N 句（都只是先放進待辦） ---------- */
function exOpen(blk, i) {
  const D = dnDetailData(); if (!D || !D.ex) return;
  const cfg = EX_BLK[blk]; if (!cfg) return;
  let key = {}, lab = cfg.name;
  if (!cfg.direct && !cfg.add) { const o = dnArr(D.ex[cfg.fld])[i]; if (!o || typeof o !== 'object') return; key = exKeyOf(blk, o); lab = cfg.name + '：' + exLabel(blk, o); }
  DN.exDraft = { text: String(D.ex.text || D.ex.word), block: blk, key, lab };
  const NC = !!cfg.add; // 新增搭配：手動輸入一個搭配，或請 AI 新增 N 個（AI 會連同中文、音標、例句一起補）
  dnModal(`<div class="${card} w-full max-w-md p-4 md:p-5 shadow-xl">
    <div class="flex items-start justify-between gap-2"><h3 class="font-bold">${NC ? '＋ 新增常用搭配' : '＋ 新增例句'}</h3><button onclick="dnClose()" class="text-slate-400 hover:text-slate-700 text-lg leading-none" aria-label="關閉">✕</button></div>
    <p class="text-xs text-slate-500 mt-1 break-words">${esc(DN.exDraft.text)} ›　${esc(lab)}</p>
    <label class="block text-sm font-semibold mt-3" for="ex-in">${NC ? '手動輸入一個搭配（英文）' : '手動輸入一句英文'}</label>
    <textarea id="ex-in" rows="${NC ? 1 : 2}" class="${dnInp} mt-1" placeholder="${NC ? '例如：apply a surcharge' : '例如：The surcharge applies to all late orders.'}"></textarea>
    <button onclick="exAddManual()" class="${btn} ${dnPri} w-full mt-2">${NC ? '加入待辦（由 AI 檢查、補中文與例句）' : '加入待辦（由 AI 檢查並補中文）'}</button>
    <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800"><label class="block text-sm font-semibold" for="ex-n">或請 AI 新增</label>
      <div class="flex items-center gap-2 mt-1"><select id="ex-n" class="${dnInp} !w-auto">${[1, 2, 3, 4, 5, 6, 8, 10].map(n => `<option value="${n}">${n} ${NC ? '個' : '句'}</option>`).join('')}</select><button onclick="exAddAI()" class="${btn} ${dnLine} flex-1">請 AI 新增 → 加入待辦</button></div></div>
    <p class="text-[0.6875rem] text-slate-400 mt-3 leading-relaxed">這些只會先放進維護區（📌 入庫彙整／🆕 新單字）的「➕ 例句追加」待辦。複製提示詞給 AI、把回傳的 JSON 用 json_merge.py 合併後，${NC ? '新搭配才會顯示（含中文與例句）。' : '句子才會顯示（含中文翻譯）。'}</p></div>`);
  setTimeout(() => { const t = document.getElementById('ex-in'); if (t) t.focus(); }, 60);
}
function exPush(extra) {
  const D = DN.exDraft, now = Date.now();
  exList().push(Object.assign({ id: dnId('x'), text: D.text, block: D.block, key: D.key, lab: D.lab, created: now, updated: now, t: now }, extra));
  exSave(); dnClose(); render();
}
function exAddManual() {
  const D = DN.exDraft; if (!D) return;
  const en = String((document.getElementById('ex-in') || {}).value || '').replace(/\s+/g, ' ').trim();
  const NC = D.block === 'newcol';
  if (!en) { dnToast(NC ? '請先輸入一個搭配' : '請先輸入一句英文'); return; }
  if (!/[A-Za-z]{2}/.test(en)) { dnToast(NC ? '請輸入英文搭配' : '請輸入英文句子'); return; }
  const tg = exTarget({ text: D.text, block: D.block, key: D.key });
  if (tg && tg.have.has(exEnKey(en))) { dnToast(NC ? '已經有這個搭配了' : '這個用法已經有這一句了'); return; }
  if (exPending(D.text, D.block, D.key).some(r => r.mode === 'manual' && exEnKey(r.en) === exEnKey(en))) { dnToast('待辦裡已經有這一句了'); return; }
  exPush({ mode: 'manual', en }); dnToast(NC ? '已加入待辦：手動輸入 1 個搭配（到維護區請 AI 檢查並補例句）' : '已加入待辦：手動輸入 1 句（到維護區請 AI 檢查）');
}
function exAddAI() {
  if (!DN.exDraft) return;
  const n = Math.max(1, Math.min(20, parseInt((document.getElementById('ex-n') || {}).value) || 1));
  exPush({ mode: 'ai', n }); dnToast(`已加入待辦：請 AI 新增 ${n} ${DN.exDraft.block === 'newcol' ? '個搭配' : '句'}`);
}
function exDel(id) { EXL = exList().filter(r => r.id !== id); exSave(); render(); }
function exClearDone() { const n = exList().filter(exDone).length; if (!n) return; EXL = exList().filter(r => !exDone(r)); exSave(); dnToast(`已移除 ${n} 筆已完成`); render(); }

/* ---------- 維護區：待辦分組（依詳解所在那一篇）與提示詞 ---------- */
function exGroups() {
  const by = new Map();
  exList().forEach(r => {
    if (exDone(r)) return; const o = exEntry(r.text); if (!o) return;
    const qid = idOf(o.a), g = by.get(qid) || { qid, a: o.a, ents: new Map() }; by.set(qid, g);
    const k = dnKey(o.e.text || o.e.word), it = g.ents.get(k) || { e: o.e, recs: [] }; g.ents.set(k, it); it.recs.push(r);
  });
  return Array.from(by.values()).sort((p, q) => p.a.week - q.a.week || p.a.day - q.a.day);
}
const exLost = () => exList().filter(r => !exEntry(r.text));
function exItems(g) { // [{ e, text, us:[{ blk, key, lab, recs, ens }] }]
  return Array.from(g.ents.values()).map(it => {
    const us = [];
    it.recs.forEach(r => {
      let u = us.find(q => q.blk === r.block && exSame(q.key, r.key));
      if (!u) { const tg = exTarget(r); u = { blk: r.block, key: r.key, lab: r.lab, recs: [], ens: tg ? tg.ens : [] }; us.push(u); }
      u.recs.push(r);
    });
    return { e: it.e, text: String(it.e.text || it.e.word), us };
  });
}
function exPrompt(g, rng) {
  const x = g.a, lv = x.level || {}, sc = lv.score || 600, all = exItems(g), its = rng ? all.slice(rng[0], rng[1]) : all;
  const items = its.map((it, i) => {
    const e = it.e, head = [e.ipa, e.pos, e.zh].filter(Boolean).join(' ');
    return `${i + 1}. text="${it.text}"｜type=${e.type || (/\s/.test(it.text) ? 'phrase' : 'word')}${head ? `｜本字：${head}` : ''}\n` + it.us.map(u => {
      const cfg = EX_BLK[u.blk], kj = JSON.stringify(Object.assign({ block: u.blk }, u.key));
      if (cfg.add) { // 新增搭配：AI 要補 phrase／zh／（單字才要）ipa／例句
        const ml = u.recs.map(r => r.mode === 'manual' ? `      【手動輸入搭配】[id=${r.id}]："${r.en}"` : `      【請 AI 新增 ${r.n} 個搭配】[id=${r.id}]`), nA = u.recs.filter(r => r.mode === 'ai').reduce((s, r) => s + (r.n || 0), 0);
        return `   ▸ 常用搭配（新增，block 固定為 "newcol"）\n      現有搭配（不要重複）：${u.ens.length ? u.ens.join(' ／ ') : '（無）'}\n${ml.join('\n')}${nA ? `\n      → AI 新增合計 ${nA} 個搭配` : ''}`;
      }
      const lines = u.recs.map(r => r.mode === 'manual' ? `      【手動輸入】[id=${r.id}]："${r.en}"` : `      【請 AI 新增 ${r.n} 句】[id=${r.id}]`);
      const nAi = u.recs.filter(r => r.mode === 'ai').reduce((s, r) => s + (r.n || 0), 0);
      return `   ▸ ${cfg.name}${cfg.direct ? '區塊（新句子直接接在這個區塊最後面）' : '用法'}：${kj}\n      現有句子（不要重複）：${u.ens.length ? u.ens.join(' ／ ') : '（無）'}\n${lines.join('\n')}${nAi ? `\n      → AI 新增合計 ${nAi} 句` : ''}`;
    }).join('\n');
  }).join('\n');
  const tmpl = `{ "week": ${x.week}, "day": ${x.day}, "extra_vocab": [ { "text": "（與項目完全相同）", "example_add": [ { "block": "pos_uses", "pos": "n.", "zh": "（照抄上面的用法）", "examples": [ { "en": "…", "zh": "…" } ] }, { "block": "collocations", "phrase": "（照抄）", "examples": [ { "en": "…", "zh": "…" } ] }, { "block": "examples", "examples": [ { "en": "…", "zh": "…" } ] } ], "collocation_add": [ { "phrase": "…", "ipa": "（搭配只是單字才要）", "zh": "…", "example": { "en": "…", "zh": "…" } } ], "ex_done": [ { "id": "（待辦的 id）", "result": "added" } ] } ] }`;
  return [
    '你是 TOEIC 英語教材編輯。下面的單字／片語／句子「已經有詳解」，使用者想在某些用法底下「多加例句」。這次不要重寫詳解，只輸出要追加的例句；程式會把它們接在現有內容的最後面，不會改動既有句子。',
    '',
    `【程度】多益約 ${sc} 分${lv.cefr ? `（CEFR ${lv.cefr}）` : ''}`,
    '',
    '【規則】',
    `- 例句 8–15 字、商務情境、多益約 ${sc} 分的程度：用字與句型不要超過這個程度，不要用罕見字；中文一律繁體。`,
    '- 每句例句必須「真的用到那個用法」：詞性例句要用該詞性、多義例句要用該意思、搭配例句要用該搭配、屈折變化／相關字／近義片語的例句要用該字或片語本身。',
    '- 【手動輸入】是使用者自己打的句子（可能是語音輸入，會有錯字）。請檢查英文：拼字、文法、自然度、是否真的用到該用法。大致正確就保留原句（不要為了風格改寫）；有錯就改成正確的一句放進 examples；完全不通或與該用法無關，就不要放進 examples，ex_done 填 unclear。每一句都要補上繁體中文翻譯 zh。',
    '- 【請 AI 新增 N 句】：寫剛好 N 句新的例句，彼此情境不同（會議、郵件、出差、訂單…），不要和「現有句子」或這次其他句子重複。沒有數量上限，使用者要幾句就寫幾句。',
    '- 同一個用法同時有手動輸入與 AI 新增時，全部放進同一個 example_add 物件的 examples 陣列（手動輸入的在前）。',
    '- 英文句子重複的，程式合併時會自動略過；請盡量不要重複。',
    '- 【手動輸入搭配】是使用者自己打的搭配（可能有錯字）：檢查拼字與是否是自然、多益常見的搭配；大致正確就保留原樣，有錯就改成正確的說法；完全不是搭配或不通，就不要放進 collocation_add，ex_done 填 unclear。【請 AI 新增 N 個搭配】：寫剛好 N 個多益常見、商務情境的新搭配，不要和「現有搭配」重複，也不要自己湊數（真的沒有合適的就少寫，ex_done 填 covered）。',
    '- 每個新搭配都要有：phrase（英文）、zh（繁體中文意思）、example（en＋zh，8–15 字、商務情境，必須真的用到這個搭配，且不要和該字現有句子重複）；搭配本身若只是單字（沒有空格）要加美式 ipa，片語不用。新搭配放進 collocation_add（block 為 newcol 的項目不要放進 example_add）。',
    '',
    '【要處理的項目】（text 必須與下面完全相同；用法的 block、pos、zh、phrase、w、label 要「逐字照抄」下面標示的 JSON，程式靠它們找到要加在哪一筆）',
    items,
    '',
    '【輸出規則】',
    '- 每個項目輸出一筆 { "text", "example_add", "collocation_add", "ex_done" }；除了 text、example_add、collocation_add、ex_done 這四個欄位不要出現任何其他欄位（zh、ipa、examples、collocations… 出現了合併時會被擋下）；沒有新增搭配的項目不要輸出 collocation_add；沒有要追加例句的項目不要輸出 example_add（只新增搭配時，只要 text、collocation_add、ex_done）。',
    '- example_add 每個用法一筆：{ "block": "…", 照抄的 pos＋zh（或 phrase、或 w）, "examples": [ { "en": "…", "zh": "…" } ] }；block 是 examples 或 paraphrase 時只要 block 與 examples。',
    '- ex_done：每個待辦 id 各一筆 { "id": "（照抄）", "result": "added｜covered｜unclear" }。added＝已寫進 examples（手動句檢查後保留或改正，或 AI 已新增）；covered＝與現有句子重複或不需要新增，沒有放進 examples；unclear＝句子看不懂或與用法無關，沒有處理。',
    '',
    '【輸出格式】',
    `請直接產生一個「可下載的 JSON 檔案」，檔名 w${x.week}d${x.day}_extra.json（UTF-8、純 JSON，不要包 markdown 程式碼框）。聊天裡只需一句話說明檔案已產生，不要貼出全文。若你無法產生檔案，才改成只輸出一個 json 程式碼區塊（${FENCE}json … ${FENCE}），區塊外不加任何文字。內容是單一物件，extra_vocab 依上面項目順序、每項一筆；不要輸出文章的其他欄位。檔案內容格式：`,
    FENCE + 'json', tmpl, FENCE
  ].join('\n');
}
function exPromptFor(qid, mode) { // mode：copy＝依「每批最多」分批；download＝整篇全部
  const g = exGroups().find(q => q.qid === qid); if (!g) return null;
  const its = exItems(g);
  if (mode === 'download') return { text: exPrompt(g, null), msg: '' };
  const b = dnBatchPick('ex:' + qid, its.map(o => o.text + o.us.map(u => u.recs.map(r => r.id).join('+')).join(',')).join('|'), its.length);
  return { text: exPrompt(g, b.nb > 1 ? [b.lo, b.hi] : null), msg: b.nb > 1 ? dnBatchMsg(b, b.hi - b.lo) : '已複製例句追加提示詞，貼給 AI' };
}
function exCopy(qid) { const p = exPromptFor(qid, 'copy'); if (!p) return; auCopy(p.text); dnToast(p.msg); }
function exDownload(qid) {
  const p = exPromptFor(qid, 'download'), g = exGroups().find(q => q.qid === qid); if (!p) return;
  dnDownload(`w${g.a.week}d${g.a.day}_example_add_prompt.txt`, p.text, 'text/plain;charset=utf-8'); dnToast('已下載提示詞（整篇全部，不分批）');
}
function exSec() { // 掛在「入庫彙整」頁與「新單字」頁
  const gs = exGroups(), lost = exLost(), done = exList().filter(exDone), n = exList().length - done.length - lost.length;
  if (!gs.length && !lost.length && !done.length) return '';
  const recHtml = r => `<div class="flex items-start gap-1.5 text-xs"><span class="shrink-0">${r.mode === 'manual' ? '✍' : '🤖'}</span><span class="break-words">${r.mode === 'manual' ? `手動輸入：${esc(r.en)}` : `請 AI 新增 ${r.n} ${r.block === 'newcol' ? '個搭配' : '句'}`}</span><button onclick="exDel('${r.id}')" class="text-slate-400 hover:text-rose-600 shrink-0" title="取消這一筆">✕</button></div>`;
  let h = `<section class="${card} p-4 mb-4"><h3 class="font-bold text-sm">➕ 例句追加 <span class="text-xs font-normal text-slate-400">${n}</span></h3>
    <p class="text-xs text-slate-500 mt-1 leading-relaxed">在詳解頁各用法後面按「＋ 例句」加進來的待辦（手動輸入的句子與「請 AI 新增 N 句」）。複製或下載提示詞給 AI：手動輸入的句子由 AI 檢查並補中文翻譯，AI 回傳只追加的 JSON（存成 <code>w?d?_extra.json</code>），用 json_merge.py 合併後，句子就會顯示在該用法底下；英文重複的會自動略過。</p><div class="mt-2">${dnCapCtl()}</div>`;
  gs.forEach(g => {
    const its = exItems(g);
    h += `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><div class="flex flex-wrap items-center justify-between gap-2"><button onclick="dnGoArt('${g.qid}')" class="font-bold text-sm text-indigo-600 dark:text-indigo-400 underline cursor-pointer">${esc(dnArtLabel(g.qid))}</button><div class="flex gap-1.5"><button onclick="exCopy('${g.qid}')" class="${btn} ${dnPri} !py-1 !px-2.5 text-xs">複製 AI 提示詞（${its.length}${dnCapTag(its.length)}）</button><button onclick="exDownload('${g.qid}')" class="${btn} ${dnLine} !py-1 !px-2.5 text-xs">下載提示詞</button></div></div>
      <div class="mt-2 space-y-2">${its.map(it => `<div><button onclick="dnOpenExtra('${g.qid}',this.dataset.t)" data-t="${esc(it.text)}" class="font-bold text-xs underline decoration-dotted cursor-pointer">${esc(it.text)}</button>${it.us.map(u => `<div class="ml-2 mt-1"><div class="text-[0.6875rem] text-slate-500">${esc(EX_BLK[u.blk].name)}${u.lab && !EX_BLK[u.blk].direct ? '：' + esc(u.lab.replace(/^[^：]*：/, '')) : ''}</div>${u.recs.map(recHtml).join('')}</div>`).join('')}</div>`).join('')}</div></div>`;
  });
  if (lost.length) h += `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800"><p class="text-xs text-rose-600">找不到這些字的詳解（可能已被刪除），可以取消：</p>${lost.map(r => `<div class="flex items-center gap-1.5 text-xs mt-1"><b>${esc(r.text)}</b> ${esc(r.lab || '')}<button onclick="exDel('${r.id}')" class="text-slate-400 hover:text-rose-600" title="取消">✕</button></div>`).join('')}</div>`;
  if (done.length) h += `<div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"><p class="text-xs text-emerald-700 dark:text-emerald-400">✔ 已完成（已合併進 daily.json）${done.length} 筆</p><button onclick="exClearDone()" class="${btn} !py-1 !px-2.5 text-xs bg-emerald-600 text-white hover:bg-emerald-700">移除已完成</button></div>`;
  return h + '</section>';
}
