import json, subprocess, sys, urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent
phase = sys.argv[1]
base = 'http://127.0.0.1:' + ('3630' if phase == 'before' else '3631')
session = 'list1519-' + phase

def browser(*args):
    return subprocess.run(['agent-browser', '--session', session, *args], check=True, text=True, capture_output=True).stdout.strip()

def value(expression):
    return json.loads(json.loads(browser('eval', 'JSON.stringify(' + expression + ')')))

def api(path):
    with urllib.request.urlopen(base + path) as response:
        return json.load(response)

def wait(expression):
    browser('wait', '--fn', expression)

def capture(name):
    browser('eval', 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    browser('screenshot', str(root / f'{phase}-{lang}-{name}.png'))
    return value('''Object.fromEntries(['.list-header','.list-viewport','.list-actions','.list-selection-count'].map(s=>{
      const e=document.querySelector(s),r=e?.getBoundingClientRect();return [s,r?{x:r.x,y:r.y,width:r.width,height:r.height,text:e?.classList.contains('list-selection-count')?e.textContent:null}:null]}))''')

records = []
browser('open', base)
for case in json.loads((root / 'fixtures.json').read_text()):
    lang, bid, todo = case['language'], case['boardId'], case['todoId']
    browser('set', 'viewport', '1440', '1000')
    browser('set', 'media', 'light')
    browser('eval', f'localStorage.clear();localStorage.setItem("kanbalone:language",{json.dumps(lang)})')
    browser('open', f'{base}/boards/{bid}/list')
    wait('Boolean(document.querySelector("#list-select-all"))')
    initial = api(f'/api/boards/{bid}/tickets?archived=all')['tickets']
    assert len(initial) == 240 and not any(t['isArchived'] for t in initial)
    browser('check', '#list-select-all')
    wait('document.querySelector(".list-selection-count")?.textContent.includes("240")')
    rectangles = {'all': capture('all')}
    first = value('Number(document.querySelector("[data-list-ticket-id]").dataset.listTicketId)')
    browser('uncheck', f'[data-list-ticket-id="{first}"]')
    wait('document.querySelector("#list-select-all").indeterminate && document.querySelector(".list-selection-count").textContent.includes("239")')
    rectangles['partial'] = capture('partial')
    browser('select', '#lane-filter', str(todo))
    expected = sorted(t['id'] for t in initial if t['laneId'] == todo and t['id'] != first)
    assert len(expected) == 119
    wait('document.querySelector(".list-selection-count")?.textContent.includes("119")')
    rectangles['filtered'] = capture('filtered')
    # Observe, without modifying, the exact UI mutation body.
    browser('eval', '''window.__selectionEvidence=[];const original=window.fetch;window.fetch=function(input,init){if(String(input).endsWith('/tickets/bulk-archive'))window.__selectionEvidence.push(JSON.parse(init.body));return original.apply(this,arguments)}''')
    browser('find', 'first', '[data-bulk-archive="true"]', 'click')
    wait('document.querySelectorAll(".list-selection-count").length===0 && document.querySelectorAll(".list-row").length===1')
    sent = value('window.__selectionEvidence')
    assert len(sent) == 1 and sorted(sent[0]['ticketIds']) == expected
    stored = api(f'/api/boards/{bid}/tickets?archived=all')['tickets']
    assert len(stored) == 240
    assert sorted(t['id'] for t in stored if t['isArchived']) == expected
    assert all(not t['isResolved'] for t in stored)
    browser('reload')
    wait('document.querySelectorAll(".list-row").length===1')
    assert value('Number(document.querySelector("[data-list-ticket-id]").dataset.listTicketId)') == first
    rectangles['reloaded'] = capture('reloaded')
    browser('set', 'viewport', '390', '844')
    browser('set', 'media', 'dark')
    browser('reload')
    wait('document.querySelectorAll(".list-row").length===1')
    rectangles['narrow-dark'] = capture('narrow-dark')
    records.append({'case': case, 'initialCount': 240, 'deselectedId': first,
                    'requestedArchive': sent[0], 'storedArchivedIds': expected,
                    'storedTotal': len(stored), 'reloadedOnlyTodoId': first, 'rectangles': rectangles})
    (root / f'{phase}-verification.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
browser('close')
print(json.dumps({'phase': phase, 'cases': len(records)}))
