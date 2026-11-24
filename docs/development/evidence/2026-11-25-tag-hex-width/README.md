# タグ色の16進値の表示幅

2026年11月25日 JST に macOS の Headless Chromium 158、デバイス画素比1、日本語で撮影しました。変更前は main の `2735ce6534692aef3f30a0dd9862c5f9ade18c3f`、変更後は同じソースにサイドバーのタグ色欄のCSS修正を加えてビルドした候補です。いずれも v1.4.0 と表示されます。合成データベースを同じ時点から複製し、各組の操作、ビュー幅、配色、未フォーカスの値 `#336699` を揃えました。[ソースと画像のハッシュ・計測値](manifest.json)

## 再現手順と画像

List 表示で、色が `#336699` の合成タグ「受入確認」を開きます。狭いビューポートでは「サイドバーを開く」を先に押します。タグ編集を開いた色オン状態を撮影し、タグ名から Tab で「色を使用」に進んで Space を押した色オフ状態を続けて撮影しました。いずれも16進欄にフォーカスを当てていません。画像はビューポート全体を撮影した原画像です。

| ビューポート | 配色 | 色 | 変更前 | 変更後 |
| --- | --- | --- | --- | --- |
| 1440 × 1000 | ライト | オン | [原画像](before-desktop-light-on.png) | [原画像](after-desktop-light-on.png) |
| 1440 × 1000 | ライト | オフ | [原画像](before-desktop-light-off.png) | [原画像](after-desktop-light-off.png) |
| 1440 × 1000 | ダーク | オン | [原画像](before-desktop-dark-on.png) | [原画像](after-desktop-dark-on.png) |
| 1440 × 1000 | ダーク | オフ | [原画像](before-desktop-dark-off.png) | [原画像](after-desktop-dark-off.png) |
| 240 × 900 | ライト | オン | [原画像](before-narrow-light-on.png) | [原画像](after-narrow-light-on.png) |
| 240 × 900 | ライト | オフ | [原画像](before-narrow-light-off.png) | [原画像](after-narrow-light-off.png) |
| 240 × 900 | ダーク | オン | [原画像](before-narrow-dark-on.png) | [原画像](after-narrow-dark-on.png) |
| 240 × 900 | ダーク | オフ | [原画像](before-narrow-dark-off.png) | [原画像](after-narrow-dark-off.png) |

## 表示と保存の結果

- 期待は、入力欄を操作する前に `#RRGGBB` の7文字を読めることです。変更前の `clientWidth` と `scrollWidth` は、既定のサイドバー幅280 pxで56 pxと61 px、狭いビューポートの実幅229 pxで42 pxと61 pxでした。変更後は全8状態で両方とも78 px、`scrollLeft` は0で、末尾まで表示されました。狭い条件でもスイッチ右端と入力左端に7 pxの間隔があり、色の行とピッカーがタグ編集フォーム内に収まりました。
- Tab でタグ名からスイッチ、16進欄へ移動しました。Space とスイッチのラベルクリックで切り替え、オフ時は16進欄とピッカーが無効になりました。16進欄へ `#DDDDDD` を入力するとピッカーに反映されました。ネイティブ色入力に合成の `input` イベントを送ると16進欄が `#25476B` になりました。
- 編集をキャンセルした後のタグ取得APIは `#336699` を返しました。続けて `#DDDDDD` を保存するとAPIの返す色値が更新され、再読み込み後に編集を開き直した16進欄とピッカーにも反映されました。

確認範囲は上記のChromium環境です。ネイティブカラーダイアログの表示と実機での操作は検証範囲外です。
