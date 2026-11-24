import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { startTestApp, updateTicket } from "./helpers.js";

const createdAt = "2026-01-24T00:00:00.000Z";
const heading = (page: Page) => page.locator(".group-detail-heading");
const openOnly = (page: Page) => page.getByRole("button", { name: "Open only", exact: true });
const row = (page: Page, id: number) => page.locator(`[data-group-row-id="${id}"]`);
const title = (page: Page, id: number) => page.locator(`[data-group-ticket="${id}"]`);
const remove = (page: Page, id: number) => page.locator(`[data-group-remove="${id}"]`);
const archive = (page: Page) => page.locator('[data-group-action="archive"]');
const groupChoice = (page: Page, name: string) => page.locator(".group-choice").filter({ hasText: name });

function ticket(id: number, title: string, { groupId = 1, done = false, archived = false, parentTicketId = null }:
  { groupId?: number | null; done?: boolean; archived?: boolean; parentTicketId?: number | null } = {}) {
  return { id, title, laneId: done ? 2 : 1, priority: 2, position: id, groupId, isResolved: done,
    isArchived: archived, parentTicketId, bodyMarkdown: "Original description", tags: [], comments: [], blockerIds: [] };
}

async function importBoard(request: APIRequestContext, baseUrl: string, name: string, groups: string[], tickets: ReturnType<typeof ticket>[]) {
  const response = await request.post(baseUrl + "/api/boards/import", { data: {
    formatVersion: 2, board: { name },
    lanes: [{ id: 1, name: "Working", position: 0, isCompletionLane: false }, { id: 2, name: "Accepted", position: 1, isCompletionLane: true }],
    groups: groups.map((name, index) => ({ id: index + 1, name, descriptionMarkdown: "", createdAt, updatedAt: createdAt })),
    tags: [], tickets,
  } });
  expect(response.status(), await response.text()).toBe(201);
  const { board, lanes } = await response.json();
  return { id: board.id as number, openLane: lanes[0].id as number, doneLane: lanes[1].id as number };
}

async function stored(request: APIRequestContext, baseUrl: string, path: string) {
  const response = await request.get(baseUrl + "/api" + path);
  expect(response.ok()).toBe(true);
  return response.json();
}

async function select(page: Page, name: string) {
  await groupChoice(page, name).click();
  await expect(heading(page)).toContainText(name);
}

test("Group open-only keeps contextual parents inert, composes with archive, and persists per board", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const launch = await importBoard(page.request, baseUrl, "Launch", ["Readiness", "Completed only", "Archived only", "Empty Group"], [
      ticket(1, "Resolved parent", { done: true }),
      ticket(2, "Open child", { parentTicketId: 1 }),
      ticket(3, "Resolved child", { done: true, parentTicketId: 1 }),
      ticket(4, "Open family"),
      ticket(5, "Hidden resolved child", { done: true, parentTicketId: 4 }),
      ticket(6, "Open archived", { archived: true }),
      ticket(7, "Done archived", { done: true, archived: true }),
      ticket(8, "Archived parent", { archived: true }),
      ticket(9, "Open child of archived parent", { parentTicketId: 8 }),
      ticket(10, "Resolved archived parent", { done: true, archived: true }),
      ticket(11, "Open child of resolved archived parent", { parentTicketId: 10 }),
      ticket(12, "Only finished", { groupId: 2, done: true }),
      ticket(13, "Only archived", { groupId: 3, archived: true }),
      ticket(14, "Ungrouped open", { groupId: null }),
      ticket(15, "Ungrouped finished", { groupId: null, done: true }),
    ]);
    const qa = await importBoard(page.request, baseUrl, "Quality", ["QA checks"], [
      ticket(1, "QA open"), ticket(2, "QA finished", { done: true }),
    ]);
    const url = `${baseUrl}/boards/${launch.id}/group`;
    await page.goto(url);
    await expect(heading(page)).toContainText("Readiness");
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "false");
    await expect(title(page, 1)).toBeVisible();
    await expect(title(page, 3)).toBeVisible();
    await expect(row(page, 8)).toHaveClass(/group-ticket-context/);
    await expect(remove(page, 8)).toBeVisible();
    const before = await stored(page.request, baseUrl, `/boards/${launch.id}/export`);
    const progress = await heading(page).locator(".group-ticket-count").innerText();

    await openOnly(page).press("Enter");
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "true");
    await expect(openOnly(page)).toBeFocused();
    await expect(title(page, 2)).toBeVisible();
    await expect(title(page, 3)).toHaveCount(0);
    await expect(title(page, 5)).toHaveCount(0);
    await expect(heading(page).locator(".group-ticket-count")).toHaveText(progress);
    for (const id of [1, 8, 10]) {
      await expect(row(page, id)).toHaveClass(/group-ticket-context/);
      await expect(row(page, id).locator("button, a[href]")).toHaveCount(0);
    }
    await expect(row(page, 1)).toContainText("Resolved parent · shown for context");

    const { id: groupId } = (await stored(page.request, baseUrl, `/boards/${launch.id}/groups?status=all`)).groups[0];
    const preview = page.waitForResponse(response => response.url() === `${baseUrl}/api/boards/${launch.id}/group-memberships/preview` &&
      response.request().method() === "POST");
    await remove(page, 4).click();
    const impact = await (await preview).json();
    expect(impact.changedTicketIds).toEqual([4, 5]);
    expect(impact.tickets).toContainEqual(expect.objectContaining({ id: 5, parentTicketId: 4 }));
    await page.locator("#ux-cancel-button").click();
    await expect(remove(page, 4)).toBeFocused();
    expect((await stored(page.request, baseUrl, "/tickets/5")).groupId).toBe(groupId);

    await archive(page).click();
    await expect(archive(page)).toHaveAttribute("aria-expanded", "true");
    await expect(title(page, 6)).toBeVisible();
    await expect(title(page, 7)).toHaveCount(0);
    await expect(title(page, 8)).toBeVisible();
    await expect(row(page, 10).locator("button, a[href]")).toHaveCount(0);
    await openOnly(page).click();
    await expect(title(page, 7)).toBeVisible();
    await openOnly(page).click();
    await expect(title(page, 7)).toHaveCount(0);

    await page.locator('[data-group-action="all"]').first().click();
    await select(page, "Completed only");
    await expect(page.locator(".group-empty")).toContainText(/completed|resolved|no open/i);
    await expect(title(page, 12)).toHaveCount(0);
    await select(page, "Archived only");
    await expect(page.locator(".group-empty")).toContainText(/archived/i);
    await archive(page).click();
    await expect(title(page, 13)).toBeVisible();
    await select(page, "Empty Group");
    await expect(page.locator(".group-empty")).toContainText(/add or create/i);
    await select(page, "No Group");
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "true");
    await expect(title(page, 14)).toBeVisible();
    await expect(title(page, 15)).toHaveCount(0);
    await expect(heading(page).locator(".group-ticket-count")).toHaveText("2 total");

    await page.goto(`${baseUrl}/boards/${qa.id}/group`);
    await expect(heading(page)).toContainText("QA checks");
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: /QA finished/ })).toBeVisible();
    await page.goto(`${baseUrl}/boards/${launch.id}/list`);
    await expect(page.locator('[data-open-ticket-id="15"]')).toBeVisible();
    await expect(openOnly(page)).not.toBeVisible();
    await page.goto(url);
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "true");
    await expect(title(page, 2)).toBeVisible();
    await page.reload();
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "true");
    await expect(title(page, 1)).toHaveCount(0);
    expect(await stored(page.request, baseUrl, `/boards/${launch.id}/export`)).toEqual(before);
  } finally { await close(); }
});

test("completing tickets updates focus, No Group remains selected when filtered empty, and SSE preserves a body draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await importBoard(page.request, baseUrl, "Review", [], [
      ticket(1, "First review", { groupId: null }), ticket(2, "Second review", { groupId: null }),
    ]);
    const url = `${baseUrl}/boards/${board.id}/group`;
    const connection = page.waitForResponse(response => response.url() === `${baseUrl}/api/boards/${board.id}/events`);
    await page.goto(url);
    await connection;
    await expect(heading(page)).toContainText("No Group");
    await openOnly(page).press("Enter");
    await title(page, 1).press("Enter");
    await page.locator("#header-edit-button").click();
    const draft = page.locator("#ticket-body");
    await draft.fill("An unsubmitted draft");
    await draft.press("Home");
    await draft.press("ArrowRight");
    const caret = await draft.evaluate(element => (element as HTMLTextAreaElement).selectionStart);

    await updateTicket(page.request, baseUrl, 1, { laneId: board.doneLane });
    await draft.press("Escape");
    await expect(page.locator("#ux-title")).toHaveText("Discard changes?");
    await page.locator("#ux-cancel-button").click();
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue("An unsubmitted draft");
    expect(await draft.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(caret);
    await draft.press("Escape");
    await page.locator("#ux-submit-button").click();
    await expect(page).toHaveURL(url);
    await expect(title(page, 2)).toBeFocused();
    await expect(title(page, 1)).toHaveCount(0);
    expect(await stored(page.request, baseUrl, "/tickets/1")).toMatchObject({ isResolved: true, bodyMarkdown: "Original description", groupId: null });

    await title(page, 2).press("Enter");
    await page.locator("#header-edit-button").click();
    await page.locator("#ticket-lane").selectOption(String(board.doneLane));
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#ticket-view-meta")).toContainText("Lane: Accepted");
    await expect(page.locator("#editor-form")).toHaveJSProperty("inert", false);
    await page.keyboard.press("Escape");
    await expect(heading(page)).toContainText("No Group");
    await expect(page.locator(".group-empty")).toContainText(/completed|resolved|no open/i);
    await expect(openOnly(page)).toBeFocused();
    expect(await stored(page.request, baseUrl, "/tickets/2")).toMatchObject({ isResolved: true, groupId: null });

    await page.reload();
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".group-empty")).toBeVisible();
    await updateTicket(page.request, baseUrl, 1, { laneId: board.openLane });
    await expect(title(page, 1)).toBeVisible();
    expect(await stored(page.request, baseUrl, "/tickets/1")).toMatchObject({ isResolved: false, groupId: null });
  } finally { await close(); }
});

test("virtual Group applies open-only across pages and skips reference parents in search", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await importBoard(page.request, baseUrl, "Volume", ["Launch check"], [
      ticket(1, "Resolved launch family", { done: true }),
      ticket(2, "Earlier closed child", { done: true, parentTicketId: 1 }),
      ticket(3, "An archived child", { archived: true, parentTicketId: 1 }),
      ...Array.from({ length: 998 }, (_, index) => ticket(index + 4, `Working item ${index + 4}`)),
      ticket(1002, "Late open child", { parentTicketId: 1 }),
      ticket(1003, "Closed after page boundary", { done: true }),
    ]);
    const pageRequests: URL[] = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname === `/api/boards/${board.id}/group-tickets` && url.searchParams.has("groupId")) pageRequests.push(url);
    });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator(".group-ticket-window")).toHaveCount(1);
    expect(pageRequests.some(url => url.searchParams.has("cursor"))).toBe(true);

    await openOnly(page).press("Enter");
    await expect(openOnly(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".group-ticket-window")).toHaveCount(1);
    await expect(row(page, 1)).toHaveClass(/group-ticket-context/);
    await expect(row(page, 1).locator("button, a[href]")).toHaveCount(0);
    await expect(title(page, 2)).toHaveCount(0);
    await expect(title(page, 3)).toHaveCount(0);
    expect(await page.locator(".group-ticket-window-row").count()).toBeLessThan(80);

    const search = page.getByRole("searchbox", { name: "Find tickets in this view" });
    const openMatch = page.getByRole("button", { name: "Open matching ticket" });
    const searchStatus = page.locator(".group-window-search-status");
    await search.fill("Resolved launch family");
    await search.press("Enter");
    await expect(searchStatus).toHaveText("No matching tickets");
    await expect(openMatch).toBeDisabled();
    await search.fill("Closed after page boundary");
    await search.press("Enter");
    await expect(searchStatus).toHaveText("No matching tickets");
    await expect(openMatch).toBeDisabled();
    await search.fill("Late open child");
    await search.press("Enter");
    await expect(openMatch).toBeEnabled();
    await expect(page.locator("[data-group-search-match]")).toHaveAttribute("data-group-window-id", "1002");
    await openMatch.press("Enter");
    await expect(page.locator("#editor-header-title")).toHaveText("Late open child");
    await page.keyboard.press("Escape");
    await expect(title(page, 1002)).toBeFocused();
    await page.getByRole("button", { name: "Clear ticket search" }).click();

    await title(page, 1002).focus();
    await updateTicket(page.request, baseUrl, 1002, { laneId: board.doneLane });
    await expect(page.locator(".group-ticket-window")).toHaveCount(0);
    await expect(page.locator(".group-ticket-row")).toHaveCount(998);
    await expect(row(page, 1)).toHaveCount(0);
    await expect(title(page, 4)).toBeFocused();
    expect(await stored(page.request, baseUrl, "/tickets/1002")).toMatchObject({ isResolved: true, parentTicketId: 1 });
  } finally { await close(); }
});
