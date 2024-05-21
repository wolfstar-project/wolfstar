import { LanguageKeys } from '#lib/i18n/languageKeys';
import { Events, TwitchEventSubTypes, type TwitchEventSubEvent } from '#lib/types';
import { floatPromise } from '#utils/common';
import { extractDetailedMentions } from '#utils/util';
import { TimestampStyles, time } from '@discordjs/builders';
import { ApplyOptions } from '@sapphire/decorators';
import { canSendMessages, type TextBasedChannelTypes } from '@sapphire/discord.js-utilities';
import { Listener } from '@sapphire/framework';
import type { TFunction } from '@sapphire/plugin-i18next';
import { fetchT } from '@sapphire/plugin-i18next';
import { isNullish, isNullishOrEmpty } from '@sapphire/utilities';

@ApplyOptions<Listener.Options>({
	event: Events.TwitchStreamOffline
})
export class UserListener extends Listener<Events.TwitchStreamOffline> {
	public async run(data: TwitchEventSubEvent) {
		const { twitchSubscriptions } = this.container.db;
		const date = new Date();

		const twitchSubscription = await twitchSubscriptions.findOne({
			relations: ['guildSubscription'],
			where: {
				streamerId: data.broadcaster_user_id,
				subscriptionType: TwitchEventSubTypes.StreamOffline
			}
		});

		if (twitchSubscription) {
			// Iterate over all the guilds that are subscribed to this streamer and subscription type
			for (const guildSubscription of twitchSubscription.guildSubscription) {
				if (
					this.container.client.twitch.streamNotificationDrip(
						`${twitchSubscription.streamerId}-${guildSubscription.channelId}-${TwitchEventSubTypes.StreamOffline}`
					)
				) {
					continue;
				}

				// Retrieve the guild, if not found, skip to the next loop cycle.
				const guild = this.container.client.guilds.cache.get(guildSubscription.guildId);
				if (typeof guild === 'undefined') continue;

				// Retrieve the language for this guild
				const t = await fetchT(guild);

				// Retrieve the channel to send the message to
				const channel = guild.channels.cache.get(guildSubscription.channelId) as TextBasedChannelTypes;
				if (isNullish(channel) || !canSendMessages(channel)) {
					continue;
				}

				// Construct a message embed and send it.
				// If the message could not be retrieved then skip this notification.
				if (!isNullishOrEmpty(guildSubscription.message)) {
					const detailedMentions = extractDetailedMentions(guildSubscription.message);
					floatPromise(
						channel.send({
							content: this.buildMessage(guildSubscription.message, date, t),
							allowedMentions: { parse: detailedMentions.parse, users: [...detailedMentions.users], roles: [...detailedMentions.roles] }
						})
					);
				}
			}
		}
	}

	private buildMessage(message: string, date: Date, t: TFunction): string {
		return `${message} | ${time(date, TimestampStyles.ShortDateTime)} | ${t(LanguageKeys.Events.Twitch.OfflinePostfix)}`;
	}
}
