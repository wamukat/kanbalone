import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

test("deleted ticket activity remains available through the API", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const board = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Deleted Activity Board", laneNames: ["todo"] },
  })).json();
  const laneId = board.lanes[0].id;
  const ticket = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId, title: "Delete me through API" },
  })).json();

  const deleteResponse = await app.inject({
    method: "DELETE",
    url: `/api/tickets/${ticket.id}`,
  });
  assert.equal(deleteResponse.statusCode, 204);

  const activityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${ticket.id}/activity`,
  });
  assert.equal(activityResponse.statusCode, 200);
  assert.equal(activityResponse.json().activity[0].action, "ticket_deleted");
  assert.equal(activityResponse.json().activity[0].ticketId, null);
  assert.equal(activityResponse.json().activity[0].subjectTicketId, ticket.id);

  await app.close();
});

test("boards can be reordered", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const first = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "First" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Second" },
  })).json();
  const third = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Third" },
  })).json();

  const reorderResponse = await app.inject({
    method: "POST",
    url: "/api/boards/reorder",
    payload: { boardIds: [third.board.id, first.board.id, second.board.id] },
  });
  assert.equal(reorderResponse.statusCode, 200);
  assert.deepEqual(
    reorderResponse.json().boards.map((board: { name: string; position: number }) => ({ name: board.name, position: board.position })),
    [
      { name: "Third", position: 0 },
      { name: "First", position: 1 },
      { name: "Second", position: 2 },
    ],
  );

  const listResponse = await app.inject({ method: "GET", url: "/api/boards" });
  assert.deepEqual(
    listResponse.json().boards.map((board: { name: string }) => board.name),
    ["Third", "First", "Second"],
  );

  const invalidResponse = await app.inject({
    method: "POST",
    url: "/api/boards/reorder",
    payload: { boardIds: [first.board.id, second.board.id] },
  });
  assert.equal(invalidResponse.statusCode, 400);

  await app.close();
});

test("reordering visible tickets preserves stable archived positions on restore", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Archive Order Board", laneNames: ["todo"] });
  const laneId = board.lanes[0].id;
  const first = db.createTicket({ boardId: board.board.id, laneId, title: "First" });
  const second = db.createTicket({ boardId: board.board.id, laneId, title: "Second" });
  const third = db.createTicket({ boardId: board.board.id, laneId, title: "Third" });

  db.updateTicket(second.id, { isArchived: true });
  db.reorderLaneTickets(laneId, [third.id, first.id]);

  db.updateTicket(second.id, { isArchived: false });

  const restored = db.listTickets(board.board.id, { includeArchived: true });
  assert.deepEqual(
    restored.map((ticket) => ({ id: ticket.id, position: ticket.position })),
    [
      { id: third.id, position: 0 },
      { id: first.id, position: 1 },
      { id: second.id, position: 2 },
    ],
  );

  db.close();
});

test("position normalization preserves legacy ties and rolls back a failed write", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const { board, lanes } = db.createBoard({ name: "Legacy positions", laneNames: ["Work"] });
    const laneId = lanes[0]!.id;
    const create = (title: string, isArchived = false) => db.createTicket({ boardId: board.id, laneId, title, isArchived });
    const first = create("First");
    const second = create("Second");
    const archived = create("Archived", true);
    const removed = create("Remove this");
    const setPosition = db.sqlite.prepare("UPDATE tickets SET position = ? WHERE id = ?");
    setPosition.run(7, first.id);
    setPosition.run(7, second.id);
    setPosition.run(-3, archived.id);

    const readPositions = () => db.listTickets(board.id, { includeArchived: true })
      .map(({ id, position, updatedAt }) => ({ id, position, updatedAt }));
    const readRevision = () => db.sqlite.prepare("SELECT revision FROM ticket_list_revisions WHERE board_id = ?").pluck().get(board.id);
    const original = readPositions();
    const revision = readRevision();
    db.sqlite.exec(`
      CREATE TRIGGER fail_position_update BEFORE UPDATE OF position ON tickets
      WHEN NEW.id = ${second.id} AND OLD.position IS NOT NEW.position
      BEGIN SELECT RAISE(ABORT, 'Failed position update'); END;
    `);
    assert.throws(() => db.deleteTicket(removed.id), /Failed position update/);
    assert.deepEqual(readPositions(), original);
    assert.equal(readRevision(), revision);

    db.sqlite.exec("DROP TRIGGER fail_position_update");
    db.deleteTicket(removed.id);
    assert.deepEqual(readPositions(), [
      { id: first.id, position: 0, updatedAt: first.updatedAt },
      { id: second.id, position: 1, updatedAt: second.updatedAt },
      { id: archived.id, position: 2, updatedAt: archived.updatedAt },
    ]);
  } finally { db.close(); }
});

test("positioning one ticket moves it without requiring hidden board tickets", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Single Position Board", laneNames: ["todo", "done"] });
  const todoLaneId = board.lanes[0].id;
  const doneLaneId = board.lanes[1].id;
  const first = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "First" });
  const moving = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "Moving" });
  const after = db.createTicket({ boardId: board.board.id, laneId: doneLaneId, title: "After" });
  for (let index = 0; index < 10; index += 1) {
    db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: `Archived ${index}`, isArchived: true });
  }

  const moved = db.positionTicket(moving.id, { laneId: doneLaneId, position: 0 });

  assert.equal(moved.laneId, doneLaneId);
  assert.deepEqual(
    db.listTickets(board.board.id, { includeArchived: true })
      .filter((ticket) => ticket.laneId === doneLaneId)
      .map((ticket) => ({ id: ticket.id, position: ticket.position })),
    [
      { id: moving.id, position: 0 },
      { id: after.id, position: 1 },
    ],
  );
  assert.equal(db.getTicket(first.id)?.laneId, todoLaneId);

  db.close();
});

test("positioning one ticket honors visible anchors when target lane has hidden inactive tickets", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Anchored Position Board", laneNames: ["todo", "done"] });
  const todoLaneId = board.lanes[0].id;
  const doneLaneId = board.lanes[1].id;
  const moving = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "Moving" });
  db.updateLane(doneLaneId, { isCompletionLane: true });
  const resolved = Array.from({ length: 10 }, (_, index) =>
    db.createTicket({ boardId: board.board.id, laneId: doneLaneId, title: `Resolved ${index}`, isResolved: true })
  );
  const anchor = db.createTicket({ boardId: board.board.id, laneId: doneLaneId, title: "Visible anchor" });

  db.positionTicket(moving.id, {
    laneId: doneLaneId,
    position: 4,
    afterTicketId: anchor.id,
  });

  assert.deepEqual(
    db.listTickets(board.board.id, { includeArchived: true })
      .filter((ticket) => ticket.laneId === doneLaneId)
      .map((ticket) => ticket.id),
    [...resolved.map((ticket) => ticket.id), anchor.id, moving.id],
  );

  db.close();
});

test("ticket position endpoint validates lane and anchor scope", async () => {
  const app = buildApp({ dbFile: createDbFile() });
  const boardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Position API Board", laneNames: ["todo", "done"] },
  });
  const board = boardResponse.json() as { board: { id: number }; lanes: Array<{ id: number }> };
  const otherBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Other Position Board", laneNames: ["todo"] },
  });
  const otherBoard = otherBoardResponse.json() as { board: { id: number }; lanes: Array<{ id: number }> };
  const ticketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: board.lanes[0].id, title: "Moving" },
  });
  const ticket = ticketResponse.json() as { id: number };
  const otherLaneTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${otherBoard.board.id}/tickets`,
    payload: { laneId: otherBoard.lanes[0].id, title: "Other" },
  });
  const otherLaneTicket = otherLaneTicketResponse.json() as { id: number };

  const invalidBody = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${ticket.id}/position`,
    payload: { position: 0 },
  });
  assert.equal(invalidBody.statusCode, 400);

  const crossBoardLane = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${ticket.id}/position`,
    payload: { laneId: otherBoard.lanes[0].id, position: 0 },
  });
  assert.equal(crossBoardLane.statusCode, 400);

  const crossBoardAnchor = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${ticket.id}/position`,
    payload: { laneId: board.lanes[1].id, afterTicketId: otherLaneTicket.id },
  });
  assert.equal(crossBoardAnchor.statusCode, 400);

  const missingTicket = await app.inject({
    method: "PATCH",
    url: "/api/tickets/999999/position",
    payload: { laneId: board.lanes[1].id, position: 0 },
  });
  assert.equal(missingTicket.statusCode, 404);

  await app.close();
});

test("guarded ticket moves preserve the observed source and relative anchor order", async () => {
  const dbFile = createDbFile();
  const db = new KanbanDb(dbFile);
  const app = buildApp({ dbFile });
  try {
    const { board, lanes: [source, target, done] } = db.createBoard({
      name: "Guarded position API", laneNames: ["Source", "Target", "Done"],
    });
    db.updateLane(done.id, { isCompletionLane: true });
    const create = (laneId: number, title: string) => db.createTicket({ boardId: board.id, laneId, title });
    const moving = create(source.id, "Moving");
    const after = create(target.id, "After");
    const between = create(target.id, "Hidden by current filter");
    const before = create(target.id, "Before");
    db.sqlite.prepare("UPDATE tickets SET position = -2 WHERE id = ?").run(moving.id);
    const move = (payload: object) => app.inject({ method: "PATCH", url: `/api/tickets/${moving.id}/position`, payload });
    const anchors = { beforeTicketId: before.id, afterTicketId: after.id };
    const sourceGuard = { expectedSourceLaneId: source.id, expectedSourcePosition: -2 };

    const titleChange = await app.inject({
      method: "PATCH", url: `/api/tickets/${moving.id}`, payload: { title: "Updated title" },
    });
    assert.equal(titleChange.statusCode, 200);
    for (const malformed of [
      { expectedSourceLaneId: source.id },
      { ...sourceGuard, ...anchors },
      { ...sourceGuard, expectedAnchorOrder: "after-before" },
      { ...sourceGuard, beforeTicketId: before.id, afterTicketId: before.id, expectedAnchorOrder: "after-before" },
      { ...sourceGuard, expectedSourcePosition: -2.5 },
    ]) {
      assert.equal((await move({ laneId: target.id, ...malformed })).statusCode, 400);
    }

    const moved = await move({ laneId: target.id, ...sourceGuard, ...anchors, expectedAnchorOrder: "after-before" });
    assert.equal(moved.statusCode, 200, moved.body);
    assert.equal(moved.json().title, "Updated title");
    const ordered = () => db.listTickets(board.id, { laneId: target.id }).map(({ id }) => id);
    assert.deepEqual(ordered(), [after.id, between.id, moving.id, before.id]);

    const reversed = await move({
      laneId: target.id, expectedSourceLaneId: target.id, expectedSourcePosition: moved.json().position,
      beforeTicketId: after.id, afterTicketId: before.id, expectedAnchorOrder: "before-after",
    });
    assert.equal(reversed.statusCode, 200, reversed.body);
    assert.deepEqual(ordered(), [moving.id, after.id, between.id, before.id]);

    const completed = await move({
      laneId: done.id, position: 0, beforeTicketId: null, afterTicketId: null,
      expectedSourceLaneId: target.id, expectedSourcePosition: reversed.json().position,
    });
    assert.equal(completed.statusCode, 200, completed.body);
    assert.equal(completed.json().isResolved, true);
    assert.equal(completed.json().position, 0);
    // An earlier client can still send position and both anchors without a source guard.
    const legacy = await move({ laneId: target.id, position: 0, ...anchors });
    assert.equal(legacy.statusCode, 200, legacy.body);
    assert.deepEqual(ordered(), [after.id, between.id, moving.id, before.id]);
  } finally {
    await app.close();
    db.close();
  }
});

test("a rejected guarded move leaves positions, timestamps, activity and list revision intact", async () => {
  const dbFile = createDbFile();
  const db = new KanbanDb(dbFile);
  const app = buildApp({ dbFile });
  try {
    const { board, lanes: [source, target, spare] } = db.createBoard({
      name: "Position API concurrent edits", laneNames: ["Source", "Target", "Spare"],
    });
    const create = (laneId: number, title: string) => db.createTicket({ boardId: board.id, laneId, title });
    create(source.id, "Other source ticket");
    const moving = create(source.id, "Moving");
    const after = create(target.id, "After");
    const before = create(target.id, "Before");
    const move = (id: number, payload: object) => app.inject({ method: "PATCH", url: `/api/tickets/${id}/position`, payload });
    const oldIntent = {
      laneId: target.id, beforeTicketId: before.id, afterTicketId: after.id, expectedAnchorOrder: "after-before",
      expectedSourceLaneId: source.id, expectedSourcePosition: moving.position,
    };
    const snapshot = async () => {
      const page = await app.inject({ url: `/api/boards/${board.id}/tickets?limit=20&archived=all` });
      const history = await app.inject({ url: `/api/tickets/${moving.id}/activity` });
      assert.equal(page.statusCode, 200, page.body);
      assert.equal(history.statusCode, 200, history.body);
      const revision = page.headers["x-kanbalone-ticket-revision"];
      assert.match(String(revision), /^\d+$/);
      return { tickets: page.json().tickets, activity: history.json().activity, revision };
    };
    const reject = async () => {
      const state = await snapshot();
      const rejected = await move(moving.id, oldIntent);
      assert.equal(rejected.statusCode, 409, rejected.body);
      assert.deepEqual(await snapshot(), state);
    };

    assert.equal((await move(moving.id, { laneId: source.id, position: 0 })).statusCode, 200);
    await reject();

    assert.equal((await move(moving.id, { laneId: spare.id, position: 0 })).statusCode, 200);
    await reject();

    assert.equal((await move(moving.id, { laneId: source.id, position: moving.position })).statusCode, 200);
    assert.equal((await move(before.id, { laneId: target.id, position: 0 })).statusCode, 200);
    await reject();

    assert.equal((await move(after.id, { laneId: spare.id, position: 0 })).statusCode, 200);
    await reject();
    const deleted = await app.inject({ method: "DELETE", url: `/api/tickets/${before.id}` });
    assert.equal(deleted.statusCode, 204);
    await reject();
  } finally {
    await app.close();
    db.close();
  }
});

test("deleting a lane compacts remaining lane positions", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Lane Position Board", laneNames: ["Todo", "Doing", "Review", "Done"] });

  db.deleteLane(board.lanes[1].id);

  assert.deepEqual(
    db.listLanes(board.board.id).map((lane) => ({ name: lane.name, position: lane.position })),
    [
      { name: "Todo", position: 0 },
      { name: "Review", position: 1 },
      { name: "Done", position: 2 },
    ],
  );

  db.close();
});

test("bulk transition operates on board ticket sets", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Bulk Board", laneNames: ["Todo", "Doing", "Done"] },
  });
  assert.equal(createdBoardResponse.statusCode, 201);
  const board = createdBoardResponse.json();
  const [todoLane, doingLane, doneLane] = board.lanes;
  await app.inject({ method: "PATCH", url: `/api/lanes/${doneLane.id}`, payload: { isCompletionLane: true } });

  const first = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "One" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: doingLane.id, title: "Two" },
  })).json();

  const bulkTransition = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-transition`,
    payload: { ticketIds: [first.id, second.id], laneName: "Done" },
  });
  assert.equal(bulkTransition.statusCode, 200);
  const transitioned = bulkTransition.json().tickets;
  assert.equal(transitioned.length, 2);
  assert.ok(transitioned.every((ticket: { laneId: number; isResolved: boolean }) => ticket.laneId === doneLane.id));
  assert.ok(transitioned.every((ticket: { isResolved: boolean }) => ticket.isResolved === true));

  const detailOne = await app.inject({
    method: "GET",
    url: `/api/tickets/${first.id}`,
  });
  assert.equal(detailOne.json().laneId, doneLane.id);
  assert.equal(detailOne.json().isResolved, true);

  const bulkArchive = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-archive`,
    payload: { ticketIds: [first.id, second.id], isArchived: true },
  });
  assert.equal(bulkArchive.statusCode, 200);
  assert.ok(bulkArchive.json().tickets.every((ticket: { isArchived: boolean }) => ticket.isArchived === true));

  const hiddenArchived = await app.inject({
    method: "GET",
    url: `/api/boards/${board.board.id}/tickets`,
  });
  assert.equal(hiddenArchived.statusCode, 200);
  assert.equal(hiddenArchived.json().tickets.length, 0);

  const bulkRestore = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-archive`,
    payload: { ticketIds: [first.id, second.id], isArchived: false },
  });
  assert.equal(bulkRestore.statusCode, 200);
  assert.ok(bulkRestore.json().tickets.every((ticket: { isArchived: boolean }) => ticket.isArchived === false));

  const missingLaneTransition = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-transition`,
    payload: { ticketIds: [first.id], laneName: "Missing" },
  });
  assert.equal(missingLaneTransition.statusCode, 400);

  const missingTicket = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-transition`,
    payload: { ticketIds: [first.id, 99999], laneName: "Todo" },
  });
  assert.equal(missingTicket.statusCode, 400);

  await app.close();
});

test("bulk move is atomic when any selected ticket is invalid", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const sourceBoard = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Bulk Move Atomic Source", laneNames: ["todo"] },
  })).json();
  const targetBoard = (await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Bulk Move Atomic Target", laneNames: ["todo"] },
  })).json();
  const first = (await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets`,
    payload: { laneId: sourceBoard.lanes[0].id, title: "First" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets`,
    payload: { laneId: sourceBoard.lanes[0].id, title: "Second" },
  })).json();

  const invalidMove = await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets/bulk-move`,
    payload: { ticketIds: [first.id, 999999], boardId: targetBoard.board.id, laneId: targetBoard.lanes[0].id },
  });
  assert.equal(invalidMove.statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: `/api/tickets/${first.id}` })).json().boardId, sourceBoard.board.id);

  const moved = await app.inject({
    method: "POST",
    url: `/api/boards/${sourceBoard.board.id}/tickets/bulk-move`,
    payload: { ticketIds: [first.id, second.id], boardId: targetBoard.board.id, laneId: targetBoard.lanes[0].id },
  });
  assert.equal(moved.statusCode, 200);
  assert.deepEqual(
    moved.json().tickets.map((ticket: { id: number; boardId: number; laneId: number }) => [ticket.id, ticket.boardId, ticket.laneId]),
    [
      [first.id, targetBoard.board.id, targetBoard.lanes[0].id],
      [second.id, targetBoard.board.id, targetBoard.lanes[0].id],
    ],
  );

  await app.close();
});

