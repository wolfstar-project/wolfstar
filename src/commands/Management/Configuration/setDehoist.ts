import { writeSettingsTransaction } from '#lib/database';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfCommand } from '#lib/structures';
import { PermissionLevels, type GuildMessage } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';

@ApplyOptions<WolfCommand.Options>({
	description: LanguageKeys.Commands.Management.SetDehoistDescription,
	detailedDescription: LanguageKeys.Commands.Management.SetDehoistExtended,
	permissionLevel: PermissionLevels.Administrator,
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends WolfCommand {
	public override async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const enable = await args.pick('boolean');

		using trx = await writeSettingsTransaction(message.guild);

		await trx.write({ dehoist: enable }).submit();

		const content = args.t(enable ? LanguageKeys.Commands.Management.SetDehoistEnabled : LanguageKeys.Commands.Management.SetDehoistDisabled);
		return send(message, content);
	}
}
