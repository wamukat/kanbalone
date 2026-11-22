import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const output = resolve("coverage/subsecond-data");
const variants = ["control", "tuple-only", "index-only", "tuple-and-index"];
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-seek-write-"));
const iterations = Number(process.env.SUBSECOND_SAMPLES ?? 4);
const batches = Number(process.env.SUBSECOND_WRITE_BATCHES ?? 3);
const records = [];
const equivalent = new Map();
const boardId = 2;

function storedState(dbFile) {
  const db = new Database(dbFile, { readonly: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    const hash = createHash("sha256");
    for (const { name } of tables) {
      const safeName = '"' + name.replaceAll('"', '""') + '"';
      const rows = db.prepare(`SELECT * FROM ${safeName}`).all().map(row => JSON.stringify(row)).sort();
      hash.update(JSON.stringify([name, rows]));
    }
    const targets = db.prepare(`SELECT id, lane_id FROM tickets t WHERE board_id = ? AND is_archived = 0
      AND is_resolved = 0 AND parent_ticket_id IS NULL AND NOT EXISTS (SELECT 1 FROM tickets WHERE parent_ticket_id=t.id)
      ORDER BY lane_id, id LIMIT ?`).all(boardId, batches * 3);
    return {
      hash: hash.digest("hex"),
      pageBytes: db.pragma("page_count", { simple: true }) * db.pragma("page_size", { simple: true }),
      integrity: db.pragma("quick_check", { simple: true }),
      foreignKeyErrors: db.pragma("foreign_key_check").length,
      index: db.prepare("SELECT sql FROM sqlite_schema WHERE name='tickets_paging_position_idx'").pluck().get() ?? null,
      activeLaneSizes: db.prepare("SELECT lane_id, COUNT(*) AS count FROM tickets WHERE board_id=? AND is_archived=0 GROUP BY lane_id ORDER BY lane_id").all(boardId),
      targets,
    };
  } finally {
    db.close();
  }
}

async function sample(run, variant) {
  const source = resolve(output, "seek-variants", variant);
  const dbFile = resolve(work, `${run}-${variant}.sqlite`);
  await copyFile(resolve(output, "fixture.sqlite"), dbFile);
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const started = performance.now();
  const app = buildApp({ dbFile, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  await app.ready();
  const startupMs = performance.now() - started;
  const { targets, ...state } = storedState(dbFile);
  const operations = [];
  const timing = {};
  assert.equal(state.integrity, "ok");
  assert.equal(state.foreignKeyErrors, 0);
  assert.equal(targets.length, batches * 3);
  async function write(method, url, payload, expected, kind) {
    const since = performance.now();
    const response = await app.inject({ method, url, payload });
    assert.equal(response.statusCode, expected, response.body);
    const ticket = response.json();
    (timing[kind] ??= []).push(performance.now() - since);
    operations.push({ kind, id: ticket.id, laneId: ticket.laneId, isArchived: ticket.isArchived,
      priority: ticket.priority, position: ticket.position, title: ticket.title });
    return ticket;
  }
  try {
    for (let i = 0; i < batches; i += 1) {
      const [title, position, archive] = targets.slice(i * 3, i * 3 + 3);
      await write("POST", `/api/boards/${boardId}/tickets`, {
        title: `Synthetic new ticket ${i}`, laneId: title.lane_id,
      }, 201, "create");
      await write("PATCH", `/api/tickets/${title.id}`, {
        title: `Synthetic updated ticket ${i}`, priority: i % 4 + 1,
      }, 200, "edit");
      await write("PATCH", `/api/tickets/${position.id}/position`, {
        position: 0, laneId: position.lane_id,
      }, 200, "reorder");
      await write("PATCH", `/api/tickets/${archive.id}`, { isArchived: true }, 200, "archive");
    }
    const writesHash = createHash("sha256").update(JSON.stringify(operations)).digest("hex");
    const after = storedState(dbFile);
    assert.equal(after.integrity, "ok");
    assert.equal(after.foreignKeyErrors, 0);
    const expected = { startupRows: state.hash, writesHash };
    if (!equivalent.has(run)) equivalent.set(run, expected);
    assert.deepEqual(expected, equivalent.get(run));
    return { variant, run, startupMs, state, writesHash, timing, finalPageBytes: after.pageBytes };
  } finally {
    await app.close();
  }
}

try {
  for (let run = 0; run < iterations; run += 1) {
    const rotated = variants.map((_variant, offset) => variants[(run + offset) % variants.length]);
    for (const variant of rotated) {
      const record = await sample(run, variant);
      records.push(record);
      console.log(run, variant, record.startupMs.toFixed(1), record.state.pageBytes, record.writesHash);
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, "seek-write-cost.json"), JSON.stringify({ runtime: process.version, records }, null, 2) + "\n");
}
