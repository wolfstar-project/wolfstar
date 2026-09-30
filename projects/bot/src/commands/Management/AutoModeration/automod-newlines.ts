import { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';
import { ApplyOptions } from '@wolfstar/http-framework';

@ApplyOptions<AutoModerationCommand.Options>({
	localizedNameKey: 'commands/auto-moderation:newlines',
	adderPropertyName: 'newlines',
	keyEnabled: 'selfmodNewlinesEnabled',
	keyOnInfraction: 'selfmodNewlinesSoftAction',
	keyPunishment: 'selfmodNewlinesHardAction',
	keyPunishmentDuration: 'selfmodNewlinesHardActionDuration',
	keyPunishmentThreshold: 'selfmodNewlinesThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodNewlinesThresholdDuration'
})
export class UserCommand extends AutoModerationCommand {}
