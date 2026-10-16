import { addRoleMessage, RoleMessageLimitError } from '#lib/greetings/roleMessages';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { roleMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';
import { MaximumRoleMessages } from 'wolfstar-database';

const Root = 'commands/greetings';

/**
 * `/greetings role-set`, see the `greetings` parent command. Sets the messages sent when a member gets or loses a role.
 */
@RegisterAsSubcommand('greetings', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:roleSet`)
		.addRoleOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRole`).setRequired(true))
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsChannel`)
				.setRequired(true)
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsAdded`).setMaxLength(1000))
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRemoved`).setMaxLength(1000))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'greetings role-set'>) {
		const t = getSupportedUserLanguageT(interaction);
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
		const added = options.added?.trim() || null;
		const removed = options.removed?.trim() || null;
		if (added === null && removed === null) return reply(translateKey(t, `${Root}:roleNoMessages`));

		try {
			const created = await addRoleMessage(interaction.guildId, { roleId: options.role.id, channelId: options.channel.id, added, removed });
			return reply(translateKey(t, created ? `${Root}:roleAdded` : `${Root}:roleReplaced`, { role: roleMention(options.role.id) }));
		} catch (error) {
			if (error instanceof RoleMessageLimitError) return reply(translateKey(t, `${Root}:roleLimit`, { maximum: MaximumRoleMessages }));
			throw error;
		}
	}
}
