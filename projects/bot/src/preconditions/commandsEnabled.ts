import { readSettings } from '#lib/database';
import { findDisabledBy, ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import { isCommandOfDisabledModule } from '#lib/structures/commands/modules';
import {
	findMatchingRestrictions,
	getCommandRulesDenial,
	readCommandRestrictions,
	type CommandRestriction
} from '#lib/structures/commands-menu/restrictions';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { AllFlowsPrecondition, container } from '@wolfstar/http-framework';
import type { Command, Precondition } from '@wolfstar/http-framework';

/**
 * What the precondition reads of an interaction: the guild, where it was used and by whom.
 */
interface CommandUse {
	guildId?: string | null;
	channel?: { id: string; parent_id?: string | null } | null;
	member?: GuildChatInputInteraction['member'];
}

/**
 * Denies the commands a server disabled with `commands.disabled`, the ones of a module it turned off (`modules.*`, see
 * `ModerationModuleCommands`), and the ones it restricted to some channels or roles where or for whom they are not
 * allowed, which `/commands` edits.
 *
 * @remarks It is global, so it runs before every command. The commands that edit the settings are never denied, see
 * {@linkcode ProtectedCommands}. The restrictions do not apply to the administrators, so nobody who can edit them is
 * locked out by them; a disabled command is disabled for everybody.
 */
export class UserPrecondition extends AllFlowsPrecondition {
	public constructor(context: AllFlowsPrecondition.LoaderContext, options: AllFlowsPrecondition.Options) {
		super(context, { ...options, position: 10 });
	}

	public override chatInputRun(interaction: Precondition.ChatInputInteraction, command: Command) {
		return this.check(interaction, command);
	}

	public override contextMenuRun(interaction: Precondition.ContextMenuInteraction, command: Command) {
		return this.check(interaction, command);
	}

	private async check(interaction: CommandUse, command: Command) {
		const { guildId, member } = interaction;
		if (!guildId || ProtectedCommands.has(command.name)) return this.ok();

		const settings = await readSettings(guildId);
		if (findDisabledBy(settings.commandsDisabled, command) !== null) return this.error({ identifier: 'preconditions:disabledGuild' });
		if (isCommandOfDisabledModule(settings, command.name)) return this.error({ identifier: 'preconditions:disabledModuleModeration' });

		const matching = findMatchingRestrictions(readCommandRestrictions(settings.commandsRestrictions, guildId), command);
		if (matching.length === 0 || !member) return this.ok();

		// A thread is restricted as the channel it is in, and everybody has the role of the guild, the lowest:
		const { channel } = interaction;
		const channelIds = [channel?.id, channel?.parent_id].filter((id): id is string => typeof id === 'string');
		const roleIds = [...(await this.sortRoles(guildId, member.roles, matching)), guildId];
		const denial = getCommandRulesDenial(matching, { userId: member.user.id, channelIds, roleIds });
		if (denial === null) return this.ok();
		if (await hasCommandPermissionLevel({ guildId, member }, CommandPermissionLevel.Administrator)) return this.ok();

		return this.error({
			identifier:
				denial === 'channel'
					? 'preconditions:restrictedChannel'
					: denial === 'user'
						? 'preconditions:restrictedUser'
						: 'preconditions:restrictedRole'
		});
	}

	/**
	 * The roles of a member, highest first (by position, then the higher ID), since the highest one a rule names decides.
	 * The roles of the guild are only read when one of the rules names a role.
	 */
	private async sortRoles(guildId: string, roleIds: readonly string[], rules: readonly CommandRestriction[]): Promise<string[]> {
		if (!rules.some((rule) => rule.allowedRoles.length > 0 || rule.ignoredRoles.length > 0)) return [...roleIds];

		const held = new Set(roleIds);
		const roles = await container.gatewayClient.roles.fetchAll(guildId);
		return roles
			.filter((role) => held.has(role.id))
			.sort((a, b) => b.position - a.position || (BigInt(b.id) > BigInt(a.id) ? 1 : -1))
			.map((role) => role.id);
	}
}
