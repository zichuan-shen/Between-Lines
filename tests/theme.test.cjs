const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/theme.js'), 'utf8');
const KEY = 'gpdQuestLog.theme.v1';
function boot(store = new Map(), fail = false) {
  const events = {}, windowEvents = {}, elements = {};
  const root = {dataset:{}};
  for (const id of ['themeToggle','themeIcon','themeLabel']) elements[id] = {
    attrs:{}, events:{}, setAttribute(k,v){this.attrs[k]=v;},
    addEventListener(k,fn){this.events[k]=fn;}
  };
  vm.runInNewContext(source, {
    document:{documentElement:root,addEventListener:(k,fn)=>events[k]=fn,getElementById:id=>elements[id]},
    window:{addEventListener:(k,fn)=>windowEvents[k]=fn},
    localStorage:{getItem:k=>{if(fail)throw Error('disabled');return store.get(k)??null;},setItem:(k,v)=>{if(fail)throw Error('disabled');store.set(k,v);}}
  });
  return {root,store,windowEvents,elements,ready:()=>events.DOMContentLoaded(),click:()=>elements.themeToggle.events.click()};
}
let app=boot();
assert.equal(app.root.dataset.theme,'dark');
app.ready();
assert.equal(app.elements.themeToggle.attrs['aria-checked'],'false');
app.click();assert.equal(app.root.dataset.theme,'light');
assert.equal(app.elements.themeToggle.attrs['aria-checked'],'true');
assert.equal(app.elements.themeLabel.textContent,'亮色');
assert.equal(app.store.get(KEY),'light');
const reopened=boot(app.store);
assert.equal(reopened.root.dataset.theme,'light','Saved theme applies before DOM ready');
app.click();assert.equal(app.root.dataset.theme,'dark');
assert.equal(app.store.get(KEY),'dark');
app=boot(new Map([[KEY,'unknown'],['gpdQuestLog.v1','task data']]));
assert.equal(app.root.dataset.theme,'dark');app.ready();app.click();
assert.equal(app.store.get('gpdQuestLog.v1'),'task data');
app.windowEvents.storage({key:KEY,newValue:'dark'});assert.equal(app.root.dataset.theme,'dark');
app.windowEvents.storage({key:KEY,newValue:'light'});assert.equal(app.root.dataset.theme,'light');
app.windowEvents.storage({key:null,newValue:null});assert.equal(app.root.dataset.theme,'dark');
app=boot(new Map(),true);app.ready();app.click();
assert.equal(app.root.dataset.theme,'light','Switch works when storage is unavailable');
assert.match(app.elements.themeToggle.title,/未能保存/);
console.log('PASS: default dark, toggle, persisted startup before paint, invalid setting, storage failure, cross-tab sync, task data isolation.');
