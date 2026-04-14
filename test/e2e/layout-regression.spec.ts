import { expect, test } from "@playwright/test";

import { createBoard, createTicket, startTestApp } from "./helpers.js";

test("toolbar search aligns with active content edge in kanban and list views", async ({
  page,
}) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Layout Board",
      laneNames: ["todo", "review"],
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Layout ticket",
      priority: 2,
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".lane").first()).toBeVisible();

    const kanbanLayout = await page.evaluate(() => {
      const search = document.querySelector(".toolbar-search");
      const firstLane = document.querySelector(
        ".lane:not(.lane-create-column)",
      );
      const firstBoard = document.querySelector("#board-list .board-button");
      if (!search || !firstLane || !firstBoard) {
        throw new Error("Kanban layout fixture is missing");
      }
      return {
        searchLeft: search.getBoundingClientRect().left,
        searchTop: search.getBoundingClientRect().top,
        contentLeft: firstLane.getBoundingClientRect().left,
        sidebarTop: firstBoard.getBoundingClientRect().top,
      };
    });
    expect(
      Math.abs(kanbanLayout.searchLeft - kanbanLayout.contentLeft),
    ).toBeLessThan(2);
    expect(
      Math.abs(kanbanLayout.searchTop - kanbanLayout.sidebarTop),
    ).toBeLessThan(2);

    await page.getByRole("button", { name: "List" }).click();
    await expect(page.locator("#list-board")).toBeVisible();

    const listLayout = await page.evaluate(() => {
      const search = document.querySelector(".toolbar-search");
      const listHeader = document.querySelector(".list-header");
      const firstBoard = document.querySelector("#board-list .board-button");
      if (!search || !listHeader || !firstBoard) {
        throw new Error("List layout fixture is missing");
      }
      return {
        searchLeft: search.getBoundingClientRect().left,
        searchTop: search.getBoundingClientRect().top,
        contentLeft: listHeader.getBoundingClientRect().left,
        sidebarTop: firstBoard.getBoundingClientRect().top,
      };
    });
    expect(
      Math.abs(listLayout.searchLeft - listLayout.contentLeft),
    ).toBeLessThan(2);
    expect(Math.abs(listLayout.searchTop - listLayout.sidebarTop)).toBeLessThan(
      2,
    );
    expect(
      Math.abs(listLayout.contentLeft - kanbanLayout.contentLeft),
    ).toBeLessThan(2);

    const sidebarToggleMetrics = async () =>
      page.locator("#sidebar-toggle-button").evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return {
          centerY: rect.top + rect.height / 2,
          viewportCenterY: window.innerHeight / 2,
        };
      });
    const listSidebarToggle = await sidebarToggleMetrics();
    expect(
      Math.abs(listSidebarToggle.centerY - listSidebarToggle.viewportCenterY),
    ).toBeLessThan(1);
    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.locator("#lane-board")).toBeVisible();
    const kanbanSidebarToggle = await sidebarToggleMetrics();
    expect(
      Math.abs(
        kanbanSidebarToggle.centerY - kanbanSidebarToggle.viewportCenterY,
      ),
    ).toBeLessThan(1);
    expect(
      Math.abs(kanbanSidebarToggle.centerY - listSidebarToggle.centerY),
    ).toBeLessThan(1);
  } finally {
    await close();
  }
});

test("sidebar toggle stays usable on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Narrow Layout",
      laneNames: ["todo"],
    });
    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator("#sidebar-toggle-button")).toBeVisible();

    const toggleBox = await page
      .locator("#sidebar-toggle-button")
      .evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          viewportWidth: window.innerWidth,
        };
      });

    expect(toggleBox.top).toBeGreaterThanOrEqual(15);
    expect(toggleBox.top).toBeLessThan(18);
    expect(toggleBox.right).toBeLessThanOrEqual(toggleBox.viewportWidth - 15);
  } finally {
    await close();
  }
});

test("editor form focus and detail header badges use the shared visual language", async ({
  page,
}) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Editor Visuals",
      laneNames: ["todo"],
    });
    const ticket = await createTicket(
      page.request,
      baseUrl,
      boardPayload.board.id,
      {
        laneId: boardPayload.lanes[0].id,
        title: "Resolved archived visual ticket",
        priority: 3,
        isResolved: true,
        isArchived: true,
      },
    );

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.locator(".add-ticket-button").first().click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);

    const focusStyles: Array<{
      borderColor: string;
      boxShadow: string;
      outlineStyle: string;
    }> = [];
    for (const selector of [
      "#ticket-title",
      "#ticket-body",
      "#ticket-lane",
      "#ticket-priority",
    ]) {
      await page.locator(selector).focus();
      focusStyles.push(
        await page.locator(selector).evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            borderColor: styles.borderColor,
            boxShadow: styles.boxShadow,
            outlineStyle: styles.outlineStyle,
          };
        }),
      );
    }

    const [titleFocus, ...otherFocusStyles] = focusStyles;
    expect(titleFocus.boxShadow).not.toBe("none");
    expect(titleFocus.outlineStyle).toBe("none");
    for (const styles of otherFocusStyles) {
      expect(styles.borderColor).toBe(titleFocus.borderColor);
      expect(styles.boxShadow).toBe(titleFocus.boxShadow);
      expect(styles.outlineStyle).toBe(titleFocus.outlineStyle);
    }

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await expect(page.locator("#editor-header-id")).toHaveText(`#${ticket.id}`);
    await expect(
      page.locator("#editor-header-state .ticket-state-pill"),
    ).toHaveText(["Resolved", "Archived"]);
    await expect(
      page.locator(
        "#editor-header-state .ticket-state-pill-resolved use[href='/icons.svg#check']",
      ),
    ).toHaveCount(1);
    await expect(
      page.locator(
        "#editor-header-state .ticket-state-pill-archived use[href='/icons.svg#archive']",
      ),
    ).toHaveCount(1);
    await expect(
      page.locator("#editor-header-priority .ticket-priority-badge"),
    ).toHaveText("High");
    await expect(
      page.locator("#editor-header-priority .ticket-priority-badge"),
    ).toHaveClass(/ticket-priority-high/);
  } finally {
    await close();
  }
});

test("dark mode keeps key controls legible", async ({ browser }) => {
  const page = await browser.newPage({
    colorScheme: "dark",
    viewport: { width: 1280, height: 900 },
  });
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Dark Layout",
      laneNames: ["todo"],
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Dark ticket",
      priority: 2,
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".toolbar-search")).toBeVisible();
    await expect(page.locator("#priority-filter")).toBeVisible();

    const darkControlStyles = await page.evaluate(() => {
      const search = document.querySelector(".toolbar-search");
      const filter = document.querySelector("#priority-filter");
      const card = document.querySelector(".ticket-card");
      if (!search || !filter || !card) {
        throw new Error("Dark mode fixture is missing");
      }
      function parseColor(value: string): number[] {
        const srgb = value.match(/color\(srgb ([0-9.]+) ([0-9.]+) ([0-9.]+)/);
        if (srgb) {
          return srgb
            .slice(1, 4)
            .map((channel: string) => Number(channel) * 255);
        }
        const rgb = value.match(/rgba?\((\d+), (\d+), (\d+)/);
        if (rgb) {
          return rgb.slice(1, 4).map(Number);
        }
        return [0, 0, 0];
      }

      function luminance(value: string): number {
        return parseColor(value)
          .map((channel: number) => {
            const normalized = channel / 255;
            return normalized <= 0.03928
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          })
          .reduce(
            (sum, channel, index) =>
              sum + channel * [0.2126, 0.7152, 0.0722][index],
            0,
          );
      }

      function contrastRatio(foreground: string, background: string): number {
        const lighter = Math.max(luminance(foreground), luminance(background));
        const darker = Math.min(luminance(foreground), luminance(background));
        return (lighter + 0.05) / (darker + 0.05);
      }

      return [search, filter, card].map((element) => {
        const styles = getComputedStyle(element);
        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          borderColor: styles.borderColor,
          contrastRatio: contrastRatio(styles.color, styles.backgroundColor),
        };
      });
    });

    for (const styles of darkControlStyles) {
      expect(styles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(styles.borderColor).not.toBe("rgba(0, 0, 0, 0)");
      expect(styles.contrastRatio).toBeGreaterThan(3);
    }
  } finally {
    await close();
  }
});
