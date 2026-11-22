import {chromium} from '@playwright/test';import fs from 'node:fs';
const out='coverage/performance-1512/css-prototype';const browser=await chromium.launch();const results=[];
for(const variant of ['baseline','contain','auto']){
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});const page=await context.newPage();
 await page.addInitScript(({variant})=>{
  window.__probe={variant};document.addEventListener('DOMContentLoaded',()=>{
   const style=document.createElement('style');style.textContent=variant==='contain'?'.group-ticket-family{contain:layout style}':variant==='auto'?'.group-ticket-family{content-visibility:auto;contain-intrinsic-size:auto 52px} .group-ticket-family:has(.group-ticket-child){contain-intrinsic-size:auto 104px}':'';document.head.append(style);
   const observer=new MutationObserver(()=>{
    const rows=document.querySelectorAll('.group-ticket-row');if(rows.length!==10000||window.__probe.initial)return;
    // Browser-only evaluation text: same long child title in all variants, no API writes.
    for(const id of [1008,6000,11000]){const title=document.querySelector(`[data-group-ticket="${id}"] span:last-child`);title.textContent='Long title: '+('review the specification and preserve the current keyboard position '.repeat(9));}
    window.__probe.initial=true;observer.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__probe.first=performance.now()));
   });observer.observe(document.body,{subtree:true,childList:true});
  });
 },{variant});
 await page.goto('http://127.0.0.1:3594/boards/2/group');await page.waitForFunction(()=>window.__probe.first,{}, {timeout:60000});
 const states=[];const measure=async(label)=>{states.push(await page.evaluate(label=>{const viewport=document.querySelector('#group-board');const focus=document.activeElement;return{label,scrollHeight:viewport.scrollHeight,scrollTop:viewport.scrollTop,focused:focus?.getAttribute('data-group-ticket'),firstRow:document.querySelector('.group-ticket-row').getBoundingClientRect().top,lastRow:document.querySelector('.group-ticket-row:last-child')?.getBoundingClientRect().height}},label))};
 await measure('initial');await page.screenshot({path:`${out}/${variant}-initial.png`});
 await page.evaluate(()=>{const v=document.querySelector('#group-board');v.scrollTop=v.scrollHeight/2});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await measure('middle');
 await page.evaluate(()=>{const v=document.querySelector('#group-board');v.scrollTop=v.scrollHeight});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await measure('bottom');
 await page.locator('[data-group-ticket="11000"]').focus();await measure('focus-last');await page.keyboard.press('Tab');await measure('tab-after-last');
 await page.evaluate(()=>{document.querySelector('#group-board').scrollTop=0});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await measure('returned-top');await page.screenshot({path:`${out}/${variant}-returned.png`});
 const initial=await page.evaluate(()=>window.__probe);results.push({...initial,states});fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));await context.close();
}
await browser.close();
