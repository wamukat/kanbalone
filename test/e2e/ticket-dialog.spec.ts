import { expect, test } from "@playwright/test";

import { buildApp, createDbFile, getFreePort, path } from "./helpers.js";

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
