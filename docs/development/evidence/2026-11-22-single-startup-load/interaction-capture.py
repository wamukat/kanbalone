import json,subprocess,sys,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent;phase=sys.argv[1];base='http://127.0.0.1:'+('3619' if phase=='before' else '3620')
def browser(*args):return subprocess.run(['agent-browser','--session','startup1517',*args],check=True,text=True,capture_output=True).stdout.strip()
def value(js):return json.loads(json.loads(browser('eval','JSON.stringify('+js+')')))
def api(path):
    with urllib.request.urlopen(base+path) as r:return json.load(r)
def shot(name):browser('screenshot',str(root/f'{phase}-{lang}-{name}.png'))
browser('open',base);browser('set','viewport','1440','1000');browser('set','media','light');results=[]
for case in json.loads((root/'fixtures.json').read_text()):
    lang=case['language'];bid=case['boardId'];origin=case['originId'];routes=[]
    for view in ['kanban','list','group']:
        prefs={'version':1,'activeBoardId':1,'boards':{'1':{'viewMode':'kanban'}}}
        browser('eval',f'localStorage.clear();localStorage.setItem("kanbalone:language",{json.dumps(lang)});localStorage.setItem("kanbalone:ui-preferences",{json.dumps(json.dumps(prefs))})')
        browser('open',f'{base}/boards/{bid}'+('' if view=='kanban' else '/'+view))
        selector=f'.ticket-card[data-ticket-id="{origin}"]' if view=='kanban' else f'[data-group-ticket="{origin}"]' if view=='group' else '.list-row'
        browser('wait','--fn',f'Boolean(document.querySelector({json.dumps(selector)}))')
        browser('eval','new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
        shot(view)
        routes.append({'view':view,'requests':value('performance.getEntriesByType("resource").filter(x=>new URL(x.name).pathname.startsWith("/api/boards/")).map(x=>new URL(x.name).pathname+new URL(x.name).search)'),'queriedDomIdsIncludingHidden':value('([...document.querySelectorAll(".ticket-card[data-ticket-id],.list-row[data-ticket-id],[data-group-ticket]")].map(x=>Number(x.dataset.ticketId||x.dataset.groupTicket)))')})
    browser('open',f'{base}/boards/{bid}')
    lane=f'.ticket-list[data-lane-id="{case["doneId"]}"]'
    browser('wait','--fn',f'document.querySelectorAll({json.dumps(lane+" .ticket-card")}).length===5')
    browser('click','.completion-show-more')
    browser('wait','--fn',f'document.querySelectorAll({json.dumps(lane+" .ticket-card")}).length===7')
    shot('more')
    selector=f'.ticket-card[data-ticket-id="{origin}"] .ticket-link'
    browser('focus',selector);browser('press','n')
    browser('wait','--fn','document.querySelector("#editor-dialog").open && document.activeElement.id==="ticket-title"')
    title=f'{lang} keyboard startup check';browser('fill','#ticket-title',title);browser('press','Control+Enter')
    browser('wait','--fn',f'!document.querySelector("#editor-dialog").open && document.activeElement===document.querySelector({json.dumps(selector)})')
    rows=api(f'/api/boards/{bid}/tickets?archived=all')['tickets'];created=[x for x in rows if x['title']==title];assert len(created)==1
    saved=api(f'/api/tickets/{created[0]["id"]}');assert saved['laneId']==case['laneId'] and saved['groupId'] is None
    browser('reload');browser('wait','--fn',f'Boolean(document.querySelector({json.dumps(".ticket-card[data-ticket-id="+chr(34)+str(saved["id"])+chr(34)+"]")}))')
    results.append({'case':case,'routes':routes,'completionBefore':5,'completionExpanded':7,'saved':saved,'originRestored':True,'visibleAfterReload':True})
    (root/f'{phase}-verification.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'phase':phase,'cases':len(results)}))
