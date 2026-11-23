# API 例

Kanbalone v1.0.0で非推奨だった完了状態のAPI項目とエンドポイントを削除しました。公開済み環境には、そのリリースタグのドキュメントとスキルを使用してください。[移行一覧](./migration-guide.md#deprecated-api-removal)を参照してください。

完了状態は名前ではなく `isCompletionLane` で決まります。以下はレーン11 / `Done` が完了レーン、レーン9が通常レーンとして設定済みの例です。レーン属性を明示的に設定できます。

```bash
curl -s -X PATCH http://127.0.0.1:3000/api/lanes/11 \
  -H 'content-type: application/json' \
  --data '{"isCompletionLane":true}'
```

この設定はアーカイブ済みを含む全所属チケットの完了状態を変更します。人間の受入を行う場合、AIは通常レーンの `Acceptance` に渡し、人間がDoneへ移します。


影響を確認してボード設定を変更する場合は、期待値の不一致を拒否する[一括設定API](#完了レーンの選択を一括設定)を優先してください。上記PATCHにはその検査はありません。

すべて `http://127.0.0.1:3000` を前提にしています。

<a id="チケット一覧のページング"></a>
## チケット一覧のページング

v1.1.0-rc.1からページングを利用できます。`limit`と`cursor`を指定しない既存の呼び出しは、全件取得・並び順・応答形式を維持します。稼働中のリリースに対応するドキュメントを利用してください。

`limit=1..200`で取得件数を指定し、返された`page.nextCursor`を渡して続きを取得します。ボード・検索条件・`order`は維持し、`limit`だけは変更できます。`page.total`は条件に一致する全件数、`nextCursor: null`は最後のページです。ページ番号や`hasMore`はありません。

```bash
# 完了レーンと同じ順番で最初の5件を取得
curl -fsS --get http://127.0.0.1:3000/api/boards/3/tickets \
  --data-urlencode 'lane_id=11' --data-urlencode 'order=completed_desc' \
  --data-urlencode 'limit=5'

# 上の応答のpage.nextCursorを設定。検索条件・並び順は変更しない
CURSOR='返されたnextCursorをここに設定'
curl -fsS --get http://127.0.0.1:3000/api/boards/3/tickets \
  --data-urlencode 'lane_id=11' --data-urlencode 'order=completed_desc' \
  --data-urlencode 'limit=50' --data-urlencode "cursor=$CURSOR"
```

`order`は`id_asc`（ページング時の既定）、`position_asc`（従来のレーン・アーカイブ・位置・ID順）、`completed_desc`（完了日時の降順、位置の昇順、IDの降順。完了日時不明は最後）を指定できます。ページングなしでも並び順を指定できます。`priority=1,3`は低または高の優先度に一致し、ページ分割・総件数の計算より前に適用されます。

不正なcursor・異なる検索条件への流用・不正な引数・limitなしのcursorは400です。ボードのチケット一覧データが変わるとcursorは無効になり409を返します。別ボードの参照先チケットの変更でも無効になる場合があります。部分結果を破棄し、cursorを外して最初から取得し直してください。再試行には上限を設けます。変更前のsnapshotは保持しません。親と子が別ページになる場合があり、未取得を「関連なし」と解釈してはいけません。

ページング応答の`X-Kanbalone-Ticket-Revision`ヘッダは、同じボードの複数の条件別一覧を組み合わせる際の版確認に使えます。値が異なれば全体を取得し直します。cursorの代わりではありません。

AIが取得したチケットを変更する場合は、一覧を収集し終えてから書き込むか、処理済みIDを管理して再実行を安全にします。409の前後の結果を混ぜたり、書き込みを無条件に繰り返したりしないでください。

## 関連チケットの候補一覧

`GET /api/boards/3/relation-candidates?limit=200`は、アーカイブ済みを含むボード内のチケットをIDの昇順で返します。各チケットの項目は`id`、`title`、`parentTicketId`、`priority`、`blockerIds`、`isResolved`です。

すべてのリクエストに`limit=1..200`が必要です。並び順は`id_asc`に固定されており、明示的に指定することもできます。`page.nextCursor`がnullになるまで、同じボードとエンドポイントで続きを取得します。各ページは`X-Kanbalone-Ticket-Revision`ヘッダと、ボード内の全チケット数を示す`page.total`を返します。409が返った場合は取得済みのページを破棄し、cursorなしで最初から取得します。

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

<a id="groups"></a>
## Group

```bash
BASE=http://127.0.0.1:3000
BOARD_ID=3

# Active is the default. Include inactive Groups and sort by name.
curl -sS "$BASE/api/boards/$BOARD_ID/groups?status=all&sort=name&order=asc"

# Create a Group. Keep the returned id and revision.
curl -sS -X POST "$BASE/api/boards/$BOARD_ID/groups" \
  -H 'content-type: application/json' \
  --data '{"name":"First-use guide","descriptionMarkdown":"## Goal\n\nHelp people create their first ticket."}'

GROUP_ID=7
curl -sS "$BASE/api/groups/$GROUP_ID"
curl -sS "$BASE/api/boards/$BOARD_ID/tickets?groupId=$GROUP_ID&archived=all"
curl -sS "$BASE/api/boards/$BOARD_ID/tickets?ungrouped=true&q=guide"
```

### 所属変更のpreviewと確定

以下は `jq` を使います。IDは対象環境で取得したものに置き換えてください。親子の所属は共通なので、previewの対象件数は指定したID数より多くなる場合があります。

```bash
WORK_DIR=$(mktemp -d)
printf '%s\n' '{"ticketIds":[101],"groupId":7}' > "$WORK_DIR/membership.json"
curl -sS --fail-with-body -X POST "$BASE/api/boards/$BOARD_ID/group-memberships/preview" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/membership.json" \
  > "$WORK_DIR/preview.json"
cat "$WORK_DIR/preview.json"
```

対象全件を確認したうえで、同じ操作を確定します。

```bash
jq --slurpfile preview "$WORK_DIR/preview.json" \
  '. + {expectedToken:$preview[0].expectedToken}' \
  "$WORK_DIR/membership.json" > "$WORK_DIR/apply.json"
curl -sS --fail-with-body -X PUT "$BASE/api/boards/$BOARD_ID/group-memberships" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/apply.json"
```

解除は `{"ticketIds":[101],"groupId":null}` で新しいpreviewを取得し、そのtokenで確定します。アーカイブ済みを含む接続した親子全体の所属を解除します。別Groupへ移す場合は解除後、追加先へのpreview・追加を行います。異なるbodyにtokenを流用しません。

### Groupに所属するチケットを新規作成

```bash
curl -sS --fail-with-body -X POST "$BASE/api/boards/$BOARD_ID/tickets" \
  -H 'content-type: application/json' \
  --data '{"laneId":9,"title":"Improve first-use guidance","priority":2,"groupId":7}'
```

`parentTicketId` も指定する場合は、同じ作成bodyで `POST /api/boards/:boardId/tickets/preview` を呼びます。`requiresResolution` がtrueなら、返された候補Groupを選び、作成要求へ `groupResolution:{groupId}` と `expectedToken` を追加します。既存の親子と新規チケットを一括更新します。非null Groupが1種類なら未所属側を自動で揃えます。previewではチケットを作成しません。

### 親子関係の変更を一括保存

編集開始時のeditTokenを保持します。以下は102がすでに101の子であり、303を新たに選択した場合に、101の子の集合を102と303で置き換える例です。新しく選択した子はすべて `expectedSelectedParents` に指定します。他の子がいる場合に、追加だけの要求としてそのまま使わないでください。

```bash
curl -sS --fail-with-body "$BASE/api/tickets/101" > "$WORK_DIR/ticket.json"
curl -sS --fail-with-body "$BASE/api/tickets/303" > "$WORK_DIR/selected-child.json"
jq --slurpfile child "$WORK_DIR/selected-child.json" \
  '{childTicketIds:[102,303], expectedEditToken:.editToken,
    expectedSelectedParents:[{ticketId:$child[0].id,parentTicketId:$child[0].parentTicketId}]}' \
  "$WORK_DIR/ticket.json" > "$WORK_DIR/edit.json"
curl -sS --fail-with-body -X POST "$BASE/api/tickets/101/change-preview" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/edit.json" \
  > "$WORK_DIR/edit-preview.json"
cat "$WORK_DIR/edit-preview.json"
```

競合時は、変更対象を確認して `candidates` から1つ選びます。先頭候補を自動選択しません。たとえば返された候補のGroup 7を選ぶ場合:

```bash
jq --slurpfile preview "$WORK_DIR/edit-preview.json" \
  '. + {expectedToken:$preview[0].expectedToken,groupResolution:{groupId:7}}' \
  "$WORK_DIR/edit.json" > "$WORK_DIR/edit-apply.json"
curl -sS --fail-with-body -X PATCH "$BASE/api/tickets/101" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/edit-apply.json"
```

競合がなければ `groupResolution` を省略し、`expectedToken` だけを追加します。previewと確定の間で編集bodyは変えません。古い状態のエラーでは、tokenだけ更新して過去の子集合を再送せず、読み直して編集内容を照合します。

### Groupの編集・削除

```bash
curl -sS --fail-with-body "$BASE/api/groups/$GROUP_ID" > "$WORK_DIR/group.json"
jq '{name:"First-use improvements",expectedRevision:.revision}' "$WORK_DIR/group.json" \
  > "$WORK_DIR/group-edit.json"
curl -sS --fail-with-body -X PATCH "$BASE/api/groups/$GROUP_ID" \
  -H 'content-type: application/json' --data-binary @"$WORK_DIR/group-edit.json"
```

アーカイブ済みを含む所属が0件で、削除が意図した操作であることを確認してから削除します。編集するとrevisionが変わるため再取得します。

```bash
curl -sS --fail-with-body "$BASE/api/groups/$GROUP_ID" > "$WORK_DIR/group.json"
REVISION=$(jq -r '.revision' "$WORK_DIR/group.json")
curl -sS --fail-with-body -X DELETE "$BASE/api/groups/$GROUP_ID" \
  -H "If-Match: \"$REVISION\""
```

非空のGroupや古いrevisionは拒否します。Groupの削除でチケットを連鎖削除しません。配布APIヘルパーは `If-Match` を指定できないため、この操作には `curl` を使います。

## 保存した横断ビュー（未リリース）

このAPIはv1.3.0には含まれません。実行環境のバージョンを確認してから利用してください。`GET /api/custom-views/catalog` でボード・タグIDを取得します。以下のIDは合成例です。

`POST /api/custom-views` で定義を作成します。

```json
{
  "name": "Review queue",
  "scope": "selected",
  "boardIds": [1, 2],
  "rules": [
    {"boardId": 1, "mode": "tags", "tagIds": [3, 4]},
    {"boardId": 2, "mode": "all", "tagIds": []}
  ],
  "completion": "open",
  "showBody": true,
  "showLatestComment": true
}
```

`GET /api/custom-views` は `{views:[{id,name,version}]}`、`GET /api/custom-views/:id` は `id`・`version` 付きの全定義を返します。更新は `PUT /api/custom-views/:id` に全定義と `expectedVersion`、削除は `DELETE /api/custom-views/:id?expectedVersion=N` を指定します。古い版での更新・削除は409です。下書きを保持して保存済み定義を再取得し、競合を解消してください。書込みを無条件に再試行しません。

`scope: "all"` は現在と将来追加される全ボードを対象としますが、タグ条件はボードごとに必要です。ルールなしは未設定で0件、`mode: "tags"` かつ `tagIds: []` も0件です。明示的な `mode: "all"` だけがタグで絞りません。タグは所属ボード内のOR条件です。削除された参照は `warnings` に示し、条件を広げません。同名のボード・タグを作り直してもIDは別です。`completion` は `open`・`done`・`all`、アーカイブ済みは対象外です。

保存せずに取得するには `POST /api/custom-views/query` に `{definition, limit: 50}` を送ります。結果は `total`・`boardCounts`・`warnings`・`tickets`・`nextCursor`・`revision` を含みます。件数は現在ページではなく条件に一致する全課題の数です。limitの既定値は50、最大100です。同じ定義と `nextCursor` で続きを取得し、古いカーソルによる409なら途中結果を破棄して先頭から取り直します。不正なカーソルや条件の異なるカーソルは400です。1ページだけを全件とみなして一括操作しないでください。

並び順はボード順・レーン順・課題位置で、同順位はIDで確定します。本文と最新コメントの抜粋は表示が有効な場合だけ返し、最大360 Unicodeコードポイントです。最新コメントは投稿日時、同時刻ならIDの新しいものです。投稿日時を含み、投稿者フィールドはありません。原文Markdownは `GET /api/custom-views/tickets/:ticketId/text?field=body` または `field=comment&commentId=N` で取得します。コメントIDはその課題に属している必要があります。

`GET /api/custom-views/events` は更新を知らせる `views_updated`・`board_updated` を配信します。永続イベントログではないため、再接続時や詳細からの復帰時は再取得します。ビュー設定の変更・削除で課題を変更しません。DB全体のバックアップには定義が含まれますが、単一ボードのJSONでは移しません。
