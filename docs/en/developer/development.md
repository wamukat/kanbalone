# Development

## Requirements

- Node.js 22
- pnpm 10

If you use Volta:

```bash
volta install node@22
volta install pnpm@10.33.0
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

## Tech Stack

- Node.js 22
- pnpm
- Fastify
- SQLite via `better-sqlite3`
- Vanilla HTML/CSS/JavaScript
- TypeScript

