import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const evidence = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-subsecond-group-pages-"));
const runs = Number(process.env.SUBSECOND_SAMPLES ?? 4);
const japanese = process.env.SUBSECOND_LOCALE === "ja";
const boards = process.env.SUBSECOND_BOARDS?.split(",").map(Number) ?? [1, 2];
const builds = [["baseline", resolve(process.argv[2])], ["candidate", resolve(process.argv[3])]];
const dimensions = japanese
  ? { viewport: { width: 390, height: 844 }, locale: "ja-JP", colorScheme: "dark" }
  : { viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light" };
const variant = japanese ? "ja-dark" : "en-light";
const instances = new Map();
const records = [];
const browser = await chromium.launch();
const hash = data => createHash("sha256").update(JSON.stringify(data)).digest("hex");

async function launch(phase, source) {
  const dbFile = resolve(work, phase + ".sqlite");
  await copyFile(resolve(evidence, "fixture.sqlite"), dbFile);
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const app = buildApp({ dbFile, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return { app, url };
}

async function sample(phase, boardId, run) {
  const { url } = instances.get(phase);
  const context = await browser.newContext(dimensions);
  const count = boardId === 1 ? 1000 : 10000;
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await context.addInitScript(expected => {
    window.__stage = {};
    const watch = new MutationObserver(() => {
      const host = document.querySelector("#group-board");
      if (!host) return;
      const firstRow = host.querySelector(".group-ticket-row");
      if (!firstRow) return;
      window.__stage.firstRow ??= performance.now();
      if (host.querySelectorAll(".group-ticket-row").length !== expected) return;
      watch.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__stage.allRows = performance.now(); }));
    });
    watch.observe(document, { subtree: true, childList: true });
    document.addEventListener("click", () => { window.__stage.click = performance.now(); }, true);
  }, count);
  try {
    await page.goto(`${url}/boards/${boardId}/group`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__stage.allRows, null, { timeout: 60_000 });
    const summary = await page.evaluate(() => {
      const resources = performance.getEntriesByType("resource").filter(entry => {
        const url = new URL(entry.name);
        return url.pathname.endsWith("/group-tickets") && url.searchParams.has("groupId");
      });
      return {
        timing: window.__stage,
        rows: [...document.querySelectorAll(".group-ticket-row .ticket-ref")].map(node => node.textContent.trim().slice(1)),
        requests: resources.map(entry => ({
          limit: Number(new URL(entry.name).searchParams.get("limit")), start: entry.startTime,
          end: entry.responseEnd, bytes: entry.decodedBodySize,
        })),
      };
    });
    assert.equal(summary.rows.length, count);
    assert.equal(new Set(summary.rows).size, count);
    assert.equal(summary.requests[0].limit, 200);
    assert(summary.requests.slice(1).every(request => request.limit === (phase === "candidate" ? 800 : 200)));
    const firstTicket = page.locator("[data-group-ticket]").first();
    const firstTicketId = await firstTicket.getAttribute("data-group-ticket");
    if (run === runs - 1) {
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(resolve)); });
      await page.mouse.move(0, 0);
      await page.screenshot({ path: resolve(evidence, `projection-${variant}-${boardId}-${phase}.png`) });
    }
    await firstTicket.click();
    await page.locator("#editor-dialog[open]").waitFor();
    const interactionMs = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return performance.now() - window.__stage.click;
    });
    assert.equal(new URL(page.url()).pathname, "/tickets/" + firstTicketId);
    assert.deepEqual(errors, []);
    const { rows, ...rest } = summary;
    return { phase, boardId, run, count, rowHash: hash(rows), interactionMs, ...rest };
  } finally {
    await context.close();
  }
}

try {
  for (const [phase, source] of builds) instances.set(phase, await launch(phase, source));
  for (const boardId of boards) {
    let expected;
    for (let run = 0; run < runs; run += 1) {
      for (const [phase] of run % 2 ? builds.toReversed() : builds) {
        const result = await sample(phase, boardId, run);
        expected ??= result.rowHash;
        assert.equal(result.rowHash, expected);
        records.push(result);
        console.log(phase, boardId, run, result.requests.length, result.timing.firstRow.toFixed(1), result.timing.allRows.toFixed(1),
          result.interactionMs.toFixed(1));
      }
    }
  }
} finally {
  await browser.close();
  for (const { app } of instances.values()) await app.close();
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(evidence, `ui-projection-${variant}.json`), JSON.stringify({ browser: browser.version(), dimensions, records }, null, 2) + "\n");
}
