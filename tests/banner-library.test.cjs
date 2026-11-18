const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const tick = () => new Promise(resolve => setImmediate(resolve));
const flush = async () => { for (let i=0;i<6;i++) await tick(); };
class Element {
 constructor(id='') { this.id=id; this.events={}; this.children=[]; this.style={}; this.dataset={}; this.attrs={}; this.disabled=false; this.classList={toggle(){}}; }
 addEventListener(type,fn) { (this.events[type] ||= []).push(fn); }
 async fire(type,event={}) { for (const fn of this.events[type] || []) await fn(event); }
 click() { if (!this.disabled) return this.fire('click'); }
 append(...children) { this.children.push(...children); }
 replaceChildren(...children) { this.children=children; }
 setAttribute(k,v) { this.attrs[k]=v; }
 showModal() { this.open=true; }
 close() { this.open=false; return this.fire('close'); }
 getBoundingClientRect() { return {left:20,right:400,top:20,bottom:500}; }
}
async function boot(native=true) {
 const ids=['bannerPicker','bannerGrid','bannerMessage','bannerLocation','bannerRefresh','bannerFolder','bannerFolderInput','bannerClose','bannerUpload','bannerBuiltins','bannerTitle'];
 const el=Object.fromEntries(ids.map(id=>[id,new Element(id)]));
 const data=new Map(), calls=[], revoked=[]; let serial=0, mutate;
 const state={permission:'granted',files:[],cancel:false,reads:0};
 const handle={name:'暗色',async queryPermission(){return state.permission;},async requestPermission(){state.permission='granted';return 'granted';},async *values(){state.reads++;for (const file of state.files) yield {kind:'file',name:file.name,getFile:async()=>file};}};
 el.bannerPicker.querySelectorAll=()=>[...ids.filter(id=>!['bannerPicker','bannerGrid','bannerClose'].includes(id)).map(id=>el[id]),...el.bannerGrid.children];
 const context={Blob,File,document:{documentElement:new Element(),hidden:false,getElementById:id=>el[id],createElement:tag=>new Element(tag),querySelector:()=>new Element(),addEventListener(){}},URL:{createObjectURL(){return 'blob:'+ ++serial;},revokeObjectURL:u=>revoked.push(u)},MutationObserver:class {constructor(fn){mutate=fn;}observe(){}},HeaderArtwork:{async access(mode,operation){return operation({get:k=>data.get(k),put:(v,k)=>data.set(k,v)});},async select(...args){if(state.fail)throw Error('storage');calls.push(['select',...args]);},upload:t=>calls.push(['upload',t])}};
 if(native)context.showDirectoryPicker=async options=>{calls.push(['directory',options]);if(state.cancel)throw Object.assign(Error(),{name:'AbortError'});return handle;};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/banner-catalog.js'),'utf8'),context);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/banner-library.js'),'utf8'),context);
 return {el,data,calls,state,handle,revoked,mutate,async open(t){context.BannerPicker.open(t);await flush();}};
}
(async()=>{
 const app=await boot();await app.open('dark');assert.equal(app.el.bannerGrid.children.length,4);
 await app.el.bannerGrid.children[2].click();assert.equal(app.calls.at(-1)[1].preset,'lucy');assert.equal(app.calls.at(-1)[2],'dark');assert.equal(app.el.bannerPicker.open,false);
 await app.open('light');assert.equal(app.el.bannerGrid.children.length,2);await app.el.bannerGrid.children[1].click();assert.equal(app.calls.at(-1)[1].preset,'daylight');assert.equal(app.calls.at(-1)[2],'light');
 await app.open('dark');app.state.files=[new File(['a'],'夜航.png',{type:'image/png'}),new File(['bad'],'ignore.txt',{type:'text/plain'}),new File(['b'],'New.jpg',{type:''})];
 await app.el.bannerFolder.click();assert.equal(app.data.get('bannerDirectory.dark'),app.handle);assert.equal(app.data.has('bannerDirectory.light'),false);assert.equal(app.el.bannerGrid.children.length,2);
 const chosen=app.el.bannerGrid.children.find(button=>button.children[1].textContent==='夜航.png');await chosen.click();assert.equal(app.calls.at(-1)[1].name,'夜航.png');assert.equal(app.calls.at(-1)[3],'center top');assert.ok(app.revoked.length>=2);
 await app.open('dark');assert.equal(app.el.bannerGrid.children.length,2);app.state.files.push(new File(['c'],'新增.webp',{type:'image/webp'}));await app.el.bannerRefresh.click();assert.equal(app.el.bannerGrid.children.length,3);
 // Denied startup permission does not prompt until a deliberate refresh click.
 await app.el.bannerClose.click();app.state.permission='prompt';const before=app.state.reads;await app.open('dark');assert.equal(app.state.reads,before);assert.match(app.el.bannerMessage.textContent,/重新授权/);await app.el.bannerRefresh.click();assert.ok(app.state.reads>before);
 // Cancel, failed saves and broken preview keep the existing selection intact.
 const count=app.calls.filter(c=>c[0]==='select').length;app.state.cancel=true;await app.el.bannerFolder.click();assert.equal(app.el.bannerPicker.open,true);app.state.cancel=false;
 app.state.fail=true;await app.el.bannerGrid.children[0].click();assert.equal(app.el.bannerPicker.open,true);assert.match(app.el.bannerMessage.textContent,/原图片已保留/);assert.equal(app.calls.filter(c=>c[0]==='select').length,count);app.state.fail=false;
 const broken=app.el.bannerGrid.children[0];await broken.children[0].fire('error');assert.equal(broken.disabled,true);
 await app.el.bannerBuiltins.click();assert.equal(app.el.bannerGrid.children.length,4);
 await app.el.bannerUpload.click();assert.deepEqual(app.calls.at(-1),['upload','dark']);assert.equal(app.el.bannerPicker.open,false);
 await app.open('light');app.mutate();assert.equal(app.el.bannerPicker.open,false);
 // A gesture starting inside and ending outside must not dismiss the dialog.
 await app.open('dark');await app.el.bannerPicker.fire('pointerdown',{button:0,target:app.el.bannerPicker,clientX:100,clientY:100});await app.el.bannerPicker.fire('click',{target:app.el.bannerPicker,clientX:0,clientY:0});assert.equal(app.el.bannerPicker.open,true);
 await app.el.bannerPicker.fire('pointerdown',{button:0,target:app.el.bannerPicker,clientX:0,clientY:0});await app.el.bannerPicker.fire('click',{target:app.el.bannerPicker,clientX:0,clientY:0});assert.equal(app.el.bannerPicker.open,false);
 const fallback=await boot(false);await fallback.open('light');fallback.el.bannerFolderInput.files=[new File(['z'],'day.png',{type:'image/png'})];await fallback.el.bannerFolderInput.fire('change');assert.equal(fallback.el.bannerGrid.children.length,1);await fallback.el.bannerGrid.children[0].click();assert.equal(fallback.calls.at(-1)[1].name,'day.png');assert.equal(fallback.calls.at(-1)[2],'light');
 // Initial assets must be portable paths and exist on disk.
 const catalog={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/banner-catalog.js'),'utf8'),catalog);
 for(const list of Object.values(catalog.BannerCatalog))for(const item of list)assert.ok(fs.existsSync(path.join(__dirname,'..',item.src)));
 const css=fs.readFileSync(path.join(__dirname,'../assets/banner-library.css'),'utf8');assert.match(css,/\.hero-visual \.orbit\{display:none;animation:none\}/);assert.match(css,/prefers-reduced-motion:no-preference/);assert.match(css,/banner-motion-paused/);
 console.log('PASS: theme-isolated presets/folders, read authorization, refresh, preserved crops, file fallback, failure/cancel safety, modal dismissal, URL cleanup and portable assets.');
})().catch(error=>{console.error(error);process.exitCode=1;});
