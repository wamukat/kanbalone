# 共通UI部品の利用契約

画面に操作や情報を加えるときは、先に利用者の目的を決め、対応する既存部品と用途差を選びます。部品の内側の文字・色・枠・フォーカスは共通の定義元が持ち、画面側は置く場所・幅・折返し・保存など、画面固有の条件を持ちます。[UI/UXレビュー規則](ui-ux-review.md)

同じ版の製品ソースで確認した共有定義と用途差を記録します。画面別の消費先と代表回帰、再検討する条件も確認できます。カタログの基準 `2ff8489d889706a6dc6392fd28aeff073e0b515c` の原画像・実測は、その版の証拠です。この契約は、製品の変更を受け入れるたびに影響する行だけ更新します。[利用先と回帰確認](ui-component-adoption.md) · [基準版のカタログ](ui-component-catalog/README.md) · [実施計画](ui-component-catalog/semantics/implementation-plan.md)

初版の製品基準は、[PR #73](https://github.com/wamukat/kanbalone/pull/73) を取り込んだ `main` の `1b2588380e764e9c31fa99c7bf6a4103826a0c9e` です。製品コード・テスト・依存定義は監査基準SHAと一致しています。個別の実装では、その変更で採用した基準と変更後の結果を記録します。

## 定義元・利用先・確認

ここでいう定義元は、指定の責務を持つ既存ソースです。表の利用先は今回の整備範囲と、該当変更の代表確認先です。

| 部品と役割 | 現行の定義元と代表利用先 | 維持する用途差 | 実装と主な回帰確認 |
| --- | --- | --- | --- |
| ボタン | `public/styles/components.css` の基礎定義と `.primary-action`、`.ghost`、`.danger`、`.danger-confirm-action`、`.icon-button`。出力ボタンとJSON取り込みラベルは `components.css` と `dark-mode.css` の見た目を共用し、配置は `sidebar-board-settings.css` で共用。チケット・設定・確認・一括操作もボタン下地を使用。 | 通常、主操作、危険な操作への入口、破壊的な確定、アイコン専用。ツールバー・表のコンパクトな寸法、余白と並び方は利用先の条件。`font: inherit` はボタン専用。取り込みはファイル入力を開くラベルのまま。 | 基礎宣言を共用する変更は `layout-visual-system.spec.ts` と `board.spec.ts` で出力と取り込みの外観、ネイティブファイル選択、通常・危険・キーボード状態を確認する。主ボタンの無効状態は `lane-completion.spec.ts` と `ticket-editor-remote-import.spec.ts` で確認する。 |
| 文字・検索・複数行入力 | `public/styles/forms.css` と `dark-mode.css` の面・枠・文字・フォーカス。ツールバーとGroup検索では検索入力、チケット編集・取り込み・共通操作欄では型なしテキスト、`text`、`search`、`url` が対象。対応する `select` と `textarea` もそれぞれの入力定義を使う。ボード改名とタグ作成は `forms.css` で小型入力の面・枠・余白とフォーカスの枠・影を共有し、確定・取消は `public/app-inline-text-form.js`。 | 単一行と複数行、外側の枠と入力の組み合わせでフォーカスを示す検索・ピッカー。タグ作成の最小高さと常時アウトラインの指定、改名のフォーカス時のアウトライン、初回ボード新規作成の強調はそれぞれの表示定義が持つ。 | 代表は `layout-visual-system.spec.ts` と `layout-toolbar.spec.ts` の入力・配置・フォーカス、ボード改名とタグ作成の既存E2E。コメントの投稿と編集は上下 `0.65rem`、左右 `0.8rem` の内側余白を使い、編集欄の面と枠は `comments-activity.css` で管理する。添付・取消・保存の代表は `image-attachments.spec.ts`。 |
| ネイティブselect | `public/styles/forms.css` と `custom-views.css` のネイティブ選択。利用先はレーン・タグの条件、チケット入力、移動先、カスタムビューの条件と並び順。 | 選択値の文字とラベルの強調、用途別の幅・候補。無効、空候補、値欠損、読み直し、一時変更と保存は利用操作に従う。 | カスタムビュー一覧と設定の並び順selectは `custom-views.css` で値を400に揃える。設定ラベルは600で表示する。代表は `layout-toolbar.spec.ts` と `custom-view-lanes-order.spec.ts`。 |
| チェックとラジオ | Listの行・全選択、完了レーン、カスタムビュー、取り込みにネイティブのチェック入力を使用。カスタムビューの対象範囲はネイティブのラジオ、取り込みのプロバイダー選択はボタンとARIAのラジオ。任意色の既存スイッチは `public/styles/toggles.css` と `app-ux-color-field.js`。 | チェック、部分選択、プロバイダーのボタン型ラジオ、任意色のスイッチ。操作可能な入力、読み取り専用の記号、内部のhidden入力を区別。 | 取り込みのリンク投稿欄は専用の横並びラベルと自然幅のネイティブチェックを使用する。チェック・ラジオ・色・ファイル・hiddenは文字入力の面と寸法の適用範囲から外れる。ネイティブのタグ色入力の面・枠・フォーカスは `public/styles/tag-color-dialog.css` が持つ。無効状態と配置は `public/styles/sidebar-tags.css` が定義する。色スイッチの左右に余白を取り、色のオン・オフにかかわらず `#RRGGBB` の7文字が入力欄を操作せず読める幅を確保する。狭い表示ではスイッチの下で16進入力とピッカーを並べる。通常幅・狭幅のスイッチの余白、狭い表示での文字の収まり、色の操作・保存は `test/e2e/tags.spec.ts` で確認。`ticket-editor-remote-import.spec.ts` と `test/app-remote-import-api.test.ts` を利用して選択・送信値・保存と、模擬連携で投稿回数を確認。 |
| ダイアログ | `public/styles/dialog-shell.css` と `app-dialogs.js`。チケットは `app-editor.js`、確認・移動は `app-ux.js`。両方の枠が、それぞれ枠線・背景・影を指定する。チケット枠は `color: var(--text)` で本文の前景も持つ。 | チケット編集の `show()` と、確認の `showModal()`。独自背景・ネイティブbackdrop、ドラッグ、リサイズ、閉じる操作とフォーカス復帰。 | チケット枠の前景をテーマの本文色に統一済み。明暗の本文・補足・警告、Esc、取消、保存中、フォーカスを確認。代表は `layout-visual-system.spec.ts` と `ticket-view-styles.spec.ts`。 |
| 文字・メタ情報・面 | `public/styles/tokens.css` の文字階層と `.muted` を使用。`ticket-detail.css` でチケット本文・コメント一覧・アクティビティ一覧の枠、角丸、背景、余白を共用。`comments-activity.css` でコメントとアクティビティの日時・補足行の配置を共用。 | 主題・値・補足・状態の文字階層、本文の行高、各一覧の項目間の区切り、本文・コメントの閲覧と編集の配置は利用先で定義。 | 明暗の本文・コメント・活動、入力と切替時の周辺位置・スクロール・フォーカスと保存後を比較する。代表は `layout-visual-system.spec.ts`、`ticket-detail-inline.spec.ts` と `ui-smoke.spec.ts`。 |
| タグ・状態・優先度 | `public/app-tags.js`、`app-ticket-status.js`、`app-priority.js` が値、色、記号を描く。Kanban、List、Group、カスタムビューの一覧とチケット詳細で、役割に応じた共通描画を使用。 | 読取タグと解除チップ、一覧の状態記号と詳細で復元できる状態ピル。優先度バッジ・コンパクトなアイコン、指定色、長い名前、完了とアーカイブの区別。 | 仮想行、親子、移動は各画面が扱う。代表は `ticket-view-styles.spec.ts` と `group-presentation.spec.ts`。[画面ごとの利用先](ui-component-adoption.md#tag-status-priority) |
| リンク・タブ・フィードバック | リッチテキストは `public/styles/content-markdown.css`、共通のMarkdownリンク色・hover・フォーカスも同ファイルが持つ。Group固有のメタリンクは `groups.css`。詳細タブは `.detail-tab`、保存状態は `.editor-save-state`、短い通知は `app-toast.js`。 | 本文中のリンク、チケットを開くタイトル、所属Groupへの移動を区別。タブの選択、フィールド近くのエラー、送信中、短命のトーストは各状態の作用範囲に置く。 | Groupと同じリンク語彙を本文・コメント・リモート本文・説明プレビューへ適用済み。`group-presentation.spec.ts` のリンク検査と、Group以外の代表利用先の回帰を使う。初回ボード案内の可視文言は `sidebar-boards.css` の `attr(aria-label)` で既存の翻訳済み操作名を使用する。 |

新しい定義を足す際は、同じ役割の既存の利用先を一つ選び、必要な用途差と適用条件を説明します。既存の文字・色・角丸・間隔のトークンを使い、広い親セレクターで配下の全ボタンや全入力の型を巻き込まないようにします。共用するのは役割が一致する部位です。保存、取消、消去、ドラッグ、一覧の仮想化、候補検索の挙動はそれぞれの契約を保ちます。[視覚語彙と用途差](ui-component-catalog/semantics/design-consistency.md)

## 状態の確認

| 状態 | 適用する規則 |
| --- | --- |
| サイドバーのスクロール | デスクトップの `app-shell.css` はスクロールバーの領域を確保し、タグ編集の開閉時に周囲の幅を保つ。`sidebar-boards.css` はボード追加ボタンの高さを保つ。編集でスクロールが必要になる場合の表示幅・配置・取消後の復帰は `test/e2e/sidebar-layout.spec.ts` で確認する。 |
| 通常・hover | 意味に合う既存の面・色・枠を使う。ポインター位置の反応と押せる範囲を確認する。 |
| フォーカス | キーボードで到達した要素を識別できる。入力の外枠を使う場合も、選択状態と見分けられる。変更が関係する強制カラーでは既存の識別手段を保つ。 |
| 無効・読み取り専用 | 操作の可否を入力自身と表示に反映する。読み取りやコピーが可能な場面は残す。完了レーンの保存、外部Issueの取り込み、Groupフォームなどの `.primary-action:disabled` は `components.css` で `--surface-inset`、`--border-strong`、`--text-muted` と `not-allowed` カーソルを使う。ラベルの不透明度を保ち、主ボタンの強調色は有効時のhoverに適用する。Groupの他の無効ボタンは `groups.css` が管理する。 |
| 読込中・保存中 | 状態ラベルと、その間に抑止する操作を合わせる。位置、入力、結果を必要な間保つ。 |
| エラー | エラー本文・記号は既存の危険色を使う。取消・再試行は操作自体に応じた外観とし、原因の近くに説明を置く。 |
| 選択・現在地 | 選択値、現在の画面、矢印で指す候補、DOMフォーカスを区別する。既存の `checked`、`indeterminate`、ARIA値を実際の操作に合わせる。 |

## 変更と一緒に更新するもの

1. 対象の行に、定義元・実際に使う画面・残す用途差・影響する状態とテストを記録する。追加や変更は、定義を使う側の実装と同じPRで照合する。
2. 同じ条件の変更前後を比較し、意図した表示差と維持する動作を区別する。日英と明暗のうち影響する条件、PC基準幅、必要な狭幅とキーボードを確認する。値を変更する操作は再表示と保存結果を追う。未検証の項目は理由を添える。
3. 固定版の画像・計測・分類はその版の記録として残す。現在の規則や検証先はこの契約で更新し、変更版の結果は実際に測った版に結び付ける。利用先や保留条件が変わったら[利用先の記録](ui-component-adoption.md)も更新する。

画像の添付、受け入れ前の確認、既存のPRルールは引き続き[UI/UXレビュー規則](ui-ux-review.md#per-ticket-image-evidence-required)に従います。

## ダイアログ前景とMarkdownリンクの確認

[変更前後の原画像・計測・操作記録](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-content-contrast/README.md)で6種類のMarkdown領域とダークの履歴を確認しました。補助色とGroup固有の表示は維持し、内部参照へのTab・Enter、長文編集の破棄取消、保存済みデータの再取得を確認しています。関連Chromium E2E 28件が成功しています。

## リモート取り込みのチェック欄

`public/styles/ticket-editor.css` の `.editor-remote-import-form .editor-remote-backlink-toggle` がラベルを横並びにし、その直下のcheckboxのみ幅・余白を指定します。他のテキスト、URL、プロバイダー選択の表示は共通化の対象に含めません。ラベルクリックとSpace、チェック解除時の任意URLの消去・無効化、取消後の再開、送信値と保存を既存の操作契約として維持します。

[同条件の変更前後と操作・保存結果](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-remote-check-layout/README.md)。回帰検証は `test/e2e/ticket-editor-remote-import.spec.ts` と `test/app-remote-import-api.test.ts` です。

## 初回ボード作成の案内

可視案内とアクセシブルな操作名は、既存の翻訳を共有します。[日英・明暗の原画像と操作記録](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-home-guidance/README.md)で、位置・寸法・色の維持、取消時の空状態、作成後の保存結果と再読込、案内の消去を確認しました。関連Chromium E2E 16件が成功しています。

## CSSカスタムプロパティの参照

`pnpm lint:css-tokens` は、`public/styles.css` からバンドルされるローカルCSSの `var()` を検査します。`pnpm lint` と `pnpm check` にも含まれます。名前の供給元は同じバンドルのカスタムプロパティ宣言、`@property` 登録、検査に明記したJavaScriptの供給元です。現在のJavaScript供給元は `public/app-filters.js` が実測する `--shared-toolbar-height` です。

供給元が見つからない名前にはフォールバックが必要です。そのフォールバック内にある `var()` も同じ順序で調べます。エラーには参照元のファイルと行番号が出ます。検査は名前の存在を扱います。セレクターやメディア条件ごとの到達性、循環参照、値の型、最終的な描画は実際の利用先で確認します。[検査の実装](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/scripts/check-css-tokens.mjs)・[回帰テスト](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/test/css-token-guard.test.ts)

チケットの本文差分は、外枠と各行の記号・背景色で変更箇所を示します。行の下辺と記号欄の右辺には追加の線を表示しません。[明暗の変更前後](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-diff-token-guard/README.md)
