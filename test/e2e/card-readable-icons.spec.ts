import { expect, test } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, updateTicket } from "./helpers.js";

test("card metadata separates urgency, blockers and Tasks without moving titles", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Card metadata", laneNames: ["Todo"] });
    const laneId = lanes[0].id;
    const dependency = await createTicket(page.request, baseUrl, board.id, { laneId, title: "Dependency" });
    const urgent = await createTicket(page.request, baseUrl, board.id, { laneId, title: "Urgent", priority: 4, blockerIds: [dependency.id] });
    const task = await page.request.post(`${baseUrl}/api/tickets/${urgent.id}/tasks`, { data: { bodyMarkdown: "Verify" } });
    expect(task.status()).toBe(201);
    await page.goto(`${baseUrl}/boards/${board.id}`);
    const card = page.locator(`.ticket-card[data-ticket-id="${urgent.id}"]`);
    await expect(card.locator('.ticket-priority-icon .icon')).toHaveAttribute('data-kanban-card-icon', 'circle-alert');
    await expect(card.locator('.ticket-blocker-indicator .icon')).toHaveAttribute('data-kanban-card-icon', 'lock');
    await expect(card.locator('.ticket-task-count .icon')).toHaveAttribute('data-kanban-card-icon', 'list-checks');
    await expect(card.locator('.ticket-task-count')).toHaveText('0/1');
    await expect(card.locator('.ticket-task-count')).toHaveAttribute('aria-label', 'Tasks completed: 0 of 1');
    await expect(card.locator('.ticket-link')).toHaveAccessibleDescription(/Urgent priority.*Blocked by 1 unresolved ticket.*Tasks completed: 0 of 1/);
    const offset = () => card.evaluate(c => c.querySelector('.ticket-link')!.getBoundingClientRect().left - c.getBoundingClientRect().left);
    const before = await offset();
    const done = await createCompletionLane(page.request, baseUrl, board.id);
    await updateTicket(page.request, baseUrl, dependency.id, { laneId: done.id });
    await expect(card.locator('.ticket-blocker-indicator')).toHaveCount(0);
    expect(await offset()).toBe(before);
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await expect(card).toHaveCSS("background-color", colorScheme === "light" ? "rgb(255, 255, 255)" : "rgb(29, 37, 32)");
      const ratio = await card.evaluate(c => {
        const id = c.querySelector('.ticket-id')!;
        const luminance = (color: string) => {
          const [r, g, b] = color.match(/[\d.]+/g)!.map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
          return .2126 * r + .7152 * g + .0722 * b;
        };
        const colors = [getComputedStyle(id).color, getComputedStyle(c).backgroundColor].map(luminance).sort((a, b) => b - a);
        return (colors[0] + .05) / (colors[1] + .05);
      });
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  } finally { await close(); }
});

test("card descriptions escape lane clipping and dismiss on Escape, scroll and unmount", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Tooltip edges", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Last card", priority: 4 });
    await page.setViewportSize({ width: 390, height: 480 });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    const card = page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`);
    const icon = card.locator('.ticket-priority-icon');
    const tooltip = page.locator('body > .ticket-card-tooltip');
    // Exercise the real clipping boundary, even when this small fixture fits.
    await card.locator('..').evaluate(list => { list.style.maxHeight = `${list.clientHeight}px`; list.style.overflow = 'hidden'; });
    await icon.hover();
    await expect(tooltip).toHaveText('Urgent priority');
    const box = (await tooltip.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(8);
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(480 - 8);
    const laneBox = (await card.locator('..').boundingBox())!;
    expect(box.y + box.height).toBeGreaterThan(laneBox.y + laneBox.height);
    await tooltip.hover();
    await page.waitForTimeout(200); // Beyond the pointer bridge grace period.
    await expect(tooltip).toBeVisible();
    await tooltip.click();
    await expect(tooltip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tooltip).toBeHidden();
    await page.mouse.move(0, 0);
    await icon.hover();
    await expect(tooltip).toBeVisible();
    await page.evaluate(() => document.querySelector('.ticket-list')!.dispatchEvent(new Event('scroll')));
    await expect(tooltip).toBeHidden();
    await card.locator('.ticket-link').focus();
    await expect(tooltip).toContainText('Standalone ticket');
    await expect(tooltip).toContainText('Urgent priority');
    await card.evaluate(c => c.remove()); // Virtual window/source replacement cleanup.
    await expect(tooltip).toBeHidden();
  } finally { await close(); }
});

test("keyboard descriptions remain visible after native lane scrolling", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Focus scroll", laneNames: ["Todo"] });
    for (let i = 0; i < 9; i++) await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Card ${i}` });
    await page.setViewportSize({ width: 390, height: 480 });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole('button', { name: 'Card 7', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Card 8', exact: true })).toBeFocused();
    await expect(page.locator('.ticket-card-tooltip')).toBeVisible();
    await expect(page.locator('.ticket-card-tooltip')).toContainText('Standalone ticket');
    expect(await page.locator('.ticket-list').evaluate(list => list.scrollTop)).toBeGreaterThan(0);
    const box = (await page.locator('.ticket-card-tooltip').boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(8);
    expect(box.y + box.height).toBeLessThanOrEqual(472);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ticket-card-tooltip')).toBeHidden();
    await expect(page.locator('#search-input')).toBeFocused();
    await page.getByRole('button', { name: 'Card 8', exact: true }).focus();
    await expect(page.locator('.ticket-card-tooltip')).toBeVisible();
  } finally { await close(); }
});
