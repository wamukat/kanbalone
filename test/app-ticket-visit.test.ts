import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { HTTPMethods } from "fastify";
import { buildApp } from "../src/app.js";
import { renderTicketVisit } from "../public/app-ticket-visit-renderer.js";

function requestWith(app: ReturnType<typeof buildApp>) {
  return async (method: HTTPMethods, url: string, status: number, payload?: unknown) => {
    const result = await app.inject({ method, url, payload });
    assert.equal(result.statusCode, status, `${method} ${url}: ${result.body}`);
    return result.body ? result.json() : null;
  };
}

test("visit snapshots pair state and committed operations, maintaining explicit ID intervals", async t => {
  const app = buildApp({ dbFile: ":memory:" });
  t.after(() => app.close());
  const request = requestWith(app);
  const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Snapshots", laneNames: ["Queued", "Review"] });
  const { id } = await request("POST", `/api/boards/${board.id}/tickets`, 201, { title: "Review", laneId: lanes[0].id, bodyMarkdown: "A" });
  const url = `/api/tickets/${id}`;
  const route = url + "/change-snapshot";
  const before = await request("GET", route, 200);
  const other = await request("POST", `/api/boards/${board.id}/tickets`, 201, { title: "Unrelated", laneId: lanes[0].id });
  await request("PATCH", `/api/tickets/${other.id}`, 200, { bodyMarkdown: "Elsewhere" });
  assert.deepEqual(await request("GET", route + "?metadataOnly=true", 200), { series: before.series, fingerprint: before.fingerprint });
  await request("PATCH", url, 200, { bodyMarkdown: "B" });
  await request("PATCH", url, 200, { bodyMarkdown: "A" });
  const after = await request("GET", route, 200);
  assert.deepEqual(after.state, before.state);
  assert.equal(after.stateFingerprint, before.stateFingerprint);
  assert.notEqual(after.fingerprint, before.fingerprint);
  assert.ok(after.revision > before.revision);
  assert.ok(after.activityThrough > before.activityThrough);
  const activityPath = `${url}/activity?compact=true&after=${before.activityThrough}&through=${after.activityThrough}`;
  await request("POST", url + "/comments", 201, { bodyMarkdown: "After the fixed endpoint", updater: "Ops" });
  const interval = await request("GET", activityPath, 200);
  assert.equal(interval.series, after.series);
  assert.equal(interval.historyPossiblyIncomplete, false);
  assert.equal(interval.activity.length, 2);
  assert.ok(interval.activity[0].id > interval.activity[1].id);
  const entry = await request("GET", url + "/activity/" + interval.activity[0].id + "?series=" + after.series, 200);
  assert.deepEqual(entry.details.changes.bodyMarkdown, { before: "B", after: "A" });
  await request("GET", url + "/activity?after=1", 400);
  await request("GET", url + "/activity?after=4&through=3", 400);
  await request("GET", url + "/activity/" + entry.id + "?series=foreign", 409);

  const latest = await request("GET", route, 200);
  assert.deepEqual(latest.state.comments.map(({ bodyMarkdown, updater }: { bodyMarkdown: string; updater: string }) => ({ bodyMarkdown, updater })),
    [{ bodyMarkdown: "After the fixed endpoint", updater: "Ops" }]);
  assert.equal((await app.inject(route)).headers["cache-control"], "no-store");
  assert.deepEqual(Object.keys(await request("GET", url + "/activity", 200)), ["activity"]);
});

test("restart keeps a comparison series while restore and physical copies invalidate it", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "kanbalone-visit-restore-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  mkdirSync(source);
  const dbFile = path.join(source, "kanbalone.sqlite");
  const original = buildApp({ dbFile });
  let route: string;
  let initial;
  try {
    const request = requestWith(original);
    const { board, lanes } = await request("POST", "/api/boards", 201, { name: "Restore history", laneNames: ["Work"] });
    const { id } = await request("POST", `/api/boards/${board.id}/tickets`, 201, { title: "Restore test", laneId: lanes[0].id, bodyMarkdown: "Saved text" });
    await request("POST", `/api/tickets/${id}/comments`, 201, { bodyMarkdown: "Saved comment" });
    route = `/api/tickets/${id}/change-snapshot`;
    initial = await request("GET", route, 200);
  } finally {
    await original.close();
  }

  const backup = path.join(root, "backup");
  const restored = path.join(root, "restored");
  const script = path.join(process.cwd(), "scripts/kanbalone-backup.mjs");
  execFileSync(process.execPath, [script, "backup", dbFile, backup]);
  execFileSync(process.execPath, [script, "restore", backup, restored]);
  const manualCopy = path.join(root, "copy");
  cpSync(source, manualCopy, { recursive: true });
  const read = async (directory: string) => {
    const app = buildApp({ dbFile: path.join(directory, "kanbalone.sqlite") });
    try {
      return await requestWith(app)("GET", route, 200);
    } finally {
      await app.close();
    }
  };
  assert.deepEqual(await read(source), initial);
  for (const directory of [restored, manualCopy]) {
    const actual = await read(directory);
    assert.notEqual(actual.series, initial.series);
    assert.deepEqual({ ...actual, series: initial.series }, initial);
    assert.deepEqual(await read(directory), actual);
  }
});

test("a tag color change is identifiable without relying on color perception", () => {
  const original = {
    bodyMarkdown: "", board: { id: 1, label: "Board" }, lane: { id: 1, label: "Review" }, group: null,
    tags: [{ id: 1, label: "Verified", color: "#536087" }], parent: null, children: [],
    blockers: [], blockedBy: [], related: [], comments: [], tasks: [],
  };
  const html = renderTicketVisit({
    kind: "ready",
    before: { state: original, seenAt: 11 },
    current: { state: { ...original, tags: [{ ...original.tags[0], color: "#116655" }] }, seenAt: 12 },
  }, (value: string) => value);
  assert.match(html, />#536087</);
  assert.match(html, />#116655</);
  assert.doesNotMatch(html, /No changes since last view/);
});
