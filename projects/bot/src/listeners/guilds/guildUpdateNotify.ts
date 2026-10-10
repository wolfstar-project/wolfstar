import { readSettings } from '#lib/database';
import { createTranslator, type Translator } from '#lib/structures/commands/utils';
import { toChannelsArray } from '#utils/bits';
import { differenceArray, differenceBitField, seconds } from '#common';
import { Colors } from '#utils/constants';
import { getLogger } from '#utils/functions';
import { EmbedBuilder } from '@discordjs/builders';
import { fetchT } from '@wolfstar/plugin-i18next';
import { EventGatewayListener, RegisterAsGatewayListener } from '@wolfstar/plugin-gateway';
import type { Guild, SystemChannelFlagsBitField } from '@wolfstar/plugin-gateway';
import { GuildMFALevel } from 'discord-api-types/v10';
import type {
	GuildDefaultMessageNotifications,
	GuildExplicitContentFilter,
	GuildFeature,
	GuildPremiumTier,
	GuildVerificationLevel
} from 'discord-api-types/v10';

type ChannelFlags = Readonly<SystemChannelFlagsBitField>;
type Features = readonly `${GuildFeature}`[];

@RegisterAsGatewayListener('guildUpdate')
export class UserListener extends EventGatewayListener<'guildUpdate'> {
	public async run(previous: Guild | null, next: Guild) {
		// The guild was not cached, there is nothing to compare it with:
		if (previous === null) return;

		const settings = await readSettings(next);
		const logger = await getLogger(next);
		await logger.send({
			key: 'logsServerUpdate',
			channelId: settings.logsServerUpdate,
			makeMessage: async () => {
				const t = createTranslator(await fetchT(next));
				const changes: string[] = [...this.differenceGuild(t, previous, next)];
				if (changes.length === 0) return null;

				return new EmbedBuilder()
					.setColor(Colors.Yellow)
					.setAuthor({ name: `${next.name} (${next.id})`, iconURL: next.iconURL({ size: 64, extension: 'png' }) ?? undefined })
					.setDescription(changes.join('\n'))
					.setFooter({ text: t('events/guilds-logs:serverUpdate') })
					.setTimestamp();
			}
		});
	}

	private *differenceGuild(t: Translator, previous: Guild, next: Guild) {
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

	private displayAfkChannel(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateAfkChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateAfkChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateAfkChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayAfkTimeout(t: Translator, previous: number, next: number): string {
		return t('events/guilds-logs:serverUpdateAfkTimeout', { previous: seconds(previous), next: seconds(next) });
	}

	private displayBanner(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateBannerAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateBannerRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateBanner', { previous, next });
	}

	private displayDefaultMessageNotifications(
		t: Translator,
		previous: GuildDefaultMessageNotifications,
		next: GuildDefaultMessageNotifications
	): string {
		return t('events/guilds-logs:serverUpdateDefaultMessageNotifications', { previous, next });
	}

	private displayDescription(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateDescriptionAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateDescriptionRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateDescription', { previous, next });
	}

	private displayDiscoverySplash(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateDiscoverySplashAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateDiscoverySplashRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateDiscoverySplash', { previous, next });
	}

	private displayExplicitContentFilter(t: Translator, previous: GuildExplicitContentFilter, next: GuildExplicitContentFilter): string {
		return t('events/guilds-logs:serverUpdateExplicitContentFilter', { previous, next });
	}

	private *displayFeatures(t: Translator, previous: Features, next: Features): IterableIterator<string> {
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

	private displayIcon(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateIconAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateIconRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateIcon', { previous, next });
	}

	private displayMaximumMembers(t: Translator, previous: number | null, next: number | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateMaximumMembersAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateMaximumMembersRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateMaximumMembers', { previous, next });
	}

	private displayMfaLevel(t: Translator, next: GuildMFALevel): string {
		return t(next === GuildMFALevel.Elevated ? 'events/guilds-logs:serverUpdateMfaAdded' : 'events/guilds-logs:serverUpdateMfaRemoved');
	}

	private displayName(t: Translator, previous: string, next: string): string {
		return t('events/guilds-logs:serverUpdateName', { previous, next });
	}

	private displayOwner(t: Translator, previous: string, next: string): string {
		return t('events/guilds-logs:serverUpdateOwner', { previous: `<@${previous}>`, next: `<@${next}>` });
	}

	private displayPreferredLocale(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdatePreferredLocaleAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdatePreferredLocaleRemoved', { value: previous! });
		return t('events/guilds-logs:serverUpdatePreferredLocale', { previous, next });
	}

	private displayPremiumSubscriptionCount(t: Translator, previous: number | null, next: number | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdatePremiumSubscriptionCountAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdatePremiumSubscriptionCountRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdatePremiumSubscriptionCount', { previous, next });
	}

	private displayPremiumTier(t: Translator, previous: GuildPremiumTier, next: GuildPremiumTier): string {
		return t('events/guilds-logs:serverUpdatePremiumTier', { previous, next });
	}

	private displayPublicUpdatesChannel(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdatePublicUpdatesChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdatePublicUpdatesChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdatePublicUpdatesChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayRulesChannel(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateRulesChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateRulesChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateRulesChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displaySplash(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateSplashAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateSplashRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateSplash', { previous, next });
	}

	private *displaySystemChannelFlags(t: Translator, previous: ChannelFlags, next: ChannelFlags): IterableIterator<string> {
		// NOTE: The order is swapped because fields being set mean they're disabled, opposite to other fields:
		const modified = differenceBitField(next.bitField, previous.bitField);
		if (modified.added !== 0n) {
			const values = toChannelsArray(Number(modified.added)).map((value) => t(`guilds:${value}`));
			yield t('events/guilds-logs:serverUpdateSystemChannelFlagsAdded', { values, count: values.length });
		}

		if (modified.removed !== 0n) {
			const values = toChannelsArray(Number(modified.removed)).map((value) => t(`guilds:${value}`));
			yield t('events/guilds-logs:serverUpdateSystemChannelFlagsRemoved', { values, count: values.length });
		}
	}

	private displaySystemChannel(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateSystemChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateSystemChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateSystemChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayVanityURLCode(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateVanityUrlAdded', { value: next! });
		if (next === null) return t('events/guilds-logs:serverUpdateVanityUrlRemoved', { value: previous });
		return t('events/guilds-logs:serverUpdateVanityUrl', { previous, next });
	}

	private displayVerificationLevel(t: Translator, previous: GuildVerificationLevel, next: GuildVerificationLevel): string {
		return t('events/guilds-logs:serverUpdateVerificationLevel', { previous, next });
	}

	private displayWidgetChannel(t: Translator, previous: string | null, next: string | null): string {
		if (previous === null) return t('events/guilds-logs:serverUpdateWidgetChannelAdded', { value: `<#${next!}>` });
		if (next === null) return t('events/guilds-logs:serverUpdateWidgetChannelRemoved', { value: `<#${previous}>` });
		return t('events/guilds-logs:serverUpdateWidgetChannel', { previous: `<#${previous}>`, next: `<#${next}>` });
	}

	private displayWidgetEnabled(t: Translator, previous: boolean | null, next: boolean | null): string {
		return t((next ?? !previous) ? 'events/guilds-logs:serverUpdateWidgetEnabled' : 'events/guilds-logs:serverUpdateWidgetDisabled');
	}
}
