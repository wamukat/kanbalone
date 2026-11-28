import assert from "node:assert/strict";
import test from "node:test";
import type { HTTPMethods } from "fastify";

import { buildApp } from "../src/app.js";
import type { ActivityLogView, TagView, TicketView } from "../src/types.js";

function requestFor(app: ReturnType<typeof buildApp>) {
  return async (method: HTTPMethods, url: string, status: number, payload?: object) => {
    const response = await app.inject({ method, url, payload });
    assert.equal(response.statusCode, status, `${method} ${url}: ${response.body}`);
    return response.json();
  };
}

const tagIds = (ticket: TicketView) => ticket.tags.map((tag) => tag.id).sort((a, b) => a - b);

test("ticket writes resolve draft names with the existing selection in a single write", async (t) => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = requestFor(app);
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Draft tags", laneNames: ["Todo"] });
  const other = await request("POST", "/api/boards", 201, { name: "Other board", laneNames: ["Todo"] });
  const collection = `/api/boards/${board.id}/tickets`;
  const boardTags = `/api/boards/${board.id}/tags`;
  const original: TagView = await request("POST", boardTags, 201, { name: "Ä-Review", color: "#1f6f5f" });
  const caseVariant: TagView = await request("POST", boardTags, 201, { name: "ä-review" });
  const foreign: TagView = await request("POST", `/api/boards/${other.board.id}/tags`, 201, { name: "手順確認" });
  const body = {
    title: "Saved with tags", laneId: lanes[0].id, tagIds: [original.id],
    newTagNames: ["  ä-review ", "手順確認", " 手順確認 "],
  };
  await request("POST", `${collection}/preview`, 200, body);
  assert.equal((await request("GET", boardTags, 200)).tags.length, 2);
  const ticket: TicketView = await request("POST", collection, 201, { ...body, updater: "Creator" });
  const created = ticket.tags.find((tag) => tag.name === "手順確認");
  assert.ok(created);
  assert.equal(created.boardId, board.id);
  assert.equal(created.color, "");
  assert.notEqual(created.id, foreign.id);
  assert.deepEqual(tagIds(ticket), [original.id, caseVariant.id, created.id]);
  const ticketUrl = `/api/tickets/${ticket.id}`;
  const activity = async (): Promise<ActivityLogView[]> => (await request("GET", `${ticketUrl}/activity`, 200)).activity;
  assert.deepEqual([(await activity())[0].action, (await activity())[0].updater], ["ticket_created", "Creator"]);

  const unchanged: TicketView = await request("PATCH", ticketUrl, 200, { newTagNames: [] });
  assert.deepEqual(tagIds(unchanged), tagIds(ticket));
  const another: TicketView = await request("POST", collection, 201, { title: "Another ticket", laneId: lanes[0].id });
  const preview = await request("POST", `${ticketUrl}/change-preview`, 200, { newTagNames: ["Concurrent tag"] });
  assert.equal((await request("GET", boardTags, 200)).tags.length, 3);
  const [first, second]: TicketView[] = await Promise.all([
    request("PATCH", ticketUrl, 200, {
      newTagNames: ["Concurrent tag"], expectedToken: preview.expectedToken, updater: "Editor",
    }),
    request("PATCH", `/api/tickets/${another.id}`, 200, { newTagNames: ["concurrent TAG", "Ä-REVIEW"] }),
  ]);
  const oneSharedTag = first.tags.find((tag) => tag.name.toLowerCase() === "concurrent tag");
  assert.ok(oneSharedTag);
  assert.deepEqual(tagIds(first), [...tagIds(ticket), oneSharedTag.id]);
  assert.deepEqual(tagIds(second), [original.id, oneSharedTag.id]);
  assert.equal((await request("GET", boardTags, 200)).tags.length, 4);
  assert.deepEqual([(await activity())[0].action, (await activity())[0].updater], ["ticket_updated", "Editor"]);
  const replaced: TicketView = await request("PATCH", ticketUrl, 200, { tagIds: [], newTagNames: [" ä-review "] });
  assert.deepEqual(tagIds(replaced), [caseVariant.id]);
  assert.equal((await request("GET", boardTags, 200)).tags.length, 4);
});

test("invalid draft names and failed ticket mutations leave board and ticket data unchanged", async (t) => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = requestFor(app);
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Rollback tags", laneNames: ["Todo"] });
  const collection = `/api/boards/${board.id}/tickets`;
  const boardTags = `/api/boards/${board.id}/tags`;
  const parent: TicketView = await request("POST", collection, 201, { title: "Parent", laneId: lanes[0].id });
  const existing: TagView = await request("POST", boardTags, 201, { name: "Existing" });
  const ticket: TicketView = await request("POST", collection, 201, {
    title: "Child candidate", laneId: lanes[0].id, tagIds: [existing.id],
  });
  const ticketUrl = `/api/tickets/${ticket.id}`;
  const activityUrl = `${ticketUrl}/activity`;
  const beforeActivity = await request("GET", activityUrl, 200);

  for (const invalid of ["string", null, [2], [true], [null], [""], ["　 "]]) {
    assert.match((await request("PATCH", ticketUrl, 400, { newTagNames: invalid })).error, /newTagNames/);
  }
  await request("PATCH", ticketUrl, 409, { newTagNames: ["Stale draft"], expectedEditToken: "stale" });
  // Invalid blockers are validated after ticket, tag and hierarchy writes.
  const lateFailure = { newTagNames: ["Rollback draft"], parentTicketId: parent.id, blockerIds: [999999] };
  assert.match((await request("PATCH", ticketUrl, 400, { ...lateFailure, tagIds: [], title: "Rolled-back title" })).error, /blocker/i);
  assert.match((await request("POST", collection, 400, {
    ...lateFailure, title: "Rolled-back creation", laneId: lanes[0].id,
  })).error, /blocker/i);
  assert.deepEqual((await request("GET", boardTags, 200)).tags, [existing]);
  assert.deepEqual(await request("GET", ticketUrl, 200), ticket);
  assert.deepEqual(await request("GET", activityUrl, 200), beforeActivity);
  const tickets: TicketView[] = (await request("GET", collection, 200)).tickets;
  assert.deepEqual(tickets.map((record) => record.id).sort((a, b) => a - b), [parent.id, ticket.id]);
  assert.deepEqual((await request("GET", `/api/tickets/${parent.id}`, 200)).children, []);
});
