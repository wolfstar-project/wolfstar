import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { AllFlowsPrecondition } from '@wolfstar/http-framework';
import type { InteractionHandler, Precondition } from '@wolfstar/http-framework';

/**
 * The interactions a permission level is checked for: the ones that come from a guild have its ID and the member.
 */
interface GuildBound {
	guildId?: string | null;
	member?: GuildChatInputInteraction['member'];
}

/**
 * A precondition that only lets the members of a permission level run a command, or use an interaction handler: the
 * `moderator` and `administrator` pieces of `src/preconditions`, named in the `preconditions` option.
 *
 * @remarks The level is applied the way {@linkcode hasCommandPermissionLevel} describes. A subcommand is run through its
 * parent, so the option goes on the parent command and covers every subcommand that has the same level. It also checks
 * the autocomplete of the command, so who cannot run it does not read what it suggests.
 */
export abstract class PermissionLevelPrecondition extends AllFlowsPrecondition {
	/**
	 * The level a member needs.
	 */
	protected abstract readonly level: CommandPermissionLevel;

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
		if (guildId && member && (await hasCommandPermissionLevel({ guildId, member }, this.level))) return this.ok();

		// The message is the one of the level, in the language of the member, which the listeners of the denials resolve:
		const identifier = this.level === CommandPermissionLevel.Administrator ? 'preconditions:administrator' : 'preconditions:moderator';
		return this.error({ identifier, context: { command: { name } } });
	}
}
