import test from "node:test";
import assert from "node:assert/strict";
import { indexTicketHierarchy } from "../public/app-ticket-hierarchy.js";
import { getListTickets } from "../public/app-board-list.js";
import { searchGroupCandidates, renderGroupView, renderGroupOptions } from "../public/app-group-view.js";
import type { GroupTicket, GroupViewState } from "../public/app-group-types.js";

const ticket = (id:number, parentTicketId:number|null = null, extra:Partial<GroupTicket> = {}):GroupTicket => ({
  id, parentTicketId, title:`Work ${id}`, priority:2, tags:[], laneId:1, isArchived:false, isResolved:false, hasChildren:false, ...extra,
});

test("hierarchy index preserves source order, missing-parent fallback, and fresh membership", () => {
  const rows=[ticket(5,1),ticket(1),ticket(3,1),ticket(8,99),ticket(9,8)];
  const index=indexTicketHierarchy(rows);
  assert.deepEqual(index.related(5).map(t=>t.id),[1,5,3]);
  assert.equal(index.relatedCount(5),3);
  assert.deepEqual(index.related(8).map(t=>t.id),[8,9]);
  assert.equal(index.relatedCount(8),2);
  assert.deepEqual(index.related(999),[]);
  assert.equal(index.relatedCount(999),0);
  assert.deepEqual(getListTickets(rows).map(({ticket:t,indent})=>[t.id,indent]),[[1,0],[3,1],[5,1],[8,0],[9,1]]);
  assert.deepEqual(getListTickets(rows,{key:'id',direction:'desc'}).map(({ticket:t,indent})=>[t.id,indent]),[[9,0],[8,0],[5,0],[3,0],[1,0]]);
  rows[0].parentTicketId=null;
  assert.deepEqual(indexTicketHierarchy(rows).related(1).map(t=>t.id),[1,3]);
});

test("Group candidate search excludes the chosen parent and children without excluding orphan siblings", () => {
  const candidates=[ticket(5,1),ticket(1),ticket(3,1),ticket(8,99),ticket(9,99)];
  const search=(chosen:number[],query='Work')=>searchGroupCandidates({query,candidates,chosen,activeOption:0}).map(t=>t.id);
  assert.deepEqual(search([1]),[8,9]);
  assert.deepEqual(search([8]),[5,1,3,9]);
  assert.deepEqual(search([],'#5'),[5]);
  assert.deepEqual(search([],''),[]);
});

test("Group keeps archived parent context, child order, remove counts, and hides archived-only groups", () => {
  const tickets=[ticket(2,1),ticket(1,null,{isArchived:true,hasChildren:true}),ticket(3,1,{isArchived:true}),ticket(4,null,{isResolved:true}),ticket(5,null,{isArchived:true})];
  const view:GroupViewState={groups:[],selectedId:1,ungroupedTicketCount:0,selected:{id:1,boardId:1,name:'Work',isActive:true,totalTicketCount:5,openTicketCount:1,resolvedTicketCount:1,archivedTicketCount:3,revision:1,createdAt:'',updatedAt:'',descriptionMarkdown:'',descriptionHtml:''},tickets,all:false,sort:'createdAt:asc',showArchived:false,creating:false,createName:'',renaming:false,renameName:'',descriptionEditing:false,descriptionDraft:'',descriptionPreview:null,expanded:false,adding:false,busy:false,error:'',candidates:[],chosen:[],query:'',activeOption:0};
  const render=()=>renderGroupView(view,{escapeHtml:s=>s,lanes:[{id:1,name:'Todo'}]});
  const html=render();
  assert.match(html,/Archived parent · shown for context/);
  assert.doesNotMatch(html,/data-group-ticket="1"/);
  assert.match(html,/data-group-ticket="2"/);
  assert.doesNotMatch(html,/data-group-ticket="3"/);
  assert.match(html,/data-group-ticket="4"/);
  assert.doesNotMatch(html,/data-group-ticket="5"/);
  assert.match(html,/Remove 3 tickets from Group/);
  assert.equal((html.match(/data-group-remove=/g)||[]).length,2);
  view.showArchived=true;
  const all=render();
  for(const id of [1,2,3,4,5])assert.match(all,new RegExp(`data-group-ticket="${id}"`));
  assert.ok(all.indexOf('data-group-ticket="2"')<all.indexOf('data-group-ticket="3"'));
});

test("Group option counts describe a wide parent/child set consistently", () => {
  const candidates=[ticket(1),...Array.from({length:2000},(_,i)=>ticket(i+2,1))];
  const html=renderGroupOptions({query:'#2001',candidates,chosen:[],activeOption:0},s=>s);
  assert.match(html,/2001 parent\/child tickets/);
  assert.match(html,/data-group-pick="2001"/);
});


test("Group display is unchanged when member pages use ID order instead of lane-position order", () => {
  const positionOrder = [
    ticket(10, null, { priority:1 }),
    ticket(6, 99, { priority:3 }),
    ticket(3, 20, { priority:4 }),
    ticket(20, null, { laneId:2, isArchived:true, hasChildren:true }),
    ticket(25, 20, { laneId:3, priority:1, isArchived:true }),
    ticket(8, null, { laneId:3, priority:4, isResolved:true }),
  ];
  const idOrder = [...positionOrder].sort((a,b)=>a.id-b.id);
  const view:GroupViewState={groups:[],selectedId:1,ungroupedTicketCount:0,selected:{id:1,boardId:1,name:'Work',isActive:true,totalTicketCount:6,openTicketCount:3,resolvedTicketCount:1,archivedTicketCount:2,revision:1,createdAt:'',updatedAt:'',descriptionMarkdown:'',descriptionHtml:''},tickets:positionOrder,all:false,sort:'createdAt:asc',showArchived:false,creating:false,createName:'',renaming:false,renameName:'',descriptionEditing:false,descriptionDraft:'',descriptionPreview:null,expanded:false,adding:false,busy:false,error:'',candidates:[],chosen:[],query:'',activeOption:0};
  const options={escapeHtml:(s:string)=>s,lanes:[{id:1,name:'Todo'},{id:2,name:'Doing'},{id:3,name:'Done'}]};
  for (const showArchived of [false,true]) {
    const before=renderGroupView({...view,showArchived,tickets:positionOrder},options);
    const after=renderGroupView({...view,showArchived,tickets:idOrder},options);
    assert.equal(after,before);
    assert.deepEqual([...after.matchAll(/data-group-ticket="(\d+)"/g)].map(m=>Number(m[1])),showArchived?[8,6,20,3,25,10]:[8,6,3,10]);
    assert.match(after,/Remove 3 tickets from Group/);
    assert.deepEqual([...after.matchAll(/data-group-remove="(\d+)"/g)].map(m=>Number(m[1])),[8,6,20,10]);
  }
});
