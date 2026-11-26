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
		const fail = (message: string) => interaction.reply(renderStatus('error', message));
		if (action === null || guildId === undefined || interaction instanceof ModalSubmitInteraction) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (interaction.user.id !== action.ownerId) return fail(t('moderationActions:recentCaseWrongUser'));

		const component = interaction as ComponentInteraction;
		// The prompt is a status message with its buttons, which its outcome takes the place of. A prompt sent before it was
		// one is a classic message with a `content`, which the status has to empty:
		const legacy = ((component.message.flags ?? 0) & MessageFlags.IsComponentsV2) === 0;
		const status = (kind: 'info' | 'error', text: string) =>
			legacy ? renderStatusUpdate(kind, text) : renderStatus(kind, text, { ephemeral: false });
		const update = (kind: 'info' | 'error', text: string) => component.update(status(kind, text));
		const pending = await takePendingRecentCaseCommand(guildId, action.ownerId, action.promptId);
		if (action.verb === 'cancel') return update('info', t('moderationActions:recentCaseCancelled'));
		if (pending === null) return update('error', t('moderationActions:recentCaseExpired'));

		const command = container.stores.get('commands').find((piece) => piece.name === pending.command);
		if (!command?.isModerationCommand()) return update('error', t('moderationActions:recentCaseExpired'));

		// The action may take longer than Discord waits for an answer:
		const deferred = await component.deferUpdate();
		try {
			// Only the guild, the channel, the author and their language are read, which a click has as a command does:
			const answer = await command.execute(
				interaction as unknown as ModerationCommand.Interaction,
				pending.args as unknown as ModerationCommand.Arguments,
				{ confirmed: true }
			);
			// The prompt of a role to set up is a classic message, which a message of components cannot become: it is sent
			// apart, under this one. It only comes when the role was deleted since the command was run.
			if (isModerationPromptAnswer(answer)) {
				await deferred.update(status('info', t('moderationActions:recentCaseFollowUp')));
				return interaction.followup({ ...answer, flags: MessageFlags.Ephemeral });
			}

			return deferred.update(legacy ? { ...answer, content: '', embeds: [] } : answer);
		} catch (error) {
			this.container.logger.error('[Moderation] Could not run the command that was confirmed:', error);
			return deferred.update(status('error', t('events/errors:unexpectedError')));
		}
	}
}
