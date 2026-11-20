import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { renderMarkdown } from "../markdown.js";
import { addActivity } from "./ticket-writes.js";
import type { GroupView, TicketRow } from "../types.js";

type Sqlite = Database.Database;
export type GroupEditFields = {
  groupId?: number | null;
  childTicketIds?: number[];
  groupResolution?: { groupId: number };
  expectedToken?: string;
  expectedEditToken?: string;
  expectedSelectedParents?: Array<{ ticketId: number; parentTicketId: number | null }>;
};
export type MembershipInput = { ticketIds: number[]; groupId: number | null; expectedToken?: string };
export type GroupPreviewTicket = { id: number; clientRef?: string; title: string; boardId: number; parentTicketId: number | null; groupId: number | null; isArchived: boolean };
export type GroupPreview = {
  expectedToken: string;
  requiresResolution: boolean;
  candidates: Array<{ group: { id: number; name: string }; changedTicketIds: number[] }>;
  tickets: GroupPreviewTicket[];
  parentChanges: Array<{ ticketId: number; fromParentTicketId: number | null; toParentTicketId: number | null }>;
  changedTicketIds: number[];
  targetGroupId: number | null;
};
type EditInput = GroupEditFields & { boardId?: number; parentTicketId?: number | null; title?: string; [key: string]: unknown };
type GroupRow = { id: number; board_id: number; name: string; description_markdown: string; revision: number; created_at: string; updated_at: string };
export function groupError(message: string, code: string, statusCode = 409, details?: unknown): never {
  throw Object.assign(new Error(message), { code, statusCode, details });
}
export function migrateGroups(db: Sqlite): void {
  db.exec(`CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name TEXT NOT NULL, description_markdown TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(board_id, name)
  );
  CREATE TABLE IF NOT EXISTS group_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    subject_group_id INTEGER NOT NULL, action TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL
  );`);
  const columns = db.prepare("PRAGMA table_info(tickets)").all() as Array<{ name: string }>;
  if (!columns.some(c => c.name === "group_id")) db.exec("ALTER TABLE tickets ADD COLUMN group_id INTEGER REFERENCES groups(id) ON DELETE RESTRICT");
  db.exec(`CREATE INDEX IF NOT EXISTS tickets_group_idx ON tickets(group_id);
    CREATE TRIGGER IF NOT EXISTS ticket_group_insert BEFORE INSERT ON tickets
    WHEN NEW.group_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM groups WHERE id=NEW.group_id AND board_id=NEW.board_id)
    BEGIN SELECT RAISE(ABORT,'Group does not belong to board'); END;
    CREATE TRIGGER IF NOT EXISTS ticket_group_update BEFORE UPDATE OF group_id, board_id ON tickets
    WHEN NEW.group_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM groups WHERE id=NEW.group_id AND board_id=NEW.board_id)
    BEGIN SELECT RAISE(ABORT,'Group does not belong to board'); END;
    CREATE TRIGGER IF NOT EXISTS group_board_immutable BEFORE UPDATE OF board_id ON groups
    WHEN NEW.board_id <> OLD.board_id BEGIN SELECT RAISE(ABORT,'Group board cannot change'); END;`);
}
function requireBoard(db: Sqlite, id: number): void {
  if (!db.prepare("SELECT id FROM boards WHERE id=?").get(id)) groupError("Board not found", "BOARD_NOT_FOUND", 404);
}
function cleanName(value: string): string {
  const name = value.trim().normalize("NFC");
  if (!name || [...name].length > 100) groupError("Group name must contain 1 to 100 characters", "INVALID_GROUP_NAME", 400);
  return name;
}
function cleanDescription(value: string): string {
  if ([...value].length > 100000) groupError("Group description is too long", "INVALID_GROUP_DESCRIPTION", 400);
  return value;
}
function logGroup(db: Sqlite, boardId: number, groupId: number, action: string, details: unknown, now: string): void {
  db.prepare("INSERT INTO group_activity_logs(board_id,subject_group_id,action,details_json,created_at) VALUES(?,?,?,?,?)")
    .run(boardId, groupId, action, JSON.stringify(details), now);
  db.prepare("UPDATE boards SET updated_at=? WHERE id=?").run(now, boardId);
}
type CountedGroupRow = GroupRow & { total: number; open: number; archived: number };
const groupSelect = `SELECT g.*, COUNT(t.id) total,
  COALESCE(SUM(t.is_archived=0 AND t.is_resolved=0),0) open,
  COALESCE(SUM(t.is_archived=1),0) archived FROM groups g LEFT JOIN tickets t ON t.group_id=g.id`;
function mapGroup(row: CountedGroupRow, detailed: boolean): GroupView {
  return { id: row.id, boardId: row.board_id, name: row.name, descriptionMarkdown: row.description_markdown,
    descriptionHtml: detailed ? renderMarkdown(row.description_markdown) : "", revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    isActive: row.total === 0 || row.open > 0, totalTicketCount: row.total, openTicketCount: row.open, archivedTicketCount: row.archived };
}
export function getGroup(db: Sqlite, id: number): GroupView | null {
  const row = db.prepare(`${groupSelect} WHERE g.id=? GROUP BY g.id`).get(id) as CountedGroupRow | undefined;
  return row ? mapGroup(row, true) : null;
}
export function listGroups(db: Sqlite, boardId: number, options: { status?: "active" | "inactive" | "all"; sort?: "createdAt" | "name"; order?: "asc" | "desc" } = {}): GroupView[] {
  requireBoard(db, boardId);
  const sort = options.sort === "name" ? "name" : "created_at";
  const order = options.order === "desc" ? "DESC" : "ASC";
  const rows = db.prepare(`${groupSelect} WHERE g.board_id=? GROUP BY g.id ORDER BY g.${sort} ${order}, g.id ASC`).all(boardId) as CountedGroupRow[];
  return rows.map(row => mapGroup(row, false)).filter(g => options.status === "all" || (options.status === "inactive" ? !g.isActive : g.isActive));
}
export function createGroup(db: Sqlite, input: { boardId: number; name: string; descriptionMarkdown?: string }, now: string): GroupView {
  return db.transaction(() => {
    requireBoard(db, input.boardId); const name = cleanName(input.name); const description = cleanDescription(input.descriptionMarkdown ?? "");
    if (db.prepare("SELECT id FROM groups WHERE board_id=? AND name=?").get(input.boardId, name)) groupError("Group name already exists", "GROUP_NAME_EXISTS");
    const id = Number(db.prepare("INSERT INTO groups(board_id,name,description_markdown,created_at,updated_at) VALUES(?,?,?,?,?)").run(input.boardId, name, description, now, now).lastInsertRowid);
    logGroup(db, input.boardId, id, "group_created", { name }, now); return getGroup(db, id)!;
  }).immediate();
}
export function updateGroup(db: Sqlite, id: number, input: { name?: string; descriptionMarkdown?: string; expectedRevision?: number }, now: string): GroupView {
  return db.transaction(() => {
    const current = getGroup(db, id); if (!current) groupError("Group not found", "GROUP_NOT_FOUND", 404);
    if (input.expectedRevision == null) groupError("expectedRevision is required", "PRECONDITION_REQUIRED", 428);
    if (input.expectedRevision !== current.revision) groupError("Group changed; reload before saving", "STALE_GROUP");
    const name = input.name === undefined ? current.name : cleanName(input.name);
    const description = input.descriptionMarkdown === undefined ? current.descriptionMarkdown : cleanDescription(input.descriptionMarkdown);
    if (db.prepare("SELECT id FROM groups WHERE board_id=? AND name=? AND id<>?").get(current.boardId, name, id)) groupError("Group name already exists", "GROUP_NAME_EXISTS");
    db.prepare("UPDATE groups SET name=?,description_markdown=?,revision=revision+1,updated_at=? WHERE id=?").run(name, description, now, id);
    logGroup(db, current.boardId, id, "group_updated", { fromName: current.name, name, descriptionChanged: description !== current.descriptionMarkdown }, now);
    return getGroup(db, id)!;
  }).immediate();
}
export function deleteGroup(db: Sqlite, id: number, expectedRevision: number | undefined, now: string): void {
  db.transaction(() => {
    const group = getGroup(db, id); if (!group) groupError("Group not found", "GROUP_NOT_FOUND", 404);
    if (expectedRevision == null) groupError("Group revision is required", "PRECONDITION_REQUIRED", 428);
    if (expectedRevision !== group.revision) groupError("Group changed; reload before deleting", "STALE_GROUP");
    if (group.totalTicketCount) groupError("Only empty groups can be deleted", "GROUP_NOT_EMPTY");
    logGroup(db, group.boardId, id, "group_deleted", { name: group.name }, now);
    db.prepare("DELETE FROM groups WHERE id=?").run(id);
  }).immediate();
}
export function listGroupActivity(db: Sqlite, boardId: number, groupId?: number) {
  requireBoard(db, boardId);
  const rows = db.prepare(`SELECT * FROM group_activity_logs WHERE board_id=? ${groupId === undefined ? "" : "AND subject_group_id=?"} ORDER BY id DESC`).all(...(groupId === undefined ? [boardId] : [boardId, groupId])) as Array<{id:number; subject_group_id:number; action:string; details_json:string; created_at:string}>;
  return rows.map(r => ({ id:r.id, boardId, groupId:r.subject_group_id, action:r.action, details:JSON.parse(r.details_json), createdAt:r.created_at }));
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
  return value;
}
function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export function ticketEditToken(db: Sqlite, id: number): string {
  const row = db.prepare("SELECT id,title,body_markdown,lane_id,is_archived,priority,parent_ticket_id FROM tickets WHERE id=?").get(id);
  const children = db.prepare("SELECT id FROM tickets WHERE parent_ticket_id=? ORDER BY id").all(id);
  const tags = db.prepare("SELECT tag_id FROM ticket_tags WHERE ticket_id=? ORDER BY tag_id").all(id);
  const blockers = db.prepare("SELECT blocker_ticket_id FROM ticket_blockers WHERE ticket_id=? ORDER BY blocker_ticket_id").all(id);
  const related = db.prepare("SELECT ticket_id,related_ticket_id FROM ticket_related_links WHERE ticket_id=? OR related_ticket_id=? ORDER BY ticket_id,related_ticket_id").all(id,id);
  return hash({ row, children, tags, blockers, related });
}
export function ticketGroupFields(db: Sqlite, row: { id:number; group_id?:number|null }, includeEdit = false) {
  const groupId = row.group_id ?? null;
  const group = groupId == null ? null : (db.prepare("SELECT id,name FROM groups WHERE id=?").get(groupId) as {id:number; name:string} | undefined) ?? null;
  return { groupId, group, ...(includeEdit ? { editToken:ticketEditToken(db,row.id) } : {}) };
}
function rowsForBoard(db: Sqlite, boardId: number): TicketRow[] { return db.prepare("SELECT * FROM tickets WHERE board_id=? ORDER BY id").all(boardId) as TicketRow[]; }
function connected(rows: TicketRow[], id: number): TicketRow[] {
  const current = rows.find(t=>t.id===id); if (!current) groupError("Ticket does not belong to board", "INVALID_TICKET", 400);
  const root = current.parent_ticket_id ?? current.id;
  return rows.filter(t=>t.id===root || t.parent_ticket_id===root);
}
function view(t: TicketRow): GroupPreviewTicket { return { id:t.id, ...(t.id===0?{clientRef:"new"}:{}),title:t.title,boardId:t.board_id,parentTicketId:t.parent_ticket_id,groupId:t.group_id??null,isArchived:!!t.is_archived }; }
function validateIds(ids: number[]): void {
  if (!Array.isArray(ids) || ids.length>100 || new Set(ids).size!==ids.length || ids.some(id=>!Number.isSafeInteger(id)||id<1)) groupError("Expected up to 100 unique positive ticket IDs", "INVALID_TICKET_IDS", 400);
}
function validateGroup(db:Sqlite,id:number|null|undefined,boardId:number):void {
  if(id==null)return; const g=getGroup(db,id); if(!g||g.boardId!==boardId)groupError("Group does not belong to board","INVALID_GROUP",400);
}
function snapshot(db:Sqlite, rows:TicketRow[], input:unknown):string {
  const groups = [...new Set(rows.map(t=>t.group_id).filter((id):id is number=>id!=null))].sort((a,b)=>a-b).map(id=>db.prepare("SELECT id,name,revision FROM groups WHERE id=?").get(id));
  return hash({input,rows,groups});
}
export function previewGroupMemberships(db:Sqlite,boardId:number,input:MembershipInput):GroupPreview {
  return db.transaction(()=> {
    requireBoard(db,boardId);validateIds(input.ticketIds);if(!input.ticketIds.length)groupError("Select at least one ticket","INVALID_TICKET_IDS",400);
    validateGroup(db,input.groupId,boardId);const all=rowsForBoard(db,boardId);
    const selected=new Map<number,TicketRow>();input.ticketIds.forEach(id=>connected(all,id).forEach(t=>selected.set(t.id,t)));
    const rows=[...selected.values()].sort((a,b)=>a.id-b.id);
    if(input.groupId!=null&&rows.some(t=>t.group_id!=null&&t.group_id!==input.groupId))groupError("Remove existing Group membership before adding another Group","GROUP_ALREADY_ASSIGNED");
    const target=input.groupId==null?null:getGroup(db,input.groupId)!;
    return {expectedToken:snapshot(db,rows,{boardId,ticketIds:[...input.ticketIds].sort((a,b)=>a-b),groupId:input.groupId,target:target?{id:target.id,name:target.name,revision:target.revision}:null}),requiresResolution:false,candidates:[],tickets:rows.map(view),parentChanges:[],targetGroupId:input.groupId,changedTicketIds:rows.filter(t=>(t.group_id??null)!==input.groupId).map(t=>t.id)};
  })();
}
export function setGroupMemberships(db:Sqlite,boardId:number,input:MembershipInput,now:string):{changedTicketIds:number[];affectedGroups:GroupView[]} {
  return db.transaction(()=> {
    if(!input.expectedToken)groupError("expectedToken is required","PRECONDITION_REQUIRED",428);
    const preview=previewGroupMemberships(db,boardId,input);
    if(input.expectedToken!==preview.expectedToken)groupError("Tickets or groups changed; review again","STALE_GROUP_CONTEXT",409,preview);
    const groupIds=new Set<number>();for(const t of preview.tickets){if(t.groupId!=null)groupIds.add(t.groupId);if(preview.changedTicketIds.includes(t.id))assignGroup(db,t.id,boardId,t.groupId,input.groupId,now);}
    if(input.groupId!=null)groupIds.add(input.groupId);
    db.prepare("UPDATE boards SET updated_at=? WHERE id=?").run(now,boardId);
    return {changedTicketIds:preview.changedTicketIds,affectedGroups:[...groupIds].map(id=>getGroup(db,id)!).filter(Boolean)};
  }).immediate();
}
function assignGroup(db:Sqlite,ticketId:number,boardId:number,from:number|null,to:number|null,now:string):void {
  if(from===to)return;
  db.prepare("UPDATE tickets SET group_id=?,updated_at=? WHERE id=?").run(to,now,ticketId);
  addActivity(db,{boardId,ticketId,action:"ticket_group_changed",message:"Group membership changed",details:{fromGroupId:from,toGroupId:to,fromGroupName:from==null?null:getGroup(db,from)?.name,toGroupName:to==null?null:getGroup(db,to)?.name},createdAt:now});
}
export function clearGroupForBoardMove(db:Sqlite,ticketId:number,boardId:number,now:string):void {
  const row=db.prepare("SELECT group_id FROM tickets WHERE id=?").get(ticketId) as {group_id:number|null}|undefined;
  if(row?.group_id!=null)assignGroup(db,ticketId,boardId,row.group_id,null,now);
}
export type TicketGroupPlan = {preview:GroupPreview; finalRows:TicketRow[]; componentIds:number[]; targetGroupId:number|null; boardId:number};
export function planTicketGroupChange(db:Sqlite,ticketId:number|null,input:EditInput,commit=false):TicketGroupPlan {
  const current=ticketId==null?null:db.prepare("SELECT * FROM tickets WHERE id=?").get(ticketId) as TicketRow|undefined;
  if(ticketId!=null&&!current)groupError("Ticket not found","TICKET_NOT_FOUND",404);
  const boardId=input.boardId??current!.board_id;requireBoard(db,boardId);
  const created=ticketId==null;
  const relationEdit = input.parentTicketId !== undefined || input.childTicketIds !== undefined;
  const all = created && input.parentTicketId == null ? [] : !created && !relationEdit && current?.board_id === boardId
    ? db.prepare("SELECT * FROM tickets WHERE id=? OR parent_ticket_id=? ORDER BY id").all(current.parent_ticket_id ?? current.id, current.parent_ticket_id ?? current.id) as TicketRow[]
    : rowsForBoard(db,boardId);
  if(!created&&input.groupId!==undefined)groupError("Use the Group membership endpoint","GROUP_WRITE_ENDPOINT",400);
  if(current&&current.board_id!==boardId) {
    // Internal board moves preserve the old API's relation cleanup and clear only moved membership.
    return {preview:{expectedToken:"",requiresResolution:false,candidates:[],tickets:[],parentChanges:[],changedTicketIds:[],targetGroupId:null},finalRows:[],componentIds:[],targetGroupId:null,boardId};
  }
  if(input.expectedEditToken!==undefined&&input.expectedEditToken!==ticketEditToken(db,ticketId!))groupError("Ticket was edited; reload before saving","STALE_TICKET_EDIT");
  const id=ticketId??0;
  if(input.childTicketIds!==undefined) {
    if(created)groupError("Create a ticket before assigning existing children","INVALID_RELATIONS",400);
    validateIds(input.childTicketIds);
    if(!input.expectedEditToken)groupError("expectedEditToken is required for child edits","PRECONDITION_REQUIRED",428);
    const original=all.filter(t=>t.parent_ticket_id===id).map(t=>t.id);
    const added=input.childTicketIds.filter(t=>!original.includes(t));
    const expectations=input.expectedSelectedParents??[];
    if(expectations.length!==added.length||new Set(expectations.map(e=>e.ticketId)).size!==expectations.length||expectations.some(e=>!added.includes(e.ticketId)))groupError("Provide expectedSelectedParents for each newly selected child","INVALID_RELATION_EXPECTATIONS",400);
    for(const e of expectations){const row=all.find(t=>t.id===e.ticketId);if(!row)groupError("Selected ticket does not belong to board","INVALID_RELATIONS",400);if(row.parent_ticket_id!==e.parentTicketId)groupError("Selected ticket parent changed","STALE_RELATIONS");}
  }
  if(created)validateGroup(db,input.groupId,boardId);
  const finalRows=all.map(t=>({...t}));
  if(created)finalRows.push({id:0,board_id:boardId,lane_id:Number(input.laneId??0),parent_ticket_id:null,group_id:input.groupId??null,title:input.title??"",body_markdown:"",is_archived:input.isArchived?1:0,is_resolved:0,priority:2,position:0,created_at:"",updated_at:""});
  const finalById = new Map(finalRows.map(t=>[t.id,t]));
  const originalById = new Map(all.map(t=>[t.id,t]));
  const edited=finalById.get(id)!;
  if(input.childTicketIds!==undefined){for(const row of finalRows){if(row.parent_ticket_id===id&&!input.childTicketIds.includes(row.id))row.parent_ticket_id=null;if(input.childTicketIds.includes(row.id))row.parent_ticket_id=id;}if(input.childTicketIds.some(child=>!finalById.has(child)))groupError("Child ticket does not belong to board","INVALID_RELATIONS",400);}
  if(input.parentTicketId!==undefined)edited.parent_ticket_id=input.parentTicketId;
  for(const row of finalRows){if(row.parent_ticket_id==null)continue;const parent=finalById.get(row.parent_ticket_id);if(!parent||parent.id===row.id||parent.parent_ticket_id!=null)groupError("Parent/child relationships must stay within one board and two levels","INVALID_RELATIONS",400);}
  const component=connected(finalRows,id);const componentIds=component.map(t=>t.id);
  const groupIds=[...new Set(component.map(t=>t.group_id).filter((x):x is number=>x!=null))].sort((a,b)=>a-b);
  const candidates=groupIds.map(groupId=>({group:{id:groupId,name:getGroup(db,groupId)!.name},changedTicketIds:component.filter(t=>t.group_id!==groupId).map(t=>t.id)}));
  const targetGroupId=input.groupResolution?.groupId??(groupIds.length===1?groupIds[0]:null);
  const parentChanges=finalRows.filter(t=>(originalById.get(t.id)?.parent_ticket_id??null)!==t.parent_ticket_id).map(t=>({ticketId:t.id,fromParentTicketId:originalById.get(t.id)?.parent_ticket_id??null,toParentTicketId:t.parent_ticket_id}));
  const affected=new Set<number>(componentIds);
  for(const changed of parentChanges){if(changed.ticketId!==0)connected(all,changed.ticketId).forEach(t=>affected.add(t.id));if(changed.toParentTicketId!=null&&changed.toParentTicketId!==0)connected(all,changed.toParentTicketId).forEach(t=>affected.add(t.id));}
  const originalRows=all.filter(t=>affected.has(t.id));
  const {expectedToken:_token,groupResolution:_resolution,...operation}=input;
  const preview:GroupPreview={expectedToken:snapshot(db,originalRows,{ticketId,operation,candidates:candidates.map(c=>c.group)}),requiresResolution:groupIds.length>1,candidates,tickets:component.map(t=>view(originalById.get(t.id)??t)),parentChanges,targetGroupId,changedTicketIds:component.filter(t=>(t.group_id??null)!==targetGroupId).map(t=>t.id)};
  if(input.expectedToken!==undefined&&input.expectedToken!==preview.expectedToken)groupError("Tickets or groups changed; review again","STALE_GROUP_CONTEXT",409,preview);
  if(input.groupResolution&& !groupIds.includes(input.groupResolution.groupId))groupError("Resolution must select one of the existing groups","INVALID_GROUP_RESOLUTION",400);
  if(commit&&preview.requiresResolution&&(!input.groupResolution||!input.expectedToken))groupError("Choose the Group for these parent/child tickets","GROUP_CONFLICT",409,preview);
  return {preview,finalRows,componentIds,targetGroupId,boardId};
}
export function applyTicketGroupPlan(db:Sqlite,plan:TicketGroupPlan,newTicketId:number|undefined,now:string):void {
  for(const change of plan.preview.parentChanges){const id=change.ticketId===0?newTicketId!:change.ticketId;const parent=change.toParentTicketId===0?newTicketId!:change.toParentTicketId;db.prepare("UPDATE tickets SET parent_ticket_id=?,updated_at=? WHERE id=?").run(parent,now,id);}
  for(const componentId of plan.componentIds){const id=componentId===0?newTicketId!:componentId;const row=db.prepare("SELECT group_id FROM tickets WHERE id=?").get(id) as {group_id:number|null};assignGroup(db,id,plan.boardId,row.group_id,plan.targetGroupId,now);}
}
