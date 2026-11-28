# Kanbalone AI API ガイド

Kanbalone v1.0.0で非推奨だった完了状態のAPI項目とエンドポイントを削除しました。公開済み環境には、そのリリースタグのドキュメントとスキルを使用してください。[移行一覧](./migration-guide.md#deprecated-api-removal)を参照してください。

既存DBを更新する場合は、先に[完了状態の移行ガイド](./migration-guide.md)を確認してください。バックアップ・自動移行・照合・ロールバックとAI向け作業契約をまとめています。

この API は、ローカル環境で動作する単一ユーザー向けの Kanbalone API です。
ベース URL は通常 `http://127.0.0.1:3000` です。

## チケット一覧のページング

v1.1.0-rc.1からページングを利用できます。`limit`と`cursor`を指定しない既存の呼び出しは、全件取得・並び順・応答形式を維持します。稼働中のリリースに対応するドキュメントを利用してください。

`limit=1..200`で取得件数を指定し、返された`page.nextCursor`を渡して続きを取得します。ボード・検索条件・`order`は維持し、`limit`だけは変更できます。`page.total`は条件に一致する全件数、`nextCursor: null`は最後のページです。ページ番号や`hasMore`はありません。

[使用例と再取得時の注意](./api-examples.md#チケット一覧のページング)を参照してください。全件を前提とする判断や書き込みは全ページ取得後に行い、409では部分結果を破棄して最大2回まで再試行します。ページはチケット単位であり、親子を一括して返す保証はありません。

## Codex Skill

Kanbalone には、API だけで Kanban を操作するための Codex skill を `skills/kanbalone-api` に同梱しています。

repository checkout からインストールする場合:

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Docker image だけを使う場合は、GitHub release tag から skill を取得して Codex が動くホスト側へコピーします。

```bash
tmpdir=$(mktemp -d)
curl -L https://github.com/wamukat/kanbalone/archive/refs/tags/v0.11.0.tar.gz \
  | tar -xz -C "$tmpdir" kanbalone-0.11.0/skills/kanbalone-api
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R "$tmpdir"/kanbalone-0.11.0/skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
rm -rf "$tmpdir"
```

Codex は Kanbalone container の外側で動くため、skill はホスト側にインストールします。そのうえで、起動中の Kanbalone API に HTTP で接続します。

同梱のAPIヘルパーでは `--header 'Name: Value'` を繰り返し指定でき、JSON引数、標準入力のJSON、Markdownの `--body-file` と併用できます。ヘッダ名では大文字と小文字を区別せず、最後の指定がそれ以前の値や既定値を上書きします。既定値は `Accept: application/json` と、本文がある場合の `Content-Type: application/json` です。指定したヘッダは最初のリクエストで送信します。`If-Match` の使い方は [Group削除の例](./api-examples.md#groupの編集削除) を参照してください。

## 推奨ワークフロー

1. まずボード一覧を取得する。
   `GET /api/boards`
2. 操作対象ボードの shell を取る。
   `GET /api/boards/:boardId`
3. チケット操作前に、必要なら軽量チケット一覧または単票を取得する。
   `GET /api/boards/:boardId/tickets`
   `GET /api/tickets/:ticketId`
4. コメントや relation を個別取得したい場合は専用 endpoint を使う。
   `GET /api/tickets/:ticketId/comments`
   `GET /api/tickets/:ticketId/activity`
   `GET /api/tickets/:ticketId/relations`
5. 更新は最小差分で `PATCH /api/tickets/:ticketId` を使う。
   lane 名ベース遷移は `PATCH /api/tickets/:ticketId/transition` を使う。
   複数チケットをまとめて扱うときは board 単位の bulk endpoint を使う。
6. Kanban 画面の自動更新が必要なら `GET /api/boards/:boardId/events` を購読する。

## 重要な意味論

### 1. 完了状態は所属レーンから決まる

- `lanes[].isCompletionLane` を確認します。名前から完了を判定しません。
- 完了レーンへの移動で完了、通常レーンへの移動で再開します。
- 読み取り専用の `isResolved` はレーンの状態を表します。チケットへの書き込みで `isResolved`／`isCompleted` を指定すると、無変更で400を返します。どちらも送らないでください。レスポンスの `isCompleted` とクエリの `completed` は削除済みです。完了状態の絞り込みには `resolved` を使います。
- 読み取り専用の `resolvedAt` は、現在の完了レーンへ入った日時です。別の完了レーンへの移動でも更新され、通常レーンへ戻すと `null` になります。通常編集・同じレーンでの並べ替えでは更新しません。既存データなどで日時が不明な場合も `null` です。チケットの作成・更新入力には含めないでください。Kanbanの完了レーンはこの日時の降順（不明分は既存位置順）で表示しますが、APIの `position` 契約は変わりません。
- 言語指定なしのAPI作成では `todo`、`doing`、`Acceptance`（通常）、`done`（完了）です。任意の `defaultLaneLanguage: "en" | "ja"` で新規の初期名を選べます。UIは現在の表示言語を指定します。明示した `laneNames` は優先され、通常レーンになるため完了属性を明示設定してください。既存レーン名は翻訳しません。
- 受け入れ確認の運用では、そのボードの確認用レーンへ引き継ぎ、確認後に完了レーンへ移動します。固定の英語名を仮定せず、実際のレーン名・IDを取得して使ってください。
- `PATCH /api/lanes/:laneId` に `{ "isCompletionLane": true }` を指定すると、アーカイブ済みを含む全所属チケットの完了状態が変わります。アーカイブ状態は変えません。

ボード全体の設定には `PUT /api/boards/:boardId/completion-lanes` に `{ laneIds, expectedLanes }` を渡します。`laneIds` は追加分ではなく設定後の全選択で、`[]` は全レーンを通常扱いにします。全レーンと、絞り込みなしの `archived=all` のチケット一覧を取得し、全レーンを `{ id, isCompletionLane, ticketCount }` として `expectedLanes` に含めます。アーカイブ済みを含む件数と0件のレーンも必要です。許可された設定変更を適用する前に、完了／未完了になる件数を確認します。

全選択とチケット状態は1トランザクションで変更します。不正・重複した選択IDは400、ボード不存在は404、レーン集合・完了属性・件数の変化は無変更で409です。409時は再取得して影響を再確認し、機械的な再試行や個別PATCHへの切り替えで検査を回避しないでください。単一レーンのPATCHにはこの期待値検査はありません。[API例](./api-examples.md#完了レーンの選択を一括設定)も参照してください。

### 2. Blocker は「このチケットが依存している相手」

- `ticket.blockerIds = [6]` は「このチケットは `#6` に blocked される」を意味します。
- チケット一覧のサマリーには読み取り専用の `unresolvedBlockerCount` が含まれます。未完了のブロッカー数で、アーカイブ済みも含みます。検索やフィルターによってこの数は変わりません。
- 自分自身は blocker にできません。
- 相互 blocker は禁止です。
  - `#1` が `#2` に blocked されているなら、`#2` を `#1` に blocked させることはできません。

### 3. 親子関係は 1 階層だけ

- 親は複数の子を持てます。
- 孫は不可です。
- 子チケットは親になれません。
- 子を持つチケットは、別の親の子にはできません。

### 4. タグは board 単位

- タグはボードごとに独立しています。
- チケット更新時は `tagIds` に、そのボード内のタグ ID を指定してください。

### 5. コメントは一覧取得・追記・編集・削除ができる

- `GET /api/tickets/:ticketId/comments` で一覧取得できます。返却順は新しいコメントが先です。
- `POST /api/tickets/:ticketId/comments` で追記できます。
- `PATCH /api/comments/:commentId` で編集できます。
- `DELETE /api/comments/:commentId` で削除できます。
- remote tracked ticket では comment に `sync` metadata が付きます。
- `POST /api/comments/:commentId/push-remote` で remote issue に comment を反映できます。

### チケット内のTask

チケット内の修正・指摘・確認を個別に記録するときはTaskを使います。TaskにはMarkdown本文と完了状態があり、番号はチケット内で自動採番します。チケットの完了は引き続きレーンで決まります。レーンや優先度を別々に管理する作業には子チケットを使います。

- `/api/tickets/:ticketId/tasks` で一覧取得・作成します。応答の `{tasks, taskCount, doneTaskCount}` の件数は絞り込み前の合計です。`q` はMarkdownの部分一致、`done=true` または `done=false` は完了状態での絞り込みです。検索ではASCII英字の大文字と小文字を区別せず、その他の文字と空白はそのまま照合します。
- `/api/tickets/:ticketId/tasks/:taskNumber` で個別取得・編集・削除します。作成時に `bodyMarkdown` と任意の `done`（省略するとfalse）を送ります。本文には空白以外の文字が必要で、有効なUnicode文字10万文字までです。応答にサニタイズ済みの `bodyHtml` と `revision` が含まれます。
- PATCHとDELETEのJSONに `expectedRevision` を送ります。省略すると428、古いrevisionでは `STALE_TASK` と409を返します。競合時は現状を取得し、編集や削除の意図を照合してから再試行します。
- チケット履歴の `task_created`、`task_updated`、`task_deleted` で番号・抜粋・完了状態・更新者を確認できます。本文変更では前後のMarkdown、削除時は削除されたMarkdownも記録します。revisionが一致し値が同じPATCHでは、履歴・revision・ボード通知は更新しません。

チケット詳細と一覧のサマリーは `taskCount`、`doneTaskCount` を返します。Taskを変更してもチケットの更新日時や本文・コメントの最終活動順は変わりません。Taskはチケットと一緒に移動し、アーカイブ後も参照できます。チケットを削除するとTaskも削除されます。移動前の履歴の保存期間は、他の操作と同じく記録元ボードの扱いに従います。

[APIの使用例](./api-examples.md#ticket-tasks) と [バックアップ・移行の互換性](./migration-guide.md#ticket-task-migration) を参照してください。

### 6. Archive はResolved 状態と独立

- `isArchived` は `isResolved` と独立です。
- archived ticket は board 一覧からは通常隠れます。
- 一覧に含めたいときは `GET /api/boards/:boardId/tickets?archived=all` を使います。

### 7. 正規参照が返る

- ticket 系レスポンスには `ref` と `shortRef` が含まれます。
- 形式は `BoardName#TicketId` と `#TicketId` です。

### 8. Remote tracked ticket では title と body の意味が分かれる

- `title` は remote から import した read-only title です。
- `bodyMarkdown` は local body です。
- `remote.bodyMarkdown` / `remote.bodyHtml` は remote 側 snapshot です。
- `POST /api/boards/:boardId/remote-import/preview` で import 前に remote issue を解決し、duplicate status を確認します。
- `POST /api/boards/:boardId/remote-import` で remote tracked ticket を作成します。
- remote import で `postBacklinkComment: true` を指定した場合だけ、Kanbalone は remote issue へ backlink comment を 1 回投稿します。Kanbalone に public URL がない場合があるため `backlinkUrl` は任意です。指定する場合は absolute `http` / `https` URL が必要です。provider token には comment/write permission が必要です。
- `POST /api/tickets/:ticketId/remote-refresh` で remote snapshot を更新します。

### 9. External references は tracking しない provenance

- `externalReferences` は、tracked import ではない構造化された remote provenance です。
- `PUT /api/tickets/:ticketId/external-references/:kind` で、`source` などの参照を冪等に設定できます。
- External references は one-import-per-remote-issue 制約に影響しません。
- External references には refresh / sync / push 操作は表示されません。
- 生成チケットが元の要件を指したいが、別の remote tracked ticket にはしたくない場合に使います。

### 10. `/api/meta` で remote provider の利用可否を返す

- `GET /api/meta` は `remoteProviders` を返します。
- 各要素は `id` と `hasCredential` を持ちます。
- UI はこの情報を使って、credential が 1 つ以上ある場合だけ remote import を表示し、設定済み provider だけを一覧します。
- API client 側でも、この metadata を使って表示する provider workflow を調整できます。

### 11. `/api/remote-diagnostics` で remote credential を診断する

- `GET /api/remote-diagnostics` は provider ごとの credential 設定有無を返します。
- `POST /api/remote-diagnostics` は provider と remote issue lookup を受け取り、設定済み credential でその issue を読めるか確認します。
- 診断結果は token を含まず、`reachable`、`auth_failed`、`permission_failed`、`not_found`、`missing_credential` などの status を返します。
- 診断実行では target instance に対する exact scope の credential が必要です。user が指定した diagnostic URL に wildcard credential は使いません。
- credential scope は provider ごとに正規化します。GitHub/GitLab は URL origin 単位、Redmine は path を保持するため、`https://redmine.example.test/redmine` のような subpath instance に別 credential を割り当てられます。
- GitHub/GitLab では wildcard credential を使いません。GitHub Enterprise や self-hosted GitLab は instance ごとに explicit origin credential を設定します。

## よくある操作パターン

### ボード内のチケットを検索したい

`GET /api/boards/:boardId/tickets` に query を付けます。

- この endpoint は軽量 summary 用です。
- 大きい board の描画、filter、検索、automation scan ではまずこの endpoint を使います。
- `bodyHtml`, `comments`, `parent`, `children`, 展開済み `blockers` は含みません。
- 詳細が必要なら `GET /api/tickets/:ticketId` を使います。
- レーン1件を指定するには `lane_id` または完全一致のレーン名を指定する `lane` を使います。タグ1件を完全一致の名前で指定するには `tag` を使います。
- `lane_ids=11,12&tag_ids=3,4` は、いずれかの対象レーンにあり、いずれかの対象タグが付いたチケットに一致します。すべてのレーンやタグを対象にするには、対応するリストを省略します。レーンとタグのパラメータは、それぞれ1種類を指定できます。
- `resolved` は完了状態、`archived` はアーカイブ状態で絞り込みます。
- `q`
  - title / body Markdown / ticket ID / `#ticketId` / tracked remote ref / external reference を検索します。
  - `gh#123`, `github#123`, `gl#123`, `gitlab#123`, `rm#123`, `redmine#123` のような provider prefix 付き短縮形では、その provider の tracked remote link と external reference を検索できます。
  - `ext#123` / `external#123` は external reference のみ、`remote#123` は tracked remote link のみを検索します。

### チケットをレーン移動したい

ID ベース:

- `PATCH /api/tickets/:ticketId`
- body に `laneId` を入れる

名前ベース:

- `PATCH /api/tickets/:ticketId/transition`
- body に `laneName` を入れる
- 完了状態は移動先レーンから決まるため、完了フラグは指定しない

順序を指定して1件を移動する場合は `PATCH /api/tickets/:ticketId/position` を使います（下記参照）。

複数チケットをまとめて Resolved / Unresolved にしたい:

- `POST /api/boards/:boardId/tickets/bulk-transition` に `ticketIds` と移動先 `laneName` を指定する。
- 複数件の完了・再開は `bulk-transition` で移動先レーンを指定する。削除済みの `bulk-complete` は404を返す。

複数チケットを lane 名でまとめて遷移したい:

- `POST /api/boards/:boardId/tickets/bulk-transition`
- body に `ticketIds` と `laneName` を入れる
- 完了状態は移動先レーンから決まるため、完了フラグは指定しない

### レーン内でチケットを並べ替えたい

`PATCH /api/tickets/:ticketId/position` を使います。`laneId` は必須で、現在と同じ ID を指定すればレーン内の並べ替えになります。同じボードの別レーンへの移動にも使えます。

チケット4を現在のレーン9の先頭へ移動する例:

```http
PATCH /api/tickets/4/position
Content-Type: application/json

{ "laneId": 9, "position": 0 }
```

- `position` は0始まりです。他のチケットの並び順はサーバーが振り直します。全チケットの送信は不要です。
- チケット5の直前なら `{ "laneId": 9, "beforeTicketId": 5 }`、直後なら `{ "laneId": 9, "afterTicketId": 5 }` を送ります。指定するチケットは移動先レーンに属し、移動対象自身とは異なる必要があります。
- 絞り込みで一部のチケットだけ見えている場合は、表示上のインデックスではなく `beforeTicketId` / `afterTicketId` を使います。指定の優先順位は `beforeTicketId` → `afterTicketId` → `position` です。
- 読み取った時点の並び順を前提に移動する場合は、移動元チケットの `expectedSourceLaneId` と `expectedSourcePosition` を両方送ります。この前提と併せて2件の異なるアンカーを指定するときは、移動先レーンのアーカイブ状態、位置、IDの順で比較した `expectedAnchorOrder`（`after-before` または `before-after`）も必要です。アンカーの間に別のチケットがあっても指定できます。移動元の位置、移動先レーン、または指定したアンカーの所属や順序が変わっていた場合、保存せず409を返します。再試行前にボードを取得し直してください。タイトルだけの編集は位置の前提に影響しません。
- 成功時は更新後のチケットが返ります。`GET /api/boards/:boardId/tickets?lane_id=9` で各チケットの `position` を確認できます。
- 1件の並べ替えには `position`、同じレーン内の複数件には `POST /api/lanes/:laneId/tickets/reorder` を使います。削除済みのボード全体の並べ替えAPIは404を返します。

### Relation を取得したい

- `GET /api/tickets/:ticketId/relations`
- `parent`, `children`, `blockers`, `blockedBy` が返る
- `blockers` は「このチケットを block している相手」
- `blockedBy` は「このチケットに block されている相手」
- `GET /api/tickets/:ticketId` の詳細にも同じ relation フィールドが含まれる

### Activity を取得したい

- `GET /api/tickets/:ticketId/activity`
- comment 追加/更新/削除、ticket 更新、transition、archive などの履歴が返る
- 返却順は新しい activity が先です。

### チケットを Resolved にしたい

- `PATCH /api/tickets/:ticketId`
- `isCompletionLane: true` のレーンを `laneId` に指定します。再開する場合は通常レーンへ移します。

### 外部 API 更新を UI に反映したい

- `GET /api/boards/:boardId/events` を `SSE` で購読する
- 更新時には短い `data: {...}` イベントが流れる
- UI 側はイベント受信後に `GET /api/boards/:boardId` と `GET /api/boards/:boardId/tickets` を再取得する

### 大量データを board ごと投入したい

- `POST /api/boards/import` を使う
- local-only 運用を前提に、大きめの board export/import payload も扱える
- 大量データの一括投入後は、一覧確認に `GET /api/boards/:boardId/tickets`、個票確認に `GET /api/tickets/:ticketId` を使い分ける

## エラーハンドリング

エラー時は基本的に次の形式です。

```json
{ "error": "message" }
```

典型例:

- `400`: 入力不正
- `404`: 対象が存在しない
- `409`: 状態競合

## APIでの絞り込み・一括並べ替え・本文追記

### レーン名・親で絞り込む

`GET /api/boards/:boardId/tickets?lane=進行中&resolved=false&parent=101` はレーン名の完全一致と直接の親で絞ります。`parent=none` は親なしです。未知のレーン名や該当しない親IDは空一覧になります。`lane`、`lane_id`、`lane_ids` のうち1つを指定できます。

### コメントを必要な件数だけ読む

`GET /api/tickets/:ticketId/comments?limit=2&order=desc` で最新2件を取得します。`limit` は1〜100、省略時は全件です。`order` は `asc` / `desc`、既定は従来どおり `desc`。同時刻の場合はIDも同じ方向にソートします。

### レーン内を一括並べ替えする

`POST /api/lanes/:laneId/tickets/reorder` に `{ "ticketIds": [103, 101] }` を送ると、指定した非アーカイブチケットを先頭に並べ、省略分は元の相対順で後ろに残します。アーカイブ済みは最後に相対順を維持します。空配列は変更なしです。別レーン・不存在・重複・アーカイブ済みIDは全件無変更で400になります。レーン不存在は404です。検証と更新は1トランザクションで行い、同時実行時は後の操作が最新の順序に適用されます。レスポンスは対象レーンの非アーカイブチケットsummaryです。

### 本文末尾へ追記する

`PATCH /api/tickets/:ticketId` に `{ "appendMarkdown": "\n\n- 追加の作業" }` を送ります。最新本文への追記をトランザクション内で行います。改行などの区切りは自動挿入しません。空文字や `bodyMarkdown` との同時指定は400です。追記後の本文上限はUTF-8で64 MiBです。繰り返すと二重追記になるため、応答が不明な場合は本文を確認してから再試行してください。別クライアントによる全文置換との競合を防ぐ機能ではありません。

### MR/PRを外部参照として登録する

`PUT /api/tickets/:ticketId/external-references/:kind` を使います。PRは `resourceType: "pull_request"`、MRは `resourceType: "merge_request"` とし、`provider`・`instanceUrl`・`projectKey`・`issueKey`・`displayRef`・`url` を指定します。同じチケットの同じ `kind` は置換されるため、複数登録する場合は `pr-main` / `mr-followup` など別のkindを使います。取得はチケットの `externalReferences` を参照します。GitHubのPRとGitLabのMRは `POST /api/tickets/:ticketId/external-references/:kind/refresh` でKanbaloneが既存の認証設定を使って状態を取得します。呼出側から状態値を送る方式ではなく、定期取得も行いません。`changeRequestStatus` は `state`（`open` / `closed` / `merged` / null）、`isDraft`、`fetchedAt`、`attemptedAt`、秘匿化した `error` を返します。snapshotがnullならリンク設定後の取得試行がありません。取得失敗は502を返し前回成功状態を保持するため、GETで確認してください。後続の取得や参照変更で古くなった応答は409です。同じURLでもPUTすると取得状態をリセットします。追跡Issueインポートへ変換することはありません。

## Group: 単一所属と親子関係の一括保存

Groupは1つのボードに属し、チケットの所属は最大1つです。親子チケットはアーカイブ済みも含め同じGroupに所属します。重ね合わせる分類にはタグを使います。

| 操作 | API |
| --- | --- |
| activeなGroup一覧 | `GET /api/boards/:boardId/groups` |
| inactiveも含める | `GET /api/boards/:boardId/groups?status=all` |
| 一覧・並び順 | `status=active\|inactive\|all`、`sort=createdAt\|name`、`order=asc\|desc` |
| Group作成 | `POST /api/boards/:boardId/groups` に `{name,descriptionMarkdown?}` |
| Group取得・編集 | `GET` / `PATCH /api/groups/:groupId`。PATCHには `expectedRevision` を含める |
| 空のGroupを削除 | `DELETE /api/groups/:groupId`。GETで受け取った `ETag` を `If-Match` に指定 |
| 所属チケット取得 | `GET /api/boards/:boardId/tickets?groupId=7&archived=all` |
| 未所属チケット検索 | `GET /api/boards/:boardId/tickets?ungrouped=true&q=guide` |
| 所属変更preview | `POST /api/boards/:boardId/group-memberships/preview` |
| 所属変更確定 | `PUT /api/boards/:boardId/group-memberships` |
| 新規作成preview | `POST /api/boards/:boardId/tickets/preview` |
| 編集preview | `POST /api/tickets/:ticketId/change-preview` |

Groupは空、または未完了かつ未アーカイブのチケットが1件以上あるとactiveです。手動のGroupアーカイブ・完了はありません。`status=all` はinactiveを含める指定で、チケット取得のアーカイブ条件は変えません。Groupの並び順の既定は作成順の昇順です。同順位ではIDで安定化します。

**所属変更:** `{ticketIds:[...],groupId:7}`、解除なら `{ticketIds:[...],groupId:null}` をpreviewします。返された対象をアーカイブ済みも含めて確認し、同じbodyに `expectedToken` を加えて確定します。子を指定しても親・兄弟へ対象が広がり、一括で更新します。別の非null Groupへの直接変更は拒否します。「解除→追加」で移してください。同じGroupへの追加はno-opです。通常のチケットPATCHで `groupId` を書き換えないでください。

**親子関係の編集:** 編集開始時にチケット詳細を取得し、`editToken` を保持します。`childTicketIds` は子の最終集合、`expectedEditToken` は取得時のtoken、`expectedSelectedParents` は新たに追加する各子の選択時の `{ticketId,parentTicketId}` です。本体の保存・子の解除・追加を別々のPATCHに分けず、1回のPATCHで保存します。全編集内容をpreviewし、Groupが競合する場合は候補を選び、同じ編集bodyに `groupResolution:{groupId}` と返された `expectedToken` を加えて確定します。候補が3つ以上になる場合もあります。

変更後の親子の非null Groupが1種類なら、未所属側をそこへ自動で揃えます。異なるGroupが混在する場合、候補を選ぶまで書き込みません。子を分離しても所属は保持し、別の親に付ける場合、元の親・兄弟のGroupは変えません。`groupId` と `parentTicketId` を指定した新規作成も同じ解決ルールです。競合する組み合わせはpreviewしてから作成します。previewでは新規チケットをINSERTしません。

Group対応のエラーには人向けの `error` と機械判定用の `code` が含まれます。古い編集・確認・revisionのエラーでは現状を読み直し、差分を検討してください。期待値だけ新しい値に差し替えて無条件に再送しません。必須の事前条件がない場合は428、不正入力は400、対象不存在は404、競合は409です。成功させるために所属先を勝手に変更したり、アーカイブ済みの対象を除外しないでください。[GroupのAPI例](./api-examples.md#groups)と[移行ガイド](./migration-guide.md#group-migration)も参照してください。

新規作成のpreviewでは作成予定チケットを `id: 0, clientRef: "new"` で表します。親変更や候補の変更IDも0を参照する場合があります。preview専用の値であり、既存チケットIDとして送信しません。所属変更の成功レスポンスは `{changedTickets, affectedGroups}` です。`GET /api/boards/:boardId/group-activity?groupId=7` で削除後も保持されるGroup履歴を新しい順に取得できます。`POST /api/markdown/preview` に `{bodyMarkdown}` を送ると、保存せずサニタイズ済みの `{bodyHtml}` を返します。

スキーマ検証エラーには `code` が付かず `error` だけの場合があります。Group PATCHの `expectedRevision` 不足は400、実行時に必要なtokenやDELETEの `If-Match` 不足は428です。

Groupのエラーコード（スキーマ検証や汎用エラーでは `code` が付かない場合があります）:

| HTTP | code | 対応 |
| --- | --- | --- |
| 400 | `INVALID_GROUP_NAME / INVALID_GROUP_DESCRIPTION` | 名前・説明の制約を満たすよう修正する。 |
| 400 | `INVALID_TICKET_IDS / INVALID_TICKET / INVALID_GROUP` | 同じボードの存在するチケット・Groupを指定する。 |
| 400 | `GROUP_WRITE_ENDPOINT` | 既存チケットの所属は所属変更preview/applyを使う。 |
| 400 | `INVALID_RELATIONS / INVALID_RELATION_EXPECTATIONS / INVALID_GROUP_RESOLUTION` | 親子編集の入力を修正するか、返却された候補を選ぶ。 |
| 404 | `BOARD_NOT_FOUND / GROUP_NOT_FOUND / TICKET_NOT_FOUND` | 対象の存在を再確認する。 |
| 409 | `GROUP_NAME_EXISTS / GROUP_NOT_EMPTY` | 重複しない名前にする。空のGroupだけ削除できる。 |
| 409 | `GROUP_ALREADY_ASSIGNED` | 確認のうえ所属を解除してから別Groupに追加する。 |
| 409 | `GROUP_CONFLICT` | detailsの候補を確認し、同じ編集内容に解決先とtokenを付けて再送する。 |
| 409 | `STALE_GROUP / STALE_GROUP_CONTEXT / STALE_TICKET_EDIT / STALE_RELATIONS` | 現状を読み直し、変化した内容を確認してから再試行する。 |
| 428 | `PRECONDITION_REQUIRED` | 必要な編集・preview token、またはIf-Matchを指定する。 |

保存した横断ビューは専用の定義・取得APIを使い、課題の所属やワークフローを変更しません。明示的な空条件、古いページの扱い、保存競合は[横断ビューAPI](./api-examples.md)を参照してください。
