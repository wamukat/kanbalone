import test from "node:test";
import assert from "node:assert/strict";
import { loadKanbanTicketCollections, loadListTicketCollection } from "../public/app-ticket-collections.js";

const page = (tickets: Array<{id:number}>, revision:string) => ({tickets,page:{total:tickets.length,nextCursor:null},ticketRevision:revision});
test("moving a ticket between separately queried lanes retries all lanes before exposing duplicates", async () => {
  let calls = 0;
  const result = await loadKanbanTicketCollections(async url => {
    const lane = new URL(url,"http://localhost").searchParams.get("lane_id");
    calls++;
    if (calls <= 2) return page([{id:7}], lane === "1" ? "1" : "2");
    return page(lane === "1" ? [] : [{id:7}], "2");
  },[{id:1},{id:2,isCompletionLane:true}],"/api/boards/1/tickets",{limits:new Map(),isCurrent:()=>true});
  assert.equal(calls,4);
  assert.deepEqual(result.tickets,[{id:7}]);
  assert.equal(result.completionPages[2].total,1);
});
test("continual mixed lane revisions are bounded instead of rendering incoherent data", async () => {
  let calls = 0;
  await assert.rejects(loadKanbanTicketCollections(async url => {
    calls++;
    const lane = new URL(url,"http://localhost").searchParams.get("lane_id")!;
    return page([],lane);
  },[{id:1},{id:2}],"/api/boards/1/tickets",{limits:new Map(),isCurrent:()=>true}),{status:409});
  assert.equal(calls,6);
});
test("completion lanes request the current expansion while other lanes use bounded full collection", async () => {
  const seen = new Map<string,string>();
  await loadKanbanTicketCollections(async url => {
    const query = new URL(url,"http://localhost").searchParams;
    seen.set(query.get("lane_id")!,`${query.get("limit")}:${query.get("order")}:${query.get("priority")}`);
    return page([],"1");
  },[{id:1},{id:2,isCompletionLane:true}],"/api/boards/1/tickets?priority=4",{limits:new Map([[2,55]]),isCurrent:()=>true});
  assert.equal(seen.get("1"),"200:position_asc:4");
  assert.equal(seen.get("2"),"55:completed_desc:4");
});
test("List keeps lower priority references while filtering display tickets on the server", async () => {
  const result = await loadListTicketCollection(async url => {
    const { pathname, searchParams: query } = new URL(url,"http://localhost");
    assert.equal(query.get("tag"),"release");
    assert.equal(pathname, query.has("priority") ? "/api/boards/1/tickets" : "/api/boards/1/list-ticket-references");
    return page(query.has("priority") ? [{id:1}] : [{id:1},{id:2}],"1");
  },"/api/boards/1/tickets?priority=4&tag=release",{isCurrent:()=>true});
  assert.deepEqual(result.tickets,[{id:1}]);
  assert.deepEqual(result.referenceTickets,[{id:1},{id:2}]);
});

test("List reuses the displayed collection when all four priorities are selected", async () => {
  const seen: string[] = [];
  const result = await loadListTicketCollection(async url => {
    seen.push(url);
    return page([{id:1},{id:2}], "1");
  }, "/api/boards/1/tickets?priority=4,1,2,4,3", {isCurrent:()=>true});
  assert.equal(seen.length, 1);
  assert.equal(new URL(seen[0]!, "http://localhost").searchParams.get("priority"), "4,1,2,4,3");
  assert.equal(result.referenceTickets, result.tickets);
});

test("List recollects display and lightweight references when snapshots differ", async () => {
  let calls = 0;
  const result = await loadListTicketCollection(async url => {
    const display = new URL(url, "http://localhost").searchParams.has("priority");
    const firstDisplay = ++calls === 1;
    return page(display ? [{id:1}] : [{id:2},{id:1}], firstDisplay ? "1" : "2");
  }, "/api/boards/1/tickets?priority=4", {isCurrent:()=>true});
  assert.equal(calls, 4);
  assert.deepEqual(result.tickets, [{id:1}]);
  assert.deepEqual(result.referenceTickets, [{id:2},{id:1}]);
});

test("List refresh behind an editor keeps archived and filtered-out references", async () => {
  const display = "/api/boards/1/tickets?lane_id=1&q=release&tag=build&resolved=false&priority=4";
  let editorOpen = false;
  const references: string[] = [];
  const result = await loadListTicketCollection(async url => {
    const { pathname, searchParams } = new URL(url, "http://localhost");
    assert.equal(searchParams.get("order"), "position_asc");
    searchParams.delete("order");
    searchParams.delete("limit");
    if (pathname.endsWith("/tickets")) {
      assert.equal(pathname + "?" + searchParams.toString(), display);
      editorOpen = true;
      return page([{id:1}], "1");
    }
    assert.equal(pathname, "/api/boards/1/list-ticket-references");
    references.push(searchParams.toString());
    return page([{id:2},{id:1}], "1");
  }, display, {isCurrent:()=>true, allReferences:()=>editorOpen});
  assert.deepEqual(references, ["lane_id=1&q=release&tag=build&resolved=false", "archived=all"]);
  assert.deepEqual(result.tickets, [{id:1}]);
  assert.deepEqual(result.referenceTickets, [{id:2},{id:1}]);
});

test("List does not expand its references after an editor closes during the refresh", async () => {
  let calls = 0;
  let editorOpen = true;
  const result = await loadListTicketCollection(async () => {
    calls += 1;
    editorOpen = false;
    return page([{id:1}], "1");
  }, "/api/boards/1/tickets?tag=release", {
    isCurrent: () => true,
    allReferences: () => editorOpen,
  });
  assert.equal(calls, 1);
  assert.equal(result.referenceTickets, result.tickets);
});
