import { expect, test, type Page } from "@playwright/test";

import { createBoard, createTag, createTicket, startTestApp } from "./helpers.js";

async function addRelation(page: Page, type: "blocker" | "related" | "parent" | "child") {
  await page.locator("#ticket-relation-add-button").click();
  await page.locator(`[data-relation-add-type="${type}"]`).click();
}

test("ticket detail supports focused inline updates", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Inline Detail Board",
      laneNames: ["Todo", "Review"],
    });
    const [todoLane] = boardPayload.lanes;
    const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: todoLane.id,
      title: "Inline detail ticket",
      bodyMarkdown: "Original **body**",
      priority: 2,
      isResolved: true,
      isArchived: true,
    });

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ticket-view")).toBeVisible();

    await page.locator("[data-detail-edit='title']").click();
    await page.locator("[data-detail-title-input]").fill("Cancelled inline title");
    await page.locator("#activity-tab-button").click();
    await expect(page.locator("[data-detail-title-input]")).toHaveCount(0);
    await expect(page.locator("#editor-header-title")).toContainText("Inline detail ticket");

    await page.locator("[data-detail-edit='title']").click();
    await page.locator("[data-detail-title-input]").fill("Inline title updated");
    const titleResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${ticket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("[data-detail-title-input]").press("Enter");
    expect((await titleResponse).status()).toBe(200);
    await expect(page.locator("#editor-header-title")).toContainText("Inline title updated");

    await page.locator("[data-detail-edit='priority']").click();
    await page.locator("#activity-tab-button").click();
    await expect(page.locator("[data-detail-priority-select]")).toHaveCount(0);
    await expect(page.locator("#editor-header-priority")).toContainText("Medium");

    await page.locator("[data-detail-edit='priority']").click();
    const priorityResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${ticket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("[data-detail-priority-select]").selectOption("4");
    expect((await priorityResponse).status()).toBe(200);
    await expect(page.locator("#editor-header-priority")).toContainText("Urgent");

    await expect(page.locator("#ticket-view-meta")).not.toContainText("Lane");
    await expect(page.locator("[data-detail-edit='lane']")).toHaveCount(0);

    const resolvedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${ticket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("[data-detail-state-pill='resolved']").click();
    await expect(page.locator("[data-detail-state-action='resolved']")).toHaveText("Open");
    await page.locator("[data-detail-state-action='resolved']").click();
    expect((await resolvedResponse).status()).toBe(200);
    await expect(page.locator("[data-detail-state-pill='resolved']")).toHaveCount(0);

    const archivedResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${ticket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("[data-detail-state-pill='archived']").click();
    await expect(page.locator("[data-detail-state-action='archived']")).toHaveText("Restore");
    await page.locator("[data-detail-state-action='archived']").click();
    expect((await archivedResponse).status()).toBe(200);
    await expect(page.locator("[data-detail-state-pill='archived']")).toHaveCount(0);

    await page.locator("[data-detail-edit='body']").click();
    await page.locator("[data-detail-body-input]").fill("Updated body\n\n- via detail");
    const bodyResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${ticket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("[data-detail-body-input]").press("Control+Enter");
    expect((await bodyResponse).status()).toBe(200);
    await expect(page.locator("#ticket-view-body")).toContainText("Updated body");
    await expect(page.locator("[data-detail-body-input]")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("ticket activity tab renders structured events once", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Structured Event Board",
      laneNames: ["Todo"],
    });
    const [todoLane] = boardPayload.lanes;
    const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: todoLane.id,
      title: "Structured event target",
    });
    const eventResponse = await page.request.post(`${baseUrl}/api/tickets/${ticket.id}/events`, {
      data: {
        source: "a2o",
        kind: "branch_pushed",
        title: "Branch pushed",
        summary: "Task branch is ready",
        severity: "success",
      },
    });
    expect(eventResponse.status()).toBe(201);

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#activity-tab-button").click();
    await expect(page.locator("#ticket-activity")).toContainText("Branch pushed");
    await expect(page.locator("#ticket-activity")).toContainText("Task branch is ready");
    await expect(page.locator("#ticket-activity")).toContainText("a2o / branch_pushed / success");
    await expect(page.locator("#ticket-activity .activity-message", { hasText: "Branch pushed" })).toHaveCount(1);
  } finally {
    await close();
  }
});
