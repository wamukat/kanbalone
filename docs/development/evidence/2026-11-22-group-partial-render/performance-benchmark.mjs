import {chromium} from '@playwright/test';import fs from 'node:fs';
const out='coverage/group-partial-render/performance';const browser=await chromium.launch();const samples=[];
for(const [phase,port] of [['before',3605],['after',3606]])for(const [bid,count] of [[1,1000],[2,10000]]){
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',colorScheme:'light'});const page=await context.newPage();
 await page.goto(`http://127.0.0.1:${port}/boards/${bid}/group`);await page.waitForFunction(n=>document.querySelectorAll('.group-ticket-row').length===n,count,{timeout:90000});
 async function measure(operation,selector,run){
  const button=page.locator(selector).first();await button.focus();
  await button.evaluate((button)=>{window.__operation=null;const row=document.querySelector('.group-ticket-row');const scroll=document.querySelector('#group-board').scrollTop;button.addEventListener('click',()=>{const start=performance.now();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__operation={ms:performance.now()-start,retained:row.isConnected&&row===document.querySelector('.group-ticket-row'),rows:document.querySelectorAll('.group-ticket-row').length,scrollBefore:scroll,scrollAfter:document.querySelector('#group-board').scrollTop,focus:document.activeElement?.getAttribute('data-group-action')||document.activeElement?.getAttribute('name')||document.activeElement?.id}}))},{once:true,capture:true})});
  await button.click();await page.waitForFunction(()=>window.__operation);const result=await page.evaluate(()=>window.__operation);samples.push({phase,count,operation,run,...result});fs.writeFileSync(`${out}/results.json`,JSON.stringify({method:'Actual Playwright button click; in-page event capture performance.now to two requestAnimationFrame callbacks, includes synchronous handler and rendering; no driver actionability wait. Three repetitions, sequential before then after; existing loaded synthetic group. Each board has five additional unassigned candidates. Not human time/INP.',samples},null,2));console.log(phase,count,operation,run,result.ms,result.retained);
 }
 for(let run=0;run<3;run++){
  await measure('edit-description','[data-group-action="edit-description"]',run);
  if(run===0)await page.screenshot({path:`${out}/${phase}-${count}-edit.png`});
  await measure('cancel-description','[data-group-action="cancel-description"]',run);
  await measure('expand-description','[data-group-action="expand-description"]',run);
  await measure('collapse-description','[data-group-action="expand-description"]',run);
 }
 await page.locator('[data-group-action="add"]').click();await page.locator('#group-ticket-search').waitFor();
 for(let run=0;run<3;run++){
  await page.locator('#group-ticket-search').fill('Candidate');await page.locator('[data-group-pick]').first().waitFor();
  await measure('pick-candidate','[data-group-pick]',run);
  await measure('unpick-candidate','[data-group-unpick]',run);
 }
 await context.close();
}
await browser.close();
