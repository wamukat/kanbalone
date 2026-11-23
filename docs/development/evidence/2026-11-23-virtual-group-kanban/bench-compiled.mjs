import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { installViewportProbe } from './viewport-probe.mjs';

const baseline = 'e370777b8b5c7fb6501f3208b1d29372e9bc1e5c';
const fixtureFile = resolve(process.env.KANBALONE_FIXTURE_CATALOG ?? 'coverage/tag-render-perf/fixtures.json');
const pnpm = process.env.KANBALONE_PNPM_JS;
const defaultKeys = ['group-1000', 'group-10000', 'ungrouped-10000', 'kanban-1000', 'kanban-high-active'];
const viewport = { width: 1440, height: 1000 };
const [repoArg, revisionArg, configArg, keysArg, retainArg = '3'] = process.argv.slice(2);
assert(revisionArg && configArg, 'Usage: node bench-compiled.mjs WORKTREE EXACT_HEAD CONFIG [FIXTURE_KEYS] [RETAINED_COUNT]');
const repo = resolve(repoArg);
const selectedKeys = keysArg?.split(',') ?? defaultKeys;
const retained = Number(retainArg);
assert([1, 2, 3].includes(retained));
const config = JSON.parse(readFileSync(configArg));
const fixtures = JSON.parse(readFileSync(fixtureFile)).fixtures.filter(fixture => selectedKeys.includes(fixture.key));
assert.equal(fixtures.length, selectedKeys.length);

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
assert.equal(revisionArg, git('rev-parse', `${revisionArg}^{commit}`));
assert.equal(git('rev-parse', 'HEAD'), revisionArg, 'candidate must be checked out at the accepted SHA');
assert.equal(git('status', '--porcelain=v1'), '', 'candidate must be clean');
assert.equal(git('merge-base', baseline, revisionArg), baseline);
const hash = data => createHash('sha256').update(data).digest('hex');
const hashFile = file => hash(readFileSync(file));
const hashTree = root => hash(JSON.stringify(readdirSync(root, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => join(entry.parentPath, entry.name)).sort()
  .map(file => [file.slice(root.length + 1), hashFile(file)])));
const outputDirectory = resolve(process.env.KANBALONE_VIRTUAL_BENCH_OUTPUT ?? join(repo, 'coverage', 'virtual-bench'));
mkdirSync(outputDirectory, { recursive: true });
const out = mkdtempSync(join(outputDirectory, 'compiled-'));
const rawFile = join(out, 'raw.json');
const results = {
  provenance: {
    node: process.version, pnpm: pnpm ?? 'pnpm on PATH', locale: 'en-US', theme: 'light', viewport, fixtureFile, fixtureFileSha256: hashFile(fixtureFile),
    retained, fixtureCases: fixtures.map(({ key, dbFile, ids, view }) => ({ key, view, dbFile, sha256: hashFile(dbFile), idSha256: hash(JSON.stringify(ids)) })),
  },
  samples: [],
};
const save = () => writeFileSync(rawFile, JSON.stringify(results, null, 2) + '\n');
console.log(out);

const collectionHook = {
  file: 'public/app-group-board.js',
  anchor: '      receiveTickets(nextTickets);',
  source: 'globalThis.__fixtureTrial?.capture("collection", nextTickets.length, () => nextTickets.map(ticket => ticket.id));',
};
const lanePlanHook = {
  file: 'public/app-kanban-board.js',
  anchor: '    const plans = planLaneTickets(detail);',
  source: 'globalThis.__fixtureTrial?.capture("projection", plans.reduce((count, plan) => count + plan.visibleTickets.length, 0), () => plans.flatMap(plan => plan.visibleTickets.map(ticket => ticket.id)));',
};
const kanbanCollectionHook = {
  file: 'public/app.js',
  anchor: '    state.boardTickets = allTickets.referenceTickets ?? allTickets.tickets;',
  source: 'if (viewMode === "kanban") globalThis.__fixtureTrial?.capture("collection", allTickets.tickets.length, () => allTickets.tickets.map(ticket => ticket.id));',
};

function compile(version, revision) {
  const directory = join(out, version);
  mkdirSync(directory);
  const archive = join(out, `${version}.tar`);
  execFileSync('git', ['-C', repo, 'archive', '--output', archive, revision]);
  execFileSync('tar', ['-xf', archive, '-C', directory]);
  const sourceSha256 = hashTree(join(directory, 'public'));
  const hooks = version === 'baseline' ? [collectionHook, kanbanCollectionHook, lanePlanHook] : [
    config.groupCollection ?? collectionHook, config.kanbanCollection ?? kanbanCollectionHook, config.kanbanProjection ?? lanePlanHook,
    ...(config.groupProjection ? [config.groupProjection] : []),
  ];
  for (const { file, anchor, source } of hooks) {
    const target = join(directory, file);
    const content = readFileSync(target, 'utf8');
    assert.equal(content.split(anchor).length, 2, `${version} ${file} unique hook anchor`);
    writeFileSync(target, content.replace(anchor, () => `${anchor}\n${source}`));
  }
  symlinkSync(join(repo, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const buildCommand = pnpm ? process.execPath : 'pnpm';
  const buildArgs = pnpm ? [pnpm, 'build'] : ['build'];
  execFileSync(buildCommand, buildArgs, {
    cwd: directory, stdio: 'inherit', env: { ...process.env, PATH: [dirname(process.execPath), process.env.PATH].join(delimiter) },
  });
  const staticDir = join(directory, 'dist', 'public');
  const backendDir = join(directory, 'dist', 'src');
  return {
    version, revision, tree: git('rev-parse', `${revision}^{tree}`), sourceSha256, hooks, staticDir, backendDir,
    staticSha256: hashTree(staticDir), backendSha256: hashTree(backendDir), lockSha256: hashFile(join(directory, 'pnpm-lock.yaml')),
  };
}

function installTrial({ view, count, firstId, oracle, requireProjection }) {
  const models = new Map();
  const state = { mountedMax: 0, first: null, completeDom: null, key: null, detail: null };
  window.__fixtureTrial = {
    state,
    capture(kind, size, ids) {
      const matches = view === 'kanban' && kind === 'collection' ? size >= count : size === count;
      if (matches && !models.has(kind)) models.set(kind, { at: performance.now(), ids });
    },
    collection() {
      return Object.fromEntries([...models].map(([key, { at, ids }]) => [key, { at, ids: ids() }]));
    },
    ready() {
      if (!models.has('collection')) return false;
      if (view === 'kanban') return models.has('projection');
      return models.has('projection') || !requireProjection || state.completeDom !== null;
    },
  };
  localStorage.setItem('kanbalone:language', 'en');
  performance.setResourceTimingBufferSize(4096);
  document.addEventListener('DOMContentLoaded', () => {
    const kanban = view === 'kanban';
    const root = document.querySelector(kanban ? '#lane-board' : '#group-board');
    const className = kanban ? 'ticket-card' : 'group-ticket-row';
    const idFor = row => kanban ? Number(row?.dataset.ticketId) : Number(row?.querySelector('.ticket-ref')?.textContent.slice(1));
    const twoFrames = callback => requestAnimationFrame(() => requestAnimationFrame(callback));
    if (oracle) window.__virtualFixtureProbe.observeInitialViewport(view, oracle);
    let firstPending = false;
    let completePending = false;
    const observer = new MutationObserver(() => {
      const rows = root.getElementsByClassName(className);
      state.mountedMax = Math.max(state.mountedMax, rows.length);
      if (idFor(rows[0]) !== firstId) return;
      if (state.first === null && !firstPending) {
        firstPending = true;
        twoFrames(() => {
          firstPending = false;
          if (idFor(rows[0]) === firstId) state.first = performance.now();
        });
      }
      if (state.completeDom === null && !completePending && rows.length === count) {
        completePending = true;
        twoFrames(() => {
          completePending = false;
          if (rows.length === count) state.completeDom = performance.now();
        });
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || state.key) return;
      const row = event.target.closest(`.${className}`);
      state.key = { at: event.timeStamp, trusted: event.isTrusted, id: row ? idFor(row) : null };
    }, true);
    const dialog = document.querySelector('#editor-dialog');
    new MutationObserver(() => {
      if (!dialog.open || state.detail) return;
      twoFrames(() => {
        if (!dialog.open || state.detail) return;
        const id = Number(document.querySelector('#editor-header-id')?.textContent.match(/\d+/)?.[0]);
        const title = document.querySelector('#ticket-title')?.value;
        if (id && title) state.detail = { id, title, at: performance.now() };
      });
    }).observe(dialog, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  }, { once: true });
}

const awaited = async (page, predicate, arg = null) => {
  const handle = await page.waitForFunction(predicate, arg, { timeout: 20000 });
  await handle.dispose();
};
const evaluateViewport = (page, view) => page.evaluate(view => window.__virtualFixtureProbe.snapshotViewport(view), view);
const waitFrame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const titleSelector = (view, id) => view === 'kanban'
  ? `#lane-board .ticket-card[data-ticket-id="${id}"] .ticket-link`
  : `#group-board [data-group-ticket="${id}"]`;

function viewportSignature(rows) {
  return rows.map(({ id, laneId, title, titleExposed, actionable }) => ({ id, laneId, title, titleExposed, actionable }));
}

async function navigate(browser, fixture, build, round, oracle, record) {
  const { view, ids, key } = fixture;
  const dbDirectory = mkdtempSync(join(out, 'fixture-'));
  const dbFile = join(dbDirectory, 'fixture.sqlite');
  copyFileSync(fixture.dbFile, dbFile);
  const { buildApp } = await import(pathToFileURL(join(build.backendDir, 'app.js')));
  const app = buildApp({ dbFile, staticDir: build.staticDir, remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  const context = await browser.newContext({ viewport, locale: 'en-US', colorScheme: 'light' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installViewportProbe);
  await page.addInitScript(installTrial, {
    view, count: ids.length, firstId: ids[0], oracle,
    requireProjection: view === 'kanban' || build.version === 'candidate',
  });
  try {
    const hostNavigationStart = performance.now();
    const subroute = view === 'group' ? '/group' : '';
    await page.goto(`${url}/boards/${fixture.board.id}${subroute}`, { waitUntil: 'commit' });
    let initial;
    if (oracle) {
      await awaited(page, view => window.__virtualFixtureProbe.initialViewport(view), view);
      initial = await page.evaluate(view => window.__virtualFixtureProbe.initialViewport(view), view);
      assert.deepEqual(viewportSignature(initial.rows), viewportSignature(oracle), `${key} same visible semantics`);
    } else {
      assert.equal(build.version, 'baseline');
      assert.equal(round, 0);
      await awaited(page, () => window.__fixtureTrial.state.completeDom !== null);
      initial = { rows: await evaluateViewport(page, view), at: null, mounted: ids.length };
    }
    const hostViewport = performance.now();
    const target = initial.rows.find(row => row.actionable);
    assert(target, `${key} has a real visible actionable title`);
    await page.locator(titleSelector(view, target.id)).focus({ timeout: 5000 });
    const hostKey = performance.now();
    await page.keyboard.press('Enter');
    await awaited(page, id => window.__fixtureTrial.state.detail?.id === id, target.id);
    const hostDetail = performance.now();
    await awaited(page, () => window.__fixtureTrial.ready());
    if (build.version === 'baseline') await awaited(page, () => window.__fixtureTrial.state.completeDom !== null);
    await waitFrame(page);

    const measured = await page.evaluate(view => {
      const { state, collection } = window.__fixtureTrial;
      const kanban = view === 'kanban';
      const rows = document.querySelectorAll(kanban ? '#lane-board .ticket-card' : '#group-board .group-ticket-row');
      const mountedIds = [...rows].map(row => kanban ? Number(row.dataset.ticketId) : Number(row.querySelector('.ticket-ref')?.textContent.slice(1)));
      const resources = performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.startsWith('/generated/'))
        .map(entry => ({ path: new URL(entry.name).pathname, responseEnd: entry.responseEnd, bytes: entry.encodedBodySize }));
      return { ...state, collection: collection(), mountedIds, resources };
    }, view);
    assert.deepEqual(errors, []);
    assert(measured.key?.trusted && measured.key.id === target.id, `${key} trusted Enter on expected title`);
    const response = await page.request.get(`${url}/api/tickets/${target.id}`);
    assert.equal(response.status(), 200);
    const stored = await response.json();
    assert.equal(stored.id, target.id);
    assert.equal(stored.title, measured.detail.title);
    if (view === 'group') assert.deepEqual(measured.collection.collection.ids, ids, `${key} accepted Group collection sequence`);
    else {
      const accepted = new Set(measured.collection.collection.ids);
      assert.equal(accepted.size, measured.collection.collection.ids.length, `${key} accepted Kanban IDs are unique`);
      assert(ids.every(id => accepted.has(id)), `${key} all planned Kanban IDs accepted`);
    }
    if (measured.collection.projection) assert.deepEqual(measured.collection.projection.ids, ids, `${key} ordered ticket projection`);
    if (measured.completeDom !== null) assert.deepEqual(measured.mountedIds, ids, `${key} complete DOM order`);
    assert.equal(new Set(measured.mountedIds).size, measured.mountedIds.length, `${key} mounted IDs are unique`);

    let screenshot;
    if (round === 0 && config.snapshotFixtures?.includes(key)) {
      await page.keyboard.press('Escape');
      await awaited(page, () => !document.querySelector('#editor-dialog').open && !document.body.classList.contains('editor-dialog-open'));
      await awaited(page, selector => document.activeElement?.matches(selector), titleSelector(view, target.id));
      await page.evaluate(() => document.fonts.ready);
      await waitFrame(page);
      const file = join(out, `${key}-${build.version}-restored.png`);
      await page.screenshot({ path: file });
      screenshot = { file, sha256: hashFile(file) };
    }
    record({
      fixture: key, view, version: build.version, round, warmup: round === 0, initial,
      ...measured, screenshot,
      host: { viewportToKey: hostKey - hostViewport, keyToDetail: hostDetail - hostKey, navigationToDetail: hostDetail - hostNavigationStart },
    });
  } finally {
    await page.close({ runBeforeUnload: false });
    await context.close();
    app.server.closeAllConnections();
    await app.close();
  }
}

assert(config.groupProjection || fixtures.every(fixture => fixture.view !== 'group'), 'large Group candidate requires an explicit projection recorder');
const builds = [compile('baseline', baseline), compile('candidate', revisionArg)];
assert.equal(builds[0].lockSha256, builds[1].lockSha256, 'same lockfile for both builds');
results.provenance.builds = builds;
const browser = await chromium.launch();
results.provenance.chromium = browser.version();
save();
try {
  for (const fixture of fixtures) {
    let oracle;
    let controlCollection;
    for (let round = 0; round <= retained; round += 1) {
      const ordered = round % 2 ? builds.toReversed() : builds;
      for (const build of ordered) {
        await navigate(browser, fixture, build, round, oracle, sample => {
          if (!oracle) {
            oracle = sample.initial.rows;
            controlCollection = sample.collection.collection.ids;
          }
          assert.deepEqual(sample.collection.collection.ids, controlCollection, `${fixture.key} unchanged accepted collection order`);
          results.samples.push(sample);
          save();
          console.log(JSON.stringify({ fixture: fixture.key, version: build.version, round, viewport: sample.initial.at, action: sample.host.navigationToDetail }));
        });
      }
    }
  }
} finally { await browser.close(); }
