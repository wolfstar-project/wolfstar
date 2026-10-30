-- The schema of the tables the bot does not create with its migrations, at the contract of the `marker` row at the end
-- of this file. It is a dump of the staging database, applied once on a database with no "Guild" table by
-- `scripts/deploy.ts`, which then runs `prisma db migrate` for what came after. Do not edit it or dump it again: a change
-- of the schema is a migration.
--
-- PostgreSQL database dump
--


-- Dumped from database version 15.19 (Debian 15.19-1.pgdg13+2)
-- Dumped by pg_dump version 15.18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: prisma_contract; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA prisma_contract;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: GuildAutoModerationHardAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GuildAutoModerationHardAction" AS ENUM (
    'VoiceKick',
    'Warning',
    'Timeout',
    'Mute',
    'Kick',
    'Softban',
    'Ban'
);


--
-- Name: GuildAutoModerationRuleType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GuildAutoModerationRuleType" AS ENUM (
    'Attachments',
    'Capitals',
    'Invites',
    'Links',
    'Newlines',
    'Words',
    'Zalgo',
    'Phishing',
    'Stickers',
    'Duplicates',
    'Characters',
    'Emojis',
    'MessageSpam',
    'ImageSpam',
    'LinksCooldown',
    'MassMentions',
    'MentionsCooldown',
    'Spoilers',
    'MaskedLinks',
    'StickersCooldown',
    'Polls'
);


--
-- Name: HoneypotAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HoneypotAction" AS ENUM (
    'Kick',
    'Softban',
    'Ban'
);


--
-- Name: JoinGuardCheckpointStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JoinGuardCheckpointStatus" AS ENUM (
    'Waiting',
    'Verified',
    'Kicked',
    'Banned',
    'Left'
);


--
-- Name: JoinGuardHardAction; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JoinGuardHardAction" AS ENUM (
    'Kick',
    'Ban'
);


--
-- Name: JoinGuardRequestKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JoinGuardRequestKind" AS ENUM (
    'Pass',
    'Verify',
    'Kick',
    'PostButton'
);


--
-- Name: JoinGuardResolution; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JoinGuardResolution" AS ENUM (
    'Rule',
    'Checkpoint',
    'Timeout',
    'Moderator'
);


--
-- Name: JoinGuardSharedBanSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JoinGuardSharedBanSource" AS ENUM (
    'JoinGuard',
    'Honeypot'
);


--
-- Name: MessageUpdateStyle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MessageUpdateStyle" AS ENUM (
    'Difference',
    'Separate'
);


--
-- Name: ModerationActionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ModerationActionType" AS ENUM (
    'AddRole',
    'RemoveRole',
    'Nickname',
    'AddWarning',
    'RemoveWarning',
    'Timeout',
    'TimeoutEnd',
    'Kick',
    'Softban',
    'Ban',
    'Unban'
);


--
-- Name: ReportStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReportStatus" AS ENUM (
    'Open',
    'Actioned',
    'Dismissed'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: contract; Type: TABLE; Schema: prisma_contract; Owner: -
--

CREATE TABLE prisma_contract.contract (
    core_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    contract_json jsonb NOT NULL
);


--
-- Name: ledger; Type: TABLE; Schema: prisma_contract; Owner: -
--

CREATE TABLE prisma_contract.ledger (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    space text NOT NULL,
    migration_name text NOT NULL,
    migration_hash text NOT NULL,
    origin_core_hash text,
    origin_profile_hash text,
    destination_core_hash text NOT NULL,
    destination_profile_hash text,
    operations jsonb NOT NULL
);


--
-- Name: ledger_id_seq; Type: SEQUENCE; Schema: prisma_contract; Owner: -
--

CREATE SEQUENCE prisma_contract.ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: prisma_contract; Owner: -
--

ALTER SEQUENCE prisma_contract.ledger_id_seq OWNED BY prisma_contract.ledger.id;


--
-- Name: marker; Type: TABLE; Schema: prisma_contract; Owner: -
--

CREATE TABLE prisma_contract.marker (
    space text DEFAULT 'app'::text NOT NULL,
    core_hash text NOT NULL,
    profile_hash text NOT NULL,
    contract_json jsonb,
    canonical_version integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    app_tag text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    invariants text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: Appeal; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Appeal" (
    answers text[] DEFAULT '{}'::text[] NOT NULL,
    case_id integer NOT NULL,
    created_at timestamp(3) without time zone NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    reason text,
    reviewer_id bigint,
    status text DEFAULT 'pending'::text NOT NULL,
    user_id bigint NOT NULL
);


--
-- Name: Appeal_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Appeal_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Appeal_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Appeal_id_seq" OWNED BY public."Appeal".id;


--
-- Name: AuditChainHead; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditChainHead" (
    hash text,
    id text DEFAULT 'default'::text NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


--
-- Name: AuditEvent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuditEvent" (
    action text NOT NULL,
    actor_id bigint NOT NULL,
    actor_name text,
    actor_type text NOT NULL,
    changes jsonb,
    context jsonb,
    hash text NOT NULL,
    id text NOT NULL,
    outcome text NOT NULL,
    prev_hash text,
    reason text,
    target_id bigint,
    target_type text,
    tenant_id bigint,
    "timestamp" timestamp(3) without time zone NOT NULL
);


--
-- Name: CommandLog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommandLog" (
    channel_id bigint,
    command_id bigint,
    command_name text NOT NULL,
    command_type text NOT NULL,
    error_reason text,
    executed_at timestamp(3) without time zone NOT NULL,
    guild_id bigint NOT NULL,
    id text NOT NULL,
    latency_ms integer,
    metadata jsonb,
    subcommand text,
    success boolean DEFAULT true NOT NULL,
    user_id bigint NOT NULL
);


--
-- Name: Guild; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Guild" (
    id bigint NOT NULL,
    language text DEFAULT 'en-US'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    updates_channel_id bigint
);


--
-- Name: GuildAppeals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildAppeals" (
    bans boolean DEFAULT true NOT NULL,
    channel_id bigint,
    enabled boolean DEFAULT false NOT NULL,
    id bigint NOT NULL,
    mutes boolean DEFAULT true NOT NULL,
    questions text[] DEFAULT '{}'::text[] NOT NULL,
    timeouts boolean DEFAULT true NOT NULL
);


--
-- Name: GuildAutoDelete; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildAutoDelete" (
    allow text[] DEFAULT '{}'::text[] NOT NULL,
    bots boolean DEFAULT false NOT NULL,
    channel_id bigint NOT NULL,
    delay integer DEFAULT 0 NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL
);


--
-- Name: GuildAutoDelete_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GuildAutoDelete_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GuildAutoDelete_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GuildAutoDelete_id_seq" OWNED BY public."GuildAutoDelete".id;


--
-- Name: GuildAutoMessage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildAutoMessage" (
    channel_id bigint NOT NULL,
    content text NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    "interval" integer NOT NULL,
    last_message_id bigint,
    mentions boolean DEFAULT false NOT NULL,
    next_run_at timestamp(3) without time zone NOT NULL
);


--
-- Name: GuildAutoMessage_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GuildAutoMessage_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GuildAutoMessage_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GuildAutoMessage_id_seq" OWNED BY public."GuildAutoMessage".id;


--
-- Name: GuildAutoModeration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildAutoModeration" (
    channel_id bigint,
    id bigint NOT NULL,
    track_native boolean DEFAULT false NOT NULL
);


--
-- Name: GuildAutoModerationRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildAutoModerationRule" (
    id bigint NOT NULL,
    guild_id bigint NOT NULL,
    name text NOT NULL,
    type public."GuildAutoModerationRuleType" NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    soft_action integer DEFAULT 0 NOT NULL,
    hard_action public."GuildAutoModerationHardAction" NOT NULL,
    hard_action_duration integer,
    threshold_maximum integer NOT NULL,
    threshold_duration integer NOT NULL,
    ignored_roles bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    ignored_channels bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    options jsonb DEFAULT '{}'::jsonb NOT NULL,
    escalation jsonb DEFAULT '[]'::jsonb NOT NULL,
    escalation_duration integer DEFAULT 86400000 NOT NULL
);


--
-- Name: GuildAutoModerationRule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public."GuildAutoModerationRule" ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public."GuildAutoModerationRule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: GuildAutoPurge; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildAutoPurge" (
    channel_id bigint NOT NULL,
    filter text DEFAULT 'any'::text NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    "interval" integer NOT NULL,
    next_run_at timestamp(3) without time zone NOT NULL,
    value text
);


--
-- Name: GuildAutoPurge_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GuildAutoPurge_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GuildAutoPurge_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GuildAutoPurge_id_seq" OWNED BY public."GuildAutoPurge".id;


--
-- Name: GuildCommands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildCommands" (
    disabled text[] DEFAULT '{}'::text[] NOT NULL,
    disabled_channels bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    disabled_in_channels jsonb DEFAULT '[]'::jsonb NOT NULL,
    id bigint NOT NULL
);


--
-- Name: GuildHoneypot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildHoneypot" (
    action public."HoneypotAction" DEFAULT 'Softban'::public."HoneypotAction" NOT NULL,
    channel_id bigint,
    direct_message boolean DEFAULT true NOT NULL,
    id bigint NOT NULL,
    keep_active boolean DEFAULT false NOT NULL,
    log_channel_id bigint,
    random_name boolean DEFAULT false NOT NULL,
    warning boolean DEFAULT true NOT NULL
);


--
-- Name: GuildJoinGuard; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildJoinGuard" (
    allowed_roles bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    allowed_users bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    captcha boolean DEFAULT true NOT NULL,
    checkpoint boolean DEFAULT false NOT NULL,
    checkpoint_channel_id bigint,
    checkpoint_message_id bigint,
    checkpoint_timeout integer DEFAULT 86400 NOT NULL,
    connections boolean DEFAULT true NOT NULL,
    direct_message boolean DEFAULT true NOT NULL,
    direct_message_content text,
    enabled boolean DEFAULT false NOT NULL,
    id bigint NOT NULL,
    log_channel_id bigint,
    minimum_trust integer DEFAULT 1 NOT NULL,
    pending_role_id bigint,
    shared_bans boolean DEFAULT true NOT NULL,
    verified_role_id bigint
);


--
-- Name: GuildJoinGuardRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildJoinGuardRule" (
    account_age_max integer,
    alert_channel_id bigint,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    default_avatar boolean DEFAULT false NOT NULL,
    direct_message boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    generated_name boolean DEFAULT false NOT NULL,
    guild_id bigint NOT NULL,
    hard_action public."JoinGuardHardAction",
    id bigint NOT NULL,
    name text NOT NULL,
    name_contains text,
    role_id bigint,
    send_to_checkpoint boolean DEFAULT false NOT NULL,
    unverified_bot boolean DEFAULT false NOT NULL
);


--
-- Name: GuildJoinGuardRule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GuildJoinGuardRule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GuildJoinGuardRule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GuildJoinGuardRule_id_seq" OWNED BY public."GuildJoinGuardRule".id;


--
-- Name: GuildLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildLogs" (
    channel_create bigint,
    channel_delete bigint,
    channel_update bigint,
    command bigint,
    emoji_create bigint,
    emoji_delete bigint,
    emoji_update bigint,
    id bigint NOT NULL,
    ignore_all bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    ignore_messages bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    ignore_reactions bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    image bigint,
    member_add bigint,
    member_nickname_update bigint,
    member_remove bigint,
    member_username_update bigint,
    message_delete bigint,
    message_delete_nsfw bigint,
    message_update bigint,
    message_update_nsfw bigint,
    prune bigint,
    reaction_emoji_add bigint,
    reaction_emoji_include_twemoji boolean DEFAULT false NOT NULL,
    reaction_emoji_remove bigint,
    role_create bigint,
    role_delete bigint,
    role_update bigint,
    server_update bigint,
    settings bigint,
    invites bigint,
    threads bigint,
    events bigint,
    expressions bigint,
    integrations bigint,
    boosts bigint
);


--
-- Name: GuildLogsOptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildLogsOptions" (
    id bigint NOT NULL,
    message_update_style public."MessageUpdateStyle" DEFAULT 'Difference'::public."MessageUpdateStyle" NOT NULL,
    webhooks boolean DEFAULT false NOT NULL
);


--
-- Name: GuildModeration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildModeration" (
    channel_id bigint,
    id bigint NOT NULL,
    track_bans boolean DEFAULT false NOT NULL,
    track_timeouts boolean DEFAULT false NOT NULL,
    track_roles boolean DEFAULT false NOT NULL,
    track_kicks boolean DEFAULT false NOT NULL,
    confirm_recent_minutes integer DEFAULT 0 NOT NULL,
    dehoist boolean DEFAULT false NOT NULL
);


--
-- Name: GuildModerationReason; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildModerationReason" (
    alias text NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    reason text NOT NULL
);


--
-- Name: GuildModerationReason_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GuildModerationReason_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GuildModerationReason_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GuildModerationReason_id_seq" OWNED BY public."GuildModerationReason".id;


--
-- Name: GuildPermissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildPermissions" (
    id bigint NOT NULL,
    roles jsonb DEFAULT '[]'::jsonb NOT NULL,
    users jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: GuildReports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildReports" (
    anonymous boolean DEFAULT false NOT NULL,
    blocked_users bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    channel_id bigint,
    id bigint NOT NULL,
    notify boolean DEFAULT true NOT NULL,
    role_id bigint
);


--
-- Name: GuildRoleRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildRoleRule" (
    any_roles bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    forbidden_roles bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    required_roles bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    role_id bigint NOT NULL
);


--
-- Name: GuildRoleRule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GuildRoleRule_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GuildRoleRule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GuildRoleRule_id_seq" OWNED BY public."GuildRoleRule".id;


--
-- Name: GuildRoles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildRoles" (
    admin bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    id bigint NOT NULL,
    initial bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    initial_humans bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    initial_robots bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    moderator bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    muted bigint,
    public bigint[] DEFAULT '{}'::bigint[] NOT NULL,
    remove_initial boolean DEFAULT false NOT NULL,
    restricted_attachment bigint,
    restricted_embed bigint,
    restricted_emoji bigint,
    restricted_reaction bigint,
    restricted_voice bigint,
    unique_role_sets jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: GuildWarnThreshold; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."GuildWarnThreshold" (
    action public."GuildAutoModerationHardAction" NOT NULL,
    count integer NOT NULL,
    duration integer,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    period integer DEFAULT 0 NOT NULL
);


--
-- Name: GuildWarnThreshold_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."GuildWarnThreshold_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: GuildWarnThreshold_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."GuildWarnThreshold_id_seq" OWNED BY public."GuildWarnThreshold".id;


--
-- Name: JoinGuardCheckpoint; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JoinGuardCheckpoint" (
    account_created_at timestamp(3) without time zone NOT NULL,
    case_id integer,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    default_avatar boolean NOT NULL,
    expires_at timestamp(3) without time zone,
    generated_name boolean NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    linked_accounts integer DEFAULT 0 NOT NULL,
    moderator_id bigint,
    resolution public."JoinGuardResolution",
    resolved_at timestamp(3) without time zone,
    rule_id bigint,
    rule_name text NOT NULL,
    status public."JoinGuardCheckpointStatus" NOT NULL,
    trust integer,
    user_id bigint NOT NULL
);


--
-- Name: JoinGuardCheckpoint_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."JoinGuardCheckpoint_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: JoinGuardCheckpoint_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."JoinGuardCheckpoint_id_seq" OWNED BY public."JoinGuardCheckpoint".id;


--
-- Name: JoinGuardRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JoinGuardRequest" (
    checkpoint_id bigint,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    error text,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    kind public."JoinGuardRequestKind" NOT NULL,
    linked_accounts integer,
    moderator_id bigint,
    processed_at timestamp(3) without time zone,
    reason text,
    trust integer,
    user_id bigint
);


--
-- Name: JoinGuardRequest_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."JoinGuardRequest_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: JoinGuardRequest_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."JoinGuardRequest_id_seq" OWNED BY public."JoinGuardRequest".id;


--
-- Name: JoinGuardSharedBan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."JoinGuardSharedBan" (
    case_id integer NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    guild_id bigint NOT NULL,
    source public."JoinGuardSharedBanSource" NOT NULL,
    user_id bigint NOT NULL
);


--
-- Name: MessageHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MessageHistory" (
    case_id integer,
    created_at timestamp(3) without time zone NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    messages jsonb DEFAULT '[]'::jsonb NOT NULL,
    moderator_id bigint NOT NULL,
    user_id bigint NOT NULL
);


--
-- Name: MessageHistory_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."MessageHistory_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: MessageHistory_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."MessageHistory_id_seq" OWNED BY public."MessageHistory".id;


--
-- Name: ModerationAction; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ModerationAction" (
    action public."ModerationActionType" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    duration integer NOT NULL,
    guild_id bigint NOT NULL,
    id integer NOT NULL,
    metadata integer NOT NULL,
    moderator_id bigint NOT NULL,
    reason text,
    reference_id integer,
    target_id bigint NOT NULL
);


--
-- Name: ModerationCaseData; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ModerationCaseData" (
    case_id integer NOT NULL,
    channel_id bigint,
    extra_data jsonb,
    guild_id bigint NOT NULL,
    message_id bigint
);


--
-- Name: Modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Modules" (
    automod boolean DEFAULT true NOT NULL,
    commands boolean DEFAULT true NOT NULL,
    id bigint NOT NULL,
    logs boolean DEFAULT true NOT NULL,
    moderation boolean DEFAULT true NOT NULL,
    roles boolean DEFAULT true NOT NULL,
    autodelete boolean DEFAULT true NOT NULL,
    autopurge boolean DEFAULT true NOT NULL,
    automessage boolean DEFAULT true NOT NULL
);


--
-- Name: Report; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Report" (
    action text,
    anonymous boolean DEFAULT false NOT NULL,
    attachments text[] DEFAULT '{}'::text[] NOT NULL,
    case_id integer,
    channel_id bigint,
    closed_at timestamp(3) without time zone,
    content text,
    created_at timestamp(3) without time zone DEFAULT now() NOT NULL,
    guild_id bigint NOT NULL,
    id bigint NOT NULL,
    message_id bigint,
    moderator_id bigint,
    reason text NOT NULL,
    reporter_id bigint NOT NULL,
    status public."ReportStatus" NOT NULL,
    target_id bigint NOT NULL,
    target_tag text NOT NULL
);


--
-- Name: Report_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Report_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Report_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Report_id_seq" OWNED BY public."Report".id;


--
-- Name: StickyNickname; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StickyNickname" (
    guild_id bigint NOT NULL,
    nickname text NOT NULL,
    user_id bigint NOT NULL
);


--
-- Name: StickyRole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StickyRole" (
    guild_id bigint NOT NULL,
    role_ids bigint[] NOT NULL,
    user_id bigint NOT NULL
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id bigint NOT NULL,
    report boolean DEFAULT true NOT NULL
);


--
-- Name: ledger id; Type: DEFAULT; Schema: prisma_contract; Owner: -
--

ALTER TABLE ONLY prisma_contract.ledger ALTER COLUMN id SET DEFAULT nextval('prisma_contract.ledger_id_seq'::regclass);


--
-- Name: Appeal id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Appeal" ALTER COLUMN id SET DEFAULT nextval('public."Appeal_id_seq"'::regclass);


--
-- Name: GuildAutoDelete id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoDelete" ALTER COLUMN id SET DEFAULT nextval('public."GuildAutoDelete_id_seq"'::regclass);


--
-- Name: GuildAutoMessage id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoMessage" ALTER COLUMN id SET DEFAULT nextval('public."GuildAutoMessage_id_seq"'::regclass);


--
-- Name: GuildAutoPurge id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoPurge" ALTER COLUMN id SET DEFAULT nextval('public."GuildAutoPurge_id_seq"'::regclass);


--
-- Name: GuildJoinGuardRule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildJoinGuardRule" ALTER COLUMN id SET DEFAULT nextval('public."GuildJoinGuardRule_id_seq"'::regclass);


--
-- Name: GuildModerationReason id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildModerationReason" ALTER COLUMN id SET DEFAULT nextval('public."GuildModerationReason_id_seq"'::regclass);


--
-- Name: GuildRoleRule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildRoleRule" ALTER COLUMN id SET DEFAULT nextval('public."GuildRoleRule_id_seq"'::regclass);


--
-- Name: GuildWarnThreshold id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildWarnThreshold" ALTER COLUMN id SET DEFAULT nextval('public."GuildWarnThreshold_id_seq"'::regclass);


--
-- Name: JoinGuardCheckpoint id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardCheckpoint" ALTER COLUMN id SET DEFAULT nextval('public."JoinGuardCheckpoint_id_seq"'::regclass);


--
-- Name: JoinGuardRequest id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardRequest" ALTER COLUMN id SET DEFAULT nextval('public."JoinGuardRequest_id_seq"'::regclass);


--
-- Name: MessageHistory id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MessageHistory" ALTER COLUMN id SET DEFAULT nextval('public."MessageHistory_id_seq"'::regclass);


--
-- Name: Report id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Report" ALTER COLUMN id SET DEFAULT nextval('public."Report_id_seq"'::regclass);


--
-- Name: contract contract_pkey; Type: CONSTRAINT; Schema: prisma_contract; Owner: -
--

ALTER TABLE ONLY prisma_contract.contract
    ADD CONSTRAINT contract_pkey PRIMARY KEY (core_hash);


--
-- Name: ledger ledger_pkey; Type: CONSTRAINT; Schema: prisma_contract; Owner: -
--

ALTER TABLE ONLY prisma_contract.ledger
    ADD CONSTRAINT ledger_pkey PRIMARY KEY (id);


--
-- Name: marker marker_pkey; Type: CONSTRAINT; Schema: prisma_contract; Owner: -
--

ALTER TABLE ONLY prisma_contract.marker
    ADD CONSTRAINT marker_pkey PRIMARY KEY (space);


--
-- Name: Appeal Appeal_guild_id_case_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Appeal"
    ADD CONSTRAINT "Appeal_guild_id_case_id_key" UNIQUE (guild_id, case_id);


--
-- Name: Appeal Appeal_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Appeal"
    ADD CONSTRAINT "Appeal_pkey" PRIMARY KEY (id);


--
-- Name: AuditChainHead AuditChainHead_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditChainHead"
    ADD CONSTRAINT "AuditChainHead_pkey" PRIMARY KEY (id);


--
-- Name: AuditEvent AuditEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuditEvent"
    ADD CONSTRAINT "AuditEvent_pkey" PRIMARY KEY (id);


--
-- Name: CommandLog CommandLog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommandLog"
    ADD CONSTRAINT "CommandLog_pkey" PRIMARY KEY (id);


--
-- Name: GuildAppeals GuildAppeals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAppeals"
    ADD CONSTRAINT "GuildAppeals_pkey" PRIMARY KEY (id);


--
-- Name: GuildAutoDelete GuildAutoDelete_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoDelete"
    ADD CONSTRAINT "GuildAutoDelete_channel_id_key" UNIQUE (channel_id);


--
-- Name: GuildAutoDelete GuildAutoDelete_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoDelete"
    ADD CONSTRAINT "GuildAutoDelete_pkey" PRIMARY KEY (id);


--
-- Name: GuildAutoMessage GuildAutoMessage_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoMessage"
    ADD CONSTRAINT "GuildAutoMessage_channel_id_key" UNIQUE (channel_id);


--
-- Name: GuildAutoMessage GuildAutoMessage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoMessage"
    ADD CONSTRAINT "GuildAutoMessage_pkey" PRIMARY KEY (id);


--
-- Name: GuildAutoModerationRule GuildAutoModerationRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoModerationRule"
    ADD CONSTRAINT "GuildAutoModerationRule_pkey" PRIMARY KEY (id);


--
-- Name: GuildAutoModeration GuildAutoModeration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoModeration"
    ADD CONSTRAINT "GuildAutoModeration_pkey" PRIMARY KEY (id);


--
-- Name: GuildAutoPurge GuildAutoPurge_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoPurge"
    ADD CONSTRAINT "GuildAutoPurge_channel_id_key" UNIQUE (channel_id);


--
-- Name: GuildAutoPurge GuildAutoPurge_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoPurge"
    ADD CONSTRAINT "GuildAutoPurge_pkey" PRIMARY KEY (id);


--
-- Name: GuildCommands GuildCommands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildCommands"
    ADD CONSTRAINT "GuildCommands_pkey" PRIMARY KEY (id);


--
-- Name: GuildHoneypot GuildHoneypot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildHoneypot"
    ADD CONSTRAINT "GuildHoneypot_pkey" PRIMARY KEY (id);


--
-- Name: GuildJoinGuardRule GuildJoinGuardRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildJoinGuardRule"
    ADD CONSTRAINT "GuildJoinGuardRule_pkey" PRIMARY KEY (id);


--
-- Name: GuildJoinGuard GuildJoinGuard_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildJoinGuard"
    ADD CONSTRAINT "GuildJoinGuard_pkey" PRIMARY KEY (id);


--
-- Name: GuildLogsOptions GuildLogsOptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildLogsOptions"
    ADD CONSTRAINT "GuildLogsOptions_pkey" PRIMARY KEY (id);


--
-- Name: GuildLogs GuildLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildLogs"
    ADD CONSTRAINT "GuildLogs_pkey" PRIMARY KEY (id);


--
-- Name: GuildModerationReason GuildModerationReason_guild_id_alias_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildModerationReason"
    ADD CONSTRAINT "GuildModerationReason_guild_id_alias_key" UNIQUE (guild_id, alias);


--
-- Name: GuildModerationReason GuildModerationReason_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildModerationReason"
    ADD CONSTRAINT "GuildModerationReason_pkey" PRIMARY KEY (id);


--
-- Name: GuildModeration GuildModeration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildModeration"
    ADD CONSTRAINT "GuildModeration_pkey" PRIMARY KEY (id);


--
-- Name: GuildPermissions GuildPermissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildPermissions"
    ADD CONSTRAINT "GuildPermissions_pkey" PRIMARY KEY (id);


--
-- Name: GuildReports GuildReports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildReports"
    ADD CONSTRAINT "GuildReports_pkey" PRIMARY KEY (id);


--
-- Name: GuildRoleRule GuildRoleRule_guild_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildRoleRule"
    ADD CONSTRAINT "GuildRoleRule_guild_id_role_id_key" UNIQUE (guild_id, role_id);


--
-- Name: GuildRoleRule GuildRoleRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildRoleRule"
    ADD CONSTRAINT "GuildRoleRule_pkey" PRIMARY KEY (id);


--
-- Name: GuildRoles GuildRoles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildRoles"
    ADD CONSTRAINT "GuildRoles_pkey" PRIMARY KEY (id);


--
-- Name: GuildWarnThreshold GuildWarnThreshold_guild_id_count_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildWarnThreshold"
    ADD CONSTRAINT "GuildWarnThreshold_guild_id_count_key" UNIQUE (guild_id, count);


--
-- Name: GuildWarnThreshold GuildWarnThreshold_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildWarnThreshold"
    ADD CONSTRAINT "GuildWarnThreshold_pkey" PRIMARY KEY (id);


--
-- Name: Guild Guild_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Guild"
    ADD CONSTRAINT "Guild_pkey" PRIMARY KEY (id);


--
-- Name: JoinGuardCheckpoint JoinGuardCheckpoint_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardCheckpoint"
    ADD CONSTRAINT "JoinGuardCheckpoint_pkey" PRIMARY KEY (id);


--
-- Name: JoinGuardRequest JoinGuardRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardRequest"
    ADD CONSTRAINT "JoinGuardRequest_pkey" PRIMARY KEY (id);


--
-- Name: JoinGuardSharedBan JoinGuardSharedBan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardSharedBan"
    ADD CONSTRAINT "JoinGuardSharedBan_pkey" PRIMARY KEY (guild_id, case_id);


--
-- Name: MessageHistory MessageHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MessageHistory"
    ADD CONSTRAINT "MessageHistory_pkey" PRIMARY KEY (id);


--
-- Name: ModerationAction ModerationAction_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ModerationAction"
    ADD CONSTRAINT "ModerationAction_pkey" PRIMARY KEY (id, guild_id);


--
-- Name: ModerationCaseData ModerationCaseData_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ModerationCaseData"
    ADD CONSTRAINT "ModerationCaseData_pkey" PRIMARY KEY (case_id, guild_id);


--
-- Name: Modules Modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Modules"
    ADD CONSTRAINT "Modules_pkey" PRIMARY KEY (id);


--
-- Name: Report Report_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_pkey" PRIMARY KEY (id);


--
-- Name: StickyNickname StickyNickname_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StickyNickname"
    ADD CONSTRAINT "StickyNickname_pkey" PRIMARY KEY (guild_id, user_id);


--
-- Name: StickyRole StickyRole_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StickyRole"
    ADD CONSTRAINT "StickyRole_pkey" PRIMARY KEY (user_id, guild_id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: AuditEvent_action_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditEvent_action_timestamp_idx" ON public."AuditEvent" USING btree (action, "timestamp");


--
-- Name: AuditEvent_actor_id_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditEvent_actor_id_timestamp_idx" ON public."AuditEvent" USING btree (actor_id, "timestamp");


--
-- Name: AuditEvent_hash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AuditEvent_hash_key" ON public."AuditEvent" USING btree (hash);


--
-- Name: AuditEvent_tenant_id_timestamp_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuditEvent_tenant_id_timestamp_idx" ON public."AuditEvent" USING btree (tenant_id, "timestamp");


--
-- Name: CommandLog_guild_id_command_name_executed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommandLog_guild_id_command_name_executed_at_idx" ON public."CommandLog" USING btree (guild_id, command_name, executed_at);


--
-- Name: CommandLog_guild_id_executed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommandLog_guild_id_executed_at_idx" ON public."CommandLog" USING btree (guild_id, executed_at);


--
-- Name: CommandLog_guild_id_user_id_executed_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CommandLog_guild_id_user_id_executed_at_idx" ON public."CommandLog" USING btree (guild_id, user_id, executed_at);


--
-- Name: GuildAutoDelete_guild_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuildAutoDelete_guild_id_idx" ON public."GuildAutoDelete" USING btree (guild_id);


--
-- Name: GuildAutoMessage_guild_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuildAutoMessage_guild_id_idx" ON public."GuildAutoMessage" USING btree (guild_id);


--
-- Name: GuildAutoMessage_next_run_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuildAutoMessage_next_run_at_idx" ON public."GuildAutoMessage" USING btree (next_run_at);


--
-- Name: GuildAutoModerationRule_guild_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuildAutoModerationRule_guild_id_idx" ON public."GuildAutoModerationRule" USING btree (guild_id);


--
-- Name: GuildAutoModerationRule_guild_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuildAutoModerationRule_guild_id_name_key" ON public."GuildAutoModerationRule" USING btree (guild_id, lower(name));


--
-- Name: GuildAutoPurge_guild_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuildAutoPurge_guild_id_idx" ON public."GuildAutoPurge" USING btree (guild_id);


--
-- Name: GuildAutoPurge_next_run_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuildAutoPurge_next_run_at_idx" ON public."GuildAutoPurge" USING btree (next_run_at);


--
-- Name: GuildJoinGuardRule_guild_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "GuildJoinGuardRule_guild_id_idx" ON public."GuildJoinGuardRule" USING btree (guild_id);


--
-- Name: GuildJoinGuardRule_guild_id_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "GuildJoinGuardRule_guild_id_name_key" ON public."GuildJoinGuardRule" USING btree (guild_id, lower(name));


--
-- Name: JoinGuardCheckpoint_guild_id_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JoinGuardCheckpoint_guild_id_status_created_at_idx" ON public."JoinGuardCheckpoint" USING btree (guild_id, status, created_at);


--
-- Name: JoinGuardCheckpoint_guild_id_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JoinGuardCheckpoint_guild_id_user_id_idx" ON public."JoinGuardCheckpoint" USING btree (guild_id, user_id);


--
-- Name: JoinGuardCheckpoint_guild_id_user_id_waiting_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "JoinGuardCheckpoint_guild_id_user_id_waiting_key" ON public."JoinGuardCheckpoint" USING btree (guild_id, user_id) WHERE (status = 'Waiting'::public."JoinGuardCheckpointStatus");


--
-- Name: JoinGuardCheckpoint_rule_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JoinGuardCheckpoint_rule_id_idx" ON public."JoinGuardCheckpoint" USING btree (rule_id);


--
-- Name: JoinGuardRequest_created_at_pending_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JoinGuardRequest_created_at_pending_idx" ON public."JoinGuardRequest" USING btree (created_at) WHERE (processed_at IS NULL);


--
-- Name: JoinGuardRequest_guild_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JoinGuardRequest_guild_id_created_at_idx" ON public."JoinGuardRequest" USING btree (guild_id, created_at);


--
-- Name: JoinGuardSharedBan_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "JoinGuardSharedBan_user_id_idx" ON public."JoinGuardSharedBan" USING btree (user_id);


--
-- Name: MessageHistory_guild_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MessageHistory_guild_id_idx" ON public."MessageHistory" USING btree (guild_id);


--
-- Name: ModerationAction_guild_id_created_at_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ModerationAction_guild_id_created_at_id_idx" ON public."ModerationAction" USING btree (guild_id, created_at, id);


--
-- Name: ModerationAction_guild_id_target_id_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ModerationAction_guild_id_target_id_created_at_idx" ON public."ModerationAction" USING btree (guild_id, target_id, created_at);


--
-- Name: Report_guild_id_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Report_guild_id_id_idx" ON public."Report" USING btree (guild_id, id);


--
-- Name: Report_guild_id_target_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Report_guild_id_target_id_idx" ON public."Report" USING btree (guild_id, target_id);


--
-- Name: Appeal Appeal_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Appeal"
    ADD CONSTRAINT "Appeal_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildAppeals GuildAppeals_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAppeals"
    ADD CONSTRAINT "GuildAppeals_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildAutoDelete GuildAutoDelete_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoDelete"
    ADD CONSTRAINT "GuildAutoDelete_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildAutoMessage GuildAutoMessage_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoMessage"
    ADD CONSTRAINT "GuildAutoMessage_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildAutoModerationRule GuildAutoModerationRule_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoModerationRule"
    ADD CONSTRAINT "GuildAutoModerationRule_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildAutoModeration GuildAutoModeration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoModeration"
    ADD CONSTRAINT "GuildAutoModeration_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildAutoPurge GuildAutoPurge_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildAutoPurge"
    ADD CONSTRAINT "GuildAutoPurge_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildCommands GuildCommands_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildCommands"
    ADD CONSTRAINT "GuildCommands_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildHoneypot GuildHoneypot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildHoneypot"
    ADD CONSTRAINT "GuildHoneypot_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildJoinGuardRule GuildJoinGuardRule_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildJoinGuardRule"
    ADD CONSTRAINT "GuildJoinGuardRule_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildJoinGuard GuildJoinGuard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildJoinGuard"
    ADD CONSTRAINT "GuildJoinGuard_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildLogsOptions GuildLogsOptions_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildLogsOptions"
    ADD CONSTRAINT "GuildLogsOptions_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildLogs GuildLogs_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildLogs"
    ADD CONSTRAINT "GuildLogs_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildModerationReason GuildModerationReason_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildModerationReason"
    ADD CONSTRAINT "GuildModerationReason_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildModeration GuildModeration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildModeration"
    ADD CONSTRAINT "GuildModeration_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildPermissions GuildPermissions_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildPermissions"
    ADD CONSTRAINT "GuildPermissions_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildReports GuildReports_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildReports"
    ADD CONSTRAINT "GuildReports_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildRoleRule GuildRoleRule_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildRoleRule"
    ADD CONSTRAINT "GuildRoleRule_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildRoles GuildRoles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildRoles"
    ADD CONSTRAINT "GuildRoles_id_fkey" FOREIGN KEY (id) REFERENCES public."Modules"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: GuildWarnThreshold GuildWarnThreshold_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."GuildWarnThreshold"
    ADD CONSTRAINT "GuildWarnThreshold_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JoinGuardCheckpoint JoinGuardCheckpoint_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardCheckpoint"
    ADD CONSTRAINT "JoinGuardCheckpoint_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: JoinGuardCheckpoint JoinGuardCheckpoint_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardCheckpoint"
    ADD CONSTRAINT "JoinGuardCheckpoint_rule_id_fkey" FOREIGN KEY (rule_id) REFERENCES public."GuildJoinGuardRule"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: JoinGuardRequest JoinGuardRequest_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."JoinGuardRequest"
    ADD CONSTRAINT "JoinGuardRequest_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MessageHistory MessageHistory_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MessageHistory"
    ADD CONSTRAINT "MessageHistory_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ModerationAction ModerationAction_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ModerationAction"
    ADD CONSTRAINT "ModerationAction_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ModerationCaseData ModerationCaseData_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ModerationCaseData"
    ADD CONSTRAINT "ModerationCaseData_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Modules Modules_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Modules"
    ADD CONSTRAINT "Modules_id_fkey" FOREIGN KEY (id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Report Report_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StickyNickname StickyNickname_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StickyNickname"
    ADD CONSTRAINT "StickyNickname_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StickyRole StickyRole_guild_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StickyRole"
    ADD CONSTRAINT "StickyRole_guild_id_fkey" FOREIGN KEY (guild_id) REFERENCES public."Guild"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

INSERT INTO prisma_contract.marker VALUES ('app', 'f8343a42cf2c3ba06d076c5d269fd03a3674297ec49238b835602e26a32ad8d7', '3916f444a8a17ad749191acf9e08dad97d1a327b88c2f1d45d12f240296aa8b2', NULL, NULL, '2026-10-30 15:17:01.801084+00', NULL, '{}', '{}');
