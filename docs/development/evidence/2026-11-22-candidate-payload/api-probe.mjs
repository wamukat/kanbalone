import assert from 'node:assert/strict';
import {
  candidateFields, collectionUrl, phaseOrder, runs, sha256, workloads, writeJson,
} from './config.mjs';

async function sample(phase, { boardId, count }, run) {
  const url = collectionUrl(phase, boardId);
  url.searchParams.set('limit', '200');
  const tickets = [];
  const requests = [];
  const seenCursors = new Set();
  const start = performance.now();
  let cursor;
  let revision;
  do {
    if (cursor) url.searchParams.set('cursor', cursor);
    const requestStart = performance.now();
    const response = await fetch(url);
    assert(response.ok, `${response.status} from ${url}`);
    const body = await response.text();
    const page = JSON.parse(body);
    const end = performance.now();
    assert.equal(page.page.total, count);
    const pageRevision = response.headers.get('x-kanbalone-ticket-revision');
    assert(pageRevision, 'Candidate page revision header is missing');
    if (revision === undefined) revision = pageRevision;
    assert.equal(pageRevision, revision);
    assert(page.tickets.length > 0 && page.tickets.length <= 200);
    tickets.push(...page.tickets);
    cursor = page.page.nextCursor;
    assert(cursor === null || typeof cursor === 'string' && cursor.length > 0);
    assert(!cursor || !seenCursors.has(cursor), 'Repeated collection cursor');
    if (cursor) seenCursors.add(cursor);
    requests.push({
      url: url.href, status: response.status, bytes: Buffer.byteLength(body),
      contentEncoding: response.headers.get('content-encoding'), ms: end - requestStart,
      rows: page.tickets.length,
    });
  } while (cursor);

  const ms = performance.now() - start;
  assert.equal(tickets.length, count);
  assert(tickets.every(({ id }, index) => index === 0 || id > tickets[index - 1].id),
    'Candidate wire order must be strictly ascending by ID');
  assert.equal(requests.length, Math.ceil(count / 200));
  const projected = tickets.map((ticket) => {
    assert(candidateFields.every((key) => Object.hasOwn(ticket, key)));
    assert(Number.isSafeInteger(ticket.id));
    assert.equal(typeof ticket.title, 'string');
    assert(ticket.parentTicketId === null || Number.isSafeInteger(ticket.parentTicketId));
    assert(Number.isSafeInteger(ticket.priority));
    assert(Array.isArray(ticket.blockerIds) && ticket.blockerIds.every(Number.isSafeInteger));
    assert.equal(typeof ticket.isResolved, 'boolean');
    if (phase === 'after') assert.equal(Object.keys(ticket).length, candidateFields.length);
    return candidateFields.map((key) => ticket[key]);
  });
  const hash = sha256(JSON.stringify(projected));
  const bytes = requests.reduce((total, request) => total + request.bytes, 0);
  return { phase, count, run, warmup: run === 0, ms, bytes, hash, revision, requests };
}

const samples = [];
for (const workload of workloads) {
  let expectedHash;
  for (let run = 0; run < runs; run++) {
    for (const phase of phaseOrder(run)) {
      const record = await sample(phase, workload, run);
      expectedHash ??= record.hash;
      assert.equal(record.hash, expectedHash, `Projected row mismatch in ${phase}/${workload.count}`);
      samples.push(record);
      writeJson('api-probe.json', { node: process.version, candidateFields, samples });
      console.log(record.count, run, phase, record.ms.toFixed(1), record.requests.length, record.bytes);
    }
  }
}
