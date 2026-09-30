import { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';
import { ApplyOptions } from '@wolfstar/http-framework';

@ApplyOptions<AutoModerationCommand.Options>({
	localizedNameKey: 'commands/auto-moderation:links',
	adderPropertyName: 'links',
	keyEnabled: 'selfmodLinksEnabled',
	keyOnInfraction: 'selfmodLinksSoftAction',
	keyPunishment: 'selfmodLinksHardAction',
	keyPunishmentDuration: 'selfmodLinksHardActionDuration',
	keyPunishmentThreshold: 'selfmodLinksThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodLinksThresholdDuration'
})
export class UserCommand extends AutoModerationCommand {}
