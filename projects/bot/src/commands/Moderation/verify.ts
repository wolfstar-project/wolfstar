import { admitJoinGuardMember } from '#lib/moderation/joinguard/checkpoint';
import { JoinGuardRoot } from '#lib/moderation/joinguard/commands';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { userMention } from '@discordjs/formatters';
import { ApplyOptions } from '@wolfstar/decorators';
import { Command, RegisterCommand } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

const Root = JoinGuardRoot;

/**
 * `/verify`, lets a member in past the join guard by hand: the pending role is taken, the verified role given, and the
 * row of the member who waits at the checkpoint is resolved in the name of the moderator. It works for a member the
 * guard never stopped too, who only gets the verified role. See `lib/moderation/joinguard`.
 */
@ApplyOptions<Command.Options>({ preconditions: ['moderator'] })
@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, `${Root}:verify`)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
		.addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'verify'>) {
		const t = getSupportedUserLanguageT(interaction);
		const user = userMention(options.user.user.id);
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });

		const result = await admitJoinGuardMember(interaction.guildId, options.user.user.id, { kind: 'Moderator', moderatorId: interaction.user.id });
		const content = result.ok
			? result.value.checkpoint === null && !result.value.changedRoles
				? translateKey(t, `${Root}:verifyNothing`, { user })
				: translateKey(t, `${Root}:verifyDone`, { user })
			: translateKey(t, `${Root}:verifyFailed`, { user, error: result.error.detail });
		return deferred.update({ content, allowed_mentions: { parse: [] } });
	}
}
