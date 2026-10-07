import { CommandPermissionLevel, getCommandPermissionDenial } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction, type TranslationKey } from '#lib/structures/commands/utils';
import { PermissionsBits } from '#utils/bits';
import { BrandingColors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { container, type TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags, PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * The data of a role the command displays, whether it comes from the `role` option or from the roles of the member.
 */
interface RoleData {
	id: string;
	name: string;
	color: number;
	hoist: boolean;
	mentionable: boolean;
	position: number;
	permissions: bigint;
}

/**
 * `/whois role`, see the `whois` parent command. Displays a role, or the highest one of the author. It requires the
 * moderator permission level.
 */
@RegisterAsSubcommand('whois', (builder) =>
	applyLocalizedBuilder(builder, 'commands/tools:whoisSubcommandRole').addRoleOption((option) =>
		applyLocalizedBuilder(option, 'commands/tools:whoisOptionsRole').setRequired(false)
	)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: UserCommand.Arguments) {
		const denial = await getCommandPermissionDenial(interaction, CommandPermissionLevel.Moderator);
		if (denial !== null) return interaction.reply({ content: denial, flags: MessageFlags.Ephemeral });

		const t = getSupportedUserLanguageT(interaction);
		const role = options.role === undefined ? await this.getHighestRole(interaction) : this.fromApi(options.role);

		const permissionsString = PermissionsBits.has(role.permissions, PermissionFlagsBits.Administrator)
			? translateKey(t, 'commands/management:roleInfoAll')
			: role.permissions > 0n
				? PermissionsBits.toArray(role.permissions)
						.map((name) => `+ ${translateKey(t, `permissions:${name}` as TranslationKey)}`)
						.join('\n')
				: translateKey(t, 'commands/management:roleInfoNoPermissions');

		const description = translateKey(t, 'commands/management:roleInfoData', {
			role: { id: role.id, name: role.name, hexColor: `#${role.color.toString(16).padStart(6, '0')}`, rawPosition: role.position },
			hoisted: translateKey(t, role.hoist ? 'globals:yes' : 'globals:no'),
			mentionable: translateKey(t, role.mentionable ? 'globals:yes' : 'globals:no')
		});

		const embed = new EmbedBuilder()
			.setColor(role.color || BrandingColors.Secondary)
			.setTitle(`${role.name} [${role.id}]`)
			.setDescription(description)
			.addFields({ name: translateKey(t, 'commands/management:roleInfoTitles.PERMISSIONS' as TranslationKey), value: permissionsString });
		return interaction.reply({ embeds: [embed.toJSON()] });
	}

	private fromApi(role: TransformedArguments.Role): RoleData {
		return {
			id: role.id,
			name: role.name,
			color: role.color,
			hoist: role.hoist,
			mentionable: role.mentionable,
			position: role.position,
			permissions: BigInt(role.permissions)
		};
	}

	/**
	 * Gets the highest role of the author, `@everyone` if they have no other, which is what `member.roles.highest` is.
	 */
	private async getHighestRole(interaction: GuildChatInputInteraction): Promise<RoleData> {
		const memberRoles = new Set(interaction.member.roles);
		const roles = await container.gatewayClient.roles.fetchAll(interaction.guildId);

		let highest = roles.find((role) => role.id === interaction.guildId)!;
		for (const role of roles) {
			if (memberRoles.has(role.id) && role.position > highest.position) highest = role;
		}

		return {
			id: highest.id,
			name: highest.name,
			color: highest.color,
			hoist: highest.hoist,
			mentionable: highest.mentionable,
			position: highest.position,
			permissions: BigInt(highest.permissions.bitField)
		};
	}
}

export namespace UserCommand {
	export interface Arguments {
		role?: TransformedArguments.Role;
	}
}
