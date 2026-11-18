/* Sticky-note workspace: stable editors, debounced persistence, reversible lifecycle. */
(()=>{
 'use strict';
 const C=NotesCore,KEY='gpdQuestLog.notes.v1',$=id=>document.getElementById(id),view=$('notesView'),board=$('notesBoard'),viewport=$('notesViewport');
 const uid=()=>crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2),mobile=matchMedia('(max-width: 760px)');
 const colorNames={paper:'原纸',sage:'鼠尾草',sand:'麦芽',rose:'浅玫瑰',lavender:'雾紫'};
 let data=C.empty(),baseline=C.empty(),selected='',filter='active',query='',sort='recent',dirty=false,timer=0,undoTimer=0,undo=null,corrupt=false,rawSource='',menuId='',historyId='',busy=false,gesture=null;
 const cards=new Map();let zoom=1,pan=null,arrangeUndo=null,groupTarget='',listClosed=false;const groupFrames=[];
 const clone=v=>JSON.parse(JSON.stringify(v)),get=id=>data.notes.find(n=>n.id===id),now=()=>Date.now(),active=()=>document.documentElement.dataset.view==='notes';
 const say=text=>{$('notesMessage').textContent=text;};
 function status(text,error=false){$('notesSaveState').textContent=text;$('notesSaveState').dataset.error=String(error);$('notesRetry').hidden=!error||corrupt;}
 function counts(){for(const state of C.STATES)$('notesCount-'+state).textContent=data.notes.filter(n=>n.state===state).length;}
 function read(){const raw=localStorage.getItem(KEY);return raw?C.parse(raw):C.empty();}
 function snapshot(){data.notes=data.notes.map(n=>C.checkpoint(n,baseline.notes.find(b=>b.id===n.id),false));}
 function save(){
  clearTimeout(timer);timer=0;if(!dirty||corrupt)return !corrupt;
  try{
   const remote=read();snapshot();const result=C.reconcile(data,remote,baseline,uid,now());
   data=result.data;const encoded=JSON.stringify(data);localStorage.setItem(KEY,encoded);
   baseline=clone(data);dirty=false;status('已保存至本浏览器');
   if(result.copies.length){selected=result.copies[0].id;filter='active';query='';$('notesSearch').value='';say('检测到另一窗口同时编辑，已保留一份编辑副本。');render();if(active())cards.get(selected)?.body.focus({preventScroll:true});}
   else if(active()&&!gesture)render();return true;
  }catch(e){status('保存失败 · 内容仍在当前页面，请重试或导出备份',true);return false;}
 }
 function schedule(){dirty=true;status('正在保存…');clearTimeout(timer);timer=setTimeout(save,500);}
 function change(id,group,patch,immediate=false){const n=get(id);if(!n||corrupt)return;try{const next=C.change(n,group,patch,now());data.notes=data.notes.map(x=>x.id===id?next:x);schedule();if(immediate)save();}catch(e){say(e.message);}}
 function emptyState(){
  const total=data.notes.filter(n=>n.state===filter).length,matched=C.list(data,filter,query,sort).length;
  $('notesEmpty').hidden=matched>0;$('notesEmptyNew').hidden=filter!=='active'||!!query||corrupt;
  $('notesEmptyTitle').textContent=query?'没有找到这张便签':filter==='trash'?'回收站是空的':filter==='hidden'?'没有隐藏的便签':'留一张纸，接住随手的想法。';
  $('notesEmptyCopy').textContent=query?'试试标题或正文中的其他关键词。':filter==='trash'?'删除的便签会留在这里，直到你手动彻底删除。':filter==='hidden'?'隐藏后会从便签板收起，需要时可以重新显示。':'新建便签后，可拖动顶栏调整位置，拉动右下角调整大小。';
  $('notesListCount').textContent=query?matched+' / '+total+' 张':total+' 张便签';
  $('notesBoardHint').textContent=filter==='active'?(mobile.matches?'点击列表，切换便签':'拖动空白处漫游 · 滚轮浏览 · Ctrl + 滚轮缩放'):filter==='hidden'?'已隐藏 · 内容保留，可重新显示':'回收站 · 手动清理前可还原';
  $('notesCanvasControls').hidden=mobile.matches||filter!=='active';$('notesArrange').hidden=filter!=='active';$('notesArrange').disabled=!matched||corrupt;
  $('notesRestore').hidden=filter==='active';$('notesRestore').disabled=!get(selected)||corrupt;$('notesRestore').textContent=filter==='hidden'?'重新显示':'还原便签';
  $('notesEmptyTrash').hidden=filter!=='trash';$('notesEmptyTrash').disabled=!total||corrupt;
 }
 function renderList(notes){
  $('notesList').replaceChildren();
  if(!notes.length){const p=document.createElement('p');p.className='notes-list-empty';p.textContent=query?'没有匹配的便签':'这里还没有便签';$('notesList').append(p);return;}
  for(const n of notes){
   const b=document.createElement('button');b.type='button';b.className='notes-list-item'+(n.id===selected?' is-selected':'');b.dataset.color=n.color;b.setAttribute('aria-pressed',String(n.id===selected));
   const h=document.createElement('div');h.className='notes-list-title';const dot=document.createElement('i');dot.className='notes-list-dot';const title=document.createElement('b');title.textContent=C.title(n);h.append(dot,title);
   const p=document.createElement('p');p.textContent=n.text.replace(/\s+/g,' ').slice(0,100)||'还没有写内容';const meta=document.createElement('div');meta.className='notes-list-meta';
   const date=document.createElement('span');date.textContent=new Date(n.stamps.text).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'});const flag=document.createElement('span');flag.textContent=[n.group,n.pinned?'置顶':''].filter(Boolean).join(' · ');meta.append(date,flag);b.append(h,p,meta);
   b.onclick=()=>{select(n.id,true);};$('notesList').append(b);
  }
 }
 function select(id,bring=false){
  selected=id;const n=get(id);if(bring&&n?.state==='active'&&!mobile.matches)raise(n);render();if(bring)cards.get(id)?.body.focus({preventScroll:true});
  if(n&&n.state==='active'&&!mobile.matches){const card=cards.get(id)?.el;card?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});}
 }
 function raise(n){
  let top=Math.max(1,...data.notes.filter(n=>n.state==='active').map(n=>n.z));
  if(n.z===top)return;
  if(top>=999999){data.notes.filter(n=>n.state==='active').sort((a,b)=>a.z-b.z).forEach((n,i)=>{data.notes=data.notes.map(x=>x.id===n.id?C.change(n,'layout',{z:i+1},now()):x);});top=data.notes.length;}
  change(n.id,'layout',{z:top+1});
 }
 function place(n){return {x:n.x,y:n.y,w:n.w,h:n.h};}
 function drawGroups(){
  for(const f of groupFrames)f.remove();groupFrames.length=0;if(mobile.matches||filter!=='active')return;
  const groups=new Map();for(const n of C.list(data,filter,query,sort)){if(!n.group)continue;if(!groups.has(n.group))groups.set(n.group,[]);groups.get(n.group).push(n);}
  for(const [name,items] of groups){const x=Math.max(0,Math.min(...items.map(n=>n.x))-14),y=Math.max(0,Math.min(...items.map(n=>n.y))-30),right=Math.max(...items.map(n=>n.x+n.w))+14,bottom=Math.max(...items.map(n=>n.y+n.h))+14;
   const frame=document.createElement('div');frame.className='note-group-frame';Object.assign(frame.style,{left:x+'px',top:y+'px',width:(right-x)+'px',height:(bottom-y)+'px'});const label=document.createElement('span');label.textContent=name;frame.append(label);board.append(frame);groupFrames.push(frame);
  }
 }
 function layout(){
  if(mobile.matches){board.style.height='auto';board.style.width='100%';board.style.zoom='1';drawGroups();return;}
  let bottom=filter==='active'?Math.max(1500,(viewport.clientHeight||500)/zoom):viewport.clientHeight||500,right=filter==='active'?Math.max(2200,(viewport.clientWidth||900)/zoom):viewport.clientWidth||900;
  for(const item of cards.values()){const n=get(item.id);if(!n)continue;const p=filter==='active'?place(n):{x:20,y:20,w:Math.min(560,(viewport.clientWidth||800)-40),h:Math.max(360,(viewport.clientHeight||500)-40)};Object.assign(item.el.style,{left:p.x+'px',top:p.y+'px',width:p.w+'px',height:p.h+'px',zIndex:String(n.z)});if(!item.el.hidden){bottom=Math.max(bottom,p.y+p.h+140);right=Math.max(right,p.x+p.w+140);}}
  board.style.height=bottom+'px';board.style.width=right+'px';board.style.zoom=String(filter==='active'?zoom:1);drawGroups();$('notesZoomReset').textContent=Math.round(zoom*100)+'%';
 }
 function setZoom(value){if(mobile.matches||filter!=='active')return;endGesture();const old=zoom,cx=((viewport.scrollLeft||0)+viewport.clientWidth/2)/old,cy=((viewport.scrollTop||0)+viewport.clientHeight/2)/old;zoom=Math.max(.02,Math.min(1.6,value));layout();viewport.scrollLeft=Math.max(0,cx*zoom-viewport.clientWidth/2);viewport.scrollTop=Math.max(0,cy*zoom-viewport.clientHeight/2);}
 function fit(){const items=C.list(data,filter,query,sort);if(!items.length)return;const left=Math.min(...items.map(n=>n.x)),top=Math.min(...items.map(n=>n.y)),right=Math.max(...items.map(n=>n.x+n.w)),bottom=Math.max(...items.map(n=>n.y+n.h));setZoom(Math.min(1,(viewport.clientWidth-90)/(right-left+60),(viewport.clientHeight-100)/(bottom-top+60)));viewport.scrollLeft=Math.max(0,left*zoom-35);viewport.scrollTop=Math.max(0,top*zoom-45);}
 function makeCard(n){
  const el=document.createElement('article');el.className='note-card';el.dataset.noteId=n.id;
  const header=document.createElement('div');header.className='note-header';
  const grip=document.createElement('button');grip.type='button';grip.className='note-grip';grip.setAttribute('aria-label','移动便签，方向键移动，Shift 加速');grip.title='拖动移动 · 方向键移动 · Shift 加速';const dots=document.createElement('i');dots.textContent='⠿';dots.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent='NOTE';grip.append(dots,label);
  const pin=document.createElement('span');pin.className='note-pin';pin.textContent='置顶';
  const more=document.createElement('button');more.type='button';more.className='note-menu-button';more.textContent='···';more.setAttribute('aria-label','便签操作');more.setAttribute('aria-haspopup','menu');more.onclick=event=>{event.stopPropagation();selected=n.id;render();openMenu(n.id,more);};header.append(grip,pin,more);
  const title=document.createElement('input');title.type='text';title.className='note-title';title.maxLength=120;title.placeholder='标题（可留空）';title.setAttribute('aria-label','便签标题');
  const body=document.createElement('textarea');body.className='note-text';body.maxLength=20000;body.placeholder='记点什么…';body.spellcheck=false;body.setAttribute('aria-label','便签正文');
  const footer=document.createElement('div');footer.className='note-footer';const count=document.createElement('span');const resize=document.createElement('button');resize.type='button';resize.className='note-resize';resize.textContent='⌟';resize.title='拉动缩放 · 方向键调整 · Shift 加速';resize.setAttribute('aria-label','调整便签大小，方向键调整，Shift 加速');footer.append(count,resize);el.append(header,title,body,footer);
  const onInput=()=>{change(n.id,'text',{title:title.value,text:body.value});count.textContent=body.value.length.toLocaleString()+' / 20,000';clearTimeout(renderList.timer);renderList.timer=setTimeout(()=>{counts();renderList(C.list(data,filter,query,sort));},200);};
  title.addEventListener('input',onInput);body.addEventListener('input',onInput);
  el.addEventListener('pointerdown',()=>{const current=get(n.id);if(!current)return;const changed=selected!==n.id;selected=n.id;if(current.state==='active'&&!mobile.matches)raise(current);if(changed){for(const item of cards.values())item.el.classList.toggle('is-selected',item.id===selected);renderList(C.list(data,filter,query,sort));}layout();});
  for(const [handle,mode] of [[grip,'move'],[resize,'resize']]){
   handle.addEventListener('pointerdown',event=>startGesture(event,n.id,mode,handle));
   handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||mobile.matches||get(n.id)?.state!=='active')return;event.preventDefault();const current=get(n.id),p=place(current),step=event.shiftKey?50:10,dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0,dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
    change(n.id,'layout',mode==='move'?{x:Math.max(0,p.x+dx),y:Math.max(0,p.y+dy)}:{w:Math.max(240,p.w+dx),h:Math.max(180,p.h+dy)});layout();});
  }
  const reference=document.createElement('button');reference.type='button';reference.className='note-reference';reference.hidden=true;reference.onclick=()=>{const current=get(n.id);if(current?.libraryId)window.CreativeLibrary?.reveal(current.libraryId).catch(e=>say(e.message));else if(current?.parentId){if(!window.CreativeNotes.reveal(current.parentId))say('原便签已不在当前素材中。');}};el.append(reference);board.append(el);return {id:n.id,el,title,body,pin,count,grip,more,reference};
 }
 function render(){
  counts();const notes=C.list(data,filter,query,sort);if(!notes.some(n=>n.id===selected))selected=notes[0]?.id||'';
  for(const state of C.STATES)$('notesTab-'+state).setAttribute('aria-pressed',String(filter===state));
  const visible=new Set(notes.map(n=>n.id));for(const [id,item] of cards)if(!visible.has(id)){item.el.remove();cards.delete(id);}
  for(const n of notes){
   let item=cards.get(n.id);if(!item){item=makeCard(n);cards.set(n.id,item);}
   item.el.dataset.color=n.color;item.el.classList.toggle('is-selected',n.id===selected);item.el.classList.toggle('note-readonly',n.state!=='active');
   if(item.title.value!==n.title)item.title.value=n.title;if(item.body.value!==n.text)item.body.value=n.text;
   item.title.readOnly=item.body.readOnly=n.state!=='active'||corrupt;item.pin.hidden=!n.pinned;item.count.textContent=n.text.length.toLocaleString()+' / 20,000';item.grip.disabled=n.state!=='active'||corrupt;
   item.el.setAttribute('aria-label',C.title(n));item.reference.hidden=!(n.libraryId||n.parentId);item.reference.textContent=n.libraryId?'↗ 查看灵感原素材':'⑂ 回到分叉起点';
  }
  if(filter!=='active'&&!mobile.matches){for(const item of cards.values())item.el.hidden=item.id!==selected;}else for(const item of cards.values())item.el.hidden=false;
  renderList(notes);emptyState();layout();$('notesNew').disabled=corrupt||data.notes.length>=1000;
 }
 function add(){
  if(corrupt||busy)return;if(data.notes.length>=1000){say('已达到 1000 张便签上限，可先备份并清理回收站。');return;}
  filter='active';query='';$('notesSearch').value='';const width=viewport.clientWidth||800,offset=data.notes.filter(n=>n.state==='active').length%7*24;
  const n=C.create(uid(),now(),20+offset+(viewport.scrollLeft||0)/zoom,20+offset+(viewport.scrollTop||0)/zoom,Math.max(0,...data.notes.map(n=>n.z))+1);data.notes.push(n);selected=n.id;schedule();render();cards.get(n.id)?.body.focus({preventScroll:true});say('新便签已创建。');
 }
 function startGesture(event,id,mode,handle){
  const n=get(id);if(gesture||mobile.matches||corrupt||n?.state!=='active'||event.button!==0)return;event.preventDefault();event.stopPropagation();closeMenu();selected=id;raise(n);renderList(C.list(data,filter,query,sort));
  for(const item of cards.values())item.el.classList.toggle('is-selected',item.id===id);layout();const p=place(get(id));gesture={id,mode,handle,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,scroll:viewport.scrollTop,scrollX:viewport.scrollLeft||0,p,frame:0};handle.setPointerCapture?.(event.pointerId);cards.get(id).el.classList.add('is-dragging');
 }
 function moveGesture(event){
  const g=gesture;if(!g||event.pointerId!==g.pointerId)return;event.preventDefault();
  g.clientX=event.clientX;
  g.clientY=event.clientY;
  if(!g.frame)g.frame=requestAnimationFrame(()=>{g.frame=0;previewGesture(g);});
 }
 function gesturePosition(g){
  if(g.clientX===undefined)return g.p;
  const dx=(g.clientX-g.startX+(viewport.scrollLeft||0)-g.scrollX)/zoom;
  const dy=(g.clientY-g.startY+viewport.scrollTop-g.scroll)/zoom;
  const p=g.p;
  if(g.mode==='move')return {...p,x:Math.max(16,Math.min(12000,p.x+dx)),y:Math.max(0,Math.min(12000,p.y+dy))};
  return {...p,w:Math.max(240,Math.min(900,p.w+dx)),h:Math.max(180,Math.min(900,p.h+dy))};
 }
 function previewGesture(g){
  const card=cards.get(g.id)?.el;
  if(!card)return;
  const p=gesturePosition(g);
  if(g.mode==='move')card.style.translate=(p.x-g.p.x)+'px '+(p.y-g.p.y)+'px';
  else {card.style.width=p.w+'px';card.style.height=p.h+'px';}
  const right=p.x+p.w+140,bottom=p.y+p.h+140;
  if(right>parseFloat(board.style.width))board.style.width=right+'px';
  if(bottom>parseFloat(board.style.height))board.style.height=bottom+'px';
 }
 function endGesture(event){
  const g=gesture;if(!g||event&&event.pointerId!==g.pointerId)return;gesture=null;try{g.handle.releasePointerCapture?.(g.pointerId);}catch{}cards.get(g.id)?.el.classList.remove('is-dragging');
  if(g.frame)cancelAnimationFrame(g.frame);
  if(event?.type==='pointerup'){g.clientX=event.clientX;g.clientY=event.clientY;}
  const p=gesturePosition(g),card=cards.get(g.id)?.el;
  if(card)card.style.translate='';
  change(g.id,'layout',p);layout();
 }
 function closeMenu(){if(menuId)cards.get(menuId)?.more.setAttribute('aria-expanded','false');menuId='';$('notesMenu').hidden=true;}
 function openMenu(id,anchor){
  closeMenu();menuId=id;const n=get(id),menu=$('notesMenu');anchor.setAttribute('aria-expanded','true');
  $('notesMenuPin').textContent=n.pinned?'取消列表置顶':'在列表置顶';$('notesMenuHide').textContent=n.state==='hidden'?'重新显示':'隐藏便签';$('notesMenuHide').hidden=n.state==='trash';
  $('notesMenuCollect').textContent=n.libraryId?'查看已关联的灵感 ↗':'收进灵感馆 ↗';$('notesMenuDelete').textContent=n.state==='trash'?'彻底删除…':'移入回收站';$('notesMenuHistory').disabled=!n.versions.length;for(const id of ['notesMenuFork','notesMenuGroup','notesMenuCollect','notesMenuSnapshot'])$(id).disabled=n.state!=='active'||corrupt;
  for(const b of $('notesColors').children)b.setAttribute('aria-pressed',String(b.dataset.color===n.color));
  menu.hidden=false;const rect=anchor.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(window.innerWidth-202,rect.right-190))+'px';menu.style.top=Math.max(8,Math.min(window.innerHeight-menu.offsetHeight-8,rect.bottom+5))+'px';$('notesMenuPin').focus();
 }
 function setUndo(n,previous){
  clearTimeout(undoTimer);undo={id:n.id,previous};$('notesUndo').hidden=false;undoTimer=setTimeout(()=>{undo=null;$('notesUndo').hidden=true;},10000);
 }
 function transition(id,to){
  const n=get(id);if(!n||corrupt)return;data.notes=data.notes.map(x=>x.id===id?C.transition(n,to,now()):x);setUndo(n,n.state);schedule();closeMenu();render();say(to==='hidden'?'便签已收起，可在“隐藏”中重新显示。':'已移入回收站，可以撤销。');
 }
 function restore(id){
  const n=get(id);if(!n||corrupt)return;const to=n.state==='trash'?n.previousState:'active';data.notes=data.notes.map(x=>x.id===id?C.transition(n,to,now()):x);filter=to;query='';$('notesSearch').value='';selected=id;schedule();closeMenu();render();say(to==='hidden'?'已还原到隐藏列表。':'便签已重新显示。');
 }
 function purge(ids){
  if(corrupt||!ids.length)return;const label=ids.length===1?'“'+C.title(get(ids[0]))+'”':ids.length+' 张便签';
  if(!confirm('彻底删除'+label+'？此操作无法撤销，保存的历史版本也会删除。'))return;
  data=C.purge(data,ids,now());undo=null;$('notesUndo').hidden=true;schedule();closeMenu();render();say('已彻底删除。');
 }
 function download(content,name,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 function exportAll(){
  if(corrupt){download(rawSource||'','便签-原始数据-'+now()+'.txt','text/plain');say('原始数据已发起下载，请保留以便恢复。');return;}
  save();snapshot();download(JSON.stringify({...data,exportedAt:now()},null,2),'便签备份-'+new Date().toISOString().slice(0,10)+'.json');say('已发起完整备份下载，包含隐藏、回收站和最近历史版本。');
 }
 async function importFile(file){
  if(!file||busy)return;if(file.size>24*1024*1024){say('请选择 24 MB 以内的便签备份。');return;}busy=true;$('notesImport').disabled=true;
  try{
   const incoming=C.parse(await file.text());const preview=C.merge(corrupt?C.empty():data,incoming);
   if(!confirm('导入 '+incoming.notes.length+' 张便签，与当前内容合并，同一便签分别保留较新的正文、位置和状态。'+(corrupt?'当前损坏的数据将被替换，请先下载原始数据。':'')+'是否继续？'))return;
   if(corrupt){data=preview;baseline=C.empty();localStorage.setItem(KEY,JSON.stringify(data));corrupt=false;rawSource='';baseline=clone(data);dirty=false;status('已保存至本浏览器');}
   else{data=preview;dirty=true;if(!save())throw Error('导入内容保留在当前页面，但未能保存；请重试或导出备份。');}
   filter='active';query='';$('notesSearch').value='';closeMenu();render();say('导入完成 · 当前共 '+data.notes.length+' 张便签。');
  }catch(e){say('导入未完成：'+(e.message||'文件无法读取'));render();}finally{busy=false;$('notesImport').disabled=false;$('notesImportFile').value='';}
 }
 function history(id){
  const n=get(id);if(!n)return;historyId=id;$('notesVersionSelect').replaceChildren();
  n.versions.forEach((v,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=new Date(v.at).toLocaleString('zh-CN');$('notesVersionSelect').append(option);});
  showVersion();$('notesVersionRestore').disabled=!n.versions.length||corrupt;closeMenu();$('notesHistoryDialog').showModal();
 }
 function showVersion(){const v=get(historyId)?.versions[Number($('notesVersionSelect').value)||0];$('notesVersionText').value=v?((v.title?v.title+'\n\n':'')+v.text):'暂无历史版本';}
 $('notesNew').onclick=add;$('notesEmptyNew').onclick=add;$('notesRetry').onclick=save;$('notesExport').onclick=exportAll;
 $('notesImport').onclick=()=>{$('notesImportFile').click();};$('notesImportFile').onchange=()=>importFile($('notesImportFile').files[0]);
 $('notesSearch').addEventListener('input',()=>{query=$('notesSearch').value;render();});$('notesSort').onchange=()=>{sort=$('notesSort').value;render();};
 for(const state of C.STATES)$('notesTab-'+state).onclick=()=>{endGesture();save();filter=state;selected='';closeMenu();render();viewport.scrollTop=0;};
 $('notesArrange').onclick=()=>{
  const notes=C.list(data,'active',query,sort);if(!notes.length)return;
  arrangeUndo=notes.map(n=>({id:n.id,x:n.x,y:n.y,w:n.w,h:n.h,z:n.z}));
  const arranged=new Map(C.arrange(notes,Math.max(900,viewport.clientWidth/zoom||900),now()).map(n=>[n.id,n]));data.notes=data.notes.map(n=>arranged.get(n.id)||n);schedule();render();fit();$('notesArrangeUndo').hidden=false;say('已整理位置，保留每张便签的尺寸。');
 };
 $('notesArrangeUndo').onclick=()=>{if(!arrangeUndo)return;for(const p of arrangeUndo)if(get(p.id)?.state==='active')change(p.id,'layout',p);arrangeUndo=null;$('notesArrangeUndo').hidden=true;render();fit();say('已恢复排列前的位置和尺寸。');};
 $('notesToggleList').onclick=()=>{listClosed=!listClosed;$('notesShell').classList.toggle('list-closed',listClosed);$('notesToggleList').textContent=listClosed?'展开列表':'收起列表';$('notesToggleList').setAttribute('aria-expanded',String(!listClosed));layout();};
 $('notesZoomIn').onclick=()=>setZoom(zoom+.1);$('notesZoomOut').onclick=()=>setZoom(zoom-.1);$('notesZoomReset').onclick=()=>setZoom(1);$('notesFit').onclick=fit;$('notesLocate').onclick=()=>{if(selected)select(selected,true);};
 viewport.addEventListener('wheel',e=>{if((e.ctrlKey||e.metaKey)&&!mobile.matches&&filter==='active'){e.preventDefault();setZoom(zoom+(e.deltaY<0?.1:-.1));}},{passive:false});
 viewport.addEventListener('pointerdown',e=>{if(mobile.matches||filter!=='active'||e.button!==0||!(e.target===viewport||e.target===board))return;e.preventDefault();pan={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft||0,top:viewport.scrollTop||0};viewport.setPointerCapture?.(e.pointerId);viewport.classList.add('is-panning');});
 viewport.addEventListener('pointermove',e=>{if(pan&&pan.id===e.pointerId){viewport.scrollLeft=pan.left+pan.x-e.clientX;viewport.scrollTop=pan.top+pan.y-e.clientY;}});
 const stopPan=()=>{if(pan){try{viewport.releasePointerCapture?.(pan.id);}catch{}pan=null;viewport.classList.remove('is-panning');}};
 viewport.addEventListener('pointerup',stopPan);viewport.addEventListener('pointercancel',stopPan);
 $('notesRestore').onclick=()=>restore(selected);$('notesEmptyTrash').onclick=()=>purge(data.notes.filter(n=>n.state==='trash').map(n=>n.id));
 $('notesUndo').onclick=()=>{const n=get(undo?.id);if(!n||!undo)return;const previous=undo.previous;data.notes=data.notes.map(x=>x.id===n.id?C.transition(n,previous,now()):x);filter=previous;selected=n.id;undo=null;clearTimeout(undoTimer);$('notesUndo').hidden=true;schedule();render();say('已撤销。');};
 $('notesMenuPin').onclick=()=>{const n=get(menuId);if(n){change(n.id,'pin',{pinned:!n.pinned});closeMenu();render();}};
 $('notesMenuHide').onclick=()=>{const n=get(menuId);if(n?.state==='hidden')restore(n.id);else if(n)transition(n.id,'hidden');};
 $('notesMenuDelete').onclick=()=>{const n=get(menuId);if(n?.state==='trash')purge([n.id]);else if(n)transition(n.id,'trash');};
 $('notesMenuFork').onclick=()=>{
  const n=get(menuId);if(!n||n.state!=='active'||corrupt||data.notes.length>=1000)return;
  const copy=C.note({...C.create(uid(),now(),Math.min(12000,n.x+n.w+40),n.y,n.z+1),title:n.title,text:n.text,w:n.w,h:n.h,color:n.color,group:n.group,parentId:n.id,libraryId:n.libraryId});data.notes.push(copy);selected=copy.id;query='';$('notesSearch').value='';schedule();closeMenu();render();select(copy.id,true);say('新分支已展开，原稿保持完整。');
 };
 $('notesMenuGroup').onclick=()=>{const n=get(menuId);if(!n)return;groupTarget=n.id;$('notesGroupName').value=n.group;$('notesGroupOptions').replaceChildren();for(const name of new Set(data.notes.map(n=>n.group).filter(Boolean))){const option=document.createElement('option');option.value=name;$('notesGroupOptions').append(option);}closeMenu();$('notesGroupDialog').showModal();$('notesGroupName').focus();};
 $('notesGroupClose').onclick=()=>$('notesGroupDialog').close();$('notesGroupForm').addEventListener('submit',e=>{e.preventDefault();change(groupTarget,'idea',{group:$('notesGroupName').value});$('notesGroupDialog').close();render();});
 $('notesMenuSnapshot').onclick=()=>{const n=get(menuId);if(!n||(!n.title&&!n.text))return;const versions=[{title:n.title,text:n.text,at:now(),manual:true},...n.versions.filter(v=>v.title!==n.title||v.text!==n.text)].slice(0,5);change(n.id,'text',{versions},true);closeMenu();say('已留一版当前内容，可从历史版本恢复。');};
 $('notesMenuCollect').onclick=async()=>{const n=get(menuId);if(!n)return;closeMenu();try{if(!window.CreativeLibrary)throw Error('灵感馆尚未就绪。');if(n.libraryId){await window.CreativeLibrary.reveal(n.libraryId);return;}const id=await window.CreativeLibrary.collectNote(n);change(n.id,'idea',{libraryId:id},true);render();say('已收进灵感馆，原便签保留。');}catch(e){say(e.message);}};
 window.CreativeNotes={
  reveal(id){const n=get(id);if(!n)return false;filter=n.state;query='';$('notesSearch').value='';window.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{view:'notes'}}));selected=id;render();select(id,true);return true;},
  fromLibrary(c){if(corrupt||data.notes.length>=1000)throw Error('便签暂不可新增，请先恢复数据或清理空间。');const n=C.note({...C.create(uid(),now(),20+(viewport.scrollLeft||0)/zoom,20+(viewport.scrollTop||0)/zoom,Math.max(0,...data.notes.map(n=>n.z))+1),title:c.title,text:c.note,libraryId:c.id});data.notes.push(n);selected=n.id;filter='active';query='';$('notesSearch').value='';schedule();window.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{view:'notes'}}));render();select(n.id,true);say('素材已放到便签板，可以继续写联想；附件保留在灵感馆。');return n.id;}
 };
 $('notesMenuHistory').onclick=()=>history(menuId);
 $('notesMenuText').onclick=()=>{const n=get(menuId);if(n)download((n.title?n.title+'\n\n':'')+n.text,C.title(n).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,50)+'.txt','text/plain;charset=utf-8');closeMenu();};
 for(const color of C.COLORS){const b=document.createElement('button');b.type='button';b.dataset.color=color;b.className='note-color-swatch';b.setAttribute('aria-label',colorNames[color]);b.title=colorNames[color];b.onclick=()=>{change(menuId,'color',{color});closeMenu();render();};$('notesColors').append(b);}
 $('notesVersionSelect').onchange=showVersion;$('notesHistoryClose').onclick=()=>$('notesHistoryDialog').close();
 $('notesVersionRestore').onclick=()=>{const n=get(historyId),v=n?.versions[Number($('notesVersionSelect').value)||0];if(!v||!confirm('用这个历史版本替换当前内容？当前内容会保留在最近历史版本中。'))return;
  const next=C.change(n,'text',{title:v.title,text:v.text},now());data.notes=data.notes.map(x=>x.id===n.id?C.checkpoint(next,n):x);schedule();save();$('notesHistoryDialog').close();render();say('已恢复历史内容。');};
 document.addEventListener('pointermove',moveGesture,{passive:false});document.addEventListener('pointerup',endGesture);document.addEventListener('pointercancel',endGesture);
 document.addEventListener('click',event=>{if(menuId&&!$('notesMenu').contains(event.target)&&!event.target.closest?.('.note-menu-button'))closeMenu();});
 viewport.addEventListener('scroll',closeMenu);
 $('notesMenu').addEventListener('keydown',event=>{
  const buttons=[...$('notesColors').children,...['notesMenuPin','notesMenuHide','notesMenuFork','notesMenuGroup','notesMenuCollect','notesMenuSnapshot','notesMenuHistory','notesMenuText','notesMenuDelete'].map($)].filter(b=>!b.hidden&&!b.disabled);
  const i=buttons.indexOf(document.activeElement),step=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;
  if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+step+buttons.length)%buttons.length]?.focus();}
  if(event.key==='Tab'){const anchor=cards.get(menuId)?.more;closeMenu();anchor?.focus();}
 });
 document.addEventListener('keydown',event=>{
  if(!active())return;if(event.key==='Escape'&&menuId){const anchor=cards.get(menuId)?.more;closeMenu();anchor?.focus();}
  if(event.altKey&&event.key.toLowerCase()==='n'&&!$('notesHistoryDialog').open){event.preventDefault();add();}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save();}
 });
 window.addEventListener('workspace:viewchange',()=>{endGesture();closeMenu();save();if(active())render();});
 window.addEventListener('storage',event=>{
  if(event.key!==KEY||event.newValue===null||corrupt)return;
  endGesture();
  try{const incoming=C.parse(event.newValue),result=C.reconcile(data,incoming,baseline,uid,now());data=result.data;baseline=clone(incoming);
   if(result.copies.length){selected=result.copies[0].id;filter='active';query='';$('notesSearch').value='';say('检测到同时编辑，已保留编辑副本。');schedule();}
   if(dirty)save();else status('已同步另一窗口的更改');if(active()){render();if(result.copies.length)cards.get(selected)?.body.focus({preventScroll:true});}
  }catch(e){say('另一窗口的更新未能合并：'+e.message);}
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden){endGesture();save();}});window.addEventListener('pagehide',()=>{endGesture();save();});
 window.addEventListener('beforeunload',event=>{endGesture();save();if(dirty){event.preventDefault();event.returnValue='';}});
 new ResizeObserver(()=>{if(!gesture&&active()){closeMenu();layout();}}).observe(viewport);
 mobile.addEventListener('change',()=>{endGesture();render();});
 try{rawSource=localStorage.getItem(KEY)||'';data=rawSource?C.parse(rawSource):C.empty();baseline=clone(data);status(rawSource?'已保存至本浏览器':'自动保存已就绪');}
 catch(e){if(rawSource){corrupt=true;status('原便签数据无法读取 · 原始数据已保留',true);say('可先点“导出备份”下载原始数据，再导入有效备份恢复。');}else status('浏览器存储暂不可用 · 可编辑并导出备份',true);}
 render();
})();
