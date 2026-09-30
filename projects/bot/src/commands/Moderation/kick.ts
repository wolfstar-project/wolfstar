import { GuildSettings, readSettings } from '#lib/database';
import { ModerationCommand } from '#lib/moderation';
import { getModeration, getSecurity } from '#utils/functions';
import type { Unlock } from '#utils/moderationConstants';
import { getImage } from '#utils/util';
import { ApplyOptions } from '@sapphire/decorators';
import type { ArgumentTypes } from '@sapphire/utilities';
import { PermissionFlagsBits } from 'discord-api-types/v9';

@ApplyOptions<ModerationCommand.Options>({
	aliases: ['k'],
	description: 'commands/moderation:kickDescription',
	detailedDescription: 'commands/moderation:kickExtended',
	requiredClientPermissions: [PermissionFlagsBits.KickMembers],
	requiredMember: true
})
export class UserModerationCommand extends ModerationCommand {
	public async prehandle(...[message]: ArgumentTypes<ModerationCommand['prehandle']>) {
		return (await readSettings(message.guild, GuildSettings.Channels.Logs.MemberRemove))
			? { unlock: getModeration(message.guild).createLock() }
			: null;
	}

	public async handle(...[message, context]: ArgumentTypes<ModerationCommand['handle']>) {
		return getSecurity(message.guild).actions.kick(
			{
				userId: context.target.id,
				moderatorId: message.author.id,
				reason: context.reason,
				imageURL: getImage(message)
			},
			await this.getTargetDM(message, context.args, context.target)
		);
	}

	public posthandle(...[, { preHandled }]: ArgumentTypes<ModerationCommand<Unlock>['posthandle']>) {
		if (preHandled) preHandled.unlock();
	}

	public async checkModeratable(...[message, context]: ArgumentTypes<ModerationCommand['checkModeratable']>) {
		const member = await super.checkModeratable(message, context);
		if (member && !member.kickable) throw context.args.t('commands/moderation:kickNotKickable');
		return member;
	}
}
