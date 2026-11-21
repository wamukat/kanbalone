import { expect, test } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

for (const locale of ["ja-JP", "en-US", "fr-FR"]) {
  test(`initial language follows ${locale}, and a manual choice survives reload and another board`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const { baseUrl, close } = await startTestApp(page);
    try {
      const first = await createBoard(page.request, baseUrl, { name: "Save / 保存", laneNames: ["Open / 未完了"] });
      const second = await createBoard(page.request, baseUrl, { name: "Second board", laneNames: ["Todo"] });
      await page.goto(`${baseUrl}/boards/${first.board.id}`);
      const initial = locale.startsWith("ja") ? "ja" : "en";
      await expect(page.locator("html")).toHaveAttribute("lang", initial);
      await page.locator("#board-settings-toggle-button").click();
      await expect(page.locator("#language-select")).toHaveValue(initial);
      const chosen = initial === "ja" ? "en" : "ja";
      await page.locator("#language-select").selectOption(chosen);
      await expect(page.locator("html")).toHaveAttribute("lang", chosen);
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", chosen);
      await page.goto(`${baseUrl}/boards/${second.board.id}`);
      await expect(page.locator("html")).toHaveAttribute("lang", chosen);
      expect(await page.evaluate(() => localStorage.getItem("kanbalone:language"))).toBe(chosen);
      const stored = await (await page.request.get(`${baseUrl}/api/boards/${first.board.id}`)).json();
      expect(stored.board.name).toBe("Save / 保存");
      expect(stored.lanes[0].name).toBe("Open / 未完了");
    } finally { await close(); await context.close(); }
  });
}

for (const locale of ["en-US", "ja-JP"]) {
  test(`${locale}: all views, ticket detail, and confirmation preserve user content`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const { baseUrl, close } = await startTestApp(page);
    const japanese = locale.startsWith("ja");
    try {
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Board 日本語 <&>", laneNames: ["Open / 未完了"] });
      const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, {
        data: { name: "Save / 保存", descriptionMarkdown: "**Original** 日本語" },
      })).json();
      const ticket = await createTicket(page.request, baseUrl, board.id, {
        laneId: lanes[0].id, title: "Delete / 削除 <&>", bodyMarkdown: "**Save** / 保存", groupId: group.id,
      });
      await page.goto(`${baseUrl}/boards/${board.id}`);
      await expect(page.locator(".ticket-card")).toContainText(ticket.title);
      await expect(page.locator("#status-filter-summary")).toHaveText(japanese ? "未完了" : "Open");
      await page.locator('[data-view-mode="list"]').click();
      await expect(page.locator("#list-board")).toContainText(ticket.title);
      await page.locator('[data-view-mode="group"]').click();
      await page.locator(`[data-select-group="${group.id}"]`).click();
      await expect(page.locator(".group-name")).toHaveText(group.name);
      await expect(page.locator(".group-ticket-title")).toContainText(ticket.title);
      await page.locator(`[data-group-ticket="${ticket.id}"]`).click();
      await expect(page.locator(".ticket-lane-meta")).toHaveText(`${japanese ? "レーン：" : "Lane:"} ${lanes[0].name}`);
      await expect(page.locator("#ticket-view")).toContainText("Save / 保存");
      await page.locator("#header-edit-button").click();
      await expect(page.locator("#delete-ticket-button")).toHaveText(japanese ? "削除" : "Delete");
      await page.locator("#delete-ticket-button").click();
      await expect(page.locator("#ux-dialog")).toBeVisible();
      await expect(page.locator("#ux-submit-button")).toHaveText(japanese ? "削除" : "Delete");
      await expect(page.locator("#ux-dismiss-button")).toHaveText(japanese ? "キャンセル" : "Cancel");
      await page.locator("#ux-dismiss-button").click();
      const stored = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
      expect(stored.title).toBe(ticket.title);
      expect(stored.bodyMarkdown).toBe("**Save** / 保存");
      expect(stored.groupId).toBe(group.id);
      expect(stored.isResolved).toBe(false);
    } finally { await close(); await context.close(); }
  });
}

test("Japanese startup remains usable when preference storage is unavailable", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ja-JP" });
  await context.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Storage blocked", "SecurityError"); };
  });
  const page = await context.newPage();
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "No storage", laneNames: ["Todo"] });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await page.locator("#board-settings-toggle-button").click();
    await expect(page.locator("#language-select")).toHaveValue("ja");
    await expect(page.locator("#lane-board")).toBeVisible();
    await page.locator("#language-select").selectOption("en");
    await expect(page.locator("#language-select")).toHaveValue("ja");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    await expect(page.getByText("言語設定を保存できませんでした。ブラウザの保存設定を確認してください。", { exact: true })).toBeVisible();
  } finally { await close(); await context.close(); }
});

test("cancelling a language change preserves Group and board-name drafts", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ja-JP" });
  const page = await context.newPage();
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Original board", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Original Group" } })).json();
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await page.locator(`[data-select-group="${group.id}"]`).click();
    await page.locator('[data-group-action="edit-description"]').click();
    await page.locator('[name="description"]').fill("Unsaved 日本語 description");
    await page.locator("#board-settings-toggle-button").click();
    await page.locator("#language-select").selectOption("en");
    await expect(page.locator("#ux-title")).toHaveText("言語を変更しますか？");
    await page.locator("#ux-dismiss-button").click();
    await expect(page.locator("#language-select")).toHaveValue("ja");
    await expect(page.locator('[name="description"]')).toHaveValue("Unsaved 日本語 description");
    await page.locator('[data-group-action="cancel-description"]').click();
    await page.locator('[data-board-rename-start]').click();
    await page.locator('#board-rename-input').fill("Unsaved board name");
    await page.locator("#language-select").focus();
    await page.locator("#language-select").selectOption("en");
    await expect(page.locator("#ux-title")).toHaveText("言語を変更しますか？");
    await page.locator("#ux-dismiss-button").click();
    await expect(page.locator('#board-rename-input')).toHaveValue("Unsaved board name");
    await expect(page.locator("html")).toHaveAttribute("lang", "ja");
    const saved = await (await page.request.get(`${baseUrl}/api/boards/${board.id}`)).json();
    expect(saved.board.name).toBe("Original board");
  } finally { await close(); await context.close(); }
});

test("Japanese sidebar view labels stay on one line without clipping", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ja-JP", viewport: { width: 1280, height: 844 } });
  const page = await context.newPage();
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Sidebar", laneNames: ["Todo"] });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    for (const mode of ["kanban", "list", "group"]) {
      const label = page.locator(`[data-view-mode="${mode}"] span`);
      await expect(label).toBeVisible();
      const dimensions = await label.evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element);
        const text = range.getBoundingClientRect(); const button = element.parentElement!.getBoundingClientRect();
        return { lines: range.getClientRects().length, textLeft: text.left, textRight: text.right, buttonLeft: button.left, buttonRight: button.right };
      });
      expect(dimensions.lines).toBe(1);
      expect(dimensions.textLeft).toBeGreaterThanOrEqual(dimensions.buttonLeft);
      expect(dimensions.textRight).toBeLessThanOrEqual(dimensions.buttonRight);
    }
    await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Layout" } });
    await page.locator('[data-view-mode="group"]').click();
    await expect(page.locator(".group-list-controls")).toBeVisible();
    const controls = await page.locator(".group-list-controls > *").evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, middle: rect.top + rect.height / 2 };
    }));
    expect(controls[1].left).toBeGreaterThanOrEqual(controls[0].right);
    expect(Math.abs(controls[1].middle - controls[0].middle)).toBeLessThan(1);
  } finally { await close(); await context.close(); }
});

test("Japanese editor creates a ticket and persists its original content and API values", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ja-JP" });
  const page = await context.newPage();
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "日本語で作業", laneNames: ["Todo", "Review"] });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.locator(".add-ticket-button").first().click();
    await expect(page.locator("#save-ticket-button")).toHaveText("保存");
    await page.locator("#ticket-title").fill("Save / 保存 <&>");
    await page.locator("#ticket-body").fill("**Original** 日本語の本文");
    await page.locator("#ticket-priority").selectOption("3");
    await page.locator("#ticket-lane").selectOption(String(lanes[1].id));
    const pending = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/api/boards/${board.id}/tickets`));
    await page.locator("#save-ticket-button").click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const ticket = await response.json();
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator(".ticket-card")).toContainText("Save / 保存 <&>");
    const saved = await (await page.request.get(`${baseUrl}/api/tickets/${ticket.id}`)).json();
    expect(saved.title).toBe("Save / 保存 <&>");
    expect(saved.bodyMarkdown).toBe("**Original** 日本語の本文");
    expect(saved.laneId).toBe(lanes[1].id);
    expect(saved.priority).toBe(3);
    expect(saved.isResolved).toBe(false);
  } finally { await close(); await context.close(); }
});
