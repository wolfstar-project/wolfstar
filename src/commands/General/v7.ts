import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfCommand } from '#lib/structures';
import { ButtonWolfV7, makeRemovedMessage, makeRow } from '#utils/deprecate';
import { ApplyOptions } from '@sapphire/decorators';
import { send } from '@sapphire/plugin-editable-commands';
import type { Message } from 'discord.js';

const row = makeRow(ButtonWolfV7);

@ApplyOptions<WolfCommand.Options>({
	name: '\u200Bv7',
	aliases: ['ping', 'pong'],
	description: LanguageKeys.Commands.General.V7Description,
	detailedDescription: LanguageKeys.Commands.General.V7Extended,
	hidden: true
})
export class UserCommand extends WolfCommand {
	public messageRun(message: Message, args: WolfCommand.Args) {
		return send(message, makeRemovedMessage(args.commandContext.commandName, row));
	}
}
