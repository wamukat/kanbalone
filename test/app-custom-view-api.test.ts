import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { buildApp } from "../src/app.js";
import type { CustomViewDefinition } from "../src/db-modules/custom-views.js";
import { encodePaginationToken } from "../src/db-modules/pagination-token.js";
import { KanbanDb } from "../src/db.js";
import { createDbFile } from "./app-test-helpers.js";

const base = "/api/custom-views";
const definition = (overrides: Partial<CustomViewDefinition> = {}): CustomViewDefinition => ({
  name: "AI review queue", scope: "all", boardIds: [], rules: [], completion: "open",
  showBody: true, showLatestComment: true, ...overrides,
});

function fixture(t: TestContext) {
  const file = createDbFile();
  const db = new KanbanDb(file);
  const app = buildApp({ dbFile: file });
  t.after(async () => {
    await app.close();
    db.close();
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });
  const board = (name: string) => db.createBoard({ name });
  const query = (view: CustomViewDefinition, options: { limit?: number; cursor?: string } = {}) =>
    app.inject({ method: "POST", url: `${base}/query`, payload: { definition: view, ...options } });
  const save = (view: CustomViewDefinition) => app.inject({ method: "POST", url: base, payload: view });
  return { db, app, board, query, save };
}

test("custom view query keys paging by board, lane, position and ID and counts all matching rows", async t => {
  const { db, board, query } = fixture(t);
  const a = board("Alpha");
  const b = board("Beta");
  const c = board("New board");
  const review = db.createTag({ boardId: a.board.id, name: "Review" });
  const urgent = db.createTag({ boardId: a.board.id, name: "Read the result" });
  const sameName = db.createTag({ boardId: b.board.id, name: "Review" });
  const ticket = (id: number, laneId: number, title: string, tagIds?: number[]) => db.createTicket({ boardId: id, laneId, title, tagIds });
  const both = ticket(a.board.id, a.lanes[0].id, "Both tags", [review.id, urgent.id]);
  const one = ticket(a.board.id, a.lanes[0].id, "One tag", [urgent.id]);
  const secondLane = ticket(a.board.id, a.lanes[1].id, "Next lane", [review.id]);
  const done = ticket(a.board.id, a.lanes[3].id, "Completed", [review.id]);
  const excluded = ticket(a.board.id, a.lanes[0].id, "Untagged");
  const archived = ticket(a.board.id, a.lanes[0].id, "Archived", [review.id]);
  db.updateTicket(archived.id, { isArchived: true });
  const beta = ticket(b.board.id, b.lanes[0].id, "Beta selection", [sameName.id]);
  const betaUntagged = ticket(b.board.id, b.lanes[1].id, "Beta untagged");
  ticket(c.board.id, c.lanes[0].id, "Unconfigured board");
  db.sqlite.prepare("UPDATE tickets SET position = 7 WHERE id IN (?, ?)").run(both.id, one.id);
  db.reorderBoards([b.board.id, c.board.id, a.board.id]);
  db.reorderLanes(a.board.id, [a.lanes[1].id, a.lanes[0].id, a.lanes[2].id, a.lanes[3].id]);
  const view = definition({
    rules: [{ boardId: a.board.id, mode: "tags", tagIds: [review.id, urgent.id] }, { boardId: b.board.id, mode: "all", tagIds: [] }],
    showBody: false, showLatestComment: false,
  });
  const first = await query(view, { limit: 2 });
  assert.equal(first.statusCode, 200, first.body);
  const page = first.json();
  assert.equal(page.total, 5);
  assert.deepEqual(page.boardCounts, [
    { boardId: b.board.id, boardName: "Beta", count: 2 },
    { boardId: c.board.id, boardName: "New board", count: 0 },
    { boardId: a.board.id, boardName: "Alpha", count: 3 },
  ]);
  assert.deepEqual(page.warnings, [{ boardId: c.board.id, kind: "unset" }]);
  assert.deepEqual(page.tickets.map((row: { id: number }) => row.id), [beta.id, betaUntagged.id]);
  assert.deepEqual(page.tickets[0].tags, [{ id: sameName.id, name: "Review", color: sameName.color }]);
  assert.equal(page.tickets[0].body, undefined);
  assert.equal(page.tickets[0].latestComment, undefined);
  const next = (await query(view, { limit: 1, cursor: page.nextCursor })).json();
  assert.deepEqual(next.tickets.map((row: { id: number }) => row.id), [secondLane.id]);
  const end = (await query(view, { limit: 2, cursor: next.nextCursor })).json();
  assert.deepEqual(end.tickets.map((row: { id: number }) => row.id), [both.id, one.id]);
  assert.deepEqual(end.boardCounts, page.boardCounts);
  assert.equal(end.total, page.total);
  assert.equal(end.nextCursor, null);
  assert.equal(end.revision, page.revision);
  assert.equal((await query(view, { cursor: `${page.nextCursor}x` })).statusCode, 400);
  assert.equal((await query({ ...view, completion: "done" }, { cursor: page.nextCursor })).statusCode, 400);
  assert.equal((await query(view, { limit: 101 })).statusCode, 400);
  const completed = (await query({ ...view, completion: "done" })).json();
  assert.equal(completed.total, 1);
  assert.equal(completed.tickets[0].id, done.id);
  assert.equal(completed.tickets[0].isResolved, true);
  const all = (await query({ ...view, completion: "all" })).json();
  assert.equal(all.total, 6);
  assert.ok(all.tickets.every((row: { id: number }) => ![excluded.id, archived.id].includes(row.id)));
});

test("saved views retain deleted references by ID, and all-off and unconfigured boards return zero", async t => {
  const { db, app, board, query, save } = fixture(t);
  const first = board("First");
  const second = board("Second");
  const tag = db.createTag({ boardId: first.board.id, name: "Needs review" });
  const firstTicket = db.createTicket({ boardId: first.board.id, laneId: first.lanes[0].id, title: "First", tagIds: [tag.id] });
  db.createTicket({ boardId: second.board.id, laneId: second.lanes[0].id, title: "Second" });
  const selected = definition({
    scope: "selected", boardIds: [first.board.id, second.board.id],
    rules: [{ boardId: first.board.id, mode: "tags", tagIds: [tag.id] }, { boardId: second.board.id, mode: "all", tagIds: [] }],
  });
  const saved = (await save(selected)).json();
  assert.equal(saved.version, 1);
  const forgedBoard = await save(definition({ rules: [{ boardId: second.board.id + 1, mode: "all", tagIds: [] }] }));
  const wrongBoard = await save(definition({ rules: [{ boardId: second.board.id, mode: "tags", tagIds: [tag.id] }] }));
  assert.equal(forgedBoard.statusCode, 400);
  assert.equal(forgedBoard.json().code, "invalid_reference");
  assert.equal(wrongBoard.statusCode, 400);
  const all = (await save({ ...selected, scope: "all", boardIds: [] })).json();

  db.deleteTag(tag.id);
  db.deleteBoard(second.board.id);
  const replacementTag = db.createTag({ boardId: first.board.id, name: tag.name });
  const replacementBoard = board(second.board.name);
  assert.notEqual(replacementTag.id, tag.id);
  assert.notEqual(replacementBoard.board.id, second.board.id);
  db.updateTicket(firstTicket.id, { tagIds: [replacementTag.id] });
  db.createTicket({ boardId: replacementBoard.board.id, laneId: replacementBoard.lanes[0].id, title: "Replacement" });
  const noMatch = (await query(selected)).json();
  assert.equal(noMatch.total, 0);
  assert.deepEqual(noMatch.boardCounts, [
    { boardId: first.board.id, boardName: "First", count: 0 },
    { boardId: second.board.id, boardName: null, count: 0 },
  ]);
  assert.deepEqual(noMatch.warnings, [
    { boardId: first.board.id, kind: "missing_tag", tagId: tag.id },
    { boardId: second.board.id, kind: "missing_board" },
  ]);
  const scopedAll = (await query(all)).json();
  assert.equal(scopedAll.total, 0);
  assert.deepEqual(scopedAll.warnings, [noMatch.warnings[0], { boardId: replacementBoard.board.id, kind: "unset" }, noMatch.warnings[1]]);
  assert.deepEqual(scopedAll.boardCounts.map((row: { boardId: number }) => row.boardId), [first.board.id, replacementBoard.board.id]);
  const persisted = await app.inject({ method: "PUT", url: `${base}/${saved.id}`, payload: { ...selected, name: "Renamed view", expectedVersion: 1 } });
  assert.equal(persisted.statusCode, 200, persisted.body);
  assert.deepEqual(persisted.json().rules, selected.rules.map(rule => ({ ...rule, laneMode: "all", laneIds: [] })));

  const off = { ...selected, boardIds: [first.board.id], rules: [{ boardId: first.board.id, mode: "tags" as const, tagIds: [] }] };
  const noTags = (await query(off)).json();
  assert.equal(noTags.total, 0);
  assert.deepEqual(noTags.warnings, []);
  const everything = (await query({ ...off, rules: [{ ...off.rules[0], mode: "all" }] })).json();
  assert.equal(everything.total, 1);
  const catalog = (await app.inject(`${base}/catalog`)).json();
  assert.deepEqual(catalog.boards[0].tags, [{ id: replacementTag.id, name: tag.name, color: tag.color }]);
});

test("custom view excerpts preserve Unicode and expose only the fixed original text on expansion", async t => {
  const { db, app, board, query } = fixture(t);
  const a = board("Excerpts");
  const markdown = "**本文**\n" + "🛠".repeat(400) + "\nEnd";
  const first = db.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, title: "Text", bodyMarkdown: markdown });
  const second = db.createTicket({ boardId: a.board.id, laneId: a.lanes[1].id, title: "No comment" });
  const timestamp = "2026-01-07T19:00:00.000Z";
  const insertComment = db.sqlite.prepare("INSERT INTO comments(ticket_id, body_markdown, created_at) VALUES (?, ?, ?)");
  const old = insertComment.run(first.id, "old", timestamp);
  const latest = insertComment.run(first.id, markdown, timestamp);
  insertComment.run(first.id, "higher ID but older post time", "2026-01-07T18:59:59.999Z");
  const view = definition({ rules: [{ boardId: a.board.id, mode: "all", tagIds: [] }] });
  const page = (await query(view)).json();
  assert.deepEqual(page.tickets.map((row: { id: number }) => row.id), [first.id, second.id]);
  const excerpt = { excerpt: Array.from(markdown).slice(0, 360).join(""), truncated: true };
  assert.deepEqual(page.tickets[0].body, excerpt);
  assert.deepEqual(page.tickets[0].latestComment, { id: Number(latest.lastInsertRowid), createdAt: timestamp, ...excerpt });
  assert.deepEqual(page.tickets[1].body, { excerpt: "", truncated: false });
  assert.equal(page.tickets[1].latestComment, null);

  const firstPage = (await query(view, { limit: 1 })).json();
  db.addComment({ ticketId: first.id, bodyMarkdown: "New post" });
  const stale = await query(view, { cursor: firstPage.nextCursor });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, "stale_cursor");
  const refreshed = (await query(view)).json();
  assert.equal(refreshed.tickets[0].latestComment.excerpt, "New post");
  assert.deepEqual(refreshed.tickets.map((row: { id: number }) => row.id), [first.id, second.id]);
  const textUrl = (ticketId: number) => `${base}/tickets/${ticketId}/text`;
  assert.deepEqual((await app.inject(`${textUrl(first.id)}?field=body`)).json(), { bodyMarkdown: markdown });
  assert.deepEqual((await app.inject(`${textUrl(first.id)}?field=comment&commentId=${latest.lastInsertRowid}`)).json(), { bodyMarkdown: markdown });
  assert.deepEqual((await app.inject(`${textUrl(first.id)}?field=comment&commentId=${old.lastInsertRowid}`)).json(), { bodyMarkdown: "old" });
  assert.equal((await app.inject(`${textUrl(second.id)}?field=comment&commentId=${latest.lastInsertRowid}`)).statusCode, 404);
  assert.equal((await app.inject(`${textUrl(first.id)}?field=comment`)).statusCode, 400);
  const commentOnly = (await query({ ...view, showBody: false })).json().tickets[0];
  assert.equal(commentOnly.body, undefined);
  assert.equal(commentOnly.latestComment.excerpt, "New post");
  const bodyOnly = (await query({ ...view, showLatestComment: false })).json().tickets[0];
  assert.deepEqual(bodyOnly.body, excerpt);
  assert.equal(bodyOnly.latestComment, undefined);
});

test("named views reject stale saves and deletes, persist through restart and backup, and leave tickets alone", async t => {
  const { db, app, board, save } = fixture(t);
  const a = board("Persisted");
  const ticket = db.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, title: "Ticket", bodyMarkdown: "Plain text" });
  const snapshot = db.exportBoard(a.board.id);
  const invalid = await save(definition({ name: "    " }));
  assert.equal(invalid.statusCode, 400);
  const view = definition({ name: "  Persisted view  ", rules: [{ boardId: a.board.id, mode: "all", tagIds: [] }] });
  const response = await save(view);
  assert.equal(response.statusCode, 201, response.body);
  const created = response.json();
  assert.equal(created.name, "Persisted view");
  assert.equal(created.version, 1);
  const url = `${base}/${created.id}`;
  assert.deepEqual((await app.inject(base)).json(), { views: [{ id: created.id, name: created.name, version: 1 }] });
  const saves = await Promise.all(["First writer", "Second writer"].map(name =>
    app.inject({ method: "PUT", url, payload: { ...view, name, expectedVersion: 1 } })));
  assert.deepEqual(saves.map(result => result.statusCode).sort(), [200, 409]);
  const updated = saves.find(result => result.statusCode === 200)!.json();
  assert.equal(updated.version, 2);
  assert.equal(saves.find(result => result.statusCode === 409)!.json().code, "version_conflict");
  assert.equal((await app.inject({ method: "DELETE", url: `${url}?expectedVersion=1` })).statusCode, 409);
  assert.equal((await app.inject({ method: "DELETE", url })).statusCode, 400);

  const backupFile = createDbFile();
  t.after(() => fs.rmSync(path.dirname(backupFile), { recursive: true, force: true }));
  await db.sqlite.backup(backupFile);
  const restored = buildApp({ dbFile: backupFile });
  try {
    assert.deepEqual((await restored.inject(url)).json(), updated);
    assert.deepEqual((await restored.inject(`/api/boards/${a.board.id}/export`)).json(), snapshot);
  } finally { await restored.close(); }
  const reopened = buildApp({ dbFile: db.sqlite.name });
  try {
    assert.deepEqual((await reopened.inject(url)).json(), updated);
    assert.equal((await reopened.inject({ method: "DELETE", url: `${url}?expectedVersion=2` })).statusCode, 204);
  } finally { await reopened.close(); }
  assert.equal((await app.inject(url)).statusCode, 404);
  assert.equal((await app.inject({ method: "PUT", url, payload: { ...view, expectedVersion: 2 } })).statusCode, 404);
  assert.equal((await app.inject({ method: "DELETE", url: `${url}?expectedVersion=2` })).statusCode, 404);
  assert.deepEqual(db.exportBoard(a.board.id), snapshot);
  assert.equal(db.getTicket(ticket.id)?.bodyMarkdown, "Plain text");
});

test("one custom view event stream receives view edits, board reorders and normal ticket/comment changes", async t => {
  const { app, db, board, query, save } = fixture(t);
  const a = board("First");
  const b = board("Second");
  const ticket = db.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, title: "Notify" });
  db.createTicket({ boardId: b.board.id, laneId: b.lanes[0].id, title: "Other board" });
  const view = definition({ rules: [{ boardId: a.board.id, mode: "all", tagIds: [] }, { boardId: b.board.id, mode: "all", tagIds: [] }] });
  const old = (await query(view, { limit: 1 })).json();
  const origin = await app.listen({ host: "127.0.0.1", port: 0 });
  const controller = new AbortController();
  const response = await fetch(`${origin}${base}/events`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  async function nextEvent() {
    for (;;) {
      const end = buffer.indexOf("\n\n");
      if (end >= 0) {
        const message = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (message.startsWith("data: ")) return JSON.parse(message.slice(6));
      } else {
        const { value, done } = await reader.read();
        assert.equal(done, false);
        buffer += value;
      }
    }
  }
  try {
    assert.equal((await save(view)).statusCode, 201);
    assert.deepEqual(await nextEvent(), { event: "views_updated" });
    const reordered = await app.inject({ method: "POST", url: "/api/boards/reorder", payload: { boardIds: [b.board.id, a.board.id] } });
    assert.equal(reordered.statusCode, 200);
    assert.deepEqual(await nextEvent(), { event: "board_updated" });
    assert.equal((await query(view, { cursor: old.nextCursor })).statusCode, 409);
    const comment = await app.inject({ method: "POST", url: `/api/tickets/${ticket.id}/comments`, payload: { bodyMarkdown: "Published to view" } });
    assert.equal(comment.statusCode, 201, comment.body);
    assert.deepEqual(await nextEvent(), { event: "board_updated", boardId: a.board.id });
    assert.equal((await app.inject({ method: "PATCH", url: `/api/tickets/${ticket.id}`, payload: { laneId: a.lanes[3].id } })).statusCode, 200);
    assert.deepEqual(await nextEvent(), { event: "board_updated", boardId: a.board.id });
    assert.equal((await query(view)).json().total, 1);
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
});

test("custom view lane selections combine with tags and completion and legacy saves keep new restrictions", async t => {
  const { db, app, board, query, save } = fixture(t);
  const a = board("Project A");
  const b = board("Project B");
  const tag = db.createTag({ boardId: a.board.id, name: "Review" });
  const make = (laneId: number, title: string, tagged: boolean) => db.createTicket({
    boardId: a.board.id, laneId, title, tagIds: tagged ? [tag.id] : [],
  });
  const inTodo = make(a.lanes[0].id, "First match", true);
  const inDoing = make(a.lanes[1].id, "Second match", true);
  make(a.lanes[1].id, "Wrong tag", false);
  const done = make(a.lanes[3].id, "Completed match", true);
  const archived = make(a.lanes[0].id, "Archived match", true);
  db.updateTicket(archived.id, { isArchived: true });
  const selected = definition({ sort: "priority_desc", rules: [{ boardId: a.board.id, mode: "tags", tagIds: [tag.id],
    laneMode: "selected", laneIds: a.lanes.map(lane => lane.id) }] });
  const createdResponse = await save(selected);
  assert.equal(createdResponse.statusCode, 201, createdResponse.body);
  const created = createdResponse.json();
  const url = `${base}/${created.id}`;
  const ids = (page: { tickets: Array<{ id: number }> }) => page.tickets.map(ticket => ticket.id);
  const open = (await query(selected)).json();
  assert.deepEqual(ids(open), [inTodo.id, inDoing.id]);
  assert.equal(open.total, 2);
  assert.deepEqual(ids((await query({ ...selected, completion: "done" })).json()), [done.id]);
  assert.equal((await query({ ...selected, rules: selected.rules.map(rule => ({ ...rule, laneIds: [] })) })).json().total, 0);

  const originalLane = a.lanes[2];
  db.deleteLane(originalLane.id);
  const replacement = db.createLane({ boardId: a.board.id, name: originalLane.name });
  make(replacement.id, "Replacement ID must not match", true);
  const current = (await query(selected)).json();
  assert.deepEqual(ids(current), [inTodo.id, inDoing.id]);
  assert.deepEqual(current.warnings, [{ boardId: a.board.id, laneId: originalLane.id, kind: "missing_lane" }, { boardId: b.board.id, kind: "unset" }]);
  const missingOnly = { ...selected, rules: selected.rules.map(rule => ({ ...rule, laneIds: [originalLane.id] })) };
  assert.equal((await query(missingOnly)).json().total, 0);
  assert.equal((await save(missingOnly)).json().code, "invalid_reference");
  const foreignLane = { ...selected, rules: selected.rules.map(rule => ({ ...rule, laneIds: [b.lanes[0].id] })) };
  assert.equal((await query(foreignLane)).json().total, 0);
  assert.equal((await save(foreignLane)).json().code, "invalid_reference");

  const legacy = definition({ rules: [{ boardId: a.board.id, mode: "tags", tagIds: [tag.id] }, { boardId: b.board.id, mode: "all", tagIds: [] }] });
  const malformed = await app.inject({ method: "PUT", url, payload: {
    ...legacy, rules: [ { ...legacy.rules[0], laneMode: "all" } ], expectedVersion: created.version,
  } });
  assert.equal(malformed.statusCode, 400);
  const compatible = await app.inject({ method: "PUT", url, payload: { ...legacy, expectedVersion: created.version } });
  assert.equal(compatible.statusCode, 200, compatible.body);
  const updated = compatible.json();
  assert.equal(updated.sort, "priority_desc");
  assert.deepEqual(updated.rules, [selected.rules[0], { ...legacy.rules[1], laneMode: "all", laneIds: [] }]);
  const unfiltered = await app.inject({ method: "PUT", url, payload: { ...legacy, sort: "position_asc",
    rules: [{ ...legacy.rules[0], laneMode: "all", laneIds: [] }], expectedVersion: updated.version } });
  assert.equal(unfiltered.statusCode, 200, unfiltered.body);
  assert.equal((await query(unfiltered.json())).json().total, 3);
  assert.equal(unfiltered.json().sort, "position_asc");

  db.updateLane(replacement.id, "Renamed lane");
  db.reorderLanes(a.board.id, [replacement.id, a.lanes[3].id, a.lanes[0].id, a.lanes[1].id]);
  const catalog = (await app.inject(`${base}/catalog`)).json();
  assert.deepEqual(catalog.boards[0].lanes, [{ id: replacement.id, name: "Renamed lane" }, ...[a.lanes[3], a.lanes[0], a.lanes[1]].map(({ id, name }) => ({ id, name }))]);
});

test("priority and activity sorting use board-first keysets and stable ties across pages", async t => {
  const { db, board, query } = fixture(t);
  const a = board("First project");
  const b = board("Second project");
  db.now = () => "2026-01-01T00:00:00.000Z";
  const one = db.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, title: "A low", priority: 1 });
  const two = db.createTicket({ boardId: a.board.id, laneId: a.lanes[1].id, title: "A high", priority: 4 });
  const three = db.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, title: "A high tie", priority: 4 });
  const four = db.createTicket({ boardId: b.board.id, laneId: b.lanes[0].id, title: "B high", priority: 4 });
  const five = db.createTicket({ boardId: b.board.id, laneId: b.lanes[1].id, title: "B newer low", priority: 1 });
  db.now = () => "2026-01-02T00:00:00.000Z";
  db.addComment({ ticketId: five.id, bodyMarkdown: "Very recent, later board" });
  db.addComment({ ticketId: two.id, bodyMarkdown: "Newest on first board" });
  db.sqlite.prepare("UPDATE tickets SET position = 2 WHERE id IN (?, ?)").run(one.id, three.id);
  const baseView = definition({ rules: [a, b].map(({ board }) => ({ boardId: board.id, mode: "all", tagIds: [] })) });
  for (const [sort, expected] of [
    ["position_asc", [one.id, three.id, two.id, four.id, five.id]],
    ["priority_desc", [three.id, two.id, one.id, four.id, five.id]],
    ["content_activity_desc", [two.id, one.id, three.id, five.id, four.id]],
  ] as const) {
    const view = { ...baseView, sort };
    const ids: number[] = [];
    let cursor: string | null = null;
    do {
      const response = await query(view, { limit: 1, ...(cursor ? { cursor } : {}) });
      assert.equal(response.statusCode, 200, response.body);
      const page = response.json();
      assert.equal(page.total, 5);
      assert.deepEqual(page.boardCounts.map((count: { count: number }) => count.count), [3, 2]);
      ids.push(page.tickets[0].id);
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(ids, expected);
  }
  const first = (await query({ ...baseView, sort: "priority_desc" }, { limit: 2 })).json();
  assert.equal((await query(baseView, { cursor: first.nextCursor })).statusCode, 400);
  assert.equal((await query({ ...baseView, sort: "priority_desc", rules: baseView.rules.map(rule => ({ ...rule, laneMode: "selected", laneIds: [a.lanes[0].id] })) }, { cursor: first.nextCursor })).statusCode, 400);
  const secret = db.sqlite.prepare("SELECT secret FROM ticket_cursor_secret WHERE id = 1").pluck().get() as string;
  const oldCursor = encodePaginationToken(secret, { v: 1, keys: [0, a.board.id, 0, a.lanes[0].id, 0, one.id], query: "legacy-fingerprint", revision: first.revision });
  const stale = await query(baseView, { cursor: oldCursor });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().code, "stale_cursor");
});

const timeAt = (day: number) => new Date(Date.UTC(2026, 0, day)).toISOString();

test("sort activity advances for actual body or comment changes and survives deletes and rolled-back writes", async t => {
  const { db, board, query } = fixture(t);
  const a = board("Review");
  const setTime = (day: number) => { db.now = () => timeAt(day); };
  setTime(1);
  const first = db.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, title: "First", bodyMarkdown: "Original" });
  setTime(2);
  const second = db.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, title: "Second" });
  const view = definition({ sort: "content_activity_desc", rules: [{ boardId: a.board.id, mode: "all", tagIds: [] }] });
  const order = async () => (await query(view)).json().tickets.map((ticket: { id: number }) => ticket.id);
  const knownTime = (ticketId: number) => db.sqlite.prepare("SELECT activity_at_ms FROM ticket_content_activity WHERE ticket_id = ?").pluck().get(ticketId);
  assert.deepEqual(await order(), [second.id, first.id]);
  setTime(3);
  const tag = db.createTag({ boardId: a.board.id, name: "Priority" });
  db.updateTicket(first.id, { title: "Renamed", priority: 4, tagIds: [tag.id], laneId: a.lanes[1].id, bodyMarkdown: "Original" });
  assert.deepEqual(await order(), [second.id, first.id]);
  assert.equal(knownTime(first.id), Date.parse(timeAt(1)));
  setTime(4);
  db.updateTicket(first.id, { bodyMarkdown: "" });
  assert.deepEqual(await order(), [first.id, second.id]);
  setTime(5);
  db.updateTicket(second.id, { appendMarkdown: "Added" });
  assert.deepEqual(await order(), [second.id, first.id]);
  setTime(6);
  const earlier = db.addComment({ ticketId: first.id, bodyMarkdown: "Earlier comment" });
  setTime(7);
  const latest = db.addComment({ ticketId: second.id, bodyMarkdown: "Latest post" });
  assert.deepEqual(await order(), [second.id, first.id]);
  setTime(8);
  db.updateComment({ commentId: earlier.id, bodyMarkdown: earlier.bodyMarkdown });
  assert.equal(knownTime(first.id), Date.parse(timeAt(6)));
  setTime(9);
  const previousPage = (await query(view, { limit: 1 })).json();
  db.updateComment({ commentId: earlier.id, bodyMarkdown: "Edited older post" });
  assert.equal((await query(view, { cursor: previousPage.nextCursor })).statusCode, 409);
  assert.deepEqual(await order(), [first.id, second.id]);
  setTime(10);
  db.deleteComment(latest.id);
  db.deleteComment(earlier.id);
  assert.equal(knownTime(first.id), Date.parse(timeAt(9)));
  assert.equal(knownTime(second.id), Date.parse(timeAt(7)));
  assert.deepEqual(await order(), [first.id, second.id]);

  setTime(1);
  db.updateTicket(first.id, { bodyMarkdown: "Clock moved backwards" });
  assert.equal(knownTime(first.id), Date.parse(timeAt(9)));
  db.sqlite.exec("CREATE TRIGGER reject_activity BEFORE INSERT ON activity_logs BEGIN SELECT raise(ABORT, 'record failed'); END");
  setTime(11);
  assert.throws(() => db.addComment({ ticketId: second.id, bodyMarkdown: "Rolled back" }), /record failed/);
  assert.deepEqual(db.listComments(second.id), []);
  assert.equal(knownTime(second.id), Date.parse(timeAt(7)));
});

test("content activity backfills from known legacy events and keeps new updates and old views through backup", async t => {
  const file = createDbFile();
  const backup = createDbFile();
  t.after(() => {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
    fs.rmSync(path.dirname(backup), { recursive: true, force: true });
  });
  const old = new KanbanDb(file);
  const a = old.createBoard({ name: "Existing" });
  const create = (date: number, title: string) => {
    old.now = () => timeAt(date);
    return old.createTicket({ boardId: a.board.id, laneId: a.lanes[0].id, bodyMarkdown: "Body", title });
  };
  const bodyOnly = create(1, "Prior body edit is not tracked");
  const updatedComment = create(2, "Prior comment edit");
  const noopComment = create(3, "Prior unchanged comment");
  old.now = () => timeAt(4);
  const edited = old.addComment({ ticketId: updatedComment.id, bodyMarkdown: "First" });
  const noop = old.addComment({ ticketId: noopComment.id, bodyMarkdown: "Same" });
  old.now = () => timeAt(5);
  old.updateComment({ commentId: edited.id, bodyMarkdown: "Changed" });
  old.now = () => timeAt(6);
  old.deleteComment(edited.id);
  old.updateComment({ commentId: noop.id, bodyMarkdown: noop.bodyMarkdown });
  old.now = () => timeAt(7);
  old.updateTicket(bodyOnly.id, { bodyMarkdown: "Unknown past edit" });
  const view = definition({ rules: [{ boardId: a.board.id, mode: "all", tagIds: [] }] });
  old.sqlite.prepare("INSERT INTO custom_views(version, definition) VALUES (7, ?)").run(JSON.stringify(view));
  old.sqlite.exec("DROP TABLE ticket_content_activity");
  old.close();

  const migrated = new KanbanDb(file);
  const knownTime = (id: number) => migrated.sqlite.prepare("SELECT activity_at_ms FROM ticket_content_activity WHERE ticket_id = ?").pluck().get(id);
  try {
    assert.equal(knownTime(bodyOnly.id), Date.parse(timeAt(1)));
    assert.equal(knownTime(updatedComment.id), Date.parse(timeAt(5)));
    assert.equal(knownTime(noopComment.id), Date.parse(timeAt(4)));
    migrated.now = () => timeAt(8);
    migrated.updateTicket(bodyOnly.id, { bodyMarkdown: "Known new edit" });
    await migrated.sqlite.backup(backup);
  } finally { migrated.close(); }

  const restored = buildApp({ dbFile: backup });
  try {
    const saved = (await restored.inject(`${base}/1`)).json();
    assert.equal(saved.version, 7);
    assert.equal(saved.sort, "position_asc");
    assert.deepEqual(saved.rules, [{ ...view.rules[0], laneMode: "all", laneIds: [] }]);
    const query = await restored.inject({ method: "POST", url: `${base}/query`, payload: { definition: { ...view, sort: "content_activity_desc" } } });
    assert.equal(query.statusCode, 200, query.body);
    assert.deepEqual(query.json().tickets.map((ticket: { id: number }) => ticket.id), [bodyOnly.id, updatedComment.id, noopComment.id]);
  } finally { await restored.close(); }
});
