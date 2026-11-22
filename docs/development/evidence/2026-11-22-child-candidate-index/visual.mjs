import {chromium,expect} from '@playwright/test';import {buildApp} from '../../../../src/app.ts';import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const out='coverage/relation-next/visual';fs.mkdirSync(out,{recursive:true});const before=execFileSync('git',['show','80d7410:public/app-ticket-relations.js'],{encoding:'utf8'}),after=fs.readFileSync('public/app-ticket-relations.js','utf8');const browser=await chromium.launch();const records=[];
try{
for(const lang of ['en','ja'])for(const [theme,width] of [['light',1440],['dark',390]])for(const phase of ['before','after']){
const key=`${lang}-${theme}-${width}-${phase}`,db=path.resolve(out,`${key}.sqlite`);fs.rmSync(db,{force:true});const app=buildApp({dbFile:db,staticDir:path.resolve('public')});await app.listen({host:'127.0.0.1',port:0});const base=`http://127.0.0.1:${app.server.address().port}`;
const context=await browser.newContext({viewport:{width,height:1000},locale:lang==='ja'?'ja-JP':'en-US',colorScheme:theme});const page=await context.newPage();
const api=async(method,url,data)=>{const r=await context.request.fetch(base+url,{method,data});assert(r.ok(),`${method} ${url} ${r.status()}`);return r.json();};
try{
const {board,lanes}=await api('POST','/api/boards',{name:'Child candidate review',laneNames:['Todo']});
const ticket=(title,extra={})=>api('POST',`/api/boards/${board.id}/tickets`,{title,laneId:lanes[0].id,...extra});
const root=await ticket('Review the child candidates');const selected=await ticket('Existing child',{parentTicketId:root.id});const parent=await ticket('Candidate parent with archived child');await ticket('Archived child',{parentTicketId:parent.id,isArchived:true});const low=await ticket('Candidate low priority',{priority:1});const high=await ticket('Candidate high priority archived',{priority:4,isArchived:true});const equal=await ticket('Candidate equal priority',{priority:4});const other=await ticket('Another parent');await ticket('Candidate with another parent',{parentTicketId:other.id});
await page.route('**/app-ticket-relations.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:phase==='before'?before:after}));await page.goto(`${base}/tickets/${root.id}`);await page.locator('#header-edit-button').click();const search=page.locator('#ticket-child-search');
const capture=async(state)=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:`${out}/${key}-${state}.png`});};
const ids=()=>page.locator('#ticket-child-options [data-child-id]').evaluateAll(es=>es.map(e=>Number(e.dataset.childId)));
await search.fill('Candidate');await expect.poll(ids).toEqual([high.id,equal.id,low.id]);await capture('search');
await search.fill('archived child');await expect(page.locator('#ticket-child-options [data-child-id]')).toHaveCount(0);await capture('excluded');
await search.fill(`#${high.id}`);await expect.poll(ids).toEqual([high.id]);await search.press('Enter');await expect(page.locator('#ticket-child-summary')).toContainText(high.title);await capture('selected');
await page.locator('#cancel-edit-button').click();await expect(page.locator('#ux-submit-button')).toBeVisible();await page.locator('#ux-submit-button').click();assert.equal((await api('GET',`/api/tickets/${high.id}`)).parentTicketId,null);
await page.locator('#header-edit-button').click();await search.fill(`#${high.id}`);await expect.poll(ids).toEqual([high.id]);await search.press('Enter');await page.locator('#editor-form button[type="submit"]').click();await expect(page.locator('#ticket-view')).toBeVisible();await capture('saved');
const saved=await api('GET',`/api/tickets/${root.id}`);assert.deepEqual(saved.children.map(c=>c.id).sort((a,b)=>a-b),[selected.id,high.id]);assert.equal((await api('GET',`/api/tickets/${high.id}`)).parentTicketId,root.id);
await page.reload();await page.locator('#header-edit-button').click();await expect(page.locator('#ticket-child-summary')).toContainText(high.title);await expect(page.locator('#ticket-child-summary')).toContainText(selected.title);
records.push({key,optionIds:[high.id,equal.id,low.id],excludedParentId:parent.id,cancelPreserved:true,savedChildIds:saved.children.map(c=>c.id),reloaded:true});fs.writeFileSync(`${out}/results.json`,JSON.stringify(records,null,2));console.log(key,'PASS');
}finally{await context.close();app.server.closeAllConnections();await app.close();}
}
}finally{await browser.close();}
