import { expect, test, type Page } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

test.setTimeout(60_000);

async function addRelation(page: Page, type: "blocker" | "parent" | "child") {
  await page.locator("#ticket-relation-add-button").click();
  await page.locator(`[data-relation-add-type="${type}"]`).click();
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
      { title: "Parent candidate", priority: 4, isResolved: true },
      { title: "Blocker candidate", priority: 4 },
      { title: "Child candidate", priority: 4 },
      { title: "Archived candidate", priority: 1, isArchived: true },
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
    await expect(page.locator("#status-filter [data-status-filter='open']")).toHaveClass(/active/);
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator("#search-input")).toHaveAttribute("placeholder", "Search keywords or #123");
    await expect(page.locator("#status-filter")).not.toHaveClass(/is-filter-active/);
    const smokeTicket = await ticketResponse.json();
    await page.locator("#search-input").fill(String(smokeTicket.id));
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-card")).toContainText("Smoke ticket");
    await page.locator("#search-input").fill("");
    await expect(page.locator(".toolbar-search")).not.toHaveClass(/is-filter-active/);
    const highPriorityResponse = page.waitForResponse((response) => response.url().includes(`/api/boards/${boardPayload.board.id}/tickets?resolved=false`) && response.status() === 200);
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await expect(page.locator("#priority-filter [data-priority-filter='high'] use[href='/icons.svg#priority-high']")).toHaveCount(1);
    await page.locator("#priority-filter [data-priority-filter='high']").click();
    await highPriorityResponse;
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator("#lane-board")).toContainText("Smoke ticket");
    await expect(page.locator("#priority-filter")).toHaveClass(/is-filter-active/);
    const highUrgentPriorityResponse = page.waitForResponse((response) => response.url().includes(`/api/boards/${boardPayload.board.id}/tickets?resolved=false`) && response.status() === 200);
    await page.locator("#priority-filter [data-priority-filter='urgent']").click();
    await highUrgentPriorityResponse;
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator("#lane-board")).toContainText("Smoke ticket");
    await expect(page.locator("#lane-board")).toContainText("Blocker candidate");
    await expect(page.locator("#lane-board")).toContainText("Child candidate");
    await page.locator("#priority-filter [data-priority-filter='high']").click();
    await page.locator("#priority-filter [data-priority-filter='urgent']").click();
    await expect(page.locator(".toolbar-search")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-filter-active/);
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
    await expect(page.locator("#status-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".toolbar-search")).not.toHaveClass(/is-filter-active/);
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
    await page.locator("#status-filter .filter-menu-edge-toggle").click();
    await expect(page.locator("#status-filter [data-status-filter='resolved'] use[href='/icons.svg#check']")).toHaveCount(1);
    await page.locator("#status-filter [data-status-filter='resolved']").click();
    await expect(page.locator(".ticket-card")).toHaveCount(4);
    const openSidebarSearchOffset = await page.locator(".toolbar-search").evaluate((search) => {
      const firstLane = document.querySelector(".lane:not(.lane-create-column)");
      if (!firstLane) {
        return 0;
      }
      return Math.abs(search.getBoundingClientRect().left - firstLane.getBoundingClientRect().left);
    });
    expect(openSidebarSearchOffset).toBeLessThan(2);
    await expect(page.locator("#sidebar #view-mode-toggle")).toBeVisible();
    await expect(page.locator(".toolbar #view-mode-toggle")).toHaveCount(0);
    await expect(page.locator("#sidebar #view-mode-toggle use[href='/icons.svg#columns-3']")).toHaveCount(1);
    await expect(page.locator("#sidebar #view-mode-toggle use[href='/icons.svg#list']")).toHaveCount(1);
    await expect(page.locator(".main-footer")).toHaveCount(0);
    await expect(page.locator("#sidebar .sidebar-github-link")).toHaveAttribute("href", "https://github.com/wamukat/kanbalone");
    await expect(page.locator("#sidebar .sidebar-github-link use[href='/icons.svg#github']")).toHaveCount(1);
    await expect(page.locator("#sidebar #footer-app-label")).toContainText("Kanbalone");
    await page.setViewportSize({ width: 1280, height: 500 });
    await expect(page.locator("#board-settings-toggle-button use[href='/icons.svg#settings']")).toHaveCount(1);
    await expect(page.locator("#board-settings-toggle-button")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#sidebar-board-actions-panel")).toHaveAttribute("aria-hidden", "true");
    await expect.poll(async () => page.locator("#sidebar-board-actions-panel").evaluate((panel) => panel.getBoundingClientRect().height)).toBe(0);
    await expect(page.locator("#sidebar-board-section > .sidebar-section-head h3")).toHaveCount(0);
    await page.locator("#board-settings-toggle-button").click();
    await expect(page.locator("#board-settings-toggle-button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#sidebar-board-actions-panel")).toHaveAttribute("aria-hidden", "false");
    await expect.poll(async () => page.locator("#sidebar-board-actions-panel").evaluate((panel) => panel.getBoundingClientRect().height)).toBeGreaterThan(0);
    await expect(page.locator("#sidebar-board-actions-panel .sidebar-board-panel-title")).toHaveCount(0);
    await expect
      .poll(async () =>
        page.evaluate(() => document.documentElement.scrollHeight <= document.documentElement.clientHeight),
      )
      .toBe(true);
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
    await expect(page.locator("[data-action='delete-lane']").first()).toHaveCSS("color", "rgb(196, 61, 61)");
    await page.locator("#sidebar #view-mode-toggle [data-view-mode='list']").click();
    await expect(page.locator("#list-board")).toBeVisible();
    await expect(page.locator(".list-header")).toContainText("Lane");
    await expect(page.locator(".list-header")).toContainText("Status");
    await expect(page.locator(".list-actions").first()).toContainText("Select tickets to edit in bulk");
    await expect(page.locator(".list-action-button")).toHaveCount(0);
    const smokeTicketPriorityCell = page.getByRole("button", { name: "Smoke ticket" }).locator("..").locator(".list-cell").nth(1);
    await expect(smokeTicketPriorityCell).toHaveText("High");
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
    const selectedListActionsMetrics = await page.locator(".list-actions").first().evaluate((element) => ({
      height: element.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
      flexWrap: getComputedStyle(element).flexWrap,
    }));
    expect(Math.abs(selectedListActionsMetrics.height - emptyListActionsHeight)).toBeLessThan(1);
    expect(selectedListActionsMetrics.flexWrap).toBe("nowrap");
    expect(selectedListActionsMetrics.scrollWidth - selectedListActionsMetrics.clientWidth).toBeLessThan(1);
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
    await expect(page.locator("#board-rename-inline-host")).toContainText("UI Smoke");
    await expect(page.locator("[data-board-rename-start] use[href='/icons.svg#pencil']")).toHaveCount(1);
    await expect(page.locator("#delete-board-button use[href='/icons.svg#trash-2']")).toHaveCount(1);
    await page.locator("#status-filter [data-status-filter='archived']").click();
    await expect(page.locator("#status-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(5);
    await expect(page.locator("#lane-board")).not.toContainText("No matching tickets");
    await expect(page.getByRole("button", { name: "Archived candidate" }).locator("..").locator(".ticket-status-icon-archived use[href='/icons.svg#archive']")).toHaveCount(1);
    await page.locator("#sidebar #view-mode-toggle [data-view-mode='list']").click();
    await expect(page.getByRole("button", { name: "Archived candidate" }).locator("..").locator(".list-status-cell .ticket-status-icon-archived use[href='/icons.svg#archive']")).toHaveCount(1);
    await page.getByRole("button", { name: "Archived candidate" }).locator("..").locator("[data-list-ticket-id]").check();
    await expect(page.locator("[data-bulk-archive='false'] use[href='/icons.svg#rotate-ccw']").first()).toHaveCount(1);
    await page.locator("#sidebar #view-mode-toggle [data-view-mode='kanban']").click();
    await page.locator("#status-filter [data-status-filter='archived']").click();
    await expect(page.locator("#status-filter")).toHaveClass(/is-filter-active/);
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
    await expect(page.locator("#ux-message")).toContainText("1 selected ticket");
    await expect(page.locator("#ux-message")).toContainText("Comments and relations on the selected tickets");
    await expect(page.locator("#ux-submit-button")).toHaveText("Delete");
    const bulkDeleteResponse = page.waitForResponse((response) => response.url().includes("/api/tickets/") && response.request().method() === "DELETE");
    await page.locator("#ux-submit-button").click();
    expect((await bulkDeleteResponse).status()).toBe(204);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.getByRole("button", { name: "Bulk delete candidate" })).toHaveCount(0);
    await page.getByRole("button", { name: "Smoke ticket" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toHaveText("Smoke ticket");
    await expect(page.locator("#editor-header-title")).toBeVisible();
    await expect(page.locator("#header-edit-button")).toBeVisible();
    await page.locator("#header-edit-button").focus();
    await expect(page.locator("#header-edit-button")).toHaveCSS("outline-style", "none");
    await expect(page.locator("#header-edit-button")).not.toHaveCSS("box-shadow", "none");
    await expect(page.locator("#comment-form")).toBeHidden();
    await expect(page.locator("#comment-compose-toggle")).toHaveAttribute("aria-expanded", "false");
    await page.locator("#comment-compose-toggle").click();
    await expect(page.locator("#comment-form")).toBeVisible();
    await expect(page.locator("#comment-compose-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#save-comment-button")).toHaveClass(/primary-action/);
    const commentFormBeforeList = await page.locator("#comment-form").evaluate((form) => {
      const list = document.querySelector("#ticket-comments");
      return Boolean(list && form.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(commentFormBeforeList).toBe(true);

    await page.locator("#comment-body").fill("E2E comment **saved**");
    await page.locator("#save-comment-button").click();
    await expect(page.locator("#ticket-comments .comment-item")).toContainText("E2E comment saved");
    await expect(page.locator("#comment-save-state")).toHaveText("Comment saved");
    await expect(page.locator("#comment-save-state")).toBeVisible();
    await expect(page.locator("#editor-save-state")).toBeHidden();
    await expect(page.locator("#comment-body")).toHaveValue("");

    await page.keyboard.press("Escape");
    if (await page.locator("#status-filter .filter-menu-options").isHidden()) {
      await page.locator("#status-filter .filter-menu-edge-toggle").click();
    }
    await expect(page.locator("#status-filter .filter-menu-options")).toBeVisible();
    const resolvedFilterButton = page.locator("#status-filter [data-status-filter='resolved']");
    if (!await resolvedFilterButton.evaluate((button) => button.classList.contains("active"))) {
      const resolvedFilterResponse = page.waitForResponse((response) => response.url().includes(`/api/boards/${boardPayload.board.id}/tickets`) && response.status() === 200);
      await resolvedFilterButton.click();
      await resolvedFilterResponse;
    }
    await expect(page.getByRole("button", { name: "Parent candidate" })).toBeVisible();
    await page.getByRole("button", { name: "Parent candidate" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#comment-save-state")).toBeHidden();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Smoke ticket" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);

    await expect(page.locator("[data-edit-comment-id]")).toBeHidden();
    await page.locator("[data-toggle-comment-actions]").click();
    await expect(page.locator("[data-toggle-comment-actions]")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-edit-comment-id]")).toBeVisible();
    await expect(page.locator("[data-delete-comment-id]")).toBeVisible();
    await expect(page.locator("[data-delete-comment-id]")).toHaveCSS("color", "rgb(196, 61, 61)");
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
    await expect(page.locator("#comment-save-state")).toHaveText("Saved");
    await expect(page.locator("#editor-save-state")).toBeHidden();

    await expect(page.locator("[data-delete-comment-id]")).toBeHidden();
    await page.locator("[data-toggle-comment-actions]").click();
    await expect(page.locator("[data-delete-comment-id]")).toBeVisible();
    await page.locator("[data-delete-comment-id]").click();
    await expect(page.locator("[data-comment-delete-confirm]")).toBeVisible();
    await expect(page.locator("[data-comment-delete-confirm]")).toContainText("Delete this comment?");
    await expect(page.locator("[data-comment-delete-confirm]")).toHaveCSS("color", "rgb(196, 61, 61)");
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await page.locator("[data-cancel-comment-delete]").click();
    await expect(page.locator("[data-comment-delete-confirm]")).toBeHidden();
    await page.locator("[data-toggle-comment-actions]").click();
    await page.locator("[data-delete-comment-id]").click();
    await expect(page.locator("[data-comment-delete-confirm]")).toBeVisible();
    const deleteCommentResponse = page.waitForResponse((response) => response.url().includes("/api/comments/") && response.request().method() === "DELETE");
    await page.locator("[data-confirm-comment-delete-id]").click();
    const deleteCommentResult = await deleteCommentResponse;
    expect(deleteCommentResult.status()).toBe(204);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#ticket-comments")).toContainText("No comments yet.");
    await expect(page.locator("#comment-save-state")).toHaveText("Deleted");
    await expect(page.locator("#editor-save-state")).toBeHidden();
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
    await expect(page.locator("#ticket-relation-add > span")).toHaveText("Relations");
    const relationsBeforeBlocker = await page.locator("#ticket-relation-add").evaluate((label) => {
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

    await expect(page.locator("#ticket-new-tag-button")).toHaveCount(0);
    await page.locator("#ticket-tag-search").fill("smoke-tag");
    await expect(page.locator("[data-create-tag-from-query='smoke-tag']")).toBeVisible();
    await page.locator("#ticket-tag-search").press("Enter");
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#ticket-tag-summary")).toContainText("smoke-tag");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveClass(/tag-no-color/);
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.locator("#ticket-tag-options [data-tag-id]")).toHaveCount(0);
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

    await page.locator("#ticket-tag-search").fill("smoke");
    await expect(page.locator("#ticket-tag-options")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ticket-tag-options")).toBeHidden();
    await expect(page.locator("#ticket-tag-summary")).toContainText("smoke-tag");

    await page.locator("#ticket-tag-search").fill("smoke");
    await expect(page.locator("#ticket-tag-options")).toBeVisible();
    await addRelation(page, "blocker");
    await page.locator("#ticket-blocker-toggle").click();
    await expect(page.locator("#ticket-tag-options")).toBeHidden();
    await page.locator("#ticket-tag-search").fill("");

    await addRelation(page, "parent");
    await page.locator("#ticket-parent-search").fill("Parent");
    await expect(page.locator("#ticket-parent-options .ticket-picker-meta").first()).toHaveText("Resolved");
    await page.locator("#ticket-parent-search").press("Enter");
    await expect(page.locator("#ticket-parent-summary")).toContainText("Parent candidate");
    await page.locator("[data-remove-parent-id]").click();
    await expect(page.locator("#ticket-parent-summary")).not.toContainText("Parent candidate");
    await expect(page.locator("#ticket-parent-search")).toHaveAttribute("placeholder", "Set parent by ID or title");

    await page.locator("#ticket-blocker-search").fill("Blocker");
    await page.locator("#ticket-blocker-search").press("Enter");
    await expect(page.locator("#ticket-blocker-summary")).toContainText("Blocker candidate");
    await page.keyboard.press("Escape");
    await expect(page.locator("#ticket-blocker-options")).toBeHidden();

    await addRelation(page, "child");
    await page.locator("#ticket-child-search").fill("Child");
    await page.locator("#ticket-child-search").press("Enter");
    await expect(page.locator("#ticket-child-summary")).toContainText("Child candidate");

    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#editor-save-state")).toHaveText("Saved");
    await expect(page.locator("#editor-save-state")).toBeVisible();
    const ticketSaveStateInHeaderActions = await page.locator("#editor-save-state").evaluate((state) => state.parentElement?.classList.contains("editor-header-actions"));
    expect(ticketSaveStateInHeaderActions).toBe(true);
    await expect(page.locator("#ticket-relations")).toContainText("Blocked By");
    await expect(page.locator("#ticket-relations")).toContainText("Blocker candidate");
    await expect(page.locator("#ticket-relations")).toContainText("Children");
    await expect(page.locator("#ticket-relations")).toContainText("Child candidate");
    await page.locator("#tag-filter").selectOption("smoke-tag");
    await expect(page.locator("#tag-filter")).toHaveClass(/is-filter-active/);
    await page.locator("#tag-filter").selectOption("");
    await expect(page.locator("#tag-filter")).not.toHaveClass(/is-filter-active/);

    await page.locator("#header-edit-button").click();
    await expect(page.locator("#editor-form")).toBeVisible();

    await page.locator("#delete-ticket-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-message")).toContainText("Smoke ticket");
    await expect(page.locator("#ux-message")).toContainText("Comments and relations on this ticket");
    await expect(page.locator("#ux-message")).toContainText("This action cannot be undone.");
    await expect(page.locator("#ux-submit-button")).toHaveText("Delete");
    await expect(page.locator("#ux-submit-button")).toHaveClass(/danger-confirm-action/);
    await expect(page.locator("#ux-submit-button use[href='/icons.svg#trash-2']")).toHaveCount(1);

    expect(consoleErrors).toEqual([]);
  } finally {
    await page.close();
    await app.close();
  }
});
