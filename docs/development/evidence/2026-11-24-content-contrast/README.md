# チケット履歴とMarkdownリンクの配色

同じ合成DBと添付を複製し、1440 × 900 px、画素比1、Headless Chromium 158で2026年11月24日に比較しました。各組で言語、テーマ、画面、データ、フォーカスを揃えました。リモートの本文は決定的な模擬アダプターです。

変更前の製品ソースは `1b2588380e764e9c31fa99c7bf6a4103826a0c9e` です。234の対象製品ファイルが同一の既存ビルド `2ff8489d889706a6dc6392fd28aeff073e0b515c` を使用しました。候補のソース指紋は `3eec9edea74662f23ad1cd590908fd420e2609e1936d0682451acaef8eb00196` です。[ソース・計算値・画像ハッシュ](manifest.json)

| 画面 | 条件 | 変更前 | 変更後 |
| --- | --- | --- | --- |
| 課題詳細のローカル本文 | 日本語・ダーク | [原画像](before-local.png) | [原画像](after-local.png) |
| リモート本文の詳細 | 英語・ダーク | [原画像](before-remote-detail.png) | [原画像](after-remote-detail.png) |
| 課題編集のリモート本文 | 日本語・ダーク | [原画像](before-remote-edit.png) | [原画像](after-remote-edit.png) |
| コメント | 英語・ライト | [原画像](before-comment.png) | [原画像](after-comment.png) |
| 展開したGroup説明 | 日本語・ライト | [原画像](before-group-description.png) | [原画像](after-group-description.png) |
| Group説明の編集プレビュー | 英語・ライト | [原画像](before-group-preview.png) | [原画像](after-group-preview.png) |
| 課題履歴 | 日本語・ダーク | [原画像](before-activity.png) | [原画像](after-activity.png) |

## 観察した状態

- 同じMarkdownの6領域で、外部リンクの既定・hoverと、チケット参照のTabフォーカスを確認しました。ローカル本文とリモートの閲覧・編集は既定の青 `rgb(0, 0, 238)` からダークのアクセント `rgb(84, 184, 159)`、コメントはライトのアクセント `rgb(31, 111, 95)` になりました。Group説明とプレビューは従来のアクセントとフォーカスを保持しています。
- 候補の全6領域で下線、アクセント色の2 pxフォーカス輪郭、添付のデコードを確認しました。スクリーンショットでは外部リンクにフォーカスした後、Tabで内部参照に移動しています。
- ダークテーマの履歴本文は `rgb(0, 0, 0)` から `rgb(238, 244, 241)` になりました。日時、警告イベントの種別、補足は補助色 `rgb(167, 179, 173)` を維持しています。

## 操作の確認

- 実際にTabで内部参照を選択し、Enterで対象の課題詳細を開きました。Escapeで詳細を閉じました。
- 長い本文をスクロールしてインライン編集を開始し、破棄確認をキャンセルしました。入力、キャレット、フォーカスを保持できました。次に入力を破棄し、詳細を閉じました。保存済みデータの再取得結果は検証前後で一致しました。[操作・再取得記録](interaction.json)
- Chromiumの関連E2Eは28件すべて通過しました。layout-visual-system、group-presentation、groups-visual、ticket-dialog、ticket-detail-inline、ticket-view-stylesを実行しました。原画像は代表条件で、OS固有の強制色のMarkdownリンクや実サービスへの通信は今回の実機観測範囲外です。
