import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-seek-plans-"));
const variants = ["control", "tuple-only", "index-only", "tuple-and-index"];
const filters = {
  active: {},
  allArchives: { includeArchived: true },
  lane: { laneId: 5 },
  openByPriority: { resolved: false, priorities: [2, 4] },
  search: { q: "notification" },
};
const records = [];

try {
  for (const variant of variants) {
    const source = resolve(output, "seek-variants", variant);
    const filename = resolve(work, variant + ".sqlite");
    await copyFile(resolve(output, "fixture.sqlite"), filename);
    const { KanbanDb } = await import(pathToFileURL(resolve(source, "src/db.ts")));
    const db = new KanbanDb(filename);
    const prepare = db.sqlite.prepare.bind(db.sqlite);
    let trace;
    db.sqlite.prepare = sql => {
      const statement = prepare(sql);
      if (sql.includes(" AS cursor_key_0")) {
        const all = statement.all.bind(statement);
        statement.all = (...params) => {
          const plan = prepare("EXPLAIN QUERY PLAN " + sql).all(...params).map(row => row.detail);
          trace = { sql, plan };
          return all(...params);
        };
      }
      return statement;
    };
    try {
      for (const [label, filter] of Object.entries(filters)) {
        const first = db.listTicketPage(2, filter, { limit: 200, order: "position_asc" });
        const firstPlan = trace;
        assert(first.page?.nextCursor);
        db.listTicketPage(2, filter, { limit: 200, order: "position_asc", cursor: first.page.nextCursor });
        assert(trace);
        records.push({ variant, label, first: firstPlan, continuation: trace });
      }
    } finally {
      db.close();
    }
  }
} finally {
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, "seek-plans.json"), JSON.stringify(records, null, 2) + "\n");
}
