import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp, showCurrentTicket } from "./helpers.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

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
    await showCurrentTicket(page);
    await expect(page.locator("#ticket-view")).toBeVisible();
    await page.reload();
    await showCurrentTicket(page);
    await expect(page.locator("#ticket-view")).toContainText("Edited after moving");
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(saved.boardId).toBe(target.board.id);
    expect(saved.laneId).toBe(target.lanes[1].id);
  } finally { await close(); }
});

test("ticket move requires an explicit lane and keeps the source and draft on failure", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const target = await createBoard(page.request, baseUrl, { name: "Release review", laneNames: ["Review"] });
    const source = await createBoard(page.request, baseUrl, { name: "Operations desk", laneNames: ["Todo", "Review"] });
    const ticket = await createTicket(page.request, baseUrl, source.board.id, { laneId: source.lanes[1].id, title: "Move with intent", bodyMarkdown: "Saved body" });
    const ticketUrl = `${baseUrl}/api/tickets/${ticket.id}`;
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator("#header-edit-button").click();
    const body = page.locator("#ticket-body");
    await body.fill("Uncommitted draft");
    const move = page.locator("#move-ticket-button");
    const board = page.locator("[data-move-board]");
    const lane = page.locator("[data-move-lane]");
    const submit = page.locator("#ux-submit-button");
    const openFromDirtyEditor = async () => {
      await move.click();
      await submit.click();
      await expect(board).toBeFocused();
      await expect(page.locator("[data-move-source]")).toContainText("Operations desk");
      await expect(board).toHaveValue(String(source.board.id));
      await expect(lane).toHaveValue(String(source.lanes[1].id));
      await expect(lane).toBeDisabled();
      await expect(submit).toBeDisabled();
    };
    const chooseTarget = async () => {
      await board.selectOption(String(target.board.id));
      await expect(lane).toBeEnabled();
      await expect(lane).toHaveValue("");
      await expect(submit).toBeDisabled();
      await lane.selectOption(String(target.lanes[0].id));
      await expect(submit).toBeEnabled();
    };
    await openFromDirtyEditor();
    await chooseTarget();
    await page.keyboard.press("Escape");
    await expect(move).toBeFocused();
    await expect(body).toHaveValue("Uncommitted draft");
    await openFromDirtyEditor();
    await chooseTarget();
    await page.route(`${ticketUrl}/move`, route => route.fulfill({ status: 409, json: { error: "Destination changed" } }), { times: 1 });
    await submit.click();
    await expect(page.locator("#ux-error")).toHaveText("Destination changed");
    await expect(board).toHaveValue(String(target.board.id));
    await expect(lane).toHaveValue(String(target.lanes[0].id));
    await expect(submit).toBeEnabled();
    expect(await (await page.request.get(ticketUrl)).json()).toMatchObject({ boardId: source.board.id, laneId: source.lanes[1].id, bodyMarkdown: "Saved body" });
    await page.locator("#ux-cancel-button").click();
    await expect(body).toHaveValue("Uncommitted draft");
    await expect(move).toBeFocused();
  } finally { await close(); }
});

test("ticket move ignores a stale lane response and guards a committed move when refresh fails", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const slowResponse = deferred();
  const writeResponse = deferred();
  try {
    const source = await createBoard(page.request, baseUrl, { name: "Source", laneNames: ["Source lane"] });
    const slow = await createBoard(page.request, baseUrl, { name: "Slow destination", laneNames: ["Old lane"] });
    const target = await createBoard(page.request, baseUrl, { name: "Target", laneNames: ["Target lane"] });
    const ticket = await createTicket(page.request, baseUrl, source.board.id, { laneId: source.lanes[0].id, title: "Move once" });
    const ticketUrl = `${baseUrl}/api/tickets/${ticket.id}`;
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator("#header-edit-button").click();
    await page.locator("#move-ticket-button").click();
    const board = page.locator("[data-move-board]");
    const lane = page.locator("[data-move-lane]");
    const submit = page.locator("#ux-submit-button");
    const slowStarted = deferred();
    const slowFinished = deferred();
    await page.route(`${baseUrl}/api/boards/${slow.board.id}`, async route => {
      slowStarted.resolve();
      await slowResponse.promise;
      try {
        await route.fulfill({ status: 500, json: { error: "Stale response" } });
      } finally {
        slowFinished.resolve();
      }
    });
    await board.selectOption(String(slow.board.id));
    await slowStarted.promise;
    await expect(submit).toBeDisabled();
    await board.selectOption(String(target.board.id));
    await expect(lane).toBeEnabled();
    await lane.selectOption(String(target.lanes[0].id));
    slowResponse.resolve();
    await slowFinished.promise;
    await expect(lane).toHaveValue(String(target.lanes[0].id));

    const writeStarted = deferred();
    let writes = 0;
    await page.route(`${ticketUrl}/move`, async route => {
      writes++;
      writeStarted.resolve();
      await writeResponse.promise;
      await route.continue();
    });
    await page.route(`${baseUrl}/api/boards/${target.board.id}`, route => route.fulfill({ status: 500, json: { error: "Refresh failed" } }));
    await submit.click();
    await writeStarted.promise;
    await expect(submit).toBeDisabled();
    await expect(board).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ux-dialog")).toBeVisible();
    writeResponse.resolve();
    await expect(page.locator("#ux-dialog")).not.toBeVisible();
    await expect(page.locator("#editor-dialog")).not.toBeVisible();
    await expect(page.locator("#toast")).toContainText("Ticket moved, but the view could not refresh");
    expect(writes).toBe(1);
    expect(await (await page.request.get(ticketUrl)).json()).toMatchObject({ boardId: target.board.id, laneId: target.lanes[0].id });
  } finally {
    slowResponse.resolve();
    writeResponse.resolve();
    await close();
  }
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
