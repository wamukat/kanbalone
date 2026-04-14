import { expect, test } from "@playwright/test";

import { createBoard, createTag, createTicket, startTestApp } from "./helpers.js";

test("ticket editor creates updates archives restores and deletes tickets", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Ticket Editor Board",
      laneNames: ["Todo", "Review"],
    });
    const [todoLane, reviewLane] = boardPayload.lanes;

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    const todoColumn = page.locator(".lane", { has: page.locator(".lane-title", { hasText: "Todo" }) });
    await todoColumn.getByRole("button", { name: "New ticket" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-form")).toBeVisible();
    await expect(page.locator("#ticket-resolved-row")).toBeHidden();
    await expect(page.locator("#ticket-priority")).toHaveValue("2");

    await page.locator("#ticket-title").fill("Created from editor");
    await page.locator("#ticket-body").fill("Created with **Markdown**");
    await page.locator("#ticket-priority").selectOption("3");
    await page.locator("#ticket-lane").selectOption(String(reviewLane.id));
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/boards/${boardPayload.board.id}/tickets`) &&
        response.request().method() === "POST",
    );
    await page.locator("#save-ticket-button").click();
    const createdTicketResponse = await createResponse;
    expect(createdTicketResponse.status()).toBe(201);
    const createdTicket = await createdTicketResponse.json();
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#toast")).toHaveText("Ticket created");
    await expect(page.locator("#toast")).toHaveCSS("background-color", "rgba(31, 111, 95, 0.96)");
    await expect(page.locator(".lane", { has: page.locator(".lane-title", { hasText: "Review" }) })).toContainText("Created from editor");

    await page.getByRole("button", { name: "Created from editor" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ticket-view")).toContainText("Created with Markdown");
    await page.locator("#header-edit-button").click();
    await page.locator("#ticket-title").fill("Updated from editor");
    await page.locator("#ticket-priority").selectOption("3");
    await page.locator("#ticket-resolved-row").click();
    await page.locator("#ticket-lane").selectOption(String(todoLane.id));
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${createdTicket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#save-ticket-button").click();
    expect((await updateResponse).status()).toBe(200);
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#editor-header-title")).toHaveText("Updated from editor");
    await expect(page.locator("#editor-header-state")).toContainText("Resolved");
    await expect(page.locator("#editor-header-priority")).toHaveText("High");

    await page.locator("#header-edit-button").click();
    const archiveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${createdTicket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#archive-ticket-button").click();
    expect((await archiveResponse).status()).toBe(200);
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.getByRole("button", { name: "Updated from editor" })).toHaveCount(0);

    await page.locator("#status-filter .filter-menu-edge-toggle").click();
    await page.locator("#status-filter [data-status-filter='resolved']").click();
    await page.locator("#status-filter [data-status-filter='archived']").click();
    await page.getByRole("button", { name: "Updated from editor" }).click();
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#archive-ticket-button")).toContainText("Restore");
    const restoreResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${createdTicket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#archive-ticket-button").click();
    expect((await restoreResponse).status()).toBe(200);
    await expect(page.locator("#editor-form")).toBeVisible();
    await expect(page.locator("#archive-ticket-button")).toContainText("Archive");

    const deleteCandidate = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: todoLane.id,
      title: "Delete from editor",
    });
    await page.goto(`${baseUrl}/tickets/${deleteCandidate.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#header-edit-button").click();
    await page.locator("#delete-ticket-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-submit-button")).toHaveText("Delete");
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${deleteCandidate.id}`) &&
        response.request().method() === "DELETE",
    );
    await page.locator("#ux-submit-button").click();
    expect((await deleteResponse).status()).toBe(204);
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
  } finally {
    await close();
  }
});

test("ticket editor manages parent blocker and child relations", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Relation Editor Board",
      laneNames: ["Todo"],
    });
    const lane = boardPayload.lanes[0];
    const mainTicket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Main relation ticket",
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Parent relation candidate",
      priority: 8,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Blocker relation candidate",
      priority: 7,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Child relation candidate",
      priority: 6,
    });
    await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "Focus tag",
      color: "#1f6f5f",
    });

    await page.goto(`${baseUrl}/tickets/${mainTicket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#header-edit-button").click();

    await page.locator("#ticket-tag-search").fill("Focus");
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", false);

    await page.locator("#ticket-parent-search").fill("Parent relation");
    await expect(page.locator("#ticket-parent-options")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", true);
    await page.locator("#ticket-parent-search").press("Enter");
    await expect(page.locator("#ticket-parent-summary")).toContainText("Parent relation candidate");
    await expect(page.locator("#ticket-child-search")).toBeDisabled();
    await expect(page.locator("#ticket-child-summary")).toContainText("Clear parent to edit children");

    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await expect(page.locator("#ticket-blocker-options")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-parent-options")).toHaveJSProperty("hidden", true);

    const parentSaveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${mainTicket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#save-ticket-button").click();
    expect((await parentSaveResponse).status()).toBe(200);
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#ticket-relations")).toContainText("Parent");
    await expect(page.locator("#ticket-relations")).toContainText("Parent relation candidate");

    await page.locator("#header-edit-button").click();
    await page.locator("[data-remove-parent-id]").click();
    await expect(page.locator("#ticket-parent-summary")).not.toContainText("Parent relation candidate");
    await expect(page.locator("#ticket-child-search")).not.toBeDisabled();

    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await page.locator("#ticket-blocker-search").press("Enter");
    await expect(page.locator("#ticket-blocker-summary")).toContainText("Blocker relation candidate");
    await page.locator("[data-remove-blocker-id]").click();
    await expect(page.locator("#ticket-blocker-summary")).not.toContainText("Blocker relation candidate");
    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await page.locator("#ticket-blocker-search").press("Enter");

    await page.locator("#ticket-child-search").fill("Child relation");
    await page.locator("#ticket-child-search").press("Enter");
    await expect(page.locator("#ticket-child-summary")).toContainText("Child relation candidate");
    await page.locator("[data-remove-child-id]").click();
    await expect(page.locator("#ticket-child-summary")).not.toContainText("Child relation candidate");
    await page.locator("#ticket-child-search").fill("Child relation");
    await page.locator("#ticket-child-search").press("Enter");

    const relationSaveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${mainTicket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#save-ticket-button").click();
    expect((await relationSaveResponse).status()).toBe(200);
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#ticket-relations")).not.toContainText("Parent relation candidate");
    await expect(page.locator("#ticket-relations")).toContainText("Blocked By");
    await expect(page.locator("#ticket-relations")).toContainText("Blocker relation candidate");
    await expect(page.locator("#ticket-relations")).toContainText("Children");
    await expect(page.locator("#ticket-relations")).toContainText("Child relation candidate");
  } finally {
    await close();
  }
});
