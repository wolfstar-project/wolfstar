import { closeCase, editCase } from '#lib/moderation/caseEdits';
import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { guild } from '#mocks/MockInstances';
import { container } from '@wolfstar/http-framework';

const boundary = vi.hoisted(() => ({
	edit: vi.fn(),
	archive: vi.fn(),
	history: vi.fn(),
	refetch: vi.fn(),
	reportEnabled: vi.fn(async () => true)
}));
vi.mock('#utils/functions', async (original) => ({ ...(await original<typeof import('#utils/functions')>()), getModeration: async () => boundary }));
vi.mock('#lib/database', async (original) => ({
	...(await original<typeof import('#lib/database')>()),
	fetchUserReportEnabled: (...args: unknown[]) => boundary.reportEnabled(...(args as []))
}));
vi.mock('wolfstar-database', async (original) => ({
	...(await original<typeof import('wolfstar-database')>()),
	fetchModerationCaseData: async () => null,
	addModerationCaseEdit: (...args: unknown[]) => boundary.history(...args)
}));

const t = ((key: string) => key) as never;

function makeEntry(overrides: { reason?: string; type?: TypeVariation; metadata?: TypeMetadata } = {}) {
	return ModerationManagerEntry.from(guild, {
		id: 1,
		createdAt: Date.now(),
		guildId: guild.id,
		moderatorId: '266624760782258186',
		userId: '266624760782258187',
		reason: overrides.reason ?? 'Private reason',
		type: overrides.type ?? TypeVariation.Note,
		metadata: overrides.metadata ?? TypeMetadata.None,
		duration: null
	});
}

let originalPrisma: typeof container.prisma;
beforeEach(() => {
	originalPrisma = container.prisma;
	container.prisma = { orm: {} } as never;
	boundary.edit.mockReset();
	boundary.archive.mockReset();
	boundary.history.mockReset();
	boundary.refetch.mockReset();
	boundary.reportEnabled.mockReset().mockResolvedValue(true);
});
afterEach(() => {
	container.prisma = originalPrisma;
});

test.each(['edit', 'close'] as const)('never sends a private note through %s, even when notification is requested', async (action) => {
	const entry = makeEntry();
	boundary.refetch.mockResolvedValue(entry);
	const fetchUser = vi.spyOn(entry, 'fetchUser');

	const request = { entry, moderatorId: entry.moderatorId, t, notify: true };
	const result =
		action === 'edit'
			? await editCase({ ...request, values: { reason: 'Private revised reason' } })
			: await closeCase({ ...request, reason: 'Private closing reason' });

	expect(result?.changes.length).toBeGreaterThan(0);
	expect(result?.warnings).toEqual([]);
	expect(fetchUser).not.toHaveBeenCalled();
});

test('GIVEN a case another process edited since it was cached WHEN it is edited THEN the history starts from the database', async () => {
	const cached = makeEntry({ reason: 'Old reason' });
	const stored = makeEntry({ reason: 'Newer reason' });
	boundary.refetch.mockResolvedValue(stored);

	const result = await editCase({ entry: cached, moderatorId: cached.moderatorId, t, notify: false, values: { reason: 'Final reason' } });

	expect(result?.entry).toBe(stored);
	expect(boundary.edit).toHaveBeenCalledWith(stored, { reason: 'Final reason', duration: null });
	expect(boundary.history).toHaveBeenCalledWith(container.prisma, guild.id, {
		caseId: 1,
		moderatorId: cached.moderatorId,
		changes: [{ field: 'reason', before: 'Newer reason', after: 'Final reason' }]
	});
});

test.each(['edit', 'close'] as const)('GIVEN a case deleted meanwhile WHEN %s runs THEN it writes nothing', async (action) => {
	const entry = makeEntry();
	boundary.refetch.mockResolvedValue(null);

	const request = { entry, moderatorId: entry.moderatorId, t, notify: false };
	const result = action === 'edit' ? await editCase({ ...request, values: { reason: 'New' } }) : await closeCase({ ...request, reason: null });

	expect(result).toBeNull();
	expect(boundary.edit).not.toHaveBeenCalled();
	expect(boundary.archive).not.toHaveBeenCalled();
	expect(boundary.history).not.toHaveBeenCalled();
});

test('GIVEN a case another process closed since it was cached WHEN it is closed THEN nothing changes', async () => {
	const cached = makeEntry();
	boundary.refetch.mockResolvedValue(makeEntry({ metadata: TypeMetadata.Archived }));

	const result = await closeCase({ entry: cached, moderatorId: cached.moderatorId, t, notify: false, reason: null });

	expect(result?.changes).toEqual([]);
	expect(boundary.archive).not.toHaveBeenCalled();
	expect(boundary.history).not.toHaveBeenCalled();
});

test.each(['edit', 'close'] as const)(
	'GIVEN a user who turned off the moderation messages WHEN %s notifies them THEN they get none and the moderator is warned',
	async (action) => {
		const entry = makeEntry({ type: TypeVariation.Warning });
		boundary.refetch.mockResolvedValue(entry);
		boundary.reportEnabled.mockResolvedValue(false);
		const fetchUser = vi.spyOn(entry, 'fetchUser');

		const request = { entry, moderatorId: entry.moderatorId, t, notify: true };
		const result =
			action === 'edit' ? await editCase({ ...request, values: { reason: 'Revised' } }) : await closeCase({ ...request, reason: null });

		expect(result?.warnings).toEqual(['commands/case:notifyOptedOut']);
		expect(fetchUser).not.toHaveBeenCalled();
	}
);
