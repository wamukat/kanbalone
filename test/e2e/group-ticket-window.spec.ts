import { expect, test, type Page } from "@playwright/test";
import { startTestApp, updateTicket } from "./helpers.js";

const title = (page: Page, id: number) => page.locator(`[data-group-ticket="${id}"]`);
const remove = (page: Page, id: number) => page.locator(`[data-group-remove="${id}"]`);
const viewport = (page: Page) => page.locator("#group-board");

async function openGroup(page: Page, baseUrl: string, { giant = true, ungrouped = false } = {}) {
  const count = giant ? 1201 : 1000;
  const date = "2026-01-01T00:00:00.000Z";
  const imported = await page.request.post(`${baseUrl}/api/boards/import`, { data: {
    formatVersion: 2,
    board: { name: "Virtual Group tickets" },
    lanes: [{ id: 1, name: "Todo", position: 0, isCompletionLane: false }],
    groups: ungrouped ? [] : [{ id: 1, name: "Delivery", descriptionMarkdown: "", createdAt: date, updatedAt: date }],
    tags: [{ id: 1, name: "Engineering releases and delivery", color: "#557766" }],
    tickets: Array.from({ length: count }, (_, index) => {
      const id = index + 1;
      return {
        id, laneId: 1, position: index, priority: 2, groupId: ungrouped ? null : 1,
        title: [10, 600, 1201].includes(id) ? `Release 2026 ticket ${id}`
          : id % 39 === 0 ? "Wrap this title across narrower Group content. ".repeat(4) + id
          : `Delivery ticket ${id}`,
        bodyMarkdown: "", isResolved: false, isArchived: giant ? id === 1 : id === count,
        parentTicketId: giant && id > 1 ? 1 : null,
        tags: id % 11 === 0 ? [1] : [], comments: [], blockerIds: [],
      };
    }),
  } });
  expect(imported.status(), await imported.text()).toBe(201);
  const { board } = await imported.json();
  const sse = page.waitForResponse(response => response.url().endsWith(`/api/boards/${board.id}/events`));
  await page.goto(`${baseUrl}/boards/${board.id}/group`);
  await sse;
  return board.id as number;
}

async function scrollToEnd(page: Page) {
  await viewport(page).evaluate(root => { root.scrollTop = root.scrollHeight; });
  await expect(title(page, 1201)).toBeInViewport();
}
async function scrollToStart(page: Page) {
  await viewport(page).evaluate(root => { root.scrollTop = 0; });
  await expect(title(page, 2)).toBeInViewport();
}
async function assertSmallWindow(page: Page) {
  expect(await page.locator(".group-ticket-window-row").count()).toBeLessThan(80);
}

test("large Group preserves parent-child geometry and native keyboard order across virtual windows", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openGroup(page, baseUrl);
    await expect(page.locator('[data-group-row-id="1"]')).toHaveClass(/group-ticket-context/);
    await expect(title(page, 1)).toHaveCount(0);
    await expect(title(page, 2).locator("xpath=ancestor::*[contains(@class,'group-ticket-child')]")).toHaveCount(1);
    await assertSmallWindow(page);
    await expect(title(page, 1201)).toHaveCount(0);

    await page.getByRole("button", { name: "Find tickets", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(remove(page, 1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(title(page, 2)).toBeFocused();
    await scrollToEnd(page);
    await expect(title(page, 2)).toBeFocused();
    await expect(title(page, 3)).toHaveCount(0);
    await page.keyboard.press("Tab");
    await expect(title(page, 3)).toBeFocused();
    await expect(title(page, 3)).toBeInViewport();

    await scrollToEnd(page);
    await title(page, 1201).focus();
    await page.keyboard.press("Tab");
    const footer = page.getByRole("button", { name: "Show archived tickets (1)" });
    await expect(footer).toBeFocused();
    await viewport(page).evaluate(root => { root.scrollTop = 0; });
    await expect(title(page, 1201)).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await expect(title(page, 1201)).toBeFocused();
    await expect(title(page, 1201)).toBeInViewport();
    await scrollToStart(page);
    await expect(title(page, 1201)).toBeFocused();
    await expect(title(page, 1200)).toHaveCount(0);
    await page.keyboard.press("Shift+Tab");
    await expect(title(page, 1200)).toBeFocused();
    await expect(title(page, 1200)).toBeInViewport();
    await assertSmallWindow(page);

    await viewport(page).evaluate(root => { root.scrollTop = (root.scrollHeight - root.clientHeight) / 2; });
    const anchor = async () => viewport(page).evaluate(async root => {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const top = root.getBoundingClientRect().top + root.clientTop;
      const item = Array.from(root.querySelectorAll(".group-ticket-window-row"))
        .find(row => row.getBoundingClientRect().bottom > top && row.getBoundingClientRect().top < top + root.clientHeight);
      return { id: item?.getAttribute("data-group-window-id"), offset: (item?.getBoundingClientRect().top ?? 0) - top };
    });
    const before = await anchor();
    expect(Number(before.id)).toBeGreaterThan(400);
    expect(Number(before.id)).toBeLessThan(800);
    await page.setViewportSize({ width: 1120, height: 900 });
    const resized = await anchor();
    expect(resized.id).toBe(before.id);
    expect(Math.abs(resized.offset - before.offset)).toBeLessThanOrEqual(1.5);
    await scrollToEnd(page);
    await anchor();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(title(page, 1201)).toBeInViewport();
    await expect.poll(() => viewport(page).evaluate(root => root.scrollHeight - root.clientHeight - root.scrollTop)).toBeLessThanOrEqual(2);
  } finally { await close(); }
});

test("Group window receives SSE, restores current focus after deletion and after a failed membership write", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const boardId = await openGroup(page, baseUrl);
    const input = page.getByRole("searchbox", { name: "Find tickets in this view" });
    await input.fill("#600");
    await input.press("Enter");
    await expect(title(page, 600)).toBeInViewport();
    await title(page, 600).focus();
    await updateTicket(page.request, baseUrl, 600, { title: "Updated elsewhere" });
    await expect(title(page, 600)).toContainText("Updated elsewhere");
    await expect(title(page, 600)).toBeFocused();
    await expect(title(page, 600)).toBeInViewport();
    const deleted = await page.request.delete(`${baseUrl}/api/tickets/600`);
    expect(deleted.ok()).toBe(true);
    await expect(title(page, 600)).toHaveCount(0);
    await expect(title(page, 601)).toBeFocused();
    await expect(title(page, 601)).toBeInViewport();

    await page.getByRole("button", { name: "Clear ticket search" }).click();
    await remove(page, 1).click();
    await expect(page.locator("#ux-dialog")).toBeVisible();
    await page.route(`**/api/boards/${boardId}/group-memberships`, route =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Save failed" }) }));
    await page.locator("#ux-submit-button").click();
    await expect(page.locator(".group-error")).toContainText("Save failed");
    await expect(remove(page, 1)).toBeFocused();
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/2`)).json();
    expect(saved.groupId).toBe(1);
  } finally { await close(); }
});

test("Group opts into row windows at one thousand displayed rows and restores the small view when folding archives", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await openGroup(page, baseUrl, { giant: false });
    await expect(page.locator(".group-ticket-row")).toHaveCount(999);
    await expect(page.locator(".group-ticket-window")).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Find tickets in this view" })).toHaveCount(0);
    const show = page.getByRole("button", { name: "Show archived tickets (1)" });
    await show.click();
    await expect(page.locator(".group-ticket-window")).toHaveCount(1);
    await expect(title(page, 1000)).toBeInViewport();
    await assertSmallWindow(page);
    const hide = page.getByRole("button", { name: "Hide archived tickets (1)" });
    await hide.click();
    await expect(page.locator(".group-ticket-window")).toHaveCount(0);
    await expect(page.locator(".group-ticket-row")).toHaveCount(999);
    await expect(show).toBeFocused();
  } finally { await close(); }
});

for (const language of ["en", "ja"] as const) {
  test(`No Group searches across offscreen rows, navigates results and restores the original location (${language})`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    try {
      await page.setViewportSize({ width: 1280, height: 760 });
      await page.emulateMedia({ colorScheme: language === "ja" ? "dark" : "light" });
      await page.addInitScript(lang => localStorage.setItem("kanbalone:language", lang), language);
      await openGroup(page, baseUrl, { ungrouped: true });
      const input = page.getByRole("searchbox", { name: language === "ja" ? "この画面のチケットを検索" : "Find tickets in this view" });
      const next = page.getByRole("button", { name: language === "ja" ? "次の一致へ" : "Next match" });
      const previous = page.getByRole("button", { name: language === "ja" ? "前の一致へ" : "Previous match" });
      const open = page.getByRole("button", { name: language === "ja" ? "一致したチケットを開く" : "Open matching ticket" });
      const clear = page.getByRole("button", { name: language === "ja" ? "チケット検索を解除" : "Clear ticket search" });
      const focusedResult = page.locator("[data-group-search-match]");
      await expect(title(page, 1201)).toHaveCount(0);

      await input.fill("2026");
      await expect(page.locator(".group-window-search-status")).toHaveText(language === "ja" ? "3件一致" : "3 matching tickets");
      await input.press("Enter");
      await expect(focusedResult).toHaveAttribute("data-group-window-id", "10");
      await next.click();
      await expect(focusedResult).toHaveAttribute("data-group-window-id", "600");
      await expect(title(page, 600)).toBeInViewport();
      await expect(next).toBeInViewport();
      await next.click();
      await expect(focusedResult).toHaveAttribute("data-group-window-id", "1201");
      await previous.click();
      await expect(focusedResult).toHaveAttribute("data-group-window-id", "600");
      await open.click();
      await expect(page.locator("#ticket-title")).toHaveValue("Release 2026 ticket 600");
      await page.keyboard.press("Escape");
      await expect(title(page, 600)).toBeFocused();
      await expect(title(page, 600)).toBeInViewport();
      await clear.click();
      await expect(input).toHaveValue("");
      await expect.poll(() => viewport(page).evaluate(root => root.scrollTop)).toBe(0);
      await expect(title(page, 1201)).toHaveCount(0);

      await input.fill("#1");
      await input.press("Enter");
      await expect(focusedResult).toHaveAttribute("data-group-window-id", "1");
      await expect(open).toBeDisabled();
      await expect(remove(page, 1)).toHaveCount(0);
      await input.fill("nothing matches this query");
      await input.press("Enter");
      await expect(page.locator(".group-window-search-status")).toHaveText(language === "ja" ? "条件に一致するチケットがありません" : "No matching tickets");
      await expect(next).toBeDisabled();
    } finally { await close(); }
  });
}

test("Japanese search preserves IME input and caret when an SSE update rebuilds the Group header", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.addInitScript(() => localStorage.setItem("kanbalone:language", "ja"));
    await openGroup(page, baseUrl);
    const input = page.getByRole("searchbox", { name: "この画面のチケットを検索" });
    await input.fill("Release 2026");
    await input.dispatchEvent("compositionstart", { data: "リリース" });
    await input.dispatchEvent("keydown", { key: "ArrowDown", isComposing: true });
    await input.dispatchEvent("keydown", { key: "Escape", isComposing: true });
    await expect(input).toHaveValue("Release 2026");
    await expect(page.locator("[data-group-search-match]")).toHaveCount(0);
    await input.dispatchEvent("compositionend", { data: "リリース" });
    await input.press("Enter");
    await expect(page.locator("[data-group-search-match]")).toHaveAttribute("data-group-window-id", "10");
    const count = page.locator(".group-ticket-count");
    const countBefore = await count.textContent();
    await input.evaluate((element: HTMLInputElement) => {
      element.setSelectionRange(2, 7, "backward");
      element.dataset.blurred = "false";
      element.addEventListener("blur", () => { element.dataset.blurred = "true"; }, { once: true });
    });
    await updateTicket(page.request, baseUrl, 700, { isArchived: true });
    await expect(count).not.toHaveText(countBefore ?? "");
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("Release 2026");
    await expect(input).toHaveAttribute("data-blurred", "false");
    expect(await input.evaluate((element: HTMLInputElement) => [element.selectionStart, element.selectionEnd, element.selectionDirection]))
      .toEqual([2, 7, "backward"]);
    await expect(page.locator("[data-group-search-match]")).toHaveAttribute("data-group-window-id", "10");
    const next = page.getByRole("button", { name: "次の一致へ" });
    const updatedCount = await count.textContent();
    await next.focus();
    await updateTicket(page.request, baseUrl, 701, { isArchived: true });
    await expect(count).not.toHaveText(updatedCount ?? "");
    await expect(next).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-group-search-match]")).toHaveAttribute("data-group-window-id", "600");
  } finally { await close(); }
});
