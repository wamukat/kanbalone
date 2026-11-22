import sqlite3
p='coverage/performance-1512/benchmark.sqlite';db=sqlite3.connect(p)
for b,start in [(1,1),(2,1001)]:
 lanes=[x[0] for x in db.execute('select id from lanes where board_id=? order by position',(b,))]
 for offset in range(0,40,2):
  parent=start+offset;child=parent+1
  db.execute('update tickets set parent_ticket_id=?, priority=4, lane_id=?, is_resolved=0,is_archived=0,title=? where id=?',(parent,lanes[0],f'Child {child}: remaining work',child))
  db.execute('update tickets set priority=4,lane_id=?,is_resolved=?,is_archived=?,title=? where id=?',(lanes[3] if offset%4==2 else lanes[0],int(offset%4==2),int(offset%4==0),f'Parent {parent}: review context',parent))
db.commit();print('20 parent/child pairs per board; 10 archived parents, 10 completed parents; all 20 children open.')
