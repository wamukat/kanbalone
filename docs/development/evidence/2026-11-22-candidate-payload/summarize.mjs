import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { out, workloads, writeJson } from './config.mjs';

const read = (name) => JSON.parse(readFileSync(resolve(out, name), 'utf8'));
const browser = read('benchmark.json');
const api = read('api-probe.json');

function pairedStats(samples, count, kind) {
  const phases = {};
  for (const phase of ['before', 'after']) {
    const records = samples.filter((record) => record.count === count
      && record.phase === phase && !record.warmup && (kind === undefined || record.kind === kind));
    assert.equal(records.length, 5);
    const times = records.map(({ ms }) => ms).sort((a, b) => a - b);
    const { requests, bytes, hash, ids } = records[0];
    assert(records.every((record) => record.requests.length === requests.length && record.bytes === bytes));
    phases[phase] = { medianMs: times[2], bytes, requests: requests.length, hash, ids };
  }
  return { count, kind, ...phases };
}

const summaries = {
  api: workloads.map(({ count }) => pairedStats(api.samples, count)),
  browser: workloads.flatMap(({ count }) =>
    ['first', 'repeat', 'no-match'].map((kind) => pairedStats(browser.samples, count, kind))),
};
writeJson('summary.json', summaries);
for (const [name, rows] of Object.entries(summaries)) {
  console.log(name);
  console.table(rows.map(({ count, kind, before, after }) => ({
    count, kind, beforeMs: before.medianMs.toFixed(1), afterMs: after.medianMs.toFixed(1),
    beforeBytes: before.bytes, afterBytes: after.bytes, beforeRequests: before.requests,
    afterRequests: after.requests,
  })));
}
