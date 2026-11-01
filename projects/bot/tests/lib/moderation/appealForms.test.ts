import { getAppealFormAccess, getBuiltInAppealForm, parseAppealAnswers } from '#lib/moderation/appealForms';
import { TypeVariation } from '#utils/moderationConstants';
import type { Appeal, AppealForm, AppealQuestion } from 'wolfstar-database';

const guildId = '254360814063058944';
const userId = '266624760782258186';
const day = 86_400_000;
const now = Date.UTC(2026, 10, 1);
const t = ((key: string) => key) as never;

function form(overrides: Partial<AppealForm> = {}): AppealForm {
	return {
		id: '1',
		guildId,
		name: 'Bans',
		description: null,
		icon: null,
		enabled: true,
		lockReason: null,
		types: [],
		requiredRoles: [],
		restrictedRoles: [],
		questions: [],
		position: 0,
		...overrides
	};
}

function caseOf(id: number, type: TypeVariation) {
	return { id, type, userId, isUndo: () => false, isArchived: () => false, isCompleted: () => false };
}

function appeal(overrides: Partial<Appeal> = {}): Appeal {
	return {
		id: '1',
		guildId,
		caseId: 99,
		userId,
		formId: null,
		answers: [],
		status: 'pending',
		reviewerId: null,
		reason: null,
		channelId: null,
		messageId: null,
		threadId: null,
		decidedAt: null,
		createdAt: now - day,
		...overrides
	};
}

const settings = { appealsCooldownDays: 7, appealsMaxActive: 1 };

function access(overrides: Partial<Parameters<typeof getAppealFormAccess>[0]> = {}) {
	return getAppealFormAccess({ form: form(), settings, roles: [], cases: [caseOf(1, TypeVariation.Ban)], appeals: [], now, ...overrides });
}

describe('getAppealFormAccess', () => {
	test('GIVEN nothing against it THEN the form is open with its cases', () => {
		expect(access()).toMatchObject({ open: true, cases: [{ id: 1 }] });
	});

	test('GIVEN a disabled form THEN it is locked', () => {
		expect(access({ form: form({ enabled: false }) })).toEqual({ open: false, lock: 'disabled' });
	});

	test('GIVEN a form for bans and only a mute THEN nothing can be appealed with it', () => {
		const result = access({ form: form({ types: [TypeVariation.Ban] }), cases: [caseOf(1, TypeVariation.Mute)] });

		expect(result).toEqual({ open: false, lock: 'noEligibleCase' });
	});

	test('GIVEN a form for bans THEN its cases are only the bans', () => {
		const cases = [caseOf(1, TypeVariation.Mute), caseOf(2, TypeVariation.Ban)];

		expect(access({ form: form({ types: [TypeVariation.Ban] }), cases })).toMatchObject({ open: true, cases: [{ id: 2 }] });
	});

	test('GIVEN a case that was appealed already THEN it is not offered again', () => {
		expect(access({ appeals: [appeal({ caseId: 1, status: 'accepted' })] })).toEqual({ open: false, lock: 'noEligibleCase' });
	});

	test('GIVEN a user who is not a member THEN a required role is not met and a restricted one is not held', () => {
		expect(access({ form: form({ requiredRoles: ['5'] }), roles: null })).toEqual({ open: false, lock: 'missingRole' });
		expect(access({ form: form({ restrictedRoles: ['5'] }), roles: null })).toMatchObject({ open: true });
	});

	test('GIVEN a member with a restricted role THEN it wins over a required one', () => {
		const result = access({ form: form({ requiredRoles: ['5'], restrictedRoles: ['6'] }), roles: ['5', '6'] });

		expect(result).toEqual({ open: false, lock: 'restrictedRole' });
	});

	test('GIVEN a denial three days ago and seven of cooldown THEN it ends four days from now', () => {
		const denied = appeal({ status: 'denied', decidedAt: now - 3 * day });

		expect(access({ appeals: [denied] })).toEqual({ open: false, lock: 'cooldown', until: now + 4 * day });
	});

	test('GIVEN no cooldown THEN a denial does not wait', () => {
		const denied = appeal({ status: 'denied', decidedAt: now - 3 * day });

		expect(access({ appeals: [denied], settings: { ...settings, appealsCooldownDays: 0 } })).toMatchObject({ open: true });
	});

	test('GIVEN as many pending appeals as allowed THEN no more can be sent', () => {
		expect(access({ appeals: [appeal()] })).toEqual({ open: false, lock: 'maxActive' });
		expect(access({ appeals: [appeal()], settings: { ...settings, appealsMaxActive: 2 } })).toMatchObject({ open: true });
	});
});

describe('getBuiltInAppealForm', () => {
	test('GIVEN a guild with no form THEN it asks one long question, with no ID of its own', () => {
		const built = getBuiltInAppealForm(t, guildId);

		expect(built.id).toBeNull();
		expect(built.questions).toMatchObject([{ kind: 'text', long: true, required: true, label: 'moderation:appealDefaultQuestion' }]);
	});
});

describe('parseAppealAnswers', () => {
	const owner = { guildId, userId };
	const key = (name: string, guild = guildId, user = userId) => `appeals/${guild}/${user}/${name}`;
	const uuid = '123e4567-e89b-42d3-a456-426614174000';
	const file = (overrides = {}) => ({ key: key(uuid), name: 'proof.png', size: 1000, contentType: 'image/png', ...overrides });

	const text: AppealQuestion = { id: 'why', kind: 'text', label: 'Why?', long: true, maxLength: 10, required: true };
	const optional: AppealQuestion = { ...text, id: 'more', required: false };
	const choice: AppealQuestion = {
		id: 'pick',
		kind: 'choice',
		label: 'Which?',
		options: [
			{ label: 'One', value: 'a' },
			{ label: 'Two', value: 'b' },
			{ label: 'Three', value: 'c' }
		],
		min: 1,
		max: 2,
		required: true
	};
	const attachment: AppealQuestion = { id: 'files', kind: 'attachment', label: 'Proof', min: 1, max: 2, imagesOnly: true };
	const display: AppealQuestion = { id: 'info', kind: 'display', content: 'Read this' };

	const parse = (questions: AppealQuestion[], raw: unknown) => parseAppealAnswers(form({ questions }), raw, owner);

	test('GIVEN a text THEN it is trimmed and keeps the label of its question', () => {
		expect(parse([text], { why: '  sorry ' })).toEqual([{ questionId: 'why', kind: 'text', label: 'Why?', value: 'sorry' }]);
	});

	test.each([[{}], [{ why: '' }], [{ why: '   ' }], [{ why: 'x'.repeat(11) }], [{ why: 3 }], [null], ['why'], [[]]])(
		'GIVEN %j for a required text THEN it is refused',
		(raw) => {
			expect(parse([text], raw)).toBeNull();
		}
	);

	test('GIVEN an optional text left blank THEN it has no answer', () => {
		expect(parse([text, optional], { why: 'sorry', more: ' ' })).toHaveLength(1);
	});

	test('GIVEN an answer to a question the form does not have THEN it is refused', () => {
		expect(parse([text], { why: 'sorry', gone: 'old' })).toBeNull();
	});

	test('GIVEN a display question THEN it takes no answer and needs none', () => {
		expect(parse([display, text], { why: 'sorry' })).toHaveLength(1);
		expect(parse([display, text], { why: 'sorry', info: 'nope' })).toBeNull();
	});

	test('GIVEN a choice THEN the labels picked are kept', () => {
		expect(parse([choice], { pick: ['a', 'c'] })).toEqual([{ questionId: 'pick', kind: 'choice', label: 'Which?', value: ['One', 'Three'] }]);
	});

	test.each([[{ pick: ['z'] }], [{ pick: [] }], [{ pick: ['a', 'b', 'c'] }], [{ pick: ['a', 'a'] }], [{ pick: 'a' }], [{}]])(
		'GIVEN %j for a choice THEN it is refused',
		(raw) => {
			expect(parse([choice], raw)).toBeNull();
		}
	);

	test('GIVEN a file of the user in the guild THEN it is kept', () => {
		expect(parse([attachment], { files: [file()] })).toEqual([{ questionId: 'files', kind: 'attachment', label: 'Proof', value: [file()] }]);
	});

	test.each([
		['of another user', file({ key: key(uuid, guildId, '1') })],
		['of another guild', file({ key: key(uuid, '1') })],
		['with a path of its own', file({ key: key(`../${uuid}`) })],
		['too big', file({ size: 8 * 1024 * 1024 + 1 })],
		['that is no image', file({ contentType: 'application/pdf' })],
		['with no name', file({ name: '' })]
	])('GIVEN a file %s THEN it is refused', (_, value) => {
		expect(parse([attachment], { files: [value] })).toBeNull();
	});

	test('GIVEN fewer or more files than the question asks THEN they are refused', () => {
		expect(parse([attachment], { files: [] })).toBeNull();
		expect(parse([attachment], { files: [file(), file(), file()] })).toBeNull();
	});

	test('GIVEN more than five files in all THEN they are refused', () => {
		const three = { ...attachment, max: 3 } as AppealQuestion;
		const files = [file(), file(), file()];

		expect(parse([three, { ...three, id: 'more' } as AppealQuestion], { files, more: files })).toBeNull();
	});
});
