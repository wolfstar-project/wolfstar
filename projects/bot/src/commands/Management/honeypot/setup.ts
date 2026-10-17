import { readSettings, writeSettings } from '#lib/database';
import {
	createHoneypotChannel,
	deleteHoneypotChannel,
	getMissingHoneypotGuildPermissions,
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
import { HoneypotActions } from 'wolfstar-database';

const Root = HoneypotRoot;

/**
 * `/honeypot setup`, see the `honeypot` parent command. Makes a channel the honeypot, and sends the warning to it when
 * the server keeps one.
 *
 * @remarks
 *
 * Without the `channel` option the channel the honeypot already has is kept, and one is created at the top of the
 * list when it has none or the one it had is gone. The `action` and `logs` options are the ones of `/honeypot edit`.
 *
 * Everything that can refuse the setup is asked before a channel is created, and a channel that was created and did
 * not become the honeypot is deleted: a setup that fails would leave a channel behind every time it is tried. The
 * whole of it runs under the lock of the honeypot, see `withHoneypotLock`.
 */
@RegisterAsSubcommand('honeypot', (builder) =>
	applyLocalizedBuilder(builder, `${Root}:setup`)
		.addChannelOption((option) => applyLocalizedBuilder(option, `${Root}:optionsChannel`).addChannelTypes(ChannelType.GuildText))
		.addStringOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsAction`).setChoices(
				...HoneypotActions.map((action) => createLocalizedChoice(HoneypotActionKeys[action], { value: action }))
			)
		)
		.addChannelOption((option) =>
			applyLocalizedBuilder(option, `${Root}:optionsLogs`).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
		)
)
export class UserCommand extends Command {
	public override async chatInputRun(interaction: GuildChatInputInteraction, options: Command.OptionsOf<'honeypot setup'>) {
		const t = getSupportedUserLanguageT(interaction);
		const { guildId } = interaction;
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const update = (content: string) => deferred.update({ content, allowed_mentions: { parse: [] } });

		return withHoneypotLock(guildId, async () => {
			const settings = await readSettings(guildId);
			const action = options.action ?? settings.honeypotAction;
			const logs = options.logs?.id ?? settings.honeypotLogChannel;

			let channelId = options.channel?.id ?? settings.honeypotChannel;
			if (channelId !== null && channelId === logs) return update(translateKey(t, `${Root}:logsSameChannel`));

			// A channel the bot cannot write in would be saved, and every report dropped without a word:
			if (options.logs !== undefined) {
				const lacking = await getMissingHoneypotLogPermissions(guildId, options.logs.id);
				if (lacking === null) return update(translateKey(t, `${Root}:channelUnknown`));
				if (lacking.length > 0) {
					return update(translateKey(t, `${Root}:logsMissingPermissions`, { channel: channelMention(options.logs.id), missing: lacking }));
				}
			}

			let missing = channelId === null ? null : await getMissingHoneypotPermissions(guildId, channelId, action);
			let created = false;
			// The channel the honeypot had may be gone, a new one takes its place as when it never had one:
			if (missing === null && options.channel === undefined) {
				// What the bot lacks in the guild it lacks in a new channel too, which is known before there is one:
				const lacking = await getMissingHoneypotGuildPermissions(guildId, action);
				if (lacking.length > 0) return update(translateKey(t, `${Root}:setupMissingPermissions`, { missing: lacking }));

				channelId = await createHoneypotChannel(guildId);
				if (channelId === null) return update(translateKey(t, `${Root}:channelCannotCreate`));

				created = true;
			}

			if (channelId === null) return update(translateKey(t, `${Root}:channelUnknown`));
			const channel = channelMention(channelId);

			let saved = false;
			try {
				if (created) missing = await getMissingHoneypotPermissions(guildId, channelId, action);
				if (missing === null) return await update(translateKey(t, `${Root}:channelUnknown`));
				if (missing.length > 0) return await update(translateKey(t, `${Root}:missingPermissions`, { channel, missing }));

				await writeSettings(guildId, { honeypotChannel: channelId, honeypotAction: action, honeypotLogChannel: logs }, interaction.user.id);
				saved = true;
			} finally {
				// The next attempt would create another channel, so the one that did not become the honeypot goes:
				if (created && !saved) await deleteHoneypotChannel(channelId);
			}

			// The warning the honeypot had is replaced wherever it was, so a channel it moved from keeps none:
			const noticed = await refreshHoneypotNotice(guildId, channelId, { warning: settings.honeypotWarning, action });

			const lines = [translateKey(t, created ? `${Root}:setupCreated` : `${Root}:setupDone`, { channel })];
			if (!noticed) lines.push(translateKey(t, `${Root}:setupNoticeFailed`));
			return deferred.update({
				content: lines.join('\n'),
				embeds: [renderHoneypotSummary(t, await readSettings(guildId)).toJSON()],
				allowed_mentions: { parse: [] }
			});
		});
	}
}
