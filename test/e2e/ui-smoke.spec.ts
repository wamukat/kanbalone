import { expect, test } from "@playwright/test";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { buildApp } from "../../src/app.js";

function createDbFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "soloboard-ui-test-")), "test.sqlite");
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to allocate port")));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

test("board renders and ticket dialog actions are wired", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "UI Smoke", laneNames: ["todo", "done"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const todoLane = boardPayload.lanes[0];

    const ticketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: todoLane.id,
        title: "Smoke ticket",
        bodyMarkdown: "Body from **browser smoke**",
        priority: 3,
      },
    });
    expect(ticketResponse.status()).toBe(201);

    const relationTickets = [
      { title: "Parent candidate", priority: 8, isResolved: true },
      { title: "Blocker candidate", priority: 7 },
      { title: "Child candidate", priority: 6 },
      { title: "Archived candidate", priority: 5, isArchived: true },
    ];
    for (const ticket of relationTickets) {
      const relationResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
        data: {
          laneId: todoLane.id,
          title: ticket.title,
          priority: ticket.priority,
          isResolved: ticket.isResolved ?? false,
          isArchived: ticket.isArchived ?? false,
        },
      });
      expect(relationResponse.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#board-title")).toHaveText("UI Smoke");
    await expect(page.locator("#resolved-filter [data-value='false']")).toHaveClass(/active/);
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator("#search-input")).toHaveAttribute("placeholder", "Search keywords, #123, priority:3");
    const smokeTicket = await ticketResponse.json();
    await page.locator("#search-input").fill(String(smokeTicket.id));
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-card")).toContainText("Smoke ticket");
    await page.locator("#search-input").fill("priority:3");
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-card")).toContainText("Smoke ticket");
    await page.locator("#search-input").fill("");
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator(".board-title-row")).toBeHidden();
    await page.locator("#new-board-button").click();
    await expect(page.locator("[data-board-create-input]")).toBeFocused();
    await expect(page.locator("#new-board-button")).toBeHidden();
    await page.locator("#search-input").click();
    await expect(page.locator("[data-board-create-input]")).toHaveCount(0);
    await expect(page.locator("#new-board-button")).toBeVisible();
    await page.locator("#new-board-button").click();
    await page.locator("[data-board-create-input]").fill("Canceled board");
    await page.locator("[data-board-create-input]").press("Escape");
    await expect(page.getByRole("button", { name: "Canceled board" })).toHaveCount(0);
    await page.locator("#new-board-button").click();
    await page.locator("[data-board-create-input]").fill("Inline Board");
    await page.locator("[data-board-create-input]").press("Enter");
    await expect(page.locator("#board-title")).toHaveText("Inline Board");
    await page.getByRole("button", { name: "UI Smoke" }).click();
    await expect(page.locator("#board-title")).toHaveText("UI Smoke");
    await expect(page.locator("#board-list .board-button").first()).toHaveText("UI Smoke");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/boards/reorder") && response.status() === 200),
      page.getByRole("button", { name: "Inline Board" }).dragTo(page.getByRole("button", { name: "UI Smoke" }), {
        targetPosition: { x: 8, y: 4 },
      }),
    ]);
    await expect(page.locator("#board-list .board-button").first()).toHaveText("Inline Board");
    await page.reload();
    await expect(page.locator("#board-list .board-button").first()).toHaveText("Inline Board");
    await page.getByRole("button", { name: "UI Smoke" }).click();
    await expect(page.locator("#board-title")).toHaveText("UI Smoke");
    await page.getByRole("button", { name: "New lane" }).click();
    await expect(page.locator("[data-lane-create-input]")).toBeFocused();
    await page.locator("#search-input").click();
    await expect(page.locator("[data-lane-create-input]")).toHaveCount(0);
    await page.getByRole("button", { name: "New lane" }).click();
    await page.locator("[data-lane-create-input]").fill("Canceled lane");
    await page.locator("[data-lane-create-input]").press("Escape");
    await expect(page.locator(".lane-title", { hasText: "Canceled lane" })).toHaveCount(0);
    await page.getByRole("button", { name: "New lane" }).click();
    await page.locator("[data-lane-create-input]").fill("review");
    await page.locator("[data-lane-create-input]").press("Enter");
    await expect(page.locator(".lane-title", { hasText: "review" })).toBeVisible();
    await page.locator("#resolved-filter [data-value='']").click();
    await expect(page.locator(".ticket-card")).toHaveCount(4);
    const openSidebarSearchOffset = await page.locator(".toolbar-search").evaluate((search) => {
      const toolbar = document.querySelector(".toolbar");
      if (!toolbar) {
        return 0;
      }
      return search.getBoundingClientRect().left - toolbar.getBoundingClientRect().left;
    });
    expect(openSidebarSearchOffset).toBeLessThan(1);
    await expect(page.locator("#sidebar #view-mode-toggle")).toBeVisible();
    await expect(page.locator(".toolbar #view-mode-toggle")).toHaveCount(0);
    await expect(page.locator("#sidebar #view-mode-toggle use[href='/icons.svg#columns-3']")).toHaveCount(1);
    await expect(page.locator("#sidebar #view-mode-toggle use[href='/icons.svg#list']")).toHaveCount(1);
    await expect(page.locator("#board-settings-toggle-button use[href='/icons.svg#settings']")).toHaveCount(1);
    await expect(page.locator("#board-settings-toggle-button")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#sidebar-board-actions-panel")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(async () => page.locator("#sidebar-board-actions-panel").evaluate((panel) => panel.getBoundingClientRect().height)).toBe(0);
    await expect(page.locator("#sidebar-board-section > .sidebar-section-head h3")).toHaveCount(0);
    await page.locator("#board-settings-toggle-button").click();
    await expect(page.locator("#board-settings-toggle-button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#sidebar-board-actions-panel")).toHaveAttribute("aria-hidden", "false");
    await expect.poll(async () => page.locator("#sidebar-board-actions-panel").evaluate((panel) => panel.getBoundingClientRect().height)).toBeGreaterThan(0);
    await expect(page.locator("#sidebar-board-actions-panel .sidebar-board-panel-title")).toHaveText("Board");
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const panel = document.querySelector("#sidebar-board-actions-panel");
          const deleteButton = document.querySelector("#delete-board-button");
          if (!panel || !deleteButton) {
            return false;
          }
          return deleteButton.getBoundingClientRect().bottom <= panel.getBoundingClientRect().bottom;
        }),
      )
      .toBe(true);
    await expect(page.locator("[data-action='rename-lane']").first()).toBeHidden();
    await page.locator("[data-action='toggle-lane-actions']").first().click();
    await expect(page.locator("[data-action='toggle-lane-actions']").first()).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-action='rename-lane']").first()).toBeVisible();
    await expect(page.locator("[data-action='delete-lane']").first()).toBeVisible();
    await expect(page.locator("[data-action='delete-lane']").first()).toHaveCSS("color", "rgb(185, 61, 36)");
    await page.locator("#sidebar #view-mode-toggle [data-view-mode='list']").click();
    await expect(page.locator("#list-board")).toBeVisible();
    await expect(page.locator(".list-header")).toContainText("Lane");
    await expect(page.locator(".list-header")).toContainText("Status");
    await expect(page.locator(".list-actions").first()).toContainText("Select tickets to edit in bulk");
    await expect(page.locator(".list-action-button")).toHaveCount(0);
    const smokeTicketPriorityCell = page.getByRole("button", { name: "Smoke ticket" }).locator("..").locator(".list-cell").nth(1);
    await expect(smokeTicketPriorityCell).toHaveText("3");
    const listCheckboxAlignment = await page.evaluate(() => {
      const headerCheckbox = document.querySelector("#list-select-all");
      const rowCheckbox = document.querySelector("[data-list-ticket-id]");
      const header = document.querySelector(".list-header");
      const row = document.querySelector(".list-row");
      if (!headerCheckbox || !rowCheckbox || !header || !row) {
        return null;
      }
      const headerBox = headerCheckbox.getBoundingClientRect();
      const rowBox = rowCheckbox.getBoundingClientRect();
      return {
        leftOffset: Math.abs(headerBox.left - header.getBoundingClientRect().left - (rowBox.left - row.getBoundingClientRect().left)),
        centerOffset: Math.abs(headerBox.left + headerBox.width / 2 - (rowBox.left + rowBox.width / 2)),
        widthOffset: Math.abs(headerBox.width - rowBox.width),
      };
    });
    expect(listCheckboxAlignment).not.toBeNull();
    expect(listCheckboxAlignment?.leftOffset).toBeLessThan(1);
    expect(listCheckboxAlignment?.centerOffset).toBeLessThan(1);
    expect(listCheckboxAlignment?.widthOffset).toBeLessThan(1);
    const emptyListActionsHeight = await page.locator(".list-actions").first().evaluate((element) => element.getBoundingClientRect().height);
    await page.getByRole("button", { name: "Smoke ticket" }).locator("..").locator("[data-list-ticket-id]").check();
    await expect(page.locator(".list-actions").first()).toContainText("1 selected");
    const selectedListActionsHeight = await page.locator(".list-actions").first().evaluate((element) => element.getBoundingClientRect().height);
    expect(Math.abs(selectedListActionsHeight - emptyListActionsHeight)).toBeLessThan(1);
    await expect(page.locator("[data-bulk-resolve='true'] use[href='/icons.svg#check']").first()).toHaveCount(1);
    await expect(page.locator("[data-bulk-archive='true'] use[href='/icons.svg#archive']").first()).toHaveCount(1);
    await expect(page.locator("[data-bulk-delete='true'] use[href='/icons.svg#trash-2']").first()).toHaveCount(1);
    await expect(page.locator("[data-bulk-resolve='false']")).toHaveCount(0);
    await expect(page.locator("[data-bulk-archive='false']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Parent candidate" }).locator("..").locator(".list-status-cell .ticket-status-icon-resolved use[href='/icons.svg#check']")).toHaveCount(1);
    await page.getByRole("button", { name: "Parent candidate" }).locator("..").locator("[data-list-ticket-id]").check();
    await expect(page.locator(".list-actions").first()).toContainText("2 selected");
    await expect(page.locator("[data-bulk-resolve='false'] use[href='/icons.svg#circle']").first()).toHaveCount(1);
    await page.locator("#sidebar #view-mode-toggle [data-view-mode='kanban']").click();
    await expect(page.locator("#lane-board")).toBeVisible();
    await expect(page.getByRole("button", { name: "Parent candidate" }).locator("..").locator(".ticket-status-icon-resolved use[href='/icons.svg#check']")).toHaveCount(1);
    await expect(page.locator("#export-board-button use[href='/icons.svg#download']")).toHaveCount(1);
    await expect(page.locator(".import-button use[href='/icons.svg#upload']")).toHaveCount(1);
    await expect(page.locator("#rename-board-button use[href='/icons.svg#pencil']")).toHaveCount(1);
    await expect(page.locator("#delete-board-button use[href='/icons.svg#trash-2']")).toHaveCount(1);
    await page.locator("#archived-filter-button").click();
    await expect(page.locator(".ticket-card")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Archived candidate" }).locator("..").locator(".ticket-status-icon-archived use[href='/icons.svg#archive']")).toHaveCount(1);
    await page.locator("#sidebar #view-mode-toggle [data-view-mode='list']").click();
    await expect(page.getByRole("button", { name: "Archived candidate" }).locator("..").locator(".list-status-cell .ticket-status-icon-archived use[href='/icons.svg#archive']")).toHaveCount(1);
    await page.getByRole("button", { name: "Archived candidate" }).locator("..").locator("[data-list-ticket-id]").check();
    await expect(page.locator("[data-bulk-archive='false'] use[href='/icons.svg#rotate-ccw']").first()).toHaveCount(1);
    await page.locator("#sidebar #view-mode-toggle [data-view-mode='kanban']").click();
    await page.locator("#archived-filter-button").click();
    await expect(page.locator(".ticket-card")).toHaveCount(4);

    const bulkDeleteTicketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: todoLane.id,
        title: "Bulk delete candidate",
        priority: 2,
      },
    });
    expect(bulkDeleteTicketResponse.status()).toBe(201);
    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await expect(page.locator("#list-board")).toBeVisible();
    const bulkDeleteCandidateRow = page.getByRole("button", { name: "Bulk delete candidate" }).locator("..");
    await expect(bulkDeleteCandidateRow).toBeVisible();
    await bulkDeleteCandidateRow.locator("[data-list-ticket-id]").check();
    const bulkDeleteButton = page.locator(".list-actions [data-bulk-delete='true']").first();
    await expect(bulkDeleteButton).toBeVisible();
    await bulkDeleteButton.click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-submit-button")).toHaveText("Delete");
    const bulkDeleteResponse = page.waitForResponse((response) => response.url().includes("/api/tickets/") && response.request().method() === "DELETE");
    await page.locator("#ux-submit-button").click();
    expect((await bulkDeleteResponse).status()).toBe(204);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.getByRole("button", { name: "Bulk delete candidate" })).toHaveCount(0);
    await page.locator("#resolved-filter [data-value='']").click();

    await page.getByRole("button", { name: "Smoke ticket" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toHaveText("Smoke ticket");
    await expect(page.locator("#editor-header-title")).toBeVisible();
    await expect(page.locator("#header-edit-button")).toBeVisible();
    await expect(page.locator("#save-comment-button")).toHaveClass(/primary-action/);
    const commentFormBeforeList = await page.locator("#comment-form").evaluate((form) => {
      const list = document.querySelector("#ticket-comments");
      return Boolean(list && form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(commentFormBeforeList).toBe(true);

    await page.locator("#comment-body").fill("E2E comment **saved**");
    await page.locator("#save-comment-button").click();
    await expect(page.locator("#ticket-comments .comment-item")).toContainText("E2E comment saved");
    await expect(page.locator("#comment-body")).toHaveValue("");

    await expect(page.locator("[data-edit-comment-id]")).toBeHidden();
    await page.locator("[data-toggle-comment-actions]").click();
    await expect(page.locator("[data-toggle-comment-actions]")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-edit-comment-id]")).toBeVisible();
    await expect(page.locator("[data-delete-comment-id]")).toBeVisible();
    await expect(page.locator("[data-delete-comment-id]")).toHaveCSS("color", "rgb(185, 61, 36)");
    await page.locator("[data-edit-comment-id]").click();
    await expect(page.locator("[data-comment-edit-form]")).toBeVisible();
    await expect(page.locator("[data-comment-edit-body]")).toHaveValue("E2E comment **saved**");
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await page.locator("[data-comment-edit-body]").fill("Canceled edit");
    await page.locator("[data-cancel-comment-edit]").click();
    await expect(page.locator("[data-comment-edit-form]")).toBeHidden();
    await expect(page.locator("#ticket-comments .comment-item")).toContainText("E2E comment saved");
    await page.locator("[data-toggle-comment-actions]").click();
    await page.locator("[data-edit-comment-id]").click();
    await page.locator("[data-comment-edit-body]").fill("E2E comment edited");
    await page.locator("[data-save-comment-id]").click();
    await expect(page.locator("[data-comment-edit-form]")).toBeHidden();
    await expect(page.locator("#ticket-comments .comment-item")).toContainText("E2E comment edited");

    await expect(page.locator("[data-delete-comment-id]")).toBeHidden();
    await page.locator("[data-toggle-comment-actions]").click();
    await expect(page.locator("[data-delete-comment-id]")).toBeVisible();
    await page.locator("[data-delete-comment-id]").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-submit-button")).toHaveText("Delete");
    const deleteCommentResponse = page.waitForResponse((response) => response.url().includes("/api/comments/") && response.request().method() === "DELETE");
    await page.locator("#ux-submit-button").click();
    const deleteCommentResult = await deleteCommentResponse;
    expect(deleteCommentResult.status()).toBe(204);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#ticket-comments")).toContainText("No comments yet.");
    await page.locator("#activity-tab-button").click();
    await expect(page.locator("#activity-section")).toBeVisible();
    await expect(page.locator("#ticket-activity")).toContainText("Comment added");
    await expect(page.locator("#ticket-activity")).toContainText("Comment updated");
    await expect(page.locator("#ticket-activity")).toContainText("Comment deleted");
    await page.locator("#comments-tab-button").click();

    await page.locator("#header-edit-button").click();
    await expect(page.locator("#editor-form")).toBeVisible();
    await expect(page.locator("#save-ticket-button")).toHaveClass(/primary-action/);
    await expect(page.locator("#delete-ticket-button use[href='/icons.svg#trash-2']")).toHaveCount(1);
    await expect(page.locator("#archive-ticket-button use[href='/icons.svg#archive']")).toHaveCount(1);
    await expect(page.locator("#archive-ticket-button")).toContainText("Archive");
    await expect(page.locator("#ticket-resolved-row .completion-toggle-label")).toHaveText("Resolved");
    await expect(page.locator("#ticket-resolved-row .completion-toggle-control")).not.toContainText("Resolved");
    await expect(page.locator("#ticket-resolved-row .completion-switch")).toHaveCount(1);
    await expect(page.locator("#ticket-resolved")).not.toBeChecked();
    await page.locator("#ticket-resolved-row").click();
    await expect(page.locator("#ticket-resolved")).toBeChecked();
    await page.locator("#ticket-resolved-row").click();
    await expect(page.locator("#ticket-resolved")).not.toBeChecked();
    const archiveAfterDelete = await page.locator("#delete-ticket-button").evaluate((deleteButton) => {
      const archiveButton = document.querySelector("#archive-ticket-button");
      return Boolean(archiveButton && deleteButton.compareDocumentPosition(archiveButton) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(archiveAfterDelete).toBe(true);
    await expect(page.locator(".editor-section-label")).toHaveText("Relations");
    const relationsBeforeBlocker = await page.locator(".editor-section-label").evaluate((label) => {
      const blocker = document.querySelector("#ticket-blocker-toggle");
      return Boolean(blocker && label.compareDocumentPosition(blocker) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(relationsBeforeBlocker).toBe(true);
    const editActionButtonMetrics = await page.evaluate(() => {
      const deleteBox = document.querySelector("#delete-ticket-button")?.getBoundingClientRect();
      const archiveBox = document.querySelector("#archive-ticket-button")?.getBoundingClientRect();
      return {
        deleteHeight: deleteBox?.height ?? 0,
        archiveHeight: archiveBox?.height ?? 0,
      };
    });
    expect(Math.abs(editActionButtonMetrics.deleteHeight - editActionButtonMetrics.archiveHeight)).toBeLessThan(1);
    await expect(page.locator("#editor-header-title")).toBeHidden();

    await page.locator("#ticket-new-tag-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await page.locator('[data-field-id="name"]').fill("smoke-tag");
    await expect(page.locator(".ux-color-row [data-field-id='color']")).toBeVisible();
    await expect(page.locator("[data-color-enabled-for='color']")).not.toBeChecked();
    await expect(page.locator('[data-field-id="color"]')).toBeDisabled();
    await expect(page.locator('[data-field-id="color"]')).toHaveValue("#1f6f5f");
    await expect(page.locator("[data-color-picker-for='color']")).toHaveValue("#1f6f5f");
    await expect(page.locator(".ux-color-row [data-color-picker-for='color']")).toBeHidden();
    await expect(page.locator(".ux-color-none-preview")).toBeVisible();
    const colorInputWidths = await page.locator(".ux-color-row").evaluate((row) => {
      const [switchCell, hexInput, colorCell] = row.children;
      return {
        switch: switchCell.getBoundingClientRect().width,
        hex: hexInput.getBoundingClientRect().width,
        color: colorCell.getBoundingClientRect().width,
      };
    });
    expect(Math.abs(colorInputWidths.hex - colorInputWidths.switch * 2)).toBeLessThan(2);
    expect(Math.abs(colorInputWidths.color - colorInputWidths.hex)).toBeLessThan(1);
    await page.locator(".ux-color-enable-switch").click();
    await expect(page.locator("[data-color-enabled-for='color']")).toBeChecked();
    await expect(page.locator('[data-field-id="color"]')).toBeEnabled();
    await expect(page.locator(".ux-color-row [data-color-picker-for='color']")).toBeVisible();
    await expect(page.locator("[data-color-picker-for='color']")).toHaveValue("#1f6f5f");
    await page.locator('[data-field-id="color"]').fill("#336699");
    await expect(page.locator("[data-color-picker-for='color']")).toHaveValue("#336699");
    await page.locator("[data-color-picker-for='color']").fill("#445566");
    await expect(page.locator('[data-field-id="color"]')).toHaveValue("#445566");
    await expect(page.locator("[data-color-enabled-for='color']")).toBeChecked();
    await page.locator(".ux-color-enable-switch").click();
    await expect(page.locator('[data-field-id="color"]')).toBeDisabled();
    await expect(page.locator('[data-field-id="color"]')).toHaveValue("#445566");
    await expect(page.locator("[data-color-picker-for='color']")).toBeDisabled();
    await expect(page.locator("[data-color-picker-for='color']")).toBeHidden();
    await expect(page.locator(".ux-color-none-preview")).toBeVisible();
    await page.locator(".ux-color-enable-switch").click();
    await expect(page.locator("[data-color-picker-for='color']")).toBeVisible();
    await page.locator(".ux-color-enable-switch").click();
    await expect(page.locator("[data-color-enabled-for='color']")).not.toBeChecked();
    await expect(page.locator('[data-field-id="color"]')).not.toBeFocused();
    await expect(page.locator('[data-field-id="color"]')).toHaveValue("#445566");
    await page.locator("#ux-submit-button").click();
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#ticket-tag-summary")).toContainText("smoke-tag");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveClass(/tag-no-color/);
    await expect(page.locator("#ticket-tag-options [data-tag-id]")).toHaveCount(1);
    const sidebarTagBadge = page.locator("#sidebar-tag-list .sidebar-tag-badge", { hasText: "smoke-tag" });
    await expect(sidebarTagBadge).toBeVisible();
    await expect(sidebarTagBadge).toHaveClass(/tag-no-color/);
    await expect(sidebarTagBadge).toHaveAttribute("aria-label", "Edit tag: smoke-tag");
    await expect(sidebarTagBadge.locator("use[href='/icons.svg#pencil']")).toHaveCount(1);
    await expect(page.locator("#sidebar-tag-list .icon-button")).toHaveCount(0);

    await page.locator("[data-remove-tag-id]", { hasText: "smoke-tag" }).click();
    await expect(page.locator("#ticket-tag-summary")).not.toContainText("smoke-tag");

    await page.locator("#ticket-tag-search").fill("smoke");
    await page.locator("#ticket-tag-search").press("Enter");
    await expect(page.locator("#ticket-tag-summary")).toContainText("smoke-tag");

    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ticket-tag-options")).toBeHidden();
    await expect(page.locator("#ticket-tag-summary")).toContainText("smoke-tag");

    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options")).toBeVisible();
    await page.locator("#ticket-blocker-toggle").click();
    await expect(page.locator("#ticket-tag-options")).toBeHidden();

    await page.locator("#ticket-parent-search").fill("Parent");
    await expect(page.locator("#ticket-parent-options .ticket-picker-meta").first()).toHaveText("Resolved");
    await page.locator("#ticket-parent-search").press("Enter");
    await expect(page.locator("#ticket-parent-summary")).toContainText("Parent candidate");
    await expect(page.locator("#ticket-child-summary")).toContainText("Clear parent to edit children");
    await page.locator("[data-remove-parent-id]").click();
    await expect(page.locator("#ticket-parent-summary")).not.toContainText("Parent candidate");
    await expect(page.locator("#ticket-parent-search")).toHaveAttribute("placeholder", "Set parent by ID or title");

    await page.locator("#ticket-blocker-search").fill("Blocker");
    await page.locator("#ticket-blocker-search").press("Enter");
    await expect(page.locator("#ticket-blocker-summary")).toContainText("Blocker candidate");
    await page.keyboard.press("Escape");
    await expect(page.locator("#ticket-blocker-options")).toBeHidden();

    await page.locator("#ticket-child-search").fill("Child");
    await page.locator("#ticket-child-search").press("Enter");
    await expect(page.locator("#ticket-child-summary")).toContainText("Child candidate");

    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#ticket-relations")).toContainText("Blocked By");
    await expect(page.locator("#ticket-relations")).toContainText("Blocker candidate");
    await expect(page.locator("#ticket-relations")).toContainText("Children");
    await expect(page.locator("#ticket-relations")).toContainText("Child candidate");

    await page.locator("#header-edit-button").click();
    await expect(page.locator("#editor-form")).toBeVisible();

    await page.locator("#delete-ticket-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-submit-button")).toHaveText("Delete");
    await expect(page.locator("#ux-submit-button")).toHaveClass(/danger-confirm-action/);
    await expect(page.locator("#ux-submit-button use[href='/icons.svg#trash-2']")).toHaveCount(1);

    expect(consoleErrors).toEqual([]);
  } finally {
    await page.close();
    await app.close();
  }
});

test("long tag labels are constrained across ticket surfaces", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const longTagName = "very-long-tag-name-without-natural-breaks-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Long Tag Board", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];
    const ticketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: lane.id,
        title: "Long tag ticket",
      },
    });
    expect(ticketResponse.status()).toBe(201);
    const ticket = await ticketResponse.json();
    const tagResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`, {
      data: { name: longTagName, color: "#1f6f5f" },
    });
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();
    const updateResponse = await page.request.patch(`${baseUrl}/api/tickets/${ticket.id}`, {
      data: {
        laneId: lane.id,
        title: ticket.title,
        bodyMarkdown: ticket.bodyMarkdown,
        priority: ticket.priority,
        isResolved: ticket.isResolved,
        isArchived: ticket.isArchived,
        parentTicketId: ticket.parentTicketId,
        tagIds: [tag.id],
        blockerIds: [],
      },
    });
    expect(updateResponse.status()).toBe(200);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag [aria-hidden="true"]`)).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag`)).toHaveAttribute("title", longTagName);
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag .visually-hidden`)).toHaveText(longTagName);
    await expect
      .poll(async () =>
        page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`).evaluate((card) => {
          const tagElement = card.querySelector(".tag");
          if (!tagElement) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1
            && card.scrollWidth <= card.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    const listRow = page.locator(`[data-open-ticket-id="${ticket.id}"]`).locator("xpath=..");
    await expect(listRow.locator(".tag [aria-hidden='true']")).toHaveText("very-long-tag-name-withou...");
    await expect(listRow.locator(".tag")).toHaveAttribute("title", longTagName);
    await expect
      .poll(async () =>
        listRow.evaluate((row) => {
          const tagElement = row.querySelector(".tag");
          const tagCell = row.querySelector(".tag-list");
          if (!tagElement || !tagCell) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= tagCell.getBoundingClientRect().right + 1
            && row.scrollWidth <= row.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator(".ticket-meta-row .tag [aria-hidden='true']")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator(".ticket-meta-row .tag")).toHaveAttribute("title", longTagName);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip-text")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("title", `Remove tag: ${longTagName}`);
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("aria-label", `Remove tag: ${longTagName}`);
    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options .tag-picker-text")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("title", longTagName);
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("aria-label", longTagName);
  } finally {
    await page.close();
    await app.close();
  }
});

test("long tag labels remain safe without Intl.Segmenter", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Intl, "Segmenter", {
      configurable: true,
      value: undefined,
    });
  });
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const longTagName = "🇯🇵🇺🇸very-long-tag-name-without-natural-breaks-abcdefghijklmnopqrstuvwxyz";
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Fallback Tag Board", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];
    const ticketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: lane.id,
        title: "Fallback long tag ticket",
      },
    });
    expect(ticketResponse.status()).toBe(201);
    const ticket = await ticketResponse.json();
    const tagResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`, {
      data: { name: longTagName, color: "#1f6f5f" },
    });
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();
    const updateResponse = await page.request.patch(`${baseUrl}/api/tickets/${ticket.id}`, {
      data: {
        laneId: lane.id,
        title: ticket.title,
        bodyMarkdown: ticket.bodyMarkdown,
        priority: ticket.priority,
        isResolved: ticket.isResolved,
        isArchived: ticket.isArchived,
        parentTicketId: ticket.parentTicketId,
        tagIds: [tag.id],
        blockerIds: [],
      },
    });
    expect(updateResponse.status()).toBe(200);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    const tagLocator = page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag`);
    await expect(tagLocator.locator("[aria-hidden='true']")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(tagLocator).toHaveAttribute("title", longTagName);
    await expect
      .poll(async () =>
        page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`).evaluate((card) => {
          const tagElement = card.querySelector(".tag");
          if (!tagElement) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1
            && card.scrollWidth <= card.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    const listRow = page.locator(`[data-open-ticket-id="${ticket.id}"]`).locator("xpath=..");
    await expect(listRow.locator(".tag [aria-hidden='true']")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(listRow.locator(".tag")).toHaveAttribute("title", longTagName);
    await expect
      .poll(async () =>
        listRow.evaluate((row) => {
          const tagElement = row.querySelector(".tag");
          const tagCell = row.querySelector(".tag-list");
          if (!tagElement || !tagCell) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= tagCell.getBoundingClientRect().right + 1
            && row.scrollWidth <= row.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator(".ticket-meta-row .tag [aria-hidden='true']")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator(".ticket-meta-row .tag")).toHaveAttribute("title", longTagName);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip-text")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("title", `Remove tag: ${longTagName}`);
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("aria-label", `Remove tag: ${longTagName}`);
    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options .tag-picker-text")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("title", longTagName);
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("aria-label", longTagName);
  } finally {
    await page.close();
    await app.close();
  }
});

test("lane filter does not leak from List view into Kanban view", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Lane Filter Board", laneNames: ["todo", "review"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const [todoLane, reviewLane] = boardPayload.lanes;
    for (const ticket of [
      { laneId: todoLane.id, title: "Todo ticket" },
      { laneId: reviewLane.id, title: "Review ticket" },
    ]) {
      const response = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
        data: ticket,
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await expect(page.locator(".list-row")).toHaveCount(2);
    await page.locator("#lane-filter").selectOption(String(reviewLane.id));
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator(".list-row")).toContainText("Review ticket");

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator("#lane-filter")).toHaveValue("");
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText(["Todo ticket", "Review ticket"]);
  } finally {
    await page.close();
    await app.close();
  }
});
