import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { createBoard, createCompletionLane, createTicket, startTestApp } from "./helpers.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUa8AAAAASUVORK5CYII=";
const taskBody = (page: Page) => page.locator("#ticket-task-body");
const taskRow = (page: Page, number: number) => page.locator(`#ticket-task-list [data-task-number="${number}"]`);

async function addTask(page: Page, text: string) {
  await page.locator("#ticket-task-add").click();
  await taskBody(page).fill(text);
  await taskBody(page).press("Control+Enter");
  await expect(taskBody(page)).toBeHidden();
}

test("Task Markdown, filters, counts, attribution and independent completion persist", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const boardPage = await page.context().newPage();
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Task board", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Prepare release" });
    await page.addInitScript(() => localStorage.setItem("kanbalone:operation-updater", "Release team"));
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await boardPage.goto(`${baseUrl}/boards/${board.id}`);

    const card = boardPage.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(".ticket-task-count")).toHaveCount(0);

    await page.locator("#ticket-task-add").click();
    const body = taskBody(page);
    await body.fill("Run **release checks**\n\n");
    await body.evaluate((element, fixture) => {
      const input = element as HTMLTextAreaElement;
      input.setSelectionRange(input.value.length, input.value.length);
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(fixture), character => character.charCodeAt(0))], "report.png", { type: "image/png" }));
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, png);
    await expect(body).toHaveValue(/!\[report\.png\]\(\/api\/attachments\/[a-f0-9]{64}\)/);
    await body.press("Control+Enter");
    const first = taskRow(page, 1);
    await expect(first.locator("strong")).toHaveText("release checks");
    await expect.poll(() => first.locator("img").evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1);
    await addTask(page, "Release% checklist");
    await expect(card.locator(".tag-list .ticket-task-count")).toHaveText("0/2 done");

    const query = page.locator("#ticket-task-query");
    await query.fill("RELEASE%");
    await expect(first).toHaveCount(0);
    const second = taskRow(page, 2);
    await expect(second).toContainText("Release% checklist");
    await second.locator("[data-task-done]").click();
    await expect(second.locator("[data-task-done]")).toBeChecked();
    await expect(card.locator(".ticket-task-count")).toHaveText("1/2 done");
    const onlyOpen = page.locator("#ticket-task-open-only");
    await onlyOpen.click();
    await expect(onlyOpen).toHaveAttribute("aria-pressed", "true");
    await expect(second).toHaveCount(0);
    await expect(page.locator("#ticket-task-empty")).toHaveText("No matching Tasks.");
    await onlyOpen.click();
    await query.fill("");
    await page.locator("#activity-tab-button").click();
    await second.locator("[data-task-done]").click();
    await expect(page.locator("#ticket-activity")).toContainText("Reopened Task #2");
    await expect(page.locator("#activity-tab-button")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#ticket-activity .record-updater").first()).toHaveText("Release team");

    await second.locator("[data-task-delete]").click();
    await expect(page.getByText("Delete Task #2?", { exact: true })).toBeVisible();
    await page.locator("#ux-dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(second).toHaveCount(0);
    await addTask(page, "Verify delivery");
    await expect(taskRow(page, 3)).toContainText("Verify delivery");

    await boardPage.locator('[data-view-mode="list"]').click();
    const stack = boardPage.locator("#list-board .ticket-title-stack").filter({ hasText: ticket.title });
    await expect(stack.locator(".list-ticket-link + .ticket-task-count")).toHaveText("0/2 done");
    await page.reload();
    await expect(taskRow(page, 3)).toContainText("Verify delivery");
    await expect(first.locator("img")).toBeVisible();
    const stored = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}/tasks`)).json();
    expect(stored).toMatchObject({ taskCount: 2, doneTaskCount: 0, tasks: [{ number: 1, done: false }, { number: 3, done: false }] });
    const storedTicket = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(storedTicket.isResolved).toBe(false);
  } finally {
    await boardPage.close();
    await close();
  }
});

test("concurrent Task edits retain the draft through a done toggle and explicit reload", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Conflict board", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Review changes" });
    const endpoint = `${baseUrl}/api/tickets/${ticket.id}/tasks`;
    const create = await page.request.post(endpoint, { data: { bodyMarkdown: "Original" } });
    expect(create.status()).toBe(201);
    const task = await create.json();
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    const row = taskRow(page, 1);
    await row.locator("[data-task-edit]").click();
    const body = taskBody(page);
    await body.fill("My unsaved draft");

    const remote = await page.request.patch(`${endpoint}/1`, { data: { expectedRevision: task.revision, bodyMarkdown: "Other editor text" } });
    expect(remote.status()).toBe(200);
    await expect(row).toContainText("Other editor text");
    await row.locator("[data-task-done]").click();
    await expect(row.locator("[data-task-done]")).toBeChecked();
    await body.press("Control+Enter");
    await expect(page.locator("#ticket-task-error")).toContainText("Your draft will be kept");
    await expect(body).toHaveValue("My unsaved draft");
    await expect(page.locator("#ticket-task-save")).toBeDisabled();
    await expect(row).toContainText("Other editor text");

    await page.locator("#ticket-task-reload").click();
    await expect(page.locator("#ticket-task-status")).toContainText("Review the current Task");
    await expect(body).toHaveValue("My unsaved draft");
    await body.press("Control+Enter");
    await expect(row).toContainText("My unsaved draft");
    await expect(row.locator("[data-task-done]")).toBeChecked();
    const saved = await (await page.request.get(`${endpoint}/1`)).json();
    expect(saved).toMatchObject({ bodyMarkdown: "My unsaved draft", done: true });

    await row.locator("[data-task-edit]").click();
    await body.fill("Keep this next draft");
    await page.route(`${endpoint}/1`, route => {
      const { expectedRevision: _expectedRevision, ...data } = route.request().postDataJSON();
      return route.continue({ postData: JSON.stringify(data) });
    }, { times: 1 });
    const missingRevision = page.waitForResponse(response => response.url() === `${endpoint}/1` && response.status() === 428);
    await body.press("Control+Enter");
    await missingRevision;
    await expect(page.locator("#ticket-task-reload")).toBeVisible();
    await expect(body).toHaveValue("Keep this next draft");
    await page.locator("#ticket-task-reload").click();
    await expect(page.locator("#ticket-task-save")).toBeEnabled();

    const removed = await page.request.delete(`${endpoint}/1`, { data: { expectedRevision: saved.revision } });
    expect(removed.status()).toBe(204);
    await expect(row).toHaveCount(0);
    await body.press("Control+Enter");
    await expect(page.locator("#ticket-task-reload")).toBeVisible();
    await page.locator("#ticket-task-reload").click();
    await expect(page.locator("#ticket-task-error")).toContainText("This Task no longer exists");
    await expect(page.locator("#ticket-task-save")).toBeDisabled();
    await expect(body).toHaveValue("Keep this next draft");
    await page.locator("#ticket-task-cancel").click();
    await page.locator("#ux-dismiss-button").click();
    await expect(body).toHaveValue("Keep this next draft");
  } finally {
    await close();
  }
});

test("a delayed Task list stays scoped to the ticket that requested it", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Switching board", laneNames: ["Todo"] });
    const first = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "First ticket" });
    const second = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Second ticket" });
    const firstTasks = `${baseUrl}/api/tickets/${first.id}/tasks`;
    expect((await page.request.post(firstTasks, { data: { bodyMarkdown: "First task body" } })).status()).toBe(201);
    expect((await page.request.post(`${baseUrl}/api/tickets/${second.id}/tasks`, { data: { bodyMarkdown: "Second task body" } })).status()).toBe(201);

    let received!: (response: APIResponse) => void;
    const initialTasks = new Promise<APIResponse>(resolve => { received = resolve; });
    await page.route(firstTasks, async route => {
      const response = await route.fetch();
      received(response);
      await hold;
      await route.fulfill({ response });
    }, { times: 1 });
    await page.addInitScript(() => localStorage.setItem("kanbalone:language", "ja"));
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole("button", { name: "First ticket", exact: true }).click();
    expect((await initialTasks).status()).toBe(200);
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).toBeHidden();
    await page.getByRole("button", { name: "Second ticket", exact: true }).click();
    await expect(taskRow(page, 1)).toContainText("Second task body");
    await page.locator("#ticket-task-query").fill("Second task");
    const delayed = page.waitForResponse(response => response.url() === firstTasks);
    release();
    expect((await delayed).status()).toBe(200);
    await expect(taskRow(page, 1)).toContainText("Second task body");
    await expect(page.locator("#ticket-task-query")).toHaveValue("Second task");
    await page.locator("#ticket-task-add").click();
    await expect(page.locator("#ticket-task-save")).toHaveText("追加");
  } finally {
    release();
    await close();
  }
});

test("Task activity identifies text edits made with completion or reopening", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Activity board", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Document delivery" });
    const tasks = `${baseUrl}/api/tickets/${ticket.id}/tasks`;
    const notes = "Delivery notes. ".repeat(12);
    const created = await page.request.post(tasks, { data: { bodyMarkdown: notes } });
    expect(created.status()).toBe(201);
    const original = await created.json();
    const completed = await page.request.patch(`${tasks}/1`, {
      data: { expectedRevision: original.revision, done: true, bodyMarkdown: `${notes}\n\nDelivery confirmed` },
    });
    expect(completed.status()).toBe(200);
    const latest = await completed.json();
    const reopened = await page.request.patch(`${tasks}/1`, {
      data: { expectedRevision: latest.revision, done: false, bodyMarkdown: `${latest.bodyMarkdown}\n\nFollow-up required` },
    });
    expect(reopened.status()).toBe(200);
    await page.addInitScript(() => localStorage.setItem("kanbalone:language", "ja"));
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator("#activity-tab-button").click();
    const activity = page.locator("#ticket-activity");
    await expect(activity.getByText("Task #1 を完了し、本文を更新", { exact: true })).toBeVisible();
    await expect(activity.getByText("Task #1 を再開し、本文を更新", { exact: true })).toBeVisible();
  } finally {
    await close();
  }
});

test("Group rows show per-ticket Task counts and refresh them while retaining hierarchy and focus", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Task groups", laneNames: ["Todo"] });
    const done = await createCompletionLane(page.request, baseUrl, board.id);
    const groupResponse = await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Delivery" } });
    expect(groupResponse.status()).toBe(201);
    const group = await groupResponse.json();
    const parent = await createTicket(page.request, baseUrl, board.id, { laneId: done.id, groupId: group.id, title: "Completed parent" });
    const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, parentTicketId: parent.id, title: "Open child" });
    const empty = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, groupId: group.id, title: "Without Tasks" });
    const ungrouped = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Ungrouped ticket" });
    const taskUrl = (id: number) => `${baseUrl}/api/tickets/${id}/tasks`;
    for (const [id, completed] of [[parent.id, true], [child.id, false], [ungrouped.id, true]]) {
      expect((await page.request.post(taskUrl(id), { data: { bodyMarkdown: "Check the delivery", done: completed } })).status()).toBe(201);
    }

    const events = page.waitForResponse(response => response.url().endsWith(`/api/boards/${board.id}/events`));
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await events;
    const row = (id: number) => page.locator(`[data-group-row-id="${id}"]`);
    const counter = (id: number) => row(id).locator(".group-ticket-title + .ticket-task-count");
    await expect(counter(parent.id)).toHaveText("1/1 done");
    await expect(counter(child.id)).toHaveText("0/1 done");
    await expect(row(empty.id)).toBeVisible();
    await expect(counter(empty.id)).toHaveCount(0);
    const childTitle = row(child.id).locator("[data-group-ticket]");
    await childTitle.focus();
    const task = await (await page.request.get(`${taskUrl(child.id)}/1`)).json();
    expect((await page.request.patch(`${taskUrl(child.id)}/1`, { data: { expectedRevision: task.revision, done: true } })).status()).toBe(200);
    await expect(counter(child.id)).toHaveText("1/1 done");
    await expect(childTitle).toBeFocused();

    await page.locator('[data-group-action="open-only"]').click();
    await expect(row(parent.id)).toHaveClass(/group-ticket-context/);
    await expect(row(parent.id).locator("button, a[href]")).toHaveCount(0);
    await expect(counter(parent.id)).toHaveText("1/1 done");
    await expect(counter(child.id)).toHaveText("1/1 done");

    await page.locator('[data-select-group="ungrouped"]').click();
    await expect(counter(ungrouped.id)).toHaveText("1/1 done");
  } finally {
    await close();
  }
});
