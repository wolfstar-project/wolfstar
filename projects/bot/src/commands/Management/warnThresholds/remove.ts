import { removeWarnThreshold } from '#lib/moderation/warnThresholds';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/warn-thresholds';

/**
 * `/warn-thresholds remove`, see the `warn-thresholds` parent command. Removes what happens at a number of warnings.
 */
@RegisterAsSubcommand('warn-thresholds', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:remove`).addIntegerOption((option) =>
		applyLocalizedBuilder(option, `${Root}:optionsCount`).setRequired(true).setMinValue(1).setMaxValue(50)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'warn-thresholds remove'>) {
		const t = getSupportedUserLanguageT(interaction);
		const removed = await removeWarnThreshold(interaction.guildId, options.count);
		const key = removed ? `${Root}:removed` : `${Root}:notFound`;
		return interaction.reply({ content: translateKey(t, key, { count: options.count }), flags: MessageFlags.Ephemeral });
	}
}
