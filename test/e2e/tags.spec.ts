import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

test("sidebar tag create and edit stay inline", async ({ page }) => {
  const app = buildApp({
    dbFile: createDbFile(),
    staticDir: path.join(process.cwd(), "public"),
  });
  const port = await getFreePort();
  await app.listen({ host: "127.0.0.1", port });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const boardResponse = await page.request.post(`${baseUrl}/api/boards`, {
      data: { name: "Inline Tag Board", laneNames: ["todo"] },
    });
    expect(boardResponse.status()).toBe(201);
    const boardPayload = await boardResponse.json();

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.locator("#new-sidebar-tag-button").click();
    await expect(page.locator("[data-sidebar-tag-create-form]")).toBeVisible();
    await expect(page.locator("[data-sidebar-tag-create-form]")).not.toContainText("New tag");
    await expect(page.locator("[data-sidebar-tag-create-form] button")).toHaveCount(0);
    await expect(page.locator("#ux-dialog")).not.toHaveJSProperty("open", true);
    await page.locator("[data-sidebar-tag-name]").fill("draft-tag");
    await page.keyboard.press("Tab");
    await expect(page.locator("[data-sidebar-tag-create-form]")).toHaveCount(0);
    await expect(page.locator("#sidebar-tag-list")).not.toContainText("draft-tag");

    await page.locator("#new-sidebar-tag-button").click();
    await expect(page.locator("[data-sidebar-tag-create-form]")).toBeVisible();
    await page.locator("[data-sidebar-tag-name]").fill("inline-tag");
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/boards/${boardPayload.board.id}/tags`) &&
        response.request().method() === "POST",
    );
    await page.locator("[data-sidebar-tag-name]").press("Enter");
    expect((await createResponse).status()).toBe(201);
    await expect(page.locator("[data-sidebar-tag-create-form]")).toHaveCount(0);
    const badge = page.locator("#sidebar-tag-list .sidebar-tag-badge", { hasText: "inline-tag" });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(/tag-no-color/);

    await badge.click();
    await expect(page.locator("[data-sidebar-tag-edit-form]")).toBeVisible();
    await expect(page.locator(".sidebar-tag-preview-badge")).toHaveText("inline-tag");
    await expect(page.locator(".sidebar-tag-preview-badge .icon")).toHaveCount(0);
    await page.locator("[data-sidebar-tag-name]").fill("inline-tag-renamed");
    await expect(page.locator(".sidebar-tag-preview-badge")).toHaveText("inline-tag");
    await expect(page.locator(".sidebar-tag-form [data-color-enabled-for='color']")).not.toBeChecked();
    await expect(page.locator(".sidebar-tag-form [data-field-id='color']")).toHaveValue("#1F6F5F");
    await expect(page.locator(".sidebar-tag-form [data-color-picker-for='color']")).toHaveValue("#1f6f5f");
    await page.locator(".sidebar-tag-form .ux-color-enable-switch").click();
    await expect(page.locator(".sidebar-tag-form [data-color-enabled-for='color']")).toBeChecked();
    await expect(page.locator(".sidebar-tag-form [data-color-picker-for='color']")).toHaveValue("#1f6f5f");
    const colorInputWidths = await page.locator(".sidebar-tag-form .ux-color-row").evaluate((row) => {
      const [switchCell, hexInput, colorCell] = [...row.children].map((child) => child.getBoundingClientRect().width);
      return { switchCell, hexInput, colorCell };
    });
    expect(Math.abs(colorInputWidths.switchCell - colorInputWidths.hexInput)).toBeLessThan(2);
    expect(Math.abs(colorInputWidths.colorCell - colorInputWidths.switchCell * 2 / 3)).toBeLessThan(2);
    await page.locator(".sidebar-tag-form [data-field-id='color']").fill("#336699");
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/tags/") &&
        response.request().method() === "PATCH",
    );
    await page.locator("[data-sidebar-tag-edit-form] button", { hasText: "Save" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(page.locator("#sidebar-tag-list .sidebar-tag-badge", { hasText: "inline-tag-renamed" })).toBeVisible();

    await page.locator("#sidebar-tag-list .sidebar-tag-badge", { hasText: "inline-tag-renamed" }).click();
    await expect(page.locator("[data-sidebar-tag-delete]")).toHaveAttribute("aria-label", "Delete tag");
    await expect(page.locator("[data-sidebar-tag-delete]")).not.toContainText("Delete");
    await page.locator("[data-sidebar-tag-delete]").click();
    await expect(page.locator(".sidebar-tag-delete-confirm")).toContainText("Delete this tag?");
    await expect(page.locator(".sidebar-tag-delete-confirm-actions")).toBeVisible();
    await expect(page.locator("[data-sidebar-tag-name]")).toBeDisabled();
    await expect(page.locator(".sidebar-tag-form [data-color-enabled-for='color']")).toBeDisabled();
    await expect(page.locator(".sidebar-tag-form [data-field-id='color']")).toBeDisabled();
    await expect(page.locator(".sidebar-tag-form [data-color-picker-for='color']")).toBeDisabled();
    await expect(page.locator("[data-sidebar-tag-delete-cancel]")).toBeEnabled();
    await expect(page.locator("[data-sidebar-tag-delete-confirm]")).toBeEnabled();
    const deleteResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/tags/") &&
        response.request().method() === "DELETE",
    );
    await page.locator("[data-sidebar-tag-delete-confirm]").click();
    expect((await deleteResponse).status()).toBe(204);
    await expect(page.locator("#sidebar-tag-list")).toContainText("No tags yet.");
  } finally {
    await page.close();
    await app.close();
  }
});

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
