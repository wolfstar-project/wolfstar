import { resolveDurationOption } from '#lib/moderation/automod/commands';
import { CleanupFilterKeys, CleanupRoot, getMissingCleanupPermissions } from '#lib/moderation/cleanup/commands';
import { CleanupLimitError, enableAutoDelete } from '#lib/moderation/cleanup/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';
import { AutoDeleteAllowKinds, AutoDeleteDelayLimits } from 'wolfstar-database';

const Root = CleanupRoot;

/**
 * `/autodelete enable`, see the `autodelete` parent command. Deletes the messages sent in a channel, at once or a delay
 * after. The `links`, `invites`, `images`, `mentions`, `embeds` and `text` options keep the messages that have one, and
 * `bots` deletes the messages of bots too, which are kept otherwise. It replaces the settings the channel has.
 */
@RegisterAsSubcommand('autodelete', (builder) => {
	const subcommand = applyLocalizedBuilder(builder, `${Root}:autodeleteEnable`)
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsChannel`)
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(true)
		)
		.addStringOption((option) => applyLocalizedBuilder(option, `${Root}:optionsDelay`).setMaxLength(32));

	for (const kind of AutoDeleteAllowKinds) {
		subcommand.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsAllow${capitalize(kind)}`));
	}

	return subcommand.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsBots`));
})
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'autodelete enable'>) {
		const t = getSupportedUserLanguageT(interaction);
		const reply = (content: string) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });

		const delay = resolveDurationOption(t, options.delay, AutoDeleteDelayLimits);
		if (typeof delay === 'object' && delay !== null) return reply(delay.error);

		const channel = channelMention(options.channel.id);
		const missing = await getMissingCleanupPermissions(interaction.guildId, options.channel.id);
		if (missing === null) return reply(translateKey(t, `${Root}:channelUnknown`));
		if (missing.length > 0) return reply(translateKey(t, `${Root}:missingPermissions`, { channel, missing }));

		const allow = AutoDeleteAllowKinds.filter((kind) => options[kind] === true);
		const bots = options.bots === true;
		try {
			await enableAutoDelete(interaction.guildId, { channelId: options.channel.id, delay: delay ?? 0, allow, bots });
		} catch (error) {
			if (!(error instanceof CleanupLimitError)) throw error;
			return reply(translateKey(t, `${Root}:autodeleteLimit`, { maximum: error.maximum }));
		}

		const lines = [
			delay
				? translateKey(t, `${Root}:autodeleteEnabledAfter`, { channel, delay: translateKey(t, 'globals:durationValue', { value: delay }) })
				: translateKey(t, `${Root}:autodeleteEnabledNow`, { channel })
		];
		if (allow.length > 0)
			lines.push(translateKey(t, `${Root}:autodeleteKept`, { kinds: allow.map((kind) => translateKey(t, CleanupFilterKeys[kind])) }));
		lines.push(translateKey(t, bots ? `${Root}:autodeleteBotsDeleted` : `${Root}:autodeleteBotsKept`));
		return reply(lines.join('\n'));
	}
}

function capitalize<const Value extends string>(value: Value) {
	return `${value[0].toUpperCase()}${value.slice(1)}` as Capitalize<Value>;
}
