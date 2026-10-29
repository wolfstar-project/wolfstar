import { canManageServerSettingsFrom } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { AllFlowsPrecondition } from '@wolfstar/http-framework';
import type { InteractionHandler, Precondition } from '@wolfstar/http-framework';

/**
 * The interactions the check is made for: the ones that come from a guild have its ID and the member.
 */
interface GuildBound {
	guildId?: string | null;
	member?: GuildChatInputInteraction['member'];
}

/**
 * Lets the members who may manage the settings of the server run a command or use an interaction handler, the rule of
 * the dashboard, see `canManageServerSettings`. The denial is the one of the administrator level.
 */
export class UserPrecondition extends AllFlowsPrecondition {
	public override chatInputRun(interaction: Precondition.ChatInputInteraction) {
		return this.check(interaction, interaction.data.name);
	}

	public override contextMenuRun(interaction: Precondition.ContextMenuInteraction) {
		return this.check(interaction, interaction.data.name);
	}

	public override autocompleteRun(interaction: Precondition.AutocompleteInteraction) {
		return this.check(interaction, interaction.data.name);
	}

	public override interactionHandlerRun(interaction: Precondition.InteractionHandlerInteraction, handler: InteractionHandler) {
		return this.check(interaction, handler.name);
	}

	private async check(interaction: GuildBound, name: string) {
		const { guildId, member } = interaction;
		if (guildId && member && (await canManageServerSettingsFrom({ guildId, member }))) return this.ok();
		return this.error({ identifier: 'preconditions:administrator', context: { command: { name } } });
	}
}
