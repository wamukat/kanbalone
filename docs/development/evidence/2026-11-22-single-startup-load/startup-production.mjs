import {chromium} from '@playwright/test';import fs from 'node:fs';
const out='coverage/completion-heavy';const browser=await chromium.launch();const samples=[];const stateSource=fs.readFileSync('public/app-state.js','utf8').replace('return {\n    boards:', 'return window.__benchmarkState = {\n    boards:');
async function readyPage(done, candidate){
 const c=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',colorScheme:'light'});const p=await c.newPage();await p.route('**/app-state.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:stateSource}));
 if(!candidate) await p.route('**/app.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync('coverage/completion-heavy/before/public/app.js','utf8')}));
 await p.addInitScript(({done,candidate})=>{
  window.__measure={};document.addEventListener('DOMContentLoaded',()=>{
   const pending=new Set();let lastState='';window.__stateChanges=[];
   const openCount=()=>document.querySelectorAll('.ticket-list:not([data-lane-id="4"]) .ticket-card').length;
   const doneCount=()=>document.querySelectorAll('.ticket-list[data-lane-id="4"] .ticket-card').length;
   const ready=()=>window.__benchmarkState?.boardNavigationReady&&!window.__benchmarkState?.boardNavigationLoading&&!window.__benchmarkState?.boardKeyboardRenderPending;
   const all=()=>ready()&&openCount()===100&&doneCount()===Math.min(done,5);
   const requests=()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/api/boards/1/tickets?'));
   const record=(name,test)=>{if(window.__measure[name]||pending.has(name)||!test())return;pending.add(name);requestAnimationFrame(()=>requestAnimationFrame(()=>{pending.delete(name);if(test())window.__measure[name]=performance.now()}))};
   function frame(){const s=window.__benchmarkState;if(s){const key=[s.boardNavigationLoading,s.boardNavigationReady,s.boardKeyboardRenderPending].join(':');if(key!==lastState){window.__stateChanges.push({time:performance.now(),loading:s.boardNavigationLoading,ready:s.boardNavigationReady,renderPending:s.boardKeyboardRenderPending});lastState=key}}
    record('openFirstPaint',()=>openCount()>0);record('doneFirstPaint',()=>!!document.querySelector('.ticket-list[data-lane-id="4"]')&&doneCount()===Math.min(done,5));record('openUsable',()=>ready()&&openCount()===100);record('doneReady',()=>ready()&&doneCount()===Math.min(done,5));record('overall',()=>all()&&requests().length>=(candidate?4:8));
    if(!window.__measure.overall)requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  });
 },{done,candidate});
 await p.goto(`http://127.0.0.1:${{0:3614,900:3615,9900:3616}[done]}/boards/1`);await p.waitForFunction(()=>window.__measure.overall,{}, {timeout:60000});return {c,p};
}
const resources=()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/api/')).map(x=>({path:new URL(x.name).pathname+new URL(x.name).search,start:x.startTime,end:x.responseEnd,duration:x.duration,bytes:x.encodedBodySize}));

for(let run=0;run<6;run++) for(const candidate of run%2?[true,false]:[false,true]){
 const {c,p}=await readyPage(9900,candidate);const data=await p.evaluate(()=>({...window.__measure,states:window.__stateChanges,openCards:document.querySelectorAll('.ticket-list:not([data-lane-id="4"]) .ticket-card').length,doneCards:document.querySelectorAll('.ticket-list[data-lane-id="4"] .ticket-card').length}));const requests=await p.evaluate(resources); samples.push({candidate,run,warmup:run===0,...data,requests}); console.log(candidate,run,data.overall);await c.close();fs.writeFileSync(`${out}/startup-production.json`,JSON.stringify(samples,null,2));
}await browser.close();
