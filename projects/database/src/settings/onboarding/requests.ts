import { and } from '@prisma/orm-postgres/orm-client';
import type { Snowflake } from 'discord-api-types/v10';
import type { Database } from '../../index.js';
import { isRowId } from '../ids.js';
import { formatTimestamp } from '../time.js';

/**
 * A member who passed the captcha of a `Captcha` stage on the website, which the bot passes them for.
 */
export interface OnboardingRequest {
	readonly id: string;
	readonly guildId: Snowflake;
	readonly userId: Snowflake;
	/** The `Waiting` row the website read. */
	readonly verificationId: string;
}

/**
 * Reads a request of the website that is not done yet.
 * @returns The request, `null` when it was done already or does not exist.
 */
export async function fetchUnprocessedOnboardingRequest(db: Database, requestId: string): Promise<OnboardingRequest | null> {
	if (!isRowId(requestId)) return null;

	const row = await db.orm.public.OnboardingRequest.where((request) => and(request.id.eq(BigInt(requestId)), request.processedAt.isNull())).first();
	if (row === null) return null;

	return {
		id: String(row.id),
		guildId: String(row.guildId),
		userId: String(row.userId),
		verificationId: String(row.verificationId)
	};
}

/**
 * Marks a request of the website as done, with why it could not be, once.
 * @returns Whether the request was not done yet.
 */
export async function completeOnboardingRequest(db: Database, requestId: string, error: string | null): Promise<boolean> {
	if (!isRowId(requestId)) return false;

	// One `UPDATE … WHERE processed_at IS NULL RETURNING`: `update()` reads the row first and would let two complete it.
	const rows = await db.orm.public.OnboardingRequest.where((request) =>
		and(request.id.eq(BigInt(requestId)), request.processedAt.isNull())
	).updateAll({
		processedAt: formatTimestamp(Date.now()) as never,
		error
	});
	return rows.length > 0;
}

/**
 * Reads the IDs of the requests nobody claimed that were made before a time, the oldest first.
 */
export async function fetchPendingOnboardingRequestIds(db: Database, before: number, limit: number): Promise<string[]> {
	const rows = await db.orm.public.OnboardingRequest.where((request) =>
		and(request.processedAt.isNull(), request.createdAt.lt(formatTimestamp(before) as never))
	)
		.select('id')
		.orderBy((request) => request.id.asc())
		.limit(limit)
		.all();
	return rows.map((row) => String(row.id));
}
