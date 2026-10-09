import { readSettings } from '#lib/database';
import { TranslationMappings, UndoTaskNameMappings, getTypeColor } from '#lib/moderation/common/constants';
import { RolesCaseTypes, formatRoleMentions } from '#lib/moderation/common/roles';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { seconds } from '#common';
import { TypeVariation } from '#utils/moderationConstants';
import { getFullEmbedAuthor, getTag } from '#utils/util';
import { EmbedBuilder, TimestampStyles, chatInputApplicationCommandMention, messageLink, time } from '@discordjs/builders';
import { container } from '@wolfstar/http-framework';
import { fetchT, type AnyNamespace, type GuildTarget, type TFunction } from '@wolfstar/plugin-i18next';
import { isNullish, isNullishOrZero } from '@sapphire/utilities';
import type { Guild } from '@wolfstar/plugin-gateway';
import {
	MessageReferenceType,
	Routes,
	type RESTPostAPIChannelMessageJSONBody,
	type RESTPostAPIChannelMessageResult,
	type Snowflake
} from 'discord-api-types/v10';

/**
 * Fetches the translation function of a guild, typed for the keys of every namespace.
 *
 * @remarks
 *
 * `fetchT` types the function for the default namespace only, although the keys of every namespace can be resolved
 * with the `namespace:key` syntax at runtime.
 *
 * @param target - The guild to fetch the translation function for.
 */
export async function fetchGuildT(target: GuildTarget): Promise<TFunction<AnyNamespace>> {
	return (await fetchT(target)) as unknown as TFunction<AnyNamespace>;
}

export function getTranslationKey<const Type extends TypeVariation>(type: Type): (typeof TranslationMappings)[Type] {
	return TranslationMappings[type];
}

/**
 * Retrieves the task name for the scheduled undo action based on the provided type.
 *
 * @param type - The type of the variation.
 * @returns The undo task name associated with the provided type, or `null` if not found.
 */
/**
 * The names of the tasks that undo a temporary moderation action, see `ModerationTask`.
 */
export type UndoTaskName = (typeof UndoTaskNameMappings)[keyof typeof UndoTaskNameMappings];

/**
 * The ID of the job that undoes a case when its time is up, which is how it is found again to reschedule or remove it.
 */
export function getUndoTaskId(guildId: Snowflake, caseId: number) {
	return `moderation-${guildId}-${caseId}`;
}

export function getUndoTaskName(type: TypeVariation): UndoTaskName | null {
	return type in UndoTaskNameMappings ? UndoTaskNameMappings[type as keyof typeof UndoTaskNameMappings] : null;
}

export function getTitle(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry): string {
	const name = t(getTranslationKey(entry.type));
	if (entry.isUndo()) return t('moderation:metadataUndo', { name });
	if (entry.isTemporary()) return t('moderation:metadataTemporary', { name });
	return name;
}

export async function getEmbed(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry) {
	const [description, moderator] = await Promise.all([getEmbedDescription(t, entry), entry.fetchModerator()]);
	const embed = new EmbedBuilder()
		.setColor(getTypeColor(entry))
		.setAuthor(getFullEmbedAuthor(moderator))
		.setDescription(description)
		.setFooter({
			text: t('moderation:embedFooter', { caseId: entry.id }),
			iconURL: container.gatewayClient.user!.displayAvatarURL({ size: 128 })
		})
		.setTimestamp(entry.createdAt);

	return embed;
}

async function getEmbedDescription(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry) {
	const reason = entry.reason ?? t('moderation:embedReasonNotSet', { command: getCaseEditMention(), caseId: entry.id });

	const type = getTitle(t, entry);
	const user = t('moderation:embedUser', { tag: getTag(await entry.fetchUser()), id: entry.userId });
	const description = isNullishOrZero(entry.duration)
		? t('moderation:embedDescription', { type, user, reason })
		: t('moderation:embedDescriptionTemporary', { type, user, time: getEmbedDescriptionTime(entry.expiresTimestamp!), reason });

	const lines: string[] = [description];

	const reference = entry.messageReference;
	if (reference !== null) {
		const url = messageLink(reference.channelId, reference.messageId, entry.guild.id);
		lines.push(t('moderation:embedMessage', { url }));
	}

	// The roles the member had are shown when they leave with the member, not when the action is undone:
	if (RolesCaseTypes.has(entry.type) && !entry.isUndo() && Array.isArray(entry.extraData)) {
		const roles = formatRoleMentions(t, entry.extraData);
		if (roles !== null) lines.push(t('moderation:embedRoles', { roles }));
	}

	return lines.join('\n');
}

function getEmbedDescriptionTime(timestamp: number) {
	return time(seconds.fromMilliseconds(timestamp), TimestampStyles.RelativeTime);
}

let caseCommandId: Snowflake | null = null;
function getCaseEditMention() {
	caseCommandId ??= container.applicationCommandRegistry.getLoadedChatInputCommands().get('case')?.getGlobalId() ?? null;
	// The command has not been loaded (or registered) yet, fall back to its plain name:
	if (caseCommandId === null) return '`/case edit`';
	return chatInputApplicationCommandMention('case', 'edit', caseCommandId);
}

/**
 * Forwards the message a case is about to the moderation log, before the action is taken: a ban or a softban deletes
 * the messages of the user, and a forward keeps what the message said.
 *
 * @param guild - The guild the message is in.
 * @param reference - The message to forward.
 * @returns The ID of the forwarded copy, `null` when there is no moderation log or the message could not be forwarded
 * (it is gone, or in a channel the bot cannot read). The case links to the message either way.
 */
export async function forwardCaseMessage(guild: Guild, reference: ModerationManager.Entry['messageReference']): Promise<Snowflake | null> {
	if (reference === null) return null;

	const { moderationChannel } = await readSettings(guild.id);
	if (isNullish(moderationChannel)) return null;

	const body: RESTPostAPIChannelMessageJSONBody = {
		message_reference: {
			type: MessageReferenceType.Forward,
			guild_id: guild.id,
			channel_id: reference.channelId,
			message_id: reference.messageId,
			fail_if_not_exists: false
		}
	};

	try {
		const message = (await container.rest.post(Routes.channelMessages(moderationChannel), { body })) as RESTPostAPIChannelMessageResult;
		return message.id;
	} catch (error) {
		container.logger.debug(`[MODERATION] Could not forward the message ${reference.messageId} to the moderation log:`, error);
		return null;
	}
}

/**
 * Deletes a forwarded copy {@linkcode forwardCaseMessage} made, when the action it was forwarded for was not taken.
 */
export async function deleteForwardedCaseMessage(guild: Guild, forwardedId: Snowflake) {
	const { moderationChannel } = await readSettings(guild.id);
	if (isNullish(moderationChannel)) return;

	await container.rest.delete(Routes.channelMessage(moderationChannel, forwardedId)).catch(() => null);
}
