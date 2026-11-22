import json,sqlite3,urllib.request,time
from pathlib import Path
base='http://127.0.0.1:3610'
for attempt in range(30):
    try:
        urllib.request.urlopen(base+'/api/health').read();break
    except OSError:
        if attempt==29:raise
        time.sleep(0.5)
def post(path,value):
    request=urllib.request.Request(base+path,data=json.dumps(value).encode(),headers={'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(request) as response:return json.load(response)
board=post('/api/boards',{'name':'Delivery review','laneNames':['Todo','Doing']})
group=post(f'/api/boards/{board["board"]["id"]}/groups',{'name':'Improve notifications'})
ticket=post(f'/api/boards/{board["board"]["id"]}/tickets',{'title':'Review notification delivery','laneId':board['lanes'][1]['id'],'groupId':group['id'],'bodyMarkdown':'Isolated contrast fixture.'})
Path('docs/development/evidence/2026-11-22-editor-heading-contrast/fixture.json').write_text(json.dumps({'board':board,'group':group,'ticket':ticket},indent=2)+'\n')
with sqlite3.connect('coverage/editor-heading-contrast/before.sqlite') as source,sqlite3.connect('coverage/editor-heading-contrast/after.sqlite') as target:source.backup(target)
