# ダイアログボタンポリシー

Kanbalone の各ダイアログ下部に表示する操作ボタンの方針を定義します。

## 一覧

| ダイアログ | モード / 起点 | フッターボタン | 現在の並び | 備考 |
| --- | --- | --- | --- | --- |
| チケットダイアログ | 新規チケット | Save, Cancel | 右: Save, Cancel | チケット作成前なので破壊的操作はありません。 |
| チケットダイアログ | 既存チケット編集 | Delete, Archive/Restore, Move, Save, Cancel | 左: Delete, Archive/Restore, Move / 右: Save, Cancel | 左の操作は利用可能時に表示。Moveは既存の別ボード移動です。 |
| チケットダイアログ | 既存チケット表示 | Add Comment | 右: Add Comment | Edit はダイアログモードを変えるヘッダー操作です。コメントの edit/delete はコメント行ごとの操作です。 |
| UX 確認ダイアログ | Delete Board | Delete, Cancel | 右: Delete, Cancel | 破壊的操作の確認です。 |
| UX 確認ダイアログ | Delete Lane | Delete, Cancel | 右: Delete, Cancel | 破壊的操作の確認です。 |
| UX 確認ダイアログ | Delete Ticket | Delete, Cancel | 右: Delete, Cancel | 破壊的操作の確認です。 |
| UX 確認ダイアログ | Delete selected tickets | Delete, Cancel | 右: Delete, Cancel | 一括破壊的操作の確認です。 |

## 方針

1. フッター操作は、リスクと確定操作の意味でグループ化します。
2. 追加確認なしで実行できる破壊的な副操作は左に置きます。
3. Cancel / dismiss 操作は右側グループに置き、確定操作の直後に配置します。
4. 確定操作は右寄せグループの先頭に置き、DOM順と視覚順を一致させます。正のtabindexやCSSでの順序変更は使いません。
5. 確認ダイアログは `Cancel` と破壊的な確定操作だけを右側に表示します。
6. ヘッダーの close button はダイアログを閉じるだけです。フッターの cancel button と意味を重複させません。
7. コメントの edit/delete や Archive/Restore のように一部の内容だけに作用するインライン操作は、フッターではなく対象コンテンツの近くに置きます。
8. 名前変更やタグ管理のような軽量なフォーム操作は、ダイアログではなくインラインに置きます。
9. 破壊的操作の確認ダイアログでは、対象、削除されるデータ、取り消し可否を明記します。

## ボタンの意味

| 役割 | 配置 | スタイル | 例 |
| --- | --- | --- | --- |
| 主要な確定操作 | 右側グループ、取消の前 | `.primary-action` | Save, Create, Add Comment |
| 副次的な取り消し | 右側グループ、主要操作の直後 | `.ghost` | Cancel |
| 即時の破壊的操作 | 左 | `.danger.action-with-icon` と trash icon | Edit Ticket の Delete |
| 破壊的操作の確認 | 確認ダイアログのCancelの前 | `.danger.action-with-icon.danger-confirm-action` と trash icon | Delete Board, Delete Lane, Delete Ticket, Delete selected tickets |
| ヘッダー操作 | ヘッダー右 | icon button | チケット編集、ダイアログを閉じる |
| 対象範囲の小さいインライン操作 | 対象コンテンツの近く | icon または small ghost button | コメント edit/delete, Archive/Restore, Board rename, Tag create/edit/delete |

## 実装ルール

- フッターコンテナには `.editor-actions` を使います。
- 即時の破壊的操作は `.editor-actions` の direct child として配置します。
- Cancel と primary action は `.editor-actions-right` で包みます。
- Primary footer button が 1 つだけの場合も、直接 `.editor-actions` に置かず `.editor-actions-right` で包んで右寄せにします。
- Create、Save、その他の非破壊的な確定ボタンには `.primary-action` を付けます。
- Delete button には Lucide `trash-2` icon を表示します。

## キーボード確定と利用先の点検

Ctrl＋Enter / ⌘＋Enterで、現在のダイアログまたは編集欄にある表示中・有効な確定操作を実行します。入力検証は維持し、IME変換、キーリピート、送信中の重複実行は抑止します。キーはアクセシブル名とは別のショートカット属性とツールチップで伝え、常設ラベルを増やしません。Escと取消の意味は維持します。

削除確認の初期フォーカスは、並びがDelete → Cancelでも必ずCancelです。閉じるだけの通知では確定できません。Group競合の名前付き選択はそのまま維持し、非表示の共通Saveをショートカットで実行しません。フォームは最初の表示中入力にフォーカスし、入力がなければCancelに置きます。

| 利用先 | 確定操作と順序 | 維持する用途差 |
| --- | --- | --- |
| カンバン・リストのフォーカス中チケット | レーン → 移動 → キャンセル。Mで開く | 同ボードの1票だけ。リストの一括選択は変更しない。 |
| 共通UXフォーム | 入力 → 確定 → Cancel | 一括移動、別ボード移動、Group除去、言語変更の作用は既存のまま。 |
| 共通UX削除確認 | Delete → Cancel | Cancel初期フォーカス、事前検証、影響説明、非同期エラーを維持。 |
| 新規・全体編集 | Save → Cancel | 既存保存キーと未保存保護。 |
| 外部Issue取り込み | Import → Preview → Cancel | 有効なPreview後だけ取り込み可能。キーでPreviewを暗黙実行しない。 |
| 詳細本文・Task編集 | Save/Add → Cancel | 既存の対象欄だけの保存キーと下書き保護。 |
| コメント編集・行内削除確認 | Save/Delete → Cancel | 編集キーは該当コメントだけ。削除はCancel初期フォーカスで表示中確認内だけ確定。 |
| コメント投稿 | Add Comment | 既存の投稿欄内ショートカット。 |
| 閉じるだけの通知・Group競合 | Close・名前付き選択 | 共通submit非表示時のショートカット確定なし。 |

サイドバーの名前・タグ編集、メイン画面のカスタムビュー設定、更新者設定はダイアログではない行内フォームです。配置を確認し、既存のEnter・フォーカス離脱・保存操作を維持します。

代表回帰：`keyboard-lane-dialogs.spec.ts`、`ticket-editor-remote-import.spec.ts`、`groups.spec.ts`、`lane-deletion.spec.ts`、`create-keyboard.spec.ts`、`image-attachments.spec.ts`。
