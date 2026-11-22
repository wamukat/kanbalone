import json,sqlite3,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent
base='http://127.0.0.1:3624'
def req(path,data,method='POST'):
 with urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'},method=method)) as r:return json.load(r)
b=req('/api/boards',{'name':'Delivery review','laneNames':['Todo','Doing']});bid=b['board']['id'];lane=b['lanes'][1]['id']
done=req(f'/api/boards/{bid}/lanes',{'name':'Done','isCompletionLane':True})
def ticket(title,**kw):return req(f'/api/boards/{bid}/tickets',{'title':title,'laneId':lane,**kw})
blocker=ticket('Confirm API contract')
related=ticket('Archived interface notes',isArchived=True)
subject=ticket('Prepare release checklist',bodyMarkdown='Review the delivery checks before publishing.',blockerIds=[blocker['id']],relatedIds=[related['id']])
child=ticket('Verify release notes',parentTicketId=subject['id'])
blocked=ticket('Publish delivery update',blockerIds=[subject['id']])
candidate=ticket('Archived test checklist',isArchived=True)
complete=ticket('Completed browser checklist',laneId=done['id'])
(root/'fixture.json').write_text(json.dumps({'boardId':bid,'laneId':lane,'subjectId':subject['id'],'childId':child['id'],'blockerId':blocker['id'],'relatedId':related['id'],'blockedId':blocked['id'],'candidateId':candidate['id']},indent=2)+'\n')
with sqlite3.connect('coverage/editor-candidates/before.sqlite') as a,sqlite3.connect('coverage/editor-candidates/after.sqlite') as b:a.backup(b)
