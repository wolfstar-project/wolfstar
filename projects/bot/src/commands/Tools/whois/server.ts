import type { GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';

/**
 * `/whois server`, see the `whois` parent command.
 *
 * It displays what `/server-info` does, so it is run through that command.
 */
@RegisterAsSubcommand('whois', (builder) => applyLocalizedBuilder(builder, 'commands/tools:whoisSubcommandServer'))
export class UserCommand extends Command {
	public override chatInputRun(interaction: GuildChatInputInteraction) {
		return this.container.stores.get('commands').get('guild-info')?.chatInputRun?.(interaction, {});
	}
}
