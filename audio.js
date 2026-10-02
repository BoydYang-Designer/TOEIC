/* audio.js — Part 1／Part 2 共用音檔模組
   路徑：audio/p1/{id}-s01..s12.mp3；audio/p2/{id}-q.mp3 與 {id}-s01..s12.mp3（編號＝pool 順序，從 01 起，請勿打亂既有題目的 pool 順序）
   規則：整題（Part 2 含問句＋全部回答句）到齊才用 mp3，否則整題用機器發音。
   哪些題目到齊由 audio/index.json（audio_scan.py 產生）決定，開頁時讀一次，播放時不再逐檔探測。讀不到清單（含雙擊開啟 file://）就全部用機器發音。 */
const AU = { idx: null, el: null, bad: {} };
async function auLoad() { try { const r = await fetch('audio/index.json', { cache: 'no-store' }); if (r.ok) AU.idx = await r.json(); } catch (e) {} }
const auNames = (part, x) => ({ q: part === 'p2' ? x.id + '-q' : null, s: (x._pool || []).map((_, i) => x.id + '-s' + String(i + 1).padStart(2, '0')) });
const auSrc = (part, name) => 'audio/' + part + '/' + name + '.mp3' + (AU.idx && AU.idx.v ? '?v=' + AU.idx.v : '');
const auFull = (part, id) => !!(AU.idx && AU.idx[part] && (AU.idx[part].complete || []).includes(id)) && !AU.bad[part + id];
/* 連續播放：全程重複使用同一個 Audio 元素（iOS 只要第一段從點擊啟動，後面換 src 都能繼續播） */
function auChain(srcs, gaps, live, done, fail) {
  const a = AU.el || (AU.el = new Audio()); let i = 0;
  const next = () => {
    if (!live()) return;
    if (i >= srcs.length) { done(); return; }
    const k = i++;
    a.onended = () => setTimeout(next, gaps[k] || 1000);
    a.onerror = () => { if (live()) fail(); };
    a.src = srcs[k];
    a.play().catch(e => { if (e.name !== 'AbortError' && live()) fail(); });
  };
  next();
}
function auStop() { if (AU.el) { AU.el.onended = AU.el.onerror = null; try { AU.el.pause(); } catch (e) {} } }
function auCopy(t) {
  const b = typeof event !== 'undefined' && event && event.target, o = b && b.textContent, done = () => { if (b) { b.textContent = '✓'; setTimeout(() => { b.textContent = o; }, 1000); } };
  const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); done(); };
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, fb); else fb();
}
/* 維護頁的音檔區：逐句顯示檔名與有無，可複製檔名、句子，或一次複製「缺的」清單（檔名 | 句子）給 AI 語音工具 */
function auPanel(part, x) {
  if (x._legacy) return '';
  const n = auNames(part, x), rows = (n.q ? [{ name: n.q, text: x.q.t }] : []).concat(x._pool.map((p, i) => ({ name: n.s[i], text: p.t })));
  const I = (AU.idx && AU.idx[part]) || {}, full = (I.complete || []).includes(x.id), ms = (I.partial || {})[x.id], has = r => full || !!(ms && !ms.includes(r.name));
  const got = rows.filter(has).length, miss = rows.filter(r => !has(r));
  return `<div class="mt-4 rounded-xl border border-slate-200 dark:border-slate-800 p-3"><div class="flex flex-wrap items-center justify-between gap-2 mb-2"><p class="text-xs font-bold">🔊 音檔 ${got}/${rows.length}${got === rows.length ? '（完整，播放用 mp3）' : '（未到齊，整題用機器發音）'}${AU.idx ? '' : ' · 尚未讀到 audio/index.json'}</p>${miss.length ? `<button onclick="auCopy(this.dataset.t)" data-t="${esc(miss.map(r => r.name + '.mp3 | ' + r.text).join('\n'))}" class="${btn} ${line} !py-1 text-xs">複製缺的（檔名 | 句子）</button>` : ''}</div>`
    + rows.map(r => `<div class="flex items-center gap-2 text-xs py-0.5"><span class="${has(r) ? 'text-emerald-600' : 'text-rose-500'}">${has(r) ? '✔' : '✖'}</span><code class="shrink-0">${r.name}.mp3</code><span class="truncate flex-1 text-slate-500">${esc(r.text)}</span><button onclick="auCopy(this.dataset.t)" data-t="${esc(r.name + '.mp3')}" class="${btn} ${line} !py-0.5 !px-2 text-xs">檔名</button><button onclick="auCopy(this.dataset.t)" data-t="${esc(r.text)}" class="${btn} ${line} !py-0.5 !px-2 text-xs">句子</button></div>`).join('') + '</div>';
}
