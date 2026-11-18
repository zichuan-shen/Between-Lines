const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/header-artwork.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
async function boot(saved,initialTheme='dark'){
 const state={saved:saved instanceof Map?saved:new Map(saved?[['headerImage',saved]]:[]),version:saved instanceof Map?2:saved?1:0,fail:false,revoked:[],urls:new Map(),serial:0,width:1200,height:600};
 const root={dataset:{theme:initialTheme}},elements={};let mutation;
 for(const id of ['headerArtwork','artworkChoose','artworkReset','artworkFile','artworkStatus'])elements[id]={hidden:false,events:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},style:{removeProperty(name){delete this[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}},classList:{toggle(){}},addEventListener(k,f){this.events[k]=f;},click(){this.clicked=true;}};
 function transaction(onDone){
  let pending=0,finished=false;const tx={};
  const store={get:k=>run('get',k),put:(v,k)=>run('put',k,v),delete:k=>run('delete',k)};
  tx.objectStore=()=>store;
  function run(mode,k,v){pending++;const request={};queueMicrotask(()=>{
   if(finished)return;
   if(state.fail){finished=true;tx.error=Error('quota');tx.onerror?.();return;}
   if(mode==='put')state.saved.set(k,v);if(mode==='delete')state.saved.delete(k);
   request.result=mode==='get'?state.saved.get(k):undefined;request.onsuccess?.();pending--;
   setImmediate(()=>{if(!finished&&!pending){finished=true;tx.oncomplete?.();onDone?.();}});
  });return request;}return tx;
 }
 const db={transaction:()=>transaction(),createObjectStore:()=>upgrade.objectStore(),close(){}};let upgrade;
 class Image{constructor(){this.naturalWidth=state.width;this.naturalHeight=state.height;}set src(v){const done=()=>state.decodeError?this.onerror():this.onload();if(state.deferDecode)state.decode=done;else queueMicrotask(done);}}
 const context={document:{documentElement:root,getElementById:id=>elements[id]},Blob,Image,MutationObserver:class{constructor(f){mutation=f;}observe(){}},URL:{createObjectURL:blob=>{const u='blob:test-'+ ++state.serial;state.urls.set(u,blob);return u;},revokeObjectURL:u=>state.revoked.push(u)},indexedDB:{open:(_,version)=>{const r={result:db};queueMicrotask(()=>{if(state.version<version){const oldVersion=state.version;upgrade=transaction(()=>{state.version=version;r.onsuccess();});r.transaction=upgrade;r.onupgradeneeded({oldVersion});}else r.onsuccess();});return r;}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../assets/banner-catalog.js"),"utf8"),context);
 vm.runInNewContext(source,context);
 for(let i=0;i<6;i++)await tick();
 return {state,elements,root,api:context.HeaderArtwork,visible:()=>state.urls.get(elements.headerArtwork.style.backgroundImage?.match(/url\("(.+)"\)/)?.[1]),async flip(t){root.dataset.theme=t;mutation();for(let i=0;i<4;i++)await tick();},upload(blob){elements.artworkChoose.events.click();elements.artworkFile.files=[blob];return elements.artworkFile.events.change();}};
}
(async()=>{
 const image=new Blob(['day'],{type:'image/png'}),dark=new Blob(['night'],{type:'image/webp'});
 const app=await boot();assert.equal(app.visible(),undefined);await app.upload(dark);assert.equal(app.visible(),dark);assert.equal(app.state.saved.get('headerImage.dark'),dark);
 await app.flip('light');assert.equal(app.visible(),undefined);await app.upload(image);assert.equal(app.visible(),image);assert.equal(app.state.saved.get('headerImage.dark'),dark);
 await app.flip('dark');assert.equal(app.visible(),dark);assert.match(app.elements.artworkChoose.attrs['aria-label'],/暗色/);
 const reopened=await boot(app.state.saved,'light');assert.equal(reopened.visible(),image);
 for(const invalid of [new Blob(['svg'],{type:'image/svg+xml'}),{type:'image/png',size:12*1024*1024+1}]){await app.upload(invalid);assert.equal(app.visible(),dark);assert.match(app.elements.artworkStatus.textContent,/请选择|过大/);}
 app.state.width=10000;app.state.height=5000;await app.upload(image);assert.match(app.elements.artworkStatus.textContent,/4000 万/);assert.equal(app.visible(),dark);app.state.width=1200;app.state.height=600;
 app.state.decodeError=true;await app.upload(image);assert.match(app.elements.artworkStatus.textContent,/无法读取/);assert.equal(app.visible(),dark);app.state.decodeError=false;
 app.state.fail=true;await app.upload(image);assert.match(app.elements.artworkStatus.textContent,/未能保存/);assert.equal(app.visible(),dark);app.state.fail=false;
 await app.elements.artworkReset.events.click();assert.equal(app.visible(),undefined);assert.equal(app.state.saved.has('headerImage.dark'),false);await app.flip('light');assert.equal(app.visible(),image);
 // Old shared pictures migrate to two independent slots, and do not return after resetting one.
 const migrated=await boot(dark,'light');assert.equal(migrated.visible(),dark);assert.equal(migrated.state.saved.get('headerImage.dark'),dark);assert.equal(migrated.state.saved.has('headerImage'),false);
 await migrated.elements.artworkReset.events.click();await migrated.flip('dark');assert.equal(migrated.visible(),dark);await migrated.flip('light');assert.equal(migrated.visible(),undefined);assert.equal((await boot(migrated.state.saved,'light')).visible(),undefined);
 // Switching themes while decoding must save to the theme that opened the picker.
 app.state.deferDecode=true;const pending=app.upload(dark);await app.flip('dark');app.state.decode();await pending;assert.equal(app.visible(),undefined);assert.equal(app.state.saved.get('headerImage.light'),dark);await app.flip('light');assert.equal(app.visible(),dark);
 app.state.deferDecode=false;
 await app.api.select({preset:'wallpaper'},'dark');await app.flip('dark');
 assert.match(app.elements.headerArtwork.style.backgroundImage,/夜航/);
 assert.equal(app.elements.headerArtwork.style.backgroundPosition,'center top');
 await app.api.select(dark,'dark','center top');assert.equal(app.visible(),dark);
 assert.equal(app.elements.headerArtwork.style.backgroundPosition,'center top');
 const cropReload=await boot(app.state.saved,'dark');assert.equal(cropReload.visible(),dark);assert.equal(cropReload.elements.headerArtwork.style.backgroundPosition,'center top');
 await app.flip('light');assert.equal(app.elements.headerArtwork.style.backgroundPosition,undefined);
 await assert.rejects(app.api.select({preset:'wallpaper'},'light'),/图片不存在/);
 assert.ok(app.state.revoked.length>0);
 console.log('PASS: independent theme images, persistence, atomic legacy migration, theme-local reset, validation failures preserve image, theme switch during upload and object URL cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1;});
