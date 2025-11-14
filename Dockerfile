# syntax=docker/dockerfile:1.7

# ================ #
#    Base Stage    #
# ================ #

FROM node:22-alpine AS base

WORKDIR /usr/src/app

ENV HUSKY=0
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN set -ex && \
  apk add --no-cache \
  jq \
  libc6-compat \
  curl \
  build-base \
  dumb-init

RUN corepack enable

COPY --chown=node:node package.json .
COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node .npmrc .

ENTRYPOINT ["dumb-init", "--"]

# ================ #
#   Builder Stage  #
# ================ #

FROM base AS builder

ENV NODE_ENV="development"

COPY --chown=node:node tsconfig.base.json tsconfig.base.json
COPY --chown=node:node prisma/ prisma/
COPY --chown=node:node src/ src/

RUN pnpm install --frozen-lockfile \
 && pnpm run prisma:generate \
 && pnpm run build

# ================ #
#   Runner Stage   #
# ================ #

FROM base AS runner

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps --max_old_space_size=4096"

COPY --chown=node:node --from=builder /usr/src/app/package.json .
COPY --chown=node:node --from=builder /usr/src/app/pnpm-lock.yaml .
COPY --chown=node:node --from=builder /usr/src/app/dist dist

RUN pnpm install --frozen-lockfile --prod

# Patch .prisma with the built files
COPY --chown=node:node --from=builder /usr/src/app/node_modules/.prisma node_modules/.prisma

USER node

CMD [ "pnpm", "run", "start" ]
