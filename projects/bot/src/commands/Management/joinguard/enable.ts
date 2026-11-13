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
		// The write waits for the lock of the settings, and the permissions of the log channel are read from Discord:
		// either can outlast the three seconds Discord gives to answer.
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const { guildId } = interaction;
		const { settings, rules } = await readJoinGuardConfig(guildId);
		if (settings.joinGuardEnabled) {
			return deferred.update({ content: translateKey(t, `${Root}:alreadyEnabled`) });
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
		if (logs !== null && missing === null) lines.push(translateKey(t, `${Root}:logChannelUnknown`, { channel: channelMention(logs) }));
		else if (logs !== null && missing !== null && missing.length > 0) {
			lines.push(translateKey(t, `${Root}:logChannelMissingPermissions`, { channel: channelMention(logs), missing }));
		}

		return deferred.update({ content: lines.join('\n'), allowed_mentions: { parse: [] } });
	}
}
