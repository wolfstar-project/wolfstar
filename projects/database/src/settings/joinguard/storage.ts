import { and } from '@prisma/orm-postgres/orm-client';
import type { Snowflake } from 'discord-api-types/v10';
import type { Database, Models } from '../../index.js';
import { isRowId } from '../ids.js';
import { formatTimestamp, parseTimestamp } from '../time.js';
import type {
	JoinGuardCheckpoint,
	JoinGuardCheckpointCounts,
	JoinGuardCheckpointCreateData,
	JoinGuardCheckpointResolveData,
	JoinGuardRequestRecord,
	JoinGuardRule,
	JoinGuardSharedBanSource
} from './types.js';

type Orm = Database['orm'];
type RuleRow = Omit<Models.public_GuildJoinGuardRule, 'guild'>;
type CheckpointRow = Omit<Models.public_JoinGuardCheckpoint, 'guild' | 'rule'>;
type RequestRow = Omit<Models.public_JoinGuardRequest, 'guild'>;
type Timestamp = CheckpointRow['createdAt'];

function toTimestamp(milliseconds: number) {
	return formatTimestamp(milliseconds) as Timestamp;
}

function toMilliseconds(value: string | null) {
	return value === null ? null : parseTimestamp(value);
}

function toSnowflake(value: bigint | null) {
	return value === null ? null : String(value);
}

function toRule(row: RuleRow): JoinGuardRule {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		name: row.name,
		enabled: row.enabled,
		accountAgeMax: row.accountAgeMax,
		defaultAvatar: row.defaultAvatar,
		generatedName: row.generatedName,
		nameContains: row.nameContains,
		unverifiedBot: row.unverifiedBot,
		sendToCheckpoint: row.sendToCheckpoint,
		roleId: toSnowflake(row.roleId),
		directMessage: row.directMessage,
		alertChannelId: toSnowflake(row.alertChannelId),
		hardAction: row.hardAction,
		createdAt: parseTimestamp(row.createdAt)
	};
}

function toCheckpoint(row: CheckpointRow): JoinGuardCheckpoint {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		userId: String(row.userId),
		ruleId: toSnowflake(row.ruleId),
		ruleName: row.ruleName,
		status: row.status,
		resolution: row.resolution,
		moderatorId: toSnowflake(row.moderatorId),
		caseId: row.caseId,
		accountCreatedAt: parseTimestamp(row.accountCreatedAt),
		defaultAvatar: row.defaultAvatar,
		generatedName: row.generatedName,
		trust: row.trust,
		linkedAccounts: row.linkedAccounts,
		createdAt: parseTimestamp(row.createdAt),
		expiresAt: toMilliseconds(row.expiresAt),
		resolvedAt: toMilliseconds(row.resolvedAt)
	};
}

function toRequest(row: RequestRow): JoinGuardRequestRecord {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		kind: row.kind,
		userId: toSnowflake(row.userId),
		checkpointId: toSnowflake(row.checkpointId),
		moderatorId: toSnowflake(row.moderatorId),
		trust: row.trust,
		linkedAccounts: row.linkedAccounts,
		reason: row.reason,
		createdAt: parseTimestamp(row.createdAt)
	};
}

/**
 * Reads the rules of the join guard of a guild, oldest first.
 * @param orm The ORM surface to read through.
 * @param guildId The guild's ID.
 */
export async function fetchJoinGuardRules(orm: Orm, guildId: Snowflake): Promise<JoinGuardRule[]> {
	const rows = await orm.public.GuildJoinGuardRule.where({ guildId: BigInt(guildId) }).all();
	return rows.map((row) => toRule(row)).sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
}

/**
 * Records a member the join guard stopped. A row of the member that still waits is of an earlier stay in the guild,
 * which the bot did not see end: it is marked as left first, so a member waits once at most.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param data What the member is recorded with.
 * @param language The language a `Guild` row is created with, when the guild has none yet.
 */
export async function createJoinGuardCheckpoint(
	db: Database,
	guildId: Snowflake,
	data: JoinGuardCheckpointCreateData,
	language = 'en-US'
): Promise<JoinGuardCheckpoint> {
	const ruleId = isRowId(data.ruleId) ? BigInt(data.ruleId) : null;
	try {
		return await insertJoinGuardCheckpoint(db, guildId, data, ruleId, language);
	} catch (error) {
		// The dashboard deleted the rule since the guard read it: the row keeps its name, as when it is deleted later.
		if (ruleId !== null && isErrorOf(error, RuleForeignKey)) return insertJoinGuardCheckpoint(db, guildId, data, null, language);
		throw error;
	}
}

/**
 * The name of the foreign key of a row of the queue to the rule that stopped the member.
 */
const RuleForeignKey = 'JoinGuardCheckpoint_rule_id_fkey';

function isErrorOf(error: unknown, constraint: string) {
	for (let current = error; current instanceof Error; current = current.cause) {
		if (current.message.includes(constraint) || (current as { constraint?: unknown }).constraint === constraint) return true;
	}
	return false;
}

function insertJoinGuardCheckpoint(db: Database, guildId: Snowflake, data: JoinGuardCheckpointCreateData, ruleId: bigint | null, language: string) {
	const id = BigInt(guildId);
	const now = Date.now();
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
		await tx.orm.public.JoinGuardCheckpoint.where({ guildId: id, userId: BigInt(data.userId), status: 'Waiting' }).updateAndCount({
			status: 'Left',
			resolvedAt: toTimestamp(now)
		});

		const row = await tx.orm.public.JoinGuardCheckpoint.create({
			guildId: id,
			userId: BigInt(data.userId),
			ruleId,
			ruleName: data.ruleName,
			status: data.status,
			resolution: data.status === 'Waiting' ? null : 'Rule',
			caseId: data.caseId,
			accountCreatedAt: toTimestamp(data.accountCreatedAt),
			defaultAvatar: data.defaultAvatar,
			generatedName: data.generatedName,
			expiresAt: data.expiresAt === null ? null : toTimestamp(data.expiresAt),
			resolvedAt: data.status === 'Waiting' ? null : toTimestamp(now)
		});
		return toCheckpoint(row);
	});
}

/**
 * Reads a row of the queue by its ID, whatever its guild: the job of a timeout only knows that.
 * @param orm The ORM surface to read through.
 * @param checkpointId The ID of the row.
 */
export async function fetchJoinGuardCheckpoint(orm: Orm, checkpointId: string): Promise<JoinGuardCheckpoint | null> {
	if (!isRowId(checkpointId)) return null;

	const row = await orm.public.JoinGuardCheckpoint.first({ id: BigInt(checkpointId) });
	return row === null ? null : toCheckpoint(row);
}

/**
 * Reads the row of a member who waits at the checkpoint of a guild.
 * @param orm The ORM surface to read through.
 * @param guildId The guild's ID.
 * @param userId The member's ID.
 * @returns The row, `null` when the member does not wait.
 */
export async function fetchWaitingJoinGuardCheckpoint(orm: Orm, guildId: Snowflake, userId: Snowflake): Promise<JoinGuardCheckpoint | null> {
	const row = await orm.public.JoinGuardCheckpoint.where({ guildId: BigInt(guildId), userId: BigInt(userId), status: 'Waiting' }).first();
	return row === null ? null : toCheckpoint(row);
}

/**
 * Resolves a member who waits at the checkpoint, only while they still wait: a timeout, the page and a moderator that
 * act on the same member at once resolve them once.
 * @param db The database to write through.
 * @param checkpointId The ID of the row.
 * @param data What became of the member.
 * @returns Whether the member was still waiting.
 */
export async function resolveJoinGuardCheckpoint(db: Database, checkpointId: string, data: JoinGuardCheckpointResolveData): Promise<boolean> {
	if (!isRowId(checkpointId)) return false;

	const count = await db.orm.public.JoinGuardCheckpoint.where({ id: BigInt(checkpointId), status: 'Waiting' }).updateAndCount({
		status: data.status,
		resolution: data.resolution,
		resolvedAt: toTimestamp(Date.now()),
		...(data.moderatorId === undefined ? {} : { moderatorId: data.moderatorId === null ? null : BigInt(data.moderatorId) }),
		...(data.caseId === undefined ? {} : { caseId: data.caseId }),
		...(data.trust === undefined ? {} : { trust: data.trust }),
		...(data.linkedAccounts === undefined ? {} : { linkedAccounts: data.linkedAccounts })
	});
	return Number(count) > 0;
}

/**
 * Sets the case a row of the queue was resolved with, once the action that makes it was taken.
 */
export async function setJoinGuardCheckpointCase(db: Database, checkpointId: string, caseId: number): Promise<void> {
	if (!isRowId(checkpointId)) return;

	await db.orm.public.JoinGuardCheckpoint.where({ id: BigInt(checkpointId) }).updateAndCount({ caseId });
}

/**
 * Marks as left the rows of a member who waited at the checkpoint of a guild and left it.
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param userId The member's ID.
 * @returns The rows that waited.
 */
export async function leaveJoinGuardCheckpoints(db: Database, guildId: Snowflake, userId: Snowflake): Promise<JoinGuardCheckpoint[]> {
	const rows = await db.orm.public.JoinGuardCheckpoint.where({ guildId: BigInt(guildId), userId: BigInt(userId), status: 'Waiting' }).updateAll({
		status: 'Left',
		resolvedAt: toTimestamp(Date.now())
	});
	return rows.map((row) => toCheckpoint(row));
}

/**
 * Counts the members the join guard of a guild stopped since a time, and the ones who wait at its checkpoint now.
 * @param orm The ORM surface to read through.
 * @param guildId The guild's ID.
 * @param since The time to count from, in milliseconds.
 */
export async function countJoinGuardCheckpoints(orm: Orm, guildId: Snowflake, since: number): Promise<JoinGuardCheckpointCounts> {
	const id = BigInt(guildId);
	const checkpoints = orm.public.JoinGuardCheckpoint;
	const [stopped, waiting] = await Promise.all([
		checkpoints
			.where({ guildId: id })
			.where((row) => row.createdAt.gte(toTimestamp(since)))
			.aggregate((aggregate) => ({ total: aggregate.count() })),
		checkpoints.where({ guildId: id, status: 'Waiting' }).aggregate((aggregate) => ({ total: aggregate.count() }))
	]);
	return { stopped: stopped.total, waiting: waiting.total };
}

/**
 * Claims a request of the website, so it is done once: by the process that marks it first, whether the notification or
 * the sweep brought it.
 * @param db The database to write through.
 * @param requestId The ID of the request.
 * @returns The request, `null` when it was claimed already or does not exist.
 */
export async function claimJoinGuardRequest(db: Database, requestId: string): Promise<JoinGuardRequestRecord | null> {
	if (!isRowId(requestId)) return null;

	// One `UPDATE … WHERE processed_at IS NULL RETURNING`: `update()` reads the row first and would let two claim it.
	const [row] = await db.orm.public.JoinGuardRequest.where((request) =>
		and(request.id.eq(BigInt(requestId)), request.processedAt.isNull())
	).updateAll({ processedAt: toTimestamp(Date.now()) });
	return row === undefined ? null : toRequest(row);
}

/**
 * Reads the IDs of the requests nobody claimed that were made before a time, the oldest first.
 * @param orm The ORM surface to read through.
 * @param before The time, in milliseconds: a newer request is left to its notification.
 * @param limit How many to read at most.
 */
export async function fetchPendingJoinGuardRequestIds(orm: Orm, before: number, limit: number): Promise<string[]> {
	const rows = await orm.public.JoinGuardRequest.where((request) => and(request.processedAt.isNull(), request.createdAt.lt(toTimestamp(before))))
		.select('id')
		.orderBy((request) => request.id.asc())
		.limit(limit)
		.all();
	return rows.map((row) => String(row.id));
}

/**
 * Writes why a request could not be done, which the dashboard shows.
 */
export async function setJoinGuardRequestError(db: Database, requestId: string, error: string): Promise<void> {
	if (!isRowId(requestId)) return;

	await db.orm.public.JoinGuardRequest.where({ id: BigInt(requestId) }).updateAndCount({ error });
}

/**
 * Records an account a guild banned for raiding or scamming on the shared ban list, once per case.
 * @param db The database to write through.
 * @param data The ban: who, where, the case and what banned them.
 */
export async function recordJoinGuardSharedBan(
	db: Database,
	data: { guildId: Snowflake; userId: Snowflake; caseId: number; source: JoinGuardSharedBanSource }
): Promise<void> {
	await db.orm.public.JoinGuardSharedBan.createAndCount(
		[{ guildId: BigInt(data.guildId), userId: BigInt(data.userId), caseId: data.caseId, source: data.source }],
		{ onConflict: 'skip' }
	);
}
