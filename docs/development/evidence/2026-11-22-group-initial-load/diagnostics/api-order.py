import urllib.request,urllib.parse,json,time,statistics,pathlib,hashlib
out=pathlib.Path('coverage/render-next');records=[]
for bid in [1,2]:
 for run in range(4):
  for order in (['position_asc','id_asc'] if run%2==0 else ['id_asc','position_asc']):
   params=dict(groupId=bid,archived='all',limit=200,order=order);start=time.perf_counter();tickets=[];requests=0
   while True:
    data=json.load(urllib.request.urlopen('http://127.0.0.1:3606/api/boards/'+str(bid)+'/tickets?'+urllib.parse.urlencode(params)));tickets.extend(data['tickets']);requests+=1
    if not data['page']['nextCursor']:break
    params['cursor']=data['page']['nextCursor']
   ms=(time.perf_counter()-start)*1000
   content=hashlib.sha256(json.dumps(sorted(tickets,key=lambda t:t['id']),sort_keys=True).encode()).hexdigest()
   records.append(dict(boardId=bid,order=order,run=run,ms=ms,count=len(tickets),requests=requests,sortedContentHash=content));print(bid,order,run,round(ms,1),flush=True)
(out/'api-order.json').write_text(json.dumps(records,indent=2))
