import test from "node:test";
import assert from "node:assert/strict";
import { collectTicketPages, ticketPageUrl } from "../public/app-ticket-pages.js";

const rows = (count: number, start = 1) => Array.from({length: count}, (_, i) => ({id: i + start}));
test("GUI collection stages bounded pages and preserves filters and explicit order", async () => {
  const urls: URL[] = [];
  const response = await collectTicketPages(async (url) => {
    const parsed = new URL(url, "http://localhost"); urls.push(parsed);
    return parsed.searchParams.has("cursor")
      ? {tickets: rows(3, 201), page:{total:203,nextCursor:null}}
      : {tickets: rows(200), page:{total:203,nextCursor:"continue"}};
  }, "/api/boards/4/tickets?q=hello%20world&priority=1,3&order=id_asc");
  assert.equal(response.tickets.length, 203);
  assert.deepEqual(urls.map(u => u.searchParams.get("limit")), ["200", "200"]);
  assert.ok(urls.every(u => u.searchParams.get("q") === "hello world" && u.searchParams.get("order") === "id_asc"));
  assert.equal(urls[1].searchParams.get("cursor"), "continue");
});
test("409 discards every staged row and retries the collection, not just the failed page", async () => {
  let call = 0;
  const response = await collectTicketPages(async () => {
    call++;
    if (call === 1) return {tickets: rows(200), page:{total:201,nextCursor:"old"}};
    if (call === 2) throw Object.assign(new Error("changed"), {status:409});
    return {tickets:[{id:500}], page:{total:1,nextCursor:null}};
  }, "/api/boards/4/tickets");
  assert.equal(call, 3); assert.deepEqual(response.tickets, [{id:500}]);
});
test("repeated updates stop after two restarts", async () => {
  let calls = 0;
  await assert.rejects(collectTicketPages(async () => { calls++; throw Object.assign(new Error("changed"), {status:409}); }, "/api/boards/4/tickets"), /changed/);
  assert.equal(calls, 3);
});
test("superseded request is discarded without paging or retries", async () => {
  let current = true, calls = 0;
  await assert.rejects(collectTicketPages(async () => {
    calls++; current = false;
    return {tickets:rows(200),page:{total:201,nextCursor:"next"}};
  }, "/api/boards/4/tickets", {isCurrent: () => current}), {name:"AbortError"});
  assert.equal(calls, 1);
});
test("partial prefix requests only the desired count and keeps continuation", async () => {
  const response = await collectTicketPages(async (url) => {
    assert.equal(new URL(url,"http://localhost").searchParams.get("limit"), "5");
    return {tickets:rows(5),page:{total:300,nextCursor:"after-five"}};
  }, "/api/boards/4/tickets?order=completed_desc", {limit:5});
  assert.equal(response.tickets.length, 5); assert.equal(response.page.nextCursor, "after-five");
  const next = new URL(ticketPageUrl("/api/boards/4/tickets?order=completed_desc",50,response.page.nextCursor),"http://localhost");
  assert.equal(next.searchParams.get("limit"),"50"); assert.equal(next.searchParams.get("cursor"),"after-five");
});
test("bad page contracts fail instead of silently exposing incomplete data or looping", async () => {
  for (const value of [{tickets:[]}, {tickets:[],page:{total:2,nextCursor:null}}, {tickets:[],page:{total:2,nextCursor:"next"}}]) {
    await assert.rejects(collectTicketPages(async () => value,"/api/boards/4/tickets"));
  }
  await assert.rejects(collectTicketPages(async () => ({tickets:rows(1),page:{total:50,nextCursor:"same"}}),"/api/boards/4/tickets"),/Repeated/);
});

test("collection rejects mismatched page revision headers and restarts atomically", async () => {
  let calls = 0;
  const result = await collectTicketPages(async () => {
    calls++;
    if (calls === 1) return {tickets:rows(200),page:{total:201,nextCursor:"old"},ticketRevision:"1"};
    if (calls === 2) return {tickets:rows(1,201),page:{total:201,nextCursor:null},ticketRevision:"2"};
    return {tickets:[{id:700}],page:{total:1,nextCursor:null},ticketRevision:"2"};
  }, "/api/boards/4/tickets");
  assert.deepEqual(result.tickets,[{id:700}]); assert.equal(result.ticketRevision,"2");
  assert.ok(!Object.keys(result).includes("ticketRevision"));
});

test("only opted-in collections use the advertised limit after the first page", async () => {
  const total = 1005;
  const cases = [
    { followPageLimit: false, advertised: 800, limits: [200, 200, 200, 200, 200, 200] },
    { followPageLimit: true, advertised: undefined, limits: [200, 200, 200, 200, 200, 200] },
    { followPageLimit: true, advertised: 800.5, limits: [200, 200, 200, 200, 200, 200] },
    { followPageLimit: true, advertised: 800, limits: [200, 800, 800] },
    { followPageLimit: true, advertised: 1600, limits: [200, 800, 800] },
  ];
  for (const { followPageLimit, advertised, limits } of cases) {
    const requested: number[] = [];
    const result = await collectTicketPages(async (url) => {
      const query = new URL(url, "http://localhost").searchParams;
      const start = Number(query.get("cursor") ?? 0);
      const limit = Number(query.get("limit"));
      const count = Math.min(limit, total - start);
      const offset = start + count;
      requested.push(limit);
      return {
        tickets: rows(count, start + 1),
        page: { total, nextCursor: offset < total ? String(offset) : null },
        ticketPageLimit: advertised,
      };
    }, "/api/boards/4/group-tickets?groupId=1", { followPageLimit });
    assert.deepEqual(result.tickets, rows(total));
    assert.deepEqual(requested, limits);
  }
});

test("rollback retries the same cursor at 200 and keeps the limit through a revision restart", async () => {
  const requests: Array<[number, string | null]> = [];
  const result = await collectTicketPages(async (url) => {
    const query = new URL(url, "http://localhost").searchParams;
    const limit = Number(query.get("limit"));
    const cursor = query.get("cursor");
    requests.push([limit, cursor]);
    switch (requests.length) {
      case 1:
        return {
          tickets: rows(200), page: { total: 601, nextCursor: "old-200" },
          ticketRevision: "1", ticketPageLimit: 800,
        };
      case 2:
        throw Object.assign(new Error("Old limit"), { status: 400 });
      case 3:
        return { tickets: rows(200, 201), page: { total: 601, nextCursor: "old-400" }, ticketRevision: "1" };
      case 4:
        throw Object.assign(new Error("Changed revision"), { status: 409 });
      case 5:
        return {
          tickets: rows(200, 1001), page: { total: 201, nextCursor: "new-200" },
          ticketRevision: "2", ticketPageLimit: 800,
        };
      default:
        return { tickets: [{ id: 1201 }], page: { total: 201, nextCursor: null }, ticketRevision: "2", ticketPageLimit: 800 };
    }
  }, "/api/boards/4/list-ticket-references?archived=all", { followPageLimit: true });
  assert.deepEqual(requests, [[200, null], [800, "old-200"], [200, "old-200"], [200, "old-400"], [200, null], [200, "new-200"]]);
  assert.deepEqual(result.tickets, rows(201, 1001));
  assert.equal(result.ticketRevision, "2");
});

test("large-page fallback stops when its request is superseded", async () => {
  let calls = 0;
  let current = true;
  await assert.rejects(collectTicketPages(async () => {
    if (++calls === 1) {
      return { tickets: rows(200), page: { total: 201, nextCursor: "next" }, ticketPageLimit: 800 };
    }
    current = false;
    throw Object.assign(new Error("Old limit"), { status: 400 });
  }, "/api/boards/4/group-tickets", { followPageLimit: true, isCurrent: () => current }), { name: "AbortError" });
  assert.equal(calls, 2);
});
