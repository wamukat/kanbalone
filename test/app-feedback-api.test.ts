import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import { createDbFile } from "./app-test-helpers.js";

function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dbFile = createDbFile();
  const db = new KanbanDb(dbFile);
  const board = db.createBoard({ name: "Test", laneNames: ["進行中", "Waiting"] });
  const [lane, otherLane] = board.lanes;
  const create = (title: string, fields = {}) => db.createTicket({ boardId: board.board.id, laneId: lane.id, title, ...fields });
  const app = buildApp({ dbFile });
  t.after(async () => { await app.close(); db.close(); });
  return { db, app, board, lane, otherLane, create };
}

test("list filters combine exact lane names, direct parent, resolved and archived state", async (t) => {
  const { app, board, lane, otherLane, create } = fixture(t);
  const parent = create("Parent");
  const child = create("Child", { parentTicketId: parent.id });
  create("Resolved child", { parentTicketId: parent.id, isResolved: true });
  const archived = create("Archived child", { parentTicketId: parent.id, isArchived: true });
  create("Other lane", { parentTicketId: parent.id, laneId: otherLane.id });
  const list = async (query: string) => {
    const r = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/tickets?${query}` });
    assert.equal(r.statusCode, 200, r.body);
    return r.json().tickets.map((ticket: { id: number }) => ticket.id);
  };
  const filter = `lane=${encodeURIComponent(lane.name)}&parent=${parent.id}&resolved=false`;
  assert.deepEqual(await list(filter), [child.id]);
  assert.deepEqual(await list(filter + "&archived=all"), [child.id, archived.id]);
  assert.deepEqual(await list("parent=none"), [parent.id]);
  assert.deepEqual(await list("parent=999999"), []);
  assert.deepEqual(await list("lane=unknown"), []);
  assert.deepEqual(await list(`lane_id=${lane.id}&parent=${parent.id}&resolved=false`), [child.id]);
  for (const query of [`lane=Waiting&lane_id=${lane.id}`, "parent=0", "parent=-1", "parent=1.5", "parent=9007199254740992", "lane="]) {
    const r = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/tickets?${query}` });
    assert.equal(r.statusCode, 400, query);
  }
});

test("comment limits run after deterministic timestamp and ID ordering", async (t) => {
  const { app, db, create } = fixture(t);
  const ticket = create("Comments");
  const comments = ["a", "b", "c"].map((bodyMarkdown) => db.addComment({ ticketId: ticket.id, bodyMarkdown }));
  db.sqlite.prepare("UPDATE comments SET created_at = ? WHERE ticket_id = ?").run("2026-01-01T00:00:00.000Z", ticket.id);
  const list = async (query: string) => {
    const r = await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}/comments${query}` });
    assert.equal(r.statusCode, 200);
    return r.json().comments.map((comment: { id: number }) => comment.id);
  };
  assert.deepEqual(await list(""), comments.map((c) => c.id).reverse());
  assert.deepEqual(await list("?limit=2&order=desc"), [comments[2].id, comments[1].id]);
  assert.deepEqual(await list("?limit=2&order=asc"), [comments[0].id, comments[1].id]);
  for (const query of ["limit=0", "limit=101", "limit=1.5", "order=invalid"]) {
    assert.equal((await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}/comments?${query}` })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: "GET", url: "/api/tickets/999999/comments?limit=2" })).statusCode, 404);
  const empty = create("No comments");
  assert.deepEqual((await app.inject({ method: "GET", url: `/api/tickets/${empty.id}/comments?limit=2` })).json(), { comments: [] });
});

test("lane reorder preserves omitted and archived order and rejects invalid subsets atomically", async (t) => {
  const { app, db, board, lane, otherLane, create } = fixture(t);
  const first = create("First"), second = create("Second"), third = create("Third", { isResolved: true });
  const archived = create("Archived", { isArchived: true });
  const other = create("Other", { laneId: otherLane.id });
  const otherBoard = db.createBoard({ name: "Other board", laneNames: ["Todo"] });
  const foreign = db.createTicket({ boardId: otherBoard.board.id, laneId: otherBoard.lanes[0].id, title: "Foreign" });
  const post = (ticketIds: number[], laneId = lane.id) => app.inject({ method: "POST", url: `/api/lanes/${laneId}/tickets/reorder`, payload: { ticketIds } });
  const result = await post([third.id]);
  assert.equal(result.statusCode, 200, result.body);
  assert.deepEqual(result.json().tickets.map((ticket: { id: number; position: number }) => [ticket.id, ticket.position]), [[third.id, 0], [first.id, 1], [second.id, 2]]);
  assert.equal(db.getTicket(archived.id)!.position, 3);
  assert.equal(db.getTicket(other.id)!.position, other.position);
  const snapshot = () => db.listTickets(board.board.id, { includeArchived: true });
  const before = snapshot();
  for (const ids of [[first.id, first.id], [first.id, other.id], [first.id, foreign.id], [first.id, archived.id], [first.id, 999999]]) {
    assert.equal((await post(ids)).statusCode, 400);
    assert.deepEqual(snapshot(), before);
  }
  assert.equal((await post([])).statusCode, 200);
  assert.deepEqual(snapshot(), before);
  assert.equal((await post([], 999999)).statusCode, 404);
  assert.equal((await post([second.id, third.id, first.id])).statusCode, 200);
  assert.deepEqual(db.listTickets(board.board.id, { laneId: lane.id }).map((ticket) => ticket.id), [second.id, third.id, first.id]);
});

test("append uses latest body, preserves literal Markdown and rolls back invalid combined updates", async (t) => {
  const { app, db, create } = fixture(t);
  const ticket = create("Append", { bodyMarkdown: "Start" });
  const patch = (payload: object, id = ticket.id) => app.inject({ method: "PATCH", url: `/api/tickets/${id}`, payload });
  const fragments = Array.from({ length: 10 }, (_, i) => `\n- task ${i}`);
  const results = await Promise.all(fragments.map((appendMarkdown) => patch({ appendMarkdown })));
  assert.ok(results.every((r) => r.statusCode === 200));
  const body = db.getTicket(ticket.id)!.bodyMarkdown;
  for (const fragment of fragments) assert.equal(body.split(fragment).length, 2);
  const literal = '\nC:\\example\\file "日本語"';
  const result = await patch({ appendMarkdown: literal });
  assert.equal(result.json().bodyMarkdown, body + literal);
  assert.ok(result.json().bodyHtml.includes("日本語"));
  for (const payload of [{ appendMarkdown: "x", bodyMarkdown: "replace" }, { appendMarkdown: "" }, { appendMarkdown: "x", parentTicketId: ticket.id }]) {
    assert.equal((await patch(payload)).statusCode, 400);
    assert.equal(db.getTicket(ticket.id)!.bodyMarkdown, body + literal);
  }
  assert.equal((await patch({ appendMarkdown: "x" }, 999999)).statusCode, 404);
  assert.equal((await patch({ bodyMarkdown: "Replacement" })).statusCode, 200);
  assert.equal(db.getTicket(ticket.id)!.bodyMarkdown, "Replacement");
  const empty = create("Empty");
  assert.equal((await patch({ appendMarkdown: "No added separator" }, empty.id)).json().bodyMarkdown, "No added separator");
});
