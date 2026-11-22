import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const baseline = '7112467b524d5cea097e6cb4f4abf715e7f7ed4c';
export const out = resolve('coverage/candidate-payload');
export const fixture = resolve(
  'docs/development/evidence/2026-11-22-candidate-fetch-order/fixture.sqlite.gz',
);
export const variants = {
  before: {
    source: resolve(out, 'baseline-source'),
    base: 'http://127.0.0.1:3643',
  },
  after: {
    source: resolve('.'),
    base: 'http://127.0.0.1:3642',
  },
};
export const workloads = [
  { boardId: 1, ticketId: 1, count: 1005 },
  { boardId: 2, ticketId: 1001, count: 10005 },
];
export const runs = 6;
export const phaseOrder = (run) => run % 2 ? ['after', 'before'] : ['before', 'after'];

export const candidateFields = [
  'id', 'title', 'parentTicketId', 'priority', 'blockerIds', 'isResolved',
];

const routes = {
  before: '/api/boards/{boardId}/tickets?archived=all&order=id_asc',
  after: '/api/boards/{boardId}/relation-candidates?order=id_asc',
};

export function collectionUrl(phase, boardId) {
  const route = routes[phase];
  assert(route, 'Unknown collection phase');
  return new URL(route.replace('{boardId}', String(boardId)), variants[phase].base);
}

export function matchesCollection(url, collection) {
  return url.origin === collection.origin && url.pathname === collection.pathname
    && [...collection.searchParams].every(([key, value]) => url.searchParams.get(key) === value);
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function writeJson(relativePath, data) {
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, relativePath), JSON.stringify(data, null, 2) + '\n');
}

export function sourceFingerprint() {
  const paths = ['src', 'public', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json'];
  const listFiles = (args) => [...new Set(execFileSync('git', args)
    .toString().split('\0').filter(Boolean))].sort();
  const lists = {
    before: listFiles(['ls-tree', '-r', '--name-only', '-z', baseline, '--', ...paths]),
    after: listFiles(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...paths]),
  };
  const result = { baseline, node: process.version, fixtureSha256: sha256(readFileSync(fixture)) };
  for (const phase of ['before', 'after']) {
    const files = Object.fromEntries(lists[phase].map((file) =>
      [file, sha256(readFileSync(resolve(variants[phase].source, file)))]));
    result[phase] = { manifestSha256: sha256(JSON.stringify(files)), files };
  }
  return result;
}
