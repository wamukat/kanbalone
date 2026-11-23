import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const output = resolve("coverage/subsecond-data");
const scratch = await mkdtemp(resolve(tmpdir(), "kanbalone-normalization-rollback-"));
const file = resolve(scratch, "existing.sqlite");
const sources = { prior: resolve(process.argv[2]), current: resolve(process.argv[3]) };
const collection = "/api/boards/2/tickets?order=position_asc&archived=all&limit=200";
const snapshots = {};
const observations = {};
let app;

async function open(version) {
  const source = sources[version];
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  app = buildApp({ dbFile: file, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  await app.ready();
}

async function close() {
  await app.close();
  app = undefined;
}

function snapshot() {
  const sqlite = new Database(file, { readonly: true });
  try {
    const schema = sqlite.prepare("SELECT type,name,sql FROM sqlite_schema ORDER BY type,name").all();
    const revisions = sqlite.prepare("SELECT board_id,revision FROM ticket_list_revisions ORDER BY board_id").all();
    const schemaVersion = sqlite.pragma("schema_version", { simple: true });
    assert.equal(sqlite.pragma("integrity_check", { simple: true }), "ok");
    assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
    return { schema, schemaVersion, revisions };
  } finally {
    sqlite.close();
  }
}

function assertPositions(lanes) {
  const sqlite = new Database(file, { readonly: true });
  try {
    const rows = sqlite.prepare("SELECT position FROM tickets WHERE lane_id=? ORDER BY is_archived,position,id").pluck();
    for (const lane of lanes) {
      const values = rows.all(lane);
      assert.deepEqual(values, values.map((_, index) => index));
    }
  } finally {
    sqlite.close();
  }
}

async function request(label, url, status = 200, options = {}) {
  const response = await app.inject({ method: "GET", url, ...options });
  observations[label] = response.statusCode;
  assert.equal(response.statusCode, status, response.body);
  return response;
}

function continuation(first) {
  const { nextCursor } = first.json().page;
  assert(nextCursor);
  return collection + "&cursor=" + encodeURIComponent(nextCursor);
}

try {
  await copyFile(resolve(output, "fixture.sqlite"), file);
  await open("prior");
  snapshots.prior = snapshot();
  const priorFirst = await request("priorFirst", collection);
  const priorNext = continuation(priorFirst);
  const priorSecond = await request("priorSecond", priorNext);
  const moveTarget = priorFirst.json().tickets.find(ticket => !ticket.isArchived);
  assert(moveTarget);
  const archiveTarget = priorSecond.json().tickets.find(ticket => !ticket.isArchived && ticket.laneId === moveTarget.laneId);
  assert(archiveTarget);
  const sqlite = new Database(file, { readonly: true });
  const destination = sqlite.prepare("SELECT id FROM lanes WHERE board_id=2 AND id!=? AND is_completion_lane=0 ORDER BY position,id LIMIT 1")
    .pluck().get(moveTarget.laneId);
  sqlite.close();
  assert(destination);
  const moveUrl = "/api/tickets/" + moveTarget.id;
  const archiveUrl = "/api/tickets/" + archiveTarget.id;
  await close();

  await open("current");
  snapshots.current = snapshot();
  assert.deepEqual(snapshots.current.schema, snapshots.prior.schema);
  assert.deepEqual(snapshots.current.revisions, snapshots.prior.revisions);
  assert.equal((await request("priorCursorOnCurrent", priorNext)).body, priorSecond.body);
  const moved = await request("moveOnCurrent", moveUrl + "/position", 200, {
    method: "PATCH", payload: { laneId: destination, position: 0 },
  });
  assert.equal(moved.json().laneId, destination);
  assert.equal(moved.json().position, 0);
  const archived = await request("archiveOnCurrent", archiveUrl, 200, { method: "PATCH", payload: { isArchived: true } });
  assert.equal(archived.json().isArchived, true);
  assertPositions([moveTarget.laneId, destination]);
  await request("priorCursorStale", priorNext, 409);
  const currentNext = continuation(await request("currentFirstAfterWrites", collection));
  const currentSecond = await request("currentSecondAfterWrites", currentNext);
  snapshots.afterCurrentWrites = snapshot();
  await close();

  await open("prior");
  snapshots.rolledBack = snapshot();
  assert.deepEqual(snapshots.rolledBack.schema, snapshots.afterCurrentWrites.schema);
  assert.deepEqual(snapshots.rolledBack.revisions, snapshots.afterCurrentWrites.revisions);
  assert.equal((await request("currentCursorOnPrior", currentNext)).body, currentSecond.body);
  assert.equal((await request("readMovedOnPrior", moveUrl)).json().laneId, destination);
  assert.equal((await request("readArchivedOnPrior", archiveUrl)).json().isArchived, true);
  const returned = await request("moveOnPrior", moveUrl + "/position", 200, {
    method: "PATCH", payload: { laneId: moveTarget.laneId, position: 0 },
  });
  assert.equal(returned.json().laneId, moveTarget.laneId);
  assertPositions([moveTarget.laneId, destination]);
  await request("currentCursorStale", currentNext, 409);
  await close();

  await open("current");
  snapshots.final = snapshot();
  assert.deepEqual(snapshots.final.schema, snapshots.prior.schema);
  assert.equal((await request("readReturnedOnCurrent", moveUrl)).json().position, 0);
  assert.equal((await request("readReturnedLaneOnCurrent", moveUrl)).json().laneId, moveTarget.laneId);
  console.log("Schema definitions preserved, cursors continued in both directions, both versions saved and read back positions with old cursor 409");
} finally {
  if (app) await close();
  await rm(scratch, { recursive: true, force: true });
  const reduced = Object.fromEntries(Object.entries(snapshots).map(([label, { schema, ...other }]) => [label, { schemaEntries: schema.length, ...other }]));
  await writeFile(resolve(output, "normalization-rollback.json"), JSON.stringify({ snapshots: reduced, observations }, null, 2) + "\n");
}
