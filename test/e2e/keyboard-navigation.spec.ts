import { expect, test, type Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, updateTicket } from "./helpers.js";

const search = (page: Page) => page.locator("#search-input");
const title = (page: Page, id: number) => page.locator(`.list-ticket-link[data-open-ticket-id="${id}"]`);
const card = (page: Page, id: number) => page.locator(`.ticket-card[data-ticket-id="${id}"] .ticket-link`);

async function storedTickets(page: Page, baseUrl: string, boardId: number) {
  return (await (await page.request.get(`${baseUrl}/api/boards/${boardId}/tickets?includeArchived=true`)).json()).tickets;
}

async function scrollPositions(page: Page) {
  return page.locator(".main, .lane-board, .ticket-list, .list-viewport").evaluateAll(elements =>
    elements.filter(el => el.getClientRects().length > 0).map(el => ({
      className: el.className, x: el.scrollLeft, y: el.scrollTop,
    })),
  );
}

async function goToBoard(page: Page, url: string) {
  const events = page.waitForResponse(response => /\/api\/boards\/\d+\/events$/.test(response.url()) && response.status() === 200);
  await page.goto(url);
  await events;
}

for (const locale of ["en", "ja"]) {
  test(`List search navigates virtual rows and returns to the same query, ticket and scroll (${locale})`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    try {
      await page.setViewportSize({ width: 1280, height: 760 });
      await page.addInitScript(lang => localStorage.setItem("kanbalone:language", lang), locale);
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard list", laneNames: ["Todo"] });
      const ids: number[] = [];
      for (let i = 0; i < 45; i++) {
        const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `通知 Notification ${String(i).padStart(2, "0")}` });
        ids.push(ticket.id);
      }
      await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Unrelated fixture" });
      const before = await storedTickets(page, baseUrl, board.id);
      await goToBoard(page, `${baseUrl}/boards/${board.id}/list`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await search(page).fill("通知");
      await expect(page.locator(".list-ticket-link").first()).toContainText("Notification 00");
      await search(page).press("ArrowDown");
      await expect(title(page, ids[0]!)).toBeFocused();
      // Cross the virtual window boundary using only keys, not an injected scroll.
      for (let i = 0; i < 28; i++) await page.keyboard.press("ArrowDown");
      const currentId = ids[28]!;
      await expect(title(page, currentId)).toBeFocused();
      expect(await page.locator(".list-viewport").evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      const beforeScroll = await scrollPositions(page);
      await page.keyboard.press("Enter");
      await expect(page.locator("#editor-header-title")).toHaveText("通知 Notification 28");
      await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
      await page.keyboard.press("Escape");
      await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
      await expect(title(page, currentId)).toBeFocused();
      await expect(search(page)).toHaveValue("通知");
      await expect.poll(() => scrollPositions(page)).toEqual(beforeScroll);
      await page.keyboard.press("ArrowDown");
      await expect(title(page, ids[29]!)).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(search(page)).toBeFocused();
      await expect(page.locator("[data-list-ticket-id]:checked")).toHaveCount(0);
      expect(await storedTickets(page, baseUrl, board.id)).toEqual(before);
    } finally { await close(); }
  });

  test(`Kanban crosses empty lanes, restores position and never expands done implicitly (${locale})`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    try {
      await page.setViewportSize({ width: 1100, height: 720 });
      await page.addInitScript(lang => localStorage.setItem("kanbalone:language", lang), locale);
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard kanban", laneNames: ["Todo", "Doing", "Acceptance"] });
      const done = await createCompletionLane(page.request, baseUrl, board.id);
      for (let i = 0; i < 10; i++) await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `通知 Todo ${i}` });
      for (let i = 0; i < 6; i++) await createTicket(page.request, baseUrl, board.id, { laneId: lanes[1].id, title: `通知 Doing ${i}` });
      await createTicket(page.request, baseUrl, board.id, { laneId: lanes[2].id, title: "Unrelated acceptance fixture" });
      for (let i = 0; i < 7; i++) await createTicket(page.request, baseUrl, board.id, { laneId: done.id, title: `通知 Done ${i}` });
      const before = await storedTickets(page, baseUrl, board.id);
      await goToBoard(page, `${baseUrl}/boards/${board.id}`);
      await search(page).fill("通知");
      await expect(page.locator(`.lane[data-lane-id="${lanes[2].id}"] .ticket-card`)).toHaveCount(0);
      await search(page).press("ArrowDown");
      for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowDown");
      await expect(page.locator(`.lane[data-lane-id="${lanes[0].id}"] .ticket-link:focus`)).toHaveCount(1);
      await page.keyboard.press("ArrowRight");
      await expect(page.locator(`.lane[data-lane-id="${lanes[1].id}"] .ticket-link:focus`)).toHaveCount(1);
      // Compute the nearest card from the geometry the user actually sees.
      const expectedId = await page.locator(`.lane[data-lane-id="${done.id}"] .ticket-card`).evaluateAll(elements => {
        const current = document.activeElement!.closest(".ticket-card")!.getBoundingClientRect();
        const center = current.top + current.height / 2;
        const visible = elements.filter(el => { const r = el.getBoundingClientRect(); const p = el.closest(".ticket-list")!.getBoundingClientRect(); return r.bottom > p.top && r.top < p.bottom; });
        const candidates = visible.length ? visible : elements;
        candidates.sort((a, b) => { const distance = (el: Element) => { const r = el.getBoundingClientRect(); return Math.abs(r.top + r.height / 2 - center); }; return distance(a) - distance(b); });
        return Number((candidates[0] as HTMLElement).dataset.ticketId);
      });
      await page.keyboard.press("ArrowRight");
      await expect(card(page, expectedId)).toBeFocused();
      const beforeScroll = await scrollPositions(page);
      await page.keyboard.press("Enter");
      await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
      await page.keyboard.press("Escape");
      await expect(card(page, expectedId)).toBeFocused();
      await expect(search(page)).toHaveValue("通知");
      await expect.poll(() => scrollPositions(page)).toEqual(beforeScroll);
      for (let i = 0; i < 8; i++) await page.keyboard.press("ArrowDown");
      const doneCards = page.locator(`.lane[data-lane-id="${done.id}"] .ticket-card`);
      await expect(doneCards).toHaveCount(5);
      await expect(doneCards.last().locator(".ticket-link")).toBeFocused();
      await page.keyboard.press("ArrowLeft");
      await expect(page.locator(`.lane[data-lane-id="${lanes[1].id}"] .ticket-link:focus`)).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(search(page)).toBeFocused();
      expect(await storedTickets(page, baseUrl, board.id)).toEqual(before);
    } finally { await close(); }
  });
}

test("search and title navigation ignore IME, modifiers and nested bulk controls", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard guards", laneNames: ["Todo"] });
    const first = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "First" });
    const second = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Second" });
    await goToBoard(page, `${baseUrl}/boards/${board.id}/list`);
    await search(page).focus();
    await search(page).dispatchEvent("keydown", { key: "ArrowDown", isComposing: true });
    await expect(search(page)).toBeFocused();
    await search(page).press("Control+ArrowDown");
    await expect(search(page)).toBeFocused();
    await search(page).press("ArrowDown");
    await expect(title(page, first.id)).toBeFocused();
    await title(page, first.id).dispatchEvent("keydown", { key: "ArrowDown", isComposing: true });
    await expect(title(page, first.id)).toBeFocused();
    await title(page, first.id).press("Shift+ArrowDown");
    await expect(title(page, first.id)).toBeFocused();
    const checkbox = page.locator(`[data-list-ticket-id="${first.id}"]`);
    await checkbox.focus();
    await checkbox.press("ArrowDown");
    await expect(checkbox).toBeFocused();
    await checkbox.press("Space");
    await expect(page.locator(`[data-list-ticket-id="${first.id}"]`)).toBeChecked();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
    await search(page).fill("No matching ticket");
    await expect(page.locator(".list-row")).toHaveCount(0);
    await search(page).press("ArrowDown");
    await expect(search(page)).toBeFocused();
  } finally { await close(); }
});

test("closing after a queued refresh restores the title or safely falls back when it leaves the filter", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard refresh", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Match original" });
    await goToBoard(page, `${baseUrl}/boards/${board.id}/list`);
    await search(page).fill("Match");
    await search(page).press("ArrowDown");
    await expect(title(page, ticket.id)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await updateTicket(page.request, baseUrl, ticket.id, { title: "Match changed" });
    await page.keyboard.press("Escape");
    await expect(title(page, ticket.id)).toHaveText(new RegExp("Match changed"));
    await expect(title(page, ticket.id)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await updateTicket(page.request, baseUrl, ticket.id, { title: "Outside filter" });
    await page.keyboard.press("Escape");
    await expect(page.locator(".list-row")).toHaveCount(0);
    await expect(search(page)).toBeFocused();
    await expect(search(page)).toHaveValue("Match");
  } finally { await close(); }
});

test("keyboard-opened detail retains a cancelled body draft and restores navigation after discard", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard draft", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Draft ticket", bodyMarkdown: "Original" });
    await goToBoard(page, `${baseUrl}/boards/${board.id}/list`);
    await search(page).focus();
    await search(page).press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.locator('[data-detail-edit="body"]').click();
    const input = page.locator("[data-detail-body-input]");
    await input.fill("Unsaved keyboard draft");
    await input.press("Escape");
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await page.locator("#ux-cancel-button").click();
    await expect(input).toHaveValue("Unsaved keyboard draft");
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await input.press("ArrowDown");
    await expect(input).toBeFocused();
    await input.press("Escape");
    await page.locator("#ux-submit-button").click();
    await expect(input).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(title(page, ticket.id)).toBeFocused();
    expect((await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json()).bodyMarkdown).toBe("Original");
  } finally { await close(); }
});

test("ArrowDown waits for the current search response instead of selecting an old result", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard pending search", laneNames: ["Todo"] });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Old result" });
    const wanted = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Wanted result" });
    await goToBoard(page, `${baseUrl}/boards/${board.id}/list`);
    await expect(page.locator(".list-row")).toHaveCount(2);
    let requested = false;
    await page.route(`**/api/boards/${board.id}/tickets?*`, async route => {
      if (new URL(route.request().url()).searchParams.get("q") === "Wanted") {
        requested = true;
        await gate;
      }
      await route.continue();
    });
    await search(page).fill("Wanted");
    await expect.poll(() => requested).toBe(true);
    await search(page).press("ArrowDown");
    await expect(search(page)).toBeFocused();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
    release();
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(title(page, wanted.id)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#editor-header-title")).toHaveText("Wanted result");
  } finally { release(); await close(); }
});

test("failed search does not move focus into stale results and a later search recovers", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Keyboard failed search", laneNames: ["Todo"] });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Old result" });
    const wanted = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Wanted result" });
    await goToBoard(page, `${baseUrl}/boards/${board.id}/list`);
    await expect(page.locator(".list-row")).toHaveCount(2);
    let requested = false;
    await page.route(`**/api/boards/${board.id}/tickets?*`, async route => {
      if (new URL(route.request().url()).searchParams.get("q") === "Fail") {
        requested = true;
        await gate;
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Injected search failure" }) });
      } else await route.continue();
    });
    const failed = page.waitForResponse(response => response.status() === 500);
    await search(page).fill("Fail");
    await expect.poll(() => requested).toBe(true);
    await search(page).press("ArrowDown");
    await expect(search(page)).toBeFocused();
    release();
    await (await failed).finished();
    await expect(page.locator("#toast")).toBeVisible();
    await expect(page.locator("#toast")).toHaveText("Injected search failure");
    await search(page).press("ArrowDown");
    await expect(search(page)).toBeFocused();
    await search(page).press("Enter");
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
    await search(page).fill("Wanted");
    await expect(page.locator(".list-row")).toHaveCount(1);
    await search(page).press("ArrowDown");
    await expect(title(page, wanted.id)).toBeFocused();
  } finally { release(); await close(); }
});
