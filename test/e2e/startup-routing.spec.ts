import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

for (const destination of ["home", "kanban", "list", "group", "ticket", "missing-board", "missing-ticket"]) {
  test(`startup resolves ${destination} before fetching one board detail`, async ({ page }) => {
    const { baseUrl, close } = await startTestApp(page);
    try {
      const other = await createBoard(page.request, baseUrl, { name: "Remembered other board", laneNames: ["Todo"] });
      const target = await createBoard(page.request, baseUrl, { name: "Requested board", laneNames: ["Todo"] });
      const group = await (await page.request.post(`${baseUrl}/api/boards/${target.board.id}/groups`, { data: { name: "Delivery" } })).json();
      const ticket = await createTicket(page.request, baseUrl, target.board.id, { laneId: target.lanes[0].id, groupId: group.id, title: "Requested ticket" });
      const fallback = ["home", "missing-board", "missing-ticket"].includes(destination);
      await page.addInitScript(({ otherId, targetId, fallback }) => {
        localStorage.setItem("kanbalone:ui-preferences", JSON.stringify({ version: 1,
          activeBoardId: fallback ? targetId : otherId,
          boards: { [otherId]: { viewMode: "group", filters: { q: "other-only", lane: "", status: ["open"], includeArchived: false, priority: [], tag: "" } }, [targetId]: { viewMode: "list" } },
        }));
        (window as any).__startupTitles = [];
        new MutationObserver(() => {
          const title = document.querySelector("#board-title")?.textContent?.trim();
          if (title) (window as any).__startupTitles.push(title);
        }).observe(document, { subtree: true, childList: true, characterData: true });
      }, { otherId: other.board.id, targetId: target.board.id, fallback });
      const details: string[] = [];
      const collections: string[] = [];
      page.on("request", req => {
        const path = new URL(req.url()).pathname;
        if (req.method() === "GET" && /^\/api\/boards\/\d+$/.test(path)) details.push(path);
        if (/^\/api\/boards\/\d+\/(tickets|groups|events)$/.test(path)) collections.push(path);
      });
      const route = destination === "home" ? "/" : destination === "ticket" ? `/tickets/${ticket.id}`
        : destination === "missing-board" ? "/boards/999999/list" : destination === "missing-ticket" ? "/tickets/999999"
        : `/boards/${target.board.id}${destination === "kanban" ? "" : `/${destination}`}`;
      await page.goto(baseUrl + route);
      await expect(page.locator("#board-title")).toHaveText("Requested board");
      if (destination === "ticket") {
        await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
        await expect(page.locator("#ticket-title")).toHaveValue("Requested ticket");
      } else if (destination === "group") await expect(page.locator(`[data-group-ticket="${ticket.id}"]`)).toBeVisible();
      else if (destination === "kanban") await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`)).toBeVisible();
      else await expect(page.locator(".list-row")).toContainText("Requested ticket");
      await page.waitForLoadState("networkidle");
      expect(details).toEqual([`/api/boards/${target.board.id}`]);
      expect(collections.every(path => path.startsWith(`/api/boards/${target.board.id}/`))).toBe(true);
      const titles = await page.evaluate(() => (window as any).__startupTitles as string[]);
      expect(titles).not.toContain("Remembered other board");
      const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("kanbalone:ui-preferences")!));
      expect(prefs.activeBoardId).toBe(target.board.id);
      expect(prefs.boards[String(other.board.id)].filters.q).toBe("other-only");
    } finally { await close(); }
  });
}

test("empty startup performs no board fetch, and first board creation still refreshes detail", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const details: string[] = [];
    page.on("request", req => {
      const path = new URL(req.url()).pathname;
      if (req.method() === "GET" && /^\/api\/boards\/\d+$/.test(path)) details.push(path);
    });
    await page.goto(baseUrl);
    await expect(page.locator(".shell")).toHaveClass(/no-boards/);
    await page.waitForLoadState("networkidle");
    expect(details).toEqual([]);
    await page.locator("#new-board-button").click();
    await page.locator("[data-board-create-input]").fill("First board");
    await page.locator("[data-board-create-input]").press("Enter");
    await expect(page.locator("#board-title")).toHaveText("First board");
    expect(details.length).toBeGreaterThan(0);
    expect((await (await page.request.get(`${baseUrl}/api/boards`)).json()).boards).toHaveLength(1);
  } finally { await close(); }
});
