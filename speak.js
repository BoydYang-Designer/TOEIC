/* speak.js — Daily 語音練習 ＋ timing 檢查
   依賴（執行時才用到，載入順序在 audio.js 之後、daily.js 之前即可）：
   daily.js 的 DATA／S／save／cur／find／idOf／esc／card／btn／main／render／push／audioSrc／dyHas／setVoice
   audio.js 的 AU
   timing.js 的 tmInfo／tmBadge／TM_LABEL／TM_COLOR（需先載入 timing.js）
   ② 語音練習頁       cur.view === 'speak'：「一句一句」與「整篇」兩種模式
                     錄音＋語音辨識＋逐字比對的做法沿用 quiz.js（MediaRecorder＋SpeechRecognition＋LCS） */

/* ================= ① timing 完成度：已搬到 timing.js（tmInfo／tmBadge／TM_LABEL／TM_COLOR），HTML 需先載入 timing.js ================= */

/* ================= 切句（沒有 timing 時使用；也用來補 timing 漏掉的段落） ================= */
const SK_ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|Corp|St|No|vs|etc)\.$/;
function splitSent(p, a, b) { // 回傳 [{from,to}]（字元範圍，已去頭尾空白）
  a = a == null ? 0 : a; b = b == null ? p.length : b;
  const out = [], seg = p.slice(a, b), lre = /[^\n]+/g;
  let m;
  while ((m = lre.exec(seg))) {
    const line = m[0], base = a + m.index;
    const push = (s, e) => {
      while (s < e && /\s/.test(line[s])) s++;
      while (e > s && /\s/.test(line[e - 1])) e--;
      if (e > s) out.push({ from: base + s, to: base + e });
    };
    let st = 0;
    const re = /[.!?]+["')\]]*\s+(?=["'(\[]?[A-Z0-9])/g;
    let k;
    while ((k = re.exec(line))) {
      const before = line.slice(st, k.index + 1);
      if (SK_ABBR.test(before)) continue;
      push(st, k.index + k[0].length);
      st = k.index + k[0].length;
    }
    push(st, line.length);
  }
  return out;
}

/* ================= 語音練習狀態 ================= */
const SK = {
  id: null, mode: 'sent', i: 0, sents: [], hasTiming: false,
  rate: 1, hide: false, res: {}, wres: null,
  st: 'idle',            // idle | rec | proc
  final: '', interim: '', err: '',
  sr: null, mr: null, stream: null, chunks: [], blob: null, mime: '', srEnd: null, mrDone: null, timer: null,
  rtk: 0, restart: 0, stopping: false,
  au: null, src: '', ctx: null, node: null, iv: null, bufs: {}, mine: null, playing: null, pk: null, tk: 0, hl: -1, bad: {}
};
const SK_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const skSR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const skX = () => find(cur.w, cur.d);
function skRec(id) { S.spk = S.spk || {}; return S.spk[id] || (S.spk[id] = { s: {}, w: 0 }); }
const SK_PASS = 80; // 達標分數：整篇最佳 ≥80，或每個句子最佳都 ≥80，即視為完成語音練習
function skDone(x) {
  const r = (S.spk || {})[idOf(x)]; if (!r) return false;
  if ((r.w || 0) >= SK_PASS) return true;
  const n = skBuild(x).length;
  return n > 0 && Object.values(r.s || {}).filter(v => v >= SK_PASS).length >= n;
}
function skBest(id, kind, i, pct) {
  const r = skRec(id); if (kind === 's') r.s[i] = Math.max(r.s[i] || 0, pct); else r.w = Math.max(r.w || 0, pct);
  const x = skX(); if (x && idOf(x) === id && !r.at && skDone(x)) r.at = Date.now(); // 記錄第一次完成的時間
  save();
}

/* 句子清單：有效的 timing 為主；timing 沒涵蓋的文字用切句補上（無時間，聽原音改機器發音） */
function skBuild(x) {
  const p = String(x.passage || ''), st = tmInfo(x).state, base = (st === 'ok' || st === 'partial') ? x.timing : [], segs = [];
  let pos = 0;
  const gap = (a, b) => splitSent(p, a, b).forEach(s => segs.push(s));
  base.forEach(t => { if (t.from > pos) gap(pos, t.from); segs.push({ from: t.from, to: t.to, start: t.start, end: t.end }); pos = t.to; });
  if (pos < p.length) gap(pos, p.length);
  return segs.map(s => Object.assign(s, { t: p.slice(s.from, s.to).trim() })).filter(s => /[A-Za-z0-9]/.test(s.t));
}
function skInit(x) {
  skStopAll();
  SK.id = idOf(x); SK.sents = skBuild(x); SK.hasTiming = SK.sents.some(s => s.start != null);
  skDrop('sent'); skDrop('whole'); SK.bufs = {};
  SK.i = 0; SK.res = {}; SK.wres = null; SK.mode = S.spkMode === 'whole' ? 'whole' : 'sent';
  SK.hide = false; SK.rate = 1; SK.err = ''; SK.hl = -1;
}
function skSepBefore(k) { // 兩句之間原文的分隔（換行保留）
  if (!k) return '';
  const x = skX(), a = SK.sents[k - 1], b = SK.sents[k], g = String(x.passage || '').slice(a.to, b.from), n = (g.match(/\n/g) || []).length;
  return n >= 2 ? '\n\n' : n === 1 ? '\n' : ' ';
}

/* ================= 比對（沿用 quiz.js 的 LCS 作法，加上縮寫／數字正規化） ================= */
const SK_NUM = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SK_ORD = [0, 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty first', 'twenty second', 'twenty third', 'twenty fourth', 'twenty fifth', 'twenty sixth', 'twenty seventh', 'twenty eighth', 'twenty ninth', 'thirtieth', 'thirty first'];
function skRaw(s) { // 正規化後切成字（英文數字詞尚未合併）
  s = String(s).toLowerCase().replace(/[’‘`]/g, "'")
    .replace(/\b([ap])\.m\.?/g, '$1m').replace(/(\d)\s?(am|pm)\b/g, '$1 $2')
    .replace(/\b((?:[a-z]\.){2,})/g, m => m.replace(/\./g, '')) // U.S. → us
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, (m, n) => SK_ORD[+n] || m) // 5th → fifth
    .replace(/\bmr\b\.?/g, 'mister').replace(/\b(ms|mrs|miss|miz)\b\.?/g, 'ms').replace(/\bdr\b\.?/g, 'doctor')
    .replace(/\bok\b/g, 'okay').replace(/\betc\b\.?/g, 'et cetera').replace(/\bvs\b\.?/g, 'versus')
    .replace(/(\d)\.(\d)/g, '$1 point $2') // 1.5 → 1 point 5
    .replace(/(\d),(?=\d{3}\b)/g, '$1')
    .replace(/\b(\d{1,2}):00\b/g, '$1').replace(/\b(\d{1,2}):0(\d)\b/g, '$1 0 $2').replace(/\b(\d{1,2}):(\d\d)\b/g, '$1 $2')
    .replace(/\$\s?(\d+)/g, '$1 dollars')
    .replace(/%/g, ' percent').replace(/&/g, ' and ')
    .replace(/\bcan't\b/g, 'cannot').replace(/\bwon't\b/g, 'will not')
    .replace(/n't\b/g, ' not').replace(/'re\b/g, ' are').replace(/'m\b/g, ' am').replace(/'ve\b/g, ' have').replace(/'ll\b/g, ' will').replace(/'d\b/g, ' would')
    .replace(/\b(it|that|there|what|he|she|who|let|here|how|where)'s\b/g, '$1 is')
    .replace(/'s\b/g, '')
    .replace(/-/g, ' ').replace(/[^a-z0-9\s']/g, ' ').replace(/'/g, '');
  return s.split(/\s+/).filter(Boolean);
}
const skToks = s => skNumMerge(skRaw(s));
/* 英文數字詞轉阿拉伯數字：twenty five→25、five hundred→500、ten thirty→10 30（不會硬湊成 40）；ten oh five→10 0 5 */
const skHas = w => Object.prototype.hasOwnProperty.call(SK_NUM, w);
function skNumMergeIx(ws) { // 回傳 [{t, ix}]：t＝合併後的字，ix＝它涵蓋原本第幾個字
  const out = []; let th = 0, cur = null, on = false, ix = [];
  const flush = () => { if (on) out.push({ t: String(th + (cur || 0)), ix }); th = 0; cur = null; on = false; ix = []; };
  ws.forEach((w, i) => {
    if (skHas(w)) {
      const v = SK_NUM[w];
      if (on && cur !== null && ((cur % 100 >= 20 && cur % 10 === 0 && v >= 1 && v <= 9) || (cur >= 100 && cur % 100 === 0 && v < 100))) { cur += v; ix.push(i); }
      else if (on && cur !== null && th === 0 && (cur === 19 || cur === 20) && v >= 10) { cur = cur * 100 + v; ix.push(i); } // 年份：twenty twenty→2020、nineteen ninety nine→1999
      else if (on && cur === null && th) { cur = v; ix.push(i); }
      else { flush(); cur = v; on = true; ix = [i]; }
    } else if (w === 'oh' && on && cur !== null && th === 0 && (cur === 19 || cur === 20) && SK_NUM[ws[i + 1]] >= 1 && SK_NUM[ws[i + 1]] <= 9) { cur *= 100; ix.push(i); } // twenty oh five→2005
    else if (w === 'and' && on && ((cur !== null && cur >= 100 && cur % 100 === 0) || (cur === null && th)) && skHas(ws[i + 1])) ix.push(i); // one hundred and five
    else if ((w === 'hundred' || w === 'thousand') && !on && out.length && out[out.length - 1].t === 'a') { // a hundred／a thousand
      const p = out.pop(); on = true; ix = p.ix.concat(i);
      if (w === 'hundred') cur = 100; else { th = 1000; cur = null; }
    }
    else if (w === 'hundred' && on && cur !== null && cur < 100) { cur *= 100; ix.push(i); }
    else if (w === 'thousand' && on && cur !== null && cur < 1000) { th += cur * 1000; cur = null; ix.push(i); }
    else { flush(); out.push({ t: w, ix: [i] }); }
  });
  flush();
  out.forEach((o, k) => { if (o.t === 'oh' && out[k - 1] && /^\d+$/.test(out[k - 1].t) && out[k + 1] && /^[1-9]$/.test(out[k + 1].t)) o.t = '0'; });
  return out;
}
const skNumMerge = ws => skNumMergeIx(ws).map(o => o.t);
/* 評分寬嚴（S.spkLevel）：strict＝每個字都要一樣（預設）；loose＝相近的字（單複數、時態、差一個字母）算對，漏念 a／an／the／of／to 不扣分 */
const SK_SKIP = new Set(['a', 'an', 'the', 'of', 'to']);
const skLoose = () => S.spkLevel === 'loose';
const skStem = w => w.replace(/(ing|ed|es|s|d)$/, '');
function skLev(a, b) { // 編輯距離（只在 ≤1 時有意義，其餘回傳 2）
  if (Math.abs(a.length - b.length) > 1) return 2;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) ? 1 : 2;
  const [l, sh] = a.length > b.length ? [a, b] : [b, a]; return l.slice(i + 1) === sh.slice(i) ? 1 : 2;
}
function skEq(h, t, loose) {
  if (h === t) return true;
  if (!loose || /\d/.test(h + t)) return false; // 數字一定要一樣
  const sh = skStem(h), st = skStem(t);
  if (sh === st && sh.length >= 3) return true;
  return Math.min(h.length, t.length) >= 5 && skLev(h, t) <= 1;
}
/* sents：[{t}]；heard：辨識到的整段文字。回傳 {pct, sents:[{pct, words:[{w, ok}]}]} */
function skCompare(sents, heard) {
  const loose = skLoose();
  const H = skToks(heard), T = [], own = [];
  const disp = sents.map(s => (String(s.t).match(/\S+/g) || []).map(w => ({ w, k: skRaw(w) })));
  const R = [], RO = []; // 文稿的每個原始字，以及它屬於哪一句的哪個字（英文數字詞要跨字合併，如 twenty five → 25）
  disp.forEach((ws, si) => ws.forEach((d, wi) => d.k.forEach(k => { R.push(k); RO.push([si, wi]); })));
  skNumMergeIx(R).forEach(o => { T.push(o.t); own.push(o.ix.map(i => RO[i])); });
  /* 複合字：念出來／辨識出來可能是 email、e mail、e-mail；check-in、check in、checkin ——相鄰兩字黏起來剛好等於另一邊的某個字就視為同一個字 */
  const Ts = new Set(T), H2 = [];
  for (let i = 0; i < H.length; i++) {
    const j = i + 1 < H.length ? H[i] + H[i + 1] : '';
    if (j && !/\d/.test(j) && Ts.has(j) && !(Ts.has(H[i]) && Ts.has(H[i + 1]))) { H2.push(j); i++; } else H2.push(H[i]);
  }
  const Hs = new Set(H2), T2 = [], own2 = [];
  for (let j = 0; j < T.length; j++) {
    const c = j + 1 < T.length ? T[j] + T[j + 1] : '';
    if (c && !/\d/.test(c) && Hs.has(c) && !(Hs.has(T[j]) && Hs.has(T[j + 1]))) { T2.push(c); own2.push(own[j].concat(own[j + 1])); j++; } else { T2.push(T[j]); own2.push(own[j]); }
  }
  H.length = 0; H2.forEach(h => H.push(h)); T.length = 0; T2.forEach(t => T.push(t)); own.length = 0; own2.forEach(o => own.push(o));
  const m = H.length, n = T.length, hit = new Array(n).fill(false), pairs = [];
  if (m && n) {
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = skEq(H[i - 1], T[j - 1], loose) ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    let i = m, j = n;
    while (i > 0 && j > 0) {
      if (skEq(H[i - 1], T[j - 1], loose)) { hit[j - 1] = true; pairs.push([i - 1, j - 1]); i--; j--; }
      else if (dp[i - 1][j] >= dp[i][j - 1]) i--; else j--;
    }
  }
  if (loose) T.forEach((t, j) => { if (!hit[j] && SK_SKIP.has(t)) hit[j] = true; });
  const okc = disp.map(ws => ws.map(() => 0));
  own.forEach((os, j) => { if (hit[j]) os.forEach(([si, wi]) => okc[si][wi]++); });
  let totAll = 0, okAll = 0;
  const out = disp.map((ws, si) => {
    let tot = 0, ok = 0;
    const words = ws.map((d, wi) => { tot += d.k.length; ok += okc[si][wi]; return { w: d.w, ok: d.k.length === 0 || okc[si][wi] === d.k.length }; });
    totAll += tot; okAll += ok;
    return { pct: tot ? Math.round(ok / tot * 100) : 100, words };
  });
  /* 「你說的」逐字對照：ok＝念對；bad＝念錯或多念（紅字）；miss＝文稿有、你沒念到（顯示成 (字)）。
     依 LCS 配對由左到右走一遍：兩個配對之間，先列出你多說／說錯的字，再列出漏掉的文稿字。 */
  const diff = [], tShow = j => { const o = own[j] && own[j][0]; return o ? disp[o[0]][o[1]].w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '') || disp[o[0]][o[1]].w : T[j]; };
  const walk = (hEnd, tEnd, hs, ts) => {
    for (let a = hs; a < hEnd; a++) diff.push({ t: H[a], k: 'bad' });
    for (let b = ts; b < tEnd; b++) if (!(loose && SK_SKIP.has(T[b]))) diff.push({ t: tShow(b), k: 'miss' });
  };
  let hp = 0, tp = 0;
  pairs.reverse().forEach(([pi, pj]) => { walk(pi, pj, hp, tp); diff.push({ t: H[pi], k: 'ok' }); hp = pi + 1; tp = pj + 1; });
  walk(m, n, hp, tp);
  return { pct: totAll ? Math.round(okAll / totAll * 100) : 0, sents: out, diff };
}
const skPctCls = p => p >= 85 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : p >= 60 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
const skMsg = p => p >= 90 ? '很標準 🎉' : p >= 75 ? '不錯，紅字的地方再留意' : p >= 50 ? '再練一次，先放慢速度' : '差異較多，先聽原音再跟著念';
const skWordsH = ws => ws.map(d => d.ok ? `<span class="text-emerald-600 dark:text-emerald-400">${esc(d.w)}</span>` : `<span class="text-rose-600 dark:text-rose-400 font-bold underline decoration-wavy decoration-rose-400/70">${esc(d.w)}</span>`).join(' ');

/* ================= 播放原音（mp3 片段；沒有 mp3／timing 就用機器發音） ================= */
const skMp3Ok = x => !SK.bad[idOf(x)] && (AU.idx ? dyHas(x) : true);
function skStopPlay() {
  SK.tk++; clearInterval(SK.iv);
  if (SK.node) { const n = SK.node; SK.node = null; n.onended = null; try { n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }
  if (SK.au) { SK.au.onended = SK.au.ontimeupdate = SK.au.onerror = null; try { SK.au.pause(); } catch (e) {} }
  if (SK.mine) { SK.mine.onended = SK.mine.onerror = null; try { SK.mine.pause(); } catch (e) {} SK.mine = null; }
  if (SK.mineUrl) { try { URL.revokeObjectURL(SK.mineUrl); } catch (e) {} SK.mineUrl = null; }
  try { speechSynthesis.cancel(); } catch (e) {}
  SK.playing = null; SK.pk = null; SK.hl = -1;
}
/* seg＝{t,start,end}（一句）或 null（整篇）；key＝切換用識別 */
function skPlay(x, seg, key) {
  if (SK.playing === 'model' && SK.pk === key) { skStopPlay(); skAfter(); return; }
  skStopPlay();
  const tk = SK.tk;
  SK.playing = 'model'; SK.pk = key;
  const done = () => { if (tk !== SK.tk) return; SK.playing = null; SK.pk = null; SK.hl = -1; skAfter(); };
  const tts = () => {
    try {
      const u = new SpeechSynthesisUtterance(seg ? seg.t : String(x.passage || ''));
      setVoice(u); u.rate = 0.9 * SK.rate; u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    } catch (e) { alert('您的瀏覽器不支援即時語音朗讀'); done(); }
  };
  const canMp3 = skMp3Ok(x) && (!seg || seg.start != null);
  if (!canMp3) { tts(); skAfter(); return; }
  const src = audioSrc(x), tr = (seg && typeof key === 'number' && key >= 0) ? skTrim(idOf(x), key) : [0, 0];
  /* 剪裁範圍：開頭多留 SK_LEAD 秒、結尾多留 SK_TAIL 秒，再加上這句的微調值（tr） */
  const t0 = seg ? Math.max(0, seg.start - SK_LEAD + tr[0]) : 0, t1 = seg ? seg.end + SK_TAIL + tr[1] : Infinity;
  const fail = () => { if (tk !== SK.tk) return; SK.bad[idOf(x)] = 1; SK.playing = null; SK.pk = null; skPlay(x, seg, key); };
  /* 後備：用 <audio> 播放（慢速 0.75x、或瀏覽器不支援 Web Audio／解碼失敗時）。mp3 的 seek 本身不夠準，所以靜音等 seeked 才出聲，結尾用 20ms 輪詢而不是 timeupdate（約 250ms 一次，會多念到下一句） */
  const playEl = () => {
    if (tk !== SK.tk) return;
    const a = SK.au || (SK.au = new Audio());
    a.onerror = fail; a.onended = done;
    a.ontimeupdate = seg ? null : () => { if (tk === SK.tk) skHl(a.currentTime); };
    clearInterval(SK.iv);
    if (seg) SK.iv = setInterval(() => {
      if (tk !== SK.tk) { clearInterval(SK.iv); return; }
      if (!a.muted && a.currentTime >= t1) { clearInterval(SK.iv); a.pause(); done(); }
    }, 20);
    const unmute = () => { if (tk === SK.tk) a.muted = false; };
    const seek = () => {
      if (tk !== SK.tk) return;
      a.playbackRate = SK.rate;
      if (Math.abs(a.currentTime - t0) < 0.05) { unmute(); return; }
      a.addEventListener('seeked', unmute, { once: true });
      try { a.currentTime = t0; } catch (e) { unmute(); }
      setTimeout(unmute, 1200);
    };
    if (SK.src !== src) { SK.src = src; a.preload = 'auto'; a.src = src; }
    a.defaultPlaybackRate = SK.rate; a.playbackRate = SK.rate;
    a.muted = true;
    if (a.readyState >= 1) seek(); else a.addEventListener('loadedmetadata', seek, { once: true });
    a.play().catch(e => { if (tk === SK.tk && e.name !== 'AbortError' && e.name !== 'NotAllowedError') fail(); });
  };
  /* 主要做法（一句、1x）：把 mp3 解碼成 AudioBuffer，用 Web Audio 從「精確的秒數」開始播、播到精確的秒數就停（取樣點等級，不受 mp3 seek 誤差影響） */
  const AC = window.AudioContext || window.webkitAudioContext;
  if (seg && SK.rate === 1 && AC) {
    let ctx; try { ctx = SK.ctx || (SK.ctx = new AC()); ctx.resume(); } catch (e) { ctx = null; }
    if (ctx) {
      skBuf(ctx, src).then(buf => {
        if (tk !== SK.tk) return;
        const g = ctx.createGain(), s = ctx.createBufferSource(), now = ctx.currentTime;
        const off = Math.max(0, Math.min(buf.duration - 0.05, t0)), dur = Math.max(0.2, Math.min(buf.duration - off, t1 - off));
        s.buffer = buf; s.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + 0.012); // 極短淡入淡出，避免爆音
        g.gain.setValueAtTime(1, now + Math.max(0.012, dur - 0.03)); g.gain.linearRampToValueAtTime(0, now + dur);
        s.onended = () => { if (tk === SK.tk) { SK.node = null; try { s.disconnect(); g.disconnect(); } catch (e) {} done(); } };
        SK.node = s; s.start(now, off, dur);
      }).catch(() => { if (tk === SK.tk) playEl(); });
      skAfter(); return;
    }
  }
  playEl();
  skAfter();
}
const SK_LEAD = 0.1, SK_TAIL = 0.15;
const skTrim = (id, i) => ((skRec(id).tr || {})[i]) || [0, 0];
function skBuf(ctx, src) { // 解碼後的整篇音檔只留一份（換篇就丟掉，省記憶體）
  if (!SK.bufs[src]) {
    SK.bufs = {};
    SK.bufs[src] = fetch(src).then(r => { if (!r.ok) throw new Error('http'); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }))
      .catch(e => { delete SK.bufs[src]; throw e; });
  }
  return SK.bufs[src];
}
function skTrimSet(k, d) { // k＝0 開頭／1 結尾／-1 重設；調完立刻重播這一句
  const x = skX(), i = SK.i; if (!x) return;
  const rc = skRec(idOf(x)); rc.tr = rc.tr || {};
  if (k < 0) delete rc.tr[i];
  else { const t = (rc.tr[i] || [0, 0]).slice(); t[k] = Math.round(Math.max(-1, Math.min(1, t[k] + d)) * 10) / 10; if (!t[0] && !t[1]) delete rc.tr[i]; else rc.tr[i] = t; }
  save(); skStopPlay(); skPlayModel(i);
}
function skTrimH(id, i) {
  const t = skTrim(id, i), f = v => (v > 0 ? '+' : '') + v.toFixed(1) + 's';
  const b = (k, d, l) => `<button onclick="skTrimSet(${k},${d})" class="${skCtl} !px-2 !py-1 text-xs">${l}</button>`;
  return `<div class="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-xs text-slate-500"><span>剪裁微調（聽起來吃字或多念時用）</span>
    <span class="inline-flex items-center gap-1">開頭 ${b(0, -0.1, '早 0.1')}<b class="min-w-[2.5rem] text-center">${f(t[0])}</b>${b(0, 0.1, '晚 0.1')}</span>
    <span class="inline-flex items-center gap-1">結尾 ${b(1, -0.1, '早 0.1')}<b class="min-w-[2.5rem] text-center">${f(t[1])}</b>${b(1, 0.1, '晚 0.1')}</span>
    ${t[0] || t[1] ? `<button onclick="skTrimSet(-1,0)" class="${skCtl} !px-2 !py-1 text-xs">重設</button>` : ''}</div>`;
}
function skAfter() { if (cur.view === 'speak') skRender(); }
function skPlayModel(i) { const x = skX(); if (x) skPlay(x, i >= 0 ? SK.sents[i] : null, i); }
function skPlayTiming(id, i) { // 維護頁：試聽 timing 的某一段
  const x = DATA.find(d => idOf(d) === id), t = x && x.timing && x.timing[i]; if (!t) return;
  skPlay(x, { t: String(x.passage).slice(t.from, t.to), start: t.start, end: t.end }, 'tm' + i);
}
function skHl(t) {
  let idx = -1;
  SK.sents.forEach((s, k) => { if (s.start != null && s.start <= t + 0.05) idx = k; });
  if (idx === SK.hl) return;
  SK.hl = idx;
  document.querySelectorAll('#sk-whole .sks').forEach(el => el.classList.toggle('sk-on', +el.dataset.i === idx));
}
function skPlayMine() {
  const r = SK.mode === 'sent' ? SK.res[SK.i] : SK.wres;
  if (!r || !r.url) return;
  if (SK.playing === 'mine') { skStopPlay(); skRender(); return; }
  skStopPlay();
  const tk = SK.tk, a = new Audio(r.url);
  SK.mine = a; SK.playing = 'mine';
  const end = () => { if (tk === SK.tk) { SK.playing = null; SK.mine = null; skRender(); } };
  a.onended = a.onerror = end;
  a.play().catch(end);
  skRender();
}

/* ================= 錄音＋語音辨識 ================= */
async function skRecToggle() {
  if (SK.st === 'rec') { skRecStop(); return; }
  if (SK.st === 'proc') return;
  skStopPlay();
  if (SK.ctx) { try { SK.ctx.suspend(); } catch (e) {} } // 錄音前先暫停播放用的 AudioContext，避免佔住音訊（iOS 會讓麥克風收不到聲）
  skCancelRec(); // 先把上一次可能殘留的辨識／錄音／麥克風串流全部關掉，避免麥克風被佔用而收不到聲音
  SK.err = ''; SK.final = ''; SK.interim = ''; SK.restart = 0; SK.stopping = false; SK.blob = null; SK.st = 'rec';
  const tk = ++SK.rtk;
  const SRc = skSR();
  if (SRc) {
    const r = new SRc(); SK.sr = r;
    r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = e => {
      if (r !== SK.sr) return;
      let fin = '', itm = '';
      for (let k = e.resultIndex; k < e.results.length; k++) { if (e.results[k].isFinal) fin += ' ' + e.results[k][0].transcript; else itm += ' ' + e.results[k][0].transcript; }
      if (fin.trim()) { SK.restart = 0; SK.final = (SK.final + ' ' + fin).trim(); }
      SK.interim = itm.trim();
      const el = document.getElementById('sk-heard'); if (el) el.textContent = (SK.final + ' ' + SK.interim).trim() || '…';
    };
    r.onerror = e => {
      if (r !== SK.sr || e.error === 'no-speech' || e.error === 'aborted') return;
      SK.err = ({ 'not-allowed': '麥克風權限被拒絕，請在瀏覽器網址列允許使用麥克風。', 'service-not-allowed': '此瀏覽器不允許語音辨識服務。', 'audio-capture': '找不到麥克風，或被其他程式佔用。', network: '語音辨識需要網路連線。' })[e.error] || ('語音辨識錯誤（' + e.error + '），請再試一次。');
      skRecStop();
    };
    r.onend = () => {
      if (r !== SK.sr) return;
      if (SK.stopping) { if (SK.srEnd) SK.srEnd(); return; }
      if (SK.st === 'rec') { // 非使用者停止（停頓太久、系統中斷）→ 自動重啟，超過上限就視為結束
        if (SK.restart++ < (SK_IOS ? 8 : 3)) { try { r.start(); return; } catch (e) {} }
        skRecStop();
      }
    };
    try { r.start(); } catch (e) { SK.sr = null; }
  }
  skMediaStart(tk);
  clearTimeout(SK.timer);
  SK.timer = setTimeout(() => { if (SK.st === 'rec' && tk === SK.rtk) skRecStop(); }, SK.mode === 'whole' ? 180000 : 45000);
  skRender();
}
async function skMediaStart(tk) {
  SK.mr = null; SK.chunks = [];
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof MediaRecorder === 'undefined') return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { return; }
  if (SK.st !== 'rec' || tk !== SK.rtk) { stream.getTracks().forEach(t => t.stop()); return; }
  SK.stream = stream;
  const mt = ['audio/webm', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  try {
    const mr = new MediaRecorder(stream, mt ? { mimeType: mt } : undefined);
    SK.mr = mr; SK.mime = mr.mimeType || mt;
    mr.ondataavailable = e => { if (e.data && e.data.size) SK.chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      if (SK.stream === stream) SK.stream = null;
      SK.blob = SK.chunks.length ? new Blob(SK.chunks, { type: SK.mime }) : null; SK.chunks = [];
      if (SK.mrDone) SK.mrDone();
    };
    mr.start();
  } catch (e) { stream.getTracks().forEach(t => t.stop()); SK.mr = null; }
}
function skRecStop() {
  if (SK.st !== 'rec') return;
  SK.st = 'proc'; SK.stopping = true; clearTimeout(SK.timer);
  const tk = SK.rtk, waits = [];
  if (SK.sr) waits.push(new Promise(res => { SK.srEnd = res; try { SK.sr.stop(); } catch (e) { res(); } }));
  if (SK.mr && SK.mr.state !== 'inactive') waits.push(new Promise(res => { SK.mrDone = res; try { SK.mr.stop(); } catch (e) { res(); } }));
  Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 1500))]).then(() => skFinish(tk));
  skRender();
}
function skCancelRec() {
  SK.rtk++; clearTimeout(SK.timer); SK.stopping = true;
  const r = SK.sr; SK.sr = null;
  if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort(); } catch (e) {} }
  const m = SK.mr; SK.mr = null;
  if (m) { m.ondataavailable = null; m.onstop = null; try { if (m.state !== 'inactive') m.stop(); } catch (e) {} }
  if (SK.stream) { SK.stream.getTracks().forEach(t => t.stop()); SK.stream = null; }
  SK.srEnd = SK.mrDone = null; SK.st = 'idle'; SK.blob = null;
}
function skStopAll() { skStopPlay(); skCancelRec(); }
function skFinish(tk) {
  if (tk !== SK.rtk || SK.st !== 'proc') return;
  const x = skX(), heard = (SK.final + ' ' + SK.interim).trim(), blob = SK.blob, mime = SK.mime, url = blob ? URL.createObjectURL(blob) : null, sup = !!skSR();
  const sr0 = SK.sr, mr0 = SK.mr;
  SK.blob = null; SK.st = 'idle'; SK.sr = null; SK.mr = null; SK.srEnd = SK.mrDone = null;
  if (sr0) { sr0.onresult = sr0.onend = sr0.onerror = null; try { sr0.abort(); } catch (e) {} } // 確實關掉辨識，釋放麥克風
  if (mr0) { mr0.ondataavailable = null; mr0.onstop = null; try { if (mr0.state !== 'inactive') mr0.stop(); } catch (e) {} }
  if (SK.stream) { SK.stream.getTracks().forEach(t => t.stop()); SK.stream = null; }
  const r = { url, heard, sup, blob, mime };
  if (SK.mode === 'sent') {
    const i = SK.i, old = SK.res[i]; if (old && old.url) URL.revokeObjectURL(old.url);
    if (sup && heard) { const c = skCompare([SK.sents[i]], heard); r.pct = c.pct; r.words = c.sents[0].words; r.diff = c.diff; skBest(idOf(x), 's', i, c.pct); }
    SK.res[i] = r;
  } else {
    if (SK.wres && SK.wres.url) URL.revokeObjectURL(SK.wres.url);
    if (sup && heard) { r.c = skCompare(SK.sents, heard); r.pct = r.c.pct; skBest(idOf(x), 'w', 0, r.pct); }
    SK.wres = r;
  }
  skRender();
}

/* ================= 操作 ================= */
function skLevel(v) { // 切換評分寬嚴；已錄的結果依新標準重新計分（「最佳」紀錄不動）
  S.spkLevel = v; save();
  Object.keys(SK.res || {}).forEach(i => { const r = SK.res[i]; if (r && r.sup && r.heard && SK.sents[i]) { const c = skCompare([SK.sents[i]], r.heard); r.pct = c.pct; r.words = c.sents[0].words; r.diff = c.diff; } });
  const w = SK.wres; if (w && w.sup && w.heard) { w.c = skCompare(SK.sents, w.heard); w.pct = w.c.pct; }
  skRender();
}
/* 沒按「儲存」的錄音：換句、換模式、離開時自動丟掉（釋放 blob 記憶體） */
function skDrop(m) {
  if (m === 'sent') { Object.values(SK.res || {}).forEach(r => { if (r && r.url) try { URL.revokeObjectURL(r.url); } catch (e) {} }); SK.res = {}; }
  else { if (SK.wres && SK.wres.url) try { URL.revokeObjectURL(SK.wres.url); } catch (e) {} SK.wres = null; }
}
/* ---- 儲存語音練習：IndexedDB（每句一格，鍵＝文章id:s句號；整篇＝文章id:w）；同一格再存＝覆蓋 ---- */
let SK_DBP = null;
const skDb = () => SK_DBP || (SK_DBP = new Promise((res, rej) => { const q = indexedDB.open('toeicSpkRec', 1); q.onupgradeneeded = () => q.result.createObjectStore('r'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
const skDbDo = (mode, fn) => skDb().then(db => new Promise((res, rej) => { const tx = db.transaction('r', mode), rq = fn(tx.objectStore('r')); tx.oncomplete = () => res(rq && rq.result); tx.onerror = tx.onabort = () => rej(tx.error); }));
const skKey = () => SK.mode === 'sent' ? 's' + SK.i : 'w';
const skSv = (id, k) => ((skRec(id).sv) || {})[k];
function skSave() {
  const x = skX(), r = SK.mode === 'sent' ? SK.res[SK.i] : SK.wres; if (!x || !r || !r.blob) return;
  if (!window.indexedDB) { dnToast('此瀏覽器無法儲存錄音'); return; }
  const id = idOf(x), k = skKey(), had = !!skSv(id, k), meta = { pct: r.pct || 0, t: Date.now() };
  skDbDo('readwrite', s => s.put({ blob: r.blob, mime: r.mime, pct: meta.pct, heard: r.heard || '', t: meta.t }, id + ':' + k))
    .then(() => { const rc = skRec(id); (rc.sv = rc.sv || {})[k] = meta; save(); dnToast(had ? '已覆蓋儲存' : '已儲存語音練習'); skAfter(); })
    .catch(() => dnToast('儲存失敗'));
}
function skPlaySaved(k) {
  if (SK.playing === 'saved' && SK.pk === k) { skStopPlay(); skRender(); return; }
  skStopPlay(); const tk = SK.tk, id = SK.id;
  SK.playing = 'saved'; SK.pk = k; skRender();
  skDbDo('readonly', s => s.get(id + ':' + k)).then(rec => {
    if (tk !== SK.tk) return;
    if (!rec || !rec.blob) { skStopPlay(); dnToast('找不到這筆錄音（可能被瀏覽器清除了）'); skRender(); return; }
    const url = URL.createObjectURL(rec.blob), a = new Audio(url); SK.mine = a; SK.mineUrl = url;
    const end = () => { if (tk === SK.tk) { skStopPlay(); skRender(); } };
    a.onended = a.onerror = end; a.play().catch(end);
  }).catch(() => { if (tk === SK.tk) { skStopPlay(); skRender(); } });
}
function skDelSaved(k) {
  if (!confirm('確定刪除已儲存的錄音？')) return;
  const id = SK.id; skStopPlay();
  skDbDo('readwrite', s => s.delete(id + ':' + k)).catch(() => {}).then(() => { const rc = skRec(id); if (rc.sv) delete rc.sv[k]; save(); skAfter(); });
}
function skSavedH() {
  const x = skX(); if (!x) return '';
  const k = skKey(), v = skSv(idOf(x), k); if (!v) return '';
  const on = SK.playing === 'saved' && SK.pk === k;
  return `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-left"><p class="text-sm">💾 已儲存的錄音${v.pct ? ` <span class="rounded-full px-2 py-0.5 text-xs font-bold ${skPctCls(v.pct)}">${v.pct}%</span>` : ''} <span class="text-xs text-slate-500">${new Date(v.t).toLocaleString('zh-TW')}</span></p>
    <div class="flex flex-wrap gap-2 mt-2"><button onclick="skPlaySaved('${k}')" class="${skCtl}">${on ? '⏹ 停止' : '▶ 聽已儲存的錄音'}</button><button onclick="skDelSaved('${k}')" class="${skCtl}">🗑 刪除</button></div></div>`;
}
function skMode(m) { skStopAll(); skDrop(SK.mode); SK.mode = m; S.spkMode = m; save(); skRender(); }
function skGo(i) { skStopAll(); skDrop('sent'); SK.i = Math.max(0, Math.min(SK.sents.length - 1, i)); SK.err = ''; skRender(); }
function skRate(r) { SK.rate = r; if (SK.au) SK.au.playbackRate = r; skRender(); }
function skHide() { SK.hide = !SK.hide; skRender(); }
function skRetry() { skStopAll(); if (SK.mode === 'sent') { const o = SK.res[SK.i]; if (o && o.url) URL.revokeObjectURL(o.url); delete SK.res[SK.i]; } else { if (SK.wres && SK.wres.url) URL.revokeObjectURL(SK.wres.url); SK.wres = null; } skRender(); }
function skBack() { skStopAll(); skDrop('sent'); skDrop('whole'); SK.bufs = {}; cur.view = 'day'; render(); window.scrollTo({ top: 0 }); }
function openSpeak() { cur.view = 'speak'; push(); render(); window.scrollTo({ top: 0 }); }
document.addEventListener('visibilitychange', () => { if (document.hidden) skStopAll(); });
window.addEventListener('pagehide', () => skStopAll());

/* ================= 畫面 ================= */
(function () { // .sks：整篇模式中可點、可高亮的句子
  const st = document.createElement('style');
  st.textContent = '.sks{cursor:pointer;border-radius:4px;transition:background .15s}.sks:hover{background:rgba(99,102,241,.12)}.sks.sk-on{background:rgba(251,191,36,.45)}';
  document.head.appendChild(st);
})();

function skSummary(x) {
  const r = (S.spk || {})[idOf(x)], n = skBuild(x).length;
  if (!r) return '尚未練習';
  const ok = Object.values(r.s || {}).filter(v => v >= SK_PASS).length, done = skDone(x);
  return (done ? '✅ 完成語音練習 · ' : '') + `句子達標 ${ok}/${n}${r.w ? ' · 整篇最佳 ' + r.w + '%' : ''}` + (done && r.at ? ' · ' + new Date(r.at).toLocaleDateString('zh-TW') : '');
}
function skEntryHtml(x) {
  return `<div class="flex items-center justify-between mt-4 mb-8 gap-2"><button onclick="openSpeak()" class="font-bold text-lg cursor-pointer">▸ 語音練習</button><span class="text-sm ${skDone(x) ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-slate-500'}">${skSummary(x)}</span></div>`;
}

function skNotes(x) {
  const n = [], t = tmInfo(x);
  if (!window.isSecureContext) n.push('麥克風需要 https 或 localhost；直接雙擊（file://）開啟時無法錄音。');
  if (!skSR()) n.push('此瀏覽器不支援語音辨識（建議用 Chrome／Edge／Safari），只能錄音後回放，沒有自動評分。');
  if (t.state === 'none') n.push('這篇還沒有 timing：句子由程式自動切分，「聽原音」使用機器發音。請到維護頁完成 timing。');
  else if (t.state === 'bad') n.push('這篇的 timing 資料有誤（請到維護頁查看）：句子由程式自動切分，「聽原音」使用機器發音。');
  else if (t.state === 'partial') n.push('這篇的 timing 沒涵蓋全部句子：漏掉的句子，「聽原音」使用機器發音。');
  if (!skMp3Ok(x)) n.push('找不到這篇的 mp3：「聽原音」使用機器發音。');
  return n.length ? `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3 mb-4 text-xs text-amber-800 dark:text-amber-300 space-y-1">${n.map(s => `<p>⚠ ${esc(s)}</p>`).join('')}</div>` : '';
}
const skCtl = 'rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300';
const skSeg = (on) => `rounded-lg px-3 py-2 text-sm font-medium cursor-pointer ${on ? 'bg-indigo-600 text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'}`;
function skMic() {
  const rec = SK.st === 'rec', proc = SK.st === 'proc';
  const c = rec ? 'bg-rose-600 text-white animate-pulse' : proc ? 'bg-slate-300 dark:bg-slate-700 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 text-white';
  const lbl = rec ? '🔴 錄音中…念完再點一次停止' : proc ? '⏳ 辨識中…' : (SK.mode === 'whole' ? '點麥克風，念完整篇' : '點麥克風，念出這一句');
  return `<div class="flex flex-col items-center gap-2"><button onclick="skRecToggle()" ${proc ? 'disabled' : ''} class="h-16 w-16 rounded-full text-2xl shadow ${c}" aria-label="錄音">${rec ? '⏹' : '🎙'}</button><p class="text-sm text-slate-500">${lbl}</p>
    <p id="sk-heard" class="min-h-[1.25rem] text-xs text-slate-500 italic break-words max-w-full">${rec ? esc((SK.final + ' ' + SK.interim).trim()) : ''}</p>
    ${SK.err ? `<p class="text-xs text-rose-600 dark:text-rose-400">${esc(SK.err)}</p>` : ''}</div>`;
}
function skDiffH(r) { // 你說的文字：念錯／多念標紅，漏念的用 ( ) 顯示
  const d = r.diff || (r.c && r.c.diff);
  if (!d || !d.length) return `<p class="text-xs text-slate-500 mt-2 break-words">辨識到：${esc(r.heard)}</p>`;
  const h = d.map(o => o.k === 'ok' ? esc(o.t) : o.k === 'bad'
    ? `<span class="text-rose-600 dark:text-rose-400 font-bold underline decoration-wavy decoration-rose-400/70">${esc(o.t)}</span>`
    : `<span class="text-amber-600 dark:text-amber-400">(${esc(o.t)})</span>`).join(' ');
  return `<div class="mt-3"><p class="text-xs text-slate-500 mb-1">你說的（<span class="text-rose-600 dark:text-rose-400 font-bold">紅字</span>＝念錯或多念，<span class="text-amber-600 dark:text-amber-400">(括號)</span>＝漏念）</p><p class="text-sm leading-relaxed break-words">${h}</p></div>`;
}
function skResultH(r, wordsH) { // r：本次結果；wordsH：已上色的字詞 HTML（句子模式用）
  if (!r) return '';
  let head;
  if (!r.sup) head = '<span class="text-sm">錄音完成。此瀏覽器沒有自動評分，請回放後對照原文。</span>';
  else if (!r.heard) head = '<span class="text-sm text-rose-600 dark:text-rose-400">沒有辨識到聲音，靠近麥克風再試一次。</span>';
  else head = `<span class="rounded-full px-3 py-1 text-sm font-bold ${skPctCls(r.pct)}">${r.pct}%</span><span class="text-sm">${skMsg(r.pct)}</span>`;
  return `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-left"><div class="flex flex-wrap items-center gap-2 mb-2">${head}</div>
    ${wordsH ? `<p class="leading-relaxed">${wordsH}</p>` : ''}
    ${r.heard ? skDiffH(r) : ''}
    <div class="flex flex-wrap gap-2 mt-3">${r.url ? `<button onclick="skPlayMine()" class="${skCtl}">${SK.playing === 'mine' ? '⏹ 停止回放' : '▶ 聽我的錄音'}</button>` : ''}${r.blob ? `<button onclick="skSave()" class="${skCtl}">💾 ${skSv(SK.id, skKey()) ? '覆蓋儲存' : '儲存語音練習'}</button>` : ''}<button onclick="skRetry()" class="${skCtl}">↻ 重來</button></div></div>`;
}

function skSentH(x) {
  const id = idOf(x), N = SK.sents.length, i = SK.i, s = SK.sents[i], r = SK.res[i], best = skRec(id).s[i] || 0;
  if (!N) return `<div class="${card} p-8 text-center text-sm text-slate-500">這篇沒有可練習的句子。</div>`;
  const strip = SK.sents.map((q, k) => {
    const b = skRec(id).s[k] || 0;
    const c = k === i ? 'ring-2 ring-indigo-500 ' : '';
    return `<button onclick="skGo(${k})" class="${c}h-9 min-w-[2.25rem] px-2 rounded-lg text-sm font-semibold cursor-pointer ${b >= 80 ? TM_COLOR.ok : b > 0 ? TM_COLOR.partial : 'bg-slate-100 dark:bg-slate-800'}">${k + 1}</button>`;
  }).join('');
  const hidden = SK.hide && !r;
  const body = hidden ? '<span class="text-slate-400">（文字已遮住：先聽原音，再複誦）</span>' : (r && r.words ? skWordsH(r.words) : esc(s.t));
  const playing = SK.playing === 'model' && SK.pk === i;
  return `<section class="${card} p-4 md:p-6 mb-4">
    <div class="flex items-center justify-between mb-3 gap-2"><span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">第 ${i + 1} / ${N} 句</span><span class="text-xs text-slate-500">${best ? '本句最佳 ' + best + '%' : ''}</span></div>
    <p class="text-lg leading-relaxed">${body}</p>
    <div class="flex flex-wrap items-center gap-2 mt-4">
      <button onclick="skPlayModel(${i})" class="${skCtl}">${playing ? '⏹ 停止' : '🔊 聽原音'}</button>
      <button onclick="skRate(1)" class="${skSeg(SK.rate === 1)}">1x</button><button onclick="skRate(0.75)" class="${skSeg(SK.rate === 0.75)}">0.75x</button>
      <button onclick="skHide()" class="${skCtl}">${SK.hide ? '👁 顯示文字' : '🙈 遮住文字'}</button>
    </div>${s.start != null && skMp3Ok(x) ? skTrimH(id, i) : ''}</section>
  <section class="${card} p-4 md:p-6 mb-4">${skMic()}${skResultH(r, '')}${skSavedH()}</section>
  <div class="flex items-center justify-between gap-2 mb-4">
    <button onclick="skGo(${i - 1})" ${i ? '' : 'disabled'} class="${btn} border border-slate-300 dark:border-slate-700 disabled:opacity-40">← 上一句</button>
    ${i < N - 1 ? `<button onclick="skGo(${i + 1})" class="${btn} bg-indigo-600 text-white">下一句 →</button>` : `<button onclick="skMode('whole')" class="${btn} bg-indigo-600 text-white">挑戰整篇 →</button>`}
  </div>
  <div class="flex flex-wrap gap-1.5">${strip}</div>
  <p class="mt-2 text-xs text-slate-400">數字依序是各句；綠＝最佳 ≥ 80%，黃＝練過但未達 80%。</p>`;
}

function skWholeH(x) {
  const N = SK.sents.length, r = SK.wres, best = skRec(idOf(x)).w || 0;
  if (!N) return `<div class="${card} p-8 text-center text-sm text-slate-500">這篇沒有可練習的內容。</div>`;
  let txt = '';
  if (SK.hide && !r) txt = '<span class="text-slate-400">（文稿已遮住：先聽原音，再憑記憶複述）</span>';
  else SK.sents.forEach((s, k) => {
    const sep = skSepBefore(k), inner = r && r.c ? skWordsH(r.c.sents[k].words) : esc(s.t);
    txt += sep + `<span class="sks" data-i="${k}" onclick="skPlayModel(${k})" title="點一下聽這一句">${inner}</span>`;
  });
  const weak = r && r.c ? r.c.sents.map((q, k) => ({ k, p: q.pct })).filter(q => q.p < 70) : [];
  const playing = SK.playing === 'model' && SK.pk === -1;
  return `<section class="${card} p-4 md:p-6 mb-4">
    <div class="flex items-center justify-between mb-3 gap-2"><span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">整篇 · ${N} 句</span><span class="text-xs text-slate-500">${best ? '整篇最佳 ' + best + '%' : ''}</span></div>
    <p id="sk-whole" class="whitespace-pre-line leading-relaxed">${txt}</p>
    <div class="flex flex-wrap items-center gap-2 mt-4">
      <button onclick="skPlayModel(-1)" class="${skCtl}">${playing ? '⏹ 停止' : '🔊 聽整篇原音'}</button>
      <button onclick="skRate(1)" class="${skSeg(SK.rate === 1)}">1x</button><button onclick="skRate(0.75)" class="${skSeg(SK.rate === 0.75)}">0.75x</button>
      <button onclick="skHide()" class="${skCtl}">${SK.hide ? '👁 顯示文稿' : '🙈 遮住文稿'}</button>
    </div>
    <p class="mt-2 text-xs text-slate-400">點文稿裡的任一句，可單獨聽那一句。</p></section>
  <section class="${card} p-4 md:p-6 mb-4">${skMic()}${skResultH(r, '')}${skSavedH()}
    ${weak.length ? `<div class="mt-4 text-left"><p class="text-sm font-semibold mb-2">需要加強的句子（&lt; 70%）</p><div class="space-y-1">${weak.map(q => `<button onclick="skMode('sent');skGo(${q.k})" class="w-full text-left rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm flex items-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"><span class="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${skPctCls(q.p)}">${q.p}%</span><span class="truncate flex-1">${q.k + 1}. ${esc(SK.sents[q.k].t)}</span><span class="shrink-0 text-xs text-indigo-600 dark:text-indigo-300">練這句</span></button>`).join('')}</div></div>` : ''}
  </section>`;
}

function skRender() {
  const x = skX();
  if (!x) { main.innerHTML = `<div class="${card} p-8 text-center text-sm text-slate-500">找不到這篇文章。</div>`; return; }
  if (SK.id !== idOf(x)) skInit(x);
  const tab = (m, label) => `<button onclick="skMode('${m}')" class="${skSeg(SK.mode === m)} flex-1 md:flex-none md:px-6">${label}</button>`;
  main.innerHTML = `<header class="mb-4">
      <div class="flex items-center justify-between gap-2"><h2 class="text-xl md:text-2xl font-bold">🎙 語音練習</h2>
        <button onclick="skBack()" class="${btn} border border-slate-300 dark:border-slate-700 !py-1.5 text-xs hidden md:block">← 回到 Day ${x.day} 內文</button></div>
      <span class="inline-block mt-2 text-xs rounded-full px-3 py-1 bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-medium">Week ${x.week} · Day ${x.day} · ${esc(x.tag || '')}</span>
    </header>
    ${skNotes(x)}
    <div class="flex gap-2 mb-3">${tab('sent', '一句一句')}${tab('whole', '整篇')}</div>
    <div class="flex flex-wrap items-center gap-2 mb-4 text-xs"><span class="text-slate-500">評分</span><button onclick="skLevel('loose')" class="${skSeg(skLoose())} !py-1">寬鬆</button><button onclick="skLevel('strict')" class="${skSeg(!skLoose())} !py-1">嚴格</button><span class="text-slate-400">${skLoose() ? '相近的字（單複數、時態）算對，漏念 a／the／to／of 不扣分' : '每個字都要念對'}</span></div>
    ${SK.mode === 'sent' ? skSentH(x) : skWholeH(x)}
    <button onclick="skBack()" class="${btn} md:hidden w-full mt-6 border border-slate-300 dark:border-slate-700">← 返回內文</button>`;
}
