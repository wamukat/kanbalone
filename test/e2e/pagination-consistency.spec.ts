import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp, updateTicket } from "./helpers.js";

test("Kanban never renders mixed lane revisions when a ticket moves between requests", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const fixture = await createBoard(page.request, baseUrl, {name:"Revision consistency",laneNames:["todo","doing"]});
    const boardId = fixture.board.id, from = fixture.lanes[0].id, to = fixture.lanes[1].id;
    const ticket = await createTicket(page.request, baseUrl, boardId, {laneId:from,title:"Moving ticket"});
    // Isolate the paging consistency guard: deliberately suppress SSE's independent refresh.
    await page.route("**/api/boards/*/events", route => route.abort());
    await page.goto(`${baseUrl}/boards/${boardId}`);
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`)).toHaveCount(1);
    await page.evaluate(id => {
      const marker = { duplicateSeen:false };
      Object.assign(window,{pagingConsistency:marker});
      new MutationObserver(() => {
        if (document.querySelectorAll(`.ticket-card[data-ticket-id="${id}"]`).length > 1) marker.duplicateSeen = true;
      }).observe(document.querySelector(".lane-board")!,{childList:true,subtree:true});
    },ticket.id);
    let releaseMove!: () => void;
    const moved = new Promise<void>(resolve => {releaseMove = resolve;});
    let capturedOld = false;
    const requests: string[] = [];
    await page.route("**/api/boards/*/tickets?**", async route => {
      const query = new URL(route.request().url()).searchParams;
      if (query.get("q") !== "Moving") { await route.continue(); return; }
      requests.push(query.get("lane_id") ?? "none");
      if (query.get("lane_id") === String(from) && !capturedOld) {
        capturedOld = true;
        const old = await route.fetch();
        await updateTicket(page.request,baseUrl,ticket.id,{laneId:to});
        releaseMove();
        await route.fulfill({response:old});
      } else if (query.get("lane_id") === String(to)) {
        await moved;
        await route.fulfill({response:await route.fetch()});
      } else await route.continue();
    });
    await page.locator("#search-input").fill("Moving");
    await expect(page.locator(`.ticket-list[data-lane-id="${to}"] .ticket-card`)).toHaveCount(1);
    await expect(page.locator(`.ticket-list[data-lane-id="${from}"] .ticket-card`)).toHaveCount(0);
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`)).toHaveCount(1);
    expect(requests.filter(id => id === String(from)).length).toBeGreaterThanOrEqual(2);
    expect(requests.filter(id => id === String(to)).length).toBeGreaterThanOrEqual(2);
    expect(await page.evaluate(() => (window as unknown as {pagingConsistency:{duplicateSeen:boolean}}).pagingConsistency.duplicateSeen)).toBe(false);
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json()).laneId).toBe(to);
  } finally { await close(); }
});
