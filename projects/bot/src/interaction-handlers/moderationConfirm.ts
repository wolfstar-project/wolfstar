import type { ModerationCommand } from '#lib/moderation/structures/ModerationCommand';
// Loading it is also what gives every command `isModerationCommand`:
import { isModerationPromptAnswer } from '#lib/moderation/structures/ModerationCommand';
import { decodeRecentCaseId, takePendingRecentCaseCommand } from '#lib/moderation/structures/RecentCasePrompt';
import { createTranslator } from '#lib/structures/commands/utils';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction, container } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { renderStatus, renderStatusUpdate } from '#utils/status';

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
		const fail = (message: string) => interaction.reply(renderStatus('error', message));
		if (action === null || guildId === undefined || interaction instanceof ModalSubmitInteraction) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('moderationActions:recentCaseWrongUser'));

		const component = interaction as ComponentInteraction;
		// The prompt is a message with a `content` and buttons, which its outcome takes the place of, see `renderStatusUpdate`:
		const pending = await takePendingRecentCaseCommand(guildId, action.ownerId, action.promptId);
		if (action.verb === 'cancel') return component.update(renderStatusUpdate('info', t('moderationActions:recentCaseCancelled')));
		if (pending === null) return component.update(renderStatusUpdate('error', t('moderationActions:recentCaseExpired')));

		const command = container.stores.get('commands').find((piece) => piece.name === pending.command);
		if (!command?.isModerationCommand()) return component.update(renderStatusUpdate('error', t('moderationActions:recentCaseExpired')));

		// The action may take longer than Discord waits for an answer:
		const deferred = await component.deferUpdate();
		try {
			// Only the guild, the channel, the author and their language are read, which a click has as a command does:
			const answer = await command.execute(
				interaction as unknown as ModerationCommand.Interaction,
				pending.args as unknown as ModerationCommand.Arguments,
				{ confirmed: true }
			);
			// A prompt (a role to set up) is a classic message as this one is, and a status message empties what it had:
			if (isModerationPromptAnswer(answer)) return deferred.update({ components: [], embeds: [], ...answer, content: answer.content ?? '' });
			return deferred.update({ ...answer, content: '', embeds: [] });
		} catch (error) {
			this.container.logger.error('[Moderation] Could not run the command that was confirmed:', error);
			return deferred.update(renderStatusUpdate('error', t('events/errors:unexpectedError')));
		}
	}
}
