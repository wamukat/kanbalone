import { expect, test, type Page } from "@playwright/test";
import { startTestApp } from "./helpers.js";

const lane = (page: Page, id: number) => page.locator(`#lane-board .ticket-list[data-lane-id="${id}"]`);
const card = (page: Page, id: number) => page.locator(`#lane-board .ticket-card[data-ticket-id="${id}"]`);
const title = (page: Page, id: number) => card(page, id).locator(".ticket-link");

async function fixture(page: Page) {
  await page.setViewportSize({ width: 1660, height: 900 });
  const { baseUrl, close } = await startTestApp(page);
  const counts = [206, 205, 6, 8];
  const lanes = ["Source", "Target", "Small", "Done"].map((name, index) => ({
    id: index + 1, name, position: index, isCompletionLane: name === "Done",
  }));
  const tickets = counts.flatMap((count, laneIndex) => Array.from({ length: count }, (_, index) => ({
    id: laneIndex * 1000 + index + 1, laneId: laneIndex + 1, position: index,
    title: `Card ${laneIndex + 1}:${index + 1}` + (index % 3 === 1 ? " with a title long enough to wrap across lines and change the card height" : ""),
    bodyMarkdown: "", priority: 2, isResolved: laneIndex === 3, isArchived: false,
    parentTicketId: null, groupId: null, tags: [], comments: [], blockerIds: [],
  })));
  const response = await page.request.post(`${baseUrl}/api/boards/import`, { data: {
    formatVersion: 2, board: { name: "Virtual Kanban" }, lanes, groups: [], tags: [], tickets,
  } });
  expect(response.status(), await response.text()).toBe(201);
  const { board } = await response.json();
  const boardUrl = `${baseUrl}/api/boards/${board.id}`;
  const current = await (await page.request.get(boardUrl)).json();
  const [source, target, small, done] = current.lanes.map((item: { id: number }) => item.id);
  async function ordered(id: number): Promise<Array<{ id: number; title: string; laneId: number; position: number }>> {
    const response = await page.request.get(`${boardUrl}/tickets?lane_id=${id}&archived=all&order=position_asc`);
    expect(response.status()).toBe(200);
    return (await response.json()).tickets;
  }
  const read = async (id: number) => (await page.request.get(`${baseUrl}/api/tickets/${id}`)).json();
  await page.goto(`${baseUrl}/boards/${board.id}`);
  await expect(lane(page, source)).toHaveAttribute("data-kanban-window", "206");
  await expect(lane(page, target)).toHaveAttribute("data-kanban-window", "205");
  return { baseUrl, boardUrl, close, source, target, small, done, ordered, read };
}

async function twoFrames(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function scrollTo(list: ReturnType<typeof lane>, fraction: number) {
  await list.evaluate((element, fraction) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction; }, fraction);
}

async function visibleIds(list: ReturnType<typeof lane>) {
  return list.evaluate(element => {
    const clip = element.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLElement>(":scope > .ticket-card")].filter(card => {
      const box = card.getBoundingClientRect();
      return box.top > clip.top + 4 && box.bottom < clip.bottom - 4;
    }).map(card => Number(card.dataset.ticketId));
  });
}

async function beginCardDrag(page: Page, sourceId: number, beforeId: number) {
  const source = await card(page, sourceId).boundingBox();
  const target = await card(page, beforeId).boundingBox();
  if (!source || !target) throw new Error("Both drag endpoints need a mounted card");
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2, { steps: 4 });
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2 - 8, { steps: 12 });
  await page.mouse.move(target.x + target.width / 2 + 1, target.y + target.height / 2 - 7);
  await expect(card(page, sourceId)).toHaveClass(/dragging/);
  await expect(card(page, beforeId)).toHaveClass(/is-ticket-drop-before/);
}

test("native Tab and Shift+Tab mount the next logical card across a Kanban window", async ({ page }) => {
  const f = await fixture(page);
  try {
    const [first, next] = await f.ordered(f.source);
    const list = lane(page, f.source);
    await title(page, first.id).focus();
    const firstHandle = await title(page, first.id).elementHandle();
    await scrollTo(list, 0.55);
    await expect(title(page, first.id)).not.toBeInViewport();
    await expect(title(page, next.id)).toHaveCount(0);
    expect(await list.locator(":scope > .ticket-card").count()).toBeLessThan(40);
    expect(await firstHandle?.evaluate(node => node === document.activeElement)).toBe(true);
    await page.keyboard.press("Tab");
    await expect(title(page, next.id)).toBeFocused();
    await expect(title(page, next.id)).toBeInViewport();
    await scrollTo(list, 0.55);
    await expect(title(page, first.id)).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await twoFrames(page);
    await expect(title(page, first.id)).toBeFocused();
    await expect(title(page, first.id)).toBeInViewport();
    await page.keyboard.press("Enter");
    await expect(page.locator("#ticket-title")).toHaveValue(first.title);
    await page.keyboard.press("Escape");
    await expect(page.locator("body")).not.toHaveClass(/editor-dialog-open/);
    await expect(title(page, first.id)).toBeFocused();
    const last = (await f.ordered(f.source)).at(-1)!;
    const footer = page.locator(`#lane-board .lane[data-lane-id="${f.source}"] .add-ticket-button`);
    await footer.focus();
    await expect(footer).toBeFocused();
    await expect(title(page, last.id)).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await expect(title(page, last.id)).toBeFocused();
    await expect(title(page, last.id)).toBeInViewport();
  } finally { await f.close(); }
});

for (const laneToUpdate of ["other", "same"] as const) {
  test(`an editor close waiting for SSE keeps subsequent native Tab focus when the ${laneToUpdate} lane changes`, async ({ page }) => {
    await page.addInitScript(() => {
      const NativeEventSource = window.EventSource;
      const observed = { opened: false, updates: 0 };
      Object.assign(window, { kanbanObservedEvents: observed });
      window.EventSource = class extends NativeEventSource {
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          this.addEventListener("open", () => { observed.opened = true; });
          this.addEventListener("message", () => { observed.updates++; });
        }
      };
    });
    const f = await fixture(page);
    let releaseRefresh: (() => void) | undefined;
    try {
      await page.waitForFunction(() => (window as unknown as { kanbanObservedEvents: { opened: boolean } }).kanbanObservedEvents.opened);
      const [first, next, third] = await f.ordered(f.source);
      const changed = laneToUpdate === "same" ? third : (await f.ordered(f.target))[0];
      await title(page, first.id).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#editor-dialog")).toHaveAttribute("open", "");
      const update = await page.request.patch(`${f.baseUrl}/api/tickets/${changed.id}`, { data: { title: "Changed while detail was open" } });
      expect(update.ok()).toBe(true);
      await page.waitForFunction(() => (window as unknown as { kanbanObservedEvents: { updates: number } }).kanbanObservedEvents.updates > 0);

      const delayed = new Promise<void>(resolve => { releaseRefresh = resolve; });
      let startRefresh!: () => void;
      const refreshStarted = new Promise<void>(resolve => { startRefresh = resolve; });
      await page.route(f.boardUrl, async route => {
        startRefresh();
        await delayed;
        await route.continue();
      });
      await page.keyboard.press("Escape");
      await refreshStarted;
      await expect(page.locator("body")).not.toHaveClass(/editor-dialog-open/);
      await expect(title(page, first.id)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(title(page, next.id)).toBeFocused();
      releaseRefresh?.();
      await expect(title(page, changed.id)).toHaveText("Changed while detail was open");
      await twoFrames(page);
      await expect(title(page, next.id)).toBeFocused();
    } finally {
      releaseRefresh?.();
      await f.close();
    }
  });
}

test("virtual Kanban saves logical same-lane, cross-lane and completion drops", async ({ page }) => {
  const f = await fixture(page);
  try {
    const list = lane(page, f.source);
    await scrollTo(list, 0.45);
    await twoFrames(page);
    const [before, , moving] = await visibleIds(list);
    expect(before).toBeTruthy();
    expect(moving).toBeTruthy();
    await beginCardDrag(page, moving, before);
    await page.mouse.up();
    await expect.poll(async () => {
      const ids = (await f.ordered(f.source)).map(t => t.id);
      return ids.indexOf(before) - ids.indexOf(moving);
    }).toBe(1);
    await expect(lane(page, f.source)).toHaveAttribute("data-kanban-window", "206");
    await scrollTo(list, 0.45);
    await twoFrames(page);
    const [sourceId] = await visibleIds(list);
    const [small] = await f.ordered(f.small);
    await beginCardDrag(page, sourceId, small.id);
    await page.mouse.up();
    await expect.poll(async () => (await f.ordered(f.small))[0]?.id).toBe(sourceId);
    const [target] = await f.ordered(f.target);
    await beginCardDrag(page, sourceId, target.id);
    await page.mouse.up();
    await expect.poll(async () => (await f.ordered(f.target))[0]?.id).toBe(sourceId);
    const doneId = Number(await lane(page, f.done).locator(".ticket-card").first().getAttribute("data-ticket-id"));
    await beginCardDrag(page, sourceId, doneId);
    await page.mouse.up();
    await expect.poll(async () => (await f.read(sourceId)).laneId).toBe(f.done);
    await page.reload();
    await expect(lane(page, f.done).locator(".ticket-card").first()).toHaveAttribute("data-ticket-id", String(sourceId));
    expect((await f.read(sourceId)).isResolved).toBe(true);
  } finally { await f.close(); }
});

test("virtual Kanban drops cancel or recover without writing to a disappeared anchor", async ({ page }) => {
  const f = await fixture(page);
  try {
    const [source] = await f.ordered(f.source);
    const [target, next] = await f.ordered(f.target);
    const before = await f.read(source.id);
    let writes = 0;
    const writeUrl = `/api/tickets/${source.id}/position`;
    page.on("request", request => {
      if (request.method() === "PATCH" && request.url().endsWith(writeUrl)) writes++;
    });

    await beginCardDrag(page, source.id, target.id);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    expect(writes).toBe(0);
    expect(await f.read(source.id)).toEqual(before);

    await page.route(`**${writeUrl}`, route => route.fulfill({ status: 500, json: { error: "Injected position failure" } }));
    await beginCardDrag(page, source.id, target.id);
    await page.mouse.up();
    await expect(page.getByText("Injected position failure")).toBeVisible();
    expect(writes).toBe(1);
    expect(await f.read(source.id)).toEqual(before);
    await page.unroute(`**${writeUrl}`);

    await beginCardDrag(page, source.id, target.id);
    const request = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === new URL(f.boardUrl).pathname + "/tickets" &&
        url.searchParams.get("lane_id") === String(f.target) && response.ok();
    });
    const deleted = await page.request.delete(`${f.baseUrl}/api/tickets/${target.id}`);
    expect(deleted.ok()).toBe(true);
    await request;
    await twoFrames(page);
    await expect(card(page, source.id)).toHaveClass(/dragging/);
    await expect(card(page, target.id)).toHaveCount(1);
    await page.mouse.up();
    await expect(card(page, target.id)).toHaveCount(0);
    await expect(title(page, next.id)).toBeVisible();
    expect(writes).toBe(1);
    expect(await f.read(source.id)).toEqual(before);
  } finally { await f.close(); }
});

test("an in-flight virtual drop cannot overwrite another client's position change", async ({ page }) => {
  const f = await fixture(page);
  try {
    const [source] = await f.ordered(f.source);
    const [target] = await f.ordered(f.target);
    const writeUrl = `/api/tickets/${source.id}/position`;
    let allowWrite!: () => void;
    const delayed = new Promise<void>(resolve => { allowWrite = resolve; });
    await page.route(`**${writeUrl}`, async route => {
      await delayed;
      await route.continue();
    });

    await beginCardDrag(page, source.id, target.id);
    const browserWrite = page.waitForRequest(request => request.url().endsWith(writeUrl) && request.method() === "PATCH");
    const browserReply = page.waitForResponse(response => response.url().endsWith(writeUrl) && response.request().method() === "PATCH");
    await page.mouse.up();
    try {
      const request = await browserWrite;
      expect(request.postDataJSON()).toMatchObject({
        laneId: f.target, beforeTicketId: target.id,
        expectedSourceLaneId: f.source, expectedSourcePosition: source.position,
      });
      const other = await page.request.patch(`${f.baseUrl}${writeUrl}`, { data: { laneId: f.source, position: 4 } });
      expect(other.ok()).toBe(true);
      expect((await other.json()).position).toBe(4);
    } finally {
      allowWrite();
    }

    expect((await browserReply).status()).toBe(409);
    await expect(page.getByText("ticket position changed; refresh the board")).toBeVisible();
    await expect.poll(async () => (await f.ordered(f.source))[4]?.id).toBe(source.id);
    await expect(lane(page, f.source).locator(".ticket-card").nth(4)).toHaveAttribute("data-ticket-id", String(source.id));
    await page.reload();
    await expect(lane(page, f.source).locator(".ticket-card").nth(4)).toHaveAttribute("data-ticket-id", String(source.id));
  } finally { await f.close(); }
});

test("virtual Kanban survives SSE replacement, resize and search without losing the anchor", async ({ page }) => {
  const f = await fixture(page);
  try {
    const list = lane(page, f.source);
    await scrollTo(list, 0.55);
    await twoFrames(page);
    const [anchor] = await visibleIds(list);
    const oldY = (await card(page, anchor).boundingBox())!.y;
    await title(page, anchor).focus();
    const original = await title(page, anchor).elementHandle();
    const [other] = await f.ordered(f.target);
    await page.request.patch(`${f.baseUrl}/api/tickets/${other.id}`, { data: { title: "Changed elsewhere" } });
    await expect(title(page, other.id)).toHaveText("Changed elsewhere");
    expect(await original?.evaluate(node => node === document.activeElement)).toBe(true);
    expect((await card(page, anchor).boundingBox())!.y).toBeCloseTo(oldY, 0);
    const rebuilt = await page.request.patch(`${f.baseUrl}/api/tickets/${anchor}`, { data: { title: "Updated focused card" } });
    expect(rebuilt.ok()).toBe(true);
    await expect(title(page, anchor)).toHaveText("Updated focused card");
    await expect(title(page, anchor)).toBeFocused();
    expect((await card(page, anchor).boundingBox())!.y).toBeCloseTo(oldY, 0);
    await page.setViewportSize({ width: 1360, height: 750 });
    await list.evaluate(node => node.style.setProperty("--font-size-card-title", "18px"));
    await twoFrames(page);
    await page.emulateMedia({ forcedColors: "active" });
    await expect(title(page, anchor)).toBeFocused();
    await expect(title(page, anchor)).toBeInViewport();
    await page.emulateMedia({ forcedColors: "none" });
    const last = (await f.ordered(f.source)).at(-1)!;
    await expect(title(page, last.id)).toHaveCount(0);
    const input = page.locator("#search-input");
    await input.fill("#" + last.id);
    await expect(title(page, last.id)).toHaveText(last.title);
    await input.press("ArrowDown");
    await expect(title(page, last.id)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#ticket-title")).toHaveValue(last.title);
    await page.keyboard.press("Escape");
    await page.locator("#search-clear-button").click();
    await expect(lane(page, f.source)).toHaveAttribute("data-kanban-window", "206");
    await expect(title(page, anchor)).toBeInViewport();
  } finally { await f.close(); }
});

test("drag scroll keeps the native source mounted and uses logical neighbors across two virtual lanes", async ({ page }) => {
  const f = await fixture(page);
  try {
    const sourceList = lane(page, f.source);
    const targetList = lane(page, f.target);
    const [moving, initialTarget] = await visibleIds(sourceList);
    const sourcePosition = (await f.read(moving)).position;
    await beginCardDrag(page, moving, initialTarget);
    const sourceHandle = await card(page, moving).elementHandle();
    const viewport = await sourceList.boundingBox();
    if (!viewport) throw new Error("Missing source viewport");
    await page.mouse.move(viewport.x + 140, viewport.y + viewport.height - 14, { steps: 6 });
    await expect.poll(() => sourceList.evaluate(list => list.scrollTop)).toBeGreaterThan(900);
    expect(await sourceList.locator(":scope > .ticket-card").count()).toBeLessThan(40);
    expect(await sourceHandle?.evaluate(node => node.isConnected && node.classList.contains("dragging"))).toBe(true);

    await scrollTo(targetList, 0.55);
    await twoFrames(page);
    const [, before] = await visibleIds(targetList);
    const target = await card(page, before).boundingBox();
    if (!target) throw new Error("Missing target viewport card");
    const storedOrder = (await f.ordered(f.target)).map(ticket => ticket.id);
    const previous = storedOrder[storedOrder.indexOf(before) - 1];
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2 - 7, { steps: 10 });
    await page.mouse.move(target.x + target.width / 2 + 1, target.y + target.height / 2 - 6);
    await expect(card(page, before)).toHaveClass(/is-ticket-drop-before/);
    const request = page.waitForRequest(request => request.method() === "PATCH" &&
      request.url().endsWith(`/api/tickets/${moving}/position`));
    await page.mouse.up();
    expect((await request).postDataJSON()).toEqual({
      laneId: f.target, position: storedOrder.indexOf(before), afterTicketId: previous, beforeTicketId: before,
      expectedSourceLaneId: f.source, expectedSourcePosition: sourcePosition, expectedAnchorOrder: "after-before",
    });
    await expect.poll(async () => {
      const ids = (await f.ordered(f.target)).map(ticket => ticket.id);
      const index = ids.indexOf(moving);
      return ids.slice(index - 1, index + 2);
    }).toEqual([previous, moving, before]);
    await page.reload();
    expect((await f.read(moving)).laneId).toBe(f.target);
  } finally { await f.close(); }
});

test("a scrolled virtual lane drags with its top cards and cancels without saving", async ({ page }) => {
  const f = await fixture(page);
  try {
    const first = (await f.ordered(f.source))[0];
    const sourceList = lane(page, f.source);
    const source = page.locator(`#lane-board .lane[data-lane-id="${f.source}"] [data-action="drag-lane"]`);
    const target = page.locator(`#lane-board .lane[data-lane-id="${f.target}"] .lane-header`);
    await scrollTo(sourceList, 0.5);
    await expect(card(page, first.id)).toHaveCount(0);
    const scroll = await sourceList.evaluate(list => list.scrollTop);
    let writes = 0;
    page.on("request", request => {
      if (request.method() === "POST" && request.url().endsWith("/lanes/reorder")) writes++;
    });
    const drag = async () => {
      const from = await source.boundingBox();
      const to = await target.boundingBox();
      if (!from || !to) throw new Error("Missing lane header");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2, { steps: 4 });
      await page.mouse.move(to.x + to.width - 20, to.y + to.height / 2, { steps: 12 });
      await page.mouse.move(to.x + to.width - 19, to.y + to.height / 2);
      const preview = page.locator(".lane-drag-preview");
      await expect(preview.locator(".ticket-card").first()).toHaveAttribute("data-ticket-id", String(first.id));
      expect(await preview.locator(".ticket-card").count()).toBeLessThan(10);
      expect((await preview.boundingBox())!.height).toBeLessThanOrEqual(420);
      expect(await sourceList.evaluate(list => list.scrollTop)).toBe(scroll);
    };
    await drag();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.locator(".lane-drag-preview")).toHaveCount(0);
    await expect(page.locator("#lane-board .lane").first()).toHaveAttribute("data-lane-id", String(f.source));
    expect(writes).toBe(0);

    await drag();
    await page.mouse.up();
    await expect.poll(() => writes).toBe(1);
    await expect.poll(async () => {
      const read = await (await page.request.get(f.boardUrl)).json();
      return read.lanes.map((item: { id: number }) => item.id);
    }).toEqual([f.target, f.source, f.small, f.done]);
    await page.reload();
    await expect(page.locator("#lane-board .lane").first()).toHaveAttribute("data-lane-id", String(f.target));
  } finally { await f.close(); }
});

test("archive expansion and filtered drops keep the logical Kanban order", async ({ page }) => {
  const f = await fixture(page);
  try {
    const archivedIds = [];
    for (let index = 0; index < 10; index++) {
      const created = await page.request.post(`${f.boardUrl}/tickets`, {
        data: { laneId: f.source, title: "Archived source " + index, isArchived: true },
      });
      expect(created.status(), await created.text()).toBe(201);
      archivedIds.push((await created.json()).id);
    }
    await page.locator("#include-archived-filter").check();
    const source = lane(page, f.source);
    await expect(source).toHaveAttribute("data-kanban-window", "209");
    const expand = source.locator(".inactive-ticket-summary-button");
    await expand.click();
    const archived = source.locator(".inactive-ticket-summary-list .ticket-card").last();
    const movingArchived = Number(await archived.getAttribute("data-ticket-id"));
    expect(archivedIds).toContain(movingArchived);
    await archived.scrollIntoViewIfNeeded();
    const [small] = await f.ordered(f.small);
    await beginCardDrag(page, movingArchived, small.id);
    await page.mouse.up();
    await expect.poll(async () => (await f.read(movingArchived)).laneId).toBe(f.small);
    expect((await f.read(movingArchived)).isArchived).toBe(true);
    await page.locator("#search-input").fill("Card");
    await expect(source).toHaveAttribute("data-kanban-window", "206");
    await expect(source.locator(".inactive-ticket-summary")).toHaveCount(0);
    await scrollTo(source, 0.5);
    await twoFrames(page);
    const [, next] = await visibleIds(source);
    await beginCardDrag(page, small.id, next);
    await page.mouse.up();
    await expect.poll(async () => {
      const ids = (await f.ordered(f.source)).map(ticket => ticket.id);
      return ids.indexOf(next) - ids.indexOf(small.id);
    }).toBe(1);
    await page.reload();
    expect((await f.read(small.id)).laneId).toBe(f.source);
  } finally { await f.close(); }
});
