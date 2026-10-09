# syntax=docker/dockerfile:1.27

# ================ #
#   Base Stage     #
# ================ #

# Do NOT pin to $BUILDPLATFORM: the `runner` stage inherits from `base`, so pinning
# the base image to the builder's architecture bakes build-host binaries (dumb-init,
# node, …) into the runtime image. Under a QEMU-emulated multi-arch build the arm64
# manifest entry then contains amd64 binaries (and vice versa), so the container
# crashes on start with `/usr/bin/dumb-init: Exec format error`. Omitting --platform
# lets Docker build natively for $TARGETPLATFORM so every binary matches the run arch.
FROM node:24-alpine AS base

WORKDIR /usr/src/app

ENV CI="true"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# pnpm 12 keeps its managed runtime under PNPM_HOME, so keep the BuildKit-cached store
# in its own directory (as recommended by https://pnpm.io/docker) instead of /pnpm/store.
ENV pnpm_config_store_dir="/var/cache/pnpm"

RUN apk add --no-cache dumb-init g++ make python3
COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node pnpm-workspace.yaml .
COPY --chown=node:node package.json .

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

COPY --chown=node:node prisma/ prisma/
COPY --chown=node:node prisma.config.ts prisma.config.ts
COPY --chown=node:node src/ src/
COPY --chown=node:node tsconfig.base.json tsconfig.base.json
COPY --chown=node:node tsdown.config.ts tsdown.config.ts

RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
    pnpm install --frozen-lockfile \
    && pnpm run prisma:generate \
    && pnpm run build

# ================ #
#   Runner Stage   #
# ================ #

FROM base AS runner

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps --max_old_space_size=4096"


WORKDIR /usr/src/app

COPY --chown=node:node --from=builder /usr/src/app/dist dist
COPY --chown=node:node --from=builder /usr/src/app/src/.env src/.env

RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
    pnpm install --prod --frozen-lockfile

USER node

CMD [ "pnpm", "start" ]
