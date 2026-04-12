# ダイアログボタンポリシー

SoloBoard の各ダイアログ下部に表示する操作ボタンの方針を定義します。

## 一覧

| ダイアログ | モード / 起点 | フッターボタン | 現在の並び | 備考 |
| --- | --- | --- | --- | --- |
| チケットダイアログ | 新規チケット | Cancel, Save | 右: Cancel, Save | チケット作成前なので破壊的操作はありません。 |
| チケットダイアログ | 既存チケット編集 | Delete, Cancel, Save | 左: Delete / 右: Cancel, Save | Archive / Restore はフッターではなくインライン操作です。 |
| チケットダイアログ | 既存チケット表示 | Add Comment | 右: Add Comment | Edit はダイアログモードを変えるヘッダー操作です。コメントの edit/delete はコメント行ごとの操作です。 |
| UX フォームダイアログ | New Board | Cancel, Create | 右: Cancel, Create | 共通の `requestFields` flow を使います。 |
| UX フォームダイアログ | New Lane | Cancel, Create | 右: Cancel, Create | 共通の `requestFields` flow を使います。 |
| UX フォームダイアログ | Rename Board | Cancel, Save | 右: Cancel, Save | 共通の `requestFields` flow を使います。 |
| UX フォームダイアログ | New Tag | Cancel, Create | 右: Cancel, Create | サイドバーとチケットエディタから使います。 |
| UX フォームダイアログ | Edit Tag | Delete, Cancel, Save | 左: Delete / 右: Cancel, Save | Submit と破壊的操作の両方があるため `requestFieldsAction` を使います。 |
| UX フォームダイアログ | Rename Lane | Cancel, Save | 右: Cancel, Save | 共通の `requestFields` flow を使います。 |
| UX フォームダイアログ | Edit Comment | Cancel, Save | 右: Cancel, Save | コメント行の操作から開きます。 |
| UX 確認ダイアログ | Delete Board | Cancel, Delete | 右: Cancel, Delete | 破壊的操作の確認です。 |
| UX 確認ダイアログ | Delete Lane | Cancel, Delete | 右: Cancel, Delete | 破壊的操作の確認です。 |
| UX 確認ダイアログ | Delete Ticket | Cancel, Delete | 右: Cancel, Delete | 破壊的操作の確認です。 |
| UX 確認ダイアログ | Delete Comment | Cancel, Delete | 右: Cancel, Delete | 破壊的操作の確認です。 |

## 方針

1. フッター操作は、リスクと確定操作の意味でグループ化します。
2. 追加確認なしで実行できる破壊的な副操作は左に置きます。
3. Cancel / dismiss 操作は右側グループに置き、確定操作の直前に配置します。
4. 確定操作は常にフッターの一番右に置きます。
5. 確認ダイアログは `Cancel` と破壊的な確定操作だけを右側に表示します。
6. ヘッダーの close button はダイアログを閉じるだけです。フッターの cancel button と意味を重複させません。
7. コメントの edit/delete や Archive/Restore のように一部の内容だけに作用するインライン操作は、フッターではなく対象コンテンツの近くに置きます。

## ボタンの意味

| 役割 | 配置 | スタイル | 例 |
| --- | --- | --- | --- |
| 主要な確定操作 | 一番右 | `.primary-action` | Save, Create, Add Comment |
| 副次的な取り消し | 右側グループ、主要操作の直前 | `.ghost` | Cancel |
| 即時の破壊的操作 | 左 | `.danger.action-with-icon` と trash icon | Edit Ticket / Edit Tag の Delete |
| 破壊的操作の確認 | 確認ダイアログの一番右 | `.danger.action-with-icon.danger-confirm-action` と trash icon | Delete Board, Delete Lane, Delete Ticket, Delete Comment |
| ヘッダー操作 | ヘッダー右 | icon button | チケット編集、ダイアログを閉じる |
| 対象範囲の小さいインライン操作 | 対象コンテンツの近く | icon または small ghost button | コメント edit/delete, Archive/Restore |

## 実装ルール

- フッターコンテナには `.editor-actions` を使います。
- 即時の破壊的操作は `.editor-actions` の direct child として配置します。
- Cancel と primary action は `.editor-actions-right` で包みます。
- Primary footer button が 1 つだけの場合も、直接 `.editor-actions` に置かず `.editor-actions-right` で包んで右寄せにします。
- Create、Save、その他の非破壊的な確定ボタンには `.primary-action` を付けます。
- Delete button には Lucide `trash-2` icon を表示します。
