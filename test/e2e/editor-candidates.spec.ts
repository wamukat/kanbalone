import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";
import type { Page } from "@playwright/test";

async function fixture(page: Page, many = false) {
  const server = await startTestApp(page);
  const { baseUrl } = server;
  const board = await createBoard(page.request, baseUrl, { name: "Candidate loading", laneNames: ["Doing"] });
  const laneId = board.lanes[0].id;
  const make = (title: string, extra = {}) => createTicket(page.request, baseUrl, board.board.id, { title, laneId, ...extra });
  const archived = await make("Archived selected note", { isArchived: true });
  const blocker = await make("Required review");
  const subject = await make("Delivery review", { relatedIds: [archived.id], blockerIds: [blocker.id] });
  const child = await make("Existing child", { parentTicketId: subject.id });
  const blocked = await make("Waiting for delivery", { blockerIds: [subject.id] });
  const other = await make("Other ticket");
  if (many) for (let i = 0; i < 201; i++) await make(`Archived filler ${i}`, { isArchived: true });
  const candidate = await make("Late archived candidate", { isArchived: true });
  await page.goto(`${baseUrl}/boards/${board.board.id}`);
  await expect(page.locator(`.ticket-card[data-ticket-id="${subject.id}"]`)).toBeVisible();
  await page.waitForLoadState("networkidle");
  return { ...server, board, subject, child, archived, blocker, blocked, other, candidate };
}
const candidateRequest = (url: string) => {
  const parsed = new URL(url);
  return /^\/api\/boards\/\d+\/tickets$/.test(parsed.pathname) && parsed.searchParams.get("archived") === "all";
};
async function openDetail(page: Page, id: number) {
  await page.locator(`.ticket-card[data-ticket-id="${id}"] .ticket-link`).click();
  await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
  await expect(page.locator("#header-edit-button")).toBeVisible();
}
async function newEditor(page: Page) {
  await page.locator(".ticket-card .ticket-link").first().focus();
  await page.keyboard.press("n");
  await expect(page.locator("#ticket-title")).toBeFocused();
}
async function showRelated(page: Page) {
  await page.locator("#ticket-relation-add-button").click();
  await page.locator('[data-relation-add-type="related"]').click();
}

test("new and detail open without collecting candidates; selected relations survive an unrelated edit", async ({ page }) => {
  const f = await fixture(page);
  try {
    const requests: string[] = [];
    page.on("request", r => { if (candidateRequest(r.url())) requests.push(r.url()); });
    await newEditor(page);
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
    await openDetail(page, f.subject.id);
    await expect(page.locator("#ticket-view")).toContainText(f.blocked.title);
    await expect(page.locator("#ticket-view")).toContainText(f.archived.title);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-related-summary")).toContainText(f.archived.title);
    await expect(page.locator("#ticket-child-summary")).toContainText(f.child.title);
    expect(requests).toEqual([]);
    await page.locator("#ticket-title").fill("Changed title only");
    await page.locator('#editor-form button[type="submit"]').click();
    await expect(page.locator("#ticket-view")).toBeVisible();
    const saved = await (await page.request.get(`${f.baseUrl}/api/tickets/${f.subject.id}`)).json();
    expect(saved.relatedIds).toEqual([f.archived.id]);
    expect(saved.blockerIds).toEqual([f.blocker.id]);
    expect(saved.children.map((x: any) => x.id)).toEqual([f.child.id]);
    expect(saved.title).toBe("Changed title only");
  } finally { await f.close(); }
});

test("first candidate search collects all pages including archived tickets and reuses the complete collection", async ({ page }) => {
  const f = await fixture(page, true);
  try {
    const requests: string[] = [];
    page.on("request", r => { if (candidateRequest(r.url())) requests.push(r.url()); });
    await newEditor(page); await showRelated(page);
    await page.locator("#ticket-related-search").fill("Late archived");
    await expect(page.locator(`[data-related-id="${f.candidate.id}"]`)).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(new URL(requests[1]).searchParams.has("cursor")).toBe(true);
    await page.locator(`[data-related-id="${f.candidate.id}"]`).click();
    await page.locator("#ticket-related-search").fill("Required");
    await expect(page.locator(`[data-related-id="${f.blocker.id}"]`)).toBeVisible();
    expect(requests).toHaveLength(2);
    await page.locator("#ticket-title").fill("Saved with archived relation");
    await page.locator('#editor-form button[type="submit"]').click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
    const tickets = (await (await page.request.get(`${f.baseUrl}/api/boards/${f.board.board.id}/tickets?q=Saved%20with%20archived`)).json()).tickets;
    const saved = await (await page.request.get(`${f.baseUrl}/api/tickets/${tickets[0].id}`)).json();
    expect(saved.relatedIds).toEqual([f.candidate.id]);
  } finally { await f.close(); }
});

test("pending candidate request preserves current text and focus and does not block ordinary creation", async ({ page }) => {
  const f = await fixture(page);
  let release!: () => void;
  const gate = new Promise<void>(r => { release = r; });
  try {
    await page.route("**/api/boards/*/tickets?**", async route => {
      if (!candidateRequest(route.request().url())) return route.continue();
      await gate; await route.continue();
    });
    await newEditor(page); await showRelated(page);
    await page.locator("#ticket-title").fill("Do not wait for relations");
    await page.locator("#ticket-related-search").fill("Late");
    await expect(page.locator("#ticket-related-options")).toContainText(/Loading|読み込み/);
    await page.locator("#ticket-related-search").fill("Required");
    await page.locator('#editor-form button[type="submit"]').click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
    release();
    await expect(page.locator(".ticket-card").filter({ hasText: "Do not wait for relations" })).toBeVisible();
  } finally { release(); await f.close(); }
});

test("candidate completion keeps unsaved text, current query and focus", async ({ page }) => {
  const f = await fixture(page);
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  try {
    await page.route("**/api/boards/*/tickets?**", async route => {
      if (!candidateRequest(route.request().url())) return route.continue();
      await gate; await route.continue();
    });
    await openDetail(page, f.subject.id); await page.locator("#header-edit-button").click();
    await page.locator("#ticket-title").fill("Unsaved title");
    await page.locator("#ticket-related-search").fill("Late");
    await expect(page.locator("#ticket-related-options")).toContainText(/Loading|読み込み/);
    await page.locator("#ticket-related-search").fill("Required");
    release();
    await expect(page.locator(`[data-related-id="${f.blocker.id}"]`)).toBeVisible();
    await expect(page.locator("#ticket-related-search")).toHaveValue("Required");
    await expect(page.locator("#ticket-related-search")).toBeFocused();
    await expect(page.locator("#ticket-title")).toHaveValue("Unsaved title");
    await expect(page.locator("#ticket-related-summary")).toContainText(f.archived.title);
  } finally { release(); await f.close(); }
});

test("failed candidate fetch offers retry without dropping inputs", async ({ page }) => {
  const f = await fixture(page);
  let calls = 0;
  try {
    await page.route("**/api/boards/*/tickets?**", async route => {
      if (!candidateRequest(route.request().url())) return route.continue();
      calls++;
      if (calls === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected unavailable" }) });
      return route.continue();
    });
    await newEditor(page); await showRelated(page);
    await page.locator("#ticket-title").fill("Keep draft");
    await page.locator("#ticket-related-search").fill("Late");
    await expect(page.locator("#ticket-related-options").getByRole("button", { name: /Try again|再試行/ })).toBeVisible();
    await page.locator("#ticket-related-options").getByRole("button", { name: /Try again|再試行/ }).click();
    await expect(page.locator(`[data-related-id="${f.candidate.id}"]`)).toBeVisible();
    await expect(page.locator("#ticket-title")).toHaveValue("Keep draft");
    await expect(page.locator("#ticket-related-search")).toHaveValue("Late");
    expect(calls).toBe(2);
  } finally { await f.close(); }
});

test("late candidates cannot replace another ticket's selected relation state", async ({ page }) => {
  const f = await fixture(page);
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  try {
    await page.route("**/api/boards/*/tickets?**", async route => {
      if (!candidateRequest(route.request().url())) return route.continue();
      await gate; await route.continue();
    });
    await openDetail(page, f.subject.id); await page.locator("#header-edit-button").click();
    await page.locator("#ticket-related-search").fill("Late");
    await expect(page.locator("#ticket-related-options")).toContainText(/Loading|読み込み/);
    await page.keyboard.press("Escape"); // closes the candidate list
    await page.keyboard.press("Escape"); // closes the editor
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", false);
    await openDetail(page, f.other.id); await page.locator("#header-edit-button").click();
    release();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#ticket-title")).toHaveValue(f.other.title);
    await expect(page.locator("#ticket-related-summary")).toBeEmpty();
    await expect(page.locator("#ticket-related-search")).toHaveValue("");
  } finally { release(); await f.close(); }
});

test("removing a selected archived relation before fetching candidates persists", async ({ page }) => {
  const f = await fixture(page);
  try {
    const requests: string[] = [];
    page.on("request", r => { if (candidateRequest(r.url())) requests.push(r.url()); });
    await openDetail(page, f.subject.id); await page.locator("#header-edit-button").click();
    await page.locator(`[data-remove-related-id="${f.archived.id}"]`).click();
    expect(requests).toEqual([]);
    await page.locator('#editor-form button[type="submit"]').click();
    await expect(page.locator("#ticket-view")).toBeVisible();
    const saved = await (await page.request.get(`${f.baseUrl}/api/tickets/${f.subject.id}`)).json();
    expect(saved.relatedIds).toEqual([]);
    expect(saved.children.map((x: any) => x.id)).toEqual([f.child.id]);
    expect(saved.blockerIds).toEqual([f.blocker.id]);
  } finally { await f.close(); }
});

test("save and re-edit invalidates candidates and keeps selected relations", async ({ page }) => {
  const f = await fixture(page);
  try {
    await openDetail(page, f.subject.id); await page.locator("#header-edit-button").click();
    await page.locator("#ticket-related-search").fill("Late");
    await expect(page.locator(`[data-related-id="${f.candidate.id}"]`)).toBeVisible();
    await page.locator(`[data-related-id="${f.candidate.id}"]`).click();
    await page.locator('#editor-form button[type="submit"]').click();
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#editor-form")).toHaveJSProperty("inert", false);
    await page.waitForLoadState("networkidle");
    const added = await createTicket(page.request, f.baseUrl, f.board.board.id, { laneId: f.board.lanes[0].id, title: "Newly available candidate", isArchived: true });
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-related-summary")).toContainText(f.candidate.title);
    await expect(page.locator("#ticket-related-summary")).toContainText(f.archived.title);
    await page.locator("#ticket-related-search").fill("Newly available");
    await expect(page.locator(`[data-related-id="${added.id}"]`)).toBeVisible();
    // This ticket did not exist in the previous candidate collection. Its
    // presence proves re-editing fetched fresh candidates; board refreshes
    // after save share this endpoint and must not be counted as picker loads.
  } finally { await f.close(); }
});

test("narrow retry status fits the picker and retains a reachable retry action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await fixture(page);
  try {
    let calls = 0;
    await page.route("**/api/boards/*/tickets?**", async route => {
      if (!candidateRequest(route.request().url())) return route.continue();
      if (++calls === 1) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Injected unavailable" }) });
      return route.continue();
    });
    await openDetail(page, f.subject.id); await page.locator("#header-edit-button").click();
    await page.locator("#ticket-related-search").fill("Late");
    const retry = page.locator("#ticket-related-options [data-retry-relation-candidates]");
    await expect(retry).toBeVisible();
    const geometry = await retry.evaluate(button => {
      const status = button.parentElement!;
      const outer = status.parentElement!.getBoundingClientRect();
      const action = button.getBoundingClientRect();
      return { scrollWidth: status.scrollWidth, clientWidth: status.clientWidth, actionRight: action.right, outerRight: outer.right, actionWidth: action.width };
    });
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.actionRight).toBeLessThanOrEqual(geometry.outerRight);
    expect(geometry.actionWidth).toBeGreaterThan(20);
    await retry.click();
    await expect(page.locator(`[data-related-id="${f.candidate.id}"]`)).toBeVisible();
    await expect(page.locator("#ticket-related-search")).toHaveValue("Late");
  } finally { await f.close(); }
});
