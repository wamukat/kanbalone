import test from "node:test";
import assert from "node:assert/strict";
import { KanbanDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { createDbFile, removePaginationSchema } from "./app-test-helpers.js";

const past = "2000-01-01T00:00:00.000Z";
function fixture(t: { after: (fn: () => void) => void }) {
  const file = createDbFile();
  const db = new KanbanDb(file);
  t.after(() => db.close());
  const board = db.createBoard({ name: "Completion time" });
  const [todo, , acceptance, done] = board.lanes;
  const create = (laneId = todo.id) => db.createTicket({ boardId: board.board.id, laneId, title: "Ticket" });
  const stamp = (id: number) => db.sqlite.prepare("UPDATE tickets SET resolved_at = ? WHERE id = ?").run(past, id);
  return { db, file, board, todo, acceptance, done, create, stamp };
}

test("completion arrivals persist while metadata edits, archive and ordering leave them intact", t => {
  const { db, file, done, todo, create, stamp } = fixture(t);
  const ticket = create();
  assert.equal(ticket.resolvedAt, null);
  assert.ok(db.positionTicket(ticket.id, { laneId: done.id }).resolvedAt);
  stamp(ticket.id);
  const other = create(done.id);
  db.updateTicket(ticket.id, { title: "Edited", isArchived: true });
  db.updateTicket(ticket.id, { isArchived: false });
  db.positionTicket(ticket.id, { laneId: done.id, position: 0 });
  db.reorderLaneTickets(done.id, [other.id, ticket.id]);
  assert.equal(db.getTicket(ticket.id)!.resolvedAt, past);
  const reopened = new KanbanDb(file);
  assert.equal(reopened.getTicket(ticket.id)!.resolvedAt, past);
  reopened.close();
  assert.equal(db.moveTicket(ticket.id, { boardId: ticket.boardId, laneId: todo.id }).resolvedAt, null);
  const recompleted = db.updateTicket(ticket.id, { laneId: done.id });
  assert.ok(recompleted.resolvedAt && recompleted.resolvedAt > past);
});

test("completion lane changes and bulk move paths update completion dates, including archived tickets", t => {
  const { db, board, todo, acceptance, done, create, stamp } = fixture(t);
  const a = create(done.id), b = create();
  db.updateTicket(b.id, { isArchived: true });
  stamp(a.id);
  db.updateLane(acceptance.id, { isCompletionLane: true });
  assert.notEqual(db.moveTicket(a.id, { boardId: a.boardId, laneId: acceptance.id }).resolvedAt, past);
  db.bulkTransitionTickets({ boardId: board.board.id, ticketIds: [a.id, b.id], laneName: done.name });
  assert.ok(db.getTicket(a.id)!.resolvedAt);
  assert.ok(db.getTicket(b.id)!.resolvedAt);
  db.bulkMoveTickets({ sourceBoardId: board.board.id, boardId: board.board.id, laneId: todo.id, ticketIds: [a.id, b.id] });
  assert.equal(db.getTicket(a.id)!.resolvedAt, null);
  assert.equal(db.getTicket(b.id)!.resolvedAt, null);
  db.updateLane(todo.id, { isCompletionLane: true });
  assert.ok(db.getTicket(a.id)!.resolvedAt);
  assert.ok(db.getTicket(b.id)!.resolvedAt);
  db.updateLane(todo.id, { isCompletionLane: false });
  assert.equal(db.getTicket(b.id)!.resolvedAt, null);
});

test("pre-timestamp database migration preserves unknown history and positions", () => {
  const file = createDbFile();
  const old = new KanbanDb(file);
  const board = old.createBoard({ name: "Old" });
  const done = board.lanes[3];
  const ticket = old.createTicket({ boardId: board.board.id, laneId: done.id, title: "Historical" });
  removePaginationSchema(old.sqlite);
  old.sqlite.exec("DROP TRIGGER ticket_completion_time_insert; DROP TRIGGER ticket_completion_time_update; ALTER TABLE tickets DROP COLUMN resolved_at;");
  old.close();
  const migrated = new KanbanDb(file);
  try {
    assert.equal(migrated.getTicket(ticket.id)!.resolvedAt, null);
    assert.equal(migrated.getTicket(ticket.id)!.position, ticket.position);
    assert.equal(migrated.getTicket(ticket.id)!.updatedAt, ticket.updatedAt);
    assert.equal(migrated.getTicket(ticket.id)!.isResolved, true);
  } finally { migrated.close(); }
});

test("API exposes readonly completion date and export/import preserves known or unknown history", async t => {
  const { db, file, board, done, create, stamp } = fixture(t);
  const ticket = create(done.id);
  stamp(ticket.id);
  const app = buildApp({ dbFile: file });
  try {
    const detail = await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}` });
    assert.equal(detail.json().resolvedAt, past);
    const list = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/tickets?resolved=true` });
    assert.equal(list.json().tickets.find((item: { id: number }) => item.id === ticket.id).resolvedAt, past);
    const edit = await app.inject({ method: "PATCH", url: `/api/tickets/${ticket.id}`, payload: { title: "Edit", resolvedAt: "1999-01-01T00:00:00.000Z" } });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.equal(db.getTicket(ticket.id)!.resolvedAt, past);
    const exportResponse = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/export` });
    assert.equal(exportResponse.json().tickets[0].resolvedAt, past);
    const exported = db.exportBoard(board.board.id);
    assert.equal(exported.tickets[0].resolvedAt, past);
    assert.equal(db.importBoard(exported).tickets[0].resolvedAt, past);
    delete exported.tickets[0].resolvedAt;
    assert.equal(db.importBoard(exported).tickets[0].resolvedAt, null);
    exported.tickets[0].resolvedAt = "invalid";
    const count = db.listBoards().length;
    assert.throws(() => db.importBoard(exported), /Invalid ticket completion date/);
    assert.equal(db.listBoards().length, count);
  } finally { await app.close(); }
});
