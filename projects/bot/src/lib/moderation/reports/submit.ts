import { readSettings } from '#lib/database';
import { claimReport, releaseReport, ReportCooldownSeconds, type ReportSubject } from '#lib/moderation/reports/pending';
import { renderReport } from '#lib/moderation/reports/render';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { getLogger } from '#utils/functions';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

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
	const guild = await container.gatewayClient.guilds.fetch(guildId);
	const logger = await getLogger(guild);
	const sent = await logger.send({
		key: 'reportsChannel',
		channelId: settings.reportsChannel,
		makeMessage: async () =>
			// The report is for the moderators, so it is written in the language of the guild:
			renderReport(await fetchGuildTranslator(guildId), {
				guildId,
				reporterId,
				reason,
				subject,
				createdAt: Date.now(),
				roleId: settings.reportsRole
			})
	});

	if (!sent) {
		// The member is not made to wait, nor the message kept from another report, for a report nobody received:
		await releaseReport(guildId, reporterId, messageId);
		return t('commands/report:failed');
	}

	return t('commands/report:success');
}
