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
  test(`${locale}: new board language leaves existing and completion lanes intact`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const old=await createBoard(page.request,baseUrl,{name:'Existing board',laneNames:['User-defined']});
      await page.goto(`${baseUrl}/boards/${old.board.id}`);
      await page.locator('#new-board-button').click();
      const input=page.locator('[data-board-create-input]');await input.fill('Desktop board');
      const response=page.waitForResponse(r=>r.url().endsWith('/api/boards')&&r.request().method()==='POST');
      await input.press('Enter');const created=await (await response).json();
      await expect(page).toHaveURL(`${baseUrl}/boards/${created.board.id}`);
      const names=before?['todo','doing','Acceptance','done']:locale==='ja'?['未着手','進行中','確認待ち','完了']:['Todo','Doing','Acceptance','Done'];
      await expect(page.locator('.lane-title')).toHaveText(names);
      await capture(page,`${locale}-lanes`);
      expect(created.lanes.map((lane:{isCompletionLane:boolean})=>lane.isCompletionLane)).toEqual([false,false,false,true]);
      await page.reload();await expect(page.locator('.lane-title')).toHaveText(names);
      expect((await (await page.request.get(`${baseUrl}/api/boards/${old.board.id}`)).json()).lanes[0].name).toBe('User-defined');
    } finally {await close();}
  });
  test(`${locale}: comment metadata keeps reference and updater after moving timestamp first`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const {board,lanes}=await createBoard(page.request,baseUrl,{name:'Desktop workflow',laneNames:['Todo']});
      const ticket=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Review note'});
      const comment=await (await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/comments`,{data:{bodyMarkdown:'A review comment.',updater:'Reviewer'}})).json();
      await page.goto(`${baseUrl}/tickets/${ticket.id}`);await showCurrentTicket(page);
      const meta=page.locator('.comment-meta-main');await expect(meta).toContainText('Reviewer');
      await expect(meta).toContainText(`#${comment.id}`);
      expect(await meta.locator(':scope > :first-child').evaluate(el=>el.tagName)).toBe(before?'SPAN':'TIME');
      await expect(meta.locator('time')).toHaveAttribute('datetime',comment.createdAt);
      await capture(page,`${locale}-comment`);
      const stored=await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}/comments`)).json();
      expect(stored.comments[0].id).toBe(comment.id);expect(stored.comments[0].updater).toBe('Reviewer');
      expect(stored.comments[0].bodyMarkdown).toBe('A review comment.');
    } finally {await close();}
  });
  test(`${locale}: color labels reuse the heading and preserve keyboard edits`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const {board}=await createBoard(page.request,baseUrl,{name:'Desktop workflow',laneNames:['Todo']});
      const tag=await createTag(page.request,baseUrl,board.id,{name:'Review',color:'#1F6F5F'});
      await page.goto(`${baseUrl}/boards/${board.id}`);
      await page.getByRole('button',{name:locale==='ja'?'タグを管理':'Manage tags',exact:true}).click();
      await page.locator('.sidebar-tag-badge').click();
      const form=page.locator('[data-sidebar-tag-edit-form]'),toggle=form.locator('[data-color-enabled-for]'),hex=form.locator('[data-field-id="color"]');
      await expect(toggle).toHaveAccessibleName(locale==='ja'?'色を使用':'Use color');
      await expect(hex).toHaveAccessibleName(before?(locale==='ja'?'色':'Color'):(locale==='ja'?'色（16進数）':'Color (HEX)'));
      await capture(page,`${locale}-color`);
      await toggle.focus();await page.keyboard.press('Space');await expect(hex).toBeDisabled();
      await page.keyboard.press('Space');await expect(hex).toBeEnabled();
      await hex.fill('invalid');await form.locator('button[type="submit"]').click();await expect(form.locator('[data-sidebar-tag-error]')).toBeVisible();
      await hex.fill('#123456');await form.locator('button[type="submit"]').click();await expect(form).toHaveCount(0);
      await page.reload();const stored=await (await page.request.get(`${baseUrl}/api/boards/${board.id}`)).json();
      expect(stored.tags.find((item:{id:number})=>item.id===tag.id).color).toBe('#123456');
    } finally {await close();}
  });
  test(`${locale}: removing a group family keeps its tickets and rename stays discoverable`,async({page})=>{
    const {baseUrl,close}=await start(page,locale);
    try {
      const {board,lanes}=await createBoard(page.request,baseUrl,{name:'Desktop workflow',laneNames:['Todo']});
      const group=await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`,{data:{name:'Release'}})).json();
      const parent=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Parent task',groupId:group.id});
      const child=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Child task',parentTicketId:parent.id});
      const solo=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Solo task'});
      await page.goto(`${baseUrl}/boards/${board.id}`);await page.getByRole('button',{name:locale==='ja'?'グループ':'Group',exact:true}).click();
      await page.locator(`[data-select-group="${group.id}"]`).click();
      const remove=page.locator(`[data-group-remove="${parent.id}"]`);await expect(remove).toBeVisible();
      if(!before) await expect(remove.locator('[data-group-row-icon="folder-minus"], svg')).toHaveCount(1);
      await capture(page,`${locale}-group`);
      await page.locator('.group-name').click();await page.locator('[data-group-form="rename"] input').fill('Release review');
      await page.locator('[data-group-form="rename"] button[type="submit"]').click();await expect(page.locator('.group-name')).toContainText('Release review');
      await remove.focus();await page.keyboard.press('Enter');await page.locator('#ux-submit-button').click();
      await expect(page.locator(`[data-group-remove="${parent.id}"]`)).toHaveCount(0);
      for(const id of [parent.id,child.id]) {
        const response=await page.request.get(`${baseUrl}/api/tickets/${id}`);expect(response.status()).toBe(200);expect((await response.json()).groupId).toBeNull();
      }
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${child.id}`)).json()).parentTicketId).toBe(parent.id);
      await page.locator('[data-group-action="add"]').click();
      const submit=page.locator('[data-group-form="members"] button[type="submit"]');
      await expect(submit).toBeDisabled();
      if(!before) await expect(submit).toHaveText(locale==='ja'?'チケットを追加':'Add tickets');
      await page.locator('#group-ticket-search').fill('Solo task');
      await page.locator(`[data-group-pick="${solo.id}"]`).click();
      if(!before) await expect(submit).toHaveText(locale==='ja'?'チケットを1件追加':'Add ticket');
      await expect(submit).toBeEnabled();

    } finally {await close();}
  });
}
