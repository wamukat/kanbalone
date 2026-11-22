import {chromium,request,expect} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';
const base='http://127.0.0.1:3552',out='docs/development/evidence/2026-11-22-ux1486';
const api=await request.newContext({baseURL:base});const results=[];
const post=async(url,data)=>{const r=await api.post(url,{data});if(!r.ok())throw Error(await r.text());return r.json()};
const {board,lanes}=await post('/api/boards',{name:'UX1486 audit fixture',laneNames:['Todo','Acceptance']});
const done=await post(`/api/boards/${board.id}/lanes`,{name:'Done',isCompletionLane:true});
const group=await post(`/api/boards/${board.id}/groups`,{name:'Audit Group',descriptionMarkdown:'## Review\nKeyboard, zoom and recovery.'});
const ticket=await post(`/api/boards/${board.id}/tickets`,{laneId:lanes[0].id,title:'Audit open ticket',bodyMarkdown:'- [ ] Open task\n- [x] Done task\n- Plain list',groupId:group.id});
await post(`/api/boards/${board.id}/tickets`,{laneId:done.id,title:'Audit done ticket',groupId:group.id});
await post(`/api/boards/${board.id}/tickets`,{laneId:done.id,title:'Audit archived ticket',groupId:group.id,isArchived:true});
fs.writeFileSync(`${out}/fixture.json`,JSON.stringify({board,lanes,done,group,ticket},null,2));
const ext=path.resolve('docs/development/evidence/2026-11-22-ux1486/zoom-extension');
async function check(name,fn){try{const detail=await fn();results.push({name,status:'passed',detail});console.log('PASS',name)}catch(e){results.push({name,status:'failed',error:String(e)});console.log('FAIL',name,String(e))}fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2))}
for(const locale of ['ja-JP','en-US']){
 const ctx=await chromium.launchPersistentContext(`/tmp/ux1486-audit-${locale}-${Date.now()}`,{channel:'chromium',headless:true,viewport:{width:1280,height:844},locale,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
 const worker=ctx.serviceWorkers()[0]||await ctx.waitForEvent('serviceworker');const page=await ctx.newPage();
 const zoom=async factor=>{await worker.evaluate(async({base,factor})=>{for(const tab of await chrome.tabs.query({url:base+'/*'}))await chrome.tabs.setZoom(tab.id,factor)},{base,factor});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))};
 try{
 for(const view of ['kanban','list','group'])for(const factor of [1,2])await check(`${locale} ${view} ${factor*100}%`,async()=>{
  await page.goto(`${base}/boards/${board.id}${view==='kanban'?'':'/'+view}`);await expect(page.locator('[data-view-mode="'+view+'"]').first()).toBeAttached();
  await zoom(factor);await expect(page.locator(view==='kanban'?'.ticket-card':view==='list'?'.list-row':'.group-ticket-row').first()).toBeVisible();
  const metrics=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth}));expect(metrics.width).toBe(1280/factor);expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.width);
  await page.screenshot({path:`${out}/${locale}-${view}-${factor*100}.png`});
  const entry=page.locator(view==='kanban'?`.ticket-card[data-ticket-id="${ticket.id}"] button`:view==='group'?`[data-group-ticket="${ticket.id}"]`:`[data-open-ticket-id="${ticket.id}"]`).first();
  await entry.click();await expect(page.locator('#editor-dialog')).toBeVisible();await expect(page.locator('#editor-header-title')).toContainText(ticket.title);
  await expect(page.locator('#ticket-view-body')).toContainText('Open task');
  await page.screenshot({path:`${out}/${locale}-${view}-detail-${factor*100}.png`});
  const cdp=await ctx.newCDPSession(page);const ax=await cdp.send('Accessibility.getFullAXTree');fs.writeFileSync(`${out}/${locale}-${view}-ax-${factor*100}.json`,JSON.stringify(ax,null,2));await cdp.detach();
  await page.keyboard.press('Escape');await expect(page.locator('#editor-dialog')).not.toBeVisible();return metrics;
 });
 await check(`${locale} keyboard dialog and focus return`,async()=>{
  await page.goto(`${base}/boards/${board.id}/list`);await zoom(1);await expect(page.locator('.list-row').first()).toBeVisible();
  // Navigate using Tab from document focus, recording the actual focus path.
  const log=[];let found=false;
  for(let n=0;n<100;n++){await page.keyboard.press('Tab');const f=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,name:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent?.trim(),ticket:document.activeElement.getAttribute('data-open-ticket-id')}));log.push(f);if(f.ticket===String(ticket.id)){found=true;break;}}
  expect(found).toBe(true);await page.keyboard.press('Enter');await expect(page.locator('#editor-dialog')).toBeVisible();
  const inside=[];for(let n=0;n<12;n++){await page.keyboard.press(n<6?'Tab':'Shift+Tab');inside.push(await page.evaluate(()=>({id:document.activeElement.id,inDialog:!!document.activeElement.closest('dialog[open]'),name:document.activeElement.getAttribute('aria-label')||document.activeElement.textContent?.trim().slice(0,80)})));}
  expect(inside.every(f=>f.inDialog)).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('#editor-dialog')).not.toBeVisible();
  const returned=await page.evaluate(()=>({id:document.activeElement.id,ticket:document.activeElement.getAttribute('data-open-ticket-id'),tag:document.activeElement.tagName}));
  fs.writeFileSync(`${out}/${locale}-keyboard.json`,JSON.stringify({log,inside,returned},null,2));await page.screenshot({path:`${out}/${locale}-keyboard-return.png`});expect(returned.ticket).toBe(String(ticket.id));return returned;
 });
 }finally{await ctx.close();}
}
const browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:1280,height:844},locale:'en-US'});const page=await ctx.newPage();
try{
 await page.route(base+'/api/meta',route=>route.fulfill({json:{name:'Kanbalone',version:'1.0.0-rc.2',remoteProviders:[{id:'github',hasCredential:true}]}}));
 await check('simulated external preview failures and retry',async()=>{
  let mode=401;let release;let calls=0;
  await page.route(base+`/api/boards/${board.id}/remote-import/preview`,async route=>{calls++;if(mode==='delay')await new Promise(r=>release=r);if(mode==='timeout')return route.abort('timedout');if(mode!==200&&mode!=='delay')return route.fulfill({status:mode,json:{error:'Simulated upstream '+mode}});return route.fulfill({json:{provider:'github',displayRef:'audit/repo#1',state:'open',title:'Synthetic issue',duplicate:true,existingTicketId:ticket.id,existingTicketRef:'#'+ticket.id}})});
  await page.goto(`${base}/boards/${board.id}`);await page.getByRole('button',{name:'New ticket',exact:true}).first().click();await page.locator('#ticket-title').fill('Preserve draft');await page.locator('#remote-import-create-button').click();await page.locator('#editor-remote-lane').selectOption(String(lanes[0].id));await page.locator('#editor-remote-url').fill('https://github.com/audit/repo/issues/1');
  const before=await (await api.get(`/api/boards/${board.id}/tickets?archived=all`)).json();
  for(const status of [401,429,503,'timeout']){mode=status;await page.locator('#editor-remote-import-preview-button').click();await expect(page.locator('#editor-remote-import-error')).toBeVisible();await expect(page.locator('#editor-remote-url')).toHaveValue('https://github.com/audit/repo/issues/1');await expect(page.locator('#editor-remote-import-submit-button')).toBeDisabled();await page.screenshot({path:`${out}/remote-${status}.png`});}
  mode='delay';await page.locator('#editor-remote-import-preview-button').click();await expect.poll(()=>typeof release).toBe('function');await page.screenshot({path:`${out}/remote-loading.png`});release();await expect(page.locator('#editor-remote-import-preview')).toContainText('Synthetic issue');
  await page.locator('#editor-remote-import-cancel-button').click();await expect(page.locator('#ticket-title')).toHaveValue('Preserve draft');
  const after=await (await api.get(`/api/boards/${board.id}/tickets?archived=all`)).json();expect(after).toEqual(before);return {calls,simulation:'browser-intercepted responses; no real provider requests or credentials',draftPreserved:true,noWrites:true};
 });
 await check('export saved file content',async()=>{
  await page.goto(`${base}/boards/${board.id}`);await page.locator('#board-settings-toggle-button').count().then(async n=>{if(n)await page.locator('#board-settings-toggle-button').click();else await page.getByRole('button',{name:'Board settings'}).click()});
  const downloadPromise=page.waitForEvent('download');await page.locator('#export-board-button').click();const download=await downloadPromise;const filename=`${out}/export.json`;await download.saveAs(filename);const data=JSON.parse(fs.readFileSync(filename,'utf8'));expect(JSON.stringify(data)).toContain('Audit open ticket');expect(JSON.stringify(data)).toContain('Audit Group');return {filename,keys:Object.keys(data),downloadError:await download.failure()};
 });
}finally{await browser.close();await api.dispose();}
