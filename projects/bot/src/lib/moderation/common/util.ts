import { TranslationMappings, UndoTaskNameMappings, getColor } from '#lib/moderation/common/constants';
import type { ModerationManager } from '#lib/moderation/managers/ModerationManager';
import { seconds } from '#common';
import { TypeVariation } from '#utils/moderationConstants';
import { getFullEmbedAuthor, getTag } from '#utils/util';
import { EmbedBuilder, TimestampStyles, chatInputApplicationCommandMention, time } from '@discordjs/builders';
import { container } from '@wolfstar/http-framework';
import { fetchT, type AnyNamespace, type GuildTarget, type TFunction } from '@wolfstar/plugin-i18next';
import { isNullishOrZero } from '@sapphire/utilities';
import type { Snowflake } from 'discord-api-types/v10';

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
		.setColor(getColor(entry))
		.setAuthor(getFullEmbedAuthor(moderator))
		.setDescription(description)
		.setFooter({
			text: t('moderation:embedFooter', { caseId: entry.id }),
			iconURL: container.gatewayClient.user!.displayAvatarURL({ size: 128 })
		})
		.setTimestamp(entry.createdAt);

	if (entry.imageURL) embed.setImage(entry.imageURL);
	return embed;
}

async function getEmbedDescription(t: TFunction<AnyNamespace>, entry: ModerationManager.Entry) {
	const reason = entry.reason ?? t('moderation:embedReasonNotSet', { command: getCaseEditMention(), caseId: entry.id });

	const type = getTitle(t, entry);
	const user = t('moderation:embedUser', { tag: getTag(await entry.fetchUser()), id: entry.userId });
	return isNullishOrZero(entry.duration)
		? t('moderation:embedDescription', { type, user, reason })
		: t('moderation:embedDescriptionTemporary', { type, user, time: getEmbedDescriptionTime(entry.expiresTimestamp!), reason });
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
