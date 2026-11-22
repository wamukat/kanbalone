import json,sqlite3,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent
base='http://127.0.0.1:3619'
def post(path,data):
    request=urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request) as r:return json.load(r)
cases=[]
for lang in ['ja','en']:
    board=post('/api/boards',{'name':'Delivery review','laneNames':['Todo','Doing']});bid=board['board']['id']
    done=post(f'/api/boards/{bid}/lanes',{'name':'Done','isCompletionLane':True})
    group=post(f'/api/boards/{bid}/groups',{'name':'Delivery checks'})
    ticket=post(f'/api/boards/{bid}/tickets',{'title':'Review notification delivery','laneId':board['lanes'][1]['id'],'groupId':group['id']})
    for i in range(7):post(f'/api/boards/{bid}/tickets',{'title':f'Completed check {i+1:02d}','laneId':done['id'],'groupId':group['id']})
    cases.append({'language':lang,'boardId':bid,'originId':ticket['id'],'laneId':board['lanes'][1]['id'],'doneId':done['id'],'groupId':group['id']})
(root/'fixtures.json').write_text(json.dumps(cases,indent=2)+'\n')
with sqlite3.connect('coverage/single-startup-load/before.sqlite') as source,sqlite3.connect('coverage/single-startup-load/after.sqlite') as target:source.backup(target)
