import { months, toErrorCodeResult } from '#common';
import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
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
import { PermissionsBits } from '#utils/bits';
import { resolveTimeSpan } from '#utils/resolvers';
import { getTag } from '#utils/util';
import { channelMention, roleMention } from '@discordjs/formatters';
import { Command, RegisterCommand, container, type TransformedArguments } from '@wolfstar/http-framework';
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

interface Arguments {
	action: 'lock' | 'unlock';
	role?: TransformedArguments.Role;
	channel?: TransformedArguments.Channel;
	duration?: string;
	global?: boolean;
}

type LockdownTarget =
	| { readonly kind: 'guild' }
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
 * - `role` defaults to `@everyone`, `channel` to the channel the command was run in, and `duration` only applies when
 *   locking.
 *
 * What a lockdown changed is kept by the `LockdownManager`, see there for what happens to the temporary
 * ones when the process restarts.
 */
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
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

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
		if (target === null)
			return fail(t(`${Root}:channelUnknownChannel`, { channel: channelMention(args.channel?.id ?? interaction.channelId ?? '') }));

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
			case 'thread':
				return this.lockThread(t, user.id, target.channel, reason, duration);
			case 'channel':
				return this.lockChannel(t, user.id, target.channel, roleId, reason, duration);
		}
	}

	private unlock(t: Translator, guildId: Snowflake, user: GuildChatInputInteraction['user'], roleId: Snowflake, target: LockdownTarget) {
		const reason = t(`${Root}:auditLogUnlockRequestedBy`, { user: getTag(user) });
		switch (target.kind) {
			case 'guild':
				return this.unlockGuild(t, guildId, user.id, roleId, reason);
			case 'thread':
				return this.unlockThread(t, guildId, user.id, target.channel, reason);
			case 'channel':
				return this.unlockChannel(t, user.id, target.channel, roleId, reason);
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

		const result = await toErrorCodeResult(role.setPermissions(role.permissions.bitField & ~LockdownGuildPermissions, reason));
		if (result.isErr()) return this.guildError(t, role, result.unwrapErr(), 'guildLockFailed');

		await lockdowns.add(
			{ type: LockdownType.Guild, guildId, userId, roleId, permissionsApplied: LockdownGuildPermissions, permissionsOriginal },
			duration
		);
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

		const result = await toErrorCodeResult(Promise.resolve(channel.setLocked(true, reason)).then(() => undefined));
		if (result.isErr()) return this.channelError(t, mention, result.unwrapErr(), 'thread', 'threadLockFailed');

		await lockdowns.add({ type: LockdownType.Thread, guildId: channel.guildId, userId, channelId: channel.id }, duration);
		return t(`${Root}:successThread`, { channel: mention });
	}

	private async unlockThread(t: Translator, guildId: Snowflake, userId: Snowflake, channel: AnyThreadChannel, reason: string) {
		const mention = channelMention(channel.id);
		if (!channel.locked) return t(`${Root}:threadUnlocked`, { channel: mention });
		if (!(await this.canManage(guildId, channel, PermissionFlagsBits.ManageThreads)))
			return t(`${Root}:threadUnmanageable`, { channel: mention });

		const data: LockdownData = { type: LockdownType.Thread, guildId, userId, channelId: channel.id };
		const result = await toErrorCodeResult(lockdowns.release(data, reason));
		if (result.isErr()) return this.channelError(t, mention, result.unwrapErr(), 'thread', 'threadUnlockFailed');

		return t(`${Root}:successThread`, { channel: mention });
	}

	// Channels

	private async lockChannel(
		t: Translator,
		userId: Snowflake,
		channel: LockdownChannel,
		roleId: Snowflake,
		reason: string,
		duration: number | null
	) {
		const mention = channelMention(channel.id);
		const role = roleMention(roleId);
		const permissionsApplied = getChannelLockdownPermissions(channel.type);

		// Locked means none of the permissions is left in the channel:
		const effective = await channel.fetchPermissionsFor(roleId);
		if ((effective.bitField & permissionsApplied) === 0n) return t(`${Root}:channelLocked`, { channel: mention, role });
		if (!(await this.canManage(channel.guildId, channel, PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles))) {
			return t(`${Root}:channelUnmanageable`, { channel: mention });
		}

		const existing = channel.permissionOverwrites.resolve(roleId);
		const permissionsOriginalAllow = (existing?.allow.bitField ?? 0n) & permissionsApplied;
		const permissionsOriginalDeny = (existing?.deny.bitField ?? 0n) & permissionsApplied;

		const deny = Object.fromEntries(PermissionsBits.toArray(permissionsApplied).map((name) => [name, false]));
		const result = await toErrorCodeResult(channel.permissionOverwrites.edit(roleId, deny, { type: OverwriteType.Role, reason }));
		if (result.isErr()) return this.channelError(t, mention, result.unwrapErr(), 'channel', 'channelLockFailed');

		await lockdowns.add(
			{
				type: LockdownType.Channel,
				guildId: channel.guildId,
				userId,
				channelId: channel.id,
				roleId,
				permissionsApplied,
				permissionsOriginalAllow,
				permissionsOriginalDeny
			},
			duration
		);
		return t(`${Root}:successChannel`, { channel: mention, role });
	}

	private async unlockChannel(t: Translator, userId: Snowflake, channel: LockdownChannel, roleId: Snowflake, reason: string) {
		const mention = channelMention(channel.id);
		const role = roleMention(roleId);
		const permissionsApplied = getChannelLockdownPermissions(channel.type);

		const effective = await channel.fetchPermissionsFor(roleId);
		if ((effective.bitField & permissionsApplied) === permissionsApplied) return t(`${Root}:channelUnlocked`, { channel: mention, role });
		if (!(await this.canManage(channel.guildId, channel, PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles))) {
			return t(`${Root}:channelUnmanageable`, { channel: mention });
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
		if (result.isErr()) return this.channelError(t, mention, result.unwrapErr(), 'channel', 'channelUnlockFailed');

		return t(`${Root}:successChannel`, { channel: mention, role });
	}

	private channelError(
		t: Translator,
		mention: string,
		code: RESTJSONErrorCodes,
		kind: 'channel' | 'thread',
		failed: 'channelLockFailed' | 'channelUnlockFailed' | 'threadLockFailed' | 'threadUnlockFailed'
	) {
		if (code === RESTJSONErrorCodes.UnknownChannel) return t(`${Root}:${kind}UnknownChannel`, { channel: mention });
		if (code === RESTJSONErrorCodes.MissingPermissions || code === RESTJSONErrorCodes.MissingAccess)
			return t(`${Root}:${kind}Unmanageable`, { channel: mention });

		container.logger.error(`[Lockdown] Discord answered ${code} while changing ${mention}`);
		return t(`${Root}:${failed}`, { channel: mention });
	}

	// Resolution

	/**
	 * Resolves what to lock: the whole server with `global`, otherwise the `channel` option or the channel the command
	 * was run in.
	 *
	 * @returns The target, or `null` when the channel is not one that can be locked down.
	 */
	private async resolveTarget(interaction: GuildChatInputInteraction, args: Arguments): Promise<LockdownTarget | null> {
		const channelId = args.channel?.id ?? (args.global ? undefined : interaction.channelId);
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
		const effective = await target.fetchPermissionsFor(me);
		return (effective.bitField & permissions) === permissions;
	}

	private async fetchParent(thread: AnyThreadChannel): Promise<LockdownChannel | null> {
		if (!thread.parentId) return null;

		const parent = await container.gatewayClient.channels.fetch(thread.parentId).catch(() => null);
		return parent !== null && isLockdownChannel(parent) ? parent : null;
	}
}
