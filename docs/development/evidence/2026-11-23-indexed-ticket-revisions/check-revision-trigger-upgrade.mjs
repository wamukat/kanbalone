import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-revision-upgrade-"));
const file = resolve(work, "copied-existing.sqlite");
const sources = { old: resolve(process.argv[2]), current: resolve(process.argv[3]) };
const pageUrl = "/api/boards/2/tickets?order=position_asc&archived=all&limit=200";
const snapshots = {};
const timings = {};
const statuses = {};
const tables = ["tickets", "ticket_tags", "ticket_remote_links", "ticket_external_references", "ticket_tag_reasons", "ticket_blockers", "ticket_related_links"];
const changedNames = tables.flatMap(table => ["insert", "update", "delete"].map(event => "ticket_list_" + table + "_" + event)).sort();
let app;

async function open(label, version) {
  const source = sources[version];
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const start = performance.now();
  app = buildApp({ dbFile: file, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  await app.ready();
  timings[label] = performance.now() - start;
}

async function close() {
  await app.close();
  app = undefined;
}

function snapshot() {
  const db = new Database(file, { readonly: true });
  try {
    const hash = createHash("sha256");
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    for (const { name } of tables) {
      const safeName = '"' + name.replaceAll('"', '""') + '"';
      hash.update(JSON.stringify([name, db.prepare("SELECT * FROM " + safeName).all().map(row => JSON.stringify(row)).sort()]));
    }
    const rows = hash.digest("hex");
    const triggers = Object.fromEntries(db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all()
      .map(({ name, sql }) => [name, sql]));
    const revisions = db.prepare("SELECT board_id,revision FROM ticket_list_revisions ORDER BY board_id").all();
    const schemaVersion = db.pragma("schema_version", { simple: true });
    const integrity = db.pragma("integrity_check", { simple: true });
    const foreignKeyErrors = db.pragma("foreign_key_check").length;
    assert.equal(integrity, "ok");
    assert.equal(foreignKeyErrors, 0);
    return { rows, triggers, schemaVersion, revisions, integrity, foreignKeyErrors };
  } finally {
    db.close();
  }
}

function nextPage(response) {
  const next = response.json().page.nextCursor;
  assert(next);
  return pageUrl + "&cursor=" + encodeURIComponent(next);
}

async function get(label, url, expected = 200) {
  const response = await app.inject(url);
  statuses[label] = response.statusCode;
  assert.equal(response.statusCode, expected, response.body);
  return response;
}

async function patch(label, url, payload) {
  const response = await app.inject({ method: "PATCH", url, payload });
  statuses[label] = response.statusCode;
  assert.equal(response.statusCode, 200, response.body);
  return response.json();
}

try {
  await copyFile(resolve(output, "fixture.sqlite"), file);
  await open("existing", "old");
  snapshots.existing = snapshot();
  const first = await get("firstOld", pageUrl);
  const afterFirst = nextPage(first);
  const originalSecond = await get("secondOld", afterFirst);
  const originalThird = await get("thirdOld", nextPage(originalSecond));
  await close();

  await open("existingRestart", "old");
  snapshots.existingRestart = snapshot();
  const routineSchemaChanges = snapshots.existingRestart.schemaVersion - snapshots.existing.schemaVersion;
  assert.deepEqual(snapshots.existingRestart, {
    ...snapshots.existing, schemaVersion: snapshots.existing.schemaVersion + routineSchemaChanges,
  });
  await close();

  await open("upgrade", "current");
  snapshots.upgrade = snapshot();
  assert.equal(snapshots.upgrade.rows, snapshots.existing.rows);
  assert.deepEqual(snapshots.upgrade.revisions, snapshots.existing.revisions);
  const oldTriggers = snapshots.existing.triggers;
  const newTriggers = snapshots.upgrade.triggers;
  assert.deepEqual(Object.keys(newTriggers), Object.keys(oldTriggers));
  assert.deepEqual(Object.keys(newTriggers).filter(name => newTriggers[name] !== oldTriggers[name]), changedNames);
  for (const name of changedNames) {
    assert(!oldTriggers[name].includes("UNION ALL SELECT"));
    assert(newTriggers[name].includes("UNION ALL SELECT"));
  }
  assert.equal(snapshots.upgrade.schemaVersion - snapshots.existingRestart.schemaVersion, routineSchemaChanges + 2 * changedNames.length);
  const continued = await get("oldCursorOnNew", afterFirst);
  assert.equal(continued.body, originalSecond.body);
  assert.equal(continued.headers["x-kanbalone-ticket-revision"], first.headers["x-kanbalone-ticket-revision"]);
  await close();

  await open("secondStartup", "current");
  snapshots.secondStartup = snapshot();
  assert.deepEqual(snapshots.secondStartup, {
    ...snapshots.upgrade, schemaVersion: snapshots.upgrade.schemaVersion + routineSchemaChanges,
  });
  assert.equal((await get("oldCursorAfterRestart", afterFirst)).body, continued.body);
  await close();

  await open("rollback", "old");
  snapshots.rollback = snapshot();
  assert.deepEqual(snapshots.rollback, {
    ...snapshots.secondStartup, schemaVersion: snapshots.secondStartup.schemaVersion + routineSchemaChanges,
  });
  assert.equal((await get("newCursorOnOld", nextPage(continued))).body, originalThird.body);
  const moved = originalSecond.json().tickets.find(ticket => !ticket.isArchived);
  const archived = originalThird.json().tickets.find(ticket => !ticket.isArchived && ticket.id !== moved.id);
  assert(moved && archived);
  const storedPosition = await patch("positionOnOld", "/api/tickets/" + moved.id + "/position", { laneId: moved.laneId, position: 0 });
  assert.equal(storedPosition.position, 0);
  const storedArchive = await patch("archiveOnOld", "/api/tickets/" + archived.id, { isArchived: true });
  assert.equal(storedArchive.isArchived, true);
  await get("staleOnOld", afterFirst, 409);
  snapshots.rollbackAfterWrite = snapshot();
  await close();

  await open("reopenAfterWrites", "current");
  snapshots.reopenAfterWrites = snapshot();
  assert.deepEqual(snapshots.reopenAfterWrites, {
    ...snapshots.rollbackAfterWrite, schemaVersion: snapshots.rollbackAfterWrite.schemaVersion + routineSchemaChanges,
  });
  const resultPosition = (await get("readStoredPosition", "/api/tickets/" + moved.id)).json();
  assert.equal(resultPosition.position, storedPosition.position);
  assert.equal(resultPosition.laneId, storedPosition.laneId);
  const resultArchive = (await get("readStoredArchive", "/api/tickets/" + archived.id)).json();
  assert.equal(resultArchive.isArchived, true);
  await get("staleOnNew", afterFirst, 409);
  console.log(changedNames.length, "legacy triggers replaced; restart schema changes match control:", routineSchemaChanges, "; rollback, save, cursor and readback verified");
} finally {
  if (app) await close();
  await rm(work, { recursive: true, force: true });
  const reduced = Object.fromEntries(Object.entries(snapshots).map(([label, { triggers, ...snapshot }]) => [label, {
    ...snapshot, triggerCount: Object.keys(triggers).length,
    triggerHash: createHash("sha256").update(JSON.stringify(triggers)).digest("hex"),
  }]));
  await writeFile(resolve(output, "trigger-upgrade.json"), JSON.stringify({ changedNames, timings, snapshots: reduced, statuses }, null, 2) + "\n");
}
