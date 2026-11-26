import { closeCase, editCase } from '#lib/moderation/caseEdits';
import { ModerationManagerEntry } from '#lib/moderation/managers/ModerationManagerEntry';
import { TypeMetadata, TypeVariation } from '#utils/moderationConstants';
import { guild } from '#mocks/MockInstances';
import { container } from '@wolfstar/http-framework';
const boundary = vi.hoisted(() => ({ edit: vi.fn(), archive: vi.fn(), history: vi.fn() }));
vi.mock('#utils/functions', async (original) => ({ ...(await original<typeof import('#utils/functions')>()), getModeration: async () => boundary }));
vi.mock('wolfstar-database', async (original) => ({
	...(await original<typeof import('wolfstar-database')>()),
	fetchModerationCaseData: async () => null,
	addModerationCaseEdit: (...args: unknown[]) => boundary.history(...args)
}));
const t = ((key: string) => key) as never;
test.each(['edit', 'close'] as const)('never sends a private note through %s, even when notification is requested', async (action) => {
	const entry = ModerationManagerEntry.from(guild, {
		id: 1,
		createdAt: Date.now(),
		guildId: guild.id,
		moderatorId: '266624760782258186',
		userId: '266624760782258187',
		reason: 'Private reason',
		type: TypeVariation.Note,
		metadata: TypeMetadata.None,
		duration: null
	});
	const fetchUser = vi.spyOn(entry, 'fetchUser');
	const original = container.prisma;
	container.prisma = { orm: {} } as never;
	try {
		const request = { entry, moderatorId: entry.moderatorId, t, notify: true };
		const result =
			action === 'edit'
				? await editCase({ ...request, values: { reason: 'Private revised reason' } })
				: await closeCase({ ...request, reason: 'Private closing reason' });
		expect(result.changes.length).toBeGreaterThan(0);
		expect(result.warnings).toEqual([]);
		expect(fetchUser).not.toHaveBeenCalled();
	} finally {
		container.prisma = original;
		fetchUser.mockRestore();
	}
});
