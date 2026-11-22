import Database from 'better-sqlite3';
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import {listTicketPage} from '../../src/db-modules/ticket-pagination.ts';
const db=new Database('/Users/takuma/workspace/kanbalone-group-render/coverage/group-partial-render/performance/benchmark.sqlite',{readonly:true});
let cache=null,lookups=0;const original=db.prepare.bind(db);
db.prepare=(sql)=>{if(sql==='SELECT id,name FROM groups WHERE id=?'){lookups++;if(cache){return {get(id){if(!cache.has(id))cache.set(id,original(sql).get(id));return cache.get(id)}}}}return original(sql)};
const results=[];
for(let run=0;run<5;run++)for(const mode of run%2?['cached','baseline']:['baseline','cached'])for(const [boardId,count] of [[1,1000],[2,10000]]){
 let cursor,rows=[],pages=0;lookups=0;const start=performance.now();
 do{cache=mode==='cached'?new Map():null;const page=listTicketPage(db,boardId,{groupId:boardId,includeArchived:true},{limit:200,order:'position_asc',...(cursor?{cursor}:{})});rows.push(...page.tickets);cursor=page.page.nextCursor;pages++;}while(cursor);
 results.push({run,mode,count,rows:rows.length,pages,lookupCalls:lookups,ms:performance.now()-start});
}
fs.writeFileSync('coverage/initial-render/group-lookup-results.json',JSON.stringify(results,null,2));console.log(results);db.close();
