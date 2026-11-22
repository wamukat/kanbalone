import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve('coverage/ticket-collection-projections/visual');
const baseline = resolve(out, '../baseline');
const candidate = process.cwd();
const { chromium, expect } = createRequire(resolve(candidate, 'package.json'))('@playwright/test');
const phases = { before: baseline, after: candidate };
const cases = [
  { locale: 'en-US', theme: 'light', viewport: { width: 1440, height: 900 } },
  { locale: 'ja-JP', theme: 'dark', viewport: { width: 390, height: 844 } },
];
mkdirSync(out, { recursive: true });
const imageHash = file => createHash('sha256').update(readFileSync(file)).digest('hex');

async function capture(page, file) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const path = resolve(out, file + '.png');
  await page.screenshot({ path, animations: 'disabled' });
  const rows = await page.locator('.group-ticket-row, .list-window .list-row').evaluateAll(nodes =>
    nodes.filter(node => node.getClientRects().length).map(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return [node.className, x, y, width, height];
    }));
  return { file: file + '.png', sha256: imageHash(path), rows };
}

async function serve(source) {
  const dir = mkdtempSync(resolve(tmpdir(), 'kanbalone-projection-visual-'));
  const { buildApp } = await import(pathToFileURL(resolve(source, 'src/app.ts')));
  const app = buildApp({ dbFile: resolve(dir, 'fixture.sqlite'), staticDir: resolve(source, 'public'), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  return {
    url,
    async api(method, route, data) {
      const response = await fetch(url + route, {
        method,
        ...(data && { headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
      });
      const text = await response.text();
      assert(response.ok, method + ' ' + route + ' ' + response.status + ' ' + text);
      return text ? JSON.parse(text) : null;
    },
    async close() {
      app.server.closeAllConnections();
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function createFixture(api) {
  const { board, lanes: [ready, doing, done] } = await api('POST', '/api/boards', { name: 'Delivery review', laneNames: ['Ready', 'Doing', 'Done'] });
  const base = '/api/boards/' + board.id;
  await api('PATCH', '/api/lanes/' + done.id, { isCompletionLane: true });
  const group = await api('POST', base + '/groups', { name: 'Launch checklist', descriptionMarkdown: 'Confirm readiness before launch.' });
  const planning = await api('POST', base + '/tags', { name: 'Planning', color: '#356F5C' });
  const review = await api('POST', base + '/tags', { name: 'Needs review', color: '' });
  const ticket = (title, fields = {}) => api('POST', base + '/tickets', { title, laneId: ready.id, ...fields });
  const later = await ticket('Get deployment sign-off', { laneId: doing.id, priority: 1 });
  const earlier = await ticket('Publish release notes', { priority: 2 });
  const listParent = await ticket('Coordinate launch handoff', {
    priority: 4, blockerIds: [later.id, earlier.id], tagIds: [planning.id],
  });
  const listChild = await ticket('Update handoff checklist', { priority: 4, parentTicketId: listParent.id });
  const hiddenSibling = await ticket('File supporting notes', { priority: 2, parentTicketId: listParent.id });
  const groupParent = await ticket('Review the rollout checklist and confirm operational ownership', {
    groupId: group.id, priority: 3, tagIds: [planning.id, review.id],
  });
  const groupChild = await ticket('Verify backup and recovery evidence', {
    parentTicketId: groupParent.id, priority: 2, tagIds: [review.id],
  });
  await api('PATCH', '/api/tickets/' + groupParent.id, { isArchived: true });
  const groupPeer = await ticket('Confirm launch window', { groupId: group.id, priority: 2, tagIds: [planning.id] });
  return { board, ready, doing, done, group, later, earlier, listParent, listChild, hiddenSibling, groupParent, groupChild, groupPeer };
}

const preferences = (id, priority) => ({
  version: 1,
  activeBoardId: id,
  boards: {
    [id]: {
      filters: { q: '', lane: '', status: ['open', 'resolved'], includeArchived: false, priority, tag: '' },
      viewMode: 'list',
      filterExpansion: { status: false, priority: false },
    },
  },
});

async function verify(browser, phase, settings) {
  const runtime = await serve(phases[phase]);
  const context = await browser.newContext({ locale: settings.locale, colorScheme: settings.theme, viewport: settings.viewport });
  const images = [];
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));
  page.on('request', req => {
    const url = new URL(req.url());
    if (/^\/api\/boards\/\d+\/(?:tickets|group-tickets|list-ticket-references)$/.test(url.pathname)) requests.push(url.pathname + url.search);
  });
  const { url, api } = runtime;
  const save = async (entry, state) => images.push(await capture(page, [entry, phase, settings.locale, settings.theme, state].join('-')));
  try {
    const f = await createFixture(api);
    const groupUrl = url + '/boards/' + f.board.id + '/group';
    const listUrl = url + '/boards/' + f.board.id + '/list';
    const get = id => api('GET', '/api/tickets/' + id);
    const groupRow = id => page.locator('[data-group-ticket="' + id + '"]');
    const groupRemove = page.locator('[data-group-remove="' + f.groupParent.id + '"]');
    const groupChoice = sel => page.locator('[data-select-group="' + sel + '"]');
    const ux = page.locator('#ux-dialog');
    const cancel = page.locator('#ux-cancel-button');
    const submit = page.locator('#ux-submit-button');

    await page.goto(groupUrl);
    await expect(groupRow(f.groupChild.id)).toBeVisible();
    await expect(page.locator('.group-ticket-context')).toContainText(f.groupParent.title);
    await expect(page.locator('.group-ticket-context .group-ticket-tags .tag')).toHaveCount(2);
    await expect(groupChoice('ungrouped')).toBeVisible();
    const groupReads = requests.splice(0);
    assert(groupReads.some(path => phase === 'before' ? path.includes('archived=all') : path.includes('/group-tickets')));
    await save('1524', 'archived-parent');

    await groupRemove.focus();
    await page.keyboard.press('Enter');
    await expect(ux).toBeVisible();
    await save('1524', 'remove-confirm');
    await cancel.click();
    await expect(ux).toBeHidden();
    await expect(groupRemove).toBeFocused();
    assert.equal((await get(f.groupChild.id)).groupId, f.group.id);
    await groupRemove.press('Enter');
    await expect(ux).toBeVisible();
    await submit.click();
    await expect(groupRow(f.groupChild.id)).toHaveCount(0);
    const afterGroup = await Promise.all([get(f.groupParent.id), get(f.groupChild.id)]);
    assert.deepEqual(afterGroup.map(t => t.groupId), [null, null]);
    assert.deepEqual(afterGroup.map(t => t.parentTicketId), [null, f.groupParent.id]);
    await page.reload();
    await expect(groupRow(f.groupPeer.id)).toBeVisible();
    await expect(groupRow(f.groupChild.id)).toHaveCount(0);
    await groupChoice('ungrouped').click();
    await expect(groupRow(f.groupChild.id)).toBeVisible();
    await save('1524', 'ungrouped-after-save-and-reload');

    await page.evaluate(value => localStorage.setItem('kanbalone:ui-preferences', JSON.stringify(value)), preferences(f.board.id, ['urgent']));
    requests.length = 0;
    await page.goto(listUrl);
    const parent = page.locator('.list-row', { hasText: f.listParent.title });
    const childSelection = page.locator('[data-list-ticket-id="' + f.listChild.id + '"]');
    const hiddenSelection = page.locator('[data-list-ticket-id="' + f.hiddenSibling.id + '"]');
    const parentCheckbox = page.locator('[data-list-ticket-id="' + f.listParent.id + '"]');
    await expect(parent).toBeVisible();
    await expect(childSelection).toBeVisible();
    await expect(hiddenSelection).toHaveCount(0);
    const blockerIds = await parent.locator('.list-relation-ticket-link').evaluateAll(nodes => nodes.map(node => Number(node.dataset.openTicketId)));
    assert.deepEqual(blockerIds, [f.earlier.id, f.later.id]);
    assert(requests.some(path => path.includes('priority=4')));
    assert(requests.some(path => phase === 'before'
      ? path.includes('/tickets?') && !path.includes('priority=')
      : path.includes('/list-ticket-references?')));
    const partialReads = requests.splice(0);
    await save('1525', 'partial-with-blockers');
    await parent.locator('[data-select-family-ticket-id]').click();
    await expect(parentCheckbox).toBeChecked();
    await expect(childSelection).toBeChecked();
    const move = page.locator('[data-bulk-move-board]').first();
    await move.click();
    await expect(ux).toBeVisible();
    const laneSelect = page.locator('[data-bulk-move-lane-select]');
    const readyOption = laneSelect.locator('option[value="' + f.ready.id + '"]');
    await expect(readyOption).toHaveCount(0);
    await save('1525', 'move-selected-family');
    await cancel.click();
    await expect(ux).toBeHidden();
    assert.deepEqual((await Promise.all([get(f.listParent.id), get(f.listChild.id)])).map(t => t.laneId), [f.ready.id, f.ready.id]);
    await move.click();
    await laneSelect.selectOption(String(f.doing.id));
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/tickets/bulk-move') && response.request().method() === 'POST' && response.ok()), submit.click()]);
    await expect(parent).toContainText(f.doing.name);
    const afterList = await Promise.all([get(f.listParent.id), get(f.listChild.id), get(f.hiddenSibling.id)]);
    assert.deepEqual(afterList.map(t => t.laneId), [f.doing.id, f.doing.id, f.ready.id]);
    assert.deepEqual(afterList.map(t => t.parentTicketId), [null, f.listParent.id, f.listParent.id]);
    await page.reload();
    await expect(parent).toContainText(f.doing.name);
    await expect(childSelection).toBeVisible();
    await expect(hiddenSelection).toHaveCount(0);
    await save('1525', 'partial-after-move-and-reload');

    await page.evaluate(value => localStorage.setItem('kanbalone:ui-preferences', JSON.stringify(value)), preferences(f.board.id, ['low', 'medium', 'high', 'urgent']));
    requests.length = 0;
    await page.reload();
    await expect(hiddenSelection).toBeVisible();
    const allReads = requests.splice(0);
    assert.equal(allReads.length, phase === 'before' ? 2 : 1);
    assert(allReads.some(path => path.includes('priority=1%2C2%2C3%2C4')));
    await save('1525', 'all-priorities');
    assert.deepEqual(errors, []);
    return { phase, ...settings, images, groupReads, partialReads, allReads, blockerIds, groupMembership: afterGroup.map(t => [t.id, t.groupId, t.parentTicketId]), listMove: afterList.map(t => [t.id, t.laneId, t.parentTicketId]), errors };
  } finally {
    await context.close();
    await runtime.close();
  }
}

const browser = await chromium.launch();
const rows = [];
try {
  for (const settings of cases) {
    for (const phase of Object.keys(phases)) {
      rows.push(await verify(browser, phase, settings));
      console.log(phase, settings.locale, settings.theme, 'passed');
    }
  }
  for (const settings of cases) {
    const [before, after] = rows.filter(row => row.locale === settings.locale);
    for (const key of ['groupMembership', 'listMove', 'blockerIds']) assert.deepEqual(after[key], before[key]);
    assert.deepEqual(after.images.map(image => image.rows), before.images.map(image => image.rows));
  }
} finally {
  writeFileSync(resolve(out, 'visual-results.json'), JSON.stringify({ chromium: browser.version(), rows }, null, 2) + '\n');
  await browser.close();
}
