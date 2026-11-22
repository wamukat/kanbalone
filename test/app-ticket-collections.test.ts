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
    const query = new URL(url,"http://localhost").searchParams;
    assert.equal(query.get("tag"),"release");
    return page(query.has("priority") ? [{id:1}] : [{id:1},{id:2}],"1");
  },"/api/boards/1/tickets?priority=4&tag=release",{isCurrent:()=>true});
  assert.deepEqual(result.tickets,[{id:1}]);
  assert.deepEqual(result.referenceTickets,[{id:1},{id:2}]);
});
