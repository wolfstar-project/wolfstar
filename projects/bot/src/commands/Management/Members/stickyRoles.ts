import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { getStickyRoles } from '#utils/functions';
import { Command, RegisterCommand, RegisterSubcommand, container, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { ApplicationIntegrationType, InteractionContextType, MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

const Root = 'commands/management:stickyRoles';

@RegisterCommand((builder) =>
	applyLocalizedBuilder(builder, Root)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts(InteractionContextType.Guild)
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
)
export class UserCommand extends Command {
	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandAdd`)
			.addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true))
			.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
	)
	public async add(interaction: GuildChatInputInteraction, options: UserCommand.UserRoleArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { user, role } = options;

		const stickyRoles = await this.getStickyRoles(interaction);
		await stickyRoles.add(user.id, role.id);

		const content = translateKey(t, 'commands/management:stickyRolesAdd', { user: user.user.username });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandRemove`)
			.addUserOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true))
			.addRoleOption((option) => applyLocalizedBuilder(option, 'commands/shared:optionsRole').setRequired(true))
	)
	public async remove(interaction: GuildChatInputInteraction, options: UserCommand.UserRoleArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { user, role } = options;

		const stickyRoles = await this.getStickyRoles(interaction);
		const roles = await stickyRoles.fetch(user.id);
		if (roles.length === 0) {
			const content = translateKey(t, 'commands/management:stickyRolesNotExists', { user: user.user.username });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		await stickyRoles.remove(user.id, role.id);

		const content = translateKey(t, 'commands/management:stickyRolesRemove', { user: user.user.username });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandReset`).addUserOption((option) =>
			applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true)
		)
	)
	public async reset(interaction: GuildChatInputInteraction, options: UserCommand.UserArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { user } = options;

		const stickyRoles = await this.getStickyRoles(interaction);
		const roles = await stickyRoles.fetch(user.id);
		if (roles.length === 0) {
			const content = translateKey(t, 'commands/management:stickyRolesNotExists', { user: user.user.username });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		await stickyRoles.clear(user.id);

		const content = translateKey(t, 'commands/management:stickyRolesReset', { user: user.user.username });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	@RegisterSubcommand((builder) =>
		applyLocalizedBuilder(builder, `${Root}SubcommandShow`).addUserOption((option) =>
			applyLocalizedBuilder(option, 'commands/shared:optionsUser').setRequired(true)
		)
	)
	public async show(interaction: GuildChatInputInteraction, options: UserCommand.UserArguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Administrator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const { user } = options;

		const stickyRoles = await this.getStickyRoles(interaction);
		const sticky = await stickyRoles.fetch(user.id);
		if (sticky.length === 0) {
			return interaction.reply({ content: translateKey(t, 'commands/management:stickyRolesShowEmpty'), flags: MessageFlags.Ephemeral });
		}

		const names = await Promise.all(
			sticky.map(async (roleId) => {
				const role = await container.gatewayClient.roles.get(interaction.guildId, roleId);
				return `\`${role?.name ?? roleId}\``;
			})
		);

		const content = translateKey(t, 'commands/management:stickyRolesShowSingle', { user: user.user.username, roles: names });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}

	private async getStickyRoles(interaction: GuildChatInputInteraction) {
		// The guild is fetched so the utilities can be created even if it is not cached yet:
		const guild = await container.gatewayClient.guilds.fetch(interaction.guildId);
		return getStickyRoles(guild);
	}
}

export namespace UserCommand {
	export interface UserArguments {
		user: TransformedArguments.User;
	}

	export interface UserRoleArguments extends UserArguments {
		role: TransformedArguments.Role;
	}
}
