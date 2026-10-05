import { readSettings } from '#lib/database';
import { fetchGuildT } from '#lib/moderation/common';
import { Events } from '#lib/types';
import { Colors } from '#utils/constants';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { isIterableCache } from '@wolfstar/plugin-cache';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { User } from '@wolfstar/plugin-gateway';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';

type FooterKey = 'events/guilds-members:usernameUpdate';

@RegisterAsGatewayListener('userUpdate')
export class UserListener extends EventGatewayListener<'userUpdate'> {
	public async run(previous: User | null, user: User) {
		// Without the previous state of the user there is nothing to compare the username with:
		if (previous === null) return;

		const prevUsername = previous.username;
		const nextUserName = user.username;
		if (prevUsername === nextUserName) return;

		const guildIds = await this.fetchSharedGuildIds(user.id);
		const promises = guildIds.map((guildId) => this.processGuild(guildId, user, prevUsername, nextUserName));
		if (promises.length) await Promise.all(promises);
	}

	/**
	 * Gets the IDs of the cached guilds the user is a cached member of.
	 *
	 * @remarks
	 *
	 * The gateway cache cannot be iterated through its managers, so the guilds are listed from the raw guild store,
	 * whose keys are the guild IDs, and the member of each is looked up in the members cache.
	 *
	 * @param userId - The ID of the user to look the guilds up for.
	 */
	private async fetchSharedGuildIds(userId: Snowflake) {
		const { cache, members } = this.container.gatewayClient;
		const store = cache?.guilds;
		if (!store || !isIterableCache(store)) return [];

		const guildIds = await store.keys();
		const shared = await Promise.all(guildIds.map((guildId) => members.cache.has(members.resolveKey(guildId, userId))));
		return guildIds.filter((_, index) => shared[index]);
	}

	private async processGuild(guildId: Snowflake, user: User, previous: string, next: string) {
		const settings = await readSettings(guildId);
		const logChannelId = settings.logsMemberUsernameUpdate;
		if (!logChannelId) return;

		const { guilds } = this.container.gatewayClient;
		const guild = await guilds.cache.get(guilds.resolveKey(guildId));
		if (!guild) return;

		// Send the Username log
		const t = await fetchGuildT(guild);
		this.container.client.emit(Events.GuildMessageLog, guild, logChannelId, 'logsMemberUsernameUpdate', () =>
			this.buildEmbed(user, t, this.getNameDescription(t, previous, next), 'events/guilds-members:usernameUpdate')
		);
	}

	private getNameDescription(t: TFunction<AnyNamespace>, previousName: string | null, nextName: string | null) {
		const previous =
			previousName === null
				? t('events/guilds-members:nameUpdatePreviousWasNotSet')
				: t('events/guilds-members:nameUpdatePreviousWasSet', { previousName });
		const next =
			nextName === null ? t('events/guilds-members:nameUpdateNextWasNotSet') : t('events/guilds-members:nameUpdateNextWasSet', { nextName });
		return [previous, next].join('\n');
	}

	private buildEmbed(user: User, t: TFunction<AnyNamespace>, description: string, footerKey: FooterKey) {
		return new EmbedBuilder()
			.setColor(Colors.Yellow)
			.setAuthor(getFullEmbedAuthor(user))
			.setDescription(description)
			.setFooter({ text: t(footerKey) })
			.setTimestamp();
	}
}
