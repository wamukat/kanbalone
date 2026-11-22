import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-revision-equivalence-"));
const sources = [["control", resolve(process.argv[2])], ["indexed", resolve(process.argv[3])]];
const results = {};

async function verify(name, source) {
  const file = resolve(work, name + ".sqlite");
  const { KanbanDb } = await import(pathToFileURL(resolve(source, "src/db.ts")));
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const db = new KanbanDb(file);
  const sqlite = db.sqlite;
  const exec = (statement, ...parameters) => sqlite.prepare(statement).run(...parameters);
  const app = buildApp({ dbFile: file, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  try {
    const boards = ["A", "B", "C", "D", "Untouched"].map(name => db.createBoard({ name, laneNames: ["Work", "Done"] }));
    const ids = boards.map(({ board, lanes }) => [1, 2, 3, 4]
      .map(index => db.createTicket({ boardId: board.id, laneId: lanes[0].id, title: board.name + index }).id));
    const [[a1, a2, a3], [b1, , b3], [c1, c2, c3], [d1, d2]] = ids;
    const timestamp = "2026-11-22T10:00:00.000Z";
    exec("UPDATE tickets SET created_at=?,updated_at=?", timestamp, timestamp);
    exec("UPDATE boards SET created_at=?,updated_at=?", timestamp, timestamp);
    exec("UPDATE ticket_cursor_secret SET secret=? WHERE id=1", "ab".repeat(32));
    exec("UPDATE tickets SET parent_ticket_id=? WHERE id=?", b1, a1);
    exec("UPDATE tickets SET parent_ticket_id=? WHERE id=?", a2, c1);
    exec("INSERT INTO ticket_blockers(ticket_id,blocker_ticket_id) VALUES(?,?),(?,?)", c2, a1, c3, a1);
    exec("INSERT INTO ticket_related_links(ticket_id,related_ticket_id) VALUES(?,?),(?,?)", a1, c3, b3, d2);
    const tag = db.createTag({ boardId: boards[0].board.id, name: "Synthetic metadata", color: "#112233" });
    const doneLane = boards[0].lanes[1].id;
    exec("UPDATE lanes SET is_completion_lane=1 WHERE id=?", doneLane);
    const cases = [
      { label: "position and timestamp", change: () => exec("UPDATE tickets SET position=17,updated_at=? WHERE id=?", "2026-11-22T15:00:00.000Z", a1) },
      { label: "no-op", change: () => exec("UPDATE tickets SET position=position WHERE id=?", a1) },
      { label: "cross-board parent cleared", change: () => exec("UPDATE tickets SET parent_ticket_id=NULL WHERE id=?", a1) },
      { label: "cross-board parent changed", change: () => exec("UPDATE tickets SET parent_ticket_id=? WHERE id=?", d1, a1) },
      { label: "blocker lookup reverse direction", change: () => exec("UPDATE tickets SET title='Changed blocker' WHERE id=?", a1) },
      { label: "blocker update dependent side", change: () => exec("UPDATE tickets SET title='Changed dependent' WHERE id=?", c2) },
      { label: "related lookup high side", change: () => exec("UPDATE tickets SET title='Changed related' WHERE id=?", d2) },
      { label: "related lookup low side", change: () => exec("UPDATE tickets SET title='Changed related' WHERE id=?", b3) },
      { label: "blocker inserted", change: () => exec("INSERT INTO ticket_blockers VALUES(?,?)", a2, d1) },
      { label: "blocker deleted", change: () => exec("DELETE FROM ticket_blockers WHERE ticket_id=? AND blocker_ticket_id=?", a2, d1) },
      { label: "related inserted", change: () => exec("INSERT INTO ticket_related_links VALUES(?,?)", a3, d1) },
      { label: "related deleted", change: () => exec("DELETE FROM ticket_related_links WHERE ticket_id=? AND related_ticket_id=?", a3, d1) },
      { label: "tag attached", change: () => exec("INSERT INTO ticket_tags VALUES(?,?)", a1, tag.id) },
      { label: "tag reason attached", change: () => exec("INSERT INTO ticket_tag_reasons(ticket_id,tag_id,reason,updated_at) VALUES(?,?,?,?)", a1, tag.id, "Synthetic reason", timestamp) },
      { label: "tag reason changed", change: () => exec("UPDATE ticket_tag_reasons SET reason='Changed reason' WHERE ticket_id=?", a1) },
      { label: "tag detached with reason cascade", change: () => exec("DELETE FROM ticket_tags WHERE ticket_id=? AND tag_id=?", a1, tag.id) },
      { label: "remote link inserted", change: () => exec(`INSERT INTO ticket_remote_links
        (ticket_id,provider,instance_url,project_key,issue_key,display_ref,remote_url,remote_title,created_at,updated_at,last_synced_at)
        VALUES(?,'github','https://example.test','owner/repo','1','#1','https://example.test/1','Remote title',?,?,?)`,
      a1, timestamp, timestamp, timestamp) },
      { label: "external reference inserted", change: () => exec(`INSERT INTO ticket_external_references
        (ticket_id,kind,provider,instance_url,project_key,issue_key,display_ref,remote_url,created_at,updated_at)
        VALUES(?,'issue','github','https://example.test','owner/repo','2','#2','https://example.test/2',?,?)`, a1, timestamp, timestamp) },
      { label: "external reference deleted", change: () => exec("DELETE FROM ticket_external_references WHERE ticket_id=?", a1) },
      { label: "board and lane moved", change: () => exec("UPDATE tickets SET board_id=?,lane_id=? WHERE id=?", boards[3].board.id, boards[3].lanes[0].id, a1) },
      { label: "cascade delete", change: () => exec("DELETE FROM tickets WHERE id=?", a2) },
      { label: "relation cascade delete", change: () => exec("DELETE FROM tickets WHERE id=?", b3) },
      { label: "completion insert with nested updates", change: () => {
        const inserted = exec(`INSERT INTO tickets(board_id,lane_id,title,position,created_at,updated_at)
          VALUES(?,?,?,0,?,?)`, boards[0].board.id, doneLane, "Completion trigger fixture", timestamp, timestamp);
        const completed = sqlite.prepare("SELECT is_resolved,resolved_at FROM tickets WHERE id=?").get(inserted.lastInsertRowid);
        assert.equal(completed.is_resolved, 1);
        assert(completed.resolved_at);
      } },
      { label: "transaction rolled back", change: () => assert.throws(sqlite.transaction(() => {
        exec("UPDATE tickets SET position=42 WHERE id=?", a1);
        throw new Error("Synthetic rollback");
      }), /Synthetic rollback/) },
    ];
    const everyRevision = sqlite.prepare("SELECT board_id,revision FROM ticket_list_revisions ORDER BY board_id");
    const dataset = [];
    for (const { label, change } of cases) {
      const before = everyRevision.all();
      const pages = await Promise.all(boards.map(async ({ board }) => {
        const url = `/api/boards/${board.id}/tickets?limit=1&order=position_asc`;
        const response = await app.inject(url);
        assert.equal(response.statusCode, 200);
        const cursor = response.json().page.nextCursor;
        assert(cursor);
        return { url, before: response.body, cursor };
      }));
      change();
      const after = everyRevision.all();
      const deltas = after.map((r, index) => r.revision - before[index].revision);
      assert.equal(deltas.at(-1), 0, label + " leaves the unrelated board unchanged");
      const responses = await Promise.all(pages.map(async ({ url, cursor }, index) => {
        const result = await app.inject(url + "&cursor=" + encodeURIComponent(cursor));
        assert.equal(result.statusCode, deltas[index] ? 409 : 200, label);
        return result.body;
      }));
      dataset.push({ label, before, after, deltas, pages: pages.map(page => page.before), responses });
    }
    assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
    return dataset;
  } finally {
    await app.close();
    db.close();
  }
}

try {
  for (const [name, source] of sources) results[name] = await verify(name, source);
  assert.deepEqual(results.indexed, results.control);
  console.log(results.control.length, "DML cases with exact revision vectors and cursor/response bytes in all boards");
} finally {
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, "indexed-revision-equivalence.json"), JSON.stringify(results, null, 2) + "\n");
}
