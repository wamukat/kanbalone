# スタイルの共通定義案

基準は `2ff8489d889706a6dc6392fd28aeff073e0b515c`。画面別の観測に沿って、既存のCSSトークン、クラス、描画関数を使う範囲を定義しました。部品の数より、宣言や描画処理を共有したときに同じ役割を一か所で管理できるかを判断します。比較は同じ状態・テーマ・画面幅の観測を優先し、条件の異なる例は用途差や再確認の根拠として扱います。[意味別分類](taxonomy.md) · [実測の差分](style-comparison.md) · [基礎スタイル](../style-source.md)

6変更単位は最初の是正と宣言整理です。現行の共通定義を使う範囲、今後の用途差、回帰の引き受け先は追加評価に記録しています。[デザインの統一性](design-consistency.md) · [実装・保守方針の全体評価](architecture-assessment.md)

## 先に直す表示差

| 対象 | 観測とソース | 変更案 |
| --- | --- | --- |
| ダークのアクティビティ本文 | 日本語の明暗で本文はともに `rgb(0, 0, 0)`。ダークでは親の `#editor-dialog` も同色で、背景は `rgb(23, 29, 25)`。本文に前景色指定がなく、`.editor-dialog` にも前景色指定がない一方、`.ux-dialog` は `--text` を指定する。[活動本文の観測](../observations/ticket-activity.md#ticket-activity.message) · [チケット枠の観測](../observations/ticket-detail.md#ticket-detail.dialog) · [dialog-shell.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/dialog-shell.css#L1) · [活動レンダラー](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-ticket-detail-renderers.js#L125) | チケット枠の既定前景色に `var(--text)` を与える。既定文字の期待色はライトで `rgb(21, 32, 28)`、ダークで `rgb(238, 244, 241)`。本文、補足、警告、リンクの既存個別色を確認し、変化するのは未指定の継承元の値だけとする。 |
| リモート取り込みのリンク投稿チェック欄 | 日本語ダークのドロワーでラベルはグリッド、チェック入力のDOMボックスは467×13px。ネイティブのチェック記号は行中央、説明は次行。広い `.editor-form input` が100%幅とダーク背景を供給し、広い `.editor-form label` が詳細度差で専用の横並び規則に勝っている。[チェック欄の観測](../observations/remote-import.md#remote-import.backlink-check) · [forms.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/forms.css#L1) · [横並び指定](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/ticket-editor.css#L131) · [ラベル上書き](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/ticket-editor.css#L247) · [ダークの指定](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/dark-mode.css#L38) | `.editor-form .editor-remote-backlink-toggle` でリンク投稿ラベルの横並びを適用し、直下のチェック欄は用途を絞って自身の大きさで配置する。チケットフォームのフォーカス規則はすでにチェック欄を除外しているので、ネイティブのフォーカスを保つ。文字入力とダーク指定の広い適用対象は、局所是正を検証してから別単位で絞る。 |
| Markdownリンクのダーク表示 | 同じサンプルの日本語ライトでGroupの説明とプレビューは `rgb(31, 111, 95)`、チケット本文とコメントは `rgb(0, 0, 238)`。日本語ダークのリモート本文と編集側のリモート本文も青。Groupだけ `--accent`、hover、フォーカスの指定を持ち、チケット側はその指定の外にある。[Group説明](../observations/group.md#group.description-markdown-link) · [Groupプレビュー](../observations/settings-group.md#settings-group.preview-markdown-link) · [ローカル本文](../observations/ticket-detail.md#ticket-detail.local-markdown-link) · [リモート本文](../observations/ticket-detail.md#ticket-detail.remote-markdown-link) · [編集側のリモート本文](../observations/ticket-edit.md#ticket-edit.remote-markdown-link) · [コメント](../observations/ticket-comments.md#ticket-comments.body-markdown-link) · [groups.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/groups.css#L375) | Groupですでに使うリンクの色とフォーカスを `.markdown a[href]` の共有ルールに整理する。ブラウザー既定の下線、長いURLの折返し、Tabでの識別を保つ。本文中の `#番号` も同じ対象。Group所属リンクや一覧のチケットリンクは各操作のスタイルを使う。 |
| 日本語の最初のボード作成案内 | ボード0件の日本語画面で矢印の案内が英語の「Create board here」。見える文字はCSSの `content` で固定。ボタンのtitleとアクセシブル名には既に日本語訳がある。[空のホーム](../observations/home.md#home.board-create-cue) · [sidebar-boards.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/sidebar-boards.css#L45) · [app-sidebar-boards.js](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-sidebar-boards.js#L39) | 既存の翻訳「最初のボードを作成」を描画側から案内の属性に渡す。CSSは配置と装飾を担当する。案内の表示条件、英語、日本語、読み上げで同じ操作が伝わることを確認する。 |

## 横断する基本型の定義

| 基本型 | 共用する定義 | 用途ごとの責務と確認点 |
| --- | --- | --- |
| ボタン | `components.css` の実ボタンと `.import-button` に共通する文字サイズ・太さ・行高・面・枠・角丸・余白・hoverの宣言をカンマ区切りで共有できる。実ボタン固有の `font: inherit` は出所を保つ。ダーク側の重複にも同じ境界を適用。ExportとImportは同じ設定画面の実測で12px・500・行高15.6px、角丸6px、双方105.406px幅で、横並びの宣言も共有候補。[Exportの観測](../observations/settings-board.md#settings-board.export) · [Importの観測](../observations/settings-board.md#settings-board.import) · [components.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/components.css#L1) | 標準、`.primary-action`、`.ghost`、`.danger`、`.danger-confirm-action`、`.icon-button` を既存の用途差として扱う。一括操作・ツールバー・ミニ操作の密度、押下状態、確定効果、切替フォーカス、ファイルラベルのクリック先を維持。操作全体の横並びの寸法を確認する。 |
| 文字・検索・複数行の入力 | `--control-bg`、`--control-border`、`--radius-control`、前景、`--font-size-control`、既存フォーカスリングを入力の責務に集める。局所是正の後で、`.toolbar`・`.editor-form`・`.ux-fields`・Group検索の対象を明示型または入力用途のクラスに限定する。型なしの標準テキスト入力とURL、検索、textarea、selectを現行の画面で確認する。[forms.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/forms.css#L1) · [tokens.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/tokens.css#L19) | ピッカーとツールバーの検索は外枠がfocus-withinを持つ。Group検索は結果移動、候補検索は確定・解除、ツールバー検索は絞り込み。textareaの行高・高さ・行数・添付処理、インライン入力の選択と取消は局所の仕様。 |
| ネイティブ選択欄 | selectの枠と文字はフォームの共通トークンを使う。設定、フィルター、編集のネイティブselectを維持し、操作を共用できるかは選択後に保存・適用されるタイミングまで照合する。[forms.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/forms.css#L19) · [custom-views.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/custom-views.css#L55) | ツールバーの条件色、カスタムビューのコンパクトなselect、リモートの入力幅、移動時の空候補・無効化を維持。選択メニューの見え方はブラウザーとOSで確認する。 |
| チェック・ラジオ | ネイティブの入力とアクセシブルなラベルを維持する。Listの選択では実測14×14px、設定の完了レーンでは14×14pxと `--accent` が観測済み。揃えるのは実際に同じ密度を求める欄のレイアウトと共通トークン。まずリモートの広すぎる入力を限定修正する。[Listの全選択](../observations/list.md#list.check-all) · [完了レーン](../observations/settings-board.md#settings-board.completion-check) | 行の全選択・部分選択、設定の選択／通信中disabled、タグ任意色のカスタムスイッチ、リモートプロバイダーのボタン型ラジオを用途別に保つ。共通の緑色に寄せる変更は選択時や強制カラーを観測してから判断する。 |
| ダイアログ | 共通化の対象は面の枠・角丸・背景・前景・影。チケット枠の前景を是正した後、主に宣言が同じ箇所を `dialog-shell.css` の共通ルールに置く。[dialog-shell.css](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/dialog-shell.css#L1) | チケットの `show()` と独自背景・移動・リサイズ、確認の `showModal()` とネイティブbackdrop・フォーカスのモードは別。閉じる／編集ペンの寸法を一律化せず、Esc、取消後の復帰、ドラッグ、スクロール、未保存、保存中を確認する。[チケットの開始](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-editor.js#L506) · [確認の開始](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-ux.js#L26) |
| 文字・メタ情報 | `--text`、`--muted`、`--font-size-label`／`--font-size-meta`／`--font-size-body` を内容・補足・状態の区別に使う。コメント・活動のメタ行は現在のレイアウト宣言が一致し、コメント・活動・本文の面は背景、枠、角丸、余白が一致。共用するのは一致する宣言で、前景、行高、折返し、子要素は用途別に保持する。[日時表示](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/comments-activity.css#L62) · [面の宣言](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/ticket-detail.css#L451) | 日時・補足・主タイトルの階層は維持。状態チップやタイトルリンクの利用目的と文字強調を個別に読む。 |
| タグ・状態・優先度 | 読取タグの `renderTag` と `tagToneClass`／`tagBackgroundStyle`、優先度の既存描画、状態の `renderTicketStatusIcons` を再利用する。名前の短縮、完全なアクセシブル名、無色・指定色、完了とアーカイブの意味を保つ。[タグ描画](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-tags.js#L13) · [優先度](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-priority.js#L37) · [状態](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-ticket-status.js#L9) | 選択解除チップ、タグ設定ボタン、読取タグは操作を区別する。KanbanやGroupに使うマスク記号の寸法、一覧の密度、詳細の復元動作も個別に保持。色に加えて記号とラベルで意味を伝える。 |
| リンク・タブ・通知 | Markdownのリンクを既存のGroupの語彙に揃える。チケットのタブは既存の `.detail-tabs` と `.detail-tab`、編集中の状態は `.editor-save-state`、短命の全体通知は `#toast` を再利用する。[タブ](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/comments-activity.css#L21) · [保存状態](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/styles/dialog-shell.css#L194) · [トースト](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-toast.js#L2) | 検索結果のリンクはタイトル折返し・強制カラー・親文脈の非操作を保持。タブごとのコンテンツ、処理中／失敗／回復、連続通知と短命の通知は別の振る舞いを保持する。 |

## 38の比較群による判断

この表の「共用候補」は、比較対象にできる宣言か既存の描画処理を示します。実測で状態を揃えられなかった差は未確認として扱います。群IDは[分類表](taxonomy.md)と同じ範囲です。

| 比較群 | 設計判断 | 共用範囲と用途差 |
| --- | --- | --- |
| `sidebar-visibility` | 既存共用を継続 | `.icon-button` のアイコン枠。ボードタイトルの再開とサイドバー端の閉じる操作は、DOM位置・ヒット領域・広狭幅での表示条件を保つ。対象はShellとGroup。 |
| `destination-nav` | 行の統一は保留 | 同じ未選択状態でボードは500／行高18.2px・高さ38.375px、ビューは400／20.3px・39.0781px。今回の変更単位から行の密度を外す。既存の文字色・枠・現在位置の語彙、ボードのドラッグとリンクの遷移を保つ。密度の揃え方は長い日英名、選択中、hoverとフォーカス、狭幅、ドラッグの途中を確認してから決める。[ボード](../observations/shell.md#shell.board-button) · [ビュー](../observations/shell.md#shell.custom-link) |
| `board-select-filter` | 既存共用を継続 | レーンとタグはツールバーの共通select定義。Listだけのレーン選択、件数や選択中の強調、ツールバー高さの共有計測を保持。 |
| `board-facet` | 既存共用を継続 | `.filter-menu` と展開処理はすでに共有。完了条件と優先度で選択肢・既定値・解除ボタンの予約区画・展開幅が異なる。幅を固定する変更に独立した観測が必要。 |
| `lane-inactive-disclosure` | 用途差を維持 | 「もっと見る」「たたむ」の操作型を比べる。サーバーから次を読む完了レーンの段階表示と、折り畳まれた解決済み・アーカイブ済みの要約を一つの計算やDOMに統合する根拠は薄い。 |
| `ticket-collection` | 固有レイアウトを維持 | 共通面トークンまで。Kanbanの列、Listの固定高とオーバースキャン、Group親子行のオフセット、カスタムビューのページを共有ラッパーやスクロール実装にまとめると性能と位置復帰に影響する。 |
| `ticket-item` | 子要素を比較 | タイトル、状態、優先度、タグは追える。行全体はチェックとD&D、階層、カード、抜粋で構造と操作が異なる。 |
| `ticket-order` | カスタムビューの同一selectで揃える | 並び順selectは保存済み一覧と設定で35px高、同じ面と内余白。値の文字は400と600で、設定側は `.cv-field` から600を継承する。共通の値の読取に400を用い、設定のラベルは600を保つ。単位6は `select[data-view-appearance="sort"]` と `#custom-view-form select[name="sort"]` に限定し、Listの三段階操作は維持する。[一覧の並び順](../observations/custom-view.md#custom-view.sort) · [設定の並び順](../observations/custom-view-settings.md#custom-view-settings.sort) |
| `ticket-selection` | 既存共用を継続 | List表の行チェックと全選択の同寸法を保つ。部分選択は既存 `indeterminate`、親子選択はアイコン操作。大件数の選択性能、クリック範囲、フォーカスを優先。 |
| `bulk-ticket-actions` | 既存共用を継続 | 同じListの上と下で共通のアクション描画を使用。未選択時の高さ、操作アイコンと詰め込み、件数、対象の移動・アーカイブ・復元・削除を維持。 |
| `ticket-identity` | 子要素を比較 | 番号ラベルと言語に依存するタイトルの扱いを確認。操作可能なタイトルと、フィルターから外れた親文脈、閲覧編集切替の見出しを用途別に扱う。Listの省略とカスタムビューの折返しを保つ。 |
| `ticket-status` | 既存描画を再利用 | 一覧とKanbanの完了／アーカイブアイコンは既存描画。詳細の状態ピルは展開すると復元できる。状態色やアイコン辞書を共有し、操作付きの表示は固有のまま。 |
| `ticket-lane-value` | メタ情報を比較 | 読取レーン名と補足色を同じ語彙で表す。ラベル有無、一覧列幅、空のレーン名、配置上の字下げは各画面の責務。 |
| `ticket-relations-value` | 語彙を再利用 | ブロッカーの件数、一覧の参照番号、詳細の関係チップは入口と情報量が異なる。依存の向きと解決済み参照の読み取り、リンク操作を維持し、色と記号の規則を共有。 |
| `ticket-inline-editor` | 入力の面を比較 | 通常フォームのフォーカストークンを利用。即時タイトル、優先度select、保存が必要な本文の確定・取消・入力フォーカスは個別。 |
| `ticket-actions` | 既存ボタン語彙へ | 破壊的な確定と通常操作を分ける。編集・移動・アーカイブ・復元・削除の確認、保存中、ローカル／外部連携の制限を維持。 |
| `ticket-tag-picker` | 既存共用を継続 | タグと関係ピッカーは `.ticket-tag-input`、`.tag-picker-item` 等をすでに共有する。タグ色見本と新規タグ作成、関係の候補取得と再試行を保つ。 |
| `group-navigation` | 用途差を維持 | Group一覧の選択と未所属を同じ領域内に保つ。件数・非アクティブ・進捗付きの表示と未所属表示の差、現在選択の印を保持。 |
| `group-order` | 記号を再利用 | 既存の方向表示と共通アイコンを使う。Groupの作成日／名前とListの列ソートは別の操作で、ボタン密度と並べ替え対象を維持。 |
| `group-description` | Markdownリンクを共有 | 読取とプレビューの既存リンク規則をMarkdown共通の対象にする。短い要約、開閉、Markdown編集、未保存のフォームと保存済みの表示は個別。 |
| `group-members` | 部位の比較を保留 | Groupから外す操作はGroup一覧と編集の両方で同じ要素を使う。候補と選択チップの面・フォーカスは別の比較で、Group未割当と親子単位、関係候補の複数種別で絞り込みと追加結果が異なる。追加、解除確認、保存された所属を照合してから共有範囲を決める。 |
| `group-name-editor` | 入力面だけを比較 | 作成・改名で名前入力のトークンを利用。可視の確定・取消を持つGroupフォームを、Enter/Escで行うボードやレーンの編集ヘルパーへ機械的に置換する理由はない。 |
| `custom-view-definition` | 既存共用を継続 | 新規と編集は既存の設定フォームで共有。保存、削除、プレビュー、再フォーカスの条件を保持。サイドバーからの開始ボタンは起点として独立。 |
| `custom-view-board-rule` | 反復レイアウトを維持 | タグとレーンの2行に同じ配置を使用。未設定・全件・指定・欠損、各ボードのタグ／レーン候補の制約、再描画時のフォーカスと保存値を保つ。 |
| `custom-view-options` | 既存基本定義へ | ネイティブの順序selectと表示チェックの枠。設定フォームでの定義編集と、結果一覧で一時設定を保存・戻す経路は独立。長文の開閉に伴う周辺位置を確認。 |
| `inline-entity-name` | 既存ヘルパーと同値の枠を再利用 | ボード・レーン・タグは `createInlineTextForm` を使う。単位4で同値の宣言を共有する。ダークのボード名変更とタグ作成はどちらも35.5625px高、14px、行高18.2px、パディング7.7×9.1px、角丸6px。ボードの新規作成はナビからの入口で、強調の枠・面と39.0781px高の現行密度を保つ。Enter／Esc／blur、空値・競合・失敗、初回案内は個別。[ボードの作成](../observations/shell.md#shell.board-create-input) · [ボード名変更](../observations/settings-board.md#settings-board.rename-input) · [タグの作成](../observations/settings-tags.md#settings-tags.create-name) |
| `board-transfer` | 共用候補 | Export/Importの実測で対応する寸法・色が一致。現状の外形を基準に単位4でボタンとラベルの共通宣言とflex配置の重複をまとめる。ファイル選択とダウンロードの動作はそれぞれの入口。 |
| `delete-entity` | 既存の危険操作定義へ | 削除入口の色と、実際に削除する確定表示を既存CSSで区別。ボード・レーンのモーダル、タグ行内の確認、取消、他の入力の無効化はそれぞれの実装に残す。 |
| `tag-management` | 既存色ヘルパーを再利用 | タグ表示色、HEX、色あり／なしは共有済み。設定の編集ボタン、プレビュー、保存・削除、未入力エラーをチケットのタグ選択へ統合する根拠は薄い。 |
| `ticket-body-tabs` | 既存共用を継続 | 詳細・編集のLocal/Remote、詳細のDiffは同じタブの表示を使用。本文の読取専用境界、編集中のフォーカス移動、差分有無を保持。 |
| `excerpt` | 用途差を維持 | 本文／最新コメントの抜粋を同じ描画関数で扱う。最新コメント時刻、全文開閉、取得中のボタンの状態、プレーンテキストの折返しはMarkdown描画と切り分ける。 |
| `comment-editor` | 同じ本文入力の左右余白を揃える | ダークのfocus時は両方14px、121.672px高、同じフォーカス枠で、左右は投稿11.2px、編集10.5px。単位6で `.comment-edit-form textarea` の余白 `0.65rem 0.75rem` を投稿側の `0.65rem 0.8rem` に寄せる。既存コメント内の幅670.406pxと投稿欄692pxは容器の差、枠と背景は非フォーカスを両テーマで照合してから扱う。添付、保存、取消は現行経路。[投稿](../observations/ticket-comments.md#ticket-comments.composer-body) · [編集](../observations/ticket-comments.md#ticket-comments.edit-body) |
| `comment-sync` | 状態の意味を保持 | ラベル・記号・色を通常／送信中／失敗の状態語彙で比較する。プッシュ済み、再試行ボタン、エラーの原文と開閉、非同期の反映を一つの通知の動作にまとめる根拠は薄い。 |
| `activity-timeline` | 前景を是正、面は共用候補 | チケット枠から継承される前景を是正。活動とコメントに同一宣言の面・メタ行を共有できる。本文と詳細の別形式、項目の区切り、日時とイベント内容は固有。 |
| `empty-feedback` | 同じ複合表示を再利用 | HomeとListは既存 `renderEmptyState`。同じ情報量のパネルまで共有し、コメント0件やGroupの絞り込みの文章だけの表示をすべて空パネルへ拡張する理由はない。回復操作と説明文を維持。 |
| `inline-feedback` | 既存状態の語彙を再利用 | 保存状態は `.editor-save-state`、エラーは `--danger`、補足は `--muted`。ライブ通知先、画面内に置く状態とダイアログの補足、アップロード待機、エラー中の操作可否を用途で分ける。 |
| `move-ticket-fields` | フィールド面を共有 | 同じ `.ux-fields` 内のボード／レーンselect、ラベル・エラーの見た目を共用。単体と一括の宛先制約、候補読み込み途中、競合、元・先のデータ整合を各経路で確認。 |
| `group-impact-dialog` | 既存枠を再利用 | Group所属変更の影響リストと共通UXダイアログを用いる。候補ボタンで所属先を決める競合表示と、対象を外す場合の確定内容を区別。親子関係やチケット自体に変更がないことを確認。 |

## 変更を分ける単位と検証

| 順序 | 変更の単位 | 受け入れ確認 |
| --- | --- | --- |
| 1 | リモート取り込みのチェック欄を局所修正 | 同じ入力条件でチェックと文言が並び、ラベルとSpaceで切替できる。オンで任意のKanbalone URLを表示・有効化し、オフで非表示・無効化して入力を消去する。模擬プロバイダーで `postBacklinkComment`、任意の `backlinkUrl`、投稿回数と保存結果を確認する。プレビュー・重複・取消・エラーを通し、ツールバー、チケット入力、移動先、Group、タグ色の入力枠を比較。[送信値](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-editor-remote-import.js#L132) · [URLの表示条件](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/public/app-editor-remote-import.js#L273) · [サーバーの投稿条件](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/src/routes/board-remote-import-routes.ts#L130) |
| 2 | ダイアログの既定前景とMarkdownリンクを是正 | ダークのアクティビティ本文と同じ段落が読め、既存の補足色・警告色は保持。明暗でチケット本文・外部本文・外部編集・コメント・Group説明・説明プレビューのURLと `#番号` を表示し、フォーカスから開けることを確認。シェルの寸法、ドラッグ、モーダルやスクロールの挙動にも再計測を行う。 |
| 3 | 最初のボード作成案内を翻訳へ接続 | 新規データで日本語・英語の文字と作成アクション、案内位置、ボード作成後の表示状態を確認する。 |
| 4 | ボタンの完全重複を共有し、フォームの適用対象を整理 | `components.css` と設定転送行、コンパクトな明示入力に同値宣言をまとめる。文字入力ルールとダーク上書きの対象型の限定は、単位1と別で影響範囲を検査。既存セレクターの詳細度・順序を保ち、Export/Importの同寸法、選択不足・通信中・disabled・focus-visible・hover・危険操作、周辺の操作位置を明暗と主要幅で比較する。 |
| 5 | 同じ面・メタ情報の宣言を共有 | コメント・活動・本文の面、タグ・優先度・状態表示の既存ヘルパーの再利用を先に確認。仮想表示や並べ替え、親子、スクロール復帰に関わるDOM構造は画面固有のまま扱う。 |
| 6 | 同じ役割の入力に限り文字の太さ・左右余白を揃える | カスタムビューの並び順selectとコメントの投稿／編集に限る。実測値は従来と変わるため、文字の強調と余白の意図した差を確認。長い順序名と値の保存・再表示、コメントの入力・添付・投稿・編集・取消、Tabや該当するショートカットを両テーマで比較する。 |

実装時は変更単位ごとに、同じ合成データと表示状態で基準SHA・変更版の原画像を撮る。**是正を含む単位1〜3**では該当する文字色、配置、案内文の意図した差と、周辺の維持を確認する。**宣言の整理を行う単位4〜5**では対象の実測値・配置と操作結果が一致することを確認する。**共通の見た目へ寄せる単位6**は、単位4〜5の可視差のない整理から独立させ、該当欄の差と影響範囲を個別に比較する。日英・明暗とPCの標準幅を起点に、該当する狭幅、キーボード、処理中、取消、失敗、再開を確認する。設定や取り込みなど保存を伴う操作は、表示結果と保存後の値を個別に確かめる。[画面の評価手順](https://github.com/wamukat/kanbalone/blob/2ff8489d889706a6dc6392fd28aeff073e0b515c/docs/development/ui-ux-review.md)

本案の観測は基準版です。候補の実装、実装後の実測、比較が揃わなかった条件の確認は次の作業に残ります。第一段階の後は、共通定義の利用範囲を実装と回帰テストで確かめます。[段階的な移行と完了条件](architecture-assessment.md)
