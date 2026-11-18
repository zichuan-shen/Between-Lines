(function(root,factory){const core=factory();if(typeof module==='object'&&module.exports)module.exports=core;else root.FocusCore=core;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 function remaining(s,now){return s.status==='running'?Math.max(0,Math.min(s.remainingMs,s.endAt-now)):s.remainingMs;}
 function start({id,minutes,taskId='',title},now){
  if(!Number.isInteger(minutes)||minutes<1||minutes>180)throw Error('请输入 1–180 的整数分钟');
  if(!String(title||'').trim())throw Error('先选择一条任务，或写下本次想做的事');
  const totalMs=minutes*60000;
  return {id,status:'running',totalMs,remainingMs:totalMs,endAt:now+totalMs,startedAt:now,taskId,title:String(title).trim().slice(0,120),note:''};
 }
 function pause(s,now){if(s.status!=='running')return s;const left=remaining(s,now);return left?{...s,status:'paused',remainingMs:left,endAt:null}:finish(s,now);}
 function resume(s,now){return s.status==='paused'?{...s,status:'running',endAt:now+s.remainingMs}:s;}
 function finish(s,now){if(!['running','paused'].includes(s.status))return s;const left=remaining(s,now);return {...s,status:'review',remainingMs:left,endAt:null,endedAt:left?now:s.endAt,completed:left===0};}
 function settle(s,now){return s?.status==='running'&&remaining(s,now)===0?finish(s,now):s;}
 function restore(raw){
  if(!raw||typeof raw!=='object')return {session:null,history:[],sound:'mute',volume:20};
  const valid=s=>s&&typeof s.id==='string'&&typeof s.title==='string'&&Number.isFinite(s.totalMs)&&s.totalMs>0&&s.totalMs<=10800000&&Number.isFinite(s.remainingMs)&&s.remainingMs>=0&&s.remainingMs<=s.totalMs&&Number.isFinite(s.startedAt)&&['running','paused','review'].includes(s.status)&&(s.status!=='running'||Number.isFinite(s.endAt))&&(s.status!=='review'||Number.isFinite(s.endedAt));
  const session=valid(raw.session)?{...raw.session,note:typeof raw.session.note==='string'?raw.session.note.slice(0,1000):''}:null;
  const seen=new Set();
  const history=Array.isArray(raw.history)?raw.history.filter(x=>x&&typeof x.id==='string'&&!seen.has(x.id)&&seen.add(x.id)&&typeof x.title==='string'&&Number.isFinite(x.elapsedMs)&&x.elapsedMs>=0&&x.elapsedMs<=10800000&&Number.isFinite(x.endedAt)).slice(-200):[];
  return {session,history,sound:['mute','rain','space'].includes(raw.sound)?raw.sound:'mute',volume:Number.isFinite(raw.volume)?Math.min(50,Math.max(0,raw.volume)):20};
 }
 function record(s,note){if(s.status!=='review')throw Error('本轮尚未结束');return {id:s.id,taskId:s.taskId,title:s.title,startedAt:s.startedAt,endedAt:s.endedAt,elapsedMs:s.totalMs-s.remainingMs,plannedMs:s.totalMs,completed:s.completed,note:String(note||'').trim().slice(0,1000)};}
 return {remaining,start,pause,resume,finish,settle,restore,record};
});
