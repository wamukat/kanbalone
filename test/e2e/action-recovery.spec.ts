import { test, expect } from "@playwright/test";
import { startTestApp, createBoard, createTicket } from "./helpers.js";

for (const locale of ["en-US", "ja-JP"]) {
  test(`archive and restore distinguish failed writes from failed refreshes (${locale})`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const { baseUrl, close } = await startTestApp(page);
    try {
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Recovery", laneNames: ["Todo"] });
      for (const initial of [false, true]) {
        const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Recover state", isArchived: initial });
        const ticketUrl = `${baseUrl}/api/tickets/${ticket.id}`;
        await page.goto(`${baseUrl}/tickets/${ticket.id}`);
        await page.locator("#header-edit-button").click();
        await page.route(ticketUrl, route => route.request().method() === "PATCH"
          ? route.fulfill({ status: 500, json: { error: "Write failed" } }) : route.continue());
        await page.locator("#archive-ticket-button").click();
        await expect(page.locator("#toast")).toHaveText("Write failed");
        await expect(page.locator("#archive-ticket-button")).toBeFocused();
        expect((await (await page.request.get(ticketUrl)).json()).isArchived).toBe(initial);
        await page.unroute(ticketUrl);
        let writes = 0;
        await page.route(ticketUrl, async route => {
          if (route.request().method() !== "PATCH") return route.continue();
          const response = await route.fetch(); writes++;
          return route.fulfill({ response });
        });
        await page.route(`**/api/boards/${board.id}/tickets*`, route => writes
          ? route.fulfill({ status: 500, json: { error: "Refresh failed" } }) : route.continue());
        await page.locator("#archive-ticket-button").press("Enter");
        await expect(page.locator("#editor-dialog")).not.toBeVisible();
        await expect(page.locator("#toast")).toContainText(locale === "ja-JP" ? "再読み込みしてください" : "Reload to continue");
        await expect(page.locator("#search-input")).toBeFocused();
        expect((await (await page.request.get(ticketUrl)).json()).isArchived).toBe(!initial);
        await page.unroute(`**/api/boards/${board.id}/tickets*`);
        await page.reload();
        await page.goto(`${baseUrl}/tickets/${ticket.id}`);
        await page.locator("#header-edit-button").click();
        await expect(page.locator("#archive-ticket-button")).toContainText(initial
          ? (locale === "ja-JP" ? "アーカイブ" : "Archive") : (locale === "ja-JP" ? "復元" : "Restore"));
        expect(writes).toBe(1);
        expect((await (await page.request.get(ticketUrl)).json()).isArchived).toBe(!initial);
        await page.unroute(ticketUrl);
      }
    } finally { await close(); await context.close(); }
  });

  test(`ticket creation, editing and moving restore visible focus (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const { baseUrl, close } = await startTestApp(page);
    try {
      const source = await createBoard(page.request, baseUrl, { name: "Source", laneNames: ["Todo"] });
      const target = await createBoard(page.request, baseUrl, { name: "Target", laneNames: ["Review"] });
      await page.goto(`${baseUrl}/boards/${source.board.id}`);
      const createButton = page.locator(`.lane[data-lane-id="${source.lanes[0].id}"] .add-ticket-button`);
      await createButton.click();
      await page.locator("#ticket-title").fill("Focus ticket");
      await page.locator("#editor-form button[type=submit]").click();
      await expect(createButton).toBeFocused();
      const { tickets } = await (await page.request.get(`${baseUrl}/api/boards/${source.board.id}/tickets`)).json();
      await page.goto(`${baseUrl}/tickets/${tickets[0].id}`);
      await page.locator("#header-edit-button").click();
      await page.locator("#ticket-body").fill("Body to preserve");
      await page.locator("#editor-form button[type=submit]").click();
      await expect(page.locator("#header-edit-button")).toBeFocused();
      await page.locator("#header-edit-button").press("Enter");
      await page.locator("#move-ticket-button").click();
      await page.locator("[data-move-board]").selectOption(String(target.board.id));
      await expect(page.locator("[data-move-lane]")).toContainText("Review");
      await page.locator("#ux-submit-button").click();
      await expect(page.locator("#move-ticket-button")).toBeFocused();
      const saved = await (await page.request.get(`${baseUrl}/api/tickets/${tickets[0].id}`)).json();
      expect(saved.boardId).toBe(target.board.id);
      expect(saved.bodyMarkdown).toBe("Body to preserve");
    } finally { await close(); await context.close(); }
  });

  test(`export failure is announced and retry downloads without an unhandled error (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const { baseUrl, close } = await startTestApp(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      const { board } = await createBoard(page.request, baseUrl, { name: "Export recovery", laneNames: ["Todo"] });
      await page.goto(`${baseUrl}/boards/${board.id}`);
      await page.locator("#board-settings-toggle-button").click();
      await page.route(`**/api/boards/${board.id}/export`, route => route.fulfill({ status: 500, json: { error: "Export failed" } }));
      await page.locator("#export-board-button").click();
      await expect(page.locator("#toast")).toHaveText(locale === "ja-JP" ? "ボードをエクスポートできませんでした。もう一度お試しください。" : "Could not export board. Please try again.");
      await expect(page.locator("#export-board-button")).toBeFocused();
      await page.unroute(`**/api/boards/${board.id}/export`);
      const download = page.waitForEvent("download");
      await page.locator("#export-board-button").press("Enter");
      expect(await (await download).failure()).toBeNull();
      expect(errors).toEqual([]);
    } finally { await close(); await context.close(); }
  });
}
