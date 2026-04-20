# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

FROM deps AS build

WORKDIR /app

COPY src ./src
COPY public ./public
COPY tsconfig.json ./

RUN pnpm build

FROM base AS prod-deps

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile --prod

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

LABEL org.opencontainers.image.title="Kanbalone" \
  org.opencontainers.image.description="Ultra-light local personal kanban for human and AI collaboration" \
  org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV SOLOBOARD_DB_FILE=/app/data/soloboard.sqlite

COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/public ./public

RUN mkdir -p /app/data \
  && chown -R node:node /app

USER node

EXPOSE 3000

VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "const port = process.env.PORT || 3000; fetch('http://127.0.0.1:' + port + '/api/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "dist/src/server.js"]
