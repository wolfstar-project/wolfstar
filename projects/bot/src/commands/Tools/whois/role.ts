import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/whois role`, see the `whois` parent command.
 *
 * It displays what `/role-info` does, so it is run through that command, which keeps its permission level.
 */
@RegisterAsSubcommand('whois', (builder) =>
	applyLocalizedBuilder(builder, 'commands/tools:whoisSubcommandRole') //
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/tools:whoisOptionsRole').setRequired(false))
)
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		return this.container.stores.get('commands').get('role-info')?.chatInputRun?.(interaction, options);
	}
}

interface Options {
	role?: TransformedArguments.Role;
}
