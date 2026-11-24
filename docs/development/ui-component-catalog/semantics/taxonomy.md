# 意味別分類

画面別カタログの1,301行を、利用者が何を読み取り、どの対象に何をするかで、13の用途と81の比較群に割り当てました。基準リビジョンは `2ff8489d889706a6dc6392fd28aeff073e0b515c` です。元の画面別ID、根拠、観測への参照は各要素に残っています。[全件の分類データ](mapping.json) · [評価と判断](assessment.md) · [画面別カタログ](../README.md)

## 数の内訳

どの要素IDも主分類を1件だけ持ちます。たとえば、タグ選択の候補ボタンは「タグの候補選択」に属し、基本型「候補項目」と「選択」の状態を追加で記録できます。基本型・状態・表示文脈は、行数の合計に重ねて加えません。

| 元の画面別行の役割 | 件数 | 例 |
| --- | ---: | --- |
| 部品やまとまりの主要素 | 223 | タグ選択欄、一覧カード、ダイアログ枠。別画面・状態の再掲を含む |
| 内部の情報・操作・装飾 | 781 | ラベル、候補、アイコン、参照番号、ボタン、Markdownの段落 |
| レイアウト・描画用の構造 | 282 | 行・列の配置、仮想表示の空間、進捗バーの描画部位 |
| 視覚的な比較から除外 | 15 | サニタイズされるタグ、非表示の値保持・ファイル入力、対象画面では非表示の領域 |
| 合計 | **1,301** | 21の画面・操作領域 |

視覚比較から除外した15行には、現行のMarkdownサニタイザーで `del` が生成されない6行、タグ候補から選択済み項目を除くためチェックアイコンを描かない1行、対象状態で非表示の6行、機能を担う非表示入力の2行が含まれます。非表示入力の2行は、ボードJSONの選択と外部プロバイダーの送信値保持に必要です。除外理由は各行の `displayExclusion` と `mergeBasis.note` にあります。

同じ意味上の役割の最初の参照は758行、参照先とソース位置・セレクターが一致する再掲は164行、同じ役割を別文脈・状態・実装位置で扱う行は379行です。Markdownだけでも6文脈×35行の210行を占めます。6件の取り消し線入力を除き、段落や表セル、読み取り専用のタスク記号などはすべて共通のMarkdown描画の内部にあります。

## 分類の軸

- **用途と比較群** — `familyId` は主目的、`componentId` は同じ対象や操作結果を持つ比較範囲です。機能のまとまりが近くても、効果が異なる操作は `semanticRole` または `variants` で区別します。
- **役割と表示差** — `role` は主要素、内部部位、構造、視覚比較から除外のどれかです。`primitiveType` はボタン、検索入力、選択欄、語句へのリンクなどを画面横断で比較するときの基本型です。`variants` は用途・表示文脈、`states` は元の行に明記された選択中・処理中などの状態です。
- **画面への出現** — `elementId` で元の要素、`occurrence.referenceElementId` で同じ役割の参照先をたどれます。同一ソースの再掲という表示は、セレクターとソース位置の両方が参照先と一致した場合に限ります。`mergeBasis` は元のソースと比較群の判断根拠を結びます。

| 横断して見る基本型 | 画面別の出現数 |
| --- | ---: |
| アクションボタン | 209 |
| テキスト入力／検索入力／複数行入力 | 16／11／6 |
| セレクト／チェックボックス／ラジオ | 21／15／5 |
| リンク／タブ／アイコン | 24／11／77 |
| 状態メッセージ | 24 |

基本型の数は出現数です。例えばアクションボタン209行には多くの画面文脈があります。個々の操作結果を保ったまま、既定・フォーカス・無効・処理中といった表現を比べられます。

## 81の比較群の扱い

| 評価 | 群数 | 判断基準 |
| --- | ---: | --- |
| 現行の共有が確認できる | 19 | 同じ描画元、共有ヘルパー、共有マークアップ、または共有CSSが確認できる |
| 画面横断で比較 | 23 | 複数の画面・操作領域で目的が重なる。操作境界と表示要件を照合する |
| 同じ画面・操作領域の中で比較 | 15 | 目的の近い要素や状態が同じ領域に並ぶ。内部の重複や基本型を確認する |
| 文脈固有 | 24 | 画面構造、操作対象、効果、実装契約に固有性があり、そのまま一つの比較範囲とする |
| 合計 | **81** | 用途上の比較群の数 |

81群には一覧構造や入力フォーム、操作の集合も含まれます。実装済みの再利用部品数や新設部品の目標数は、この集計からは決まりません。次のスタイル比較では、画面横断のアクションボタン・入力・セレクトを優先し、同じ値の表示に使う優先度、状態、タグ、空状態も見比べます。既存のタグ表示、Markdown、関係候補、ダイアログ枠は共有箇所を根拠に比較します。

- **まとめて数える** — タグ選択は一つの複合操作です。検索、選択の解除、候補表示はそれぞれ内部の役割です。通常通知とエラー通知は、同じ `#toast` の状態差です。Groupの進捗は、トラックとブラウザー別の充填色を含めて一つの進捗表示です。
- **意味の差を保つ** — 一覧を絞る検索、仮想一覧の位置を探す検索、関係付ける候補の検索は、入力の基本型を比較できても操作結果が異なります。チケットをGroupから外す操作、チケット自体の削除、アーカイブ、復元も、対象と効果を保ちます。読み取り専用のMarkdownタスク記号は操作用チェックボックスと区別します。
- **複合部品は構造を保つ** — Kanbanのカード、Listの行、Groupの親子・文脈行、カスタムビューの結果には、チケットの識別や状態表示という共通の役割があります。行全体では、ドラッグ、選択、字下げ、仮想表示、抜粋など各画面の動作を保持します。

## 用途ごとの比較群

各行の比較根拠とソース位置は分類データの `components` にあります。代表リンクを開くと個々の実測と観測できなかった状態を確認できます。

### 画面の移動と枠

6群、54行。画面を開く、場所を確認する、表示方法を切り替える。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [アプリの領域と表示枠](../observations/shell.md#shell.layout) | 5 | 23 | 文脈固有 |
| [スクロールバー](../observations/shell.md#shell.scrollbar) | 1 | 4 | 現行の共有あり |
| [ナビゲーションの表示切替](../observations/shell.md#shell.sidebar-close) | 2 | 5 | 画面横断で比較 |
| [ボード・ビューの移動先](../observations/shell.md#shell.board-button) | 2 | 8 | 画面横断で比較 |
| [ボードの表示モード](../observations/shell.md#shell.view-toggle) | 1 | 10 | 現行の共有あり |
| [製品・バージョン情報](../observations/shell.md#shell.github-link) | 1 | 4 | 文脈固有 |

### 条件指定と検索

6群、104行。チケットの表示範囲を絞る、候補や表示中の位置を探す。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [ボード内の検索条件](../observations/shell.md#shell.search-control) | 3 | 12 | 現行の共有あり |
| [ボード条件の単一選択](../observations/shell.md#shell.lane-filter) | 3 | 15 | 画面横断で比較 |
| [優先度・完了状態の絞り込み](../observations/shell.md#shell.priority-filter) | 3 | 57 | 画面横断で比較 |
| [アーカイブ済みを含める条件](../observations/shell.md#shell.archive-control) | 3 | 7 | 現行の共有あり |
| [全フィルターの解除](../observations/shell.md#shell.reset-filters) | 3 | 3 | 現行の共有あり |
| [Group内のチケット位置検索](../observations/group.md#group.window-search) | 1 | 10 | 文脈固有 |

### ボードと一覧

9群、87行。レーン・行・カード・ボード別結果の配置、複数チケットの扱い。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [Kanbanレーン](../observations/kanban.md#kanban.lane) | 1 | 10 | 文脈固有 |
| [レーンで折り畳んだチケットの表示](../observations/kanban.md#kanban.completion-summary) | 1 | 9 | 同じ領域内で比較 |
| [チケット一覧の表示領域](../observations/kanban.md#kanban.board) | 4 | 17 | 画面横断で比較 |
| [一覧のチケット項目](../observations/kanban.md#kanban.card) | 5 | 17 | 画面横断で比較 |
| [チケットの並べ順指定](../observations/list.md#list.sort-id) | 3 | 10 | 画面横断で比較 |
| [操作対象チケットの選択](../observations/list.md#list.check-all) | 1 | 4 | 同じ領域内で比較 |
| [選択したチケットへの一括操作](../observations/list.md#list.actions) | 1 | 9 | 同じ領域内で比較 |
| [カスタムビューのページ移動](../observations/custom-view.md#custom-view.pagination) | 1 | 4 | 文脈固有 |
| [ボード別の検索結果要約](../observations/custom-view.md#custom-view.board) | 1 | 7 | 文脈固有 |

### チケットの情報と参照

8群、93行。識別、状態、優先度、タグ、所属、依存、参照を読み取る。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [チケット識別と詳細への入口](../observations/kanban.md#kanban.card-title) | 5 | 16 | 画面横断で比較 |
| [親子関係の記号と階層](../observations/kanban.md#kanban.card-hierarchy) | 3 | 4 | 現行の共有あり |
| [チケット状態の表示](../observations/kanban.md#kanban.card-resolved-icon) | 5 | 17 | 画面横断で比較 |
| [優先度の表示](../observations/kanban.md#kanban.card-priority) | 5 | 12 | 現行の共有あり |
| [所属レーンの表示](../observations/list.md#list.lane-cell) | 4 | 7 | 画面横断で比較 |
| [所属Groupの表示](../observations/ticket-detail.md#ticket-detail.group-link) | 1 | 4 | 文脈固有 |
| [タグの読取表示](../observations/kanban.md#kanban.card-tag) | 5 | 15 | 現行の共有あり |
| [チケット関係の読取表示](../observations/kanban.md#kanban.card-blockers) | 3 | 18 | 画面横断で比較 |

### チケットの作成と編集

6群、114行。チケットの入力、保存、既存レコードの操作。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [チケットのダイアログ枠](../observations/ticket-new.md#ticket-new.dialog) | 3 | 27 | 現行の共有あり |
| [チケットの全項目フォーム](../observations/kanban.md#kanban.new-ticket) | 4 | 40 | 現行の共有あり |
| [チケット詳細のインライン編集](../observations/ticket-detail.md#ticket-detail.title-button) | 2 | 17 | 画面横断で比較 |
| [コメントと活動のタブ](../observations/ticket-detail.md#ticket-detail.detail-tabs) | 3 | 9 | 現行の共有あり |
| [既存チケットの操作](../observations/ticket-edit.md#ticket-edit.delete) | 2 | 6 | 画面横断で比較 |
| [画像添付の補助・状態](../observations/ticket-new.md#ticket-new.image-feedback) | 4 | 15 | 現行の共有あり |

### 値・関係の候補選択

3群、134行。候補の検索、確定、解除、選択済みの表示。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [チケットにタグを付ける選択](../observations/ticket-new.md#ticket-new.tag-field) | 3 | 29 | 画面横断で比較 |
| [追加する関係の種類を選ぶ](../observations/ticket-new.md#ticket-new.relation-heading) | 3 | 21 | 現行の共有あり |
| [チケット関係の候補選択](../observations/ticket-edit.md#ticket-edit.blocker-row) | 3 | 84 | 現行の共有あり |

### Groupの選択と管理

10群、90行。Groupの状態、説明、所属先、名前の管理。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [Groupの選択](../observations/group.md#group.choice) | 1 | 13 | 同じ領域内で比較 |
| [Group一覧の表示範囲](../observations/group.md#group.visibility) | 1 | 4 | 文脈固有 |
| [Group一覧の順序](../observations/group.md#group.sort-controls) | 1 | 6 | 同じ領域内で比較 |
| [Groupの完了進捗](../observations/group.md#group.choice-progress) | 1 | 4 | 文脈固有 |
| [選択中Groupの概要](../observations/group.md#group.content) | 1 | 9 | 文脈固有 |
| [Groupの説明](../observations/group.md#group.description) | 2 | 16 | 画面横断で比較 |
| [Group所属の変更](../observations/group.md#group.add-existing) | 2 | 18 | 画面横断で比較 |
| [Group内チケットの表示範囲](../observations/group.md#group.open-only) | 1 | 2 | 文脈固有 |
| [空Groupの削除](../observations/group.md#group.delete-empty) | 2 | 2 | 文脈固有 |
| [Groupの名前の入力](../observations/group.md#group.create-group) | 2 | 16 | 画面横断で比較 |

### カスタムビューの管理

4群、61行。表示定義を作る、条件と表示方法を変更する。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [ビューの名前と対象範囲](../observations/custom-view.md#custom-view.header) | 1 | 5 | 文脈固有 |
| [カスタムビュー定義フォーム](../observations/shell.md#shell.custom-new) | 2 | 34 | 画面横断で比較 |
| [ボードごとの条件定義](../observations/custom-view-settings.md#custom-view-settings.rule) | 1 | 15 | 同じ領域内で比較 |
| [カスタムビューの表示内容](../observations/custom-view.md#custom-view.toolbar) | 1 | 7 | 同じ領域内で比較 |

### ボードとタグの管理

9群、118行。設定、名前、完了レーン、入出力、タグと色を管理する。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [サイドバーの設定パネル](../observations/settings-board.md#settings-board.section) | 1 | 5 | 文脈固有 |
| [言語の設定](../observations/settings-board.md#settings-board.language-input) | 1 | 4 | 文脈固有 |
| [ボード・レーン・タグの名前入力](../observations/shell.md#shell.new-board) | 5 | 32 | 画面横断で比較 |
| [完了レーンの設定](../observations/settings-board.md#settings-board.completion) | 1 | 18 | 文脈固有 |
| [完了レーンの設定案内](../observations/settings-board.md#settings-board.hint) | 1 | 6 | 文脈固有 |
| [ボードデータの入出力](../observations/settings-board.md#settings-board.export) | 1 | 10 | 同じ領域内で比較 |
| [管理対象の削除入口](../observations/kanban.md#kanban.lane-delete) | 3 | 15 | 画面横断で比較 |
| [タグの管理と設定フォーム](../observations/settings-tags.md#settings-tags.section) | 1 | 16 | 同じ領域内で比較 |
| [任意色の設定](../observations/settings-tags.md#settings-tags.color-field) | 1 | 12 | 現行の共有あり |

### 外部課題との連携

4群、79行。外部課題の取り込み、参照、同期と照合。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [外部課題取り込みのパネル](../observations/remote-import.md#remote-import.sheet) | 2 | 35 | 文脈固有 |
| [外部プロバイダーの選択](../observations/remote-import.md#remote-import.providers) | 1 | 11 | 文脈固有 |
| [外部対象の参照](../observations/ticket-edit.md#ticket-edit.remote-title) | 4 | 20 | 現行の共有あり |
| [外部スナップショットの情報と更新](../observations/ticket-detail.md#ticket-detail.remote-summary) | 1 | 13 | 文脈固有 |

### 会話と履歴

5群、46行。コメントを読む・追加・編集する、作業履歴を読む。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [チケットのコメント一覧](../observations/ticket-comments.md#ticket-comments.section) | 1 | 6 | 文脈固有 |
| [コメントの投稿と編集](../observations/ticket-comments.md#ticket-comments.composer-trigger) | 1 | 12 | 同じ領域内で比較 |
| [コメント単体の操作](../observations/ticket-comments.md#ticket-comments.menu-toggle) | 1 | 13 | 文脈固有 |
| [コメントの外部送信](../observations/ticket-comments.md#ticket-comments.sync-failed) | 1 | 9 | 同じ領域内で比較 |
| [チケットの活動履歴](../observations/ticket-activity.md#ticket-activity.section) | 1 | 6 | 同じ領域内で比較 |

### 確認とフィードバック

6群、89行。操作の確定、エラー、処理状態、空状態、通知。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [表示対象がない場合の案内](../observations/home.md#home.empty-panel) | 9 | 29 | 画面横断で比較 |
| [領域内の状態・エラー表示](../observations/custom-view.md#custom-view.warning) | 13 | 16 | 画面横断で比較 |
| [確認・操作モーダルの枠](../observations/dialogs.md#dialogs.shell) | 1 | 21 | 現行の共有あり |
| [移動先の指定](../observations/dialogs.md#dialogs.bulk-board-field) | 1 | 16 | 同じ領域内で比較 |
| [Group所属変更の影響確認](../observations/dialogs.md#dialogs.group-impact) | 1 | 5 | 同じ領域内で比較 |
| [一時的な結果通知](../observations/toast.md#toast.notification) | 1 | 2 | 現行の共有あり |

### 本文とMarkdown表現

5群、232行。本文、説明、コメント等のコンテンツを読む。

| 比較群 | 画面・領域数 | 行数 | 評価 |
| --- | ---: | ---: | --- |
| [本文の閲覧元の切替](../observations/ticket-edit.md#ticket-edit.body-tabs) | 2 | 7 | 画面横断で比較 |
| [チケット本文の表示](../observations/ticket-edit.md#ticket-edit.remote-body) | 2 | 6 | 文脈固有 |
| [外部とローカル本文の差分](../observations/ticket-detail.md#ticket-detail.body-diff) | 1 | 4 | 文脈固有 |
| [本文・最新コメントの抜粋](../observations/custom-view.md#custom-view.excerpt) | 1 | 5 | 同じ領域内で比較 |
| [Markdownの描画](../observations/group.md#group.description-markdown-paragraph) | 5 | 210 | 現行の共有あり |
