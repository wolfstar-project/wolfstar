import { container } from '@wolfstar/http-framework';
import {
	isDMChannel,
	isGuildBasedChannelByGuildKey,
	isNewsChannel,
	isTextChannel,
	isThreadChannel,
	isVoiceChannel
} from '@wolfstar/http-framework-utilities/gateway';
import type {
	AnnouncementChannel,
	AnyChannel,
	DMChannel,
	Guild,
	GuildMember,
	PermissionOverwrites,
	PrivateThreadChannel,
	PublicThreadChannel,
	AnnouncementThreadChannel,
	Role,
	TextChannel,
	User,
	VoiceChannel
} from '@wolfstar/plugin-gateway';
import type {
	ChannelType,
	GuildDefaultMessageNotifications,
	GuildExplicitContentFilter,
	GuildFeature,
	GuildMFALevel,
	GuildPremiumTier,
	GuildVerificationLevel,
	OverwriteType
} from 'discord-api-types/v10';

type ThreadChannel = AnnouncementThreadChannel | PublicThreadChannel | PrivateThreadChannel;
type ThreadChannelType = ChannelType.AnnouncementThread | ChannelType.PublicThread | ChannelType.PrivateThread;

// #region Guild

/**
 * Flattens a guild with its channels and roles, which the gateway structure does not hold: see {@link fetchFlattenedGuild}.
 * @param guild The guild to flatten.
 * @param channels The channels of the guild, threads included.
 * @param roles The roles of the guild.
 */
export function flattenGuild(guild: Guild, channels: readonly AnyChannel[], roles: readonly Role[]): FlattenedGuild {
	return {
		afkChannelId: guild.afkChannelId,
		afkTimeout: guild.afkTimeout,
		applicationId: guild.applicationId,
		approximateMemberCount: guild.approximateMemberCount,
		approximatePresenceCount: guild.approximatePresenceCount,
		available: guild.available,
		banner: guild.banner,
		channels: flattenChannels(channels) as FlattenedGuildChannel[],
		defaultMessageNotifications: guild.defaultMessageNotifications,
		description: guild.description,
		widgetEnabled: guild.widgetEnabled,
		explicitContentFilter: guild.explicitContentFilter,
		features: guild.features,
		icon: guild.icon,
		id: guild.id,
		joinedTimestamp: guild.joinedTimestamp,
		mfaLevel: guild.mfaLevel,
		name: guild.name,
		ownerId: guild.ownerId,
		partnered: guild.partnered,
		preferredLocale: guild.preferredLocale,
		premiumSubscriptionCount: guild.premiumSubscriptionCount,
		premiumTier: guild.premiumTier,
		roles: roles.map(flattenRole),
		splash: guild.splash,
		systemChannelId: guild.systemChannelId,
		vanityURLCode: guild.vanityURLCode,
		verificationLevel: guild.verificationLevel,
		verified: guild.verified
	};
}

/**
 * Fetches the channels of a guild, the active threads included, like discord.js' `guild.channels.cache`.
 * @param guild The guild to fetch the channels of.
 */
export async function fetchGuildChannels(guild: Guild): Promise<AnyChannel[]> {
	const [channels, threads] = await Promise.all([guild.channels.fetch(), guild.fetchActiveThreads()]);
	return [...channels, ...threads.threads];
}

/**
 * Fetches the roles of a guild, like discord.js' `guild.roles.cache`.
 * @param guild The guild to fetch the roles of.
 */
export function fetchGuildRoles(guild: Guild): Promise<Role[]> {
	return container.gatewayClient.roles.fetchAll(guild.id);
}

/**
 * Fetches the channels and the roles of a guild, then flattens it.
 * @param guild The guild to flatten.
 */
export async function fetchFlattenedGuild(guild: Guild): Promise<FlattenedGuild> {
	const [channels, roles] = await Promise.all([fetchGuildChannels(guild), fetchGuildRoles(guild)]);
	return flattenGuild(guild, channels, roles);
}

export interface FlattenedGuild {
	afkChannelId: string | null;
	afkTimeout: number;
	applicationId: string | null;
	approximateMemberCount: number | null;
	approximatePresenceCount: number | null;
	available: boolean;
	banner: string | null;
	channels: FlattenedGuildChannel[];
	defaultMessageNotifications: GuildDefaultMessageNotifications;
	description: string | null;
	widgetEnabled: boolean;
	explicitContentFilter: GuildExplicitContentFilter;
	features: readonly `${GuildFeature}`[];
	icon: string | null;
	id: string;
	joinedTimestamp: number | null;
	mfaLevel: GuildMFALevel;
	name: string;
	ownerId: string;
	partnered: boolean;
	preferredLocale: string;
	premiumSubscriptionCount: number | null;
	premiumTier: GuildPremiumTier;
	roles: FlattenedRole[];
	splash: string | null;
	systemChannelId: string | null;
	vanityURLCode: string | null;
	verificationLevel: GuildVerificationLevel;
	verified: boolean;
}

// #endregion Guild

// #region Role

export function flattenRole(role: Role): FlattenedRole {
	return {
		id: role.id,
		guildId: role.guildId,
		name: role.name,
		color: role.color,
		hoist: role.hoist,
		rawPosition: role.position,
		permissions: role.permissions.bitField.toString(),
		managed: role.managed,
		mentionable: role.mentionable
	};
}

export interface FlattenedRole {
	color: number;

	guildId: string;

	hoist: boolean;

	id: string;

	managed: boolean;

	mentionable: boolean;

	name: string;

	permissions: string;

	rawPosition: number;
}

// #endregion Role

// #region Channel

/**
 * Flattens a list of channels, reading the parent of a thread from the list before its cached relation.
 * @param channels The channels to flatten.
 */
export function flattenChannels(channels: readonly AnyChannel[]): FlattenedChannel[] {
	const parents = new Map(channels.map((channel) => [channel.id, channel]));
	return channels.map((channel) =>
		isThreadChannel(channel)
			? flattenChannelThread(channel, (channel.parentId && parents.get(channel.parentId)) || channel.parent)
			: flattenChannel(channel)
	);
}

/**
 * Flattens a channel, fetching the parent of a thread when it is not cached, since a thread is sent with the overwrites
 * and the position of its parent.
 * @param channel The channel to flatten.
 */
export async function fetchFlattenedChannel(channel: AnyChannel): Promise<FlattenedChannel> {
	if (!isThreadChannel(channel) || channel.parent || !channel.parentId) return flattenChannel(channel);

	const parent = await container.gatewayClient.channels.fetch(channel.parentId).catch(() => null);
	return flattenChannel(channel, parent);
}

export function flattenChannel(channel: AnnouncementChannel): FlattenedNewsChannel;
export function flattenChannel(channel: TextChannel): FlattenedTextChannel;
export function flattenChannel(channel: VoiceChannel): FlattenedVoiceChannel;
export function flattenChannel(channel: DMChannel): FlattenedDMChannel;
export function flattenChannel(channel: ThreadChannel, parent?: AnyChannel | null): FlattenedThreadChannel;
export function flattenChannel(channel: AnyChannel, parent?: AnyChannel | null): FlattenedChannel;
export function flattenChannel(channel: AnyChannel, parent?: AnyChannel | null) {
	if (isThreadChannel(channel)) return flattenChannelThread(channel, parent === undefined ? channel.parent : parent);
	if (isNewsChannel(channel)) return flattenChannelNews(channel);
	if (isTextChannel(channel)) return flattenChannelText(channel);
	if (isVoiceChannel(channel)) return flattenChannelVoice(channel);
	if (isGuildBasedChannelByGuildKey(channel)) return flattenChannelGuild(channel);
	if (isDMChannel(channel)) return flattenChannelDM(channel);
	return flattenChannelFallback(channel);
}

function flattenChannelNews(channel: AnnouncementChannel): FlattenedNewsChannel {
	return {
		id: channel.id,
		type: channel.type,
		guildId: channel.guildId!,
		name: channel.name ?? '',
		rawPosition: channel.position,
		parentId: channel.parentId ?? null,
		permissionOverwrites: flattenPermissionOverwrites(channel),
		topic: channel.topic ?? null,
		nsfw: channel.nsfw ?? false,
		createdTimestamp: channel.createdTimestamp ?? 0
	};
}

function flattenChannelText(channel: TextChannel): FlattenedTextChannel {
	return {
		id: channel.id,
		type: channel.type,
		guildId: channel.guildId!,
		name: channel.name ?? '',
		rawPosition: channel.position,
		parentId: channel.parentId ?? null,
		permissionOverwrites: flattenPermissionOverwrites(channel),
		topic: channel.topic ?? null,
		nsfw: channel.nsfw ?? false,
		rateLimitPerUser: channel.rateLimitPerUser ?? 0,
		createdTimestamp: channel.createdTimestamp ?? 0
	};
}

function flattenChannelVoice(channel: VoiceChannel): FlattenedVoiceChannel {
	return {
		id: channel.id,
		type: channel.type,
		guildId: channel.guildId!,
		name: channel.name ?? '',
		rawPosition: channel.position,
		parentId: channel.parentId ?? null,
		permissionOverwrites: flattenPermissionOverwrites(channel),
		bitrate: channel.bitrate,
		userLimit: channel.userLimit,
		createdTimestamp: channel.createdTimestamp ?? 0
	};
}

function flattenChannelGuild(channel: AnyChannel & { guildId: string }): FlattenedGuildChannel {
	return {
		id: channel.id,
		type: channel.type,
		guildId: channel.guildId,
		name: 'name' in channel ? (channel.name ?? '') : '',
		rawPosition: getPosition(channel) ?? 0,
		// Categories have no parent:
		parentId: ('parentId' in channel ? channel.parentId : null) ?? null,
		permissionOverwrites: flattenPermissionOverwrites(channel),
		createdTimestamp: channel.createdTimestamp ?? 0
	};
}

function flattenChannelDM(channel: DMChannel): FlattenedDMChannel {
	return {
		id: channel.id,
		type: channel.type,
		recipient: channel.recipients.at(0)?.id ?? null,
		createdTimestamp: channel.createdTimestamp ?? 0
	};
}

function flattenChannelThread(channel: ThreadChannel, parent: AnyChannel | null | undefined): FlattenedThreadChannel {
	return {
		id: channel.id,
		type: channel.type,
		archived: channel.archived ?? false,
		archivedTimestamp: channel.archiveTimestamp,
		createdTimestamp: channel.createdTimestamp ?? 0,
		guildId: channel.guildId!,
		name: channel.name ?? '',
		parentId: channel.parentId ?? null,
		permissionOverwrites: flattenPermissionOverwrites(parent),
		rawPosition: getPosition(parent),
		rateLimitPerUser: channel.rateLimitPerUser ?? null
	};
}

function flattenChannelFallback(channel: AnyChannel): FlattenedChannel {
	return {
		id: channel.id,
		type: channel.type,
		createdTimestamp: channel.createdTimestamp ?? 0
	};
}

function getPosition(channel: AnyChannel | null | undefined): number | null {
	return channel && 'position' in channel ? channel.position : null;
}

/**
 * Flattens the permission overwrites of a channel into the `[id, overwrite]` pairs discord.js' collection serialized to.
 * @param channel The channel to read the overwrites of, none when it does not have any (threads, DMs).
 */
function flattenPermissionOverwrites(channel: AnyChannel | null | undefined): [string, FlattenedPermissionOverwrites][] {
	if (!channel || !('permissionOverwrites' in channel)) return [];
	return channel.permissionOverwrites.cache.map((overwrite) => [overwrite.id, flattenPermissionOverwrite(overwrite)]);
}

function flattenPermissionOverwrite(overwrite: PermissionOverwrites): FlattenedPermissionOverwrites {
	return {
		id: overwrite.id,
		type: overwrite.type,
		deny: overwrite.deny.bitField.toString(),
		allow: overwrite.allow.bitField.toString()
	};
}

export interface FlattenedPermissionOverwrites {
	id: string;
	type: OverwriteType;
	deny: string;
	allow: string;
}

export interface FlattenedChannel {
	id: string;
	type: ChannelType;
	createdTimestamp: number;
}

export interface FlattenedGuildChannel extends FlattenedChannel {
	type: ChannelType;
	guildId: string;
	name: string;
	parentId: string | null;
	permissionOverwrites: [string, FlattenedPermissionOverwrites][];
	rawPosition: number;
}

export interface FlattenedNewsChannel extends FlattenedGuildChannel {
	type: ChannelType.GuildAnnouncement;
	nsfw: boolean;
	topic: string | null;
}

export interface FlattenedTextChannel extends FlattenedGuildChannel {
	type: ChannelType.GuildText;
	nsfw: boolean;
	rateLimitPerUser: number;
	topic: string | null;
}

export interface FlattenedThreadChannel extends Pick<FlattenedGuildChannel, 'id' | 'createdTimestamp'> {
	type: ThreadChannelType;
	archived: boolean;
	archivedTimestamp: number | null;
	guildId: string;
	name: string;
	parentId: string | null;
	permissionOverwrites: [string, FlattenedPermissionOverwrites][];
	rateLimitPerUser: number | null;
	rawPosition: number | null;
}

export interface FlattenedNewsThreadChannel extends FlattenedChannel {
	type: ChannelType.AnnouncementThread;
}

export interface FlattenedPublicThreadChannel extends FlattenedChannel {
	type: ChannelType.PublicThread;
}

export interface FlattenedPrivateThreadChannel extends FlattenedChannel {
	type: ChannelType.PrivateThread;
}

export interface FlattenedVoiceChannel extends FlattenedGuildChannel {
	type: ChannelType.GuildVoice;
	bitrate: number;
	userLimit: number;
}

export interface FlattenedDMChannel extends FlattenedChannel {
	type: ChannelType.DM;
	recipient: string | null;
}

// #endregion Channel

// #region User

export function flattenUser(user: User): FlattenedUser {
	return {
		id: user.id,
		bot: user.bot,
		username: user.username,
		discriminator: user.discriminator,
		avatar: user.avatar
	};
}

export interface FlattenedUser {
	avatar: string | null;

	bot: boolean;

	discriminator: string;

	id: string;

	username: string;
}

// #endregion User

// #region Member

/**
 * Flattens a member with its roles, `@everyone` included, which are fetched since the member only holds their IDs.
 * @param member The member to flatten.
 */
export async function flattenMember(member: GuildMember): Promise<FlattenedMember> {
	const [user, roles] = await Promise.all([member.user ?? container.gatewayClient.users.fetch(member.roles.userId), member.roles.fetch()]);

	return {
		id: user.id,
		guildId: member.guildId,
		user: flattenUser(user),
		joinedTimestamp: member.joinedTimestamp,
		premiumSinceTimestamp: member.premiumSinceTimestamp,
		roles: roles.map(flattenRole)
	};
}

export interface FlattenedMember {
	guildId: string;

	id: string;

	joinedTimestamp: number | null;

	premiumSinceTimestamp: number | null;

	roles: FlattenedRole[];

	user: FlattenedUser;
}

// #endregion Member
