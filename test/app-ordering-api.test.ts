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
  db.reorderTickets(board.board.id, [
    { ticketId: third.id, laneId, position: 0 },
    { ticketId: first.id, laneId, position: 1 },
  ]);

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

test("positioning one ticket moves it without requiring hidden board tickets", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Single Position Board", laneNames: ["todo", "done"] });
  const todoLaneId = board.lanes[0].id;
  const doneLaneId = board.lanes[1].id;
  const first = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "First" });
  const moving = db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: "Moving" });
  const after = db.createTicket({ boardId: board.board.id, laneId: doneLaneId, title: "After" });
  for (let index = 0; index < 10; index += 1) {
    db.createTicket({ boardId: board.board.id, laneId: todoLaneId, title: `Resolved ${index}`, isResolved: true });
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

test("bulk resolve and bulk transition operate on board ticket sets", async () => {
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

  const bulkResolve = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-complete`,
    payload: { ticketIds: [first.id, second.id], isResolved: true },
  });
  assert.equal(bulkResolve.statusCode, 200);
  assert.deepEqual(
    bulkResolve.json().tickets.map((ticket: { id: number; isResolved: boolean }) => [ticket.id, ticket.isResolved]),
    [[first.id, true], [second.id, true]],
  );

  const bulkTransition = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets/bulk-transition`,
    payload: { ticketIds: [first.id, second.id], laneName: "Done", isResolved: true },
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
    url: `/api/boards/${board.board.id}/tickets/bulk-complete`,
    payload: { ticketIds: [first.id, 99999], isResolved: false },
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

