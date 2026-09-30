import { AdderKey, GuildEntity, GuildSettings } from '#lib/database';
import { SelfModerationCommand } from '#lib/moderation';
import { ApplyOptions } from '@sapphire/decorators';
import type { PickByValue } from '@sapphire/utilities';

@ApplyOptions<SelfModerationCommand.Options>({
	aliases: ['link-mode', 'lmode', 'linkfilter', 'extlinks', 'externallinks'],
	description: 'commands/management:linkModeDescription',
	detailedDescription: 'commands/management:linkModeExtended'
})
export class UserSelfModerationCommand extends SelfModerationCommand {
	protected $adder: AdderKey = 'links';
	protected keyEnabled: PickByValue<GuildEntity, boolean> = GuildSettings.Selfmod.Links.Enabled;
	protected keySoftAction: PickByValue<GuildEntity, number> = GuildSettings.Selfmod.Links.SoftAction;
	protected keyHardAction: PickByValue<GuildEntity, number | null> = GuildSettings.Selfmod.Links.HardAction;
	protected keyHardActionDuration: PickByValue<GuildEntity, number | null> = GuildSettings.Selfmod.Links.HardActionDuration;
	protected keyThresholdMaximum: PickByValue<GuildEntity, number | null> = GuildSettings.Selfmod.Links.ThresholdMaximum;
	protected keyThresholdDuration: PickByValue<GuildEntity, number | null> = GuildSettings.Selfmod.Links.ThresholdDuration;
}
