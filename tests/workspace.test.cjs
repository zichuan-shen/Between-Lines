const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../assets/workspace.js'),'utf8');
const elements = new Map(), winEvents = {}, docEvents = {}, messages = [], scrolls = [];
function get(id) {
  if (!elements.has(id)) elements.set(id, {
    hidden:false, dataset:{src:'assets/koi-garden.html'}, attrs:{}, events:{}, classes:new Set(),
    classList:{toggle(){}}, setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
    hasAttribute(k){return k==='src' ? !!this.src : k in this.attrs;},
    addEventListener(k,fn){this.events[k]=fn;},
    scrollIntoView(){this.scrolled=true;},focus(){this.focused=true;}
  });
  return elements.get(id);
}
const frame=get('gardenFrame');frame.contentWindow={postMessage:message=>messages.push(message)};
const doc={documentElement:{dataset:{}},hidden:false,getElementById:get,querySelector:()=>get('summary'),addEventListener:(k,fn)=>docEvents[k]=fn};
const win={scrollY:380,addEventListener:(k,fn)=>winEvents[k]=fn,scrollTo:opts=>scrolls.push(opts.top),dispatchEvent(){}};
vm.runInNewContext(source,{document:doc,window:win,MutationObserver:class{constructor(fn){win.themeChanged=fn;}observe(){}},CustomEvent:class{constructor(type,opts){this.type=type;this.detail=opts.detail;}}});
assert.equal(frame.src,undefined,'Garden loads only when opened');
get('viewGarden').events.click();
assert.equal(frame.src,'assets/koi-garden.html');
assert.equal(get('dashboardView').hidden,true);
assert.equal(get('gardenView').hidden,false);
assert.equal(get('btnSettle').hidden,true);
assert.equal(get('viewGarden').attrs['aria-current'],'page');
assert.equal(messages.at(-1).active,true);
assert.equal(frame.attrs['data-garden-theme'],undefined,'Keep the frame covered before theme confirmation');
const confirmTheme=(message,source=frame.contentWindow)=>winEvents.message({source,data:{type:'quest-garden-theme-applied',theme:message.theme,themeRevision:message.themeRevision}});
const initialTheme=messages.at(-1);
confirmTheme(initialTheme,{});
assert.equal(frame.attrs['data-garden-theme'],undefined);
confirmTheme(initialTheme);
assert.equal(frame.attrs['data-garden-theme'],'dark');
doc.hidden=true;docEvents.visibilitychange();assert.equal(messages.at(-1).active,false);
doc.hidden=false;docEvents.visibilitychange();assert.equal(messages.at(-1).active,true);
get('viewDashboard').events.click();
assert.equal(messages.at(-1).active,false);
assert.equal(get('dashboardView').hidden,false);
assert.equal(get('gardenView').hidden,true);
assert.equal(get('btnSettle').hidden,false);
assert.equal(scrolls.at(-1),380);
get('viewGarden').events.click();
get('btnGoSummary').events.click();
assert.equal(get('dashboardView').hidden,false);
assert.equal(get('summary').scrolled,true);
assert.equal(get('summaryText').focused,true);
const count=messages.length;
winEvents.message({source:{},data:{type:'quest-garden-ready'}});
assert.equal(messages.length,count,'Ignore messages from other windows');
winEvents.message({source:frame.contentWindow,data:{type:'quest-garden-ready'}});
assert.equal(messages.length,count+1);
get('viewFocus').events.click();
assert.equal(get('focusView').hidden,false);assert.equal(get('gardenView').hidden,true);assert.equal(messages.at(-1).active,false);
assert.equal(get('viewFocus').attrs['aria-current'],'page');
winEvents['workspace:navigate']({detail:{view:'garden'}});assert.equal(get('focusView').hidden,true);assert.equal(messages.at(-1).active,true);
get('viewLibrary').events.click();assert.equal(get('libraryView').hidden,false);assert.equal(get('focusView').hidden,true);assert.equal(messages.at(-1).active,false);
get('viewDashboard').events.click();assert.equal(get('libraryView').hidden,true);assert.equal(get('dashboardView').hidden,false);
get('viewNotes').events.click();assert.equal(get('notesView').hidden,false);assert.equal(get('dashboardView').hidden,true);assert.equal(get('viewNotes').attrs['aria-current'],'page');assert.equal(get('workspaceLocation').textContent,'便签');assert.equal(get('btnSettle').hidden,true);assert.equal(messages.at(-1).active,false);
get('viewFocus').events.click();assert.equal(get('notesView').hidden,true);assert.equal(get('focusView').hidden,false);
const beforeUnknown=scrolls.length;winEvents['workspace:navigate']({detail:{view:'sky'}});assert.equal(scrolls.length,beforeUnknown,'Removed routes are ignored');
doc.documentElement.dataset.theme='light';win.themeChanged();assert.equal(messages.at(-1).theme,'light');
assert.equal(frame.attrs['data-garden-theme'],undefined);
const lightTheme=messages.at(-1);
doc.documentElement.dataset.theme='dark';win.themeChanged();assert.equal(messages.at(-1).theme,'dark');
confirmTheme(lightTheme);
confirmTheme(initialTheme);
assert.equal(frame.attrs['data-garden-theme'],undefined,'Ignore an old confirmation even after switching back to the same theme');
get('viewGarden').events.click();
confirmTheme(messages.at(-1));
assert.equal(frame.attrs['data-garden-theme'],'dark');
console.log('PASS: workspace navigation, activity, and visibility gated on garden confirmation for the current theme revision.');
