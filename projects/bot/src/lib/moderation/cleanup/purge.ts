import { days, resolveOnErrorCodes } from '#common';
import { matchesCleanupFilter } from '#lib/moderation/cleanup/filters';
import { bulkDeleteChannelMessages, fetchChannelMessages } from '#lib/moderation/cleanup/messages';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import { PermissionFlagsBits, RESTJSONErrorCodes } from 'discord-api-types/v10';
import type { AutoPurge } from 'wolfstar-database';

/**
 * The most messages a purge deletes at once. They are deleted a hundred per request, and the history is read a hundred
 * per request with a pause in between, so more would hold the channel and the queue of the other purges for minutes.
 */
export const MaximumAutoPurgeMessages = 1000;

/**
 * Discord only bulk deletes the messages that are newer than 14 days.
 */
const MaximumAge = days(14);

const RequiredPermissions = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ReadMessageHistory | PermissionFlagsBits.ManageMessages;

/**
 * What became of a purge: how many messages it deleted, that its channel is `gone`, or that the bot is `missing` the
 * permissions to read and delete in it.
 */
export type AutoPurgeResult = number | 'gone' | 'missing';

/**
 * Purges a channel once: deletes its latest messages that match the filter of the purge, but the pinned ones and the
 * ones that are too old to be deleted in bulk.
 *
 * @param purge - The purge to run.
 */
export async function runAutoPurge(purge: AutoPurge): Promise<AutoPurgeResult> {
	const { gatewayClient } = container;
	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(purge.channelId), RESTJSONErrorCodes.UnknownChannel);
	if (channel === null || !('guildId' in channel) || channel.guildId !== purge.guildId) return 'gone';

	const me = await gatewayClient.members.fetchMe(purge.guildId);
	const permissions = await computePermissionsIn(channel, me);
	if (!permissions.has(RequiredPermissions)) return 'missing';

	const oldest = Date.now() - MaximumAge;
	const messages = await fetchChannelMessages(purge.channelId, {
		limit: MaximumAutoPurgeMessages,
		position: 'before',
		filter: (message) => !message.pinned && message.createdTimestamp > oldest && matchesCleanupFilter(message, purge.filter, purge.value)
	});
	if (messages.length === 0) return 0;

	return bulkDeleteChannelMessages(purge.guildId, purge.channelId, messages);
}
