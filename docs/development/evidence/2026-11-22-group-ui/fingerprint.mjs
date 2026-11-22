import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { baseline, source } from './fixture.mjs';

const paths = ['src', 'public', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json'];
const listFiles = args => [...new Set(execFileSync('git', args, { encoding: 'utf8' })
  .split('\0').filter(Boolean))].sort();
const lists = {
  before: listFiles(['ls-tree', '-r', '--name-only', '-z', baseline, '--', ...paths]),
  after: listFiles(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...paths]),
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const digest = files => sha256(JSON.stringify(files));
const fingerprint = {
  baseline,
  node: process.version,
  platform: { os: platform(), kernel: release(), architecture: arch() },
  workingTreeBase: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
};
for (const phase of ['before', 'after']) {
  const files = Object.fromEntries(lists[phase].map(file =>
    [file, sha256(readFileSync(resolve(source[phase], file)))]));
  fingerprint[phase] = { manifestSha256: digest(files), files };
}
console.log(JSON.stringify(fingerprint, null, 2));
