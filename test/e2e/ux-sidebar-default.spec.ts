import { test, expect } from "@playwright/test";
import { startTestApp, createBoard, createTicket } from "./helpers.js";

test("narrow screens start compact and explicit sidebar choices survive reload and resize", async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 844 });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Compact workflow", laneNames: ["todo"] });
    await page.goto(`${baseUrl}/boards/${board.board.id}`);
    await expect(page.locator(".shell")).toHaveClass(/sidebar-collapsed/);
    await expect(page.getByRole("button", { name: "Open sidebar", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open sidebar", exact: true }).click();
    await expect(page.locator(".shell")).not.toHaveClass(/sidebar-collapsed/);
    await page.reload();
    await expect(page.locator(".shell")).not.toHaveClass(/sidebar-collapsed/);
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.reload();
    await expect(page.locator(".shell")).toHaveClass(/sidebar-collapsed/);
    await page.evaluate(() => localStorage.removeItem("kanbalone:sidebar-collapsed"));
    await page.reload();
    await expect(page.locator(".shell")).not.toHaveClass(/sidebar-collapsed/);
  } finally { await close(); }
});

test("empty narrow startup exposes board creation without persisting an expanded preference", async ({ page }) => {
  await page.setViewportSize({ width: 650, height: 844 });
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.goto(baseUrl);
    await expect(page.getByRole("button", { name: "Create your first board" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("kanbalone:sidebar-collapsed"))).toBeNull();
    const board = await createBoard(page.request, baseUrl, { name: "First board", laneNames: ["todo"] });
    await page.goto(`${baseUrl}/boards/${board.board.id}`);
    await expect(page.locator(".shell")).toHaveClass(/sidebar-collapsed/);
  } finally { await close(); }
});


for (const width of [650, 390]) {
  test(`collapsed sidebar preserves the main content width at ${width}px in every view`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const { baseUrl, close } = await startTestApp(page);
    try {
      const board = await createBoard(page.request, baseUrl, { name: "Visible work", laneNames: ["todo"] });
      const group = await (await page.request.post(`${baseUrl}/api/boards/${board.board.id}/groups`, { data: { name: "Visible Group" } })).json();
      await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Visible ticket", groupId: group.id });
      for (const mode of ["kanban", "list", "group"]) {
        await page.goto(`${baseUrl}/boards/${board.board.id}${mode === "kanban" ? "" : `/${mode}`}`);
        await expect(page.locator(".shell")).toHaveClass(/sidebar-collapsed/);
        await expect(page.locator("main").getByText("Visible ticket", { exact: true }).filter({ visible: true })).toBeVisible();
        const main = await page.locator("main").boundingBox();
        expect(main).not.toBeNull();
        expect(main!.width).toBeGreaterThanOrEqual(width - 20);
        expect(main!.x).toBeGreaterThanOrEqual(0);
        expect(main!.x + main!.width).toBeLessThanOrEqual(width + 1);
        const ticket = await page.locator("main").getByText("Visible ticket", { exact: true }).filter({ visible: true }).boundingBox();
        expect(ticket!.x).toBeGreaterThanOrEqual(0);
        expect(ticket!.x).toBeLessThan(width);
        expect(ticket!.width).toBeGreaterThan(50);
      }
    } finally { await close(); }
  });
}
