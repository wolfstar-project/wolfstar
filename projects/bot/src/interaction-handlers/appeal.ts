import { readSettings } from '#lib/database';
import { AppealableTypes, decodeAppealId, encodeAppealId, type AppealableType } from '#lib/moderation/appeals';
import { applyAppealDecision, getAppealQuestions, renderAppealMessage } from '#lib/moderation/appealService';
import { fetchGuildT } from '#lib/moderation/common/util';
import { createTranslator } from '#lib/structures/commands/utils';
import { getModeration } from '#utils/functions';
import { getModalValue } from '#utils/interactions';
import { cutText } from '@sapphire/utilities';
import { ApplyOptions } from '@wolfstar/decorators';
import { InteractionHandler, ModalSubmitInteraction } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ComponentType, MessageFlags, TextInputStyle } from 'discord-api-types/v10';
import { fetchAppeal } from 'wolfstar-database';

type ComponentInteraction = Exclude<InteractionHandler.Interaction, InteractionHandler.ModalInteraction>;

/**
 * The custom ID of the reason in the modal of a decision.
 */
const ReasonInputId = 'reason';

/**
 * Handles the buttons of an appeal in the channel of the moderators, see `lib/moderation/appealService.ts`: `Accept`
 * and `Deny` open a modal that asks for the reason, which decides the appeal once, undoes the case when it is accepted,
 * and replaces the buttons with what was decided.
 */
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['moderator'] })
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeAppealId(content);
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		if (action === null || guildId === undefined) return fail(getDefaultExpiredReply());

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		if (!(interaction instanceof ModalSubmitInteraction)) {
			return (interaction as ComponentInteraction).showModal({
				custom_id: encodeAppealId({ ...action, submit: true }),
				title: cutText(t(action.verb === 'accept' ? 'moderation:appealAccept' : 'moderation:appealDeny'), 45),
				components: [
					{
						type: ComponentType.ActionRow,
						components: [
							{
								type: ComponentType.TextInput,
								custom_id: ReasonInputId,
								label: cutText(t('moderation:appealReasonLabel'), 45),
								style: TextInputStyle.Paragraph,
								required: false,
								max_length: 500
							}
						]
					}
				]
			});
		}

		const appeal = await fetchAppeal(this.container.prisma, guildId, action.appealId);
		if (appeal === null) return fail(getDefaultExpiredReply());

		const guild = await this.container.gatewayClient.guilds.fetch(guildId);
		const moderation = await getModeration(guild);
		const entry = await moderation.fetch(appeal.caseId);
		if (entry === null || !(AppealableTypes as readonly number[]).includes(entry.type)) return fail(t('moderation:appealCaseGone'));

		const reason = getModalValue(interaction.data.components, ReasonInputId)?.trim() || null;
		const accept = action.verb === 'accept';
		const error = await applyAppealDecision(
			guild,
			appeal,
			{ id: entry.id, type: entry.type as AppealableType },
			accept,
			interaction.user.id,
			reason
		);
		if (error === 'decided') return fail(t('moderation:appealAlreadyDecided'));
		if (error === 'undoFailed') return fail(t('moderation:appealUndoFailed'));

		// The message is in the language of the guild, as it was sent:
		const guildT = await fetchGuildT(guild);
		const settings = await readSettings(guildId);
		const questions = getAppealQuestions(guildT, settings.appealsQuestions);
		return interaction.update({
			...renderAppealMessage(guildT, appeal, entry, questions, accept ? 'accepted' : 'denied', interaction.user.id, reason),
			allowed_mentions: { parse: [] }
		});
	}
}
