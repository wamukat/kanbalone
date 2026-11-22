import json
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PHASE = sys.argv[1]
BASE = 'http://127.0.0.1:' + ('3601' if PHASE == 'before' else '3602')
SESSION = 'create1511-capture'

def browser(*args):
    result = subprocess.run(['agent-browser', '--session', SESSION, *args], text=True, capture_output=True, check=True)
    return result.stdout.strip()

def evaluate(js):
    output = browser('eval', 'JSON.stringify(' + js + ')')
    return json.loads(json.loads(output))

def api(path):
    with urllib.request.urlopen(BASE + path) as response:
        return json.load(response)

browser('open', BASE)
browser('set', 'viewport', '1440', '1000')
browser('set', 'media', 'light')
results = []
for case in json.loads((ROOT / 'fixtures.json').read_text())[PHASE]:
    lang, view, board, ticket = case['language'], case['view'], case['boardId'], case['originId']
    selector = f'.list-ticket-link[data-open-ticket-id="{ticket}"]' if view == 'list' else f'[data-group-ticket="{ticket}"]' if view == 'group' else f'.ticket-card[data-ticket-id="{ticket}"] .ticket-link'
    browser('eval', f'localStorage.clear();localStorage.setItem("kanbalone:language", {json.dumps(lang)});localStorage.setItem("kanbalone:theme", "light")')
    browser('open', f'{BASE}/boards/{board}' + ('' if view == 'kanban' else '/' + view))
    browser('wait', '--fn', f'Boolean(document.querySelector({json.dumps(selector)}))')
    browser('focus', selector)
    start = evaluate('({focus:document.activeElement.textContent.trim(),language:document.documentElement.lang,scroll:[...document.querySelectorAll(".main,.lane-board,.ticket-list,.list-viewport,.group-content-panel")].filter(x=>x.getClientRects().length).map(x=>({className:x.className,x:x.scrollLeft,y:x.scrollTop}))})')
    browser('press', 'n')
    if PHASE == 'before':
        opened = evaluate('document.querySelector("#editor-dialog").open')
        assert opened is False
        browser('screenshot', str(ROOT / f'before-{lang}-{view}-n.png'))
        results.append({'case': case, 'start': start, 'nOpenedEditor': opened, 'ticketCount': len(api(f'/api/boards/{board}/tickets?archived=all')['tickets'])})
        continue
    browser('wait', '--fn', 'document.querySelector("#editor-dialog").open && document.activeElement.id === "ticket-title"')
    title = '配信結果を確認する' if lang == 'ja' else 'Check delivery results'
    browser('fill', '#ticket-title', title)
    browser('fill', '#ticket-body', 'Keyboard creation evaluation. **Persisted** after reload.')
    context = evaluate('({lane:document.querySelector("#ticket-lane").value,context:document.querySelector(".editor-group-context").textContent,focus:document.activeElement.id})')
    browser('screenshot', str(ROOT / f'after-{lang}-{view}-create.png'))
    browser('press', 'Control+Enter')
    browser('wait', '--fn', f'!document.querySelector("#editor-dialog").open && document.activeElement === document.querySelector({json.dumps(selector)})')
    browser('screenshot', str(ROOT / f'after-{lang}-{view}-returned.png'))
    returned = evaluate('({focus:document.activeElement.textContent.trim(),scroll:[...document.querySelectorAll(".main,.lane-board,.ticket-list,.list-viewport,.group-content-panel")].filter(x=>x.getClientRects().length).map(x=>({className:x.className,x:x.scrollLeft,y:x.scrollTop}))})')
    rows = api(f'/api/boards/{board}/tickets?archived=all')['tickets']
    created = [row for row in rows if row['title'] == title]
    assert len(created) == 1
    saved = api(f'/api/tickets/{created[0]["id"]}')
    assert saved['laneId'] == case['laneIds'][1 if view == 'kanban' else 0]
    assert saved['groupId'] == (case['groupId'] if view == 'group' else None)
    assert saved['parentTicketId'] is None
    assert saved['bodyMarkdown'] == 'Keyboard creation evaluation. **Persisted** after reload.'
    assert returned['focus'] == start['focus']
    browser('reload')
    new_selector = f'.list-ticket-link[data-open-ticket-id="{saved["id"]}"]' if view == 'list' else f'[data-group-ticket="{saved["id"]}"]' if view == 'group' else f'.ticket-card[data-ticket-id="{saved["id"]}"] .ticket-link'
    browser('wait', '--fn', f'Boolean(document.querySelector({json.dumps(new_selector)}))')
    results.append({'case': case, 'start': start, 'context': context, 'returned': returned, 'saved': saved, 'visibleAfterReload': True})
(ROOT / f'{PHASE}-verification.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'phase': PHASE, 'cases': len(results)}))
