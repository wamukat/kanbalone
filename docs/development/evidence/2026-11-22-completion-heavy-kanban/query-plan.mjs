import Database from 'better-sqlite3';
import fs from 'node:fs';
const db=new Database('coverage/completion-heavy/done-9900.sqlite',{readonly:true});
const lane=db.prepare('SELECT id,board_id FROM lanes WHERE is_completion_lane=1').get();
const where='FROM tickets t WHERE t.board_id=? AND t.lane_id=? AND t.is_archived=0';
const order='ORDER BY COALESCE(CAST(round((julianday(t.resolved_at) - 2440587.5) * 86400000) AS INTEGER), 0) DESC, t.position ASC, t.id DESC';
const results={sqliteVersion:db.prepare('SELECT sqlite_version() AS version').get().version,lane,plans:{}};
for(const [name,sql] of [['firstFive',`SELECT t.* ${where} ${order} LIMIT 6`],['count',`SELECT COUNT(*) ${where}`]])results.plans[name]=db.prepare('EXPLAIN QUERY PLAN '+sql).all(lane.board_id,lane.id);
fs.writeFileSync('coverage/completion-heavy/query-plan.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));db.close();
