# 開発ガイド

## 必要なもの

- Node.js 26.13.1 LTS
- pnpm 10

Volta を使う場合:

```bash
volta install node@26.13.1
volta install pnpm@10.33.0
```

Node.js 25以降にはCorepackが同梱されません。pnpmが未導入の場合は、固定バージョンを明示的にインストールします。

```bash
npm install --global pnpm@10.33.0
```

このリポジトリはVoltaでNode.js 26.13.1を指定しています。Nodeのバージョン変更後は、新しい実行環境で依存をインストールし直し、SQLiteのネイティブ拡張を再ビルドしてください。

```bash
pnpm install --frozen-lockfile
pnpm rebuild better-sqlite3
pnpm check
pnpm test:e2e
```


## ローカルセットアップ

依存関係をインストールします。

```bash
pnpm install
```

開発モードで起動します。

```bash
pnpm dev
```

ビルドします。

```bash
pnpm build
```

ビルド済みアプリを起動します。

```bash
pnpm start
```

デフォルト URL:

```text
http://127.0.0.1:3000
```

## テスト

API と unit test を実行します。

```bash
pnpm test
```

E2E test を実行します。

```bash
pnpm test:e2e
```

型チェック:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

## UI 設定の保存

ブラウザ側の UI 設定は `localStorage` の `kanbalone:ui-preferences` に保存します。保存形式は `version` 付きです。

保存対象:

- 最後に開いていた board ID
- board ごとの Kanban/List 表示
- board ごとの filter 条件
- board ごとの `Status` / `Priority` filter menu の開閉状態

E2E は、filter そのものの動作を `test/e2e/filters.spec.ts`、localStorage 復元などの UI 設定を `test/e2e/preferences.spec.ts` に分けています。UI 設定の保存形式を変更する場合は、既存形式からの移行と `preferences.spec.ts` の更新をセットで行ってください。

## 技術スタック

- Node.js 26.13.1 LTS
- pnpm
- Fastify
- SQLite via `better-sqlite3`
- Vanilla HTML/CSS/JavaScript
- TypeScript


## 完了状態のレーン移行

更新前に旧アプリのDBをバックアップしてください。既存レーンは名前に関係なく通常レーンになります。完了チケット（アーカイブ済みを含む）があるボードごとに、専用の `Completed (migration)` レーンを作成し、完了チケットだけを移します。同名がある場合は連番を付け、既存レーンを流用しません。完了・アーカイブ状態、ID、親子関係を維持し、未完了チケットは元レーンに残します。移行は一度だけトランザクション内で実施し、失敗時は全体をロールバックします。旧exportの取り込みにも同じ保持ルールを適用します。

旧アプリは新しい完了モデルへの書き込みに対応しません。ロールバックする場合は、旧イメージだけでなく更新前のDBも復元してください。Acceptanceは人間の受入待ちを表す通常レーンです。既存Doneレーンを完了扱いに変更すると全所属チケットが完了になるため、未受入の作業が残っていないことを確認してください。


[ユーザー・AI向けの詳細な移行手順](../migration-guide.md)を参照してください。
