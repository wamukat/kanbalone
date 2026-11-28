import { test, expect, type Page } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard, createTicket } from './helpers.js';
import path from 'node:path';
const baseline = Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
async function order(page: Page, left: string, right: string) {
  if (baseline) return;
  const a=page.locator(left), b=page.locator(right);
  await expect(a).toBeVisible(); await expect(b).toBeVisible();
  expect(await a.evaluate((el, selector) => Boolean(el.compareDocumentPosition(document.querySelector(selector)!) & Node.DOCUMENT_POSITION_FOLLOWING),right)).toBe(true);
  expect((await a.boundingBox())!.x).toBeLessThan((await b.boundingBox())!.x);
  await a.focus(); await page.keyboard.press('Tab'); await expect(b).toBeFocused();
}
for (const locale of ['ja','en']) test(`${locale}: dialog cancel precedes submit visually and by keyboard`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(locale=>localStorage.setItem('kanbalone:language',locale),locale);
  const app=buildApp({dbFile:createDbFile(),staticDir:process.env.EVIDENCE_BASELINE_PUBLIC || path.join(process.cwd(),'public')});
  const port=await getFreePort(); await app.listen({host:'127.0.0.1',port}); const base=`http://127.0.0.1:${port}`;
  const capture=async(name:string)=>{if(process.env.EVIDENCE_DIR) await page.screenshot({path:`${process.env.EVIDENCE_DIR}/${locale}-${name}.png`});};
  try {
    const {board,lanes}=await createBoard(page.request,base,{name:'Desktop workspace',laneNames:['Todo']});
    const ticket=await createTicket(page.request,base,board.id,{laneId:lanes[0].id,title:'Review dialog actions',bodyMarkdown:'Keep this text'});
    await page.goto(`${base}/tickets/${ticket.id}`);await page.locator('#header-edit-button').click();
    await expect(page.locator('#ticket-title')).toBeVisible();await capture('edit');
    await order(page,'#cancel-edit-button','#save-ticket-button');
    await page.locator('#ticket-title').fill('Saved through keyboard');await page.locator('#ticket-title').press('Control+Enter');
    await expect.poll(async()=> (await (await page.request.get(`${base}/api/tickets/${ticket.id}`)).json()).title).toBe('Saved through keyboard');
    await page.goto(`${base}/boards/${board.id}`);await page.locator('#board-settings-toggle-button').click();await page.locator('#delete-board-button').click();
    await expect(page.locator('#ux-dismiss-button')).toBeFocused();await capture('delete');
    await order(page,'#ux-dismiss-button','#ux-submit-button');
    await page.locator('#ux-dismiss-button').click();expect((await page.request.get(`${base}/api/tickets/${ticket.id}`)).status()).toBe(200);
    await page.locator('#delete-board-button').click();await page.locator('#confirm-board-name').fill('Desktop workspace');
    const deleted=page.waitForResponse(r=>r.url().endsWith(`/api/boards/${board.id}`)&&r.request().method()==='DELETE');
    await page.locator('#confirm-board-name').press('Meta+Enter');expect((await deleted).status()).toBe(204);
    expect((await page.request.get(`${base}/api/tickets/${ticket.id}`)).status()).toBe(404);
  } finally {await page.close();await closeTestApp(app);}
});
