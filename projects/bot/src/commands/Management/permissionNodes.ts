import type { Command } from '@wolfstar/http-framework';
import { RegisterCommand, container } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Subcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ApplicationIntegrationType, InteractionContextType, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * Configures the permission nodes of the server.
 *
 * @remarks
 *
 * - The `add`, `remove`, `reset` and `show` subcommands, which are wired onto this command by
 *   `@wolfstar/plugin-subcommands-advanced`, take the role or the user as a mentionable `target`, the command as a
 *   `command` option with autocomplete, and the `type` (`allow` or `deny`) as a choice.
 * - The command is resolved with `CommandMatcher`, so it is `*`, a `category.*` or `category.subCategory.*`, or the name
 *   of a command with an optional category and sub-category. The nodes are edited with `PermissionNodeManager`.
 * - `show` lists every node when it has no `target`.
 * - The autocomplete stays on the parent: the plugin routes `chatInputRun` to the children, but autocomplete
 *   interactions are dispatched by the name of the top-level command and never reach them.
 */
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:permissionNodes')
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
)
export class UserCommand extends Subcommand {
	public override autocompleteRun(
		interaction: Command.AutocompleteInteraction,
		args: Command.AutocompleteArguments<Pick<Command.OptionsOf<'permission-nodes add'>, 'command'>>
	) {
		if (args.focused !== 'command') return interaction.replyEmpty();

		// The commands are matched by the name of their piece, see `CommandMatcher`:
		const query = (args.command ?? '').toLowerCase();
		const choices: { name: string; value: string }[] = [];
		if ('*'.startsWith(query)) choices.push({ name: '*', value: '*' });
		for (const piece of container.stores.get('commands').values()) {
			if (choices.length >= 25) break;
			if (piece.router.chatInputName !== null && piece.name.toLowerCase().includes(query))
				choices.push({ name: piece.name, value: piece.name });
		}

		return interaction.reply({ choices });
	}
}
