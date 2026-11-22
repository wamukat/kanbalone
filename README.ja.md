# Kanbalone

[English](README.md)

<p align="center">
  <img src="public/app-icon.svg" alt="Kanbalone アプリアイコン" width="120" height="120" />
</p>

Kanbalone は、個人が AI とともに開発するために最適化した小さなローカル Kanban アプリです。

Remote issue を、AI と実装するためのローカル作業面に変えます。

Dockerでサクッと起動してすぐ使えます。
ブラウザで人間が使える Web UI に加えて、スクリプトや AI エージェントから利用しやすい JSON API も備えています。

GitHub Issues、GitLab、Redmine などの remote issue をローカルに取り込み、Kanbalone 上で local body と comment を育てながら実装を進められます。remote は正本のまま、Kanbalone は個人開発者と AI のための execution workspace として使えます。

![Remote issue を Kanbalone のローカル execution workspace に取り込む概念図](docs/assets/remote-issue-workspace.svg)

![Remote tracked ticket detail with Local Body in Kanbalone](docs/assets/user-guide/16-remote-ticket-detail-local.png)

![Remote comment push states in Kanbalone](docs/assets/user-guide/18-remote-comment-push.png)

![Kanbalone kanban screenshot](docs/assets/kanbalone-kanban.png)

![チケット作成、タグ、ドラッグアンドドロップ、検索、フィルタ、コメント、リスト表示を操作する Kanbalone デモ](docs/assets/kanbalone-demo.webp)

## Kanbalone の特徴

- AI と共に 1 人で 1台のマシンで使うことに最適化し、ユーザ管理や権限管理は排除
- データは全てローカルで保存
- GitHub Issues、GitLab、Redmine などの remote issue を取り込み、ローカルの実装ワークスペースとして扱える
- 作業カテゴリごとの複数ボード管理
- タグ、コメント、チケット間の依存関係（ブロッカー、親子チケット）管理
- remote の title / body を参照しつつ、Kanbalone 側で実装本文を厚く育てられる
- comment だけを remote に返すシンプルな連携で、作業ログを扱いやすい
- 自動化や AI エージェントからも扱いやすい軽量 JSON API
- 起動して最初のボードを作成したら、面倒な設定なしですぐタスク管理開始

## Groupで作業をまとめる

v0.11.0から、同じ目的のチケットをGroupにまとめられます。[ユーザーガイド](docs/ja/user-guide.md#13-groupで作業をまとめる)と[Group移行手順](docs/ja/migration-guide.md#group-migration)を参照してください。


## Quick Start

公開済み Docker Image で起動します。

```bash
docker run --rm \
  -p 3000:3000 \
  -v kanbalone-data:/app/data \
  ghcr.io/wamukat/kanbalone:v1.1.0-rc.1
```

ブラウザで開きます。

```text
http://127.0.0.1:3000
```

ユーザーガイド:

```text
https://wamukat.github.io/kanbalone/
```

最新の安定版を使う場合は `ghcr.io/wamukat/kanbalone:latest` を指定してください。リリース候補を試す場合は、候補版のバージョンタグを指定します。

## Docker Compose

公開済み Image を Compose で起動します。

```bash
docker compose -f docker-compose.image.yml up
```

ホスト側のポートを変更する場合:

```bash
KANBAN_PORT=3457 docker compose -f docker-compose.image.yml up
```

アプリはSQLiteデータベースと添付画像を以下に保存します。

```text
/app/data/kanbalone.sqlite
/app/data/attachments/
```

同梱の Compose ファイルでは、永続化のために `kanbalone-data` という Docker named volume を使います。
バックアップと復元ではDBと画像をまとめて扱います。[バックアップと復元の手順](docs/ja/migration-guide.md#database-and-image-backup)を参照してください。

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

GitLab / Redmine 用 remote provider sandbox:

```bash
docker compose -f docker-compose.remote-providers.yml up -d
pnpm sandbox:remote-providers
```

Kanbalone は remote provider credential が 1 つ以上設定されている場合だけ、remote issue import の導線を表示します。import panel には設定済み provider だけが表示されます。

詳細は [Remote provider sandbox](docs/ja/developer/remote-provider-sandbox.md) を参照してください。

## Codex Skill

利用者向けには、APIでKanbanを操作する `kanbalone-api` スキルを配布しています。

```bash
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
```

Docker image だけを使う場合は、GitHub release tag から skill を取得して Codex が動くホスト側へコピーします。

```bash
tmpdir=$(mktemp -d)
curl -L https://github.com/wamukat/kanbalone/archive/refs/tags/v1.1.0-rc.1.tar.gz \
  | tar -xz -C "$tmpdir" kanbalone-1.1.0-rc.1/skills/kanbalone-api
mkdir -p "${CODEX_HOME:-$HOME/.codex}/skills"
cp -R "$tmpdir"/kanbalone-1.1.0-rc.1/skills/kanbalone-api "${CODEX_HOME:-$HOME/.codex}/skills/"
rm -rf "$tmpdir"
```

skill はホスト側で実行され、`http://127.0.0.1:3000` などの Kanbalone HTTP API に接続します。

## Documentation

公開ユーザーガイド:

- <https://wamukat.github.io/kanbalone/>

利用者・API クライアント向け:

- [ユーザーガイド](docs/ja/user-guide.md)
- [完了状態の移行ガイド（ユーザー・AI向け）](docs/ja/migration-guide.md)
- [データモデルと概念](docs/ja/concepts.md)
- [AI API ガイド](docs/ja/ai-api-guide.md)
- [API 例](docs/ja/api-examples.md)
- [OpenAPI](docs/openapi.yaml)

開発者・メンテナ向け:

- [開発ガイド](docs/ja/developer/development.md)
- [Remote provider sandbox](docs/ja/developer/remote-provider-sandbox.md)
- [Docker Image 配布](docs/ja/developer/docker-image-distribution.md)
- [リリース手順](docs/ja/developer/release.md)
- [パフォーマンスツール](docs/ja/developer/performance.md)
- [ダイアログボタンポリシー](docs/ja/developer/dialog-button-policy.md)
- [デザインシステム](docs/ja/developer/design-system.md)

## Tech Stack

- Node.js 26.13.1 LTS
- Fastify
- SQLite via `better-sqlite3`
- TypeScript
- Vanilla HTML/CSS/JavaScript
- Lucide-style SVG icons

## License

[MIT](LICENSE)
