import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createDbFile } from "./app-test-helpers.js";
import type { FastifyInstance } from "fastify";

async function setup() {
  const app = buildApp({dbFile: createDbFile()});
  const board = (await app.inject({method: "POST", url: "/api/boards", payload: {name: "Groups", laneNames: ["Todo", "Done"]}})).json();
  return {app, boardId: board.board.id as number, todo: board.lanes[0].id as number, done: board.lanes[1].id as number};
}
async function group(app: FastifyInstance, boardId: number, name: string) {
  const r = await app.inject({method: "POST", url: `/api/boards/${boardId}/groups`, payload: {name}});
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}
async function ticket(app: FastifyInstance, boardId: number, laneId: number, title: string, extra = {}) {
  const r = await app.inject({method: "POST", url: `/api/boards/${boardId}/tickets`, payload: {laneId, title, ...extra}});
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}
async function assign(app: FastifyInstance, boardId: number, ticketIds: number[], groupId: number|null) {
  const body = {ticketIds, groupId};
  const preview = await app.inject({method: "POST", url: `/api/boards/${boardId}/group-memberships/preview`, payload: body});
  assert.equal(preview.statusCode, 200, preview.body);
  const result = await app.inject({method: "PUT", url: `/api/boards/${boardId}/group-memberships`, payload: {...body, expectedToken: preview.json().expectedToken}});
  assert.equal(result.statusCode, 200, result.body);
  return result.json();
}

test("Group HTTP CRUD, sanitized Markdown, sorting, duplicate names and empty deletion", async t => {
  const {app, boardId} = await setup();t.after(()=>app.close());
  const a = await group(app,boardId,"Zebra"), b = await group(app,boardId,"Alpha");
  const duplicate = await app.inject({method:"POST",url:`/api/boards/${boardId}/groups`,payload:{name:" Alpha "}});
  assert.equal(duplicate.statusCode,409,duplicate.body);
  const sorted = (await app.inject(`/api/boards/${boardId}/groups?sort=name&order=asc`)).json();
  assert.deepEqual(sorted.groups.map((g: {id:number})=>g.id),[b.id,a.id]);
  assert.equal(sorted.groups[0].isActive,true);
  const updated=await app.inject({method:"PATCH",url:`/api/groups/${a.id}`,payload:{expectedRevision:a.revision,descriptionMarkdown:"**purpose** <script>alert(1)</script>"}});
  assert.equal(updated.statusCode,200,updated.body);assert.match(updated.json().descriptionHtml,/<strong>purpose<\/strong>/);assert.doesNotMatch(updated.json().descriptionHtml,/<script>/);
  const stale=await app.inject({method:"PATCH",url:`/api/groups/${a.id}`,payload:{expectedRevision:a.revision,name:"New"}});
  assert.equal(stale.statusCode,409,stale.body);
  const missing=await app.inject({method:"DELETE",url:`/api/groups/${a.id}`});assert.equal(missing.statusCode,428);
  const removed=await app.inject({method:"DELETE",url:`/api/groups/${a.id}`,headers:{"if-match":updated.headers.etag}});assert.equal(removed.statusCode,204,removed.body);
  const c=await group(app,boardId,"Next");assert.ok(c.id>a.id);
  const markdown=await app.inject({method:"POST",url:"/api/markdown/preview",payload:{bodyMarkdown:"[bad](javascript:alert(1)) **safe**"}});assert.equal(markdown.statusCode,200);assert.doesNotMatch(markdown.json().bodyHtml,/href="javascript:/);
});

test("Group memberships include archived children and expose group metadata through strict response schemas", async t => {
  const {app,boardId,todo,done}=await setup();t.after(()=>app.close());
  await app.inject({method:"PATCH",url:`/api/lanes/${done}`,payload:{isCompletionLane:true}});
  const a=await group(app,boardId,"Work"), other=await group(app,boardId,"Other");
  const p=await ticket(app,boardId,todo,"Parent");
  const c=await ticket(app,boardId,todo,"Archived child",{parentTicketId:p.id,isArchived:true});
  await assign(app,boardId,[c.id],a.id);
  const detail=(await app.inject(`/api/tickets/${p.id}`)).json();assert.equal(detail.group.id,a.id);assert.equal(detail.groupId,a.id);assert.equal(detail.children[0].groupId,a.id);assert.equal(typeof detail.editToken,"string");
  const visible=(await app.inject(`/api/boards/${boardId}/tickets?groupId=${a.id}`)).json();assert.equal(visible.tickets.length,1);assert.equal(visible.tickets[0].group.name,"Work");
  const all=(await app.inject(`/api/boards/${boardId}/tickets?groupId=${a.id}&archived=all`)).json();assert.equal(all.tickets.length,2);
  assert.equal((await app.inject(`/api/boards/${boardId}/tickets?groupId=${a.id}&ungrouped=true`)).statusCode,400);
  const direct=await app.inject({method:"PATCH",url:`/api/tickets/${p.id}`,payload:{groupId:other.id}});assert.equal(direct.statusCode,400);
  const overwrite=await app.inject({method:"POST",url:`/api/boards/${boardId}/group-memberships/preview`,payload:{ticketIds:[p.id],groupId:other.id}});assert.equal(overwrite.statusCode,409);
  await app.inject({method:"PATCH",url:`/api/tickets/${p.id}`,payload:{laneId:done}});
  const inactive=(await app.inject(`/api/groups/${a.id}`)).json();assert.equal(inactive.isActive,false);
  const active=(await app.inject(`/api/boards/${boardId}/groups`)).json();assert.ok(!active.groups.some((g:{id:number})=>g.id===a.id));
  assert.equal((await app.inject({method:"DELETE",url:`/api/groups/${a.id}`,headers:{"if-match":`"${inactive.revision}"`}})).statusCode,409);
  await assign(app,boardId,[p.id],null);
  assert.equal((await app.inject(`/api/groups/${a.id}`)).json().isActive,true);
});

test("atomic child editing conflicts preserve error details and cancel does not partially save", async t => {
  const {app,boardId,todo}=await setup();t.after(()=>app.close());
  const a=await group(app,boardId,"A"),b=await group(app,boardId,"B"),c=await group(app,boardId,"C");
  const p=await ticket(app,boardId,todo,"Parent",{groupId:a.id});
  const child=await ticket(app,boardId,todo,"Child",{groupId:b.id});
  const third=await ticket(app,boardId,todo,"Third",{groupId:c.id});
  const original=(await app.inject(`/api/tickets/${p.id}`)).json();
  const body={title:"Edited",childTicketIds:[child.id,third.id],expectedEditToken:original.editToken,expectedSelectedParents:[{ticketId:child.id,parentTicketId:null},{ticketId:third.id,parentTicketId:null}]};
  const preview=await app.inject({method:"POST",url:`/api/tickets/${p.id}/change-preview`,payload:body});assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().requiresResolution,true);assert.equal(preview.json().candidates.length,3);
  const blocked=await app.inject({method:"PATCH",url:`/api/tickets/${p.id}`,payload:body});assert.equal(blocked.statusCode,409,blocked.body);assert.equal(blocked.json().code,"GROUP_CONFLICT");assert.ok(blocked.json().details);
  assert.equal((await app.inject(`/api/tickets/${p.id}`)).json().title,"Parent");
  assert.equal((await app.inject(`/api/tickets/${child.id}`)).json().parentTicketId,null);
  const commit=await app.inject({method:"PATCH",url:`/api/tickets/${p.id}`,payload:{...body,expectedToken:preview.json().expectedToken,groupResolution:{groupId:b.id}}});assert.equal(commit.statusCode,200,commit.body);assert.equal(commit.json().groupId,b.id);
  for(const id of [child.id,third.id]){const value=(await app.inject(`/api/tickets/${id}`)).json();assert.equal(value.groupId,b.id);assert.equal(value.parentTicketId,p.id);}
});

test("stale membership review and stale editor both reject without changing data", async t=>{
  const {app,boardId,todo}=await setup();t.after(()=>app.close());
  const a=await group(app,boardId,"A");const p=await ticket(app,boardId,todo,"Parent");
  const original=(await app.inject(`/api/tickets/${p.id}`)).json();
  const change={ticketIds:[p.id],groupId:a.id};
  const preview=(await app.inject({method:"POST",url:`/api/boards/${boardId}/group-memberships/preview`,payload:change})).json();
  const c=await ticket(app,boardId,todo,"New child",{parentTicketId:p.id});
  const membership=await app.inject({method:"PUT",url:`/api/boards/${boardId}/group-memberships`,payload:{...change,expectedToken:preview.expectedToken}});assert.equal(membership.statusCode,409,membership.body);
  const edit=await app.inject({method:"POST",url:`/api/tickets/${p.id}/change-preview`,payload:{childTicketIds:[],expectedEditToken:original.editToken,expectedSelectedParents:[]}});assert.equal(edit.statusCode,409,edit.body);
  assert.equal((await app.inject(`/api/tickets/${c.id}`)).json().parentTicketId,p.id);
  assert.equal((await app.inject(`/api/tickets/${p.id}`)).json().groupId,null);
});

test("Group ticket creation preview handles parent conflict and JSON round trip preserves memberships",async t=>{
  const {app,boardId,todo}=await setup();t.after(()=>app.close());
  const a=await group(app,boardId,"A"),b=await group(app,boardId,"B");
  const p=await ticket(app,boardId,todo,"Parent",{groupId:a.id});
  const body={laneId:todo,title:"New child",parentTicketId:p.id,groupId:b.id};
  const preview=await app.inject({method:"POST",url:`/api/boards/${boardId}/tickets/preview`,payload:body});assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().requiresResolution,true);
  const created=await app.inject({method:"POST",url:`/api/boards/${boardId}/tickets`,payload:{...body,expectedToken:preview.json().expectedToken,groupResolution:{groupId:b.id}}});assert.equal(created.statusCode,201,created.body);assert.equal(created.json().groupId,b.id);
  assert.equal((await app.inject(`/api/tickets/${p.id}`)).json().groupId,b.id);
  const exported=(await app.inject(`/api/boards/${boardId}/export`)).json();assert.equal(exported.formatVersion,2);assert.equal(exported.groups.length,2);assert.ok(!("group" in exported.tickets[0]));
  const imported=await app.inject({method:"POST",url:"/api/boards/import",payload:exported});assert.equal(imported.statusCode,201,imported.body);
  const importedBoard=imported.json().board.id;
  const read=(await app.inject(`/api/boards/${importedBoard}/tickets?archived=all`)).json();assert.equal(read.tickets.length,2);assert.ok(read.tickets.every((v:{group:{name:string}})=>v.group.name==="B"));
  const invalid={...exported};delete invalid.formatVersion;
  assert.equal((await app.inject({method:"POST",url:"/api/boards/import",payload:invalid})).statusCode,400);
});
