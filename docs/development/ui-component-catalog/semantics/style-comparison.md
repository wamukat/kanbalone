# UI部品のスタイル比較

画面別の棚卸しと意味分類から、画面横断23群・領域内15群を評価しました。各群の代表例を比較し、全要素・全状態の組み合わせは測定していません。横断で確認した9つの基本型と、比較で別途確認した初回案内も記録します。タブやタグ表示等は各比較群に含め、OSが描画する選択肢の画面は対象外としました。 [全判定と実測値（JSON）](style-comparison.json) · [意味分類](taxonomy.md) · [採取マニフェスト](../evidence/manifest.json)

38群の比較範囲は、同条件の直接比較あり 21 群、異なる役割・状態等の代表例 13 群、比較対象の観測が不足 4 群です。

直接比較は代表例のブラウザー・言語・テーマ・viewport・記録された操作状態を揃え、同じ役割のプロパティを読みます。状態や役割が異なる例と明暗差は、該当する条件を明示しました。幅・高さにはテキスト量や親領域が反映されます。CSS値の一致は測定表の項目の範囲です。

## 優先して確認する是正候補

- 暗色の履歴本文に文字色を与える。 [履歴の測定](#activity-timeline)
- 外部課題の取り込みでチェックボックスの配置と操作領域を直す。 [チェックボックスの測定](#checkbox)
- Markdownのリンクにテーマ色・下線・フォーカスの共通ルールを適用する。 [同一試料での測定](#rich-text-link)
- 日本語の初回ボード作成案内を翻訳経路に載せる。 [擬似要素の文字の測定](#home-copy)

## 38比較群

| 比較群 | 比較の範囲 | 判断 |
| --- | --- | --- |
| [ナビゲーションの表示切替](#sidebar-visibility) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [ボード・ビューの移動先](#destination-nav) | 同条件の直接比較あり | 共通化候補 |
| [ボード条件の単一選択](#board-select-filter) | 同条件の直接比較あり | 既存共有を維持 |
| [優先度・完了状態の絞り込み](#board-facet) | 同条件の直接比較あり | 既存共有を維持 |
| [レーンで折り畳んだチケットの表示](#lane-inactive-disclosure) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [チケット一覧の表示領域](#ticket-collection) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [一覧のチケット項目](#ticket-item) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [チケットの並べ順指定](#ticket-order) | 同条件の直接比較あり | 共通化候補 |
| [操作対象チケットの選択](#ticket-selection) | 同条件の直接比較あり | 既存共有を維持 |
| [選択したチケットへの一括操作](#bulk-ticket-actions) | 異なる役割・状態等の代表例 | 既存共有を維持 |
| [チケット識別と詳細への入口](#ticket-identity) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [チケット状態の表示](#ticket-status) | 同条件の直接比較あり | 既存共有を維持 |
| [所属レーンの表示](#ticket-lane-value) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [チケット関係の読取表示](#ticket-relations-value) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [チケット詳細のインライン編集](#ticket-inline-editor) | 同条件の直接比較あり | 既存共有を維持 |
| [既存チケットの操作](#ticket-actions) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [チケットにタグを付ける選択](#ticket-tag-picker) | 同条件の直接比較あり | 既存共有を維持 |
| [Groupの選択](#group-navigation) | 同条件の直接比較あり | 既存共有を維持 |
| [Group一覧の順序](#group-order) | 異なる役割・状態等の代表例 | 既存共有を維持 |
| [Groupの説明](#group-description) | 同条件の直接比較あり | 既存共有を維持 |
| [Group所属の変更](#group-members) | 同条件の直接比較あり | 既存共有を維持 |
| [Groupの名前の入力](#group-name-editor) | 同条件の直接比較あり | 既存共有を維持 |
| [カスタムビュー定義フォーム](#custom-view-definition) | 同条件の直接比較あり | 既存共有を維持 |
| [ボードごとの条件定義](#custom-view-board-rule) | 同条件の直接比較あり | 既存共有を維持 |
| [カスタムビューの表示内容](#custom-view-options) | 同条件の直接比較あり | 既存共有を維持 |
| [ボード・レーン・タグの名前入力](#inline-entity-name) | 同条件の直接比較あり | 共通化候補 |
| [ボードデータの入出力](#board-transfer) | 同条件の直接比較あり | 既存共有を維持 |
| [管理対象の削除入口](#delete-entity) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [タグの管理と設定フォーム](#tag-management) | 異なる役割・状態等の代表例 | 既存共有を維持 |
| [本文の閲覧元の切替](#ticket-body-tabs) | 同条件の直接比較あり | 既存共有を維持 |
| [本文・最新コメントの抜粋](#excerpt) | 同条件の直接比較あり | 既存共有を維持 |
| [コメントの投稿と編集](#comment-editor) | 同条件の直接比較あり | 共通化候補 |
| [コメントの外部送信](#comment-sync) | 比較対象の観測が不足 | 根拠不足・保留 |
| [チケットの活動履歴](#activity-timeline) | 異なる役割・状態等の代表例 | 是正候補 |
| [表示対象がない場合の案内](#empty-feedback) | 同条件の直接比較あり | 既存共有を維持 |
| [領域内の状態・エラー表示](#inline-feedback) | 比較対象の観測が不足 | 根拠不足・保留 |
| [移動先の指定](#move-ticket-fields) | 比較対象の観測が不足 | 根拠不足・保留 |
| [Group所属変更の影響確認](#group-impact-dialog) | 比較対象の観測が不足 | 根拠不足・保留 |

## 横断の基本型

| 比較群 | 比較の範囲 | 判断 |
| --- | --- | --- |
| [ボタン](#button) | 異なる役割・状態等の代表例 | 共通化候補 |
| [テキスト入力](#text-input) | 同条件の直接比較あり | 共通化候補 |
| [単一選択](#select) | 異なる役割・状態等の代表例 | 共通化候補 |
| [チェックボックス](#checkbox) | 異なる役割・状態等の代表例 | 是正候補 |
| [フォームのラベル](#label) | 同条件の直接比較あり | 既存共有を維持 |
| [通知・状態表示](#status-message) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [検索入力](#search-input) | 異なる役割・状態等の代表例 | 意図的な差を維持 |
| [複数行入力](#textarea) | 異なる役割・状態等の代表例 | 共通化候補 |
| [Markdown内のリンク](#rich-text-link) | 同条件の直接比較あり | 是正候補 |

## 各判断の測定値

<a id="sidebar-visibility" name="sidebar-visibility"></a>

### ナビゲーションの表示切替

異なる役割・状態等の代表例。**意図的な差を維持**。

閉じる操作はサイドバー端、再表示はツールバー内に置く。閉じ状態の再表示にはキーボードフォーカスがあるため、枠や寸法を位置ごとの仕様として読む。

既存のアイコンボタン下地を使い、端の円形とツールバーの角丸を維持する。

[app-board-settings.js#L165](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-board-settings.js#L165) · [app-shell.css#L36](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/app-shell.css#L36)

**開閉位置による寸法**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [shell.sidebar-close](../observations/shell.md#shell.sidebar-close) · `elements[102] / styles[76]` · 状態 board · [生データ](../evidence/styles/ja-dark-kanban-board.json) · [原画像](../evidence/images/ja-dark-kanban-board.png)
- B. [shell.sidebar-reopen](../observations/shell.md#shell.sidebar-reopen) · `elements[105] / styles[79]` · 状態 collapsed · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-shell-collapsed.json) · [原画像](../evidence/images/ja-dark-shell-collapsed.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `flex` | `flex` |
| `width` | `23.7969px` | `32px` |
| `height` | `23.7969px` | `32px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `999px` | `6px` |

<a id="destination-nav" name="destination-nav"></a>

### ボード・ビューの移動先

同条件の直接比較あり。**共通化候補**。

同じサイドバーの未選択項目で、文字の太さ・行高・余白が異なる。並べ替え対象のボードとリンクのビューには異なる操作上の責務がある。

行のタイポグラフィと余白の共通下地を検討し、リンク、並べ替え、現在位置の識別を維持する。

[sidebar-boards.css#L81](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/sidebar-boards.css#L81) · [custom-views.css#L4](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/custom-views.css#L4)

**サイドバーの未選択の移動先**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [shell.board-button](../observations/shell.md#shell.board-button) · `elements[5] / styles[5]` · 状態 archive-visible · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)
- B. [shell.custom-link](../observations/shell.md#shell.custom-link) · `elements[95] / styles[70]` · 状態 archive-visible · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `500` | `400` |
| `line-height` | `18.2px` | `20.3px` |
| `height` | `38.375px` | `39.0781px` |
| `padding-top` | `9.1px` | `8.4px` |
| `padding-left` | `12.6px` | `11.2px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

<a id="board-select-filter" name="board-select-filter"></a>

### ボード条件の単一選択

同条件の直接比較あり。**既存共有を維持**。

同じListに置いたレーンとタグの選択は同じ高さ・余白・枠。幅は各条件の選択肢と最小幅に従う。

既存のツールバーselectを維持する。

**通常状態のListの絞り込み**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [list.lane-filter](../observations/list.md#list.lane-filter) · `elements[113] / styles[87]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)
- B. [list.tag-filter](../observations/list.md#list.tag-filter) · `elements[121] / styles[95]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `normal` | `normal` |
| `height` | `34.2969px` | `34.2969px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `9.1px` | `9.1px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgb(16, 21, 17)` | `rgb(16, 21, 17)` |

この表の実測項目は一致。

<a id="board-facet" name="board-facet"></a>

### 優先度・完了状態の絞り込み

同条件の直接比較あり。**既存共有を維持**。

KanbanとListで既存の優先度フィルターを共有する。完了状態にも同じ枠が適用され、文字量と展開・要約が幅を決める。

既存のフィルター枠を維持し、各条件の選択モデルを保持する。

**優先度フィルターの閉じた枠**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [kanban.priority-filter](../observations/kanban.md#kanban.priority-filter) · `elements[113] / styles[87]` · 状態 board · [生データ](../evidence/styles/ja-dark-kanban-board.json) · [原画像](../evidence/images/ja-dark-kanban-board.png)
- B. [list.priority-filter](../observations/list.md#list.priority-filter) · `elements[114] / styles[88]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `grid` | `grid` |
| `width` | `168.141px` | `168.141px` |
| `height` | `34.8906px` | `34.8906px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `row-gap` | `3.5px` | `3.5px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

この表の実測項目は一致。

**閉じた優先度と完了状態の枠**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [kanban.priority-filter](../observations/kanban.md#kanban.priority-filter) · `elements[113] / styles[87]` · 状態 board · [生データ](../evidence/styles/ja-dark-kanban-board.json) · [原画像](../evidence/images/ja-dark-kanban-board.png)
- B. [kanban.status-filter](../observations/kanban.md#kanban.status-filter) · `elements[121] / styles[95]` · 状態 board · [生データ](../evidence/styles/ja-dark-kanban-board.json) · [原画像](../evidence/images/ja-dark-kanban-board.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `grid` | `grid` |
| `width` | `168.141px` | `238.875px` |
| `height` | `34.8906px` | `34.8906px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `row-gap` | `3.5px` | `3.5px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

<a id="lane-inactive-disclosure" name="lane-inactive-disclosure"></a>

### レーンで折り畳んだチケットの表示

異なる役割・状態等の代表例。**意図的な差を維持**。

完了の残り件数は簡潔な折り畳み行、非アクティブの要約は説明と複数の内訳を含む領域。枠・余白・高さは内容に対応している。

切り替えの位置と説明を維持する。

**同一フレームの折り畳み要約**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [kanban.completion-summary](../observations/kanban.md#kanban.completion-summary) · `elements[281] / styles[154]` · 状態 completion-and-inactive-collapsed · [生データ](../evidence/styles/ja-dark-kanban-completion-and-inactive-collapsed.json) · [原画像](../evidence/images/ja-dark-kanban-completion-and-inactive-collapsed.png)
- B. [kanban.inactive-summary](../observations/kanban.md#kanban.inactive-summary) · `elements[190] / styles[130]` · 状態 completion-and-inactive-collapsed · [生データ](../evidence/styles/ja-dark-kanban-completion-and-inactive-collapsed.json) · [原画像](../evidence/images/ja-dark-kanban-completion-and-inactive-collapsed.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `grid` | `grid` |
| `width` | `275px` | `275px` |
| `height` | `35.7812px` | `102.484px` |
| `padding-top` | `0px` | `12px` |
| `padding-left` | `0px` | `12px` |
| `row-gap` | `8px` | `8px` |
| `border-top-width` | `0px` | `1px` |
| `border-radius` | `0px` | `8px` |
| `color` | `rgb(238, 244, 241)` | `rgb(167, 179, 173)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.7)` |

<a id="ticket-collection" name="ticket-collection"></a>

### チケット一覧の表示領域

異なる役割・状態等の代表例。**意図的な差を維持**。

同じ表示幅でも列、行、Group内スクロール、ボード別の結果枠は配置と高さが異なる。

スクロールと仮想表示は画面固有の境界を維持する。

**主表示領域の配置**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [kanban.board](../observations/kanban.md#kanban.board) · `elements[134] / styles[105]` · 状態 board · [生データ](../evidence/styles/ja-light-kanban-board.json) · [原画像](../evidence/images/ja-light-kanban-board.png)
- B. [list.board](../observations/list.md#list.board) · `elements[135] / styles[106]` · 状態 board · [生データ](../evidence/styles/ja-light-list-board.json) · [原画像](../evidence/images/ja-light-list-board.png)
- C. [group.board](../observations/group.md#group.board) · `elements[110] / styles[83]` · 状態 selected · [生データ](../evidence/styles/ja-light-group-selected.json) · [原画像](../evidence/images/ja-light-group-selected.png)
- D. [custom-view.panel](../observations/custom-view.md#custom-view.panel) · `elements[29] / styles[23]` · 状態 saved · [生データ](../evidence/styles/ja-light-custom-view-saved.json) · [原画像](../evidence/images/ja-light-custom-view-saved.png)

| 実測CSSプロパティ | A | B | C | D |
| --- | --- | --- | --- | --- |
| `display` | `flex` | `grid` | `grid` | `block` |
| `width` | `1128px` | `1128px` | `1128px` | `1128px` |
| `height` | `780.625px` | `780.625px` | `780.625px` | `868px` |
| `padding-top` | `0px` | `0px` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` | `0px` | `8px` |
| `row-gap` | `12px` | `0px` | `24px` | `normal` |
| `border-top-width` | `0px` | `1px` | `0px` | `0px` |
| `border-radius` | `8px` | `0px` | `0px` | `0px` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgb(255, 255, 255)` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

<a id="ticket-item" name="ticket-item"></a>

### 一覧のチケット項目

異なる役割・状態等の代表例。**意図的な差を維持**。

カード・List行・Group行・ボード内結果は、操作、列、階層、抜粋の違いから余白・枠・配置が異なる。高さは内容量にも依存する。

共有検討を個別のチケット識別・状態・参照部品に限定する。

**同じ画面幅のカードと行の配置**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [kanban.card](../observations/kanban.md#kanban.card) · `elements[145] / styles[114]` · 状態 board · [生データ](../evidence/styles/ja-light-kanban-board.json) · [原画像](../evidence/images/ja-light-kanban-board.png)
- B. [list.row](../observations/list.md#list.row) · `elements[162] / styles[127]` · 状態 board · [生データ](../evidence/styles/ja-light-list-board.json) · [原画像](../evidence/images/ja-light-list-board.png)
- C. [group.row](../observations/group.md#group.row) · `elements[171] / styles[133]` · 状態 selected · [生データ](../evidence/styles/ja-light-group-selected.json) · [原画像](../evidence/images/ja-light-group-selected.png)
- D. [custom-view.ticket](../observations/custom-view.md#custom-view.ticket) · `elements[50] / styles[43]` · 状態 saved · [生データ](../evidence/styles/ja-light-custom-view-saved.json) · [原画像](../evidence/images/ja-light-custom-view-saved.png)

| 実測CSSプロパティ | A | B | C | D |
| --- | --- | --- | --- | --- |
| `display` | `block` | `grid` | `grid` | `block` |
| `width` | `275px` | `1104px` | `829px` | `1081px` |
| `height` | `90.1875px` | `64px` | `72.2188px` | `342.469px` |
| `padding-top` | `12px` | `7px` | `8px` | `16px` |
| `padding-left` | `12px` | `9.8px` | `0px` | `16px` |
| `row-gap` | `normal` | `7.7px` | `4px` | `normal` |
| `border-top-width` | `1px` | `1px` | `0px` | `1px` |
| `border-radius` | `8px` | `0px` | `0px` | `8px` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `rgb(255, 255, 255)` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | `rgb(255, 255, 255)` |

<a id="ticket-order" name="ticket-order"></a>

### チケットの並べ順指定

同条件の直接比較あり。**共通化候補**。

カスタムビュー一覧と設定の同じ意味のselectは高さと余白が揃う一方、文字の太さに差がある。Listの列見出しは列順指定の操作であり、対応する基礎形状が異なる。

既存のselect共通ルールを使い、設定側だけ文字を強調する要否を確認する。

[custom-views.css#L56](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/custom-views.css#L56)

**ボード内並び順のselect**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [custom-view.sort](../observations/custom-view.md#custom-view.sort) · `elements[39] / styles[33]` · 状態 saved · [生データ](../evidence/styles/ja-light-custom-view-saved.json) · [原画像](../evidence/images/ja-light-custom-view-saved.png)
- B. [custom-view-settings.sort](../observations/custom-view-settings.md#custom-view-settings.sort) · `elements[96] / styles[66]` · 状態 edit · [生データ](../evidence/styles/ja-light-custom-view-settings-edit.json) · [原画像](../evidence/images/ja-light-custom-view-settings-edit.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `600` |
| `line-height` | `normal` | `normal` |
| `height` | `35px` | `35px` |
| `padding-top` | `7px` | `7px` |
| `padding-left` | `9.1px` | `9.1px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `color(srgb 1 1 1 / 0.92)` | `color(srgb 1 1 1 / 0.92)` |

**列の並べ替えとビューのselect**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [list.sort-id](../observations/list.md#list.sort-id) · `elements[141] / styles[112]` · 状態 board · [生データ](../evidence/styles/ja-light-list-board.json) · [原画像](../evidence/images/ja-light-list-board.png)
- B. [custom-view.sort](../observations/custom-view.md#custom-view.sort) · `elements[39] / styles[33]` · 状態 saved · [生データ](../evidence/styles/ja-light-custom-view-saved.json) · [原画像](../evidence/images/ja-light-custom-view-saved.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `12px` | `14px` |
| `font-weight` | `600` | `400` |
| `line-height` | `17.4px` | `normal` |
| `height` | `17.3906px` | `35px` |
| `padding-top` | `0px` | `7px` |
| `padding-left` | `0px` | `9.1px` |
| `border-top-width` | `0px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(102, 115, 109)` | `rgb(21, 32, 28)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `color(srgb 1 1 1 / 0.92)` |

<a id="ticket-selection" name="ticket-selection"></a>

### 操作対象チケットの選択

同条件の直接比較あり。**既存共有を維持**。

未選択の全件と行チェックは見た目の外枠とアクセントが共通。文字の継承は各コンテナのラベルに従う。

共通選択スタイルを維持し、混合選択と親子の対象範囲を保持する。

**未チェックの全件・単一行**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [list.check-all](../observations/list.md#list.check-all) · `elements[140] / styles[111]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)
- B. [list.row-select](../observations/list.md#list.row-select) · `elements[163] / styles[128]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `appearance` | `auto` | `auto` |
| `width` | `14px` | `14px` |
| `height` | `14px` | `14px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `border-top-width` | `0px` | `0px` |
| `accent-color` | `auto` | `auto` |

この表の実測項目は一致。

<a id="bulk-ticket-actions" name="bulk-ticket-actions"></a>

### 選択したチケットへの一括操作

異なる役割・状態等の代表例。**既存共有を維持**。

選択なしと選択ありで枠の高さ・余白は同じ。文字色と表示するボタン群が切り替わる。

共通の操作領域を維持し、個々の移動・アーカイブ・削除の意味を保持する。

**選択なしと選択ありの上側操作枠**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [list.actions-empty](../observations/list.md#list.actions-empty) · `elements[136] / styles[107]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)
- B. [list.actions](../observations/list.md#list.actions) · `elements[136] / styles[107]` · 状態 bulk-selection · [生データ](../evidence/styles/ja-dark-list-bulk-selection.json) · [原画像](../evidence/images/ja-dark-list-bulk-selection.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `flex` | `flex` |
| `width` | `1115px` | `1115px` |
| `height` | `37.7969px` | `37.7969px` |
| `padding-top` | `4.9px` | `4.9px` |
| `padding-left` | `9.8px` | `9.8px` |
| `row-gap` | `7px` | `7px` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `0px` | `0px` |
| `color` | `rgb(167, 179, 173)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.654902 0.701961 0.678431 / 0.04)` | `color(srgb 0.654902 0.701961 0.678431 / 0.04)` |

<a id="ticket-identity" name="ticket-identity"></a>

### チケット識別と詳細への入口

異なる役割・状態等の代表例。**意図的な差を維持**。

4画面の詳細リンクは同じ重みの文字を使う。タイトルの行高や幅の使い方はカード、行、抜粋付き記事で異なる。

識別番号・タイトルの強調とフォーカスを比較対象に残し、読み取り専用の親文脈を操作に変えない。

**通常の詳細への入口**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [kanban.card-title](../observations/kanban.md#kanban.card-title) · `elements[154] / styles[123]` · 状態 board · [生データ](../evidence/styles/ja-light-kanban-board.json) · [原画像](../evidence/images/ja-light-kanban-board.png)
- B. [list.title-link](../observations/list.md#list.title-link) · `elements[168] / styles[133]` · 状態 board · [生データ](../evidence/styles/ja-light-list-board.json) · [原画像](../evidence/images/ja-light-list-board.png)
- C. [group.ticket](../observations/group.md#group.ticket) · `elements[175] / styles[137]` · 状態 selected · [生データ](../evidence/styles/ja-light-group-selected.json) · [原画像](../evidence/images/ja-light-group-selected.png)
- D. [custom-view.ticket-link](../observations/custom-view.md#custom-view.ticket-link) · `elements[52] / styles[45]` · 状態 saved · [生データ](../evidence/styles/ja-light-custom-view-saved.json) · [原画像](../evidence/images/ja-light-custom-view-saved.png)

| 実測CSSプロパティ | A | B | C | D |
| --- | --- | --- | --- | --- |
| `font-size` | `14px` | `14px` | `14px` | `15px` |
| `font-weight` | `600` | `600` | `600` | `600` |
| `line-height` | `20.3px` | `18.2px` | `18.2px` | `19.5px` |
| `height` | `20.2969px` | `18.1875px` | `32px` | `19.5px` |
| `display` | `flow-root` | `flex` | `flex` | `flex` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `white-space` | `normal` | `normal` | `normal` | `normal` |

<a id="ticket-status" name="ticket-status"></a>

### チケット状態の表示

同条件の直接比較あり。**既存共有を維持**。

完了アイコンの外枠はKanban、List、Groupで揃う。完了とアーカイブは別軸であり、今回採取していない詳細の状態バッジは同じと判断しない。

既存の状態アイコンを使い、状態別アイコンと復元操作を保持する。

**表示中の完了アイコン**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [kanban.card-resolved-icon](../observations/kanban.md#kanban.card-resolved-icon) · `elements[222] / styles[147]` · 状態 completion-and-inactive-collapsed · [生データ](../evidence/styles/ja-dark-kanban-completion-and-inactive-collapsed.json) · [原画像](../evidence/images/ja-dark-kanban-completion-and-inactive-collapsed.png)
- B. [list.resolved-icon](../observations/list.md#list.resolved-icon) · `elements[230] / styles[167]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)
- C. [group.resolved-icon](../observations/group.md#group.resolved-icon) · `elements[196] / styles[157]` · 状態 archive-visible · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)

| 実測CSSプロパティ | A | B | C |
| --- | --- | --- | --- |
| `width` | `17.5px` | `17.5px` | `17.5px` |
| `height` | `17.5px` | `17.5px` | `17.5px` |
| `border-top-width` | `1px` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` | `6px` |
| `background-color` | `color(srgb 0.329412 0.721569 0.623529 / 0.0932549)` | `color(srgb 0.329412 0.721569 0.623529 / 0.0932549)` | `color(srgb 0.329412 0.721569 0.623529 / 0.0932549)` |
| `color` | `rgb(84, 184, 159)` | `rgb(84, 184, 159)` | `rgb(84, 184, 159)` |

この表の実測項目は一致。

<a id="ticket-lane-value" name="ticket-lane-value"></a>

### 所属レーンの表示

異なる役割・状態等の代表例。**意図的な差を維持**。

所属レーンはListと詳細の主要欄で14px、Groupとカスタムビューの付随情報では12px。色・幅も配置に従う。

主要値と付随情報の文字階層を維持し、レーン選択操作と読取表示の境界を保持する。

**所属レーンを表示する欄**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [list.lane-cell](../observations/list.md#list.lane-cell) · `elements[185] / styles[149]` · 状態 selector-check-board · [生データ](../evidence/styles/ja-light-list-selector-check-board.json)
- B. [group.lane-meta](../observations/group.md#group.lane-meta) · `elements[179] / styles[141]` · 状態 selected · [生データ](../evidence/styles/ja-light-group-selected.json) · [原画像](../evidence/images/ja-light-group-selected.png)
- C. [custom-view.ticket-lane](../observations/custom-view.md#custom-view.ticket-lane) · `elements[61] / styles[54]` · 状態 selector-check-saved · [生データ](../evidence/styles/ja-light-custom-view-selector-check-saved.json)
- D. [ticket-detail.lane-value](../observations/ticket-detail.md#ticket-detail.lane-value) · `elements[362] / styles[208]` · 状態 body · [生データ](../evidence/styles/ja-light-ticket-detail-body.json) · [原画像](../evidence/images/ja-light-ticket-detail-body.png)

| 実測CSSプロパティ | A | B | C | D |
| --- | --- | --- | --- | --- |
| `font-size` | `14px` | `12px` | `12px` | `14px` |
| `font-weight` | `400` | `400` | `400` | `400` |
| `line-height` | `20.3px` | `17.4px` | `17.4px` | `20.3px` |
| `height` | `20.2969px` | `17.3906px` | `17.3906px` | `20.2969px` |
| `display` | `block` | `block` | `flex` | `block` |
| `color` | `rgb(102, 115, 109)` | `rgb(102, 115, 109)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `white-space` | `nowrap` | `normal` | `normal` | `normal` |

<a id="ticket-relations-value" name="ticket-relations-value"></a>

### チケット関係の読取表示

異なる役割・状態等の代表例。**意図的な差を維持**。

Kanbanの警告件数、Listの参照操作、詳細の参照リンクは異なる情報を示す。文字サイズやインライン配置の差を確認した。

方向・警告・参照先の情報と操作を維持する。

**関係の件数表示と参照リンク**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [kanban.card-blockers](../observations/kanban.md#kanban.card-blockers) · `elements[195] / styles[143]` · 状態 board · [生データ](../evidence/styles/ja-light-kanban-board.json) · [原画像](../evidence/images/ja-light-kanban-board.png)
- B. [list.blocker-link](../observations/list.md#list.blocker-link) · `elements[243] / styles[178]` · 状態 board · [生データ](../evidence/styles/ja-light-list-board.json) · [原画像](../evidence/images/ja-light-list-board.png)
- C. [ticket-detail.relation-blocker](../observations/ticket-detail.md#ticket-detail.relation-blocker) · `elements[404] / styles[236]` · 状態 body · [生データ](../evidence/styles/ja-light-ticket-detail-body.json) · [原画像](../evidence/images/ja-light-ticket-detail-body.png)

| 実測CSSプロパティ | A | B | C |
| --- | --- | --- | --- |
| `font-size` | `11px` | `14px` | `12px` |
| `font-weight` | `400` | `400` | `600` |
| `line-height` | `11px` | `20.3px` | `17.4px` |
| `height` | `16px` | `20.2969px` | `22.3906px` |
| `display` | `flex` | `inline-block` | `inline-flex` |
| `color` | `rgb(196, 61, 61)` | `rgb(31, 111, 95)` | `rgb(196, 61, 61)` |
| `white-space` | `normal` | `nowrap` | `normal` |

<a id="ticket-inline-editor" name="ticket-inline-editor"></a>

### チケット詳細のインライン編集

同条件の直接比較あり。**既存共有を維持**。

タイトル編集を開く同じボタンは、本文編集中も同じ形状で表示される。タイトル文字列、優先度select、本文欄は編集方式が異なる。

タイトルの既存描画を維持し、入力種別と保存・取消経路を保持する。

**詳細と本文編集中のタイトル編集ボタン**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [ticket-detail.title-button](../observations/ticket-detail.md#ticket-detail.title-button) · `elements[352] / styles[200]` · 状態 body · [生データ](../evidence/styles/ja-dark-ticket-detail-body.json) · [原画像](../evidence/images/ja-dark-ticket-detail-body.png)
- B. [ticket-inline.title-button](../observations/ticket-inline.md#ticket-inline.title-button) · `elements[352] / styles[200]` · 状態 body · [生データ](../evidence/styles/ja-dark-ticket-inline-body.json) · [原画像](../evidence/images/ja-dark-ticket-inline-body.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `15px` | `15px` |
| `font-weight` | `600` | `600` |
| `line-height` | `18.75px` | `18.75px` |
| `height` | `24.0938px` | `24.0938px` |
| `padding-top` | `1.68px` | `1.68px` |
| `padding-left` | `3.92px` | `3.92px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

この表の実測項目は一致。

<a id="ticket-actions" name="ticket-actions"></a>

### 既存チケットの操作

異なる役割・状態等の代表例。**意図的な差を維持**。

編集フッターの削除・アーカイブ・移動で寸法の基礎が揃う。色と強調は操作結果に対応する。詳細で復元が出る状態は実測対象外。

共通のボタン下地と警告色を維持する。

**編集フッターのアーカイブ・移動・削除**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [ticket-edit.archive](../observations/ticket-edit.md#ticket-edit.archive) · `elements[415] / styles[245]` · 状態 form · [生データ](../evidence/styles/ja-light-ticket-edit-form.json) · [原画像](../evidence/images/ja-light-ticket-edit-form.png)
- B. [ticket-edit.move](../observations/ticket-edit.md#ticket-edit.move) · `elements[419] / styles[249]` · 状態 form · [生データ](../evidence/styles/ja-light-ticket-edit-form.json) · [原画像](../evidence/images/ja-light-ticket-edit-form.png)
- C. [ticket-edit.delete](../observations/ticket-edit.md#ticket-edit.delete) · `elements[411] / styles[244]` · 状態 form · [生データ](../evidence/styles/ja-light-ticket-edit-form.json) · [原画像](../evidence/images/ja-light-ticket-edit-form.png)

| 実測CSSプロパティ | A | B | C |
| --- | --- | --- | --- |
| `font-size` | `14px` | `14px` | `14px` |
| `font-weight` | `500` | `500` | `500` |
| `line-height` | `18.2px` | `18.2px` | `18.2px` |
| `height` | `38.375px` | `38.375px` | `38.375px` |
| `padding-top` | `9.1px` | `9.1px` | `9.1px` |
| `padding-left` | `12.6px` | `12.6px` | `12.6px` |
| `border-top-width` | `1px` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` | `6px` |
| `color` | `rgb(102, 115, 109)` | `rgb(21, 32, 28)` | `rgb(196, 61, 61)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` | `rgb(251, 252, 251)` |

<a id="ticket-tag-picker" name="ticket-tag-picker"></a>

### チケットにタグを付ける選択

同条件の直接比較あり。**既存共有を維持**。

新規と編集で閉じたタグ欄の計測値が揃う。展開では候補領域が加わり高さが増す。

既存タグピッカーを使い、選択済み値と候補・検索・解除の状態を維持する。

**候補を閉じたタグ欄**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [ticket-new.tag-field](../observations/ticket-new.md#ticket-new.tag-field) · `elements[360] / styles[205]` · 状態 blank · [生データ](../evidence/styles/ja-light-ticket-new-blank.json) · [原画像](../evidence/images/ja-light-ticket-new-blank.png)
- B. [ticket-edit.tag-field](../observations/ticket-edit.md#ticket-edit.tag-field) · `elements[361] / styles[208]` · 状態 form · [生データ](../evidence/styles/ja-light-ticket-edit-form.json) · [原画像](../evidence/images/ja-light-ticket-edit-form.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `block` | `block` |
| `width` | `692px` | `692px` |
| `height` | `43.7188px` | `43.7188px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `row-gap` | `normal` | `normal` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `0px` | `0px` |
| `color` | `rgb(0, 0, 0)` | `rgb(0, 0, 0)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

この表の実測項目は一致。

**タグ欄と候補展開中**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [ticket-edit.tag-field](../observations/ticket-edit.md#ticket-edit.tag-field) · `elements[361] / styles[208]` · 状態 form · [生データ](../evidence/styles/ja-light-ticket-edit-form.json) · [原画像](../evidence/images/ja-light-ticket-edit-form.png)
- B. [picker-tags.tag-field](../observations/picker-tags.md#picker-tags.tag-field) · `elements[361] / styles[208]` · 状態 options · [生データ](../evidence/styles/ja-light-picker-tags-options.json) · [原画像](../evidence/images/ja-light-picker-tags-options.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `block` | `block` |
| `width` | `692px` | `692px` |
| `height` | `43.7188px` | `89.7812px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `row-gap` | `normal` | `normal` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `0px` | `0px` |
| `color` | `rgb(0, 0, 0)` | `rgb(0, 0, 0)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

<a id="group-navigation" name="group-navigation"></a>

### Groupの選択

同条件の直接比較あり。**既存共有を維持**。

同じ未選択状態で、Groupと未所属の文字・枠・内余白は共通。高さは名前や件数などを含む枠全体で比較した。

既存Group選択ボタンを維持し、未所属の表示と件数を保持する。

**未選択の通常Groupと未所属**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [group.choice](../observations/group.md#group.choice) · `elements[139] / styles[108]` · 状態 archive-visible · aria-current=false · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)
- B. [group.choice-ungrouped](../observations/group.md#group.choice-ungrouped) · `elements[145] / styles[113]` · 状態 archive-visible · aria-current=false · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `500` | `500` |
| `line-height` | `18.2px` | `18.2px` |
| `height` | `63.7812px` | `55.7812px` |
| `padding-top` | `8px` | `8px` |
| `padding-left` | `12px` | `12px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

<a id="group-order" name="group-order"></a>

### Group一覧の順序

異なる役割・状態等の代表例。**既存共有を維持**。

作成日と名前ボタンの基礎寸法が揃い、選択された作成日だけアクセント背景になる。

並べ替えの選択色と方向表示を維持する。

**選択中の作成日と未選択の名前**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [group.sort-created](../observations/group.md#group.sort-created) · `elements[120] / styles[93]` · 状態 archive-visible · aria-pressed=true · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)
- B. [group.sort-name](../observations/group.md#group.sort-name) · `elements[126] / styles[98]` · 状態 archive-visible · aria-pressed=false · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `12px` | `12px` |
| `font-weight` | `500` | `500` |
| `line-height` | `17.4px` | `17.4px` |
| `height` | `32px` | `32px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `8px` | `8px` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(84, 184, 159)` | `rgb(167, 179, 173)` |
| `background-color` | `rgba(84, 184, 159, 0.16)` | `rgba(0, 0, 0, 0)` |

<a id="group-description" name="group-description"></a>

### Groupの説明

同条件の直接比較あり。**既存共有を維持**。

同じMarkdown試料の説明本文と編集プレビューでリンクのフォント・色・行高が揃う。フォーム、開閉、入力は各状態の責務。

Groupの説明とプレビューの共有表現を維持し、他のMarkdown文脈とのリンク差は横断比較で扱う。

**同じMarkdown試料の外部リンク**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [group.description-markdown-link](../observations/group.md#group.description-markdown-link) · `elements[152] / styles[117]` · 状態 markdown-specimen-description · [生データ](../evidence/styles/ja-light-group-markdown-specimen-description.json) · [原画像](../evidence/images/ja-light-group-markdown-specimen-description.png)
- B. [settings-group.preview-markdown-link](../observations/settings-group.md#settings-group.preview-markdown-link) · `elements[155] / styles[120]` · 状態 markdown-specimen-preview · [生データ](../evidence/styles/ja-light-settings-group-markdown-specimen-preview.json) · [原画像](../evidence/images/ja-light-settings-group-markdown-specimen-preview.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `21px` | `21px` |
| `height` | `auto` | `auto` |
| `display` | `inline` | `inline` |
| `color` | `rgb(31, 111, 95)` | `rgb(31, 111, 95)` |
| `white-space` | `normal` | `normal` |

この表の実測項目は一致。

<a id="group-members" name="group-members"></a>

### Group所属の変更

同条件の直接比較あり。**既存共有を維持**。

同じGroup所属解除のボタンは通常表示と所属選択時で同寸法。選択フォーム内の無効な追加操作とは区別する。

既存の所属解除ボタンを維持し、生命周期をチケット削除から分ける。

**所属を解除する通常ボタン**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [group.remove](../observations/group.md#group.remove) · `elements[181] / styles[143]` · 状態 archive-visible · [生データ](../evidence/styles/ja-dark-group-archive-visible.json) · [原画像](../evidence/images/ja-dark-group-archive-visible.png)
- B. [settings-group.remove](../observations/settings-group.md#settings-group.remove) · `elements[188] / styles[150]` · 状態 add-disabled · [生データ](../evidence/styles/ja-dark-settings-group-add-disabled.json) · [原画像](../evidence/images/ja-dark-settings-group-add-disabled.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `width` | `32px` | `32px` |
| `height` | `32px` | `32px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |
| `color` | `rgb(167, 179, 173)` | `rgb(167, 179, 173)` |

この表の実測項目は一致。

<a id="group-name-editor" name="group-name-editor"></a>

### Groupの名前の入力

同条件の直接比較あり。**既存共有を維持**。

フォーカス中の名前入力で高さ、文字、内余白、枠が一致する。幅はサイドバー内の作成欄と本文側の改名欄の違い。

既存の名前入力ルールを維持する。

**フォーカス中の作成・改名入力**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [settings-group.create-input](../observations/settings-group.md#settings-group.create-input) · `elements[149] / styles[116]` · 状態 create · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-settings-group-create.json) · [原画像](../evidence/images/ja-dark-settings-group-create.png)
- B. [settings-group.rename-input](../observations/settings-group.md#settings-group.rename-input) · `elements[154] / styles[121]` · 状態 rename · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-settings-group-rename.json) · [原画像](../evidence/images/ja-dark-settings-group-rename.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `20.3px` |
| `height` | `38.2969px` | `38.2969px` |
| `padding-top` | `8px` | `8px` |
| `padding-left` | `12px` | `12px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

この表の実測項目は一致。

<a id="custom-view-definition" name="custom-view-definition"></a>

### カスタムビュー定義フォーム

同条件の直接比較あり。**既存共有を維持**。

同じ基礎フォームで、作成と編集の件数・条件内容に応じてフォーム高が変わる。

保存・取消・削除の利用条件を保ち、既存フォームを維持する。

**新規作成と保存済み定義の編集**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [custom-view-settings.form](../observations/custom-view-settings.md#custom-view-settings.form) · `elements[32] / styles[25]` · 状態 create · [生データ](../evidence/styles/ja-light-custom-view-settings-create.json) · [原画像](../evidence/images/ja-light-custom-view-settings-create.png)
- B. [custom-view-settings.form](../observations/custom-view-settings.md#custom-view-settings.form) · `elements[32] / styles[26]` · 状態 edit · [生データ](../evidence/styles/ja-light-custom-view-settings-edit.json) · [原画像](../evidence/images/ja-light-custom-view-settings-edit.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `grid` | `grid` |
| `width` | `812px` | `812px` |
| `height` | `1103.72px` | `926.016px` |
| `padding-top` | `16px` | `16px` |
| `padding-left` | `16px` | `16px` |
| `row-gap` | `16px` | `16px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `8px` | `8px` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `rgb(255, 255, 255)` | `rgb(255, 255, 255)` |

<a id="custom-view-board-rule" name="custom-view-board-rule"></a>

### ボードごとの条件定義

同条件の直接比較あり。**既存共有を維持**。

同じボードの有効なタグ条件とレーン条件で、selectの高さ・枠・文字が揃う。ラベルと選択肢の文字量により必要幅は別。

同じ条件行の基礎を維持し、タグ・レーンの論理と有効化条件を保持する。

**同一ボードの有効なタグ・レーン条件**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [custom-view-settings.rule-tag-mode](../observations/custom-view-settings.md#custom-view-settings.rule-tag-mode) · `elements[61] / styles[51]` · 状態 edit · [生データ](../evidence/styles/ja-dark-custom-view-settings-edit.json) · [原画像](../evidence/images/ja-dark-custom-view-settings-edit.png)
- B. [custom-view-settings.rule-lane-mode](../observations/custom-view-settings.md#custom-view-settings.rule-lane-mode) · `elements[72] / styles[56]` · 状態 edit · [生データ](../evidence/styles/ja-dark-custom-view-settings-edit.json) · [原画像](../evidence/images/ja-dark-custom-view-settings-edit.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `normal` | `normal` |
| `height` | `35px` | `35px` |
| `padding-top` | `7px` | `7px` |
| `padding-left` | `9.1px` | `9.1px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

この表の実測項目は一致。

<a id="custom-view-options" name="custom-view-options"></a>

### カスタムビューの表示内容

同条件の直接比較あり。**既存共有を維持**。

同じ一時表示オプションのチェック外枠が揃う。選択状態と保存・戻すは別の機能。

既存のペアを維持し、保存中の状態や条件定義の入力との境界を保持する。

**本文と最終コメントのチェック済み表示**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [custom-view.body-check](../observations/custom-view.md#custom-view.body-check) · `elements[41] / styles[35]` · 状態 saved · :checked · [生データ](../evidence/styles/ja-light-custom-view-saved.json) · [原画像](../evidence/images/ja-light-custom-view-saved.png)
- B. [custom-view.comment-check](../observations/custom-view.md#custom-view.comment-check) · `elements[43] / styles[35]` · 状態 saved · :checked · [生データ](../evidence/styles/ja-light-custom-view-saved.json) · [原画像](../evidence/images/ja-light-custom-view-saved.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `appearance` | `auto` | `auto` |
| `width` | `13px` | `13px` |
| `height` | `13px` | `13px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `border-top-width` | `0px` | `0px` |
| `accent-color` | `rgb(31, 111, 95)` | `rgb(31, 111, 95)` |

この表の実測項目は一致。

<a id="inline-entity-name" name="inline-entity-name"></a>

### ボード・レーン・タグの名前入力

同条件の直接比較あり。**共通化候補**。

短い名前の入力がフォーカス条件を揃えても、ボードとタグで行高・余白・高さが違う。タグ作成とボード改名は測定した下地が揃う。

同じ小型テキスト入力の基礎を候補とし、レーンの配置、先頭ボード案内、保存イベントは個別に維持する。

[app-inline-text-form.js#L1](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-inline-text-form.js#L1) · [sidebar-boards.css#L99](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/sidebar-boards.css#L99) · [sidebar-tags.css#L15](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/sidebar-tags.css#L15)

**ボード／タグ作成のフォーカス中の入力**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [shell.board-create-input](../observations/shell.md#shell.board-create-input) · `elements[5] / styles[5]` · 状態 new-board · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-shell-new-board.json) · [原画像](../evidence/images/ja-dark-shell-new-board.png)
- B. [settings-tags.create-name](../observations/settings-tags.md#settings-tags.create-name) · `elements[34] / styles[27]` · 状態 create · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-settings-tags-create.json) · [原画像](../evidence/images/ja-dark-settings-tags-create.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `18.2px` |
| `height` | `39.0781px` | `35.5625px` |
| `padding-top` | `8.4px` | `7.7px` |
| `padding-left` | `10.5px` | `9.1px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.329412 0.721569 0.623529 / 0.07)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

**タグ作成／ボード改名のフォーカス中の入力**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [settings-tags.create-name](../observations/settings-tags.md#settings-tags.create-name) · `elements[34] / styles[27]` · 状態 create · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-settings-tags-create.json) · [原画像](../evidence/images/ja-dark-settings-tags-create.png)
- B. [settings-board.rename-input](../observations/settings-board.md#settings-board.rename-input) · `elements[61] / styles[50]` · 状態 rename · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-settings-board-rename.json) · [原画像](../evidence/images/ja-dark-settings-board-rename.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `18.2px` | `18.2px` |
| `height` | `35.5625px` | `35.5625px` |
| `padding-top` | `7.7px` | `7.7px` |
| `padding-left` | `9.1px` | `9.1px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

この表の実測項目は一致。

<a id="board-transfer" name="board-transfer"></a>

### ボードデータの入出力

同条件の直接比較あり。**既存共有を維持**。

同じ設定行で書き出しボタンとファイル選択ラベルの見た目が揃う。クリックのネイティブ挙動は異なる。

既存の共有ルールを維持し、ネイティブファイル選択を保つ。

**同じ行の出力と取り込み**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [settings-board.export](../observations/settings-board.md#settings-board.export) · `elements[74] / styles[60]` · 状態 expanded · [生データ](../evidence/styles/ja-light-settings-board-expanded.json) · [原画像](../evidence/images/ja-light-settings-board-expanded.png)
- B. [settings-board.import](../observations/settings-board.md#settings-board.import) · `elements[78] / styles[63]` · 状態 expanded · [生データ](../evidence/styles/ja-light-settings-board-expanded.json) · [原画像](../evidence/images/ja-light-settings-board-expanded.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `12px` | `12px` |
| `font-weight` | `500` | `500` |
| `line-height` | `15.6px` | `15.6px` |
| `height` | `31.5938px` | `31.5938px` |
| `padding-top` | `7px` | `7px` |
| `padding-left` | `4.2px` | `4.2px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `rgb(251, 252, 251)` | `rgb(251, 252, 251)` |

この表の実測項目は一致。

<a id="delete-entity" name="delete-entity"></a>

### 管理対象の削除入口

異なる役割・状態等の代表例。**意図的な差を維持**。

削除の入口はレーンとタグではアイコン、ボードでは見出し付き領域のラベルボタン。形状は位置と名前の示し方に対応する。

破壊操作の色・アクセス可能な名称・確認手順を共通の契約として維持する。

**レーン・タグ・ボードの削除入口**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [kanban.lane-delete](../observations/kanban.md#kanban.lane-delete) · `elements[149] / styles[118]` · 状態 lane-actions · [生データ](../evidence/styles/ja-dark-kanban-lane-actions.json) · [原画像](../evidence/images/ja-dark-kanban-lane-actions.png)
- B. [settings-tags.delete-start](../observations/settings-tags.md#settings-tags.delete-start) · `elements[51] / styles[45]` · 状態 color-edit · [生データ](../evidence/styles/ja-dark-settings-tags-color-edit.json) · [原画像](../evidence/images/ja-dark-settings-tags-color-edit.png)
- C. [settings-board.delete](../observations/settings-board.md#settings-board.delete) · `elements[103] / styles[79]` · 状態 completion-review · [生データ](../evidence/styles/ja-dark-settings-board-completion-review.json) · [原画像](../evidence/images/ja-dark-settings-board-completion-review.png)

| 実測CSSプロパティ | A | B | C |
| --- | --- | --- | --- |
| `font-size` | `14px` | `12px` | `14px` |
| `font-weight` | `500` | `500` | `500` |
| `line-height` | `14px` | `12px` | `18.2px` |
| `height` | `25.8906px` | `32px` | `38.375px` |
| `padding-top` | `0px` | `5.88px` | `9.1px` |
| `padding-left` | `0px` | `8.68px` | `12.6px` |
| `border-top-width` | `1px` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` | `6px` |
| `color` | `rgb(239, 119, 114)` | `rgb(239, 119, 114)` | `rgb(239, 119, 114)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgb(16, 21, 17)` | `rgb(16, 21, 17)` |

<a id="tag-management" name="tag-management"></a>

### タグの管理と設定フォーム

異なる役割・状態等の代表例。**既存共有を維持**。

同じタグの編集入口と編集中プレビューで背景色、文字、外枠が揃う。鉛筆ボタンとプレビュー表示では幅が違う。

既存のタグ表示と色の下地を維持し、編集入口と非操作プレビューを区別する。

**同じタグの編集入口／非操作プレビュー**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [settings-tags.tag-badge](../observations/settings-tags.md#settings-tags.tag-badge) · `elements[36] / styles[29]` · 状態 create · [生データ](../evidence/styles/ja-dark-settings-tags-create.json) · [原画像](../evidence/images/ja-dark-settings-tags-create.png)
- B. [settings-tags.edit-preview-badge](../observations/settings-tags.md#settings-tags.edit-preview-badge) · `elements[37] / styles[30]` · 状態 color-edit · [生データ](../evidence/styles/ja-dark-settings-tags-color-edit.json) · [原画像](../evidence/images/ja-dark-settings-tags-color-edit.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `12px` | `12px` |
| `font-weight` | `600` | `600` |
| `width` | `77.9219px` | `61.0312px` |
| `height` | `23.1562px` | `23.1562px` |
| `padding-top` | `3.08px` | `3.08px` |
| `padding-left` | `9.1px` | `9.1px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(255, 253, 247)` | `rgb(255, 253, 247)` |
| `background-color` | `rgb(59, 128, 94)` | `rgb(59, 128, 94)` |

<a id="ticket-body-tabs" name="ticket-body-tabs"></a>

### 本文の閲覧元の切替

同条件の直接比較あり。**既存共有を維持**。

編集・詳細とも同じ外部本文タブを選んでフォーカスした比較で寸法・色が揃う。差分の有無や編集中の読み取り専用は各状態の仕様。

タブの共通ルールを維持し、タブ候補・フォーカス遷移と本文の読み取り専用を保持する。

**外部本文タブを選択してフォーカス**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [ticket-edit.body-remote-tab](../observations/ticket-edit.md#ticket-edit.body-remote-tab) · `elements[383] / styles[210]` · 状態 markdown-specimen-remote · :focus, :focus-visible, aria-selected=true · [生データ](../evidence/styles/ja-dark-ticket-edit-markdown-specimen-remote.json) · [原画像](../evidence/images/ja-dark-ticket-edit-markdown-specimen-remote.png)
- B. [ticket-detail.body-remote-tab](../observations/ticket-detail.md#ticket-detail.body-remote-tab) · `elements[407] / styles[243]` · 状態 remote-snapshot · :focus, :focus-visible, aria-selected=true · [生データ](../evidence/styles/ja-dark-ticket-detail-remote-snapshot.json) · [原画像](../evidence/images/ja-dark-ticket-detail-remote-snapshot.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `600` | `600` |
| `width` | `70px` | `70px` |
| `height` | `30.6719px` | `30.6719px` |
| `border-bottom-width` | `2px` | `2px` |
| `border-bottom-color` | `rgb(84, 184, 159)` | `rgb(84, 184, 159)` |
| `color` | `rgb(84, 184, 159)` | `rgb(84, 184, 159)` |

この表の実測項目は一致。

<a id="excerpt" name="excerpt"></a>

### 本文・最新コメントの抜粋

同条件の直接比較あり。**既存共有を維持**。

本文抜粋と最終コメントの見出しは、同じカード内で文字サイズ・行高・色が共通。時刻がつくのは最終コメントの仕様。

既存の抜粋見出しを維持し、元内容のID、折り畳み、全文取得を保持する。

**本文と最新コメントの見出し**。 同条件の代表比較。 en / light / 1050 × 900（DPR 1）。

- A. [custom-view.excerpt-heading](../observations/custom-view.md#custom-view.excerpt-heading) · `elements[75] / styles[69]` · 状態 narrow-sort · [生データ](../evidence/styles/en-light-custom-view-narrow-sort.json) · [原画像](../evidence/images/en-light-custom-view-narrow-sort.png)
- B. [custom-view.excerpt-heading](../observations/custom-view.md#custom-view.excerpt-heading) · `elements[79] / styles[69]` · 状態 narrow-sort · [生データ](../evidence/styles/en-light-custom-view-narrow-sort.json) · [原画像](../evidence/images/en-light-custom-view-narrow-sort.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `12px` | `12px` |
| `font-weight` | `600` | `600` |
| `line-height` | `17.4px` | `17.4px` |
| `height` | `17.3906px` | `17.3906px` |
| `display` | `block` | `block` |
| `color` | `rgb(102, 115, 109)` | `rgb(102, 115, 109)` |
| `white-space` | `normal` | `normal` |

この表の実測項目は一致。

<a id="comment-editor" name="comment-editor"></a>

### コメントの投稿と編集

同条件の直接比較あり。**共通化候補**。

投稿・編集のフォーカス中の本文欄は高さ・文字・枠が揃うが、横内余白が異なる。幅はコメントカードの入れ子で変わる。

本文入力の内余白を共通の入力設定の候補にし、添付・投稿・編集のキー操作を維持する。

[forms.css#L37](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/forms.css#L37) · [comments-activity.css#L168](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/comments-activity.css#L168)

**フォーカス中の投稿と編集の本文欄**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [ticket-comments.composer-body](../observations/ticket-comments.md#ticket-comments.composer-body) · `elements[418] / styles[250]` · 状態 compose · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-ticket-comments-compose.json) · [原画像](../evidence/images/ja-dark-ticket-comments-compose.png)
- B. [ticket-comments.edit-body](../observations/ticket-comments.md#ticket-comments.edit-body) · `elements[437] / styles[262]` · 状態 edit · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-ticket-comments-edit.json) · [原画像](../evidence/images/ja-dark-ticket-comments-edit.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `20.3px` |
| `height` | `121.672px` | `121.672px` |
| `padding-top` | `9.1px` | `9.1px` |
| `padding-left` | `11.2px` | `10.5px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgb(16, 21, 17)` | `rgb(16, 21, 17)` |

<a id="comment-sync" name="comment-sync"></a>

### コメントの外部送信

比較対象の観測が不足。**根拠不足・保留**。

送信済み表示と展開中の失敗通知は確認できた。送信中・通常送信ボタンと同じ状態の計測がないため、色や形状の統一は判断を保留する。

送信状態と再試行・理由の表示を保持する。

**送信済みと展開された送信失敗**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [ticket-comments.sync-pushed](../observations/ticket-comments.md#ticket-comments.sync-pushed) · `elements[432] / styles[266]` · 状態 remote-sync · [生データ](../evidence/styles/ja-dark-ticket-comments-remote-sync.json) · [原画像](../evidence/images/ja-dark-ticket-comments-remote-sync.png)
- B. [ticket-comments.sync-failed](../observations/ticket-comments.md#ticket-comments.sync-failed) · `elements[442] / styles[276]` · 状態 remote-sync · aria-expanded=true · [生データ](../evidence/styles/ja-dark-ticket-comments-remote-sync.json) · [原画像](../evidence/images/ja-dark-ticket-comments-remote-sync.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `12px` | `12px` |
| `font-weight` | `600` | `600` |
| `width` | `75.25px` | `135.25px` |
| `height` | `20.7344px` | `18.9375px` |
| `padding-top` | `1.68px` | `1.68px` |
| `padding-left` | `5.88px` | `5.88px` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(84, 184, 159)` | `rgb(239, 119, 114)` |
| `background-color` | `color(srgb 0.329412 0.721569 0.623529 / 0.12)` | `color(srgb 0.937255 0.466667 0.447059 / 0.12)` |

<a id="activity-timeline" name="activity-timeline"></a>

### チケットの活動履歴

異なる役割・状態等の代表例。**是正候補**。

暗色でも履歴本文が黒を継承する。履歴枠は暗色の半透明背景で、同系の不透明なダイアログ背景（23,29,25）との合成後も黒文字に対して約1.23:1。明色は同じ黒文字で白面。合成の背後は両フレームのダイアログ要素 elements[338] / styles[186] を参照した。

チケットダイアログの文字継承をテーマ文字色に合わせ、履歴の日時・注釈の弱い色は個別に保持して暗色を再計測する。

[dialog-shell.css#L17](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/dialog-shell.css#L17) · [ticket-detail.css#L458](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/ticket-detail.css#L458) · [comments-activity.css#L204](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/comments-activity.css#L204)

**同一暗色フレームの履歴本文と背景**。 同画面の周辺要素を照合。 ja / dark / 1440 × 900（DPR 1）。

- A. [ticket-activity.message](../observations/ticket-activity.md#ticket-activity.message) · `elements[414] / styles[246]` · 状態 history · [生データ](../evidence/styles/ja-dark-ticket-activity-history.json) · [原画像](../evidence/images/ja-dark-ticket-activity-history.png)
- B. [ticket-activity.list](../observations/ticket-activity.md#ticket-activity.list) · `elements[411] / styles[243]` · 状態 history · [生データ](../evidence/styles/ja-dark-ticket-activity-history.json) · [原画像](../evidence/images/ja-dark-ticket-activity-history.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `color` | `rgb(0, 0, 0)` | `rgb(0, 0, 0)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.7)` |

**同じ履歴本文の明色と暗色**。 明暗のみを変えた照合。 ja / light・dark / 1440 × 900（DPR 1）。

- A. [ticket-activity.message](../observations/ticket-activity.md#ticket-activity.message) · `elements[414] / styles[246]` · 状態 history · [生データ](../evidence/styles/ja-light-ticket-activity-history.json) · [原画像](../evidence/images/ja-light-ticket-activity-history.png)
- B. [ticket-activity.message](../observations/ticket-activity.md#ticket-activity.message) · `elements[414] / styles[246]` · 状態 history · [生データ](../evidence/styles/ja-dark-ticket-activity-history.json) · [原画像](../evidence/images/ja-dark-ticket-activity-history.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `color` | `rgb(0, 0, 0)` | `rgb(0, 0, 0)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

この表の実測項目は一致。

<a id="empty-feedback" name="empty-feedback"></a>

### 表示対象がない場合の案内

同条件の直接比較あり。**既存共有を維持**。

ホームとListは空状態の幅と余白を共有する。案内文や復帰操作の内容で高さは変わる。

既存の空状態の枠を使い、原因別の文言と復帰操作を保持する。

**構造が共通する空状態の枠**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [home.empty-panel](../observations/home.md#home.empty-panel) · `elements[30] / styles[29]` · 状態 no-board · [生データ](../evidence/styles/ja-dark-home-no-board.json) · [原画像](../evidence/images/ja-dark-home-no-board.png)
- B. [list.empty](../observations/list.md#list.empty) · `elements[144] / styles[115]` · 状態 filtered-empty · [生データ](../evidence/styles/ja-dark-list-filtered-empty.json) · [原画像](../evidence/images/ja-dark-list-filtered-empty.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `grid` | `grid` |
| `width` | `392px` | `392px` |
| `height` | `176.344px` | `229.516px` |
| `padding-top` | `24px` | `24px` |
| `padding-left` | `24px` | `24px` |
| `row-gap` | `12px` | `12px` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `0px` | `0px` |
| `color` | `rgb(167, 179, 173)` | `rgb(167, 179, 173)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

<a id="inline-feedback" name="inline-feedback"></a>

### 領域内の状態・エラー表示

比較対象の観測が不足。**根拠不足・保留**。

条件欠損の警告と通信エラーは文字色や表示領域が異なる。同じ重大度・通知方式を持つ画面間の実測が十分でない。

警告・エラー・進捗で既存の意味とライブ通知を保ち、表示範囲を共通化する案は保留する。

**条件欠損警告と取得エラーの実例**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [custom-view.warning](../observations/custom-view.md#custom-view.warning) · `elements[45] / styles[38]` · 状態 missing-and-empty · [生データ](../evidence/styles/ja-dark-custom-view-missing-and-empty.json) · [原画像](../evidence/images/ja-dark-custom-view-missing-and-empty.png)
- B. [remote-import.error](../observations/remote-import.md#remote-import.error) · `elements[446] / styles[263]` · 状態 preview-error · [生データ](../evidence/styles/ja-dark-remote-import-preview-error.json) · [原画像](../evidence/images/ja-dark-remote-import-preview-error.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `20.3px` |
| `height` | `28.2969px` | `20.2969px` |
| `display` | `block` | `block` |
| `color` | `rgb(213, 164, 81)` | `rgb(239, 119, 114)` |
| `white-space` | `normal` | `normal` |

<a id="move-ticket-fields" name="move-ticket-fields"></a>

### 移動先の指定

比較対象の観測が不足。**根拠不足・保留**。

一括移動のボードとレーンのselectは同じ枠と余白。単体移動の同条件の実測はない。

一括移動の既存入力を維持し、単体との共有判断は同条件測定まで保留する。

**一括移動の二つの入力欄**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [dialogs.bulk-board](../observations/dialogs.md#dialogs.bulk-board) · `elements[418] / styles[219]` · 状態 bulk-move · [生データ](../evidence/styles/ja-light-dialogs-bulk-move.json) · [原画像](../evidence/images/ja-light-dialogs-bulk-move.png)
- B. [dialogs.bulk-lane](../observations/dialogs.md#dialogs.bulk-lane) · `elements[421] / styles[219]` · 状態 bulk-move · [生データ](../evidence/styles/ja-light-dialogs-bulk-move.json) · [原画像](../evidence/images/ja-light-dialogs-bulk-move.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `normal` | `normal` |
| `height` | `39.1875px` | `39.1875px` |
| `padding-top` | `9.1px` | `9.1px` |
| `padding-left` | `11.2px` | `11.2px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `color(srgb 1 1 1 / 0.92)` | `color(srgb 1 1 1 / 0.92)` |

この表の実測項目は一致。

<a id="group-impact-dialog" name="group-impact-dialog"></a>

### Group所属変更の影響確認

比較対象の観測が不足。**根拠不足・保留**。

所属解除の家族一覧を確認した。所属競合で実際に候補を選ぶ表示と比較できる採取はなく、選択ボタンとの見た目の統一は判断できない。

所属解除の現在の確認、選択肢を開く条件、チケット削除と異なる意味を保持する。

**所属解除の影響リストと項目**。 同画面の周辺要素を照合。 ja / dark / 1440 × 900（DPR 1）。

- A. [dialogs.group-impact](../observations/dialogs.md#dialogs.group-impact) · `elements[297] / styles[203]` · 状態 group-remove-family · [生データ](../evidence/styles/ja-dark-dialogs-group-remove-family.json) · [原画像](../evidence/images/ja-dark-dialogs-group-remove-family.png)
- B. [dialogs.group-impact-item](../observations/dialogs.md#dialogs.group-impact-item) · `elements[298] / styles[204]` · 状態 group-remove-family · [生データ](../evidence/styles/ja-dark-dialogs-group-remove-family.json) · [原画像](../evidence/images/ja-dark-dialogs-group-remove-family.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `block` | `list-item` |
| `width` | `378px` | `358px` |
| `height` | `60.8906px` | `20.2969px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `20px` | `0px` |
| `row-gap` | `normal` | `normal` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `0px` | `0px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgba(0, 0, 0, 0)` |

<a id="button" name="button"></a>

### ボタン

異なる役割・状態等の代表例。**共通化候補**。

文字付きの中立操作は操作密度に応じて高さを変える。アイコンのみ、主操作、危険操作の違いも残す。

既存のボタン・アイコン付き表示を基礎に、サイズ、色、フォーカスの明示的なバリアントを使う。

**設定の小型操作とチケットの通常操作**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [settings-board.export](../observations/settings-board.md#settings-board.export) · `elements[74] / styles[60]` · 状態 expanded · [生データ](../evidence/styles/ja-light-settings-board-expanded.json) · [原画像](../evidence/images/ja-light-settings-board-expanded.png)
- B. [ticket-edit.move](../observations/ticket-edit.md#ticket-edit.move) · `elements[419] / styles[249]` · 状態 form · [生データ](../evidence/styles/ja-light-ticket-edit-form.json) · [原画像](../evidence/images/ja-light-ticket-edit-form.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `12px` | `14px` |
| `font-weight` | `500` | `500` |
| `line-height` | `15.6px` | `18.2px` |
| `height` | `31.5938px` | `38.375px` |
| `padding-top` | `7px` | `9.1px` |
| `padding-left` | `4.2px` | `12.6px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `rgb(251, 252, 251)` | `rgba(0, 0, 0, 0)` |

<a id="text-input" name="text-input"></a>

### テキスト入力

同条件の直接比較あり。**共通化候補**。

ボードとタグの短い名前入力の差は同フォーカスで成立する。チケットのタイトルは入力サイズと行の構成が異なる。

小型と標準の役割を決め、文字・枠・フォーカスの下地を共有候補にする。

[sidebar-boards.css#L99](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/sidebar-boards.css#L99) · [sidebar-tags.css#L15](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/sidebar-tags.css#L15) · [forms.css#L4](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/forms.css#L4)

**同フォーカスの短い名前入力**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [shell.board-create-input](../observations/shell.md#shell.board-create-input) · `elements[5] / styles[5]` · 状態 new-board · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-shell-new-board.json) · [原画像](../evidence/images/ja-dark-shell-new-board.png)
- B. [settings-tags.create-name](../observations/settings-tags.md#settings-tags.create-name) · `elements[34] / styles[27]` · 状態 create · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-settings-tags-create.json) · [原画像](../evidence/images/ja-dark-settings-tags-create.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `18.2px` |
| `height` | `39.0781px` | `35.5625px` |
| `padding-top` | `8.4px` | `7.7px` |
| `padding-left` | `10.5px` | `9.1px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.329412 0.721569 0.623529 / 0.07)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

**同フォーカスの短いタグ名とチケットタイトル**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [settings-tags.create-name](../observations/settings-tags.md#settings-tags.create-name) · `elements[34] / styles[27]` · 状態 create · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-settings-tags-create.json) · [原画像](../evidence/images/ja-dark-settings-tags-create.png)
- B. [ticket-new.title](../observations/ticket-new.md#ticket-new.title) · `elements[346] / styles[193]` · 状態 blank · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-ticket-new-blank.json) · [原画像](../evidence/images/ja-dark-ticket-new-blank.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `18.2px` | `18.2px` |
| `height` | `35.5625px` | `40.3438px` |
| `padding-top` | `7.7px` | `10.08px` |
| `padding-left` | `9.1px` | `11.2px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` | `rgb(16, 21, 17)` |

<a id="select" name="select"></a>

### 単一選択

異なる役割・状態等の代表例。**共通化候補**。

ツールバー、定義フォーム、移動ダイアログで高さと余白が異なる。ネイティブの選択肢ポップアップはこの値に含まない。

標準と小型の選択入力を候補とし、選択肢・無効状態とフォームの意味を維持する。

**有効な絞り込み・定義・移動のselect**。 状態・操作・配置の違いを確認。 ja / light / 1440 × 900（DPR 1）。

- A. [list.lane-filter](../observations/list.md#list.lane-filter) · `elements[113] / styles[87]` · 状態 board · [生データ](../evidence/styles/ja-light-list-board.json) · [原画像](../evidence/images/ja-light-list-board.png)
- B. [custom-view-settings.sort](../observations/custom-view-settings.md#custom-view-settings.sort) · `elements[96] / styles[66]` · 状態 edit · [生データ](../evidence/styles/ja-light-custom-view-settings-edit.json) · [原画像](../evidence/images/ja-light-custom-view-settings-edit.png)
- C. [dialogs.bulk-lane](../observations/dialogs.md#dialogs.bulk-lane) · `elements[421] / styles[219]` · 状態 bulk-move · [生データ](../evidence/styles/ja-light-dialogs-bulk-move.json) · [原画像](../evidence/images/ja-light-dialogs-bulk-move.png)

| 実測CSSプロパティ | A | B | C |
| --- | --- | --- | --- |
| `font-size` | `14px` | `14px` | `14px` |
| `font-weight` | `400` | `600` | `400` |
| `line-height` | `normal` | `normal` | `normal` |
| `height` | `34.2969px` | `35px` | `39.1875px` |
| `padding-top` | `0px` | `7px` | `9.1px` |
| `padding-left` | `9.1px` | `9.1px` | `11.2px` |
| `border-top-width` | `1px` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` | `6px` |
| `color` | `rgb(102, 115, 109)` | `rgb(21, 32, 28)` | `rgb(21, 32, 28)` |
| `background-color` | `color(srgb 1 1 1 / 0.92)` | `color(srgb 1 1 1 / 0.92)` | `color(srgb 1 1 1 / 0.92)` |

<a id="checkbox" name="checkbox"></a>

### チェックボックス

異なる役割・状態等の代表例。**是正候補**。

外部課題のリンク投稿欄でチェック要素のDOMボックスが467×13px、Listの通常の未選択は14×14px。前者は操作領域の幅で、ネイティブのチェック記号の幅ではない。ラベルがgridになり説明が次行に落ちる。

フォームの全幅input指定からチェックを外し、専用行の横並びを効かせる。小型標準チェック・色有無スイッチの役割は維持する。

[forms.css#L4](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/forms.css#L4) · [ticket-editor.css#L131](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/ticket-editor.css#L131) · [ticket-editor.css#L247](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/ticket-editor.css#L247) · [index.html#L457](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/index.html#L457)

**日本語暗色・有効・未選択の異なる用途のチェック**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [remote-import.backlink-check](../observations/remote-import.md#remote-import.backlink-check) · `elements[444] / styles[261]` · 状態 drawer · [生データ](../evidence/styles/ja-dark-remote-import-drawer.json) · [原画像](../evidence/images/ja-dark-remote-import-drawer.png)
- B. [list.row-select](../observations/list.md#list.row-select) · `elements[163] / styles[128]` · 状態 board · [生データ](../evidence/styles/ja-dark-list-board.json) · [原画像](../evidence/images/ja-dark-list-board.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `appearance` | `auto` | `auto` |
| `width` | `467px` | `14px` |
| `height` | `13px` | `14px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `border-top-width` | `0px` | `0px` |
| `accent-color` | `auto` | `auto` |

**外部課題リンク投稿のラベル行とチェック**。 同画面の周辺要素を照合。 ja / dark / 1440 × 900（DPR 1）。

- A. [remote-import.backlink](../observations/remote-import.md#remote-import.backlink) · `elements[443] / styles[260]` · 状態 drawer · [生データ](../evidence/styles/ja-dark-remote-import-drawer.json) · [原画像](../evidence/images/ja-dark-remote-import-drawer.png)
- B. [remote-import.backlink-check](../observations/remote-import.md#remote-import.backlink-check) · `elements[444] / styles[261]` · 状態 drawer · [生データ](../evidence/styles/ja-dark-remote-import-drawer.json) · [原画像](../evidence/images/ja-dark-remote-import-drawer.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `grid` | `block` |
| `width` | `467px` | `467px` |
| `height` | `34.5781px` | `13px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `0px` | `0px` |
| `row-gap` | `4.2px` | `normal` |
| `border-top-width` | `0px` | `0px` |
| `border-radius` | `0px` | `0px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgba(0, 0, 0, 0)` | `rgb(16, 21, 17)` |

<a id="label" name="label"></a>

### フォームのラベル

同条件の直接比較あり。**既存共有を維持**。

Group作成・改名の名前ラベルは文字、行高、間隔が共通。ラベルが入力を包むので幅は配置先に従う。

ラベルと入力の関連、説明の有無を保持し、コンテナ幅を各画面に任せる。

**Groupの同内容の名前ラベル**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [settings-group.create-label](../observations/settings-group.md#settings-group.create-label) · `elements[148] / styles[115]` · 状態 create · [生データ](../evidence/styles/ja-dark-settings-group-create.json) · [原画像](../evidence/images/ja-dark-settings-group-create.png)
- B. [settings-group.rename-label](../observations/settings-group.md#settings-group.rename-label) · `elements[153] / styles[120]` · 状態 rename · [生データ](../evidence/styles/ja-dark-settings-group-rename.json) · [原画像](../evidence/images/ja-dark-settings-group-rename.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `display` | `grid` | `grid` |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `20.3px` |
| `row-gap` | `4px` | `4px` |
| `width` | `230px` | `829px` |
| `height` | `62.5938px` | `62.5938px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |

<a id="status-message" name="status-message"></a>

### 通知・状態表示

異なる役割・状態等の代表例。**意図的な差を維持**。

トーストの成功とエラーで枠と余白が共通になり、予告する状態に応じて色と文字量が変わる。画面内の永続警告と短い通知は表示条件・読み上げ方法が異なる。

通知ごとの意味と読み上げを保ち、見た目の共通下地だけを共有範囲とする。

**処理結果とエラーのトースト**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [toast.notification](../observations/toast.md#toast.notification) · `elements[141] / styles[110]` · 状態 success · [生データ](../evidence/styles/ja-dark-toast-success.json) · [原画像](../evidence/images/ja-dark-toast-success.png)
- B. [toast.error](../observations/toast.md#toast.error) · `elements[427] / styles[308]` · 状態 error · [生データ](../evidence/styles/ja-dark-toast-error.json) · [原画像](../evidence/images/ja-dark-toast-error.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `width` | `154.594px` | `209.344px` |
| `height` | `44.6719px` | `44.6719px` |
| `padding-top` | `11.2px` | `11.2px` |
| `padding-left` | `13.3px` | `13.3px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `8px` | `8px` |
| `color` | `rgb(7, 19, 16)` | `rgb(7, 19, 16)` |
| `background-color` | `color(srgb 0.329412 0.721569 0.623529 / 0.96)` | `color(srgb 0.937255 0.466667 0.447059 / 0.96)` |

<a id="search-input" name="search-input"></a>

### 検索入力

異なる役割・状態等の代表例。**意図的な差を維持**。

ボード検索の枠は入力を包む要素にあり、Group結果内検索は入力自体が枠を持つ。比較するCSSの対象を外枠同士にそろえる。検索方法は絞り込みと結果移動で異なる。

入力サーフェスの検討に絞り、候補検索・結果移動・絞り込みの実装を別に保つ。

**ボード検索枠とGroup結果検索の通常枠**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [shell.search-control](../observations/shell.md#shell.search-control) · `elements[108] / styles[82]` · 状態 board · [生データ](../evidence/styles/ja-dark-kanban-board.json) · [原画像](../evidence/images/ja-dark-kanban-board.png)
- B. [group.window-search-input](../observations/group.md#group.window-search-input) · `elements[150] / styles[119]` · 状態 window · [生データ](../evidence/styles/ja-dark-group-window.json) · [原画像](../evidence/images/ja-dark-group-window.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `18.2px` |
| `height` | `34.2969px` | `32px` |
| `padding-top` | `0px` | `0px` |
| `padding-left` | `12px` | `11.2px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgb(16, 21, 17)` | `color(srgb 0.0901961 0.113725 0.0980392 / 0.92)` |

<a id="textarea" name="textarea"></a>

### 複数行入力

異なる役割・状態等の代表例。**共通化候補**。

新規本文とコメントの文字・枠は同値を多く持つ。本文とコメントで編集量と初期高さが違う。投稿と編集に見られた横内余白は同じ用途として見直せる。

複数行入力の枠と文字を共有候補とし、用途に応じる初期高さとフォーカス・添付を維持する。

**新規本文欄とコメント投稿欄**。 状態・操作・配置の違いを確認。 ja / dark / 1440 × 900（DPR 1）。

- A. [ticket-new.body](../observations/ticket-new.md#ticket-new.body) · `elements[347] / styles[194]` · 状態 blank · [生データ](../evidence/styles/ja-dark-ticket-new-blank.json) · [原画像](../evidence/images/ja-dark-ticket-new-blank.png)
- B. [ticket-comments.composer-body](../observations/ticket-comments.md#ticket-comments.composer-body) · `elements[418] / styles[250]` · 状態 compose · :focus, :focus-visible · [生データ](../evidence/styles/ja-dark-ticket-comments-compose.json) · [原画像](../evidence/images/ja-dark-ticket-comments-compose.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `20.3px` | `20.3px` |
| `height` | `223.156px` | `121.672px` |
| `padding-top` | `9.1px` | `9.1px` |
| `padding-left` | `11.2px` | `11.2px` |
| `border-top-width` | `1px` | `1px` |
| `border-radius` | `6px` | `6px` |
| `color` | `rgb(238, 244, 241)` | `rgb(238, 244, 241)` |
| `background-color` | `rgb(16, 21, 17)` | `rgb(16, 21, 17)` |

<a id="rich-text-link" name="rich-text-link"></a>

### Markdown内のリンク

同条件の直接比較あり。**是正候補**。

同じ試料・日本語明色・1440pxで、Group説明とプレビューはテーマの緑、ローカル本文とコメントは既定の青。Group側の色・ホバー・フォーカス規則はソースで確認した。下線のcomputed styleはこの採取に含めていない。暗色の外部本文にも青の実測があり、明色とは別の観測として扱う。

既存のMarkdown用リンク基礎を共有候補にし、色・下線・フォーカス、訪問状態と内部・外部リンクの操作を確かめる。

[groups.css#L375](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/groups.css#L375) · [groups.css#L381](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/groups.css#L381) · [groups.css#L436](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/groups.css#L436)

**同じ試料の外部リンク・明色**。 同条件の代表比較。 ja / light / 1440 × 900（DPR 1）。

- A. [group.description-markdown-link](../observations/group.md#group.description-markdown-link) · `elements[152] / styles[117]` · 状態 markdown-specimen-description · [生データ](../evidence/styles/ja-light-group-markdown-specimen-description.json) · [原画像](../evidence/images/ja-light-group-markdown-specimen-description.png)
- B. [settings-group.preview-markdown-link](../observations/settings-group.md#settings-group.preview-markdown-link) · `elements[155] / styles[120]` · 状態 markdown-specimen-preview · [生データ](../evidence/styles/ja-light-settings-group-markdown-specimen-preview.json) · [原画像](../evidence/images/ja-light-settings-group-markdown-specimen-preview.png)
- C. [ticket-detail.local-markdown-link](../observations/ticket-detail.md#ticket-detail.local-markdown-link) · `elements[282] / styles[181]` · 状態 markdown-specimen-local · [生データ](../evidence/styles/ja-light-ticket-detail-markdown-specimen-local.json) · [原画像](../evidence/images/ja-light-ticket-detail-markdown-specimen-local.png)
- D. [ticket-comments.body-markdown-link](../observations/ticket-comments.md#ticket-comments.body-markdown-link) · `elements[355] / styles[239]` · 状態 markdown-specimen · [生データ](../evidence/styles/ja-light-ticket-comments-markdown-specimen.json) · [原画像](../evidence/images/ja-light-ticket-comments-markdown-specimen.png)

| 実測CSSプロパティ | A | B | C | D |
| --- | --- | --- | --- | --- |
| `font-size` | `14px` | `14px` | `14px` | `14px` |
| `font-weight` | `400` | `400` | `400` | `400` |
| `line-height` | `21px` | `21px` | `20.3px` | `21px` |
| `height` | `auto` | `auto` | `auto` | `auto` |
| `display` | `inline` | `inline` | `inline` | `inline` |
| `color` | `rgb(31, 111, 95)` | `rgb(31, 111, 95)` | `rgb(0, 0, 238)` | `rgb(0, 0, 238)` |
| `white-space` | `normal` | `normal` | `normal` | `normal` |

**同じ外部本文試料・暗色の詳細と編集**。 同条件の代表比較。 ja / dark / 1440 × 900（DPR 1）。

- A. [ticket-detail.remote-markdown-link](../observations/ticket-detail.md#ticket-detail.remote-markdown-link) · `elements[441] / styles[262]` · 状態 markdown-specimen-remote · [生データ](../evidence/styles/ja-dark-ticket-detail-markdown-specimen-remote.json) · [原画像](../evidence/images/ja-dark-ticket-detail-markdown-specimen-remote.png)
- B. [ticket-edit.remote-markdown-link](../observations/ticket-edit.md#ticket-edit.remote-markdown-link) · `elements[399] / styles[224]` · 状態 markdown-specimen-remote · [生データ](../evidence/styles/ja-dark-ticket-edit-markdown-specimen-remote.json) · [原画像](../evidence/images/ja-dark-ticket-edit-markdown-specimen-remote.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `400` | `400` |
| `line-height` | `21px` | `21px` |
| `height` | `auto` | `auto` |
| `display` | `inline` | `inline` |
| `color` | `rgb(0, 0, 238)` | `rgb(0, 0, 238)` |
| `white-space` | `normal` | `normal` |

この表の実測項目は一致。

<a id="home-copy" name="home-copy"></a>

### 初回作成案内の言語

異なる役割・状態等の代表例。**是正候補**。

日本語でボードがない場面でも、擬似要素の内容として同じ英語が明色・暗色で採取された。

既存の翻訳経路に載せる。入力・ボタンのスタイル共有とは独立した修正候補。

[sidebar-boards.css#L46](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/sidebar-boards.css#L46)

**日本語の初回案内・明色と暗色**。 明暗のみを変えた照合。 ja / light・dark / 1440 × 900（DPR 1）。

- A. [home.board-create-cue](../observations/home.md#home.board-create-cue) · `elements[4] / styles[6] / ::after` · 状態 no-board · 生成内容 `"Create board here"` · [生データ](../evidence/styles/ja-light-home-no-board.json) · [原画像](../evidence/images/ja-light-home-no-board.png)
- B. [home.board-create-cue](../observations/home.md#home.board-create-cue) · `elements[4] / styles[6] / ::after` · 状態 no-board · 生成内容 `"Create board here"` · [生データ](../evidence/styles/ja-dark-home-no-board.json) · [原画像](../evidence/images/ja-dark-home-no-board.png)

| 実測CSSプロパティ | A | B |
| --- | --- | --- |
| `font-size` | `14px` | `14px` |
| `font-weight` | `600` | `600` |
| `line-height` | `18.2px` | `18.2px` |
| `height` | `18.1875px` | `18.1875px` |
| `display` | `block` | `block` |
| `color` | `rgb(31, 111, 95)` | `rgb(84, 184, 159)` |
| `white-space` | `normal` | `normal` |
