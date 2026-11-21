import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

for (const succeeds of [true, false]) {
  test(`full editor blocks typing while saving and unlocks after ${succeeds ? "success" : "failure"}`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    let release: (() => void) | undefined;
    try {
      const board = await createBoard(page.request, baseUrl, { name: "Saving draft", laneNames: ["Todo"] });
      const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Slow save" });
      await page.goto(`${baseUrl}/tickets/${ticket.id}`);
      await page.locator("#header-edit-button").click();
      await page.locator("#ticket-body").fill("Submitted draft");
      const wait = new Promise<void>((resolve) => { release = resolve; });
      let began: (() => void) | undefined;
      const pending = new Promise<void>((resolve) => { began = resolve; });
      await page.route(`**/api/tickets/${ticket.id}`, async (route) => {
        if (route.request().method() !== "PATCH") return route.continue();
        began?.();
        await wait;
        if (succeeds) await route.continue();
        else await route.fulfill({ status: 500, json: { error: "Temporary failure" } });
      });
      await page.locator("#save-ticket-button").click();
      await pending;
      await expect(page.locator("#editor-form")).toHaveJSProperty("inert", true);
      await page.locator("#ticket-body").evaluate((input: HTMLTextAreaElement) => input.focus());
      await page.keyboard.insertText("Unexpected input");
      await expect(page.locator("#ticket-body")).toHaveValue("Submitted draft");
      release?.();
      await expect(page.locator("#editor-form")).toHaveJSProperty("inert", false);
      if (succeeds) {
        await expect(page.locator("#ticket-view")).toBeVisible();
        await expect(page.locator("#ticket-view")).toContainText("Submitted draft");
      } else {
        await expect(page.locator("#editor-form")).toBeVisible();
        await expect(page.locator("#ticket-body")).toHaveValue("Submitted draft");
        await page.locator("#ticket-body").fill("Retry draft");
        await expect(page.locator("#ticket-body")).toHaveValue("Retry draft");
      }
    } finally { release?.(); await close(); }
  });
}
