// Loading it is what gives every command `isModerationCommand`:
import type { ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
import '#lib/moderation/structures/ModerationCommand';
import { decodeRecentCaseId, takePendingRecentCaseCommand } from '#lib/moderation/structures/RecentCasePrompt';
import { createTranslator } from '#lib/structures/commands/utils';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction, container } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * Handles the prompt a moderator gets when the member already has a recent case, see
 * `lib/moderation/structures/RecentCasePrompt.ts`: `confirm` runs the command that waited for it, `cancel` forgets it.
 * Only the moderator who ran the command can answer, and the `moderator` precondition checks the level again.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['moderator'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeRecentCaseId(content);
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null || guildId === undefined || interaction instanceof ModalSubmitInteraction) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('moderationActions:recentCaseWrongUser'));

		const component = interaction as ComponentInteraction;
		const close = (message: string) => ({ content: message, components: [], embeds: [], allowed_mentions: { parse: [] } });
		const pending = await takePendingRecentCaseCommand(guildId, action.ownerId, action.promptId);
		if (action.verb === 'cancel') return component.update(close(t('moderationActions:recentCaseCancelled')));
		if (pending === null) return component.update(close(t('moderationActions:recentCaseExpired')));

		const command = container.stores.get('commands').find((piece) => piece.name === pending.command);
		if (!command?.isModerationCommand()) return component.update(close(t('moderationActions:recentCaseExpired')));

		// The action may take longer than Discord waits for an answer:
		const deferred = await component.deferUpdate();
		try {
			// Only the guild, the channel, the author and their language are read, which a click has as a command does:
			const answer = await command.execute(
				interaction as unknown as ModerationCommand.Interaction,
				pending.args as unknown as ModerationCommand.Arguments,
				{ confirmed: true }
			);
			return deferred.update({ components: [], ...answer, content: answer.content ?? '' });
		} catch (error) {
			this.container.logger.error('[Moderation] Could not run the command that was confirmed:', error);
			return deferred.update(close(t('events/errors:unexpectedError')));
		}
	}
}
