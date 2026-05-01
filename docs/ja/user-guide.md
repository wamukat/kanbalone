# Kanbalone ユーザーガイド

Kanbalone は、ひとりの作業・小さなリリース計画・AI エージェントとの共同作業を、軽いカンバンで整理するためのツールです。

このガイドは、初めて使う時の流れに沿って説明します。

## 全体デモ

チケット作成、Markdown 本文の入力、タグの新規作成と追加、ドラッグアンドドロップ、検索、フィルタ、コメント、List 表示までの流れを短く確認できます。

![Kanbalone demo](../assets/kanbalone-demo.webp)

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

remote tracked ticket では、title は remote 由来の read-only 値になります。実装のために編集する本文は `Local Body` 側です。

Relations では、ブロッカー、親チケット、子チケットを編集できます。

詳細画面の `Move` で、チケットを別の board / lane へ移動できます。同名 tag は保持されます。別 board へ移動する場合、親子関係と blocker は解除されます。

![Ticket edit relations](../assets/user-guide/07-ticket-edit-relations.png)

## 7. コメントと履歴を見る

チケット詳細ではコメントを残せます。

`Activity` タブでは、コメント追加、更新、削除などの履歴を確認できます。

remote tracked ticket では、comment を remote issue に push できます。push に失敗した場合は、comment 上で失敗理由を確認できます。

![Ticket activity](../assets/user-guide/06-ticket-activity.png)

## 8. Remote Issue で作業する

Kanbalone では、GitHub Issues、GitLab、Redmine などの remote issue を取り込み、ローカルの実装ワークスペースとして扱えます。

現在の実装では、GitHub Issues、GitLab、Redmine を provider として使えます。

- remote は課題の正本
- Kanbalone は実装と作業ログのためのローカル作業面
- local body は AI や自分の実装用本文
- remote へ返すのは必要な comment だけ

![Remote issue を local execution workspace に変える概念図](../assets/remote-issue-workspace.svg)

### 8.1 Remote Issue を取り込む

新規チケット作成ダイアログ右上の import アイコンから、remote issue を取り込みます。このアイコンは remote provider credential が 1 つ以上設定されている場合だけ表示されます。

入力する項目:

- Provider
- Issue URL
- 登録先 Lane

panel には credential が設定された provider だけが表示されます。

ローカルで GitLab / Redmine を有効化したいときは、`KANBALONE_REMOTE_CREDENTIALS` を設定するか sandbox bootstrap を使います。

取り込み後は、remote issue が通常のチケットとして board に配置されます。

![Remote issue import panel](../assets/user-guide/15-remote-import-panel.png)

### 8.2 Remote チケットの見方

remote tracked ticket では、detail 上に remote ref が表示されます。

本文は `Local Body` / `Remote Body` の 2 面で扱います。

- `Local Body`
  実装方針、実装メモ、A-AI 向けの作業本文
- `Remote Body`
  remote issue から取り込んだ read-only snapshot

`Refresh` を使うと、remote 側の title / body / state を再取得できます。

![Remote tracked ticket with Local Body selected](../assets/user-guide/16-remote-ticket-detail-local.png)

### 8.3 Remote チケットで編集できるもの

編集できるもの:

- Local Body
- Lane / Priority
- Tags / Relations
- Comments

編集できないもの:

- Title
- Remote Body

remote issue の要件を書き換えたい場合は remote 側で修正し、必要になったら `Refresh` で取り込み直します。

![Remote tracked ticket with Remote Body selected](../assets/user-guide/17-remote-ticket-detail-remote.png)

### 8.4 コメントを Remote に反映する

comment は最初に local comment として保存されます。

必要なものだけ `Push to remote` で remote issue に反映します。

comment の状態:

- `Push to remote`
  まだ local only
- `Pushed`
  remote に反映済み
- `Push failed`
  remote 反映に失敗。クリックすると詳細を確認可能

![Remote comment push states in the ticket detail view](../assets/user-guide/18-remote-comment-push.png)

push 済み comment は、MVP では編集・削除できません。修正が必要な場合は新しい comment を追加して再 push します。

### 8.5 Remote の更新を取り込む

`Refresh` は、remote 側の変更を local snapshot に取り込むための操作です。

更新されるもの:

- remote title
- remote body
- remote state

更新されないもの:

- local body
- local comments
- lane / priority / tags / relations

つまり、要件の正本は remote に残しつつ、Kanbalone 側では実装本文を独立して育てます。

## 9. チケットを完了・整理する

終わった作業は Resolved にできます。Done レーンへ移動することもできます。

もう普段見る必要がないチケットは Archive できます。Archived チケットは通常のボードから隠れます。

アーカイブ済みチケットを表示したい時は、タグフィルタの右にある `Status >` を開き、`Archived` を追加します。`Resolved` も同じメニューから追加できます。条件を解除したい時は、フィルタ内の `x` アイコンを押します。

![Archived filter](../assets/user-guide/11-archived-filter.png)

## 10. チケットを探す

検索フィールドでは、キーワード、チケット番号でチケットを絞り込めます。

- `login` のようなキーワードでタイトルと本文を検索
- `#123` や `123` でチケット番号を検索

優先度で絞り込みたい場合は、フィルタ領域の `Priority >` を開きます。Low / Medium / High / Urgent を複数選択できます。

検索欄に入力がある時は、右端の `x` で検索条件を消せます。

![Search clear button](../assets/user-guide/14-search-clear.png)

## 11. タグで分類する

タグフィルタを使うと、特定テーマのチケットだけを表示できます。

タグはサイドバーの Tags セクションにある `+` から作成できます。色は後からタグバッジをクリックして編集できます。

チケット編集中に新しいタグが必要になった場合は、Tags の入力欄に名前を入れて `+` を押すと、色なしタグとして作成されます。

![Tag filter](../assets/user-guide/10-tag-filter.png)

## 12. リスト表示でまとめて整理する

サイドバーの `List` に切り替えると、チケットを表形式で確認できます。

List 表示では、Resolved / Archive 状態や優先度を一覧で確認できます。

![List view](../assets/user-guide/08-list-view.png)

List 表示でチェックを入れると、選択したチケットに対する一括操作が表示されます。

複数チケットをまとめて Resolved にする、Open に戻す、Archive / Restore する、といった操作ができます。

![List bulk actions](../assets/user-guide/09-list-bulk-actions.png)

## 13. ボード設定を使う

ボード名の変更、Export / Import、Delete は、サイドバー下部の歯車から開きます。

歯車を開くと現在のボード名が表示されます。ボード名の横にあるペンアイコンをクリックすると、ボード名をその場で編集できます。入力後に Enter で保存し、Esc またはフォーカス移動でキャンセルできます。

![Board settings](../assets/user-guide/12-board-settings.png)

## 14. ダークモード

Kanbalone にはアプリ内の Light / Dark 切り替えボタンはありません。

OS やブラウザの外観設定がダークモードの場合、自動的にダークテーマで表示されます。

![Dark mode](../assets/user-guide/13-dark-mode.png)

## Docker で試す

```bash
docker run --rm \
  -p 3000:3000 \
  -v kanbalone-data:/app/data \
  ghcr.io/wamukat/kanbalone:v0.9.26
```

ブラウザで開きます。

```text
http://127.0.0.1:3000
```

データは `/app/data/kanbalone.sqlite` に保存されます。Docker の named volume を使うと、コンテナを作り直してもデータを残せます。

Kanbalone には認証機能はありません。信頼できないネットワークへ直接公開しないでください。
