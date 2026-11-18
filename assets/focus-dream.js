/* Sidereal: drifting galactic light, a continuous near-dust stream, a breathing clock halo. */
(()=>{
 'use strict';
 const view=document.getElementById('focusView'),canvas=document.getElementById('focusDreamCanvas'),dial=document.querySelector('.focus-dial'),panel=document.querySelector('.focus-console'),root=document.documentElement;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const media=matchMedia('(prefers-reduced-motion: reduce)'),TAU=Math.PI*2;
 let W=0,H=0,cx=0,cy=0,radius=170,theme='dark',raf=0,last=0,lastDraw=0,time=0,backdrop=null,paintedTheme='';
 let seed=8675309;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const lerp=(a,b,t)=>a+(b-a)*t,smooth=t=>t*t*(3-2*t);
 // A shared camera drift ties the layers together; depth determines parallax.
 const drift=t=>({x:Math.sin(t*.045)*24,y:Math.sin(t*.031)*16});
 const breathing=t=>{const phase=(t%11)/11;return phase<.42?smooth(phase/.42):1-smooth((phase-.42)/.58);};
 const hash=(x,y)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 function noise(x,y){const i=Math.floor(x),j=Math.floor(y),u=smooth(x-i),v=smooth(y-j);return lerp(lerp(hash(i,j),hash(i+1,j),u),lerp(hash(i,j+1),hash(i+1,j+1),u),v);}
 function cloud(x,y){let value=0,weight=.5;for(let i=0;i<5;i++){value+=noise(x,y)*weight;x=x*2.07+17.3;y=y*2.03+9.1;weight*=.5;}return value;}
 const spine=v=>.12+v*.17+Math.sin(v*5.4)*.025;
 const stars=Array.from({length:125},()=>({x:random(),y:random(),r:.35+Math.pow(random(),3)*1.2,a:.23+random()*.57,p:random()*TAU,depth:random(),warm:random()>.87}));
 const dust=Array.from({length:48},()=>({x:random()*1.2,y:random(),depth:.25+random()*.75,p:random()*TAU,speed:1.4+random()*2.4}));
 // This quiet zone follows the actual dial, including its fullscreen position.
 function quiet(x,y){const d=Math.hypot((x-cx)/radius,(y-cy)/radius);return smooth(Math.max(0,Math.min(1,(d-.92)/.65)));}
 function buildBackdrop(){
  const layer=document.createElement('canvas');layer.width=1024;layer.height=768;
  const c=layer.getContext('2d'),image=c.createImageData(layer.width,layer.height),density=new Float32Array(layer.width*layer.height);
  for(let y=0;y<layer.height;y++)for(let x=0;x<layer.width;x++){
   const u=x/layer.width,v=y/layer.height,warp=noise(u*5+14,v*5)*.055;
   const distance=(u-spine(v)+warp)/.145;
   const gas=cloud(u*6.5+3,v*5.5+11),detail=noise(u*43+2,v*38+7);
   const lane=(u-spine(v)-.018*Math.sin(v*19))/.028;
   const dust=1-Math.exp(-lane*lane)*(.45+.35*noise(u*14,v*19));
   const arm=Math.exp(-distance*distance*1.35)*Math.pow(Math.max(0,gas-.22)*1.8,1.8)*dust*(.72+detail*.4);
   const far=Math.exp(-Math.pow((u-.94)/.32,2)-Math.pow((v-.82)/.48,2))*cloud(u*7+30,v*7)*.17;
   density[y*layer.width+x]=arm+far;
  }
  const grains=Array.from({length:2400},()=>{const v=random(),cluster=random()<.72;return {x:cluster?spine(v)+(random()+random()+random()-1.5)*.115:random(),y:v,r:.16+Math.pow(random(),4)*.55,a:.1+random()*.4};});
  backdrop={layer,c,image,density,grains};
 }
 function paintBackdrop(){
  if(paintedTheme===theme)return;
  const {layer,c,image,density,grains}=backdrop,light=theme==='light',w=layer.width,h=layer.height;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,p=i*4,v=y/h,d=density[i],grain=(hash(x+900,y+500)-.5)*1.5;
   // Low luminance, not a translucent cloud layer: black space stays black.
   image.data[p]=light?245-d*26+grain:5+v*2+d*56+grain;
   image.data[p+1]=light?244-d*25+grain:9+v*3+d*68+grain;
   image.data[p+2]=light?240-d*23+grain:21+v*5+d*115+grain;
   image.data[p+3]=255;
  }
  c.putImageData(image,0,0);
  for(const star of grains){c.globalAlpha=star.a*(light?.45:1);c.fillStyle=light?'#737a76':'#c9d9f0';c.beginPath();c.arc(star.x*w,star.y*h,star.r,0,TAU);c.fill();}
  c.globalAlpha=1;paintedTheme=theme;
 }
 function visible(){return root.dataset.view==='focus'&&!document.hidden;}
 function moving(){return visible()&&['idle','running'].includes(view.dataset.state)&&view.dataset.motion==='on'&&view.dataset.background!=='true'&&!media.matches;}
 function nebula(light,t){
  // Elliptical pools of light follow the galaxy edges; the clock shelter is drawn afterward.
  ctx.save();ctx.globalCompositeOperation=light?'source-over':'screen';
  const pools=[{x:.13+Math.sin(t*.033)*.035,y:.3+Math.cos(t*.027)*.09,phase:0,color:light?'134,139,133':'82,106,198'},
   {x:.89+Math.sin(t*.029+2)*.035,y:.64+Math.sin(t*.023)*.10,phase:2.6,color:light?'153,147,140':'69,133,171'}];
  for(const pool of pools){
   const x=pool.x*W,y=pool.y*H,r=Math.min(W,H)*.48,breath=.10+.022*Math.sin(t*.17+pool.phase);
   ctx.save();ctx.translate(x,y);ctx.scale(.8,1.4);const g=ctx.createRadialGradient(0,0,0,0,0,r);
   g.addColorStop(0,`rgba(${pool.color},${breath*(light?.38:1)})`);g.addColorStop(.45,`rgba(${pool.color},${breath*.35*(light?.38:1)})`);g.addColorStop(1,`rgba(${pool.color},0)`);
   ctx.fillStyle=g;ctx.fillRect(-r,-r,r*2,r*2);ctx.restore();
  }
  ctx.restore();
 }
 function nearDust(light,t){
  // Constant pixel speeds avoid fullscreen accelerating the scene. Edge fades hide wrapping.
  const camera=drift(t);
  for(const mote of dust){
   const depth=mote.depth,span=W+100,speed=.65+depth*depth*4.1;
   const x=((mote.x*span+t*speed+camera.x*depth)%span)-50;
   const y=mote.y*H+Math.sin(t*.075+mote.p)*(3+depth*8)+camera.y*depth;
   const q=quiet(x,y),fade=smooth(Math.max(0,Math.min(1,x/70,(W-x)/70,y/45,(H-y)/45)));
   const a=q*fade*(.14+depth*.26)*(.88+.12*Math.sin(t*.19+mote.p));if(a<.01)continue;
   const r=.35+depth*depth*1.65;ctx.globalAlpha=a*(light?.72:1);
   ctx.fillStyle=light?'#737a76':'#c1e4f6';ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();
   if(depth>.68){
    const size=3+depth*6,glow=ctx.createRadialGradient(x,y,0,x,y,size);
    glow.addColorStop(0,light?'#9c968540':'#addbff48');glow.addColorStop(1,light?'#9c968500':'#addbff00');
    ctx.fillStyle=glow;ctx.fillRect(x-size,y-size,size*2,size*2);
   }
  }
  ctx.globalAlpha=1;
 }
 function clockHalo(light,t){
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation=light?'source-over':'screen';
  // Decorative rings never change the SVG arc that reports real remaining time.
  const inhale=breathing(t),expansion=1+inhale*.018;
  const halo=ctx.createRadialGradient(cx,cy,radius*.95,cx,cy,radius*(1.17+inhale*.035)),breath=.045+.075*inhale;
  halo.addColorStop(0,light?'#737a7600':'#98cfff00');halo.addColorStop(.3,`rgba(${light?'115,122,118':'124,190,255'},${breath*(light?.75:1)})`);halo.addColorStop(.64,`rgba(${light?'147,144,137':'164,155,239'},${breath*.4})`);halo.addColorStop(1,light?'#737a7600':'#98cfff00');
  ctx.fillStyle=halo;ctx.fillRect(cx-radius*1.2,cy-radius*1.2,radius*2.4,radius*2.4);
  for(let layer=0;layer<2;layer++){
   const r=radius*(layer?1.095:1.04)*(layer?1+(expansion-1)*.5:expansion);
   const color=light?(layer?'150,145,139':'115,122,118'):(layer?'183,171,242':'157,222,251');
   ctx.strokeStyle=`rgba(${color},${(light?.10:.07)+inhale*(layer?.035:.07)})`;ctx.lineWidth=.55;ctx.beginPath();ctx.arc(cx,cy,r,0,TAU);ctx.stroke();
  }
  ctx.restore();
 }
 function draw(){
  if(!W||!H||!backdrop)return;
  paintBackdrop();const light=theme==='light',t=time;
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.clearRect(0,0,W,H);
  ctx.fillStyle=light?'#f5f4f0':'#050915';ctx.fillRect(0,0,W,H);
  // Overscan lets the distant galaxy drift without exposing a canvas edge.
  const camera=drift(t),dx=camera.x,dy=camera.y;
  ctx.drawImage(backdrop.layer,-W*.025+dx,-H*.025+dy,W*1.05,H*1.05);
  nebula(light,t);
  const shelter=ctx.createRadialGradient(cx,cy,radius*.25,cx,cy,radius*1.85);
  shelter.addColorStop(0,light?'#f5f4f0ee':'#060c1bea');shelter.addColorStop(.52,light?'#f5f4f0b8':'#060c1bb0');shelter.addColorStop(1,light?'#f5f4f000':'#060c1b00');ctx.fillStyle=shelter;ctx.fillRect(0,0,W,H);
  for(const star of stars){
   const depth=.25+star.depth*.75,x=star.x*W+camera.x*(.4+depth*.55)+Math.sin(t*.06+star.p)*2*depth,y=star.y*H+camera.y*(.4+depth*.55)+Math.cos(t*.05+star.p)*1.5*depth,q=quiet(x,y);
   if(q<.01)continue;
   const pulse=.82+.18*Math.sin(t*(.19+star.depth*.13)+star.p);
   ctx.globalAlpha=star.a*q*pulse*(light?.62:1);ctx.fillStyle=light?'#737a76':star.warm?'#e9d5b9':'#cadcf7';
   ctx.beginPath();ctx.arc(x,y,star.r,0,TAU);ctx.fill();
   if(star.r>1.2){
    const glow=ctx.createRadialGradient(x,y,0,x,y,star.r*6);glow.addColorStop(0,light?'#737a7624':'#bcd3ff46');glow.addColorStop(1,light?'#737a7600':'#bcd3ff00');ctx.fillStyle=glow;ctx.fillRect(x-10,y-10,20,20);
    ctx.globalAlpha*=.23;ctx.fillStyle=light?'#737a76':'#cfe2ff';ctx.fillRect(x-4,y-.25,8,.5);ctx.fillRect(x-.25,y-4,.5,8);
   }
  }
  ctx.globalAlpha=1;
  nearDust(light,t);
  // Sparse peripheral events sit above the continuous drift, away from the clock.
  const cycle=t%79,event=cycle<22?0:cycle<49?1:2;
  const flight=(cycle-[7,31,61][event])/2.4,index=(Math.floor(t/79)+event)%3;
  if(!light&&flight>0&&flight<1){
   const origin=[{x:.73,y:.06,span:.15},{x:.035,y:.77,span:.13},{x:.08,y:.08,span:.18}][index];
   const x=W*(origin.x+flight*origin.span),y=H*origin.y+W*flight*origin.span*.42,tail=Math.min(110,W*.065),alpha=Math.sin(flight*Math.PI)*.48*quiet(x,y);
   const trail=ctx.createLinearGradient(x-tail,y-tail*.42,x,y);trail.addColorStop(0,'#c8dfff00');trail.addColorStop(1,`rgba(210,231,255,${alpha})`);
   ctx.strokeStyle=trail;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-tail,y-tail*.42);ctx.lineTo(x,y);ctx.stroke();
   const head=ctx.createRadialGradient(x,y,0,x,y,4);head.addColorStop(0,`rgba(225,239,255,${alpha*.8})`);head.addColorStop(1,'#d8eaff00');ctx.fillStyle=head;ctx.fillRect(x-4,y-4,8,8);
  }
  const edge=ctx.createRadialGradient(W*.52,H*.44,Math.min(W,H)*.2,W*.52,H*.44,Math.max(W,H)*.77);
  edge.addColorStop(0,light?'#737a7600':'#01040d00');edge.addColorStop(1,light?'#737a760e':'#01040d9c');ctx.fillStyle=edge;ctx.fillRect(0,0,W,H);
  clockHalo(light,t);
 }
 function resize(){
  const rect=panel.getBoundingClientRect();if(!rect.width||!rect.height)return;
  W=rect.width;H=rect.height;const ratio=Math.min(devicePixelRatio||1,1.5),width=Math.round(W*ratio),height=Math.round(H*ratio);if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;ctx.setTransform(ratio,0,0,ratio,0,0);}
  const ring=dial.getBoundingClientRect();cx=ring.left-rect.left+ring.width/2;cy=ring.top-rect.top+ring.height/2;radius=ring.width*.43;theme=root.dataset.theme==='light'?'light':'dark';
 }
 function loop(now){raf=0;if(!moving()){last=0;return;}if(!lastDraw||now-lastDraw>=32){if(last)time+=Math.min((now-last)/1000,.1);last=now;lastDraw=now;draw();}raf=requestAnimationFrame(loop);}
 function sync(){
  if(!visible()){cancelAnimationFrame(raf);raf=0;last=0;return;}
  if(!backdrop)buildBackdrop();resize();draw();
  if(moving()){if(!raf){last=0;lastDraw=0;raf=requestAnimationFrame(loop);}}
  else{cancelAnimationFrame(raf);raf=0;last=0;}
 }
 new MutationObserver(sync).observe(view,{attributes:true,attributeFilter:['data-state','data-motion','data-background']});new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-view','data-theme']});
 const sizes=new ResizeObserver(sync);sizes.observe(panel);sizes.observe(dial);document.addEventListener('fullscreenchange',sync);document.addEventListener('visibilitychange',sync);media.addEventListener('change',sync);window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);raf=0;last=0;});sync();
})();
