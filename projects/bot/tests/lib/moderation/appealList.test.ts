import {
	AppealsPerPage,
	decodeAppealListId,
	encodeAppealListId,
	renderAppealList,
	type AppealListFilter,
	type AppealListRow
} from '#lib/moderation/appealList';
import { ComponentType, type APIContainerComponent } from 'discord-api-types/v10';
import type { Appeal } from 'wolfstar-database';

const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

function createAppeal(overrides: Partial<Appeal> = {}): Appeal {
	return {
		id: '1',
		guildId: '254360814063058944',
		caseId: 12,
		userId: '266624760782258186',
		formId: null,
		answers: [],
		status: 'pending',
		reviewerId: null,
		reason: null,
		channelId: null,
		messageId: null,
		threadId: null,
		decidedAt: null,
		createdAt: Date.UTC(2026, 0, 1),
		...overrides
	};
}

function render(options: {
	rows?: readonly AppealListRow[];
	total?: number;
	page?: number;
	filter?: AppealListFilter;
	form?: string;
	forms?: { id: string; name: string }[];
}) {
	const { rows = [], total = rows.length, page = 0, filter = 'all', form = 'all', forms = [] } = options;
	const message = renderAppealList({ t, filter, form, forms, page, total, rows });
	const [container] = message.components as [APIContainerComponent];
	const rowsOf = container.components.filter((component) => component.type === ComponentType.ActionRow);

	return {
		text: container.components.flatMap((component) => (component.type === ComponentType.TextDisplay ? [component.content] : [])).join('\n'),
		select: rowsOf[0].components[0] as unknown as { custom_id: string; options: { value: string; default: boolean }[] },
		selects: rowsOf.filter((row) => row.components[0].type === ComponentType.StringSelect).map((row) => row.components[0]) as unknown as {
			custom_id: string;
			options: { value: string; default: boolean }[];
		}[],
		buttons: (rowsOf.find((row) => row.components[0].type === ComponentType.Button)?.components ?? []) as unknown as {
			custom_id: string;
			disabled: boolean;
		}[]
	};
}

describe('the list of the appeals', () => {
	test('GIVEN a page THEN each appeal says its case, what it is, who made it and where it stands', () => {
		const { text } = render({ rows: [{ appeal: createAppeal({ status: 'denied' }), type: 'Ban' }] });

		expect(text).toContain('"case":12');
		expect(text).toContain('"type":"Ban"');
		expect(text).toContain('<@266624760782258186>');
		expect(text).toContain('commands/appeal:statusDenied');
	});

	test('GIVEN an appeal whose case was deleted THEN it says so and stays in the list', () => {
		const { text } = render({ rows: [{ appeal: createAppeal(), type: null }] });

		expect(text).toContain('"type":"commands/appeal:caseGone"');
	});

	test('GIVEN no appeals THEN it says there are none and has no buttons', () => {
		const { text, buttons } = render({ rows: [] });

		expect(text).toContain('commands/appeal:listEmpty');
		expect(buttons).toEqual([]);
	});

	test('GIVEN a filter THEN the select menu has it selected, and only it', () => {
		const { select } = render({ filter: 'pending' });

		expect(select.options.filter((option) => option.default).map((option) => option.value)).toEqual(['pending']);
	});

	test('GIVEN a guild with no forms THEN there is no menu of forms', () => {
		expect(render({}).selects).toHaveLength(1);
	});

	test('GIVEN forms THEN their menu has the one shown selected', () => {
		const { selects } = render({
			form: '2',
			forms: [
				{ id: '1', name: 'Bans' },
				{ id: '2', name: 'Mutes' }
			]
		});

		expect(selects[1].options.map((option) => [option.value, option.default])).toEqual([
			['all', false],
			['1', false],
			['2', true]
		]);
	});

	test('GIVEN more forms than a menu holds THEN it stops at 25 entries', () => {
		const forms = Array.from({ length: 30 }, (_, index) => ({ id: String(index + 1), name: 'Form' }));

		expect(render({ forms }).selects[1].options).toHaveLength(25);
	});

	test('GIVEN one page THEN there are no buttons', () => {
		const rows = Array.from({ length: AppealsPerPage }, () => ({ appeal: createAppeal(), type: 'Ban' }));

		expect(render({ rows, total: AppealsPerPage }).buttons).toEqual([]);
	});

	test.each([
		{ page: 0, previous: true, next: false },
		{ page: 1, previous: false, next: false },
		{ page: 2, previous: false, next: true }
	])('GIVEN the page $page of three THEN it goes as far as there are pages', ({ page, previous, next }) => {
		const { buttons } = render({ total: AppealsPerPage * 3, page });

		expect(buttons.map((button) => button.disabled)).toEqual([previous, next]);
	});

	test.each([0, 1, 2])('GIVEN the page %i of three THEN no two components share a custom ID, which Discord refuses', (page) => {
		const { selects, buttons } = render({ total: AppealsPerPage * 3, page, forms: [{ id: '1', name: 'Bans' }] });
		const ids = [...selects.map((select) => select.custom_id), ...buttons.map((button) => button.custom_id)];

		expect(new Set(ids).size).toBe(ids.length);
	});

	test('GIVEN a click THEN its custom ID is read back', () => {
		const id = encodeAppealListId({ verb: 'page', filter: 'denied', form: '7', page: 3 });

		expect(id.startsWith('appealList.')).toBe(true);
		expect(decodeAppealListId(id.split('.').slice(1))).toEqual({ verb: 'page', filter: 'denied', form: '7', page: 3 });
	});

	test.each([
		[['everything', 'page:0:all']],
		[['pending', 'explode:0:all']],
		[['pending', 'page:-1:all']],
		[['pending', 'page:x:all']],
		[['pending', 'page:0']],
		[['pending', 'page:0:x']],
		[null]
	])('GIVEN the custom ID %j THEN it is not one of the list', (content) => {
		expect(decodeAppealListId(content)).toBeNull();
	});
});
