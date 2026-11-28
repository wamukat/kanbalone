import { expect, test, type Page } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

async function postComment(page: Page, text: string) {
  const toggle = page.locator("#comment-compose-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#comment-body").fill(text);
  await page.locator("#save-comment-button").click();
  return page.locator(".comment-item", { hasText: text });
}

test("the browser records the configured updater without overwriting existing attribution or preferences", async ({ browser }) => {
  const context = await browser.newContext({ locale: "en-US" });
  const settings = await context.newPage();
  const { baseUrl, close } = await startTestApp(settings);
  try {
    const { board, lanes } = await createBoard(settings.request, baseUrl, { name: "Review board", laneNames: ["Todo"] });
    const ticket = await createTicket(settings.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Review the checklist" });
    const boardUrl = `${baseUrl}/boards/${board.id}`;
    const legacyPreferences = JSON.stringify({ activeBoardId: board.id, filtersByBoardId: { [board.id]: { q: "checklist", status: ["archived"] } } });
    await context.addInitScript(({ origin, value }) => {
      if (location.origin === origin && !localStorage.getItem("kanbalone:ui-preferences")) {
        localStorage.setItem("kanbalone:ui-preferences", value);
      }
    }, { origin: baseUrl, value: legacyPreferences });
    await settings.goto(boardUrl);
    await expect(settings.locator(".ticket-card")).toContainText(ticket.title);
    await settings.locator("#board-settings-toggle-button").click();
    const updater = settings.getByRole("textbox", { name: "Updater", exact: true });
    const save = settings.locator("#operation-updater-form").getByRole("button", { name: "Save" });
    await expect(updater).toHaveValue("画面");

    const reader = await context.newPage();
    const ticketUrl = `${baseUrl}/tickets/${ticket.id}`;
    await reader.goto(ticketUrl);
    const first = await postComment(reader, "Default updater comment");
    await expect(first.locator(".record-updater")).toHaveText("画面");
    const preferencesBefore = await settings.evaluate(() => localStorage.getItem("kanbalone:ui-preferences"));
    expect(JSON.parse(preferencesBefore!).boards[board.id].filters).toMatchObject({ q: "checklist", includeArchived: true });

    await updater.fill("  ");
    await save.click();
    await expect(updater).toHaveAttribute("aria-invalid", "true");
    await expect(settings.locator("#operation-updater-error")).toBeVisible();
    const name = "Reviewer <b>&";
    await updater.fill(name);
    await save.click();
    await expect(settings.locator("#operation-updater-status")).toHaveText("Saved");
    expect(await settings.evaluate(() => localStorage.getItem("kanbalone:ui-preferences"))).toBe(preferencesBefore);

    const second = await postComment(reader, "Named updater comment");
    await expect(second.locator(".record-updater")).toHaveText(name);
    await expect(second.locator(".record-updater b")).toHaveCount(0);
    await expect(first.locator(".record-updater")).toHaveText("画面");
    const { comments } = await (await settings.request.get(`${baseUrl}/api/tickets/${ticket.id}/comments`)).json();
    expect(comments.map((comment: { updater: string }) => comment.updater)).toEqual([name, "画面"]);

    await reader.reload();
    await expect(second.locator(".record-updater")).toHaveText(name);
    await reader.locator("#activity-tab-button").click();
    await expect(reader.locator("#ticket-activity .record-updater")).toHaveText([name, "画面", "API"]);
    await settings.reload();
    await settings.locator("#board-settings-toggle-button").click();
    await expect(updater).toHaveValue(name);
    await settings.evaluate(() => localStorage.removeItem("kanbalone:operation-updater"));
    await settings.reload();
    await settings.locator("#board-settings-toggle-button").click();
    await expect(updater).toHaveValue("画面");
  } finally { await context.close(); await close(); }
});

test("failed storage is visible and the browser still attributes writes to the default updater", async ({ browser }) => {
  const context = await browser.newContext({ locale: "ja-JP" });
  await context.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "kanbalone:operation-updater") throw new DOMException("Storage blocked", "SecurityError");
      return setItem.call(this, key, value);
    };
  });
  const page = await context.newPage();
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Storage test", laneNames: ["Todo"] });
    const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Verify storage" });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    await page.locator("#board-settings-toggle-button").click();
    const updater = page.getByRole("textbox", { name: "更新者", exact: true });
    await expect(updater).toHaveValue("画面");
    await updater.fill("失敗する設定");
    await updater.press("Enter");
    await expect(page.locator("#operation-updater-error")).toHaveText("更新者を保存できませんでした。ブラウザの保存設定を確認してください。");
    await expect(page.locator("#operation-updater-status")).toHaveText("");
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    const comment = await postComment(page, "保存できない場合も投稿できます。");
    await expect(comment.locator(".record-updater")).toHaveText("画面");
  } finally { await context.close(); await close(); }
});
