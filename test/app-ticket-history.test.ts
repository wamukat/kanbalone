import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { HTTPMethods } from "fastify";

import { buildApp } from "../src/app.js";
import type { ActivityLogView, TicketView } from "../src/types.js";

function api(app: ReturnType<typeof buildApp>) {
  return async (method: HTTPMethods, url: string, status: number, payload?: object) => {
    const result = await app.inject({ method, url, payload });
    assert.equal(result.statusCode, status, `${method} ${url}: ${result.body}`);
    return result.body ? result.json() : null;
  };
}

function latestChange(entry: ActivityLogView, field: string) {
  assert.equal(entry.details.changeVersion, 1);
  return (entry.details.changes as Record<string, unknown>)[field];
}

test("a ticket edit stores stable before/after values and directional peer changes", async t => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = api(app);
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "History", laneNames: ["Todo", "Review"] });
  const ticketsUrl = `/api/boards/${board.id}/tickets`;
  const oldTag = await request("POST", `/api/boards/${board.id}/tags`, 201, { name: "Pending", color: "#1f6f5f" });
  const newTag = await request("POST", `/api/boards/${board.id}/tags`, 201, { name: "Reviewed", color: "" });
  const parent: TicketView = await request("POST", ticketsUrl, 201, { title: "Parent", laneId: lanes[0].id });
  const peer: TicketView = await request("POST", ticketsUrl, 201, { title: "Peer", laneId: lanes[0].id });
  const target: TicketView = await request("POST", ticketsUrl, 201, {
    title: "Target", laneId: lanes[0].id, tagIds: [oldTag.id],
  });
  const activity = async (id: number, compact = false): Promise<ActivityLogView[]> =>
    (await request("GET", `/api/tickets/${id}/activity${compact ? "?compact=true" : ""}`, 200)).activity;
  const url = `/api/tickets/${target.id}`;
  const body = "Instructions\n" + "Important line\n".repeat(10_000);
  const edit = {
    laneId: lanes[1].id, parentTicketId: parent.id, blockerIds: [peer.id],
    relatedIds: [peer.id], tagIds: [newTag.id], bodyMarkdown: body, updater: "運用担当",
  };
  await request("PATCH", url, 200, edit);
  const entry = (await activity(target.id))[0];
  assert.equal(entry.updater, "運用担当");
  assert.deepEqual(latestChange(entry, "bodyMarkdown"), { before: "", after: body });
  assert.deepEqual(latestChange(entry, "lane"), {
    before: { id: lanes[0].id, label: "Todo" }, after: { id: lanes[1].id, label: "Review" },
  });
  assert.deepEqual(latestChange(entry, "tags"), {
    before: [{ id: oldTag.id, label: oldTag.name, color: oldTag.color }],
    after: [{ id: newTag.id, label: newTag.name, color: newTag.color }],
  });
  assert.deepEqual(latestChange(entry, "parent"), { before: null, after: { id: parent.id, label: "Parent" } });
  const parentChange = (await activity(parent.id))[0];
  assert.equal(parentChange.action, "ticket_relations_changed");
  assert.deepEqual(latestChange(parentChange, "children"), { before: [], after: [{ id: target.id, label: "Target" }] });
  const peerChange = (await activity(peer.id))[0];
  for (const field of ["blockedBy", "related"]) {
    assert.deepEqual(latestChange(peerChange, field), { before: [], after: [{ id: target.id, label: "Target" }] });
  }
  assert.equal(latestChange(peerChange, "blockers"), undefined);

  const compact = await activity(target.id, true);
  assert.equal(compact[0].id, entry.id);
  assert.equal(compact[0].details.bodyDetailsDeferred, true);
  assert.deepEqual(latestChange(compact[0], "bodyMarkdown"), {});
  assert.ok(JSON.stringify(compact).length < 4_000);
  await request("GET", `/api/tickets/${parent.id}/activity/${entry.id}`, 404);

  await request("PATCH", url, 200, { title: "Renamed target", relatedIds: [peer.id], blockerIds: [peer.id], bodyMarkdown: "Later" });
  assert.deepEqual((await activity(peer.id))[0], peerChange);
  assert.deepEqual((await activity(parent.id))[0], parentChange);
  assert.deepEqual(await request("GET", `${url}/activity/${entry.id}`, 200), entry);
  await request("PATCH", url, 200, { bodyMarkdown: "Later", laneId: lanes[1].id, relatedIds: [peer.id] });
  assert.deepEqual((await activity(target.id))[0].details.changes, {});
  const beforeFailure = await activity(target.id);
  await request("PATCH", url, 400, { bodyMarkdown: "Rolled back", tagIds: [], relatedIds: [999999] });
  assert.deepEqual(await activity(target.id), beforeFailure);
  assert.equal((await request("GET", url, 200)).bodyMarkdown, "Later");

  await request("DELETE", `/api/tickets/${peer.id}`, 204, { updater: "削除担当" });
  const removed = (await activity(target.id))[0];
  assert.equal(removed.updater, "削除担当");
  assert.deepEqual(latestChange(removed, "blockers"), { before: [{ id: peer.id, label: "Peer" }], after: [] });
  assert.deepEqual(latestChange(removed, "related"), { before: [{ id: peer.id, label: "Peer" }], after: [] });
});

test("comment additions are identified and compact records preserve exact deferred text by event ID", async t => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = api(app);
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Comment history", laneNames: ["Todo"] });
  const ticket = await request("POST", `/api/boards/${board.id}/tickets`, 201, { title: "Comment target", laneId: lanes[0].id });
  const url = `/api/tickets/${ticket.id}`;
  const oldText = "Posted earlier.\n" + "a".repeat(600);
  const comment = await request("POST", `${url}/comments`, 201, { bodyMarkdown: oldText, updater: "Poster" });
  await request("PATCH", `/api/comments/${comment.id}`, 200, { bodyMarkdown: "Edited text", updater: "Editor" });
  await request("PATCH", `/api/comments/${comment.id}`, 200, { bodyMarkdown: "Edited text", updater: "Editor" });
  await request("DELETE", `/api/comments/${comment.id}`, 204, { updater: "Remover" });
  const compact: ActivityLogView[] = (await request("GET", `${url}/activity?compact=true`, 200)).activity;
  const full: ActivityLogView[] = (await request("GET", `${url}/activity`, 200)).activity;
  assert.deepEqual(compact.map(row => row.id), full.map(row => row.id));
  const added = compact.find(row => row.action === "comment_added")!;
  assert.deepEqual(added.details, { commentId: comment.id, bodyDetailsDeferred: true, bodyExcerpt: oldText.slice(0, 160) });
  assert.equal(added.updater, "Poster");
  assert.deepEqual((await request("GET", `${url}/activity/${added.id}`, 200)).details, { commentId: comment.id, bodyMarkdown: oldText });
  assert.equal(compact[0].action, "comment_deleted");
  assert.deepEqual((await request("GET", `${url}/activity/${compact[0].id}`, 200)).details,
    { commentId: comment.id, deletedBodyMarkdown: "Edited text" });
  assert.equal(compact[1].details.bodyUnchanged, true);
  assert.equal(compact[1].details.bodyDetailsDeferred, undefined);
  assert.deepEqual(full[0].details, { commentId: comment.id, deletedBodyMarkdown: "Edited text" });
  assert.deepEqual((await request("GET", `${url}/comments`, 200)).comments, []);
});

test("bulk and board-level mutations keep historical labels and counterpart changes", async t => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = api(app);
  const source = await request("POST", "/api/boards", 201, { name: "Source", laneNames: ["Todo", "Review"] });
  const destination = await request("POST", "/api/boards", 201, { name: "Destination", laneNames: ["Inbox"] });
  const sourceUrl = `/api/boards/${source.board.id}`;
  const tag = await request("POST", `${sourceUrl}/tags`, 201, { name: "Snapshot tag" });
  const peer = await request("POST", `${sourceUrl}/tickets`, 201, { title: "Peer ticket", laneId: source.lanes[0].id });
  const target = await request("POST", `${sourceUrl}/tickets`, 201, {
    title: "Move target", laneId: source.lanes[0].id, parentTicketId: peer.id, blockerIds: [peer.id], relatedIds: [peer.id], tagIds: [tag.id],
  });
  const latest = async (ticket: TicketView): Promise<ActivityLogView> =>
    (await request("GET", `/api/tickets/${ticket.id}/activity`, 200)).activity[0];
  assert.deepEqual(latestChange(await latest(target), "parent"), { before: null, after: { id: peer.id, label: peer.title } });
  await request("POST", `${sourceUrl}/tickets/bulk-transition`, 200, { ticketIds: [target.id], laneName: "Review" });
  assert.deepEqual(latestChange(await latest(target), "lane"), {
    before: { id: source.lanes[0].id, label: "Todo" }, after: { id: source.lanes[1].id, label: "Review" },
  });
  await request("DELETE", `/api/tags/${tag.id}`, 204, { updater: "Tag manager" });
  const removed = await latest(target);
  assert.equal(removed.updater, "Tag manager");
  assert.deepEqual(latestChange(removed, "tags"), { before: [{ id: tag.id, label: "Snapshot tag", color: tag.color }], after: [] });
  await request("POST", `${sourceUrl}/tickets/bulk-move`, 200, {
    ticketIds: [target.id], boardId: destination.board.id, laneId: destination.lanes[0].id,
  });
  const move = await latest(target);
  assert.deepEqual(latestChange(move, "board"), {
    before: { id: source.board.id, label: "Source" }, after: { id: destination.board.id, label: "Destination" },
  });
  assert.deepEqual(latestChange(move, "parent"), { before: { id: peer.id, label: peer.title }, after: null });
  assert.deepEqual(latestChange(await latest(peer), "children"), { before: [{ id: target.id, label: target.title }], after: [] });
});

test("SQLite backup and restore preserve history order, recorded Markdown and attachment bytes", async t => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "kanbalone-history-backup-"));
  const live = path.join(work, "live");
  fs.mkdirSync(live);
  const dbFile = path.join(live, "kanbalone.sqlite");
  let app = buildApp({ dbFile });
  t.after(async () => {
    await app.close();
    fs.rmSync(work, { recursive: true, force: true });
  });
  const request = api(app);
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Archived history", laneNames: ["Todo"] });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAA1BMVEUA//8ZXC8lAAAADElEQVQI12NgYGAAAAAEAAEnNCcKAAAAAElFTkSuQmCC", "base64");
  const uploaded = await app.inject({
    method: "POST", url: "/api/attachments", headers: { "content-type": "image/png" }, payload: png,
  });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const image = uploaded.json();
  const originalBody = `Original note ![before](${image.url})`;
  const ticket: TicketView = await request("POST", `/api/boards/${board.id}/tickets`, 201, {
    title: "History to restore", laneId: lanes[0].id, bodyMarkdown: originalBody,
  });
  const url = `/api/tickets/${ticket.id}`;
  await request("PATCH", url, 200, { bodyMarkdown: "Updated note", updater: "Author" });
  await request("POST", `${url}/comments`, 201, { bodyMarkdown: "Submitted comment", updater: "Reviewer" });
  const sqlite = new Database(dbFile);
  try {
    sqlite.prepare(`INSERT INTO activity_logs (board_id, ticket_id, subject_ticket_id, action, message, details_json, created_at)
      VALUES (?, ?, ?, 'comment_added', 'Comment added', '{}', ?)`).run(board.id, ticket.id, ticket.id, "2026-11-28T00:00:00.000Z");
    sqlite.prepare("UPDATE activity_logs SET created_at = ?").run("2026-11-28T00:00:00.000Z");
  } finally { sqlite.close(); }
  const full: ActivityLogView[] = (await request("GET", `${url}/activity`, 200)).activity;
  const compact = await request("GET", `${url}/activity?compact=true`, 200);
  assert.deepEqual(full.map(row => row.id), full.map(row => row.id).sort((a, b) => b - a));
  assert.deepEqual(full[0].details, {});
  assert.equal(full[0].updater, null);
  const edit = full.find(record => record.action === "ticket_updated")!;
  assert.deepEqual(latestChange(edit, "bodyMarkdown"), { before: originalBody, after: "Updated note" });

  const backup = path.join(work, "backup");
  const restored = path.join(work, "restored");
  const command = path.resolve(import.meta.dirname, "../scripts/kanbalone-backup.mjs");
  const manifest = JSON.parse(execFileSync(process.execPath, [command, "backup", dbFile, backup], { encoding: "utf8" }));
  assert.equal(manifest.attachmentCount, 1);
  execFileSync(process.execPath, [command, "restore", backup, restored]);
  await app.close();
  app = buildApp({ dbFile: path.join(restored, "kanbalone.sqlite") });
  const readRestored = api(app);
  assert.deepEqual((await readRestored("GET", `${url}/activity`, 200)).activity, full);
  assert.deepEqual(await readRestored("GET", `${url}/activity?compact=true`, 200), compact);
  assert.deepEqual(await readRestored("GET", `${url}/activity/${edit.id}`, 200), edit);
  assert.deepEqual((await app.inject(image.url)).rawPayload, png);
});
