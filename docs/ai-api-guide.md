# SoloBoard AI API Guide

この API は、ローカル環境で動作する単一ユーザー向けの SoloBoard API です。
ベース URL は通常 `http://127.0.0.1:3000` です。

## Recommended Workflow

1. まずボード一覧を取得する。
   `GET /api/boards`
2. 操作対象ボードの shell を取る。
   `GET /api/boards/:boardId`
3. チケット操作前に、必要なら軽量チケット一覧または単票を取得する。
   `GET /api/boards/:boardId/tickets`
   `GET /api/tickets/:ticketId`
4. コメントや relation を個別取得したい場合は専用 endpoint を使う。
   `GET /api/tickets/:ticketId/comments`
   `GET /api/tickets/:ticketId/relations`
5. 更新は最小差分で `PATCH /api/tickets/:ticketId` を使う。
   lane 名ベース遷移は `PATCH /api/tickets/:ticketId/transition` を使う。
6. Kanban 画面の自動更新が必要なら `GET /api/boards/:boardId/events` を購読する。

## Important Semantics

### 1. `laneId` と `isCompleted` は独立

- レーン名が `done` でも、完了状態は `isCompleted` で別管理です。
- `done` レーンに移すだけでは完了になりません。
- 完了にしたいなら、必要に応じて `laneId` と `isCompleted: true` を両方更新してください。

### 2. blocker は「このチケットが依存している相手」

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

### 5. コメントは一覧取得と追記ができる

- `GET /api/tickets/:ticketId/comments` で一覧取得できます。
- `POST /api/tickets/:ticketId/comments` で追記できます。
- 編集・削除 API はありません。

### 6. canonical ref が返る

- ticket 系レスポンスには `ref` と `shortRef` が含まれます。
- 形式は `BoardName#TicketId` と `#TicketId` です。

## Common Patterns

### ボード内のチケットを検索したい

`GET /api/boards/:boardId/tickets` に query を付けます。

- この endpoint は軽量 summary 用です。
- 大きい board の描画、filter、検索、automation scan ではまずこの endpoint を使います。
- `bodyHtml`, `comments`, `parent`, `children`, 展開済み `blockers` は含みません。
- 詳細が必要なら `GET /api/tickets/:ticketId` を使います。
- `lane_id`
- `tag`
- `completed`
- `q`

### チケットをレーン移動したい

ID ベース:

- `PATCH /api/tickets/:ticketId`
- body に `laneId` を入れる

名前ベース:

- `PATCH /api/tickets/:ticketId/transition`
- body に `laneName` を入れる
- 必要なら `isCompleted` も同時指定する

複数チケットや順序込みの移動:

- `POST /api/boards/:boardId/tickets/reorder`

### relation を取得したい

- `GET /api/tickets/:ticketId/relations`
- `parent`, `children`, `blockers`, `blockedBy` が返る
- `blockers` は「このチケットを block している相手」
- `blockedBy` は「このチケットに block されている相手」

### チケットを完了にしたい

- `PATCH /api/tickets/:ticketId`
- body に `isCompleted: true`

必要なら `laneId` も同時に更新します。

### 外部 API 更新を UI に反映したい

- `GET /api/boards/:boardId/events` を `SSE` で購読する
- 更新時には短い `data: {...}` イベントが流れる
- UI 側はイベント受信後に `GET /api/boards/:boardId` と `GET /api/boards/:boardId/tickets` を再取得する

### 大量データを board ごと投入したい

- `POST /api/boards/import` を使う
- local-only 運用を前提に、大きめの board export/import payload も扱える
- 大量データの一括投入後は、一覧確認に `GET /api/boards/:boardId/tickets`、個票確認に `GET /api/tickets/:ticketId` を使い分ける

## Error Handling

エラー時は基本的に次の形式です。

```json
{ "error": "message" }
```

典型例:

- `400`: 入力不正
- `404`: 対象が存在しない
- `409`: 状態競合

## Minimal Tool Contract For AI

```text
- Resolve board IDs and lane IDs before updating tickets.
- Treat GET /api/boards/:boardId as board shell only; fetch tickets separately.
- Treat laneId and isCompleted as separate fields.
- blockerIds means "this ticket is blocked by these tickets".
- Use GET /api/tickets/:ticketId/relations when you need both forward and reverse dependency edges.
- Use PATCH /api/tickets/:ticketId/transition for lane-name-based transitions.
- Prefer ref and shortRef for logs, diagnostics, and summaries.
- Never create reciprocal blockers.
- Parent-child depth is one level only.
- Use PATCH /api/tickets/:ticketId for normal ticket edits.
- Use reorder endpoints only for explicit sorting or drag-and-drop persistence.
```
