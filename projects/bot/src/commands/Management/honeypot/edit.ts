import { readSettings, writeSettings } from '#lib/database';
import {
	getMissingHoneypotLogPermissions,
	getMissingHoneypotPermissions,
	refreshHoneypotNotice,
	withHoneypotLock
} from '#lib/moderation/honeypot/channel';
import { HoneypotActionKeys, HoneypotRoot, renderHoneypotSummary } from '#lib/moderation/honeypot/commands';
import { translateKey, type GuildChatInputInteraction } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import { applyLocalizedBuilder, createLocalizedChoice, getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { Command, RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { ChannelType, MessageFlags } from 'discord-api-types/v10';
import { HoneypotActions, type GuildData } from 'wolfstar-database';

const Root = HoneypotRoot;

/**
 * `/honeypot edit`, see the `honeypot` parent command. Changes what the honeypot does: the action, the channel the
 * catches are reported to, and whether who is caught is told, the channel keeps a warning, gets another name every day
 * and is kept active. Only the options that are given change.
 *
 * @remarks
 *
 * The warning tells about the action, so it is sent again when either changes. The settings are written and the
 * warning is sent under the lock of the honeypot (`withHoneypotLock`), and the channel is the one the settings have
 * after the write: a `/honeypot disable` that runs at the same time is not followed by a warning in a channel that is
 * no longer a trap.
 */
@RegisterAsSubcommand('honeypot', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:edit`)
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsAction`).setChoices(
				...HoneypotActions.map((action) => createLocalizedChoice(HoneypotActionKeys[action], { value: action }))
			)
		)
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsLogs`).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		)
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsDirectMessage`))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsWarning`))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsRandomName`))
		.addBooleanOption((option) => applyLocalizedBuilder(option, `${Root}:optionsKeepActive`))
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'honeypot edit'>) {
		const t = getSupportedUserLanguageT(interaction);
		const { guildId } = interaction;
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const update = (content: string) => deferred.update({ content, allowed_mentions: { parse: [] } });

		const changes: Partial<GuildData> = {};
		if (options.action !== undefined) changes.honeypotAction = options.action;
		if (options.logs !== undefined) changes.honeypotLogChannel = options.logs.id;
		if (options['direct-message'] !== undefined) changes.honeypotDirectMessage = options['direct-message'];
		if (options.warning !== undefined) changes.honeypotWarning = options.warning;
		if (options['random-name'] !== undefined) changes.honeypotRandomName = options['random-name'];
		if (options['keep-active'] !== undefined) changes.honeypotKeepActive = options['keep-active'];
		if (Object.keys(changes).length === 0) return update(translateKey(t, `${Root}:editNothing`));

		// A channel the bot cannot write in would be saved, and every report dropped without a word:
		if (options.logs !== undefined) {
			const lacking = await getMissingHoneypotLogPermissions(guildId, options.logs.id);
			if (lacking === null) return update(translateKey(t, `${Root}:channelUnknown`));
			if (lacking.length > 0) {
				return update(translateKey(t, `${Root}:logsMissingPermissions`, { channel: channelMention(options.logs.id), missing: lacking }));
			}
		}

		return withHoneypotLock(guildId, async () => {
			const settings = await readSettings(guildId);
			const channelId = settings.honeypotChannel;
			if (channelId !== null) {
				if (changes.honeypotLogChannel === channelId) return update(translateKey(t, `${Root}:logsSameChannel`));

				// Another action needs another permission, which is asked for before the honeypot stops working:
				if (changes.honeypotAction !== undefined) {
					const missing = (await getMissingHoneypotPermissions(guildId, channelId, changes.honeypotAction)) ?? [];
					if (missing.length > 0) {
						return update(translateKey(t, `${Root}:missingPermissions`, { channel: channelMention(channelId), missing }));
					}
				}
			}

			await writeSettings(guildId, changes, interaction.user.id);
			const next = await readSettings(guildId);

			const lines = [translateKey(t, `${Root}:editDone`)];
			// The channel is read after the write: the one read before it may have been disabled since.
			if (next.honeypotChannel !== null && (changes.honeypotWarning !== undefined || changes.honeypotAction !== undefined)) {
				const noticed = await refreshHoneypotNotice(guildId, next.honeypotChannel, {
					warning: next.honeypotWarning,
					action: next.honeypotAction
				});
				if (!noticed) lines.push(translateKey(t, `${Root}:setupNoticeFailed`));
			}

			return deferred.update({ content: lines.join('\n'), embeds: [renderHoneypotSummary(t, next).toJSON()], allowed_mentions: { parse: [] } });
		});
	}
}
