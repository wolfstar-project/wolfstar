import { writeSettingsTransaction } from '#lib/database';
import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfCommand } from '#lib/structures';
import { PermissionLevels, type GuildMessage } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';

@ApplyOptions<WolfCommand.Options>({
	description: LanguageKeys.Commands.Management.SetPrefixDescription,
	detailedDescription: LanguageKeys.Commands.Management.SetPrefixExtended,
	permissionLevel: PermissionLevels.Administrator,
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	aliases: ['prefix']
})
export class UserCommand extends WolfCommand {
	public override async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const prefix = await args.pick('string', { minimum: 1, maximum: 10 });

		await using trx = await writeSettingsTransaction(message.guild);

		// If it's the same value, throw:
		if (trx.settings.prefix === prefix) {
			this.error(LanguageKeys.Misc.ConfigurationEquals);
		}

		await trx.write({ prefix }).submit();

		const content = args.t(LanguageKeys.Commands.Management.SetPrefixSet, { prefix });
		return send(message, { content, allowedMentions: { users: [message.author.id], roles: [] } });
	}
}
