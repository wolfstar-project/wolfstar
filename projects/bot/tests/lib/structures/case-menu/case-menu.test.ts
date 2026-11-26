import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import type { ModerationRecord } from '#lib/moderation/managers/ModerationRecord';
import {
	CasesPerPage,
	decodeCaseListTarget,
	decodeCaseMenuCaseId,
	decodeCaseMenuId,
	encodeCaseListTarget,
	encodeCaseMenuId,
	filterCaseEntries,
	CaseHistoryEntries,
	CaseInputIds,
	renderCaseCloseModal,
	renderCaseDeletePrompt,
	renderCaseEditModal,
	renderCaseHistory,
	renderCaseList,
	renderCaseView,
	type CaseListContext
} from '#lib/structures/case-menu';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { guild } from '#mocks/MockInstances';
import { ComponentType, MessageFlags } from 'discord-api-types/v10';

const ownerId = '266624760782258186';
const userId = '266624760782258187';

// Echoes the key and its options, the translations are not what is tested here:
const t = ((key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key)) as never;

const record: ModerationRecord = {
	id: 1,
	createdAt: 1_700_000_000_000,
	duration: null,
	guildId: guild.id,
	moderatorId: ownerId,
	userId,
	reason: null,
	type: TypeVariation.Warning,
	metadata: TypeMetadata.None
};

function createEntry(overrides: Partial<ModerationRecord> = {}) {
	return ModerationManagerEntry.from(guild, { ...record, ...overrides });
}

function createContext(overrides: Partial<CaseListContext> = {}): CaseListContext {
	return { t, ownerId, ephemeral: true, ...overrides };
}

interface AnyComponent {
	type: ComponentType;
	content?: string;
	custom_id?: string;
	disabled?: boolean;
	options?: { value: string; default?: boolean }[];
	accessory?: AnyComponent;
	components?: AnyComponent[];
}

function flatten(components: readonly unknown[]): AnyComponent[] {
	return (components as AnyComponent[]).flatMap((component) => [
		component,
		...flatten(component.components ?? []),
		...flatten(component.accessory ? [component.accessory] : [])
	]);
}

function getText(components: readonly unknown[]) {
	return flatten(components)
		.filter((component) => component.type === ComponentType.TextDisplay)
		.map((component) => component.content)
		.join('\n');
}

function getButtons(components: readonly unknown[]) {
	return flatten(components)
		.filter((component) => component.type === ComponentType.Button)
		.map((component) => Object.assign(decodeCaseMenuId(component.custom_id!.split('.').slice(1))!, { disabled: component.disabled === true }));
}

describe('case menu', () => {
	describe('custom IDs', () => {
		test('GIVEN an action THEN it survives the round trip the framework parser does', () => {
			const action = { ownerId, verb: 'list', target: encodeCaseListTarget({ filter: TypeVariation.Mute, userId }), page: 3 } as const;
			const id = encodeCaseMenuId(action);

			expect(id).toBe(`caseMenu.${ownerId}.list:${TypeVariation.Mute}/${userId}:3`);
			expect(decodeCaseMenuId(id.split('.').slice(1))).toEqual(action);
		});

		test('GIVEN something else THEN it decodes to null', () => {
			expect(decodeCaseMenuId(null)).toBeNull();
			expect(decodeCaseMenuId([ownerId, 'explode:1:0'])).toBeNull();
			expect(decodeCaseMenuId([ownerId, 'view:1:-1'])).toBeNull();
			expect(decodeCaseMenuId([ownerId, 'view:1'])).toBeNull();
		});

		test('GIVEN the target of a list THEN its filter and its user are read back', () => {
			expect(decodeCaseListTarget(encodeCaseListTarget({ filter: 'all', userId: null }))).toEqual({ filter: 'all', userId: null });
			expect(decodeCaseListTarget(encodeCaseListTarget({ filter: 'pending', userId }))).toEqual({ filter: 'pending', userId });
			expect(decodeCaseListTarget(`${TypeVariation.Ban}/-`)).toEqual({ filter: TypeVariation.Ban, userId: null });
		});

		test('GIVEN a target that is not one of a list THEN it decodes to null', () => {
			expect(decodeCaseListTarget('all')).toBeNull();
			expect(decodeCaseListTarget('99/-')).toBeNull();
			expect(decodeCaseListTarget('all/somebody')).toBeNull();
			expect(decodeCaseListTarget('all/-/more')).toBeNull();
		});

		test('GIVEN the target of a case THEN only a positive ID is read', () => {
			expect(decodeCaseMenuCaseId('12')).toBe(12);
			expect(decodeCaseMenuCaseId('0')).toBeNull();
			expect(decodeCaseMenuCaseId('all/-')).toBeNull();
		});
	});

	describe('filters', () => {
		const entries = [
			createEntry({ id: 1 }),
			createEntry({ id: 2, type: TypeVariation.Mute, duration: 60_000, createdAt: Date.now(), metadata: TypeMetadata.Temporary }),
			createEntry({
				id: 3,
				type: TypeVariation.Mute,
				duration: 60_000,
				createdAt: Date.now(),
				metadata: TypeMetadata.Temporary | TypeMetadata.Completed
			}),
			createEntry({ id: 4, type: TypeVariation.Ban })
		];

		test('GIVEN every case THEN the newest is first', () => {
			expect(filterCaseEntries(entries, 'all').map((entry) => entry.id)).toEqual([4, 3, 2, 1]);
		});

		test('GIVEN a type THEN only its cases are shown', () => {
			expect(filterCaseEntries(entries, TypeVariation.Mute).map((entry) => entry.id)).toEqual([3, 2]);
		});

		test('GIVEN the temporary cases in course THEN a completed one is left out', () => {
			expect(filterCaseEntries(entries, 'pending').map((entry) => entry.id)).toEqual([2]);
		});
	});

	describe('list', () => {
		const entries = Array.from({ length: 12 }, (_, index) => createEntry({ id: index + 1 }));

		test('GIVEN the cases THEN a page shows the newest ones with a button that opens each', () => {
			const message = renderCaseList(createContext(), { filter: 'all', userId: null, page: 0 }, entries);
			const text = getText(message.components!);
			const views = getButtons(message.components!).filter((button) => button.verb === 'view');

			expect(message.flags).toBe(MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral);
			expect(text).toContain(`**#12** <@${userId}>`);
			expect(text).not.toContain(`**#${12 - CasesPerPage}** `);
			expect(views.map((button) => button.target)).toEqual(['12', '11', '10', '9', '8']);
			expect(text).toContain('"page":1,"pages":3,"count":12');
		});

		test('GIVEN a list everybody sees THEN it is not ephemeral', () => {
			const message = renderCaseList(createContext({ ephemeral: false }), { filter: 'all', userId: null, page: 0 }, entries);

			expect(message.flags).toBe(MessageFlags.IsComponentsV2);
		});

		test('GIVEN a page out of range THEN the last one is rendered', () => {
			const text = getText(renderCaseList(createContext(), { filter: 'all', userId: null, page: 99 }, entries).components!);

			expect(text).toContain('"page":3,"pages":3');
			expect(text).toContain('**#1** ');
		});

		test('GIVEN any page THEN no two components share a custom ID', () => {
			for (const page of [0, 1, 2]) {
				const message = renderCaseList(createContext(), { filter: 'all', userId, page }, entries);
				const ids = flatten(message.components!)
					.map((component) => component.custom_id)
					.filter((id) => id !== undefined);

				expect(new Set(ids).size).toBe(ids.length);
			}
		});

		test('GIVEN the middle of the list THEN it goes to the first, previous, next and last page with what the list shows', () => {
			const message = renderCaseList(createContext(), { filter: TypeVariation.Warning, userId, page: 1 }, entries);
			const pages = getButtons(message.components!).filter((button) => button.verb === 'list');
			const target = encodeCaseListTarget({ filter: TypeVariation.Warning, userId });

			// The first one reads the same page again:
			expect(pages.map((button) => [button.target, button.page, button.disabled])).toEqual([
				[target, 1, false],
				[target, 0, false],
				[target, 0, false],
				[target, 2, false],
				[target, 2, false]
			]);
		});

		test('GIVEN a filter THEN its option is the selected one', () => {
			const message = renderCaseList(createContext(), { filter: 'pending', userId: null, page: 0 }, entries);
			const select = flatten(message.components!).find((component) => component.type === ComponentType.StringSelect)!;

			expect(select.options!.filter((option) => option.default).map((option) => option.value)).toEqual(['pending']);
		});

		test('GIVEN no case THEN the list says so and has no pages', () => {
			const message = renderCaseList(createContext(), { filter: 'all', userId: null, page: 0 }, []);

			expect(getText(message.components!)).toContain('commands/case:listEmpty');
			expect(getButtons(message.components!).map((button) => button.verb)).toEqual(['list']);
		});
	});

	describe('case', () => {
		test('shows saved roles for a departed member', () => {
			const entry = ModerationManagerEntry.from(
				guild,
				{ ...record, type: TypeVariation.Ban },
				{ extraData: ['266624760782258188'], message: null }
			);
			expect(getText(renderCaseView(createContext(), entry).components!)).toContain('<@&266624760782258188>');
		});
		test('GIVEN a case THEN it shows who it is about and the buttons that act on it', () => {
			const message = renderCaseView(createContext(), createEntry({ id: 7, reason: 'Spam' }));
			const text = getText(message.components!);

			expect(text).toContain(`"mention":"<@${userId}>","userId":"${userId}"`);
			expect(text).toContain('commands/case:statusOpen');
			expect(text).toContain('> Spam');
			expect(getButtons(message.components!).map((button) => [button.verb, button.target, button.disabled])).toEqual([
				['edit', '7', false],
				['close', '7', false],
				['history', '7', false],
				['delete', '7', false]
			]);
		});

		test('GIVEN a case with no reason THEN it says none was given', () => {
			expect(getText(renderCaseView(createContext(), createEntry()).components!)).toContain('> commands/case:viewReasonNone');
		});

		test('GIVEN a closed case THEN it cannot be closed again', () => {
			const message = renderCaseView(createContext(), createEntry({ metadata: TypeMetadata.Archived }));
			const close = getButtons(message.components!).find((button) => button.verb === 'close')!;

			expect(getText(message.components!)).toContain('commands/case:statusClosed');
			expect(close.disabled).toBe(true);
		});

		test('GIVEN the question before a case is deleted THEN it confirms or goes back to the case', () => {
			const message = renderCaseDeletePrompt(createContext(), 7);

			expect(getButtons(message.components!).map((button) => [button.verb, button.target])).toEqual([
				['deleteConfirm', '7'],
				['deleteCancel', '7']
			]);
		});
	});

	describe('details', () => {
		const details = {
			staffNote: 'Second time this week',
			proof: { channelId: '1', messageId: '2' },
			proofFile: { url: 'https://cdn.discordapp.com/a.png', contentType: 'image/png' }
		};

		test('GIVEN what the moderators added THEN the case shows their note and the proof with its file', () => {
			const message = renderCaseView(createContext(), createEntry(), details);
			const gallery = flatten(message.components!).find((component) => component.type === ComponentType.MediaGallery) as unknown as {
				items: { media: { url: string } }[];
			};

			expect(getText(message.components!)).toContain('> Second time this week');
			// A `>>> ` quotes the rest of the message, which would quote the note under the reason and show the second one as text:
			expect(getText(message.components!)).not.toContain('>>>');
			expect(getText(message.components!)).toContain(`https://discord.com/channels/${guild.id}/1/2`);
			expect(gallery.items[0].media.url).toBe(details.proofFile.url);
		});

		test('GIVEN a case with nothing added THEN it shows neither', () => {
			const message = renderCaseView(createContext(), createEntry(), { staffNote: null, proof: null, proofFile: null });

			expect(getText(message.components!)).not.toContain('commands/case:viewStaffNote');
			expect(flatten(message.components!).some((component) => component.type === ComponentType.MediaGallery)).toBe(false);
		});
	});

	describe('modals', () => {
		test('does not offer to send a private note to its target', () => {
			const modal = renderCaseEditModal(createContext(), createEntry({ type: TypeVariation.Note }), null, true);
			expect(getFields(modal).map((field) => field.custom_id)).not.toContain(CaseInputIds.Notify);
		});
		const getFields = (modal: { components: unknown[] }) =>
			(modal.components as { component: { custom_id: string; value?: string; default?: boolean } }[]).map((label) => label.component);

		test('GIVEN a case with no duration to edit THEN its modal asks for the reason, the note, the proof and the notice', () => {
			const modal = renderCaseEditModal(createContext(), createEntry({ id: 7, reason: 'Spam' }), 'Note', true);
			const fields = getFields(modal);

			expect(decodeCaseMenuId(modal.custom_id.split('.').slice(1))).toMatchObject({ verb: 'editSubmit', target: '7' });
			expect(fields.map((field) => field.custom_id)).toEqual([
				CaseInputIds.Reason,
				CaseInputIds.StaffNote,
				CaseInputIds.Proof,
				CaseInputIds.Notify
			]);
			expect(fields[0].value).toBe('Spam');
			expect(fields[1].value).toBe('Note');
			expect(fields[3].default).toBe(true);
		});

		test('GIVEN a case in course whose type takes a duration THEN its modal asks for it too', () => {
			const modal = renderCaseEditModal(createContext(), createEntry({ type: TypeVariation.Mute }), null, false);

			expect(getFields(modal).map((field) => field.custom_id)).toContain(CaseInputIds.Duration);
			expect(modal.components.length).toBeLessThanOrEqual(5);
		});

		test('GIVEN the modal that closes a case THEN it asks why and whether to tell the user', () => {
			const modal = renderCaseCloseModal(createContext(), createEntry({ id: 7 }), false);

			expect(decodeCaseMenuId(modal.custom_id.split('.').slice(1))).toMatchObject({ verb: 'closeSubmit', target: '7' });
			expect(getFields(modal).map((field) => field.custom_id)).toEqual([CaseInputIds.Reason, CaseInputIds.Notify]);
		});
	});

	describe('history', () => {
		test('fits long edits within the Discord message text limit', () => {
			const edits = Array.from({ length: 50 }, (_, index) => ({
				id: String(index),
				caseId: 7,
				moderatorId: ownerId,
				createdAt: 1_700_000_000_000,
				changes: ['reason', 'staffNote'].map((field) => ({
					field: field as 'reason' | 'staffNote',
					before: 'a'.repeat(1000),
					after: 'b'.repeat(1000)
				}))
			}));
			const text = getText(renderCaseHistory(t, 7, edits).components!);
			expect(text.length).toBeLessThanOrEqual(4000);
			expect(text).toContain('commands/case:historyMore');
		});
		const edit = (index: number) => ({
			id: String(index),
			caseId: 7,
			moderatorId: ownerId,
			createdAt: 1_700_000_000_000 + index,
			changes: [{ field: 'reason' as const, before: null, after: `Reason ${index}` }]
		});

		test('GIVEN the edits of a case THEN each says who made it and what it changed', () => {
			const text = getText(renderCaseHistory(t, 7, [edit(1)]).components!);

			expect(text).toContain(`<@${ownerId}>`);
			expect(text).toContain('"field":"commands/case:fieldReason","before":"commands/case:historyNone","after":"Reason 1"');
		});

		test('GIVEN more edits than the history shows THEN it says how many are left out', () => {
			const edits = Array.from({ length: CaseHistoryEntries + 3 }, (_, index) => edit(index));
			const text = getText(renderCaseHistory(t, 7, edits).components!);

			expect(text).toContain(`Reason ${CaseHistoryEntries - 1}`);
			expect(text).not.toContain(`Reason ${CaseHistoryEntries}"`);
			expect(text).toContain('commands/case:historyMore {"count":3}');
		});
	});
});
