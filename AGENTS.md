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
- **Unused code:** `pnpm knip` (`knip.config.ts`) fails on unused files, unused or unlisted dependencies and unresolved imports, and runs in CI. The unused exports are only warnings: the exports of `src/lib` are auto-imported, which knip cannot see. The pieces are entry files; a new directory of pieces must be added to the `entry` of the bot
- **Auto imports:** the Stars CLI auto-imports every exported value of `src/lib/**` and of the framework (`.stars/imports.d.ts`). Import a class or enum that is only used as a type in its own `import type` statement (an inline `type X` in a mixed import is declared twice), and export a generic class apart from its declaration (`class X<K, V> {}` then `export { X }`): the scanner reads `, V` as a second export

## Plugins

`@wolfstar/plugin-api`, `plugin-i18next`, `plugin-subcommands-advanced`, `plugin-logger`, `plugin-gateway`, `plugin-cache`, `plugin-broker` and `plugin-sharder` are registered automatically: the Stars CLI injects `import '@wolfstar/plugin-*/register'` into `src/main.ts` for every `@wolfstar/plugin-*` package in `dependencies`. Do not add manual `/register` imports; add or remove the dependency instead.

- **Gateway:** the bot runs the Discord gateway in-process with `@wolfstar/plugin-gateway`. `createClient()` in `src/lib/Client.ts` builds a `GatewayClient` (intents, shards) backed by a `@wolfstar/plugin-cache` Redis cache (`container.redis`, prefix `wolfstar:cache`) and a Redis session store (prefix `wolfstar:sessions`, so a restart resumes the shards instead of identifying again), and `loadAll()` calls `container.gatewayClient.start()`, which loads the pieces, serves HTTP interactions and connects the shards. Gateway events reach regular listener pieces (`EventGatewayListener`). There is no separate gateway process. `@wolfstar/plugin-broker` can publish every dispatch onto a Redis stream for workers to replay: `createClient()` forwards them with `forwardGatewayDispatches` when `BROKER_ENABLED=true` (stream `BROKER_STREAM`, trimmed to `BROKER_MAX_LENGTH`); it is off by default. A second process started with `BOT_MODE=worker` never connects to Discord: it reads the stream as a member of the `BROKER_GROUP` consumer group (named `BROKER_CONSUMER`, unique per replica) and replays the dispatches on a `GatewayClient` sharing the same Redis cache (`replayGatewayDispatches`), with no HTTP server and no API. Run exactly one gateway process.
- **Sharding:** `@wolfstar/plugin-sharder` (`src/lib/sharder/`), off by default. With `SHARDER_ENABLED=true` the started process is the shard manager (`isShardManager()` in `main.ts`): it never connects to Discord, it spawns `SHARDER_CLUSTERS` shards (one per CPU core by default) as `node:cluster` workers running the same script, splits Discord's recommended gateway shards between them and paces their identifies. The shards share the ports of the interactions endpoint and of the API. In a shard, `createClient()` sets `container.shard` (`ShardClient`, `null` in a single process) and gives its gateway shards to the `GatewayClient`. State kept in memory is per shard: a settings write is broadcast (`broadcastShardMessage({ type: 'settingsUpdate' })`) so the other shards drop their cached copy; add a message to `ShardMessages` and listen with `onShardMessage` for anything else that must cross processes. The manager process also creates a plain `Client` that never listens, for `container.logger` and for the listeners of its own events: the `SharderListener` pieces of `src/listeners/sharder/`, the only ones it loads; they are disabled in every other process. The moderation locks and the analytics message counter are not shared.
- **Scheduled tasks:** `@wolfstar/plugin-scheduled-tasks` (BullMQ on a second Redis connection, `container.redisTasks`, queue `tasks`, prefix `wolfstar:bull`) runs the `ScheduledTask` pieces in `src/scheduled-tasks/`. It is given to the client in `createClient()` (`plugins: [scheduledTasks()]`) and not through `modules` in `stars.config.ts`, because the options of a module are written into the build and the connection holds the Redis password. Schedule with `container.tasks.create({ name, payload }, delay)`; type the payload by augmenting `ScheduledTasks`. The tasks run on the gateway process, the one that calls `listen()`.
- **Moderation tasks:** a case with a duration gets a `moderationEnd*` job (`src/scheduled-tasks/moderation/`, on the `ModerationTask` base) that undoes it when it expires. The `moderationEntryAdd` listener creates it with the ID `moderation-<guildId>-<caseId>` (`getUndoTaskId`), and `moderationEntryEdit` reschedules it when the duration changes or removes it when the case is completed or archived; `ModerationManagerEntry#fetchTask()` finds it. A task that throws is tried again 20 seconds later (`UndoTaskJobOptions`). `poststats` and `syncResourceAnalytics` are the repeated tasks (cron patterns).
- **Analytics:** with `INFLUX_ENABLED=true`, `createClient()` sets `container.analytics` (`AnalyticsData`, the InfluxDB write and query clients; `null` otherwise) and the `AnalyticsListener` pieces of `src/listeners/analytics/` are enabled. They write the server, user, command, message and resource points; `poststats` and `syncResourceAnalytics` trigger the periodic ones.
- **Lockdowns:** `/lockdown` keeps what each lockdown changed in the Redis hash `wolfstar:lockdowns` (`LockdownManager`), and a temporary one has a `moderationEndLockdown` job whose ID is the lockdown key, so both survive a restart.

## Environment (Varlock)

Configuration is described by [Varlock](https://varlock.dev) schemas instead of `.env.example` files. **Never read, print or edit `.env`, `.env.local` or `.env.*.local` files** (they hold real secrets; `.claude/settings.json` denies it). Read the schemas instead and validate with `pnpm exec varlock load --agent` (sensitive values are redacted). The `varlock` skill (`.agents/skills/varlock`) and the docs MCP (`.mcp.json`) are available.

- **Schemas:** one per package, sharing what is common through `@import`:
    - `.env.schema` (root): `NODE_ENV` (drives `@currentEnv`), `DATABASE_URL`, `TOLGEE_API_KEY`
    - `projects/database/.env.schema`: imports `DATABASE_URL` from the root
    - `projects/bot/src/.env.schema`: imports the shared items, declares everything the bot reads (`package.json#varlock.loadPath` is `./src/`). It generates `src/@types/env.d.ts` (do not edit it)
    - An import must also `pick` what the picked items depend on (`NODE_ENV`)
- **Values, lowest to highest precedence:** schema defaults → `.env.<NODE_ENV>` (tracked, throw-away local values only) → `.env.local` / `.env.<NODE_ENV>.local` (git-ignored) → the process environment. Deployed containers get theirs from the process environment.
- **Secrets:** never in a tracked file. Set them in a `.local` file or in the process environment. Only the items that are secret in production are `@sensitive` in production (`@sensitive=forEnv(production)`), so the committed local docker values are not flagged by `varlock scan`.
- **Loading:** `import 'varlock/auto-load'` is the first import of `src/main.ts`, `tests/setup.ts`, `projects/database/src/index.ts` and `prisma.config.ts`; it validates the environment and fills `process.env`. Wrap other commands with `varlock run -- <cmd>` (the `tolgee:*` scripts do). `varlock scan --staged` runs in the pre-commit hook.
- **Adding a variable:** declare it in the schema of the package that reads it (with `@type`, `@required`/`@optional`, `@sensitive` when it is a secret), add a local value to `.env.<NODE_ENV>` only if it is not a secret, then run `varlock load`.
- **Tests:** `NODE_ENV=test` selects `.env.test`; Discord and Redis are not required there.

## Database

- **ORM:** Prisma ORM 8 (`@prisma/orm-postgres`), accessed via `db` exported from `projects/database`
- **Contract:** `projects/database/src/contract.prisma`
- **Generated client:** `projects/database/src/generated/prisma/`
- **Prisma config:** `projects/database/prisma.config.ts`
- **Migrations:** `prisma/migrations/` (PostgreSQL)
- **Access:** `container.prisma` is the Prisma 8 `db` (type `Database` from `wolfstar-database`), set in `projects/bot/src/lib/setup/prisma.ts`. Query with `container.prisma.orm.public.<Model>` and `container.prisma.transaction(async (tx) => …)`
- **Types:** `Models.public_<Model>` from `wolfstar-database`; `BigInt` columns decode to `bigint`, `Jsonb` to `JsonValue`, `TimestampString(3)` to a branded string
- **Typed JSON:** `prisma-orm-extension-typed-json` (replaces `prisma-json-types-generator`). A `Jsonb` column gets its TypeScript type from a `types { X = typed.Json("PrismaJson.X") }` entry in `contract.prisma`, and `PrismaJson.X` is declared in `projects/database/src/settings/types.ts`. The extension is registered in `prisma.config.ts` and in `db` (`typedRuntimeDescriptor`). The emitter drops `import(...)` expressions, so only global names work. It is only published for Prisma `8.0.0-rc.5`: `pnpm-workspace.yaml` overrides its Prisma packs to rc.13 and `patches/` adds the `dataType` that rc.13 requires from every codec. Drop both once it ships a rc.13+ build

## Settings System

- **Data:** `GuildData` (`projects/database/src/settings/types.ts`, exported by `wolfstar-database`) is flat. Its keys and their types are derived from the `Columns` map of `projects/database/src/settings/columns.ts` and from the models of the contract (`StoredGuildData`), so a column the table does not have, or a conversion that does not fit it, does not compile. Each key is prefixed by the Prisma 8 table it is stored in (`rolesAdmin` → `GuildRoles.admin`, `logsMemberAdd` → `GuildLogs.memberAdd`, `selfmodLinksEnabled` → `GuildAutoModerationLinks.enabled`, …). Snowflakes are strings in `GuildData`, `bigint` in the database
- **Storage:** `projects/database/src/settings/storage.ts` (`fetchGuildData`, `writeGuildData(db, …)`, in `wolfstar-database`) maps every key to its table and column, reads a guild from all the tables, and writes changes in one transaction. Missing rows are created in foreign-key order (`Guild` → `Modules` → `GuildAutoModeration` → rule tables). To add a setting, add its column to the `Columns` map in `columns.ts`, its default to `constants.ts` (both in `projects/database/src/settings/`) and its key to `configuration.ts` (bot)
- **Cache:** In-memory `Collection<string, GuildData>` in `src/lib/database/settings/functions.ts`
- **Context:** `SettingsContext` in `src/lib/database/settings/context/SettingsContext.ts`
    - Holds `AdderManager`, `PermissionNodeManager`, word filter regex, rate limiter
    - Has `update(settings, data)` for patching context on settings change
- **Structures:** `src/lib/database/settings/structures/` (AdderManager, PermissionNodeManager, AuditLogManager, Serializer, SerializerStore)
- **Schema:** `configuration.ts` describes every key (`SchemaKey`: type, range, default, `dashboardOnly`) in groups (`SchemaGroup`) by its dotted name
- **Serializers:** the pieces of the `serializers` store (`src/serializers/`, registered by `lib/setup/serializers.ts`), named after the `type` of the keys they handle (aliases included, e.g. `number` also answers `integer` and `float`). A serializer parses the text a user wrote (`parse(input, context)`), validates a stored value (`isValid`) and formats it (`stringify`, which may be asynchronous since roles and channels come from the gateway cache). `SchemaKey#parse/stringify/display` and `set`/`remove`/`reset` in `Utils.ts` go through them
- **`/conf`:** `src/commands/Admin/conf.ts` opens the settings menu, a Components V2 message rendered by `lib/structures/settings-menu` (module select menu, one row per key with its edit button, paginated). The `conf` interaction handler (`src/interaction-handlers/conf.ts`) reads what a click does from its custom ID (`conf.<ownerId>.<verb>:<target>:<page>`), so the menu keeps no state. What is written in a modal is parsed, and what is picked in a select menu is validated, by the serializer of the key. It uses `@wolfstar/http-framework-utilities` for the custom IDs and for the reset confirmation (`MessagePrompter`), whose handlers `lib/setup/all.ts` registers with `@wolfstar/http-framework-utilities/register`
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

InfluxDB and Redis in `compose.dev.yaml` are optional. For local dev without InfluxDB, set `INFLUX_ENABLED=false` when starting the bot (see `projects/bot/src/.env.schema`).

### Common commands

| Task                     | Command                           |
| ------------------------ | --------------------------------- |
| Install deps             | `pnpm install`                    |
| Generate Prisma client   | `pnpm prisma:generate`            |
| Lint                     | `pnpm lint`                       |
| Type-check               | `pnpm typecheck`                  |
| Unused code              | `pnpm knip`                       |
| Unit tests               | `pnpm test`                       |
| Build                    | `pnpm build`                      |
| Dev (watch + start)      | `pnpm dev`                        |
| Start (production build) | `INFLUX_ENABLED=false pnpm start` |
| Pull translations        | `pnpm tolgee:pull`                |
| Push translations        | `pnpm tolgee:push`                |

Unit tests import `#lib/setup` via `tests/setup.ts`, which loads `src/lib/setup/prisma.ts` and constructs `PrismaPg` from `process.env.DATABASE_URL`, so tests require a `DATABASE_URL`/PostgreSQL connection. They do not require a `DISCORD_TOKEN` because mocked Discord is provided by `tests/setup.ts` and `tests/mocks/MockInstances.ts`. Full bot startup requires a valid `DISCORD_TOKEN` and `DISCORD_PUBLIC_KEY`, see [Environment (Varlock)](#environment-varlock).

### REST API

When the bot is logged in, the embedded API listens on `API_HOST`:`API_PORT` (default `127.0.0.1:8282`). `GET /` returns `{"message":"Hello World"}` (`src/routes/index.get.ts`).

The routes are file-based (`src/routes/**`, `<path>.<method>.ts`). The OAuth2 routes (`src/routes/oauth/`) use `getAuth()` from `src/lib/api/utils.ts`, built from the `OAUTH_*` variables; they are disabled when `OAUTH_SECRET` is unset.
