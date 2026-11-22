import {KanbanDb} from '../../src/db.ts';import Database from 'better-sqlite3';import fs from 'node:fs';
for(const done of [0,900,9900]){
 const file=`coverage/completion-heavy/done-${done}.sqlite`;if(fs.existsSync(file))throw new Error('Refusing to replace '+file);
 const store=new KanbanDb(file);const {board,lanes}=store.createBoard({name:'Completion lab'});const tag=store.createTag({boardId:board.id,name:'engineering',color:'#557766'});store.close();
 const db=new Database(file);const insert=db.prepare('INSERT INTO tickets(id,board_id,lane_id,title,body_markdown,is_resolved,is_archived,priority,position,created_at,updated_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');const tagInsert=db.prepare('INSERT INTO ticket_tags(ticket_id,tag_id) VALUES(?,?)');
 db.transaction(()=>{for(let id=1;id<=100+done;id++){const resolved=id>100;const laneId=resolved?lanes[3].id:lanes[(id-1)%3].id;const time=new Date(Date.UTC(2026,10,22,0,0,id)).toISOString();insert.run(id,board.id,laneId,`${resolved?'Completed':'Open'} work ${String(id).padStart(5,'0')}`,'Synthetic completion performance work. '.repeat(15).slice(0,500),Number(resolved),0,2,resolved?id-101:Math.floor((id-1)/3),'2026-11-22T00:00:00.000Z',time,resolved?time:null);tagInsert.run(id,tag.id)}})();
 db.pragma('wal_checkpoint(TRUNCATE)');db.close();console.log(done,board.id,lanes.map(l=>({id:l.id,done:l.isCompletionLane})));
}
