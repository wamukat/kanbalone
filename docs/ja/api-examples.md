# API 例

すべて `http://127.0.0.1:3000` を前提にしています。

## ヘルスチェック

```bash
curl -s http://127.0.0.1:3000/api/health
```

## ボード一覧

```bash
curl -s http://127.0.0.1:3000/api/boards
```

## ボード shell の取得

```bash
curl -s http://127.0.0.1:3000/api/boards/3
```

## ボード作成

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards \
  -H 'content-type: application/json' \
  --data '{
    "name": "Agent Tasks",
    "laneNames": ["todo", "doing", "review", "done"]
  }'
```

## タグ作成

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tags \
  -H 'content-type: application/json' \
  --data '{
    "name": "frontend",
    "color": "#2563eb"
  }'
```

## チケット作成

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

## チケットを Done に移動して Resolved にする

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 11,
    "isResolved": true
  }'
```

## チケットを Todo に戻して Unresolved にする

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 9,
    "isResolved": false
  }'
```

## 複数チケットをまとめて Resolved にする

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/bulk-complete \
  -H 'content-type: application/json' \
  --data '{
    "ticketIds": [4, 5, 6],
    "isResolved": true
  }'
```

## Lane 名で複数チケットをまとめて移動する

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/bulk-transition \
  -H 'content-type: application/json' \
  --data '{
    "ticketIds": [4, 5, 6],
    "laneName": "Done",
    "isResolved": true
  }'
```

## Blocker 設定

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/7 \
  -H 'content-type: application/json' \
  --data '{
    "blockerIds": [6]
  }'
```

## Parent 設定

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/5 \
  -H 'content-type: application/json' \
  --data '{
    "parentTicketId": 4
  }'
```

## コメント追加

```bash
curl -s -X POST http://127.0.0.1:3000/api/tickets/6/comments \
  -H 'content-type: application/json' \
  --data '{
    "bodyMarkdown": "Confirmed on local UI and API."
  }'
```

## コメント編集

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/comments/12 \
  -H 'content-type: application/json' \
  --data '{
    "bodyMarkdown": "Confirmed on local UI, API, and archive flow."
  }'
```

## コメント削除

```bash
curl -s -X DELETE http://127.0.0.1:3000/api/comments/12
```

## チケットをアーカイブする

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "isArchived": true
  }'
```

## チケット summary を絞り込む

```bash
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?resolved=false'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?lane_id=11'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?tag=frontend'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?archived=all'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?q=sidebar'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?q=%23123'
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?q=priority%3A3'
```

## チケット並び替え

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

## ボードを Export する

```bash
curl -s http://127.0.0.1:3000/api/boards/3/export > board-3.json
```

## ボードを Import する

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/import \
  -H 'content-type: application/json' \
  --data @board-3.json
```

## 大きなローカル seed data を Import する

`/api/boards/import` は local-only の大きめ payload も扱えます。

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/import \
  -H 'content-type: application/json' \
  --data @perf-5000-board.json
```

投入後は軽量 summary route で一覧確認します。

```bash
curl -s 'http://127.0.0.1:3000/api/boards/6/tickets?resolved=false'
curl -s 'http://127.0.0.1:3000/api/boards/6/tickets?lane_id=20'
```

## SSE でボード更新を購読

```bash
curl -N http://127.0.0.1:3000/api/boards/3/events
```

```text
data: {"boardId":3,"event":"board_updated","sentAt":"2026-04-10T00:00:00.000Z"}
```

## コメント一覧

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/comments
```

## Activity の一覧取得

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/activity
```

## Relations の取得

```bash
curl -s http://127.0.0.1:3000/api/tickets/6/relations
```

## Lane 名で Transition する

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6/transition \
  -H 'content-type: application/json' \
  --data '{
    "laneName": "Done",
    "isResolved": true
  }'
```
