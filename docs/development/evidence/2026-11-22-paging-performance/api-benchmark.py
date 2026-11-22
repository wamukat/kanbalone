import json,time,statistics,math,pathlib,urllib.request,http.client,platform,subprocess
OUT=pathlib.Path(__file__).parent;fixtures=json.loads((OUT/'fixtures.json').read_text());samples=[]
conn=http.client.HTTPConnection('127.0.0.1',3583,timeout=120)
for i in range(23):
 for f in fixtures[i%2:]+fixtures[:i%2]:
  n=f['count'];b=f['boardId'];done=next(l['id'] for l in f['lanes'] if l['isCompletionLane'])
  cases=[('all',f'/api/boards/{b}/tickets',n),('open',f'/api/boards/{b}/tickets?resolved=false',f['openCount']),('done',f'/api/boards/{b}/tickets?lane_id={done}',f['doneCount']),('search_one',f'/api/boards/{b}/tickets?q=needle',1),('search_none',f'/api/boards/{b}/tickets?q=absent_marker',0),('detail',f'/api/tickets/{f["sampleId"]}',None)]
  for name,url,count in cases:
   start=time.perf_counter();conn.request('GET',url);r=conn.getresponse();headers=time.perf_counter();raw=r.read();end=time.perf_counter();assert r.status==200,(url,r.status,raw[:300])
   parsed=json.loads(raw);assert count is None or len(parsed['tickets'])==count,(name,count)
   if i>=3:samples.append({'tickets':n,'operation':name,'iteration':i-3,'ms':(end-start)*1000,'headers_ms':(headers-start)*1000,'bytes':len(raw),'count':count})
 if i in [2,7,12,17,22]:print('round',i,flush=True)
summary=[]
for f in fixtures:
 for name in ['all','open','done','search_one','search_none','detail']:
  rows=[s for s in samples if s['tickets']==f['count'] and s['operation']==name];vals=sorted(s['ms'] for s in rows)
  summary.append({'tickets':f['count'],'operation':name,'n':len(vals),'p50_ms':round(statistics.median(vals),2),'p95_ms':round(vals[math.ceil(.95*len(vals))-1],2),'bytes':rows[0]['bytes'],'count':rows[0]['count']})
report={'method':'Native Node26 v1.0.0; isolated SQLite; localhost HTTP keepalive; full body received, parse excluded; 3 warmup +20 sequential measured rounds, alternating board order; no concurrent browser benchmarking','environment':{'platform':platform.platform(),'node':subprocess.check_output(['/Users/takuma/.volta/tools/image/node/26.13.1/bin/node','--version']).decode().strip(),'cpu':subprocess.check_output(['sysctl','-n','machdep.cpu.brand_string']).decode().strip(),'memory_bytes':subprocess.check_output(['sysctl','-n','hw.memsize']).decode().strip()},'summary':summary,'samples':samples}
(OUT/'api-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(summary,indent=2))
