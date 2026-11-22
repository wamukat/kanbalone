import json,subprocess,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent;records=[]
def b(*args):return subprocess.run(['agent-browser','--session','candidate1518order',*args],check=True,capture_output=True,text=True,timeout=45).stdout.strip()
for phase,port in [('before',3624),('after',3625)]:
 base=f'http://127.0.0.1:{port}'
 request=urllib.request.Request(base+'/api/boards/1/tickets',data=json.dumps({'title':'Urgent delivery follow-up','laneId':2,'priority':4,'blockerIds':[3]}).encode(),headers={'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(request) as r:created=json.load(r)
 b('open',base);b('set','viewport','1440','1000');b('set','media','light');b('eval','localStorage.clear();localStorage.setItem("kanbalone:language","en")');b('open',base+'/tickets/3');b('wait','--fn','document.querySelector("#editor-dialog").open && document.querySelectorAll(".ticket-relation-chip-blocks").length===2');b('screenshot',str(root/f'{phase}-en-blocks-order.png'))
 labels=json.loads(json.loads(b('eval','JSON.stringify([...document.querySelectorAll(".ticket-relation-chip-blocks")].map(x=>x.textContent.trim()))')))
 records.append({'phase':phase,'newFixtureTicketId':created['id'],'blocks':labels})
(root/'blocks-order.json').write_text(json.dumps(records,indent=2)+'\n');print(json.dumps(records));b('close')
