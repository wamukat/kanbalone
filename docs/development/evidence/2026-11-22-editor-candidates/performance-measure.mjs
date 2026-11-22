import {chromium} from '@playwright/test';
import fs from 'node:fs';
const samples=[],browser=await chromium.launch();
const ports={'before-0':3631,'after-0':3632,'before-9900':3635,'after-9900':3636};
const stateSource=fs.readFileSync('public/app-state.js','utf8').replace('return {\n    boards:', 'return window.__benchmarkState = {\n    boards:');
const requests=()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/api/')).map(x=>({path:new URL(x.name).pathname+new URL(x.name).search,start:x.startTime,end:x.responseEnd,ms:x.duration,bytes:x.encodedBodySize}));
for(let run=0;run<6;run++)for(const done of run%2?[9900,0]:[0,9900])for(const variant of run%2?['after','before']:['before','after'])for(const operation of ['new','detail']){
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',colorScheme:'light'});const page=await context.newPage();
 await page.route('**/app-state.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:stateSource}));
 await page.goto(`http://127.0.0.1:${ports[`${variant}-${done}`]}/boards/1`);
 await page.waitForFunction(()=>window.__benchmarkState?.boardNavigationReady&&!window.__benchmarkState.boardNavigationLoading&&!window.__benchmarkState.boardKeyboardRenderPending&&document.querySelectorAll('.ticket-list:not([data-lane-id="4"]) .ticket-card').length===100);
 await page.locator('.ticket-card[data-ticket-id="1"] .ticket-link').focus();
 await page.evaluate(({operation})=>{window.__op={};document.addEventListener('keydown',e=>{if(e.key!==(operation==='new'?'n':'Enter'))return;const start=performance.now();const obs=new MutationObserver(()=>{if(!document.querySelector('#editor-dialog')?.open)return;obs.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__op={start,end:performance.now(),ms:performance.now()-start,ticketId:window.__benchmarkState.editingTicketId,mode:window.__benchmarkState.dialogMode,titleFocused:document.activeElement.id==='ticket-title'}))});obs.observe(document.querySelector('#editor-dialog'),{attributes:true,attributeFilter:['open']})},{once:true,capture:true})},{operation});
 await page.keyboard.press(operation==='new'?'n':'Enter');await page.waitForFunction(()=>window.__op.end,{}, {timeout:90000});
 const op=await page.evaluate(()=>window.__op);if(operation==='new'&&!op.titleFocused)throw Error('Title not focused');if(operation==='detail'&&op.ticketId!==1)throw Error('Wrong ticket');
 samples.push({kind:'open',operation,variant,done,run,warmup:run===0,...op,requests:(await page.evaluate(requests)).filter(x=>x.start>=op.start)});
 if(operation==='new'){
  await page.locator('#ticket-relation-add-button').click();await page.locator('[data-relation-add-type="related"]').click();
  await page.evaluate(()=>{window.__search={};document.querySelector('#ticket-related-search').addEventListener('input',()=>{const start=performance.now();function ready(){const list=document.querySelector('#ticket-related-options');if(!list.querySelector('[data-related-id="100"]'))return requestAnimationFrame(ready);requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__search={start,end:performance.now(),ms:performance.now()-start,ids:[...list.querySelectorAll('[data-related-id]')].map(x=>Number(x.dataset.relatedId)),focused:document.activeElement.id==='ticket-related-search'}}))};requestAnimationFrame(ready)},{once:true,capture:true})});
  await page.locator('#ticket-related-search').fill('#100');await page.waitForFunction(()=>window.__search.end,{}, {timeout:90000});const data=await page.evaluate(()=>window.__search);if(!data.focused)throw Error('Lost focus');samples.push({kind:'first-related-search',variant,done,run,warmup:run===0,...data,requests:(await page.evaluate(requests)).filter(x=>x.start>=data.start)});
 }
 console.log(run,done,variant,operation,op.ms.toFixed(1));await context.close();fs.writeFileSync('coverage/editor-perf/measurements.json',JSON.stringify(samples,null,2));
}
await browser.close();
