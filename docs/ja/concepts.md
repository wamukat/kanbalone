# データモデルと概念

## 基本モデル

- Board は lane、tag、ticket を持ちます。
- Lane はワークフロー上の位置を表します。
- `isResolved` は API 上の Resolved 状態で、lane とは独立しています。
- `isArchived` は通常のボード一覧から ticket を隠します。
- Tag は board ごとに独立しています。
- Comment は ticket に属します。
- Blocker と親子リンクで ticket 間の関係を表します。

## チケット状態

- `laneId` と `isResolved` は別フィールドです。UI では `isResolved` を Resolved と表示します。
- Archived ticket はデフォルトではボード一覧に表示されません。
- Ticket には正規参照として `ref` と `shortRef` が含まれます。
- UI では priority を Low / Medium / High / Urgent のカテゴリとして表示します。内部APIでは数値を維持しているため、自動化では数値指定も利用できます。

## 関係

- Blocker は「この ticket が、どの ticket にブロックされているか」を表します。
- 相互 blocker は許可されません。
- 親子関係は 1 階層までです。

## API の考え方

- `GET /api/boards/:boardId` は board shell のみを返します。含まれるのは board、lanes、tags です。
- Tickets は `GET /api/boards/:boardId/tickets` で別に取得します。
- Ticket list route は、ボード描画や自動化スキャン向けの軽量 summary を返します。
- 詳細が必要な場合は `GET /api/tickets/:ticketId` を使います。
- 複数 ticket の Resolved 状態変更や lane 名ベースの遷移には、board 単位の bulk endpoint を使います。

## API リファレンス

- [OpenAPI](../openapi.yaml)
- [AI API ガイド](ai-api-guide.md)
- [API 例](api-examples.md)
