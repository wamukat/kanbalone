import { expect, test, type Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, updateTicket } from "./helpers.js";

const editor = (page: Page) => page.locator("#editor-dialog");
const input = (page: Page) => page.locator("#ticket-title");
const origin = (page: Page, view: string, id: number) => page.locator(view === "list"
  ? `.list-ticket-link[data-open-ticket-id="${id}"]`
  : view === "group" ? `[data-group-ticket="${id}"]` : `.ticket-card[data-ticket-id="${id}"] .ticket-link`);

async function navigate(page: Page, baseUrl: string, id: number, view: string) {
  const events = page.waitForResponse(response => response.url().endsWith(`/api/boards/${id}/events`) && response.status() === 200);
  await page.goto(`${baseUrl}/boards/${id}${view === "kanban" ? "" : `/${view}`}`);
  await events;
}

async function tickets(page: Page, baseUrl: string, id: number) {
  return (await (await page.request.get(`${baseUrl}/api/boards/${id}/tickets?archived=all`)).json()).tickets;
}

for (const locale of ["ja", "en"]) {
  for (const view of ["list", "kanban", "group"]) {
    test(`keyboard creation saves in the expected context and returns to its origin (${view}, ${locale})`, async ({ page }) => {
      const { baseUrl, close } = await startTestApp(page);
      try {
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.addInitScript(lang => localStorage.setItem("kanbalone:language", lang), locale);
        const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Creation context", laneNames: ["Todo", "Doing"] });
        const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Delivery" } })).json();
        const existing = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[1].id, title: "Existing work", groupId: group.id });
        await navigate(page, baseUrl, board.id, view);
        await expect(origin(page, view, existing.id)).toBeVisible();
        await origin(page, view, existing.id).focus();
        await page.keyboard.press("n");
        await expect(editor(page)).toHaveJSProperty("open", true);
        await expect(input(page)).toBeFocused();
        await expect(page.locator("#ticket-lane")).toHaveValue(String(lanes[view === "kanban" ? 1 : 0].id));
        if (view === "group") await expect(page.locator(".editor-group-context")).toContainText("Delivery");
        const name = `${locale} ${view} keyboard work`;
        await input(page).fill(name);
        await page.locator("#ticket-body").fill("Stored **from keyboard**");
        await page.keyboard.press(locale === "en" ? "Meta+Enter" : "Control+Enter");
        await expect(editor(page)).toHaveJSProperty("open", false);
        await expect(origin(page, view, existing.id)).toBeFocused();
        const created = (await tickets(page, baseUrl, board.id)).filter((entry: { title: string }) => entry.title === name);
        expect(created).toHaveLength(1);
        expect(created[0].laneId).toBe(lanes[view === "kanban" ? 1 : 0].id);
        expect(created[0].groupId).toBe(view === "group" ? group.id : null);
        expect(created[0].parentTicketId).toBeNull();
        expect((await (await page.request.get(`${baseUrl}/api/tickets/${created[0].id}`)).json()).bodyMarkdown).toBe("Stored **from keyboard**");
        await page.reload();
        await expect(origin(page, view, created[0].id)).toBeVisible();
      } finally { await close(); }
    });
  }
}

test("creation shortcuts ignore text, composition and repetition; failed saves preserve the draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Creation guards", laneNames: ["Todo"] });
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Needle" });
    await navigate(page, baseUrl, board.id, "list");
    const target = origin(page, "list", item.id);
    await page.locator("#search-input").fill("n");
    await expect(editor(page)).toHaveJSProperty("open", false);
    await page.locator("#search-input").fill("");
    await target.focus();
    for (const properties of [{ isComposing: true }, { repeat: true }, { ctrlKey: true }, { altKey: true }]) {
      await target.dispatchEvent("keydown", { key: "n", bubbles: true, ...properties });
      await expect(editor(page)).toHaveJSProperty("open", false);
    }
    await target.press("n");
    await expect(input(page)).toBeFocused();
    await input(page).fill("Retained draft");
    await input(page).press("Enter");
    await expect(editor(page)).toHaveJSProperty("open", true);
    await input(page).dispatchEvent("compositionstart");
    await input(page).press("Control+Enter");
    await expect(editor(page)).toHaveJSProperty("open", true);
    await input(page).dispatchEvent("compositionend");
    await input(page).dispatchEvent("keydown", { key: "Enter", ctrlKey: true, repeat: true, bubbles: true });
    await expect(editor(page)).toHaveJSProperty("open", true);
    expect(await tickets(page, baseUrl, board.id)).toHaveLength(1);
    await input(page).press("Escape");
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await page.locator("#ux-cancel-button").click();
    await expect(input(page)).toHaveValue("Retained draft");
    await page.route(`**/api/boards/${board.id}/tickets`, async route => {
      if (route.request().method() === "POST") await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Synthetic save failure"}' });
      else await route.continue();
    });
    await input(page).press("Control+Enter");
    await expect(page.locator("#save-ticket-button")).toBeEnabled();
    await expect(input(page)).toHaveValue("Retained draft");
    await expect(editor(page)).toHaveJSProperty("open", true);
    expect(await tickets(page, baseUrl, board.id)).toHaveLength(1);
    await page.unroute(`**/api/boards/${board.id}/tickets`);
    await input(page).press("Control+Enter");
    await expect(editor(page)).toHaveJSProperty("open", false);
    await expect(target).toBeFocused();
    expect(await tickets(page, baseUrl, board.id)).toHaveLength(2);
  } finally { await close(); }
});

test("completion-lane and selected-Group creation preserve explicit destinations", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Explicit destinations", laneNames: ["Todo"] });
    const done = await createCompletionLane(page.request, baseUrl, board.id);
    const item = await createTicket(page.request, baseUrl, board.id, { laneId: done.id, title: "Accepted origin" });
    await navigate(page, baseUrl, board.id, "kanban");
    await origin(page, "kanban", item.id).focus();
    await page.keyboard.press("n");
    await expect(page.locator("#ticket-lane")).toHaveValue(String(done.id));
    await input(page).fill("Already complete");
    await input(page).press("Control+Enter");
    await expect(editor(page)).toHaveJSProperty("open", false);
    const created = (await tickets(page, baseUrl, board.id)).find((entry: { title: string }) => entry.title === "Already complete");
    expect(created.isResolved).toBe(true);
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Empty destination" } })).json();
    await navigate(page, baseUrl, board.id, "group");
    const choice = page.locator(`[data-select-group="${group.id}"]`);
    await choice.click();
    await choice.focus();
    await page.keyboard.press("n");
    await expect(page.locator(".editor-group-context")).toContainText("Empty destination");
    await page.keyboard.press("Escape");
    await expect(editor(page)).toHaveJSProperty("open", false);
    await expect(choice).toBeFocused();
    const other = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Other destination" } })).json();
    const otherChoice = page.locator(`[data-select-group="${other.id}"]`);
    await expect(otherChoice).toBeVisible();
    await otherChoice.focus();
    await page.keyboard.press("n");
    await expect(editor(page)).toHaveJSProperty("open", false);
    await expect(choice).toHaveAttribute("aria-current", "true");
  } finally { await close(); }
});

test("creation restores filtered List scroll and safely falls back if the origin leaves the filter", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Creation refresh", laneNames: ["Todo"] });
    const ids: number[] = [];
    for (let i = 0; i < 36; i++) ids.push((await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Match ${String(i).padStart(2, "0")}` })).id);
    await navigate(page, baseUrl, board.id, "list");
    await page.locator("#search-input").fill("Match");
    await page.locator("#search-input").press("ArrowDown");
    for (let i = 0; i < 27; i++) await page.keyboard.press("ArrowDown");
    const target = origin(page, "list", ids[27]!);
    await expect(target).toBeFocused();
    const scroll = await page.locator(".list-viewport").evaluate(el => el.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    await page.keyboard.press("n");
    await expect(input(page)).toBeFocused();
    await input(page).fill("Outside filter creation");
    await input(page).press("Control+Enter");
    await expect(editor(page)).toHaveJSProperty("open", false);
    await expect(target).toBeFocused();
    await expect.poll(() => page.locator(".list-viewport").evaluate(el => el.scrollTop)).toBe(scroll);
    await expect(page.locator("#search-input")).toHaveValue("Match");
    await page.keyboard.press("n");
    await expect(input(page)).toBeFocused();
    await updateTicket(page.request, baseUrl, ids[27]!, { title: "No longer visible" });
    await page.keyboard.press("Escape");
    await expect(editor(page)).toHaveJSProperty("open", false);
    await expect(target).toHaveCount(0);
    await expect(page.locator("#search-input")).toBeFocused();
  } finally { await close(); }
});

test("pending Group creation cannot open the previous Group after selection changes", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Pending creation", laneNames: ["Todo"] });
    const groups = [];
    for (const name of ["First", "Second"]) groups.push(await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name } })).json());
    await navigate(page, baseUrl, board.id, "group");
    const first = page.locator(`[data-select-group="${groups[0].id}"]`);
    const second = page.locator(`[data-select-group="${groups[1].id}"]`);
    await first.click();
    let requested = false;
    await page.route(`**/api/boards/${board.id}/tickets?*`, async route => {
      const query = new URL(route.request().url()).searchParams;
      if (query.get("archived") === "all" && !query.has("groupId")) {
        requested = true;
        await gate;
      }
      await route.continue();
    });
    await first.press("n");
    await expect.poll(() => requested).toBe(true);
    await second.click();
    await expect(second).toHaveAttribute("aria-current", "true");
    const completed = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === `/api/boards/${board.id}/tickets` && url.searchParams.get("archived") === "all" && !url.searchParams.has("groupId");
    });
    release();
    await completed;
    await expect(editor(page)).toHaveJSProperty("open", false);
    await expect(second).toBeFocused();
    await second.press("n");
    await expect(editor(page)).toHaveJSProperty("open", true);
    await expect(page.locator(".editor-group-context")).toContainText("Second");
    await page.keyboard.press("Escape");
  } finally { release(); await close(); }
});

test("existing creation buttons focus the title and retain their return position", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Creation buttons", laneNames: ["Todo", "Doing"] });
    await navigate(page, baseUrl, board.id, "kanban");
    const plus = page.locator(`.lane[data-lane-id="${lanes[1].id}"] .add-ticket-button`);
    await plus.click();
    await expect(input(page)).toBeFocused();
    await expect(page.locator("#ticket-lane")).toHaveValue(String(lanes[1].id));
    await page.keyboard.press("Escape");
    await expect(editor(page)).toHaveJSProperty("open", false);
    await expect(plus).toBeFocused();
  } finally { await close(); }
});
