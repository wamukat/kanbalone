# 完了状態のレーン移行ガイド

このガイドは、チケットごとの完了フラグを、所属レーンで決まる完了状態へ移行するための手順です。人間と、更新作業を依頼されたAIの両方を対象にしています。

**完了状態の移行はv0.10.0で導入されました。** v0.9.x以前からv0.10.0以降へ更新する際に適用します。

- **v1.0.0-rc.2 → v1.0.0**：追加のAPI・保存形式の変更はありません。通常どおり更新前にバックアップしてください。
- **v0.11.0 → v1.0.0**：7節の削除一覧に従ってクライアントを更新します。旧DBの移行と旧Exportの取り込みは維持します。
- **v0.10.0 → v0.11.0**：[Group移行手順](#group-migration)を参照してください。
- **v0.9.x以前 → v0.11.0**：このガイドの完了状態移行とGroup移行の両方を確認してください。完了済みチケットの移動先レーンは、完了状態移行のルールで照合します。

更新先の公式タグ／イメージを使用してください。以下のコマンドは例であり、このガイドを読んだだけで更新を実行するものではありません。

## 1. 何が変わるか

| 項目 | 更新前 | 更新後 |
| --- | --- | --- |
| 完了状態の判定元 | チケットの `isResolved` | レーンの `isCompletionLane` |
| 完了にする操作 | チケットの完了フラグを変更 | 完了レーンへ移動 |
| 未完了に戻す操作 | チケットの完了フラグを解除 | 通常レーンへ移動 |
| アーカイブ | 完了とは独立 | 引き続き独立。アーカイブ・復元では完了を変えない |
| レーン名 | 完了フラグとは独立 | 名前では判定しない。Doneという名前でも通常レーンになり得る |

DBでは `lanes.is_completion_lane` が判定元になります。`tickets.is_resolved` 列は削除せず、検索用の派生値としてDBトリガーでレーンと同期します。チケットの列を直接更新する運用はやめてください。APIレスポンスは読み取り専用の `isResolved` を使用します。v0.10.0〜v0.11.0では互換名 `isCompleted` も返していましたが、v1.0.0での削除は7節を参照してください。

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
| 保存先 | 実際のSQLiteパス、同じディレクトリの `attachments/`（存在する場合）、永続ボリューム／bind mount。旧構成ではsoloboard.sqlite等の場合もある |
| 更新元・更新先 | 復元可能な旧イメージ／ソースと、移行処理を含む新イメージ／ソースの識別子 |
| バックアップ | 保存先、空き容量、DBと添付画像をまとめて復元できる方法 |
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
4. アプリとすべてのDB書き込み元を停止し、SQLite DBと添付画像をまとめてバックアップします。旧イメージの識別子と起動設定も保存します。設定ファイルには秘密情報があり得るため、公開しないでください。
5. バックアップを実際に開けることと `PRAGMA integrity_check` が `ok` であることを確認します。可能なら、コピーを隔離した新環境で先に移行して検証します。

[DBと添付画像のバックアップツール](#database-and-image-backup)は、SQLiteのWALにあるコミット済みデータと対応する画像を保存します。停止してファイルをコピーする場合は、DB・存在する `-wal` と `-shm`・同じディレクトリにある `attachments/` を一組として保存します。ボードのJSON Importでは別ボードが作成され、インスタンス全体のデータや元のIDは復元されません。

旧イメージは識別子を記録するだけでなく、ダイジェストで再取得できること、またはローカルに保持されていることを確認します。必要なら更新前に `docker image save` で保存し、復旧確認まで旧イメージを削除しないでください。

<a id="database-and-image-backup"></a>
### DBと添付画像のバックアップ

Dockerの既定の保存先は `/app/data/kanbalone.sqlite` と `/app/data/attachments/` です。`KANBALONE_DB_FILE` を変更した場合、`attachments/` は指定したDBファイルと同じディレクトリに作成されます。両方を永続ストレージに置いてください。

バックアップツールはSQLiteのスナップショットを取得し、そこに記録された画像をコピーします。DBの整合性、アプリが受け付ける画像形式とサイズ上限に照らしたメタデータ、各画像ファイルのサイズとSHA-256を検証します。`manifest.json`・`database.sqlite`・画像がある場合の `attachments/` を含むバックアップディレクトリ全体を、アプリのデータボリュームとは別の非公開の場所に保存してください。添付画像機能が追加される前のDBにも使用できます。

どちらのコマンドも、既存の入力元と未作成の出力先ディレクトリを指定します。出力先の親ディレクトリはあらかじめ作成してください。復元では検証完了後に出力先を作成し、元の名前のDBと対応する画像を同じ場所に配置します。データを書き込んだ版、またはそのデータを移行できる新版を使ってください。元のデータは保持し、隔離起動と復元画像の取得を確認してから起動設定を切り替えます。アップグレード前は、照合基準と一致するように書き込みを止めて取得します。通常のバックアップは稼働中にも取得できます。

#### 直接起動・ソースからの起動

依存関係をインストール済みのチェックアウトで実行します。パスは実際の保存先に置き換えてください。

```bash
node scripts/kanbalone-backup.mjs backup /path/to/data/kanbalone.sqlite /private/backups/kanbalone-1
node scripts/kanbalone-backup.mjs restore /private/backups/kanbalone-1 /path/to/recovered-data
```

復元した環境の起動時は、実際に復元されたファイル名を使って `KANBALONE_DB_FILE=/path/to/recovered-data/kanbalone.sqlite` を指定します。

#### Docker

バックアップツールを含むイメージを使います。元のコンテナ名と実際のパスを設定してください。この例では元コンテナのvolumeまたはbind mountを `/app/data` で参照します。ホスト側の2つの親ディレクトリを作成し、作業用コンテナの実行ユーザーに書き込み権限を付けてください。標準イメージではUIDは1000です。

```bash
KANBALONE_CONTAINER='replace-with-your-container'
KANBALONE_BACKUP_IMAGE='replace-with-image-that-includes-the-backup-tool'
BACKUP_PARENT='/absolute/private/backup-parent'
RECOVERY_PARENT='/absolute/private/recovery-parent'

docker run --rm --network none --volumes-from "$KANBALONE_CONTAINER" \
  --mount "type=bind,source=$BACKUP_PARENT,target=/backup" \
  "$KANBALONE_BACKUP_IMAGE" node scripts/kanbalone-backup.mjs \
  backup /app/data/kanbalone.sqlite /backup/kanbalone-1

docker run --rm --network none \
  --mount "type=bind,source=$BACKUP_PARENT,target=/backup,readonly" \
  --mount "type=bind,source=$RECOVERY_PARENT,target=/recovery" \
  "$KANBALONE_BACKUP_IMAGE" node scripts/kanbalone-backup.mjs \
  restore /backup/kanbalone-1 /recovery/kanbalone-1
```

復元したデータで起動する場合は、ホストの `$RECOVERY_PARENT/kanbalone-1` をアプリの `/app/data` にマウントします。named volumeへ復元するには、新しいvolumeを作業用コンテナの `/app/data` にマウントして `/app/data/kanbalone-1` へ復元します。そのvolumeをアプリにマウントし、`KANBALONE_DB_FILE=/app/data/kanbalone-1/kanbalone.sqlite` を指定します。

### 旧版のDockerを停止して保存する例

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

以下は、添付画像機能が追加される前のデータから、コピーしたDBを検査して単体バックアップへまとめる例です。Python 3があるホストで実行します。`kanbalone.sqlite` は実際のファイル名に置き換えてください。画像がある場合は、停止時のコピー全体をセットで保存するか、コピーに対して[バックアップツール](#database-and-image-backup)を実行します。

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

## 7. APIクライアント・AIスキルの更新

<a id="deprecated-api-removal"></a>

### v1.0.0：非推奨APIの互換処理を削除

以下はv1.0.0での変更です。**v0.11.0には含まれません。** 更新対象のリリースノートとイメージを確認してください。v0.10.0〜v0.11.0では、レーンと一致する完了フラグを互換用に受理し、完了状態を2つのレスポンス項目名で返していました。v1.0.0ではこの互換処理を削除します。

| 削除対象 | 置き換え先 | 削除後の動作 |
| --- | --- | --- |
| チケット・一覧・関連チケット・新規ボードExportの `isCompleted` | `isResolved` を読む | 旧項目は返さない |
| クエリ `completed=true/false` | `resolved=true/false` | `resolved` と併記していても400 |
| 作成・更新・移動・一括移動・作成／変更プレビューのリクエスト `isResolved`／`isCompleted` | `laneId` または `laneName` を指定し、両フラグを省略 | レーンと一致する値でも、無変更で400 |
| `POST /api/boards/:boardId/tickets/bulk-complete` | `POST /api/boards/:boardId/tickets/bulk-transition` | 404 |
| `POST /api/boards/:boardId/tickets/reorder` | 1件は `PATCH /api/tickets/:ticketId/position`、レーン内の複数件は `POST /api/lanes/:laneId/tickets/reorder` | 404 |

読み取り専用の `isResolved`、クエリの `resolved`、レーン内の並べ替え、チケットの位置変更は維持します。旧ボード全体の並べ替えを複数リクエストに置き換える場合、ボード全体を一括更新する原子性はありません。必要なレーン・チケットごとの操作を計画してください。

今回のAPI整理でも、旧DBの自動移行と旧JSON Exportの取り込みは維持します。既存データにはこのガイドの移行規則を適用します。旧フィールドを消すために、DBの完了列やバックアップファイルを手作業で書き換えないでください。

- 完了・再開はレーン移動で行います。移動先は `isCompletionLane` で判断し、名前から推測しません。
- レーンの完了属性を変更すると、そのレーンの全チケット（アーカイブ済みを含む）が変わります。1件を完了させる代わりにレーン属性を変更しないでください。
- ボード全体の設定変更には `PUT /api/boards/:boardId/completion-lanes` を使用します。全選択と期待値を送り、409時は再取得・再確認します。個別PATCHで検査を回避しません。
- 配布された `kanbalone-api` スキル、参照資料、ヘルパーを一緒に更新します。リポジトリの更新だけでは、各AI環境にインストール済みのスキルは更新されません。

### リクエストの書き換え例

以下はAPIパスとJSONボディの対応例です。実行前にレーン一覧を取得してください。例ではボード1のレーン12が `isCompletionLane: true`、レーン11が `false` であることを確認済みとします。ID・名前は実環境の値に置き換えます。自動移行後も、既存のDoneが完了レーンになるとは限りません。

| 目的 | 削除されたリクエスト | 置き換え先 |
| --- | --- | --- |
| `PATCH /api/tickets/123` で完了 | `{"isResolved":true}` | `{"laneId":12}` |
| `PATCH /api/tickets/123` で再開 | `{"isCompleted":false}` | `{"laneId":11}` |
| `POST /api/boards/1/tickets` で完了済みとして作成 | `{"title":"作業","laneId":11,"isResolved":true}` | `{"title":"作業","laneId":12}` |
| `PATCH /api/tickets/123/transition` で移動 | `{"laneName":"Done","isResolved":true}` | `{"laneName":"Done"}`。事前にレーンの完了属性を確認する |

**複数件を完了する場合** — エンドポイントとボディの両方を変更します。

変更前（`POST /api/boards/1/tickets/bulk-complete`）:

```json
{"ticketIds":[123,124],"isResolved":true}
```

変更後（`POST /api/boards/1/tickets/bulk-transition`）。事前に確認した完了レーン名を指定します:

```json
{"ticketIds":[123,124],"laneName":"Completed (migration)"}
```

再開は、同じエンドポイントで確認済みの通常レーン名を指定します。移動は配置も変えるので、運用上の移動先を決めてから送信します。

### エラー時にユーザーの意図を変えない

削除されたフラグ・別名はクライアント側で修正します。削除されたエンドポイントは対応するAPIへ置き換えます。400／404を受けて勝手にチケットを移動したり、レーン属性を変えたり、DBを直接更新したりしないでください。現行APIの競合による409は、現在値を読み直して判断します。

対応する操作は [AI APIガイド](./ai-api-guide.md) と [API例](./api-examples.md) を参照してください。

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
2. 現在の移行後DBと添付画像をまとめて別の場所に保存します。移行後に利用を再開していた場合、移行前バックアップへの復元ではその後の変更が失われます。利用者と復元範囲を確認します。
3. [検証済みの移行前バックアップ](#database-and-image-backup)を新しいデータディレクトリへ復元し、旧版の起動設定で復元先のDBを指定します。適切な所有者・権限を設定します。
4. 停止時にコピーしたファイルから戻す場合は、同じ時点のDB・存在する `-wal`／`-shm`・添付画像を新しいデータディレクトリへ復元します。旧版の単体 `before.sqlite` も新しいデータディレクトリへ置き、後の起動で生成された付属ファイルとの混在を防ぎます。
5. 保存した旧イメージ／ソースと起動設定を使い、復元先のDBを指定して起動します。health・DB整合性・移行前データとの一致を確認し、添付画像がある場合は画像も取得します。
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

<a id="group-migration"></a>
## v0.11.0：Groupへの移行

この節はGroupを導入するv0.11.0への更新に適用します。上記のv0.10.0完了状態移行とは別の変更で、公開済みv0.10.0イメージにはGroup機能はありません。この文書を読むこと自体は、稼働環境の更新やデータ変更の指示ではありません。

### DBの変更

初回起動時にGroupの保存領域と、nullableなチケット所属を追加します。既存チケットはすべて未所属です。タグ・レーン名・チケット名・親の名前からGroupを推測しません。既存チケットのID、レーン、完了・アーカイブ状態、親子関係、コメント、remoteリンクは維持します。v0.10.0へ移行済みのDBで完了状態の再分類や完了レーンの再作成は行いません。

Groupはボード内に限定し、接続した親子チケットで所属を共有します。SQLiteの `group_id` を直接書き換えないでください。APIではボード・親子の検証、対象全件の更新、履歴記録を同じトランザクションで行います。

### ユーザー／AIによる更新と照合

1. 実際のURL、実行方法、データパス、更新元・更新先ビルドを特定します。公開済みv0.10.0がGroup対応済みと仮定しません。
2. 書き込みを止め、上記の手順でSQLiteと、添付画像がある場合はそれもまとめてバックアップします。
3. 更新前にボード・レーン・チケットの件数を記録し、照合用に全ボードをexportします。アーカイブ済みチケットも含めます。
4. v0.11.0を同じ保存先で起動します。新旧の書き込みプロセスを同時に動かしません。
5. health、ボードとチケットの総数を確認します。初回は `GET /api/boards/:boardId/groups?status=all` が空で、既存チケットの `groupId` と `group` がnullであることを確認します。レーンID、完了・アーカイブ状態、親子関係を更新前と照合します。
6. 使い捨てのテストボードで、Group作成、親子の追加、所属解除、空のGroup削除、export/importを確認します。移行確認だけを目的に実ユーザーのチケットを再編成しません。
7. 検証したビルド、バックアップ先、確認結果、差分を報告します。移行や照合に失敗したまま成功扱いにしません。

### JSON export形式2

形式2のexportには `formatVersion:2`、`groups` 配列、各チケットの `groupId` を含めます。inactive・空のGroupとアーカイブ済みチケットも対象です。説明はMarkdown原文を保存し、件数・active状態・HTMLは復元値に使いません。表示用の `group:{id,name}` を所属参照としてexportすることはありません。

importは新しいボードを作り、チケットとGroupの両方のIDを再採番します。既存ボードへのマージではありません。Group参照と親子の所属は一致している必要があります。不明な参照、ID・名前の重複、必須Group項目の欠落、親子の所属不一致はimport全体を拒否し、作りかけのボードを残しません。

旧形式はversionもGroup関連フィールドもない場合だけ受け付け、未所属として取り込みます。Groupフィールドがあるのにversionがない入力は、所属を黙って捨てず拒否します。未知のversionも拒否します。

### ロールバック

新しいプロセスを停止し、更新前のデータを復元してから旧ビルドを起動します。旧アプリはGroupの整合性を保てないため、更新後のDBをそのまま開かないでください。バックアップ後に行った変更は復元先には含まれないため、必要なら別途照合します。

形式2のJSONを旧版へimportする方法はロールバックとして使いません。旧版が未知フィールドを拒否せず、Group情報を無視して取り込む可能性があります。更新前のバックアップと旧ビルドを組み合わせて戻してください。

<a id="automated-upgrade-verification"></a>
## 更新・復元の自動検証

CIとリリースワークフローでは、公開済みのv0.9.35・v0.10.0・v0.11.0から候補イメージへの更新をLinux/amd64で検証します。各版についてDocker volumeとbind mountの両方を確認します。チケットや外部参照はすべて検証専用データです。既存の利用者DBをマウントしたり、Issueプロバイダーへアクセスしたりしません。

確認する内容は次のとおりです。

- SQLiteのWALにデータが残った状態で停止し、DB一式をバックアップ。ファイルサイズとSHA-256を記録。
- 完了状態の移行、レーン名の重複、アーカイブ、親子・関連チケット、タグ、コメント、イベント、外部参照の保持。v0.11.0では所属あり／空のGroupも確認。
- 移行仕様で変更する項目を除く既存の全保存項目、DB整合性、外部キー、APIでの読み出し、再起動による変更がないこと。
- 完了状態の移行を意図的に失敗させ、スキーマとデータがまとめて元に戻ること。
- 更新後に書き込み、旧DB一式と旧イメージに戻して元のデータと完全一致すること。バックアップ後の書き込みは復元されないこと。
- v0.11.0から更新した候補版で添付画像を保存し、稼働中にバックアップして新しいディレクトリへ復元。チケットのMarkdownと画像のHTTP応答が元データと一致し、バックアップ後の画像は元の環境だけに存在すること。

ローカルの候補版を検証する場合は、次を実行します。

```bash
revision=$(git rev-parse HEAD)
version=$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')
docker build --platform linux/amd64 \
  --label "org.opencontainers.image.revision=$revision" \
  --label "org.opencontainers.image.version=$version" \
  -t kanbalone:upgrade-check .
RELEASE_SHA="$revision" RELEASE_VERSION="$version" \
  node scripts/verify-upgrade-restore.mjs kanbalone:upgrade-check
```

SHAで候補版を特定できるよう、変更のないチェックアウトを使用してください。Dockerと公開イメージを取得できるネットワークが必要です。bind mountでは実行者のUID/GID、volumeではイメージ既定のユーザーで起動します。一時コンテナと検証用ストレージは削除されます。結果・検証用データの全スナップショット・意図的な失敗のログは`coverage/upgrade-restore/`に残り、CIでは`upgrade-restore-RUN_ATTEMPT`として30日間保存します。

この検証ではLinux/amd64の隔離コンテナと検証専用データを使用します。実際の更新では上記のバックアップと照合手順を実施してください。古いバックアップに戻すと、その後の変更は別途照合しない限り失われます。

## 完了日時とKanbanの表示（v1.0.0）

更新時に完了日時用の列が自動追加されます。既存チケットのレーン・完了状態・アーカイブ・位置は変更しません。過去の完了日時は推測せず、APIの `resolvedAt` は `null` です。今後完了レーンへ入った時刻を記録し、通常の編集では保持します。既存日時不明のチケットは既存位置順、新たな完了チケットはその前に表示します。

Kanbanの完了レーンは初期5件、50件ずつ追加表示です。表示を折り畳んでも保存データは消えません。初期の状態条件は未完了＋完了です。保存済みの未完了・完了の選択は保持します。完了が見えない場合は完了状態の条件をリセットしてください。JSON Export/Importは完了日時を保持し、旧Exportの日時欠落はnullとして読み込みます。更新前バックアップと旧版での復元手順は本ガイドの既存手順に従ってください。

## 保存済みの完了・アーカイブ表示条件（v1.0.0）

完了状態とアーカイブ表示を分けます。ブラウザに保存された旧条件の `status` に `archived` が含まれていた場合は、`includeArchived: true` に変換します。`open`・`resolved` の選択は保持し、どちらも選んでいなかった場合（アーカイブのみ）は両方を選択します。

以後、完了状態の条件はアーカイブ済みチケットにも適用されます。例えば旧「未完了＋アーカイブ済み」は、新「未完了＋アーカイブを含める」になり、完了済みのアーカイブは表示されません。旧「アーカイブのみ」は未完了・完了とアーカイブ済みを含む表示になります。必要に応じて **完了状態** を調整してください。チケットの保存内容やAPIの検索仕様は変わりません。

## チケット一覧のページング（v1.1.0-rc.1）

既存のAPI呼び出しは変更不要です。`limit`・`cursor`を指定しない一覧取得は、従来の件数・順序・応答形式を維持します。[ページングの使用例](./api-examples.md#チケット一覧のページング)を参照してください。

起動時に一覧の更新検出用テーブル・cursor署名用情報・トリガー・インデックスを追加します。既存チケットやレーンの意味は変更しません。通常のアップグレードと同様にDBと添付画像をバックアップし、候補版で保持を確認してください。cursorは再起動だけでは無効になりませんが、一覧データの変更や別DBへの切り替え・復元後は継続を保証しません。無効なcursorによる400や更新による409時は、保存したcursorを破棄して取得し直します。その他の400は指定した引数を修正します。

## 画像を含むボードの持ち運び（v1.1.0-rc.1）

チケット本文・コメント・Group説明でローカルに保存した画像を埋め込むかリンクするボードは、形式3でExportします。参照画像のファイルをJSONに含めます。該当する参照がなければ、従来の形式2でExportします。形式3のImportにはv1.1.0-rc.1以降を使用してください。参照画像が見つからない場合や、画像を含むJSONが64 MiBを超える場合はExportできません。

インスタンス全体の復元やJSONの上限を超えるデータの移行には、[DBと添付画像のバックアップ](#database-and-image-backup)を使ってください。v1.0.0に戻す場合は、更新前のバックアップを復元してv1.0.0のイメージで起動します。

## 保存した横断ビューの定義（v1.4.0）

v1.4.0 の起動時に、保存ビューの定義・検索リビジョン用テーブルと更新検出用トリガーを自動で追加します。課題の所属・完了状態と、ブラウザーに保存したボード別フィルターは維持されます。更新前に [DBと添付画像をまとめてバックアップ](#database-and-image-backup) してください。以前の版に戻すときは、旧イメージと更新前のバックアップを使います。復元されるのはバックアップ時点のデータです。

DB 全体の復元では、保存ビューの定義とボード・タグ ID を保持します。単一ボードの JSON 出力で移せるのはボードデータです。インポートしたボードには新しい ID が割り当てられます。保存ビューは元の参照を保持し、削除された参照を警告として表示します。
