import { decodeAppealId, encodeAppealId, MaximumAppealReasonLength } from '#lib/moderation/appeals';
import { AppealSettleErrorKeys, settleAppeal } from '#lib/moderation/appealService';
import { createTranslator } from '#lib/structures/commands/utils';
import { getModalValue } from 'wolfstar-shared';
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
@ApplyOptions<InteractionHandler.Options>({ preconditions: ['appealManager'] })
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
								max_length: MaximumAppealReasonLength
							}
						]
					}
				]
			});
		}

		const appeal = await fetchAppeal(this.container.prisma, guildId, action.appealId);
		if (appeal === null) return fail(getDefaultExpiredReply());

		// The undo of the case may take longer than Discord waits for an answer:
		const deferred = await interaction.deferUpdate();
		const guild = await this.container.gatewayClient.guilds.fetch(guildId);
		const reason = getModalValue(interaction.data.components, ReasonInputId)?.trim() || null;
		const result = await settleAppeal(guild, appeal, action.verb === 'accept', interaction.user.id, reason);
		if ('error' in result) return interaction.followup({ content: t(AppealSettleErrorKeys[result.error]), flags: MessageFlags.Ephemeral });

		return deferred.update({ ...result.message, allowed_mentions: { parse: [] } });
	}
}
