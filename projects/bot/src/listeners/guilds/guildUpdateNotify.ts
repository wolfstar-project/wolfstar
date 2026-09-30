import { GuildSettings, readSettings, writeSettings } from '#lib/database';
import { toChannelsArray } from '#utils/bits';
import { seconds } from '#common';
import { differenceArray, differenceBitField } from '#common/comparators';
import { Colors } from '#utils/constants';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, ListenerOptions } from '@sapphire/framework';
import { isNullish } from '@sapphire/utilities';
import {
	DefaultMessageNotificationLevel,
	ExplicitContentFilterLevel,
	Guild,
	GuildFeatures,
	MessageEmbed,
	MFALevel,
	PremiumTier,
	SystemChannelFlags,
	TextChannel,
	VerificationLevel
} from 'discord.js';
import type { TFunction } from 'i18next';

type MessageNotifications = DefaultMessageNotificationLevel | number;
type ChannelFlags = Readonly<SystemChannelFlags>;
type Features = readonly GuildFeatures[];

@ApplyOptions<ListenerOptions>({ event: Events.GuildUpdate })
export class UserListener extends Listener<typeof Events.GuildUpdate> {
	public async run(previous: Guild, next: Guild) {
		const [channelId, t] = await readSettings(next, (settings) => [
			settings[GuildSettings.Channels.Logs.ServerUpdate], //
			settings.getLanguage()
		]);
		if (isNullish(channelId)) return;

		const channel = next.channels.cache.get(channelId) as TextChannel | undefined;
		if (channel === undefined) {
			await writeSettings(next, [[GuildSettings.Channels.Logs.ServerUpdate, null]]);
			return;
		}

		const changes: string[] = [...this.differenceGuild(t, previous, next)];
		if (changes.length === 0) return;

		const embed = new MessageEmbed()
			.setColor(Colors.Yellow)
			.setAuthor({ name: `${next.name} (${next.id})`, iconURL: channel.guild.iconURL({ size: 64, format: 'png', dynamic: true }) ?? undefined })
			.setDescription(changes.join('\n'))
			.setFooter({ text: t('events/guilds-logs:serverUpdate') })
			.setTimestamp();
		await channel.send({ embeds: [embed] });
	}

	private *differenceGuild(t: TFunction, previous: Guild, next: Guild) {
		if (previous.afkChannelId !== next.afkChannelId) {
			yield this.displayAfkChannel(t, previous.afkChannelId, next.afkChannelId);
		}

		if (previous.afkTimeout !== next.afkTimeout) {
			yield this.displayAfkTimeout(t, previous.afkTimeout, next.afkTimeout);
		}

		if (previous.banner !== next.banner) {
			yield this.displayBanner(t, previous.bannerURL(), next.bannerURL());
		}

		if (previous.defaultMessageNotifications !== next.defaultMessageNotifications) {
			yield this.displayDefaultMessageNotifications(t, previous.defaultMessageNotifications, next.defaultMessageNotifications);
		}

		if (previous.description !== next.description) {
			yield this.displayDescription(t, previous.description, next.description);
		}

		if (previous.discoverySplash !== next.discoverySplash) {
			yield this.displayDiscoverySplash(t, previous.discoverySplashURL(), next.discoverySplashURL());
		}

		if (previous.explicitContentFilter !== next.explicitContentFilter) {
			yield this.displayExplicitContentFilter(t, previous.explicitContentFilter, next.explicitContentFilter);
		}

		if (previous.features !== next.features) {
			yield* this.displayFeatures(t, previous.features, next.features);
		}

		if (previous.icon !== next.icon) {
			yield this.displayIcon(t, previous.iconURL(), next.iconURL());
		}

		if (previous.maximumMembers !== next.maximumMembers) {
			yield this.displayMaximumMembers(t, previous.maximumMembers, next.maximumMembers);
		}

		if (previous.mfaLevel !== next.mfaLevel) {
			yield this.displayMfaLevel(t, next.mfaLevel);
		}

		if (previous.name !== next.name) {
			yield this.displayName(t, previous.name, next.name);
		}

		if (previous.ownerId !== next.ownerId) {
			yield this.displayOwner(t, previous.ownerId, next.ownerId);
		}

		if (previous.preferredLocale !== next.preferredLocale) {
			yield this.displayPreferredLocale(t, previous.preferredLocale ?? null, next.preferredLocale ?? null);
		}

		if (previous.premiumSubscriptionCount !== next.premiumSubscriptionCount) {
			yield this.displayPremiumSubscriptionCount(t, previous.premiumSubscriptionCount, next.premiumSubscriptionCount);
		}

		if (previous.premiumTier !== next.premiumTier) {
			yield this.displayPremiumTier(t, previous.premiumTier, next.premiumTier);
		}

		if (previous.publicUpdatesChannelId !== next.publicUpdatesChannelId) {
			yield this.displayPublicUpdatesChannel(t, previous.publicUpdatesChannelId, next.publicUpdatesChannelId);
		}

		if (previous.rulesChannelId !== next.rulesChannelId) {
			yield this.displayRulesChannel(t, previous.rulesChannelId, next.rulesChannelId);
		}

		if (previous.splash !== next.splash) {
			yield this.displaySplash(t, previous.splashURL(), next.splashURL());
		}

		if (previous.systemChannelFlags !== next.systemChannelFlags) {
			yield* this.displaySystemChannelFlags(t, previous.systemChannelFlags, next.systemChannelFlags);
		}

		if (previous.systemChannelId !== next.systemChannelId) {
			yield this.displaySystemChannel(t, previous.systemChannelId, next.systemChannelId);
		}

		if (previous.vanityURLCode !== next.vanityURLCode) {
			yield this.displayVanityURLCode(t, previous.vanityURLCode, next.vanityURLCode);
		}

		if (previous.verificationLevel !== next.verificationLevel) {
			yield this.displayVerificationLevel(t, previous.verificationLevel, next.verificationLevel);
		}

		if (previous.widgetChannelId !== next.widgetChannelId) {
			yield this.displayWidgetChannel(t, previous.widgetChannelId, next.widgetChannelId);
		}

		if (previous.widgetEnabled !== next.widgetEnabled) {
			yield this.displayWidgetEnabled(t, previous.widgetEnabled, next.widgetEnabled);
		}
	}

	private displayAfkChannel(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateAfkChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateAfkChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateAfkChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayAfkTimeout(t: TFunction, previous: number, next: number): string {
		return t('events/guilds-logs:serverUpdateAfkTimeout', { previous: seconds(previous), next: seconds(next) });
	}

	private displayBanner(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateBannerAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateBannerRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateBanner', { previous, next });
	}

	private displayDefaultMessageNotifications(t: TFunction, previous: MessageNotifications, next: MessageNotifications): string {
		return t('events/guilds-logs:serverUpdateDefaultMessageNotifications', { previous, next });
	}

	private displayDescription(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateDescriptionAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateDescriptionRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateDescription', { previous, next });
	}

	private displayDiscoverySplash(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateDiscoverySplashAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateDiscoverySplashRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateDiscoverySplash', { previous, next });
	}

	private displayExplicitContentFilter(t: TFunction, previous: ExplicitContentFilterLevel, next: ExplicitContentFilterLevel): string {
		return t('events/guilds-logs:serverUpdateExplicitContentFilter', { previous, next });
	}

	private *displayFeatures(t: TFunction, previous: Features, next: Features): IterableIterator<string> {
		const difference = differenceArray(previous, next);
		if (difference.added.length) {
			const values = difference.added;
			yield t('events/guilds-logs:serverUpdateFeaturesAdded', { values, count: values.length });
		}

		if (difference.removed.length) {
			const values = difference.removed;
			yield t('events/guilds-logs:serverUpdateFeaturesRemoved', { values, count: values.length });
		}
	}

	private displayIcon(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateIconAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateIconRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateIcon', { previous, next });
	}

	private displayMaximumMembers(t: TFunction, previous: number | null, next: number | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateMaximumMembersAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateMaximumMembersRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateMaximumMembers', { previous, next });
	}

	private displayMfaLevel(t: TFunction, next: MFALevel): string {
		return t(next === 'ELEVATED' ? 'events/guilds-logs:serverUpdateMfaAdded' : 'events/guilds-logs:serverUpdateMfaRemoved');
	}

	private displayName(t: TFunction, previous: string, next: string): string {
		return t('events/guilds-logs:serverUpdateName', { previous, next });
	}

	private displayOwner(t: TFunction, previous: string, next: string): string {
		return t('events/guilds-logs:serverUpdateOwner', { previous: `<@${previous}>`, next: `<@${next}>` });
	}

	private displayPreferredLocale(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdatePreferredLocaleAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdatePreferredLocaleRemoved', { value: previous! });
		return t('events/guilds-logs:serverUpdatePreferredLocale', { previous, next });
	}

	private displayPremiumSubscriptionCount(t: TFunction, previous: number | null, next: number | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdatePremiumSubscriptionCountAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdatePremiumSubscriptionCountRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdatePremiumSubscriptionCount', { previous, next });
	}

	private displayPremiumTier(t: TFunction, previous: PremiumTier, next: PremiumTier): string {
		return t('events/guilds-logs:serverUpdatePremiumTier', { previous, next });
	}

	private displayPublicUpdatesChannel(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdatePublicUpdatesChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdatePublicUpdatesChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdatePublicUpdatesChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayRulesChannel(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateRulesChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateRulesChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateRulesChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displaySplash(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateSplashAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateSplashRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateSplash', { previous, next });
	}

	private *displaySystemChannelFlags(t: TFunction, previous: ChannelFlags, next: ChannelFlags): IterableIterator<string> {
		// NOTE: The order is swapped because fields being set mean they're disabled, opposite to other fields:
		const modified = differenceBitField(next.bitfield, previous.bitfield);
		if (modified.added !== 0) {
			const values = toChannelsArray(modified.added).map((value) => t(`guilds:${value}`));
			yield t('events/guilds-logs:serverUpdateSystemChannelFlagsAdded', { values, count: values.length });
		}

		if (modified.removed !== 0) {
			const values = toChannelsArray(modified.removed).map((value) => t(`guilds:${value}`));
			yield t('events/guilds-logs:serverUpdateSystemChannelFlagsRemoved', { values, count: values.length });
		}
	}

	private displaySystemChannel(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateSystemChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateSystemChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateSystemChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayVanityURLCode(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateVanityUrlAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateVanityUrlRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateVanityUrl', { previous, next });
	}

	private displayVerificationLevel(t: TFunction, previous: VerificationLevel, next: VerificationLevel): string {
		return t('events/guilds-logs:serverUpdateVerificationLevel', { previous, next });
	}

	private displayWidgetChannel(t: TFunction, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateWidgetChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateWidgetChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateWidgetChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayWidgetEnabled(t: TFunction, previous: boolean | null, next: boolean | null): string {
		return t((next ?? !previous) ? 'events/guilds-logs:serverUpdateWidgetEnabled' : 'events/guilds-logs:serverUpdateWidgetDisabled');
	}
}
