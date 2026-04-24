# Remote Provider Sandbox

GitLab / Redmine adapter を end-to-end で確認したいときは、ローカル Docker sandbox を使います。

## 作成されるもの

- Redmine: `http://localhost:38080`
- GitLab: `http://localhost:38929`
- 各 provider に sandbox project と sandbox issue を 1 件ずつ
- ローカル Kanbalone 検証用の provider credential
- すぐ使える `.env.local`

## Sandbox の起動

```bash
docker compose -f docker-compose.remote-providers.yml up -d
pnpm sandbox:remote-providers
```

bootstrap script は両サービスの起動待機、テストデータ作成、`.env.local` の書き込みまで行います。

bootstrap 後は Kanbalone に remote import の導線が表示され、import panel には設定済みの GitLab / Redmine provider が表示されます。

生成される変数:

- `KANBALONE_REMOTE_CREDENTIALS`
- `KANBALONE_REMOTE_REDMINE_ISSUE_URL`
- `KANBALONE_REMOTE_GITLAB_ISSUE_URL`
- `KANBALONE_REMOTE_GITLAB_API_ISSUE_URL`

## Kanbalone を Sandbox 向けに起動

```bash
set -a
source .env.local
set +a

PORT=3532 \
KANBALONE_DB_FILE=/tmp/kanbalone-remote-providers.sqlite \
pnpm start
```

ブラウザで開く URL:

```text
http://127.0.0.1:3532
```

## 補足

- `KANBALONE_REMOTE_CREDENTIALS` は JSON 文字列なので、`.env.local` を `source` するのが一番扱いやすいです。
- GitLab 18 では API が issue URL として `/-/work_items/:iid` を返すことがありますが、Kanbalone の import 用 sandbox URL は安定した `/-/issues/:iid` で出力しています。
- `.env.local` は gitignore 済みです。
- `pnpm sandbox:remote-providers` は再実行しても問題ありません。credential を更新し、`.env.local` の remote provider 関連エントリを書き換えます。
- Kanbalone は remote provider credential が 1 つ以上読み込まれている場合だけ、remote issue import の導線を表示します。
