import { readSettings } from '#lib/database/settings/functions';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import type { Awaitable } from '@sapphire/utilities';
import { fetchT } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * The logs that are a title and a few lines: invites, threads, scheduled events, stickers and sounds, integrations, boosts.
 */
export type SimpleLogKey = 'logsInvites' | 'logsThreads' | 'logsEvents' | 'logsExpressions' | 'logsIntegrations' | 'logsBoosts';

/**
 * What a simple log shows.
 */
export interface SimpleLogMessage {
	color: number;
	/** The name of what the log is about, with its ID. */
	author: string;
	lines: readonly (string | null)[];
	/** What happened, the footer of the log. */
	footer: string;
}

/**
 * Sends a simple log to the channel of its key, when the guild has one: an embed with the name of what it is about,
 * its lines (the `null` ones are left out) and what happened.
 *
 * @param guildId - The ID of the guild.
 * @param key - The setting of the channel of the log.
 * @param build - Builds the message in the language of the guild, `null` sends nothing.
 */
export async function sendSimpleLog(guildId: Snowflake, key: SimpleLogKey, build: (t: Translator) => Awaitable<SimpleLogMessage | null>) {
	const settings = await readSettings(guildId);
	const channelId = settings[key];
	if (channelId === null) return;

	const logger = await getLogger(guildId);
	await logger.send({
		key,
		channelId,
		makeMessage: async () => {
			const t = createTranslator(await fetchT(logger.guild));
			const message = await build(t);
			if (message === null) return null;

			const lines = message.lines.filter((line): line is string => line !== null);
			const embed = new EmbedBuilder()
				.setColor(message.color)
				.setAuthor({ name: message.author.slice(0, 256), iconURL: logger.guild.iconURL({ size: 64, extension: 'png' }) ?? undefined })
				.setFooter({ text: message.footer })
				.setTimestamp();
			if (lines.length > 0) embed.setDescription(lines.join('\n').slice(0, 4096));
			return embed;
		}
	});
}
