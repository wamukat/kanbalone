import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

test("Groups create, describe, search whole parent/child sets and remove with confirmation", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Group board", laneNames: ["Todo"] });
    const parent = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Archived parent", isArchived: true });
    const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Visible child", parentTicketId: parent.id });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await page.getByRole("button", { name: "Add Group", exact: true }).click();
    await page.getByLabel("Group name", { exact: true }).fill("Release");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator(".group-name")).toHaveText("Release");
    await page.getByRole("button", { name: "Add description", exact: true }).click();
    await page.locator('[name="description"]').fill("**Scope** and [reference](https://example.com)");
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await expect(page.locator(".group-description-preview strong")).toHaveText("Scope");
    await page.locator('[data-group-form="description"]').getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".group-description strong")).toHaveText("Scope");
    await page.getByRole("button", { name: "Add existing tickets", exact: true }).click();
    await page.getByRole("combobox", { name: "Find unassigned tickets" }).fill("Visible child");
    await page.locator(`[data-group-pick="${child.id}"]`).click();
    await page.getByRole("button", { name: "Add 2 tickets", exact: true }).click();
    await expect(page.locator(".group-ticket-context")).toContainText("Archived parent");
    await expect(page.locator(`[data-group-ticket="${child.id}"]`)).toBeVisible();
    await expect(page.locator("[data-group-remove]")).toHaveCount(1);
    await page.locator("[data-group-remove]").click();
    await expect(page.locator("#ux-fields")).toContainText("Archived parent");
    await page.locator("#ux-cancel-button").click();
    await expect(page.locator(".group-ticket-family")).toHaveCount(1);
    await page.locator("[data-group-remove]").click();
    await page.locator("#ux-submit-button").click();
    await expect(page.locator(".group-ticket-family")).toHaveCount(0);
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${child.id}`)).json();
    expect(saved.groupId).toBeNull(); expect(saved.parentTicketId).toBe(parent.id);
    await page.getByRole("button", { name: "Delete empty Group", exact: true }).click();
    await page.locator("#ux-submit-button").click();
    await expect(page.locator(".group-choice")).toHaveCount(0);
    await expect(page.locator(".group-choices")).toContainText("No Groups yet.");
    await expect(page.getByRole("button", { name: "Show all Groups", exact: true })).toHaveCount(0);
  } finally { await close(); }
});

test("Group creates tickets through existing editor and opens from ticket details", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Editor Group", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Beta" } })).json();
    await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Alpha" } });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await page.locator("#group-sort-groups-name").click();
    await expect(page.locator(".group-choice").first()).toContainText("Alpha");
    await page.reload();
    await expect(page.locator("#group-sort-groups-name")).toHaveAttribute("aria-label", "Name, sorted ascending");
    await page.locator("#group-sort-groups-name").click();
    await expect(page.locator(".group-choice").first()).toContainText("Beta");
    await expect(page.locator("#group-sort-groups-name")).toBeFocused();
    await page.locator("#group-sort-groups-createdAt").click();
    await expect(page.locator(".group-choice").first()).toContainText("Beta");
    await page.locator("#group-sort-groups-createdAt").click();
    await expect(page.locator(".group-choice").first()).toContainText("Alpha");
    await page.locator(`[data-select-group="${group.id}"]`).click();
    await page.getByRole("button", { name: "Create ticket", exact: true }).click();
    await expect(page.locator(".editor-group-context")).toContainText("Beta");
    await page.locator("#ticket-title").fill("Created in Beta");
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#editor-dialog")).not.toBeVisible();
    await expect(page.locator(".group-ticket-title")).toContainText("Created in Beta");
    await page.locator("[data-group-ticket]").click();
    await expect(page.locator("[data-ticket-group]")).toHaveText("Beta");
    await page.locator("[data-ticket-group]").click();
    await expect(page.locator("#editor-dialog")).not.toBeVisible();
    await expect(page.locator(".group-name")).toHaveText("Beta");
  } finally { await close(); }
});

test("editor Group conflicts cancel atomically and select a Group for all affected tickets", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Conflicts", laneNames: ["Todo"] });
    const makeGroup = async (name: string) => (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name } })).json();
    const a = await makeGroup("Group A"), b = await makeGroup("Group B");
    const parent = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Parent A", groupId: a.id });
    const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Child B", groupId: b.id });
    await page.goto(`${baseUrl}/tickets/${parent.id}`);
    await page.locator("#header-edit-button").click();
    await page.locator("#ticket-title").fill("Parent changed atomically");
    await page.locator("#ticket-relation-add-button").click();
    await page.locator('[data-relation-add-type="child"]').click();
    await page.locator("#ticket-child-search").fill("Child B");
    await page.locator("#ticket-child-search").press("Enter");
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#ux-title")).toContainText("Which Group");
    await page.locator("#ux-cancel-button").click();
    let saved = await (await page.request.get(`${baseUrl}/api/tickets/${parent.id}`)).json();
    expect(saved.title).toBe("Parent A"); expect(saved.children).toEqual([]);
    await page.locator("#save-ticket-button").click();
    await page.locator(`[data-resolve-group="${b.id}"]`).click();
    await expect(page.locator("#ticket-view-meta [data-ticket-group]")).toHaveText("Group B");
    saved = await (await page.request.get(`${baseUrl}/api/tickets/${parent.id}`)).json();
    expect(saved.title).toBe("Parent changed atomically"); expect(saved.children.map((t: {id: number}) => t.id)).toEqual([child.id]); expect(saved.groupId).toBe(b.id);
  } finally { await close(); }
});

test("inactive Group detail links reveal All and duplicate names stay editable", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Inactive Group", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Old work" } })).json();
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Archived work", groupId: group.id, isArchived: true });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator(".group-choice")).toHaveCount(0);
    await expect(page.locator(".group-choices")).toContainText("No active Groups");
    await expect(page.locator(".group-content-panel")).not.toContainText("Create a Group");
    await page.getByRole("button", { name: "Show all Groups", exact: true }).click();
    await expect(page.locator(".group-choice")).toHaveCount(1);
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator("[data-ticket-group]").click();
    await expect(page.getByRole("button", { name: "All", exact: true })).toHaveClass("active");
    await expect(page.locator(".group-name")).toHaveText("Old work");
    await page.getByRole("button", { name: "Show archived tickets (1)", exact: true }).click();
    await expect(page.locator(`[data-group-ticket="${ticket.id}"]`)).toBeVisible();
    await page.getByRole("button", { name: "Add Group", exact: true }).click();
    await page.getByLabel("Group name", { exact: true }).fill("Old work");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator(".group-error")).not.toBeEmpty();
    await expect(page.getByLabel("Group name", { exact: true })).toHaveValue("Old work");
    await page.getByLabel("Group name", { exact: true }).fill("New work");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.locator(".group-name")).toHaveText("New work");
    await page.screenshot({ path: "/tmp/kanbalone-group-ui.png", fullPage: true });
  } finally { await close(); }
});

test("live Group updates retain draft caret and reject outdated description saves", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Live draft", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Draft" } })).json();
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await page.getByRole("button", { name: "Add description", exact: true }).click();
    const draft = page.locator('[name="description"]');
    await draft.fill("Local draft");
    await draft.evaluate((e: HTMLTextAreaElement) => e.setSelectionRange(3, 3));
    await page.request.patch(`${baseUrl}/api/groups/${group.id}`, { data: { descriptionMarkdown: "Other user's draft", expectedRevision: group.revision } });
    // A rename on the same response makes receipt of the live refresh observable.
    const current = await (await page.request.get(`${baseUrl}/api/groups/${group.id}`)).json();
    await page.request.patch(`${baseUrl}/api/groups/${group.id}`, { data: { name: "Updated remotely", expectedRevision: current.revision } });
    await expect(page.locator(".group-name")).toHaveText("Updated remotely");
    await expect(draft).toHaveValue("Local draft");
    await expect(draft).toBeFocused();
    expect(await draft.evaluate((e: HTMLTextAreaElement) => e.selectionStart)).toBe(3);
    // Opening another editor must not upgrade the older description draft revision.
    await page.locator(".group-name").click();
    await expect(page.locator('[data-group-form="rename"]')).toBeVisible();
    await page.locator('[data-group-form="description"]').getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".group-error")).not.toBeEmpty();
    const saved = await (await page.request.get(`${baseUrl}/api/groups/${group.id}`)).json();
    expect(saved.descriptionMarkdown).toBe("Other user's draft");
  } finally { await close(); }
});

test("delete confirmation keeps its original Group target across live deletion", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Delete race", laneNames: ["Todo"] });
    const a = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Original" } })).json();
    const b = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Other" } })).json();
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator(".group-name")).toHaveText("Original");
    await page.getByRole("button", { name: "Delete empty Group", exact: true }).click();
    expect((await page.request.delete(`${baseUrl}/api/groups/${a.id}`, { headers: { "If-Match": `"${a.revision}"` } })).status()).toBe(204);
    await expect(page.locator(".group-name")).toHaveText("Other");
    await page.locator("#ux-submit-button").click();
    await expect(page.locator("#toast")).toContainText("not found");
    expect((await page.request.get(`${baseUrl}/api/groups/${b.id}`)).status()).toBe(200);
  } finally { await close(); }
});

test("Group ticket area remains scrollable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Mobile", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Long Group" } })).json();
    for (let i = 0; i < 15; i++) await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Ticket ${i}`, groupId: group.id });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator("[data-group-ticket]")).toHaveCount(15);
    const last = page.locator("[data-group-ticket]").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(await page.locator("#group-board").evaluate(e => e.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally { await close(); }
});
