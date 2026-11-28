/* hetero.js — 同字不同音（heteronym）：同一個拼法，因詞性或意思不同而念法不同（record 名詞 /ˈrekərd/、動詞 /rɪˈkɔːrd/；contract、address、progress、object、subject、estimate、update…）
   載入順序：daily.js 之後、pron.js 之前（daily.html：…notes.js → … → daily.js → hetero.js → pron.js）。
   不改 notes.js：詳解頁畫好後，由這支檔案在畫面上「補丁」：
     ① 偵測：詳解的 pos_uses／senses 裡，同一個字（w，沒有就用原形／本字）有 2 種以上不同音標 → 這些項目算「同字不同音」。
        比對時忽略 ／ ː ˌ 與弱母音差異（ɪ ə ɚ ʌ 視為同一個），重音位置與其他母音不同才算（estimate 的 /ˈestəmət/ 與 /ˈestɪmət/ 算同一種念法）。
        另外：兩個音標若只是「一個等於另一個再多幾個字尾音」（revise /rɪˈvaɪz/ 與 revised /rɪˈvaɪzd/），是不同拼法的字，不算同字不同音（htSfx）。
     ② 音檔：這些項目的 🔊 後綴改用 _hp{k}（詞性第 k 筆）／_hs{k}（多義第 k 筆），去 audio/daily/vocab/{字}_hp1.mp3 找專屬音檔；
        不再播共用單字庫 words/{字}.mp3（那個檔只錄了一種念法）。這個後綴不在 notes.js 的 DN_WORD_SUF 裡，所以 vplay 不用改。
     ③ 念什麼：不是只念單字，而是「帶詞性的小片語」——名詞 the record、動詞 to record、形容詞 very alternate；
        這樣 TTS（Azure／Kokoro／瀏覽器）才會依上下文念出正確的那一種。auto-speech.py 的 MAKE_HET 用同一套規則（HET_CARRIER）。
        這個片語同時是 🔊 的備用機器發音，也是 🎙 練習要念的文字，所以每個念法的練習分數各記各的。
     ④ 沒有專屬音檔時，🔊 角落顯示 ⚠（備用機器發音仍是帶詞性的片語，通常念得對），執行 auto-speech.py daily 補錄就會消失。
     ⑤ 標題下方顯示「📢 同字不同音：n. /…/　v. /…/」。
   與 auto-speech.py 的 het_items() 規則必須一致（改一邊要改另一邊）。 */
const HT_CARRIER = { n: 'the ', v: 'to ', adj: 'very ' };
const htArr = a => Array.isArray(a) ? a : (a ? [a] : []);
const htIpaN = s => String(s || '').toLowerCase().replace(/[\/\s]/g, '').replace(/[ːˌ]/g, '').replace(/[ɪəɚʌᵻ]/g, 'ə');
const htSfx = (a, b) => a !== b && ((b.startsWith(a) && b.length - a.length <= 3) || (a.startsWith(b) && a.length - b.length <= 3)); // 只差字尾（revise／revised）不算不同念法；與 auto-speech.py 的 ipa_sfx 一致
function htSay(w, pos) { const m = String(pos || '').toLowerCase().match(/[a-z]+/); return (HT_CARRIER[m ? m[0] : ''] || '') + w; }
const HT_C = new WeakMap();
function htHet(e) { // → Map('pos_uses:0' → { w, ipa, pos, say })；沒有同字不同音 → 空 Map
  if (!e || typeof e !== 'object') return new Map();
  if (HT_C.has(e)) return HT_C.get(e);
  const out = new Map(), base = String(e.lemma || e.text || e.word || '').trim(), grp = new Map();
  if (!e.type || e.type === 'word') ['pos_uses', 'senses'].forEach(blk => htArr(e[blk]).forEach((o, i) => {
    if (!o || typeof o !== 'object' || !o.ipa) return;
    const w = String(o.w || base).trim(); if (!w) return;
    const k = w.toLowerCase(); if (!grp.has(k)) grp.set(k, []); grp.get(k).push({ blk, i, w, o });
  }));
  grp.forEach(list => {
    const vs = [...new Set(list.map(r => htIpaN(r.o.ipa)))];
    if (!vs.some((a, i) => vs.some((b, j) => j > i && !htSfx(a, b)))) return; // 沒有真正不同的念法（含只差字尾）→ 不算同字不同音
    list.forEach(r => out.set(r.blk + ':' + r.i, { w: r.w, ipa: r.o.ipa, pos: r.o.pos || '', say: htSay(r.w, r.o.pos) }));
  });
  HT_C.set(e, out); return out;
}
if (typeof DN_AUSUF === 'object') { DN_AUSUF._hp = '詞性念法（同字不同音）'; DN_AUSUF._hs = '多義念法（同字不同音）'; } // 🔧 音檔修復面板的名稱

function htPatch() {
  const root = document.getElementById('detail-text');
  if (typeof cur === 'undefined' || cur.view !== 'detail' || !root) return;
  let D = null; try { D = dnDetailData(); } catch (e) {}
  if (!D || !D.e) return;
  const het = htHet(D.e); if (!het.size) return;
  root.querySelectorAll('button[onclick^="vplay("]').forEach(b => {
    const oc = b.getAttribute('onclick') || '', m = /'(_pw|_sw)(\d+)'/.exec(oc);
    if (m) { // 詞性／多義的單字 🔊 → 專屬念法
      const h = het.get((m[1] === '_pw' ? 'pos_uses:' : 'senses:') + (+m[2] - 1)); if (!h) return;
      b.setAttribute('onclick', oc.replace(m[0], `'${m[1] === '_pw' ? '_hp' : '_hs'}${m[2]}'`));
      b.dataset.w = h.say; b.dataset.ipa = h.ipa; b.dataset.het = '1';
      const mic = b.nextElementSibling; // pron.js 若已經補了 🎙，改成練習這個片語
      if (mic && mic.classList.contains('pr-mic')) { mic.dataset.pt = h.say; try { prRefreshBadges(); } catch (e) {} }
    }
  });
  root.querySelectorAll('button[data-het]').forEach(b => { // 有沒有專屬音檔（audio/daily/vocab/index.json 還沒讀到就先不標）
    const m = /'(_h[ps]\d+)'/.exec(b.getAttribute('onclick') || ''); if (!m) return;
    const miss = !!(typeof VA !== 'undefined' && VA.files && !VA.files.has(dnSlug(b.dataset.t) + m[1] + '.mp3'));
    if (miss) b.dataset.nomp3 = '1'; else delete b.dataset.nomp3;
  });
  if (!root.querySelector('#ht-het')) { // 標題下方：各念法一覽
    const h2 = root.querySelector('header h2'); if (!h2) return;
    const seen = new Set(), pairs = [];
    het.forEach(h => { const k = h.pos + '|' + htIpaN(h.ipa); if (!seen.has(k)) { seen.add(k); pairs.push(h); } });
    const p = document.createElement('p'); p.id = 'ht-het'; p.className = 'mt-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed';
    p.innerHTML = `<span class="text-[0.6875rem] font-semibold rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 align-middle">📢 同字不同音</span> ${pairs.map(h => `${h.pos ? `<i>${esc(h.pos)}</i> ` : ''}<span class="text-slate-500">${esc(h.ipa)}</span>`).join('　')}<span class="block text-xs text-slate-400">下面各詞性／意思的 🔊 念的是帶詞性的小片語（例如 to record），角落出現 ⚠＝還沒有專屬音檔，先用機器念。</span>`;
    h2.after(p);
  }
}
(function () {
  let q = 0;
  const run = () => { q = 0; try { htPatch(); } catch (e) { console.error(e); } };
  const start = () => {
    const m = document.getElementById('main'); if (!m) return;
    new MutationObserver(() => { if (!q) q = requestAnimationFrame(run); }).observe(m, { childList: true, subtree: true });
    run(); setTimeout(run, 1500); // 音檔清單（index.json）通常比第一次畫面晚到：再補標一次 ⚠
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
