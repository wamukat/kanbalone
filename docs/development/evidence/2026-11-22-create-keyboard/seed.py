import json
import urllib.request
from pathlib import Path

def call(base, method, path, value=None):
    data = None if value is None else json.dumps(value).encode()
    request = urllib.request.Request(base + path, data=data, method=method, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request) as response:
        return json.load(response)

fixtures = {}
for phase, port in [('before', 3601), ('after', 3602)]:
    base = f'http://127.0.0.1:{port}'
    cases = []
    for language in ['ja', 'en']:
        for view in ['list', 'kanban', 'group']:
            created = call(base, 'POST', '/api/boards', {'name': 'Delivery work', 'laneNames': ['Todo', 'Doing', 'Acceptance']})
            board = created['board']['id']
            lanes = created['lanes']
            group = call(base, 'POST', f'/api/boards/{board}/groups', {'name': 'Improve notifications'})
            rows = []
            for i, title in enumerate(['Check notification delivery', 'Review retry behavior', 'Document acceptance checks', 'Compare mobile delivery', 'Review error messages', 'Confirm delivery logs']):
                rows.append(call(base, 'POST', f'/api/boards/{board}/tickets', {'laneId': lanes[i % 3]['id'], 'title': title, 'groupId': group['id'], 'bodyMarkdown': 'Evaluation fixture only.', 'priority': 2}))
            cases.append({'language': language, 'view': view, 'boardId': board, 'laneIds': [lane['id'] for lane in lanes], 'groupId': group['id'], 'originId': rows[1]['id'], 'tickets': rows})
    fixtures[phase] = cases
Path('docs/development/evidence/2026-11-22-create-keyboard/fixtures.json').write_text(json.dumps(fixtures, indent=2) + '\n')
