# ================ #
#    Base Stage    #
# ================ #

FROM node:22-alpine AS base

WORKDIR /usr/src/app

ENV HUSKY=0
ENV CI=true

RUN apk add --no-cache dumb-init g++ make python3

COPY --chown=node:node pnpm-lock-yaml .
COPY --chown=node:node package.json .
COPY --chown=node:node .pnpmrc.yml .

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

COPY --chown=node:node --from=builder /usr/src/app/dist dist

COPY --chown=node:node src/.env src/.env

RUN pnpm install --prod --frozen-lockfile

# Patch .prisma with the built files
COPY --chown=node:node --from=builder /usr/src/app/node_modules/.prisma node_modules/.prisma

USER node

CMD [ "pnpm", "run", "start" ]
