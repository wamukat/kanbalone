import { test, expect } from "@playwright/test";
import { startTestApp, createBoard, createTicket } from "./helpers.js";

for (const locale of ["en-US", "ja-JP"]) {
  test(`hidden panels stay outside keyboard navigation (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({ locale, viewport: { width: 1280, height: 844 } });
    const page = await context.newPage();
    const { baseUrl, close } = await startTestApp(page);
    try {
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard review", laneNames: ["Todo"] });
      const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Keyboard ticket" });
      await page.addInitScript(() => localStorage.setItem("kanbalone:sidebar-collapsed", "true"));
      await page.goto(`${baseUrl}/boards/${board.id}/list`);
      await expect(page.locator(".list-row").first()).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.locator("#sidebar-reopen-button")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#sidebar-toggle-button")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#sidebar-reopen-button")).toBeFocused();
      await page.locator(`[data-open-ticket-id="${ticket.id}"]`).first().click();
      await expect(page.locator("#editor-dialog")).toBeVisible();
      for (let i = 0; i < 24; i++) {
        await page.keyboard.press(i < 12 ? "Tab" : "Shift+Tab");
        expect(await page.evaluate(() => !!document.activeElement?.closest("#editor-remote-import-sheet"))).toBe(false);
      }
      await page.keyboard.press("Escape");
      await expect(page.locator(`[data-open-ticket-id="${ticket.id}"]`).first()).toBeFocused();
      await page.setViewportSize({ width: 640, height: 422 });
      for (const selector of ["#priority-filter", "#include-archived-filter"]) {
        const control = page.locator(selector);
        await expect(control).toBeVisible();
        const height = await control.evaluate(el => el.getBoundingClientRect().height);
        expect(height).toBeLessThan(60);
      }
    } finally { await close(); await context.close(); }
  });
}
