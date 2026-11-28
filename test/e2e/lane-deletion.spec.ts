import { expect, test, type Page } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

async function openLaneDeletion(page: Page, laneId: number) {
  const lane = page.locator(`.lane[data-lane-id="${laneId}"]`);
  await lane.locator("[data-action='toggle-lane-actions']").click();
  const trigger = lane.locator("[data-action='delete-lane']");
  await trigger.press("Enter");
  await expect(page.locator("#ux-dialog:modal")).toBeVisible();
  return trigger;
}

test("lane deletion preflight counts filtered and archived tickets without attempting DELETE", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, {
      name: "Operations desk", laneNames: ["Review", "Archive", "Handoff"],
    });
    const [review, archive, handoff] = lanes;
    const active = await createTicket(page.request, baseUrl, board.id, { laneId: review.id, title: "Check restore instructions" });
    const archived = await createTicket(page.request, baseUrl, board.id, { laneId: archive.id, title: "Retain prior results", isArchived: true });
    let deleteRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "DELETE" && request.url().includes("/api/lanes/")) deleteRequests++;
    });

    await page.goto(`${baseUrl}/boards/${board.id}`);
    await expect(page.locator(`[data-ticket-id="${active.id}"]`)).toBeVisible();
    await page.locator("#search-input").fill("Unmatched sample");
    await expect(page.locator(`[data-ticket-id="${active.id}"]`)).toHaveCount(0);
    const trigger = await openLaneDeletion(page, review.id);
    await expect(page.getByRole("dialog", { name: "Cannot delete lane" })).toBeVisible();
    await expect(page.locator("#ux-message")).toContainText('Lane "Review" still contains tickets (1 total).');
    await expect(page.locator("#ux-message")).toContainText("Move the tickets to another lane");
    await expect(page.locator("#ux-submit-button")).toBeHidden();
    await page.locator("#ux-form").evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.getByRole("dialog", { name: "Cannot delete lane" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();

    await page.locator("#search-input").fill("");
    await expect(page.locator(`[data-ticket-id="${archived.id}"]`)).toHaveCount(0);
    await openLaneDeletion(page, archive.id);
    await expect(page.locator("#ux-message")).toContainText('Lane "Archive" still contains tickets (1 total, including 1 archived).');
    await expect(page.locator("#ux-message")).toContainText("Use Include archived tickets");
    await expect(page.locator("#ux-submit-button")).toBeHidden();
    await page.locator("#ux-dismiss-button").click();

    await openLaneDeletion(page, handoff.id);
    await expect(page.locator("#ux-submit-button")).toBeVisible();
    await expect(page.locator("#ux-submit-button")).toBeEnabled();
    await page.locator("#ux-dismiss-button").click();
    expect(deleteRequests).toBe(0);
    const stored = await (await page.request.get(`${baseUrl}/api/tickets/${archived.id}`)).json();
    expect(stored).toMatchObject({ laneId: archive.id, isArchived: true });
  } finally {
    await close();
  }
});

test("lane deletion closes on success and converts a newly occupied lane to a dismiss-only notice", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.addInitScript(() => localStorage.setItem("kanbalone:language", "ja"));
  const { baseUrl, close } = await startTestApp(page);
  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, {
      name: "Operations desk", laneNames: ["Review", "引き継ぎ"],
    });
    const [empty, changed] = lanes;
    await page.goto(`${baseUrl}/boards/${board.id}`);
    const heading = page.locator("#ux-title");
    const submit = page.locator("#ux-submit-button");
    await openLaneDeletion(page, empty.id);
    await expect(heading).toHaveText("レーンを削除");
    await expect(page.locator("#ux-dismiss-button")).toBeFocused();
    await submit.click();
    await expect(page.locator(`.lane[data-lane-id="${empty.id}"]`)).toHaveCount(0);
    expect((await page.request.get(`${baseUrl}/api/lanes/${empty.id}/ticket-counts`)).status()).toBe(404);

    const conflictUrl = `${baseUrl}/api/lanes/${changed.id}`;
    let deleteRequests = 0;
    await page.route(conflictUrl, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteRequests++;
        await deleteGate;
      }
      await route.continue();
    });
    await openLaneDeletion(page, changed.id);
    await expect(heading).toHaveText("レーンを削除");
    const responsePromise = page.waitForResponse(response => response.url() === conflictUrl && response.request().method() === "DELETE");
    await submit.click();
    await expect(submit).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ux-dialog:modal")).toBeVisible();
    const added = await createTicket(page.request, baseUrl, board.id, { laneId: changed.id, title: "確認後に追加したチケット" });
    releaseDelete();
    expect((await responsePromise).status()).toBe(409);
    await expect(heading).toHaveText("レーンを削除できません");
    await expect(page.locator("#ux-message")).toContainText("確認を開いた後にチケットが追加されました。");
    await expect(page.locator("#ux-message")).toContainText("チケットが1件あります");
    await expect(submit).toBeHidden();
    await expect(page.locator("#ux-dismiss-button")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#ux-dialog")).not.toBeVisible();
    expect(deleteRequests).toBe(1);

    await page.reload();
    await expect(page.locator(`.lane[data-lane-id="${changed.id}"]`)).toBeVisible();
    const stored = await (await page.request.get(`${baseUrl}/api/tickets/${added.id}`)).json();
    expect(stored.laneId).toBe(changed.id);
  } finally {
    releaseDelete();
    await close();
  }
});

test("lane deletion dismisses a stale confirmation when navigating back to a different board", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const first = await createBoard(page.request, baseUrl, { name: "Operations desk", laneNames: ["Review"] });
    const second = await createBoard(page.request, baseUrl, { name: "Release desk", laneNames: ["Publish"] });
    let deleteRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "DELETE" && request.url().includes("/api/lanes/")) deleteRequests++;
    });
    await page.goto(`${baseUrl}/boards/${first.board.id}`);
    await page.getByRole("button", { name: "Release desk", exact: true }).click();
    await openLaneDeletion(page, second.lanes[0].id);
    await expect(page.locator("#ux-submit-button")).toBeEnabled();
    await page.goBack();
    await expect(page.locator(`.lane[data-lane-id="${first.lanes[0].id}"]`)).toBeVisible();
    await expect(page.locator("#ux-dialog")).not.toBeVisible();
    expect(deleteRequests).toBe(0);
    expect((await page.request.get(`${baseUrl}/api/lanes/${second.lanes[0].id}/ticket-counts`)).status()).toBe(200);
  } finally {
    await close();
  }
});
