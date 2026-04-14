import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

test("empty board onboarding focuses inline board creation", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await page.goto(baseUrl);
    await expect(page.locator(".shell")).toHaveClass(/no-boards/);
    await expect(page.locator(".toolbar")).toBeHidden();
    await expect(page.locator("#sidebar-view-section")).toBeHidden();
    await expect(page.locator("#sidebar-toggle-button")).toBeHidden();
    await expect(page.locator("#new-board-button")).toHaveClass(/is-empty-target/);
    const emptyAddButtonBox = await page
      .locator("#new-board-button")
      .boundingBox();
    expect(emptyAddButtonBox?.width).toBeGreaterThanOrEqual(31);
    expect(emptyAddButtonBox?.width).toBeLessThanOrEqual(33);
    expect(emptyAddButtonBox?.height).toBeGreaterThanOrEqual(31);
    expect(emptyAddButtonBox?.height).toBeLessThanOrEqual(33);
    await expect(page.locator("#lane-board")).toContainText("No boards yet");

    await page.locator("#new-board-button").click();
    await expect(page.locator("[data-board-create-input]")).toBeFocused();
    await page.locator("#lane-board").click();
    await expect(page.locator("[data-board-create-input]")).toHaveCount(0);

    await page.locator("#new-board-button").click();
    await page.locator("[data-board-create-input]").fill("First Board");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/boards") &&
        response.request().method() === "POST",
    );
    await page.locator("[data-board-create-input]").press("Enter");
    expect((await createResponse).status()).toBe(201);
    await expect(page.locator(".shell")).not.toHaveClass(/no-boards/);
    await expect(page.locator(".toolbar")).toBeVisible();
    await expect(page.locator("#board-title")).toHaveText("First Board");
    const addButtonBox = await page.locator("#new-board-button").boundingBox();
    expect(addButtonBox?.width).toBeGreaterThanOrEqual(31);
    expect(addButtonBox?.width).toBeLessThanOrEqual(33);
  } finally {
    await page.close();
    await app.close();
  }
});

test("sidebar board settings actions are wired", async ({ page }) => {
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
    const primaryResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Operations Primary", laneNames: ["todo"] },
    });
    expect(primaryResponse.status()).toBe(201);
    const primaryPayload = await primaryResponse.json();
    const fallbackResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Operations Fallback", laneNames: ["todo"] },
    });
    expect(fallbackResponse.status()).toBe(201);

    await page.goto(`${baseUrl}/boards/${primaryPayload.board.id}`);
    await expect(page.locator("#board-title")).toHaveText("Operations Primary");
    await page.locator("#board-settings-toggle-button").click();
    await expect(page.locator("#sidebar-board-actions-panel")).toHaveAttribute("aria-hidden", "false");

    await page.locator("#rename-board-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-title")).toHaveText("Rename Board");
    await page.locator('[data-field-id="name"]').fill("Operations Renamed");
    const renameResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/boards/${primaryPayload.board.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#ux-submit-button").click();
    expect((await renameResponse).status()).toBe(200);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#board-title")).toHaveText("Operations Renamed");
    await expect(page.getByRole("button", { name: "Operations Renamed" })).toBeVisible();

    const exportResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/boards/${primaryPayload.board.id}/export`) &&
        response.request().method() === "GET",
    );
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-board-button").click();
    expect((await exportResponse).status()).toBe(200);
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("operations-renamed.json");
    const exportedPayloadResponse = await page.request.get(`${baseUrl}/api/boards/${primaryPayload.board.id}/export`);
    expect(exportedPayloadResponse.status()).toBe(200);
    const exportedPayload = await exportedPayloadResponse.json();

    await page.locator("#delete-board-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-title")).toHaveText("Delete Board");
    await expect(page.locator("#ux-submit-button")).toHaveText("Delete");
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/boards/${primaryPayload.board.id}`) &&
        response.request().method() === "DELETE",
    );
    await page.locator("#ux-submit-button").click();
    expect((await deleteResponse).status()).toBe(204);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#board-title")).toHaveText("Operations Fallback");
    await expect(page.getByRole("button", { name: "Operations Renamed" })).toHaveCount(0);

    const importResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/boards/import") &&
        response.request().method() === "POST",
    );
    await page.locator("#import-board-input").setInputFiles({
      name: "operations-renamed.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exportedPayload)),
    });
    expect((await importResponse).status()).toBe(201);
    await expect(page.locator("#board-title")).toHaveText("Operations Renamed");
    await expect(page.getByRole("button", { name: "Operations Renamed" })).toBeVisible();

    expect(consoleErrors).toEqual([]);
  } finally {
    await page.close();
    await app.close();
  }
});

test("board settings dialogs close with Escape and backdrop click", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Dialog Close Board", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.locator("#board-settings-toggle-button").click();
    await page.locator("#rename-board-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#board-title")).toHaveText("Dialog Close Board");

    await page.locator("#rename-board-button").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await page.mouse.click(8, 8);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator("#board-title")).toHaveText("Dialog Close Board");
  } finally {
    await page.close();
    await app.close();
  }
});

test("sidebar board list create and reorder are wired", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const alphaResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Alpha Board", laneNames: ["todo"] },
    });
    expect(alphaResponse.status()).toBe(201);
    const alphaPayload = await alphaResponse.json();
    const betaResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Beta Board", laneNames: ["todo"] },
    });
    expect(betaResponse.status()).toBe(201);

    await page.goto(`${baseUrl}/boards/${alphaPayload.board.id}`);
    await expect(page.locator("#board-title")).toHaveText("Alpha Board");
    await page.locator("#new-board-button").click();
    await expect(page.locator("[data-board-create-input]")).toBeFocused();
    await expect(page.locator("#new-board-button")).toBeHidden();
    await page.locator("[data-board-create-input]").fill("Canceled Board");
    await page.locator("[data-board-create-input]").press("Escape");
    await expect(page.getByRole("button", { name: "Canceled Board" })).toHaveCount(0);
    await expect(page.locator("#new-board-button")).toBeVisible();

    await page.locator("#new-board-button").click();
    await page.locator("[data-board-create-input]").fill("Gamma Board");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/boards") &&
        response.request().method() === "POST",
    );
    await page.locator("[data-board-create-input]").press("Enter");
    expect((await createResponse).status()).toBe(201);
    await expect(page.locator("#board-title")).toHaveText("Gamma Board");
    await page.getByRole("button", { name: "Alpha Board" }).click();
    await expect(page.locator("#board-title")).toHaveText("Alpha Board");
    await expect(page.locator("#board-list .board-button").first()).toHaveText("Alpha Board");

    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith("/api/boards/reorder") && response.status() === 200),
      page.getByRole("button", { name: "Gamma Board" }).dragTo(page.getByRole("button", { name: "Alpha Board" }), {
        targetPosition: { x: 8, y: 4 },
      }),
    ]);
    await expect(page.locator("#board-list .board-button").first()).toHaveText("Gamma Board");
    await page.reload();
    await expect(page.locator("#board-list .board-button").first()).toHaveText("Gamma Board");
  } finally {
    await page.close();
    await app.close();
  }
});
