# #1517 実装後の初期表示計測

修正前 `1c87193ec553cbbd4bbc563f5a28b7ee67611600` と、`refreshBoards({ refreshDetail: false })` で最初のdetail取得を省く実装を比較した。診断用のroute書き換え試作とは別の実装後計測である。

| 指標 | 修正前 | 実装後 |
|---|---:|---:|
| 初期表示中央値（5試行） | 367.0 ms | 289.1 ms |
| ticket APIリクエスト数 | 8 | 4 |
| 未完了／完了の表示カード数 | 100 / 5 | 100 / 5 |

中央値差は77.9 ms（21.2%）。単一ローカル環境の観測であり、すべてのボード／機器での性能保証ではない。完了レーンだけを遅延表示する変更はしていない。新規／詳細を開く際の全件収集の時間も改善対象外。

## 方法

[完了件数別の調査](../2026-11-22-completion-heavy-kanban/README.md)と同じ独立fixture（100未完了＋9,900完了）、port3616、1440×1000、英語、light、Chromium159.0.8154.6、Node26.13.1。1回ずつウォームアップし、5回ずつ比較。順序を試行ごとに逆転。毎回新規コンテキスト。同時の重いテストなし、遅延注入なし。

基準のpublic一式を `git archive 1c87193ec553cbbd4bbc563f5a28b7ee67611600 public` で `coverage/completion-heavy/before/` に展開した。製品差分はapp.jsのみなので、基準側は保存したapp.jsをブラウザrouteで配信。候補側は実際にサーバが配信する変更後app.jsを使い、試作コードへの置換は行っていない。双方のapp-state観測フックは同じ。基準側だけapp.js route処理を行う小さな非対称性があるため、差全体を厳密なCPU時間削減とは解釈しない。リクエスト削減自体は全サンプルで確認した。

DOMの100枚＋5枚、boardNavigationReady=true/loading=false/renderPending=false、および必要なticket応答件数（基準8／候補4）が成立した2フレーム後を記録。初期の一時的なreadyを安定表示と混同しない。URLは `/boards/1` のみ。ルーティング全般の正しさと日英画像は別の機能検証を参照。

`startup-production.json` は12サンプル（各1回のウォームアップ含む）。`performance-revision.json` は実際に比較したapp.jsのSHA256。fixtureと環境は前述調査のrevision.jsonと共通。画像は性能計測の代替証拠ではない。

## 再実行

独立作業ディレクトリで、前述調査のseed/serverを `coverage/completion-heavy/` に配置し、fixtureを作成してserver3616を起動する。基準publicのarchiveを上記パスへ展開する。このフォルダの `startup-production.mjs` を同じcoverageディレクトリへコピーし、リポジトリルートから `node coverage/completion-heavy/startup-production.mjs` を実行する。candidateには#1517の実装が必要。出力JSONはcoverage側に生成する。
