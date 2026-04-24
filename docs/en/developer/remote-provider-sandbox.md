# Remote Provider Sandbox

Use the local Docker sandbox when you want to test GitLab and Redmine adapters end to end.

## What It Creates

- Redmine at `http://localhost:38080`
- GitLab at `http://localhost:38929`
- one sandbox project and one sandbox issue in each provider
- provider credentials for local Kanbalone testing
- `.env.local` with ready-to-use values

## Start The Sandbox

```bash
docker compose -f docker-compose.remote-providers.yml up -d
pnpm sandbox:remote-providers
```

The bootstrap script waits for both services, prepares test data, and writes `.env.local`.

After bootstrapping, the Kanbalone import panel still shows all supported providers. GitLab and Redmine become selectable because the generated credentials are now configured.

Generated variables:

- `KANBALONE_REMOTE_CREDENTIALS`
- `KANBALONE_REMOTE_REDMINE_ISSUE_URL`
- `KANBALONE_REMOTE_GITLAB_ISSUE_URL`
- `KANBALONE_REMOTE_GITLAB_API_ISSUE_URL`

## Start Kanbalone Against The Sandbox

```bash
set -a
source .env.local
set +a

PORT=3532 \
KANBALONE_DB_FILE=/tmp/kanbalone-remote-providers.sqlite \
pnpm start
```

Then open:

```text
http://127.0.0.1:3532
```

## Notes

- `KANBALONE_REMOTE_CREDENTIALS` is written as a JSON string, so sourcing `.env.local` is the simplest way to load it.
- GitLab 18 may expose issue URLs as `/-/work_items/:iid` through its API, while Kanbalone import uses the stable `/-/issues/:iid` form for user-facing sandbox URLs.
- `.env.local` is gitignored.
- Re-running `pnpm sandbox:remote-providers` is safe. It refreshes credentials and rewrites the remote-provider entries in `.env.local`.
