/* Plain-text sticky notes. Persistence is isolated from tasks and inspiration assets. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NotesCore=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const FORMAT='quest-sticky-notes',COLORS=['paper','sage','sand','rose','lavender'],STATES=['active','hidden','trash'];
 const GROUPS={text:['title','text','versions'],layout:['x','y','w','h','z'],color:['color'],pin:['pinned'],state:['state','previousState'],idea:['group','libraryId','parentId']};
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),stamp=v=>Number.isSafeInteger(v)&&v>=0?v:0;
 const tick=(now,previous=0)=>Math.max(stamp(now)||Date.now(),previous+1);
 const safeId=v=>typeof v==='string'&&/^[\w-]{1,100}$/.test(v);
 const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)throw Error(label+'格式不正确或超过长度限制');return v;};
 function note(input){
  if(!input||typeof input!=='object'||!safeId(input.id))throw Error('便签编号无效');
  if(!STATES.includes(input.state)||!COLORS.includes(input.color))throw Error('便签状态或颜色无效');
  const updated=stamp(input.updatedAt),s=Object.fromEntries(Object.keys(GROUPS).map(k=>[k,stamp(input.stamps?.[k])||updated]));
  const versions=(input.versions||[]);if(!Array.isArray(versions)||versions.length>5)throw Error('历史版本格式不正确');
  return {id:input.id,title:text(input.title,120,'标题'),text:text(input.text,20000,'正文'),state:input.state,previousState:input.previousState==='hidden'?'hidden':'active',color:input.color,pinned:input.pinned===true,
   x:clamp(Number(input.x)||0,0,12000),y:clamp(Number(input.y)||0,0,12000),w:clamp(Number(input.w)||320,240,900),h:clamp(Number(input.h)||280,180,900),z:clamp(Number(input.z)||1,1,1000000),
   group:typeof input.group==='string'?input.group.trim().slice(0,60):'',libraryId:safeId(input.libraryId)?input.libraryId:'',parentId:safeId(input.parentId)?input.parentId:'',
   createdAt:stamp(input.createdAt)||updated,updatedAt:Math.max(updated,...Object.values(s)),stamps:s,
   versions:versions.map(v=>({title:text(v.title,120,'历史标题'),text:text(v.text,20000,'历史正文'),at:stamp(v.at),manual:v.manual===true}))};
 }
 function empty(){return {format:FORMAT,version:1,notes:[],tombstones:[]};}
 function state(input){
  if(!input||input.format!==FORMAT||input.version!==1||!Array.isArray(input.notes)||!Array.isArray(input.tombstones))throw Error('请选择由便签功能导出的 JSON 备份');
  if(input.notes.length>1000||input.tombstones.length>10000)throw Error('备份中的便签数量超过限制');
  const result=empty(),ids=new Set();
  result.notes=input.notes.map(n=>{const checked=note(n);if(ids.has(checked.id))throw Error('备份中存在重复便签编号');ids.add(checked.id);return checked;});
  result.tombstones=input.tombstones.map(t=>{if(!safeId(t?.id)||!stamp(t.updatedAt))throw Error('删除记录格式不正确');return {id:t.id,updatedAt:stamp(t.updatedAt)};});
  return result;
 }
 function parse(raw){if(typeof raw!=='string'||raw.length>12*1024*1024)throw Error('备份文件过大');let decoded;try{decoded=JSON.parse(raw);}catch{throw Error('文件不是有效的 JSON 便签备份');}return state(decoded);}
 function create(id,now,x=20,y=20,z=1){return note({id,title:'',text:'',state:'active',previousState:'active',color:'paper',pinned:false,x,y,w:320,h:280,z,createdAt:now,updatedAt:now,stamps:{},versions:[]});}
 function change(n,group,patch,now){
  if(!GROUPS[group])throw Error('无效的便签操作');
  const next={...n,stamps:{...n.stamps,[group]:tick(now,n.updatedAt)}};
  for(const key of GROUPS[group])if(Object.hasOwn(patch,key))next[key]=patch[key];
  next.updatedAt=next.stamps[group];return note(next);
 }
 const title=n=>n.title.trim()||n.text.split(/\r?\n/).find(s=>s.trim())?.trim().slice(0,36)||'无标题便签';
 function list(data,filter,query='',sort='recent'){
  const q=query.trim().toLocaleLowerCase();return data.notes.filter(n=>n.state===filter&&(!q||(n.title+'\n'+n.text).toLocaleLowerCase().includes(q))).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(sort==='title'?title(a).localeCompare(title(b),'zh-CN'):sort==='created'?b.createdAt-a.createdAt:b.stamps.text-a.stamps.text)||a.id.localeCompare(b.id));
 }
 function transition(n,to,now){return change(n,'state',{state:to,previousState:to==='trash'?n.state:n.previousState},now);}
 function checkpoint(n,previous,force=true){
  if(!previous||(!previous.title&&!previous.text)||(previous.title===n.title&&previous.text===n.text))return n;
  if(!force&&n.versions.length&&n.stamps.text-n.versions[0].at<120000)return n;
  const versions=[{title:previous.title,text:previous.text,at:previous.stamps.text},...n.versions];
  return {...n,versions:uniqueVersions(versions,n).slice(0,5)};
 }
 function uniqueVersions(versions,current){const seen=new Set();return versions.filter(v=>{const key=v.title+'\u0000'+v.text;if(seen.has(key)||current&&!v.manual&&(v.title===current.title&&v.text===current.text))return false;seen.add(key);return true;});}
 function merge(left,right){
  const a=state(left),b=state(right),deleted=new Map();
  for(const t of [...a.tombstones,...b.tombstones])if(!deleted.has(t.id)||deleted.get(t.id)<t.updatedAt)deleted.set(t.id,t.updatedAt);
  const notes=new Map(a.notes.map(n=>[n.id,n]));
  for(const incoming of b.notes){
   const current=notes.get(incoming.id);if(!current){notes.set(incoming.id,incoming);continue;}
   const next={...current,stamps:{...current.stamps},createdAt:Math.min(current.createdAt,incoming.createdAt)};
   for(const [group,keys] of Object.entries(GROUPS)){
    const oldClock=current.stamps[group],newClock=incoming.stamps[group];
    const tie=newClock===oldClock&&JSON.stringify(keys.map(k=>incoming[k]))>JSON.stringify(keys.map(k=>current[k]));
    if(newClock>oldClock||tie){for(const k of keys)next[k]=incoming[k];next.stamps[group]=newClock;}
   }
   next.updatedAt=Math.max(current.updatedAt,incoming.updatedAt,...Object.values(next.stamps));
   next.versions=uniqueVersions([...current.versions,...incoming.versions].sort((x,y)=>y.at-x.at),next).slice(0,5);notes.set(next.id,note(next));
  }
  return {...empty(),notes:[...notes.values()].filter(n=>!deleted.has(n.id)),tombstones:[...deleted].map(([id,updatedAt])=>({id,updatedAt}))};
 }
 // Preserve simultaneous edits to the same text as a separate visible copy.
 function reconcile(local,remote,baseline,uid,now){
  const base=new Map(baseline.notes.map(n=>[n.id,n])),other=new Map(remote.notes.map(n=>[n.id,n])),copies=[],conflicts=new Set();
  for(const n of local.notes){
   const before=base.get(n.id),r=other.get(n.id),gone=remote.tombstones.find(t=>t.id===n.id);
   const changed=before&&n.stamps.text!==before.stamps.text;
   if(changed&&(gone||r&&r.stamps.text!==before.stamps.text&&(r.title!==n.title||r.text!==n.text))){
    const copy=create(uid(),tick(now,n.updatedAt),n.x+24,n.y+24,n.z+1);
    copies.push({...copy,title:(title(n)+'（编辑副本）').slice(0,120),text:n.text,color:n.color,versions:n.versions,group:n.group,libraryId:n.libraryId,parentId:n.parentId});conflicts.add(n.id);
   }
  }
  const prepared={...local,notes:local.notes.map(n=>{const r=other.get(n.id);return conflicts.has(n.id)&&r?{...n,title:r.title,text:r.text,versions:r.versions,stamps:{...n.stamps,text:r.stamps.text}}:n;})};
  const combined=merge(prepared,remote);combined.notes.push(...copies);return {data:state(combined),copies};
 }
 function purge(data,ids,now){
  const chosen=new Set(ids),removed=data.notes.filter(n=>chosen.has(n.id));
  return merge({...data,notes:data.notes.filter(n=>!chosen.has(n.id)),tombstones:[...data.tombstones,...removed.map(n=>({id:n.id,updatedAt:tick(now,n.updatedAt)}))]},empty());
 }
 function arrange(notes,width,now){
  const gap=28,available=Math.max(600,width);let x=gap,y=gap,rowHeight=0;
  return notes.map((n,i)=>{if(x>gap&&x+n.w+gap>available){x=gap;y+=rowHeight+gap;rowHeight=0;}const next=change(n,'layout',{x,y,z:i+1},now+i);x+=n.w+gap;rowHeight=Math.max(rowHeight,n.h);return next;});
 }
 return {FORMAT,COLORS,STATES,empty,note,state,parse,create,change,title,list,transition,checkpoint,merge,reconcile,purge,arrange};
});
