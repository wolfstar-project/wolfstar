# AGENTS.md - wolfstar Bot

## Project Overview

Discord bot built on **Sapphire Framework** (discord.js). TypeScript, PostgreSQL (Prisma ORM).

## Conventions

- **Language:** TypeScript (strict mode, `@sapphire/ts-config`)
- **Module system:** ESM (`"type": "module"`)
- **Path aliases:** `#lib/*`, `#utils/*`, `#generated/prisma`, `#root/*`, `#languages`
- **Naming:** camelCase for files/variables, PascalCase for classes
- **Build tool:** tsdown
- **Formatter/Linter:** oxlint + oxfmt, prettier
- **Test runner:** vitest (globals enabled, setup in `tests/vitest.setup.ts`)
- **Package manager:** pnpm (workspace)

## Database

- **ORM:** Prisma Client v7+ with `@prisma/adapter-pg`
- **Schema:** `prisma/schema.prisma`
- **Generated client:** `src/generated/prisma/`
- **Prisma config:** `prisma.config.ts`
- **Migrations:** `prisma/migrations/` (PostgreSQL)
- **Access:** `container.prisma` (Sapphire container)

## Settings System

- **Cache:** In-memory `Collection<string, GuildData>` in `src/lib/database/settings/functions.ts`
- **Context:** `SettingsContext` in `src/lib/database/settings/context/SettingsContext.ts`
    - Holds `AdderManager`, `PermissionNodeManager`, word filter regex, rate limiter
    - Has `update(settings, data)` for patching context on settings change
- **Structures:** `src/lib/database/settings/structures/` (AdderManager, PermissionNodeManager, Serializer, SerializerStore)
- **Exports:** `src/lib/database/settings/index.ts` re-exports all
- **Top-level:** `src/lib/database/index.ts` re-exports settings + matchers

## Test Patterns

- Tests mirror `src/` structure under `tests/`
- Existing structure tests: `tests/lib/database/settings/structures/PermissionNodeManager.test.ts`
- vitest globals enabled (no explicit imports for `describe`, `it`, `expect`)

## Plan Directory

`.atlas/plans/*`

## Cursor Cloud specific instructions

### Runtime requirements

- **Node.js >= 24** (`package.json` engines). The VM may ship Node 22 at `/exec-daemon/node`; use nvm (`nvm use 24`) and prepend `$NVM_DIR/versions/node/$(nvm current)/bin` to `PATH` before running pnpm.
- **Docker** is required for local PostgreSQL (`compose.dev.yaml`). If `docker compose` fails with permission errors, run `sudo chmod 666 /var/run/docker.sock` once per session.

### Infrastructure (manual per session)

Start PostgreSQL before running the bot or applying migrations:

```bash
docker compose -f compose.dev.yaml up postgres2 -d
pnpm prisma migrate deploy   # first-time only
```

InfluxDB and Redis in `compose.dev.yaml` are optional. For local dev without InfluxDB, set `INFLUX_ENABLED=false` when starting the bot (see `src/.env`).

### Common commands

| Task                     | Command                           |
| ------------------------ | --------------------------------- |
| Install deps             | `pnpm install`                    |
| Generate Prisma client   | `pnpm prisma:generate`            |
| Lint                     | `pnpm lint`                       |
| Unit tests               | `pnpm test`                       |
| Build                    | `pnpm build`                      |
| Dev (watch + start)      | `pnpm dev`                        |
| Start (production build) | `INFLUX_ENABLED=false pnpm start` |

Unit tests import `#lib/setup` via `tests/vitest.setup.ts`, which loads `src/lib/setup/prisma.ts` and constructs `PrismaPg` from `process.env.DATABASE_URL`, so tests require a `DATABASE_URL`/PostgreSQL connection. They do not require a `DISCORD_TOKEN` because mocked Discord is provided by `tests/vitest.setup.ts` and `tests/mocks/MockInstances.ts`. Full bot startup requires a valid `DISCORD_TOKEN` in `src/.env` (or `src/.env.local`, gitignored).

### REST API

When the bot is logged in, the embedded API listens on `API_HOST`:`API_PORT` (default `127.0.0.1:8282`). `GET /` returns `{"message":"Hello World"}` (`src/routes/index.get.ts`).
