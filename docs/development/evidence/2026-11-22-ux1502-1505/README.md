# #1502–#1505 修正と比較検証（2026-11-22）

## 変更

1. #1502: Archive/Restore保存後の画面更新失敗は、保存済みと再読み込みの案内を表示し、古い詳細画面を閉じる。保存自体の失敗は従来どおり入力を保持し再試行できる。
2. #1503: Export取得失敗を既存toastで知らせる。再試行でき、未処理の例外を残さない。
3. #1504: 作成/編集/Move/Archive/Restoreの成功・失敗後に、表示中の操作位置へフォーカスを戻す。ユーザーが別の可視コントロールへ移った場合は奪わない。
4. #1505: Group追加/解除成功後は、同じボード/Groupを表示していれば「既存チケットを追加」へ戻す。取消時の良好な復帰は維持。

## 比較条件と手順

Beforeは `24920cc1313b995bc857a48964aa5b3512898a37`、[直前の必須検証](../2026-11-22-ux1486-final/README.md)。Afterは同SHAをベースにした作業ツリー（`fingerprint.json`に6ファイルのSHA256）。3556の独立環境、日英、Chromium、1280×844、ライトテーマ。同じ合成チケット内容・Group親子構造・操作を使用。実行ごとに新規fixtureを作成したためID、移動先の識別名、サイドバーの検証用ボード数は異なる。運用3470の既存データは検証に使用していない。

再現スクリプト: `verify.mjs`、`post-save.mjs`、`group/verify.mjs`。リポジトリルートでNode26とインストール済みPlaywrightから実行。3556は検証専用とし、再実行で証拠を上書きする前に退避する。

APIでfixtureを作成し、その後はURLを開いてTab/文字入力/Enterで主要操作を実行。Moveのネイティブselectは文字入力選択を使用。500はPlaywrightによる模擬応答であり、実サービス障害ではない。

## #1502 保存後の再取得失敗

| | 日本語 | English |
| --- | --- | --- |
| Before | ![](../2026-11-22-ux1486-final/ja-JP-archive-post-save-failure.png) | ![](../2026-11-22-ux1486-final/en-US-archive-post-save-failure.png) |
| After | ![](ja-JP-archive-post-save-failure.png) | ![](en-US-archive-post-save-failure.png) |

Archive/Restore両方向×日英4ケースで、PATCH成功→一覧GET500→通知と詳細閉鎖→再読み込み→詳細を開き直す手順を確認。`post-save-results.json`で保存後の状態が再読み込み後も維持される。`*-post-save-retry.png`のAfterは**操作の再送ではなく再読み込み後の確認**。Beforeの同名画像は誤った再操作による反転を示すため、同じ意味の結果と扱わない。修正は古い操作ボタンを閉じて誤操作を防ぐもので、toggle API一般の冪等性を保証する変更ではない。

## #1503 Exportのエラー通知

| | 日本語 | English |
| --- | --- | --- |
| Before | ![](../2026-11-22-ux1486-final/ja-JP-export-failed.png) | ![](../2026-11-22-ux1486-final/en-US-export-failed.png) |
| After | ![](ja-JP-export-failed.png) | ![](en-US-export-failed.png) |

GET500でエラー通知、Exportボタンのfocus維持、再試行でDownload startedと正常JSON保存、pageerrorなしを確認。今回Exportする元ボードは移動後の空ボードなのでJSON/board名の確認まで。含有チケットの確認は前回証拠と区別する。OS側のディスク不足は検証していない。

## #1504 チケット操作のfocus

| | 日本語 | English |
| --- | --- | --- |
| Before | ![](../2026-11-22-ux1486-final/ja-JP-edited.png) | ![](../2026-11-22-ux1486-final/en-US-edited.png) |
| After | ![](ja-JP-edited.png) | ![](en-US-edited.png) |

新規作成後は検索欄、編集成功後は詳細の編集ボタン、Move後は移動ボタン、Archive/RestoreのPATCH失敗時はアーカイブ/復元ボタンへ戻る。詳細が閉じた場合も検索欄等の可視操作へ戻る。`results.json`と日英focus-logでBODYではないことを確認し、APIで作成先/本文/移動先/アーカイブ状態と再読込を確認。

## #1505 Group所属変更のfocus

| | 日本語 | English |
| --- | --- | --- |
| Before | ![](../2026-11-22-ux1486-final/group/ja-JP-added.png) | ![](../2026-11-22-ux1486-final/group/en-US-removed.png) |
| After | ![](group/ja-JP-added.png) | ![](group/en-US-removed.png) |

[Group実施記録](group/README.md)。追加・解除成功後、取消時のfocus、親子groupId/本文/関係と再読み込み後の保存結果を確認。

## 判定

日英の操作検証8ケース、保存後再取得失敗4ケース、Group2言語の一連操作はすべて成功。製品コードを変更した担当とは別の担当がコード・画像・ログをレビューし、必須の追加指摘なし（`review.md`）。回帰E2Eは計12件成功。型検査・build成功。単体テスト結果は`validation.json`。

画面構造・既存部品を維持。API/データ形式の変更や移行はなし。今回の4件はAcceptanceで確認後、2026-11-22にユーザーが受け入れ、コミットして続行することに合意した。後続合意済み#1498〜#1501は対象外。マージ後に4件と#1486のv1.0必須範囲を完了として整理する。

チケットの比較画像は取得時にlocalhost:3559で配信し、実チケットで読み込みを確認済み（attachments.json）。原本はこのディレクトリとBeforeディレクトリに保持。PR作成時に固定コミットSHAのURLへ切り替え、表示確認結果をチケットに記録する。
