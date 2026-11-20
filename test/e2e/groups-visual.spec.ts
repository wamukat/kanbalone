import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createBoard, createTicket, startTestApp } from "./helpers.js";

async function groupFixture(page: Page, baseUrl: string, descriptionMarkdown = "") {
  const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Visual checks", laneNames: ["Todo"] });
  const response = await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, {
    data: { name: "A focused piece of work", descriptionMarkdown },
  });
  expect(response.status()).toBe(201);
  const group = await response.json();
  const parent = await createTicket(page.request, baseUrl, board.id, {
    laneId: lanes[0].id, title: "Read the work before choosing an action", groupId: group.id,
  });
  await createTicket(page.request, baseUrl, board.id, {
    laneId: lanes[0].id, title: "A related child ticket", parentTicketId: parent.id,
  });
  return { board, group, parent };
}

test("Group keeps the List alignment and shows both ticket actions at the top left", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await groupFixture(page, baseUrl);
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await expect(page.locator(".list-ticket-link").first()).toBeVisible();
    const origin = await page.locator("#list-board").boundingBox();
    const listTitle = await page.locator(".list-ticket-link").first().evaluate(e => {
      const style = getComputedStyle(e);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight };
    });
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await expect(page.locator(".group-name")).toBeVisible();
    const panel = await page.locator(".group-list-panel").boundingBox();
    expect(Math.abs(panel!.x - origin!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(panel!.y - origin!.y)).toBeLessThanOrEqual(2);
    const title = page.locator("[data-group-ticket]").first();
    const groupTitle = await title.evaluate(e => {
      const style = getComputedStyle(e);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight, border: style.borderTopWidth, background: style.backgroundColor };
    });
    expect(groupTitle.fontSize).toBe(listTitle.fontSize);
    expect(groupTitle.fontWeight).toBe(listTitle.fontWeight);
    expect(groupTitle.border).toBe("0px");
    expect(groupTitle.background).toBe("rgba(0, 0, 0, 0)");
    await expect(page.locator(".group-detail-heading .group-ticket-count")).toHaveText("2 open · 2 total");
    await expect(page.locator(".group-ticket-toolbar .group-ticket-count")).toHaveCount(0);
    const lanePositions = await page.locator(".group-ticket-meta").evaluateAll(es => es.map(e => e.getBoundingClientRect().left));
    expect(Math.max(...lanePositions) - Math.min(...lanePositions)).toBeLessThanOrEqual(1);
    await expect(page.locator("[data-group-remove] use")).toHaveAttribute("href", /#trash-2$/);
    const add = page.getByRole("button", { name: "Add existing tickets", exact: true });
    const create = page.getByRole("button", { name: "Create ticket", exact: true });
    await expect(add).toBeVisible();
    await expect(create).toBeVisible();
    const rowBeforeHover = await title.boundingBox();
    const addBeforeHover = await add.boundingBox();
    await add.hover();
    expect(await add.boundingBox()).toEqual(addBeforeHover);
    expect(await title.boundingBox()).toEqual(rowBeforeHover);
    await create.focus();
    expect(await title.boundingBox()).toEqual(rowBeforeHover);
    const toolbar = await page.locator(".group-ticket-toolbar").boundingBox();
    expect((await add.boundingBox())!.x).toBeCloseTo(toolbar!.x, 1);
    await add.click();
    await expect(page.locator("#group-ticket-search")).toBeFocused();
    await page.locator("#group-ticket-search").fill("draft search");
    await add.click();
    await expect(page.locator("#group-ticket-search")).toHaveValue("draft search");
    await expect(page.locator("#group-ticket-search")).toBeFocused();
    await page.locator('[data-group-action="cancel-add"]').click();
    await expect(add).toBeFocused();
    await expect(create).toBeVisible();
    await expect(page.locator("[data-group-remove]")).toHaveCount(1);
    await expect(page.locator("[data-group-remove]")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await expect.poll(async () => (await page.locator("#group-board").boundingBox())?.width ?? 0).toBeGreaterThan(300);
    const mobileLanes = await page.locator(".group-ticket-meta").evaluateAll(es => es.map(e => e.getBoundingClientRect().left));
    expect(Math.max(...mobileLanes) - Math.min(...mobileLanes)).toBeLessThanOrEqual(1);
    expect(await page.locator(".group-ticket-meta").first().evaluate(e => e.getBoundingClientRect().width)).toBe(72);
    await expect(add).toBeVisible();
    await expect(create).toBeVisible();
    const mobileToolbar = await page.locator(".group-ticket-toolbar").boundingBox();
    expect((await add.boundingBox())!.x).toBeCloseTo(mobileToolbar!.x, 1);

  } finally { await close(); }
});

test("long Group descriptions stay compact until expanded and never hide focusable links in a clipped preview", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const description = `## Scope\n\n${"A small group should keep the actual tickets easy to scan. ".repeat(12)}\n\n## Details\n\n[Full reference](https://example.com/reference)\n\n| Name | Value |\n| --- | --- |\n| ${"long".repeat(80)} | detail |`;
    const { board } = await groupFixture(page, baseUrl, description);
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    const toggle = page.getByRole("button", { name: "Read more", exact: true });
    await expect(toggle).toBeVisible();
    await expect(page.locator(".group-description a")).toHaveCount(0);
    const summary = page.locator(".group-description-summary");
    await expect(summary).toBeVisible();
    expect(await summary.evaluate(e => e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))).toBeLessThanOrEqual(3.1);
    await toggle.click();
    const reference = page.getByRole("link", { name: "Full reference", exact: true });
    await expect(reference).toBeVisible();
    await reference.focus();
    await expect(reference).toBeFocused();
    const sizes = await page.evaluate(() => ({
      title: parseFloat(getComputedStyle(document.querySelector(".group-name")!).fontSize),
      description: [...document.querySelectorAll(".group-description h1,.group-description h2,.group-description h3")].map(e => parseFloat(getComputedStyle(e).fontSize)),
    }));
    expect(Math.max(...sizes.description)).toBeLessThan(sizes.title);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
    await page.getByRole("button", { name: "Show less", exact: true }).click();
    await expect(reference).toHaveCount(0);
    await expect(toggle).toBeVisible();
  } finally { await close(); }
});

test("Group controls and long content stay reachable in narrow dark mode", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, group } = await groupFixture(page, baseUrl, "# Details\n\n" + "Long content ".repeat(70));
    await page.request.patch(`${baseUrl}/api/groups/${group.id}`, { data: { name: "A_very_long_unbroken_group_name_that_should_not_break_the_screen", expectedRevision: group.revision } });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    await expect(page.locator(".group-name")).toBeVisible();
    const title = page.locator("[data-group-ticket]").last();
    await title.scrollIntoViewIfNeeded();
    await expect(title).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Add existing tickets", exact: true }).click();
    const search = page.getByRole("combobox", { name: "Find unassigned tickets" });
    await expect(search).toBeFocused();
    await search.fill("does not exist");
    await expect(page.getByText("No unassigned tickets match.", { exact: true })).toBeVisible();
    const colors = await search.evaluate(e => {
      const s = getComputedStyle(e);
      return { text: s.color, background: s.backgroundColor, outline: s.outlineStyle, shadow: s.boxShadow };
    });
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => {
        const normalized = v / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const textLight = luminance(colors.text), backgroundLight = luminance(colors.background);
    expect((Math.max(textLight, backgroundLight) + 0.05) / (Math.min(textLight, backgroundLight) + 0.05)).toBeGreaterThanOrEqual(4.5);
    expect(colors.outline !== "none" || colors.shadow !== "none").toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally { await close(); }
});

test("Group list sort shows direction while tickets keep their default order", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Sort", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Work" } })).json();
    const a = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "First", groupId: group.id, priority: 1 });
    const b = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Second", groupId: group.id, priority: 3 });
    const child = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Child", parentTicketId: a.id });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    const ids = () => page.locator("[data-group-ticket]").evaluateAll(es => es.map(e => Number((e as HTMLElement).dataset.groupTicket)));
    await expect.poll(ids).toEqual([b.id, a.id, child.id]);
    await expect(page.locator('[data-group-sort-scope="tickets"]')).toHaveCount(0);
    const nameSort = page.locator("#group-sort-groups-name");
    await nameSort.click();
    await expect(nameSort).toHaveAttribute("aria-label", "Name, sorted ascending");
    await expect(nameSort.locator("use").last()).toHaveAttribute("href", /#arrow-up$/);
    await nameSort.press("Enter");
    await expect(nameSort).toHaveAttribute("aria-label", "Name, sorted descending");
    await expect(nameSort.locator("use").last()).toHaveAttribute("href", /#arrow-down$/);
    await expect.poll(ids).toEqual([b.id, a.id, child.id]);
  } finally { await close(); }
});

test("Group header preserves view context without inheriting ticket filters", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board } = await groupFixture(page, baseUrl);
    await page.goto(`${baseUrl}/boards/${board.id}/list`);
    await expect(page.locator(".list-ticket-link").first()).toBeVisible();
    const listY = (await page.locator("#list-board").boundingBox())!.y;
    await page.locator("#search-input").fill("No match for this query");
    await expect(page.locator(".list-ticket-link")).toHaveCount(0);
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await expect(page.locator("#board-title")).toHaveText(board.name);
    await expect(page.locator("#board-title")).toBeVisible();
    await expect(page.locator(".group-view-label")).toBeVisible();
    await expect(page.locator("#search-input")).not.toBeVisible();
    await expect(page.locator("[data-group-ticket]")).toHaveCount(2);
    expect(Math.abs((await page.locator("#group-board").boundingBox())!.y - listY)).toBeLessThanOrEqual(2);
    await page.getByRole("button", { name: "Kanban", exact: true }).click();
    await expect(page.locator("#search-input")).toBeVisible();
    await expect(page.locator("#search-input")).toHaveValue("No match for this query");
    await expect(page.locator(".group-view-label")).not.toBeVisible();
    await page.locator("#search-input").fill("");
    await expect(page.locator(".lane").first()).toBeVisible();
    expect(Math.abs((await page.locator("#lane-board").boundingBox())!.y - listY)).toBeLessThanOrEqual(2);
    await page.getByRole("button", { name: "Group", exact: true }).click();
    await expect(page.locator(".group-view-label")).toBeVisible();
    await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
    await expect(page.locator("#board-title")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open sidebar", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("#group-board")).toBeVisible();
    await expect(page.locator(".group-view-label")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  } finally { await close(); }
});

test("archived parent row keeps its size and text layout when toggled", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, { name: "Archived parent", laneNames: ["Todo"] });
    const group = await (await page.request.post(`${baseUrl}/api/boards/${board.id}/groups`, { data: { name: "Work" } })).json();
    const parent = await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "初回の案内を整える・長いチケット名でも配置を保つ".repeat(3), groupId: group.id, isArchived: true });
    await createTicket(page.request, baseUrl, board.id, { laneId: lanes[0].id, title: "Active child", parentTicketId: parent.id });
    await page.goto(`${baseUrl}/boards/${board.id}/group`);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const metrics = () => page.locator(".group-ticket-row").first().evaluate(row => {
        const title = row.querySelector(".group-ticket-title")!;
        const style = getComputedStyle(title);
        return { height: row.getBoundingClientRect().height, width: row.getBoundingClientRect().width,
          titleHeight: title.getBoundingClientRect().height, fontSize: style.fontSize,
          fontWeight: style.fontWeight, lineHeight: style.lineHeight,
          label: title.textContent };
      });
      const archiveIcon = page.locator(".group-ticket-row").first().locator(".ticket-status-icon-archived");
      await expect(archiveIcon).toHaveAttribute("aria-label", "Archived");
      await expect(archiveIcon.locator("use")).toHaveAttribute("href", /#archive$/);
      const before = await metrics();
      await page.locator(".group-archive-toggle").click();
      await expect(page.locator(`[data-group-ticket="${parent.id}"]`)).toBeVisible();
      expect(await metrics()).toEqual(before);
      await page.locator(".group-archive-toggle").click();
      expect(await metrics()).toEqual(before);
    }
  } finally { await close(); }
});
