import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildApp } from "../src/app.js";

function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kanban-test-")), "test.sqlite");
}

test("board lifecycle, ticket filters, reorder, and export/import", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Ops Board", laneNames: ["todo", "doing", "done"] },
  });
  assert.equal(createdBoardResponse.statusCode, 201);
  const createdBoard = createdBoardResponse.json();
  const boardId = createdBoard.board.id;
  const [todoLane, doingLane] = createdBoard.lanes;

  const bugLabelResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/labels`,
    payload: { name: "bug", color: "#ff0000" },
  });
  assert.equal(bugLabelResponse.statusCode, 201);
  const bugLabel = bugLabelResponse.json();

  const docsLabelResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/labels`,
    payload: { name: "docs", color: "#00aa00" },
  });
  const docsLabel = docsLabelResponse.json();

  const firstTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets`,
    payload: {
      laneId: todoLane.id,
      title: "Fix parser",
      bodyMarkdown: "Needs **attention**",
      priority: 5,
      labelIds: [bugLabel.id],
      isCompleted: false,
    },
  });
  assert.equal(firstTicketResponse.statusCode, 201);
  const firstTicket = firstTicketResponse.json();

  const secondTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets`,
    payload: {
      laneId: todoLane.id,
      parentTicketId: firstTicket.id,
      title: "Write docs",
      bodyMarkdown: "Link [guide](https://example.com)",
      priority: 2,
      labelIds: [docsLabel.id],
      isCompleted: true,
    },
  });
  const secondTicket = secondTicketResponse.json();
  assert.equal(secondTicket.priority, 2);
  assert.equal(secondTicket.parentTicketId, firstTicket.id);
  assert.deepEqual(secondTicket.blockerIds, []);

  const filteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?label=bug&completed=false&q=parser`,
  });
  assert.equal(filteredResponse.statusCode, 200);
  const filtered = filteredResponse.json();
  assert.equal(filtered.tickets.length, 1);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].ref, `Ops Board#${firstTicket.id}`);
  assert.equal(filtered.tickets[0].shortRef, `#${firstTicket.id}`);
  assert.match(filtered.tickets[0].bodyHtml, /<strong>attention<\/strong>/);

  const commentResponse = await app.inject({
    method: "POST",
    url: `/api/tickets/${firstTicket.id}/comments`,
    payload: {
      bodyMarkdown: "Checked with `logs`",
    },
  });
  assert.equal(commentResponse.statusCode, 201);

  const updateResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${firstTicket.id}`,
    payload: { laneId: doingLane.id, priority: 7, blockerIds: [secondTicket.id] },
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.json().laneId, doingLane.id);
  assert.equal(updateResponse.json().isCompleted, false);
  assert.equal(updateResponse.json().priority, 7);
  assert.equal(updateResponse.json().children.length, 1);
  assert.deepEqual(updateResponse.json().blockerIds, [secondTicket.id]);
  assert.equal(updateResponse.json().ref, `Ops Board#${firstTicket.id}`);
  assert.equal(updateResponse.json().shortRef, `#${firstTicket.id}`);

  const reorderResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets/reorder`,
    payload: {
      items: [
        { ticketId: secondTicket.id, laneId: todoLane.id, position: 0 },
        { ticketId: firstTicket.id, laneId: doingLane.id, position: 0 },
      ],
    },
  });
  assert.equal(reorderResponse.statusCode, 200);

  const exportResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/export`,
  });
  assert.equal(exportResponse.statusCode, 200);
  const exported = exportResponse.json();
  assert.equal(exported.tickets.length, 2);
  assert.ok(!("bodyHtml" in exported.tickets[0]));
  assert.equal(exported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").comments.length, 1);
  assert.equal(exported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").priority, 7);
  assert.deepEqual(
    exported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").blockerIds,
    [secondTicket.id],
  );
  assert.equal(
    exported.tickets.find((ticket: { title: string }) => ticket.title === "Write docs").parentTicketId,
    firstTicket.id,
  );

  const importResponse = await app.inject({
    method: "POST",
    url: "/api/boards/import",
    payload: exported,
  });
  assert.equal(importResponse.statusCode, 201);
  const imported = importResponse.json();
  assert.equal(imported.labels.length, 2);
  assert.equal(imported.tickets.length, 2);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").comments.length, 1);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").priority, 7);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").children.length, 1);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Write docs").parent?.title, "Fix parser");
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").blockerIds.length, 1);

  await app.close();
});

test("comment list, relations, transition, and canonical refs", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Portal", laneNames: ["Todo", "In progress", "Done"] },
  });
  assert.equal(createdBoardResponse.statusCode, 201);
  const board = createdBoardResponse.json();
  const [todoLane, inProgressLane] = board.lanes;

  const parent = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Parent" },
  })).json();

  const child = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Child", parentTicketId: parent.id },
  })).json();

  const dependency = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: inProgressLane.id, title: "Dependency" },
  })).json();

  const updatedParent = (await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { blockerIds: [dependency.id] },
  })).json();
  assert.equal(updatedParent.blockers[0].ref, `Portal#${dependency.id}`);

  const firstComment = await app.inject({
    method: "POST",
    url: `/api/tickets/${parent.id}/comments`,
    payload: { bodyMarkdown: "First comment" },
  });
  assert.equal(firstComment.statusCode, 201);

  const secondComment = await app.inject({
    method: "POST",
    url: `/api/tickets/${parent.id}/comments`,
    payload: { bodyMarkdown: "Second comment" },
  });
  assert.equal(secondComment.statusCode, 201);

  const ticketDetail = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}`,
  });
  assert.equal(ticketDetail.statusCode, 200);
  assert.equal(ticketDetail.json().ref, `Portal#${parent.id}`);
  assert.equal(ticketDetail.json().shortRef, `#${parent.id}`);

  const commentsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/comments`,
  });
  assert.equal(commentsResponse.statusCode, 200);
  assert.deepEqual(
    commentsResponse.json().comments.map((comment: { bodyMarkdown: string }) => comment.bodyMarkdown),
    ["First comment", "Second comment"],
  );

  const relationsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/relations`,
  });
  assert.equal(relationsResponse.statusCode, 200);
  const relations = relationsResponse.json();
  assert.equal(relations.parent, null);
  assert.equal(relations.children.length, 1);
  assert.equal(relations.children[0].id, child.id);
  assert.equal(relations.children[0].laneId, todoLane.id);
  assert.equal(relations.children[0].ref, `Portal#${child.id}`);
  assert.equal(relations.blockedBy.length, 1);
  assert.equal(relations.blockedBy[0].id, dependency.id);
  assert.equal(relations.blockedBy[0].laneId, inProgressLane.id);
  assert.equal(relations.blockers.length, 0);

  const reverseRelationsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}/relations`,
  });
  assert.equal(reverseRelationsResponse.statusCode, 200);
  assert.equal(reverseRelationsResponse.json().blockers.length, 1);
  assert.equal(reverseRelationsResponse.json().blockers[0].id, parent.id);

  const transitionResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: { laneName: "Done", isCompleted: true },
  });
  assert.equal(transitionResponse.statusCode, 200);
  assert.equal(transitionResponse.json().laneId, board.lanes[2].id);
  assert.equal(transitionResponse.json().isCompleted, true);
  assert.equal(transitionResponse.json().ref, `Portal#${parent.id}`);

  const missingComments = await app.inject({
    method: "GET",
    url: "/api/tickets/99999/comments",
  });
  assert.equal(missingComments.statusCode, 404);

  const missingRelations = await app.inject({
    method: "GET",
    url: "/api/tickets/99999/relations",
  });
  assert.equal(missingRelations.statusCode, 404);

  const invalidTransition = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: { laneName: "Nope" },
  });
  assert.equal(invalidTransition.statusCode, 400);

  await app.close();
});

test("reciprocal blockers are rejected", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Board" },
  });
  const board = createdBoardResponse.json();
  const todoLane = board.lanes[0];

  const first = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "One" },
  })).json();
  const second = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Two" },
  })).json();

  const setBlocker = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${first.id}`,
    payload: { blockerIds: [second.id] },
  });
  assert.equal(setBlocker.statusCode, 200);

  const reciprocal = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${second.id}`,
    payload: { blockerIds: [first.id] },
  });
  assert.equal(reciprocal.statusCode, 400);
  assert.match(reciprocal.body, /deadlock/);

  await app.close();
});

test("lane deletion rejects non-empty lane", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  const createdBoardResponse = await app.inject({
    method: "POST",
    url: "/api/boards",
    payload: { name: "Board" },
  });
  const board = createdBoardResponse.json();
  const todoLane = board.lanes[0];

  await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "Task" },
  });

  const deletionResponse = await app.inject({
    method: "DELETE",
    url: `/api/lanes/${todoLane.id}`,
  });
  assert.equal(deletionResponse.statusCode, 409);

  await app.close();
});
