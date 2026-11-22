import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, release as osRelease, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';
import Database from 'better-sqlite3';
import { buildApp } from '../../../../src/app.ts';
import { KanbanDb } from '../../../../src/db.ts';
import { ticketFilterQuery } from '../../../../src/db-modules/ticket-queries.ts';

const source = resolve('docs/development/evidence/2026-11-22-candidate-fetch-order/fixture.sqlite.gz');
const output = resolve(process.argv[2] ?? 'coverage/relation-count/count-results.json');
const size = Number(process.argv[3] ?? '18');
assert(Number.isInteger(size) && size > 0 && size % 6 === 0, 'Run count must be a positive multiple of six');

const limit = 200;
const boards = [{ id: 1, total: 1005 }, { id: 2, total: 10005 }];
const cwd = mkdtempSync(join(tmpdir(), 'kanbalone-relation-count-'));
const dbFile = join(cwd, 'synthetic.sqlite');
const compressed = readFileSync(source);
const hash = value => createHash('sha256').update(value).digest('hex');
const rawPrepare = Database.prototype.prepare;
const countSql = ticketFilterQuery(1, { includeArchived: true }).sql.replace('SELECT t.*', 'SELECT COUNT(*) AS total');
const modes = [
  ['base', 'timed', 'reuse'],
  ['base', 'reuse', 'timed'],
  ['timed', 'base', 'reuse'],
  ['timed', 'reuse', 'base'],
  ['reuse', 'base', 'timed'],
  ['reuse', 'timed', 'base'],
];

function monitor(mode) {
  const stats = { executed: 0, skipped: 0, samples: [] };
  if (mode === 'base') return stats;
  let first;
  Database.prototype.prepare = function prepare(sql) {
    if (sql !== countSql) return rawPrepare.call(this, sql);
    if (mode === 'reuse' && first !== undefined) {
      stats.skipped++;
      return { get: () => first };
    }

    if (mode === 'reuse') {
      const statement = rawPrepare.call(this, sql);
      return { get(...args) {
        first = statement.get(...args);
        stats.executed++;
        return first;
      } };
    }

    const begin = performance.now();
    const statement = rawPrepare.call(this, sql);
    const prepared = performance.now();
    return { get(...args) {
      const getStart = performance.now();
      const result = statement.get(...args);
      const getEnd = performance.now();
      stats.executed++;
      stats.samples.push({ prepareMs: prepared - begin, getMs: getEnd - getStart });
      return result;
    } };
  };
  return stats;
}

function status(planDb) {
  return {
    sqlite: planDb.prepare('SELECT sqlite_version() AS version').get().version,
    workload: planDb.prepare(`SELECT board_id AS id, COUNT(*) AS total, SUM(is_archived) AS archived,
      SUM(is_resolved) AS resolved, SUM(parent_ticket_id IS NOT NULL) AS children
      FROM tickets GROUP BY board_id ORDER BY board_id`).all(),
    blockers: planDb.prepare(`SELECT t.board_id AS id, COUNT(*) AS count FROM ticket_blockers b
      JOIN tickets t ON t.id = b.ticket_id GROUP BY t.board_id ORDER BY t.board_id`).all(),
    plans: {
      count: planDb.prepare('EXPLAIN QUERY PLAN ' + countSql).all(2),
      pageFirst: planDb.prepare(`EXPLAIN QUERY PLAN SELECT t.id, t.title, t.parent_ticket_id, t.priority, t.is_resolved,
        t.id AS cursor_key_0 FROM tickets t WHERE t.board_id = ? ORDER BY t.id ASC LIMIT ?`).all(2, limit + 1),
      pageAfter: planDb.prepare(`EXPLAIN QUERY PLAN SELECT t.id, t.title, t.parent_ticket_id, t.priority, t.is_resolved,
        t.id AS cursor_key_0 FROM tickets t WHERE t.board_id = ? AND t.id > ? ORDER BY t.id ASC LIMIT ?`).all(2, 3000, limit + 1),
    },
  };
}

function measureClock() {
  const intervals = [];
  for (let i = 0; i < 10000; i++) {
    const start = performance.now();
    const end = performance.now();
    intervals.push(end - start);
  }
  return summary(intervals);
}

async function collect(request, board, mode, expected) {
  const stats = monitor(mode);
  const pageTimes = [];
  const pages = [];
  let cursor;
  let elapsed;
  try {
    const begin = performance.now();
    do {
      const pageBegin = performance.now();
      const page = await request(board.id, cursor);
      pageTimes.push(performance.now() - pageBegin);
      pages.push(page);
      cursor = page.page.nextCursor;
      assert(pages.length <= Math.ceil(board.total / limit));
    } while (cursor !== null);
    elapsed = performance.now() - begin;
  } finally {
    Database.prototype.prepare = rawPrepare;
  }

  const actual = pages.flatMap(page => page.tickets);
  assert.deepEqual(actual.map(ticket => ticket.id), expected);
  assert(pages.every(page => page.page.total === board.total));
  assert(pages.every(page => page.revision !== null && page.revision === pages[0].revision));
  assert.equal(pages.length, Math.ceil(board.total / limit));
  if (mode === 'timed') assert.equal(stats.executed, pages.length);
  if (mode === 'reuse') {
    assert.equal(stats.executed, 1);
    assert.equal(stats.skipped, pages.length - 1);
  }
  const countMs = stats.samples.map(sample => sample.prepareMs + sample.getMs);
  return {
    elapsedMs: elapsed,
    pageTimesMs: pageTimes,
    countSamples: stats.samples,
    countAllMs: countMs.length ? sum(countMs) : null,
    countLaterMs: countMs.length ? sum(countMs.slice(1)) : null,
    countsExecuted: mode === 'base' ? null : stats.executed,
    countsSkipped: mode === 'base' ? null : stats.skipped,
    // Cursors, revisions, totals and all six fields must remain byte-equivalent within each layer.
    outputSha256: hash(JSON.stringify(pages)),
  };
}

const sum = values => values.reduce((a, b) => a + b, 0);
function summary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle],
    min: sorted[0],
    max: sorted.at(-1),
  };
}

function boardSummary(trials) {
  const group = mode => trials.map(row => row[mode]);
  const timed = group('timed');
  return {
    collectionMs: Object.fromEntries(modes[0].map(mode => [mode, summary(group(mode).map(sample => sample.elapsedMs))])),
    baseFirstPageMs: summary(group('base').map(sample => sample.pageTimesMs[0])),
    baseLaterPageMedianMs: summary(group('base').map(sample => summary(sample.pageTimesMs.slice(1)).median)),
    countPreparePerPageMs: summary(timed.map(sample => summary(sample.countSamples.map(count => count.prepareMs)).median)),
    countGetPerPageMs: summary(timed.map(sample => summary(sample.countSamples.map(count => count.getMs)).median)),
    countAllMs: summary(timed.map(sample => sample.countAllMs)),
    countLaterMs: summary(timed.map(sample => sample.countLaterMs)),
    countAllShareOfUntimed: summary(trials.map(sample => sample.timed.countAllMs / sample.base.elapsedMs)),
    countLaterShareOfUntimed: summary(trials.map(sample => sample.timed.countLaterMs / sample.base.elapsedMs)),
    instrumentationElapsedDeltaMs: summary(trials.map(sample => sample.timed.elapsedMs - sample.base.elapsedMs)),
    reuseElapsedDeltaMs: summary(trials.map(sample => sample.base.elapsedMs - sample.reuse.elapsedMs)),
    reuseElapsedDeltaShare: summary(trials.map(sample => (sample.base.elapsedMs - sample.reuse.elapsedMs) / sample.base.elapsedMs)),
  };
}

let db;
let app;
try {
  writeFileSync(dbFile, gunzipSync(compressed), { flag: 'wx', mode: 0o600 });
  db = new KanbanDb(dbFile);
  const fixture = status(db.sqlite);
  const expect = new Map(boards.map(board => {
    const ids = db.sqlite.prepare('SELECT id FROM tickets WHERE board_id = ? ORDER BY id').pluck().all(board.id);
    assert.equal(ids.length, board.total);
    return [board.id, ids];
  }));
  app = buildApp({ dbFile, staticDir: resolve('public'), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const calls = {
    direct: (boardId, cursor) => db.listTicketRelationCandidatePage(boardId, { limit, cursor }),
    loopback: async (boardId, cursor) => {
      const url = new URL('/api/boards/' + boardId + '/relation-candidates', base);
      url.searchParams.set('limit', String(limit));
      if (cursor !== undefined) url.searchParams.set('cursor', cursor);
      const response = await fetch(url);
      assert.equal(response.status, 200);
      const { tickets, page } = await response.json();
      return { tickets, page, revision: response.headers.get('x-kanbalone-ticket-revision') };
    },
  };
  const result = {
    startedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      os: osRelease(),
      parallelism: availableParallelism(),
      cpu: cpus()[0]?.model,
    },
    fixture: { zipSha256: hash(compressed), ...fixture },
    limit,
    runsPerBoardAndLayer: size,
    clockBackToBackMs: measureClock(),
    layers: {},
  };
  for (const [layer, call] of Object.entries(calls)) {
    const work = {};
    for (const board of boards) {
      const expected = expect.get(board.id);
      const warm = {};
      for (const mode of modes[0]) warm[mode] = await collect(call, board, mode, expected);
      const runs = [];
      for (let run = 0; run < size; run++) {
        const order = modes[run % modes.length];
        const trial = { order };
        for (const mode of order) {
          trial[mode] = await collect(call, board, mode, expected);
          assert.equal(trial[mode].outputSha256, warm.base.outputSha256);
        }
        runs.push(trial);
      }
      work[board.total] = { boardId: board.id, pageCount: Math.ceil(board.total / limit), ...boardSummary(runs), warm, runs };
      console.log(JSON.stringify({ layer, tickets: board.total, ...boardSummary(runs) }));
    }
    result.layers[layer] = work;
  }
  result.finishedAt = new Date().toISOString();
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
} finally {
  if (app) {
    app.server.closeAllConnections();
    await app.close();
  }
  db?.close();
  rmSync(cwd, { recursive: true, force: true });
}
