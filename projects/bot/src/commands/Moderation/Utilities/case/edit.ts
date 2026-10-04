import { getAction } from '#lib/moderation';
import { getTranslationKey } from '#lib/moderation/common';
import {
	CommandPermissionLevel,
	RequiresCommandPermissionLevel,
	type GuildChatInputInteraction,
	type TranslationKey,
	type Translator
} from '#lib/structures/commands';
import { getCase, handleCase } from '#lib/structures/commands/moderationCase';
import { seconds } from '#common';
import { getModeration } from '#utils/functions';
import { resolveTimeSpan } from '#utils/resolvers';
import { TimestampStyles, time } from '@discordjs/builders';
import { isNullish, isNullishOrEmpty } from '@sapphire/utilities';
import { applyLocalizedBuilder } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * `/case edit`, see the `case` parent command.
 */
@RegisterAsSubcommand('case', (builder) =>
	applyLocalizedBuilder(builder, 'commands/case:edit')
		.addIntegerOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsCase').setMinValue(1).setRequired(true))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsReason').setMaxLength(200))
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/case:optionsDuration').setMaxLength(50))
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Moderator)
	public override chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		return handleCase(interaction, async (t) => {
			const entry = await getCase(interaction, options.case);
			const duration = getDuration(t, entry, options.duration);

			if (!isNullish(duration)) {
				const action = getAction(entry.type);
				if (!action.isUndoActionAvailable) {
					throw t('commands/case:timeNotAllowed', { type: t(getTranslationKey(entry.type)) });
				}

				if (entry.isCompleted()) {
					throw t('commands/case:timeNotAllowedInCompletedEntries', { caseId: entry.id });
				}

				if (duration !== 0) {
					const next = entry.createdAt + duration;
					if (next <= Date.now()) {
						throw t('commands/case:timeTooEarly', {
							start: time(seconds.fromMilliseconds(entry.createdAt), TimestampStyles.LongDateTime),
							time: time(seconds.fromMilliseconds(next), TimestampStyles.RelativeTime)
						});
					}
				}
			}

			await (
				await getModeration(interaction.guildId)
			).edit(entry, {
				reason: isNullish(options.reason) ? entry.reason : options.reason,
				duration: isNullish(duration) ? entry.duration : duration || null
			});

			return interaction.reply({ content: t('commands/case:editSuccess', { caseId: entry.id }), flags: MessageFlags.Ephemeral });
		});
	}
}

/**
 * Resolves the `duration` option.
 *
 * @returns `null` if the option was not given, the duration in milliseconds otherwise.
 * @throws The translated error when the duration is not valid, or the case does not support editing it.
 */
function getDuration(t: Translator, entry: ModerationManager.Entry, parameter: string | undefined) {
	if (isNullishOrEmpty(parameter)) return null;

	const action = getAction(entry.type);
	if (action.durationExternal) {
		throw t('commands/case:timeEditNotSupported', { type: t(getTranslationKey(entry.type)) });
	}

	const result = resolveTimeSpan(parameter, { minimum: action.minimumDuration, maximum: action.maximumDuration });
	if (result.isOk()) return result.unwrap();

	throw t(result.unwrapErr() as TranslationKey, { parameter, minimum: action.minimumDuration, maximum: action.maximumDuration });
}

interface Options {
	case: number;
	reason?: string;
	duration?: string;
}
