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
  test(`${locale}: all-board views explain unconfigured boards without expanding saved filters`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const a=await createBoard(page.request,baseUrl,{name:'Configured board',laneNames:['Todo']});
      const first=await createTicket(page.request,baseUrl,a.board.id,{laneId:a.lanes[0].id,title:'Included task'});
      const saved=await (await page.request.post(`${baseUrl}/api/custom-views`,{data:{name:'Desktop review',scope:'all',boardIds:[],rules:[{boardId:a.board.id,mode:'all',tagIds:[]}],completion:'open',showBody:false,showLatestComment:false}})).json();
      const b=await createBoard(page.request,baseUrl,{name:'New board',laneNames:['Todo']});
      const second=await createTicket(page.request,baseUrl,b.board.id,{laneId:b.lanes[0].id,title:'Needs configuration'});
      await page.goto(`${baseUrl}/views/${saved.id}`);
      await expect(page.locator(`[data-view-ticket="${first.id}"]`)).toBeVisible();
      await expect(page.locator(`[data-view-ticket="${second.id}"]`)).toHaveCount(0);
      if(!before) {
        await expect(page.locator('.cv-context')).toContainText(locale==='ja'?'条件を設定したボードのみ対象':'only configured boards match');
        await expect(page.locator(`[data-view-group="${b.board.id}"]`)).toContainText(locale==='ja'?'条件を設定するまで対象外':'Excluded until filters are configured');
      }
      await capture(page,`${locale}-view`);
      expect((await (await page.request.get(`${baseUrl}/api/custom-views/${saved.id}`)).json()).rules).toEqual(saved.rules);
      await page.locator('[data-view-action="edit"]').click();
      await page.locator(`[data-rule-mode="${b.board.id}"]`).selectOption('all');
      await page.locator('#custom-view-form button[type="submit"]').click();
      await expect(page.locator(`[data-view-ticket="${second.id}"]`)).toBeVisible();
      await page.reload();await expect(page.locator(`[data-view-ticket="${second.id}"]`)).toBeVisible();
    } finally {await close();}
  });
  test(`${locale}: new and edit forms identify purpose and retain keyboard saving`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const {board}=await createBoard(page.request,baseUrl,{name:'Desktop workflow',laneNames:['Todo']});
      await page.goto(`${baseUrl}/boards/${board.id}`);
      await page.getByRole('button',{name:locale==='ja'?'新しいチケット':'New ticket',exact:true}).click();
      if(!before) {
        await expect(page.locator('#editor-dialog')).toHaveAccessibleName(new RegExp(locale==='ja'?'新しいチケット':'New ticket'));
        const label=await page.locator('#ticket-lane').locator('..').locator('span').boundingBox();
        const select=await page.locator('#ticket-lane').boundingBox();expect(select!.y).toBeGreaterThan(label!.y);
      }
      await page.locator('#ticket-relation-add-button').click();await page.locator('[data-relation-add-type="child"]').click();
      if(!before) await expect(page.locator('#ticket-child-search')).toHaveAccessibleName(locale==='ja'?'番号・タイトルで子チケットを追加':'Add children by ID or title');
      await capture(page,`${locale}-editor`);
      await page.locator('#ticket-title').fill('Desktop draft');
      await page.locator('#ticket-body').fill('Saved from keyboard');
      const response=page.waitForResponse(r=>r.url().endsWith(`/api/boards/${board.id}/tickets`)&&r.request().method()==='POST');
      await page.locator('#ticket-body').press('Control+Enter');const ticket=await (await response).json();
      await expect(page.locator('#editor-dialog')).toHaveJSProperty('open',false);
      await page.goto(`${baseUrl}/tickets/${ticket.id}`);await showCurrentTicket(page);await page.locator('#header-edit-button').click();
      if(!before) await expect(page.locator('#editor-dialog')).toHaveAccessibleName(new RegExp(locale==='ja'?'チケットを編集':'Edit ticket'));
      await expect(page.locator('#ticket-body')).toHaveValue('Saved from keyboard');
      await page.locator('#ticket-body').fill('Edited from keyboard');await page.locator('#ticket-body').press('Meta+Enter');
      await expect(page.locator('#ticket-view-body')).toContainText('Edited from keyboard');
      await page.reload();await showCurrentTicket(page);await expect(page.locator('#ticket-view-body')).toContainText('Edited from keyboard');
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json()).bodyMarkdown).toBe('Edited from keyboard');
    } finally {await close();}
  });
  test(`${locale}: desktop overflow keeps the final lane and more action reachable`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const {board,lanes}=await createBoard(page.request,baseUrl,{name:'Desktop lanes',laneNames:['Plan','Design','Build','Review','Ship','Done']});
      const lane=lanes.at(-1);await page.request.patch(`${baseUrl}/api/lanes/${lane.id}`,{data:{isCompletionLane:true}});
      for(let i=0;i<8;i++) await createTicket(page.request,baseUrl,board.id,{laneId:lane.id,title:`Completed task ${i+1}`});
      await page.goto(`${baseUrl}/boards/${board.id}`);
      const more=page.locator('.completion-show-more');await expect(more).toBeVisible();
      if(!before) {
        const controls=page.locator('.kanban-scroll-controls');
        await expect(controls).toBeVisible();
        const controlBox=await controls.boundingBox(), searchBox=await page.locator('.toolbar-search').boundingBox();
        expect(Math.abs(controlBox!.y-searchBox!.y)).toBeLessThan(8);
        await expect(controls.locator('button').first()).toBeDisabled();
        await controls.locator('button').last().click();
        await expect.poll(()=>page.locator('#lane-board').evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
      }
      await more.focus();
      const add=page.getByRole('button',{name:locale==='ja'?'新しいレーン':'New lane',exact:true});
      for(let i=0;i<6 && !await add.evaluate(el=>el===document.activeElement);i++) await page.keyboard.press('Tab');
      await expect(add).toBeFocused();
      const viewport=await page.locator('#lane-board').boundingBox(),button=await add.boundingBox();
      expect(button!.x+button!.width).toBeLessThanOrEqual(viewport!.x+viewport!.width+1);
      if(!before) expect(await more.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
      await capture(page,`${locale}-overflow`);
      await page.keyboard.press('Enter');await expect(page.locator('[data-lane-create-input]')).toBeFocused();await page.keyboard.press('Escape');
      await more.click();await expect(page.locator('.ticket-card')).toHaveCount(8);
      expect((await (await page.request.get(`${baseUrl}/api/boards/${board.id}`)).json()).lanes).toHaveLength(6);
    } finally {await close();}
  });
}
