import { expect, test, type Page } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";
const card = (page: Page, id: number) => page.locator(`.ticket-card[data-ticket-id="${id}"] .ticket-link`);
const notice = (page: Page, id: number) => page.locator(`.archive-recovery[data-ticket-id="${id}"]`);
async function archive(page: Page, id: number) {
  await card(page, id).click();
  await page.locator('#header-edit-button').click();
  await page.locator('#archive-ticket-button').click();
  await expect(notice(page, id)).toBeVisible();
}
for (const includeArchived of [false, true]) {
  test(`single archive Undo persists and remains keyboard reachable (include archived ${includeArchived})`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    try {
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Recover", laneNames: ["Todo", "Doing"] });
      const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Accidental archive", bodyMarkdown: "Keep notes" });
      await page.goto(`${baseUrl}/boards/${board.id}`);
      if (includeArchived) await page.locator('#include-archived-filter').click();
      await archive(page, item.id);
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).isArchived).toBe(true);
      await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).focus();
      await page.keyboard.press('Tab');
      await expect(notice(page, item.id).getByRole('button', { name: /^Dismiss notification:/ })).toBeFocused();
      await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
      await expect(notice(page, item.id)).toContainText('Restored');
      const saved = (await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json());
      expect(saved.isArchived).toBe(false); expect(saved.bodyMarkdown).toBe('Keep notes');
      if (!includeArchived) await expect(card(page, item.id)).toBeFocused();
      await page.reload();
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).isArchived).toBe(false);
    } finally { await close(); }
  });
}
test('ABA conflict never rolls back another archive; retry after failure preserves identity', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Conflict', laneNames: ['Todo'] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: 'Original target' });
    await page.goto(`${baseUrl}/boards/${board.id}`); await archive(page, item.id);
    await page.route(`**/api/tickets/${item.id}/archive`, route => route.fulfill({ status: 503, json: { error: 'Unavailable' } }));
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click();
    await expect(notice(page, item.id)).toContainText('Could not restore');
    await page.unroute(`**/api/tickets/${item.id}/archive`);
    for (const isArchived of [false, true]) await page.request.patch(`${baseUrl}/api/tickets/${item.id}`, { data: { isArchived } });
    await notice(page, item.id).getByRole('button', { name: /^Retry:/ }).click();
    await expect(notice(page, item.id)).toContainText('This ticket changed');
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).isArchived).toBe(true);
    await notice(page, item.id).getByRole('button', { name: /^Review:/ }).click();
    await expect(page.locator('#editor-dialog')).toHaveJSProperty('open', true);
    await expect(page.locator('[data-detail-state-pill="archived"]')).toBeVisible();
  } finally { await close(); }
});

test('Undo keeps an open editor draft and does not offer retry after a committed restore refresh failure', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Draft', laneNames: ['Todo'] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: 'Draft target', bodyMarkdown: 'Stored' });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.locator('#include-archived-filter').click(); await archive(page, item.id);
    await page.locator('#header-edit-button').click();
    await page.locator('#ticket-body').fill('Unsaved draft must survive');
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click();
    await expect(notice(page, item.id)).toContainText('Restored');
    await expect(page.locator('#ticket-body')).toHaveValue('Unsaved draft must survive');
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).bodyMarkdown).toBe('Stored');
    await expect(page.locator('#archive-ticket-button')).toContainText('Archive');
    await page.locator('#save-ticket-button').click();
    await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).bodyMarkdown).toBe('Unsaved draft must survive');
    page.once('dialog', dialog => dialog.accept());
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.locator('#include-archived-filter').click();
    await archive(page, item.id);
    await page.route(`**/api/boards/${board.id}`, route => route.fulfill({ status: 503, json: { error: 'Refresh unavailable' } }));
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click();
    await expect(notice(page, item.id)).toContainText('Ticket restored, but the view could not refresh');
    await expect(notice(page, item.id).locator('.archive-recovery-action')).toBeHidden();
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).isArchived).toBe(false);
  } finally { await close(); }
});

test('a lost restore response reconciles saved state without another mutation', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Lost response', laneNames: ['Todo'] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: 'Saved once' });
    await page.goto(`${baseUrl}/boards/${board.id}`); await archive(page, item.id);
    let writes = 0;
    await page.route(`**/api/tickets/${item.id}/archive`, async route => { writes++; await route.fetch(); await route.abort('failed'); });
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click();
    await expect(notice(page, item.id)).toContainText('Restored');
    expect(writes).toBe(1);
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).isArchived).toBe(false);
  } finally { await close(); }
});

test('three immutable notifications, focus/hover/hidden pauses and expiry preserve stored archive', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Notifications', laneNames: ['Todo'] });
    const items = [];
    for (let i = 0; i < 4; i++) items.push(await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Archive ${i}` }));
    await page.clock.install();
    await page.goto(`${baseUrl}/boards/${board.id}`);
    for (const item of items) await archive(page, item.id);
    await expect(page.locator('.archive-recovery')).toHaveCount(3); await expect(notice(page, items[0].id)).toHaveCount(0);
    const last = notice(page, items[3].id);
    await last.getByRole('button', { name: /^Undo:/ }).focus();
    await page.clock.runFor(21000); await expect(last).toBeVisible();
    await page.locator('#search-input').focus(); await last.hover();
    await page.clock.runFor(21000); await expect(last).toBeVisible();
    await page.mouse.move(0, 0);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    // Model suspended callbacks in a background tab, not regular hidden ticks.
    await page.evaluate(() => { const now = performance.now.bind(performance); Object.defineProperty(performance, 'now', { configurable: true, value: () => now() + 60000 }); });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(1000); await expect(last).toBeVisible();
    await page.clock.runFor(21000); await expect(last).toHaveCount(0);
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${items[3].id}`)).json()).isArchived).toBe(true);
  } finally { await close(); }
});

test('a late restore response does not reopen or refocus a board the user left', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const first = await createBoard(page.request, baseUrl, { name: 'First board', laneNames: ['Todo'] });
    const second = await createBoard(page.request, baseUrl, { name: 'Second board', laneNames: ['Todo'] });
    const item = await createTicket(page.request, baseUrl, first.board.id, { laneId: first.lanes[0].id, title: 'Recover in first' });
    await page.goto(`${baseUrl}/boards/${first.board.id}`); await archive(page, item.id);
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let arrived!: () => void;
    const requested = new Promise<void>(resolve => { arrived = resolve; });
    await page.route(`**/api/tickets/${item.id}/archive`, async route => {
      const response = await route.fetch(); arrived(); await delayed; await route.fulfill({ response });
    });
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click(); await requested;
    const otherBoard = page.locator(`.board-button[data-board-id="${second.board.id}"]`);
    await otherBoard.click(); await expect(page).toHaveURL(`${baseUrl}/boards/${second.board.id}`);
    await otherBoard.focus();
    release(); await expect(notice(page, item.id)).toContainText('Restored');
    await expect(page).toHaveURL(`${baseUrl}/boards/${second.board.id}`);
    await expect(page.locator('#editor-dialog')).toHaveJSProperty('open', false);
    await expect(otherBoard).toBeFocused();
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).isArchived).toBe(false);
  } finally { await close(); }
});

test('Undo reveals the restored ticket at the end of a virtual lane and late SSE preserves focus', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const imported = await page.request.post(`${baseUrl}/api/boards/import`, { data: {
      formatVersion: 2, board: { name: 'Virtual recovery' }, lanes: [{ id: 1, name: 'Todo', position: 0, isCompletionLane: false }], tags: [], groups: [],
      tickets: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, laneId: 1, position: i, title: `Recovery ${i}`, bodyMarkdown: '', priority: 2,
        isResolved: false, isArchived: false, parentTicketId: null, groupId: null, tags: [], comments: [], blockerIds: [] })),
    } });
    expect(imported.status()).toBe(201); const fixture = await imported.json();
    const item = (await (await page.request.get(`${baseUrl}/api/boards/${fixture.board.id}/tickets?q=Recovery%200`)).json()).tickets[0];
    await page.goto(`${baseUrl}/boards/${fixture.board.id}`); await archive(page, item.id);
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click();
    await expect(card(page, item.id)).toBeFocused(); await expect(card(page, item.id)).toBeInViewport();
    const list = page.locator('.ticket-list');
    expect(await list.locator('.ticket-card').count()).toBeLessThan(40);
    expect(await list.evaluate(el => el.scrollTop)).toBeGreaterThan(1000);
    await page.request.patch(`${baseUrl}/api/tickets/${item.id}`, { data: { title: 'Recovered with newer title' } });
    await expect(card(page, item.id)).toHaveText('Recovered with newer title'); await expect(card(page, item.id)).toBeFocused();
  } finally { await close(); }
});

test('Undo respects a List lane filter after an unrelated lane change', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Filtered recovery', laneNames: ['Todo', 'Doing'] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: 'Filter target' });
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await page.locator('#lane-filter-button').click();
    await page.locator('#lane-filter-options').getByRole('checkbox', { name: 'Todo', exact: true }).check(); await page.keyboard.press('Escape');
    await page.locator(`.list-ticket-link[data-open-ticket-id="${item.id}"]`).click();
    await page.locator('#header-edit-button').click(); await page.locator('#archive-ticket-button').click();
    await expect(notice(page, item.id)).toBeVisible();
    await page.request.patch(`${baseUrl}/api/tickets/${item.id}`, { data: { laneId: lanes[1].id, bodyMarkdown: 'Newer note' } });
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click();
    await expect(notice(page, item.id)).toContainText('Restored'); await expect(page.locator('#search-input')).toBeFocused();
    await expect(page.locator(`.list-ticket-link[data-open-ticket-id="${item.id}"]`)).toHaveCount(0);
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json();
    expect(saved.isArchived).toBe(false); expect(saved.laneId).toBe(lanes[1].id); expect(saved.bodyMarkdown).toBe('Newer note');
  } finally { await close(); }
});

test('Undo does not rebase a dirty draft over a concurrent external body edit', async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Draft conflict', laneNames: ['Todo'] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: 'Keep both editors', bodyMarkdown: 'Initial' });
    await page.goto(`${baseUrl}/boards/${board.id}`); await page.locator('#include-archived-filter').click(); await archive(page, item.id);
    await page.locator('#header-edit-button').click(); await page.locator('#ticket-body').fill('Local unsaved draft');
    await page.request.patch(`${baseUrl}/api/tickets/${item.id}`, { data: { bodyMarkdown: 'External newer body' } });
    await notice(page, item.id).getByRole('button', { name: /^Undo:/ }).click();
    await expect(notice(page, item.id)).toContainText('Restored'); await expect(page.locator('#ticket-body')).toHaveValue('Local unsaved draft');
    const saving = page.waitForResponse(response => response.url().endsWith(`/api/tickets/${item.id}/change-preview`) && response.request().method() === 'POST');
    await page.locator('#save-ticket-button').click(); expect((await saving).status()).toBe(409);
    await expect(page.locator('#ticket-body')).toHaveValue('Local unsaved draft');
    const stored = await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json();
    expect(stored.bodyMarkdown).toBe('External newer body'); expect(stored.isArchived).toBe(false);
  } finally { await close(); }
});

for (const language of ['en', 'ja']) {
  test(`recovery does not cover editor Save at narrow width (${language})`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    try {
      await page.addInitScript(locale => localStorage.setItem('kanbalone:language', locale), language);
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Narrow recovery', laneNames: ['Todo'] });
      const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: 'Recover without blocking Save', bodyMarkdown: 'Stored' });
      // Use List: the existing narrow Kanban viewport has independent constraints.
      await page.goto(`${baseUrl}/boards/${board.id}/list`);
      await page.locator('#include-archived-filter').click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator(`.list-ticket-link[data-open-ticket-id="${item.id}"]`).click();
      await page.locator('#header-edit-button').click(); await page.locator('#archive-ticket-button').click();
      await expect(notice(page, item.id)).toBeVisible();
      await page.locator('#header-edit-button').click(); await page.locator('#ticket-body').fill('Keep narrow draft');
      await notice(page, item.id).locator('.archive-recovery-action').click();
      await expect(notice(page, item.id).locator('.archive-recovery-action')).toBeHidden();
      const region = await page.locator('.archive-recovery-region').boundingBox();
      const footer = await page.locator('#editor-form .editor-actions').boundingBox();
      expect(region).not.toBeNull(); expect(footer).not.toBeNull();
      expect(region!.y + region!.height).toBeLessThanOrEqual(footer!.y);
      await page.locator('#save-ticket-button').click();
      await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).bodyMarkdown).toBe('Keep narrow draft');
    } finally { await close(); }
  });
}
