import json,urllib.request
from pathlib import Path
# Only empty, disposable comparison instances may be seeded.
for port in [3473, 3474]:
 existing = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/api/boards'))
 if existing.get('boards'):
  raise SystemExit(f'Refusing to seed non-empty instance on {port}')
all_data={}
for port in [3473,3474]:
 def call(path,data,method='POST'):
  req=urllib.request.Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'},method=method)
  return json.load(urllib.request.urlopen(req))
 other=call('/api/boards',{'name':'Other project','laneNames':['Inbox','Ready']})
 b=call('/api/boards',{'name':'UX evidence','laneNames':['Todo','Doing','Acceptance','Done']})
 bid=b['board']['id'];lane=b['lanes'][0]['id']; tids=[]
 for title,body,extra in [
 ('Review first-use experience','- [x] Existing patterns reviewed\n- [ ] Confirm keyboard flow',{}),
 ('Ship onboarding changes','Waiting for the review',{'blockerIds':[1]}),
 ('Move and continue editing','Keep this body after moving',{}),
 ('Archived review note','Restore this ticket',{'isArchived':True}),
 ('Previously imported issue','A local duplicate-import fixture',{}),
 ('Parent work item','Keep parent-child membership together',{}),
 ('Child work item','Review together',{'parentTicketId':6})]:
  t=call(f'/api/boards/{bid}/tickets',{'laneId':lane,'title':title,'bodyMarkdown':body,**extra});tids.append(t['id'])
 g=call(f'/api/boards/{bid}/groups',{'name':'First-use experience','descriptionMarkdown':'Keep the workflow simple.'})
 payload={'ticketIds':[6],'groupId':g['id']};prev=call(f'/api/boards/{bid}/group-memberships/preview',payload);call(f'/api/boards/{bid}/group-memberships',{**payload,'expectedToken':prev['expectedToken']},'PUT')
 inactive=call('/api/boards',{'name':'Finished work','laneNames':['Todo']})
 ig=call(f"/api/boards/{inactive['board']['id']}/groups",{'name':'Completed milestone'})
 t=call(f"/api/boards/{inactive['board']['id']}/tickets",{'laneId':inactive['lanes'][0]['id'],'title':'Archived milestone','isArchived':True,'groupId':ig['id']})
 for n in range(4):call('/api/boards',{'name':f'Project {n+1}','laneNames':['Todo']})
 all_data[str(port)]={'board':bid,'lane':lane,'tickets':tids,'group':g['id'],'inactiveBoard':inactive['board']['id']}
Path(__file__).with_name('fixtures.json').write_text(json.dumps(all_data,indent=2))
print(all_data)
