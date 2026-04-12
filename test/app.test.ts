import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import packageJson from "../package.json" with { type: "json" };

function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "soloboard-test-")), "test.sqlite");
}

test("migration creates archive-aware ticket indexes", () => {
  const db = new KanbanDb(createDbFile());
  try {
    const indexes = db.sqlite.prepare("PRAGMA index_list(tickets)").all() as Array<{ name: string }>;
    const indexNames = new Set(indexes.map((index) => index.name));
    assert.ok(indexNames.has("tickets_active_board_lane_position_idx"));
    assert.ok(indexNames.has("tickets_active_board_resolved_lane_position_idx"));
    assert.ok(indexNames.has("tickets_archived_board_lane_position_idx"));
    assert.ok(indexNames.has("tickets_lane_archived_position_idx"));
  } finally {
    db.close();
  }
});

test("meta endpoint exposes app name and package version", async () => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/meta",
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      name: "SoloBoard",
      version: packageJson.version,
    });
  } finally {
    await app.close();
  }
});

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

  const bugTagResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tags`,
    payload: { name: "bug", color: "#ff0000" },
  });
  assert.equal(bugTagResponse.statusCode, 201);
  const bugTag = bugTagResponse.json();

  const docsTagResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tags`,
    payload: { name: "docs", color: "#00aa00" },
  });
  const docsTag = docsTagResponse.json();

  const firstTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets`,
    payload: {
      laneId: todoLane.id,
      title: "Fix parser",
      bodyMarkdown: "Needs **attention**",
      priority: 5,
      tagIds: [bugTag.id],
      isResolved: false,
    },
  });
  assert.equal(firstTicketResponse.statusCode, 201);
  const firstTicket = firstTicketResponse.json();
  assert.equal(firstTicket.isResolved, false);
  assert.equal(firstTicket.isCompleted, false);

  const secondTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets`,
    payload: {
      laneId: todoLane.id,
      parentTicketId: firstTicket.id,
      title: "Write docs",
      bodyMarkdown: "Link [guide](https://example.com)",
      priority: 2,
      tagIds: [docsTag.id],
      isResolved: true,
    },
  });
  const secondTicket = secondTicketResponse.json();
  assert.equal(secondTicket.isResolved, true);
  assert.equal(secondTicket.isCompleted, true);
  assert.equal(secondTicket.priority, 2);
  assert.equal(secondTicket.parentTicketId, firstTicket.id);
  assert.deepEqual(secondTicket.blockerIds, []);

  const boardShellResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}`,
  });
  assert.equal(boardShellResponse.statusCode, 200);
  assert.ok(!("tickets" in boardShellResponse.json()));

  const summaryResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets`,
  });
  assert.equal(summaryResponse.statusCode, 200);
  const summaryTicket = summaryResponse.json().tickets.find((ticket: { id: number }) => ticket.id === firstTicket.id);
  assert.ok(!("comments" in summaryTicket));
  assert.ok(!("bodyHtml" in summaryTicket));
  assert.equal(summaryTicket.ref, `Ops Board#${firstTicket.id}`);

  const filteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?tag=bug&completed=false&q=parser`,
  });
  assert.equal(filteredResponse.statusCode, 200);
  const filtered = filteredResponse.json();
  assert.equal(filtered.tickets.length, 1);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].ref, `Ops Board#${firstTicket.id}`);
  assert.equal(filtered.tickets[0].shortRef, `#${firstTicket.id}`);
  assert.ok(!("bodyHtml" in filtered.tickets[0]));

  const idFilteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=${firstTicket.id}`,
  });
  assert.equal(idFilteredResponse.statusCode, 200);
  assert.deepEqual(
    idFilteredResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [firstTicket.id],
  );

  const shortRefFilteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=%23${firstTicket.id}`,
  });
  assert.equal(shortRefFilteredResponse.statusCode, 200);
  assert.deepEqual(
    shortRefFilteredResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [firstTicket.id],
  );

  const priorityFilteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=p%3A5`,
  });
  assert.equal(priorityFilteredResponse.statusCode, 200);
  assert.deepEqual(
    priorityFilteredResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [firstTicket.id],
  );

  const priorityAliasFilteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=priority%3A2`,
  });
  assert.equal(priorityAliasFilteredResponse.statusCode, 200);
  assert.deepEqual(
    priorityAliasFilteredResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [secondTicket.id],
  );

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
  assert.equal(updateResponse.json().isResolved, false);
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
        { ticketId: secondTicket.id, laneId: doingLane.id, position: 0 },
        { ticketId: firstTicket.id, laneId: todoLane.id, position: 0 },
      ],
    },
  });
  assert.equal(reorderResponse.statusCode, 200);

  const reorderedActivityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${firstTicket.id}/activity`,
  });
  assert.equal(reorderedActivityResponse.statusCode, 200);
  assert.ok(
    reorderedActivityResponse.json().activity.some((entry: { action: string; message: string }) =>
      entry.action === "ticket_transitioned" && entry.message === "Moved to todo"),
  );

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
  assert.equal(imported.tags.length, 2);
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
  assert.equal(ticketDetail.json().children.length, 1);
  assert.equal(ticketDetail.json().children[0].id, child.id);
  assert.equal(ticketDetail.json().blockers.length, 1);
  assert.equal(ticketDetail.json().blockers[0].id, dependency.id);

  const dependencyDetail = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}`,
  });
  assert.equal(dependencyDetail.statusCode, 200);
  assert.equal(dependencyDetail.json().blockedBy.length, 1);
  assert.equal(dependencyDetail.json().blockedBy[0].id, parent.id);

  const commentsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/comments`,
  });
  assert.equal(commentsResponse.statusCode, 200);
  assert.deepEqual(
    commentsResponse.json().comments.map((comment: { bodyMarkdown: string }) => comment.bodyMarkdown),
    ["Second comment", "First comment"],
  );

  const firstCommentId = commentsResponse.json().comments[1].id;
  const updateCommentResponse = await app.inject({
    method: "PATCH",
    url: `/api/comments/${firstCommentId}`,
    payload: { bodyMarkdown: "First comment updated" },
  });
  assert.equal(updateCommentResponse.statusCode, 200);
  assert.equal(updateCommentResponse.json().bodyMarkdown, "First comment updated");

  const activityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/activity`,
  });
  assert.equal(activityResponse.statusCode, 200);
  const updatedCommentActivity = activityResponse.json().activity.find((entry: {
    action: string;
    details: { oldBodyMarkdown?: string; newBodyMarkdown?: string };
  }) => entry.action === "comment_updated");
  assert.ok(updatedCommentActivity);
  assert.equal(updatedCommentActivity.details.oldBodyMarkdown, "First comment");
  assert.equal(updatedCommentActivity.details.newBodyMarkdown, "First comment updated");

  const deleteCommentResponse = await app.inject({
    method: "DELETE",
    url: `/api/comments/${firstCommentId}`,
  });
  assert.equal(deleteCommentResponse.statusCode, 204);

  const commentsAfterDeleteResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/comments`,
  });
  assert.equal(commentsAfterDeleteResponse.statusCode, 200);
  assert.equal(commentsAfterDeleteResponse.json().comments.length, 1);

  const deleteActivityResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/activity`,
  });
  assert.equal(deleteActivityResponse.statusCode, 200);
  const deletedCommentActivity = deleteActivityResponse.json().activity.find((entry: {
    action: string;
    details: { deletedBodyMarkdown?: string };
  }) => entry.action === "comment_deleted");
  assert.ok(deletedCommentActivity);
  assert.equal(deletedCommentActivity.details.deletedBodyMarkdown, "First comment updated");

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
  assert.equal(relations.blockers.length, 1);
  assert.equal(relations.blockers[0].id, dependency.id);
  assert.equal(relations.blockers[0].laneId, inProgressLane.id);
  assert.equal(relations.blockedBy.length, 0);

  const reverseRelationsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}/relations`,
  });
  assert.equal(reverseRelationsResponse.statusCode, 200);
  assert.equal(reverseRelationsResponse.json().blockedBy.length, 1);
  assert.equal(reverseRelationsResponse.json().blockedBy[0].id, parent.id);

  const clearBlockersResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { blockerIds: null },
  });
  assert.equal(clearBlockersResponse.statusCode, 200);
  assert.deepEqual(clearBlockersResponse.json().blockerIds, []);

  const reverseRelationsAfterClearResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}/relations`,
  });
  assert.equal(reverseRelationsAfterClearResponse.statusCode, 200);
  assert.equal(reverseRelationsAfterClearResponse.json().blockedBy.length, 0);

  const dependencyDetailAfterClear = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}`,
  });
  assert.equal(dependencyDetailAfterClear.statusCode, 200);
  assert.equal(dependencyDetailAfterClear.json().blockedBy.length, 0);

  const clearParentResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${child.id}`,
    payload: { parentTicketId: null },
  });
  assert.equal(clearParentResponse.statusCode, 200);
  assert.equal(clearParentResponse.json().parentTicketId, null);

  const parentRelationsAfterClearResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/relations`,
  });
  assert.equal(parentRelationsAfterClearResponse.statusCode, 200);
  assert.equal(parentRelationsAfterClearResponse.json().children.length, 0);

  const parentDetailAfterClear = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}`,
  });
  assert.equal(parentDetailAfterClear.statusCode, 200);
  assert.equal(parentDetailAfterClear.json().children.length, 0);

  const transitionResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: { laneName: "Done", isResolved: true },
  });
  assert.equal(transitionResponse.statusCode, 200);
  assert.equal(transitionResponse.json().laneId, board.lanes[2].id);
  assert.equal(transitionResponse.json().isResolved, true);
  assert.equal(transitionResponse.json().ref, `Portal#${parent.id}`);

  const archiveResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { isArchived: true },
  });
  assert.equal(archiveResponse.statusCode, 200);
  assert.equal(archiveResponse.json().isArchived, true);

  const hiddenArchivedSummary = await app.inject({
    method: "GET",
    url: `/api/boards/${board.board.id}/tickets`,
  });
  assert.equal(hiddenArchivedSummary.statusCode, 200);
  assert.equal(
    hiddenArchivedSummary.json().tickets.some((ticket: { id: number }) => ticket.id === parent.id),
    false,
  );

  const includedArchivedSummary = await app.inject({
    method: "GET",
    url: `/api/boards/${board.board.id}/tickets?archived=all`,
  });
  assert.equal(includedArchivedSummary.statusCode, 200);
  assert.equal(
    includedArchivedSummary.json().tickets.some((ticket: { id: number; isArchived: boolean }) => ticket.id === parent.id && ticket.isArchived === true),
    true,
  );

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

  const missingActivity = await app.inject({
    method: "GET",
    url: "/api/tickets/99999/activity",
  });
  assert.equal(missingActivity.statusCode, 404);

  const invalidTransition = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: { laneName: "Nope" },
  });
  assert.equal(invalidTransition.statusCode, 400);

  const schemaRejectedTransition = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}/transition`,
    payload: {},
  });
  assert.equal(schemaRejectedTransition.statusCode, 400);

  const schemaRejectedTicketCreate = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: todoLane.id, title: "", unexpected: true },
  });
  assert.equal(schemaRejectedTicketCreate.statusCode, 400);

  await app.close();
});

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

test("tags can use no color", async () => {
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

  const tagResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tags`,
    payload: { name: "outline", color: "" },
  });
  assert.equal(tagResponse.statusCode, 201);
  assert.equal(tagResponse.json().color, "");

  await app.close();
});
