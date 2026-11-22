import subprocess,json,pathlib,urllib.request,sys
stage=sys.argv[1]; port=3580 if stage=='before' else 3581
out=pathlib.Path(__file__).resolve().parent;session='keyboard-'+stage
base=f'http://localhost:{port}'
def ab(*args):
 p=subprocess.run(['agent-browser','--session',session,*args],text=True,capture_output=True,timeout=40)
 if p.returncode: raise RuntimeError(p.stderr+p.stdout)
 return p.stdout.strip()
def inspect():
 return ab('eval',"JSON.stringify({query:document.querySelector('#search-input').value,focus:document.activeElement.outerHTML.slice(0,700),detail:document.querySelector('#editor-dialog').open,scrolls:[...document.querySelectorAll('*')].filter(e=>e.scrollTop||e.scrollLeft).map(e=>({tag:e.tagName,cls:e.className,id:e.id,x:e.scrollLeft,y:e.scrollTop}))})")
def data():return json.load(urllib.request.urlopen(base+'/api/boards/1/tickets?includeArchived=true'))
initial=data();traces=[]
for lang in ['ja','en']:
 for view in ['list','kanban']:
  ab('open',base+'/boards/1'+('/list' if view=='list' else ''))
  ab('eval',f"localStorage.setItem('kanbalone:language','{lang}');localStorage.setItem('kanbalone:theme','light')")
  ab('reload');ab('set','viewport','1440','1000');ab('wait','#search-input')
  ab('click','#search-input');ab('fill','#search-input','Notification');ab('wait','--text','Notification: Retry delivery')
  ab('snapshot','-i')
  prefix=f'{stage}-{view}-{lang}'
  ab('screenshot',str(out/(prefix+'-search.png')))
  keys=['ArrowDown']*(18 if view=='list' else 8)
  if view=='kanban':keys+=['ArrowRight','ArrowRight']
  for key in keys:ab('press',key)
  ab('snapshot','-i');selected=inspect();ab('screenshot',str(out/(prefix+'-selected.png')))
  ab('press','Enter');ab('snapshot','-i');detail=inspect()
  ab('screenshot',str(out/(prefix+'-detail.png')))
  ab('press','Escape');ab('snapshot','-i');returned=inspect();ab('screenshot',str(out/(prefix+'-return.png')))
  traces.append({'language':lang,'view':view,'keys':keys+['Enter','Escape'],'selected':selected,'detail':detail,'returned':returned})
  print(prefix,returned,flush=True)
final=data();record={'stage':stage,'base':base,'viewport':[1440,1000],'dataUnchanged':initial==final,'traces':traces}
(out/(stage+'-trace.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
assert initial==final,'navigation changed data'
