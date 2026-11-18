/* Independent decoration preferences; the focus clock and records are untouched. */
(()=>{
 'use strict';
 const view=document.getElementById('focusView'),toggle=document.getElementById('focusMotionToggle');
 const media=matchMedia('(prefers-reduced-motion: reduce)'),KEY='gpdQuestLog.focus.motion.v1';
 let enabled=true;
 try{enabled=localStorage.getItem(KEY)!=='off';}catch(_){}
 function paint(){
  const moving=enabled&&!media.matches;
  view.dataset.motion=moving?'on':'off';
  view.dataset.background=String(document.hidden);
  toggle.textContent=media.matches?'静态模式':enabled?'动效：开':'动效：关';
  toggle.setAttribute('aria-pressed',String(moving));
  toggle.disabled=media.matches;
  toggle.title=media.matches?'系统已启用“减少动态效果”':moving?'关闭专注舱装饰动效':'开启专注舱装饰动效';
 }
 toggle.addEventListener('click',()=>{
  enabled=!enabled;paint();
  try{localStorage.setItem(KEY,enabled?'on':'off');}
  catch(_){toggle.title+='（本次已切换，偏好未能保存）';}
 });
 media.addEventListener('change',paint);
 document.addEventListener('visibilitychange',paint);
 window.addEventListener('storage',event=>{if(event.key===KEY||event.key===null){enabled=event.newValue!=='off';paint();}});
 paint();
})();
