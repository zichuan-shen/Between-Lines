const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../assets/focus-dream.js'),'utf8');
function boot(){
 const env={raf:new Map(),serial:0,draws:0,textures:0,colors:[],filters:[],alphaPeak:0,alphaMean:0,mutations:[],events:{},windowEvents:{},backdropPositions:[]};
 function context(){return new Proxy({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(image){env.rasterPaints=(env.rasterPaints||0)+1;let sum=0,peak=0;for(let i=3;i<image.data.length;i+=4){sum+=image.data[i];peak=Math.max(peak,image.data[i]);}env.alphaPeak=peak;env.alphaMean=sum/(image.data.length/4);},createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),fillRect(){env.draws++;}},{get:(o,k)=>k in o?o[k]:(()=>{}),set:(o,k,v)=>{if(k==='fillStyle')env.colors.push(v);if(k==='filter')env.filters.push(v);o[k]=v;return true;}});}
 const ctx=context();ctx.drawImage=(...args)=>env.backdropPositions.push(args.slice(1));
 const root={dataset:{view:'dashboard',theme:'dark'}},view={dataset:{state:'idle',motion:'on',background:'false'}},media={matches:false,addEventListener:(k,fn)=>env.mediaChange=fn};
 const panel={getBoundingClientRect:()=>({width:800,height:660,left:100,top:100})},dial={getBoundingClientRect:()=>({width:390,height:390,left:305,top:220})},canvas={getContext:()=>ctx};
 const document={hidden:false,documentElement:root,getElementById:id=>id==='focusView'?view:canvas,querySelector:s=>s==='.focus-dial'?dial:panel,createElement:()=>{env.textures++;return {getContext:()=>context()};},addEventListener:(k,fn)=>env.events[k]=fn};
 vm.runInNewContext(source,{document,window:{addEventListener:(k,fn)=>env.windowEvents[k]=fn},matchMedia:()=>media,devicePixelRatio:2,MutationObserver:class{constructor(fn){env.mutations.push(fn);}observe(){}},ResizeObserver:class{constructor(fn){env.resize=fn;}observe(){}},requestAnimationFrame:fn=>{const id=++env.serial;env.raf.set(id,fn);return id;},cancelAnimationFrame:id=>env.raf.delete(id),Math,Float32Array});
 return {...env,env,root,view,media,document,canvas,frame(now){const pending=[...env.raf];env.raf.clear();for(const [,fn] of pending)fn(now);}};
}
const app=boot();assert.equal(app.env.textures,0,'No hidden startup rendering work');assert.equal(app.env.raf.size,0);
app.root.dataset.view='focus';app.env.mutations[1]();assert.equal(app.env.textures,1);assert.ok(app.env.draws>0);assert.equal(app.env.raf.size,1,'The sky moves as soon as the focus room opens, before starting a timer');assert.equal(app.canvas.width,1200,'Pixel ratio is capped at 1.5');
const before=app.env.backdropPositions.at(-1);for(let t=100;t<=3100;t+=40){app.frame(t);app.env.mutations[0]();}const after=app.env.backdropPositions.at(-1);assert.ok(after[0]-before[0]>2,'Visible galaxy drift within three seconds, even with repeated state notifications');
app.view.dataset.state='running';app.env.mutations[0]();assert.equal(app.env.raf.size,1);app.frame(3200);const first=app.env.draws;app.frame(3216);assert.equal(app.env.draws,first,'Frame rate is throttled');app.frame(3234);assert.ok(app.env.draws>first);
app.view.dataset.state='paused';app.env.mutations[0]();assert.equal(app.env.raf.size,0);
app.view.dataset.state='running';app.view.dataset.motion='off';app.env.mutations[0]();assert.equal(app.env.raf.size,0);assert.ok(app.env.draws>0,'Motion off retains static artwork');
app.view.dataset.motion='on';app.env.mutations[0]();app.document.hidden=true;app.env.events.visibilitychange();assert.equal(app.env.raf.size,0);
app.document.hidden=false;app.env.events.visibilitychange();assert.equal(app.env.raf.size,1);
app.media.matches=true;app.env.mediaChange();assert.equal(app.env.raf.size,0);
assert.equal(app.env.rasterPaints,1,'Galactic texture is cached, not regenerated during animation or pause');
app.root.dataset.theme='light';app.env.mutations[1]();assert.ok(app.env.colors.includes('#f5f4f0'));assert.equal(app.env.textures,1,'One texture buffer is reused across themes');assert.equal(app.env.rasterPaints,2,'Theme change recolors the cached density field once');
app.root.dataset.view='garden';app.env.mutations[1]();assert.equal(app.env.raf.size,0);
assert.equal(app.env.alphaPeak,255,'Cached sky is opaque, so motion cannot accumulate ghost trails');
console.log('PASS: immediate idle/running animation, visible three-second displacement, repeated-notification continuity, cached galaxy, capped resolution/frame rate, pause, motion off, background/module suspension, reduced motion and theme switching.');
