import { getHoneypotChannels } from '#lib/moderation/honeypot/channels';
import { readSettings } from '#lib/database';
import { HoneypotActionKeys } from '#lib/moderation/honeypot/commands';
import { readHoneypotStats, RecentCatchesDays } from '#lib/moderation/honeypot/stats';
import { translateKey } from '#lib/structures/commands/utils';
import { channelMention } from '@discordjs/formatters';
import { InteractionHandler } from '@wolfstar/http-framework';
import { decodeCustomIdContent, getDefaultExpiredReply } from '@wolfstar/http-framework-utilities';
import { getSupportedUserLanguageT } from '@wolfstar/plugin-i18next';
import { MessageFlags } from 'discord-api-types/v10';

/**
 * Handles the `Catches` button of the warning of a honeypot channel (`honeypotStats.<guildId>.show`): it answers who
 * clicked, and them only, with how many members the honeypot caught, in all and in the last days, and how it is set
 * up. Nothing is written, and the numbers are no secret: the button is in a channel every member sees.
 */
export class UserInteractionHandler extends InteractionHandler {
	public override async run(interaction: InteractionHandler.Interaction, content: unknown) {
		const decoded = decodeCustomIdContent(content);
		const guildId = interaction.guildId ?? null;
		if (decoded === null || decoded.action !== 'show' || guildId === null || decoded.sessionId !== guildId) {
			return interaction.reply({ content: getDefaultExpiredReply(), flags: MessageFlags.Ephemeral });
		}

		const t = getSupportedUserLanguageT(interaction);
		const deferred = await interaction.defer({ flags: MessageFlags.Ephemeral });
		const [stats, settings] = await Promise.all([readHoneypotStats(guildId), readSettings(guildId)]);
		const content_ = translateKey(t, 'commands/honeypot:stats', {
			total: stats.total,
			recent: stats.recent,
			days: RecentCatchesDays,
			action: translateKey(t, HoneypotActionKeys[settings.honeypotAction]),
			channel: getHoneypotChannels(settings).map(channelMention).join(', ') || translateKey(t, 'commands/honeypot:showNone')
		});
		return deferred.update({ content: content_, allowed_mentions: { parse: [] } });
	}
}
