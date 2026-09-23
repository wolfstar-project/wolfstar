# AGENTS.md - wolfstar Bot

## Project Overview

Discord bot built on **Sapphire Framework** (discord.js). TypeScript, PostgreSQL (Prisma ORM).

## Conventions

- **Language:** TypeScript (strict mode, `@sapphire/ts-config`)
- **Module system:** ESM (`"type": "module"`)
- **Path aliases:** `#lib/*`, `#common`, `#types`, `#utils/*` (→ `src/lib/utilities`), `#root/*` — one map in `projects/bot/scripts/aliases.ts`, shared by `stars.config.ts` and `projects/bot/vitest.config.ts` (same layout as [staryl](https://github.com/wolfstar-project/staryl))
- **Naming:** camelCase for files/variables, PascalCase for classes
- **Build tool:** tsdown
- **Formatter/Linter:** oxlint + oxfmt, prettier
- **Test runner:** vitest (globals enabled, setup in `tests/setup.ts`)
- **Package manager:** pnpm (workspace)

## Plugins

`@wolfstar/plugin-api`, `plugin-i18next`, `plugin-subcommands-advanced` and `plugin-logger` are registered automatically: the Stars CLI injects `import '@wolfstar/plugin-*/register'` into `src/main.ts` for every `@wolfstar/plugin-*` package in `dependencies`. Do not add manual `/register` imports; add or remove the dependency instead.

## Database

- **ORM:** Prisma ORM 8 (`@prisma/orm-postgres`), accessed via `db` exported from `projects/database`
- **Contract:** `projects/database/src/contract.prisma`
- **Generated client:** `projects/database/src/generated/prisma/`
- **Prisma config:** `projects/database/prisma.config.ts`
- **Migrations:** `prisma/migrations/` (PostgreSQL)
- **Access:** `container.prisma` is the Prisma 8 `db` (type `Database` from `wolfstar-database`), set in `projects/bot/src/lib/setup/prisma.ts`. Query with `container.prisma.orm.public.<Model>` and `container.prisma.transaction(async (tx) => …)`
- **Types:** `Models.public_<Model>` from `wolfstar-database`; `BigInt` columns decode to `bigint`, `Jsonb` to `JsonValue`, `TimestampString(3)` to a branded string

## Settings System

- **Data:** `GuildData` (`src/lib/database/settings/types.ts`) is flat. Each key is prefixed by the Prisma 8 table it is stored in (`rolesAdmin` → `GuildRoles.admin`, `logsMemberAdd` → `GuildLogs.memberAdd`, `selfmodLinksEnabled` → `GuildAutoModerationLinks.enabled`, …). Snowflakes are strings in `GuildData`, `bigint` in the database
- **Storage:** `src/lib/database/settings/storage.ts` maps every key to its table and column, reads a guild from all the tables, and writes changes in one transaction. Missing rows are created in foreign-key order (`Guild` → `Modules` → `GuildAutoModeration` → rule tables). To add a setting, add the column to `types.ts`, `constants.ts`, `configuration.ts` and the `Columns` map in `storage.ts`
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

## Localization

- **Tooling:** [Tolgee](https://tolgee.io/) (migrated from Crowdin)
- **Config:** `.tolgeerc.cjs` (project id, locale↔Tolgee-tag mapping, push file list, pull output path)
- **Locale files:** `src/languages/{discordLocale}/{namespace}.json` (e.g. `en-US/globals.json`, `en-US/commands/admin.json`)
- **Typed keys:** `pnpm --filter wolfstar-bot i18n:generate` (`stars codegen`) regenerates `projects/bot/src/@types/i18next.d.ts` from `src/locales/en-US` via `@wolfstar/i18next-type-generator`; `stars codegen --check` fails when it is stale. Run it after editing `en-US` files, never hand-edit the output
- **Base locale:** `en-US` is push-only — it is the local source of truth and a pull never writes it
- **Pull remap script:** `scripts/tolgee-pull-remap.ts` — merges `tolgee pull` output from `.tolgee-pull/{tolgeeTag}/` onto the matching `src/languages/{discordLocale}/` files. It drops untranslated values (`null`, blank, empty ICU plural shells), rejects translations whose i18next placeholders don't match `en-US`, prunes keys `en-US` no longer defines, and rewrites files in repo style (tabs, trailing newline) keeping the existing key order — so the diff only ever shows real translation changes
- **Sanitizing helpers:** `scripts/lib/locale-sanitize.ts`, shared with `tests/languages/locales.test.ts` so the definition of a valid locale file lives in one place
- **Automated sync:** `.github/workflows/tolgee-sync.yml` runs `pnpm tolgee:pull` nightly (02:00 UTC), validates the result with `pnpm vitest run tests/languages`, and opens/updates a PR from the fixed `i18n` branch — don't hand-edit non-`en-US` locale files, they get overwritten by the next sync
- Requires `TOLGEE_API_KEY` in the environment for push/pull; never commit it

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
| Pull translations        | `pnpm tolgee:pull`                |
| Push translations        | `pnpm tolgee:push`                |

Unit tests import `#lib/setup` via `tests/setup.ts`, which loads `src/lib/setup/prisma.ts` and constructs `PrismaPg` from `process.env.DATABASE_URL`, so tests require a `DATABASE_URL`/PostgreSQL connection. They do not require a `DISCORD_TOKEN` because mocked Discord is provided by `tests/setup.ts` and `tests/mocks/MockInstances.ts`. Full bot startup requires a valid `DISCORD_TOKEN` in `src/.env` (or `src/.env.local`, gitignored).

### REST API

When the bot is logged in, the embedded API listens on `API_HOST`:`API_PORT` (default `127.0.0.1:8282`). `GET /` returns `{"message":"Hello World"}` (`src/routes/index.get.ts`).
