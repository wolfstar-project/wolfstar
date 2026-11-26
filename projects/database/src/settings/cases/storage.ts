import type { Database, Models } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';
import { formatTimestamp, parseTimestamp } from '../time.js';
import {
	MaximumModerationCaseEdits,
	ModerationCaseChangeFields,
	type ModerationCaseChange,
	type ModerationCaseData,
	type ModerationCaseDataInput,
	type ModerationCaseDetailsInput,
	type ModerationCaseEdit
} from './types.js';

type Orm = Database['orm'];
type Row = Omit<Models.public_ModerationCaseData, 'guild'>;

function toCaseData(row: Row): ModerationCaseData {
	return {
		caseId: row.caseId,
		extraData: row.extraData ?? null,
		message: row.channelId === null || row.messageId === null ? null : { channelId: String(row.channelId), messageId: String(row.messageId) },
		staffNote: row.staffNote ?? null,
		proof:
			row.proofChannelId === null || row.proofMessageId === null
				? null
				: { channelId: String(row.proofChannelId), messageId: String(row.proofMessageId) }
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
 * Forgets the extra data and the message of a case. The row goes when the moderators added nothing to the case, and
 * stays with their note and their proof otherwise.
 * @param db The database to write through.
 */
export async function clearModerationCaseData(db: Database, guildId: Snowflake, caseId: number): Promise<void> {
	const where = { guildId: BigInt(guildId), caseId };
	const row = await db.orm.public.ModerationCaseData.where(where).first();
	if (!row) return;

	if ((row.staffNote ?? null) === null && row.proofMessageId === null) {
		await db.orm.public.ModerationCaseData.where(where).deleteAndCount();
		return;
	}

	await db.orm.public.ModerationCaseData.where(where).updateAndCount({ extraData: null, channelId: null, messageId: null });
}

/**
 * Stores what the moderators add to a case, its note and its proof, and keeps the rest of what it holds.
 * @param db The database to write through.
 */
export async function setModerationCaseDetails(db: Database, guildId: Snowflake, caseId: number, details: ModerationCaseDetailsInput): Promise<void> {
	const columns = {
		...(details.staffNote === undefined ? {} : { staffNote: details.staffNote }),
		...(details.proof === undefined
			? {}
			: {
					proofChannelId: details.proof === null ? null : BigInt(details.proof.channelId),
					proofMessageId: details.proof === null ? null : BigInt(details.proof.messageId)
				})
	};
	if (Object.keys(columns).length === 0) return;

	await db.orm.public.ModerationCaseData.upsert({ create: { guildId: BigInt(guildId), caseId, ...columns }, update: columns });
}

function isChange(value: unknown): value is ModerationCaseChange {
	if (typeof value !== 'object' || value === null) return false;

	const entry = value as Record<string, unknown>;
	return (
		(ModerationCaseChangeFields as readonly unknown[]).includes(entry.field) &&
		(entry.before === null || typeof entry.before === 'string') &&
		(entry.after === null || typeof entry.after === 'string')
	);
}

/**
 * Reads the edits of a case, the latest first.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 */
export async function fetchModerationCaseEdits(orm: Orm, guildId: Snowflake, caseId: number): Promise<ModerationCaseEdit[]> {
	const rows = await orm.public.ModerationCaseEdit.where({ guildId: BigInt(guildId), caseId }).all();
	return rows
		.map((row) => ({
			id: String(row.id),
			caseId: row.caseId,
			moderatorId: String(row.moderatorId),
			createdAt: parseTimestamp(row.createdAt),
			// The column is not trusted to hold what the type says:
			changes: Array.isArray(row.changes) ? (row.changes as unknown[]).filter((change) => isChange(change)) : []
		}))
		.sort((a, b) => b.createdAt - a.createdAt || Number(BigInt(b.id) - BigInt(a.id)));
}

/**
 * Records an edit of a case. A case keeps its latest {@linkcode MaximumModerationCaseEdits} edits.
 * @param db The database to write through.
 * @param createdAt When the edit was made, in milliseconds.
 */
export async function addModerationCaseEdit(
	db: Database,
	guildId: Snowflake,
	edit: Pick<ModerationCaseEdit, 'caseId' | 'moderatorId' | 'changes'>,
	createdAt: number = Date.now()
): Promise<void> {
	await db.orm.public.ModerationCaseEdit.create({
		guildId: BigInt(guildId),
		caseId: edit.caseId,
		moderatorId: BigInt(edit.moderatorId),
		createdAt: formatTimestamp(createdAt),
		changes: edit.changes
	});

	const edits = await fetchModerationCaseEdits(db.orm, guildId, edit.caseId);
	for (const old of edits.slice(MaximumModerationCaseEdits)) {
		await db.orm.public.ModerationCaseEdit.where({ id: BigInt(old.id) }).deleteAndCount();
	}
}

/**
 * Deletes the edits of a case, with the case.
 * @returns How many it had.
 */
export async function deleteModerationCaseEdits(db: Database, guildId: Snowflake, caseId: number): Promise<number> {
	const count = await db.orm.public.ModerationCaseEdit.where({ guildId: BigInt(guildId), caseId }).deleteAndCount();
	return Number(count);
}

/**
 * Deletes what a case holds besides its row.
 * @returns Whether it held something.
 */
export async function deleteModerationCaseData(db: Database, guildId: Snowflake, caseId: number): Promise<boolean> {
	const count = await db.orm.public.ModerationCaseData.where({ guildId: BigInt(guildId), caseId }).deleteAndCount();
	return Number(count) > 0;
}
