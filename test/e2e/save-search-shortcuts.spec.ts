import { expect, test, type Locator } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

function holdResponse() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function pressGuardedSave(input: Locator) {
  await input.dispatchEvent("compositionstart");
  await input.press("Control+Enter");
  await input.dispatchEvent("compositionend");
  for (const properties of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { shiftKey: true }, { altKey: true }]) {
    await input.dispatchEvent("keydown", { key: "Enter", ctrlKey: true, ...properties });
  }
}

test("the full ticket editor saves once via the shortcut and persists the title and body", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const responseGate = holdResponse();
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Ticket shortcuts", laneNames: ["In progress"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Original", bodyMarkdown: "Before" });
    const url = `${baseUrl}/api/tickets/${ticket.id}`;
    let saves = 0;
    await page.route(url, async route => {
      if (route.request().method() === "PATCH") {
        saves++;
        await responseGate.promise;
      }
      await route.continue();
    });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator("#header-edit-button").click();
    const title = page.locator("#ticket-title");
    const body = page.locator("#ticket-body");
    await expect(page.locator("#save-ticket-button")).toHaveAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
    await title.clear();
    await body.press("Control+Enter");
    await expect(title).toBeFocused();
    expect(saves).toBe(0);
    await title.fill("Changed title");
    await body.fill("Changed **body**");
    await pressGuardedSave(body);
    expect(saves).toBe(0);
    expect(await (await page.request.get(url)).json()).toMatchObject({ title: "Original", bodyMarkdown: "Before" });

    await body.press("Control+Enter");
    await expect.poll(() => saves).toBe(1);
    await body.press("Meta+Enter");
    responseGate.release();
    await expect(page.locator("#editor-header-title")).toHaveText("Changed title");
    expect(saves).toBe(1);
    expect(await (await page.request.get(url)).json()).toMatchObject({ title: "Changed title", bodyMarkdown: "Changed **body**" });
    await page.reload();
    await expect(page.locator("#ticket-view-body")).toContainText("Changed body");
  } finally {
    responseGate.release();
    await close();
  }
});

test("the comment composer ignores empty and guarded submissions and posts once via the shortcut", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  const responseGate = holdResponse();
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Comment shortcuts", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Discussion" });
    const url = `${baseUrl}/api/tickets/${ticket.id}`;
    let posts = 0;
    await page.route(`${url}/comments`, async route => {
      if (route.request().method() === "POST") {
        posts++;
        await responseGate.promise;
      }
      await route.continue();
    });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.locator("#comment-compose-toggle").click();
    const input = page.locator("#comment-body");
    await expect(page.locator("#save-comment-button")).toHaveAttribute("aria-keyshortcuts", "Control+Enter Meta+Enter");
    await input.fill("   ");
    await input.press("Control+Enter");
    await expect(page.locator("#toast")).toHaveText("Comment is required");
    await input.fill("First line");
    await input.press("Enter");
    await input.press("x");
    await expect(input).toHaveValue("First line\nx");
    await pressGuardedSave(input);
    expect(posts).toBe(0);
    expect((await (await page.request.get(url)).json()).comments).toHaveLength(0);

    await input.fill("Posted **with the keyboard**");
    await input.press("Meta+Enter");
    await expect.poll(() => posts).toBe(1);
    await input.press("Control+Enter");
    await expect(input).toHaveJSProperty("readOnly", true);
    responseGate.release();
    await expect(page.locator("#ticket-comments")).toContainText("Posted with the keyboard");
    expect(posts).toBe(1);
    const { comments } = await (await page.request.get(url)).json();
    expect(comments).toHaveLength(1);
    expect(comments[0].bodyMarkdown).toBe("Posted **with the keyboard**");
    await page.reload();
    await expect(page.locator("#ticket-comments")).toContainText("Posted with the keyboard");
  } finally {
    responseGate.release();
    await close();
  }
});

test("slash focuses the existing Kanban and List search without consuming text input", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Search shortcuts", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Find this ticket" });
    const search = page.locator("#search-input");
    for (const view of ["", "/list"]) {
      await page.goto(`${baseUrl}/boards/${board.id}${view}`);
      const title = page.getByRole("button", { name: ticket.title, exact: true });
      await search.fill("Find");
      await title.focus();
      for (const properties of [{ isComposing: true }, { keyCode: 229 }, { repeat: true }, { ctrlKey: true }, { altKey: true }, { shiftKey: true }, { metaKey: true }]) {
        await title.dispatchEvent("keydown", { key: "/", ...properties });
        await expect(title).toBeFocused();
      }
      await page.keyboard.press("/");
      await expect(search).toBeFocused();
      await expect(search).toHaveValue("Find");
      await page.keyboard.press("End");
      await page.keyboard.press("/");
      await expect(search).toHaveValue("Find/");
    }

    await page.evaluate(() => {
      const editor = document.createElement("div");
      editor.contentEditable = "true";
      editor.id = "test-contenteditable";
      editor.append(document.createElement("span"));
      document.querySelector("main")!.append(editor);
      editor.querySelector("span")!.focus();
    });
    const editable = page.locator("#test-contenteditable");
    await editable.press("/");
    await expect(editable).toBeFocused();
    await expect(editable).toHaveText("/");
    await search.clear();
    await page.getByRole("button", { name: ticket.title, exact: true }).click();
    await expect(page.locator("#editor-dialog")).toBeVisible();
    await page.keyboard.press("/");
    await expect(search).not.toBeFocused();
    await expect(search).toHaveValue("");
  } finally { await close(); }
});
