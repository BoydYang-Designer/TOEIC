/* Part 6 段落填空（階段 1–3：練習、模擬測驗、結果頁、維護頁）。骨架取自 part5.js；規格見 part6_設計指引.md
   記錄存在 toeicPart6V1（rec／saved／rot／stat，key＝題目id#空格編號），KEY 只讀寫 dark。
   音訊：audio/index.json 的 p6.complete 有此題 → 播 audio/p6/{id}.mp3；否則用瀏覽器 TTS。 */
const KEY='toeicCoachV2',PK='toeicPart6V1';
let S={};try{S=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch(e){}
let R={rec:{},saved:{},rot:{},stat:{}};try{R=Object.assign(R,JSON.parse(localStorage.getItem(PK)||'{}'))}catch(e){}
['rec','saved','rot','stat'].forEach(k=>{if(!R[k]||typeof R[k]!=='object'||Array.isArray(R[k]))R[k]={}});
const saveR=()=>{try{localStorage.setItem(PK,JSON.stringify(R))}catch(e){}};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shuf=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const pick1=a=>a[Math.floor(Math.random()*a.length)];
const card='rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900',btn='rounded-lg px-4 py-2.5 text-sm font-medium transition cursor-pointer',line='border border-slate-300 dark:border-slate-700',pri='bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed',chip='text-xs rounded-full px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
const main=document.getElementById('main');
const on=c=>`${btn} !py-1.5 ${c?'bg-indigo-600 text-white':'bg-slate-100 dark:bg-slate-800'}`;
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
async function auLoad(){try{const j=await(await fetch('audio/index.json',{cache:'no-store'})).json();((j.p6&&j.p6.complete)||[]).forEach(i=>AU.add(i))}catch(e){}}
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
    const a=P.a;a.onended=end;a.onerror=end;a.src='audio/p6/'+x.id+'.mp3';
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
function toggleDark(){S.dark=!S.dark;try{const c=JSON.parse(localStorage.getItem(KEY)||'{}')||{};c.dark=S.dark;localStorage.setItem(KEY,JSON.stringify(c))}catch(e){}render()}
/* ===== 階段 2：模擬測驗、結果頁、錯題複習、完整篩選、選項庫、線索高亮 ===== */
let DATA=[],SPEC=null,LERR='',LMSG='',V={view:'home',mode:'practice',fd:'',ft:'',fc:'',fk:'',fp:'',list:[],i:0,r:null,t:null};
const TIER={easy:'初級',medium:'中級',hard:'高級'},KD={grammar:'文法',vocab:'詞彙',transition:'轉折詞',insert:'句子插入'},SC={local:'線索在空格附近',near:'線索在前後句',far:'線索在標頭或跨段'},SCN={local:'空格附近',near:'前後句',far:'標頭／跨段'},SUG={easy:100,medium:120,hard:140};
const tier=x=>(x.level&&x.level.tier)||'medium',byId=id=>DATA.find(x=>x.id===id),qk=(x,q)=>x.id+'#'+q.n,sug=x=>SUG[tier(x)]||120;
const qi=(x,q)=>({id:qk(x,q),point:q.point,answer:q.answer,distractors:q.distractors});   // 讓 deal()／optOf() 把「一個空格」當成一題
const sayText=x=>x.say||[x.head.join('. ')+'.',...x.body.map(p=>p.replace(/\[\[(\d)\]\]/g,(_,n)=>x.questions.find(q=>q.n===+n).answer.t))].join(' ');
const trn=k=>(SPEC&&SPEC.traps&&SPEC.traps[k])||k||'';
const pName=p=>(SPEC&&SPEC.points&&SPEC.points[p]&&SPEC.points[p].name)||p;
const docN=d=>(SPEC&&SPEC.docs&&SPEC.docs[d])||d||'';
const PA='px-2 mx-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold';
const qOk=q=>(!V.fk||q.kind===V.fk)&&(!V.fp||q.point===V.fp);
const poolOf=()=>DATA.filter(x=>(!V.fd||x.domain===V.fd)&&(!V.ft||tier(x)===V.ft)&&(!V.fc||x.doc===V.fc)&&x.questions.some(qOk));
const wrongItems=()=>DATA.filter(x=>x.questions.some(q=>R.saved[qk(x,q)]));
const setF=(k,v)=>{V[k]=v;render()},setK=k=>{V.fk=V.fk===k?'':k;V.fp='';render()};
const go=v=>{stop();clrT();V.view=v;render();scrollTo(0,0)};
const hdr=(t,back)=>`<div class="flex items-center gap-3 mb-4"><button onclick="${back}" class="${btn} ${line} !py-1.5">←</button><h1 class="text-lg font-bold">${esc(t)}</h1></div>`;

/* ---------- 計時（只提示，不強制） ---------- */
const T={id:null};
const clrT=()=>{if(T.id){clearInterval(T.id);T.id=null}};
function clockInfo(){const t=V.t;if(!t)return['',''];
  const left=t.limit-Math.floor((Date.now()-t.t0)/1000),a=Math.abs(left),f=Math.floor(a/60)+':'+String(a%60).padStart(2,'0');
  return left<0?['時間到 +'+f+'（僅提示，可繼續作答）','text-rose-600 font-bold']:['剩餘 '+f,left<60?'text-amber-600 font-bold':''];}
function tickClock(){const e=document.getElementById('tm');if(!e||V.view!=='test')return;const[t,c]=clockInfo();e.textContent=t;e.className='text-sm '+c}
const startClock=()=>{clrT();T.id=setInterval(tickClock,1000)};

/* ---------- 文章顯示：標頭＋段落；pill(n) 決定空格怎麼畫；clues 是要高亮的線索原文 ---------- */
function fmt(raw,clues,pill){
  const iv=[];(clues||[]).forEach(c=>{if(!c)return;const a=raw.indexOf(c);if(a<0)return;const b=a+c.length;if(iv.every(v=>b<=v[0]||a>=v[1]))iv.push([a,b])});
  iv.sort((p,q)=>p[0]-q[0]);let s='',p=0;
  iv.forEach(([a,b])=>{s+=raw.slice(p,a)+'\u0001'+raw.slice(a,b)+'\u0002';p=b});s+=raw.slice(p);
  return esc(s).replace(/\[\[(\d)\]\]/g,(_,n)=>pill(+n)).replace(/\u0001/g,'<mark class="rounded px-0.5 bg-amber-200/70 dark:bg-amber-500/30 text-inherit">').replace(/\u0002/g,'</mark>');
}
const passH=(x,pill,clues)=>`<div class="${card} p-5 mb-3">${x.head.length?`<div class="text-xs text-slate-500 mb-2">${x.head.map(h=>`<div>${fmt(h,clues,pill)}</div>`).join('')}</div>`:''}${x.body.map(p=>`<p class="leading-relaxed mb-2">${fmt(p,clues,pill)}</p>`).join('')}</div>`;
const audioBar=x=>`<div class="${card} p-3 mb-3 flex flex-wrap items-center gap-2"><button data-play="${esc(x.id)}" data-lbl="▶ 播放整篇" onclick="togglePlay('${esc(x.id)}')" class="${btn} ${pri} !py-1.5">▶ 播放整篇</button>${[0.75,1,1.25].map(v=>`<button onclick="setRate(${v})" class="${on(P.rate===v)}">${v}×</button>`).join('')}<span class="text-xs text-slate-500">${AU.has(x.id)?'錄音檔':'機器發音'}（會念出答案）</span>${!AU.has(x.id)&&!hasTTS()?'<span class="text-xs text-rose-600">這個瀏覽器沒有機器發音，也還沒有音檔。</span>':''}</div>`;
const hintH=()=>`<details class="${card} p-3 mb-3"><summary class="cursor-pointer text-sm font-bold">解題流程提示</summary><ol class="text-sm list-decimal pl-5 mt-2 text-slate-600 dark:text-slate-300 space-y-1"><li>先快速掃讀 30–45 秒，抓文章類型與語氣。</li><li>先做文法與詞彙題，句子插入留到最後。</li><li>聚焦空格前後 2–3 個詞找線索；時態、代名詞、轉折詞要回頭看標頭與前後句。</li><li>用刪去法，再把答案代回整句、整段檢查。</li></ol></details>`;

/* ---------- 選項庫：看全部選項（含本次出現與否、near、trap、累計出現次數） ---------- */
function bankH(x,q,d){
  const all=[0,...q.distractors.map((_,i)=>i+1)],st=R.stat[qk(x,q)],y=qi(x,q);
  return `<details class="mt-2"><summary class="cursor-pointer text-xs font-bold text-indigo-600 dark:text-indigo-400">看完整選項庫（${all.length} 個）</summary><div class="mt-2 space-y-1.5">${all.map(k=>{const o=optOf(y,k),was=d&&d.shown.includes(k);
    return `<div class="rounded-lg border px-3 py-1.5 text-sm ${o.ok?'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50':'border-slate-200 dark:border-slate-800'}"><b>${esc(o.t)}</b> <span class="text-xs text-slate-500">${esc(o.zh||'')} ${esc(o.pos||'')}</span>${d?`<span class="text-xs ml-1 ${was?'text-indigo-600 dark:text-indigo-400':'text-slate-400'}">${was?'本次出現':'本次沒抽到'}</span>`:''}${o.near?'<span class="text-xs ml-1 text-amber-600">near</span>':''}${st?`<span class="text-xs ml-1 text-slate-400">累計出現 ${st.shown[k]||0} 次</span>`:''}<span class="block text-xs ${o.ok?'text-emerald-600':'text-slate-500'}">${o.ok?'✓ 正解':esc(trn(o.trap))}：${esc(o.why)}</span></div>`}).join('')}</div></details>`;
}
const vocabH=x=>`<div class="flex flex-wrap gap-2">${(x.vocab||[]).map(v=>`<button data-w="${esc(v.word)}" onclick="speakWord(this.dataset.w)" class="${btn} ${line} !py-1.5 text-left">🔊 <b>${esc(v.word)}</b> <span class="text-xs text-slate-500">${esc(v.ipa||'')} ${esc(v.pos||'')}</span><span class="block text-xs text-slate-500">${esc(v.zh||'')}・${esc(v.col||'')}</span></button>`).join('')}</div>`;
const zhH=x=>`<details class="mb-3"><summary class="cursor-pointer text-sm font-bold">全文中文翻譯</summary>${x.zh.map(p=>`<p class="text-sm mt-1">${esc(p)}</p>`).join('')}</details>`;
const chips=q=>`<span class="${chip}">${KD[q.kind]||q.kind}・${esc(pName(q.point))}</span> <span class="${chip}">${esc(SCN[q.scope]||'')}</span>`;

/* ---------- 練習／錯題複習（一篇一畫面） ---------- */
function begin(l,mode){V.mode=mode||'practice';V.list=l;V.i=0;start()}
const beginReview=()=>begin(shuf(wrongItems()),'review');
function start(){stop();const x=V.list[V.i],rev={};
  if(V.mode==='review')x.questions.forEach(q=>{if(R.saved[qk(x,q)])rev[q.n]=1});   // 上次答錯的空格，標黃
  V.r={x,deal:{},ans:{},secs:{},rev,t0:Date.now(),last:Date.now()};V.view='run';render();scrollTo(0,0)}
const dealOf=(r,q)=>r.deal[q.n]||(r.deal[q.n]=deal(qi(r.x,q)));
function pick(n,j){const r=V.r,x=r.x,q=x.questions.find(t=>t.n===n);if(r.ans[n]!==undefined)return;
  const k=dealOf(r,q).shown[j],key=qk(x,q),now=Date.now(),secs=Math.round((now-r.last)/1000);r.last=now;r.ans[n]=j;r.secs[n]=secs;
  R.rec[key]={ok:k===0,k,secs,t:now};if(k===0)delete R.saved[key];else R.saved[key]=true;
  const st=R.stat[key];if(st)st.picked[k]=(st.picked[k]||0)+1;saveR();const y=scrollY;render();scrollTo(0,y)}
const redo=()=>{stop();V.r={x:V.r.x,deal:{},ans:{},secs:{},rev:V.r.rev,t0:Date.now(),last:Date.now()};render();scrollTo(0,0)};
const next=()=>{stop();if(V.i>=V.list.length-1)go('home');else{V.i++;start()}};
function runPill(r){return n=>{const x=r.x,q=x.questions.find(t=>t.n===n),j=r.ans[n];
  if(j===undefined)return `<a href="#q${n}" class="px-2 mx-0.5 rounded font-bold ${r.rev[n]?'bg-amber-200 dark:bg-amber-500/40 text-amber-900 dark:text-amber-100':'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'}">(${n})</a>`;
  const o=optOf(qi(x,q),dealOf(r,q).shown[j]);
  return `<b class="px-1 rounded ${o.ok?'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300':'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'}">${esc(o.t)}</b>`}}
function qH(r,q){const x=r.x,d=dealOf(r,q),a=r.ans[q.n],done=a!==undefined;
  return `<div id="q${q.n}" class="${card} p-4 mb-3"><p class="text-sm font-bold mb-2">第 ${q.n} 空 <span class="${chip}">${KD[q.kind]||q.kind}</span>${r.rev[q.n]?' <span class="text-xs rounded-full px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">上次答錯</span>':''}</p><div class="space-y-2">${d.shown.map((k,j)=>{const o=optOf(qi(x,q),k);
    const cls=done?(o.ok?'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50':a===j?'border-rose-500 bg-rose-50 dark:bg-rose-950/50':'border-slate-200 dark:border-slate-800'):'border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800';
    return `<button ${done?'disabled':''} onclick="pick(${q.n},${j})" class="w-full text-left rounded-lg border px-3 py-2 text-sm ${cls}"><b>(${'ABCD'[j]})</b> ${esc(o.t)}${done?`<span class="block text-xs ${o.ok?'text-emerald-600':'text-slate-500'}">${esc(o.zh||'')}${o.ok?'':'・'+esc(trn(o.trap))}：${esc(o.why)}</span>`:''}</button>`}).join('')}</div>${done?`<p class="text-xs text-slate-500 mt-2">${esc(pName(q.point))}・${esc(SC[q.scope]||'')}・用時 ${r.secs[q.n]||0} 秒</p>`:''}</div>`}
const exH=r=>{const x=r.x;return `<div class="${card} p-4 mb-3"><p class="text-sm font-bold mb-2">解析</p>${x.questions.map(q=>`<div class="mb-3"><p class="text-sm"><b>第 ${q.n} 空</b> ${esc(q.tag||'')} ${chips(q)}</p><p class="text-sm mt-1">線索：<mark class="rounded px-0.5 bg-amber-200/70 dark:bg-amber-500/30 text-inherit">${esc(q.clue.text)}</mark></p><ol class="text-sm list-decimal pl-5 text-slate-600 dark:text-slate-300">${q.clue.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>${bankH(x,q,r.deal[q.n])}</div>`).join('')}${zhH(x)}${vocabH(x)}</div>`};
function runH(){const r=V.r,x=r.x,qs=x.questions,done=qs.every(q=>r.ans[q.n]!==undefined),last=V.i===V.list.length-1,c=qs.filter(q=>r.ans[q.n]!==undefined&&dealOf(r,q).shown[r.ans[q.n]]===0).length;
  return `<div class="flex items-center justify-between mb-3"><button onclick="if(confirm('離開本次作答？'))go('home')" class="${btn} ${line} !py-1.5">✕ 離開</button><span class="text-sm text-slate-500">${V.mode==='review'?'錯題複習':'練習'} ${V.i+1}/${V.list.length} ・ ${TIER[tier(x)]} ・ ${esc(docN(x.doc))}</span></div>${V.mode==='review'?`<p class="text-xs text-slate-500 mb-2">黃色空格是上次答錯的。</p>`:''}${done?'':hintH()}${passH(x,runPill(r),done?qs.map(q=>q.clue.text):[])}${audioBar(x)}${qs.map(q=>qH(r,q)).join('')}${done?`<div class="${card} p-3 mb-3 text-center"><b>${c}/${qs.length} 答對</b></div>${exH(r)}<div class="grid grid-cols-2 gap-3"><button onclick="redo()" class="${btn} ${line}">再做一次</button><button onclick="next()" class="${btn} ${pri}">${last?'結束':'下一篇 →'}</button></div>`:''}`}

/* ---------- 模擬測驗：不顯示對錯與播放鈕；題號格、旗標、倒數、交卷 ---------- */
function beginTest(l){
  if(!l.length)return;stop();clrT();
  const t={list:l,i:0,deal:{},ans:{},flag:{},qs:{},ps:{},t0:Date.now(),last:Date.now(),pc:Date.now(),limit:l.reduce((s,x)=>s+sug(x),0)};
  l.forEach(x=>x.questions.forEach(q=>{t.deal[qk(x,q)]=deal(qi(x,q))}));   // 開始時一次抽好，整場固定
  V.t=t;V.view='test';render();startClock();scrollTo(0,0)}
function leave(t){const x=t.list[t.i],now=Date.now();t.ps[x.id]=(t.ps[x.id]||0)+(now-t.pc)/1000;t.pc=now}
function tgo(i){const t=V.t;stop();leave(t);t.i=i;t.last=Date.now();render();scrollTo(0,0)}
function tq(pi,n){const t=V.t;stop();if(pi!==t.i){leave(t);t.i=pi;t.last=Date.now()}render();const e=document.getElementById('q'+n);if(e&&e.scrollIntoView)e.scrollIntoView({block:'start'});else scrollTo(0,0)}
function tpick(n,j){const t=V.t,x=t.list[t.i],q=x.questions.find(z=>z.n===n),key=qk(x,q),now=Date.now();
  t.qs[key]=(t.qs[key]||0)+(now-t.last)/1000;t.last=now;
  if(t.ans[key]===j)delete t.ans[key];else t.ans[key]=j;   // 再點一次同一個選項＝取消作答
  const y=scrollY;render();scrollTo(0,y)}
function tflag(n){const t=V.t,x=t.list[t.i],key=x.id+'#'+n;t.flag[key]=!t.flag[key];const y=scrollY;render();scrollTo(0,y)}
function submit(){const t=V.t,un=t.list.length*4-Object.keys(t.ans).length;
  if(un&&!confirm(`還有 ${un} 題沒作答（會算答錯），確定交卷？`))return;finishTest()}
function finishTest(){
  const t=V.t;stop();clrT();leave(t);const rows=[];
  t.list.forEach(x=>x.questions.forEach(q=>{const key=qk(x,q),j=t.ans[key],d=t.deal[key],k=j===undefined?-1:d.shown[j],ok=k===0,secs=Math.round(t.qs[key]||0);
    R.rec[key]={ok,k,secs,t:Date.now()};if(ok)delete R.saved[key];else R.saved[key]=true;   // 答錯（含未答）的空格進錯題複習
    if(k>=0){const st=R.stat[key];if(st)st.picked[k]=(st.picked[k]||0)+1}
    rows.push({x,q,key,k,ok,secs,trap:k>0?q.distractors[k-1].trap:null})}));
  saveR();t.res=summarize(t,rows);V.view='result';render();scrollTo(0,0)}
function summarize(t,rows){
  const grp=f=>{const o={};rows.forEach(r=>{const k=f(r),b=o[k]=o[k]||[0,0];b[1]++;if(r.ok)b[0]++});return o},tp={};
  rows.forEach(r=>{if(!r.ok&&r.trap)tp[r.trap]=(tp[r.trap]||0)+1});
  const ps=t.list.map(x=>t.ps[x.id]||0),sum=ps.reduce((a,b)=>a+b,0);
  return{n:rows.length,c:rows.filter(r=>r.ok).length,rows,byKind:grp(r=>r.q.kind),byPoint:grp(r=>r.q.point),byScope:grp(r=>r.q.scope),tp,
    avg:Math.round(sum/t.list.length),over:t.list.filter((x,i)=>ps[i]>sug(x)).length,slow:rows.filter(r=>r.secs>sug(r.x)/2).length,
    wrongX:t.list.filter(x=>rows.some(r=>r.x===x&&!r.ok)),total:Math.round((Date.now()-t.t0)/1000)}}
function tqH(t,x,q){
  const key=qk(x,q),a=t.ans[key],d=t.deal[key];
  return `<div id="q${q.n}" class="${card} p-4 mb-3"><div class="flex items-center justify-between mb-2"><p class="text-sm font-bold">第 ${q.n} 空 <span class="text-xs font-normal text-slate-500">（全卷第 ${t.i*4+q.n} 題）</span></p><button onclick="tflag(${q.n})" class="${btn} ${line} !py-1 text-xs">${t.flag[key]?'⚑ 取消標記':'⚐ 待檢查'}</button></div><div class="space-y-2">${d.shown.map((k,j)=>{const o=optOf(qi(x,q),k);
    return `<button onclick="tpick(${q.n},${j})" class="w-full text-left rounded-lg border px-3 py-2 text-sm ${a===j?'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50':'border-slate-300 dark:border-slate-700'}"><b>(${'ABCD'[j]})</b> ${esc(o.t)}</button>`}).join('')}</div></div>`}
function testH(){
  const t=V.t,x=t.list[t.i],last=t.i===t.list.length-1,[ct,cc]=clockInfo(),tot=t.list.length*4,an=Object.keys(t.ans).length;
  const pill=n=>{const q=x.questions.find(z=>z.n===n),key=qk(x,q),j=t.ans[key];   // 只顯示所選詞，不顯示對錯
    return `<a href="#q${n}" class="${PA}">${j===undefined?'('+n+')':esc(optOf(qi(x,q),t.deal[key].shown[j]).t)}</a>`};
  const grid=t.list.map((y,pi)=>`<span class="inline-flex flex-wrap gap-1.5 mr-3 mb-1.5">${y.questions.map(q=>{const key=qk(y,q);
    return `<button onclick="tq(${pi},${q.n})" aria-label="第 ${pi*4+q.n} 題" class="w-9 h-9 rounded-lg text-sm ${t.ans[key]!==undefined?'bg-indigo-100 dark:bg-indigo-900/50':'bg-slate-100 dark:bg-slate-800'} ${t.flag[key]?'ring-2 ring-amber-500':pi===t.i?'ring-2 ring-indigo-400':''}">${pi*4+q.n}</button>`}).join('')}</span>`).join('');
  return `<div class="flex items-center justify-between mb-3"><button onclick="if(confirm('離開測驗？本次作答不會計分。'))go('home')" class="${btn} ${line} !py-1.5">✕ 離開</button><span class="text-sm text-slate-500">測驗 第 ${t.i+1}/${t.list.length} 篇 ・ ${esc(docN(x.doc))}</span></div>
  <div class="${card} p-3 mb-3 flex items-center justify-between gap-2"><span id="tm" class="text-sm ${cc}">${esc(ct)}</span><span class="text-xs text-slate-500">共 ${Math.round(t.limit/60*10)/10} 分鐘</span></div>
  <div class="${card} p-3 mb-3">${grid}<p class="text-xs text-slate-500">藍底＝已作答；琥珀框＝待檢查；藍框＝目前這一篇</p></div>
  ${passH(x,pill,[])}${x.questions.map(q=>tqH(t,x,q)).join('')}
  <div class="grid grid-cols-2 gap-2 mt-3"><button ${t.i===0?'disabled':''} onclick="tgo(${t.i-1})" class="${btn} ${line}">← 上一篇</button><button ${last?'disabled':''} onclick="tgo(${t.i+1})" class="${btn} ${line}">下一篇 →</button></div>
  <button onclick="submit()" class="${btn} ${pri} w-full mt-3">交卷（已答 ${an}/${tot}）</button>`}

/* ---------- 結果頁 ---------- */
function reviewH(x,t,s){
  const rows=s.rows.filter(r=>r.x===x),wr=rows.filter(r=>!r.ok);
  const pill=n=>{const r=rows.find(z=>z.q.n===n),a=optOf(qi(x,r.q),0).t;
    if(r.ok)return `<b class="px-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">${esc(a)}</b>`;
    const my=r.k>0?optOf(qi(x,r.q),r.k).t:'';
    return `${my?`<s class="text-rose-600">${esc(my)}</s> `:'<span class="text-xs text-amber-600">（未答）</span> '}<b class="px-1 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">${esc(a)}</b>`};
  return `<details class="${card} p-3 mb-2"><summary class="cursor-pointer text-sm"><b>${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="text-xs text-rose-600 ml-1">答錯 ${wr.length} 空</span></summary><div class="mt-3">
  ${passH(x,pill,wr.map(r=>r.q.clue.text))}
  ${wr.map(r=>{const my=r.k>0?optOf(qi(x,r.q),r.k):null,ans=optOf(qi(x,r.q),0);
    return `<div class="mb-3"><p class="text-sm"><b>第 ${r.q.n} 空</b> ${chips(r.q)}${r.secs>sug(x)/2?' <span class="text-xs rounded-full px-2.5 py-1 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">偏慢 '+r.secs+' 秒</span>':''}</p>
    <p class="text-sm text-rose-600 mt-1">你選：${my?esc(my.t)+'（'+esc(trn(my.trap))+'）':'（未作答）'}</p>${my?`<p class="text-xs text-slate-500">${esc(my.why)}</p>`:''}
    <p class="text-sm text-emerald-600 mt-1">正解：${esc(ans.t)}</p><p class="text-xs text-slate-500">${esc(ans.why)}</p>
    <ol class="text-sm list-decimal pl-5 mt-1 text-slate-600 dark:text-slate-300">${r.q.clue.steps.map(z=>`<li>${esc(z)}</li>`).join('')}</ol>${bankH(x,r.q,t.deal[r.key])}</div>`}).join('')}
  ${audioBar(x)}${zhH(x)}${vocabH(x)}</div></details>`;
}
function resultH(){
  const t=V.t,s=t.res,{n,c}=s,fm=sec=>Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
  const row=(a,b,cls)=>`<div class="flex justify-between gap-3 text-sm py-1 border-b border-slate-100 dark:border-slate-800 ${cls||''}"><span>${a}</span><span class="shrink-0">${b}</span></div>`,pc=b=>b[0]+'/'+b[1]+'（'+Math.round(b[0]/b[1]*100)+'%）',weak=b=>b[0]/b[1]<0.6?'text-rose-600':'';
  const ptKeys=Object.keys(s.byPoint).sort((a,b)=>s.byPoint[a][0]/s.byPoint[a][1]-s.byPoint[b][0]/s.byPoint[b][1]);
  const ps=t.list.map(x=>({x,s:Math.round(t.ps[x.id]||0)}));
  return hdr('測驗結果',"go('home')")+`<div class="${card} p-5 mb-3 text-center"><div class="text-4xl font-bold">${c}/${n}</div><div class="text-sm text-slate-500">答對率 ${Math.round(c/n*100)}%</div></div>
  <div class="${card} p-4 mb-3">${row('總用時',fm(s.total)+'（時限 '+fm(t.limit)+'）')}${row('平均每篇用時',s.avg+' 秒')}${row('超過建議時間的篇數',s.over+' 篇')}${row('偏慢的空格（超過該篇建議秒數一半）',s.slow+' 題')}
    <details class="mt-2"><summary class="cursor-pointer text-xs text-slate-500">各篇用時</summary>${ps.map(p=>row(esc(p.x.id),p.s+' 秒／建議 '+sug(p.x)+' 秒',p.s>sug(p.x)?'text-rose-600':'')).join('')}</details></div>
  <div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">各題型正確率</p>${Object.keys(KD).filter(k=>s.byKind[k]).map(k=>row(KD[k],pc(s.byKind[k]),weak(s.byKind[k]))).join('')}</div>
  <div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">各考點正確率（由低到高）</p>${ptKeys.map(k=>row(esc(pName(k)),pc(s.byPoint[k]),weak(s.byPoint[k]))).join('')}</div>
  <div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">依線索位置</p>${['local','near','far'].filter(k=>s.byScope[k]).map(k=>row(esc(SC[k]),pc(s.byScope[k]),weak(s.byScope[k]))).join('')}${s.byScope.local&&(s.byScope.near||s.byScope.far)?'<p class="text-xs text-slate-500 mt-1">「前後句」「標頭或跨段」偏低，代表需要讀上下文的題比較弱。</p>':''}</div>
  ${Object.keys(s.tp).length?`<div class="${card} p-4 mb-3"><p class="font-bold text-sm mb-1">你最常中的陷阱</p>${Object.keys(s.tp).sort((a,b)=>s.tp[b]-s.tp[a]).map(k=>row(esc(trn(k)),s.tp[k]+' 次')).join('')}</div>`:''}
  ${s.wrongX.length?`<p class="font-bold text-sm mb-2">答錯的篇（已加入錯題複習）</p>`+s.wrongX.map(x=>reviewH(x,t,s)).join(''):`<div class="${card} p-4 text-sm text-center">全部答對 🎉</div>`}
  <div class="grid grid-cols-2 gap-3 mt-3">${s.wrongX.length?`<button onclick="beginReview()" class="${btn} ${line}">錯題複習</button>`:'<span></span>'}<button onclick="go('home')" class="${btn} ${pri}">回到首頁</button></div>`;
}

/* ---------- 首頁 ---------- */
const pickBtn=()=>`<label class="${btn} ${pri} inline-block mt-3">選取 part6.json<input type="file" accept=".json,application/json" class="hidden" onchange="pickJson(this)"></label>`;
const loadWarn=()=>{
  if(!LERR)return '';
  const code='px-1 rounded bg-amber-100 dark:bg-amber-900/50',T={file:'請手動選取 part6.json',fetch:'讀不到 part6.json，可以手動選取',bad:'part6.json 格式有誤',empty:'part6.json 內沒有可用的題目'}[LERR];
  const B={file:`直接雙擊開啟時，瀏覽器不允許自動讀取本機的 json 檔。請選擇同資料夾的 part6.json（本次開啟有效，重新整理後要再選一次）。<br>想要自動載入：在專案資料夾執行 <code class="${code}">python -m http.server 8000</code>，再開 <code class="${code}">http://localhost:8000/part6.html</code>；或上傳到 GitHub Pages。<br><span class="text-xs">備註：用手動選取時讀不到 audio/index.json，所以暫時都用機器發音。</span>`,
    fetch:'請確認 part6.json 與 part6.html 在同一個資料夾、檔名大小寫正確（GitHub Pages 區分大小寫）。也可以先手動選取檔案使用。',
    bad:'JSON 解析失敗：'+esc(LMSG)+'。可用 json_merge.py 重新合併，或改選另一個檔案。',
    empty:'請確認 items 內每篇都有 head、body、zh、questions（4 題）。可用 json_merge.py 合併並驗證題目，或改選另一個檔案。'}[LERR];
  return `<div class="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 p-4 mb-4 text-sm leading-relaxed"><b>${T}</b><br>${B}<br>${pickBtn()}</div>`;
};
function homeH(){
  const pool=poolOf(),ws=wrongItems(),ds=[...new Set(DATA.map(x=>x.domain))].sort(),cs=[...new Set(DATA.map(x=>x.doc))].filter(Boolean),dn=d=>(SPEC&&SPEC.domains&&SPEC.domains[d]&&SPEC.domains[d].name)||'';
  const ks=Object.keys(KD).filter(k=>DATA.some(x=>x.questions.some(q=>q.kind===k)));
  const pts=V.fk?Object.keys((SPEC&&SPEC.points)||{}).filter(p=>SPEC.points[p].kind===V.fk&&DATA.some(x=>x.questions.some(q=>q.point===p))):[];
  const lim=l=>Math.round(l.reduce((s,x)=>s+sug(x),0)/60*10)/10;
  return `<div class="flex items-center justify-between mb-4"><div><a href="index.html" class="text-sm text-slate-500">← 首頁</a><h1 class="text-xl font-bold">Part 6 段落填空</h1></div><div class="flex gap-2"><button onclick="go('maint')" class="${btn} ${line} !py-1.5" aria-label="維護">🛠 維護</button><button onclick="toggleDark()" class="${btn} ${line} !py-1.5">${S.dark?'☀':'☾'}</button></div></div>
  ${loadWarn()}
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="setF('fd','')" class="${on(!V.fd)}">全部主題</button>${ds.map(d=>`<button onclick="setF('fd','${d}')" class="${on(V.fd===d)}">${d.toUpperCase()} ${esc(dn(d))}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="setF('ft','')" class="${on(!V.ft)}">全部難度</button>${Object.keys(TIER).map(k=>`<button onclick="setF('ft','${k}')" class="${on(V.ft===k)}">${TIER[k]}</button>`).join('')}</div>
  <div class="flex flex-wrap gap-2 mb-2"><button onclick="setF('fc','')" class="${on(!V.fc)}">全部文章類型</button>${cs.map(k=>`<button onclick="setF('fc','${esc(k)}')" class="${on(V.fc===k)}">${esc(docN(k))}</button>`).join('')}</div>
  <div class="flex flex-wrap items-center gap-2 mb-2"><button onclick="setF('fk','');setF('fp','')" class="${on(!V.fk)}">全部考點</button>${ks.map(k=>`<button onclick="setK('${k}')" class="${on(V.fk===k)}">${KD[k]}</button>`).join('')}</div>
  ${pts.length>1?`<div class="flex flex-wrap items-center gap-2 mb-2"><span class="text-xs text-slate-500">細分</span><button onclick="setF('fp','')" class="${on(!V.fp)}">該類全部</button>${pts.map(p=>`<button onclick="setF('fp','${p}')" class="${on(V.fp===p)}">${esc(pName(p))}</button>`).join('')}</div>`:''}
  <div class="mb-2"></div>
  <div class="grid grid-cols-2 gap-3 mb-3"><button ${pool.length?'':'disabled'} onclick="begin(shuf(poolOf()))" class="${btn} ${pri}">練習（${pool.length} 篇）</button><button ${pool.length?'':'disabled'} onclick="beginTest(shuf(poolOf()).slice(0,1))" class="${btn} ${pri}">模擬測驗（1 篇）</button></div>
  ${pool.length>=4?`<button onclick="beginTest(shuf(poolOf()).slice(0,4))" class="${btn} ${pri} w-full mb-3">模擬測驗 完整版（4 篇・16 題・約 ${lim(pool.slice(0,4))} 分鐘）</button>`:''}
  ${ws.length?`<button onclick="beginReview()" class="${btn} ${line} w-full mb-4">錯題複習（${ws.length} 篇）</button>`:'<div class="mb-4"></div>'}
  ${pool.map(x=>{const rs=x.questions.map(q=>R.rec[qk(x,q)]),all=rs.every(Boolean),c=rs.filter(t=>t&&t.ok).length;return `<button onclick="begin([byId('${esc(x.id)}')])" class="${card} p-3 mb-2 w-full text-left flex justify-between gap-2"><span class="min-w-0"><b class="text-sm">${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="flex flex-wrap gap-1 mt-1"><span class="${chip}">${TIER[tier(x)]}</span><span class="${chip}">${esc(docN(x.doc))}</span></span></span><span class="text-xs shrink-0 ${all?(c===4?'text-emerald-600':'text-rose-600'):'text-slate-400'}">${all?(c===4?'✓ ':'✗ ')+c+'/4':'尚未作答'}</span></button>`}).join('')||`<div class="${card} p-8 text-center text-sm text-slate-500">沒有符合的題目（題庫共 ${DATA.length} 篇）。</div>`}`}
/* ===== 階段 3：維護頁（題數矩陣、考點統計、AI 寫題目指令、單篇檢視、音檔清單） ===== */
let M={fd:'',ft:'',gd:'d1',gt:'medium',gdoc:'memo',n:1,pts:{},prompt:''};
const SCORES={easy:[500,550],medium:[600,650],hard:[700,750,800]},SUF={easy:'e',medium:'m',hard:'h'};
const cefrOf=s=>s<=550?'A2+':s===600?'B1':s===650?'B1+':s<=750?'B2':'B2+';
const shr=s=>{const m=String(s||'').match(/(\d+)(?:\s*[–-]\s*(\d+))?/);return m?[+m[1],+(m[2]||m[1])]:null};
const DOMS=()=>[...new Set([...Object.keys((SPEC&&SPEC.domains)||{}),...DATA.map(x=>x.domain)])].filter(Boolean).sort();
const dnm=d=>(SPEC&&SPEC.domains&&SPEC.domains[d]&&SPEC.domains[d].name)||'';
const allQ=()=>DATA.flatMap(x=>x.questions);
const mList=()=>DATA.filter(x=>(!M.fd||x.domain===M.fd)&&(!M.ft||tier(x)===M.ft));
const who=x=>x.voice==='M'?'M':'F';
const missText=l=>l.filter(x=>!AU.has(x.id)).map(x=>`${x.id}.mp3 | ${sayText(x)} | ${who(x)}`).join('\n');
const filledP=x=>x.body.map(p=>p.replace(/\[\[(\d)\]\]/g,(_,n)=>(x.questions.find(q=>q.n===+n)||{answer:{t:''}}).answer.t));
const subjOf=x=>{const s=(x.head||[]).find(h=>/^\s*subject\s*:/i.test(h));return s?s.replace(/^[^:]*:/,'').trim():((x.head||[])[0]||'')};
const firstOf=x=>{const t=filledP(x).join(' ').trim(),m=t.match(/[.?!](\s|$)/);return m?t.slice(0,m.index+1):t};
function cp(t,b){
  const o=b&&b.textContent,ok=()=>{if(b){b.textContent='✓ 已複製';setTimeout(()=>{b.textContent=o},1200)}};
  const fb=()=>{const ta=document.createElement('textarea');ta.value=t;ta.style.cssText='position:fixed;opacity:0';document.body.appendChild(ta);ta.select();try{document.execCommand('copy')}catch(e){}ta.remove();ok()};
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(ok,fb);else fb();
}
const mset=(k,v)=>{M[k]=v;render()};
const mcell=(d,t)=>{const same=M.fd===d&&M.ft===t;M.fd=same?'':d;M.ft=same?'':t;if(!same){M.gd=d;M.gt=t}render()};
const mpt=p=>{M.pts[p]=!M.pts[p];render()};
const mgen=()=>{M.prompt=promptText();render();const e=document.getElementById('mp');if(e&&e.scrollIntoView)e.scrollIntoView({behavior:'smooth',block:'center'})};
function promptText(){
  const sp=SPEC||{},d=M.gd,t=M.gt,n=M.n,sc=(sp.domains&&sp.domains[d]&&sp.domains[d].scenes)||[],T=(sp.tiers&&sp.tiers[t])||{};
  const mx=DATA.filter(x=>x.domain===d&&tier(x)===t).reduce((a,x)=>Math.max(a,+String(x.id).split('-')[1]||0),0);
  const ids=Array.from({length:n},(_,i)=>`${d}-${String(mx+1+i).padStart(3,'0')}-${SUF[t]}`);
  const sel=Object.keys(M.pts).filter(k=>M.pts[k]),qs=allQ(),cnt=p=>qs.filter(q=>q.point===p).length,P=sp.points||{};
  const ptLine=sel.length?`只出下列考點（每篇仍須符合組成規則）：${sel.map(p=>pName(p)+'('+p+')').join('、')}`
    :`不限；各考點現有「空格」題數與建議占比：${Object.keys(P).map(p=>`${pName(p)}(${p}) 現有 ${cnt(p)}、建議 ${P[p].share}`).join('；')}；請優先補數量最少者`;
  const rules=sp.rules?(Array.isArray(sp.rules)?sp.rules:Object.values(sp.rules)):[];
  const uniq=f=>[...new Set(DATA.flatMap(f))].filter(Boolean);
  const vocab=uniq(x=>(x.vocab||[]).map(v=>v.word)),tags=uniq(x=>[x.tag]);
  const heads=DATA.map(x=>`${x.id}：${subjOf(x)}／${firstOf(x)}`);
  const spec=JSON.stringify(Object.fromEntries(Object.entries(sp).filter(([k])=>k!=='domains')));
  return `請為多益 Part 6 段落填空寫 ${n} 篇（每篇一篇文章、4 個空格；非插入題 1 正解＋7 干擾項，插入題 1 正解句＋3 干擾句），輸出為單一 JSON 陣列，規格在最後，不需要另外附 part6.json。

- 主題：${d.toUpperCase()} ${dnm(d)}（scene 須屬於：${sc.join('、')||'—'}）；可選填 biz。
- 文章類型：${M.gdoc}（${docN(M.gdoc)}；doc 欄位照填）。
- 難度：${TIER[t]}（id 尾碼 ${SUF[t]}）｜level.score 只能填：${SCORES[t].map(s=>`${s}（cefr ${cefrOf(s)}）`).join('、')}｜${T.guide||''}
- 考點：${ptLine}。
- id 依序使用：${ids.join('、')}（domain 填 ${d}，level.tier 填 ${t}）；voice 填 F 或 M。
- 每篇剛好 4 空格 [[1]]–[[4]]、剛好 1 題 insert；其餘規則見下方 rules。
- clue.steps 依四步驟各寫一句：掃描選項判斷題型 → 分析空格前後線索 → 刪去法 → 代入驗證（插入題改為：判斷為插入題留到最後 → 找前後連結線索 → 逐句排除 → 代入檢查連貫）。
${rules.map(r=>'- '+r).join('\n')}
- 已用過的 vocab（不得重複）：${vocab.join('、')||'（無）'}
- 已用過的 tag（不得重複）：${tags.join('、')||'（無）'}
- 已有的標頭主旨或標題與首句（不要雷同）：${heads.join('；')||'（無）'}
- 輸出方式：建立檔案 p6_${ids[0]}_x${n}.json（只含一個合法 JSON 陣列、UTF-8、不加程式碼區塊標記）；無法建檔才輸出單一 json 程式碼區塊。

【規格：part6.json 的 _spec 精簡版】
${spec}

寫完請自我檢查：逐篇逐空格把每個干擾項代回整篇，確認只有 1 個選項成立；確認 [[1]]–[[4]] 依序各 1 次；確認至少 2 題 scope 為 near 或 far；確認 clue.text 是原文片段；確認數字與日期一致。有任何不確定寫進 issues。`;
}
function matrixH(){
  const ds=DOMS(),ts=Object.keys(TIER);
  const cell=(d,t)=>{const l=DATA.filter(x=>x.domain===d&&tier(x)===t),a=l.filter(x=>AU.has(x.id)).length,sel=M.fd===d&&M.ft===t;
    return `<td class="p-0.5"><button onclick="mcell('${d}','${t}')" class="${btn} !px-2 !py-1.5 w-full ${sel?'bg-indigo-600 text-white':l.length?'bg-slate-100 dark:bg-slate-800':'bg-slate-50 dark:bg-slate-900 text-slate-400'}">${l.length} · 🎧${a}</button></td>`};
  const tot=l=>`${l.length} · 🎧${l.filter(x=>AU.has(x.id)).length}`;
  return `<div class="${card} p-4 mb-4"><p class="text-sm font-bold mb-1">題數矩陣（主題 × 難度）</p><p class="text-xs text-slate-500 mb-2">格內＝篇數 · 🎧音檔完整數；點一格可篩選下方單篇列表，並帶入「新增題目」。</p>
  <div class="overflow-x-auto"><table class="w-full text-center text-sm"><thead><tr><th></th>${ts.map(t=>`<th class="text-xs font-medium text-slate-500 pb-1">${TIER[t]}</th>`).join('')}<th class="text-xs font-medium text-slate-500 pb-1">合計</th></tr></thead><tbody>
  ${ds.map(d=>`<tr><td class="text-left text-xs pr-2 whitespace-nowrap">${d.toUpperCase()} ${esc(dnm(d))}</td>${ts.map(t=>cell(d,t)).join('')}<td class="text-xs text-slate-500">${tot(DATA.filter(x=>x.domain===d))}</td></tr>`).join('')}
  <tr><td class="text-left text-xs pr-2">合計</td>${ts.map(t=>`<td class="text-xs text-slate-500 py-1">${tot(DATA.filter(x=>tier(x)===t))}</td>`).join('')}<td class="text-xs font-bold py-1">${tot(DATA)}</td></tr></tbody></table></div></div>`;
}
function statsH(){
  const qs=allQ(),tot=qs.length,P=(SPEC&&SPEC.points)||{},cnt=(k,v)=>qs.filter(q=>q[k]===v).length;
  const pct=n=>tot?(n/tot*100).toFixed(1):'0.0';
  const docs=[...new Set(DATA.map(x=>x.doc))].filter(Boolean);
  const rows=Object.keys(P).map(p=>{const n=cnt('point',p),r=shr(P[p].share),low=r&&tot&&n/tot*100<r[0];
    return `<tr class="${low?'bg-amber-50 dark:bg-amber-900/20':''}"><td class="py-1 pr-2">${esc(P[p].name||p)} <span class="text-xs text-slate-400">${KD[P[p].kind]||''}</span></td><td class="pr-3 text-right">${n}</td><td class="pr-3 text-right">${pct(n)}%</td><td class="text-xs text-slate-500">${esc(P[p].share||'')}${low?' <b class="text-amber-600">偏少</b>':''}</td></tr>`}).join('');
  return `<div class="${card} p-4 mb-4"><p class="text-sm font-bold mb-2">統計（以「空格」計，共 ${tot} 個空格 / ${DATA.length} 篇）</p>
  <div class="flex flex-wrap gap-1.5 mb-3">${Object.keys(KD).map(k=>`<span class="${chip}">${KD[k]} ${cnt('kind',k)}（${pct(cnt('kind',k))}%）</span>`).join('')}</div>
  <div class="overflow-x-auto"><table class="text-sm w-full"><thead><tr class="text-xs text-slate-500 text-left"><th class="font-medium">考點</th><th class="font-medium text-right pr-3">題數</th><th class="font-medium text-right pr-3">占比</th><th class="font-medium">建議占比</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="text-xs text-slate-500 mt-3 mb-1">文章類型</p><div class="flex flex-wrap gap-1.5 mb-2">${docs.map(k=>`<span class="${chip}">${esc(docN(k))} ${DATA.filter(x=>x.doc===k).length}</span>`).join('')||'<span class="text-xs text-slate-400">—</span>'}</div>
  <p class="text-xs text-slate-500 mb-1">線索範圍（scope）</p><div class="flex flex-wrap gap-1.5">${Object.keys(SCN).map(k=>`<span class="${chip}">${SCN[k]} ${cnt('scope',k)}（${pct(cnt('scope',k))}%）</span>`).join('')}</div></div>`;
}
function genH(){
  const sp=SPEC||{},ds=DOMS(),docs=Object.keys(sp.docs||{}),P=sp.points||{},sel='rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm';
  return `<div class="${card} p-4 mb-4"><p class="text-sm font-bold mb-2">新增題目：給 AI 的寫題目指令</p>
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3"><label class="text-xs text-slate-500">主題<select class="${sel} w-full" onchange="mset('gd',this.value)">${ds.map(d=>`<option value="${d}" ${M.gd===d?'selected':''}>${d.toUpperCase()} ${esc(dnm(d))}</option>`).join('')}</select></label>
  <label class="text-xs text-slate-500">難度<select class="${sel} w-full" onchange="mset('gt',this.value)">${Object.keys(TIER).map(t=>`<option value="${t}" ${M.gt===t?'selected':''}>${TIER[t]}</option>`).join('')}</select></label>
  <label class="text-xs text-slate-500">文章類型<select class="${sel} w-full" onchange="mset('gdoc',this.value)">${docs.map(k=>`<option value="${k}" ${M.gdoc===k?'selected':''}>${esc(docN(k))}（${k}）</option>`).join('')}</select></label></div>
  <div class="flex flex-wrap items-center gap-2 mb-3"><span class="text-xs text-slate-500">篇數</span>${[1,2,3,5].map(k=>`<button onclick="mset('n',${k})" class="${on(M.n===k)}">${k}</button>`).join('')}</div>
  <p class="text-xs text-slate-500 mb-1">本批必含的考點（選填，不選＝不限，由 AI 補數量最少者）</p><div class="flex flex-wrap gap-1.5 mb-3">${Object.keys(P).map(p=>`<button onclick="mpt('${p}')" class="${on(M.pts[p])} !py-1 !px-2.5 text-xs">${esc(P[p].name||p)}</button>`).join('')}</div>
  <button onclick="mgen()" class="${btn} ${pri}">產生指令</button>
  ${M.prompt?`<div id="mp" class="mt-3"><textarea readonly class="w-full h-64 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-2 font-mono">${esc(M.prompt)}</textarea><button onclick="cp(M.prompt,this)" class="${btn} ${line} mt-2">複製指令</button></div>`:''}</div>`;
}
function itemH(x){
  const pill=n=>{const q=x.questions.find(z=>z.n===n);return `<b class="${PA}">(${n}) ${esc(q.answer.t)}</b>`};
  const qh=q=>{const st=R.stat[qk(x,q)],y=qi(x,q),all=[0,...q.distractors.map((_,i)=>i+1)],ex=(a,k)=>(a&&a[k])||0;
    return `<div class="mb-3"><p class="text-sm"><b>第 ${q.n} 空</b> ${chips(q)}</p><div class="mt-1 space-y-1">${all.map(k=>{const o=optOf(y,k),fam=k>0&&q.kind!=='insert'&&q.distractors[k-1].fam==='root';
      return `<div class="text-xs rounded border px-2 py-1 ${o.ok?'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50':'border-slate-200 dark:border-slate-800'}"><b>${esc(o.t)}</b> <span class="text-slate-500">${esc(o.zh||'')} ${esc(o.pos||'')}</span>${o.ok?' <span class="text-emerald-600">✓ 正解</span>':` <span class="text-slate-500">[${esc(trn(o.trap))}]</span>`}${o.near?' <span class="text-amber-600">near</span>':''}${fam?' <span class="text-sky-600">root</span>':''}${st?` <span class="text-slate-400">· 曝光 ${ex(st.shown,k)}／選 ${ex(st.picked,k)}</span>`:''}<span class="block text-slate-500">${esc(o.why)}</span></div>`}).join('')}</div></div>`};
  const has=AU.has(x.id);
  return `<details class="${card} p-3 mb-2"><summary class="cursor-pointer text-sm"><b>${esc(x.id)}</b> <span class="text-xs text-slate-500">${esc(x.tag)}</span><span class="text-xs ml-1 ${has?'text-emerald-600':'text-rose-500'}">${has?'🎧✔':'🎧✖'}</span><span class="flex flex-wrap gap-1 mt-1"><span class="${chip}">${TIER[tier(x)]}</span><span class="${chip}">${esc(docN(x.doc))}</span><span class="${chip}">${x.voice==='M'?'男聲':'女聲'}</span></span></summary><div class="mt-3">
  ${passH(x,pill)}${x.questions.map(qh).join('')}${zhH(x)}${vocabH(x)}
  <div class="${card} p-3 mt-3"><p class="text-xs font-bold mb-2">🔊 音檔 ${has?'✔ 有':'✖ 缺'}：<code>audio/p6/${esc(x.id)}.mp3</code>（${x.voice==='M'?'男聲':'女聲'}）</p>${audioBar(x)}<div class="flex flex-wrap gap-2"><button onclick="cp(this.dataset.t,this)" data-t="${esc(x.id+'.mp3')}" class="${btn} ${line} !py-1 text-xs">複製檔名</button><button onclick="cp(this.dataset.t,this)" data-t="${esc(sayText(x))}" class="${btn} ${line} !py-1 text-xs">複製朗讀稿</button></div></div></div></details>`;
}
function maintH(){
  const l=mList(),miss=l.filter(x=>!AU.has(x.id)).length;
  return `<div class="flex items-center justify-between mb-4"><div class="flex items-center gap-3"><button onclick="go('home')" class="${btn} ${line} !py-1.5">←</button><h1 class="text-lg font-bold">Part 6 維護</h1></div><button onclick="toggleDark()" class="${btn} ${line} !py-1.5">${S.dark?'☀':'☾'}</button></div>
  ${matrixH()}${statsH()}${genH()}
  <div class="flex flex-wrap items-center justify-between gap-2 mb-2"><p class="text-sm font-bold">單篇檢視（${l.length} 篇${M.fd||M.ft?'｜'+(M.fd?M.fd.toUpperCase():'全部主題')+' '+(M.ft?TIER[M.ft]:'全部難度'):''}）</p>
  <div class="flex gap-2">${M.fd||M.ft?`<button onclick="mset('fd','');mset('ft','')" class="${btn} ${line} !py-1 text-xs">顯示全部</button>`:''}${miss?`<button onclick="cp(missText(mList()),this)" class="${btn} ${line} !py-1 text-xs">複製本格缺的清單（${miss}）</button>`:''}</div></div>
  ${miss?'<p class="text-xs text-slate-500 mb-2">清單格式：檔名.mp3 | 朗讀稿 | M或F，可直接貼給 AI 語音工具。</p>':''}
  ${l.map(itemH).join('')||`<div class="${card} p-8 text-center text-sm text-slate-500">這一格還沒有題目。</div>`}`;
}
function render(){
  document.documentElement.classList.toggle('dark',!!S.dark);const v=V.view;
  main.innerHTML=v==='maint'?maintH():v==='run'&&V.r?runH():v==='test'&&V.t&&!V.t.res?testH():v==='result'&&V.t&&V.t.res?resultH():homeH();
  if(v==='test'&&!T.id)startClock();else if(v!=='test')clrT();
  paintAudio();
}
/* ---------- 啟動：讀取 part6.json；雙擊開啟（file://）或讀不到時，可在首頁手動選取 ---------- */
function loadText(t){
  try{
    const j=JSON.parse(t);SPEC=(j&&j._spec)||null;
    DATA=(Array.isArray(j)?j:(j&&j.items)||[]).filter(x=>x&&x.id&&['head','body','zh','questions'].every(k=>Array.isArray(x[k]))&&x.questions.length===4);
    LERR=DATA.length?'':'empty';
  }catch(e){LERR='bad';LMSG=e.message}
  render();
}
function pickJson(input){const f=input.files[0];if(!f)return;const r=new FileReader();r.onload=()=>loadText(r.result);r.readAsText(f,'utf-8');input.value=''}
(async()=>{
  await auLoad();
  try{const res=await fetch('part6.json',{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);loadText(await res.text())}
  catch(e){LERR=location.protocol==='file:'?'file':'fetch';render()}
})();
