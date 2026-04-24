# データモデルと概念

## 基本モデル

- Board は lane、tag、ticket を持ちます。
- Lane はワークフロー上の位置を表します。
- `isResolved` は API 上の Resolved 状態で、lane とは独立しています。
- `isArchived` は通常のボード一覧から ticket を隠します。
- Tag は board ごとに独立しています。
- Comment は ticket に属します。
- Blocker と親子リンクで ticket 間の関係を表します。

## Remote Issue Workspace

- Kanbalone は remote issue tracker の代替ではなく、GitHub Issues、GitLab、Redmine などの remote issue のローカル実装ワークスペースです。
- remote issue を import した ticket には `remote` metadata が付きます。
- remote tracked ticket では、`title` は remote 由来の read-only 値になります。
- `bodyMarkdown` は local body として扱われ、実装本文や AI 向け指示を育てる場所になります。
- `remote.bodyMarkdown` / `remote.bodyHtml` は read-only snapshot です。
- remote へ push する対象は comment のみです。

## チケット状態

- `laneId` と `isResolved` は別フィールドです。UI では `isResolved` を Resolved と表示します。
- Archived ticket はデフォルトではボード一覧に表示されません。
- Ticket には正規参照として `ref` と `shortRef` が含まれます。
- UI と API は同じ priority 値を使います。`1 = low`、`2 = medium`、`3 = high`、`4 = urgent` です。

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
- remote import / refresh / comment push は専用 endpoint で行います。

## API リファレンス

- [OpenAPI](../openapi.yaml)
- [AI API ガイド](ai-api-guide.md)
- [API 例](api-examples.md)
