import { AutoModerationCommand } from '#lib/moderation/structures/AutoModerationCommand';
import { ApplyOptions } from '@wolfstar/http-framework';

@ApplyOptions<AutoModerationCommand.Options>({
	localizedNameKey: 'commands/auto-moderation:attachments',
	adderPropertyName: 'attachments',
	keyEnabled: 'selfmodAttachmentsEnabled',
	keyOnInfraction: 'selfmodAttachmentsSoftAction',
	keyPunishment: 'selfmodAttachmentsHardAction',
	keyPunishmentDuration: 'selfmodAttachmentsHardActionDuration',
	keyPunishmentThreshold: 'selfmodAttachmentsThresholdMaximum',
	keyPunishmentThresholdPeriod: 'selfmodAttachmentsThresholdDuration'
})
export class UserCommand extends AutoModerationCommand {}
