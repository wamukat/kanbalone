# 観測を再採集する

画面別の要素一覧と実画像・計算値を、ビルドした同じソースから記録します。実行にはリポジトリ指定のNode.jsとpnpm、Python 3、agent-browserを使います。

## ビルドと合成データ

リポジトリのルートで、対象のリビジョンをビルドします。通常運用のDBと添付ディレクトリを使わず、空の作業ディレクトリに起動します。

```sh
pnpm install --frozen-lockfile
pnpm build
catalog=docs/development/ui-component-catalog
scratch=$(mktemp -d)
HOST=127.0.0.1 PORT=3675 KANBALONE_DB_FILE="$scratch/fixture.sqlite" pnpm start
```

別のターミナルで同じ `catalog` と `scratch` を指定します。先に空のホームや新規ボード入力を採取します。通常画面は次のスクリプトで作る4ボードを使います。

```sh
python3 "$catalog/evidence/tools/seed-fixture.py" --output "$scratch/fixture.json"
```

空のインスタンスを起動するところからやり直し、`--markdown` を加えると、現行の追加観測と同じMarkdown見本、完了6件とアーカイブ済み9件の状態を再現できます。出力JSONでボード、グループ、課題、ビュー等の合成IDを確認できます。[合成データ作成スクリプト](tools/seed-fixture.py) [Markdown見本](markdown-specimen.md)

リモートの画面には、合成DBとその `attachments/` のコピーを使います。通常のインスタンスで作業が止まっている間にコピーするか、SQLiteのオンラインバックアップで整合したコピーを作ります。下記のサーバーは、同じアプリを外部通信のない決定的なアダプターで起動します。[リモート表示用サーバー](tools/mock-remote-server.mjs)

```sh
PORT=3676 KANBALONE_DB_FILE="$scratch/remote/fixture.sqlite" node "$catalog/evidence/tools/mock-remote-server.mjs"
```

取り込みドロワーには `https://github.com/example/catalog-sample/issues/9` を入力すると成功プレビューが出ます。末尾が `10` のURLは模擬エラーです。先に `42` の課題を取り込むと同じURLで重複を再現できます。`77` には共通のMarkdown見本があります。リンク済み課題に対して通常のコメントと、本文に `failed` を含むコメントを投稿し、それぞれをリモートへ送ると成功・失敗表示を再現できます。

## 画面を作って採集する

[画面別一覧](../README.md)で対象の画面ID、要素ID、必要な状態を確認します。専用ブラウザーセッションを開きます。日本語の基本条件は1440 × 900 px、明暗は個別に指定します。英語の狭いデスクトップ例は1050 × 900 pxです。

```sh
agent-browser --session catalog-review open http://127.0.0.1:3675/boards/1/list
agent-browser --session catalog-review set viewport 1440 900
agent-browser --session catalog-review set media light
agent-browser --session catalog-review storage local set kanbalone:language ja
agent-browser --session catalog-review reload
agent-browser --session catalog-review snapshot -i
```

画面上で検索、選択、展開、ダイアログ表示などの手順を再現し、読み込みが終わった状態から採取します。操作後は再度スナップショットを取得して、現在の画面で対象が表示されていることを確認します。キーボードフォーカスやhoverは、見たい要素に実際に移動してから測ります。

採取する画面と状態を指定します。`--require` で対象の要素IDを指定すると、最終の画面別一覧のセレクターが実DOM上で見つかったことを確かめた上で採取します。同じ画面の参照画像が揃っている補助調査には `--styles-only` を使えます。

```sh
python3 "$catalog/evidence/tools/capture-frame.py" \
  --session catalog-review --source "$(git rev-parse HEAD)" \
  --screen list --state board --note '合成ボードのList。既定条件。' \
  --require list.headers-lane --require list.lane-cell \
  --output "$scratch/captures"
agent-browser --session catalog-review close
```

このコマンドは原画像、CSS計算値、フレーム1件分のmanifestレコードを出力します。リモート用には `--origin http://127.0.0.1:3676` を指定し、メモに模擬アダプターであることを残します。[採取コマンド](tools/capture-frame.py) [ブラウザー内の計測処理](tools/collect.js)

## 比較とカタログ更新

- 前後で同じ合成DB・添付のコピーを使い、言語、テーマ、viewport、ブラウザー、選択、スクロール、フォーカス、hoverを揃えます。各バージョンで同じ画面操作を行い、原画像を別の出力先に保存します。必要な保存結果や再読み込み後の状態も確認します。
- 対象画面の一覧・要素ID・セレクターを先に更新します。撮影前に、観測すべき要素を `--require` で確認します。表示されない要素やOS固有のUIは、採った条件と未観測の理由を記録します。
- 現行manifestと同じリビジョンの追加観測は、`styles/` と `images/` に新しいファイルを配置し、`records/` のレコードを [manifest](manifest.json) の `frames` に追加します。`frameCount`、`imageCount`、`screens` の件数を実ファイルと合わせ、[観測記録](README.md)に状態とリンクを記載します。
- 現行カタログを別リビジョンに更新する場合は、そのリビジョンの画面別一覧と観測結果を対にして更新します。観測対応表は画面別一覧とフレームが同じソースであることを検査します。以前の原画像と実測は比較用の記録として保持します。
- 画像と実測JSONのハッシュは採取時のレコードを使います。原画像を編集せずに保存し、観測対応表と閲覧版を再生成して、リンクと未観測の理由を確認します。

```sh
node scripts/ui-catalog-observations.mjs
node scripts/ui-catalog-observations.mjs --check
pnpm docs:ui-catalog
```
