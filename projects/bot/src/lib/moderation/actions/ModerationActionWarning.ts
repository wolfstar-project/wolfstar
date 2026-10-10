import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { getModeration } from '#utils/functions';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import type { Guild } from '@wolfstar/plugin-gateway';
import type { Snowflake } from 'discord-api-types/v10';

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
	public async hasOpenWarning(guild: Guild, userId: Snowflake) {
		const warning = await this.retrieveLastModerationEntryFromUser({ guild, userId, filter: isWarning });
		return warning !== null;
	}

	/**
	 * Marks the last warning of the user as ended, so the warning that is removed no longer counts in their history.
	 */
	protected override async handleUndoPre(guild: Guild, entry: ModerationAction.Entry) {
		const warning = await this.retrieveLastModerationEntryFromUser({ guild, userId: entry.userId, filter: isWarning });
		if (warning === null) return;

		const moderation = await getModeration(guild);
		await moderation.complete(warning);
	}
}

/**
 * A warning is an entry that is not the one a removal creates, the open ones are the ones that are neither completed nor
 * archived, which `retrieveLastModerationEntryFromUser` already leaves out.
 */
function isWarning(entry: ModerationAction.Entry) {
	return (entry.metadata & TypeMetadata.Undo) === 0;
}
