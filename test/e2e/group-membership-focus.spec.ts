import { test, expect, type Page } from "@playwright/test";
import { startTestApp, createBoard, createTicket } from "./helpers.js";

async function keyboardActivate(page: Page, selector: string) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  await expect(target).toBeEnabled();
  for (let i = 0; i < 100; i++) {
    if (await target.evaluate(el => el === document.activeElement)) {
      await page.keyboard.press("Enter");
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard target unreachable: ${selector}`);
}

for (const locale of ["ja-JP", "en-US"]) {
  test(`Group membership keeps a visible focus after success and cancellation (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    const { baseUrl, close } = await startTestApp(page);
    try {
      const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Group focus", laneNames: ["Todo"] });
      const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Focus group" } })).json();
      const parent = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Parent" });
      const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Child", parentTicketId: parent.id });
      const peer = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Child peer" });
      await page.goto(`${baseUrl}/boards/${board.id}/group`);
      const add = page.locator('[data-group-action="add"]');
      await keyboardActivate(page, '[data-group-action="add"]');
      const input = page.locator("#group-ticket-search");
      const childOption = page.locator(`#group-option-${child.id}`);
      const peerOption = page.locator(`#group-option-${peer.id}`);
      await expect(input).toBeFocused();
      await page.keyboard.type("Child");
      await expect(childOption).toHaveAttribute("aria-selected", "true");
      await expect(peerOption).toHaveAttribute("aria-selected", "false");
      const renderedChild = await childOption.elementHandle();
      await page.keyboard.press("ArrowUp");
      await expect(input).toHaveAttribute("aria-activedescendant", `group-option-${peer.id}`);
      await expect(peerOption).toHaveAttribute("aria-selected", "true");
      await page.keyboard.press("ArrowDown");
      await expect(input).toHaveAttribute("aria-activedescendant", `group-option-${child.id}`);
      await expect(childOption).toHaveAttribute("aria-selected", "true");
      expect(await renderedChild.evaluate(element => element.isConnected)).toBe(true);
      await page.keyboard.press("Escape");
      await expect(input).toBeFocused();
      await expect(input).toHaveAttribute("aria-expanded", "false");
      expect(await input.getAttribute("aria-activedescendant")).toBeNull();
      await page.keyboard.type("Child");
      await page.keyboard.press("Enter");
      await keyboardActivate(page, '[data-group-action="cancel-add"]');
      await expect(add).toBeFocused();
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${child.id}`)).json()).groupId).toBeNull();
      await keyboardActivate(page, '[data-group-action="add"]');
      await expect(page.locator('#group-ticket-search')).toBeFocused();
      await page.keyboard.type("Child");
      await expect(page.locator(`[data-group-pick="${child.id}"]`)).toBeVisible();
      await page.keyboard.press("Enter");
      await keyboardActivate(page, '[data-group-form="members"] button[type="submit"]');
      await expect(page.locator('[data-group-remove]')).toHaveCount(1);
      await expect(add).toBeFocused();
      await keyboardActivate(page, '[data-group-remove]');
      await keyboardActivate(page, '#ux-cancel-button');
      await expect(page.locator('[data-group-remove]')).toBeFocused();
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${child.id}`)).json()).groupId).toBe(group.id);
      expect((await (await page.request.get(`${baseUrl}/api/tickets/${peer.id}`)).json()).groupId).toBeNull();
      await keyboardActivate(page, '[data-group-remove]');
      await keyboardActivate(page, '#ux-submit-button');
      await expect(page.locator('[data-group-remove]')).toHaveCount(0);
      await expect(add).toBeFocused();
      for (const id of [parent.id, child.id]) {
        const saved = await (await page.request.get(`${baseUrl}/api/tickets/${id}`)).json();
        expect(saved.groupId).toBeNull();
        expect(saved.parentTicketId).toBe(id === child.id ? parent.id : null);
      }
    } finally { await close(); await context.close(); }
  });
}
