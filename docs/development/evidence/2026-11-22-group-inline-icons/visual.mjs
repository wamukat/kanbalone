import {chromium, expect} from '@playwright/test';
import {buildApp} from '../../../../src/app.ts';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const out='coverage/group-next/visual';fs.mkdirSync(out,{recursive:true});
const files=['app-group-view.js','app-ticket-hierarchy.js','app-ticket-status.js'];
const baseline=Object.fromEntries(files.map(f=>[f,execFileSync('git',['show',`aebd268:public/${f}`],{encoding:'utf8'})]));
const browser=await chromium.launch();const records=[];
try {
for(const lang of ['en','ja'])for(const [theme,width] of [['light',1440],['dark',390]])for(const phase of ['before','after']){
const key=`${lang}-${theme}-${width}-${phase}`;
const db=path.resolve(out,`${key}.sqlite`);fs.rmSync(db,{force:true});
const app=buildApp({dbFile:db,staticDir:path.resolve('public')});await app.listen({host:'127.0.0.1',port:0});
const base=`http://127.0.0.1:${app.server.address().port}`;
const context=await browser.newContext({viewport:{width,height:1000},locale:lang==='ja'?'ja-JP':'en-US',colorScheme:theme});const page=await context.newPage();
const api=async(method,url,data)=>{const r=await context.request.fetch(base+url,{method,data});assert(r.ok(),`${method} ${url} ${r.status()} ${await r.text()}`);return r.json();};
try{
const {board,lanes}=await api('POST','/api/boards',{name:'Group SVG review',laneNames:['Todo','Done']});
await api('PATCH',`/api/lanes/${lanes[1].id}`,{isCompletionLane:true});
const group=await api('POST',`/api/boards/${board.id}/groups`,{name:'Shipping a small improvement',descriptionMarkdown:'Review the parent and child context, then remove a family.'});
const ticket=async(title,extra={})=>api('POST',`/api/boards/${board.id}/tickets`,{laneId:lanes[0].id,title,...extra});
const parent=await ticket('Parent: review the complete family',{groupId:group.id});
const child=await ticket('Child: '+('Long title wraps without moving adjacent actions. ').repeat(5),{parentTicketId:parent.id});
await ticket('Second child: completed work',{parentTicketId:parent.id,laneId:lanes[1].id});
const archived=await ticket('Archived parent: context remains visible',{groupId:group.id,isArchived:true});
await ticket('Child of archived parent',{parentTicketId:archived.id});
await ticket('Archived child',{parentTicketId:archived.id,isArchived:true});
await ticket('Standalone completed ticket',{groupId:group.id,laneId:lanes[1].id});
if(phase==='before')for(const f of files)await page.route(`**/${f}`,r=>r.fulfill({status:200,contentType:'text/javascript',body:baseline[f]}));
await page.goto(`${base}/boards/${board.id}/group`);await expect(page.locator('.group-ticket-row')).toHaveCount(6);
const capture=async(state)=>{await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await page.screenshot({path:`${out}/${key}-${state}.png`});};
await capture('initial');
const geometry=await page.locator('.group-ticket-row').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height,e.textContent]}));
await page.locator('.group-archive-toggle').click();await expect(page.locator('.group-ticket-row')).toHaveCount(7);await capture('archived');
await page.locator('.group-ticket-row').last().scrollIntoViewIfNeeded();await capture('bottom');
await page.locator('.group-archive-toggle').click();await expect(page.locator('.group-ticket-row')).toHaveCount(6);
const target=page.locator(`[data-group-ticket="${child.id}"]`);await target.focus();await page.keyboard.press('Enter');await expect(page.locator('dialog[open]')).toBeVisible();await page.keyboard.press('Escape');await expect(target).toBeFocused();
const remove=page.locator(`[data-group-remove="${parent.id}"]`);await remove.focus();await page.keyboard.press('Enter');await expect(page.locator('#ux-cancel-button')).toBeVisible();await capture('confirm');await page.locator('#ux-cancel-button').click();await expect(remove).toBeFocused();
assert.equal((await api('GET',`/api/tickets/${child.id}`)).groupId,group.id);
await page.keyboard.press('Enter');await page.locator('#ux-submit-button').click();await expect(page.locator(`[data-group-ticket="${child.id}"]`)).toHaveCount(0);await capture('removed');
const saved=await api('GET',`/api/tickets/${child.id}`);assert.equal(saved.groupId,null);assert.equal(saved.parentTicketId,parent.id);assert.equal((await api('GET',`/api/tickets/${parent.id}`)).groupId,null);
await page.reload();await expect(page.locator('.group-ticket-row')).toHaveCount(3);await expect(page.locator(`[data-group-ticket="${child.id}"]`)).toHaveCount(0);
records.push({key,geometry,saved:{groupId:saved.groupId,parentTicketId:saved.parentTicketId},cancelPreserved:true,reloadPreserved:true});fs.writeFileSync(`${out}/results.json`,JSON.stringify(records,null,2));console.log(key,'PASS');
}finally{await context.close();app.server.closeAllConnections();await app.close();}
}
}finally{await browser.close();}
