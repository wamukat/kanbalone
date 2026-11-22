import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const out = path.resolve(process.env.KANBALONE_RENDER_OUTPUT ?? path.join(repo, 'coverage/tag-render-perf'));
mkdirSync(out, { recursive: true });
const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.env.KANBALONE_RENDER_REPO ?? path.join(evidenceDir, '../../../..'));
process.chdir(repo);
const { buildApp } = await import(pathToFileURL(path.join(repo, 'src/app.ts')));
const catalog = JSON.parse(readFileSync(path.join(out, 'fixtures.json'), 'utf8'));
const options = JSON.parse(process.argv[2] ?? '{}');
const cases = catalog.fixtures.filter((fixture) => !options.cases || options.cases.includes(fixture.key));
assert(cases.length, 'No matching fixtures');
const rounds = options.rounds ?? 6;
const diagnostics = options.diagnostics ?? false;
const viewport = { width: 1440, height: 1000 };
const variants = options.variants ?? [{ name: 'baseline', staticDir: path.join(repo, 'public') }];
const runLabel = options.runLabel ?? 'baseline';
const provenance = {
  os: os.version(), release: os.release(), arch: process.arch, cpu: os.cpus()[0].model,
  logicalCpus: os.cpus().length, node: process.version,
  serverRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  decompressedFixtureSha256: catalog.archiveSha256,
  date: new Date().toISOString(), viewport, language: 'en', theme: 'light',
  method: 'Fresh Chromium context and navigation per sequential sample. DOM mutation detection plus two requestAnimationFrame callbacks. CDP cumulative durations from navigation. Server-Timing covers onRequest to onSend, including handler and serialization.',
  diagnostics,
  variants: variants.map(({ name, staticDir }) => ({
    name, staticDir,
    files: Object.fromEntries(
      ['app-group-board.js', 'app-group-view.js', 'app-tags.js', 'app-kanban-board.js', 'app-kanban-ticket-card.js', 'app-api.js', 'icons.js'].map((file) =>
        [file, hash(readFileSync(path.join(staticDir, file)))],
      ),
    ),
  })),
};
const samples = [];
const resultsPath = path.join(out, runLabel + '.json');
const browser = await chromium.launch({ headless: true });
provenance.chromium = browser.version();
try {
  for (const fixture of cases) {
    const servers = [];
    try {
      for (const variant of variants) servers.push(await startServer(fixture, variant));
      for (let run = 0; run < rounds; run++) {
        for (const server of run % 2 ? [...servers].reverse() : servers) {
          const sample = await measure(fixture, server, run);
          samples.push(sample);
          console.log(
            fixture.key, server.variant.name, run,
            'first', sample.timing.first.toFixed(1),
            'complete', sample.timing.complete.toFixed(1),
            'last response', sample.ticketTiming.responseEnd.toFixed(1),
            'layout', sample.metrics.LayoutDuration.toFixed(3),
            'style', sample.metrics.RecalcStyleDuration.toFixed(3),
          );
          writeFileSync(resultsPath, JSON.stringify({ provenance, samples }, null, 2) + '\n');
        }
      }
    } finally {
      for (const { app } of servers) {
        app.server.closeAllConnections();
        await app.close();
      }
    }
  }
} finally {
  await browser.close();
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function startServer(fixture, variant) {
  const runDir = mkdtempSync(path.join(out, runLabel + '-' + fixture.key + '-' + variant.name + '-'));
  const dbFile = path.join(runDir, 'fixture.sqlite');
  copyFileSync(fixture.dbFile, dbFile);
  const staticDir = diagnostics ? instrument(variant, runDir) : variant.staticDir;
  const app = buildApp({ dbFile, staticDir, remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const starts = new WeakMap();
  app.addHook('onRequest', (request, _reply, done) => {
    if (request.url.startsWith('/api/') && !request.url.includes('/events')) starts.set(request, performance.now());
    done();
  });
  app.addHook('onSend', (request, reply, _payload, done) => {
    const start = starts.get(request);
    if (start !== undefined) reply.header('Server-Timing', 'kanbalone;dur=' + (performance.now() - start).toFixed(3));
    done();
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  return { app, base: 'http://127.0.0.1:' + app.server.address().port, variant };
}

async function measure(fixture, { base, variant }, run) {
  const context = await browser.newContext({ viewport, locale: 'en-US', colorScheme: 'light' });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    if (diagnostics) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
    }
    const countsByLane = Object.fromEntries(
      fixture.lanes.filter((lane) => lane.ticketIds?.length).map((lane) => [lane.id, lane.ticketIds.length]),
    );
    await page.addInitScript(observe, {
      kanban: fixture.view === 'kanban',
      total: fixture.ids.length,
      firstId: fixture.ids[0],
      countsByLane,
    });
    const url = base + '/boards/' + fixture.board.id + (fixture.view === 'group' ? '/group' : '');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__renderProbe.complete, null, { timeout: 90000 });
    const metrics = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({name, value}) => [name, value]));
    if (diagnostics) {
      const { profile } = await cdp.send('Profiler.stop');
      writeFileSync(path.join(out, [runLabel, fixture.key, variant.name, run].join('-') + '.cpuprofile'), JSON.stringify(profile));
    }
    // Measure from the in-page timestamps. Geometry and screenshots happen after.
    const result = await page.evaluate(inspect, { kanban: fixture.view === 'kanban', boardId: fixture.board.id });
    assert.deepEqual(result.ids, fixture.ids, fixture.key + ' visible IDs or order');
    assert.deepEqual(errors, [], fixture.key + ' browser errors');
    const ticketRequests = result.resources.filter((entry) => entry.apiType === 'ticket-pages');
    assert(ticketRequests.length > 0);
    const collectionStart = Math.min(...ticketRequests.map((entry) => entry.start));
    const responseEnd = Math.max(...ticketRequests.map((entry) => entry.end));
    const ticketTiming = {
      count: ticketRequests.length, collectionStart, responseEnd,
      collectionSpan: responseEnd - collectionStart,
      elapsedAfterLastResponse: result.timing.complete - responseEnd,
      decodedBodyBytes: ticketRequests.reduce((sum, entry) => sum + entry.decodedBodyBytes, 0),
      cumulativeServerMs: ticketRequests.reduce((sum, entry) => sum + entry.serverMs, 0),
    };
    const parseReplay = diagnostics ? await page.evaluate(async (urls) => {
      // Re-fetch using the original cursors, then time only synchronous parsing.
      const texts = [];
      for (const url of urls) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('JSON replay failed for ' + url);
        texts.push(await response.text());
      }
      return Array.from({ length: 6 }, (_, run) => {
        const start = performance.now();
        let tickets = 0;
        for (const text of texts) tickets += JSON.parse(text).tickets.length;
        return { run, warmup: run === 0, duration: performance.now() - start, tickets };
      });
    }, ticketRequests.map((entry) => entry.url)) : undefined;
    if (options.screenshots && run === rounds - 1) {
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await page.screenshot({ path: path.join(out, [runLabel, fixture.key, variant.name].join('-') + '.png') });
    }
    return {
      fixture: fixture.key, view: fixture.view, variant: variant.name, run, warmup: run === 0,
      size: result.ids.length, idHash: hash(JSON.stringify(result.ids)),
      geometryHash: hash(JSON.stringify(result.geometry)),
      tagMarkupHash: hash(JSON.stringify(result.tagMarkup)),
      timing: result.timing, metrics, ticketTiming, ticketRequests, resources: result.resources,
      marks: result.marks, parseReplay, laneSizes: result.laneSizes, scrollHeights: result.scrollHeights,
      rowElementCount: result.rowElementCount, elements: result.elements, useCount: result.useCount, errors,
    };
  } finally {
    await context.close();
  }
}

function observe({ kanban, total, firstId, countsByLane }) {
  localStorage.setItem('kanbalone:language', 'en');
  performance.setResourceTimingBufferSize(2048);
  const probe = { first: null, complete: null, lanes: {}, longTasks: [] };
  window.__renderProbe = probe;
  new PerformanceObserver((list) => {
    probe.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })));
  }).observe({ type: 'longtask', buffered: true });
  const firstLanesScheduled = new Set();
  let firstScheduled = false;
  const afterFrames = (finish) => requestAnimationFrame(() => requestAnimationFrame(() => finish(performance.now())));
  document.addEventListener('DOMContentLoaded', () => {
    const target = document.querySelector(kanban ? '#lane-board' : '#group-board');
    if (!target) throw new Error('Probe board root is missing');
    const observer = new MutationObserver(check);
    observer.observe(target, { subtree: true, childList: true });
    check();

    function check() {
      const rows = target.getElementsByClassName(kanban ? 'ticket-card' : 'group-ticket-row');
      if (!rows.length) return;
      const actualFirst = Number(kanban ? rows[0].dataset.ticketId : rows[0].querySelector('.ticket-ref').textContent.slice(1));
      if (actualFirst !== firstId) return;
      if (!firstScheduled) {
        firstScheduled = true;
        const firstMutationAt = performance.now();
        afterFrames((at) => {
          probe.firstMutation = firstMutationAt;
          probe.first = at;
        });
      }
      if (kanban) {
        for (const laneId of Object.keys(countsByLane)) {
          if (firstLanesScheduled.has(laneId)) continue;
          if (!target.querySelector('.ticket-list[data-lane-id="' + laneId + '"] > .ticket-card')) continue;
          firstLanesScheduled.add(laneId);
          const firstMutationAt = performance.now();
          afterFrames((at) => {
            probe.lanes[laneId] = { firstMutation: firstMutationAt, first: at };
          });
        }
      }
      if (rows.length !== total) return;
      observer.disconnect();
      const completeMutationAt = performance.now();
      afterFrames((at) => {
        probe.completeMutation = completeMutationAt;
        probe.complete = at;
      });
    }
  });
}

function inspect({ kanban, boardId }) {
  const target = document.querySelector(kanban ? '#lane-board' : '#group-board');
  const rows = Array.from(target.getElementsByClassName(kanban ? 'ticket-card' : 'group-ticket-row'));
  const ids = rows.map((row) =>
    Number(kanban ? row.dataset.ticketId : row.querySelector('.ticket-ref').textContent.slice(1)),
  );
  const lists = kanban ? Array.from(target.querySelectorAll('.ticket-list')) : [target];
  const route = '/api/boards/' + boardId;
  return {
    timing: window.__renderProbe, ids,
    geometry: rows.map((row) => {
      const { x, y, width, height } = row.getBoundingClientRect();
      return [x, y, width, height];
    }),
    tagMarkup: rows.map((row) => row.querySelector('.tag-list')?.innerHTML ?? ''),
    laneSizes: lists.map((list) => list.getElementsByClassName('ticket-card').length),
    scrollHeights: lists.map((list) => list.scrollHeight),
    elements: document.getElementsByTagName('*').length,
    rowElementCount: target.getElementsByTagName('*').length,
    useCount: target.getElementsByTagName('use').length,
    resources: performance.getEntriesByType('resource').filter((entry) => {
      const url = new URL(entry.name);
      return url.pathname.startsWith('/api/') && !url.pathname.endsWith('/events');
    }).map((entry) => {
      const url = new URL(entry.name);
      const ticketUrl = url.pathname === route + '/tickets';
      return {
        url: url.pathname + url.search,
        apiType: ticketUrl && url.searchParams.get('limit') !== '1' ? 'ticket-pages' : 'other',
        start: entry.startTime, headers: entry.responseStart, end: entry.responseEnd,
        decodedBodyBytes: entry.decodedBodySize, encodedBodyBytes: entry.encodedBodySize,
        serverMs: entry.serverTiming.find((value) => value.name === 'kanbalone')?.duration ?? null,
      };
    }),
    marks: performance.getEntriesByType('measure').filter((entry) => entry.name.startsWith('kanbalone-')).map((entry) => ({
      name: entry.name, start: entry.startTime, duration: entry.duration, detail: entry.detail,
    })),
  };
}

function instrument(variant, runDir) {
  const staticDir = path.join(runDir, 'public');
  mkdirSync(staticDir);
  cpSync(variant.staticDir, staticDir, { recursive: true });
  function patch(file, replacements) {
    const target = path.join(staticDir, file);
    let source = readFileSync(target, 'utf8');
    for (const [needle, replacement] of replacements) {
      assert.equal(source.split(needle).length, 2, file + ' instrumentation anchor changed');
      source = source.replace(needle, replacement);
    }
    writeFileSync(target, source);
  }
  function mark(name, start, detail) {
    return "performance.measure('kanbalone-" + name + "', { start: " + start + ", end: performance.now()"
      + (detail ? ', detail: ' + detail : '') + " });";
  }
  patch('app-api.js', [[
    '  const payload = await response.json();',
    '  const jsonStarted = performance.now();\n  const payload = await response.json();\n  '
      + mark('response-json-await', 'jsonStarted', 'url.toString()'),
  ]]);
  patch('app-group-board.js', [
    ['    const html = renderGroupViewSections(', '    const groupHtmlStarted = performance.now();\n    const html = renderGroupViewSections('],
    ['    for (const name of ["list", "header", "footer"]) {', '    if (updateTickets) { ' + mark('group-html', 'groupHtmlStarted', 'tickets.length') + ' }\n    for (const name of ["list", "header", "footer"]) {'],
    ['      sections.tickets.innerHTML = html.tickets ?? "";', '      const groupDomStarted = performance.now();\n      sections.tickets.innerHTML = html.tickets ?? "";\n      ' + mark('group-dom', 'groupDomStarted', 'tickets.length')],
  ]);
  patch('app-kanban-board.js', [
    ['      const fragments = new Map();', '      const cardsStarted = performance.now();\n      const fragments = new Map();'],
    ['      for (const [laneIndex, fragment] of fragments.entries()) {', '      ' + mark('kanban-create-cards', 'cardsStarted', 'selections.length') + '\n      const kanbanDomStarted = performance.now();\n      for (const [laneIndex, fragment] of fragments.entries()) {'],
    ['      for (const queue of laneQueues) {\n        if (!queue.afterRenderDone', '      ' + mark('kanban-append-cards', 'kanbanDomStarted', 'selections.length') + '\n      for (const queue of laneQueues) {\n        if (!queue.afterRenderDone'],
  ]);
  return staticDir;
}
