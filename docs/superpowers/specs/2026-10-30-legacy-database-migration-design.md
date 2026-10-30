# Automatic migration from the legacy database

Date: 2026-10-30
Status: implemented

## Purpose

Production still runs the old schema of `main` (Prisma 6): one flat `guilds` table of 156 columns plus `moderation`,
`audit_event`, `audit_chain_head`, `command_log`, `schedule` and `user`. V7 runs a normalized contract (`Guild`,
`Modules`, `GuildRoles`, `GuildLogs`, `GuildAutoModerationRule`…), and nothing moves the data from one to the other.
The migration `20260920000000_v7_contract_and_modules` on the `refactor/v3` branch of the website (wolfstar.rocks#451)
creates the new tables and renames the legacy ones to `<name>_v6`, and says the rows wait for a backfill that does not exist.

The owner wants a migration system for the bot and the website together: the data of the legacy database reaches the new
schema by itself, and restoring a backup of the legacy database converts it by itself too.

Success: the bot starts on a database that holds legacy tables, and every server keeps its configuration and its cases,
with nothing to run by hand and nothing overwritten.

Production today: 65 guilds, 5 cases (three bans, a kick and a warning, none temporary), 373 audit events, 146 command logs,
34 schedule rows (only the repeated `poststats` and `syncResourceAnalytics`), 0 users, 0 permission nodes. The
auto-moderation is in use: 7 guilds have the word filter on, 6 the message spam, 5 attachments and capitals, 3 links,
invites and new lines.

## Decisions taken with the owner

- **It covers the bot and the website**, which change together: the website moves to the new schema in wolfstar.rocks#451.
- **It is automatic**: the bot does it when it starts, whenever legacy tables are in the database.
- **A backup goes the same way**: a dump of the legacy database restored into the database is converted at the next start.
- **Nothing is overwritten**: what the new schema already holds wins, a backup only adds what is missing.
- **The legacy tables are not deleted** by the migration. Dropping them is a separate decision, after it is verified.
- **Migrations run at every deploy**, on every environment: the image carries them and the CLI, and applies what is missing
  before the bot starts.
- **`None` joins the hard actions** of the auto-moderation: a rule that only deletes or alerts stays that, in the enum (at
  its end), the listeners and the menu.
- **The legacy message spam gets a rule type of its own**, which counts identical messages among the last ones of a channel.
- **An audit event with an author that is not a number** (4 of 373) is copied with author `0` and the original in `context`.

## Non-goals

- Dropping the legacy tables.
- A new export format: the file of `/settings server` is another feature and stays as it is.
- Carrying what V7 no longer has (see "Not carried").
- Moving the website: #451 does that; the website converts nothing.

## How it behaves

1. At the start, before the bot loads its pieces, one process (the gateway, or the shard manager with the sharder; never a
   worker) asks whether `guilds` or `guilds_v6` exists, and reads whichever does, both when a backup was restored after the
   website renamed them. When neither does, nothing else happens, so a database with no legacy tables pays one query.
2. Every legacy guild is converted on its own, in one transaction, under a lock another process cannot take at the same
   time. One that fails is logged and the next one goes on, and the bot starts anyway.
3. A guild is skipped when the record below has it. Otherwise each of its rows is inserted only when its key is free, so
   a guild the bot already wrote something for (a `/reasons add` upserts `Guild`) keeps what it has and gains the rest.
4. Cases, audit events and command logs are added row by row the same way: `(id, guild_id)` for a case, `id` for the
   others. A legacy case whose number is taken is logged and left out.
5. A line of the log tells how many guilds, cases and events were converted, skipped and failed.

Running it again changes nothing. A crash halfway leaves whole guilds done and the others to the next start.

### The record of what was migrated

A new table the contract controls, `LegacyMigratedGuild` (`guild_id`, `migrated_at`), holds each guild once it is done, in
its transaction. It has no relation to `Guild`. A guild that failed has no row, so it is tried again at the next start;
one that is done is never read again, so a backup restored later adds only the guilds it did not have.

### Schema first

`prisma db migrate` cannot make the new tables: the fifteen `@@control(external)` models are created by no migration of
the bot, `prisma db init` fails on them (`relation "public.Guild" does not exist`), and the SQL of the website does not
match the contract (no `Mute` in the hard actions, columns of `GuildLogs` missing). So a schema dump of the staging
database, which is at the current contract, goes into `projects/database/legacy/schema.sql`. The step that runs at every
deploy applies it once when `Guild` does not exist, signs the database at the contract of that dump, then runs `prisma db
migrate` for what came after. The new tables have other names than the legacy ones (`AuditEvent`, not `audit_event`), so
they live side by side. The image gains `migrations/`, `prisma.config.ts` and the CLI. A restored backup needs a
restart of the service only when the schema is already there, and a deploy when it is not.

## What maps to what

- **Renamed:** the settings whose only change is the name or the table, `channelsLogs*` to `logs*`,
  `channelsLogsModeration` to `moderationChannel`, `eventsTimeout` to `moderationTrackTimeouts`, `eventsTwemojiReactions` to
  `logsReactionEmojiIncludeTwemoji`, `channelsLogsReaction` to `logsReactionEmojiAdd`, `disabledCommands` to `commandsDisabled`,
  `disabledChannels` to `commandsDisabledChannels`, `channelsUpdates` to `updatesChannel`, `rolesInitialBots` to
  `rolesInitialRobots`. The other columns keep their key (`columns.ts` is the map of the new side). Snowflakes become
  `bigint`.
- **Two into one:** `eventsBanAdd` and `eventsBanRemove` to `moderationTrackBans`, on when either is;
  `channelsIgnoreMessageEdit` and `channelsIgnoreMessageDelete` to `logsIgnoreMessages`, the channels both ignore, so no log
  that was sent goes silent; `channelsIgnoreReactionAdd` to `logsIgnoreReactions` and `channelsIgnoreAll` to `logsIgnoreAll`.
- **`disabledCommandsChannels`** goes to `commandsRestrictions` as it is: `readCommandRestrictions` already reads that
  shape as ignored channels.
- **`stickyRoles`** (JSON in `guilds`) becomes rows of `StickyRole`.
- **`selfmod*`** becomes rows of `GuildAutoModerationRule`, one for each type that is enabled or differs from the defaults,
  as `20261007T1312_add_automod_rules` did from the normalized tables: attachments, capitals, links, invites, newlines,
  `selfmodFilterRaw` to `Words`, messages to the new type. `selfmodIgnoredChannels` is added to the ignored channels of
  every rule. The hard actions map by their value: None 0, Warning 1, Kick 2, Mute 3, Softban 4, Ban 5, Timeout 6, to the
  `GuildAutoModerationHardAction` enum, `None` included. `hard_action_duration` is in milliseconds and a 32-bit column: a
  longer punishment is cut to its maximum, about 24.8 days, and logged.
- **`selfmodMessages*`** becomes a rule of the new `MessageDuplicates` type (`maximum` identical messages among the last
  `queueSize` of a channel, a listener on `AutoModerationRuleListener`, its keys, its limits, its emoji and a migration).
- **`noMentionSpam*`** becomes a weighted `MentionsCooldown` rule that bans at the first infraction and alerts, as
  `20261029T1302_merge_mention_spam_rules` does.
- **`permissionsUsers` and `permissionsRoles`** are copied as they are, then the bot converts them with
  `convertGuildCommandRules`, for the guilds this run imported, whatever `COMMAND_RULES_CONVERT_NODES` says.
- **`moderation`** becomes `ModerationAction` the way the bot writes a case, through `encodeModerationRecordMetadata` and
  `ModerationRecord.ts`: eight legacy types have no `ModerationActionType` of their own, and `duration` is in seconds with
  `0` for none, where the legacy column holds milliseconds. `case_id` to `id`, `user_id` to `target_id`. `extra_data` goes to
  `ModerationCaseData`, and `image_url` to the reason as a link. A row with no `user_id`, no `created_at` or a type out of
  range is left out and logged.
- **Temporary cases still in course** get their `moderationEnd*` job from the bot, after the copy. `schedule` is not carried.
- **`audit_event`** becomes `AuditEvent` with every field unchanged, `hash` and `prev_hash` first of all, since they are a
  chain, the timestamps truncated to milliseconds. An `actor_id` that is not a number becomes `0`, with the original in
  `context.legacyActorId`. `AuditChainHead` takes the legacy head only when the new chain is empty; otherwise it is left alone.
- **`messagesModerationDm`, `messagesModerationReasonDisplay`, `messagesModerationMessageDisplay` and
  `messagesModeratorNameDisplay`** keep their key, in four new columns of `GuildModeration` added by hand as the one of the
  time zone. `ModerationCommand#readMessageSettings`, `ModerationTask` and the `report` handler already read those keys, but
  no table stores them, so today they are always the default and no server can turn the direct messages on. They get a key
  of `configuration.ts` each, whose descriptions `i18next.d.ts` already has.
- **`command_log`** becomes `CommandLog`.
- **`user.moderation_dm`** becomes `User.report`, the one preference of a user in V7. Production has no rows.

## Not carried

`prefix`, `disableNaturalPrefix`, `channelsMediaOnly`, `commandAutoDelete`, `reactionRoles`, `channelsLogsCommand`,
`channelsLogsSettings`, `channelsLogsVoiceChannel`, `eventsUnknownMessages`,
`eventsIncludeBots`, `messagesAutoDelete*`, `messagesIgnoreChannels`, `selfmodReactions*`, `channelsLogsMemberRolesUpdate`,
`channelsIgnoreVoiceActivity`, `messagesModerationAutoDelete`, and `schedule`, which V7 makes
again by itself as BullMQ jobs. A column of the legacy `guilds` table that is neither mapped nor listed here makes a test
fail, so nothing is dropped by accident. The builder reports any value production holds in these columns.

## Where it lives

- **`projects/database/src/legacy/`:** reading the legacy tables and the pure mapping, a guild in and its rows out.
- **`projects/bot`:** runs it at the start and converts the nodes, which needs the loaded commands.
- **Website:** nothing but going out with the bot. Its `ArchiveLegacyTables` step can stay, since the conversion reads both
  names; its schema statements find the tables there and do nothing.

## Order of the cutover

The website on `main` writes `guilds`. What it writes after the conversion never reaches the new tables, since a migrated
guild is skipped, so the dashboard is stopped for the cutover. The bot goes first: the migration of #451 creates `Guild` from
a SQL that differs from the contract, and the schema of the bot is only applied when `Guild` does not exist. Once the bot
made the tables, the statements of #451 find them and do nothing. Production is backed up first.

## Proof

Before production: a copy of the production database goes through the whole of it, and the counts of each table are
compared with the source. The conversion runs twice, and the second run changes nothing. Every hash of the copy equals the
source, and the chain links by `prev_hash`; V7 has no verifier of the envelope, and the 4 events with a changed author would
not hash the same. The bot starts on it.

## Anti-goals

- A server that loses a setting that V7 has.
- A value in the new schema overwritten by a backup.
- A failed guild keeping the bot from starting.

## Calls made while writing this (not decided by the owner)

- The four moderation settings the code reads with no column behind them get their columns (`messagesModerationDm` is on in
  2 guilds, `messagesModerationMessageDisplay` is off in 1). `messagesModerationAutoDelete` (1 guild) has no reader in V7 and
  stays out.
- The dashboard is stopped for the cutover, and the bot goes before #451.
- The ignored channels of edited and deleted messages are intersected, so a log that was sent stays sent.
- The schema of the new tables comes from staging and not from the SQL of the website, which differs from the contract.
- The skip key is the record alone, and rows are inserted when their key is free.
- A legacy case whose number is taken is left out, and its rows go to the log.
- `image_url` of a case joins its reason as a link, since `ModerationCaseData` has no column for it.
- `updatesChannel` is written as it is and no follow is made: no guild of production has it.
