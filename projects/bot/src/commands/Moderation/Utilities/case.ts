import { WolfCommand } from '#lib/structures';
import type { GuildMessage } from '#lib/types';
import { PermissionLevels } from '#lib/types/Enums';
import { getModeration } from '#utils/functions';
import { ApplyOptions } from '@sapphire/decorators';
import { CommandOptionsRunTypeEnum } from '@sapphire/framework';
import { send } from '@sapphire/plugin-editable-commands';
import { PermissionFlagsBits } from 'discord-api-types/v9';

@ApplyOptions<WolfCommand.Options>({
	description: 'commands/moderation:caseDescription',
	detailedDescription: 'commands/moderation:caseExtended',
	permissionLevel: PermissionLevels.Moderator,
	requiredClientPermissions: [PermissionFlagsBits.EmbedLinks],
	runIn: [CommandOptionsRunTypeEnum.GuildAny],
	subCommands: ['delete', { input: 'show', default: true }]
})
export class UserCommand extends WolfCommand {
	public async show(message: GuildMessage, args: WolfCommand.Args) {
		const caseId = await args.pick('case');

		const moderation = getModeration(message.guild);
		const entry = await moderation.fetch(caseId);
		if (entry) {
			const embed = await entry.prepareEmbed();
			return send(message, { embeds: [embed] });
		}
		this.error('commands/moderation:reasonNotExists');
	}

	public async delete(message: GuildMessage, args: WolfCommand.Args) {
		const caseId = await args.pick('case');

		const moderation = getModeration(message.guild);
		const entry = await moderation.fetch(caseId);
		if (!entry) this.error('commands/moderation:reasonNotExists');

		entry.remove();
		moderation.delete(entry.caseId);

		const content = args.t('commands/moderation:caseDeleted', { case: entry.caseId });
		return send(message, content);
	}
}
