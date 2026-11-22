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
