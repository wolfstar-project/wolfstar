import { formatWarnThreshold } from '#lib/moderation/warnThresholdsFormat';
import { readWarnThresholds } from '#lib/moderation/warnThresholds';
import { createTranslator, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { MaximumWarnThresholds } from 'wolfstar-database';

const Root = 'commands/warn-thresholds';

/**
 * `/warn-thresholds list`, see the `warn-thresholds` parent command. Lists the thresholds of the server.
 */
@RegisterAsSubcommand('warn-thresholds', (builder) => applyLocalizedBuilder(builder, `${Root}:list`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = createTranslator(getSupportedUserLanguageT(interaction));
		const thresholds = await readWarnThresholds(interaction.guildId);
		const content =
			thresholds.length === 0
				? t(`${Root}:listEmpty`)
				: [
						t(`${Root}:listTitle`, { count: thresholds.length, maximum: MaximumWarnThresholds }),
						...thresholds.map((threshold) => `- ${formatWarnThreshold(t, threshold)}`)
					].join('\n');

		return interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
