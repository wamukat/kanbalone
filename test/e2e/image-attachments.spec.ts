import { expect, test, type Locator, type Page } from "@playwright/test";
import { createBoard, createTicket, startTestApp, showCurrentTicket } from "./helpers.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUa8AAAAASUVORK5CYII=";
const imageUrl = /\/api\/attachments\/[a-f0-9]{64}/;
const uploadRoute = "**/api/attachments";

type ImageFile = { name: string; type?: string; data?: string; size?: number };

async function transfer(input: Locator, kind: "paste" | "drop", files: ImageFile[], start: number, end = start) {
  return input.evaluate((element, { kind, files, start, end, png }) => {
    const editor = element as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(start, end);
    const data = new DataTransfer();
    for (const { name, type = "image/png", data: base64 = png, size } of files) {
      const bytes = size ? new Uint8Array(size) : Uint8Array.from(atob(base64), value => value.charCodeAt(0));
      data.items.add(new File([bytes], name, { type }));
    }
    return !editor.dispatchEvent(kind === "drop"
      ? new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true })
      : new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { kind, files, start, end, png: PNG });
}

async function expectLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute("src", imageUrl);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1);
}

function uploadStatus(input: Locator) {
  return input.locator("+ .image-attachment-feedback [data-image-upload-status]");
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function delayUpload(page: Page) {
  const release = deferred();
  const received = deferred();
  const finished = deferred();
  await page.route(uploadRoute, async (route) => {
    try {
      const response = await route.fetch();
      received.resolve();
      await release.promise;
      await route.fulfill({ response });
    } finally {
      finished.resolve();
    }
  }, { times: 1 });
  return { received: received.promise, finished: finished.promise, release: () => release.resolve() };
}

test("ticket creation and full edit persist PNGs at the original selection", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const upload = await delayUpload(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Image board", laneNames: ["Todo"] });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();
    const input = page.locator("#ticket-body");
    await page.locator("#ticket-title").fill("Image draft");
    await input.fill("Before replace after");
    expect(await transfer(input, "paste", [{ name: "first[1](a)\n.png" }], 7, 14)).toBe(true);
    await upload.received;
    await expect(uploadStatus(input)).toHaveText("Uploading images…");
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#toast")).toHaveText("Please wait until the image upload finishes");
    const readTickets = async () => (await (await page.request.get(`${baseUrl}/api/boards/${board.id}/tickets`)).json()).tickets;
    expect(await readTickets()).toHaveLength(0);
    await input.press("End");
    await input.press("!");
    upload.release();
    await expect(input).toHaveValue(/^Before !\[first&#91;1&#93;&#40;a&#41; \.png\]\(\/api\/attachments\/[a-f0-9]{64}\) after!$/);
    const createdMarkdown = await input.inputValue();
    expect(await input.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(createdMarkdown.length);
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#editor-dialog")).not.toBeVisible();
    const [ticket] = await readTickets();
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    const persisted = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(persisted.bodyMarkdown).toBe(createdMarkdown);
    await showCurrentTicket(page);
    const body = page.locator("#ticket-view-body");
    await expectLoaded(body.locator("img"));
    await expect(body.locator("img")).toHaveAttribute("alt", "first[1](a) .png");
    const src = (await body.locator("img").getAttribute("src"))!;
    const getImage = await page.request.get(baseUrl + src);
    expect(getImage.headers()["content-type"]).toBe("image/png");
    expect(await getImage.body()).toEqual(Buffer.from(PNG, "base64"));

    await page.locator("#header-edit-button").click();
    await transfer(input, "drop", [{ name: "full-edit.png" }], 0);
    await expect(input).toHaveValue(/^!\[full-edit.png\]/);
    await input.press("Meta+Enter");
    await expect(body.locator("img")).toHaveCount(2);
    const stored = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(stored.bodyMarkdown).toBe(`![full-edit.png](${src})${createdMarkdown}`);
    await page.reload();
    await showCurrentTicket(page);
    await expectLoaded(body.locator('img[alt="full-edit.png"]'));
  } finally {
    upload.release();
    await close();
  }
});

test("inline body drop keeps file order across reversed responses and a comment refresh", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const release = deferred();
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Image board", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Inline", bodyMarkdown: "Start end" });
    let requested = 0;
    await page.route(uploadRoute, async route => {
      const index = ++requested;
      const response = await route.fetch();
      if (index === 1) await release.promise;
      await route.fulfill({ response });
    });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await showCurrentTicket(page);
    await page.locator('[data-detail-edit="body"]').click();
    const input = page.locator("[data-detail-body-input]");
    const secondResponse = page.waitForResponse(response => response.url().endsWith("/api/attachments"));
    await transfer(input, "drop", [{ name: "first.png" }, { name: "second.png" }], 6);
    expect((await secondResponse).status()).toBe(201);
    await input.press("Control+Enter");
    await expect(page.locator("#toast")).toHaveText("Please wait until the image upload finishes");
    await page.locator("#comment-compose-toggle").click();
    await page.locator("#comment-body").fill("Refresh during upload");
    await page.locator("#save-comment-button").click();
    await expect(page.locator("#ticket-comments")).toContainText("Refresh during upload");
    await expect(input).toHaveValue("Start end");
    await expect(uploadStatus(input)).toHaveText("Uploading images…");
    release.resolve();
    await expect(input).toHaveValue(/^Start !\[first.png\]\([^)]*\)\n!\[second.png\]\([^)]*\)end$/);
    await input.press("Control+Enter");
    const images = page.locator("#ticket-view-body img");
    await expect(images).toHaveCount(2);
    await expectLoaded(images.nth(0));
    await expectLoaded(images.nth(1));
    expect(await images.evaluateAll(elements => elements.map(el => el.getAttribute("alt")))).toEqual(["first.png", "second.png"]);
  } finally {
    release.resolve();
    await close();
  }
});

test("comment composer and inline editor keep uploads with the correct draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const upload = await delayUpload(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Comments", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Comment images" });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    const composer = page.locator("#comment-body");
    await showCurrentTicket(page);
    await page.locator("#comment-compose-toggle").click();
    const composerPadding = await composer.evaluate(element => getComputedStyle(element).padding);
    await composer.fill("A Z");
    await transfer(composer, "paste", [{ name: "comment.png" }], 2);
    await upload.received;
    await composer.press("Control+Enter");
    await expect(page.locator("#toast")).toHaveText("Please wait until the image upload finishes");
    await page.locator("#comment-compose-toggle").click();
    await expect(composer).toBeHidden();
    upload.release();
    await upload.finished;
    await page.locator("#comment-compose-toggle").click();
    await expect(composer).toHaveValue(/^A !\[comment.png\]\([^)]*\)Z$/);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ux-title")).toHaveText("Discard changes?");
    await page.locator("#ux-cancel-button").click();
    await expect(composer).toHaveValue(/^A !\[comment.png\]\([^)]*\)Z$/);
    const failedPost = deferred();
    try {
      await page.route(`**/api/tickets/${ticket.id}/comments`, async route => {
        await failedPost.promise;
        await route.fulfill({ status: 500, json: { error: "Injected comment save failure" } });
      }, { times: 1 });
      await page.locator("#save-comment-button").click();
      await expect(composer).toHaveJSProperty("readOnly", true);
      await composer.press("Escape");
      await expect(page.locator("#toast")).toHaveText("Please wait until saving finishes");
      await expect(page.locator("#editor-dialog")).toBeVisible();
      failedPost.resolve();
      await expect(page.locator("#comment-save-state")).toHaveText("Save failed");
      await expect(composer).toHaveValue(/^A !\[comment.png\]\([^)]*\)Z$/);
    } finally {
      failedPost.resolve();
    }
    await page.locator("#save-comment-button").click();
    const item = page.locator(".comment-item");
    await expectLoaded(item.locator('img[alt="comment.png"]'));
    const edit = async () => {
      await item.locator("[data-toggle-comment-actions]").click();
      await item.locator("[data-edit-comment-id]").click();
    };
    const inline = item.locator("[data-comment-edit-body]");
    const delayed = await delayUpload(page);
    try {
      await edit();
      await expect(inline).toHaveCSS("padding", composerPadding);
      const original = await inline.inputValue();
      await transfer(inline, "paste", [{ name: "cancelled.png" }], 0);
      await delayed.received;
      await item.locator("[data-save-comment-id]").click();
      await expect(page.locator("#toast")).toHaveText("Please wait until the image upload finishes");
      await item.locator("[data-cancel-comment-edit]").click();
      await edit();
      delayed.release();
      await delayed.finished;
      await expect(inline).toHaveValue(original);
      await transfer(inline, "drop", [{ name: "edited.png" }], 0);
      await expect(inline).toHaveValue(/^!\[edited.png\]/);
      await inline.press("Escape");
      await expect(page.locator("#ux-title")).toHaveText("Discard changes?");
      await page.locator("#ux-cancel-button").click();
      await expect(inline).toHaveValue(/^!\[edited.png\]/);
      await item.locator("[data-save-comment-id]").click();
      await expectLoaded(item.locator('img[alt="edited.png"]'));
      const saved = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
      expect(saved.comments[0].bodyMarkdown).toMatch(/^!\[edited.png\]\([^)]*\)A !\[comment.png\]\([^)]*\)Z$/);
      await page.reload();
      await showCurrentTicket(page);
      await expectLoaded(item.locator('img[alt="edited.png"]'));
    } finally {
      delayed.release();
    }
  } finally {
    upload.release();
    await close();
  }
});

test("rejected files preserve the selection, report errors and allow a retry", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Image recovery", laneNames: ["Todo"] });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();
    const input = page.locator("#ticket-body");
    await input.fill("Keep selected text");
    await transfer(input, "drop", [{ name: "vector.svg", type: "image/svg+xml" }, { name: "large.png", size: 10 * 1024 * 1024 + 1 }], 0, 4);
    await expect(uploadStatus(input)).toContainText("Unsupported image type: vector.svg");
    await expect(uploadStatus(input)).toContainText("Image exceeds 10 MiB: large.png");
    await expect(input).toHaveValue("Keep selected text");

    await transfer(input, "paste", [{ name: "broken.png", data: "YQ==" }, { name: "valid.png" }], 0, 4);
    await expect(uploadStatus(input)).toContainText("Invalid image: broken.png");
    await expect(input).toHaveValue(/^!\[valid.png\]\([^)]*\)Keep selected text$/);
    await transfer(input, "paste", [{ name: "retry.png" }], (await input.inputValue()).length);
    await expect(uploadStatus(input)).toHaveText("");
    await expect(input).toHaveValue(/Keep selected text!\[retry.png\]/);

    // Leave ordinary clipboard text to the browser's native paste action.
    const plainPastePrevented = await input.evaluate(element => {
      const data = new DataTransfer();
      data.setData("text/plain", "Text only");
      return !element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    expect(plainPastePrevented).toBe(false);
  } finally { await close(); }
});

test("a discarded upload cannot change the next board's comment draft", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const upload = await delayUpload(page);
  try {
    const first = await createBoard(page.request, baseUrl, { name: "First board", laneNames: ["Todo"] });
    const second = await createBoard(page.request, baseUrl, { name: "Second board", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, first.board.id, { laneId: first.lanes[0].id, title: "First ticket" });
    const next = await createTicket(page.request, baseUrl, second.board.id, { laneId: second.lanes[0].id, title: "Second ticket" });
    await page.goto(`${baseUrl}/boards/${first.board.id}`);
    await page.getByRole("button", { name: "First ticket", exact: true }).click();
    const composer = page.locator("#comment-body");
    await showCurrentTicket(page);
    await page.locator("#comment-compose-toggle").click();
    await composer.fill("First draft");
    await transfer(composer, "paste", [{ name: "old.png" }], 0);
    await upload.received;
    await page.goBack();
    await expect(page.locator("#ux-title")).toHaveText("Discard changes?");
    await page.locator("#ux-submit-button").click();
    await expect(page.locator("#editor-dialog")).not.toBeVisible();

    await page.getByRole("button", { name: "Second board", exact: true }).click();
    await page.getByRole("button", { name: "Second ticket", exact: true }).click();
    await showCurrentTicket(page);
    await page.locator("#comment-compose-toggle").click();
    await composer.fill("Second draft");
    upload.release();
    await upload.finished;
    await expect(composer).toHaveValue("Second draft");
    await expect(uploadStatus(composer)).toHaveText("");
    await page.locator("#save-comment-button").click();
    await expect(page.locator("#ticket-comments")).toContainText("Second draft");
    const original = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${next.id}`)).json();
    expect(original.comments).toHaveLength(0);
    expect(saved.comments[0].bodyMarkdown).toBe("Second draft");
  } finally {
    upload.release();
    await close();
  }
});

test("text pasted over a pending selection survives image completion during composition", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const upload = await delayUpload(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Image range", laneNames: ["Todo"] });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.getByRole("button", { name: "New ticket" }).click();
    const input = page.locator("#ticket-body");
    await input.fill("cow");
    await transfer(input, "drop", [{ name: "pending.png" }], 0, 3);
    await upload.received;
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.evaluate(() => navigator.clipboard.writeText("cowbell"));
    await input.press("ControlOrMeta+v");
    await expect(input).toHaveValue("cowbell");
    await input.dispatchEvent("compositionstart");
    const response = page.waitForResponse(response => response.url().endsWith("/api/attachments"));
    upload.release();
    expect((await response).status()).toBe(201);
    await expect(input).toHaveValue("cowbell");
    await input.dispatchEvent("compositionend");
    await expect(input).toHaveValue(/^cowbell!\[pending.png\]\([^)]*\)$/);
  } finally {
    upload.release();
    await close();
  }
});
