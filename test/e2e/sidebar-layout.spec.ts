import { expect, test } from "@playwright/test";

import { createBoard, createTag, startTestApp } from "./helpers.js";

// Allow a layout scrollbar to appear in headless Chromium.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

test("opening the tag editor preserves the surrounding sidebar layout", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 470 });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const { board } = await createBoard(page.request, baseUrl, { name: "Sidebar Board", laneNames: ["todo"] });
    await createTag(page.request, baseUrl, board.id, { name: "Edited tag", color: "#336699" });
    await page.goto(`${baseUrl}/boards/${board.id}`);
    const badge = page.getByRole("button", { name: "Edit tag: Edited tag" });
    await expect(badge).toBeVisible();

    const sidebar = page.locator("#sidebar");
    const measure = () => sidebar.evaluate((element) => {
      const addBoard = element.querySelector("#new-board-button")!.getBoundingClientRect();
      const viewMode = element.querySelector("#view-mode-toggle")!.getBoundingClientRect();
      return {
        overflowing: element.scrollHeight > element.clientHeight,
        addBoard: { width: addBoard.width, height: addBoard.height },
        viewMode: { left: viewMode.left, top: viewMode.top + element.scrollTop, width: viewMode.width },
      };
    });

    const closed = await measure();
    expect(closed.overflowing).toBe(false);
    expect(closed.addBoard.height).toBe(closed.addBoard.width);
    await badge.click();
    await expect(page.locator("[data-sidebar-tag-edit-form]")).toBeVisible();
    const editing = await measure();
    expect(editing).toEqual({ ...closed, overflowing: true });

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(badge).toBeVisible();
    expect(await measure()).toEqual(closed);
  } finally {
    await close();
  }
});
