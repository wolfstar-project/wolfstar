import { sendBoostLog } from '#lib/moderation/logs/boosts';
import { Events } from '#lib/types';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

/**
 * Logs the boost of a member who leaves the server, which ends with them. Discord sends no update of the member for it,
 * so it is read from the member the cache held.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawMemberRemove })
export class UserListener extends Listener {
	public async run(guild: Guild, member: GuildMember | null, { user }: GatewayGuildMemberRemoveDispatchData) {
		if (member === null || member.partial) return;

		const since = member.premiumSinceTimestamp;
		if (since === null) return;

		await sendBoostLog(guild.id, user, { type: 'stop', since }, true);
	}
}
