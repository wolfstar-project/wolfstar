# syntax=docker/dockerfile:1.27

# ================ #
#   Base Stage     #
# ================ #
#
# Keep it in sync with the Dockerfile at the root, which is the one the Continuous Delivery workflow builds.

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

RUN apk add --no-cache dumb-init g++ make python3
# Uses the pnpm version pinned in package.json `packageManager`.
RUN corepack enable

# pnpm validates the whole workspace on install, so every workspace manifest has
# to be present even when only one project is built.
COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node pnpm-workspace.yaml .
COPY --chown=node:node package.json .
COPY --chown=node:node .npmrc .
# The patches `pnpm-workspace.yaml` lists are applied on install:
COPY --chown=node:node patches/ patches/
# pnpm runs the root `prepare` script on install; .husky/install.mjs is what
# reads CI=true to opt out, so it has to exist.
COPY --chown=node:node .husky/ .husky/
COPY --chown=node:node projects/bot/package.json projects/bot/package.json
COPY --chown=node:node projects/database/package.json projects/database/package.json

# Populate the pnpm store from the lockfile only, so this layer stays cached
# until dependencies change and later installs can resolve from it.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

ENTRYPOINT ["dumb-init", "--"]

# ================ #
#   Builder Stage  #
# ================ #

FROM base AS builder

ENV NODE_ENV="development"

COPY --chown=node:node tsconfig.base.json tsconfig.base.json
COPY --chown=node:node scripts/ scripts/

# wolfstar-bot links wolfstar-database as a workspace dependency, so it has to
# be built before it.
COPY --chown=node:node projects/database/ projects/database/
COPY --chown=node:node projects/bot/ projects/bot/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile \
    && pnpm --filter wolfstar-database prisma:generate \
    && pnpm --filter wolfstar-database --filter wolfstar-bot run build

# ================ #
#   Runner Stage   #
# ================ #

FROM base AS runner

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps --max_old_space_size=4096"

# The environment is described by the varlock schemas (the bot's imports the root one) and its values come from the
# process environment at run time; see `.env.schema`. Secrets are never baked into the image.
COPY --chown=node:node .env.schema .env.schema
COPY --chown=node:node projects/bot/src/.env.schema projects/bot/src/.env.schema
COPY --chown=node:node --from=builder /usr/src/app/projects/bot/dist projects/bot/dist
COPY --chown=node:node --from=builder /usr/src/app/projects/database/dist projects/database/dist

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile
RUN chown node:node /usr/src/app/

USER node

WORKDIR /usr/src/app/projects/bot

# Run the built application directly; pnpm 12 may auto-install at startup.
CMD [ "node", "dist/main.mjs" ]
