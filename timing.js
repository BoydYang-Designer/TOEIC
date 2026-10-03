/* timing.js — Daily 的 timing 檢查（daily.html、speak.js、index.html 共用）
   切句規則與 daily_timestamps.py 的 split_sentences() 完全一致：
   腳本怎麼切、timing 就該長怎樣；文稿被改過或 timing 是舊的，這裡就會判成「異常」。 */
const TM_LABEL = { ok: '完成', partial: '部分', bad: '異常', none: '未做' };
const TM_COLOR = {
  ok: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  none: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
};
const TM_ABBR = new Set(['mr', 'ms', 'mrs', 'dr', 'inc', 'co', 'ltd', 'no', 'vs', 'st', 'jr', 'sr']);

/* 回傳 [[from, to], ...]：passage 中每個句子的字元範圍（與腳本相同） */
function splitSentences(text) {
  const res = [];
  let pos = 0;
  const add = (base, a, b, line) => {
    let seg = line.slice(a, b);
    const lead = seg.length - seg.replace(/^\s+/, '').length;
    seg = seg.trim();
    if (seg) res.push([base + a + lead, base + a + lead + seg.length]);
  };
  String(text).split('\n').forEach(line => {
    let st = 0, m;
    const re = /(?<=[.!?])\s+(?=[A-Z"'(])/g;
    while ((m = re.exec(line))) {
      const words = line.slice(st, m.index).split(/\s+/).filter(Boolean), last = words.length ? words[words.length - 1] : '';
      if (TM_ABBR.has(last.replace(/\.+$/, '').toLowerCase()) || /^(?:[A-Za-z]\.){2,}$/.test(last)) continue; // A.M. / Ms. 等縮寫不切句
      add(pos, st, m.index, line);
      st = m.index + m[0].length;
    }
    add(pos, st, line.length, line);
    pos += line.length + 1;
  });
  return res;
}

/* state：none＝沒有 timing；bad＝欄位／範圍有誤，或與目前文稿的切句不符；
          partial＝有些句子沒對到（腳本顯示「✗ 未對到」的那些）；ok＝每個句子都有時間 */
function tmInfo(x) {
  const p = String((x && x.passage) || ''), tm = x && x.timing, exp = splitSentences(p);
  const res = (state, o) => Object.assign({ state, n: Array.isArray(tm) ? tm.length : 0, issues: [], gaps: [], dur: 0, total: exp.length }, o);
  if (!Array.isArray(tm) || !tm.length) return res('none');
  const issues = [];
  tm.forEach((t, i) => {
    const q = `第 ${i + 1} 段`;
    if (!t || ![t.start, t.end, t.from, t.to].every(Number.isFinite)) { issues.push(q + '：start／end／from／to 缺漏或不是數字'); return; }
    if (!(t.from >= 0 && t.from < t.to && t.to <= p.length)) issues.push(q + '：文字範圍（from／to）超出文稿');
    if (!(t.end > t.start)) issues.push(q + '：結束時間沒有大於開始時間');
    const o = tm[i - 1];
    if (i && o && Number.isFinite(o.to)) {
      if (t.from < o.to) issues.push(q + '：文字範圍與前一段重疊');
      if (t.start < o.end - 0.01) issues.push(q + '：開始時間早於前一段的結束');
    }
  });
  if (!issues.length) {
    const set = new Set(exp.map(e => e[0] + ':' + e[1]));
    tm.forEach((t, i) => { if (!set.has(t.from + ':' + t.to)) issues.push(`第 ${i + 1} 段：範圍與目前文稿的切句不符（文稿改過，或這是舊的 timing）`); });
  }
  if (issues.length) return res('bad', { issues });
  const got = new Set(tm.map(t => t.from + ':' + t.to));
  const gaps = exp.filter(e => !got.has(e[0] + ':' + e[1])).map(e => p.slice(e[0], e[1]));
  return res(gaps.length ? 'partial' : 'ok', { gaps, dur: tm[tm.length - 1].end });
}
const tmBadge = x => { const s = tmInfo(x).state; return `<span class="inline-block text-[11px] font-semibold rounded px-1.5 py-0.5 ${TM_COLOR[s]}">⏱ ${TM_LABEL[s]}</span>`; };
function tmWhy(x) { // 一句話說明 timing 缺什麼（完成則回傳空字串）
  const t = tmInfo(x);
  return t.state === 'ok' ? '' : t.state === 'none' ? '未做' : t.state === 'bad' ? '異常' : `漏 ${t.gaps.length} 句`;
}
