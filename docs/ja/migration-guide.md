# 完了状態のレーン移行ガイド

このガイドは、チケットごとの完了フラグを、所属レーンで決まる完了状態へ移行するための手順です。人間と、更新作業を依頼されたAIの両方を対象にしています。

**対象リリースは v0.10.0 です。** v0.9.x以前の既存DBをv0.10.0へ更新する際に適用します。公式のv0.10.0タグ／イメージ、または同じ移行処理を含むことを確認したビルドを使用してください。以下のコマンドは例であり、このガイドを読んだだけで更新を実行するものではありません。

## 1. 何が変わるか

| 項目 | 更新前 | 更新後 |
| --- | --- | --- |
| 完了状態の判定元 | チケットの `isResolved` | レーンの `isCompletionLane` |
| 完了にする操作 | チケットの完了フラグを変更 | 完了レーンへ移動 |
| 未完了に戻す操作 | チケットの完了フラグを解除 | 通常レーンへ移動 |
| アーカイブ | 完了とは独立 | 引き続き独立。アーカイブ・復元では完了を変えない |
| レーン名 | 完了フラグとは独立 | 名前では判定しない。Doneという名前でも通常レーンになり得る |

DBでは `lanes.is_completion_lane` が判定元になります。`tickets.is_resolved` 列は削除せず、検索用の派生値としてDBトリガーでレーンと同期します。チケットの列を直接更新する運用はやめてください。APIレスポンスの `isResolved` と互換名 `isCompleted` は維持します。

## 2. 初回起動時の自動移行

移行処理は新アプリが既存DBを初めて開く際に実行されます。別の移行コマンドやボードの再インポートは不要です。

1. 既存レーンをすべて通常レーン（`isCompletionLane: false`）にします。Done、完了などの名前も特別扱いしません。
2. 完了済みチケットがあるボードごとに、末尾へ `Completed (migration)` という完了レーンを新規作成します。同名があれば `Completed (migration) 2`、`3`…と重複を避けます。既存レーンを流用しません。
3. 旧完了フラグがtrueのチケットだけを、同じボードの新規レーンへ移します。アーカイブ済みの完了チケットも対象です。
4. 未完了チケットは元のレーンに残します。完了済みが0件のボードには、新規レーンを作りません。
5. 移動したチケットの履歴に、移行であること・元のレーンIDと位置・移動先を記録します。

### 移行前後の例

| 移行前のチケット | 移行後の配置 | 移行後の状態 |
| --- | --- | --- |
| Doneにあるが未完了 | 元のDone | 未完了 |
| Reviewにあり完了済み | 新しいCompleted (migration) | 完了 |
| Doneにあり完了済み・アーカイブ済み | 新しいCompleted (migration) | 完了・アーカイブ済み |
| Todoにあり未完了・アーカイブ済み | 元のTodo | 未完了・アーカイブ済み |

完了／未完了を推測し直す移行ではありません。旧フラグを維持するため、チケットの内容を個別に判断する必要はありません。親子のチケットはそれぞれの旧フラグに従って配置されますが、親子関係そのものは保持します。

### 保持されるものと変更されるもの

- 保持：チケットID・ボード所属・完了状態・アーカイブ状態・親子関係・本文・コメント・タグ・依存／関連・外部参照。
- 保持：既存レーンのID・名前・順序。未完了チケットのレーン所属と、残るチケット同士の相対順。
- 変更：完了済みチケットのレーンID・位置・更新日時。移動元の残りの位置は詰め直されます。対象ボードの更新日時と履歴も更新されます。
- 新しいレーン内の順序：アーカイブ状態、元レーン順、元レーンID、元チケット位置、チケットIDの順。アーカイブ済みは後ろです。

スキーマ変更・移動・履歴は1トランザクションで適用し、失敗時は全体をロールバックします。`lanes.is_completion_lane` 列が存在すれば、このデータ移動は再実行しません。再起動しても専用レーンは増えません。移行をやり直す目的で列やトリガーを手動削除しないでください。

## 3. AIへ渡す作業契約

更新作業を依頼する際は、次を指定してください。認証情報を回答・ログへ出力する必要はありません。

| 必要な入力 | 確認内容 |
| --- | --- |
| 対象インスタンス | APIのベースURL。ポートを決め打ちしない |
| 実行環境 | Docker／Compose／直接起動、サービス名、起動方法 |
| 保存先 | 実際のSQLiteパス、永続ボリューム／bind mount。旧構成ではsoloboard.sqlite等の場合もある |
| 更新元・更新先 | 復元可能な旧イメージ／ソースと、移行処理を含む新イメージ／ソースの識別子 |
| バックアップ | 保存先、空き容量、DBを復元できる方法 |
| 作業範囲 | 更新対象、停止時間、移行後の運用変更を含むかどうか |

**実行原則：**

- 未確定のインスタンス・DB・更新先を推測して変更しない。情報が不足した箇所を確認する。
- 移行中は人間の操作、AIクライアント、自動処理を含む書き込みを止める。旧版と新版を同じDBに同時接続しない。
- 完了状態の再判定、Doneの完了レーン化、チケットの移動／削除／再インポートを、自動移行に追加しない。
- 移行済みなら検証を行い、再移行のためにDBを加工しない。
- バックアップに失敗したら更新を開始しない。起動・整合性・移行前後の照合に失敗したら通常利用を再開しない。失敗内容と復旧案を報告する。
- ガイドのサンプル値を実データの値として使用しない。件数・IDは対象環境から取得する。

## 4. 更新前の準備とバックアップ

1. `GET /api/health`、`GET /api/meta`、`GET /api/boards` で対象を確認します。
2. 書き込みを止めた状態で、各ボードのレーン一覧と `GET /api/boards/:boardId/tickets?archived=all` を保存します。検索・レーン・完了状態などの絞り込みを付けず、全件を取得します。
3. チケットごとのID、boardId、laneId、isResolved（旧APIならisCompleted）、isArchived、parentTicketIdと、既存レーンのID・名前・順序を移行前の基準にします。完了済みのあるボード数も数えます。
4. アプリとすべてのDB書き込み元を停止し、DB全体をバックアップします。旧イメージの識別子と起動設定も保存します。設定ファイルには秘密情報があり得るため、公開しないでください。
5. バックアップを実際に開けることと `PRAGMA integrity_check` が `ok` であることを確認します。可能なら、コピーを隔離した新環境で先に移行して検証します。

SQLiteがWALモードの場合、稼働中の `.sqlite` ファイルだけをコピーしてはいけません。停止後に同じディレクトリのDB・`-wal`・`-shm`を一組として保存するか、SQLiteの整合性の取れたbackup APIを使用します。ボードのJSON ExportはDBバックアップの代わりにはなりません。Importは別ボードを作り、IDの維持や外部連携の完全復元を保証しません。

旧イメージは識別子を記録するだけでなく、ダイジェストで再取得できること、またはローカルに保持されていることを確認します。必要なら更新前に `docker image save` で保存し、復旧確認まで旧イメージを削除しないでください。

### Dockerで停止して保存する例

以下は、確認済みのコンテナで、DBが `/app/data` 配下にある場合だけ使う例です。名前・ホスト側の保存先は必ず置き換えてください。Composeの場合も対象プロジェクトとサービスを確認し、`down -v` は使いません。

```bash
MIGRATION_CONTAINER='replace-with-your-container'
MIGRATION_BACKUP='/absolute/private/path/to/new-backup-directory'
umask 077
(
set -eu
mkdir -m 700 "$MIGRATION_BACKUP"
docker inspect --format '{{.Config.Image}} {{.Image}}' "$MIGRATION_CONTAINER" > "$MIGRATION_BACKUP/image.txt"
docker stop "$MIGRATION_CONTAINER"
docker cp "$MIGRATION_CONTAINER:/app/data" "$MIGRATION_BACKUP/data"
)
```

`mkdir`を含む各コマンドが成功したことを確認してから次へ進みます。バックアップは元DBと同じボリュームだけに置かないでください。DBパスが別の場所なら、その保存先を対象にします。bind mountや直接起動でも、停止・DBとWALの整合性・秘密情報の保護は同じです。

コピー済みDBを検査し、復元しやすい単体バックアップへまとめる例です。Python 3があるホストで実行します。`kanbalone.sqlite` は実際のファイル名に置き換えてください。

```bash
python3 - "$MIGRATION_BACKUP/data/kanbalone.sqlite" "$MIGRATION_BACKUP/before.sqlite" <<'PY'
import sqlite3, sys
from pathlib import Path
source, target = map(Path, sys.argv[1:])
if not source.is_file() or target.exists():
    raise SystemExit("Source missing or destination already exists")
with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as src:
    if src.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise SystemExit("Source integrity check failed")
    with sqlite3.connect(target) as dst:
        src.backup(dst)
        if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("Backup integrity check failed")
target.chmod(0o600)
print("Backup verified")
PY
```

停止後のバックアップを正本とします。API取得後から停止までに書き込みがあった場合、先のAPIスナップショットは比較基準として使わず、停止時DBから基準を取り直します。

## 5. 新版を起動する

1. 更新先がこの移行を含むこと、永続ボリュームとDBパスが旧版と同じであることを確認します。まず新しい実行物を用意してから停止時間に入ると短縮できます。
2. 旧プロセスを止めたまま、確認済みのイメージ／ソースへ切り替え、新版だけを起動します。空の別DBを参照した状態を移行成功とみなさないでください。
3. 起動ログと `GET /api/health` を確認します。起動失敗時は通常利用を再開せず、ディスク不足・権限・起動設定などを調べます。
4. 次の照合が終わるまで、人間・AI・外部自動処理の書き込みは再開しません。

## 6. 移行後の必須チェック

同じインスタンスから、再び全レーンと `tickets?archived=all` を取得します。必要に応じて `GET /api/tickets/:ticketId` で本文や関係を照合します。DBの検査は停止中DBまたは整合性の取れたコピーで行います。

| チェック | 合格条件 |
| --- | --- |
| 全件保持 | チケットID集合と件数、ボード所属が移行前と一致 |
| 状態保持 | 各チケットの完了・アーカイブ状態が移行前と一致 |
| 未完了の所属 | 未完了チケットのlaneIdが変わっていない |
| 完了済みの所属 | 完了済みは同じボードの新規完了レーンへ移動。既存レーンを流用していない |
| レーン | 既存レーンのID・名前・順序を維持し、すべて通常レーン。追加数は「完了済みがあるボード数」と一致 |
| 関連データ | 親子・コメント・タグ・依存／関連・外部参照が保持されている |
| 新しい判定 | 全チケットのisResolvedが所属レーンのisCompletionLaneと一致 |
| 履歴 | 移動したチケットに元レーンID・位置を含む移行履歴がある |
| DB整合性 | `PRAGMA integrity_check` が `ok`、`PRAGMA foreign_key_check` が0行 |
| 再起動 | 再起動後もチケット状態とレーン数が変わらず、移行レーンが増えない |

これらは**初回移行直後、利用再開前**の条件です。すでに移行済みで運用変更も行ったDBに対して「既存レーンはすべて通常」などを再適用しません。すでに移行済みの場合、初回移行はスキップされたと報告し、利用再開前後の状態が意図せず変わっていないことを確認します。

完了済みが移行先へまとまるため、見た目の配置が変わるのは正常です。完了・アーカイブは通常一覧のフィルターで隠れる場合があります。見えないだけで消失と判断せず、必ずアーカイブ込みで確認してください。

## 7. APIクライアントとAIスキルの更新

- 読み取りの `isResolved`／`isCompleted` と `resolved`／`completed` フィルターは維持します。
- 完了・再開はレーン移動で行います。移動先は `isCompletionLane` で判断し、名前から推測しません。
- `isResolved`／`isCompleted` の書き込みは互換用の一致確認です。両者の矛盾、または移動先レーンの状態との矛盾は無変更で409になります。新しいリクエストでは省略してください。
- 旧 `bulk-complete` は独立した完了変更には使えません。既にレーンと一致する値のみ受理し、不一致は409です。`bulk-transition` などのレーン移動へ置き換えます。
- レーンの完了属性を変更すると、そのレーンの全チケット（アーカイブ済みを含む）が変わります。1件を完了させる代わりにレーン属性を変更しないでください。
- ボード全体の設定変更には `PUT /api/boards/:boardId/completion-lanes` を使用します。全選択と期待値を送り、409時は再取得・再確認します。個別PATCHで検査を回避しません。
- 配布された `kanbalone-api` スキル、参照資料、ヘルパーを一緒に更新します。新APIはPUTを使うため、旧ヘルパーでは実行できない場合があります。リポジトリの更新だけでは、各AI環境にインストール済みのスキルは更新されません。

### API仕様の変更前／変更後

**完了フラグを指定して状態を変更する仕様は廃止します。完了・再開は移動先レーンで指定します。** ただし現バージョンでは、互換性のためリクエストの `isResolved`／`isCompleted` 自体は受理します。これは一致確認に限られ、独立した状態変更には使えません。レスポンスから削除されるわけでもありません。

| 操作・項目 | 変更前 | 変更後・クライアントの修正 |
| --- | --- | --- |
| チケット作成 `POST /api/boards/:boardId/tickets` | レーンと完了フラグを別々に指定 | `laneId` で配置先を指定し、完了フラグは送らない |
| 更新 `PATCH /api/tickets/:ticketId` | `isResolved: true/false` で完了・再開 | 完了／通常レーンの `laneId` を指定する。省略時は現在のレーンの状態を使う |
| 移動 `PATCH /api/tickets/:ticketId/transition` | `laneName` と完了フラグを指定できる | `laneName` のみ指定。移動先が完了レーンなら完了、通常レーンなら未完了 |
| 一括完了 `POST /api/boards/:boardId/tickets/bulk-complete` | フラグで複数件を完了・再開 | 非推奨。`bulk-transition` などのレーン移動に置き換える |
| 一括移動 `POST /api/boards/:boardId/tickets/bulk-transition` | `ticketIds`・`laneName`・完了フラグを指定できる | `ticketIds` と `laneName` を送り、完了フラグは送らない |
| レーン取得 `GET /api/boards/:boardId/lanes` | 完了属性なし | `isCompletionLane` を参照して移動先を選ぶ。レーン名では判定しない |
| 読み取り・絞り込み | 完了フラグとフィルター | `isResolved`／`isCompleted` と `resolved`／`completed` は維持。値はレーンから決まる |
| アーカイブ | `isArchived` で表示対象から退避 | 変更なし。完了とは独立し、アーカイブしても完了にはならない |

### リクエストの書き換え例

以下はAPIパスとJSONボディの対応例です。実行前にレーン一覧を取得してください。例ではボード1のレーン12が `isCompletionLane: true`、レーン11が `false` であることを確認済みとします。ID・名前は例であり、実環境の値に置き換えます。自動移行後も、既存の `Done` が完了レーンになるとは限りません。

**1件を完了／再開する場合** — 同じ `PATCH /api/tickets/123` のボディを変更します。

| 目的 | 旧リクエスト | 新リクエスト |
| --- | --- | --- |
| 完了 | `{"isResolved":true}` | `{"laneId":12}` |
| 再開 | `{"isResolved":false}` | `{"laneId":11}` |
| 完了済みとして作成（`POST /api/boards/1/tickets`） | `{"title":"作業","laneId":11,"isResolved":true}` | `{"title":"作業","laneId":12}` |

**複数件を完了する場合** — エンドポイントとボディの両方を変更します。ここでは一覧で確認した完了レーン12の名前が `Completed (migration)` であるとします。

変更前（`POST /api/boards/1/tickets/bulk-complete`）:

```json
{"ticketIds":[123,124],"isResolved":true}
```

変更後（`POST /api/boards/1/tickets/bulk-transition`）:

```json
{"ticketIds":[123,124],"laneName":"Completed (migration)"}
```

再開は、同じ `bulk-transition` で確認済みの通常レーン名を指定します。移動は配置も変えるので、複数の候補がある場合は運用上の移動先を決めてから送信します。

### 旧クライアントで発生する409

- 通常レーンのチケットへ `{"isResolved":true}` だけを送ると409です。自動で完了レーンを選んで移動することはありません。
- `{"laneId":12,"isResolved":false}` のように移動先と矛盾する指定も409です。フラグを無視して移動することはありません。
- `isResolved` と `isCompleted` の値が違う場合も409です。
- 一致する旧フラグは受理しますが、新規実装では送らないでください。`bulk-complete` も全対象が既に指定状態の場合だけ受理し、1件でも不一致なら全体を無変更で失敗させます。

409時は現在のレーンと属性を読み直し、意図した移動先を確認して、フラグを含めない移動リクエストに修正します。同じフラグの再送やDB直接更新では解決しません。

詳細と例は [AI APIガイド](./ai-api-guide.md) と [API例](./api-examples.md) を参照してください。DB列の直接操作や `isResolved: true` の強制再試行で409を解消しようとしないでください。

## 8. 移行後のレーン整理は別の操作

自動作成されたレーンはそのまま利用でき、必要なら名前を変更できます。名前変更だけでは完了状態は変わりません。設定はサイドバーの歯車領域で現在値を確認し、Changeから一覧で選択します。保存前に既存チケットへの影響を確認します。

- 古いDoneに未完了が残っている場合、そのDoneを完了扱いにすると全件が完了になります。自動移行の続きとして勝手に実行しないでください。
- 受入待ちにAcceptanceを使うなら通常レーンにします。AIの実装終了と人間の受入完了を分けられます。
- 移行済みチケットを元の通常レーンへ戻すと未完了になります。配置だけ戻すつもりで移動しないでください。
- 完了レーンの解除は全所属チケットを未完了に戻します。アーカイブ済みも対象です。

旧JSON Exportを新版へImportすると、完了属性を持たない旧形式について同じフラグ保持ルールを適用します。ただしImportは新規ボード作成であり、DBのインプレース移行・復元とは別です。新形式はレーン属性を復元し、チケットの互換フラグと矛盾すれば取り込み全体を失敗させます。

## 9. 失敗時とロールバック

起動時の移行に失敗した場合はトランザクションがロールバックされます。原因を修正して新版で再起動できますが、手動で途中のスキーマを作って「移行済み」に見せないでください。

旧版へ戻す場合、**イメージだけ戻してはいけません**。

1. 新版とすべての書き込み元を停止します。
2. 現在の移行後DBも別名で保存します。移行後に利用を再開していた場合、移行前バックアップへの復元ではその後の変更が失われます。利用者と復元範囲を確認します。
3. 確認済みの元DBパスへ、検証済みの移行前バックアップを復元します。元の所有者・権限を維持します。
4. 単体の `before.sqlite` を復元する場合、停止中の対象DBに残っている移行後の `-wal`／`-shm` を保存先へ退避し、混在させません。元のDB・WAL・SHM一式から戻す場合は同じ時点の組を使います。別のDBのファイルは触りません。
5. 保存した旧イメージ／ソースと起動設定に戻して起動し、health・DB整合性・移行前データとの一致を確認します。
6. 復旧を確認してから利用を再開します。JSON Importや手作業の逆移動をDB復元の代わりにしません。

## 10. AIからの完了報告

以下の形で、実測値と未解決事項を報告してください。`null` は未確認であり、合格を意味しません。秘密情報やチケット本文は報告に含めません。

```json
{
  "status": "not_started",
  "instance": "confirmed API base URL",
  "sourceBuild": "recorded old image digest or commit",
  "targetBuild": "confirmed migration-capable image digest or commit",
  "backupPath": "verified private backup location",
  "migrationApplied": null,
  "ticketsBefore": null,
  "ticketsAfter": null,
  "resolvedTicketsMoved": null,
  "completionLanesCreated": null,
  "completionAndArchivePreserved": null,
  "unresolvedLaneMembershipPreserved": null,
  "relationshipsPreserved": null,
  "integrityCheck": null,
  "foreignKeyViolations": null,
  "restartIdempotent": null,
  "clientsAndSkillsUpdated": null,
  "unresolvedItems": []
}
```

`status` は `not_started` / `blocked` / `verified` / `rolled_back` を使います。必要な照合がすべて合格した場合だけ `verified` とし、スキル更新や利用再開など残作業があれば明示してください。
