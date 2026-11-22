# Group主要操作のキーボード検証

実施日: 2026-11-22。独立担当: ux1486_audit_review。

**判定: 操作と保存状態は成功。追加・解除成功後のフォーカス消失は改善が必要。**

## 対象と方法

- 3556の隔離環境のみを使用。既存fixtureと実運用3470は変更していない。
- 新規合成ボード: 日本語ID 4、英語ID 5。名前は `Independent Group keyboard ja-JP/en-US`。
- 親子チケットは日本語5/6、英語7/8。各ボードに新規Groupを1件作成。fixture作成だけHTTP APIを使用。
- 操作は直接URLでGroup画面を開いた後、Tab、矢印、Enter、文字入力のみ。locator.click/focus/fillは使っていない。
- 1280×844、ライトテーマ、日英。同じ内容の親子2件で比較。
- `verify.mjs`が再現手順、`results.json`が全キー操作・チェックポイントのfocus・保存前後API状態。実行すると新規合成ボードを追加し、結果を上書きする。

## 実行結果

1. 既存追加へTabで移動→Enter→子の名前を入力→ArrowDown/Enterで候補選択→追加Cancel。API状態は開始前と同一。focusは「既存チケットを追加」に復帰。
2. 同じ検索を繰り返し、Tabで「2件追加」へ→Enter。親子2件ともGroup所属。親子関係を保持。
3. 親の解除ボタンへTab→Enter。確認には親子2件を表示。取消すると所属を保持し、focusは元の解除ボタンに復帰。
4. 再度解除→Tabで確認実行→Enter。親子2件ともgroupId=null。parentTicketIdと本文を保持。再読込後も所属解除状態をAPIで確認。

`results.json`の`status:passed`は上記の操作・保存assertの成功を示す。フォーカス品質全体の合格ではない。

## フォーカスの問題

日英とも、追加成功後および解除成功後に `document.activeElement.tagName === 'BODY'` となった。画面には次の操作位置を示すフォーカス枠がない。追加では送信フォーム、解除では解除元の行が再描画で消えるため、戻り先を明示する必要がある。

推奨: 成功後は現在Groupの「既存チケットを追加」など、残る可視操作へフォーカスを戻す。追加・解除の両方について、再描画完了後に維持されることを確認する。今回の検証担当はソースを変更していない。

取消経路は良好だった。`*-add-cancel.png`は追加ボタン、`*-remove-cancel.png`はゴミ箱ボタンのフォーカス復帰を示す。成功時の`*-added.png`と`*-removed.png`をfocusログと併読すること。

## 証拠と限界

各言語で6画像: add-cancel / add-selected / added / remove-confirm / remove-cancel / removed。
実画像のうち日本語added/remove-cancel、英語removed/remove-confirmを独立目視確認し、ラベルと親子表示・対象件数に問題は見つからなかった。

親は未完了・未アーカイブ。アーカイブ済み親、大量候補、API失敗、実スクリーンリーダーは今回の対象外。実行可能性を確認したもので、全Group操作の網羅を主張しない。
