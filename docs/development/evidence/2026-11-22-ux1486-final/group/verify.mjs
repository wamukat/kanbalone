import {chromium,request,expect} from '@playwright/test';
import fs from 'node:fs';
const base='http://127.0.0.1:3556',out='docs/development/evidence/2026-11-22-ux1486-final/group';
const api=await request.newContext({baseURL:base});
const post=async(u,data)=>{const r=await api.post(u,{data});if(!r.ok())throw Error(await r.text());return r.json()};
const b=await chromium.launch(); const results=[];
for(const locale of ['ja-JP','en-US']){
 const log=[];const ctx=await b.newContext({locale,viewport:{width:1280,height:844}});const p=await ctx.newPage();p.setDefaultTimeout(8000);
 const fixture=await post('/api/boards',{name:`Independent Group keyboard ${locale}`,laneNames:['Todo']});const {board,lanes}=fixture;
 const group=await post(`/api/boards/${board.id}/groups`,{name:'Keyboard Group'});
 const parent=await post(`/api/boards/${board.id}/tickets`,{laneId:lanes[0].id,title:'Keyboard parent',bodyMarkdown:'Preserve parent'});
 const child=await post(`/api/boards/${board.id}/tickets`,{laneId:lanes[0].id,title:'Keyboard child',parentTicketId:parent.id,bodyMarkdown:'Preserve child'});
 const snapshot=async()=>Promise.all([parent,child].map(async t=>(await api.get(`/api/tickets/${t.id}`)).json()));
 const focus=async()=>p.evaluate(()=>{const e=document.activeElement,r=e.getBoundingClientRect();return {id:e.id,tag:e.tagName,text:e.textContent?.trim().slice(0,70),action:e.getAttribute('data-group-action'),remove:e.getAttribute('data-group-remove'),rect:{x:r.x,y:r.y,width:r.width,height:r.height},dialog:!!e.closest('dialog[open]')}});
 const key=async(k)=>{await p.keyboard.press(k);log.push({key:k,focus:await focus()})};
 const tabTo=async(sel)=>{for(let n=0;n<100;n++){if(await p.evaluate(s=>document.activeElement.matches(s),sel))return;await key('Tab')}throw Error('Tab unreachable '+sel)};
 const shot=async(name)=>{await p.screenshot({path:`${out}/${locale}-${name}.png`});log.push({checkpoint:name,focus:await focus()})};
 let result={locale,fixture:{...fixture,group,parent,child},log};
 try{
 await p.goto(`${base}/boards/${board.id}/group`);await expect(p.locator('[data-group-action="add"]')).toBeVisible();
 const initial=await snapshot();
 await tabTo('[data-group-action="add"]');await key('Enter');await expect(p.locator('#group-ticket-search')).toBeFocused();await p.keyboard.type('Keyboard child');await key('ArrowDown');await key('Enter');
 await tabTo('[data-group-action="cancel-add"]');await key('Enter');await expect(p.locator('#group-ticket-search')).toHaveCount(0);expect(await snapshot()).toEqual(initial);await shot('add-cancel');
 await tabTo('[data-group-action="add"]');await key('Enter');await expect(p.locator('#group-ticket-search')).toBeFocused();await p.keyboard.type('Keyboard child');await key('ArrowDown');await key('Enter');await tabTo('[data-group-form="members"] button[type="submit"]');await shot('add-selected');await key('Enter');await expect(p.locator('[data-group-remove]')).toHaveCount(1);await expect(p.locator('[data-group-form="members"]')).toHaveCount(0);await shot('added');
 const added=await snapshot();expect(added.map(t=>t.groupId)).toEqual([group.id,group.id]);expect(added[1].parentTicketId).toBe(parent.id);
 await tabTo('[data-group-remove]');await key('Enter');await expect(p.locator('#ux-dialog')).toBeVisible();await shot('remove-confirm');await tabTo('#ux-cancel-button');await key('Enter');await expect(p.locator('#ux-dialog')).not.toBeVisible();expect(await snapshot()).toEqual(added);await shot('remove-cancel');
 await tabTo('[data-group-remove]');await key('Enter');await expect(p.locator('#ux-dialog')).toBeVisible();await tabTo('#ux-submit-button');await key('Enter');await expect(p.locator('[data-group-remove]')).toHaveCount(0);await shot('removed');const removed=await snapshot();expect(removed.map(t=>t.groupId)).toEqual([null,null]);expect(removed[1].parentTicketId).toBe(parent.id);expect(removed.map(t=>t.bodyMarkdown)).toEqual(initial.map(t=>t.bodyMarkdown));
 await p.reload();await expect(p.locator('[data-group-remove]')).toHaveCount(0);expect((await snapshot()).map(t=>t.groupId)).toEqual([null,null]);
 result={...result,status:'passed',initial,added,removed};
 }catch(e){result={...result,status:'failed',error:String(e)};await shot('failure')}
 results.push(result);fs.writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(locale,result.status,result.error||'');await ctx.close();
}
await b.close();await api.dispose();
