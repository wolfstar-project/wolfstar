import type { Database, Models } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';
import type { ModerationCaseData, ModerationCaseDataInput } from './types.js';

type Orm = Database['orm'];
type Row = Omit<Models.public_ModerationCaseData, 'guild'>;

function toCaseData(row: Row): ModerationCaseData {
	return {
		caseId: row.caseId,
		extraData: row.extraData ?? null,
		message: row.channelId === null || row.messageId === null ? null : { channelId: String(row.channelId), messageId: String(row.messageId) }
	};
}

function toColumns(data: ModerationCaseDataInput) {
	return {
		extraData: (data.extraData ?? null) as Row['extraData'],
		channelId: data.message === null ? null : BigInt(data.message.channelId),
		messageId: data.message === null ? null : BigInt(data.message.messageId)
	};
}

/**
 * Reads what a case of a guild holds besides its row, `null` when it holds nothing.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 */
export async function fetchModerationCaseData(orm: Orm, guildId: Snowflake, caseId: number): Promise<ModerationCaseData | null> {
	const row = await orm.public.ModerationCaseData.where({ guildId: BigInt(guildId), caseId }).first();
	return row ? toCaseData(row) : null;
}

/**
 * Reads what the cases of a guild hold besides their rows, by case ID. Only the cases that hold something have an
 * entry.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 */
export async function fetchModerationCasesData(orm: Orm, guildId: Snowflake): Promise<Map<number, ModerationCaseData>> {
	const rows = await orm.public.ModerationCaseData.where({ guildId: BigInt(guildId) }).all();
	return new Map(rows.map((row) => [row.caseId, toCaseData(row)]));
}

/**
 * Stores what a case holds besides its row, in place of what it held.
 * @param db The database to write through.
 */
export async function setModerationCaseData(db: Database, guildId: Snowflake, caseId: number, data: ModerationCaseDataInput): Promise<void> {
	const columns = toColumns(data);
	await db.orm.public.ModerationCaseData.upsert({ create: { guildId: BigInt(guildId), caseId, ...columns }, update: columns });
}

/**
 * Deletes what a case holds besides its row.
 * @returns Whether it held something.
 */
export async function deleteModerationCaseData(db: Database, guildId: Snowflake, caseId: number): Promise<boolean> {
	const count = await db.orm.public.ModerationCaseData.where({ guildId: BigInt(guildId), caseId }).deleteAndCount();
	return Number(count) > 0;
}
