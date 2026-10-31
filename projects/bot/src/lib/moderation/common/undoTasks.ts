import { UndoTaskJobOptions } from '#lib/moderation/common/constants';
import { getUndoTaskId, getUndoTaskName } from '#lib/moderation/common/util';
import { TypeMetadata } from '#utils/moderationConstants';
import type { TypeVariation } from '#utils/moderationConstants';
import { container } from '@wolfstar/http-framework';
import type { Snowflake } from 'discord-api-types/v10';

/**
 * What the job that undoes a case when it expires needs of it.
 */
export interface UndoTaskData {
	type: TypeVariation;
	id: number;
	userId: Snowflake;
	guildId: Snowflake;
	duration: number;
	extraData: unknown;
	/** When the case expires, in milliseconds. */
	expiresAt: number;
}

/**
 * Whether a temporary case still has to be undone.
 *
 * @param metadata - The metadata of the case.
 */
export function isCaseInCourse(metadata: TypeMetadata) {
	const ended = TypeMetadata.Undo | TypeMetadata.Archived | TypeMetadata.Completed;
	return (metadata & TypeMetadata.Temporary) === TypeMetadata.Temporary && (metadata & ended) === 0;
}

/**
 * Schedules the job that undoes a case when it expires, at once when it did, which does nothing for a type that has
 * nothing to undo.
 *
 * @param data - The case.
 */
export async function scheduleUndoTask(data: UndoTaskData) {
	const name = getUndoTaskName(data.type);
	if (name === null) return;

	await container.tasks.create(
		{
			name,
			payload: { caseID: data.id, userID: data.userId, guildID: data.guildId, duration: data.duration, extraData: data.extraData as never }
		},
		{
			repeated: false,
			delay: Math.max(0, data.expiresAt - Date.now()),
			customJobOptions: { jobId: getUndoTaskId(data.guildId, data.id), ...UndoTaskJobOptions }
		}
	);
}
