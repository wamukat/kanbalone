import json,pathlib,time,http.client,statistics,urllib.request
OUT=pathlib.Path(__file__).parent;fixtures=json.loads((OUT.parent/'2026-11-22-paging-performance/fixtures.json').read_text());rows=[]
for i in range(100):
 try:urllib.request.urlopen('http://127.0.0.1:3593/api/health',timeout=1).read();break
 except OSError:time.sleep(.1)
else:raise RuntimeError('control unavailable')
connections={name:http.client.HTTPConnection('127.0.0.1',port,timeout=120) for name,port in [('before',3593),('after',3592)]}
for run in range(13):
 for f in fixtures[run%2:]+fixtures[:run%2]:
  done=next(x['id'] for x in f['lanes'] if x['isCompletionLane']);base=f'/api/boards/{f["boardId"]}/tickets'
  cases=[('before','all',base,f['count']),('after','all',base,f['count']),('before','completion_initial',base+f'?lane_id={done}',f['doneCount']),('after','completion_initial',base+f'?lane_id={done}&order=completed_desc&limit=5',5)]
  if run%2:cases=list(reversed(cases))
  for version,operation,url,expected in cases:
   c=connections[version];start=time.perf_counter();c.request('GET',url);r=c.getresponse();body=r.read();data=json.loads(body);assert r.status==200 and len(data['tickets'])==expected;ms=(time.perf_counter()-start)*1000
   if run>=3:rows.append({'version':version,'operation':operation,'count':f['count'],'iteration':run-3,'ms':ms,'bytes':len(body),'returned':expected})
summary=[]
for f in fixtures:
 for operation in ['all','completion_initial']:
  for version in ['before','after']:
   rr=[x for x in rows if x['count']==f['count'] and x['operation']==operation and x['version']==version];v=sorted(x['ms'] for x in rr)
   summary.append({'version':version,'operation':operation,'count':f['count'],'n':len(v),'p50_ms':round(statistics.median(v),2),'max_ms':round(max(v),2),'bytes':rr[0]['bytes'],'returned':rr[0]['returned']})
(OUT/'api-paired.json').write_text(json.dumps({'method':'Both explicit Node26.13.1; same original fixture copied to control and candidate; before c4ea904, after fingerprint inafter-revision.json; warmup3+10alternating pairs; localhost keepalive, includesbodyreceive+JSONparse+countvalidation; no other tests/browserbenchmarkrunning. completion_initial compares previousfullcompletedlane retrieval versus newfirst5, not identicalresultsets.','summary':summary,'samples':rows},indent=2)+'\n');print(json.dumps(summary,indent=2))
