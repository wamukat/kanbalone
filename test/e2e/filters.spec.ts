import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

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

    const ticketData = [
      {
        laneId: todoLane.id,
        title: "Focus open",
        priority: 3,
        tagIds: [tag.id],
      },
      {
        laneId: reviewLane.id,
        title: "Focus resolved",
        priority: 3,
        isResolved: true,
        tagIds: [tag.id],
      },
      { laneId: reviewLane.id, title: "Plain open", priority: 5 },
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
    await expect(page.locator(".ticket-card")).toHaveCount(2);

    const waitForTicketQuery = (expected: Record<string, string>) =>
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
        return Object.entries(expected).every(
          ([key, value]) => url.searchParams.get(key) === value,
        );
      });

    const searchResponse = waitForTicketQuery({
      q: "priority:3",
      resolved: "false",
    });
    await page.locator("#search-input").fill("priority:3");
    await searchResponse;
    await expect(page.locator(".toolbar-search")).toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(0);
    await page.locator("#lane-board").click();
    await expect(page.locator("#search-clear-button")).toBeVisible();
    const clearSearchResponse = waitForTicketQuery({ resolved: "false" });
    await page.locator("#search-clear-button").click();
    await clearSearchResponse;
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(page.locator("#search-clear-button")).toBeHidden();

    const priorityLabelResponse = waitForTicketQuery({ resolved: "false" });
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await page
      .locator("#priority-filter [data-priority-filter='high']")
      .click();
    await priorityLabelResponse;
    await expect(page.locator("#priority-filter")).toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-card")).toContainText("Focus open");

    const priorityUrgentResponse = waitForTicketQuery({ resolved: "false" });
    await page
      .locator("#priority-filter [data-priority-filter='urgent']")
      .click();
    await priorityUrgentResponse;
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator("#lane-board")).toContainText("Focus open");
    await expect(page.locator("#lane-board")).toContainText("Plain open");

    const priorityHighOnlyResponse = waitForTicketQuery({ resolved: "false" });
    await page
      .locator("#priority-filter [data-priority-filter='urgent']")
      .click();
    await priorityHighOnlyResponse;

    const priorityClearResponse = waitForTicketQuery({ resolved: "false" });
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
    await expect(page.locator(".ticket-card")).toHaveCount(2);

    const priorityHighResponse = waitForTicketQuery({ resolved: "false" });
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await page
      .locator("#priority-filter [data-priority-filter='high']")
      .click();
    await priorityHighResponse;
    await expect(page.locator("#priority-filter")).toHaveClass(
      /is-filter-active/,
    );

    const resolvedResponse = waitForTicketQuery({});
    await page.locator("#status-filter .filter-menu-edge-toggle").click();
    await page
      .locator("#status-filter [data-status-filter='resolved']")
      .click();
    await resolvedResponse;
    await expect(page.locator("#status-filter")).toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText([
      "Focus open",
      "Focus resolved",
    ]);

    const tagResponseForFilter = waitForTicketQuery({ tag: "focus" });
    await page.locator("#tag-filter").selectOption("focus");
    await tagResponseForFilter;
    await expect(page.locator("#tag-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText([
      "Focus open",
      "Focus resolved",
    ]);

    const archivedResponse = waitForTicketQuery({
      tag: "focus",
      archived: "all",
    });
    await page
      .locator("#status-filter [data-status-filter='archived']")
      .click();
    await archivedResponse;
    await expect(page.locator("#status-filter")).toHaveClass(
      /is-filter-active/,
    );
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
      tag: "focus",
      archived: "all",
      lane_id: String(todoLane.id),
    });
    await page.locator("#lane-filter").selectOption(String(todoLane.id));
    await laneResponse;
    await expect(page.locator("#lane-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".list-row")).toHaveCount(2);
    await expect(page.locator("#list-board")).toContainText("Focus open");
    await expect(page.locator("#list-board")).toContainText("Archived focus");

    const listSearchResponse = waitForTicketQuery({
      q: "Focus",
      tag: "focus",
      archived: "all",
      lane_id: String(todoLane.id),
    });
    await page.locator("#search-input").fill("Focus");
    await listSearchResponse;
    const activeFilterStyles = await page.evaluate(() =>
      [
        ".toolbar-search",
        "#priority-filter",
        "#status-filter",
        "#tag-filter",
        "#lane-filter",
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
    await expect(page.locator("#lane-filter")).not.toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(3);
  } finally {
    await page.close();
    await app.close();
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
    await page.locator("#tag-filter").selectOption("focus");
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator("#lane-board")).toContainText("Alpha focus todo");
    await expect(page.locator("#lane-board")).toContainText("Alpha focus review");
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#priority-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter")).toHaveClass(/is-filter-active/);

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator("#lane-filter")).toBeVisible();
    await page.locator("#lane-filter").selectOption(String(firstLane.id));
    await expect(page.locator("#lane-filter")).toHaveClass(/is-filter-active/);
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
    await expect(page.locator("#tag-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-card")).toContainText("Second board ticket");
    await page.locator("#search-input").fill("Second");
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.locator("#lane-filter").selectOption(String(secondLane.id));
    await expect(page.locator("#lane-filter")).toHaveClass(/is-filter-active/);
    await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();
    await page.getByRole("button", { name: "Kanban", exact: true }).click();

    await page.locator("#board-list").getByRole("button", { name: "Saved Filter A" }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${firstBoard.board.id}`);
    await expect(page.locator("#search-input")).toHaveValue("Alpha");
    await expect(page.locator("#priority-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter")).toHaveValue("focus");
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator("#lane-filter")).toHaveValue(String(firstLane.id));
    await expect(page.locator(".ticket-card")).toHaveCount(2);

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator("#lane-filter")).toBeVisible();
    await expect(page.locator("#lane-filter")).toHaveValue(String(firstLane.id));
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator("#list-board")).toContainText("Alpha focus todo");
    await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();

    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByRole("button", { name: "Reset filters" })).toBeHidden();
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator("#tag-filter")).toHaveValue("");
    await expect(page.locator("#lane-filter")).toHaveValue("");
    await expect(page.locator("#lane-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".list-row")).toHaveCount(3);

    await page.locator("#board-list").getByRole("button", { name: "Saved Filter B" }).click();
    await expect(page.locator("#search-input")).toHaveValue("Second");
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page).toHaveURL(`${baseUrl}/boards/${secondBoard.board.id}`);
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator("#lane-filter")).toHaveValue(String(secondLane.id));
    await expect(page.locator("#lane-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator("#lane-board")).toContainText("Second board ticket");
  } finally {
    await page.close();
    await app.close();
  }
});
