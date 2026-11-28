import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { createDbFile } from "./app-test-helpers.js";

async function fixture() {
  const app = buildApp({ dbFile: createDbFile() });
  const board = (await app.inject({ method: "POST", url: "/api/boards", payload: { name: "Archive", laneNames: ["Todo", "Doing"] } })).json();
  const ticket = (await app.inject({ method: "POST", url: `/api/boards/${board.board.id}/tickets`, payload: { laneId: board.lanes[0].id, title: "Keep work", bodyMarkdown: "original" } })).json();
  const get = async () => (await app.inject({ method: "GET", url: `/api/tickets/${ticket.id}` })).json();
  const patch = (payload: object) => app.inject({ method: "PATCH", url: `/api/tickets/${ticket.id}`, payload });
  const archive = (isArchived: boolean, version: number, boardId = board.board.id) => app.inject({ method: "PATCH", url: `/api/tickets/${ticket.id}/archive`, payload: { isArchived, expectedArchiveVersion: version, expectedBoardId: boardId } });
  return { app, board, ticket, get, patch, archive };
}

test("conditional archive preserves concurrent content/lane/comments and rejects same-state requests", async () => {
  const f = await fixture();
  try {
    assert.equal(f.ticket.archiveVersion, 0);
    const saved = await f.archive(true, 0); assert.equal(saved.statusCode, 200); assert.equal(saved.json().archiveVersion, 1); assert.equal(saved.json().previousEditToken, f.ticket.editToken);
    assert.equal((await f.archive(true, 1)).statusCode, 409);
    await f.patch({ isArchived: true }); assert.equal((await f.get()).archiveVersion, 1);
    await f.patch({ title: "New title", bodyMarkdown: "Keep newer body", laneId: f.board.lanes[1].id });
    await f.app.inject({ method: "POST", url: `/api/tickets/${f.ticket.id}/comments`, payload: { bodyMarkdown: "new comment" } });
    assert.equal((await f.get()).archiveVersion, 1);
    const beforeRestore = await f.get();
    const restoreResponse = await f.archive(false, 1);
    assert.equal(restoreResponse.statusCode, 200);
    assert.equal(restoreResponse.json().previousEditToken, beforeRestore.editToken);
    assert.notEqual(restoreResponse.json().previousEditToken, saved.json().editToken);
    const restored = await f.get();
    assert.equal(restored.archiveVersion, 2); assert.equal(restored.isArchived, false);
    assert.equal(restored.title, "New title"); assert.equal(restored.bodyMarkdown, "Keep newer body");
    assert.equal(restored.laneId, f.board.lanes[1].id); assert.equal(restored.comments[0].bodyMarkdown, "new comment");
    const exported = (await f.app.inject({ method: "GET", url: `/api/boards/${f.board.board.id}/export` })).json();
    assert.equal("archiveVersion" in exported.tickets[0], false);
  } finally { await f.app.close(); }
});

test("generic/bulk archive ABA and board round trips invalidate old recovery generations", async () => {
  const f = await fixture();
  try {
    await f.archive(true, 0);
    await f.patch({ isArchived: false }); await f.patch({ isArchived: true });
    assert.equal((await f.get()).archiveVersion, 3); assert.equal((await f.archive(false, 1)).statusCode, 409);
    for (const isArchived of [false, true]) {
      const response = await f.app.inject({ method: "POST", url: `/api/boards/${f.board.board.id}/tickets/bulk-archive`, payload: { ticketIds: [f.ticket.id], isArchived } });
      assert.equal(response.statusCode, 200);
    }
    assert.equal((await f.get()).archiveVersion, 5); assert.equal((await f.archive(false, 3)).statusCode, 409);
    const other = (await f.app.inject({ method: "POST", url: "/api/boards", payload: { name: "Other", laneNames: ["Todo"] } })).json();
    for (const board of [other, f.board]) {
      const response = await f.app.inject({ method: "POST", url: `/api/tickets/${f.ticket.id}/move`, payload: { boardId: board.board.id, laneId: board.lanes[0].id } });
      assert.equal(response.statusCode, 200);
    }
    assert.equal((await f.get()).archiveVersion, 7); assert.equal((await f.archive(false, 5)).statusCode, 409);
    assert.equal((await f.get()).isArchived, true);
  } finally { await f.app.close(); }
});

test("archive guard requires complete guarded input and never modifies a deleted ticket", async () => {
  const f = await fixture();
  try {
    for (const payload of [{ isArchived: true }, { isArchived: true, expectedArchiveVersion: -1, expectedBoardId: f.board.board.id }]) {
      assert.equal((await f.app.inject({ method: "PATCH", url: `/api/tickets/${f.ticket.id}/archive`, payload })).statusCode, 400);
    }
    assert.equal((await f.archive(true, 0, f.board.board.id + 1)).statusCode, 409);
    assert.equal((await f.get()).isArchived, false);
    await f.app.inject({ method: "DELETE", url: `/api/tickets/${f.ticket.id}` });
    assert.equal((await f.archive(true, 0)).statusCode, 404);
  } finally { await f.app.close(); }
});
