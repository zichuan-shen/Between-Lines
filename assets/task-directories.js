/* Each native picker/permission request starts directly in its own button gesture. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TaskDirectories=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 function create({readHandle,writeHandle,notify=()=>{},afterBind=async()=>{},backupNow=async()=>false,document:doc=globalThis.document,window:win=globalThis.window}){
  const $=id=>doc.getElementById(id),dialog=$('directoryDialog'),cache=new Map(),volatile=new Set(),revisions=new Map();
  const configs={records:{key:'recordsDir.v3',picker:'quest-log-records-v3',name:'任务记录',label:'recordsDirStatus',choose:'recordsDirChoose',authorize:'recordsDirAuthorize'},archive:{key:'archiveDir.v1',picker:'quest-log-archive-v1',name:'归档',label:'archiveDirStatus',choose:'archiveDirChoose',authorize:'archiveDirAuthorize'}};
  const message=text=>{$('directoryMessage').textContent=text;};
  const supported=()=>typeof win.showDirectoryPicker==='function'&&win.isSecureContext!==false;
  function error(e){return e?.name==='SecurityError'?'浏览器拦截了目录授权，请重新点击“选择 / 更换”，并在正常 Chrome 或 Edge 窗口中打开看板。':e?.name==='NotAllowedError'?'未获得目录权限，可点击“重新授权”或重新选择目录。':e?.name==='NotFoundError'?'目录已移动或不可用，请重新选择。':e?.message||'目录操作失败，请重试。';}
  function paint(kind,handle,permission){const c=configs[kind];$(c.label).textContent=!handle?'尚未绑定':permission==='granted'?(volatile.has(c.key)?'本次已连接 · '+handle.name+'（刷新后需重新绑定）':'已绑定 · '+handle.name):'需要重新授权 · '+handle.name;$(c.authorize).hidden=!handle||permission==='granted';$(c.authorize).disabled=!supported();}
  async function load(kind){const c=configs[kind];if(cache.has(c.key))return cache.get(c.key);const revision=revisions.get(c.key)||0,h=await readHandle(c.key);if((revisions.get(c.key)||0)!==revision)return cache.get(c.key)||null;const checked=h?.name===c.name?h:null;cache.set(c.key,checked);return checked;}
  async function refresh(kind){try{const c=configs[kind],revision=revisions.get(c.key)||0,h=await load(kind),p=h?await h.queryPermission({mode:'readwrite'}):'prompt';if((revisions.get(c.key)||0)===revision)paint(kind,h,p);}catch(e){message('目录状态读取失败：'+error(e));}}
  async function connected(kind,h){
   const c=configs[kind];revisions.set(c.key,(revisions.get(c.key)||0)+1);cache.set(c.key,h);let remembered=true;
   try{await writeHandle(c.key,h);volatile.delete(c.key);}catch{remembered=false;volatile.add(c.key);}
   paint(kind,h,'granted');message(remembered?'已绑定“'+c.name+'”。':'本次已连接“'+c.name+'”，但浏览器未能记住授权；刷新后请重新绑定。');notify(remembered?'📁 已绑定 '+c.name:'📁 '+c.name+'仅本次连接有效');
   try{await afterBind(kind,h);}catch(e){message('目录已连接，后续处理未完成：'+error(e));}return h;
  }
  async function choose(kind){
   const c=configs[kind];if(!supported()){message('当前环境不支持文件夹直写，请在 Chrome / Edge 中打开看板；仍可使用下载备份。');return null;}
   try{
    // Do not put an IndexedDB read, permission query, or any other await before this call.
    const selection=win.showDirectoryPicker({id:c.picker,mode:'readwrite'});
    $(c.choose).disabled=true;const h=await selection;
    if(h.name!==c.name){message('请选择名称为“'+c.name+'”的文件夹。原有绑定保持不变。');return null;}
    const permission=await h.queryPermission({mode:'readwrite'});
    if(permission!=='granted'){cache.set(c.key,h);paint(kind,h,permission);message('目录已选择，请点“重新授权”允许写入。');return null;}
    return await connected(kind,h);
   }catch(e){if(e.name==='AbortError')message('已取消选择，原有绑定保持不变。');else message(error(e));return null;}
   finally{$(c.choose).disabled=!supported();}
  }
  async function authorize(kind){
   const c=configs[kind],h=cache.get(c.key);if(!h){message('请先选择“'+c.name+'”目录。');return null;}
   try{
    const request=h.requestPermission({mode:'readwrite'});$(c.authorize).disabled=true;
    const permission=await request;paint(kind,h,permission);if(permission!=='granted'){message('未获得“'+c.name+'”写入权限，原有文件未改动。');return null;}
    return await connected(kind,h);
   }catch(e){message(error(e));return null;}finally{$(c.authorize).disabled=!supported();}
  }
  async function get(key,pickerId,folderName,hint,interactive){
   const kind=Object.keys(configs).find(k=>configs[k].key===key);if(!kind||!supported())return null;
   try{const h=await load(kind);if(h&&await h.queryPermission({mode:'readwrite'})==='granted')return h;
    if(interactive)notify('请点“绑定目录”，为“'+folderName+'”选择目录或重新授权。');return null;
   }catch(e){if(interactive)notify('目录不可用：'+error(e));return null;}
  }
  function open(){
   if(!dialog.open)dialog.showModal();
   const ok=supported();message(ok?'两个目录可分别绑定；更换目录不会移动已有文件。':'当前环境不支持文件夹直写，请使用 Chrome / Edge 打开看板，或下载备份。');
   for(const [kind,c] of Object.entries(configs)){$(c.choose).disabled=!ok;refresh(kind);}
  }
  for(const [kind,c] of Object.entries(configs)){$(c.choose).onclick=()=>choose(kind);$(c.authorize).onclick=()=>authorize(kind);}
  $('directoryClose').onclick=()=>dialog.close();
  $('directoryBackup').onclick=async()=>{$('directoryBackup').disabled=true;try{const ok=await backupNow();message(ok?'写入检查通过，当前任务备份已保存为 gpdQuestLog_autosave.json。':'未能写入任务备份。请检查“任务记录”的绑定及写入权限，再重试。');}catch(e){message('写入失败：'+error(e));}finally{$('directoryBackup').disabled=false;}};
  return {open,get,choose,authorize};
 }
 return {create};
});
