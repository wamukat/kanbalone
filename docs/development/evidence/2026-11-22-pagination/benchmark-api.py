import http.client,json,time,statistics,pathlib,math
OUT=pathlib.Path(__file__).parent
fixtures=json.loads((OUT.parent/'2026-11-22-paging-performance/fixtures.json').read_text())
conn=http.client.HTTPConnection('127.0.0.1',3592,timeout=120)
def get(url):
 conn.request('GET',url);r=conn.getresponse();body=r.read();assert r.status==200,(r.status,body[:200]);return json.loads(body),len(body)
rows=[]
for run in range(13):
 for f in fixtures[run%2:]+fixtures[:run%2]:
  bid=f['boardId'];done=next(x['id'] for x in f['lanes'] if x['isCompletionLane'])
  for op in ['legacy_all','done_first5','done_next50','collect_all200']:
   base=f'/api/boards/{bid}/tickets'
   if op=='done_next50':first,_=get(base+f'?lane_id={done}&order=completed_desc&limit=5')
   start=time.perf_counter();size=0;requests=0;ids=[]
   if op=='legacy_all':r,size=get(base);requests=1;ids=[t['id'] for t in r['tickets']];assert len(ids)==f['count']
   elif op.startswith('done_'):
    url=base+f'?lane_id={done}&order=completed_desc&limit='+('5' if op=='done_first5' else '50&cursor='+first['page']['nextCursor'])
    r,size=get(url);requests=1;ids=[t['id'] for t in r['tickets']];assert len(ids)==(5 if op=='done_first5' else 50);assert r['page']['total']==f['doneCount']
    if op=='done_next50':assert not set(ids)&{t['id'] for t in first['tickets']}
   else:
    cursor=None
    while True:
     r,b=get(base+'?limit=200&order=id_asc'+('&cursor='+cursor if cursor else ''));size+=b;requests+=1;ids.extend(t['id'] for t in r['tickets']);cursor=r['page']['nextCursor']
     if cursor is None:break
    assert len(ids)==len(set(ids))==f['count'];assert ids==sorted(ids)
   elapsed=(time.perf_counter()-start)*1000
   if run>=3:rows.append({'count':f['count'],'operation':op,'iteration':run-3,'ms':elapsed,'bytes':size,'requests':requests,'returned':len(ids)})
 print('round',run,flush=True)
summary=[]
for f in fixtures:
 for op in ['legacy_all','done_first5','done_next50','collect_all200']:
  samples=[x for x in rows if x['count']==f['count'] and x['operation']==op];v=sorted(x['ms'] for x in samples)
  summary.append({'count':f['count'],'operation':op,'n':len(v),'p50_ms':round(statistics.median(v),2),'p95_ms':round(v[math.ceil(len(v)*.95)-1],2),'bytes':samples[0]['bytes'],'requests':samples[0]['requests'],'returned':samples[0]['returned']})
(OUT/'api-after.json').write_text(json.dumps({'method':'Node26.13.1; copied original 1k/10k fixture DB; localhost keepalive; 3 warmup +10 measured; includes JSON parse + validation; next50 excludes first5 setup; sequential no browser benchmark','summary':summary,'samples':rows},indent=2)+'\n')
print(json.dumps(summary,indent=2))
