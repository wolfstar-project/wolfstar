import { LanguageKeys } from '#lib/i18n/languageKeys';
import { AutoModerationCommand } from '#lib/moderation';
import { ApplyOptions } from '@sapphire/decorators';

const Root = LanguageKeys.Commands.AutoModeration;

@ApplyOptions<AutoModerationCommand.Options>({
	aliases: ['reaction-mode', 'r-mode'],
	description: Root.ReactionsDescription,
	localizedNameKey: Root.ReactionsName,
	adderPropertyName: 'reactions',
	keyEnabled: 'selfmodReactionsEnabled',
	keyOnInfraction: 'selfmodReactionsSoftAction',
	keyPunishment: 'selfmodReactionsHardAction',
	keyPunishmentDuration: 'selfmodReactionsHardActionDuration',
	keyPunishmentThreshold: 'selfmodReactionsThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodReactionsThresholdDuration',
	idHints: [
		'1239990618831458466' // wolfstar-prod production
	]
})
export class UserAutoModerationCommand extends AutoModerationCommand {}
