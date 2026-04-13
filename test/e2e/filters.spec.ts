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
    const tagResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`, {
      data: { name: "focus", color: "#1f6f5f" },
    });
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();

    const ticketData = [
      { laneId: todoLane.id, title: "Focus open", priority: 3, tagIds: [tag.id] },
      { laneId: reviewLane.id, title: "Focus resolved", priority: 3, isResolved: true, tagIds: [tag.id] },
      { laneId: reviewLane.id, title: "Plain open", priority: 5 },
      { laneId: todoLane.id, title: "Archived focus", priority: 3, isArchived: true, tagIds: [tag.id] },
    ];
    for (const ticket of ticketData) {
      const response = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
        data: ticket,
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".ticket-card")).toHaveCount(2);

    const waitForTicketQuery = (expected: Record<string, string>) =>
      page.waitForResponse((response) => {
        if (!response.url().includes(`/api/boards/${boardPayload.board.id}/tickets`) || response.status() !== 200) {
          return false;
        }
        const url = new URL(response.url());
        return Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value);
      });

    const searchResponse = waitForTicketQuery({ q: "priority:3", resolved: "false" });
    await page.locator("#search-input").fill("priority:3");
    await searchResponse;
    await expect(page.locator(".toolbar-search")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-card")).toContainText("Focus open");

    const resolvedResponse = waitForTicketQuery({ q: "priority:3" });
    await page.locator("#resolved-filter [data-value='']").click();
    await resolvedResponse;
    await expect(page.locator("#resolved-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText(["Focus open", "Focus resolved"]);

    const tagResponseForFilter = waitForTicketQuery({ q: "priority:3", tag: "focus" });
    await page.locator("#tag-filter").selectOption("focus");
    await tagResponseForFilter;
    await expect(page.locator("#tag-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText(["Focus open", "Focus resolved"]);

    const archivedResponse = waitForTicketQuery({ q: "priority:3", tag: "focus", archived: "all" });
    await page.locator("#archived-filter-button").click();
    await archivedResponse;
    await expect(page.locator("#archived-filter-button")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator("#lane-board")).toContainText("Focus open");
    await expect(page.locator("#lane-board")).toContainText("Focus resolved");
    await expect(page.locator("#lane-board")).toContainText("Archived focus");

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await expect(page.locator("#lane-filter")).toBeVisible();
    const laneResponse = waitForTicketQuery({ q: "priority:3", tag: "focus", archived: "all", lane_id: String(todoLane.id) });
    await page.locator("#lane-filter").selectOption(String(todoLane.id));
    await laneResponse;
    await expect(page.locator("#lane-filter")).toHaveClass(/is-filter-active/);
    await expect(page.locator(".list-row")).toHaveCount(2);
    await expect(page.locator("#list-board")).toContainText("Focus open");
    await expect(page.locator("#list-board")).toContainText("Archived focus");

    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator("#lane-filter")).toHaveValue("");
    await expect(page.locator("#lane-filter")).not.toHaveClass(/is-filter-active/);
    await expect(page.locator(".ticket-card")).toHaveCount(3);
  } finally {
    await page.close();
    await app.close();
  }
});
