import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfCommand, WolfSubcommand } from '#lib/structures';
import { PermissionLevels, type GuildMessage } from '#lib/types';
import { ButtonWolfV7, makeRemovedMessage, makeRow } from '#utils/deprecate';
import { ApplyOptions, RequiresClientPermissions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { PermissionFlagsBits } from 'discord.js';

const row = makeRow(ButtonWolfV7);

@ApplyOptions<WolfSubcommand.Options>({
	aliases: ['twitch-subscription', 't-subscription', 't-sub'],
	description: LanguageKeys.Commands.General.V7Description,
	detailedDescription: LanguageKeys.Commands.General.V7Extended,
	permissionLevel: PermissionLevels.Administrator,
	requiredClientPermissions: [PermissionFlagsBits.EmbedLinks],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subcommands: [
		{ name: 'add', messageRun: 'add' },
		{ name: 'remove', messageRun: 'remove' },
		{ name: 'reset', messageRun: 'reset' },
		{ name: 'show', messageRun: 'show', default: true }
	]
})
export class UserCommand extends WolfSubcommand {
	public async add(message: GuildMessage, args: WolfSubcommand.Args) {
		return send(message, makeRemovedMessage(args.commandContext.commandName, row));
	}

	public async remove(message: GuildMessage, args: WolfCommand.Args) {
		return send(message, makeRemovedMessage(args.commandContext.commandName, row));
	}

	public async reset(message: GuildMessage, args: WolfCommand.Args) {
		return send(message, makeRemovedMessage(args.commandContext.commandName, row));
	}

	@RequiresClientPermissions(PermissionFlagsBits.EmbedLinks)
	public async show(message: GuildMessage, args: WolfCommand.Args) {
		return send(message, makeRemovedMessage(args.commandContext.commandName, row));
	}
}
