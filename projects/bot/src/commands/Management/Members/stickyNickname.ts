import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { ApplyOptions } from '@wolfstar/decorators';
import { Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';
import { fetchStickyNickname } from 'wolfstar-database';

/**
 * `/sticky-nickname`, shows the nickname that is set again when a member joins the server back. It is made sticky with
 * the `sticky` option of `/setnickname`, and removed by resetting the nickname with that command.
 */
@ApplyOptions<Command.Options>({ preconditions: ['moderator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, 'commands/management:stickyNickname')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'sticky-nickname'>) {
		const { user } = options;
		const t = getSupportedUserLanguageT(interaction);

		const nickname = await fetchStickyNickname(this.container.prisma, interaction.guildId, user.id);
		const content =
			nickname === null
				? translateKey(t, 'commands/management:stickyNicknameEmpty', { user: user.user.username })
				: translateKey(t, 'commands/management:stickyNicknameSingle', { user: user.user.username, nickname });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
