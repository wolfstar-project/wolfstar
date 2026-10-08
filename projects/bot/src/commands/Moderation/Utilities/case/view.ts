import { getEmbed } from '#lib/moderation/common';
import { CommandPermissionLevel, RequiresCommandPermissionLevel, type GuildChatInputInteraction } from '#lib/structures/commands';
import { getCase, getDisplayT, handleCase } from '#lib/structures/commands/moderationCase';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/case view`, see the `case` parent command.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:view')
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
		.addBooleanOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsShow'))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Moderator)
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'case view'>) {
		return handleCase(interaction, async () => {
			const entry = await getCase(interaction, options.case);
			const show = options.show ?? false;

			const deferred = await interaction.defer(show ? undefined : { flags: MessageFlags.Ephemeral });
			const embed = await getEmbed(getDisplayT(interaction, show), entry);
			return deferred.update({ embeds: [embed.toJSON()] });
		});
	}
}
