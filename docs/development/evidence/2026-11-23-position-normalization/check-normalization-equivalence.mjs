import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const output = resolve("coverage/subsecond-data");
const scratch = await mkdtemp(resolve(tmpdir(), "kanbalone-normalization-"));
const variants = process.argv.length > 2 ? ["control", ...process.argv.slice(2)] : ["control", "guard", "skip", "bulk"];
const results = {};
const baseTime = "2026-11-22T00:00:00.000Z";

function snapshot(sqlite) {
  const tickets = sqlite.prepare("SELECT * FROM tickets ORDER BY id").all().map(({ resolved_at, ...ticket }) => {
    if (resolved_at !== null) assert(Number.isFinite(Date.parse(resolved_at)));
    return { ...ticket, hasResolutionTime: resolved_at !== null };
  });
  const activities = sqlite.prepare("SELECT * FROM activity_logs ORDER BY id").all();
  const revisions = sqlite.prepare("SELECT board_id,revision FROM ticket_list_revisions ORDER BY board_id").all();
  const boards = sqlite.prepare("SELECT * FROM boards ORDER BY id").all();
  assert.equal(sqlite.pragma("quick_check", { simple: true }), "ok");
  assert.deepEqual(sqlite.pragma("foreign_key_check"), []);
  return { tickets, boards, revisions, activities };
}

async function sample(variant) {
  const source = resolve(output, "normalization-variants", variant);
  const file = resolve(scratch, variant + ".sqlite");
  const load = name => import(pathToFileURL(resolve(source, "src", name + ".ts")));
  const { KanbanDb } = await load("db");
  const { buildApp } = await load("app");
  const { normalizeVisibleAndArchivedTicketPositions } = await load("db-modules/ordering");
  const { bulkTransitionTickets, bulkArchiveTickets } = await load("db-modules/ticket-bulk-mutations");
  const db = new KanbanDb(file);
  let app;
  try {
    db.now = () => baseTime;
    const { board, lanes: [todo, review, done] } = db.createBoard({ name: "Normalization fixtures", laneNames: ["Work", "Review", "Done"] });
    const { board: secondBoard, lanes: [otherLane] } = db.createBoard({ name: "Other board", laneNames: ["Work"] });
    const { board: untouchedBoard, lanes: [untouchedLane] } = db.createBoard({ name: "Unchanged board", laneNames: ["Work"] });
    db.sqlite.prepare("UPDATE lanes SET is_completion_lane=1 WHERE id=?").run(done.id);
    const seed = (boardId, lane, count) => Array.from({ length: count }, (_, position) => db.createTicket({
      boardId, laneId: lane.id, title: lane.name + " fixture " + position, isArchived: position >= count - 2,
    }).id);
    const todoIds = seed(board.id, todo, 7);
    const reviewIds = seed(board.id, review, 7);
    seed(board.id, done, 5);
    seed(secondBoard.id, otherLane, 7);
    seed(untouchedBoard.id, untouchedLane, 5);
    db.sqlite.prepare("UPDATE ticket_cursor_secret SET secret=? WHERE id=1").run("ad".repeat(32));

    const normalize = lane => normalizeVisibleAndArchivedTicketPositions(db.sqlite, lane.id);
    const setPosition = db.sqlite.prepare("UPDATE tickets SET position=? WHERE id=?");
    const cases = [
      ["canonical lane has no position changes", () => normalize(todo), []],
      ["canonicalize duplicate, sparse, negative and archived positions", () => db.sqlite.transaction(() => {
        setPosition.run(-7, todoIds[1]);
        setPosition.run(-7, todoIds[2]);
        setPosition.run(999, todoIds[3]);
        setPosition.run(0, todoIds[5]);
        normalize(todo);
      }).immediate(), [todo.id]],
      ["adjacent active drag", () => db.positionTicket(todoIds[1], { laneId: todo.id, afterTicketId: todoIds[2] }), [todo.id]],
      ["archived drag to active start keeps archive order after active tickets", () => db.positionTicket(todoIds[6], {
        laneId: todo.id, beforeTicketId: todoIds[0],
      }), [todo.id]],
      ["move across ordinary lanes", () => db.positionTicket(todoIds[3], { laneId: review.id, beforeTicketId: reviewIds[0] }), [todo.id, review.id]],
      ["move into a completion lane", () => {
        db.positionTicket(todoIds[4], { laneId: done.id, position: 0 });
        const completed = db.getTicket(todoIds[4]);
        assert.equal(completed.isResolved, true);
        assert(completed.resolvedAt);
      }, [todo.id, done.id]],
      ["archive and restore", () => {
        db.updateTicket(todoIds[0], { isArchived: true });
        db.updateTicket(todoIds[5], { isArchived: false });
      }, [todo.id]],
      ["edit lane", () => db.updateTicket(reviewIds[1], { laneId: todo.id }), [todo.id, review.id]],
      ["bulk move to another board", () => db.bulkMoveTickets({
        sourceBoardId: board.id, boardId: secondBoard.id, laneId: otherLane.id,
        ticketIds: [todoIds[0], reviewIds[4]],
      }), [todo.id, review.id, otherLane.id]],
      ["single move to another board", () => db.moveTicket(reviewIds[0], { boardId: secondBoard.id, laneId: otherLane.id }), [review.id, otherLane.id]],
      ["bulk archive multiple lanes", () => bulkArchiveTickets(db.sqlite, {
        boardId: board.id, isArchived: true, ticketIds: [todoIds[5], reviewIds[2]],
      }, db.now), [todo.id, review.id]],
      ["bulk completion transition", () => bulkTransitionTickets(db.sqlite, {
        boardId: board.id, laneName: done.name, ticketIds: [todoIds[1], reviewIds[5]],
      }, db.now), [todo.id, review.id, done.id]],
      ["delete ticket", () => db.deleteTicket(reviewIds[3]), [review.id]],
    ];
    app = buildApp({ dbFile: file, staticDir: resolve(source, "public"), remoteCredentialProviders: [], remoteCredentialScopes: [] });
    await app.ready();
    const result = [];
    const allBoards = [board, secondBoard, untouchedBoard];
    for (const [index, [name, action, normalizedLanes]] of cases.entries()) {
      db.now = () => "2026-11-23T00:00:" + String(index).padStart(2, "0") + ".000Z";
      const before = snapshot(db.sqlite);
      const requests = await Promise.all(allBoards.map(async ({ id }) => {
        const startUrl = "/api/boards/" + id + "/tickets?order=position_asc&archived=all&limit=1";
        const response = await app.inject(startUrl);
        assert.equal(response.statusCode, 200, response.body);
        assert(response.json().page.nextCursor);
        return startUrl + "&cursor=" + encodeURIComponent(response.json().page.nextCursor);
      }));
      action();
      const after = snapshot(db.sqlite);
      const deltas = after.revisions.map(({ revision }, i) => revision - before.revisions[i].revision);
      assert.equal(deltas[2], 0, name);
      for (const lane of new Set(normalizedLanes)) {
        const positions = db.sqlite.prepare("SELECT position FROM tickets WHERE lane_id=? ORDER BY is_archived, position, id").all(lane);
        assert.deepEqual(positions.map(row => row.position), positions.map((_, index) => index), name);
      }
      const cursorResponses = await Promise.all(requests.map(async (request, i) => {
        const response = await app.inject(request);
        assert.equal(response.statusCode, deltas[i] ? 409 : 200, name);
        return response.statusCode;
      }));
      result.push({ name, deltas, cursorResponses, after });
    }
    return result;
  } finally {
    if (app) await app.close();
    db.close();
  }
}

try {
  for (const variant of variants) {
    results[variant] = await sample(variant);
    assert.deepEqual(results[variant], results.control);
    console.log(variant, results[variant].length, "cases match every stored field, revision delta and cursor outcome");
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
  await writeFile(resolve(output, "normalization-equivalence.json"), JSON.stringify(results, null, 2) + "\n");
}
