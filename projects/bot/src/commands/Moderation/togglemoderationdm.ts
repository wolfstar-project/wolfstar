import { WolfCommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { ApplyOptions } from '@sapphire/decorators';
import { send } from '@sapphire/plugin-editable-commands';

@ApplyOptions<WolfCommand.Options>({
	aliases: ['togglemdm', 'togglemoddm', 'tmdm'],
	description: 'commands/moderation:toggleModerationDmDescription',
	detailedDescription: 'commands/moderation:toggleModerationDmExtended'
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
			updated.moderationDM ? 'commands/moderation:toggleModerationDmToggledEnabled' : 'commands/moderation:toggleModerationDmToggledDisabled'
		);
		return send(message, content);
	}
}
