import { expect, test } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, updateTicket } from "./helpers.js";

test("dark ticket details identify the lane with the theme text color", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Lane clarity", laneNames: ["Acceptance <review>"] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Review this" });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator(".ticket-lane-meta")).toHaveText("Lane: Acceptance <review>");
    const textColor = await page.locator("body").evaluate((body) => getComputedStyle(body).color);
    await expect(page.locator(".ticket-lane-meta > span:last-child")).toHaveCSS("color", textColor);
    await expect(page.locator(".ticket-lane-meta button, .ticket-lane-meta select")).toHaveCount(0);
  } finally { await close(); }
});

test("Kanban blocker count survives search and archived blockers and clears only on completion", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Blocker clarity", laneNames: ["Todo"] });
    const laneId = board.lanes[0].id;
    const blocker = await createTicket(page.request, baseUrl, board.board.id, { laneId, title: "Hidden dependency", isArchived: true });
    const completedLane = await createCompletionLane(page.request, baseUrl, board.board.id);
    const complete = await createTicket(page.request, baseUrl, board.board.id, { laneId: completedLane.id, title: "Completed dependency" });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId, title: "Visible task", blockerIds: [blocker.id, complete.id] });
    await page.goto(`${baseUrl}/boards/${board.board.id}`);
    await page.locator("#search-input").fill("Visible task");
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-blocker-indicator")).toHaveAttribute("aria-label", "Blocked by 1 unresolved ticket");
    const filtered = await (await page.request.get(`${baseUrl}/api/boards/${board.board.id}/tickets?q=Visible`)).json();
    expect(filtered.tickets[0].unresolvedBlockerCount).toBe(1);
    await updateTicket(page.request, baseUrl, blocker.id, { laneId: completedLane.id });
    await page.reload();
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`)).toBeVisible();
    await expect(page.locator(".ticket-blocker-indicator")).toHaveCount(0);
  } finally { await close(); }
});

test("combined status names and empty result explain filters and reset to unarchived tickets", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Filter clarity", laneNames: ["Todo"] });
    await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Open task" });
    await page.goto(`${baseUrl}/boards/${board.board.id}/list`);
    const summary = page.locator("#status-filter-summary");
    const before = await summary.boundingBox();
    await page.locator("#status-filter .filter-menu-edge-toggle").click();
    await expect(summary).toHaveText("Open + Resolved");
    await expect(page.locator('[data-status-filter="resolved"]')).toHaveAttribute("aria-pressed", "true");
    const statusToggle = page.locator("#status-filter .filter-menu-edge-toggle");
    if (await statusToggle.getAttribute("aria-expanded") === "true") await statusToggle.click();
    const after = await summary.boundingBox();
    expect(after?.width).toBe(before?.width);
    await page.locator("#search-input").fill("does not exist <text>");
    await expect(page.locator("#list-board .empty-state")).toContainText("Completion: Open + Resolved");
    await expect(page.locator("#list-board .empty-state")).toContainText("Search: “does not exist <text>”");
    await page.getByRole("button", { name: "Reset filters", exact: true }).last().click();
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(summary).toHaveText("Open + Resolved");
    await expect(page.locator("#list-board")).toContainText("Open task");
  } finally { await close(); }
});

for (const width of [1280, 980]) {
  test(`status selection preserves filter and following control geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 840 });
    const { baseUrl, close } = await startTestApp(page);
    try {
      const board = await createBoard(page.request, baseUrl, { name: "Stable status", laneNames: ["Todo"] });
      await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Task", priority: 3 });
      await page.goto(`${baseUrl}/boards/${board.board.id}`);
      await page.locator("#sidebar-toggle-button").click();
      // Keep Reset visible before the status change so its position can be compared.
      await page.locator("#priority-filter .filter-menu-edge-toggle").click();
      await page.locator('[data-priority-filter="high"]').click();
      const priorityToggle = page.locator("#priority-filter .filter-menu-edge-toggle");
      if (await priorityToggle.getAttribute("aria-expanded") === "true") await priorityToggle.click();
      const geometry = () => page.evaluate(() => ["status-filter", "reset-filters-button"].map((id) => {
        const rect = document.getElementById(id)!.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }));
      const before = await geometry();
      await expect(page.locator('[data-status-clear]')).toBeHidden();
      await page.locator("#status-filter .filter-menu-edge-toggle").click();
      await page.locator('[data-status-filter="resolved"]').click();
      const statusToggle = page.locator("#status-filter .filter-menu-edge-toggle");
      if (await statusToggle.getAttribute("aria-expanded") === "true") await statusToggle.click();
      await expect(statusToggle).toHaveAccessibleName("Completion: Open");
      await expect(page.locator('[data-status-clear]')).toBeVisible();
      expect(await geometry()).toEqual(before);
      const selectedSize = await page.locator("#status-filter-summary").evaluate((element) => ({
        width: element.clientWidth, scrollWidth: element.scrollWidth,
        height: element.clientHeight, scrollHeight: element.scrollHeight,
        textOverflow: getComputedStyle(element).textOverflow,
      }));
      expect(selectedSize.scrollWidth).toBeLessThanOrEqual(selectedSize.width);
      expect(selectedSize.scrollHeight).toBeLessThanOrEqual(selectedSize.height);
      expect(selectedSize.textOverflow).not.toBe("ellipsis");
      await statusToggle.click();
      await expect(page.locator("#status-filter-summary")).toBeHidden();
      await page.locator('[data-status-filter="resolved"]').click();
      if (await statusToggle.getAttribute("aria-expanded") !== "true") await statusToggle.click();
      await page.locator('#include-archived-filter').click();
      if (await statusToggle.getAttribute("aria-expanded") === "true") await statusToggle.click();
      await expect(page.locator("#status-filter-summary")).toHaveText("Open + Resolved");
      expect(await geometry()).toEqual(before);
      await statusToggle.click();
      await page.locator('[data-status-filter="open"]').click();
      if (await statusToggle.getAttribute("aria-expanded") === "true") await statusToggle.click();
      await expect(page.locator("#status-filter-summary")).toHaveText("Resolved");
      expect(await geometry()).toEqual(before);
      const longestFits = await page.locator("#status-filter-summary").evaluate((element) =>
        element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight);
      expect(longestFits).toBe(true);
      await page.screenshot({ path: `coverage/ux-status-full-label-${width}.png` });
      await page.locator('[data-status-clear]').click();
      await expect(statusToggle).toHaveAccessibleName("Completion: Open + Resolved");
      await expect(page.locator('[data-status-clear]')).toBeHidden();
      expect(await geometry()).toEqual(before);
    } finally { await close(); }
  });
}
