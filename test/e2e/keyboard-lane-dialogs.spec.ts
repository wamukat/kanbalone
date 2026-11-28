import { expect, test, type Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, showCurrentTicket } from "./helpers.js";
const title = (page: Page, id: number, view: string) => page.locator(view === "list" ? `.list-ticket-link[data-open-ticket-id="${id}"]` : `.ticket-card[data-ticket-id="${id}"] .ticket-link`);
const ux = (page: Page) => page.locator("#ux-dialog");
const destination = (page: Page) => page.locator("[data-keyboard-move-lane]");
for (const view of ["kanban", "list"]) {
  test(`M moves only the focused ticket and persists completion (${view})`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    try {
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard move", laneNames: ["Todo", "Doing"] });
      const done = await createCompletionLane(page.request, baseUrl, board.id);
      const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Focused work" });
      const other = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Other work" });
      await page.goto(`${baseUrl}/boards/${board.id}${view === "list" ? "/list" : ""}`);
      const target = title(page, item.id, view);
      await expect(target).toBeVisible();
      if (view === "list") await page.locator(`[data-list-ticket-id="${other.id}"]`).check();
      await target.focus();
      await page.keyboard.press("m");
      await expect(destination(page)).toBeFocused();
      await expect(page.locator("#ux-submit-button")).toBeDisabled();
      await page.keyboard.press("Control+Enter");
      await expect(ux(page)).toHaveJSProperty("open", true);
      await destination(page).selectOption(String(lanes[1].id));
      await page.keyboard.press("Tab");
      await expect(page.locator("#ux-submit-button")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.locator("#ux-dismiss-button")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(target).toBeFocused();
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).laneId).toBe(lanes[0].id);
      await page.keyboard.press("m");
      await destination(page).selectOption(String(lanes[1].id));
      await page.keyboard.press("Control+Enter");
      await expect(ux(page)).toHaveJSProperty("open", false);
      await expect(target).toBeFocused();
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).laneId).toBe(lanes[1].id);
      if (view === "list") await expect(page.locator(`[data-list-ticket-id="${other.id}"]`)).toBeChecked();
      await page.keyboard.press("m");
      await destination(page).selectOption(String(done.id));
      await page.keyboard.press("Meta+Enter");
      await expect(ux(page)).toHaveJSProperty("open", false);
      await expect(target).toBeFocused();
      const stored = await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json();
      expect(stored.laneId).toBe(done.id); expect(stored.isResolved).toBe(true);
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${other.id}`)).json()).laneId).toBe(lanes[0].id);
      await page.reload(); await expect(target).toBeVisible();
    } finally { await close(); }
  });
}

test("move guards inputs/IME/repeat, preserves failed choice, rejects stale source, and never retries a saved move after refresh failure", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Move guards", laneNames: ["Todo", "Doing", "Review"] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Focused work" });
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    const target = title(page, item.id, "list"); await expect(target).toBeVisible();
    await page.locator("#search-input").fill("m"); await expect(ux(page)).not.toBeVisible();
    await page.locator("#search-input").fill(""); await expect(target).toBeVisible(); await target.focus();
    for (const flags of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }]) {
      await target.dispatchEvent("keydown", { key: "m", bubbles: true, ...flags });
      await expect(ux(page)).not.toBeVisible();
    }
    await target.press("m"); await destination(page).selectOption(String(lanes[1].id));
    for (const flags of [{ repeat: true }, { isComposing: true }, { keyCode: 229 }, { shiftKey: true }, { altKey: true }]) {
      await destination(page).dispatchEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, ...flags });
      await expect(ux(page)).toBeVisible();
    }
    await destination(page).dispatchEvent("compositionstart"); await page.keyboard.press("Control+Enter"); await expect(ux(page)).toBeVisible();
    await destination(page).dispatchEvent("compositionend");
    await page.route(`**/api/tickets/${item.id}/position`, route => route.fulfill({ status: 503, json: { error: "Move unavailable" } }));
    await page.keyboard.press("Control+Enter"); await expect(page.locator("#ux-error")).toContainText("Move unavailable");
    await expect(destination(page)).toHaveValue(String(lanes[1].id)); await expect(destination(page)).toBeEnabled();
    await page.unroute(`**/api/tickets/${item.id}/position`);
    await page.request.patch(`${baseUrl}/api/tickets/${item.id}`, { data: { laneId: lanes[2].id } });
    await page.keyboard.press("Control+Enter"); await expect(page.locator("#ux-error")).toBeVisible();
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).laneId).toBe(lanes[2].id);
    await page.keyboard.press("Escape"); await expect(target).toBeFocused();
    await page.reload(); await target.focus(); await target.press("m"); await destination(page).selectOption(String(lanes[1].id));
    let writes = 0;
    await page.route(`**/api/tickets/${item.id}/position`, async route => { writes++; await route.continue(); });
    await page.route(`**/api/boards/${board.id}`, route => route.fulfill({ status: 503, json: { error: "Refresh unavailable" } }));
    await page.keyboard.press("Control+Enter");
    await expect(ux(page)).not.toBeVisible(); await expect(page.locator("#toast")).toContainText("Ticket moved, but the view could not refresh");
    expect(writes).toBe(1); expect((await (await page.request.get(`${baseUrl}/api/tickets/${item.id}`)).json()).laneId).toBe(lanes[1].id);
  } finally { await close(); }
});

test("shared confirmations keep safe initial focus, ignore close-only notices, and confirm once with either modifier", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Safe confirms", laneNames: ["Occupied", "Empty"] });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Keep" });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    const openDeletion = async (id: number) => {
      const lane = page.locator(`.lane[data-lane-id="${id}"]`);
      await lane.locator('[data-action="toggle-lane-actions"]').click();
      await lane.locator('[data-action="delete-lane"]').click();
      await expect(ux(page)).toBeVisible();
    };
    await openDeletion(lanes[0].id);
    await expect(page.locator("#ux-submit-button")).toBeHidden();
    await expect(page.locator("#ux-dismiss-button")).toBeFocused();
    await page.keyboard.press("Control+Enter"); await expect(ux(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await openDeletion(lanes[1].id);
    await expect(page.locator("#ux-dismiss-button")).toBeFocused();
    expect(await page.locator('#ux-submit-button').evaluate(el => !!(el.compareDocumentPosition(document.querySelector('#ux-dismiss-button')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    let requests = 0;
    await page.route(`**/api/lanes/${lanes[1].id}`, async route => {
      if (route.request().method() === 'DELETE') { requests++; await new Promise(resolve => setTimeout(resolve, 120)); }
      await route.continue();
    });
    await page.keyboard.press("Meta+Enter");
    await page.keyboard.press("Control+Enter");
    await expect(ux(page)).not.toBeVisible();
    expect(requests).toBe(1);
    expect((await (await page.request.get(`${baseUrl}/api/boards/${board.id}`)).json()).lanes.map((lane: { id: number }) => lane.id)).toEqual([lanes[0].id]);
  } finally { await close(); }
});

test("comment edit uses primary-first keys without submitting another form", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Comment keys", laneNames: ["Todo"] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Comment fixture" });
    const comment = await (await page.request.post(`${baseUrl}/api/tickets/${item.id}/comments`, { data: { bodyMarkdown: "Original" } })).json();
    await page.goto(`${baseUrl}/tickets/${item.id}`);
    await showCurrentTicket(page);
    await page.locator('[data-toggle-comment-actions]').click();
    await page.locator(`[data-edit-comment-id="${comment.id}"]`).click();
    const input = page.locator('[data-comment-edit-body]');
    await input.fill('Keyboard revision'); await input.press('Tab');
    await expect(page.locator('[data-save-comment-id]')).toBeFocused();
    await input.focus(); await input.press('Control+Enter');
    await expect(page.locator('.comment-display')).toContainText('Keyboard revision');
    const comments = await (await page.request.get(`${baseUrl}/api/tickets/${item.id}/comments`)).json();
    expect(comments.comments).toHaveLength(1); expect(comments.comments[0].bodyMarkdown).toBe('Keyboard revision');
    await page.locator('[data-toggle-comment-actions]').click(); await page.locator('[data-delete-comment-id]').click();
    await expect(page.locator('[data-cancel-comment-delete]')).toBeFocused();
    await page.keyboard.press('Meta+Enter');
    await expect(page.locator('.comment-item')).toHaveCount(0);
  } finally { await close(); }
});

test("a moved ticket outside the lane filter returns to search and late SSE keeps the restored focus", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Move filter", laneNames: ["Todo", "Doing"] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Move focus" });
    const other = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Other" });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[1].id, title: "Filtered out" });
    const events = page.waitForResponse(r => r.url().endsWith(`/api/boards/${board.id}/events`) && r.ok());
    await page.goto(`${baseUrl}/boards/${board.id}/list`); await events;
    await page.locator('#lane-filter-button').click();
    await page.locator('#lane-filter-options').getByRole('checkbox', { name: 'Todo', exact: true }).check();
    await page.keyboard.press('Escape');
    await expect(page.locator('.list-ticket-link')).toHaveCount(2);
    await title(page, item.id, 'list').focus(); await page.keyboard.press('m');
    await destination(page).selectOption(String(lanes[1].id)); await page.keyboard.press('Control+Enter');
    await expect(ux(page)).not.toBeVisible(); await expect(title(page, item.id, 'list')).toHaveCount(0);
    await expect(page.locator('#search-input')).toBeFocused();
    const refresh = page.waitForResponse(r => r.url().includes(`/api/boards/${board.id}/tickets?`) && r.ok());
    await page.request.patch(`${baseUrl}/api/tickets/${other.id}`, { data: { title: 'Late SSE update' } }); await refresh;
    await expect(title(page, other.id, 'list')).toContainText('Late SSE update');
    await expect(page.locator('#search-input')).toBeFocused();
  } finally { await close(); }
});

test("keyboard move reveals its focused ticket at the end of a virtual destination lane", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const response = await page.request.post(`${baseUrl}/api/boards/import`, { data: {
      formatVersion: 2, board: { name: "Virtual move" },
      lanes: [{ id: 1, name: "Source", position: 0, isCompletionLane: false }, { id: 2, name: "Target", position: 1, isCompletionLane: false }],
      tags: [], groups: [],
      tickets: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, laneId: i === 0 ? 1 : 2, position: i,
        title: `Virtual ${i}`, bodyMarkdown: "", priority: 2, isResolved: false, isArchived: false,
        parentTicketId: null, groupId: null, tags: [], comments: [], blockerIds: [] })),
    } });
    expect(response.status()).toBe(201);
    const fixture = await response.json();
    const original = (await (await page.request.get(`${baseUrl}/api/boards/${fixture.board.id}/tickets?q=Virtual%200`)).json()).tickets[0];
    const targetLane = fixture.lanes.find((lane: { name: string }) => lane.name === 'Target');
    await page.goto(`${baseUrl}/boards/${fixture.board.id}`);
    const focused = title(page, original.id, 'kanban'); await expect(focused).toBeVisible(); await focused.focus(); await focused.press('m');
    await destination(page).selectOption(String(targetLane.id)); await page.keyboard.press('Control+Enter');
    await expect(ux(page)).not.toBeVisible(); await expect(focused).toBeFocused(); await expect(focused).toBeInViewport();
    const list = page.locator(`.ticket-list[data-lane-id="${targetLane.id}"]`);
    await expect(list).toHaveAttribute('data-kanban-window', '1000');
    expect(await list.locator('.ticket-card').count()).toBeLessThan(40);
    expect(await list.evaluate(el => el.scrollTop)).toBeGreaterThan(1000);
    const refresh = page.waitForResponse(r => r.url().includes(`/api/boards/${fixture.board.id}/tickets`) && r.ok());
    await page.request.patch(`${baseUrl}/api/tickets/${original.id}`, { data: { title: 'Virtual moved with late update' } }); await refresh;
    await expect(focused).toHaveText('Virtual moved with late update'); await expect(focused).toBeFocused();
  } finally { await close(); }
});

for (const locale of ['ja', 'en']) {
  for (const width of [1440, 390]) {
    test(`all relation types fit and remain keyboard reachable (${locale}, ${width})`, async ({ page }) => {
      const { baseUrl, close } = await startTestApp(page);
      try {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript(language => localStorage.setItem('kanbalone:language', language), locale);
        const { board, lanes } = await createBoard(page.request, baseUrl, { name: 'Relation menu', laneNames: ['Todo'] });
        const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: 'Relations' });
        await page.goto(`${baseUrl}/tickets/${item.id}`);
        await page.locator('#header-edit-button').click();
        const add = page.locator('#ticket-relation-add-button');
        await add.click();
        const options = page.locator('#ticket-relation-add-options');
        await expect(options).toBeVisible();
        // Inspect full rectangles, not just visibility of the clipped element.
        await expect.poll(() => options.evaluate(element => {
          const optionBox = element.getBoundingClientRect();
          const parentBox = element.parentElement!.getBoundingClientRect();
          return [...element.querySelectorAll('button')].every(button => {
            const b = button.getBoundingClientRect();
            return b.width > 0 && b.left >= Math.max(optionBox.left, parentBox.left) - 1
              && b.right <= Math.min(optionBox.right, parentBox.right, innerWidth) + 1
              && b.top >= optionBox.top - 1 && b.bottom <= optionBox.bottom + 1;
          });
        })).toBe(true);
        await add.focus();
        for (const kind of ['blocker', 'related', 'parent', 'child']) {
          await page.keyboard.press('Tab');
          await expect(page.locator(`[data-relation-add-type="${kind}"]`)).toBeFocused();
        }
        await page.keyboard.press('Enter');
        await expect(page.locator('#ticket-child-search')).toBeFocused();
        await expect(options).toBeHidden();
      } finally { await close(); }
    });
  }
}
