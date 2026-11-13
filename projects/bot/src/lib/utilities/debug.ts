import type { Message } from '@wolfstar/plugin-gateway';
import type { GatewayDispatchPayload } from 'discord-api-types/v10';

/**
 * The IDs a dispatch can carry, whichever its event is.
 */
interface DispatchIds {
	id?: unknown;
	guild_id?: unknown;
	channel_id?: unknown;
	user_id?: unknown;
	author?: { id?: unknown };
	user?: { id?: unknown };
}

/**
 * Tells a dispatch of Discord in a line of the debug log: its event and the IDs it carries.
 *
 * @remarks
 *
 * Only IDs are written, never what the dispatch holds: the content of a message does not belong in the logs.
 *
 * @param payload - A dispatch of the gateway.
 */
export function describeDispatch({ t, d }: Pick<GatewayDispatchPayload, 't' | 'd'>): string {
	const data = (d ?? {}) as DispatchIds;
	const ids = {
		id: data.id,
		guild: data.guild_id,
		channel: data.channel_id,
		user: data.author?.id ?? data.user?.id ?? data.user_id
	};

	const known = Object.entries(ids).filter(([, value]) => value !== undefined && value !== null);
	return [t, ...known.map(([name, value]) => `${name}=${String(value)}`)].join(' ');
}

/**
 * Tells a message in a line of the debug log by its IDs, never by its content.
 *
 * @param message - A message of the gateway.
 */
export function describeMessage(message: Pick<Message, 'id' | 'channelId' | 'guildId' | 'author'>): string {
	return `message ${message.id} of ${message.author.id} in ${message.channelId} of ${message.guildId}`;
}
