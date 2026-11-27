import type { Snowflake } from 'discord-api-types/v10';
import type { Database, Models } from '../../index.js';
import { isRowId } from '../ids.js';
import type { DatabaseTransaction } from '../storage.js';
import { formatTimestamp, parseTimestamp } from '../time.js';
import type {
	OnboardingConfig,
	OnboardingCounts,
	OnboardingSettings,
	OnboardingStage,
	OnboardingStageInput,
	OnboardingVerification,
	OnboardingVerificationStatus
} from './types.js';
import { moveOnboardingStage, sortOnboardingStages, validateOnboardingStage, type OnboardingStageProblem } from './validation.js';

type Orm = Pick<Database['orm'], 'public'>;
type SettingsRow = Omit<Models.public_GuildOnboarding, 'modules'>;
type StageRow = Omit<Models.public_GuildOnboardingStage, 'guild'>;
type VerificationRow = Omit<Models.public_OnboardingVerification, 'guild' | 'stage'>;
type Timestamp = VerificationRow['createdAt'];

function toTimestamp(milliseconds: number) {
	return formatTimestamp(milliseconds) as Timestamp;
}

function toSnowflake(value: bigint | null) {
	return value === null ? null : String(value);
}

function toBigInt(value: Snowflake | null) {
	return value === null ? null : BigInt(value);
}

function toSettings(row: SettingsRow | null): OnboardingSettings {
	return {
		enabled: row?.enabled ?? false,
		logChannelId: row === null ? null : toSnowflake(row.logChannelId),
		channelId: row === null ? null : toSnowflake(row.channelId),
		messageId: row === null ? null : toSnowflake(row.messageId),
		revision: row?.revision ?? 0
	};
}

function toStage(row: StageRow): OnboardingStage {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		position: row.position,
		name: row.name,
		enabled: row.enabled,
		trigger: row.trigger,
		challenge: row.challenge,
		question: row.question,
		answers: [...row.answers],
		maxAttempts: row.maxAttempts,
		timeLimit: row.timeLimit,
		roleId: toSnowflake(row.roleId),
		failureAction: row.failureAction,
		failureTimeout: row.failureTimeout,
		createdAt: parseTimestamp(row.createdAt)
	};
}

function toVerification(row: VerificationRow): OnboardingVerification {
	return {
		id: String(row.id),
		guildId: String(row.guildId),
		userId: String(row.userId),
		stageId: toSnowflake(row.stageId),
		stageName: row.stageName,
		status: row.status,
		attempts: row.attempts,
		createdAt: parseTimestamp(row.createdAt),
		resolvedAt: row.resolvedAt === null ? null : parseTimestamp(row.resolvedAt)
	};
}

function toStageColumns(input: OnboardingStageInput) {
	return {
		name: input.name,
		enabled: input.enabled,
		trigger: input.trigger,
		challenge: input.challenge,
		question: input.question,
		answers: [...input.answers],
		maxAttempts: input.maxAttempts,
		timeLimit: input.timeLimit,
		roleId: toBigInt(input.roleId),
		failureAction: input.failureAction,
		failureTimeout: input.failureTimeout
	};
}

/**
 * Reads the row of a guild's onboarding.
 * @returns The settings, the defaults at revision `0` when the guild has no row.
 */
export async function fetchOnboardingSettings(orm: Orm, guildId: Snowflake): Promise<OnboardingSettings> {
	return toSettings(await orm.public.GuildOnboarding.first({ id: BigInt(guildId) }));
}

/**
 * Reads the stages of a guild, in the order they run.
 */
export async function fetchOnboardingStages(orm: Orm, guildId: Snowflake): Promise<OnboardingStage[]> {
	const rows = await orm.public.GuildOnboardingStage.where({ guildId: BigInt(guildId) })
		.orderBy([(stage) => stage.position.asc(), (stage) => stage.id.asc()])
		.all();
	return sortOnboardingStages(rows.map((row) => toStage(row)));
}

/**
 * Reads a guild's onboarding for an editor.
 *
 * @remarks The revision is read before the stages, one after the other: a write that lands in between makes the
 * editor's revision stale, so its next write is refused. Read in the other order, stale stages would go with a newer
 * revision and a write would overwrite what the editor never saw.
 */
export async function fetchOnboardingConfig(orm: Orm, guildId: Snowflake): Promise<OnboardingConfig> {
	const settings = await fetchOnboardingSettings(orm, guildId);
	const stages = await fetchOnboardingStages(orm, guildId);
	return { settings, stages };
}

/**
 * Why a write of the onboarding was refused:
 * - `Conflict`: someone wrote first since the editor read the revision; nothing was written.
 * - `Invalid`: the stage breaks a rule of `validateOnboardingStage`.
 * - `UnknownStage`: the stage is not one of the guild anymore.
 */
export type OnboardingWriteError =
	| { readonly code: 'Conflict' }
	| { readonly code: 'Invalid'; readonly problems: readonly OnboardingStageProblem[] }
	| { readonly code: 'UnknownStage' };

export type OnboardingWriteResult<Value> =
	| { readonly ok: true; readonly value: Value; readonly revision: number }
	| { readonly ok: false; readonly error: OnboardingWriteError };

/**
 * What a write does once the revision is taken, in its transaction: it reads the stages of the guild as they are then.
 * It refuses with {@linkcode refuseOnboardingWrite}, which undoes the transaction.
 */
export type OnboardingWrite<Value> = (tx: DatabaseTransaction, stages: readonly OnboardingStage[], guildId: bigint) => Promise<Value>;

class OnboardingWriteRefusal extends Error {
	public constructor(public readonly refusal: Exclude<OnboardingWriteError, { code: 'Conflict' }>) {
		super(`The write of the onboarding was refused: ${refusal.code}`);
	}
}

/**
 * Refuses a write from inside it: the transaction is undone, the revision with it.
 */
export function refuseOnboardingWrite(refusal: Exclude<OnboardingWriteError, { code: 'Conflict' }>): never {
	throw new OnboardingWriteRefusal(refusal);
}

/**
 * Writes a guild's onboarding, only when nobody wrote it since the editor read `revision`.
 *
 * @remarks The guard runs first, in the transaction of the write: `UPDATE "GuildOnboarding" SET revision = revision + 1
 * WHERE id = $guild AND revision = $read`. A row changed by no one means someone else wrote first. The row is created
 * at revision `0` when the guild has none, so the first editor reads `0` and passes. The website writes the same way.
 *
 * @param db The database to write through.
 * @param guildId The guild's ID.
 * @param revision The revision the editor read when it opened.
 * @param write What it writes.
 * @param language The language a `Guild` row is created with, when the guild has none yet.
 * @returns What the write returned with the new revision, or why it was refused.
 */
export async function writeOnboarding<Value>(
	db: Database,
	guildId: Snowflake,
	revision: number,
	write: OnboardingWrite<Value>,
	language = 'en-US'
): Promise<OnboardingWriteResult<Value>> {
	const id = BigInt(guildId);
	try {
		return await db.transaction(async (tx): Promise<OnboardingWriteResult<Value>> => {
			await tx.orm.public.Guild.upsert({ create: { id, language }, update: { id } });
			await tx.orm.public.Modules.upsert({ create: { id }, update: { id } });
			await tx.orm.public.GuildOnboarding.upsert({ create: { id }, update: { id } });

			const taken = await tx.orm.public.GuildOnboarding.where({ id, revision }).updateAndCount({ revision: revision + 1 });
			if (taken === 0) return { ok: false, error: { code: 'Conflict' } };

			const stages = await fetchOnboardingStages(tx.orm, guildId);
			const value = await write(tx, stages, id);
			return { ok: true, value, revision: revision + 1 };
		});
	} catch (error) {
		if (error instanceof OnboardingWriteRefusal) return { ok: false, error: error.refusal };
		throw error;
	}
}

/**
 * Creates a stage at the end of the order.
 * @param input The stage, normalized.
 * @param captchaAvailable Whether the website serves the `Captcha` challenge yet.
 */
export function createOnboardingStage(input: OnboardingStageInput, captchaAvailable: boolean): OnboardingWrite<OnboardingStage> {
	return async (tx, stages, guildId) => {
		const problems = validateOnboardingStage(input, { others: stages, creating: true, previousChallenge: null, captchaAvailable });
		if (problems.length > 0) refuseOnboardingWrite({ code: 'Invalid', problems });

		const row = await tx.orm.public.GuildOnboardingStage.create({ guildId, position: stages.length, ...toStageColumns(input) });
		return toStage(row);
	};
}

/**
 * Replaces what a stage is set to.
 * @param stageId The stage.
 * @param input The stage, normalized.
 * @param captchaAvailable Whether the website serves the `Captcha` challenge yet: a stage that has it keeps it anyway.
 */
export function updateOnboardingStage(stageId: string, input: OnboardingStageInput, captchaAvailable: boolean): OnboardingWrite<OnboardingStage> {
	return async (tx, stages, guildId) => {
		const stage = findStage(stages, stageId);
		const others = stages.filter((entry) => entry.id !== stage.id);
		const problems = validateOnboardingStage(input, { others, creating: false, previousChallenge: stage.challenge, captchaAvailable });
		if (problems.length > 0) refuseOnboardingWrite({ code: 'Invalid', problems });

		await tx.orm.public.GuildOnboardingStage.where({ id: BigInt(stage.id), guildId }).updateAndCount(toStageColumns(input));
		return { ...stage, ...input };
	};
}

/**
 * Switches a stage on or off. Nothing else is checked, so a stage that broke a rule since can still be switched off.
 */
export function setOnboardingStageEnabled(stageId: string, enabled: boolean): OnboardingWrite<OnboardingStage> {
	return async (tx, stages, guildId) => {
		const stage = findStage(stages, stageId);
		await tx.orm.public.GuildOnboardingStage.where({ id: BigInt(stage.id), guildId }).updateAndCount({ enabled });
		return { ...stage, enabled };
	};
}

/**
 * Deletes a stage and numbers the others again. The rows of the members keep its name.
 */
export function deleteOnboardingStage(stageId: string): OnboardingWrite<OnboardingStage> {
	return async (tx, stages, guildId) => {
		const stage = findStage(stages, stageId);
		await tx.orm.public.GuildOnboardingStage.where({ id: BigInt(stage.id), guildId }).deleteAndCount();
		await writePositions(
			tx,
			guildId,
			stages.filter((entry) => entry.id !== stage.id).map((entry) => entry.id)
		);
		return stage;
	};
}

/**
 * Moves a stage up (a negative offset) or down the order, and numbers every stage again.
 */
export function moveOnboardingStageBy(stageId: string, offset: number): OnboardingWrite<readonly string[]> {
	return async (tx, stages, guildId) => {
		const order = moveOnboardingStage(stages, stageId, offset);
		if (order === null) refuseOnboardingWrite({ code: 'UnknownStage' });

		await writePositions(tx, guildId, order);
		return order;
	};
}

/**
 * Sets the channel every pass, failure and action is logged in. The caller checks the bot's permissions there first.
 */
export function setOnboardingLogChannel(channelId: Snowflake | null): OnboardingWrite<Snowflake | null> {
	return async (tx, _stages, guildId) => {
		await tx.orm.public.GuildOnboarding.where({ id: guildId }).updateAndCount({ logChannelId: toBigInt(channelId) });
		return channelId;
	};
}

/**
 * Remembers where the bot posted the verification message, which only the bot writes.
 */
export function setOnboardingMessage(channelId: Snowflake | null, messageId: Snowflake | null): OnboardingWrite<void> {
	return async (tx, _stages, guildId) => {
		await tx.orm.public.GuildOnboarding.where({ id: guildId }).updateAndCount({ channelId: toBigInt(channelId), messageId: toBigInt(messageId) });
	};
}

function findStage(stages: readonly OnboardingStage[], stageId: string): OnboardingStage {
	const stage = stages.find((entry) => entry.id === stageId);
	return stage ?? refuseOnboardingWrite({ code: 'UnknownStage' });
}

async function writePositions(tx: DatabaseTransaction, guildId: bigint, order: readonly string[]) {
	for (const [position, id] of order.entries()) {
		await tx.orm.public.GuildOnboardingStage.where({ id: BigInt(id), guildId }).updateAndCount({ position });
	}
}

/**
 * Reads the rows of a member of a guild, oldest first.
 */
export async function fetchOnboardingVerifications(orm: Orm, guildId: Snowflake, userId: Snowflake): Promise<OnboardingVerification[]> {
	const rows = await orm.public.OnboardingVerification.where({ guildId: BigInt(guildId), userId: BigInt(userId) })
		.orderBy((row) => row.id.asc())
		.all();
	return rows.map((row) => toVerification(row));
}

/**
 * Reads the rows of a guild whose members wait on a stage now, oldest first: their time limits follow the stages when
 * those are written.
 */
export async function fetchWaitingOnboardingVerifications(orm: Orm, guildId: Snowflake): Promise<OnboardingVerification[]> {
	const rows = await orm.public.OnboardingVerification.where({ guildId: BigInt(guildId), status: 'Waiting' })
		.orderBy((row) => row.id.asc())
		.all();
	return rows.map((row) => toVerification(row));
}

/**
 * Reads a row by its ID, whatever its guild: the job of a time limit only knows that.
 */
export async function fetchOnboardingVerification(orm: Orm, verificationId: string): Promise<OnboardingVerification | null> {
	if (!isRowId(verificationId)) return null;

	const row = await orm.public.OnboardingVerification.first({ id: BigInt(verificationId) });
	return row === null ? null : toVerification(row);
}

/**
 * Starts a stage for a member. A row of the member that still waits is of a stage the bot did not see end: it is
 * marked as left first, so a member waits on one stage at most.
 */
export async function createOnboardingVerification(
	db: Database,
	data: { readonly guildId: Snowflake; readonly userId: Snowflake; readonly stage: Pick<OnboardingStage, 'id' | 'name'> },
	language = 'en-US'
): Promise<OnboardingVerification> {
	const guildId = BigInt(data.guildId);
	const userId = BigInt(data.userId);
	return db.transaction(async (tx) => {
		await tx.orm.public.Guild.upsert({ create: { id: guildId, language }, update: { id: guildId } });
		await tx.orm.public.OnboardingVerification.where({ guildId, userId, status: 'Waiting' }).updateAndCount({
			status: 'Left',
			resolvedAt: toTimestamp(Date.now())
		});

		const row = await tx.orm.public.OnboardingVerification.create({
			guildId,
			userId,
			stageId: BigInt(data.stage.id),
			stageName: data.stage.name,
			status: 'Waiting'
		});
		return toVerification(row);
	});
}

/**
 * Counts a wrong answer, only while the member waits and nobody counted the same one: two clicks at once count once.
 * @param attempts The wrong answers the row had when it was read.
 * @returns Whether it was counted.
 */
export async function recordOnboardingAttempt(db: Database, verificationId: string, attempts: number): Promise<boolean> {
	if (!isRowId(verificationId)) return false;

	const count = await db.orm.public.OnboardingVerification.where({ id: BigInt(verificationId), status: 'Waiting', attempts }).updateAndCount({
		attempts: attempts + 1
	});
	return count > 0;
}

/**
 * Resolves a row, only while the member waits: a click, the time limit and a leave at once resolve it once.
 * @returns Whether the member was still waiting.
 */
export async function resolveOnboardingVerification(
	db: Database,
	verificationId: string,
	status: Exclude<OnboardingVerificationStatus, 'Waiting'>
): Promise<boolean> {
	if (!isRowId(verificationId)) return false;

	const count = await db.orm.public.OnboardingVerification.where({ id: BigInt(verificationId), status: 'Waiting' }).updateAndCount({
		status,
		resolvedAt: toTimestamp(Date.now())
	});
	return count > 0;
}

/**
 * Marks as left every row a member who left a guild still waited on.
 * @returns How many there were.
 */
export function leaveOnboardingMember(db: Database, guildId: Snowflake, userId: Snowflake): Promise<number> {
	return db.orm.public.OnboardingVerification.where({ guildId: BigInt(guildId), userId: BigInt(userId), status: 'Waiting' }).updateAndCount({
		status: 'Left',
		resolvedAt: toTimestamp(Date.now())
	});
}

/**
 * Counts the members who passed and failed a stage since a moment, by when they did (a stage may have no time limit,
 * so when it started says nothing), and the members who wait now.
 */
export async function countOnboardingVerifications(orm: Orm, guildId: Snowflake, since: number): Promise<OnboardingCounts> {
	const id = BigInt(guildId);
	const rows = orm.public.OnboardingVerification;
	const resolvedSince = (status: 'Passed' | 'Failed') =>
		rows
			.where({ guildId: id, status })
			.where((row) => row.resolvedAt.gte(toTimestamp(since)))
			.aggregate((aggregate) => ({ total: aggregate.count() }));

	const [passed, failed, waiting] = await Promise.all([
		resolvedSince('Passed'),
		resolvedSince('Failed'),
		rows.where({ guildId: id, status: 'Waiting' }).aggregate((aggregate) => ({ total: aggregate.count() }))
	]);
	return { passed: passed.total, failed: failed.total, waiting: waiting.total };
}
