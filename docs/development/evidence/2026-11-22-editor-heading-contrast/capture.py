import json,subprocess,sys,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent
phase=sys.argv[1];base='http://127.0.0.1:'+('3610' if phase=='before' else '3611');session='contrast1513'
fixture=json.loads((ROOT/'fixture.json').read_text());board=fixture['board']['board']['id'];group=fixture['group']['id'];ticket=fixture['ticket']['id']
def browser(*args):return subprocess.run(['agent-browser','--session',session,*args],check=True,text=True,capture_output=True).stdout.strip()
def value(js):return json.loads(json.loads(browser('eval','JSON.stringify('+js+')')))
def api(path):
    with urllib.request.urlopen(base+path) as response:return json.load(response)
browser('open',base);browser('set','viewport','1280','720');cases=[]
for language in ['ja','en']:
    for theme in ['light','dark']:
        browser('set','media',theme)
        browser('eval',f'localStorage.clear();localStorage.setItem("kanbalone:language",{json.dumps(language)})')
        browser('open',f'{base}/boards/{board}/group')
        selector=f'[data-group-ticket="{ticket}"]'
        browser('wait','--fn',f'Boolean(document.querySelector({json.dumps(selector)}))')
        browser('focus',selector);browser('press','n')
        browser('wait','--fn','document.querySelector("#editor-dialog").open && document.activeElement.id==="ticket-title"')
        title=('通知の配信を確認する' if language=='ja' else 'Review notification delivery')+' '+theme
        browser('fill','#ticket-title',title)
        measured=value('({language:document.documentElement.lang,dark:matchMedia("(prefers-color-scheme: dark)").matches,focus:document.activeElement.id,context:document.querySelector(".editor-group-context").textContent,headings:[...document.querySelectorAll("#editor-form .editor-field-label")].filter(x=>x.getClientRects().length).map(x=>({text:x.textContent.trim(),color:getComputedStyle(x).color,background:getComputedStyle(document.querySelector("#editor-dialog")).backgroundColor,rect:x.getBoundingClientRect().toJSON()})),save:document.querySelector("#save-ticket-button").getBoundingClientRect().toJSON()})')
        browser('screenshot',str(ROOT/f'{phase}-{language}-{theme}.png'))
        browser('press','Control+Enter')
        browser('wait','--fn',f'!document.querySelector("#editor-dialog").open && document.activeElement===document.querySelector({json.dumps(selector)})')
        rows=api(f'/api/boards/{board}/tickets?groupId={group}&archived=all')['tickets'];created=[x for x in rows if x['title']==title];assert len(created)==1
        saved=api(f'/api/tickets/{created[0]["id"]}');assert saved['groupId']==group and saved['laneId']==fixture['board']['lanes'][0]['id'] and saved['parentTicketId'] is None
        browser('reload');browser('wait','--fn',f'Boolean(document.querySelector("[data-group-ticket=\\"{saved["id"]}\\"]"))')
        cases.append({'language':language,'theme':theme,'measured':measured,'saved':saved,'visibleAfterReload':True,'returnedToOrigin':True})
        (ROOT/f'{phase}-verification.json').write_text(json.dumps(cases,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'phase':phase,'cases':len(cases)}))
