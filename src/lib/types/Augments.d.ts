/* eslint-disable @typescript-eslint/unified-signatures */
import type {
	CommandAutoDelete,
	DisabledCommandChannel,
	GuildSettingsOfType,
	PermissionsNode,
	ReactionRole,
	SerializerStore,
	StickyRole,
	TaskStore,
	UniqueRoleSet
} from '#lib/database';
import type { GuildMemberFetchQueue } from '#lib/discord/GuildMemberFetchQueue';
import type { WorkerManager } from '#lib/moderation/workers/WorkerManager';
import type { AnalyticsData, InviteCodeValidEntry, InviteStore, ScheduleManager, WolfCommand } from '#lib/structures';
import type { Events } from '#lib/types';
import type { TaskErrorPayload } from '#lib/types/Internals';
import type { TypedFT, TypedT } from '#lib/types/Utils';
import type { LLRCData, LongLivingReactionCollector } from '#utils/LongLivingReactionCollector';
import type { EmojiObject } from '#utils/functions';
import type { EmbedBuilder } from '@discordjs/builders';
import type { API } from '@discordjs/core/http-only';
import type { Piece, Store } from '@sapphire/framework';
import type { Awaitable, Nullish } from '@sapphire/utilities';
import type { ArrayString, BooleanString, IntegerString } from '@skyra/env-utilities';
import type { Guild, GuildChannel, NewsChannel, Role, Snowflake, TextChannel, User } from 'discord.js';

declare global {
	namespace PrismaJson {
		export type PermissionNodeEntries = PermissionsNode[];
		export type CommandAutoDeleteEntries = CommandAutoDelete[];
		export type DisabledCommandChannelEntries = DisabledCommandChannel[];
		export type StickyRoleEntries = StickyRole[];
		export type ReactionRoleEntries = ReactionRole[];
		export type UniqueRoleSetEntries = UniqueRoleSet[];
	}
}

declare module 'discord.js' {
	interface Client {
		readonly dev: boolean;
		readonly analytics: AnalyticsData | null;
		readonly guildMemberFetchQueue: GuildMemberFetchQueue;
		readonly invites: InviteStore;
		readonly llrCollectors: Set<LongLivingReactionCollector>;
		readonly schedules: ScheduleManager;
		readonly version: string;
		readonly webhookError: WebhookClient | null;
	}

	interface ClientOptions {
		nms?: {
			role?: number;
			everyone?: number;
		};
		schedule?: {
			interval: number;
		};
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		api?: API;
		schedule: ScheduleManager;
		workers: WorkerManager;
	}

	interface StoreRegistryEntries {
		tasks: TaskStore;
		serializers: SerializerStore;
	}
}

declare module '@sapphire/framework' {
	interface ArgType {
		case: number;
		channelName: GuildChannel;
		cleanString: string;
		command: WolfCommand;
		commandMatch: string;
		commandName: WolfCommand;
		duration: Date;
		emoji: EmojiObject;
		invite: InviteCodeValidEntry;
		language: string;
		piece: Piece;
		range: number[];
		reset: true;
		roleName: Role;
		snowflake: Snowflake;
		store: Store<Piece>;
		textChannelName: TextChannel;
		textOrNewsChannelName: TextChannel | NewsChannel;
		time: Date;
		timespan: number;
		userName: User;
	}

	interface Preconditions {
		Administrator: never;
		BotOwner: never;
		Everyone: never;
		Moderator: never;
		ServerOwner: never;
	}

	interface SapphireClient {
		emit(event: Events.Error, error: Error): boolean;
		emit(event: Events.AnalyticsSync, guilds: number, users: number): boolean;
		emit(event: Events.CommandUsageAnalytics, command: string, category: string): boolean;
		emit(
			event: Events.GuildMessageLog,
			guild: Guild,
			channelId: string | Nullish,
			key: GuildSettingsOfType<string | Nullish>,
			makeMessage: () => Awaitable<EmbedBuilder>
		): boolean;
		emit(event: Events.ReactionBlocked, data: LLRCData, emoji: string): boolean;
		emit(event: Events.ResourceAnalyticsSync): boolean;
		emit(event: Events.TaskError, error: Error, payload: TaskErrorPayload): boolean;
		emit(event: string | symbol, ...args: any[]): boolean;
	}
}

declare module 'i18next' {
	export interface TFunction {
		lng: string;
		ns?: string;

		<TReturn>(key: TypedT<TReturn>): TReturn;
		<TArgs extends object, TReturn>(key: TypedFT<TArgs, TReturn>, options?: TArgs): TReturn;
	}
}

declare module '@skyra/env-utilities' {
	export interface Env {
		CLIENT_NAME: string;
		CLIENT_VERSION: string;
		CLIENT_PREFIX: string;
		CLIENT_REGEX_PREFIX: string;
		CLIENT_OWNERS: ArrayString;
		CLIENT_ID: string;
		CLIENT_SHARDS: string;

		CLIENT_PRESENCE_NAME: string;
		CLIENT_PRESENCE_TYPE: string;

		API_ENABLED: BooleanString;
		API_ORIGIN: string;
		API_PORT: IntegerString;
		API_PREFIX: string;
		API_HOST: string;

		OAUTH_COOKIE: string;
		OAUTH_DOMAIN_OVERWRITE: string;
		OAUTH_REDIRECT_URI: string;
		OAUTH_SCOPE: ArrayString;
		OAUTH_SECRET: string;
		INFLUX_ENABLED: BooleanString;
		INFLUX_URL: string;
		INFLUX_PROXY_URL: string;
		INFLUX_TOKEN: string;
		INFLUX_ORG: string;
		INFLUX_ORG_ANALYTICS_BUCKET: string;

		WEBHOOK_ERROR_ID: string;
		WEBHOOK_ERROR_TOKEN: string;

		WORKER_COUNT: IntegerString;

		DISCORD_TOKEN: string;
		VOID_BOTS_TOKEN: string;
		BOTS_FOR_DISCORD_TOKEN: string;
		DISCORD_BOT_LIST_TOKEN: string;
		DISCORD_BOTS_TOKEN: string;
		SENTRY_URL: string;
		TOP_GG_TOKEN: string;
		DATABASE_URL: string;
	}
}
