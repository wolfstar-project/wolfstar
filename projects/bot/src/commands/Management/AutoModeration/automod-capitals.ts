import { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';
import { ApplyOptions } from '@wolfstar/http-framework';

@ApplyOptions<AutoModerationCommand.Options>({
	localizedNameKey: 'commands/auto-moderation:capitals',
	adderPropertyName: 'capitals',
	keyEnabled: 'selfmodCapitalsEnabled',
	keyOnInfraction: 'selfmodCapitalsSoftAction',
	keyPunishment: 'selfmodCapitalsHardAction',
	keyPunishmentDuration: 'selfmodCapitalsHardActionDuration',
	keyPunishmentThreshold: 'selfmodCapitalsThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodCapitalsThresholdDuration'
})
export class UserCommand extends AutoModerationCommand {}
