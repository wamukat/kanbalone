import test from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { KanbanDb } from "../src/db.js";
import { buildApp } from "../src/app.js";
import { createDbFile, removePaginationSchema } from "./app-test-helpers.js";

function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const dbFile = createDbFile();
  const db = new KanbanDb(dbFile);
  const board = db.createBoard({ name: "Completion" });
  const [todo, , acceptance, done] = board.lanes;
  const app = buildApp({ dbFile });
  t.after(async () => { await app.close(); db.close(); });
  return { db, app, board, todo, acceptance, done };
}

test("completion is explicit, has an Acceptance stage, and supports multiple or no completion lanes", (t) => {
  const { db, board, todo, acceptance, done } = fixture(t);
  assert.equal(acceptance.name, "Acceptance");
  assert.equal(acceptance.isCompletionLane, false);
  assert.equal(done.isCompletionLane, true);
  const other = db.createBoard({ name: "Custom", laneNames: ["Done", "Acceptance"] });
  assert.ok(other.lanes.every((l) => !l.isCompletionLane));
  db.updateLane(todo.id, { isCompletionLane: true });
  db.updateLane(done.id, "Accepted");
  assert.equal(db.listLanes(board.board.id).filter((l) => l.isCompletionLane).length, 2);
});

test("every move path derives completion and preserves archive state", (t) => {
  const { db, board, todo, acceptance, done } = fixture(t);
  const first = db.createTicket({ boardId: board.board.id, laneId: acceptance.id, title: "First" });
  const second = db.createTicket({ boardId: board.board.id, laneId: done.id, title: "Second", isArchived: true });
  assert.equal(first.isResolved, false);
  assert.equal(second.isResolved, true);
  assert.equal(db.positionTicket(first.id, { laneId: done.id }).isResolved, true);
  assert.equal(db.moveTicket(second.id, { boardId: board.board.id, laneId: todo.id }).isResolved, false);
  assert.equal(db.getTicket(second.id)!.isArchived, true);
  db.positionTicket(first.id, { laneId: acceptance.id, position: 0 });
  assert.equal(db.getTicket(first.id)!.isResolved, false);
  db.bulkTransitionTickets({ boardId: board.board.id, ticketIds: [first.id, second.id], laneName: done.name });
  assert.ok([first.id, second.id].every((id) => db.getTicket(id)!.isResolved));
  const other = db.createBoard({ name: "Target", laneNames: ["Inbox"] });
  db.bulkMoveTickets({ sourceBoardId: board.board.id, boardId: other.board.id, laneId: other.lanes[0].id, ticketIds: [first.id, second.id] });
  assert.ok([first.id, second.id].every((id) => !db.getTicket(id)!.isResolved));
  assert.equal(db.getTicket(second.id)!.isArchived, true);
});

test("lane changes update archived tickets, relationships and filtered reads consistently", async (t) => {
  const { db, app, board, todo } = fixture(t);
  const parent = db.createTicket({ boardId: board.board.id, laneId: todo.id, title: "Parent" });
  const child = db.createTicket({ boardId: board.board.id, laneId: todo.id, title: "Child", parentTicketId: parent.id, blockerIds: [parent.id], isArchived: true });
  const change = await app.inject({ method: "PATCH", url: `/api/lanes/${todo.id}`, payload: { isCompletionLane: true } });
  assert.equal(change.statusCode, 200, change.body);
  assert.equal(change.json().isCompletionLane, true);
  assert.equal(db.getTicket(child.id)!.parent!.isResolved, true);
  assert.equal(db.getTicket(child.id)!.blockers[0].isResolved, true);
  assert.equal(db.getTicket(parent.id)!.children[0].isResolved, true);
  const all = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/tickets?resolved=true&archived=all` });
  assert.equal(all.json().tickets.length, 2);
  db.updateTicket(child.id, { isArchived: false });
  assert.equal(db.getTicket(child.id)!.isResolved, true);
  db.updateLane(todo.id, { isCompletionLane: false });
  assert.equal(db.getTicket(child.id)!.isResolved, false);
});

test("retired completion flags reject matching and conflicting values without mutation", async (t) => {
  const { db, app, board, todo, done } = fixture(t);
  const ticket = db.createTicket({ boardId: board.board.id, laneId: todo.id, title: "Unchanged" });
  const initial = db.getTicket(ticket.id);
  const initialCount = db.listTickets(board.board.id).length;
  for (const key of ["isResolved", "isCompleted"]) {
    for (const value of [true, false, null, "false", 0]) {
      const retired = { [key]: value };
      const attempts = [
        { method: "PATCH" as const, url: `/api/tickets/${ticket.id}`, payload: { title: "Changed", ...retired } },
        { method: "PATCH" as const, url: `/api/tickets/${ticket.id}/transition`, payload: { laneName: done.name, ...retired } },
        { method: "POST" as const, url: `/api/boards/${board.board.id}/tickets`, payload: { laneId: done.id, title: "Invalid", ...retired } },
        { method: "POST" as const, url: `/api/boards/${board.board.id}/tickets/preview`, payload: { laneId: done.id, title: "Invalid", ...retired } },
        { method: "POST" as const, url: `/api/tickets/${ticket.id}/change-preview`, payload: { title: "Changed", ...retired } },
        { method: "POST" as const, url: `/api/boards/${board.board.id}/tickets/bulk-transition`, payload: { ticketIds: [ticket.id], laneName: done.name, ...retired } },
      ];
      for (const request of attempts) {
        const response = await app.inject(request);
        assert.equal(response.statusCode, 400, `${request.url}: ${response.body}`);
        assert.match(response.json().error, /Completion flags are not accepted/);
        assert.deepEqual(db.getTicket(ticket.id), initial);
        assert.equal(db.listTickets(board.board.id).length, initialCount);
      }
    }
  }
  const moved = await app.inject({ method: "PATCH", url: `/api/tickets/${ticket.id}/transition`, payload: { laneName: done.name } });
  assert.equal(moved.statusCode, 200, moved.body);
  assert.equal(moved.json().isResolved, true);
  assert.ok(!Object.hasOwn(moved.json(), "isCompleted"));
});

test("removed completion/reorder APIs are absent and resolved is the only completion filter", async (t) => {
  const { db, app, board, todo, done } = fixture(t);
  const parent = db.createTicket({ boardId: board.board.id, laneId: todo.id, title: "Open" });
  const child = db.createTicket({ boardId: board.board.id, laneId: done.id, title: "Done", parentTicketId: parent.id });
  for (const query of ["completed=true", "completed=false", "completed=", "resolved=false&completed=true"]) {
    const response = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/tickets?${query}` });
    assert.equal(response.statusCode, 400, response.body);
    assert.match(response.json().error, /Use resolved instead/);
  }
  for (const path of ["bulk-complete", "reorder"]) {
    const response = await app.inject({ method: "POST", url: `/api/boards/${board.board.id}/tickets/${path}`,
      payload: { ticketIds: [parent.id], isResolved: true, items: [{ ticketId: parent.id, laneId: done.id, position: 0 }] } });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(db.getTicket(parent.id)!.laneId, todo.id);
  }
  const exported = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/export` });
  assert.equal(exported.statusCode, 200);
  assert.doesNotMatch(exported.body, /"isCompleted"/);
  const filtered = await app.inject({ method: "GET", url: `/api/boards/${board.board.id}/tickets?resolved=true` });
  assert.equal(filtered.statusCode, 200);
  assert.deepEqual(filtered.json().tickets.map((ticket: {id: number}) => ticket.id), [child.id]);
  assert.doesNotMatch(filtered.body, /"isCompleted"/);
  for (const path of [`/api/tickets/${parent.id}`, `/api/tickets/${parent.id}/relations`, `/api/tickets/${child.id}`]) {
    const response = await app.inject({ method: "GET", url: path });
    assert.equal(response.statusCode, 200, response.body);
    assert.doesNotMatch(response.body, /"isCompleted"/);
  }
});

function makeLegacy(db: KanbanDb) {
  removePaginationSchema(db.sqlite);
  db.sqlite.exec(`DROP TRIGGER ticket_completion_insert; DROP TRIGGER ticket_completion_update; DROP TRIGGER lane_completion_update;
    DROP TRIGGER ticket_completion_time_insert; DROP TRIGGER ticket_completion_time_update;
    ALTER TABLE tickets DROP COLUMN resolved_at;
    ALTER TABLE lanes DROP COLUMN is_completion_lane;`);
}

test("legacy lanes keep their meaning while resolved tickets move once to a separate completion lane", () => {
  const file = createDbFile();
  const old = new KanbanDb(file);
  const board = old.createBoard({ name: "Legacy", laneNames: ["Arbitrary", "Done"] });
  const ticket = old.createTicket({ boardId: board.board.id, laneId: board.lanes[0].id, title: "Resolved", isArchived: true });
  makeLegacy(old);
  old.sqlite.prepare("UPDATE tickets SET is_resolved = 1 WHERE id = ?").run(ticket.id);
  old.close();
  for (let attempt = 0; attempt < 2; attempt++) {
    const migrated = new KanbanDb(file);
    assert.equal(migrated.getLane(board.lanes[0].id)!.isCompletionLane, false);
    const lanes = migrated.listLanes(board.board.id);
    assert.equal(lanes.length, 3);
    assert.equal(lanes[2].isCompletionLane, true);
    assert.equal(migrated.getTicket(ticket.id)!.laneId, lanes[2].id);
    assert.equal(migrated.getLane(board.lanes[1].id)!.isCompletionLane, false);
    assert.equal(migrated.getTicket(ticket.id)!.isResolved, true);
    assert.equal(migrated.getTicket(ticket.id)!.resolvedAt, null);
    assert.equal(migrated.getTicket(ticket.id)!.isArchived, true);
    migrated.close();
  }
});

test("mixed legacy lanes preserve every flag, archive state and parent link without reusing names", () => {
  const file = createDbFile();
  const old = new KanbanDb(file);
  const board = old.createBoard({ name: "Legacy", laneNames: ["Done", "Completed (migration)"] });
  const emptyBoard = old.createBoard({ name: "No resolved", laneNames: ["Done"] });
  const first = old.createTicket({ boardId: board.board.id, laneId: board.lanes[0].id, title: "Open" });
  const second = old.createTicket({ boardId: board.board.id, laneId: board.lanes[0].id, title: "Resolved", isArchived: true, parentTicketId: first.id });
  makeLegacy(old);
  old.sqlite.prepare("UPDATE tickets SET is_resolved = 1 WHERE id = ?").run(second.id);
  old.close();
  const migrated = new KanbanDb(file);
  const lanes = migrated.listLanes(board.board.id);
  assert.equal(lanes.length, 3);
  assert.equal(lanes[2].name, "Completed (migration) 2");
  assert.ok(lanes.slice(0, 2).every((lane) => !lane.isCompletionLane));
  assert.equal(migrated.getTicket(first.id)!.laneId, board.lanes[0].id);
  const moved = migrated.getTicket(second.id)!;
  assert.equal(moved.laneId, lanes[2].id);
  assert.equal(moved.isResolved, true);
  assert.equal(moved.isArchived, true);
  assert.equal(moved.parentTicketId, first.id);
  assert.equal(migrated.listLanes(emptyBoard.board.id).length, 1);
  const activity = migrated.sqlite.prepare("SELECT details_json FROM activity_logs WHERE ticket_id = ? AND action = 'ticket_transitioned'").get(second.id) as { details_json: string };
  assert.equal(JSON.parse(activity.details_json).fromLaneId, board.lanes[0].id);
  migrated.close();
});

test("failed migration rolls back new lanes, ticket movement and schema changes", () => {
  const file = createDbFile();
  const old = new KanbanDb(file);
  const board = old.createBoard({ name: "Legacy", laneNames: ["Done"] });
  const ticket = old.createTicket({ boardId: board.board.id, laneId: board.lanes[0].id, title: "Resolved" });
  makeLegacy(old);
  old.sqlite.prepare("UPDATE tickets SET is_resolved = 1 WHERE id = ?").run(ticket.id);
  old.sqlite.exec("CREATE TRIGGER fail_migration BEFORE UPDATE OF lane_id ON tickets BEGIN SELECT RAISE(ABORT, 'simulated migration failure'); END");
  old.close();
  assert.throws(() => new KanbanDb(file), /simulated migration failure/);
  const inspect = new Database(file);
  assert.equal((inspect.prepare("PRAGMA table_info(lanes)").all() as { name: string }[]).some((c) => c.name === "is_completion_lane"), false);
  assert.equal((inspect.prepare("SELECT COUNT(*) AS n FROM lanes").get() as { n: number }).n, 1);
  assert.deepEqual(inspect.prepare("SELECT lane_id, is_resolved FROM tickets").get(), { lane_id: board.lanes[0].id, is_resolved: 1 });
  inspect.close();
});

test("exports preserve lane attributes; legacy mixed imports migrate and conflicting imports roll back", (t) => {
  const { db, board, todo, done } = fixture(t);
  db.createTicket({ boardId: board.board.id, laneId: todo.id, title: "Open" });
  db.createTicket({ boardId: board.board.id, laneId: done.id, title: "Resolved", isArchived: true });
  const data = db.exportBoard(board.board.id);
  const imported = db.importBoard(data);
  assert.equal(imported.lanes.find((lane) => lane.name === done.name)!.isCompletionLane, true);
  assert.equal(imported.tickets.find((ticket) => ticket.title === "Resolved")!.isResolved, true);
  const before = db.listBoards().length;
  const invalid = structuredClone(data);
  invalid.tickets[1].laneId = todo.id;
  assert.throws(() => db.importBoard(invalid), /Completion is determined/);
  assert.equal(db.listBoards().length, before);
  for (const lane of invalid.lanes) delete (lane as Partial<typeof lane>).isCompletionLane;
  // Old backup files may contain only isCompleted. Keep this read-only
  // migration path even though new exports and interactive APIs omit it.
  for (const ticket of invalid.tickets) {
    ticket.isCompleted = ticket.isResolved;
    delete (ticket as Partial<typeof ticket>).isResolved;
  }
  const legacy = db.importBoard(invalid);
  assert.equal(legacy.tickets.find((ticket) => ticket.title === "Open")!.isResolved, false);
  const resolved = legacy.tickets.find((ticket) => ticket.title === "Resolved")!;
  assert.equal(resolved.isResolved, true);
  assert.equal(resolved.isArchived, true);
  assert.equal(legacy.lanes.find((lane) => lane.id === resolved.laneId)!.name, "Completed (migration)");
});

test("completion selection is atomic and rejects stale counts, settings and foreign lanes", async (t) => {
  const { db, app, board, todo, done } = fixture(t);
  const ticket = db.createTicket({ boardId: board.board.id, laneId: done.id, title: "Accepted", isArchived: true });
  const expected = () => db.listLanes(board.board.id).map((lane) => ({ id: lane.id, isCompletionLane: lane.isCompletionLane, ticketCount: (db.sqlite.prepare("SELECT COUNT(*) AS n FROM tickets WHERE lane_id = ?").get(lane.id) as { n: number }).n }));
  const url = `/api/boards/${board.board.id}/completion-lanes`;
  const empty = db.createLane({ boardId: board.board.id, name: "Removed during review" });
  const beforeDeletion = expected();
  db.deleteLane(empty.id);
  const staleSelection = await app.inject({ method: "PUT", url, payload: { laneIds: [empty.id], expectedLanes: beforeDeletion } });
  assert.equal(staleSelection.statusCode, 409, staleSelection.body);
  assert.equal(db.getTicket(ticket.id)!.isResolved, true);
  const invalidSelection = await app.inject({ method: "PUT", url, payload: { laneIds: [empty.id], expectedLanes: expected() } });
  assert.equal(invalidSelection.statusCode, 400, invalidSelection.body);
  const before = expected();
  db.createTicket({ boardId: board.board.id, laneId: todo.id, title: "Added during review" });
  assert.equal((await app.inject({ method: "PUT", url, payload: { laneIds: [todo.id], expectedLanes: before } })).statusCode, 409);
  assert.equal(db.getTicket(ticket.id)!.isResolved, true);
  const foreign = db.createBoard({ name: "Other" }).lanes[0];
  assert.equal((await app.inject({ method: "PUT", url, payload: { laneIds: [foreign.id], expectedLanes: expected() } })).statusCode, 400);
  db.sqlite.exec(`CREATE TRIGGER fail_selection BEFORE UPDATE OF is_completion_lane ON lanes WHEN NEW.id = ${done.id} BEGIN SELECT RAISE(ABORT, 'simulated failure'); END`);
  assert.throws(() => db.setCompletionLanes(board.board.id, [todo.id], expected()), /simulated failure/);
  assert.equal(db.getLane(todo.id)!.isCompletionLane, false);
  assert.equal(db.getLane(done.id)!.isCompletionLane, true);
  db.sqlite.exec("DROP TRIGGER fail_selection");
  const snapshot = expected();
  assert.equal((await app.inject({ method: "PUT", url, payload: { laneIds: [todo.id], expectedLanes: snapshot } })).statusCode, 200);
  assert.equal(db.getTicket(ticket.id)!.isResolved, false);
  assert.equal(db.getTicket(ticket.id)!.isArchived, true);
  assert.equal((await app.inject({ method: "PUT", url, payload: { laneIds: [], expectedLanes: snapshot } })).statusCode, 409);
  assert.equal((await app.inject({ method: "PUT", url, payload: { laneIds: [], expectedLanes: expected() } })).statusCode, 200);
  assert.ok(db.listLanes(board.board.id).every((lane) => !lane.isCompletionLane));
});
