import test from "node:test";
import assert from "node:assert/strict";

import { calculateVisibleWindow, takeRoundRobinBatch } from "../public/app-board-utils.js";
import { getListTickets, renderListActions } from "../public/app-board-list.js";
import { renderListRow } from "../public/app-board-list-row.js";
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

test("getListTickets sorts list rows by id tags and priority when requested", () => {
  const tickets = [
    { id: 7, priority: 2, parentTicketId: null, tags: [{ name: "release" }] },
    { id: 2, priority: 4, parentTicketId: null, tags: [{ name: "backend" }] },
    { id: 5, priority: 1, parentTicketId: null, tags: [] },
    { id: 3, priority: 3, parentTicketId: null, tags: [{ name: "Backend" }, { name: "urgent" }] },
    { id: 9, priority: 2, parentTicketId: null, tags: [{ name: "release" }] },
  ];

  assert.deepEqual(
    getListTickets(tickets, { key: "id", direction: "asc" }).map((entry) => entry.ticket.id),
    [2, 3, 5, 7, 9],
  );
  assert.deepEqual(
    getListTickets(tickets, { key: "id", direction: "desc" }).map((entry) => entry.ticket.id),
    [9, 7, 5, 3, 2],
  );
  assert.deepEqual(
    getListTickets(tickets, { key: "tags", direction: "asc" }).map((entry) => entry.ticket.id),
    [2, 3, 7, 9, 5],
  );
  assert.deepEqual(
    getListTickets(tickets, { key: "tags", direction: "desc" }).map((entry) => entry.ticket.id),
    [7, 9, 3, 2, 5],
  );
  assert.deepEqual(
    getListTickets(tickets, { key: "priority", direction: "asc" }).map((entry) => entry.ticket.id),
    [5, 7, 9, 3, 2],
  );
  assert.deepEqual(
    getListTickets(tickets, { key: "priority", direction: "desc" }).map((entry) => entry.ticket.id),
    [2, 3, 7, 9, 5],
  );
});

test("getListTickets flattens hierarchy while applying list sort", () => {
  const tickets = [
    { id: 10, priority: 1, parentTicketId: null, tags: [{ name: "z" }] },
    { id: 1, priority: 4, parentTicketId: 10, tags: [{ name: "a" }] },
    { id: 3, priority: 2, parentTicketId: null, tags: [{ name: "b" }] },
  ];

  assert.deepEqual(
    getListTickets(tickets, { key: "id", direction: "asc" }).map((entry) => [entry.ticket.id, entry.indent]),
    [
      [1, 0],
      [3, 0],
      [10, 0],
    ],
  );
  assert.deepEqual(
    getListTickets(tickets).map((entry) => [entry.ticket.id, entry.indent]),
    [
      [3, 0],
      [10, 0],
      [1, 1],
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
  assert.doesNotMatch(mixed, /Mark Resolved/);
  assert.doesNotMatch(mixed, /Reopen/);
  assert.match(mixed, /Archive/);
  assert.match(mixed, /Restore/);
  assert.match(mixed, /Delete/);

  const openOnly = renderListActions(tickets, [1]);
  assert.doesNotMatch(openOnly, />Move</);
  assert.doesNotMatch(openOnly, /Mark Resolved/);
  assert.doesNotMatch(openOnly, /Reopen/);
  assert.match(openOnly, /Archive/);
  assert.doesNotMatch(openOnly, /Restore/);
});

test("renderListRow places remote references after normal tags in the Tags column", () => {
  const html = renderListRow(
    {
      indent: 0,
      ticket: {
        id: 1,
        laneId: 2,
        parentTicketId: null,
        title: "Tracked ticket",
        blockerIds: [],
        relatedIds: [],
        tags: [{ name: "customer", color: "#1f6f5f" }],
        remote: {
          provider: "github",
          displayRef: "owner/repo#123",
          url: "https://github.com/owner/repo/issues/123",
        },
        externalReferences: [{
          provider: "github",
          displayRef: "source/repo#456",
          url: "https://github.com/source/repo/issues/456",
        }],
        priority: 3,
        isResolved: false,
        isArchived: false,
      },
    },
    {
      boardTickets: [],
      escapeHtml,
      lanes: [{ id: 2, name: "Todo" }],
      renderTicketStatusIcons: () => "",
      selectedTicketIds: [],
    },
  );

  const titleCell = html.slice(html.indexOf("list-ticket-title-cell"), html.indexOf("list-blocker-cell"));
  assert.doesNotMatch(titleCell, /owner\/repo#123/);
  assert.doesNotMatch(titleCell, /source\/repo#456/);

  const tagRowIndex = html.indexOf("list-tag-row");
  const remoteRowIndex = html.indexOf("list-remote-ref-row");
  assert.ok(tagRowIndex > -1);
  assert.ok(remoteRowIndex > tagRowIndex);
  assert.match(html, /customer/);
  assert.match(html, /list-ticket-remote-ref/);
  assert.match(html, /owner\/repo#123/);
  assert.match(html, /list-ticket-external-ref/);
  assert.match(html, /source\/repo#456/);
});

test("renderListRow gives unresolved references an accessible, non-interactive parenthesized ID", () => {
  const html = renderListRow({
    indent: 0,
    ticket: {
      id: 1, laneId: 2, title: "Dependent", blockerIds: [7, 10], relatedIds: [], tags: [],
      priority: 2, isResolved: false, isArchived: false,
      blockerReferences: [{ id: 7, title: '<Batch "seven">', isResolved: true, isArchived: true }],
    },
  }, {
    boardTickets: [], escapeHtml, lanes: [{ id: 2, name: "Todo" }],
    renderTicketStatusIcons: () => "", selectedTicketIds: [],
  });

  assert.match(html, /ticket-ref-resolved" data-open-ticket-id="7" title="&lt;Batch &quot;seven&quot;&gt; \(Resolved, Archived\)"/);
  assert.match(html, /class="list-blocker-unavailable" title="Blocker #10: status unavailable"/);
  assert.match(html, /<span aria-hidden="true">\(#10\)<\/span><span class="visually-hidden">Blocker #10: status unavailable<\/span>/);
  assert.doesNotMatch(html, /data-open-ticket-id="10"/);
});

test("renderListRow can hide hierarchy affordances for sorted list rows", () => {
  const html = renderListRow(
    {
      indent: 0,
      ticket: {
        id: 2,
        laneId: 2,
        parentTicketId: 1,
        title: "Child ticket",
        blockerIds: [],
        relatedIds: [],
        tags: [],
        priority: 2,
        isResolved: false,
        isArchived: false,
      },
    },
    {
      boardTickets: [{
        id: 1,
        laneId: 2,
        parentTicketId: null,
        title: "Parent ticket",
        isResolved: false,
      }],
      escapeHtml,
      lanes: [{ id: 2, name: "Todo" }],
      renderTicketStatusIcons: () => "",
      selectedTicketIds: [],
      showHierarchy: false,
    },
  );

  assert.doesNotMatch(html, /ticket-hierarchy-icon/);
  assert.doesNotMatch(html, /indent-1/);
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
