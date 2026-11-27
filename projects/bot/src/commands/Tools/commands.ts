import { createCommandsMenuContext, renderCommandsList } from '#lib/structures/commands-menu';
import { Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';

/**
 * Opens the commands menu, which lists what the bot can do: it takes the place of the `help` command.
 *
 * @remarks
 *
 * The menu is a message of components that everybody in the channel sees, and only who opened it uses: a select menu
 * picks the category, and every command has a button that edits its rules. Its search button opens a modal, and what
 * the search finds is answered in a message of its own under the menu, which only who searched sees. The clicks are
 * handled by the `commands` interaction handler, see `lib/structures/commands-menu`.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/commands:name', 'commands/commands:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputInteraction) {
		const context = await createCommandsMenuContext(interaction, interaction.user.id, { legacy: true });
		return interaction.reply(renderCommandsList(context, '', 0));
	}
}
