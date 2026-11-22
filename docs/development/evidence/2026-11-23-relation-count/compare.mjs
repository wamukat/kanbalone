import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { gunzipSync } from 'node:zlib';
import { buildApp as buildBefore } from '../../../../coverage/relation-count/source-baseline/src/app.ts';
import { KanbanDb as BeforeDb } from '../../../../coverage/relation-count/source-baseline/src/db.ts';
import { buildApp as buildAfter } from '../../../../src/app.ts';
import { KanbanDb as AfterDb } from '../../../../src/db.ts';

const source = resolve('docs/development/evidence/2026-11-22-candidate-fetch-order/fixture.sqlite.gz');
const output = resolve(process.argv[2] ?? 'coverage/relation-count/product-results.json');
const cwd = mkdtempSync(join(tmpdir(), 'kanbalone-compare-count-'));
const dbFile = join(cwd, 'synthetic.sqlite');
const limit = 200;
const size = 18;
const boards = [{ id: 1, total: 1005 }, { id: 2, total: 10005 }];
const hash = value => createHash('sha256').update(value).digest('hex');
const fixture = readFileSync(source);
const endpoint = id => '/api/boards/' + id + '/relation-candidates';
const url = (id, pageLimit, cursor) => {
  const query = new URLSearchParams({ limit: String(pageLimit) });
  if (cursor) query.set('cursor', cursor);
  return endpoint(id) + '?' + query;
};

function snapshot(page) {
  const cursor = page.page.nextCursor;
  if (cursor) {
    const { total, ...decoded } = JSON.parse(Buffer.from(cursor.split('.')[0], 'base64url'));
    if (total !== undefined) assert.equal(total, page.page.total);
    return { ...page, page: { total: page.page.total, nextCursor: decoded } };
  }
  return page;
}

async function download(origin, path) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  return { body: await response.text(), revision: response.headers.get('x-kanbalone-ticket-revision') };
}

const app = {};
const db = {};
const origin = {};
async function startup() {
  writeFileSync(dbFile, gunzipSync(fixture), { flag: 'wx', mode: 0o600 });
  db.before = new BeforeDb(dbFile);
  db.after = new AfterDb(dbFile);
  const config = { dbFile, staticDir: resolve('public'), remoteCredentialProviders: [], remoteCredentialScopes: [] };
  app.before = buildBefore(config);
  app.after = buildAfter(config);
  origin.before = await app.before.listen({ host: '127.0.0.1', port: 0 });
  origin.after = await app.after.listen({ host: '127.0.0.1', port: 0 });
}

async function request(layer, variant, boardId, cursor) {
  if (layer === 'direct') return db[variant].listTicketRelationCandidatePage(boardId, { limit, cursor });
  const response = await download(origin[variant], url(boardId, limit, cursor));
  const { tickets, page } = JSON.parse(response.body);
  return { tickets, page, revision: response.revision };
}

async function collect(layer, variant, board, expected) {
  const pages = [];
  const pageTimesMs = [];
  let cursor;
  const begin = performance.now();
  do {
    const pageBegin = performance.now();
    const page = await request(layer, variant, board.id, cursor);
    pageTimesMs.push(performance.now() - pageBegin);
    pages.push(page);
    cursor = page.page.nextCursor;
    assert(pages.length <= Math.ceil(board.total / limit));
  } while (cursor !== null);
  const elapsedMs = performance.now() - begin;
  assert.deepEqual(pages.flatMap(page => page.tickets.map(t => t.id)), expected);
  assert(pages.every(page => page.page.total === board.total));
  assert(pages.every(page => page.revision !== null && page.revision === pages[0].revision));
  assert.equal(pages.length, Math.ceil(board.total / limit));
  const digest = hash(JSON.stringify(pages.map(snapshot)));
  return { elapsedMs, pageTimesMs, sha256: digest };
}

function metric(values) {
  const items = [...values].sort((a, b) => a - b);
  const middle = Math.floor(items.length / 2);
  return { median: items.length % 2 ? items[middle] : (items[middle - 1] + items[middle]) / 2, min: items[0], max: items.at(-1) };
}

async function compatibility(board) {
  const classic = '/api/boards/' + board + '/tickets?archived=all&limit=10&order=id_asc';
  const oldTickets = await download(origin.before, classic);
  assert.deepEqual(await download(origin.after, classic), oldTickets);
  const oldTicketsCursor = JSON.parse(oldTickets.body).page.nextCursor;
  const nextClassic = classic + '&cursor=' + oldTicketsCursor;
  assert.deepEqual(await download(origin.after, nextClassic), await download(origin.before, nextClassic));

  const op = JSON.parse((await download(origin.before, url(board, 5))).body);
  const np = JSON.parse((await download(origin.after, url(board, 5))).body);
  assert.deepEqual(snapshot(op), snapshot(np));
  const compare = async (variant, cursor) => snapshot(JSON.parse((await download(origin[variant], url(board, 11, cursor))).body));
  assert.deepEqual(await compare('before', np.page.nextCursor), await compare('after', op.page.nextCursor));
  return { ticketListBytesEqual: true, previousRelationCursorAcceptedByNewVersion: true, newRelationCursorAcceptedByPreviousVersion: true };
}

try {
  await startup();
  const sourceHash = variant => hash(readFileSync(resolve(variant === 'before'
    ? 'coverage/relation-count/source-baseline/src/db-modules/ticket-pagination.ts'
    : 'src/db-modules/ticket-pagination.ts')));
  const result = {
    startedAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    node: process.version,
    fixtureSha256: hash(fixture),
    paginationSourceSha256: { before: sourceHash('before'), after: sourceHash('after') },
    size, limit,
    compatibility: await compatibility(boards[1].id),
    layers: {},
  };
  for (const layer of ['direct', 'loopback']) {
    result.layers[layer] = {};
    for (const board of boards) {
      const expected = db.after.sqlite.prepare('SELECT id FROM tickets WHERE board_id = ? ORDER BY id').pluck().all(board.id);
      const warm = {
        before: await collect(layer, 'before', board, expected),
        after: await collect(layer, 'after', board, expected),
      };
      assert.equal(warm.before.sha256, warm.after.sha256);
      const pairs = [];
      for (let index = 0; index < size; index++) {
        const order = index % 2 ? ['after', 'before'] : ['before', 'after'];
        const pair = { order };
        for (const variant of order) {
          pair[variant] = await collect(layer, variant, board, expected);
          assert.equal(pair[variant].sha256, warm.before.sha256);
        }
        pairs.push(pair);
      }
      const summary = {
        pageCount: Math.ceil(board.total / limit),
        beforeMs: metric(pairs.map(pair => pair.before.elapsedMs)),
        afterMs: metric(pairs.map(pair => pair.after.elapsedMs)),
        pairedSavingMs: metric(pairs.map(pair => pair.before.elapsedMs - pair.after.elapsedMs)),
        pairedSavingFraction: metric(pairs.map(pair => 1 - (pair.after.elapsedMs / pair.before.elapsedMs))),
        improvementPairs: pairs.filter(pair => pair.after.elapsedMs < pair.before.elapsedMs).length,
      };
      result.layers[layer][board.total] = { ...summary, warm, pairs };
      console.log(JSON.stringify({ layer, tickets: board.total, ...summary }));
    }
  }
  result.finishedAt = new Date().toISOString();
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
} finally {
  for (const appInstance of Object.values(app)) appInstance.server.closeAllConnections();
  for (const appInstance of Object.values(app)) await appInstance.close();
  for (const dbInstance of Object.values(db)) dbInstance.close();
  rmSync(cwd, { recursive: true, force: true });
}
