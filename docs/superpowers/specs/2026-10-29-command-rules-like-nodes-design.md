# Command rules that do what the permission nodes did

Date: 2026-10-29
Status: proposed
Depends on: wolfstar#347 (dashboard access rules), which this builds on: the conversion leaves the dashboard
access rules in `permissions.users` and `permissions.roles` and uses its `isDashboardAccessEntry`.

## Purpose

A server has two ways to say who runs a command of the bot, and only one of them works.

- **Command rules** (`commands.restrictions`, the `/commands` modal; "restrictions" in the code): per command,
  allowed and ignored channels, roles and users. The `commandsEnabled` precondition applies them to the slash
  commands, after Discord's own permissions (Server Settings → Integrations) and the level of the command.
  An ignored entry always wins, the order of the roles does not count, and a rule names one command.
- **Legacy permission nodes** (`permissions.users`, `permissions.roles`): allow and deny lists of command
  names, categories and `*`, per member and per role. The old bot ran them on the message commands: the
  member's own node first, then the node of their highest role that had one. V7 stores them and runs them on
  no command (only on `settings`, for the dashboard, which #347 replaces with dashboard access rules).

Not every server uses the permissions of Discord's integrations, and the servers that set nodes up lost them
in V7. The owner wants one system that works as the nodes did, with what the command rules added on top.

Success: a server's nodes keep doing what they did, as command rules, and an administrator edits all of it
in `/commands`, a rule for a command, a category or every command, with the precedence of the nodes.

## Decisions taken with the owner

- **One system: the command rules.** The legacy nodes are converted into command rules and stop being a
  separate thing. The dashboard access rules of #347 stay where they are and are not part of this.
- **A rule never grants.** Discord's permissions and the level of a command (`moderator`, `administrator`)
  decide first; a rule only narrows who, among the members who could run the command, runs it and where.
  An `allow` node that existed to give a command to a member without its level loses that effect (it was
  the old bot's behaviour, the owner does not want it back).
- **Precedence, as the nodes had it:**
    1. a rule that names the member decides;
    2. otherwise the rule of the member's highest role (by position, then the higher ID) that has one for the
       command decides;
    3. among the rules of the same member or role, the most specific target wins: a command over
       `Category.SubCategory.*` over `Category.*` over `*`. Example: "Newcomers" ignored on `Moderation.*` but
       allowed on `/warn` runs `/warn`.
       This replaces "an ignored entry always wins" for the members and the roles. It is new: within one node the
       old code checked every `allow` name before any `deny` name (`runUser`, `runRole`), so an `allow` won whatever
       its specificity. The owner chose "the most specific wins" as an improvement. Example: Mario has "Staff"
       (high, allowed on `/warn`) and "Newcomers" (low, ignored on `/warn`): he runs `/warn`.
- **Channels stay as they are**: allowed and ignored channels, a thread is restricted as its parent.
- **The owner and the administrators are never restricted**, and `settings` and `commands` cannot be
  restricted (`ProtectedCommands`), as today.
- **Targets like the nodes'**: a rule names a command, `Category.SubCategory.*`, `Category.*` or `*`, the
  notation of `lib/database/utils/matchers/Command.ts`, where the category and the sub-category are the first
  and the second directory of the file of the command. The renamed commands of that matcher (`conf` →
  `settings`) are honoured.
- **The conversion runs by itself, once, and only on the alpha bot** (the staging application, the only one
  that runs V7 today). The beta and the production bots never run it until the owner says so.

## Current behaviour to keep

- The stored shape of a rule (`{ command, allowedChannels, ignoredChannels, allowedRoles, ignoredRoles,
  allowedUsers, ignoredUsers }` in the JSON column `GuildCommands.disabledInChannels`) stays readable by the
  website, which reads it with its own copy of `readCommandRestrictions` (`shared/utils/command-rules` of
  wolfstar.rocks) and shows it read only. No field is added to a rule: what changes is what `allowed` means and
  the targets a rule can name (see below), and the array gains a `{ format: 2 }` entry that is not a rule, which marks
  the rules saved with the new meaning. The website has to learn all three.
- `readCommandRestrictions` still reads the oldest shape (`{ channel, commands }`) as ignored channels.
- The denials keep their messages (`preconditions:restrictedChannel`, `restrictedRole`, `restrictedUser`).
- What a select menu of the modal cannot show (past 25 entries) is kept on save.

## The rules, precisely

For a member running command C in channel H:

1. Owner, administrator, protected command, or no rule matches C: the command runs.
2. **Channels.** Take the matching rules that have channel lists, most specific first. An ignored H in any of
   them denies (`channel`). The allowed channels of the most specific rule that has some apply: H not in
   them denies (`channel`). _(Builder's call how to word this in the docs; the owner only said "as now".)_
3. **The member.** The most specific matching rule that lists the member, allowed or ignored, decides:
   allowed runs, ignored denies (`user`).
4. **The roles.** Otherwise, among the member's roles (`@everyone` included), the highest one that a matching
   rule lists decides, with that role's most specific rule: allowed runs, ignored denies (`role`).
5. Otherwise the command runs.

The status of the modal writes `@everyone`: "Only the allowed roles and users" ignores it, without going through the
select menu, whose handling of `@everyone` is up to Discord.

**"Allowed" is always an exception, never "only these"** (owner's decision). An allowed role or member runs the
command over an ignored entry that ranks below it (a lower role, a broader target); it limits nobody else.
"Only Staff" is written "`@everyone` ignored, Staff allowed": Staff is above `@everyone`, so Staff runs it and
the rest is denied by the rule of `@everyone`.

## Conversion of the legacy nodes

A node is `{ id, allow: string[], deny: string[] }`, of a member or of a role. Each name of `allow` becomes
the member or the role in the allowed list of the rule of that target, each name of `deny` in its ignored
list, creating the rule when there is none. A dashboard access rule (`dashboard` key) is left in place. Once
a server is converted its legacy nodes are removed from the two columns (the dashboard access rules stay), in
the same write as the new rules, under the settings lock, and audited.

A node that cannot become a rule without changing what it does is not converted and stays, and the notice of
`/commands` keeps showing it with the reason, so an administrator decides:

- a name that is neither a command, a category, a sub-category nor `*` of the commands the bot has now;
- a node whose meaning the new precedence changes (see the calls below).

A node of a role that no longer exists is dropped, as the refresh of the nodes does today.

## The rules the menu already made

The alpha servers have rules made with the old meaning, where allowed roles or users limited the command to
them and an ignored entry always won. The owner chose one meaning for every rule: they are rewritten in the
same run as the conversion. A rule that has allowed roles or users gets `@everyone` (the guild's ID) in its
ignored roles, which keeps "only these". The change of precedence for a member who has both an allowed and an
ignored role (denied before, the highest one decides now) is accepted, and the conversion reports the rules it
rewrote.

Where it runs: once per server, on the alpha bot only, guarded so it never runs twice and never on another
bot (builder's call how: a flag in the environment that only staging sets is the obvious one; a one-off
script run against the staging database is the other). It must be safe to run again after a crash halfway.

## The `/commands` menu

- The modal that edits the rule of a command also edits the rule of a category and of every command: an
  "Edit the rules of this category" button when a category is picked in the category select menu, and an
  "Edit the rules of every command" one when none is.
- A sub-category rule (only the conversion makes one) is shown and can be removed. _(Builder's call where.)_
- The editor of a command says when a rule of its category or of every command applies to it too.
- The notice of the legacy nodes only lists what the conversion left, with why.

## Goals, non-goals

- Goal: the nodes of a server keep their effect, as command rules, with the precedence above.
- Goal: one place to edit them, `/commands`, with the rules of a category and of every command.
- Non-goal: granting a command beyond its level, ever.
- Non-goal: Discord's integration permissions. The website edits those; the bot does not write them.
- Non-goal: the dashboard access rules (#347).
- Non-goal: running the conversion on the beta or the production bot.
- Non-goal: dashboard access. A node that reaches `settings` (`*`, `Management.*`) still decides who manages the
  server, which no command rule does, so it is not converted: it stays, with its reason.
- Anti-goal: a server whose members lose a command they could run, or gain one they could not, only because
  of the conversion. When in doubt, a node is left for an administrator rather than guessed.

## What the website needs

Its read-only view of the command rules must learn the new targets (`*`, `Category.*`,
`Category.SubCategory.*`) and the precedence, or it will show them wrongly. A prompt for wolfstar.rocks is
written once the bot's part is merged.

## Calls made while writing this (not decided by the owner)

- **A node whose meaning the new precedence changes is not converted**: one where an `allow` name covers a
  more specific `deny` name of the same node (`{ allow: ['*'], deny: ['warn'] }`: the member ran `/warn`, the
  most specific rule would deny it), or the same name is in both lists. It stays, and the notice says why.
- **The node of a member who left the server is converted anyway**: a rule on a user ID costs nothing, and
  dropping a `deny` would give back to a member who joins again what they had lost. Role nodes of a deleted
  role are dropped, as today.
- **No detection of the `allow` that only granted a command beyond its level**: converted as an exception,
  such an `allow` does nothing, since the level still applies; that loss is the owner's decision above. The
  conversion reports how many `allow` names it converted, so an administrator can check.
- **Channels**: an ignored channel of any matching rule denies; the allowed channels of the most specific
  rule that has some apply and replace the broader ones.
- **The modal keeps its five components** (status, two channel selects, two member selects, the most Discord
  allows): "allowed" needs no switch now that it has one meaning. Its labels and the help of `/commands` say
  that an allowed entry is an exception and how to write "only these".

## Decided by the owner after the review

1. "Allowed" is always an exception; "only these" is written with an ignored `@everyone`.
2. The new precedence applies to every rule, the ones the alpha servers already made included.
