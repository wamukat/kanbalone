import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-position-list-"));
const configs = [["baseline", resolve(process.argv[2])], ["candidate", resolve(process.argv[3])]];
const repeats = Number(process.env.SUBSECOND_SAMPLES ?? 3);
const japanese = process.env.SUBSECOND_LOCALE === "ja";
const mode = japanese ? "ja-dark-390x844" : "en-light-1440x900";
const properties = japanese
  ? { viewport: { width: 390, height: 844 }, locale: "ja-JP", colorScheme: "dark" }
  : { viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light" };
const boardId = japanese ? 1 : 2;
const count = boardId === 1 ? 1005 : 10005;
const runtime = new Map();
const records = [];
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const browser = await chromium.launch();

async function launch(phase, source) {
  const dbFile = resolve(work, phase + ".sqlite");
  await copyFile(resolve(output, "fixture.sqlite"), dbFile);
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const app = buildApp({ dbFile, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return { app, url };
}

async function sample(phase, run) {
  const context = await browser.newContext(properties);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.addInitScript(({ boardId, height, language }) => {
    localStorage.setItem("kanbalone:language", language);
    localStorage.setItem("kanbalone:ui-preferences", JSON.stringify({
      version: 1, activeBoardId: boardId, boards: {
        [boardId]: { viewMode: "list", filters: { includeArchived: true, status: ["open", "resolved"] } },
      },
    }));
    const watch = new MutationObserver(() => {
      if (document.querySelector(".list-spacer")?.style.height !== height || !document.querySelector(".list-ticket-link")) return;
      watch.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__listReady = performance.now(); }));
    });
    watch.observe(document, { subtree: true, childList: true });
  }, { boardId, height: (64 * count) + "px", language: japanese ? "ja" : "en" });
  try {
    await page.goto(`${runtime.get(phase).url}/boards/${boardId}/list`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__listReady, null, { timeout: 60_000 });
    const data = await page.evaluate(() => ({
      listReady: window.__listReady,
      requests: performance.getEntriesByType("resource").filter(entry => {
        const url = new URL(entry.name);
        return url.pathname.endsWith("/tickets") && url.searchParams.get("archived") === "all";
      }).map(entry => ({ limit: Number(new URL(entry.name).searchParams.get("limit")), responseEnd: entry.responseEnd })),
    }));
    assert.equal(data.requests.length, Math.ceil(count / 200));
    assert(data.requests.every(request => request.limit === 200));
    const links = page.locator(".list-ticket-link");
    const getTicketIds = () => links.evaluateAll(elements => elements.map(node => node.getAttribute("data-open-ticket-id")));
    const top = await getTicketIds();
    if (run === repeats - 1) {
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: resolve(output, `position-${mode}-${phase}-top.png`) });
    }
    await page.locator(".list-viewport").evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
    await page.waitForFunction(id => document.querySelector(".list-ticket-link")?.getAttribute("data-open-ticket-id") !== id, top[0]);
    const middle = await getTicketIds();
    const scrollTop = await page.locator(".list-viewport").evaluate(element => element.scrollTop);
    if (run === repeats - 1) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: resolve(output, `position-${mode}-${phase}-middle.png`) });
    }
    const targetId = middle[Math.floor(middle.length / 2)];
    const target = page.locator(`.list-ticket-link[data-open-ticket-id="${targetId}"]`);
    await target.click();
    await page.locator("#editor-dialog[open]").waitFor();
    assert.equal(new URL(page.url()).pathname, "/tickets/" + targetId);
    assert.deepEqual(errors, []);
    return { phase, run, boardId, count, ...data, topHash: hash(top), middleHash: hash(middle), scrollTop, targetId };
  } finally {
    await context.close();
  }
}

try {
  for (const [phase, source] of configs) runtime.set(phase, await launch(phase, source));
  let expectedLayout;
  for (let run = 0; run < repeats; run += 1) {
    for (const [phase] of run % 2 ? configs.toReversed() : configs) {
      const result = await sample(phase, run);
      const { topHash, middleHash, scrollTop, targetId } = result;
      const layout = { topHash, middleHash, scrollTop, targetId };
      expectedLayout ??= layout;
      assert.deepEqual(layout, expectedLayout);
      records.push(result);
      console.log(mode, phase, run, result.requests.length, result.listReady.toFixed(1), scrollTop, targetId);
    }
  }
} finally {
  await browser.close();
  for (const { app } of runtime.values()) await app.close();
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, `position-ui-${mode}.json`), JSON.stringify({ browser: browser.version(), properties, records }, null, 2) + "\n");
}
