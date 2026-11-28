import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { HTTPMethods } from "fastify";

import { buildApp } from "../src/app.js";
import { KanbanDb } from "../src/db.js";
import type { RemoteIssueSnapshot } from "../src/remote/adapters.js";
import type { ActivityLogView, CommentView } from "../src/types.js";
import { createDbFile, createMockGithubAdapter } from "./app-test-helpers.js";

function api(app: ReturnType<typeof buildApp>) {
  return async (method: HTTPMethods, url: string, status: number, payload?: object, headers?: Record<string, string>) => {
    const response = await app.inject({ method, url, payload, headers });
    assert.equal(response.statusCode, status, `${method} ${url}: ${response.body}`);
    return response.body ? response.json() : null;
  };
}

async function fixture(request: ReturnType<typeof api>) {
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Updater fixtures", laneNames: ["Todo", "Review"] });
  const ticketList = `/api/boards/${board.id}/tickets`;
  const createTicket = (title: string, updater?: string) => request("POST", ticketList, 201, { laneId: lanes[0].id, title, updater });
  const activity = async (id: number): Promise<ActivityLogView[]> => (await request("GET", `/api/tickets/${id}/activity`, 200)).activity;
  return { board, lanes, ticketList, createTicket, activity };
}

test("mutation history attributes the original request and rejects invalid metadata without a write", async t => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = api(app);
  const { board, lanes, ticketList, createTicket, activity } = await fixture(request);
  const first = await createTicket("First");
  const second = await createTicket("Second", "  実装担当  ");
  assert.equal((await activity(first.id))[0].updater, "API");
  assert.equal((await activity(second.id))[0].updater, "  実装担当  ");

  const firstUrl = `/api/tickets/${first.id}`;
  const latestActivity = async () => (await activity(first.id))[0];
  const baseline = await latestActivity();
  for (const updater of [null, 0, false, {}, [], "", "　 ", "A\nB", "A\u0085B", "\ud800", "🛠".repeat(81)]) {
    assert.match((await request("PATCH", firstUrl, 400, { bodyMarkdown: "Should fail", updater })).error, /updater/i);
  }
  await request("PATCH", firstUrl, 400, { updater: "Metadata is not a mutation" });
  await request("DELETE", firstUrl, 400, { updater: null });
  assert.deepEqual(await latestActivity(), baseline);
  assert.equal((await request("GET", firstUrl, 200)).bodyMarkdown, "");

  const maxUpdater = "🛠".repeat(80);
  await request("PATCH", firstUrl, 200, { bodyMarkdown: "Saved", updater: maxUpdater });
  assert.equal((await latestActivity()).updater, maxUpdater);
  const comment: CommentView = await request("POST", `${firstUrl}/comments`, 201, { bodyMarkdown: "First note", updater: "画面" });
  const commentUrl = `/api/comments/${comment.id}`;
  const edited = await request("PATCH", commentUrl, 200, { bodyMarkdown: "Edited note", updater: "Reviewer" });
  assert.equal(edited.updater, "画面");
  assert.equal((await request("GET", `${firstUrl}/comments`, 200)).comments[0].updater, "画面");
  assert.equal((await latestActivity()).updater, "Reviewer");
  // An old script may still send an empty JSON DELETE with a Content-Type header.
  await request("DELETE", commentUrl, 204, undefined, { "content-type": "application/json" });
  assert.equal((await latestActivity()).updater, "API");

  const bulk = { ticketIds: [first.id, second.id], laneName: lanes[1].name, updater: "Bulk reviewer" };
  const beforeInvalidBulk = await activity(first.id);
  await request("POST", `${ticketList}/bulk-transition`, 400, { ...bulk, ticketIds: [first.id, 999999] });
  assert.deepEqual(await activity(first.id), beforeInvalidBulk);
  await request("POST", `${ticketList}/bulk-transition`, 200, bulk);
  assert.equal((await latestActivity()).updater, "Bulk reviewer");
  assert.equal((await activity(second.id))[0].updater, "Bulk reviewer");

  const group = await request("POST", `/api/boards/${board.id}/groups`, 201, { name: "Team", updater: "Group creator" });
  await request("PATCH", `/api/groups/${group.id}`, 400, { expectedRevision: group.revision, updater: "No change" });
  await request("DELETE", `/api/groups/${group.id}`, 204, { updater: "Group remover" }, { "if-match": `"${group.revision}"` });
  const groups = (await request("GET", `/api/boards/${board.id}/group-activity`, 200)).activity;
  assert.deepEqual(groups.map((row: ActivityLogView) => row.updater), ["Group remover", "Group creator"]);

  await request("DELETE", firstUrl, 204, { updater: "Ticket remover" });
  assert.deepEqual([(await latestActivity()).action, (await latestActivity()).updater], ["ticket_deleted", "Ticket remover"]);
});

test("overlapping requests retain distinct updaters across remote adapter awaits", { timeout: 10_000 }, async t => {
  const snapshot: RemoteIssueSnapshot = {
    provider: "github", instanceUrl: "https://github.com", resourceType: "issue", projectKey: "synthetic/board",
    issueKey: "1", displayRef: "synthetic/board#1", url: "https://github.com/synthetic/board/issues/1", title: "Imported",
    bodyMarkdown: "Remote fixtures", state: "open", updatedAt: null,
  };
  let beginFetch!: () => void;
  let finishFetch!: () => void;
  const pending = new Promise<void>(resolve => { beginFetch = resolve; });
  const unblock = new Promise<void>(resolve => { finishFetch = resolve; });
  const adapter = createMockGithubAdapter({ initial: snapshot });
  adapter.fetchIssue = async () => {
    beginFetch();
    await unblock;
    return snapshot;
  };
  const app = buildApp({ dbFile: ":memory:", remoteAdapters: { github: adapter } });
  t.after(() => { finishFetch(); return app.close(); });
  const request = api(app);
  const { board, lanes, createTicket, activity } = await fixture(request);
  const tracked = request("POST", `/api/boards/${board.id}/remote-import`, 201, {
    provider: "github", laneId: lanes[0].id, url: snapshot.url, updater: "Remote importer",
  });
  await Promise.race([pending, tracked]);
  const another = await createTicket("Independent work", "Another request");
  const omitted = await createTicket("Older client");
  finishFetch();
  assert.deepEqual((await activity((await tracked).id)).map(row => row.updater), ["Remote importer", "Remote importer"]);
  assert.equal((await activity(another.id))[0].updater, "Another request");
  assert.equal((await activity(omitted.id))[0].updater, "API");
});

test("a historical database backup migrates to nullable updater columns and preserves data on restart", async t => {
  const dbFile = createDbFile();
  const backupFile = path.join(path.dirname(dbFile), "old-backup.sqlite");
  t.after(() => fs.rmSync(path.dirname(dbFile), { recursive: true, force: true }));
  const old = new KanbanDb(dbFile);
  const { board, lanes } = old.createBoard({ name: "Old board", laneNames: ["Todo"] });
  const ticket = old.createTicket({ boardId: board.id, laneId: lanes[0].id, title: "Old ticket" });
  const comment = old.addComment({ ticketId: ticket.id, bodyMarkdown: "Historical comment" });
  old.createGroup({ boardId: board.id, name: "Old group" });
  const tables = ["activity_logs", "comments", "group_activity_logs"];
  for (const table of tables) old.sqlite.exec(`ALTER TABLE ${table} DROP COLUMN updater`);
  const snapshot = (db: Database.Database, table: string) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all();
  const before = Object.fromEntries([...tables, "tickets"].map(table => [table, snapshot(old.sqlite, table)]));
  await old.sqlite.backup(backupFile);
  old.close();

  for (let opens = 0; opens < 2; opens++) {
    const db = new KanbanDb(backupFile);
    try {
      for (const table of tables) {
        assert.deepEqual(snapshot(db.sqlite, table), before[table].map(row => ({ ...row as object, updater: null })));
      }
      assert.deepEqual(snapshot(db.sqlite, "tickets"), before.tickets);
      assert.deepEqual(db.sqlite.pragma("foreign_key_check"), []);
      assert.deepEqual(db.sqlite.pragma("integrity_check"), [{ integrity_check: "ok" }]);
    } finally { db.close(); }
  }

  const app = buildApp({ dbFile: backupFile });
  try {
    const request = api(app);
    const edited = await request("PATCH", `/api/comments/${comment.id}`, 200, { bodyMarkdown: "Edited after restore", updater: "Editor" });
    assert.equal(edited.updater, null);
    assert.equal(edited.createdAt, comment.createdAt);
    const { activity } = await request("GET", `/api/tickets/${ticket.id}/activity`, 200);
    assert.equal(activity[0].updater, "Editor");
    assert.ok(activity.slice(1).every((row: ActivityLogView) => row.updater === null));
  } finally { await app.close(); }
});

test("board transfer preserves historical comment attribution separately from import activity", async t => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = api(app);
  const { board, createTicket, activity } = await fixture(request);
  const ticket = await createTicket("Source");
  await request("POST", `/api/tickets/${ticket.id}/comments`, 201, { bodyMarkdown: "Current source", updater: "Original author" });
  const exported = await request("GET", `/api/boards/${board.id}/export`, 200);
  const [original] = exported.tickets[0].comments;
  exported.tickets[0].comments.unshift({ id: original.id + 1, createdAt: original.createdAt, bodyMarkdown: "Legacy comment" });
  const result = await request("POST", "/api/boards/import", 201, { ...exported, updater: "Importer" });
  const importedTicket = result.tickets[0];
  assert.deepEqual(importedTicket.comments.map((item: CommentView) => [item.bodyMarkdown, item.updater, item.createdAt]), [
    ["Legacy comment", null, original.createdAt],
    ["Current source", "Original author", original.createdAt],
  ]);
  const importedComments = (await activity(importedTicket.id)).filter(row => row.action === "comment_imported");
  assert.deepEqual(importedComments.map(row => row.updater), ["Importer", "Importer"]);

  const beforeInvalid = await request("GET", "/api/boards", 200);
  original.updater = " ";
  await request("POST", "/api/boards/import", 400, exported);
  assert.deepEqual(await request("GET", "/api/boards", 200), beforeInvalid);
});
