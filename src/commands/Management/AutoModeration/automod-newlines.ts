import { LanguageKeys } from '#lib/i18n/languageKeys';
import { AutoModerationCommand } from '#lib/moderation';
import { ApplyOptions } from '@sapphire/decorators';

const Root = LanguageKeys.Commands.AutoModeration;

@ApplyOptions<AutoModerationCommand.Options>({
	aliases: ['newline-mode', 'newlines-mode', 'manage-newline', 'manage-newlines'],
	description: Root.NewlinesDescription,
	localizedNameKey: Root.NewlinesName,
	adderPropertyName: 'newlines',
	keyEnabled: 'selfmodNewlinesEnabled',
	keyOnInfraction: 'selfmodNewlinesSoftAction',
	keyPunishment: 'selfmodNewlinesHardAction',
	keyPunishmentDuration: 'selfmodNewlinesHardActionDuration',
	keyPunishmentThreshold: 'selfmodNewlinesThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodNewlinesThresholdDuration',
	idHints: [
		'1239990614796402820' // wolfstar-prod production
	]
})
export class UserAutoModerationCommand extends AutoModerationCommand {}
