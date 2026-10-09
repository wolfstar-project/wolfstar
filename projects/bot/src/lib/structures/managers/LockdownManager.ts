import { PermissionsBits } from '#utils/bits';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import type {
	AnnouncementChannel,
	AnyThreadChannel,
	CategoryChannel,
	ForumChannel,
	MediaChannel,
	StageChannel,
	TextChannel,
	VoiceChannel
} from '@wolfstar/plugin-gateway';
import { ChannelType, OverwriteType, PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

/**
 * The permissions the lockdown of a role takes away from the whole server.
 */
export const LockdownGuildPermissions = PermissionFlagsBits.SendMessages | PermissionFlagsBits.SendMessagesInThreads;

/**
 * The permissions a lockdown takes away in a channel that members write in or create threads in.
 */
export const LockdownTextPermissions =
	PermissionFlagsBits.SendMessages |
	PermissionFlagsBits.SendMessagesInThreads |
	PermissionFlagsBits.CreatePublicThreads |
	PermissionFlagsBits.CreatePrivateThreads;

/**
 * The permissions a lockdown takes away in a channel that members join.
 */
export const LockdownVoicePermissions = PermissionFlagsBits.Connect;

/**
 * The permissions a lockdown takes away in a channel that is both, and in a category, which its channels inherit from.
 */
export const LockdownMixedPermissions = LockdownTextPermissions | LockdownVoicePermissions;

export enum LockdownType {
	Guild,
	Channel,
	Thread
}

interface BaseLockdownData<Type extends LockdownType> {
	/**
	 * The type of lockdown that was applied.
	 */
	type: Type;

	/**
	 * The ID of the guild where the lockdown was applied.
	 */
	guildId: Snowflake;

	/**
	 * The ID of the user who started the lockdown.
	 */
	userId: Snowflake;
}

/**
 * The lockdown of a role in the whole server, which removes {@linkcode LockdownGuildPermissions} from it.
 */
export interface LockdownGuildData extends BaseLockdownData<LockdownType.Guild> {
	/**
	 * The ID of the role that was locked down.
	 */
	roleId: Snowflake;

	/**
	 * The permissions that were taken away from the role.
	 */
	permissionsApplied: bigint;

	/**
	 * The permissions of {@linkcode permissionsApplied} that the role had before the lockdown.
	 */
	permissionsOriginal: bigint;
}

/**
 * The lockdown of a role in a channel, which denies the permissions of {@linkcode getChannelLockdownPermissions} to it.
 */
export interface LockdownChannelData extends BaseLockdownData<LockdownType.Channel> {
	/**
	 * The ID of the channel where the lockdown was applied.
	 */
	channelId: Snowflake;

	/**
	 * The ID of the role that was locked down in the channel.
	 */
	roleId: Snowflake;

	/**
	 * The permissions that were denied to the role.
	 */
	permissionsApplied: bigint;

	/**
	 * The permissions of {@linkcode permissionsApplied} that the overwrite of the role allowed before the lockdown.
	 */
	permissionsOriginalAllow: bigint;

	/**
	 * The permissions of {@linkcode permissionsApplied} that the overwrite of the role denied before the lockdown.
	 */
	permissionsOriginalDeny: bigint;
}

/**
 * The lockdown of a thread, which locks it.
 */
export interface LockdownThreadData extends BaseLockdownData<LockdownType.Thread> {
	/**
	 * The ID of the thread that was locked.
	 */
	channelId: Snowflake;
}

export type LockdownData = LockdownGuildData | LockdownChannelData | LockdownThreadData;

/**
 * The channels that have permission overwrites, that is every guild channel but the threads.
 */
export type LockdownChannel = TextChannel | AnnouncementChannel | VoiceChannel | StageChannel | CategoryChannel | ForumChannel | MediaChannel;

const LockdownChannelTypes: ReadonlySet<ChannelType> = new Set([
	ChannelType.GuildText,
	ChannelType.GuildAnnouncement,
	ChannelType.GuildVoice,
	ChannelType.GuildStageVoice,
	ChannelType.GuildCategory,
	ChannelType.GuildForum,
	ChannelType.GuildMedia
]);

const ThreadChannelTypes: ReadonlySet<ChannelType> = new Set([ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread]);

export function isLockdownChannel(channel: { readonly type: ChannelType }): channel is LockdownChannel {
	return LockdownChannelTypes.has(channel.type);
}

export function isLockdownThread(channel: { readonly type: ChannelType }): channel is AnyThreadChannel {
	return ThreadChannelTypes.has(channel.type);
}

/**
 * Gets the permissions a lockdown takes away in a channel: the ones for writing and creating threads in the channels
 * that are text-based, the one for joining in the voice-based ones, and all of them in the channels that are both and
 * in the categories.
 *
 * @param type - The type of the channel.
 */
export function getChannelLockdownPermissions(type: ChannelType) {
	switch (type) {
		case ChannelType.GuildVoice:
		case ChannelType.GuildStageVoice:
		case ChannelType.GuildCategory:
			return LockdownMixedPermissions;
		default:
			return LockdownTextPermissions;
	}
}

/**
 * The Redis hash the lockdowns are kept in, by {@linkcode LockdownManager.keyOf}.
 */
const LockdownsHash = 'wolfstar:lockdowns';

/**
 * How many times Discord is asked again when it does not answer the release of a temporary lockdown, and how long to
 * wait before each of them.
 */
const ReleaseAttempts = 5;
const ReleaseBackoff = 30_000;

const IgnoredReleaseErrors = new Set<RESTJSONErrorCodes>([
	RESTJSONErrorCodes.UnknownGuild,
	RESTJSONErrorCodes.UnknownRole,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions
]);

/**
 * Whether there is nothing to do about an error of {@linkcode LockdownManager.release}: what the lockdown applied to
 * is gone, or the bot can no longer reach it, so trying again would not change anything.
 */
export function isIgnorableReleaseError(error: unknown) {
	return error instanceof DiscordAPIError && IgnoredReleaseErrors.has(error.code as RESTJSONErrorCodes);
}

/**
 * What the `moderationEndLockdown` task of a temporary lockdown carries.
 */
export interface LockdownTaskPayload {
	/**
	 * The key of the lockdown, see {@linkcode LockdownManager.keyOf}.
	 */
	key: string;
}

declare module '@wolfstar/plugin-scheduled-tasks' {
	interface ScheduledTasks {
		moderationEndLockdown: LockdownTaskPayload;
	}
}

/**
 * Keeps track of the lockdowns the bot started, and releases them.
 *
 * @remarks
 *
 * What a lockdown changed is kept in Redis, so that releasing it restores what was there before instead of guessing,
 * and survives a restart. A temporary lockdown also has a `moderationEndLockdown` scheduled task, a BullMQ job that
 * releases it when it is due, and that is removed when the lockdown is released by hand.
 */
export class LockdownManager {
	/**
	 * Gets what a lockdown of a role in a channel, or in the server, or of a thread, changed.
	 *
	 * @param target - What the lockdown is applied to, the role is only needed for the ones that are not of a thread.
	 */
	public async get(target: LockdownTarget): Promise<LockdownData | null> {
		return this.getByKey(LockdownManager.keyOf(target));
	}

	/**
	 * Gets what a lockdown changed from its key.
	 *
	 * @param key - The key of the lockdown, see {@linkcode LockdownManager.keyOf}.
	 */
	public async getByKey(key: string): Promise<LockdownData | null> {
		const value = await container.redis.hget(LockdownsHash, key);
		return value === null ? null : deserialize(value);
	}

	/**
	 * Remembers a lockdown, and schedules its release when `duration` is given.
	 *
	 * @param data - What the lockdown changed.
	 * @param duration - How long the lockdown lasts in milliseconds, `null` to keep it until it is released by hand.
	 */
	public async add(data: LockdownData, duration: number | null) {
		const key = LockdownManager.keyOf(data);
		await container.redis.hset(LockdownsHash, key, serialize(data));

		// A job with the same ID is left alone by BullMQ, so the one of a previous lockdown has to go first:
		await container.tasks.delete(key).catch(() => null);
		if (!duration) return;

		try {
			await container.tasks.create(
				{ name: 'moderationEndLockdown', payload: { key } },
				{
					repeated: false,
					delay: duration,
					customJobOptions: {
						jobId: key,
						attempts: ReleaseAttempts,
						backoff: { type: 'exponential', delay: ReleaseBackoff },
						removeOnComplete: true,
						removeOnFail: true
					}
				}
			);
		} catch (error) {
			// A temporary lockdown that would never be released is not remembered as one that will:
			await container.redis.hdel(LockdownsHash, key).catch(() => null);
			throw error;
		}
	}

	/**
	 * Forgets a lockdown, and its scheduled release, without releasing it.
	 *
	 * @param target - What the lockdown is applied to.
	 */
	public async remove(target: LockdownTarget) {
		const key = LockdownManager.keyOf(target);
		await container.redis.hdel(LockdownsHash, key);
		await container.tasks.delete(key).catch(() => null);
	}

	/**
	 * Releases a lockdown: restores what it changed and forgets it.
	 *
	 * @remarks
	 *
	 * The lockdown is only forgotten once everything is restored, so that it can be released again when Discord refuses
	 * or does not answer.
	 *
	 * @param data - What the lockdown changed.
	 * @param reason - The reason for the audit log.
	 * @throws A `DiscordAPIError` when Discord refuses a change.
	 */
	public async release(data: LockdownData, reason?: string) {
		switch (data.type) {
			case LockdownType.Guild:
				await this.#releaseGuild(data, reason);
				break;
			case LockdownType.Channel:
				await this.#releaseChannel(data, reason);
				break;
			case LockdownType.Thread:
				await this.#releaseThread(data, reason);
				break;
		}

		await this.remove(data);
	}

	/**
	 * The key of a lockdown, which is also the ID of its scheduled job (BullMQ does not allow a `:` in it).
	 */
	public static keyOf(target: LockdownTarget) {
		return target.type === LockdownType.Guild
			? `lockdown-guild-${target.guildId}-${target.roleId}`
			: target.type === LockdownType.Channel
				? `lockdown-channel-${target.channelId}-${target.roleId}`
				: `lockdown-thread-${target.channelId}`;
	}

	async #releaseGuild(data: LockdownGuildData, reason?: string) {
		const roles = await container.gatewayClient.roles.fetchAll(data.guildId);
		const role = roles.find((entry) => entry.id === data.roleId);
		if (role === undefined) return;

		const permissions = role.permissions.bitField | data.permissionsOriginal;
		if (permissions === role.permissions.bitField) return;

		await role.setPermissions(permissions, reason);
	}

	async #releaseChannel(data: LockdownChannelData, reason?: string) {
		const channel = await container.gatewayClient.channels.fetch(data.channelId);
		if (!isLockdownChannel(channel)) return;

		const overwrite = channel.permissionOverwrites.resolve(data.roleId);
		if (overwrite === null) return;

		// Only the applied permissions are touched, anything that was changed since is kept:
		const allow = (overwrite.allow.bitField & ~data.permissionsApplied) | data.permissionsOriginalAllow;
		const deny = (overwrite.deny.bitField & ~data.permissionsApplied) | data.permissionsOriginalDeny;
		if (allow === 0n && deny === 0n) {
			await overwrite.delete(reason);
			return;
		}

		const options = Object.fromEntries(
			PermissionsBits.toArray(data.permissionsApplied).map((name) => {
				const bit = PermissionFlagsBits[name];
				return [name, (allow & bit) === bit ? true : (deny & bit) === bit ? false : null];
			})
		);
		await channel.permissionOverwrites.edit(data.roleId, options, { type: OverwriteType.Role, reason });
	}

	async #releaseThread(data: LockdownThreadData, reason?: string) {
		const channel = await container.gatewayClient.channels.fetch(data.channelId);
		if (!isLockdownThread(channel) || !channel.locked) return;

		await channel.setLocked(false, reason);
	}
}

export type LockdownTarget =
	| Pick<LockdownGuildData, 'type' | 'guildId' | 'roleId'>
	| Pick<LockdownChannelData, 'type' | 'channelId' | 'roleId'>
	| Pick<LockdownThreadData, 'type' | 'channelId'>;

/**
 * The lockdowns the bot started in this process.
 */
export const lockdowns = new LockdownManager();

const BigIntFields = ['permissionsApplied', 'permissionsOriginal', 'permissionsOriginalAllow', 'permissionsOriginalDeny'];

function serialize(data: LockdownData) {
	return JSON.stringify(data, (_, value: unknown) => (typeof value === 'bigint' ? value.toString() : value));
}

function deserialize(value: string): LockdownData {
	return JSON.parse(value, (key, field: unknown) => (BigIntFields.includes(key) ? BigInt(field as string) : field)) as LockdownData;
}
