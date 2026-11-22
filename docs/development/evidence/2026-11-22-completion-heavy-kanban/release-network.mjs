import {chromium} from '@playwright/test';import fs from 'node:fs';
const b=await chromium.launch();const results=[];
for(const [label,port] of [['v1.0.0',3621],['current-candidate',3616]]){
 const c=await b.newContext({viewport:{width:1440,height:1000},locale:'en-US',colorScheme:'light'});const p=await c.newPage();
 await p.goto(`http://127.0.0.1:${port}/boards/1`);
 await p.waitForFunction(()=>document.querySelectorAll('.ticket-card').length===105);
 // Diagnostic network inventory only; fixed settling wait is excluded from performance claims.
 await p.waitForTimeout(1200);
 const data=await p.evaluate(()=>({openCards:document.querySelectorAll('.ticket-list:not([data-lane-id="4"]) .ticket-card').length,doneCards:document.querySelectorAll('.ticket-list[data-lane-id="4"] .ticket-card').length,requests:performance.getEntriesByType('resource').filter(x=>x.name.includes('/api/')&&/\/tickets$/.test(new URL(x.name).pathname)).map(x=>({path:new URL(x.name).pathname+new URL(x.name).search,bytes:x.encodedBodySize,duration:x.duration}))}));
 const api=await p.request.get(`http://127.0.0.1:${port}/api/boards/1/tickets?limit=1`);const payload=await api.json();data.probe={limit:1,returned:payload.tickets?.length,hasPage:!!payload.page};
 results.push({label,port,...data});await p.screenshot({path:`coverage/completion-heavy/${label}-comparison.png`});await c.close();
}await b.close();fs.writeFileSync('coverage/completion-heavy/release-network.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
