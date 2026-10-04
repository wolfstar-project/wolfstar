import { writeSettingsTransaction } from '#lib/database';
import { type ReactionRole } from 'wolfstar-database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getEmojiTextFormat } from '#utils/functions';
import { channelMention } from '@discordjs/builders';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const SnowflakeRegExp = /^\d{17,20}$/;

/**
 * `/reaction-roles remove`, see the `reaction-roles` parent command.
 */
@RegisterAsSubcommand('reaction-roles', (builder) =>
	applyLocalizedBuilder(builder, `commands/management:manageReactionRolesSubcommandRemove`)
		.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
		.addStringOption((option) => applyLocalizedBuilder(option, `commands/management:manageReactionRolesOptionsRemoveMessage`).setRequired(true))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const t = getSupportedUserLanguageT(interaction);
		const { role, message } = options;
		if (!SnowflakeRegExp.test(message)) {
			const content = translateKey(t, 'arguments:snowflake', { parameter: message, message: { id: interaction.id } });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		using trx = await writeSettingsTransaction(interaction.guildId);
		const { reactionRoles } = trx.settings;
		const index = reactionRoles.findIndex((entry: ReactionRole) => (entry.message ?? entry.channel) === message && entry.role === role.id);
		if (index === -1) {
			return interaction.reply({
				content: translateKey(t, 'commands/management:manageReactionRolesRemoveNotExists'),
				flags: MessageFlags.Ephemeral
			});
		}

		const reactionRole = reactionRoles[index];
		await trx.write({ reactionRoles: reactionRoles.toSpliced(index, 1) }).submitWithAudit(interaction.user.id);

		const url = reactionRole.message
			? `<https://discord.com/channels/${interaction.guildId}/${reactionRole.channel}/${reactionRole.message}>`
			: channelMention(reactionRole.channel);
		const content = translateKey(t, 'commands/management:manageReactionRolesRemove', { emoji: getEmojiTextFormat(reactionRole.emoji), url });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	role: TransformedArguments.Role;
	message: string;
}
