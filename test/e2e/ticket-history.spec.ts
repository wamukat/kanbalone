import { expect, test } from "@playwright/test";

import { createBoard, createTicket, startTestApp, updateTicket, showCurrentTicket } from "./helpers.js";

test("activity shows recorded changes, opens the current comment and preserves Unicode text boundaries", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Recorded history", laneNames: ["Todo", "Review"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, {
      title: "Recovery guide", bodyMarkdown: "Verified 😀", laneId: lanes[0].id,
    });
    const ticketApi = `${baseUrl}/api/tickets/${ticket.id}`;
    await updateTicket(page.request, baseUrl, ticket.id, { bodyMarkdown: "Verified 😁", laneId: lanes[1].id, updater: "Operator" });
    const active = await (await page.request.post(`${ticketApi}/comments`, { data: { bodyMarkdown: "Original comment" } })).json();
    await page.request.patch(`${baseUrl}/api/comments/${active.id}`, { data: { bodyMarkdown: "Current comment" } });
    const deleted = await (await page.request.post(`${ticketApi}/comments`, { data: { bodyMarkdown: "Removed comment text" } })).json();
    await page.request.delete(`${baseUrl}/api/comments/${deleted.id}`);

    const detailsRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/activity\/\d+$/.test(new URL(request.url()).pathname)) detailsRequests.push(request.url());
    });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await showCurrentTicket(page);
    await page.locator("#activity-tab-button").click();
    const timeline = page.locator("#ticket-activity");
    const edit = timeline.locator(".activity-item", { hasText: "Operator" });
    await expect(edit).toContainText("Todo");
    await expect(edit).toContainText("Review");
    expect(detailsRequests).toEqual([]);
    await edit.getByText("Show text change", { exact: true }).press("Enter");
    await expect(edit.locator("mark")).toHaveText(["😀", "😁"]);
    expect(detailsRequests).toHaveLength(1);

    const removed = timeline.locator(".activity-item", { hasText: `Comment deleted #${deleted.id}` });
    await expect(removed.getByRole("button", { name: /Show current comment/ })).toHaveCount(0);
    await removed.getByText("Show deleted text", { exact: true }).click();
    await expect(removed.locator("pre")).toHaveText("Removed comment text");

    const original = timeline.locator(".activity-item", { hasText: `Comment added #${active.id}` });
    await expect(original).toContainText("Original comment");
    await original.getByRole("button", { name: `Show current comment #${active.id}` }).click();
    await expect(page.locator("#comments-tab-button")).toHaveAttribute("aria-selected", "true");
    const target = page.locator(`[data-comment-id="${active.id}"]`);
    await expect(target).toBeFocused();
    await expect(target).toContainText("Current comment");
  } finally { await close(); }
});

test("a failed activity list is distinct from an empty history", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "History availability", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { title: "Shows activity errors", laneId: lanes[0].id });
    const ticketApi = `${baseUrl}/api/tickets/${ticket.id}`;
    await page.request.post(`${ticketApi}/events`, { data: { source: "ci", kind: "check", title: "Check passed" } });
    await page.route(`${ticketApi}/activity?compact=true`, (route) =>
      route.fulfill({ status: 503, json: { error: "Simulated activity failure" } }));
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await showCurrentTicket(page);
    await page.locator("#activity-tab-button").click();
    const activity = page.locator("#ticket-activity");
    await expect(activity.getByRole("status")).toContainText("Could not load activity");
    await expect(activity).not.toContainText("No activity yet.");
    await expect(activity).toContainText("Check passed");
  } finally { await close(); }
});

test("late text for a closed ticket cannot appear in another ticket's activity", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let release = () => {};
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "History isolation", laneNames: ["Todo"] });
    const first = await createTicket(page.request, baseUrl, board.id, { title: "First history", laneId: lanes[0].id, bodyMarkdown: "First original" });
    const second = await createTicket(page.request, baseUrl, board.id, { title: "Second history", laneId: lanes[0].id });
    await updateTicket(page.request, baseUrl, first.id, { bodyMarkdown: "First ticket only" });
    const firstApi = `${baseUrl}/api/tickets/${first.id}`;
    const log = (await (await page.request.get(`${firstApi}/activity`)).json()).activity[0];
    const allowed = new Promise<void>((resolve) => { release = resolve; });
    const detailUrl = `${firstApi}/activity/${log.id}`;
    await page.route(detailUrl, async (route) => {
      await allowed;
      await route.fulfill({ json: log });
    });

    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await page.locator("#list-board").getByRole("button", { name: /First history/ }).click();
    await showCurrentTicket(page);
    await page.locator("#activity-tab-button").click();
    const requested = page.waitForRequest(detailUrl);
    await page.locator("#ticket-activity").getByText("Show text change", { exact: true }).click();
    await requested;
    await expect(page.locator("#ticket-activity")).toContainText("Loading recorded text...");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await page.locator("#list-board").getByRole("button", { name: /Second history/ }).click();
    await showCurrentTicket(page);
    await page.locator("#activity-tab-button").click();
    await expect(page.locator("#editor-header-id")).toHaveText(`#${second.id}`);
    const response = page.waitForResponse(detailUrl);
    release();
    await response;
    await expect(page.locator("#ticket-activity")).toContainText("Ticket created");
    await expect(page.locator("#ticket-activity")).not.toContainText("First ticket only");
  } finally {
    release();
    await close();
  }
});
