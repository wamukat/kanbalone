import test from "node:test";
import assert from "node:assert/strict";
import { indexTicketHierarchy } from "../public/app-ticket-hierarchy.js";
import { getListTickets } from "../public/app-board-list.js";
import { searchGroupCandidates, renderGroupView, renderGroupOptions, renderGroupViewSections } from "../public/app-group-view.js";
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

function groupFilterView(tickets: GroupTicket[]): GroupViewState {
  const selected = {
    id: 1, boardId: 1, name: "Review", isActive: true, totalTicketCount: tickets.length,
    openTicketCount: tickets.filter(ticket => !ticket.isArchived && !ticket.isResolved).length,
    resolvedTicketCount: tickets.filter(ticket => !ticket.isArchived && ticket.isResolved).length,
    archivedTicketCount: tickets.filter(ticket => ticket.isArchived).length,
    revision: 1, createdAt: "", updatedAt: "", descriptionMarkdown: "", descriptionHtml: "",
  };
  return {
    groups: [selected], selectedId: 1, selected, ungroupedTicketCount: 0, tickets,
    all: false, sort: "createdAt:asc", showArchived: false, creating: false,
    createName: "", renaming: false, renameName: "", descriptionEditing: false,
    descriptionDraft: "", descriptionPreview: null, expanded: false, adding: false,
    busy: false, error: "", candidates: [], chosen: [], query: "", activeOption: 0,
  };
}

const groupFilterOptions = { escapeHtml: (value: string) => value, lanes: [{ id: 1, name: "Todo" }], rowIcon: () => "" };

test("Group and No Group apply completion and archive filters to the same ordered rows in both display modes", () => {
  const sample = [
    ticket(41, 40, { isArchived: true }), ticket(52, 50, { isArchived: true, isResolved: true, priority: 3 }),
    ticket(10, null, { isResolved: true, hasChildren: true, priority: 4 }),
    ticket(12, 10, { isResolved: true, priority: 4 }), ticket(11, 10), ticket(13, 10, { isArchived: true, priority: 3 }),
    ticket(20, null, { isArchived: true, isResolved: true, hasChildren: true, priority: 3 }), ticket(21, 20),
    ticket(30, null, { isResolved: true, hasChildren: true }), ticket(31, 30, { isResolved: true }),
    ticket(40, null, { isResolved: true, hasChildren: true }),
    ticket(50, null, { hasChildren: true }), ticket(51, 50, { priority: 4 }),
    ticket(60, null, { isArchived: true }), ticket(61, null, { isArchived: true, isResolved: true }),
  ];
  const parentsByChild = new Map(sample.flatMap(({ id, parentTicketId }) => parentTicketId === null ? [] : [[id, parentTicketId]]));
  // The narrowest result reaches the window threshold with two context rows.
  const tickets = [...sample, ...Array.from({ length: 994 }, (_, i) => ticket(1000 + i, null, { priority: 1 }))];
  const before = structuredClone(tickets);
  const view = groupFilterView(tickets);
  const cases = [
    { openOnly: false, showArchived: false, visible: [10, 12, 11, 20, 21, 30, 31, 40, 50, 51], context: [20], remove: [10, 20, 30, 40, 50] },
    { openOnly: false, showArchived: true, visible: [10, 12, 13, 11, 20, 21, 30, 31, 40, 41, 50, 51, 52, 60, 61], context: [], remove: [10, 20, 30, 40, 50, 60, 61] },
    { openOnly: true, showArchived: false, visible: [10, 11, 20, 21, 50, 51], context: [10, 20], remove: [50] },
    { openOnly: true, showArchived: true, visible: [10, 13, 11, 20, 21, 40, 41, 50, 51, 60], context: [10, 20, 40], remove: [50, 60] },
  ];

  for (const heading of [view, { ...view, selectedId: "ungrouped" as const, selected: null, ungroupedTicketCount: tickets.length }]) {
    const ungrouped = heading.selectedId === "ungrouped";
    const baseline = renderGroupViewSections(heading, groupFilterOptions, "auto");
    for (const { openOnly, showArchived, visible, context, remove } of cases) {
      const current = { ...heading, openOnly, showArchived };
      const regular = renderGroupViewSections(current, groupFilterOptions);
      const model = renderGroupViewSections(current, groupFilterOptions, "auto").ticketWindow;
      assert.ok(model);
      assert.equal(model.rows.length, 994 + visible.length);
      const rows = model.rows.filter(row => row.ticket.id < 1000);
      assert.deepEqual(rows.map(row => row.ticket.id), visible);
      assert.deepEqual(rows.filter(row => row.context).map(row => row.ticket.id), context);
      assert.deepEqual(rows.filter(row => !row.searchable).map(row => row.ticket.id), openOnly ? context : []);
      assert.deepEqual(rows.filter(row => row.canRemove).map(row => row.ticket.id), ungrouped ? [] : remove);
      assert.deepEqual(rows.filter(row => row.child).map(row => [row.ticket.id, row.familyId]),
        visible.filter(id => parentsByChild.has(id)).map(id => [id, parentsByChild.get(id)]));

      for (const markup of [regular.tickets!, rows.map(model.renderRow).join("")]) {
        const ids = (attribute: string) => [...markup.matchAll(new RegExp(`${attribute}="(\\d+)"`, "g"))]
          .map(match => Number(match[1])).filter(id => id < 1000);
        assert.deepEqual(ids("data-group-row-id"), visible);
        assert.deepEqual(ids("data-group-ticket"), visible.filter(id => !context.includes(id)));
        assert.deepEqual(ids("data-group-remove"), ungrouped ? [] : remove);
        if (openOnly) assert.match(markup, /Resolved parent · shown for context/);
        if (!ungrouped && openOnly) assert.match(markup, /Remove 3 tickets from Group/);
      }
      assert.equal(regular.list, baseline.list);
      if (ungrouped) assert.match(regular.header, openOnly ? /1009 total/ : /1009 tickets/);
      else assert.match(regular.header, /998 open · 1009 total/);
    }
    const explicitOff = renderGroupViewSections({ ...heading, openOnly: false }, groupFilterOptions, "auto");
    assert.equal(baseline.header, explicitOff.header);
    assert.deepEqual(baseline.ticketWindow?.rows, explicitOff.ticketWindow?.rows);
  }
  assert.deepEqual(tickets, before);
});

test("Group filter empty states distinguish absent members, resolved members and hidden archives", () => {
  const empty = (tickets: GroupTicket[], showArchived = false) => renderGroupViewSections({
    ...groupFilterView(tickets), showArchived, openOnly: true,
  }, groupFilterOptions).tickets!;

  assert.match(empty([]), /Add or create tickets to get started/);
  assert.match(empty([ticket(1, null, { isResolved: true })]), /All tickets are resolved/);
  assert.match(empty([ticket(1, null, { isArchived: true })]), /All tickets are archived/);
  assert.match(empty([ticket(1, null, { isArchived: true, isResolved: true })], true), /All tickets are resolved/);
  assert.match(empty([ticket(1, null, { isResolved: true }), ticket(2, null, { isArchived: true })]), /All open tickets are archived/);
});
