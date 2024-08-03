import { LanguageKeys } from '#lib/i18n/languageKeys';
import { WolfCommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { send } from '@sapphire/plugin-editable-commands';

@ApplyOptions<WolfCommand.Options>({
	aliases: ['togglemdm', 'togglemoddm', 'tmdm'],
	description: LanguageKeys.Commands.Moderation.ToggleModerationDmDescription,
	detailedDescription: LanguageKeys.Commands.Moderation.ToggleModerationDmExtended
})
export class UserCommand extends WolfCommand {
	public override async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const enabled = await this.container.prisma.user.toggleModerationDirectMessageEnabled(message.author.id);
		const content = args.t(
			enabled
				? LanguageKeys.Commands.Moderation.ToggleModerationDmToggledEnabled
				: LanguageKeys.Commands.Moderation.ToggleModerationDmToggledDisabled
		);
		return send(message, content);
	}
}
