import { WolfCommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { PermissionLevels } from '#lib/types/Enums';
import { getStickyRoles } from '#utils/functions';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { PermissionFlagsBits } from 'discord-api-types/v9';

@ApplyOptions<WolfCommand.Options>({
	description: 'commands/management:stickyRolesDescription',
	detailedDescription: 'commands/management:stickyRolesExtended',
	permissionLevel: PermissionLevels.Administrator,
	requiredClientPermissions: [PermissionFlagsBits.ManageRoles],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subCommands: ['add', 'remove', 'reset', { input: 'show', default: true }]
})
export class UserCommand extends WolfCommand {
	public async add(message: GuildMessage, args: WolfCommand.Args) {
		const user = await args.pick('userName');
		const role = await args.pick('roleName');

		const stickyRoles = getStickyRoles(message.guild);
		await stickyRoles.add(user.id, role.id);

		const content = args.t('commands/management:stickyRolesAdd', { user: user.username });
		return send(message, content);
	}

	public async remove(message: GuildMessage, args: WolfCommand.Args) {
		const user = await args.pick('userName');

		const stickyRoles = getStickyRoles(message.guild);
		const roles = await stickyRoles.fetch(user.id);
		if (!roles.length) this.error('commands/management:stickyRolesNotExists', { user: user.username });

		const role = await args.pick('roleName');
		await stickyRoles.remove(user.id, role.id);

		const content = args.t('commands/management:stickyRolesRemove', { user: user.username });
		return send(message, content);
	}

	public async reset(message: GuildMessage, args: WolfCommand.Args) {
		const user = await args.pick('userName');

		const stickyRoles = getStickyRoles(message.guild);
		const roles = await stickyRoles.fetch(user.id);
		if (!roles.length) this.error('commands/management:stickyRolesNotExists', { user: user.username });

		await stickyRoles.clear(user.id);

		const content = args.t('commands/management:stickyRolesReset', { user: user.username });
		return send(message, content);
	}

	public async show(message: GuildMessage, args: WolfCommand.Args) {
		const user = await args.pick('userName');

		const stickyRoles = getStickyRoles(message.guild);
		const sticky = await stickyRoles.fetch(user.id);
		if (!sticky.length) this.error('commands/management:stickyRolesShowEmpty');

		const roles = message.guild.roles.cache;
		const names = sticky.map((role) => roles.get(role)!.name);

		const content = args.t('commands/management:stickyRolesShowSingle', {
			user: user.username,
			roles: names.map((name) => `\`${name}\``)
		});
		return send(message, content);
	}
}
