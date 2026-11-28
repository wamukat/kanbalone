import { expect, test, type Page } from "@playwright/test";

import { createBoard, createTicket, startTestApp } from "./helpers.js";

const changes = (page: Page) => page.locator("#ticket-visit-changes");
const snapshotPath = "**/api/tickets/*/change-snapshot";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function savedBody(page: Page, id: number) {
  return page.evaluate(ticketId => new Promise<string | undefined>((resolve, reject) => {
    const open = indexedDB.open("kanbalone-previous-visit");
    open.onerror = () => reject(open.error);
    open.onupgradeneeded = () => { open.transaction?.abort(); };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("tickets", "readonly");
      const get = tx.objectStore("tickets").get(ticketId);
      get.onsuccess = () => resolve(get.result?.state.bodyMarkdown);
      get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }), id).catch(() => undefined);
}

test("the displayed comparison stays fixed while the current ticket updates", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Visits", laneNames: ["Work", "Review"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Restore notes", bodyMarkdown: "Revision A" });
    const other = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Another ticket" });
    const api = (id = ticket.id) => baseUrl + "/api/tickets/" + id;
    const patch = async (bodyMarkdown: string, id = ticket.id) =>
      expect((await page.request.patch(api(id), { data: { bodyMarkdown, updater: "API" } })).status()).toBe(200);
    const task = await page.request.post(api() + "/tasks", { data: { bodyMarkdown: "Check counts" } });
    expect(task.status()).toBe(201);

    await page.goto(baseUrl + "/tickets/" + ticket.id);
    await expect(page.locator("#ticket-visit-changes-tab")).toBeHidden();
    await expect(page.locator("#ticket-view-body")).toContainText("Revision A");
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Revision A");
    await page.getByRole("tab", { name: "Current ticket" }).click();
    await page.locator("#ticket-view-body .ticket-detail-body-content p").evaluate(node => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selected = document.getSelection()!;
      selected.removeAllRanges();
      selected.addRange(range);
    });
    await patch("Revision B");
    await expect(page.locator("#ticket-visit-update")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-view-body")).toContainText("Revision A");
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe("Revision A");
    await expect(page.locator("#ticket-visit-update")).toBeVisible();
    await page.reload();
    await expect(changes(page)).toContainText("Revision A");
    await expect(changes(page)).toContainText("Revision B");
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Revision B");

    const checkedOther = page.waitForResponse(response => response.url().endsWith("change-snapshot?metadataOnly=true"));
    await patch("Unrelated update", other.id);
    await checkedOther;
    await expect(page.locator("#ticket-visit-update")).toBeHidden();
    await patch("Revision C");
    const comment = await page.request.post(api() + "/comments", { data: { bodyMarkdown: "The attachment checks out", updater: "Ops" } });
    expect(comment.status()).toBe(201);
    await expect(changes(page)).toContainText("Updated while open");
    await expect(changes(page)).not.toContainText("Revision C");

    await page.getByRole("tab", { name: "Current ticket" }).click();
    await expect(page.locator("#ticket-view-body")).toContainText("Revision C");
    await page.keyboard.press("ArrowRight");
    await expect(changes(page)).toContainText("Revision A");
    await expect(changes(page)).not.toContainText("Revision C");
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Revision B");

    await page.getByRole("button", { name: "Open activity" }).click();
    await expect(page.getByRole("tab", { name: "Activity" })).toBeFocused();
    await expect(page.locator("#ticket-activity")).toContainText("Activity between these views");
    await expect(page.locator("#ticket-activity")).not.toContainText("The attachment checks out");
    await page.getByRole("button", { name: "Show all activity" }).click();
    await expect(page.locator("#ticket-activity")).toContainText("Comment added");

    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).toBeHidden();
    await page.goto(baseUrl + "/tickets/" + ticket.id);
    await expect(changes(page)).toContainText("Revision B");
    await expect(changes(page)).toContainText("Revision C");
    await expect(changes(page)).toContainText("The attachment checks out");
    await expect(changes(page)).toContainText("Ops");
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Revision C");
    await page.reload();
    await expect(changes(page)).toContainText("No changes since last view");
  } finally {
    await close();
  }
});

test("failed reads and writes do not replace the browser comparison point", async ({ page, context }) => {
  const { baseUrl, close } = await startTestApp(page);
  const blocked = await context.newPage();
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Visit failures", laneNames: ["Work"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Receipt", bodyMarkdown: "Saved starting point" });
    const url = baseUrl + "/tickets/" + ticket.id;
    await page.goto(url);
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Saved starting point");
    expect((await page.request.patch(baseUrl + "/api/tickets/" + ticket.id, { data: { bodyMarkdown: "Unseen endpoint" } })).status()).toBe(200);

    await page.route(snapshotPath, route => route.fulfill({ status: 503, json: { error: "Simulated failure" } }));
    await page.reload();
    await expect(changes(page)).toContainText("Could not load changes");
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Saved starting point");
    await page.unroute(snapshotPath);

    await blocked.addInitScript(() => {
      IDBObjectStore.prototype.put = function () {
        const request = this.get(1);
        this.transaction.abort();
        return request;
      };
    });
    await blocked.goto(url);
    await expect(changes(blocked)).toContainText("Unseen endpoint");
    await expect(changes(blocked)).toContainText("Could not save the comparison point");
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Saved starting point");
    await page.reload();
    await expect(changes(page)).toContainText("Unseen endpoint");
    await expect.poll(() => savedBody(page, ticket.id)).toBe("Unseen endpoint");
  } finally {
    await blocked.close();
    await close();
  }
});

test("a late tab cannot overwrite a newer displayed endpoint", async ({ page, context }) => {
  const { baseUrl, close } = await startTestApp(page);
  const later = await context.newPage();
  const release = deferred();
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Two tabs", laneNames: ["Work"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Notes", bodyMarkdown: "First state" });
    const url = baseUrl + "/tickets/" + ticket.id;
    const patch = async (bodyMarkdown: string) => expect((await page.request.patch(baseUrl + "/api/tickets/" + ticket.id, { data: { bodyMarkdown } })).status()).toBe(200);
    await page.goto(url);
    await expect.poll(() => savedBody(page, ticket.id)).toBe("First state");
    await patch("Older tab state");
    const captured = deferred();
    await page.route(snapshotPath, async route => {
      const response = await route.fetch();
      captured.resolve();
      await release.promise;
      await route.fulfill({ response });
    });
    await page.reload();
    await captured.promise;
    await patch("Newer tab state");
    await later.goto(url);
    await expect(changes(later)).toContainText("Newer tab state");
    await expect.poll(() => savedBody(later, ticket.id)).toBe("Newer tab state");
    release.resolve();
    await expect(changes(page)).toContainText("Older tab state");
    await expect(changes(page)).not.toContainText("Newer tab state");
    await expect.poll(() => savedBody(later, ticket.id)).toBe("Newer tab state");
    await later.reload();
    await expect(changes(later)).toContainText("No changes since last view");
  } finally {
    release.resolve();
    await later.close();
    await close();
  }
});

test("returning to the current ticket ignores a delayed history navigation to another ticket", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const release = deferred();
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Ticket routes", laneNames: ["Todo"] });
    const a = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Keep this ticket" });
    const b = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Delayed response" });
    const routeA = "/tickets/" + a.id;
    const routeB = "/tickets/" + b.id;
    await page.goto(baseUrl + routeA);
    await expect(page.locator("#ticket-visit-changes-tab")).toBeHidden();
    await page.getByRole("tab", { name: "Current ticket" }).click();
    await page.evaluate(({ routeA, routeB }) => {
      history.replaceState(null, "", routeB);
      history.pushState(null, "", routeA);
    }, { routeA, routeB });

    const captured = deferred();
    const hrefB = baseUrl + "/api/tickets/" + b.id;
    await page.route(hrefB, async route => {
      const response = await route.fetch();
      captured.resolve();
      await release.promise;
      await route.fulfill({ response });
    });
    await page.evaluate(() => history.back());
    await captured.promise;
    await expect(page).toHaveURL(baseUrl + routeB);
    await page.evaluate(() => history.forward());
    await expect(page).toHaveURL(baseUrl + routeA);

    const unexpectedlyOpened = page.waitForRequest(hrefB + "/change-snapshot", { timeout: 1000 });
    release.resolve();
    await expect(unexpectedlyOpened).rejects.toThrow(/Timeout/);
    await expect(page).toHaveURL(baseUrl + routeA);
    await expect(page.locator("#editor-header-title")).toHaveText("Keep this ticket");
    await expect(page.getByRole("tab", { name: "Current ticket" })).toHaveAttribute("aria-selected", "true");
  } finally {
    release.resolve();
    await close();
  }
});
