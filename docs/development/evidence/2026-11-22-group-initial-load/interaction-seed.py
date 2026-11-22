import json, urllib.request, sqlite3
from pathlib import Path

BASE='http://127.0.0.1:3612'
def call(path, value):
    request=urllib.request.Request(BASE+path,data=json.dumps(value).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request) as response:return json.load(response)

cases=[]
for language in ['ja','en']:
    data=call('/api/boards',{'name':'Delivery review','laneNames':['Todo','Doing']})
    board=data['board']['id'];lanes=data['lanes'];done=call(f'/api/boards/{board}/lanes',{'name':'Done','isCompletionLane':True})
    group=call(f'/api/boards/{board}/groups',{'name':'Improve delivery'})
    other=call(f'/api/boards/{board}/groups',{'name':'Next iteration'})
    parent=call(f'/api/boards/{board}/tickets',{'title':'Review notification delivery','laneId':done['id'],'groupId':group['id']})
    child=call(f'/api/boards/{board}/tickets',{'title':'Check retry behavior','laneId':lanes[0]['id'],'parentTicketId':parent['id']})
    for i in range(4):call(f'/api/boards/{board}/tickets',{'title':f'Delivery check {i+1:02d}','laneId':lanes[i%2]['id'],'groupId':group['id'],'isArchived':i==3})
    extra=call(f'/api/boards/{board}/tickets',{'title':'Review mobile delivery','laneId':lanes[0]['id']})
    call(f'/api/boards/{board}/tickets',{'title':'Other Group work','laneId':lanes[0]['id'],'groupId':other['id']})
    cases.append({'language':language,'boardId':board,'groupId':group['id'],'otherGroupId':other['id'],'parentId':parent['id'],'childId':child['id'],'candidateId':extra['id'],'laneIds':[x['id'] for x in lanes],'doneId':done['id']})
Path('docs/development/evidence/2026-11-22-group-initial-load/fixtures.json').write_text(json.dumps(cases,indent=2)+'\n')
with sqlite3.connect('coverage/group-initial-load/before.sqlite') as source,sqlite3.connect('coverage/group-initial-load/after.sqlite') as target:source.backup(target)
