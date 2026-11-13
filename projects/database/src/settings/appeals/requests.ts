import { and } from '@prisma/orm-postgres/orm-client';
import type { Snowflake } from 'discord-api-types/v10';
import type { Database } from '../../index.js';
import { isRowId } from '../ids.js';
import { formatTimestamp, parseTimestamp } from '../time.js';
import type { AppealBlock, AppealRequest } from './types.js';

/**
 * Reads a request of the dashboard that is not done yet.
 * @returns The request, `null` when it was done already or does not exist.
 */
export async function fetchUnprocessedAppealRequest(db: Database, requestId: string): Promise<AppealRequest | null> {
	if (!isRowId(requestId)) return null;

	const row = await db.orm.public.AppealRequest.where((request) => and(request.id.eq(BigInt(requestId)), request.processedAt.isNull())).first();
	if (row === null) return null;

	return {
		id: String(row.id),
		guildId: String(row.guildId),
		kind: row.kind,
		appealId: row.appealId === null ? null : String(row.appealId),
		userId: row.userId === null ? null : String(row.userId),
		moderatorId: String(row.moderatorId),
		reason: row.reason
	};
}

/**
 * Marks a request of the dashboard as done, with why it could not be, once.
 * @returns Whether the request was not done yet.
 */
export async function completeAppealRequest(db: Database, requestId: string, error: string | null): Promise<boolean> {
	if (!isRowId(requestId)) return false;

	// One `UPDATE … WHERE processed_at IS NULL RETURNING`: `update()` reads the row first and would let two complete it.
	const rows = await db.orm.public.AppealRequest.where((request) => and(request.id.eq(BigInt(requestId)), request.processedAt.isNull())).updateAll({
		processedAt: formatTimestamp(Date.now()) as never,
		error
	});
	return rows.length > 0;
}

/**
 * Reads the IDs of the requests nobody claimed that were made before a time, the oldest first.
 */
export async function fetchPendingAppealRequestIds(db: Database, before: number, limit: number): Promise<string[]> {
	const rows = await db.orm.public.AppealRequest.where((request) =>
		and(request.processedAt.isNull(), request.createdAt.lt(formatTimestamp(before) as never))
	)
		.select('id')
		.orderBy((request) => request.id.asc())
		.limit(limit)
		.all();
	return rows.map((row) => String(row.id));
}

/**
 * Reads the block of a user in a guild.
 */
export async function fetchAppealBlock(db: Database, guildId: Snowflake, userId: Snowflake): Promise<AppealBlock | null> {
	const row = await db.orm.public.AppealBlock.first({ guildId: BigInt(guildId), userId: BigInt(userId) });
	if (row === null) return null;

	return {
		guildId: String(row.guildId),
		userId: String(row.userId),
		reason: row.reason,
		moderatorId: row.moderatorId === null ? null : String(row.moderatorId),
		automatic: row.automatic,
		createdAt: parseTimestamp(row.createdAt)
	};
}

/**
 * Blocks a user from the appeals of a guild.
 * @returns Whether they were not blocked yet.
 */
export async function createAppealBlock(
	db: Database,
	guildId: Snowflake,
	data: Pick<AppealBlock, 'userId' | 'reason' | 'moderatorId' | 'automatic'>,
	language = 'en-US'
): Promise<boolean> {
	const id = BigInt(guildId);
	const userId = BigInt(data.userId);
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const blocks = tx.orm.public.AppealBlock;
		if ((await blocks.first({ guildId: id, userId })) !== null) return false;

		await blocks.create({
			guildId: id,
			userId,
			reason: data.reason,
			moderatorId: data.moderatorId === null ? null : BigInt(data.moderatorId),
			automatic: data.automatic
		});
		return true;
	});
}

/**
 * Lets a user appeal in a guild again.
 * @returns Whether they were blocked.
 */
export async function deleteAppealBlock(db: Database, guildId: Snowflake, userId: Snowflake): Promise<boolean> {
	const count = await db.orm.public.AppealBlock.where({ guildId: BigInt(guildId), userId: BigInt(userId) }).deleteAndCount();
	return Number(count) > 0;
}
