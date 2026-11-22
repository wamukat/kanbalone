import { chromium, expect } from '@playwright/test';
import { createRuntime } from './fixture.mjs';

const runtime = await createRuntime('after');
const browser = await chromium.launch();

async function seedBoard(name) {
  const { board, lanes } = await runtime.api('POST', '/api/boards', { name, laneNames: ['Todo'] });
  const base = '/api/boards/' + board.id;
  const group = await runtime.api('POST', base + '/groups', { name: name + ' group' });
  const ticket = await runtime.api('POST', base + '/tickets', { title: name + ' unassigned', laneId: lanes[0].id });
  return { board, group, ticket };
}

async function verifyLateResponse(source, destination, limit, status) {
  const page = await browser.newPage({ locale: 'en-US' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const choice = page.locator('[data-select-group="ungrouped"]');
  const row = (ticket) => page.locator('[data-group-ticket="' + ticket.id + '"]');
  try {
    // Remember Group mode for the destination before switching via the sidebar.
    for (const { board, group } of [destination, source]) {
      await page.goto(runtime.url + '/boards/' + board.id + '/group');
      await expect(page.locator('.group-name')).toHaveText(group.name);
    }
    // Hold the old board's real response at the browser fetch boundary.
    await page.evaluate(({ boardId, limit, status }) => {
      const fetchOriginal = window.fetch.bind(window);
      let release;
      const barrier = new Promise((resolve) => { release = resolve; });
      window.__groupReview = { held: 0, released: 0, release };
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        const response = await fetchOriginal(input, init);
        if (url.pathname === '/api/boards/' + boardId + '/tickets' &&
            url.searchParams.get('ungrouped') === 'true' && url.searchParams.get('limit') === limit) {
          window.__groupReview.held++;
          await barrier;
          window.__groupReview.released++;
          if (status === 503) {
            return new Response('{"error":"stale A failure"}', {
              status: 503, headers: { 'content-type': 'application/json' },
            });
          }
        }
        return response;
      };
    }, { boardId: source.board.id, limit, status });
    await choice.click();
    await expect.poll(() => page.evaluate(() => window.__groupReview.held)).toBeGreaterThan(0);
    await page.locator('[data-board-id="' + destination.board.id + '"]').click();
    await expect(page.locator('#board-title')).toHaveText(destination.board.name);
    if (!await page.locator('.group-name').isVisible()) {
      await page.getByRole('button', { name: 'Group', exact: true }).click();
    }
    await expect(page.locator('.group-name')).toHaveText(destination.group.name);
    await choice.click();
    await expect(row(destination.ticket)).toBeVisible();
    await page.evaluate(() => window.__groupReview.release());
    await expect.poll(() => page.evaluate(() => window.__groupReview.released)).toBeGreaterThan(0);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    await expect(page.locator('#board-title')).toHaveText(destination.board.name);
    await expect(choice).toHaveAttribute('aria-current', 'true');
    await expect(row(destination.ticket)).toBeVisible();
    await expect(row(source.ticket)).toHaveCount(0);
    await expect(page.locator('.group-error')).toBeEmpty();
    expect(errors).toEqual([]);
    return { limit: Number(limit), status, released: await page.evaluate(() => window.__groupReview.released),
      selectedBoard: destination.board.id, visibleTicket: destination.ticket.id, errors };
  } finally {
    await page.close();
  }
}

try {
  const source = await seedBoard('Board A');
  const destination = await seedBoard('Board B');
  const results = [];
  for (const [limit, status] of [['1', 200], ['200', 200], ['200', 503]]) {
    results.push(await verifyLateResponse(source, destination, limit, status));
  }
  console.log(JSON.stringify({ node: process.version, chromium: browser.version(), results }, null, 2));
} finally {
  await browser.close();
  await runtime.close();
}
