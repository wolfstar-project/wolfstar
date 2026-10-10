import { CleanupFilterKeys, CleanupRoot } from '#lib/moderation/cleanup/commands';
import { readAutoDeletes } from '#lib/moderation/cleanup/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { Colors } from '#utils/constants';
import { EmbedBuilder } from '@discordjs/builders';
import { channelMention, inlineCode } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = CleanupRoot;

/**
 * `/autodelete list`, see the `autodelete` parent command. Lists the channels whose messages are deleted, with their
 * delay and what they keep.
 */
@RegisterAsSubcommand('autodelete', (builder) => applyLocalizedBuilder(builder, `${Root}:autodeleteList`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const configs = await readAutoDeletes(interaction.guildId);

		const lines = configs.map((config) => {
			const kept = [
				...config.allow.map((kind) => translateKey(t, CleanupFilterKeys[kind])),
				...(config.bots ? [] : [translateKey(t, CleanupFilterKeys.bots)])
			];
			return translateKey(t, `${Root}:autodeleteListLine`, {
				channel: channelMention(config.channelId),
				delay:
					config.delay === 0
						? translateKey(t, `${Root}:autodeleteDelayNone`)
						: translateKey(t, 'globals:durationValue', { value: config.delay }),
				kept: kept.length === 0 ? translateKey(t, `${Root}:autodeleteKeptNone`) : translateKey(t, 'globals:andListValue', { value: kept })
			});
		});

		const embed = new EmbedBuilder()
			.setColor(Colors.Blue)
			.setTitle(translateKey(t, `${Root}:autodeleteListTitle`, { count: configs.length }))
			.setDescription(
				lines.length === 0 ? translateKey(t, `${Root}:autodeleteListEmpty`, { command: inlineCode('/autodelete enable') }) : lines.join('\n')
			);
		return interaction.reply({ embeds: [embed.toJSON()], flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
