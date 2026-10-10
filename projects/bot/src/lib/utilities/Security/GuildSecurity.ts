import type { Guild } from '@wolfstar/plugin-gateway';

/**
 * @version 3.0.0
 */
export class GuildSecurity {
	/**
	 * The {@link Guild} instance which manages this instance
	 */
	public guild: Guild;

	public constructor(guild: Guild) {
		this.guild = guild;
	}
}
