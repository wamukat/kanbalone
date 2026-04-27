import { expect, test } from "@playwright/test";

import { createBoard, createTag, createTicket, startTestApp } from "./helpers.js";

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
      priority: 4,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Parent relation alternate",
      priority: 3,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Blocker relation candidate",
      priority: 3,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Blocker relation alternate",
      priority: 1,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Child relation candidate",
      priority: 2,
    });
    await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "Focus alpha",
      color: "#1f6f5f",
    });
    await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "Focus beta",
      color: "#1f6f5f",
    });
    const cancelTag = await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "Cancel tag",
      color: "#1f6f5f",
    });
    const taggedTicket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Tagged cancel ticket",
      tagIds: [cancelTag.id],
    });

    await page.goto(`${baseUrl}/tickets/${taggedTicket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary")).toContainText("Cancel tag");
    await page.locator("[data-remove-tag-id]").click();
    await expect(page.locator("#ticket-tag-summary")).not.toContainText("Cancel tag");
    await page.locator("#cancel-edit-button").click();
    await expect(page.locator("#ticket-view-meta")).toContainText("Cancel tag");
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary")).toContainText("Cancel tag");

    await page.goto(`${baseUrl}/tickets/${mainTicket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#header-edit-button").click();

    await page.locator("#ticket-tag-search").focus();
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", true);
    await page.locator("#ticket-tag-search").fill("Focus");
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-tag-options .tag-picker-item.active")).toContainText("Focus alpha");
    await page.locator("#ticket-tag-search").press("ArrowDown");
    await expect(page.locator("#ticket-tag-options .tag-picker-item.active")).toContainText("Focus beta");
    await page.locator("#ticket-tag-search").press("ArrowUp");
    await expect(page.locator("#ticket-tag-options .tag-picker-item.active")).toContainText("Focus alpha");
    await page.locator("#ticket-tag-search").press("Enter");
    await expect(page.locator("#ticket-tag-summary")).toContainText("Focus alpha");
    await page.locator("#ticket-tag-search").fill("Focus");
    await expect(page.locator("#ticket-tag-options [data-tag-id]")).toHaveCount(1);
    await expect(page.locator("#ticket-tag-options")).not.toContainText("Focus alpha");
    await expect(page.locator("#ticket-tag-options")).toContainText("Focus beta");

    await page.locator("#ticket-parent-search").focus();
    await expect(page.locator("#ticket-parent-options")).toHaveJSProperty("hidden", true);
    await page.locator("#ticket-parent-search").fill("Parent relation");
    await expect(page.locator("#ticket-parent-options")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", true);
    await expect(page.locator("#ticket-parent-options .tag-picker-item.active")).toContainText("Parent relation candidate");
    await page.locator("#ticket-parent-search").press("ArrowDown");
    await expect(page.locator("#ticket-parent-options .tag-picker-item.active")).toContainText("Parent relation alternate");
    await page.locator("#ticket-parent-search").press("ArrowUp");
    await page.locator("#ticket-parent-search").press("Enter");
    await expect(page.locator("#ticket-parent-summary")).toContainText("Parent relation candidate");
    await expect(page.locator("#ticket-child-search")).toBeDisabled();
    await expect(page.locator("#ticket-child-summary")).toContainText("Clear parent to edit children");

    await page.locator("#ticket-blocker-search").focus();
    await expect(page.locator("#ticket-blocker-options")).toHaveJSProperty("hidden", true);
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
    await expect(page.locator("#ticket-blocker-options .tag-picker-item.active")).toContainText("Blocker relation candidate");
    await page.locator("#ticket-blocker-search").press("ArrowDown");
    await expect(page.locator("#ticket-blocker-options .tag-picker-item.active")).toContainText("Blocker relation alternate");
    await page.locator("#ticket-blocker-search").press("ArrowUp");
    await page.locator("#ticket-blocker-search").press("Enter");
    await expect(page.locator("#ticket-blocker-summary")).toContainText("Blocker relation candidate");
    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await expect(page.locator("#ticket-blocker-options [data-blocker-id]")).toHaveCount(1);
    await expect(page.locator("#ticket-blocker-options")).not.toContainText("Blocker relation candidate");
    await expect(page.locator("#ticket-blocker-options")).toContainText("Blocker relation alternate");
    await page.locator("[data-remove-blocker-id]").click();
    await expect(page.locator("#ticket-blocker-summary")).not.toContainText("Blocker relation candidate");
    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await page.locator("#ticket-blocker-search").press("Enter");

    await page.locator("#ticket-child-search").fill("Child relation");
    await page.locator("#ticket-child-search").press("Enter");
    await expect(page.locator("#ticket-child-summary")).toContainText("Child relation candidate");
    await page.locator("#ticket-child-search").fill("Child relation");
    await expect(page.locator("#ticket-child-options [data-child-id]")).toHaveCount(0);
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
