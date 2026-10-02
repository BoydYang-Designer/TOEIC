// 用法：npm i jsdom && node test_part5.js   （放在 part5.html / part5.js / part5.json 同一資料夾）
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const DIR = __dirname;
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  ✗ FAIL:', m); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(opts = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.detail || e.message)));
  vc.on('error', e => errors.push('console.error: ' + e));
  const html = fs.readFileSync(path.join(DIR, 'part5.html'), 'utf8').replace(/<script src="https:[^>]*><\/script>/, '').replace(/<script src="part5.js"><\/script>/, '');
  const dom = new JSDOM(html, { url: 'http://localhost/part5.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window;
  w.addEventListener('error', e => errors.push('window.onerror: ' + e.message));
  if (opts.storage) for (const k in opts.storage) w.localStorage.setItem(k, opts.storage[k]);
  const played = [];
  w.Audio = function () {
    const a = { src: '', paused: true, playbackRate: 1, defaultPlaybackRate: 1, preservesPitch: false,
      play() { played.push({ src: this.src, rate: this.playbackRate }); this.paused = false; setTimeout(() => { if (!this.paused && this.onended) this.onended(); }, 10); return Promise.resolve(); },
      pause() { this.paused = true; } };
    return a;
  };
  w.fetch = async (u) => {
    if (u.startsWith('part5.json')) return { ok: true, status: 200, text: async () => fs.readFileSync(path.join(DIR, 'part5.json'), 'utf8') };
    if (u.startsWith('audio/index.json')) {
      if (opts.noIndex) throw new Error('no index');
      return { ok: true, json: async () => ({ p5: { complete: opts.complete || [], partial: {}, orphans: [] } }) };
    }
    throw new Error('404 ' + u);
  };
  w.confirm = () => true; w.alert = m => errors.push('alert: ' + m); w.scrollTo = () => {};
  Object.defineProperty(w, 'scrollY', { get: () => 0 });
  const ctx = dom.getInternalVMContext();
  w.__ctx = ctx; w.eval = code => new vm.Script(code).runInContext(ctx);
  w.eval(fs.readFileSync(path.join(DIR, 'part5.js'), 'utf8'));
  return { w, dom, errors, played };
}
const ev = (w, code) => w.eval(code);

(async () => {
  /* ===== 1. 載入、首頁 ===== */
  console.log('== 載入與首頁 ==');
  let { w, errors, played } = boot({ complete: ['d1-001-m'] });
  await sleep(60);
  ok(ev(w, 'DATA.length') === 14, 'DATA 應有 14 題，實際 ' + ev(w, 'DATA.length'));
  ok(/Part 5 句子填空/.test(w.document.getElementById('main').innerHTML), '首頁標題');
  ok(/練習（14 題）/.test(w.document.getElementById('main').innerHTML), '首頁練習 14 題');
  ok(/模擬測驗（10 題）/.test(w.document.getElementById('main').innerHTML), '首頁測驗 10 題');
  ok(!/完整版/.test(w.document.getElementById('main').innerHTML), '少於 30 題不該有完整版');
  ok(!/錯題複習/.test(w.document.getElementById('main').innerHTML), '尚無錯題時不顯示錯題複習');
  ev(w, "setF('fp','wordform')"); ok(/練習（3 題）/.test(w.document.getElementById('main').innerHTML), 'wordform 篩選應為 3 題');
  ev(w, "setF('fp','');setF('fd','d4');setF('ft','hard')"); ok(/練習（1 題）/.test(w.document.getElementById('main').innerHTML), 'D4+高級 應為 1 題');
  ev(w, "setF('fd','');setF('ft','')");
  // 30 題完整版
  ev(w, "DATA=DATA.concat(Array.from({length:16},(_,i)=>Object.assign({},DATA[0],{id:'d1-9'+String(i).padStart(2,'0')+'-m'})))");
  ev(w, 'render()'); ok(/完整版/.test(w.document.getElementById('main').innerHTML), '≥30 題應出現完整版');
  ev(w, 'DATA=DATA.slice(0,14);render()');

  /* ===== 2. 3000 次抽選模擬（4.4） ===== */
  console.log('== 3000 次抽選模擬 ==');
  const N = 3000;
  for (const id of ev(w, 'DATA.map(x=>x.id)')) {
    ev(w, `R.rot={};R.stat={}`);
    const x = JSON.parse(ev(w, `JSON.stringify(byId('${id}'))`));
    const D = x.distractors, nearIdx = D.map((d, i) => d.near ? i + 1 : -1).filter(i => i > 0);
    const rootCount = D.filter(d => d.fam === 'root').length;
    const res = JSON.parse(ev(w, `JSON.stringify(Array.from({length:${N}},()=>deal(byId('${id}'))))`));
    const posCnt = [0, 0, 0, 0]; let consec = 0, dup = 0, noAns = 0, noNear = 0, rootLow = 0, len4 = 0;
    let prev = -1;
    res.forEach(r => {
      if (r.shown.length !== 4) len4++;
      const texts = r.shown.map(k => (k === 0 ? x.answer.t : D[k - 1].t).toLowerCase());
      if (new Set(texts).size !== 4) dup++;
      if (r.shown.filter(k => k === 0).length !== 1 || r.shown[r.pos] !== 0) noAns++;
      if (nearIdx.length && !r.shown.some(k => nearIdx.includes(k))) noNear++;
      if (x.point === 'wordform' && rootCount >= 2 && r.shown.filter(k => k > 0 && D[k - 1].fam === 'root').length < 2) rootLow++;
      posCnt[r.pos]++; if (r.pos === prev) consec++; prev = r.pos;
    });
    const st = JSON.parse(ev(w, `JSON.stringify(R.stat['${id}'])`));
    const nn = D.map((d, i) => i + 1).filter(k => !D[k - 1].near), mean = nn.reduce((a, k) => a + st.shown[k], 0) / nn.length;
    const minNN = Math.min(...nn.map(k => st.shown[k])), allMean = D.reduce((a, _, i) => a + st.shown[i + 1], 0) / D.length;
    const pct = posCnt.map(c => c / N);
    ok(len4 === 0, `${id}: 每次要剛好 4 個選項`);
    ok(dup === 0, `${id}: 選項文字不可重複（${dup} 次重複）`);
    ok(noAns === 0, `${id}: 每次恰含 1 個正解且 pos 正確（${noAns}）`);
    ok(noNear === 0, `${id}: 每次至少 1 個 near（${noNear} 次沒有）`);
    ok(rootLow === 0, `${id}: wordform 每次至少 2 個 root（${rootLow} 次不足）`);
    ok(pct.every(p => Math.abs(p - 0.25) <= 0.03), `${id}: 正解位置各 25%±3%（${pct.map(p => (p * 100).toFixed(1)).join('/')}）`);
    ok(consec === 0, `${id}: 正解位置不可連續兩次相同（${consec}）`);
    ok(minNN >= 0.7 * mean, `${id}: 非 near 最少曝光 ${minNN} 應 ≥ 平均 ${mean.toFixed(0)} 的 70%`);
    console.log(`  ${id} ${x.point.padEnd(8)} pos=${pct.map(p => (p * 100).toFixed(1)).join('/')} 非near曝光 min/mean=${minNN}/${mean.toFixed(0)} (${(minNN / mean * 100).toFixed(0)}%)  全部干擾項平均=${allMean.toFixed(0)}  near曝光=${nearIdx.map(k => st.shown[k]).join(',')}`);
  }
  // bag 輪替：約 4 次內 11 個干擾項各出現過一次（用沒有 near/root 補位干擾的非 wordform 題）
  ev(w, `R.rot={};R.stat={}`);
  const cyc = JSON.parse(ev(w, `JSON.stringify(Array.from({length:4},()=>deal(byId('d3-002-e')).shown))`));
  const seenSet = new Set(cyc.flat().filter(k => k > 0));
  ok(seenSet.size >= 10, `d3-002-e: 4 次內應涵蓋約 11 個干擾項（實際 ${seenSet.size}）`);
  // 持久化：重新載入後 R.rot／R.stat 仍在
  ev(w, `R.rot={};R.stat={};for(let i=0;i<7;i++){deal(byId('d1-001-m'));deal(byId('d2-002-h'))}`);
  const saved = w.localStorage.getItem('toeicPart5V1'), rotBefore = ev(w, 'JSON.stringify(R.rot)'), statBefore = ev(w, 'JSON.stringify(R.stat)');
  ok(!!saved && JSON.parse(saved).rot['d1-001-m'] && JSON.parse(saved).stat['d1-001-m'], 'localStorage 已寫入 rot／stat');
  const b2 = boot({ storage: { toeicPart5V1: saved } }); await sleep(60);
  ok(b2.w.eval('JSON.stringify(R.rot)') === rotBefore && b2.w.eval('JSON.stringify(R.stat)') === statBefore, '重新載入後 R.rot 與 R.stat 完全一致');
  const lastPos = JSON.parse(saved).rot['d1-001-m'].last, bagBefore = JSON.parse(saved).rot['d1-001-m'].bag.length;
  const nd = JSON.parse(b2.w.eval(`JSON.stringify(deal(byId('d1-001-m')))`));
  ok(nd.pos !== lastPos, '重新載入後第一次抽選，正解位置不與上次相同（沿用 last）');
  ok(Number.isInteger(bagBefore), 'bag 有持久化');

  // 防呆：干擾項文字與正解／彼此重複時，同一次顯示仍不重複
  ev(w, "DATA.push(Object.assign(JSON.parse(JSON.stringify(DATA[2])),{id:'d9-001-e'}));const dd=DATA[DATA.length-1];dd.distractors[0].t=dd.answer.t.toUpperCase();dd.distractors[1].t=dd.distractors[2].t");
  const dupRes = JSON.parse(ev(w, "JSON.stringify(Array.from({length:500},()=>{const d=deal(byId('d9-001-e')),x=byId('d9-001-e');return d.shown.map(k=>(k===0?x.answer.t:x.distractors[k-1].t).toLowerCase())}))"));
  ok(dupRes.every(a => new Set(a).size === 4), '題庫有重複選項文字時，顯示的 4 個選項仍不重複');
  ev(w, "DATA.pop()");

  /* ===== 3. 練習流程 ===== */
  console.log('== 練習流程 ==');
  ({ w, errors, played } = boot({ complete: ['d1-001-m'] })); await sleep(60);
  ev(w, "one('d1-001-m')");
  let html = w.document.getElementById('main').innerHTML;
  ok(/border-b-2/.test(html) && !/data-play/.test(html), '作答前：顯示空格、沒有音檔播放鈕');
  ok(ev(w, 'document.querySelectorAll("#main button[onclick^=\'pick(\']").length') === 4, '作答前有 4 個選項按鈕');
  ok(/id="tm"/.test(html), '有 30 秒輕量計時');
  const dl = JSON.parse(ev(w, 'JSON.stringify(V.run.deal["d1-001-m"])'));
  ev(w, 'render();render()'); ok(JSON.stringify(dl) === ev(w, 'JSON.stringify(V.run.deal["d1-001-m"])'), '重繪不會重新抽選項');
  const wrongJ = [0, 1, 2, 3].find(j => j !== dl.pos);
  ev(w, `pick(${wrongJ})`); html = w.document.getElementById('main').innerHTML;
  ok(/答錯了/.test(html), '選錯顯示答錯');
  ok((html.match(/ABCD/g) || []).length === 0 && ['A.', 'B.', 'C.', 'D.'].every(l => html.includes('<b>' + l + '</b>')), '答後 4 個選項都顯示');
  const whyCount = ev(w, 'document.querySelectorAll("#main .text-xs.mt-1").length'); ok(whyCount >= 4, '答後 4 個選項都有 why（含另外 2 個被抽到的干擾項）：' + whyCount);
  ok(/看完整選項庫/.test(html) && /本次沒抽到/.test(html), '完整選項庫折疊區標出本次沒抽到的');
  ok(/data-play/.test(html) && /data-follow/.test(html), '答後解鎖音檔與跟讀');
  ok(/🔊/.test(html) && /四步驟|線索/.test(html) || /線索/.test(html), '解析區含 clue 與單字');
  ok(JSON.parse(w.localStorage.getItem('toeicPart5V1')).saved['d1-001-m'] === 1, '答錯加入錯題');
  const pk = JSON.parse(w.localStorage.getItem('toeicPart5V1')).stat['d1-001-m'].picked.reduce((a, b) => a + b, 0); ok(pk === 1, 'stat.picked 計 1 次');
  ev(w, "playSent('d1-001-m')"); await sleep(50);
  ok(played.length === 1 && played[0].src.endsWith('audio/p5/d1-001-m.mp3'), '有音檔時播 audio/p5/{id}.mp3：' + JSON.stringify(played));
  ev(w, 'setRate(0.75)'); ev(w, "playSent('d1-001-m')"); await sleep(50);
  ok(played[1] && played[1].rate === 0.75, '0.75× 速度套用到 playbackRate');
  ev(w, 'redo()'); html = w.document.getElementById('main').innerHTML; ok(/border-b-2/.test(html) && !/data-play/.test(html), '再做一次：回到作答前');
  ev(w, `pick(${ev(w, 'V.run.deal["d1-001-m"].pos')})`); html = w.document.getElementById('main').innerHTML;
  ok(/答對了/.test(html) && !('d1-001-m' in JSON.parse(w.localStorage.getItem('toeicPart5V1')).saved), '答對後從錯題移除');
  ev(w, 'next()'); ok(ev(w, 'V.view') === 'result', '最後一題「結束」進入結果頁');
  html = w.document.getElementById('main').innerHTML; ok(/答對率/.test(html) && /各考點正確率/.test(html), '結果頁含答對率與各考點正確率');
  ev(w, "go('home')"); ok(/上次答對/.test(w.document.getElementById('main').innerHTML), '首頁顯示上次成績');

  // 跟讀模式（有音檔）：2 輪
  ev(w, "one('d1-001-m');pick(V.run.deal['d1-001-m'].pos)"); played.length = 0;
  ev(w, 'P.rounds=2;toggleFollow("d1-001-m")'); await sleep(120);
  ok(/第 1\/2 輪/.test(w.document.querySelector('[data-fr]').textContent), '跟讀顯示輪次與倒數：' + w.document.querySelector('[data-fr]').textContent);
  await sleep(1300); ok(/第 2\/2 輪/.test(w.document.querySelector('[data-fr]').textContent) || played.length >= 2, '1 秒靜音後進入第 2 輪');
  ev(w, 'stop()'); const nBefore = played.length; await sleep(1500);
  ok(played.length === nBefore && w.document.querySelector('[data-fr]').textContent === '', '停止後不再播放、狀態清空');
  // 切題停止播放
  ev(w, "playSent('d1-001-m')"); ev(w, 'next()'); ok(ev(w, 'P.on') === false && ev(w, 'P.tok') > 0, '切題會停止播放');

  // 沒有音檔時用機器發音（jsdom 無 speechSynthesis → 安靜完成不報錯）
  ev(w, "one('d2-001-e');pick(0)"); ev(w, "playSent('d2-001-e')"); ev(w, "toggleFollow('d2-001-e')"); ev(w, 'stop()');
  ok(errors.length === 0, '練習流程沒有錯誤：' + errors.join(' | '));

  /* ===== 4. 模擬測驗 ===== */
  console.log('== 模擬測驗 ==');
  ({ w, errors } = boot({ noIndex: true })); await sleep(60);
  ev(w, "begin('test',shuf(DATA).slice(0,10))");
  html = w.document.getElementById('main').innerHTML;
  ok(!/data-play/.test(html) && !/看完整選項庫/.test(html), '測驗中沒有音檔、沒有解析');
  ok(ev(w, 'V.run.limit') === 220 && /剩餘 3:4\d/.test(html), '總時間＝題數×22 秒（10 題 220 秒）：' + (html.match(/剩餘[^<]*/) || [''])[0]);
  const deals0 = ev(w, 'JSON.stringify(V.run.deal)');
  ev(w, 'pick(1);goto(3);pick(2);goto(5);flag();goto(0);render()');
  ok(ev(w, 'JSON.stringify(V.run.deal)') === deals0, '測驗：整場選項固定，不因重繪或跳題改變');
  ok(ev(w, 'Object.keys(V.run.ans).length') === 2 && ev(w, 'Object.keys(V.run.flag).filter(k=>V.run.flag[k]).length') === 1, '可跳題、標記待檢查');
  ev(w, 'V.run.t0-=300*1000;tickClock()'); ok(/時間到/.test(w.document.getElementById('tm').textContent) && ev(w, 'V.view') === 'run', '倒數到 0 只提示不強制交卷');
  ev(w, 'submit()'); ok(ev(w, 'V.view') === 'result', '交卷進入結果頁');
  html = w.document.getElementById('main').innerHTML;
  ok(/平均每題用時/.test(html) && /超過 30 秒的題數/.test(html) && /各考點正確率/.test(html), '結果頁：平均秒數、超時題數、各考點');
  ok(/答錯的題目/.test(html) && /看完整選項庫/.test(html) && /data-play/.test(html), '結果頁：答錯題可展開選項庫與播放音檔');
  const sv = JSON.parse(w.localStorage.getItem('toeicPart5V1')); ok(Object.keys(sv.saved).length >= 8, '答錯（含未答）的題進入錯題複習：' + Object.keys(sv.saved).length);
  ev(w, "go('home')"); ok(/錯題複習（\d+ 題）/.test(w.document.getElementById('main').innerHTML), '首頁出現錯題複習');
  ev(w, "begin('practice',shuf(wrongItems()))"); ok(ev(w, 'V.run.items.length') === Object.keys(sv.saved).length, '錯題複習只含錯題');
  ev(w, "go('home')");
  ok(errors.length === 0, '測驗流程沒有錯誤：' + errors.join(' | '));

  /* ===== 5. 維護 ===== */
  console.log('== 維護頁 ==');
  ({ w, errors } = boot({ complete: ['d1-001-m', 'd2-001-e'] })); await sleep(60);
  ev(w, "go('admin')"); html = w.document.getElementById('main').innerHTML;
  ok(/🎧/.test(html) && /各考點題數/.test(html) && /偏少/.test(html), '維護：矩陣、考點統計、偏少標示');
  ok(/1 · 🎧1/.test(html), '矩陣格顯示「題數 · 🎧完整數」');
  const pt = ev(w, 'window._out');
  ok(/p5_d1-002-e_x3\.json/.test(pt) || /p5_d1-00\d-e_x3\.json/.test(pt), '指令含輸出檔名：' + (pt.match(/p5_[^ ，；]*json/) || [''])[0]);
  ok(/已用過的 tag/.test(pt) && /已用過的 vocab/.test(pt) && /已有的句子首句/.test(pt) && /一題一空/.test(pt) && /_spec 精簡版/.test(pt) && /考點：不限/.test(pt), '指令含規則、已有 tag／vocab／首句、各考點題數、_spec 精簡版');
  ev(w, "togglePt('conj');togglePt('prep');ap('n',5);ap('t','hard')"); const pt2 = ev(w, 'window._out');
  ok(/只出 conj（連接詞 vs 介系詞）、prep（介系詞）/.test(pt2) && /_x5\.json/.test(pt2), '指定考點與題數會反映在指令');
  ev(w, "openCell('d1','medium')"); html = w.document.getElementById('main').innerHTML;
  ok(/選項曝光統計/.test(html) && /複製本格缺的清單/.test(html) && /試聽/.test(html) && /複製檔名/.test(html) && /複製句子/.test(html), '格子頁：曝光統計、缺檔清單、音檔面板');
  ok((html.match(/<span class="text-amber-600">near<\/span>/g) || []).length === 3 && (html.match(/rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1\.5 text-sm/g) || []).length === 11, '格子頁顯示 11 個干擾項（含 3 個 near 標記）');
  ev(w, "R.stat={};deal(byId('d1-001-m'));deal(byId('d1-001-m'));render()"); html = w.document.getElementById('main').innerHTML;
  ok(/共出現 2 次/.test(html) && (html.match(/<tr class="border-t/g) || []).length === 12, '有紀錄後曝光統計列出 12 個選項');
  ev(w, "DATA.forEach(x=>{R.stat[x.id]=null;delete R.stat[x.id]});render()");
  ev(w, "copyMiss('d1','medium');copyName('d1-001-m');copySent('d1-001-m');copyOut()");
  ok(true, '複製函式不丟錯');
  for (const d of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']) for (const t of ['easy', 'medium', 'hard']) ev(w, `openCell('${d}','${t}')`);
  ev(w, "A.cd='d2';A.ct='easy';go('adminCell')"); ok(/✓ 有/.test(w.document.getElementById('main').innerHTML), '有音檔的題顯示 ✓ 有');
  // 缺檔清單格式
  const miss = ev(w, "DATA.filter(x=>x.domain==='d1'&&x.level.tier==='hard'&&!AU.has(x.id)).map(x=>x.id+'.mp3 | '+sayText(x)+' | '+x.voice).join('\\n')");
  ok(/^d1-002-h\.mp3 \| Although the quarterly.+ \| M$/m.test(miss) && !/_____/.test(miss), '缺檔清單格式：檔名 | 完整句 | F或M，且空格已填入');
  ev(w, 'toggleDark()'); ok(JSON.stringify(JSON.parse(w.localStorage.getItem('toeicCoachV2'))) === '{"dark":true}', 'KEY 只讀寫 dark');
  ok(w.document.documentElement.classList.contains('dark'), '深色模式切換');
  ok(errors.length === 0, '維護頁沒有錯誤：' + errors.join(' | '));

  /* ===== 6. 讀不到清單／找不到 JSON ===== */
  console.log('== 例外情況 ==');
  const b3 = boot({ noIndex: true }); await sleep(60);
  ok(b3.w.eval('AU.size') === 0, '讀不到 audio/index.json → 全部機器發音');
  const b4 = boot(); b4.w.fetch = async () => { throw new Error('x'); };
  b4.w.eval('boot()'); await sleep(60); ok(/請選取 part5\.json/.test(b4.w.document.getElementById('main').innerHTML), '找不到 JSON 時顯示「請選取 part5.json」');

  console.log(`\n結果：${passes} 通過，${fails} 失敗`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(2); });
