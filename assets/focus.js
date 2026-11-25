/* Local focus sessions use absolute deadlines; no per-second storage writes. */
(()=>{
 'use strict';
 const C=FocusCore,KEY='gpdQuestLog.focus.v1',$=id=>document.getElementById(id);
 let data,loadError=false;
 try{data=C.restore(JSON.parse(localStorage.getItem(KEY)));}catch(_){data=C.restore(null);loadError=true;}
 const baseTitle=document.title;
 const message=text=>{$('focusMessage').textContent=text;};
 function commit(next){try{localStorage.setItem(KEY,JSON.stringify(next));data=next;return true;}catch(_){message('未能保存专注状态，请检查浏览器存储空间后重试。');return false;}}
 function tasks(){try{return S.main.filter(x=>!x.done);}catch(_){return [];}}
 function taskOptions(){
  if(data.session)return;
  const selected=$('focusTask').value;
  $('focusTask').replaceChildren(new Option('不关联任务',''));
  for(const task of tasks())$('focusTask').append(new Option(task.text,task.id));
  if(tasks().some(t=>t.id===selected))$('focusTask').value=selected;
 }
 function minutesText(ms){const m=ms/60000;return m<1?Math.max(0,Math.round(ms/1000))+' 秒':Math.round(m*10)/10+' 分钟';}
 function clock(ms){const sec=Math.ceil(ms/1000);return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');}
 function dateText(t){return new Date(t).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
 let audioContext=null,audioGain=null,audioNodes=[],audioMode=null,audioRevision=0;
 function stopAudio(){audioRevision++;audioNodes.forEach(n=>{try{n.stop();n.disconnect();}catch(_){}});audioNodes=[];audioMode=null;try{audioGain?.disconnect();}catch(_){}audioGain=null;}
 async function syncAudio(userGesture=false){
  const running=data.session?.status==='running';
  if(!running||data.sound==='mute'){stopAudio();$('focusEnableAudio').hidden=true;return;}
  if(!audioContext&&!userGesture){$('focusEnableAudio').hidden=false;return;}
  try{
   if(!audioContext)audioContext=new(window.AudioContext||window.webkitAudioContext)();
   if(audioContext.state!=='running'&&userGesture)await audioContext.resume();
   if(data.session?.status!=='running'||data.sound==='mute'){stopAudio();$('focusEnableAudio').hidden=true;return;}
   if(audioContext.state!=='running'){$('focusEnableAudio').hidden=false;return;}
   if(audioMode!==data.sound){
    stopAudio();const revision=audioRevision;
    audioGain=audioContext.createGain();audioGain.gain.value=0;audioGain.connect(audioContext.destination);
    if(data.sound==='rain'){
     const buffer=audioContext.createBuffer(1,audioContext.sampleRate*3,audioContext.sampleRate),samples=buffer.getChannelData(0);let brown=0;
     for(let i=0;i<samples.length;i++){brown=(brown+Math.random()*.04-.02)/1.02;samples[i]=brown*3;}
     const noise=audioContext.createBufferSource(),filter=audioContext.createBiquadFilter();noise.buffer=buffer;noise.loop=true;filter.type='lowpass';filter.frequency.value=1500;noise.connect(filter);filter.connect(audioGain);noise.start();audioNodes=[noise];
    }else{
     for(const freq of [110,164.81]){const osc=audioContext.createOscillator();osc.type='sine';osc.frequency.value=freq;osc.connect(audioGain);osc.start();audioNodes.push(osc);}
    }
    if(revision!==audioRevision)return;
    audioMode=data.sound;
   }
   audioGain.gain.setTargetAtTime(data.volume/100*(data.sound==='space'?.035:.4),audioContext.currentTime,.3);
   $('focusEnableAudio').hidden=true;$('focusAudioHint').textContent='环境音仅在专注进行时播放。';
  }catch(_){stopAudio();$('focusEnableAudio').hidden=false;$('focusAudioHint').textContent='声音暂不可用，计时仍可正常使用。';}
 }
 function history(){
  const today=new Date().toDateString(),records=data.history.filter(x=>new Date(x.endedAt).toDateString()===today);
  $('focusTodayMinutes').textContent=minutesText(records.reduce((sum,x)=>sum+x.elapsedMs,0));
  $('focusTodayCount').textContent=records.length+' 轮已保存';
  $('focusHistory').replaceChildren();
  if(!data.history.length){const p=document.createElement('p');p.className='focus-history-empty';p.textContent='还没有专注记录。第一轮，就从眼前这件事开始。';$('focusHistory').append(p);return;}
  for(const record of [...data.history].reverse()){
   const article=document.createElement('article');article.className='focus-record';
   const meta=document.createElement('div');meta.className='focus-record-meta';meta.textContent=dateText(record.endedAt)+' · '+minutesText(record.elapsedMs)+' · '+(record.completed?'计时完成':'提前结束');
   const title=document.createElement('h3');title.textContent=record.title;
   article.append(meta,title);
   if(record.note){const note=document.createElement('p');note.textContent=record.note;article.append(note);}
   $('focusHistory').append(article);
  }
 }
 function renderClock(){
  const s=data.session,remaining=s?C.remaining(s,Date.now()):Math.max(1,Math.min(180,Number($('focusMinutes').value)||25))*60000;
  $('focusClock').textContent=clock(remaining);$('focusClock').setAttribute('aria-label','剩余 '+clock(remaining));
  $('focusProgress').style.strokeDashoffset=String(s?100*(1-remaining/s.totalMs):0);
  $('focusNavStatus').textContent=s?(s.status==='running'?clock(remaining):s.status==='paused'?'已暂停':'待记录'):'';
  document.title=s?.status==='running'?clock(remaining)+' · 专注舱':baseTitle;
 }
 function paint(){
  const s=data.session,status=s?.status||'idle';$('focusView').dataset.state=status;
  $('focusFullscreen').disabled=!s;$('focusFullscreen').title=s?'进入或退出沉浸全屏':'开始专注后可进入全屏';
  if(!s&&document.fullscreenElement===$('focusView'))document.exitFullscreen().catch(()=>{});
  $('focusMode').textContent={idle:'准备就绪',running:'专注进行中',paused:'已暂停',review:'本轮已结束'}[status];
  $('focusTarget').textContent=s?.title||'选定一件事，然后开始。';
  $('focusClockHint').textContent={idle:'等待开始',running:'专注进行中',paused:'已暂停，可继续',review:s?.completed?'本轮已完成':'已留下 '+minutesText(s?s.totalMs-s.remainingMs:0)+' 的投入'}[status];
  $('focusSetup').disabled=!!s;
  $('focusStart').hidden=status!=='idle';$('focusPause').hidden=!['running','paused'].includes(status);
  $('focusPause').textContent=status==='paused'?'继续专注':'暂停';$('focusFinish').hidden=!['running','paused'].includes(status);
  $('focusReview').hidden=status!=='review';$('focusReturn').hidden=status!=='review'||s?.completed;
  $('focusNote').value=s?.note||'';
  $('focusSync').disabled=!s?.taskId||!tasks().some(t=>t.id===s.taskId);
  $('focusSound').value=data.sound;$('focusVolume').value=data.volume;$('focusVolumeLabel').textContent=data.volume+'%';
  renderClock();history();syncAudio();
 }
 function transition(fn){const next={...data,session:fn(data.session)};if(commit(next)){paint();return true;}return false;}
 $('focusTask').addEventListener('change',()=>{const task=tasks().find(x=>x.id===$('focusTask').value);$('focusIntent').value=task?.text||'';});
 for(const button of document.querySelectorAll('[data-minutes]'))button.addEventListener('click',()=>{$('focusMinutes').value=button.dataset.minutes;presets();renderClock();});
 function presets(){for(const b of document.querySelectorAll('[data-minutes]'))b.setAttribute('aria-pressed',String(Number(b.dataset.minutes)===Number($('focusMinutes').value)));}
 $('focusMinutes').addEventListener('input',()=>{presets();renderClock();});
 $('focusStart').addEventListener('click',()=>{
  if(data.session)return;
  try{
   const task=tasks().find(x=>x.id===$('focusTask').value);
   const title=$('focusIntent').value.trim()||task?.text;
   if(!title){
    const hint='请在左侧先选择/填入要做的事';
    if(typeof toast==='function')toast(hint);
    else message(hint);
    return;
   }
   const session=C.start({id:globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),minutes:Number($('focusMinutes').value),taskId:task?.id||'',title},Date.now());
   if(commit({...data,session})){message('专注已开始，切换模块也会继续计时。');paint();syncAudio(true);}
  }catch(e){message(e.message);}
 });
 $('focusPause').addEventListener('click',()=>{if(!data.session)return;const paused=data.session.status==='paused';if(transition(s=>paused?C.resume(s,Date.now()):C.pause(s,Date.now()))&&paused)syncAudio(true);});
 $('focusFinish').addEventListener('click',()=>{if(data.session)transition(s=>C.finish(s,Date.now()));});
 $('focusReturn').addEventListener('click',()=>{if(data.session?.status==='review'&&!data.session.completed&&transition(s=>C.resume({...s,status:'paused',endedAt:undefined,completed:undefined},Date.now())))syncAudio(true);});
 $('focusNote').addEventListener('input',()=>{if(data.session?.status==='review')commit({...data,session:{...data.session,note:$('focusNote').value}});});
 $('focusDiscard').addEventListener('click',()=>{
  if(data.session?.status!=='review')return;
  if(!commit({...data,session:null}))return;
  taskOptions();paint();message('本轮已结束，未保存记录。');
 });
 $('focusSave').addEventListener('click',()=>{
  if(data.session?.status!=='review')return;
  const record=C.record(data.session,$('focusNote').value),sync=$('focusSync').checked&&!$('focusSync').disabled;
  const next={...data,session:null,history:[...data.history.filter(x=>x.id!==record.id),record].slice(-200)};
  if(!commit(next))return;
  let synced=false;
  if(sync&&record.note){
   try{const task=tasks().find(x=>x.id===record.taskId);if(task){const line='[专注 '+minutesText(record.elapsedMs)+' · '+dateText(record.endedAt)+'] '+record.note;if(!String(task.note||'').includes(line))task.note=(task.note?task.note+'\n':'')+line;save();render();synced=true;}}catch(_){}
  }
  taskOptions();paint();message(synced?'本轮已保存，进展已同步到任务备注。':'本轮已保存。给自己一点休息时间吧。');
 });
 $('focusSound').addEventListener('change',()=>{if(commit({...data,sound:$('focusSound').value}))syncAudio(true);else $('focusSound').value=data.sound;});
 $('focusVolume').addEventListener('input',()=>{const volume=Number($('focusVolume').value);if(commit({...data,volume})){$('focusVolumeLabel').textContent=volume+'%';syncAudio(true);}});
 $('focusEnableAudio').addEventListener('click',()=>syncAudio(true));
 $('focusGoGarden').addEventListener('click',()=>window.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{view:'garden'}})));
 $('focusFullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement===$('focusView'))await document.exitFullscreen();else if(data.session)await $('focusView').requestFullscreen();else message('先开始一轮专注，再进入全屏。');}catch(_){message('当前浏览器暂不支持全屏，可继续在这里专注。');}});
 document.addEventListener('fullscreenchange',()=>{$('focusFullscreen').textContent=document.fullscreenElement===$('focusView')?'⛶ 退出全屏':'⛶ 全屏专注';});
 function tick(){
  const settled=C.settle(data.session,Date.now());
  if(settled!==data.session){if(!commit({...data,session:settled}))data={...data,session:settled};paint();message('本轮计时结束，写一句进展再保存吧。');}
  else renderClock();
 }
 window.addEventListener('workspace:viewchange',e=>{if(e.detail.view==='focus'){tick();taskOptions();}});
 window.addEventListener('storage',e=>{if(e.key===KEY){try{data=C.restore(JSON.parse(e.newValue));paint();tick();}catch(_){message('另一窗口的专注状态无法读取。');}}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});
 window.addEventListener('pagehide',stopAudio);
 taskOptions();paint();tick();if(loadError)message('专注状态未能读取，已显示空白专注舱。');
 setInterval(tick,500);
})();
