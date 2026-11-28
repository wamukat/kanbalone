import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const [runtime, output, baselineUrl, candidateUrl, runsText = '3'] = process.argv.slice(2);
const { chromium } = createRequire(path.join(runtime, 'package.json'))('@playwright/test');
const phases = [{ label: 'before', url: baselineUrl }, { label: 'after', url: candidateUrl }].filter(phase => phase.url);
const rounds = Number(runsText);
const browser = await chromium.launch({ headless: true });
const samples = [];

for (let round = 0; round < rounds; round++) {
  for (const phase of round % 2 ? phases.toReversed() : phases) {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, colorScheme: 'light', locale: 'en-US' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.addInitScript(() => {
        localStorage.setItem('kanbalone:language', 'en');
        let queued = false;
        const selector = '.list-row[data-list-row-ticket-id]';
        const observer = new MutationObserver(() => {
          if (queued || !document.querySelector(selector)) return;
          queued = true;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const row = document.querySelector(selector);
            const bounds = row?.getBoundingClientRect();
            if (!bounds?.height || bounds.bottom <= 0 || bounds.top >= innerHeight || row.closest('[hidden]')) {
              queued = false;
              return;
            }
            window.__listMeasurements = { milliseconds: Math.round(performance.now()), mountedRows: document.querySelectorAll(selector).length };
            observer.disconnect();
          }));
        });
        observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
      });
      const response = await page.goto(`${phase.url}/boards/2/list`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200);
      await page.waitForFunction(() => window.__listMeasurements != null, null, { timeout: 30000 });
      const initial = await page.evaluate(() => {
        const reads = performance.getEntriesByType('resource').filter(entry => /\/api\/boards\/2\/(?:tickets\?|list-ticket-references\?)/.test(entry.name));
        return { ...window.__listMeasurements, requests: reads.length, bytes: reads.reduce((n, e) => n + e.encodedBodySize, 0) };
      });
      const observed = [];
      for (const fraction of [0, 0.17, 0.52, 0.89, 1]) {
        observed.push(await page.locator('.list-viewport').evaluate(async (viewport, target) => {
          const records = [];
          const start = performance.now();
          viewport.scrollTop = target * (viewport.scrollHeight - viewport.clientHeight);
          let stable = 0;
          let prior = '';
          for (let frame = 0; frame < 25; frame++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const remaining = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
            if (target === 1 && remaining > 1 && frame < 4) viewport.scrollTop = viewport.scrollHeight;
            const bounds = viewport.getBoundingClientRect();
            const rows = [...viewport.querySelectorAll('.list-row[data-list-row-ticket-id]')];
            const visible = rows.map(row => ({ id: Number(row.dataset.listRowTicketId), rect: row.getBoundingClientRect() }))
              .filter(({ rect }) => rect.bottom > bounds.top + 1 && rect.top < bounds.bottom - 1);
            const key = `${Math.round(viewport.scrollTop)}:${visible.map(row => row.id).join(',')}`;
            stable = key === prior && visible.length ? stable + 1 : 0;
            prior = key;
            records.push({ mounted: rows.length, visible: visible.map(x => x.id) });
            if (stable >= 2) {
              const first = visible[0];
              const last = visible.at(-1);
              return { target, milliseconds: Math.round(performance.now() - start), frames: records.length, renderedRows: Math.max(...records.map(r => r.mounted)), visible: visible.map(x => x.id), emptyFrames: records.filter(r => !r.visible.length).length,
                firstClippedBy: Math.round(bounds.top - first.rect.top), uncoveredEnd: Math.round(bounds.bottom - last.rect.bottom),
                heightRange: [Math.min(...visible.map(x => x.rect.height)), Math.max(...visible.map(x => x.rect.height))], scrollTop: viewport.scrollTop, scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight };
            }
          }
          return { target, records };
        }, fraction));
      }
      const stableEnd = observed.at(-1);
      assert.ok(stableEnd.visible?.length >= 2, JSON.stringify(stableEnd));
      assert.ok(observed.every(x => x.visible?.length > 0 && x.renderedRows < 140));
      assert.ok(Math.abs(stableEnd.scrollHeight - stableEnd.clientHeight - stableEnd.scrollTop) <= 1, JSON.stringify(stableEnd));
      const originId = stableEnd.visible.at(-2);
      await page.locator(`.list-ticket-link[data-open-ticket-id="${originId}"]`).focus();
      await page.keyboard.press('ArrowDown');
      const keyboardId = await page.evaluate(() => Number(document.activeElement.dataset.openTicketId));
      assert.equal(keyboardId, stableEnd.visible.at(-1));
      assert.deepEqual(errors, []);
      samples.push({ round, phase: phase.label, initial, jumps: observed, keyboardId });
      fs.writeFileSync(output, JSON.stringify({ viewport: '1024×768', board: 'Existing historical 10,005-ticket synthetic board plus rich tags on 113 rows', archiveView: '10,005 total; 9,995 unarchived', browser: browser.version(), samples }, null, 2) + '\n');
      console.log(`${phase.label} ${round} initial=${initial.milliseconds}ms mounted=${initial.mountedRows} jumps=${observed.map(x=>x.milliseconds).join(',')}ms`);
    } finally {
      await context.close();
    }
  }
}
await browser.close();
