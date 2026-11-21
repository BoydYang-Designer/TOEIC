/* groups.js — TOEIC Daily Coach 的「🔗 深入詳解」（單字組）
   載入順序：audio.js → timing.js → speak.js → notes.js → newwords.js → groups.js → tsl.js → daily.js
   依賴（執行時才用到）：daily.js／notes.js 的 esc／card／btn／main／cur／render／find／idOf／isLib／DATA／auCopy／
   dnKey／dnId／dnArr／dnArt／dnArts／dnFindExtraAny／dnDetailData／dnModal／dnClose／dnToast／dnNav／dnLine／dnPri／dnInp／dnSm／dnChip

   【第 1 階段】待辦資料 + 建立／編輯視窗 + 維護頁「複製提示詞」。
   資料：localStorage 鍵 toeicGroupTodoV1（以 toeic 開頭 → cloud-sync.js 自動同步；每筆有 id 與 t → 兩台裝置都有新增時依 id 自動合併）
     { id:'g…', start, seeds:[{ w, src:'confusable|similar|family|user' }], ai:true|false, note, score, qid, created, updated, t }
     id 在建立待辦時產生、之後不改；AI 回傳的組 JSON 要照抄這個 id（存成 {id}_group.json）。
   完成判斷（gpIsDone）：word_groups 裡有同 id 的組，且「起點字 + 指定的種子字」都在 members 裡。
   word_groups 由第 3 階段從 daily.json 載入（全域 WORD_GROUPS）；沒有載入前，所有待辦都是「待生成」。 */

const GP_KEY = 'toeicGroupTodoV1';
const GP_SRC = { confusable: '易混淆', similar: '近義', family: '相關字', user: '自己加' };
let GPL = null, GPD = null; // GPL＝待辦清單快取；GPD＝視窗裡正在編輯的草稿
const gpList = () => { if (GPL) return GPL; try { GPL = JSON.parse(localStorage.getItem(GP_KEY) || '[]'); } catch (e) { GPL = []; } if (!Array.isArray(GPL)) GPL = []; return GPL; };
const gpSave = () => { try { localStorage.setItem(GP_KEY, JSON.stringify(gpList())); } catch (e) {} };
const gpTouch = t => { t.updated = Date.now(); t.t = t.updated; };

/* ---------- 組（第 3 階段才會真的有資料） ---------- */
const gpGroups = () => (typeof WORD_GROUPS !== 'undefined' && Array.isArray(WORD_GROUPS)) ? WORD_GROUPS : [];
const gpMemberWords = g => dnArr(g && g.members).map(m => typeof m === 'string' ? m : (m && (m.w || m.word)) || '').filter(Boolean);
const gpGroupOf = text => { const k = dnKey(text); return gpGroups().find(g => gpMemberWords(g).some(m => dnKey(m) === k)) || null; };
const gpWanted = t => [t.start].concat((t.seeds || []).map(s => s.w)); // 這筆待辦「指定」的字
function gpIsDone(t) {
  const g = gpGroups().find(q => q.id === t.id); if (!g) return false;
  const have = new Set(gpMemberWords(g).map(dnKey));
  return gpWanted(t).every(w => have.has(dnKey(w)));
}
const gpTodoOf = text => { const k = dnKey(text); return gpList().find(t => !gpIsDone(t) && gpWanted(t).some(w => dnKey(w) === k)) || null; };
function gpCounts() { const L = gpList(), done = L.filter(gpIsDone).length; return { all: L.length, todo: L.length - done, done }; }

/* ---------- 詳解頁：易混淆區塊下方的入口列 ---------- */
function gpBar(e) {
  if (!e || e.type === 'sentence') return '';
  const g = gpGroupOf(e.text), t = g ? null : gpTodoOf(e.text);
  const b = (fn, label, pri) => `<button onclick="${fn}" class="text-xs rounded-lg px-2.5 py-1.5 cursor-pointer ${pri ? dnPri : dnLine + ' hover:bg-slate-100 dark:hover:bg-slate-800'}">${label}</button>`;
  let inner;
  if (g) inner = b(`gpViewGroup('${esc(g.id)}')`, '查看深入詳解', true) + b(`gpExpand('${esc(g.id)}')`, '擴充這組');
  else if (t) inner = `<span class="${dnChip} bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">待生成</span>` + b(`gpEdit('${esc(t.id)}')`, '編輯待辦', true);
  else inner = b('gpStart()', '加入深入詳解', true);
  return `<section class="${card} p-3 md:p-4 mb-3 flex flex-wrap items-center gap-2"><h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">深入詳解</h3>${inner}</section>`;
}
function gpViewGroup(id) { if (typeof dnNav === 'function' && typeof gpRenderGroup === 'function') { cur.gid = id; dnNav('group'); } else dnToast('組頁面在第 3 階段才會完成'); }
function gpExpand(id) { dnToast('「擴充這組」在第 4 階段才會完成'); }

/* ---------- 建立／編輯視窗 ---------- */
function gpSeedsOf(e, start) { // 預填：該字現有的易混淆、近義、相關字（去重、排除起點字自己）
  const seen = new Set([dnKey(start)]), out = [];
  const add = (w, src) => { w = String(w || '').replace(/\s+/g, ' ').trim(); if (!w || /[\u4e00-\u9fff]/.test(w)) return; const k = dnKey(w); if (seen.has(k)) return; seen.add(k); out.push({ w, src, on: true }); };
  dnArr(e.confusable).forEach(o => add(typeof o === 'string' ? o : o && (o.word || o.phrase), 'confusable'));
  dnArr(e.similar).forEach(o => add(typeof o === 'string' ? o : o && (o.phrase || o.word), 'similar'));
  dnArr(e.family).forEach(o => add(typeof o === 'string' ? o : o && o.w, 'family'));
  return out;
}
function gpScoreOf(D) { // 預設程度＝起點字所在文章的分數（字庫沒有文章 → 600）
  const pick = a => a && a.level && Number(a.level.score);
  return pick(D.x) || pick(D.src) || 600;
}
function gpStart() { // 詳解頁「加入深入詳解」
  const D = typeof dnDetailData === 'function' ? dnDetailData() : null; if (!D) return;
  const text = D.e.text, g = gpGroupOf(text); if (g) { dnToast('已在深入詳解'); return; }
  const t = gpTodoOf(text); if (t) { gpEdit(t.id); return; }
  GPD = { id: null, qid: idOf(D.x), start: text, seeds: gpSeedsOf(D.e, text), ai: true, note: '', score: gpScoreOf(D) };
  gpModal();
}
function gpEdit(id) {
  const t = gpList().find(q => q.id === id); if (!t) return;
  const old = new Set((t.seeds || []).map(s => dnKey(s.w)));
  let extra = []; // 重新帶出「目前詳解裡有、但沒被選」的字，方便補選
  try { const x = dnArt(t.qid), e = dnFindExtraAny(x || dnArts()[0], t.start); if (e) extra = gpSeedsOf(e, t.start).filter(s => !old.has(dnKey(s.w))).map(s => Object.assign(s, { on: false })); } catch (err) {}
  GPD = { id: t.id, qid: t.qid, start: t.start, seeds: (t.seeds || []).map(s => ({ w: s.w, src: s.src || 'user', on: true })).concat(extra), ai: !!t.ai, note: t.note || '', score: t.score || 600 };
  gpModal();
}
function gpSync() { // 把輸入框的值收回草稿（重畫視窗前一定要先呼叫）
  if (!GPD) return;
  const v = id => { const el = document.getElementById(id); return el ? el.value : null; }, c = document.getElementById('gp-ai');
  if (c) GPD.ai = c.checked;
  const n = v('gp-note'); if (n !== null) GPD.note = n;
  const s = v('gp-score'); if (s !== null) GPD.score = s;
}
function gpModal() {
  const d = GPD; if (!d) return;
  const rows = d.seeds.map((s, i) => `<li class="flex items-center gap-2 py-1"><label class="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"><input type="checkbox" ${s.on ? 'checked' : ''} onchange="gpSeedOn(${i},this.checked)" class="w-4 h-4"><b class="break-words">${esc(s.w)}</b><span class="${dnChip}">${GP_SRC[s.src] || '自己加'}</span></label>${s.src === 'user' ? `<button onclick="gpSeedDel(${i})" class="text-slate-400 hover:text-rose-500 text-lg leading-none cursor-pointer" aria-label="移除">×</button>` : ''}</li>`).join('');
  dnModal(`<div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">🔗 ${d.id ? '編輯' : '加入'}深入詳解</h2><button onclick="dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <p class="text-xs text-slate-500 mb-1">起點字</p><p class="text-lg font-bold mb-3 break-words">${esc(d.start)}</p>
    <p class="text-xs text-slate-500 mb-1">種子清單（勾選的字會一起進這一組；沒勾的不處理）</p>
    <ul class="text-sm mb-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1">${rows || '<li class="text-xs text-slate-500 py-2">這個字目前沒有易混淆、近義或相關字，可以在下面自己加。</li>'}</ul>
    <div class="flex gap-2 mb-3"><input id="gp-new" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="自己加一個字（英文）" class="${dnInp} flex-1" onkeydown="if(event.key==='Enter'){event.preventDefault();gpSeedAdd()}"><button onclick="gpSeedAdd()" class="${btn} ${dnLine}">加入</button></div>
    <label class="flex items-start gap-2 text-sm mb-3 cursor-pointer"><input id="gp-ai" type="checkbox" ${d.ai ? 'checked' : ''} class="w-4 h-4 mt-0.5"><span>允許 AI 自行增加同組的字<span class="block text-xs text-slate-500">勾選：AI 可再補上最多 4 個容易混淆的字（會標「AI 加入」，合併時你可以取消勾選）。不勾：只處理上面指定的字。</span></span></label>
    <label class="block text-xs text-slate-500 mb-1">你的備註（選填，例如想特別釐清哪兩個字）</label><textarea id="gp-note" rows="3" class="${dnInp} mb-3">${esc(d.note)}</textarea>
    <label class="block text-xs text-slate-500 mb-1">程度分數（預設＝起點字所在文章的分數）</label><input id="gp-score" type="number" min="300" max="990" step="50" value="${esc(d.score)}" class="${dnInp} mb-4" inputmode="numeric">
    <div class="flex justify-between gap-2">${d.id ? `<button onclick="gpDel('${esc(d.id)}')" class="${btn} text-rose-500">移除待辦</button>` : '<span></span>'}<button onclick="gpSaveDraft()" class="${btn} ${dnPri}">${d.id ? '儲存' : '建立待辦'}</button></div></div>`);
}
function gpSeedOn(i, on) { if (GPD && GPD.seeds[i]) GPD.seeds[i].on = !!on; }
function gpSeedDel(i) { gpSync(); if (GPD) { GPD.seeds.splice(i, 1); gpModal(); } }
function gpSeedAdd() {
  gpSync(); if (!GPD) return;
  const el = document.getElementById('gp-new'), w = String((el && el.value) || '').replace(/\s+/g, ' ').trim();
  if (!w) return;
  if (!/[A-Za-z]/.test(w) || /[\u4e00-\u9fff]/.test(w) || w.length > 40) { dnToast('請輸入英文單字或短片語'); return; }
  const k = dnKey(w);
  if (k === dnKey(GPD.start)) { dnToast('這是起點字本身'); return; }
  const dup = GPD.seeds.find(s => dnKey(s.w) === k);
  if (dup) { dup.on = true; gpModal(); dnToast('已經在清單裡，已幫你勾選'); return; }
  const g = gpGroupOf(w); if (g && !confirm('「' + w + '」已經在另一組深入詳解裡了，還是要加進這個待辦嗎？')) return;
  GPD.seeds.push({ w, src: 'user', on: true }); gpModal();
}
function gpSaveDraft() {
  gpSync(); const d = GPD; if (!d) return;
  const seeds = d.seeds.filter(s => s.on).map(s => ({ w: s.w, src: s.src }));
  if (!seeds.length && !d.ai) { dnToast('請至少勾選一個種子字，或勾選「允許 AI 自行增加」'); return; }
  const sc = Math.min(990, Math.max(300, Math.round((Number(d.score) || 600) / 50) * 50)), note = String(d.note || '').trim();
  if (d.id) {
    const t = gpList().find(q => q.id === d.id); if (!t) return dnClose();
    Object.assign(t, { seeds, ai: !!d.ai, note, score: sc }); gpTouch(t);
  } else {
    const now = Date.now();
    gpList().push({ id: dnId('g'), start: d.start, seeds, ai: !!d.ai, note, score: sc, qid: d.qid, created: now, updated: now, t: now });
  }
  gpSave(); GPD = null; dnClose(); dnToast(d.id ? '已更新待辦' : '已建立待辦（到「維護 → 🔗 深入詳解」複製提示詞）'); render();
}
function gpDel(id) {
  const t = gpList().find(q => q.id === id); if (!t) return;
  if (!gpIsDone(t) && !confirm('「' + t.start + '」的深入詳解還沒完成，確定要移除待辦嗎？')) return;
  GPL = gpList().filter(q => q.id !== id); gpSave(); GPD = null; dnClose(); render();
}

/* ---------- 提示詞 ---------- */
const GP_SCHEMA = `{
  "id": "（照抄上面的 id，不要改）",
  "title": "繁體中文標題，例如「稱讚與好評類字詞」",
  "core": "一到兩句繁體中文：這組字共同的核心意思，以及為什麼容易搞混",
  "level": { "score": 650 },
  "start": "（起點字）",
  "requested": ["（起點字）", "（你指定的每一個種子字）"],
  "members": [
    { "w": "claim", "pos": "v./n.", "ipa": "/kleɪm/", "zh": "主張、索賠" },
    { "w": "acclaim", "pos": "n.", "ipa": "/əˈkleɪm/", "zh": "讚譽", "added_by": "ai" }
  ],
  "clusters": [ { "name": "分群名稱", "words": ["claim"], "note": "這群字的共通點，一句話" } ],
  "cards": [ { "w": "claim", "diff": "一句話：和同組其他字最關鍵的差異", "use": "常見搭配與用法", "example": { "en": "…", "zh": "…" }, "trap": "（選填）最容易用錯的地方" } ],
  "compare": { "cols": ["字", "詞性", "語氣／用途", "常見搭配"], "rows": [ { "w": "claim", "cells": ["v./n.", "…", "…"] } ] },
  "decisions": [ { "q": "遇到什麼情況時要選哪一個？（判斷問題）", "pick": [ { "if": "條件", "w": "claim" } ] } ],
  "pairs": [ { "a": "claim", "b": "acclaim", "diff": "這一對最容易搞混的地方", "examples": [ { "w": "claim", "en": "…", "zh": "…" }, { "w": "acclaim", "en": "…", "zh": "…" } ] } ],
  "toeic_traps": [ { "w": "claim", "trap": "多益考題裡常見的陷阱", "example": { "en": "…", "zh": "…" } } ]
}`;
function gpPrompt(t) {
  const sc = t.score || 600, seeds = (t.seeds || []).map(s => s.w);
  let ex = null; try { ex = dnFindExtraAny(dnArt(t.qid) || dnArts()[0], t.start); } catch (e) {}
  const info = ex ? `｜現有詳解：${[ex.pos, ex.zh].filter(Boolean).join(' ')}` : '';
  const total = 1 + seeds.length;
  return [
    '你是 TOEIC 英語教材編輯。請把下面這些「容易搞混的字」整理成一組「深入詳解」。結果會存成 JSON，合併進 daily.json 最上層的 word_groups，網頁會用來顯示「深入辨析」頁。',
    '',
    `【這組的 id】${t.id}（回傳的 JSON 裡 id 必須一字不改；我會把你的回覆存成 ${t.id}_group.json）`,
    `【起點字】${t.start}${info}`,
    `【我指定的字（${seeds.length} 個）】${seeds.length ? seeds.join('、') : '（沒有，請你依起點字挑選）'}`,
    t.ai ? `【AI 自行增加】允許。若有真正容易和上面這些字搞混、而我沒列出的字，可以再補最多 4 個，每個都在 members 加 "added_by": "ai"；沒有就不要硬湊。整組（含我指定的）最多 8 個字。` : `【AI 自行增加】不允許。members 只能放起點字與我指定的字，共 ${total} 個，不要增加或減少。`,
    t.note ? `【我的備註】${t.note}` : null,
    `【程度】多益約 ${sc} 分`,
    '',
    '【程度規則（很重要）】',
    `- 說明、例句都要控制在多益約 ${sc} 分的程度：用字與句型不要超過這個程度；例句 8–15 字、商務情境、不要用罕見字。`,
    '- 中文一律繁體；音標用美式 IPA（含斜線）。',
    '- 沒有內容的欄位直接省略，不要寫空字串或 null；選填欄位沒有必要就不要寫。',
    '',
    '【內容規則】',
    '- requested 放起點字加上我指定的每一個字（不含你自己增加的）。members 必須包含 requested 的每一個字。',
    '- cards、clusters、compare、decisions、pairs、toeic_traps 裡出現的每個字，都必須是 members 裡的字（拼法一致）。',
    '- 每一個 example／examples 的 en 都必須真的包含它標示的那個字（w）；可以是 -s／-ed／-ing 等變化形，但不要用同義詞替代。',
    '- cards：每個 member 一張，diff 要點出「和同組其他字」的關鍵差異，不要只重述字義。',
    '- clusters：把意思或用法相近的字分群，每個字至少屬於一群；只有一群也可以。',
    '- compare：欄位 cols 的第一欄固定是「字」；每一列 cells 的數量 ＝ cols 的數量 − 1。',
    '- decisions：2–4 題「遇到什麼情況選哪個字」的判斷問題，pick 的每個選項都指向一個 member。',
    '- pairs：只挑最容易搞混的 1–4 對，不要把所有組合都列出來。',
    '- toeic_traps：只寫多益（Part 5／Part 6）真的會出現的陷阱，沒有就省略整個欄位。',
    '',
    '【輸出】只輸出 JSON，放在單一 json 程式碼區塊內，區塊外不加任何說明文字。輸出「一個」物件（就是這一組），格式如下（欄位示意，請依內容增減）：',
    '```json',
    GP_SCHEMA,
    '```'
  ].filter(l => l !== null).join('\n');
}
function gpCopy(id) {
  const t = gpList().find(q => q.id === id); if (!t) return;
  auCopy(gpPrompt(t)); dnToast('已複製提示詞，貼給 AI；回傳存成 ' + t.id + '_group.json');
}

/* ---------- 維護頁：🔗 深入詳解 ---------- */
function gpRender() {
  const L = gpList().slice().sort((a, b) => (b.t || 0) - (a.t || 0)), c = gpCounts();
  const rows = L.map(t => {
    const done = gpIsDone(t), seeds = (t.seeds || []).map(s => `<span class="${dnChip}">${esc(s.w)}</span>`).join(' ');
    return `<div class="${card} p-3 md:p-4 mb-3"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><b class="text-lg break-words">${esc(t.start)}</b><span class="${dnChip} ${done ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}">${done ? '已完成' : '待生成'}</span><span class="text-xs text-slate-500">約 ${esc(t.score || 600)} 分・${t.ai ? '允許 AI 增加' : '只處理指定的字'}</span></div>
      <p class="text-sm mt-2 leading-8">${seeds || '<span class="text-xs text-slate-500">（沒有指定種子字，由 AI 挑選）</span>'}</p>
      ${t.note ? `<p class="text-xs text-slate-500 mt-1 whitespace-pre-line">備註：${esc(t.note)}</p>` : ''}
      <p class="text-[0.6875rem] text-slate-400 mt-1">id：<code>${esc(t.id)}</code>　→ 回傳存成 <code>${esc(t.id)}_group.json</code></p></div></div>
      <div class="flex flex-wrap gap-2 mt-3">${done ? '' : `<button onclick="gpCopy('${esc(t.id)}')" class="${btn} ${dnPri} !py-1.5 text-xs">複製提示詞</button>`}<button onclick="gpEdit('${esc(t.id)}')" class="${btn} ${dnLine} !py-1.5 text-xs">編輯</button><button onclick="gpDel('${esc(t.id)}')" class="${btn} text-rose-500 !py-1.5 text-xs">移除</button></div></div>`;
  }).join('');
  main.innerHTML = `<div class="flex items-start justify-between gap-2 mb-3"><div><h2 class="text-xl font-bold">🔗 深入詳解</h2><p class="text-xs text-slate-500 mt-1">待生成 ${c.todo}・已完成 ${c.done}</p></div><button onclick="up()" class="${btn} ${dnLine} !py-1.5 text-xs">← 返回</button></div>
    <p class="text-xs text-slate-500 leading-relaxed mb-4"><b>流程：</b>① 在字的詳解頁按「加入深入詳解」建立待辦 → ② 這裡按「複製提示詞」貼給 AI → ③ AI 回傳的 JSON 存成 <code>{id}_group.json</code>，放在 daily.json 同資料夾 → ④ 執行 json_merge.py 合併 → ⑤ 重新整理網頁，待辦就會變成「已完成」，可以按「移除」清掉。</p>
    ${rows || `<div class="${card} p-8 text-center text-sm text-slate-500">還沒有待辦。到任何一個字的詳解頁，在「深入詳解」列按「加入深入詳解」。</div>`}`;
}

/* ======================= ＋ 新增易混淆字（詳解頁「易混淆」標題旁的 ＋）=======================
   不新增補丁類型：沿用「新單字備註」流程。按 ＋ → 輸入要加的字，或按「🤖 請 AI 找易混淆字」（不輸入字，由 AI 依 5 類判斷）
   → 建一筆新單字（text＝目前這個字，附備註，cf:1、cfw:[字]；純 AI 尋找時 cfw 是空陣列、cfai:1）。
   到「🆕 新單字 → 待補充詳解」複製提示詞給 AI → 回傳存成 w{週}d{天}_extra.json → json_merge.py 合併（和原本的新單字補充一模一樣）。
   AI 處理完會回 nw_done，這筆就變「已更新」，待補充標示自然消失；AI 找不到合適的字時回 covered，同樣算處理完成。
   5 類（DN_KIND，定義在 notes.js）：spell 形似／sound 音似／meaning 義近／root 同字根／zhsame 中文同義。 */
const cfOwnText = e => String((e && (e.at || e.text)) || '').trim(); // 詳解那一筆的字（變化形詳解就是變化形本身）
const cfPending = e => { const k = dnKey(cfOwnText(e)); return nwList().filter(n => n.cf && dnKey(n.text) === k && !nwIsDone(n)); };
const cfCan = e => !!e && (e.type === 'word' || e.type === 'phrase');
function cfTitle(e) {
  return cfCan(e) ? `易混淆 <button onclick="cfOpen()" class="normal-case tracking-normal align-middle ml-1 w-6 h-6 inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-indigo-600 hover:border-indigo-400 text-sm leading-none cursor-pointer" aria-label="新增易混淆字" title="新增易混淆字">＋</button>` : '易混淆';
}
function cfEmpty(e) { // 放在易混淆清單前面：沒有任何易混淆字時的說明、以及「已加入、等 AI 補」的提示
  if (!cfCan(e)) return '';
  const pend = cfPending(e), has = dnArr(e.confusable).length;
  const ws = pend.map(n => (n.cfw || []).join('、') + (n.cfai ? ((n.cfw || []).length ? '＋' : '') + 'AI 依 5 類尋找' : '')).filter(Boolean);
  return (has ? '' : '<p class="text-xs text-slate-500">還沒有易混淆字。按上面的「＋」可以加。</p>')
    + (pend.length ? `<p class="text-xs text-amber-700 dark:text-amber-300 mb-2">⏳ 待 AI 補充：${esc(ws.join('、') || '（已加入）')}　<button onclick="dnNav('nw');nwTab('todo')" class="underline cursor-pointer">到 🆕 新單字 → 待補充詳解複製提示詞</button></p>` : '');
}
function cfOpen() {
  const D = typeof dnDetailData === 'function' ? dnDetailData() : null; if (!D || !cfCan(D.e)) return;
  dnModal(`<div class="${card} w-full max-w-lg p-4 md:p-5"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">＋ 新增易混淆字</h2><button onclick="dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <p class="text-xs text-slate-500 mb-1">加在這個字的易混淆裡</p><p class="text-lg font-bold mb-3 break-words">${esc(cfOwnText(D.e))}</p>
    <label class="block text-xs text-slate-500 mb-1">要加入的易混淆字（英文；一次加多個用逗號隔開；想讓 AI 自己找可以留空）</label><input id="cf-w" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="例如 claim, applaud" class="${dnInp} mb-3" onkeydown="if(event.key==='Enter'){event.preventDefault();cfSave()}">
    <p class="text-xs text-slate-500 mb-1">這些字和它的關係（選填，可複選；不確定就不勾，讓 AI 判斷。按「🤖 請 AI 找易混淆字」時，勾哪幾類就只找那幾類，都不勾＝5 類全找）</p>
    <div class="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-sm">${Object.keys(DN_KIND).map(k => `<label class="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" data-cfk="${k}" class="w-4 h-4">${DN_KIND[k]}</label>`).join('')}</div>
    <label class="block text-xs text-slate-500 mb-1">備註（選填，例如想特別釐清哪裡）</label><textarea id="cf-n" rows="3" class="${dnInp} mb-3"></textarea>
    <p class="text-xs text-slate-500 leading-relaxed mb-4">按「加入」或「🤖 請 AI 找」後，到「🆕 新單字 → 待補充詳解」複製 AI 提示詞，AI 回傳存成 <code>w{週}d{天}_extra.json</code>，再用 json_merge.py 合併。AI 會從這 5 類去想，沒有合適的字就不會硬加。</p>
    <div class="flex flex-wrap justify-end gap-2"><button onclick="cfSave(1)" class="${btn} ${dnLine}" title="不用輸入字，請 AI 依勾選的類別（沒勾＝5 類全找）找；沒有就不加">🤖 請 AI 找易混淆字</button><button onclick="cfSave()" class="${btn} ${dnPri}">加入</button></div></div>`);
  setTimeout(() => { const el = document.getElementById('cf-w'); if (el) el.focus(); }, 50);
}
function cfNote(own, ws, remark, kinds) {
  return `請在「${own}」的易混淆（confusable）新增：${ws.map(w => `「${w}」`).join('、')}。` +
    `每個字先確認它是否真的容易和「${own}」搞混（拼法、發音或意思相近）：是的話，各加一筆 { word, diff, example }，diff 一句話說明和「${own}」的差異，example（en + zh）8–15 字、必須真的用到該易混淆字、並讓人看得出差異；差異在詞性或文法用法時才加 usage。` +
    `每一筆都要加 kind（分類，陣列，值見提示詞的 kind 說明）。` + (kinds.length ? `我認為它們和「${own}」的關係是：${kinds.map(k => DN_KIND[k] + '（' + k + '）').join('、')}，請確認；不對就照你的判斷。` : '') +
    `若它其實是「意思相近、可互換」的說法，改放近義片語（similar）並說明；若不適合放進任何一欄，就不要硬加。原有的易混淆項目一律保留。` +
    (remark ? `我的說明：${remark}` : '');
}
function cfNoteAI(own, ws, remark, kinds) { // 請 AI 依 5 類（或我勾選的幾類）自己找；沒有合適的就不要加
  const use = kinds.length ? kinds : Object.keys(DN_KIND);
  return `請替「${own}」找出容易混淆的字，放進易混淆（confusable）。` +
    (ws.length ? `我先指定：${ws.map(w => `「${w}」`).join('、')}（照一般規則確認後加入）。` : '') +
    `請依這幾類逐一思考：${use.map(k => DN_KIND[k] + '（' + k + '）').join('、')}。` +
    `每一類都要實際比對，不要只憑印象：sound（音似）請拿雙方的音標（IPA）比，開頭或結尾音節相同、重音位置相同、音節數相近都算音似；spell（形似）看字形；meaning（義近）看語氣、用法或搭配；root（同字根）看字根；zhsame（中文同義）看中文翻譯。` +
    `只要有明顯相似、而且是多益程度的常見字就列入，不必等到考試真的考過；只有完全看不出相似、或太冷僻的字才跳過，不要為了湊數硬加。都沒有就不要新增任何項目，nw_done 的 result 填 covered。` +
    `要加的字，每個各加一筆 { word, diff, kind, example }：diff 一句話說明和「${own}」的差異，kind 填它屬於哪幾類（陣列），example（en + zh）8–15 字、必須真的用到該字、並讓人看得出差異；差異在詞性或文法用法時才加 usage。` +
    `若它其實是意思相近、可互換的說法，改放近義片語（similar）。原有的易混淆項目一律保留，不要重複。` +
    (remark ? `我的說明：${remark}` : '');
}
function cfSave(ai) { // ai＝1：請 AI 依 5 類自己找（可以不輸入字）
  const D = typeof dnDetailData === 'function' ? dnDetailData() : null; if (!D || !cfCan(D.e)) return dnClose();
  const own = cfOwnText(D.e), ok = dnKey(own), have = new Set(dnArr(D.e.confusable).map(o => dnKey(typeof o === 'string' ? o : o && (o.word || o.phrase))));
  const raw = String((document.getElementById('cf-w') || {}).value || ''), remark = String((document.getElementById('cf-n') || {}).value || '').trim().replace(/\s+/g, ' ');
  const seen = new Set(), ws = [], skip = [];
  raw.split(/[,，、;；\n]+/).map(s => nwNormText(s)).filter(Boolean).forEach(w => {
    if (!/[A-Za-z]/.test(w) || /[\u4e00-\u9fff]/.test(w) || w.length > 40) { skip.push(w + '（請輸入英文）'); return; }
    const k = dnKey(w); if (k === ok) { skip.push(w + '（是它自己）'); return; }
    if (have.has(k)) { skip.push(w + '（已在易混淆）'); return; }
    if (seen.has(k)) return; seen.add(k); ws.push(w);
  });
  if (!ws.length && !ai) { dnToast(skip.length ? '沒有可加入的：' + skip.join('、') : '請先輸入要加入的字，或按「🤖 請 AI 找易混淆字」'); return; }
  const kinds = Array.from(document.querySelectorAll('[data-cfk]')).filter(c => c.checked).map(c => c.dataset.cfk), note = ai ? cfNoteAI(own, ws, remark, kinds) : cfNote(own, ws, remark, kinds);
  if (nwList().some(n => dnKey(n.text) === ok && String(n.note || '').trim() === note)) { dnToast('這個已經加過了，等 AI 補充'); return; }
  const now = Date.now();
  nwList().push({ id: dnId('n'), text: own, type: /\s/.test(own) ? 'phrase' : 'word', note, cf: 1, cfw: ws, ...(ai ? { cfai: 1 } : {}), created: now, updated: now, t: now, base: DATA.map(idOf) });
  nwSave(); dnClose();
  dnToast((ai ? '已請 AI 依 ' + (kinds.length ? kinds.map(k => DN_KIND[k]).join('、') : '5 ') + '類尋找' + (ws.length ? '，並加入：' + ws.join('、') : '') : '已加入：' + ws.join('、')) + (skip.length ? '（略過 ' + skip.join('、') + '）' : '') + '。到「🆕 新單字 → 待補充詳解」複製提示詞');
  render();
}


/* ======================= ＋ 補充詳解區塊（詳解頁「字」旁的 ＋）=======================
   和「易混淆」的 ＋ 同一套做法，不新增補丁類型：按 ＋ → 看這個字「缺哪些區塊」→ 勾要補的 → 建一筆新單字待辦（備註＝要 AI 補哪些區塊，sup:1、supk:[區塊]）。
   到「🆕 新單字 → 待補充詳解」複製提示詞給 AI → 回傳存成 w{週}d{天}_extra.json → json_merge.py 合併。AI 回 nw_done 後這筆就變「已更新」。
   缺的區塊只是列出來給你選，預設都不勾；不需要的（例如某個字本來就不需要文法說明）不勾就好。
   狀態：1＝有內容；2＝欄位存在但是空陣列（AI 當時已確認「沒有」）；0＝沒有這個欄位。 */
const spArr = f => e => { const a = e[f]; return Array.isArray(a) ? (a.length ? 1 : 2) : 0; };
const spStr = f => e => String(e[f] || '').trim() ? 1 : 0;
const SP_BLK = [
  { k: 'en', t: ['word', 'phrase'], lab: '英文解說 en', has: spStr('en'), ins: 'en（英文解說）：用同程度的簡單英文一句話解釋' },
  { k: 'grammar_note', t: ['word', 'phrase'], lab: '文法說明 grammar_note', has: spStr('grammar_note'), ins: 'grammar_note（文法說明）：我明確想要這個區塊，請寫出這個字最實用、最容易用錯的文法點（一到兩句繁體中文，具體、可直接套用，例如詞性與用法、可數或不可數、後面接的介系詞或句型）；只有真的完全沒有可說的，才不寫並在 nw_done 填 covered' },
  { k: 'pattern', t: ['phrase', 'sentence'], lab: '句型模板 pattern', has: spStr('pattern'), ins: 'pattern（句型模板）：抽成可重複使用的模板，可替換的部分用 V、N、時間、人物 等標示' },
  { k: 'pos_uses', t: ['word'], lab: '多詞性 pos_uses', has: spArr('pos_uses'), ins: 'pos_uses（多詞性）：每個常見詞性一筆，含 pos、ipa、zh、example；只有單一詞性就輸出 []' },
  { k: 'senses', t: ['word'], lab: '多義 senses', has: spArr('senses'), ins: 'senses（多義）：同詞性內不同意思，每筆含 pos、zh、en、example；只有單一意思就輸出 []' },
  { k: 'forms', t: ['word'], lab: '屈折變化 forms', has: spArr('forms'), ins: 'forms（屈折變化）：每筆含 w、label、pos、zh、ipa、example；沒有屈折變化就輸出 []' },
  { k: 'derived', t: ['word'], lab: '同字族 derived', has: spArr('derived'), ins: 'derived（衍生字）：每筆含 w、ipa、pos、zh、link（記憶連結）；沒有常見衍生字就輸出 []' },
  { k: 'collocations', t: ['word'], lab: '常用搭配 collocations', has: spArr('collocations'), ins: 'collocations（常用搭配）：2–5 個，每個都要有 phrase、zh 與自己的 example' },
  { k: 'examples', t: ['word', 'phrase', 'sentence'], lab: '例句 examples', has: spArr('examples'), ins: 'examples（例句）：每句 8–15 字、商務情境，加 tag 標示情境；不要與原有例句重複' },
  { k: 'confusable', t: ['word', 'phrase'], lab: '易混淆 confusable', has: spArr('confusable'), ins: 'confusable（易混淆）：依 spell／sound／meaning／root／zhsame 5 類逐一比對，每筆含 word（片語用 phrase）、diff、kind、example；沒有合適的字就不加，不要硬湊' },
  { k: 'similar', t: ['word', 'phrase'], lab: '近義片語 similar', has: spArr('similar'), ins: 'similar（近義片語）：每筆含 phrase（單字用 word）、diff、example；真的沒有就不加' },
  { k: 'family', t: ['word'], lab: '相關字 family', has: spArr('family'), ins: 'family（相關字）：最多 4 個，每個含 w、ipa、pos、zh、example' },
  { k: 'chunks', t: ['sentence'], lab: '意群斷句 chunks', has: spArr('chunks'), ins: 'chunks（意群斷句）：3–8 個意群，每筆 en＋zh；所有 en 依序接起來必須剛好等於整句' },
  { k: 'structure', t: ['sentence'], lab: '句型結構 structure', has: spStr('structure'), ins: 'structure（句型結構）：用一行拆解句型' },
  { k: 'grammar', t: ['sentence'], lab: '文法重點 grammar', has: spArr('grammar'), ins: 'grammar（文法重點）：1–3 個這句真正值得學的文法點，每筆 point＋explain（繁體中文、具體）' },
  { k: 'paraphrase', t: ['sentence'], lab: '同義改寫 paraphrase', has: spArr('paraphrase'), ins: 'paraphrase（同義改寫）：1–2 句，意思相同、換一種說法，每筆 en＋zh' },
  { k: 'key_words', t: ['sentence'], lab: '重點字詞 key_words', has: spArr('key_words'), ins: 'key_words（重點字詞）：2–5 個，每筆含 w、zh；單字還要 ipa、pos；沒有值得註記的就輸出 []' }
];
const spCan = e => !!e && (e.type === 'word' || e.type === 'phrase' || e.type === 'sentence');
const spBlocks = e => SP_BLK.filter(b => b.t.includes(e.type));
const spPending = e => { const k = dnKey(cfOwnText(e)); return nwList().filter(n => n.sup && dnKey(n.text) === k && !nwIsDone(n)); };
function spBtn(e) { // 放在詳解頁標題的字旁邊
  return spCan(e) ? `<button onclick="spOpen()" class="ml-1 w-7 h-7 inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 text-slate-500 hover:text-indigo-600 hover:border-indigo-400 text-base leading-none align-middle cursor-pointer" aria-label="補充詳解區塊" title="看這個字缺哪些區塊，補上去">＋</button>` : '';
}
function spBanner(e) { // 標題下方：已加入、等 AI 補的區塊
  if (!spCan(e)) return '';
  const pend = spPending(e); if (!pend.length) return '';
  const lab = {}; SP_BLK.forEach(b => { lab[b.k] = b.lab.replace(/ .*$/, ''); });
  const ks = [...new Set(pend.reduce((a, n) => a.concat(n.supk || []), []))].map(k => lab[k] || k);
  return `<p class="text-xs text-amber-700 dark:text-amber-300 mb-3">⏳ 待 AI 補充：${esc(ks.join('、') || '（已加入）')}　<button onclick="dnNav('nw');nwTab('todo')" class="underline cursor-pointer">到 🆕 新單字 → 待補充詳解複製提示詞</button></p>`;
}
function spOpen() {
  const D = typeof dnDetailData === 'function' ? dnDetailData() : null; if (!D || !D.ex || !spCan(D.e)) return;
  const e = D.e, bs = spBlocks(e), by = s => bs.filter(b => b.has(e) === s);
  const row = (b, m) => `<label class="flex items-start gap-2 text-sm py-1 cursor-pointer"><input type="checkbox" data-spk="${b.k}" data-spm="${m}" class="w-4 h-4 mt-0.5"><b>${esc(b.lab)}</b></label>`;
  const miss = by(0), conf = by(2), have = by(1);
  const sub = (t, arr, m, open) => arr.length ? `<details class="mb-3" ${open ? 'open' : ''}><summary class="text-xs text-slate-500 cursor-pointer select-none mb-1">${t}（${arr.length}）</summary>${arr.map(b => row(b, m)).join('')}</details>` : '';
  dnModal(`<div class="${card} w-full max-w-lg p-4 md:p-5 max-h-[90vh] overflow-y-auto"><div class="flex items-center justify-between mb-3"><h2 class="font-bold">＋ 補充詳解區塊</h2><button onclick="dnClose()" class="text-slate-400 hover:text-slate-600 text-xl leading-none cursor-pointer" aria-label="關閉">×</button></div>
    <p class="text-lg font-bold mb-1 break-words">${esc(cfOwnText(e))}</p>
    <p class="text-xs text-slate-500 mb-3">下面列出這個字目前沒有的區塊；要補的才勾，不需要的（例如這個字本來就不需要文法說明）不勾就好。</p>
    ${miss.length ? `<p class="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1">目前沒有（${miss.length}）</p><div class="mb-3">${miss.map(b => row(b, 'm')).join('')}</div>` : '<p class="text-sm text-emerald-600 dark:text-emerald-400 mb-3">所有區塊都有了。想加更多，可以展開下面「已有的區塊」。</p>'}
    ${sub('AI 當時已確認「沒有」的區塊（想要仍可勾，請 AI 重新評估）', conf, 'c', false)}
    ${sub('已有的區塊（想補強、再多加幾筆時勾）', have, 'h', false)}
    <label class="block text-xs text-slate-500 mb-1">備註（選填，例如想特別釐清哪裡）</label><textarea id="sp-n" rows="3" class="${dnInp} mb-3"></textarea>
    <p class="text-xs text-slate-500 leading-relaxed mb-4">按「加入待辦」後，到「🆕 新單字 → 待補充詳解」複製 AI 提示詞，AI 回傳存成 <code>w{週}d{天}_extra.json</code>，再用 json_merge.py 合併。原有內容一律保留，只會新增。</p>
    <div class="flex justify-end gap-2"><button onclick="dnClose()" class="${btn} ${dnLine}">取消</button><button onclick="spSave()" class="${btn} ${dnPri}">加入待辦</button></div></div>`);
}
function spNote(own, picks, remark) {
  const way = { m: '新增', c: '重新評估後新增', h: '保留原有內容、再補充（不要重複）' };
  const lines = picks.map((p, i) => `${i + 1}）${way[p.m]} ${p.b.ins}`);
  return `請替「${own}」的詳解補上以下區塊。沒有列出的欄位、以及原有內容一律逐字原樣保留：${lines.join('；')}。` + (remark ? `我的說明：${remark}` : '');
}
function spSave() {
  const D = typeof dnDetailData === 'function' ? dnDetailData() : null; if (!D || !D.ex || !spCan(D.e)) return dnClose();
  const e = D.e, own = cfOwnText(e), bs = spBlocks(e);
  const picks = Array.from(document.querySelectorAll('[data-spk]')).filter(c => c.checked).map(c => ({ b: bs.find(b => b.k === c.dataset.spk), m: c.dataset.spm })).filter(p => p.b);
  if (!picks.length) { dnToast('請先勾選要補的區塊'); return; }
  const remark = String((document.getElementById('sp-n') || {}).value || '').trim().replace(/\s+/g, ' '), note = spNote(own, picks, remark);
  if (nwList().some(n => dnKey(n.text) === dnKey(own) && String(n.note || '').trim() === note && !nwIsDone(n))) { dnToast('這個已經加過了，等 AI 補充'); return; }
  const now = Date.now();
  nwList().push({ id: dnId('n'), text: own, type: /\s/.test(own) ? 'phrase' : 'word', note, sup: 1, supk: picks.map(p => p.b.k), created: now, updated: now, t: now, base: DATA.map(idOf) });
  nwSave(); dnClose();
  dnToast('已加入：' + picks.map(p => p.b.lab.replace(/ .*$/, '')).join('、') + '。到「🆕 新單字 → 待補充詳解」複製提示詞');
  render();
}
