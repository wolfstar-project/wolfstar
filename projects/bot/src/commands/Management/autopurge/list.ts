import { CleanupRoot, describeCleanupFilter } from '#lib/moderation/cleanup/commands';
import { readAutoPurges } from '#lib/moderation/cleanup/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { channelMention, inlineCode, time, TimestampStyles } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = CleanupRoot;

/**
 * `/autopurge list`, see the `autopurge` parent command. Lists the channels that are purged, with their interval, what
 * is deleted and when the next purge is.
 */
@RegisterAsSubcommand('autopurge', (builder) => applyLocalizedBuilder(builder, `${Root}:autopurgeList`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const purges = await readAutoPurges(interaction.guildId);

		const lines = purges.map((purge) =>
			translateKey(t, `${Root}:autopurgeListLine`, {
				channel: channelMention(purge.channelId),
				interval: translateKey(t, 'globals:durationValue', { value: purge.interval }),
				filter: describeCleanupFilter(t, purge.filter, purge.value),
				next: time(Math.floor(purge.nextRunAt / 1000), TimestampStyles.RelativeTime)
			})
		);

		const embed = new EmbedBuilder()
			.setColor(Colors.Blue)
			.setTitle(translateKey(t, `${Root}:autopurgeListTitle`, { count: purges.length }))
			.setDescription(
				lines.length === 0 ? translateKey(t, `${Root}:autopurgeListEmpty`, { command: inlineCode('/autopurge enable') }) : lines.join('\n')
			);
		return interaction.reply({ embeds: [embed.toJSON()], flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
