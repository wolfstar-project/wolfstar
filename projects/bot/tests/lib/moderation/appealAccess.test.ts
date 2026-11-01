import { readSettings } from '#lib/database';
import { hasAppealAccess, isAppealManager } from '#lib/moderation/appealAccess';
import { isModerator } from '#utils/functions';
import { container } from '@wolfstar/http-framework';

vi.mock('#lib/database', () => ({ readSettings: vi.fn() }));
vi.mock('#utils/functions', () => ({ isModerator: vi.fn() }));

const guildId = '254360814063058944';
const userId = '266624760782258186';

describe('who reviews the appeals', () => {
	const member = (roleIds: string[]) => ({ guildId, roleIds }) as never;
	const settings = (appealsManagerRoles: string[]) => ({ appealsManagerRoles }) as never;
	const fetchMember = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(isModerator).mockResolvedValue(false);
		vi.mocked(readSettings).mockResolvedValue(settings([]));
		Object.assign(container, { gatewayClient: { members: { fetch: fetchMember } } });
	});

	test('GIVEN no manager roles THEN a moderator reviews and a plain member does not', async () => {
		expect(await isAppealManager(member(['1']), settings([]))).toBe(false);

		vi.mocked(isModerator).mockResolvedValue(true);
		expect(await isAppealManager(member(['1']), settings([]))).toBe(true);
	});

	test('GIVEN a manager role THEN it lets a plain member in', async () => {
		expect(await isAppealManager(member(['1']), settings(['1']))).toBe(true);
	});

	test('GIVEN a manager role the member does not hold THEN they stay out', async () => {
		expect(await isAppealManager(member(['2']), settings(['1']))).toBe(false);
	});

	test('GIVEN a user who left THEN they have no access, and nothing throws', async () => {
		fetchMember.mockRejectedValue(new Error('Unknown Member'));

		expect(await hasAppealAccess(guildId, userId)).toBe(false);
	});

	test('GIVEN a member with a manager role THEN they have access', async () => {
		fetchMember.mockResolvedValue(member(['1']));
		vi.mocked(readSettings).mockResolvedValue(settings(['1']));

		expect(await hasAppealAccess(guildId, userId)).toBe(true);
	});
});
