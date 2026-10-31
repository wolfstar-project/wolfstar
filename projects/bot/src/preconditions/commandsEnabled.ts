import { readSettings } from '#lib/database';
import { findDisabledBy, ProtectedCommands } from '#lib/structures/commands-menu/disabled';
import { getDisabledModuleDenial } from '#lib/structures/commands/modules';
import {
	findMatchingRestrictions,
	getCommandRulesDenial,
	readCommandRestrictions,
	type CommandRestriction
} from '#lib/structures/commands-menu/restrictions';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { isNullish } from '@sapphire/utilities';
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
 * `getDisabledModuleDenial`), and the ones it restricted to some channels or roles where or for whom they are not
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
		const moduleDenial = getDisabledModuleDenial(settings, command.name);
		if (moduleDenial !== null) return this.error({ identifier: moduleDenial });

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
	 * The roles of a member that a rule names, highest first (by position, then the higher ID), since the highest one
	 * decides. This runs before every command a rule covers, so a request to Discord is the last resort: one role has no
	 * order to find, and the positions come from the cache.
	 */
	private async sortRoles(guildId: string, roleIds: readonly string[], rules: readonly CommandRestriction[]): Promise<string[]> {
		const named = new Set(rules.flatMap((rule) => [...rule.allowedRoles, ...rule.ignoredRoles]));
		const held = roleIds.filter((id) => named.has(id));
		if (held.length < 2) return held;

		const { roles } = container.gatewayClient;
		const cached = await Promise.all(held.map((id) => roles.cache.get(roles.resolveKey(guildId, id))));
		const known = cached.every((role) => !isNullish(role)) ? cached : (await roles.fetchAll(guildId)).filter((role) => held.includes(role.id));
		return known.sort((a, b) => b.position - a.position || (BigInt(b.id) > BigInt(a.id) ? 1 : -1)).map((role) => role.id);
	}
}
