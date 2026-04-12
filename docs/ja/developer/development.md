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

## 技術スタック

- Node.js 22
- pnpm
- Fastify
- SQLite via `better-sqlite3`
- Vanilla HTML/CSS/JavaScript
- TypeScript
