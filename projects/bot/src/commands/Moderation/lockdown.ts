import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction, type Translator } from '#lib/structures/commands/utils';
import { floatPromise } from '#utils/common';
import { resolveTimeSpan } from '#utils/resolvers';
import { clearAccurateTimeout, setAccurateTimeout, type AccurateTimeout } from '#utils/Timers';
import { channelMention } from '@discordjs/formatters';
import { Command, RegisterCommand, container, type TransformedArguments } from '@wolfstar/http-framework';
import type { AnnouncementChannel, PermissionsString, TextChannel } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import {
	ApplicationIntegrationType,
	ChannelType,
	InteractionContextType,
	MessageFlags,
	OverwriteType,
	PermissionFlagsBits
} from 'discord-api-types/v10';

type LockableChannel = TextChannel | AnnouncementChannel;

/**
 * The longest a lockdown can last, `setTimeout` fires immediately for a delay that does not fit in 32 bits.
 */
const MaximumDuration = 2 ** 31 - 1;

const RequiredClientPermissions = ['ManageChannels', 'ManageRoles'] as const satisfies readonly PermissionsString[];

interface LockdownEntry {
	/**
	 * What the `SendMessages` permission was before the lockdown, `null` when the role had no override for it.
	 */
	allowed: boolean | null;

	/**
	 * The timer that releases the lockdown, `null` for a lockdown that lasts until it is released by hand.
	 */
	timeout: AccurateTimeout | null;
}

interface Arguments {
	action?: 'lock' | 'unlock';
	role?: TransformedArguments.Role;
	channel?: TransformedArguments.Channel;
	duration?: string;
}

/**
 * Locks or unlocks a channel for a role by toggling the `SendMessages` permission override.
 *
 * @remarks
 *
 * The `action` option is `lock`, `unlock`, or empty to toggle the lockdown. `role` defaults to `@everyone`, `channel` to the channel the
 * command was run in, and `duration` only applies when the channel gets locked.
 *
 * The lockdowns started by the command are tracked in this module, since `GuildSecurity#lockdowns` (the
 * `LockdownManager`) is not ported to the gateway structures yet. A channel that has a denied `SendMessages`
 * override for the role is also considered locked, even if the lockdown was not started by this process.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/moderation:lockdown')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, 'commands/moderation:lockdownOptionsAction')
				.setChoices(
					createLocalizedChoice('commands/moderation:lockdownOptionsActionChoiceLock', { value: 'lock' }),
					createLocalizedChoice('commands/moderation:lockdownOptionsActionChoiceUnlock', { value: 'unlock' })
				)
				.setRequired(false)
		)
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(false))
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, 'commands/shared:optionsChannel')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsDuration').setRequired(false))
)
export class UserCommand extends Command {
	/**
	 * The lockdowns started by this command, by channel ID and then by role ID.
	 */
	private static readonly lockdowns = new Map<string, Map<string, LockdownEntry>>();

	public override async chatInputRun(interaction: GuildChatInputInteraction, args: Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

		const channel = await this.resolveChannel(interaction, args);
		if (channel === null) return fail(t('preconditions:guildTextOnly'));

		// Both permissions are needed in the channel to edit its overrides:
		const missing = await this.getMissingClientPermissions(interaction.guildId, channel);
		if (missing.length > 0) return fail(t('preconditions:clientPermissions', { missing }));

		const roleId = args.role?.id ?? interaction.guildId;
		const mention = channelMention(channel.id);
		const lock = this.getLock(roleId, channel);

		// An empty action toggles, `lock` and `unlock` fail when the channel is already in the requested state:
		const unlock = args.action === undefined ? lock !== null : args.action === 'unlock';
		if (unlock) {
			if (lock === null) return fail(t('commands/moderation:lockdownUnlocked', { channel: mention }));

			const deferred = await interaction.defer();
			if (lock.timeout) clearAccurateTimeout(lock.timeout);
			await this.performUnlock(roleId, channel, lock.allowed);
			return deferred.update({ content: t('commands/moderation:lockdownOpen', { channel: mention }) });
		}

		if (lock !== null) return fail(t('commands/moderation:lockdownLocked', { channel: mention }));

		let duration: number | null = null;
		if (args.duration !== undefined) {
			const result = resolveTimeSpan(args.duration, { minimum: 0, maximum: MaximumDuration });
			if (result.isErr()) {
				return fail(t(result.unwrapErr(), { parameter: args.duration, minimum: 0, maximum: MaximumDuration }));
			}

			duration = result.unwrap();
		}

		const deferred = await interaction.defer();
		await this.performLock(t, roleId, channel, duration);
		return deferred.update({ content: t('commands/moderation:lockdownLock', { channel: mention }) });
	}

	private async performLock(t: Translator, roleId: string, channel: LockableChannel, duration: number | null) {
		const allowed = this.isAllowed(roleId, channel);
		await channel.permissionOverwrites.edit(roleId, { SendMessages: false }, { type: OverwriteType.Role });

		// Create the timeout, which announces the release in the channel since there is no command to answer anymore:
		const timeout = duration ? setAccurateTimeout(() => floatPromise(this.releaseLockdown(t, roleId, channel, allowed)), duration) : null;
		this.addLock(roleId, channel, { allowed, timeout });
	}

	private async releaseLockdown(t: Translator, roleId: string, channel: LockableChannel, allowed: boolean | null) {
		await this.performUnlock(roleId, channel, allowed);

		// The bot may not be able to write in the channel:
		await channel.send(t('commands/moderation:lockdownOpen', { channel: channelMention(channel.id) })).catch(() => null);
	}

	private async performUnlock(roleId: string, channel: LockableChannel, allowed: boolean | null) {
		this.removeLock(roleId, channel);

		const overwrites = channel.permissionOverwrites.resolve(roleId);
		if (overwrites === null) return;

		// If the only permission overwrite is the denied SendMessages, clean up the entire permission; if the permission
		// was denied, reset it to the default state, otherwise don't run an extra query
		if (overwrites.allow.bitField === 0n && overwrites.deny.bitField === PermissionFlagsBits.SendMessages) {
			await overwrites.delete();
		} else if (overwrites.deny.has(PermissionFlagsBits.SendMessages)) {
			await overwrites.edit({ SendMessages: allowed });
		}
	}

	private isAllowed(roleId: string, channel: LockableChannel): boolean | null {
		return channel.permissionOverwrites.resolve(roleId)?.allow.has(PermissionFlagsBits.SendMessages, false) ?? null;
	}

	private getLock(roleId: string, channel: LockableChannel): LockdownEntry | null {
		const entry = UserCommand.lockdowns.get(channel.id)?.get(roleId);
		if (entry) return entry;

		const denied = channel.permissionOverwrites.resolve(roleId)?.deny.has(PermissionFlagsBits.SendMessages);
		return denied === true ? { allowed: null, timeout: null } : null;
	}

	private addLock(roleId: string, channel: LockableChannel, entry: LockdownEntry) {
		let roles = UserCommand.lockdowns.get(channel.id);
		if (roles === undefined) {
			roles = new Map();
			UserCommand.lockdowns.set(channel.id, roles);
		}

		roles.get(roleId)?.timeout?.stop();
		roles.set(roleId, entry);
	}

	private removeLock(roleId: string, channel: LockableChannel) {
		const roles = UserCommand.lockdowns.get(channel.id);
		if (roles === undefined) return;

		roles.get(roleId)?.timeout?.stop();
		roles.delete(roleId);
		if (roles.size === 0) UserCommand.lockdowns.delete(channel.id);
	}

	/**
	 * Resolves the channel to lock, the `channel` option or the one the command was run in.
	 *
	 * @returns The channel, or `null` when it is not a text or announcement channel (a thread has no overrides).
	 */
	private async resolveChannel(interaction: GuildChatInputInteraction, args: Arguments): Promise<LockableChannel | null> {
		const channelId = args.channel?.id ?? interaction.channelId;
		if (channelId === undefined) return null;

		const channel = await container.gatewayClient.channels.fetch(channelId);
		return channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement ? (channel as LockableChannel) : null;
	}

	private async getMissingClientPermissions(guildId: string, channel: LockableChannel) {
		const me = await container.gatewayClient.members.fetchMe(guildId);
		const permissions = await channel.fetchPermissionsFor(me);
		return RequiredClientPermissions.filter((permission) => !permissions.has(permission));
	}
}
