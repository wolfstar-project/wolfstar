import { GuildTextChannelTypes } from '#utils/channelTypes';
import { resolveDurationOption } from '#lib/moderation/automod/commands';
import {
	CleanupFilterKeys,
	CleanupRoot,
	describeCleanupFilter,
	getMissingCleanupPermissions,
	resolveCleanupValue
} from '#lib/moderation/cleanup/commands';
import { MaximumAutoPurgeMessages } from '#lib/moderation/cleanup/purge';
import { CleanupLimitError, enableAutoPurge } from '#lib/moderation/cleanup/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { renderStatus } from '#utils/status';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { AutoPurgeIntervalLimits, CleanupFilterKinds, MaximumCleanupValueLength } from 'wolfstar-database';

const Root = CleanupRoot;

/**
 * `/autopurge enable`, see the `autopurge` parent command. Purges a channel every interval, of every message or of the
 * ones a filter looks for. It replaces the purge the channel has, and the first purge is one interval away.
 */
@RegisterAsSubcommand('autopurge', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:autopurgeEnable`)
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsChannel`)
				.addChannelTypes(...GuildTextChannelTypes)
				.setRequired(true)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsInterval`).setRequired(true).setMaxLength(32))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsFilter`).setChoices(
				...CleanupFilterKinds.map((kind) => createLocalizedChoice(CleanupFilterKeys[kind], { value: kind }))
			)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsValue`).setMaxLength(MaximumCleanupValueLength))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'autopurge enable'>) {
		const t = getSupportedUserLanguageT(interaction);
		const fail = (content: string) => interaction.reply(renderStatus('error', content));

		const interval = resolveDurationOption(t, options.interval, AutoPurgeIntervalLimits);
		if (interval === null || typeof interval === 'object')
			return fail(interval === null ? translateKey(t, 'arguments:timeSpan') : interval.error);

		const filter = options.filter ?? 'any';
		const value = resolveCleanupValue(t, filter, options.value);
		if (typeof value === 'object' && value !== null) return fail(value.error);

		const channel = channelMention(options.channel.id);
		const missing = await getMissingCleanupPermissions(interaction.guildId, options.channel.id);
		if (missing === null) return fail(translateKey(t, `${Root}:channelUnknown`));
		if (missing.length > 0) return fail(translateKey(t, `${Root}:missingPermissions`, { channel, missing }));

		try {
			await enableAutoPurge(interaction.guildId, { channelId: options.channel.id, interval, filter, value });
		} catch (error) {
			if (!(error instanceof CleanupLimitError)) throw error;
			return fail(translateKey(t, `${Root}:autopurgeLimit`, { maximum: error.maximum }));
		}

		const content = translateKey(t, `${Root}:autopurgeEnabled`, {
			channel,
			interval: translateKey(t, 'globals:durationValue', { value: interval }),
			filter: describeCleanupFilter(t, filter, value),
			maximum: MaximumAutoPurgeMessages
		});
		return interaction.reply(renderStatus('success', content));
	}
}
