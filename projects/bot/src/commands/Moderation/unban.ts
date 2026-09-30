import { GuildSettings, readSettings } from '#lib/database';
import { ModerationCommand } from '#lib/moderation';
import type { GuildMessage } from '#lib/types';
import { getModeration, getSecurity } from '#utils/functions';
import type { Unlock } from '#utils/moderationConstants';
import { getImage } from '#utils/util';
import { ApplyOptions } from '@sapphire/decorators';
import { fromAsync } from '@sapphire/framework';
import { resolveKey } from '@sapphire/plugin-i18next';
import type { ArgumentTypes } from '@sapphire/utilities';
import { PermissionFlagsBits } from 'discord-api-types/v9';

@ApplyOptions<ModerationCommand.Options>({
	aliases: ['ub'],
	description: 'commands/moderation:unbanDescription',
	detailedDescription: 'commands/moderation:unbanExtended',
	requiredClientPermissions: [PermissionFlagsBits.BanMembers],
	requiredMember: false
})
export class UserModerationCommand extends ModerationCommand {
	public async prehandle(message: GuildMessage) {
		const result = await fromAsync(message.guild.bans.fetch());
		const bans = result.success ? result.value.map((ban) => ban.user.id) : null;

		// If the fetch failed, throw an error saying that the fetch failed:
		if (bans === null) {
			throw await resolveKey(message, 'system:fetchBansFail');
		}

		// If there were no bans, throw an error saying that the ban list is empty:
		if (bans.length === 0) {
			throw await resolveKey(message, 'errors:guildBansEmpty');
		}

		return {
			bans,
			unlock: (await readSettings(message.guild, GuildSettings.Events.BanRemove)) ? getModeration(message.guild).createLock() : null
		};
	}

	public async handle(...[message, context]: ArgumentTypes<ModerationCommand['handle']>) {
		return getSecurity(message.guild).actions.unBan(
			{
				userId: context.target.id,
				moderatorId: message.author.id,
				reason: context.reason,
				imageURL: getImage(message),
				duration: context.duration
			},
			await this.getTargetDM(message, context.args, context.target)
		);
	}

	public posthandle(...[, { preHandled }]: ArgumentTypes<ModerationCommand<Unlock>['posthandle']>) {
		if (preHandled) preHandled.unlock();
	}

	public checkModeratable(...[message, context]: ArgumentTypes<ModerationCommand<Unlock & { bans: string[] }>['checkModeratable']>) {
		if (!context.preHandled.bans.includes(context.target.id)) throw context.args.t('errors:guildBansNotFound');
		return super.checkModeratable(message, context);
	}
}
