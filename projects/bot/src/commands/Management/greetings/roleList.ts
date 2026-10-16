import { readRoleMessages } from '#lib/greetings/roleMessages';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention, roleMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = 'commands/greetings';

/**
 * `/greetings role-list`, see the `greetings` parent command. Lists the role messages of the server.
 */
@RegisterAsSubcommand('greetings', (builder) => applyLocalizedBuilder(builder, `${Root}:roleList`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const messages = await readRoleMessages(interaction.guildId);
		const lines = messages.map((message) => {
			const parts = [message.added === null ? null : `+ ${message.added}`, message.removed === null ? null : `− ${message.removed}`].filter(
				(part) => part !== null
			);
			return `- ${roleMention(message.roleId)} → ${channelMention(message.channelId)}\n  ${parts.join('\n  ')}`;
		});
		const content = messages.length === 0 ? translateKey(t, `${Root}:roleListEmpty`) : lines.join('\n');
		return interaction.reply({ content: content.slice(0, 2000), flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
