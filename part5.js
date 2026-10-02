/* Part 5 句子填空：練習／模擬測驗／維護；題庫 part5.json（一題＝一個句子＋1 正解＋11 干擾項）。
   記錄存在 toeicPart5V1（rec／saved／rot／stat），KEY 只讀寫 dark。
   選項：每次作答「正解＋從 11 個干擾項抽 3 個」共 4 個再洗牌（bag 輪替、至少 1 個 near、wordform 優先同字根、正解位置不與上次相同）。
   音訊：audio/index.json 的 p5.complete 有此題 → 播 audio/p5/{id}.mp3；否則用瀏覽器 TTS（依 voice 選男女聲）。自成一體，不依賴 audio.js。 */
const KEY='toeicCoachV2',PK='toeicPart5V1';
let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){}
let R={rec:{},saved:{},rot:{},stat:{}};try{R=Object.assign(R,JSON.parse(localStorage.getItem(PK)||'{}'))}catch(e){}
['rec','saved','rot','stat'].forEach(k=>{if(!R[k]||typeof R[k]!=='object'||Array.isArray(R[k]))R[k]={}});
const saveR=()=>{try{localStorage.setItem(PK,JSON.stringify(R))}catch(e){}};
let DATA=[],SPEC=null;
const BLANK='_____',TESTSEC=22,WARN=30;
const TIER={easy:'初級',medium:'中級',hard:'高級'},TS={easy:'e',medium:'m',hard:'h'},SUG={easy:'10–15 秒',medium:'15–25 秒',hard:'20–30 秒'};
const PT={wordform:['grammar','詞性',[25,30]],tense:['grammar','時態',[8,10]],voice:['grammar','語態',[6,8]],agree:['grammar','主詞動詞一致',[5,5]],verbform:['grammar','不定詞／動名詞／分詞',[6,8]],conj:['grammar','連接詞 vs 介系詞',[7,9]],prep:['grammar','介系詞',[5,7]],pronoun:['grammar','代名詞／所有格',[4,5]],relative:['grammar','關係詞',[3,4]],compare:['grammar','比較級／最高級',[2,3]],quant:['grammar','數量詞／限定詞',[2,3]],vmeaning:['vocab','語意辨析',[15,20]],vcolloc:['vocab','搭配詞',[10,12]],vconfuse:['vocab','易混淆字',[5,8]]};
const TR={pos:'詞性不符',tense:'時態不符',voice:'語態不符',agree:'一致性錯誤',form:'動詞形式錯誤',case:'代名詞格／限定詞錯誤',structure:'連接詞與介系詞結構不符',logic:'邏輯關係不符',confusable:'形似音近',collocation:'搭配錯誤',meaning:'語意不符'};
let DOM={d1:'辦公室',d2:'餐廳飲食',d3:'商店購物',d4:'街道與交通',d5:'工地與倉庫',d6:'旅館與居家',d7:'戶外與公園'};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pick1=a=>a[Math.floor(Math.random()*a.length)];
const card='rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',btn='rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer',line='border border-slate-300 dark:border-slate-700',pri='bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed',chip='text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main=document.getElementById('main');
let V={view:'home',fd:'',ft:'',fp:'',run:null},A={d:'d1',t:'easy',pts:[],n:3,cd:null,ct:null};
const filled=x=>x.sentence.t.replace(BLANK,()=>x.answer.t);
const sayText=x=>x.say||filled(x);
const tier=x=>(x.level&&x.level.tier)||'medium';
const byId=id=>DATA.find(x=>x.id===id);
const okItem=x=>!!(x&&x.id&&x.sentence&&typeof x.sentence.t==='string'&&x.sentence.t.split(BLANK).length===2&&x.answer&&x.answer.t&&Array.isArray(x.distractors)&&x.distractors.length>=3&&x.distractors.every(d=>d&&d.t));
const poolOf=()=>DATA.filter(x=>(!V.fd||x.domain===V.fd)&&(!V.ft||tier(x)===V.ft)&&(!V.fp||x.point===V.fp));
const wrongItems=()=>DATA.filter(x=>R.saved[x.id]);
const on=c=>`${btn} !py-1.5 ${c?'bg-indigo-600 text-white':'bg-slate-100 dark:bg-slate-800'}`;
const ptName=k=>(PT[k]&&PT[k][1])||k;

/* ---------- 選項輪替（核心）：回傳 {shown:[4 個選項索引（0=正解，j+1=第 j 個干擾項）], pos:正解位置 0–3} ---------- */
function deal(x){
  const D=x.distractors,low=s=>String(s).trim().toLowerCase();
  const seen=new Set([low(x.answer.t)]),ok=[];
  D.forEach((d,i)=>{const k=low(d.t);if(!seen.has(k)){seen.add(k);ok.push(i)}});   // 文字與正解或前面干擾項重複者不用
  const near=i=>D[i].near===true,root=i=>D[i].fam==='root';
  let r=R.rot[x.id];if(!r||typeof r!=='object')r=R.rot[x.id]={bag:[],last:-1};
  let bag=(Array.isArray(r.bag)?r.bag:[]).filter((v,k,a)=>ok.indexOf(v)>=0&&a.indexOf(v)===k);
  const take=[];
  if(bag.length<3){take.push(...bag);bag=shuf(ok.filter(i=>!take.includes(i)))}   // 不足 3 個：先取剩下的，再把其餘（不含本次已取）重新洗牌補進 bag
  while(take.length<3&&bag.length)take.push(bag.shift());
  const rootsAll=ok.filter(root),need=x.point==='wordform'?Math.min(2,rootsAll.length):0,rc=()=>take.filter(root).length;
  const swapIn=(cand,out)=>{take[take.indexOf(out)]=cand;const b=bag.indexOf(cand);if(b>=0)bag.splice(b,1);if(bag.indexOf(out)<0)bag.unshift(out)};   // 被換下的放回 bag
  while(rc()<need){   // 詞性題成套：至少 2 個同字根
    const out=take.find(i=>!root(i));if(out===undefined)break;
    const pool=ok.filter(i=>root(i)&&!take.includes(i));if(!pool.length)break;
    const inbag=bag.find(i=>pool.includes(i));swapIn(inbag!==undefined?inbag:pick1(pool),out);
  }
  if(!take.some(near)){   // 至少 1 個 near
    const cands=ok.filter(i=>near(i)&&!take.includes(i));
    if(cands.length){
      const fs=[c=>bag.includes(c)&&(!need||root(c)),c=>!need||root(c),c=>bag.includes(c),()=>true];
      let cand;for(const f of fs){const l=cands.filter(f);if(l.length){cand=pick1(l);break}}
      const outs=take.filter(o=>rc()-(root(o)?1:0)+(root(cand)?1:0)>=need);
      swapIn(cand,pick1(outs.length?outs:take));
    }
  }
  const m=take.length+1;let pos,tries=0;   // 正解位置：隨機，且不與上次相同（最多重試 5 次，再不行就從其餘位置挑）
  do{pos=Math.floor(Math.random()*m);tries++}while(pos===r.last&&tries<=5);
  if(pos===r.last)pos=(r.last+1+Math.floor(Math.random()*(m-1)))%m;
  const rest=shuf(take),shown=[];let q=0;
  for(let j=0;j<m;j++)shown.push(j===pos?0:rest[q++]+1);
  r.bag=bag;r.last=pos;
  const st=R.stat[x.id]||(R.stat[x.id]={shown:[],picked:[]});
  for(let k=0;k<=D.length;k++){st.shown[k]=st.shown[k]||0;st.picked[k]=st.picked[k]||0}
  shown.forEach(k=>{st.shown[k]++});
  saveR();return{shown,pos};
}
const optOf=(x,k)=>k===0?{k,t:x.answer.t,zh:x.answer.zh,pos:x.answer.pos,ok:true,why:x.answer.why}:(d=>({k,t:d.t,zh:d.zh,pos:d.pos,ok:false,trap:d.trap,near:d.near,why:d.why}))(x.distractors[k-1]);

/* ---------- 音訊（自成一體）：同一個 Audio 元素、點擊啟動、切題或離開一定停止 ---------- */
const AU=new Set(),P={tok:0,a:new Audio(),vs:[],rate:1,rounds:3,on:false,cur:null,fr:null,w:null};
async function auLoad(){try{const j=await(await fetch('audio/index.json',{cache:'no-store'})).json();((j.p5&&j.p5.complete)||[]).forEach(i=>AU.add(i))}catch(e){}}
const hasTTS=()=>'speechSynthesis' in window&&typeof SpeechSynthesisUtterance!=='undefined';
if(hasTTS()){const g=()=>{try{P.vs=speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang))}catch(e){}};g();try{speechSynthesis.addEventListener('voiceschanged',g)}catch(e){}}
const voiceFor=g=>g==='F'?P.vs.find(v=>/female|samantha|zira|karen|susan|hazel|jenny|aria|victoria/i.test(v.name)):P.vs.find(v=>/david|james|daniel|alex|fred|mark|george|guy|ryan|\bmale/i.test(v.name)&&!/female/i.test(v.name));
function stop(){
  P.tok++;if(P.w){clearInterval(P.w);P.w=null}
  try{P.a.onended=null;P.a.onerror=null;P.a.pause()}catch(e){}
  try{speechSynthesis.cancel()}catch(e){}
  P.on=false;P.fr=null;P.cur=null;paintAudio();
}
function speakOnce(x,rate,tok,done){
  let fin=false;const end=()=>{if(fin)return;fin=true;if(tok===P.tok)done()};
  if(AU.has(x.id)){
    const a=P.a;a.onended=end;a.onerror=end;a.src='audio/p5/'+x.id+'.mp3';
    try{a.defaultPlaybackRate=rate;a.playbackRate=rate;a.preservesPitch=true;a.webkitPreservesPitch=true;a.mozPreservesPitch=true}catch(e){}
    try{const pr=a.play();if(pr&&pr.catch)pr.catch(end)}catch(e){end()}
    return;
  }
  if(!hasTTS())return end();
  const u=new SpeechSynthesisUtterance(sayText(x)),g=x.voice==='M'?'M':'F';
  u.lang='en-US';const v=voiceFor(g)||P.vs[0];if(v)u.voice=v;
  u.pitch=g==='F'?1.2:0.8;u.rate=Math.max(.5,Math.min(2,.95*rate));u.onend=end;u.onerror=end;
  try{speechSynthesis.speak(u)}catch(e){end()}
}
function playSent(id){
  const x=byId(id);if(!x)return;stop();const tok=P.tok;P.on=true;P.cur=id;paintAudio();
  speakOnce(x,P.rate,tok,()=>{if(tok===P.tok){P.on=false;P.cur=null;paintAudio()}});
}
function follow(id,n){   // 跟讀：播放 → 靜音等待（句長×1.5）→ 再播，共 n 輪
  const x=byId(id);if(!x)return;stop();const tok=P.tok,rate=P.rate;
  const F=P.fr={n,round:1,phase:'play',left:0};P.on=true;P.cur=id;
  const round=()=>{
    if(tok!==P.tok)return;F.phase='play';paintAudio();const t0=Date.now();
    speakOnce(x,rate,tok,()=>{
      const wait=Math.max(1000,(Date.now()-t0)*1.5),endAt=Date.now()+wait;F.phase='wait';F.left=Math.ceil(wait/1000);paintAudio();
      P.w=setInterval(()=>{
        if(tok!==P.tok){clearInterval(P.w);P.w=null;return}
        const l=endAt-Date.now();
        if(l<=0){clearInterval(P.w);P.w=null;if(F.round<F.n){F.round++;round()}else{P.on=false;P.fr=null;P.cur=null;paintAudio()}}
        else{F.left=Math.ceil(l/1000);paintAudio()}
      },200);
    });
  };
  round();
}
function speakWord(w){   // 單字發音只用機器發音
  stop();if(!hasTTS())return;
  try{const u=new SpeechSynthesisUtterance(w);u.lang='en-US';u.rate=.9;const v=voiceFor('F')||P.vs[0];if(v)u.voice=v;speechSynthesis.speak(u)}catch(e){}
}
const togglePlay=id=>{if(P.on&&!P.fr&&P.cur===id)stop();else playSent(id)};
const toggleFollow=id=>{if(P.fr&&P.cur===id)stop();else follow(id,P.rounds)};
function setRate(v){P.rate=v;try{P.a.playbackRate=v}catch(e){}render()}
const setRounds=n=>{P.rounds=n;render()};
function paintAudio(){
  document.querySelectorAll('[data-play]').forEach(b=>{const o=P.on&&!P.fr&&P.cur===b.dataset.play;b.textContent=o?'⏹ 停止':(b.dataset.lbl||'▶ 播放整句')});
  document.querySelectorAll('[data-follow]').forEach(b=>{b.textContent=P.fr&&P.cur===b.dataset.follow?'⏹ 停止跟讀':'🔁 開始跟讀'});
  document.querySelectorAll('[data-sid]').forEach(e=>e.classList.toggle('active',P.on&&P.cur===e.dataset.sid));
  document.querySelectorAll('[data-fr]').forEach(e=>{const f=P.fr;e.textContent=f&&P.cur===e.dataset.fr?`第 ${f.round}/${f.n} 輪｜${f.phase==='play'?'播放中…':'換你跟讀 '+f.left+' 秒'}`:''});
}
window.addEventListener('pagehide',()=>{try{stop()}catch(e){}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});

/* ---------- 計時（只提示，不強制） ---------- */
const T={id:null};
function clrT(){if(T.id){clearInterval(T.id);T.id=null}}
function clockInfo(){
  const r=V.run;if(!r)return['',''];
  if(r.mode==='test'){const left=r.limit-Math.floor((Date.now()-r.t0)/1000),a=Math.abs(left),f=`${Math.floor(a/60)}:${String(a%60).padStart(2,'0')}`;
    return left<0?['時間到 +'+f+'（僅提示，可繼續作答）','text-rose-600 font-bold']:['剩餘 '+f,left<60?'text-amber-600 font-bold':'']}
  const x=r.items[r.i];if(!x||r.ans[x.id]!==undefined)return['',''];
  const s=Math.floor((Date.now()-r.cur)/1000);return[s+' 秒'+(s>WARN?'（已超過 30 秒，先猜後跳）':''),s>WARN?'text-rose-600 font-bold':s>20?'text-amber-600':'text-slate-500'];
}
function tickClock(){const e=document.getElementById('tm');if(!e||V.view!=='run')return;const[t,c]=clockInfo();e.textContent=t;e.className=c}
function startClock(){clrT();T.id=setInterval(tickClock,1000)}

/* ---------- 作答流程 ---------- */
function begin(mode,items){
  stop();clrT();
  const r={mode,items,i:0,deal:{},ans:{},secs:{},log:{},flag:{},t0:Date.now(),cur:Date.now(),limit:items.length*TESTSEC};
  if(mode==='test')items.forEach(x=>{r.deal[x.id]=deal(x)});   // 測驗：開始時一次抽好，整場固定
  V.run=r;V.view='run';render();startClock();scrollTo(0,0);
}
const one=id=>begin('practice',[byId(id)]);
const dealOf=(r,x)=>r.deal[x.id]||(r.deal[x.id]=deal(x));
function record(r,x,j,secs){
  const d=r.deal[x.id],k=j===undefined||j===null?-1:d.shown[j],ok=k===0,tp=k>0?x.distractors[k-1].trap:null;
  r.log[x.id]={k,j,ok,secs:Math.round(secs*10)/10,shown:d.shown.slice(),trap:tp};
  R.rec[x.id]={ok,t:Date.now()};if(ok)delete R.saved[x.id];else R.saved[x.id]=1;
  if(k>=0){const st=R.stat[x.id]||(R.stat[x.id]={shown:[],picked:[]});st.picked[k]=(st.picked[k]||0)+1}
  saveR();
}
function pick(j){
  const r=V.run,x=r.items[r.i];dealOf(r,x);
  if(r.mode==='practice'){if(r.ans[x.id]!==undefined)return;r.ans[x.id]=j;r.secs[x.id]=(Date.now()-r.cur)/1000;record(r,x,j,r.secs[x.id])}
  else r.ans[x.id]=j;
  const y=scrollY;render();scrollTo(0,y);
}
function leave(r){if(r.mode!=='test')return;const x=r.items[r.i];r.secs[x.id]=(r.secs[x.id]||0)+(Date.now()-r.cur)/1000;r.cur=Date.now()}
function goto(i){const r=V.run;stop();leave(r);r.i=i;r.cur=Date.now();render();scrollTo(0,0)}
function next(){const r=V.run;stop();if(r.i>=r.items.length-1)finish();else{r.i++;r.cur=Date.now();render();scrollTo(0,0)}}
const skip=()=>next();
function redo(){const r=V.run,x=r.items[r.i];stop();r.deal[x.id]=deal(x);delete r.ans[x.id];delete r.log[x.id];delete r.secs[x.id];r.cur=Date.now();render();scrollTo(0,0)}
function flag(){const r=V.run,id=r.items[r.i].id;r.flag[id]=!r.flag[id];const y=scrollY;render();scrollTo(0,y)}
function submit(){
  const r=V.run,un=r.items.filter(x=>r.ans[x.id]===undefined).length;
  if(un&&!confirm(`還有 ${un} 題沒作答（會算答錯），確定交卷？`))return;
  finish();
}
function finish(){
  const r=V.run;stop();clrT();leave(r);
  if(r.mode==='test')r.items.forEach(x=>record(r,x,r.ans[x.id],r.secs[x.id]||0));
  r.res=summarize(r);V.view='result';render();scrollTo(0,0);
}
function summarize(r){
  const items=r.mode==='test'?r.items:r.items.filter(x=>r.log[x.id]),L=x=>r.log[x.id];
  const c=items.filter(x=>L(x).ok).length,n=items.length,bp={},tp={},wr=items.filter(x=>!L(x).ok);
  items.forEach(x=>{const b=bp[x.point]=bp[x.point]||[0,0];b[1]++;if(L(x).ok)b[0]++;if(!L(x).ok&&L(x).trap)tp[L(x).trap]=(tp[L(x).trap]||0)+1});
  const ss=items.map(x=>L(x).secs||0),avg=n?ss.reduce((a,b)=>a+b,0)/n:0,over=ss.filter(s=>s>WARN).length;
  return{c,n,bp,tp,wr,avg:Math.round(avg*10)/10,over};
}
const go=v=>{stop();clrT();V.view=v;render();scrollTo(0,0)};

/* ---------- 畫面 ---------- */
const hdr=(t,back)=>`<div class="flex items-center gap-3 mb-4"><button onclick="${back}" class="${btn} ${line} !py-1.5">←</button><h1 class="text-lg font-bold">${esc(t)}</h1></div>`;
const blankH='<span class="inline-block align-baseline border-b-2 border-slate-500 dark:border-slate-400 mx-1" style="min-width:5.5rem">&nbsp;</span>';
const sentH=(x,fill)=>{const p=x.sentence.t.split(BLANK);return esc(p[0])+(fill?`<mark class="rounded px-1 bg-emerald-200 dark:bg-emerald-800 text-inherit">${esc(x.answer.t)}</mark>`:blankH)+esc(p[1])};
const ptChip=x=>`<span class="${chip}">${x.kind==='vocab'?'單字':'文法'}・${esc(ptName(x.point))}</span>`;
function bankH(x,d){
  const all=[0,...x.distractors.map((_,i)=>i+1)],st=R.stat[x.id];
  return `<details class="${card} p-3 mb-3"><summary class="cursor-pointer text-sm font-bold">看完整選項庫（${all.length} 個）</summary><div class="mt-2 space-y-1.5">${all.map(k=>{const o=optOf(x,k),was=d&&d.shown.includes(k);
    return `<div class="rounded-lg border px-3 py-1.5 text-sm ${o.ok?'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50':'border-slate-200 dark:border-slate-800'}"><b>${esc(o.t)}</b> <span class="text-xs text-slate-500">${esc(o.zh||'')} ${esc(o.pos||'')}</span>${d?`<span class="text-xs ml-1 ${was?'text-indigo-600 dark:text-indigo-400':'text-slate-400'}">${was?'本次出現':'本次沒抽到'}</span>`:''}${o.near?'<span class="text-xs ml-1 text-amber-600">near</span>':''}<span class="block text-xs ${o.ok?'text-emerald-600':'text-slate-500'}">${o.ok?'✓ 正解':esc(TR[o.trap]||o.trap||'')}：${esc(o.why)}</span></div>`}).join('')}</div></details>`;
}
function audioH(x){
  const rt=[0.75,1,1.25],has=AU.has(x.id);
  return `<div class="${card} p-3 mb-3"><p class="text-sm font-bold mb-1">🎧 整句音檔 <span class="text-xs font-normal text-slate-500">${has?'錄音檔':'機器發音'}</span></p>
  <p class="tsent px-2 py-1.5 text-base" data-sid="${esc(x.id)}" onclick="togglePlay('${esc(x.id)}')">${sentH(x,true)}</p><p class="text-xs text-slate-500 px-2 mb-2">${esc(x.sentence.zh||'')}</p>
  <div class="flex flex-wrap items-center gap-2 mb-2"><button data-play="${esc(x.id)}" onclick="togglePlay('${esc(x.id)}')" class="${btn} ${pri} !py-1.5">▶ 播放整句</button>${rt.map(v=>`<button onclick="setRate(${v})" class="${on(P.rate===v)}">${v}×</button>`).join('')}</div>
  <div class="flex flex-wrap items-center gap-2"><button data-follow="${esc(x.id)}" onclick="toggleFollow('${esc(x.id)}')" class="${btn} ${line} !py-1.5">🔁 開始跟讀</button><span class="text-xs text-slate-500">輪數</span>${[1,3,5].map(n=>`<button onclick="setRounds(${n})" class="${on(P.rounds===n)}">${n}</button>`).join('')}<span data-fr="${esc(x.id)}" class="text-sm text-indigo-600 dark:text-indigo-400"></span></div>
  ${!has&&!hasTTS()?'<p class="text-xs text-rose-600 mt-2">這個瀏覽器沒有機器發音，也還沒有音檔。</p>':''}</div>`;
}
function homeH(){
  const pool=poolOf(),ws=wrongItems(),nT=Math.min(10,pool.length),pts=Object.keys(PT).filter(k=>DATA.some(x=>x.point===k));
  const grp=g=>pts.filter(k=>PT[k][0]===g).map(k=>`<button onclick="setF('fp','${k}')" class="${on(V.fp===k)}">${esc(PT[k][1])}</button>`).join('');
  return `<div class="flex items-center justify-between mb-4"><div><a href="index.html" class="text-sm text-slate-500">← 首頁</a><h1 class="text-xl font-bold">Part 5 句子填空</h1></div><div class="flex gap-2"><button onclick="toggleDark()" class="${btn} ${line} !py-1.5">${S.dark?'☀':'☾'}</button><button onclick="go('admin')" class="${btn} ${line} !py-1.5">維護</button></div></div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="setF('fd','')" class="${on(!V.fd)}">全部主題</button>${Object.keys(DOM).map(k=>`<button onclick="setF('fd','${k}')" class="${on(V.fd===k)}">${k.toUpperCase()} ${esc(DOM[k])}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="setF('ft','')" class="${on(!V.ft)}">全部難度</button>${Object.keys(TIER).map(k=>`<button onclick="setF('ft','${k}')" class="${on(V.ft===k)}">${TIER[k]}</button>`).join('')}</div>
  <div class="flex flex-wrap items-center gap-2 mb-1"><button onclick="setF('fp','')" class="${on(!V.fp)}">全部考點</button><span class="text-xs text-slate-500">文法</span>${grp('grammar')}</div>
  <div class="flex flex-wrap items-center gap-2 mb-4"><span class="text-xs text-slate-500 ml-1">單字</span>${grp('vocab')}</div>
  <div class="grid grid-cols-2 gap-3 mb-3"><button ${pool.length?'':'disabled'} onclick="begin('practice',shuf(poolOf()))" class="${btn} ${pri}">練習（${pool.length} 題）</button><button ${pool.length?'':'disabled'} onclick="begin('test',shuf(poolOf()).slice(0,${nT}))" class="${btn} ${pri}">模擬測驗（${nT} 題）</button></div>
  ${pool.length>=30?`<button onclick="begin('test',shuf(poolOf()).slice(0,30))" class="${btn} ${pri} w-full mb-3">模擬測驗 完整版（30 題・約 11 分鐘）</button>`:''}
  ${ws.length?`<button onclick="begin('practice',shuf(wrongItems()))" class="${btn} ${line} w-full mb-4">錯題複習（${ws.length} 題）</button>`:'<div class="mb-4"></div>'}
  ${pool.length?pool.map(x=>{const r=R.rec[x.id];return `<button onclick="one('${esc(x.id)}')" class="${card} p-3 mb-2 w-full text-left flex items-center justify-between gap-2"><span class="min-w-0"><b class="text-sm">${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="flex flex-wrap gap-1 mt-1"><span class="${chip}">${TIER[tier(x)]}</span>${ptChip(x)}</span></span><span class="text-xs shrink-0 ${r?(r.ok?'text-emerald-600':'text-rose-600'):'text-slate-400'}">${r?(r.ok?'✓ 上次答對':'✗ 上次答錯'):'尚未作答'}</span></button>`}).join(''):`<div class="${card} p-8 text-center text-sm text-slate-500">沒有符合的題目（題庫共 ${DATA.length} 題）。</div>`}`;
}
const setF=(k,v)=>{V[k]=v;render()};
function optsPre(x,d,a,pr){
  return d.shown.map((k,j)=>{const o=optOf(x,k),sel=!pr&&a===j;
    return `<button onclick="pick(${j})" class="w-full text-left rounded-lg px-3 py-3 text-sm mb-2 ${sel?'border border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50':line}"><b>${'ABCD'[j]}.</b> ${esc(o.t)}</button>`}).join('');
}
function optsPost(x,d,a){
  return d.shown.map((k,j)=>{const o=optOf(x,k),mine=j===a;
    const cls=o.ok?'border border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50':mine?'border border-rose-500 bg-rose-50 dark:bg-rose-950/50':line;
    const lab=o.ok?'✓ 正解':(mine?'你選的・':'')+(TR[o.trap]||'');
    return `<div class="rounded-lg px-3 py-2.5 text-sm mb-2 ${cls}"><b>${'ABCD'[j]}.</b> ${esc(o.t)} <span class="text-xs text-slate-500">${esc(o.zh||'')} ${esc(o.pos||'')}</span><span class="block text-xs mt-1 ${o.ok?'text-emerald-600':mine?'text-rose-600':'text-slate-500'}">${esc(lab)}：${esc(o.why)}</span></div>`}).join('');
}
function explainH(x,d){
  const cl=x.clue;
  return `<div class="${card} p-4 mb-3"><p class="text-sm font-bold mb-1">解析</p><p class="text-sm">${esc(x.sentence.zh||'')}</p>
  ${cl?`<p class="text-xs text-slate-500 mt-2">線索：<b>${esc(cl.text||'')}</b></p><ol class="text-sm list-decimal pl-5 mt-1">${(cl.steps||[]).map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:''}
  ${(x.vocab||[]).length?`<div class="flex flex-wrap gap-2 mt-3">${x.vocab.map(v=>`<button data-w="${esc(v.word)}" onclick="speakWord(this.dataset.w)" class="${btn} ${line} !py-1.5 text-left">🔊 <b>${esc(v.word)}</b> <span class="text-xs text-slate-500">${esc(v.ipa||'')} ${esc(v.pos||'')}</span><span class="block text-xs text-slate-500">${esc(v.zh||'')}・${esc(v.col||'')}</span></button>`).join('')}</div>`:''}</div>`;
}
function runH(){
  const r=V.run,x=r.items[r.i],pr=r.mode==='practice',d=dealOf(r,x),a=r.ans[x.id],done=a!==undefined,last=r.i===r.items.length-1,[ct,cc]=clockInfo();
  const top=`<div class="flex items-center justify-between mb-3"><button onclick="if(confirm('離開本次作答？'))go('home')" class="${btn} ${line} !py-1.5">✕ 離開</button><span class="text-sm text-slate-500">${pr?'練習':'測驗'} ${r.i+1}/${r.items.length} ・ ${TIER[tier(x)]} ・ ${esc(ptName(x.point))}</span></div>`;
  const clk=`<div class="${card} p-3 mb-3 flex items-center justify-between gap-2"><span id="tm" class="text-sm ${cc}">${esc(ct)}</span><span class="text-xs text-slate-500">${pr?'建議 '+SUG[tier(x)]:'共 '+Math.round(r.limit/60*10)/10+' 分鐘'}</span></div>`;
  const q=`<div class="${card} p-5 mb-3"><p class="text-lg leading-relaxed">${sentH(x,pr&&done)}</p></div>`;
  if(!pr){
    const n=r.items.length;
    const grid=`<div class="${card} p-3 mb-3"><div class="flex flex-wrap gap-1.5">${r.items.map((y,i)=>{const c=i===r.i?'bg-indigo-600 text-white':r.ans[y.id]!==undefined?'bg-indigo-100 dark:bg-indigo-900/50':'bg-slate-100 dark:bg-slate-800';return `<button onclick="goto(${i})" aria-label="第 ${i+1} 題" class="w-9 h-9 rounded-lg text-sm ${c} ${r.flag[y.id]?'ring-2 ring-amber-500':''}">${i+1}</button>`}).join('')}</div><p class="text-xs text-slate-500 mt-2">藍色＝已作答；琥珀色外框＝待檢查</p></div>`;
    return `${top}${clk}${grid}${q}${optsPre(x,d,a,false)}
    <div class="grid grid-cols-3 gap-2 mt-3"><button ${r.i===0?'disabled':''} onclick="goto(${r.i-1})" class="${btn} ${line}">← 上一題</button><button onclick="flag()" class="${btn} ${line}">${r.flag[x.id]?'⚑ 取消標記':'⚐ 待檢查'}</button><button ${last?'disabled':''} onclick="goto(${r.i+1})" class="${btn} ${line}">下一題 →</button></div>
    <button onclick="submit()" class="${btn} ${pri} w-full mt-3">交卷（已答 ${r.items.filter(y=>r.ans[y.id]!==undefined).length}/${n}）</button>`;
  }
  if(!done)return `${top}${clk}${q}<div class="flex flex-wrap items-center gap-2 mb-3"><button data-play="${esc(x.id)}" onclick="togglePlay('${esc(x.id)}')" class="${btn} ${line} !py-1.5">▶ 播放整句</button>${[0.75,1,1.25].map(v=>`<button onclick="setRate(${v})" class="${on(P.rate===v)}">${v}×</button>`).join('')}<span class="text-xs text-slate-500">${AU.has(x.id)?'錄音檔':'機器發音'}（會念出答案）</span></div>${optsPre(x,d,a,true)}<button onclick="skip()" class="${btn} ${line} w-full mt-2">${last?'跳過並結束':'跳過這題'}</button>`;
  const lg=r.log[x.id],ok=lg&&lg.ok;
  return `${top}${q}<div class="${card} p-3 mb-3 flex items-center justify-between"><b class="${ok?'text-emerald-600':'text-rose-600'}">${ok?'✓ 答對了':'✗ 答錯了'}</b><span class="text-xs ${lg&&lg.secs>WARN?'text-rose-600':'text-slate-500'}">用時 ${lg?lg.secs:0} 秒${lg&&lg.secs>WARN?'（超過 30 秒）':''}</span></div>
  ${optsPost(x,d,a)}${explainH(x,d)}${bankH(x,d)}${audioH(x)}
  <div class="grid grid-cols-2 gap-3"><button onclick="redo()" class="${btn} ${line}">再做一次</button><button onclick="next()" class="${btn} ${pri}">${last?'結束':'下一題 →'}</button></div>`;
}
function reviewH(x,r){
  const L=r.log[x.id],d=r.deal[x.id],my=L&&L.k>=0?optOf(x,L.k):null;
  return `<details class="${card} p-3 mb-2"><summary class="cursor-pointer text-sm"><b>${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(ptName(x.point))}</span><span class="block mt-1">${sentH(x,true)}</span></summary>
  <p class="text-sm text-rose-600 mt-2">你選：${my?esc(my.t)+(my.trap?'（'+esc(TR[my.trap]||'')+'）':''):'（未作答）'}</p>${my?`<p class="text-xs text-slate-500">${esc(my.why)}</p>`:''}
  <p class="text-sm text-emerald-600 mt-1">正解：${esc(x.answer.t)}</p><p class="text-xs text-slate-500">${esc(x.answer.why)}</p>
  <div class="mt-2">${bankH(x,d)}${audioH(x)}</div></details>`;
}
function resultH(){
  const r=V.run,{c,n,bp,tp,wr,avg,over}=r.res,pr=r.mode==='practice';
  const row=(a,b)=>`<div class="flex justify-between text-sm py-1 border-b border-slate-100 dark:border-slate-800"><span>${a}</span><span>${b}</span></div>`;
  if(!n)return hdr('練習結果',"go('home')")+`<div class="${card} p-6 text-center text-sm">這次沒有作答任何題目。</div><button onclick="go('home')" class="${btn} ${pri} w-full mt-3">回到首頁</button>`;
  return hdr(pr?'練習結果':'測驗結果',"go('home')")+`<div class="${card} p-5 mb-3 text-center"><div class="text-4xl font-bold">${c}/${n}</div><div class="text-sm text-slate-500">答對率 ${Math.round(c/n*100)}%</div></div>
  <div class="${card} p-4 mb-3">${row('平均每題用時',avg+' 秒')}${row('超過 30 秒的題數',over+' 題')}${!pr?row('總用時',Math.round((Date.now()-r.t0)/1000)+' 秒（時限 '+r.limit+' 秒）'):''}</div>
  <div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">各考點正確率</p>${Object.keys(bp).map(k=>row(esc(ptName(k)),bp[k][0]+'/'+bp[k][1]+'（'+Math.round(bp[k][0]/bp[k][1]*100)+'%）')).join('')}</div>
  ${Object.keys(tp).length?`<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">你最常中的陷阱</p>${Object.keys(tp).sort((a,b)=>tp[b]-tp[a]).map(k=>row(esc(TR[k]||k),tp[k]+' 次')).join('')}</div>`:''}
  ${wr.length?`<p class="font-bold text-sm mb-2">答錯的題目（已加入錯題複習）</p>`+wr.map(x=>reviewH(x,r)).join(''):`<div class="${card} p-4 text-sm text-center">全部答對 🎉</div>`}
  <button onclick="go('home')" class="${btn} ${pri} w-full mt-3">回到首頁</button>`;
}

/* ---------- 維護：矩陣＋考點統計＋AI 出題指令＋音檔管理 ---------- */
const serial=(d,t)=>{let mx=0;DATA.forEach(x=>{const m=/^d(\d)-(\d+)-([emh])$/.exec(x.id);if(m&&'d'+m[1]===d&&m[3]===TS[t])mx=Math.max(mx,+m[2])});return mx};
const SC={easy:[500,550],medium:[600,650],hard:[700,800]},cefr=s=>s<=550?'A2+':s===600?'B1':s===650?'B1+':s<=750?'B2':'B2+';
const RULES=['一題一空，只有一個正解。任一干擾項放進空格都必須明確錯誤，原因寫在 why；任何 3 個干擾項與正解的組合都要是合格考題，不能有兩個選項同時成立。','11 個干擾項要有層次：至少 3 個 near:true；wordform 題優先用同字根（fam:"root"）的各種變化，至少 4 個 root，不夠再用形似字；單字題 11 個必須詞性相同，意思與句子不符或搭配不自然；conj 題要混合連接詞與介系詞。','文法題不依賴詞彙語意，看空格前後 3–5 字的結構就能判斷；單字題要讀懂語意或知道搭配才能答，盡量用商務情境。','句子是自然的商務英文，不過度生僻，除人名外不出現專有名詞；zh 要通順。','同一批題目不要重複句型或單字；tag、vocab.word、句子首句不得與已有題目重複。','考點比例照規格的 share；本批若指定考點，就只出該考點。','不確定的題目放進 issues，不要硬湊。無法達到 11 個合格干擾項時，回傳 {"skip":"原因"} 而不是勉強湊數。','輸出單一合法 JSON 陣列（UTF-8、不加程式碼區塊標記）。'];
function ptCount(){const c={};Object.keys(PT).forEach(k=>c[k]=0);DATA.forEach(x=>{c[x.point]=(c[x.point]||0)+1});return c}
function promptText(){
  const {d,t,pts,n}=A,mx=serial(d,t),ids=Array.from({length:n},(_,i)=>d+'-'+String(mx+1+i).padStart(3,'0')+'-'+TS[t]),sp=SPEC||{},cnt=ptCount();
  const rules=sp.rules&&typeof sp.rules==='object'?Object.values(sp.rules):RULES;
  const lite=JSON.stringify({domain:{[d]:sp.domains&&sp.domains[d]},tier:{[t]:sp.tiers&&sp.tiers[t]},points:sp.points,traps:sp.traps,biz:sp.biz,entry_schema:sp.entry_schema});
  const ptLine=pts.length?`- 考點：只出 ${pts.map(k=>k+'（'+ptName(k)+'）').join('、')}；這些考點目前題數：${pts.map(k=>k+'×'+cnt[k]).join('、')}。`:`- 考點：不限。各考點現有題數（建議占比）：${Object.keys(PT).map(k=>k+'×'+cnt[k]+'（'+PT[k][2].join('–')+'%）').join('、')}。請優先補數量最少、離建議占比最遠的考點。`;
  return [`請為多益 Part 5 句子填空寫 ${n} 題（每題一個句子、一個空格、1 個正解＋11 個干擾項），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part5.json。`,'',
  `- 主題：${d.toUpperCase()} ${DOM[d]}（scene 須屬於：${((sp.domains&&sp.domains[d]&&sp.domains[d].scenes)||[]).join('、')}）；句子要是商務情境，可選填 biz（hr／marketing／finance／manufacturing／it／general）。`,
  `- 難度：${TIER[t]}（id 尾碼 ${TS[t]}）｜level.score 只能填：${SC[t].map(s=>s+'（cefr 填 '+cefr(s)+'）').join('、')}${sp.tiers&&sp.tiers[t]?'｜'+sp.tiers[t].guide:''}`,
  ptLine,
  `- id 依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）；voice 填 F 或 M（音檔性別）。`,
  '- 每題 distractors 剛好 11 個，每個含 t、zh、pos、trap、near、fam、why；選項順序網頁會每次重新抽選，不要在意順序。',
  '- clue.steps 依四步驟解題法各寫一句：掃描選項判斷題型 → 分析空格前後線索 → 刪去法 → 代入驗證。',
  '',...rules.map(s=>'- '+s),'',
  `- 已用過的 vocab（不得重複）：${[...new Set(DATA.flatMap(x=>(x.vocab||[]).map(v=>v.word)))].join('、')||'（無）'}`,
  `- 已用過的 tag（不得重複）：${DATA.map(x=>x.tag).join('；')||'（無）'}`,
  `- 已有的句子首句（不要雷同）：${DATA.map(x=>x.sentence.t).join('；')||'（無）'}`,
  `- 輸出方式：建立檔案 p5_${ids[0]}_x${n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。`,
  '','【規格：part5.json 的 _spec 精簡版】',lite].join('\n');
}
function adminH(){
  const ds=Object.keys(DOM),tx=promptText(),cnt=ptCount(),tot=DATA.length;window._out=tx;
  const cell=(d,t)=>{const xs=DATA.filter(x=>x.domain===d&&tier(x)===t);return `<td class="text-center"><button onclick="openCell('${d}','${t}')" class="underline px-1">${xs.length} · 🎧${xs.filter(x=>AU.has(x.id)).length}</button></td>`};
  return hdr('維護',"go('home')")+`<div class="${card} p-3 mb-2 overflow-x-auto"><table class="text-sm w-full"><tr><th class="text-left">主題</th>${Object.keys(TIER).map(t=>`<th>${TIER[t]}</th>`).join('')}</tr>${ds.map(d=>`<tr class="border-t border-slate-100 dark:border-slate-800"><td class="py-1">${d.toUpperCase()} ${esc(DOM[d])}</td>${Object.keys(TIER).map(t=>cell(d,t)).join('')}</tr>`).join('')}</table><p class="text-xs text-slate-500 mt-1">格內：題數 · 🎧音檔完整數</p></div>
  <div class="${card} p-3 mb-4"><p class="text-sm font-bold mb-1">各考點題數（共 ${tot} 題）</p><div class="flex flex-wrap gap-1.5">${Object.keys(PT).map(k=>{const p=tot?cnt[k]/tot*100:0,low=tot&&p<PT[k][2][0];return `<span class="${chip} ${low?'!bg-amber-100 dark:!bg-amber-900/40 !text-amber-800 dark:!text-amber-200':''}">${esc(PT[k][1])} ${cnt[k]}${low?' ⚠偏少':''}<span class="opacity-60"> 建議 ${PT[k][2][0]===PT[k][2][1]?PT[k][2][0]:PT[k][2].join('–')}%</span></span>`}).join('')}</div></div>
  <h2 class="font-bold mb-2">新增題目</h2><div class="flex flex-wrap gap-2 mb-2">${ds.map(d=>`<button onclick="ap('d','${d}')" class="${on(A.d===d)}">${d.toUpperCase()}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2">${Object.keys(TIER).map(t=>`<button onclick="ap('t','${t}')" class="${on(A.t===t)}">${TIER[t]}</button>`).join('')}${[1,2,3,5,10].map(k=>`<button onclick="ap('n',${k})" class="${on(A.n===k)}">${k} 題</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="ap('pts',[])" class="${on(!A.pts.length)}">考點：不限</button>${Object.keys(PT).map(k=>`<button onclick="togglePt('${k}')" class="${on(A.pts.includes(k))}">${esc(PT[k][1])}</button>`).join('')}</div>
  <div class="${card} p-4"><div class="flex items-center justify-between mb-2"><p class="font-bold text-sm">給 AI 的「寫題目」指令（約 ${tx.length.toLocaleString()} 字）</p><button id="cp" onclick="copyOut()" class="${btn} ${line} !py-1 text-xs">複製</button></div><pre class="text-xs whitespace-pre-wrap break-words rounded-lg bg-slate-100 dark:bg-slate-800 p-3 max-h-72 overflow-auto">${esc(tx)}</pre><p class="text-xs text-slate-500 mt-2">AI 回傳的檔案（p5_ 開頭）放到 json_merge.py 同資料夾，選「Part 5 填空」合併；合併後到上方矩陣點該格，展開題目即可複製檔名與句子。音檔放 audio/p5/（{id}.mp3，一題一檔）後執行 audio_scan.py。</p></div>`;
}
const togglePt=k=>{A.pts=A.pts.includes(k)?A.pts.filter(v=>v!==k):[...A.pts,k];render()};
const auName=x=>x.id+'.mp3';
const copySent=id=>clip(filled(byId(id)),'cs-'+id);
const copyName=id=>clip(auName(byId(id)),'cn-'+id);
function copyMiss(d,t){const xs=DATA.filter(x=>x.domain===d&&tier(x)===t&&!AU.has(x.id));clip(xs.map(x=>auName(x)+' | '+sayText(x)+' | '+(x.voice==='M'?'M':'F')).join('\n'),'cm')}
function auPanelH(x){
  const has=AU.has(x.id);
  return `<div class="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3"><p class="text-sm font-bold mb-1">🎧 音檔 <span class="text-xs ${has?'text-emerald-600':'text-slate-400'}">${has?'✓ 有':'✗ 缺'}</span></p>
  <div class="flex flex-wrap items-center gap-2"><span class="font-mono text-xs ${has?'text-emerald-600':'text-rose-600'}">${has?'✓':'✗'} ${esc(auName(x))}</span><button data-play="${esc(x.id)}" data-lbl="試聽" onclick="togglePlay('${esc(x.id)}')" class="${btn} ${line} !py-1 text-xs">試聽</button><button id="cn-${esc(x.id)}" onclick="copyName('${esc(x.id)}')" class="${btn} ${line} !py-1 text-xs">複製檔名</button><button id="cs-${esc(x.id)}" onclick="copySent('${esc(x.id)}')" class="${btn} ${line} !py-1 text-xs">複製句子</button><span class="text-xs text-slate-500">${x.voice==='M'?'男聲':'女聲'}</span></div>
  <p class="text-xs text-slate-500 mt-1">${esc(sayText(x))}</p></div>`;
}
function statH(x){
  const st=R.stat[x.id],D=x.distractors;if(!st)return `<p class="text-xs text-slate-500 mt-3">選項曝光統計：這台裝置還沒有作答紀錄。</p>`;
  const all=[0,...D.map((_,i)=>i+1)],sh=k=>st.shown[k]||0,pk=k=>st.picked[k]||0;
  const nn=all.filter(k=>k>0&&!D[k-1].near),mean=nn.length?nn.reduce((a,k)=>a+sh(k),0)/nn.length:0,total=sh(0);
  return `<div class="mt-3"><p class="text-xs font-bold">選項曝光統計（本機，共出現 ${total} 次；非 near 干擾項平均 ${Math.round(mean*10)/10} 次，低於 70% 會標紅）</p><div class="overflow-x-auto"><table class="text-xs w-full mt-1"><tr class="text-left text-slate-500"><th>選項</th><th class="text-right">出現</th><th class="text-right">被選</th></tr>${all.map(k=>{const o=optOf(x,k),low=k>0&&!o.near&&mean>0&&sh(k)<mean*0.7;return `<tr class="border-t border-slate-100 dark:border-slate-800 ${low?'text-rose-600':''}"><td>${esc(o.t)}${o.ok?' ✓':''}${o.near?' <span class="text-amber-600">near</span>':''}</td><td class="text-right">${sh(k)}</td><td class="text-right">${pk(k)}</td></tr>`}).join('')}</table></div></div>`;
}
const openCell=(d,t)=>{A.cd=d;A.ct=t;go('adminCell')};
function adminCellH(){
  const d=A.cd,t=A.ct,xs=DATA.filter(x=>x.domain===d&&tier(x)===t).sort((a,b)=>a.id.localeCompare(b.id)),nm=d.toUpperCase()+' '+DOM[d]+' ・ '+TIER[t],miss=xs.filter(x=>!AU.has(x.id)).length;
  return hdr(nm,"go('admin')")+`<div class="grid grid-cols-2 gap-2 mb-4"><button onclick="A.d='${d}';A.t='${t}';go('admin')" class="${btn} ${pri}">＋ 新增題目</button><button id="cm" ${miss?'':'disabled'} onclick="copyMiss('${d}','${t}')" class="${btn} ${line}">複製本格缺的清單（${miss}）</button></div>`+(xs.length?xs.map(x=>`<details class="${card} p-3 mb-3"><summary class="cursor-pointer"><b class="text-sm">${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="flex flex-wrap gap-1 mt-1">${ptChip(x)}<span class="${chip} ${AU.has(x.id)?'text-emerald-600':'text-slate-400'}">${AU.has(x.id)?'✓ 有音檔':'✗ 缺音檔'}</span></span></summary>
    <p class="text-sm mt-3">${sentH(x,false)}</p><p class="text-xs text-slate-500">${esc(x.sentence.zh||'')}</p>
    <p class="text-sm mt-2 text-emerald-600"><b>${esc(x.answer.t)}</b> <span class="text-xs">${esc(x.answer.zh||'')} ${esc(x.answer.pos||'')}</span><span class="block text-xs">${esc(x.answer.why)}</span></p>
    <div class="mt-2 space-y-1">${x.distractors.map(o=>`<div class="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-sm"><b>${esc(o.t)}</b> <span class="text-xs text-slate-500">${esc(o.zh||'')} ${esc(o.pos||'')}</span><span class="block text-xs text-slate-500">${esc(TR[o.trap]||o.trap||'')}${o.near?'・<span class="text-amber-600">near</span>':''}${o.fam==='root'?'・root':''}：${esc(o.why)}</span></div>`).join('')}</div>
    ${statH(x)}${auPanelH(x)}</details>`).join(''):`<div class="${card} p-8 text-center text-sm text-slate-500">目前沒有題目（0 題）。</div>`);
}
const ap=(k,v)=>{A[k]=v;render()};
function copyOut(){clip(window._out||'','cp')}
function clip(t,bid){const d=()=>{const b=document.getElementById(bid);if(b){b.dataset.l=b.dataset.l||b.textContent;b.textContent='已複製 ✓';setTimeout(()=>{if(b.isConnected)b.textContent=b.dataset.l||'複製'},1500)}};
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();d()};
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(d,fb);else fb()}
function toggleDark(){S.dark=!S.dark;try{const c=JSON.parse(localStorage.getItem(KEY)||'{}')||{};c.dark=S.dark;localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}render()}
function render(){
  document.documentElement.classList.toggle('dark',!!S.dark);
  const v=V.view;main.innerHTML=v==='run'?runH():v==='result'?resultH():v==='admin'?adminH():v==='adminCell'?adminCellH():homeH();
  if(v==='run'&&!T.id)startClock();else if(v!=='run')clrT();
  paintAudio();
}

/* ---------- 啟動 ---------- */
function loadText(t){
  try{const j=JSON.parse(t);SPEC=(j&&j._spec)||null;const d=SPEC&&SPEC.domains;
    if(d)Object.keys(d).forEach(k=>{if(d[k]&&d[k].name)DOM[k]=d[k].name});
    DATA=(Array.isArray(j)?j:(j&&j.items)||[]).filter(okItem);render();
  }catch(e){alert('part5.json 格式有誤：'+e.message)}
}
function pickJson(i){const f=i.files[0];if(!f)return;const r=new FileReader();r.onload=()=>loadText(r.result);r.readAsText(f,'utf-8')}
async function boot(){
  await auLoad();
  try{const res=await fetch('part5.json',{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);loadText(await res.text())}
  catch(e){main.innerHTML=`<div class="${card} p-8 text-center"><h3 class="text-lg font-bold mb-2">請選取 part5.json</h3><p class="text-sm text-slate-500 mb-4">直接雙擊開啟時瀏覽器不允許自動讀取；上傳到 GitHub Pages 或用本機伺服器則會自動載入。</p><label class="${btn} inline-block ${pri}">選取 part5.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label></div>`}
}
boot();
