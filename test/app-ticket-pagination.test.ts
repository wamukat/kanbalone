import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import path from "node:path";
import { buildApp } from "../src/app.js";
import { migrateTicketPagination } from "../src/db-modules/ticket-pagination-revision.js";
import type { PageOptions } from "../src/db-modules/ticket-pagination.js";
import { KanbanDb } from "../src/db.js";
import type { TicketRelationCandidateView, TicketSummaryView } from "../src/types.js";
import { createDbFile } from "./app-test-helpers.js";

function setup() {
  const file = createDbFile();
  const db = new KanbanDb(file);
  const board = db.createBoard({ name: "Paged", laneNames: ["Todo", "Done"] });
  const other = db.createBoard({ name: "Other", laneNames: ["Todo"] });
  db.sqlite.prepare("UPDATE lanes SET is_completion_lane=1 WHERE id=?").run(board.lanes[1]!.id);
  const ids: number[] = [];
  for (let i = 0; i < 65; i++) {
    const t = db.createTicket({ boardId: board.board.id, laneId: board.lanes[i % 2]!.id, title: `Ticket ${i} needle`, priority: (i % 4 + 1) as 1 | 2 | 3 | 4 });
    ids.push(t.id);
  }
  // Equal timestamps/positions exercise deterministic final ID ties.
  db.sqlite.prepare("UPDATE tickets SET resolved_at='2026-11-22T00:00:00.123Z',position=2 WHERE lane_id=?").run(board.lanes[1]!.id);
  db.sqlite.prepare("UPDATE tickets SET is_archived=1 WHERE id=?").run(ids[64]!);
  const app = buildApp({ dbFile: file, staticDir: path.join(process.cwd(), "public") });
  const url = `/api/boards/${board.board.id}/tickets`;
  return { file, db, board, other, ids, app, url };
}

test("ticket paging preserves legacy response and traverses every deterministic order with changing sizes", async () => {
  const f = setup();
  try {
    const legacyResponse = await f.app.inject(f.url);
    assert.equal(legacyResponse.headers["x-kanbalone-ticket-revision"], undefined);
    const legacy = legacyResponse.json();
    assert.deepEqual(Object.keys(legacy), ["tickets"]);
    assert.equal(legacy.tickets.length, 64);
    assert.deepEqual(legacy.tickets.map((t: {id:number}) => t.id), f.db.listTicketSummaries(f.board.board.id).map(t => t.id));
    for (const order of ["id_asc", "position_asc", "completed_desc"]) {
      const expected = (await f.app.inject(`${f.url}?order=${order}&archived=all`)).json();
      assert.equal(expected.page, undefined);
      const firstResponse = await f.app.inject(`${f.url}?order=${order}&archived=all&limit=5`);
      const revision = firstResponse.headers["x-kanbalone-ticket-revision"];
      assert.match(String(revision), /^\d+$/);
      let response = firstResponse.json();
      assert.deepEqual(Object.keys(response).sort(), ["page", "tickets"]);
      assert.equal(response.page.total, 65);
      assert.equal(response.tickets.length, 5);
      assert.equal(response.page.hasMore, undefined);
      const found = [...response.tickets];
      while (response.page.nextCursor) {
        const nextResponse = await f.app.inject(`${f.url}?order=${order}&archived=all&limit=50&cursor=${response.page.nextCursor}`);
        assert.equal(nextResponse.headers["x-kanbalone-ticket-revision"],revision);
        response = nextResponse.json();
        assert.equal(response.page.total, 65);
        found.push(...response.tickets);
      }
      assert.deepEqual(found, expected.tickets);
      assert.equal(new Set(found.map(t => t.id)).size, 65);
    }
    const historical = [null, "invalid", "1970-01-01T00:00:00.000Z", "2026-11-22T00:00:00.124Z", "2026-11-22T00:00:00.123Z", "2026-11-21T19:00:00.123-05:00"];
    historical.forEach((date,i) => f.db.sqlite.prepare("UPDATE tickets SET resolved_at=? WHERE id=?").run(date,f.ids[i*2+1]!));
    const expectedDone = f.db.listTicketSummaries(f.board.board.id, { laneId: f.board.lanes[1]!.id }).sort((a,b) => (Date.parse(b.resolvedAt!) || 0) - (Date.parse(a.resolvedAt!) || 0) || a.position-b.position || b.id-a.id);
    const actualDone = (await f.app.inject(`${f.url}?lane_id=${f.board.lanes[1]!.id}&order=completed_desc&limit=200`)).json();
    assert.deepEqual(actualDone.tickets.map((t:{id:number}) => t.id), expectedDone.map(t => t.id));
    let piece=(await f.app.inject(`${f.url}?lane_id=${f.board.lanes[1]!.id}&order=completed_desc&limit=1`)).json();
    const historicalIds=piece.tickets.map((t:{id:number})=>t.id);
    while(piece.page.nextCursor){
      piece=(await f.app.inject(`${f.url}?lane_id=${f.board.lanes[1]!.id}&order=completed_desc&limit=1&cursor=${piece.page.nextCursor}`)).json();
      historicalIds.push(...piece.tickets.map((t:{id:number})=>t.id));
    }
    assert.deepEqual(historicalIds,expectedDone.map(t=>t.id));
    const empty = (await f.app.inject(`${f.url}?q=not-found&limit=200`)).json();
    assert.deepEqual(empty, { tickets: [], page: { nextCursor: null, total: 0 } });
    assert.equal((await f.app.inject(`${f.url}?limit=200`)).json().page.nextCursor, null);
  } finally { await f.app.close(); f.db.close(); }
});

test("paging filters run before LIMIT and normalized conditions bind the cursor", async () => {
  const f = setup();
  try {
    const tag = f.db.createTag({boardId: f.board.board.id, name:"test",color:"#112233"});
    for (const id of f.ids.slice(0,20)) f.db.sqlite.prepare("INSERT INTO ticket_tags VALUES(?,?)").run(id,tag.id);
    const group = f.db.createGroup({boardId:f.board.board.id,name:"Group"});
    f.db.sqlite.prepare("UPDATE tickets SET group_id=? WHERE id IN (?,?)").run(group.id,f.ids[0]!,f.ids[4]!);
    f.db.sqlite.prepare("UPDATE tickets SET parent_ticket_id=? WHERE id=?").run(f.ids[0]!, f.ids[4]!);
    const combinations = ["priority=1,3", "tag=test", "q=needle", "resolved=true", "archived=true", "includeArchived=true", `lane_id=${f.board.lanes[0]!.id}`, "lane=Todo", "parent=none", `parent=${f.ids[0]}`, `groupId=${group.id}`, "ungrouped=true", "priority=1,3&tag=test&resolved=false&q=needle"];
    for (const filter of combinations) {
      const expected = (await f.app.inject(`${f.url}?${filter}&order=id_asc`)).json().tickets;
      let response = (await f.app.inject(`${f.url}?${filter}&limit=1`)).json();
      assert.equal(response.page.total, expected.length, filter);
      const found = [...response.tickets];
      while (response.page.nextCursor) {
        response = (await f.app.inject(`${f.url}?${filter}&limit=7&cursor=${response.page.nextCursor}`)).json();
        found.push(...response.tickets);
      }
      assert.deepEqual(found, expected, filter);
    }
    const allPriorities = (await f.app.inject(`${f.url}?priority=4,2,1,3&limit=1`)).json();
    assert.equal((await f.app.inject(`${f.url}?limit=3&cursor=${allPriorities.page.nextCursor}`)).statusCode,200);
    const first = (await f.app.inject(`${f.url}?priority=3,1,3&limit=1`)).json();
    assert.equal((await f.app.inject(`${f.url}?priority=1,3&limit=3&cursor=${first.page.nextCursor}`)).statusCode,200);
    for (const suffix of ["priority=2", "q=another", "order=completed_desc", "archived=all"]) {
      assert.equal((await f.app.inject(`${f.url}?${suffix}&limit=1&cursor=${first.page.nextCursor}`)).statusCode,400,suffix);
    }
    assert.equal((await f.app.inject(`/api/boards/${f.other.board.id}/tickets?limit=1&cursor=${first.page.nextCursor}`)).statusCode,400);
    for (const query of ["limit=0","limit=201","limit=-1","limit=1.5","limit=no","cursor=x","limit=1&cursor=x","order=bad","priority=0","priority=1,5","priority=1,","priority="]) {
      assert.equal((await f.app.inject(`${f.url}?${query}`)).statusCode,400,query);
    }
    const altered = first.page.nextCursor.slice(0,-1) + (first.page.nextCursor.endsWith("A") ? "B" : "A");
    assert.equal((await f.app.inject(`${f.url}?limit=1&priority=1,3&cursor=${altered}`)).statusCode,400);
  } finally { await f.app.close(); f.db.close(); }
});

test("Group pages keep archived context, child, tag and Task metadata while isolating their cursor", async () => {
  const f = setup();
  try {
    const boardId = f.board.board.id;
    const base = `/api/boards/${boardId}`;
    const group = f.db.createGroup({ boardId, name: "Group" });
    const parent = f.ids[64]!;
    const child = f.ids[1]!;
    f.db.sqlite.prepare("UPDATE tickets SET group_id = ? WHERE id IN (?, ?)").run(group.id, parent, child);
    f.db.sqlite.prepare("UPDATE tickets SET parent_ticket_id = ? WHERE id = ?").run(parent, child);
    const last = f.db.createTag({ boardId, name: "Zulu", color: "" });
    const first = f.db.createTag({ boardId, name: "Alpha", color: "#123456" });
    for (const tag of [last, first]) {
      f.db.sqlite.prepare("INSERT INTO ticket_tags VALUES (?, ?)").run(parent, tag.id);
    }
    for (const done of [false, true]) {
      const task = await f.app.inject({ method: "POST", url: `/api/tickets/${parent}/tasks`, payload: { bodyMarkdown: "Example Task", done } });
      assert.equal(task.statusCode, 201);
    }

    const url = `${base}/group-tickets?groupId=${group.id}&limit=1`;
    const response = await f.app.inject(url);
    assert.equal(response.statusCode, 200);
    const revision = response.headers["x-kanbalone-ticket-revision"];
    assert.match(String(revision), /^\d+$/);
    const result = response.json();
    assert.equal(result.page.total, 2);
    const cursor = encodeURIComponent(result.page.nextCursor);
    const next = await f.app.inject(`${url}&cursor=${cursor}`);
    assert.equal(next.headers["x-kanbalone-ticket-revision"], revision);
    const full = (await f.app.inject(`${f.url}?groupId=${group.id}&archived=all&order=id_asc`)).json();
    const expected = full.tickets.map(({ id, title, laneId, parentTicketId, isResolved, isArchived, hasChildren, priority, taskCount, doneTaskCount, tags }: TicketSummaryView) => ({
      id, title, laneId, parentTicketId, isResolved, isArchived, hasChildren, priority, taskCount, doneTaskCount,
      tags: tags.map(({ id, name, color }) => ({ id, name, color })),
    }));
    assert.deepEqual([...result.tickets, ...next.json().tickets], expected);
    assert.equal(expected[1].isArchived, true);
    assert.equal(expected[1].hasChildren, true);
    assert.equal(expected[1].taskCount, 2);
    assert.equal(expected[1].doneTaskCount, 1);
    assert.equal(expected[0].taskCount, 0);
    assert.deepEqual(expected[1].tags.map((tag: { name: string }) => tag.name), ["Alpha", "Zulu"]);
    const ungrouped = (await f.app.inject(`${base}/group-tickets?limit=1`)).json();
    assert.equal(ungrouped.page.total, 63);
    assert.equal((await f.app.inject(`${base}/group-tickets?limit=1&cursor=${cursor}`)).statusCode, 400);
    assert.equal((await f.app.inject(`${f.url}?groupId=${group.id}&archived=all&order=id_asc&limit=1&cursor=${cursor}`)).statusCode, 400);
    assert.equal((await f.app.inject(`/api/boards/${f.other.board.id}/group-tickets?groupId=${group.id}&limit=1`)).statusCode, 404);
    assert.equal((await f.app.inject(`${url}&archived=false`)).statusCode, 400);

    f.db.sqlite.prepare("UPDATE tags SET name = ? WHERE id = ?").run("Changed", first.id);
    assert.equal((await f.app.inject(`${url}&cursor=${cursor}`)).statusCode, 409);
  } finally { await f.app.close(); f.db.close(); }
});

test("position pages cross equal positions, lane and archive boundaries, and safe integer keys", async () => {
  const f = setup();
  try {
    const positions = [-1, 0, 0, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER, 0, 0, Number.MAX_SAFE_INTEGER];
    const patch = f.db.sqlite.prepare("UPDATE tickets SET title=?, position=?, is_archived=?, resolved_at=NULL WHERE id=?");
    const selected = [0, 2, 4, 6, 8, 1, 3, 5];
    selected.forEach((ticketIndex, i) => {
      patch.run(`Seek boundary ${i}`, positions[i]!, Number(i === 5 || i === 6), f.ids[ticketIndex]!);
    });
    const filters: Array<Record<string, string>> = [
      { archived: "all" },
      { archived: "false", lane_id: String(f.board.lanes[0]!.id) },
      { archived: "true", lane_id: String(f.board.lanes[1]!.id) },
      { archived: "all", lane: f.board.lanes[0]!.name },
    ];
    for (const filter of filters) {
      const query = new URLSearchParams({ q: "Seek boundary", order: "position_asc", ...filter });
      const expected = (await f.app.inject(f.url + "?" + query)).json().tickets;
      assert.ok(expected.length > 1);
      query.set("limit", "1");
      const tickets: TicketSummaryView[] = [];
      for (let page = 0; ; page += 1) {
        assert.ok(page < expected.length);
        const response = await f.app.inject(f.url + "?" + query);
        assert.equal(response.statusCode, 200);
        const result = response.json();
        tickets.push(...result.tickets);
        assert.equal(result.page.total, expected.length);
        if (!result.page.nextCursor) break;
        query.set("cursor", result.page.nextCursor);
      }
      assert.deepEqual(tickets, expected);
    }
  } finally { await f.app.close(); f.db.close(); }
});

test("List references keep position order and the priority-independent filter intersection", async () => {
  const f = setup();
  try {
    const boardId = f.board.board.id;
    const tag = f.db.createTag({ boardId, name: "filter", color: "" });
    const ids = [f.ids[2]!, f.ids[4]!, f.ids[64]!];
    for (const id of ids) {
      f.db.sqlite.prepare("INSERT INTO ticket_tags VALUES (?, ?)").run(id, tag.id);
      f.db.sqlite.prepare("UPDATE tickets SET body_markdown = ? WHERE id = ?").run("body search", id);
    }
    f.db.sqlite.prepare("UPDATE tickets SET position = 0 WHERE id = ?").run(ids[1]);
    const query = `archived=all&tag=filter&q=body+search&resolved=false&lane_id=${f.board.lanes[0]!.id}`;
    const url = `/api/boards/${boardId}/list-ticket-references?${query}&limit=1`;
    const full = (await f.app.inject(`${f.url}?${query}&order=position_asc`)).json();
    const expected = full.tickets.map(({ id, title, laneId, parentTicketId, isResolved }: TicketSummaryView) => ({
      id, title, laneId, parentTicketId, isResolved,
    }));
    assert(expected.length > 1);
    const reference = await f.app.inject(url);
    assert.equal(reference.statusCode, 200);
    const { tickets, page } = reference.json();
    const legacy = await f.app.inject(`${f.url}?${query}&limit=1&order=position_asc`);
    assert.equal(reference.headers["x-kanbalone-ticket-revision"], legacy.headers["x-kanbalone-ticket-revision"]);
    assert.equal(page.total, expected.length);
    const cursor = encodeURIComponent(page.nextCursor);
    const rest = await f.app.inject(`${url.replace("limit=1", "limit=5")}&cursor=${cursor}`);
    assert.deepEqual([...tickets, ...rest.json().tickets], expected);
    assert.equal((await f.app.inject(`${url}&cursor=${legacy.json().page.nextCursor}`)).statusCode, 400);
    assert.equal((await f.app.inject(`${url}&priority=4`)).statusCode, 400);
    assert.equal((await f.app.inject(`${url.replace("q=body+search", "q=other")}&cursor=${cursor}`)).statusCode, 400);
  } finally { await f.app.close(); f.db.close(); }
});

test("optional blocker references follow paged tickets independently of display filters", async () => {
  const f = setup();
  try {
    const boardId = f.board.board.id;
    const [todo, done] = f.board.lanes;
    const dependencies = f.db.createLane({ boardId, name: "Dependencies" });
    const tag = f.db.createTag({ boardId, name: "Dependent", color: "" });
    const open = f.db.createTicket({ boardId, laneId: dependencies.id, title: "Open dependency" });
    const archived = f.db.createTicket({ boardId, laneId: done!.id, title: "Archived dependency", isArchived: true });
    const createTarget = (title: string, blockerIds: number[]) => f.db.createTicket({
      boardId, laneId: todo!.id, title, blockerIds, tagIds: [tag.id],
    });
    const first = createTarget("Affected first", [archived.id, open.id]);
    const next = createTarget("Affected next", [open.id]);
    const independent = createTarget("Affected independent", []);
    const url = `${f.url}?q=Affected&lane_ids=${todo!.id}&tag_ids=${tag.id}&archived=false&limit=1`;
    const optIn = `${url}&include_blocker_references=true`;
    const legacy = await f.app.inject(url);
    const response = await f.app.inject(optIn);
    assert.equal(response.statusCode, 200, response.body);
    const { page, tickets } = response.json();
    assert.deepEqual(page, legacy.json().page);
    assert.equal(page.total, 3);
    assert.equal(response.headers["x-kanbalone-ticket-revision"], legacy.headers["x-kanbalone-ticket-revision"]);
    const { blockerReferences, ...summary } = tickets[0];
    assert.deepEqual([summary], legacy.json().tickets);
    assert.equal(summary.id, first.id);
    assert.deepEqual(summary.blockerIds, [open.id, archived.id]);
    assert.deepEqual(blockerReferences, [
      { id: open.id, title: open.title, isResolved: false, isArchived: false },
      { id: archived.id, title: archived.title, isResolved: true, isArchived: true },
    ]);

    const continuation = `${optIn.replace("limit=1", "limit=2")}&cursor=${encodeURIComponent(page.nextCursor)}`;
    const rest = await f.app.inject(continuation);
    assert.equal(rest.statusCode, 200, rest.body);
    assert.deepEqual(rest.json().tickets.map((ticket: TicketSummaryView) => [ticket.id, ticket.blockerReferences]), [
      [next.id, [blockerReferences[0]]], [independent.id, []],
    ]);
    assert.deepEqual((await f.app.inject(`${url}&include_blocker_references=false`)).json(), legacy.json());
    assert.equal((await f.app.inject(`${f.url}?include_blocker_references=true`)).statusCode, 400);
    assert.equal((await f.app.inject(`${url}&include_blocker_references=invalid`)).statusCode, 400);

    f.db.updateTicket(open.id, { laneId: done!.id, title: "Completed dependency" });
    assert.equal((await f.app.inject(continuation)).statusCode, 409);
    const refreshed = (await f.app.inject(optIn)).json().tickets[0];
    assert.deepEqual(refreshed.blockerReferences[0], {
      id: open.id, title: "Completed dependency", isResolved: true, isArchived: false,
    });
  } finally { await f.app.close(); f.db.close(); }
});

test("optional blocker references preserve IDs whose target is unavailable", async () => {
  const f = setup();
  try {
    const missingId = 999;
    f.db.sqlite.pragma("foreign_keys = OFF");
    try {
      f.db.sqlite.prepare("INSERT INTO ticket_blockers VALUES (?, ?)").run(f.ids[0], missingId);
    } finally {
      f.db.sqlite.pragma("foreign_keys = ON");
    }
    const response = await f.app.inject(`${f.url}?limit=1&include_blocker_references=true`);
    assert.equal(response.statusCode, 200, response.body);
    const [summary] = response.json().tickets;
    assert.equal(summary.id, f.ids[0]);
    assert.deepEqual(summary.blockerIds, [missingId]);
    assert.deepEqual(summary.blockerReferences, []);
  } finally { await f.app.close(); f.db.close(); }
});

test("lane and tag selections filter summaries and List references before counting and paging", async () => {
  const f = setup();
  try {
    const boardId = f.board.board.id;
    const [todo, done] = f.board.lanes;
    const excluded = f.db.createLane({ boardId, name: "Excluded" });
    const namedTag = f.db.createTag({ boardId, name: "Release, weekly & urgent", color: "" });
    const secondTag = f.db.createTag({ boardId, name: "Build", color: "" });
    const otherTag = f.db.createTag({ boardId, name: "Unrelated", color: "" });
    const foreignTag = f.db.createTag({ boardId: f.other.board.id, name: namedTag.name, color: "" });
    const create = (laneId: number, title: string, tagIds: number[], priority: 2 | 4 = 2, isArchived = false) =>
      f.db.createTicket({ boardId, laneId, title, tagIds, priority, isArchived }).id;
    const first = create(todo!.id, "Selection first", [namedTag.id], 4);
    const both = create(todo!.id, "Selection both tags", [namedTag.id, secondTag.id]);
    const secondLane = create(done!.id, "Selection second lane", [secondTag.id], 4);
    const otherLane = create(excluded.id, "Selection other lane", [namedTag.id]);
    const unrelated = create(todo!.id, "Selection unrelated tag", [otherTag.id]);
    const untagged = create(todo!.id, "Selection untagged", []);
    const archived = create(todo!.id, "Selection archived", [secondTag.id], 2, true);
    create(done!.id, "Different search", [namedTag.id]);

    const baseQuery = { order: "position_asc", q: "Selection" };
    const lane_ids = `${todo!.id},${done!.id}`;
    const tag_ids = `${namedTag.id},${secondTag.id}`;
    const ids = (rows: Array<{ id: number }>) => rows.map(({ id }) => id);
    const references = `/api/boards/${boardId}/list-ticket-references`;
    const summary = async (filters: Record<string, string>) => {
      const result = await f.app.inject(`${f.url}?${new URLSearchParams({ ...baseQuery, ...filters })}`);
      assert.equal(result.statusCode, 200, result.body);
      return ids(result.json().tickets);
    };

    assert.deepEqual(await summary({}), [first, both, unrelated, untagged, secondLane, otherLane]);
    assert.deepEqual(await summary({ lane_ids }), [first, both, unrelated, untagged, secondLane]);
    assert.deepEqual(await summary({ tag_ids }), [first, both, secondLane, otherLane]);
    assert.deepEqual(await summary({ lane_ids, tag_ids }), [first, both, secondLane]);
    assert.deepEqual(await summary({ lane_ids, tag_ids, archived: "all", priority: "4" }), [first, secondLane]);
    assert.deepEqual(await summary({ lane_id: String(todo!.id), tag_ids }), [first, both]);
    assert.deepEqual(await summary({ lane: todo!.name, tag: namedTag.name }), [first, both]);
    assert.deepEqual(await summary({ lane_id: String(todo!.id), tag: namedTag.name }), [first, both]);
    assert.deepEqual(await summary({ tag_ids: `${tag_ids},${foreignTag.id},${Number.MAX_SAFE_INTEGER}` }), [first, both, secondLane, otherLane]);
    assert.deepEqual(await summary({ lane_ids: `${f.other.lanes[0]!.id},${Number.MAX_SAFE_INTEGER}` }), []);
    assert.deepEqual(await summary({ tag_ids: `${foreignTag.id},${Number.MAX_SAFE_INTEGER}` }), []);

    const expected = [first, both, archived, secondLane];
    const continuations: string[] = [];
    for (const endpoint of [f.url, references]) {
      const query = new URLSearchParams({ ...baseQuery, lane_ids, tag_ids, archived: "all", limit: "1" });
      const found: number[] = [];
      for (let index = 0; index < expected.length; index++) {
        const response = await f.app.inject(`${endpoint}?${query}`);
        assert.equal(response.statusCode, 200, response.body);
        const { tickets, page } = response.json();
        assert.equal(page.total, expected.length);
        assert.equal(tickets.length, 1);
        found.push(tickets[0].id);
        if (index === expected.length - 1) {
          assert.equal(page.nextCursor, null);
          break;
        }
        assert.ok(page.nextCursor);
        query.set("cursor", page.nextCursor);
        if (index === 0) {
          const changed = new URLSearchParams(query);
          changed.set("tag_ids", String(namedTag.id));
          assert.equal((await f.app.inject(`${endpoint}?${changed}`)).statusCode, 400);
          query.set("lane_ids", `${done!.id},${todo!.id},${done!.id}`);
          query.set("tag_ids", `${secondTag.id},${namedTag.id},${secondTag.id}`);
          continuations.push(`${endpoint}?${query}`);
        }
      }
      assert.deepEqual(found, expected);
    }
    const legacyReferences = await f.app.inject(`${references}?${new URLSearchParams({ ...baseQuery,
      lane_id: String(todo!.id), tag: namedTag.name, limit: "10" })}`);
    assert.equal(legacyReferences.statusCode, 200, legacyReferences.body);
    assert.deepEqual(ids(legacyReferences.json().tickets), [first, both]);

    f.db.updateTicket(both, { tagIds: [] });
    for (const continuation of continuations) assert.equal((await f.app.inject(continuation)).statusCode, 409);
  } finally { await f.app.close(); f.db.close(); }
});

test("ticket ID selection parameters reject malformed lists and same-field scalar combinations", async () => {
  const f = setup();
  try {
    const references = `/api/boards/${f.board.board.id}/list-ticket-references`;
    for (const endpoint of [f.url, references]) {
      for (const field of ["lane_ids", "tag_ids"]) {
        for (const value of ["", "0", "1,-2", "1.5", "01", "1,", "1,,2", "1, 2", "1e2", "9007199254740992"]) {
          const query = new URLSearchParams({ limit: "1", [field]: value });
          const response = await f.app.inject(`${endpoint}?${query}`);
          assert.equal(response.statusCode, 400, `${endpoint} ${field}=${value}`);
        }
        const repeated = await f.app.inject(`${endpoint}?limit=1&${field}=1&${field}=2`);
        assert.equal(repeated.statusCode, 400);
      }
      for (const query of ["lane_id=1&lane_ids=2", "tag=Build&tag_ids=1"]) {
        assert.equal((await f.app.inject(`${endpoint}?limit=1&${query}`)).statusCode, 400, query);
      }
    }
    assert.equal((await f.app.inject(`${f.url}?lane=Todo&lane_ids=1`)).statusCode, 400);
    assert.equal((await f.app.inject(`${f.url}?lane=Todo&lane_id=1`)).json().error, "lane and lane_id cannot be combined");
  } finally { await f.app.close(); f.db.close(); }
});

test("only Group and List-reference endpoints advertise and accept a larger page limit", async () => {
  const f = setup();
  try {
    const base = `/api/boards/${f.board.board.id}`;
    for (const projection of ["group-tickets", "list-ticket-references"]) {
      const first = await f.app.inject(`${base}/${projection}?limit=1`);
      assert.equal(first.statusCode, 200);
      assert.equal(first.headers["x-kanbalone-ticket-page-limit"], "800");
      const cursor = encodeURIComponent(first.json().page.nextCursor);
      const continued = await f.app.inject(`${base}/${projection}?limit=800&cursor=${cursor}`);
      assert.equal(continued.statusCode, 200);
      assert.equal(continued.headers["x-kanbalone-ticket-page-limit"], "800");
      assert.equal(continued.json().page.total, first.json().page.total);
      assert.equal(continued.json().tickets.length, continued.json().page.total - 1);
      assert.equal((await f.app.inject(`${base}/${projection}?limit=801`)).statusCode, 400);
    }
    for (const standard of ["tickets", "relation-candidates"]) {
      const normal = await f.app.inject(`${base}/${standard}?limit=200`);
      assert.equal(normal.statusCode, 200);
      assert.equal(normal.headers["x-kanbalone-ticket-page-limit"], undefined);
      assert.equal((await f.app.inject(`${base}/${standard}?limit=201`)).statusCode, 400);
    }
  } finally { await f.app.close(); f.db.close(); }
});

test("cursor revisions cover joins, moves, cascades, completion, and referenced boards", async () => {
  const f = setup();
  try {
    const external = f.db.createTicket({boardId:f.other.board.id,laneId:f.other.lanes[0]!.id,title:"Dependency"});
    const tag = f.db.createTag({boardId:f.board.board.id,name:"tag",color:"#112233"});
    const group = f.db.createGroup({boardId:f.board.board.id,name:"group"});
    async function cursor() { return (await f.app.inject(`${f.url}?limit=1`)).json().page.nextCursor as string; }
    async function status(c:string) { return (await f.app.inject(`${f.url}?limit=1&cursor=${c}`)).statusCode; }
    let c = await cursor();
    f.db.updateTicket(external.id, {title:"Unrelated board change"});
    assert.equal(await status(c),200);
    const changes = [
      () => f.db.updateTicket(f.ids[0]!,{title:"Changed"}),
      () => f.db.sqlite.prepare("UPDATE tickets SET position=position+1 WHERE id=?").run(f.ids[0]!),
      () => f.db.sqlite.prepare("INSERT INTO ticket_tags VALUES(?,?)").run(f.ids[0]!,tag.id),
      () => f.db.sqlite.prepare("UPDATE tags SET name='renamed' WHERE id=?").run(tag.id),
      () => f.db.sqlite.prepare("UPDATE tickets SET group_id=? WHERE id=?").run(group.id,f.ids[0]!),
      () => f.db.sqlite.prepare("UPDATE groups SET name='renamed' WHERE id=?").run(group.id),
      () => f.db.sqlite.prepare("INSERT INTO ticket_blockers VALUES(?,?)").run(f.ids[0]!,external.id),
      () => f.db.sqlite.prepare("UPDATE tickets SET title='Referenced change' WHERE id=?").run(external.id),
      () => f.db.sqlite.prepare("INSERT INTO ticket_related_links VALUES(?,?)").run(f.ids[1]!,external.id),
      () => f.db.sqlite.prepare("UPDATE lanes SET is_completion_lane=0 WHERE id=?").run(f.board.lanes[1]!.id),
      () => f.db.sqlite.prepare("UPDATE tickets SET parent_ticket_id=? WHERE id=?").run(f.ids[0]!,f.ids[4]!),
      () => f.db.sqlite.prepare("INSERT INTO ticket_remote_links(ticket_id,provider,instance_url,project_key,issue_key,display_ref,remote_url,remote_title,created_at,updated_at,last_synced_at) VALUES(?,'github','https://example.test','owner/repo','1','#1','https://example.test/1','remote','now','now','now')").run(f.ids[0]!),
      () => f.db.sqlite.prepare("UPDATE ticket_remote_links SET remote_title='changed' WHERE ticket_id=?").run(f.ids[0]!),
      () => f.db.sqlite.prepare("INSERT INTO ticket_external_references(ticket_id,kind,provider,instance_url,project_key,issue_key,display_ref,remote_url,created_at,updated_at) VALUES(?,'issue','github','https://example.test','owner/repo','2','#2','https://example.test/2','now','now')").run(f.ids[1]!),
      () => f.db.sqlite.prepare("DELETE FROM ticket_external_references WHERE ticket_id=?").run(f.ids[1]!),
      () => f.db.sqlite.prepare("DELETE FROM tickets WHERE id=?").run(external.id),
      () => f.db.sqlite.prepare("DELETE FROM tags WHERE id=?").run(tag.id),
      () => { f.db.sqlite.prepare("UPDATE tickets SET group_id=NULL WHERE group_id=?").run(group.id); f.db.sqlite.prepare("DELETE FROM groups WHERE id=?").run(group.id); },
      () => f.db.createTicket({boardId:f.board.board.id,laneId:f.board.lanes[0]!.id,title:"New"}),
    ];
    for (const change of changes) { c=await cursor();change();assert.equal(await status(c),409,change.toString()); }
    const sourceCursor=await cursor();
    const otherCursor=(await f.app.inject(`/api/boards/${f.other.board.id}/tickets?limit=1`)).json().page.nextCursor;
    // Ensure the destination has enough records to exercise an existing cursor.
    for(let i=0;i<3;i++)f.db.createTicket({boardId:f.other.board.id,laneId:f.other.lanes[0]!.id,title:`Other${i}`});
    const destinationCursor=(await f.app.inject(`/api/boards/${f.other.board.id}/tickets?limit=1`)).json().page.nextCursor;
    assert.equal(otherCursor,null);
    f.db.moveTicket(f.ids[2]!,{boardId:f.other.board.id,laneId:f.other.lanes[0]!.id});
    assert.equal(await status(sourceCursor),409);
    assert.equal((await f.app.inject(`/api/boards/${f.other.board.id}/tickets?limit=1&cursor=${destinationCursor}`)).statusCode,409);
  } finally { await f.app.close(); f.db.close(); }
});

test("startup replaces an older ticket revision trigger once and keeps issued cursors valid", async () => {
  const f = setup();
  try {
    const url = f.url + "?limit=1";
    const first = await f.app.inject(url);
    assert.equal(first.statusCode, 200);
    const cursor = encodeURIComponent(first.json().page.nextCursor);
    const continuation = url + "&cursor=" + cursor;
    const expected = await f.app.inject(continuation);
    f.db.sqlite.exec(`
      DROP TRIGGER ticket_list_tickets_update;
      CREATE TRIGGER ticket_list_tickets_update BEFORE UPDATE ON tickets BEGIN
        UPDATE ticket_list_revisions SET revision = revision + 1 WHERE board_id = OLD.board_id;
      END;
    `);
    const triggerSql = (db: KanbanDb) => db.sqlite.prepare(
      "SELECT sql FROM sqlite_schema WHERE name='ticket_list_tickets_update'",
    ).pluck().get();

    const upgraded = new KanbanDb(f.file);
    let indexedTrigger;
    try {
      indexedTrigger = triggerSql(upgraded);
      assert.match(String(indexedTrigger), /UNION ALL SELECT dependent.board_id FROM ticket_blockers/);
      const continued = await f.app.inject(continuation);
      assert.equal(continued.statusCode, 200);
      assert.equal(continued.body, expected.body);
      assert.equal(continued.headers["x-kanbalone-ticket-revision"], expected.headers["x-kanbalone-ticket-revision"]);
    } finally { upgraded.close(); }

    const reopened = new KanbanDb(f.file);
    try {
      assert.equal(triggerSql(reopened), indexedTrigger);
      const schemaVersion = reopened.sqlite.pragma("schema_version", { simple: true });
      reopened.sqlite.transaction(() => migrateTicketPagination(reopened.sqlite)).immediate();
      assert.equal(reopened.sqlite.pragma("schema_version", { simple: true }), schemaVersion);
      reopened.updateTicket(f.ids[0]!, { title: "Changed after restart" });
      assert.equal((await f.app.inject(continuation)).statusCode, 409);
    } finally { reopened.close(); }
  } finally { await f.app.close(); f.db.close(); }
});

test("signed cursor survives restart with unchanged data", async () => {
  const f=setup();
  const first=(await f.app.inject(`${f.url}?limit=5`)).json();
  const relationUrl = `/api/boards/${f.board.board.id}/relation-candidates`;
  const firstRelation = (await f.app.inject(`${relationUrl}?limit=5`)).json();
  await f.app.close();f.db.close();
  const restarted=buildApp({dbFile:f.file,staticDir:path.join(process.cwd(),"public")});
  try {
    const next=await restarted.inject(`${f.url}?limit=50&cursor=${first.page.nextCursor}`);
    assert.equal(next.statusCode,200,next.body);
    assert.equal(next.json().tickets.length,50);
    assert.equal(next.json().tickets[0].id,first.tickets.at(-1).id+1);
    const nextRelation = await restarted.inject(`${relationUrl}?limit=50&cursor=${firstRelation.page.nextCursor}`);
    assert.equal(nextRelation.statusCode, 200, nextRelation.body);
    assert.equal(nextRelation.json().page.total, 65);
    assert.deepEqual(nextRelation.json().tickets.map((ticket: TicketRelationCandidateView) => ticket.id), f.ids.slice(5, 55));
  } finally {await restarted.close();}
});

test("relation candidates page over the board in ID order with only the picker fields", async () => {
  const f = setup();
  try {
    const url = `/api/boards/${f.board.board.id}/relation-candidates`;
    const external = f.db.createTicket({ boardId: f.other.board.id, laneId: f.other.lanes[0]!.id, title: "External blocker" });
    const [parentId, childId] = f.ids;
    const archivedId = f.ids.at(-1)!;
    // Include a historical nested relation and an archived child across page boundaries.
    f.db.sqlite.prepare("UPDATE tickets SET parent_ticket_id=? WHERE id=?").run(parentId, childId);
    f.db.sqlite.prepare("UPDATE tickets SET parent_ticket_id=? WHERE id=?").run(childId, archivedId);
    f.db.sqlite.prepare("INSERT INTO ticket_blockers VALUES(?,?),(?,?)").run(archivedId, external.id, archivedId, parentId);

    const legacyResponse = await f.app.inject(`${f.url}?archived=all&order=id_asc`);
    assert.equal(legacyResponse.statusCode, 200);
    const legacy: TicketSummaryView[] = legacyResponse.json().tickets;
    assert.equal(legacy.length, 65);
    assert.ok(legacy.some(ticket => ticket.isResolved));
    assert.ok(legacy.find(ticket => ticket.id === archivedId)?.isArchived);

    const first = await f.app.inject(`${url}?limit=1&order=id_asc`);
    assert.equal(first.statusCode, 200, first.body);
    const revision = first.headers["x-kanbalone-ticket-revision"];
    assert.match(String(revision), /^\d+$/);
    let result = first.json();
    assert.deepEqual(Object.keys(result).sort(), ["page", "tickets"]);
    assert.deepEqual(Object.keys(result.page).sort(), ["nextCursor", "total"]);
    const candidates: TicketRelationCandidateView[] = [...result.tickets];
    assert.equal(candidates.length, 1);
    assert.equal(result.page.total, 65);
    for (const [limit, expectedLength] of [[17, 17], [200, 47]]) {
      assert.ok(result.page.nextCursor);
      const response = await f.app.inject(`${url}?limit=${limit}&cursor=${result.page.nextCursor}`);
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.headers["x-kanbalone-ticket-revision"], revision);
      result = response.json();
      assert.equal(result.page.total, 65);
      assert.equal(result.tickets.length, expectedLength);
      candidates.push(...result.tickets);
    }
    assert.equal(result.page.nextCursor, null);
    assert.deepEqual(candidates, legacy.map(({ id, title, parentTicketId, priority, blockerIds, isResolved }) => ({
      id, title, parentTicketId, priority, blockerIds, isResolved,
    })));
    assert.deepEqual(candidates.at(-1)?.blockerIds, [parentId, external.id]);
    assert.equal(candidates.at(-1)?.parentTicketId, childId);
  } finally { await f.app.close(); f.db.close(); }
});

for (const collection of ["relation candidates", "ungrouped tickets", "List references"] as const)
test(`${collection} reuse their signed total and recalculate for a previous-format cursor`, async (t) => {
  const f = setup();
  try {
    const boardId = f.board.board.id;
    const filters = { includeArchived: true };
    const loaders = {
      "relation candidates": (options: PageOptions) => f.db.listTicketRelationCandidatePage(boardId, options),
      "ungrouped tickets": (options: PageOptions) => f.db.listGroupTicketPage(boardId, null, options),
      "List references": (options: PageOptions) => f.db.listTicketReferencePage(boardId, filters, options),
    };
    const readPage = loaders[collection];
    const expectedIds = collection === "List references"
      ? f.db.listTicketSummaries(boardId, filters).map(ticket => ticket.id)
      : f.ids;
    const { sqlite } = f.db;
    const { secret } = sqlite.prepare("SELECT secret FROM ticket_cursor_secret WHERE id=1").get() as { secret: string };
    const sign = (body: string) => createHmac("sha256", secret).update(body).digest("base64url");
    const toBody = (payload: object) => Buffer.from(JSON.stringify(payload)).toString("base64url");
    const prepare = sqlite.prepare.bind(sqlite);
    let countCalls = 0;
    t.mock.method(sqlite, "prepare", (sql: string) => {
      if (sql.includes("COUNT(*) AS total")) {
        assert.equal(sqlite.inTransaction, true);
        countCalls++;
      }
      return prepare(sql);
    });

    const first = readPage({ limit: 5 });
    const cursor = first.page.nextCursor;
    assert.ok(cursor);
    const [body, signature] = cursor.split(".");
    const { total, ...previousPayload } = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    assert.equal(total, 65);
    assert.equal(signature, sign(body!));
    assert.equal(countCalls, 1);

    const expected = readPage({ limit: 10, cursor });
    assert.equal(countCalls, 1);
    assert.equal(expected.page.total, 65);
    assert.deepEqual(expected.tickets.map(ticket => ticket.id), expectedIds.slice(5, 15));

    const previousBody = toBody(previousPayload);
    const previous = readPage({
      limit: 10, cursor: `${previousBody}.${sign(previousBody)}`,
    });
    assert.equal(countCalls, 2);
    assert.deepEqual(previous, expected);

    assert.ok(previous.page.nextCursor);
    const last = readPage({ limit: 200, cursor: previous.page.nextCursor });
    assert.equal(countCalls, 2);
    assert.deepEqual(last.page, { nextCursor: null, total: 65 });
    assert.deepEqual(last.tickets.map(ticket => ticket.id), expectedIds.slice(15));

    const tamperedBody = toBody({ ...previousPayload, total: 66 });
    assert.throws(() => readPage({ limit: 1, cursor: `${tamperedBody}.${signature}` }),
      { message: "invalid pagination cursor", statusCode: 400 });
    for (const invalidTotal of [-1, 0.5, "65", null, Number.MAX_SAFE_INTEGER + 1]) {
      const invalidBody = toBody({ ...previousPayload, total: invalidTotal });
      assert.throws(() => readPage({
        limit: 1, cursor: `${invalidBody}.${sign(invalidBody)}`,
      }), { message: "invalid pagination cursor", statusCode: 400 });
    }
    assert.equal(countCalls, 2);
  } finally { await f.app.close(); f.db.close(); }
});

test("relation candidate cursors are endpoint specific and invalidated by ticket or blocker changes", async () => {
  const f = setup();
  try {
    const url = `/api/boards/${f.board.board.id}/relation-candidates`;
    const emptyUrl = `/api/boards/${f.other.board.id}/relation-candidates`;
    const empty = await f.app.inject(`${emptyUrl}?limit=200`);
    assert.equal(empty.statusCode, 200, empty.body);
    assert.match(String(empty.headers["x-kanbalone-ticket-revision"]), /^\d+$/);
    assert.deepEqual(empty.json(), { tickets: [], page: { nextCursor: null, total: 0 } });
    assert.equal((await f.app.inject(`/api/boards/${f.other.board.id + 100}/relation-candidates?limit=1`)).statusCode, 404);
    for (const query of ["", "cursor=x", "limit=0", "limit=201", "limit=1.5", "limit=no", "limit=1&cursor=x", "limit=1&cursor=", "limit=1&order=position_asc", "limit=1&archived=all", "limit=1&q=needle"]) {
      assert.equal((await f.app.inject(`${url}?${query}`)).statusCode, 400, query);
    }
    const legacyUrl = `${f.url}?archived=all&order=id_asc&limit=1`;
    const legacyFirst = await f.app.inject(legacyUrl);
    assert.equal(legacyFirst.statusCode, 200);
    const legacyCursor: string = legacyFirst.json().page.nextCursor;
    const legacyPayload = JSON.parse(Buffer.from(legacyCursor.split(".")[0]!, "base64url").toString("utf8"));
    const legacyFilterSql = "\n    SELECT t.*\n    FROM tickets t\n    WHERE t.board_id = ?\n  ";
    assert.equal(legacyPayload.query, createHash("sha256")
      .update(JSON.stringify([legacyFilterSql, [f.board.board.id], "id_asc"])).digest("hex"));
    assert.ok("isArchived" in legacyFirst.json().tickets[0]);
    assert.ok("tags" in legacyFirst.json().tickets[0]);
    assert.ok("ref" in legacyFirst.json().tickets[0]);
    assert.equal((await f.app.inject(`${legacyUrl}&cursor=${legacyCursor}`)).statusCode, 200);

    async function firstCandidateCursor() {
      const response = await f.app.inject(`${url}?limit=1`);
      assert.equal(response.statusCode, 200, response.body);
      const cursor: string = response.json().page.nextCursor;
      assert.ok(cursor);
      return cursor;
    }
    const candidateCursor = await firstCandidateCursor();
    const altered = candidateCursor.slice(0, -1) + (candidateCursor.endsWith("A") ? "B" : "A");
    assert.equal((await f.app.inject(`${url}?limit=1&cursor=${altered}`)).statusCode, 400);
    assert.equal((await f.app.inject(`${emptyUrl}?limit=1&cursor=${candidateCursor}`)).statusCode, 400);
    assert.equal((await f.app.inject(`${url}?limit=1&cursor=${legacyCursor}`)).statusCode, 400);
    assert.equal((await f.app.inject(`${legacyUrl}&cursor=${candidateCursor}`)).statusCode, 400);
    assert.equal((await f.app.inject(legacyUrl)).body, legacyFirst.body);

    f.db.updateTicket(f.ids[1]!, { title: "Changed" });
    const stale = await f.app.inject(`${url}?limit=1&cursor=${candidateCursor}`);
    assert.equal(stale.statusCode, 409);
    assert.deepEqual(stale.json(), { error: "ticket list changed; restart pagination" });
    const freshCursor = await firstCandidateCursor();
    f.db.sqlite.prepare("INSERT INTO ticket_blockers VALUES(?,?)").run(f.ids[1], f.ids[2]);
    assert.equal((await f.app.inject(`${url}?limit=1&cursor=${freshCursor}`)).statusCode, 409);
    const restarted = await f.app.inject(`${url}?limit=200`);
    assert.equal(restarted.statusCode, 200);
    assert.equal(restarted.json().tickets[1].title, "Changed");
    assert.deepEqual(restarted.json().tickets[1].blockerIds, [f.ids[2]]);
  } finally { await f.app.close(); f.db.close(); }
});

test("adding pagination metadata to an existing schema preserves user data and is idempotent", async () => {
  const f=setup();
  await f.app.close();
  const before=f.db.getBoardDetail(f.board.board.id);
  // Remove only this feature's additive objects to model a pre-pagination v1 database.
  const triggers=f.db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'ticket_list_%'").all() as {name:string}[];
  for(const trigger of triggers)f.db.sqlite.exec(`DROP TRIGGER ${trigger.name}`);
  f.db.sqlite.exec("DROP TABLE ticket_list_revisions; DROP TABLE ticket_cursor_secret; DROP INDEX tickets_paging_id_idx; DROP INDEX tickets_paging_completed_idx;");
  f.db.close();
  let upgraded=new KanbanDb(f.file);
  assert.deepEqual(upgraded.getBoardDetail(f.board.board.id),before);
  const page=upgraded.listTicketPage(f.board.board.id,{}, {limit:5});
  assert.ok(page.page?.nextCursor);
  upgraded.close();
  upgraded=new KanbanDb(f.file);
  try {
    assert.deepEqual(upgraded.getBoardDetail(f.board.board.id),before);
    const next=upgraded.listTicketPage(f.board.board.id,{}, {limit:50,cursor:page.page!.nextCursor!});
    assert.equal(next.tickets.length,50);
  } finally {upgraded.close();}
});

test("summary Group reuse stays local to each collection and returns independent Group values", async () => {
  const f = setup();
  try {
    const a = f.db.createGroup({ boardId: f.board.board.id, name: "First" });
    const b = f.db.createGroup({ boardId: f.board.board.id, name: "Second" });
    f.db.sqlite.prepare("UPDATE tickets SET group_id=? WHERE id IN (?,?)").run(a.id, f.ids[0]!, f.ids[1]!);
    f.db.sqlite.prepare("UPDATE tickets SET group_id=? WHERE id=?").run(b.id, f.ids[2]!);
    for (const suffix of ["", "?limit=200&order=id_asc"]) {
      const response = await f.app.inject(f.url + suffix);
      assert.equal(response.statusCode, 200);
      const tickets = response.json().tickets as Array<{id:number;groupId:number|null;group:{id:number;name:string}|null}>;
      assert.deepEqual(tickets.find(t => t.id === f.ids[0])!.group, {id:a.id,name:"First"});
      assert.deepEqual(tickets.find(t => t.id === f.ids[1])!.group, {id:a.id,name:"First"});
      assert.deepEqual(tickets.find(t => t.id === f.ids[2])!.group, {id:b.id,name:"Second"});
      assert.equal(tickets.find(t => t.id === f.ids[3])!.group, null);
      assert.equal(tickets.find(t => t.id === f.ids[3])!.groupId, null);
    }
    const direct = f.db.listTicketSummaries(f.board.board.id);
    const first = direct.find(t => t.id === f.ids[0])!;
    const second = direct.find(t => t.id === f.ids[1])!;
    assert.notEqual(first.group, second.group);
    first.group!.name = "Caller edit";
    assert.equal(second.group!.name, "First");
    f.db.sqlite.prepare("UPDATE groups SET name=? WHERE id=?").run("Renamed", a.id);
    f.db.sqlite.prepare("UPDATE tickets SET group_id=NULL WHERE id=?").run(f.ids[1]!);
    const refreshed = (await f.app.inject(f.url + "?limit=200&order=id_asc")).json().tickets;
    assert.deepEqual(refreshed.find((t:{id:number}) => t.id === f.ids[0]).group, {id:a.id,name:"Renamed"});
    assert.equal(refreshed.find((t:{id:number}) => t.id === f.ids[1]).group, null);
  } finally { await f.app.close(); f.db.close(); }
});
