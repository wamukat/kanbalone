import { expect, test, type Page } from "@playwright/test";
import { createBoard, createCompletionLane, createTicket, startTestApp, updateTicket } from "./helpers.js";

async function rememberRows(page: Page) {
  await page.locator(".group-ticket-row").evaluateAll(nodes => { (window as any).__groupRows = nodes; });
}
async function rowsRetained(page: Page) {
  return page.locator(".group-ticket-row").evaluateAll(nodes => nodes.length === (window as any).__groupRows.length && nodes.every((node, i) => node === (window as any).__groupRows[i] && node.isConnected));
}

test("Group controls and description changes retain ticket nodes and save descriptions", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Partial Group", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Delivery" } })).json();
    await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Other" } });
    for (let i = 0; i < 24; i++) await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Check ${i}`, groupId: group.id });
    const candidate = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Unassigned candidate" });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator(".group-ticket-row")).toHaveCount(24);
    await rememberRows(page);
    await page.locator('[data-group-action="edit-description"]').click();
    await expect.poll(() => rowsRetained(page)).toBe(true);
    const draft = page.locator('[name="description"]');
    await draft.fill("**Review** delivery behavior");
    await draft.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(8, 8));
    await page.locator('[data-group-action="preview-description"]').click();
    await expect(page.locator(".group-description-preview strong")).toHaveText("Review");
    expect(await rowsRetained(page)).toBe(true);
    await draft.focus();
    await draft.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(8, 8));
    const current = await (await page.request.get(`${baseUrl}/api/groups/${group.id}`)).json();
    await page.request.patch(`${baseUrl}/api/groups/${group.id}`, { data: { name: "Delivery updated", expectedRevision: current.revision } });
    await expect(page.locator(".group-name")).toHaveText("Delivery updated");
    await expect(draft).toHaveValue("**Review** delivery behavior");
    await expect(draft).toBeFocused();
    expect(await draft.evaluate((element: HTMLTextAreaElement) => element.selectionStart)).toBe(8);
    expect(await rowsRetained(page)).toBe(true);
    // Refresh the edit revision deliberately after an unrelated rename.
    await page.locator('[data-group-action="cancel-description"]').click();
    await page.locator('[data-group-action="edit-description"]').click();
    await draft.fill("**Saved** delivery review");
    await page.locator('[data-group-form="description"] button[type="submit"]').click();
    await expect(page.locator(".group-description strong")).toHaveText("Saved");
    expect(await rowsRetained(page)).toBe(true);
    expect((await (await page.request.get(`${baseUrl}/api/groups/${group.id}`)).json()).descriptionMarkdown).toBe("**Saved** delivery review");
    await page.locator('#group-sort-groups-name').click();
    await expect(page.locator('#group-sort-groups-name')).toBeFocused();
    expect(await rowsRetained(page)).toBe(true);
    await page.locator('[data-group-action="add"]').click();
    await page.locator('#group-ticket-search').fill("candidate");
    await expect(page.locator(`[data-group-pick="${candidate.id}"]`)).toBeVisible();
    expect(await rowsRetained(page)).toBe(true);
    await page.locator(`[data-group-pick="${candidate.id}"]`).click();
    await expect(page.locator('#group-ticket-search')).toBeFocused();
    expect(await rowsRetained(page)).toBe(true);
    await page.locator(`[data-group-unpick="${candidate.id}"]`).click();
    expect(await rowsRetained(page)).toBe(true);
    await page.locator('[data-group-action="cancel-add"]').click();
    expect(await rowsRetained(page)).toBe(true);
    await page.reload();
    await expect(page.locator(".group-description strong")).toHaveText("Saved");
  } finally { await close(); }
});

test("Group invalidates retained rows for ticket, hierarchy, lane, archive and membership updates", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Invalidation", laneNames: ["Todo"] });
    const done = await createCompletionLane(page.request, baseUrl, board.id);
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Delivery" } })).json();
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Original", groupId: group.id });
    const peer = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Peer", groupId: group.id, priority: 3 });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    const title = page.locator(`[data-group-ticket="${ticket.id}"]`);
    const row = page.locator(".group-ticket-row").filter({ has: title });
    await expect(title).toBeVisible();
    await rememberRows(page);
    await updateTicket(page.request, baseUrl, ticket.id, { title: "Changed" });
    await expect(title).toContainText("Changed");
    expect(await rowsRetained(page)).toBe(false);
    await expect(page.locator('[data-group-ticket]').first()).toHaveAttribute('data-group-ticket', String(peer.id));
    await updateTicket(page.request, baseUrl, ticket.id, { priority: 4 });
    await expect(page.locator('[data-group-ticket]').first()).toHaveAttribute('data-group-ticket', String(ticket.id));
    await updateTicket(page.request, baseUrl, ticket.id, { laneId: done.id });
    await expect(row.locator(".ticket-status-icon-resolved")).toBeVisible();
    await expect(row.locator(".group-ticket-meta")).toHaveText("Accepted");
    const renameLane = await page.request.patch(`${baseUrl}/api/lanes/${done.id}`, { data: { name: "Released" } });
    expect(renameLane.status()).toBe(200);
    await expect(row.locator(".group-ticket-meta")).toHaveText("Released");
    const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Child", parentTicketId: ticket.id });
    await expect(page.locator(`[data-group-ticket="${child.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-group-remove="${ticket.id}"]`)).toHaveAttribute("aria-label", "Remove 2 tickets from Group");
    await updateTicket(page.request, baseUrl, child.id, { parentTicketId: null });
    await expect(page.locator(`[data-group-remove="${child.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-group-remove="${ticket.id}"]`)).toHaveAttribute("aria-label", "Remove from Group");
    await updateTicket(page.request, baseUrl, child.id, { parentTicketId: ticket.id });
    await expect(page.locator(`[data-group-remove="${child.id}"]`)).toHaveCount(0);
    await updateTicket(page.request, baseUrl, ticket.id, { isArchived: true });
    await expect(page.locator(".group-ticket-context")).toContainText("Changed");
    await expect(title).toHaveCount(0);
    await page.locator('[data-group-action="archive"]').click();
    await expect(title).toBeVisible();
    await expect(row.locator(".ticket-status-icon-archived")).toBeVisible();
    await page.locator(`[data-group-remove="${ticket.id}"]`).click();
    await page.locator('#ux-submit-button').click();
    await expect(page.locator('.group-ticket-row')).toHaveCount(1);
    await expect(page.locator(`[data-group-ticket="${peer.id}"]`)).toBeVisible();
    for (const id of [ticket.id, child.id]) expect((await (await page.request.get(`${baseUrl}/api/tickets/${id}`)).json()).groupId).toBeNull();
  } finally { await close(); }
});

test("retained Group rows update disabled actions during a pending description save", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Busy rows", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Delivery" } })).json();
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Existing work", groupId: group.id });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator('.group-ticket-row')).toHaveCount(1);
    await rememberRows(page);
    await page.locator('[data-group-action="edit-description"]').click();
    await page.locator('[name="description"]').fill('Saved while rows persist');
    let requested = false;
    await page.route(`**/api/groups/${group.id}`, async route => {
      if (route.request().method() === 'PATCH') { requested = true; await gate; }
      await route.continue();
    });
    await page.locator('[data-group-form="description"] button[type="submit"]').click();
    await expect.poll(() => requested).toBe(true);
    await updateTicket(page.request, baseUrl, ticket.id, { bodyMarkdown: 'Background body update' });
    await expect(page.locator(`[data-group-remove="${ticket.id}"]`)).toBeDisabled();
    expect(await rowsRetained(page)).toBe(true);
    release();
    await expect(page.locator('.group-description')).toContainText('Saved while rows persist');
    await expect(page.locator(`[data-group-remove="${ticket.id}"]`)).toBeEnabled();
    expect(await rowsRetained(page)).toBe(true);
  } finally { release(); await close(); }
});

test("Group cached form sections recover from failed saves without losing drafts", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Retry forms", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Delivery" } })).json();
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Unchanged ticket", groupId: group.id });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator('.group-ticket-row')).toHaveCount(1);
    await rememberRows(page);
    await page.locator('[data-group-action="edit-description"]').click();
    const draft = page.locator('[name="description"]');
    await draft.fill('Retained retry draft');
    let failed = false;
    await page.route(`**/api/groups/${group.id}`, async route => {
      if (route.request().method() === 'PATCH' && !failed) {
        failed = true;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic save failure"}' });
      } else await route.continue();
    });
    const save = page.locator('[data-group-form="description"] button[type="submit"]');
    await save.click();
    await expect(page.locator('.group-error')).toContainText('Synthetic save failure');
    await expect(save).toBeEnabled();
    await expect(draft).toHaveValue('Retained retry draft');
    expect(await rowsRetained(page)).toBe(true);
    await save.click();
    await expect(page.locator('.group-description')).toContainText('Retained retry draft');
    await page.locator('[data-group-action="create"]').click();
    const name = page.locator('[data-group-form="create"] [name="name"]');
    await name.fill('Retry creation');
    let createFailed = false;
    await page.route(`**/api/boards/${board.id}/groups`, async route => {
      if (route.request().method() === 'POST' && !createFailed) {
        createFailed = true;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic create failure"}' });
      } else await route.continue();
    });
    const create = page.locator('[data-group-form="create"] button[type="submit"]');
    await create.click();
    await expect(page.locator('.group-error')).toContainText('Synthetic create failure');
    await expect(create).toBeEnabled();
    await expect(name).toHaveValue('Retry creation');
    expect(await rowsRetained(page)).toBe(true);
    await create.click();
    await expect(page.locator('.group-name')).toHaveText('Retry creation');
  } finally { await close(); }
});

test("Group partial refresh keeps scroll and title focus; group switching and N use current tickets", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.setViewportSize({ width: 1280, height: 720 });
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Scroll", laneNames: ["Todo"] });
    const first = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "First" } })).json();
    const second = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Second" } })).json();
    const ids = [];
    for (let i = 0; i < 30; i++) ids.push((await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Work ${i}`, groupId: first.id })).id);
    const other = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Other work", groupId: second.id });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    const last = page.locator(`[data-group-ticket="${ids[28]}"]`);
    await last.focus();
    const scroll = await page.locator('#group-board').evaluate(element => element.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    await rememberRows(page);
    await page.request.patch(`${baseUrl}/api/groups/${first.id}`, { data: { name: "First renamed", expectedRevision: first.revision } });
    await expect(page.locator('.group-name')).toHaveText("First renamed");
    await expect(last).toBeFocused();
    expect(await page.locator('#group-board').evaluate(element => element.scrollTop)).toBe(scroll);
    expect(await rowsRetained(page)).toBe(true);
    await page.locator(`[data-select-group="${second.id}"]`).click();
    await expect(page.locator('[data-group-ticket]')).toHaveCount(1);
    await expect(page.locator(`[data-group-ticket="${other.id}"]`)).toBeVisible();
    await page.locator(`[data-group-ticket="${other.id}"]`).focus();
    await page.keyboard.press('n');
    await expect(page.locator('#ticket-title')).toBeFocused();
    await expect(page.locator('.editor-group-context')).toContainText('Second');
    await page.keyboard.press('Escape');
    await expect(page.locator(`[data-group-ticket="${other.id}"]`)).toBeFocused();
  } finally { await close(); }
});
