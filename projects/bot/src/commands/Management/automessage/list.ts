import { AutoMessageRoot } from '#lib/automessages/render';
import { readAutoMessages } from '#lib/automessages/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { channelMention, inlineCode, time, TimestampStyles } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = AutoMessageRoot;

/**
 * `/automessage list`, see the `automessage` parent command. Lists the channels that get a message, with its interval,
 * when it is sent next and how it starts.
 */
@RegisterAsSubcommand('automessage', (builder) => applyLocalizedBuilder(builder, `${Root}:automessageList`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const messages = await readAutoMessages(interaction.guildId);

		const lines = messages.map((message) =>
			translateKey(t, `${Root}:automessageListLine`, {
				channel: channelMention(message.channelId),
				interval: translateKey(t, 'globals:durationValue', { value: message.interval }),
				next: time(Math.floor(message.nextRunAt / 1000), TimestampStyles.RelativeTime),
				// The first line of the text, quoted so its markdown and its mentions are shown as they are written:
				content: inlineCode(cutText(message.content.split('\n')[0]!.replaceAll('`', "'"), 80))
			})
		);

		const embed = new EmbedBuilder()
			.setColor(Colors.Blue)
			.setTitle(translateKey(t, `${Root}:automessageListTitle`, { count: messages.length }))
			.setDescription(
				lines.length === 0
					? translateKey(t, `${Root}:automessageListEmpty`, { command: inlineCode('/automessage enable') })
					: lines.join('\n')
			);
		return interaction.reply({ embeds: [embed.toJSON()], flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
