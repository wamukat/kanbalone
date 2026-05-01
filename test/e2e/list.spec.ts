import { expect, test, type Page } from "@playwright/test";

import { buildApp, createBoard, createDbFile, createTicket, getFreePort, path, startTestApp, updateTicket } from "./helpers.js";

async function gotoListAndWaitForBoardEvents(page: Page, baseUrl: string, boardId: number) {
  const eventsResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/boards/${boardId}/events`) &&
    response.status() === 200,
  );
  await page.goto(`${baseUrl}/boards/${boardId}/list`);
  await eventsResponse;
}

test("lane filter does not leak from List view into Kanban view", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Lane Filter Board", laneNames: ["todo", "review"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const [todoLane, reviewLane] = boardPayload.lanes;
    for (const ticket of [
      { laneId: todoLane.id, title: "Todo ticket" },
      { laneId: reviewLane.id, title: "Review ticket" },
    ]) {
      const response = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
        data: ticket,
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await expect(page.locator(".list-row")).toHaveCount(2);
    await page.locator("#lane-filter").selectOption(String(reviewLane.id));
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator(".list-row")).toContainText("Review ticket");
    await expect(page.locator("#lane-filter")).toHaveClass(/is-filter-active/);

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.locator("#lane-filter")).toBeHidden();
    await expect(page.locator(".ticket-card")).toHaveCount(2);
    await expect(page.locator(".ticket-card")).toContainText(["Todo ticket", "Review ticket"]);

    await page.getByRole("button", { name: "List" }).click();
    await expect(page.locator("#lane-filter")).toBeVisible();
    await expect(page.locator("#lane-filter")).toHaveValue(String(reviewLane.id));
    await expect(page.locator(".list-row")).toHaveCount(1);
    await expect(page.locator(".list-row")).toContainText("Review ticket");
  } finally {
    await page.close();
    await app.close();
  }
});

test("list view refreshes after background API updates", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "List Refresh Board",
      laneNames: ["Todo"],
    });
    const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Original list title",
    });

    await gotoListAndWaitForBoardEvents(page, baseUrl, boardPayload.board.id);
    await expect(page.locator(".list-row")).toContainText("Original list title");

    await updateTicket(page.request, baseUrl, ticket.id, {
      title: "Updated list title",
    });

    await expect(page.locator(".list-row")).toContainText("Updated list title");
    await expect(page.locator(".list-row")).not.toContainText("Original list title");
  } finally {
    await close();
  }
});

test("list relation ids open linked ticket details", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "List Relation Links Board",
      laneNames: ["Todo"],
    });
    const lane = boardPayload.lanes[0];
    const related = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Linked related ticket",
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: lane.id,
      title: "Ticket with related link",
      relatedIds: [related.id],
    });

    await gotoListAndWaitForBoardEvents(page, baseUrl, boardPayload.board.id);
    const relationLink = page.locator(".list-row", { hasText: "Ticket with related link" })
      .locator(".list-relation-ticket-link", { hasText: `#${related.id}` });
    await expect(relationLink).toBeVisible();
    await relationLink.click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toContainText("Linked related ticket");
  } finally {
    await close();
  }
});

test("list view applies pending background refresh after closing ticket detail dialog", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "List Dialog Refresh Board",
      laneNames: ["Todo"],
    });
    const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "List dialog original title",
    });

    await gotoListAndWaitForBoardEvents(page, baseUrl, boardPayload.board.id);
    const listBoard = page.locator("#list-board");
    await listBoard.getByRole("button", { name: "List dialog original title" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toHaveText("List dialog original title");

    await updateTicket(page.request, baseUrl, ticket.id, {
      title: "List dialog updated title",
    });

    await expect(page.locator("#editor-header-title")).toHaveText("List dialog original title");
    await expect(listBoard).toContainText("List dialog original title");
    await expect(listBoard).not.toContainText("List dialog updated title");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(listBoard.getByRole("button", { name: "List dialog updated title" })).toBeVisible();
    await expect(listBoard).not.toContainText("List dialog original title");
  } finally {
    await close();
  }
});

test("list view refreshes after background API create move and delete", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "List Mutation Refresh Board",
      laneNames: ["Todo", "Done"],
    });
    const [todoLane, doneLane] = boardPayload.lanes;
    const existingTicket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: todoLane.id,
      title: "Existing list ticket",
    });

    await gotoListAndWaitForBoardEvents(page, baseUrl, boardPayload.board.id);
    const listBoard = page.locator("#list-board");
    await expect(listBoard.getByRole("button", { name: "Existing list ticket" })).toBeVisible();

    const createdTicket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: todoLane.id,
      title: "Created behind list",
    });
    await expect(listBoard.getByRole("button", { name: "Created behind list" })).toBeVisible();

    const transitionResponse = await page.request.patch(`${baseUrl}/api/tickets/${createdTicket.id}/transition`, {
      data: { laneName: doneLane.name, isResolved: false },
    });
    expect(transitionResponse.status()).toBe(200);
    await expect(listBoard.getByRole("button", { name: "Created behind list" }).locator("..")).toContainText("Done");

    const deleteResponse = await page.request.delete(`${baseUrl}/api/tickets/${existingTicket.id}`);
    expect(deleteResponse.status()).toBe(204);
    await expect(listBoard.getByRole("button", { name: "Existing list ticket" })).toHaveCount(0);
  } finally {
    await close();
  }
});

test("list virtual scrolling repaints visible rows", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Virtual List", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];

    for (let index = 1; index <= 80; index += 1) {
      const response = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
        data: {
          laneId: lane.id,
          title: `Virtual ticket ${String(index).padStart(2, "0")}`,
          priority: ((index - 1) % 4) + 1,
        },
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await expect(page.locator(".list-window")).toContainText("Virtual ticket 80");
    await expect(page.locator(".list-window")).not.toContainText("Virtual ticket 01");

    await page.locator(".list-viewport").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect(page.locator(".list-window")).toContainText("Virtual ticket 01");
  } finally {
    await page.close();
    await app.close();
  }
});

test("list ticket titles use subdued app link styling", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "List Typography", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];

    const ticketResponse = await page.request.post(
      `${baseUrl}/api/boards/${boardPayload.board.id}/tickets`,
      {
        data: {
          laneId: lane.id,
          title: "Subdued list title",
          priority: 2,
        },
      },
    );
    expect(ticketResponse.status()).toBe(201);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    const titleLink = page.getByRole("button", {
      name: /Subdued list title/,
    });
    await expect(titleLink).toBeVisible();
    await expect(titleLink).toHaveCSS("font-weight", "600");
    await expect(titleLink).toHaveCSS("text-decoration-line", "none");

    await titleLink.hover();
    await expect(titleLink).toHaveCSS("text-decoration-line", "none");
  } finally {
    await page.close();
    await app.close();
  }
});

test("list bulk move moves selected tickets to another board", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const sourceBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Bulk Move Source", laneNames: ["todo", "review"] },
    });
    expect(sourceBoardResponse.status()).toBe(201);
    const sourceBoardPayload = await sourceBoardResponse.json();
    const [todoLane] = sourceBoardPayload.lanes;

    const targetBoardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Bulk Move Target", laneNames: ["todo", "done"] },
    });
    expect(targetBoardResponse.status()).toBe(201);
    const targetBoardPayload = await targetBoardResponse.json();
    const [targetTodoLane] = targetBoardPayload.lanes;

    for (const title of ["Move first", "Move second"]) {
      const response = await page.request.post(`${baseUrl}/api/boards/${sourceBoardPayload.board.id}/tickets`, {
        data: { laneId: todoLane.id, title },
      });
      expect(response.status()).toBe(201);
    }

    await page.goto(`${baseUrl}/boards/${sourceBoardPayload.board.id}/list`);
    await page.getByRole("button", { name: "Move first" }).locator("..").locator("[data-list-ticket-id]").check();
    await page.getByRole("button", { name: "Move second" }).locator("..").locator("[data-list-ticket-id]").check();

    await page.locator("[data-bulk-move-board='true']").first().click();
    await expect(page.locator("#ux-dialog")).toBeVisible();
    await page.locator("[data-bulk-move-board-select]").selectOption(String(targetBoardPayload.board.id));
    await page.locator("[data-bulk-move-lane-select]").selectOption(String(targetTodoLane.id));
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/api/boards/${sourceBoardPayload.board.id}/tickets/bulk-move`) &&
        response.request().method() === "POST" &&
        response.status() === 200,
      ),
      page.locator("#ux-submit-button").click(),
    ]);

    await expect(page.locator("#list-board")).not.toContainText("Move first");
    await expect(page.locator("#list-board")).not.toContainText("Move second");

    await page.goto(`${baseUrl}/boards/${targetBoardPayload.board.id}/list`);
    await expect(page.getByRole("button", { name: "Move first" }).locator("..")).toContainText("todo");
    await expect(page.getByRole("button", { name: "Move second" }).locator("..")).toContainText("todo");
  } finally {
    await page.close();
    await app.close();
  }
});

test("list bulk move can move selected tickets to another lane on the same board", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Bulk Lane Move Board",
      laneNames: ["todo", "todo", "done"],
    });
    const [sourceTodoLane, targetTodoLane] = boardPayload.lanes;
    const movedTicketIds = [];

    for (const title of ["Lane move first", "Lane move second"]) {
      const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
        laneId: sourceTodoLane.id,
        title,
      });
      movedTicketIds.push(ticket.id);
    }

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    await page.getByRole("button", { name: "Lane move first" }).locator("..").locator("[data-list-ticket-id]").check();
    await page.getByRole("button", { name: "Lane move second" }).locator("..").locator("[data-list-ticket-id]").check();

    await page.locator("[data-bulk-move-board='true']").first().click();
    await expect(page.locator("#ux-dialog")).toBeVisible();
    await expect(page.locator("#ux-title")).toHaveText("Move Tickets");
    await expect(page.locator("[data-bulk-move-board-select]")).toContainText("Bulk Lane Move Board");
    await page.locator("[data-bulk-move-board-select]").selectOption(String(boardPayload.board.id));
    await expect(page.locator("[data-bulk-move-lane-select] option")).toHaveCount(2);
    await expect(page.locator(`[data-bulk-move-lane-select] option[value="${sourceTodoLane.id}"]`)).toHaveCount(0);
    await page.locator("[data-bulk-move-lane-select]").selectOption(String(targetTodoLane.id));
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/api/boards/${boardPayload.board.id}/tickets/bulk-move`) &&
        response.request().method() === "POST" &&
        response.status() === 200,
      ),
      page.locator("#ux-submit-button").click(),
    ]);

    await expect(page.getByRole("button", { name: "Lane move first" }).locator("..")).toContainText("todo");
    await expect(page.getByRole("button", { name: "Lane move second" }).locator("..")).toContainText("todo");
    await expect(page.locator("[data-list-ticket-id]:checked")).toHaveCount(0);
    for (const ticketId of movedTicketIds) {
      const response = await page.request.get(`${baseUrl}/api/tickets/${ticketId}`);
      expect(response.status()).toBe(200);
      expect((await response.json()).laneId).toBe(targetTodoLane.id);
    }
  } finally {
    await close();
  }
});
