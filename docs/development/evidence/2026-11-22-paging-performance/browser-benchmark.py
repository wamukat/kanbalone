import subprocess,json,pathlib,statistics,math,os
OUT=pathlib.Path(__file__).parent;fixtures=json.loads((OUT/'fixtures.json').read_text());SESSION='paging-bench';BASE='http://127.0.0.1:3583'
def ab(*args):
 p=subprocess.run(['agent-browser','--session',SESSION,*args],capture_output=True,text=True,timeout=120)
 if p.returncode:raise RuntimeError(p.stdout+p.stderr)
 return p.stdout.strip()
def ev(js):
 v=ab('eval',js)
 while isinstance(v,str):
  try:v=json.loads(v)
  except json.JSONDecodeError:break
 return v
ab('open',BASE+'/boards/1/list');ab('set','viewport','1440','1000');ab('set','media','light');ab('wait','.list-row')
# A real empty board allows measuring board-selection-to-first-result with resources warm.
# No page reload/CLI wall time included. DOM mutation detection + two animation frames is a rendering proxy.
setup=ev("(async()=>{const r=await fetch('/api/boards',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Timing start',laneNames:['todo']})});return await r.json()})()")
empty=setup['board']['id'];ab('reload');ab('wait',f'[data-board-id="{empty}"]')
rows=json.loads((OUT/'browser-partial.json').read_text()) if os.environ.get('PAGING_RESUME') else []
for view in ['list','kanban']:
 for f in fixtures:
  if len([r for r in rows if r['view']==view and r['tickets']==f['count']])==10:continue
  bid=f['boardId'];n=f['count'];expected=f['openCount']+5 if view=='kanban' else None
  ab('open',f'{BASE}/boards/{bid}' + ('/list' if view=='list' else ''))
  ab('wait','.list-row' if view=='list' else '.ticket-card')
  for run in range(6):
   # Navigate to the empty board and choose target view before starting measurement.
   ab('open',f'{BASE}/boards/{empty}' + ('/list' if view=='list' else ''));ab('wait','#search-input');ab('snapshot','-i')
   ab('wait','--fn',"!document.querySelector('.ticket-card') && !document.querySelector('.list-row')")
   js=r'''(async()=>{const result={};const start=performance.now();let first=false;let busy=false;let frameReady=false;let longTasks=[];const po=new PerformanceObserver(l=>longTasks.push(...l.getEntries().map(x=>({start:x.startTime,duration:x.duration}))));po.observe({type:'longtask'});const originalFetch=window.fetch;const requests=[];window.fetch=async(...args)=>{const r=await originalFetch(...args);if(String(args[0]).includes('/api/boards/BOARD/tickets')){const clone=r.clone();requests.push(clone.arrayBuffer().then(b=>({bytes:b.byteLength,end:performance.now()-start})));}return r;};return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{obs.disconnect();window.fetch=originalFetch;po.disconnect();reject(new Error('render timeout'))},60000);const obs=new MutationObserver(check);obs.observe(document.querySelector('.main'),{subtree:true,childList:true});function check(){if(busy)return;const cards=[...document.querySelectorAll(SELECTOR)];if(!cards.length)return;busy=true;requestAnimationFrame(()=>requestAnimationFrame(async()=>{busy=false;const now=performance.now()-start;if(!first){result.first_ms=now;first=true;}const count=document.querySelectorAll(SELECTOR).length;if(COMPLETE){clearTimeout(timeout);obs.disconnect();window.fetch=originalFetch;po.disconnect();result.complete_ms=now;result.dom_count=count;result.longTasks=longTasks;result.requests=await Promise.all(requests);resolve(result);}else check();}));}document.querySelector('[data-board-id="BOARD"]').click();check();});})()'''
   sel="'.ticket-card'" if view=='kanban' else "'.list-row'"
   complete=f'count==={expected}' if view=='kanban' else 'count>0'
   js=js.replace('BOARD',str(bid)).replace('SELECTOR',sel).replace('COMPLETE',complete)
   r=ev(js);assert isinstance(r,dict),r
   assert ev("document.querySelectorAll('.list-row').length>0") == (view=='list'), 'Unexpected restored view'
   if run>0:rows.append({'tickets':n,'view':view,'operation':'board_open','iteration':run-1,**r})
   # Measure filtering from populated board, through the existing input event.
   js=r'''(async()=>{const start=performance.now();return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{obs.disconnect();reject(new Error('search timeout'))},30000);let busy=false;const obs=new MutationObserver(()=>{const matches=[...document.querySelectorAll(SELECTOR)];if(busy||matches.length!==1||!matches[0].textContent.includes('needle'))return;busy=true;requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timeout);obs.disconnect();resolve({ms:performance.now()-start,count:matches.length})}));});obs.observe(document.querySelector('.main'),{subtree:true,childList:true});const q=document.querySelector('#search-input');q.value='needle';q.dispatchEvent(new Event('input',{bubbles:true}));});})()'''.replace('SELECTOR',sel)
   r=ev(js)
   if run>0:rows.append({'tickets':n,'view':view,'operation':'search_one','iteration':run-1,**r})
   (OUT/'browser-partial.json').write_text(json.dumps(rows,indent=2)+'\n')
   print(view,n,run,'ok',flush=True)
   if run==5:ab('screenshot',str(OUT/f'{view}-{n}-search.png'))
   # Clear filter before leaving, otherwise board preference would persist into the next run.
   ev("document.querySelector('#search-input').value='';document.querySelector('#search-input').dispatchEvent(new Event('input',{bubbles:true}))")
   ab('wait','--fn',f'document.querySelectorAll({sel}).length>1')
   if view=='kanban':ab('wait','--fn',f'document.querySelectorAll({sel}).length==={expected}')
   if run==5:ab('screenshot',str(OUT/f'{view}-{n}-full.png'))
  print(view,n,'done',flush=True)
summary=[]
for view in ['list','kanban']:
 for f in fixtures:
  for op in ['board_open','search_one']:
   rr=[r for r in rows if r['tickets']==f['count'] and r['view']==view and r['operation']==op]
   fields=['first_ms','complete_ms'] if op=='board_open' else ['ms'];s={'tickets':f['count'],'view':view,'operation':op,'n':len(rr)}
   for key in fields:
    values=sorted(r[key] for r in rr);s[key+'_p50']=round(statistics.median(values),2);s[key+'_max']=round(max(values),2)
   summary.append(s)
(OUT/'browser-results.json').write_text(json.dumps({'method':'Warm resources; real board switch from empty board and input event search; page performance.now + DOM observer +2rAF; 1 warmup +5 samples; no cold-start/INP/human reaction claim','summary':summary,'samples':rows},indent=2)+'\n');print(json.dumps(summary,indent=2))
