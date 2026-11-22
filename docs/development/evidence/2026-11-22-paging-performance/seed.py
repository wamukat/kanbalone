import urllib.request,json,pathlib,time
BASE='http://127.0.0.1:3583';OUT=pathlib.Path(__file__).parent

def api(method,path,data=None):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data else None,headers={'Content-Type':'application/json'},method=method)
 return json.load(urllib.request.urlopen(req,timeout=600))
assert not api('GET','/api/boards')['boards'],'Use a fresh isolated instance; never replace existing data'
fixtures=[]
for n in [1000,10000]:
 lanes=[{'id':i+1,'name':name,'position':i,'isCompletionLane':i==3} for i,name in enumerate(['todo','doing','Acceptance','done'])]
 tags=[{'name':'engineering','color':'#557766'}];tickets=[]
 # 70% completed, 30% open; 500 ASCII body bytes, one tag, sparse relationships/comments.
 for i in range(1,n+1):
  lane=4 if i%10>=3 else i%10+1
  tickets.append({'id':i,'laneId':lane,'position':i,'title':f'Task {i:05d} '+('needle' if i==42 else 'notification review'),'bodyMarkdown':('Synthetic notification work. Verify retry behavior and delivery history. '*8)[:500],'priority':2,'isResolved':lane==4,'isArchived':False,'tags':[{'name':'engineering'}],'comments':[{'bodyMarkdown':'Synthetic verification note.'}] if i%20==0 else [],'parentTicketId':None,'blockerIds':[]})
 payload={'board':{'name':f'Paging lab {n}'},'lanes':lanes,'tags':tags,'tickets':tickets}
 started=time.perf_counter();r=api('POST','/api/boards/import',payload)
 f={'count':n,'boardId':r['board']['id'],'lanes':r['lanes'],'sampleId':next(t['id'] for t in r['tickets'] if 'needle' in t['title']),'openCount':int(n*.3),'doneCount':int(n*.7),'importSeconds':round(time.perf_counter()-started,2)}
 fixtures.append(f);print(json.dumps(f),flush=True)
 (OUT/'fixtures.json').write_text(json.dumps(fixtures,indent=2)+'\n')
