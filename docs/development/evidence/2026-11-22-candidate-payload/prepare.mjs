import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { baseline, out, variants } from './config.mjs';

const { source } = variants.before;
mkdirSync(out, { recursive: true });
const temporary = mkdtempSync(resolve(out, 'prepare-baseline-'));
const archive = resolve(temporary, 'source.tar');
const extracted = resolve(temporary, 'source');
mkdirSync(extracted);
try {
  execFileSync('git', [
    'archive', '--output', archive, baseline, 'src', 'public', 'package.json',
    'pnpm-lock.yaml', 'tsconfig.json',
  ]);
  execFileSync('tar', ['-x', '-f', archive, '-C', extracted]);
  symlinkSync(resolve('node_modules'), resolve(extracted, 'node_modules'), 'dir');
  renameSync(extracted, source);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
console.log('Prepared baseline source at', source);
