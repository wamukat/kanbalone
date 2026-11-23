# v1.0前の追加検証の独立レビュー

実施日: 2026-11-22。独立レビュー担当: `ux1486_audit_review`。
対象: v1.0.0-rc.2、候補イメージの隔離環境。
製品コード・チケット・検証用データは変更していない。このレビュー記録のみ追加した。

## レビュー範囲と判断

`audit.mjs`、`results.json`、キーボード記録、実際に保存された `export.json`、関連する既存E2Eと製品コードを照合した。`view_image`で日英の200% List/Group、英語200% Kanban、日本語200%詳細、英語100% Group、外部Preview timeout/待機中の実画像を確認した。全PNGを一枚ずつ確認したという意味ではない。

16件の自動assert成功は、画面全体・全導線・アクセシビリティ全体の合格を意味しない。詳細表示やGroupの完了状態の区別、復帰先の検証は確認できる一方、以下の不可視フォーカス2件を実ブラウザで再現した。不可視フォーカス2件は修正後の確認が必要。

## 1. 閉じたサイドバーへの不可視フォーカス

手順:

1. Playwrightの独立Chromiumコンテキストを1280×844で起動。
2. 初期スクリプトで `localStorage['kanbalone:sidebar-collapsed']='true'` を設定。
3. `fixture.json`のボード（今回ID 3）のListを開き、行の表示を待つ。
4. Tabを1回押し、`document.activeElement`と祖先のスタイルを取得。

期待: 画面に表示されている操作へフォーカスする。

実測: 閉じたサイドバー内の先頭ボードボタンにフォーカスした。

```json
{
  "focusedElement": "button.board-button",
  "rect": {"x": -264, "y": 16, "width": 247, "height": 38.375, "right": -17},
  "sidebar": {
    "hidden": false,
    "inert": false,
    "ariaHidden": null,
    "display": "flex",
    "opacity": "1",
    "transform": "matrix(1, 0, 0, 1, -280, 0)"
  }
}
```

ボタン全体が画面の左外にある。`app-shell.css`はtransformとpointer-eventsで閉じており、`syncSidebar()`は非表示部分をTab順から除外していない。ポインター操作不可だけではキーボード対象から除外されない。

## 2. 閉じた取り込みパネルへの不可視フォーカス

手順:

1. 同じListで合成チケット（今回ID 63）の詳細を開く。
2. Tabで詳細内を移動する。
3. `editor-remote-import-close-button`に到達した時の要素と祖先を取得。

期待: 非表示の取り込みパネルへフォーカスしない。

実測: パネルが非表示でも、その閉じるボタンへTabで到達した。日英の既存キーボード記録でも6回目のTabに同じ対象がある。

```json
{
  "focusedElement": "#editor-remote-import-close-button",
  "rect": {"x": 956.8125, "y": 78.890625, "width": 25.1875, "height": 25.1875},
  "sheet": {
    "hidden": false,
    "inert": false,
    "ariaHidden": "true",
    "display": "grid",
    "opacity": "0",
    "clipPath": "inset(0px 0px 0px 100%)"
  }
}
```

ボタンの矩形は画面内だが、祖先の透明化とクリッピングにより見えない。`app-editor-remote-import.js`の`syncSheet()`はsheet.hiddenをfalseにし、閉じた側にはinertを設定していない。`inDialog=true`というassertだけでは、この問題を検出できない。

## 3. 200% Listの日本語フィルター

`ja-JP-list-200.png`で「指定なし」が1文字ずつ縦に折り返し、「完了状態」も分断されている。読みにくさは画像から確認できる。英語Listでも一部フィルターが画面外にあるが、CSSには横スクロールの実装があるため、画像だけで操作不能とは断定しない。

親担当の横スクロール追試は本レビューの独立実行範囲外。`documentWidth <= innerWidth`だけで、すべての内部スクロール領域の操作到達性が証明されるわけではない。

## 4. 外部Previewとその他の検証限界

`preview()`は送信前にPreviewとImportをdisabledにし、finallyで状態を同期する。二重送信を防ぐ実装は存在する。ただし待機中の画像は通常のPreview表記のままで、処理中の文言や通知は確認できない。「進行状態が明確」とは評価しない。今回のharnessには待機中disabledのassertもない。

外部障害はブラウザ応答差替えによる模擬検証。実サービス障害や実回線のタイムアウトを再現したものではない。AX treeは実スクリーンリーダーの読み上げ結果ではない。キーボード確認はListからの詳細開閉と限定したTab往復であり、全操作を網羅していない。

保存されたExportには3件の合成チケット、Group、完了レーンの情報がある。破損ファイル・書込み失敗・全フィールドの往復整合を検証したとは言わない。Moveの追試は親担当が実行しており、この独立レビューでは再実行していない。

## README最終確認

READMEの「未完了」「自動assert成功とUI全体の合格を区別」「AXと音声を区別」「模擬障害」「今回画像は修正前」という記載は妥当。重大な過大主張はない。

「UX01の移動先/関係保持には既存証拠がある」は、親子・Group・blocker等の全関係をあらゆる移動で検証したという意味には解釈しない。既存テストの個別範囲に限定する。実スクリーンリーダー、全導線キーボード、実外部障害等を未確認として残す必要がある。
