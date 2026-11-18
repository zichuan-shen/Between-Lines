/* Inspiration library: IndexedDB cache, explicit directory mirror, portable ZIP backup. */
(()=>{
 'use strict';
 const dateStamp=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const C=LibraryCore,$=id=>document.getElementById(id),uid=()=>crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2);
 const previewTypes=new Set(['image/png','image/jpeg','image/webp','image/gif','image/avif']);
 let db,dbPromise,cards=[],dir=null,revision='',lastSync=null,lastExport=0,filter='all',tag='',query='',category='',draft=null,editing=null,files=[],urls=[],editorURLs=[],draftTimer,syncTimer,busy=false,loaded=false,draftId='',draftKey='',editorInitial='',readerCard=null,readerGeneration=0;
 let readerURLs=[],draftQueue=Promise.resolve();
 let obsidianDir=null,obsidianBusy=false;
 const coverSizes=new Map();
 function coverSize(id,blob){
  if(!coverSizes.has(id))coverSizes.set(id,new Promise(resolve=>{
   const image=new Image(),url=URL.createObjectURL(blob);let finished=false,timer;
   const finish=ok=>{if(finished)return;finished=true;clearTimeout(timer);image.onload=image.onerror=null;URL.revokeObjectURL(url);resolve(ok&&image.naturalWidth&&image.naturalHeight?image.naturalWidth/image.naturalHeight:4/3);};
   image.onload=()=>finish(true);image.onerror=()=>finish(false);timer=setTimeout(()=>finish(false),8000);image.src=url;
  }));
  return coverSizes.get(id);
 }
 const say=(text,editor=false)=>{$(editor?'libEditorMessage':'libMessage').textContent=text;};
 function request(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 function open(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=indexedDB.open('questInspiration',1);r.onupgradeneeded=()=>{for(const name of ['cards','assets'])r.result.createObjectStore(name,{keyPath:'id'});r.result.createObjectStore('settings');};r.onsuccess=()=>{db=r.result;db.onversionchange=()=>{db.close();dbPromise=null;};resolve(db);};r.onerror=()=>reject(r.error);}).catch(e=>{dbPromise=null;throw e;});return dbPromise;}
 async function get(store,key){const d=await open();return request(d.transaction(store).objectStore(store).get(key));}
 async function all(store){const d=await open();return request(d.transaction(store).objectStore(store).getAll());}
 async function setting(key,value){const d=await open();return new Promise((resolve,reject)=>{const t=d.transaction('settings','readwrite');if(value===undefined)t.objectStore('settings').delete(key);else t.objectStore('settings').put(value,key);t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(t.error||Error('保存失败'));});}
 function locked(value){busy=value;$('libForm').inert=value;for(const id of ['libSave','libBind','libSync','libExport','libImport'])$(id).disabled=value;$('libReaderDelete').disabled=busy||obsidianBusy;}
 function error(e){return e?.name==='QuotaExceededError'?'本浏览器存储空间不足，请先导出备份或绑定目录。':e?.message||'操作失败，请稍后重试。';}
 function storageStatus(){
  const dirty=lastSync?.revision!==revision;
  $('libStorageState').textContent=dir?(dirty?'有更改待同步至本地目录':'本地目录已同步'):'仅保存在本浏览器';
  $('libStorageDetail').textContent=dir?'素材目录：'+dir.name+' · '+(lastSync?'上次同步 '+new Date(lastSync.at).toLocaleString('zh-CN'):'首次同步尚未完成'):'建议绑定本地目录；清理浏览器数据会移除尚未备份的素材。';
  $('libBackupDate').textContent=lastExport?'上次完整导出 '+new Date(lastExport).toLocaleDateString('zh-CN')+(Date.now()-lastExport>30*864e5?' · 建议再次备份':''):'尚未导出完整备份 · 建议每月一次';
 }
 async function refresh(){cards=(await all('cards')).map(C.card);revision=await get('settings','revision')||'';lastSync=await get('settings','lastSync');lastExport=await get('settings','lastExport')||0;storageStatus();await render();}
 function imageURL(blob){const url=URL.createObjectURL(blob);urls.push(url);return url;}
 function chip(text){const span=document.createElement('span');span.textContent=text;return span;}
 async function render(){
  const generation=++render.generation;
  const selected=cards.filter(c=>(filter==='all'||c.state===filter)&&(!tag||c.tags.includes(tag))&&(!category||c.category===category)&&(!query||[c.title,c.note,c.source,c.category,...c.tags,...c.assets.map(x=>x.name)].join(' ').toLowerCase().includes(query))).sort((a,b)=>b.updatedAt-a.updatedAt);
  $('libCount').textContent=selected.length+' / '+cards.length+' 条灵感';$('libTidy').textContent='待整理 '+cards.filter(c=>c.state==='inbox').length+' 条 ↗';
  for(const button of document.querySelectorAll('[data-lib-state]'))button.setAttribute('aria-pressed',String(button.dataset.libState===filter));
  $('libTags').replaceChildren();
  if(tag){const clear=document.createElement('button');clear.type='button';clear.textContent='清除标签 ×';clear.onclick=()=>{tag='';render();};$('libTags').append(clear);}
  for(const t of [...new Set(cards.flatMap(c=>c.tags))].sort().slice(0,50)){const b=document.createElement('button');b.type='button';b.textContent='# '+t;b.setAttribute('aria-pressed',String(tag===t));b.onclick=()=>{tag=tag===t?'':t;render();};$('libTags').append(b);}
  // Resolve cover dimensions before swapping the list: image loading cannot move cards.
  const previews=new Map();
  await Promise.all(selected.map(async c=>{const a=c.assets.find(a=>previewTypes.has(a.type));if(!a)return;
   try{const record=await get('assets',a.id);const ratio=record?.blob?await coverSize(a.id,record.blob):4/3;previews.set(c.id,{record,ratio});}
   catch(_){previews.set(c.id,{ratio:4/3});}
  }));
  if(generation!==render.generation)return;
  urls.forEach(URL.revokeObjectURL);urls=[];$('libGrid').replaceChildren();
  if(!selected.length){const empty=document.createElement('div');empty.className='library-empty';const h=document.createElement('h2');h.textContent=cards.length?'没有找到这组素材':'每一个想法，都值得一个位置。';const p=document.createElement('p');p.textContent=cards.length?'试试切换分类或清空搜索条件。':'拖入截图、粘贴参考链接，或点“收集灵感”写下第一句话。';empty.append(h,p);$('libGrid').append(empty);return;}
  for(const c of selected){
   const article=document.createElement('article');article.className='library-card';
   const openButton=document.createElement('button');openButton.type='button';openButton.className='library-card-open';openButton.setAttribute('aria-label','打开灵感：'+c.title);openButton.onclick=()=>viewCard(c.id).catch(e=>say(error(e)));
   const cover=c.assets.find(a=>previewTypes.has(a.type));
   if(cover){const holder=document.createElement('div');holder.className='library-card-cover';
    const preview=previews.get(c.id),ratio=preview?.ratio||4/3;holder.style.setProperty('--cover-ratio',String(Math.max(.65,Math.min(3,ratio))));openButton.append(holder);
    if(preview?.record?.blob){const img=document.createElement('img');img.src=imageURL(preview.record.blob);img.alt=c.title;img.loading='lazy';holder.append(img);}else{const missing=document.createElement('span');missing.className='library-cover-missing';missing.textContent='附件暂不可用';holder.append(missing);}
   }
   else{const symbol=document.createElement('div');symbol.className='library-card-symbol';symbol.textContent=c.source?'↗':c.assets.length?'▧':'✦';openButton.append(symbol);}
   const body=document.createElement('div');body.className='library-card-body';const meta=document.createElement('div');meta.className='library-card-meta';meta.append(chip(c.category),chip({inbox:'待整理',featured:'精选',archived:'归档'}[c.state]));const h=document.createElement('h2');h.textContent=c.title;body.append(meta,h);if(c.note){const p=document.createElement('p');p.textContent=c.note;body.append(p);}const tags=document.createElement('div');tags.className='library-card-tags';for(const t of c.tags.slice(0,4))tags.append(chip('#'+t));body.append(tags);const foot=document.createElement('small');foot.textContent='编辑于 '+new Date(c.updatedAt).toLocaleDateString('zh-CN')+(c.assets.length?' · '+c.assets.length+' 个附件':'');body.append(foot);openButton.append(body);article.append(openButton);$('libGrid').append(article);
  }
 }
 render.generation=0;
 function formData(){return {id:editing?.id||draftId||uid(),title:$('libTitle').value.trim()||$('libNote').value.trim().split(/\r?\n/)[0].slice(0,120)||files[0]?.name?.slice(0,120)||$('libSource').value.trim().slice(0,120)||'未命名灵感',originNoteId:editing?.originNoteId||draft?.card?.originNoteId||'',note:$('libNote').value,source:$('libSource').value,tags:C.tags($('libTagInput').value),category:$('libType').value,state:$('libState').value,createdAt:editing?.createdAt||Date.now(),updatedAt:Math.max(Date.now(),(editing?.updatedAt||0)+1),assets:files.map(({id,name,type,size})=>({id,name,type,size}))};}
 function sameContent(a,b){
  const fields=c=>[c.title,c.note,c.source,c.tags,c.category,c.state,c.originNoteId,c.assets.map(x=>[x.id,x.name,x.type,x.size])];
  return JSON.stringify(fields(C.card(a)))===JSON.stringify(fields(C.card(b)));
 }
 function editorSignature(){return JSON.stringify([$('libTitle').value,$('libNote').value,$('libSource').value,$('libTagInput').value,$('libType').value,$('libState').value,files.map(f=>f.id)]);}
 async function listDrafts(){return (await all('settings')).filter(v=>v?.kind==='creative-draft'&&v.card&&Array.isArray(v.files)).sort((a,b)=>b.at-a.at);}
 async function updateDraftButton(){const list=await listDrafts();$('libResume').hidden=!list.length;$('libResume').textContent='继续草稿'+(list.length?' · '+list.length:'');}
 async function stash(){
  if(busy)return false;clearTimeout(draftTimer);
  if(editorSignature()===editorInitial)return true;
  const captured={kind:'creative-draft',key:draftKey,at:Date.now(),card:formData(),base:editing,files:[...files]};
  const job=draftQueue.catch(()=>{}).then(()=>setting(captured.key,captured));draftQueue=job;
  try{await job;draft=captured;$('libDraftState').textContent='草稿已暂存';await updateDraftButton();return true;}
  catch(e){$('libDraftState').textContent='草稿未能暂存';say(error(e),true);return false;}
 }
 function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(stash,350);$('libDraftState').textContent='正在暂存…';}
 function fill(c){$('libTitle').value=c?.title||'';$('libNote').value=c?.note||'';$('libSource').value=c?.source||'';$('libTagInput').value=(c?.tags||[]).join('，');$('libType').value=c?.category||'随手记';$('libState').value=c?.state||'inbox';}
 async function edit(card=null,resumeRecord=null){
  if(busy)return;if(!loaded){say('素材库仍在读取，请稍候重试。');return;}
  const saved=resumeRecord|| (card?await get('settings','draft:'+card.id):null);
  const incoming=[];
  if(card&&!saved){for(const a of card.assets){const file=await get('assets',a.id);if(!file?.blob){say('这条素材有附件未能读取，请先恢复备份。');return;}incoming.push(file);}}
  draft=saved||null;editing=saved?saved.base:card;files=saved?[...saved.files]:incoming;
  draftId=saved?.card.id||card?.id||uid();draftKey='draft:'+draftId;
  fill(saved?.card||card);editorInitial=editorSignature();
  $('libEditorHeading').textContent=editing?'编辑灵感':'收下一点灵感';$('libExportCard').hidden=!editing;$('libDraftState').textContent=saved?'已恢复这张卡片的草稿':'';say('',true);renderFiles();$('libEditor').showModal();$('libNote').focus();
 }
 async function resumeDrafts(){
  const list=await listDrafts();if(!list.length){await updateDraftButton();return;}
  if(list.length===1)return edit(null,list[0]);
  $('libDraftsList').replaceChildren();for(const d of list){const button=document.createElement('button');button.type='button';button.className='creative-draft';button.textContent=d.card.title+' · '+new Date(d.at).toLocaleString('zh-CN');button.onclick=()=>{$('libDraftsDialog').close();edit(null,d).catch(e=>say(error(e)));};$('libDraftsList').append(button);}
  $('libDraftsDialog').showModal();
 }
 function clearReader(){readerGeneration++;readerURLs.forEach(URL.revokeObjectURL);readerURLs=[];}
 async function viewCard(id){
  const c=await get('cards',id);if(!c){say('这条素材暂不可用，请检查是否已恢复素材库。');return;}
  $('libReaderObsidianStatus').textContent='';
  clearReader();const generation=readerGeneration;readerCard=C.card(c);$('libReaderTitle').textContent=c.title;$('libReaderNote').textContent=c.note||'还没有写下联想。';$('libReaderMeta').textContent=[c.category,...c.tags.map(t=>'# '+t)].join(' · ');$('libReaderSource').hidden=!c.source;$('libReaderSource').href=c.source||'#';$('libReaderOrigin').hidden=!c.originNoteId;$('libReaderMessage').textContent='';$('libReaderAssets').replaceChildren();$('libReader').showModal();$('libReaderBody').scrollTop=0;
  for(const a of c.assets){const record=await get('assets',a.id);if(generation!==readerGeneration)return;const wrap=document.createElement('div');wrap.className='reader-asset';if(record?.blob){const url=URL.createObjectURL(record.blob);readerURLs.push(url);if(previewTypes.has(a.type)){const img=document.createElement('img');img.src=url;img.alt=a.name;wrap.append(img);}const link=document.createElement('a');link.href=url;link.download=a.name;link.textContent=a.name+' ↓';wrap.append(link);}else wrap.textContent=a.name+' · 附件暂不可用';$('libReaderAssets').append(wrap);}
 }
 $('libReaderClose').onclick=()=>{$('libReader').close();clearReader();};$('libReader').addEventListener('close',clearReader);
 // Both ends of a pointer gesture must be outside: dragging text out stays safe.
 let readerBackdropPress=false;
 function outsideReader(event){const dialog=$('libReader'),r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);}
 $('libReader').addEventListener('pointerdown',event=>{readerBackdropPress=event.button===0&&outsideReader(event);});
 $('libReader').addEventListener('pointercancel',()=>{readerBackdropPress=false;});
 $('libReader').addEventListener('click',event=>{const dismiss=readerBackdropPress&&outsideReader(event);readerBackdropPress=false;if(dismiss)$('libReaderClose').click();});

 $('libReaderEdit').onclick=async()=>{if(busy)return;const c=readerCard;$('libReader').close();clearReader();await edit(c);};
 $('libReaderDelete').onclick=async()=>{
  const dialog=$('libReader'),card=readerCard,generation=readerGeneration,status=$('libReaderObsidianStatus');
  if(!dialog.open||!card||busy||obsidianBusy)return;
  if(!confirm('删除「'+card.title+'」？这条灵感和它的编辑草稿将从素材库移除，原便签和已导出的笔记会保留。'))return;
  locked(true);status.textContent='正在删除…';
  try{
   await draftQueue.catch(()=>{});
   await deleteCard(card);
   if(dialog.open&&generation===readerGeneration)$('libReaderClose').click();
   scheduleSync();
   say('已删除灵感。');
   await Promise.all([refresh(),updateDraftButton()]);
  }catch(e){
   if(dialog.open&&generation===readerGeneration)status.textContent=error(e);
   else say(error(e));
  }finally{locked(false);}
 };
 $('libReaderToNotes').onclick=async()=>{if(!readerCard)return;try{if(!window.CreativeNotes)throw Error('便签尚未就绪。');window.CreativeNotes.fromLibrary(readerCard);$('libReader').close();clearReader();}catch(e){$('libReaderMessage').textContent=error(e);}};
 $('libReaderOrigin').onclick=()=>{if(window.CreativeNotes?.reveal(readerCard?.originNoteId)){$('libReader').close();clearReader();}else $('libReaderMessage').textContent='原便签未在当前浏览器中找到；素材内容仍然保留。';};
 function paintObsidianTarget(){
  $('libObsidianTarget').textContent=obsidianDir?'Obsidian 收件箱：'+obsidianDir.name:'Obsidian · 尚未选择收件箱';
  $('libObsidianBind').textContent=obsidianDir?'更换收件箱':'选择收件箱';
 }
 function obsidianWorking(value){
  obsidianBusy=value;$('libReaderObsidian').disabled=$('libObsidianBind').disabled=value;
  $('libReaderDelete').disabled=busy||obsidianBusy;
 }
 async function chooseObsidianDirectory(){
  if(!window.showDirectoryPicker)throw Error('当前浏览器无法写入收件箱，请使用 Chrome 或 Edge 打开看板。');
  const selected=await window.showDirectoryPicker({id:'quest-obsidian-inbox',mode:'readwrite'});
  if(['.obsidian','.trash','灵感馆素材库'].includes(selected.name.toLowerCase()))throw Error('请选择 Obsidian 仓库内专门存放灵感的子文件夹。');
  await setting('obsidianDirectory',selected);
  obsidianDir=selected;paintObsidianTarget();
  return selected;
 }
 $('libObsidianBind').onclick=async()=>{
  if(obsidianBusy)return;
  obsidianWorking(true);
  try{const target=await chooseObsidianDirectory();say('Obsidian 收件箱已设为「'+target.name+'」。');}
  catch(e){if(e.name!=='AbortError')say(error(e));}
  finally{obsidianWorking(false);}
 };
 $('libReaderObsidian').onclick=async()=>{
  if(!readerCard||busy||obsidianBusy)return;
  const card=readerCard,generation=readerGeneration,receiptKey='obsidianSent:'+card.id;
  const report=message=>{
   if(generation===readerGeneration&&$('libReader').open)$('libReaderObsidianStatus').textContent=message;
   else say(message);
  };
  obsidianWorking(true);
  try{
   report(obsidianDir?'正在准备导出…':'请选择 Obsidian 仓库内的灵感收件箱子文件夹。');
   const target=obsidianDir||await chooseObsidianDirectory();
   if(await target.requestPermission({mode:'readwrite'})!=='granted')throw Error('未获得收件箱写入权限。可在「保存与备份」中更换收件箱。');
   const send=async()=>{
    const receipt=await get('settings',receiptKey);
    if(receipt){report('这张卡片已发送过：'+receipt.folder+' / '+receipt.filename+'。未生成副本。');return;}
    const result=await LibraryObsidian.send(target,card,async id=>(await get('assets',id))?.blob);
    if(result.exists){report('收件箱里已存在「'+result.filename+'」，未覆盖。');return;}
    await setting(receiptKey,{folder:target.name,filename:result.filename}).catch(()=>{});
    report('已发送至「'+target.name+'」：'+result.filename);
   };
   if(navigator.locks)await navigator.locks.request('quest-obsidian-send:'+card.id,send);
   else await send();
  }catch(e){
   report(e.name==='AbortError'?'已取消选择，没有写入文件。':e.name==='NotFoundError'?'收件箱可能已被移动，请在「保存与备份」中重新选择。':error(e));
  }finally{obsidianWorking(false);}
 };
 $('libDraftsClose').onclick=()=>$('libDraftsDialog').close();
 async function renderFiles(){
  editorURLs.forEach(URL.revokeObjectURL);editorURLs=[];$('libAttachments').replaceChildren();
  files.forEach((file,index)=>{const row=document.createElement('div');row.className='library-file';const name=document.createElement('span');name.textContent=file.name+' · '+Math.round(file.size/1024)+' KB';const download=document.createElement('button');download.type='button';download.textContent='下载';download.onclick=()=>downloadBlob(file.blob,file.name);const remove=document.createElement('button');remove.type='button';remove.textContent='移除';remove.setAttribute('aria-label','移除附件 '+file.name);remove.onclick=()=>{files.splice(index,1);renderFiles();scheduleDraft();};row.append(name,download,remove);if(previewTypes.has(file.type)){const image=document.createElement('img'),url=URL.createObjectURL(file.blob);editorURLs.push(url);image.src=url;image.alt=file.name;image.loading='lazy';row.append(image);}$('libAttachments').append(row);});
 }
 async function addFiles(incoming){
  const accepted=[];let total=files.reduce((n,f)=>n+f.size,0);
  for(const file of incoming){if(file.size>C.MAX_FILE||files.length+accepted.length>=100||total+file.size>128*1024*1024){say('附件超出限制：单文件 25 MB，每张卡片最多 100 个／128 MB。',true);continue;}accepted.push({id:uid(),name:file.name.slice(0,250)||'截图.png',type:file.type||'application/octet-stream',size:file.size,blob:file});total+=file.size;}
  files.push(...accepted);if(!$('libTitle').value&&accepted.length)$('libTitle').value=accepted[0].name.replace(/\.[^.]+$/,'');renderFiles();await stash();
 }
 async function writeCard(c){
  const d=await open();return new Promise((resolve,reject)=>{
   const t=d.transaction(['cards','assets','settings'],'readwrite');let conflict='';
   const r=t.objectStore('cards').get(c.id);r.onsuccess=()=>{if(editing&&(!r.result||r.result.updatedAt!==editing.updatedAt)){conflict=r.result?'这条素材已在另一窗口更新，请关闭编辑器并重新打开。':'这条素材已被删除。请把仍需保留的内容复制到一条新灵感。';t.abort();return;}t.objectStore('cards').put(c);for(const file of files)t.objectStore('assets').put(file);t.objectStore('settings').delete(draftKey);t.objectStore('settings').put(uid(),'revision');};
   t.oncomplete=resolve;t.onabort=t.onerror=()=>reject(Error(conflict||'素材保存失败，请检查浏览器存储空间。'));
  });
 }
 async function deleteCard(card){
  const d=await open();
  return new Promise((resolve,reject)=>{
   const tx=d.transaction(['cards','assets','settings'],'readwrite');
   const storedCards=tx.objectStore('cards'),assets=tx.objectStore('assets'),settings=tx.objectStore('settings');
   const req=storedCards.getAll();let conflict=false;
   req.onsuccess=()=>{
    const current=req.result.find(item=>item.id===card.id);
    if(!current)return;
    if(current.updatedAt!==card.updatedAt){conflict=true;tx.abort();return;}
    const remainingAssets=new Set(req.result.filter(item=>item.id!==card.id).flatMap(item=>item.assets.map(asset=>asset.id)));
    storedCards.delete(card.id);
    for(const asset of current.assets){
     if(!remainingAssets.has(asset.id))assets.delete(asset.id);
    }
    settings.delete('draft:'+card.id);
    settings.put(uid(),'revision');
   };
   tx.oncomplete=resolve;
   tx.onabort=tx.onerror=()=>reject(Error(conflict?'这条灵感已更新，请重新打开后再删除。':'删除失败，这条灵感仍然保留。'));
  });
 }
 async function directoryPermission(interactive){if(!dir)return false;let p=await dir.queryPermission({mode:'readwrite'});if(p!=='granted'&&interactive)p=await dir.requestPermission({mode:'readwrite'});return p==='granted';}
 async function snapshot(){const d=await open();return new Promise((resolve,reject)=>{const t=d.transaction(['cards','assets','settings']);const a=t.objectStore('cards').getAll(),b=t.objectStore('assets').getAll(),r=t.objectStore('settings').get('revision');t.oncomplete=()=>resolve({cards:a.result.map(C.card),assets:b.result,revision:r.result||''});t.onerror=()=>reject(t.error);});}
 function makeManifest(list){return {app:'quest-inspiration',version:1,exportedAt:Date.now(),cards:list};}
 async function writeFile(handle,name,value){const file=await handle.getFileHandle(name,{create:true}),w=await file.createWritable();try{await w.write(value);await w.close();}catch(e){await w.abort().catch(()=>{});throw e;}}
 async function syncDirectory(interactive=false){
  const target=dir;
  if(!dir){if(interactive)say('先点击“绑定素材目录”选择一个存放位置。');return;}
  if(!await directoryPermission(interactive)){say('目录写入尚未授权，更改仍保存在本浏览器。点击“同步目录”重新授权。');storageStatus();return;}
  const work=async()=>{
   if(dir!==target)return;const snap=await snapshot(),assetDir=await target.getDirectoryHandle('assets',{create:true}),map=new Map(snap.assets.map(a=>[a.id,a]));
   for(const id of new Set(snap.cards.flatMap(c=>c.assets.map(a=>a.id)))){const a=map.get(id);if(!a?.blob)throw Error('素材附件缺失，目录未标记为已同步。');let exists=false;try{exists=(await (await assetDir.getFileHandle(id)).getFile()).size===a.size;}catch(_){}if(!exists)await writeFile(assetDir,id,a.blob);}
   await writeFile(target,'manifest.json',JSON.stringify(makeManifest(snap.cards),null,2));if(dir!==target)return;lastSync={at:Date.now(),revision:snap.revision};await setting('lastSync',lastSync);storageStatus();if(interactive)say('卡片和附件已同步到本地素材目录。');
  };
  if(navigator.locks)await navigator.locks.request('quest-inspiration-sync',work);else await work();
 }
 function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncDirectory().catch(e=>{say('本地目录尚未同步：'+error(e));storageStatus();}),900);}
 function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\\/]/g,'_');document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 async function restoreBundle(manifest,assetBlobs){
  const incoming=C.manifest(manifest),provided=new Map();
  for(const c of incoming.cards)for(const a of c.assets){const blob=assetBlobs.get(a.id);if(!blob||blob.size!==a.size)throw Error('备份附件缺失或大小不符：'+a.name);if(provided.has(a.id)&&(provided.get(a.id).size!==a.size||provided.get(a.id).type!==a.type))throw Error('备份附件编号冲突。');provided.set(a.id,{...a,blob:new Blob([blob],{type:a.type})});}
  // Preserve existing attachment bytes if an imported backup reuses an ID differently.
  for(const [id,file] of [...provided]){const existing=await get('assets',id);if(existing?.blob){const x=new Uint8Array(await existing.blob.arrayBuffer()),y=new Uint8Array(await file.blob.arrayBuffer());if(x.length!==y.length||x.some((v,i)=>v!==y[i])){const next=uid();provided.delete(id);provided.set(next,{...file,id:next});for(const c of incoming.cards)for(const a of c.assets)if(a.id===id)a.id=next;}}}
  const d=await open();await new Promise((resolve,reject)=>{const t=d.transaction(['cards','assets','settings'],'readwrite'),r=t.objectStore('cards').getAll();r.onsuccess=()=>{for(const c of C.merge(r.result,incoming.cards))t.objectStore('cards').put(c);for(const file of provided.values())t.objectStore('assets').put(file);t.objectStore('settings').put(uid(),'revision');};t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(t.error||Error('恢复失败'));});await refresh();
 }
 async function fromDirectory(handle){
  const file=await (await handle.getFileHandle('manifest.json')).getFile();if(file.size>16*1024*1024)throw Error('素材目录清单过大。');const m=C.manifest(JSON.parse(await file.text())),map=new Map(),assetDir=await handle.getDirectoryHandle('assets');
  for(const c of m.cards)for(const a of c.assets)if(!map.has(a.id)){const f=await (await assetDir.getFileHandle(a.id)).getFile();if(f.size>C.MAX_FILE)throw Error('目录内附件超过 25 MB：'+a.name);map.set(a.id,f);}return {manifest:m,assets:map};
 }
 $('libForm').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;clearTimeout(draftTimer);await draftQueue.catch(()=>{});locked(true);try{if(!$('libTitle').value.trim()&&!$('libNote').value.trim()&&!$('libSource').value.trim()&&!files.length)throw Error('写一句话、贴一张图，或放一个链接就可以收下。');const c=C.card(formData());
 if(editing&&sameContent(c,editing)){
  await setting(draftKey,undefined);draft=null;$('libEditor').close();await updateDraftButton();
  say('内容未变化，已保留原编辑时间和排序。');return;
 }
 await writeCard(c);draft=null;$('libEditor').close();await updateDraftButton();await refresh();say('灵感已保存。'+(dir?'将同步到本地目录。':'建议绑定本地目录或定期导出备份。'));scheduleSync();}catch(e){say(error(e),true);}finally{locked(false);}});
 $('libOpenSource').onclick=()=>{try{const url=C.safeUrl($('libSource').value);if(url)window.open(url,'_blank','noopener,noreferrer');else say('先填写来源链接。',true);}catch(e){say(error(e),true);}};
 $('libNew').onclick=()=>edit().catch(e=>say(error(e)));$('libResume').onclick=()=>resumeDrafts().catch(e=>say(error(e)));
 $('libClose').onclick=async()=>{if(busy)return;if(await stash())$('libEditor').close();};$('libEditor').addEventListener('cancel',event=>{event.preventDefault();$('libClose').click();});
 $('libDiscardDraft').onclick=async()=>{if(!confirm('放弃当前未保存的草稿？已保存的卡片不会改动。'))return;clearTimeout(draftTimer);try{await draftQueue.catch(()=>{});await setting(draftKey,undefined);draft=null;await updateDraftButton();$('libEditor').close();}catch(e){say(error(e),true);}};
 for(const id of ['libTitle','libNote','libSource','libTagInput','libType','libState'])$(id).addEventListener('input',scheduleDraft);
 $('libAddFiles').onclick=()=>$('libFiles').click();$('libFiles').onchange=()=>{addFiles([...$('libFiles').files]).catch(e=>say(error(e),true));$('libFiles').value='';};
 for(const zone of [$('libDropZone'),$('libEditor')]){zone.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();zone.classList.add('dragover');}});zone.addEventListener('dragleave',()=>zone.classList.remove('dragover'));zone.addEventListener('drop',async e=>{zone.classList.remove('dragover');if(!e.dataTransfer.files.length)return;e.preventDefault();if(busy)return;try{if(!$('libEditor').open)await edit();if($('libEditor').open)await addFiles([...e.dataTransfer.files]);}catch(errorValue){say(error(errorValue));}});}
 document.addEventListener('paste',async event=>{
  if(document.documentElement.dataset.view!=='library')return;
  const incoming=[...(event.clipboardData?.files||[])];
  try{if(incoming.length){event.preventDefault();if(!$('libEditor').open)await edit();if($('libEditor').open)await addFiles(incoming);return;}
   if(!$('libEditor').open&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){const text=event.clipboardData?.getData('text/plain');if(!text)return;event.preventDefault();await edit();if(!$('libEditor').open)return;if(/^https?:\/\//i.test(text.trim())){$('libSource').value=text.trim();$('libTitle').value=new URL(text.trim()).hostname;}else{$('libNote').value=text.slice(0,20000);$('libTitle').value=text.slice(0,60).split('\n')[0];}await stash();}
  }catch(e){say(error(e),$('libEditor').open);}
 });
 $('libSearch').oninput=()=>{query=$('libSearch').value.trim().toLowerCase();render();};$('libCategory').onchange=()=>{category=$('libCategory').value;render();};for(const b of document.querySelectorAll('[data-lib-state]'))b.onclick=()=>{filter=b.dataset.libState;render();};$('libTidy').onclick=()=>{filter='inbox';tag='';query='';category='';$('libSearch').value='';$('libCategory').value='';render();};
 $('libBind').onclick=async()=>{
  if(!window.showDirectoryPicker){say('当前浏览器不支持绑定目录，可使用完整备份保存素材。');return;}
  try{clearTimeout(syncTimer);const parent=await showDirectoryPicker({id:'quest-inspiration',mode:'readwrite'});locked(true);const selected=await parent.getDirectoryHandle('灵感馆素材库',{create:true});let existing=false;try{await selected.getFileHandle('manifest.json');existing=true;}catch(e){if(e.name!=='NotFoundError')throw e;}
   if(existing){const bundle=await fromDirectory(selected);if(!confirm('此位置已有 '+bundle.manifest.cards.length+' 条灵感。是否合并恢复并绑定？同编号卡片保留较新版本。'))return;await restoreBundle(bundle.manifest,bundle.assets);}
   await setting('directory',selected);dir=selected;lastSync=null;await setting('lastSync',undefined);storageStatus();await syncDirectory(true);
  }catch(e){if(e.name!=='AbortError')say(error(e));}finally{locked(false);}
 };
 $('libSync').onclick=async()=>{locked(true);try{await syncDirectory(true);}catch(e){say(error(e));}finally{locked(false);}};
 async function backupCards(ids=null){
  const snap=await snapshot(),list=ids?snap.cards.filter(c=>ids.includes(c.id)):snap.cards;
  if(ids&&!list.length)throw Error('这条素材尚未保存，无法导出。');
  const map=new Map(snap.assets.map(a=>[a.id,a])),entries=[['manifest.json',new Blob([JSON.stringify(makeManifest(list))],{type:'application/json'})]];
  for(const id of new Set(list.flatMap(c=>c.assets.map(a=>a.id)))){const a=map.get(id);if(!a?.blob)throw Error('有附件缺失，无法生成完整备份。');entries.push(['assets/'+id,a.blob]);}
  return C.zip(entries);
 }
 $('libExport').onclick=async()=>{locked(true);try{const zip=await backupCards();downloadBlob(zip,'灵感馆完整备份-'+dateStamp()+'.zip');lastExport=Date.now();await setting('lastExport',lastExport);storageStatus();say('完整备份已生成，请在浏览器下载中确认文件已保存。');}catch(e){say(error(e));}finally{locked(false);}};
 $('libExportCard').onclick=async()=>{if(!editing)return;locked(true);try{const zip=await backupCards([editing.id]);downloadBlob(zip,'灵感卡片-'+editing.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,60)+'.zip');say('已导出此卡的已保存版本及全部附件。',true);}catch(e){say(error(e),true);}finally{locked(false);}};
 $('libImport').onclick=()=>$('libImportFile').click();$('libImportFile').onchange=async()=>{const f=$('libImportFile').files[0];$('libImportFile').value='';if(!f)return;locked(true);try{const entries=await C.unzip(f),m=C.manifest(JSON.parse(new TextDecoder().decode(entries.get('manifest.json')))),assets=new Map([...entries].filter(([k])=>k.startsWith('assets/')).map(([k,v])=>[k.slice(7),new Blob([v])]));if(!confirm('备份中有 '+m.cards.length+' 条灵感。合并到当前素材库？已有卡片保留较新版本。'))return;await restoreBundle(m,assets);say('备份已合并恢复。');scheduleSync();}catch(e){say(error(e));}finally{locked(false);}};
 window.addEventListener('workspace:viewchange',event=>{if(event.detail.view==='library'&&loaded)refresh().catch(e=>say(error(e)));});
 const ready=(async()=>{try{
  await open();dir=await get('settings','directory')||null;
  obsidianDir=await get('settings','obsidianDirectory')||null;paintObsidianTarget();
  const legacy=await get('settings','draft');if(legacy?.card&&Array.isArray(legacy.files)){const key='draft:'+legacy.card.id;await setting(key,{...legacy,kind:'creative-draft',key,at:Date.now()});await setting('draft',undefined);}
  await updateDraftButton();await refresh();loaded=true;
 }catch(e){$('libStorageState').textContent='素材库暂不可用';say(error(e));}})();
 window.CreativeLibrary={
  async reveal(id){await ready;window.dispatchEvent(new CustomEvent('workspace:navigate',{detail:{view:'library'}}));await viewCard(id);},
  async collectNote(n){await ready;if(!loaded)throw Error('素材库尚未就绪');if(busy||$('libEditor').open)throw Error('请先保存或关闭灵感编辑器，再收录便签。');
   if(!n.title.trim()&&!n.text.trim())throw Error('先写一点内容，再收进灵感馆。');
   const c=C.card({id:uid(),title:n.title.trim()||n.text.trim().split(/\r?\n/)[0].slice(0,120),note:n.text,originNoteId:n.id,source:'',category:'随手记',tags:n.group?[n.group]:[],state:'inbox',createdAt:Date.now(),updatedAt:Date.now(),assets:[]});
   const d=await open();await new Promise((resolve,reject)=>{const t=d.transaction(['cards','settings'],'readwrite');t.objectStore('cards').put(c);t.objectStore('settings').put(uid(),'revision');t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(t.error||Error('素材保存失败'));});await refresh();scheduleSync();return c.id;
  }
 };
})();
