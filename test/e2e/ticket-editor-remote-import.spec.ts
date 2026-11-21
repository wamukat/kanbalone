import { expect, test, type Page } from "@playwright/test";

import { createBoard, createTag, createTicket, startTestApp } from "./helpers.js";

async function addRelation(page: Page, type: "blocker" | "related" | "parent" | "child") {
  await page.locator("#ticket-relation-add-button").click();
  await page.locator(`[data-relation-add-type="${type}"]`).click();
}

test("ticket editor hides remote import when no provider credentials are configured", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "No Remote Import Board",
      laneNames: ["Todo"],
    });

    await page.route(`${baseUrl}/api/meta`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          name: "Kanbalone",
          version: "test",
          remoteProviders: [
            { id: "github", hasCredential: false },
            { id: "gitlab", hasCredential: false },
            { id: "redmine", hasCredential: false },
          ],
        }),
      });
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();

    await expect(page.locator("#remote-import-create-button")).toBeHidden();
  } finally {
    await close();
  }
});

test("ticket editor keeps remote import hidden when metadata fails to load", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Failed Meta Remote Import Board",
      laneNames: ["Todo"],
    });

    await page.route(`${baseUrl}/api/meta`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 500,
        body: JSON.stringify({ error: "metadata unavailable" }),
      });
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();

    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#remote-import-create-button")).toBeHidden();
  } finally {
    await close();
  }
});

test("ticket editor remote import lists configured providers only", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Configured Remote Import Board",
      laneNames: ["Todo"],
    });

    await page.route(`${baseUrl}/api/meta`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          name: "Kanbalone",
          version: "test",
          remoteProviders: [
            { id: "github", hasCredential: true },
            { id: "gitlab", hasCredential: false },
            { id: "redmine", hasCredential: true },
          ],
        }),
      });
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();
    await page.locator("#remote-import-create-button").click();

    await expect(page.locator("[data-remote-provider-option='github']")).toBeVisible();
    await expect(page.locator("[data-remote-provider-option='gitlab']")).toBeHidden();
    await expect(page.locator("[data-remote-provider-option='redmine']")).toBeVisible();
    await expect(page.locator("#editor-remote-provider-help")).toBeHidden();
  } finally {
    await close();
  }
});

test("duplicate import opens the existing ticket without losing the new-ticket draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Import target", laneNames: ["Todo"] });
    const other = await createBoard(page.request, baseUrl, { name: "Existing ticket board", laneNames: ["Doing"] });
    const ticket = await createTicket(page.request, baseUrl, other.board.id, { laneId: other.lanes[0].id, title: "Previously imported issue" });
    await page.route(`${baseUrl}/api/meta`, async route => route.fulfill({ json: { name: "Kanbalone", version: "test", remoteProviders: [{ id: "github", hasCredential: true }] } }));
    await page.route(`${baseUrl}/api/boards/${board.id}/remote-import/preview`, async route => route.fulfill({ json: {
      provider: "github", displayRef: "owner/repo#9", state: "open", title: "Previously imported issue", duplicate: true,
      existingTicketId: ticket.id, existingTicketRef: `#${ticket.id}`,
    } }));
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();
    await page.locator("#ticket-title").fill("Keep this draft");
    await page.locator("#remote-import-create-button").click();
    await page.locator("#editor-remote-lane").selectOption(String(lanes[0].id));
    await page.locator("#editor-remote-url").fill("https://github.com/owner/repo/issues/9");
    await page.locator("#editor-remote-import-preview-button").click();
    await expect(page.locator("#editor-remote-import-submit-button")).toBeDisabled();
    const opened = page.waitForEvent("popup");
    await page.getByRole("link", { name: `Open #${ticket.id} in a new tab` }).click();
    const target = await opened;
    await expect(target.locator("#editor-header-title")).toContainText("Previously imported issue");
    await expect(target).toHaveURL(`${baseUrl}/tickets/${ticket.id}`);
    await target.close();
    await page.locator("#editor-remote-import-cancel-button").click();
    await expect(page.locator("#ticket-title")).toHaveValue("Keep this draft");
  } finally { await close(); }
});
