import { ModerationActionBan } from '#lib/moderation/actions/ModerationActionBan';
import { DiscordAPIError } from '@discordjs/rest';
import { container } from '@wolfstar/http-framework';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';

const guild = { id: '254360814063058944' };
const entry = { userId: '266624760782258186', reason: null };
const unknownBan = () =>
	new DiscordAPIError({ code: RESTJSONErrorCodes.UnknownBan, message: 'Unknown Ban' }, RESTJSONErrorCodes.UnknownBan, 404, 'DELETE', '', {});

describe('undoing a ban that is already gone', () => {
	const unbanUser = vi.fn();
	const complete = vi.fn(async () => undefined);
	const undoPre = (data: object) =>
		(ModerationActionBan.prototype as unknown as { handleUndoPre: (...args: unknown[]) => Promise<void> }).handleUndoPre.call(
			{ getReason: async () => 'reason', completeLastModerationEntryFromUser: complete },
			guild,
			entry,
			data
		);

	beforeEach(() => {
		vi.clearAllMocks();
		unbanUser.mockRejectedValue(unknownBan());
		Object.assign(container, { gatewayClient: { api: { guilds: { unbanUser } } } });
	});

	test('GIVEN nothing asked THEN it fails, which is how /ban remove tells who is not banned', async () => {
		await expect(undoPre({})).rejects.toBeInstanceOf(DiscordAPIError);
		expect(complete).not.toHaveBeenCalled();
	});

	test('GIVEN an undo that takes it as done THEN the case is finished all the same', async () => {
		await undoPre({ ignoreMissing: true });

		expect(complete).toHaveBeenCalledOnce();
	});

	test('GIVEN an undo that takes it as done and another failure THEN it still fails', async () => {
		unbanUser.mockRejectedValue(new Error('Missing Permissions'));

		await expect(undoPre({ ignoreMissing: true })).rejects.toThrow('Missing Permissions');
	});
});
