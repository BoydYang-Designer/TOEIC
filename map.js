/* map.js — 專案地圖（嵌在 index.html 的「維護總覽」裡，第一次展開時載入）
   即時讀取 html／js／py 檔案，自動分析關聯（不需手動維護）
   只需改下面 CFG：pages／py 是「起點」，掃描時發現的 .html／.py 會自動加進來。 */
(function () {
const CFG = {
  pages: ['index.html', 'daily.html', 'vocab.html', ...[1, 2, 3, 4, 5, 6, 7].map(n => `part${n}.html`)],
  py: ['json_merge.py', 'daily_timestamps.py', 'daily-auto-speech.py', 'Scan總表與音檔.py', ...[1, 2, 3, 4, 5, 6, 7].map(n => `part${n}-auto-speech.py`)]
};
const $ = id => document.getElementById('mp-' + id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let C = {}, T = 0;
const get = u => C[u] || (C[u] = fetch(encodeURI(u) + '?t=' + T, { cache: 'no-store' }).then(r => r.ok ? r.text() : null).catch(() => null));
const uniq = a => [...new Set(a)];
const all = (t, re, g = 1) => uniq([...t.matchAll(re)].map(m => m[g]));
const RE = {
  js: /<script[^>]+src=["']([^"':]+\.js)["']/g, css: /<link[^>]+href=["']([^"':]+\.css)["']/g,
  json: /['"`]((?:[\w\-]+\/)*[\w\-]+\.json)['"`]/g, html: /['"`(=]((?:[\w\-]+\/)*[\w\-]+\.html)/g,
  aud: /audio\/(p[1-7]|daily\/vocab|daily)\b/g, py: /([\w\-\u4e00-\u9fff]+\.py)\b/g
};
const isNoise = n => /^(w\d+d\d+|p\d_|d\d-)/.test(n.split('/').pop()) || /_extra|marks\*/.test(n);
function pyCtx(t, name) { // 取出提到某個 .py 的那一句話
  const i = t.indexOf(name); if (i < 0) return '';
  let s = t.slice(Math.max(0, i - 70), i + name.length + 50).replace(/\$\{[^}]*\}|<[^>]+>|`|\\n|\s+/g, ' ');
  return s.trim().slice(0, 110);
}
function refs(t, self) {
  const o = { json: all(t, RE.json).filter(n => !isNoise(n)), html: all(t, RE.html).filter(n => n !== self), aud: all(t, RE.aud).map(d => 'audio/' + d + '/'), py: {} };
  all(t, RE.py).forEach(p => { if (p !== self && !p.startsWith('__')) o.py[p] = pyCtx(t, p); });
  return o;
}
async function scan() {
  T = Date.now(); C = {}; $('st').textContent = '掃描中…';
  const W = [], P = {}, J = {}, D = {}, PY = {}, TXT = {}, from = {}; // W 警告（{m 訊息, f 該提供給 AI 的檔案}）；P 頁面；J／D 資料→使用者；from＝誰連到了某個頁面
  const warn = (m, f = []) => { const e = W.find(x => x.m === m); if (e) e.f = uniq(e.f.concat(f)); else W.push({ m, f: uniq(f) }); };
  const note = (map, k, kind, who) => ((map[k] = map[k] || { pages: new Set(), py: new Set() })[kind].add(who));
  const q = [...CFG.pages], seen = new Set(q);
  for (let i = 0; i < q.length; i++) {
    const name = q[i], t = await get(name);
    if (t == null) { if (CFG.pages.includes(name)) warn(`頁面 ${name} 讀不到`); else warn(`有檔案連到 ${name}，但它不存在`, from[name] || []); continue; }
    const pg = P[name] = { title: (t.match(/<title>([^<]*)/) || [])[1] || name, js: all(t, RE.js), css: all(t, RE.css), json: [], html: [], aud: [], py: {} };
    const parts = [[name, t]]; TXT[name] = t;
    for (const f of [...pg.js, ...pg.css]) { const x = await get(f); if (x == null) warn(`${name} 載入的 ${f} 找不到`, [name]); else { parts.push([f, x]); TXT[f] = x; } }
    for (const [f, x] of parts) {
      const r = refs(x, f);
      pg.json.push(...r.json); pg.html.push(...r.html); pg.aud.push(...r.aud); r.html.forEach(h => (from[h] = from[h] || []).push(f));
      for (const p in r.py) (pg.py[p] = pg.py[p] || []).push({ f, c: r.py[p] });
    }
    ['json', 'html', 'aud'].forEach(k => pg[k] = uniq(pg[k]));
    pg.html.forEach(h => { if (!seen.has(h)) { seen.add(h); q.push(h); } });
    pg.json.forEach(j => note(J, j, 'pages', name)); pg.aud.forEach(a => note(D, a, 'pages', name));
  }
  const pq = [...CFG.py], pseen = new Set(pq); Object.values(P).forEach(p => Object.keys(p.py).forEach(n => { if (!pseen.has(n)) { pseen.add(n); pq.push(n); } }));
  for (const n of pq) {
    const t = await get(n);
    if (t == null) { const by = Object.entries(P).filter(([, p]) => p.py[n]).map(([k]) => k); if (by.length) warn(`${by.join('、')} 的文字提到 ${n}，但資料夾裡沒有這支（改名了？）`, Object.values(P).flatMap(p => (p.py[n] || []).map(x => x.f))); continue; }
    TXT[n] = t;
    const doc = (t.match(/"""\s*([^\n]+)/) || [])[1] || '', r = refs(t, n);
    const js = []; for (const j of r.json) if ((await get(j)) != null) js.push(j);
    for (const p in r.py) if ((await get(p)) == null) warn(`${n} 的說明提到 ${p}，但它不存在`, [n]);
    PY[n] = { doc: doc.replace(/^[\w\-\u4e00-\u9fff]+\.py\s*[—\-─]+\s*/, ''), json: js, aud: r.aud, by: Object.entries(P).filter(([, p]) => p.py[n]).map(([k]) => k) };
    js.forEach(j => note(J, j, 'py', n)); r.aud.forEach(a => note(D, a, 'py', n));
  }
  for (const j of Object.keys(J)) if ((await get(j)) == null && J[j].pages.size) warn(`網頁讀取 ${j}（${[...J[j].pages].join('、')}），但檔案不存在（可能是執行 py 後才會產生）`, [...J[j].pages].flatMap(pn => [pn, ...P[pn].js, ...P[pn].css].filter(f => TXT[f] && TXT[f].includes(j))));
  LAST.W = W; render(P, PY, J, D, W);
  await unused(TXT);
  $('st').textContent = '更新於 ' + new Date().toLocaleTimeString();
}
const code = a => a.map(x => `<code class="rounded bg-slate-100 dark:bg-slate-800 px-1 text-[11px] mr-0.5">${esc(x)}</code>`).join(' ') || '<span class="text-slate-400">—</span>';
const DL = 'grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 text-xs break-all', MUT = 'text-slate-500 dark:text-slate-400';
function render(P, PY, J, D, W) {
  const bt = 'rounded-lg border border-amber-400 dark:border-amber-700 px-2 py-0.5 text-[11px] cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/40';
  const allF = uniq(W.flatMap(w => w.f));
  $('warn').innerHTML = W.length ? `<div class="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
    <div class="flex flex-wrap items-center gap-2"><b>⚠ 發現 ${W.length} 個可能的問題</b><button data-cp="all" class="${bt}">📋 全部問題複製給 AI</button></div>
    <p class="${MUT} mt-1">請把下面標示的檔案一起上傳給 AI，再貼上複製的提問。全部需要提供：${code(allF) }</p>
    <ul class="mt-2 space-y-2">${W.map((w, i) => `<li class="border-t border-amber-200 dark:border-amber-900 pt-1.5"><div>${esc(w.m)}</div><div class="mt-1 flex flex-wrap items-center gap-1.5"><span class="${MUT}">需提供：</span>${w.f.length ? code(w.f) : `<span class="${MUT}">（不用附檔；若 AI 需要，請附上相關頁面）</span>`}<button data-cp="${i}" class="${bt} ml-auto">複製給 AI</button></div></li>`).join('')}</ul></div>` : '<div class="rounded-xl border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-xs">✔ 沒有發現遺失的檔案或過期的檔名</div>';
  $('pages').innerHTML = Object.entries(P).map(([n, p]) => `<details class="${CARD}"><summary class="cursor-pointer font-bold text-sm">🌐 ${esc(p.title)} <code>${n}</code></summary><dl class="${DL}">
    <dt class="${MUT}">程式</dt><dd>${code(p.js.concat(p.css))}</dd><dt class="${MUT}">讀資料</dt><dd>${code(p.json)}</dd><dt class="${MUT}">音檔</dt><dd>${code(p.aud)}</dd>
    <dt class="${MUT}">連到</dt><dd>${code(p.html)}</dd><dt class="${MUT}">用到 py</dt><dd>${Object.keys(p.py).length ? Object.entries(p.py).map(([k, v]) => `<div><code>${esc(k)}</code> <span class="${MUT}">${esc(v[0].c)}（${esc(v[0].f)}）</span></div>`).join('') : '<span class="${MUT}">—</span>'}</dd></dl></details>`).join('');
  $('pys').innerHTML = Object.entries(PY).map(([n, p]) => `<details class="${CARD}"><summary class="cursor-pointer font-bold text-sm">🐍 <code>${esc(n)}</code></summary><p class="${MUT} text-xs mb-1.5">${esc(p.doc) || '（沒有說明）'}</p><dl class="${DL}">
    <dt class="${MUT}">涉及資料</dt><dd>${code(p.json)}</dd><dt class="${MUT}">涉及音檔</dt><dd>${code(p.aud)}</dd><dt class="${MUT}">網頁提到</dt><dd>${code(p.by)}</dd></dl></details>`).join('');
  const rows = Object.entries(J).map(([k, v]) => [k, v]).concat(Object.entries(D)).sort((a, b) => a[0].localeCompare(b[0]));
  $('data').innerHTML = '<table class="w-full text-xs"><tr class="text-left"><th class="p-1.5">資料／音檔</th><th class="p-1.5">被哪些頁面讀取</th><th class="p-1.5">哪些 py 會處理</th></tr>' + rows.map(([k, v]) => `<tr class="border-t border-slate-100 dark:border-slate-800 align-top"><td class="p-1.5">${code([k])}</td><td class="p-1.5">${code([...v.pages])}</td><td class="p-1.5">${code([...v.py])}</td></tr>`).join('') + '</table>';
}
/* 找沒用到的檔案：site_files.json（由 Scan 產生）列出根目錄所有檔案；
   把所有掃描到的 html／js／py 文字裡「像檔名的字串」收集起來，沒被任何其他檔案提到的就列為疑似無用 */
const FILE_RE = /(?<![\w\/\-])((?:[\w\-]+\/)*[\w\-\u4e00-\u9fff]+\.(?:js|css|json|html|py|png|jpe?g|svg|gif|webp|ico))\b/g;
async function unused(TXT) {
  const el = $('unused'); if (!el) return;
  let sf = await get('site_files.json'); try { sf = JSON.parse(sf); } catch (e) { sf = null; }
  if (!sf) { el.innerHTML = `<p class="${MUT} text-xs">還沒有 site_files.json：執行一次 <code>Scan總表與音檔.py</code> 就會產生，之後這裡會列出沒被任何檔案提到的檔案。</p>`; return; }
  const men = {};
  for (const [f, t] of Object.entries(TXT)) for (const tok of all(t, FILE_RE)) if (tok !== f) (men[tok] = men[tok] || new Set()).add(f);
  const SKIP = new Set([...CFG.pages.slice(0, 1), 'site_files.json']);
  const hint = n => /^w\d+d\d+(_extra)?\.json$|^p\d_/.test(n) ? '像是還沒合併的副檔（合併後會移到 merged/）' : /\.py$/.test(n) ? '工具？沒被任何檔案提到（若是自己手動執行的就正常）' : '';
  const rows = sf.files.filter(f => /\.(js|css|json|html|py|png|jpe?g|svg|gif|webp|ico)$/i.test(f.n) && !SKIP.has(f.n) && !men[f.n])
    .map(f => `<tr class="border-t border-slate-100 dark:border-slate-800 align-top"><td class="p-1.5">${code([f.n])}</td><td class="p-1.5 whitespace-nowrap">${f.kb} KB</td><td class="p-1.5 whitespace-nowrap">${new Date(f.t * 1000).toLocaleDateString('zh-TW')}</td><td class="p-1.5 ${MUT}">${esc(hint(f.n))}</td></tr>`);
  LAST.UN = sf.files.filter(f => /\.(js|css|json|html|py|png|jpe?g|svg|gif|webp|ico)$/i.test(f.n) && !SKIP.has(f.n) && !men[f.n]).map(f => ({ n: f.n, kb: f.kb, h: hint(f.n) }));
  const dirs = Object.entries(sf.dirs || {}).map(([d, n]) => `${d}/（${n}）`).join('　');
  el.innerHTML = `<p class="${MUT} text-xs mb-2">資料夾清單更新於 ${new Date(sf.v * 1000).toLocaleString('zh-TW', { hour12: false })}（Scan 執行時）。判斷方式：檔名沒有出現在任何已掃描的 html／js／py 裡。這是「疑似」，刪除前請自己確認（例如只在 daily.json 或 json 資料裡才會用到的圖片）。</p>`
    + (rows.length ? `<p class="mb-2"><button data-cp="un" class="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-[11px] cursor-pointer">📋 把這份清單複製給 AI 確認能不能刪</button> <span class="${MUT} text-[11px]">（請順便附上 index.html 與你想確認的檔案）</span></p><table class="w-full text-xs"><tr class="text-left"><th class="p-1.5">檔案</th><th class="p-1.5">大小</th><th class="p-1.5">修改日</th><th class="p-1.5">備註</th></tr>${rows.join('')}</table>` : '<p class="text-xs text-emerald-600">✔ 根目錄沒有發現沒被提到的檔案</p>')
    + `<p class="${MUT} text-xs mt-2">資料夾（檔案數）：${esc(dirs)}　※ audio/ 內的多餘檔案請看上方警告裡的「孤兒檔」。</p>`;
}
const LAST = { W: [], UN: [] };
const BG = '【專案背景】\n- 純前端網站（html／js，Tailwind CDN）加上 Python 工具；用 GitHub Pages／Go Live 開啟。\n- Scan總表與音檔.py 放在網站根目錄，會產生 audio/index.json、vocab_index.json、site_files.json。\n- audio/ 底下依 Part 分資料夾（p1～p7、daily、daily/vocab）；題庫是 daily.json、part1～7.json。\n- 「專案地圖」（map.js）是自動掃描 html／js／py 文字得到這份結果，判斷方式是比對檔名字串，可能有誤判。\n';
function aiPrompt(items) {
  const fs = uniq(items.flatMap(i => i.f));
  return '我的 TOEIC 練習網站，專案地圖自動掃描出下面的問題，請幫我檢查並修正。\n\n【掃描到的問題】\n' + items.map((w, i) => (i + 1) + '. ' + w.m).join('\n')
    + '\n\n【我會附上的檔案】\n' + (fs.length ? fs.map(f => '- ' + f).join('\n') : '（沒有特別指定，需要哪些請告訴我）')
    + '\n\n' + BG + '\n【請你】\n1. 逐一確認每個問題是真的錯誤還是誤判，並說明原因。\n2. 是真的錯誤的，請指出「哪個檔案、哪一段」要改成什麼；能整段複製貼上的修改後內容最好。\n3. 如果需要我再提供其他檔案，請先列出檔名。\n4. 只改必要的地方，不要重寫整個檔案。';
}
function unPrompt() {
  return '專案地圖列出下面這些檔案「沒有被任何 html／js／py 的文字提到」，請幫我判斷能不能刪除或移到備份資料夾。\n\n【疑似沒用到的檔案】\n' + LAST.UN.map(f => '- ' + f.n + '（' + f.kb + ' KB）' + (f.h ? ' ← ' + f.h : '')).join('\n')
    + '\n\n【我會附上的檔案】\nindex.html 與我想確認的檔案（需要其他檔案請告訴我檔名）\n\n' + BG + '\n【請你】\n1. 對每個檔案給「可刪／不確定／不能刪」，並說明理由（例如可能只在 json 資料或動態組出的檔名裡才用到）。\n2. 不確定的，請告訴我要用什麼方式確認（例如全域搜尋哪個字串）。\n3. 先不要建議刪除我沒列出的檔案。';
}
function copyText(t, b) {
  const o = b.dataset.o || (b.dataset.o = b.textContent), ok = () => { b.textContent = '✓ 已複製'; setTimeout(() => { b.textContent = o; }, 1500); };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); ok(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(ok, fb); else fb();
}
const CARD = 'rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 mb-2';
function mount(box) {
  if (location.protocol === 'file:') { box.innerHTML = '<p class="text-sm text-amber-600">用雙擊（file://）開啟時瀏覽器不允許讀檔，請從網站網址開啟（VS Code Go Live 即可）。</p>'; return; }
  box.innerHTML = `<p class="text-xs text-slate-500 mb-3">每次展開或按「重新掃描」都會重新讀取你的 html／js／py，自動整理出關聯。 <button id="mp-re" class="ml-1 rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-1 cursor-pointer">重新掃描</button> <span id="mp-st"></span></p>
    <div id="mp-warn"></div>
    <h4 class="font-bold text-sm mt-4 mb-2">🌐 網頁：用到哪些程式、資料、音檔、py</h4><div id="mp-pages" class="grid sm:grid-cols-2 gap-x-3 items-start"></div>
    <h4 class="font-bold text-sm mt-4 mb-2">🐍 Python 工具：做什麼、涉及哪些資料</h4><div id="mp-pys" class="grid sm:grid-cols-2 gap-x-3 items-start"></div>
    <h4 class="font-bold text-sm mt-4 mb-2">📦 資料／音檔：誰讀、誰處理</h4><div id="mp-data" class="overflow-x-auto"></div>
    <h4 class="font-bold text-sm mt-4 mb-2">🧹 疑似沒用到的檔案</h4><div id="mp-unused" class="overflow-x-auto"></div>`;
  box.addEventListener('click', e => { const b = e.target.closest('[data-cp]'); if (!b) return; const k = b.dataset.cp; copyText(k === 'un' ? unPrompt() : aiPrompt(k === 'all' ? LAST.W : [LAST.W[+k]]), b); });
  $('re').onclick = scan; scan();
}
window.TMap = { mount, scan, _p: k => k === 'un' ? unPrompt() : aiPrompt(k === 'all' ? LAST.W : [LAST.W[+k]]) };
})();
