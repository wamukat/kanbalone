import { expect, test } from "@playwright/test";
import { createBoard, createCompletionLane, createTag, createTicket, selectBoardFilter, startTestApp, updateTicket } from "./helpers.js";

test("filtered List keeps blocker links and their current state across reloads", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Recovery", laneNames: ["Evidence", "Waiting"] });
    const done = await createCompletionLane(page.request, baseUrl, board.id);
    const filterTag = await createTag(page.request, baseUrl, board.id, { name: "Recovery" });
    const open = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Collect logs" });
    const archived = await createTicket(page.request, baseUrl, board.id, { laneId: done.id, title: "Check the previous backup", isArchived: true });
    await createTicket(page.request, baseUrl, board.id, {
      laneId: lanes[1].id, title: "Audit the rollback plan", blockerIds: [archived.id],
    });
    const dependent = await createTicket(page.request, baseUrl, board.id, {
      laneId: lanes[1].id, title: "Restore the service", tagIds: [filterTag.id], blockerIds: [open.id, archived.id],
    });

    const listUrl = `${baseUrl}/boards/${board.id}/list`;
    const collectionPath = `/api/boards/${board.id}/tickets`;
    const dependencyLoads: URL[] = [];
    page.on("request", request => {
      const url = new URL(request.url());
      if (url.pathname === collectionPath || url.pathname.endsWith("/list-ticket-references") || url.pathname.endsWith("/relations")) dependencyLoads.push(url);
    });
    const row = (id: number) => page.locator(`.list-ticket-link[data-open-ticket-id="${id}"]`);
    const blockers = page.locator(".list-row").filter({ has: row(dependent.id) }).locator(".list-blocker-cell");
    const openLink = blockers.getByRole("button", { name: `#${open.id} Collect logs (Open)` });
    const archiveLink = blockers.getByRole("button", { name: `#${archived.id} Check the previous backup (Resolved, Archived)` });
    const search = page.locator("#search-input");
    const boardEvents = page.waitForResponse(response => response.url() === `${baseUrl}/api/boards/${board.id}/events` && response.ok());
    await page.goto(listUrl);
    await boardEvents;
    await expect(row(open.id)).toBeVisible();
    await expect(row(archived.id)).toHaveCount(0);
    await expect(openLink).toBeVisible();
    await expect(archiveLink).toHaveCSS("text-decoration-line", "line-through");

    dependencyLoads.length = 0;
    await search.fill("Restore");
    await expect(row(open.id)).toHaveCount(0);
    await expect(openLink).toBeVisible();
    expect(dependencyLoads.length).toBeGreaterThan(0);
    for (const url of dependencyLoads) {
      expect(url.pathname).toBe(collectionPath);
      expect(url.searchParams.get("q")).toBe("Restore");
      expect(url.searchParams.get("include_blocker_references")).toBe("true");
    }

    await search.clear();
    await expect(row(open.id)).toBeVisible();
    await selectBoardFilter(page, "tag", "Recovery");
    await expect(row(open.id)).toHaveCount(0);
    await expect(openLink).toBeVisible();
    await selectBoardFilter(page, "tag", null);
    await expect(row(open.id)).toBeVisible();
    await selectBoardFilter(page, "lane", "Waiting");
    await expect(row(open.id)).toHaveCount(0);
    await expect(openLink).toBeVisible();

    await archiveLink.press("Enter");
    await expect(page.locator("#editor-header-title")).toHaveText("Check the previous backup");
    await updateTicket(page.request, baseUrl, open.id, { laneId: done.id, title: "Logs collected" });
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).not.toBeVisible();
    const updatedLink = blockers.getByRole("button", { name: `#${open.id} Logs collected (Resolved)` });
    await expect(updatedLink).toHaveCSS("text-decoration-line", "line-through");
    await expect(archiveLink).toBeFocused();
    await page.reload();
    await expect(updatedLink).toBeVisible();
    await expect(archiveLink).toBeVisible();
    await selectBoardFilter(page, "lane", null);
    await page.locator("#include-archived-filter").click();
    await expect(row(archived.id)).toBeVisible();
    await expect(archiveLink).toBeVisible();
    const stored = await (await page.request.get(`${baseUrl}/api/tickets/${dependent.id}`)).json();
    expect(stored.blockerIds).toEqual([open.id, archived.id]);
  } finally { await close(); }
});
