import test from "node:test";
import assert from "node:assert/strict";

import { calculateVisibleWindow, takeRoundRobinBatch } from "../public/app-board-utils.js";
import { getListTickets, renderListActions } from "../public/app-board-list.js";
import { formatTagLabel, renderTag, tagTextColor } from "../public/app-tags.js";
import { renderTicketTagChip } from "../public/app-ticket-tag-picker.js";
import { buildBodyDiffRows, getRemoteSnapshotFreshness } from "../public/app-ticket-detail.js";

test("calculateVisibleWindow returns a bounded overscanned range", () => {
  const window = calculateVisibleWindow(5000, 44, 12, 4400, 600);
  assert.deepEqual(window, { startIndex: 88, endIndex: 126 });
});

test("takeRoundRobinBatch distributes work across lanes", () => {
  const queues = [
    { index: 0, tickets: [1, 2, 3, 4] },
    { index: 0, tickets: [5, 6] },
    { index: 0, tickets: [7, 8, 9] },
  ];

  const result = takeRoundRobinBatch(queues, 0, 5);

  assert.deepEqual(result.selections, [
    { laneIndex: 0, ticketIndex: 0 },
    { laneIndex: 1, ticketIndex: 0 },
    { laneIndex: 2, ticketIndex: 0 },
    { laneIndex: 0, ticketIndex: 1 },
    { laneIndex: 1, ticketIndex: 1 },
  ]);
  assert.equal(result.nextLaneIndex, 2);
  assert.deepEqual(queues.map((queue) => queue.index), [2, 2, 1]);
});

test("getListTickets keeps parent tickets before children and sorts high priority first", () => {
  const tickets = [
    { id: 4, priority: 3, parentTicketId: 99 },
    { id: 2, priority: 2, parentTicketId: 1 },
    { id: 1, priority: 4, parentTicketId: null },
    { id: 3, priority: 1, parentTicketId: null },
  ];

  const entries = getListTickets(tickets);

  assert.deepEqual(
    entries.map((entry) => [entry.ticket.id, entry.indent]),
    [
      [1, 0],
      [2, 1],
      [4, 0],
      [3, 0],
    ],
  );
});

test("renderListActions exposes only relevant bulk actions", () => {
  const tickets = [
    { id: 1, isResolved: false, isArchived: false },
    { id: 2, isResolved: true, isArchived: true },
  ];

  assert.match(renderListActions(tickets, []), /Select tickets to edit in bulk/);

  const mixed = renderListActions(tickets, [1, 2], true);
  assert.match(mixed, /Move/);
  assert.match(mixed, /Mark Resolved/);
  assert.match(mixed, /Reopen/);
  assert.match(mixed, /Archive/);
  assert.match(mixed, /Restore/);
  assert.match(mixed, /Delete/);

  const openOnly = renderListActions(tickets, [1]);
  assert.doesNotMatch(openOnly, /Move/);
  assert.match(openOnly, /Mark Resolved/);
  assert.doesNotMatch(openOnly, /Reopen/);
  assert.match(openOnly, /Archive/);
  assert.doesNotMatch(openOnly, /Restore/);
});

test("tagTextColor selects readable foreground colors", () => {
  assert.equal(tagTextColor("#eeeeee"), "#1c1c17");
  assert.equal(tagTextColor("#1f6f5f"), "#fffdf7");
});

test("renderTag truncates long labels and preserves the full name as title", () => {
  const html = renderTag(
    { name: "very-long-tag-name-without-natural-breaks", color: "#eeeeee" },
    escapeHtml,
    { maxLength: 16 },
  );

  assert.match(html, /title="very-long-tag-name-without-natural-breaks"/);
  assert.ok(html.includes('<span class="visually-hidden">very-long-tag-name-without-natural-breaks</span>'));
  assert.ok(html.includes('<span aria-hidden="true">very-long-tag...</span>'));
  assert.match(html, /style="background:#eeeeee;color:#1c1c17"/);
});

test("renderTag keeps a title when the label fits", () => {
  const html = renderTag({ name: "short", color: null }, escapeHtml);

  assert.equal(html, '<span class="tag tag-no-color" title="short"><span class="visually-hidden">short</span><span aria-hidden="true">short</span></span>');
});

test("renderTag truncates by grapheme cluster", () => {
  const html = renderTag({ name: "🏷️🏷️🏷️🏷️🏷️", color: null }, escapeHtml, { maxLength: 4 });

  assert.equal(html, '<span class="tag tag-no-color" title="🏷️🏷️🏷️🏷️🏷️"><span class="visually-hidden">🏷️🏷️🏷️🏷️🏷️</span><span aria-hidden="true">🏷️...</span></span>');
});

test("formatTagLabel truncates labels without Intl.Segmenter", () => {
  const intlWithSegmenter = globalThis.Intl as typeof Intl & { Segmenter?: unknown };
  const originalSegmenter = intlWithSegmenter.Segmenter;
  try {
    Object.defineProperty(globalThis.Intl, "Segmenter", {
      configurable: true,
      value: undefined,
    });

    assert.deepEqual(formatTagLabel({ name: "👨‍👩‍👧‍👦family" }, { maxLength: 4 }), {
      name: "👨‍👩‍👧‍👦family",
      label: "👨‍👩‍👧‍👦...",
    });
    assert.deepEqual(formatTagLabel({ name: "🇯🇵🇺🇸flag" }, { maxLength: 4 }), {
      name: "🇯🇵🇺🇸flag",
      label: "🇯🇵...",
    });
  } finally {
    Object.defineProperty(globalThis.Intl, "Segmenter", {
      configurable: true,
      value: originalSegmenter,
    });
  }
});

test("formatTagLabel shares the truncation policy for custom tag controls", () => {
  assert.deepEqual(formatTagLabel({ name: "abcdefghijklmnopqrstuvwxyz" }, { maxLength: 10 }), {
    name: "abcdefghijklmnopqrstuvwxyz",
    label: "abcdefg...",
  });
});

test("renderTicketTagChip keeps the remove cue and full tag name", () => {
  const html = renderTicketTagChip(
    { id: 12, name: "very-long-tag-name-without-natural-breaks", color: null },
    escapeHtml,
  );

  assert.match(html, /title="Remove tag: very-long-tag-name-without-natural-breaks"/);
  assert.match(html, /aria-label="Remove tag: very-long-tag-name-without-natural-breaks"/);
  assert.ok(html.includes('<span class="ticket-tag-chip-text" aria-hidden="true">very-long-tag-name-withou...</span>'));
});

test("remote snapshot freshness marks old or unknown sync times as stale", () => {
  assert.deepEqual(
    getRemoteSnapshotFreshness(
      { lastSyncedAt: "2026-04-24T00:00:00.000Z", remoteUpdatedAt: "2026-04-23T00:00:00.000Z" },
      Date.parse("2026-04-24T12:00:00.000Z"),
    ),
    { isStale: false, message: "" },
  );
  assert.deepEqual(
    getRemoteSnapshotFreshness(
      { lastSyncedAt: "2026-04-23T00:00:00.000Z", remoteUpdatedAt: "2026-04-23T00:00:00.000Z" },
      Date.parse("2026-04-24T12:00:00.000Z"),
    ),
    { isStale: true, message: "Refresh recommended: last sync is over 24 hours old" },
  );
  assert.deepEqual(
    getRemoteSnapshotFreshness({ lastSyncedAt: null, remoteUpdatedAt: null }, Date.parse("2026-04-24T12:00:00.000Z")),
    { isStale: true, message: "Refresh recommended: last sync is unknown" },
  );
});

test("body diff rows compare remote and local markdown by line", () => {
  assert.deepEqual(
    buildBodyDiffRows("Shared\nRemote only\nTail", "Shared\nLocal only\nTail"),
    [
      { type: "same", marker: " ", text: "Shared" },
      { type: "remote", marker: "-", text: "Remote only" },
      { type: "local", marker: "+", text: "Local only" },
      { type: "same", marker: " ", text: "Tail" },
    ],
  );
});

test("body diff rows use bounded work for large markdown bodies", () => {
  const remote = Array.from({ length: 250 }, (_, index) => `remote ${index}`).join("\n");
  const local = Array.from({ length: 250 }, (_, index) => `local ${index}`).join("\n");
  const rows = buildBodyDiffRows(remote, local);

  assert.equal(rows.length, 500);
  assert.deepEqual(rows.slice(0, 2), [
    { type: "remote", marker: "-", text: "remote 0" },
    { type: "local", marker: "+", text: "local 0" },
  ]);
});

test("perf seed requires overwrite flag when board already exists", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("scripts/perf-seed.mjs", "utf8"));
  assert.match(source, /KANBALONE_PERF_OVERWRITE=true/);
});

test("perf seed creates editable HEX tag colors", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("scripts/perf-seed.mjs", "utf8"));

  assert.match(source, /function hslToHex/);
  assert.match(source, /color: tagColor\(index, TAG_COUNT\)/);
  assert.doesNotMatch(source, /color: `hsl/);
});

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

test("perf benchmark defaults to PATH agent-browser lookup", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("scripts/perf-benchmark.mjs", "utf8"));
  assert.match(source, /AGENT_BROWSER_BIN \?\? "agent-browser"/);
});
