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

test("board content keeps active headers visible during vertical scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Sticky Scroll Board",
      laneNames: ["todo", "review"],
    });
    const [todoLane, reviewLane] = boardPayload.lanes;
    let lastTicketId = 0;
    for (let index = 1; index <= 48; index += 1) {
      const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
        laneId: todoLane.id,
        title: `Sticky ticket ${String(index).padStart(2, "0")}`,
        priority: 2,
      });
      lastTicketId = ticket.id;
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".ticket-card")).toHaveCount(48);
    const kanbanBefore = await page.evaluate(() => {
      const board = document.querySelector("#lane-board");
      const lane = document.querySelector(".lane:not(.lane-create-column)");
      const header = lane?.querySelector(".lane-header");
      const addButton = lane?.querySelector(".add-ticket-button");
      const list = lane?.querySelector(".ticket-list");
      if (!board || !lane || !header || !addButton || !list) {
        throw new Error("Kanban sticky fixture is missing");
      }
      const boardBox = board.getBoundingClientRect();
      const headerBox = header.getBoundingClientRect();
      const addBox = addButton.getBoundingClientRect();
      return {
        addBottom: addBox.bottom,
        boardBottom: boardBox.bottom,
        boardTop: boardBox.top,
        headerTop: headerBox.top,
        laneBottom: lane.getBoundingClientRect().bottom,
        listClientHeight: list.clientHeight,
        listScrollHeight: list.scrollHeight,
      };
    });
    expect(kanbanBefore.listScrollHeight).toBeGreaterThan(kanbanBefore.listClientHeight);
    await page.locator(`.ticket-list[data-lane-id="${todoLane.id}"]`).evaluate((list) => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const kanbanAfter = await page.evaluate(() => {
      const board = document.querySelector("#lane-board");
      const sourceLane = document.querySelector(".lane:not(.lane-create-column)");
      const sourceHeader = sourceLane?.querySelector(".lane-header");
      const sourceAddButton = sourceLane?.querySelector(".add-ticket-button");
      const sourceList = sourceLane?.querySelector(".ticket-list");
      const targetLane = [...document.querySelectorAll(".lane:not(.lane-create-column)")][1];
      const targetAddButton = targetLane?.querySelector(".add-ticket-button");
      if (!board || !sourceLane || !sourceHeader || !sourceAddButton || !sourceList || !targetLane || !targetAddButton) {
        throw new Error("Kanban sticky fixture is missing");
      }
      const boardBox = board.getBoundingClientRect();
      const sourceLaneBox = sourceLane.getBoundingClientRect();
      const headerBox = sourceHeader.getBoundingClientRect();
      const sourceAddBox = sourceAddButton.getBoundingClientRect();
      const targetLaneBox = targetLane.getBoundingClientRect();
      const targetAddBox = targetAddButton.getBoundingClientRect();
      return {
        boardBottom: boardBox.bottom,
        boardTop: boardBox.top,
        headerTop: headerBox.top,
        headerText: sourceHeader.textContent ?? "",
        sourceAddBottom: sourceAddBox.bottom,
        sourceLaneBottom: sourceLaneBox.bottom,
        sourceListScrollTop: sourceList.scrollTop,
        targetAddBottom: targetAddBox.bottom,
        targetLaneBottom: targetLaneBox.bottom,
      };
    });
    expect(Math.abs(kanbanAfter.boardTop - kanbanBefore.boardTop)).toBeLessThan(1);
    expect(Math.abs(kanbanAfter.headerTop - kanbanAfter.boardTop)).toBeLessThanOrEqual(1);
    expect(Math.abs(kanbanAfter.sourceAddBottom - kanbanBefore.addBottom)).toBeLessThan(1);
    expect(kanbanAfter.sourceAddBottom).toBeLessThanOrEqual(kanbanAfter.boardBottom + 1);
    expect(kanbanAfter.sourceLaneBottom).toBeGreaterThan(kanbanAfter.boardBottom - 40);
    expect(kanbanAfter.sourceListScrollTop).toBeGreaterThan(0);
    expect(kanbanAfter.targetAddBottom).toBeLessThanOrEqual(kanbanAfter.boardBottom + 1);
    expect(kanbanAfter.targetLaneBottom).toBeLessThan(kanbanAfter.boardBottom - 120);
    expect(kanbanAfter.headerText).toContain("todo");

    await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/api/tickets/${lastTicketId}/position`) &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
      ),
      page.evaluate(({ targetLaneId, ticketId }) => {
        const card = document.querySelector(`.ticket-card[data-ticket-id="${ticketId}"]`);
        const targetList = document.querySelector(`.ticket-list[data-lane-id="${targetLaneId}"]`);
        if (!card || !targetList) {
          throw new Error("Scrolled lane drag fixture is missing");
        }
        const cardBox = card.getBoundingClientRect();
        const targetBox = targetList.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        card.dispatchEvent(new DragEvent("dragstart", {
          bubbles: true,
          cancelable: true,
          clientX: cardBox.left + 8,
          clientY: cardBox.top + 8,
          dataTransfer,
        }));
        targetList.dispatchEvent(new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientX: targetBox.left + 12,
          clientY: targetBox.bottom - 12,
          dataTransfer,
        }));
        targetList.dispatchEvent(new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: targetBox.left + 12,
          clientY: targetBox.bottom - 12,
          dataTransfer,
        }));
      }, { targetLaneId: reviewLane.id, ticketId: lastTicketId }),
    ]);
    await expect(page.locator(".lane", { has: page.locator(`.ticket-card[data-ticket-id="${lastTicketId}"]`) }).locator(".lane-title")).toHaveText("review");

    await page.getByRole("button", { name: "List" }).click();
    await expect(page.locator("#list-board")).toBeVisible();
    await expect(page.locator(".list-row").first()).toBeVisible();
    const listBefore = await page.evaluate(() => {
      const actions = document.querySelector(".list-actions");
      const header = document.querySelector(".list-header");
      if (!actions || !header) {
        throw new Error("List sticky fixture is missing");
      }
      return {
        actionsTop: actions.getBoundingClientRect().top,
        headerTop: header.getBoundingClientRect().top,
      };
    });
    await page.locator(".list-viewport").evaluate((viewport) => {
      viewport.scrollTop = 520;
      viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const listAfter = await page.evaluate(() => {
      const actions = document.querySelector(".list-actions");
      const header = document.querySelector(".list-header");
      const viewport = document.querySelector(".list-viewport");
      if (!actions || !header || !viewport) {
        throw new Error("List sticky fixture is missing");
      }
      return {
        actionsTop: actions.getBoundingClientRect().top,
        headerTop: header.getBoundingClientRect().top,
        viewportScrollTop: viewport.scrollTop,
        headerText: header.textContent ?? "",
      };
    });
    expect(listAfter.viewportScrollTop).toBeGreaterThan(0);
    expect(Math.abs(listAfter.actionsTop - listBefore.actionsTop)).toBeLessThan(1);
    expect(Math.abs(listAfter.headerTop - listBefore.headerTop)).toBeLessThan(1);
    expect(listAfter.headerText).toContain("ID / Title");
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

test("core typography follows the design system scale", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Typography Board",
      laneNames: ["todo"],
    });
    const tag = await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "design",
      color: "#1f6f5f",
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Typography ticket",
      priority: 2,
      tagIds: [tag.id],
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".ticket-card")).toBeVisible();
    await expect(page.locator(".ticket-card .ticket-link")).toBeVisible();

    const typography = await page.evaluate(() => {
      const selectors = {
        html: "html",
        body: "body",
        search: ".toolbar-search input",
        filter: ".filter-menu-toggle",
        laneTitle: ".lane-title",
        laneCount: ".lane-count",
        cardTitle: ".ticket-link",
        cardId: ".ticket-card .ticket-id",
        tag: ".ticket-card .tag",
        button: "button",
        icon: ".icon",
      };

      return Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => {
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`Missing typography fixture: ${selector}`);
          }
          const styles = getComputedStyle(element);
          return [
            key,
            {
              fontSize: styles.fontSize,
              fontWeight: styles.fontWeight,
              lineHeight: styles.lineHeight,
              width: styles.width,
              height: styles.height,
            },
          ];
        }),
      );
    });

    expect(typography.html.fontSize).toBe("14px");
    expect(typography.body.fontSize).toBe("14px");
    expect(typography.body.fontWeight).toBe("400");
    expect(typography.search.fontSize).toBe("14px");
    expect(typography.button.fontSize).toBe("14px");
    expect(typography.button.fontWeight).toBe("500");
    expect(typography.filter.fontSize).toBe("14px");
    expect(typography.laneTitle.fontSize).toBe("14px");
    expect(typography.laneTitle.fontWeight).toBe("600");
    expect(typography.cardTitle.fontSize).toBe("14px");
    expect(typography.cardTitle.fontWeight).toBe("600");
    expect(typography.laneCount.fontSize).toBe("11px");
    expect(typography.cardId.fontSize).toBe("11px");
    expect(typography.tag.fontSize).toBe("12px");
    expect(typography.icon.width).toBe("16px");
    expect(typography.icon.height).toBe("16px");
  } finally {
    await close();
  }
});

test("toast uses the shared elevated surface shape", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Toast Visuals",
      laneNames: ["todo"],
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.locator(".add-ticket-button").first().click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#ticket-title").fill("Toast visual ticket");
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#toast")).toHaveText("Ticket created");

    const toastStyles = await page.locator("#toast").evaluate((toast) => {
      const styles = getComputedStyle(toast);
      return {
        borderRadius: styles.borderRadius,
        boxShadow: styles.boxShadow,
      };
    });

    expect(toastStyles.borderRadius).toBe("8px");
    expect(toastStyles.boxShadow).not.toBe("none");
  } finally {
    await close();
  }
});

test("editor form focus and detail header badges use the shared visual language", async ({
  page,
}) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Editor Visuals",
      laneNames: ["todo"],
    });
    const ticket = await createTicket(
      page.request,
      baseUrl,
      boardPayload.board.id,
      {
        laneId: boardPayload.lanes[0].id,
        title: "Resolved archived visual ticket",
        priority: 3,
        isResolved: true,
        isArchived: true,
      },
    );

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.locator(".add-ticket-button").first().click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);

    const focusStyles: Array<{
      borderColor: string;
      boxShadow: string;
      outlineStyle: string;
    }> = [];
    for (const selector of [
      "#ticket-title",
      "#ticket-body",
      "#ticket-lane",
      "#ticket-priority",
    ]) {
      await page.locator(selector).focus();
      focusStyles.push(
        await page.locator(selector).evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            borderColor: styles.borderColor,
            boxShadow: styles.boxShadow,
            outlineStyle: styles.outlineStyle,
          };
        }),
      );
    }

    const [titleFocus, ...otherFocusStyles] = focusStyles;
    expect(titleFocus.boxShadow).not.toBe("none");
    expect(titleFocus.outlineStyle).toBe("none");
    for (const styles of otherFocusStyles) {
      expect(styles.borderColor).toBe(titleFocus.borderColor);
      expect(styles.boxShadow).toBe(titleFocus.boxShadow);
      expect(styles.outlineStyle).toBe(titleFocus.outlineStyle);
    }

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-id")).toHaveText(`#${ticket.id}`);
    await expect(
      page.locator("#editor-header-state .ticket-state-pill > span"),
    ).toHaveText(["Resolved", "Archived"]);
    await expect(
      page.locator(
        "#editor-header-state .ticket-state-pill-resolved use[href='/icons.svg#check']",
      ),
    ).toHaveCount(1);
    await expect(
      page.locator(
        "#editor-header-state .ticket-state-pill-archived use[href='/icons.svg#archive']",
      ),
    ).toHaveCount(1);
    await expect(
      page.locator("#editor-header-priority .ticket-priority-badge"),
    ).toHaveText("High");
    await expect(
      page.locator("#editor-header-priority .ticket-priority-badge"),
    ).toHaveClass(/ticket-priority-high/);

    const detailTitleOffset = await page.evaluate(() => {
      const dialog = document.querySelector("#editor-dialog");
      const title = document.querySelector("#editor-header-title");
      if (!dialog || !title) {
        throw new Error("Ticket detail title fixture is missing");
      }
      return (
        title.getBoundingClientRect().top -
        dialog.getBoundingClientRect().top
      );
    });
    expect(detailTitleOffset).toBeGreaterThanOrEqual(31);

    await page.locator("#header-edit-button").click();
    await expect(page.locator("#editor-form")).toBeVisible();
    const editTitleOffset = await page.evaluate(() => {
      const dialog = document.querySelector("#editor-dialog");
      const title = document.querySelector("#ticket-title");
      if (!dialog || !title) {
        throw new Error("Ticket editor title fixture is missing");
      }
      return (
        title.getBoundingClientRect().top -
        dialog.getBoundingClientRect().top
      );
    });
    expect(Math.abs(editTitleOffset - detailTitleOffset)).toBeLessThanOrEqual(
      8,
    );
  } finally {
    await close();
  }
});

test("kanban status expansion collapses large completed groups", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const now = new Date().toISOString();
    const importResponse = await page.request.post(`${baseUrl}/api/boards/import`, {
      data: {
        board: {
          id: 1,
          name: "Kanban Page Scroll",
          position: 0,
          createdAt: now,
          updatedAt: now,
        },
        lanes: [
          { id: 1, boardId: 1, name: "todo", position: 0 },
          { id: 2, boardId: 1, name: "review", position: 1 },
        ],
        tags: [],
        tickets: Array.from({ length: 36 }, (_, index) => ({
          id: index + 1,
          boardId: 1,
          laneId: 1,
          parentTicketId: null,
          title: `Archived resolved ticket ${index + 1}`,
          bodyMarkdown: "",
          isResolved: true,
          isCompleted: true,
          isArchived: true,
          priority: 2,
          position: index,
          createdAt: now,
          updatedAt: now,
          tags: [],
          comments: [],
          blockerIds: [],
        })),
      },
    });
    expect(importResponse.status()).toBe(201);
    const boardPayload = await importResponse.json();

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#lane-board")).toBeVisible();
    await page
      .locator("#status-filter [data-filter-expand=\"status\"]")
      .last()
      .click();
    await page.locator("#status-filter [data-status-filter=\"resolved\"]").click();
    await page.locator("#status-filter [data-status-filter=\"archived\"]").click();
    await expect(page.locator(".ticket-card")).toHaveCount(3);
    await expect(page.locator(".inactive-ticket-summary")).toContainText("33 hidden tickets");
    await expect(page.locator(".inactive-ticket-summary-button")).toHaveText("Show remaining 33");

    const layout = await page.evaluate(() => {
      const laneBoard = document.querySelector("#lane-board");
      const summary = document.querySelector(".inactive-ticket-summary");
      const ticketList = document.querySelector(".ticket-list");
      if (!laneBoard || !summary || !ticketList) {
        throw new Error("Kanban archived summary fixture is missing");
      }
      const ticketListStyles = getComputedStyle(ticketList);
      return {
        viewportHeight: window.innerHeight,
        documentHeight: document.documentElement.scrollHeight,
        laneBoardAlignItems: getComputedStyle(laneBoard).alignItems,
        ticketListClientHeight: ticketList.clientHeight,
        ticketListScrollHeight: ticketList.scrollHeight,
        ticketListOverflowY: ticketListStyles.overflowY,
        summaryText: summary.textContent?.replace(/\s+/g, " ").trim(),
      };
    });

    expect(layout.documentHeight).toBeLessThan(layout.viewportHeight * 2);
    expect(layout.summaryText).toContain("33 hidden tickets");
    expect(layout.ticketListScrollHeight).toBeLessThanOrEqual(
      layout.ticketListClientHeight + 1,
    );
    expect(layout.ticketListOverflowY).toBe("auto");

    await page.locator(".inactive-ticket-summary-button").click();
    await expect(page.locator(".ticket-card")).toHaveCount(36);
    await expect(page.locator(".inactive-ticket-summary-button")).toHaveText("Hide resolved or archived");
  } finally {
    await close();
  }
});

test("dark mode keeps key controls legible", async ({ browser }) => {
  const page = await browser.newPage({
    colorScheme: "dark",
    viewport: { width: 1280, height: 900 },
  });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Dark Layout",
      laneNames: ["todo"],
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Dark ticket",
      priority: 2,
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".toolbar-search")).toBeVisible();
    await expect(page.locator("#priority-filter")).toBeVisible();
    await expect(page.locator(".ticket-card")).toBeVisible();

    const darkControlStyles = await page.evaluate(() => {
      const search = document.querySelector(".toolbar-search");
      const filter = document.querySelector("#priority-filter");
      const card = document.querySelector(".ticket-card");
      if (!search || !filter || !card) {
        throw new Error("Dark mode fixture is missing");
      }
      function parseColor(value: string): number[] {
        const srgb = value.match(/color\(srgb ([0-9.]+) ([0-9.]+) ([0-9.]+)/);
        if (srgb) {
          return srgb
            .slice(1, 4)
            .map((channel: string) => Number(channel) * 255);
        }
        const rgb = value.match(/rgba?\((\d+), (\d+), (\d+)/);
        if (rgb) {
          return rgb.slice(1, 4).map(Number);
        }
        return [0, 0, 0];
      }

      function luminance(value: string): number {
        return parseColor(value)
          .map((channel: number) => {
            const normalized = channel / 255;
            return normalized <= 0.03928
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, channel, index) =>
              sum + channel * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      }

      function contrastRatio(foreground: string, background: string): number {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      }

      return [search, filter, card].map((element) => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          borderColor: styles.borderColor,
          contrastRatio: contrastRatio(styles.color, styles.backgroundColor),
        };
      });
    });

    for (const styles of darkControlStyles) {
      expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(styles.borderColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(styles.contrastRatio).toBeGreaterThan(3);
    }
  } finally {
    await close();
  }
});
