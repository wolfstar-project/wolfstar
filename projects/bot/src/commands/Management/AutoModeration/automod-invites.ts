import { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';
import { ApplyOptions } from '@wolfstar/http-framework';

@ApplyOptions<AutoModerationCommand.Options>({
	localizedNameKey: 'commands/auto-moderation:invites',
	adderPropertyName: 'invites',
	keyEnabled: 'selfmodInvitesEnabled',
	keyOnInfraction: 'selfmodInvitesSoftAction',
	keyPunishment: 'selfmodInvitesHardAction',
	keyPunishmentDuration: 'selfmodInvitesHardActionDuration',
	keyPunishmentThreshold: 'selfmodInvitesThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodInvitesThresholdDuration'
})
export class UserCommand extends AutoModerationCommand {}
