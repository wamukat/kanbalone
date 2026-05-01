# Kanbalone AI API ガイド

この API は、ローカル環境で動作する単一ユーザー向けの Kanbalone API です。
ベース URL は通常 `http://127.0.0.1:3000` です。

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
curl -L https://github.com/wamukat/kanbalone/archive/refs/tags/v0.9.28.tar.gz \
  | tar -xz -C "$tmpdir" kanbalone-0.9.28/skills/kanbalone-api
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R "$tmpdir"/kanbalone-0.9.28/skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
rm -rf "$tmpdir"
```

Codex は Kanbalone container の外側で動くため、skill はホスト側にインストールします。そのうえで、起動中の Kanbalone API に HTTP で接続します。

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

### 1. `laneId` と `isResolved` は独立

- レーン名が `done` でも、Resolved 状態は `isResolved` で別管理です。
- `done` レーンに移すだけでは Resolved にはなりません。
- Resolved にしたいなら、必要に応じて `laneId` と `isResolved: true` を両方更新してください。

### 2. Blocker は「このチケットが依存している相手」

- `ticket.blockerIds = [6]` は「このチケットは `#6` に blocked される」を意味します。
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
- `lane_id`
- `tag`
- `resolved`
- `archived`
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
- 必要なら `isResolved` も同時指定する

複数チケットや順序込みの移動:

- `POST /api/boards/:boardId/tickets/reorder`

複数チケットをまとめて Resolved / Unresolved にしたい:

- `POST /api/boards/:boardId/tickets/bulk-complete`
- body に `ticketIds` と `isResolved` を入れる

複数チケットを lane 名でまとめて遷移したい:

- `POST /api/boards/:boardId/tickets/bulk-transition`
- body に `ticketIds` と `laneName` を入れる
- 必要なら `isResolved` も同時指定する

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
- body に `isResolved: true`

必要なら `laneId` も同時に更新します。

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
