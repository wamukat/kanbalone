import { test, expect, type Page } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

test("completion settings preserve drafts, review impacts and leave other settings usable", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Completion", laneNames: ["Acceptance", "Done"] });
    const lane = board.lanes[0];
    const active = await createTicket(page.request, baseUrl, board.board.id, { laneId: lane.id, title: "Awaiting acceptance" });
    const archived = await createTicket(page.request, baseUrl, board.board.id, { laneId: lane.id, title: "Archived work", isArchived: true });
    await page.goto(`${baseUrl}/boards/${board.board.id}`);
    await page.getByRole("button", { name: "Board settings", exact: true }).click();
    const settings = page.locator("#sidebar-lane-settings");
    await settings.getByRole("button", { name: "Set up", exact: true }).click();
    await settings.getByRole("checkbox", { name: "Acceptance", exact: true }).check();
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${active.id}`)).json()).isResolved).toBe(false);
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect(settings).toContainText("2 tickets will be resolved");
    await expect(settings).toContainText("Includes archived tickets");
    await settings.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(settings).toContainText("Not configured");
    await settings.getByRole("button", { name: "Set up", exact: true }).click();
    await settings.getByRole("checkbox", { name: "Acceptance", exact: true }).check();
    // An SSE refresh must not discard an in-progress selection.
    await page.request.patch(`${baseUrl}/api/lanes/${board.lanes[1].id}`, { data: { name: "Accepted" } });
    await expect(page.locator(".lane-title", { hasText: "Accepted" })).toBeVisible();
    await expect(settings.getByRole("checkbox", { name: "Acceptance", exact: true })).toBeChecked();
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await settings.getByRole("button", { name: "Resolve 2 tickets and apply", exact: true }).click();
    await expect(page.getByLabel("Completion lane", { exact: true })).toBeVisible();
    const ticket = await (await page.request.get(`${baseUrl}/api/tickets/${archived.id}`)).json();
    expect(ticket.isResolved).toBe(true); expect(ticket.isArchived).toBe(true);
    await settings.getByRole("button", { name: "Change", exact: true }).click();
    await settings.getByRole("checkbox", { name: "Acceptance", exact: true }).uncheck();
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect(settings).toContainText("2 resolved tickets will be reopened");
    await settings.getByRole("button", { name: "Reopen 2 tickets and apply", exact: true }).click();
    await expect(page.getByLabel("Completion lane", { exact: true })).toHaveCount(0);
    await expect(page.locator("#ux-dialog")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Rename board", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
    await expect(page.locator("#delete-board-button")).toBeVisible();
  } finally { await close(); }
});

async function addTicket(page: Page, title: string) {
  await page.getByRole("button", { name: "New ticket", exact: true }).first().click();
  await page.locator("#ticket-title").fill(title);
  await page.locator("#save-ticket-button").click();
  await expect(page.locator("#editor-dialog")).not.toBeVisible();
}

test("first ticket hint is nonblocking, leads to inline setup and stays dismissed", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "First", laneNames: ["Todo", "Done"] });
    await page.goto(`${baseUrl}/boards/${board.board.id}`);
    await expect(page.locator("#completion-hint")).toBeHidden();
    await addTicket(page, "First ticket");
    const hint = page.locator("#completion-hint");
    await expect(hint).toBeVisible();
    await expect(page.getByRole("button", { name: "First ticket", exact: true })).toBeVisible();
    await hint.getByRole("button", { name: "Set up", exact: true }).click();
    await expect(hint).toBeHidden();
    const settings = page.locator("#sidebar-lane-settings");
    await expect(settings.getByRole("checkbox", { name: "Done", exact: true })).toBeVisible();
    await settings.getByRole("checkbox", { name: "Done", exact: true }).check();
    await settings.getByRole("button", { name: "Save", exact: true }).click();
    await expect(settings.getByRole("button", { name: "Change", exact: true })).toBeVisible();
    await page.reload(); await expect(hint).toBeHidden();
    const another = await createBoard(page.request, baseUrl, { name: "Later", laneNames: ["Todo"] });
    await page.goto(`${baseUrl}/boards/${another.board.id}`);
    await addTicket(page, "One"); await expect(hint).toBeVisible();
    await hint.getByRole("button", { name: "Later", exact: true }).click();
    await addTicket(page, "Two"); await expect(hint).toBeHidden();
    await page.reload(); await expect(hint).toBeHidden();
  } finally { await close(); }
});
