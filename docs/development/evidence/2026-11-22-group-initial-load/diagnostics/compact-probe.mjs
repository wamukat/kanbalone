import {chromium} from '@playwright/test';import fs from 'node:fs';
const out='coverage/render-next';const browser=await chromium.launch();const results=[];
for(let run=0;run<2;run++)for(const variant of run?['compact','baseline']:['baseline','compact']){
 const c=await browser.newContext({viewport:{width:1440,height:1000},locale:'en-US'});const p=await c.newPage();
 if(variant==='compact')await p.route('**/app-group-view.js',route=>route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(`${out}/compact-group-view.js`,'utf8')}));
 await p.addInitScript(()=>{document.addEventListener('DOMContentLoaded',()=>{const o=new MutationObserver(()=>{if(document.querySelectorAll('.group-ticket-row').length!==10000)return;o.disconnect();requestAnimationFrame(()=>requestAnimationFrame(()=>window.__first=performance.now()))});o.observe(document.body,{childList:true,subtree:true})})});
 await p.goto('http://127.0.0.1:3606/boards/2/group');await p.waitForFunction(()=>window.__first,{}, {timeout:60000});
 const result=await p.evaluate(()=>{let whitespace=0,text=0;const w=document.createTreeWalker(document.querySelector('#group-board'),NodeFilter.SHOW_TEXT);while(w.nextNode()){text++;if(!w.currentNode.textContent.trim())whitespace++}const rows=[...document.querySelectorAll('.group-ticket-row')];return{first:window.__first,textNodes:text,whitespaceNodes:whitespace,elements:document.querySelectorAll('#group-board *').length,scrollHeight:document.querySelector('#group-board').scrollHeight,top:rows[0].getBoundingClientRect().top,lastBottom:rows.at(-1).getBoundingClientRect().bottom,rows:rows.length}});
 if(run===1)await p.screenshot({path:`${out}/${variant}-initial.png`});results.push({variant,run,...result});fs.writeFileSync(`${out}/compact-probe.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));await c.close();
}
await browser.close();
