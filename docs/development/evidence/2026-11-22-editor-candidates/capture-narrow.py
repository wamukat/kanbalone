import json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent;records=[]
def b(*args):return subprocess.run(['agent-browser','--session','candidate1518narrow',*args],check=True,capture_output=True,text=True,timeout=45).stdout.strip()
for phase,port in [('before',3624),('after',3625)]:
 base=f'http://127.0.0.1:{port}'
 b('open',base);b('set','viewport','390','844');b('set','media','dark')
 for lang in ['ja','en']:
  b('eval',f'localStorage.clear();localStorage.setItem("kanbalone:language",{json.dumps(lang)})');b('open',base+'/tickets/3');b('wait','--fn','document.querySelector("#editor-dialog").open');b('click','#header-edit-button');b('fill','#ticket-related-search','checklist');b('wait','--fn','Boolean(document.querySelector("[data-related-id=\\"6\\"]"))');b('screenshot',str(root/f'{phase}-{lang}-search-narrow-dark.png'))
  rect=json.loads(json.loads(b('eval','JSON.stringify((()=>{const r=document.querySelector("#editor-dialog").getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth}})())')))
  records.append({'phase':phase,'language':lang,'dialog':rect,'viewportSetBeforePageOpen':True})
(root/'narrow-verification.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(records));b('close')
