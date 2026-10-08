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
- **Unused code:** `pnpm knip` (`knip.config.ts`) fails on unused files, unused or unlisted dependencies and unresolved imports, and runs in CI. The unused exports are only warnings: the exports of `src/lib` are auto-imported, which knip cannot see. The pieces are entry files; a new directory of pieces must be added to the `entry` of the bot, and the barrels of `src/lib` and `Timers.ts` are ignored
- **Auto imports:** the Stars CLI auto-imports every exported value of `src/lib/**` and of the framework (`.stars/imports.d.ts`). Import a class or enum that is only used as a type in its own `import type` statement (an inline `type X` in a mixed import is declared twice), and export a generic class apart from its declaration (`class X<K, V> {}` then `export { X }`): the scanner reads `, V` as a second export
- **Command options:** `stars codegen` writes `projects/bot/src/@types/commands.d.ts` (`codegen.commands` in `stars.config.ts`, do not edit it): the options of every registered command, keyed by its path (`'slowmode'`, `'whois channel'`). It reads the built bot, so run `stars build` first after changing a builder. Type the options of `chatInputRun` with `Command.OptionsOf<'path'>` (the `Command` of `@wolfstar/http-framework` and the one of `@wolfstar/plugin-subcommands-advanced` both have it). Do not write an interface for the options by hand
- **MCP servers:** `.mcp.json` has the ones the agents use: the documentation of Varlock (`varlock-docs-mcp`), of the framework and the Stars CLI (`stars-docs`), of the Discord API (`discord-docs`) and of every other library (`context7`), plus `sentry`, `prisma` and `railway`, which ask to sign in. None holds a secret; do not add one that needs a key in the file

## Plugins

`@wolfstar/plugin-api`, `plugin-i18next`, `plugin-subcommands-advanced`, `plugin-logger`, `plugin-gateway`, `plugin-cache`, `plugin-broker` and `plugin-sharder` are registered automatically: the Stars CLI injects `import '@wolfstar/plugin-*/register'` into `src/main.ts` for every `@wolfstar/plugin-*` package in `dependencies`. Do not add manual `/register` imports; add or remove the dependency instead.

- **Gateway:** the bot runs the Discord gateway in-process with `@wolfstar/plugin-gateway`. `createClient()` in `src/lib/Client.ts` builds a `GatewayClient` (intents, shards) backed by a `@wolfstar/plugin-cache` Redis cache (`container.redis`, prefix `wolfstar:cache`) and a Redis session store (prefix `wolfstar:sessions`, so a restart resumes the shards instead of identifying again), and `loadAll()` calls `container.gatewayClient.start()`, which loads the pieces, serves HTTP interactions and connects the shards. Gateway events reach regular listener pieces (`EventGatewayListener`). There is no separate gateway process. `@wolfstar/plugin-broker` can publish every dispatch onto a Redis stream for workers to replay: `createClient()` forwards them with `forwardGatewayDispatches` when `BROKER_ENABLED=true` (stream `BROKER_STREAM`, trimmed to `BROKER_MAX_LENGTH`); it is off by default. A second process started with `BOT_MODE=worker` never connects to Discord: it reads the stream as a member of the `BROKER_GROUP` consumer group (named `BROKER_CONSUMER`, unique per replica) and replays the dispatches on a `GatewayClient` sharing the same Redis cache (`replayGatewayDispatches`), with no HTTP server and no API. Run exactly one gateway process.
- **Sharding:** `@wolfstar/plugin-sharder` (`src/lib/sharder/`), off by default. With `SHARDER_ENABLED=true` the started process is the shard manager (`isShardManager()` in `main.ts`): it never connects to Discord, it spawns `SHARDER_CLUSTERS` shards (one per CPU core by default) as `node:cluster` workers running the same script, splits Discord's recommended gateway shards between them and paces their identifies. The shards share the ports of the interactions endpoint and of the API. In a shard, `createClient()` sets `container.shard` (`ShardClient`, `null` in a single process) and gives its gateway shards to the `GatewayClient`. State kept in memory is per shard: a settings write is broadcast (`broadcastShardMessage({ type: 'settingsUpdate' })`) so the other shards drop their cached copy; add a message to `ShardMessages` and listen with `onShardMessage` for anything else that must cross processes. The manager process also creates a plain `Client` that never listens, for `container.logger` and for the listeners of its own events: the `SharderListener` pieces of `src/listeners/sharder/`, the only ones it loads; they are disabled in every other process. The moderation locks and the analytics message counter are not shared.
- **Scheduled tasks:** `@wolfstar/plugin-scheduled-tasks` (BullMQ on a second Redis connection, `container.redisTasks`, queue `tasks`, prefix `wolfstar:bull`) runs the `ScheduledTask` pieces in `src/scheduled-tasks/`. It is given to the client in `createClient()` (`plugins: [scheduledTasks()]`) and not through `modules` in `stars.config.ts`, because the options of a module are written into the build and the connection holds the Redis password. Schedule with `container.tasks.create({ name, payload }, delay)`; type the payload by augmenting `ScheduledTasks`. The tasks run on the gateway process, the one that calls `listen()`. A task that needs the gateway sets `waitForReady: true` in its options: its job waits for the `ready` option of `tasks` (`gatewayClient.isClientReady()`), and is pushed back when the shards are still not connected after 30 seconds (`poststats`).
- **Moderation tasks:** a case with a duration gets a `moderationEnd*` job (`src/scheduled-tasks/moderation/`, on the `ModerationTask` base) that undoes it when it expires. The `moderationEntryAdd` listener creates it with the ID `moderation-<guildId>-<caseId>` (`getUndoTaskId`), and `moderationEntryEdit` reschedules it when the duration changes or removes it when the case is completed or archived; `ModerationManagerEntry#fetchTask()` finds it. A task that throws is tried again 20 seconds later (`UndoTaskJobOptions`). `poststats` and `syncResourceAnalytics` are the repeated tasks (cron patterns).
- **Analytics:** with `INFLUX_ENABLED=true`, `createClient()` sets `container.analytics` (`AnalyticsData`, the InfluxDB write and query clients; `null` otherwise) and the `AnalyticsListener` pieces of `src/listeners/analytics/` are enabled. They write the server, user, command, message and resource points; `poststats` and `syncResourceAnalytics` trigger the periodic ones.
- **Lockdowns:** `/lockdown` keeps what each lockdown changed in the Redis hash `wolfstar:lockdowns` (`LockdownManager`), and a temporary one has a `moderationEndLockdown` job whose ID is the lockdown key, so both survive a restart.
- **Reports:** a member reports another one to the moderators with `/report`, or from the Apps menu with `Report Message` and `Report User` (`src/commands/Moderation/report.ts`, no default member permissions). The context menu commands ask for the reason in a modal, and what is reported waits in Redis meanwhile (`wolfstar:reports:pending:*`, `lib/moderation/reports/pending.ts`), since a modal only carries IDs back; the same file holds the claims that stop a member from reporting more than once a minute and a message from being reported twice in a day. Every report is a row of `Report` (`projects/database/src/settings/reports/`), created before its message is sent, since the components carry its ID (`report.<reportId>.<verb>:<messageId>:<submit>`, `lib/moderation/reports/ids.ts`). The message is Components V2 (`lib/moderation/reports/render.ts`), sent to `reports.channel` with a mention of `reports.role`, in the language of the guild: buttons for `Warn`, `Timeout` and `Kick`, a menu for `Mute`, `Softban`, `Ban` and `Block the reporter`, and buttons for `Delete message` and `Dismiss`. The `report` interaction handler (`src/interaction-handlers/report.ts`) requires the moderator level, closes the report in the database before it takes the action (so two moderators cannot act on one report, and it is opened again if the action fails), and takes the action through `checkTargetCanBeModerated` (`lib/moderation/common/checks.ts`) and the `ModerationAction` of the type, so it is a case like the ones of the commands. A closed report loses its components and gains a status line, and its reporter is told in a direct message when `reports.notify` is on. With `reports.anonymous` the message and the history do not show who reported, the database still does. `/reports history|block|unblock` (`src/commands/Moderation/reports*`) lists the latest reports and manages `reports.blocked-users`. The settings are the table `GuildReports`
- **Auto purge and auto delete:** `/autopurge enable|disable|list` purges a channel every interval (5 minutes to 14 days) of every message or of the ones a filter looks for, and `/autodelete enable|disable|list` deletes the messages sent in a channel at once or a delay after (24 hours at most), but the ones that match what it keeps (`src/commands/Management/autopurge*`, `autodelete*`, helpers in `lib/moderation/cleanup/commands.ts`). Both are rows of their own, `GuildAutoPurge` and `GuildAutoDelete` (`projects/database/src/settings/cleanup/`), one per channel, up to 10 and 25 per guild. The filters are one pure function, `matchesCleanupFilter` (`lib/moderation/cleanup/filters.ts`). The `autoPurge` task runs every minute, takes the purges whose `nextRunAt` is due, gives each its next time before it runs it (`lib/moderation/cleanup/purge.ts`: up to 1000 messages, never the pinned ones nor the ones older than 14 days, which Discord does not delete in bulk) and drops the ones whose channel is gone. The `messageCreateAutoDelete` listener checks every message against the automatic deletions of its guild, which `lib/moderation/cleanup/store.ts` caches and broadcasts as `cleanupUpdate`; a delayed deletion is an `autoDeleteMessage` job, so it survives a restart, and it keeps a message that was pinned meanwhile. `lib/moderation/cleanup/messages.ts` has the history reading and the bulk deletion `/prune` shares with the purges
- **Auto-moderation rules:** a guild has up to 25 named rules (`MaximumAutoModerationRules`), several of the same type if it wants, each with its own options, actions, threshold and exempt roles and channels. They are rows of `GuildAutoModerationRule` (`projects/database/src/settings/automod/`: `types.ts` has the types, the limits and `normalizeAutoModerationRuleOptions`, `storage.ts` the queries), not settings: the options of a rule depend on its `type` and are stored in the typed `options` JSON column (`AutoModerationRuleOptionsMap`). The bot reads and writes them through `src/lib/moderation/automod/rules.ts`, which caches them per guild, queues the writes of a guild and runs each on the rules the database has (pass a function to `updateAutoModerationRule` for a change that depends on the rule), broadcasts `automodRulesUpdate` to the other shards and keeps the state of each rule (infraction counter, word expression, mention buckets). A `ModerationMessageListener` (`src/listeners/moderation/messages/`) is given a `type` and applies the first enabled rule of that type a message infringes. `/automod` (`src/commands/Management/automod*`, helpers in `lib/moderation/automod/commands.ts`) and the `guilds/:guild/automod/rules` routes (bodies read by `lib/moderation/automod/validation.ts`) manage them. A `Phishing` rule looks the hostnames of the links of a message up in the list of known phishing links of Discord-AntiScam (`lib/moderation/automod/phishing.ts`), which each process reads when a rule first needs it and once an hour after; a hostname of `allowed` is let through. To add a type: the `GuildAutoModerationRuleType` enum of the contract (at its end, a native enum only takes new values there, and it needs a migration), `AutoModerationRuleTypes` and the options maps in `types.ts`, a listener, and the `type<Type>` keys of `commands/auto-moderation.json`

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
- **Migrations:** Prisma 8 migrations in `projects/database/migrations/app/` (the contract snapshots are in `migrations/snapshots/`, `migrations/app/refs/db.json` is the `db` ref, the contract the next plan starts from). Most models are `@@control(external)`: the schema of those tables is owned outside this repository, so a migration only has what the contract controls, and a model that stops being external gets its DDL from `prisma migration plan` (and a model that is removed from the contract gets a `DROP TABLE`). To change a controlled model: edit `contract.prisma`, `prisma contract emit`, `prisma migration plan --name <slug>`, review the migration, and apply with `prisma db migrate --db "$DATABASE_URL"` (`--to <directory>` stops at one). A migration that copies data or creates what PSL cannot say (an index on an expression) is written by hand with `rawSql` in the `migration.ts` of the planned one, then `node migration.ts` attests it again; a data-only migration that does not change the contract is never run, since the route only follows edges that change it. A database that was not made by these migrations is signed once at the baseline contract with `prisma db sign`. `src/migrations/` is the old Prisma 6 history, which no longer matches the contract
- **Access:** `container.prisma` is the Prisma 8 `db` (type `Database` from `wolfstar-database`), set in `projects/bot/src/lib/setup/prisma.ts`. Query with `container.prisma.orm.public.<Model>` and `container.prisma.transaction(async (tx) => …)`
- **Middleware:** `db` runs the built-in `lints()` of Prisma (`@prisma/orm-postgres/family-runtime`): a `DELETE` or an `UPDATE` without a `WHERE` throws `LINT.DELETE_WITHOUT_WHERE` / `LINT.UPDATE_WITHOUT_WHERE` before it reaches the database. `budgets()` is not used: it refuses every `SELECT` without a `LIMIT`, which the settings storage and the moderation manager rely on
- **Types:** `Models.public_<Model>` from `wolfstar-database`; `BigInt` columns decode to `bigint`, `Jsonb` to `JsonValue`, `TimestampString(3)` to a branded string. That string has no time zone and holds UTC (`2026-10-08 13:02:18.076`): read it with `parseTimestamp` and write it with `formatTimestamp` (`projects/database/src/settings/time.ts`), never with `new Date(value)`, which reads it as the local time of the process
- **Typed JSON:** `prisma-orm-extension-typed-json` (replaces `prisma-json-types-generator`). A `Jsonb` column gets its TypeScript type from a `types { X = typed.Json("PrismaJson.X") }` entry in `contract.prisma`, and `PrismaJson.X` is declared in `projects/database/src/settings/types.ts`. The extension is registered in `prisma.config.ts` and in `db` (`typedRuntimeDescriptor`). The emitter drops `import(...)` expressions, so only global names work. It is only published for Prisma `8.0.0-rc.5`: `pnpm-workspace.yaml` overrides its Prisma packs to rc.13 and `patches/` adds the `dataType` that rc.13 requires from every codec. Drop both once it ships a rc.13+ build

## Settings System

- **Data:** `GuildData` (`projects/database/src/settings/types.ts`, exported by `wolfstar-database`) is flat. Its keys and their types are derived from the `Columns` map of `projects/database/src/settings/columns.ts` and from the models of the contract (`StoredGuildData`), so a column the table does not have, or a conversion that does not fit it, does not compile. Each key is prefixed by the Prisma 8 table it is stored in (`rolesAdmin` → `GuildRoles.admin`, `logsMemberAdd` → `GuildLogs.memberAdd`, `automodChannel` → `GuildAutoModeration.channel`, …). Snowflakes are strings in `GuildData`, `bigint` in the database
- **Storage:** `projects/database/src/settings/storage.ts` (`fetchGuildData`, `writeGuildData(db, …)`, in `wolfstar-database`) maps every key to its table and column, reads a guild from all the tables, and writes changes in one transaction. Missing rows are created in foreign-key order (`Guild` → `Modules` → `GuildAutoModeration`). A table of settings that the contract controls (`GuildReports`) needs its migration applied before the bot is deployed, since every read of the settings queries every table of `Tables`. What a guild configures that is rows of its own and not columns of the settings tables lives in a directory next to them, with the same split of `types.ts` and `storage.ts`: `settings/automod/` (the rules), `settings/reports/` (the reports) and `settings/cleanup/` (the automatic purges and deletions); `settings/ids.ts` has the check of a generated ID they share. To add a setting, add its column to the `Columns` map in `columns.ts`, its default to `constants.ts` (both in `projects/database/src/settings/`) and its key to `configuration.ts` (bot)
- **Cache:** In-memory `Collection<string, GuildData>` in `src/lib/database/settings/functions.ts`
- **Context:** `SettingsContext` in `src/lib/database/settings/context/SettingsContext.ts`
    - Holds `PermissionNodeManager` and `AuditLogManager`
    - Has `update(settings, data)` for patching context on settings change
- **Structures:** `src/lib/database/settings/structures/` (PermissionNodeManager, AuditLogManager, Serializer, SerializerStore)
- **Schema:** `configuration.ts` describes every key (`SchemaKey`: type, range, default, `dashboardOnly`) in groups (`SchemaGroup`) by its dotted name
- **Serializers:** the pieces of the `serializers` store (`src/serializers/`, registered by `lib/setup/serializers.ts`), named after the `type` of the keys they handle (aliases included, e.g. `number` also answers `integer` and `float`). A serializer parses the text a user wrote (`parse(input, context)`), validates a stored value (`isValid`) and formats it (`stringify`, which may be asynchronous since roles and channels come from the gateway cache). `SchemaKey#parse/stringify/display` and `set`/`remove`/`reset` in `Utils.ts` go through them
- **`/settings`:** `src/commands/Management/settings.ts` is the parent of `/settings server` (`settings/server.ts`, administrator level, no default member permissions on the parent since everybody can open their own) and `/settings user` (`settings/user.ts`, the `User` model: `report`, the moderation direct messages; `lib/structures/settings-menu/user.ts`). The permission nodes and the dashboard `canManage` check the parent command, `settings`. `/settings server` opens the settings menu, a Components V2 message rendered by `lib/structures/settings-menu` (module select menu, one row per key with its edit button, paginated). The `conf` interaction handler (`src/interaction-handlers/conf.ts`) reads what a click does from its custom ID (`conf.<ownerId>.<verb>:<target>:<page>`), so the menu keeps no state. What is written in a modal is parsed, and what is picked in a select menu is validated, by the serializer of the key. It uses `@wolfstar/http-framework-utilities` for the custom IDs and for the reset confirmation (`MessagePrompter`), whose handlers `lib/setup/all.ts` registers with `@wolfstar/http-framework-utilities/register`
- **`/commands`:** `src/commands/Tools/commands.ts` opens the commands menu, which takes the place of a `help` command: an ephemeral Components V2 message rendered by `lib/structures/commands-menu` (category select menu, one row per command with the button that shows it and its subcommands, a search in a modal, paginated). The commands come from `container.applicationCommandRegistry` (`catalog.ts`), so the menu shows what is registered to Discord, in the locale of the user; the category of a command is the first directory of its file. The `commands` interaction handler reads what a click does from its custom ID (`commands.<ownerId>.<verb>:<target>:<page>`), as the settings menu does
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
