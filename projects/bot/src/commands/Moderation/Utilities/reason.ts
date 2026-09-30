import { WolfCommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { Events, PermissionLevels } from '#lib/types/Enums';
import { getModeration, sendTemporaryMessage } from '#utils/functions';
import { getImage } from '#utils/util';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { PermissionFlagsBits } from 'discord-api-types/v9';

@ApplyOptions<WolfCommand.Options>({
	description: 'commands/moderation:reasonDescription',
	detailedDescription: 'commands/moderation:reasonExtended',
	permissionLevel: PermissionLevels.Moderator,
	requiredClientPermissions: [PermissionFlagsBits.EmbedLinks],
	runIn: [CommandOptionsRunTypeEnum.GuildAny]
})
export class UserCommand extends WolfCommand {
	public async messageRun(message: GuildMessage, args: WolfCommand.Args) {
		const cases = await args
			.pick('case')
			.then((value) => [value])
			.catch(() => args.pick('range', { maximum: 50 }));

		const moderation = getModeration(message.guild);
		const entries = await moderation.fetch(cases);
		if (!entries.size) {
			this.error('moderation:caseNotExists', { count: cases.length });
		}

		const reason = await args.rest('string');
		const imageURL = getImage(message);
		const { moderations } = this.container.db;
		await moderations
			.createQueryBuilder()
			.update()
			.where('guild_id = :guild', { guild: message.guild.id })
			.andWhere('case_id IN (:...ids)', { ids: [...entries.keys()] })
			.set({ reason, imageURL })
			.execute();
		await moderation.fetchChannelMessages();
		for (const entry of entries.values()) {
			const clone = entry.clone();
			entry.setReason(reason).setImageURL(imageURL);
			this.container.gatewayClient.emit(Events.ModerationEntryEdit, clone, entry);
		}

		return sendTemporaryMessage(
			message,
			args.t('commands/moderation:reasonUpdated', {
				entries: cases,
				newReason: reason,
				count: cases.length
			})
		);
	}
}
