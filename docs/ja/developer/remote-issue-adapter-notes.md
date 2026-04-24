# Remote Issue Adapter 検討メモ

この文書は、Kanbalone と remote issue tracking system の連携について、初期議論の内容を整理したメモです。
現時点では製品仕様の確定版ではなく、合意点と未決事項を分けて残します。

## 背景

Kanbalone は、ローカルで軽快に動く個人向け Kanban として設計されています。
一方、実際のチケット管理は GitHub Issues、Redmine、Jira などの remote system に置かれていることが多く、実装作業だけをローカルで素早く進めたい需要があります。

このため、remote issue を Kanbalone に取り込み、ローカルで実装を進めつつ、必要最小限の情報だけ remote に反映する adapter 機構を検討しています。

## 目指したい方向

- Kanbalone を remote issue tracker の代替にしない
- Kanbalone を remote issue のローカル実装ワークスペースとして使う
- remote は課題の正本、Kanbalone は作業面という役割分担を保つ
- AI エージェントが Kanbalone API だけで作業を進めやすい形にする

## 現時点の合意点

### 1. board は remote の構造に結び付けない

- board は最後までローカルの作業整理単位として扱う
- board 単位の remote connection や remote query binding は持たせない
- remote 連携は board 単位ではなく ticket 単位に寄せる

### 2. remote issue は 1 つの board にだけ取り込む

- 同じ remote issue を複数 board にまたがって扱うと、lane や tag の board 依存性と衝突する
- そのため、MVP では 1 remote issue は Kanbalone 全体で 1 回だけ import 可能とする案が有力
- 別 board に既に取り込み済みの issue は、import 候補で非表示または disabled 表示にする
- 別 board で扱いたい場合は、既存 ticket を board 間で move する

### 3. local で編集できるのは comment 中心に絞る

- title や body の双方向同期は行わない
- title は remote から import する
- import された title は local では編集しない
- remote issue の title は read-only な参照情報として扱う
- 本文や要件の修正が必要なら remote system 側で更新し、再取得する
- Kanbalone から remote へ push する対象も comment に限定する案が有力

ただし body については、remote 由来の本文と Kanbalone ローカルの実装本文を分けて持つ案を採る方向になっています。

### 4. lane は完全にローカルの概念とする

- lane は Kanbalone 上の個人作業フローを表す
- remote system の status や workflow とは基本的に切り離す
- remote status の完全同期は Kanbalone の単純さを壊しやすいため、MVP では避ける

### 5. remote tracking metadata は ticket に直接持たせる

- board に remote 接続情報を持たせるのではなく、取り込み済み ticket に remote 情報を紐付ける
- A-AI が ticket 単位で remote issue を参照し、必要なら comment push できるようにする

### 6. body は remote body と local body の 2 面を持つ

- remote tracked ticket では、本文を 1 つにせず役割を分ける
- `remote body` は remote issue から取得した要件・背景・受け入れ条件の snapshot
- `local body` は Kanbalone 上で育てる実装指示・実装計画・A2O/A-AI 向けの作業本文
- remote body は read-only
- local body は編集可能
- remote への push 対象は引き続き comment のみで、local body 自体は remote へ反映しない

初回 import 時の local body は、空ではなく remote body を叩き台としてコピーする案を採る方向です。
その後、local body は remote body と独立して育て、remote refresh では上書きしません。

## 製品としての位置付け

この構想では、Kanbalone は次のような立ち位置になります。

- remote issue tracker の mirror ではない
- remote issue の local execution workspace である
- remote が issue の正本を所有し、Kanbalone が execution context と work log を所有する

この整理により、remote 側の複雑な workflow やフィールドを Kanbalone core に持ち込まずに済みます。

## API に関する現時点の考え方

A-AI が実装を進めるには、ticket から remote issue の参照情報を読めて、comment を記録・必要に応じて push できる必要があります。

そのため、API 拡張の方向性としては次を想定しています。

- 既存 endpoint の URL は維持する
- 既存 request payload の shape は変更しない
- 既存の create/update 操作に remote 専用 field を混ぜない
- ticket detail と ticket summary には追加 field として `remote` 情報を載せる
- comment には追加 field として sync metadata を載せる
- remote issue の import は専用 endpoint で行う
- comment の remote 反映も専用 endpoint で行う

body の意味論は次を想定しています。

- title は remote から import した read-only 値を使う
- 既存の `bodyMarkdown` は local body として使う
- remote tracked ticket では `remote.bodyMarkdown` に remote snapshot を持つ
- A2O/A-AI はまず local body を主入力として扱い、必要に応じて remote body を参照する
- remote refresh は `remote.bodyMarkdown` を更新するが、`bodyMarkdown` は更新しない

### 互換性の原則

既存利用者への影響を避けるため、API 互換性について次を原則にします。

- `GET /api/boards/:boardId/tickets` と `GET /api/tickets/:ticketId` の既存 field は削除しない
- `POST /api/boards/:boardId/tickets` と `PATCH /api/tickets/:ticketId` の request body schema は維持する
- remote 連携のために既存 mutation body に必須 field を追加しない
- remote 用の情報は response の追加 field または新規 endpoint に閉じ込める

既存 payload の wire shape は維持しますが、remote tracked ticket では一部 field の意味論に差分が入ります。

- `title` は remote から import された read-only title を表す
- `bodyMarkdown` は remote tracked ticket では `local body` を表す
- `remote.bodyMarkdown` は read-only snapshot の source
- UI では `remote.bodyHtml` を使って remote body を Markdown render 表示する

既存クライアントは引き続き同じ shape の payload を読めますが、`bodyMarkdown` を「唯一の本文」とみなすクライアントには意味論の差分があります。

### 追加 field の方針

既存 payload の形を踏襲するため、remote 連携の情報は追加 field として表現します。

ticket detail / summary の追加 field 候補:

- `remote`

comment の追加 field 候補:

- `sync`

この形であれば、新しい A-AI や UI は `remote` / `sync` を読んで remote 連携機能を使えます。
ただし現行実装では response schema が `additionalProperties: false` なので、実装時は追加 field を返すだけでは足りません。

実装時に同時更新が必要なもの:

- response schema
- TypeScript view types
- serializer / mapper
- OpenAPI

### ticket response の payload 方針

既存の ticket response は維持しつつ、`remote` を追加します。
ticket response では常に `remote` field を返し、local-only ticket では `remote: null` とします。

summary endpoint では軽量性を保つため、`remote` は detail より小さい shape に限定します。
summary に含める候補は次の程度です。

- `provider`
- `displayRef`
- `url`

想定例:

```json
{
  "id": 42,
  "boardId": 3,
  "laneId": 7,
  "title": "Fix login redirect loop",
  "bodyMarkdown": "A2O / A-AI向けの実装本文",
  "priority": 3,
  "comments": [],
  "ref": "Dev#42",
  "shortRef": "#42",
  "remote": {
    "provider": "github",
    "instanceUrl": "https://github.com",
    "resourceType": "issue",
    "projectKey": "acme/webapp",
    "issueKey": "123",
    "displayRef": "acme/webapp#123",
    "url": "https://github.com/acme/webapp/issues/123",
    "title": "Fix login redirect loop",
    "bodyMarkdown": "Remote issue body snapshot",
    "updatedAt": "2026-04-23T10:00:00Z"
  }
}
```

ここでの意味論は次の通りです。

- `title` は remote から import された read-only title
- `bodyMarkdown` は local body
- `remote.title` と `remote.bodyMarkdown` / `remote.bodyHtml` は read-only snapshot

### comment response の payload 方針

既存 comment payload に `sync` を追加する形を想定します。

想定例:

```json
{
  "id": 5001,
  "ticketId": 42,
  "bodyMarkdown": "Implemented validation and verified locally.",
  "bodyHtml": "<p>Implemented validation and verified locally.</p>",
  "createdAt": "2026-04-23T10:30:00Z",
  "sync": {
    "status": "local_only",
    "remoteCommentId": null,
    "pushedAt": null,
    "lastError": null
  }
}
```

MVP では comment 種別は導入しません。
すべての comment は作成時に `local_only` とし、明示操作で remote へ push します。

`sync.status` の候補:

- `local_only`
- `pushed`
- `push_failed`

`push_requested` のような中間状態は MVP では持ちません。

`sync` は `GET /api/tickets/:ticketId/comments` だけでなく、`GET /api/tickets/:ticketId` の埋め込み comments にも同じ形で返す前提にします。

### 既存 mutation payload の扱い

既存の ticket mutation body は変更しない想定です。
つまり、次の endpoint は既存 shape を維持します。

- `POST /api/boards/:boardId/tickets`
- `PATCH /api/tickets/:ticketId`
- `POST /api/tickets/:ticketId/comments`
- `PATCH /api/comments/:commentId`

例えば `POST /api/boards/:boardId/tickets` は引き続き次のような形です。

```json
{
  "laneId": 9,
  "title": "Draft API usage guide",
  "bodyMarkdown": "Document the most common ticket operations.",
  "priority": 4,
  "tagIds": [3],
  "blockerIds": []
}
```

remote tracked ticket を通常の create/update endpoint から直接作らせるのではなく、remote import 用の専用 endpoint で作ることで、既存 API 利用者への影響を抑えます。

remote tracked ticket に対する既存 mutation endpoint の挙動は、次のように明示します。

- `PATCH /api/tickets/:ticketId`
  - `title` の更新は受け付けない
  - `title` が変更されている場合は `400` を返す
  - `bodyMarkdown`, `laneId`, `priority`, `tagIds`, `blockerIds`, `parentTicketId`, `isResolved`, `isArchived` などローカル編集可能項目のみ更新可能とする
- `PATCH /api/comments/:commentId`
- `pushed` 済み comment の編集は MVP では受け付けない
- `pushed` 済み comment の削除も MVP では受け付けない
- 編集が必要な場合は新しい comment を追加して再 push する

### 新規 endpoint の方針

remote 連携用の操作は、新規 endpoint に切り出す方針です。

候補:

- `POST /api/boards/:boardId/remote-import`
- `POST /api/tickets/:ticketId/remote-refresh`
- `POST /api/comments/:commentId/push-remote`

この分離により、既存 client が誤って remote 連携の概念を意識せずに済みます。

remote provider の認証・接続先選択は board ではなく user/session スコープで扱い、import dialog から利用する想定です。
MVP では provider ごとの接続設定 UI は別導線に切り出します。

### A-AI から見た最小利用パターン

A-AI が remote tracked ticket を扱う際は、次の流れを想定します。

1. `GET /api/tickets/:ticketId` で ticket を取得する
2. `title`, `bodyMarkdown`, `remote.displayRef`, `remote.url`, `remote.bodyMarkdown` を参照する
3. `POST /api/tickets/:ticketId/comments` で local comment を追加する
4. 必要なら `POST /api/comments/:commentId/push-remote` で remote へ反映する
5. remote 側の本文が更新されたら `POST /api/tickets/:ticketId/remote-refresh` で再取得する

## DB スキーマ案

既存の `tickets` / `comments` テーブルは Kanbalone core の中心なので、remote 連携のために直接意味を崩さない方針です。
そのため、DB も「既存テーブルを主データとして維持し、remote tracking 用の補助テーブルを追加する」案を採ります。

### スキーマ設計の原則

- 既存の `tickets` テーブルは引き続きローカル作業 card の実体とする
- 既存の `comments` テーブルは引き続きローカル comment の実体とする
- remote 連携の状態は別テーブルに持つ
- local-only ticket / comment は追加テーブルにレコードを持たなくても成立する
- migration は additive に行い、既存データを壊さない

### 既存テーブルとの役割分担

既存テーブル:

- `tickets`
  - `title`: remote tracked ticket では import された read-only title を保持
  - `body_markdown`: remote tracked ticket では local body を保持
- `comments`
  - local comment の本文を保持

追加テーブル:

- ticket ごとの remote 参照情報
- comment ごとの remote push 状態
- 重複 import 防止用の一意 tracking

### 追加テーブル案 1: `ticket_remote_links`

remote tracked ticket の参照情報を持つテーブルです。
1 ticket に対して 0 or 1 件の remote link を持つ前提です。

想定カラム:

- `ticket_id` INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE
- `provider` TEXT NOT NULL
- `instance_url` TEXT NOT NULL
- `resource_type` TEXT NOT NULL DEFAULT 'issue'
- `project_key` TEXT NOT NULL
- `issue_key` TEXT NOT NULL
- `display_ref` TEXT NOT NULL
- `remote_url` TEXT NOT NULL
- `remote_title` TEXT NOT NULL
- `remote_body_markdown` TEXT NOT NULL DEFAULT ''
- `remote_state` TEXT
- `remote_updated_at` TEXT
- `last_synced_at` TEXT NOT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

用途:

- `GET /api/tickets/:ticketId` の `remote` payload を構成する
- UI で `Open remote` と `Refresh from remote` を出す
- A-AI が remote issue の ref と本文 snapshot を読む

### 一意制約

同じ remote issue の重複 import を防ぐため、次の一意制約を置く案が有力です。

- UNIQUE (`provider`, `instance_url`, `project_key`, `issue_key`)

これにより、

- 1 remote issue は Kanbalone 全体で 1 ticket にだけ結び付く
- import 時に既存 ticket の存在チェックができる
- UI で「既にどの board に取り込み済みか」を引ける

### 追加テーブル案 2: `comment_remote_sync`

comment ごとの remote push 状態を持つテーブルです。
comment 自体は既存の `comments` テーブルに残し、remote への反映状態だけを分離します。

想定カラム:

- `comment_id` INTEGER PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE
- `status` TEXT NOT NULL
- `remote_comment_id` TEXT
- `pushed_at` TEXT
- `last_error` TEXT
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

`status` 候補:

- `local_only`
- `pushed`
- `push_failed`

用途:

- `GET /api/tickets/:ticketId/comments` の `sync` payload を構成する
- `POST /api/comments/:commentId/push-remote` の結果を保持する
- UI で `Push to remote` / `Pushed` / `Retry` を出す

### なぜ `comments` テーブルに直接カラム追加しないか

直接 `comments` に remote push 状態カラムを追加する案もありますが、現時点では別テーブルの方が筋がよいです。

理由:

- local-only comment の意味を汚しにくい
- remote 連携機能を使わないデータは疎のまま保てる
- remote sync まわりの失敗情報や将来の拡張を隔離しやすい
- 既存 comment read/write 実装への影響が小さい

### 追加テーブル案 3: `ticket_remote_import_log` は MVP では不要

import や refresh の履歴を別テーブルに持つ案もありますが、MVP では不要寄りです。

候補用途:

- import 失敗履歴
- refresh 履歴
- audit trail

ただし現時点では、最低限の運用なら `activity_logs` への記録で十分な可能性があります。
そのため、MVP では新規テーブルを増やさず、必要なら activity message で表現する案が有力です。

### migration の方針

既存 migration スタイルに合わせて、`CREATE TABLE IF NOT EXISTS` と `CREATE INDEX IF NOT EXISTS` を中心に追加する想定です。
既存 `tickets` や `comments` の再構築は避け、なるべく additive に進めます。

想定される migration 追加イメージ:

```sql
CREATE TABLE IF NOT EXISTS ticket_remote_links (
  ticket_id INTEGER PRIMARY KEY REFERENCES tickets(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  instance_url TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'issue',
  project_key TEXT NOT NULL,
  issue_key TEXT NOT NULL,
  display_ref TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  remote_title TEXT NOT NULL,
  remote_body_markdown TEXT NOT NULL DEFAULT '',
  remote_state TEXT,
  remote_updated_at TEXT,
  last_synced_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ticket_remote_links_remote_unique_idx
ON ticket_remote_links(provider, instance_url, project_key, issue_key);

CREATE TABLE IF NOT EXISTS comment_remote_sync (
  comment_id INTEGER PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  remote_comment_id TEXT,
  pushed_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### read model への影響

既存の ticket / comment read model は維持しつつ、必要なときだけ join で追加情報を載せる想定です。

- ticket detail:
  - `tickets` + `ticket_remote_links`
- ticket summary:
  - `tickets` + `ticket_remote_links` の軽量版
- comment list:
  - `comments` + `comment_remote_sync`

この形なら、remote 連携を使わない board / ticket では追加テーブルが空でも成立します。

### import 時の DB 更新イメージ

remote import では次の順で書く想定です。

1. `tickets` に通常 ticket を作る
2. `body_markdown` には initial local body を書く
   - 初回は remote body をコピーした値
3. `ticket_remote_links` に remote snapshot を作る
4. 必要なら `activity_logs` に `imported from remote issue` を記録する

### refresh 時の DB 更新イメージ

title / remote body の双方向同期は行いません。
許可するのは remote から local snapshot への refresh のみであり、local から remote への反映は comment に限定します。

remote refresh では次を更新します。

- `tickets.title`
- `ticket_remote_links.remote_title`
- `ticket_remote_links.remote_body_markdown`
- `ticket_remote_links.remote_state`
- `ticket_remote_links.remote_updated_at`
- `ticket_remote_links.last_synced_at`

一方で、次は更新しません。

- `tickets.body_markdown`
- `comments`
- `comment_remote_sync`

### 削除と移動の意味

ticket を board 間 move する場合:

- `tickets.board_id` は更新される
- `ticket_remote_links` はそのまま維持される

ticket を delete する場合:

- `tickets` 削除に追従して `ticket_remote_links` も削除される
- `comments` 削除に追従して `comment_remote_sync` も削除される

これにより、remote import の一意制約も自然に解放されます。

### board export/import との関係

board export/import は remote 連携情報を含めない前提にします。

- `ticket_remote_links` の内容は board export に出さない
- `comment_remote_sync` の内容は board export に出さない
- import でも remote link / sync 状態は復元しない

必要なら将来的に export 用 DTO を `TicketView` / `CommentView` から切り離しますが、MVP では remote metadata を export 対象外に固定します。

### MVP 時点で見送りたい DB 複雑化

- remote provider ごとの custom field 保存テーブル
- remote issue と local ticket の多対多
- remote attachment 同期テーブル
- remote assignee / label の正規化テーブル
- refresh 履歴や push job のキュー管理テーブル

まずは `ticket_remote_links` と `comment_remote_sync` の 2 テーブルで十分という整理です。

## MVP で先に固定しておく運用ルール

- active ticket に紐付く remote issue は再 import 不可
- archived ticket に紐付く remote issue も再 import 不可
- deleted ticket は一意制約を解放し、再 import 可

想定される remote 情報の例:

- provider
- instanceUrl
- projectKey
- issueKey
- displayRef
- url
- remote title/body snapshot
- remote updatedAt

## コメントの扱いで見えている論点

MVP では comment 種別は導入しません。
すべての comment はまず local comment として作成し、必要なものだけを明示操作で remote に push します。

状態は次の 3 つに固定します。

- `local_only`
- `pushed`
- `push_failed`

## Ticket Detail UI の表示ルール

ticket detail は今回の仕様変更の中心になります。
ただし、Kanbalone のシンプルさを保つため、通常 ticket の detail はできるだけ現状維持とし、remote tracked ticket の場合だけ追加情報を見せる方針が有力です。

### 通常 ticket

- title は編集可能
- `bodyMarkdown` は唯一の本文として扱う
- body は現行通り detail の主本文として表示し、編集できる
- comments は現行通りローカル comment として扱う
- remote 情報セクションは表示しない

### Remote tracked ticket

- title は remote から import した値を表示する
- title は read-only とし、インライン編集 UI は出さない
- `bodyMarkdown` は local body として扱う
- local body は編集可能
- `remote.bodyMarkdown` は remote body として扱い、read-only で表示する
- 本文領域は view mode / edit mode ともに `Local Body` / `Remote Body` の tab 切り替えにする
- comments は現行の comment UI をベースにしつつ、comment ごとに remote push 操作を持てるようにする
- remote 情報は detail 上で参照できるようにするが、常設の大きな設定 UI にはしない

### 表示優先順位

remote tracked ticket では、detail 画面内の情報の優先順位を次のように置く想定です。

1. title
2. local body
3. remote body
4. comments
5. activity
6. remote metadata

意図としては、普段の実装作業ではまず local body を見て、必要なときだけ remote body や remote metadata を参照する導線にします。

### Detail 画面で見せたい remote 情報

remote tracked ticket の detail では、少なくとも次を見せられるようにしたいです。

- provider
- displayRef
- remote URL
- remote updatedAt

操作としては次を候補にします。

- `Open remote`
- `Refresh from remote`

### UI 設計上の原則

- board 画面には remote 用の大きな領域を増やさない
- remote 連携機能の主要な表示面は ticket detail に寄せる
- remote tracked ticket でも、日常的に触る主領域は local body と comments に保つ
- remote body は参照情報として扱い、編集 affordance を出さない
- remote metadata は補助情報としてまとめ、本文より前に出しすぎない

### まだ未決の細部

- remote body を常時展開にするか、折りたたみにするか
- local body が空のときに remote body への導線をどう強めるか
- title の read-only 性を注記テキストで出すか、単に編集ボタンを消すだけにするか
- comments の remote push 状態を inline で出すか、操作メニューに入れるか
- 通常 ticket と remote tracked ticket で detail レイアウトをどこまで共通化するか

## 画面レイアウト案

既存の detail dialog は、概ね次の順序で構成されています。

- header
- meta
- body
- relations
- comments / activity tab

この構造は維持し、remote tracked ticket のときだけ `remote summary` と body tab を追加する案を基本とします。

### 通常 ticket の detail レイアウト案

```text
+--------------------------------------------------------------+
| #123  [Resolved]                         [Edit]              |
| Title (editable)                                             |
+--------------------------------------------------------------+
| tags                                                         |
+--------------------------------------------------------------+
| Body                                                         |
| editable markdown body                                       |
| [Edit description]                                           |
+--------------------------------------------------------------+
| Relations                                                    |
+--------------------------------------------------------------+
| [Comments] [Activity]                                        |
|                                                              |
| Add Comment                                                  |
| comment list                                                 |
+--------------------------------------------------------------+
```

### Remote tracked ticket の detail レイアウト案

```text
+--------------------------------------------------------------+
| #123  [Resolved]                         [Edit local body]   |
| Remote title (read-only)                                     |
+--------------------------------------------------------------+
| tags                                                         |
| GitHub  acme/webapp#456  [Open remote] [Refresh from remote] |
| Updated from remote: 2026-04-23 10:00                        |
+--------------------------------------------------------------+
| [Local Body] [Remote Body]                                   |
+--------------------------------------------------------------+
| Local Body tab                                               |
| editable implementation body for A2O / A-AI                  |
| [Edit local body]                                            |
+--------------------------------------------------------------+
| Relations                                                    |
+--------------------------------------------------------------+
| [Comments] [Activity]                                        |
|                                                              |
| Add Comment                                                  |
| - local comment                                [Push remote]  |
| - pushed comment                               [Pushed]       |
+--------------------------------------------------------------+
```

### レイアウト差分の要点

- header は共通のまま使う
- remote tracked ticket では title の編集 affordance を消す
- meta の直下に `remote summary` を追加する
- main body は `Local Body` / `Remote Body` の tab 切り替えにする
- 初期表示は `Local Body` にする
- comments / activity tab の位置は変えない

### Remote Summary の内容

remote tracked ticket の meta 直下に小さな summary row を追加する想定です。

含める要素:

- provider badge
- displayRef
- remote URL へのリンク
- refresh action
- remote updatedAt

この領域は設定パネルではなく、参照と軽い操作だけを置く情報バーとして扱います。

### Body Tabs

remote tracked ticket の本文領域は、縦積みではなく tab 切り替えにする案を採ります。

タブ案:

- `Local Body`
- `Remote Body`

ルール:

- 初期表示は `Local Body`
- 通常 ticket では body tab 自体を表示しない
- remote tracked ticket のときだけ表示する

この形にすると、remote body が長い場合でも detail 全体が縦に伸びすぎず、comments までの距離も抑えやすくなります。

### Local Body タブ

- detail における主本文
- `bodyMarkdown` を使う
- A2O/A-AI に渡す実装用の厚い本文として扱う
- 通常 ticket の body 表示に最も近い見た目を維持する
- remote tracked ticket でも、ユーザーが普段触るのはこの領域を中心にする

ラベル候補:

- `Implementation Body`
- `Local Body`
- `Execution Notes`

現時点では、意味が直感的な `Local Body` か、用途が明確な `Implementation Body` が有力です。

### Remote Body タブ

- `remote.bodyMarkdown` を read-only で表示する
- 初回 import 時の元ネタとしても、refresh 後の確認先としても機能する
- local body と見分けやすくするため、見た目を少し抑える
- 編集 affordance は出さない

表示ルール案:

- 見出しに `Remote Body`
- subtitle に `Read-only snapshot from remote issue`
- 本文が長い場合は tab 内で scroll させるか、一定高さで切って `Show more` を出す

### Comments セクション

comments の構造は大きく変えず、item 単位で remote push 状態を持たせる案です。

通常 ticket:

- 現行通り

Remote tracked ticket:

- 各 comment の右側または footer に action/status を出す
- 状態は `Push to remote`, `Pushed`, `Retry` 程度に抑える
- comment compose 時点で複雑な mode selector は置かない

### 既存 UI への影響を抑える方針

- dialog 全体の骨格は維持する
- title 行、meta 行、body セクションの延長で解決する
- body 内の tab 追加だけに留める
- board 画面には remote 用の新規ペインを追加しない
- remote tracked ticket 以外はほぼ現状維持にする

## 実装向けの最小差分イメージ

detail dialog に対して必要になりそうな UI 差分は次の程度です。

- title の read-only 表示切り替え
- meta 内または meta 直下への remote summary row 追加
- body セクションの 2 面化
- comment item への remote push action / status 表示

この範囲に収めると、既存の detail dialog 実装を大きく壊さずに進めやすい想定です。

## 編集画面の方針

編集画面は、通常 ticket と remote tracked ticket で編集可能範囲を分けます。
ただし、detail dialog 全体を別画面に分岐させるのではなく、既存の edit mode をできるだけ流用する方針です。

### 通常 ticket の編集画面

- 現行の edit mode をほぼ維持する
- title は編集可能
- `bodyMarkdown` は唯一の本文として編集可能
- lane / priority / tags / relations は現行通り編集可能

### Remote tracked ticket の編集画面

- title は remote 由来の read-only 値として扱い、編集フォームから外す
- `bodyMarkdown` は `Local Body` として編集可能
- `remote.bodyMarkdown` は編集不可
- lane / priority / tags / relations は通常 ticket と同様に編集可能
- remote metadata の編集 UI は持たない

### Remote tracked ticket の本文タブ

remote tracked ticket では、edit mode でも本文領域を tab で扱う案を採ります。

タブ構成:

- `Local Body`
- `Remote Body`

ルール:

- `Local Body` タブでは `bodyMarkdown` を編集できる
- `Remote Body` タブでは `remote.bodyHtml` を read-only rendered Markdown として閲覧できる
- edit mode 中でも `Remote Body` タブに切り替えられる
- これにより、remote issue 本文を参照しながら local body を編集できる

### 編集画面レイアウト案

#### 通常 ticket

```text
+--------------------------------------------------------------+
| #123                                         [Save] [Close]  |
| [Title input..............................................]  |
+--------------------------------------------------------------+
| [Body textarea.............................................] |
|                                                              |
+--------------------------------------------------------------+
| Lane     Priority                                            |
| Tags     Relations                                           |
+--------------------------------------------------------------+
```

#### Remote tracked ticket

```text
+--------------------------------------------------------------+
| #123                                         [Save] [Close]  |
| Remote title (read-only)                                     |
+--------------------------------------------------------------+
| GitHub  acme/webapp#456  [Open remote] [Refresh from remote] |
+--------------------------------------------------------------+
| [Local Body] [Remote Body]                                   |
+--------------------------------------------------------------+
| Local Body tab                                               |
| [editable textarea for bodyMarkdown.......................]  |
|                                                              |
+--------------------------------------------------------------+
| Lane     Priority                                            |
| Tags     Relations                                           |
+--------------------------------------------------------------+
```

`Remote Body` タブに切り替えた場合のイメージ:

```text
+--------------------------------------------------------------+
| [Local Body] [Remote Body]                                   |
+--------------------------------------------------------------+
| Remote Body tab                                              |
| read-only remote issue markdown snapshot                     |
|                                                              |
+--------------------------------------------------------------+
```

### 編集画面での原則

- remote tracked ticket でも、通常 ticket と同じ dialog の流れを保つ
- title の編集可否だけでなく、本文の責務分離を UI でも明確にする
- remote body は hidden data にせず、常に閲覧可能にする
- ただし remote body の編集 affordance は出さない
- local body を実装の主入力として扱う

### 未決の細部

- edit mode で `Remote Body` タブをどの程度装飾するか
- `Open remote` と `Refresh from remote` を view mode のみに置くか、edit mode にも置くか
- local body 未編集時に、remote body からの初回コピーを UI でどう示すか

## 今の時点で避けたいもの

- title/body の双方向編集
- remote workflow と lane の完全同期
- board 単位の remote binding
- 1 remote issue を複数 board に自然展開するための複雑な中間モデル
- remote system 固有フィールドの広範な吸収
- 常時リアルタイムな双方向同期

これらは Kanbalone のシンプルさを壊しやすく、MVP の焦点もぼかしやすいです。

なお、body を 2 面に持つこと自体は許容しますが、それは「remote の正本性を壊さずに local 実装本文を厚く持つため」の最小限の拡張として扱います。

## 今後さらに議論が必要な点

### 1. import UX

- issue URL 指定で 1 件 import するか
- `assigned to me` のような一覧から複数選択 import するか
- import 済み issue をどう見せるか

### 2. comment push の操作モデル

- comment 作成時に push モードを選ばせるか
- まず local comment として保存し、後から明示的に push するか
- push 失敗時の再試行やエラー表示をどうするか

### 3. remote 本文更新の取り込み

- manual refresh のみでよいか
- ticket detail を開いた時に差分検知するか
- remote 更新を UI 上でどう通知するか
- initial import 時に local body へどのようなテンプレート整形を入れるか

### 4. import 一意性の扱い

- Kanbalone 全体で一意にするか
- archived ticket や deleted ticket の場合に再 import を許可するか
- 「既に別 board に存在する」ことをどの UI でどう示すか

### 5. A-AI 向け API の最小セット

- ticket payload に remote 情報をどこまで載せるか
- ticket summary にも remote 情報を載せるか
- comment sync 状態をどこまで返すか
- remote import / refresh / comment push の endpoint をどう分けるか

## 実装タスク分解

MVP を進めるなら、OpenAPI を先に細かく起こすより、実装依存の少ない順にタスクを切った方が進めやすいです。
特に今回は「既存 shape を壊さない」「remote tracked ticket だけ振る舞いを変える」が前提なので、DB と read model の土台を先に作ってから API / UI を重ねる方が安全です。

### 推奨する実装順

1. DB migration と内部モデル
2. read model / serializer の拡張
3. remote 専用 API endpoint の追加
4. 既存 mutation endpoint の remote ticket 制約
5. detail / edit UI の切り替え
6. comment push UI
7. import UI
8. OpenAPI / docs / tests の整備

### Phase 1: DB migration と内部モデル

目的:

- remote tracking 情報を保存できる状態を作る
- 既存 `tickets` / `comments` の read/write を壊さない

タスク:

- `ticket_remote_links` テーブル追加
- `comment_remote_sync` テーブル追加
- 一意 index 追加
- TypeScript row/view type の追加
- DB helper の追加
  - remote link の作成
  - remote link の取得
  - remote snapshot の refresh
  - comment sync 状態の取得 / 更新

完了条件:

- migration 後も既存 board / ticket / comment 操作が壊れない
- local-only データでは追加テーブルが空でも正常動作する

### Phase 2: read model / serializer の拡張

目的:

- UI と A-AI が読める `remote` / `sync` payload を返せるようにする

タスク:

- `TicketView` に `remote` 追加
- `TicketSummaryView` に軽量 `remote` 追加
- `CommentView` に `sync` 追加
- mapper / loader / serializer 更新
- response schema 更新
- OpenAPI schema 更新対象の洗い出し

実装ルール:

- ticket detail は完全な `remote` を返す
- ticket summary は軽量 `remote` のみ返す
- comment list と ticket detail 埋め込み comments は同じ `sync` shape に揃える
- local-only ticket は `remote: null`

完了条件:

- `GET /api/tickets/:ticketId` で `remote` が返る
- `GET /api/boards/:boardId/tickets` で軽量 `remote` が返る
- `GET /api/tickets/:ticketId/comments` と detail 埋め込み comments で `sync` が返る

### Phase 3: remote 専用 API endpoint の追加

目的:

- 既存 create/update endpoint を汚さずに remote 機能を追加する

候補 endpoint:

- `POST /api/boards/:boardId/remote-import`
- `POST /api/tickets/:ticketId/remote-refresh`
- `POST /api/comments/:commentId/push-remote`

タスク:

- remote import request/response schema 定義
- remote refresh request/response schema 定義
- comment push request/response schema 定義
- adapter interface の仮定義
  - `fetchIssue`
  - `postComment`
- MVP では provider 実装を 1 つに絞る
  - GitHub Issues が有力

完了条件:

- remote issue から tracked ticket を 1 件作れる
- remote refresh で title / remote body snapshot を更新できる
- comment push で `comment_remote_sync` が更新される

### Phase 4: 既存 mutation endpoint の remote ticket 制約

目的:

- 既存 payload shape を維持したまま、remote tracked ticket の制約をサーバ側で保証する

タスク:

- `PATCH /api/tickets/:ticketId` で remote tracked ticket の title 更新を拒否
- `PATCH /api/comments/:commentId` で pushed 済み comment の編集を拒否
- エラーメッセージ整理
- activity log 記録方針の整理

完了条件:

- remote tracked ticket の title は API 経由でも編集できない
- pushed comment は API 経由でも編集できない

### Phase 5: detail / edit UI の切り替え

目的:

- remote tracked ticket を通常 ticket とは異なる情報設計で表示する

タスク:

- title の read-only 表示切り替え
- remote summary row の追加
- `Local Body / Remote Body` tab 追加
- detail mode と edit mode の両方で tab を扱えるようにする
- remote body の read-only 表示
- local body 編集導線の整理

完了条件:

- 通常 ticket はほぼ現状維持
- remote tracked ticket だけ title read-only と body tabs が有効になる

### Phase 6: comment push UI

目的:

- comment ごとの remote push 状態を UI で扱えるようにする

タスク:

- comment item に status 表示追加
- `Push to remote` / `Pushed` / `Retry` 表示追加
- push 実行中と失敗時の UI 整理
- pushed comment の編集不可 UI を反映

完了条件:

- remote tracked ticket 上で comment push の一連の動作が完結する

### Phase 7: import UI

目的:

- board 本体を汚さずに remote issue を取り込めるようにする

タスク:

- `Import Remote Issue` dialog 追加
- provider 選択
- issue URL 指定または一覧選択
- 取り込み先 lane 選択
- 既 import issue の disabled 表示
- `Already imported to <board name>` の表示

完了条件:

- remote issue を board に取り込める
- 重複 import を UI で抑止できる

### Phase 8: OpenAPI / docs / tests

目的:

- 既存利用者と実装者の認識差分を減らす

タスク:

- OpenAPI に `remote` / `sync` と新規 endpoint を追加
- `docs/ja/ai-api-guide.md` の remote tracked ticket 意味論を更新
- API examples 追加
- migration test 追加
- read model test 追加
- route test 追加
- UI / E2E test 追加

重点 test:

- local-only ticket の既存挙動が変わらない
- remote tracked ticket の title update 拒否
- pushed comment edit 拒否
- summary が軽量 `remote` のみ返す
- export/import に remote metadata が混ざらない

### Phase 9: credential resolver

目的:

- provider adapter が認証情報の保存場所を直接知らないようにする
- provider が増えても `GITHUB_TOKEN`, `REDMINE_TOKEN`, `JIRA_TOKEN` のような env 増殖に依存しない
- browser storage に token を置かず、server 側で credential を解決する

方針:

- ticket の remote link には `provider` と `instanceUrl` だけを保存する
- token などの秘密情報は ticket / board / export に保存しない
- adapter は `RemoteCredentialResolver` に `provider + instanceUrl` を渡して credential を取得する
- MVP の resolver は env を読む
- 将来の resolver は OS keychain、server-side encrypted store、OAuth / Device Flow へ差し替える

MVP env:

```json
{
  "github:https://github.com": {
    "type": "token",
    "token": "..."
  },
  "redmine:https://redmine.example.com": {
    "type": "token",
    "token": "..."
  },
  "jira:*": {
    "type": "token",
    "token": "..."
  }
}
```

- env 名は `KANBALONE_REMOTE_CREDENTIALS`
- key は `provider:instanceUrl`
- `provider:*` を fallback として許可する
- 既存互換として `GITHUB_TOKEN` は `https://github.com` 専用 fallback として残す
- GitHub Enterprise など `https://github.com` 以外の instance は token 漏えいを避けるため `KANBALONE_REMOTE_CREDENTIALS` で明示設定する

非方針:

- `localStorage` に token を保存しない
- ticket body / comment / remote metadata に token を混ぜない
- adapter ごとに独自 env を直接読む実装を増やさない

完了条件:

- GitHub adapter が `RemoteCredentialResolver` 経由で token を取得する
- `GITHUB_TOKEN` の既存起動方法は引き続き使える
- 複数 provider 向けの JSON env を利用できる
- resolver の unit test がある

## 実装単位の切り方

PR を分けるなら、次の単位が扱いやすい想定です。

### PR 1: DB と read model

- migration
- types
- loaders / mappers / serializers
- schema の追加 field

### PR 2: remote API 基盤

- remote import
- remote refresh
- comment push
- adapter interface
- mutation 制約

### PR 3: detail / edit UI

- remote summary
- body tabs
- title read-only

### PR 4: comment push UI と import UI

- comment status / push action
- import dialog

### PR 5: docs / OpenAPI / tests

- docs 更新
- OpenAPI 更新
- examples
- tests

## 最初の着手候補

最初に着手するなら、次のセットが最も安全です。

- `ticket_remote_links` / `comment_remote_sync` migration
- `TicketView.remote` / `CommentView.sync` の read model 拡張
- local-only ticket に影響がないことを確認する test

ここまで終わると、その後の API / UI 実装がかなり素直になります。

## 現時点の暫定 MVP イメージ

- GitHub Issues などの remote issue を 1 件または複数件 import できる
- import された issue は Kanbalone の通常 ticket として 1 board に所属する
- 取り込み済み issue は別 board へ重複 import できない
- ticket は remote issue への参照情報を持つ
- title は remote から import し、read-only で表示する
- body は `local body` と `remote body` の 2 面を持つ
- initial import 時は remote body を local body の初期値としてコピーする
- 以後、local body は A2O/A-AI 向けの実装本文として編集できる
- remote body は read-only snapshot として refresh で更新できる
- local では comment を追記できる
- 必要な comment だけを remote に push できる
- remote 側の title/body 更新は manual refresh で再取得できる

## このメモの位置付け

この文書は、仕様策定前の設計メモです。
今後はこの内容をもとに、必要に応じて次のいずれかへ分解していく想定です。

- 製品仕様
- API 仕様
- DB スキーマ案
- UI フロー案
- adapter 実装方針
