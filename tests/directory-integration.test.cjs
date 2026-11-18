const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),ui=fs.readFileSync(path.join(__dirname,'../assets/task-directories.js'),'utf8');
const script=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0];new vm.Script(script);
for(const id of ['directoryDialog','directoryMessage','directoryClose','directoryBackup','recordsDirChoose','recordsDirAuthorize','recordsDirStatus','archiveDirChoose','archiveDirAuthorize','archiveDirStatus'])assert.ok(html.includes('id="'+id+'"'),'Directory control is present: '+id);
assert.ok(html.indexOf('src="assets/task-directories.js"')<html.indexOf('const taskDirectoryBindings='));assert.ok(script.indexOf('const taskDirectoryBindings=')<script.indexOf('let S=load()'),'Binding store exists before startup restore/rollover');
assert.match(script,/tx\.onerror=tx\.onabort=\(\)=>rej\(tx\.error\|\|new Error/,'Persistence errors must reach the binding panel');
assert.ok(!script.includes("const dir=await getRecordsDir(true);\n  if(!dir)return;\n  toast('📁 已绑定任务记录。接着选择"),'The sequential two-picker listener is removed');
const css=fs.readFileSync(path.join(__dirname,'../assets/theme-cyber.css'),'utf8'),energy=css.match(/@keyframes cyberRailEnergy\{([^\n]+)\}/)[1];assert.ok(!energy.includes('transform'),'Sidebar energy moves background paint, not overflowing geometry');assert.match(energy,/background-position/);
console.log('PASS: directory dialog wiring, inline syntax, startup initialization order, persistence-error propagation, independent binding actions and contained sidebar-energy animation.');
