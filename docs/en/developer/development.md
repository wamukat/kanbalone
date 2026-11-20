# Development

## Requirements

- Node.js 26.13.1 LTS
- pnpm 10

If you use Volta:

```bash
volta install node@26.13.1
volta install pnpm@10.33.0
```

Node.js 25 and newer do not bundle Corepack. Install the pinned package manager explicitly when it is not already available:

```bash
npm install --global pnpm@10.33.0
```

The repository pins Node.js 26.13.1 through Volta. After changing Node versions, reinstall dependencies and rebuild the native SQLite extension under the new runtime:

```bash
pnpm install --frozen-lockfile
pnpm rebuild better-sqlite3
pnpm check
pnpm test:e2e
```


## Local Setup

Install dependencies:

```bash
pnpm install
```

Run in development mode:

```bash
pnpm dev
```

Build:

```bash
pnpm build
```

Run the built app:

```bash
pnpm start
```

Default URL:

```text
http://127.0.0.1:3000
```

## Testing

Run API and unit tests:

```bash
pnpm test
```

Run E2E tests:

```bash
pnpm test:e2e
```

Type-check:

```bash
pnpm exec tsc -p tsconfig.json --noEmit
```

## UI Preference Storage

Browser-side UI preferences are stored in `localStorage` under `kanbalone:ui-preferences`. The stored payload is versioned.

Stored values:

- Last opened board ID
- Kanban/List view per board
- Filter values per board
- Open/closed state of the `Status` and `Priority` filter menus per board

E2E coverage is split by responsibility: `test/e2e/filters.spec.ts` covers filter behavior, while `test/e2e/preferences.spec.ts` covers localStorage restoration and UI preferences. When changing the preference format, update migration handling and `preferences.spec.ts` together.

## Tech Stack

- Node.js 26.13.1 LTS
- pnpm
- Fastify
- SQLite via `better-sqlite3`
- Vanilla HTML/CSS/JavaScript
- TypeScript



## Lane completion migration

Before upgrading, back up the database while the old app is still available. Existing lanes become normal lanes, regardless of their names. For each board with resolved tickets (including archived tickets), the migration creates a separate `Completed (migration)` lane, adding a numeric suffix on name collision, and moves only resolved tickets there. Existing completion/archive flags, IDs and relationships are preserved. Unresolved tickets stay in their original lanes. Migration runs once in a transaction; a failure rolls back the entire change. Old exports follow the same preservation rule on import.

The previous app version cannot safely write the new completion model. To roll back, restore the pre-upgrade database as well as the old image. Acceptance is a normal lane for human review; do not mark a pre-existing Done lane complete unless all tickets in it should now be resolved.


See the [detailed migration procedure for users and AI agents](../migration-guide.md).
