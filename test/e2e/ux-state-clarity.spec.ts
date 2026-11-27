import { expect, test } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, updateTicket } from "./helpers.js";

test("dark ticket details identify the lane with the theme text color", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Lane clarity", laneNames: ["Acceptance <review>"] });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId: board.lanes[0].id, title: "Review this" });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator(".ticket-lane-meta")).toHaveText("Lane: Acceptance <review>");
    const textColor = await page.locator("body").evaluate((body) => getComputedStyle(body).color);
    await expect(page.locator(".ticket-lane-meta > span:last-child")).toHaveCSS("color", textColor);
    await expect(page.locator(".ticket-lane-meta button, .ticket-lane-meta select")).toHaveCount(0);
  } finally { await close(); }
});

test("Kanban blocker count survives search and archived blockers and clears only on completion", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Blocker clarity", laneNames: ["Todo"] });
    const laneId = board.lanes[0].id;
    const blocker = await createTicket(page.request, baseUrl, board.board.id, { laneId, title: "Hidden dependency", isArchived: true });
    const completedLane = await createCompletionLane(page.request, baseUrl, board.board.id);
    const complete = await createTicket(page.request, baseUrl, board.board.id, { laneId: completedLane.id, title: "Completed dependency" });
    const ticket = await createTicket(page.request, baseUrl, board.board.id, { laneId, title: "Visible task", blockerIds: [blocker.id, complete.id] });
    await page.goto(`${baseUrl}/boards/${board.board.id}`);
    await page.locator("#search-input").fill("Visible task");
    await expect(page.locator(".ticket-card")).toHaveCount(1);
    await expect(page.locator(".ticket-blocker-indicator")).toHaveAttribute("aria-label", "Blocked by 1 unresolved ticket");
    const filtered = await (await page.request.get(`${baseUrl}/api/boards/${board.board.id}/tickets?q=Visible`)).json();
    expect(filtered.tickets[0].unresolvedBlockerCount).toBe(1);
    await updateTicket(page.request, baseUrl, blocker.id, { laneId: completedLane.id });
    await page.reload();
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`)).toBeVisible();
    await expect(page.locator(".ticket-blocker-indicator")).toHaveCount(0);
  } finally { await close(); }
});

test("the empty List describes active filters and resets to unarchived tickets", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const board = await createBoard(page.request, baseUrl, { name: "Filter clarity", laneNames: ["Todo"] });
    const todo = board.lanes[0];
    await createTicket(page.request, baseUrl, board.board.id, { laneId: todo.id, title: "Open task" });
    await createTicket(page.request, baseUrl, board.board.id, { laneId: todo.id, title: "Archived task", isArchived: true });
    await page.goto(`${baseUrl}/boards/${board.board.id}/list`);
    await page.locator("#lane-filter").selectOption(String(todo.id));
    await page.locator("#include-archived-filter").click();
    await expect(page.locator(".list-row")).toHaveCount(2);
    await page.locator("#search-input").fill("does not exist <text>");
    const empty = page.locator("#list-board .empty-state");
    await expect(empty).toContainText("Include archived tickets");
    await expect(empty).toContainText("Search: “does not exist <text>”");
    await expect(empty).toContainText("Lane: Todo");
    await expect(empty).not.toContainText("Completion");
    await empty.getByRole("button", { name: "Reset filters", exact: true }).click();
    await expect(page.locator("#search-input")).toHaveValue("");
    await expect(page.locator("#lane-filter")).toHaveValue("");
    await expect(page.locator("#include-archived-filter")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator(".list-row")).toContainText("Open task");
  } finally { await close(); }
});
