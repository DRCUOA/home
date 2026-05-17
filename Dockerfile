# syntax=docker/dockerfile:1.7

# ---------- Stage 1: base with pnpm ----------
FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---------- Stage 2: install all deps (cached) ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/api/package.json   packages/api/package.json
COPY packages/web/package.json   packages/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ---------- Stage 3: build api + web ----------
FROM deps AS build
COPY . .
RUN pnpm -r run build

# ---------- Stage 4: production deps only ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json   packages/api/package.json
COPY packages/web/package.json   packages/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile --prod

# ---------- Stage 5: runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Non-root user
RUN groupadd --system --gid 1001 nodejs \
 && useradd  --system --uid 1001 --gid nodejs nodejs

# Workspace layout (so the API can resolve @hcc/shared via pnpm symlinks)
COPY --from=prod-deps /app/node_modules                       /app/node_modules
COPY --from=prod-deps /app/packages/api/node_modules          /app/packages/api/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules       /app/packages/shared/node_modules

# Built artifacts
COPY --from=build /app/packages/api/dist        /app/packages/api/dist
COPY --from=build /app/packages/web/dist        /app/packages/web/dist
COPY --from=build /app/packages/shared/dist     /app/packages/shared/dist

# Package manifests (needed for ESM resolution / workspace layout)
COPY --from=build /app/package.json             /app/package.json
COPY --from=build /app/pnpm-workspace.yaml      /app/pnpm-workspace.yaml
COPY --from=build /app/packages/api/package.json    /app/packages/api/package.json
COPY --from=build /app/packages/web/package.json    /app/packages/web/package.json
COPY --from=build /app/packages/shared/package.json /app/packages/shared/package.json

# SQL migration files are read at runtime by packages/api/dist/migrate.js
# (uses drizzle-orm/node-postgres/migrator — a runtime dep, no CLI needed).
COPY --from=build /app/packages/api/src/db/migrations   /app/packages/api/src/db/migrations

# Volume mount point for user-uploaded files (Railway volume mounts here)
RUN mkdir -p /app/uploads && chown -R nodejs:nodejs /app
USER nodejs

ENV PORT=3001
EXPOSE 3001

# Run migrations programmatically (drizzle-orm/migrator, no CLI),
# then start the API.
CMD ["sh", "-c", "node packages/api/dist/migrate.js && node packages/api/dist/index.js"]
