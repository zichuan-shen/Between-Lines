const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../assets/library-core.js'),source=fs.readFileSync(path.join(__dirname,'../assets/library.js'),'utf8');
const LibraryObsidian=require('../assets/library-obsidian.js');
const flush=async()=>{for(let i=0;i<90;i++)await new Promise(r=>setImmediate(r));};
class Directory{
 constructor(name){this.name=name;this.dirs=new Map();this.files=new Map();this.permission='granted';this._directory=true;}
 async queryPermission(){return this.permission;}async requestPermission(){return this.permission;}
 async getDirectoryHandle(name,{create=false}={}){if(!this.dirs.has(name)){if(!create){const e=Error('missing');e.name='NotFoundError';throw e;}this.dirs.set(name,new Directory(name));}return this.dirs.get(name);}
 async getFileHandle(name,{create=false}={}){const dir=this;if(!dir.files.has(name)){if(!create){const e=Error('missing');e.name='NotFoundError';throw e;}dir.files.set(name,new Blob([]));}return {async getFile(){return dir.files.get(name);},async createWritable(){let content;return {async write(v){content=v instanceof Blob?v:new Blob([v]);},async close(){dir.files.set(name,content);},async abort(){}};}};}
}
function stores(){return {cards:new Map(),assets:new Map(),settings:new Map()};}
async function boot(data=stores(),parent=null){
 const env={data,fail:false,downloads:[],urls:new Map(),nodes:{},events:{},timers:[]};
 class Element{
  constructor(tag='DIV'){this.tagName=tag.toUpperCase();this.value='';this.files=[];this.children=[];this.events={};this.dataset={};this.attrs={};this.style={setProperty(k,v){this[k]=v;}};this.open=false;this.isConnected=true;this.classList={add(){},remove(){}};}
  addEventListener(k,fn){this.events[k]=fn;}setAttribute(k,v){this.attrs[k]=v;}append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}focus(){document.activeElement=this;}showModal(){this.open=true;}close(){this.open=false;}remove(){}click(){if(this.download)env.downloads.push({name:this.download,blob:env.urls.get(this.href)});return this.onclick?.();}
 }
 function get(id){return env.nodes[id]??=(new Element());}
 const tabs=['all','inbox','featured','archived'].map(state=>{const e=new Element('button');e.dataset.libState=state;return e;});
 const document={documentElement:{dataset:{view:'library'}},activeElement:null,body:new Element(),getElementById:get,createElement:t=>new Element(t),querySelectorAll:()=>tabs,addEventListener:(k,fn)=>env.events[k]=fn};
 const window={showDirectoryPicker:parent?async()=>parent:undefined,open(){},addEventListener:(k,fn)=>env.events[k]=fn};
 const clone=v=>v?._directory?v:structuredClone(v);
 const db={close(){},transaction(names,mode='readonly'){
  const tx={error:null},ops=[];let pending=0,ended=false;
  function finish(){setImmediate(()=>{if(ended||pending)return;ended=true;if(mode==='readwrite')for(const [store,key,value,del] of ops){if(del)data[store].delete(key);else data[store].set(key,clone(value));}tx.oncomplete?.();});}
  tx.abort=()=>{if(ended)return;ended=true;setImmediate(()=>tx.onabort?.());};
  tx.objectStore=store=>({get:key=>run(()=>data[store].has(key)?clone(data[store].get(key)):undefined),getAll:()=>run(()=>[...data[store].values()].map(clone)),put:(value,key)=>run(()=>{ops.push([store,key??value.id,value,false]);return key??value.id;}),delete:key=>run(()=>{ops.push([store,key,undefined,true]);})});
  function run(operation){const request={};pending++;setImmediate(()=>{if(ended)return;if(env.fail){tx.error=Error('quota');ended=true;request.error=tx.error;request.onerror?.();tx.onabort?.();return;}try{request.result=operation();request.onsuccess?.();}catch(e){tx.error=e;ended=true;tx.onerror?.();return;}pending--;finish();});return request;}
  return tx;
 }};
 const indexedDB={open:()=>{const r={result:db};setImmediate(()=>r.onsuccess());return r;}};
 vm.runInNewContext(source,{Image:class{constructor(){this.naturalWidth=1200;this.naturalHeight=800;}set src(v){queueMicrotask(()=>this.onload?.());}},LibraryCore:C,LibraryObsidian,document,window,navigator:{},indexedDB,showDirectoryPicker:async()=>parent,crypto,Blob,URL:class extends URL{static createObjectURL(blob){const key='blob:'+crypto.randomUUID();env.urls.set(key,blob);return key;}static revokeObjectURL(key){env.urls.delete(key);}},TextDecoder,confirm:()=>true,setTimeout:(fn,ms)=>{env.timers.push({fn,ms});return env.timers.length;},clearTimeout(){},Date,Math});
 await flush();env.window=window;env.get=get;return env;
}
(async()=>{
 const app=await boot();assert.equal(app.get('libStorageState').textContent,'仅保存在本浏览器');
 await app.get('libNew').onclick();assert.equal(app.get('libEditor').open,true);
 app.get('libTitle').value='测试竞品奖励';app.get('libNote').value='先显示主要奖励，再展示明细';app.get('libTagInput').value='奖励，赛季';app.get('libType').value='竞品参考';
 const image=new Blob([new Uint8Array([1,2,3,4])],{type:'image/png'});image.name='奖励截图.png';app.get('libFiles').files=[image];app.get('libFiles').onchange();await flush();
 assert.equal([...app.data.settings.values()].find(d=>d?.kind==='creative-draft').files.length,1);
 await app.get('libClose').onclick();assert.equal(app.get('libEditor').open,false);
 await app.get('libResume').onclick();assert.equal(app.get('libTitle').value,'测试竞品奖励');assert.equal(app.get('libEditor').open,true);
 await app.get('libForm').events.submit({preventDefault(){}});await flush();assert.equal(app.data.cards.size,1);assert.equal(app.data.assets.size,1);assert.equal(app.data.settings.has('draft'),false);
 // Unchanged saves do not touch card timestamps, revision, or the gallery DOM.
 const unchanged=[...app.data.cards.values()][0],unchangedRevision=app.data.settings.get('revision');
 const originalGrid=app.get('libGrid').children[0];
 assert.equal(originalGrid.children[0].children[0].style['--cover-ratio'],'1.5','Image aspect ratio is reserved before card is mounted');
 await originalGrid.children[0].onclick();await app.get('libReaderEdit').onclick();
 app.get('libNote').value+=' changed';await app.get('libNote').events.input();
 app.get('libNote').value=unchanged.note;
 await app.get('libForm').events.submit({preventDefault(){}});
 assert.equal(app.data.cards.get(unchanged.id).updatedAt,unchanged.updatedAt);
 assert.equal(app.data.settings.get('revision'),unchangedRevision);
 assert.equal(app.get('libGrid').children[0],originalGrid,'No unnecessary gallery rebuild');
 assert.equal(app.data.settings.has('draft:'+unchanged.id),false);
 assert.match(originalGrid.children[0].children.at(-1).children.at(-1).textContent,/编辑于/);
 // A restored draft with actual edits is still saved, even without further typing.
 await app.get('libGrid').children[0].children[0].onclick();await app.get('libReaderEdit').onclick();
 app.get('libNote').value=unchanged.note+'（补充）';await app.get('libClose').onclick();
 await app.get('libResume').onclick();await app.get('libForm').events.submit({preventDefault(){}});
 assert.equal(app.data.cards.get(unchanged.id).note,unchanged.note+'（补充）');
 assert.ok(app.data.cards.get(unchanged.id).updatedAt>unchanged.updatedAt);
 const card=[...app.data.cards.values()][0];assert.equal(card.assets[0].name,'奖励截图.png');assert.equal(app.get('libGrid').children.length,1);
 app.get('libSearch').value='不存在';app.get('libSearch').oninput();await flush();assert.match(app.get('libCount').textContent,/0 \/ 1/);
 app.get('libSearch').value='奖励';app.get('libSearch').oninput();await flush();assert.match(app.get('libCount').textContent,/1 \/ 1/);
 await app.get('libGrid').children[0].children[0].onclick();assert.equal(app.get('libReader').open,true);assert.equal(app.get('libEditor').open,false);await app.get('libReaderEdit').onclick();app.get('libState').value='featured';await app.get('libForm').events.submit({preventDefault(){}});assert.equal([...app.data.cards.values()][0].state,'featured');
 await app.get('libGrid').children[0].children[0].onclick();await app.get('libReaderEdit').onclick();await app.get('libExportCard').onclick();assert.equal(app.downloads.length,1);assert.match(app.downloads[0].name,/灵感卡片/);const oneCard=await C.unzip(app.downloads[0].blob);assert.equal(C.manifest(JSON.parse(new TextDecoder().decode(oneCard.get('manifest.json')))).cards.length,1);await app.get('libClose').onclick();
 await app.get('libExport').onclick();assert.equal(app.downloads.length,2);const backup=app.downloads[1].blob;assert.ok(backup.size>0);
 const restored=await boot();restored.get('libImportFile').files=[backup];await restored.get('libImportFile').onchange();await flush();assert.equal(restored.data.cards.size,1);assert.equal(restored.data.assets.size,1);assert.deepEqual([...new Uint8Array(await [...restored.data.assets.values()][0].blob.arrayBuffer())],[1,2,3,4]);
 const root=new Directory('selected');const disk=await boot(app.data,root);await disk.get('libBind').onclick();await flush();const library=root.dirs.get('灵感馆素材库');assert.ok(library.files.has('manifest.json'));assert.equal(JSON.parse(await library.files.get('manifest.json').text()).cards[0].title,'测试竞品奖励');assert.equal(library.dirs.get('assets').files.size,1);
 const fromDisk=await boot(stores(),root);await fromDisk.get('libBind').onclick();assert.equal(fromDisk.data.cards.size,1);assert.equal(fromDisk.data.assets.size,1);
 library.permission='denied';await disk.get('libSync').onclick();assert.match(disk.get('libMessage').textContent,/尚未授权/);
 await restored.get('libNew').onclick();restored.get('libTitle').value='保存失败测试';restored.fail=true;await restored.get('libForm').events.submit({preventDefault(){}});assert.equal(restored.get('libEditor').open,true);assert.equal(restored.data.cards.size,1);assert.match(restored.get('libEditorMessage').textContent,/保存失败/);
 // Reader never creates a draft. Multiple independent ideas survive closing/reopening.
 const free=await boot();await free.get('libNew').onclick();free.get('libNote').value='没有标题也能收下';await free.get('libForm').events.submit({preventDefault(){}});assert.equal([...free.data.cards.values()][0].title,'没有标题也能收下');
 await free.get('libGrid').children[0].children[0].onclick();assert.equal(free.get('libReaderTitle').textContent,'没有标题也能收下');await free.get('libReaderClose').onclick();assert.equal([...free.data.settings.values()].filter(v=>v?.kind==='creative-draft').length,0);
 // Reader dismisses only deliberate backdrop gestures; padding and dragged text stay open.
 await free.get('libGrid').children[0].children[0].onclick();
 const reader=free.get('libReader');reader.getBoundingClientRect=()=>({left:100,right:800,top:100,bottom:700});
 const inside={target:reader,button:0,clientX:110,clientY:120},outside={target:reader,button:0,clientX:30,clientY:300};
 reader.events.pointerdown(inside);reader.events.click(inside);assert.equal(reader.open,true,'Dialog padding is not backdrop');
 reader.events.pointerdown(inside);reader.events.click(outside);assert.equal(reader.open,true,'Dragging text out does not dismiss');
 reader.events.pointerdown(outside);reader.events.pointercancel();reader.events.click(outside);assert.equal(reader.open,true,'Cancelled gesture does not dismiss');
 reader.events.pointerdown(outside);reader.events.click(outside);assert.equal(reader.open,false,'Backdrop click dismisses');
 assert.equal(free.get('libReaderBody').scrollTop,0,'Reopening starts at the top');
 await free.get('libNew').onclick();free.get('libNote').value='未完成的 A';await free.get('libClose').onclick();await free.get('libNew').onclick();free.get('libNote').value='未完成的 B';await free.get('libClose').onclick();assert.equal([...free.data.settings.values()].filter(v=>v?.kind==='creative-draft').length,2);
 await free.get('libResume').onclick();assert.equal(free.get('libDraftsDialog').open,true);assert.equal(free.get('libDraftsList').children.length,2);await free.get('libDraftsList').children[0].onclick();await flush();await free.get('libForm').events.submit({preventDefault(){}});assert.equal([...free.data.settings.values()].filter(v=>v?.kind==='creative-draft').length,1,'Saving one draft preserves the other');
 const noteId=await free.window.CreativeLibrary.collectNote({id:'note-source',title:'便签想法',text:'原便签仍然保留',group:'活动'});assert.equal(free.data.cards.get(noteId).originNoteId,'note-source');assert.equal(free.data.cards.get(noteId).tags[0],'活动');
 const old=stores();const oldCard={id:'legacy-draft',title:'旧草稿',note:'继续写',source:'',tags:[],assets:[],category:'随手记',state:'inbox',createdAt:1,updatedAt:1};old.settings.set('draft',{card:oldCard,base:null,files:[]});const migrated=await boot(old);assert.equal(old.settings.has('draft'),false);assert.equal(old.settings.get('draft:legacy-draft').card.note,'继续写');await migrated.get('libResume').onclick();assert.equal(migrated.get('libNote').value,'继续写');
 const inbox=new Directory('灵感收件箱'), bridge=await boot(app.data,inbox);
 await bridge.get('libGrid').children[0].children[0].onclick();
 inbox.permission='denied';await bridge.get('libReaderObsidian').onclick();assert.match(bridge.get('libReaderObsidianStatus').textContent,/权限/);assert.equal(inbox.files.size,0);
 inbox.permission='granted';await bridge.get('libReaderObsidian').onclick();
 assert.equal(bridge.data.settings.get('obsidianDirectory'),inbox);assert.equal(bridge.data.settings.get('directory'),library,'Backup directory is independent');
 const [mdName,mdFile]=[...inbox.files][0],md=await mdFile.text();
 assert.match(mdName,/^测试竞品奖励.+\.md$/);assert.match(md,/^---\ntitle: "测试竞品奖励"/);
 assert.match(md,/tags:/);assert.match(md,/先显示主要奖励，再展示明细/);
 const imageLink=md.match(/!\[奖励截图\.png\]\(([^)]+)\)/)[1].split('/').map(decodeURIComponent);
 assert.deepEqual([...new Uint8Array(await inbox.dirs.get(imageLink[0]).dirs.get(imageLink[1]).files.get(imageLink[2]).arrayBuffer())],[1,2,3,4]);
 assert.match(bridge.get('libReaderObsidianStatus').textContent,/已发送至/);
 inbox.files.delete(mdName);inbox.files.set('重命名后补了一段.md',new Blob([md,'\nObsidian 补充']));
 const reopened=await boot(bridge.data);await reopened.get('libGrid').children[0].children[0].onclick();await reopened.get('libReaderObsidian').onclick();
 assert.match(reopened.get('libReaderObsidianStatus').textContent,/已发送过/);assert.deepEqual([...inbox.files.keys()],['重命名后补了一段.md']);
 const orphan=await boot(stores(),new Directory('另外的仓库'));orphan.window.showDirectoryPicker=async()=>{throw Object.assign(Error(),{name:'AbortError'});};
 await orphan.window.CreativeLibrary.collectNote({id:'new-note',title:'取消选择',text:'不写文件',group:''});
 await orphan.get('libGrid').children[0].children[0].onclick();await orphan.get('libReaderObsidian').onclick();assert.match(orphan.get('libReaderObsidianStatus').textContent,/已取消/);assert.equal(orphan.data.settings.has('obsidianDirectory'),false);
 const planned=LibraryObsidian.plan({...card,title:'../展示：[A] #1',source:'https://example.com/doc?q=1',tags:['竞品 参考','2026']});
 assert.ok(!/[\\/#\[\]]/.test(planned.filename));assert.match(planned.markdown,/原始来源\n\n<https:\/\/example\.com\/doc\?q=1>/);assert.match(planned.markdown,/original_tags/);
 const occupied=new Directory('已有笔记');
 occupied.files.set(planned.filename,new Blob(['用户的笔记']));
 const collision=await LibraryObsidian.send(occupied,{...card,title:'../展示：[A] #1'},()=>{throw Error('Existing note must be detected before copying assets');});
 assert.equal(collision.exists,true);assert.equal(await occupied.files.get(planned.filename).text(),'用户的笔记');
 const missing=new Directory('缺少附件');
 await assert.rejects(LibraryObsidian.send(missing,card,async()=>null),/附件缺失/);
 assert.equal(missing.files.size,0);assert.equal(missing.dirs.size,0);
 console.log('PASS: Obsidian Markdown, actual attachment paths and bytes, separate directory, permission/cancel, repeated send after rename, and no file overwrite.');
 console.log('PASS: optional titles, draft-free reader, multiple independent drafts, per-card save, legacy draft migration and note collection with original references.');
 console.log('PASS: library UI creation, binary attachment, draft resume, search, status editing, full ZIP restore into empty storage, local directory mirror and restore, revoked permission and failed-save preservation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
