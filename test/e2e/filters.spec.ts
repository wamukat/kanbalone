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
    await page.locator("#search-input").fill("");

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
    await expect(page.locator("#lane-filter")).toHaveValue("");
    await expect(page.locator("#lane-filter")).not.toHaveClass(
      /is-filter-active/,
    );
    await expect(page.locator(".ticket-card")).toHaveCount(3);
  } finally {
    await page.close();
    await app.close();
  }
});
