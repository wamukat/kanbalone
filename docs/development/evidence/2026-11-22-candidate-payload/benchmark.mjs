import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  collectionUrl, matchesCollection, out, phaseOrder, runs,
  variants, workloads, writeJson,
} from './config.mjs';
import { captureSettled, openPicker, watchBrowserErrors } from './browser-tools.mjs';

const api = JSON.parse(readFileSync(resolve(out, 'api-probe.json'), 'utf8')).samples;
const queries = [
  ['first', '999'], ['repeat', '998'], ['no-match', 'not-a-real-candidate'],
];
const browser = await chromium.launch();
const result = { browser: browser.version(), node: process.version, samples: [] };

async function measure(page, query) {
  await page.evaluate((text) => {
    const input = document.querySelector('#ticket-child-search');
    const options = document.querySelector('#ticket-child-options');
    input.value = text;
    const start = performance.now();
    const result = { start };
    window.candidateMeasurement = result;
    const observer = new MutationObserver(() => {
      if (options.getAttribute('aria-busy') === 'true' || !options.children.length) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        result.ms = performance.now() - start;
        result.ids = [...options.querySelectorAll('[data-child-id]')]
          .map((element) => Number(element.dataset.childId));
        result.focused = document.activeElement === input;
      }));
    });
    observer.observe(options, { childList: true, subtree: true, attributes: true });
    input.dispatchEvent(new Event('input', { bubbles: true }));
    result.syncMs = performance.now() - start;
  }, query);
  await page.waitForFunction(() => window.candidateMeasurement?.ms !== undefined, {}, { timeout: 90000 });
  return page.evaluate(() => window.candidateMeasurement);
}

async function getResources(page) {
  return page.evaluate(() => performance.getEntriesByType('resource').map((entry) => ({
    url: entry.name, start: entry.startTime, end: entry.responseEnd,
    bytes: entry.encodedBodySize, responseStatus: entry.responseStatus,
  })));
}

function isBoardCandidateCollection(entry, base, boardId) {
  const url = new URL(entry.url);
  const route = `/api/boards/${boardId}`;
  return url.origin === base && (url.pathname === `${route}/relation-candidates`
    || url.pathname === `${route}/tickets` && url.searchParams.get('archived') === 'all');
}

async function exercise(phase, { boardId, ticketId, count }, run, expected, capture = false) {
  const { base } = variants[phase];
  const collection = collectionUrl(phase, boardId);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, locale: 'en-US', colorScheme: 'light',
  });
  try {
    const page = await context.newPage();
    const errors = watchBrowserErrors(page);
    await page.goto(`${base}/tickets/${ticketId}`);
    await page.locator('#header-edit-button').click();
    const search = await openPicker(page, 'child');
    await search.focus();
    await page.waitForLoadState('networkidle');
    const initialCollection = (await getResources(page))
      .filter(({ url }) => matchesCollection(new URL(url), collection));
    assert.deepEqual(initialCollection, [], 'Candidate requests started before searching');

    for (const [kind, query] of capture ? queries.slice(0, 2) : queries) {
      const measured = await measure(page, query);
      assert.equal(measured.focused, true, `${phase}/${count}/${kind} moved focus`);
      assert.equal(measured.ids.length === 0, kind === 'no-match');
      if (!expected.has(kind)) expected.set(kind, measured.ids);
      assert.deepEqual(measured.ids, expected.get(kind));
      const requests = (await getResources(page))
        .filter((entry) => entry.start >= measured.start && isBoardCandidateCollection(entry, base, boardId));
      assert(requests.every(({ url }) => matchesCollection(new URL(url), collection)));
      const bytes = requests.reduce((total, request) => total + request.bytes, 0);
      const apiRecord = api.find((record) => record.phase === phase && record.count === count && record.run === run);
      assert.equal(requests.length, kind === 'first' ? apiRecord.requests.length : 0);
      assert.equal(bytes, kind === 'first' ? apiRecord.bytes : 0);
      assert(requests.every((request) => request.responseStatus === 200));
      assert.deepEqual(errors, [], JSON.stringify(errors));
      if (!capture) {
        result.samples.push({
          phase, count, run, warmup: run === 0, kind, query, ...measured,
          requests, bytes, errors: [...errors],
        });
        console.log(count, run, phase, kind, measured.ms.toFixed(1), bytes, measured.ids.length);
      }
    }
    if (capture) await captureSettled(page, resolve(out, `${phase}-${count}.png`));
  } finally {
    await context.close();
  }
}

try {
  const expectedByCount = new Map();
  for (const workload of workloads) {
    const expected = new Map();
    expectedByCount.set(workload.count, expected);
    for (let run = 0; run < runs; run++) {
      for (const phase of phaseOrder(run)) {
        await exercise(phase, workload, run, expected);
        writeJson('benchmark.json', result);
      }
    }
  }
  for (const workload of workloads) {
    for (const phase of ['before', 'after']) {
      await exercise(phase, workload, 0, expectedByCount.get(workload.count), true);
    }
  }
} finally {
  await browser.close();
}
