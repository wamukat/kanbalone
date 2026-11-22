import { expect, test } from "@playwright/test";
import { startTestApp, updateTicket } from "./helpers.js";

test("List selection spans pages and virtual rows, then drops filtered and moved tickets before bulk archive", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const imported = await page.request.post(`${baseUrl}/api/boards/import`, { data: {
      formatVersion: 2,
      board: { name: "Selection across pages" },
      lanes: [
        { id: 1, name: "Todo", position: 0, isCompletionLane: false },
        { id: 2, name: "Review", position: 1, isCompletionLane: false },
      ],
      tags: [], groups: [],
      tickets: Array.from({ length: 240 }, (_, index) => ({
        id: index + 1, laneId: index % 2 + 1, position: index,
        title: `Selection ticket ${String(index + 1).padStart(3, "0")}`,
        bodyMarkdown: "Synthetic selection regression", priority: 2,
        isResolved: false, isArchived: false, parentTicketId: null, groupId: null,
        tags: [], comments: [], blockerIds: [],
      })),
    } });
    expect(imported.status(), await imported.text()).toBe(201);
    const fixture = await imported.json();
    const boardId = fixture.board.id;
    const todo = fixture.lanes.find((lane: { name: string }) => lane.name === "Todo");
    const review = fixture.lanes.find((lane: { name: string }) => lane.name === "Review");
    const original = (await (await page.request.get(`${baseUrl}/api/boards/${boardId}/tickets`)).json()).tickets;
    const todoIds: number[] = original.filter((ticket: { laneId: number }) => ticket.laneId === todo.id)
      .map((ticket: { id: number }) => ticket.id);
    expect(todoIds).toHaveLength(120);

    let requestedNextPage = false;
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname === `/api/boards/${boardId}/tickets` && url.searchParams.has("cursor")) requestedNextPage = true;
    });
    const events = page.waitForResponse(response => response.url().endsWith(`/api/boards/${boardId}/events`));
    await page.goto(`${baseUrl}/boards/${boardId}/list`);
    await events;
    const selectAll = page.locator("#list-select-all");
    const selectedCount = page.locator(".list-selection-count").first();
    await expect(selectAll).toBeVisible();
    expect(requestedNextPage).toBe(true);
    expect(await page.locator(".list-row").count()).toBeLessThan(240);
    await selectAll.check();
    await expect(selectedCount).toHaveText("240 selected");
    await page.locator(".list-viewport").evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(page.locator(".list-ticket-title").last()).toHaveText("Selection ticket 240");
    await expect(page.locator("[data-list-ticket-id]:not(:checked)")).toHaveCount(0);
    await page.locator("[data-list-ticket-id]").last().uncheck();
    await expect(selectedCount).toHaveText("239 selected");
    await expect(selectAll).toHaveJSProperty("indeterminate", true);
    await selectAll.check();
    await expect(selectedCount).toHaveText("240 selected");
    await expect(selectAll).toHaveJSProperty("indeterminate", false);

    await page.locator("#lane-filter").selectOption(String(todo.id));
    await expect(selectedCount).toHaveText("120 selected");
    await expect(selectAll).toBeChecked();
    const movedId = todoIds[0];
    await updateTicket(page.request, baseUrl, movedId, { laneId: review.id });
    await expect(selectedCount).toHaveText("119 selected");

    const saved = page.waitForResponse(response => response.url().endsWith(`/api/boards/${boardId}/tickets/bulk-archive`)
      && response.request().method() === "POST");
    await page.locator('[data-bulk-archive="true"]').first().click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const expectedIds = todoIds.filter(id => id !== movedId).sort((a, b) => a - b);
    expect(response.request().postDataJSON().ticketIds.sort((a: number, b: number) => a - b)).toEqual(expectedIds);
    await expect(page.locator(".list-selection-count")).toHaveCount(0);
    const stored = (await (await page.request.get(`${baseUrl}/api/boards/${boardId}/tickets?archived=all`)).json()).tickets;
    expect(stored).toHaveLength(240);
    expect(stored.filter((ticket: { isArchived: boolean }) => ticket.isArchived)
      .map((ticket: { id: number }) => ticket.id).sort((a: number, b: number) => a - b)).toEqual(expectedIds);
    expect(stored.find((ticket: { id: number }) => ticket.id === movedId).laneId).toBe(review.id);
    expect(stored.every((ticket: { isResolved: boolean }) => !ticket.isResolved)).toBe(true);
  } finally { await close(); }
});
