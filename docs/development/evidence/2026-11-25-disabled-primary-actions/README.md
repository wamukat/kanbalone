# 完了レーン保存と外部Issue取り込みの無効状態

2026年11月25日 JST に macOS の Headless Chromium 158、1440 × 900 CSS px、デバイス画素比1、英語で撮影しました。変更前は main の `2735ce6534692aef3f30a0dd9862c5f9ade18c3f`、変更後は同じソースに主ボタンのCSS修正を加えてビルドした候補です。いずれも v1.4.0 と表示されます。合成ボード Design Studio の同じデータを複製し、同じ操作とスクロール位置で撮影しました。[ソースと画像のハッシュ・計測値](manifest.json)

## 再現手順と画像

- Design Studio のボード設定で **Completion lanes → Change** を開きます。**Done** が既に完了レーンで、未変更時の **Save** は無効です。**Intake** を仮選択すると **Save** が有効になります。
- **New ticket → Import remote issue** を開き、合成IssueのURLを入力します。**Preview** の前は **Import** が無効です。プレビューを取得すると **Import** が有効になります。GitHubの取得を決定的なローカルアダプターで模擬し、Kanbaloneの実APIとSQLite保存を使用しました。バックリンクはオフです。

| 操作 | 配色 | 状態 | 変更前 | 変更後 |
| --- | --- | --- | --- | --- |
| Save | ライト | 無効 | [原画像](before-save-light-disabled.png) | [原画像](after-save-light-disabled.png) |
| Save | ライト | 有効 | [原画像](before-save-light-enabled.png) | [原画像](after-save-light-enabled.png) |
| Save | ダーク | 無効 | [原画像](before-save-dark-disabled.png) | [原画像](after-save-dark-disabled.png) |
| Save | ダーク | 有効 | [原画像](before-save-dark-enabled.png) | [原画像](after-save-dark-enabled.png) |
| Import | ライト | 無効 | [原画像](before-import-light-disabled.png) | [原画像](after-import-light-disabled.png) |
| Import | ライト | 有効 | [原画像](before-import-light-enabled.png) | [原画像](after-import-light-enabled.png) |
| Import | ダーク | 無効 | [原画像](before-import-dark-disabled.png) | [原画像](after-import-dark-disabled.png) |
| Import | ダーク | 有効 | [原画像](before-import-dark-enabled.png) | [原画像](after-import-dark-enabled.png) |

## 表示と保存の結果

- 期待は、有効と無効をライト・ダークで識別でき、ボタン名を読めることです。変更前は有効状態と無効状態で背景、文字、枠、カーソルが一致しました。変更後の無効状態は低い強調の背景色と枠、`not-allowed` で識別でき、**Save** と **Import** のラベルを読めました。SafariやFirefoxなど他のブラウザーでの外観は検証範囲外です。
- 両テーマで、無効ボタン中央のヒットテストを照合してからポインターでクリックしました。ブラウザーは無効ボタンへのフォーカスを受け付けず、EnterとSpaceを押した際のフォーカス先は本文でした。取込URL欄にフォーカスしたEnterも取込を起動しませんでした。完了レーン設定を仮変更して取り消した際はレーンAPI、プレビュー後に取り消した際はチケット一覧APIで保存済み状態を照合しました。
- 有効な **Save** へ Tab で進むとフォーカス輪郭が表示されました。Enter で確認画面を開き、Space で合成レーンの変更を保存しました。ボード取得APIで **Intake** と **Done** が完了レーンになったことを確認し、再読み込み後に設定を開いて同じ状態を確認しました。
- 有効な **Import** に Tab で進んだフォーカス輪郭を確認し、Space で取込を実行しました。合成チケットが1件保存され、チケット取得APIのタイトル、レーン、Issue URLと再読み込み後のタイトルを照合しました。外部サービスとの通信および実際のバックリンク投稿は検証範囲外です。
