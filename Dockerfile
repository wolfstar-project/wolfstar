# ================ #
#    Base Stage    #
# ================ #

FROM node:22-alpine AS base

WORKDIR /usr/src/app

ENV CI=true
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache dumb-init=1.2.5-r3 g++=13.2.1_git20231014-r0 make=4.4.1-r2 python3=3.12.8-r1

RUN corepack enable
RUN corepack prepare pnpm@10.13.1 --activate

COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node package.json .

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
 && pnpm run build \
 && pnpm prune --prod

# ================ #
#   Runner Stage   #
# ================ #

FROM base AS runner

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps --max_old_space_size=4096"

COPY --chown=node:node --from=builder /usr/src/app/dist dist

COPY --chown=node:node src/.env src/.env

COPY --chown=node:node --from=builder /usr/src/app/node_modules node_modules

# Patch .prisma with the built files
COPY --chown=node:node --from=builder /usr/src/app/node_modules/.prisma node_modules/.prisma

USER node

CMD [ "pnpm", "run", "start" ]
