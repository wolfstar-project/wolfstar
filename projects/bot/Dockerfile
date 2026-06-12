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
RUN corepack enable && corepack prepare pnpm@11.4.0 --activate

COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node pnpm-workspace.yaml .
COPY --chown=node:node package.json .
COPY --chown=node:node projects/bot/package.json projects/bot/package.json

ENTRYPOINT ["dumb-init", "--"]

# ================ #
#   Builder Stage  #
# ================ #

FROM base AS builder

ENV NODE_ENV="development"

COPY --chown=node:node tsconfig.base.json tsconfig.base.json
COPY --chown=node:node scripts/ scripts/
COPY --chown=node:node projects/bot/scripts/ projects/bot/scripts/
COPY --chown=node:node projects/bot/src/ projects/bot/src/

RUN pnpm install --frozen-lockfile
RUN cd projects/bot/ && pnpm run build

# ================ #
#   Runner Stage   #
# ================ #

FROM base AS runner

ENV NODE_ENV="production"
ENV NODE_OPTIONS="--enable-source-maps --max_old_space_size=4096"

COPY --chown=node:node projects/bot/src/.env projects/bot/src/.env
COPY --chown=node:node --from=builder /usr/src/app/projects/bot/dist projects/bot/dist

RUN pnpm install --prod --frozen-lockfile --offline
RUN chown node:node /usr/src/app/

USER node

WORKDIR /usr/src/app/projects/bot

CMD [ "pnpm", "run", "start" ]
