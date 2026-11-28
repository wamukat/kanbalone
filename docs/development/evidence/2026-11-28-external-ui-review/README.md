# External UI/UX review screenshots — 2026-11-28

User-provided v1.6.0 review evidence from `kanbalone-update.zip`. These are original supplied PNG bytes, including crops/zoom images already present in the source. No new screenshot capture, retouching, or UI reproduction was performed.

Reported environment: Chrome/Playwright headless, 1440×900, 1024×768 and 390×844; light/dark; evaluation board 5. Exact captured commit and tool versions were not provided. Image pixel sizes can differ from CSS viewport sizes. Existing-board context remains as supplied.

This directory preserves only the images referenced by the 29 finding issues. These images document the reported baseline, not completed fixes or after-state acceptance evidence. Static images do not verify keyboard behavior, request ordering, HTTP status, persistence, or measured contrast.

Tracking: [#95](https://github.com/wamukat/kanbalone/issues/95). Implementation requires mock agreement and per-ticket before/after evidence under the UI review rules.

## Issue mapping / 指摘別画像

### H1 — [[UI/UX H1] チケット詳細がモーダルになっておらず、ページ全体がスクロールする](https://github.com/wamukat/kanbalone/issues/96)

- [12-detail.png](shots/12-detail.png)
- [13-detail-bottom.png](shots/13-detail-bottom.png)
- [14-detail-wheel.png](shots/14-detail-wheel.png)
- [68-history.png](shots/68-history.png)
- [63-mobile-detail.png](shots/63-mobile-detail.png)

スクロール前後・履歴・スマホ幅の見た目。静止画だけではfocus trapや背景スクロールの操作結果は確定しない。

### H2 — [[UI/UX H2] リストの「ブロッカー」列が、絞り込み中は空（「-」）になる](https://github.com/wamukat/kanbalone/issues/97)

- [43-list.png](shots/43-list.png)
- [46-list-blocker.png](shots/46-list-blocker.png)

通常一覧と「ブロック」検索時の列表示。参照先APIレスポンス/保存状態は画像のみでは検証できない。

### H3 — [[UI/UX H3] レーン削除の確認が矛盾していて、押すと失敗する](https://github.com/wamukat/kanbalone/issues/98)

- [30-lane-menu.png](shots/30-lane-menu.png)
- [31-lane-delete.png](shots/31-lane-delete.png)
- [32-lane-delete-result.png](shots/32-lane-delete-result.png)

レーンメニュー→削除確認→エラートースト。HTTP 409は資料の報告であり画像だけで応答コードは確認できない。

### H4 — [[UI/UX H4] チケットの「移動」が、既定で別のボードの先頭レーンを選んでいる](https://github.com/wamukat/kanbalone/issues/99)

- [15-edit.png](shots/15-edit.png)
- [69-move.png](shots/69-move.png)

編集画面と移動ダイアログの初期選択。実際の移動や保存は未検証。

### H5 — [[UI/UX H5] 編集中に作ったタグは、編集をキャンセル・破棄してもボードに残る](https://github.com/wamukat/kanbalone/issues/100)

- [18-tag-new.png](shots/18-tag-new.png)
- [19-tag-enter.png](shots/19-tag-enter.png)
- [22-cancel-edit.png](shots/22-cancel-edit.png)
- [23-tab-focus.png](shots/23-tab-focus.png)

タグ入力→Enter後→破棄確認→閉じた後のボード。22は破棄確認中、23は後続画面として補足。APIでの残存確認は未実施。

### M1 — [[UI/UX M1] 優先度「緊急」とブロッカーのアイコンが似ている。ブロッカーがあるとタイトルの位置がずれる](https://github.com/wamukat/kanbalone/issues/101)

- [10-kanban-seeded.png](shots/10-kanban-seeded.png)
- [11-card-zoom.png](shots/11-card-zoom.png)
- [11-card-zoom2x.png](shots/11-card-zoom2x.png)

### M2 — [[UI/UX M2] カードのアイコンが小さく、意味が分かりにくい](https://github.com/wamukat/kanbalone/issues/102)

- [10-kanban-seeded.png](shots/10-kanban-seeded.png)
- [11-card-zoom.png](shots/11-card-zoom.png)
- [60-dark-kanban.png](shots/60-dark-kanban.png)

### M3 — [[UI/UX M3] キーボードだけでの操作に限界がある](https://github.com/wamukat/kanbalone/issues/103)

- [23-tab-focus.png](shots/23-tab-focus.png)
- [24-tab-focus2.png](shots/24-tab-focus2.png)
- [25-help.png](shots/25-help.png)

フォーカス表示・ヘルプを試した画面の参考画像。キー移動不可やTab回数を静止画だけで証明しない。

### M4 — [[UI/UX M4] チケット詳細でタイトルが目立たない](https://github.com/wamukat/kanbalone/issues/104)

- [12-detail.png](shots/12-detail.png)
- [61-dark-detail.png](shots/61-dark-detail.png)

### M5 — [[UI/UX M5] 本文のチェックリストを画面で切り替えられない](https://github.com/wamukat/kanbalone/issues/105)

- [12-detail.png](shots/12-detail.png)
- [63-mobile-detail.png](shots/63-mobile-detail.png)

チェックリストの描画を示す参考画像。クリック時の動作/保存は未検証。Task機能とは別。

### M6 — [[UI/UX M6] リスト表示のレイアウト](https://github.com/wamukat/kanbalone/issues/106)

- [43-list.png](shots/43-list.png)
- [44-list-selected.png](shots/44-list-selected.png)
- [45-list-bottom.png](shots/45-list-bottom.png)
- [47-list-tags.png](shots/47-list-tags.png)
- [64-tablet-list.png](shots/64-tablet-list.png)

行/タグ/選択/1024pxの表示。アクセシブル名の有無は画像だけでは検証できない。

### M7 — [[UI/UX M7] サイドバーのタグをクリックすると、絞り込みではなく編集が開く](https://github.com/wamukat/kanbalone/issues/107)

- [42-sidebar-tag-click.png](shots/42-sidebar-tag-click.png)

### M8 — [[UI/UX M8] カスタムビュー](https://github.com/wamukat/kanbalone/issues/108)

- [57-custom-view.png](shots/57-custom-view.png)
- [58-custom-view-show.png](shots/58-custom-view-show.png)
- [59-custom-view-newboard.png](shots/59-custom-view-newboard.png)

原画像にある既存ボードの表示もそのまま保持。新規ボード条件と抜粋・用語・フォームの確認用。

### M9 — [[UI/UX M9] グループ表示](https://github.com/wamukat/kanbalone/issues/109)

- [49-group.png](shots/49-group.png)
- [50-group-add-existing.png](shots/50-group-add-existing.png)
- [52-group-picked.png](shots/52-group-picked.png)

### M10 — [[UI/UX M10] 検索と絞り込み](https://github.com/wamukat/kanbalone/issues/110)

- [36-search.png](shots/36-search.png)
- [38-search-none.png](shots/38-search-none.png)
- [39-priority-filter.png](shots/39-priority-filter.png)
- [40-tag-filter.png](shots/40-tag-filter.png)
- [41-tag-filtered.png](shots/41-tag-filtered.png)

消去ボタン・0件・フィルタの見た目。URL保持、Esc、開閉時の位置変化は別途操作検証が必要。

### M11 — [[UI/UX M11] 履歴の中身が分からない](https://github.com/wamukat/kanbalone/issues/111)

- [68-history.png](shots/68-history.png)

### M12 — [[UI/UX M12] ボードの削除と設定](https://github.com/wamukat/kanbalone/issues/112)

- [53-settings.png](shots/53-settings.png)
- [54-settings-bottom.png](shots/54-settings-bottom.png)
- [55-board-delete.png](shots/55-board-delete.png)

### M13 — [[UI/UX M13] アーカイブを取り消せない](https://github.com/wamukat/kanbalone/issues/113)

- [28-to-done.png](shots/28-to-done.png)
- [70-archived.png](shots/70-archived.png)
- [71-include-archived.png](shots/71-include-archived.png)

完了移動後・アーカイブ通知・アーカイブを含む表示。取消不能や復元の保存結果を静止画だけで断定しない。

### L1 — [[UI/UX L1] 新規ボードの初期レーン名と言語・表記を整える](https://github.com/wamukat/kanbalone/issues/114)

- [05-new-board.png](shots/05-new-board.png)

### L2 — [[UI/UX L2] カンバン・リストに現在のボード名を表示する](https://github.com/wamukat/kanbalone/issues/115)

- [10-kanban-seeded.png](shots/10-kanban-seeded.png)
- [43-list.png](shots/43-list.png)
- [49-group.png](shots/49-group.png)

### L3 — [[UI/UX L3] カードのチケットIDの可読性・コントラストを改善する](https://github.com/wamukat/kanbalone/issues/116)

- [10-kanban-seeded.png](shots/10-kanban-seeded.png)
- [11-card-zoom.png](shots/11-card-zoom.png)
- [60-dark-kanban.png](shots/60-dark-kanban.png)

IDの見た目の参考。3.07:1という比率は資料の報告であり、画像から再計測した結果ではない。

### L4 — [[UI/UX L4] カンバンの横スクロールと右端の操作を分かりやすくする](https://github.com/wamukat/kanbalone/issues/117)

- [10-kanban-seeded.png](shots/10-kanban-seeded.png)
- [29-scrolled-right.png](shots/29-scrolled-right.png)
- [30-lane-menu.png](shots/30-lane-menu.png)

### L5 — [[UI/UX L5] チケット作成・編集フォームの見出しとラベルを整える](https://github.com/wamukat/kanbalone/issues/118)

- [06-add-ticket.png](shots/06-add-ticket.png)
- [15-edit.png](shots/15-edit.png)
- [16-relation-add.png](shots/16-relation-add.png)
- [21-tag-arrow.png](shots/21-tag-arrow.png)

### L6 — [[UI/UX L6] 未保存変更の破棄確認を「編集を続ける」と明示する](https://github.com/wamukat/kanbalone/issues/119)

- [08-esc-dirty.png](shots/08-esc-dirty.png)
- [22-cancel-edit.png](shots/22-cancel-edit.png)

### L7 — [[UI/UX L7] コメント見出しの番号と日時の情報順を見直す](https://github.com/wamukat/kanbalone/issues/120)

- [13-detail-bottom.png](shots/13-detail-bottom.png)
- [67-comment-list.png](shots/67-comment-list.png)

コメント見出しの番号・日時を示す参考画像。

### L8 — [[UI/UX L8] タグ色設定の表示ラベルとアクセシブル名を補う](https://github.com/wamukat/kanbalone/issues/121)

- [42-sidebar-tag-click.png](shots/42-sidebar-tag-click.png)

画像には「色」という見出しがありますが、トグル自体の用途表示と16進入力のアクセシブル名は別に確認が必要です。aria-labelの有無は静止画では検証できません。

### L9 — [[UI/UX L9] ブロッカー関係の方向が分かる文言にする](https://github.com/wamukat/kanbalone/issues/122)

- [16-relation-add.png](shots/16-relation-add.png)

関連の追加メニューを示す参考画像。文言と方向の問題は本文の報告も参照。

### L10 — [[UI/UX L10] スマホ幅で検索フィルタを画面内から操作できるようにする](https://github.com/wamukat/kanbalone/issues/123)

- [62-mobile-kanban.png](shots/62-mobile-kanban.png)

390pxのフィルタの表示。タッチDnDは資料でも未確認。

### L11 — [[UI/UX L11] 空のボード名・レーン名を確定したときの結果を伝える](https://github.com/wamukat/kanbalone/issues/124)

- [03-new-board.png](shots/03-new-board.png)
- [04-empty-enter.png](shots/04-empty-enter.png)
- [34-lane-add.png](shots/34-lane-add.png)

ボード作成入力と空確定後、およびレーン名入力の参考画像。レーン名の空確定後画像は資料に見当たらず、キー操作/保存は未検証。
