import { expect, test } from "@playwright/test";

import { createBoard, createTag, createTicket, startTestApp, showCurrentTicket } from "./helpers.js";

test("the ticket editor discards only draft tags and keeps them on failed save", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Tag drafts", laneNames: ["Todo"] });
    const shared = await createTag(page.request, baseUrl, board.id, { name: "Shared tag" });
    const ticket = await createTicket(page.request, baseUrl, board.id, {
      title: "Ticket with a shared tag", laneId: lanes[0].id, tagIds: [shared.id],
    });
    const tagUrl = `${baseUrl}/api/boards/${board.id}/tags`;
    const ticketUrl = `${baseUrl}/api/tickets/${ticket.id}`;
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    const search = page.locator("#ticket-tag-search");
    const draft = page.locator(".ticket-tag-chip-draft");
    const addDraft = async () => {
      await search.fill("Review notes");
      await search.press("Enter");
      await expect(draft).toContainText("Unsaved");
      await expect(page.locator("#ticket-tag-draft-help")).toBeVisible();
    };
    await page.locator("#header-edit-button").click();
    await addDraft();
    expect((await (await page.request.get(tagUrl)).json()).tags).toEqual([shared]);
    await page.getByRole("button", { name: "Remove tag: Shared tag" }).click();
    await page.locator("#cancel-edit-button").click();
    await page.locator("#ux-dismiss-button").click();
    await expect(draft).toContainText("Review notes");
    await page.locator("#cancel-edit-button").click();
    await page.locator("#ux-submit-button").click();
    await showCurrentTicket(page);
    await expect(page.locator("#ticket-view-meta")).toContainText("Shared tag");
    expect((await (await page.request.get(ticketUrl)).json()).tags).toEqual([shared]);
    expect((await (await page.request.get(tagUrl)).json()).tags).toEqual([shared]);

    await page.locator("#header-edit-button").click();
    await expect(draft).toHaveCount(0);
    await addDraft();
    let rejectSave = true;
    await page.route(ticketUrl, async (route) => {
      if (route.request().method() === "PATCH" && rejectSave) {
        rejectSave = false;
        await route.fulfill({ status: 503, json: { error: "Simulated save failure" } });
      } else {
        await route.continue();
      }
    });
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#editor-save-state")).toHaveText("Save failed");
    await expect(draft).toContainText("Review notes");
    await expect(page.locator("#sidebar-tag-list")).not.toContainText("Review notes");
    expect((await (await page.request.get(tagUrl)).json()).tags).toEqual([shared]);

    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#ticket-view-meta")).toContainText("Review notes");
    await expect(page.locator("#sidebar-tag-list")).toContainText("Review notes");
    await page.reload();
    await showCurrentTicket(page);
    await expect(page.locator("#ticket-view-meta")).toContainText("Review notes");
    await page.locator("#header-edit-button").click();
    await expect(draft).toHaveCount(0);
    await search.fill("Refresh-safe tag");
    await search.press("Enter");
    await page.route(`${baseUrl}/api/boards/${board.id}`, (route) =>
      route.fulfill({ status: 503, json: { error: "Simulated board refresh failure" } }));
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#ticket-view-meta")).toContainText("Refresh-safe tag");
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary")).toContainText("Refresh-safe tag");
    await expect(draft).toHaveCount(0);
  } finally {
    await close();
  }
});

test("the new-ticket form saves pending names with the ticket and closes even if board refresh fails", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Drafts on creation", laneNames: ["Todo"] });
    const collection = `${baseUrl}/api/boards/${board.id}/tickets`;
    const tagUrl = `${baseUrl}/api/boards/${board.id}/tags`;
    const boardUrl = `${baseUrl}/api/boards/${board.id}`;
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();
    await page.locator("#ticket-title").fill("New ticket with a draft");
    const search = page.locator("#ticket-tag-search");
    await search.fill("New board tag");
    await page.getByRole("button", { name: 'Create "New board tag"' }).click();
    await expect(page.locator(".ticket-tag-chip-draft")).toContainText("New board tag");
    expect((await (await page.request.get(tagUrl)).json()).tags).toEqual([]);

    await page.route(boardUrl, (route) => route.fulfill({ status: 503, json: { error: "Simulated board refresh failure" } }));
    const saved = page.waitForResponse((response) => response.url() === collection && response.request().method() === "POST");
    await page.locator("#save-ticket-button").click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const ticket = await response.json();
    expect(ticket.tags).toEqual([expect.objectContaining({ name: "New board tag" })]);
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#toast")).toHaveText("Ticket saved, but the view could not refresh. Reload to continue.");
    expect((await (await page.request.get(collection)).json()).tickets).toHaveLength(1);
    expect((await (await page.request.get(tagUrl)).json()).tags).toEqual(ticket.tags);
  } finally {
    await close();
  }
});
