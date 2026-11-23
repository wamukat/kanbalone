import { expect, test, type Locator } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, updateTicket } from "./helpers.js";

const clearBackground = "rgba(0, 0, 0, 0)";
const rowBackground = (row: Locator) => row.evaluate(element => getComputedStyle(element).backgroundColor);

function expectedFocusColor(title: Locator, forced: boolean) {
  return title.evaluate((element, useSystemColor) => {
    const probe = document.createElement("span");
    probe.style.color = useSystemColor ? "Highlight" : "var(--accent)";
    element.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, forced);
}

test("keyboard focus uses the theme on a ticket title and the system color in forced colors", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.setViewportSize({ width: 740, height: 720 });
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Focus outlines", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, {
      laneId: lanes[0].id,
      title: "A long title that wraps on a Kanban card and is truncated in the narrow List view",
    });
    const search = page.locator("#search-input");
    for (const view of ["kanban", "list"]) {
      await page.goto(`${baseUrl}/boards/${board.id}${view === "list" ? "/list" : ""}`);
      const row = view === "kanban"
        ? page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`)
        : page.locator(".list-row", { has: page.locator(`[data-list-ticket-id="${ticket.id}"]`) });
      const title = row.locator(view === "kanban" ? ".ticket-link" : ".list-ticket-link");
      for (const { colorScheme, forcedColors } of [
        { colorScheme: "light", forcedColors: "none" },
        { colorScheme: "dark", forcedColors: "none" },
        { colorScheme: "light", forcedColors: "active" },
      ] as const) {
        await page.emulateMedia({ colorScheme, forcedColors });
        const sizeBefore = await title.boundingBox();
        expect(sizeBefore).not.toBeNull();
        await search.press("ArrowDown");
        await expect(title).toBeFocused();
        await expect(title).toHaveCSS("outline-width", "2px");
        await expect(title).toHaveCSS("outline-style", "solid");
        await expect(title).toHaveCSS("outline-color", await expectedFocusColor(title, forcedColors === "active"));
        if (view === "list") await expect(title).toHaveCSS("outline-offset", "-2px");
        if (forcedColors === "none") await expect(row).toHaveCSS("box-shadow", /3px 0px 0px 0px inset/);
        const sizeAfter = await title.boundingBox();
        expect(sizeAfter?.width).toBe(sizeBefore?.width);
        expect(sizeAfter?.height).toBe(sizeBefore?.height);
      }
      await page.keyboard.press("Enter");
      await expect(page.locator("#editor-header-title")).toHaveText(ticket.title);
      await page.keyboard.press("Escape");
      await expect(title).toBeFocused();
    }
  } finally { await close(); }
});

test("List and Group share completion tint while archive and context rows retain their meaning", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Completion colors", laneNames: ["Todo"] });
    const done = await createCompletionLane(page.request, baseUrl, board.id);
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Delivery" } })).json();
    const make = (title: string, laneId: number, parentTicketId?: number, groupId: number | null = group.id) =>
      createTicket(page.request, baseUrl, board.id, { title, laneId, parentTicketId, groupId });

    const open = await make("Open", lanes[0].id);
    const completed = await make("Completed", done.id);
    const archived = await make("Archived without completion", lanes[0].id);
    await updateTicket(page.request, baseUrl, archived.id, { isArchived: true });
    const parent = await make("Completed and archived parent", done.id);
    const child = await make("Open child", lanes[0].id, parent.id);
    await updateTicket(page.request, baseUrl, parent.id, { isArchived: true });
    const ungrouped = await make("Completed outside the Group", done.id, undefined, null);

    const listRow = (id: number) => page.locator(".list-row", { has: page.locator(`[data-list-ticket-id="${id}"]`) });
    const groupRow = (id: number) => page.locator(`.group-ticket-row[data-group-row-id="${id}"]`);

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto(`${baseUrl}/boards/${board.id}/list`);
      await expect(listRow(completed.id)).toHaveClass(/\bresolved\b/);
      const tint = await rowBackground(listRow(completed.id));
      expect(tint).not.toBe(clearBackground);
      await expect(listRow(open.id)).toHaveCSS("background-color", clearBackground);

      await page.goto(`${baseUrl}/boards/${board.id}/group`);
      await page.locator(`[data-select-group="${group.id}"]`).click();
      await expect(groupRow(open.id)).toHaveCSS("background-color", clearBackground);
      await expect(groupRow(completed.id)).toHaveCSS("background-color", tint);
      await expect(groupRow(completed.id).locator(".ticket-status-icon-resolved")).toBeVisible();
      await expect(groupRow(child.id)).toHaveCSS("background-color", clearBackground);
      await expect(groupRow(parent.id)).toHaveClass(/\bgroup-ticket-context\b/);
      await expect(groupRow(parent.id)).toHaveCSS("background-color", clearBackground);

      await page.locator('[data-group-action="archive"]').click();
      await expect(groupRow(archived.id)).toHaveCSS("background-color", clearBackground);
      await expect(groupRow(archived.id).locator(".ticket-status-icon-archived")).toBeVisible();
      await expect(groupRow(parent.id)).not.toHaveClass(/\bgroup-ticket-context\b/);
      await expect(groupRow(parent.id)).toHaveCSS("background-color", tint);
      await expect(groupRow(parent.id).locator(".ticket-status-icon")).toHaveCount(2);

      await page.locator('[data-select-group="ungrouped"]').click();
      await expect(groupRow(ungrouped.id)).toHaveCSS("background-color", tint);
    }
  } finally { await close(); }
});
