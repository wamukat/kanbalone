import subprocess,json,pathlib,urllib.request,sys,os,hashlib,datetime
stage=sys.argv[1];port=int(sys.argv[2]) if len(sys.argv)>2 else (3590 if stage=='before' else 3591)
BASE=f'http://127.0.0.1:{port}';OUT=pathlib.Path(__file__).resolve().parent;SESSION='paging-'+stage

SOURCE=pathlib.Path('/Users/takuma/workspace/kanbalone-keyboard' if stage=='before' else '/Users/takuma/workspace/kanbalone-paging')
def fingerprint():
 files={str(p.relative_to(SOURCE)):hashlib.sha256(p.read_bytes()).hexdigest() for d in ['src','public'] for p in sorted((SOURCE/d).rglob('*')) if p.is_file()}
 return {'files':files,'sha256':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()}
sourceStart=fingerprint();started=datetime.datetime.now(datetime.timezone.utc).isoformat()

def ab(*args):
 p=subprocess.run(['agent-browser','--session',SESSION,*args],capture_output=True,text=True,timeout=90)
 if p.returncode:raise RuntimeError(p.stdout+p.stderr)
 return p.stdout.strip()
def ev(js):
 r=ab('eval',js)
 while isinstance(r,str):
  try:r=json.loads(r)
  except:break
 return r
def api(path):return json.load(urllib.request.urlopen(BASE+path))
def inspect():return ev("""JSON.stringify({url:location.pathname,doneIds:[...document.querySelectorAll('.ticket-list[data-lane-id="4"] .ticket-card')].map(e=>+e.dataset.ticketId),groupIds:[...document.querySelectorAll('[data-group-ticket]')].map(e=>+e.dataset.groupTicket),listIds:[...document.querySelectorAll('.list-row')].map(e=>e.textContent.match(/#(\\d+)/)?.[1]),more:document.querySelector('.completion-show-more')?.textContent,focus:document.activeElement?.outerHTML.slice(0,400),scrolls:[...document.querySelectorAll('*')].filter(e=>e.scrollTop||e.scrollLeft).map(e=>({id:e.id,cls:e.className,x:e.scrollLeft,y:e.scrollTop})),requests:performance.getEntriesByType('resource').filter(e=>/\\/api\\/boards\\/\\d+\\/tickets(\\?|$)/.test(e.name)).map(e=>({url:e.name,bytes:e.decodedBodySize,ms:e.duration}))})""")
def snap(name):
 ab('screenshot',str(OUT/f'{stage}-{name}.png'));trace[:]=[t for t in trace if t['name']!=name];trace.append({'name':name,**inspect()})
initial=api('/api/boards/1/export');trace=json.loads((OUT/f'{stage}-trace.json').read_text())['trace'] if os.environ.get('CAPTURE_RESUME') else []
for lang in ['ja','en']:
 for view in ['kanban','list','group']:
  finalname=f"{view}-{lang}-"+{'kanban':'priority','list':'parent-child','group':'family'}[view]
  if any(t['name']==finalname for t in trace):continue
  url=BASE+'/boards/1'+('' if view=='kanban' else '/'+view)
  ab('open',url);ev(f"localStorage.clear();localStorage.setItem('kanbalone:language','{lang}');localStorage.setItem('kanbalone:theme','light')")
  ab('reload');ab('set','viewport','1440','1000');ab('wait','.ticket-card' if view=='kanban' else '.list-row' if view=='list' else '.group-ticket-row')
  # Wait for restored view, then use the real reset action. Clearing localStorage
  # during asynchronous bootstrap alone can be overwritten by the previous view.
  if view!='group':
   if ev("!document.querySelector('#reset-filters-button').hidden"):
    ab('click','#reset-filters-button')
   ab('wait','--fn',"!document.querySelector('[data-priority-filter].active') && document.querySelector('#search-input').value===''")
   ab('wait','.ticket-card' if view=='kanban' else '.list-row')
  if view=='kanban':
   ab('wait','--fn',"document.querySelectorAll('.ticket-list[data-lane-id=\"4\"] .ticket-card').length===5")
   ev("document.querySelector('.lane-board').scrollLeft=10000")
   snap(f'{view}-{lang}-initial')
   ab('click','.completion-show-more');ab('wait','--fn',"document.querySelectorAll('.ticket-list[data-lane-id=\"4\"] .ticket-card').length===55")
   ev("document.querySelector('.ticket-list[data-lane-id=\"4\"]').scrollTop=0")
   snap(f'{view}-{lang}-55')
   ab('click','.ticket-card[data-ticket-id="141"] button.ticket-link');ab('wait','#editor-dialog[open]');snap(f'{view}-{lang}-detail')
   ab('press','Escape');ab('wait','--fn',"!document.querySelector('#editor-dialog').open");snap(f'{view}-{lang}-return')
   ab('click','[data-filter-expand="priority"]');ab('click','[data-priority-filter="urgent"]');ab('wait','--fn',"document.querySelector('.ticket-list[data-lane-id=\"4\"] .ticket-card[data-ticket-id=\"147\"]')")
   snap(f'{view}-{lang}-priority')
  elif view=='list':
   snap(f'{view}-{lang}-initial')
   ab('fill','#search-input','Verify');ab('wait','--fn',"document.querySelectorAll('.list-row').length===2");snap(f'{view}-{lang}-parent-child')
  else:
   ab('wait','--fn',"document.querySelectorAll('[data-group-ticket]').length===258")
   snap(f'{view}-{lang}-initial')
   ab('focus','[data-group-action="archive"]');ab('press','Enter');ab('wait','--fn',"document.querySelectorAll('[data-group-ticket]').length===260");snap(f'{view}-{lang}-archives')
   ev("document.querySelector('[data-group-ticket=\"1\"]').scrollIntoView({block:'start'})")
   snap(f'{view}-{lang}-family')
  (OUT/f'{stage}-trace.json').write_text(json.dumps({'stage':stage,'base':BASE,'viewport':[1440,1000],'trace':trace},ensure_ascii=False,indent=2)+'\n')
  print(stage,lang,view,'ok',flush=True)
final=api('/api/boards/1/export')
# Export generatedAt changes on every request; ticket/board payload must remain equal.
for key in ['exportedAt','exported_at']:initial.pop(key,None);final.pop(key,None)
(OUT/f'{stage}-persisted.json').write_text(json.dumps({'unchanged':initial==final,'before':initial,'after':final},ensure_ascii=False,indent=2)+'\n')
assert initial==final,'Capture changed stored data'
sourceEnd=fingerprint()
(OUT/f'{stage}-revision.json').write_text(json.dumps({'baseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=SOURCE,text=True).strip(),'sourceRoot':str(SOURCE),'startedAt':started,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceUnchangedDuringCapture':sourceStart==sourceEnd,'start':sourceStart,'end':sourceEnd},indent=2)+'\n')
assert sourceStart==sourceEnd,'Source changed during capture; recapture on final source'
ab('close')
