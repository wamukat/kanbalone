import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium, expect } from "@playwright/test";

const output = resolve("coverage/subsecond-data");
const work = await mkdtemp(resolve(tmpdir(), "kanbalone-write-browser-"));
const sources = [["before", resolve(process.argv[2])], ["after", resolve(process.argv[3])]];
const properties = { viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light" };
const boardId = 1;
const sourceLane = 1;
const targetLane = 2;
const archiveLane = 3;
const pictures = {};
const records = [];
const browser = await chromium.launch();
const imageHash = async path => createHash("sha256").update(await readFile(path)).digest("hex");

async function trial(phase, source) {
  const file = resolve(work, phase + ".sqlite");
  await copyFile(resolve(output, "fixture.sqlite"), file);
  const { buildApp } = await import(pathToFileURL(resolve(source, "src/app.ts")));
  const app = buildApp({ dbFile: file, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  const context = await browser.newContext(properties);
  await context.addInitScript(() => localStorage.setItem("kanbalone:language", "en"));
  context.setDefaultTimeout(10_000);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  const pageUrl = base + "/boards/" + boardId;
  const collectionUrl = base + "/api/boards/" + boardId + "/tickets?order=position_asc&archived=all&limit=1";
  const cardId = async card => Number(await card.getAttribute("data-ticket-id"));
  const lane = id => page.locator('.ticket-list[data-lane-id="' + id + '"]');
  const cards = id => lane(id).locator(":scope > .ticket-card");
  const ticketUrl = id => base + "/api/tickets/" + id;
  const follow = async () => {
    const response = await page.request.get(collectionUrl);
    assert.equal(response.status(), 200);
    const next = (await response.json()).page.nextCursor;
    assert(next);
    const continuation = collectionUrl + "&cursor=" + encodeURIComponent(next);
    assert.equal((await page.request.get(continuation)).status(), 200);
    return continuation;
  };
  const stored = async id => {
    const response = await page.request.get(ticketUrl(id));
    assert.equal(response.status(), 200);
    const { id: ticketId, laneId, position, isArchived } = await response.json();
    return { id: ticketId, laneId, position, isArchived };
  };
  const picture = async stage => {
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const path = resolve(output, "indexed-writes-en-light-" + phase + "-" + stage + ".png");
    await page.screenshot({ path, animations: "disabled" });
    const sha256 = await imageHash(path);
    (pictures[stage] ??= {})[phase] = { path, sha256 };
  };

  try {
    await page.goto(pageUrl);
    await expect(cards(sourceLane).nth(1)).toBeVisible();
    await expect(cards(targetLane).nth(1)).toBeVisible();
    const moving = cards(sourceLane).first();
    const target = cards(targetLane).first();
    const movingId = await cardId(moving);
    const targetId = await cardId(target);
    const beforeDrag = await stored(movingId);
    const moveCursor = await follow();
    await picture("move-start");

    await page.evaluate(() => {
      document.addEventListener("dragstart", event => {
        if (event.target.closest(".ticket-card")) window.__writeVerificationTrustedDrag = event.isTrusted;
      }, { capture: true, once: true });
    });
    const [movedResponse] = await Promise.all([
      page.waitForResponse(response => response.url() === ticketUrl(movingId) + "/position" && response.request().method() === "PATCH"),
      moving.dragTo(target, { sourcePosition: { x: 16, y: 16 }, targetPosition: { x: 16, y: 9 } }),
    ]);
    assert.equal(movedResponse.status(), 200, await movedResponse.text());
    assert.equal(await page.evaluate(() => window.__writeVerificationTrustedDrag), true);
    const moved = await stored(movingId);
    assert.equal(moved.laneId, targetLane);
    assert.equal(moved.position, 0);
    assert.equal((await page.request.get(moveCursor)).status(), 409);
    await page.reload();
    await expect(cards(targetLane).first()).toHaveAttribute("data-ticket-id", String(movingId));
    await expect(cards(targetLane).nth(1)).toHaveAttribute("data-ticket-id", String(targetId));
    await picture("move-reload");

    const archive = cards(archiveLane).first();
    const archiveId = await cardId(archive);
    const beforeArchive = await stored(archiveId);
    assert(!beforeArchive.isArchived);
    const archiveCursor = await follow();
    await archive.locator(".ticket-link").click();
    await page.locator("#header-edit-button").click();
    const button = page.locator("#archive-ticket-button");
    await expect(button).toBeVisible();
    await picture("archive-start");
    const [archiveResponse] = await Promise.all([
      page.waitForResponse(response => response.url() === ticketUrl(archiveId) && response.request().method() === "PATCH"),
      button.click(),
    ]);
    assert.equal(archiveResponse.status(), 200, await archiveResponse.text());
    const archived = await stored(archiveId);
    assert.equal(archived.isArchived, true);
    assert.equal((await page.request.get(archiveCursor)).status(), 409);
    await page.reload();
    await expect(cards(archiveLane).first()).toBeVisible();
    await expect(page.locator('.ticket-card[data-ticket-id="' + archiveId + '"]')).toHaveCount(0);
    await page.goto(base + "/tickets/" + archiveId);
    await expect(page.locator("#editor-header-state")).toContainText("Archived");
    await picture("archive-reload");
    assert.deepEqual(errors, []);
    return { phase, boardId, sourceLane, targetLane, archiveLane, targetId, beforeDrag, moved, beforeArchive, archived,
      staleMoveCursor: 409, staleArchiveCursor: 409, dragTrusted: true };
  } finally {
    await page.close();
    await context.close();
    const closing = app.close();
    app.server.closeAllConnections();
    await closing;
  }
}

try {
  for (const [phase, source] of sources) {
    const record = await trial(phase, source);
    records.push(record);
    console.log(phase, record.moved, record.archived);
  }
  assert.deepEqual({ ...records[0], phase: "after" }, records[1]);
} finally {
  const version = browser.version();
  await browser.close();
  await rm(work, { recursive: true, force: true });
  await writeFile(resolve(output, "indexed-revision-ui.json"), JSON.stringify({ version, properties, pictures, records }, null, 2) + "\n");
}
