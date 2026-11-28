import { expect, test } from "@playwright/test";

import { closeTestApp, createBoard, createCompletionLane, createTag, createTicket, buildApp, createDbFile, getFreePort, path, selectBoardFilter, startTestApp } from "./helpers.js";

test("ticket filters combine results and active styling", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Filter Board", laneNames: ["todo", "review"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const [todoLane, reviewLane] = boardPayload.lanes;
    const tagResponse = await page.request.post(
      `${baseUrl}/api/boards/${boardPayload.board.id}/tags`,
      {
        data: { name: "focus", color: "#1f6f5f" },
      },
    );
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();

    const completedLane = await createCompletionLane(page.request, baseUrl, boardPayload.board.id);
    const ticketData = [
      {
        laneId: todoLane.id,
        title: "Focus open",
        priority: 3,
        tagIds: [tag.id],
      },
      {
        laneId: completedLane.id,
        title: "Focus resolved",
        priority: 3,
        tagIds: [tag.id],
      },
      { laneId: reviewLane.id, title: "Plain open", priority: 4 },
      {
        laneId: todoLane.id,
        title: "Archived focus",
        priority: 3,
        isArchived: true,
        tagIds: [tag.id],
      },
    ];
    for (const ticket of ticketData) {
      const response = await page.request.post(
        `${baseUrl}/api/boards/${boardPayload.board.id}/tickets`,
        {
          data: ticket,
        },
      );
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    const waitForTicketQuery = (expected: Record<string, string | null>) =>
      page.waitForResponse((response) => {
        if (
          !response
            .url()
            .includes(`/api/boards/${boardPayload.board.id}/tickets`) ||
          response.status() !== 200
        ) {
          return false;
        }
        const url = new URL(response.url());
        return !url.searchParams.has("resolved") && Object.entries(expected).every(
          ([key, value]) => url.searchParams.get(key) === value,
        );
      });

    const searchResponse = waitForTicketQuery({
      q: "priority:3",
    });
    await page.locator("#search-input").fill("priority:3");
    await searchResponse;
    await expect(page.locator(".toolbar-search")).toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(0);
    await page.locator("#lane-board").click();
    await expect(page.locator("#search-clear-button")).toBeVisible();
    const clearSearchResponse = waitForTicketQuery({ q: null });
    await page.locator("#search-clear-button").click();
    await clearSearchResponse;
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(page.locator("#search-clear-button")).toBeHidden();

    const priorityLabelResponse = waitForTicketQuery({ priority: "3" });
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await page
      .locator("#priority-filter [data-priority-filter='high']")
      .click();
    await priorityLabelResponse;
    await expect(page.locator("#priority-filter")).toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText(["Focus open", "Focus resolved"]);

    const priorityUrgentResponse = waitForTicketQuery({ priority: "3,4" });
    await page
      .locator("#priority-filter [data-priority-filter='urgent']")
      .click();
    await priorityUrgentResponse;
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator("#lane-board")).toContainText("Focus open");
    await expect(page.locator("#lane-board")).toContainText("Plain open");

    const priorityHighOnlyResponse = waitForTicketQuery({ priority: "3" });
    await page
      .locator("#priority-filter [data-priority-filter='urgent']")
      .click();
    await priorityHighOnlyResponse;

    const priorityClearResponse = waitForTicketQuery({ priority: null });
    await page.locator("#priority-filter [data-priority-clear]").click();
    await priorityClearResponse;
    await expect(page.locator("#priority-filter")).not.toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator("#priority-filter")).not.toHaveClass(
      /is-expanded/,
    );
    await expect(
      page.locator("#priority-filter [data-priority-filter='high']"),
    ).toBeHidden();
    await expect(page.locator(".ticket-card")).toHaveCount(3);

    const priorityHighResponse = waitForTicketQuery({ priority: "3" });
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await page
      .locator("#priority-filter [data-priority-filter='high']")
      .click();
    await priorityHighResponse;
    await expect(page.locator("#priority-filter")).toHaveClass(
      /is-filter-active/,
    );

    const tagResponseForFilter = waitForTicketQuery({ tag_ids: String(tag.id) });
    await selectBoardFilter(page, "tag", "focus");
    await tagResponseForFilter;
    await expect(page.locator("#tag-filter-button")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText([
      "Focus open",
      "Focus resolved",
    ]);

    const archivedResponse = waitForTicketQuery({
      tag_ids: String(tag.id),
      archived: "all",
    });
    await page
      .locator("#include-archived-filter")
      .click();
    await archivedResponse;
    await expect(page.locator("#include-archived-filter")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator("#lane-board")).toContainText("Focus open");
    await expect(page.locator("#lane-board")).toContainText("Focus resolved");
    await expect(page.locator("#lane-board")).toContainText("Archived focus");

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(
      `${baseUrl}/boards/${boardPayload.board.id}/list`,
    );
    await expect(page.locator("#lane-filter")).toBeVisible();
    const laneResponse = waitForTicketQuery({
      tag_ids: String(tag.id),
      archived: "all",
      lane_ids: String(todoLane.id),
    });
    await selectBoardFilter(page, "lane", todoLane.name);
    await laneResponse;
    await expect(page.locator("#lane-filter-button")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".list-row")).toHaveCount(2);
    await expect(page.locator("#list-board")).toContainText("Focus open");
    await expect(page.locator("#list-board")).toContainText("Archived focus");

    const listSearchResponse = waitForTicketQuery({
      q: "Focus",
      tag_ids: String(tag.id),
      archived: "all",
      lane_ids: String(todoLane.id),
    });
    await page.locator("#search-input").fill("Focus");
    await listSearchResponse;
    const activeFilterStyles = await page.evaluate(() =>
      [
        ".toolbar-search",
        "#priority-filter",
        "#tag-filter-button",
        "#lane-filter-button",
      ].map((selector) => {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Missing active filter control: ${selector}`);
        }
        const styles = getComputedStyle(element);
        return {
          selector,
          borderColor: styles.borderColor,
          backgroundColor: styles.backgroundColor,
          boxShadow: styles.boxShadow,
        };
      }),
    );
    for (const styles of activeFilterStyles) {
      expect(styles.backgroundColor, styles.selector).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      expect(styles.borderColor, styles.selector).not.toBe("rgba(0, 0, 0, 0)");
      expect(styles.boxShadow, styles.selector).not.toBe("none");
    }

    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator("#lane-filter-button")).not.toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(3);
  } finally {
    await page.close();
    await closeTestApp(app);
  }
});

test("ticket filters are preserved per board during the session", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const firstBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Saved Filter A", laneNames: ["todo", "review"] },
    });
    expect(firstBoardResponse.status()).toBe(201);
    const firstBoard = await firstBoardResponse.json();
    const [firstLane, firstReviewLane] = firstBoard.lanes;
    const firstTagResponse = await page.request.post(`${baseUrl}/api/boards/${firstBoard.board.id}/tags`, {
      data: { name: "focus", color: "#1f6f5f" },
    });
    expect(firstTagResponse.status()).toBe(201);
    const firstTag = await firstTagResponse.json();

    const secondBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Saved Filter B", laneNames: ["todo"] },
    });
    expect(secondBoardResponse.status()).toBe(201);
    const secondBoard = await secondBoardResponse.json();
    const secondLane = secondBoard.lanes[0];

    for (const ticket of [
      { laneId: firstLane.id, title: "Alpha focus todo", priority: 3, tagIds: [firstTag.id] },
      { laneId: firstReviewLane.id, title: "Alpha focus review", priority: 3, tagIds: [firstTag.id] },
      { laneId: firstLane.id, title: "Beta low", priority: 1 },
    ]) {
      const response = await page.request.post(`${baseUrl}/api/boards/${firstBoard.board.id}/tickets`, { data: ticket });
      expect(response.status()).toBe(201);
    }
    const secondTicketResponse = await page.request.post(`${baseUrl}/api/boards/${secondBoard.board.id}/tickets`, {
      data: { laneId: secondLane.id, title: "Second board ticket", priority: 1 },
    });
    expect(secondTicketResponse.status()).toBe(201);

    await page.goto(`${baseUrl}/boards/${firstBoard.board.id}`);
    await expect(page.locator(".ticket-card")).toHaveCount(3);

    await page.locator("#search-input").fill("Alpha");
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await page.locator("#priority-filter [data-priority-filter='high']").click();
    await selectBoardFilter(page, "tag", "focus");
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator("#lane-board")).toContainText("Alpha focus todo");
    await expect(page.locator("#lane-board")).toContainText("Alpha focus review");
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#priority-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter-button")).toHaveClass(/is-filter-active/);

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator("#lane-filter")).toBeVisible();
    await selectBoardFilter(page, "lane", firstLane.name);
    await expect(page.locator("#lane-filter-button")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator("#list-board")).toContainText("Alpha focus todo");

    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator("#lane-board")).toContainText("Alpha focus todo");
    await expect(page.locator("#lane-board")).toContainText("Alpha focus review");

    await page.locator("#board-list").getByRole("button", { name: "Saved Filter B" }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${secondBoard.board.id}`);
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter-button")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-card")).toContainText("Second board ticket");
    await page.locator("#search-input").fill("Second");
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await page.getByRole("button", { name: "List", exact: true }).click();
    await selectBoardFilter(page, "lane", secondLane.name);
    await expect(page.locator("#lane-filter-button")).toHaveClass(/is-filter-active/);
    await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();
    await page.getByRole("button", { name: "Kanban", exact: true }).click();

    await page.locator("#board-list").getByRole("button", { name: "Saved Filter A" }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${firstBoard.board.id}`);
    await expect(page.locator("#search-input")).toHaveValue("Alpha");
    await expect(page.locator("#priority-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter-button")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter .board-filter-names")).toHaveText("focus");
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator("#lane-filter .board-filter-names")).toHaveText(firstLane.name);
    await expect(page.locator(".ticket-card")).toHaveCount(2);

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator("#lane-filter")).toBeVisible();
    await expect(page.locator("#lane-filter .board-filter-names")).toHaveText(firstLane.name);
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator("#list-board")).toContainText("Alpha focus todo");
    await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();

    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByRole("button", { name: "Reset filters" })).toBeHidden();
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter-button")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter .board-filter-names")).toHaveText("All");
    await expect(page.locator("#lane-filter .board-filter-names")).toHaveText("All");
    await expect(page.locator("#lane-filter-button")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".list-row")).toHaveCount(3);

    await page.locator("#board-list").getByRole("button", { name: "Saved Filter B" }).click();
    await expect(page.locator("#search-input")).toHaveValue("Second");
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page).toHaveURL(`${baseUrl}/boards/${secondBoard.board.id}`);
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator("#lane-filter .board-filter-names")).toHaveText(secondLane.name);
    await expect(page.locator("#lane-filter-button")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator("#lane-board")).toContainText("Second board ticket");
  } finally {
    await page.close();
    await closeTestApp(app);
  }
});

test("sidebar tags share toolbar filters while the tag editor preserves its draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Shared tag filters", laneNames: ["Todo", "Review"] });
    const firstTag = await createTag(page.request, baseUrl, board.id, { name: "Alpha", color: "#BEEADE" });
    const secondTag = await createTag(page.request, baseUrl, board.id, { name: "Beta", color: "" });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Alpha ticket", tagIds: [firstTag.id] });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Beta ticket", tagIds: [secondTag.id] });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[1].id, title: "Review ticket", tagIds: [firstTag.id] });

    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    const firstBadge = page.locator(`button[data-sidebar-tag-id="${firstTag.id}"]`);
    const secondBadge = page.locator(`button[data-sidebar-tag-id="${secondTag.id}"]`);
    const rows = page.locator(".list-row");
    await expect(rows).toHaveCount(3);
    await selectBoardFilter(page, "lane", "Todo");
    await firstBadge.click();
    await expect(firstBadge).toHaveAttribute("aria-pressed", "true");
    await expect(firstBadge).toBeFocused();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Alpha ticket");

    const picker = page.locator("#tag-filter-options");
    const trigger = page.locator("#tag-filter-button");
    await trigger.click();
    await expect(picker.getByRole("checkbox", { name: "Alpha" })).toBeChecked();
    await expect(picker.locator(".tag", { hasText: "Alpha" })).toHaveCSS("background-color", "rgb(190, 234, 222)");
    await expect(picker.locator(".tag-no-color", { hasText: "Beta" })).toBeVisible();
    await picker.getByRole("checkbox", { name: "Beta" }).check();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    await expect(picker).toBeHidden();
    await expect(secondBadge).toHaveAttribute("aria-pressed", "true");
    await expect(rows).toHaveCount(2);

    const search = page.locator("#search-input");
    await search.fill("missing phrase");
    await expect(rows).toHaveCount(0);
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    await expect(rows).toHaveCount(2);

    const manage = page.getByRole("button", { name: "Manage tags" });
    await manage.click();
    await expect(manage).toHaveAttribute("aria-pressed", "true");
    await firstBadge.click();
    const name = page.locator("[data-sidebar-tag-edit-form] [data-sidebar-tag-name]");
    await expect(name).toBeFocused();
    await name.fill("Unsaved rename");
    await name.evaluate((input: HTMLInputElement) => input.setSelectionRange(3, 9));
    await createTag(page.request, baseUrl, board.id, { name: "0 incoming" });
    await expect(page.locator("#sidebar-tag-list")).toContainText("0 incoming");
    await expect(name).toHaveValue("Unsaved rename");
    await expect(name).toBeFocused();
    expect(await name.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([3, 9]);
    await name.press("Escape");
    await expect(firstBadge).toBeFocused();
    await expect(manage).toHaveAttribute("aria-pressed", "true");
    await firstBadge.press("Escape");
    await expect(manage).toBeFocused();
    await expect(manage).toHaveAttribute("aria-pressed", "false");
    await expect(firstBadge).toHaveText("Alpha");
    await expect(firstBadge).toHaveAttribute("aria-pressed", "true");
    await expect(secondBadge).toHaveAttribute("aria-pressed", "true");

    await page.locator('[data-view-mode="group"]').click();
    await expect(manage).toBeHidden();
    await expect(firstBadge).toHaveAccessibleName("Edit tag: Alpha");
    await page.locator('[data-view-mode="list"]').click();
    await expect(firstBadge).toHaveAttribute("aria-pressed", "true");
    await expect(rows).toHaveCount(2);
    await page.locator("#reset-filters-button").click();
    await expect(rows).toHaveCount(3);
    await expect(firstBadge).toHaveAttribute("aria-pressed", "false");
    await expect(secondBadge).toHaveAttribute("aria-pressed", "false");
  } finally {
    await close();
  }
});
