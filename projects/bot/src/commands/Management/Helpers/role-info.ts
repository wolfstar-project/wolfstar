import { WolfCommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { PermissionLevels } from '#lib/types/Enums';
import { BrandingColors } from '#utils/constants';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { PermissionFlagsBits } from 'discord-api-types/v9';
import { MessageEmbed, Permissions } from 'discord.js';

@ApplyOptions<WolfCommand.Options>({
	description: 'commands/management:roleInfoDescription',
	detailedDescription: 'commands/management:roleInfoExtended',
	permissionLevel: PermissionLevels.Moderator,
	requiredClientPermissions: [PermissionFlagsBits.EmbedLinks],
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends WolfCommand {
	public async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const role = args.finished ? message.member.roles.highest : await args.pick('roleName');
		const roleInfoTitles = args.t('commands/management:roleInfoTitles');

		const permissions = role.permissions.has(Permissions.FLAGS.ADMINISTRATOR)
			? args.t('commands/management:roleInfoAll')
			: role.permissions.toArray().length > 0
				? role.permissions
						.toArray()
						.map((key) => `+ **${args.t(`permissions:${key}`, key)}**`)
						.join('\n')
				: args.t('commands/management:roleInfoNoPermissions');

		const description = args.t('commands/management:roleInfoData', {
			role,
			hoisted: args.t(role.hoist ? 'globals:yes' : 'globals:no'),
			mentionable: args.t(role.mentionable ? 'globals:yes' : 'globals:no')
		});

		const embed = new MessageEmbed()
			.setColor(role.color || BrandingColors.Secondary)
			.setTitle(`${role.name} [${role.id}]`)
			.setDescription(description)
			.addField(roleInfoTitles.PERMISSIONS, permissions);
		return send(message, { embeds: [embed] });
	}
}
