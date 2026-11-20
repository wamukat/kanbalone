import assert from "node:assert/strict";
import test from "node:test";
import { KanbanDb } from "../src/db.js";

function setup() { const db=new KanbanDb(":memory:");const board=db.createBoard({name:"board"});const laneId=board.lanes[0].id;return {db,board,laneId}; }
const code=(expected:string)=>(error:unknown)=>{assert.equal((error as {code:string}).code,expected);return true;};

test("groups: derived active, revisions, normalized duplicate names and nonempty deletion",()=>{
 const {db,board,laneId}=setup();try {
 const group=db.createGroup({boardId:board.board.id,name:" e\u0301 "});assert.equal(group.name,"é");assert.equal(group.isActive,true);
 assert.throws(()=>db.createGroup({boardId:board.board.id,name:"é"}),code("GROUP_NAME_EXISTS"));
 const ticket=db.createTicket({boardId:board.board.id,laneId,title:"work",groupId:group.id});assert.equal(ticket.groupId,group.id);assert.equal(ticket.group?.name,"é");assert.ok(ticket.editToken);
 assert.equal(db.getGroup(group.id)?.openTicketCount,1);
 db.updateTicket(ticket.id,{isArchived:true});assert.equal(db.getGroup(group.id)?.isActive,false);assert.equal(db.listGroups(board.board.id).length,0);
 assert.throws(()=>db.deleteGroup(group.id,group.revision),code("GROUP_NOT_EMPTY"));
 const changed=db.updateGroup(group.id,{name:"renamed",expectedRevision:1});assert.equal(changed.revision,2);assert.throws(()=>db.updateGroup(group.id,{name:"oops",expectedRevision:1}),code("STALE_GROUP"));
 db.deleteTicket(ticket.id);assert.equal(db.getGroup(group.id)?.isActive,true);db.deleteGroup(group.id,2);
 const next=db.createGroup({boardId:board.board.id,name:"new"});assert.ok(next.id>group.id);
 }finally{db.close();}
});

test("groups: child membership expands archived parent and siblings and rejects stale confirmation",()=>{
 const {db,board,laneId}=setup();try{
 const group=db.createGroup({boardId:board.board.id,name:"A"});const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent",isArchived:true});const child=db.createTicket({boardId:board.board.id,laneId,title:"child",parentTicketId:parent.id});
 const input={ticketIds:[child.id],groupId:group.id};const preview=db.previewGroupMemberships(board.board.id,input);assert.deepEqual(preview.changedTicketIds,[parent.id,child.id]);
 db.createTicket({boardId:board.board.id,laneId,title:"sibling",parentTicketId:parent.id});assert.throws(()=>db.setGroupMemberships(board.board.id,{...input,expectedToken:preview.expectedToken}),code("STALE_GROUP_CONTEXT"));
 const fresh=db.previewGroupMemberships(board.board.id,input);db.setGroupMemberships(board.board.id,{...input,expectedToken:fresh.expectedToken});assert.equal(db.getGroup(group.id)?.totalTicketCount,3);
 const other=db.createGroup({boardId:board.board.id,name:"B"});assert.throws(()=>db.previewGroupMemberships(board.board.id,{...input,groupId:other.id}),code("GROUP_ALREADY_ASSIGNED"));
 const remove={ticketIds:[child.id],groupId:null};db.setGroupMemberships(board.board.id,{...remove,expectedToken:db.previewGroupMemberships(board.board.id,remove).expectedToken});assert.equal(db.getGroup(group.id)?.totalTicketCount,0);
 }finally{db.close();}
});

test("groups: parent edits atomically resolve several groups including archived children",()=>{
 const {db,board,laneId}=setup();try{
 const gs=["A","B","C"].map(name=>db.createGroup({boardId:board.board.id,name}));
 const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent",groupId:gs[0].id});const child=db.createTicket({boardId:board.board.id,laneId,title:"old child",parentTicketId:parent.id,isArchived:true});
 const additions=gs.slice(1).map(g=>db.createTicket({boardId:board.board.id,laneId,title:g.name,groupId:g.id}));
 const input={title:"updated",childTicketIds:[child.id,...additions.map(t=>t.id)],expectedEditToken:db.getTicket(parent.id)!.editToken!,expectedSelectedParents:additions.map(t=>({ticketId:t.id,parentTicketId:null}))};
 const p=db.previewTicketChange(parent.id,input);assert.equal(p.candidates.length,3);assert.equal(p.requiresResolution,true);
 assert.throws(()=>db.updateTicket(parent.id,input),code("GROUP_CONFLICT"));assert.equal(db.getTicket(parent.id)?.title,"parent");assert.equal(db.getTicket(additions[0].id)?.parentTicketId,null);
 db.updateTicket(parent.id,{...input,expectedToken:p.expectedToken,groupResolution:{groupId:gs[1].id}});
 assert.equal(db.getGroup(gs[1].id)?.totalTicketCount,4);assert.equal(db.getTicket(child.id)?.isArchived,true);
 db.updateTicket(child.id,{parentTicketId:null});assert.equal(db.getTicket(child.id)?.groupId,gs[1].id);
 }finally{db.close();}
});

test("groups: edit baseline prevents silently detaching concurrently added children",()=>{
 const {db,board,laneId}=setup();try{
 const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent"});const baseline=parent.editToken!;
 const child=db.createTicket({boardId:board.board.id,laneId,title:"child",parentTicketId:parent.id});
 assert.throws(()=>db.previewTicketChange(parent.id,{childTicketIds:[],expectedEditToken:baseline,expectedSelectedParents:[]}),code("STALE_TICKET_EDIT"));
 assert.equal(db.getTicket(child.id)?.parentTicketId,parent.id);
 }finally{db.close();}
});

test("groups: create with parent inherits or resolves Group in one transaction",()=>{
 const {db,board,laneId}=setup();try{
 const a=db.createGroup({boardId:board.board.id,name:"A"});const b=db.createGroup({boardId:board.board.id,name:"B"});
 const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent"});const sibling=db.createTicket({boardId:board.board.id,laneId,title:"sibling",parentTicketId:parent.id});
 db.createTicket({boardId:board.board.id,laneId,title:"new",parentTicketId:parent.id,groupId:a.id});assert.equal(db.getTicket(sibling.id)?.groupId,a.id);
 const input={boardId:board.board.id,laneId,title:"conflict",parentTicketId:parent.id,groupId:b.id};const preview=db.previewTicketCreate(input);
 assert.throws(()=>db.createTicket(input),code("GROUP_CONFLICT"));assert.equal(db.listTickets(board.board.id).length,3);
 const created=db.createTicket({...input,expectedToken:preview.expectedToken,groupResolution:{groupId:b.id}});assert.equal(created.groupId,b.id);assert.equal(db.getTicket(parent.id)?.groupId,b.id);
 }finally{db.close();}
});

test("groups: board moves clear only moving tickets and export/import preserves membership",()=>{
 const {db,board,laneId}=setup();try{
 const group=db.createGroup({boardId:board.board.id,name:"A",descriptionMarkdown:"**why**"});const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent",groupId:group.id});const child=db.createTicket({boardId:board.board.id,laneId,title:"child",parentTicketId:parent.id});
 const exported=db.exportBoard(board.board.id);assert.equal(exported.formatVersion,2);assert.equal(exported.groups?.length,1);assert.equal("group" in exported.tickets[0],false);assert.equal("editToken" in exported.tickets[0],false);
 const imported=db.importBoard(exported);assert.notEqual(imported.groups![0].id,group.id);assert.ok(imported.tickets.every(t=>t.groupId===imported.groups![0].id));assert.equal(imported.groups![0].createdAt,exported.groups![0].createdAt);assert.equal(imported.groups![0].updatedAt,exported.groups![0].updatedAt);
 const bad=structuredClone(exported);delete bad.formatVersion;assert.throws(()=>db.importBoard(bad),code("INVALID_EXPORT_FORMAT"));
 db.moveTicket(parent.id,{boardId:imported.board.id,laneId:imported.lanes[0].id});assert.equal(db.getTicket(parent.id)?.groupId,null);assert.equal(db.getTicket(child.id)?.groupId,group.id);assert.equal(db.getTicket(child.id)?.parentTicketId,null);
 db.deleteBoard(imported.board.id);assert.equal(db.getGroup(imported.groups![0].id),null);
 }finally{db.close();}
});

test("groups: appendMarkdown preview binds the normalized committed body",()=>{
 const {db,board,laneId}=setup();try{
 const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent",bodyMarkdown:"before"});
 const input={appendMarkdown:" after",childTicketIds:[],expectedEditToken:parent.editToken!,expectedSelectedParents:[]};
 const preview=db.previewTicketChange(parent.id,input);
 assert.equal(db.updateTicket(parent.id,{...input,expectedToken:preview.expectedToken}).bodyMarkdown,"before after");
 }finally{db.close();}
});

test("groups: malformed legacy hierarchy and v2 IDs are rejected without partial import",()=>{
 const {db,board,laneId}=setup();try{
 const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent"});db.createTicket({boardId:board.board.id,laneId,title:"child",parentTicketId:parent.id});
 const exported=db.exportBoard(board.board.id);const legacy=structuredClone(exported);delete legacy.formatVersion;delete legacy.groups;legacy.tickets.forEach(t=>delete t.groupId);
 legacy.tickets[0].parentTicketId=legacy.tickets[1].id;
 const before=db.listBoards().length;assert.throws(()=>db.importBoard(legacy),code("INVALID_EXPORT_FORMAT"));assert.equal(db.listBoards().length,before);
 const invalid=structuredClone(exported);invalid.tickets[0].groupId=0;assert.throws(()=>db.importBoard(invalid),code("INVALID_EXPORT_FORMAT"));assert.equal(db.listBoards().length,before);
 }finally{db.close();}
});

test("groups: reparenting changes only the newly connected component",()=>{
 const {db,board,laneId}=setup();try{
 const a=db.createGroup({boardId:board.board.id,name:"A"}),b=db.createGroup({boardId:board.board.id,name:"B"});
 const oldParent=db.createTicket({boardId:board.board.id,laneId,title:"old",groupId:a.id});const moved=db.createTicket({boardId:board.board.id,laneId,title:"moved",parentTicketId:oldParent.id});const stays=db.createTicket({boardId:board.board.id,laneId,title:"stays",parentTicketId:oldParent.id});
 const newParent=db.createTicket({boardId:board.board.id,laneId,title:"new",groupId:b.id});const input={parentTicketId:newParent.id};const preview=db.previewTicketChange(moved.id,input);
 db.updateTicket(moved.id,{...input,expectedToken:preview.expectedToken,groupResolution:{groupId:b.id}});
 assert.equal(db.getTicket(moved.id)?.groupId,b.id);assert.equal(db.getTicket(oldParent.id)?.groupId,a.id);assert.equal(db.getTicket(stays.id)?.groupId,a.id);
 const detach={ticketIds:[moved.id],groupId:null};const before=db.previewGroupMemberships(board.board.id,detach);db.updateGroup(b.id,{name:"renamed",expectedRevision:b.revision});assert.throws(()=>db.setGroupMemberships(board.board.id,{...detach,expectedToken:before.expectedToken}),code("STALE_GROUP_CONTEXT"));
 }finally{db.close();}
});

test("groups: bulk and internal board moves retain remaining membership",()=>{
 const {db,board,laneId}=setup();try{
 const group=db.createGroup({boardId:board.board.id,name:"A"});const parent=db.createTicket({boardId:board.board.id,laneId,title:"parent",groupId:group.id});const child=db.createTicket({boardId:board.board.id,laneId,title:"child",parentTicketId:parent.id});const other=db.createBoard({name:"other"});
 db.bulkMoveTickets({sourceBoardId:board.board.id,boardId:other.board.id,laneId:other.lanes[0].id,ticketIds:[child.id]});assert.equal(db.getTicket(child.id)?.groupId,null);assert.equal(db.getTicket(parent.id)?.groupId,group.id);
 db.updateTicket(parent.id,{boardId:other.board.id,laneId:other.lanes[0].id});assert.equal(db.getTicket(parent.id)?.groupId,null);assert.equal(db.getGroup(group.id)?.totalTicketCount,0);
 assert.ok(db.listActivity(parent.id).some(a=>a.action==="ticket_group_changed"));
 }finally{db.close();}
});

test("groups: migration adds only unassigned membership and retains existing ticket data", async()=>{
 const {mkdtempSync,rmSync}=await import("node:fs");const {tmpdir}=await import("node:os");const {join}=await import("node:path");
 const directory=mkdtempSync(join(tmpdir(),"kanbalone-groups-"));const filename=join(directory,"board.db");
 let db:KanbanDb|undefined;
 try {
  db=new KanbanDb(filename);const board=db.createBoard({name:"before"});const ticket=db.createTicket({boardId:board.board.id,laneId:board.lanes[0].id,title:"kept",bodyMarkdown:"body"});
  const before=db.sqlite.prepare("SELECT id,board_id,lane_id,parent_ticket_id,title,body_markdown,is_resolved,is_archived,priority,position,created_at,updated_at FROM tickets").all();
  db.sqlite.exec("DROP TRIGGER ticket_group_insert; DROP TRIGGER ticket_group_update; DROP TRIGGER group_board_immutable; DROP INDEX tickets_group_idx; ALTER TABLE tickets DROP COLUMN group_id; DROP TABLE groups; DROP TABLE group_activity_logs;");db.close();db=undefined;
  db=new KanbanDb(filename);assert.deepEqual(db.sqlite.prepare("SELECT id,board_id,lane_id,parent_ticket_id,title,body_markdown,is_resolved,is_archived,priority,position,created_at,updated_at FROM tickets").all(),before);
  assert.equal(db.getTicket(ticket.id)?.groupId,null);assert.deepEqual(db.listGroups(board.board.id),[]);
 }finally{db?.close();rmSync(directory,{recursive:true,force:true});}
});
