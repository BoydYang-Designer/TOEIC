/* speak.js — Daily 語音練習 ＋ timing 檢查
   依賴（執行時才用到，載入順序在 audio.js 之後、daily.js 之前即可）：
   daily.js 的 DATA／S／save／cur／find／idOf／esc／card／btn／main／render／push／audioSrc／dyHas／setVoice
   audio.js 的 AU
   timing.js 的 tmInfo／tmBadge／TM_LABEL／TM_COLOR（需先載入 timing.js）
   ② 語音練習頁       cur.view === 'speak'：「一句一句」與「整篇」兩種模式
                     錄音＋語音辨識＋逐字比對的做法沿用 quiz.js（MediaRecorder＋SpeechRecognition＋LCS）
   ③ 麥克風重置       手機錄幾次之後收不到聲音時，按「🔧 重置麥克風」把辨識、錄音、麥克風、AudioContext 全部關掉重來（skReset）
   ④ 語調曲線         一句一句模式畫出這句原音的音高＋音量曲線；資料來自 daily.json 該天的 prosody（由 daily_timestamps.py 產生） */

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
  au: null, src: '', ctx: null, node: null, iv: null, bufs: {}, mine: null, playing: null, pk: null, tk: 0, hl: -1, bad: {},
  paused: false, weak: null, // paused＝整篇錄音暫停中；weak＝整篇剛念完、沒達標的句子（給一句一句練習用）
  lv: null, lvRaf: 0,    // 整篇錄音時的即時追蹤狀態（skLiveInit 建立；錄完設回 null）
  fail: 0,               // 連續幾次沒收到聲音（≥2 就提醒按重置）
  phs: null, cr: null, cd: null, sx: null, raf: 0 // 語調曲線的播放游標：phs＝取得目前播放到的 mp3 秒數；cr＝曲線涵蓋的秒數範圍
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
  const wk = r.wk || {};
  return n > 0 && Object.keys(r.s || {}).filter(k => r.s[k] >= SK_PASS && !wk[k]).length >= n;
}
function skBest(id, kind, i, pct) {
  const r = skRec(id);
  if (kind === 's') { r.s[i] = Math.max(r.s[i] || 0, pct); if (pct >= SK_PASS && r.wk) delete r.wk[i]; } // 這次念到達標，就解除「整篇沒念好」的標記
  else r.w = Math.max(r.w || 0, pct);
  const x = skX(); if (x && idOf(x) === id && !r.at && skDone(x)) r.at = Date.now(); // 記錄第一次完成的時間
  save();
}

/* 句子清單：有效的 timing 為主；timing 沒涵蓋的文字用切句補上（無時間，聽原音改機器發音） */
function skBuild(x) {
  const p = String(x.passage || ''), st = tmInfo(x).state, base = (st === 'ok' || st === 'partial') ? x.timing : [], segs = [];
  let pos = 0;
  const gap = (a, b) => splitSent(p, a, b).forEach(s => segs.push(s));
  base.forEach(t => { if (t.from > pos) gap(pos, t.from); segs.push({ from: t.from, to: t.to, start: t.start, end: t.end, words: t.words }); pos = t.to; });
  if (pos < p.length) gap(pos, p.length);
  return skMerge(p, segs.map(s => Object.assign(s, { t: p.slice(s.from, s.to).trim() })).filter(s => /[A-Za-z0-9]/.test(s.t)));
}
/* 太短的句子（少於 SK_MIN 個字）不單獨測驗，併到相鄰的一句；併完最多 SK_MAX 個字，避免一句太長。
   優先併到同一段落、字數較少的那一邊；兩邊都會超過上限就維持單獨一句。
   注意：句子編號會因此改變（已存的「各句最佳」「剪裁微調」「儲存的錄音」是依編號記的）。 */
/* 對話開頭的說話者標籤（Customer: ／ Agent: ／ Woman 1: ／ Mr. Lee: ）：畫面照常顯示，但評分、字數、機器發音都不算 */
const SK_LAB = /^\s*[A-Z][A-Za-z0-9.'’-]*(?:\s+[A-Za-z0-9.'’-]+){0,2}\s*:(?:\s+|$)/;
const skStrip = t => String(t).split('\n').map(l => l.replace(SK_LAB, '')).join('\n');
const SK_MIN = 5, SK_MAX = 28;
const skWc = t => (skStrip(t).match(/\S*[A-Za-z0-9]\S*/g) || []).length;
function skMerge(p, L) {
  L = L.slice();
  const join = (a, b) => {
    const o = { from: a.from, to: b.to, t: p.slice(a.from, b.to).trim() };
    if (a.start != null && b.start != null) { o.start = a.start; o.end = b.end; if (a.words && b.words) o.words = a.words.concat(b.words); } // 兩句都有 timing 才保留原音；否則整句改用機器發音
    return o;
  };
  let i = 0;
  while (i < L.length) {
    const s = L[i], n = skWc(s.t);
    if (L.length < 2 || n >= SK_MIN) { i++; continue; }
    const c = [];
    if (i + 1 < L.length) c.push({ at: i, len: n + skWc(L[i + 1].t), para: /\n\s*\n/.test(p.slice(s.to, L[i + 1].from)) });
    if (i > 0) c.push({ at: i - 1, len: n + skWc(L[i - 1].t), para: /\n\s*\n/.test(p.slice(L[i - 1].to, s.from)) });
    const ok = c.filter(q => q.len <= SK_MAX).sort((a, b) => (a.para - b.para) || (a.len - b.len));
    if (!ok.length) { i++; continue; }
    const k = ok[0].at;
    L.splice(k, 2, join(L[k], L[k + 1]));
    i = Math.min(i, k); // 併完再檢查一次（可能還是太短）
  }
  return L;
}
function skInit(x) {
  skStopAll();
  SK.id = idOf(x); SK.sents = skBuild(x); SK.hasTiming = SK.sents.some(s => s.start != null);
  skDrop('sent'); skDrop('whole'); SK.bufs = {};
  SK.inl = false; SK.i = 0; SK.res = {}; SK.wres = null; SK.mode = S.spkMode === 'whole' ? 'whole' : 'sent';
  SK.hide = false; SK.rate = 1; SK.err = ''; SK.hl = -1; SK.weak = null; SK.pend = null;
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
function skDigRun(arr, own) { // 相鄰的純數字字合併；own（可省略）跟著合併
  const A = [], O = [], D = t => /^\d+$/.test(t);
  arr.forEach((t, i) => {
    if (A.length && D(t) && D(A[A.length - 1])) { A[A.length - 1] += t; if (own) O[O.length - 1] = O[O.length - 1].concat(own[i]); }
    else { A.push(t); if (own) O.push(own[i]); }
  });
  return [A, O];
}
/* sents：[{t}]；heard：辨識到的整段文字。回傳 {pct, sents:[{pct, words:[{w, ok}]}]} */
function skCompare(sents, heard) {
  const loose = skLoose();
  const H = skToks(heard), T = [], own = [];
  const disp = sents.map(s => { // 說話者標籤的字 k＝[]：不參與比對，也不扣分
    const out = [];
    String(s.t).split('\n').forEach(line => {
      const lab = (SK_LAB.exec(line) || [''])[0];
      (lab.match(/\S+/g) || []).forEach(w => out.push({ w, k: [] }));
      (line.slice(lab.length).match(/\S+/g) || []).forEach(w => out.push({ w, k: skRaw(w) }));
    });
    return out;
  });
  const R = [], RO = []; // 文稿的每個原始字，以及它屬於哪一句的哪個字（英文數字詞要跨字合併，如 twenty five → 25）
  disp.forEach((ws, si) => ws.forEach((d, wi) => d.k.forEach(k => { R.push(k); RO.push([si, wi]); })));
  skNumMergeIx(R).forEach(o => { T.push(o.t); own.push(o.ix.map(i => RO[i])); });
  /* 連續的數字合併成一個字：1234 ＝ 1 2 3 4（one two three four）＝ 12 34（twelve thirty four）＝ 1,234；電話、房號、時間也一樣 */
  { const c = skDigRun(T, own), h = skDigRun(H);
    T.length = 0; c[0].forEach(t => T.push(t)); own.length = 0; c[1].forEach(o => own.push(o)); H.length = 0; h[0].forEach(t => H.push(t)); }
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
  SK.playing = null; SK.pk = null; SK.hl = -1; SK.phs = null;
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
      const u = new SpeechSynthesisUtterance(skStrip(seg ? seg.t : String(x.passage || '')));
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
    SK.phs = { get: () => (a.muted ? -1 : a.currentTime) }; skPhLoop();
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
        SK.phs = { get: () => off + (ctx.currentTime - now) }; skPhLoop();
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
function skPlayMine(sc) {
  sc = sc || (skIsSent() ? 's' : 'w');
  const r = sc === 's' ? SK.res[SK.i] : SK.wres;
  if (!r || !r.url) return;
  if (SK.playing === 'mine' && SK.pm === sc) { skStopPlay(); skRender(); return; }
  skStopPlay();
  const tk = SK.tk, a = new Audio(r.url);
  SK.mine = a; SK.playing = 'mine'; SK.pm = sc;
  const end = () => { if (tk === SK.tk) { SK.playing = null; SK.mine = null; skRender(); } };
  a.onended = a.onerror = end;
  a.play().catch(end);
  skRender();
}

/* ================= 整篇：一邊念、一邊即時追蹤 =================
   用瀏覽器語音辨識的「暫時結果」（interim）：每收到一次，就把目前聽到的字依序對到文稿——
   念對的字變綠；跳過或念錯的字變紅（波浪底線）；橘底＝目前念到的位置；還沒念到的維持原色。
   對法是「往前看幾個字」的單向追蹤（不是 skCompare 的整段 LCS，否則聽到一個 to 就會對到文稿最後面的 to）。
   辨識會漏字或改字，所以這裡只是即時參考；念完按停止後，仍以 skCompare 的完整評分為準。 */
function skLiveInit() {
  const disp = SK.sents.map(s => { // 與 skCompare 相同：說話者標籤（k＝[]）不參與比對
    const out = [];
    String(s.t).split('\n').forEach(line => {
      const lab = (SK_LAB.exec(line) || [''])[0];
      (lab.match(/\S+/g) || []).forEach(w => out.push({ w, k: [] }));
      (line.slice(lab.length).match(/\S+/g) || []).forEach(w => out.push({ w, k: skRaw(w) }));
    });
    return out;
  });
  const R = [], RO = [], T0 = [], own0 = [];
  disp.forEach((ws, si) => ws.forEach((d, wi) => d.k.forEach(k => { R.push(k); RO.push([si, wi]); })));
  skNumMergeIx(R).forEach(o => { T0.push(o.t); own0.push(o.ix.map(i => RO[i])); });
  const c = skDigRun(T0, own0);
  SK.lv = { disp, T: c[0], own: c[1], st: new Array(c[0].length).fill(0), p: 0 };
}
function skLiveAlign(heard) {
  const L = SK.lv; if (!L) return;
  const loose = skLoose(), T = L.T, n = T.length, W = 6, H = skDigRun(skToks(heard))[0], st = new Array(n).fill(0);
  const triv = t => loose && SK_SKIP.has(t);
  let p = 0;
  for (let i = 0; i < H.length && p < n; i++) {
    let q = -1, adv = 1, hs = 1;
    for (let j = p; j < Math.min(n, p + W); j++) {
      let m = 0;
      if (skEq(H[i], T[j], loose)) m = 1;
      else if (j + 1 < n && !/\d/.test(T[j] + T[j + 1]) && H[i] === T[j] + T[j + 1]) m = 2; // 文稿 check in／聽到 checkin
      else if (i + 1 < H.length && !/\d/.test(H[i] + H[i + 1]) && H[i] + H[i + 1] === T[j]) { m = 1; hs = 2; } // 文稿 email／聽到 e mail
      if (!m) continue;
      let skipped = 0; for (let u = p; u < j; u++) if (!triv(T[u])) skipped++;
      if (skipped >= 2) { // 一次跳過兩個以上的字：要下一個聽到的字也對得上才算（避免辨識亂冒一個常見字就整段跳過去）
        const nx = H[i + hs]; if (!(nx && (skEq(nx, T[j + m], loose) || (T[j + m + 1] != null && skEq(nx, T[j + m + 1], loose))))) { hs = 1; continue; }
      }
      q = j; adv = m; break;
    }
    if (q < 0) continue;
    for (let u = p; u < q; u++) st[u] = triv(T[u]) ? 1 : 2;
    for (let u = q; u < q + adv; u++) st[u] = 1;
    p = q + adv; i += hs - 1;
  }
  const prev = L.st, pp = L.p; // 進度只前進不倒退：辨識的暫時結果被改字時，已經變綠的字不會跳回去
  for (let u = 0; u < n; u++) { if (prev[u] === 1) st[u] = 1; else if (!st[u] && prev[u]) st[u] = prev[u]; }
  L.st = st; L.p = Math.max(p, pp);
}
function skLiveSync() { // 把追蹤結果畫到文稿的字上（只改 class，不重畫整頁）
  const L = SK.lv, root = document.getElementById('sk-whole'); if (!L || !root) return;
  const tot = L.disp.map(ws => ws.map(() => [0, 0])); // [念對的 token 數, 念錯／跳過的 token 數]
  L.own.forEach((os, j) => { if (L.st[j] === 1) os.forEach(([si, wi]) => tot[si][wi][0]++); else if (L.st[j] === 2) os.forEach(([si, wi]) => tot[si][wi][1]++); });
  const cp = L.p < L.T.length ? L.own[L.p][0] : null; let curEl = null;
  root.querySelectorAll('.skl').forEach(el => {
    const si = +el.dataset.s, wi = +el.dataset.w, d = L.disp[si] && L.disp[si][wi]; if (!d) return;
    const t = tot[si][wi], c = 'skl' + (!d.k.length ? '' : t[1] ? ' bad' : t[0] === d.k.length ? ' ok' : '');
    if (el.className !== c) el.className = c;
    if (cp && cp[0] === si && cp[1] === wi) curEl = el;
  });
  root.querySelectorAll('.sks').forEach(el => el.classList.toggle('sk-cs', !!cp && +el.dataset.i === cp[0])); // 目前這一句：淡藍底
  const hl = document.getElementById('sk-lvh'); // 橘框：下一個要念的字；用一個會滑動的框，不是每個字各自閃
  if (hl) {
    if (curEl) { const rb = root.getBoundingClientRect(), b = curEl.getClientRects()[0] || curEl.getBoundingClientRect();
      hl.style.transform = 'translate(' + (b.left - rb.left - 3).toFixed(1) + 'px,' + (b.top - rb.top - 1).toFixed(1) + 'px)'; hl.style.width = (b.width + 6).toFixed(1) + 'px'; hl.style.height = (b.height + 2).toFixed(1) + 'px'; hl.style.opacity = 1; }
    else hl.style.opacity = 0;
  }
  if (curEl && Date.now() - (SK.lvScT || 0) > 700) { const b = curEl.getBoundingClientRect(); if (b.bottom > innerHeight - 150 || b.top < 110) { SK.lvScT = Date.now(); curEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
}
if (!window._skLvResize) { window._skLvResize = 1; window.addEventListener('resize', () => { if (SK.lv) skLiveSync(); }); }
function skLiveSched() {
  if (SK.lvRaf) return;
  SK.lvRaf = requestAnimationFrame(() => { SK.lvRaf = 0; if (SK.lv && SK.st === 'rec') { skLiveAlign((SK.final + ' ' + SK.interim).trim()); skLiveSync(); } });
}

/* ================= 錄音＋語音辨識 ================= */
/* ---- 手機麥克風穩定化（重點說明）----
   手機卡麥克風的三個主因：
   ① 語音辨識（SpeechRecognition）和錄音（getUserMedia＋MediaRecorder）同時搶同一支麥克風，第二次之後常常有一邊收不到聲音。
      → 手機預設只開語音辨識（SK_MOB && S.spkMr !== 1）；要錄音檔可在畫面上打開「錄音檔」，但手機可能不穩。
   ② 上一次的辨識／錄音／播放（AudioContext、<audio>、TTS）還沒真正釋放，就馬上開下一次。
      → 錄音前先把所有播放資源放掉，並且距離上次收麥克風至少隔一小段時間（SK_SETTLE）才開始。
   ③ 辨識自動重啟時 start() 丟 InvalidStateError 被吞掉，畫面看起來在錄，其實辨識已經死了。
      → 重啟改成「建新的辨識物件＋失敗會重試」，並加上「4.5 秒內一個聲音事件都沒有就自動重開」的看門狗。 */
const SK_MOB = SK_IOS || /Android/i.test(navigator.userAgent);
const skUseMr = () => !skSR() || !SK_MOB || S.spkMr === 1; // 是否同時用 MediaRecorder 錄音檔
const skSettle = () => (SK.fail ? 700 : SK_MOB ? 350 : 0);  // 兩次麥克風之間至少隔幾毫秒
function skReleaseAudio() { // 把所有會佔用音訊通道的東西都放掉（播放原音、Web Audio、<audio>、TTS、首頁播放器）
  skStopPlay(); skCloseCtx();
  if (SK.au) { try { SK.au.pause(); SK.au.removeAttribute('src'); SK.au.load(); } catch (e) {} SK.au = null; SK.src = ''; }
  if (typeof spStop === 'function') { try { spStop(); } catch (e) {} }
  try { speechSynthesis.cancel(); } catch (e) {}
}
function skSrNew(tk) { // 建一個新的語音辨識物件（每次重啟都用新的，比重複 start 同一個穩）
  const SRc = skSR(); if (!SRc) return null;
  const r = new SRc(); SK.sr = r;
  r.lang = 'en-US'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
  const up = () => { if (r === SK.sr) SK.everUp = true; }; // 收到任何「有聽到聲音」的事件＝麥克風是通的
  r.onaudiostart = r.onsoundstart = r.onspeechstart = up;
  r.onresult = e => {
    if (r !== SK.sr) return;
    SK.everUp = true; SK.rsT = []; // 有收到辨識結果＝還正常，重啟計數歸零
    let fin = '', itm = '';
    for (let k = e.resultIndex; k < e.results.length; k++) { if (e.results[k].isFinal) fin += ' ' + e.results[k][0].transcript; else itm += ' ' + e.results[k][0].transcript; }
    if (fin.trim()) { SK.restart = 0; SK.final = (SK.final + ' ' + fin).trim(); }
    SK.interim = itm.trim();
    const el = document.getElementById('sk-heard'); if (el) el.textContent = (SK.final + ' ' + SK.interim).trim() || '…';
    if (SK.lv) skLiveSched();
  };
  r.onerror = e => {
    if (r !== SK.sr || e.error === 'no-speech' || e.error === 'aborted') return;
    SK.err = ({ 'not-allowed': '麥克風權限被拒絕：請點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 允許，然後重新整理頁面。', 'service-not-allowed': '此瀏覽器不允許語音辨識服務。', 'audio-capture': '找不到麥克風，或被其他程式佔用。', network: '語音辨識需要網路連線。' })[e.error] || ('語音辨識錯誤（' + e.error + '），請再試一次。');
    skRecStop();
  };
  r.onend = () => {
    if (r !== SK.sr) return;
    if (SK.stopping) { if (SK.srEnd) SK.srEnd(); return; }
    if (SK.paused) { if (SK.interim) { SK.final = (SK.final + ' ' + SK.interim).trim(); SK.interim = ''; } return; } // 暫停中：辨識收掉就好，不要自動重啟
    if (SK.st === 'rec') { // 非使用者停止（念到一半停頓、瀏覽器自己斷線）→ 自動接回去，直到使用者按停止
      if (SK.interim) { SK.final = (SK.final + ' ' + SK.interim).trim(); SK.interim = ''; } // 斷線前還沒定稿的字先收進來，不要丟掉
      const now = Date.now(); SK.rsT = (SK.rsT || []).filter(t => now - t < 8000); SK.rsT.push(now);
      if (SK.rsT.length <= 6) { skSrRestart(tk, 0); return; } // 8 秒內連續斷 6 次以上才放棄（代表真的壞了：沒網路、麥克風被佔用）
      skRecStop();
    }
  };
  return r;
}
function skSrRestart(tk, n) { // 重開辨識：用新物件；start 失敗（上一個還沒完全結束）就等一下再試，不再默默放棄
  setTimeout(() => {
    if (tk !== SK.rtk || SK.st !== 'rec' || SK.stopping || SK.paused) return;
    const old = SK.sr; if (old) { old.onresult = old.onend = old.onerror = old.onaudiostart = old.onsoundstart = old.onspeechstart = null; try { old.abort(); } catch (e) {} }
    const r = skSrNew(tk);
    try { r.start(); skSrWatch(tk, r); }
    catch (e) { if (n < 8) skSrRestart(tk, n + 1); else { SK.err = '語音辨識沒辦法重新啟動，請按下方「🔧 重置麥克風」。'; skRecStop(); } }
  }, n ? 250 : 60);
}
function skSrWatch(tk, r) { // 看門狗：剛開始錄音 4.5 秒內，辨識一個聲音事件都沒有＝麥克風沒開起來，自動重開（最多 2 次）
  clearTimeout(SK.wd); if (SK.everUp) return;
  SK.wd = setTimeout(() => {
    if (r !== SK.sr || tk !== SK.rtk || SK.st !== 'rec' || SK.paused || SK.stopping || SK.everUp) return;
    if ((SK.wdN = (SK.wdN || 0) + 1) <= 2) { skSrRestart(tk, 0); return; }
    SK.err = '麥克風好像沒有收到聲音。請按下方「🔧 重置麥克風」，再錄一次。'; skRender();
  }, 4500);
}
function skRecToggle() {
  if (SK.st === 'rec') { skRecStop(); return; }
  if (SK.st === 'proc' || SK.st === 'prep') return;
  skReleaseAudio(); // 錄音前先把播放用的資源全部放掉（iOS／部分 Android 只要音訊通道還被佔著，麥克風就收不到聲）；下次播原音時會自動重開
  skCancelRec();    // 再把上一次可能殘留的辨識／錄音／麥克風串流全部關掉
  SK.err = ''; SK.final = ''; SK.interim = ''; SK.restart = 0; SK.rsT = []; SK.paused = false; SK.stopping = false; SK.blob = null; SK.wdN = 0;
  SK.st = 'prep'; skRender();
  const tk = ++SK.rtk, wait = Math.max(0, skSettle() - (Date.now() - (SK.lastEnd || 0)));
  if (wait) setTimeout(() => skRecGo(tk), wait); else skRecGo(tk); // 沒有要等就同步開始（保留使用者手勢，iOS 需要）
}
function skRecGo(tk) {
  if (tk !== SK.rtk || SK.st !== 'prep') return;
  SK.st = 'rec'; SK.everUp = false; SK.stopping = false;
  const SRc = skSR();
  SK.lv = null; if (SRc && skWholeRec()) skLiveInit(); // 整篇＋有語音辨識：開啟即時追蹤
  if (SRc) {
    const r = skSrNew(tk);
    try { r.start(); skSrWatch(tk, r); } catch (e) { SK.sr = null; SK.err = '語音辨識沒有啟動成功。請按下方「🔧 重置麥克風」，再錄一次。'; }
  }
  skMediaStart(tk);
  clearTimeout(SK.timer);
  SK.timer = setTimeout(() => { if (SK.st === 'rec' && tk === SK.rtk) skRecStop(); }, skWholeRec() ? 180000 : 45000);
  skRender();
}
async function skMediaStart(tk) {
  SK.mr = null; SK.chunks = [];
  if (!skUseMr()) return; // 手機預設不同時錄音檔，避免和語音辨識搶麥克風
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof MediaRecorder === 'undefined') return;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) {
    SK.err = e && e.name === 'NotAllowedError' ? '麥克風權限被拒絕：請點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 允許，然後重新整理頁面。' : '取不到麥克風（可能被別的 App 佔用）。請按下方「🔧 重置麥克風」，再錄一次。';
    return;
  }
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
/* 整篇：先念到這裡 → ⏸ 暫停（收掉辨識、錄音也暫停，已念的結果與顏色保留）→ ▶ 繼續（接著念下去，錄音檔接在後面） */
function skPauseToggle() {
  if (SK.st !== 'rec' || !skWholeRec()) return;
  if (!SK.paused) {
    SK.paused = true; clearTimeout(SK.timer);
    try { if (SK.mr && SK.mr.state === 'recording') SK.mr.pause(); } catch (e) {}
    try { if (SK.sr) SK.sr.stop(); } catch (e) {} // stop（不是 abort）：還沒定稿的字會先定稿再結束
  } else {
    SK.paused = false; SK.restart = 0; SK.rsT = []; const tk = SK.rtk;
    try { if (SK.mr && SK.mr.state === 'paused') SK.mr.resume(); } catch (e) {}
    const go = n => { if (SK.st !== 'rec' || SK.paused || tk !== SK.rtk || !SK.sr) return; try { SK.sr.start(); } catch (e) { if (n < 6) setTimeout(() => go(n + 1), 250); else { SK.err = '語音辨識沒辦法繼續，請按 ⏹ 結束後再試。'; skRender(); } } }; // 上一個辨識還沒完全結束時 start 會丟 InvalidStateError，等一下再試
    go(0);
    clearTimeout(SK.timer); SK.timer = setTimeout(() => { if (SK.st === 'rec' && tk === SK.rtk) skRecStop(); }, 180000);
  }
  skRender();
}
function skRecStop() {
  if (SK.st !== 'rec') return;
  SK.st = 'proc'; SK.stopping = true; clearTimeout(SK.timer);
  const tk = SK.rtk, waits = [];
  if (SK.sr && !SK.paused) waits.push(new Promise(res => { SK.srEnd = res; try { SK.sr.stop(); } catch (e) { res(); } }));
  if (SK.mr && SK.mr.state !== 'inactive') waits.push(new Promise(res => { SK.mrDone = res; try { SK.mr.stop(); } catch (e) { res(); } }));
  Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 1500))]).then(() => skFinish(tk));
  skRender();
}
function skCancelRec() {
  const had = !!(SK.sr || SK.mr || SK.stream);
  SK.rtk++; clearTimeout(SK.timer); clearTimeout(SK.wd); SK.stopping = true; if (had) SK.lastEnd = Date.now();
  const r = SK.sr; SK.sr = null;
  if (r) { r.onresult = r.onend = r.onerror = null; try { r.abort(); } catch (e) {} }
  const m = SK.mr; SK.mr = null;
  if (m) { m.ondataavailable = null; m.onstop = null; try { if (m.state !== 'inactive') m.stop(); } catch (e) {} }
  if (SK.stream) { SK.stream.getTracks().forEach(t => t.stop()); SK.stream = null; }
  SK.srEnd = SK.mrDone = null; SK.st = 'idle'; SK.blob = null; SK.lv = null; SK.paused = false;
}
function skStopAll() { skStopPlay(); skCancelRec(); }
function skCloseCtx() { const c = SK.ctx; SK.ctx = null; if (c) { try { c.close(); } catch (e) {} } }
/* 🔧 重置麥克風：手機上錄幾次之後常常收不到聲音（麥克風／辨識／音訊通道卡住）。這裡把所有東西關乾淨，
   再試開一次麥克風確認可用；已錄的結果、分數、已儲存的錄音都不會動。 */
async function skReset() {
  skStopAll(); skReleaseAudio(); SK.lastEnd = Date.now();
  SK.bufs = {}; SK.rtk++; SK.st = 'idle'; SK.final = ''; SK.interim = ''; SK.err = ''; SK.fail = 0; SK.blob = null;
  try { speechSynthesis.cancel(); } catch (e) {}
  let msg = '已重置，請再按一次麥克風錄音';
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); }
    catch (e) {
      msg = e && e.name === 'NotAllowedError' ? '麥克風權限被拒絕：請點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 允許，然後重新整理頁面。' : '已重置，但還是取不到麥克風：請先關掉通話、錄音、語音助理等佔用麥克風的 App，必要時把這個分頁關掉重開';
      SK.err = msg;
    }
  }
  if (typeof dnToast === 'function') dnToast(msg);
  skRender();
}
function skFinish(tk) {
  if (tk !== SK.rtk || SK.st !== 'proc') return;
  const x = skX(), heard = (SK.final + ' ' + SK.interim).trim(), blob = SK.blob, mime = SK.mime, url = blob ? URL.createObjectURL(blob) : null, sup = !!skSR();
  const sr0 = SK.sr, mr0 = SK.mr; SK.lastEnd = Date.now(); clearTimeout(SK.wd);
  SK.lv = null; SK.paused = false; // 錄完：即時追蹤結束，改顯示完整評分
  SK.blob = null; SK.st = 'idle'; SK.sr = null; SK.mr = null; SK.srEnd = SK.mrDone = null;
  if (sr0) { sr0.onresult = sr0.onend = sr0.onerror = null; try { sr0.abort(); } catch (e) {} } // 確實關掉辨識，釋放麥克風
  if (mr0) { mr0.ondataavailable = null; mr0.onstop = null; try { if (mr0.state !== 'inactive') mr0.stop(); } catch (e) {} }
  if (SK.stream) { SK.stream.getTracks().forEach(t => t.stop()); SK.stream = null; }
  SK.fail = (sup ? !heard : !blob) ? SK.fail + 1 : 0; // 沒辨識到字（或沒錄到音）連續 2 次 → 畫面提醒重置
  const r = { url, heard, sup, blob, mime };
  if (skIsSent()) {
    const i = SK.i, old = SK.res[i]; if (old && old.url) URL.revokeObjectURL(old.url);
    if (sup && heard) { const c = skCompare([SK.sents[i]], heard); r.pct = c.pct; r.words = c.sents[0].words; r.diff = c.diff; skBest(idOf(x), 's', i, c.pct); }
    SK.res[i] = r; skToneAnalyze(r, i, x);
  } else {
    if (SK.wres && SK.wres.url) URL.revokeObjectURL(SK.wres.url);
    if (sup && heard) { r.c = skCompare(SK.sents, heard); r.pct = r.c.pct; skBest(idOf(x), 'w', 0, r.pct); SK.pend = r.c.sents.map((q, k) => ({ k, p: q.pct })).filter(q => q.p < SK_PASS); }
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
const skKey = sc => (sc || (skIsSent() ? 's' : 'w')) === 's' ? 's' + SK.i : 'w';
const skSv = (id, k) => ((skRec(id).sv) || {})[k];
function skSave(sc) {
  sc = sc || (skIsSent() ? 's' : 'w');
  const x = skX(), r = sc === 's' ? SK.res[SK.i] : SK.wres; if (!x || !r || !r.blob) return;
  if (!window.indexedDB) { dnToast('此瀏覽器無法儲存錄音'); return; }
  const id = idOf(x), k = skKey(sc), had = !!skSv(id, k), meta = { pct: r.pct || 0, t: Date.now() };
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
function skSavedH(sc) {
  const x = skX(); if (!x) return '';
  const k = skKey(sc), v = skSv(idOf(x), k); if (!v) return '';
  const on = SK.playing === 'saved' && SK.pk === k;
  return `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-left"><p class="text-sm">💾 已儲存的錄音${v.pct ? ` <span class="rounded-full px-2 py-0.5 text-xs font-bold ${skPctCls(v.pct)}">${v.pct}%</span>` : ''} <span class="text-xs text-slate-500">${new Date(v.t).toLocaleString('zh-TW')}</span></p>
    <div class="flex flex-wrap gap-2 mt-2"><button onclick="skPlaySaved('${k}')" class="${skCtl}">${on ? '⏹ 停止' : '▶ 聽已儲存的錄音'}</button><button onclick="skDelSaved('${k}')" class="${skCtl}">🗑 刪除</button></div></div>`;
}
/* 整篇頁面裡的「就地逐句練習」：SK.inl＝true 時，mode 仍是 whole（整篇文稿和結果都留著），麥克風改成錄 SK.i 那一句 */
function skIsSent() { return SK.mode === 'sent' || !!SK.inl; }
function skWholeRec() { return SK.mode === 'whole' && !SK.inl; }
function skInl(k) { skStopAll(); skDrop('sent'); SK.inl = true; SK.i = Math.max(0, Math.min(SK.sents.length - 1, k)); SK.err = ''; skRender(); requestAnimationFrame(() => { const el = document.getElementById('sk-inl'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
function skInlClose() { skStopAll(); skDrop('sent'); SK.inl = false; SK.err = ''; skRender(); requestAnimationFrame(() => { const el = document.getElementById('sk-whole'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
function skMode(m) { skStopAll(); if (SK.inl) { skDrop('sent'); SK.inl = false; } skDrop(SK.mode); SK.mode = m; S.spkMode = m; save(); skRender(); }
function skGo(i) { skStopAll(); skDrop('sent'); SK.i = Math.max(0, Math.min(SK.sents.length - 1, i)); SK.err = ''; skRender(); }
function skRate(r) { SK.rate = r; if (SK.au) SK.au.playbackRate = r; skRender(); }
function skHide() { SK.hide = !SK.hide; skRender(); }
function skRetry(sc) { skStopAll(); sc = sc || (skIsSent() ? 's' : 'w'); if (sc === 's') { const o = SK.res[SK.i]; if (o && o.url) URL.revokeObjectURL(o.url); delete SK.res[SK.i]; } else { if (SK.wres && SK.wres.url) URL.revokeObjectURL(SK.wres.url); SK.wres = null; } skRender(); }
function skBack() { skStopAll(); SK.inl = false; skDrop('sent'); skDrop('whole'); SK.bufs = {}; cur.view = 'day'; render(); window.scrollTo({ top: 0 }); }
function openSpeak() { cur.view = 'speak'; push(); render(); window.scrollTo({ top: 0 }); }
document.addEventListener('visibilitychange', () => { if (document.hidden) skStopAll(); });
window.addEventListener('pagehide', () => skStopAll());

/* ================= 畫面 ================= */
(function () { // .sks：整篇模式中可點、可高亮的句子
  const st = document.createElement('style');
  st.textContent = '.sks{cursor:pointer;border-radius:4px;transition:background .15s}.sks:hover{background:rgba(99,102,241,.12)}.sks.sk-on{background:rgba(251,191,36,.45)}.skw{border-radius:4px;transition:background .08s,box-shadow .08s}.skw.skw-on{background:rgba(245,158,11,.30);box-shadow:0 0 0 2px rgba(245,158,11,.30)}.skl{border-radius:4px;transition:color .15s,background .15s}.skl.ok{color:#047857;background:rgba(16,185,129,.16)}.dark .skl.ok{color:#6ee7b7;background:rgba(16,185,129,.22)}.skl.bad{color:#e11d48;font-weight:700;background:rgba(244,63,94,.12);text-decoration:underline wavy rgba(251,113,133,.7)}.dark .skl.bad{color:#fb7185;background:rgba(244,63,94,.2)}.sks.sk-cs{background:rgba(56,189,248,.15);box-shadow:0 0 0 3px rgba(56,189,248,.15);-webkit-box-decoration-break:clone;box-decoration-break:clone}';
  document.head.appendChild(st);
})();

function skSummary(x) {
  const r = (S.spk || {})[idOf(x)], n = skBuild(x).length;
  if (!r) return '尚未練習';
  const wk0 = r.wk || {}, ok = Object.keys(r.s || {}).filter(k => r.s[k] >= SK_PASS && !wk0[k]).length, done = skDone(x);
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
/* 麥克風列固定在畫面上方（手機貼在 #side 下面、電腦貼在最上面），文字往下捲、辨識中畫面一直更新時，麥克風按鈕都不會跑掉。
   --sk-top 由下面的 skStickyInit 依 #side 的高度更新。 */
function skStickyInit() {
  const side = document.getElementById('side');
  const upd = () => {
    const mobile = !(window.matchMedia && matchMedia('(min-width:768px)').matches);
    document.documentElement.style.setProperty('--sk-top', (mobile && side ? Math.round(side.offsetHeight) + 4 : 8) + 'px');
  };
  window.addEventListener('resize', upd);
  if (window.ResizeObserver && side) new ResizeObserver(upd).observe(side);
  upd();
}
skStickyInit();
function skMic() {
  const rec = SK.st === 'rec', prep = SK.st === 'prep', proc = SK.st === 'proc' || prep;
  const pz = rec && SK.paused, canPz = rec && skWholeRec() && !!(SK.sr || SK.mr);
  const c = pz ? 'bg-amber-500 text-white' : rec ? 'bg-rose-600 text-white animate-pulse' : proc ? 'bg-slate-300 dark:bg-slate-700 text-slate-500' : 'bg-indigo-600 hover:bg-indigo-700 text-white';
  const lbl = pz ? '⏸ 已暫停：按「▶ 繼續」接著念，或按 ⏹ 結束評分' : rec ? '🔴 錄音中…念完再點一次停止（想先停一下可按「⏸ 暫停」）' : prep ? '⏳ 準備麥克風…' : proc ? '⏳ 辨識中…' : (skWholeRec() ? '點麥克風，念完整篇' : SK.inl ? '點麥克風，念出下面這一句（第 ' + (SK.i + 1) + ' 句）' : '點麥克風，念出這一句');
  const pzBtn = canPz ? `<button onclick="skPauseToggle()" class="${skCtl} shrink-0 !px-2.5 !py-1.5">${SK.paused ? '▶ 繼續' : '⏸ 暫停'}</button>` : '';
  // 固定住的只有這一條精簡列（麥克風按鈕＋暫停＋一行狀態）；錯誤訊息和「重置麥克風」放在它下面，會跟著頁面捲動
  return `<section class="${card} sticky z-20 shadow-md px-3 py-2 mb-1" style="top:var(--sk-top,8px)"><div class="flex items-center gap-3"><button onclick="skRecToggle()" ${proc ? 'disabled' : ''} class="h-12 w-12 shrink-0 rounded-full text-xl shadow ${c}" aria-label="錄音">${rec ? '⏹' : '🎙'}</button>${pzBtn}<div class="min-w-0 flex-1"><p class="text-xs text-slate-500 leading-snug">${lbl}</p>
    <p id="sk-heard" class="text-xs text-slate-500 italic break-words line-clamp-2 empty:hidden">${rec ? esc((SK.final + ' ' + SK.interim).trim()) : ''}</p></div></div></section>
  <div class="mb-4 flex flex-col items-center gap-2">${SK.err ? `<p class="text-xs text-rose-600 dark:text-rose-400 text-center">${esc(SK.err)}</p>` : ''}${skResetH()}</div>`;
}
function skPermHelp() { // 權限被拒絕時，依這台裝置顯示怎麼打開
  const ua = navigator.userAgent, ios = SK_IOS, and = /Android/i.test(ua), mac = /Macintosh/.test(ua) && !ios;
  const steps = ios ? ['點網址列左邊的「AA」（或拼圖圖示）', '選「網站設定」→「麥克風」→ 改成「允許」', '重新整理頁面；若還是不行，到手機「設定 → Safari → 麥克風」改成「詢問」或「允許」']
    : and ? ['點網址列左邊的圖示（🔒 或 ⚙）', '選「權限」→「麥克風」→ 改成「允許」', '重新整理頁面；若還是不行，到手機「設定 → 應用程式 → Chrome → 權限 → 麥克風」改成「允許」']
    : mac ? ['點網址列左邊的圖示（🔒 或 ⚙）→「麥克風」→ 改成「允許」並重新整理', '若還是不行：Mac「系統設定 → 隱私權與安全性 → 麥克風」把你用的瀏覽器打開']
    : ['點網址列最左邊的圖示（🔒 或 ⚙）', '找到「麥克風」→ 改成「允許」，然後重新整理頁面', '若還是不行：Windows「設定 → 隱私權與安全性 → 麥克風」，把「麥克風存取」和「允許桌面應用程式存取」都打開'];
  return `<div class="mt-2 text-left"><p class="font-semibold mb-1">這台裝置打開麥克風的步驟：</p><ol class="list-decimal pl-5 space-y-0.5">${steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol><p class="mt-1 opacity-80">網址必須是 https:// 或 localhost（用區網 IP 或直接雙擊開檔，瀏覽器會拒絕麥克風）。</p></div>`;
}
function skResetH() { // 平常是不顯眼的小字；連續沒收到聲音或出錯時變成明顯的橘色按鈕
  const hot = SK.fail >= 2 || !!SK.err;
  return hot
    ? `<div class="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 text-center"><p class="mb-1.5">${SK.fail >= 2 ? '連續 ' + SK.fail + ' 次沒收到聲音，麥克風可能卡住了。' : '麥克風可能卡住了。'}</p>${/權限/.test(SK.err) ? skPermHelp() + '<div class="h-2"></div>' : ''}<button onclick="skReset()" class="${skCtl} !bg-amber-500 !text-white hover:!bg-amber-600">🔧 重置麥克風</button></div>`
    : `<button onclick="skReset()" class="text-xs text-slate-400 underline underline-offset-2 cursor-pointer">🔧 麥克風沒反應？按此重置</button>`;
}
function skDiffH(r) { // 你說的文字：念錯／多念標紅，漏念的用 ( ) 顯示
  const d = r.diff || (r.c && r.c.diff);
  if (!d || !d.length) return `<p class="text-xs text-slate-500 mt-2 break-words">辨識到：${esc(r.heard)}</p>`;
  const h = d.map(o => o.k === 'ok' ? esc(o.t) : o.k === 'bad'
    ? `<span class="text-rose-600 dark:text-rose-400 font-bold underline decoration-wavy decoration-rose-400/70">${esc(o.t)}</span>`
    : `<span class="text-amber-600 dark:text-amber-400">(${esc(o.t)})</span>`).join(' ');
  return `<div class="mt-3"><p class="text-xs text-slate-500 mb-1">你說的（<span class="text-rose-600 dark:text-rose-400 font-bold">紅字</span>＝念錯或多念，<span class="text-amber-600 dark:text-amber-400">(括號)</span>＝漏念）</p><p class="text-sm leading-relaxed break-words">${h}</p></div>`;
}
function skResultH(r, wordsH, sc) { // r：本次結果；wordsH：已上色的字詞 HTML（句子模式用）
  if (!r) return '';
  sc = sc || (skIsSent() ? 's' : 'w');
  let head;
  if (!r.sup) head = '<span class="text-sm">錄音完成。此瀏覽器沒有自動評分，請回放後對照原文。</span>';
  else if (!r.heard) head = '<span class="text-sm text-rose-600 dark:text-rose-400">沒有辨識到聲音，靠近麥克風再試一次。</span>';
  else head = `<span class="rounded-full px-3 py-1 text-sm font-bold ${skPctCls(r.pct)}">${r.pct}%</span><span class="text-sm">${skMsg(r.pct)}</span>`;
  if (S.spkCurve !== 1) { /* 沒開語調曲線：不顯示語調評分 */ } else if (r.toneBusy) head += '<span class="text-xs text-slate-400">語調分析中…</span>'; else if (r.tone) head += `<span class="rounded-full px-3 py-1 text-sm font-bold ${skPctCls(r.tone.score)}">語調 ${r.tone.score}%</span>`;
  return `<div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-left"><div class="flex flex-wrap items-center gap-2 mb-2">${head}</div>
    ${wordsH ? `<p class="leading-relaxed">${wordsH}</p>` : ''}
    ${r.heard ? skDiffH(r) : ''}
    <div class="flex flex-wrap gap-2 mt-3">${r.url ? `<button onclick="skPlayMine('${sc}')" class="${skCtl}">${SK.playing === 'mine' && SK.pm === sc ? '⏹ 停止回放' : '▶ 聽我的錄音'}</button>` : ''}${r.blob ? `<button onclick="skSave('${sc}')" class="${skCtl}">💾 ${skSv(SK.id, skKey(sc)) ? '覆蓋儲存' : '儲存語音練習'}</button>` : ''}<button onclick="skRetry('${sc}')" class="${skCtl}">↻ 重來</button></div></div>`;
}

/* ================= 語調曲線（畫在句子上） =================
   x.prosody＝{hop, f0:[Hz…], vol:[0–100…]}：整個 mp3 每 hop 秒一個點（daily_timestamps.py 產生）。
   開啟後（S.spkCurve === 1，預設關閉），這一句的字會一個一個排在曲線下面（太長自動換行，每一行帶著自己那一段曲線）：
   藍線＝音高（以這一句的中間音高為基準，往上＝聲調升高）；灰色＝音量（凸起＝重音）。
   曲線依這一句實際播放的範圍（含剪裁微調）切出來。每個字在曲線上的位置是「依音節數估算」的，只是參考。 */
const skPros = x => { const p = x && x.prosody; return p && p.hop > 0 && Array.isArray(p.f0) && p.f0.length > 3 ? p : null; };
/* 平滑：同一段連續有音高的點做 3 點平均（兩次），再用二次曲線連起來，線就不會抖 */
function skSmoothPath(pts) { // pts：[[x,y,連續段編號]]
  const runs = []; pts.forEach(p => { const r = runs[runs.length - 1]; if (r && r.id === p[2]) r.p.push([p[0], p[1]]); else runs.push({ id: p[2], p: [[p[0], p[1]]] }); });
  return runs.map(r => {
    let q = r.p;
    for (let n = 0; n < 2; n++) q = q.map((p, k) => [p[0], (q[Math.max(0, k - 1)][1] + p[1] + q[Math.min(q.length - 1, k + 1)][1]) / 3]);
    if (q.length < 2) return '';
    let d = 'M' + q[0][0].toFixed(1) + ',' + q[0][1].toFixed(1);
    for (let k = 1; k < q.length - 1; k++) d += 'Q' + q[k][0].toFixed(1) + ',' + q[k][1].toFixed(1) + ' ' + ((q[k][0] + q[k + 1][0]) / 2).toFixed(1) + ',' + ((q[k][1] + q[k + 1][1]) / 2).toFixed(1);
    return d + 'L' + q[q.length - 1][0].toFixed(1) + ',' + q[q.length - 1][1].toFixed(1);
  }).join('');
}
/* ===== 我的語調：分析錄音的音高與音量（做法與 daily_timestamps.py 的 analyze_prosody 相同，所以和原音的曲線可以直接比） ===== */
const SKP = { SR: 16000, HOP: 800, WIN: 1024, FMIN: 65, FMAX: 420, VOICED: 0.38, GATE: 40 };
const skMedian = a => { if (!a.length) return 0; const b = Array.from(a).sort((p, q) => p - q), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
function skPClean(f) { // 去掉單獨亂跳的點、修正差八度的點、5 點中位數平滑
  const n = f.length; let i = 0;
  while (i < n) {
    if (f[i] <= 0) { i++; continue; }
    let j = i; while (j < n && f[j] > 0) j++;
    if (j - i < 3) { for (let t = i; t < j; t++) f[t] = 0; }
    else {
      const seg = Array.from(f.slice(i, j)), med = skMedian(seg);
      for (let t = 0; t < seg.length; t++) {
        while (seg[t] > med * 1.65 && seg[t] / 2 >= SKP.FMIN) seg[t] /= 2;
        while (seg[t] < med / 1.65 && seg[t] * 2 <= SKP.FMAX) seg[t] *= 2;
      }
      for (let t = 0; t < seg.length; t++) f[i + t] = skMedian(seg.slice(Math.max(0, t - 2), Math.min(seg.length, t + 3)));
    }
    i = j;
  }
  return f;
}
function skPitchAnalyze(y) { // y：16kHz 單聲道 Float32Array → {hop, f0:[Hz], vol:[0–100]}
  const { SR, HOP, WIN, FMIN, FMAX, VOICED, GATE } = SKP, n = Math.max(1, Math.ceil(y.length / HOP));
  const win = new Float64Array(WIN); for (let i = 0; i < WIN; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1));
  const lmin = Math.floor(SR / FMAX), lmax = Math.floor(SR / FMIN), L0 = lmin - 1, L1 = lmax + 1;
  const rw = new Float64Array(L1 + 1); for (let l = 0; l <= L1; l++) { let a = 0; for (let i = 0; i + l < WIN; i++) a += win[i] * win[i + l]; rw[l] = a; }
  for (let l = L1; l >= 0; l--) rw[l] /= rw[0];
  const fr = new Float64Array(WIN), xw = new Float64Array(WIN), rms = new Float64Array(n), db = new Float64Array(n), f0 = new Float64Array(n), frames = [];
  for (let k = 0; k < n; k++) {
    const s0 = k * HOP - (WIN >> 1); let ss = 0, sum = 0;
    for (let i = 0; i < WIN; i++) { const v = (s0 + i >= 0 && s0 + i < y.length) ? y[s0 + i] : 0; fr[i] = v; ss += v * v; sum += v; }
    rms[k] = Math.sqrt(ss / WIN); db[k] = 20 * Math.log10(rms[k] + 1e-9); frames.push(sum / WIN);
  }
  const dbs = []; for (let k = 0; k < n; k++) if (rms[k] > 1e-6) dbs.push(db[k]); dbs.sort((p, q) => p - q);
  const top = dbs.length ? dbs[Math.min(dbs.length - 1, Math.floor(0.98 * (dbs.length - 1) + 0.5))] : 0;
  const r = new Float64Array(L1 + 1);
  for (let k = 0; k < n; k++) {
    if (db[k] < top - GATE) continue;
    const s0 = k * HOP - (WIN >> 1), mean = frames[k]; let r0 = 0;
    for (let i = 0; i < WIN; i++) { const v = (s0 + i >= 0 && s0 + i < y.length) ? y[s0 + i] : 0; xw[i] = (v - mean) * win[i]; r0 += xw[i] * xw[i]; }
    if (r0 <= 1e-12) continue;
    for (let l = L0; l <= L1; l++) { let a = 0; for (let i = 0; i + l < WIN; i++) a += xw[i] * xw[i + l]; r[l] = a / r0 / Math.max(rw[l], 1e-3); }
    const seg = Array.from(r.subarray(L0, L1 + 1)), pk = [];
    for (let i = 1; i < seg.length - 1; i++) if (seg[i] > seg[i - 1] && seg[i] >= seg[i + 1] && seg[i] > VOICED) pk.push(i);
    if (!pk.length) continue;
    const best = Math.max.apply(null, pk.map(i => seg[i])), i0 = pk.find(i => seg[i] >= 0.88 * best);
    const a = seg[i0 - 1], b = seg[i0], c = seg[i0 + 1], den = a - 2 * b + c, off = Math.abs(den) > 1e-12 ? 0.5 * (a - c) / den : 0, lag = L0 + i0 + off;
    if (lag > 0) f0[k] = SR / lag;
  }
  skPClean(f0);
  const vol = new Array(n);
  for (let k = 0; k < n; k++) vol[k] = rms[k] < 1e-6 ? 0 : Math.round(Math.max(0, Math.min(100, 100 + (db[k] - top) * 2)));
  return { hop: HOP / SR, f0: Array.from(f0, v => Math.round(v)), vol };
}
/* 補滿沒有音高的空檔（線性連起來）並平滑；st＝音高（半音）陣列，沒有音高的位置是 null */
function skSeqFill(st) {
  const n = st.length, v = st.map(q => (q == null ? null : Math.max(-12, Math.min(12, q))));
  const idx = []; v.forEach((q, k) => { if (q != null) idx.push(k); });
  if (!idx.length) return null;
  const o = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    if (v[k] != null) { o[k] = v[k]; continue; }
    let p = -1, q = -1; for (let m = k - 1; m >= 0; m--) if (v[m] != null) { p = m; break; } for (let m = k + 1; m < n; m++) if (v[m] != null) { q = m; break; }
    o[k] = p >= 0 && q >= 0 ? v[p] + (v[q] - v[p]) * (k - p) / (q - p) : v[p >= 0 ? p : q];
  }
  let y = Array.from(o); for (let t = 0; t < 2; t++) y = y.map((q, k) => (y[Math.max(0, k - 1)] + q + y[Math.min(n - 1, k + 1)]) / 3);
  return Float64Array.from(y);
}
function skDtw(a, b) { // 兩條曲線的對齊路徑 [[i, j]…]；限制在對角線附近，並對「一邊停住等另一邊」小小扣分，避免亂拉
  const n = a.length, m = b.length; if (n < 3 || m < 3) return null;
  const band = Math.max(Math.ceil(0.3 * Math.max(n, m)), Math.abs(n - m) + 3), PEN = 0.25, D = new Float32Array(n * m).fill(Infinity), B = new Uint8Array(n * m);
  for (let i = 0; i < n; i++) {
    const jc = i * (m - 1) / Math.max(1, n - 1);
    for (let j = Math.max(0, Math.round(jc - band)); j <= Math.min(m - 1, Math.round(jc + band)); j++) {
      const c = Math.abs(a[i] - b[j]);
      if (!i && !j) { D[0] = c; continue; }
      let best = Infinity, dir = 0;
      if (i && j && D[(i - 1) * m + j - 1] < best) { best = D[(i - 1) * m + j - 1]; dir = 0; }
      if (i && D[(i - 1) * m + j] + PEN < best) { best = D[(i - 1) * m + j] + PEN; dir = 1; }
      if (j && D[i * m + j - 1] + PEN < best) { best = D[i * m + j - 1] + PEN; dir = 2; }
      D[i * m + j] = best + c; B[i * m + j] = dir;
    }
  }
  if (!isFinite(D[n * m - 1])) return null;
  const path = []; let i = n - 1, j = m - 1;
  while (true) { path.push([i, j]); if (!i && !j) break; const d = B[i * m + j]; if (d === 0) { i--; j--; } else if (d === 1) i--; else j--; }
  return path.reverse();
}
const SK_STOP = new Set('a an the to of in on at by for from with and or but so that this these those is are was were be been am it its as if into than then there their they them he she we you your our us i me my his her will would can could shall should may might do does did has have had not no up out about over per via'.split(' '));
/* 重音：在內容字裡挑念得最響的前 40%。scoreOf(w)＝這個字的響度（w＝[第幾個字, 開始秒, 結束秒]） */
function skStressPick(toks, wt, scoreOf) {
  const c = [];
  wt.forEach(w => {
    const tx = (toks[w[0]] || '').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!tx) return;
    if (SK_STOP.has(tx) || (tx.length < 3 && !/\d/.test(tx))) return;
    const m = scoreOf(w); if (m != null) c.push([w[0], m]);
  });
  const out = new Set(); if (!c.length) return out;
  const sorted = c.map(q => q[1]).sort((p, q) => p - q), th = sorted[Math.floor(sorted.length * 0.6)];
  c.forEach(q => { if (q[1] >= th && q[1] > 0) out.add(q[0]); });
  return out;
}
const skSpread = a => { const b = a.filter(v => v != null).sort((p, q) => p - q); if (b.length < 4) return 0; return b[Math.floor(0.9 * (b.length - 1))] - b[Math.floor(0.1 * (b.length - 1))]; };
/* 語調比對。M＝原音這一句 {st, a, k0, k1, hop, wt, toks, ms}；U＝我的錄音 {hop, f0, vol}。
   回傳 {score, shape, range, stress, uvals, su, ms, spreadM, spreadU}；抓不到音高回傳 {err} */
function skToneCompute(M, U) {
  const hop = M.hop, vf = U.f0.map(h => (h > 0 ? h : null)), voiced = vf.filter(h => h != null);
  let u0 = vf.findIndex(h => h != null), u1 = vf.length - 1; while (u1 > u0 && vf[u1] == null) u1--;
  if (voiced.length < 8) return { err: 'novoice' };
  const med = skMedian(voiced), ust = vf.map(h => (h == null ? null : 12 * Math.log2(h / med)));
  const mseq = skSeqFill(M.st.slice(M.k0, M.k1 + 1)), useq = skSeqFill(ust.slice(u0, u1 + 1));
  if (!mseq || !useq) return { err: 'novoice' };
  const path = skDtw(mseq, useq); if (!path) return { err: 'short' };
  const n = mseq.length, usum = new Float64Array(n), ucnt = new Float64Array(n), jlo = new Array(n).fill(1e9), jhi = new Array(n).fill(-1);
  path.forEach(([i, j]) => { usum[i] += useq[j]; ucnt[i]++; jlo[i] = Math.min(jlo[i], j); jhi[i] = Math.max(jhi[i], j); });
  const uOn = Array.from(usum, (s, i) => s / ucnt[i]);
  let se = 0, sm = 0, su = 0; for (let i = 0; i < n; i++) { se += Math.abs(mseq[i] - uOn[i]); sm += mseq[i]; su += uOn[i]; }
  const mae = se / n, mm = sm / n, um = su / n; let cv = 0, vm = 0, vu = 0;
  for (let i = 0; i < n; i++) { cv += (mseq[i] - mm) * (uOn[i] - um); vm += (mseq[i] - mm) ** 2; vu += (uOn[i] - um) ** 2; }
  const fM = vm / n < 0.1, fU = vu / n < 0.1; // 標準差 < 0.3 個半音＝幾乎沒起伏
  const corr = fM && fU ? 1 : (fM || fU) ? 0 : cv / Math.sqrt(vm * vu);
  const shape = Math.round(100 * (0.55 * Math.max(0, 1 - mae / 3.5) + 0.45 * Math.max(0, corr)));
  const spreadM = skSpread(M.st.slice(M.k0, M.k1 + 1)), spreadU = skSpread(ust.slice(u0, u1 + 1)), fm = Math.max(spreadM, 2), fu = Math.max(spreadU, 2);
  const range = Math.round(100 * Math.pow(Math.min(fm, fu) / Math.max(fm, fu), 0.7));
  // 重音：原音加重的字，我是不是也念得比較響（用對齊後我那一段的最大音量）
  let stress = null, sus = new Set(); const ms = M.ms || new Set();
  if (M.wt && M.toks) {
    sus = skStressPick(M.toks, M.wt, w => {
      const fa = Math.max(0, Math.floor(w[1] / hop) - (M.a + M.k0)), fb = Math.min(n - 1, Math.ceil(w[2] / hop) - (M.a + M.k0)); if (fb < fa) return null;
      let lo = 1e9, hi = -1; for (let i = fa; i <= fb; i++) { lo = Math.min(lo, jlo[i]); hi = Math.max(hi, jhi[i]); }
      let m = 0; for (let j = lo; j <= hi; j++) m = Math.max(m, U.vol[u0 + j] || 0); return m;
    });
    if (ms.size) { let ok = 0; ms.forEach(k => { if (sus.has(k)) ok++; }); stress = Math.round(100 * ok / ms.size); }
  }
  const score = Math.round(stress == null ? 0.7 * shape + 0.3 * range : 0.5 * shape + 0.2 * range + 0.3 * stress);
  const uvals = new Array(M.st.length).fill(null); for (let i = 0; i < n; i++) uvals[M.k0 + i] = uOn[i];
  return { score, shape, range, stress, uvals, su: sus, ms, spreadM, spreadU, mae, corr };
}

/* ===== 重音：原音每個字的響度，挑出內容字裡最響的幾個，畫成粗體＋曲線上的圓點 ===== */
const SK_UPPER = true; // 重音字是否轉成大寫（只是顯示，不改原文）；不想要就改成 false
function skSentWt(x, s) { // 這一句每個字的時間：[[第幾個字, 開始秒, 結束秒]]；沒有 words 回傳 null
  if (!s.words || !s.words.length) return null;
  const full = String(x.passage || '').slice(s.from, s.to), base = s.from + (full.length - full.trimStart().length), tk = {};
  [...s.t.matchAll(/\S+/g)].forEach((m, k) => { tk[base + m.index] = k; });
  const wt = s.words.map(w => [tk[w[0]], w[2], w[3]]).filter(w => w[0] != null && w[2] > w[1] - 0.001);
  return wt.length ? wt : null;
}
function skStressSet(x, s) { // 原音的重音字（Set：第幾個字）
  const P = skPros(x), wt = skSentWt(x, s);
  if (!P || !wt || !P.vol) return new Set();
  return skStressPick(s.t.match(/\S+/g) || [], wt, w => { let m = 0; for (let k = Math.floor(w[1] / P.hop); k <= Math.ceil(w[2] / P.hop); k++) m = Math.max(m, P.vol[k] || 0); return m; });
}
/* 沒開語調曲線時：每個字包一層 <span class="skw" data-k=第幾個字>，播放原音時依 timing 的 words 一個字一個字亮起來 */
function skWordsPlain(text) {
  let k = 0;
  return text.split(/(\s+)/).map(p => /\S/.test(p) ? `<span class="skw" data-k="${k++}">${esc(p)}</span>` : esc(p)).join('');
}
/* 句子文字做成 HTML：stress 的字粗體（字級不變）；miss 的字（原音有加重、你沒加重）用橘色點線底線 */
function skStressH(text, stress, miss) {
  miss = miss || new Set(); let k = 0;
  return text.split(/(\s+)/).map(p => {
    if (!/\S/.test(p)) return esc(p);
    const n = k++;
    if (stress.has(n)) return `<strong style="font-weight:700;color:var(--sk-st,#1e2a5a);${SK_UPPER ? 'text-transform:uppercase;letter-spacing:.02em;' : ''}">${esc(p)}</strong>`;
    if (miss.has(n)) return `<span style="color:#d97706;text-decoration:underline dotted;text-underline-offset:6px" title="原音在這裡有加重">${esc(p)}</span>`;
    return esc(p);
  }).join('');
}

/* 語調曲線疊在句子旁：字、字級、換行完全不變，只把行距拉開，每一行文字正下方放那一段的語調線。
   對時：daily.json 的 timing 若有 words（由新版 daily_timestamps.py 產生），每個字都釘在它被念出的時間點上；
   沒有 words 的舊資料，退回「整句依文字長度平均分配」的估算。 */
function skCurveData(x, id, i, s, hidden) { // 這一句的曲線資料；失敗回傳 {err}
  const P = skPros(x); if (!P) return { err: 'nopros' };
  const tr = skTrim(id, i), t0 = Math.max(0, s.start - SK_LEAD + tr[0]), t1 = s.end + SK_TAIL + tr[1], hop = P.hop;
  const a = Math.max(0, Math.floor(t0 / hop)), b = Math.min(P.f0.length - 1, Math.ceil(t1 / hop));
  if (!(t1 > t0) || b - a < 3) return { err: 'short' };
  const f = P.f0.slice(a, b + 1), vv = (P.vol || []).slice(a, b + 1);
  const voiced = f.filter(h => h > 0).sort((p, q) => p - q);
  if (voiced.length < 3) return { err: 'novoice' };
  const med = voiced[voiced.length >> 1], st = f.map(h => (h > 0 ? 12 * Math.log2(h / med) : null));
  const sv = st.filter(v => v != null), lo = Math.min(Math.min.apply(null, sv) - 0.7, -4), hi = Math.max(Math.max.apply(null, sv) + 0.7, 4);
  let k0 = st.findIndex(v => v != null), k1 = st.length - 1; while (k1 > k0 && st[k1] == null) k1--;
  return { st, vv, hop, a, t0, t1, lo, hi, k0, k1, ts: (a + k0) * hop, te: (a + k1 + 1) * hop, wt: hidden ? null : skSentWt(x, s), nt: (s.t.match(/\S+/g) || []).length };
}
const skDot = c => `<i class="inline-block w-2 h-2 rounded-full mr-1 align-middle" style="background:${c}"></i>`;
function skCurveSent(x, id, i, s, r, hidden, plain) {
  SK.cr = null; SK.cd = null;
  const d = skCurveData(x, id, i, s, hidden);
  if (d.err === 'nopros') return plain + '<p class="mt-2 text-xs text-slate-400 leading-relaxed">這一篇還沒有語調曲線。到電腦執行 daily_timestamps.py（選這篇的 mp3 和 daily.json）會自動補上；上傳 daily.json 後重新整理就會出現。</p>';
  if (d.err === 'short') return plain;
  if (d.err === 'novoice') return plain + '<p class="mt-2 text-xs text-slate-400">這一句抓不到明顯的音高（可能太短或太小聲）。</p>';
  SK.cd = d;
  return `<div id="sk-cw" class="relative rounded-xl border border-amber-100 dark:border-slate-800 bg-[#fbf8f1] dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-4 py-1 [--sk-st:#1e2a5a] dark:[--sk-st:#f1f5f9]">${plain}<svg id="sk-cv" class="absolute left-0 top-0 pointer-events-none" style="z-index:0" aria-hidden="true"></svg></div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-slate-400 mt-2">
      <span>${skDot('#a78bfa')}紫線愈高＝聲調愈高</span><span>${skDot('#6d4aff')}圓點＋粗體＝重音（念得最響的字）</span><span>${skDot('#f59e0b')}橘色＝正在念的位置</span>${d.wt ? '' : '<span class="text-amber-500">⚠ 這篇是舊版對時，無法標出重音；重新執行 daily_timestamps.py 即可</span>'}
    </div>`;
}
/* 量出每一行（與每個字）的位置，畫語調線。o：{wrap,p,svg,cd,lo,hi,live,curves:[{vals,color,w,dash,dots:{set,color,hollow}}]}
   vals＝每一格（與 cd.st 同樣的時間軸）的音高（半音）；回傳每一行的時間範圍（播放游標用） */
function skPanelLayout(o) {
  const d = o.cd, wrap = document.getElementById(o.wrap), p = document.getElementById(o.p), svg = document.getElementById(o.svg);
  if (!d || !wrap || !p || !svg) return null;
  const wb = wrap.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(p);
  const rs = [...rg.getClientRects()].filter(q => q.width > 1 && q.height > 1).sort((q, w) => q.top - w.top || q.left - w.left);
  if (!rs.length) return null;
  const lines = [];
  rs.forEach(q => { const L = lines[lines.length - 1]; if (L && q.top - L.top < q.height * 0.5) { L.l = Math.min(L.l, q.left); L.r = Math.max(L.r, q.right); } else lines.push({ top: q.top, l: q.left, r: q.right, mid: (q.top + q.bottom) / 2, ws: [] }); });
  const LH = parseFloat(getComputedStyle(p).lineHeight) || 70, CB = 16, W = wb.width, lo = o.lo, hi = o.hi;
  let exact = false;
  if (d.wt) {
    const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), nodes = []; let off = 0, nd;
    while ((nd = tw.nextNode())) { nodes.push({ n: nd, o: off }); off += nd.nodeValue.length; }
    const toks = [...p.textContent.matchAll(/\S+/g)];
    const loc = pos => { for (let q = nodes.length - 1; q >= 0; q--) if (pos >= nodes[q].o) return [nodes[q].n, pos - nodes[q].o]; return null; };
    if (toks.length === d.nt) {
      d.wt.forEach(w => {
        const m = toks[w[0]], A = m && loc(m.index), B = m && loc(m.index + m[0].length - 1); if (!A || !B) return;
        const q = document.createRange(); q.setStart(A[0], A[1]); q.setEnd(B[0], B[1] + 1);
        const r0 = q.getClientRects()[0]; if (!r0) return;
        const my = (r0.top + r0.bottom) / 2; let bj = 0; lines.forEach((l, j) => { if (Math.abs(l.mid - my) < Math.abs(lines[bj].mid - my)) bj = j; });
        lines[bj].ws.push({ k: w[0], ts: w[1], te: w[2], l: r0.left, r: r0.right, top: r0.top, h: r0.height });
      });
      exact = lines.every(l => l.ws.length) && lines.reduce((n, l) => n + l.ws.length, 0) >= d.nt * 0.6;
    }
  }
  const tot = lines.reduce((n, l) => n + (l.r - l.l), 0), span = d.te - d.ts;
  let acc = 0, svgc = '', rows = [];
  lines.forEach((l, j) => {
    const w = l.r - l.l, x0 = l.l - wb.left, mid = l.mid - wb.top, bt = mid - LH / 2, cTop = mid + 18;
    let A = [];
    if (exact) {
      l.ws.sort((u, v) => u.ts - v.ts);
      l.ws.forEach(q => { const pt = A.length ? A[A.length - 1][0] : -1; A.push([Math.max(q.ts, pt), q.l - wb.left], [Math.max(q.te, q.ts, pt), q.r - wb.left]); });
    } else {
      const ta = d.ts + acc / tot * span, tb = d.ts + (acc + w) / tot * span; acc += w; A = [[ta, x0], [tb, x0 + w]];
    }
    const ta = A[0][0], tb = A[A.length - 1][0];
    const X = t => { if (t <= A[0][0]) return A[0][1]; for (let q = 1; q < A.length; q++) if (t <= A[q][0]) { const u = A[q - 1], v = A[q]; return v[0] === u[0] ? v[1] : u[1] + (t - u[0]) / (v[0] - u[0]) * (v[1] - u[1]); } return A[A.length - 1][1]; };
    o.curves.forEach(cv => {
      let sm = [];
      cv.vals.forEach((v, k) => { const t = (d.a + k) * d.hop; if (t >= ta - 0.04 && t <= tb + 0.04) sm.push([X(t), v == null ? null : Math.max(lo, Math.min(hi, v))]); });
      if (!sm.some(q => q[1] != null)) return;
      let li = -1; // 沒有音高的空檔用前後連起來，整行是一條連續的線
      sm.forEach((q, n) => { if (q[1] != null) { li = n; return; } let nx = n; while (nx < sm.length && sm[nx][1] == null) nx++;
        const a0 = li >= 0 ? sm[li] : null, b0 = nx < sm.length ? sm[nx] : null;
        q[1] = a0 && b0 ? a0[1] + (b0[1] - a0[1]) * (q[0] - a0[0]) / ((b0[0] - a0[0]) || 1) : (a0 || b0)[1]; });
      sm = [[x0, sm[0][1]]].concat(sm, [[x0 + w, sm[sm.length - 1][1]]]);
      let ys = sm.map(q => q[1]); for (let n = 0; n < 5; n++) ys = ys.map((v, k) => (ys[Math.max(0, k - 1)] + v + ys[Math.min(ys.length - 1, k + 1)]) / 3);
      const pts = sm.map((q, k) => [q[0], cTop + (hi - ys[k]) / (hi - lo) * CB, 1]);
      svgc += `<path d="${skSmoothPath(pts)}" fill="none" stroke="${cv.color}" stroke-width="${cv.w}" stroke-linecap="round" stroke-linejoin="round"${cv.dash ? ` stroke-dasharray="${cv.dash}"` : ''}/>`;
      const dt = cv.dots;
      if (exact && dt && dt.set) l.ws.forEach(q => { if (!dt.set.has(q.k)) return; const cx = (q.l + q.r) / 2 - wb.left; let bp = pts[0]; pts.forEach(u => { if (Math.abs(u[0] - cx) < Math.abs(bp[0] - cx)) bp = u; });
        svgc += dt.hollow ? `<circle cx="${cx.toFixed(1)}" cy="${bp[1].toFixed(1)}" r="3" fill="none" stroke="${dt.color}" stroke-width="1.5"/>` : `<circle cx="${cx.toFixed(1)}" cy="${bp[1].toFixed(1)}" r="3.2" fill="${dt.color}"/>`; });
    });
    if (j < lines.length - 1) svgc += `<line x1="14" x2="${(W - 14).toFixed(1)}" y1="${(bt + LH - 1).toFixed(1)}" y2="${(bt + LH - 1).toFixed(1)}" stroke="#94a3b8" stroke-opacity=".28"/>`;
    rows.push({ tA: j ? ta : d.t0, tB: tb, top: bt, TH: LH, map: X, ws: exact ? l.ws.map(q => ({ ts: q.ts, te: q.te, x: q.l - wb.left - 3, w: q.r - q.l + 6, y: q.top - wb.top - 1, h: q.h + 2 })) : [] });
  });
  rows.forEach((q, j) => { q.tB = j < rows.length - 1 ? rows[j + 1].tA : d.t1; });
  svg.setAttribute('width', W); svg.setAttribute('height', wb.height); svg.setAttribute('viewBox', `0 0 ${W} ${wb.height}`);
  svg.innerHTML = svgc + (o.live ? '<rect id="sk-wh" rx="6" fill="#f59e0b" fill-opacity=".16" stroke="#f59e0b" stroke-opacity=".5" style="display:none"/><line id="sk-ph" x1="0" x2="0" y1="0" y2="0" stroke="#f59e0b" stroke-opacity=".9" stroke-width="2" stroke-linecap="round" style="display:none"/>' : '');
  return rows;
}
function skCurveLayout() { // 原音的曲線
  const d = SK.cd; if (!d) return;
  const rows = skPanelLayout({ wrap: 'sk-cw', p: 'sk-txt', svg: 'sk-cv', cd: d, lo: d.lo, hi: d.hi, live: true, curves: [{ vals: d.st, color: '#a78bfa', w: 1.7, dots: { set: SK.sx, color: '#6d4aff' } }] });
  if (rows) SK.cr = { rows };
}
function skToneLayout() { // 我的語調 vs 原音
  const r = skIsSent() && S.spkCurve === 1 && SK.res && SK.res[SK.i], T = r && r.tone; if (!T) return;
  skPanelLayout({ wrap: 'sk-cw2', p: 'sk-txt2', svg: 'sk-cv2', cd: T.cd, lo: T.lo, hi: T.hi, live: false, curves: [
    { vals: T.cd.st, color: '#c4b5fd', w: 1.3, dash: '2 5', dots: { set: T.ms, color: '#8b5cf6', hollow: true } },
    { vals: T.uvals, color: '#0d9488', w: 2, dots: { set: T.su, color: '#0d9488' } }] });
}
if (!window._skCvResize) { window._skCvResize = 1; let tm; window.addEventListener('resize', () => { clearTimeout(tm); tm = setTimeout(() => { if (SK.cd) skCurveLayout(); skToneLayout(); }, 120); }); }

/* ===== 語調比對：錄完音自動分析我的音高，和原音比，算分並畫出差異 ===== */
function skDecode16k(blob) { // 錄音檔 → 16kHz 單聲道（用離線解碼，不會佔用音訊通道）
  return blob.arrayBuffer().then(ab => new Promise((res, rej) => {
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!OC) return rej(new Error('noctx'));
    const c = new OC(1, 16000, 16000), p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej);
  })).then(buf => {
    const ch = buf.getChannelData(0), ratio = buf.sampleRate / 16000; if (Math.abs(ratio - 1) < 0.01) return ch;
    const n = Math.floor(ch.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio)); let sum = 0; for (let k = a; k < b; k++) sum += ch[k]; out[i] = sum / (b - a); }
    return out;
  });
}
function skToneAnalyze(r, i, x) {
  const s = SK.sents[i]; if (!r.blob || !s || s.start == null) return;
  const cd = skCurveData(x, idOf(x), i, s, false); if (cd.err) return;
  const ms = skStressSet(x, s), toks = s.t.match(/\S+/g) || [];
  r.toneBusy = true;
  skDecode16k(r.blob).then(y => {
    const T = skToneCompute({ st: cd.st, a: cd.a, k0: cd.k0, k1: cd.k1, hop: cd.hop, wt: cd.wt, toks, ms }, skPitchAnalyze(y));
    if (T.err) { r.toneErr = T.err; return; }
    const uv = T.uvals.filter(v => v != null);
    T.cd = cd; T.lo = Math.min(cd.lo, Math.min.apply(null, uv) - 0.7); T.hi = Math.max(cd.hi, Math.max.apply(null, uv) + 0.7); r.tone = T;
  }).catch(() => { r.toneErr = 'fail'; }).then(() => { r.toneBusy = false; if (skIsSent() && SK.res[i] === r) skRender(); });
}
function skToneAdvice(T, s) {
  const toks = s.t.match(/\S+/g) || [], miss = [...T.ms].filter(k => !T.su.has(k)).map(k => (toks[k] || '').replace(/[^\w'’.:%-]/g, '')).filter(Boolean), out = [];
  if (T.spreadU < T.spreadM * 0.6) out.push('你的語調比原音平：念重音字時把聲調拉高一點，再放回來。');
  else if (T.spreadU > T.spreadM * 1.7) out.push('你的起伏比原音大：不用那麼誇張，放鬆一點會更自然。');
  if (T.stress != null && miss.length) out.push('原音有加重、你還不夠突出的字：' + miss.slice(0, 4).join('、') + '。');
  if (T.shape < 55 && !out.length) out.push('整句走向和原音不太像：先聽原音，注意句尾是上揚還是下降，再模仿一次。');
  return out.length ? out.join('') : '語調和原音很接近，繼續保持！';
}
function skToneH(x, s, r) {
  if (!r || S.spkCurve !== 1) return ''; // 沒開語調曲線：不顯示語調比對
  const box = 'mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-left';
  if (r.toneBusy) return `<div class="${box} text-xs text-slate-400">語調分析中…</div>`;
  const T = r.tone;
  if (!T) return r.toneErr === 'novoice' ? `<div class="${box} text-xs text-slate-400">這次錄音抓不到明顯的音高，沒辦法比對語調（靠近麥克風、念大聲一點再試）。</div>` : '';
  const miss = new Set([...T.ms].filter(k => !T.su.has(k))), cell = (n, v) => `<div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 py-2"><div class="text-[0.6875rem] text-slate-400">${n}</div><div class="text-sm font-bold ${v == null ? 'text-slate-300' : ''}">${v == null ? '—' : v + '%'}</div></div>`;
  return `<div class="${box}">
    <div class="flex flex-wrap items-center gap-2 mb-2"><span class="text-sm font-semibold">🎼 語調比對</span><span class="rounded-full px-3 py-1 text-sm font-bold ${skPctCls(T.score)}">${T.score}%</span></div>
    <div class="grid grid-cols-3 gap-2 text-center mb-3">${cell('走向（高低變化）', T.shape)}${cell('起伏幅度', T.range)}${cell('重音位置', T.stress)}</div>
    <div id="sk-cw2" class="relative rounded-xl border border-amber-100 dark:border-slate-800 bg-[#fbf8f1] dark:bg-slate-900 text-slate-600 dark:text-slate-300 px-4 py-1 [--sk-st:#0f766e] dark:[--sk-st:#5eead4]"><p id="sk-txt2" class="text-lg" style="position:relative;z-index:1;line-height:4.4rem">${skStressH(s.t, T.su, miss)}</p><svg id="sk-cv2" class="absolute left-0 top-0 pointer-events-none" style="z-index:0" aria-hidden="true"></svg></div>
    <div class="flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem] text-slate-400 mt-2"><span>${skDot('#0d9488')}青綠線＝你的語調（粗體字＝你加重的字）</span><span>${skDot('#c4b5fd')}淺紫虛線＝原音（對照）</span>${miss.size ? `<span class="text-amber-500">橘色點線字＝原音有加重、你沒有</span>` : ''}</div>
    <p class="mt-2 text-sm leading-relaxed">${skToneAdvice(T, s)}</p></div>`;
}
function skMr(v) { S.spkMr = v; save(); skStopAll(); skRender(); }
function skMrH() { // 只有手機＋瀏覽器有語音辨識才顯示
  if (!(SK_MOB && skSR())) return '';
  const on = S.spkMr === 1;
  return `<div class="flex flex-wrap items-center gap-2 mb-4 text-xs"><span class="text-slate-500">錄音檔</span><button onclick="skMr(0)" class="${skSeg(!on)} !py-1">關（較穩）</button><button onclick="skMr(1)" class="${skSeg(on)} !py-1">開</button><span class="text-slate-400">${on ? '同時錄下你的聲音（可回放、儲存、語調比對），但手機的麥克風容易卡住' : '只做語音辨識，麥克風最穩定；沒有回放、儲存與語調比對'}</span></div>`;
}
function skCurveToggle() { S.spkCurve = S.spkCurve === 1 ? 0 : 1; save(); skRender(); }
function skPhLoop() { // 播放時讓橘色游標跟著原音走，並把正在念的字亮起來
  cancelAnimationFrame(SK.raf);
  const tick = () => {
    if (!SK.phs || SK.playing !== 'model') { ['sk-ph', 'sk-wh'].forEach(k => { const e0 = document.getElementById(k); if (e0) e0.style.display = 'none'; }); document.querySelectorAll('#sk-txt .skw-on').forEach(e0 => e0.classList.remove('skw-on')); return; }
    if (SK.wtw && skIsSent()) { // 沒開語調曲線：逐字亮起來（最近一個已開始的字；超過它結束 0.4 秒就不亮）
      const t = SK.phs.get(), p0 = document.getElementById('sk-txt'); let hit = -1;
      if (p0 && t >= 0) { for (const w of SK.wtw) { if (w[1] <= t + 0.03) hit = w[2] + 0.4 >= t ? w[0] : -1; else break; } }
      if (p0) { const on = p0.querySelector('.skw-on'), el = hit >= 0 ? p0.querySelector('.skw[data-k="' + hit + '"]') : null; if (on !== el) { if (on) on.classList.remove('skw-on'); if (el) el.classList.add('skw-on'); } }
    }
    const el = document.getElementById('sk-ph'), wh = document.getElementById('sk-wh'), c = SK.cr;
    if (el && c) {
      const t = SK.phs.get(), rw = c.rows.find(q => t >= q.tA && t <= q.tB);
      if (rw) {
        const px = rw.map(t).toFixed(1); el.setAttribute('x1', px); el.setAttribute('x2', px); el.setAttribute('y1', rw.top + 3); el.setAttribute('y2', rw.top + rw.TH - 3); el.style.display = '';
        const w = wh && rw.ws.find(q => t >= q.ts && t <= q.te);
        if (w) { wh.setAttribute('x', w.x); wh.setAttribute('y', w.y); wh.setAttribute('width', w.w); wh.setAttribute('height', w.h); wh.style.display = ''; } else if (wh) wh.style.display = 'none';
      } else { el.style.display = 'none'; if (wh) wh.style.display = 'none'; }
    }
    SK.raf = requestAnimationFrame(tick);
  };
  SK.raf = requestAnimationFrame(tick);
}

/* 整篇念完後的「弱句練習」：一句一句模式上方顯示剛剛沒達標的句子，練到 ≥ 80% 打勾，可直接跳下一個沒達標的句子 */
function skWeakBar(id, i) {
  const wk = skRec(id).wk || {};
  let W = SK.weak && SK.weak.length ? SK.weak : Object.keys(wk).map(k => ({ k: +k }));
  if (!W.length) return '';
  const left = W.filter(q => wk[q.k]);
  const chips = W.map(q => `<button onclick="skGo(${q.k})" class="${q.k === i ? 'ring-2 ring-indigo-500 ' : ''}h-8 min-w-[2.25rem] px-2 rounded-lg text-sm font-semibold cursor-pointer ${wk[q.k] ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : TM_COLOR.ok}">${q.k + 1}${wk[q.k] ? '' : ' ✓'}</button>`).join('');
  const nx = left.find(q => q.k > i) || left[0];
  return `<div class="mb-4 rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 p-3 text-xs">
    <p class="font-semibold text-sm mb-2">整篇剛剛念不好的句子（${W.length - left.length}/${W.length} 已達標）</p>
    <div class="flex flex-wrap gap-1.5 mb-2">${chips}</div>
    <div class="flex flex-wrap gap-2">${nx ? `<button onclick="skGo(${nx.k})" class="${skCtl}">下一個沒達標的句子（第 ${nx.k + 1} 句）→</button>` : '<span class="text-emerald-600 dark:text-emerald-400 font-semibold self-center">全部達標 🎉 可以回整篇再挑戰</span>'}<button onclick="skMode('whole')" class="${skCtl}">回整篇再挑戰</button></div></div>`;
}
/* 整篇念完：問要不要去一句一句練習。確定＝把沒達標的句子標成紅色（蓋掉原本的綠色，並存檔同步雲端）；不要＝什麼都不改 */
function skWeakGo() {
  const x = skX(), P = SK.pend; if (!x || !P || !P.length) return;
  const rc = skRec(idOf(x)); rc.wk = rc.wk || {};
  P.forEach(q => { rc.wk[q.k] = q.p; });
  save();
  SK.weak = P.slice(); SK.pend = null;
  skStopAll(); skDrop('sent'); skDrop('whole'); SK.inl = false; SK.mode = 'sent'; S.spkMode = 'sent'; save();
  SK.i = SK.weak[0].k; SK.err = ''; skRender(); window.scrollTo({ top: 0 });
}
function skWeakNo() { SK.pend = null; skRender(); }
function skSentH(x, inl) {
  const id = idOf(x), N = SK.sents.length, i = SK.i, s = SK.sents[i], r = SK.res[i], best = skRec(id).s[i] || 0;
  if (!N) return `<div class="${card} p-8 text-center text-sm text-slate-500">這篇沒有可練習的句子。</div>`;
  const strip = SK.sents.map((q, k) => {
    const b = skRec(id).s[k] || 0, wkd = (skRec(id).wk || {})[k];
    const c = k === i ? 'ring-2 ring-indigo-500 ' : '';
    return `<button onclick="skGo(${k})" class="${c}h-9 min-w-[2.25rem] px-2 rounded-lg text-sm font-semibold cursor-pointer ${wkd ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : b >= 80 ? TM_COLOR.ok : b > 0 ? TM_COLOR.partial : 'bg-slate-100 dark:bg-slate-800'}">${k + 1}</button>`;
  }).join('');
  const hidden = SK.hide && !r;
  const cOn = S.spkCurve === 1 && s.start != null && !!skPros(x); // 開曲線：行距拉開，每行下方放一條語調線；字級不變
  SK.sx = cOn && !hidden ? skStressSet(x, s) : new Set();
  SK.wtw = !cOn && !hidden && !(r && r.words) && s.start != null ? skSentWt(x, s) : null; // 沒開曲線時，逐字亮起來用的字時間
  const body = hidden ? '<span class="text-slate-400">（文字已遮住：先聽原音，再複誦）</span>' : (r && r.words ? skWordsH(r.words) : (SK.sx.size ? skStressH(s.t, SK.sx) : (SK.wtw ? skWordsPlain(s.t) : esc(s.t))));
  const playing = SK.playing === 'model' && SK.pk === i;
  const plain = `<p id="sk-txt" class="text-lg leading-relaxed" style="${cOn ? 'position:relative;z-index:1;line-height:4.4rem' : ''}">${body}</p>`;
  const shown = S.spkCurve === 1 && s.start != null ? skCurveSent(x, id, i, s, r, hidden, plain) : plain;
  const res = skResultH(r, '', 's') + skToneH(x, s, r) + skSavedH('s'); // 錄音結果放在句子下方；麥克風按鈕放在句子上方，不用滑到最下面
  if (inl) { // 整篇頁面裡就地練這一句：麥克風列（固定在上面）由整篇畫面提供，這裡只放句子卡、結果和簡單的上下句切換
    const W = SK.weak || [], left = W.filter(q => (skRec(id).s[q.k] || 0) < SK_PASS), nx = left.find(q => q.k > i) || left[0];
    return `<section class="${card} p-4 md:p-6 mb-4 !border-indigo-300 dark:!border-indigo-700">
    <div class="flex items-center justify-between mb-3 gap-2"><span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">就地練習 · 第 ${i + 1} / ${N} 句</span><span class="text-xs text-slate-500">${best ? '本句最佳 ' + best + '%' : ''}</span></div>
    ${shown}
    <div class="flex flex-wrap items-center gap-2 mt-4">
      <button onclick="skPlayModel(${i})" class="${skCtl}">${playing ? '⏹ 停止' : '🔊 聽原音'}</button>
      <button onclick="skRate(1)" class="${skSeg(SK.rate === 1)}">1x</button><button onclick="skRate(0.75)" class="${skSeg(SK.rate === 0.75)}">0.75x</button>
      <button onclick="skHide()" class="${skCtl}">${SK.hide ? '👁 顯示文字' : '🙈 遮住文字'}</button>
    </div>${res.trim() ? res : ''}
    <div class="flex flex-wrap items-center gap-2 mt-4">
      <button onclick="skInl(${i - 1})" ${i ? '' : 'disabled'} class="${skCtl} disabled:opacity-40">← 上一句</button>
      <button onclick="skInl(${i + 1})" ${i < N - 1 ? '' : 'disabled'} class="${skCtl} disabled:opacity-40">下一句 →</button>
      ${nx && nx.k !== i ? `<button onclick="skInl(${nx.k})" class="${skCtl}">下一個沒達標的句子（第 ${nx.k + 1} 句）</button>` : ''}
      <button onclick="skInlClose()" class="${skCtl} ml-auto">✕ 收起，回整篇</button>
    </div></section>`;
  }
  return `${skWeakBar(id, i)}${skMic()}
  <section class="${card} p-4 md:p-6 mb-4">
    <div class="flex items-center justify-between mb-3 gap-2"><span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">第 ${i + 1} / ${N} 句</span><span class="text-xs text-slate-500">${best ? '本句最佳 ' + best + '%' : ''}</span></div>
    ${shown}
    <div class="flex flex-wrap items-center gap-2 mt-4">
      <button onclick="skPlayModel(${i})" class="${skCtl}">${playing ? '⏹ 停止' : '🔊 聽原音'}</button>
      <button onclick="skRate(1)" class="${skSeg(SK.rate === 1)}">1x</button><button onclick="skRate(0.75)" class="${skSeg(SK.rate === 0.75)}">0.75x</button>
      <button onclick="skHide()" class="${skCtl}">${SK.hide ? '👁 顯示文字' : '🙈 遮住文字'}</button>
      ${s.start != null ? `<button onclick="skCurveToggle()" class="${S.spkCurve === 1 ? skSeg(true) : skCtl}">📈 語調曲線${S.spkCurve === 1 ? '：開' : ''}</button>` : ''}
    </div>${s.start != null && skMp3Ok(x) ? skTrimH(id, i) : ''}</section>
  ${res.trim() ? `<section class="${card} p-4 md:p-6 mb-4">${res}</section>` : ''}
  <div class="flex items-center justify-between gap-2 mb-4">
    <button onclick="skGo(${i - 1})" ${i ? '' : 'disabled'} class="${btn} border border-slate-300 dark:border-slate-700 disabled:opacity-40">← 上一句</button>
    ${i < N - 1 ? `<button onclick="skGo(${i + 1})" class="${btn} bg-indigo-600 text-white">下一句 →</button>` : `<button onclick="skMode('whole')" class="${btn} bg-indigo-600 text-white">挑戰整篇 →</button>`}
  </div>
  <div class="flex flex-wrap gap-1.5">${strip}</div>
  <p class="mt-2 text-xs text-slate-400">數字依序是各句；綠＝最佳 ≥ 80%，黃＝練過但未達 80%，紅＝整篇念不好（再念到 ≥ 80% 就恢復綠色）。</p>`;
}

function skWholeH(x) {
  const N = SK.sents.length, r = SK.wres, best = skRec(idOf(x)).w || 0;
  if (!N) return `<div class="${card} p-8 text-center text-sm text-slate-500">這篇沒有可練習的內容。</div>`;
  let txt = '';
  const live = !!SK.lv && skWholeRec() && (SK.st === 'rec' || SK.st === 'proc') && !SK.hide;
  if (SK.hide && !r && !live) txt = '<span class="text-slate-400">（文稿已遮住：先聽原音，再憑記憶複述）</span>';
  else if (live) SK.sents.forEach((s, k) => { // 錄音中：每個字一個 span，語音辨識來一次就更新顏色（skLiveSync）
    txt += (k ? '' : '<span id="sk-lvh" aria-hidden="true" style="position:absolute;left:0;top:0;width:0;height:0;opacity:0;border-radius:6px;background:rgba(245,158,11,.32);box-shadow:0 0 0 2px rgba(245,158,11,.6);pointer-events:none;transition:transform .16s ease-out,width .16s ease-out,height .16s ease-out,opacity .15s"></span>') + skSepBefore(k) + `<span class="sks" data-i="${k}">${SK.lv.disp[k].map((d, j) => `<span class="skl" data-s="${k}" data-w="${j}">${esc(d.w)}</span>`).join(' ')}</span>`;
  });
  else SK.sents.forEach((s, k) => {
    const sep = skSepBefore(k), inner = r && r.c ? skWordsH(r.c.sents[k].words) : esc(s.t);
    txt += sep + `<span class="sks" data-i="${k}" onclick="skPlayModel(${k})" title="點一下聽這一句">${inner}</span>`;
  });
  const weak = r && r.c ? r.c.sents.map((q, k) => ({ k, p: q.pct, words: q.words })).filter(q => q.p < SK_PASS) : [];
  const playing = SK.playing === 'model' && SK.pk === -1;
  const resW = `${skResultH(r, '', 'w')}${skSavedH('w')}
    ${weak.length ? `<div class="mt-4 text-left"><p class="text-sm font-semibold mb-2">念得不夠好的句子（&lt; ${SK_PASS}%）· 共 ${weak.length} 句</p><div class="space-y-1.5">${weak.map(q => `<div class="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm flex items-start gap-2"><span class="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${skPctCls(q.p)}">${q.p}%</span><span class="flex-1 leading-relaxed"><b class="text-slate-400 mr-1">${q.k + 1}.</b>${skWordsH(q.words)}</span></div>`).join('')}</div><p class="mt-1 text-xs text-slate-400">紅字＝漏念或念錯的字。</p>${SK.pend && SK.pend.length ? `<div class="mt-3 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 p-3"><p class="text-sm font-semibold mb-1">要去「一句一句」練習這 ${SK.pend.length} 句嗎？</p><p class="text-xs text-slate-500 mb-2">按「去練習」會把這些句子標成紅色（蓋掉原本的綠色）並存檔同步；按「先不要」則不會改動任何紀錄。</p><div class="flex flex-wrap gap-2"><button onclick="skWeakGo()" class="${btn} bg-indigo-600 text-white !py-1.5 text-xs">去練習</button><button onclick="skWeakNo()" class="${btn} border border-slate-300 dark:border-slate-700 !py-1.5 text-xs">先不要</button></div></div>` : ''}</div>` : ''}`;
  return `${skMic()}
  <section class="${card} p-4 md:p-6 mb-4">
    <div class="flex items-center justify-between mb-3 gap-2"><span class="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">整篇 · ${N} 句</span><span class="text-xs text-slate-500">${best ? '整篇最佳 ' + best + '%' : ''}</span></div>
    <p id="sk-whole" class="whitespace-pre-line leading-relaxed" style="position:relative">${txt}</p>
    <div class="flex flex-wrap items-center gap-2 mt-4">
      <button onclick="skPlayModel(-1)" class="${skCtl}">${playing ? '⏹ 停止' : '🔊 聽整篇原音'}</button>
      <button onclick="skRate(1)" class="${skSeg(SK.rate === 1)}">1x</button><button onclick="skRate(0.75)" class="${skSeg(SK.rate === 0.75)}">0.75x</button>
      <button onclick="skHide()" class="${skCtl}">${SK.hide ? '👁 顯示文稿' : '🙈 遮住文稿'}</button>
    </div>
    ${live ? '<p class="mt-3 text-xs text-slate-500 leading-loose"><span class="skl ok">綠底</span>＝念對　<span class="skl bad">紅底</span>＝漏念或念錯　<span class="skw skw-on">橘框</span>＝下一個要念的字　<span class="sks sk-cs">淡藍底</span>＝目前這一句（即時追蹤只是參考，念完後以完整評分為準）</p>' : '<p class="mt-2 text-xs text-slate-400">點文稿裡的任一句，可單獨聽那一句。</p>'}</section>
  ${resW.trim() ? `<section class="${card} p-4 md:p-6 mb-4">${resW}</section>` : ''}`;
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
    ${skMrH()}
    ${SK.mode === 'sent' ? skSentH(x) : skWholeH(x) + (SK.inl ? `<div id="sk-inl" style="scroll-margin-top:calc(var(--sk-top,8px) + 5rem)">${skSentH(x, true)}</div>` : '')}
    <button onclick="skBack()" class="${btn} md:hidden w-full mt-6 border border-slate-300 dark:border-slate-700">← 返回內文</button>`;
  if (skWholeRec() && SK.lv) { skLiveAlign((SK.final + ' ' + SK.interim).trim()); skLiveSync(); }
  if (skIsSent()) { if (S.spkCurve === 1) { skCurveLayout(); requestAnimationFrame(skCurveLayout); } skToneLayout(); requestAnimationFrame(skToneLayout); }
}
