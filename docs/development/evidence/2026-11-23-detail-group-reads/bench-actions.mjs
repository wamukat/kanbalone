import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const output = resolve(root, "coverage/subsecond-data");
const baseline = process.argv[2] ? resolve(process.argv[2]) : null;
const phases = baseline ? [["baseline", baseline], ["candidate", root]] : [["baseline", root]];
const tests = process.env.SUBSECOND_SCENARIOS?.split(",") ?? ["deep-link", "back", "open-group", "comment-save"];
const repeats = Number(process.env.SUBSECOND_SAMPLES ?? 4);
const japanese = process.env.SUBSECOND_LOCALE === "ja";
const captureOnly = process.env.SUBSECOND_CAPTURE_ONLY === "1";
const boardIds = process.env.SUBSECOND_BOARDS?.split(",").map(Number) ?? [1, 2];
const variant = japanese ? "ja-dark-390x844" : "en-light-1440x900";
const label = process.env.SUBSECOND_LABEL ?? variant;
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-subsecond-ui-"));
const browser = await chromium.launch();
const appInstances = new Map();
const records = [];

async function launch(phase, source) {
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const dbFile = resolve(work, `${phase}.sqlite`);
  await copyFile(resolve(output, "fixture.sqlite"), dbFile);
  const app = buildApp({ dbFile, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return { app, url };
}

async function verifyAction(phase, boardId, scenario, run) {
  const { url } = appInstances.get(phase);
  const context = await browser.newContext(japanese
    ? { viewport: { width: 390, height: 844 }, locale: "ja-JP", colorScheme: "dark" }
    : { viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light" });
  await context.addInitScript(id => {
    localStorage.setItem("kanbalone:ui-preferences", JSON.stringify({
      version: 1, activeBoardId: id, boards: { [id]: { viewMode: "list" } },
    }));
    window.__clickAt = null;
    document.addEventListener("click", () => { window.__clickAt = performance.now(); }, true);
  }, boardId);
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  const byRequest = new Map();
  let lastRequestFinishMs = 0;
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const parsed = new URL(request.url());
    if (!parsed.pathname.startsWith("/api/") || request.resourceType() === "eventsource") return;
    const record = { path: parsed.pathname, query: parsed.search, method: request.method(), startedAt: performance.now() };
    byRequest.set(request, record);
    requests.push(record);
  });
  page.on("requestfinished", request => {
    const record = byRequest.get(request);
    if (record) {
      record.finishedAt = performance.now();
      lastRequestFinishMs = record.finishedAt;
    }
  });
  page.on("requestfailed", request => {
    const record = byRequest.get(request);
    if (record) {
      record.failure = request.failure()?.errorText;
      record.finishedAt = performance.now();
      lastRequestFinishMs = record.finishedAt;
    }
  });

  const list = `${url}/boards/${boardId}/list`;
  const dialog = page.locator("#editor-dialog[open]");
  const ticketSelector = ".list-ticket-link";
  const groupRows = boardId === 1 ? 999 : 9999;
  let ticketId = boardId === 1 ? 2 : 1002;
  let start;
  let sliceFrom = 0;
  let body;
  const images = [];
  async function capture(state) {
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const path = resolve(output, `${scenario}-${boardId}-${variant}-${phase}-${state}.png`);
    await page.screenshot({ path });
    images.push(path);
  }
  try {
    if (scenario === "deep-link") {
      start = performance.now();
      await page.goto(`${url}/tickets/${ticketId}`, { waitUntil: "domcontentloaded" });
      await dialog.waitFor({ state: "visible" });
    } else {
      await page.goto(list, { waitUntil: "domcontentloaded" });
      await page.locator(ticketSelector).first().waitFor();
      const openButton = page.locator(ticketSelector).first();
      ticketId = Number(await openButton.getAttribute("data-open-ticket-id"));
      await openButton.click();
      await dialog.waitFor({ state: "visible" });
      if (scenario === "comment-save") {
        await page.locator("#comment-compose-toggle").click();
        body = `Synthetic timing comment ${run}`;
        await page.locator("#comment-body").fill(body);
      }
      await page.waitForLoadState("networkidle");
      if (run === repeats - 1) await capture("before-action");
      sliceFrom = requests.length;
      start = performance.now();
      switch (scenario) {
        case "back":
          await page.evaluate(() => { window.__clickAt = performance.now(); window.history.back(); });
          await dialog.waitFor({ state: "hidden" });
          await page.locator(ticketSelector).first().waitFor();
          break;
        case "open-group":
          await page.locator("[data-ticket-group]").click();
          await page.waitForFunction(() => document.querySelector(".group-ticket-row"));
          break;
        case "comment-save":
          await page.locator("#save-comment-button").click();
          if (captureOnly) {
            await page.locator("#ticket-comments").getByText(body).waitFor();
            await page.waitForLoadState("networkidle");
          } else await page.waitForFunction(() => document.querySelector("#comment-save-state")?.textContent === "Comment saved");
          break;
        default:
          throw new Error(`Unknown scenario ${scenario}`);
      }
    }

    const pageTiming = await page.evaluate(async scenario => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rows = document.querySelectorAll(".group-ticket-row").length;
      const actionStart = scenario === "deep-link" ? 0 : window.__clickAt;
      return { rows, readyMs: performance.now() - actionStart, location: location.pathname };
    }, scenario);
    const readyMs = performance.now() - start;
    await page.waitForLoadState("networkidle");
    assert.deepEqual(errors, []);
    if (scenario === "open-group") assert(pageTiming.rows >= groupRows);
    if (scenario === "back") assert.equal(pageTiming.location, `/boards/${boardId}/list`);
    if (body) {
      const ticket = await fetch(`${url}/api/tickets/${ticketId}`).then(response => response.json());
      assert(ticket.comments.some(comment => comment.bodyMarkdown === body), "Comment persisted");
    }
    if (run === repeats - 1) await capture("after-action");
    return { phase, scenario, boardId, run, ticketId, readyMs, actionMs: pageTiming.readyMs, pageTiming, images, lastRequestMs: lastRequestFinishMs - start,
      requests: requests.slice(sliceFrom).map(({ startedAt, finishedAt, ...request }) => ({ ...request, startMs: startedAt - start, endMs: finishedAt == null ? null : finishedAt - start })) };
  } finally {
    await context.close();
  }
}

try {
  for (const [phase, source] of phases) appInstances.set(phase, await launch(phase, source));
  for (const scenario of tests) {
    for (const boardId of boardIds) {
      for (let run = 0; run < repeats; run += 1) {
        for (const [phase] of run % 2 ? phases.toReversed() : phases) {
          const result = await verifyAction(phase, boardId, scenario, run);
          records.push(result);
          console.log(phase, scenario, boardId, run, result.actionMs.toFixed(1), result.requests.length,
            result.requests.filter(request => request.path.endsWith("/tickets")).length);
        }
      }
    }
  }
} finally {
  await browser.close();
  for (const { app } of appInstances.values()) await app.close();
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, baseline ? `actions-paired-${label}.json` : "actions-baseline.json"), JSON.stringify({ browser: browser.version(), variant, captureOnly, records }, null, 2) + "\n");
}
