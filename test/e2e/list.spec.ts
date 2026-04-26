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
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText(["Todo ticket", "Review ticket"]);

    await page.getByRole("button", { name: "List" }).click();
    await expect(page.locator("#lane-filter")).toBeVisible();
    await expect(page.locator("#lane-filter")).toHaveValue(String(reviewLane.id));
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator(".list-row")).toContainText("Review ticket");
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
          priority: ((index - 1) % 4) + 1,
        },
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await expect(page.locator(".list-window")).toContainText("Virtual ticket 80");
    await expect(page.locator(".list-window")).not.toContainText("Virtual ticket 01");

    await page.locator(".list-viewport").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect(page.locator(".list-window")).toContainText("Virtual ticket 01");
  } finally {
    await page.close();
    await app.close();
  }
});

test("list ticket titles use subdued app link styling", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "List Typography", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];

    const ticketResponse = await page.request.post(
      `${baseUrl}/api/boards/${boardPayload.board.id}/tickets`,
      {
        data: {
          laneId: lane.id,
          title: "Subdued list title",
          priority: 2,
        },
      },
    );
    expect(ticketResponse.status()).toBe(201);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    const titleLink = page.getByRole("button", {
      name: /Subdued list title/,
    });
    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveCSS("font-weight", "600");
    await expect(titleLink).toHaveCSS("text-decoration-line", "none");

    await titleLink.hover();
    await expect(titleLink).toHaveCSS("text-decoration-line", "none");
  } finally {
    await page.close();
    await app.close();
  }
});

test("list bulk move moves selected tickets to another board", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const sourceBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Bulk Move Source", laneNames: ["todo", "review"] },
    });
    expect(sourceBoardResponse.status()).toBe(201);
    const sourceBoardPayload = await sourceBoardResponse.json();
    const [todoLane] = sourceBoardPayload.lanes;

    const targetBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Bulk Move Target", laneNames: ["todo", "done"] },
    });
    expect(targetBoardResponse.status()).toBe(201);
    const targetBoardPayload = await targetBoardResponse.json();
    const [targetTodoLane] = targetBoardPayload.lanes;

    for (const title of ["Move first", "Move second"]) {
      const response = await page.request.post(`${baseUrl}/api/boards/${sourceBoardPayload.board.id}/tickets`, {
        data: { laneId: todoLane.id, title },
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${sourceBoardPayload.board.id}/list`);
    await page.getByRole("button", { name: "Move first" }).locator("..").locator("[data-list-ticket-id]").check();
    await page.getByRole("button", { name: "Move second" }).locator("..").locator("[data-list-ticket-id]").check();

    await page.locator("[data-bulk-move-board='true']").first().click();
    await expect(page.locator("#ux-dialog")).toBeVisible();
    await page.locator("[data-bulk-move-board-select]").selectOption(String(targetBoardPayload.board.id));
    await page.locator("[data-bulk-move-lane-select]").selectOption(String(targetTodoLane.id));
    await page.locator("#ux-submit-button").click();

    await expect(page.locator("#list-board")).not.toContainText("Move first");
    await expect(page.locator("#list-board")).not.toContainText("Move second");

    await page.goto(`${baseUrl}/boards/${targetBoardPayload.board.id}/list`);
    await expect(page.getByRole("button", { name: "Move first" }).locator("..")).toContainText("todo");
    await expect(page.getByRole("button", { name: "Move second" }).locator("..")).toContainText("todo");
  } finally {
    await page.close();
    await app.close();
  }
});
