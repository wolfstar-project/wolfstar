import type { Database, Models } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';
import type { HoneypotAction } from '../types.js';

type Orm = Database['orm'];
type Row = Omit<Models.public_GuildHoneypot, 'modules'>;

/**
 * A honeypot channel that is kept up every day: it gets another name, a new message, or both.
 */
export interface HoneypotUpkeep {
	guildId: Snowflake;
	channelId: Snowflake;
	action: HoneypotAction;
	warning: boolean;
	randomName: boolean;
	keepActive: boolean;
	/** Whether the name of the day is random characters instead of one of the list. */
	chaosName: boolean;
}

/**
 * Reads the honeypot channels that are kept up, of every guild: the ones that are set up and get another name every
 * day (from the list, or random characters), a message every day, or both.
 * @param orm The ORM surface to read through.
 */
export async function fetchHoneypotUpkeeps(orm: Orm): Promise<HoneypotUpkeep[]> {
	const honeypots = orm.public.GuildHoneypot;
	const [renamed, chaos, active, recreated] = await Promise.all([
		honeypots.where({ randomName: true }).all(),
		honeypots.where({ chaosName: true }).all(),
		honeypots.where({ keepActive: true }).all(),
		honeypots.where({ recreate: true }).all()
	]);

	const rows = new Map<bigint, Row>();
	for (const row of [...renamed, ...chaos, ...active, ...recreated]) rows.set(row.id, row);

	const upkeeps: HoneypotUpkeep[] = [];
	for (const row of rows.values()) {
		// The switches outlive `/honeypot disable`, a honeypot without a channel has nothing to keep up:
		const channelIds = [...new Set([row.channelId, ...row.channels].filter((id): id is bigint => id !== null))];
		for (const channelId of channelIds) {
			upkeeps.push({
				guildId: String(row.id),
				channelId: String(channelId),
				action: row.action,
				warning: row.warning,
				randomName: row.randomName,
				keepActive: row.keepActive,
				chaosName: row.chaosName
			});
		}
	}

	return upkeeps;
}

/**
 * A honeypot that is set up, with what its warning depends on.
 */
export interface HoneypotChannel {
	guildId: Snowflake;
	channelId: Snowflake;
	warning: boolean;
	action: HoneypotAction;
}

/**
 * Reads the honeypots that are set up, of every guild: the ones with a channel.
 * @param orm The ORM surface to read through.
 */
export async function fetchHoneypotChannels(orm: Orm): Promise<HoneypotChannel[]> {
	const rows = await orm.public.GuildHoneypot.all();
	return rows.flatMap((row) =>
		[...new Set([row.channelId, ...row.channels].filter((id): id is bigint => id !== null))].map((channelId) => ({
			guildId: String(row.id),
			channelId: String(channelId),
			warning: row.warning,
			action: row.action
		}))
	);
}
