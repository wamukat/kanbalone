# SoloBoard

[English](README.md)

<p align="center">
  <img src="public/app-icon.svg" alt="SoloBoard アプリアイコン" width="120" height="120" />
</p>

SoloBoard は、個人が AI とともに開発するのために最適化した小さなローカル Kanban アプリです。

Dockerでサクッと起動してすぐ使えます。
ブラウザで人間が使える Web UI に加えて、スクリプトや AI エージェントから利用しやすい JSON API も備えています。

![SoloBoard kanban screenshot](docs/assets/soloboard-kanban.png)

## SoloBoard の特徴

- AI と共に 1 人で 1台のマシンで使うことに最適化し、ユーザ管理や権限管理は排除
- データは全てローカルで保存
- 作業カテゴリごとの複数ボード管理
- タグ、コメント、チケット間の依存関係（ブロッカー、親子チケット）管理
- 自動化や AI エージェントからも扱いやすい軽量 JSON API
- 起動して最初のボードを作成したら、面倒な設定なしですぐタスク管理開始

## Quick Start

公開済み Docker Image で起動します。

```bash
docker run --rm \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:v0.9.4
```

ブラウザで開きます。

```text
http://127.0.0.1:3000
```

ユーザーガイド:

```text
https://wamukat.github.io/SoloBoard/
```

固定バージョンではなく、最新リリースの Image を使いたい場合は `ghcr.io/wamukat/soloboard:latest` を指定してください。

## Docker Compose

公開済み Image を Compose で起動します。

```bash
docker compose -f docker-compose.image.yml up
```

ホスト側のポートを変更する場合:

```bash
KANBAN_PORT=3457 docker compose -f docker-compose.image.yml up
```

アプリは SQLite データベースを以下に保存します。

```text
/app/data/soloboard.sqlite
```

同梱の Compose ファイルでは、永続化のために `soloboard-data` という Docker named volume を使います。

Windows では、Docker Desktop または Rancher Desktop with WSL2 を使い、named volume の構成を維持してください。


## Local Development

```bash
pnpm install
pnpm dev
```

デフォルト URL:

```text
http://127.0.0.1:3000
```

## Documentation

公開ユーザーガイド:

- <https://wamukat.github.io/SoloBoard/>

利用者・API クライアント向け:

- [ユーザーガイド](docs/ja/user-guide.md)
- [データモデルと概念](docs/ja/concepts.md)
- [AI API ガイド](docs/ja/ai-api-guide.md)
- [API 例](docs/ja/api-examples.md)
- [OpenAPI](docs/openapi.yaml)

開発者・メンテナ向け:

- [開発ガイド](docs/ja/developer/development.md)
- [Docker Image 配布](docs/ja/developer/docker-image-distribution.md)
- [リリース手順](docs/ja/developer/release.md)
- [パフォーマンスツール](docs/ja/developer/performance.md)
- [ダイアログボタンポリシー](docs/ja/developer/dialog-button-policy.md)

## Tech Stack

- Node.js 22
- Fastify
- SQLite via `better-sqlite3`
- TypeScript
- Vanilla HTML/CSS/JavaScript
- Lucide-style SVG icons

## License

[MIT](LICENSE)
