import { test, expect, type Page } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard, createTicket, showCurrentTicket } from './helpers.js';
import path from 'node:path';
const before=Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
const body='Purpose 日本語😀\n\n- [ ] Review **layout**\n  - [x] Preserve nested item\n- [ ] Review **layout**\n\n```md\n- [ ] Keep code unchanged\n```\n\nOther text stays intact.';
async function start(page:Page,locale='en') {
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(locale=>localStorage.setItem('kanbalone:language',locale),locale);
  const app=buildApp({dbFile:createDbFile(),staticDir:process.env.EVIDENCE_BASELINE_PUBLIC||path.join(process.cwd(),'public')});
  await app.listen({host:'127.0.0.1',port:await getFreePort()});
  const baseUrl=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  const {board,lanes}=await createBoard(page.request,baseUrl,{name:'Body checklist',laneNames:['Todo']});
  const ticket=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Review notes',bodyMarkdown:body});
  const open=async()=>{await page.goto(`${baseUrl}/boards/${board.id}`);await page.getByRole('button',{name:'Review notes',exact:true}).click();await showCurrentTicket(page);};
  await open();
  return {baseUrl,ticket,open,read:async()=>(await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json(),close:async()=>{await page.close();await closeTestApp(app);}};
}
for(const locale of ['ja','en']) test(`${locale}: body checklist toggles only its source marker and survives reload`,async({page})=>{
  const f=await start(page,locale);
  try {
    const markers=page.locator('#ticket-view-body .task-checkbox');
    await expect(markers).toHaveCount(3);
    if(process.env.EVIDENCE_DIR) await page.screenshot({path:`${process.env.EVIDENCE_DIR}/${locale}-body.png`});
    if(before) {await expect(page.locator('#ticket-view-body input[type=checkbox]')).toHaveCount(0);return;}
    const checks=page.locator('[data-detail-checklist-offset]');
    await checks.first().focus();await page.keyboard.press('Space');
    await expect(checks.first()).toBeChecked();await expect(checks.first()).toBeFocused();
    const changed=body.replace('- [ ] Review','- [x] Review');
    expect((await f.read()).bodyMarkdown).toBe(changed);
    await f.open();await expect(checks.first()).toBeChecked();await expect(checks.nth(2)).not.toBeChecked();
    await checks.first().click();await expect.poll(async()=>(await f.read()).bodyMarkdown).toBe(body);
  } finally {await f.close();}
});
test('failed and stale checklist saves preserve stored text and allow explicit retry',async({page})=>{
  const f=await start(page);
  try {
    const check=page.locator('[data-detail-checklist-offset]').first();
    const url=`**/api/tickets/${f.ticket.id}`;
    await page.route(url,route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{error:'Checklist save unavailable'}}):route.continue());
    await check.click();await expect(page.getByText('Checklist save unavailable',{exact:true})).toBeVisible();
    await expect(check).not.toBeChecked();await expect(check).toBeEnabled();expect((await f.read()).bodyMarkdown).toBe(body);
    await page.unroute(url);
    const external=body+'\n\nConcurrent note';
    await page.route(url,async route=>{
      if(route.request().method()==='PATCH') await page.request.patch(`${f.baseUrl}/api/tickets/${f.ticket.id}`,{data:{bodyMarkdown:external}});
      await route.continue();
    });
    await check.click();await expect(page.getByText('ticket was edited; reload before saving',{exact:true})).toBeVisible();
    expect((await f.read()).bodyMarkdown).toBe(external);await expect(check).not.toBeChecked();
    await page.unroute(url);await f.open();await check.click();await expect(check).toBeChecked();
    expect((await f.read()).bodyMarkdown).toBe(external.replace('- [ ] Review','- [x] Review'));
  } finally {await f.close();}
});
test('pending checklist save disables repeat changes and does not retry a committed save after refresh failure',async({page})=>{
  const f=await start(page);let release=()=>{};
  try {
    let writes=0;const gate=new Promise<void>(resolve=>{release=resolve;});
    await page.route(`**/api/tickets/${f.ticket.id}`,async route=>{
      if(route.request().method()==='PATCH'){writes++;await gate;}
      await route.continue();
    });
    const check=page.locator('[data-detail-checklist-offset]').first();
    await check.click();await expect(check).toBeDisabled();expect(writes).toBe(1);
    await page.route(`**/api/boards/${f.ticket.boardId}`,route=>route.fulfill({status:503,json:{error:'Refresh unavailable'}}));
    release();await expect(check).toBeChecked();expect(writes).toBe(1);
    await expect(page.getByText('Ticket saved, but the view could not refresh. Reload to continue.',{exact:true})).toBeVisible();
    expect((await f.read()).bodyMarkdown).toBe(body.replace('- [ ] Review','- [x] Review'));
  } finally {release();await f.close();}
});
