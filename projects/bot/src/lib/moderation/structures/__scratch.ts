import { ApplyOptions, RegisterCommand } from '@wolfstar/http-framework';
import { RegisterAsSubcommand } from '@wolfstar/plugin-subcommands-advanced';
import { PermissionFlagsBits } from 'discord-api-types/v10';
import { TypeVariation } from '#utils/moderationConstants';
import { ModerationCommand, applyModerationBuilder, applyModerationSubcommandBuilder } from './ModerationCommand';
import { SetUpModerationCommand } from './SetUpModerationCommand';
import { AutoModerationCommand } from './AutoModerationCommand';

@ApplyOptions<ModerationCommand.Options<TypeVariation.Kick>>({ type: TypeVariation.Kick, requiredMember: true })
@RegisterCommand((builder) =>
	applyModerationBuilder(builder, {
		root: 'commands/moderation:kick',
		type: TypeVariation.Kick,
		permissions: PermissionFlagsBits.KickMembers,
		optionalOptions: (b) => b.addIntegerOption((o) => o.setName('x').setDescription('x'))
	})
)
export class KickCommand extends ModerationCommand<TypeVariation.Kick, null> {
	protected override async checkTargetCanBeModerated(
		interaction: ModerationCommand.Interaction,
		context: ModerationCommand.HandlerParameters<null>
	) {
		const member = await super.checkTargetCanBeModerated(interaction, context);
		if (!(await member?.fetchKickable())) throw context.t('commands/moderation:kickNotKickable');
		return member;
	}
}

@ApplyOptions<SetUpModerationCommand.Options<TypeVariation.RestrictedAttachment>>({ type: TypeVariation.RestrictedAttachment })
@RegisterAsSubcommand('restrict', (b) =>
	applyModerationSubcommandBuilder(b, { root: 'commands/moderation:restrictAttachment', type: TypeVariation.RestrictedAttachment })
)
export class RestrictCommand extends SetUpModerationCommand<TypeVariation.RestrictedAttachment, null> {}

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
export class AutoCommand extends AutoModerationCommand {}
