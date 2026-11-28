import { expect, test } from '@playwright/test';
import { createBoard, startTestApp } from './helpers.js';

for (const locale of ['ja', 'en']) {
  test(`${locale}: empty board and lane names stay editable without writes`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(locale => localStorage.setItem('kanbalone:language', locale), locale);
    const { baseUrl, close } = await startTestApp(page);
    try {
      const board = await createBoard(page.request, baseUrl, { name: 'Desktop workflow', laneNames: ['Todo'] });
      await page.goto(`${baseUrl}/boards/${board.board.id}`);
      const writes: string[] = [];
      page.on('request', r => { if (['POST', 'PATCH', 'DELETE'].includes(r.method())) writes.push(r.url()); });
      const cases = [
        { selector: '[data-board-create-input]', open: async () => { await page.locator('#new-board-button').click(); } },
        { selector: '[data-board-rename-input]', open: async () => {
          await page.locator('#board-settings-toggle-button').click();
          await page.locator('[data-board-rename-start]').click();
        } },
        { selector: '[data-lane-create-input]', open: async () => {
          await page.locator('#board-settings-toggle-button').click();
          await page.getByRole('button', { name: locale === 'ja' ? '新しいレーン' : 'New lane', exact: true }).click();
        } },
        { selector: '[data-lane-rename-input]', open: async () => {
          await page.locator('[data-action="toggle-lane-actions"]').first().click();
          await page.locator('[data-action="rename-lane"]').first().click();
        } },
      ];
      for (const [index, item] of cases.entries()) {
        await item.open();
        const input = page.locator(item.selector);
        for (const value of ['', '   ']) {
          await input.fill(value);
          await input.press('Enter');
          await expect(input).toBeFocused();
          await expect(input).toHaveJSProperty('validationMessage', locale === 'ja' ? '名前を入力してください。' : 'Enter a name.');
        }
        if (process.env.EVIDENCE_DIR && index === 0) await page.screenshot({ path: `${process.env.EVIDENCE_DIR}/${locale}-empty-name.png` });
        await input.fill('Valid name');
        await expect(input).toHaveJSProperty('validationMessage', '');
        await input.press('Escape');
        await expect(input).toHaveCount(0);
      }
      expect(writes).toEqual([]);
      const stored = await (await page.request.get(`${baseUrl}/api/boards/${board.board.id}`)).json();
      expect(stored.board.name).toBe('Desktop workflow');
      expect(stored.lanes.map((lane: { name: string }) => lane.name)).toEqual(['Todo']);
      await page.locator('#new-board-button').click();
      const input = page.locator('[data-board-create-input]');
      await input.fill('   ');
      await input.press('Enter');
      await input.fill('Recovered board');
      const response = page.waitForResponse(r => r.url().endsWith('/api/boards') && r.request().method() === 'POST');
      await input.press('Enter');
      const createdResponse = await response;
      expect(createdResponse.status()).toBe(201);
      const created = await createdResponse.json();
      await expect(page).toHaveURL(`${baseUrl}/boards/${created.board.id}`);
      await expect(input).toHaveCount(0);
      await page.reload();
      await expect(page.locator('#board-title')).toHaveText('Recovered board');
    } finally { await close(); }
  });
}
