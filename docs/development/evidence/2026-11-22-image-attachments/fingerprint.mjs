import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { resolve } from 'node:path';
import { baseline, roots } from './fixture.mjs';

const paths = ['src', 'public', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json'];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const files = {
  before: git('ls-tree', '-r', '--name-only', '-z', baseline, '--', ...paths),
  after: git('ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...paths),
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = {
  baseline,
  workingTreeHead: git('rev-parse', 'HEAD').trim(),
  environment: { node: process.version, platform: platform(), release: release(), arch: arch(),
    browserCli: execFileSync('agent-browser', ['--version'], { encoding: 'utf8' }).trim() },
};
for (const [phase, list] of Object.entries(files)) {
  const paths = [...new Set(list.split('\0').filter(Boolean))].sort();
  const entries = Object.fromEntries(paths.map(path => [path, sha256(readFileSync(resolve(roots[phase], path)))]));
  manifest[phase] = { sha256: sha256(JSON.stringify(entries)), files: entries };
}
console.log(JSON.stringify(manifest, null, 2));
