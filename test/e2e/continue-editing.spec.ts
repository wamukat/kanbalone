import { expect, test } from '@playwright/test';
import { createBoard, createTicket, startTestApp, showCurrentTicket } from './helpers.js';

for (const locale of ['ja', 'en']) {
  test(`${locale}: continue editing preserves selection and draft without saving`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(locale => localStorage.setItem('kanbalone:language', locale), locale);
    const { baseUrl, close } = await startTestApp(page);
    try {
      const board = await createBoard(page.request, baseUrl, { name: 'Desktop workflow', laneNames: ['Todo'] });
      const ticket = await createTicket(page.request, baseUrl, board.board.id, {
        laneId: board.lanes[0].id, title: 'Review draft', bodyMarkdown: 'Saved body',
      });
      await page.goto(`${baseUrl}/tickets/${ticket.id}`);
      await showCurrentTicket(page);
      await page.locator('[data-detail-edit="body"]').click();
      const draft = page.locator('[data-detail-body-input]');
      const value = 'Draft with [reference](https://example.com)';
      await draft.fill(value);
      await draft.evaluate((input: HTMLTextAreaElement) => input.setSelectionRange(6, 10, 'backward'));
      const writes: string[] = [];
      page.on('request', request => { if (['POST', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url()); });
      await draft.press('Escape');
      const resume = page.locator('#ux-dismiss-button');
      await expect(resume).toHaveText(locale === 'ja' ? '編集を続ける' : 'Continue editing');
      await expect(resume).toBeFocused();
      if (process.env.EVIDENCE_DIR) await page.screenshot({ path: `${process.env.EVIDENCE_DIR}/${locale}-discard.png` });
      await resume.press('Enter');
      await expect(draft).toBeFocused();
      await expect(draft).toHaveValue(value);
      expect(await draft.evaluate((input: HTMLTextAreaElement) => [input.selectionStart, input.selectionEnd, input.selectionDirection])).toEqual([6, 10, 'backward']);
      expect(writes).toEqual([]);
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json()).bodyMarkdown).toBe('Saved body');
      await page.locator('[data-detail-save-body]').click();
      await expect(page.locator('#ticket-view-body')).toContainText('Draft with reference');
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json()).bodyMarkdown).toBe(value);
      await page.reload();
      await showCurrentTicket(page);
      await expect(page.locator('#ticket-view-body')).toContainText('Draft with reference');
    } finally { await close(); }
  });
}
