import { followHoneypotSettings } from '#lib/moderation/honeypot/dashboard';
import { Events } from '#lib/types';
import { getLogPrefix } from '#utils/functions';
import { ApplyOptions } from '@wolfstar/decorators';
import { Listener } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * Puts the warning of the honeypot in order when the dashboard changes its channel, its action or whether there is
 * one, see `followHoneypotSettings`.
 */
@ApplyOptions<Listener.Options>({ emitter: 'client', event: Events.DashboardSettingsUpdate })
export class UserListener extends Listener {
	public async run(guildId: Snowflake, keys: readonly string[]) {
		try {
			const outcome = await followHoneypotSettings(guildId, keys);
			this.container.logger.debug(`[Honeypot] The dashboard changed ${keys.join(', ')} of the guild ${guildId}: ${outcome}`);
		} catch (error) {
			this.container.logger.error(`${getLogPrefix(this)} Could not follow the honeypot settings of ${guildId}:`, error);
		}
	}
}
