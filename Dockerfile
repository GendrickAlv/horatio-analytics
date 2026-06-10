# syntax=docker/dockerfile:1.7

# ---- deps: install full dependency tree (deterministic via lockfile) ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile Next.js into a standalone bundle ----
FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# `next build` evaluates server modules to collect route metadata. The DB
# client refuses to load without DATABASE_URL — a placeholder is enough
# because `postgres-js` connects lazily on first query, not at module init.
# This value is discarded at the end of this stage and never reaches runtime.
ENV DATABASE_URL=postgresql://buildtime:buildtime@localhost:5432/buildtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runtime: minimal image with just the standalone server output ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
# No `/app/public` copy: this project ships no static assets, and the directory
# is dropped by Git when empty, which trips Docker BuildKit's source-exists check.

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
