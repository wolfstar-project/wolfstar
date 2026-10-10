import { fetchUserReportEnabled, readSettings, writeSettings } from '#lib/database';
import { getAction } from '#lib/moderation/actions';
import { checkTargetCanBeModerated } from '#lib/moderation/common/checks';
import { decodeReportId, isReportMenuVerb, isReportModerationVerb, type ReportAction, type ReportModerationVerb } from '#lib/moderation/reports/ids';
import { takePendingReport } from '#lib/moderation/reports/pending';
import {
	addReportNote,
	closeReport,
	renderReportActionModal,
	ReportDurationInputId,
	ReportReasonInputId,
	setReportReporterBlocked
} from '#lib/moderation/reports/render';
import { fetchGuildTranslator, notifyReporter, submitReport } from '#lib/moderation/reports/submit';
import { CommandPermissionLevel, hasCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { createTranslator, type TranslationKey, type Translator } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes } from '#common';
import { getModalValue } from '#utils/interactions';
import { TypeVariation } from '#utils/moderationConstants';
import { resolveTimeSpan } from '#utils/resolvers';
import { userMention } from '@discordjs/formatters';
import { isNullishOrEmpty } from '@sapphire/utilities';
import { InteractionHandler, ModalSubmitInteraction, UserError, container } from '@wolfstar/http-framework';
import { getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import { closeReport as closeStoredReport, fetchReport, reopenReport, setReportCase, type Report } from 'wolfstar-database';

type ModalInteraction = InteractionHandler.ModalInteraction;
type ComponentInteraction = Exclude<InteractionHandler.Interaction, ModalInteraction>;

const ModerationTypes = {
	warn: TypeVariation.Warning,
	timeout: TypeVariation.Timeout,
	kick: TypeVariation.Kick,
	mute: TypeVariation.Mute,
	softban: TypeVariation.Softban,
	ban: TypeVariation.Ban
} as const satisfies Record<ReportModerationVerb, TypeVariation>;

const StatusKeys = {
	warn: 'commands/report:statusWarn',
	timeout: 'commands/report:statusTimeout',
	kick: 'commands/report:statusKick',
	mute: 'commands/report:statusMute',
	softban: 'commands/report:statusSoftban',
	ban: 'commands/report:statusBan'
} as const satisfies Record<ReportModerationVerb, TranslationKey>;

/**
 * The actions that do not need the reported user to still be a member of the guild.
 */
const ActionsWithoutMember: readonly ReportModerationVerb[] = ['softban', 'ban'];

/**
 * Handles the modal a member writes the reason of a report in, and the components and the modals the moderators act on
 * a report with, see `lib/moderation/reports`.
 *
 * @remarks
 *
 * A component only carries the ID of its report, which is read from the database, so there is no state to keep between
 * the clicks. Whoever acts on a report needs the moderator level every time, and the moderation actions go through the
 * same checks and the same `ModerationAction` as the moderation commands, so they are logged as cases. A report is
 * closed in the database before its action is taken, so two moderators cannot act on it at once.
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

		const report = await fetchReport(container.prisma.orm, guildId, action.id);
		if (report === null) return fail(getDefaultExpiredReply());
		if (report.status !== 'Open') return fail(t('commands/report:alreadyClosed'));

		if (isModal) {
			if (!isReportModerationVerb(action.verb)) return fail(getDefaultExpiredReply());
			return this.moderate(interaction as ModalInteraction, report, action.verb, t);
		}

		const component = interaction as ComponentInteraction;
		// The menu stands for the action that was picked in it:
		const verb = action.verb === 'menu' ? getSelectValue(component) : action.verb;
		if (verb === null || (action.verb === 'menu' && !isReportMenuVerb(verb))) return fail(getDefaultExpiredReply());

		if (isReportModerationVerb(verb)) return component.showModal(renderReportActionModal(t, report.id, verb));
		switch (verb) {
			case 'block':
				return this.setBlocked(component, report, t, true);
			case 'unblock':
				return this.setBlocked(component, report, t, false);
			case 'delete':
				return this.deleteMessage(component, report, t);
			case 'dismiss':
				return this.dismiss(component, report, t);
			default:
				return fail(getDefaultExpiredReply());
		}
	}

	/**
	 * Sends the report a member wrote the reason of.
	 */
	private async submit(interaction: ModalInteraction, guildId: Snowflake, action: ReportAction, t: Translator) {
		const subject = await takePendingReport(guildId, interaction.user.id, action.id, action.messageId);
		if (subject === null) return interaction.reply({ content: t('commands/report:expired'), flags: MessageFlags.Ephemeral });

		const reason = (getModalValue(interaction.data.components, ReportReasonInputId) ?? '').trim();
		const content = await submitReport(t, guildId, interaction.user.id, subject, reason);
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	/**
	 * Takes the moderation action a moderator confirmed, then closes the report.
	 */
	private async moderate(interaction: ModalInteraction, report: Report, verb: ReportModerationVerb, t: Translator) {
		const { message } = interaction;
		if (message === undefined) return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });

		// The action may take longer than Discord waits for an answer:
		const deferred = await interaction.deferUpdate();
		const followup = (content: string) => interaction.followup({ content, flags: MessageFlags.Ephemeral });

		// The report is closed first, so another moderator who confirms an action meanwhile is told it is closed:
		const { prisma } = container;
		const closed = await closeStoredReport(prisma, report.guildId, report.id, {
			status: 'Actioned',
			action: verb,
			caseId: null,
			moderatorId: interaction.user.id
		});
		if (!closed) return followup(t('commands/report:alreadyClosed'));

		let caseId: number;
		try {
			caseId = await this.applyAction(interaction, report, verb, t);
		} catch (error) {
			await reopenReport(prisma, report.guildId, report.id);
			// The checks and the actions throw the translated reason, or an error that holds its key:
			if (typeof error === 'string') return followup(error);
			if (error instanceof UserError) return followup(t(error.identifier as TranslationKey, error.context as Record<string, unknown>));

			this.container.logger.error('[Reports] Could not take a moderation action from a report:', error);
			return followup(t('commands/report:actionFailed'));
		}

		await setReportCase(prisma, report.guildId, report.id, caseId);
		const guildT = await fetchGuildTranslator(report.guildId);
		const status = guildT(StatusKeys[verb], { moderator: userMention(interaction.user.id), case: caseId });
		await deferred.update({ components: closeReport(message.components ?? [], status), allowed_mentions: { parse: [] } });
		await notifyReporter(report, 'Actioned');
		return followup(t('commands/report:actionDone', { case: caseId }));
	}

	/**
	 * Runs the checks of the moderation commands and applies the action.
	 *
	 * @returns The ID of the case that was created.
	 * @throws The translated reason the action cannot be taken.
	 */
	private async applyAction(interaction: ModalInteraction, report: Report, verb: ReportModerationVerb, t: Translator) {
		const { gatewayClient } = container;
		const moderationAction = getAction(ModerationTypes[verb]);

		let duration: number | null = null;
		const parameter = (getModalValue(interaction.data.components, ReportDurationInputId) ?? '').trim();
		if (parameter.length > 0 || moderationAction.durationRequired) {
			const limits = { minimum: moderationAction.minimumDuration, maximum: moderationAction.maximumDuration };
			duration = resolveTimeSpan(parameter, limits).match({
				ok: (value) => value,
				err: (key) => {
					throw t(key as TranslationKey, { parameter, ...limits });
				}
			});
		}

		const guild = await gatewayClient.guilds.fetch(report.guildId);
		await checkTargetCanBeModerated({
			t,
			guild,
			targetId: report.targetId,
			moderatorId: interaction.user.id,
			requiredMember: !ActionsWithoutMember.includes(verb)
		});

		if (await moderationAction.isActive(guild, report.targetId, undefined as never)) throw t('moderation:actionIsActive');

		const [target, moderator] = await Promise.all([gatewayClient.users.fetch(report.targetId), gatewayClient.users.fetch(interaction.user.id)]);
		const reason = (getModalValue(interaction.data.components, ReportReasonInputId) ?? '').trim();
		const settings: Partial<Record<string, unknown>> = await readSettings(report.guildId);
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
	 * Stops the member who made the report from making more of them, or lets them report again, and notes it on the
	 * report, which stays open. Its menu then offers the opposite.
	 *
	 * @remarks Blocking is how the moderators stop who abuses of the reports when they are anonymous: the member is
	 * blocked without being named.
	 */
	private async setBlocked(interaction: ComponentInteraction, report: Report, t: Translator, block: boolean) {
		const settings = await readSettings(report.guildId);
		if (settings.reportsBlockedUsers.includes(report.reporterId) === block) {
			return interaction.reply({
				content: t(block ? 'commands/report:blockAlready' : 'commands/report:unblockNotBlocked'),
				flags: MessageFlags.Ephemeral
			});
		}

		await writeSettings(
			report.guildId,
			(current) => ({
				reportsBlockedUsers: block
					? [...new Set([...current.reportsBlockedUsers, report.reporterId])]
					: current.reportsBlockedUsers.filter((id: string) => id !== report.reporterId)
			}),
			interaction.user.id
		);

		const guildT = await fetchGuildTranslator(report.guildId);
		const note = guildT(block ? 'commands/report:statusBlocked' : 'commands/report:statusUnblocked', {
			moderator: userMention(interaction.user.id)
		});
		await interaction.update({
			components: setReportReporterBlocked(addReportNote(interaction.message.components ?? [], note), guildT, report.id, block),
			allowed_mentions: { parse: [] }
		});
		return interaction.followup({
			content: t(block ? 'commands/report:blockDone' : 'commands/report:unblockDone'),
			flags: MessageFlags.Ephemeral
		});
	}

	/**
	 * Deletes the reported message and notes it on the report, which stays open.
	 */
	private async deleteMessage(interaction: ComponentInteraction, report: Report, t: Translator) {
		const fail = () => interaction.reply({ content: t('commands/report:deleteFailed'), flags: MessageFlags.Ephemeral });
		if (report.channelId === null || report.messageId === null) return fail();

		try {
			// A message that is already gone is what the moderator wanted:
			await resolveOnErrorCodes(
				container.gatewayClient.api.channels.deleteMessage(report.channelId, report.messageId),
				RESTJSONErrorCodes.UnknownMessage,
				RESTJSONErrorCodes.UnknownChannel
			);
		} catch {
			return fail();
		}

		const guildT = await fetchGuildTranslator(report.guildId);
		const note = guildT('commands/report:statusDeleted', { moderator: userMention(interaction.user.id) });
		await interaction.update({
			components: addReportNote(interaction.message.components ?? [], note, 'delete'),
			allowed_mentions: { parse: [] }
		});
		return interaction.followup({ content: t('commands/report:deleteDone'), flags: MessageFlags.Ephemeral });
	}

	/**
	 * Closes the report without an action.
	 */
	private async dismiss(interaction: ComponentInteraction, report: Report, t: Translator) {
		const closed = await closeStoredReport(container.prisma, report.guildId, report.id, {
			status: 'Dismissed',
			action: null,
			caseId: null,
			moderatorId: interaction.user.id
		});
		if (!closed) return interaction.reply({ content: t('commands/report:alreadyClosed'), flags: MessageFlags.Ephemeral });

		const guildT = await fetchGuildTranslator(report.guildId);
		const status = guildT('commands/report:statusDismissed', { moderator: userMention(interaction.user.id) });
		await interaction.update({ components: closeReport(interaction.message.components ?? [], status), allowed_mentions: { parse: [] } });
		return notifyReporter(report, 'Dismissed');
	}
}

function getSelectValue(interaction: ComponentInteraction): string | null {
	const { data } = interaction;
	return 'values' in data ? (data.values[0] ?? null) : null;
}
