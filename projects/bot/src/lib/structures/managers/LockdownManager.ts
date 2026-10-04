import { PermissionsBits } from '#utils/bits';
import { clearAccurateTimeout, setAccurateTimeout, type AccurateTimeout } from '#utils/Timers';
import { DiscordAPIError, HTTPError } from '@discordjs/rest';
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
 * How many times the release of a lockdown is tried again when Discord does not answer, and how long to wait for each.
 */
const MaximumReleaseAttempts = 5;
const ReleaseRetryDelay = 30_000;

const IgnoredReleaseErrors = new Set<RESTJSONErrorCodes>([
	RESTJSONErrorCodes.UnknownGuild,
	RESTJSONErrorCodes.UnknownRole,
	RESTJSONErrorCodes.UnknownChannel,
	RESTJSONErrorCodes.MissingAccess,
	RESTJSONErrorCodes.MissingPermissions
]);

interface LockdownEntry {
	data: LockdownData;

	/**
	 * The timer that releases the lockdown, `null` for a lockdown that lasts until it is released by hand.
	 */
	timeout: AccurateTimeout | null;
}

/**
 * Keeps track of the lockdowns the bot started, and releases them.
 *
 * @remarks
 *
 * What a lockdown changed is kept so that releasing it restores what was there before instead of guessing, and the
 * temporary ones are released by a timer. Both only live as long as the process does: there is no persisted schedule
 * to ask for them again after a restart, so a lockdown that was running then has to be released by hand, which
 * falls back to removing the permissions it applied.
 */
export class LockdownManager {
	readonly #entries = new Map<string, LockdownEntry>();

	/**
	 * Gets the lockdown of a role in a channel, or in the server, or of a thread.
	 *
	 * @param target - What the lockdown is applied to, the role is only needed for the ones that are not of a thread.
	 */
	public get(target: LockdownTarget): LockdownData | null {
		return this.#entries.get(LockdownManager.keyOf(target))?.data ?? null;
	}

	/**
	 * Remembers a lockdown, and releases it after `duration` milliseconds when it is given.
	 *
	 * @param data - What the lockdown changed.
	 * @param duration - How long the lockdown lasts, `null` to keep it until it is released by hand.
	 */
	public add(data: LockdownData, duration: number | null) {
		const key = LockdownManager.keyOf(data);
		this.#entries.get(key)?.timeout?.stop();

		const timeout = duration ? setAccurateTimeout(() => void this.#expire(key, data, 1), duration) : null;
		this.#entries.set(key, { data, timeout });
	}

	/**
	 * Forgets a lockdown, without releasing it.
	 *
	 * @param target - What the lockdown is applied to.
	 * @returns Whether there was one.
	 */
	public remove(target: LockdownTarget) {
		const key = LockdownManager.keyOf(target);
		const entry = this.#entries.get(key);
		if (entry === undefined) return false;

		if (entry.timeout) clearAccurateTimeout(entry.timeout);
		return this.#entries.delete(key);
	}

	/**
	 * Releases a lockdown: restores what it changed and forgets it.
	 *
	 * @param data - What the lockdown changed.
	 * @param reason - The reason for the audit log.
	 * @throws A `DiscordAPIError` when Discord refuses a change.
	 */
	public async release(data: LockdownData, reason?: string) {
		this.remove(data);

		switch (data.type) {
			case LockdownType.Guild:
				return this.#releaseGuild(data, reason);
			case LockdownType.Channel:
				return this.#releaseChannel(data, reason);
			case LockdownType.Thread:
				return this.#releaseThread(data, reason);
		}
	}

	async #expire(key: string, data: LockdownData, attempt: number) {
		// Released or replaced in the meantime:
		if (this.#entries.get(key)?.data !== data) return;

		try {
			await this.release(data);
		} catch (error) {
			if (error instanceof DiscordAPIError) {
				if (!IgnoredReleaseErrors.has(error.code as RESTJSONErrorCodes))
					container.logger.error(`[Lockdown] Could not release ${key}:`, error);
				return;
			}

			// Discord did not answer, keep the lockdown and try again later:
			const unreachable = error instanceof HTTPError || (error instanceof Error && error.name === 'AbortError');
			if (unreachable && attempt < MaximumReleaseAttempts) {
				const timeout = setAccurateTimeout(() => void this.#expire(key, data, attempt + 1), ReleaseRetryDelay);
				this.#entries.set(key, { data, timeout });
				return;
			}

			container.logger.error(`[Lockdown] Could not release ${key}:`, error);
		}
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

	private static keyOf(target: LockdownTarget) {
		return target.type === LockdownType.Guild
			? `guild:${target.guildId}:${target.roleId}`
			: target.type === LockdownType.Channel
				? `channel:${target.channelId}:${target.roleId}`
				: `thread:${target.channelId}`;
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
