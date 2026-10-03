import type { GuildDataValue, SchemaDataKey } from '#lib/database';
import { AutoModerationResetCommand } from '#lib/moderation/structures/AutoModerationResetCommand';
import { AutoModerationRules } from '#lib/moderation/structures/AutoModerationRules';
import type { Awaitable } from '@sapphire/utilities';

/**
 * `/automod-words reset`, which can also reset the list of words, see the `automod-words` parent command.
 */
@AutoModerationResetCommand.register(AutoModerationRules.words)
export class UserCommand extends AutoModerationResetCommand {
	protected override resetGetKeyValuePairFallback(guildId: string, key: string): Awaitable<readonly [SchemaDataKey, GuildDataValue]> {
		if (key === 'words') return ['selfmodWordsList', []];
		return super.resetGetKeyValuePairFallback(guildId, key);
	}
}
