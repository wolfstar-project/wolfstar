# ================ #
#   Base Stage     #
# ================ #

FROM node:24-alpine AS base

WORKDIR /usr/src/app

ENV CI="true"
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache dumb-init g++ make python3
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY --chown=node:node pnpm-lock.yaml .
COPY --chown=node:node package.json .
COPY --chown=node:node .npmrc .

ENTRYPOINT ["dumb-init", "--"]

# ================ #
#   Builder Stage   #
# ================ #

FROM base AS builder

ENV NODE_ENV="development"

COPY --chown=node:node prisma/ prisma/
COPY --chown=node:node src/ src/
COPY --chown=node:node tsconfig.base.json tsconfig.base.json
COPY --chown=node:node tsdown.config.ts tsdown.config.ts

RUN pnpm install --frozen-lockfile \
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
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/src/.env src/.env


RUN pnpm install --prod --frozen-lockfile --offline

USER node

CMD [ "pnpm", "run", "start" ]
