# 開発ガイド

## 必要なもの

- Node.js 22
- pnpm 10

Volta を使う場合:

```bash
volta install node@22
volta install pnpm@10.33.0
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

- Node.js 22
- pnpm
- Fastify
- SQLite via `better-sqlite3`
- Vanilla HTML/CSS/JavaScript
- TypeScript
