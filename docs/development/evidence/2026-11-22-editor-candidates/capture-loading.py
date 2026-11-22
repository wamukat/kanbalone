import json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent;base='http://127.0.0.1:3625';records=[]
def b(*args):return subprocess.run(['agent-browser','--session','candidate1518states-v3',*args],check=True,capture_output=True,text=True,timeout=45).stdout.strip()
def v(js):return json.loads(json.loads(b('eval','JSON.stringify('+js+')')))
def shot(name):b('eval','new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');b('screenshot',str(root/f'after-{lang}-{prefix}{name}.png'))
for lang,width in [('ja',1440),('en',1440),('ja',390),('en',390)]:
 b('open',base)
 prefix='' if width==1440 else 'narrow-dark-'
 b('set','viewport',str(width),'1000' if width==1440 else '844');b('set','media','light' if width==1440 else 'dark')
 b('eval',f'localStorage.clear();localStorage.setItem("kanbalone:language",{json.dumps(lang)})');b('open',base+'/tickets/3')
 b('wait','--fn','document.querySelector("#editor-dialog").open');b('click','#header-edit-button')
 b('eval',"window.__originalFetch=window.fetch;window.__candidateAttempts=0;window.fetch=async function(input,init){const u=new URL(String(input),location.href);if(u.pathname==='/api/boards/1/tickets'&&u.searchParams.get('archived')==='all'){window.__candidateAttempts++;if(window.__candidateAttempts===1){await new Promise(r=>window.__releaseCandidate=r);return new Response(JSON.stringify({error:'Injected unavailable'}),{status:503,headers:{'content-type':'application/json'}});}}return window.__originalFetch(input,init)}")
 b('fill','#ticket-title','Draft retained during candidate loading');b('fill','#ticket-related-search','checklist');b('wait','--fn','Boolean(document.querySelector("#ticket-related-options[aria-busy=true]"))');shot('loading')
 def rect():return v('''Object.fromEntries(["ticket-title","ticket-related-search","ticket-related-toggle","ticket-children-row","save-ticket-button"].map(id=>{const r=(id==="save-ticket-button"?document.querySelector('#editor-form button[type="submit"]'):document.getElementById(id)).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}]}))''')
 loading=rect();b('eval','window.__releaseCandidate()');b('wait','--fn','Boolean(document.querySelector("[data-retry-relation-candidates]"))');shot('retry');error=rect()
 geometry=v('(()=>{const e=document.querySelector(".ticket-relation-status");const b=e.querySelector("button").getBoundingClientRect();const p=e.parentElement.getBoundingClientRect();return {scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,retryRight:b.right,containerRight:p.right}})()');assert geometry['scrollWidth']<=geometry['clientWidth'] and geometry['retryRight']<=geometry['containerRight'],geometry
 b('click','[data-retry-relation-candidates]');b('wait','--fn','Boolean(document.querySelector("[data-related-id=\\"6\\"]"))');shot('retried');success=rect()
 assert v('document.querySelector("#ticket-title").value')=='Draft retained during candidate loading'
 assert v('document.querySelector("#ticket-related-search").value')=='checklist'
 assert loading==error,(loading,error)
 # Success candidate result height follows existing behavior and is reported separately.
 records.append({'language':lang,'viewportWidth':width,'errorGeometry':geometry,'loadingErrorRectsEqual':True,'successRects':success,'injectedFailure':True,'titleRetained':True,'queryRetained':True,'fixedControlRects':loading,'retryCount':v('window.__candidateAttempts'),'focusAfterRetry':v('document.activeElement.id')})
 if width==1440:
  b('set','media','dark');shot('search-dark')
 # Leave unsaved fixture-only editor via reload, never submit.
 b('close')
(root/'loading-verification.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n');print(json.dumps(records))
