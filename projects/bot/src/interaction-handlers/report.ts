import { fetchUserReportEnabled, readSettings } from '#lib/database';
import { getAction } from '#lib/moderation/actions';
import { checkTargetCanBeModerated } from '#lib/moderation/common/checks';
import { decodeReportId, isReportModerationVerb, type ReportAction, type ReportModerationVerb } from '#lib/moderation/reports/ids';
import { takePendingReport } from '#lib/moderation/reports/pending';
import {
	closeReport,
	markReportMessageDeleted,
	renderReportActionModal,
	ReportDurationInputId,
	ReportReasonInputId
} from '#lib/moderation/reports/render';
import { fetchGuildTranslator, submitReport } from '#lib/moderation/reports/submit';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes } from '#common';
import { getModalValue } from '#utils/interactions';
import { TypeVariation } from '#utils/moderationConstants';
import { resolveTimeSpan } from '#utils/resolvers';
import { userMention } from '@discordjs/formatters';
import { isNullishOrEmpty } from '@sapphire/utilities';
import { InteractionHandler, ModalSubmitInteraction, container } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

const ModerationTypes = {
	warn: TypeVariation.Warning,
	timeout: TypeVariation.Timeout,
	kick: TypeVariation.Kick,
	ban: TypeVariation.Ban
} as const satisfies Record<ReportModerationVerb, TypeVariation>;

const StatusKeys = {
	warn: 'commands/report:statusWarn',
	timeout: 'commands/report:statusTimeout',
	kick: 'commands/report:statusKick',
	ban: 'commands/report:statusBan'
} as const satisfies Record<ReportModerationVerb, TranslationKey>;

/**
 * Handles the modal a member writes the reason of a report in, and the buttons and the modals the moderators act on a
 * report with, see `lib/moderation/reports`.
 *
 * @remarks
 *
 * What a component does is read from its custom ID, so there is no state to keep between the clicks. Whoever acts on a
 * report needs the moderator level every time, and the moderation actions go through the same checks and the same
 * `ModerationAction` as the moderation commands, so they are logged as cases.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const { guildId } = interaction;
		const action = decodeReportId(content);
		if (action === null || guildId === undefined) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const fail = (message: string) => interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
		const isModal = interaction instanceof ModalSubmitInteraction;

		if (action.verb === 'new') {
			if (!isModal) return fail(getDefaultExpiredReply());
			return this.submit(interaction as ModalInteraction, guildId, action, t);
		}

		if (
			interaction.member === undefined ||
			!(await hasCommandPermissionLevel({ guildId, member: interaction.member }, CommandPermissionLevel.Moderator))
		) {
			return fail(t('preconditions:moderator', { command: { name: this.name } }));
		}

		if (isReportModerationVerb(action.verb)) {
			const moderation = action as ReportAction & { verb: ReportModerationVerb };
			if (isModal) return this.moderate(interaction as ModalInteraction, guildId, moderation, t);
			return (interaction as ComponentInteraction).showModal(renderReportActionModal(t, moderation));
		}

		if (isModal) return fail(getDefaultExpiredReply());
		const component = interaction as ComponentInteraction;
		return action.verb === 'delete' ? this.deleteMessage(component, guildId, action, t) : this.dismiss(component, guildId);
	}

	/**
	 * Sends the report a member wrote the reason of.
	 */
	private async submit(interaction: ModalInteraction, guildId: Snowflake, action: ReportAction, t: Translator) {
		const subject = await takePendingReport(guildId, interaction.user.id, action.targetId, action.messageId);
		if (subject === null) return interaction.reply({ content: t('commands/report:expired'), flags: MessageFlags.Ephemeral });

		const reason = (getModalValue(interaction.data.components, ReportReasonInputId) ?? '').trim();
		const content = await submitReport(t, guildId, interaction.user.id, subject, reason);
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	/**
	 * Takes the moderation action a moderator confirmed, then closes the report.
	 */
	private async moderate(interaction: ModalInteraction, guildId: Snowflake, action: ReportAction & { verb: ReportModerationVerb }, t: Translator) {
		const { message } = interaction;
		if (message === undefined) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		// The action may take longer than Discord waits for an answer:
		const deferred = await interaction.deferUpdate();
		const followup = (content: string) => interaction.followup({ content, flags: MessageFlags.Ephemeral });

		let entryId: number;
		try {
			entryId = await this.applyAction(interaction, guildId, action, t);
		} catch (error) {
			// The checks and the actions throw the translated reason:
			if (typeof error === 'string') return followup(error);

			this.container.logger.error('[Reports] Could not take a moderation action from a report:', error);
			return followup(t('commands/report:actionFailed'));
		}

		const guildT = await fetchGuildTranslator(guildId);
		const status = guildT(StatusKeys[action.verb], { moderator: userMention(interaction.user.id), case: entryId });
		await deferred.update({ components: closeReport(message.components ?? [], status), allowed_mentions: { parse: [] } });
		return followup(t('commands/report:actionDone', { case: entryId }));
	}

	/**
	 * Runs the checks of the moderation commands and applies the action.
	 *
	 * @returns The ID of the case that was created.
	 * @throws The translated reason the action cannot be taken.
	 */
	private async applyAction(
		interaction: ModalInteraction,
		guildId: Snowflake,
		action: ReportAction & { verb: ReportModerationVerb },
		t: Translator
	) {
		const { gatewayClient } = container;
		const moderationAction = getAction(ModerationTypes[action.verb]);

		let duration: number | null = null;
		if (action.verb === 'timeout') {
			const parameter = (getModalValue(interaction.data.components, ReportDurationInputId) ?? '').trim();
			const limits = { minimum: moderationAction.minimumDuration, maximum: moderationAction.maximumDuration };
			duration = resolveTimeSpan(parameter, limits).match({
				ok: (value) => value,
				err: (key) => {
					throw t(key as TranslationKey, { parameter, ...limits });
				}
			});
		}

		const guild = await gatewayClient.guilds.fetch(guildId);
		await checkTargetCanBeModerated({
			t,
			guild,
			targetId: action.targetId,
			moderatorId: interaction.user.id,
			// A user who left can still be banned, the other actions need the member:
			requiredMember: action.verb !== 'ban'
		});

		if (await moderationAction.isActive(guild, action.targetId, undefined as never)) throw t('moderation:actionIsActive');

		const [target, moderator] = await Promise.all([gatewayClient.users.fetch(action.targetId), gatewayClient.users.fetch(interaction.user.id)]);
		const reason = (getModalValue(interaction.data.components, ReportReasonInputId) ?? '').trim();
		const settings: Partial<Record<string, unknown>> = await readSettings(guildId);
		const entry = await moderationAction.apply(
			guild,
			{ user: target, moderator, reason: isNullishOrEmpty(reason) ? null : reason, duration },
			{
				moderator: settings.messagesModeratorNameDisplay === false ? null : moderator,
				sendDirectMessage: settings.messagesModerationDm === true && (await fetchUserReportEnabled(target.id))
			}
		);
		return entry.id;
	}

	/**
	 * Deletes the reported message and notes it on the report, which stays open.
	 */
	private async deleteMessage(interaction: ComponentInteraction, guildId: Snowflake, action: ReportAction, t: Translator) {
		const fail = () => interaction.reply({ content: t('commands/report:deleteFailed'), flags: MessageFlags.Ephemeral });
		if (action.channelId === null || action.messageId === null) return fail();

		try {
			// A message that is already gone is what the moderator wanted:
			await resolveOnErrorCodes(
				container.gatewayClient.api.channels.deleteMessage(action.channelId, action.messageId),
				RESTJSONErrorCodes.UnknownMessage,
				RESTJSONErrorCodes.UnknownChannel
			);
		} catch {
			return fail();
		}

		const guildT = await fetchGuildTranslator(guildId);
		const note = guildT('commands/report:statusDeleted', { moderator: userMention(interaction.user.id) });
		await interaction.update({
			components: markReportMessageDeleted(interaction.message.components ?? [], note),
			allowed_mentions: { parse: [] }
		});
		return interaction.followup({ content: t('commands/report:deleteDone'), flags: MessageFlags.Ephemeral });
	}

	/**
	 * Closes the report without an action.
	 */
	private async dismiss(interaction: ComponentInteraction, guildId: Snowflake) {
		const guildT = await fetchGuildTranslator(guildId);
		const status = guildT('commands/report:statusDismissed', { moderator: userMention(interaction.user.id) });
		return interaction.update({ components: closeReport(interaction.message.components ?? [], status), allowed_mentions: { parse: [] } });
	}
}
