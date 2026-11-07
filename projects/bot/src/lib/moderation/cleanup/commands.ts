import { resolveOnErrorCodes } from '#common';
import { translateKey, type TranslationKey } from '#lib/structures/commands/utils';
import { inlineCode } from '@discordjs/formatters';
import { container } from '@wolfstar/http-framework';
import { computePermissionsIn } from '@wolfstar/plugin-gateway';
import type { TFunction } from '@wolfstar/plugin-i18next';
import { PermissionFlagsBits, RESTJSONErrorCodes, type Snowflake } from 'discord-api-types/v10';
import { CleanupFilterKindsWithValue, MaximumCleanupValueLength, type CleanupFilterKind } from 'wolfstar-database';

export const CleanupRoot = 'commands/cleanup';
const Root = CleanupRoot;

/**
 * The name of each filter, as the `filter` choices and the messages show it.
 */
export const CleanupFilterKeys = {
	any: `${Root}:filterAny`,
	user: `${Root}:filterUser`,
	contains: `${Root}:filterContains`,
	notContains: `${Root}:filterNotContains`,
	startsWith: `${Root}:filterStartsWith`,
	endsWith: `${Root}:filterEndsWith`,
	links: `${Root}:filterLinks`,
	invites: `${Root}:filterInvites`,
	images: `${Root}:filterImages`,
	mentions: `${Root}:filterMentions`,
	embeds: `${Root}:filterEmbeds`,
	bots: `${Root}:filterBots`,
	humans: `${Root}:filterHumans`,
	text: `${Root}:filterText`
} as const satisfies Record<CleanupFilterKind, TranslationKey>;

const RequiredPermissions = {
	ViewChannel: PermissionFlagsBits.ViewChannel,
	ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
	ManageMessages: PermissionFlagsBits.ManageMessages
} as const;

/**
 * The permissions the bot needs to delete the messages of a channel and does not have in it.
 *
 * @returns Their names, none when the bot has them all, or `null` when the channel is not one of the guild.
 */
export async function getMissingCleanupPermissions(guildId: Snowflake, channelId: Snowflake): Promise<string[] | null> {
	const { gatewayClient } = container;
	const channel = await resolveOnErrorCodes(gatewayClient.channels.fetch(channelId), RESTJSONErrorCodes.UnknownChannel);
	if (channel === null || !('guildId' in channel) || channel.guildId !== guildId) return null;

	const permissions = await computePermissionsIn(channel, await gatewayClient.members.fetchMe(guildId));
	return Object.entries(RequiredPermissions)
		.filter(([, bit]) => !permissions.has(bit))
		.map(([name]) => name);
}

/**
 * Reads the value a filter needs from what the user wrote: the ID of a user for `user`, a text for the others.
 *
 * @returns The value (`null` for a filter that has none), or an object with the translated error.
 */
export function resolveCleanupValue(t: TFunction, kind: CleanupFilterKind, input: string | undefined): string | null | { error: string } {
	if (!(CleanupFilterKindsWithValue as readonly CleanupFilterKind[]).includes(kind)) return null;

	const value = (input ?? '').trim();
	if (value.length === 0) return { error: translateKey(t, `${Root}:valueRequired`, { filter: translateKey(t, CleanupFilterKeys[kind]) }) };

	if (kind === 'user') {
		// A mention stands for the ID it holds:
		const id = /^(?:<@!?)?(\d{17,20})>?$/.exec(value)?.[1];
		return id === undefined ? { error: translateKey(t, `${Root}:valueInvalidUser`) } : id;
	}

	return value.slice(0, MaximumCleanupValueLength);
}

/**
 * Describes a filter with its value, such as `Messages that contain "spam"`.
 */
export function describeCleanupFilter(t: TFunction, kind: CleanupFilterKind, value: string | null): string {
	const name = translateKey(t, CleanupFilterKeys[kind]);
	if (value === null) return name;
	return `${name}: ${kind === 'user' ? `<@${value}>` : inlineCode(value.replaceAll('`', "'"))}`;
}
