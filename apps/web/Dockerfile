# syntax=docker/dockerfile:1
# Build a partir da raiz do monorepo: docker build -f apps/web/Dockerfile .
FROM node:26-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile --filter web... --ignore-scripts
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @finapp/contracts build && pnpm --filter web build

FROM caddy:2.11-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
