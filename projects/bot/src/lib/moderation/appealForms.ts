import type { AppealableCase } from '#lib/moderation/appeals';
import { days } from 'wolfstar-shared';
import type { AnyNamespace, TFunction } from '@wolfstar/plugin-i18next';
import type { Snowflake } from 'discord-api-types/v10';
import {
	MaximumAppealAnswerLength,
	MaximumAppealFiles,
	MaximumAppealFileSize,
	type Appeal,
	type AppealAnswer,
	type AppealFile,
	type AppealForm,
	type AppealQuestion,
	type ReadonlyGuildData
} from 'wolfstar-database';

/**
 * Why a form cannot be used by a user.
 */
export type AppealFormLock = 'disabled' | 'missingRole' | 'restrictedRole' | 'noEligibleCase' | 'cooldown' | 'maxActive';

/**
 * The ID of the only question of the built-in form.
 */
const BuiltInQuestionId = 'statement';

/**
 * The form of a guild that has no enabled one, the question it always asked, so a guild that only turned the appeals on
 * keeps working. An appeal sent with it has no form.
 */
export function getBuiltInAppealForm(t: TFunction<AnyNamespace>, guildId: Snowflake): AppealForm {
	return {
		id: null,
		guildId,
		name: t('moderation:appealDefaultForm'),
		description: null,
		icon: null,
		enabled: true,
		lockReason: null,
		types: [],
		requiredRoles: [],
		restrictedRoles: [],
		questions: [
			{
				id: BuiltInQuestionId,
				kind: 'text',
				label: t('moderation:appealDefaultQuestion'),
				long: true,
				maxLength: MaximumAppealAnswerLength,
				required: true
			}
		],
		position: 0
	};
}

export interface AppealFormAccessInput<Case extends AppealableCase> {
	form: AppealForm;
	settings: Pick<ReadonlyGuildData, 'appealsCooldownDays' | 'appealsMaxActive'>;
	/**
	 * The roles of the member, `null` for a user who is not one: a banned one is not.
	 */
	roles: readonly Snowflake[] | null;
	/**
	 * The cases of the user the guild takes appeals for, see `findAppealableCases`.
	 */
	cases: readonly Case[];
	/**
	 * The appeals of the user in the guild.
	 */
	appeals: readonly Appeal[];
	/**
	 * The time, in milliseconds.
	 */
	now: number;
}

export type AppealFormAccess<Case extends AppealableCase> =
	| { open: true; cases: Case[] }
	| { open: false; lock: Exclude<AppealFormLock, 'cooldown'> }
	| { open: false; lock: 'cooldown'; until: number };

/**
 * Whether a user can send a form now, and with which cases. The page shows what this answers and the submission runs it
 * again, so the page can never let through what the submission refuses.
 */
export function getAppealFormAccess<Case extends AppealableCase>(input: AppealFormAccessInput<Case>): AppealFormAccess<Case> {
	const { form, settings, roles, appeals } = input;
	if (!form.enabled) return { open: false, lock: 'disabled' };

	if (roles !== null && form.restrictedRoles.some((role) => roles.includes(role))) return { open: false, lock: 'restrictedRole' };
	if (form.requiredRoles.length > 0 && !form.requiredRoles.some((role) => roles?.includes(role))) return { open: false, lock: 'missingRole' };

	const appealed = new Set(appeals.map((appeal) => appeal.caseId));
	const cases = input.cases.filter((entry) => !appealed.has(entry.id) && (form.types.length === 0 || form.types.includes(entry.type)));
	if (cases.length === 0) return { open: false, lock: 'noEligibleCase' };

	const denied = Math.max(0, ...appeals.filter((appeal) => appeal.status === 'denied').map((appeal) => appeal.decidedAt ?? appeal.createdAt));
	const until = denied + days(settings.appealsCooldownDays);
	if (denied > 0 && settings.appealsCooldownDays > 0 && input.now < until) return { open: false, lock: 'cooldown', until };

	const pending = appeals.filter((appeal) => appeal.status === 'pending').length;
	if (pending >= settings.appealsMaxActive) return { open: false, lock: 'maxActive' };

	return { open: true, cases };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFile(value: unknown, keyPrefix: string, imagesOnly: boolean): AppealFile | null {
	if (!isObject(value)) return null;

	const { key, name, size, contentType } = value;
	if (typeof key !== 'string' || !key.startsWith(keyPrefix) || !/^[\da-f-]{36}$/i.test(key.slice(keyPrefix.length))) return null;
	if (typeof name !== 'string' || name === '' || name.length > 255) return null;
	if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || size > MaximumAppealFileSize) return null;
	if (typeof contentType !== 'string' || (imagesOnly && !contentType.startsWith('image/'))) return null;

	return { key, name, size, contentType };
}

/**
 * Reads the answer to a question.
 *
 * @returns The answer, `undefined` for a question left unanswered that can be, `null` when it is not valid.
 */
function parseAnswer(question: Exclude<AppealQuestion, { kind: 'display' }>, raw: unknown, keyPrefix: string): AppealAnswer | undefined | null {
	const { id: questionId, label } = question;
	switch (question.kind) {
		case 'text': {
			if (raw !== undefined && typeof raw !== 'string') return null;

			const value = raw?.trim() ?? '';
			if (value === '') return question.required ? null : undefined;
			return value.length > Math.min(question.maxLength, MaximumAppealAnswerLength) ? null : { questionId, kind: 'text', label, value };
		}
		case 'choice': {
			if (raw !== undefined && !Array.isArray(raw)) return null;

			const picked = (raw ?? []) as unknown[];
			if (picked.length === 0 && !question.required) return undefined;
			if (new Set(picked).size !== picked.length || picked.length < question.min || picked.length > question.max) return null;

			const options = picked.map((value) => question.options.find((option) => option.value === value));
			if (options.length === 0 || options.includes(undefined)) return null;
			return { questionId, kind: 'choice', label, value: options.map((option) => option!.label) };
		}
		case 'attachment': {
			if (raw !== undefined && !Array.isArray(raw)) return null;

			const items = (raw ?? []) as unknown[];
			if (items.length < question.min || items.length > question.max) return null;
			if (items.length === 0) return undefined;

			const files = items.map((item) => parseFile(item, keyPrefix, question.imagesOnly));
			return files.includes(null) ? null : { questionId, kind: 'attachment', label, value: files as AppealFile[] };
		}
	}
}

/**
 * Checks what a user sent for a form, keyed by the ID of each question. It is not trusted: an answer to a question the
 * form no longer has is refused, and so is a file the user did not upload for this guild.
 *
 * @returns The answers, `null` when they are not valid.
 */
export function parseAppealAnswers(form: AppealForm, raw: unknown, owner: { guildId: Snowflake; userId: Snowflake }): AppealAnswer[] | null {
	if (!isObject(raw)) return null;

	const questions = form.questions.filter((question) => question.kind !== 'display');
	if (Object.keys(raw).some((id) => !questions.some((question) => question.id === id))) return null;

	const keyPrefix = `appeals/${owner.guildId}/${owner.userId}/`;
	const answers: AppealAnswer[] = [];
	for (const question of questions) {
		const answer = parseAnswer(question, raw[question.id], keyPrefix);
		if (answer === null) return null;
		if (answer !== undefined) answers.push(answer);
	}

	const files = answers.reduce((total, answer) => total + (answer.kind === 'attachment' ? answer.value.length : 0), 0);
	return files > MaximumAppealFiles ? null : answers;
}
