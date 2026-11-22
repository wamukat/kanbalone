import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import Database from 'better-sqlite3';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.env.KANBALONE_RENDER_REPO ?? path.join(evidenceDir, '../../../..'));
const out = path.resolve(process.env.KANBALONE_RENDER_OUTPUT ?? path.join(repo, 'coverage/tag-render-perf'));
mkdirSync(out, { recursive: true });
const source = path.join(out, 'archive-source.sqlite');
const archivedFixture = path.join(evidenceDir, '../2026-11-22-group-inline-icons/fixture.sqlite.gz');
const fixtureBytes = gunzipSync(readFileSync(archivedFixture));
writeFileSync(source, fixtureBytes, { flag: 'wx' });
const { KanbanDb } = await import(pathToFileURL(path.join(repo, 'src/db.ts')));
const archiveSha256 = createHash('sha256').update(fixtureBytes).digest('hex');
const fixtures = [];

function makeCopy(key, view, boardId, configure) {
  const dbFile = path.join(out, key + '.sqlite');
  assert(!existsSync(dbFile), 'Refusing to replace fixture ' + dbFile);
  copyFileSync(source, dbFile);
  const db = new Database(dbFile);
  db.pragma('foreign_keys=ON');
  db.transaction(() => {
    db.prepare('DELETE FROM tickets WHERE board_id <> ?').run(boardId);
    db.prepare('DELETE FROM boards WHERE id <> ?').run(boardId);
    configure(db);
  })();
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const board = db.prepare('SELECT id, name FROM boards WHERE id = ?').get(boardId);
  const counts = db.prepare(
    'SELECT count(*) total, sum(is_resolved) resolved, sum(is_archived) archived, sum(group_id IS NULL) ungrouped FROM tickets WHERE board_id = ?',
  ).get(boardId);
  const lanes = db.prepare(
    'SELECT id, name, is_completion_lane completion FROM lanes WHERE board_id = ? ORDER BY position',
  ).all(boardId);
  let ids;
  if (view === 'group') {
    const group = db.prepare('SELECT id FROM groups WHERE board_id=? LIMIT 1').get(boardId);
    const sortRows = (a, b) => b.priority - a.priority || a.id - b.id;
    const rows = db.prepare(
      'SELECT id, parent_ticket_id parent, priority, is_archived archived FROM tickets WHERE board_id = ? AND group_id IS ?',
    ).all(boardId, group?.id ?? null);
    const present = new Set(rows.map((row) => row.id));
    const children = new Map();
    for (const row of rows) {
      if (row.parent === null || row.archived) continue;
      if (!children.has(row.parent)) children.set(row.parent, []);
      children.get(row.parent).push(row);
    }
    ids = rows.filter((row) => !present.has(row.parent)).sort(sortRows).flatMap((row) => {
      const family = (children.get(row.id) ?? []).sort(sortRows);
      return row.archived && !family.length ? [] : [row.id, ...family.map((child) => child.id)];
    });
  } else {
    const visibleByLane = db.prepare(
      'SELECT id, is_resolved resolved, is_archived archived, resolved_at resolvedAt, position FROM tickets WHERE lane_id = ? AND NOT is_archived ORDER BY position, id',
    );
    for (const lane of lanes) {
      const rows = visibleByLane.all(lane.id);
      if (lane.completion) {
        rows.sort((a, b) => (Date.parse(b.resolvedAt)||0) - (Date.parse(a.resolvedAt)||0) || a.position - b.position || b.id - a.id);
      } else {
        assert(rows.every((row) => !row.resolved), 'Fixture requires active-only non-completion lanes');
      }
      lane.ticketIds = (lane.completion ? rows.slice(0, 5) : rows).map((row) => row.id);
    }
    ids = lanes.flatMap((lane) => lane.ticketIds);
  }
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
  fixtures.push({ key, view, board, counts, lanes, ids, dbFile });
}

function removeExtraCandidates(db) {
  db.prepare('DELETE FROM tickets WHERE group_id IS NULL').run();
}
function addRealisticGroupTags(db, boardId) {
  const tags = [
    ['planning-short', '#CCA93C'],
    ['組み合わせ 👩🏽‍💻 現場における作業手順の照合と次回の優先順位の確認', '#37299E'],
    ['cafe\u0301 👨‍👩‍👧‍👦 🇯🇵 — metadata across languages & releases', null],
  ];
  const insertTag = db.prepare('INSERT INTO tags(board_id,name,color) VALUES (?,?,?)');
  const applyTag = db.prepare(
    'INSERT INTO ticket_tags(ticket_id,tag_id) SELECT id,? FROM tickets WHERE board_id=? AND id%?=0',
  );
  tags.forEach(([name, color], index) => {
    const { lastInsertRowid } = insertTag.run(boardId, name, color ?? '');
    applyTag.run(lastInsertRowid, boardId, [4, 61, 83][index]);
  });
  const title = 'Review notification delivery, connection retries, prioritization and follow-up across locales — ';
  db.prepare('UPDATE tickets SET title = ? || title WHERE board_id=? AND (id%79=0 OR id=(SELECT MAX(id) FROM tickets WHERE group_id IS NOT NULL))')
    .run(title.repeat(3), boardId);
  db.prepare('UPDATE tickets SET title = title || ? WHERE id=(SELECT MAX(id) FROM tickets WHERE group_id IS NOT NULL)')
    .run(' find-marker-7a91');
}

for (const [boardId, size] of [[1, 1000], [2, 10000]]) {
  makeCopy('group-' + size, 'group', boardId, (db) => addRealisticGroupTags(db, boardId));
  makeCopy('ungrouped-' + size, 'group', boardId, (db) => {
    removeExtraCandidates(db);
    addRealisticGroupTags(db, boardId);
    db.prepare('UPDATE tickets SET group_id = NULL').run();
    db.prepare('DELETE FROM groups').run();
  });
  makeCopy('kanban-' + size, 'kanban', boardId, removeExtraCandidates);
}

const highKey = 'kanban-high-active';
const highDbFile = path.join(out, highKey + '.sqlite');
assert(!existsSync(highDbFile), 'Refusing to replace fixture ' + highDbFile);
const store = new KanbanDb(highDbFile);
const { board, lanes } = store.createBoard({
  name: 'Kanban activity lab',
  laneNames: ['Triage', 'Todo', 'Investigate', 'Doing', 'Review', 'Acceptance'],
});
const done = store.createLane({ boardId: board.id, name: 'Done', isCompletionLane: true });
const tag = store.createTag({ boardId: board.id, name: 'engineering', color: '#557766' });
store.close();
const highDb = new Database(highDbFile);
highDb.pragma('foreign_keys=ON');
const insert = highDb.prepare(
  'INSERT INTO tickets(id,board_id,lane_id,position,title,body_markdown,is_resolved,is_archived,priority,created_at,updated_at,resolved_at,parent_ticket_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
);
const restoreResolvedTime = highDb.prepare('UPDATE tickets SET resolved_at = ? WHERE id = ?');
const tagTicket = highDb.prepare('INSERT INTO ticket_tags(ticket_id,tag_id) VALUES (?,?)');
const insertBlocker = highDb.prepare('INSERT INTO ticket_blockers(ticket_id,blocker_ticket_id) VALUES (?,?)');
highDb.transaction(() => {
  for (let id = 1; id <= 3200; id++) {
    const resolved = id > 3000;
    const lane = resolved ? done : lanes[(id - 1) % lanes.length];
    const time = new Date(Date.UTC(2026, 10, 22, 0, 0, id)).toISOString();
    const title = id % 97 === 0
      ? 'Plan the phased rollout and verify retry history in the selected locale. '.repeat(3) + id
      : 'Verify retry and delivery history ' + id;
    insert.run(
      id, board.id, lane.id, resolved ? id - 3001 : Math.floor((id - 1) / lanes.length),
      title, 'Synthetic notification work. Verify retry behavior and delivery history. '.repeat(8).slice(0, 500),
      Number(resolved), 0, id % 4 + 1, time, time, resolved ? time : null, id % 100 === 2 ? id - 1 : null,
    );
    if (resolved) restoreResolvedTime.run(time, id);
    tagTicket.run(id, tag.id);
    if (id % 110 === 3) insertBlocker.run(id, id - 2);
  }
})();
assert.deepEqual(highDb.pragma('foreign_key_check'), []);
highDb.pragma('wal_checkpoint(TRUNCATE)');
highDb.close();
const highLanes = [...lanes, done].map((lane, laneIndex) => ({
  id: lane.id, name: lane.name, completion: Number(lane.isCompletionLane),
  ticketIds: lane.isCompletionLane
    ? [3200, 3199, 3198, 3197, 3196]
    : Array.from({ length: 500 }, (_, offset) => offset * lanes.length + laneIndex + 1),
}));
fixtures.push({
  key: highKey, view: 'kanban', board, counts: { total: 3200, resolved: 200, archived: 0, ungrouped: 3200 },
  lanes: highLanes, ids: highLanes.flatMap((lane) => lane.ticketIds), dbFile: highDbFile,
});
for (const fixture of fixtures) {
  const expected = {
    'group-1000': 1000, 'group-10000': 10000, 'ungrouped-1000': 1000, 'ungrouped-10000': 10000,
    'kanban-1000': 313, 'kanban-10000': 3013, 'kanban-high-active': 3005,
  };
  assert.equal(fixture.ids.length, expected[fixture.key], fixture.key);
}
writeFileSync(path.join(out, 'fixtures.json'), JSON.stringify({ archiveSha256, fixtures }, null, 2) + '\n');
