import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const artifact = path.dirname(fileURLToPath(import.meta.url));
const [version, root, scope = "both"] = process.argv.slice(2);
const screens = path.join(artifact, "screens");
mkdirSync(screens, { recursive: true });

const profiles = [
  { locale: "en", width: 1440, height: 900, theme: "light", kanbanBoard: 2, kanbanCount: 3005, target: 2721, groupBoard: 4, groupCount: 10000, parent: 10001, child: 10002 },
  { locale: "ja", width: 390, height: 844, theme: "dark", kanbanBoard: 1, kanbanCount: 1005, target: 721, groupBoard: 3, groupCount: 1000, parent: 6001, child: 6002 },
];
const manifest = [];
const json = (source) => JSON.stringify(source);
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
async function getTicket(id) {
  const response = await fetch(root + "/api/tickets/" + id);
  assert(response.ok, "GET /api/tickets/" + id);
  return response.json();
}
const fileName = (base) => path.join(screens, base + ".png");

for (const p of profiles) for (const view of ["kanban", "group"].filter(view => scope === "both" || view === scope)) {
  const stem = [view === "kanban" ? 1535 : 1537, version, p.locale, p.theme, p.width, view].join("-");
  const session = "kb-input-" + process.pid + "-" + stem;
  const run = (...args) => execFileSync("agent-browser", ["--session", session, ...args], {
    cwd: artifact, encoding: "utf8", timeout: 45000,
  }).trim();
  const evaluate = (script) => JSON.parse(run("eval", script));
  const wait = (script) => run("wait", "--fn", script);
  const paint = () => run("eval", "(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); return true; })()");
  const shot = (stage) => {
    paint();
    const filepath = fileName(stem + "-" + stage);
    run("screenshot", filepath);
    entry.images.push({ stage, filepath, sha256: sha256(readFileSync(filepath)) });
  };
  const focused = (selector) => "document.activeElement.matches(" + json(selector) + ")";
  const pathSuffix = view === "kanban" ? "/boards/" + p.kanbanBoard : "/boards/" + p.groupBoard + "/group";
  const entry = { version, ...p, view, url: root + pathSuffix, images: [] };
  const moveFocus = (selector) => {
    run("focus", selector);
    wait(focused(selector));
  };
  try {
    run("set", "viewport", String(p.width), String(p.height));
    run("set", "media", p.theme);
    run("open", root + pathSuffix);
    run("eval", "localStorage.setItem('kanbalone:language'," + json(p.locale) + ")");
    run("reload");
    wait("document.documentElement.lang === " + json(p.locale));
    entry.context = evaluate('({ width: innerWidth, height: innerHeight, theme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", language: document.documentElement.lang, userAgent: navigator.userAgent })');
    assert.deepEqual([entry.context.width, entry.context.height, entry.context.theme, entry.context.language],
      [p.width, p.height, p.theme, p.locale]);
    if (view === "kanban") {
      const first = '.ticket-card[data-ticket-id="' + (p.kanbanBoard === 1 ? 1 : 2001) + '"] .ticket-link';
      const target = '.ticket-card[data-ticket-id="' + p.target + '"] .ticket-link';
      const scroll = () => evaluate('Array.from(document.querySelectorAll(".main, .lane-board, .ticket-list"), el => [el.scrollTop, el.scrollLeft])');
      wait('document.querySelectorAll(".ticket-card").length === ' + p.kanbanCount);
      moveFocus("#search-input");
      shot("search");
      run("press", "ArrowDown");
      wait(focused(first));
      shot("first-result");
      moveFocus(target);
      const initialScroll = scroll();
      const before = await getTicket(p.target);
      run("press", "Enter");
      wait('document.querySelector("#editor-dialog").open && document.querySelector("#editor-header-title").textContent.trim() === ' + json(before.title));
      shot("detail-open");
      run("press", "Escape");
      wait('!document.querySelector("#editor-dialog").open && ' + focused(target));
      assert.deepEqual(scroll(), initialScroll);
      shot("focus-return");
      const after = await getTicket(p.target);
      assert.deepEqual(after, before);
      entry.persisted = { id: p.target, title: after.title, laneId: after.laneId, groupId: after.groupId, scroll: initialScroll };
    } else {
      const add = '[data-group-action="add"]';
      const input = "#group-ticket-search";
      const child = '[data-group-ticket="' + p.child + '"]';
      const parent = '[data-group-unpick="' + p.parent + '"]';
      const addMembership = '[data-group-form="members"] button[type="submit"]';
      const cancel = '[data-group-action="cancel-add"]';
      const before = await Promise.all([getTicket(p.parent), getTicket(p.child)]);
      run("wait", add);
      moveFocus(add);
      run("press", "Enter");
      wait(focused(input));
      run("fill", input, "Performance");
      wait('document.querySelector("#group-ticket-options").childElementCount === ' + p.groupCount);
      shot("broad-query");
      run("press", "ArrowDown");
      wait('document.querySelector("#group-ticket-search").getAttribute("aria-activedescendant") === "group-option-' + p.child + '"');
      shot("arrow-down");
      run("press", "Enter");
      run("wait", parent);
      wait(focused(input));
      shot("selected-family");
      moveFocus(cancel);
      run("press", "Enter");
      wait(focused(add));
      shot("cancelled");
      assert.deepEqual(await Promise.all([getTicket(p.parent), getTicket(p.child)]), before);
      run("press", "Enter");
      wait(focused(input));
      run("fill", input, "child family");
      run("press", "Enter");
      run("wait", parent);
      moveFocus(addMembership);
      run("press", "Enter");
      run("wait", child);
      wait(focused(add));
      shot("saved");
      const saved = await Promise.all([getTicket(p.parent), getTicket(p.child)]);
      assert.deepEqual(saved.map(row => [row.id, row.groupId, row.parentTicketId]), [[p.parent, p.groupBoard, null], [p.child, p.groupBoard, p.parent]]);
      run("reload");
      run("wait", child);
      const reloaded = await Promise.all([getTicket(p.parent), getTicket(p.child)]);
      assert.deepEqual(reloaded, saved);
      shot("saved-after-reload");
      entry.persisted = {
        before: before.map(row => [row.id, row.groupId, row.parentTicketId]),
        afterCancel: before.map(row => [row.id, row.groupId, row.parentTicketId]),
        afterReload: reloaded.map(row => [row.id, row.groupId, row.parentTicketId]),
      };
    }
    manifest.push(entry);
    writeFileSync(path.join(artifact, "screen-" + version + "-" + scope + ".json"), JSON.stringify(manifest, null, 2) + "\n");
    console.log(stem, "PASS", entry.images.length);
  } finally {
    run("close");
  }
}
