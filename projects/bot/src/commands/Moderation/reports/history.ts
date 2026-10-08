import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { getTag } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { time, TimestampStyles, userMention } from '@discordjs/formatters';
import { cutText } from '@sapphire/utilities';
import { container, type CommandOptionsRegistry } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { fetchReports } from 'wolfstar-database';

/**
 * How many reports the history lists, the latest ones.
 */
const HistoryLength = 10;

/**
 * `/reports history`, see the `reports` parent command. Lists the latest reports, of everybody or about one user,
 * with what became of each. Who made an anonymous report is not shown.
 */
@RegisterAsSubcommand('reports', (builder) =>
	applyLocalizedBuilder(builder, 'commands/report:history').addUserOption((option) =>
		applyLocalizedBuilder(option, 'commands/report:optionsHistoryUser')
	)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Moderator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, args: CommandOptionsRegistry['reports history']) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const reports = await fetchReports(container.prisma.orm, interaction.guildId, { targetId: args.user?.id ?? null, limit: HistoryLength });

		const lines = reports.map((report) =>
			t('commands/report:historyLine', {
				id: report.id,
				time: time(Math.floor(report.createdAt / 1000), TimestampStyles.RelativeTime),
				target: userMention(report.targetId),
				status: t(`commands/report:statusName${report.status}`),
				moderator: report.moderatorId === null ? '' : t('commands/report:historyModerator', { moderator: userMention(report.moderatorId) }),
				reporter: report.anonymous ? t('commands/report:historyAnonymous') : userMention(report.reporterId),
				reason: cutText(report.reason.replaceAll('\n', ' '), 150)
			})
		);

		const embed = new EmbedBuilder()
			.setColor(Colors.Red)
			.setTitle(args.user ? t('commands/report:historyTitleUser', { tag: getTag(args.user.user) }) : t('commands/report:historyTitle'))
			.setDescription(lines.length === 0 ? t('commands/report:historyEmpty') : lines.join('\n'));
		return interaction.reply({ embeds: [embed.toJSON()], flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
