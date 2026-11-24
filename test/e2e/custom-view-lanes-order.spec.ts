import { expect, test, type Page } from "@playwright/test";

import { createBoard, createCompletionLane, createTag, createTicket, startTestApp, updateTicket } from "./helpers.js";

const views = "/api/custom-views";
const edit = '[data-view-action="edit"]';
const save = '#custom-view-form button[type="submit"]';
const sort = '[data-view-appearance="sort"]';
const laneMode = (board: number) => `[data-lane-mode="${board}"]`;
const laneChoice = (board: number, lane: number) => `[data-lane-board="${board}"][value="${lane}"]`;
const action = (name: string) => `[data-view-action="${name}"]`;
const openDefinition = {
  name: "Release desk", scope: "all", boardIds: [], completion: "open", showBody: false, showLatestComment: false,
};

function row(page: Page, id: number) {
  return page.locator(`[data-view-ticket="${id}"]`);
}

async function expectOrder(page: Page, ids: number[]) {
  await expect.poll(() => page.locator("[data-view-ticket]").evaluateAll(
    links => links.map(link => Number(link.getAttribute("data-view-ticket"))),
  )).toEqual(ids);
}

test("keeps lane OR rules independent by board and conjunctive with tag and completion rules", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const request = page.request;
  try {
    const studio = await createBoard(request, baseUrl, { name: "Studio", laneNames: ["Inbox", "Draft", "Review", "Stage"] });
    const publishing = await createBoard(request, baseUrl, { name: "Publishing", laneNames: ["Scheduled", "Hold"] });
    const a = studio.board.id;
    const b = publishing.board.id;
    const [inbox, draft, review, stage] = studio.lanes.map((lane: { id: number }) => lane.id);
    const [scheduled, hold] = publishing.lanes.map((lane: { id: number }) => lane.id);
    const accepted = await createCompletionLane(request, baseUrl, a);
    const copy = await createTag(request, baseUrl, a, { name: "Copy" });
    const design = await createTag(request, baseUrl, a, { name: "Design" });
    const pending = await createTicket(request, baseUrl, a, { laneId: inbox, title: "Still in inbox", tagIds: [copy.id] });
    const revise = await createTicket(request, baseUrl, a, { laneId: draft, title: "Revise copy", tagIds: [copy.id, design.id] });
    const approve = await createTicket(request, baseUrl, a, { laneId: review, title: "Approve design", tagIds: [design.id] });
    await createTicket(request, baseUrl, a, { laneId: review, title: "Untagged" });
    await createTicket(request, baseUrl, a, { laneId: accepted.id, title: "Done", tagIds: [copy.id] });
    const announce = await createTicket(request, baseUrl, b, { laneId: scheduled, title: "Announce" });
    const embargo = await createTicket(request, baseUrl, b, { laneId: hold, title: "Embargo" });
    const created = await request.post(baseUrl + views, { data: { ...openDefinition, rules: [
      { boardId: a, mode: "tags", tagIds: [copy.id, design.id] },
      { boardId: b, mode: "all", tagIds: [] },
    ] } });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    const endpoint = `${baseUrl}${views}/${id}`;
    const read = async () => (await request.get(endpoint)).json();

    await page.goto(`${baseUrl}/views/${id}`);
    await expectOrder(page, [pending.id, revise.id, approve.id, announce.id, embargo.id]);
    await expect(page.locator(sort)).toHaveValue("position_asc");
    await page.locator(edit).press("Enter");
    for (const board of [a, b]) await expect(page.locator(laneMode(board))).toHaveValue("all");
    await page.locator(laneMode(a)).selectOption("selected");
    await expect(page.locator(laneMode(a))).toBeFocused();
    for (const lane of [draft, review, accepted.id]) await page.locator(laneChoice(a, lane)).check();
    await page.locator(`[data-rule-mode="${a}"]`).selectOption("all");
    await page.locator(`[data-rule-mode="${a}"]`).selectOption("tags");
    for (const lane of [draft, review, accepted.id]) await expect(page.locator(laneChoice(a, lane))).toBeChecked();
    for (const tag of [copy.id, design.id]) {
      await page.locator(`[data-rule-board="${a}"][value="${tag}"]`).check();
    }
    await page.locator(laneMode(b)).selectOption("selected");
    await page.locator(laneChoice(b, scheduled)).check();
    await page.locator(save).press("Enter");
    await expectOrder(page, [revise.id, approve.id, announce.id]);
    expect((await read()).rules).toEqual([
      { boardId: a, mode: "tags", tagIds: [copy.id, design.id], laneMode: "selected", laneIds: [draft, review, accepted.id] },
      { boardId: b, mode: "all", tagIds: [], laneMode: "selected", laneIds: [scheduled] },
    ]);
    await page.reload();
    await expectOrder(page, [revise.id, approve.id, announce.id]);

    await page.locator(edit).press("Enter");
    for (const lane of [draft, review, accepted.id]) await page.locator(laneChoice(a, lane)).uncheck();
    await page.locator(save).press("Enter");
    await expectOrder(page, [announce.id]);
    expect((await read()).rules[0]).toMatchObject({ laneMode: "selected", laneIds: [] });
    await page.locator(edit).press("Enter");
    await page.locator(laneChoice(a, stage)).check();
    await page.locator(save).press("Enter");
    await expect(page.locator(`[data-view-group="${a}"]`)).toContainText("Stage");
    expect((await request.delete(`${baseUrl}/api/lanes/${stage}`)).status()).toBe(204);
    await expect(page.locator(".cv-warning")).toContainText(`Deleted lane #${stage}`);
    const recreated = await request.post(`${baseUrl}/api/boards/${a}/lanes`, { data: { name: "Stage" } });
    expect(recreated.status()).toBe(201);
    const replacement = (await recreated.json()).id;
    expect(replacement).not.toBe(stage);
    const staged = await createTicket(request, baseUrl, a, { laneId: replacement, title: "Ready to stage", tagIds: [copy.id] });
    await page.reload();
    await expectOrder(page, [announce.id]);
    await expect(page.locator(".cv-warning")).toContainText(`Deleted lane #${stage}`);
    await page.locator(edit).press("Enter");
    await expect(page.locator(laneChoice(a, stage))).toBeChecked();
    await expect(page.locator(laneChoice(a, replacement))).not.toBeChecked();
    await page.locator(laneMode(a)).selectOption("all");
    await page.locator(save).press("Enter");
    await expectOrder(page, [pending.id, revise.id, approve.id, staged.id, announce.id]);
    await expect(page.locator(".cv-warning")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("sorts before pagination, keeps board order and stable ties, and persists only saved order", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const request = page.request;
  try {
    const backlog = await createBoard(request, baseUrl, { name: "Backlog", laneNames: ["Queue"] });
    const shipping = await createBoard(request, baseUrl, { name: "Shipping", laneNames: ["Ready"] });
    const a = backlog.board.id;
    const b = shipping.board.id;
    const ids: number[] = [];
    for (let index = 0; index < 51; index++) {
      const ticket = await createTicket(request, baseUrl, a, {
        title: `Backlog item ${index + 1}`, laneId: backlog.lanes[0].id, priority: index < 49 ? 1 : 4,
      });
      ids.push(ticket.id);
    }
    const ship = await createTicket(request, baseUrl, b, { title: "Urgent shipping", laneId: shipping.lanes[0].id, priority: 4 });
    const definition = { ...openDefinition, rules: [a, b].map(boardId => ({ boardId, mode: "all", tagIds: [] })) };
    const created = await request.post(baseUrl + views, { data: definition });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    const read = async () => (await request.get(`${baseUrl}${views}/${id}`)).json();
    const query = async (data: Record<string, unknown>) => request.post(baseUrl + views + "/query", { data });
    const firstPage = await query({ definition, limit: 50 });
    expect(firstPage.status()).toBe(200);
    const oldCursor = (await firstPage.json()).nextCursor;
    expect(oldCursor).toEqual(expect.any(String));

    await page.goto(`${baseUrl}/views/${id}`);
    await expectOrder(page, ids.slice(0, 50));
    await page.locator(action("next")).press("Enter");
    await expectOrder(page, [ids[50], ship.id]);
    await expect(row(page, ids[50])).toBeFocused();
    const orderPicker = page.locator(sort);
    await orderPicker.focus();
    await orderPicker.selectOption("priority_desc");
    const priorityPage = [ids[49], ids[50], ...ids.slice(0, 48)];
    await expectOrder(page, priorityPage);
    await expect(orderPicker).toBeFocused();
    expect((await read()).sort).toBe("position_asc");
    const mismatched = await query({ definition: { ...definition, sort: "priority_desc" }, limit: 50, cursor: oldCursor });
    expect(mismatched.status()).toBe(400);
    expect((await mismatched.json()).code).toBe("invalid_cursor");

    await page.locator(action("next")).press("Enter");
    await expectOrder(page, [ids[48], ship.id]);
    await expect(row(page, ids[48])).toBeFocused();
    await page.locator(action("revert-display")).press("Enter");
    await expectOrder(page, ids.slice(0, 50));
    await expect(orderPicker).toHaveValue("position_asc");
    await orderPicker.selectOption("priority_desc");
    await page.locator(action("save-display")).press("Enter");
    await expect.poll(async () => (await read()).sort).toBe("priority_desc");
    await page.reload();
    await expect(orderPicker).toHaveValue("priority_desc");
    await expectOrder(page, priorityPage);
    await page.locator(edit).press("Enter");
    const settingsOrder = page.locator('#custom-view-form select[name="sort"]');
    await expect(settingsOrder).toHaveValue("priority_desc");
    await settingsOrder.selectOption("position_asc");
    await page.locator(save).press("Enter");
    await expectOrder(page, ids.slice(0, 50));
    expect((await read()).sort).toBe("position_asc");
  } finally {
    await close();
  }
});

test("moves live rows across the activity-order page boundary only for real content activity", async ({ page, browser }) => {
  const { baseUrl, close } = await startTestApp(page);
  const writer = await browser.newPage();
  const request = writer.request;
  try {
    const data = await createBoard(request, baseUrl, { name: "Release work", laneNames: ["Review"] });
    const board = data.board.id;
    const lane = data.lanes[0].id;
    const ids: number[] = [];
    for (let index = 0; index < 51; index++) {
      const ticket = await createTicket(request, baseUrl, board, {
        title: `Review item ${index + 1}`, laneId: lane, bodyMarkdown: "Initial body",
      });
      ids.push(ticket.id);
      if (index === 0 || index === 49) {
        // Give the oldest and newest tickets distinct storage timestamps.
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
    const target = ids[0];
    const latest = ids[50];
    const definition = {
      ...openDefinition, rules: [{ boardId: board, mode: "all", tagIds: [] }],
      sort: "content_activity_desc", showLatestComment: true,
    };
    const created = await request.post(baseUrl + views, { data: definition });
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    await page.goto(`${baseUrl}/views/${id}`);
    const first = page.locator("[data-view-ticket]").first();
    await expect(first).toHaveAttribute("data-view-ticket", String(latest));
    await expect(row(page, target)).toHaveCount(0);
    const query = async () => {
      const response = await request.post(baseUrl + views + "/query", { data: { definition, limit: 50 } });
      expect(response.status()).toBe(200);
      return response.json();
    };
    const initialPage = await query();
    await updateTicket(request, baseUrl, target, { priority: 4, bodyMarkdown: "Initial body" });
    expect((await query()).tickets[0].id).toBe(latest);
    await updateTicket(request, baseUrl, target, { bodyMarkdown: "Revised body" });
    await expect(first).toHaveAttribute("data-view-ticket", String(target));
    await expect(row(page, initialPage.tickets[49].id)).toHaveCount(0);
    const stale = await request.post(baseUrl + views + "/query", {
      data: { definition, limit: 50, cursor: initialPage.nextCursor },
    });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).code).toBe("stale_cursor");

    async function postComment(ticket: number, body: string) {
      await writer.goto(`${baseUrl}/tickets/${ticket}`);
      await writer.locator("#comment-compose-toggle").click();
      await writer.locator("#comment-body").fill(body);
      const posted = writer.waitForResponse(response => response.request().method() === "POST" &&
        response.url().endsWith(`/api/tickets/${ticket}/comments`));
      await writer.locator("#save-comment-button").click();
      const response = await posted;
      expect(response.status()).toBe(201);
      return response.json();
    }
    const targetComment = await postComment(target, "First reviewer note");
    const latestComment = await postComment(latest, "New reviewer note");
    await expect(first).toHaveAttribute("data-view-ticket", String(latest));
    await expect(page.getByText("New reviewer note", { exact: true })).toBeVisible();
    const targetEndpoint = `${baseUrl}/api/comments/${targetComment.id}`;
    expect((await request.patch(targetEndpoint, { data: { bodyMarkdown: "Edited reviewer note" } })).status()).toBe(200);
    await expect(first).toHaveAttribute("data-view-ticket", String(target));
    await expect(page.getByText("Edited reviewer note", { exact: true })).toBeVisible();
    const latestEndpoint = `${baseUrl}/api/comments/${latestComment.id}`;
    expect((await request.delete(latestEndpoint)).status()).toBe(204);
    await expect(page.getByText("New reviewer note", { exact: true })).toHaveCount(0);
    await expect(first).toHaveAttribute("data-view-ticket", String(target));
    expect((await request.delete(targetEndpoint)).status()).toBe(204);
    await expect(page.getByText("Edited reviewer note", { exact: true })).toHaveCount(0);
    await expect(first).toHaveAttribute("data-view-ticket", String(target));
    await page.reload();
    await expect(first).toHaveAttribute("data-view-ticket", String(target));
  } finally {
    await writer.close();
    await close();
  }
});
