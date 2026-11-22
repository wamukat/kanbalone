import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { fixture, variants } from './config.mjs';

const [phase, mode] = process.argv.slice(2);
assert(Object.hasOwn(variants, phase), 'Specify a before or after source');
assert(['benchmark', 'visual'].includes(mode), 'Specify benchmark or visual fixture');
const { source, base } = variants[phase];
const { buildApp } = await import(pathToFileURL(resolve(source, 'src/app.ts')).href);
const dir = mkdtempSync(resolve(tmpdir(), `kanbalone-candidate-${phase}-`));
const dbFile = resolve(dir, 'fixture.sqlite');
if (mode === 'benchmark') {
  writeFileSync(dbFile, gunzipSync(readFileSync(fixture)), { flag: 'wx' });
}

process.chdir(source);
const app = buildApp({
  dbFile,
  staticDir: resolve(source, 'public'),
  remoteCredentialProviders: [],
  remoteCredentialScopes: [],
});
const host = '127.0.0.1';
try {
  const url = await app.listen({ host, port: mode === 'benchmark' ? Number(new URL(base).port) : 0 });
  console.log(JSON.stringify({ phase, url, dbFile }));
} catch (error) {
  app.server.closeAllConnections();
  await app.close();
  throw error;
}
async function close() {
  app.server.closeAllConnections();
  await app.close();
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
