# syntax=docker/dockerfile:1.27

# ================ #
#   Base Stage     #
# ================ #
#
# This is the image the Continuous Delivery workflow publishes to GHCR; it builds
# wolfstar-bot. Keep it in sync with projects/bot/Dockerfile.

# Do NOT pin to $BUILDPLATFORM: the `runner` stage inherits from `base`, so pinning
# the base image to the builder's architecture bakes build-host binaries (dumb-init,
# node, …) into the runtime image. Under a QEMU-emulated multi-arch build the arm64
# manifest entry then contains amd64 binaries (and vice versa), so the container
# crashes on start with `/usr/bin/dumb-init: Exec format error`. Omitting --platform
# lets Docker build natively for $TARGETPLATFORM so every binary matches the run arch.
FROM node:24-alpine AS base

WORKDIR /usr/src/app

ENV HUSKY=0
ENV CI="true"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# pnpm 12 keeps its managed runtime under PNPM_HOME, so keep the BuildKit-cached store
# in its own directory (as recommended by https://pnpm.io/docker) instead of /pnpm/store.
ENV pnpm_config_store_dir="/var/cache/pnpm"

RUN apk add --no-cache dumb-init g++ make python3
# pnpm validates the whole workspace on install, so every workspace manifest has
# to be present even when only one project is built.
COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node pnpm-workspace.yaml .
COPY --chown=node:node package.json .
# The patches `pnpm-workspace.yaml` lists are applied on install:
COPY --chown=node:node patches/ patches/
# pnpm runs the root `prepare` script on install; .husky/install.mjs is what
# reads CI=true to opt out, so it has to exist.
COPY --chown=node:node .husky/ .husky/
COPY --chown=node:node projects/bot/package.json projects/bot/package.json
COPY --chown=node:node projects/database/package.json projects/database/package.json
COPY --chown=node:node projects/shared/package.json projects/shared/package.json

# Install the pnpm version pinned in package.json `packageManager` into a Corepack cache
# every user can read; otherwise the unprivileged `node` user re-downloads pnpm on each start.
ENV COREPACK_HOME="/usr/local/share/corepack"
RUN corepack enable \
    && corepack install \
    && chmod -R a+rX "$COREPACK_HOME"

# Populate the pnpm store from the lockfile only, so this layer stays cached
# until dependencies change and later installs can resolve from it.
RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
    pnpm fetch

ENTRYPOINT ["dumb-init", "--"]

# ================ #
#   Builder Stage  #
# ================ #

FROM base AS builder

ENV NODE_ENV="development"

COPY --chown=node:node tsconfig.base.json tsconfig.base.json
COPY --chown=node:node scripts/ scripts/

# wolfstar-bot links wolfstar-database and wolfstar-shared as workspace
# dependencies, so they have to be built before it.
COPY --chown=node:node projects/database/ projects/database/
COPY --chown=node:node projects/shared/ projects/shared/
COPY --chown=node:node projects/bot/ projects/bot/

RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
    pnpm install --frozen-lockfile \
    && pnpm --filter wolfstar-database prisma:generate \
    && pnpm --filter wolfstar-database --filter wolfstar-shared --filter wolfstar-bot run build

# ================ #
#   Runner Stage   #
# ================ #

FROM base AS runner

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps --max_old_space_size=4096"

# The OpenTelemetry SDK (the preload of `@wolfstar/plugin-opentelemetry`) only starts when Railway sets an OTLP endpoint.
# Its receiver takes traces only, so the metrics and the logs are not exported, and the cloud resource detectors (AWS,
# GCP, Azure, Alibaba) are left out: each one asks a metadata endpoint that is not there. So are the spans of every TCP
# connection and DNS lookup (`net`, `dns`), which the spans of the clients (`pg`, `ioredis`, `undici`) already cover. A
# variable of the service overrides these.
ENV OTEL_METRICS_EXPORTER="none"
ENV OTEL_LOGS_EXPORTER="none"
ENV OTEL_NODE_RESOURCE_DETECTORS="env,host,os,process,serviceinstance,container"
ENV OTEL_NODE_DISABLED_INSTRUMENTATIONS="net,dns"

# The environment is described by the varlock schemas (the bot's imports the root one) and its values come from the
# process environment at run time; see `.env.schema`. Secrets are never baked into the image.
COPY --chown=node:node .env.schema .env.schema
COPY --chown=node:node projects/bot/src/.env.schema projects/bot/src/.env.schema
COPY --chown=node:node --from=builder /usr/src/app/projects/bot/dist projects/bot/dist
COPY --chown=node:node --from=builder /usr/src/app/projects/database/dist projects/database/dist
COPY --chown=node:node --from=builder /usr/src/app/projects/shared/dist projects/shared/dist
# `pnpm start` brings the schema up to date before the bot starts, here and with the start command of a Railway service: `prisma db migrate` reads the contract and
# the migrations, and `legacy/schema.sql` is the starting point of a database that has no schema.
COPY --chown=node:node projects/database/.env.schema projects/database/.env.schema
COPY --chown=node:node projects/database/prisma.config.ts projects/database/prisma.config.ts
COPY --chown=node:node projects/database/legacy/ projects/database/legacy/
COPY --chown=node:node projects/database/migrations/ projects/database/migrations/
COPY --chown=node:node projects/database/scripts/ projects/database/scripts/
COPY --chown=node:node projects/database/src/contract.prisma projects/database/src/contract.prisma
COPY --chown=node:node --from=builder /usr/src/app/projects/database/src/generated/prisma projects/database/src/generated/prisma

RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
    pnpm install --prod --frozen-lockfile
RUN chown node:node /usr/src/app/

USER node

WORKDIR /usr/src/app/projects/bot

CMD [ "pnpm", "start" ]
