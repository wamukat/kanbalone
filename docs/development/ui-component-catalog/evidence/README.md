# 実画面とブラウザー実測値

基準コミットは `2ff8489d889706a6dc6392fd28aeff073e0b515c` です。実行したビルドは234の製品ソースファイルのSHA-256を基準コミットの作業ツリーと照合しました。撮影日は2026年11月24日です。現状の棚卸しのため、撮影時に製品UIを変更していません。

日本語は1440 × 900 pxの明暗、英語は1050 × 900 pxのライトを表示しました。画素比は1です。ブラウザーはChrome 158系のHeadless Chromiumです。全115フレームの実測値と原画像109枚を記録しました。[フレーム・ハッシュ・環境の一覧](manifest.json)

## 再現条件

次回の採取には、合成データの準備、実DOM計測、前後比較とカタログ更新をまとめた[再採集手順](reproduce.md)を使えます。

- 新規のSQLite DBをlocalhostだけで起動し、空のホームとボード名入力を撮影します。その後は合成4ボードのデータを使用します。
- 基幹画面の例は Design Studio の Intake、Production、Review、Done レーンを使用します。完了の親、未完了と完了の子、アーカイブ済みの親、未所属の課題、複数タグ、優先度、本文と添付、コメント、ブロッカーと関連先を用意します。
- Publishing は同じ保存ビュー内の二番目のボードです。Empty board は既存の空ボードです。Windowing sample は1010件を登録し、カンバンとグループの仮想表示、保存ビューのページ境界に使います。
- 保存ビューは Release desk、Unavailable lane、Paged review です。Unavailable lane は選択済みのレーンを合成DBで削除して作ります。
- リモートのプレビューとエラー、リンク済み課題、本文の差分、コメントの同期状態は別の合成DBで確認しました。同じUIビルドのサーバーに決められた結果を返すアダプターを渡しています。外部サービスや実アカウントは使っていません。
- 下表の状態名と説明に従い、各画面の検索・選択・入力を再現できます。設定変更の確認には合成DBのみを使いました。

## 実測値の読み方

各JSONの `properties` にCSSプロパティ名、`styles` に同じ順序の値があります。`elements[n].style` が参照する `styles` の行を読んでください。位置と寸法は `rect` の左・上・幅・高さです。`key` はそのフレームのDOMセレクターで、`parentKey` は親のセレクターです。画面別一覧の要素IDは観測対応表から照合できます。一部フレームの `selectorMatches` は棚卸しのソースセレクターを実DOMに適用した一致結果です。

`states` は実際に観察したhover、focus、focus-visible、checked、indeterminate、disabledと、ARIA属性を記録します。`pseudo` は生成されている前後の擬似要素、`backdrop` はネイティブモーダルの計算値です。一部フレームはbody要素自身を計測範囲に含めていません。チケット詳細とコメント操作の画面ではbodyの疑似要素も採取しました。表示領域との交差は座標の判定です。クリップされた子要素、背後のレイヤー、inertの要素は、交差していても見える・操作できるとは限りません。可視の判断には実画像も使ってください。

Nativeなinput、select、textarea、progressは `nativeControl` で識別できます。OS固有のポップアップやチェックマーク・カラーウェルは、要素のCSS計算値と描画が一致しないことがあります。ここではWebページ内の表示とDOMの計算値を記録しています。

## 観察例

- 英語のカスタムビューを幅1050 pxで並べ替えると、保存と元に戻す操作が2行目に折り返されました。この状態で一覧パネルの `scrollWidth` と `clientWidth` はともに727 pxです。[原画像](images/en-light-custom-view-narrow-sort.png) [実測値](styles/en-light-custom-view-narrow-sort.json)
- リモート取り込みのリンク投稿チェックボックスは、幅467 pxの入力要素の中央に描画され、文言は次の行に表示されました。エラー発生時のフォームで観察しています。[原画像](images/ja-dark-remote-import-preview-error.png) [実測値](styles/ja-dark-remote-import-preview-error.json)
- 大きなグループでは、初期状態でDOMにない課題が検索後に表示され、ハイライトと検索結果の件数が出ました。[検索前](images/ja-dark-group-window.png) [検索後](images/ja-dark-group-window-search.png) [実測値](styles/ja-dark-group-window-search.json)

## 未観察の状態

- OSのファイル選択、カラーピッカーとselectの展開面、タッチ操作、強制色、他ブラウザーでの表示。
- ドラッグ中のネイティブゴースト、読み込み中の全遷移、通信遅延や並行更新ごとの保存失敗・復旧、破壊的操作を確定した後の状態。
- リモートの実接続上の認証、バックリンク投稿、同期に要する時間。

## 画面別フレーム

各項目は独立した画面・状態です。同じ役割の部品の統合やスタイル差の判定は含みません。


### home

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `no-board` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-home-no-board.png) | [JSON](styles/ja-dark-home-no-board.json) | Fresh database with no board. |
| `no-board` | ja / light / 1440 × 900 | [PNG](images/ja-light-home-no-board.png) | [JSON](styles/ja-light-home-no-board.json) | Fresh database with no board. |

### shell

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `collapsed` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-shell-collapsed.png) | [JSON](styles/ja-dark-shell-collapsed.json) | Collapsed sidebar, board title and reopen control. |
| `collapsed` | ja / light / 1440 × 900 | [PNG](images/ja-light-shell-collapsed.png) | [JSON](styles/ja-light-shell-collapsed.json) | Collapsed sidebar, board title and reopen control. |
| `filter-keyboard` | ja / dark / 1440 × 900 | 実測のみ | [JSON](styles/ja-dark-shell-filter-keyboard.json) | Tab from search into the filter controls. |
| `filter-keyboard` | ja / light / 1440 × 900 | [PNG](images/ja-light-shell-filter-keyboard.png) | [JSON](styles/ja-light-shell-filter-keyboard.json) | Tab from search into the filter controls. |
| `new-board` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-shell-new-board.png) | [JSON](styles/ja-dark-shell-new-board.json) | Create board inline. Name field focused by keyboard. |
| `new-board` | ja / light / 1440 × 900 | [PNG](images/ja-light-shell-new-board.png) | [JSON](styles/ja-light-shell-new-board.json) | Create board inline. Name field focused by keyboard. |

### kanban

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `board` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-kanban-board.png) | [JSON](styles/ja-dark-kanban-board.json) | Active board with lanes, ticket cards, priority and tags. |
| `board` | ja / light / 1440 × 900 | [PNG](images/ja-light-kanban-board.png) | [JSON](styles/ja-light-kanban-board.json) | Active board with lanes, ticket cards, priority and tags. |
| `empty-lane` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-kanban-empty-lane.png) | [JSON](styles/ja-dark-kanban-empty-lane.json) | An existing empty board with one lane and its create controls. |
| `hover-card` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-kanban-hover-card.png) | [JSON](styles/ja-dark-kanban-hover-card.json) | First ticket title hovered with the pointer. |
| `hover-card` | ja / light / 1440 × 900 | 実測のみ | [JSON](styles/ja-light-kanban-hover-card.json) | First ticket title hovered with the pointer. |
| `lane-actions` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-kanban-lane-actions.png) | [JSON](styles/ja-dark-kanban-lane-actions.json) | Lane action menu showing rename and delete icon buttons. |
| `lane-create` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-kanban-lane-create.png) | [JSON](styles/ja-dark-kanban-lane-create.json) | Inline new-lane column. |
| `lane-rename` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-kanban-lane-rename.png) | [JSON](styles/ja-dark-kanban-lane-rename.json) | Lane rename inline form and focused text field. |
| `window` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-kanban-window.png) | [JSON](styles/ja-dark-kanban-window.json) | Large synthetic lane uses the virtual card window, with only mounted cards measured. |

### list

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `board` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-list-board.png) | [JSON](styles/ja-dark-list-board.json) | Default List with headers, sort, hierarchy, checkboxes and badges. |
| `board` | ja / light / 1440 × 900 | [PNG](images/ja-light-list-board.png) | [JSON](styles/ja-light-list-board.json) | Default List with headers, sort, hierarchy, checkboxes and badges. |
| `bulk-selection` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-list-bulk-selection.png) | [JSON](styles/ja-dark-list-bulk-selection.json) | One ticket checked. Bulk action controls shown. |
| `bulk-selection` | ja / light / 1440 × 900 | [PNG](images/ja-light-list-bulk-selection.png) | [JSON](styles/ja-light-list-bulk-selection.json) | One ticket checked. Bulk action controls shown. |
| `filtered-empty` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-list-filtered-empty.png) | [JSON](styles/ja-dark-list-filtered-empty.json) | List search with zero matches, clear and reset recovery. |
| `status-filter-expanded` | en / light / 1050 × 900 | [PNG](images/en-light-list-status-filter-expanded.png) | [JSON](styles/en-light-list-status-filter-expanded.json) | English narrower desktop check with status controls expanded. |

### group

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `archive-visible` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-group-archive-visible.png) | [JSON](styles/ja-dark-group-archive-visible.json) | Archived ticket within a Group after expanding archive visibility. |
| `completed-empty` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-group-completed-empty.png) | [JSON](styles/ja-dark-group-completed-empty.json) | Inactive completed Group selected from All, then Open only enabled. |
| `narrow` | en / light / 1050 × 900 | [PNG](images/en-light-group-narrow.png) | [JSON](styles/en-light-group-narrow.json) | English Group toolbar and sticky controls at 1050 px. |
| `open-only` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-group-open-only.png) | [JSON](styles/ja-dark-group-open-only.json) | Open only enabled. Resolved and archived parents appear as non-interactive context. |
| `open-only` | ja / light / 1440 × 900 | [PNG](images/ja-light-group-open-only.png) | [JSON](styles/ja-light-group-open-only.json) | Open only enabled. Resolved and archived parents appear as non-interactive context. |
| `selected` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-group-selected.png) | [JSON](styles/ja-dark-group-selected.json) | A Group with Markdown description, membership, progress and archive controls. |
| `selected` | ja / light / 1440 × 900 | [PNG](images/ja-light-group-selected.png) | [JSON](styles/ja-light-group-selected.json) | A Group with Markdown description, membership, progress and archive controls. |
| `ungrouped` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-group-ungrouped.png) | [JSON](styles/ja-dark-group-ungrouped.json) | Unassigned-ticket pseudo-group with its own toolbar. |
| `window` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-group-window.png) | [JSON](styles/ja-dark-group-window.json) | Large group uses the virtual ticket window and separate window search. |
| `window-search` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-group-window-search.png) | [JSON](styles/ja-dark-group-window-search.json) | Search for a row near the end of the large Group. |

### custom-view

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `expanded-excerpt` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-expanded-excerpt.png) | [JSON](styles/ja-dark-custom-view-expanded-excerpt.json) | Body expanded in place; the full original text has been fetched. |
| `missing-and-empty` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-missing-and-empty.png) | [JSON](styles/ja-dark-custom-view-missing-and-empty.json) | Deleted selected lane shows the warning with a zero-result list. |
| `narrow-sort` | en / light / 1050 × 900 | [PNG](images/en-light-custom-view-narrow-sort.png) | [JSON](styles/en-light-custom-view-narrow-sort.json) | Long English sorting label with Save and Revert at 1050 px. |
| `page-first` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-page-first.png) | [JSON](styles/ja-dark-custom-view-page-first.json) | First page of a large view with previous disabled and next enabled. |
| `page-next` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-page-next.png) | [JSON](styles/ja-dark-custom-view-page-next.json) | A following page with first result keyboard-focused. |
| `saved` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-saved.png) | [JSON](styles/ja-dark-custom-view-saved.json) | Saved view with lane and tag conditions, text excerpts and sort control. |
| `saved` | ja / light / 1440 × 900 | [PNG](images/ja-light-custom-view-saved.png) | [JSON](styles/ja-light-custom-view-saved.json) | Saved view with lane and tag conditions, text excerpts and sort control. |
| `sort-temporary` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-sort-temporary.png) | [JSON](styles/ja-dark-custom-view-sort-temporary.json) | Temporary priority order with Save display settings and Revert. |
| `unavailable` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-unavailable.png) | [JSON](styles/ja-dark-custom-view-unavailable.json) | A synthetic missing saved-view route. |

### custom-view-settings

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `create` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-settings-create.png) | [JSON](styles/ja-dark-custom-view-settings-create.json) | New view form. Unconfigured board lane modes are disabled. |
| `create` | ja / light / 1440 × 900 | [PNG](images/ja-light-custom-view-settings-create.png) | [JSON](styles/ja-light-custom-view-settings-create.json) | New view form. Unconfigured board lane modes are disabled. |
| `edit` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-custom-view-settings-edit.png) | [JSON](styles/ja-dark-custom-view-settings-edit.json) | Existing view with two boards and selected-lane checkboxes. |
| `edit` | ja / light / 1440 × 900 | [PNG](images/ja-light-custom-view-settings-edit.png) | [JSON](styles/ja-light-custom-view-settings-edit.json) | Existing view with two boards and selected-lane checkboxes. |
| `narrow` | en / light / 1050 × 900 | [PNG](images/en-light-custom-view-settings-narrow.png) | [JSON](styles/en-light-custom-view-settings-narrow.json) | English heading and helper text wrapping at 1050 px. |

### ticket-new

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `blank` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-new-blank.png) | [JSON](styles/ja-dark-ticket-new-blank.json) | New ticket started from a lane. Local write has not been submitted. |
| `blank` | ja / light / 1440 × 900 | [PNG](images/ja-light-ticket-new-blank.png) | [JSON](styles/ja-light-ticket-new-blank.json) | New ticket started from a lane. Local write has not been submitted. |

### ticket-edit

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `form` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-edit-form.png) | [JSON](styles/ja-dark-ticket-edit-form.json) | Existing ticket full edit form. |
| `form` | ja / light / 1440 × 900 | [PNG](images/ja-light-ticket-edit-form.png) | [JSON](styles/ja-light-ticket-edit-form.json) | Existing ticket full edit form. |

### ticket-detail

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `body` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-detail-body.png) | [JSON](styles/ja-dark-ticket-detail-body.json) | Direct ticket view with Markdown, image, status and relationships. |
| `body` | ja / light / 1440 × 900 | [PNG](images/ja-light-ticket-detail-body.png) | [JSON](styles/ja-light-ticket-detail-body.json) | Direct ticket view with Markdown, image, status and relationships. |
| `remote-diff` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-detail-remote-diff.png) | [JSON](styles/ja-dark-ticket-detail-remote-diff.json) | Local body and simulated remote body diff. |
| `remote-local` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-detail-remote-local.png) | [JSON](styles/ja-dark-ticket-detail-remote-local.json) | Linked issue from the isolated simulated adapter; the local body is selected. |
| `remote-snapshot` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-detail-remote-snapshot.png) | [JSON](styles/ja-dark-ticket-detail-remote-snapshot.json) | Read-only body from the simulated remote snapshot. |

### ticket-inline

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `body` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-inline-body.png) | [JSON](styles/ja-dark-ticket-inline-body.json) | Inline Markdown body editing within the ticket detail. |
| `priority` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-inline-priority.png) | [JSON](styles/ja-dark-ticket-inline-priority.json) | Quick priority editing alongside ticket metadata. |
| `title` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-inline-title.png) | [JSON](styles/ja-dark-ticket-inline-title.json) | Quick title editing inside the detail header. |

### ticket-comments

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `compose` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-comments-compose.png) | [JSON](styles/ja-dark-ticket-comments-compose.json) | Comment composer and chronological existing comments. |
| `compose` | ja / light / 1440 × 900 | [PNG](images/ja-light-ticket-comments-compose.png) | [JSON](styles/ja-light-ticket-comments-compose.json) | Comment composer and chronological existing comments. |
| `delete-confirm` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-comments-delete-confirm.png) | [JSON](styles/ja-dark-ticket-comments-delete-confirm.json) | Inline comment-delete guard, then cancelled. |
| `edit` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-comments-edit.png) | [JSON](styles/ja-dark-ticket-comments-edit.json) | Existing local comment inline edit form. |
| `remote-sync` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-comments-remote-sync.png) | [JSON](styles/ja-dark-ticket-comments-remote-sync.json) | Deterministic pushed/failed status. Expanded failure details, retry control and read-only pushed comment. |

### ticket-activity

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `history` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-ticket-activity-history.png) | [JSON](styles/ja-dark-ticket-activity-history.json) | Activity selected. Local ticket history and timestamps. |
| `history` | ja / light / 1440 × 900 | [PNG](images/ja-light-ticket-activity-history.png) | [JSON](styles/ja-light-ticket-activity-history.json) | Activity selected. Local ticket history and timestamps. |

### picker-tags

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `options` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-picker-tags-options.png) | [JSON](styles/ja-dark-picker-tags-options.json) | Tag picker on an existing ticket with a typed search. |
| `options` | ja / light / 1440 × 900 | [PNG](images/ja-light-picker-tags-options.png) | [JSON](styles/ja-light-picker-tags-options.json) | Tag picker on an existing ticket with a typed search. |

### picker-relations

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `ticket-options` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-picker-relations-ticket-options.png) | [JSON](styles/ja-dark-picker-relations-ticket-options.json) | Relationship search with candidate tickets. |
| `ticket-options` | ja / light / 1440 × 900 | [PNG](images/ja-light-picker-relations-ticket-options.png) | [JSON](styles/ja-light-picker-relations-ticket-options.json) | Relationship search with candidate tickets. |
| `type-menu` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-picker-relations-type-menu.png) | [JSON](styles/ja-dark-picker-relations-type-menu.json) | Relation type menu in the editor. |
| `type-menu` | ja / light / 1440 × 900 | [PNG](images/ja-light-picker-relations-type-menu.png) | [JSON](styles/ja-light-picker-relations-type-menu.json) | Relation type menu in the editor. |

### settings-board

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `completion-review` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-board-completion-review.png) | [JSON](styles/ja-dark-settings-board-completion-review.json) | Review the nonzero reopening impact before applying, then cancel. |
| `completion-selection` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-board-completion-selection.png) | [JSON](styles/ja-dark-settings-board-completion-selection.json) | Completion-lane checkboxes in the board settings. Save disabled before changes. |
| `expanded` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-board-expanded.png) | [JSON](styles/ja-dark-settings-board-expanded.json) | Sidebar board settings with language, names, lanes and data operations. |
| `expanded` | ja / light / 1440 × 900 | [PNG](images/ja-light-settings-board-expanded.png) | [JSON](styles/ja-light-settings-board-expanded.json) | Sidebar board settings with language, names, lanes and data operations. |
| `rename` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-board-rename.png) | [JSON](styles/ja-dark-settings-board-rename.json) | Inline board name edit. Keyboard focus inside the gear panel. |

### settings-tags

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `color-edit` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-tags-color-edit.png) | [JSON](styles/ja-dark-settings-tags-color-edit.json) | Colored tag edit form including text, enabled toggle and native color input. |
| `create` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-tags-create.png) | [JSON](styles/ja-dark-settings-tags-create.json) | New tag inline entry, with its keyboard focus. |
| `create` | ja / light / 1440 × 900 | [PNG](images/ja-light-settings-tags-create.png) | [JSON](styles/ja-light-settings-tags-create.json) | New tag inline entry, with its keyboard focus. |
| `delete-confirm` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-tags-delete-confirm.png) | [JSON](styles/ja-dark-settings-tags-delete-confirm.json) | Inline tag deletion confirmation. |

### settings-group

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `add-disabled` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-group-add-disabled.png) | [JSON](styles/ja-dark-settings-group-add-disabled.json) | Membership search before selection. Add button is disabled. |
| `create` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-group-create.png) | [JSON](styles/ja-dark-settings-group-create.json) | Inline Group creation form, with the name focused. |
| `description` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-group-description.png) | [JSON](styles/ja-dark-settings-group-description.json) | Markdown source editor for a Group description. |
| `description-preview` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-group-description-preview.png) | [JSON](styles/ja-dark-settings-group-description-preview.json) | Rendered Group Markdown preview. |
| `member-candidates` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-group-member-candidates.png) | [JSON](styles/ja-dark-settings-group-member-candidates.json) | Add existing tickets search with keyboard highlighted candidate. |
| `rename` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-settings-group-rename.png) | [JSON](styles/ja-dark-settings-group-rename.json) | Group rename field and Save/Cancel actions. |
| `rename` | ja / light / 1440 × 900 | [PNG](images/ja-light-settings-group-rename.png) | [JSON](styles/ja-light-settings-group-rename.json) | Group rename field and Save/Cancel actions. |

### remote-import

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `drawer` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-remote-import-drawer.png) | [JSON](styles/ja-dark-remote-import-drawer.json) | Isolated simulated external adapter. Provider switch, issue URL, lane and backlink option. |
| `duplicate` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-remote-import-duplicate.png) | [JSON](styles/ja-dark-remote-import-duplicate.json) | The simulated issue is already linked. The Import button is disabled. |
| `preview` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-remote-import-preview.png) | [JSON](styles/ja-dark-remote-import-preview.json) | Successful preview from the deterministic simulated adapter. |
| `preview-error` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-remote-import-preview-error.png) | [JSON](styles/ja-dark-remote-import-preview-error.json) | The simulated adapter returned a controlled failure. |

### dialogs

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `board-delete` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-dialogs-board-delete.png) | [JSON](styles/ja-dark-dialogs-board-delete.json) | Delete board confirmation. No deletion performed. |
| `bulk-delete` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-dialogs-bulk-delete.png) | [JSON](styles/ja-dark-dialogs-bulk-delete.json) | Destructive List action confirmation, cancelled in the fixture. |
| `bulk-move` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-dialogs-bulk-move.png) | [JSON](styles/ja-dark-dialogs-bulk-move.json) | Move selected List tickets. Destination selectors and actions. |
| `bulk-move` | ja / light / 1440 × 900 | [PNG](images/ja-light-dialogs-bulk-move.png) | [JSON](styles/ja-light-dialogs-bulk-move.json) | Move selected List tickets. Destination selectors and actions. |
| `discard-draft` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-dialogs-discard-draft.png) | [JSON](styles/ja-dark-dialogs-discard-draft.json) | Unsaved body guard from dismissing the ticket. No data saved. |
| `group-remove-family` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-dialogs-group-remove-family.png) | [JSON](styles/ja-dark-dialogs-group-remove-family.json) | Group membership removal preview for a related family, then cancel. |

### toast

| 状態 | 環境 | 原画像 | 実測値 | 観察した内容 |
| --- | --- | --- | --- | --- |
| `error` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-toast-error.png) | [JSON](styles/ja-dark-toast-error.json) | Blank-comment validation. No comment posted. |
| `success` | ja / dark / 1440 × 900 | [PNG](images/ja-dark-toast-success.png) | [JSON](styles/ja-dark-toast-success.json) | Successful creation of a transient tag in the synthetic fixture. |

## 追加の観測

元の100フレームは画像・実測値とも保持しています。追加の合成ボードでは、同じMarkdownを6種類の表示領域で計測しました。完了レーンに6件、通常レーンにアーカイブ済み9件を用意し、両方のサマリーを展開して元に戻しました。優先度フィルターは選択と解除を確認しました。

追加フレームの `selectorMatches` と `elementIdMatches` は、画面別一覧のセレクターをブラウザーで問い合わせた一致結果です。スクロール位置より下にある要素の計算値も記録しています。[同じ入力に使ったMarkdown](markdown-specimen.md)

| 画面 | 状態 | 原画像 | 実測値 | Markdown要素IDの一致 |
| --- | --- | --- | --- | --- |
| group | `selector-check-window-search` | [既存状態の参照画像](images/ja-dark-group-window-search.png) | [JSON](styles/ja-dark-group-selector-check-window-search.json) | 対象外 |
| kanban | `completion-and-inactive-collapsed` | [PNG](images/ja-dark-kanban-completion-and-inactive-collapsed.png) | [JSON](styles/ja-dark-kanban-completion-and-inactive-collapsed.json) | 対象外 |
| kanban | `completion-expanded` | [PNG](images/ja-dark-kanban-completion-expanded.png) | [JSON](styles/ja-dark-kanban-completion-expanded.json) | 対象外 |
| kanban | `inactive-expanded` | [PNG](images/ja-dark-kanban-inactive-expanded.png) | [JSON](styles/ja-dark-kanban-inactive-expanded.json) | 対象外 |
| ticket-detail | `markdown-specimen-remote` | [PNG](images/ja-dark-ticket-detail-markdown-specimen-remote.png) | [JSON](styles/ja-dark-ticket-detail-markdown-specimen-remote.json) | 34 / 35 |
| ticket-edit | `markdown-specimen-remote` | [PNG](images/ja-dark-ticket-edit-markdown-specimen-remote.png) | [JSON](styles/ja-dark-ticket-edit-markdown-specimen-remote.json) | 34 / 35 |
| custom-view | `selector-check-saved` | [既存状態の参照画像](images/ja-light-custom-view-saved.png) | [JSON](styles/ja-light-custom-view-selector-check-saved.json) | 対象外 |
| custom-view-settings | `selector-check-edit` | [既存状態の参照画像](images/ja-light-custom-view-settings-edit.png) | [JSON](styles/ja-light-custom-view-settings-selector-check-edit.json) | 対象外 |
| group | `markdown-specimen-description` | [PNG](images/ja-light-group-markdown-specimen-description.png) | [JSON](styles/ja-light-group-markdown-specimen-description.json) | 34 / 35 |
| list | `selector-check-board` | [既存状態の参照画像](images/ja-light-list-board.png) | [JSON](styles/ja-light-list-selector-check-board.json) | 対象外 |
| settings-group | `markdown-specimen-preview` | [PNG](images/ja-light-settings-group-markdown-specimen-preview.png) | [JSON](styles/ja-light-settings-group-markdown-specimen-preview.json) | 34 / 35 |
| shell | `priority-expanded-selected` | [PNG](images/ja-light-shell-priority-expanded-selected.png) | [JSON](styles/ja-light-shell-priority-expanded-selected.json) | 対象外 |
| shell | `priority-summary-clear` | [PNG](images/ja-light-shell-priority-summary-clear.png) | [JSON](styles/ja-light-shell-priority-summary-clear.json) | 対象外 |
| ticket-comments | `markdown-specimen` | [PNG](images/ja-light-ticket-comments-markdown-specimen.png) | [JSON](styles/ja-light-ticket-comments-markdown-specimen.json) | 34 / 35 |
| ticket-detail | `markdown-specimen-local` | [PNG](images/ja-light-ticket-detail-markdown-specimen-local.png) | [JSON](styles/ja-light-ticket-detail-markdown-specimen-local.json) | 34 / 35 |

完全一致しなかったIDはmanifestの `supplementalFixture.markdownObservations` に記録しています。

同じ入力の `~~取り消し~~` は、取得した本文HTMLでは平文になりました。6領域とも `del` 要素の計算値はありません。
