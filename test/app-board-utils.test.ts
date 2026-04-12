import test from "node:test";
import assert from "node:assert/strict";

import { calculateVisibleWindow, takeRoundRobinBatch } from "../public/app-board-utils.js";
import { tagTextColor } from "../public/app-tags.js";

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

test("tagTextColor selects readable foreground colors", () => {
  assert.equal(tagTextColor("#eeeeee"), "#1c1c17");
  assert.equal(tagTextColor("#1f6f5f"), "#fffdf7");
});

test("perf seed requires overwrite flag when board already exists", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("scripts/perf-seed.mjs", "utf8"));
  assert.match(source, /SOLOBOARD_PERF_OVERWRITE=true/);
});

test("perf benchmark defaults to PATH agent-browser lookup", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("scripts/perf-benchmark.mjs", "utf8"));
  assert.match(source, /AGENT_BROWSER_BIN \?\? "agent-browser"/);
});
