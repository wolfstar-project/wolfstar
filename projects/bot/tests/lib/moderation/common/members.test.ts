import { fetchModerationMember } from '#lib/moderation/common/members';
import { container } from '@wolfstar/http-framework';

describe('fetchModerationMember', () => {
	const fetch = vi.fn();
	let previous: unknown;

	beforeAll(() => {
		previous = (container as any).gatewayClient;
		(container as any).gatewayClient = { members: { fetch } };
	});

	afterAll(() => {
		(container as any).gatewayClient = previous;
	});

	beforeEach(() => fetch.mockReset());

	test('GIVEN a cached member that knows its user THEN it is the one returned', async () => {
		const member = { id: '266624760782258186' };
		fetch.mockResolvedValueOnce(member);

		await expect(fetchModerationMember('1', '266624760782258186')).resolves.toBe(member);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test('GIVEN a cached member with no user, as the options of an interaction cache it THEN it is read again from the API', async () => {
		const full = { id: '266624760782258186' };
		fetch.mockResolvedValueOnce({ id: null }).mockResolvedValueOnce(full);

		await expect(fetchModerationMember('1', '266624760782258186')).resolves.toBe(full);
		expect(fetch).toHaveBeenLastCalledWith('1', '266624760782258186', { force: true });
	});
});
