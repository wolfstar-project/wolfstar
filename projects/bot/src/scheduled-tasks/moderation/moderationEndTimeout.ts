import { ModerationTask, type ModerationData } from '#lib/moderation';
import { getModeration } from '#utils/functions';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import type { Guild } from '@wolfstar/plugin-gateway';

/**
 * Discord lifts a timeout by itself, so there is nothing to undo, only the case that says so to create.
 */
export class UserModerationTask extends ModerationTask {
	protected async handle(guild: Guild, data: ModerationData) {
		const moderation = await getModeration(guild);
		const reason = await this.getReason(guild, 'Timeout released', data.duration);
		const entry = moderation.create({ user: data.userID, type: TypeVariation.Timeout, metadata: TypeMetadata.Undo, reason });
		await moderation.insert(entry);
	}
}
