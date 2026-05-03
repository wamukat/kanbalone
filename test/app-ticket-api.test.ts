import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

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

  const related = (await app.inject({
    method: "POST",
    url: `/api/boards/${board.board.id}/tickets`,
    payload: { laneId: inProgressLane.id, title: "Related" },
  })).json();

  const updatedParent = (await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { blockerIds: [dependency.id], relatedIds: [related.id] },
  })).json();
  assert.equal(updatedParent.blockers[0].ref, `Portal#${dependency.id}`);
  assert.deepEqual(updatedParent.relatedIds, [related.id]);
  assert.equal(updatedParent.related[0].ref, `Portal#${related.id}`);

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
  assert.equal(ticketDetail.json().related.length, 1);
  assert.equal(ticketDetail.json().related[0].id, related.id);

  const dependencyDetail = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}`,
  });
  assert.equal(dependencyDetail.statusCode, 200);
  assert.equal(dependencyDetail.json().blockedBy.length, 1);
  assert.equal(dependencyDetail.json().blockedBy[0].id, parent.id);

  const relatedDetail = await app.inject({
    method: "GET",
    url: `/api/tickets/${related.id}`,
  });
  assert.equal(relatedDetail.statusCode, 200);
  assert.deepEqual(relatedDetail.json().relatedIds, [parent.id]);
  assert.equal(relatedDetail.json().related[0].id, parent.id);

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
  assert.equal(relations.related.length, 1);
  assert.equal(relations.related[0].id, related.id);

  const reverseRelationsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${related.id}/relations`,
  });
  assert.equal(reverseRelationsResponse.statusCode, 200);
  assert.equal(reverseRelationsResponse.json().related.length, 1);
  assert.equal(reverseRelationsResponse.json().related[0].id, parent.id);

  const clearRelatedResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${related.id}`,
    payload: { relatedIds: null },
  });
  assert.equal(clearRelatedResponse.statusCode, 200);
  assert.deepEqual(clearRelatedResponse.json().relatedIds, []);

  const parentRelationsAfterRelatedClearResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${parent.id}/relations`,
  });
  assert.equal(parentRelationsAfterRelatedClearResponse.statusCode, 200);
  assert.equal(parentRelationsAfterRelatedClearResponse.json().related.length, 0);

  const restoreRelatedResponse = await app.inject({
    method: "PATCH",
    url: `/api/tickets/${parent.id}`,
    payload: { relatedIds: [related.id] },
  });
  assert.equal(restoreRelatedResponse.statusCode, 200);
  assert.deepEqual(restoreRelatedResponse.json().relatedIds, [related.id]);

  const blockedByRelationsResponse = await app.inject({
    method: "GET",
    url: `/api/tickets/${dependency.id}/relations`,
  });
  assert.equal(blockedByRelationsResponse.statusCode, 200);
  assert.equal(blockedByRelationsResponse.json().blockedBy.length, 1);
  assert.equal(blockedByRelationsResponse.json().blockedBy[0].id, parent.id);

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

