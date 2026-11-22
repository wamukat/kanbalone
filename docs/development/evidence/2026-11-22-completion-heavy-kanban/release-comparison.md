# 公開v1.0.0と開発中候補の取得方式の違い

通常のローカル実行環境3470はまだ公開版v1.0.0で、ページング導入後のmainとは異なる。完了レーンを5枚に絞る表示は共通だが、公開版はその前に全チケットを取得する。そのため、開発中コードでの「完了件数による初期表示差は小さい」という結論を、公開版にそのまま適用しない。

既存環境には書き込まず、v1.0.0タグのsrc/publicを展開し、同じ合成データ（100未完了＋9,900完了）のSQLiteバックアップを使ってport3621で起動した。package.jsonとpnpm-lock.yamlは候補と同一なので同じNode26.13.1と依存ライブラリを使用。候補はport3616の#1517実装後。旧DBを現行スキーマから複製しているため、旧版の新規DB構築そのものの検証ではない。

| | 公開版v1.0.0 | マージ済みmain（1c87193） | 開発中候補（main＋#1517） |
|---|---:|---:|---:|
| 表示する未完了／完了 | 100 / 5 | 100 / 5 | 100 / 5 |
| 起動時ticket API | 全件取得を2回 | レーン別取得を8回 | レーン別取得を4回 |
| ticket応答本文の合計bytes | 10,645,510 | 105,904 | 52,952 |
| `GET /tickets?limit=1` の返却件数 | 10,000（pageなし） | この比較では個別プローブ未実施 | 1（pageあり） |

公開版は1回5,322,755bytesを2回。候補は17,001＋16,499＋16,499＋2,953bytes。マージ済みmainは同じ4レーンを二重取得し、候補の2倍の105,904bytesだった。mainの値は `measurements.json` のdone9900の5試行すべてで一致している。

**全件取得をレーン単位・完了5件の取得に変えるページング改善はすでにmainへマージ済み**で、公開版v1.0.0にはまだ入っていない。**#1517は残る起動時の二重取得をなくす追加改善**である。公開版の「5枚」はクライアント内のsliceであり、API取得量の制限ではない。この3段階を混同しない。

表のbytesはticket API応答本文だけの合計であり、他のAPI、JS/CSS/画像等のアセット、HTTPヘッダを含む全通信量ではない。

これは応答件数・データ量の比較であり、速度比較ではない。単発のネットワーク棚卸しで、別のE2E検証と同時に実行した。生データにdurationがあるが性能差の根拠としては使わない。DOM105枚を確認後1.2秒待ってリソース一覧を収集した。bytesはencodedBodySizeでHTTPヘッダ等を含まない。スクリーンショットは同じ英語／light／1440×1000で取得したが、API取得量を証明するのはJSONである。

- 公開版: `v1.0.0-comparison.png`
- 開発中候補: `current-candidate-comparison.png`
- ネットワーク／limitプローブ: `release-network.json`
- 版・ソース指紋: `release-revision.json`

再現には#1517実装済みの候補checkoutを使う。coverage/completion-heavy/releaseへ `git archive v1.0.0 src public package.json pnpm-lock.yaml` を展開し、このフォルダのrelease-server.mjsとrelease-network.mjsをcoverage/completion-heavyへコピーする。基準fixtureのserver3616と、`node --import tsx coverage/completion-heavy/release-server.mjs`（3621）を起動後、`node coverage/completion-heavy/release-network.mjs` を実行する。通常のユーザ環境を比較DBに使わない。
