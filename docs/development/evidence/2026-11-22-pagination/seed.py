import json,urllib.request,pathlib,sys
BASE=sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:3590';OUT=pathlib.Path(__file__).parent

def api(method,path,data=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,headers={'Content-Type':'application/json'},method=method)
 return json.load(urllib.request.urlopen(req,timeout=120))
assert not api('GET','/api/boards')['boards'],'Fresh isolated DB required'
lanes=[{'id':i+1,'name':n,'position':i,'isCompletionLane':i==3} for i,n in enumerate(['todo','doing','Acceptance','done'])]
tickets=[]
for i in range(1,261):
 lane=4 if i>140 else (i%3)+1
 title=f'Notification {i:03}: '+('Verify parent across pages' if i==1 else 'Verify child across pages' if i==205 else 'Review delivery behavior')
 tickets.append({'id':i,'laneId':lane,'position':i,'title':title,'bodyMarkdown':'## Acceptance\n\nReview the result and record the outcome. Synthetic verification data.','priority':4 if i%7==0 else 2,'isResolved':lane==4,'isArchived':i in [250,251],'tags':[{'name':'review'}],'comments':[],'parentTicketId':1 if i==205 else None,'blockerIds':[240] if i==2 else []})
payload={'board':{'name':'Pagination verification'},'lanes':lanes,'tags':[{'name':'review','color':'#557766'}],'tickets':tickets}
r=api('POST','/api/boards/import',payload);b=r['board']['id'];g=api('POST',f'/api/boards/{b}/groups',{'name':'Improve notification delivery','descriptionMarkdown':'Review notification delivery across the complete ticket set.'})
for start in range(1,261,100):
 body={'ticketIds':list(range(start,min(start+100,261))),'groupId':g['id']}
 p=api('POST',f'/api/boards/{b}/group-memberships/preview',body)
 api('PUT',f'/api/boards/{b}/group-memberships',{**body,'expectedToken':p['expectedToken']})
export=api('GET',f'/api/boards/{b}/export');(OUT/'fixture-export.json').write_text(json.dumps(export,ensure_ascii=False,indent=2)+'\n')
(OUT/'fixture.json').write_text(json.dumps({'base':BASE,'boardId':b,'groupId':g['id'],'tickets':260,'open':140,'done':120,'archived':2,'parent':1,'child':205,'blocker':240,'beforeCommit':'c4ea90458b0cf1652f89a0f589c15e5ee77ec561'},indent=2)+'\n')
print('Fixture ready',b,g['id'])
