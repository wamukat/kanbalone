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
