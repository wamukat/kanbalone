# SoloBoard ユーザーガイド

SoloBoard は、ひとりの作業・小さなリリース計画・AI エージェントとの共同作業を、軽いカンバンで整理するためのツールです。

このガイドは、初めて起動した人がそのまま使い始められる順序で説明します。

## 1. 最初のボードを作る

最初に使う操作は、左上の `+` だけです。`Create board here` の案内に従って `+` を押すと、ボード名を入力する欄がその場に表示されます。

ボード名を入力して Enter を押すと、最初のボードが作成されます。

![Initial empty board](../assets/user-guide/00-initial-empty-board.png)

## 2. 画面の基本を知る

ボードを作成すると、通常の作業画面が表示されます。

左側のサイドバーでボードを選び、中央の Kanban でチケットを動かします。サイドバーでは `Kanban` と `List` を切り替えられます。

![Kanban overview](../assets/user-guide/01-kanban-overview.png)

## 3. レーンを用意する

ボード下部の `+` からレーンを追加できます。ボード作成と同じように、その場で名前を入力して Enter で確定します。

最初は `Backlog`、`In Progress`、`Review`、`Done` のようなシンプルなレーンで十分です。後から追加や名前変更もできます。

レーン名の変更や削除は、各レーン右上のアクションボタンから開けます。普段使わない操作は少し奥に置いてあるので、ボードを見る時のノイズが少なくなります。

![Inline lane create](../assets/user-guide/03-inline-lane-create.png)

## 4. チケットを作る

各レーンの `+` からチケットを作成します。

まずはタイトルと本文だけでも始められます。必要に応じて Lane / Priority、Tags、Relations を設定してください。

入力できる主な項目:

- タイトル
- Markdown で書ける本文
- Lane / Priority
- Tags
- Relations

Relations では、ブロッカーや親チケットを設定できます。新規作成時から関係を入れておくと、後で詳細画面を開いた時に文脈を追いやすくなります。

![Ticket create dialog](../assets/user-guide/04-ticket-create-dialog.png)

## 5. チケットを読む

チケットをクリックすると詳細画面が開きます。

詳細画面では、本文、関係、コメント、アクティビティを確認できます。長いチケットでもダイアログ内だけに小さなスクロールバーを出さず、ページ全体で自然にスクロールできます。

![Ticket detail comments](../assets/user-guide/05-ticket-detail-comments.png)

## 6. チケットを編集する

詳細画面右上のペンアイコンで編集できます。

編集画面では、Lane / Priority / Done が同じ行に並びます。Done はレーンとは別の状態なので、「Done レーンにいるか」と「Resolved になっているか」を分けて扱えます。

Relations では、ブロッカー、親チケット、子チケットを編集できます。

![Ticket edit relations](../assets/user-guide/07-ticket-edit-relations.png)

## 7. コメントと履歴を見る

チケット詳細ではコメントを残せます。作業メモ、確認結果、AI エージェントへの指示などをチケットに残しておくと、後から文脈を追いやすくなります。

`Activity` タブでは、コメント追加、更新、削除などの履歴を確認できます。

あとから「いつ何が変わったか」を追えるので、ひとり作業でもリリース前の確認がしやすくなります。

![Ticket activity](../assets/user-guide/06-ticket-activity.png)

## 8. チケットを完了・整理する

終わった作業は Resolved にします。必要に応じて Done レーンへ移動してください。

もう普段見る必要がないチケットは Archive できます。Archived チケットは通常のボードから隠れるので、今見るべき作業に集中できます。

必要な時は、タグフィルタの右にある `Archived` を押すと、アーカイブ済みチケットも表示されます。

![Archived filter](../assets/user-guide/11-archived-filter.png)

## 9. チケットを探す

検索フィールドでは、キーワード、チケット番号、priority を使ってチケットを絞り込めます。

- `login` のようなキーワードでタイトルと本文を検索
- `#123` や `123` でチケット番号を検索
- `priority:3` で Priority 3 のチケットだけを表示

## 10. タグで分類する

タグフィルタを使うと、特定テーマのチケットだけを表示できます。

ドキュメント、リリース、バグ、AI エージェント向け作業など、関心ごとをタグにしておくと、ボードが育ってきても見通しを保てます。

![Tag filter](../assets/user-guide/10-tag-filter.png)

## 11. リスト表示でまとめて整理する

サイドバーの `List` に切り替えると、チケットを表形式で確認できます。

カンバンよりも一覧性が高いので、優先度順に見たい時、Resolved / Archive 状態をまとめて確認したい時に便利です。

![List view](../assets/user-guide/08-list-view.png)

List 表示でチェックを入れると、選択したチケットに対する一括操作が表示されます。

たとえば、複数チケットをまとめて Resolved にする、Open に戻す、Archive / Restore する、といった操作ができます。

![List bulk actions](../assets/user-guide/09-list-bulk-actions.png)

## 12. ボード設定を使う

ボード名の変更、Export / Import、Delete は、サイドバー下部の歯車から開きます。

普段は隠れているので、毎日の作業ではボードとチケットに集中できます。バックアップや移行をしたい時だけ開きます。

![Board settings](../assets/user-guide/12-board-settings.png)

## おすすめの使い方

1. リリースや個人プロジェクトごとにボードを作る。
2. `Backlog`、`In Progress`、`Review`、`Done` のようなシンプルなレーンから始める。
3. まずはタイトルと本文だけでチケットを作る。
4. 作業が増えてきたらタグを使う。
5. 詰まっている作業は Blockers に入れる。
6. 大きい作業は Parent / Children で分ける。
7. 週末やリリース前に List 表示でまとめて整理する。
8. 終わった作業は Resolved にし、もう見なくてよいものは Archive する。

## Docker で試す

```bash
docker run --rm \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:v0.9.7
```

ブラウザで開きます。

```text
http://127.0.0.1:3000
```

データは `/app/data/soloboard.sqlite` に保存されます。Docker の named volume を使うと、コンテナを作り直してもデータを残せます。

SoloBoard には認証機能はありません。信頼できないネットワークへ直接公開しないでください。
