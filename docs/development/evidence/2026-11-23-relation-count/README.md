# 関係候補ページングの COUNT 寄与

対象は `GET /api/boards/:boardId/relation-candidates`。最新 main から専用 worktree を作り、合成 SQLite の 1,005 件・10,005 件の 2 ボードを使う。各ボードにアーカイブ済み10件、親付き2件がある。ブロッカー関係なしの合成データ。

## 再現

Node 26.13.1 とリポジトリの依存パッケージを使い、専用 worktree のルートで実行する。

```sh
mkdir -p coverage/relation-count/source-baseline
git archive 899d0f0117ee52e6d57db59241312f0fa4fcd0f7 src public package.json tsconfig.json \
  | tar -xf - -C coverage/relation-count/source-baseline
ln -s "$PWD/node_modules" coverage/relation-count/source-baseline/node_modules
node --import tsx docs/development/evidence/2026-11-23-relation-count/compare.mjs
```

実行は [既存の合成 fixture](../2026-11-22-candidate-fetch-order/README.md#reproduction) を一時ディレクトリに解凍する。SQLite のページ関数を直接呼ぶ層と、localhost HTTP / JSON 経由で呼ぶ層で計測する。両方とも limit 200 と cursor で最後まで取得する。初回のウォームアップを除き、各層・各ボードで18組を記録する。旧版・新版の実行順は交互。生データは `coverage/relation-count/product-results.json`。

COUNT の分解計測は `899d0f0` の専用 worktree で、この `measure.mjs` を同じ相対パスへコピーし、worktree のルートで `node --import tsx docs/development/evidence/2026-11-23-relation-count/measure.mjs` を実行する。各層・各ボードで18組を記録し、次の3方式の実行順6通りを均等に使う。

- base は未加工の現行実装。
- timed は現行実装が呼ぶ該当の COUNT を識別し、同じ read transaction 内で DB statement の prepare と get を個別に計測。
- reuse は同一収集の初ページでだけ COUNT を実行し、以後のページは実験用フックがその結果を返す。重複取得を省く場合の比較用。製品化する場合は署名 cursor と revision 照合で扱う。

timed と base の全体時間差を記録して、フックや時刻採取のオーバーヘッドと短期ノイズを把握する。back-to-back の時計読み取り差も記録する。数値は各試行の中央値と最小・最大。ネットワーク遅延、ブラウザーでの DOM・候補描画、人の操作時間は対象外。

## 計測結果

2026-11-23 02:39 JST、main `899d0f0`、Node 26.13.1、better-sqlite3 の SQLite 3.54.1、macOS / Intel Core i7-9750H。各値はミリ秒で中央値［最小–最大］。

| 層 | チケット / 頁 | 現行の全収集 | COUNT 全頁 | 2頁目以降の COUNT 計 | 初回だけ COUNT する対照の全収集 |
| --- | ---: | ---: | ---: | ---: | ---: |
| DB 関数 | 1,005 / 6 | 4.41［3.87–5.27］ | 0.49［0.45–0.54］ | 0.41［0.38–0.46］ | 4.05［3.47–5.19］ |
| DB 関数 | 10,005 / 51 | 54.57［51.09–79.12］ | 19.00［17.37–22.18］ | 18.55［17.02–21.78］ | 35.59［31.26–51.92］ |
| localhost HTTP/JSON | 1,005 / 6 | 12.72［10.91–20.05］ | 0.53［0.49–0.70］ | 0.45［0.40–0.62］ | 12.09［9.61–13.60］ |
| localhost HTTP/JSON | 10,005 / 51 | 116.98［97.72–188.06］ | 20.26［19.35–28.95］ | 19.86［18.97–28.56］ | 95.38［83.39–139.22］ |

- 10,005 件の COUNT は `tickets_paging_id_idx` の covering index を使う。1頁あたりの prepare / get 中央値は直接 0.035 / 0.330 ms、HTTP 経由で 0.038 / 0.350 ms。継続ページは同じインデックスを `board_id = ? AND id > ?` で引く。
- 10,005 件で省略できる COUNT は現行の全収集の約34%（DB 関数）、約17%（HTTP/JSON）を占めた。各試行の改善中央値は直接18.60 ms［3.54–39.06］、HTTP/JSON 24.34 ms［−3.96–48.84］。対照が速かった試行はそれぞれ18/18、17/18。1,005 件では省略できる COUNT が約0.4 msだった。
- 10,005 件で `timed - base` の中央値は直接 +0.47 ms、HTTP/JSON +0.51 ms。範囲は直接 −24.00–8.47 ms、HTTP/JSON −21.08–49.35 ms。時計を連続で読んだ差の中央値は約0.11 µs。方法差が小さい場合の比較には変動が残る。
- すべての試行で各頁の全6項目、ID 順序、件数、revision、cursor のハッシュが層ごとに一致。18組の生データの出力先は `coverage/relation-count/count-results.json`。

## 製品コードの比較

旧版と新版を同じ合成 DB・同じ Node プロセスで別々に起動した。計測時のソース SHA-256 は [集計 JSON](summary.json) に記録した。各値はミリ秒で中央値［最小–最大］。

| 層 | チケット / 頁 | 更新前 | 更新後 | 各組の短縮時間 |
| --- | ---: | ---: | ---: | ---: |
| DB 関数 | 1,005 / 6 | 3.14［3.01–3.34］ | 2.84［2.76–3.34］ | 0.28［−0.10–0.48］ |
| DB 関数 | 10,005 / 51 | 39.32［37.65–43.96］ | 24.63［23.47–27.92］ | 14.50［12.78–18.14］ |
| localhost HTTP/JSON | 1,005 / 6 | 8.56［7.38–11.77］ | 8.14［7.49–13.63］ | 0.46［−3.54–3.59］ |
| localhost HTTP/JSON | 10,005 / 51 | 84.69［75.30–98.69］ | 68.76［63.14–82.38］ | 14.34［8.06–29.93］ |

10,005件では18組すべてで短縮。各組の短縮率の中央値は DB 関数が37.1%、HTTP/JSONが15.9%。1,005件では差が小さく、一部の試行は遅くなった。COUNT の分解計測と製品比較は別々の計測セッション。製品の短縮時間は製品比較の組内で算出した。

製品比較では候補の全項目・ID 順序・件数・revision と、カーソルに元から含まれる項目が一致した。通常のチケット一覧の先頭ページ・継続ページの JSON はカーソルを含めバイト一致。旧版から新版、新版から旧版への関連候補カーソル継続も、limit を変えて成功した。
