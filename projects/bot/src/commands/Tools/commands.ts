import {
	createCommandsMenuContext,
	normalizeCommandQuery,
	renderCommand,
	renderCommandsList,
	renderCommandsResults
} from '#lib/structures/commands-menu';
import { Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType } from 'discord-api-types/v10';

/**
 * Opens the commands menu, which lists what the bot can do: it takes the place of the `help` command.
 *
 * @remarks
 *
 * The menu is an ephemeral message made of components: a select menu picks the category, every command has a button
 * that shows it with its subcommands, and a modal searches them. The clicks are handled by the `commands` interaction
 * handler, see `lib/structures/commands-menu`. With the `command` option the menu opens on that command, or on what a
 * search for it finds.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/commands:name', 'commands/commands:description')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/commands:optionsCommand').setMaxLength(32).setAutocomplete(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: Command.ChatInputInteraction, args: { command?: string }) {
		const context = await createCommandsMenuContext(interaction, interaction.user.id);
		const query = normalizeCommandQuery((args.command ?? '').replace(/^\//, ''));
		if (query.length === 0) return interaction.reply(renderCommandsList(context, '', 0));

		const command = context.commands.find((entry) => entry.name === query);
		return interaction.reply(command ? renderCommand(context, command) : renderCommandsResults(context, query, 0));
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction, args: Command.AutocompleteArguments<{ command: string }>) {
		if (args.focused !== 'command') return interaction.replyEmpty();

		const query = (args.command ?? '').toLowerCase().replace(/^\//, '');
		const { commands } = await createCommandsMenuContext(interaction, interaction.user.id);
		const choices = commands
			.filter((command) => command.name.includes(query))
			.slice(0, 25)
			.map((command) => ({ name: `/${command.name}`, value: command.name }));
		return interaction.reply({ choices });
	}
}
