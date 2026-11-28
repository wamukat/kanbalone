import { test, expect } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard, createTicket, showCurrentTicket } from './helpers.js';
import { createMockGithubAdapter } from '../app-test-helpers.js';
import path from 'node:path';
const baseline=Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
for(const locale of ['ja','en'])test(`${locale}: link and unlink PR/MR without importing or losing local edits`,async({page})=>{
  await page.setViewportSize({width:1440,height:900});await page.addInitScript(locale=>localStorage.setItem('kanbalone:language',locale),locale);
  let remoteCalls=0;
  const app=buildApp({dbFile:createDbFile(),staticDir:process.env.EVIDENCE_BASELINE_PUBLIC||path.join(process.cwd(),'public'),remoteAdapters:{github:createMockGithubAdapter({initial:{provider:'github',instanceUrl:'https://github.com',resourceType:'issue',projectKey:'acme/app',issueKey:'1',displayRef:'acme/app#1',url:'https://github.com/acme/app/issues/1',title:'Tracked issue',bodyMarkdown:'External issue body',state:'open',updatedAt:'2026-11-29T00:00:00Z'},onFetch:()=>{remoteCalls++;}})}});
  const port=await getFreePort();await app.listen({host:'127.0.0.1',port});const base=`http://127.0.0.1:${port}`;
  const capture=async(name:string)=>{if(process.env.EVIDENCE_DIR)await page.screenshot({path:`${process.env.EVIDENCE_DIR}/${locale}-${name}.png`});};
  try {
    const {board,lanes}=await createBoard(page.request,base,{name:'MR/PR review',laneNames:['Todo']});
    const ticket=locale==='ja'?await createTicket(page.request,base,board.id,{laneId:lanes[0].id,title:'Link code changes',bodyMarkdown:'Local notes to keep'}):await (await page.request.post(`${base}/api/boards/${board.id}/remote-import`,{data:{provider:'github',laneId:lanes[0].id,url:'https://github.com/acme/app/issues/1',postBacklinkComment:false}})).json();
    const read=async()=>(await (await page.request.get(`${base}/api/tickets/${ticket.id}`)).json());
    const original=await read();const callsBefore=remoteCalls;
    await page.goto(`${base}/tickets/${ticket.id}`);await showCurrentTicket(page);await capture('empty');
    const root=`${base}/api/tickets/${ticket.id}`;
    if(baseline){
      await page.request.post(root+'/change-request-links',{data:{url:'https://github.com/acme/app/pull/42'}});
      await page.request.post(root+'/change-request-links',{data:{url:'https://gitlab.com/team/long-project-name/-/merge_requests/7'}});
      await page.reload();await showCurrentTicket(page);await expect(page.locator('.ticket-external-reference-row')).toHaveCount(2);await capture('multiple');return;
    }
    const add=page.locator('#link-change-request-button'),input=page.locator('[data-change-request-url]'),submit=page.locator('#ux-submit-button'),cancel=page.locator('#ux-dismiss-button');
    await add.click();await input.fill('https://github.com/acme/app/issues/42');await submit.click();await expect(page.locator('#ux-error')).toBeVisible();await expect(input).toHaveValue('https://github.com/acme/app/issues/42');
    await input.fill('https://github.com/Acme/App/pull/42/?tab=files#diff');await expect(page.locator('#ux-error')).not.toBeVisible();await capture('add');
    await input.press('Tab');await expect(cancel).toBeFocused();await page.keyboard.press('Tab');await expect(submit).toBeFocused();await input.focus();await input.press('Control+Enter');
    await expect(page.locator('#ux-dialog')).not.toBeVisible();await expect(page.locator('.ticket-external-reference-row')).toHaveCount(1);
    await add.click();await input.fill('https://gitlab.com/team/long-project-name/-/merge_requests/7');await submit.click();await expect(page.locator('.ticket-external-reference-row')).toHaveCount(2);await capture('multiple');
    await add.click();await input.fill('https://github.com/ACME/APP/pull/42/');await submit.click();await expect(page.locator('#ux-error')).toBeVisible();expect((await read()).externalReferences).toHaveLength(2);await cancel.click();
    const pr=(await read()).externalReferences.find((r:{provider:string})=>r.provider==='github');const unlink=page.locator(`[data-unlink-change-request="${pr.id}"]`);
    await unlink.click();await expect(cancel).toBeFocused();await expect(page.locator('#ux-message')).toContainText(locale==='ja'?'解除する紐づけ':'Link to unlink');await expect(page.locator('#ux-message')).not.toContainText(locale==='ja'?'削除される内容':'This will delete:');await capture('unlink');await cancel.click();expect((await read()).externalReferences).toHaveLength(2);
    await page.route(`**/change-request-links/${pr.id}`,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary failure'})}));
    await unlink.click();await submit.click();await expect(page.locator('#ux-error')).toHaveText('Temporary failure');expect((await read()).externalReferences).toHaveLength(2);await page.unroute(`**/change-request-links/${pr.id}`);await cancel.press('Meta+Enter');
    await expect(page.locator('#ux-dialog')).not.toBeVisible();await expect(page.locator('.ticket-external-reference-row')).toHaveCount(1);
    await page.reload();await showCurrentTicket(page);await expect(page.locator('.ticket-external-reference-row')).toHaveCount(1);
    if(locale==='ja') {
      await page.locator('[data-detail-edit="body"]').click();const draft=page.locator('[data-detail-body-input]');await draft.fill('Unsaved local draft');
      await add.click();await input.fill('https://github.com/acme/app/pull/99');
      await page.route('**/change-request-links',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporary failure'})}));
      await submit.click();await expect(page.locator('#ux-error')).toHaveText('Temporary failure');await expect(input).toHaveValue('https://github.com/acme/app/pull/99');
      await page.unroute('**/change-request-links');await submit.click();await expect(page.locator('#ux-dialog')).not.toBeVisible();await expect(draft).toHaveValue('Unsaved local draft');
      const ref=(await read()).externalReferences.find((r:{provider:string})=>r.provider==='github');
      await page.locator(`[data-unlink-change-request="${ref.id}"]`).click();
      const {revision:ignoredRevision,id:ignoredId,ticketId:ignoredTicket,kind,createdAt:ignoredCreated,updatedAt:ignoredUpdated,changeRequestStatus:ignoredStatus,...value}=ref;
      await page.request.put(`${root}/external-references/${kind}`,{data:{...value,url:'https://github.com/acme/app/pull/100',issueKey:'100'}});
      await page.request.put(`${root}/external-references/${kind}`,{data:value});
      await submit.click();await expect(page.locator('#ux-error')).toBeVisible();expect((await read()).externalReferences).toHaveLength(2);await cancel.click();await expect(draft).toHaveValue('Unsaved local draft');
      await page.locator('[data-detail-cancel="body"]').click();
    }
    const saved=await read();expect(saved.bodyMarkdown).toBe(original.bodyMarkdown);expect(saved.laneId).toBe(original.laneId);expect(saved.isResolved).toBe(original.isResolved);expect(saved.remote).toEqual(original.remote);expect(remoteCalls).toBe(callsBefore);
  } finally {await page.close();await closeTestApp(app);}
});
