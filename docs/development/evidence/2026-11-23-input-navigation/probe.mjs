import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = process.cwd();
const { buildApp } = await import(pathToFileURL(path.join(root, "src/app.ts")));
const artifact = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(root + "/package.json");
const { chromium } = require("@playwright/test");
const SQLite = require("better-sqlite3");
const seedPath = path.join(artifact, "fixture.sqlite");
const version = process.argv[2];
const scope = process.argv[3] ?? "both";
const passes = Number(process.argv[4] ?? 7);
const testBoards = [
  { boardId: 1, start: 0, size: 1000, type: "kanban" },
  { boardId: 2, start: 2000, size: 3000, type: "kanban" },
  { boardId: 3, start: 6000, size: 1000, type: "group" },
  { boardId: 4, start: 10000, size: 10000, type: "group" },
];

async function seed() {
  let exists = true;
  try { await fs.access(seedPath); } catch { exists = false; }
  if (exists) return;
  const initializer = buildApp({ dbFile: seedPath });
  await initializer.close();
  const db = new SQLite(seedPath);
  const now = "2026-11-22T12:00:00.000Z";
  const addBoard = db.prepare("INSERT INTO boards (id, name, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  const addLane = db.prepare("INSERT INTO lanes (id, board_id, name, position, is_completion_lane) VALUES (?, ?, ?, ?, ?)");
  const addGroup = db.prepare("INSERT INTO groups (id, board_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)");
  const addTicket = db.prepare("INSERT INTO tickets (id, board_id, lane_id, parent_ticket_id, title, body_markdown, priority, position, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  db.pragma("foreign_keys=ON");
  db.transaction(() => {
    for (const { boardId, start, size, type } of testBoards) {
      const isKanban = type === "kanban";
      const name = isKanban ? "Active Kanban" : "Unassigned Group candidates";
      addBoard.run(boardId, name + " " + size, boardId - 1, now, now);
      const laneOffset = boardId * 10;
      const lanes = isKanban ? ["Todo", "Doing", "Acceptance", "Done"] : ["Todo"];
      for (let index = 0; index < lanes.length; index += 1) {
        addLane.run(laneOffset + index + 1, boardId, lanes[index], index, Number(index === 3));
      }
      if (!isKanban) addGroup.run(boardId, boardId, "Keyboard review", now, now);
      for (let index = 0; index < size; index += 1) {
        const id = start + index + 1;
        const parentId = !isKanban && index === 1 ? start + 1 : null;
        const suffix = !isKanban && index < 2 ? (index === 0 ? " parent family" : " child family") : "";
        const position = isKanban ? Math.floor(index / 3) : index;
        const laneId = laneOffset + 1 + (isKanban ? index % 3 : 0);
        addTicket.run(id, boardId, laneId, parentId, "Performance ticket " + String(id).padStart(5, "0") + suffix,
          "Synthetic keyboard fixture #" + id, index % 4 + 1, position, Number(!isKanban && index === 2), now, now);
      }
      if (isKanban) for (let index = 0; index < 60; index += 1) {
        const id = start + size + index + 1;
        addTicket.run(id, boardId, laneOffset + 4, null, "Performance completion " + id,
          "Synthetic completed ticket", 2, index, 0, now, now);
      }
    }
  })();
  assert.deepEqual(db.pragma("foreign_key_check"), []);
  assert.equal(db.pragma("integrity_check", { simple: true }), "ok");
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
}

await seed();
if (version === "seed") process.exit(0);
assert(["baseline", "candidate"].includes(version), "variant must be baseline or candidate");
assert(["both", "kanban", "group", "serve"].includes(scope));
const staticDir = version === "baseline" ? path.join(artifact, "baseline-public") : path.join(root, "public");
const workingDb = path.join(artifact, [version, scope, process.pid].join("-") + ".sqlite");
await fs.copyFile(seedPath, workingDb);
const app = buildApp({ dbFile: workingDb, staticDir });
const endpoint = await app.listen({ host: "127.0.0.1", port: scope === "serve" ? passes : 0 });
console.log(JSON.stringify({ endpoint, workingDb, version, scope }));
if (scope === "serve") await new Promise(() => {});

const browser = await chromium.launch();
const results = [];
const seq = [];
const sampleFile = path.join(artifact, [version, scope, process.pid].join("-") + ".json");
const hash = (value) => createHash("sha256").update(value).digest("hex");
const environment = {
  platform: [process.platform, process.arch, os.release()],
  cpu: os.cpus()[0]?.model,
  node: process.version,
  chromium: browser.version(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  captureDate: new Date().toISOString(),
  fixtureSha256: hash(await fs.readFile(seedPath)),
  versionInfo: await (await fetch(endpoint + "/api/meta")).json(),
  fileSha256: Object.fromEntries(await Promise.all(["app-board-keyboard.js", "app-group-board.js"].map(async file =>
    [file, hash(await fs.readFile(path.join(staticDir, file)))]))),
};
function wait(page, selector, value = "") {
  return page.waitForFunction(({ selector, value }) => {
    const element = document.querySelector(selector);
    return element && (!value || element.textContent === value);
  }, { selector, value }, { timeout: 30000 });
}
const title = (id) => '.ticket-card[data-ticket-id="' + id + '"] .ticket-link';
const twoFrames = async (page) => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const focus = (page, selector) => page.evaluate(selector => document.querySelector(selector).focus(), selector);
const appState = (page) => page.evaluate(() => ({
  count: document.querySelectorAll(".ticket-card").length,
  query: document.querySelector("#search-input").value,
  title: document.activeElement.closest(".ticket-card")?.dataset.ticketId,
  window: [window.scrollX, window.scrollY],
  scroll: Array.from(document.querySelectorAll(".main, .lane-board, .ticket-list"), el => [el.className, el.scrollTop, el.scrollLeft]),
  folded: Array.from(document.querySelectorAll(".completion-show-more"), el => el.textContent),
}));
const getTicket = async (page, id) => {
  const response = await page.request.get(endpoint + "/api/tickets/" + id);
  assert(response.ok());
  return response.json();
};
const updateTitle = async (page, id, value) => {
  const response = await page.request.patch(endpoint + "/api/tickets/" + id, { data: { title: value } });
  assert(response.ok(), await response.text());
};
const groupInput = "#group-ticket-search";
const options = "#group-ticket-options";
const expanded = (page) => page.evaluate(() => document.querySelector("#group-ticket-search").getAttribute("aria-expanded"));
const optionIds = (page) => page.evaluate(() => Array.from(document.querySelector("#group-ticket-options").children, el => Number(el.dataset.groupPick)));
async function frameMeasure(page, name, key, expected, record, pointer = null) {
  await page.evaluate(({ key, expected, pointer }) => {
    const read = () => {
      const dialog = document.querySelector("#editor-dialog");
      const active = document.activeElement;
      if (expected.kind === "opened") return dialog.open && document.querySelector("#editor-header-title").textContent.trim() === expected.title;
      if (expected.kind === "focus") {
        if (dialog.open) return false;
        if (expected.id == null) return active.id === "search-input";
        return active.matches(".ticket-link") && Number(active.closest(".ticket-card").dataset.ticketId) === expected.id
          && (expected.title == null || active.textContent === expected.title);
      }
      const input = document.querySelector("#group-ticket-search");
      const list = document.querySelector("#group-ticket-options");
      if (expected.kind === "picker") return active === input && !!list;
      if (active !== input || !list) return false;
      if (expected.kind === "caret") return input.selectionStart === expected.offset && input.selectionEnd === expected.offset;
      if (expected.kind === "query") return input.value === expected.query && list.children.length === expected.count;
      if (expected.kind === "option") return list.children[expected.index]?.getAttribute("aria-selected") === "true"
        && input.getAttribute("aria-activedescendant") === list.children[expected.index]?.id;
      if (expected.kind === "chosen") return !input.value && !list.childElementCount && !!document.querySelector('[data-group-unpick="' + expected.id + '"]');
      return false;
    };
    const probe = window.__inputProbe = { result: null, received: null };
    const eventType = pointer == null ? "keydown" : "click";
    const receipt = (event) => {
      if (!event.isTrusted || (pointer == null && event.key !== key)) return;
      probe.received = performance.now();
      probe.eventTime = event.timeStamp;
      if (expected.kind === "option" || expected.kind === "caret" || expected.kind === "query") {
        const end = (event) => {
          if (eventType === "keydown" && event.key !== key) return;
          probe.handler = performance.now() - probe.received;
          document.removeEventListener(eventType, end);
        };
        document.addEventListener(eventType, end);
      }
      document.removeEventListener(eventType, receipt, true);
    };
    document.addEventListener(eventType, receipt, true);
    const scan = () => {
      if (window.__inputProbe !== probe) return;
      if (probe.received == null || !read()) {
        requestAnimationFrame(scan);
        return;
      }
      probe.observed = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        probe.result = {
          eventToObservedMs: probe.observed - probe.eventTime,
          eventToTwoFramesMs: performance.now() - probe.eventTime,
          captureToHandlerEndMs: probe.handler ?? null,
          stillValid: read(),
          cardsAtResult: expected.kind === "focus" ? document.querySelectorAll(".ticket-card").length : null,
        };
      }));
    };
    requestAnimationFrame(scan);
  }, { key, expected, pointer });
  const hostStarted = performance.now();
  if (pointer) await page.mouse.click(pointer.x, pointer.y);
  else await page.keyboard.press(key);
  const ready = await page.waitForFunction(() => window.__inputProbe.result, undefined, { timeout: 7000 }).catch(async error => {
    console.error(name, await page.evaluate(() => ({
      probe: window.__inputProbe, active: document.activeElement?.outerHTML.slice(0, 300),
      dialog: document.querySelector("#editor-dialog").open, header: document.querySelector("#editor-header-title").textContent.trim(),
      optionCount: document.querySelector("#group-ticket-options")?.childElementCount,
      toast: document.querySelector("#toast").textContent,
    })));
    throw error;
  });
  const hostToResultMs = performance.now() - hostStarted;
  const result = await ready.jsonValue();
  assert(result.stillValid, name + " diverged by the second frame");
  const row = { name, key, hostToResultMs, ...result };
  if (record) results.push(row);
  return row;
}
function countCards(page, count) {
  return page.waitForFunction(count => document.querySelectorAll(".ticket-card").length === count,
    count, { timeout: 45000 });
}
async function userScroll(page) {
  return page.evaluate(() => ({
    top: document.querySelector("#group-board").scrollTop,
    left: document.querySelector("#group-board").scrollLeft,
    optionsTop: document.querySelector("#group-ticket-options").scrollTop,
    panelTop: document.querySelector(".group-content-panel").scrollTop,
    mainTop: document.querySelector(".main").scrollTop,
    mainLeft: document.querySelector(".main").scrollLeft,
    window: [window.scrollX, window.scrollY],
  }));
}
async function setup(page, board) {
  const events = page.waitForResponse(response => response.url() === endpoint + "/api/boards/" + board.boardId + "/events");
  await page.goto(endpoint + "/boards/" + board.boardId + (board.type === "group" ? "/group" : ""), { waitUntil: "domcontentloaded" });
  const stream = await events;
  assert.equal(stream.status(), 200);
  if (board.type === "kanban") await countCards(page, board.size + 5);
  else await wait(page, '[data-group-action="add"]');
  await page.evaluate(() => document.fonts.ready);
  await twoFrames(page);
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
}
try {
  for (const board of testBoards.filter(board => scope === "both" || scope === board.type)) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US", colorScheme: "light" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await context.addInitScript(() => {
      localStorage.setItem("kanbalone:language", "en");
      window.__boardUpdateCount = 0;
      const Original = window.EventSource;
      window.EventSource = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", event => { if (JSON.parse(event.data).event === "board_updated") window.__boardUpdateCount += 1; });
        }
      };
    });
    try {
      await setup(page, board);
      const label = board.type + "-" + board.size + "-";
      if (board.type === "kanban") {
        const firstId = board.start + 1;
        const targetId = board.start + Math.min(board.size - 1, 721);
        const firstOpen = { kind: "opened", title: (await getTicket(page, firstId)).title };
        const target = await getTicket(page, targetId);
        const targetOpen = { kind: "opened", title: target.title };
        await focus(page, "#search-input");
        await frameMeasure(page, label + "search-arrow-cold", "ArrowDown", { kind: "focus", id: firstId }, true);
        await frameMeasure(page, label + "detail-first-open", "Enter", firstOpen, true);
        await frameMeasure(page, label + "detail-first-close", "Escape", { kind: "focus", id: firstId }, true);
        assert.equal((await appState(page)).folded.length, 1);
        for (let pass = 0; pass <= passes; pass += 1) {
          await focus(page, "#search-input");
          await frameMeasure(page, label + "search-arrow", "ArrowDown", { kind: "focus", id: firstId }, pass > 0);
          await focus(page, title(targetId));
          const before = await appState(page);
          assert(before.scroll.some(([, top]) => top > 0));
          await frameMeasure(page, label + "detail-open", "Enter", targetOpen, false);
          await frameMeasure(page, label + "detail-close", "Escape", { kind: "focus", id: targetId }, pass > 0);
          assert.deepEqual(await appState(page), before);
        }
        assert.deepEqual(await getTicket(page, targetId), target);
        const beforeQueued = await appState(page);
        await frameMeasure(page, label + "pending-detail-open", "Enter", targetOpen, false);
        const edited = target.title + " refreshed";
        const beforeEvent = await page.evaluate(() => window.__boardUpdateCount);
        await updateTitle(page, targetId, edited);
        await page.waitForFunction(before => window.__boardUpdateCount > before, beforeEvent, { timeout: 7000 });
        const fullStarted = performance.now();
        const restore = await frameMeasure(page, label + "detail-close-with-sse", "Escape", { kind: "focus", id: targetId, title: edited }, true);
        const restored = await appState(page);
        assert.deepEqual({ ...restored, count: beforeQueued.count }, beforeQueued);
        await countCards(page, board.size + 5);
        await twoFrames(page);
        const fullBoardAfterQueuedCloseMs = performance.now() - fullStarted;
        assert.deepEqual(await appState(page), beforeQueued);
        assert.equal((await getTicket(page, targetId)).title, edited);
        await page.locator("#search-input").fill(edited);
        await countCards(page, 1);
        await focus(page, "#search-input");
        await frameMeasure(page, label + "search-filtered-arrow", "ArrowDown", { kind: "focus", id: targetId }, true);
        await frameMeasure(page, label + "filtered-detail-open", "Enter", { kind: "opened", title: edited }, false);
        const beforeFilteredEvent = await page.evaluate(() => window.__boardUpdateCount);
        const outside = "Moved outside keyboard filter";
        await updateTitle(page, targetId, outside);
        await page.waitForFunction(before => window.__boardUpdateCount > before, beforeFilteredEvent, { timeout: 7000 });
        await frameMeasure(page, label + "filtered-detail-close-with-sse", "Escape", { kind: "focus", id: null }, true);
        const afterFilter = await appState(page);
        assert.equal(afterFilter.query, edited);
        assert.equal(afterFilter.count, 0);
        assert.equal((await getTicket(page, targetId)).title, outside);
        seq.push({ board, targetId, beforeQueued, cardsAtRestore: restore.cardsAtResult, fullBoardAfterQueuedCloseMs,
          persistedTitle: outside, pageErrors: errors });
      } else {
        const add = '[data-group-action="add"]';
        const parentId = board.start + 1;
        const childId = board.start + 2;
        const refs = [parentId, childId];
        const before = await Promise.all(refs.map(id => getTicket(page, id)));
        const button = page.locator(add);
        await button.scrollIntoViewIfNeeded();
        const { x, y, width, height } = await button.boundingBox();
        await frameMeasure(page, label + "picker-first-open", null, { kind: "picker" },
          true, { x: x + width / 2, y: y + height / 2 });
        const query = "Performance ticket";
        await page.locator(groupInput).fill("Performance ticke");
        await frameMeasure(page, label + "query-key", "t", { kind: "query", query, count: board.size }, true);
        assert.equal(await expanded(page), "true");
        const ids = await optionIds(page);
        assert.equal(ids.length, board.size);
        assert.equal(new Set(ids).size, board.size);
        assert.deepEqual(ids.slice(0, 2), [parentId, childId]);
        assert.equal(ids.at(-1), board.start + 3);
        assert((await page.locator('[data-group-pick="' + (board.start + 3) + '"]').innerText()).includes("Archived"));
        const startingScroll = await userScroll(page);
        for (let pass = 0; pass <= passes; pass += 1) {
          await frameMeasure(page, label + "arrow-down", "ArrowDown", { kind: "option", index: 1 }, pass > 0);
          await frameMeasure(page, label + "arrow-up", "ArrowUp", { kind: "option", index: 0 }, pass > 0);
        }
        assert.deepEqual(await userScroll(page), startingScroll);
        assert.deepEqual(await optionIds(page), ids);
        await frameMeasure(page, label + "wrap-up", "ArrowUp", { kind: "option", index: ids.length - 1 }, true);
        await frameMeasure(page, label + "wrap-down", "ArrowDown", { kind: "option", index: 0 }, true);
        await page.evaluate(() => { document.querySelector("#group-board").scrollTop = 96; });
        await twoFrames(page);
        const nonzeroScrollBefore = await userScroll(page);
        assert(nonzeroScrollBefore.top > 0);
        await frameMeasure(page, label + "scrolled-arrow-down", "ArrowDown", { kind: "option", index: 1 }, true);
        await frameMeasure(page, label + "scrolled-arrow-up", "ArrowUp", { kind: "option", index: 0 }, true);
        const nonzeroScrollAfter = await userScroll(page);
        assert.deepEqual(nonzeroScrollAfter, nonzeroScrollBefore);
        await page.evaluate(() => { document.querySelector("#group-board").scrollTop = 0; });
        await twoFrames(page);
        await frameMeasure(page, label + "caret-left", "ArrowLeft", { kind: "caret", offset: query.length - 1 }, true);
        await page.keyboard.press("Escape");
        assert.equal(await expanded(page), "false");
        assert.equal(await page.locator(options).count(), 1);
        assert.equal(await page.locator(options).isVisible(), false);
        await page.locator(groupInput).fill("unmatched zxq");
        assert.equal(await page.locator(options).isVisible(), true);
        assert.equal(await page.locator(options + " button").count(), 0);
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Enter");
        assert.equal(await page.locator("[data-group-unpick]").count(), 0);
        await page.locator(groupInput).fill("#" + childId);
        await page.waitForFunction(id => !!document.querySelector('[data-group-pick="' + id + '"]'), childId);
        assert.equal((await optionIds(page))[0], childId);
        await frameMeasure(page, label + "enter-child", "Enter", { kind: "chosen", id: parentId }, true);
        await page.locator('[data-group-action="cancel-add"]').click();
        await page.waitForFunction(() => document.activeElement.matches('[data-group-action="add"]'));
        assert.deepEqual(await Promise.all(refs.map(id => getTicket(page, id))), before);
        await page.locator(add).click();
        await page.locator(groupInput).fill("child family");
        await frameMeasure(page, label + "enter-child-reopen", "Enter", { kind: "chosen", id: parentId }, true);
        await page.locator('[data-group-form="members"] button[type="submit"]').click();
        await wait(page, '[data-group-ticket="' + childId + '"]');
        const members = await Promise.all(refs.map(id => getTicket(page, id)));
        assert.deepEqual(members.map(ticket => [ticket.groupId, ticket.parentTicketId]), [[board.boardId, null], [board.boardId, parentId]]);
        await page.reload({ waitUntil: "domcontentloaded" });
        await wait(page, '[data-group-ticket="' + childId + '"]');
        assert.deepEqual(await Promise.all(refs.map(id => getTicket(page, id))), members);
        seq.push({ board, optionDigest: hash(JSON.stringify(ids)), startingScroll, nonzeroScrollBefore, nonzeroScrollAfter, parentId, childId,
          beforeGroupIds: before.map(ticket => ticket.groupId), savedGroupIds: members.map(ticket => ticket.groupId), pageErrors: errors });
      }
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
      await fs.writeFile(sampleFile, JSON.stringify({ version, endpoint, scope, environment, results, seq }, null, 2) + "\n");
    }
    console.log(board.type, board.size, "PASS", results.filter(result => result.name.startsWith(board.type + "-" + board.size + "-")).length);
  }
} finally {
  await browser.close();
  const closing = app.close();
  app.server.closeAllConnections();
  await closing;
}
