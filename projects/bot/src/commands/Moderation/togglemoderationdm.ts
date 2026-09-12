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
	public async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const { users } = this.container.db;
		const updated = await users.lock([message.author.id], async (id) => {
			const user = await users.ensure(id);

			user.moderationDM = !user.moderationDM;
			return user.save();
		});

		const content = args.t(
			updated.moderationDM
				? LanguageKeys.Commands.Moderation.ToggleModerationDmToggledEnabled
				: LanguageKeys.Commands.Moderation.ToggleModerationDmToggledDisabled
		);
		return send(message, content);
	}
}
