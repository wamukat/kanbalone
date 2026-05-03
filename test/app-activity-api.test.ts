import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

test("ticket delete activity is retained after ticket removal", () => {
  const db = new KanbanDb(createDbFile());
  const board = db.createBoard({ name: "Delete Log Board", laneNames: ["todo"] });
  const laneId = board.lanes[0].id;
  const ticket = db.createTicket({
    boardId: board.board.id,
    laneId,
    title: "Delete me",
  });

  db.deleteTicket(ticket.id);

  const rows = db.sqlite
    .prepare("SELECT ticket_id, subject_ticket_id, action, message FROM activity_logs WHERE subject_ticket_id = ? AND action = ?")
    .all(ticket.id, "ticket_deleted") as Array<{ ticket_id: number | null; subject_ticket_id: number; action: string; message: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ticket_id, null);
  assert.equal(rows[0].subject_ticket_id, ticket.id);
  assert.equal(rows[0].action, "ticket_deleted");
  assert.equal(rows[0].message, "Ticket deleted");

  db.close();
});

test("tickets can move between boards with safe tag and relation cleanup", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const sourceBoard = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Move Source", laneNames: ["todo", "done"] },
    })).json();
    const targetBoard = (await app.inject({
      method: "POST",
      url: "/api/boards",
      payload: { name: "Move Target", laneNames: ["todo", "done"] },
    })).json();
    const sourceLane = sourceBoard.lanes[0];
    const targetLane = targetBoard.lanes[1];

    const keepSourceTag = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tags`,
      payload: { name: "keep", color: "#111111" },
    })).json();
    const dropSourceTag = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tags`,
      payload: { name: "drop", color: "#222222" },
    })).json();
    const keepTargetTag = (await app.inject({
      method: "POST",
      url: `/api/boards/${targetBoard.board.id}/tags`,
      payload: { name: "keep", color: "#333333" },
    })).json();

    const movingTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: {
        laneId: sourceLane.id,
        title: "Move me",
        bodyMarkdown: "Keep this body",
        priority: 4,
        tagIds: [keepSourceTag.id, dropSourceTag.id],
      },
    })).json();
    const childTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: { laneId: sourceLane.id, title: "Child", parentTicketId: movingTicket.id },
    })).json();
    const blockerTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: { laneId: sourceLane.id, title: "Blocker" },
    })).json();
    const blockedTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: { laneId: sourceLane.id, title: "Blocked", blockerIds: [movingTicket.id] },
    })).json();
    const relatedTicket = (await app.inject({
      method: "POST",
      url: `/api/boards/${sourceBoard.board.id}/tickets`,
      payload: { laneId: sourceLane.id, title: "Related", relatedIds: [movingTicket.id] },
    })).json();

    const updateBlockerResponse = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${movingTicket.id}`,
      payload: { blockerIds: [blockerTicket.id], relatedIds: [relatedTicket.id] },
    });
    assert.equal(updateBlockerResponse.statusCode, 200);

    const invalidMoveResponse = await app.inject({
      method: "POST",
      url: `/api/tickets/${movingTicket.id}/move`,
      payload: { boardId: targetBoard.board.id, laneId: sourceLane.id },
    });
    assert.equal(invalidMoveResponse.statusCode, 400);

    const moveResponse = await app.inject({
      method: "POST",
      url: `/api/tickets/${movingTicket.id}/move`,
      payload: { boardId: targetBoard.board.id, laneId: targetLane.id },
    });
    assert.equal(moveResponse.statusCode, 200);
    assert.equal(moveResponse.json().boardId, targetBoard.board.id);
    assert.equal(moveResponse.json().laneId, targetLane.id);
    assert.equal(moveResponse.json().bodyMarkdown, "Keep this body");
    assert.equal(moveResponse.json().priority, 4);
    assert.deepEqual(moveResponse.json().tags.map((tag: { id: number }) => tag.id), [keepTargetTag.id]);
    assert.deepEqual(moveResponse.json().blockerIds, []);
    assert.deepEqual(moveResponse.json().relatedIds, []);
    assert.equal(moveResponse.json().children.length, 0);
    assert.equal(moveResponse.json().ref, `Move Target#${movingTicket.id}`);

    const childAfterMove = (await app.inject({ method: "GET", url: `/api/tickets/${childTicket.id}` })).json();
    assert.equal(childAfterMove.parentTicketId, null);
    const blockedAfterMove = (await app.inject({ method: "GET", url: `/api/tickets/${blockedTicket.id}` })).json();
    assert.deepEqual(blockedAfterMove.blockerIds, []);
    const relatedAfterMove = (await app.inject({ method: "GET", url: `/api/tickets/${relatedTicket.id}` })).json();
    assert.deepEqual(relatedAfterMove.relatedIds, []);
    const activity = (await app.inject({ method: "GET", url: `/api/tickets/${movingTicket.id}/activity` })).json();
    assert.equal(activity.activity.some((entry: { action: string; message: string }) =>
      entry.action === "ticket_moved_board" && entry.message === "Moved to Move Target / done"), true);
  } finally {
    await app.close();
  }
});

