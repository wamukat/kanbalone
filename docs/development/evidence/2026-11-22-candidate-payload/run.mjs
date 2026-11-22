import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { sourceFingerprint, out, writeJson } from './config.mjs';
import { waitForStartedServer } from './browser-tools.mjs';

const node = process.execPath;
const servers = [];
const runMode = process.argv[2] ?? 'all';
assert(['all', 'benchmark', 'visual'].includes(runMode), 'Expected all, benchmark or visual');

async function run(file) {
  const child = spawn(node, [resolve(out, file)], { stdio: 'inherit' });
  const [code, signal] = await once(child, 'exit');
  assert.equal(code, 0, `${file} failed with status ${code}, signal ${signal}`);
}

async function stopServers() {
  for (const server of servers.splice(0).reverse()) {
    if (server.exitCode !== null || server.signalCode !== null) continue;
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
}

process.on('SIGINT', stopServers);
process.on('SIGTERM', stopServers);
const source = sourceFingerprint();
writeJson('source-fingerprint.json', source);

if (runMode !== 'visual') {
  try {
    for (const phase of ['before', 'after']) {
      const server = spawn(node, [
        '--import', 'tsx', resolve(out, 'server.mjs'), phase, 'benchmark',
      ], { stdio: ['ignore', 'pipe', 'inherit'] });
      servers.push(server);
      console.log(await waitForStartedServer(server));
    }
    await run('api-probe.mjs');
    await run('benchmark.mjs');
    await run('summarize.mjs');
  } finally {
    await stopServers();
  }
}
if (runMode !== 'benchmark') await run('visual.mjs');
assert.deepEqual(sourceFingerprint(), source, 'Source changed during the evidence run');
if (runMode === 'all') await run('compare-images.mjs');
