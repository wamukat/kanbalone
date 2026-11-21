import { expect, test, type Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, buildApp, createDbFile, getFreePort, closeTestApp } from "./helpers.js";

const card = (page: Page, id: number) => page.locator(`.ticket-card[data-ticket-id="${id}"]`);
const lane = (page: Page, id: number) => page.locator(`.ticket-list[data-lane-id="${id}"]`);

async function beginDrag(page: Page, sourceId: number, targetId: number) {
  const source = await card(page, sourceId).boundingBox();
  const target = await card(page, targetId).boundingBox();
  if (!source || !target) throw new Error("Drag cards must be visible");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2 - 2, { steps: 12 });
  // Chromium needs another dragover after entering the new target.
  await page.mouse.move(target.x + target.width / 2 + 1, target.y + target.height / 2 - 1);
  await expect(card(page, targetId).locator("xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' lane ')]")).toHaveClass(/is-drag-over/);
}

async function fixture(page: Page) {
  await page.setViewportSize({ width: 1280, height: 844 });
  const app = process.env.KANBALONE_DRAG_BASELINE_STATIC
    ? await (async () => {
      const server = buildApp({ dbFile: createDbFile(), staticDir: process.env.KANBALONE_DRAG_BASELINE_STATIC! });
      const port = await getFreePort();
      await server.listen({ host: "127.0.0.1", port });
      return { baseUrl: `http://127.0.0.1:${port}`, close: async () => { await page.close(); await closeTestApp(server); } };
    })()
    : await startTestApp(page);
  const board = await createBoard(page.request, app.baseUrl, { name: "Native drag", laneNames: ["Todo", "Doing"] });
  const todo = board.lanes[0].id;
  const doing = board.lanes[1].id;
  const moving = await createTicket(page.request, app.baseUrl, board.board.id, { laneId: todo, title: "Move this ticket" });
  const first = await createTicket(page.request, app.baseUrl, board.board.id, { laneId: doing, title: "Existing first" });
  const second = await createTicket(page.request, app.baseUrl, board.board.id, { laneId: doing, title: "Existing second" });
  const read = async (id: number) => (await page.request.get(`${app.baseUrl}/api/tickets/${id}`)).json();
  await page.goto(`${app.baseUrl}/boards/${board.board.id}`);
  await expect(card(page, second.id)).toBeVisible();
  return { ...app, boardId: board.board.id, todo, doing, moving, first, second, read };
}

test("native card drag persists into an occupied lane and same-lane reorder", async ({ page }) => {
  const f = await fixture(page);
  try {
    await beginDrag(page, f.moving.id, f.first.id);
    await page.mouse.up();
    await expect.poll(async () => (await f.read(f.moving.id)).laneId).toBe(f.doing);
    await expect(lane(page, f.doing).locator(".ticket-card").first()).toHaveAttribute("data-ticket-id", String(f.moving.id));
    await page.reload();
    await expect(lane(page, f.doing).locator(".ticket-card").first()).toHaveAttribute("data-ticket-id", String(f.moving.id));
    await beginDrag(page, f.second.id, f.moving.id);
    await page.mouse.up();
    await expect.poll(async () => (await f.read(f.second.id)).position).toBe(0);
    await page.reload();
    await expect(lane(page, f.doing).locator(".ticket-card").first()).toHaveAttribute("data-ticket-id", String(f.second.id));
  } finally { await f.close(); }
});

test("native card drag into a populated completion lane stays first after reload", async ({ page }) => {
  const f = await fixture(page);
  try {
    const done = await createCompletionLane(page.request, f.baseUrl, f.boardId);
    const completed = [];
    for (let i = 0; i < 6; i++) completed.push(await createTicket(page.request, f.baseUrl, f.boardId, { laneId: done.id, title: `Completed ${i}` }));
    await page.reload();
    await expect(lane(page, done.id).locator(".ticket-card")).toHaveCount(5);
    const target = Number(await lane(page, done.id).locator(".ticket-card").first().getAttribute("data-ticket-id"));
    await beginDrag(page, f.moving.id, target);
    await page.mouse.up();
    await expect.poll(async () => (await f.read(f.moving.id)).laneId).toBe(done.id);
    expect((await f.read(f.moving.id)).resolvedAt).toBeTruthy();
    await page.reload();
    await expect(lane(page, done.id).locator(".ticket-card").first()).toHaveAttribute("data-ticket-id", String(f.moving.id));
    await expect(lane(page, done.id).locator(".ticket-card")).toHaveCount(5);
  } finally { await f.close(); }
});

test("cancelled native drags and rejected saves preserve stored and visible position", async ({ page }) => {
  const f = await fixture(page);
  let writes = 0;
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().endsWith(`/api/tickets/${f.moving.id}/position`)) writes++;
  });
  try {
    const before = await f.read(f.moving.id);
    await beginDrag(page, f.moving.id, f.first.id);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(lane(page, f.todo).locator(`[data-ticket-id="${f.moving.id}"]`)).toBeVisible();
    expect(await f.read(f.moving.id)).toEqual(before);
    expect(writes).toBe(0);
    await beginDrag(page, f.moving.id, f.first.id);
    await page.mouse.move(20, 750, { steps: 12 });
    await page.mouse.up();
    await expect(lane(page, f.todo).locator(`[data-ticket-id="${f.moving.id}"]`)).toBeVisible();
    expect(await f.read(f.moving.id)).toEqual(before);
    expect(writes).toBe(0);
    await page.route(`**/api/tickets/${f.moving.id}/position`, (route) => route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Injected save failure" }) }));
    await beginDrag(page, f.moving.id, f.first.id);
    await page.mouse.up();
    await expect.poll(() => writes).toBe(1);
    await expect(lane(page, f.todo).locator(`[data-ticket-id="${f.moving.id}"]`)).toBeVisible();
    expect(await f.read(f.moving.id)).toEqual(before);
    await page.reload();
    await expect(lane(page, f.todo).locator(`[data-ticket-id="${f.moving.id}"]`)).toBeVisible();
  } finally { await f.close(); }
});
