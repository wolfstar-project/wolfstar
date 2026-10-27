import { writeSettings } from '#lib/database';
import { getJoinGuardDashboardUrl, JoinGuardRoot } from '#lib/moderation/joinguard/commands';
import { getMissingJoinGuardChannelPermissions } from '#lib/moderation/joinguard/permissions';
import { announceJoinGuardChange, readJoinGuardConfig } from '#lib/moderation/joinguard/store';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { MessageFlags } from 'discord-api-types/v10';

const Root = JoinGuardRoot;

/**
 * `/joinguard enable`, see the `joinguard` parent command. Turns the join guard on: the members who join are checked against its rules.
 */
@RegisterAsSubcommand('joinguard', (builder) => applyLocalizedBuilder(builder, `${Root}:enable`))
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction) {
		const t = getSupportedUserLanguageT(interaction);
		const { guildId } = interaction;
		const { settings, rules } = await readJoinGuardConfig(guildId);
		if (settings.joinGuardEnabled) {
			return interaction.reply({ content: translateKey(t, `${Root}:alreadyEnabled`), flags: MessageFlags.Ephemeral });
		}

		await writeSettings(guildId, { joinGuardEnabled: true }, interaction.user.id);
		announceJoinGuardChange(guildId);

		const lines = [
			rules.length === 0
				? translateKey(t, `${Root}:enabledNoRules`, { url: getJoinGuardDashboardUrl(guildId) })
				: translateKey(t, `${Root}:enabled`)
		];
		// The logs would be dropped without a word, the guard says what it does there only:
		const logs = settings.joinGuardLogChannel;
		const missing = logs === null ? [] : await getMissingJoinGuardChannelPermissions(guildId, logs);
		if (logs !== null && missing !== null && missing.length > 0) {
			lines.push(translateKey(t, `${Root}:logChannelMissingPermissions`, { channel: channelMention(logs), missing }));
		}

		return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } });
	}
}
