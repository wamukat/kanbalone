import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test, { type TestContext } from "node:test";
import Database from "better-sqlite3";
import type { HTTPMethods } from "fastify";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { ActivityLogView, BoardExport, TicketTask } from "../src/types.js";
import { createDbFile } from "./app-test-helpers.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAA1BMVEUA//8ZXC8lAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC", "base64");

function api(app: ReturnType<typeof buildApp>) {
  return async (method: HTTPMethods, url: string, status: number, payload?: object) => {
    const response = await app.inject({ method, url, payload });
    assert.equal(response.statusCode, status, `${method} ${url}: ${response.body}`);
    return response.body ? response.json() : null;
  };
}

async function fixture(t: TestContext, dbFile = ":memory:") {
  const app = buildApp({ dbFile });
  t.after(() => app.close());
  const request = api(app);
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Task fixtures" });
  const boardUrl = `/api/boards/${board.id}`;
  const ticket = await request("POST", `${boardUrl}/tickets`, 201, { laneId: lanes[0].id, title: "With tasks", bodyMarkdown: "Ticket body" });
  const ticketUrl = `/api/tickets/${ticket.id}`;
  const taskUrl = `${ticketUrl}/tasks`;
  const taskHistory = async (): Promise<ActivityLogView[]> => (await request("GET", `${ticketUrl}/activity`, 200))
    .activity.filter((entry: ActivityLogView) => entry.action.startsWith("task_"));
  return { app, request, board, lanes, boardUrl, ticket, ticketUrl, taskUrl, taskHistory };
}

function fileFixture(t: TestContext) {
  const file = createDbFile();
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  return file;
}

test("Task CRUD, literal filtering, optimistic revisions, summaries and activity preserve the ticket body and completion", async t => {
  const { app, request, boardUrl, ticket, ticketUrl, taskUrl, taskHistory, lanes } = await fixture(t);
  assert.deepEqual(await request("GET", taskUrl, 200), { taskCount: 0, doneTaskCount: 0, tasks: [] });
  assert.equal((await request("GET", "/api/tickets/999999/tasks", 404)).code, "TICKET_NOT_FOUND");
  assert.equal((await request("GET", `${taskUrl}/1`, 404)).code, "TASK_NOT_FOUND");
  for (const payload of [{ bodyMarkdown: "　 " }, { bodyMarkdown: 3 }, { bodyMarkdown: "\ud800" }, { bodyMarkdown: "Valid", done: "false" },
    { bodyMarkdown: "Valid", number: 4 }, { bodyMarkdown: "Valid", updater: null }]) {
    await request("POST", taskUrl, 400, payload);
  }
  for (const query of ["?done=yes", "?done=true&done=false", "?q=A&q=B", "?unrecognized=1"]) {
    await request("GET", taskUrl + query, 400);
  }
  const text = "  **VERIFY** Ä %_\r\n";
  const first: TicketTask = await request("POST", taskUrl, 201, { bodyMarkdown: text, updater: " First reviewer " });
  assert.deepEqual([first.number, first.bodyMarkdown, first.done, first.revision], [1, text, false, 1]);
  assert.match(first.bodyHtml, /<strong>VERIFY<\/strong>/);
  const second: TicketTask = await request("POST", taskUrl, 201, { bodyMarkdown: "verify again 🛠", done: true });
  assert.equal(second.number, 2);
  const matching = async (q: string, done = "") => (await request("GET", `${taskUrl}?q=${encodeURIComponent(q)}${done}`, 200))
    .tasks.map((task: TicketTask) => task.number);
  assert.deepEqual(await matching("verify"), [1, 2]);
  assert.deepEqual(await matching("VerIfY", "&done=false"), [1]);
  assert.deepEqual(await matching("verify", "&done=true"), [2]);
  assert.deepEqual(await matching("Ä %_"), [1]);
  assert.deepEqual(await matching("ä"), []);
  assert.deepEqual(await matching("%x"), []);
  assert.deepEqual(await matching("  **v"), [1]);
  assert.deepEqual((await request("GET", `${taskUrl}?q=missing`, 200)), { taskCount: 2, doneTaskCount: 1, tasks: [] });
  const item = `${taskUrl}/1`;
  assert.deepEqual(await request("GET", item, 200), first);
  assert.equal((await request("PATCH", item, 428, { done: true })).code, "PRECONDITION_REQUIRED");
  await request("PATCH", item, 400, { expectedRevision: 1, bodyMarkdown: "\ud800" });
  assert.equal((await request("DELETE", item, 428)).code, "PRECONDITION_REQUIRED");
  for (const expectedRevision of ["1", null, true, 0, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
    await request("PATCH", item, 400, { expectedRevision, done: true });
    await request("DELETE", item, 400, { expectedRevision });
  }
  const updated: TicketTask = await request("PATCH", item, 200, { expectedRevision: 1, bodyMarkdown: "Reviewed", done: true, updater: "Review lead" });
  assert.deepEqual([updated.number, updated.revision, updated.done], [1, 2, true]);
  assert.equal((await request("DELETE", item, 409, { expectedRevision: 1 })).code, "STALE_TASK");
  assert.equal((await request("PATCH", item, 409, { expectedRevision: 1, done: true })).code, "STALE_TASK");
  const beforeNoop = await taskHistory();
  const page = await app.inject(`${boardUrl}/tickets?limit=1&order=id_asc`);
  assert.equal(page.statusCode, 200, page.body);
  assert.deepEqual(await request("PATCH", item, 200, { expectedRevision: 2, done: true }), updated);
  assert.deepEqual(await taskHistory(), beforeNoop);
  assert.equal((await app.inject(`${boardUrl}/tickets?limit=1&order=id_asc`)).headers["x-kanbalone-ticket-revision"],
    page.headers["x-kanbalone-ticket-revision"]);
  assert.equal((await request("GET", ticketUrl, 200)).updatedAt, ticket.updatedAt);
  const detail = await request("GET", ticketUrl, 200);
  assert.deepEqual([detail.taskCount, detail.doneTaskCount, detail.isResolved, detail.bodyMarkdown], [2, 2, false, "Ticket body"]);
  for (const suffix of ["/tickets", "/tickets?limit=1&order=id_asc"]) {
    const [summary] = (await request("GET", boardUrl + suffix, 200)).tickets;
    assert.deepEqual([summary.taskCount, summary.doneTaskCount, summary.tasks], [2, 2, undefined]);
  }
  await request("DELETE", item, 204, { expectedRevision: 2, updater: "Deletion reviewer" });
  await request("GET", item, 404);
  const [deleted, update, createdSecond, createdFirst] = await taskHistory();
  assert.deepEqual([deleted.action, deleted.updater, deleted.details], ["task_deleted", "Deletion reviewer", {
    taskNumber: 1, bodyExcerpt: "Reviewed", done: true, deletedBodyMarkdown: "Reviewed",
  }]);
  assert.deepEqual([update.action, update.updater, update.details], ["task_updated", "Review lead", {
    taskNumber: 1, bodyExcerpt: "Reviewed", done: true, bodyChanged: true, previousDone: false,
    oldBodyMarkdown: text, newBodyMarkdown: "Reviewed",
  }]);
  assert.deepEqual([createdSecond.updater, createdFirst.updater], ["API", " First reviewer "]);

  await request("PATCH", `${taskUrl}/2`, 200, { expectedRevision: 1, done: false });
  const finished = await request("PATCH", ticketUrl, 200, { laneId: lanes.find((lane: { isCompletionLane: boolean }) => lane.isCompletionLane).id });
  assert.deepEqual([finished.isResolved, finished.doneTaskCount], [true, 0]);
  await request("PATCH", ticketUrl, 200, { isArchived: true });
  assert.equal((await request("GET", taskUrl, 200)).tasks.length, 1);
});

test("Task mutations serialize allocation and allow only one edit of the same revision", async t => {
  const { app, request, taskUrl, taskHistory } = await fixture(t);
  const created: TicketTask[] = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    request("POST", taskUrl, 201, { bodyMarkdown: `Concurrent ${index}`, updater: `Actor ${index}` })));
  assert.deepEqual(created.map(task => task.number).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  const allocationActors = new Map((await taskHistory()).map(entry => [entry.details.taskNumber, entry.updater]));
  for (const [index, task] of created.entries()) assert.equal(allocationActors.get(task.number), `Actor ${index}`);
  const item = `${taskUrl}/1`;
  const edited = await Promise.all(["Alpha", "Beta"].map(updater =>
    app.inject({ method: "PATCH", url: item, payload: { expectedRevision: 1, bodyMarkdown: updater, updater } })));
  assert.deepEqual(edited.map(response => response.statusCode).sort(), [200, 409]);
  const current: TicketTask = await request("GET", item, 200);
  const [activity] = await taskHistory();
  assert.deepEqual([current.revision, activity.action, activity.updater], [2, "task_updated", current.bodyMarkdown]);
});

test("Task history preserves changes and deletion beyond its display excerpt", async t => {
  const { request, taskUrl, taskHistory } = await fixture(t);
  const prefix = "長".repeat(160);
  const before = prefix + " previous end";
  const after = prefix + " new end";
  await request("POST", taskUrl, 201, { bodyMarkdown: before });
  await request("PATCH", taskUrl + "/1", 200, { expectedRevision: 1, bodyMarkdown: after });
  await request("PATCH", taskUrl + "/1", 200, { expectedRevision: 2, done: true });
  await request("DELETE", taskUrl + "/1", 204, { expectedRevision: 3, updater: "Actor at deletion" });
  const [deleted, completed, changed, created] = await taskHistory();
  assert.equal(changed.details.bodyExcerpt, created.details.bodyExcerpt);
  assert.equal(changed.details.oldBodyMarkdown, before);
  assert.equal(changed.details.newBodyMarkdown, after);
  assert.equal(completed.details.bodyChanged, false);
  assert.equal(Object.hasOwn(completed.details, "newBodyMarkdown"), false);
  assert.equal(deleted.details.deletedBodyMarkdown, after);
  assert.equal(deleted.updater, "Actor at deletion");
});

test("Task mutations invalidate ticket cursors and emit SSE only when a write commits", { timeout: 10000 }, async t => {
  const { app, request, boardUrl, lanes, taskUrl } = await fixture(t);
  await request("POST", `${boardUrl}/tickets`, 201, { laneId: lanes[0].id, title: "Second" });
  const pageUrl = `${boardUrl}/tickets?limit=1&order=id_asc`;
  const { page } = await request("GET", pageUrl, 200);
  const origin = await app.listen({ port: 0, host: "127.0.0.1" });
  const controller = new AbortController();
  const stream = await fetch(origin + boardUrl + "/events", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) });
  assert.equal(stream.status, 200);
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  let backlog = "";
  try {
    await request("POST", taskUrl, 201, { bodyMarkdown: "New" });
    await request("GET", pageUrl + "&cursor=" + encodeURIComponent(page.nextCursor), 409);
    await request("PATCH", `${taskUrl}/1`, 200, { expectedRevision: 1, done: false });
    await request("PATCH", `${taskUrl}/1`, 200, { expectedRevision: 1, done: true });
    await request("DELETE", `${taskUrl}/1`, 204, { expectedRevision: 2 });
    await request("DELETE", boardUrl, 204);
    while (!backlog.includes('"event":"board_deleted"')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      backlog += decoder.decode(chunk.value, { stream: true });
    }
    const events = Array.from(backlog.matchAll(/^data: (.+)$/gm), match => JSON.parse(match[1]).event);
    assert.deepEqual(events.filter(event => event === "board_updated" || event === "board_deleted"),
      ["board_updated", "board_updated", "board_updated", "board_deleted"]);
  } finally {
    controller.abort();
    reader.releaseLock();
  }
});

test("Task writes roll back on activity failure and preserve the ticket's content-activity clock", async t => {
  const dbFile = fileFixture(t);
  const { request, taskUrl, taskHistory, board } = await fixture(t, dbFile);
  const sqlite = new Database(dbFile);
  t.after(() => { sqlite.close(); });
  const currentRevision = () => sqlite.prepare("SELECT revision FROM ticket_list_revisions WHERE board_id = ?").pluck().get(board.id);
  const contentActivity = () => sqlite.prepare("SELECT * FROM ticket_content_activity").all();
  const before = currentRevision();
  const contentBefore = contentActivity();
  sqlite.exec(`CREATE TRIGGER reject_task_activity BEFORE INSERT ON activity_logs
    WHEN NEW.action GLOB 'task_*' BEGIN SELECT RAISE(ABORT, 'fixture activity failure'); END;`);
  await request("POST", taskUrl, 500, { bodyMarkdown: "Rolled back" });
  assert.equal(currentRevision(), before);
  assert.equal(sqlite.prepare("SELECT count(*) FROM ticket_task_counters").pluck().get(), 0);
  sqlite.exec("DROP TRIGGER reject_task_activity");
  const current = await request("POST", taskUrl, 201, { bodyMarkdown: "Task #1" });
  assert.equal(current.number, 1);
  const afterCreate = currentRevision();
  sqlite.exec(`CREATE TRIGGER reject_task_activity BEFORE INSERT ON activity_logs
    WHEN NEW.action IN ('task_updated', 'task_deleted') BEGIN SELECT RAISE(ABORT, 'fixture activity failure'); END;`);
  await request("PATCH", `${taskUrl}/1`, 500, { expectedRevision: 1, done: true });
  await request("DELETE", `${taskUrl}/1`, 500, { expectedRevision: 1 });
  assert.deepEqual(await request("GET", `${taskUrl}/1`, 200), current);
  assert.equal(currentRevision(), afterCreate);
  assert.equal((await taskHistory()).length, 1);
  sqlite.exec("DROP TRIGGER reject_task_activity");
  await request("PATCH", `${taskUrl}/1`, 200, { expectedRevision: 1, done: true });
  await request("DELETE", `${taskUrl}/1`, 204, { expectedRevision: 2 });
  assert.deepEqual(contentActivity(), contentBefore);
});

test("Task portable export round-trips images, active records and deleted numbering state without changing legacy exports", async t => {
  const source = await fixture(t, fileFixture(t));
  const dst = buildApp({ dbFile: fileFixture(t) });
  t.after(() => dst.close());
  const request = api(dst);
  const sourceExport = () => source.request("GET", source.boardUrl + "/export", 200) as Promise<BoardExport>;
  const legacy = await sourceExport();
  assert.equal(legacy.formatVersion, 2);
  assert.equal(Object.hasOwn(legacy.tickets[0], "taskCount"), false);
  assert.equal((await request("POST", "/api/boards/import", 201, legacy)).tickets[0].taskCount, 0);

  const upload = await source.app.inject({ method: "POST", url: "/api/attachments", headers: { "content-type": "image/png" }, payload: png });
  assert.equal(upload.statusCode, 201, upload.body);
  const image = upload.json();
  const markdown = `![Task-only](${image.url})`;
  await source.request("POST", source.taskUrl, 201, { bodyMarkdown: markdown, done: true });
  await source.request("POST", source.taskUrl, 201, { bodyMarkdown: "Will be deleted" });
  await source.request("DELETE", source.taskUrl + "/2", 204, { expectedRevision: 1, updater: "Deleted by" });
  const exported = await sourceExport();
  assert.equal(exported.formatVersion, 4);
  assert.deepEqual(exported.tickets[0].taskState, { lastNumber: 2, tasks: [{ number: 1, bodyMarkdown: markdown, done: true, revision: 1 }] });
  assert.deepEqual(exported.attachments?.map(a => a.id), [image.id]);

  const before = await request("GET", "/api/boards", 200);
  const invalid = [
    { ...exported, formatVersion: 3 },
    { ...exported, attachments: [] },
    { ...exported, tickets: exported.tickets.map(ticket => ({ ...ticket, taskState: undefined })) },
    ...[0, Number.MAX_SAFE_INTEGER + 1].map(lastNumber => ({ ...exported, tickets: exported.tickets.map(ticket => ({
      ...ticket, taskState: { ...ticket.taskState!, lastNumber },
    })) })),
    { ...exported, tickets: exported.tickets.map(ticket => ({ ...ticket,
      taskState: { ...ticket.taskState!, tasks: [...ticket.taskState!.tasks, ...ticket.taskState!.tasks] },
    })) },
    { ...exported, tickets: exported.tickets.map(ticket => ({ ...ticket,
      taskState: { ...ticket.taskState!, tasks: ticket.taskState!.tasks.map(task => ({ ...task, bodyMarkdown: "\ud800" })) },
    })) },
  ];
  for (const payload of invalid) await request("POST", "/api/boards/import", 400, payload);
  assert.deepEqual(await request("GET", "/api/boards", 200), before);
  assert.equal((await dst.inject(image.url)).statusCode, 404);
  const imported = await request("POST", "/api/boards/import", 201, exported);
  assert.deepEqual([imported.tickets[0].taskCount, imported.tickets[0].doneTaskCount], [1, 1]);
  assert.deepEqual((await dst.inject(image.url)).rawPayload, png);
  const importedTasks = `/api/tickets/${imported.tickets[0].id}/tasks`;
  assert.equal((await request("GET", importedTasks + "/1", 200)).bodyMarkdown, markdown);
  assert.equal((await request("POST", importedTasks, 201, { bodyMarkdown: "Next" })).number, 3);

  await source.request("DELETE", source.taskUrl + "/1", 204, { expectedRevision: 1 });
  const empty = await sourceExport();
  assert.equal(empty.formatVersion, 4);
  assert.equal(Object.hasOwn(empty, "attachments"), false);
  assert.deepEqual(empty.tickets[0].taskState, { lastNumber: 2, tasks: [] });
  const restored = await request("POST", "/api/boards/import", 201, empty);
  const emptyTasks = `/api/tickets/${restored.tickets[0].id}/tasks`;
  assert.equal((await request("POST", emptyTasks, 201, { bodyMarkdown: "Still next" })).number, 3);
});

test("Task tables are additive on a historical backup and numbering survives a move, restart and cascade", async t => {
  const dbFile = fileFixture(t);
  const backup = path.join(path.dirname(dbFile), "old.sqlite");
  const old = new KanbanDb(dbFile);
  const { board, lanes } = old.createBoard({ name: "Before tasks" });
  const ticket = old.createTicket({ boardId: board.id, laneId: lanes[0].id, title: "Preserved", bodyMarkdown: "*Old*" });
  old.addComment({ ticketId: ticket.id, bodyMarkdown: "Old comment" });
  old.sqlite.exec("DROP TABLE ticket_tasks; DROP TABLE ticket_task_counters");
  const oldRows = old.sqlite.prepare("SELECT * FROM tickets").all();
  await old.sqlite.backup(backup);
  old.close();

  let app = buildApp({ dbFile: backup });
  try {
    const request = api(app);
    const ticketUrl = `/api/tickets/${ticket.id}`;
    const taskUrl = ticketUrl + "/tasks";
    assert.equal((await request("GET", ticketUrl, 200)).comments[0].bodyMarkdown, "Old comment");
    const read = new Database(backup, { readonly: true });
    try { assert.deepEqual(read.prepare("SELECT * FROM tickets").all(), oldRows); } finally { read.close(); }
    await request("POST", taskUrl, 201, { bodyMarkdown: "Will move" });
    await request("DELETE", taskUrl + "/1", 204, { expectedRevision: 1 });
    await request("POST", taskUrl, 201, { bodyMarkdown: "Moves with ticket" });
    const target = await request("POST", "/api/boards", 201, { name: "Target" });
    await request("POST", ticketUrl + "/move", 200, { boardId: target.board.id, laneId: target.lanes[0].id });
    await app.close();
    app = buildApp({ dbFile: backup });
    const reopened = api(app);
    assert.equal((await reopened("GET", taskUrl + "/2", 200)).bodyMarkdown, "Moves with ticket");
    const next = await reopened("POST", taskUrl, 201, { bodyMarkdown: "After restart" });
    assert.equal(next.number, 3);
    await reopened("DELETE", ticketUrl, 204);
    assert.equal((await reopened("GET", taskUrl, 404)).code, "TICKET_NOT_FOUND");
    const db = new Database(backup, { readonly: true });
    try {
      for (const table of ["ticket_tasks", "ticket_task_counters"]) assert.equal(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get(), 0);
      assert.deepEqual(db.pragma("foreign_key_check"), []);
    } finally { db.close(); }
  } finally { await app.close(); }
});
