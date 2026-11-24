# フォーム共通スタイルの適用範囲

同じ合成DBと添付を複製し、原画像を2026年11月24日に撮影しました。各組の言語、テーマ、フォーカス、画面、入力値を揃えています。通常配色はHeadless Chromium 158、強制色はHeadless Chromium 159で、1440 × 900 px、画素比1です。リモート取り込みは模擬アダプターで表示しています。

基準コミットは `61faeb6058832a31f626c9cadf7c21840e17917c` です。基準の製品CSSとサーバーコードは、既に検証したビルド `98960edd476fb09bdb20b0aaaea2c1a3dad35ba596c79d04c4633d241471d926` と一致します。比較用ソース指紋に含まれるパッケージ定義には、カタログ文書のビルドコマンド追加分があります。候補の指紋は `ab34fc25a5208741220475b2c5dac48bf144ab24dd5f93b67a5f82e037799010` です。[ソース・計算値・画像ハッシュ](manifest.json)

| 状態 | 変更前 | 変更後 |
| --- | --- | --- |
| Listツールバー、検索にフォーカス、英語・ライト | [原画像](before-toolbar-light.png) | [原画像](after-toolbar-light.png) |
| Listツールバー、検索にフォーカス、日本語・ダーク | [原画像](before-toolbar-dark.png) | [原画像](after-toolbar-dark.png) |
| Groupの仮想表示の検索 | [原画像](before-group-search.png) | [原画像](after-group-search.png) |
| チケットの作成フォーム | [原画像](before-editor.png) | [原画像](after-editor.png) |
| リモート取り込みのURLとチェック | [原画像](before-remote-drawer.png) | [原画像](after-remote-drawer.png) |
| サイドバーでのボード名変更 | [原画像](before-board-rename.png) | [原画像](after-board-rename.png) |
| サイドバーでのタグ作成 | [原画像](before-tag-create.png) | [原画像](after-tag-create.png) |
| タグ色を使う状態とネイティブピッカーのフォーカス | [原画像](before-tag-color-enabled.png) | [原画像](after-tag-color-enabled.png) |
| タグ色を使わない状態 | [原画像](before-tag-color-disabled.png) | [原画像](after-tag-color-disabled.png) |
| 一括移動ダイアログの選択欄 | [原画像](before-move-dialog.png) | [原画像](after-move-dialog.png) |
| 強制色でフォーカスしたタグ色スイッチ | [原画像](before-forced-switch.png) | [原画像](after-forced-switch.png) |

## 表示と操作

- 通常配色の10組のうち6組は全画素が一致しました。残る4組の差はフォーカスしたテキスト入力内のキャレットで、幅1 px、長さ12〜17 pxです。フォーカスした状態の原画像はそのまま保存しています。
- テキスト系とセレクトの計算値を照合しました。アーカイブとリンク付き投稿のネイティブチェックボックスは、共通入力スタイルの対象から外れ、背景などの計算値が変わりました。チェックボックスの寸法と実描画は一致しました。
- タグ色の透明なチェック入力は、今回の合成ボードで幅約76.42 pxから1 pxになりました。可視スイッチ、HEX欄、ネイティブカラーピッカーの表示は一致しました。可視スイッチのクリックとSpaceで、HEX欄とピッカーの有効・無効を切り替えられました。
- Chromiumの強制色をエミュレートし、Tabで可視スイッチにフォーカス輪郭が出ることと、Spaceで切り替えできることを確認しました。両ビルドとも、HEXの入力にネイティブピッカーが同期し、タグ色の保存がHTTP 200を返しました。APIで保存値を取得し、再読み込み後のタグ表示も確認しました。[強制色と保存の記録](forced-colors-and-save.json)
- 一覧の検索とアーカイブ表示、Group検索、チケットの入力、サイドバー操作、一括移動の選択欄を両ビルドで操作しました。ボード名・タグ・チケットの保存済みデータは、取り消しを挟んだ採取の前後で一致しました。

関連Chromium E2Eは35件が通過しました。そのうち初回にタイムアウトした1件は単独再実行で通過しました。Group検索の日英2件も通過しています。ネイティブカラーダイアログのOS固有の外観は撮影範囲外です。
