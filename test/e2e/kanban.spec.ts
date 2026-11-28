import { expect, test } from "@playwright/test";

import { closeTestApp, buildApp, createBoard, createCompletionLane, createDbFile, createTicket, getFreePort, path, startTestApp, updateTicket } from "./helpers.js";

test("kanban hierarchy icons retain their semantics when forced colors change", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Hierarchy Icons",
      laneNames: ["todo"],
    });
    const laneId = boardPayload.lanes[0].id;
    const parent = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId,
      title: "Parent ticket",
    });
    const child = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId,
      title: "Child ticket",
    });
    const standalone = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId,
      title: "Standalone ticket",
    });
    await updateTicket(page.request, baseUrl, child.id, { parentTicketId: parent.id });
    const resolvedChildParent = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId,
      title: "Parent with resolved child",
    });
    const resolvedChild = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId,
      title: "Resolved child ticket",
    });
    const completedLane = await createCompletionLane(page.request, baseUrl, boardPayload.board.id);
    await updateTicket(page.request, baseUrl, resolvedChild.id, { parentTicketId: resolvedChildParent.id, laneId: completedLane.id });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);

    const title = page.getByRole("button", { name: "Child ticket", exact: true });
    await title.focus();
    const originalTitle = await title.elementHandle();
    const hierarchyIcons = [
      [parent.id, "parent", "Parent ticket", "folder-up"],
      [resolvedChildParent.id, "parent", "Parent ticket", "folder-up"],
      [child.id, "child", "Child ticket", "folder-tree"],
      [standalone.id, "single", "Standalone ticket", "ticket"],
    ] as const;
    for (const forcedColors of ["none", "active", "none"] as const) {
      await page.emulateMedia({ forcedColors });
      for (const [id, hierarchy, label, name] of hierarchyIcons) {
        const icon = page.locator(`.ticket-card[data-ticket-id="${id}"] .ticket-hierarchy-icon-${hierarchy}`);
        await expect(icon).toHaveAttribute("aria-label", label);
        await expect(icon.locator(".icon")).toHaveAttribute("aria-hidden", "true");
        if (forcedColors === "active") {
          await expect(icon.locator('svg[viewBox="0 0 24 24"] > path').first()).toBeAttached();
        } else {
          await expect(icon.locator(".kanban-card-icon")).toHaveCSS("mask-image", new RegExp(`/group-row-icons/${name}\\.svg`));
        }
      }
      expect(await originalTitle?.evaluate(element => element === document.activeElement)).toBe(true);
    }
  } finally {
    await close();
  }
});

test("kanban lane create rename delete and reorder are wired", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Lane Operations", laneNames: ["Alpha", "Beta", "Gamma"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#board-title")).toHaveText("Lane Operations");
    await page.getByRole("button", { name: "New lane" }).click();
    await expect(page.locator("[data-lane-create-input]")).toBeFocused();
    await page.locator("[data-lane-create-input]").fill("Canceled Lane");
    await page.locator("[data-lane-create-input]").press("Escape");
    await expect(page.locator(".lane-title", { hasText: "Canceled Lane" })).toHaveCount(0);

    await page.getByRole("button", { name: "New lane" }).click();
    await page.locator("[data-lane-create-input]").fill("Delta");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/boards/${boardPayload.board.id}/lanes`) &&
        response.request().method() === "POST",
    );
    await page.locator("[data-lane-create-input]").press("Enter");
    const createResult = await createResponse;
    expect(createResult.status()).toBe(201);
    const deltaLane = await createResult.json();
    await expect(page.locator(".lane-title", { hasText: "Delta" })).toBeVisible();

    const betaLane = page.locator(".lane", { has: page.locator(".lane-title", { hasText: "Beta" }) });
    await betaLane.locator("[data-action='toggle-lane-actions']").click();
    await betaLane.locator("[data-action='rename-lane']").click();
    await expect(betaLane.locator("[data-lane-rename-input]")).toBeFocused();
    await expect(betaLane.locator("[data-lane-rename-input]")).toHaveValue("Beta");
    await betaLane.locator("[data-lane-rename-input]").fill("Review");
    const renameResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/lanes/") &&
        response.request().method() === "PATCH",
    );
    await betaLane.locator("[data-lane-rename-input]").press("Enter");
    expect((await renameResponse).status()).toBe(200);
    await expect(page.locator(".lane-title", { hasText: "Review" })).toBeVisible();
    await expect(page.locator(".lane-title", { hasText: "Beta" })).toHaveCount(0);

    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/api/boards/${boardPayload.board.id}/lanes/reorder`) && response.status() === 200),
      page.evaluate(() => {
        const laneBoard = document.querySelector("#lane-board");
        const alphaTitle = [...document.querySelectorAll(".lane-title")].find((title) => title.textContent === "Alpha");
        if (!laneBoard || !alphaTitle) {
          throw new Error("Lane reorder fixture is missing");
        }
        const boardBox = laneBoard.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        alphaTitle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
        laneBoard.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            clientX: boardBox.right + 100,
            clientY: boardBox.top + 40,
            dataTransfer,
          }),
        );
        alphaTitle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
      }),
    ]);
    await expect(page.locator(".lane-title").first()).toHaveText("Review");
    await page.reload();
    await expect(page.locator(".lane-title").first()).toHaveText("Review");

    const movingTicketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: boardPayload.lanes[1].id,
        title: "Move between lanes",
      },
    });
    expect(movingTicketResponse.status()).toBe(201);
    const movingTicket = await movingTicketResponse.json();
    await page.reload();
    await expect(page.getByRole("button", { name: "Move between lanes" })).toBeVisible();
    await page.waitForFunction(({ targetLaneId, ticketId }) =>
      Boolean(
        document.querySelector(`.ticket-card[data-ticket-id="${ticketId}"]`) &&
        document.querySelector(`.ticket-list[data-lane-id="${targetLaneId}"]`),
      ), { targetLaneId: deltaLane.id, ticketId: movingTicket.id });
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/api/tickets/${movingTicket.id}/position`) &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
      ),
      page.evaluate(({ targetLaneId, ticketId }) => {
        const card = document.querySelector(`.ticket-card[data-ticket-id="${ticketId}"]`);
        const targetList = document.querySelector(`.ticket-list[data-lane-id="${targetLaneId}"]`);
        if (!card || !targetList) {
          throw new Error("Ticket move fixture is missing");
        }
        const targetBox = targetList.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
        targetList.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            clientX: targetBox.left + 8,
            clientY: targetBox.top + 8,
            dataTransfer,
          }),
        );
        targetList.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
      }, { targetLaneId: deltaLane.id, ticketId: movingTicket.id }),
    ]);
    await expect(page.locator(".lane", { has: page.getByRole("button", { name: "Move between lanes" }) }).locator(".lane-title")).toHaveText("Delta");
    await page.reload();
    await expect(page.locator(".lane", { has: page.getByRole("button", { name: "Move between lanes" }) }).locator(".lane-title")).toHaveText("Delta");
    await expect(page.locator(`.ticket-card[data-ticket-id="${movingTicket.id}"]`)).toBeVisible();
    await expect(page.locator(".lane-title").first()).toBeVisible();

    await page.evaluate(({ ticketId }) => {
      const laneBoard = document.querySelector("#lane-board");
      const card = document.querySelector(`.ticket-card[data-ticket-id="${ticketId}"]`);
      const targetHeader = document.querySelector(".lane-title");
      if (!laneBoard || !card || !targetHeader) {
        throw new Error("Ticket drag isolation fixture is missing");
      }
      const headerBox = targetHeader.getBoundingClientRect();
      const dataTransfer = new DataTransfer();
      card.dispatchEvent(new DragEvent("dragstart", {
        bubbles: true,
        cancelable: true,
        clientX: 12,
        clientY: 12,
        dataTransfer,
      }));
      laneBoard.dispatchEvent(new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        clientX: headerBox.left + 8,
        clientY: headerBox.top + 8,
        dataTransfer,
      }));
      card.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
    }, { ticketId: movingTicket.id });
    await expect(page.locator(".lane-title").first()).toHaveText("Review");
    await expect(page.locator(".dragging-lane")).toHaveCount(0);

    const gammaLane = page.locator(".lane", { has: page.locator(".lane-title", { hasText: "Gamma" }) });
    await gammaLane.locator("[data-action='toggle-lane-actions']").click();
    await gammaLane.locator("[data-action='delete-lane']").click();
    await expect(page.locator("#ux-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#ux-title")).toHaveText("Delete Lane");
    await expect(page.locator("#ux-message")).toContainText('Delete lane "Gamma"?');
    await expect(page.locator("#ux-message")).toContainText("This action cannot be undone.");
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/lanes/") &&
        response.request().method() === "DELETE",
    );
    await page.locator("#ux-submit-button").click();
    expect((await deleteResponse).status()).toBe(204);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.locator(".lane-title", { hasText: "Gamma" })).toHaveCount(0);
  } finally {
    await page.close();
    await closeTestApp(app);
  }
});

test("lane drag previews keep the scroll range with only nearby cards", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, {
      name: "Drag preview scroll range", laneNames: ["Source", "Target"],
    });
    const laneId = lanes[0].id;
    for (let index = 0; index < 7; index += 1) {
      await createTicket(page.request, baseUrl, board.id, {
        laneId,
        title: index % 4 === 2
          ? `Card ${index + 1} with a long variable-height title wrapping across several lines in this lane`
          : `Card ${index + 1}`,
      });
    }
    await page.goto(`${baseUrl}/boards/${board.id}`);
    const source = page.locator(`#lane-board .lane[data-lane-id="${laneId}"]`);
    await expect(source.locator(".ticket-card")).toHaveCount(7);
    const result = await source.evaluate((lane) => {
      if (!(lane instanceof HTMLElement)) throw new Error("Source lane is missing");
      // Leave spare room in the source list while its 420px preview must scroll.
      lane.style.height = "800px";
      const list = lane.querySelector<HTMLElement>(".ticket-list");
      const handle = lane.querySelector<HTMLElement>("[data-action='drag-lane']");
      const first = list?.firstElementChild;
      const last = list?.lastElementChild;
      if (!list || !handle || !first || !last) throw new Error("Drag fixture is incomplete");
      const { paddingTop, paddingBottom } = getComputedStyle(list);
      const contentHeight = Math.round(last.getBoundingClientRect().bottom - first.getBoundingClientRect().top
        + Number.parseFloat(paddingTop) + Number.parseFloat(paddingBottom));
      const dataTransfer = new DataTransfer();
      let offset: number[] = [];
      dataTransfer.setDragImage = (_image, x, y) => { offset = [x, y]; };
      const box = lane.getBoundingClientRect();
      handle.dispatchEvent(new DragEvent("dragstart", {
        bubbles: true, cancelable: true, dataTransfer, clientX: box.left - 10, clientY: box.top - 10,
      }));
      const preview = document.querySelector<HTMLElement>(".lane-drag-preview .ticket-list");
      if (!preview) throw new Error("Drag preview is missing");
      const priorityIcon = preview.querySelector(".ticket-priority-icon .kanban-card-icon");
      if (!priorityIcon) throw new Error("Priority icon is missing from the preview");
      const sizes = {
        contentHeight,
        priorityMask: getComputedStyle(priorityIcon).maskImage,
        sourceHeight: list.clientHeight,
        previewHeight: preview.clientHeight,
        previewScrollHeight: preview.scrollHeight,
        previewCards: preview.querySelectorAll(".ticket-card").length,
        offset,
      };
      handle.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer }));
      return sizes;
    });
    expect(result.sourceHeight).toBeGreaterThan(result.contentHeight);
    expect(result.previewHeight).toBeLessThan(result.contentHeight);
    expect(result.previewScrollHeight).toBe(result.contentHeight);
    expect(result.previewCards).toBeGreaterThan(0);
    expect(result.previewCards).toBeLessThan(7);
    expect(result.offset).toEqual([24, 18]);
    expect(result.priorityMask).toMatch(/\/kanban-card-icons\/priority-medium\.svg/);
    await expect(page.locator(".lane-drag-preview")).toHaveCount(0);
    await expect(source.locator(".ticket-card")).toHaveCount(7);
  } finally {
    await close();
  }
});

test("kanban ticket drag persists when inactive tickets are hidden", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Hidden Inactive DnD", laneNames: ["Todo", "Done"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const todoLane = boardPayload.lanes[0];
    const doneLane = boardPayload.lanes[1];
    const movingResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: { laneId: todoLane.id, title: "Move with hidden inactive" },
    });
    expect(movingResponse.status()).toBe(201);
    const movingTicket = await movingResponse.json();
    const doneHiddenTicketIds = [];
    for (let index = 0; index < 10; index += 1) {
      const response = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
        data: { laneId: doneLane.id, title: `Archived hidden ${index}`, isArchived: true },
      });
      expect(response.status()).toBe(201);
      doneHiddenTicketIds.push((await response.json()).id);
    }
    const anchorResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: { laneId: doneLane.id, title: "Done anchor" },
    });
    expect(anchorResponse.status()).toBe(201);
    const anchorTicket = await anchorResponse.json();

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.getByRole("button", { name: "Move with hidden inactive" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Done anchor" })).toBeVisible();
    await page.waitForFunction(({ targetLaneId, ticketId }) =>
      Boolean(
        document.querySelector(`.ticket-card[data-ticket-id="${ticketId}"]`) &&
        document.querySelector(`.ticket-list[data-lane-id="${targetLaneId}"]`),
      ), { targetLaneId: doneLane.id, ticketId: movingTicket.id });
    await Promise.all([
      page.waitForResponse((response) =>
        response.url().endsWith(`/api/tickets/${movingTicket.id}/position`) &&
        response.request().method() === "PATCH" &&
        response.status() === 200,
      ),
      page.evaluate(({ targetLaneId, ticketId }) => {
        const card = document.querySelector(`.ticket-card[data-ticket-id="${ticketId}"]`);
        const targetList = document.querySelector(`.ticket-list[data-lane-id="${targetLaneId}"]`);
        const anchor = [...targetList?.querySelectorAll(".ticket-card[data-ticket-id]") ?? []].at(-1);
        if (!card || !targetList) {
          throw new Error("Hidden inactive drag fixture is missing");
        }
        const targetBox = (anchor ?? targetList).getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
        targetList.dispatchEvent(
          new DragEvent("dragover", {
            bubbles: true,
            cancelable: true,
            clientX: targetBox.left + 8,
            clientY: targetBox.bottom + 12,
            dataTransfer,
          }),
        );
        targetList.dispatchEvent(new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: targetBox.left + 8,
          clientY: targetBox.bottom + 12,
          dataTransfer,
        }));
      }, { targetLaneId: doneLane.id, ticketId: movingTicket.id }),
    ]);

    const ticketResponse = await page.request.get(`${baseUrl}/api/tickets/${movingTicket.id}`);
    expect(ticketResponse.status()).toBe(200);
    expect((await ticketResponse.json()).laneId).toBe(doneLane.id);
    const ticketsResponse = await page.request.get(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets?archived=all`);
    expect(ticketsResponse.status()).toBe(200);
    const doneTicketIds = (await ticketsResponse.json()).tickets
      .filter((ticket: { laneId: number }) => ticket.laneId === doneLane.id)
      .map((ticket: { id: number }) => ticket.id);
    expect(doneTicketIds).toEqual([anchorTicket.id, movingTicket.id, ...doneHiddenTicketIds]);
    await page.reload();
    await expect(page.locator(".lane", { has: page.getByRole("button", { name: "Move with hidden inactive" }) }).locator(".lane-title")).toHaveText("Done");
  } finally {
    await page.close();
    await closeTestApp(app);
  }
});

test("kanban lane reorder refreshes back after persistence failure", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Lane Reorder Failure", laneNames: ["Alpha", "Beta", "Gamma"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    await page.route(`**/api/boards/${boardPayload.board.id}/lanes/reorder`, async (route) => {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "forced failure" }) });
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".lane-title").first()).toHaveText("Alpha");
    await Promise.all([
      page.waitForResponse((response) => response.url().endsWith(`/api/boards/${boardPayload.board.id}/lanes/reorder`) && response.status() === 400),
      page.evaluate(() => {
        const laneBoard = document.querySelector("#lane-board");
        const alphaTitle = [...document.querySelectorAll(".lane-title")].find((title) => title.textContent === "Alpha");
        if (!laneBoard || !alphaTitle) {
          throw new Error("Lane reorder rollback fixture is missing");
        }
        const boardBox = laneBoard.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        alphaTitle.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
        laneBoard.dispatchEvent(new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientX: boardBox.right + 100,
          clientY: boardBox.top + 40,
          dataTransfer,
        }));
        alphaTitle.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
      }),
    ]);
    await expect(page.locator(".lane-title").first()).toHaveText("Alpha");
  } finally {
    await page.close();
    await closeTestApp(app);
  }
});

test("kanban horizontal overflow stays inside the lane board", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    await page.setViewportSize({ width: 1000, height: 700 });
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Wide Kanban", laneNames: ["Backlog", "To do", "In progress", "In review", "Inspection", "Merging", "Done"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#board-title")).toHaveText("Wide Kanban");

    const readOverflow = async (selector: string) => page.evaluate((targetSelector) => {
      const root = document.documentElement;
      const target = document.querySelector(targetSelector);
      if (!(target instanceof HTMLElement)) {
        throw new Error(`Missing overflow target: ${targetSelector}`);
      }
      return {
        pageClientWidth: root.clientWidth,
        pageScrollWidth: root.scrollWidth,
        targetClientWidth: target.clientWidth,
        targetScrollWidth: target.scrollWidth,
      };
    }, selector);

    const overflow = await readOverflow("#lane-board");
    expect(overflow.pageScrollWidth).toBeLessThanOrEqual(overflow.pageClientWidth);
    expect(overflow.targetScrollWidth).toBeGreaterThan(overflow.targetClientWidth);

    await page.getByRole("button", { name: "List", exact: true }).click();
    await expect(page.locator("#list-board")).toBeVisible();
    const listOverflow = await readOverflow("#list-board");
    expect(listOverflow.pageScrollWidth).toBeLessThanOrEqual(listOverflow.pageClientWidth);

    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await page.locator("#sidebar-toggle-button").click();
    await expect(page.locator(".shell")).toHaveClass(/sidebar-collapsed/);
    const collapsedSidebar = await page.locator("#sidebar").evaluate((sidebar) => {
      const rect = sidebar.getBoundingClientRect();
      const styles = getComputedStyle(sidebar);
      return {
        width: rect.width,
        paddingLeft: styles.paddingLeft,
        transform: styles.transform,
      };
    });
    expect(collapsedSidebar.width).toBe(280);
    expect(collapsedSidebar.paddingLeft).not.toBe("0px");
    expect(collapsedSidebar.transform).not.toBe("none");
    const collapsedOverflow = await readOverflow("#lane-board");
    expect(collapsedOverflow.pageScrollWidth).toBeLessThanOrEqual(collapsedOverflow.pageClientWidth);
    expect(collapsedOverflow.targetScrollWidth).toBeGreaterThan(collapsedOverflow.targetClientWidth);
  } finally {
    await page.close();
    await closeTestApp(app);
  }
});

test("completion lanes show five then fifty at a time and keep newly completed tickets visible", async ({ page }) => {
  test.setTimeout(90_000);
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Completion paging", laneNames: ["Doing"] });
    const completed = await createCompletionLane(page.request, baseUrl, board.id);
    const moving = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Finish this ticket" });
    for (let index = 0; index < 6; index++) {
      await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: `Open work ${index}` });
    }
    const completedIds: number[] = [];
    for (let index = 0; index < 108; index++) {
      // Keep the last fixture completion outside the prior millisecond, so the
      // assertion tests recency rather than the tie-break for a bulk timestamp.
      if (index === 107) await new Promise(resolve => setTimeout(resolve, 5));
      const ticket = await createTicket(page.request, baseUrl, board.id, { laneId: completed.id, title: `Completed work ${index}` });
      completedIds.push(ticket.id);
    }
    const archived = await createTicket(page.request, baseUrl, board.id, { laneId: completed.id, title: "Archived history", isArchived: true });
    const snapshot = async () => (await (await page.request.get(`${baseUrl}/api/boards/${board.id}/tickets?archived=all`)).json()).tickets;
    const before = await snapshot();
    await page.goto(`${baseUrl}/boards/${board.id}`);
    const doneList = page.locator(`.ticket-list[data-lane-id="${completed.id}"]`);
    const doneCards = doneList.locator(".ticket-card");
    const summary = doneList.locator(".completion-ticket-summary");
    await expect(page.locator(`.ticket-list[data-lane-id="${lanes[0].id}"] .ticket-card`)).toHaveCount(7);
    await expect(doneCards).toHaveCount(5);
    await expect(doneCards.first()).toHaveAttribute("data-ticket-id", String(completedIds.at(-1)));
    await expect(page.locator(`.ticket-card[data-ticket-id="${archived.id}"]`)).toHaveCount(0);

    for (const locale of ["en", "ja"] as const) {
      if (locale === "ja") {
        await page.locator("#board-settings-toggle-button").click();
        await page.locator("#language-select").selectOption(locale);
        await expect(page.locator("html")).toHaveAttribute("lang", locale);
      }
      const moreName = (count: number, remaining: number) => locale === "en"
        ? `Show ${count} more (${remaining} remaining)`
        : `さらに${count}件表示（残り${remaining}件）`;
      const collapseName = locale === "en" ? "Show latest 5" : "最近の5件に戻す";
      await expect(doneCards).toHaveCount(5);
      await summary.getByRole("button", { name: moreName(50, 103), exact: true }).click();
      await expect(doneCards).toHaveCount(55);
      // Collapse remains available before all history has been loaded.
      await summary.getByRole("button", { name: collapseName, exact: true }).click();
      await expect(doneCards).toHaveCount(5);
      await summary.getByRole("button", { name: moreName(50, 103), exact: true }).click();
      await summary.getByRole("button", { name: moreName(50, 53), exact: true }).click();
      await expect(doneCards).toHaveCount(105);
      await summary.getByRole("button", { name: moreName(3, 3), exact: true }).click();
      await expect(doneCards).toHaveCount(108);
      expect(new Set(await doneCards.evaluateAll(cards => cards.map(card => card.getAttribute("data-ticket-id")))).size).toBe(108);
      await summary.getByRole("button", { name: collapseName, exact: true }).click();
      await expect(doneCards).toHaveCount(5);
    }
    expect(await snapshot()).toEqual(before);

    // Drop near the end of the displayed lane: completion recency must win over
    // the pointer's insertion position, including after a full page reload.
    await Promise.all([
      page.waitForResponse(response => response.url().endsWith(`/api/tickets/${moving.id}/position`) && response.request().method() === "PATCH" && response.ok()),
      page.evaluate(({ laneId, ticketId }) => {
        const card = document.querySelector(`.ticket-card[data-ticket-id="${ticketId}"]`);
        const list = document.querySelector(`.ticket-list[data-lane-id="${laneId}"]`);
        if (!card || !list) throw new Error("Completion drag fixture missing");
        const last = [...list.querySelectorAll(".ticket-card")].at(-1)!;
        const box = last.getBoundingClientRect();
        const dataTransfer = new DataTransfer();
        card.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
        list.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer, clientX: box.left + 8, clientY: box.bottom + 12 }));
        list.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
      }, { laneId: completed.id, ticketId: moving.id }),
    ]);
    await expect(doneCards).toHaveCount(5);
    await expect(doneCards.first()).toHaveAttribute("data-ticket-id", String(moving.id));
    await expect(doneCards.first()).toBeInViewport();
    const persisted = await (await page.request.get(`${baseUrl}/api/tickets/${moving.id}`)).json();
    expect(persisted.laneId).toBe(completed.id);
    expect(persisted.isResolved).toBe(true);
    await page.reload();
    await expect(doneCards).toHaveCount(5);
    await expect(doneCards.first()).toHaveAttribute("data-ticket-id", String(moving.id));
    // Editing an older completed ticket is not a new completion.
    await updateTicket(page.request, baseUrl, completedIds[0], { title: "Edited old completed ticket" });
    await page.reload();
    await expect(doneCards.first()).toHaveAttribute("data-ticket-id", String(moving.id));
    const after = await snapshot();
    expect(after).toHaveLength(before.length);
    expect(after.find((ticket: { id: number }) => ticket.id === archived.id).isArchived).toBe(true);
  } finally { await close(); }
});
