import { ApplyOptions } from '@wolfstar/decorators';
import { toErrorCodeResult } from '#common';
import { readSettings } from '#lib/database';
import {
	describeLockdownChannelOutcome,
	summarizeLockdownChannels,
	type LockdownChannelOutcome,
	type LockdownChannelResult
} from '#lib/moderation/lockdownChannels';
import { months } from 'wolfstar-shared';
import { createTranslator, type GuildChatInputInteraction, type Translator } from '#lib/structures/commands/utils';
import {
	LockdownGuildPermissions,
	LockdownType,
	getChannelLockdownPermissions,
	isLockdownChannel,
	isLockdownThread,
	lockdowns,
	type LockdownChannel,
	type LockdownData
} from '#lib/structures/managers/LockdownManager';
import { PermissionsBits } from 'wolfstar-shared';
import { resolveTimeSpan } from '#utils/resolvers';
import { getTag } from '#utils/util';
import { channelMention, roleMention } from '@discordjs/formatters';
import { Command, RegisterCommand, container } from '@wolfstar/http-framework';
import type { AnyThreadChannel, Role } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import {
	ApplicationIntegrationType,
	ChannelType,
	InteractionContextType,
	MessageFlags,
	OverwriteType,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
	type Snowflake
} from 'discord-api-types/v10';

const Root = 'commands/lockdown';

/**
 * The shortest and the longest a lockdown can last.
 */
const MinimumDuration = 30_000;
const MaximumDuration = months(1);

type LockdownTarget =
	| { readonly kind: 'guild' }
	| { readonly kind: 'configured' }
	| { readonly kind: 'channel'; readonly channel: LockdownChannel }
	| { readonly kind: 'thread'; readonly channel: AnyThreadChannel };

/**
 * Locks or unlocks a channel, a thread or the whole server for a role.
 *
 * @remarks
 *
 * - A channel is locked by denying the permissions to write, create threads and, for the voice-based ones and the
 *   categories, to connect, to the role. Unlocking gives back what the role had in the channel before.
 * - A thread is locked with its own lock.
 * - With `global`, the permissions to write are taken away from the role in the whole server instead.
 * - With `channels:configured`, every channel of `moderation.lockdown-channels` is locked, or unlocked, as `channel`
 *   locks one: a channel that fails does not stop the others, and the answer says what came of each.
 * - `role` defaults to `@everyone`, `channel` to the channel the command was run in, and `duration` only applies when
 *   locking.
 *
 * What a lockdown changed is kept by the `LockdownManager`, see there for what happens to the temporary
 * ones when the process restarts.
 */
@ApplyOptions<Command.Options>({ preconditions: ['moderator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, `${Root}:name`, `${Root}:description`)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:action`)
				.setChoices(
					createLocalizedChoice(`${Root}:actionLock`, { value: 'lock' }),
					createLocalizedChoice(`${Root}:actionUnlock`, { value: 'unlock' })
				)
				.setRequired(true)
		)
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:role`).setRequired(false))
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `${Root}:channel`)
				.addChannelTypes(
					ChannelType.GuildText,
					ChannelType.GuildAnnouncement,
					ChannelType.GuildVoice,
					ChannelType.GuildStageVoice,
					ChannelType.GuildCategory,
					ChannelType.GuildForum,
					ChannelType.GuildMedia,
					ChannelType.PublicThread,
					ChannelType.PrivateThread,
					ChannelType.AnnouncementThread
				)
				.setRequired(false)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:duration`).setRequired(false))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:global`).setRequired(false))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:channels`)
				.setChoices(createLocalizedChoice(`${Root}:channelsConfigured`, { value: 'configured' }))
				.setRequired(false)
		)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: Command.OptionsOf<'lockdown'>) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

		let duration: number | null = null;
		if (args.action === 'lock' && args.duration !== undefined) {
			const result = resolveTimeSpan(args.duration, { minimum: MinimumDuration, maximum: MaximumDuration });
			if (result.isErr()) {
				return fail(t(result.unwrapErr(), { parameter: args.duration, minimum: MinimumDuration, maximum: MaximumDuration }));
			}

			duration = result.unwrap();
		}

		const target = await this.resolveTarget(interaction, args);
		if (target === null) return fail(t(`${Root}:channelUnknownChannel`, { channel: channelMention(args.channel?.id ?? interaction.channel.id) }));

		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const user = interaction.user;
		const roleId = args.role?.id ?? interaction.guildId;
		const content =
			args.action === 'lock'
				? await this.lock(t, interaction.guildId, user, roleId, target, duration)
				: await this.unlock(t, interaction.guildId, user, roleId, target);
		return deferred.update({ content });
	}

	private lock(
		t: Translator,
		guildId: Snowflake,
		user: GuildChatInputInteraction['user'],
		roleId: Snowflake,
		target: LockdownTarget,
		duration: number | null
	) {
		const reason = t(`${Root}:auditLogLockRequestedBy`, { user: getTag(user) });
		switch (target.kind) {
			case 'guild':
				return this.lockGuild(t, guildId, user.id, roleId, reason, duration);
			case 'configured':
				return this.changeConfigured(t, guildId, user.id, roleId, reason, 'lock', duration);
			case 'thread':
				return this.lockThread(t, user.id, target.channel, reason, duration);
			case 'channel':
				return this.lockChannel(user.id, target.channel, roleId, reason, duration).then((outcome) =>
					describeLockdownChannelOutcome(t, 'lock', outcome, target.channel.id, roleId)
				);
		}
	}

	private unlock(t: Translator, guildId: Snowflake, user: GuildChatInputInteraction['user'], roleId: Snowflake, target: LockdownTarget) {
		const reason = t(`${Root}:auditLogUnlockRequestedBy`, { user: getTag(user) });
		switch (target.kind) {
			case 'guild':
				return this.unlockGuild(t, guildId, user.id, roleId, reason);
			case 'configured':
				return this.changeConfigured(t, guildId, user.id, roleId, reason, 'unlock', null);
			case 'thread':
				return this.unlockThread(t, guildId, user.id, target.channel, reason);
			case 'channel':
				return this.unlockChannel(user.id, target.channel, roleId, reason).then((outcome) =>
					describeLockdownChannelOutcome(t, 'unlock', outcome, target.channel.id, roleId)
				);
		}
	}

	// Server

	private async lockGuild(t: Translator, guildId: Snowflake, userId: Snowflake, roleId: Snowflake, reason: string, duration: number | null) {
		const role = await this.fetchRole(guildId, roleId);
		const mention = roleMention(roleId);
		if (role === null) return t(`${Root}:guildUnknownRole`, { role: mention });

		// Locked means none of the permissions is left:
		const permissionsOriginal = role.permissions.bitField & LockdownGuildPermissions;
		if (permissionsOriginal === 0n) return t(`${Root}:guildLocked`, { role: mention });

		// What the lockdown changes is remembered, and its release scheduled, before anything is changed: if either
		// fails, nobody is locked out without a way back.
		const data: LockdownData = {
			type: LockdownType.Guild,
			guildId,
			userId,
			roleId,
			permissionsApplied: LockdownGuildPermissions,
			permissionsOriginal
		};
		await lockdowns.add(data, duration);

		const result = await toErrorCodeResult(role.setPermissions(role.permissions.bitField & ~LockdownGuildPermissions, reason));
		if (result.isErr()) {
			await lockdowns.remove(data);
			return this.guildError(t, role, result.unwrapErr(), 'guildLockFailed');
		}

		return t(`${Root}:successGuild`, { role: mention });
	}

	private async unlockGuild(t: Translator, guildId: Snowflake, userId: Snowflake, roleId: Snowflake, reason: string) {
		const role = await this.fetchRole(guildId, roleId);
		const mention = roleMention(roleId);
		if (role === null) return t(`${Root}:guildUnknownRole`, { role: mention });

		if ((role.permissions.bitField & LockdownGuildPermissions) === LockdownGuildPermissions) return t(`${Root}:guildUnlocked`, { role: mention });

		// Without what the lockdown changed, give all of them back:
		const data: LockdownData = (await lockdowns.get({ type: LockdownType.Guild, guildId, roleId })) ?? {
			type: LockdownType.Guild,
			guildId,
			userId,
			roleId,
			permissionsApplied: LockdownGuildPermissions,
			permissionsOriginal: LockdownGuildPermissions
		};
		const result = await toErrorCodeResult(lockdowns.release(data, reason));
		if (result.isErr()) return this.guildError(t, role, result.unwrapErr(), 'guildUnlockFailed');

		return t(`${Root}:successGuild`, { role: mention });
	}

	private guildError(t: Translator, role: Role, code: RESTJSONErrorCodes, failed: 'guildLockFailed' | 'guildUnlockFailed') {
		const mention = roleMention(role.id);
		if (code === RESTJSONErrorCodes.UnknownRole) return t(`${Root}:guildUnknownRole`, { role: mention });
		if (code === RESTJSONErrorCodes.MissingPermissions || code === RESTJSONErrorCodes.MissingAccess)
			return t(`${Root}:guildUnmanageable`, { role: mention });

		container.logger.error(`[Lockdown] Discord answered ${code} while changing the role ${role.id}`);
		return t(`${Root}:${failed}`, { role: mention });
	}

	// Threads

	private async lockThread(t: Translator, userId: Snowflake, channel: AnyThreadChannel, reason: string, duration: number | null) {
		const mention = channelMention(channel.id);
		if (channel.locked) return t(`${Root}:threadLocked`, { channel: mention });
		if (!(await this.canManage(channel.guildId, channel, PermissionFlagsBits.ManageThreads)))
			return t(`${Root}:threadUnmanageable`, { channel: mention });

		// Remembered before the thread is locked, see `lockGuild`:
		const data: LockdownData = { type: LockdownType.Thread, guildId: channel.guildId, userId, channelId: channel.id };
		await lockdowns.add(data, duration);

		const result = await toErrorCodeResult(Promise.resolve(channel.setLocked(true, reason)).then(() => undefined));
		if (result.isErr()) {
			await lockdowns.remove(data);
			return this.channelError(t, mention, result.unwrapErr(), 'threadLockFailed');
		}

		return t(`${Root}:successThread`, { channel: mention });
	}

	private async unlockThread(t: Translator, guildId: Snowflake, userId: Snowflake, channel: AnyThreadChannel, reason: string) {
		const mention = channelMention(channel.id);
		if (!channel.locked) return t(`${Root}:threadUnlocked`, { channel: mention });
		if (!(await this.canManage(guildId, channel, PermissionFlagsBits.ManageThreads)))
			return t(`${Root}:threadUnmanageable`, { channel: mention });

		const data: LockdownData = { type: LockdownType.Thread, guildId, userId, channelId: channel.id };
		const result = await toErrorCodeResult(lockdowns.release(data, reason));
		if (result.isErr()) return this.channelError(t, mention, result.unwrapErr(), 'threadUnlockFailed');

		return t(`${Root}:successThread`, { channel: mention });
	}

	// Channels

	/**
	 * Locks down, or unlocks, every channel of `moderation.lockdown-channels`, one after the other, and answers with what
	 * came of all of them. A channel that is gone, or that is no longer one a lockdown applies to, is reported and left
	 * alone; the list forgets it when it is deleted (`channelDelete`).
	 */
	private async changeConfigured(
		t: Translator,
		guildId: Snowflake,
		userId: Snowflake,
		roleId: Snowflake,
		reason: string,
		action: 'lock' | 'unlock',
		duration: number | null
	) {
		const settings = await readSettings(guildId);
		const channelIds = settings.moderationLockdownChannels;
		if (channelIds.length === 0) return t(`${Root}:configuredEmpty`);

		const results: LockdownChannelResult[] = [];
		for (const channelId of channelIds) {
			const channel = await container.gatewayClient.channels.fetch(channelId).catch(() => null);
			const outcome: LockdownChannelOutcome =
				channel === null || !isLockdownChannel(channel)
					? 'unknown'
					: action === 'lock'
						? await this.lockChannel(userId, channel, roleId, reason, duration)
						: await this.unlockChannel(userId, channel, roleId, reason);
			results.push({ channelId, outcome });
		}

		container.logger.debug(
			`[Lockdown] ${action} of the configured channels of ${guildId} for ${roleId}: ${results.map((result) => `${result.channelId}=${result.outcome}`).join(', ')}`
		);
		return summarizeLockdownChannels(t, action, roleId, results);
	}

	private async lockChannel(
		userId: Snowflake,
		channel: LockdownChannel,
		roleId: Snowflake,
		reason: string,
		duration: number | null
	): Promise<LockdownChannelOutcome> {
		const permissionsApplied = getChannelLockdownPermissions(channel.type);

		// Locked means none of the permissions is left in the channel:
		const effective = await channel.permissionsFor(roleId);
		if ((effective.bitField & permissionsApplied) === 0n) return 'already';
		if (!(await this.canManage(channel.guildId, channel, PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles))) {
			return 'unmanageable';
		}

		const existing = channel.permissionOverwrites.resolve(roleId);
		const permissionsOriginalAllow = (existing?.allow.bitField ?? 0n) & permissionsApplied;
		const permissionsOriginalDeny = (existing?.deny.bitField ?? 0n) & permissionsApplied;

		// Remembered before the channel is locked, see `lockGuild`:
		const data: LockdownData = {
			type: LockdownType.Channel,
			guildId: channel.guildId,
			userId,
			channelId: channel.id,
			roleId,
			permissionsApplied,
			permissionsOriginalAllow,
			permissionsOriginalDeny
		};
		await lockdowns.add(data, duration);

		const deny = Object.fromEntries(PermissionsBits.toArray(permissionsApplied).map((name) => [name, false]));
		const result = await toErrorCodeResult(channel.permissionOverwrites.edit(roleId, deny, { type: OverwriteType.Role, reason }));
		if (result.isErr()) {
			await lockdowns.remove(data);
			return this.channelOutcome(channel.id, result.unwrapErr());
		}

		return 'done';
	}

	private async unlockChannel(userId: Snowflake, channel: LockdownChannel, roleId: Snowflake, reason: string): Promise<LockdownChannelOutcome> {
		const permissionsApplied = getChannelLockdownPermissions(channel.type);

		const effective = await channel.permissionsFor(roleId);
		if ((effective.bitField & permissionsApplied) === permissionsApplied) return 'already';
		if (!(await this.canManage(channel.guildId, channel, PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles))) {
			return 'unmanageable';
		}

		// Without what the lockdown changed, reset the permissions that were applied to the default state:
		const data: LockdownData = (await lockdowns.get({ type: LockdownType.Channel, channelId: channel.id, roleId })) ?? {
			type: LockdownType.Channel,
			guildId: channel.guildId,
			userId,
			channelId: channel.id,
			roleId,
			permissionsApplied,
			permissionsOriginalAllow: 0n,
			permissionsOriginalDeny: 0n
		};
		const result = await toErrorCodeResult(lockdowns.release(data, reason));
		if (result.isErr()) return this.channelOutcome(channel.id, result.unwrapErr());

		return 'done';
	}

	/**
	 * What the refusal of Discord means for a channel, see {@linkcode LockdownChannelOutcome}.
	 */
	private channelOutcome(channelId: Snowflake, code: RESTJSONErrorCodes): LockdownChannelOutcome {
		if (code === RESTJSONErrorCodes.UnknownChannel) return 'unknown';
		if (code === RESTJSONErrorCodes.MissingPermissions || code === RESTJSONErrorCodes.MissingAccess) return 'unmanageable';

		container.logger.error(`[Lockdown] Discord answered ${code} while changing ${channelId}`);
		return 'failed';
	}

	private channelError(t: Translator, mention: string, code: RESTJSONErrorCodes, failed: 'threadLockFailed' | 'threadUnlockFailed') {
		if (code === RESTJSONErrorCodes.UnknownChannel) return t(`${Root}:threadUnknownChannel`, { channel: mention });
		if (code === RESTJSONErrorCodes.MissingPermissions || code === RESTJSONErrorCodes.MissingAccess)
			return t(`${Root}:threadUnmanageable`, { channel: mention });

		container.logger.error(`[Lockdown] Discord answered ${code} while changing ${mention}`);
		return t(`${Root}:${failed}`, { channel: mention });
	}

	// Resolution

	/**
	 * Resolves what to lock: the channels of `moderation.lockdown-channels` with `channels:configured`, the whole server
	 * with `global`, otherwise the `channel` option or the channel the command was run in.
	 *
	 * @returns The target, or `null` when the channel is not one that can be locked down.
	 */
	private async resolveTarget(interaction: GuildChatInputInteraction, args: Command.OptionsOf<'lockdown'>): Promise<LockdownTarget | null> {
		if (args.channels === 'configured') return { kind: 'configured' };

		const channelId = args.channel?.id ?? (args.global ? undefined : interaction.channel.id);
		if (channelId === undefined) return { kind: 'guild' };

		const channel = await container.gatewayClient.channels.fetch(channelId).catch(() => null);
		if (channel === null) return null;
		if (isLockdownThread(channel)) return { kind: 'thread', channel };
		return isLockdownChannel(channel) ? { kind: 'channel', channel } : null;
	}

	private async fetchRole(guildId: Snowflake, roleId: Snowflake): Promise<Role | null> {
		const roles = await container.gatewayClient.roles.fetchAll(guildId);
		return roles.find((role) => role.id === roleId) ?? null;
	}

	/**
	 * Checks whether the bot has permissions in a channel, or in the parent of a thread, which has no overwrites of its own.
	 */
	private async canManage(guildId: Snowflake, channel: LockdownChannel | AnyThreadChannel, permissions: bigint) {
		const target = isLockdownThread(channel) ? await this.fetchParent(channel) : channel;
		// Let Discord answer when the parent is unknown:
		if (target === null) return true;

		const me = await container.gatewayClient.members.fetchMe(guildId);
		const effective = await target.permissionsFor(me);
		return (effective.bitField & permissions) === permissions;
	}

	private async fetchParent(thread: AnyThreadChannel): Promise<LockdownChannel | null> {
		if (!thread.parentId) return null;

		const parent = await container.gatewayClient.channels.fetch(thread.parentId).catch(() => null);
		return parent !== null && isLockdownChannel(parent) ? parent : null;
	}
}
