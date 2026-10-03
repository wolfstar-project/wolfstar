import { writeSettingsTransaction, type CommandAutoDelete } from '#lib/database';
import { CommandPermissionLevel, RequiresCommandPermissionLevel } from '#lib/structures/commands/permissions';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { minutes, seconds } from '#utils/common';
import { resolveTimeSpan } from '#utils/resolvers';
import { channelMention } from '@discordjs/formatters';
import type { TransformedArguments } from '@wolfstar/http-framework';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';

const MinimumDuration = seconds(1);
const MaximumDuration = minutes(2);

/**
 * `/command-auto-delete add`, see the `command-auto-delete` parent command.
 */
@RegisterAsSubcommand('command-auto-delete', (builder) =>
	applyLocalizedBuilder(builder, 'commands/management:managecommandautodeleteSubcommandAdd')
		.addStringOption((option) => applyLocalizedBuilder(option, 'commands/management:managecommandautodeleteOptionsDuration').setRequired(true))
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, 'commands/shared:optionsChannel')
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
				.setRequired(false)
		)
)
export class UserCommand extends Command {
	@RequiresCommandPermissionLevel(CommandPermissionLevel.Administrator)
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Options) {
		const t = getSupportedUserLanguageT(interaction);

		const result = resolveTimeSpan(options.duration, { minimum: MinimumDuration, maximum: MaximumDuration });
		if (result.isErr()) {
			const content = translateKey(t, result.unwrapErr(), {
				parameter: options.duration,
				minimum: MinimumDuration,
				maximum: MaximumDuration
			});
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		const time = result.unwrap();
		const channelId = options.channel?.id ?? interaction.channel.id;

		using trx = await writeSettingsTransaction(interaction.guildId);
		const { commandsAutoDelete } = trx.settings;
		const index = commandsAutoDelete.findIndex(([id]: CommandAutoDelete) => id === channelId);
		const value: CommandAutoDelete = [channelId, time];

		const next = index === -1 ? commandsAutoDelete.concat([value]) : commandsAutoDelete.with(index, value);
		await trx.write({ commandsAutoDelete: next }).submitWithAudit(interaction.user.id);

		const content = translateKey(t, 'commands/management:manageCommandAutoDeleteAdd', { channel: channelMention(channelId), time });
		return interaction.reply({ content, flags: MessageFlags.Ephemeral });
	}
}

interface Options {
	duration: string;
	channel?: TransformedArguments.Channel;
}
