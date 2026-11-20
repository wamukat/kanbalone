# API 例

完了状態は名前ではなく `isCompletionLane` で決まります。以下はレーン11 / `Done` が完了レーン、レーン9が通常レーンとして設定済みの例です。レーン属性を明示的に設定できます。

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/lanes/11 \
  -H 'content-type: application/json' \
  --data '{"isCompletionLane":true}'
```

この設定はアーカイブ済みを含む全所属チケットの完了状態を変更します。人間の受入を行う場合、AIは通常レーンの `Acceptance` に渡し、人間がDoneへ移します。


影響を確認してボード設定を変更する場合は、期待値の不一致を拒否する[一括設定API](#完了レーンの選択を一括設定)を優先してください。上記PATCHにはその検査はありません。

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
    "laneId": 11
  }'
```

## チケットを Todo に戻して Unresolved にする

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/6 \
  -H 'content-type: application/json' \
  --data '{
    "laneId": 9
  }'
```

## 複数チケットをまとめて Resolved にする

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/bulk-transition \
  -H 'content-type: application/json' \
  --data '{
    "ticketIds": [4, 5, 6],
    "laneName": "Done"
  }'
```

## Lane 名で複数チケットをまとめて移動する

```bash
curl -s -X POST http://127.0.0.1:3000/api/boards/3/tickets/bulk-transition \
  -H 'content-type: application/json' \
  --data '{
    "ticketIds": [4, 5, 6],
    "laneName": "Done"
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
```

## レーン内で1件のチケットを並べ替える

チケット4がレーン9にある場合、同じ `laneId` と0始まりの `position` を指定して先頭へ移動します。`laneId` は必須です。同じボードの別レーン ID を指定すれば、レーン移動と位置指定を同時に行えます。

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/4/position \
  -H 'content-type: application/json' \
  --data '{ "laneId": 9, "position": 0 }'
```

チケット5の直前・直後に置く場合（それぞれ独立した例）:

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/4/position \
  -H 'content-type: application/json' \
  --data '{ "laneId": 9, "beforeTicketId": 5 }'

curl -s -X PATCH http://127.0.0.1:3000/api/tickets/4/position \
  -H 'content-type: application/json' \
  --data '{ "laneId": 9, "afterTicketId": 5 }'
```

指定するチケット5は移動先レーン9に属し、移動対象自身とは異なる必要があります。絞り込みで非表示のチケットがある場合にも、表示上のインデックスではなくこの相対指定を使えます。優先順位は `beforeTicketId` → `afterTicketId` → `position` です。成功時は更新後のチケットが返り、他のチケットの並び順はサーバーが振り直します。

移動後の並び順は各チケットの `position` で確認します:

```bash
curl -s 'http://127.0.0.1:3000/api/boards/3/tickets?lane_id=9'
```

## ボード全体のチケット並び替え（従来のAPI）

`items` にはボード内の全非アーカイブチケットが必要です。以下は対象がチケット4・5・6だけの場合の例です。レーン内の1件の並べ替えには上記の `position` API を使います。

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
    "laneName": "Done"
  }'
```

## 本文と Content-Type

本文を送る場合は `Content-Type: application/json` を指定します。本文のない GET / DELETE では省略できます。本文を要求しない DELETE は、このヘッダーが付いていても空本文を受け付けます。本文必須の POST / PATCH に空本文を送った場合や、JSON が壊れている場合は400を返します。

## APIでの絞り込み・一括並べ替え・本文追記

### レーン名・親で絞り込む

`GET /api/boards/:boardId/tickets?lane=進行中&resolved=false&parent=101` はレーン名の完全一致と直接の親で絞ります。`parent=none` は親なしです。未知のレーン名や該当しない親IDは空一覧になります。既存の `lane_id` と `lane` は同時指定できません。複数レーンや子孫全体の検索はこのAPIには含みません。

### コメントを必要な件数だけ読む

`GET /api/tickets/:ticketId/comments?limit=2&order=desc` で最新2件を取得します。`limit` は1〜100、省略時は全件です。`order` は `asc` / `desc`、既定は従来どおり `desc`。同時刻の場合はIDも同じ方向にソートします。

### レーン内を一括並べ替えする

`POST /api/lanes/:laneId/tickets/reorder` に `{ "ticketIds": [103, 101] }` を送ると、指定した非アーカイブチケットを先頭に並べ、省略分は元の相対順で後ろに残します。アーカイブ済みは最後に相対順を維持します。空配列は変更なしです。別レーン・不存在・重複・アーカイブ済みIDは全件無変更で400になります。レーン不存在は404です。検証と更新は1トランザクションで行い、同時実行時は後の操作が最新の順序に適用されます。レスポンスは対象レーンの非アーカイブチケットsummaryです。

### 本文末尾へ追記する

`PATCH /api/tickets/:ticketId` に `{ "appendMarkdown": "\n\n- 追加の作業" }` を送ります。最新本文への追記をトランザクション内で行います。改行などの区切りは自動挿入しません。空文字や `bodyMarkdown` との同時指定は400です。追記後の本文上限はUTF-8で64 MiBです。繰り返すと二重追記になるため、応答が不明な場合は本文を確認してから再試行してください。別クライアントによる全文置換との競合を防ぐ機能ではありません。

### MR/PRを外部参照として登録する

`PUT /api/tickets/:ticketId/external-references/:kind` を使います。PRは `resourceType: "pull_request"`、MRは `resourceType: "merge_request"` とし、`provider`・`instanceUrl`・`projectKey`・`issueKey`・`displayRef`・`url` を指定します。同じチケットの同じ `kind` は置換されるため、複数登録する場合は `pr-main` / `mr-followup` など別のkindを使います。取得はチケットの `externalReferences` を参照します。現時点ではリンク登録・表示のみで、open/mergedの取得や自動更新は行いません。

```bash
curl -sG http://127.0.0.1:3000/api/boards/3/tickets \
  --data-urlencode 'lane=Doing' --data-urlencode 'parent=101' --data-urlencode 'resolved=false'
curl -s 'http://127.0.0.1:3000/api/tickets/101/comments?limit=2&order=desc'
curl -s -X POST http://127.0.0.1:3000/api/lanes/9/tickets/reorder \
  -H 'content-type: application/json' --data '{"ticketIds":[103,101]}'
curl -s -X PATCH http://127.0.0.1:3000/api/tickets/101 \
  -H 'content-type: application/json' --data '{"appendMarkdown":"\n\n- Additional task"}'
curl -s -X PUT http://127.0.0.1:3000/api/tickets/101/external-references/pr-main \
  -H 'content-type: application/json' --data '{
    "provider":"github", "instanceUrl":"https://github.com", "resourceType":"pull_request",
    "projectKey":"example/project", "issueKey":"123", "displayRef":"example/project#123",
    "url":"https://github.com/example/project/pull/123"
  }'
```

<a id="完了レーンの選択を一括設定"></a>

## 完了レーンの選択を一括設定

確認済みのボード設定を、レーンごとの更新に分けず一括で置き換えます。まず全レーンと、アーカイブ済みを含む全チケットを、ほかの絞り込みなしで取得します。

```bash
curl -s http://127.0.0.1:3000/api/boards/4/lanes
curl -s 'http://127.0.0.1:3000/api/boards/4/tickets?archived=all'
```

以下はボード4にレーン9〜12だけが存在し、現在の属性・件数が記載どおりである例です。完了扱いを11から12へ切り替えるため、レーン11の2件が未完了に戻ります。レーン12は空です。実際に取得したID・件数を使い、影響を確認してから実行してください。

```bash
curl -s -X PUT http://127.0.0.1:3000/api/boards/4/completion-lanes \
  -H 'content-type: application/json' \
  --data '{
    "laneIds": [12],
    "expectedLanes": [
      {"id":9,"isCompletionLane":false,"ticketCount":3},
      {"id":10,"isCompletionLane":false,"ticketCount":1},
      {"id":11,"isCompletionLane":true,"ticketCount":2},
      {"id":12,"isCompletionLane":false,"ticketCount":0}
    ]
  }'
```

`laneIds` は設定後の全選択で、`[]` は全レーンを通常扱いにします。`expectedLanes` には0件のレーンも含めて全レーンを指定し、件数にはアーカイブ済みを含めます。成功時は `{ lanes }` を返し、アーカイブ状態は変えません。不正・重複した選択IDは400、ボード不存在は404、レーン集合・完了属性・件数が変わっていた場合は無変更で409です。409時は再取得して影響を再確認します。期待値検査のない個別PATCHに切り替えて回避しないでください。
