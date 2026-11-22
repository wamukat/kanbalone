import json,subprocess,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent
PHASE=sys.argv[1]
BASE='http://127.0.0.1:'+('3603' if PHASE=='before' else '3604')
SESSION='group1514-capture'
def browser(*args):return subprocess.run(['agent-browser','--session',SESSION,*args],check=True,text=True,capture_output=True).stdout.strip()
def value(js):return json.loads(json.loads(browser('eval','JSON.stringify('+js+')')))
def api(path):
    with urllib.request.urlopen(BASE+path) as response:return json.load(response)
def retained():return value('([...document.querySelectorAll(".group-ticket-row")].every((x,i)=>x===window.__rows[i]&&x.isConnected))')
def image(name):browser('screenshot',str(ROOT/(PHASE+'-'+lang+'-'+name+'.png')))
browser('open',BASE);browser('set','viewport','1440','1000');browser('set','media','light')
results=[]
for case in json.loads((ROOT/'fixtures.json').read_text()):
    lang=case['language'];board=case['boardId'];group=case['groupId'];candidate=case['candidateId']
    browser('eval',f'localStorage.clear();localStorage.setItem("kanbalone:language",{json.dumps(lang)})')
    browser('open',f'{BASE}/boards/{board}/group')
    browser('wait','--fn',f'Boolean(document.querySelector("[data-group-ticket=\\"{case["childId"]}\\"]"))')
    browser('eval','window.__rows=[...document.querySelectorAll(".group-ticket-row")];true')
    initial=api(f'/api/boards/{board}/tickets?groupId={group}&archived=all')
    image('initial')
    browser('click','[data-group-action="edit-description"]')
    browser('fill','[name="description"]','Review delivery **checks**.')
    edit_retained=retained()
    browser('click','[data-group-action="preview-description"]')
    browser('wait','--fn','Boolean(document.querySelector(".group-description-preview strong"))')
    image('description-preview')
    preview_retained=retained()
    browser('click','[data-group-form="description"] button[type="submit"]')
    browser('wait','--fn','Boolean(document.querySelector(".group-description strong"))')
    saved=api(f'/api/groups/{group}')
    assert saved['descriptionMarkdown']=='Review delivery **checks**.'
    saved_retained=retained()
    browser('click','[data-group-action="add"]')
    browser('fill','#group-ticket-search','mobile')
    browser('wait','--fn',f'Boolean(document.querySelector("[data-group-pick=\\"{candidate}\\"]"))')
    image('candidate-search')
    search_retained=retained()
    browser('click',f'[data-group-pick="{candidate}"]')
    image('candidate-selected')
    selected_retained=retained()
    browser('click','[data-group-form="members"] button[type="submit"]')
    browser('wait','--fn',f'Boolean(document.querySelector("[data-group-ticket=\\"{candidate}\\"]"))')
    member=api(f'/api/tickets/{candidate}')
    assert member['groupId']==group
    assert member['title']=='Review mobile delivery'
    assert member['parentTicketId'] is None
    browser('reload')
    browser('wait','--fn',f'Boolean(document.querySelector("[data-group-ticket=\\"{candidate}\\"]"))')
    assert value('document.querySelector(".group-description").textContent.includes("Review delivery checks.")')
    current={row['id']:row for row in api(f'/api/boards/{board}/tickets?groupId={group}&archived=all')['tickets']}
    fields=['id','title','laneId','parentTicketId','isResolved','isArchived','priority','groupId']
    assert all(all(row[key]==current[row['id']][key] for key in fields) for row in initial['tickets'])
    results.append({'case':case,'initial':initial,'retained':{'edit':edit_retained,'preview':preview_retained,'save':saved_retained,'search':search_retained,'pick':selected_retained},'savedGroup':saved,'savedMember':member,'persistedAfterReload':True,'existingTicketsUnchanged':True})
    (ROOT/(PHASE+'-verification.json')).write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'phase':PHASE,'cases':len(results)}))
