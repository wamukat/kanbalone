import { expect, test } from "@playwright/test";
import { startTestApp, updateTicket } from "./helpers.js";

test("List measures complex rows without clipping and preserves a deep anchor", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.setViewportSize({ width: 1024, height: 768 });
    const tags = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1, name: `復元後の添付ファイル確認項目 ${index + 1}`, color: "#276b59",
    }));
    const haystack = "復元資料を確認担当者に渡す前に、チケットと画像をそれぞれ照合する。";
    const records = Array.from({ length: 180 }, (_, index) => {
      const n = index + 1;
      return {
        id: n, laneId: n === 2 ? 2 : 1, position: n,
        title: [1, 2, 87].includes(n) ? `Review ${n} ${haystack.repeat(3)}` : `Review ${n}`,
        bodyMarkdown: "", priority: 2, isResolved: n === 2, isArchived: false, parentTicketId: null, groupId: null,
        tags: [1, 2, 87].includes(n) ? tags : [], comments: [], blockerIds: [],
      };
    });
    const imported = await page.request.post(`${baseUrl}/api/boards/import`, { data: {
      formatVersion: 2, board: { name: "Readable rows" }, tags, groups: [],
      lanes: [{ id: 1, name: "Work", position: 0, isCompletionLane: false },
        { id: 2, name: "Done", position: 1, isCompletionLane: true }],
      tickets: records,
    } });
    expect(imported.status(), await imported.text()).toBe(201);
    const fixture = await imported.json();
    const matching: Array<{ title: string; id: number }> =
      (await (await page.request.get(`${baseUrl}/api/boards/${fixture.board.id}/tickets`)).json()).tickets;
    const ids = Object.fromEntries(matching.map(ticket => [ticket.title.split(" ")[1], ticket.id] as const));
    const row = (ordinal: number) => page.locator(`.list-row[data-list-row-ticket-id="${ids[ordinal]}"]`);
    const viewport = page.locator(".list-viewport");
    await page.goto(`${baseUrl}/boards/${fixture.board.id}/list`);
    await expect(page.getByRole("table", { name: "Ticket list" })).toHaveAttribute("aria-rowcount", "181");
    await expect(page.getByRole("checkbox", { name: "Select all matching tickets" })).toBeVisible();
    await expect(page.locator(".list-result-count")).toHaveText("180 tickets");
    for (const ordinal of [1, 2]) {
      const element = row(ordinal);
      await expect(element.locator(".tag")).toHaveCount(8);
      await expect(element.locator(".tag").last()).toContainText(tags.at(-1)!.name);
      const geometry = await element.evaluate(item => {
        const bounds = item.getBoundingClientRect();
        const terms = [...item.querySelectorAll(".list-ticket-title, .list-tag-row .tag")];
        return { height: bounds.height, contained: terms.every(term => {
          const rect = term.getBoundingClientRect();
          return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1 &&
            rect.right <= bounds.right + 1 && term.scrollWidth <= term.clientWidth + 1;
        }) };
      });
      expect(geometry.height).toBeGreaterThan(64);
      expect(geometry.contained).toBe(true);
    }

    const deep = row(87);
    await viewport.evaluate(element => { element.scrollTop = 86 * 64; });
    await expect(deep).toBeAttached();
    await deep.evaluate(element => {
      const root = element.closest(".list-viewport")!;
      root.scrollTop += element.getBoundingClientRect().top - root.getBoundingClientRect().top + 105;
    });
    const top = () => deep.evaluate(element =>
      element.getBoundingClientRect().top - element.closest(".list-viewport")!.getBoundingClientRect().top);
    await expect.poll(top).toBeLessThan(-100);
    const before = await top();
    const replacement = `Review 87 改訂 ${haystack.repeat(4)}`;
    await updateTicket(page.request, baseUrl, ids[87], { title: replacement });
    await expect(deep.locator(".list-ticket-title")).toHaveText(replacement);
    await expect.poll(async () => Math.abs((await top()) - before)).toBeLessThan(2);

    const checkbox = deep.getByRole("checkbox", { name: `Select ticket #${ids[87]} ${replacement}` });
    await checkbox.check();
    await expect(checkbox).toBeFocused();
    await expect(page.locator(".list-selection-count").first()).toHaveText("1 selected");
    await page.setViewportSize({ width: 1180, height: 768 });
    await expect(checkbox).toBeFocused();
    await expect(checkbox).toBeChecked();
    const visibleCount = () => page.locator(".list-window .list-row").count();
    expect(await visibleCount()).toBeLessThan(50);

    await viewport.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(row(180)).toBeAttached();
    await expect.poll(() => viewport.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2);
    expect(await visibleCount()).toBeLessThan(50);
    const kept = await page.request.get(`${baseUrl}/api/tickets/${ids[87]}`);
    expect((await kept.json()).title).toBe(replacement);
  } finally {
    await close();
  }
});
