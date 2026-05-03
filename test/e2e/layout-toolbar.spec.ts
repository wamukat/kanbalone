import { expect, test } from "@playwright/test";

import {
  createBoard,
  createTag,
  createTicket,
  startTestApp,
} from "./helpers.js";

test("toolbar search aligns with active content edge in kanban and list views", async ({
  page,
}) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Layout Board",
      laneNames: ["todo", "review"],
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Layout ticket",
      priority: 2,
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".lane").first()).toBeVisible();

    const kanbanLayout = await page.evaluate(() => {
      const search = document.querySelector(".toolbar-search");
      const firstLane = document.querySelector(
        ".lane:not(.lane-create-column)",
      );
      const firstBoard = document.querySelector("#board-list .board-button");
      if (!search || !firstLane || !firstBoard) {
        throw new Error("Kanban layout fixture is missing");
      }
      return {
        searchLeft: search.getBoundingClientRect().left,
        searchTop: search.getBoundingClientRect().top,
        contentLeft: firstLane.getBoundingClientRect().left,
        sidebarTop: firstBoard.getBoundingClientRect().top,
      };
    });
    expect(
      Math.abs(kanbanLayout.searchLeft - kanbanLayout.contentLeft),
    ).toBeLessThan(2);
    expect(
      Math.abs(kanbanLayout.searchTop - kanbanLayout.sidebarTop),
    ).toBeLessThan(2);

    await page.getByRole("button", { name: "List" }).click();
    await expect(page.locator("#list-board")).toBeVisible();

    const listLayout = await page.evaluate(() => {
      const search = document.querySelector(".toolbar-search");
      const listHeader = document.querySelector(".list-header");
      const firstBoard = document.querySelector("#board-list .board-button");
      if (!search || !listHeader || !firstBoard) {
        throw new Error("List layout fixture is missing");
      }
      return {
        searchLeft: search.getBoundingClientRect().left,
        searchTop: search.getBoundingClientRect().top,
        contentLeft: listHeader.getBoundingClientRect().left,
        sidebarTop: firstBoard.getBoundingClientRect().top,
      };
    });
    expect(
      Math.abs(listLayout.searchLeft - listLayout.contentLeft),
    ).toBeLessThan(2);
    expect(Math.abs(listLayout.searchTop - listLayout.sidebarTop)).toBeLessThan(
      2,
    );
    expect(
      Math.abs(listLayout.contentLeft - kanbanLayout.contentLeft),
    ).toBeLessThan(2);

    const sidebarToggleMetrics = async () =>
      page.locator("#sidebar-toggle-button").evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return {
          centerY: rect.top + rect.height / 2,
          viewportCenterY: window.innerHeight / 2,
        };
      });
    const listSidebarToggle = await sidebarToggleMetrics();
    expect(
      Math.abs(listSidebarToggle.centerY - listSidebarToggle.viewportCenterY),
    ).toBeLessThan(1);
    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.locator("#lane-board")).toBeVisible();
    const kanbanSidebarToggle = await sidebarToggleMetrics();
    expect(
      Math.abs(
        kanbanSidebarToggle.centerY - kanbanSidebarToggle.viewportCenterY,
      ),
    ).toBeLessThan(1);
    expect(
      Math.abs(kanbanSidebarToggle.centerY - listSidebarToggle.centerY),
    ).toBeLessThan(1);
  } finally {
    await close();
  }
});

test("sidebar toggle stays usable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Narrow Layout",
      laneNames: ["todo"],
    });
    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#sidebar-toggle-button")).toBeVisible();

    const toggleBox = await page
      .locator("#sidebar-toggle-button")
      .evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          viewportWidth: window.innerWidth,
        };
      });

    expect(toggleBox.top).toBeGreaterThanOrEqual(15);
    expect(toggleBox.top).toBeLessThan(18);
    expect(toggleBox.right).toBeLessThanOrEqual(toggleBox.viewportWidth - 15);
  } finally {
    await close();
  }
});

test("reset filters compacts in a constrained toolbar", async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 720 });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Compact Toolbar",
      laneNames: ["todo"],
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Compact ticket",
      priority: 3,
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.locator("#sidebar-toggle-button").click();
    await page.locator("#priority-filter .filter-menu-edge-toggle").click();
    await page.locator("#priority-filter [data-priority-filter='high']").click();
    await expect(page.getByRole("button", { name: "Reset filters" })).toBeVisible();

    const toolbarMetrics = await page.evaluate(() => {
      const visibleControls = [
        ...document.querySelectorAll(".toolbar-filters > *:not([hidden])"),
      ];
      const resetButton = document.querySelector("#reset-filters-button");
      const resetLabel = resetButton?.querySelector("span");
      const priorityFilter = document.querySelector("#priority-filter");
      if (!resetButton || !resetLabel || !priorityFilter) {
        throw new Error("Compact toolbar fixture is missing");
      }
      return {
        rowCount: new Set(
          visibleControls.map((control) =>
            Math.round(control.getBoundingClientRect().top),
          ),
        ).size,
        resetWidth: resetButton.getBoundingClientRect().width,
        resetLabelPosition: getComputedStyle(resetLabel).position,
        resetLabelWidth: resetLabel.getBoundingClientRect().width,
        priorityExpanded: priorityFilter.classList.contains("is-expanded"),
      };
    });

    expect(toolbarMetrics.rowCount).toBe(1);
    expect(toolbarMetrics.resetWidth).toBeLessThan(42);
    expect(toolbarMetrics.resetLabelPosition).toBe("absolute");
    expect(toolbarMetrics.resetLabelWidth).toBeLessThanOrEqual(1);
    expect(toolbarMetrics.priorityExpanded).toBe(false);
  } finally {
    await close();
  }
});

test("native select filters use the shared toolbar color states", async ({
  page,
}) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Select Filter Visuals",
      laneNames: ["todo", "review"],
    });
    const tag = await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "focus",
      color: "#1f6f5f",
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Select color ticket",
      priority: 2,
      tagIds: [tag.id],
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#tag-filter")).toBeVisible();

    const readFilterColors = () =>
      page.evaluate(() => {
        function tokenColor(token: string): string {
          const probe = document.createElement("span");
          probe.style.color = `var(${token})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        }

        const search = document.querySelector(".toolbar-search");
        const tagFilter = document.querySelector("#tag-filter");
        const laneFilter = document.querySelector("#lane-filter");
        if (!search || !tagFilter || !laneFilter) {
          throw new Error("Filter controls are missing");
        }

        return {
          accent: tokenColor("--accent"),
          muted: tokenColor("--muted"),
          search: getComputedStyle(search).color,
          tag: getComputedStyle(tagFilter).color,
          lane: getComputedStyle(laneFilter).color,
        };
      });

    const kanbanColors = await readFilterColors();
    expect(kanbanColors.tag).toBe(kanbanColors.search);
    expect(kanbanColors.tag).toBe(kanbanColors.muted);
    expect(kanbanColors.tag).not.toBe("rgb(0, 0, 0)");

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator("#lane-filter")).toBeVisible();
    const listColors = await readFilterColors();
    expect(listColors.lane).toBe(listColors.search);
    expect(listColors.lane).toBe(listColors.muted);
    expect(listColors.lane).not.toBe("rgb(0, 0, 0)");

    await page.locator("#tag-filter").selectOption("focus");
    await expect(page.locator("#tag-filter")).toHaveClass(/is-filter-active/);
    await page
      .locator("#lane-filter")
      .selectOption(String(boardPayload.lanes[0].id));
    await expect(page.locator("#lane-filter")).toHaveClass(/is-filter-active/);

    const activeColors = await readFilterColors();
    expect(activeColors.tag).toBe(activeColors.accent);
    expect(activeColors.lane).toBe(activeColors.accent);
  } finally {
    await close();
  }
});
