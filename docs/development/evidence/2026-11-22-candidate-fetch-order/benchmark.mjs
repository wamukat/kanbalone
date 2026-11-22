import {chromium,expect} from '@playwright/test';import fs from 'node:fs';import {execFileSync} from 'node:child_process';import crypto from 'node:crypto';
const out='coverage/candidate-fetch';
const sources={before:execFileSync('git',['show','c12cf07:public/app-ticket-relations.js'],{encoding:'utf8'}),after:fs.readFileSync('public/app-ticket-relations.js','utf8')};
const samples=[],browser=await chromium.launch();
try{
for(const [bid,id,count] of [[1,1,1005],[2,1001,10005]])for(let run=0;run<6;run++)for(const phase of run%2?['after','before']:['before','after']){
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',colorScheme:'light'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/app-ticket-relations.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:sources[phase]}));
await page.goto(`http://127.0.0.1:3641/tickets/${id}`);await page.locator('#header-edit-button').click();
if(!await page.locator('#ticket-child-search').isVisible()){await page.locator('#ticket-relation-add-button').click();await page.locator('[data-relation-add-type="child"]').click();}
await page.locator('#ticket-child-search').focus();
await page.waitForLoadState('networkidle');
const requests=()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/tickets?')&&new URL(x.name).searchParams.get('archived')==='all').map(x=>({name:x.name,start:x.startTime,end:x.responseEnd,bytes:x.encodedBodySize}));
for(const [kind,query] of [['first','999'],['repeat','998'],['no-match','not-a-real-candidate']]){
await page.evaluate(({query})=>{const el=document.querySelector('#ticket-child-search'),list=document.querySelector('#ticket-child-options');el.value=query;const start=performance.now();window.__op={start};const observer=new MutationObserver(()=>{if(list.getAttribute('aria-busy')==='true'||!list.children.length)return;observer.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__op.ms=performance.now()-start;window.__op.ids=[...list.querySelectorAll('[data-child-id]')].map(e=>Number(e.dataset.childId));window.__op.focused=document.activeElement.id==='ticket-child-search';}));});observer.observe(list,{childList:true,subtree:true,attributes:true});el.dispatchEvent(new Event('input',{bubbles:true}));window.__op.syncMs=performance.now()-start;},{query});
await page.waitForFunction(()=>window.__op?.ms!==undefined,{},{timeout:90000});
const result=await page.evaluate(()=>window.__op);
if(kind==='no-match' ? result.ids.length!==0 : result.ids.length===0)throw Error('Unexpected result count');
const req=await page.evaluate(requests);samples.push({phase,count,run,warmup:run===0,kind,query,...result,requests:req.filter(x=>x.start>=result.start),errors});console.log(phase,count,run,kind,Math.round(result.ms),Math.round(result.syncMs),result.ids.length);
if(run===5&&kind==='repeat')await page.screenshot({path:`${out}/${phase}-${count}.png`});
}
await context.close();fs.writeFileSync(`${out}/benchmark.json`,JSON.stringify({baseline:'c12cf07f21e5abde1dbde5781e0975c864615a10',candidateSha256:crypto.createHash('sha256').update(sources.after).digest('hex'),browser:browser.version(),samples},null,2));
}
}finally{await browser.close();}
