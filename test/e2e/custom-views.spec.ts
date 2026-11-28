import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { createBoard, createCompletionLane, createTag, createTicket, startTestApp, showCurrentTicket } from "./helpers.js";

const viewApi = "/api/custom-views";
const heading = "#custom-view-heading";
const total = "#custom-view-total";
const form = "#custom-view-form";
const row = (id: number) => `[data-view-ticket="${id}"]`;
const group = (id: number) => `[data-view-group="${id}"]`;
const control = (action: string) => `[data-view-action="${action}"]`;
const appearance = (name: string) => `[data-view-appearance="${name}"]`;
const mode = (id: number) => `[data-rule-mode="${id}"]`;
const boardTag = (boardId: number, tagId: number) => `[data-rule-board="${boardId}"][value="${tagId}"]`;

async function seed(request: APIRequestContext, base: string) {
  const editorial = await createBoard(request, base, { name: "Editorial", laneNames: ["Copy review", "Desk"] });
  const publishing = await createBoard(request, base, { name: "Publishing", laneNames: ["Release review"] });
  const a = editorial.board.id;
  const b = publishing.board.id;
  const completed = await createCompletionLane(request, base, b);
  const copy = await createTag(request, base, a, { name: "Check copy" });
  const design = await createTag(request, base, a, { name: "Check design" });
  const qa = await createTag(request, base, b, { name: "QA" });
  const sameName = await createTag(request, base, b, { name: "Check copy" });
  const longBody = "Detailed release notes. ".repeat(30) + "End of the original body.";
  const longComment = "Review the original release notes. ".repeat(30) + "End of the original comment.";
  const first = await createTicket(request, base, a, {
    laneId: editorial.lanes[0].id, title: "Release overview", bodyMarkdown: longBody, tagIds: [copy.id, design.id],
  });
  const second = await createTicket(request, base, a, {
    laneId: editorial.lanes[0].id, title: "Visual review", tagIds: [design.id],
  });
  const third = await createTicket(request, base, b, {
    laneId: publishing.lanes[0].id, title: "Publish announcement", tagIds: [qa.id],
  });
  const unrelated = await createTicket(request, base, b, {
    laneId: publishing.lanes[0].id, title: "Unrelated style check", tagIds: [sameName.id],
  });
  const commentResponse = await request.post(`${base}/api/tickets/${first.id}/comments`, { data: { bodyMarkdown: longComment } });
  expect(commentResponse.status()).toBe(201);
  const comment = await commentResponse.json();
  const definition = {
    name: "Release checks", scope: "all", boardIds: [],
    rules: [
      { boardId: a, mode: "tags", tagIds: [copy.id, design.id] },
      { boardId: b, mode: "tags", tagIds: [qa.id] },
    ],
    completion: "open", showBody: true, showLatestComment: true,
  };
  return { a, b, first, second, third, unrelated, completed, longBody, longComment, copy, design, qa, definition, comment };
}

async function saveView(request: APIRequestContext, base: string, definition: Record<string, unknown>) {
  const response = await request.post(base + viewApi, { data: definition });
  expect(response.status()).toBe(201);
  return response.json();
}

function ticketLink(page: Page, id: number) {
  return page.locator(`a${row(id)}, button${row(id)}, ${row(id)} a[href="/tickets/${id}"]`);
}

test("creates a named cross-board view and independently persists display settings", async ({ page, browser }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const data = await seed(page.request, baseUrl);
    await page.goto(`${baseUrl}/boards/${data.a}/list`);
    await page.locator("#new-custom-view-button").click();
    const settings = page.locator(form);
    await settings.locator('input[name="name"]').fill(data.definition.name);
    await settings.locator('input[name="scope"][value="all"]').check();
    await settings.locator(mode(data.a)).selectOption("tags");
    await settings.locator(boardTag(data.a, data.copy.id)).check();
    await settings.locator(boardTag(data.a, data.design.id)).check();
    await settings.locator(mode(data.b)).selectOption("tags");
    await settings.locator(boardTag(data.b, data.qa.id)).check();
    await settings.locator('input[name="showBody"]').check();
    await settings.locator('input[name="showLatestComment"]').check();
    await settings.locator('button[type="submit"]').click();

    await expect(page.locator(heading)).toHaveText(data.definition.name);
    await expect(page.locator(total)).toContainText(/\b3\b/);
    await expect(page.locator(group(data.a))).toContainText("Editorial");
    await expect(page.locator(group(data.b))).toContainText("Publishing");
    await expect(ticketLink(page, data.first.id)).toHaveCount(1);
    await expect(ticketLink(page, data.first.id)).toHaveAccessibleName(`#${data.first.id} ${data.first.title}`);
    await expect(ticketLink(page, data.first.id).locator(".ticket-id")).toHaveText(`#${data.first.id}`);
    await expect(ticketLink(page, data.second.id)).toBeVisible();
    await expect(ticketLink(page, data.third.id)).toBeVisible();
    await expect(ticketLink(page, data.unrelated.id)).toHaveCount(0);

    await expect(page.getByText("End of the original body.")).not.toBeVisible();
    const bodyExpand = page.locator('[data-view-expand="body"]').first();
    const bodyFetch = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === `${viewApi}/tickets/${data.first.id}/text` && url.searchParams.get("field") === "body";
    });
    await bodyExpand.press("Enter");
    expect(await (await bodyFetch).json()).toEqual({ bodyMarkdown: data.longBody });
    await expect(page.getByText(data.longBody, { exact: true })).toBeVisible();
    const commentExpand = page.locator('[data-view-expand="comment"]').first();
    await commentExpand.press("Enter");
    await expect(page.getByText(data.longComment, { exact: true })).toBeVisible();

    const viewUrl = page.url();
    const id = Number(new URL(viewUrl).pathname.split("/").at(-1));
    const readSaved = async () => (await page.request.get(`${baseUrl}${viewApi}/${id}`)).json();
    expect(await readSaved()).toMatchObject({
      name: data.definition.name, scope: "all", completion: "open",
      showBody: true, showLatestComment: true,
    });

    await page.locator(appearance("showBody")).click();
    await expect(bodyExpand).toHaveCount(0);
    await expect(commentExpand).toBeVisible();
    await page.locator(control("revert-display")).click();
    await expect(bodyExpand).toBeVisible();
    await page.locator(appearance("showLatestComment")).click();
    await expect(commentExpand).toHaveCount(0);
    await expect(bodyExpand).toBeVisible();
    expect(await readSaved()).toMatchObject({ showBody: true, showLatestComment: true });
    await page.locator(control("save-display")).click();
    await expect.poll(readSaved).toMatchObject({ showBody: true, showLatestComment: false });
    await page.reload();
    await expect(page.locator(heading)).toHaveText(data.definition.name);
    await expect(bodyExpand).toBeVisible();
    await expect(commentExpand).toHaveCount(0);

    const fresh = await browser.newPage();
    try {
      await fresh.goto(viewUrl);
      await expect(fresh.locator(heading)).toHaveText(data.definition.name);
      await expect(fresh.locator('[data-view-expand="body"]').first()).toBeVisible();
      await expect(fresh.locator('[data-view-expand="comment"]')).toHaveCount(0);
    } finally {
      await fresh.close();
    }
  } finally {
    await close();
  }
});

test("keeps empty, unfiltered, missing, and new board rules distinct in the view", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const data = await seed(page.request, baseUrl);
    const saved = await saveView(page.request, baseUrl, data.definition);
    const url = `${baseUrl}/views/${saved.id}`;
    await page.goto(url);
    await expect(page.locator(total)).toContainText(/\b3\b/);

    await page.locator(control("edit")).click();
    const settings = page.locator(form);
    await settings.locator(boardTag(data.a, data.copy.id)).uncheck();
    await settings.locator(boardTag(data.a, data.design.id)).uncheck();
    await settings.locator('button[type="submit"]').click();
    await expect(page.locator(total)).toContainText(/\b1\b/);
    await expect(page.locator(group(data.a)).getByText("0 tickets", { exact: true })).toBeVisible();
    await expect(ticketLink(page, data.first.id)).toHaveCount(0);

    await page.locator(control("edit")).click();
    await settings.locator('input[name="scope"][value="selected"]').check();
    await settings.locator(`input[name="boards"][value="${data.a}"]`).check();
    await settings.locator(mode(data.a)).selectOption("all");
    await settings.locator('button[type="submit"]').click();
    await expect(page.locator(total)).toContainText(/\b2\b/);
    await expect(page.locator(group(data.b))).toHaveCount(0);

    await page.locator(control("edit")).click();
    await settings.locator('input[name="scope"][value="all"]').check();
    await settings.locator(mode(data.a)).selectOption("tags");
    await settings.locator(boardTag(data.a, data.copy.id)).check();
    await settings.locator('button[type="submit"]').click();
    await expect(ticketLink(page, data.first.id)).toBeVisible();

    const later = await createBoard(page.request, baseUrl, { name: "New intake", laneNames: ["New"] });
    const newTicket = await createTicket(page.request, baseUrl, later.board.id, { laneId: later.lanes[0].id, title: "Outside scope" });
    await expect(page.locator(group(later.board.id)).getByText("0 tickets", { exact: true })).toBeVisible();
    await expect(ticketLink(page, newTicket.id)).toHaveCount(0);

    expect((await page.request.delete(`${baseUrl}/api/tags/${data.copy.id}`)).status()).toBe(204);
    await expect(ticketLink(page, data.first.id)).toHaveCount(0);
    const replacement = await createTag(page.request, baseUrl, data.a, { name: "Check copy" });
    expect(replacement.id).not.toBe(data.copy.id);
    await page.request.patch(`${baseUrl}/api/tickets/${data.first.id}`, { data: { tagIds: [replacement.id] } });
    await page.reload();
    await expect(page.locator(group(data.a)).getByText("0 tickets", { exact: true })).toBeVisible();
    await expect(ticketLink(page, data.first.id)).toHaveCount(0);
    const persisted = await (await page.request.get(`${baseUrl}${viewApi}/${saved.id}`)).json();
    expect(persisted.rules).toContainEqual({
      boardId: data.a, mode: "tags", tagIds: [data.copy.id], laneMode: "all", laneIds: [],
    });
    await expect(page.locator(group(data.a))).toContainText(`Deleted tag #${data.copy.id}`);
    const { id: _id, version: _version, ...definition } = persisted;
    const result = await (await page.request.post(baseUrl + viewApi + "/query", { data: { definition } })).json();
    expect(result.warnings).toEqual(expect.arrayContaining([
      { boardId: data.a, tagId: data.copy.id, kind: "missing_tag" },
      { boardId: later.board.id, kind: "unset" },
    ]));
  } finally {
    await close();
  }
});

test("preserves detail ownership, cancelled drafts, and focus when a ticket leaves a cross-board view", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const data = await seed(page.request, baseUrl);
    const saved = await saveView(page.request, baseUrl, data.definition);
    const viewUrl = `${baseUrl}/views/${saved.id}`;
    await page.goto(`${baseUrl}/boards/${data.a}/list`);
    await page.locator(`[data-custom-view-id="${saved.id}"]`).click();
    await expect(page).toHaveURL(viewUrl);
    await page.locator(appearance("showBody")).click();
    await expect(page.locator('[data-view-expand="body"]')).toHaveCount(0);

    const detail = page.locator("#editor-dialog");
    await ticketLink(page, data.first.id).press("Enter");
    await expect(detail).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(viewUrl);
    await expect(ticketLink(page, data.first.id)).toBeFocused();
    await expect(page.locator('[data-view-expand="body"]')).toHaveCount(0);

    await ticketLink(page, data.third.id).press("Enter");
    await expect(page).toHaveURL(`${baseUrl}/tickets/${data.third.id}`);
    await showCurrentTicket(page);
    await expect(page.locator("#ticket-view-meta")).toContainText("Lane: Release review");
    const draft = page.locator("[data-detail-body-input]");
    await page.locator('[data-detail-edit="body"]').click();
    await draft.fill("Unsubmitted draft");
    await draft.press("Home");
    await draft.press("ArrowRight");
    const selection = await draft.evaluate(element => (element as HTMLTextAreaElement).selectionStart);
    await draft.press("Escape");
    await expect(page.locator("#ux-title")).toHaveText("Discard changes?");
    await page.locator("#ux-cancel-button").click();
    await expect(draft).toHaveValue("Unsubmitted draft");
    await expect(draft).toBeFocused();
    expect(await draft.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(selection);
    await page.locator('[data-detail-cancel="body"]').click();
    await page.locator("#ux-submit-button").click();
    await expect(draft).toHaveCount(0);

    await page.locator("#comment-compose-toggle").click();
    await page.locator("#comment-body").fill("Checked the notice.");
    await page.locator("#comment-body").press("Control+Enter");
    await expect(page.locator("#ticket-comments")).toContainText("Checked the notice.");
    const ticketUrl = `${baseUrl}/api/tickets/${data.third.id}`;
    const readTicket = async () => (await page.request.get(ticketUrl)).json();
    const beforeMove = await readTicket();
    expect(beforeMove).toMatchObject({ boardId: data.b, bodyMarkdown: "", isResolved: false, tags: [expect.objectContaining({ id: data.qa.id })] });
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(viewUrl);
    await expect(ticketLink(page, data.third.id)).toBeFocused();
    await expect(page.locator(total)).toContainText(/\b3\b/);

    await ticketLink(page, data.third.id).press("Enter");
    await page.locator("#header-edit-button").click();
    const lanes = page.locator("#ticket-lane option");
    await expect(lanes).toHaveText(["Release review", "Accepted"]);
    await page.locator("#ticket-lane").selectOption(String(data.completed.id));
    await page.locator("#save-ticket-button").click();
    await showCurrentTicket(page);
    await expect(page.locator("#ticket-view-meta")).toContainText("Lane: Accepted");
    await expect(page.locator("#editor-form")).toHaveJSProperty("inert", false);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(viewUrl);
    await expect(ticketLink(page, data.third.id)).toHaveCount(0);
    await expect(page.locator(total)).toContainText(/\b2\b/);
    await expect(ticketLink(page, data.second.id)).toBeFocused();

    const afterMove = await readTicket();
    expect(afterMove).toMatchObject({ boardId: data.b, laneId: data.completed.id, isResolved: true, tags: beforeMove.tags });
    const comments = await (await page.request.get(ticketUrl + "/comments")).json();
    expect(comments.comments).toMatchObject([{ bodyMarkdown: "Checked the notice." }]);
    await page.reload();
    await expect(page.locator(total)).toContainText(/\b2\b/);
    await expect(ticketLink(page, data.third.id)).toHaveCount(0);
  } finally {
    await close();
  }
});

test("keeps the selected result page when changing display options and focuses the next row after a move", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Paginated review", laneNames: ["Checking"] });
    const completed = await createCompletionLane(page.request, baseUrl, board.id);
    const tickets = [];
    for (let index = 0; index < 52; index++) {
      tickets.push(await createTicket(page.request, baseUrl, board.id, {
        laneId: lanes[0].id, title: `Review item ${index + 1}`, bodyMarkdown: "A visible body.",
      }));
    }
    const saved = await saveView(page.request, baseUrl, {
      name: "Paginated view", scope: "all", boardIds: [], rules: [{ boardId: board.id, mode: "all", tagIds: [] }],
      completion: "open", showBody: true, showLatestComment: false,
    });
    await page.goto(`${baseUrl}/views/${saved.id}`);
    await expect(page.locator(total)).toContainText(/\b52\b/);
    await expect(page.locator("[data-view-ticket]")).toHaveCount(50);

    await page.locator(control("next")).press("Enter");
    await expect(ticketLink(page, tickets[50].id)).toBeFocused();
    await expect(page.locator("[data-view-ticket]")).toHaveCount(2);
    await page.locator(appearance("showBody")).click();
    await expect(page.getByText("A visible body.", { exact: true })).toHaveCount(0);
    await expect(ticketLink(page, tickets[50].id)).toBeVisible();
    await page.locator(control("revert-display")).click();
    await expect(page.getByText("A visible body.", { exact: true })).toHaveCount(2);
    await expect(ticketLink(page, tickets[50].id)).toBeVisible();

    await page.locator(control("previous")).press("Enter");
    await ticketLink(page, tickets[49].id).press("Enter");
    await page.locator("#header-edit-button").click();
    await page.locator("#ticket-lane").selectOption(String(completed.id));
    await page.locator("#save-ticket-button").click();
    await showCurrentTicket(page);
    await expect(page.locator("#ticket-view-meta")).toContainText("Lane: Accepted");
    await expect(page.locator("#editor-form")).toHaveJSProperty("inert", false);
    await page.keyboard.press("Escape");
    await expect(page.locator(total)).toContainText(/\b51\b/);
    await expect(ticketLink(page, tickets[50].id)).toBeFocused();
    await expect(page.locator("[data-view-ticket]")).toHaveCount(50);
  } finally {
    await close();
  }
});

test("reconciles another tab's comments and board order without replacing a newer view with an old response", async ({ page, browser }) => {
  const { baseUrl, close } = await startTestApp(page);
  let writer: Page | undefined;
  let releaseOldQuery = () => {};
  const oldQueryGate = new Promise<void>(resolve => { releaseOldQuery = resolve; });
  try {
    const data = await seed(page.request, baseUrl);
    const saved = await saveView(page.request, baseUrl, data.definition);
    const other = await saveView(page.request, baseUrl, {
      ...data.definition, name: "Editorial only", scope: "selected", boardIds: [data.a], rules: [data.definition.rules[0]],
    });
    await page.goto(`${baseUrl}/views/${saved.id}`);
    await expect(page.locator(total)).toContainText(/\b3\b/);
    writer = await browser.newPage();
    await writer.goto(`${baseUrl}/tickets/${data.third.id}`);
    await showCurrentTicket(writer);
    await writer.locator("#comment-compose-toggle").click();
    await writer.locator("#comment-body").fill("Update from another tab.");
    const newComment = writer.waitForResponse(response => response.request().method() === "POST" &&
      response.url().endsWith(`/api/tickets/${data.third.id}/comments`));
    await writer.locator("#comment-body").press("Control+Enter");
    const { id: commentId } = await (await newComment).json();
    await expect(page.getByText("Update from another tab.", { exact: true })).toBeVisible();
    const edit = await writer.request.patch(`${baseUrl}/api/comments/${commentId}`, { data: { bodyMarkdown: "Edited from another tab." } });
    expect(edit.status()).toBe(200);
    await expect(page.getByText("Edited from another tab.", { exact: true })).toBeVisible();
    expect((await writer.request.delete(`${baseUrl}/api/comments/${commentId}`)).status()).toBe(204);
    await expect(page.getByText("Edited from another tab.", { exact: true })).toHaveCount(0);

    const groups = page.locator("[data-view-group]");
    await expect(groups.first()).toHaveAttribute("data-view-group", String(data.a));
    const reorder = await writer.request.post(`${baseUrl}/api/boards/reorder`, { data: { boardIds: [data.b, data.a] } });
    expect(reorder.status()).toBe(200);
    await expect(groups.first()).toHaveAttribute("data-view-group", String(data.b));

    let resolvePending = () => {};
    const pending = new Promise<void>(resolve => { resolvePending = resolve; });
    const queryUrl = baseUrl + viewApi + "/query";
    await page.route(queryUrl, async route => {
      const { definition } = route.request().postDataJSON();
      if (definition.name !== data.definition.name || definition.showBody !== false) return route.continue();
      const response = await route.fetch();
      resolvePending();
      await oldQueryGate;
      await route.fulfill({ response });
    });
    await page.locator(appearance("showBody")).click();
    await pending;
    await page.locator(`[data-custom-view-id="${other.id}"]`).click();
    await expect(page.locator(heading)).toHaveText("Editorial only");
    const response = page.waitForResponse(r => r.url() === queryUrl &&
      r.request().postDataJSON().definition.name === data.definition.name &&
      r.request().postDataJSON().definition.showBody === false);
    releaseOldQuery();
    await (await response).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.locator(heading)).toHaveText("Editorial only");
    await expect(page.locator(total)).toContainText(/\b2\b/);
    await expect(ticketLink(page, data.third.id)).toHaveCount(0);
  } finally {
    releaseOldQuery();
    await writer?.close();
    await close();
  }
});

test("returns to a directly opened custom view after cancelling Back with a comment draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const data = await seed(page.request, baseUrl);
    const saved = await saveView(page.request, baseUrl, data.definition);
    const viewUrl = `${baseUrl}/views/${saved.id}`;
    const ticketUrl = `${baseUrl}/tickets/${data.third.id}`;
    await page.goto(viewUrl);
    await ticketLink(page, data.third.id).press("Enter");
    await expect(page).toHaveURL(ticketUrl);
    await showCurrentTicket(page);
    await page.locator("#comment-compose-toggle").click();
    const draft = page.locator("#comment-body");
    await draft.fill("Keep the comment draft");
    await draft.press("Home");
    await draft.press("ArrowRight");
    const selection = await draft.evaluate(element => (element as HTMLTextAreaElement).selectionStart);

    await page.goBack();
    await expect(page.locator("#ux-title")).toHaveText("Discard changes?");
    await page.locator("#ux-cancel-button").click();
    await expect(page).toHaveURL(ticketUrl);
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue("Keep the comment draft");
    expect(await draft.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(selection);

    await page.locator("#return-custom-view").click();
    await expect(page.locator("#ux-title")).toHaveText("Discard changes?");
    await page.locator("#ux-submit-button").click();
    await expect(page).toHaveURL(viewUrl);
    await expect(ticketLink(page, data.third.id)).toBeFocused();
    const result = await page.request.get(`${baseUrl}/api/tickets/${data.third.id}/comments`);
    expect((await result.json()).comments).toEqual([]);
  } finally {
    await close();
  }
});

test("ignores a previous board's slow ticket response after entering a custom view", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  let releaseTicket = () => {};
  const ticketGate = new Promise<void>(resolve => { releaseTicket = resolve; });
  try {
    const data = await seed(page.request, baseUrl);
    const saved = await saveView(page.request, baseUrl, data.definition);
    const errors: Error[] = [];
    page.on("pageerror", error => errors.push(error));
    const endpoint = `${baseUrl}/api/tickets/${data.first.id}`;
    let received = () => {};
    const requestStarted = new Promise<void>(resolve => { received = resolve; });
    await page.route(endpoint, async route => {
      const response = await route.fetch();
      received();
      await ticketGate;
      await route.fulfill({ response });
    });
    await page.goto(`${baseUrl}/boards/${data.a}`);
    await page.getByRole("button", { name: data.first.title, exact: true }).click();
    await requestStarted;
    await page.locator(`[data-custom-view-id="${saved.id}"]`).click();
    await expect(page.locator(heading)).toHaveText(data.definition.name);
    const ticketResponse = page.waitForResponse(endpoint);
    releaseTicket();
    await (await ticketResponse).finished();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page).toHaveURL(`${baseUrl}/views/${saved.id}`);
    await expect(page.locator("#editor-dialog")).not.toBeVisible();
    await expect(page.locator("#editor-header-title")).not.toHaveText(data.first.title);
    expect(errors).toEqual([]);
  } finally {
    releaseTicket();
    await close();
  }
});
