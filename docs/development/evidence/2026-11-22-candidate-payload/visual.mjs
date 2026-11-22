import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { captureSettled, openPicker, waitForStartedServer, watchBrowserErrors } from './browser-tools.mjs';
import { out, writeJson } from './config.mjs';

const images = resolve(out, 'visual');
mkdirSync(images, { recursive: true });
const browser = await chromium.launch();
const records = [];

async function createFixture(api) {
  const { board, lanes } = await api('POST', '/api/boards', {
    name: 'Candidate collection review', laneNames: ['Todo', 'Later'],
  });
  const laterLane = await api('PATCH', `/api/lanes/${lanes[1].id}`, { isCompletionLane: true });
  assert.equal(laterLane.isCompletionLane, true);
  function make(title, extra = {}) {
    return api('POST', `/api/boards/${board.id}/tickets`, { title, laneId: lanes[0].id, ...extra });
  }

  const root = await make('Choice subject');
  const parent = await make('Choice parent');
  await make('Archived descendant', { parentTicketId: parent.id, isArchived: true });
  const low = await make('Choice low', { priority: 1 });
  const high = await make('Choice high archived', { priority: 4, isArchived: true });
  const equal = await make('Choice equal', { priority: 4, laneId: laterLane.id });
  assert.equal(equal.isResolved, true);
  const other = await make('Different parent');
  const otherChild = await make('Choice existing child', { parentTicketId: other.id });
  for (let index = 0; index < 201; index++) {
    await make(`Filler ${index}`, { laneId: lanes[1].id, isArchived: true });
  }
  const late = await make('Choice late archived', {
    laneId: lanes[1].id, priority: 3, isArchived: true,
  });
  const blocked = await make('Choice waiting for subject', { blockerIds: [root.id] });
  assert.equal(blocked.id, 211);

  const expected = {
    parent: [high.id, equal.id, late.id, parent.id, blocked.id, low.id],
    blocker: [high.id, equal.id, late.id, parent.id, otherChild.id, low.id],
    related: [high.id, equal.id, late.id, parent.id, otherChild.id, blocked.id, low.id],
    child: [high.id, equal.id, late.id, blocked.id, low.id],
  };
  return { root, high, low, equal, late, expected };
}

function options(page, type) {
  return page.locator(`#ticket-${type}-options [data-${type}-id]`);
}

async function optionIds(page, type) {
  return options(page, type).evaluateAll(
    (elements, attribute) => elements.map((element) => Number(element.getAttribute(attribute))),
    `data-${type}-id`,
  );
}

async function visualCase(phase, lang, theme, width) {
  const key = `${lang}-${theme}-${width}-${phase}`;
  const server = spawn(process.execPath, [
    '--import', 'tsx', resolve(out, 'server.mjs'), phase, 'visual',
  ], { stdio: ['ignore', 'pipe', 'inherit'] });
  const context = await browser.newContext({
    viewport: { width, height: 1000 }, locale: lang === 'ja' ? 'ja-JP' : 'en-US', colorScheme: theme,
  });
  try {
    const { url } = await waitForStartedServer(server);
    async function api(method, path, data) {
      const response = await context.request.fetch(url + path, { method, data });
      assert(response.ok(), `${method} ${path} returned ${response.status()}`);
      return response.json();
    }

    const { root, high, low, equal, late, expected } = await createFixture(api);
    const page = await context.newPage();
    const errors = watchBrowserErrors(page);
    await page.goto(`${url}/tickets/${root.id}`);
    await page.locator('#header-edit-button').click();
    const capture = (state) => captureSettled(page, resolve(images, `${key}-${state}.png`));

    async function inspect(captureImages) {
      for (const [type, orderedIds] of Object.entries(expected)) {
        const search = await openPicker(page, type);
        await search.fill('Choice');
        await expect.poll(() => optionIds(page, type)).toEqual(orderedIds);
        await expect(search).toBeFocused();
        const resolved = page.locator(`#ticket-${type}-options [data-${type}-id="${equal.id}"] .ticket-picker-meta`);
        await expect(resolved).toHaveText(lang === 'ja' ? '完了' : 'Resolved');
        if (captureImages) {
          await options(page, type).first().scrollIntoViewIfNeeded();
          await capture(type);
        }
      }
    }

    const selections = [
      ['related', high], ['related', low], ['blocker', equal], ['child', late],
    ];
    async function select() {
      for (const [type, ticket] of selections) {
        const search = page.locator(`#ticket-${type}-search`);
        await search.fill(ticket.title);
        await expect.poll(() => optionIds(page, type)).toEqual([ticket.id]);
        await search.press('Enter');
      }
      assert.deepEqual(
        await page.locator('#ticket-related-summary [data-remove-related-id]').evaluateAll(
          (elements) => elements.map((element) => Number(element.dataset.removeRelatedId)),
        ), [high.id, low.id],
      );
    }

    await inspect(true);
    // A partial ID is intentionally allowed to match several options, e.g. #5 and #50.
    const childSearch = page.locator('#ticket-child-search');
    await childSearch.fill('#5');
    await expect.poll(() => optionIds(page, 'child')).toEqual(
      [5, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
    );
    const substringIds = await optionIds(page, 'child');
    assert(substringIds.includes(5) && substringIds.includes(50));

    await select();
    await capture('selected');
    await page.locator('#cancel-edit-button').click();
    await page.locator('#ux-submit-button').click();
    const canceled = await api('GET', `/api/tickets/${root.id}`);
    const canceledChild = await api('GET', `/api/tickets/${late.id}`);
    assert.deepEqual(canceled.relatedIds, []);
    assert.deepEqual(canceled.blockerIds, []);
    assert.deepEqual(canceled.children, []);
    assert.equal(canceledChild.parentTicketId, null);

    await page.locator('#header-edit-button').click();
    await inspect(false);
    await select();
    await page.locator('#editor-form button[type="submit"]').click();
    await expect(page.locator('#ticket-view')).toBeVisible();
    await capture('saved');
    const saved = await api('GET', `/api/tickets/${root.id}`);
    const savedChild = await api('GET', `/api/tickets/${late.id}`);
    const childIds = saved.children.map(({ id }) => id);
    assert.deepEqual([...saved.relatedIds].sort((a, b) => a - b), [low.id, high.id]);
    assert.deepEqual(saved.blockerIds, [equal.id]);
    assert.deepEqual(childIds, [late.id]);
    assert.equal(savedChild.parentTicketId, root.id);

    await page.reload();
    await page.locator('#header-edit-button').click();
    for (const [type, ticket] of selections) {
      await expect(page.locator(`#ticket-${type}-summary`)).toContainText(ticket.title);
    }
    assert.deepEqual(errors, [], JSON.stringify(errors));
    records.push({
      key, expected, substringIds, selectedRelatedOrder: [high.id, low.id],
      resolvedCandidate: { id: equal.id, label: lang === 'ja' ? '完了' : 'Resolved' },
      canceled: {
        relatedIds: canceled.relatedIds, blockerIds: canceled.blockerIds,
        childIds: canceled.children.map(({ id }) => id), childParentId: canceledChild.parentTicketId,
      },
      saved: {
        relatedIds: saved.relatedIds, blockerIds: saved.blockerIds,
        childIds, childParentId: savedChild.parentTicketId,
      },
      reloaded: true, errors,
    });
    writeJson('interaction-results.json', { browser: browser.version(), records });
    console.log(key, 'PASS');
  } finally {
    await context.close();
    if (server.exitCode === null && server.signalCode === null) {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
  }
}

try {
  for (const lang of ['en', 'ja']) {
    for (const [theme, width] of [['light', 1440], ['dark', 390]]) {
      for (const phase of ['before', 'after']) await visualCase(phase, lang, theme, width);
    }
  }
} finally {
  await browser.close();
}
