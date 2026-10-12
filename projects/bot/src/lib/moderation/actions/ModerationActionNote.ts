import { ModerationAction } from '#lib/moderation/actions/base/ModerationAction';
import { TypeVariation } from '#utils/moderationConstants';

/**
 * A remark on a user. It is not a punishment: the user is never told about it, it has no duration and there is nothing
 * to undo, so nothing that counts the warnings of a user counts it.
 */
export class ModerationActionNote extends ModerationAction<never, TypeVariation.Note> {
	public constructor() {
		super({
			type: TypeVariation.Note,
			isUndoActionAvailable: false,
			isDirectMessageAvailable: false,
			logPrefix: 'Moderation => Note'
		});
	}
}
