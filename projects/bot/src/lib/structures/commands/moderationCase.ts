import type { ModerationManager } from '#lib/moderation';
import { getTitle } from '#lib/moderation/common';
import { createTranslator, type GuildChatInputInteraction, type TranslationKey, type Translator } from '#lib/structures/commands';
import { desc, seconds } from '#utils/common';
import { BrandingColors, Emojis } from '#utils/constants';
import { TypeVariation } from '#utils/moderationConstants';
import { resolveCase } from '#utils/resolvers';
import { getColor, getFullEmbedAuthor, isUserSelf } from '#utils/util';
import { EmbedBuilder, TimestampStyles, blockQuote, inlineCode, time, userMention } from '@discordjs/builders';
import { cutText, isNullishOrEmpty, isNullishOrZero } from '@sapphire/utilities';
import { UserError, container } from '@wolfstar/http-framework';
import { getSupportedLanguageT, getSupportedUserLanguageT, type AnyNamespace, type TFunction } from '@wolfstar/plugin-i18next';
import { MessageFlags, type APIEmbedField, type APIUser } from 'discord-api-types/v10';

const OverviewColors = [0x80f31f, 0xa5de0b, 0xc7c101, 0xe39e03, 0xf6780f, 0xfe5326, 0xfb3244];

/** The amount of entries the `list` subcommand displays in each page, as the paginated message did. */
const EntriesPerPage = 5;

/**
 * Runs the handler of a `case` subcommand, replying with the translated error when it throws one.
 *
 * @remarks
 *
 * The permission level is checked by the `RequiresCommandPermissionLevel` decorator of the subcommand. The handler must
 * throw the translated message (or a `UserError`) **before** it defers the interaction, as the errors are sent as an
 * ephemeral reply.
 */
export async function handleCase(interaction: GuildChatInputInteraction, handler: (t: Translator) => Promise<unknown>) {
	const t = createTranslator(getSupportedUserLanguageT(interaction));
	try {
		return await handler(t);
	} catch (error) {
		if (typeof error === 'string') return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
		if (error instanceof UserError) {
			const content = t(error.identifier as TranslationKey, error.context as Record<string, unknown>);
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
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

/** Sorts the entries from the newest to the oldest, in place. */
export function sortEntries(entries: ModerationManager.Entry[]) {
	return entries.sort((a, b) => desc(a.id, b.id));
}

/** Builds the page `requestedPage` (clamped to the last page) of the detailed list of entries. */
export async function listDetails(
	interaction: GuildChatInputInteraction,
	t: TFunction<AnyNamespace>,
	entries: ModerationManager.Entry[],
	displayUser: boolean,
	requestedPage: number
) {
	const pages = Math.ceil(entries.length / EntriesPerPage);
	const page = Math.min(requestedPage, pages);
	const slice = entries.slice((page - 1) * EntriesPerPage, page * EntriesPerPage);

	const member = await container.gatewayClient.members.fetch(interaction.guildId, interaction.user.id).catch(() => null);
	const color = member ? await getColor({ member }) : BrandingColors.Primary;
	return new EmbedBuilder()
		.setTitle(t('commands/case:listDetailsTitle', { count: entries.length }))
		.setColor(color)
		.setFooter({ text: t('commands/case:listDetailsPage', { page, pages }) })
		.addFields(slice.map((entry) => listDetailsEntry(t, entry, displayUser)));
}

function listDetailsEntry(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry, displayUser: boolean): APIEmbedField {
	const moderatorEmoji = isUserSelf(entry.moderatorId) ? Emojis.AutoModerator : Emojis.Moderator;
	const lines = [
		`${Emojis.Calendar} ${time(seconds.fromMilliseconds(entry.createdAt), TimestampStyles.ShortDateTime)}`,
		t('commands/case:listDetailsModerator', { emoji: moderatorEmoji, mention: userMention(entry.moderatorId), userId: entry.moderatorId })
	];
	if (displayUser && entry.userId) {
		lines.push(t('commands/case:listDetailsUser', { emoji: Emojis.ShieldMember, mention: userMention(entry.userId), userId: entry.userId }));
	}

	if (!isNullishOrZero(entry.duration) && !entry.expired) {
		const timestamp = time(seconds.fromMilliseconds(entry.expiresTimestamp!), TimestampStyles.RelativeTime);
		lines.push(t('commands/case:listDetailsExpires', { emoji: Emojis.Hourglass, time: timestamp }));
	}

	if (!isNullishOrEmpty(entry.reason)) lines.push(blockQuote(cutText(entry.reason, 150)));

	return {
		name: `${inlineCode(entry.id.toString())} → ${getTitle(t, entry)}`,
		value: lines.join('\n'),
		inline: false
	};
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
				++warnings;
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
