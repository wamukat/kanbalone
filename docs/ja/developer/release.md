# リリース手順

Kanbalone のリリース方法を説明します。

## リリース成果物

現在のリリースでは以下を公開します。

- `v0.9.0` のような Git tag
- その tag に対する GitHub Release
- GitHub Container Registry 上の Docker Image

公開 Docker Image:

```text
ghcr.io/wamukat/soloboard
```

`v0.9.0` のような tag では、publish workflow が次の tag を作成します。

```text
ghcr.io/wamukat/soloboard:v0.9.0
ghcr.io/wamukat/soloboard:0.9.0
ghcr.io/wamukat/soloboard:latest
```

現在の Docker Image target:

```text
linux/amd64
```

## リリース前

`main` の clean working tree から開始します。

```bash
git status --short
git branch --show-current
```

ローカルチェックを実行します。

```bash
pnpm check
pnpm exec playwright test --project=chromium
docker build -t soloboard:release-check .
```

`pnpm check` は OpenAPI lint、unit/API test、TypeScript build、GitHub Pages build をまとめて実行します。UI/UX を変更した release では、Playwright E2E も実行します。

リリース番号が tag と一致していることを確認します。

```bash
node -p "require('./package.json').version"
rg -n "version: " docs/openapi.yaml
```

`package.json` の `version` は、アプリ画面のフッタや `/api/meta` の表示に使われます。`vX.Y.Z` をリリースする場合は、`package.json` を `X.Y.Z` に更新してから tag を作成します。

`docs/openapi.yaml` の `info.version` は OpenAPI ドキュメント上の API version です。アプリのリリース番号と揃えて運用する場合は、同じ `X.Y.Z` に更新します。

必要に応じて runtime を確認します。

```bash
docker run --rm -d \
  --name soloboard-release-check \
  -p 3001:3000 \
  -v soloboard-release-check-data:/app/data \
  soloboard:release-check

curl http://127.0.0.1:3001/api/health

docker rm -f soloboard-release-check
docker volume rm soloboard-release-check-data
```

## ドキュメント更新

新しいバージョンをリリースする時は、Docker 使用例に固定 tag があれば更新します。

例:

```text
ghcr.io/wamukat/soloboard:v0.9.0
```

を次に置き換えます。

```text
ghcr.io/wamukat/soloboard:vX.Y.Z
```

あわせて、リリース番号を参照するファイルを確認します。

```bash
rg -n "v[0-9]+\\.[0-9]+\\.[0-9]+|version" README.md README.ja.md docs package.json
```

Tag を作る前に commit / push します。

```bash
git add README.md docs
git commit -m "Document vX.Y.Z Docker usage"
git push origin main
```

リリース固有のドキュメント変更がない場合、この手順は省略できます。

## Tag の作成と push

リリース対象の commit から annotated tag を作成します。

```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

Tag push により `.github/workflows/docker-publish.yml` が実行されます。

## GitHub Actions の確認

Publish workflow を確認します。

```bash
gh run list --repo wamukat/SoloBoard --limit 10
gh run watch <run-id> --repo wamukat/SoloBoard --exit-status
```

期待する workflow:

- `Docker Image` on `main`
- `Publish Docker Image` on `vX.Y.Z`

どちらも成功していることを確認します。

## 公開 Image の確認

期待する tag を pull します。

```bash
docker pull ghcr.io/wamukat/soloboard:vX.Y.Z
docker pull ghcr.io/wamukat/soloboard:X.Y.Z
docker pull ghcr.io/wamukat/soloboard:latest
```

公開 Image を起動します。

```bash
docker run --rm -d \
  --name soloboard-ghcr-check \
  -p 3001:3000 \
  -v soloboard-ghcr-check-data:/app/data \
  ghcr.io/wamukat/soloboard:vX.Y.Z

curl http://127.0.0.1:3001/api/health

docker rm -f soloboard-ghcr-check
docker volume rm soloboard-ghcr-check-data
```

期待レスポンス:

```json
{"ok":true}
```

## GitHub Release 作成

Docker Image の publish 成功後に release を作成します。

```bash
gh release create vX.Y.Z \
  --repo wamukat/SoloBoard \
  --title "Kanbalone vX.Y.Z" \
  --notes-file /path/to/release-notes.md
```

リリースノートには以下を含めます。

- 公開 Docker Image tags
- 基本的な `docker run` command
- `docker-compose.image.yml` を使う Docker Compose command
- Persistence path: `/app/data/soloboard.sqlite`
- Backup note
- 認証なしの注意
- 現在の platform support

リリースノート雛形:

````markdown
## What's Changed

- Describe the main user-facing changes.
- Mention notable bug fixes.
- Mention test or documentation updates when useful.

## Docker Image

Published image:

```text
ghcr.io/wamukat/soloboard:vX.Y.Z
ghcr.io/wamukat/soloboard:X.Y.Z
ghcr.io/wamukat/soloboard:latest
```

Run with Docker:

```bash
docker run --rm -d \
  --name soloboard \
  -p 3000:3000 \
  -v soloboard-data:/app/data \
  ghcr.io/wamukat/soloboard:vX.Y.Z
```

Run with Docker Compose:

```bash
docker compose -f docker-compose.image.yml up -d
```

Persistent data is stored at `/app/data/soloboard.sqlite`. Back up that SQLite file before upgrades. Kanbalone currently runs without built-in authentication, so expose it only on trusted networks or behind your own authentication layer.

Platform support:

```text
linux/amd64
```
````

## パッケージ公開状態の確認

初回 package publish 後、GitHub Packages で次が public であることを確認します。

```text
ghcr.io/wamukat/soloboard
```

ローカルの GitHub CLI token には `read:packages` がない場合があるため、GitHub web UI で確認するのが確実です。

## プラットフォームメモ

現在の公開 platform:

```text
linux/amd64
```

今後の候補:

```text
linux/arm64
```

`linux/arm64` を追加するには、native dependency である `better-sqlite3` の挙動確認が必要です。

## 公開済み Tag を書き換えない

Docker Image を公開済みの release tag は移動しません。

追加修正が必要な場合は、新しい patch release を作成します。
