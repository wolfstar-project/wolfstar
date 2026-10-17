import { readSettings } from '#lib/database';
import type { ReportModerationVerb } from '#lib/moderation/reports/ids';
import { claimReport, releaseReport, ReportCooldownSeconds, type ReportSubject } from '#lib/moderation/reports/pending';
import { renderReport, ReportContentMaximumLength } from '#lib/moderation/reports/render';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { getLogger } from '#utils/functions';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';
import { createReport, deleteReport, type Report, type ReportStatus } from 'wolfstar-database';

/**
 * The function to translate with in the language of a guild, which what the moderators read is written in.
 */
export async function fetchGuildTranslator(guildId: Snowflake): Promise<Translator> {
	const settings = await readSettings(guildId);
	return createTranslator(container.i18n.getT(settings.language));
}

/**
 * Why a member cannot report a subject, before they are asked for a reason.
 *
 * @param t - The function to translate with, in the language of the member.
 * @returns The translated reason, or `null` when the subject can be reported.
 */
export async function getReportDenial(t: Translator, guildId: Snowflake, reporterId: Snowflake, targetId: Snowflake): Promise<string | null> {
	const settings = await readSettings(guildId);
	if (settings.reportsChannel === null) return t('commands/report:notConfigured');
	if (settings.reportsBlockedUsers.includes(reporterId)) return t('commands/report:blocked');
	if (targetId === reporterId) return t('commands/report:targetSelf');
	if (targetId === container.gatewayClient.user?.id) return t('commands/report:targetWolf');
	return null;
}

/**
 * Sends a report to the reports channel of a guild.
 *
 * @param t - The function to translate with, in the language of the member who reports.
 * @returns What to answer the member with.
 */
export async function submitReport(
	t: Translator,
	guildId: Snowflake,
	reporterId: Snowflake,
	subject: ReportSubject,
	reason: string
): Promise<string> {
	const denial = await getReportDenial(t, guildId, reporterId, subject.targetId);
	if (denial !== null) return denial;

	const messageId = subject.message?.id ?? null;
	const claim = await claimReport(guildId, reporterId, messageId);
	if (claim === 'duplicate') return t('commands/report:duplicate');
	if (claim === 'cooldown') return t('commands/report:cooldown', { seconds: ReportCooldownSeconds });

	const settings = await readSettings(guildId);
	const { prisma } = container;
	// The report is stored first: its components carry its ID, and the history keeps it whatever becomes of its message.
	const report = await createReport(
		prisma,
		guildId,
		{
			reporterId,
			targetId: subject.targetId,
			targetTag: subject.targetTag,
			channelId: subject.message?.channelId ?? null,
			messageId,
			reason,
			content: subject.message === null ? null : cutText(subject.message.content, ReportContentMaximumLength),
			attachments: subject.message?.attachments ?? [],
			anonymous: settings.reportsAnonymous
		},
		settings.language
	);

	// Whatever goes wrong while the report is sent, it was not received:
	let sent = false;
	try {
		const guild = await container.gatewayClient.guilds.fetch(guildId);
		const logger = await getLogger(guild);
		sent = await logger.send({
			key: 'reportsChannel',
			channelId: settings.reportsChannel,
			// The report is for the moderators, so it is written in the language of the guild:
			makeMessage: async () => renderReport(await fetchGuildTranslator(guildId), report, settings.reportsRole)
		});
	} catch (error) {
		container.logger.error(`[REPORTS] Could not send the report ${report.id}:`, error);
	}

	if (!sent) {
		// The member is not made to wait, nor the message kept from another report, for a report nobody received:
		await Promise.all([deleteReport(prisma, guildId, report.id), releaseReport(guildId, reporterId, messageId)]);
		return t('commands/report:failed');
	}

	return t('commands/report:success');
}

/**
 * Gets the key of what the member who made a report is told when it is closed.
 *
 * @remarks A note is not an action the member would see, so they are told it was recorded and not that action
 * was taken.
 *
 * @param status - What became of the report.
 * @param action - The action that closed it, if any.
 */
export function getReporterNotificationKey(status: Exclude<ReportStatus, 'Open'>, action?: ReportModerationVerb) {
	if (status === 'Dismissed') return 'commands/report:notifyDismissed';
	return action === 'note' ? 'commands/report:notifyNoted' : 'commands/report:notifyActioned';
}

/**
 * Tells the member who made a report what became of it, in a direct message, when the guild wants them told.
 *
 * @remarks The member is told that the moderators acted or not, and not what they did: that stays between the
 * moderators and the member who was reported. A member who cannot be written to is not told.
 *
 * @param report - The report that was closed.
 * @param status - What became of it.
 */
export async function notifyReporter(report: Report, status: Exclude<ReportStatus, 'Open'>, action?: ReportModerationVerb): Promise<void> {
	try {
		const settings = await readSettings(report.guildId);
		if (!settings.reportsNotify) return;

		const { gatewayClient } = container;
		const [guild, reporter, t] = await Promise.all([
			gatewayClient.guilds.fetch(report.guildId),
			gatewayClient.users.fetch(report.reporterId),
			fetchGuildTranslator(report.guildId)
		]);
		const key = getReporterNotificationKey(status, action);
		await reporter.send({ content: t(key, { guild: guild.name, target: report.targetTag }), allowed_mentions: { parse: [] } });
	} catch {
		// The direct messages of the member are closed, or they left: the report is closed all the same.
	}
}
