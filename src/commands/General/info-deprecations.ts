import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfCommand } from '#lib/structures';
import { PermissionLevels, type GuildMessage } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { chatInputApplicationCommandMention } from 'discord.js';

@ApplyOptions<WolfCommand.Options>({
	name: '\u200Binfo-deprecations',
	aliases: ['invite', 'donate', 'support', 'support-server', 'server'],
	description: LanguageKeys.Commands.General.V7Description,
	detailedDescription: LanguageKeys.Commands.General.V7Extended,
	permissionLevel: PermissionLevels.Moderator,
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends WolfCommand {
	public override async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const caseCommand = this.store.get('info') as WolfCommand;
		const id = caseCommand.getGlobalCommandId();
		const command = chatInputApplicationCommandMention(caseCommand.name, id);
		const content = args.t(LanguageKeys.Commands.Shared.DeprecatedMessage, { command });
		return send(message, content);
	}
}
