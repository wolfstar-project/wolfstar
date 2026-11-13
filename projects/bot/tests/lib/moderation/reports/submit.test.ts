import { readSettings } from '#lib/database';
import { getReportDenial, submitReport } from '#lib/moderation/reports/submit';
import { container } from '@wolfstar/http-framework';
import { getDefaultGuildSettings, type ReadonlyGuildData } from 'wolfstar-database';

vi.mock('#lib/database', async (original) => ({
	...(await original<typeof import('#lib/database')>()),
	readSettings: vi.fn()
}));

const guildId = '254360814063058944';
const reporterId = '266624760782258186';
const targetId = '242043489611808769';
const t = ((key: string) => key) as never;

function mockSettings(changes: Partial<ReadonlyGuildData>) {
	vi.mocked(readSettings).mockResolvedValue({ ...getDefaultGuildSettings(), id: guildId, reportsChannel: '1', ...changes } as ReadonlyGuildData);
}

describe('reports of a module that is off', () => {
	beforeEach(() => {
		container.gatewayClient = { user: { id: '1' } } as never;
	});

	test('GIVEN the reports module on THEN a member can report', async () => {
		mockSettings({ modulesReports: true });

		expect(await getReportDenial(t, guildId, reporterId, targetId)).toBeNull();
	});

	test('GIVEN the reports module off THEN a member cannot report', async () => {
		mockSettings({ modulesReports: false });

		expect(await getReportDenial(t, guildId, reporterId, targetId)).toBe('preconditions:disabledModuleReports');
	});

	test('GIVEN a form that was open when the module was turned off THEN its report is refused', async () => {
		mockSettings({ modulesReports: false });
		const subject = { targetId, targetTag: 'target', message: null };

		expect(await submitReport(t, guildId, reporterId, subject, 'reason')).toBe('preconditions:disabledModuleReports');
	});
});
