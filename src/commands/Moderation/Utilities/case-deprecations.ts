import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfCommand } from '#lib/structures';
import { PermissionLevels, type GuildMessage } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { chatInputApplicationCommandMention } from 'discord.js';

@ApplyOptions<WolfCommand.Options>({
	name: '\u200Bcase-deprecations',
	aliases: ['reason', 'time', 'unwarn', 'uw', 'unwarning', 'history', 'hd', 'ho', 'moderation', 'moderations', 'mutes', 'warnings'],
	description: LanguageKeys.Commands.General.V7Description,
	detailedDescription: LanguageKeys.Commands.General.V7Extended,
	permissionLevel: PermissionLevels.Moderator,
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends WolfCommand {
	public override async messageRun(message: GuildMessage, args: WolfCommand.Args, context: WolfCommand.RunContext) {
		const caseCommand = this.store.get('case') as WolfCommand;
		const id = caseCommand.getGlobalCommandId();
		const command = chatInputApplicationCommandMention(caseCommand.name, this.#getSubcommand(context.commandName), id);
		const content = args.t(LanguageKeys.Commands.Shared.DeprecatedMessage, { command });
		return send(message, content);
	}

	#getSubcommand(name: string) {
		switch (name) {
			case 'reason':
			case 'time':
				return 'edit';
			case 'unwarn':
			case 'unwarning':
			case 'uw':
				return 'archive';
			case 'hd':
			case 'history':
			case 'ho':
			case 'moderation':
			case 'moderations':
			case 'mutes':
			case 'warnings':
				return 'list';
			default:
				return 'view';
		}
	}
}
