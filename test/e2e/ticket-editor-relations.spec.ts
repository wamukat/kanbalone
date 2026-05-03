import { expect, test, type Page } from "@playwright/test";

import { createBoard, createTag, createTicket, startTestApp } from "./helpers.js";

async function addRelation(page: Page, type: "blocker" | "related" | "parent" | "child") {
  await page.locator("#ticket-relation-add-button").click();
  await page.locator(`[data-relation-add-type="${type}"]`).click();
}

test("ticket editor manages parent blocker and child relations", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Relation Editor Board",
      laneNames: ["Todo"],
    });
    const lane = boardPayload.lanes[0];
    const mainTicket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Main relation ticket",
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Parent relation candidate",
      priority: 4,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Parent relation alternate",
      priority: 3,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Blocker relation candidate",
      priority: 3,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Blocker relation alternate",
      priority: 1,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Related relation candidate",
      priority: 4,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Related relation alternate",
      priority: 1,
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Child relation candidate",
      priority: 2,
    });
    await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "Focus alpha",
      color: "#1f6f5f",
    });
    await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "Focus beta",
      color: "#1f6f5f",
    });
    const cancelTag = await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "Cancel tag",
      color: "#1f6f5f",
    });
    const taggedTicket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Tagged cancel ticket",
      tagIds: [cancelTag.id],
    });

    await page.goto(`${baseUrl}/tickets/${taggedTicket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary")).toContainText("Cancel tag");
    await page.locator("[data-remove-tag-id]").click();
    await expect(page.locator("#ticket-tag-summary")).not.toContainText("Cancel tag");
    await page.locator("#cancel-edit-button").click();
    await expect(page.locator("#ticket-view-meta")).toContainText("Cancel tag");
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary")).toContainText("Cancel tag");

    await page.goto(`${baseUrl}/tickets/${mainTicket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#header-edit-button").click();

    await page.locator("#ticket-tag-search").focus();
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", true);
    await page.locator("#ticket-tag-search").fill("Focus");
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-tag-options .tag-picker-item.active")).toContainText("Focus alpha");
    await page.locator("#ticket-tag-search").press("ArrowDown");
    await expect(page.locator("#ticket-tag-options .tag-picker-item.active")).toContainText("Focus beta");
    await page.locator("#ticket-tag-search").press("ArrowUp");
    await expect(page.locator("#ticket-tag-options .tag-picker-item.active")).toContainText("Focus alpha");
    await page.locator("#ticket-tag-search").press("Enter");
    await expect(page.locator("#ticket-tag-summary")).toContainText("Focus alpha");
    await page.locator("#ticket-tag-search").fill("Focus");
    await expect(page.locator("#ticket-tag-options [data-tag-id]")).toHaveCount(1);
    await expect(page.locator("#ticket-tag-options")).not.toContainText("Focus alpha");
    await expect(page.locator("#ticket-tag-options")).toContainText("Focus beta");

    await addRelation(page, "parent");
    await page.locator("#ticket-parent-search").focus();
    await expect(page.locator("#ticket-parent-options")).toHaveJSProperty("hidden", true);
    await page.locator("#ticket-parent-search").fill("Parent relation");
    await expect(page.locator("#ticket-parent-options")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-tag-options")).toHaveJSProperty("hidden", true);
    await expect(page.locator("#ticket-parent-options .tag-picker-item.active")).toContainText("Parent relation candidate");
    await page.locator("#ticket-parent-search").press("ArrowDown");
    await expect(page.locator("#ticket-parent-options .tag-picker-item.active")).toContainText("Parent relation alternate");
    await page.locator("#ticket-parent-search").press("ArrowUp");
    await page.locator("#ticket-parent-search").press("Enter");
    await expect(page.locator("#ticket-parent-summary")).toContainText("Parent relation candidate");

    await addRelation(page, "blocker");
    await page.locator("#ticket-blocker-search").focus();
    await expect(page.locator("#ticket-blocker-options")).toHaveJSProperty("hidden", true);
    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await expect(page.locator("#ticket-blocker-options")).toHaveJSProperty("hidden", false);
    await expect(page.locator("#ticket-parent-options")).toHaveJSProperty("hidden", true);

    const parentSaveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${mainTicket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#save-ticket-button").click();
    expect((await parentSaveResponse).status()).toBe(200);
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#ticket-relations")).toContainText("Parent");
    await expect(page.locator("#ticket-relations")).toContainText("Parent relation candidate");

    await page.locator("#header-edit-button").click();
    await page.locator("[data-remove-parent-id]").click();
    await expect(page.locator("#ticket-parent-summary")).not.toContainText("Parent relation candidate");

    await addRelation(page, "blocker");
    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await expect(page.locator("#ticket-blocker-options .tag-picker-item.active")).toContainText("Blocker relation candidate");
    await page.locator("#ticket-blocker-search").press("ArrowDown");
    await expect(page.locator("#ticket-blocker-options .tag-picker-item.active")).toContainText("Blocker relation alternate");
    await page.locator("#ticket-blocker-search").press("ArrowUp");
    await page.locator("#ticket-blocker-search").press("Enter");
    await expect(page.locator("#ticket-blocker-summary")).toContainText("Blocker relation candidate");
    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await expect(page.locator("#ticket-blocker-options [data-blocker-id]")).toHaveCount(1);
    await expect(page.locator("#ticket-blocker-options")).not.toContainText("Blocker relation candidate");
    await expect(page.locator("#ticket-blocker-options")).toContainText("Blocker relation alternate");
    await page.locator("[data-remove-blocker-id]").click();
    await expect(page.locator("#ticket-blocker-summary")).not.toContainText("Blocker relation candidate");
    await page.locator("#ticket-blocker-search").fill("Blocker relation");
    await page.locator("#ticket-blocker-search").press("Enter");

    await addRelation(page, "related");
    await page.locator("#ticket-related-search").fill("Related relation");
    await expect(page.locator("#ticket-related-options .tag-picker-item.active")).toContainText("Related relation candidate");
    await page.locator("#ticket-related-search").press("ArrowDown");
    await expect(page.locator("#ticket-related-options .tag-picker-item.active")).toContainText("Related relation alternate");
    await page.locator("#ticket-related-search").press("ArrowUp");
    await page.locator("#ticket-related-search").press("Enter");
    await expect(page.locator("#ticket-related-summary")).toContainText("Related relation candidate");
    await page.locator("#ticket-related-search").fill("Related relation");
    await expect(page.locator("#ticket-related-options [data-related-id]")).toHaveCount(1);
    await expect(page.locator("#ticket-related-options")).not.toContainText("Related relation candidate");
    await expect(page.locator("#ticket-related-options")).toContainText("Related relation alternate");
    await page.locator("[data-remove-related-id]").click();
    await expect(page.locator("#ticket-related-summary")).not.toContainText("Related relation candidate");
    await page.locator("#ticket-related-search").fill("Related relation");
    await page.locator("#ticket-related-search").press("Enter");

    await addRelation(page, "child");
    await page.locator("#ticket-child-search").fill("Child relation");
    await page.locator("#ticket-child-search").press("Enter");
    await expect(page.locator("#ticket-child-summary")).toContainText("Child relation candidate");
    await expect(page.locator("#ticket-parent-row")).toBeHidden();
    await expect(page.locator("#ticket-relation-add-button")).toBeHidden();
    await page.locator("#ticket-child-search").fill("Child relation");
    await expect(page.locator("#ticket-child-options [data-child-id]")).toHaveCount(0);
    await page.locator("[data-remove-child-id]").click();
    await expect(page.locator("#ticket-child-summary")).not.toContainText("Child relation candidate");
    await page.locator("#ticket-child-search").fill("Child relation");
    await page.locator("#ticket-child-search").press("Enter");

    const relationSaveResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/tickets/${mainTicket.id}`) &&
        response.request().method() === "PATCH",
    );
    await page.locator("#save-ticket-button").click();
    expect((await relationSaveResponse).status()).toBe(200);
    await expect(page.locator("#ticket-view")).toBeVisible();
    await expect(page.locator("#ticket-relations")).not.toContainText("Parent relation candidate");
    await expect(page.locator("#ticket-relations")).toContainText("Blocked By");
    await expect(page.locator("#ticket-relations")).toContainText("Blocker relation candidate");
    await expect(page.locator("#ticket-relations")).toContainText("Related");
    await expect(page.locator("#ticket-relations")).toContainText("Related relation candidate");
    await expect(page.locator("#ticket-relations")).toContainText("Children");
    await expect(page.locator("#ticket-relations")).toContainText("Child relation candidate");
  } finally {
    await close();
  }
});
