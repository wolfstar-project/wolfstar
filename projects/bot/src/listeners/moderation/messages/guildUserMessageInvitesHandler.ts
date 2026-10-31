import { ModerationMessageListener } from '#lib/moderation';
import { InviteStore } from '#lib/structures/InviteStore';
import type { GuildMessage } from '#lib/types';
import { Colors } from '#utils/constants';
import { deleteMessage } from '#utils/functions';
import { getFullEmbedAuthor } from '#utils/util';
import { EmbedBuilder } from '@discordjs/builders';
import { ApplyOptions } from '@wolfstar/decorators';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { AutoModerationRule } from 'wolfstar-database';

const enum CodeType {
	DiscordGG,
	ThirdPart
}

@ApplyOptions<ModerationMessageListener.Options<'Invites'>>({
	emitter: 'client',
	type: 'Invites',
	reasonLanguageKey: 'events/moderation:invites',
	reasonLanguageKeyWithMaximum: 'events/moderation:invitesWithMaximum'
})
export class UserModerationMessageListener extends ModerationMessageListener<string[], 'Invites'> {
	private readonly kInviteRegExp =
		/(?<source>discord\.(?:gg|io|me|plus|link)|invite\.(?:gg|ink)|discord(?:app)?\.com\/invite)\/(?<code>[\w-]{2,})/gi;

	/**
	 * The invites that were looked up, kept for a while so a code that is posted often is fetched once. The client
	 * held this store (`client.invites`) before, and this listener is the only piece that reads it.
	 */
	private readonly invites = new InviteStore();

	public override onUnload() {
		this.invites.destroy();
		return super.onUnload();
	}

	protected async preProcess(message: GuildMessage, rule: AutoModerationRule<'Invites'>): Promise<string[] | null> {
		if (message.content.length === 0) return null;

		let value: RegExpExecArray | null = null;
		const promises: Promise<string | null>[] = [];
		const scanned = new Set<string>();
		while ((value = this.kInviteRegExp.exec(message.content)) !== null) {
			const { code, source } = value.groups!;

			// Get from cache, else fetch it from API.
			const identifier = this.getCodeIdentifier(source);

			// If it has already been scanned, skip
			const key = `${source}/${code}`;
			if (scanned.has(key)) continue;
			scanned.add(key);

			promises.push(identifier === CodeType.DiscordGG ? this.scanLink(message, rule, key, code) : Promise.resolve(key));
		}

		const resolved = (await Promise.all(promises)).filter((invite) => invite !== null);
		return resolved.length === 0 ? null : resolved;
	}

	protected onDelete(message: GuildMessage) {
		return deleteMessage(message);
	}

	protected onAlert(message: GuildMessage, t: TFunction<AnyNamespace>) {
		return this.sendAlert(message, t, 'events/moderation:inviteFilterAlert');
	}

	protected async onLogMessage(message: GuildMessage, t: TFunction<AnyNamespace>, links: readonly string[]) {
		return new EmbedBuilder()
			.setColor(Colors.Red)
			.setAuthor(getFullEmbedAuthor(message.author, message.url))
			.setDescription(t('events/moderation:inviteFilterLog', { links, count: links.length }))
			.setFooter({ text: `#${await this.fetchChannelName(message)} | ${t('events/moderation:inviteLink')}` })
			.setTimestamp();
	}

	private async scanLink(message: GuildMessage, rule: AutoModerationRule<'Invites'>, url: string, code: string) {
		return (await this.fetchIfAllowedInvite(message, rule, code)) ? null : url;
	}

	private async fetchIfAllowedInvite(message: GuildMessage, rule: AutoModerationRule<'Invites'>, code: string) {
		// Ignored codes take short-circuit.
		if (rule.options.allowedCodes.includes(code)) return true;

		const data = await this.invites.fetch(code);

		// Invalid invites should not be deleted.
		if (!data.valid) return true;

		// Invites that don't have a guild should be deleted.
		if (data.guildId === null) return false;

		// Invites that point to the own server should be allowed.
		if (data.guildId === message.guildId) return true;

		// Invites from white-listed guilds should be allowed.
		if (rule.options.allowedGuilds.includes(data.guildId)) return true;

		// Any other invite should not be allowed.
		return false;
	}

	private getCodeIdentifier(source: string): CodeType {
		switch (source.toLowerCase()) {
			case 'discordapp.com/invite':
			case 'discord.com/invite':
			case 'discord.gg':
				return CodeType.DiscordGG;
			default:
				return CodeType.ThirdPart;
		}
	}
}
