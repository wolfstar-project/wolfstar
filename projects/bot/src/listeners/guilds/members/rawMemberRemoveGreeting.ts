import { readSettings } from '#lib/database';
import { formatGreeting, pickGreeting } from '#lib/greetings/format';
import { sendGreeting } from '#lib/greetings/send';
import { Events } from '#lib/types';
import { getLogPrefix } from '#utils/functions';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Guild, GuildMember } from '@wolfstar/plugin-gateway';
import type { GatewayGuildMemberRemoveDispatchData } from 'discord-api-types/v10';

/**
 * Says goodbye to a member who leaves with one of the leave messages of the server (`greetings.leave-messages`), at
 * random, in `greetings.leave-channel`.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.RawMemberRemove })
export class UserListener extends Listener {
	public async run(guild: Guild, _member: GuildMember | null, { user }: GatewayGuildMemberRemoveDispatchData) {
		const settings = await readSettings(guild);
		const channelId = settings.greetingsLeaveChannel;
		if (channelId === null) return;

		const template = pickGreeting(settings.greetingsLeaveMessages);
		if (template === null) return;

		try {
			await sendGreeting(channelId, formatGreeting(template, { user, guild }), user.id);
		} catch (error) {
			this.container.logger.error(getLogPrefix(this), 'Could not say goodbye to a member who left:', error);
		}
	}
}
