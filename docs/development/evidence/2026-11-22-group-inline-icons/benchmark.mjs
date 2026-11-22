import { chromium } from '@playwright/test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out='coverage/group-next/product';fs.mkdirSync(out,{recursive:true});
const files=['app-group-view.js','app-ticket-hierarchy.js','app-ticket-status.js','app-group-icons.js'];
const baseline=Object.fromEntries(files.filter(f=>f!=='app-group-icons.js').map(f=>[f,execFileSync('git',['show',`aebd268:public/${f}`],{encoding:'utf8'})]));
const candidate=Object.fromEntries(files.map(f=>[f,fs.readFileSync(`public/${f}`,'utf8')]));
const browser=await chromium.launch();const samples=[];
try {
for(const [bid,count] of [[1,1000],[2,10000]])for(let run=0;run<6;run++)for(const phase of run%2?['row-inline','baseline']:['baseline','row-inline']) {
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US',colorScheme:'light'});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const file of files)await page.route(`**/${file}`,r=>r.fulfill({status:200,contentType:'text/javascript',body:phase==='baseline'?(baseline[file]??candidate[file]):candidate[file]}));
const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
await page.addInitScript(({count,bid})=>{window.__probe={};document.addEventListener('DOMContentLoaded',()=>{const obs=new MutationObserver(()=>{const rows=[...document.querySelectorAll('.group-ticket-row')];if(rows.length!==count||rows[0]?.querySelector('.ticket-ref')?.textContent!==`#${bid===1?1:1001}`)return;obs.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__probe.rowsReady=performance.now()));});obs.observe(document.body,{childList:true,subtree:true});});},{count,bid});
await page.goto(`http://127.0.0.1:3632/boards/${bid}/group`);
await page.waitForFunction(()=>window.__probe.rowsReady,{},{timeout:90000});
const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x=>[x.name,x.value]));
// Wait for fonts and external SVG resource completion before visual/layout audit (not part of rowsReady).
await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>new URL(e.name).pathname==='/icons.svg'&&e.responseEnd>0));
await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
const result=await page.evaluate(({bid})=>{const rows=[...document.querySelectorAll('.group-ticket-row')];const req=performance.getEntriesByType('resource').filter(x=>x.name.includes(`/api/boards/${bid}/tickets?`)&&x.name.includes('groupId='));return {rowsReady:window.__probe.rowsReady,collectionEnd:Math.max(...req.map(x=>x.responseEnd)),requestCount:req.length,rows:rows.length,scrollHeight:document.querySelector('#group-board').scrollHeight,ids:rows.map(x=>x.querySelector('.ticket-ref').textContent),geometry:rows.map(x=>{const r=x.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}),rowUse:document.querySelectorAll('.group-ticket-row use').length,otherUse:document.querySelectorAll('use').length-document.querySelectorAll('.group-ticket-row use').length,elementCount:document.querySelectorAll('*').length};},{bid});
for(const key of ['ids','geometry']){result[key+'Hash']=crypto.createHash('sha256').update(JSON.stringify(result[key])).digest('hex');delete result[key];}
samples.push({phase,count,run,warmup:run===0,...result,metrics,errors});fs.writeFileSync(`${out}/audit.json`,JSON.stringify({baseline:'aebd2687631ff831c89b67607893f74ab023e532',browser:browser.version(),method:'cold isolated contexts; equal route interception; rows detected + 2rAF; visual audit after fonts/SVG resource; 1 warmup + 5 retained alternating',samples},null,2));
console.log(phase,count,run,Math.round(result.rowsReady),result.geometryHash,errors);
if(run===5)await page.screenshot({path:`${out}/audit-${phase}-${count}.png`});await context.close();
}
}finally{await browser.close();}
