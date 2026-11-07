import { hasAppealAccessFrom } from '#lib/moderation/appealAccess';
import { AllFlowsPrecondition } from '@wolfstar/http-framework';
import type { InteractionHandler, Precondition } from '@wolfstar/http-framework';

/**
 * Lets who reviews the appeals run `/appeal` and use its components, see `isAppealManager`. It reads the member Discord
 * sent with the interaction and fetches nothing: a button may open a modal, which has to answer within three seconds.
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

	private async check(interaction: Pick<Precondition.ChatInputInteraction, 'guildId' | 'member'>, name: string) {
		const { guildId, member } = interaction;
		if (guildId && member && (await hasAppealAccessFrom({ guildId, member }))) return this.ok();

		this.container.logger.debug(`[Commands] ${name} denied in ${guildId}: preconditions:appealManager`);
		return this.error({ identifier: 'preconditions:appealManager', context: { command: { name } } });
	}
}
