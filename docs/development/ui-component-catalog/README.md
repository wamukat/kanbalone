# UI部品カタログ

画面ごとの現状を記録し、その一覧が揃ってから同じ役割の要素を比較するためのカタログです。対象の基準は `2ff8489d889706a6dc6392fd28aeff073e0b515c` です。画面別の記録は、後で共通部品へ置き換えても残します。

## 調査の順序

1. 画面・ダイアログ・主要状態を列挙し、それぞれの表示要素を個別に記録します。
2. 要素に適用されるソース上のCSSと、ブラウザーが計算したスタイルを対応付けます。
3. 網羅性を確認してから、同じ役割の要素を分類し、差分を比較します。
4. 意図したvariantと是正対象を区別し、共通部品を定義して適用します。

繰り返し並ぶ課題などは同じ画面内では要素の種類として記録します。同じ実装を利用する要素でも、異なる画面での使われ方は省略しません。未観察の状態を、確認済みとして扱いません。

## 記録の読み方

- **画面別一覧**：用途、表示位置、selector、描画元、適用CSS・トークン、主要な状態を記録します。
- **表示値**：フォント・サイズ・太さ・行高・色、背景・枠・角丸、余白・間隔・寸法・配置を観察します。ソースの宣言値とcomputed styleは区別します。
- **画像**：合成データを使った実画面の原画像です。テーマ、言語、viewport、状態、基準ソースを記録します。
- **未確認・制約**：見ていない状態やブラウザー固有の差を明記します。

基礎となる [トークンとCSS読み込み順](style-source.md) を記録しています。これはソースの宣言であり、画面ごとの実測値ではありません。

以下に全21画面・領域のソース一覧と、実画面の観測記録を掲載しています。未観測の状態は各観測ページで区別します。この段階では製品のスタイル変更や要素の統合は行っていません。

[現行の共通部品契約](../ui-component-contracts.md)から、実装時に利用する定義元と用途差を確認できます。以下の監査資料は採取した版の記録です。

## 段階的な整備計画

[実装順序・対象範囲・完了条件](semantics/implementation-plan.md)に、共通部品の契約、初期改善、既存画面への移行、回帰検証と継続運用の計画をまとめています。

## 保守性とデザイン統一性の評価

[追加評価と共通化方針](semantics/architecture-assessment.md)：個別の6是正を第一段階とし、共通定義の責務・用途別の違い・状態・利用先・回帰検証まで段階的に整備する方針です。[保守性の変更シナリオ](semantics/maintainability.md)と[デザイン統一性](semantics/design-consistency.md)に根拠を記録しています。製品への適用はまだ行っていません。

## 部品数の評価

[部品数の妥当性評価](semantics/assessment.md)では、棚卸し行と再利用する部品の種類を区別しています。全行を13用途・81比較群へ分類し、そのうち38群と横断的な基本部品を比較しています。

- [意味別の全81群](semantics/taxonomy.md)：同じ目的の要素と、専用の意味を残す範囲。
- [スタイルの比較](semantics/style-comparison.md)：同条件の実測値、意図した差、是正候補、未確認の範囲。
- [共通部品の定義案](semantics/shared-components.md)：既存の共通定義を利用する変更単位、対象画面、維持する操作と検証。

## 画面別の要素一覧

21画面・領域の1,301件の棚卸し行を列挙しています。これは独立した部品が1,301種類あるという意味ではありません。内部要素、状態違い、同じ部品の画面別の出現を含みます。各件数は画面内の繰り返しを種類として記録した要素数です。別画面での利用は別行に残しています。ソースだけで確認した状態と、実画面で測定した状態は区別しています。

| 画面・領域 | 要素数 | ソース一覧 | 実測一覧 |
| --- | ---: | --- | --- |
| カスタムビューの新規作成・設定 | 51 | [画面別一覧](screens/custom-view-settings.md) | [実測値](observations/custom-view-settings.md) |
| カスタムビューの結果一覧 | 51 | [画面別一覧](screens/custom-view.md) | [実測値](observations/custom-view.md) |
| 確認と操作のダイアログ | 43 | [画面別一覧](screens/dialogs.md) | [実測値](observations/dialogs.md) |
| Group | 125 | [画面別一覧](screens/group.md) | [実測値](observations/group.md) |
| ホーム・ボード未作成 | 17 | [画面別一覧](screens/home.md) | [実測値](observations/home.md) |
| Kanban | 90 | [画面別一覧](screens/kanban.md) | [実測値](observations/kanban.md) |
| List | 101 | [画面別一覧](screens/list.md) | [実測値](observations/list.md) |
| チケットの関係選択 | 81 | [画面別一覧](screens/picker-relations.md) | [実測値](observations/picker-relations.md) |
| チケットのタグ選択 | 17 | [画面別一覧](screens/picker-tags.md) | [実測値](observations/picker-tags.md) |
| 外部課題の取り込み | 46 | [画面別一覧](screens/remote-import.md) | [実測値](observations/remote-import.md) |
| ボード設定 | 58 | [画面別一覧](screens/settings-board.md) | [実測値](observations/settings-board.md) |
| Groupの編集 | 76 | [画面別一覧](screens/settings-group.md) | [実測値](observations/settings-group.md) |
| タグの管理 | 43 | [画面別一覧](screens/settings-tags.md) | [実測値](observations/settings-tags.md) |
| 共通シェル・ボードナビゲーション | 79 | [画面別一覧](screens/shell.md) | [実測値](observations/shell.md) |
| チケット詳細のアクティビティ | 10 | [画面別一覧](screens/ticket-activity.md) | [実測値](observations/ticket-activity.md) |
| チケット詳細のコメント | 86 | [画面別一覧](screens/ticket-comments.md) | [実測値](observations/ticket-comments.md) |
| チケット詳細 | 162 | [画面別一覧](screens/ticket-detail.md) | [実測値](observations/ticket-detail.md) |
| チケット編集 | 95 | [画面別一覧](screens/ticket-edit.md) | [実測値](observations/ticket-edit.md) |
| 詳細からのインライン編集 | 18 | [画面別一覧](screens/ticket-inline.md) | [実測値](observations/ticket-inline.md) |
| チケット新規作成 | 50 | [画面別一覧](screens/ticket-new.md) | [実測値](observations/ticket-new.md) |
| トースト通知 | 2 | [画面別一覧](screens/toast.md) | [実測値](observations/toast.md) |

[実画面の記録と制約](evidence/README.md)

## ブラウザーで読む

`pnpm docs:ui-catalog` で `dist/ui-catalog` にHTML版を生成します。このディレクトリをローカルの静的HTTPサーバーで配信すると、画面別一覧、実測値、JSON、原画像を相互にたどれます。製品画面にはカタログのメニューやスタイルを追加しません。

## 更新手順と担当範囲

1. 調査するコミットを固定します。画面・状態の追加や変更は、まず画面別一覧に記録します。
2. `screens/<画面>.json` と `screens/rules.json` をソース記録の正本として更新します。同名Markdownは閲覧用です。要素ID、実際のselector、描画元のファイルと行、適用候補CSSのselector・状態条件・宣言値、JSで指定する値を、固定したコミットで再照合します。本文の説明とリンクも同期します。
3. [観測手順](evidence/README.md)に従い、隔離した合成データで該当する画面・状態を採集します。基準ソース、言語、テーマ、viewportを記録し、原画像と実測JSONのhashをマニフェストへ保存します。旧ソースの画像を新ソースで撮影したように扱いません。
4. `node scripts/ui-catalog-observations.mjs` で画面別要素と実測の対応を再生成し、`node scripts/ui-catalog-observations.mjs --check` で生成物が一致することを確認します。同じselectorでも画面状態が異なる場合は、観測対象の状態を明示します。未観測の値は補完しません。
5. 意味分類を変更した場合は `semantics/mapping.json` と分類表を同期します。スタイル比較の選定条件・判定は `semantics/style-comparison.json` に記録し、`node scripts/ui-catalog-style-comparison.mjs` で表を再生成、`--check` で一致を確認します。未観測の条件は判定保留として残します。
6. `pnpm docs:ui-catalog` でHTMLを生成し、一覧→要素→実測→原画像のリンクと代表画面の可読性を確認します。独立した担当者が、画面の漏れ・測定条件・source-onlyの扱いをレビューします。

画面別ソース記録、ブラウザー観測、対応表の生成は担当を分けて確認します。後で共通部品を変更するときも、影響画面の行を省略せず更新します。OSのネイティブポップアップや、この版のrendererが出力しない要素などは、実測済み部品と区別して記録します。
