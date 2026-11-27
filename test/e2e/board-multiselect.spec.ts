import { expect, test } from "@playwright/test";
import { createBoard, createTag, createTicket, selectBoardFilter, startTestApp } from "./helpers.js";

test("board filters combine choices, keep the popup focused, and restore per-view settings", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes: [todo, doing, review] } = await createBoard(page.request, baseUrl, {
      name: "Multiple filters", laneNames: ["Todo", "Doing", "Review"],
    });
    const ui = await createTag(page.request, baseUrl, board.id, { name: "UI" });
    const performance = await createTag(page.request, baseUrl, board.id, { name: "Performance" });
    const bug = await createTag(page.request, baseUrl, board.id, { name: "Bug" });
    for (const [laneId, title, tagIds, isArchived] of [
      [todo.id, "UI and Performance", [ui.id, performance.id], false],
      [doing.id, "Doing with Performance", [performance.id], false],
      [doing.id, "Doing with Bug", [bug.id], false],
      [todo.id, "Untagged todo", [], false],
      [review.id, "Review with UI", [ui.id], false],
      [todo.id, "Archived UI", [ui.id], true],
    ] as const) {
      await createTicket(page.request, baseUrl, board.id, { laneId, title, tagIds, isArchived });
    }
    const tickets = page.locator(".list-ticket-title");
    const laneTrigger = page.locator("#lane-filter-button");
    const tagTrigger = page.locator("#tag-filter-button");
    const lanePanel = page.locator("#lane-filter-options");
    const tagPanel = page.locator("#tag-filter-options");
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await expect(tickets).toHaveCount(5);
    await laneTrigger.press("Enter");
    const todoChoice = lanePanel.getByRole("checkbox", { name: "Todo" });
    await expect(todoChoice).toBeFocused();
    await page.keyboard.press("Space");
    await expect(tickets).toHaveCount(2);
    await expect(todoChoice).toBeFocused();
    await lanePanel.getByRole("checkbox", { name: "Doing" }).check();
    await expect(tickets).toHaveCount(4);
    await expect(lanePanel).toBeVisible();

    await tagTrigger.click();
    await expect(lanePanel).toBeHidden();
    await tagPanel.getByRole("checkbox", { name: "UI", exact: true }).check();
    await tagPanel.getByRole("checkbox", { name: "Performance" }).check();
    await expect(tickets).toHaveText(["UI and Performance", "Doing with Performance"]);
    await tagPanel.getByRole("checkbox", { name: "Bug" }).check();
    await expect(tickets).toHaveCount(3);
    await expect(tagTrigger.locator(".board-filter-more")).toBeVisible();
    await expect(tagTrigger.locator(".board-filter-more")).toHaveText("+1");
    await expect(tagTrigger).toHaveAccessibleName(/Tag: .*UI/);
    for (const name of ["UI", "Performance", "Bug"]) {
      await expect(tagTrigger).toHaveAttribute("title", new RegExp(name));
    }
    await page.keyboard.press("Escape");
    await expect(tagTrigger).toBeFocused();
    await expect(tagPanel).toBeHidden();

    await page.locator("#include-archived-filter").click();
    await expect(tickets).toHaveCount(4);
    await expect(tickets).toContainText(["Archived UI"]);
    await page.reload();
    await expect(tickets).toHaveCount(4);
    await expect(tagTrigger.locator(".board-filter-more")).toHaveText("+1");
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(laneTrigger).toBeHidden();
    await expect(page.locator(".ticket-card", { hasText: "Review with UI" })).toHaveCount(1);
    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(tickets).toHaveCount(4);

    await tagTrigger.click();
    await tagPanel.getByRole("button", { name: "Clear selection" }).click();
    await expect(tagPanel).toBeVisible();
    await expect(tagPanel.getByRole("checkbox", { name: "Bug" })).toBeFocused();
    await expect(tickets).toContainText(["Untagged todo"]);
    await expect(tickets).not.toContainText(["Review with UI"]);
    await page.locator("#reset-filters-button").click();
    await expect(tagPanel).toBeHidden();
    await expect(laneTrigger).toHaveAccessibleName("Lane: All");
    await expect(tagTrigger).toHaveAccessibleName("Tag: All");
    await expect(page.locator("#include-archived-filter")).toHaveAttribute("aria-pressed", "false");
    await expect(tickets).toHaveCount(5);
  } finally { await close(); }
});

test("legacy literal tag names migrate to IDs and only missing choices are removed on refresh", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes: [todo, empty] } = await createBoard(page.request, baseUrl, {
      name: "Restored filters", laneNames: ["Todo", "Empty"],
    });
    const legacy = await createTag(page.request, baseUrl, board.id, { name: "UI, R&D" });
    const remove = await createTag(page.request, baseUrl, board.id, { name: "Remove me" });
    const selectedTicket = await createTicket(page.request, baseUrl, board.id, {
      laneId: todo.id, title: "Selected ticket", tagIds: [legacy.id],
    });
    await createTicket(page.request, baseUrl, board.id, { laneId: todo.id, title: "Untagged ticket" });
    await page.addInitScript(({ boardId, lane, tag }) => {
      const key = "kanbalone:ui-preferences";
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({
        version: 1, boards: { [boardId]: { viewMode: "list", filters: { lane, tag } } },
      }));
    }, { boardId: board.id, lane: String(todo.id), tag: legacy.name });
    const events = page.waitForResponse(response => response.url().endsWith(`/boards/${board.id}/events`));
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await events;
    const titles = page.locator(".list-ticket-title");
    await expect(titles).toHaveText([selectedTicket.title]);
    await selectBoardFilter(page, "lane", empty.name);
    await selectBoardFilter(page, "tag", remove.name);

    const tag = page.locator("#tag-filter-button");
    const panel = page.locator("#tag-filter-options");
    await tag.click();
    const legacyChoice = panel.getByRole("checkbox", { name: legacy.name, exact: true });
    await legacyChoice.focus();
    const update = await page.request.patch(`${baseUrl}/api/tags/${legacy.id}`, { data: { name: "Renamed UI" } });
    expect(update.ok()).toBe(true);
    const renamedChoice = panel.getByRole("checkbox", { name: "Renamed UI" });
    await expect(renamedChoice).toBeFocused();
    await expect(renamedChoice).toBeChecked();
    expect((await page.request.delete(`${baseUrl}/api/tags/${remove.id}`)).ok()).toBe(true);
    expect((await page.request.delete(`${baseUrl}/api/lanes/${empty.id}`)).ok()).toBe(true);
    await expect(renamedChoice).toBeFocused();
    await expect(tag).toHaveAccessibleName("Tag: Renamed UI");
    await expect(page.locator("#lane-filter-button")).toHaveAccessibleName("Lane: Todo");
    await expect(titles).toHaveText([selectedTicket.title]);
    await page.reload();
    const stored = await page.evaluate(boardId =>
      JSON.parse(localStorage.getItem("kanbalone:ui-preferences")!).boards[boardId].filters, board.id);
    expect(stored).toMatchObject({ laneIds: [todo.id], tagIds: [legacy.id] });
    expect(stored).not.toHaveProperty("legacyTagName");
    await expect(titles).toHaveText([selectedTicket.title]);

    expect((await page.request.delete(`${baseUrl}/api/tags/${legacy.id}`)).ok()).toBe(true);
    await expect(tag).toHaveAccessibleName("Tag: All");
    await expect(titles).toHaveCount(2);
  } finally { await close(); }
});
