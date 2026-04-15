# SoloBoard ユーザーガイド

SoloBoard は、ひとりの作業・小さなリリース計画・AI エージェントとの共同作業を、軽いカンバンで整理するためのツールです。

このガイドは、初めて使う時の流れに沿って説明します。

## 1. 最初のボードを作る

左上の `+` を押すと、ボード名の入力欄が表示されます。

ボード名を入力して Enter を押すと、最初のボードが作成されます。

![Initial empty board](../assets/user-guide/00-initial-empty-board.png)

![Inline board create](../assets/user-guide/02-inline-board-create.png)

## 2. 画面の基本を知る

ボードを作成すると、作業画面が表示されます。

左側のサイドバーでボードを選び、中央の Kanban でチケットを動かします。サイドバーの `Kanban` / `List` で表示を切り替えられます。

![Kanban overview](../assets/user-guide/01-kanban-overview.png)

## 3. レーンを用意する

ボード下部の `+` からレーンを追加できます。名前を入力して Enter を押すと追加されます。

レーン名の変更や削除は、各レーン右上のアクションボタンから行えます。

![Inline lane create](../assets/user-guide/03-inline-lane-create.png)

## 4. チケットを作る

各レーンの `+` からチケットを作成します。

タイトルと本文を入力します。Lane / Priority、Tags、Relations も設定できます。

入力できる主な項目:

- タイトル
- Markdown で書ける本文
- Lane / Priority
- Tags
- Relations

Relations では、ブロッカーや親チケットを設定できます。

![Ticket create dialog](../assets/user-guide/04-ticket-create-dialog.png)

## 5. チケットを読む

チケットをクリックすると詳細画面が開きます。

詳細画面では、本文、関係、コメント、アクティビティを確認できます。

![Ticket detail comments](../assets/user-guide/05-ticket-detail-comments.png)

## 6. チケットを編集する

詳細画面右上のペンアイコンで編集できます。

編集画面では、Lane / Priority / Resolved、Tags、Relations、本文などを変更できます。

Relations では、ブロッカー、親チケット、子チケットを編集できます。

![Ticket edit relations](../assets/user-guide/07-ticket-edit-relations.png)

## 7. コメントと履歴を見る

チケット詳細ではコメントを残せます。

`Activity` タブでは、コメント追加、更新、削除などの履歴を確認できます。

![Ticket activity](../assets/user-guide/06-ticket-activity.png)

## 8. チケットを完了・整理する

終わった作業は Resolved にできます。Done レーンへ移動することもできます。

もう普段見る必要がないチケットは Archive できます。Archived チケットは通常のボードから隠れます。

アーカイブ済みチケットを表示したい時は、タグフィルタの右にある `Status >` を開き、`Archived` を追加します。`Resolved` も同じメニューから追加できます。条件を解除したい時は、フィルタ内の `x` アイコンを押します。

![Archived filter](../assets/user-guide/11-archived-filter.png)

## 9. チケットを探す

検索フィールドでは、キーワード、チケット番号でチケットを絞り込めます。

- `login` のようなキーワードでタイトルと本文を検索
- `#123` や `123` でチケット番号を検索

優先度で絞り込みたい場合は、フィルタ領域の `Priority >` を開きます。Low / Medium / High / Urgent を複数選択できます。

検索欄に入力がある時は、右端の `x` で検索条件を消せます。

![Search clear button](../assets/user-guide/14-search-clear.png)

## 10. タグで分類する

タグフィルタを使うと、特定テーマのチケットだけを表示できます。

タグはサイドバーの Tags セクションにある `+` から作成できます。色は後からタグバッジをクリックして編集できます。

チケット編集中に新しいタグが必要になった場合は、Tags の入力欄に名前を入れて `+` を押すと、色なしタグとして作成されます。

![Tag filter](../assets/user-guide/10-tag-filter.png)

## 11. リスト表示でまとめて整理する

サイドバーの `List` に切り替えると、チケットを表形式で確認できます。

List 表示では、Resolved / Archive 状態や優先度を一覧で確認できます。

![List view](../assets/user-guide/08-list-view.png)

List 表示でチェックを入れると、選択したチケットに対する一括操作が表示されます。

複数チケットをまとめて Resolved にする、Open に戻す、Archive / Restore する、といった操作ができます。

![List bulk actions](../assets/user-guide/09-list-bulk-actions.png)

## 12. ボード設定を使う

ボード名の変更、Export / Import、Delete は、サイドバー下部の歯車から開きます。

歯車を開くと現在のボード名が表示されます。ボード名の横にあるペンアイコンでボード名を変更できます。

![Board settings](../assets/user-guide/12-board-settings.png)

## 13. ダークモード

SoloBoard にはアプリ内の Light / Dark 切り替えボタンはありません。

OS やブラウザの外観設定がダークモードの場合、自動的にダークテーマで表示されます。

![Dark mode](../assets/user-guide/13-dark-mode.png)

## Docker で試す

```bash
docker run --rm \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:v0.9.10
```

ブラウザで開きます。

```text
http://127.0.0.1:3000
```

データは `/app/data/soloboard.sqlite` に保存されます。Docker の named volume を使うと、コンテナを作り直してもデータを残せます。

SoloBoard には認証機能はありません。信頼できないネットワークへ直接公開しないでください。
