import { parseAppealCase } from '#lib/moderation/appeals';
import { AppealSettleErrorKeys, settleAppeal } from '#lib/moderation/appealService';
import { getTitle } from '#lib/moderation/common/util';
import { createTranslator, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { getModeration } from '#utils/functions';
import { cutText } from '@sapphire/utilities';
import { container } from '@wolfstar/http-framework';
import { getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags, type Snowflake } from 'discord-api-types/v10';
import { fetchAppealByCase, fetchAppeals, type Appeal, type AppealStatus } from 'wolfstar-database';

/**
 * How many of the latest appeals the autocomplete of `/appeal` looks through.
 */
const AppealChoicesWindow = 100;

/**
 * How many choices Discord shows for an option.
 */
const MaximumChoices = 25;

/**
 * The name of each status of an appeal.
 */
export const AppealStatusKeys = {
	pending: 'commands/appeal:statusPending',
	accepted: 'commands/appeal:statusAccepted',
	denied: 'commands/appeal:statusDenied'
} as const satisfies Record<AppealStatus, TranslationKey>;

/**
 * Reads the appeal the `appeal` option of `/appeal` names.
 *
 * @returns The appeal, `null` when the option does not name the case of one.
 */
export async function readAppealOption(guildId: Snowflake, value: string) {
	const caseId = parseAppealCase(value);
	return caseId === null ? null : fetchAppealByCase(container.prisma, guildId, caseId);
}

/**
 * Runs `/appeal approve` and `/appeal deny`, which do what the buttons of the message of an appeal do, and change that
 * message as they do: whoever decides, it stops asking for a decision.
 *
 * @param interaction - The command.
 * @param options - Its options.
 * @param accept - Whether the appeal is accepted.
 */
export async function runAppealDecision(interaction: GuildChatInputInteraction, options: { appeal: string; reason?: string }, accept: boolean) {
	const t = createTranslator(getSupportedUserLanguageT(interaction));
	const appeal = await readAppealOption(interaction.guildId, options.appeal);
	if (appeal === null) return interaction.reply({ content: t('commands/appeal:notFound'), flags: MessageFlags.Ephemeral });

	const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
	const guild = await container.gatewayClient.guilds.fetch(interaction.guildId);
	const result = await settleAppeal(guild, appeal, accept, interaction.user.id, options.reason?.trim() || null);
	if ('error' in result) return deferred.update({ content: t(AppealSettleErrorKeys[result.error]) });

	if (appeal.channelId !== null && appeal.messageId !== null) {
		await container.gatewayClient.api.channels
			.editMessage(appeal.channelId, appeal.messageId, { ...result.message, allowed_mentions: { parse: [] } })
			.catch((error: unknown) => container.logger.warn(`[Appeals] Could not update the message of the appeal ${appeal.id}:`, error));
	}

	return deferred.update({ content: t(accept ? 'commands/appeal:approved' : 'commands/appeal:denied', { case: appeal.caseId }) });
}

/**
 * Picks the appeals the autocomplete of `/appeal` suggests for what was written so far: the ones whose case number
 * starts with it, with or without its `#`, or of the user with that ID.
 */
export function filterAppealChoices(appeals: readonly Appeal[], query: string) {
	const text = query.trim().replace(/^#/, '');
	return appeals.filter((appeal) => String(appeal.caseId).startsWith(text) || appeal.userId === text).slice(0, MaximumChoices);
}

/**
 * The choices of the `appeal` option of `/appeal`: what each appeal is about, its value being the number of its case.
 *
 * @param t - The language of the moderator.
 * @param guildId - The guild.
 * @param query - What was written so far.
 * @param pendingOnly - Whether to leave out the appeals that were decided.
 */
export async function getAppealChoices(t: TFunction<AnyNamespace>, guildId: Snowflake, query: string, pendingOnly: boolean) {
	const appeals = await fetchAppeals(container.prisma, guildId, { status: pendingOnly ? 'pending' : undefined, limit: AppealChoicesWindow });
	const moderation = await getModeration(guildId);

	return Promise.all(
		filterAppealChoices(appeals, query).map(async (appeal) => {
			const entry = await moderation.fetch(appeal.caseId);
			// Only what the cache knows: Discord waits 3 seconds for the choices, and they are asked for at every key.
			const user = await container.gatewayClient.users.resolve(appeal.userId);
			const name = t('commands/appeal:choice', {
				case: appeal.caseId,
				type: entry === null ? t('commands/appeal:caseGone') : getTitle(t, entry),
				user: user?.username ?? appeal.userId,
				status: t(AppealStatusKeys[appeal.status])
			});
			return { name: cutText(name, 100), value: String(appeal.caseId) };
		})
	);
}
