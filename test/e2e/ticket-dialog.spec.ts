import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path, startTestApp, createBoard, createTicket, updateTicket } from "./helpers.js";

test("ticket detail dialog closes with Escape and backdrop click", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Ticket Dialog Board", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];
    const ticketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: lane.id,
        title: "Dialog close ticket",
        bodyMarkdown: "Dialog body",
      },
    });
    expect(ticketResponse.status()).toBe(201);
    const ticket = await ticketResponse.json();

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toHaveText("Dialog close ticket");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.getByRole("button", { name: "Dialog close ticket" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#editor-dialog").evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      dialog.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        clientX: rect.left - 8,
        clientY: rect.top - 8,
      }));
    });
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
  } finally {
    await page.close();
    await app.close();
  }
});

test("board refresh resumes after closing ticket detail dialog", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Dialog Refresh Board",
      laneNames: ["Todo"],
    });
    const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Original title",
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.getByRole("button", { name: "Original title" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toHaveText("Original title");

    await updateTicket(page.request, baseUrl, ticket.id, {
      title: "Updated behind dialog",
    });

    await expect(page.locator("#editor-header-title")).toHaveText("Original title");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.getByRole("button", { name: "Updated behind dialog" })).toBeVisible();
  } finally {
    await close();
  }
});

test("multiple background updates are reflected after closing ticket detail dialog", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Dialog Refresh Burst Board",
      laneNames: ["Todo"],
    });
    const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Burst original title",
      bodyMarkdown: "Original body",
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.getByRole("button", { name: "Burst original title" }).click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toHaveText("Burst original title");

    await updateTicket(page.request, baseUrl, ticket.id, {
      title: "Burst title 1",
    });
    await updateTicket(page.request, baseUrl, ticket.id, {
      title: "Burst title 2",
      bodyMarkdown: "Body after burst",
    });

    await expect(page.locator("#editor-header-title")).toHaveText("Burst original title");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(page.getByRole("button", { name: "Burst title 2" })).toBeVisible();

    await page.getByRole("button", { name: "Burst title 2" }).click();
    await expect(page.locator("#ticket-view")).toContainText("Body after burst");
  } finally {
    await close();
  }
});

test("direct ticket route catches up after closing dialog following background update", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Direct Ticket Route Board",
      laneNames: ["Todo"],
    });
    const ticket = await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Direct route original title",
    });

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-title")).toHaveText("Direct route original title");

    await updateTicket(page.request, baseUrl, ticket.id, {
      title: "Direct route updated title",
    });

    await expect(page.locator("#editor-header-title")).toHaveText("Direct route original title");
    await page.keyboard.press("Escape");
    await expect(page.locator("#editor-dialog")).not.toHaveJSProperty("open", true);
    await expect(page).toHaveURL(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.getByRole("button", { name: "Direct route updated title" })).toBeVisible();
  } finally {
    await close();
  }
});
