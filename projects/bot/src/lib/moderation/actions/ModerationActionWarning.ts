import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { getModeration } from '#utils/functions';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';

export class ModerationActionWarning extends ModerationAction<number, TypeVariation.Warning> {
	public constructor() {
		super({
			type: TypeVariation.Warning,
			isUndoActionAvailable: false,
			logPrefix: 'Moderation => Warning'
		});
	}

	/**
	 * Whether a user has a warning that was not removed, which is what `/warn remove` removes.
	 *
	 * @remarks It is not {@linkcode ModerationAction.isActive}, which `/warn add` reads: a user can be warned again while
	 * they have a warning.
	 */
	public async hasOpenWarning(guild: Parameters<ModerationAction['isActive']>[0], userId: Parameters<ModerationAction['isActive']>[1]) {
		return (await this.retrieveLastModerationEntryFromUser({ guild, userId, filter: isWarning })) !== null;
	}

	/**
	 * Marks the last warning of the user as ended, so the warning that is removed no longer counts in their history.
	 */
	protected override async handleUndoPre(guild: Parameters<ModerationAction['isActive']>[0], entry: ModerationAction.Entry) {
		const warning = await this.retrieveLastModerationEntryFromUser({ guild, userId: entry.userId, filter: isWarning });
		if (warning !== null) await (await getModeration(guild)).complete(warning);
	}
}

/**
 * A warning is an entry that is not the one a removal creates, the open ones are the ones that are neither completed nor
 * archived, which `retrieveLastModerationEntryFromUser` already leaves out.
 */
function isWarning(entry: ModerationAction.Entry) {
	return (entry.metadata & TypeMetadata.Undo) === 0;
}
