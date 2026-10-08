import { CommandPermissionLevel, RequiresCommandPermissionLevel, type GuildChatInputInteraction } from '#lib/structures/commands';
import { getCase, handleCase } from '#lib/structures/commands/moderationCase';
import { getModeration } from '#utils/functions';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import type { CommandOptionsRegistry } from '@wolfstar/http-framework';

/**
 * `/case archive`, see the `case` parent command.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:archive') //
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Moderator)
	public override chatInputRun(interaction: GuildChatInputInteraction, options: CommandOptionsRegistry['case archive']) {
		return handleCase(interaction, async (t) => {
			const entry = await getCase(interaction, options.case);
			await (await getModeration(interaction.guildId)).archive(entry);

			return interaction.reply({ content: t('commands/case:archiveSuccess', { caseId: entry.id }), flags: MessageFlags.Ephemeral });
		});
	}
}
