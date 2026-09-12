# ================ #
#    Base Stage    #
# ================ #

FROM node:24-alpine AS base

WORKDIR /usr/src/app

ENV HUSKY=0
ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache dumb-init g++ make python3
RUN corepack enable && corepack prepare pnpm@12.4.1 --activate

# pnpm validates the whole workspace on install, so every workspace manifest has
# to be present even when only one project is built.
COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node pnpm-workspace.yaml .
COPY --chown=node:node package.json .
COPY --chown=node:node .npmrc .
# pnpm runs the root `prepare` script on install; .husky/install.mjs is what
# reads CI=true to opt out, so it has to exist.
COPY --chown=node:node .husky/ .husky/
COPY --chown=node:node projects/bot/package.json projects/bot/package.json
COPY --chown=node:node projects/database/package.json projects/database/package.json
COPY --chown=node:node projects/gateway/package.json projects/gateway/package.json
COPY --chown=node:node projects/shared/package.json projects/shared/package.json

ENTRYPOINT ["dumb-init", "--"]

# ================ #
#   Builder Stage  #
# ================ #

FROM base AS builder

ENV NODE_ENV="development"

COPY --chown=node:node tsconfig.base.json tsconfig.base.json
COPY --chown=node:node scripts/ scripts/

# wolfstar-gateway links wolfstar-shared as a workspace dependency, so it has to
# be built first.
COPY --chown=node:node projects/shared/ projects/shared/
COPY --chown=node:node projects/gateway/ projects/gateway/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter wolfstar-shared --filter wolfstar-gateway run build

# ================ #
#   Runner Stage   #
# ================ #

FROM base AS runner

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps --max_old_space_size=4096"

COPY --chown=node:node projects/gateway/src/.env projects/gateway/src/.env
COPY --chown=node:node --from=builder /usr/src/app/projects/gateway/dist projects/gateway/dist
COPY --chown=node:node --from=builder /usr/src/app/projects/shared/dist projects/shared/dist

# Not --offline: the runner is a fresh layer off `base` with an empty pnpm
# store, so an offline install fails with ERR_PNPM_NO_OFFLINE_TARBALL.
RUN pnpm install --prod --frozen-lockfile
RUN chown node:node /usr/src/app/

USER node

WORKDIR /usr/src/app/projects/gateway

CMD [ "pnpm", "run", "start" ]
