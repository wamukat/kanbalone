import { test, expect, type Page } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard, createTicket, showCurrentTicket } from './helpers.js';
import { KanbanDb } from '../../src/db.js';
import type { ChangeRequestSnapshot, RemoteIssueAdapter } from '../../src/remote/adapters.js';
import path from 'node:path';
const before=Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
async function fixture(page:Page,locale='en') {
  await page.setViewportSize({width:1440,height:900});
  await page.addInitScript(locale=>localStorage.setItem('kanbalone:language',locale),locale);
  const dbFile=createDbFile();const unused=async()=>{throw new Error('Unexpected issue operation');};
  let calls=0;let result:ChangeRequestSnapshot|Error={state:'open',isDraft:false};let gate:Promise<void>|null=null;
  const fetchChangeRequest:NonNullable<RemoteIssueAdapter['fetchChangeRequest']>=async ref=>{calls++;if(gate)await gate;if(ref.issueKey==='8')return {state:'merged',isDraft:false};if(result instanceof Error)throw result;return result;};
  const adapter={provider:'github',fetchIssue:unused,refreshIssue:unused,postComment:unused,fetchChangeRequest};
  const app=buildApp({dbFile,staticDir:process.env.EVIDENCE_BASELINE_PUBLIC||path.join(process.cwd(),'public'),remoteAdapters:{github:adapter,gitlab:{...adapter,provider:'gitlab'}}});
  await app.listen({host:'127.0.0.1',port:await getFreePort()});const baseUrl=`http://127.0.0.1:${(app.server.address() as {port:number}).port}`;
  const db=new KanbanDb(dbFile);const {board,lanes}=await createBoard(page.request,baseUrl,{name:'Review queue',laneNames:['Todo']});
  const ticket=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Review delivery',bodyMarkdown:'Keep local notes'});
  const other=await createTicket(page.request,baseUrl,board.id,{laneId:lanes[0].id,title:'Awaiting fetch'});
  const add=async(id:number,kind:string,key:string,provider='github')=>{
    const host=provider==='github'?'https://github.com':'https://gitlab.example.test';
    await page.request.put(`${baseUrl}/api/tickets/${id}/external-references/${kind}`,{data:{provider,resourceType:provider==='github'?'pull_request':'merge_request',instanceUrl:host,projectKey:'acme/app',issueKey:key,displayRef:`acme/app!${key}`,url:`${host}/acme/app/${provider==='github'?'pull':'-/merge_requests'}/${key}`}});
  };
  await add(ticket.id,'pr-main','7');await add(ticket.id,'mr-review','8','gitlab');await add(ticket.id,'pr-followup','9');await add(other.id,'pr','10');
  const refresh=async(kind:string)=>page.request.post(`${baseUrl}/api/tickets/${ticket.id}/external-references/${kind}/refresh`);
  await refresh('pr-main');await refresh('mr-review');result={state:'closed',isDraft:false};await refresh('pr-followup');
  result=new Error('GitHub request failed: 401 secret');await refresh('pr-followup');
  db.sqlite.prepare("UPDATE ticket_external_reference_status SET fetched_at='2000-01-01T00:00:00.000Z' WHERE reference_id=(SELECT id FROM ticket_external_references WHERE ticket_id=? AND kind='pr-followup')").run(ticket.id);
  result={state:'open',isDraft:false};
  await page.goto(`${baseUrl}/boards/${board.id}/list`);await expect(page.locator(`.list-ticket-link[data-open-ticket-id="${ticket.id}"]`)).toBeVisible();
  return {baseUrl,ticket,calls:()=>calls,setResult:(next:ChangeRequestSnapshot|Error)=>{result=next;},setGate:(next:Promise<void>)=>{gate=next;},
    read:async()=>(await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json(),
    open:async()=>{await page.locator(`.list-ticket-link[data-open-ticket-id="${ticket.id}"]`).click();await showCurrentTicket(page);},
    close:async()=>{await page.close();db.close();await closeTestApp(app);}};
}
async function capture(page:Page,name:string){if(process.env.EVIDENCE_DIR)await page.screenshot({path:`${process.env.EVIDENCE_DIR}/${name}.png`});}
for(const locale of ['ja','en']) test(`${locale}: cached PR and MR states appear in lists and refresh explicitly`,async({page})=>{
  const f=await fixture(page,locale);
  try {
    if(!before){await expect(page.locator('#list-board .change-request-status')).toHaveCount(4);await expect(page.locator('#list-board [data-change-request-state=merged]')).toHaveCount(1);await expect(page.locator('#list-board [data-change-request-state=unknown]')).toHaveCount(1);}
    await capture(page,`${locale}-list`);expect(f.calls()).toBe(4);
    await f.open();await capture(page,`${locale}-detail`);
    if(before){await expect(page.locator('[data-refresh-external-reference]')).toHaveCount(0);return;}
    await expect(page.locator('.ticket-external-reference-ref[href="https://github.com/acme/app/pull/7"]')).toHaveCount(1);
    await expect(page.locator('.ticket-external-reference-ref[href$="/9"] .change-request-status')).toHaveAttribute('title',/2000/);
    f.setResult({state:'merged',isDraft:false});await page.locator('[data-refresh-external-reference=pr-main]').click();
    await expect(page.locator('.ticket-external-reference-ref[href$="/7"] .change-request-status')).toHaveAttribute('data-change-request-state','merged');
    expect(f.calls()).toBe(5);const stored=await f.read();expect(stored.remote).toBeNull();expect(stored.bodyMarkdown).toBe('Keep local notes');expect(stored.externalReferences.find((r:{kind:string})=>r.kind==='pr-main').changeRequestStatus.state).toBe('merged');
    await page.reload();await expect(page.locator('#list-board [data-change-request-state=merged]')).toHaveCount(2);expect(f.calls()).toBe(5);
  } finally {await f.close();}
});
test('refresh failure retains cached state and delayed refresh does not discard a local draft',async({page})=>{
  const f=await fixture(page);let release=()=>{};
  try {
    await f.open();const button=page.locator('[data-refresh-external-reference=pr-main]');
    const original=(await f.read()).externalReferences.find((r:{kind:string})=>r.kind==='pr-main').changeRequestStatus.fetchedAt;
    f.setResult(new Error('GitHub request failed: 429 secret'));await button.click();
    await expect(page.getByText('remote provider rate limit was reached',{exact:true})).toBeVisible();
    await expect(page.locator('.ticket-external-reference-ref[href$="/7"] .change-request-status')).toHaveAttribute('title',/rate limit/);
    expect((await f.read()).externalReferences.find((r:{kind:string})=>r.kind==='pr-main').changeRequestStatus.fetchedAt).toBe(original);
    f.setResult({state:'open',isDraft:true});f.setGate(new Promise<void>(resolve=>{release=resolve;}));await button.click();await expect(button).toBeDisabled();await expect(button).toHaveAttribute('aria-busy','true');
    await page.locator('[data-detail-edit=body]').click();await page.locator('[data-detail-body-input]').fill('Unsaved local draft');release();
    await expect(button).toBeEnabled();await expect(page.locator('[data-detail-body-input]')).toHaveValue('Unsaved local draft');
    expect((await f.read()).bodyMarkdown).toBe('Keep local notes');expect((await f.read()).externalReferences.find((r:{kind:string})=>r.kind==='pr-main').changeRequestStatus.isDraft).toBe(true);
  } finally {release();await f.close();}
});
