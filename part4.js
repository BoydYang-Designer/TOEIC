/* Part 4 簡短獨白：練習／測驗／維護；題庫 part4.json（一組＝一段獨白＋3題）。記錄存在 toeicPart4V1，KEY 只讀寫 dark。
   流程：預讀題目 → 播放獨白 → 作答（測驗：預讀倒數後自動播放、只播一次、作答提示時間只提示不強制）。
   音訊：audio/index.json 的 p4.complete 有此題 → 播整段 audio/p4/{id}.mp3（一段獨白一個檔）；否則用瀏覽器 TTS（單一說話者，依 speakers[0].gender 選男女聲）。 */
const KEY='toeicCoachV2',PK='toeicPart4V1';
let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
let R={rec:{},saved:{}};try{R=Object.assign(R,JSON.parse(localStorage.getItem(PK)||'{}'))}catch(e){}
const saveR=()=>{try{localStorage.setItem(PK,JSON.stringify(R))}catch(e){}};
let DATA=[],SPEC=null;
const TESTN=3,PRE=10,ANS=24,TIER={easy:'初級',medium:'中級',hard:'高級'},TS={easy:'e',medium:'m',hard:'h'};
const QT={main:'主旨',detail:'細節',infer:'推論',intent:'意圖',next:'未來行動',graphic:'圖表',who:'身份'};
const TR={'mention-not-ask':'提到但非所問','wrong-speaker':'張冠李戴','number-mix':'數字混淆','sound-alike':'音近字','over-infer':'過度推論',opposite:'相反',partial:'部分正確'};
const MT={voicemail:'電話留言',announcement:'公告／廣播',news:'新聞報導',ad:'廣告',radio:'廣播節目',tour:'導覽介紹',meeting:'會議摘錄',speech:'演講'};
let DOM={d1:'辦公室',d2:'餐廳飲食',d3:'商店購物',d4:'街道與交通',d5:'工地與倉庫',d6:'旅館與居家',d7:'戶外與公園'};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const card='rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',btn='rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer',line='border border-slate-300 dark:border-slate-700',pri='bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed',chip='text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main=document.getElementById('main');
let V={view:'home',fd:'',ft:'',fm:'',run:null},A={d:'d1',t:'easy',m:'any',n:1,g:'any'};
const okSet=x=>x&&x.id&&Array.isArray(x.script)&&x.script.length&&Array.isArray(x.questions)&&x.questions.length&&x.questions.every(q=>q.q&&Array.isArray(q.choices)&&q.choices.length>=2&&q.choices.filter(c=>c.ok).length===1);
const tier=x=>(x.level&&x.level.tier)||'medium';
const poolOf=()=>DATA.filter(x=>(!V.fd||x.domain===V.fd)&&(!V.ft||tier(x)===V.ft)&&(!V.fm||x.mtype===V.fm));
const wrongSets=()=>DATA.filter(x=>x.questions.some(q=>R.saved[x.id+'|'+q.id]));
const on=c=>`${btn} !py-1.5 ${c?'bg-indigo-600 text-white':'bg-slate-100 dark:bg-slate-800'}`;

/* ---------- 音訊與流程 ---------- */
const AU=new Set();AU.partial={};const P={tok:0,a:null,vs:[],on:false},T={id:null,k:0};
async function auLoad(){try{const j=await(await fetch('audio/index.json',{cache:'no-store'})).json();((j.p4&&j.p4.complete)||[]).forEach(i=>AU.add(i));AU.partial=(j.p4&&j.p4.partial)||{}}catch(e){}}
const hasTTS=()=>'speechSynthesis' in window&&typeof SpeechSynthesisUtterance!=='undefined';
if(hasTTS()){const g=()=>{try{P.vs=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang))}catch(e){}};g();try{speechSynthesis.addEventListener('voiceschanged',g)}catch(e){}}
const voiceFor=g=>g==='F'?P.vs.find(v=>/female|samantha|zira|karen|susan|hazel|jenny|aria|victoria/i.test(v.name)):P.vs.find(v=>/david|james|daniel|alex|fred|mark|george|guy|ryan|\bmale/i.test(v.name)&&!/female/i.test(v.name));
function clr(){if(T.id){clearInterval(T.id);T.id=null}}
function stop(){P.tok++;clr();if(P.a){P.a.pause();P.a=null}try{speechSynthesis.cancel()}catch(e){}paintBar(false)}
function say(x,idx,tok,next){
  const l=x.script[idx],g=gOf(x)==='M'?'M':'F';
  const done=()=>{if(tok===P.tok)next()};
  if(!hasTTS())return done();
  const u=new SpeechSynthesisUtterance(l.t);u.lang='en-US';const v=voiceFor(g)||P.vs[0];if(v)u.voice=v;
  u.pitch=g==='F'?1.2:0.8;u.rate=.95;u.onend=()=>setTimeout(done,350);u.onerror=done;speechSynthesis.speak(u);
}
/* 整段獨白一個 mp3：不分句播放；練習模式的句子高亮依字數比例估算。載入失敗自動改用 TTS。單句重播（點文稿）一律用 TTS。 */
function playWhole(x,tok,cb){
  const a=new Audio('audio/p4/'+x.id+'.mp3');P.a=a;
  const lens=x.script.map(l=>l.t.length),tot=lens.reduce((s,v)=>s+v,0)||1;
  a.ontimeupdate=()=>{if(tok!==P.tok||!a.duration)return;const p=a.currentTime/a.duration*tot;let k=0,s=0;while(k<lens.length-1&&s+lens[k]<=p){s+=lens[k];k++}hl(k)};
  a.onended=()=>{if(tok!==P.tok)return;P.a=null;hl(-1);paintBar(false);if(cb)cb()};
  const bad=()=>{if(tok!==P.tok)return;P.a=null;AU.delete(x.id);play(x,0,false,cb)};
  a.onerror=bad;a.play().catch(bad);
}
function play(x,from,only,cb){
  stop();const tok=P.tok;let i=from||0;paintBar(true);
  if(AU.has(x.id)&&!only&&!from){playWhole(x,tok,cb);return}
  const step=()=>{if(tok!==P.tok)return;if(i>=x.script.length||(only&&i>from)){paintBar(false);if(cb)cb();return}hl(i);say(x,i++,tok,step)};step();
}
function hl(i){document.querySelectorAll('.tsent').forEach((e,k)=>e.classList.toggle('active',k===i))}
function paintBar(o){P.on=o;const b=document.getElementById('pb');if(b)b.textContent=o?'⏹ 停止':'▶ 播放獨白'}
function toggle(){const r=V.run,x=r.sets[r.i];if(P.on){stop();return}play(x,0)}
function play1(i){const r=V.run;if(r.mode==='practice')play(r.sets[r.i],i,true)}
/* 預讀 → 播放 → 作答；stage：idle（練習等待）／pre（倒數）／play／ans */
function tick(n,fin){clr();T.k=n;const up=()=>{const e=document.getElementById('cd');if(e)e.textContent=T.k};up();T.id=setInterval(()=>{T.k=Math.max(0,T.k-1);up();if(T.k<=0){clr();if(fin)fin()}},1000)}
function startPre(){const r=V.run,x=r.sets[r.i];stop();r.stage[x.id]='pre';T.k=PRE;render();tick(PRE,startPlay)}
function startPlay(){
  const r=V.run,x=r.sets[r.i];stop();if(r.mode==='test'){if(r.played[x.id])return;r.played[x.id]=1}
  r.stage[x.id]='play';render();
  play(x,0,false,()=>{if(V.run!==r||r.sets[r.i]!==x)return;r.stage[x.id]='ans';render();if(r.mode==='test')tick(ANS)});
}
function autoStart(){const r=V.run;if(r&&r.mode==='test'&&!r.stage[r.sets[r.i].id])startPre()}

/* ---------- 作答 ---------- */
function begin(mode,sets){stop();V.run={mode,sets,i:0,ord:{},ans:{},played:{},stage:{},showT:false,zh:false};V.view='run';render();scrollTo(0,0)}
const one=id=>begin('practice',[DATA.find(x=>x.id===id)]);
const ordFor=(r,x,q)=>{const k=x.id+'|'+q.id;return r.ord[k]||(r.ord[k]=(q.qtype==='graphic'||q.choices.every(c=>/\d/.test(c.t)&&c.t.split(' ').length<=4))?q.choices.map((_,i)=>i):shuf(q.choices.map((_,i)=>i)))};
function pick(k,ci){const r=V.run,x=r.sets[r.i];if(r.mode==='practice'){if(r.ans[k]!==undefined)return;const st=r.stage[x.id];if(!st||st==='idle'||st==='pre')return}r.ans[k]=ci;const y=scrollY;render();scrollTo(0,y)};
const tg=k=>{V.run[k]=!V.run[k];const y=scrollY;render();scrollTo(0,y)};
function next(){stop();const r=V.run;if(r.i>=r.sets.length-1)finish();else{r.i++;render();scrollTo(0,0)}}
function finish(){
  const r=V.run;let c=0,n=0;const bt={},tp={},wr=[];
  r.sets.forEach(x=>{let s=0;x.questions.forEach(q=>{const k=x.id+'|'+q.id,a=r.ans[k],ch=q.choices[a];n++;(bt[q.qtype]=bt[q.qtype]||[0,0])[1]++;
    if(ch&&ch.ok){c++;s++;bt[q.qtype][0]++;delete R.saved[k]}else{R.saved[k]=1;if(ch&&ch.trap)tp[ch.trap]=(tp[ch.trap]||0)+1;wr.push({x,q,a})}});
    R.rec[x.id]={s,t:Date.now()}});
  saveR();r.res={c,n,bt,tp,wr};V.view='result';render();scrollTo(0,0);
}
const go=v=>{stop();V.view=v;render();scrollTo(0,0)};

/* ---------- 畫面 ---------- */
const hdr=(t,back)=>`<div class="flex items-center gap-3 mb-4"><button onclick="${back}" class="${btn} ${line} !py-1.5">←</button><h1 class="text-lg font-bold">${esc(t)}</h1></div>`;
const gH=g=>g?`<div class="${card} p-3 mb-3 overflow-x-auto"><p class="text-xs font-bold mb-1">${esc(g.title)}</p><table class="text-sm w-full"><tr>${g.columns.map(c=>`<th class="text-left pr-4 border-b border-slate-300 dark:border-slate-700">${esc(c)}</th>`).join('')}</tr>${g.rows.map(r=>`<tr>${r.map(c=>`<td class="pr-4 py-0.5">${esc(c)}</td>`).join('')}</tr>`).join('')}</table></div>`:'';
function homeH(){
  const pool=poolOf(),tot=DATA.length,ws=wrongSets(),mts=Object.keys(MT).filter(k=>DATA.some(x=>x.mtype===k));
  return `<div class="flex items-center justify-between mb-4"><div><a href="index.html" class="text-sm text-slate-500">← 首頁</a><h1 class="text-xl font-bold">Part 4 簡短獨白</h1></div><div class="flex gap-2"><button onclick="toggleDark()" class="${btn} ${line} !py-1.5">${S.dark?'☀':'☾'}</button><button onclick="go('admin')" class="${btn} ${line} !py-1.5">維護</button></div></div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="setF('fd','')" class="${on(!V.fd)}">全部主題</button>${Object.keys(DOM).map(k=>`<button onclick="setF('fd','${k}')" class="${on(V.fd===k)}">${k.toUpperCase()} ${esc(DOM[k])}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="setF('ft','')" class="${on(!V.ft)}">全部難度</button>${Object.keys(TIER).map(k=>`<button onclick="setF('ft','${k}')" class="${on(V.ft===k)}">${TIER[k]}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-4"><button onclick="setF('fm','')" class="${on(!V.fm)}">全部類型</button>${mts.map(k=>`<button onclick="setF('fm','${k}')" class="${on(V.fm===k)}">${esc(MT[k])}</button>`).join('')}</div>
  <div class="grid grid-cols-2 gap-3 mb-3"><button ${pool.length?'':'disabled'} onclick="begin('practice',shuf(poolOf()))" class="${btn} ${pri}">練習（${pool.length} 組）</button><button ${pool.length?'':'disabled'} onclick="begin('test',shuf(poolOf()).slice(0,${TESTN}))" class="${btn} ${pri}">模擬測驗（${Math.min(TESTN,pool.length)} 組）</button></div>
  ${ws.length?`<button onclick="begin('practice',shuf(wrongSets()))" class="${btn} ${line} w-full mb-4">錯題複習（${ws.length} 組有答錯過的題）</button>`:'<div class="mb-4"></div>'}
  ${pool.length?pool.map(x=>{const r=R.rec[x.id];return `<button onclick="one('${esc(x.id)}')" class="${card} p-3 mb-2 w-full text-left flex items-center justify-between gap-2"><span><b class="text-sm">${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="flex flex-wrap gap-1 mt-1"><span class="${chip}">${TIER[tier(x)]}</span><span class="${chip}">${esc(MT[x.mtype]||x.mtype||'')}</span>${x.graphic?`<span class="${chip}">圖表</span>`:''}</span></span><span class="text-xs text-slate-500 shrink-0">${r?'✓ '+r.s+'/'+x.questions.length:''}</span></button>`}).join(''):`<div class="${card} p-8 text-center text-sm text-slate-500">沒有符合的題目（題庫共 ${tot} 組）。</div>`}`;
}
const setF=(k,v)=>{V[k]=v;render()};
function runH(){
  const r=V.run,x=r.sets[r.i],pr=r.mode==='practice',last=r.i===r.sets.length-1,ev=new Set(),st=r.stage[x.id]||'idle',locked=pr&&(st==='idle'||st==='pre');
  if(pr)x.questions.forEach(q=>{if(r.ans[x.id+'|'+q.id]!==undefined)(q.evidence||[]).forEach(i=>ev.add(i))});
  const allDone=x.questions.every(q=>r.ans[x.id+'|'+q.id]!==undefined);
  const qs=x.questions.map((q,qi)=>{
    const k=x.id+'|'+q.id,a=r.ans[k],done=a!==undefined;
    return `<div class="${card} p-4 mb-3"><p class="text-sm font-bold">${qi+1}. ${esc(q.q.t)}</p>${pr&&done&&q.q.zh?`<p class="text-xs text-slate-500">${esc(q.q.zh)}</p>`:''}<div class="mt-2">${ordFor(r,x,q).map((ci,j)=>{
      const c=q.choices[ci];let cls=line;
      if(pr&&done){if(c.ok)cls='border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50';else if(ci===a)cls='border border-rose-500 bg-rose-50 dark:bg-rose-950/50'}
      else if(!pr&&ci===a)cls='border border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50';
      return `<button ${(pr&&done)||locked?'disabled':''} onclick="pick('${k}',${ci})" class="w-full text-left rounded-lg px-3 py-2 text-sm mb-1.5 ${cls} ${locked?'opacity-70':''}"><b>${'ABCD'[j]}.</b> ${esc(c.t)}${pr&&done&&c.zh?`<span class="block text-xs text-slate-500">${esc(c.zh)}</span>`:''}${pr&&done?`<span class="block text-xs mt-1 ${c.ok?'text-emerald-600':'text-slate-500'}">${c.ok?'✓ 正解':esc(TR[c.trap]||'')}：${esc(c.why)}</span>`:''}</button>`}).join('')}</div></div>`}).join('');
  const tr=pr&&r.showT&&!locked?`<div class="${card} p-3 mb-3">${x.script.map((l,i)=>`<p class="tsent px-2 py-1 text-sm ${ev.has(i)?'!bg-amber-100 dark:!bg-amber-900/40':''}" onclick="play1(${i})">${esc(l.t)}${r.zh?`<span class="block text-xs text-slate-500">${esc(l.zh)}</span>`:''}</p>`).join('')}</div>`:'';
  let ctl;
  if(pr&&st==='idle')ctl=`<button onclick="startPre()" class="${btn} ${pri} !py-1.5">⏱ 預讀 ${PRE} 秒後播放</button><button onclick="startPlay()" class="${btn} ${line} !py-1.5">▶ 直接播放</button><span class="text-xs text-slate-500">先讀題目與圖表，再聽獨白</span>`;
  else if(st==='pre')ctl=`<span class="text-sm">預讀題目與圖表… <b id="cd">${T.k}</b> 秒後自動播放（只播一次）</span><button onclick="startPlay()" class="${btn} ${pri} !py-1.5">跳過，立即播放</button>`;
  else if(pr)ctl=`<button id="pb" onclick="toggle()" class="${btn} ${pri} !py-1.5"></button><button onclick="tg('showT')" class="${btn} ${line} !py-1.5">${r.showT?'隱藏':'顯示'}文稿</button>${r.showT?`<button onclick="tg('zh')" class="${btn} ${line} !py-1.5">${r.zh?'隱藏':'顯示'}中文</button>`:''}`;
  else if(st==='play')ctl='<span class="text-sm">播放中…（獨白只播一次，可邊聽邊作答）</span>';
  else ctl=`<span class="text-sm">作答提示時間 <b id="cd">${T.k}</b> 秒（僅提示，不會強制換題）</span>`;
  return `<div class="flex items-center justify-between mb-3"><button onclick="if(confirm('離開本次作答？'))go('home')" class="${btn} ${line} !py-1.5">✕ 離開</button><span class="text-sm text-slate-500">${pr?'練習':'測驗'} ${r.i+1}/${r.sets.length} · ${esc(MT[x.mtype]||'')} · ${TIER[tier(x)]}</span></div>
  <div class="${card} p-3 mb-3 flex flex-wrap items-center gap-2">${ctl}</div>
  ${tr}${gH(x.graphic)}${qs}
  <button ${!pr&&!allDone?'disabled':''} onclick="next()" class="${btn} ${pri} w-full">${last?(pr?'結束':'交卷'):'下一組 →'}</button>`;
}
function resultH(){
  const {c,n,bt,tp,wr}=V.run.res,pr=V.run.mode==='practice';
  const row=(a,b)=>`<div class="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800"><span>${a}</span><span>${b}</span></div>`;
  return hdr(pr?'練習結果':'測驗結果','go(\'home\')')+`<div class="${card} p-5 mb-3 text-center"><div class="text-4xl font-bold">${c}/${n}</div><div class="text-sm text-slate-500">答對率 ${Math.round(c/n*100)}%</div></div>
  <div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">各題型</p>${Object.keys(bt).map(k=>row(QT[k]||k,bt[k][0]+'/'+bt[k][1])).join('')}</div>
  ${Object.keys(tp).length?`<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">你最常中的陷阱</p>${Object.keys(tp).sort((a,b)=>tp[b]-tp[a]).map(k=>row(TR[k]||k,tp[k]+' 次')).join('')}</div>`:''}
  ${wr.length?`<p class="font-bold text-sm mb-2">答錯的題目</p>`+wr.map(w=>{const ok=w.q.choices.find(c=>c.ok),my=w.q.choices[w.a];return `<div class="${card} p-3 mb-2 text-sm"><p class="font-bold">${esc(w.x.id)} · ${esc(w.q.q.t)}</p><p class="text-rose-600 mt-1">你選：${my?esc(my.t):'（未作答）'}${my&&my.trap?'（'+esc(TR[my.trap]||'')+'）':''}</p><p class="text-emerald-600">正解：${esc(ok.t)}</p><p class="text-xs text-slate-500 mt-1">${esc(ok.why)}</p></div>`}).join(''):`<div class="${card} p-4 text-sm text-center">全部答對 🎉</div>`}
  <button onclick="go('home')" class="${btn} ${pri} w-full mt-3">回到首頁</button>`;
}

/* ---------- 維護：矩陣＋AI 出題指令 ---------- */
const serial=(d,t)=>{let mx=0;DATA.forEach(x=>{const m=/^d(\d)-(\d+)-([emh])$/.exec(x.id);if(m&&'d'+m[1]===d&&m[3]===TS[t])mx=Math.max(mx,+m[2])});return mx};
const SC={easy:[500,550],medium:[600,650],hard:[700,800]},cefr=s=>s<=550?'A2+':s===600?'B1':s===650?'B1+':s<=750?'B2':'B2+';
function promptText(){
  const cq={},cm={};DATA.filter(x=>x.domain===A.d&&tier(x)===A.t).forEach(x=>{cm[x.mtype]=(cm[x.mtype]||0)+1;x.questions.forEach(q=>{cq[q.qtype]=(cq[q.qtype]||0)+1})});
  const {d,t,m,n,g}=A,mx=serial(d,t),ids=Array.from({length:n},(_,i)=>d+'-'+String(mx+1+i).padStart(3,'0')+'-'+TS[t]),sp=SPEC||{},mts=(sp.mtypes&&Object.keys(sp.mtypes))||Object.keys(MT);
  const lite=JSON.stringify({domain:{[d]:sp.domains&&sp.domains[d]},tier:{[t]:sp.tiers&&sp.tiers[t]},qtypes:sp.qtypes,mtypes:sp.mtypes,traps:sp.traps,entry_schema:sp.entry_schema,rules:sp.rules});
  return [`請為多益 Part 4 簡短獨白寫 ${n} 組題目（每組一段獨白＋3題），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part4.json。`,'',
  `- 主題：${d.toUpperCase()} ${DOM[d]}（scene 須屬於：${((sp.domains&&sp.domains[d]&&sp.domains[d].scenes)||[]).join('、')}）`,
  `- 難度：${TIER[t]}（id 尾碼 ${TS[t]}）｜level.score 只能填：${SC[t].map(s=>s+'（cefr 填 '+cefr(s)+'）').join('、')}${sp.tiers&&sp.tiers[t]?'｜'+sp.tiers[t].guide:''}`,
  `- 獨白類型 mtype：${m==='any'?'請依主題選合適的類型並分散（可用：'+mts.join('、')+'）':m+'（'+MT[m]+'）'}；此主題＋難度已有的類型題數：${mts.map(k=>k+'×'+(cm[k]||0)).join('、')}。`,
  '- 形式：單一說話者獨白（form 填 talk，speakers 只有 1 位 {id:"S",gender,role}；script 每句 {t,zh}，不要出現說話者標籤）；開場與結尾要符合該 mtype 的慣用語。',
  `- id 依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）`,
  `- 每組 3 題；題型請搭配（主旨／細節／推論／意圖／未來行動／身份${g==='no'?'':'／圖表'}），各組不要完全相同；${g==='no'?'本批不要出圖表題（graphic 填 null）':g==='one'?'這批至少 1 組要含圖表題，圖表題須提供 graphic，且答案需結合圖表與獨白（獨白更正圖表資訊，或需兩個條件對照）':'圖表題須提供 graphic'}。`,
  `- 此主題＋難度已有的題型題數：${Object.keys(QT).map(k=>k+'×'+(cq[k]||0)).join('、')}，請優先補數量最少的題型。`,
  '- 每題 4 選項、剛好 1 正解；錯誤選項須有明確依據可排除，並標 trap；每個選項都要附 zh（中文翻譯）；evidence 為 script 句索引（從 0 起），依題號遞增；意圖題引號內的句子必須逐字出現在 script。',
  `- 已用過的 vocab（不得重複）：${[...new Set(DATA.flatMap(x=>(x.vocab||[]).map(v=>v.word)))].join('、')||'（無）'}`,
  `- 已用過的 tag（不得重複）：${DATA.map(x=>x.tag).join('；')||'（無）'}`,
  `- 已有的獨白首句（不要雷同）：${DATA.map(x=>x.script[0].t).join('；')||'（無）'}`,
  `- 輸出方式：建立檔案 p4_${ids[0]}_x${n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。`,
  '','【規格：part4.json 的 _spec 精簡版】',lite].join('\n');
}
function adminH(){
  const ds=Object.keys(DOM),tx=promptText(),cm={};DATA.forEach(x=>{cm[x.mtype]=(cm[x.mtype]||0)+1});
  window._out=tx;
  return hdr('維護','go(\'home\')')+`<div class="${card} p-3 mb-2 overflow-x-auto"><table class="text-sm w-full"><tr><th class="text-left">主題</th>${Object.keys(TIER).map(t=>`<th>${TIER[t]}</th>`).join('')}</tr>${ds.map(d=>`<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-1">${d.toUpperCase()} ${esc(DOM[d])}</td>${Object.keys(TIER).map(t=>`<td class="text-center"><button onclick="openCell('${d}','${t}')" class="underline px-2">${DATA.filter(x=>x.domain===d&&tier(x)===t).length}</button></td>`).join('')}</tr>`).join('')}</table></div>
  <div class="flex flex-wrap gap-1.5 mb-4">${Object.keys(MT).map(k=>`<span class="${chip}">${esc(MT[k])} ${cm[k]||0}</span>`).join('')}</div>
  <h2 class="font-bold mb-2">新增題目</h2><div class="flex flex-wrap gap-2 mb-2">${ds.map(d=>`<button onclick="ap('d','${d}')" class="${on(A.d===d)}">${d.toUpperCase()}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2">${Object.keys(TIER).map(t=>`<button onclick="ap('t','${t}')" class="${on(A.t===t)}">${TIER[t]}</button>`).join('')}${[1,2,3].map(k=>`<button onclick="ap('n',${k})" class="${on(A.n===k)}">${k} 組</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="ap('m','any')" class="${on(A.m==='any')}">類型：不限</button>${Object.keys(MT).map(k=>`<button onclick="ap('m','${k}')" class="${on(A.m===k)}">${esc(MT[k])}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2">${[['any','圖表：不限'],['one','至少 1 組圖表題'],['no','不含圖表題']].map(([k,v])=>`<button onclick="ap('g','${k}')" class="${on(A.g===k)}">${v}</button>`).join('')}</div>
  <div class="${card} p-4"><div class="flex items-center justify-between mb-2"><p class="font-bold text-sm">給 AI 的「寫題目」指令（約 ${tx.length.toLocaleString()} 字）</p><button id="cp" onclick="copyOut()" class="${btn} ${line} !py-1 text-xs">複製</button></div><pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(tx)}</pre><p class="text-xs text-slate-500 mt-2">AI 回傳的檔案（p4_ 開頭）放到 json_merge.py 同資料夾，選「Part 4 獨白」合併；合併後到上方矩陣點該格，展開題組即可複製錄音稿與檔名。音檔放 audio/p4/ 後執行 audio_scan.py。</p></div>`;
}
const pad=i=>String(i).padStart(2,'0');
const auSt=id=>AU.has(id)?['complete','✓ 已有音檔','text-emerald-600']:['none','✗ 無音檔','text-slate-400'];
const gOf=x=>((x.speakers||[])[0]||{}).gender||'?';
const auName=x=>x.id+'.mp3';
const copyAudio=id=>{const x=DATA.find(v=>v.id===id);clip(x.script.map(l=>l.t).join(' '),'ca-'+id)};
const copyNames=id=>{const x=DATA.find(v=>v.id===id);clip(auName(x),'cn-'+id)};
function auPanelH(x){
  const st=auSt(x.id),f=auName(x);
  return `<div class="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"><div class="flex items-center justify-between gap-2 mb-1"><p class="text-sm font-bold">🎧 音檔 <span class="text-xs ${st[2]}">${st[1]}</span></p><span class="flex gap-1.5 shrink-0"><button id="cn-${esc(x.id)}" onclick="copyNames('${esc(x.id)}')" class="${btn} ${line} !py-1 text-xs">複製檔名</button><button id="ca-${esc(x.id)}" onclick="copyAudio('${esc(x.id)}')" class="${btn} ${line} !py-1 text-xs">複製錄音稿</button></span></div><p class="text-xs text-slate-500 mb-1">整段獨白錄成一個檔，存成 audio/p4/<b class="font-mono">${esc(f)}</b>（${gOf(x)==='F'?'女聲':'男聲'}，全程同一個聲音；句子之間自然停頓即可）。放好後執行 audio_scan.py。</p><p class="text-xs rounded bg-white dark:bg-slate-900 p-2 leading-relaxed">${esc(x.script.map(l=>l.t).join(' '))}</p></div>`;
}
const openCell=(d,t)=>{A.cd=d;A.ct=t;go('adminCell')};
function adminCellH(){
  const d=A.cd,t=A.ct,xs=DATA.filter(x=>x.domain===d&&tier(x)===t).sort((a,b)=>a.id.localeCompare(b.id)),nm=d.toUpperCase()+' '+DOM[d]+' · '+TIER[t];
  return hdr(nm,"go('admin')")+`<button onclick="A.d='${d}';A.t='${t}';go('admin')" class="${btn} ${pri} w-full mb-4">＋ 新增 ${esc(nm)} 題目</button>`+(xs.length?xs.map(x=>{const st=auSt(x.id);
    return `<details class="${card} p-3 mb-3"><summary class="cursor-pointer"><b class="text-sm">${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="flex flex-wrap gap-1 mt-1"><span class="${chip}">${esc(MT[x.mtype]||x.mtype||'')}</span>${x.graphic?`<span class="${chip}">圖表</span>`:''}<span class="${chip} ${st[2]}">${st[1]}</span></span></summary>
    <div class="mt-3 space-y-1">${x.script.map((l,i)=>`<p class="text-sm"><span class="text-xs text-slate-400">${i}</span> ${esc(l.t)}<span class="block text-xs text-slate-500">${esc(l.zh)}</span></p>`).join('')}</div>${gH(x.graphic)}
    ${x.questions.map((q,qi)=>`<div class="mt-3"><p class="text-sm font-bold">${qi+1}. [${esc(QT[q.qtype]||q.qtype)}] ${esc(q.q.t)}<span class="block text-xs font-normal text-slate-500">${esc(q.q.zh)}　證據句：${(q.evidence||[]).join(', ')}</span></p>${q.choices.map(c=>`<div class="rounded-lg border px-3 py-1.5 text-sm mt-1 ${c.ok?'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50':'border-slate-200 dark:border-slate-800'}">${esc(c.t)}<span class="block text-xs text-slate-500">${c.ok?'✓ '+esc(c.pattern||''):esc(TR[c.trap]||'')}：${esc(c.why)}</span></div>`).join('')}</div>`).join('')}
    ${auPanelH(x)}</details>`}).join(''):`<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有題目（0 題）。</div>`);
}
const ap=(k,v)=>{A[k]=v;render()};
function copyOut(){clip(window._out||'','cp')}
function clip(t,bid){const d=()=>{const b=document.getElementById(bid);if(b){b.dataset.l=b.dataset.l||b.textContent;b.textContent='已複製 ✓';setTimeout(()=>{if(b.isConnected)b.textContent=b.dataset.l||'複製'},1500)}};
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();d()};
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(d,fb);else fb()}
function toggleDark(){S.dark=!S.dark;try{const c=JSON.parse(localStorage.getItem(KEY)||'{}');c.dark=S.dark;localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}render()}
function render(){
  document.documentElement.classList.toggle('dark',!!S.dark);
  const v=V.view;main.innerHTML=v==='run'?runH():v==='result'?resultH():v==='admin'?adminH():v==='adminCell'?adminCellH():homeH();
  if(v==='run'){paintBar(P.on);autoStart()}
}

/* ---------- 啟動 ---------- */
function loadText(t){
  try{const j=JSON.parse(t);SPEC=(j&&j._spec)||null;const d=SPEC&&SPEC.domains;
    if(d)Object.keys(d).forEach(k=>{if(d[k]&&d[k].name)DOM[k]=d[k].name});
    DATA=(Array.isArray(j)?j:(j&&j.items)||[]).filter(okSet);render();
  }catch(e){alert('part4.json 格式有誤：'+e.message)}
}
function pickJson(i){const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>loadText(r.result);r.readAsText(f,'utf-8')}
async function boot(){
  await auLoad();
  try{const res=await fetch('part4.json',{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);loadText(await res.text())}
  catch(e){main.innerHTML=`<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 part4.json</h3><p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取；上傳到 GitHub Pages 或用本機伺服器則會自動載入。</p><label class="${btn} inline-block ${pri}">選取 part4.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`}
}
boot();
