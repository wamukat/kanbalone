import { expect, test, type Page } from "@playwright/test";

import { createMockGithubAdapter } from "../app-test-helpers.js";
import { buildApp, closeTestApp, createBoard, createDbFile, createTag, createTicket, getFreePort, startTestApp } from "./helpers.js";

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

test("remote import keeps the backlink control inline and submits the selected option", async ({ page }) => {
  await page.setViewportSize({ width: 1120, height: 560 });
  const issueUrl = "https://github.com/acme/kanbalone/issues/42";
  const kanbaloneUrl = "https://kanbalone.example.test/boards/1";
  const title = "Imported issue with backlink";
  const postedComments: string[] = [];
  const app = buildApp({
    dbFile: createDbFile(),
    remoteCredentialProviders: ["github"],
    remoteCredentialScopes: [],
    remoteAdapters: {
      github: createMockGithubAdapter({
        initial: {
          provider: "github",
          instanceUrl: "https://github.com",
          resourceType: "issue",
          projectKey: "acme/kanbalone",
          issueKey: "42",
          displayRef: "acme/kanbalone#42",
          url: issueUrl,
          title,
          bodyMarkdown: "Imported body",
          state: "open",
          updatedAt: "2026-04-23T09:00:00.000Z",
        },
        onPostComment(body) {
          postedComments.push(body);
        },
      }),
    },
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await page.emulateMedia({ colorScheme: "dark" });
    const { board, lanes } = await createBoard(page.request, baseUrl, {
      name: "Remote import backlink board",
      laneNames: ["Todo", "Review"],
    });
    const laneId = lanes[1].id;
    const importPath = `${baseUrl}/api/boards/${board.id}/remote-import`;
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole("button", { name: "New ticket" }).first().click();

    const open = page.getByRole("button", { name: "Import remote issue" });
    const drawer = page.locator("#editor-remote-import-sheet");
    const labelText = "Post backlink comment to remote";
    const caption = drawer.getByText(labelText, { exact: true });
    const checkbox = drawer.getByRole("checkbox", { name: labelText });
    const backlinkUrl = drawer.locator("#editor-remote-backlink-url");
    const url = drawer.getByRole("textbox", { name: "Issue URL" });
    const submit = drawer.getByRole("button", { name: "Import", exact: true });

    await open.click();
    await expect(url).toBeFocused();
    const checkboxBox = (await checkbox.boundingBox())!;
    const captionBox = (await caption.boundingBox())!;
    expect(checkboxBox.width).toBeLessThan(checkboxBox.height * 2);
    expect(checkboxBox.x + checkboxBox.width).toBeLessThanOrEqual(captionBox.x);
    expect(Math.abs(checkboxBox.y + checkboxBox.height / 2 - captionBox.y - captionBox.height / 2)).toBeLessThan(2);

    await expect(checkbox).not.toBeChecked();
    await expect(backlinkUrl).toBeHidden();
    await expect(backlinkUrl).toBeDisabled();
    await caption.click();
    await expect(checkbox).toBeChecked();
    await backlinkUrl.fill(kanbaloneUrl);
    await checkbox.press("Space");
    await expect(checkbox).not.toBeChecked();
    await expect(backlinkUrl).toBeHidden();
    await expect(backlinkUrl).toHaveValue("");

    await checkbox.press("Space");
    await expect(backlinkUrl).toBeEnabled();
    await backlinkUrl.fill(kanbaloneUrl);
    await url.fill(issueUrl);
    await drawer.getByRole("button", { name: "Cancel" }).click();
    await expect(open).toBeFocused();
    await open.click();
    await expect(checkbox).not.toBeChecked();
    await expect(backlinkUrl).toBeHidden();
    await expect(backlinkUrl).toHaveValue("");
    await expect(url).toHaveValue("");
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveCSS("cursor", "not-allowed");
    const disabledBackground = await submit.evaluate(button => getComputedStyle(button).backgroundColor);
    await submit.hover();
    await expect(submit).toHaveCSS("background-color", disabledBackground);

    await url.fill(issueUrl);
    await drawer.getByRole("combobox", { name: "Lane" }).selectOption(String(laneId));
    const previewing = page.waitForResponse(response => response.url() === `${importPath}/preview` && response.request().method() === "POST");
    await drawer.getByRole("button", { name: "Preview", exact: true }).click();
    const preview = await previewing;
    expect(preview.status()).toBe(200);
    expect(preview.request().postDataJSON()).toEqual({ provider: "github", laneId, url: issueUrl, postBacklinkComment: false });
    await expect(submit).toBeEnabled();
    await expect(submit).not.toHaveCSS("background-color", disabledBackground);

    await checkbox.press("Space");
    await expect(checkbox).toBeChecked();
    await backlinkUrl.fill(kanbaloneUrl);
    const importing = page.waitForResponse(response => response.url() === importPath && response.request().method() === "POST");
    await backlinkUrl.press("Tab");
    await expect(drawer.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(drawer.getByRole("button", { name: "Preview", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
    await backlinkUrl.focus();
    await backlinkUrl.press("Control+Enter");
    const imported = await importing;
    expect(imported.status()).toBe(201);
    expect(imported.request().postDataJSON()).toEqual({
      provider: "github", laneId, url: issueUrl, postBacklinkComment: true, backlinkUrl: kanbaloneUrl, updater: "画面",
    });

    const ticket = await imported.json();
    await expect(page.locator("#editor-header-title")).toContainText(title);
    const saved = await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`);
    expect(saved.ok()).toBe(true);
    expect(await saved.json()).toMatchObject({ boardId: board.id, laneId, title, remote: { url: issueUrl } });
    expect(postedComments).toEqual([`Imported into Kanbalone as ${ticket.ref}: ${kanbaloneUrl}`]);
  } finally {
    await page.close();
    await closeTestApp(app);
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
