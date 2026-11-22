"""Use only with the synthetic #1512 benchmark database; never a user database."""
import sys,sqlite3,pathlib,json,urllib.request
out=pathlib.Path('coverage/group-partial-render/performance');out.mkdir(parents=True,exist_ok=True)
if sys.argv[1]=='copy':
 source=sqlite3.connect(sys.argv[2]); names=source.execute('SELECT name FROM boards WHERE id IN (1,2) ORDER BY id').fetchall()
 assert names==[('Paging lab 1000',),('Paging lab 10000',)],'Expected the synthetic paging lab'
 assert not (out/'benchmark.sqlite').exists(),'Use a new output directory; do not overwrite an existing database'
 target=sqlite3.connect(out/'benchmark.sqlite');source.backup(target);target.close();source.close()
elif sys.argv[1]=='configure':
 base='http://127.0.0.1:3605'
 def api(path,method='GET',body=None):
  req=urllib.request.Request(base+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
  return json.load(urllib.request.urlopen(req))
 for bid,count in [(1,1000),(2,10000)]:
  board=api(f'/api/boards/{bid}');assert board['board']['name']==f'Paging lab {count}'
  assert len(api(f'/api/boards/{bid}/tickets?archived=all')['tickets'])==count
  group=api(f'/api/groups/{bid}');assert group['totalTicketCount']==count
  api(f'/api/groups/{bid}','PATCH',{'descriptionMarkdown':'Review the remaining work, coordinate implementation and verify the result.\n\n'+('Details for this temporary performance group. '*15),'expectedRevision':group['revision']})
  for i in range(5):api(f'/api/boards/{bid}/tickets','POST',{'laneId':board['lanes'][0]['id'],'title':f'Candidate {bid}-{i}: additional work','priority':2})
else:raise SystemExit('copy SOURCE_DB | configure (after starting isolated servers)')
