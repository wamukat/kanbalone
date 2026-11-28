import { test, expect, type Page } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard, createTicket, createTag, showCurrentTicket } from './helpers.js';
import path from 'node:path';

const before = Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
async function start(page: Page, locale: string) {
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(locale => localStorage.setItem('kanbalone:language',locale),locale);
  const app=buildApp({dbFile:createDbFile(),staticDir:process.env.EVIDENCE_BASELINE_PUBLIC || path.join(process.cwd(),'public')});
  await app.listen({host:'127.0.0.1',port:await getFreePort()});
  return {baseUrl:app.server.address() ? `http://127.0.0.1:${(app.server.address() as {port:number}).port}` : '',close:async()=>{await page.close();await closeTestApp(app);}};
}
async function capture(page:Page, name:string) {
  if(process.env.EVIDENCE_DIR) await page.screenshot({path:`${process.env.EVIDENCE_DIR}/${name}.png`});
}
for (const locale of ['ja','en']) {
  test(`${locale}: board identity remains visible in all desktop views`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const {board}=await createBoard(page.request,baseUrl,{name:'Desktop workspace',laneNames:['Todo']});
      await page.goto(`${baseUrl}/boards/${board.id}`);
      if(!before) await expect(page.locator('#board-title')).toBeVisible();
      await capture(page,`${locale}-identity`);
      for(const name of [locale==='ja'?'リスト':'List',locale==='ja'?'グループ':'Group',locale==='ja'?'カンバン':'Kanban']) {
        await page.getByRole('button',{name,exact:true}).click();
        if(!before) {await expect(page.locator('#board-title')).toBeVisible();await expect(page.locator('#board-title')).toHaveText('Desktop workspace');}
      }
      await page.locator('#sidebar-toggle-button').click();
      await expect(page.locator('#board-title')).toBeVisible();
      await page.locator('#sidebar-reopen-button').click();
      if(!before) await expect(page.locator('#board-title')).toBeVisible();
      expect((await (await page.request.get(`${baseUrl}/api/boards/${board.id}`)).json()).board.name).toBe('Desktop workspace');
      if(!before) {
        const longName='Desktop workspace '.repeat(30);
        await page.request.patch(`${baseUrl}/api/boards/${board.id}`,{data:{name:longName}});
        await page.reload();
        await expect(page.locator('#board-title')).toHaveAttribute('title',longName.trim());
        expect(await page.locator('.board-title-row').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(1440);
        expect(await page.locator('#board-title').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
      }

    } finally {await close();}
  });
  test(`${locale}: board deletion previews all tickets and requires the exact current name`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const name='Deletion <sample>';
      const {board,lanes}=await createBoard(page.request,baseUrl,{name,laneNames:['Todo','Review']});
      const other=await createBoard(page.request,baseUrl,{name:'Keep board',laneNames:['Todo']});
      await createTag(page.request,baseUrl,board.id,{name:'Review'});
      const ticket=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Archived work',isArchived:true});
      await createTicket(page.request,baseUrl,board.id,{laneId:lanes[1].id,title:'Current work'});
      await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/comments`,{data:{bodyMarkdown:'Keep until explicitly deleted'}});
      await page.goto(`${baseUrl}/boards/${board.id}`);await page.locator('#board-settings-toggle-button').click();
      let deletes=0;page.on('request',r=>{if(r.method()==='DELETE') deletes++;});
      await page.locator('#delete-board-button').click();await expect(page.locator('#ux-dialog')).toHaveJSProperty('open',true);
      if(!before) {
        await expect(page.locator('#ux-message')).toContainText(locale==='ja'?'チケット（アーカイブ済みを含む）: 2件':'Tickets including archived: 2');
        await expect(page.locator('#ux-message')).toContainText(name);
        await expect(page.locator('#ux-submit-button')).toHaveClass(/danger/);
      }
      await capture(page,`${locale}-delete`);
      if(before) {await page.locator('#ux-dismiss-button').click();expect(deletes).toBe(0);return;}
      await page.locator('#confirm-board-name').fill('wrong');await page.locator('#ux-submit-button').click();
      await expect(page.locator('#ux-error')).toBeVisible();expect(deletes).toBe(0);
      await page.locator('#ux-dismiss-button').click();expect((await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).status()).toBe(200);
      await page.locator('#delete-board-button').click();await page.locator('#confirm-board-name').fill(name);
      await page.request.patch(`${baseUrl}/api/boards/${board.id}`,{data:{name:'Renamed externally'}});
      await page.locator('#ux-submit-button').click();await expect(page.locator('#ux-error')).toBeVisible();expect(deletes).toBe(0);
      await page.locator('#ux-dismiss-button').click();
      await expect(page.locator('#board-title')).toHaveText('Renamed externally');
      await page.locator('#delete-board-button').click();await page.locator('#confirm-board-name').fill('Renamed externally');
      const response=page.waitForResponse(r=>r.url().endsWith(`/api/boards/${board.id}`)&&r.request().method()==='DELETE');
      await page.locator('#confirm-board-name').press('Control+Enter');expect((await response).status()).toBe(204);
      await expect(page.locator('#board-title')).toHaveText('Keep board');expect(deletes).toBe(1);
      expect((await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).status()).toBe(404);
      expect((await page.request.get(`${baseUrl}/api/boards/${other.board.id}`)).status()).toBe(200);
      await page.reload();await expect(page.locator('#board-title')).toHaveText('Keep board');
    } finally {await close();}
  });
}

test('successful deletion closes confirmation even if board refresh fails',async({page})=>{
  const {baseUrl,close}=await start(page,'en');
  try {
    const {board}=await createBoard(page.request,baseUrl,{name:'Delete once',laneNames:['Todo']});
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.locator('#board-settings-toggle-button').click();
    await page.locator('#delete-board-button').click();
    await page.locator('#confirm-board-name').fill('Delete once');
    let deletes=0;page.on('request',r=>{if(r.method()==='DELETE') deletes++;});
    await page.route('**/api/boards',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Refresh unavailable'})}));
    await page.locator('#ux-submit-button').click();
    await expect(page.locator('#ux-dialog')).toHaveJSProperty('open',false);
    expect(deletes).toBe(1);
    expect((await page.request.get(`${baseUrl}/api/boards/${board.id}`)).status()).toBe(404);
  } finally {await close();}
});
