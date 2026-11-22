import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-lane-writes-"));
const sources = { before: resolve(process.argv[2]), after: resolve(process.argv[3]) };
const { KanbanDb } = await import(pathToFileURL(resolve(sources.before, "src/db.ts")));
const builds = Object.fromEntries(await Promise.all(
  Object.entries(sources).map(async ([version, source]) => [
    version, (await import(pathToFileURL(resolve(source, "src/app.ts")))).buildApp,
  ]),
));
const sizes = process.env.SUBSECOND_LANE_SIZES?.split(",").map(Number) ?? [3000];
const requested = process.env.SUBSECOND_WRITE_CASES?.split(",");
const repeats = Number(process.env.SUBSECOND_WRITE_REPEATS ?? 5);
const records = [];

function seed(file, size) {
  const db = new KanbanDb(file);
  try {
    const { board, lanes } = db.createBoard({ name: "Synthetic lane size " + size, laneNames: ["Work", "Review"] });
    const since = "2026-11-22T00:00:00.000Z";
    // These rows are a new synthetic fixture. Normal DB startup restores the insert trigger
    // on each cloned database before any measured operation.
    db.sqlite.exec("DROP TRIGGER IF EXISTS ticket_list_tickets_insert");
    const insert = db.sqlite.prepare(`INSERT INTO tickets
      (board_id,lane_id,title,body_markdown,is_archived,priority,position,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?)`);
    const allIds = db.sqlite.transaction(() => lanes.map(lane => {
      const ids = [];
      for (let index = 0; index < size + 5; index += 1) {
        const { lastInsertRowid } = insert.run(board.id, lane.id, `Synthetic ticket ${lane.id}-${index}`,
          "Lane persistence fixture", Number(index >= size), index % 4 + 1, index, since, since);
        ids.push(Number(lastInsertRowid));
      }
      return ids;
    }))();
    return { boardId: board.id, sourceLane: lanes[0].id, destinationLane: lanes[1].id, activeIds: allIds[0].slice(0, size), targets: allIds[1] };
  } finally {
    db.close();
  }
}

function actions(fixture) {
  const { activeIds, sourceLane, destinationLane, targets } = fixture;
  const first = activeIds[0], last = activeIds.at(-1), middle = activeIds[Math.floor(activeIds.length / 2)];
  return [
    { name: "edit", id: middle, patch: { title: "Synthetic edited title" } },
    { name: "adjacent", id: first, position: { laneId: sourceLane, afterTicketId: activeIds[1] }, at: 1 },
    { name: "last-to-first", id: last, position: { laneId: sourceLane, position: 0 }, at: 0 },
    { name: "cross-lane", id: middle, position: { laneId: destinationLane, beforeTicketId: targets[0] }, at: 0 },
    { name: "archive-first", id: first, patch: { isArchived: true } },
    { name: "archive-last", id: last, patch: { isArchived: true } },
  ].filter(action => !requested || requested.includes(action.name));
}

function verifyTicket(ticket, action) {
  if (action.position) {
    assert.equal(ticket.laneId, action.position.laneId);
    assert.equal(ticket.position, action.at);
  } else {
    for (const [key, value] of Object.entries(action.patch)) assert.equal(ticket[key], value);
  }
}


async function collect(file, version, fixture, action) {
  const app = builds[version]({
    dbFile: file, staticDir: resolve(sources[version], "public"),
    remoteCredentialProviders: [], remoteCredentialScopes: [],
  });
  try {
    await app.ready();
    const ticketUrl = "/api/tickets/" + action.id;
    const collection = "/api/boards/" + fixture.boardId + "/tickets?order=position_asc&limit=1";
    const before = await app.inject(collection);
    assert.equal(before.statusCode, 200, before.body);
    const { nextCursor } = before.json().page;
    assert(nextCursor);
    const continuation = collection + "&cursor=" + encodeURIComponent(nextCursor);
    assert.equal((await app.inject(continuation)).statusCode, 200);
    const start = performance.now();
    const response = await app.inject({
      method: "PATCH", url: ticketUrl + (action.position ? "/position" : ""), payload: action.position ?? action.patch,
    });
    const apiMs = performance.now() - start;
    assert.equal(response.statusCode, 200, response.body);
    verifyTicket(response.json(), action);
    const stored = await app.inject(ticketUrl);
    assert.equal(stored.statusCode, 200);
    verifyTicket(stored.json(), action);
    const stale = await app.inject(continuation);
    assert.equal(stale.statusCode, 409, stale.body);
    const updated = await app.inject(collection);
    assert.equal(updated.statusCode, 200, updated.body);
    const { id, laneId, position, isArchived, title } = stored.json();
    const fields = { id, laneId, position, isArchived, title };
    const revisionDelta = Number(updated.headers["x-kanbalone-ticket-revision"]) - Number(before.headers["x-kanbalone-ticket-revision"]);
    assert(revisionDelta > 0);
    return { apiMs, fields, revisionDelta, staleCursorStatus: stale.statusCode };
  } finally {
    await app.close();
  }
}

try {
  for (const size of sizes) {
    const seedFile = resolve(work, "seed-" + size + ".sqlite");
    const fixture = seed(seedFile, size);
    for (const action of actions(fixture)) {
      for (let pair = 0; pair <= repeats; pair += 1) {
        const versions = pair % 2 ? ["after", "before"] : ["before", "after"];
        const results = {};
        for (const version of versions) {
          const file = resolve(work, [size, action.name, pair, version].join("-") + ".sqlite");
          await copyFile(seedFile, file);
          results[version] = await collect(file, version, fixture, action);
          await rm(file);
        }
        assert.deepEqual(results.after.fields, results.before.fields);
        assert.equal(results.after.revisionDelta, results.before.revisionDelta);
        records.push({ size, action: action.name, pair, warmup: pair === 0, order: versions, ...results });
        console.log(size, action.name, pair, results.before.apiMs.toFixed(1), results.after.apiMs.toFixed(1), results.after.revisionDelta);
      }
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, "lane-write-production-paired.json"), JSON.stringify({ runtime: process.version, records }, null, 2) + "\n");
}
