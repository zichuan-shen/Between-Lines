/* Navigation keeps task DOM, focus sessions and the loaded garden alive. */
(() => {
 'use strict';
 const root=document.documentElement,frame=document.getElementById('gardenFrame');
 const entries=[['dashboard','dashboardView','viewDashboard','今日工作台'],['library','libraryView','viewLibrary','灵感馆'],['focus','focusView','viewFocus','专注舱'],['garden','gardenView','viewGarden','锦鲤庭'],['notes','notesView','viewNotes','便签']];
 let active='dashboard',homeScroll=0,gardenTheme,themeRevision=0;
 const currentTheme=()=>root.dataset.theme==='light'?'light':'dark';
 function notify(){
  const theme=currentTheme();
  if(theme!==gardenTheme){gardenTheme=theme;themeRevision++;frame.removeAttribute('data-garden-theme');}
  frame.contentWindow?.postMessage({type:'quest-garden-activity',active:active==='garden'&&!document.hidden,theme,themeRevision},'*');
 }
 function selectView(next){
  if(!entries.some(e=>e[0]===next)||active===next)return;
  if(active==='dashboard')homeScroll=window.scrollY;
  active=next;
  for(const [key,panel,id,label] of entries){
   const selected=key===next,button=document.getElementById(id);
   document.getElementById(panel).hidden=!selected;button.classList.toggle('rail-current',selected);
   if(selected){button.setAttribute('aria-current','page');document.getElementById('workspaceLocation').textContent=label;}
   else button.removeAttribute('aria-current');
  }
  document.getElementById('btnSettle').hidden=next!=='dashboard';root.dataset.view=next;
  if(next==='garden'&&!frame.hasAttribute('src'))frame.src=frame.dataset.src;
  notify();window.scrollTo({top:next==='dashboard'?homeScroll:0,behavior:'instant'});
  window.dispatchEvent(new CustomEvent('workspace:viewchange',{detail:{view:next}}));
 }
 for(const [key,,id] of entries)document.getElementById(id).addEventListener('click',()=>selectView(key));
 window.addEventListener('workspace:navigate',event=>selectView(event.detail?.view));
 frame.addEventListener('load',notify);
 new MutationObserver(notify).observe(root,{attributes:true,attributeFilter:['data-theme']});
 window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow)return;
  if(event.data?.type==='quest-garden-ready')notify();
  if(event.data?.type==='quest-garden-theme-applied'&&event.data.theme===currentTheme()&&event.data.themeRevision===themeRevision){
   frame.setAttribute('data-garden-theme',event.data.theme);
  }
 });
 document.addEventListener('visibilitychange',notify);
 document.getElementById('btnGoSummary').addEventListener('click',()=>{selectView('dashboard');document.querySelector('.summary').scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('summaryText').focus({preventScroll:true});});
})();
