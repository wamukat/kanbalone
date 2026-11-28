import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import packageJson from "../package.json" with { type: "json" };
import { createDbFile, createMockGithubAdapter, createMockRemoteAdapter } from "./app-test-helpers.js";

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
  const [todoLane, doingLane, doneLane] = createdBoard.lanes;
  await app.inject({ method: "PATCH", url: `/api/lanes/${doneLane.id}`, payload: { isCompletionLane: true } });

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
      priority: 4,
      tagIds: [bugTag.id],
    },
  });
  assert.equal(firstTicketResponse.statusCode, 201);
  const firstTicket = firstTicketResponse.json();
  assert.equal(firstTicket.isResolved, false);
  assert.ok(!Object.hasOwn(firstTicket, "isCompleted"));

  const secondTicketResponse = await app.inject({
    method: "POST",
    url: `/api/boards/${boardId}/tickets`,
    payload: {
      laneId: doneLane.id,
      parentTicketId: firstTicket.id,
      title: "Write docs",
      bodyMarkdown: "Link [guide](https://example.com)",
      priority: 2,
      tagIds: [docsTag.id],
    },
  });
  const secondTicket = secondTicketResponse.json();
  assert.equal(secondTicket.isResolved, true);
  assert.ok(!Object.hasOwn(secondTicket, "isCompleted"));
  assert.equal(secondTicket.priority, 2);
  assert.equal(secondTicket.parentTicketId, firstTicket.id);
  assert.deepEqual(secondTicket.blockerIds, []);

  for (const priority of [0, 100, 3.5]) {
    const invalidPriorityCreateResponse = await app.inject({
      method: "POST",
      url: `/api/boards/${boardId}/tickets`,
      payload: {
        laneId: todoLane.id,
        title: `Invalid priority ${priority}`,
        priority,
      },
    });
    assert.equal(invalidPriorityCreateResponse.statusCode, 400);
  }

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
  assert.equal(summaryTicket.hasChildren, true);
  assert.equal(summaryTicket.ref, `Ops Board#${firstTicket.id}`);

  const filteredResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?tag=bug&resolved=false&q=parser`,
  });
  assert.equal(filteredResponse.statusCode, 200);
  const filtered = filteredResponse.json();
  assert.equal(filtered.tickets.length, 1);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].id, firstTicket.id);
  assert.equal(filtered.tickets[0].hasChildren, true);
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

  const prioritySearchResponse = await app.inject({
    method: "GET",
    url: `/api/boards/${boardId}/tickets?q=priority%3Ahigh`,
  });
  assert.equal(prioritySearchResponse.statusCode, 200);
  assert.deepEqual(
    prioritySearchResponse.json().tickets.map((ticket: { id: number }) => ticket.id),
    [],
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
    payload: { laneId: doingLane.id, priority: 4, blockerIds: [secondTicket.id] },
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(updateResponse.json().laneId, doingLane.id);
  assert.equal(updateResponse.json().isResolved, false);
  assert.equal(updateResponse.json().priority, 4);
  assert.equal(updateResponse.json().children.length, 1);
  assert.deepEqual(updateResponse.json().blockerIds, [secondTicket.id]);
  assert.equal(updateResponse.json().ref, `Ops Board#${firstTicket.id}`);
  assert.equal(updateResponse.json().shortRef, `#${firstTicket.id}`);

  for (const priority of [0, 100, 3.5]) {
    const invalidPriorityUpdateResponse = await app.inject({
      method: "PATCH",
      url: `/api/tickets/${firstTicket.id}`,
      payload: { priority },
    });
    assert.equal(invalidPriorityUpdateResponse.statusCode, 400);
  }

  for (const [ticketId, laneId] of [[secondTicket.id, doingLane.id], [firstTicket.id, todoLane.id]]) {
    const positionResponse = await app.inject({
      method: "PATCH", url: `/api/tickets/${ticketId}/position`, payload: { laneId, position: 0 },
    });
    assert.equal(positionResponse.statusCode, 200);
  }

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
  assert.equal(exported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").priority, 4);
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
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").priority, 4);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").children.length, 1);
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Write docs").parent?.title, "Fix parser");
  assert.equal(imported.tickets.find((ticket: { title: string }) => ticket.title === "Fix parser").blockerIds.length, 1);

  await app.close();
});

test("localized default lanes preserve completion semantics and explicit or legacy names", async () => {
  const app = buildApp({ dbFile: createDbFile(), staticDir: path.join(process.cwd(), "public") });
  try {
    for (const [defaultLaneLanguage, expected] of [
      ['ja', ['未着手', '進行中', '確認待ち', '完了']],
      ['en', ['Todo', 'Doing', 'Acceptance', 'Done']],
      [undefined, ['todo', 'doing', 'Acceptance', 'done']],
    ] as const) {
      const response = await app.inject({ method: 'POST', url: '/api/boards', payload: { name: 'Defaults', defaultLaneLanguage } });
      assert.equal(response.statusCode, 201);
      const created = response.json();
      assert.deepEqual(created.lanes.map((lane: { name: string }) => lane.name), expected);
      assert.deepEqual(created.lanes.map((lane: { isCompletionLane: boolean }) => lane.isCompletionLane), [false, false, false, true]);
      const stored = (await app.inject({ method: 'GET', url: `/api/boards/${created.board.id}` })).json();
      assert.deepEqual(stored.lanes, created.lanes);
    }
    const custom = await app.inject({ method: 'POST', url: '/api/boards', payload: { name: 'Custom', defaultLaneLanguage: 'ja', laneNames: ['Custom open', 'Custom done'] } });
    assert.equal(custom.statusCode, 201);
    assert.deepEqual(custom.json().lanes.map((lane: { name: string }) => lane.name), ['Custom open', 'Custom done']);
    assert.deepEqual(custom.json().lanes.map((lane: { isCompletionLane: boolean }) => lane.isCompletionLane), [false, false]);
    assert.equal((await app.inject({ method: 'POST', url: '/api/boards', payload: { name: 'Invalid', defaultLaneLanguage: 'fr' } })).statusCode, 400);
  } finally { await app.close(); }
});
