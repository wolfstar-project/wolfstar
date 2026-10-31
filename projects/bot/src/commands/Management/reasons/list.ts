import { readModerationReasons } from '#lib/moderation/reasons';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { inlineCode } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';
import { MaximumModerationReasons } from 'wolfstar-database';

/**
 * `/reasons list`, see the `reasons` parent command. Lists the predefined reasons of the server.
 */
@RegisterAsSubcommand('reasons', (builder) => applyLocalizedBuilder(builder, 'commands/reasons:list'))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const reasons = await readModerationReasons(interaction.guildId);
		const content =
			reasons.length === 0
				? translateKey(t, 'commands/reasons:listEmpty')
				: [
						translateKey(t, 'commands/reasons:listTitle', { count: reasons.length, maximum: MaximumModerationReasons }),
						...reasons.map((entry) => `- ${inlineCode(entry.alias)}: ${entry.reason}`)
					].join('\n');

		return interaction.reply({ content: content.slice(0, 2000), flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
