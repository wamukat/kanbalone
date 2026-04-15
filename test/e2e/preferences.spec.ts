import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

test("last board, view, and filters restore from localStorage", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const firstBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "LocalStorage A", laneNames: ["todo"] },
    });
    expect(firstBoardResponse.status()).toBe(201);
    const firstBoard = await firstBoardResponse.json();

    const secondBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "LocalStorage B", laneNames: ["todo", "review"] },
    });
    expect(secondBoardResponse.status()).toBe(201);
    const secondBoard = await secondBoardResponse.json();
    const [todoLane, reviewLane] = secondBoard.lanes;

    for (const ticket of [
      { laneId: todoLane.id, title: "Persisted todo", priority: 2 },
      { laneId: reviewLane.id, title: "Persisted review", priority: 2 },
    ]) {
      const response = await page.request.post(`${baseUrl}/api/boards/${secondBoard.board.id}/tickets`, { data: ticket });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${firstBoard.board.id}`);
    await page.locator("#board-list").getByRole("button", { name: "LocalStorage B" }).click();
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.locator("#search-input").fill("Persisted");
    await page.locator("#lane-filter").selectOption(String(reviewLane.id));
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator("#list-board")).toContainText("Persisted review");

    const savedPreferences = await page.evaluate(() => JSON.parse(localStorage.getItem("soloboard:ui-preferences") ?? "{}"));
    expect(savedPreferences).toMatchObject({
      version: 1,
      activeBoardId: secondBoard.board.id,
      boards: {
        [String(secondBoard.board.id)]: {
          viewMode: "list",
          filters: { q: "Persisted", lane: String(reviewLane.id) },
        },
      },
    });

    await page.goto("about:blank");
    await page.goto(baseUrl);

    await expect(page).toHaveURL(`${baseUrl}/boards/${secondBoard.board.id}/list`);
    await expect(page.locator("#board-title")).toHaveText("LocalStorage B");
    await expect(page.locator("#search-input")).toHaveValue("Persisted");
    await expect(page.locator("#lane-filter")).toBeVisible();
    await expect(page.locator("#lane-filter")).toHaveValue(String(reviewLane.id));
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator("#list-board")).toContainText("Persisted review");
  } finally {
    await page.close();
    await app.close();
  }
});

test("board view mode and filter menus restore per board", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const firstBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "View Mode A", laneNames: ["todo"] },
    });
    expect(firstBoardResponse.status()).toBe(201);
    const firstBoard = await firstBoardResponse.json();

    const secondBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "View Mode B", laneNames: ["todo"] },
    });
    expect(secondBoardResponse.status()).toBe(201);
    const secondBoard = await secondBoardResponse.json();

    await page.goto(`${baseUrl}/boards/${firstBoard.board.id}`);
    await expect(page.locator("#lane-board")).toBeVisible();
    await expect(page.locator("#list-board")).toBeHidden();
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await expect(page.locator("#priority-filter")).toHaveClass(/is-expanded/);
    await expect(page.locator("#status-filter")).not.toHaveClass(/is-expanded/);

    await page.locator("#board-list").getByRole("button", { name: "View Mode B" }).click();
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-expanded/);
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.locator("#status-filter .filter-menu-edge-toggle").click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${secondBoard.board.id}/list`);
    await expect(page.locator("#list-board")).toBeVisible();
    await expect(page.locator("#status-filter")).toHaveClass(/is-expanded/);
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-expanded/);

    await page.locator("#board-list").getByRole("button", { name: "View Mode A" }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${firstBoard.board.id}`);
    await expect(page.locator("#lane-board")).toBeVisible();
    await expect(page.locator("#list-board")).toBeHidden();
    await expect(page.locator("#priority-filter")).toHaveClass(/is-expanded/);
    await expect(page.locator("#status-filter")).not.toHaveClass(/is-expanded/);

    await page.locator("#board-list").getByRole("button", { name: "View Mode B" }).click();
    await expect(page).toHaveURL(`${baseUrl}/boards/${secondBoard.board.id}/list`);
    await expect(page.locator("#list-board")).toBeVisible();
    await expect(page.locator("#status-filter")).toHaveClass(/is-expanded/);
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-expanded/);

    await page.goto("about:blank");
    await page.goto(baseUrl);
    await expect(page).toHaveURL(`${baseUrl}/boards/${secondBoard.board.id}/list`);
    await expect(page.locator("#board-title")).toHaveText("View Mode B");
    await expect(page.locator("#status-filter")).toHaveClass(/is-expanded/);
    await expect(page.locator("#priority-filter")).not.toHaveClass(/is-expanded/);
  } finally {
    await page.close();
    await app.close();
  }
});
