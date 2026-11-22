import json,subprocess,sys
from pathlib import Path
root=Path(__file__).resolve().parent;phase=sys.argv[1];base='http://127.0.0.1:'+('3624' if phase=='before' else '3625');case=json.loads((root/'fixture.json').read_text());records=[]
def b(*args):return subprocess.run(['agent-browser','--session','candidate1518',*args],check=True,capture_output=True,text=True).stdout.strip()
def v(js):return json.loads(json.loads(b('eval','JSON.stringify('+js+')')))
def shot(name):b('eval','new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');b('screenshot',str(root/f'{phase}-{lang}-{name}.png'))
def openboard():
 b('open',base+'/boards/'+str(case['boardId']));b('wait','--fn','Boolean(document.querySelector(".ticket-card .ticket-link"))')
def close():
 b('press','Escape');b('press','Escape');b('wait','--fn','!document.querySelector("#editor-dialog").open')
b('open',base);b('set','viewport','1440','1000');b('set','media','light')
for lang in ['ja','en']:
 b('eval',f'localStorage.clear();localStorage.setItem("kanbalone:language",{json.dumps(lang)})');openboard()
 b('focus',f'.ticket-card[data-ticket-id="{case["subjectId"]}"] .ticket-link');b('press','n');b('wait','--fn','document.querySelector("#editor-dialog").open && document.activeElement.id==="ticket-title"');shot('new');close()
 b('click',f'.ticket-card[data-ticket-id="{case["subjectId"]}"] .ticket-link');b('wait','--fn','document.querySelector("#editor-dialog").open && !document.querySelector("#ticket-view").hidden');shot('detail')
 detail=v('document.querySelector("#ticket-view").innerText');assert 'Publish delivery update' in detail and 'Archived interface notes' in detail
 b('click','#header-edit-button');b('wait','--fn','!document.querySelector("#editor-form").hidden');shot('edit')
 b('fill','#ticket-related-search','checklist');b('wait','--fn',f'Boolean(document.querySelector("#ticket-related-options [data-related-id=\\"{case["candidateId"]}\\"]"))');shot('search')
 records.append({'lang':lang,'detailContainsReverseDependencyAndArchivedRelation':True,'candidateId':case['candidateId'],'query':v('document.querySelector("#ticket-related-search").value'),'focused':v('document.activeElement.id')})
 close();b('click',f'.ticket-card[data-ticket-id="{case["childId"]}"] .ticket-link');b('wait','--fn','document.querySelector("#editor-dialog").open');shot('child-detail');close()
(root/f'{phase}-capture.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n');print(json.dumps(records));b('close')
