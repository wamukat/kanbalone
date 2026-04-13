import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

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
    await expect(page.locator("#lane-filter")).toHaveClass(/is-filter-active/);

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

test("list virtual scrolling repaints visible rows", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Virtual List", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];

    for (let index = 1; index <= 80; index += 1) {
      const response = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
        data: {
          laneId: lane.id,
          title: `Virtual ticket ${String(index).padStart(2, "0")}`,
          priority: index,
        },
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await expect(page.locator(".list-window")).toContainText("Virtual ticket 01");
    await expect(page.locator(".list-window")).not.toContainText("Virtual ticket 80");

    await page.locator(".list-viewport").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect(page.locator(".list-window")).toContainText("Virtual ticket 80");
  } finally {
    await page.close();
    await app.close();
  }
});
