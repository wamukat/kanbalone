import { expect, test, type Locator } from "@playwright/test";

import { closeTestApp, buildApp, createDbFile, getFreePort, path, showCurrentTicket } from "./helpers.js";

async function expectWrappedListTag(row: Locator, name: string) {
  const tag = row.locator(".tag");
  await expect(tag.locator("[aria-hidden='true']")).toHaveText(name);
  await expect(tag.locator(".visually-hidden")).toHaveText(name);
  await expect(tag).toHaveAttribute("title", name);
  await expect.poll(() =>
    row.evaluate((element) => {
      const chip = element.querySelector(".tag");
      const label = chip?.querySelector("[aria-hidden='true']");
      const tagList = element.querySelector(".tag-list");
      if (!chip || !label || !tagList) return false;
      const range = document.createRange();
      range.selectNodeContents(label);
      const lines = Array.from(range.getClientRects());
      const chipBounds = chip.getBoundingClientRect();
      return lines.length > 1
        && lines.every((line) => line.right <= chipBounds.right + 1 && line.bottom <= chipBounds.bottom + 1)
        && chipBounds.right <= tagList.getBoundingClientRect().right + 1
        && chipBounds.bottom <= element.getBoundingClientRect().bottom + 1
        && element.scrollWidth <= element.clientWidth + 1;
    }),
  ).toBe(true);
}

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

    await page.getByRole("button", { name: "Manage tags" }).click();
    await badge.click();
    await expect(page.locator("[data-sidebar-tag-edit-form]")).toBeVisible();
    await expect(page.locator(".sidebar-tag-preview-badge")).toHaveText("inline-tag");
    await expect(page.locator(".sidebar-tag-preview-badge .icon")).toHaveCount(0);
    await page.locator("[data-sidebar-tag-name]").fill("inline-tag-renamed");
    await expect(page.locator(".sidebar-tag-preview-badge")).toHaveText("inline-tag");
    const colorToggle = page.getByRole("checkbox", { name: "Use color" });
    const hexField = page.locator(".sidebar-tag-form [data-field-id='color']");
    const colorPicker = page.locator(".sidebar-tag-form [data-color-picker-for='color']");
    const switchKnob = page.locator(".sidebar-tag-form .toggle-switch-knob");
    await expect(colorToggle).not.toBeChecked();
    await expect(hexField).toHaveValue("#1F6F5F");
    await expect(colorPicker).toHaveValue("#1f6f5f");

    await page.emulateMedia({ forcedColors: "active" });
    await page.locator(".sidebar-tag-form [data-sidebar-tag-name]").press("Tab");
    await expect(colorToggle).toBeFocused();
    await expect(colorToggle).toHaveCSS("width", "1px");
    await expect(page.locator(".sidebar-tag-form .toggle-switch-control")).toHaveCSS("outline-style", "solid");
    await colorToggle.press("Space");
    await expect(colorToggle).toBeChecked();
    await expect(colorPicker).toBeVisible();
    await colorToggle.press("Space");
    await expect(colorToggle).not.toBeChecked();
    await expect(hexField).toBeDisabled();
    await page.emulateMedia({ forcedColors: "none" });

    await page.locator(".sidebar-tag-form .ux-color-enable-switch").click();
    await expect(colorToggle).toBeChecked();
    await expect(colorPicker).toHaveValue("#1f6f5f");
    const switchInset = () => switchKnob.evaluate((knob) => {
      const frame = knob.parentElement!.getBoundingClientRect();
      const track = knob.getBoundingClientRect();
      return Math.min(track.left - frame.left, frame.right - track.right);
    });
    expect(await switchInset()).toBeGreaterThanOrEqual(12);

    await page.setViewportSize({ width: 240, height: 900 });
    await hexField.fill("#DDDDDD");
    const focusRing = await hexField.evaluate(field => getComputedStyle(field).boxShadow);
    expect(focusRing).not.toBe("none");
    await hexField.press("Tab");
    await expect(colorPicker).toBeFocused();
    await expect(colorPicker).toHaveCSS("box-shadow", focusRing);
    expect(await switchInset()).toBeGreaterThanOrEqual(12);
    const { clientWidth, scrollWidth, scrollLeft } = await hexField.evaluate((input) => ({
      clientWidth: input.clientWidth,
      scrollWidth: input.scrollWidth,
      scrollLeft: input.scrollLeft,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    expect(scrollLeft).toBe(0);
    await hexField.fill("#336699");
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/tags/") &&
        response.request().method() === "PATCH",
    );
    await page.locator("[data-sidebar-tag-edit-form] button", { hasText: "Save" }).click();
    expect((await updateResponse).status()).toBe(200);
    await expect(page.locator("#sidebar-tag-list .sidebar-tag-badge", { hasText: "inline-tag-renamed" })).toBeVisible();
    const saved = await page.request.get(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`);
    expect(saved.ok()).toBe(true);
    expect((await saved.json()).tags).toEqual([expect.objectContaining({ name: "inline-tag-renamed", color: "#336699" })]);

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
    await closeTestApp(app);
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
    const candidateTagName = "candidate-long-tag-name-without-natural-breaks-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const candidateTagResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`, {
      data: { name: candidateTagName, color: "#1f6f5f" },
    });
    expect(candidateTagResponse.status()).toBe(201);
    const updateResponse = await page.request.patch(`${baseUrl}/api/tickets/${ticket.id}`, {
      data: {
        laneId: lane.id,
        title: ticket.title,
        bodyMarkdown: ticket.bodyMarkdown,
        priority: ticket.priority,
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
    const listRow = page.locator(".list-row", { hasText: "Long tag ticket" });
    await expectWrappedListTag(listRow, longTagName);

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await showCurrentTicket(page);
    await expect(page.locator(".ticket-meta-row .tag [aria-hidden='true']")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator(".ticket-meta-row .tag")).toHaveAttribute("title", longTagName);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip-text")).toHaveText("very-long-tag-name-withou...");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("title", `Remove tag: ${longTagName}`);
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("aria-label", `Remove tag: ${longTagName}`);
    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveCount(0);
    await page.locator("#ticket-tag-search").fill("candidate");
    await expect(page.locator("#ticket-tag-options .tag-picker-text")).toHaveText("candidate-long-tag-name-w...");
    await expect(page.locator("#ticket-tag-options .tag-picker-item[data-tag-id]")).toHaveAttribute("title", candidateTagName);
    await expect(page.locator("#ticket-tag-options .tag-picker-item[data-tag-id]")).toHaveAttribute("aria-label", candidateTagName);
  } finally {
    await page.close();
    await closeTestApp(app);
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
    const candidateTagName = "🇯🇵🇺🇸candidate-long-tag-name-without-natural-breaks-abcdefghijklmnopqrstuvwxyz";
    const candidateTagResponse = await page.request.post(`${baseUrl}/api/boards/${boardPayload.board.id}/tags`, {
      data: { name: candidateTagName, color: "#1f6f5f" },
    });
    expect(candidateTagResponse.status()).toBe(201);
    const updateResponse = await page.request.patch(`${baseUrl}/api/tickets/${ticket.id}`, {
      data: {
        laneId: lane.id,
        title: ticket.title,
        bodyMarkdown: ticket.bodyMarkdown,
        priority: ticket.priority,
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
    const listRow = page.locator(".list-row", { hasText: "Fallback long tag ticket" });
    await expectWrappedListTag(listRow, longTagName);

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await showCurrentTicket(page);
    await expect(page.locator(".ticket-meta-row .tag [aria-hidden='true']")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator(".ticket-meta-row .tag")).toHaveAttribute("title", longTagName);
    await page.locator("#header-edit-button").click();
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip-text")).toHaveText("🇯🇵🇺🇸very-long-tag-name-with...");
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("title", `Remove tag: ${longTagName}`);
    await expect(page.locator("#ticket-tag-summary .ticket-tag-chip")).toHaveAttribute("aria-label", `Remove tag: ${longTagName}`);
    await page.locator("#ticket-tag-toggle").click();
    await expect(page.locator("#ticket-tag-options .tag-picker-item")).toHaveCount(0);
    await page.locator("#ticket-tag-search").fill("candidate");
    await expect(page.locator("#ticket-tag-options .tag-picker-text")).toHaveText("🇯🇵🇺🇸candidate-long-tag-name...");
    await expect(page.locator("#ticket-tag-options .tag-picker-item[data-tag-id]")).toHaveAttribute("title", candidateTagName);
    await expect(page.locator("#ticket-tag-options .tag-picker-item[data-tag-id]")).toHaveAttribute("aria-label", candidateTagName);
  } finally {
    await page.close();
    await closeTestApp(app);
  }
});
