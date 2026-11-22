import json, sqlite3, urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent
cases = []
for language in ['ja', 'en']:
    body = {
        'formatVersion': 2, 'board': {'name': 'Delivery review'},
        'lanes': [{'id': 1, 'name': 'Todo', 'position': 0, 'isCompletionLane': False},
                  {'id': 2, 'name': 'Review', 'position': 1, 'isCompletionLane': False}],
        'groups': [], 'tags': [],
        'tickets': [{'id': i, 'laneId': (i - 1) % 2 + 1, 'position': i,
                     'title': f'Review delivery item {i:03}', 'bodyMarkdown': 'Synthetic selection evidence',
                     'priority': 2, 'isResolved': False, 'isArchived': False,
                     'parentTicketId': None, 'groupId': None, 'tags': [], 'comments': [], 'blockerIds': []}
                    for i in range(1, 241)],
    }
    request = urllib.request.Request('http://127.0.0.1:3630/api/boards/import',
        data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(request) as response:
        board = json.load(response)
    cases.append({'language': language, 'boardId': board['board']['id'],
                  'todoId': next(lane['id'] for lane in board['lanes'] if lane['name'] == 'Todo')})
(root / 'fixtures.json').write_text(json.dumps(cases, indent=2) + '\n')
with sqlite3.connect('coverage/list-selection/before.sqlite') as source, sqlite3.connect('coverage/list-selection/after.sqlite') as target:
    source.backup(target)
