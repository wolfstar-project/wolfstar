# Appeals as Flamey has them

Date: 2026-11-01
Status: implemented on the bot, the website is the brief below

## Purpose

Wolfstar lets a member appeal a ban, a mute or a timeout: one form of up to five text questions per server, sent from a
page of wolfstar.rocks that does not exist yet (wolfstar.rocks#468), reviewed with two buttons in a channel and, since
wolfstar#356, with `/appeal list|view|approve|deny|send`.

Flamey does more, and the owner wants its system on Wolfstar: several forms per server with questions of several
kinds, requirements and limits on who may appeal, roles that review and roles that are told, a word with the member
after a ban, and a dashboard that builds the forms and reviews the appeals.

Success: a server configures its appeals on the dashboard as it would on Flamey, a banned member appeals from the
website and talks with the staff from their direct messages, and the staff decides from Discord or from the dashboard,
with the same result either way.

Everything here was read from Flamey's commands, its website and the JavaScript of its dashboard: no appeal was ever
seen in it, since its portal does not see the bot in the test server. Where Flamey's behaviour is guessed, the guess
is marked.

## Decisions taken with the owner

- **All four parts** are ported: the forms, the requirements and limits, the staff roles and notifications, the
  dialogue with the member.
- **The forms are built on the dashboard** of wolfstar.rocks, which is the owner's work: this document ends with the
  brief for it. The bot holds the tables, reads them, and serves the public API.
- **The public appeal page is in the brief too**, with the choice of the form and of the case, the answers, the
  attachments and the authorization of the direct messages.
- **The dashboard reviews the appeals** as Discord does: the site asks, the bot acts, and both see the same decision.
- **Questions of four kinds**: text, a choice among options, attachments, and a block of text that asks nothing.
- **User install**: a member authorizes the app on their account from the website, so the bot can write to them after
  a ban, and `/reply` answers the staff from the direct messages.
- **Manager roles add to the moderators**: the `moderator` level keeps reviewing, the roles let others in. With none
  set nothing changes.
- **The work goes on the branch of wolfstar#356**, `feat/appeal-commands`.

## Goals, non-goals, anti-goals

Goals: what Flamey's dashboard, portal and commands do for appeals, as listed above, on Wolfstar's bot, database and
website, with one path for a decision whoever takes it.

Non-goals: statistics of the appeals on the dashboard ("Total Appeals Reviewed"): a count by status the site can
query itself, nothing here. Flamey's "reviews" of a server, its leaderboard and its other portal modules. Reading the
member's direct messages as plain messages: the staff reads what `/reply` brings, nothing else, as Flamey does. A
word-for-word copy of Flamey's texts.

Anti-goals: a member who is told who denied their appeal when the server hides it. An attachment anybody with its link
can open. A decision that is lost between the dashboard and the bot, or taken twice. A form that lets an appeal through
on a case the server did not open to appeals.

## Constraints

- The bot keeps the existing `Appeal` table and `GuildAppeals` settings, extending them through `contract.prisma` and
  planned Prisma 8 migrations, which the deploy applies. wolfstar.rocks needs a contract bump after it.
- The site does not call the bot for the dashboard: it writes the tables and notifies, as the rest of the dashboard does
  (`pg_notify('guild_settings_update', …)` for the settings, a request row with `NOTIFY` for what needs the bot, as the
  join guard does). The public page calls the bot's `/appeals` API with the user's session, as the existing routes
  were built for.
- User install has to be turned on in the developer portal of the three applications (staging, beta, production): an
  operator step, nothing in the repository does it. Until it is, the "authorize direct messages" button fails and a
  banned member cannot be written to.
- A banned member has no roles in the server: a form that requires a role cannot be used to appeal a ban (Flamey has
  the same limit, guessed from its check on the roles of the user info).
- Everything a member writes stays where the staff reads it: the staff channel, its thread, the dashboard. Nothing is
  shown in a channel members read.

## What the server configures

All of it is on the dashboard. The settings menu of `/settings server` edits the plain settings in its `appeals`
group and shows the forms read-only, as it does for the join guard.

### Settings (`GuildAppeals`, keys `appeals.*`)

| Key                                                 | Type                                | Default  | What it does                                                                                                                              |
| --------------------------------------------------- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `appeals.enabled`                                   | boolean                             | off      | The whole thing. Off, the page says appeals are off and no form is served.                                                                |
| `appeals.channel`                                   | text channel                        | none     | Where the appeals are sent for the staff. Without it an appeal is still saved and the dashboard reviews it.                               |
| `appeals.bans`, `appeals.mutes`, `appeals.timeouts` | boolean                             | on       | Which kinds of case can be appealed at all, and which direct message of a case links to the page. A form narrows them, never widens them. |
| `appeals.manager-roles`                             | roles                               | none     | Who reviews, besides the moderators.                                                                                                      |
| `appeals.ping-roles`                                | roles                               | none     | Mentioned when an appeal arrives, in the channel.                                                                                         |
| `appeals.anonymous`                                 | boolean                             | off      | The member is never told who decided: not in the direct message, not on the website. The staff channel and the dashboard always show it.  |
| `appeals.thread`                                    | choice: `none`, `public`, `private` | `public` | Whether each appeal gets a thread, and of which kind.                                                                                     |
| `appeals.cooldown-days`                             | number, 0 to 365                    | 7        | After a denial, how long before the member may appeal again in the server. `0` is no wait.                                                |
| `appeals.max-active`                                | number, 1 to 10                     | 1        | How many pending appeals a member may have in the server.                                                                                 |
| `appeals.block-on-denial`                           | boolean                             | off      | A denial blocks the member from appealing again until the staff unblocks them.                                                            |

`appeals.questions` is no longer a setting: the migration turns it into the first form of the servers that set it
(see migrations), and the column waits for the site before it is dropped.

My reading of Flamey's `access_mode` with `allowed_ids` / `restricted_ids` on the global settings: a mode that opens
the appeals to some roles only, or closes them to some. The forms carry that per form here (required and restricted
roles), and the global mode is left out: one place to say who may, not two.

### Forms (`AppealForm`, up to 10 per server)

- `name` (1 to 100 characters, unique in the server whatever the case, as the join guard rules), `description` (up to
  500), `icon` (a Unicode emoji or the `<:name:id>` of a custom one, or none).
- `enabled`: a disabled form is listed on the page as locked, with `lockReason` (up to 200) when the server wrote one,
  as Flamey's `is_locked` and `lock_reason`.
- `types`: which kinds of case the form takes, a subset of ban, mute and timeout; empty takes every kind the settings
  allow.
- `requiredRoles`: the member needs one of them; `restrictedRoles`: a member who has one cannot use the form. Both
  read the member when there is one; a user who is not a member meets no required role and no restricted one.
- `questions`: 1 to 5, at least one that asks something, in a typed JSON column (`PrismaJson.AppealFormQuestions`).
  Each has an `id` (a generated ID, kept when the question is edited, so the answers keep their question) and a
  `kind`:
    - `text`: `label` (up to 100), `placeholder`, `help` (up to 200), `long` (a paragraph or a line), `maxLength` (10 to
      1000), `required`.
    - `choice`: `label`, `help`, `options` (2 to 10, each `label` up to 100 and `value` an ID), `min` and `max` selections
      (1 to the number of options), `required`.
    - `attachment`: `label`, `help`, `min` (0 to 5) and `max` (1 to 5) files, `imagesOnly`.
    - `display`: `content` (up to 1000), shown and not answered.
- `position`: the order on the page.

Flamey also has forms with several pages (`A` in its code, questions grouped in steps): left out, five questions fit on
one page.

### Blocked members (`AppealBlock`)

One row per server and user: `reason` (up to 500, what Flamey's "Why is this user being blocked" asks), `moderatorId`,
`createdAt`, `automatic` (made by `appeals.block-on-denial`). A blocked member sees the page with the reason and no
form. Blocked and unblocked from the dashboard and with `/appeal block|unblock`.

## What a member does

### The page, `wolfstar.rocks/appeal/<guildId>`

The direct message of a case that can be appealed links to it, as today. The user logs in with Discord. The page shows,
in this order, what `GET /appeals/:guild` returns:

1. The server, and whether appeals are on. Off: a notice, nothing else.
2. A notice when the user is blocked, with the reason, and nothing else.
3. The forms, each open or locked with why: `disabled` (and the lock reason), `missingRole`, `restrictedRole`,
   `noEligibleCase` (the user has no case in course of the kinds the form takes), `cooldown` (with when it ends),
   `maxActive`.
4. The appeals the user already sent in the server, with their status and, unless the server hides it, the reason and
   who decided.
5. A box that asks to authorize the app on the account, with a button to Discord's authorization page
   (`integration_type=1`, scope `applications.commands`), so the staff can write to them. Shown always: the bot cannot
   know whether the user authorized it until it tries to write.

A form opens as a modal: the case to appeal, picked among the eligible cases of the user (one is preselected, and a
form with only one eligible case shows it without asking), then the questions. Each answer is checked as the form says
(required, lengths, number of choices, number and kind of files) before it is sent. The submission is one request,
`POST /appeals/:guild/:form`, with `caseId` and the answers keyed by question ID, the files being uploaded before it.

Once sent, the page shows the appeal among the sent ones and the box of the authorization again, as Flamey does after
a submission.

### Eligibility, decided by the bot

One pure function in the bot, `getAppealFormAccess`, answers for a form and a user: `open`, or one of the reasons
above, plus `blocked` and `off` for the whole page. It reads the settings, the form, the member (or none), the cases
of the user (`findAppealableCases`, narrowed to the kinds of the form), the appeals of the user in the server and the
blocks. The site shows what the bot answered and the submission runs the same function again, so the page can never
let through what the submission refuses.

A case is appealed once in all (the unique index that is there), whatever the form. `cooldown` counts from the latest
denied appeal of the user in the server. `maxActive` counts the pending ones.

A server with no enabled form gets the built-in one: a single long text question, "Why should this case be undone?",
the default of today, so a server that only turned appeals on keeps working as it does now and before the dashboard
exists. Its appeals have no `formId`. My call: the alternative, no form and nothing to appeal with, would turn the
feature off for every server at the deploy.

### Attachments

The files of an answer live on Cloudflare KV, on the Worker of the website (a binding of its own, `APPEAL_FILES`, next
to `CACHE` and `RATE_LIMIT`). The owner chose Cloudflare over Discord and Netlify. KV over a Durable Object is my
call: a value holds 25 MiB against about 2 MiB, and a key expires by itself, which is the whole cleanup.

The page uploads each file to the website first (`POST /api/appeals/:guild/files`, the user's session), which checks
size and kind (8 MiB, images by content type and first bytes when the question says so) and stores it under
`appeals/<guildId>/<userId>/<uuid>`, for 90 days, with its name and type as metadata. It answers
`{ key, name, size, contentType }`, and that is the answer the page sends to the bot.

The bot never sees a file. It checks what the form asks of the answer: how many, 5 per appeal in all, 8 MiB each, and
that every key starts with the guild and the user of the session, so a member cannot attach what somebody else
uploaded. A key nothing refers to expires with the others.

The staff opens a file at `wolfstar.rocks/appeal-files/<guildId>/<appealId>/<index>`, `index` counting the files of the appeal in the order of its answers, on the website: it reads the row,
and answers the member who sent the appeal and whoever passes `hasAppealAccess`, nobody else, after a Discord login. So
the links in the channel, in `/appeal view` and on the dashboard are the same, and open for no one who was forwarded
one. After 90 days the page says the file expired, and the answer keeps its name.

## What the staff does

### Who

`hasAppealAccess(guildId, userId)`: `isModerator` (the owner of the server; a role of `roles.moderator`, or `Ban
Members` when none is set; a role of `roles.admin`, or `Manage Server` when none is set), or a role of
`appeals.manager-roles`. It is what the `moderator` level means, written so it can be answered for a user ID and not only for an
interaction: the bot reads the member and the roles of the server from the gateway cache, the site from Discord's API
as it already does for `canManageServerSettings`. A new precondition, `appealManager`, applies it to `/appeal` and to
the handlers of the buttons and of the list in place of `moderator`; the bot answers `noAccess` to a dashboard request
whose moderator fails it. `/reply` has no level: it is the member's. My call: the `moderator` level alone is "everybody"
when a server set no moderator role, since Discord filters the commands by their default permissions, and a dashboard
request has no such filter.

### Where

With `appeals.channel` set, every appeal is one message in it, as today, with the embed of the case and the answers:
a `text` answer as a field, a `choice` answer as the labels picked, an `attachment` answer as links to the files,
a `display` question not at all. The ping roles are mentioned above it. The buttons are `Approve` and `Deny`, and the
`accepted` status reads `Approved` everywhere a person sees it: Flamey's word, and the one `/appeal approve` already
uses. The stored value stays `accepted`.

The thread, by `appeals.thread`:

- `public`: started on the message, as wolfstar#356 does.
- `private`: started in the channel, not on the message (Discord allows no private thread on one), with a first
  message that links to the appeal and mentions the ping roles, which adds their members. Needs `Create Private
  Threads`.
- `none`: no thread; `/appeal send` runs with the `appeal` option instead (see below).

The thread is remembered on the row (`threadId`), which is how `/appeal send` and `/reply` find the appeal: the thread
of a public one has the ID of its message, so the column makes the two kinds alike.

### Deciding

One path, `settleAppeal`, whoever asks:

- The buttons on the message and `/appeal approve|deny`, as today.
- The dashboard: the site inserts an `AppealRequest` (`kind` = `Approve`, `Deny`, `Block`, `Unblock`, with
  `appealId` or `userId`, `moderatorId`, `reason`) and runs `NOTIFY appeal_request, '<id>'` in the same transaction.
  The gateway process (or the first shard) hears it on the connection of the website, as it does for the join guard,
  and the request queue of the join guard, made general, claims it, runs it, marks it `processedAt` with an `error`
  (`<code>: <detail>`) when it could not be done, and sweeps what nobody claimed. The site reads the row back to show
  the outcome. The codes are a contract with the site: `decided`, `caseGone`, `undoFailed`, `blocked`, `notBlocked`,
  `noAccess` (the moderator of the request has no appeal access: the site decides who may ask, the bot checks again).

An approval undoes the case in the name of the moderator; a failure puts the appeal back to pending and tells whoever
asked, as today. A denial applies `appeals.cooldown-days` and, with `appeals.block-on-denial`, inserts the block. The
member is told in a direct message, with the reason, and without the moderator when `appeals.anonymous` is on. The
message in the channel is updated, the thread is archived.

### Talking with the member

- `/appeal send message:` in the thread of an appeal, as today; with `appeals.thread` at `none` it takes an `appeal`
  option (the case number, autocompleted). The direct message says the server and the case and never the moderator,
  and the thread (or, with no thread, the answer of the command) keeps what was sent.
- `/reply message:`, a command the member runs in the direct messages with the bot, installed on their account
  (`integration_types` user, `contexts` bot DM). It finds the pending appeals of the user that have a thread, in any
  server, and posts the message in the thread of the one it is about: with one, that one; with several, an `appeal`
  option autocompleted with the server and the case. The thread says who wrote (the member) and when. A member with no
  pending appeal is told so. The message is cut at 1500 characters.
- The bot writes to a member who shares no server with it only when they authorized the app on their account: the
  page asks for it, the direct message of the decision and `/appeal send` fail otherwise, and the staff is told
  ("not delivered"), as today.

### Commands

`/appeal` keeps `list`, `view`, `approve`, `deny`, `send`, with the changes above, and gains `block user: reason:`
and `unblock user:`. `list` gets a `form` filter next to the status. `view` shows the form, the choices as labels, the
attachments as links. The parent's autocomplete serves `appeal` and `form`.

## Data

### Contract

- `GuildAppeals`: add `managerRoles BigInt[]`, `pingRoles BigInt[]`, `anonymous Boolean`, `thread String`
  (`none|public|private`), `cooldownDays Int`, `maxActive Int`, `blockOnDenial Boolean`. `questions` stays, unused,
  until wolfstar.rocks has taken the contract bump: its client selects every column of the table, and a dropped one
  breaks its reads between the two deploys. A later migration drops it. My call.
- `AppealForm`: `id` (autoincrement), `guildId`, `name`, `description`, `icon`, `enabled`, `lockReason`, `types Int[]`,
  `requiredRoles BigInt[]`, `restrictedRoles BigInt[]`, `questions` (typed JSON), `position`, `createdAt`,
  `updatedAt`. Unique on (`guildId`, lower(`name`)) by hand, as `GuildJoinGuardRule` has it.
- `Appeal`: add `formId` (nullable: an appeal of a form that was deleted keeps its answers), `threadId`, `decidedAt`;
  `answers` becomes a typed JSON (`PrismaJson.AppealAnswers`: `{ questionId, kind, value }` with the label of the
  question as it was, so a renamed or deleted question still reads).
- `AppealBlock`: `guildId`, `userId`, `reason`, `moderatorId`, `automatic`, `createdAt`; unique on (`guildId`, `userId`).
- `AppealRequest`: as `JoinGuardRequest` (`kind` enum, `appealId`, `userId`, `moderatorId`, `reason`, `createdAt`,
  `processedAt`, `error`), with the partial index on the unprocessed rows for the sweep.

### Migrations

Planned ones for the DDL. Hand-written `rawSql` for: the first form of every server whose `appeals.questions` is not
empty (one `text` question per line, long, required, 1000 characters, named "Appeal", icon none); the `answers` of
the existing appeals, text to JSON by index with the question IDs of that form, and `#n` as the label when there is
none. No server has an appeal yet (the page does not exist), so the second is for a local database at most.

### Storage and caches

The forms are read from the database when they are needed (a page view, a submission, a command) and not cached: as
the automatic messages, they are read by few paths. The settings go through the settings cache as every key does, and
the dashboard's `guild_settings_update` drops them. The blocks are read on the paths that need them.

## Site brief

What the dashboard and the public page need, for wolfstar.rocks (the owner's work). The bot side ships first; the
contract bump brings the tables.

**Dashboard, "Appeals" of a server** (who may manage the server, as the rest of the dashboard):

- The settings above, written as settings keys through the existing settings write (`appeals.*`), with `pg_notify`.
- The forms: a list with their order (drag or arrows writing `position`), create, edit, delete, enable/disable with a
  lock reason. The editor: name, description, icon, kinds of case, required and restricted roles, the questions
  (add, remove, reorder, at most five, at least one that asks; the fields of each kind as listed under Forms, with the
  limits). Written straight to `AppealForm`; the bot does not cache them, no notification needed. Question IDs are
  generated as the other IDs of the dashboard are (`settings/ids.ts` of the contract).
- The appeals: a list with filters by status and form, the answers of one (attachments through the route below), the decision with a reason, block from an appeal, and a page of the blocked members with unblock. Every
  action is an `AppealRequest` row plus `NOTIFY appeal_request, '<id>'` in the same transaction, then the row is
  polled for `processedAt` and shown with its `error` code when it has one. Only a member who passes
  `hasAppealAccess` may act: the `moderator` level as the bot computes it, or a manager role.

**Public page, `/appeal/:guildId`**: as described under "The page", on `GET /appeals/:guild`,
`POST /appeals/:guild/:form`, with the user's session. The authorization button goes to `https://discord.com/oauth2/authorize?client_id=<CLIENT_ID>&integration_type=1&scope=applications.commands`
with a `redirect_uri` back to the page, which is registered on the application.

**Files**: a KV namespace bound as `APPEAL_FILES` on both Workers (`config/cloudflare.ts`), with the two routes of
"Attachments": the upload and `/appeal-files/:guildId/:appealId/:index`, which applies the access rule and serves the
file as a download with `Content-Disposition: attachment` and `nosniff`, so an uploaded page cannot run on the domain.
This needs wolfstar.rocks#498, which moves the site to Workers.

## Left to the builder

- The shape of the request queue once it serves two kinds of request, as long as the join guard keeps its behaviour.
- The exact embeds and Components V2 of the messages, the texts, the layout of `/appeal view` with attachments.
- How `/reply` reaches the thread of another server from a direct message: the thread ID is on the row, the gateway
  client can post to it when the bot is in the server; a server the bot left makes the appeal unreachable, and the
  member is told.
- The tests: the eligibility function and the answers' validation are pure and get the bulk of them.

## Risks to try on staging before building on them

- Whether the bot can open a direct message with a user who only installed the app on their account and shares no
  server with it. Discord's documentation says a user-installed app works in the direct messages with its bot; it does
  not say the bot may start them. The dialogue after a ban rests on it: one test on staging with an account that left
  the test server, before `/reply` and the authorization box are built.
- `/reply` registers with the user integration type, which Discord refuses until user install is on in the portal of
  the application: with `register: 'on-start'` that is one logged failure, not a crash, but the operator step comes
  first.
