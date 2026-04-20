# Docker Image 配布設計

Kanbalone の Docker Image 配布方針を定義します。

Kanbalone は、本番利用を意識した Dockerfile と、ローカル配布向け Docker Compose file を提供します。

## 目的

- `docker run` で起動できる Docker Image を提供する。
- ユーザーデータを image の外に置き、volume で永続化する。
- Runtime image を予測可能で、適度に小さく、本番向けにする。
- Application を non-root user で実行する。
- 既存の `GET /api/health` endpoint で health check できるようにする。
- ローカル利用者向けの Docker Compose をシンプルに保つ。
- GitHub Container Registry など OCI registry への公開経路を用意する。

## 対象外

- 認証機能の追加。
- Multi-user deployment support。
- Cloud-specific deployment manifests の追加。
- Local SQLite persistence model の置き換え。
- 複数 app container が同じ SQLite database を共有する構成。

Kanbalone は引き続き single-user / single-process app です。

## 実行時の取り決め

| 項目 | 値 |
| --- | --- |
| Container port | `3000` |
| Default host | `0.0.0.0` |
| Data directory | `/app/data` |
| Default database file | `/app/data/soloboard.sqlite` |
| Health endpoint | `GET /api/health` |

公開 Image:

```text
ghcr.io/wamukat/soloboard
```

対応する環境変数:

| 変数 | デフォルト | 目的 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Container 内の bind address。 |
| `PORT` | `3000` | Container 内の application port。 |
| `SOLOBOARD_DB_FILE` | `/app/data/soloboard.sqlite` | SQLite database path。 |

推奨 `docker run`:

```bash
mkdir -p data
docker run --rm \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  ghcr.io/wamukat/soloboard:latest
```

Linux で bind mount を使う場合、host directory は image 内の `node` user である UID `1000` から書き込み可能である必要があります。

推奨 Docker Compose port mapping:

```yaml
name: soloboard

services:
  soloboard:
    # ...
    ports:
      - "${KANBAN_PORT:-3000}:3000"
    volumes:
      - soloboard-data:/app/data

volumes:
  soloboard-data:
```

公開 Image を local build せずに使う場合:

```bash
docker compose -f docker-compose.image.yml up
```

Container 内の `PORT` は基本的に `3000` のままにします。通常、user が変えるのは host 側の port だけです。

Compose では `container_name` を設定しません。Compose project name が標準的な分離機構であり、必要なら `docker compose -p <name> up` で上書きできます。デフォルト project name では container は `soloboard-soloboard-1` のように表示されます。

Compose の default persistence は `./data:/app/data` ではなく named volume にします。Bind mount は file へ直接アクセスできて便利ですが、Linux では存在しない host directory が root-owned で作成され、non-root container の初回起動で permission trap になりえます。Docker-managed named volume はこの問題を避けられます。

## 実装方針

### Runtime Image

`Dockerfile` は以下を満たします。

- Dockerfile syntax directive を追加する。
- Multi-stage build を維持する。
- Build stage で TypeScript を build する。
- Runtime stage には production dependencies だけを install する。
- Native bindings を使う `better-sqlite3` との互換性を保つ。
- `/app/data` を作成する。
- `/app/data` を runtime user が書き込み可能にする。
- Non-root user で実行する。
- Title、description、license の OCI image labels を追加する。
- `GET /api/health` を呼ぶ exec form の `HEALTHCHECK` を追加する。
- `.dockerignore` は local data、test output、development files を build context に含めないようにする。

受け入れ条件:

- `docker build -t soloboard:local .` が成功する。
- `docker run --rm -p 3000:3000 -v "$PWD/data:/app/data" soloboard:local` が起動する。
- `curl http://127.0.0.1:3000/api/health` が成功する。
- Board を作成すると mounted `./data` directory に書き込まれる。

### Compose

Compose file は以下を満たします。

- Predictable resource names のため top-level `name: soloboard` を設定する。
- Service name は `soloboard` のままにする。
- `container_name` は設定しない。
- `${KANBAN_PORT:-3000}:3000` で port mapping する。
- Container 内の `PORT` は `3000` にする。
- `SOLOBOARD_DB_FILE` は `/app/data/soloboard.sqlite` にする。
- Default local persistence には named volume を使う。
- Host file に直接アクセスしたい user 向けに bind mount を明示的な option として document する。
- `restart: unless-stopped` を維持する。

受け入れ条件:

- `docker compose up --build` で `http://127.0.0.1:3000` に起動する。
- `docker compose ps` で `soloboard-soloboard-1` のような predictable service container name が表示される。
- `KANBAN_PORT=3457 docker compose up --build` で `http://127.0.0.1:3457` に起動する。
- SQLite database が default では `soloboard-data` named volume に永続化される。

### ユーザードキュメント

`README.md` には以下を記載します。

- Docker Compose での build / run。
- Plain Docker での build / run。
- Host port の変更方法。
- Data storage location。
- SQLite database の backup 方法。
- Kanbalone には認証がなく、信頼できない network に直接公開しないこと。

### リリース公開

Image publishing workflow は、image 公開準備ができた段階で追加します。

推奨 registry:

- GitHub Container Registry: `ghcr.io/wamukat/soloboard`

推奨 tags:

- Git tag 由来の `vX.Y.Z`。
- Semantic version の `X.Y.Z`。
- 最新 release の `latest`。

推奨 trigger policy:

- Pull request では build のみ実行し push しない。
- `v*` に一致する Git tag で versioned image を push する。

## 検証チェックリスト

Docker 配布を完了扱いにする前に実行します。

```bash
pnpm build
pnpm test
docker build -t soloboard:local .
docker run --rm -d \
  --name soloboard-test \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  soloboard:local
curl http://127.0.0.1:3000/api/health
docker rm -f soloboard-test
docker compose up --build
```

UI confidence のため、Docker-served app に対して既存 E2E を実行するか、現在の Playwright web server flow を regression check として維持します。

```bash
pnpm test:e2e
```

## 運用メモ

- SQLite database が主な backup target です。
- Default database path は `/app/data/soloboard.sqlite` です。
- Default Docker Compose setup では database は `soloboard-data` named volume に保存されます。
- Bind mount を使う場合、host copy は通常 `./data/soloboard.sqlite` です。
- 単純で一貫した backup のため、database copy 前に container を停止してください。
- 同じ SQLite file に対して複数 Kanbalone container を起動しないでください。
- Kanbalone には現在認証がないため、public internet に直接公開しないでください。

## Platform follow-up

公開済み image は GHCR から pull 可能です。現在の publish workflow は `linux/amd64` のみを build します。`better-sqlite3` の native dependency が ARM64 runtime image で問題なく動くことを確認した後、`linux/arm64` を追加します。
