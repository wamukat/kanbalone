import { expect, test } from "@playwright/test";

import {
  createBoard,
  createTag,
  createTicket,
  startTestApp,
} from "./helpers.js";

test("board content keeps active headers visible during vertical scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Sticky Scroll Board",
      laneNames: ["todo", "review", "doing"],
    });
    const [todoLane, reviewLane, doingLane] = boardPayload.lanes;
    let lastTicketId = 0;
    for (let index = 1; index <= 48; index += 1) {
      const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
        laneId: todoLane.id,
        title: `Sticky ticket ${String(index).padStart(2, "0")}`,
        priority: 2,
      });
      lastTicketId = ticket.id;
    }
    for (let index = 1; index <= 32; index += 1) {
      await createTicket(page.request, baseUrl, boardPayload.board.id, {
        laneId: doingLane.id,
        title: `Unchanged doing ticket ${String(index).padStart(2, "0")}`,
        priority: 2,
      });
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".ticket-card")).toHaveCount(80);
    await expect(page.locator(`.ticket-list[data-lane-id="${todoLane.id}"] .ticket-card`)).toHaveCount(48);
    const kanbanBefore = await page.evaluate((laneId) => {
      const board = document.querySelector("#lane-board");
      const list = document.querySelector(`.ticket-list[data-lane-id="${laneId}"]`);
      const lane = list?.closest(".lane");
      const header = lane?.querySelector(".lane-header");
      const addButton = lane?.querySelector(".add-ticket-button");
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
    }, todoLane.id);
    expect(kanbanBefore.listScrollHeight).toBeGreaterThan(kanbanBefore.listClientHeight);
    await page.locator(`.ticket-list[data-lane-id="${todoLane.id}"]`).evaluate((list) => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    await page.locator(`.ticket-list[data-lane-id="${doingLane.id}"]`).evaluate((list) => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event("scroll", { bubbles: true }));
    });
    const kanbanAfter = await page.evaluate(({ sourceLaneId, targetLaneId }) => {
      const board = document.querySelector("#lane-board");
      const sourceList = document.querySelector(`.ticket-list[data-lane-id="${sourceLaneId}"]`);
      const sourceLane = sourceList?.closest(".lane");
      const sourceHeader = sourceLane?.querySelector(".lane-header");
      const sourceAddButton = sourceLane?.querySelector(".add-ticket-button");
      const targetList = document.querySelector(`.ticket-list[data-lane-id="${targetLaneId}"]`);
      const targetLane = targetList?.closest(".lane");
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
    }, { sourceLaneId: todoLane.id, targetLaneId: reviewLane.id });
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
      page.waitForResponse((response) =>
        response.url().endsWith(`/api/boards/${boardPayload.board.id}`) &&
        response.request().method() === "GET" &&
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
    await expect(page.locator(`.lane[data-lane-id="${todoLane.id}"] .lane-count`)).toHaveText("47");
    await expect(page.locator(`.lane[data-lane-id="${reviewLane.id}"] .lane-count`)).toHaveText("1");
    await expect(page.locator(`.lane[data-lane-id="${doingLane.id}"] .lane-count`)).toHaveText("32");
    await expect(page.locator(".lane", { has: page.locator(`.ticket-card[data-ticket-id="${lastTicketId}"]`) }).locator(".lane-title")).toHaveText("review");
    await expect
      .poll(async () => page.locator(`.ticket-list[data-lane-id="${todoLane.id}"]`).evaluate((list) => list.scrollTop))
      .toBeGreaterThan(0);
    await expect
      .poll(async () => page.locator(`.ticket-list[data-lane-id="${doingLane.id}"]`).evaluate((list) => list.scrollTop))
      .toBeGreaterThan(0);

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
    await page.locator("#status-filter [data-status-filter=\"archived\"]").click();
    await expect(page.locator(".ticket-card")).toHaveCount(5);
    await expect(page.locator(".completion-ticket-summary")).toContainText("Show 31 more (31 remaining)");
    await expect(page.locator(".completion-show-more")).toHaveText("Show 31 more (31 remaining)");

    const layout = await page.evaluate(() => {
      const laneBoard = document.querySelector("#lane-board");
      const summary = document.querySelector(".completion-ticket-summary");
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
    expect(layout.summaryText).toContain("Show 31 more (31 remaining)");
    expect(layout.ticketListScrollHeight).toBeLessThanOrEqual(
      layout.ticketListClientHeight + 1,
    );
    expect(layout.ticketListOverflowY).toBe("auto");

    await page.locator(".completion-show-more").click();
    await expect(page.locator(".ticket-card")).toHaveCount(36);
    await expect(page.locator(".completion-show-more")).toBeHidden();
    await page.getByRole("button", { name: "Show latest 5", exact: true }).click();
    await expect(page.locator(".ticket-card")).toHaveCount(5);
    await expect(page.locator(".completion-show-more")).toHaveText("Show 31 more (31 remaining)");
  } finally {
    await close();
  }
});
