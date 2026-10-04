import { readSettings, type ReactionRole } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getEmojiTextFormat } from '#utils/functions';
import { getColor } from '#utils/util';
import { EmbedBuilder, channelMention, hideLinkEmbed, hyperlink, roleMention } from '@discordjs/builders';
import { chunk } from '@sapphire/utilities';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * The amount of reaction roles in each embed.
 */
const EntriesPerEmbed = 15;

/**
 * The maximum amount of embeds Discord accepts in a message.
 */
const MaximumEmbeds = 10;

/**
 * `/reaction-roles show`, see the `reaction-roles` parent command.
 */
@RegisterAsSubcommand('reaction-roles', (builder) => applyLocalizedBuilder(builder, `commands/management:manageReactionRolesSubcommandShow`))
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const { reactionRoles } = await readSettings(interaction.guildId);
		if (reactionRoles.length === 0) {
			return interaction.reply({ content: translateKey(t, 'commands/management:manageReactionRolesShowEmpty'), flags: MessageFlags.Ephemeral });
		}

		const member = await this.container.gatewayClient.members.fetch(interaction.guildId, interaction.user.id);
		const color = await getColor({ member });

		// Every chunk of the list is sent as an embed of the same message:
		const embeds = chunk(reactionRoles as readonly ReactionRole[], EntriesPerEmbed)
			.slice(0, MaximumEmbeds)
			.map((bulk) =>
				new EmbedBuilder()
					.setColor(color)
					.setDescription(bulk.map((entry) => this.format(entry, interaction.guildId)).join('\n'))
					.toJSON()
			);
		return interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
	}

	private format(entry: ReactionRole, guildId: string): string {
		const emoji = getEmojiTextFormat(entry.emoji);
		const role = roleMention(entry.role);
		const url = entry.message
			? hyperlink('🔗', hideLinkEmbed(`https://discord.com/channels/${guildId}/${entry.channel}/${entry.message}`))
			: channelMention(entry.channel);
		return `${emoji} | ${role} -> ${url}`;
	}
}
