import { expect, test, type Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTag, createTicket, startTestApp } from "./helpers.js";

async function chooseCompletion(page: Page, mode: "both" | "open" | "resolved") {
  const clear = page.locator("[data-status-clear]");
  if (await clear.isVisible()) await clear.click();
  if (mode === "both") return;
  const toggle = page.locator("#status-filter .filter-menu-edge-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator(`[data-status-filter="${mode === "open" ? "resolved" : "open"}"]`).click();
}

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

for (const locale of ["en-US", "ja-JP"]) {
  test(`${locale}: completion and archive filters intersect, preserve selections and leave Group independent`, async ({ browser }) => {
    const context = await browser.newContext({ locale, viewport: { width: 1280, height: 844 } });
    const page = await context.newPage();
    const f = await fixture(page);
    try {
      const before = await f.read();
      await page.goto(`${f.baseUrl}/boards/${f.board.id}/list`);
      const japanese = locale === "ja-JP";
      await expect(page.locator("#include-archived-filter")).toHaveAccessibleName(japanese ? "アーカイブを含める" : "Include archived tickets");
      await expect(page.locator('#status-filter [data-status-filter="archived"]')).toHaveCount(0);
      for (const mode of ["both", "open", "resolved"] as const) {
        await chooseCompletion(page, mode);
        for (const archived of [false, true]) {
          await page.locator("#include-archived-filter").setChecked(archived);
          const expected = f.tickets.filter(t => (mode === "both" || t.isResolved === (mode === "resolved")) && (archived || !t.isArchived));
          await expect(page.locator(".list-row")).toHaveCount(expected.length);
          const ids = await page.locator(".list-row [data-list-ticket-id]").evaluateAll(inputs => inputs.map(e => Number(e.getAttribute("data-list-ticket-id"))).sort((a,b) => a-b));
          expect(ids).toEqual(expected.map(t => t.id).sort((a,b) => a-b));
        }
      }
      // Checkbox and completion selection survive reload and remain shared with Kanban.
      await page.reload();
      await expect(page.locator("#include-archived-filter")).toBeChecked();
      await expect(page.locator("#status-filter-summary")).toHaveText(japanese ? "完了" : "Resolved");
      await expect(page.locator(".list-row")).toHaveCount(2);
      await page.locator('[data-view-mode="kanban"]').click();
      await expect(page.locator(".ticket-card")).toHaveCount(2);
      await page.locator('[data-view-mode="group"]').click();
      await expect(page.locator(".group-ticket-row")).toHaveCount(2);
      await expect(page.locator("#group-board")).toContainText("Focus open visible");
      await expect(page.locator("#group-board")).toContainText("Focus done visible");
      await page.locator('[data-group-action="archive"]').click();
      await expect(page.locator(".group-ticket-row")).toHaveCount(4);
      await page.locator('[data-view-mode="list"]').click();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await page.locator("#reset-filters-button").click();
      await expect(page.locator("#include-archived-filter")).not.toBeChecked();
      await expect(page.locator(".list-row")).toHaveCount(2);
      expect(await f.read()).toEqual(before);
    } finally { await f.close(); await context.close(); }
  });

  test(`${locale}: conflicting lane and completion explain the empty state and clear only the chosen condition`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const f = await fixture(page);
    try {
      await page.goto(`${f.baseUrl}/boards/${f.board.id}/list`);
      await page.locator("#search-input").fill("Focus");
      await page.locator("#tag-filter").selectOption("focus");
      await page.locator("#priority-filter .filter-menu-edge-toggle").click();
      await page.locator('[data-priority-filter="high"]').click();
      await page.locator("#include-archived-filter").check();
      await chooseCompletion(page, "open");
      await page.locator("#lane-filter").selectOption(String(f.done.id));
      await expect(page.locator("#list-board .empty-state")).toContainText("Accepted");
      await expect(page.locator('[data-empty-include-status="resolved"]')).toBeVisible();
      // Including archives must not bypass the incompatible completion condition.
      await expect(page.locator(".list-row")).toHaveCount(0);
      await page.locator('[data-empty-include-status="resolved"]').click();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await expect(page.locator("#lane-filter")).toHaveValue(String(f.done.id));
      await chooseCompletion(page, "open");
      await page.locator("[data-empty-clear-lane]").click();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await expect(page.locator("#lane-filter")).toHaveValue("");
      await expect(page.locator("#status-filter-summary")).toHaveText(locale === "ja-JP" ? "未完了" : "Open");
      await chooseCompletion(page, "resolved");
      await page.locator("#lane-filter").selectOption(String(f.todo.id));
      await expect(page.locator('[data-empty-include-status="open"]')).toBeVisible();
      await page.locator('[data-empty-include-status="open"]').click();
      await expect(page.locator(".list-row")).toHaveCount(2);
      await expect(page.locator("#search-input")).toHaveValue("Focus");
      await expect(page.locator("#tag-filter")).toHaveValue("focus");
      await expect(page.locator('[data-priority-filter="high"]')).toHaveClass(/active/);
      await expect(page.locator("#include-archived-filter")).toBeChecked();
      await page.reload();
      await expect(page.locator(".list-row")).toHaveCount(2);
    } finally { await f.close(); await context.close(); }
  });
}

test("legacy archive selections migrate without losing completion choice and explicit new false takes precedence", async ({ page }) => {
  const f = await fixture(page);
  try {
    await page.goto(`${f.baseUrl}/boards/${f.board.id}/list`);
    await expect(page.locator(".list-row")).toHaveCount(2);
    for (const entry of [
      { status: ["open", "archived"], expected: "Open", count: 2, archived: true },
      { status: ["resolved", "archived"], expected: "Resolved", count: 2, archived: true },
      { status: ["archived"], expected: "Open + Resolved", count: 4, archived: true },
      { status: ["open"], expected: "Open", count: 1, archived: false },
      { status: ["open", "archived"], includeArchived: false, expected: "Open", count: 1, archived: false },
    ]) {
      await page.evaluate(({ boardId, entry }) => {
        localStorage.setItem("kanbalone:ui-preferences", JSON.stringify({ version: 1, activeBoardId: boardId, boards: { [boardId]: { viewMode: "list", filters: { q: "", lane: "", tag: "", priority: [], status: entry.status, ...(entry.includeArchived === undefined ? {} : { includeArchived: entry.includeArchived }) } } } }));
      }, { boardId: f.board.id, entry });
      await page.reload();
      await expect(page.locator(".list-row")).toHaveCount(entry.count);
      await expect(page.locator("#status-filter-summary")).toHaveText(entry.expected);
      await expect(page.locator("#include-archived-filter")).toBeChecked({ checked: entry.archived });
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
      if (width <= 900) await page.locator(".archive-filter").scrollIntoViewIfNeeded();
      const geometry = () => page.evaluate(() => ["#status-filter", ".archive-filter", "#reset-filters-button"].map(selector => {
        const r = document.querySelector(selector)!.getBoundingClientRect(); const scroll = document.querySelector(".toolbar-filters")!.scrollLeft; return { x: r.x + scroll, y: r.y, width: r.width, height: r.height };
      }));
      const before = await geometry();
      await page.locator("#include-archived-filter").check();
      await expect(page.locator(".list-row")).toHaveCount(4);
      expect(await geometry()).toEqual(before);
      const overflow = await page.locator(".toolbar").evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      expect(overflow.scroll).toBeLessThanOrEqual(overflow.width + 1);
      // Checking the input can scroll its focus target independently of the label.
      // Bring the whole label back into view to verify horizontal reachability.
      if (width <= 900) await page.locator(".archive-filter").scrollIntoViewIfNeeded();
      // Compact toolbar intentionally scrolls horizontally; verify the interacted label is reachable.
      for (const selector of width <= 900 ? [".archive-filter"] : ["#status-filter", ".archive-filter"]) {
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
      const settled = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      for (const width of [1440, 980, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.locator('[data-view-mode="list"]').click();
        await expect(page.locator(".list-row")).toHaveCount(2);
        // Expansion is kept constant through the three views; archived checkbox stays separate.
        const edge = page.locator("#status-filter .filter-menu-edge-toggle");
        if (await edge.getAttribute("aria-expanded") !== "true") await edge.click();
        await expect(page.locator("#status-filter .filter-menu-options")).toBeVisible();
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
