import { expect, test, type Page } from "@playwright/test";

import { createBoard, createTag, createTicket, startTestApp } from "./helpers.js";

async function addRelation(page: Page, type: "blocker" | "related" | "parent" | "child") {
  await page.locator("#ticket-relation-add-button").click();
  await page.locator(`[data-relation-add-type="${type}"]`).click();
}

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
    await expect(page.locator("#ticket-tag-summary .ticket-tag-placeholder")).toHaveCount(0);
    await expect(page.locator("#ticket-tag-search")).toHaveAttribute("placeholder", "Add tags");

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
    await expect(page.locator("#toast")).toHaveAttribute("data-kind", "info");
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
    await expect(page.locator("#editor-header-state .ticket-state-pill-resolved use[href='/icons.svg#check']")).toHaveCount(1);
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
    await expect(page.locator("#editor-header-state .ticket-state-pill > span")).toHaveText(["Resolved", "Archived"]);
    await expect(page.locator("#editor-header-state .ticket-state-pill-resolved use[href='/icons.svg#check']")).toHaveCount(1);
    await expect(page.locator("#editor-header-state .ticket-state-pill-archived use[href='/icons.svg#archive']")).toHaveCount(1);
    await expect(page.locator("#editor-header-id")).toHaveText(`#${createdTicket.id}`);
    await expect(page.locator("#editor-header-priority")).toContainText("High");
    await expect(page.locator("#ticket-view-meta .ticket-archived-label")).toHaveCount(0);
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
    await expect(page.locator("#header-edit-button")).toBeFocused();
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

test("ticket detail moves a ticket to another board", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const sourceBoard = await createBoard(page.request, baseUrl, {
      name: "Move Source Board",
      laneNames: ["Todo", "Done"],
    });
    const targetBoard = await createBoard(page.request, baseUrl, {
      name: "Move Target Board",
      laneNames: ["Todo", "Done"],
    });
    const ticket = await createTicket(page.request, baseUrl, sourceBoard.board.id, {
      laneId: sourceBoard.lanes[0].id,
      title: "Move through detail",
      priority: 3,
    });

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#move-ticket-button")).toBeHidden();
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#move-ticket-button")).toBeVisible();
    await page.locator("#move-ticket-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-title")).toHaveText("Move Ticket");
    await page.locator("[data-move-board]").selectOption(String(targetBoard.board.id));
    await expect(page.locator("[data-move-lane]")).toContainText("Todo");
    await page.locator("[data-move-lane]").selectOption(String(targetBoard.lanes[1].id));
    const moveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${ticket.id}/move`) &&
        response.request().method() === "POST",
    );
    await page.locator("#ux-submit-button").click();
    expect((await moveResponse).status()).toBe(200);
    await expect(page.locator("#editor-header-title")).toContainText("Move through detail");
    await expect(page.locator("#board-title")).toHaveText("Move Target Board");
    await expect(page.locator(".lane", { has: page.locator(".lane-title", { hasText: "Done" }) })).toContainText("Move through detail");
  } finally {
    await close();
  }
});
