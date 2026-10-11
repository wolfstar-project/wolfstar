import { readSettings, writeSettings } from '#lib/database';
import { refreshHoneypotNotice } from '#lib/moderation/honeypot/channel';
import { HoneypotRoot } from '#lib/moderation/honeypot/commands';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention, inlineCode } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = HoneypotRoot;

/**
 * `/honeypot disable`, see the `honeypot` parent command. Stops catching who writes in the honeypot channel, and takes
 * the warning off it. The channel is not deleted, and the rest of the settings is kept for the next `/honeypot setup`.
 */
@RegisterAsSubcommand('honeypot', (builder) => applyLocalizedBuilder(builder, `${Root}:disable`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const { guildId } = interaction;

		const settings = await readSettings(guildId);
		const channelId = settings.honeypotChannel;
		if (channelId === null) {
			const content = translateKey(t, `${Root}:notSetUp`, { command: inlineCode('/honeypot setup') });
			return interaction.reply({ content, flags: MessageFlags.Ephemeral });
		}

		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		// The channel stops being a trap before its warning goes, so nobody is caught for what they write meanwhile:
		await writeSettings(guildId, { honeypotChannel: null }, interaction.user.id);
		await refreshHoneypotNotice(guildId, channelId, { warning: false, action: settings.honeypotAction });

		return deferred.update({
			content: translateKey(t, `${Root}:disabled`, { channel: channelMention(channelId) }),
			allowed_mentions: { parse: [] }
		});
	}
}
