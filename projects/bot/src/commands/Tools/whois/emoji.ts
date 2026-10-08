import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { resolveOnErrorCodes, seconds } from '#common';
import { Colors } from '#utils/constants';
import { getCustomEmojiUrl, getEncodedTwemoji, getTwemojiUrl, parseEmoji } from '#utils/functions/emojis';
import { EmbedBuilder, formatEmoji, inlineCode, roleMention, time, TimestampStyles, userMention } from '@discordjs/builders';
import { DiscordSnowflake } from '@sapphire/snowflake';
import { container } from '@wolfstar/http-framework';
import type { GuildEmoji } from '@wolfstar/plugin-gateway';
import { applyLocalizedBuilder, getSupportedUserLanguageT, type TFunction } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags, RESTJSONErrorCodes } from 'discord-api-types/v10';

const Root = 'commands/tools';

/**
 * `/whois emoji`, see the `whois` parent command. Displays an emoji: a custom one, whose name and image are shown and,
 * when it belongs to this server, who added it and the roles that can use it, or a unicode one, with its code points
 * and its image.
 */
@RegisterAsSubcommand('whois', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:whoisSubcommandEmoji`) //
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:whoisOptionsEmoji`).setRequired(true).setMaxLength(64))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'whois emoji'>) {
		const t = getSupportedUserLanguageT(interaction);
		const fail = (key: TranslationKey) => interaction.reply({ content: translateKey(t, key), flags: MessageFlags.Ephemeral });

		const parsed = parseEmoji(options.emoji);
		if (parsed === null) return fail(`${Root}:whoisEmojiInvalid`);

		const embed = parsed.kind === 'unicode' ? this.getUnicode(t, parsed.emoji) : await this.getCustom(t, interaction.guildId, parsed);
		if (embed === null) return fail(`${Root}:whoisEmojiUnknown`);

		return interaction.reply({ embeds: [embed.toJSON()], flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}

	private getUnicode(t: TFunction, emoji: string) {
		const url = getTwemojiUrl(getEncodedTwemoji(emoji));
		const codePoints = [...emoji].map((point) => `U+${point.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
		return new EmbedBuilder()
			.setColor(Colors.White)
			.setTitle(emoji)
			.setThumbnail(url)
			.setDescription(
				[
					translateKey(t, `${Root}:whoisEmojiUnicode`),
					translateKey(t, `${Root}:whoisEmojiCodePoints`, { value: inlineCode(codePoints.join(' ')) }),
					translateKey(t, `${Root}:whoisEmojiImage`, { url })
				].join('\n')
			);
	}

	private async getCustom(t: TFunction, guildId: string, parsed: { id: string; name: string | null; animated: boolean | null }) {
		// What Discord says of an emoji of this server wins over what the user wrote, the name may have changed since:
		const guild = await container.gatewayClient.guilds.fetch(guildId);
		const own = await resolveOnErrorCodes(guild.emojis.fetch(parsed.id), RESTJSONErrorCodes.UnknownEmoji);
		const name = own?.name ?? parsed.name;
		const animated = own?.animated ?? parsed.animated;
		// Discord gives no name nor kind for an emoji of another server, and nothing at all for an ID that is not one:
		if (name === null || animated === null) return null;

		const created = seconds.fromMilliseconds(Number(DiscordSnowflake.timestampFrom(parsed.id)));
		const url = getCustomEmojiUrl(parsed.id, animated);
		const lines = [
			translateKey(t, `${Root}:whoisEmojiCustom`, {
				kind: translateKey(t, `${Root}:${animated ? 'whoisEmojiKindAnimated' : 'whoisEmojiKindStatic'}`)
			}),
			translateKey(t, `${Root}:whoisEmojiId`, { id: parsed.id }),
			translateKey(t, `${Root}:whoisEmojiCreated`, {
				date: time(created, TimestampStyles.ShortDateTime),
				relative: time(created, TimestampStyles.RelativeTime)
			}),
			translateKey(t, `${Root}:whoisEmojiMention`, { value: inlineCode(formatEmoji({ id: parsed.id, name, animated })) }),
			translateKey(t, `${Root}:whoisEmojiImage`, { url })
		];

		if (own !== null) lines.push(...this.getOwnLines(t, own));
		return new EmbedBuilder().setColor(Colors.White).setTitle(`:${name}:`).setThumbnail(url).setDescription(lines.join('\n'));
	}

	/**
	 * What is only known of the emoji of this server: who added it, which roles can use it, and whether it can be used.
	 */
	private getOwnLines(t: TFunction, emoji: GuildEmoji) {
		const lines = [translateKey(t, `${Root}:whoisEmojiServer`)];
		if (emoji.author) lines.push(translateKey(t, `${Root}:whoisEmojiAddedBy`, { user: userMention(emoji.author.id) }));
		if (emoji.roleIds.length > 0) {
			lines.push(translateKey(t, `${Root}:whoisEmojiRoles`, { roles: emoji.roleIds.map((id) => roleMention(id)).join(' ') }));
		}
		if (emoji.managed) lines.push(translateKey(t, `${Root}:whoisEmojiManaged`));
		if (!emoji.available) lines.push(translateKey(t, `${Root}:whoisEmojiUnavailable`));
		return lines;
	}
}
