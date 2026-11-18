const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/focus-ambience.js'),'utf8');
function boot({reduced=false,saved=null,hidden=false,fail=false}={}){
 const store=new Map(saved===null?[]:[['gpdQuestLog.focus.motion.v1',saved]]),view={dataset:{}},button={attrs:{},events:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,fn){this.events[k]=fn;}},events={},windowEvents={},media={matches:reduced,addEventListener(k,fn){this.change=fn;}};
 const document={hidden,getElementById:id=>id==='focusView'?view:button,addEventListener:(k,fn)=>events[k]=fn};
 vm.runInNewContext(source,{document,window:{addEventListener:(k,fn)=>windowEvents[k]=fn},matchMedia:()=>media,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>{if(fail)throw Error('quota');store.set(k,v);}}});
 return {store,view,button,events,windowEvents,media,document};
}
let app=boot();assert.equal(app.view.dataset.motion,'on');assert.equal(app.button.attrs['aria-pressed'],'true');app.button.events.click();assert.equal(app.view.dataset.motion,'off');assert.equal(app.store.get('gpdQuestLog.focus.motion.v1'),'off');
app=boot({saved:'off'});assert.equal(app.view.dataset.motion,'off');app.button.events.click();assert.equal(app.view.dataset.motion,'on');
app.document.hidden=true;app.events.visibilitychange();assert.equal(app.view.dataset.background,'true');app.document.hidden=false;app.events.visibilitychange();assert.equal(app.view.dataset.background,'false');
app.media.matches=true;app.media.change();assert.equal(app.view.dataset.motion,'off');assert.equal(app.button.disabled,true);app.media.matches=false;app.media.change();assert.equal(app.view.dataset.motion,'on');
app.windowEvents.storage({key:'gpdQuestLog.focus.motion.v1',newValue:'off'});assert.equal(app.view.dataset.motion,'off');
app=boot({fail:true});app.button.events.click();assert.equal(app.view.dataset.motion,'off');assert.match(app.button.title,/未能保存/);
app=boot({reduced:true});assert.equal(app.view.dataset.motion,'off');assert.equal(app.button.textContent,'静态模式');
console.log('PASS: decoration preference, reload, background pause flag, system reduced motion, cross-tab settings and storage-failure fallback.');
