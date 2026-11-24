# 共通UI部品の利用先と回帰確認

共通定義を使う製品の利用先と、画面側が担う用途差を記録する。統合候補 `33b995856b350c5b17a6150d932cd193308fccc7` で、表示修正、ボタン・入力・面の共有、並び順とコメント入力、CSSトークン検査をソースから照合した。各行の画像・実測はリンク先に記録した版の証拠。新しい利用先を追加するときは現行の定義元と状態を確認する。[共通UI部品の利用契約](ui-component-contracts.md) · [固定版の監査カタログ](ui-component-catalog/README.md)

## 実際の利用先

| 役割 | 共通定義と利用先 | 用途差と個別検証 |
| --- | --- | --- |
| ボタン | `components.css` と `dark-mode.css` の `button, .import-button` をボード設定の出力とJSON取り込みが共用する。転送行の配置は `sidebar-board-settings.css`。チケット、確認、一括操作のボタンも基礎宣言を使う。 | ボタン固有のフォント継承、主操作・危険・アイコンや小型の寸法、ファイル入力を開くラベルの動作をそれぞれ維持する。[明暗の同値・ファイル選択](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-button-base/README.md) |
| 文字入力・検索 | `forms.css` と `dark-mode.css` がツールバーとGroupの検索、チケット編集・取り込みと移動欄の文字入力に、入力型に応じた外観を適用する。サイドバーのボード改名とタグ作成は小型入力の面・枠・余白を共有する。 | 検索枠のフォーカス表示、タグ作成の最小高さとアウトライン、初回ボード名入力の強調は画面の責務。[入力型・強制カラー・保存](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-control-scope/README.md) |
| ネイティブ選択 | レーン・タグのフィルター、チケット編集と移動先は `forms.css`、カスタムビューの条件・並び順は `custom-views.css` を使う。 | カスタムビュー一覧と設定の並び順の値は400、設定ラベルと完了条件の値は600。List列見出しの並べ替えは独自の並べ順操作を使う。[並び順と保存](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-role-spacing/README.md) |
| チェック・ラジオ・色 | List行と全選択、完了レーン、カスタムビュー条件、外部取り込みはネイティブチェックを使用する。リンク投稿欄は `ticket-editor.css` の専用レイアウト。タグ色のスイッチと色欄は `toggles.css`、`tag-color-dialog.css`。 | 部分選択、カスタムビューのネイティブラジオ、外部取り込みのプロバイダー用ボタン型ラジオ、タグ色のラベルとフォーカスを区別する。[取り込みチェック・送信](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-remote-check-layout/README.md) · [タグ色](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-control-scope/README.md) |
| ダイアログ・本文・メタ情報 | `dialog-shell.css` のチケット枠の前景には `--text` が指定され、配下の本文にも継承される。`ticket-detail.css` で本文・コメント一覧・履歴一覧の面を共有し、`comments-activity.css` で日時・補足の配置を共有する。 | チケットと確認のモーダル性、本文行高、項目間の区切り、読取と編集、本文差分の外枠と変更の記号は用途別。コメントの投稿・編集欄は左右 `0.8rem` と上下 `0.65rem` を使う。[ダークの本文](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-content-contrast/README.md) · [3面と保存](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-content-surfaces/README.md) · [コメント入力の余白](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-role-spacing/README.md) · [本文差分の枠](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-diff-token-guard/README.md) |
| Markdownリンク | `content-markdown.css` の `.markdown a[href]` をローカル本文、詳細・編集の外部本文、コメント、Group説明と編集プレビューが使う。 | タイトルリンク、所属Groupへのリンク、関連参照は表示目的に応じた定義を使う。[6種類のリンクとフォーカス](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-content-contrast/README.md) |
| 初回案内 | ボード0件の操作名は `app-sidebar-boards.js` の翻訳済み属性から `sidebar-boards.css` の疑似要素に渡す。 | 初回だけ案内を表示する。動きを抑える設定、取消、ボード作成後の非表示も確認している。[日英の案内と保存](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/docs/development/evidence/2026-11-24-home-guidance/README.md) |

<a id="tag-status-priority"></a>

### タグ・状態・優先度の利用先

`app-tags.js` が読取用タグを、`app-ticket-status.js` が一覧の状態記号を描く。優先度のアイコンとバッジは `app-priority.js` が提供する。各利用先が渡す値と表示形式をソースで照合した。

| 利用先 | タグ | 状態 | 優先度 |
| --- | --- | --- | --- |
| [Kanbanカード](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-kanban-ticket-card.js) | 共通タグ | 共通の状態記号 | 共通アイコン |
| [List行](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-board-list-row.js) | 共通タグ | [ボード画面](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-board.js)から共通の状態記号を渡す | 共通バッジ |
| [Group行](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-group-view.js) | 共通タグ | 共通の状態記号をGroup用アイコンで描く | 適用外 |
| [カスタムビューのカード](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-custom-view-list.js) | 共通タグ | 共通の状態記号 | 共通バッジ |
| [チケット詳細](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-ticket-detail-renderers.js) | 共通タグ | [詳細ヘッダー](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-ticket-detail.js)が解決済み表示とアーカイブの復元操作を持つ | 共通バッジを編集ボタンに使用 |

タグの編集時は[解除チップの描画](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/public/app-ticket-tag-picker.js)が選択・解除を扱い、共通のタグ名と色の規則を使う。各画面は仮想行、親子の位置、ドラッグ範囲とページングを管理する。完了とアーカイブ、文脈行の代表表示は既存テストに対応する。[ListとGroupの状態表示](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/test/e2e/ticket-view-styles.spec.ts) · [Groupのタグ](https://github.com/wamukat/kanbalone/blob/33b995856b350c5b17a6150d932cd193308fccc7/test/e2e/group-presentation.spec.ts)

## 比較を保留する範囲

コメントの外部同期、入力欄付近のフィードバック、チケット移動、Group所属変更の4群は、同条件で比較できる状態が揃うまで保留する。サイドバーの行密度は観測済みで、統一の判断には操作中の比較が必要。[比較時の判定](ui-component-catalog/semantics/style-comparison.md)

| 対象 | 再検討する条件 |
| --- | --- |
| コメントの外部同期 | 同じ模擬プロバイダーで、送信中、失敗の詳細、再試行後の保存結果までを追える。 |
| 入力欄付近のフィードバック | 同じ結果と操作可否を持つ保存中・成功・失敗を並べ、フォーカスと通知先を確認できる。 |
| チケット移動の宛先 | 単体と一括で候補の読込、空・失敗、取消、移動後の保存結果を同じ条件で確認できる。 |
| Group所属変更の影響確認 | 所属の競合を解く操作と所属解除の確定を区別し、影響一覧、取消後のフォーカス、所属と親子の保存結果を照合できる。 |
| サイドバーのボード行とビュー行の密度 | 長い日英名、選択・hover・キーボード、狭幅、並べ替え中を比較し、現在地とドラッグの識別を保てる。 |

## 統合候補の回帰確認

統合候補で `pnpm check` が成功した。CSS参照検査、未定義トークン・定義削除を含むテスト282件、Webビルド、型検査、文書ビルドを確認した。

既存Chromium E2Eの代表11件が成功した。ボード入出力と改名、日本語の初回案内、外部取り込みチェック、タグ色、ツールバーselect、編集欄のフォーカスと見出し、ダークの履歴、Markdownリンク、List／Groupの状態、カスタムビューの並び順、コメントの添付・編集を確認した。個別の画像・実測の条件は各変更の記録を参照する。
