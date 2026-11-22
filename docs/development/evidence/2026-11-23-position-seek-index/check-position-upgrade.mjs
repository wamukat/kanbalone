import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-position-upgrade-"));
const file = resolve(work, "copied-existing.sqlite");
const sources = { old: resolve(process.argv[2]), current: resolve(process.argv[3]) };
const snapshots = {};
const collection = "/api/boards/2/tickets?order=position_asc&archived=all&limit=200";
const index = "tickets_paging_position_idx";
const timings = {};
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
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const hash = createHash("sha256");
    for (const { name } of tables) {
      const safeName = '"' + name.replaceAll('"', '""') + '"';
      hash.update(JSON.stringify([name, db.prepare(`SELECT * FROM ${safeName}`).all().map(row => JSON.stringify(row)).sort()]));
    }
    return {
      rows: hash.digest("hex"),
      bytes: db.pragma("page_count", { simple: true }) * db.pragma("page_size", { simple: true }),
      integrity: db.pragma("integrity_check", { simple: true }),
      foreignKeyErrors: db.pragma("foreign_key_check").length,
      indexes: db.prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name=?").all(index).length,
      indexColumns: db.pragma(`index_info(${index})`).map(field => field.name),
    };
  } finally {
    db.close();
  }
}

async function page(url, expected = 200) {
  const response = await app.inject(url);
  assert.equal(response.statusCode, expected, response.body);
  return response;
}

await copyFile(resolve(output, "fixture.sqlite"), file);
try {
  await open("existing", "old");
  snapshots.existing = snapshot();
  assert.equal(snapshots.existing.indexes, 0);
  const first = await page(collection);
  const afterFirst = collection + "&cursor=" + encodeURIComponent(first.json().page.nextCursor);
  const originalSecond = await page(afterFirst);
  const afterSecond = collection + "&cursor=" + encodeURIComponent(originalSecond.json().page.nextCursor);
  const originalThird = await page(afterSecond);
  await close();

  await open("upgrade", "current");
  snapshots.upgrade = snapshot();
  assert.equal(snapshots.upgrade.rows, snapshots.existing.rows);
  assert.equal(snapshots.upgrade.indexes, 1);
  assert.deepEqual(snapshots.upgrade.indexColumns, ["board_id", "lane_id", "is_archived", "position", "id"]);
  const continued = await page(afterFirst);
  assert.equal(continued.body, originalSecond.body);
  assert.equal(continued.headers["x-kanbalone-ticket-revision"], first.headers["x-kanbalone-ticket-revision"]);
  await close();

  await open("secondStartup", "current");
  snapshots.secondStartup = snapshot();
  assert.deepEqual(snapshots.secondStartup, snapshots.upgrade);
  assert.equal((await page(afterFirst)).body, continued.body);
  await close();

  await open("rollback", "old");
  snapshots.rollback = snapshot();
  assert.deepEqual(snapshots.rollback, snapshots.upgrade);
  assert.equal((await page(collection + "&cursor=" + encodeURIComponent(continued.json().page.nextCursor))).body, originalThird.body);
  const ticket = originalSecond.json().tickets[9];
  assert(!ticket.isArchived);
  const positionResponse = await app.inject({
    method: "PATCH", url: `/api/tickets/${ticket.id}/position`, payload: { laneId: ticket.laneId, position: 0 },
  });
  assert.equal(positionResponse.statusCode, 200, positionResponse.body);
  const moved = positionResponse.json();
  assert.equal(moved.position, 0);
  await close();

  await open("reopenAfterWrite", "current");
  const persisted = (await page(`/api/tickets/${ticket.id}`)).json();
  assert.equal(persisted.position, moved.position);
  assert.equal(persisted.laneId, moved.laneId);
  await page(afterFirst, 409);
  snapshots.reopenAfterWrite = snapshot();
  for (const state of Object.values(snapshots)) {
    assert.equal(state.integrity, "ok");
    assert.equal(state.foreignKeyErrors, 0);
  }
  console.log("Existing DB upgraded, repeated startup, rollback, persisted position write, and cursor compatibility verified");
} finally {
  if (app) await close();
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, "position-upgrade.json"), JSON.stringify({ timings, snapshots }, null, 2) + "\n");
}
