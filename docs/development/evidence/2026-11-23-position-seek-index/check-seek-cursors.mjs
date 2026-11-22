import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-seek-cursors-"));
const variants = ["control", "tuple-only", "index-only", "tuple-and-index"];
const apps = new Map();
const boardId = 2;
const edge = "unique synthetic seek boundary";
const cases = [
  { order: "position_asc", archived: "all" },
  { order: "position_asc", archived: "true" },
  { order: "position_asc", archived: "false", resolved: "false" },
  { order: "position_asc", archived: "all", lane_id: "5" },
  { order: "position_asc", lane_id: "5", priority: "1,3" },
  { order: "completed_desc", archived: "all" },
  { order: "id_asc", archived: "all" },
];

function seed(dbFile) {
  const db = new Database(dbFile);
  try {
    const lanes = db.prepare("SELECT id FROM lanes WHERE board_id=? ORDER BY position,id").all(boardId);
    const find = db.prepare("SELECT id FROM tickets WHERE board_id=? AND lane_id=? ORDER BY id LIMIT 5");
    const patch = db.prepare(`UPDATE tickets SET title = ?, position = ?, priority = ?, is_archived = ?,
      parent_ticket_id = NULL, resolved_at = NULL WHERE id = ?`);
    db.transaction(() => {
      for (const { id: lane } of lanes) {
        const positions = [-1, 0, 0, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER];
        const targets = find.all(boardId, lane);
        assert.equal(targets.length, positions.length);
        targets.forEach(({ id }, index) => {
          patch.run(`${edge} ${id}`, positions[index], index % 4 + 1, index % 2, id);
        });
      }
    })();
    return db.prepare("SELECT secret FROM ticket_cursor_secret WHERE id=1").pluck().get();
  } finally {
    db.close();
  }
}

function pageUrl(target, filters, limit, cursor) {
  const params = new URLSearchParams({ q: edge, ...filters, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return `/api/boards/${boardId}/${target}?${params}`;
}

async function launch(variant) {
  const source = resolve(output, "seek-variants", variant);
  const dbFile = resolve(work, variant + ".sqlite");
  await copyFile(resolve(output, "fixture.sqlite"), dbFile);
  const secret = seed(dbFile);
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const app = buildApp({ dbFile, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  return { app, secret };
}

async function body(variant, request) {
  const response = await apps.get(variant).app.inject(request);
  assert.equal(response.statusCode, 200, response.body);
  return response.body;
}

const records = [];
try {
  for (const variant of variants) apps.set(variant, await launch(variant));
  const projections = [
    ["tickets", cases],
    ["list-ticket-references", cases.filter(filter => filter.order === "position_asc" && !filter.priority)],
  ];
  for (const [projection, filtersToCheck] of projections) {
    for (const filters of filtersToCheck) {
      const ids = [];
      const limits = [1, 2, 5, 2];
      let cursor = null;
      let validCursor;
      let page = 0;
      do {
        const request = pageUrl(projection, filters, limits[page % limits.length], cursor);
        const expected = await body("control", request);
        for (const variant of variants.slice(1)) assert.equal(await body(variant, request), expected, variant + ": " + request);
        const rows = JSON.parse(expected);
        ids.push(...rows.tickets.map(ticket => ticket.id));
        cursor = rows.page.nextCursor;
        validCursor ??= cursor;
        page += 1;
        assert(page < 100);
        if (!cursor) assert.equal(rows.page.total, ids.length);
      } while (cursor);
      assert.equal(new Set(ids).size, ids.length);
      assert(validCursor, "Several edges exercise continuation");

      // A correctly signed but invalid key shape must still fail at decoding.
      for (const invalidKey of [null, Number.MAX_SAFE_INTEGER + 1]) {
        const [encoded] = validCursor.split(".");
        const token = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
        token.keys[0] = invalidKey;
        const body = Buffer.from(JSON.stringify(token)).toString("base64url");
        const signature = createHmac("sha256", apps.get("control").secret).update(body).digest("base64url");
        for (const variant of variants) {
          const response = await apps.get(variant).app.inject(pageUrl(projection, filters, 2, body + "." + signature));
          assert.equal(response.statusCode, 400);
        }
      }
      records.push({ projection, filters, pages: page, ids });
    }
  }
  console.log(records.length, "filter and order cases, every page and cursor byte-identical");
} finally {
  for (const { app } of apps.values()) await app.close();
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, "seek-cursor-edges.json"), JSON.stringify(records, null, 2) + "\n");
}
