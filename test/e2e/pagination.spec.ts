import { expect, test, type Page } from "@playwright/test";
import { createBoard, createTicket, startTestApp, updateTicket } from "./helpers.js";

async function seed(page: Page, baseUrl: string) {
  const tickets = Array.from({ length: 260 }, (_, index) => {
    const id = index + 1, done = id > 140;
    return { id, laneId: done ? 2 : 1, position: id,
      title: id === 1 ? "Boundary parent" : id === 205 ? "Boundary child" : `Ticket ${String(id).padStart(3, "0")}`,
      bodyMarkdown: "Synthetic paging test", priority: id % 7 === 0 ? 4 : 2,
      isResolved: done, isArchived: false, parentTicketId: id === 205 ? 1 : null,
      groupId: 1, tags: [], comments: [], blockerIds: [] };
  });
  const response = await page.request.post(`${baseUrl}/api/boards/import`, { data: {
    formatVersion: 2, board: { name: "Paging GUI" },
    lanes: [{ id: 1, name: "todo", position: 0, isCompletionLane: false }, { id: 2, name: "done", position: 1, isCompletionLane: true }],
    groups: [{ id: 1, name: "Delivery", descriptionMarkdown: "", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }], tags: [], tickets,
  } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
function ticketCollection(url: string) {
  return /^\/api\/boards\/\d+\/(?:tickets|group-tickets|list-ticket-references)$/.test(new URL(url).pathname);
}
const lane = (page: Page, id: number) => page.locator(`.ticket-list[data-lane-id="${id}"]`);

for (const locale of ["en", "ja"]) {
  test(`all GUI collections use bounded pages and preserve cross-page hierarchy (${locale})`, async ({ page }) => {
    test.setTimeout(60_000);
    const { baseUrl, close } = await startTestApp(page);
    try {
      await page.addInitScript(lang => localStorage.setItem("kanbalone:language", lang), locale);
      const fixture = await seed(page, baseUrl), boardId = fixture.board.id;
      const requested: string[] = [];
      page.on("request", req => { if (ticketCollection(req.url())) requested.push(req.url()); });
      await page.goto(`${baseUrl}/boards/${boardId}/list`);
      await expect(page.locator(".list-row").first()).toBeVisible();
      await page.locator("#search-input").fill("Boundary");
      await expect(page.locator(".list-row")).toHaveCount(2);
      await expect(page.locator(".list-row")).toContainText(["Boundary parent", "Boundary child"]);
      await page.locator('[data-view-mode="group"]').click();
      await expect(page.locator("[data-group-ticket]")).toHaveCount(260);
      await expect(page.locator('.group-ticket-family').filter({ hasText: "Boundary parent" }).locator('.group-ticket-child')).toContainText("Boundary child");
      const groupRequests = requested.map(url => new URL(url)).filter(url => url.pathname.endsWith("/group-tickets"));
      expect(groupRequests.some(url => url.searchParams.has("cursor"))).toBe(true);
      for (const url of requested) {
        const limit = Number(new URL(url).searchParams.get("limit"));
        expect(limit, url).toBeGreaterThan(0); expect(limit, url).toBeLessThanOrEqual(200);
      }
      const persisted = (await (await page.request.get(`${baseUrl}/api/boards/${boardId}/tickets?archived=all`)).json()).tickets;
      expect(persisted).toHaveLength(260);
      expect(persisted.find((t: { id: number }) => t.id === 205).parentTicketId).toBe(1);
    } finally { await close(); }
  });
}

test("completion pages preserve expansion and scroll on updates, and priority filters before limit", async ({ page }) => {
  test.setTimeout(60_000);
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    const fixture = await seed(page, baseUrl), boardId = fixture.board.id, doneId = fixture.lanes.find((l: { isCompletionLane: boolean }) => l.isCompletionLane).id;
    const events = page.waitForResponse(r => r.url().endsWith(`/boards/${boardId}/events`));
    await page.goto(`${baseUrl}/boards/${boardId}`); await events;
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(5);
    await page.locator(".completion-show-more").click();
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(55);
    await lane(page, doneId).evaluate(el => { el.scrollTop = 350; });
    const scroll = await lane(page, doneId).evaluate(el => el.scrollTop);
    await updateTicket(page.request, baseUrl, 141, { title: "Renamed completion" });
    await expect(lane(page, doneId).locator('[data-ticket-id="141"]')).toContainText("Renamed completion");
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(55);
    await expect.poll(() => lane(page, doneId).evaluate(el => el.scrollTop)).toBe(scroll);
    const moved = await page.request.patch(`${baseUrl}/api/tickets/140/transition`, { data: { laneName: "done" } });
    expect(moved.ok()).toBe(true);
    await expect(lane(page, doneId).locator(".ticket-card").first()).toHaveAttribute("data-ticket-id", "140");
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(55);
    await page.locator('[data-filter-expand="priority"]').first().click();
    await page.locator('[data-priority-filter="urgent"]').click();
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(5);
    const ids = await lane(page, doneId).locator(".ticket-card").evaluateAll(cards => cards.map(c => Number((c as HTMLElement).dataset.ticketId)));
    expect(ids.every(id => id % 7 === 0)).toBe(true);
    const stored = await (await page.request.get(`${baseUrl}/api/tickets/140`)).json();
    expect(stored.laneId).toBe(doneId); expect(stored.isResolved).toBe(true);
  } finally { await close(); }
});

test("failed completion append keeps visible rows and permits retry", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const fixture = await seed(page, baseUrl), doneId = fixture.lanes.find((l: { isCompletionLane: boolean }) => l.isCompletionLane).id;
    await page.goto(`${baseUrl}/boards/${fixture.board.id}`);
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(5);
    let failed = false;
    await page.route("**/api/boards/*/tickets?**", async route => {
      const q = new URL(route.request().url()).searchParams;
      if (!failed && q.has("cursor") && q.get("order") === "completed_desc") {
        failed = true; await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected append failure" }) });
      } else await route.continue();
    });
    await page.locator(".completion-show-more").click();
    await expect.poll(() => failed).toBe(true);
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(5);
    await expect(page.locator(".completion-show-more")).toBeEnabled();
    await page.locator(".completion-show-more").click();
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(55);
  } finally { await close(); }
});

test("collection restarts once on stale cursor without losing or duplicating Group tickets", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const fixture = await seed(page, baseUrl);
    let conflicts = 0;
    await page.route(url => url.pathname === `/api/boards/${fixture.board.id}/group-tickets`, async route => {
      const q = new URL(route.request().url()).searchParams;
      if (q.has("cursor") && conflicts === 0) {
        conflicts++; await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "ticket list changed; restart pagination" }) });
      } else await route.continue();
    });
    await page.goto(`${baseUrl}/boards/${fixture.board.id}/group`);
    await expect(page.locator("[data-group-ticket]")).toHaveCount(260);
    expect(conflicts).toBe(1);
    const ids = await page.locator("[data-group-ticket]").evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.groupTicket));
    expect(new Set(ids).size).toBe(260);
  } finally { await close(); }
});

test("deselecting the last completion state restores the existing all-state filter with bounded requests", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const fixture = await seed(page, baseUrl);
    await page.goto(`${baseUrl}/boards/${fixture.board.id}/list`);
    await expect(page.locator(".list-row").first()).toBeVisible();
    await page.locator('[data-filter-expand="status"]').first().click();
    await Promise.all([
      page.waitForResponse(r => ticketCollection(r.url()) && new URL(r.url()).searchParams.get("resolved") === "true"),
      page.locator('[data-status-filter="open"]').click(),
    ]);
    await expect(page.locator(".list-row").first()).toContainText("Ticket 147");
    const requests: string[] = [];
    page.on("request", req => { if (ticketCollection(req.url())) requests.push(req.url()); });
    await page.locator('[data-status-filter="resolved"]').click();
    await expect(page.locator(".list-row").first()).toContainText("Ticket 007");
    await expect(page.locator("[data-status-filter].active")).toHaveCount(2);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.every(url => Number(new URL(url).searchParams.get("limit")) <= 200 && Number(new URL(url).searchParams.get("limit")) > 0)).toBe(true);
  } finally { await close(); }
});

test("priority-filtered List preserves the label and link of a blocker outside the filter", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const fixture = await seed(page, baseUrl);
    await updateTicket(page.request, baseUrl, 2, { priority: 3, blockerIds: [240] });
    await updateTicket(page.request, baseUrl, 240, { priority: 1 });
    await page.goto(`${baseUrl}/boards/${fixture.board.id}/list`);
    await expect(page.locator(".list-row").first()).toBeVisible();
    await page.locator('[data-filter-expand="priority"]').first().click();
    const referenceRequests: URL[] = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname === `/api/boards/${fixture.board.id}/list-ticket-references`) referenceRequests.push(url);
    });
    await page.locator('[data-priority-filter="high"]').click();
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator(".list-row")).toContainText("Ticket 002");
    expect(referenceRequests.some(url => url.searchParams.has("cursor"))).toBe(true);
    for (const url of referenceRequests) {
      const limit = Number(url.searchParams.get("limit"));
      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(200);
    }
    await expect(page.locator('.list-row [data-open-ticket-id="240"]')).toHaveText("#240");
    await expect(page.locator('.list-row [data-open-ticket-id="240"]')).toHaveAttribute("title", "Ticket 240");
    await page.locator('.list-row [data-open-ticket-id="240"]').click();
    await expect(page.locator("#editor-header-title")).toHaveText("Ticket 240");
    await page.keyboard.press("Escape");
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator(".list-row")).toContainText("Ticket 002");
  } finally { await close(); }
});

test("saving a List ticket comment keeps its archived blocker label with lightweight references", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Comment references", laneNames: ["Todo"] });
    const laneId = lanes[0].id;
    const blocker = await createTicket(page.request, baseUrl, board.id, { laneId, title: "Archived blocker" });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId, title: "Blocked ticket" });
    await updateTicket(page.request, baseUrl, ticket.id, { blockerIds: [blocker.id] });
    await updateTicket(page.request, baseUrl, blocker.id, { isArchived: true });
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await page.locator(`.list-ticket-link[data-open-ticket-id="${ticket.id}"]`).click();
    const blockerLink = page.locator(`.list-relation-ticket-link[data-open-ticket-id="${blocker.id}"]`);
    await expect(blockerLink).toHaveCount(0);
    await page.locator("#comment-compose-toggle").click();
    await page.locator("#comment-body").fill("Comment refresh check");

    const archiveReads: string[] = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith(`/api/boards/${board.id}/`) && url.searchParams.get("archived") === "all") {
        archiveReads.push(url.pathname);
      }
    });
    await page.locator("#save-comment-button").click();
    await expect(page.locator("#comment-save-state")).toHaveText("Comment saved");
    await expect(page.locator("#ticket-comments")).toContainText("Comment refresh check");
    await expect(blockerLink).toHaveAttribute("title", "Archived blocker");
    expect(archiveReads).toEqual([`/api/boards/${board.id}/list-ticket-references`]);
    const persisted = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(persisted.comments.map((comment: { bodyMarkdown: string }) => comment.bodyMarkdown)).toContain("Comment refresh check");
    expect(persisted.blockerIds).toEqual([blocker.id]);
  } finally { await close(); }
});

test("stale completion continuation recovers without collapsing expanded rows or moving the viewport", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const fixture = await seed(page, baseUrl), doneId = fixture.lanes.find((l: { isCompletionLane: boolean }) => l.isCompletionLane).id;
    await page.goto(`${baseUrl}/boards/${fixture.board.id}`);
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(5);
    await page.locator(".completion-show-more").click();
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(55);
    let conflicts = 0;
    await page.route("**/api/boards/*/tickets?**", async route => {
      const q = new URL(route.request().url()).searchParams;
      if (q.has("cursor") && q.get("order") === "completed_desc" && conflicts === 0) {
        conflicts++; await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "ticket list changed; restart pagination" }) });
      } else await route.continue();
    });
    // Keyboard focus scrolls the existing bottom action into view; preserving this position
    // matters when a failed cursor causes a complete reload behind the same action.
    await page.locator(".completion-show-more").focus();
    const scroll = await lane(page, doneId).evaluate(el => el.scrollTop);
    await page.keyboard.press("Enter");
    await expect(lane(page, doneId).locator(".ticket-card")).toHaveCount(105);
    expect(conflicts).toBe(1);
    await expect.poll(() => lane(page, doneId).evaluate(el => el.scrollTop)).toBe(scroll);
    const ids = await lane(page, doneId).locator(".ticket-card").evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.ticketId));
    expect(new Set(ids).size).toBe(105);
  } finally { await close(); }
});
