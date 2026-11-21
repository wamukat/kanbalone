import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

test("bulk move defaults to the current board even when it is not first", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await createBoard(page.request, baseUrl, { name: "Earlier board", laneNames: ["Todo", "Done"] });
    const board = await createBoard(page.request, baseUrl, { name: "Current board", laneNames: ["Todo", "Review"] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Keep on this board" });
    await page.goto(`${baseUrl}/boards/${board.board.id}/list`);
    await page.locator(`[data-list-ticket-id="${ticket.id}"]`).check();
    await page.locator("[data-bulk-move-board='true']").first().click();
    await expect(page.locator("[data-bulk-move-board-select]")).toHaveValue(String(board.board.id));
    await expect(page.locator("[data-bulk-move-lane-select]")).toHaveValue(String(board.lanes[1].id));
    await expect(page.locator("#ux-message")).not.toContainText("cleared");
    await page.locator("#ux-submit-button").click();
    await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json()).laneId).toBe(board.lanes[1].id);
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(saved.boardId).toBe(board.board.id);
  } finally { await close(); }
});

test("bulk move with one current lane requires an explicit different board", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const other = await createBoard(page.request, baseUrl, { name: "Other board", laneNames: ["Todo"] });
    const board = await createBoard(page.request, baseUrl, { name: "One lane", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Do not move accidentally" });
    await page.goto(`${baseUrl}/boards/${board.board.id}/list`);
    await page.locator(`[data-list-ticket-id="${ticket.id}"]`).check();
    await page.locator("[data-bulk-move-board='true']").first().click();
    await expect(page.locator("[data-bulk-move-board-select]")).toHaveValue(String(board.board.id));
    await expect(page.locator("#ux-submit-button")).toBeDisabled();
    await expect(page.locator("[data-bulk-move-lane-select]")).toContainText("No other lanes");
    await page.locator("[data-bulk-move-board-select]").selectOption(String(other.board.id));
    await expect(page.locator("#ux-submit-button")).toBeEnabled();
    await expect(page.locator("#ux-message")).toContainText("Group membership");
    await page.locator("#ux-cancel-button").click();
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(saved.boardId).toBe(board.board.id);
  } finally { await close(); }
});

test("moving to another board refreshes editor lanes before the next save", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const source = await createBoard(page.request, baseUrl, { name: "Source", laneNames: ["Source only", "Review"] });
    const target = await createBoard(page.request, baseUrl, { name: "Target", laneNames: ["Target only", "Review"] });
    const ticket = await createTicket(page.request, baseUrl, source.board.id, { laneId: source.lanes[0].id, title: "Move then edit" });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator("#header-edit-button").click();
    await page.locator("#move-ticket-button").click();
    await page.locator("[data-move-board]").selectOption(String(target.board.id));
    await expect(page.locator("[data-move-lane]")).toContainText("Target only");
    await page.locator("[data-move-lane]").selectOption(String(target.lanes[1].id));
    await page.locator("#ux-submit-button").click();
    await expect(page.locator("#ticket-lane")).toHaveValue(String(target.lanes[1].id));
    await expect(page.locator("#ticket-lane")).not.toContainText("Source only");
    await page.locator("#ticket-body").fill("Edited after moving");
    await page.locator("#editor-form button[type='submit']").click();
    await expect(page.locator("#ticket-view")).toBeVisible();
    await page.reload();
    await expect(page.locator("#ticket-view")).toContainText("Edited after moving");
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(saved.boardId).toBe(target.board.id);
    expect(saved.laneId).toBe(target.lanes[1].id);
  } finally { await close(); }
});

test("bulk destination loading cannot overwrite a newer board selection", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let releaseSlow: (() => void) | undefined;
  try {
    const slow = await createBoard(page.request, baseUrl, { name: "Slow board", laneNames: ["Slow lane"] });
    const current = await createBoard(page.request, baseUrl, { name: "Current board", laneNames: ["Todo", "Review"] });
    const ticket = await createTicket(page.request, baseUrl, current.board.id, { laneId: current.lanes[0].id, title: "Keep current destination" });
    await page.goto(`${baseUrl}/boards/${current.board.id}/list`);
    await page.locator(`[data-list-ticket-id="${ticket.id}"]`).check();
    await page.locator("[data-bulk-move-board='true']").first().click();
    const slowWait = new Promise<void>((resolve) => { releaseSlow = resolve; });
    let started: (() => void) | undefined;
    const requestStarted = new Promise<void>((resolve) => { started = resolve; });
    await page.route(`**/api/boards/${slow.board.id}`, async (route) => {
      started?.();
      await slowWait;
      await route.fulfill({ json: slow });
    });
    await page.locator("[data-bulk-move-board-select]").selectOption(String(slow.board.id));
    await requestStarted;
    await expect(page.locator("#ux-submit-button")).toBeDisabled();
    await page.locator("[data-bulk-move-board-select]").selectOption(String(current.board.id));
    await expect(page.locator("[data-bulk-move-lane-select]")).toHaveValue(String(current.lanes[1].id));
    releaseSlow?.();
    await expect(page.locator("#ux-submit-button")).toBeEnabled();
    await page.locator("#ux-submit-button").click();
    await expect.poll(async () => (await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json()).laneId).toBe(current.lanes[1].id);
  } finally { releaseSlow?.(); await close(); }
});
