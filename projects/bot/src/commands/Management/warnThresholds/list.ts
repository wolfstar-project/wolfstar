import { formatWarnThreshold } from '#lib/moderation/warnThresholdsFormat';
import { resolveWarnThresholds } from '#lib/moderation/warnThresholds';
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
		const { thresholds, defaults } = await resolveWarnThresholds(interaction.guildId);
		const lines = thresholds.map((threshold) => `- ${formatWarnThreshold(t, threshold)}`);
		const content =
			thresholds.length === 0
				? t(`${Root}:listEmpty`)
				: defaults
					? [t(`${Root}:listDefaultsTitle`), ...lines, t(`${Root}:listDefaultsFooter`)].join('\n')
					: [t(`${Root}:listTitle`, { count: thresholds.length, maximum: MaximumWarnThresholds }), ...lines].join('\n');

		return interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
