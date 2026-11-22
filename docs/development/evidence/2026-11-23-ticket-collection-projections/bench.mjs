import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const out = resolve('coverage/ticket-collection-projections');
const fixture = resolve(out, 'group-fixture.sqlite');
const sources = {
  before: resolve(out, 'baseline'),
  after: process.cwd(),
};
const referenceFields = ['id', 'title', 'laneId', 'parentTicketId', 'isResolved'];
const groupFields = [...referenceFields, 'priority', 'isArchived', 'hasChildren'];
const select = (value, fields) => fields.map(key => value[key]);
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const apps = {};
const dbDir = mkdtempSync(resolve(tmpdir(), 'kanbalone-projection-probe-'));

async function launch(source, phase) {
  const { buildApp } = await import(pathToFileURL(resolve(source, 'src/app.ts')));
  const collection = await import(pathToFileURL(resolve(source, 'public/app-ticket-collections.js')));
  const pages = await import(pathToFileURL(resolve(source, 'public/app-ticket-pages.js')));
  const dbFile = resolve(dbDir, phase + '.sqlite');
  copyFileSync(fixture, dbFile);
  const app = buildApp({ dbFile, staticDir: resolve(source, 'public'), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const timings = new WeakMap();
  app.addHook('onRequest', async (request) => timings.set(request, [performance.now()]));
  app.addHook('preSerialization', async (request, reply, payload) => {
    timings.get(request).push(performance.now());
    return payload;
  });
  app.addHook('onSend', async (request, reply, payload) => {
    const [start, serializationStart] = timings.get(request);
    if (serializationStart !== undefined) {
      reply.header('x-probe-generation-ms', String(serializationStart - start));
      reply.header('x-probe-serialization-ms', String(performance.now() - serializationStart));
    }
    return payload;
  });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, url, ...collection, ...pages };
}

async function sample(phase, test, boardId, run) {
  const app = apps[phase];
  const traces = [];
  const api = async path => {
    const start = performance.now();
    const response = await fetch(new URL(path, app.url));
    const headersAt = performance.now();
    const text = await response.text();
    const bodyAt = performance.now();
    assert(response.ok, phase + ': ' + path + ': ' + response.status + ' ' + text.slice(0, 500));
    const result = JSON.parse(text);
    const end = performance.now();
    const revision = response.headers.get('x-kanbalone-ticket-revision');
    if (revision) Object.defineProperty(result, 'ticketRevision', { value: revision });
    const generation = response.headers.get('x-probe-generation-ms');
    const serialization = response.headers.get('x-probe-serialization-ms');
    assert(generation && serialization, 'Server timing hooks run for measured HTTP responses');
    traces.push({
      path: new URL(path, app.url).pathname,
      bytes: Buffer.byteLength(text),
      generationMs: Number(generation),
      serializationMs: Number(serialization),
      timeToHeadersMs: headersAt - start,
      bodyMs: bodyAt - headersAt,
      parseMs: end - bodyAt,
      rows: result.tickets.length,
    });
    return result;
  };

  const url = '/api/boards/' + boardId;
  const start = performance.now();
  let result;
  if (test === 'group') {
    // Full Group member collection. The Group shell and No Group probe are outside this interval.
    const members = phase === 'before'
      ? url + '/tickets?archived=all&groupId=' + boardId
      : url + '/group-tickets?groupId=' + boardId;
    result = await app.collectTicketPages(api, members, { order: 'id_asc' });
  } else {
    // End-to-end collection through the app's real List loader.
    const priority = test === 'all-priorities' ? '1,2,3,4' : '4';
    result = await app.loadListTicketCollection(api, url + '/tickets?archived=all&priority=' + priority, { isCurrent: () => true });
  }
  const elapsedMs = performance.now() - start;
  const projection = test === 'group'
    ? result.tickets.map(t => [...select(t, groupFields), t.tags.map(tag => select(tag, ['id', 'name', 'color']))])
    : [result.tickets, result.referenceTickets.map(t => select(t, referenceFields))];
  if (phase === 'after') {
    const expectedPath = test === 'group' ? '/group-tickets' : '/list-ticket-references';
    for (const trace of traces.filter(t => t.path.endsWith(expectedPath))) assert(trace.rows > 0);
    if (test === 'all-priorities') assert.equal(result.referenceTickets, result.tickets);
  }
  return {
    phase, test, boardId, run, elapsedMs, count: result.tickets.length, referenceCount: result.referenceTickets?.length,
    hash: hash(projection), traces,
  };
}

const records = [];
try {
  for (const [phase, source] of Object.entries(sources)) apps[phase] = await launch(source, phase);
  for (const test of ['group', 'all-priorities', 'partial-priorities']) {
    for (const boardId of [1, 2]) {
      let expected;
      for (let run = 0; run < 8; run++) {
        for (const phase of run % 2 ? ['before', 'after'] : ['after', 'before']) {
          const record = await sample(phase, test, boardId, run);
          expected ??= record.hash;
          assert.equal(record.hash, expected, 'Projected rows, order or display diverged');
          records.push(record);
        }
      }
    }
  }
} finally {
  for (const { app } of Object.values(apps)) await app.close();
  rmSync(dbDir, { recursive: true, force: true });
  writeFileSync(resolve(out, 'projection-probe.json'), JSON.stringify({ node: process.version, records }, null, 2) + '\n');
}
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
for (const phase of Object.keys(sources)) {
  for (const test of ['group', 'all-priorities', 'partial-priorities']) {
    for (const boardId of [1, 2]) {
      const group = records.filter(r => r.phase === phase && r.test === test && r.boardId === boardId && r.run);
      const row = [phase, test, boardId, group[0].count, group[0].referenceCount ?? '-',
        median(group.map(r => r.elapsedMs)).toFixed(1), group[0].traces.length,
        ...['bytes', 'generationMs', 'serializationMs', 'bodyMs', 'parseMs'].map(key => median(group.map(r => r.traces.reduce((total, trace) => total + trace[key], 0))).toFixed(1)),
        group.map(r => r.elapsedMs.toFixed(1)).join(',')];
      console.log(row.join('\t'));
    }
  }
}
