import type { GuildChatInputInteraction } from '#lib/structures/commands';
import { getCase, handleCase } from '#lib/structures/commands/moderationCase';
import { getModeration } from '#utils/functions';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/case delete`, see the `case` parent command.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:delete') //
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'case delete'>) {
		return handleCase(interaction, async (t) => {
			const entry = await getCase(interaction, options.case);
			await (await getModeration(interaction.guildId)).delete(entry);

			return interaction.reply({ content: t('commands/case:deleteSuccess', { caseId: entry.id }), flags: MessageFlags.Ephemeral });
		});
	}
}
