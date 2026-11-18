const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../assets/hero-title.js'), 'utf8');
const KEY = 'gpdQuestLog.headline.v1';
const LAST = 'gpdQuestLog.headline.last';
function boot(store = new Map(), fail = false) {
  class Element {
    constructor() { this.hidden = false; this.value = ''; this.textContent = ''; this.children = []; this.events = {}; this.attrs = {}; this.classes = new Set(); this.classList = {toggle: (key, on) => on ? this.classes.add(key) : this.classes.delete(key)}; }
    addEventListener(name, cb) { this.events[name] = cb; }
    setAttribute(key, value) { this.attrs[key] = value; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    focus() { this.focused = true; }
    select() {}
    requestSubmit() { this.fire('submit'); }
    fire(name, extra = {}) { this.events[name]({preventDefault() {}, ...extra}); }
  }
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  get('headlineForm').hidden = true;
  vm.runInNewContext(source, {
    document: {getElementById: get, createTextNode: text => ({textContent:text}), createElement: () => new Element()},
    localStorage: {getItem: key => store.get(key) ?? null, setItem: (key, value) => {if(fail) throw Error('quota'); store.set(key,value);}, removeItem: key => {if(fail) throw Error('quota'); store.delete(key);}},
    Math: {random: () => 0, floor: Math.floor}
  });
  return {get, store, title: () => get('heroTitle').children.map(x => x.textContent).join('')};
}
let app = boot();
assert.ok(app.title());
const before = app.title();
assert.notEqual(boot(app.store).title(), before, 'Random opening avoids previous choice');
app.get('headlineEdit').fire('click');
assert.equal(app.get('headlineForm').hidden, false);
app.get('headlineFirst').value = '  自己的节奏  ';
app.get('headlineSecond').value = '认真生活';
app.get('headlineForm').fire('submit');
assert.equal(app.title(), '自己的节奏认真生活');
assert.equal(boot(app.store).title(), app.title(), 'Custom text persists on reopening');
app.get('headlineEdit').fire('click');
app.get('headlineFirst').value = '不要保存';
app.get('headlineCancel').fire('click');
assert.equal(app.title(), '自己的节奏认真生活');
app.get('headlineEdit').fire('click');
app.get('headlineFirst').value = '  ';
app.get('headlineSecond').value = '';
app.get('headlineForm').fire('submit');
assert.equal(app.store.has(KEY), false, 'Blank input resets to random');
app = boot(new Map([[KEY, JSON.stringify(['', '只有第二行'])]]));
assert.equal(app.title(), '只有第二行');
app.get('headlineEdit').fire('click');
app.get('headlineFirst').value = '<img src=x>';
app.get('headlineSecond').value = '';
app.get('headlineForm').fire('keydown', {key:'Enter', ctrlKey:true});
assert.equal(app.get('heroTitle').children[0].textContent, '<img src=x>', 'Text is never interpreted as HTML');
app.get('headlineReset').fire('click');
assert.equal(app.store.has(KEY), false);
app = boot(new Map([[KEY,'{broken']]));
assert.ok(app.title(), 'Corrupt storage falls back safely');
app = boot(new Map(), true);
app.get('headlineEdit').fire('click');
app.get('headlineFirst').value = '保存失败';
app.get('headlineForm').fire('submit');
assert.equal(app.get('headlineForm').hidden, false, 'Storage failure keeps editor open');
assert.match(app.get('headlineStatus').textContent, /未能保存/);
app.get('headlineForm').fire('keydown', {key:'Escape'});
assert.equal(app.get('headlineForm').hidden, true);
console.log('PASS: random rotation, persistence, cancel, reset, single line, literal text, shortcuts, corrupt storage, storage failure.');
