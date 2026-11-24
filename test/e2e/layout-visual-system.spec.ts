import { expect, test } from "@playwright/test";

import {
  createBoard,
  createTag,
  createTicket,
  startTestApp,
} from "./helpers.js";

test("core typography follows the design system scale", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Typography Board",
      laneNames: ["todo"],
    });
    const tag = await createTag(page.request, baseUrl, boardPayload.board.id, {
      name: "design",
      color: "#1f6f5f",
    });
    await createTicket(page.request, baseUrl, boardPayload.board.id, {
      laneId: boardPayload.lanes[0].id,
      title: "Typography ticket",
      priority: 2,
      tagIds: [tag.id],
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await expect(page.locator(".ticket-card")).toBeVisible();
    await expect(page.locator(".ticket-card .ticket-link")).toBeVisible();

    const typography = await page.evaluate(() => {
      const selectors = {
        html: "html",
        body: "body",
        search: ".toolbar-search input",
        filter: ".filter-menu-toggle",
        laneTitle: ".lane-title",
        laneCount: ".lane-count",
        cardTitle: ".ticket-link",
        cardId: ".ticket-card .ticket-id",
        tag: ".ticket-card .tag",
        button: "button",
        icon: ".icon",
      };

      return Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => {
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`Missing typography fixture: ${selector}`);
          }
          const styles = getComputedStyle(element);
          return [
            key,
            {
              fontSize: styles.fontSize,
              fontWeight: styles.fontWeight,
              lineHeight: styles.lineHeight,
              width: styles.width,
              height: styles.height,
            },
          ];
        }),
      );
    });

    expect(typography.html.fontSize).toBe("14px");
    expect(typography.body.fontSize).toBe("14px");
    expect(typography.body.fontWeight).toBe("400");
    expect(typography.search.fontSize).toBe("14px");
    expect(typography.button.fontSize).toBe("14px");
    expect(typography.button.fontWeight).toBe("500");
    expect(typography.filter.fontSize).toBe("14px");
    expect(typography.laneTitle.fontSize).toBe("14px");
    expect(typography.laneTitle.fontWeight).toBe("600");
    expect(typography.cardTitle.fontSize).toBe("14px");
    expect(typography.cardTitle.fontWeight).toBe("600");
    expect(typography.laneCount.fontSize).toBe("11px");
    expect(typography.cardId.fontSize).toBe("11px");
    expect(typography.tag.fontSize).toBe("12px");
    expect(typography.icon.width).toBe("16px");
    expect(typography.icon.height).toBe("16px");
  } finally {
    await close();
  }
});

test("toast uses the shared elevated surface shape", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);

  try {
    const boardPayload = await createBoard(page.request, baseUrl, {
      name: "Toast Visuals",
      laneNames: ["todo"],
    });

    await page.goto(`${baseUrl}/boards/${boardPayload.board.id}`);
    await page.locator(".add-ticket-button").first().click();
    await expect(page.locator("#editor-dialog")).toHaveJSProperty("open", true);
    await page.locator("#ticket-title").fill("Toast visual ticket");
    await page.locator("#save-ticket-button").click();
    await expect(page.locator("#toast")).toHaveText("Ticket created");

    const toastStyles = await page.locator("#toast").evaluate((toast) => {
      const styles = getComputedStyle(toast);
      return {
        borderRadius: styles.borderRadius,
        boxShadow: styles.boxShadow,
      };
    });

    expect(toastStyles.borderRadius).toBe("8px");
    expect(toastStyles.boxShadow).not.toBe("none");
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
    await page.request.patch(`${baseUrl}/api/lanes/${boardPayload.lanes[0].id}`, { data: { isCompletionLane: true } });
    const ticket = await createTicket(
      page.request,
      baseUrl,
      boardPayload.board.id,
      {
        laneId: boardPayload.lanes[0].id,
        title: "Resolved archived visual ticket",
        priority: 3,
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
      page.locator("#editor-header-state .ticket-state-pill > span"),
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

    const detailTitleOffset = await page.evaluate(() => {
      const dialog = document.querySelector("#editor-dialog");
      const title = document.querySelector("#editor-header-title");
      if (!dialog || !title) {
        throw new Error("Ticket detail title fixture is missing");
      }
      return (
        title.getBoundingClientRect().top -
        dialog.getBoundingClientRect().top
      );
    });
    expect(detailTitleOffset).toBeGreaterThanOrEqual(31);

    await page.locator("#header-edit-button").click();
    await expect(page.locator("#editor-form")).toBeVisible();
    const editTitleOffset = await page.evaluate(() => {
      const dialog = document.querySelector("#editor-dialog");
      const title = document.querySelector("#ticket-title");
      if (!dialog || !title) {
        throw new Error("Ticket editor title fixture is missing");
      }
      return (
        title.getBoundingClientRect().top -
        dialog.getBoundingClientRect().top
      );
    });
    expect(Math.abs(editTitleOffset - detailTitleOffset)).toBeLessThanOrEqual(
      8,
    );
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
    await expect(page.locator(".ticket-card")).toBeVisible();

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

test("ticket activity uses the dark theme foreground and keeps timestamps muted", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    await page.emulateMedia({ colorScheme: "dark" });
    const { board, lanes } = await createBoard(page.request, baseUrl, {
      name: "Activity contrast board",
      laneNames: ["Todo"],
    });
    const ticket = await createTicket(page.request, baseUrl, board.id, {
      laneId: lanes[0].id,
      title: "Activity contrast ticket",
    });

    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    await page.getByRole("tab", { name: "Activity" }).click();
    const activity = page.locator("#ticket-activity .activity-item").first();
    await expect(activity.locator(".activity-message")).toBeVisible();
    const foreground = await page.locator("body").evaluate(body => getComputedStyle(body).color);
    await expect(activity.locator(".activity-message")).toHaveCSS("color", foreground);
    await expect(activity.locator(".activity-meta")).not.toHaveCSS("color", foreground);
  } finally {
    await close();
  }
});

test("ticket Markdown links use theme colors and expose keyboard focus", async ({ page }) => {
  const { baseUrl, close } = await startTestApp(page);
  try {
    const { board, lanes } = await createBoard(page.request, baseUrl, {
      name: "Ticket Markdown links",
      laneNames: ["Todo"],
    });
    const target = await createTicket(page.request, baseUrl, board.id, {
      laneId: lanes[0].id,
      title: "Linked ticket",
    });
    const href = "https://example.com/reference";
    const ticket = await createTicket(page.request, baseUrl, board.id, {
      laneId: lanes[0].id,
      title: "Ticket with Markdown links",
      bodyMarkdown: `[External reference](${href}) and #${target.id}`,
    });
    await page.goto(`${baseUrl}/tickets/${ticket.id}`);
    const body = page.locator("#ticket-view-body");
    const external = body.getByRole("link", { name: "External reference" });
    const internal = body.getByRole("link", { name: `#${target.id}`, exact: true });
    await expect(external).toHaveAttribute("href", href);
    await expect(internal).toHaveAttribute("href", `/tickets/${target.id}`);

    for (const [colorScheme, accent, hover] of [
      ["light", "rgb(31, 111, 95)", "rgb(24, 89, 77)"],
      ["dark", "rgb(84, 184, 159)", "rgb(113, 201, 180)"],
    ] as const) {
      await page.emulateMedia({ colorScheme });
      await page.locator("#editor-header-title").hover();
      await expect(external).toHaveCSS("color", accent);
      await expect(external).toHaveCSS("text-decoration-line", "underline");
      await expect(internal).toHaveCSS("color", accent);
      await external.hover();
      await expect(external).toHaveCSS("color", hover);
      await external.press("Tab");
      await expect(internal).toBeFocused();
      await expect(internal).toHaveCSS("outline-style", "solid");
      await expect(internal).toHaveCSS("outline-color", accent);
    }

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`${baseUrl}/tickets/${target.id}`);
    await expect(page.locator("#editor-header-title")).toContainText("Linked ticket");
  } finally {
    await close();
  }
});
