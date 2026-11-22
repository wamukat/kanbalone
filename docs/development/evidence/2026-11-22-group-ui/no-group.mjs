import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { createRuntime, evidenceDir } from './fixture.mjs';

const [phase, filter = ''] = process.argv.slice(2);
assert(['before', 'after'].includes(phase), 'Specify before or after');
const candidate = phase === 'after';
const browser = await chromium.launch();
const out = resolve(evidenceDir, 'captures', '1523');
mkdirSync(out, { recursive: true });
const records = {};
const settings = ['en', 'ja'].flatMap(locale => ['light', 'dark'].flatMap(theme =>
  [1440, 390].map(width => ({ locale, theme, width }))));

async function verify(key, { locale, theme, width }) {
  const context = await browser.newContext({
    viewport: { width, height: width === 1440 ? 900 : 844 },
    locale: locale === 'ja' ? 'ja-JP' : 'en-US',
    colorScheme: theme,
  });
  const runtime = await createRuntime(phase);
  try {
    const { url, api } = runtime;
    const { board, lanes: [lane] } = await api('POST', '/api/boards', {
      name: 'Grouping review', laneNames: ['Todo'],
    });
    const boardApi = `/api/boards/${board.id}`;
    const work = await api('POST', boardApi + '/groups', { name: 'Planned work' });
    const design = await api('POST', boardApi + '/tags', { name: 'design', color: '#7950A3' });
    const createTicket = (title, extra) =>
      api('POST', boardApi + '/tickets', { laneId: lane.id, title, ...extra });
    const assigned = await createTicket('Scheduled review', { groupId: work.id });
    const parent = await createTicket('Organize customer notes', { tagIds: [design.id] });
    const child = await createTicket('Review open questions', { parentTicketId: parent.id });
    const archived = await createTicket('Previous discussion', { isArchived: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const baseUrl = `${url}/boards/${board.id}/group`;
    const name = locale === 'ja' ? 'グループ指定なし' : 'No Group';
    const action = key => page.locator(`[data-group-action="${key}"]`);
    const choice = page.locator('[data-select-group="ungrouped"]');
    const realChoice = page.locator(`[data-select-group="${work.id}"]`);
    const heading = page.locator('.group-detail-heading h3');
    const ticket = t => page.locator(`[data-group-ticket="${t.id}"]`);
    const groupIds = async () => (await api('GET', boardApi + '/groups?status=all')).groups.map(g => g.id);
    const get = t => api('GET', `/api/tickets/${t.id}`);
    const ensureFits = async () => {
      const widths = await page.locator('#group-board').evaluate(el =>
        [document.documentElement.scrollWidth, el.scrollWidth - el.clientWidth]);
      assert(widths[0] <= width && widths[1] <= 1, `Overflow: ${widths}`);
    };
    async function capture(state, anchor) {
      await anchor.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => document.getAnimations().every(a =>
        ['finished', 'idle'].includes(a.playState)));
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      await page.screenshot({ path: resolve(out, `${key}-${phase}-${state}.png`) });
    }
    await page.goto(baseUrl);
    await expect(heading).toHaveText(work.name);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    if (width === 390 && await page.locator('#sidebar-toggle-button').isVisible()) {
      await page.locator('#sidebar-toggle-button').click();
    }
    await expect(ticket(assigned)).toBeVisible();
    for (const t of [parent, child, archived]) await expect(ticket(t)).toHaveCount(0);
    await expect(choice).toHaveCount(candidate ? 1 : 0);
    assert.deepEqual(await groupIds(), [work.id]);
    assert.deepEqual((await Promise.all([parent, child, archived].map(get))).map(t => t.groupId), [null, null, null]);
    await ensureFits();
    await capture('group-list', realChoice);
    if (!candidate) {
      await action('all').first().click();
      await expect(choice).toHaveCount(0);
      assert.deepEqual(errors, []);
      return { groupIds: [work.id], unassignedIds: [parent.id, child.id, archived.id], noChoiceInActiveOrAll: true, errors };
    }

    await expect(page.locator('.group-choice').last()).toContainText(name);
    await choice.press('Enter');
    await expect(heading).toHaveText(name);
    await expect(choice).toHaveAttribute('aria-current', 'true');
    await expect(choice.locator('progress, .group-choice-completed')).toHaveCount(0);
    await expect(choice).toContainText(/3/);
    await expect(ticket(parent)).toBeVisible();
    await expect(ticket(child)).toBeVisible();
    await expect(ticket(assigned)).toHaveCount(0);
    await expect(ticket(archived)).toHaveCount(0);
    await expect(page.locator('.group-ticket-child', { has: ticket(child) })).toHaveCount(1);
    await expect(page.locator('.group-ticket-row', { has: ticket(parent) }).locator('.tag')).toHaveAttribute('title', 'design');
    for (const existing of ['add', 'edit-description', 'delete']) await expect(action(existing)).toHaveCount(0);
    await expect(page.locator('[data-group-remove], button.group-name')).toHaveCount(0);
    await ensureFits();
    await capture('unassigned', choice);

    await action('all').first().click();
    await expect(choice).toHaveCount(1);
    await expect(choice).toHaveAttribute('aria-current', 'true');
    await action('archive').click();
    await expect(ticket(archived)).toBeVisible();
    await expect(choice).toContainText(/3/);
    if (key === 'en-light-1440') await capture('unassigned-with-archive', ticket(archived));

    await choice.focus();
    const createResponse = page.waitForResponse(response =>
      response.url().endsWith(boardApi + '/tickets') && response.request().method() === 'POST');
    await page.keyboard.press('n');
    await expect(page.locator('#editor-dialog')).toHaveJSProperty('open', true);
    await page.locator('#ticket-title').fill('New unassigned ticket');
    await page.locator('#save-ticket-button').click();
    const response = await createResponse;
    assert.equal(response.status(), 201);
    const created = await response.json();
    assert.equal((await get(created)).groupId, null);
    await expect(ticket(created)).toBeVisible();
    await expect(choice).toContainText(/4/);
    await expect(choice).toHaveAttribute('aria-current', 'true');
    if (key === 'en-light-1440') await capture('created-unassigned', ticket(created));
    await page.reload();
    await expect(choice).toContainText(/4/);
    await choice.click();
    await expect(ticket(created)).toBeVisible();

    async function transfer(...members) {
      await realChoice.click();
      await action('add').click();
      const search = page.locator('#group-ticket-search');
      for (const member of members) {
        await search.fill(member.title);
        await page.locator(`[data-group-pick="${member.id}"]`).click();
      }
      await page.locator('[data-group-form="members"] button[type="submit"]').click();
      await expect(page.locator('[data-group-form="members"]')).toHaveCount(0);
      for (const member of members) assert.equal((await get(member)).groupId, work.id);
    }
    await transfer(parent, archived);
    assert.equal((await get(child)).groupId, work.id);
    const singleCount = locale === 'ja' ? '1 件' : '1 ticket';
    await expect(choice.locator('small')).toHaveText(singleCount);
    await choice.click();
    await ticket(created).focus();
    await expect(ticket(created)).toBeFocused();
    const last = { ticketIds: [created.id], groupId: work.id };
    const preview = await api('POST', boardApi + '/group-memberships/preview', last);
    await api('PUT', boardApi + '/group-memberships', { ...last, expectedToken: preview.expectedToken });
    await expect(choice).toHaveCount(0);
    await expect(realChoice).toBeFocused();
    await expect(heading).toHaveText(work.name);
    assert.equal((await get(created)).groupId, work.id);
    if (key === 'en-light-1440') await capture('last-ticket-assigned', realChoice);
    await page.reload();
    await expect(ticket(created)).toBeVisible();
    await expect(choice).toHaveCount(0);
    await ensureFits();
    assert.deepEqual(await groupIds(), [work.id]);

    // An archived-only unassigned ticket still exposes the virtual view on a board with no Groups.
    const isolated = await api('POST', '/api/boards', { name: 'No real groups', laneNames: ['Todo'] });
    const isolatedPath = `/api/boards/${isolated.board.id}`;
    const archivedOnly = await api('POST', isolatedPath + '/tickets', {
      title: 'Archived unassigned ticket', laneId: isolated.lanes[0].id, isArchived: true,
    });
    await page.goto(`${url}/boards/${isolated.board.id}/group`);
    await expect(choice).toHaveAttribute('aria-current', 'true');
    await expect(choice.locator('small')).toHaveText(singleCount);
    await expect(heading).toHaveText(name);
    await expect(ticket(archivedOnly)).toHaveCount(0);
    await action('archive').click();
    await expect(ticket(archivedOnly)).toBeVisible();
    assert.deepEqual((await api('GET', isolatedPath + '/groups?status=all')).groups, []);
    assert.deepEqual(errors, []);
    return {
      groupIds: await groupIds(), initialUnassignedIds: [parent.id, child.id, archived.id],
      keyboardCreated: created.id, createdGroupId: created.groupId, finalAssigned: (await get(created)).groupId,
      activeAndAll: true, archiveVisibleOnDemand: true, inheritedChildAssignment: work.id,
      choiceAbsentAfterReload: true, focusRestoredAfterLiveRemoval: true, archivedOnlyDefault: true, errors,
    };
  } finally {
    await context.close();
    await runtime.close();
  }
}

try {
  for (const setting of settings) {
    const key = `${setting.locale}-${setting.theme}-${setting.width}`;
    if (!key.includes(filter)) continue;
    records[key] = await verify(key, setting);
    writeFileSync(resolve(evidenceDir, `1523-${phase}-results.json`), JSON.stringify({ phase, browser: browser.version(), records }, null, 2) + '\n');
    console.log(`1523 ${phase} ${key} PASS`);
  }
} finally {
  await browser.close();
}
