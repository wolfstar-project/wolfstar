import type { Database, Models } from '../../index.js';
import type { Snowflake } from 'discord-api-types/v10';
import { isRowId } from '../ids.js';
import type { Report, ReportCloseData, ReportCreateData } from './types.js';

type Orm = Database['orm'];
type Row = Omit<Models.public_Report, 'guild'>;

function toMilliseconds(value: string | null) {
	return value === null ? null : new Date(value).getTime();
}

function toReport(row: Row): Report {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		reporterId: String(row.reporterId),
		targetId: String(row.targetId),
		targetTag: row.targetTag,
		channelId: row.channelId === null ? null : String(row.channelId),
		messageId: row.messageId === null ? null : String(row.messageId),
		reason: row.reason,
		content: row.content,
		attachments: [...row.attachments],
		anonymous: row.anonymous,
		status: row.status,
		action: row.action,
		caseId: row.caseId,
		moderatorId: row.moderatorId === null ? null : String(row.moderatorId),
		createdAt: toMilliseconds(row.createdAt)!,
		closedAt: toMilliseconds(row.closedAt)
	};
}

/**
 * Creates a report, and the `Guild` row it references when the guild has none yet.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data The report to create, which starts open.
 * @param language The language a `Guild` row is created with.
 */
export async function createReport(db: Database, guildId: Snowflake, data: ReportCreateData, language = 'en-US'): Promise<Report> {
	const id = BigInt(guildId);
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		const row = await tx.orm.public.Report.create({
			guildId: id,
			reporterId: BigInt(data.reporterId),
			targetId: BigInt(data.targetId),
			targetTag: data.targetTag,
			channelId: data.channelId === null ? null : BigInt(data.channelId),
			messageId: data.messageId === null ? null : BigInt(data.messageId),
			reason: data.reason,
			content: data.content,
			attachments: data.attachments,
			anonymous: data.anonymous,
			status: 'Open'
		});
		return toReport(row);
	});
}

/**
 * Reads a report of a guild.
 * @param orm The ORM surface to read through, `db.orm` or a transaction's `tx.orm`.
 * @param guildId The guild's ID, so a report of another guild is never read.
 * @param reportId The report's ID.
 */
export async function fetchReport(orm: Orm, guildId: Snowflake, reportId: string): Promise<Report | null> {
	if (!isRowId(reportId)) return null;

	const row = await orm.public.Report.first({ id: BigInt(reportId), guildId: BigInt(guildId) });
	return row === null ? null : toReport(row);
}

/**
 * Reads the reports of a guild, newest first.
 * @param orm The ORM surface to read through.
 * @param guildId The guild's ID.
 * @param options The user the reports are about, when only theirs are wanted, and how many to read.
 */
export async function fetchReports(orm: Orm, guildId: Snowflake, options: { targetId?: Snowflake | null; limit: number }): Promise<Report[]> {
	const where = options.targetId ? { guildId: BigInt(guildId), targetId: BigInt(options.targetId) } : { guildId: BigInt(guildId) };
	const rows = await orm.public.Report.where(where)
		.orderBy((report) => report.id.desc())
		.limit(options.limit)
		.all();
	return rows.map((row) => toReport(row));
}

/**
 * Closes a report that is open.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param reportId The report's ID.
 * @param data What became of the report.
 * @returns Whether the report was open: `false` when it does not exist or another moderator closed it first.
 */
export async function closeReport(db: Database, guildId: Snowflake, reportId: string, data: ReportCloseData): Promise<boolean> {
	if (!isRowId(reportId)) return false;

	const count = await db.orm.public.Report.where({ id: BigInt(reportId), guildId: BigInt(guildId), status: 'Open' }).updateAndCount({
		status: data.status,
		action: data.action,
		caseId: data.caseId,
		moderatorId: BigInt(data.moderatorId),
		closedAt: new Date().toISOString() as Row['closedAt']
	});
	return Number(count) > 0;
}

/**
 * Opens a report again, which is only done when the action it was closed for could not be taken.
 * @returns Whether the report was closed.
 */
export async function reopenReport(db: Database, guildId: Snowflake, reportId: string): Promise<boolean> {
	if (!isRowId(reportId)) return false;

	const count = await db.orm.public.Report.where({ id: BigInt(reportId), guildId: BigInt(guildId) }).updateAndCount({
		status: 'Open',
		action: null,
		caseId: null,
		moderatorId: null,
		closedAt: null
	});
	return Number(count) > 0;
}

/**
 * Sets the case a report was closed with, once the action that makes it was taken.
 */
export async function setReportCase(db: Database, guildId: Snowflake, reportId: string, caseId: number): Promise<void> {
	if (!isRowId(reportId)) return;

	await db.orm.public.Report.where({ id: BigInt(reportId), guildId: BigInt(guildId) }).updateAndCount({ caseId });
}

/**
 * Deletes a report, which is only done to one that could not be delivered to the moderators.
 * @returns Whether the report existed.
 */
export async function deleteReport(db: Database, guildId: Snowflake, reportId: string): Promise<boolean> {
	if (!isRowId(reportId)) return false;

	const count = await db.orm.public.Report.where({ id: BigInt(reportId), guildId: BigInt(guildId) }).deleteAndCount();
	return Number(count) > 0;
}
