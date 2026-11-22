# Group 技術設計

状態: 合意仕様に基づくGroupのDB・API・UI実装を反映。利用者向け仕様は [group-plan.md](group-plan.md) を参照。本書の更新はリリースや稼働データの移行完了を意味しない。

## 1. 既存仕様と実装の境界

- SQLite / better-sqlite3。起動時のmigrationはトランザクション内で実行する（`src/db.ts`, `src/db-modules/migration.ts`）。
- 親子は2階層。子を親にできず、子を持つチケットを子にできない（`ticket-writes.ts`）。今回も階層を増やさない。
- チケット編集は、従来の本体保存と子の追加・解除の複数HTTPリクエストを、一括PATCHへ変更した（`public/app-ticket-actions.js`）。
- HTTPのボード間移動は専用move/bulk-move。内部updateTicketもboardId入力を持つため共通の不変条件の対象にする（現行HTTP PATCHはboardIdを受け渡さない）。既存の移動は親子関係を解除する。一括で親子双方を移しても現行の関係解除を維持する。
- List既定は優先度降順、同順位はID昇順で親子をまとめる。ID/タグ/優先度の明示ソート時は平坦表示（`public/app-board-list.js`）。
- JSONインポートは新規ボードを作りIDを再採番する。親子を後から直接SQLで復元する（`board-transfer.ts`）。
- 既存の活動履歴はticket単位。Group単体の変更は別テーブルと取得APIを追加した。

## 2. データモデル

### groups（新規）

| 列 | 定義 |
| --- | --- |
| id | INTEGER PRIMARY KEY AUTOINCREMENT。削除後もIDを再利用しない |
| board_id | NOT NULL、boardsへの外部キー、ボード削除時CASCADE |
| name | NOT NULL、前後空白除去・NFC正規化後1〜100文字 |
| description_markdown | NOT NULL DEFAULT ''、上限100,000文字 |
| revision | NOT NULL DEFAULT 1、改名・説明変更時に増加 |
| created_at / updated_at | 既存のUTC日時形式 |

`UNIQUE(board_id, name)`。同名判定は正規化後の完全一致（大小文字・全半角の同一視はしない）。inactiveも対象。文字数はUnicodeコードポイント数で数える。
`active`や所属件数は保存しない。`total=COUNT(*)`、`open=COUNT(is_archived=0 AND is_resolved=0)`、`isActive=(total=0 OR open>0)`を算出する。完了は既存のレーン由来の投影列を参照する。

### ticketsへの追加

- `group_id INTEGER NULL REFERENCES groups(id) ON DELETE RESTRICT`。
- `INDEX tickets_group_idx(group_id)`。必要なら計測後にgroup_id/archived/resolvedの複合インデックスを検討する。
- 同一ボード制約はINSERT/UPDATE triggerでチェックし、不一致を拒否する。Groupのboard_id変更は禁止する。
- 親子のgroup一致は共通mutationサービスが最終グラフに対して検証し、同一transactionで更新する。行単位triggerで親子一致まで強制すると、複数行更新途中の一時的不一致を拒否するため採用しない。
- Group削除はtransaction内で全所属（アーカイブ含む）0件を再確認。ボード削除はticketsを先に消しgroupsを後に消す順序を明示し、CASCADEとRESTRICTの順序依存を避ける。

### 表示モデル

TicketView/TicketSummaryView/TicketRelationViewへ `groupId: number|null` と `group: {id,name}|null` を追加。独立したチケット詳細からinactiveのGroupも開けるよう、active一覧から名前を逆引きしない。
Group詳細は `descriptionMarkdown`, サニタイズ済み `descriptionHtml`, `revision`, 日時を返す。一覧は説明全文・HTMLを省き、id/boardId/name/isActive/totalTicketCount/openTicketCount/resolvedTicketCount/archivedTicketCount/revision/日時を返す。`resolvedTicketCount` はアーカイブ済みの完了チケットも含む。

## 3. API

Fastify route schema・serializer・OpenAPIへ反映した。レスポンスschemaにGroup関連フィールドを定義し、シリアライズ時の欠落を防ぐ。

| Method / path | 内容 |
| --- | --- |
| GET /api/boards/:boardId/groups | `status=active\|inactive\|all`（既定active）、`sort=createdAt\|name`、`order=asc\|desc`。既定createdAt/asc。`{groups:[...]}` |
| POST /api/boards/:boardId/groups | `{name,descriptionMarkdown?}` → 201 Group詳細 |
| POST /api/markdown/preview | `{bodyMarkdown}` → `{bodyHtml}`。サニタイズ済みMarkdownプレビュー、上限100,000文字 |
| GET /api/boards/:boardId/group-activity | 任意の `groupId` フィルター → `{activity:[...]}`。削除済みGroupの履歴も取得可 |
| GET /api/groups/:groupId | inactiveも取得可 → 200 Group詳細、ETag: "revision" |
| PATCH /api/groups/:groupId | `{name?,descriptionMarkdown?,expectedRevision}` → 200 Group詳細。省略は保持、説明空文字は消去 |
| DELETE /api/groups/:groupId | `If-Match: "revision"` 必須。0件を再確認 → 204。非空は409 |
| GET /api/boards/:boardId/tickets | `groupId=<id>` または `ungrouped=true` を追加。併用不可。他の既存APIフィルターは利用可 |
| POST /api/boards/:boardId/group-memberships/preview | `{ticketIds:[...],groupId:id\|null}` → 対象全件とexpectedToken。読み取りのみ |
| PUT /api/boards/:boardId/group-memberships | 上記 + `expectedToken` → `{changedTickets:[...],affectedGroups:[...]}`。全件成功か全件不変更 |
| POST /api/boards/:boardId/tickets | 既存の作成bodyにgroupId/groupResolution/expectedTokenを追加。作成と所属を同時commit |
| POST /api/boards/:boardId/tickets/preview | 作成bodyで親指定による所属変更・競合を試算。新規ticketは `id:0, clientRef:"new"` で表す |
| POST /api/tickets/:ticketId/change-preview | 次項の編集body（expectedToken除く）で最終親子・Group変更を試算 |
| PATCH /api/tickets/:ticketId | 既存bodyを拡張し、親子関係と本文等を1transactionで保存 |

Group一覧の同順位はid昇順で安定化する。名前順はAPI側で正規化済み文字列のバイナリ順とする。UI/APIで別ソートをしない。
Group指定だけではアーカイブを自動包含しない。全所属を取得する際は `groupId=...&archived=all` を使う。`archived=false`（既定）は未アーカイブのみ、`archived=true` はアーカイブ済みのみ。既存の `includeArchived` 別名に依存せず、Group画面・追加検索とも `archived=all` を明示する。画面で表示だけ折りたたみ、親行の補完のために全ボードを取得しない。追加検索は未所属のアーカイブ済みも候補に含め、状態を表示する。

### previewレスポンス例（Group衝突）

```json
{
  "expectedToken": "opaque-snapshot-token",
  "requiresResolution": true,
  "changedTicketIds": [101, 102, 303],
  "targetGroupId": null,
  "parentChanges": [{"ticketId": 303, "fromParentTicketId": null, "toParentTicketId": 101}],
  "candidates": [
    {"group": {"id": 7, "name": "初回ガイドの改善"}, "changedTicketIds": [303]},
    {"group": {"id": 8, "name": "ヘルプの整備"}, "changedTicketIds": [101, 102]}
  ],
  "tickets": [
    {"id": 101, "title": "初回の案内を整える", "boardId": 1, "parentTicketId": null, "groupId": 7, "isArchived": false},
    {"id": 102, "title": "案内文の調査メモ", "boardId": 1, "parentTicketId": 101, "groupId": 7, "isArchived": true},
    {"id": 303, "title": "ヘルプのリンクを追加する", "boardId": 1, "parentTicketId": null, "groupId": 8, "isArchived": false}
  ]
}
```

previewの成功は200（候補提示であり書き込み失敗ではない）。PATCHを解決指定なしで実行して衝突した場合は409で同じpreviewをdetailsに含める。全previewは `tickets` / `expectedToken` / `changedTicketIds` / `targetGroupId` を返す。未解決の衝突では `targetGroupId:null` なので、各候補の変更対象は `candidates[].changedTicketIds` を参照する。返すticketsは確認対象の全件で、archived表示設定によって欠落させない。

### 所属変更の規則

選んだticketIdsを、アーカイブ済みを含む親子全体へ拡張し重複排除する。Groupは同じボード内のみ。追加は未所属→指定Groupのみ、同じGroupへ追加はno-op。他Group所属が混在したら `GROUP_ALREADY_ASSIGNED` 409で全体を拒否する。初版の「解除→追加」をAPIでも守る。
commitの返却値は `{changedTickets:[TicketSummaryView...],affectedGroups:[GroupView...]}`。ID配列ではなく変更されたチケットの要約を返し、同一Groupへの追加など変更がない場合は `changedTickets:[]` となる。
解除は親子全体をnullにする。UIでは親行から操作するが、APIでは子IDからも同じ全体を対象にする。空配列・重複入力ID・存在しないID・別ボードIDは黙って無視しない。配列最大100件（選択数に対する上限。親子展開後の件数には適用しない）。
previewはUI確認が必要かと独立する。検索追加は選択チップと件数表示の後、追加ボタンで確定する。別の確認ダイアログは増やさない。

### チケット作成

- groupId未指定、親なし: 未所属。Groupから新規作成するときだけ明示的にgroupIdを送る。
- 親を指定: 既存と同じ親子検証を行い、親側Groupを継承する。
- 明示Groupと未所属の親: 親および既存の子も明示Groupに揃える。追加確認なし。作成・既存親子の所属更新を同じtransactionで保存する。
- 明示Groupと親のGroupが同じ: そのGroupで作成。追加確認なし。
- 明示Groupと親のGroupが異なる: 既存チケットの親子編集と同じ候補選択を表示し、解決指定とexpectedTokenがなければ409。親側に揃えた場合、Group画面から開始した新規ticketはその別Groupに所属するので、作成後は所属先Groupを開く。
- groupId:nullは未所属側として扱い、所属済みの親があれば継承する。nullを指定して親だけ別Groupに残すことはできない。
- 新規作成previewは新ticketを `id:0, clientRef:"new"` で識別し、まだDBへINSERTしない。commit時にIDを採番する。Group/parent指定のない従来の作成はpreview不要。
- 上記の「作成にも同じルール」は利用者合意済み。

## 4. 親子編集の一括保存と競合

### PATCHへの追加フィールド

```json
{
  "title": "初回の案内を整える",
  "childTicketIds": [102, 303],
  "expectedEditToken": "token-from-ticket-detail",
  "expectedSelectedParents": [{"ticketId": 303, "parentTicketId": null}],
  "groupResolution": {"groupId": 7},
  "expectedToken": "opaque-snapshot-token"
}
```

`childTicketIds`は編集対象を親とする子の最終集合。省略は維持、[]は全解除。`parentTicketId`は従来どおり。両方指定する場合は最終状態で2階層制約を満たす必要がある。例: 既存の子をすべて解除し親自身を他の子にする変更は同一transactionで許可。重複ID/循環/別ボード/子を持つ子などは400。

`childTicketIds`を送る新規契約では `expectedEditToken` を必須とする。GET ticket詳細に返すeditTokenは、編集開始時の本体編集可能値（title/body/lane/archive/priority）、tag/blocker/relatedのID集合、parentTicketIdと完全なchildTicketIds（アーカイブ済みも含む）を正規化してダイジェスト化する。preview時とcommit時に現在値から再計算して不一致なら409 `STALE_TICKET_EDIT`。これにより、編集中に追加された子の意図しない解除と、本文などの古い編集値による上書きを防ぐ。preview直前にtokenを読み直して置き換えてはならない。
後から選択した追加対象については `expectedSelectedParents` を、編集開始時集合との差分で新規追加する全IDに必須とする。欠落・重複・余分なIDは400。選択時のparentTicketIdも照合し、他の親への移動を黙って取り消さない。新UIはparentTicketIdのみの編集でもこれらの事前条件を送る。旧APIのparentTicketId単独要求には新たな必須条件を加えず、commit時点のGroup規則を適用する。旧clientの本文更新の編集開始時競合は従来どおりlast-write-winsであり、本改修で全clientへ一律に変更しない。

処理順序は「要求を読み取る→最終の親子グラフを仮計算→Group整合性を解決→確認snapshot検証→全更新→履歴→commit」。解除されたチケットは元のGroupを保持する。別の親への付け替えでは、元の親・兄弟は元のGroupを保持し、新たに接続される側だけを統合する。

- 最終的につながるチケットのGroupが0種類: 未所属。
- nullを除いて1種類: そのGroupへ揃える。追加確認なし。
- 2種類以上: 解決指定がなければ409 `GROUP_CONFLICT`。候補Groupと、候補ごとに所属が変わる全チケットを返す。
- `groupResolution.groupId`はその接続集合に実在する候補のみ許可。任意の第三Groupへの付け替えは不可。
- 異なるGroupの解決はexpectedToken必須。既存clientのparentTicketId PATCHは、非競合の場合は引き続き動作する。Group衝突時は既存の成功を装わず409にする。
- 新UIは親子編集のある保存で常にpreviewを呼び、非競合ならUIを増やさずcommit、衝突時だけ選択UIを表示する。従来の本体PATCH後に子を個別PATCHする処理は廃止した。
- 同じGroup同士・未所属との親子化では確認を出さないという合意と、通信上のpreviewは区別する。

### snapshotと書き込みの境界

expectedTokenは、操作種類・正規化した要求と、影響する親子集合の現時点snapshotから生成した不透明なダイジェスト。認証トークンではなく事前条件。要求のハッシュ対象からexpectedTokenとgroupResolutionを除外し、解決候補一覧そのものをsnapshotに含める。commit時のgroupResolutionはその候補一覧に含まれることを再検証する。本文・タイトル・親子変更セット等はハッシュ対象に含め、別操作へのtoken流用を拒否する。

snapshotには、接続元・先の全親子のid/boardId/parentTicketId/groupId/title/isArchived/updatedAtと、関連するGroupのid/name/revisionを含める。選択したチケットだけのupdatedAtでは、新しい兄弟の追加を検出できない。transaction内で対象集合を再計算し照合する。Group解決候補の選択はpreviewで列挙した候補に限定し、同じsnapshotで確定可能とする。

読み取りpreviewは一貫したread transaction、commitは `sqlite.transaction(...).immediate()`。snapshotの不一致は409 `STALE_GROUP_CONTEXT` と再計算したpreviewを返す。ただし対象の削除・別ボードへの移動・別Groupへの所属などにより要求自体が不正になった場合は、snapshot照合に先立つ検証のエラーを返すことがある。UIは勝手に再送せず変更内容を再表示する。既存の確認が不要だった操作で再preview結果も非競合なら、最新の対象を示す控えめなエラー表示から利用者が再保存する。無期限の自動再試行はしない。

Group編集はexpectedRevision、削除はrevisionと空判定で保護する。取得後に新たなチケットが所属した場合、削除は必ず409。

### エラーと互換性

新規Group APIおよびGroup対応のチケット操作は `{error,code,details?}` を返す拡張schemaを持つ。既存errorSchemaのadditionalProperties:falseを変更せず流用するとcodeが失われるため専用schemaを用意する。
400: 入力・親子制約違反、404: URLの対象不存在、409: 同名・非空・別Groupへの直接付け替え・Group衝突・古い確認。Group編集の `expectedRevision` 欠落はschema検証で400。削除の `If-Match`、所属変更commitの `expectedToken`、`childTicketIds` 編集の `expectedEditToken` 欠落は428。削除の `If-Match` は引用符付きの正の整数とし、不正形式は400、古いrevisionは409。
Group非対応クライアントの通常編集・完了・アーカイブ・移動APIの形は維持する。新しい制約に該当する失敗は明記する。APIで返すgroupId/groupは追加フィールドであり書き込み許可とは別。通常PATCHによる直接groupId変更は受け付けず、所属変更APIへ誘導する。

## 5. 全更新経路への適用

共通service（`src/db-modules/groups.ts`）を追加し、`ticket-mutations.ts`、`ticket-bulk-mutations.ts`、作成・importの検証から使用する。専用Group routesだけで整合性を守らない。

- 単一移動、一括移動、updateTicketのboard変更: 移動する行だけgroup_id=null、残る親子のgroup_idは保持。group_idの解除とboard変更を同一transaction内で行う。
- 同一ボードのレーン移動・並べ替え: 所属を保持。完了変化後のGroup件数を再取得。
- 親子解除・親の削除: 残る子は元Groupを保持。対象Groupの件数を再計算。
- remote import: 新規は未所属。remote refreshはローカルGroupを保持。remote由来の完了・archive変化がある経路でも件数を更新する。
- Group作成直後は0件active。全チケット削除/解除で0件になってもactiveに戻る。
- 画面更新eventはcommit後。単一・一括のボード間移動は元と先の両ボードへ配信。失敗時は履歴もeventも残さない。

## 6. 移行・JSON・バックアップ

- 起動時migrationでgroupsとnullable group_idを追加し、既存チケットは全件null。名称やタグからGroupを推測しない。
- migrationを一括transaction化。完了レーン移行の再実行やレーン変更はしない。
- JSONのルートに `groups:[{id,name,descriptionMarkdown,createdAt,updatedAt}]`、ticketにgroupIdを追加。active・件数・HTML・revisionは復元値に使わない。
- 現行JSONに形式versionがないため、Group対応exportには `formatVersion:2` を追加した。未指定でgroupsキーも各ticket.groupIdキーも存在しない場合だけ旧形式として受理し、全件未所属とする。versionなしでGroup関連キーを含む曖昧な入力は400。未知のversionは拒否。
- 新形式はGroup定義・ticket.groupIdを必須とし、欠損/未知Group/重複ID/同名/親子Group不一致を検証して400。自動でどちらかへ揃えたり、参照をnullへ落とさない。
- 新旧両形式でticket IDの正の安全な整数・一意性、親の存在、循環なし・2階層制約を検証する。新形式のGroup IDも正の安全な整数、groupIdはnullまたは定義済みIDに限る。GroupのcreatedAt/updatedAtは有効な日時を要求し、ISO形式で保持する。
- Group IDとticket IDをそれぞれ再採番・マッピングし、親子復元後に整合性検証して全体commit。失敗時は作りかけのボードも残さない。
- exportはTicketViewのrest spreadに追加したgroup表示オブジェクトが漏れないよう、group/bodyHtml等を明示的に除外し、所属参照はgroupIdのみとする。
- exportはinactiveとアーカイブ済みを含む全件。空のGroupも保持する。説明はMarkdown原文を保存する。
- SQLiteバックアップは既存の一貫した取得手順を踏襲。旧バージョンへのDB直起動ダウングレードは保証しない。旧実行ファイルはGroupを認識せず不変条件を崩すため、戻す場合は更新前バックアップを使う。
- 新exportを旧版へ取り込んだ際、追加フィールドが無視されGroupが失われる可能性をmigration guideに記載する。旧版が新形式versionを拒否できるとは仮定しない。

## 7. UIと履歴

- 表示の土台は合意済みモック。Markdownは既存のmarked+sanitize-htmlを再利用し、モックの簡易レンダラーを製品コードにコピーしない。
- 新規作成フォームは既存UIを再利用。優先度は現行1=low/2=medium/3=high/4=urgent。モックの「なし」は採用しない。初期レーンも既存の選択処理を再利用する。
- Group一覧の並び順はボード別に既存localStorage設定へ保存。既存Listの検索/タグフィルターはGroupへ適用しない。
- APIのGroup指定取得とUI表示制御は別。inactiveリンクはAllへ切り替えて対象を選択する。
- 所属変更は各対象ticketの活動履歴に旧/新Group ID・名前を記録する（操作IDは持たない）。
- Group自体のCRUDは `group_activity_logs`（board_id, subject_group_id, action, details_json, created_at）を追加した。削除済みGroupも履歴を残すためsubject_group_idは削除CASCADE対象にしない。現行の履歴取得APIはticket単位であり、Board activity APIは存在しない。新規 `GET /api/boards/:boardId/group-activity?groupId=...` で取得できる。削除後も同じIDで履歴を取得でき、GroupのID再利用はしない。履歴UIの新設は今回の必須範囲に含めない。既存ticket専用履歴のNOT NULL制約は変更しない。

## 8. レビューで見つかった追加論点（全項目合意済み）

1. **3種類以上のGroupが衝突する場合**: 候補Groupの数だけ選択肢を表示する。いずれか1つへ揃える＋キャンセルとし、各候補で所属が変わる件数・チケットを示す。
2. **明示ソート時の親子表示**: Groupでは親子構造を維持し、Listと同じ比較関数を親同士・子同士に適用する。Listの明示ソート時の平坦表示は採用しない。
3. **新規作成と親指定を同時に行う場合**: 通常の親子化と同じルールを適用する。未所属との組合せは自動統一し、異なるGroupだけ確認する。選択結果によって開始したGroupと所属先が異なる場合は、作成後に所属先を開く。

## 9. 実装と検証の対象

1. DB・migration・集計・Group CRUD。移行前後のチケット/レーン不変、同名、0件active、全完了/全archive、復元、非空削除と競合をテスト。
2. 所属変更と親子の一括編集。アーカイブ済みを含む対象展開、子ID指定、分離、別親への移動、3Group衝突、編集開始後の兄弟追加/子の付け替え、確認後の兄弟追加/Group改名、エラー時の全rollbackをテスト。
3. 単一/一括/内部updateTicket経由の移動、親削除、remote同期、import/exportと件数更新を検証。
4. Group UI・詳細リンク・作成・ソート・削除確認。既存editorの一括保存化を含むe2eを追加。キャンセルが本文/関係/所属を保存しないことを検証。
5. 日英docs、OpenAPI、AIガイド、API例、配布skill、migration guideを更新。`pnpm check`と関連e2eを実施。

DB・API・UI・関連ドキュメントへ実装済み。DB回帰テストは `test/groups-db.test.ts`、API回帰テストは `test/app-group-api.test.ts` に追加した。チェック全体とUI動作の最終結果は実行時の検証記録で確認する。稼働環境への反映・リリースは別の作業とする。

## 10. サブエージェントレビュー記録

以下は実装前の設計レビュー履歴。2026-11-21、データ整合性担当とAPI/UI契約担当の2名が、現行コードと合意仕様を照合した。初回指摘を反映し再レビューを実施した。

| 指摘 | 反映した内容 |
| --- | --- |
| 古い編集画面による子の解除・本文の上書き | 編集開始時editTokenをpreview/commitの両方で検証。選択後の追加対象の親も照合し、新規追加全IDの網羅性を要求 |
| preview後にGroup解決値を選ぶとtoken不一致になる | 編集要求とsnapshot・候補一覧を束縛し、解決値のみハッシュ対象外として候補内検証 |
| Group ID再利用により古い削除要求が新Groupへ適用される | AUTOINCREMENTでID再利用を禁止 |
| version欠落の新JSONが旧形式として扱われ所属を失う | versionなしでGroup関連キーを含む入力を拒否 |
| exportへ表示用groupオブジェクトが漏れる | groupを明示除去し、groupIdだけを参照に使う |
| 新規作成時だけ親子のGroup規則が異なる | 作成にも同じ規則を適用する推奨案へ修正し、利用者判断事項に明示 |
| 既存Board activity取得へ統合するという誤認 | 現行はticket履歴のみと訂正し、Group履歴の保存・取得を分離した提案に変更 |

データ担当は修正確認後に重大な追加指摘なし。契約担当は主要指摘の解消を確認し、追加した条件（AUTOINCREMENT、選択した追加対象の期待値の網羅性）も本文へ反映済み。
設計のレビューであり、実装テストの合格を意味しない。§8の追加論点は全項目合意済み。名前の比較・文字数上限などは、その後の実装で§2の値に確定した。

### 実装後のレビュー反映

- `appendMarkdown` はpreview/commitで同じ本文へ正規化し、確認tokenが食い違わないようにした。
- 新旧JSONのID・親子階層を検証し、Group日時を保持する。異常時はボード作成を含めてrollbackする。
- Group一覧は一括集計し、一覧では不要な説明HTMLを生成しない。親子・所属変更を伴わない通常編集でボード全体の親子計画を省略しても、指定された編集tokenは検証する。
