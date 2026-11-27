import { expect, test, type Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTag, createTicket, startTestApp } from "./helpers.js";

async function fixture(page: Page) {
  const app = await startTestApp(page);
  const { board, lanes } = await createBoard(page.request, app.baseUrl, { name: "Completion filter", laneNames: ["Todo"] });
  const done = await createCompletionLane(page.request, app.baseUrl, board.id);
  const tag = await createTag(page.request, app.baseUrl, board.id, { name: "focus" });
  const group = await (await page.request.post(`${app.baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Release" } })).json();
  const tickets = [];
  for (const resolved of [false, true]) for (const isArchived of [false, true]) {
    tickets.push(await createTicket(page.request, app.baseUrl, board.id, {
      laneId: resolved ? done.id : lanes[0].id,
      title: `Focus ${resolved ? "done" : "open"} ${isArchived ? "archived" : "visible"}`,
      isArchived, tagIds: [tag.id], priority: 3, groupId: group.id,
    }));
  }
  const read = async () => (await page.request.get(`${app.baseUrl}/api/boards/${board.id}/tickets?archived=all`)).json();
  return { ...app, board, todo: lanes[0], done, tickets, read };
}

async function setOldBoardFilters(page: Page, boardId: number, filters: Record<string, unknown>, versioned = true) {
  await page.evaluate(({ boardId, filters, versioned }) => {
    const filterExpansion = { status: true, priority: true };
    const boards = { [boardId]: { viewMode: "list", filters, filterExpansion } };
    localStorage.setItem("kanbalone:ui-preferences", JSON.stringify(versioned
      ? { version: 1, activeBoardId: boardId, boards }
      : { activeBoardId: boardId, viewMode: "list", filtersByBoardId: { [boardId]: filters },
          filterExpansionByBoardId: { [boardId]: filterExpansion } }));
  }, { boardId, filters, versioned });
}

for (const locale of ["en-US", "ja-JP"]) {
  test(`${locale}: a saved completion lane works after upgrade and archives remain independent of Group`, async ({ browser }) => {
    const context = await browser.newContext({ locale, viewport: { width: 1280, height: 844 } });
    const page = await context.newPage();
    const f = await fixture(page);
    try {
      const before = await f.read();
      await page.goto(`${f.baseUrl}/boards/${f.board.id}/list`);
      await expect(page.locator(".list-row")).toHaveCount(2);
      await setOldBoardFilters(page, f.board.id, {
        q: "Focus", lane: String(f.done.id), tag: "focus", priority: ["high"],
        status: ["open"], includeArchived: true,
      });
      await page.reload();

      const archived = page.locator("#include-archived-filter");
      await expect(page.locator("#lane-filter")).toHaveValue(String(f.done.id));
      await expect(page.locator(".list-row")).toContainText(["Focus done visible", "Focus done archived"]);
      await expect(page.locator(".list-row")).toHaveCount(2);
      await expect(page.locator("#status-filter")).toHaveCount(0);
      await expect(page.locator("#search-input")).toHaveValue("Focus");
      await expect(page.locator("#tag-filter")).toHaveValue("focus");
      await expect(page.locator('[data-priority-filter="high"]')).toHaveClass(/active/);
      await expect(archived).toHaveAccessibleName(locale === "ja-JP" ? "アーカイブを含める" : "Include archived tickets");
      await expect(archived).toBeChecked();
      await archived.uncheck();
      await expect(page.locator(".list-row")).toHaveCount(1);
      await expect(page.locator(".list-row")).toContainText("Focus done visible");
      await archived.check();

      await page.locator('[data-view-mode="kanban"]').click();
      await expect(page.locator(".ticket-card")).toHaveCount(4);
      await expect(page.locator("#lane-board")).toContainText("Focus open archived");
      await expect(page.locator("#lane-board")).toContainText("Focus open visible");
      await expect(page.locator("#lane-board")).toContainText("Focus done archived");
      await page.locator('[data-view-mode="group"]').click();
      await expect(page.locator(".group-ticket-row")).toHaveCount(2);
      await expect(page.locator("#group-board")).toContainText("Focus done visible");
      await page.locator('[data-group-action="open-only"]').click();
      await expect(page.locator(".group-ticket-row")).toHaveCount(1);
      await expect(page.locator(".group-ticket-row")).toContainText("Focus open visible");
      await page.locator('[data-group-action="archive"]').click();
      await expect(page.locator(".group-ticket-row")).toHaveCount(2);
      await expect(page.locator("#group-board")).toContainText("Focus open archived");
      await expect(page.locator("#group-board")).not.toContainText("Focus done visible");

      await page.locator('[data-view-mode="list"]').click();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await expect(archived).toBeChecked();
      await page.locator("#reset-filters-button").click();
      await expect(page.locator("#lane-filter")).toHaveValue("");
      await expect(archived).not.toBeChecked();
      await expect(page.locator(".list-row")).toContainText(["Focus open visible", "Focus done visible"]);
      await page.reload();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await page.locator('[data-view-mode="group"]').click();
      await expect(page.locator('[data-group-action="open-only"]')).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".group-ticket-row")).toHaveCount(1);
      await expect(page.locator(".group-ticket-row")).toContainText("Focus open visible");
      const response = await page.request.post(`${f.baseUrl}/api/custom-views`, { data: {
        name: "Finished work", scope: "selected", boardIds: [f.board.id],
        rules: [{ boardId: f.board.id, mode: "all", tagIds: [] }],
        completion: "done", showBody: false, showLatestComment: false,
      } });
      expect(response.status()).toBe(201);
      const view = await response.json();
      await page.goto(`${f.baseUrl}/views/${view.id}`);
      await expect(page.locator("[data-view-ticket]")).toHaveCount(1);
      await expect(page.locator("[data-view-ticket]")).toContainText("Focus done visible");
      const savedView = await page.request.get(`${f.baseUrl}/api/custom-views/${view.id}`);
      expect(await savedView.json()).toMatchObject({ completion: "done" });
      expect(await f.read()).toEqual(before);
    } finally { await f.close(); await context.close(); }
  });
}

test("old completion selections are ignored while legacy archive inclusion still migrates", async ({ page }) => {
  const f = await fixture(page);
  try {
    await page.goto(`${f.baseUrl}/boards/${f.board.id}/list`);
    await expect(page.locator(".list-row")).toHaveCount(2);
    for (const { status, includeArchived, archived, versioned } of [
      { status: ["open", "archived"], archived: true, versioned: false },
      { status: ["resolved", "archived"], archived: true, versioned: true },
      { status: ["archived"], archived: true, versioned: true },
      { status: ["resolved"], archived: false, versioned: true },
      { status: [], archived: false, versioned: true },
      { status: ["invalid"], archived: false, versioned: true },
      { status: ["open", "archived"], includeArchived: false, archived: false, versioned: true },
    ]) {
      await setOldBoardFilters(page, f.board.id, {
        status, ...(includeArchived === undefined ? {} : { includeArchived }),
      }, versioned);
      await page.reload();
      await expect(page.locator(".list-row")).toHaveCount(archived ? 4 : 2);
      await expect(page.locator("#list-board")).toContainText("Focus open visible");
      await expect(page.locator("#list-board")).toContainText("Focus done visible");
      await expect(page.locator("#include-archived-filter")).toBeChecked({ checked: archived });
      await expect(page.locator("#priority-filter")).toHaveClass(/is-expanded/);
      const saved = await page.evaluate(boardId =>
        JSON.parse(localStorage.getItem("kanbalone:ui-preferences")!).boards[String(boardId)], f.board.id);
      expect(saved.filters).not.toHaveProperty("status");
      expect(saved.filterExpansion).toEqual({ priority: true });
      expect(saved.filters.includeArchived).toBe(archived);
    }
  } finally { await f.close(); }
});

for (const width of [1280, 980, 390]) for (const locale of ["en-US", "ja-JP"]) {
  test(`${locale}: archive toggle preserves full label and toolbar geometry at ${width}px in dark mode`, async ({ browser }) => {
    const context = await browser.newContext({ locale, viewport: { width, height: 844 }, colorScheme: "dark" });
    const page = await context.newPage();
    const f = await fixture(page);
    try {
      await page.goto(`${f.baseUrl}/boards/${f.board.id}/list`);
      await page.locator("#search-input").fill("Focus"); // Keep reset visible for both measurements.
      await expect(page.locator(".list-row")).toHaveCount(2);
      if (width <= 900) await page.locator(".toolbar-filters").evaluate(el => { el.scrollLeft = el.scrollWidth; });
      const geometry = () => page.evaluate(() => ["#priority-filter", ".archive-filter", "#reset-filters-button"].map(selector => {
        const r = document.querySelector(selector)!.getBoundingClientRect(); const scroll = document.querySelector(".toolbar-filters")!.scrollLeft; return { x: r.x + scroll, y: r.y, width: r.width, height: r.height };
      }));
      const before = await geometry();
      await page.locator("#include-archived-filter").check();
      await expect(page.locator(".list-row")).toHaveCount(4);
      expect(await geometry()).toEqual(before);
      const overflow = await page.locator(".toolbar").evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
      // Checking the input can scroll its focus target independently of the label.
      // Scroll to the end, like a horizontal swipe, to verify full reachability.
      if (width <= 900) await page.locator(".toolbar-filters").evaluate(el => { el.scrollLeft = el.scrollWidth; });
      // Compact toolbar intentionally scrolls horizontally; verify the interacted label is reachable.
      for (const selector of width <= 900 ? [".archive-filter"] : ["#priority-filter", ".archive-filter"]) {
        const r = await page.locator(selector).boundingBox();
        expect(r!.x).toBeGreaterThanOrEqual(0);
        expect(r!.x + r!.width).toBeLessThanOrEqual(width);
      }
      const label = await page.locator(".archive-filter").boundingBox();
      for (const selector of ["#include-archived-filter", ".archive-filter > span"]) {
        const r = await page.locator(selector).boundingBox();
        expect(r!.x).toBeGreaterThanOrEqual(label!.x);
        expect(r!.x + r!.width).toBeLessThanOrEqual(label!.x + label!.width + 1);
      }
      const reset = await page.locator("#reset-filters-button").boundingBox();
      const overlapX = Math.min(label!.x + label!.width, reset!.x + reset!.width) - Math.max(label!.x, reset!.x);
      const overlapY = Math.min(label!.y + label!.height, reset!.y + reset!.height) - Math.max(label!.y, reset!.y);
      expect(overlapX <= 0 || overlapY <= 0).toBe(true);
    } finally { await f.close(); await context.close(); }
  });
}

test("archive checkbox controls whether archiving keeps ticket details open, and default empty board offers creation", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Archive details", laneNames: ["Todo"] });
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await expect(page.locator("#list-board .empty-state")).toContainText("No tickets yet");
    await expect(page.locator("[data-empty-create-ticket]")).toBeVisible();
    await expect(page.locator("#list-board .empty-state")).not.toContainText("No matching tickets");
    for (const includeArchived of [false, true]) {
      const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Archive with ${includeArchived}` });
      await page.reload();
      await page.locator("#include-archived-filter").setChecked(includeArchived);
      await page.getByRole("button", { name: `#${ticket.id} ${ticket.title}`, exact: true }).click();
      await page.locator("#header-edit-button").click();
      await page.locator("#archive-ticket-button").click();
      await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", includeArchived);
      const stored = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
      expect(stored.isArchived).toBe(true);
      if (includeArchived) {
        await expect(page.locator("#editor-header-state")).toContainText("Archived");
        await page.keyboard.press("Escape");
        await expect(page.locator(".list-row").filter({ hasText: ticket.title })).toBeVisible();
      } else {
        await expect(page.locator(".list-row").filter({ hasText: ticket.title })).toHaveCount(0);
      }
    }
  } finally { await close(); }
});

for (const locale of ["en-US", "ja-JP"]) {
  test(`${locale}: List Group and Kanban preserve the content start across toolbar wrapping and sidebar resizing`, async ({ browser }) => {
    test.setTimeout(60_000); // Nine view transitions plus sidebar and viewport changes.
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const f = await fixture(page);
    try {
      await page.goto(`${f.baseUrl}/boards/${f.board.id}/list`);
      const top = async (selector: string) => (await page.locator(selector).boundingBox())!.y;
      const settled = () => page.evaluate(async () => {
        // Two frames can still be inside the sidebar grid transition on CI.
        await Promise.all(document.querySelector(".shell")!.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
      for (const width of [1440, 980, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('[data-view-mode="list"]').click();
        await expect(page.locator(".list-row")).toHaveCount(2);
        // Expansion is kept constant through the three views; archived checkbox stays separate.
        const edge = page.locator("#priority-filter .filter-menu-edge-toggle");
        if (await edge.getAttribute("aria-expanded") !== "true") await edge.click();
        await expect(page.locator("#priority-filter .filter-menu-options")).toBeVisible();
        await settled();
        const listTop = await top("#list-board");
        await page.locator('[data-view-mode="group"]').click();
        await expect(page.locator(".group-ticket-row")).toHaveCount(2);
        await expect.poll(async () => Math.abs(await top("#group-board") - listTop)).toBeLessThanOrEqual(2);
        await page.locator('[data-view-mode="kanban"]').click();
        await expect(page.locator(".ticket-card")).toHaveCount(2);
        await expect.poll(async () => Math.abs(await top("#lane-board") - listTop)).toBeLessThanOrEqual(2);
      }
      await page.locator('[data-view-mode="list"]').click();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await page.locator("#sidebar-toggle-button").click();
      await settled();
      const collapsedTop = await top("#list-board");
      // View controls live in the sidebar: open it to choose a view, then
      // collapse it again before comparing the content at the same width.
      await page.locator("#sidebar-reopen-button").click();
      await page.locator('[data-view-mode="group"]').click();
      await expect(page.locator(".group-ticket-row")).toHaveCount(2);
      await page.locator("#sidebar-toggle-button").click();
      await expect.poll(async () => Math.abs(await top("#group-board") - collapsedTop)).toBeLessThanOrEqual(2);
      await page.locator("#sidebar-reopen-button").click();
      await page.locator('[data-view-mode="list"]').click();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await settled();
      const restoredTop = await top("#list-board");
      await page.locator('[data-view-mode="kanban"]').click();
      await expect(page.locator(".ticket-card")).toHaveCount(2);
      await expect.poll(async () => Math.abs(await top("#lane-board") - restoredTop)).toBeLessThanOrEqual(2);
    } finally { await f.close(); await context.close(); }
  });
}
