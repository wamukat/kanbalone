# データモデルと概念

## 基本モデル

- Board は lane、tag、ticket を持ちます。
- Lane はワークフロー上の位置を表します。
- `isResolved` はレーンの `isCompletionLane` を反映します。チケット単体では変更しません。
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

- 完了レーンへの移動で完了、通常レーンへの移動で再開します。標準ボードの `Acceptance` は人間の受入待ちを表す通常レーン、`done` は完了レーンです。
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

## Group

Groupはボード内の作業のまとまりで、名前と任意のMarkdown説明を持ちます。複数のタグを付けられるのに対し、チケットのGroup所属は最大1つです。アーカイブ済みを含む親子チケットは同じGroupに所属します。親子関係を解除しても双方の所属を保持し、ボード間移動では移動対象の所属だけ解除します。

activeは保存するワークフロー状態ではなく、所属チケットから決まります。空のGroupはactive、それ以外は未完了かつ未アーカイブのチケットが1件以上ある間だけactiveです。inactiveでも所属は残り、取得できます。Group自身の完了・アーカイブ操作はありません。削除できるのは、アーカイブ済みを含め所属が0件の場合だけです。

Group一覧は通常activeのみ返します。チケットのアーカイブ条件とは独立しているため、全所属チケットが必要なら `archived=all` を指定します。チケットには `groupId` と `{id,name}` のGroup要約が含まれ、チケット詳細には競合検出用の `editToken` も含まれます。
