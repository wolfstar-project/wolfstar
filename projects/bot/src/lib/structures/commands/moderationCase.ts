import type { ModerationManager } from '#lib/moderation';
import { createTranslator, type GuildChatInputInteraction, type TranslationKey, type Translator } from '#lib/structures/commands';
import { TypeVariation } from '#utils/moderationConstants';
import { resolveCase } from '#utils/resolvers';
import { renderStatus } from '#utils/status';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { UserError } from '@wolfstar/http-framework';
import { getSupportedLanguageT, getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import type { APIUser } from 'discord-api-types/v10';

const OverviewColors = [0x80f31f, 0xa5de0b, 0xc7c101, 0xe39e03, 0xf6780f, 0xfe5326, 0xfb3244];

/**
 * Runs the handler of a `case` subcommand, replying with the translated error when it throws one.
 *
 * @remarks
 *
 * The permission level is checked by the `moderator` precondition of the `case` command. The handler must
 * throw the translated message (or a `UserError`) **before** it defers the interaction, as the errors are sent as an
 * ephemeral status message, see `renderStatus`.
 */
export async function handleCase(interaction: GuildChatInputInteraction, handler: (t: Translator) => Promise<unknown>) {
	const t = createTranslator(getSupportedUserLanguageT(interaction));
	try {
		return await handler(t);
	} catch (error) {
		if (typeof error === 'string') return interaction.reply(renderStatus('error', error));
		if (error instanceof UserError) {
			const content = t(error.identifier as TranslationKey, error.context as Record<string, unknown>);
			return interaction.reply(renderStatus('error', content));
		}

		throw error;
	}
}

/**
 * Gets the function to translate the displayed output with, the language of the guild if the output is public and the
 * language of the author otherwise.
 */
export function getDisplayT(interaction: GuildChatInputInteraction, show: boolean) {
	return (show ? getSupportedLanguageT(interaction) : getSupportedUserLanguageT(interaction)) as unknown as TFunction<AnyNamespace>;
}

/**
 * Resolves the moderation case of the guild with the given id.
 *
 * @throws The error of the resolver when the case does not exist.
 */
export async function getCase(interaction: GuildChatInputInteraction, caseId: number): Promise<ModerationManager.Entry> {
	const result = await resolveCase(
		caseId.toString(),
		getSupportedUserLanguageT(interaction) as unknown as TFunction<AnyNamespace>,
		interaction.guildId
	);
	if (result.isErr()) throw result.unwrapErr();

	return result.unwrap();
}

/** Builds the overview embed with the amount of each kind of sanction of the entries. */
export function listOverview(t: TFunction<AnyNamespace>, entries: ModerationManager.Entry[], user: APIUser | null) {
	let [warnings, mutes, timeouts, kicks, bans] = [0, 0, 0, 0, 0];
	for (const entry of entries) {
		if (entry.isArchived() || entry.isUndo()) continue;
		switch (entry.type) {
			case TypeVariation.Ban:
			case TypeVariation.Softban:
				++bans;
				break;
			case TypeVariation.Mute:
				++mutes;
				break;
			case TypeVariation.Timeout:
				++timeouts;
				break;
			case TypeVariation.Kick:
				++kicks;
				break;
			case TypeVariation.Warning:
				// A warning that was removed, or that expired, no longer counts:
				if (!entry.isCompleted()) ++warnings;
				break;
			default:
				break;
		}
	}

	const footer = t(user ? 'commands/case:listOverviewFooterUser' : 'commands/case:listOverviewFooter', {
		warnings: t('commands/case:listOverviewFooterWarning', { count: warnings }),
		mutes: t('commands/case:listOverviewFooterMutes', { count: mutes }),
		timeouts: t('commands/case:listOverviewFooterTimeouts', { count: timeouts }),
		kicks: t('commands/case:listOverviewFooterKicks', { count: kicks }),
		bans: t('commands/case:listOverviewFooterBans', { count: bans })
	});

	const embed = new EmbedBuilder()
		.setColor(OverviewColors[Math.min(OverviewColors.length - 1, warnings + mutes + kicks + bans)])
		.setFooter({ text: footer });
	if (user) embed.setAuthor(getFullEmbedAuthor(user));
	return embed;
}
