# API Examples

すべて `http://127.0.0.1:3000` 前提です。

## Health Check

```bash
curl -s http://127.0.0.1:3000/api/health
```

## List Boards

```bash
curl -s http://127.0.0.1:3000/api/boards
```

## Get Board Shell

```bash
curl -s http://127.0.0.1:3000/api/boards/3
```

## Create Board

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards \
  -H 'content-type: application/json' \
  --data '{
    "name": "Agent Tasks",
    "laneNames": ["todo", "doing", "review", "done"]
  }'
```

## Create Tag

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tags \
  -H 'content-type: application/json' \
  --data '{
    "name": "frontend",
    "color": "#2563eb"
  }'
```

## Create Ticket

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 9,
    "title": "Draft API usage guide",
    "bodyMarkdown": "Document the most common ticket operations.",
    "priority": 4,
    "tagIds": [3],
    "blockerIds": []
  }'
```

## Move Ticket To Done And Mark Completed

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 11,
    "isCompleted": true
  }'
```

## Move Ticket Back To Todo And Reopen

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 9,
    "isCompleted": false
  }'
```

## Set Blocker

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/7 \
  -H 'content-type: application/json' \
  --data '{
    "blockerIds": [6]
  }'
```

## Set Parent

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/5 \
  -H 'content-type: application/json' \
  --data '{
    "parentTicketId": 4
  }'
```

## Add Comment

```bash
curl -s -X POST http://127.0.0.1:3000/api/tickets/6/comments \
  -H 'content-type: application/json' \
  --data '{
    "bodyMarkdown": "Confirmed on local UI and API."
  }'
```

## Filter Ticket Summaries

```bash
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?completed=false'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?lane_id=11'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?tag=frontend'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?q=sidebar'
```

## Reorder Tickets

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/reorder \
  -H 'content-type: application/json' \
  --data '{
    "items": [
      { "ticketId": 4, "laneId": 9, "position": 0 },
      { "ticketId": 5, "laneId": 9, "position": 1 },
      { "ticketId": 6, "laneId": 11, "position": 0 }
    ]
  }'
```

## Export Board

```bash
curl -s http://127.0.0.1:3000/api/boards/3/export > board-3.json
```

## Import Board

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/import \
  -H 'content-type: application/json' \
  --data @board-3.json
```

## Import Large Local Seed Data

`/api/boards/import` は local-only の大きめ payload も扱えます。

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/import \
  -H 'content-type: application/json' \
  --data @perf-5000-board.json
```

投入後は軽量 summary route で一覧確認します。

```bash
curl -s 'http://127.0.0.1:3000/api/boards/6/tickets?completed=false'
curl -s 'http://127.0.0.1:3000/api/boards/6/tickets?lane_id=20'
```

## Subscribe To Board Updates With SSE

```bash
curl -N http://127.0.0.1:3000/api/boards/3/events
```

```text
data: {"boardId":3,"event":"board_updated","sentAt":"2026-04-10T00:00:00.000Z"}
```

## List Comments

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/comments
```

## Get Relations

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/relations
```

## Transition By Lane Name

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6/transition \
  -H 'content-type: application/json' \
  --data '{
    "laneName": "Done",
    "isCompleted": true
  }'
```
