import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

test("long tag labels are constrained across ticket surfaces", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const longTagName = "very-long-tag-name-without-natural-breaks-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Long Tag Board", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];
    const ticketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: lane.id,
        title: "Long tag ticket",
      },
    });
    expect(ticketResponse.status()).toBe(201);
    const ticket = await ticketResponse.json();
    const tagResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`, {
      data: { name: longTagName, color: "#1f6f5f" },
    });
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();
    const updateResponse = await page.request.patch(`${baseUrl}/api/tickets/${ticket.id}`, {
      data: {
        laneId: lane.id,
        title: ticket.title,
        bodyMarkdown: ticket.bodyMarkdown,
        priority: ticket.priority,
        isResolved: ticket.isResolved,
        isArchived: ticket.isArchived,
        parentTicketId: ticket.parentTicketId,
        tagIds: [tag.id],
        blockerIds: [],
      },
    });
    expect(updateResponse.status()).toBe(200);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag [aria-hidden="true"]`)).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag`)).toHaveAttribute("title", longTagName);
    await expect(page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag .visually-hidden`)).toHaveText(longTagName);
    await expect
      .poll(async () =>
        page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`).evaluate((card) => {
          const tagElement = card.querySelector(".tag");
          if (!tagElement) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1
            && card.scrollWidth <= card.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    const listRow = page.locator(`[data-open-ticket-id="${ticket.id}"]`).locator("xpath=..");
    await expect(listRow.locator(".tag [aria-hidden='true']")).toHaveText("very-long-tag-name-withou...");
    await expect(listRow.locator(".tag")).toHaveAttribute("title", longTagName);
    await expect
      .poll(async () =>
        listRow.evaluate((row) => {
          const tagElement = row.querySelector(".tag");
          const tagCell = row.querySelector(".tag-list");
          if (!tagElement || !tagCell) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= tagCell.getBoundingClientRect().right + 1
            && row.scrollWidth <= row.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator(".ticket-meta-row .tag [aria-hidden='true']")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator(".ticket-meta-row .tag")).toHaveAttribute("title", longTagName);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip-text")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("title", `Remove tag: ${longTagName}`);
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("aria-label", `Remove tag: ${longTagName}`);
    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options .tag-picker-text")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("title", longTagName);
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("aria-label", longTagName);
  } finally {
    await page.close();
    await app.close();
  }
});

test("long tag labels remain safe without Intl.Segmenter", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Intl, "Segmenter", {
      configurable: true,
      value: undefined,
    });
  });
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const longTagName = "🇯🇵🇺🇸very-long-tag-name-without-natural-breaks-abcdefghijklmnopqrstuvwxyz";
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Fallback Tag Board", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();
    const lane = boardPayload.lanes[0];
    const ticketResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tickets`, {
      data: {
        laneId: lane.id,
        title: "Fallback long tag ticket",
      },
    });
    expect(ticketResponse.status()).toBe(201);
    const ticket = await ticketResponse.json();
    const tagResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`, {
      data: { name: longTagName, color: "#1f6f5f" },
    });
    expect(tagResponse.status()).toBe(201);
    const tag = await tagResponse.json();
    const updateResponse = await page.request.patch(`${baseUrl}/api/tickets/${ticket.id}`, {
      data: {
        laneId: lane.id,
        title: ticket.title,
        bodyMarkdown: ticket.bodyMarkdown,
        priority: ticket.priority,
        isResolved: ticket.isResolved,
        isArchived: ticket.isArchived,
        parentTicketId: ticket.parentTicketId,
        tagIds: [tag.id],
        blockerIds: [],
      },
    });
    expect(updateResponse.status()).toBe(200);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    const tagLocator = page.locator(`.ticket-card[data-ticket-id="${ticket.id}"] .tag`);
    await expect(tagLocator.locator("[aria-hidden='true']")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(tagLocator).toHaveAttribute("title", longTagName);
    await expect
      .poll(async () =>
        page.locator(`.ticket-card[data-ticket-id="${ticket.id}"]`).evaluate((card) => {
          const tagElement = card.querySelector(".tag");
          if (!tagElement) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= card.getBoundingClientRect().right + 1
            && card.scrollWidth <= card.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}/list`);
    const listRow = page.locator(`[data-open-ticket-id="${ticket.id}"]`).locator("xpath=..");
    await expect(listRow.locator(".tag [aria-hidden='true']")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(listRow.locator(".tag")).toHaveAttribute("title", longTagName);
    await expect
      .poll(async () =>
        listRow.evaluate((row) => {
          const tagElement = row.querySelector(".tag");
          const tagCell = row.querySelector(".tag-list");
          if (!tagElement || !tagCell) {
            return true;
          }
          return tagElement.getBoundingClientRect().right <= tagCell.getBoundingClientRect().right + 1
            && row.scrollWidth <= row.clientWidth + 1;
        }),
      )
      .toBe(true);

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator(".ticket-meta-row .tag [aria-hidden='true']")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator(".ticket-meta-row .tag")).toHaveAttribute("title", longTagName);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip-text")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("title", `Remove tag: ${longTagName}`);
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("aria-label", `Remove tag: ${longTagName}`);
    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options .tag-picker-text")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("title", longTagName);
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveAttribute("aria-label", longTagName);
  } finally {
    await page.close();
    await app.close();
  }
});
