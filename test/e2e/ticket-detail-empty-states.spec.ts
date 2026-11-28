import { test, expect } from '@playwright/test';
import { buildApp, closeTestApp, createDbFile, getFreePort, createBoard, createTicket, showCurrentTicket } from './helpers.js';
import path from 'node:path';
import fs from 'node:fs';
const baseline = Boolean(process.env.EVIDENCE_BASELINE_PUBLIC);
test('first visit shows the body and empty relation controls keep their natural height', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem('kanbalone:language', 'ja'));
  const app = buildApp({ dbFile: createDbFile(), staticDir: process.env.EVIDENCE_BASELINE_PUBLIC || path.join(process.cwd(), 'public') });
  const port = await getFreePort(); await app.listen({ host: '127.0.0.1', port }); const base = `http://127.0.0.1:${port}`;
  const capture = async (name: string) => { if (process.env.EVIDENCE_DIR) await page.screenshot({ path: `${process.env.EVIDENCE_DIR}/${name}.png` }); };
  try {
    const { board, lanes } = await createBoard(page.request, base, { name: 'チケット詳細の確認', laneNames: ['作業中'] });
    const main = await createTicket(page.request, base, board.id, { laneId: lanes[0].id, title: '公開前の確認事項', bodyMarkdown: '最初にこの本文を読んで、公開前の確認を進めます。' });
    const other = await createTicket(page.request, base, board.id, { laneId: lanes[0].id, title: '関連する確認作業' });
    await page.goto(`${base}/tickets/${main.id}`);
    await expect(page.locator('#ticket-visit-content')).not.toContainText('読み込み中');
    if (baseline) await expect(page.locator('#ticket-visit-changes')).toBeVisible();
    else { await expect(page.locator('#ticket-view-body')).toContainText(main.bodyMarkdown); await expect(page.locator('#ticket-visit-changes-tab')).toBeHidden(); }
    // Await snapshot storage, not just the first paint, before capturing or navigating.
    await expect.poll(() => page.evaluate(id => new Promise(resolve => {
      const r = indexedDB.open('kanbalone-previous-visit'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('tickets'); const get = tx.objectStore('tickets').get(id); get.onsuccess = () => resolve(Boolean(get.result)); tx.oncomplete = () => db.close(); };
    }), main.id)).toBe(true);
    await capture('first-visit');
    await showCurrentTicket(page); await page.locator('#header-edit-button').click();
    const add = page.locator('#ticket-relation-add'), button = page.locator('#ticket-relation-add-button');
    await button.scrollIntoViewIfNeeded();
    const closed = (await add.boundingBox())!.height; await capture('relations-closed');
    await button.focus(); await button.press('Enter');
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await add.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)); });
    const opened = (await add.boundingBox())!.height; await capture('relations-open');
    if (baseline) expect(closed).toBeGreaterThan(opened + 50);
    else { expect(closed).toBeLessThan(45); expect(opened).toBeGreaterThanOrEqual(closed - 1); expect(opened).toBeLessThan(50); }
    await button.press('Enter'); await expect(button).toHaveAttribute('aria-expanded', 'false'); await expect.poll(async () => (await add.boundingBox())!.height).toBeCloseTo(closed, 0);
    if (process.env.EVIDENCE_DIR) fs.writeFileSync(`${process.env.EVIDENCE_DIR}/measurements.json`, JSON.stringify({ closed, opened }, null, 2));
    if (baseline) return;
    await button.press('Enter'); await page.locator('[data-relation-add-type="related"]').click();
    const search = page.locator('#ticket-related-search'); await expect(search).toBeFocused(); await search.fill(other.title); await expect(page.locator('#ticket-related-options .active')).toContainText(other.title); await search.press('Enter');
    await expect(page.locator('#ticket-related-summary')).toContainText(other.title);
    await page.locator('#save-ticket-button').click();
    await expect.poll(async () => (await (await page.request.get(`${base}/api/tickets/${main.id}`)).json()).relatedIds).toEqual([other.id]);
    await page.reload(); await expect(page.locator('#ticket-visit-changes-tab')).toBeVisible(); await expect(page.locator('#ticket-visit-changes-tab')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#ticket-visit-normal-tab').click(); await expect(page.locator('#ticket-view-body')).toContainText(main.bodyMarkdown);
    await page.goto(`${base}/tickets/${other.id}`); await expect(page.locator('#ticket-visit-changes-tab')).toBeHidden();
    await expect(page.locator('#editor-header-title')).toContainText(other.title);
    await page.evaluate(id => new Promise<void>(resolve => {
      const r = indexedDB.open('kanbalone-previous-visit'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('tickets', 'readwrite'); const store = tx.objectStore('tickets'); const get = store.get(id); get.onsuccess = () => store.put({ ...get.result, series: 'expired-series' }); tx.oncomplete = () => { db.close(); resolve(); }; };
    }), main.id);
    await page.goto(`${base}/tickets/${main.id}`); await expect(page.locator('#ticket-visit-content .ticket-visit-loading')).toHaveCount(0);
    await expect(page.locator('#ticket-view-body')).toContainText(main.bodyMarkdown);
    await expect(page.locator('#ticket-visit-changes-tab')).toBeHidden();
    await page.locator('#ticket-visit-normal-tab').focus(); await page.keyboard.press('ArrowRight'); await expect(page.locator('#ticket-visit-normal-tab')).toBeFocused();
    await expect(page.locator('#ticket-view-body')).toBeVisible();

  } finally { await page.close(); await closeTestApp(app); }
});
