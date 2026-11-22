import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTag, createTicket, startTestApp, updateTicket } from "./helpers.js";

async function createGroup(page: Page, baseUrl: string, boardId: number, name: string, descriptionMarkdown?: string) {
  const response = await page.request.post(`${baseUrl}/api/boards/${boardId}/groups`, { data: { name, descriptionMarkdown } });
  expect(response.status()).toBe(201);
  return response.json();
}

test("Group progress uses completed members and distinguishes empty and archive-only Groups", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Progress", laneNames: ["Todo"] });
    const completionLane = await createCompletionLane(page.request, baseUrl, board.id);
    const mixed = await createGroup(page, baseUrl, board.id, "Mixed");
    const complete = await createGroup(page, baseUrl, board.id, "Complete");
    const archiveOnly = await createGroup(page, baseUrl, board.id, "Archive only");
    const empty = await createGroup(page, baseUrl, board.id, "Empty");
    const open = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, groupId: mixed.id, title: "Open" });
    const archived = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, groupId: mixed.id, title: "Archived", isArchived: true });
    await createTicket(page.request, baseUrl, board.id, { laneId: completionLane.id, groupId: mixed.id, title: "Completed and archived", isArchived: true });
    await createTicket(page.request, baseUrl, board.id, { laneId: completionLane.id, groupId: complete.id, title: "Completed" });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, groupId: archiveOnly.id, title: "Archived and still open", isArchived: true });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    const choice = (id: number) => page.locator(`[data-select-group="${id}"]`);
    const checkProgress = async (groupId: number, resolved: number, total: number, checked = false) => {
      const group = choice(groupId);
      await expect(group.locator("progress")).toHaveAttribute("value", String(resolved));
      await expect(group.locator("progress")).toHaveAttribute("max", String(total || 1));
      await expect(group.locator(".group-choice-completed")).toHaveCount(checked ? 1 : 0);
      await expect(group).toHaveAccessibleName(new RegExp(`Completed ${resolved} of ${total}`));
    };
    await checkProgress(mixed.id, 1, 3);
    await expect(choice(mixed.id).locator("small")).toHaveText("1 open · 3 total");
    await checkProgress(empty.id, 0, 0);
    await expect(choice(complete.id)).toHaveCount(0);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await checkProgress(complete.id, 1, 1, true);
    await checkProgress(archiveOnly.id, 0, 1);
    await expect(choice(archiveOnly.id)).toContainText("Inactive");
    await page.locator('[data-group-action="archive"]').click();
    await expect(page.locator(`[data-group-ticket="${archived.id}"]`)).toBeVisible();
    await checkProgress(mixed.id, 1, 3);

    for (const id of [open.id, archived.id]) {
      const response = await page.request.patch(`${baseUrl}/api/tickets/${id}/transition`, { data: { laneName: completionLane.name } });
      expect(response.ok()).toBe(true);
    }
    await checkProgress(mixed.id, 3, 3, true);
    const saved = await (await page.request.get(`${baseUrl}/api/groups/${mixed.id}`)).json();
    expect(saved).toMatchObject({ openTicketCount: 0, totalTicketCount: 3, resolvedTicketCount: 3, archivedTicketCount: 2 });
    await page.reload();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await checkProgress(mixed.id, 3, 3, true);
  } finally { await close(); }
});

test("Group renders each member's tags and refreshes after tag-only changes", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark" });
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Tags", laneNames: ["Todo"] });
    const group = await createGroup(page, baseUrl, board.id, "Tagged family");
    const label = await createTag(page.request, baseUrl, board.id, { name: "Release", color: "#336699" });
    const longLabel = await createTag(page.request, baseUrl, board.id, { name: "非常に長いラベルの表示と折り返しを確認するための実装作業のラベル", color: "" });
    const parent = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, groupId: group.id, title: "Parent", tagIds: [label.id] });
    const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, parentTicketId: parent.id, title: "Child ticket", tagIds: [label.id, longLabel.id] });
    const standalone = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, groupId: group.id, title: "Without tags" });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    const title = (id: number) => page.locator(`[data-group-ticket="${id}"]`);
    const row = (id: number) => page.locator(".group-ticket-row").filter({ has: title(id) });
    await expect(row(parent.id).locator(".tag")).toHaveCount(1);
    await expect(row(child.id).locator(".tag")).toHaveCount(2);
    await expect(row(standalone.id).locator(".group-ticket-tags")).toHaveCount(0);
    const longTag = row(child.id).locator(".tag-no-color");
    await expect(longTag).toHaveAttribute("title", longLabel.name);
    await expect(longTag.locator(".visually-hidden")).toHaveText(longLabel.name);
    await expect(longTag.locator('[aria-hidden="true"]')).toContainText("...");
    await expect(row(child.id).locator(".group-ticket-tags").getByRole("button")).toHaveCount(0);
    expect(await row(child.id).evaluate(element => {
      const tags = element.querySelector(".group-ticket-tags")!.getBoundingClientRect();
      const lane = element.querySelector(".group-ticket-meta")!.getBoundingClientRect();
      return tags.left < tags.right && tags.right <= lane.left;
    })).toBe(true);

    await title(child.id).focus();
    const changed = await page.request.patch(`${baseUrl}/api/tags/${label.id}`, { data: { name: "Shipping", color: "#684ba1" } });
    expect(changed.ok()).toBe(true);
    await expect(row(parent.id).locator(".tag")).toHaveAttribute("title", "Shipping");
    await expect(row(child.id).locator('.tag[title="Shipping"]')).toHaveCSS("background-color", "rgb(104, 75, 161)");
    await expect(title(child.id)).toBeFocused();
    await updateTicket(page.request, baseUrl, child.id, { tagIds: [longLabel.id] });
    await expect(row(child.id).locator(".tag")).toHaveCount(1);
    await expect(row(child.id).locator(".tag")).toHaveAttribute("title", longLabel.name);
    await page.reload();
    await expect(row(child.id).locator(".tag")).toHaveAttribute("title", longLabel.name);
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${child.id}`)).json();
    expect(saved.tags.map((tag: { id: number }) => tag.id)).toEqual([longLabel.id]);
  } finally { await close(); }
});

test("Group description and Markdown preview use the same theme-aware link styles", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const href = "https://example.com/group";
    const description = `See [the reference](${href}).`;
    const { board } = await createBoard(page.request, baseUrl, { name: "Links", laneNames: ["Todo"] });
    const group = await createGroup(page, baseUrl, board.id, "References", description);
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    const link = (container: string) => page.locator(container).getByRole("link", { name: "the reference" });
    for (const [theme, accent, hover] of [
      ["light", "rgb(31, 111, 95)", "rgb(24, 89, 77)"],
      ["dark", "rgb(84, 184, 159)", "rgb(113, 201, 180)"],
    ] as const) {
      await page.emulateMedia({ colorScheme: theme });
      const body = link(".group-description-body");
      await expect(body).toHaveAttribute("href", href);
      await expect(body).toHaveCSS("color", accent);
      await expect(body).toHaveCSS("text-decoration-line", "underline");
      await body.hover();
      await expect(body).toHaveCSS("color", hover);
      await page.locator(".group-name").press("Tab");
      await expect(body).toBeFocused();
      await expect(body).toHaveCSS("outline-color", accent);
      await expect(body).toHaveCSS("outline-style", "solid");

      await page.locator('[data-group-action="edit-description"]').click();
      await page.locator('[data-group-action="preview-description"]').click();
      const preview = link(".group-description-preview");
      await expect(preview).toHaveAttribute("href", href);
      await expect(preview).toHaveCSS("color", accent);
      await expect(preview).toHaveCSS("text-decoration-line", "underline");
      await preview.hover();
      await expect(preview).toHaveCSS("color", hover);
      await page.locator('[name="description"]').press("Tab");
      await expect(preview).toBeFocused();
      await expect(preview).toHaveCSS("outline-color", accent);
      await expect(preview).toHaveCSS("outline-style", "solid");
      await page.locator('[data-group-action="cancel-description"]').click();
    }
    const saved = await (await page.request.get(`${baseUrl}/api/groups/${group.id}`)).json();
    expect(saved.descriptionMarkdown).toBe(description);
  } finally { await close(); }
});

test("No Group is a conditional view of unassigned tickets with ordinary ticket creation", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Unassigned view", laneNames: ["Todo"] });
    const group = await createGroup(page, baseUrl, board.id, "Delivery");
    const groupTicket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, groupId: group.id, title: "Grouped work" });
    const groupUrl = `${baseUrl}/boards/${board.id}/group`;
    const view = page.locator('[data-select-group="ungrouped"]');
    await page.goto(groupUrl);
    await expect(page.locator(".group-name")).toHaveText("Delivery");
    await expect(view).toHaveCount(0);

    const parent = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Unassigned parent", isArchived: true });
    const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, parentTicketId: parent.id, title: "Unassigned child" });
    await expect(view).toContainText("2 tickets");
    await expect(page.locator(".group-choice").last()).toHaveAttribute("data-select-group", "ungrouped");
    await view.press("Enter");
    await expect(view).toHaveAttribute("aria-current", "true");
    await expect(view).toBeFocused();
    await expect(page.locator(".group-detail-heading")).toContainText("No Group");
    await expect(page.locator(".group-ticket-context")).toContainText("Unassigned parent");
    const ticketTitle = (id: number) => page.locator(`[data-group-ticket="${id}"]`);
    await expect(ticketTitle(child.id)).toBeVisible();
    await expect(ticketTitle(groupTicket.id)).toHaveCount(0);
    await expect(page.locator('[data-group-action="rename"], [data-group-action="add"], [data-group-remove]')).toHaveCount(0);
    await page.locator('[data-group-action="archive"]').click();
    await expect(ticketTitle(parent.id)).toBeVisible();
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(view).toHaveAttribute("aria-current", "true");
    await ticketTitle(child.id).press("n");
    await expect(page.locator("#ticket-title")).toBeFocused();
    await expect(page.locator(".editor-group-context")).toHaveText(board.name);
    await page.keyboard.press("Escape");
    await expect(ticketTitle(child.id)).toBeFocused();
    await page.getByRole("button", { name: "Create ticket", exact: true }).click();
    await page.locator("#ticket-title").fill("Created without a Group");
    const createdResponse = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/boards/${board.id}/tickets`));
    await page.locator("#save-ticket-button").click();
    const created = await (await createdResponse).json();
    expect(created.groupId).toBeNull();
    await expect(ticketTitle(created.id)).toBeVisible();
    await expect(view).toContainText("3 tickets");

    const url = `${baseUrl}/api/boards/${board.id}/group-memberships`;
    const membership = { ticketIds: [child.id, created.id], groupId: group.id };
    const preview = await page.request.post(`${url}/preview`, { data: membership });
    expect(preview.ok()).toBe(true);
    const { expectedToken } = await preview.json();
    await ticketTitle(child.id).focus();
    const response = await page.request.put(url, { data: { ...membership, expectedToken } });
    expect(response.ok()).toBe(true);
    await expect(view).toHaveCount(0);
    await expect(page.locator(`[data-select-group="${group.id}"]`)).toBeFocused();
    await expect(ticketTitle(child.id)).toBeVisible();
    await page.reload();
    await expect(ticketTitle(child.id)).toBeVisible();
    await expect(view).toHaveCount(0);
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${child.id}`)).json();
    expect(saved).toMatchObject({ parentTicketId: parent.id, groupId: group.id });
    const groups = await (await page.request.get(`${baseUrl}/api/boards/${board.id}/groups?status=all`)).json();
    expect(groups.groups.map((entry: { id: number }) => entry.id)).toEqual([group.id]);
  } finally { await close(); }
});

test("Group candidate failures appear only for the Group that requested them", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let releaseFailure!: () => void;
  const delayed = new Promise<void>(resolve => { releaseFailure = resolve; });
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Membership review", laneNames: ["Todo"] });
    const group = await createGroup(page, baseUrl, board.id, "Delivery");
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Unassigned work" });
    const groupUrl = `${baseUrl}/boards/${board.id}/group`;
    const ticketUrl = `${baseUrl}/api/tickets/${ticket.id}`;
    const readTicket = async () => (await page.request.get(ticketUrl)).json();
    const original = await readTicket();
    const isCandidateRequest = (url: URL) => url.pathname === `/api/boards/${board.id}/tickets`
      && url.searchParams.get("ungrouped") === "true"
      && url.searchParams.get("order") === "position_asc";
    const message = "Membership candidates unavailable";
    let requests = 0;
    await page.route(isCandidateRequest, async route => {
      if (++requests === 2) await delayed;
      await route.fulfill({ status: 503, json: { error: message } });
    });
    await page.goto(groupUrl);
    const groupChoice = page.locator(`[data-select-group="${group.id}"]`);
    const add = page.getByRole("button", { name: "Add existing tickets" });
    const alert = page.locator(".group-error[role=alert]");
    const noGroup = page.locator('[data-select-group="ungrouped"]');
    const row = page.locator(`[data-group-ticket="${ticket.id}"]`);
    await expect(groupChoice).toHaveAttribute("aria-current", "true");
    await add.click();
    await expect(alert).toHaveText(message);

    const requested = page.waitForRequest(request => isCandidateRequest(new URL(request.url())));
    const failed = page.waitForResponse(response => isCandidateRequest(new URL(response.url())));
    await add.click();
    await requested;
    await noGroup.click();
    await expect(noGroup).toHaveAttribute("aria-current", "true");
    await expect(row).toBeVisible();
    releaseFailure();
    const response = await failed;
    expect(response.status()).toBe(503);
    await response.finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(alert).toBeEmpty();
    await expect(noGroup).toHaveAttribute("aria-current", "true");
    expect(await readTicket()).toEqual(original);
    await page.reload();
    await noGroup.click();
    await expect(row).toBeVisible();
    expect(await readTicket()).toMatchObject({ groupId: null });
  } finally {
    releaseFailure();
    await close();
  }
});
